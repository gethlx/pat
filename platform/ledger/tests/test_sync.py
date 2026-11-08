from __future__ import annotations

import json
import shlex
import shutil
import stat
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

from pat_ledger.checkout import LedgerCheckout, LedgerError, REQUIRED_DIRS
from pat_ledger.complete import release_task
from pat_ledger.events import iter_event_records, task_snapshot
from pat_ledger.gitutil import run_git
from pat_ledger.sync import claim_and_sync, hard_reset_to_remote

FIXED_NOW = datetime(2026, 11, 8, 8, 30, tzinfo=timezone.utc)


def run_plain_git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def make_git_ledger(tmp_path: Path) -> tuple[Path, Path]:
    remote = tmp_path / "remote.git"
    work = tmp_path / "ledger-a"
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


def clone_ledger(remote: Path, dest: Path) -> Path:
    subprocess.run(["git", "clone", str(remote), str(dest)], check=True)
    subprocess.run(["git", "-C", str(dest), "config", "user.name", "fixture"], check=True)
    subprocess.run(["git", "-C", str(dest), "config", "user.email", "fixture@example.com"], check=True)
    return dest


def seed_inbox(work: Path, *tasks: dict) -> None:
    for task in tasks:
        path = work / "tasks" / "inbox" / f"{task['id']}.json"
        path.write_text(json.dumps(task, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        subprocess.run(["git", "-C", str(work), "add", "--", str(path.relative_to(work))], check=True)
    subprocess.run(["git", "-C", str(work), "commit", "-m", "seed inbox"], check=True)
    subprocess.run(["git", "-C", str(work), "push", "origin", "main"], check=True)


def show_remote(remote: Path, relative: str) -> str:
    result = subprocess.run(
        ["git", "--git-dir", str(remote), "show", f"main:{relative}"],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def remote_claimed_events(remote: Path, task_id: str) -> list[dict]:
    listing = subprocess.run(
        ["git", "--git-dir", str(remote), "ls-tree", "-r", "--name-only", "main"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.splitlines()
    events: list[dict] = []
    for relative in listing:
        if not (relative.startswith("events/") and relative.endswith(".jsonl")):
            continue
        text = show_remote(remote, relative)
        for line in text.splitlines():
            if not line.strip():
                continue
            event = json.loads(line)
            if (
                event.get("kind") == "task.claimed"
                and event.get("data", {}).get("task", {}).get("id") == task_id
            ):
                events.append(event)
    return events


def git_commands(recorded: list[list[str]]) -> list[list[str]]:
    return [command for command in recorded if command and command[0] == "git"]


def assert_no_forbidden_git(recorded: list[list[str]]) -> None:
    for command in git_commands(recorded):
        assert "rebase" not in command
        assert "merge" not in command
        if "push" in command:
            assert "--force" not in command
            assert "-f" not in command
            assert "--force-with-lease" not in command
            assert "--force-if-includes" not in command


def record_git(monkeypatch: pytest.MonkeyPatch) -> list[list[str]]:
    recorded: list[list[str]] = []
    real = subprocess.run

    def spy(command, *args, **kwargs):
        if isinstance(command, (list, tuple)):
            recorded.append(list(command))
        return real(command, *args, **kwargs)

    monkeypatch.setattr(subprocess, "run", spy)
    return recorded


def test_fast_forward_push_then_readback_confirms_this_claim(tmp_path: Path) -> None:
    work, remote = make_git_ledger(tmp_path)
    with LedgerCheckout(work) as ledger:
        result = claim_and_sync(
            ledger,
            source_ref="desktop:ff-1",
            goal="把两条合成项目事实整理为 result.md",
            owner="exec-a",
            now=FIXED_NOW,
        )
    assert result["status"] == "claimed"
    assert result["protocol"] == "fast-forward"
    task = json.loads(show_remote(remote, f"tasks/claimed/{result['id']}.json"))
    assert task["owner"] == "exec-a"
    claimed = remote_claimed_events(remote, result["id"])
    assert claimed
    assert claimed[-1]["id"] == result["event_id"]
    clone = tmp_path / "readback"
    clone_ledger(remote, clone)
    assert run_plain_git(clone, "rev-parse", "HEAD").strip() == result["commit"]
    assert (clone / "tasks" / "claimed" / f"{result['id']}.json").is_file()


def test_competing_same_task_resets_and_uses_readback_owner(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    recorded = record_git(monkeypatch)
    work_a, remote = make_git_ledger(tmp_path)
    shared = task_snapshot(
        id="t-seed-same",
        source_ref="desktop:same-race",
        goal="写 result.md",
        owner=None,
    )
    seed_inbox(work_a, shared)
    work_b = clone_ledger(remote, tmp_path / "ledger-b")
    with LedgerCheckout(work_a) as ledger_a:
        first = claim_and_sync(
            ledger_a,
            source_ref="desktop:same-race",
            goal="写 result.md",
            owner="exec-a",
            now=FIXED_NOW,
        )
    assert first["status"] == "claimed"
    with LedgerCheckout(work_b) as ledger_b:
        second = claim_and_sync(
            ledger_b,
            source_ref="desktop:same-race",
            goal="写 result.md",
            owner="exec-b",
            now=FIXED_NOW,
        )
    assert second["status"] == "taken"
    assert second["protocol"] == "reset"
    assert second["owner"] == "exec-a"
    assert second["id"] == first["id"]
    assert run_plain_git(work_b, "rev-parse", "HEAD").strip() == first["commit"]
    assert not (work_b / "tasks" / "inbox" / "t-seed-same.json").exists()
    remote_task = json.loads(show_remote(remote, "tasks/claimed/t-seed-same.json"))
    assert remote_task["owner"] == "exec-a"
    assert len(remote_claimed_events(remote, "t-seed-same")) == 1
    assert_no_forbidden_git(recorded)
    reset_commands = [command for command in git_commands(recorded) if "reset" in command]
    assert any("--hard" in command for command in reset_commands)


def test_competing_different_tasks_reset_then_claim_remaining_inbox(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    recorded = record_git(monkeypatch)
    work_a, remote = make_git_ledger(tmp_path)
    task_a = task_snapshot(id="t-seed-a", source_ref="desktop:diff-a", goal="整理甲", owner=None)
    task_b = task_snapshot(id="t-seed-b", source_ref="desktop:diff-b", goal="整理乙", owner=None)
    seed_inbox(work_a, task_a, task_b)
    work_b = clone_ledger(remote, tmp_path / "ledger-b")
    with LedgerCheckout(work_a) as ledger_a:
        first = claim_and_sync(
            ledger_a,
            source_ref="desktop:diff-a",
            goal="整理甲",
            owner="exec-a",
            now=FIXED_NOW,
        )
    with LedgerCheckout(work_b) as ledger_b:
        second = claim_and_sync(
            ledger_b,
            source_ref="desktop:diff-b",
            goal="整理乙",
            owner="exec-b",
            now=FIXED_NOW,
        )
    assert first["status"] == "claimed"
    assert first["protocol"] == "fast-forward"
    assert second["status"] == "claimed"
    assert second["protocol"] == "reset"
    assert second["id"] == "t-seed-b"
    remote_a = json.loads(show_remote(remote, "tasks/claimed/t-seed-a.json"))
    remote_b = json.loads(show_remote(remote, "tasks/claimed/t-seed-b.json"))
    assert remote_a["owner"] == "exec-a"
    assert remote_b["owner"] == "exec-b"
    claimed_b = remote_claimed_events(remote, "t-seed-b")
    assert claimed_b[-1]["id"] == second["event_id"]
    assert not (tmp_path / "ledger-b" / "tasks" / "inbox" / "t-seed-b.json").exists()
    assert_no_forbidden_git(recorded)


def test_dirty_checkout_refuses_hard_reset(tmp_path: Path) -> None:
    work, _remote = make_git_ledger(tmp_path)
    (work / "scratch.txt").write_text("unsaved\n", encoding="utf-8")
    with pytest.raises(LedgerError, match="未保存工作"):
        hard_reset_to_remote(work)


def test_git_helper_rejects_rebase_merge_and_force_push(tmp_path: Path) -> None:
    work, _remote = make_git_ledger(tmp_path)
    with pytest.raises(LedgerError, match="rebase"):
        run_git(work, "rebase", "origin/main")
    with pytest.raises(LedgerError, match="merge"):
        run_git(work, "merge", "origin/main")
    with pytest.raises(LedgerError, match="force-push"):
        run_git(work, "push", "--force", "origin", "main")
    with pytest.raises(LedgerError, match="force-push"):
        run_git(work, "push", "-f", "origin", "main")
    with pytest.raises(LedgerError, match="force-push"):
        run_git(work, "push", "origin", "+main")
    with pytest.raises(LedgerError, match="force-push"):
        run_git(work, "push", "--force-with-lease=refs/heads/main", "origin")
    pushed = run_git(work, "push", "origin", "HEAD:main")
    assert pushed.returncode == 0


def _claim_kwargs(source_ref: str = "desktop:heal") -> dict:
    return {
        "source_ref": source_ref,
        "goal": "整理",
        "owner": "exec-a",
        "now": FIXED_NOW,
    }


def test_unpushed_claim_is_not_reported_as_duplicate(tmp_path: Path) -> None:
    work, remote = make_git_ledger(tmp_path)
    missing = tmp_path / "missing.git"
    subprocess.run(["git", "-C", str(work), "remote", "set-url", "origin", str(missing)], check=True)
    with LedgerCheckout(work) as ledger:
        with pytest.raises(LedgerError):
            claim_and_sync(ledger, **_claim_kwargs())
    subprocess.run(["git", "-C", str(work), "remote", "set-url", "origin", str(remote)], check=True)
    with LedgerCheckout(work) as ledger:
        second = claim_and_sync(ledger, **_claim_kwargs())
    assert second["status"] == "claimed"
    show_remote(remote, f"tasks/claimed/{second['id']}.json")
    claimed = [event for event in iter_event_records(work) if event["kind"] == "task.claimed"]
    assert len(claimed) == 1
    assert claimed[0]["id"] == second["event_id"]


def test_confirmed_claim_stays_duplicate(tmp_path: Path) -> None:
    work, _remote = make_git_ledger(tmp_path)
    with LedgerCheckout(work) as ledger:
        first = claim_and_sync(ledger, **_claim_kwargs("desktop:dup"))
        head = run_git(work, "rev-parse", "HEAD").stdout.strip()
        second = claim_and_sync(ledger, **_claim_kwargs("desktop:dup"))
    assert first["status"] == "claimed"
    assert second == {"status": "duplicate", "id": first["id"], "bucket": "claimed"}
    assert run_git(work, "rev-parse", "HEAD").stdout.strip() == head


def test_released_task_with_other_owner_needs_review(tmp_path: Path) -> None:
    work, _remote = make_git_ledger(tmp_path)
    with LedgerCheckout(work) as ledger:
        first = claim_and_sync(ledger, **_claim_kwargs("desktop:owner"))
        release_task(ledger, task_id=first["id"], now=FIXED_NOW)
        head = run_git(work, "rev-parse", "HEAD").stdout.strip()
        review = claim_and_sync(
            ledger,
            source_ref="desktop:owner",
            goal="整理",
            owner="exec-b",
            now=FIXED_NOW,
        )
    assert review["status"] == "review"
    assert review["id"] == first["id"]
    assert run_git(work, "rev-parse", "HEAD").stdout.strip() == head
    inbox = json.loads((work / "tasks" / "inbox" / f"{first['id']}.json").read_text(encoding="utf-8"))
    assert inbox["owner"] == "exec-a"


def test_reclaim_reuses_task_and_source_but_not_event_id(tmp_path: Path) -> None:
    work, _remote = make_git_ledger(tmp_path)
    with LedgerCheckout(work) as ledger:
        first = claim_and_sync(ledger, **_claim_kwargs("desktop:reclaim"))
        release_task(ledger, task_id=first["id"], now=FIXED_NOW)
        second = claim_and_sync(ledger, **_claim_kwargs("desktop:reclaim"))
        release_task(ledger, task_id=first["id"], now=FIXED_NOW)
    assert second["status"] == "claimed"
    assert second["id"] == first["id"]
    assert second["event_id"] != first["event_id"]
    ids = [event["id"] for event in iter_event_records(work)]
    assert len(ids) == len(set(ids))
    assert len([event_id for event_id in ids if event_id.endswith("-released") or "-released-" in event_id]) == 2


def test_claim_rejects_task_id_that_escapes_the_ledger(tmp_path: Path) -> None:
    work, _remote = make_git_ledger(tmp_path)
    head = run_plain_git(work, "rev-parse", "HEAD")
    with LedgerCheckout(work) as ledger:
        with pytest.raises(LedgerError, match="不合法"):
            claim_and_sync(
                ledger,
                source_ref="desktop:escape",
                goal="整理",
                owner="exec-a",
                task_id="../../../escaped",
                now=FIXED_NOW,
            )
    assert run_plain_git(work, "rev-parse", "HEAD") == head
    assert list(tmp_path.rglob("escaped.json")) == []


def test_optional_git_binary_is_invoked(tmp_path: Path) -> None:
    git = shutil.which("git")
    assert git
    work, _remote = make_git_ledger(tmp_path)
    log = tmp_path / "git-args.log"
    wrapper = tmp_path / "git-wrap"
    wrapper.write_text(
        "#!/bin/sh\n"
        f"echo \"$@\" >> {shlex.quote(str(log))}\n"
        f"exec {shlex.quote(git)} \"$@\"\n",
        encoding="utf-8",
    )
    wrapper.chmod(wrapper.stat().st_mode | stat.S_IEXEC)
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "pat_ledger",
            "--git",
            str(wrapper),
            "--ledger",
            str(work),
            "claim",
            "--source-ref",
            "desktop:gitwrap",
            "--goal",
            "整理",
            "--owner",
            "exec-a",
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["status"] == "claimed"
    assert log.read_text(encoding="utf-8").strip()
