> 状态：定稿（调研记录）
> 维护线：共享记忆线
> 最后更新：2026-10-26
> 摘要：社区调研：跨厂商共享记忆的社区讨论、实践形态与共识总览。

# 跨厂商智能体共享长期记忆：技术社区调研（2025–2026）

> 调研时间：2026-10-18。覆盖 Hacker News（Algolia API 全量检索 story＋comment）、Instagram/Threads/Facebook（social.search）、公开博客与对照评测。**明确缺口**：Reddit 的 JSON 搜索接口返回 403（现需 OAuth），Reddit 内容未能覆盖；X/Twitter 帖子在 web search 中无返回，X 侧为空；Lobsters 搜索无有效信号。HN 页面直接抓取被 419 拒绝，但评论全文已通过 Algolia items API 拿到。

---

## 一句话结论

社区里**没有出现一个被公认的"跨厂商共享记忆"标准方案**。最接近共识的是两条路线：① **MCP memory server 作为事实上的互操作插头**（任何 MCP 客户端都能接同一个记忆服务，但 recall 全靠模型自觉调用、并发写入有坑）；② **文件即协议**（本地 .md/JSONL/Git 仓库做跨 agent 共享载体，OACP、Letta MemFS、RxAI AMP 都在往这走）。厂商原生记忆（ChatGPT memory、Claude auto memory、Codex memory）各自为政、互不相通——社区共识是"想跨厂商，就得把记忆层放在厂商之外"。

---

## 一、社区实际推荐/讨论的方案（按社区热度与情绪）

### 1. MCP memory server（官方 `@modelcontextprotocol/server-memory`）— 提及最多，情绪"入门好、生产要魔改"
- 本地 JSONL 知识图谱，任何 MCP 客户端（Claude Code、Codex、Cursor、ChatGPT Developer mode）都能接同一个 server，是目前**跨厂商成本最低的共享记忆**。
- HN 高赞 war story 指出其致命缺陷（见第二部分）：多 agent 并发写会 read-modify-write 互相覆盖，且无报错。
- memoryrouter.ai 的横向对照表评价："Trying MCP memory for free on one machine in one client"；"You run it per machine. No sync, no dashboard, and recall depends on the model calling the tools."
- 社区魔改实践：HN 用户用 sqlite 备份的知识图谱＋mcp-server-memory 的 tool schema；lorekeeper（开源 MCP memory server）被用于同时跑 Claude Code＋Cursor。

### 2. Mem0 / OpenMemory — 名气最大，情绪"好用但商业化后变味"
- 2024-09 Show HN 201pts 出道；2024-11 出过 Chrome 扩展实现 **ChatGPT/Claude/Perplexity 三家共享记忆**（用户痛点原文："constantly re-explaining our context across platforms"）。
- 提供官方 OpenMemory MCP server，可跨 MCP 客户端共享；Apache-2.0。
- 批评集中三点：① 最强的 graph memory 被移到 $249/mo 的 Pro 付费墙后（独立 benchmark 作者原话）；② OSS 版在 LongMemEval 独立测试只有 ~32–49%（官方自称 managed 版 93.4%）；③ Ask HN（2026-02）："Mem0 stores memories, but doesn't learn user patterns"——只存不学。
- Mem0 的 `user_id/agent_id/run_id` scoping 天然支持多 agent 隔离，但"共享"需要你自己设计 namespace。

### 3. Letta（前身 MemGPT）— 情绪"适合长期运行的 agent，集成成本高"
- 卖点是 agent 自己管理记忆（stateful agents，core/archival 分层），memory blocks 可在 agents 间共享。
- **重要转向**：Letta 文档现在推荐 **git-backed shared memory repositories（MemFS）** 而不是共享 memory blocks——和"文件即协议"路线汇合。
- 对照表评价："Integration complexity: High (full agent OS)"。

### 4. Zep / Graphiti — 情绪"检索质量好，但 SaaS 化赶客"
- Temporal knowledge graph（带时间有效期的图），LongMemEval 63.8%，社区口碑是三家里时间推理最强的。
- **2025-04 Zep 停止维护自托管 Community Edition**，开源工作只剩 Graphiti——社区对 vendor lock-in 警惕，自托管派转向 Graphiti。

### 5. 文件派（社区个人实践者最爱，零依赖、跨厂商天然成立）
- **OACP**（github.com/kiloloop/oacp，HN 2026-05-26 高赞评论）：作者同时跑 **Claude Code/Codex/Cursor/Gemini 四个运行时**，痛点是"Codex 怎么向 Claude Code 要 PR review"。方案：纯本地文件——每 agent inbox/outbox＋typed YAML 消息协议＋review 循环状态机；记忆分三层（项目内共享 .md：project_facts/decision_log；org 级 wrap-up 事件＋每日 synthesis 去重提升；多机用 GitHub 同步 curated memory）。Apache-2.0。这是本次调研里**最贴合"不同厂商智能体共享记忆"问题的实战方案**。
- **deja**（HN 2026-09-07）：把 19k 个真实 `~/.claude`＋`~/.codex` 会话做跨 agent 检索基准，plain BM25，hit@1 只有 18/100——说明"冷启动跨会话找回"是真难题，数字很 brutal。
- **brAIn**：单文件 `agent.brain` 本地跨 agent 语义记忆原型。
- Modulus / Agent Mesh / LedgerSync / Engram：一堆 2026 年的 Show HN（1–4 pts），基本没水花——说明"多 agent 共享记忆"创业方向热闹但没跑出共识产品。

### 6. 托管型"一个记忆给所有 App"（情绪谨慎：lock-in＋隐私）
- **MemoryRouter**（$20/mo）：one vault 跨 Claude/ChatGPT/Cursor/Claude Code/Codex，MCP＋OAuth per-vault scope。
- **Pryzm Memory**：dev.to 实战帖演示 ChatGPT 存、Claude 取的完整流程。
- **AI Context Flow**：浏览器扩展＋MCP，自称 4000+ 用户、覆盖 ChatGPT/Claude/Gemini/Grok/Perplexity。
- 社区对这类 SaaS 的态度：能用，但记忆这种高敏感数据放第三方是硬伤。

### 7. 其他被点名的
- **Supermemory**（MCP-native，有 coding agent 插件，explicit forgetting）、**Hindsight Memlake**（本地 Mac Mini 跑，IG reel 演示 Hermes/Claude/Codex 共享）、**mcp-memory-service**（SQLite 自托管，MCP＋REST）、**Cognee**（本地知识图谱）、**Redis Agent Memory Server**（低延迟 working memory）、**LangMem**（LangChain 系）。

---

## 二、批评、War Stories、失败模式

1. **并发写入互相覆盖（最具体的 war story）**。HN 用户跑 8 个 agent 共享一个 MCP memory server 的 JSONL 知识图谱：多 agent 并行调 `create_entities`＋`create_relations` 时，经典 read-modify-write race——两次都读到同一旧状态、写回时第二次直接抹掉第一次，**无报错无警告，数据静默消失**；写一半被打断还会留下半截 JSON 行，下次 load 直接 parser 挂。修复靠 fork：async mutex 串行化＋atomic write（写 .tmp 再 rename）＋load 时 auto-repair。评论区 meta 观点：Erlang/OTP 的 GenServer 天然串行，这种 bug 在 BEAM 上根本不存在。
   - https://news.ycombinator.com/item?id=47368902（2026-03-13）
2. **接上记忆 ≠ 会用记忆（recall 是最大坑）**。Pryzm 实战帖原话："Models are lazy: if you don't tell them to check, they won't."——必须在 system prompt 里硬性规定每轮先查记忆。memoryrouter 对照表里**所有** MCP server 的"Watch out for"都是同一句："recall depends on the model calling the tools"。
3. **知识图谱维护负担＋poisoning 难诊断**。HN 用户："I have to push the agent to maintain an organized graph"；"The kg has some design limits that make poisoning hard to diagnose"。
   - https://news.ycombinator.com/item?id=49522604（2026-09-01）
4. **向量/图 hype 的反弹**。"Everyone's trying vectors and graphs for AI memory. We went back to SQL"（2025-09-22，136pts/63c）：社区认为向量检索噪声大、图难维护，Postgres（pgvector＋FTS）够用。独立测试佐证：deja 19k 会话 BM25 hit@1 仅 18/100；另一用户自测 BM25 61% vs semantic 37%。
   - https://news.ycombinator.com/item?id=45329322
5. **厂商原生记忆各自为政**。locul.ai FAQ（2026-10）原话："ChatGPT memory lives in your ChatGPT account and Claude memory lives in your Claude account, and **neither reads the other**… If you use both, you are maintaining two memories **unless you put a shared memory layer outside both of them**." Claude Code 的 auto memory 也只活在 `~/.claude` 里。
6. **商业化过程中的信任损耗**：Mem0 graph memory 进 $249 付费墙；Zep 砍自托管社区版。社区情绪：记忆层一旦被单厂商 SaaS 绑架，就违背了"跨厂商"的初衷。
7. **A2A 协议推进不顺**。OpenAI 拒绝了一个 1200 行的社区 A2A PR（2025-10-30）；Google 2026-08 把 A2A 移入 Agentic AI Foundation（Linux 基金会），但 HN 热度很低（7pts/0c）。注意 A2A 管的是 agent 间**通信**，不是记忆共享本身。

---

## 三、新兴共识与标准（社区指向）

1. **MCP 是事实上的互操作层**。edgex11《One Memory, Every Agent》原话："Since the Model Context Protocol became the common plug… Any compliant client — Claude, Claude Code, ChatGPT, Cursor — can call the same memory server **without a bespoke integration for each one**." 该文还给出两个关键设计原则：① **记忆绑定身份而非传参**（登录时定死 user/tenant，agent 不能自己传——"an argument an agent can set is an argument an agent can set wrong"）；② tool surface 要小（search/ask/write/inspect ontology），面大了 agent 会用错。
   - https://www.edgex11.com/blog/one-memory-every-agent.html
2. **"文件即协议"正在成为跨 agent 共享的务实标准**：OACP（YAML＋.md）、Letta MemFS（git-backed memory repos）、RxAI AMP（GitHub Issues 当记忆载体，每条记忆记录 who-sent-to-whom）。文件的好处：人类可读、可审计、git 有历史、跨任何厂商。
3. **"连接是周末工作，治理才是产品"**（edgex11 原话："Connecting every agent to one memory is a weekend of protocol work. Governing it is the product."）——provenance（谁写的）、scope（谁能读）、verified erasure、双向一致（assistant 写的 agent 能读，agent 学的下次人问也在）。
4. **A2A**：名义上的跨厂商 agent 通信标准（Google→Agentic AI Foundation），但社区实战极少，更多是概念验证（如 Medium 上 Claude/GPT/Muse 三 agent 经 A2A＋共享 workspace 的手工 mesh）。
5. **三层记忆架构**是个人实践者的共识（transient scratchpad / episodic fact store / documentation 层），但这是单 agent 内的设计，不是跨厂商标准。
6. 另有一份 HN 上的 **RFC《open AI consent standards》**（2025-11-18）：主张训练数据诉讼、agent 安全漏洞、user lock-in 都是架构问题，试图定四个开放标准——概念阶段，无落地。
   - https://news.ycombinator.com/item?id=45966910

---

## 四、关键帖子索引（均实际检索到，未虚构）

### Hacker News
| 日期 | 帖子 | 说明 |
|---|---|---|
| 2024-09-04 | https://news.ycombinator.com/item?id=41447317 | Show HN: Mem0（201pts/61c）出道帖 |
| 2024-11-04 | https://news.ycombinator.com/item?id=42042401 | Mem0 浏览器扩展：ChatGPT/Claude/Perplexity 共享记忆 |
| 2025-03-07 | https://news.ycombinator.com/item?id=43294974 | Letta（121pts/22c） |
| 2025-04-10 | https://news.ycombinator.com/item?id=43639875 | A2A Protocol 发布 |
| 2025-09-22 | https://news.ycombinator.com/item?id=45329322 | 向量/图 hype 反弹：我们回到了 SQL（136pts/63c） |
| 2025-10-30 | https://news.ycombinator.com/item?id=45766384 | OpenAI 拒绝社区 A2A PR |
| 2025-11-18 | https://news.ycombinator.com/item?id=45966910 | RFC: open AI consent standards |
| 2026-02-04 | https://news.ycombinator.com/item?id=46891715 | Ask HN: Mem0 只存不学用户 patterns |
| 2026-02-18 | https://news.ycombinator.com/item?id=47059237 | LedgerSync：跨 agent 共享记忆协议（Show HN） |
| 2026-03-01 | https://news.ycombinator.com/item?id=47204884 | brAIn：单文件本地跨 agent 记忆原型（评论） |
| 2026-03-07 | https://news.ycombinator.com/item?id=47292101 | Modulus：多 coding agent 共享 project memory |
| 2026-03-13 | https://news.ycombinator.com/item?id=47368902 | **8-agent war story：MCP memory server 并发写覆盖** |
| 2026-04-01 | https://news.ycombinator.com/item?id=47602485 | Engram：Claude Code 泄漏后做的多 agent 记忆一致性层 |
| 2026-04-05 | https://news.ycombinator.com/item?id=47648087 | Claude Code sub-agent 跨 agent 记忆机制剖析（评论） |
| 2026-05-13 | https://news.ycombinator.com/item?id=48128177 | AI agents with shared memory：我们公开了所有犯错 |
| 2026-05-26 | https://news.ycombinator.com/item?id=48283162 | **OACP：Claude Code/Codex/Cursor/Gemini 四运行时文件共享记忆**（评论，github.com/kiloloop/oacp） |
| 2026-06-25 | https://news.ycombinator.com/item?id=48675630 | lorekeeper MCP memory server 同时跑 Claude Code＋Cursor（评论） |
| 2026-08-18 | https://news.ycombinator.com/item?id=49353146 | Google 把 A2A 移入 Agentic AI Foundation |
| 2026-09-01 | https://news.ycombinator.com/item?id=49522604 | sqlite 知识图谱＋mcp-server-memory：poisoning 难诊断（评论） |
| 2026-09-07 | https://news.ycombinator.com/item?id=49599968 | **deja：19k 会话跨 ~/.claude＋~/.codex 检索基准**（评论） |

### 博客 / 对照评测
- https://www.edgex11.com/blog/one-memory-every-agent.html — One Memory, Every Agent（MCP 互操作＋身份绑定＋治理）
- https://dev.to/pryzm_memory/your-ais-dont-talk-to-each-other-heres-how-to-give-them-one-shared-memory-in-2-minutes-2pg7 — Pryzm：ChatGPT 存→Claude 取实战（2026-10）
- https://medium.com/@ferrari.francesco.m/three-agents-one-protocol-wiring-claude-gpt-and-muse-together-over-a2a-54debb73b407 — Claude/GPT/Muse 经 A2A＋共享 workspace（2026-10）
- https://amp.rxai.com.au/compare.html — RxAI AMP vs Mem0/Zep/Letta/MCP memory server 对照表（含"Sharing between agents"行，checked 2026-09-24）
- https://memoryrouter.ai/mcp — MCP memory server 横向对照（官方 server / Basic Memory / mcp-memory-service / Mem0 MCP / Supermemory / MemoryRouter）
- https://locul.ai/blog/give-your-ai-memory-that-lasts — "ChatGPT and Claude do not share memory…" FAQ（2026-10）
- https://dev.to/plur9/mem0-vs-letta-vs-zep-which-should-you-use-for-agent-memory-1n8m — Mem0 vs Letta vs Zep 对比（2026-07）
- https://medium.com/@unibase/best-ai-agent-memory-tools-in-2026-9-options-compared-eb3c8a3d4bb7 — 2026 九款 agent 记忆工具对比
- https://dev.to/everest_an/-i-benchmarked-ai-agent-memory-in-2026-and-the-numbers-tell-a-different-story-than-the-marketing-2ae4 — 独立 benchmark：Mem0 OSS 32–49%、Zep 63.8%、本地 Awareness 96%
- https://plurality.network/ai-context-flow/ — AI Context Flow（浏览器扩展＋MCP，号称覆盖 ChatGPT/Claude/Gemini/Grok）

### 社交媒体（Instagram/Threads）
- https://www.instagram.com/reel/DdQ9G4Vokfn/ （2026-09-14）— "I gave all my AI agents one brain. ChatGPT, Claude and Codex now share the same memory."
- https://www.instagram.com/reel/DeiEC-fvGvF/ （2026-10-15）— Hindsight Memlake 本地共享记忆演示（Hermes/Claude/Codex 接中央 shared brain）

---

## 五、给 PAT / 多 Agent 架构的直接启示（调研者注）

1. 用户 10-17 夜定的"**私有协议终止于固件、层间全开放**"方向与社区共识一致：跨厂商共享记忆的务实载体是**文件/开放协议**，不是某个厂商的 SaaS。
2. 社区 war story 验证了用户蓝图里的关键设计：**数据层只增不改**（JSONL 被并发覆盖的教训）、**工作记忆与数据层分离**（edgex11 的"治理才是产品"、OACP 的 curated memory 才同步）。
3. **写入冲突是真实坑**：多 agent 写同一记忆体必须串行化＋原子写＋可修复——用户架构里若有多个 agent 写同一数据层，需要显式设计。
4. **"模型懒得查"是真实坑**：共享记忆接上了，agent 不一定用——需要 hook/skill/启动注入保证 recall 发生（OACP 的 wrap-up skill、RxAI 的 lifecycle hooks 都是解法）。
5. A2A 目前**不值得**作为记忆共享的依赖：管通信不管记忆，且 OpenAI 不接、社区实战极少。
