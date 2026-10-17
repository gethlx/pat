# AGENTS.md — PAT (Personal Agent Terminal)

> 给在此仓库工作的 coding agent 看的。动手前先读完。

## 项目是什么

用户自有的多模态数据采集与 Agent 交互硬件架构。目标：视频/多模态数据主权——
第一视角视频、语音、图像数据的采集、存储、定价、授权，全在自己手里。
一句话：**两头开放，中间自主**（Agent 层可换、显示层可换；采集层、数据层、协议是自己的）。

## 文档角色（严格区分）

- `docs/architecture-v1.md` —— **唯一执行蓝图**。一切工程决策只以它为准。
- `docs/architecture-viz.html` —— 蓝图的可视化版本，内容与 v1 一致。
- `docs/background/` —— 远期愿景与背景参考（数据主权理论框架：确权→定价→交易）。
  只回答"为什么"，**绝不作为执行依据**。不许把背景文档里的概念直接翻译成工程需求。

## 铁律

1. **私有协议终止于固件**：Muse 相关代码只活在 adapter 里，不渗进数据层。
2. **层间协议固定**：MQTT（事件/触发/审批卡片/通知）＋ HTTP（文件/批量上传）＋ 标准格式
   （JPEG / MJPEG-AVI / WAV / JSON）。不引入新的私有协议。
3. **Agent 层可替换**：不写死任何单一 Agent 的假设；换 adapter 时采集/数据/输出层不动。
4. **触发判断下沉端侧**（L0–L4，L2 做召回、L3 做精确，级联）；云端只做策略下发和事后分析。
5. **宁可少，不可脏**：数据质量优先于数据量。
6. **不采购、不定选型**：没有用户明确点头，不买任何硬件、不锁死任何具体型号。
   文档里出现的产品名一律只是举例。

## 当前阶段

眼前第一步：**Muse 接入 Demo 跑通**（adapter 模式），验证全流程与体验。
见 `docs/architecture-v1.md`「协议与通道」一节与 Demo 验证清单。

## 工作方式

- 动手前先读 `docs/architecture-v1.md` 相关章节，不靠猜。
- 固件相关参考上游 `facebookincubator/muse-gadget-sdk`（Apache 2.0）的 `AGENTS.md`
  与 `link.register` / `main/app.c` 自定义命令机制。
- 多文件推送走一次 `push_files`，commit message 说清楚改了什么。
- 吃不准的先问，不瞎猜；Secrets（Wi-Fi 密码、token、密钥）绝不进仓库。
