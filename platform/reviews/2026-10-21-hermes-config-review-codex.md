# Hermes 配置方案评审意见（评审方：Codex）

> 状态：已提交评审
> 维护线：评审方-codex
> 最后更新：2026-10-21
> 摘要：有条件通过。先消除执行审批的生效条件歧义，以及重启恢复验收与阶段安排的冲突；补足写入治理的行为证据。支持先治理原生记忆、零渠道开跑，保留接入期边界。

评审对象：[Hermes 配置方案](../hermes-config-spec.md)，PAT 基准提交 `b09e1e4558eeae5e6bcc0d30a18c0f3f3752e2ac`。按[评审指引](../hermes-config-review-guide.md)读取仓库规范、执行蓝图、调整清单、方案及相关设计采收条目，并与已有评审交叉核对。

外部核验使用上游提交 `4e58c721c8cf9b51c46636ea84ea6a5cb540880a`；另核对 `v0.22.4` 的命令审批源码、Runs API 文档、Memory 文档，三份文件的内容哈希与该提交一致。引用尽量指向固定提交，避免后续文档更新改变证据。此版本用于评审核验，不代替用户选择部署版本。

**证据边界：本轮完成文档、源码与提交祖先关系核验；未安装或运行 Hermes，未执行审批、重启、写入或恢复测试。Issue 中的事故属于上游报告，不视为本轮复现。交付仅为本地评审文档，未修改方案，未提交或推送。**

## 1. 总体结论

**有条件通过**：方向和阶段划分可以保留，但当前文本还不足以直接指导开跑。两项阻断是：实际部署姿态是否触发预期审批尚未定义；首次开跑要求通过的重启恢复能力，与已核验的上游语义及兜底安排不一致。

R1、R2 应先在方案中消歧，经用户裁定后执行；R3、R5、R6 是首次部署与验收要落实的条件；R4、R7 属接入期要求，现在澄清边界即可，不要求提前建设插件、桥或共享状态服务。所有运行层结论仍以选定构建上的实际验收为准。

## 2. 逐条意见

| 编号 | 位置（方案节号） | 类别 | 严重度 | 意见 | 证据出处 | 建议改法 |
|---|---|---|---|---|---|---|---|
| R1 | §3.3、§4 安全与审批映射 | 正确性 | 阻断 | “Docker 加固后端＋命令审批开启”不足以确定行为。无宿主路径挂载时会跳过常规危险命令检查；有宿主路径挂载时走正常检查。审批模式也影响是否由人裁定。 | [审批分支][up-approval]、[宿主访问判定][up-host-access]、[审批模式][up-security-modes] | 明确工具后端与本体部署的区别，列出挂载边界、审批模式及允许规则；用选定 API/CLI 入口验证预期危险操作的批准、拒绝和超时。不能为触发审批而额外暴露宿主目录。 |
| R2 | §7 第 2 项、§8-C、§4 审批映射 | 阶段边界 | 阻断 | “重启后审批恢复并走完”若指同一运行实例继续，超出已核验的 Runs API 保证；同时“全部验收通过才进入接入期”与“失败兜底放接入期”形成流程上的矛盾。 | [重启语义][up-run-restart]、[未知结果处理][up-run-unknown]；[调整清单](../hermes-adjustments.md)需求 3 与接入期列表 | 明确验收的是原 run 续跑还是业务流程完成。建议首期开跑验证安全中断、不误报完成、审批不误用；小时级跨重启业务恢复放接入期。若用户坚持首期必须具备该能力，则兜底必须前移，不能先宣称开跑通过。 |
| R3 | §3.4、§7 第 3 项 | 风险遗漏 | 重要 | 治理开关回读不能证明写入先审批；也未覆盖获批后的错误写入如何恢复。当前 API/无人值守路径正是调整清单列出的待验证项。 | [记忆写入行为][up-memory-gate]、[技能暂存行为][up-skill-gate]；[调整清单](../hermes-adjustments.md)需求 4；[设计采收](../design-harvest.md)E1、E3 | 对实际使用入口做“待审时正式对象不变→批准后结果正确／拒绝后不变”的完整验证；检查实际文件而非模型自述。首次真实写入前明确可恢复副本及恢复办法，跨机同步默认不启用。 |
| R4 | §3.4、§4 记忆不垄断、§8-A | 正确性 | 重要 | 预留或占用 MemoryProvider 槽位不自动让渡记忆权威，但原生存储可以独立关闭。当前原生记忆治理合理，不能因此把未来共享记忆接管视为已完成。 | [原生存储开关][up-memory-switches]、[外部 provider 的并行关系][up-memory-alongside]、[provider 写入接口][up-provider-hooks] | 保持 A 的次序。接入期必须确定原生两份存储的去留、经确认内容的迁移范围、外部写入的治理归属；当前经验保存在可导出的原生文件中即可，不提前造通用迁移系统。 |
| R5 | §3.1、§6 安全依据 | 可执行性 | 重要 | 只有“≥ v0.21.6”无法固定本次评审所对应的行为；GitSpawn 修复状态则已有可核查的一手答案，不必继续悬置于二手资料分歧。 | [修复 PR][up-gitspawn-pr]、[修复提交][up-gitspawn-fix]、[与 v0.21.6 的祖先关系][up-gitspawn-compare] | 安装前选定具体发行版及 commit；使用镜像时记录 digest。区分本体版本与工具容器版本，并核对实际安装对象。将该 CVE 的依据改为具体修复及包含关系；升级后重验受影响能力。 |
| R6 | §3.5、§8-B、§7 服务恢复 | 风险遗漏 | 重要 | 0600 与磁盘加密只能覆盖部分威胁，不能阻止已获读取权限的进程泄露密钥；磁盘加密也不能未经核验就算落实。是否影响重启取决于实际 VPS 的加密、解锁方式。 | [宿主权限与扩展边界][up-hook-trust]、[凭据透传][up-env]、[官方 Secrets 支持][up-secrets]；防护范围判断见下文 | 有条件接受个人阶段基线：核实持钥身份、凭据不进入任务挂载或不必要透传、加密方式与实际重启恢复。优先用专用可撤销 key及供应商支持的限额；已有密钥管理设施可复用，无需预设自行开发注入系统。 |
| R7 | §3.6 桥约束 1、5；§8-C | 正确性 | 重要 | “状态只在数据层与 Agent 侧”遗漏蓝图已明确独立的工作记忆层；若兜底任务、审批状态被塞进主权资产库，会违反现行分层。桥无状态也不自动解决重复投递和重启后的结果归属。 | [执行蓝图](../architecture-v1.md)原则 7、工作记忆层、协议与通道；[Runs 幂等边界][up-run-unknown] | 改为桥不拥有持久业务／会话状态；任务与审批状态由 PAT 工作记忆／任务状态责任方承接，与资产库分离。接入期在现有契约测试内落实重复请求、过期审批、重启与不确定执行结果的处理，不新增厚桥。 |

### R1：需要核验的是真正生效的执行边界

源码 `_should_skip_container_guards()` 对 Docker 的判断依赖 `has_host_access`，后者检查宿主工作目录与宿主路径挂载。无宿主访问的分支仍检查用户配置的 `approvals.deny`，所以“Docker 与所有命令防护始终互斥”不成立。[证据][up-approval]

另一方面，默认 `smart` 模式允许辅助模型自动作出部分决定；`manual` 针对危险命令提示用户，并不是“每条命令都由人审批”。如果 PAT 所说的审批是人工确认，就应明确对应范围，不能只写“开启”。[证据][up-security-modes]

上述判断仅针对命令检查，不等于关闭记忆或技能的写入审批，也不等于 Docker 工具后端把整个 Hermes 进程及所有扩展都放入了沙箱。具体挂载和批准行为必须在部署配置上验证。

### R2：可查询中断状态，不等于恢复正在执行的任务

固定提交的 API 文档明确：网关退出时活动 run 会记为 `interrupted`；canonical authority 在执行中重启时可报告 `unknown`。`resolve-unknown` 用于确认失去的执行不会继续，并释放后续队列，不重放失去的原任务。这是中断与不确定结果的处理能力，不是原任务的持久续跑保证。[重启说明][up-run-restart]、[恢复接口说明][up-run-unknown]

不能将“命令审批”和“Runs 审批”简单视作互不相关的两套机制：API 的旧执行路径直接调用 `resolve_gateway_approval()`，新 authority 路径则另行分派。Runs 是外部控制入口，不因此天然提供独立的持久审批工作流。[API 源码][up-run-approval] 官方审批默认等待时间为 300 秒；目标为数小时，必须确定选定路径真正使用的期限，并验证超时后迟到的批准不会落到下一次请求上。[超时配置][up-security-modes]

建议由用户明确两级验收：

- **本体开跑**：日常 API/CLI 审批可用；拒绝、超时、重启时不越权执行，不把中断报为完成，待审内容能正确识别和处置。
- **PAT 接入**：小时级挂起、跨进程恢复整个业务流程；状态由明确的 PAT 责任方保管。采用分段 run 时，以副作用记录核对没有重复执行，旧批准不能授权新内容。

这是一项阶段调整建议，须裁定后改方案，不能由执行者在测试失败后自行降低验收标准。若坚持首期就满足跨重启流程完成，现方案的“仅配置、兜底后置”范围也必须相应调整。

### R3、R4：审批、恢复与记忆归属分别验证

官方文档区分交互 CLI 的原生记忆即时确认与其他入口的暂存审核；技能写入则统一暂存。采用“API 触发、CLI 检查并批准”可以符合本阶段零消息渠道的安排，但应把这条人实际能用的路径跑通。[记忆审批][up-memory-gate]、[技能审批][up-skill-gate]

验收至少检查待审、批准和拒绝后的正式对象内容，并验证一次恢复；关闭后台写入不消除前台获批误写的恢复需求。[Issue #142069][up-skill-incident] 报告过技能文件归零及同步放大的事故，但本轮未复现，也未据此断言选定的新构建仍存在同一缺陷。它用于确定验收风险，不充当当前漏洞状态结论。

未来切换共享记忆时，`memory_enabled` 与 `user_profile_enabled` 同时关闭可停用原生记忆，而保留外部 provider 工具；不要把整个 `memory` toolset 禁用，因为那会同时隐藏外部工具。[原生开关说明][up-memory-switches] Provider 还可以通过自己的工具和 `sync_turn()` 等接口写入，不能直接假定原生 `memory.write_approval` 自动覆盖外部插件的全部写路径。[接口定义][up-provider-hooks]

### R5、R6：固定构建与防护范围

GitSpawn 修复提交为 `f6234d00c5d59450adea1d7edd30ad3859375c79`。本轮对该提交与 `v0.21.6` 做 GitHub compare 核验，返回 `behind_by: 0`，且 `merge_base` 等于该修复提交：**v0.21.6 标签所指历史已包含该修复**。[比较证据][up-gitspawn-compare] 这只确认该修复的包含关系，不证明任何自称 v0.21.6 的实际安装无改动，也不证明该版本不存在其他问题。

对 B 的风险判断是：0600 限制其他普通账户读取，不限制文件属主与特权进程；磁盘加密的保护取决于密钥控制与解锁状态。不能据此声称运行中的 Agent 无法读取自身可用凭据，也不能反向断言磁盘加密必然与无人值守自启互斥。后者必须查看实际 VPS 条件并做重启验证。

Hermes 已提供外部 Secrets 集成，因此“密钥注入一定需要旁路开发”不是当前事实；是否采用应按已有设施与维护成本决定。[官方说明][up-secrets] 另需检查实际技能和环境透传：空的 `docker_forward_env` 不能单独证明所有任务凭据均不进入容器，文档还有技能声明的透传路径。[透传说明][up-env]

## 3. 重点议题表态

### A–D

| 议题 | 立场 | 依据与边界 |
|---|---|---|
| A：先治理原生记忆，后占槽 | 支持 | 与两条线独立推进一致。当前先验证治理与导出，接入期再确定权威切换；无需现在实现 MemoryProvider 插件，也不能用“占槽”替代迁移与写入治理。 |
| B：0600＋磁盘加密 | 有条件支持 | 可作为个人阶段的一部分基线，但需落实实际加密与重启方式，承认运行时读取边界。优先减少凭据可达范围；已有 Secrets 能力可复用，不强加新的密钥平台。 |
| C：小时级审批与重启 | 不接受现有验收和兜底时序；支持分段 run 作为接入期候选 | 上游已有明确中断语义，不应等部署后才发现。先裁定能力在哪个阶段必须具备；分段 run 仍须解决状态归属、批准内容绑定、重试和副作用核对。 |
| D：零消息渠道 | 支持 | CLI 足以承接人工审核，API 足以验证被调用能力。渠道和设备接入继续后置；零渠道不意味着只测对话、不测审批闭环。 |

### 桥的六条约束

| 约束 | 立场 | 需要澄清或落实的内容 |
|---|---|---|
| 1. 薄且无状态 | 支持目的，需改状态归属表述 | 区分桥不拥有持久业务状态与实现所需的短暂请求上下文；按蓝图将任务／审批状态放在独立责任方，不进永久资产库。 |
| 2. 一侧固定、一侧插件 | 支持 | PAT 侧固定的是行为语义；Hermes 的 run、状态与错误映射留在 adapter 内，不让换节点改变上游契约。 |
| 3. 能力声明 | 支持 | 声明对应到已验证构建和运行模式；“可查中断结果”不能声明成“可原地续跑”。 |
| 4. 故障隔离 | 支持 | 接入期验证一个 adapter 超时、积压或失效不会拖住其他调用；先采用最小限时、限量措施，不为此预建复杂平台。 |
| 5. 契约测试 | 支持，需覆盖失败语义 | 在这一条内覆盖重复投递、重启、过期／错配审批及不确定执行结果；不另增一套重复规则。 |
| 6. 降级留痕 | 支持 | 影响批准或写入的语义缺失应拒绝或显式转交人工，不能执行后只补日志；可接受的降级才记录后继续。 |

六条结构足够，无需继续堆原则。上述内容应进入接入期契约的验收实例，不要求现在搭桥。

### 五条设计理念

| 理念 | 立场 | 本轮落点 |
|---|---|---|
| 1. 治理先行于使用 | 支持 | 补上 R3 的实际写入结果与恢复验证；开关回读只证明配置。 |
| 2. 默认收口、按需开放 | 支持 | 首次开跑保持 curator、background_review 关闭。以后用有界自治替代关闭时，应单独验证限额生效及不能自行放宽，不能仅因发现一个“上限”字段就临场启用。 |
| 3. 契约只建在文档化面上 | 支持 | 文档化不等于跨版本保证；用固定构建、能力声明和契约验证承载，源码只用来核查行为，不据此绑定未公开接口。 |
| 4. 私有面止于桥 | 支持 | 保留私有 API 隔离，同时按 R7 修正工作记忆归属；两者并不冲突。 |
| 5. 一切自治循环设死上限 | 支持 | 开启某项自治前按现有设计采收 E2 核对预算、时长／迭代和停止条件；本阶段关闭的能力不必提前建设预算平台。 |

五条没有不可调和的冲突。需要补的是既有原则在本阶段的可验证结果，不建议再新增第六条口号。另应在数据主权映射中说明：选定的远程模型会接收请求上下文；“关闭可选云组件”不能理解成“所有数据均不出机”，实际发送范围随所用工具与任务核查。

## 4. 建议重议

无。没有证据要求推翻 Hermes 选型、架构蓝图、两线节奏、许可证或仓库公开策略。本文要求修正的是方案的能力表述、阶段条件与验收证据。

[up-approval]: https://github.com/NousResearch/hermes-agent/blob/4e58c721c8cf9b51c46636ea84ea6a5cb540880a/tools/approval.py#L1041-L1066
[up-host-access]: https://github.com/NousResearch/hermes-agent/blob/4e58c721c8cf9b51c46636ea84ea6a5cb540880a/tools/terminal_tool.py#L128-L145
[up-security-modes]: https://github.com/NousResearch/hermes-agent/blob/4e58c721c8cf9b51c46636ea84ea6a5cb540880a/website/docs/user-guide/security.md#L29-L62
[up-run-restart]: https://github.com/NousResearch/hermes-agent/blob/4e58c721c8cf9b51c46636ea84ea6a5cb540880a/website/docs/user-guide/features/api-server.md#L605-L607
[up-run-unknown]: https://github.com/NousResearch/hermes-agent/blob/4e58c721c8cf9b51c46636ea84ea6a5cb540880a/website/docs/user-guide/features/api-server.md#L672-L719
[up-run-approval]: https://github.com/NousResearch/hermes-agent/blob/4e58c721c8cf9b51c46636ea84ea6a5cb540880a/gateway/platforms/api_server_runs.py#L1317-L1369
[up-memory-gate]: https://github.com/NousResearch/hermes-agent/blob/4e58c721c8cf9b51c46636ea84ea6a5cb540880a/website/docs/user-guide/features/memory.md#L329-L361
[up-skill-gate]: https://github.com/NousResearch/hermes-agent/blob/4e58c721c8cf9b51c46636ea84ea6a5cb540880a/website/docs/user-guide/features/memory.md#L516-L541
[up-memory-switches]: https://github.com/NousResearch/hermes-agent/blob/4e58c721c8cf9b51c46636ea84ea6a5cb540880a/website/docs/user-guide/features/memory.md#L283-L309
[up-memory-alongside]: https://github.com/NousResearch/hermes-agent/blob/4e58c721c8cf9b51c46636ea84ea6a5cb540880a/website/docs/user-guide/features/memory.md#L544-L553
[up-provider-hooks]: https://github.com/NousResearch/hermes-agent/blob/4e58c721c8cf9b51c46636ea84ea6a5cb540880a/agent/memory_provider.py#L151-L220
[up-gitspawn-pr]: https://github.com/NousResearch/hermes-agent/pull/101483
[up-gitspawn-fix]: https://github.com/NousResearch/hermes-agent/commit/f6234d00c5d59450adea1d7edd30ad3859375c79
[up-gitspawn-compare]: https://github.com/NousResearch/hermes-agent/compare/f6234d00c5d59450adea1d7edd30ad3859375c79...v0.21.6
[up-hook-trust]: https://github.com/NousResearch/hermes-agent/blob/4e58c721c8cf9b51c46636ea84ea6a5cb540880a/website/docs/user-guide/security.md#L943-L949
[up-env]: https://github.com/NousResearch/hermes-agent/blob/4e58c721c8cf9b51c46636ea84ea6a5cb540880a/website/docs/user-guide/security.md#L587-L640
[up-secrets]: https://hermes-agent.nousresearch.com/docs/user-guide/secrets
[up-skill-incident]: https://github.com/NousResearch/hermes-agent/issues/142069
