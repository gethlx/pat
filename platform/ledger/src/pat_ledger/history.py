from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pat_ledger.events import require_task_id
from pat_ledger.gitutil import run_git


def _tasks(root: Path, ref: str) -> dict[str, dict[str, Any]]:
    tasks: dict[str, dict[str, Any]] = {}
    for entry in run_git(root, "ls-tree", "-r", "--name-only", ref, "--", "tasks").stdout.splitlines():
        parts = Path(entry).parts
        if len(parts) != 3 or parts[1] not in {"inbox", "claimed", "done"} or not entry.endswith(".json"):
            continue
        task = json.loads(run_git(root, "show", f"{ref}:{entry}").stdout)
        task_id = require_task_id(task.get("id"))
        if task_id != Path(entry).stem or task_id in tasks:
            raise ValueError(f"账本任务记录冲突：{entry}")
        tasks[task_id] = {**task, "bucket": parts[1]}
    return tasks


def read_history(root: Path) -> dict[str, Any]:
    head = run_git(root, "rev-parse", "--verify", "HEAD", check=False)
    if head.returncode:
        return {"tasks": []}
    remote = "origin/main"
    confirmed = run_git(root, "rev-parse", "--verify", remote, check=False)
    upstream = _tasks(root, remote) if confirmed.returncode == 0 else {}
    local = _tasks(root, "HEAD")
    base = run_git(root, "merge-base", "HEAD", remote, check=False)
    changed = set(local)
    if base.returncode == 0:
        changed = {
            Path(name).stem for name in
            run_git(root, "diff", "--name-only", base.stdout.strip(), "HEAD", "--", "tasks").stdout.splitlines()
            if name.endswith(".json")
        }
    rows = {task_id: {**task, "pending": False} for task_id, task in upstream.items()}
    for task_id in changed:
        if task_id in local and local[task_id] != upstream.get(task_id):
            rows[task_id] = {**local[task_id], "pending": True}
    return {"tasks": [rows[task_id] for task_id in sorted(rows, reverse=True)]}
