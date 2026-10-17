# 工作记忆层候选方案深度调研报告

- 核验日期：2026-10-17
- 用途：PAT 项目"多 Agent 共享工作记忆"薄层选型（只调研、不启用）
- 需求画像：任务作用域（thread/workflow ID）、短命（TTL）、小载荷、MCP 原生、轻量可自托管、乐观并发；明确排除长期记忆与原始音视频存储

## 一、硬数据表（2026-10-17 核验）

| 维度 | alex-feel/mcp-context-server | anulum/synapse-channel | agentrq/agentrq | RMANOV/sqlite-memory-mcp |
|---|---|---|---|---|
| GitHub | alex-feel/mcp-context-server | anulum/synapse-channel | agentrq/agentrq | RMANOV/sqlite-memory-mcp |
| stars / forks | 9 / 6 | 1 / 0 | 1160 / 85 | 18 / 4 |
| open issues | 0 | 0 | 0（search_issues 复核确认；疑为快速 triage 或 discussions 分流） | 0 |
| open PRs | 1（#104，2026-07-02 的 release-please 残留，stale） | 0 | 2（#944 10-16，#649 09-21） | 1（#17，09-13 的测试 PR，stale） |
| License（实读 LICENSE 文件） | **Elastic License 2.0**（v3.0.0 起；≤v2.2.2 为 MIT） | **AGPL-3.0-or-later**（另售商业许可） | **AGPL-3.0-only**（另售商业许可；CLI/插件为 Apache-2.0） | **MIT** |
| 最新 commit | 2026-10-16 | 2026-10-15 | 2026-10-17（当天发 v0.12.0） | 2026-10-15 |
| 近 90 天活跃度 | 活跃（30 commits；但仓库提交历史仅从 2026-09-09 开始，约 5 周） | 活跃（作者提交 + dependabot 批量 bump） | 非常活跃 | 活跃 |
| 主要作者（bus factor） | alex-feel（+ sync-bot）——单人 | anulum（Miroslav Šotek，PyPI 署名）——单人 | mustafaturan、Vladexy88x；公司主体 Contextual, Inc.——相对最健康 | RMANOV——单人 |
| 语言/形态 | Python，FastMCP server | Python，ws hub + CLI + cockpit | Go 后端 + Vue 前端 + Electron 桌面端（全栈平台） | Python，FastMCP micro-servers |
| 自托管 | SQLite 默认零配置；Docker/K8s 可选；PostgreSQL 可选 | pip 安装本地 hub（local-first） | 自托管（self-hosted 为卖点） | 单 SQLite 文件本地运行 |

备注：
- alex-feel 仓库的 PR 编号（#129–#132）与提交历史（9 月起）对不上，且 #104 是 7 月的 release-please 残留——历史疑似重建/迁移过，v3.0.0 的"成熟度"要打折看。
- synapse-channel 的 GitHub 信号（1 star / 0 fork，2026-06-21 建库）与其 PyPI（已发版 0.99.5、有文档站、dev.to 长文）严重不匹配——社区基本盘在 GitHub 之外，不明。

## 二、宣称 vs 实际（实读 README）

### 1. alex-feel/mcp-context-server
- 宣称"多 agent 同一任务经 thread ID 共享上下文"：**属实**。`store_context` 按 thread 作用域，`list_threads` 工具，16 个 MCP 工具，MCP Registry 收录。
- 但它是 **persistent** 存储：README 全文无 TTL/过期机制（代码 grep 确认仅有一处 "settled" 误命中）。
- 并发靠数据库层（SQLite WAL / PostgreSQL MVCC），**无记录级乐观版本/409 语义**。
- 功能面比"薄层"重：FTS5/语义/混合搜索、per-record 访问控制、PostgreSQL RLS、LLM 摘要——但默认 SQLite 下多余功能可关。

### 2. anulum/synapse-channel
- 黑板确实存在：plan ledger + progress ledger（有界，防单 agent 灌爆），任务可原子 handoff。
- 但它是**编码 agent 舰队的协调总线**：claim/租约、git 文件作用域、治理/审计/联邦/cockpit——为"本地多 coding agent 改同一仓库"设计，不是为"异构云端 agent 共享便签"设计。
- 并发=**租约制**（lease + epoch + fencing），crash 安全但语义是"互斥"，不是我们要的乐观并发。
- MCP（`synapse mcp` stdio）与 A2A bridge 都是**边缘 adapter**，核心是自家 ws hub + CLI。

### 3. agentrq/agentrq
- Pano（共享 markdown 文档板）就是"工作记忆便签纸"形态：**每个 doc 默认 30 天自过期**（可延长），**乐观并发、stale write 返回 409**——并发模型与 TTL 语义与我们需求完全同构。
- 但它是**整套人机协作平台**（任务管理、排期、语音转写、live terminal、桌面端），引入=引入一个平台，不是引入一个薄层。
- 对 agent 的工具面（pano 读写等）是平台附带能力。

### 4. RMANOV/sqlite-memory-mcp（对照组）
- 本质是**长期记忆知识图谱**（entities/observations + provenance 治理），multi-agent 体现为"多 MCP client 读写同一 SQLite 文件 + bridge 跨机同步"，另有 debate 协议（conductor/executor/devil's advocate）。
- 有 session 快照与 task CRUD，但**无 thread 作用域语义、无 TTL**——是记忆资产，不是工作便签。
- MIT 许可最干净；单文件轻量。

## 三、逐项评估（按我们的用例）

a) 任务作用域的共享工作记忆（核心）
- alex-feel：**贴合**——thread ID 作用域是其第一性设计，工具面兑现。
- synapse-channel：**部分贴合**——blackboard 是"计划账本"不是任意上下文便签，且与整套协调机制耦合。
- agentrq（Pano）：**贴合**——共享文档板形态即工作记忆，带 TTL。
- sqlite-memory-mcp：**不贴合**——知识图谱=长期记忆，场景错位。

b) 轻量可自托管
- alex-feel：**贴合**——SQLite 默认零配置。
- synapse-channel：**部分贴合**——pip 单 hub 可跑，但功能面是平台级。
- agentrq：**不贴合**——全栈平台，引入成本过高。
- sqlite-memory-mcp：**贴合**——单 SQLite 文件，micro-servers 按需取用。

c) MCP 原生程度
- alex-feel：**贴合**——FastMCP，16 tools，Registry 收录。
- synapse-channel：**部分贴合**——MCP 只是边缘 adapter。
- agentrq：**部分贴合**——有 agent 工具面，但平台优先。
- sqlite-memory-mcp：**贴合**——FastMCP，9 核心 tools 兼容官方 server-memory。

d) 并发模型
- alex-feel：**部分贴合**——DB 级 WAL/MVCC，无记录级乐观版本。
- synapse-channel：**部分贴合**——租约+epoch（互斥语义，非便签语义）。
- agentrq：**贴合**——乐观并发，stale write 409，无锁（正是我们要的模型）。
- sqlite-memory-mcp：**部分贴合**——WAL 多写，无版本冲突语义。

e) TTL/短命机制
- alex-feel：**不贴合**——persistent 设计，需外部约定（thread 结束调 delete）或自建 sweeper。
- synapse-channel：**部分贴合**——lease 有过期，但那是租约过期≠记忆过期；TTL advice 仍在实验层。
- agentrq：**贴合**——doc 默认 30 天自过期。
- sqlite-memory-mcp：**不贴合**——无 TTL 概念。

f) License 对私密项目是否友好
- alex-feel：**部分贴合**——Elastic 2.0：个人/内部/商业自用免费；**禁止**未经商业许可向第三方提供托管服务。PAT 私密自用无碍；但用户 thesis 涉及未来数据变现，若把记忆层做成 hosted 服务需买商业许可（联系 alexfeel@protonmail.com）。
- synapse-channel：**不贴合**——AGPL-3.0，网络使用触发 copyleft；商业许可 pay-what-you-want（CHF 9.99 起）。
- agentrq：**不贴合**——AGPL-3.0-only；商业许可来自 Contextual, Inc.。
- sqlite-memory-mcp：**贴合**——MIT，最干净。

## 四、综合排序与推荐

- **首选：alex-feel/mcp-context-server**——唯一把"thread 作用域多 agent 共享"当第一性设计的，MCP 原生、SQLite 零配置自托管。代价是 Elastic 2.0（私密自用无碍，未来做 hosted 服务才需商业许可）与无 TTL（必须配"thread 关闭即删"的纪律，否则它会膨胀成第二个数据层——重蹈我们刚纠正的覆辙）。
- **备选 1：agentrq（只偷设计，不引入）**——它的 Pano 在并发模型（乐观 409）与 TTL（30 天自过期）上与我们需求同构，但整包是 AGPL 平台。建议把"409 + TTL"语义记下来，作为我们自建薄层或 wrapper 的设计输入。
- **备选 2：RMANOV/sqlite-memory-mcp**——MIT 最干净、足够轻，但场景是长期记忆；可作为"记忆侧"的对照/未来长期记忆层的候选，不适合工作记忆层。
- **不推荐：anulum/synapse-channel**——方向错配（coding fleet 协调总线）、AGPL、GitHub 社区信号极弱（1 star/0 fork）、单人维护；blackboard 概念可参考，整包引入是杀鸡用牛刀。

## 五、风险提示

1. **Bus factor**：四家中三家单人维护（alex-feel、anulum、RMANOV）；仅 agentrq 有公司主体+多贡献者。
2. **成熟度存疑**：alex-feel 仓库仅 5 周提交历史，PR 编号与历史对不上（疑似迁移/重建），v3.0.0 的"生产就绪"宣称打折；四家近 90 天都活跃，短期停滞风险低，但 alex-feel 与 synapse 的长期维护取决于单人。
3. **架构 mismatch**：alex-feel 是 persistent store，我们要短命层——必须用"thread 生命周期纪律"约束，否则重演"数据层臃肿"；synapse/agentrq 是平台级，引入会被反客为主。
4. **License 地雷**：Elastic 2.0 与 AGPL 都对"未来把记忆层做成服务变现"不友好；只有 MIT 的 sqlite-memory 是干净的，但它场景不贴。若未来变现，工作记忆层大概率要自研薄层（MIT/Apache-2.0）。
5. **第 5 候选**：本轮未发现更贴的。`alphaparkinc/genpark-blackboard-architecture-shared-memory-skill`（7 stars，MIT，黑板+MCP stdio）概念贴但太新太小，不列入；`mkc909/agent-communication-mcp-server` 偏企业重方案；`rinadelph/Agent-MCP` 是整套 mission-control 平台。

---

**调研结论，待用户与其他 Agent 联合评估后定夺。**（本报告只做调研与候选比对，未做任何启用/安装/采购动作。）
