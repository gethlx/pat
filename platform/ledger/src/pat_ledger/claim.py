from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from pat_ledger.checkout import LedgerCheckout
from pat_ledger.events import (
    append_event,
    build_event,
    format_at,
    require_task_id,
    task_snapshot,
    utc_now,
)
from pat_ledger.gitutil import run_git

SEARCH_BUCKETS = ("inbox", "claimed", "done")
GIT_NAME = "PAT Ledger"
GIT_EMAIL = "pat-ledger@users.noreply.github.com"


def find_by_source_ref(root: Path, source_ref: str) -> tuple[str, dict[str, Any], Path] | None:
    for bucket in SEARCH_BUCKETS:
        directory = root / "tasks" / bucket
        for path in sorted(directory.glob("*.json")):
            data = json.loads(path.read_text(encoding="utf-8"))
            if data.get("source_ref") == source_ref:
                return bucket, data, path
    return None


def _allocate_task_id(root: Path, now: datetime) -> str:
    prefix = f"t-{utc_now(now).strftime('%Y%m%d')}-"
    used: set[str] = set()
    for bucket in SEARCH_BUCKETS:
        for path in (root / "tasks" / bucket).glob("*.json"):
            used.add(path.stem)
    index = 1
    while f"{prefix}{index:03d}" in used:
        index += 1
    return f"{prefix}{index:03d}"


def create_and_claim(
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
) -> dict[str, Any]:
    root = ledger.path
    found = find_by_source_ref(root, source_ref)
    if found is not None:
        bucket, existing, _path = found
        if existing.get("goal") == goal and existing.get("owner") == owner:
            return {"status": "duplicate", "id": existing["id"], "bucket": bucket}
        return {"status": "review", "id": existing["id"], "bucket": bucket}

    moment = utc_now(now)
    at = format_at(moment)
    assigned_id = require_task_id(task_id or _allocate_task_id(root, moment))
    created_task = task_snapshot(
        id=assigned_id,
        source_ref=source_ref,
        goal=goal,
        owner=None,
        from_=from_,
        mode=mode,
        deadline=deadline,
        artifacts=artifacts,
        handoff=handoff,
    )
    claimed_task = task_snapshot(
        id=assigned_id,
        source_ref=source_ref,
        goal=goal,
        owner=owner,
        from_=from_,
        mode=mode,
        deadline=deadline,
        artifacts=artifacts,
        handoff=handoff,
    )
    created = build_event(
        kind="task.created",
        event_id=f"evt-{assigned_id}-created",
        at=at,
        bucket="inbox",
        task=created_task,
    )
    claimed = build_event(
        kind="task.claimed",
        event_id=f"evt-{assigned_id}-claimed",
        at=at,
        bucket="claimed",
        task=claimed_task,
    )
    event_path = append_event(root, created)
    append_event(root, claimed)
    task_path = root / "tasks" / "claimed" / f"{assigned_id}.json"
    task_path.write_text(
        json.dumps(claimed_task, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    run_git(root, "add", "--", str(event_path.relative_to(root)), str(task_path.relative_to(root)))
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
