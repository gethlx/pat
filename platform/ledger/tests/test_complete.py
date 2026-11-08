from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

from pat_ledger.checkout import LedgerCheckout, LedgerError, REQUIRED_DIRS
from pat_ledger.complete import complete_and_sync, complete_task, release_and_sync, release_task
from pat_ledger.rebuild import rebuild_from_events
from pat_ledger.sync import claim_and_sync

FIXED_NOW = datetime(2026, 11, 8, 9, 45, tzinfo=timezone.utc)


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
    output = run_plain_git(repo, "diff-tree", "--no-commit-id", "--name-only", "-r", commit)
    return {line for line in output.splitlines() if line}


def show_file(repo: Path, commit: str, relative: str) -> str:
    return run_plain_git(repo, "show", f"{commit}:{relative}")


def show_remote(remote: Path, relative: str) -> str:
    result = subprocess.run(
        ["git", "--git-dir", str(remote), "show", f"main:{relative}"],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def run_fake_executor(workdir: Path, *extra: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "pat_ledger.fake_executor", str(workdir), *extra],
        check=False,
        capture_output=True,
        text=True,
    )


def claim_sample(ledger: LedgerCheckout, source_ref: str = "desktop:a5-1") -> dict:
    return claim_and_sync(
        ledger,
        source_ref=source_ref,
        goal="把两条合成项目事实整理为 result.md",
        owner="exec-a",
        now=FIXED_NOW,
    )


def test_fake_executor_writes_result_md_and_exits_0(tmp_path: Path) -> None:
    workdir = tmp_path / "work"
    completed = run_fake_executor(workdir)
    assert completed.returncode == 0
    assert (workdir / "result.md").read_text(encoding="utf-8")


def test_complete_same_commit_records_event_done_and_artifact(tmp_path: Path) -> None:
    ledger_path, _remote = make_git_ledger(tmp_path)
    workdir = tmp_path / "work"
    with LedgerCheckout(ledger_path) as ledger:
        claimed = claim_sample(ledger)
        assert run_fake_executor(workdir).returncode == 0
        result = complete_task(
            ledger,
            task_id=claimed["id"],
            work_dir=workdir,
            now=FIXED_NOW,
        )
    assert result["status"] == "recorded"
    names = files_in_commit(ledger_path, result["commit"])
    assert f"tasks/done/{claimed['id']}.json" in names
    assert f"tasks/claimed/{claimed['id']}.json" in names
    assert f"artifacts/{claimed['id']}/result.md" in names
    assert "events/2026-11-08.jsonl" in names
    body = (workdir / "result.md").read_bytes()
    digest = hashlib.sha256(body).hexdigest()
    task = json.loads(show_file(ledger_path, result["commit"], f"tasks/done/{claimed['id']}.json"))
    assert task["artifacts"] == [{"path": f"artifacts/{claimed['id']}/result.md", "sha256": digest}]
    stored = show_file(ledger_path, result["commit"], f"artifacts/{claimed['id']}/result.md")
    assert stored.encode("utf-8") == body
    events = [
        json.loads(line)
        for line in show_file(ledger_path, result["commit"], "events/2026-11-08.jsonl").splitlines()
        if line
    ]
    completed = [event for event in events if event["kind"] == "task.completed"]
    assert completed[-1]["id"] == result["event_id"]
    assert completed[-1]["data"]["bucket"] == "done"
    assert completed[-1]["data"]["task"]["artifacts"] == task["artifacts"]
    assert not (ledger_path / "tasks" / "claimed" / f"{claimed['id']}.json").exists()


def test_create_claim_complete_can_be_read_back_from_same_ledger(tmp_path: Path) -> None:
    ledger_path, remote = make_git_ledger(tmp_path)
    workdir = tmp_path / "work"
    with LedgerCheckout(ledger_path) as ledger:
        claimed = claim_sample(ledger, "desktop:a5-readback")
        assert run_fake_executor(workdir).returncode == 0
        completed = complete_and_sync(
            ledger,
            task_id=claimed["id"],
            work_dir=workdir,
            now=FIXED_NOW,
        )
    assert claimed["status"] == "claimed"
    assert completed["status"] == "completed"
    remote_task = json.loads(show_remote(remote, f"tasks/done/{claimed['id']}.json"))
    assert remote_task["source_ref"] == "desktop:a5-readback"
    assert remote_task["owner"] == "exec-a"
    assert remote_task["artifacts"][0]["path"] == f"artifacts/{claimed['id']}/result.md"
    assert len(remote_task["artifacts"][0]["sha256"]) == 64
    clone = tmp_path / "readback"
    subprocess.run(["git", "clone", str(remote), str(clone)], check=True)
    cloned = json.loads((clone / "tasks" / "done" / f"{claimed['id']}.json").read_text(encoding="utf-8"))
    assert cloned == remote_task
    kinds = [
        json.loads(line)["kind"]
        for line in (clone / "events" / "2026-11-08.jsonl").read_text(encoding="utf-8").splitlines()
        if line
    ]
    assert kinds == ["task.created", "task.claimed", "task.completed"]


def test_release_writes_event_and_returns_to_inbox_with_same_source_ref(tmp_path: Path) -> None:
    ledger_path, _remote = make_git_ledger(tmp_path)
    with LedgerCheckout(ledger_path) as ledger:
        claimed = claim_sample(ledger, "desktop:a5-release")
        released = release_task(ledger, task_id=claimed["id"], now=FIXED_NOW)
    assert released["status"] == "released"
    assert released["source_ref"] == "desktop:a5-release"
    assert released["bucket"] == "inbox"
    names = files_in_commit(ledger_path, released["commit"])
    assert f"tasks/inbox/{claimed['id']}.json" in names
    assert f"tasks/claimed/{claimed['id']}.json" in names
    task = json.loads(show_file(ledger_path, released["commit"], f"tasks/inbox/{claimed['id']}.json"))
    assert task["source_ref"] == "desktop:a5-release"
    events = [
        json.loads(line)
        for line in show_file(ledger_path, released["commit"], "events/2026-11-08.jsonl").splitlines()
        if line
    ]
    assert events[-1]["kind"] == "task.released"
    assert events[-1]["data"]["bucket"] == "inbox"
    assert events[-1]["data"]["task"]["source_ref"] == "desktop:a5-release"
    assert not (ledger_path / "tasks" / "claimed" / f"{claimed['id']}.json").exists()
    assert (ledger_path / "tasks" / "inbox" / f"{claimed['id']}.json").is_file()


def test_rebuild_ignores_cloned_tasks_and_matches_remote(tmp_path: Path) -> None:
    ledger_path, remote = make_git_ledger(tmp_path)
    workdir = tmp_path / "work"
    with LedgerCheckout(ledger_path) as ledger:
        claimed = claim_sample(ledger, "desktop:a5-rebuild")
        assert run_fake_executor(workdir).returncode == 0
        completed = complete_and_sync(
            ledger,
            task_id=claimed["id"],
            work_dir=workdir,
            now=FIXED_NOW,
        )
    assert completed["status"] == "completed"
    clone = tmp_path / "rebuild-clone"
    subprocess.run(["git", "clone", str(remote), str(clone)], check=True)
    remote_task = json.loads(show_remote(remote, f"tasks/done/{claimed['id']}.json"))
    for bucket in ("inbox", "claimed", "done"):
        for path in (clone / "tasks" / bucket).glob("*.json"):
            path.write_text('{"id":"tampered"}\n', encoding="utf-8")
    rebuilt = rebuild_from_events(clone)
    assert rebuilt["status"] == "rebuilt"
    match = next(item for item in rebuilt["tasks"] if item["id"] == claimed["id"])
    restored = json.loads((clone / "tasks" / "done" / f"{claimed['id']}.json").read_text(encoding="utf-8"))
    assert match["bucket"] == "done"
    assert match["source_ref"] == remote_task["source_ref"]
    assert match["owner"] == remote_task["owner"]
    assert match["artifacts"] == remote_task["artifacts"]
    assert restored["id"] == remote_task["id"]
    assert restored["source_ref"] == remote_task["source_ref"]
    assert restored["owner"] == remote_task["owner"]
    assert restored["artifacts"] == remote_task["artifacts"]
    stored = (clone / remote_task["artifacts"][0]["path"]).read_bytes()
    assert hashlib.sha256(stored).hexdigest() == remote_task["artifacts"][0]["sha256"]


def test_complete_rejects_escaped_path_and_does_not_report_completed(tmp_path: Path) -> None:
    ledger_path, _remote = make_git_ledger(tmp_path)
    workdir = tmp_path / "work"
    workdir.mkdir()
    outside = tmp_path / "outside.md"
    outside.write_text("secret\n", encoding="utf-8")
    with LedgerCheckout(ledger_path) as ledger:
        claimed = claim_sample(ledger, "desktop:a5-escape")
        head = run_plain_git(ledger_path, "rev-parse", "HEAD").strip()
        with pytest.raises(LedgerError, match="越界"):
            complete_task(
                ledger,
                task_id=claimed["id"],
                work_dir=workdir,
                artifact_name="../outside.md",
                now=FIXED_NOW,
            )
    assert run_plain_git(ledger_path, "rev-parse", "HEAD").strip() == head
    assert (ledger_path / "tasks" / "claimed" / f"{claimed['id']}.json").is_file()
    assert not (ledger_path / "tasks" / "done" / f"{claimed['id']}.json").exists()


def test_complete_rejects_symlink_and_does_not_report_completed(tmp_path: Path) -> None:
    ledger_path, _remote = make_git_ledger(tmp_path)
    workdir = tmp_path / "work"
    workdir.mkdir()
    target = workdir / "real.md"
    target.write_text("ok\n", encoding="utf-8")
    (workdir / "result.md").symlink_to(target)
    with LedgerCheckout(ledger_path) as ledger:
        claimed = claim_sample(ledger, "desktop:a5-symlink")
        head = run_plain_git(ledger_path, "rev-parse", "HEAD").strip()
        with pytest.raises(LedgerError, match="符号链接"):
            complete_and_sync(
                ledger,
                task_id=claimed["id"],
                work_dir=workdir,
                now=FIXED_NOW,
            )
    assert run_plain_git(ledger_path, "rev-parse", "HEAD").strip() == head
    assert (ledger_path / "tasks" / "claimed" / f"{claimed['id']}.json").is_file()
    assert not (ledger_path / "tasks" / "done" / f"{claimed['id']}.json").exists()


def _completed_events(repo: Path) -> list[dict]:
    path = repo / "events" / "2026-11-08.jsonl"
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line and json.loads(line)["kind"] == "task.completed"
    ]


def test_obvious_secret_artifacts_are_rejected(tmp_path: Path) -> None:
    ledger_path, _remote = make_git_ledger(tmp_path)
    workdir = tmp_path / "work"
    workdir.mkdir()
    (workdir / "id_rsa").write_bytes(b"\x00\x01not-text")
    (workdir / "result.md").write_text(
        "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----\n",
        encoding="utf-8",
    )
    plain = tmp_path / "plain"
    plain.mkdir()
    (plain / "result.md").write_text("secret\n", encoding="utf-8")
    with LedgerCheckout(ledger_path) as ledger:
        claimed = claim_sample(ledger, "desktop:a5-secret")
        with pytest.raises(LedgerError, match="密钥"):
            complete_task(
                ledger,
                task_id=claimed["id"],
                work_dir=workdir,
                artifact_name="id_rsa",
                now=FIXED_NOW,
            )
        with pytest.raises(LedgerError, match="密钥"):
            complete_task(
                ledger,
                task_id=claimed["id"],
                work_dir=workdir,
                artifact_name="result.md",
                now=FIXED_NOW,
            )
        recorded = complete_task(
            ledger,
            task_id=claimed["id"],
            work_dir=plain,
            now=FIXED_NOW,
        )
    assert recorded["status"] == "recorded"


def test_workdir_must_stay_outside_the_ledger(tmp_path: Path) -> None:
    ledger_path, _remote = make_git_ledger(tmp_path)
    nested = ledger_path / "nested-work"
    nested.mkdir()
    (nested / "result.md").write_text("nested\n", encoding="utf-8")
    (ledger_path / "result.md").write_text("root\n", encoding="utf-8")
    real = tmp_path / "real-work"
    real.mkdir()
    (real / "result.md").write_text("ok\n", encoding="utf-8")
    link = tmp_path / "link-work"
    link.symlink_to(real, target_is_directory=True)
    with LedgerCheckout(ledger_path) as ledger:
        claimed = claim_sample(ledger, "desktop:a5-workdir")
        head = run_plain_git(ledger_path, "rev-parse", "HEAD").strip()
        with pytest.raises(LedgerError, match="分开"):
            complete_task(ledger, task_id=claimed["id"], work_dir=nested, now=FIXED_NOW)
        with pytest.raises(LedgerError, match="分开"):
            complete_task(ledger, task_id=claimed["id"], work_dir=ledger_path, now=FIXED_NOW)
        with pytest.raises(LedgerError, match="分开"):
            complete_task(ledger, task_id=claimed["id"], work_dir=link, now=FIXED_NOW)
    assert run_plain_git(ledger_path, "rev-parse", "HEAD").strip() == head
    assert (ledger_path / "tasks" / "claimed" / f"{claimed['id']}.json").is_file()


def test_cli_complete_pending_sync_then_resume(tmp_path: Path) -> None:
    ledger_path, remote = make_git_ledger(tmp_path)
    workdir = tmp_path / "work"
    with LedgerCheckout(ledger_path) as ledger:
        claimed = claim_sample(ledger, "desktop:a5-pending")
    assert run_fake_executor(workdir).returncode == 0
    missing = tmp_path / "missing.git"
    subprocess.run(
        ["git", "-C", str(ledger_path), "remote", "set-url", "origin", str(missing)],
        check=True,
    )
    cli = subprocess.run(
        [
            sys.executable,
            "-m",
            "pat_ledger",
            "--ledger",
            str(ledger_path),
            "complete",
            "--id",
            claimed["id"],
            "--workdir",
            str(workdir),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    assert cli.returncode == 1, cli.stderr
    payload = json.loads(cli.stdout)
    assert payload["status"] == "pending-sync"
    assert (ledger_path / "tasks" / "done" / f"{claimed['id']}.json").is_file()
    assert len(_completed_events(ledger_path)) == 1
    head = run_plain_git(ledger_path, "rev-parse", "HEAD")
    subprocess.run(
        ["git", "-C", str(ledger_path), "remote", "set-url", "origin", str(remote)],
        check=True,
    )
    with LedgerCheckout(ledger_path) as ledger:
        again = complete_and_sync(
            ledger,
            task_id=claimed["id"],
            work_dir=workdir,
            now=FIXED_NOW,
        )
    assert again["status"] == "completed"
    assert run_plain_git(ledger_path, "rev-parse", "HEAD") == head
    assert len(_completed_events(ledger_path)) == 1
    show_remote(remote, f"tasks/done/{claimed['id']}.json")


def test_release_and_sync_publishes_inbox_and_retries(tmp_path: Path) -> None:
    ledger_path, remote = make_git_ledger(tmp_path)
    with LedgerCheckout(ledger_path) as ledger:
        claimed = claim_sample(ledger, "desktop:a5-relsync")
    missing = tmp_path / "missing.git"
    subprocess.run(
        ["git", "-C", str(ledger_path), "remote", "set-url", "origin", str(missing)],
        check=True,
    )
    with LedgerCheckout(ledger_path) as ledger:
        pending = release_and_sync(ledger, task_id=claimed["id"], now=FIXED_NOW)
    assert pending["status"] == "pending-sync"
    assert (ledger_path / "tasks" / "inbox" / f"{claimed['id']}.json").is_file()
    head = run_plain_git(ledger_path, "rev-parse", "HEAD")
    subprocess.run(
        ["git", "-C", str(ledger_path), "remote", "set-url", "origin", str(remote)],
        check=True,
    )
    with LedgerCheckout(ledger_path) as ledger:
        again = release_and_sync(ledger, task_id=claimed["id"], now=FIXED_NOW)
    assert again["status"] == "released"
    assert run_plain_git(ledger_path, "rev-parse", "HEAD") == head
    released = [
        json.loads(line)
        for line in (ledger_path / "events" / "2026-11-08.jsonl").read_text(encoding="utf-8").splitlines()
        if line and json.loads(line)["kind"] == "task.released"
    ]
    assert len(released) == 1
    show_remote(remote, f"tasks/inbox/{claimed['id']}.json")
    absent = subprocess.run(
        ["git", "--git-dir", str(remote), "cat-file", "-e", f"main:tasks/claimed/{claimed['id']}.json"],
        check=False,
        capture_output=True,
        text=True,
    )
    assert absent.returncode != 0


def test_rebuild_rejects_bad_task_id_before_deleting(tmp_path: Path) -> None:
    ledger_path, _remote = make_git_ledger(tmp_path)
    with LedgerCheckout(ledger_path) as ledger:
        claimed = claim_sample(ledger, "desktop:a5-badid")
    event_path = ledger_path / "events" / "2026-11-08.jsonl"
    event_path.write_text(
        event_path.read_text(encoding="utf-8")
        + json.dumps(
            {
                "id": "evt-bad",
                "kind": "task.created",
                "data": {"bucket": "inbox", "task": {"id": "../../escaped"}},
            },
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    original = (ledger_path / "tasks" / "claimed" / f"{claimed['id']}.json").read_text(encoding="utf-8")
    with pytest.raises(LedgerError, match="不合法"):
        rebuild_from_events(ledger_path)
    assert (ledger_path / "tasks" / "claimed" / f"{claimed['id']}.json").read_text(encoding="utf-8") == original
    assert list(tmp_path.rglob("escaped.json")) == []


def test_rebuild_ignores_bucket_paths_outside_the_ledger(tmp_path: Path) -> None:
    ledger_path, _remote = make_git_ledger(tmp_path)
    with LedgerCheckout(ledger_path) as ledger:
        claimed = claim_sample(ledger, "desktop:a5-badbucket")
    event_path = ledger_path / "events" / "2026-11-08.jsonl"
    lines = []
    for line in event_path.read_text(encoding="utf-8").splitlines():
        if not line:
            continue
        event = json.loads(line)
        if event["kind"] == "task.claimed":
            event["data"]["bucket"] = "../../bucket-escaped"
        lines.append(json.dumps(event, ensure_ascii=False))
    event_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    rebuilt = rebuild_from_events(ledger_path)
    assert rebuilt["status"] == "rebuilt"
    assert (ledger_path / "tasks" / "claimed" / f"{claimed['id']}.json").is_file()
    assert list(tmp_path.rglob("bucket-escaped")) == []
    assert list(tmp_path.rglob("bucket-escaped.json")) == []
