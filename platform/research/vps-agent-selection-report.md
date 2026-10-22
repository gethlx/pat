# VPS 云端节点选型调研记录（阶段一 · 成品 Agent）

> 状态：定稿（记录）
> 维护线：整体线
> 最后更新：2026-10-22
> 摘要：阶段一 VPS 节点选型的完整调研记录——六个成品 Agent × 五个契约面的适配度评估、Hermes vs QwenPaw 决赛对比与翻盘条件。调研发生于 2026-10-20 至 10-21，2026-10-22 整理入仓，供后续引用与复核。

## 0. 证据边界

- 全部结论为**文档 + 源码级核验，无活体冒烟**。凡涉及运行时行为的判断，最终以部署后的冒烟实测为准（冒烟项已转入 `platform/hermes-adjustments.md` 立账）。
- 选型口径（用户定）：阶段一是"给舰队添一个能先用起来的节点"，只看开箱贴合度、改动成本、维护活跃度；接入手段按**配置 ＞ 插件 ＞ 旁路 ＞ 源码**定级（越靠前越优）。

## 1. 适配度评估（六产品 × 五契约面）

五个契约面：**数据层接入 / 共享记忆参与 / 事件与唤醒 / 输出与审批 / 多模型切换**。

| 产品 | 总分 | 一句话定性 |
|---|---|---|
| **Hermes**（Nous Research，MIT） | **92** | 唯一"配置 + 一条 MQTT 薄桥"可跑通阶段一验证；自学习审批门为配置级（skills/memory 两处 write_approval + 关 curator 与 background_review），记忆权威走官方 MemoryProvider 插件位（单槽） |
| LangBot（Apache-2.0） | 88 | 工具调用级审批本体不可达，闸只能设在 PAT 的 MCP server 侧；`enable_all_*` 系列默认全 true，接入须显式全关 |
| QwenPaw（阿里 AgentScope，Apache-2.0） | 88 | ReMe 全关开关查实存在，但"只起草待审批"模式不存在、须自研 Memory 后端插件；遥测根除靠环境变量；**高风险待实测：记忆插件故障时是否静默回落 ReMeLight，官方文档两处说法矛盾** |
| nanobot（港大） | 79 | Dream 关停干净；但 MemoryStore 硬编码、无后端插拔接口，审批 Hook 无否决权 |
| ZeroClaw（Rust） | 77 | 记忆权威架构性相左（其 ADR-010 规定配置后端才是 curated memory 权威、外部连接器仅为 enrichment）；绕行方案失去 auto-recall；另有 DeepSeek DSML tool-call 坑（issue #11130 未关） |
| IronClaw（NEAR） | 62 | 安全成色全场最硬，但其安全策略双重封堵 localhost/IP 字面量 MCP 端点，与 PAT 默认内网拓扑结构性冲突（现行唯一解是数据层以公网域名 + TLS 暴露，与主权姿态相冲，非工作量问题）；且 Responses API 不支持交互式审批 |

结论：Hermes / QwenPaw / LangBot 三家以"配置 + 官方插件 + 薄旁路"可完成接入、不用动源码；ZeroClaw / IronClaw 卡在记忆权威与数据接入，被迫源码级。

## 2. 决赛对比（Hermes vs QwenPaw，2026-10-21）

**裁定：阶段一选 Hermes。** 四条胜因全压阶段一命门：

1. **契约面稳定**：Hermes 是文档化 Runs API + MCP 双向；QwenPaw 大半可编程面靠无稳定性承诺的前端同源 API——在其上沉淀契约等于把地基浇在沙上。
2. **记忆治理闸现成**：Hermes 全配置级审批门 + MemoryProvider 槽位；QwenPaw 须自研 Memory 后端插件，且 ReMeLight 静默回落的文档矛盾未裁决。
3. **失败模式已知 vs 未知**：Hermes 的记忆事故全有尸检与 issue 编号、可逐条设防；QwenPaw 的 Auto-Dream 曾静默失败 45+ 天、471 次报错零告警——会静默说谎的系统会污染阶段一要沉淀的经验数据本身。
4. **常驻运维成色**：Hermes 一键服务化 + 快照回滚升级；QwenPaw 无服务化命令、升级为重装式。

决赛新实证：Nous Research 已公司化（累计融资约 1.58 亿美元，2026-10 完成 9000 万美元 B 轮），但主开发者占 top-100 提交的 50.9%，个人集中度靠公司体量对冲；QwenPaw 贡献分布健康（第一名 11.2%），但仓龄仅 8 个月、内部优先级可变，其记忆系统在公开社区查不到一手好评、只有问题报告。QwenPaw 记忆默认态更正：Auto-Memory 与 Auto-Memory-Search 默认关，只有 Auto-Dream 默认开（恰是出事最多的一个）。

**翻盘条件**（触发任一则重开决赛）：① 中国 IM 入口成为承重需求；② 工作台形态优先于节点形态；③ 安全权重压倒一切且冒烟验真 QwenPaw 沙箱；④ Markdown 文件原生记忆升为一票项；⑤ Hermes 自学习事故在冒烟中复现，或 Nous 把关键能力移出开源仓。

- 注记（2026-10-21 频道核查后）：条件①分量已下调——Hermes 官方 Gateway 适配器共 28 个，中国系（钉钉/飞书/企微/微信 iLink/QQ/腾讯元宝）覆盖面与 QwenPaw 打平，差异只剩打磨深度。另：QwenPaw 的原生 MQTT 只认单 topic + 文本载荷，结构化事件总线照样要桥，"MQTT 直连"一条不足以单独翻盘。

## 3. 结论与替补纪律

- **阶段一节点：Hermes**。接入按 `platform/hermes-adjustments.md` 推进，配置姿态见 `platform/hermes-config-spec.md`。
- **替补顺位：QwenPaw → LangBot**。Hermes 冒烟暴雷时按顺位启用替补，不重开选型。
- 观察池中的框架类（LangGraph / Microsoft Agent Framework / Agno 等）属阶段二底座议题，与本记录的成品选型不在同一层，不参与本顺位。
