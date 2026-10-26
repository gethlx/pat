> 状态：定稿（调研记录）
> 维护线：共享记忆线
> 最后更新：2026-10-26
> 摘要：2026-10-20 自上而下扫荡：头部项目补遗、排除项与排除理由。

# 发现扫荡报告（按冻结需求基准，找更适配的项目）

> 日期：2026-10-20。动因：用户指出此前多轮均有遗漏，要求按冻结基准（同目录 `requirements-baseline.md`）重新做**发现**（不是对老名单再核验）。
> 方法（AGENTS.md 2026-10-19 教训）：GitHub topic 按 star 扫荡（agent-memory／ai-memory／llm-memory／long-term-memory 四个 topic）＋ `in:name,description` 关键词按 star 扫荡（"agent memory"／"shared memory"／"memory layer"／`memory in:name` 四组）＋ 两份 awesome 清单 diff（IAAR-Shanghai/Awesome-AI-Memory、TeleAI-UAGI/Awesome-Agent-Memory 共 300+ 链接）＋ 中英文媒体补扫。新候选逐项读 LICENSE 原文＋README 证据后才评级。
> 评分口径同 `projects-fit-2026-10-20.md`：按**经验记忆层候选**称重（知识层席位已定）。

## 结论先行

**没有发现能推翻现有第一梯队（hindsight／ReMe／tigerless）的新项目。** 但补上三个此前确实漏掉、值得入册的：

| 新入册 | 为什么值得 |
|---|---|
| **vshulcz/deja-vu**（MIT✅，1.3k★） | **新机制**：不要求 agent 往它写——它直接索引 42 个 harness 已经落在磁盘上的 session 文件，把相关片段递给当前干活的 agent。是"原生记忆共存"的读侧解法，与导出 ETL 互补。短板：只覆盖编程 agent、无蒸馏与治理，属检索层不是记忆层。定位：**第一梯队旁的机制借鉴＋编程场景可用件**。 |
| **AVIDS2/memorix**（Apache-2.0✅，851★） | local-first 的跨 agent 共享项目记忆，点名约 20 个 harness（Claude Code／Codex／Cursor／Grok Build／OpenClaw／Hermes…），MCP 接入。覆盖面与 rohitg00 同级而更强调本地与共享。短板：项目级（编程）记忆，非个人长期记忆。定位：**第二梯队新入**。 |
| **caura-ai/caura**（Apache-2.0✅，502★，原 MemClaw） | 全场唯一以 **governed shared memory** 为第一定位（agent 舰队共享记忆＋治理＋自改进）。与本项目治理观最合拍，但体量小、偏团队／舰队场景、自托管成色待深核。定位：**观察名单**（与 Hy-Memory 并列）。 |

## 其余新核验候选（入册但不改梯队）

- **memodb-io/Acontext**（Apache-2.0✅，3.7k★）：「Agent Skills as a Memory Layer」——把经验沉淀为 Skill，是**程序性记忆专长**件；更适合做搭配而非主层。第二梯队（专长型）。
- **alash3al/stash**（Apache-2.0✅，769★）：自托管、任意 MCP agent 可用，episodes／facts／working context＋巩固，麻雀虽小五脏俱全。第二梯队末位。
- **Asymptote-Labs/agent-beacon**（MIT✅，1.8k★）：cross-harness、自改进的编程 agent 记忆。与 deja-vu／memorix 同赛道，差异化未验出，先入册观察。
- **MemPalace/mempalace**（MIT✅）：local-first、**逐字存储**（不蒸馏）、LongMemEval R@5 自报 96.6%、零 API 调用。理念与"raw 不可变"相通，但无蒸馏即无经验层智能，作原始层候选入册。
- **okf-memory/okf-agent-memory**（MIT✅，827★）：git 原生、实现 Google OKF v0.2 的项目记忆。与本项目知识层同为 git 原生路线，作设计参考入册（注：karpathy-llm-wiki 的 README 也在跟踪 OKF）。
- **mudler/LocalRecall**（MIT✅，980★）：LocalAI 作者的 100% 本地记忆＋知识库服务。可用但未见突出于候选池的点，入册备选。

## 排除项（及理由——证明扫荡有辨别力）

- **campfirein/byterover-cli（ByteRover，4.9k★）**：产品成熟，但 License 是 **Elastic License 2.0**，非 MIT／Apache 类，触基准 §5 门槛，排除。
- **basicmachines-co/basic-memory（4.3k★）**：MD＋MCP 本地记忆口碑很好，但 **AGPL v3**，排除（与 OpenViking 同理）。
- **moorcheh-ai/memanto（2.3k★）**：「Memory Agent 管其他 agent 的记忆」概念有意思，但 LICENSE 仅版权声明、非标准开源协议，按基准排除（存疑不入）。
- **unicity-aos/capsule-memory（8.4k★）**：绑定 Astrid OS 单一运行时的组件（其 prompt_builder hook），非跨厂商层，排除。
- **cortexkit/magic-context（2.4k★）**：单 agent 的上下文／会话记忆管理（"one session for life"），是上下文工程不是共享记忆层，排除。
- **FlowElement-xinliuyuansu/m_flow（4.5k★）**：认知检索／GraphRAG 引擎，且 LICENSE 未能核实，排除（检索层≠记忆层）。
- **基础设施类**：alibaba/zvec（向量库）、memgraph（图库）、ruvnet/RuVector（向量库）、xerj-org/xerj（搜索引擎）、DeusData/codebase-memory-mcp（代码索引）——是零件不是记忆系统，排除。
- **产品／整机类**：TencentCloud/Octop、holaboss-ai/holaOS、RedPlanetHQ/core（AI OS／助手整机）、screenpipe（采集产品，已知）、xzf-thu/VoiceMem（语音垂类），排除。
- **学术／基准类**：awesome 清单中大量条目为论文与基准（MemoryAgentBench、HaluMem、amemgym、HippoRAG 等），非可用系统，排除。
- **CodyQin/shared-ai-memory（4★）**：中文媒体扫到的个人模板——git＋Markdown＋inbox/topics 的共享记忆脚手架，恰好独立验证了本项目已选路线；是模板不是系统，不入候选，记一笔作旁证。
- 已知池复现（不重复评）：cognee（32.6k★）、MemOS、memobase、graphiti、Letta、openmemory 等均在扫荡中复现，维持原评。

## 对选型的影响

第一梯队不变（hindsight／ReMe／tigerless）；变化在周边：**deja-vu 的"索引既有 session 文件"机制值得单独记入设计输入**——它提示经验层的捕获未必都要靠 hooks 写入，读侧索引各 harness 的原生落盘是更轻的共存路径，与冻结基准 §4 的 ETL 思路可以合并考虑（导出 ETL 管的是云端 web 版，deja-vu 式索引管的是本地 harness 落盘）。
