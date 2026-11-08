# pat-ledger

PAT 账本引擎（轨 A）。窗口主进程按完整路径调用本 CLI。当前是 A1 脚手架：能打印帮助或版本，并要求调用方传入账本 checkout 路径。

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

`--ledger` 必须由调用方传入（或后续由配置传入同一路径）。引擎不写死本机路径，未提供路径时以明确错误非零退出，也不会创建隐藏的默认 checkout。

## 测试

```
uv run pytest
```
