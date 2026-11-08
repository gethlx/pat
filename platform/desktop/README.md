# PAT 桌面壳

阶段一轨 B 的 Electron 单窗口脚手架。窗口标题固定为 PAT，不改成任何 Agent 名。

## 工具链

- Node.js 24（与 `package.json` 的 `engines.node` 一致，要求 `>=24 <25`）
- 包管理用随 Node 附带的 npm
- Electron 45（当前锁定 `45.2.3`）
- 窗口自动测试用 Playwright（`@playwright/test` 的 Electron 启动器）

渲染进程不开 `nodeIntegration`，经预加载脚本 `src/preload.js` 暴露有限 IPC。账本与子进程只在主进程调用；本脚手架不实现派活。

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

路径由运行时决议，源码和测试不写死本机绝对路径。
