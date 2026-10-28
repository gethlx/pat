# platform/ — PAT 整体线区

> 状态：现行
> 维护线：整体线（PAT 数据主权）
> 最后更新：2026-10-28

本区归 PAT 整体线维护：架构蓝图、硬件与采集终端、云端 Agent 节点选型与接入、背景理论、相关调研与设计采收。维护规范见根目录 `AGENTS.md`。共享记忆线的内容在 `../memory/`，两线契约在 `../contracts/`——本区不存放共享记忆线的文档。

## 索引

| 文档 | 角色 | 状态 |
|---|---|---|
| `architecture-v1.md` | **唯一执行蓝图**（分层、触发策略、协议通道、升级矩阵、Demo 清单） | 定稿（2026-10-17） |
| `architecture-viz.html` | 蓝图可视化（单文件 HTML，浏览器打开：分层架构 / 系统闭环 / 触发策略 / 协议通道 / 升级矩阵） | 与蓝图同步 |
| `hermes-adjustments.md` | VPS 云端节点（Hermes）与 PAT 需求的逐条核对及调整清单 | 定稿（2026-10-21）；本轮执行见报告 |
| `hermes-config-spec.md` | Hermes 节点配置方案（配置↔需求映射、设计理念、调研依据） | 已评审修订（2026-10-22）；本轮执行见报告 |
| `hermes-config-review-guide.md` | Hermes 配置方案评审指引（给评审方智能体：范围、材料、纪律、回流格式） | 现行（2026-10-22） |
| `hermes-acceptance-checklist.md` | Hermes 执行验收证据清单（A-H 八组证据与凭据红线） | 现行（2026-10-27） |
| `hermes-execution-report.md` | Hermes v0.22.5 配置执行与验收证据报告 | 已执行，待验收方复核（2026-10-28；有未完成硬门槛） |
| `design-harvest.md` | 设计采收册：历次调研的可迁移设计与反面教训（长期跟进，升级迭代时逐条回看） | 持续追加 |
| `background/human-data-assets/` | 背景参考：数据主权远期愿景（确权→定价→交易），只答"为什么"，**不作执行依据** | 参考 |
| `research/working-memory-candidates.md` | 工作记忆层候选调研（与数据层分离的薄层：指针 + TTL + 任务作用域） | 调研稿 |

## 本区当前状态

- 架构 v1 已定稿（2026-10-17）。
- 当前单项提前推进：VPS 云端节点——Hermes 已升级至 v0.22.5 并按配置方案完成本轮治理收口与本体行为验收，包括真实两小时 Runs 审批挂起并批准走完；执行证据见 `hermes-execution-report.md`。服务商侧消费上限仍缺合格证据，因此尚不声明 `hermes-config-spec.md` §7 全量通过。
- 其余部分（Tier 1 随身终端原型、数据层全量建设等）保持探索节奏，未整体提前。
