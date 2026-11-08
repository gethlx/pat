from __future__ import annotations

import fcntl
import os
from pathlib import Path

REQUIRED_DIRS = (
    "events",
    "proposals",
    "confirmed",
    "index",
    "tasks/inbox",
    "tasks/claimed",
    "tasks/done",
    "artifacts",
)

LOCK_RELPATH = Path(".git") / "pat.lock"

DESIGN_MARKERS = (
    Path("platform") / "architecture-v2.md",
    Path("platform") / "ledger" / "pyproject.toml",
)


class LedgerError(Exception):
    pass


def is_inside_design_repo(path: Path) -> bool:
    resolved = path.resolve()
    for candidate in (resolved, *resolved.parents):
        if all((candidate / marker).is_file() for marker in DESIGN_MARKERS):
            return True
    return False


class LedgerCheckout:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self._lock_fd: int | None = None

    def validate(self) -> None:
        root = self.path
        if not root.exists():
            raise LedgerError(f"账本路径不存在：{root}")
        if not root.is_dir():
            raise LedgerError(f"账本路径不是目录：{root}")
        resolved = root.resolve()
        self.path = resolved
        if is_inside_design_repo(resolved):
            raise LedgerError(
                "不能把设计仓工作副本当作账本；公开 pat 与私有 pat-memory 两仓不得混用"
            )
        missing = [rel for rel in REQUIRED_DIRS if not (resolved / rel).is_dir()]
        if missing:
            raise LedgerError("账本骨架不完整，缺少：" + "、".join(missing))
        if not (resolved / ".git").is_dir():
            raise LedgerError(
                "账本路径不是 Git checkout（缺少 .git），无法使用 .git/pat.lock"
            )

    def acquire(self) -> None:
        if self._lock_fd is not None:
            raise LedgerError("账本正被本实例占用（.git/pat.lock），拒绝重入")
        lock_path = self.path / LOCK_RELPATH
        fd = os.open(lock_path, os.O_RDWR | os.O_CREAT, 0o644)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            os.close(fd)
            raise LedgerError("账本正被本实例占用（.git/pat.lock），拒绝重入") from None
        self._lock_fd = fd

    def release(self) -> None:
        if self._lock_fd is None:
            return
        fd = self._lock_fd
        self._lock_fd = None
        try:
            fcntl.flock(fd, fcntl.LOCK_UN)
        finally:
            os.close(fd)

    def open(self) -> None:
        self.validate()
        self.acquire()

    def close(self) -> None:
        self.release()

    def __enter__(self) -> LedgerCheckout:
        self.open()
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()
