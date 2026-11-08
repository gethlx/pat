from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from pat_ledger.checkout import REQUIRED_DIRS, LedgerCheckout, LedgerError

DESIGN_ROOT = Path(__file__).resolve().parents[3]


def make_skeleton(root: Path) -> Path:
    """Build a pat-memory-style tree matching initial commit 33b7814353ee162c9b495e9470162891c7f55d43."""
    root.mkdir(parents=True, exist_ok=True)
    for relative in REQUIRED_DIRS:
        directory = root / relative
        directory.mkdir(parents=True, exist_ok=True)
        (directory / ".gitkeep").touch()
    (root / ".git").mkdir()
    return root


def run_cli(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "pat_ledger", *args],
        capture_output=True,
        text=True,
        check=False,
    )


def test_ready_when_skeleton_complete(tmp_path: Path) -> None:
    root = make_skeleton(tmp_path / "ledger")
    result = run_cli("--ledger", str(root))
    assert result.returncode == 0
    assert "ready" in result.stdout


@pytest.mark.parametrize("missing", REQUIRED_DIRS)
def test_missing_directory_is_reported(tmp_path: Path, missing: str) -> None:
    root = make_skeleton(tmp_path / "ledger")
    shutil.rmtree(root / missing)
    result = run_cli("--ledger", str(root))
    assert result.returncode != 0
    assert "缺少" in result.stderr
    assert missing in result.stderr


def test_rejects_design_repo_root() -> None:
    result = run_cli("--ledger", str(DESIGN_ROOT))
    assert result.returncode != 0
    assert "不得混用" in result.stderr


def test_rejects_path_inside_design_repo() -> None:
    result = run_cli("--ledger", str(DESIGN_ROOT / "platform"))
    assert result.returncode != 0
    assert "不得混用" in result.stderr


def test_lock_blocks_reentry(tmp_path: Path) -> None:
    root = make_skeleton(tmp_path / "ledger")
    first = LedgerCheckout(root)
    first.open()
    with pytest.raises(LedgerError, match="重入"):
        LedgerCheckout(root).open()
    held = run_cli("--ledger", str(root))
    assert held.returncode != 0
    assert "重入" in held.stderr
    first.close()
    after = run_cli("--ledger", str(root))
    assert after.returncode == 0
    assert "ready" in after.stdout
