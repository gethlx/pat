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

---

# 第二轮深度调研（2026-10-17）：Orbital 设计参考 + 漏网候选 + "改"而非"换"

## 一、Orbital 可借鉴的设计点（zqiren/Orbital，886★，GPL-3.0，桌面端项目 Agent）

定性：**不列入候选**——它是给本地 coding agent 用的编排平台（daemon、浏览器 profile、凭证管理），不是薄 MCP 记忆服务。但上下文工程有 5 条可直接偷：

1. **四件套上下文 schema**（PROJECT_STATE.md / DECISIONS.md / LESSONS.md / INDEX.md，每件带 token 上限）：工作记忆的 thread 命名空间固定这四个槽位（现状/决策/经验/导航），agent 按类型写入，不再是一个不透明大 JSON；读取时按需取槽位，省 token。
2. **强制 Completed/Blocked 闭环**（queue.json：每项任务必须有 verdict，不许无声消失；Blocked 必须带 reason）：工作记忆的任务账本每条目强制终态；agent stall/crash 时由 janitor 按心跳超时强制标 Blocked + reason，杜绝悬空任务。
3. **Append-only 事件日志**（sessions/{id}.jsonl，file lock，只在 compaction 时可改）：工作记忆的写入走 append-only 日志（who/when/key），读走最新快照；天然审计 + lineage，直接支撑确权 thesis 的"谁干的"举证。
4. **确定性 compaction/demote**（token cap 触发 oldest-cold → ARCHIVE 按需读；STATE 是覆盖式便签不是 changelog；LESSONS 永不 word-trim；compaction 是确定性规则、不调 LLM）：TTL 之外加第二条纪律——thread 记忆超预算时确定性 demote 冷条目到归档（可按需读回），不让 LLM 自己决定删什么；可预测、省钱。
5. **Prefix-cache 友好的分层结构**（system prompt 拆 static/semi-stable/dynamic 三段，~95% prefix cache 命中）：工作记忆 payload 排序——稳定部分（任务目标、原则）在前、动态部分在后；多 agent 轮流读取时 provider prefix cache 命中率高，直接省 token 成本。

## 二、新候选硬数据 + 贴合度（2026-10-17 核验）

### 候选 A：po4erk91/thread-keeper（本轮最大发现）

- stars/forks：13/4；License：**MIT**（实读）；最新 commit：2026-10-16；近 90 天非常活跃（314 commits 累计，37 releases）
- 宣称"多 agent 共享 brain，thread 作用域"**属实**（one set of threads, one SQLite store）；跨 CLI signaling（broadcast/whisper/inbox/wait/ask/respond）属实
- retention 是按表配置的旋钮（`THREADKEEPER_TASK_RETENTION_DAYS=30` 默认，`DIALOG/SIGNAL/EVENTS` 默认 keep-forever 需手动开）+ thread-janitor（idle 30 天自动关）；**无记录级乐观 409**（靠 DB WAL）
- 包袱：附带整套 skill/learning-loop 平台（可关）；bus factor：单人（po4erk91）
- 贴合度：任务作用域**贴合**；轻量自托管**部分贴合**（SQLite 零配置是优点，平台包袱是缺点）；MCP 原生**贴合**；并发**部分贴合**；TTL**部分贴合**（旋钮现成，需配）；License **贴合（MIT 最干净）**

### 候选 B：mathomhaus/guild

- stars/forks：301/46；License：**Apache-2.0**（实读）；最新 commit：2026-10-10；近 90 天活跃但放缓
- **三种写表面对应三种生命周期**是全场最优雅的 TTL 设计：`quest_journal`（本 quest 的 scratchpad，quest 清除即消亡=天然 TTL）、`lore_inscribe`（按 kind 自动过期：research 30 天、decision 180 天）、`quest_brief`（session 交接）
- 并发是 atomic claim（锁语义），不是乐观 409；quest 隐喻偏 coding agent，通用化需改造；bus factor：单人
- 贴合度：任务作用域**贴合**；MCP 原生**贴合**；TTL**贴合**（最优雅）；并发**部分贴合**；License **贴合**

### 候选 C：modiqo/waggle（设计参考级，只偷思想不引入）

- stars/forks：646/70；License：Apache-2.0（另有 MIT 双许可）；**最新 commit 2026-07-20，已 stale 近 3 个月**
- 它不是工作记忆 store，而是**引用层**：~30 字节的 attributed token（Ed25519 签名、content-addressed 不可变快照、supersede/revoke 带 lineage、按消费者给不同 projection、读计数审计、payload-free append-only 日志）——正是我们"存指针不存本体"的工业级实现
- 但无 thread scratchpad、无 TTL，且已 stale → **只偷设计，不引入**

### 本轮排除的

- `AllenMaxi/ContextGraph`（22★）：实质 demo 级，信号太弱
- `pc035860/scratchpad-mcp`（5★）：周末项目量级，无 retention/TTL 设计
- `parcadei/Continuous-Claude-v3`（3946★）：单 agent session 管理，非多 agent 共享
- `genpark-blackboard`（7★）：仍太新

## 三、"改"而非"换"：最小改动清单

### A. alex-feel/mcp-context-server（改动量最小）

- **补 TTL（小，约 1–2 天）**：models/schemas 加 `expires_at` + migration；读路径 lazy 过滤过期；`store_context` 加 `ttl_seconds` 参数；thread 关闭钩子删 thread
- **补乐观 409（小–中）**：加 `version` 整数列；写路径接受 `expected_version` 不匹配抛错；`errors.py` 新增 `VersionConflict` 映射 MCP 错误
- License：Elastic 2.0 允许修改、私密自用；**禁止**托管服务给第三方；未来 SaaS 变现需买商业许可或重写

### B. thread-keeper（配置级，几乎零代码）

- 已有 `THREADKEEPER_*_RETENTION_DAYS` 旋钮 + retention daemon + thread-janitor：把默认 keep-forever 改成任务型默认值即得 TTL
- 关掉 learning loops/curator/evolve daemons，只留 thread + signaling + retention
- 补 409 需加 version 列（小改动）；**MIT：随便改、自用商用变现全 OK**

### C. guild（改造成本中，从略）

- 加通用 scratch kind（默认 7 天）属中等改动；但把 atomic claim 改成乐观 409 会动核心语义；Apache-2.0 完全自由

## 四、合并两轮的最终候选排序

| 档位 | 候选 | 一句话理由 |
|---|---|---|
| **首选** | **po4erk91/thread-keeper** | MIT 最干净；thread 作用域 + retention 旋钮 + agent 间 signaling 全现成；314 commits 且昨天还在提交——"开箱即用度 × License × 活跃度"综合最高；代价是附带 learning-loop 平台（可关）+ 单人维护 |
| 备选 1 | alex-feel/mcp-context-server | 最薄、最字面贴合"thread 共享上下文"；补 TTL+409 改动量最小；但 Elastic 2.0（变现需商业许可）+ 无 TTL + 仅 5 周历史且疑似迁移 |
| 备选 2 | mathomhaus/guild | Apache-2.0 + 301★；三种生命周期写表面是全场最优雅的 TTL 设计；但 quest 隐喻偏 coding agent，通用化改造成本中 |
| 设计参考（只偷思想） | waggle + agentrq Pano + Orbital 四件套 | waggle 的 attributed token 是"存指针不存本体"的标准答案；agentrq Pano 的"乐观 409 + 30 天 TTL"与需求同构；Orbital 的四件套 schema/强制闭环/append-only 日志/确定性 demote/prefix-cache 分层可直接借鉴；三者都不引入（waggle stale、agentrq AGPL 整平台、Orbital GPL-3.0 太重） |
| 不推荐 | anulum/synapse-channel | AGPL + 方向错配（coding agent 舰队协调总线）+ 社区信号极弱（1★） |
| 对照（长期记忆） | RMANOV/sqlite-memory-mcp | MIT 最干净但场景是长期记忆知识图谱，与工作记忆错位；留作记忆侧对照 |

**关键风险再提示**：
1. Bus factor：除 agentrq 有公司主体外，其余全单人维护；首选 thread-keeper 也是单人。
2. 首选的功能包袱：thread-keeper 的 learning loops 默认开启，启用时必须先关，否则"薄层"变"平台"。
3. License 与变现 thesis 挂钩：MIT（thread-keeper）/ Apache-2.0（guild）未来变现无障碍；Elastic 2.0（alex-feel）变现需商业许可——若 thesis 走向"记忆层变现"，首选的 MIT 是加分项。
4. waggle 的 stale 警示：646★ 也会停更，**选型看 commit 曲线不看星数**。

---

**调研结论，待用户与其他 Agent 联合评估后定夺。**（两轮报告只做调研与候选比对，未做任何启用/安装/采购动作。）
