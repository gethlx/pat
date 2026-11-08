# pat-ledger

PAT 账本引擎（轨 A）。窗口主进程按完整路径调用本 CLI。账本 checkout 路径必须由调用方传入；引擎会校验 `pat-memory` 风格骨架、加上本地锁，并拒绝把设计仓工作副本当作账本。

本目录在公开设计仓 `gethlx/pat` 的 `platform/ledger/`。私有账本仓是 `gethlx/pat-memory`，不要把账本 checkout 混进本工作副本。

## 要求

- Python 3.13
- [uv](https://docs.astral.sh/uv/)
- pytest（由项目开发依赖提供）

## 命令

在本目录执行：

```
uv run pat-ledger --help
uv run pat-ledger --version
uv run pat-ledger --ledger /path/to/ledger-checkout
uv run pat-ledger --ledger /path/to/ledger-checkout claim \
  --source-ref desktop:<uuid> --goal "整理文本" --owner exec-a
```

`--ledger` 必须由调用方传入。引擎不写死本机路径，未提供路径时以明确错误非零退出，也不会创建隐藏的默认 checkout。

传入路径后，`ready`（默认）会校验骨架并对 `.git/pat.lock` 加锁，通过后打印 `ready`。

`claim` 按 `source_ref` 在 `inbox/`、`claimed/`、`done/` 查重，并在同一 Git 提交里先建后领：任务落到 `tasks/claimed/`，同时追加 `task.created` 与 `task.claimed` 事件到 UTC 日分 JSONL。同一 `source_ref` 且请求相同则不新建、不第二次领取；同键但内容或执行器有变时停止并回报需要核对，不覆盖。

## 测试

```
uv run pytest
```

测试在临时目录合成骨架和临时 Git 仓（带本地远端），不会改动私有仓 `pat-memory`。
