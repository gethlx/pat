from __future__ import annotations

import hashlib
import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

from pat_ledger.checkout import LedgerCheckout, LedgerError
from pat_ledger.claim import GIT_EMAIL, GIT_NAME
from pat_ledger.events import (
    append_event,
    build_event,
    format_at,
    iter_event_records,
    task_snapshot,
    utc_now,
)
from pat_ledger.gitutil import run_git

SEARCH_BUCKETS = ("inbox", "claimed", "done")
DEFAULT_REMOTE = "origin"
DEFAULT_BRANCH = "main"


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
    if not raw.exists() or not raw.is_file():
        raise LedgerError("产物不存在或不可读")
    if raw.is_symlink() or resolved.is_symlink():
        raise LedgerError("拒收符号链接")
    try:
        raw.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise LedgerError("产物不是可读文本") from exc
    return raw


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
    root = ledger.path
    found = load_task(root, task_id)
    if found is None:
        raise LedgerError(f"找不到任务：{task_id}")
    bucket, existing, claimed_path = found
    if bucket != "claimed":
        raise LedgerError(f"只有 claimed/ 中的任务可以完成，当前在 {bucket}/")
    if latest_task_event(root, task_id, "task.claimed") is None:
        raise LedgerError(f"缺少任务 {task_id} 的领取事件")
    source = inspect_artifact(Path(work_dir), artifact_name)
    dest = root / "artifacts" / task_id / source.name
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, dest)
    digest = hashlib.sha256(dest.read_bytes()).hexdigest()
    relative = dest.relative_to(root).as_posix()
    artifacts = [{"path": relative, "sha256": digest}]
    done_task = _snapshot_from(existing, owner=existing.get("owner"), artifacts=artifacts)
    completed = build_event(
        kind="task.completed",
        event_id=f"evt-{task_id}-completed",
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
    result = complete_task(
        ledger,
        task_id=task_id,
        work_dir=work_dir,
        artifact_name=artifact_name,
        now=now,
    )
    pushed = run_git(ledger.path, "push", remote, f"HEAD:{branch}", check=False)
    run_git(ledger.path, "fetch", remote)
    spec = f"{remote}/{branch}"
    if pushed.returncode != 0:
        detail = (pushed.stderr or pushed.stdout).strip() or f"exit {pushed.returncode}"
        return {**result, "status": "pending-sync", "error": detail}
    shown = run_git(ledger.path, "show", f"{spec}:tasks/done/{task_id}.json", check=False)
    artifact = result["artifacts"][0]
    artifact_ok = run_git(ledger.path, "show", f"{spec}:{artifact['path']}", check=False)
    latest = latest_task_event(ledger.path, task_id, "task.completed")
    if shown.returncode != 0 or artifact_ok.returncode != 0 or latest is None or latest.get("id") != result["event_id"]:
        return {**result, "status": "pending-sync"}
    return {
        **result,
        "status": "completed",
        "commit": run_git(ledger.path, "rev-parse", spec).stdout.strip(),
    }


def release_task(
    ledger: LedgerCheckout,
    *,
    task_id: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    root = ledger.path
    found = load_task(root, task_id)
    if found is None:
        raise LedgerError(f"找不到任务：{task_id}")
    bucket, existing, current_path = found
    if bucket != "claimed":
        raise LedgerError(f"只有 claimed/ 中的任务可以释放，当前在 {bucket}/")
    released_task = _snapshot_from(existing, owner=existing.get("owner"), artifacts=existing.get("artifacts") or [])
    released = build_event(
        kind="task.released",
        event_id=f"evt-{task_id}-released",
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
