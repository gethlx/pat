from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from pat_ledger.checkout import LedgerCheckout, REQUIRED_DIRS
from pat_ledger.claim import create_and_claim
from pat_ledger.events import EVENT_KINDS, build_event, task_snapshot

FIXED_NOW = datetime(2026, 11, 8, 7, 15, tzinfo=timezone.utc)


def run_git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def make_git_ledger(tmp_path: Path) -> tuple[Path, Path]:
    remote = tmp_path / "remote.git"
    work = tmp_path / "ledger"
    work.mkdir()
    for relative in REQUIRED_DIRS:
        directory = work / relative
        directory.mkdir(parents=True)
        (directory / ".gitkeep").touch()
    subprocess.run(["git", "init", "--bare", "-b", "main", str(remote)], check=True)
    subprocess.run(["git", "init", "-b", "main", str(work)], check=True)
    subprocess.run(["git", "-C", str(work), "config", "user.name", "fixture"], check=True)
    subprocess.run(["git", "-C", str(work), "config", "user.email", "fixture@example.com"], check=True)
    subprocess.run(["git", "-C", str(work), "remote", "add", "origin", str(remote)], check=True)
    subprocess.run(["git", "-C", str(work), "add", "."], check=True)
    subprocess.run(["git", "-C", str(work), "commit", "-m", "skeleton"], check=True)
    subprocess.run(["git", "-C", str(work), "push", "-u", "origin", "main"], check=True)
    return work, remote


def files_in_commit(repo: Path, commit: str) -> set[str]:
    output = run_git(repo, "diff-tree", "--no-commit-id", "--name-only", "-r", commit)
    return {line for line in output.splitlines() if line}


def show_file(repo: Path, commit: str, relative: str) -> str:
    return run_git(repo, "show", f"{commit}:{relative}")


def test_four_event_envelopes_include_required_fields() -> None:
    task = task_snapshot(
        id="t-sample-1",
        source_ref="desktop:sample",
        goal="整理两条合成事实",
        owner=None,
    )
    for kind, bucket in (
        ("task.created", "inbox"),
        ("task.claimed", "claimed"),
        ("task.completed", "done"),
        ("task.released", "inbox"),
    ):
        event = build_event(
            kind=kind,
            event_id=f"evt-{kind}",
            at="2026-11-08T07:15:00Z",
            bucket=bucket,
            task=task if kind == "task.created" else {**task, "owner": "exec-a"},
        )
        assert kind in EVENT_KINDS
        assert set(event) == {"id", "at", "kind", "actor", "source", "data"}
        assert "task" in event["data"]
        assert event["data"]["bucket"] == bucket
        assert set(event["data"]["task"]) == {
            "id",
            "from",
            "source_ref",
            "goal",
            "owner",
            "mode",
            "deadline",
            "artifacts",
            "handoff",
        }


def test_create_and_claim_share_one_commit_and_can_be_read_back(tmp_path: Path) -> None:
    work, remote = make_git_ledger(tmp_path)
    with LedgerCheckout(work) as ledger:
        result = create_and_claim(
            ledger,
            source_ref="desktop:8fac74ae-65b2-43d8-b8de-56a08beec641",
            goal="把两条合成项目事实整理为 result.md",
            owner="exec-a",
            now=FIXED_NOW,
        )
    assert result["status"] == "claimed"
    commit = result["commit"]
    names = files_in_commit(work, commit)
    assert "tasks/claimed/t-20261108-001.json" in names
    assert "events/2026-11-08.jsonl" in names
    assert not any(name.startswith("tasks/inbox/") and name.endswith(".json") for name in names)

    task = json.loads(show_file(work, commit, "tasks/claimed/t-20261108-001.json"))
    assert task["source_ref"] == "desktop:8fac74ae-65b2-43d8-b8de-56a08beec641"
    assert task["owner"] == "exec-a"
    assert "bucket" not in task

    events = [
        json.loads(line)
        for line in show_file(work, commit, "events/2026-11-08.jsonl").splitlines()
        if line
    ]
    assert [event["kind"] for event in events] == ["task.created", "task.claimed"]
    assert events[0]["data"]["bucket"] == "inbox"
    assert events[0]["data"]["task"]["owner"] is None
    assert events[0]["actor"]["role"] == "user"
    assert events[1]["data"]["bucket"] == "claimed"
    assert events[1]["data"]["task"]["owner"] == "exec-a"
    assert events[1]["actor"]["role"] == "shell"

    subprocess.run(["git", "-C", str(work), "push", "origin", "main"], check=True)
    clone = tmp_path / "readback"
    subprocess.run(["git", "clone", str(remote), str(clone)], check=True)
    remote_head = run_git(clone, "rev-parse", "HEAD").strip()
    assert remote_head == commit
    assert files_in_commit(clone, remote_head) == names
    cloned_events = [
        json.loads(line)
        for line in show_file(clone, remote_head, "events/2026-11-08.jsonl").splitlines()
        if line
    ]
    assert [event["kind"] for event in cloned_events] == ["task.created", "task.claimed"]


def test_same_key_same_request_does_not_claim_twice(tmp_path: Path) -> None:
    work, _remote = make_git_ledger(tmp_path)
    kwargs = {
        "source_ref": "desktop:same-key",
        "goal": "写 result.md",
        "owner": "exec-a",
        "now": FIXED_NOW,
    }
    with LedgerCheckout(work) as ledger:
        first = create_and_claim(ledger, **kwargs)
        head_after_first = run_git(work, "rev-parse", "HEAD").strip()
        second = create_and_claim(ledger, **kwargs)
    assert first["status"] == "claimed"
    assert second == {"status": "duplicate", "id": first["id"], "bucket": "claimed"}
    assert run_git(work, "rev-parse", "HEAD").strip() == head_after_first
    claimed = list((work / "tasks" / "claimed").glob("*.json"))
    assert len(claimed) == 1


def test_same_key_changed_request_stops_for_review(tmp_path: Path) -> None:
    work, _remote = make_git_ledger(tmp_path)
    with LedgerCheckout(work) as ledger:
        first = create_and_claim(
            ledger,
            source_ref="desktop:changed-key",
            goal="写 result.md",
            owner="exec-a",
            now=FIXED_NOW,
        )
        original = (work / "tasks" / "claimed" / f"{first['id']}.json").read_text(encoding="utf-8")
        head = run_git(work, "rev-parse", "HEAD").strip()
        changed_goal = create_and_claim(
            ledger,
            source_ref="desktop:changed-key",
            goal="改成另一份说明",
            owner="exec-a",
            now=FIXED_NOW,
        )
        changed_owner = create_and_claim(
            ledger,
            source_ref="desktop:changed-key",
            goal="写 result.md",
            owner="exec-b",
            now=FIXED_NOW,
        )
    assert changed_goal["status"] == "review"
    assert changed_owner["status"] == "review"
    assert changed_goal["id"] == first["id"]
    assert run_git(work, "rev-parse", "HEAD").strip() == head
    assert (work / "tasks" / "claimed" / f"{first['id']}.json").read_text(encoding="utf-8") == original
