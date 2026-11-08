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

`claim` 按 `source_ref` 在 `inbox/`、`claimed/`、`done/` 查重，并在同一 Git 提交里先建后领（若任务已在 `inbox/`，则只写领取并移入 `claimed/`）。随后普通推送并读回远端：确认任务仍在 `claimed/`、最新领取事件为本次记录才继续。非快进时只在专用且无未保存工作的领取副本上执行 `git fetch` 与 `git reset --hard`，重读 `tasks/inbox/` 后再决定是否领取。领取路径不会对领取提交做 rebase 或 merge，也不会对账本仓 `main` force-push。

同一 `source_ref` 且请求相同则不新建、不第二次领取；同键但内容或执行器有变时停止并回报需要核对，不覆盖。

## 测试

```
uv run pytest
```

测试在临时目录合成骨架和临时 Git 仓（带本地远端），不会改动私有仓 `pat-memory`。
