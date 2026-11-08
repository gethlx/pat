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
uv run python -m pat_ledger.fake_executor /path/to/workdir
uv run pat-ledger --ledger /path/to/ledger-checkout complete \
  --id t-... --workdir /path/to/workdir --artifact result.md
uv run pat-ledger --ledger /path/to/ledger-checkout release --id t-...
uv run pat-ledger --ledger /path/to/ledger-checkout rebuild
```

`--ledger` 必须由调用方传入。引擎不写死本机路径，未提供路径时以明确错误非零退出，也不会创建隐藏的默认 checkout。

传入路径后，`ready`（默认）会校验骨架并对 `.git/pat.lock` 加锁，通过后打印 `ready`。

`claim` 按 `source_ref` 查重并先建后领，随后普通推送并读回；非快进时只在干净的领取副本上 `fetch` 与 `reset --hard`。

假执行器写入约定的 `result.md` 后退出 0，工作目录与账本 checkout 分开。`complete` 校验产物在工作目录内且不是符号链接，复制到 `artifacts/<任务 ID>/`，用路径加 SHA-256 记入 `artifacts[]`，与完成事件和任务移入 `done/` 写在同一提交；远端读回确认后才回报已完成。`release` 写入 `task.released` 并将任务放回 `inbox/`，沿用原 `source_ref`。`rebuild` 忽略现成 `tasks/`，仅凭事件还原任务视图。

## 测试

```
uv run pytest
```

测试在临时目录合成骨架和临时 Git 仓（带本地远端），不会改动私有仓 `pat-memory`。

`history` 从 checkout 的提交恢复任务和待同步状态，参考已读回的 `origin/main`。账本写入要求工作区与暂存区干净。有未同步提交时先同步原任务。如果远端已推进导致无法快进，请保留本地提交并人工核对。
