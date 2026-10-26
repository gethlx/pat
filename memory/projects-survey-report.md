> 状态：定稿（调研记录）
> 维护线：共享记忆线
> 最后更新：2026-10-26
> 摘要：项目调研：跨厂商共享记忆开源项目全景与逐项核查记录。

# 跨厂商智能体共享长期记忆：项目与标准调研

> 调研日期：2026-10-18。所有 stars/license/最近提交均从 GitHub 实际读取（UTC 2026-10-19 数据视为同日）。
> 目标场景：Muse、Grok Bot、Claude、Codex 等**不同厂商的智能体**读写同一份长期记忆/上下文。

## 一、对比总表

| 项目 | 一句话 | 记忆类型 | 跨智能体共享方式 | 厂商中立？ | License | 成熟度 (★ / 最近提交) | 部署 |
|---|---|---|---|---|---|---|---|
| mem0ai/mem0 | Agent 的"记忆层"基础设施 | 语义（LLM 抽取事实） | REST API + SDK + MCP 插件（Claude Code / Cursor / Codex / Kimi） | ✅ 协议层中立 | Apache-2.0 | 67.4k / 2026-10-17 | 自建库 / 自建服务 / SaaS |
| supermemoryai/supermemory | Memory API＋图记忆＋连接器 | 语义＋图关系 | REST API + MCP 服务器 + 浏览器插件 | ✅ 协议层中立（但 SaaS 优先） | MIT（仓库级） | 31.3k / 2026-10-18 | SaaS 为主，自建文档存在但高阶功能收费 |
| doobidoo/mcp-memory-service | 轻量开源记忆后端 | 语义＋关键词＋知识图谱 | **REST API + MCP + OAuth + CLI**，明确"跨所有 agent 与 run 共享" | ✅ 明确跨框架 | Apache-2.0 | 2.0k / 2026-10-18 | 自建（SQLite/Chroma/Milvus） |
| akitaonrails/ai-memory | **专为跨厂商交接设计**（Claude Code↔Codex） | 情景（会话摘要）＋语义（可选）＋类型化交接单 | Rust 单二进制＋git 版本化 Markdown；20+ 种 agent harness 共享一份记忆；claim-once 交接协议 | ✅✅ **唯一原生跨厂商** | MIT | 10.6k / 2026-10-19 | 自建二进制，零 LLM 默认 |
| getzep/graphiti | 实时时序知识图谱 | 情景（带时间戳 episode）＋语义（实体关系）＋时序 | MCP 服务器 + REST 服务；任意 LLM 客户端 | ✅ 协议层中立 | Apache-2.0 | 32.0k / 2026-10-19 | 自建（需图数据库）/ Zep SaaS |
| topoteretes/cognee | AI 记忆平台 / 公司大脑 | 语义（三元组）＋情景（会话经验） | MCP 服务器 + REST API；文档/代码/工单统一入库 | ✅ 协议层中立 | Apache-2.0 | 32.5k / 2026-10-18 | 自建 / SaaS |
| volcengine/OpenViking | 字节火山引擎的 Agent 上下文数据库 | 记忆＋知识＋技能统一进 viking:// 虚拟文件系统 | MCP + Gateway 代理 + 多语言 SDK；Claude Code/Codex/Cursor/OpenClaw 原生集成 | ✅ 协议层中立 | AGPL-3.0 | 40.3k / 2026-10-19 | 自建 |
| TencentCloud/TencentDB-Agent-Memory | 腾讯云数据库团队的团队记忆枢纽 | 对话（L0–L3 四层蒸馏）＋Skill＋LLM-Wiki＋CodeGraph | Proxy + 插件 + HTTP/SDK；private/team/restricted/agent 四档可见性治理（团队分支 feat/server_team） | ✅ 协议层中立 | MIT（2026-10-20 已读 LICENSE 原文验证） | 29.7k / 2026-10-19 | 自建（Docker） |
| Tencent-Hunyuan/Hy-Memory | 混元三层全开源（记忆模型＋框架＋MemHub） | 聊天/工作/代码三条专用流水线 | MemHub 跨应用同步（Cursor/Codex 等 10 种工具） | ✅ 协议层中立 | Apache-2.0（2026-10-20 已读 LICENSE 原文核实；API 显示 NOASSERTION 系自定义文件头未被识别） | 988 / 2026-10-20 | 自建 |
| letta-ai/letta | 有状态智能体运行时（ex-MemGPT） | 核心记忆（常驻 prompt）＋归档记忆（分页调入）＋召回 | App Server 自建；是**完整 agent 框架**，不是可插拔记忆层 | ⚠️ 仅 Letta 生态内 | Apache-2.0 | 25.2k / 2026-10-18 | 自建 / SaaS |
| Agno | Agent 平台框架 | 会话存储＋用户记忆＋会话摘要（Postgres/SQLite/Mongo） | 只能经共享数据库在 Agno agent 间共享 | ❌ 框架内部 | Apache-2.0 | 42.8k / 2026-10-17 | 自建 |
| CrewAI | 多智能体编排框架 | 短期（ChromaDB）＋长期（SQLite）＋实体记忆＋上下文记忆 | 仅 Crew 内部；无跨 Crew/跨厂商共享（第三方评测明确指出此缺口） | ❌ 框架内部 | MIT | 59.9k / 2026-10-19 | 自建 |
| LangGraph | 图式 agent 编排 | Checkpointer（短期/线程）＋ BaseStore（长期，命名空间＋语义检索）＋ LangMem（语义/情景/程序性） | 仅 LangGraph 生态；PostgresStore 理论上可被外部读 | ⚠️ 生态内 | MIT | 43.5k / 2026-10-18 | 自建 |
| LlamaIndex | 数据编排框架 | Memory 类＋MemoryBlock（事实抽取/向量），会话作用域 | 仅 LlamaIndex 生态 | ❌ 框架内部 | MIT | 52.6k / 2026-10-14 | 自建 |
| microsoft/agent-framework | 微软 agent 框架 | Thread（对话线程）为主，无独立长期记忆存储 | A2A 互操作帮助器；记忆随线程，不跨厂商 | ❌ 框架内部 | MIT | 14.2k / 2026-10-18 | 自建 / Azure |
| google/adk-python | Google ADK | MemoryService：InMemory / VertexAiMemoryBank（LLM 抽取＋语义检索）/ RAG | 绑定 Google Cloud Agent Engine | ❌ Google 生态 | Apache-2.0 | 21.9k / 2026-10-19 | Google Cloud |
| OpenAI | Agents SDK Sessions 接口；ChatGPT 产品记忆 | 会话历史（SQLite/内存/Conversations API） | 仅 OpenAI 生态；ChatGPT 记忆是产品内功能 | ❌ 单厂商 | —（SDK 为 MIT，服务闭源） | — | OpenAI 云 |
| xAI | Grok 聊天记忆（beta）；Grok Build 项目记忆（2026-09） | 产品内记忆 | 无面向开发者的记忆 API | ❌ 单厂商 | — | — | xAI 产品内 |

> **结论先行**：目前**没有**一个被广泛接受的"跨厂商共享记忆"标准。现实中最接近厂商中立的路径是 **MCP 协议**——记忆服务以 MCP Server 形式暴露，任何支持 MCP 的智能体（Claude Code、Cursor、Codex、Gemini CLI、Grok 客户端……）都能读写同一份记忆。唯一**原生为跨厂商交接而设计**的是 ai-memory（akitaonrails）。

## 二、协议/标准：各自覆盖与不覆盖什么

- **MCP（Model Context Protocol，Anthropic → Linux Foundation）**：覆盖"agent 如何读写外部工具/数据"，是目前跨厂商记忆的**事实传输层**——mem0、supermemory、graphiti、cognee、mcp-memory-service 都提供 MCP 服务器。不覆盖：记忆的**语义标准**（每家自定 schema：fact/实体/交接单互不兼容）、访问控制标准、跨记忆服务同步。
- **A2A（Agent2Agent，Google → Linux Foundation，a2aproject/A2A ★26.2k，Apache-2.0，v1.0 于 2026-03）**：覆盖 agent↔agent 的发现、委托、异步任务。**明确不覆盖共享记忆**——规范非目标里写明不暴露对端的内部状态、记忆与工具。结论：A2A 解决"协作"，不解决"共用记忆"。
- **AG-UI（CopilotKit）**：agent↔前端应用的双向事件协议（流式渲染、用户交互同步）。不涉及 agent 间记忆共享。
- **ACP**：注意有两个同名物。① IBM BeeAI 的 Agent Communication Protocol——**已废弃，2025-08 并入 A2A**（原仓库归档）；② Zed 的 Agent Client Protocol（编辑器↔编码 agent 的 JSON-RPC 接口）。两者都不解决跨厂商共享记忆。
- **Agent Protocol（AI Engineer Foundation）**：标准化 agent 运行时的 REST API（thread/run/step），面向"客户端如何调用一个 agent 后端"。不定义记忆语义，不解决跨厂商记忆共享。

## 三、各项目明细

### 1. mem0ai/mem0（★67.4k / Apache-2.0 / 活跃）
Agent 记忆层：LLM 从对话中自动抽取事实，按 `user_id` / `agent_id` / `run_id` 组织；多信号检索（语义＋BM25＋实体匹配）。跨 agent 共享靠自建服务（REST）或 SaaS，任一厂商的 agent 经 SDK/MCP 插件读写同一 user_id 的记忆。局限：抽取质量依赖模型；事实更新需显式 add；用其 SaaS 即被其云锁定。

### 2. supermemoryai/supermemory（★31.3k / MIT / 活跃）
"Memory API"：图记忆＋连接器（Gmail/Drive/Notion/GitHub）＋浏览器插件＋MCP 服务器。同一 API 可被任何厂商 agent 调用。局限：本质是 SaaS 优先产品；自建文档存在但高级功能（SOC2/HIPAA）在高价档；有评测称"核心引擎专有、仅 SDK/CLI/MCP 开源"——仓库根 LICENSE 为 MIT，但生产部署前建议核对各组件实际授权。

### 3. doobidoo/mcp-memory-service（★2.0k / Apache-2.0 / 活跃）
明确为跨框架设计："Framework-agnostic REST API"、"Memory is shared across all agents and runs"。REST + MCP + OAuth + CLI + 看板；SQLite/Chroma/Milvus 可选；语义＋关键词检索＋知识图谱。局限：项目体量小（2k stars），长期维护与安全审计能力待观察。

### 4. akitaonrails/ai-memory（★10.6k / MIT / 极活跃，提交至 2026-10-19）
**本轮唯一原生回答"不同厂商智能体如何共享记忆"的项目**：Rust 单二进制，记忆以 git 版本化的 Markdown 文件为唯一真相源（非向量库镜像）；20+ 种 harness（Claude Code、Codex、Cursor、Gemini CLI、OpenCode、Grok、Devin、Kimi、Kiro…）喂同一份记忆；跨 agent 交接是类型化协议（有 owner、claim-once）；默认零 LLM（无 embedding 开销），语义搜索与 LLM 整合为可选项；支持跨项目画像。局限：聚焦**编码 agent 的任务上下文交接**（情景/工作记忆），不是通用语义事实库；较新，生态尚在形成。

### 5. getzep/graphiti（★32.0k / Apache-2.0 / 活跃）
实时时序知识图谱：每条事实记录"何时为真、何时失效"，擅长回答"当时什么是真的"。MCP 服务器＋REST 服务，支持多家 LLM。局限：自建需跑图数据库；写入时抽取消耗额外模型调用。

### 6. topoteretes/cognee（★32.5k / Apache-2.0 / 活跃）
把文档、代码、工单、agent 工作转成知识图谱＋向量检索，定位"公司大脑"（团队与 agent 共享记忆）。MCP＋REST 接入。局限：为文档型知识设计，简单聊天记忆场景偏重。

### 7. letta-ai/letta（★25.2k / Apache-2.0 / 活跃）
有状态 agent 运行时（MemGPT 后继）：核心记忆常驻 prompt、可自编辑，归档记忆按需调入。注意：代码主体已迁至 `letta-ai/letta-code`。局限：它是**一整套 agent 设计**，不是可插拔进别家 agent 的记忆层；跨厂商共享不在其设计目标内。

### 8–12. 框架内置记忆（Agno / CrewAI / LangGraph / LlamaIndex / Microsoft Agent Framework）
均为**框架内部**记忆：Agno（Postgres/SQLite/Mongo 会话存储＋用户记忆）、CrewAI（短期 ChromaDB＋长期 SQLite＋实体记忆，仅 Crew 内）、LangGraph（Checkpointer 线程记忆＋BaseStore 长期命名空间存储＋LangMem 的语义/情景/程序性三层，是框架里分层最完整的）、LlamaIndex（Memory＋MemoryBlock，会话作用域）、微软 Agent Framework（Thread 对话线程）。厂商中立 verdict：❌/⚠️——只能在同一框架的 agent 之间共享，想跨厂商用需自己把存储暴露成服务。

### 13. Google ADK / Vertex AI Memory Bank（google/adk-python ★21.9k / Apache-2.0）
MemoryService 三实现：InMemory（原型）、VertexAiMemoryBankService（Gemini 抽取关键记忆＋语义检索，生产级）、RAG 版。记忆按 app/user/session 组织。局限：深度绑定 Google Cloud Agent Engine，跨厂商中立性为零。

### 14. OpenAI（单厂商，备注）
Agents SDK 的 Sessions 接口（SQLite/内存/Conversations API 可插拔后端）；ChatGPT 产品记忆（偏好/事实）是产品内功能。无面向第三方的厂商中立记忆 API。

### 15. xAI（单厂商，备注）
Grok 聊天记忆（beta，2025-04 上线）与 Grok Build 项目长期记忆（2026-09-16 上线，自动抽取项目决策/规范）均为产品内功能；**未发现面向开发者的记忆 API**，跨厂商共享无从谈起。

### 备注：mem0ai/openmemory（★98 / MIT / 2026-07-29 后无更新）
同名但不同项目：把 AI 编码会话在 Claude Code/Codex/OpenCode 之间**搬运**的 CLI/TUI。体量小且近三月无提交，不建议作为记忆层选型；真正的 mem0 MCP 接入走 mem0 主仓库的插件/集成。

## 三之一、大厂开源记忆枢纽（2026-10-19 补充调研）

> 背景：此前"厂商把记忆当护城河"的格局正在被打破——字节、腾讯相继开源跨厂商记忆枢纽。以下数据均经 GitHub API / 官方报道核实。

### 16. volcengine/OpenViking（★40.3k / AGPL-3.0 / 极活跃，2026-10-19 仍在提交）
字节火山引擎 Viking 团队（此前长期维护 VikingDB 向量数据库）2026-01-05 开源，定位"Self-evolving Context Database for AI Agents"：把 Agent 记忆、知识 RAG、技能统一组织进 `viking://` 虚拟文件系统。核心设计：① 三层渐进加载（摘要→概览→详情，agent 先读摘要再决定展开，避免整库塞上下文）；② 目录级语义＋文本检索（范围可限定到某项目/记忆子树）；③ 会话沉淀自动把对话归档并抽成**可检查、可编辑的 Markdown 文件**（不是不可见的向量库）。跨厂商接入：Claude Code、Codex、Cursor、OpenClaw 原生集成，另有 MCP、Agent Plugin 1.0、多语言 SDK（Python/Go/TS）；2026-10-09 刚发布 **OpenViking Gateway**（beta）：记忆代理——改一个 base URL＋一个 key 即可接入，每轮自动检索并注入相关记忆、保存会话、抽取长期记忆，且按字节回放注入内容以保住 prompt cache。服务端支持多账号、用户级隔离、可选资源 ACL；浏览器端 OpenViking Studio 可视化浏览。
**局限/注意**：① License 是 **AGPL-3.0**（与腾讯的 MIT 形成鲜明对比）——网络服务场景下修改需开源，有商业化计划时必须评估传染条款；② 官方 benchmark 均为自报（LoCoMo token 降 34–91%、延迟降 58–66%；Claude Code/Hermes/OpenClaw 长期记忆准确率 24–57%→80%+），Gateway 尚无独立的 recall/token 实测；③ 安装偏重（Python 3.10+、Go 1.22+、embedding＋VLM 模型），是基础设施不是轻量库。

### 17. TencentCloud/TencentDB-Agent-Memory（★29.6k / MIT（多方报道）/ 极活跃）
腾讯云数据库团队 2026-05 开源，90 天破 2 万 star、多次 GitHub Trending 第一。定位"团队级记忆枢纽"：把对话、文档、代码变成四类可治理、可分配、可装配的**记忆资产**——Chat Memory（L0 原文→L1 原子→L2 场景→L3 画像四层蒸馏）、Skill（带版本/触发边界/验证规则的可复用流程）、LLM-Wiki（文档转结构化知识，思路致谢 Karpathy 的 LLM knowledge base 构想）、CodeGraph（代码符号与调用关系）。跨厂商接入：proxy 模式（agent 把 base URL 指向 proxy 即可，无需插件）＋插件；README 列出 Claude Code、Codex、OpenClaw、Hermes 及自家 CodeBuddy/WorkBuddy。治理是其最独特处：资产可见性分 private/team/restricted/agent 四档，默认私有、分享是显式动作，Memory Hub 控制面板管理归属/版本/装配。
**局限/注意**：① License 为 MIT（2026-10-20 已读 LICENSE 原文验证；GitHub API 显示 NOASSERTION 系腾讯自定义文件头未被识别）——之前"多方报道"的说法现已证实；② **形态分支差异**：README main 分支是个人记忆插件版（OpenClaw/Hermes 原生集成），LLM-Wiki/四档治理/Memory Hub 在 **feat/server_team** 团队分支（官方 Issue #1639 确认该分支含 Memory Hub、Proxy 等能力）——引用治理能力时须注明分支；③ Claude Code/Codex 的 proxy 接入见第三方报道，官方 issue 只明确插件＋独立服务部署；④ benchmark 为官方自报；⑤ 示例偏编码/开发工作流。

### 18. Tencent-Hunyuan/Hy-Memory（2026-10-16 发布 / Apache-2.0 / ★988，2026-10-20 数据）
腾讯混元 10 月 16 日发布，三层全开源：① 专用记忆模型 Hy-Memory-30B-A3B（约 30B MoE、激活 3B）；② 记忆框架（`pip install hy-memory`，默认 ChromaDB＋Kuzu，LLM/embedding 端点兼容 OpenAI 协议可自换）；③ MemHub 本地优先应用。**记忆分层是全赛道最细的**：chat 是 L0–L7 八层层级记忆（原始对话→原子事实→摘要→图式→前瞻意图），working 是"会话事实＋可复用经验"两层（经验须过价值阈值），coding 在 working 之上加代码版本演化差分链（记"为什么改"不只"改了什么"，存代码坐标而非粘贴代码）。MemHub 号称连接 Cursor、Codex 等 10 种 AI 工具做跨工具实时同步，"受治理的跨应用记忆召回"。
**局限/注意**：① 发布仅 4 天，**零独立评测、零社区实战**，MemHub 的"10 种工具同步"和治理能力均为官方说法；② 无 curated 知识层（LLM Wiki 需求不覆盖）；③ 并发写入、recall 强制机制未知。**License 纠正**：2026-10-20 已读 LICENSE 原文，明确为 Apache-2.0（"does not impose any additional restrictions"）；此前"Other/自有条款"的说法系二手信源误标，特此纠正。
**定位**：观察名单第一位——分层设计值得跟踪，可能是需求 4（时间层级）的最佳未来答案；但现在不是上手候选，等独立评测/实战后再评估。

### 大厂三者的横向定位
- **OpenViking**："上下文数据库"范式（文件系统抽象＋渐进加载），最老（2026-01）、star 最多，AGPL 是最大门槛。
- **TencentDB Agent Memory**："团队资产"范式（四类资产＋四档治理），MIT 最宽松，治理体系最完整。
- **Hy Memory**："专用模型＋框架＋应用"三层，理念最新（记忆分场景流水线），但太新＋license 不明。
- 与 ai-memory 的区别：ai-memory 回答的是"跨厂商**交接**"（任务上下文 handoff），这三家回答的是"跨厂商**共享记忆体**"（同一份记忆多 agent 读写）——问题形状不同。

## 三之二、第二轮扫荡：按 star 自上而下补漏（2026-10-19）

> 方法论修正说明：第一轮用的是"预制清单核实法"——清单全是我凭印象列的英文生态项目，清单之外的项目被系统性漏掉。本轮改用 **GitHub `topic:agent-memory` 按 star 排序 ＋ `agent memory in:name,description` 按 star 排序** 双扫荡，再逐个读 README 定性。扫荡中发现第一轮漏掉了一整片头部项目。

| 项目 | 一句话（来自 README/描述原文） | 跨智能体共享方式 | 厂商中立？ | License | 成熟度 (★ / 最近提交) | 部署 |
|---|---|---|---|---|---|---|
| vectorize-io/hindsight | "让 agent 学会，而不只是记住"；有论文（arXiv 2512.12818）＋公开 benchmark | SDK/API；Hindsight Cloud | ✅ 中立 | MIT | 51.4k / 2026-10-19 | 自建 / SaaS |
| rohitg00/agentmemory | 面向编码 agent 的持久记忆，benchmark 驱动；支持 Claude Code/Copilot CLI/Cursor/Gemini CLI/Codex/Hermes/OpenClaw/pi/OpenCode 及任意 MCP 客户端 | MCP 客户端 | ✅ 中立 | Apache-2.0 | 29.7k / 2026-10-19 | 自建 |
| gastownhall/beads | 基于 Dolt 的分布式图式 issue tracker：给编码 agent 的持久结构化记忆（依赖感知图谱） | CLI + MCP（beads-mcp） | ✅ 中立 | MIT | 28.0k / 2026-10-19 | 自建 |
| MemoriLabs/Memori | agent-native 记忆基础设施；"Memory from what agents do, not just what they say"；LLM/存储/框架无关，企业级 | SDK；Memori Cloud | ✅ 中立 | Apache-2.0（README 徽标；API 未识别） | 17.1k / 2026-10-03 | 自建 / SaaS |
| memvid/memvid | 单文件 serverless 记忆层，替代复杂 RAG 管道 | SDK | ✅ 中立 | Apache-2.0 | 16.6k / 2026-07-14 | 自建 |
| NevaMind-AI/memU | 个人记忆存成 Wiki；Across Sessions / Agents / Devices；核心逻辑仅 500 行 | Codex/Claude Code/Cursor/OpenClaw/Hermes/WorkBuddy/Cola/pi…（矩阵自述；走 memu.so 云 API key） | ✅ 中立 | ⚠️ **仓库无 LICENSE 文件**（README 有 Apache-2.0 徽标但无法律效力，默认保留所有权利） | 14.6k / 2026-10-20 | 云（memu.so）/ 自建 |
| semantica-agi/semantica | 图原生上下文基础设施（Graph-Native Infrastructure for Context） | 未深究 | ✅ 中立 | MIT | 14.1k / 2026-10-19 | 自建 |
| EverMind-AI/EverOS | 本地优先便携记忆层；Markdown-native、用户持有、跨应用自演化；国产团队（有中文 README） | Python 库；跨 coding assistant/app | ✅ 中立 | Apache-2.0 | 13.5k / 2026-10-19 | 本地 |
| MemTensor/MemOS | 自演化 memory OS（国产 MemTensor）；持久记忆＋跨任务技能复用；有论文（arXiv 2507.03724） | OpenClaw/Hermes/DeepSeek Harness 生态 | ✅ 中立 | Apache-2.0 | 11.9k / 2026-10-17 | 自建 |
| plastic-labs/honcho | 有状态 agent 的记忆基础设施；peer/session 表征＋后台推理 | managed / 本地 / 自建 FastAPI | ✅ 中立 | AGPL-3.0 | 7.7k / 2026-10-17 | 自建 / SaaS |
| Gentleman-Programming/engram | Agent 无关的 Go 二进制持久记忆；SQLite＋FTS5 | MCP server + HTTP API + CLI + TUI | ✅ 中立 | MIT | 7.4k / 2026-10-18 | 本地 |
| kungfu-systems/kungfu | 跨 harness 的 Work 交接（Codex/Claude/OpenCode）；形状接近 ai-memory | — | ✅ 中立 | Apache-2.0 | 4.5k / 2026-10-03 | 自建 |
| tigerless-labs/agent-memory | Markdown 真相源＋本地排序检索＋sleep-time 管理层；Claude Code＋Codex 共享一存；无 API key | 本地文件 | ✅ 中立 | MIT | 4.4k / 2026-10-19 | 本地 |
| zilliztech/memsearch | Milvus 团队出品；统一记忆层（Markdown＋Milvus），面向 Claude Code/Codex/DSH | — | ✅ 中立 | MIT | 2.8k / 2026-10-19 | 自建 |
| kayba-ai/agentic-context-engine | 让 agent 从经验中学习；有托管版 | — | ✅ 中立 | Apache-2.0 | 2.6k / 2026-09-24 | 自建 / 托管 |
| cytostack/openwolf | 便携项目记忆（Claude Code/Codex/OpenCode）＋token 记账；本地文件 IO、无遥测 | 本地文件 | ✅ 中立 | AGPL-3.0 | 2.4k / 2026-09-15 | 本地 |
| aakarim/OpenLore | 极简 agent 原生共享上下文仓库 | — | ✅ 中立 | Apache-2.0 | 1.5k / 2026-10-19 | 自建 |
| mksglu/context-mode | 上下文窗口优化＋会话记忆持久化（边界项：主业是上下文工程） | — | ✅ 中立 | NOASSERTION | 30.9k / 2026-10-19 | 本地 |

**扫荡中出现、但经定性后排除的**（扫荡有辨别力，不是唯 star 论）：
- 666ghj/MiroFish（80k）：群体智能引擎，不是记忆层。
- affaan-m/ECC（283k）、ruvnet/ruflo（76.8k）、HKUDS/nanobot、zhayujie/CowAgent、nanocoai/nanoclaw、MervinPraison/PraisonAI、deepset-ai/haystack：agent harness/框架（记忆只是其功能之一），归类同 DeerFlow/Letta。
- bojieli/ai-agent-book：书；pingcap/tidb、dolthub/dolt：数据库；deeplethe/utopia：世界模型。
- 华为 openJiuwen AutoGenetic Memory：GitHub 按名检索**无此仓库**，单篇报道无法核实，不采信；华为可验证的记忆供给是商业服务（AgentArts Memory、CMS 记忆存储），非开源。阿里：未发现自研开源记忆系统（Spring AI Alibaba 只是集成了 mem0）。

## 三之三、第三轮：全量核验后的修正匹配（2026-10-20）

> 背景：用户判定前两轮清单"整体不可信"（预制清单漏项＋license 引二手信源）。本轮对 21 个候选执行全量核验：GitHub API（stars/活跃度）＋ **LICENSE 文件原文** ＋ README 原文能力证据抓取，证据分三级：✅已验证（LICENSE 原文/README 原文）/ ⚠️官方自述（README/文档自称，未见独立验证）/ ❌未见或不支持。以下打分逐项对照用户 9 条需求（1 跨厂商 / 2 原生记忆共存 / 3 本地自建 / 4 时间层级与同步 / 5 LLM Wiki 知识层 / 6 治理 / 7 并发安全 / 8 recall 可靠 / 9 license）。

### 修正排名（按 9 条需求匹配度，非按 star）

| # | 项目 | 命中（证据等级） | 短板（证据等级） |
|---|---|---|---|
| 1 | TencentDB Agent Memory（MIT✅原文已验证，29.7k） | 3✅自建Docker；4✅ L0–L3＋Skill 分层（README 原文）；5⚠️ LLM-Wiki 在 feat/server_team 团队分支（官方 Issue #1639）；6⚠️ 同分支四档可见性治理；9✅ | 1⚠️ 原生集成以 OpenClaw/Hermes 为主，Claude Code/Codex 靠 proxy/独立服务（第三方报道）；7❓；8⚠️ Light injection |
| 2 | OpenViking（AGPL-3.0✅原文，40.4k） | 1✅ Hooks＋MCP 插件覆盖 Claude Code/Codex/Cursor/TRAE/OpenCode（README）；2✅ 插件＋会话沉淀；3✅；4✅ 会话归档→Markdown＋L0/L1 摘要；6✅ 多租户＋用户隔离＋可选 ACL（README）；8✅ Hooks 强制 | 5⚠️ `ov compile` 机器编译 wiki，无人审准入；**9❌ AGPL-3.0（用户商业化硬伤）**；7❓ |
| 3 | hindsight（MIT✅原文，51.7k） | 1✅ 11+ coding agents＋MCP（README 名单）；2✅ 自动 ingestion 零设置；3✅ 自建 Postgres 或云；4✅ per-repo bank（git 历史＋会话）启动注入＋curated knowledge pages；8✅ 启动注入＋自动 ingestion；9✅ | 5⚠️ knowledge pages 自动策展非人审；6⚠️ 仅 metadata 隔离＋Memory Defense；7❓ |
| 4 | ai-memory（MIT✅原文，11.5k） | 1✅ 20+ harness；2✅ git markdown wiki（Obsidian 可编辑）；3✅ 纯本地；4✅ episodic＋wiki＋注入；6⚠️ team server 含 user admin/session inspection/personal API keys；7⚠️ git 版本链可恢复；8✅ lifecycle hooks 静默捕获；9✅ | 5⚠️ wiki 形态对但准入流程自定 |
| 5 | rohitg00/agentmemory（Apache-2.0✅原文，29.7k） | 1✅✅ 名单最全（54 MCP tools）；2✅；3✅ 本地运行时；4✅ hooks 自动捕获；5⚠️✅ 明确扩展 Karpathy LLLM Wiki 模式＋置信度评分＋生命周期（全赛道最接近用户 LLM Wiki 设想的实现，但准入仍非人审）；8✅ 12 auto hooks；9✅ | 6⚠️ 仅 Oracle 变体有 team roles；7❓ |
| 6 | tigerless/agent-memory（MIT✅原文，4.4k） | 1✅ 3 hosts 全互通实测；2✅；3✅✅ 纯本地无 API key；4✅ MEMORY.md 确定性注入＋sleep-time 管理；**6✅✅ sleep-time 整理内置 authority tiers（独一份）**；8✅ 确定性注入；9✅ | 5❌ 无知识层；7⚠️ 单文件 store |
| 7 | EverOS（Apache-2.0✅原文，13.5k） | 1✅ MCP（Claude Code/Codex/Desktop/Cursor）＋插件；2✅；3✅✅ local-first，.md 真相源 git 版本；4✅ episodes/profile/cases/skills 分面＋Knowledge Wiki＋离线演化；9✅ | 5⚠️ Knowledge Wiki 机器离线演化非人审；6❓；8⚠️ |
| 观察 | Hy-Memory（Apache-2.0✅原文已验证，988） | 4✅✅ 分层最细（chat L0–L7 / working 双层价值阈值 / coding 差分链）；3✅ 本地优先；9✅ | 5❌；6⚠️；7❓；8⚠️；发布 4 天零独立验证——**观察名单第一位，非上手候选** |
| 观察 | mcp-memory-service（Apache-2.0✅原文，2.0k） | **SSE 实时推送（agent 存/删记忆时通知）——全赛道唯一推送证据**；REST＋MCP＋OAuth | 体量小，长期维护待观察 |
| ⚠️ | memU（14.6k） | 1✅ 矩阵最全（含 ChatGPT）；5✅ 形态（wiki） | **9❌ 仓库无 LICENSE 文件**（README 徽标无法律效力）——降为警告，不推荐 |
| ❌ | honcho（7.7k） | 1✅ 逐 agent 插件＋hooks；8⚠️ 后台异步推理 | **9❌ AGPL-3.0**——商业化路径排除 |
| 降权 | supermemory（31.3k）/ mem0（67.5k）/ Memori（17.2k） | 1✅；9✅（MIT/Apache-2.0 均原文已验证） | 2❌ 与原生记忆各记各的；8❌ 靠 model 自觉；5❌；6❓——纯外部记忆服务，匹配度低于上一版评估 |

### 修正后的组合方案

- **方案一（重治理）**：TencentDB **团队分支（feat/server_team）** 为底座——记忆分层、LLM-Wiki、Skill、四档治理一次到位；**自建**：LLM Wiki 两层准入（推荐入口＋审批流）、各 harness recall hook。注意：main 分支是个人插件版，选型以团队分支为准。
- **方案二（轻主权）**：ai-memory 或 tigerless 文件基座（Markdown 真相源＋git；tigerless 自带 authority tiers 可直接借鉴）＋ LLM Wiki 同仓自建 ＋ 自建 hook。最轻，5/6/8 自搭。
- **方案三（新）**：hindsight（自动 ingestion＋启动注入，证据强于预期）＋ 文件基座做真相源。适合不想自己写捕获逻辑的。
- 可借鉴的单点设计：mcp-memory-service 的 **SSE 推送**（自建同步层时抄）、rohitg00 的 **LLLM Wiki＋置信度评分**（LLM Wiki 设计输入）、EverOS 的 **watcher 级联同步**（文件变更通知）。

### 仍需自建（与上一版一致，证据补强后依然无解）
1. LLM Wiki 两层准入（全员缺；最接近的是 rohitg00 的置信度评分，仍非人审）。
2. 权威等级冲突裁决（tigerless 有 tiers 可借鉴，但跨源裁决规则仍要自己定）。
3. 快层（session/working）跨智能体实时同步——赛道空白（mcp-memory-service 的 SSE 是写事件通知，不是状态同步）。
4. 统一身份映射（多厂商 agent 的身份归一）。
5. 与各厂商原生记忆的去重/对账（短期策略：约定共享层为准）。

### 与上一版的主要差异
1. TencentDB 的 MIT：从"多方报道"→**LICENSE 原文已验证**；但新增**分支差异说明**（治理/LLM-Wiki 在团队分支，main 是个人版）——上一版把两者混在一起了。
2. memU：从候选→**警告**（无 LICENSE 文件）。
3. hindsight：排名上升（自动 ingestion＋启动注入证据强于预期）。
4. 新增证据点：tigerless 的 authority tiers、rohitg00 的 LLLM Wiki 置信度、mcp-memory-service 的 SSE 推送、EverOS 的 watcher 同步、Hy-Memory license 纠正为 Apache-2.0。
5. 降权：mem0/supermemory/Memori（纯外部服务，在"原生记忆共存"和"recall 可靠"两项上硬伤）。

**方法论脚注（本次教训）**：
1. topic 标签是不全的：mem0（67k star）都没打 `agent-memory` 标签——只扫 topic 会漏，必须配 `in:name,description` 关键词扫荡。
2. star 通胀警告：affaan-m/ECC 28.3 万 star（超过 VS Code 量级）明显异常；这个赛道正处 hype 周期，**star 只当 discovery 信号，不当质量信号**。
3. License 只认 LICENSE 文件原文：GitHub API 的 spdx 字段对腾讯式自定义文件头会误报 NOASSERTION（Hy-Memory、TencentDB 均如此，原文分别为 Apache-2.0 与 MIT）；README 徽标无法律效力（memU 无 LICENSE 文件却挂 Apache 徽标）。
4. 发现环节必须多源交叉：awesome 清单（IAAR-Shanghai/Awesome-AI-Memory）、多 topic（agent-memory/ai-memory）、多关键词、中文媒体——thedotmack/claude-mem（101.8k star，全赛道最大）前两轮全漏，只因它没打 agent-memory 标签且名字不含 "agent memory"。

## 三之四、第四轮：发现补漏（2026-10-20）

> 用户指出"只重验证不重发现等于偷懒"后，补做发现环节：awesome 清单 diff、多 topic/关键词扫荡、中文媒体横评。新入库 5 个（LICENSE 均原文已验证），排除 7 个（理由见下）。

| 项目 | 一句话（README 原文证据） | 证据等级关键项 | License（原文） | ★ |
|---|---|---|---|---|
| thedotmack/claude-mem | 为 Claude Code 做的持久记忆压缩系统：自动捕获 tool 观测、AI 压缩、注入未来会话；也支持 OpenCode/OpenClaw/Grok Bot（日志监听） | 1⚠️ Claude 中心；3⚠️ 默认 CMEM Pro  hosted，本地 observer 需 opt-in；8✅ observer/hooks 自动捕获 | Apache-2.0✅ | 101.8k |
| agentscope-ai/ReMe | 阿里 AgentScope 团队：local-first、自演化个人知识库；**Memory as File**（Markdown＋frontmatter＋wikilinks）；QwenPaw/DeepSeek Harness 共享同一 workspace；Codex/Hermes/OpenClaw 原生 hooks＋MCP；auto_memory 会话后蒸馏 | 1✅；2✅ 文件原生；3✅✅；4✅ daily notes＋长期知识；5⚠️ 知识库机器自演化非人审；8✅ hooks 自动 recall | Apache-2.0✅ | 3.7k |
| CaviraOSS/LongMemory | Local-first 自建："Governed project memory, Skills, Chat Memory, **LLM-Wiki**, and CodeGraph"（四资产模型对标 TencentDB）；session porter 覆盖 Claude Code/Codex/OpenCode/Gemini CLI/Copilot/Cline；SQLite 本地；lifecycle（decay/reinforcement/consolidation） | 1✅；3✅✅；4✅；5✅ LLM-Wiki 资产；6⚠️ governed＋dashboard；9✅ | Apache-2.0✅ | 4.5k |
| MemMachine/MemMachine | 通用记忆层：Episodic（图）＋Profile（SQL）＋Working Memory 三层；MCP server；本地或平台 | 4✅ 三层完整；1✅ MCP | Apache-2.0✅ | 3.1k |
| SuanmoSuanyangTechnology/MemoryBear | 国产（RedBear AI）：仿生记忆（海马编码/新皮层巩固/突触修剪遗忘）；Neo4j 同步；JWT 管理 API；Celery 异步 | 企业级形态；跨厂商名单未见 | Apache-2.0✅ | 8.1k |

**排除项（有理由）**：Mirix-AI/MIRIX（多智能体助手产品，非可插拔记忆层）；agiresearch/A-mem、BAI-LAB/MemoryOS（学术代码）；felinics/Memoh（AGPL 平台）；screenpipe（屏幕录制 capture 产品——与 PAT 采集层相邻，记一笔但非记忆系统）；memodb-io/memobase（2026-01 后无更新）；mindverse/Second-Me（2025-09 后无更新）；julep-ai/julep（agent 框架）。

**独立评测层出现**：Agent Memory Leaderboard（AML）第二期全球报名中（100+ 团队；Textual/Coding/Multimodal 三赛道；2026-11 中旬出结果）——未来验证各家自吹的独立来源，值得跟进。

### 修正排名 v2（含新入库）
1. TencentDB Agent Memory（团队分支）—— 5＋6 唯一解
2. OpenViking —— 证据最全，AGPL 硬伤
3. hindsight —— 自动 ingestion＋注入
4. ai-memory —— 文件原生派最强
5. **agentscope-ai/ReMe（新）** —— 文件原生＋阿里背书＋local-first，主权契合度最高的新选项
6. **CaviraOSS/LongMemory（新）** —— "TencentDB-lite"：四资产＋LLM-Wiki＋纯本地 SQLite，体量小是唯一短板
7. rohitg00/agentmemory —— 名单最全＋LLLM Wiki 置信度
8. tigerless/agent-memory —— authority tiers 独一份
9. EverOS —— .md 真相源＋watcher
- 备注：claude-mem 是赛道 star 第一但 Claude 中心＋ hosted 默认，不列入中立排名；Hy-Memory、mcp-memory-service 仍在观察位。

## 四、关键缺口与判断

1. **传输层已有（MCP），语义层缺失**：任何 MCP 记忆服务都能被跨厂商 agent 读写，但"记忆长什么样"（fact vs 实体 vs 交接单 vs episode）各家自定——跨厂商共享记忆今天能做到"连得上"，做不到"语义互通"。
2. **A2A 明确不管记忆**：别指望 A2A 解决共享记忆，它只解决任务委托。
3. **最接近用户场景（Muse↔Grok Bot↔Claude↔Codex）的现成方案**：ai-memory（交接场景）；或任选一个 MCP 记忆服务（mem0 / supermemory / mcp-memory-service / graphiti）作为共享后端；**团队/多 agent 场景新增两个大厂选项**：TencentDB Agent Memory（MIT、治理最完整）、OpenViking（star 最多、但 AGPL-3.0 商用需评估）——前提是各厂商客户端都支持 MCP 或 proxy 接入。
4. **各大厂商（OpenAI / xAI / Google / Anthropic）都没有开放跨厂商记忆 API**，记忆仍是各自产品的护城河——但 2026 年格局在松动：字节（OpenViking，2026-01）、腾讯（TencentDB Agent Memory，2026-05；Hy Memory 2.0，2026-10）已下场开源跨厂商记忆枢纽。
