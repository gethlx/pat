from __future__ import annotations

import contextvars
import subprocess
from pathlib import Path

from pat_ledger.checkout import LedgerError

_git_binary: contextvars.ContextVar[str] = contextvars.ContextVar(
    "pat_ledger_git",
    default="git",
)


def use_git_binary(path: str) -> contextvars.Token[str]:
    return _git_binary.set(path)


def reset_git_binary(token: contextvars.Token[str]) -> None:
    _git_binary.reset(token)

FORBIDDEN_SUBCOMMANDS = frozenset({"rebase", "merge"})
FORCE_FLAGS = frozenset({"--force", "-f", "--force-with-lease", "--force-if-includes"})


_FORCE_PREFIXES = ("--force=", "--force-with-lease=", "--force-if-includes=")


def _push_is_forced(tokens: list[str]) -> bool:
    for token in tokens[1:]:
        if token in FORCE_FLAGS or token.startswith(_FORCE_PREFIXES):
            return True
        if token.startswith("-"):
            continue
        if token.startswith("+"):
            return True
        if ":" in token and token.split(":", 1)[1].startswith("+"):
            return True
    return False


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
    if command == "push" and _push_is_forced(tokens):
        raise LedgerError("禁止对账本仓 main force-push")


def run_git(
    root: Path,
    *args: str,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    _ensure_allowed(args)
    result = subprocess.run(
        [_git_binary.get(), "-C", str(root), *args],
        check=False,
        capture_output=True,
        text=True,
    )
    if check and result.returncode != 0:
        detail = (result.stderr or result.stdout).strip() or f"exit {result.returncode}"
        raise LedgerError(f"git {' '.join(args)} 失败：{detail}")
    return result


def require_clean(root: Path) -> None:
    if run_git(root, "status", "--porcelain").stdout.strip():
        raise LedgerError("账本有未保存工作，请先核对暂存区和工作目录")


def unpublished_commits(root: Path, remote: str, branch: str) -> list[str]:
    return run_git(root, "rev-list", f"{remote}/{branch}..HEAD").stdout.splitlines()


def require_publishable(
    root: Path, remote: str, branch: str, *, retry_message: str | None = None
) -> None:
    require_clean(root)
    pending = unpublished_commits(root, remote, branch)
    if not pending:
        return
    if len(pending) == 1 and retry_message is not None:
        subject = run_git(root, "show", "-s", "--format=%s", pending[0]).stdout.strip()
        if subject == retry_message:
            return
    raise LedgerError("账本还有未同步提交，请先同步原任务或核对账本")
