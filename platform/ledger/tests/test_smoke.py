from __future__ import annotations

import os
import subprocess
import sys
import tomllib
from pathlib import Path

LEDGER_ROOT = Path(__file__).resolve().parents[1]


def _run_cli(*args: str, cwd: Path, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "pat_ledger", *args],
        cwd=cwd,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def test_requires_python_313() -> None:
    data = tomllib.loads((LEDGER_ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    requires = data["project"]["requires-python"]
    assert "3.13" in requires


def test_cli_help() -> None:
    result = subprocess.run(
        [sys.executable, "-m", "pat_ledger", "--help"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0
    assert "usage" in result.stdout.lower() or "--ledger" in result.stdout


def test_cli_without_ledger_path_exits_and_creates_nothing(tmp_path: Path) -> None:
    cwd = tmp_path / "cwd"
    home = tmp_path / "home"
    cwd.mkdir()
    home.mkdir()
    before_cwd = {path.name for path in cwd.iterdir()}
    before_home = {path.name for path in home.iterdir()}
    env = os.environ.copy()
    env["HOME"] = str(home)
    env["XDG_CONFIG_HOME"] = str(home / "xdg-config")
    env["XDG_DATA_HOME"] = str(home / "xdg-data")
    env["XDG_CACHE_HOME"] = str(home / "xdg-cache")
    result = _run_cli(cwd=cwd, env=env)
    assert result.returncode != 0
    assert "--ledger" in result.stderr
    assert {path.name for path in cwd.iterdir()} == before_cwd
    assert {path.name for path in home.iterdir()} == before_home
    assert not (home / "xdg-config").exists()
    assert not (home / "xdg-data").exists()
    assert not (home / "xdg-cache").exists()
