# platform/ — PAT 整体线区

> 状态：现行
> 维护线：整体线（PAT 数据主权）
> 最后更新：2026-11-06
> 摘要：整体线执行蓝图、云端节点历史与现行裁定、设计采收及升级评审的导航。

本区归 PAT 整体线维护：架构蓝图、硬件与采集终端、云端 Agent 节点选型与接入、背景理论、相关调研与设计采收。维护规范见根目录 `AGENTS.md`。共享记忆线的内容在 `../memory/`，两线契约在 `../contracts/`——本区不存放共享记忆线的文档。

## 索引

| 文档 | 角色 | 状态 |
|---|---|---|
| [architecture-v2.md](architecture-v2.md) | **当前唯一执行蓝图**：跨厂商 Agent 组织治理——薄壳调度、推/拉双模、Git 记忆基座、宰相席位制、手机优先终端 | 定稿草案（2026-11-06），待冻结 |
| [architecture-v1.md](architecture-v1.md) | **硬件与采集阶段参考蓝图**：采集终端所有权、触发 L0–L4、私有协议止于 adapter、开放格式、升级矩阵 | 定稿（2026-10-17）；Agent 层与工作记忆层已由 v2 取代 |
| [architecture-viz.html](architecture-viz.html) | v1 可视化（单文件 HTML：分层架构 / 系统闭环 / 触发策略 / 协议通道 / 升级矩阵），作硬件阶段参考 | 与 v1 同步 |
| [hermes-adjustments.md](hermes-adjustments.md) | VPS 云端节点（Hermes）与 PAT 需求的逐条核对及调整清单 | 定稿（2026-10-21）；本轮执行见报告 |
| [hermes-config-spec.md](hermes-config-spec.md) | Hermes 节点配置方案（配置↔需求映射、设计理念、调研依据） | 已评审修订（2026-10-22）；本轮执行见报告 |
| [hermes-config-review-guide.md](hermes-config-review-guide.md) | Hermes 配置方案评审指引（给评审方智能体：范围、材料、纪律、回流格式） | 现行（2026-10-22） |
| [hermes-acceptance-checklist.md](hermes-acceptance-checklist.md) | Hermes 执行验收证据清单（A-H 八组证据与凭据红线） | 现行（2026-10-27） |
| [hermes-execution-report.md](hermes-execution-report.md) | Hermes v0.22.5 配置执行与验收证据报告 | 已执行（2026-10-28） |
| [hermes-acceptance-verdict.md](hermes-acceptance-verdict.md) | Hermes 阶段一开跑验收结论（验收方权威记录） | §7 本体开跑验收通过（2026-10-28） |
| [hermes-test-suite.md](hermes-test-suite.md) | Hermes 阶段一使用验证任务集（T0-T7） | 已确认（2026-10-28） |
| [hermes-test-results.md](hermes-test-results.md) | Hermes 阶段一使用验证执行结果与计量证据 | T0-T6 已完成（2026-10-29） |
| [hermes-usage-verification-report.md](hermes-usage-verification-report.md) | Hermes 阶段一使用验证评分与关闭决定 | 阶段一已关闭（2026-10-29） |
| [hermes-dsh-execution-report.md](hermes-dsh-execution-report.md) | Hermes 封存退役与 DeepSeek Harness 部署执行报告 | 部署历史（2026-10-29）；后续可用裁定见下项 |
| [dsh-deployment-verdict.md](dsh-deployment-verdict.md) | DSH 部署验收与用户裁定 | §5 已裁定可用（2026-10-29） |
| [design-harvest.md](design-harvest.md) | 设计采收册：历次调研的可迁移设计与反面教训（长期跟进，升级迭代时逐条回看） | 持续追加 |
| [2026-11-06-architecture-upgrade-report.md](reviews/2026-11-06-architecture-upgrade-report.md) | 整体蓝图评审与升级建议：结合记忆线评审、OpenBot 与 Super-agent，补任务记录、多通道交接及恢复边界 | 草稿，待用户裁定；不替代执行蓝图 |
| [2026-11-06-two-blueprint-joint-review.md](reviews/2026-11-06-two-blueprint-joint-review.md) | **两线综合评审（v2）**：系统定位为跨厂商 Agent 组织治理层，给出「薄壳＋全员 provider＋宰相席位制」形态，并甄别过度工程化 | 草稿，待用户裁定；含跨线结论，不代改任一区正文 |
| [2026-11-06-agent-fleet-inventory.md](reviews/2026-11-06-agent-fleet-inventory.md) | **Agent 家底盘查**（落地第 0 步）：本机实测各厂商 agent 的可编程入口，按可驱动性排序出名册初稿 | 草稿，待用户补正订阅与算力事实 |
| [2026-11-06-architecture-v2-review-muse.md](reviews/2026-11-06-architecture-v2-review-muse.md) | **v2 蓝图当事方意见（老邪，输入材料）**：六条意见供独立评审核查——现行协调面定位、执行器动作门与预算、记忆仓与 tasks 仓拆分、claimed 过期回收、事件可核验性、壳路线与权威词表对齐；意见人系蓝图当事方，未经独立核验 | 草稿（当事方意见），待独立评审核查；不替代执行蓝图 |
| [background/human-data-assets/](background/human-data-assets/) | 背景参考：数据主权远期愿景（确权→定价→交易），只答"为什么"，**不作执行依据** | 参考 |
| [research/working-memory-candidates.md](research/working-memory-candidates.md) | 工作记忆层候选调研（与数据层分离的薄层：指针 + TTL + 任务作用域） | 调研稿 |

## 本区当前状态

- **架构 v2 已立（2026-11-06）**，为整体线当前唯一执行蓝图：系统定位为跨厂商 Agent 组织治理，Agent 层改由薄壳（宰相府）+ 推/拉双模 adapter 承接，记忆以 Git 为短期基座。待用户裁定冻结。
- 架构 v1（2026-10-17）降为**硬件与采集阶段参考**：其采集/固件原则继续有效，Agent 层与工作记忆层形态已并入 v2。
- 当前单项提前推进：VPS 云端节点——Hermes 已关闭并封存退役；DSH 已部署，用户于 2026-10-29 裁定可用，见 [DSH 验收结论 §5](dsh-deployment-verdict.md)。历史部署版本与冒烟结果见 [执行报告](hermes-dsh-execution-report.md)；本索引不替代当前在线版本与入口能力的现场核验。
- 整体协作升级评审已完成成稿（2026-11-06），[建议稿](reviews/2026-11-06-architecture-upgrade-report.md)待用户裁定；[两线综合评审 v2](reviews/2026-11-06-two-blueprint-joint-review.md) 的可执行结论已落地为 v2 蓝图。
- 其余部分（Tier 1 随身终端原型、数据层全量建设等）保持探索节奏，未整体提前；硬件接入列为开放选项，以手机为默认终端。
