from __future__ import annotations

import subprocess
from pathlib import Path

from pat_ledger.checkout import LedgerError

FORBIDDEN_SUBCOMMANDS = frozenset({"rebase", "merge"})
FORCE_FLAGS = frozenset({"--force", "-f", "--force-with-lease", "--force-if-includes"})


def _ensure_allowed(args: tuple[str, ...]) -> None:
    tokens: list[str] = []
    index = 0
    while index < len(args):
        if args[index] == "-c" and index + 1 < len(args):
            index += 2
            continue
        tokens.append(args[index])
        index += 1
    if not tokens:
        return
    command = tokens[0]
    if command in FORBIDDEN_SUBCOMMANDS:
        raise LedgerError(f"领取路径禁止 {command}")
    if command == "push" and FORCE_FLAGS.intersection(tokens):
        raise LedgerError("禁止对账本仓 main force-push")


def run_git(
    root: Path,
    *args: str,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    _ensure_allowed(args)
    result = subprocess.run(
        ["git", "-C", str(root), *args],
        check=False,
        capture_output=True,
        text=True,
    )
    if check and result.returncode != 0:
        detail = (result.stderr or result.stdout).strip() or f"exit {result.returncode}"
        raise LedgerError(f"git {' '.join(args)} 失败：{detail}")
    return result
