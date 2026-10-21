# Hermes 配置方案评审意见（评审方：claude）

> 状态：已提交评审
> 维护线：评审方-claude
> 最后更新：2026-10-21
> 摘要：对 `platform/hermes-config-spec.md` 的评审：有条件通过。三项阻断集中在"审批"与"执行面"：Docker 后端会跳过危险命令审批、默认 300 秒超时与"挂起数小时"的验收判据互相矛盾、待审批项按上游文档与 open issue 不跨重启存活；另有若干治理与运维缺口。

评审依据：按指引 §3 顺序通读 `AGENTS.md`、`architecture-v1.md`、`hermes-adjustments.md`、方案全文、`design-harvest.md`（A/E 组）；外部事实核查于 2026-10-21 进行，来源逐条列于证据栏。**本评审未上机、未跑任何 Hermes 实例**，凡"上游文档说 X"均为文档级证据，不等于实测；推断处单独标注。

## 1. 总体结论

**有条件通过**——设计理念与阶段切分是对的，但方案把"审批开启 + fail-closed"和"Docker 加固后端"写成了同时成立，而上游文档明说二者在默认情况下互斥；§7 的长挂起验收判据在默认配置下也必然不过。阻断项 R1–R3 改完后可执行。

## 2. 逐条意见

| # | 位置 | 类别 | 严重度 | 意见 | 证据出处 | 建议改法 |
|---|---|---|---|---|---|---|
| R1 | §3.3 + §4「安全收口」「输出与审批回流」 | 正确性（纸面满足） | 阻断 | 方案同时要求"Docker 加固后端"和"无人值守命令审批保持开启"。上游文档明说：docker / singularity / modal / daytona / vercel_sandbox 后端下**危险命令检查整体跳过**，理由是容器即安全边界。因此在方案选定的执行档下，"命令审批开启"基本是空的。另外，挂载宿主目录时是否恢复审批，上游说法互相矛盾：PR #6436（为挂宿主卷的 Docker 恢复审批）至今未合入、有冲突；已合入的 PR #113257 正文却写"docker with host mounts still keeps its guards"。**不确定，须实测。** | 官方 Security 页「Container bypass」；Tips 页 warning；PR #6436（open）；PR #113257（merged 2026-09-17） | §3.3 二选一并写明：(a) 接受"容器即边界、命令审批不生效"，同时把审批关注点改为 `approvals.deny` 自定义规则（文档明示对容器后端同样生效）；(b) 采用"整进程容器 + 容器内 local 后端"，审批检查保留，边界由外层容器提供（**推断**，须冒烟验证）。两种都必须同时钉死 R4 的容器参数。 |
| R2 | §3.3「fail-closed」× §7「审批挂起数小时」 | 正确性（内部矛盾） | 阻断 | `approvals.timeout` 默认 300 秒，超时即拒绝（fail-closed），且过期的审批**不可重开**。方案要求 fail-closed，却没给 timeout 目标值，按默认值"挂起数小时"必然失败。另一方面，API Server 文档对 `/v1/runs` 的 `waiting_for_approval` 没写任何自动超时，`approvals.timeout` 是否作用于 runs 路径，文档没有说清。 | 官方 Security 页「Approval Timeout」（默认 300、fail-closed、不可重开）；API Server 页 `/v1/runs/{id}/approval` | §3.3 显式写出 timeout 目标值（与 C 的判据时长一致，例如 ≥ 判据时长；上限受 `MAX_SAFE_TIMEOUT_S` 约束），并把"runs 路径是否受该值约束"列为冒烟必测项。 |
| R3 | §7 验收第 2 条 × `hermes-adjustments.md` 第 3 条 | 可执行性 + 阶段边界 | 阻断 | ① 按现有文档，"重启后审批可恢复"大概率不成立：gateway 的待审批队列 `tools/approval._gateway_queues` 只在进程内存里，重启即丢（issue #106678，P2，open）；runs 在关停时被持久化为 `interrupted` 这一**终态**（"a durable run never survives a restart as `running`"）。② 方案写"全过才算开跑完成"，等于本体开跑被一项预期不过的接入期能力卡死。③ 调整清单把这项冒烟放在**接入期**，方案把它提进本阶段验收，两份文档口径冲突。 | issue #106678；API Server 页「gateway shuts down… persisted as `interrupted`」；`hermes-adjustments.md` §3 与汇总「接入期」 | 把本阶段验收第 2 条拆成两项：本阶段只验"挂起不超时丢失 + 不重启可走完"；"重启恢复"作为**已知大概率不过**的接入期测项，结果直接驱动 C 的兜底设计，不挡开跑。 |
| R4 | §3.3 | 风险遗漏（安全） | 重要 | "Docker 加固后端"只是个名字，隔离强度由容器参数决定，方案一项没钉：`docker_volumes`、`docker_mount_cwd_to_workspace`、`docker_forward_env`、`docker_network`、`container_persistent`。文档还明说终端后端隔离**不覆盖**进程内插件、hooks、技能加载与 MCP 代码。另外默认 `container_memory` 是 5120 MB，与调整清单"VPS ≥2GB"的规格预留冲突。 | 官方 Security 页 Docker 配置段；Configuration 页 Docker Volume Mounts / Credential Forwarding；corrupted.io 部署指南（三方，引述官方安全策略） | §3.3 写目标值：`docker_forward_env` 为空、不挂宿主目录（或只读挂载）、按需断网、`container_persistent: false`、容器资源上限与 VPS 规格匹配；写明"终端隔离 ≠ 进程隔离"，作为 R1(b) 的取舍依据。 |
| R5 | §3.4 + §8-A（连带 `hermes-adjustments.md` §4"本体记忆降为草稿/缓存语义"） | 事实错误 | 重要 | 上游文档原文：外部 memory provider "run **alongside** built-in memory (never replacing it)"。也就是说，占住 MemoryProvider 槽**不会**让内置 MEMORY.md / USER.md 退场，两份记忆并存，"PAT 坐正唯一权威"靠占槽做不到。要让内置记忆退场，须同时设 `memory.memory_enabled: false` 与 `memory.user_profile_enabled: false`（文档明示外部 provider 不受影响）。 | 官方 Memory 页「Configuration」「External Memory Providers」 | §3.4 补一句：本阶段保留内置记忆（治理后）；接入期占槽时，必须同时决定是否关闭两处内置存储，否则形成双权威。此项须回写调整清单 §4 的口径。 |
| R6 | §3.4 第 2 条 | 可执行性 | 重要 | ① 两处关停写成了概念名，没写配置面，执行者容易关错。按文档，关后台复盘是 `auxiliary.background_review.enabled: false`，关策展是 `curator.enabled: false`；两个 nudge（`skills.creation_nudge_interval`、`memory.nudge_interval`）是否一并置 0 没有表态。② "若版本提供等效死上限可改为设上限"**大概率落空**：curator 的 `max_iterations=9999` 写死在 `agent/curator.py` 源码里，是上游有意为之（提交说明："natural stopping criterion is 'no more clusters'"），不是配置项。按方案"不改源码"的约束，只剩关闭一条路。③ 353M 事故的"全局兜底被拆"，是当事人自己**改源码**把 `max_session_tokens / max_session_cost_usd` 的硬编码默认值改成 0（无限）。方案没把"保留会话预算默认值、不得置 0"写进基线，这正是事故的另一半根因。 | Memory 页 `auxiliary.background_review.enabled`；skillsdirectory 收录的配置样例（三方）；tangled.org 镜像的 curator 提交说明；veduis.com 事故复盘（三方） | §3.4 写成配置键 + 目标值；删掉"可改设上限"的分支，直接定为关闭；补一条"会话 token/费用预算保持非零上限"，并在 provider 侧设消费上限作为第二道熔断。 |
| R7 | §3.4 第 1 条 | 风险遗漏（记忆治理） | 重要 | 写入审批门挡不住"批准了坏写入"。#142069 里，0 字节写入来自后台 review 经 `skill_manage write_file` 写入空内容，这条路径跳过了 frontmatter 校验（P3，open，0.22.2 仍在）。开了 write_approval 后，这条写入会进待审队列，但审批人只看一行 gist 就批，照样会清空技能。另外，即使闸门关着，后台 review 也会对 patch/remove 发起暂存；本阶段零渠道，待审项只能在 CLI 处理，会持续堆积。 | issue #142069；Memory 页「Controlling memory writes」「Controlling skill writes」 | 补审批纪律：技能写入批准前必须看 `/skills diff` 全文，空内容或体量骤降一律拒绝；写明待审队列的处理节奏与入口（本阶段 = CLI）。如 R6 已关闭后台 review，本条风险相应缩小，但前台写入仍适用。 |
| R8 | §3.1 + §6 安全实证 | 事实错误（已可钉死）+ 可执行性 | 重要 | ① CVE-2026-71963 的修复状态已经可以钉死，不必再写"说法不一、自查"：NVD / VulnCheck 记录的受影响范围是 0.18.2–0.21.0，修复提交为 `f6234d0`，CVSS 4.0 评分 8.6（另一来源按 3.x 给 8.8）。"二手源说未修"的说法来自 9 月初的报道。② 上游已有 0.22.x（#142069 报告环境为 0.22.2），方案"≥v0.21.6"只给了下限，没钉具体版本和通道。这与 E10「钉死版本」、§7「版本无漂移」的验收都对不上。③ 方案没定安装形态（git 安装 / pip / 官方整进程容器），升级快照、回滚机制、"关自动升级"的落点都取决于它，R1(b) 也取决于它。 | mallory.ai CVE-2026-71963 条目；safeguard.sh 分析（2026-10-18 复核）；Tenable TRA-2026-65（Dashboard PKCE 会话接管，修于 0.21.6）；issue #142069 环境栏 | §3.1 改为：钉死一个具体版本号（≥0.21.6 且包含 `f6234d0`）+ 通道 + 安装形态；CVE 一项改为"已修于该范围之后，执行时核对版本包含该提交"。 |
| R9 | §3.5 凭据 + §3.3 | 风险遗漏（数据主权） | 重要 | ① `auth.adopt_external_logins` 默认 **true**：会借用机器上的 `~/.codex/auth.json`、`~/.claude/.credentials.json` 等外部登录凭据，属于 E6 要求显式关掉的"权限放行"类默认值。方案的默认值审计没覆盖到。② GitSpawn 一类漏洞的实际危害是"进程环境与 provider key 外泄"，0600 和磁盘加密都挡不住**运行时**泄露。方案缺 git 侧兜底姿态（禁用仓库级 fsmonitor 一类外部命令配置），也没说明工作区只接受自己创建的仓库。 | Security 页「adopt_external_logins: default true」；mallory.ai CVE 条目「exposes the full environment, including configured provider API keys」 | §3.5 增加 `adopt_external_logins` 的目标值 false；§3.3 增加"工作区仓库来源受控 + git 外部命令配置禁用"的姿态（只写姿态，不写命令）。 |
| R10 | §2 理念 + §7 验收 | 风险遗漏（运维） | 重要 | 设计采收册 E1「永不信自报成功、外部看门狗」在方案里完全缺席。上游恰好有"自报成功"的实锤：#137967，curator 截断仍记为 completed，发生于 v0.21.7。§7 的"治理开关逐项回读"读的是配置，证明不了行为。方案也没有 token 消耗与费用的外部观测，353M 事故正是靠人第二天看配额才发现的。 | `design-harvest.md` E1/E2；issue #137967 | §7 增加一项外部信号验收：provider 侧用量告警或消费上限、关键状态文件变化监视（技能/记忆目录）至少其一；把 E1 列为理念或前置条件。 |
| R11 | §4 首行 | 正确性（纸面满足） | 建议 | "开放协议接入（MCP/HTTP）｜本阶段（面就绪）"有夸大：本阶段既不配 MCP，也不接数据层，就绪的只有 API Server 这一个 HTTP 面。 | 方案 §3.6、§5 | 改为"HTTP（API Server）面就绪；MCP 接入期"。 |
| R12 | §3.6 预留 Webhook route | 阶段边界 | 建议 | 文档对 webhook / api_server 会话的 `approvals.unattended_mode` 默认 deny（危险命令立即阻断，不等超时）。如果采用 R1(a) 的容器档，这一层同样被跳过，设备路由的唯一闸只剩"窄 toolsets"。这件事属接入期，但预留配置面时应当知道。 | Security 页 `unattended_mode` | 桥方案成文时写明：设备 route 的约束以 toolsets 收窄 + `approvals.deny` 为准，不依赖危险命令审批。 |

## 3. 重点议题表态

| 议题 | 立场 | 一句话依据 |
|---|---|---|
| A 占槽节奏 | **同意次序，但前提要改** | 先治理原生、后占槽，与两线的节奏差匹配；但占槽≠替换（R5）。接入期方案必须同时决定内置两处存储关不关，否则"让渡权威"会落空成"双权威"。 |
| B 凭据基线 | **同意 0600 + 磁盘加密作为本阶段基线，但不够，须补两条零运维成本项** | 磁盘加密只防离线取盘；真实威胁是运行时外泄（GitSpawn 类）。补 `adopt_external_logins: false`，以及"provider key 设消费上限 / 专用低额度 key"——都是一次性配置，不增加日常运维（R9、R6）。密钥注入放迭代期，同意。 |
| C 审批长挂起 | **判据不充分；兜底方向成立** | 判据须补三点：明确 timeout 值（R2）、区分 gateway 与 runs 两条审批路径分别测、把"重启恢复"预设为大概率不过（#106678 内存队列；runs 关停落为 `interrupted` 终态，R3）。兜底"分段 run + 状态存 PAT 侧"成立，且与蓝图"状态在数据层 / Agent 侧、桥无状态"一致；建议直接在接入期方案按此设计，不必等冒烟结果。 |
| D 渠道分工 | **正确，不保守** | 零渠道即零外部入站身份面，和"开放逐项挣来"一致；而且渠道接入涉及舰队身份分工（D 本身），提前接会锁死身份边界。代价是待审写入只能在 CLI 处理（R7），可接受。 |
| 桥约束六条 | **基本充分；建议补两条** | ① **入站鉴权与限流/幂等**：桥是全舰收敛点，六条只管"翻译正确"，没管"谁能调桥"。上游 Webhook 的 HMAC + 限流 + delivery-ID 幂等可直接借鉴（`design-harvest.md` A2）。② **桥自身不握 Agent 高权凭据之外的权力**（最小权限，每个 adapter 独立凭据，呼应调整清单 §9）。条 1"不持有会话状态"与条 3"按能力降级"需注意：长挂起审批的状态必须落在 PAT 侧存储而不是桥内存，与 C 的兜底一致，不冲突。 |
| 设计理念五条 | **无内部冲突；有一处未覆盖面** | 五条互相一致。未覆盖：**"成功须外部验证"**（E1）——理念 1 说"数据可信优先"，却没有任何机制保证不被系统自报的成功骗（R10）。建议作为第六条，或并入理念 1。另外理念 2"默认收口"与 R1 存在张力：收口执行面（Docker）会关掉另一道闸（审批），理念层应承认"闸可能互斥，须显式取舍"。 |

## 4. 建议重议

无。节点选型（Hermes）、节奏分工、许可证、公开策略、蓝图本身，本评审均无硬证据支持重议。R1–R3 是配置与验收层的问题，不动摇选型结论；E9"失败模式已知"在本评审中反而再次得到印证——上游的审批丢失、写入事故都有 issue 可逐条设防。

## 附：待汇总方注意的跨文档口径

- 调整清单 §4"本体记忆降为草稿/缓存语义"与上游"providers run alongside built-in memory"不符（R5），属整体线自有文档，按规范由整体线修订。
- 调整清单把审批长挂起冒烟列为接入期，方案 §7 列为本阶段验收（R3）——两处须统一。
- 蓝图 `architecture-v1.md` 第 77、149 行引用 `docs/research/working-memory-candidates.md`，实际路径已迁至 `platform/research/`；调整清单第 5 行引用 `repo/docs/...` 同为旧路径。不影响本评审结论，记此备查。
