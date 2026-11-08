# PAT 桌面壳

阶段一轨 B 的 Electron 单窗口脚手架。窗口标题固定为 PAT，不改成任何 Agent 名。

## 工具链

- Node.js 24（与 `package.json` 的 `engines.node` 一致，要求 `>=24 <25`）
- 包管理用随 Node 附带的 npm
- Electron 45（当前锁定 `45.2.3`）
- 窗口自动测试用 Playwright（`@playwright/test` 的 Electron 启动器）

渲染进程不开 `nodeIntegration`，经预加载脚本 `src/preload.js` 暴露有限 IPC。账本与子进程只在主进程调用；本脚手架不实现派活。

## 配置

本地 JSON 保存账本路径、`pat-ledger` 可执行文件完整路径、任务工作目录、`git` 完整路径、Git 提交身份，以及多个执行器实例（名称、可执行文件路径、参数、超时、`mode`、`invoke`）。路径一律由配置传入，不写死。

必填项为账本路径、`pat-ledger` 路径、工作目录，以及至少一个可启动执行器（名称与可执行文件路径均非空）。缺任一项时启动进入设置视图；配齐后启动进入工作台。工作台工具栏的「设置」在同一窗口内打开设置，不另开窗口。账本 checkout 与工作目录分字段记录。

启动时可传 `--config <文件>` 指定配置文件；未指定时使用 Electron 用户数据目录下的 `config.json`。

字段：`ledgerPath`、`patLedgerPath`、`workDir`、`gitPath`、`gitUserName`、`gitUserEmail`、`executors[]`（`name`、`command`、`args`、`timeout`、`mode`、`invoke`）。

## 命令

在本目录执行：

```bash
npm install
npm start
npm test
```

没有图形界面（无 `DISPLAY`）时，用虚拟显示跑同一测试命令：

```bash
xvfb-run --auto-servernum npm test
```

路径由运行时决议，源码、测试和提交的配置文件不写死本机绝对路径。测试在临时目录里生成配置夹具。

## 工作台表单

配齐配置后，工作台提供 Agent 下拉、多行任务文本、预期结果文件名（占位 `result.md`）和「派活」按钮。新任务默认显示「请选择 Agent」，不预选任何实例。有名称且可执行文件路径非空的实例可选；只有名称、尚无路径的实例可见但禁用，并旁注「待接入」。「新建任务」清空表单，Agent 回到「请选择 Agent」。本阶段不实现真正派活。最近任务为空，以及没有选中且没有进行中任务时，当前任务显示「还没有任务。选一个 Agent，写下任务后点派活。」
