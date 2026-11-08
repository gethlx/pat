from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pat_ledger.events import iter_event_records

REPLAY_KINDS = {
    "task.created": "inbox",
    "task.claimed": "claimed",
    "task.completed": "done",
    "task.released": "inbox",
}


def rebuild_from_events(root: Path) -> dict[str, Any]:
    for bucket in ("inbox", "claimed", "done"):
        folder = root / "tasks" / bucket
        if not folder.is_dir():
            continue
        for path in folder.glob("*.json"):
            path.unlink()
    states: dict[str, dict[str, Any]] = {}
    for event in iter_event_records(root):
        kind = event.get("kind")
        if kind not in REPLAY_KINDS:
            continue
        task = event.get("data", {}).get("task")
        if not isinstance(task, dict) or "id" not in task:
            continue
        bucket = event.get("data", {}).get("bucket") or REPLAY_KINDS[kind]
        states[task["id"]] = {"bucket": bucket, "task": task}
    rebuilt: list[dict[str, Any]] = []
    for task_id, state in states.items():
        dest = root / "tasks" / state["bucket"] / f"{task_id}.json"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(state["task"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        rebuilt.append(
            {
                "id": task_id,
                "bucket": state["bucket"],
                "source_ref": state["task"].get("source_ref"),
                "owner": state["task"].get("owner"),
                "artifacts": state["task"].get("artifacts") or [],
            }
        )
    return {"status": "rebuilt", "tasks": rebuilt}
