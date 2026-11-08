from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from pat_ledger.checkout import LedgerCheckout, LedgerError
from pat_ledger.complete import complete_and_sync, release_and_sync
from pat_ledger.history import read_history
from pat_ledger.gitutil import reset_git_binary, use_git_binary
from pat_ledger.rebuild import rebuild_from_events
from pat_ledger.sync import claim_and_sync

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
    parser.add_argument(
        "command",
        nargs="?",
        default="ready",
        choices=("ready", "claim", "complete", "release", "rebuild", "history"),
        help="ready / claim / complete / release / rebuild / history",
    )
    parser.add_argument("--task-json", dest="task_json", help="任务字段 JSON")
    parser.add_argument("--source-ref", dest="source_ref")
    parser.add_argument("--goal")
    parser.add_argument("--owner")
    parser.add_argument("--id", dest="task_id")
    parser.add_argument("--from", dest="from_")
    parser.add_argument("--mode")
    parser.add_argument("--deadline")
    parser.add_argument("--handoff")
    parser.add_argument("--workdir", dest="workdir", help="执行工作目录（与账本 checkout 分开）")
    parser.add_argument("--artifact", dest="artifact", default="result.md")
    parser.add_argument(
        "--git",
        dest="git_path",
        default=None,
        help="git 可执行文件路径（可选；不传则使用 PATH 中的 git）",
    )
    return parser


def _claim_fields(args: argparse.Namespace) -> dict:
    data = json.loads(args.task_json) if args.task_json else {}
    if not isinstance(data, dict):
        raise LedgerError("--task-json 必须是对象")
    mapping = {
        "source_ref": args.source_ref,
        "goal": args.goal,
        "owner": args.owner,
        "id": args.task_id,
        "from": args.from_,
        "mode": args.mode,
        "deadline": args.deadline,
        "handoff": args.handoff,
    }
    for key, value in mapping.items():
        if value is not None:
            data[key] = value
    missing = [key for key in ("source_ref", "goal", "owner") if not data.get(key)]
    if missing:
        raise LedgerError("claim 缺少字段：" + "、".join(missing))
    return data


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
    token = None
    try:
        if args.git_path:
            if not Path(args.git_path).is_file():
                print(f"error: git 可执行文件不存在：{args.git_path}", file=sys.stderr)
                return 1
            token = use_git_binary(args.git_path)
        with LedgerCheckout(args.ledger) as ledger:
            if args.command == "ready":
                print("ready")
                return 0
            if args.command == "history":
                print(json.dumps(read_history(ledger.path), ensure_ascii=False))
                return 0
            if args.command == "claim":
                fields = _claim_fields(args)
                result = claim_and_sync(
                    ledger,
                    source_ref=fields["source_ref"],
                    goal=fields["goal"],
                    owner=fields["owner"],
                    from_=fields.get("from", "desktop"),
                    mode=fields.get("mode", "push"),
                    deadline=fields.get("deadline"),
                    handoff=fields.get("handoff", ""),
                    artifacts=fields.get("artifacts"),
                    task_id=fields.get("id"),
                )
                print(json.dumps(result, ensure_ascii=False))
                return 1 if result["status"] == "review" else 0
            if args.command == "complete":
                if not args.task_id or not args.workdir:
                    raise LedgerError("complete 需要 --id 与 --workdir")
                result = complete_and_sync(
                    ledger,
                    task_id=args.task_id,
                    work_dir=args.workdir,
                    artifact_name=args.artifact,
                )
                print(json.dumps(result, ensure_ascii=False))
                return 0 if result["status"] == "completed" else 1
            if args.command == "release":
                if not args.task_id:
                    raise LedgerError("release 需要 --id")
                result = release_and_sync(ledger, task_id=args.task_id)
                print(json.dumps(result, ensure_ascii=False))
                return 0 if result["status"] == "released" else 1
            result = rebuild_from_events(ledger.path)
            print(json.dumps(result, ensure_ascii=False))
            return 0
    except LedgerError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except ValueError as exc:
        print(f"error: 无法读取任务或账本数据：{exc}", file=sys.stderr)
        return 1
    finally:
        if token is not None:
            reset_git_binary(token)
    return 0
