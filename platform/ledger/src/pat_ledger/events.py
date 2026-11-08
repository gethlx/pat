from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pat_ledger.checkout import LedgerError

EVENT_KINDS = (
    "task.created",
    "task.claimed",
    "task.completed",
    "task.released",
)

TASK_FIELDS = (
    "id",
    "from",
    "source_ref",
    "goal",
    "owner",
    "mode",
    "deadline",
    "artifacts",
    "handoff",
)

ACTORS = {
    "task.created": {"role": "user", "instance": "local-user"},
    "task.claimed": {"role": "shell", "instance": "pat-ledger"},
    "task.completed": {"role": "shell", "instance": "pat-ledger"},
    "task.released": {"role": "shell", "instance": "pat-ledger"},
}


def utc_now(now: datetime | None = None) -> datetime:
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        return current.replace(tzinfo=timezone.utc)
    return current.astimezone(timezone.utc)


def format_at(now: datetime) -> str:
    return utc_now(now).strftime("%Y-%m-%dT%H:%M:%SZ")


def task_snapshot(
    *,
    id: str,
    source_ref: str,
    goal: str,
    owner: str | None,
    from_: str = "desktop",
    mode: str = "push",
    deadline: str | None = None,
    artifacts: list[Any] | None = None,
    handoff: str = "",
) -> dict[str, Any]:
    return {
        "id": id,
        "from": from_,
        "source_ref": source_ref,
        "goal": goal,
        "owner": owner,
        "mode": mode,
        "deadline": deadline,
        "artifacts": list(artifacts) if artifacts is not None else [],
        "handoff": handoff,
    }


def build_event(
    *,
    kind: str,
    event_id: str,
    at: str,
    bucket: str,
    task: dict[str, Any],
    actor: dict[str, Any] | None = None,
    source: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if kind not in EVENT_KINDS:
        raise LedgerError(f"不支持的事件种类：{kind}")
    missing = [field for field in TASK_FIELDS if field not in task]
    if missing:
        raise LedgerError("任务快照缺少字段：" + "、".join(missing))
    payload = {field: task[field] for field in TASK_FIELDS}
    return {
        "id": event_id,
        "at": at,
        "kind": kind,
        "actor": dict(actor or ACTORS[kind]),
        "source": source
        or {
            "channel": payload["from"],
            "instance": "local",
            "event_id": payload["source_ref"],
            "ref": f"event:{event_id}#data.task.goal",
        },
        "data": {"bucket": bucket, "task": payload},
    }


def append_event(root: Path, event: dict[str, Any]) -> Path:
    required = ("id", "at", "kind", "actor", "source", "data")
    missing = [field for field in required if field not in event]
    if missing:
        raise LedgerError("事件信封缺少字段：" + "、".join(missing))
    event_id = event["id"]
    if any(record.get("id") == event_id for record in iter_event_records(root)):
        raise LedgerError(f"事件编号已存在：{event_id}")
    at = utc_now(datetime.fromisoformat(event["at"].replace("Z", "+00:00")))
    path = root / "events" / f"{at.strftime('%Y-%m-%d')}.jsonl"
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=False) + "\n")
    return path


def iter_event_records(root: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    events_dir = root / "events"
    if not events_dir.is_dir():
        return records
    for path in sorted(events_dir.glob("*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                records.append(json.loads(line))
    return records


_TASK_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
ALLOWED_BUCKETS = frozenset({"inbox", "claimed", "done"})


def require_task_id(task_id: object) -> str:
    if (
        not isinstance(task_id, str)
        or ".." in task_id
        or _TASK_ID.fullmatch(task_id) is None
    ):
        raise LedgerError(f"任务编号不合法：{task_id}")
    return task_id


def fresh_event_id(root: Path, base: str) -> str:
    used = {event.get("id") for event in iter_event_records(root)}
    if base not in used:
        return base
    number = 2
    while f"{base}-{number}" in used:
        number += 1
    return f"{base}-{number}"
