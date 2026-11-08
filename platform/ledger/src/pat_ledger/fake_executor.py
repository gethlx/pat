from __future__ import annotations

import sys
from pathlib import Path

DEFAULT_FILENAME = "result.md"
DEFAULT_BODY = "fake executor wrote the agreed result.\n"


def run_fake_executor(
    workdir: str | Path,
    filename: str = DEFAULT_FILENAME,
    body: str = DEFAULT_BODY,
) -> int:
    root = Path(workdir)
    root.mkdir(parents=True, exist_ok=True)
    (root / filename).write_text(body, encoding="utf-8")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if not args:
        print("usage: python -m pat_ledger.fake_executor WORKDIR [FILENAME]", file=sys.stderr)
        return 2
    filename = args[1] if len(args) > 1 else DEFAULT_FILENAME
    return run_fake_executor(args[0], filename)


if __name__ == "__main__":
    raise SystemExit(main())
