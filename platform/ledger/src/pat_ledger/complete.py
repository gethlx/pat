from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any

from pat_ledger.checkout import LedgerCheckout, LedgerError
from pat_ledger.claim import GIT_EMAIL, GIT_NAME
from pat_ledger.events import (
    append_event,
    build_event,
    format_at,
    fresh_event_id,
    iter_event_records,
    require_task_id,
    task_snapshot,
    utc_now,
)
from pat_ledger.gitutil import require_clean, require_publishable, run_git

SEARCH_BUCKETS = ("inbox", "claimed", "done")
DEFAULT_REMOTE = "origin"
DEFAULT_BRANCH = "main"
_SECRET_NAMES = frozenset(
    {
        ".env",
        "id_rsa",
        "id_dsa",
        "id_ecdsa",
        "id_ed25519",
        ".npmrc",
        ".pypirc",
        ".netrc",
        "credentials.json",
        "secrets.json",
    }
)
_SECRET_SUFFIXES = (".pem", ".key", ".p12", ".pfx")
_SECRET_MESSAGE = "拒绝把明显密钥文件当产物提交"


def load_task(root: Path, task_id: str) -> tuple[str, dict[str, Any], Path] | None:
    for bucket in SEARCH_BUCKETS:
        path = root / "tasks" / bucket / f"{task_id}.json"
        if path.is_file():
            return bucket, json.loads(path.read_text(encoding="utf-8")), path
    return None


def latest_task_event(root: Path, task_id: str, kind: str) -> dict[str, Any] | None:
    matches = [
        event
        for event in iter_event_records(root)
        if event.get("kind") == kind
        and event.get("data", {}).get("task", {}).get("id") == task_id
    ]
    return matches[-1] if matches else None


def _is_secret_name(name: str) -> bool:
    base = Path(name).name
    if base in _SECRET_NAMES or base.startswith(".env."):
        return True
    return base.lower().endswith(_SECRET_SUFFIXES)


def inspect_artifact(work_dir: Path, name: str) -> Path:
    if not name or Path(name).is_absolute():
        raise LedgerError("产物路径越界")
    work = work_dir.resolve()
    relative = Path(name)
    if relative.is_absolute():
        raise LedgerError("产物路径越界")
    raw = work / relative
    probe = work
    for part in relative.parts:
        probe = probe / part
        if probe.is_symlink():
            raise LedgerError("拒收符号链接")
    resolved = raw.resolve()
    if not resolved.is_relative_to(work):
        raise LedgerError("产物路径越界")
    if _is_secret_name(name):
        raise LedgerError(_SECRET_MESSAGE)
    if not raw.exists() or not raw.is_file():
        raise LedgerError("产物不存在或不可读")
    if raw.is_symlink() or resolved.is_symlink():
        raise LedgerError("拒收符号链接")
    try:
        text = raw.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise LedgerError("产物不是可读文本") from exc
    if "-----BEGIN " in text and "PRIVATE KEY-----" in text:
        raise LedgerError(_SECRET_MESSAGE)
    return raw


def _ensure_separate_workdir(root: Path, work_dir: Path) -> None:
    if work_dir.is_symlink():
        raise LedgerError("执行工作目录必须与账本 checkout 分开")
    if not work_dir.exists() or not work_dir.is_dir():
        raise LedgerError("执行工作目录不存在")
    resolved_work = work_dir.resolve()
    resolved_root = root.resolve()
    if (
        resolved_work == resolved_root
        or resolved_work.is_relative_to(resolved_root)
        or resolved_root.is_relative_to(resolved_work)
    ):
        raise LedgerError("执行工作目录必须与账本 checkout 分开")


def _snapshot_from(existing: dict[str, Any], *, owner: str | None, artifacts: list[Any] | None) -> dict[str, Any]:
    return task_snapshot(
        id=existing["id"],
        source_ref=existing["source_ref"],
        goal=existing["goal"],
        owner=owner,
        from_=existing.get("from", "desktop"),
        mode=existing.get("mode", "push"),
        deadline=existing.get("deadline"),
        artifacts=artifacts if artifacts is not None else existing.get("artifacts"),
        handoff=existing.get("handoff", ""),
    )


def _commit(root: Path, message: str, *paths: Path) -> str:
    run_git(root, "add", "--", *[str(path.relative_to(root)) for path in paths])
    run_git(
        root,
        "-c",
        f"user.name={GIT_NAME}",
        "-c",
        f"user.email={GIT_EMAIL}",
        "commit",
        "-m",
        message,
        "--only", "--", *[str(path.relative_to(root)) for path in paths],
    )
    return run_git(root, "rev-parse", "HEAD").stdout.strip()


def complete_task(
    ledger: LedgerCheckout,
    *,
    task_id: str,
    work_dir: str | Path,
    artifact_name: str = "result.md",
    now: datetime | None = None,
) -> dict[str, Any]:
    task_id = require_task_id(task_id)
    root = ledger.path
    require_clean(root)
    found = load_task(root, task_id)
    if found is None:
        raise LedgerError(f"找不到任务：{task_id}")
    bucket, existing, claimed_path = found
    if bucket != "claimed":
        raise LedgerError(f"只有 claimed/ 中的任务可以完成，当前在 {bucket}/")
    if latest_task_event(root, task_id, "task.claimed") is None:
        raise LedgerError(f"缺少任务 {task_id} 的领取事件")
    _ensure_separate_workdir(root, Path(work_dir))
    source = inspect_artifact(Path(work_dir), artifact_name)
    dest = root / "artifacts" / task_id / source.name
    if dest.resolve() != dest or dest.exists():
        raise LedgerError("账本产物路径已占用或不是普通路径，请核对")
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, dest)
    digest = hashlib.sha256(dest.read_bytes()).hexdigest()
    relative = dest.relative_to(root).as_posix()
    artifacts = [{"path": relative, "sha256": digest}]
    done_task = _snapshot_from(existing, owner=existing.get("owner"), artifacts=artifacts)
    completed = build_event(
        kind="task.completed",
        event_id=fresh_event_id(root, f"evt-{task_id}-completed"),
        at=format_at(utc_now(now)),
        bucket="done",
        task=done_task,
    )
    event_path = append_event(root, completed)
    done_path = root / "tasks" / "done" / f"{task_id}.json"
    done_path.write_text(json.dumps(done_task, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    claimed_path.unlink()
    commit = _commit(root, f"complete {task_id}", event_path, done_path, claimed_path, dest)
    return {
        "status": "recorded",
        "id": task_id,
        "bucket": "done",
        "commit": commit,
        "event_id": completed["id"],
        "artifacts": artifacts,
    }


def _git_detail(result: subprocess.CompletedProcess[str]) -> str:
    return (result.stderr or result.stdout).strip() or f"exit {result.returncode}"


def _pending(result: dict[str, Any], error: str) -> dict[str, Any]:
    return {**result, "status": "pending-sync", "error": error}


def _remote_events(root: Path, spec: str) -> list[dict[str, Any]]:
    listing = run_git(root, "ls-tree", "-r", "--name-only", spec, check=False)
    if listing.returncode != 0:
        return []
    events: list[dict[str, Any]] = []
    for relative in listing.stdout.splitlines():
        if not (relative.startswith("events/") and relative.endswith(".jsonl")):
            continue
        shown = run_git(root, "show", f"{spec}:{relative}", check=False)
        if shown.returncode != 0:
            continue
        for line in shown.stdout.splitlines():
            if line.strip():
                events.append(json.loads(line))
    return events


def _latest_remote_event(root: Path, spec: str, task_id: str, kind: str) -> dict[str, Any] | None:
    matches = [
        event
        for event in _remote_events(root, spec)
        if event.get("kind") == kind and event.get("data", {}).get("task", {}).get("id") == task_id
    ]
    return matches[-1] if matches else None


def _publish_completion(
    ledger: LedgerCheckout,
    result: dict[str, Any],
    remote: str,
    branch: str,
) -> dict[str, Any]:
    root = ledger.path
    pushed = run_git(root, "push", remote, f"HEAD:{branch}", check=False)
    fetched = run_git(root, "fetch", remote, check=False)
    if pushed.returncode != 0:
        return _pending(result, _git_detail(pushed))
    if fetched.returncode != 0:
        return _pending(result, _git_detail(fetched))
    spec = f"{remote}/{branch}"
    artifacts = result.get("artifacts") or []
    if not artifacts:
        return _pending(result, "远端尚未确认完成")
    artifact = artifacts[0]
    shown = run_git(root, "show", f"{spec}:tasks/done/{result['id']}.json", check=False)
    relative = artifact["path"]
    remote_blob = run_git(root, "rev-parse", "--verify", f"{spec}:{relative}", check=False)
    local_blob = run_git(root, "rev-parse", "--verify", f"HEAD:{relative}", check=False)
    latest = _latest_remote_event(root, spec, result["id"], "task.completed")
    if (
        shown.returncode != 0
        or remote_blob.returncode != 0
        or local_blob.returncode != 0
        or remote_blob.stdout != local_blob.stdout
        or latest is None
        or latest.get("id") != result["event_id"]
    ):
        return _pending(result, "远端尚未确认完成")
    return {
        **result,
        "status": "completed",
        "commit": run_git(root, "rev-parse", spec).stdout.strip(),
    }


def complete_and_sync(
    ledger: LedgerCheckout,
    *,
    task_id: str,
    work_dir: str | Path,
    artifact_name: str = "result.md",
    now: datetime | None = None,
    remote: str = DEFAULT_REMOTE,
    branch: str = DEFAULT_BRANCH,
) -> dict[str, Any]:
    task_id = require_task_id(task_id)
    root = ledger.path
    require_clean(root)
    found = load_task(root, task_id)
    retry = f"complete {task_id}" if found is not None and found[0] == "done" else None
    require_publishable(root, remote, branch, retry_message=retry)
    if retry is not None:
        latest = latest_task_event(root, task_id, "task.completed")
        if latest is None:
            raise LedgerError(f"缺少任务 {task_id} 的完成事件")
        artifacts = (
            latest.get("data", {}).get("task", {}).get("artifacts")
            or found[1].get("artifacts")
            or []
        )
        result = {
            "status": "recorded",
            "id": task_id,
            "bucket": "done",
            "commit": run_git(root, "rev-parse", "HEAD").stdout.strip(),
            "event_id": latest["id"],
            "artifacts": artifacts,
        }
        return _publish_completion(ledger, result, remote, branch)
    result = complete_task(
        ledger,
        task_id=task_id,
        work_dir=work_dir,
        artifact_name=artifact_name,
        now=now,
    )
    return _publish_completion(ledger, result, remote, branch)


def release_task(
    ledger: LedgerCheckout,
    *,
    task_id: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    task_id = require_task_id(task_id)
    root = ledger.path
    require_clean(root)
    found = load_task(root, task_id)
    if found is None:
        raise LedgerError(f"找不到任务：{task_id}")
    bucket, existing, current_path = found
    if bucket != "claimed":
        raise LedgerError(f"只有 claimed/ 中的任务可以释放，当前在 {bucket}/")
    released_task = _snapshot_from(existing, owner=existing.get("owner"), artifacts=existing.get("artifacts") or [])
    released = build_event(
        kind="task.released",
        event_id=fresh_event_id(root, f"evt-{task_id}-released"),
        at=format_at(utc_now(now)),
        bucket="inbox",
        task=released_task,
    )
    event_path = append_event(root, released)
    inbox_path = root / "tasks" / "inbox" / f"{task_id}.json"
    inbox_path.write_text(json.dumps(released_task, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    current_path.unlink()
    commit = _commit(root, f"release {task_id}", event_path, inbox_path, current_path)
    return {
        "status": "released",
        "id": task_id,
        "bucket": "inbox",
        "commit": commit,
        "event_id": released["id"],
        "source_ref": released_task["source_ref"],
    }


def release_and_sync(
    ledger: LedgerCheckout,
    *,
    task_id: str,
    now: datetime | None = None,
    remote: str = DEFAULT_REMOTE,
    branch: str = DEFAULT_BRANCH,
) -> dict[str, Any]:
    task_id = require_task_id(task_id)
    root = ledger.path
    require_clean(root)
    found = load_task(root, task_id)
    if found is None:
        raise LedgerError(f"找不到任务：{task_id}")
    bucket, existing, _current_path = found
    latest = latest_task_event(root, task_id, "task.released")
    retry = f"release {task_id}" if bucket == "inbox" and latest is not None else None
    require_publishable(root, remote, branch, retry_message=retry)
    if retry is not None:
        result = {
            "status": "released",
            "id": task_id,
            "bucket": "inbox",
            "commit": run_git(root, "rev-parse", "HEAD").stdout.strip(),
            "event_id": latest["id"],
            "source_ref": existing.get("source_ref"),
        }
    else:
        result = release_task(ledger, task_id=task_id, now=now)
    pushed = run_git(root, "push", remote, f"HEAD:{branch}", check=False)
    fetched = run_git(root, "fetch", remote, check=False)
    if pushed.returncode != 0:
        return _pending(result, _git_detail(pushed))
    if fetched.returncode != 0:
        return _pending(result, _git_detail(fetched))
    spec = f"{remote}/{branch}"
    inbox = run_git(root, "show", f"{spec}:tasks/inbox/{task_id}.json", check=False)
    claimed = run_git(root, "show", f"{spec}:tasks/claimed/{task_id}.json", check=False)
    remote_event = _latest_remote_event(root, spec, task_id, "task.released")
    if (
        inbox.returncode != 0
        or claimed.returncode == 0
        or remote_event is None
        or remote_event.get("id") != result["event_id"]
    ):
        return _pending(result, "远端尚未确认释放")
    return {
        **result,
        "status": "released",
        "commit": run_git(root, "rev-parse", spec).stdout.strip(),
    }
