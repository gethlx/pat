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
```

`--ledger` 必须由调用方传入。引擎不写死本机路径，未提供路径时以明确错误非零退出，也不会创建隐藏的默认 checkout。

传入路径后，引擎会：

- 拒绝位于本设计仓工作副本内的路径（两仓不得混用）
- 检查仓根是否具备 `events/`、`proposals/`、`confirmed/`、`index/`、`tasks/inbox/`、`tasks/claimed/`、`tasks/done/`、`artifacts/`
- 在 checkout 内对 `.git/pat.lock` 加排他锁，防止同一实例重入；通过后打印 `ready`

## 测试

```
uv run pytest
```

测试在临时目录合成骨架，不会改动私有仓 `pat-memory`。
