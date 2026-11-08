from __future__ import annotations

import argparse
import sys

__version__ = "0.1.0"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pat-ledger",
        description=(
            "PAT 账本引擎。账本 checkout 路径必须通过 --ledger 传入，"
            "不会使用或创建默认路径。"
        ),
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {__version__}",
    )
    parser.add_argument(
        "--ledger",
        metavar="PATH",
        default=None,
        help="账本 checkout 路径（不设默认值）",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not args.ledger:
        print(
            "error: 必须通过 --ledger 传入账本 checkout 路径，"
            "不会创建或使用默认路径。",
            file=sys.stderr,
        )
        return 2
    return 0
