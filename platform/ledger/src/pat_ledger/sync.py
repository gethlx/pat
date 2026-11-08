from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from pat_ledger.checkout import LedgerCheckout, LedgerError
from pat_ledger.claim import GIT_EMAIL, GIT_NAME, create_and_claim, find_by_source_ref
from pat_ledger.events import append_event, build_event, format_at, task_snapshot, utc_now
from pat_ledger.gitutil import run_git

DEFAULT_REMOTE = "origin"
DEFAULT_BRANCH = "main"
MAX_SYNC_ATTEMPTS = 3


def working_tree_clean(root: Path) -> bool:
    return run_git(root, "status", "--porcelain").stdout.strip() == ""


def hard_reset_to_remote(
    root: Path,
    remote: str = DEFAULT_REMOTE,
    branch: str = DEFAULT_BRANCH,
) -> None:
    if not working_tree_clean(root):
        raise LedgerError("领取副本有未保存工作，拒绝执行 fetch + reset --hard")
    run_git(root, "fetch", remote)
    run_git(root, "reset", "--hard", f"{remote}/{branch}")


def _is_ancestor(root: Path, ancestor: str, descendant: str) -> bool:
    result = run_git(root, "merge-base", "--is-ancestor", ancestor, descendant, check=False)
    return result.returncode == 0


def _remote_file(root: Path, spec: str, relative: str) -> str | None:
    result = run_git(root, "show", f"{spec}:{relative}", check=False)
    if result.returncode != 0:
        return None
    return result.stdout


def _remote_events(root: Path, spec: str) -> list[dict[str, Any]]:
    listing = run_git(root, "ls-tree", "-r", "--name-only", spec).stdout.splitlines()
    events: list[dict[str, Any]] = []
    for relative in listing:
        if not (relative.startswith("events/") and relative.endswith(".jsonl")):
            continue
        text = _remote_file(root, spec, relative)
        if not text:
            continue
        for line in text.splitlines():
            if line.strip():
                events.append(json.loads(line))
    return events


def confirm_remote_claim(root: Path, spec: str, task_id: str, event_id: str) -> bool:
    raw = _remote_file(root, spec, f"tasks/claimed/{task_id}.json")
    if raw is None:
        return False
    claimed = [
        event
        for event in _remote_events(root, spec)
        if event.get("kind") == "task.claimed"
        and event.get("data", {}).get("task", {}).get("id") == task_id
    ]
    return bool(claimed) and claimed[-1].get("id") == event_id


def claim_from_inbox(
    ledger: LedgerCheckout,
    existing: dict[str, Any],
    inbox_path: Path,
    *,
    owner: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    root = ledger.path
    assigned_id = existing["id"]
    claimed_task = task_snapshot(
        id=assigned_id,
        source_ref=existing["source_ref"],
        goal=existing["goal"],
        owner=owner,
        from_=existing.get("from", "desktop"),
        mode=existing.get("mode", "push"),
        deadline=existing.get("deadline"),
        artifacts=existing.get("artifacts"),
        handoff=existing.get("handoff", ""),
    )
    claimed = build_event(
        kind="task.claimed",
        event_id=f"evt-{assigned_id}-claimed",
        at=format_at(utc_now(now)),
        bucket="claimed",
        task=claimed_task,
    )
    event_path = append_event(root, claimed)
    dest = root / "tasks" / "claimed" / f"{assigned_id}.json"
    dest.write_text(json.dumps(claimed_task, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    inbox_path.unlink()
    run_git(
        root,
        "add",
        "--",
        str(event_path.relative_to(root)),
        str(dest.relative_to(root)),
        str(inbox_path.relative_to(root)),
    )
    run_git(
        root,
        "-c",
        f"user.name={GIT_NAME}",
        "-c",
        f"user.email={GIT_EMAIL}",
        "commit",
        "-m",
        f"claim {assigned_id}",
    )
    commit = run_git(root, "rev-parse", "HEAD").stdout.strip()
    return {
        "status": "claimed",
        "id": assigned_id,
        "bucket": "claimed",
        "commit": commit,
        "event_id": claimed["id"],
    }


def _prepare_local_claim(
    ledger: LedgerCheckout,
    *,
    source_ref: str,
    goal: str,
    owner: str,
    after_reset: bool,
    from_: str,
    mode: str,
    deadline: str | None,
    handoff: str,
    artifacts: list[Any] | None,
    task_id: str | None,
    now: datetime | None,
) -> dict[str, Any]:
    found = find_by_source_ref(ledger.path, source_ref)
    if found is None:
        return create_and_claim(
            ledger,
            source_ref=source_ref,
            goal=goal,
            owner=owner,
            from_=from_,
            mode=mode,
            deadline=deadline,
            handoff=handoff,
            artifacts=artifacts,
            task_id=task_id,
            now=now,
        )
    bucket, existing, path = found
    if bucket == "inbox":
        if existing.get("goal") != goal:
            return {"status": "review", "id": existing["id"], "bucket": bucket}
        return claim_from_inbox(ledger, existing, path, owner=owner, now=now)
    if existing.get("goal") == goal and existing.get("owner") == owner:
        return {"status": "duplicate", "id": existing["id"], "bucket": bucket}
    if after_reset and existing.get("goal") == goal:
        return {
            "status": "taken",
            "id": existing["id"],
            "bucket": bucket,
            "owner": existing.get("owner"),
        }
    return {"status": "review", "id": existing["id"], "bucket": bucket}


def _push_and_classify(
    root: Path,
    remote: str,
    branch: str,
) -> str:
    pushed = run_git(root, "push", remote, f"HEAD:{branch}", check=False)
    run_git(root, "fetch", remote)
    local = run_git(root, "rev-parse", "HEAD").stdout.strip()
    upstream = f"{remote}/{branch}"
    if _is_ancestor(root, local, upstream):
        return "landed"
    if pushed.returncode == 0:
        return "landed"
    if _is_ancestor(root, upstream, local):
        detail = (pushed.stderr or pushed.stdout).strip() or f"exit {pushed.returncode}"
        raise LedgerError(f"git push 失败：{detail}")
    return "diverged"


def claim_and_sync(
    ledger: LedgerCheckout,
    *,
    source_ref: str,
    goal: str,
    owner: str,
    from_: str = "desktop",
    mode: str = "push",
    deadline: str | None = None,
    handoff: str = "",
    artifacts: list[Any] | None = None,
    task_id: str | None = None,
    now: datetime | None = None,
    remote: str = DEFAULT_REMOTE,
    branch: str = DEFAULT_BRANCH,
) -> dict[str, Any]:
    after_reset = False
    protocol = "fast-forward"
    last_error: str | None = None
    for _attempt in range(MAX_SYNC_ATTEMPTS):
        result = _prepare_local_claim(
            ledger,
            source_ref=source_ref,
            goal=goal,
            owner=owner,
            after_reset=after_reset,
            from_=from_,
            mode=mode,
            deadline=deadline,
            handoff=handoff,
            artifacts=artifacts,
            task_id=task_id,
            now=now,
        )
        if result["status"] != "claimed":
            if after_reset:
                result = {**result, "protocol": "reset"}
            return result
        outcome = _push_and_classify(ledger.path, remote, branch)
        spec = f"{remote}/{branch}"
        if outcome == "landed":
            event_id = result["event_id"]
            if not confirm_remote_claim(ledger.path, spec, result["id"], event_id):
                return {
                    "status": "lost",
                    "id": result["id"],
                    "bucket": "claimed",
                    "event_id": event_id,
                    "protocol": protocol,
                }
            remote_head = run_git(ledger.path, "rev-parse", spec).stdout.strip()
            return {
                **result,
                "status": "claimed",
                "commit": remote_head,
                "event_id": event_id,
                "protocol": protocol,
            }
        protocol = "reset"
        hard_reset_to_remote(ledger.path, remote, branch)
        after_reset = True
        last_error = "non-fast-forward"
    found = find_by_source_ref(ledger.path, source_ref)
    if found is not None:
        bucket, existing, _path = found
        return {
            "status": "taken" if bucket != "inbox" else "review",
            "id": existing["id"],
            "bucket": bucket,
            "owner": existing.get("owner"),
            "protocol": "reset",
        }
    raise LedgerError(f"领取同步重试次数已用尽：{last_error}")
