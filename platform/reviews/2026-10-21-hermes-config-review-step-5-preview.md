# 评审意见：step-5-preview 对 Hermes 配置方案

> 状态：已提交评审
> 维护线：评审方-step-5-preview
> 最后更新：2026-10-21
> 摘要：总体结论「有条件通过」——方案的方向、治理姿态与选型逻辑成立，全部可核验的外部事实（版本线、CVE、issue、API 面、配置键、默认值）经上游逐项核对基本属实；但版本基线已过期、自治机制清单不全、SSRF 默认与 PAT 内网拓扑对撞、议题 C 冒烟判据缺参数、议题 B 框架需修正，共 11 条意见（6 条执行前置条件，5 条建议/待核）。核查记录见文末附录。

---

## 1. 总体结论

**有条件通过。** 方案的五条设计理念与「治理先行」的底色是本轮看到的同类文档里最硬的，我拿上游核了一圈，承重事实全部立得住（v0.21.6 的 Dashboard 修复、CVE-2026-71963、Issue #142069、Runs API 端点族、审批默认值、Docker 加固参数，逐一有出处）。但开跑前的清单还欠一层：版本基线落后上游 15 个补丁、自治面清点漏了整个调度族、一个默认安全开关会正面挡死 PAT 自己的数据层接入。补课量约半天到一天，不伤方案本身。

**通过条件（执行前必须处理）**：意见 1、3、4、5、6、7。
**建议处理**：意见 2、8、9、10、11。

## 2. 逐条意见

| # | 位置 | 类别 | 严重度 | 一句话意见 |
|---|---|---|---|---|
| 1 | §3.1 / §6 | 事实错误（过期） | 重要 | 版本基线「≥v0.21.6」已落后当前 stable（v0.22.3，评审日前一天发布）15 个补丁，须改为「安全下限 + 执行时按安装版本复核」 |
| 2 | §6 | 事实错误（已了结） | 建议 | CVE-2026-71963「修复状态说法不一」的表述已过期，独立追踪源已确认修复在 ≥v0.21.1 |
| 3 | §3.4（对照理念 5） | 风险遗漏 | 重要 | 自治机制清单只列 curator + background_review，漏了 cron / heartbeat / loops / goals / 每小时维护计时器 / 内置插件 / 插件目录 |
| 4 | §3.2 / §4（接入期） | 风险遗漏 / 可执行性 | 重要 | `security.allow_private_urls` 默认 false 封禁内网地址，与 PAT 数据层/记忆层的内网拓扑正面相撞，方案未提 |
| 5 | §7 冒烟 / §8-C | 可执行性 | 重要 | 「审批挂起数小时」缺三个参数：timeout 设多少、过期后能否重发、走 API 还是 webhook 通道——不参数化则冒烟结论不可判 |
| 6 | §3.4 | 风险遗漏 | 重要 | #142069 根因在 `skill_manage` 工具层且**前台可达**，关停后台写入者只消触发路径不消缺陷，缺运维观察项 |
| 7 | §3.5 / §8-B | 事实错误（框架性） | 重要 | 「密钥注入类改造」不是改造——Bitwarden / 1Password / command helper 三源全是配置级，B 的决策前提要重写 |
| 8 | §3.3 / §3.4 / §7 | 建议（增益） | 建议 | Managed Scope、`HERMES_WRITE_SAFE_ROOT`、`GET /v1/capabilities` 三个原生机制可零成本加固，未用 |
| 9 | §3.2（理念 2） | 风险遗漏 | 建议 | 「默认收口」只收了入口没收出口：官方有 Docker 网络分段与 iron-proxy 两层出口管控现成机制 |
| 10 | §6 | 正确性（文档） | 建议 | 「全文见本仓调研记录」引用悬空——platform/ 无此文档，新评审方无法追溯原始评估表 |
| 11 | §3.4 / §3.5 | 待核 | 建议 | 三项执行时核：占槽后的「内置记忆镜像写入」治理、插件隔离成色（v0.21.6 起有 `plugins.isolation`）、webhook 限流/幂等/签名细节 |

### 2.1 意见 1 详述：版本基线过期，且补丁窗口是火焰喷射器

- **位置**：§3.1「目标版本 ≥ v0.21.6」、§6 安全实证。
- **意见**：截至评审日（2026-10-21），上游最新 stable 是 **v0.22.3（2026-10-21 发布）**；v0.22.0 是官方自称「迄今最大发布窗口」（约 2.5 倍于 v0.21.0 周期、代码库小三分之一、600 插件目录、安装器自此默认跟随 stable）。v0.21.5→v0.21.6 **一个补丁窗口**就含 8,867 个 non-merge commit、2,106 个合并 PR、3,027 个关闭 issue。以 v0.21.6 为「目标版本」等于主动部署一个落后 15 个补丁的版本；更关键的是，方案全部配置断言（键名、默认值、行为）都建立在 ≤v0.21.6 的传说上，按 v0.22.x 安装时逐项都有漂移风险。
- **证据**：GitHub Releases——[v0.21.6](https://github.com/NousResearch/hermes-agent/releases/tag/v0.21.6)（2026-10-08，「first release cut by the new stable release pipeline」，附窗口统计）、v0.22.0（「tested SemVer stable releases that installs follow by default」）、v0.22.3（2026-10-21）。
- **建议改法**：§3.1 改为「**安全下限 ≥v0.21.6（Dashboard 修复线）；执行时安装当前 stable，按安装版本逐项复核本方案全部配置键与默认值，安装版本号 + config 哈希入冒烟档案**」。另：`hermes-adjustments.md` §7「v0.21.7 起默认跟 stable 通道」不准确——stable 管线首 cut 于 v0.21.6（彼时仅 Docker/Cloud），安装器默认跟随 stable 自 v0.22.0 起，建议同步修正。

### 2.2 意见 2 详述：CVE 修复状态已可了结

- **位置**：§6 安全实证「CVE-2026-71963（GitSpawn，CVSS 8.6，二手源对其修复状态说法不一，故要求按版本自查）」。
- **意见**：「说法不一」是 9 月的历史时点。截至评审日，Rapid7 漏洞库、VulnCheck、Safeguard 及独立追踪（diego-rodriguez.work，2026-10-14 核）一致确认：修复在 commit `f6234d0`（PR #101483，2026-09-02 合并），包含于 **v0.21.1（tag v2026.9.7）及以后**；v0.21.6 另修 repository filter programs 路径（PR #130661）。原「未修」说法源于 Manifold 报告针对 2026-09-01 的 0.21.0。方案要求「≥v0.21.6 + 自查」的结论方向正确且更保守，可保留为纪律，但表述应更新。
- **证据**：[Rapid7 CVE-2026-71963](https://www.rapid7.com/db/vulnerabilities/cve-2026-71963)（CVSS v4 8.6 / v3.1 8.8，影响 0.18.2–0.21.0，修复 commit f6234d0，未入 CISA KEV）；[GitSpawn 追踪](https://www.diego-rodriguez.work/blog/gitspawn-coding-agent-git-config-rce-2026-hardening)（f6234d0 含于 v2026.9.7/v0.21.1+；v0.21.6 另修 filter programs）；v0.21.6 release notes「Repository git filter hardening」。
- **建议改法**：§6 改为「修复已确认于 ≥v0.21.1；≥v0.21.6 另关闭 filter programs 路径；自查动作保留为升级后纪律」。

### 2.3 意见 3 详述：自治机制清单漏了整个调度族

- **位置**：§3.4（对照 §2 理念 5「凡会自己运行的后台机制，必须有迭代/预算上限或关闭」）。
- **意见**：§3.4 只关 curator 与 background_review。但当前产品表面的自运行机制至少还有：**内置 cron**（自然语言任务、可向任意平台投递；`approvals.cron_mode` 默认 deny 是好默认但机制存在）、**无 LLM 脚本 cron**、**session heartbeat**（`/heartbeat` 周期重入会话）、**recurring loops**、**persistent goals**（Ralph 式跨轮长目标）、**serve/dashboard 的每小时维护计时器**（文档明示独立于 cron，curator 由它触发）、**经生命周期钩子自动运行的内置插件**（disk-cleanup 等）、**一键安装的插件目录**（600+ 插件，属供应链面，对照 design-harvest E11）。理念 5 的宣称与执行清单之间的缺口，就是开跑第一天真实使用时会自己长出来的东西。
- **证据**：官方文档索引（cron / heartbeat / loops / goals / built-in-plugins / plugin-catalog 各页）；[Curator 文档](https://hermes-agent.nousresearch.com/docs/user-guide/features/curator)（「serve/dashboard 后端共享每小时维护计时器，独立于 cron 作业」）；security 页（`approvals.cron_mode` 默认 deny）。
- **建议改法**：§3.4 增加「**自治面清点**」子项：开跑前逐项确认 cron 存储为空且无任务（含暂停态——暂停的 cron 仍被 curator 视为引用）、heartbeat 关闭、无 standing goals、内置插件逐个明确态（disk-cleanup 至少要知道它在跑）、插件目录零安装（PAT 自有 MemoryProvider 插件到接入期才进）；清点结果纳入 §7 冒烟回读。

### 2.4 意见 4 详述：SSRF 默认开关会挡死 PAT 自己的数据层

- **位置**：§3.2 网络暴露面、§4 映射表「开放协议接入」、接入期 MCP 计划。
- **意见**：Hermes 默认 `security.allow_private_urls: false`，SSRF 防护默认封禁 RFC1918 私网、环回、链路本地、CGNAT 与云元数据地址。而 PAT 的数据层 MCP server 与共享记忆层按蓝图就在内网/本机。默认状态下，Hermes 作为 MCP client 连不上 PAT 自己的服务——这正是 design-harvest **E5** 记录的 IronClaw 62 分结构性教训的同款形态：安全默认与部署拓扑对撞，方案只字未提。MCP client 对内网 HTTP 端点是否受同一 flag 约束，执行时须核；但即使不受，agent 的 fetch 类工具同样摸不到内网，接入期设计必须回答这个问题。
- **证据**：[Security 文档](https://hermes-agent.nousresearch.com/docs/user-guide/security)（「SSRF 防护：默认阻止 RFC 1918 私网、环回、链路本地、CGNAT 及云元数据地址；`security.allow_private_urls` 默认 `false`」）；design-harvest E5。
- **建议改法**：§3.2 或接入期前置显式立项：①优先选 **stdio transport** 的同机 MCP server（本地子进程，无网络暴露，绕开整个问题）；②若必须 HTTP 内网端点，把 `allow_private_urls` 作为一处**显式收窄的例外**记录理由与范围（该 flag 是全局的，开了就连云元数据一起放），并与 Docker 网络分段（Network Egress Isolation）组合把暴露面关小。E5 的纪律：拓扑对撞列为必测项，不许默认牺牲拓扑主权，也不许默默关安全开关。

### 2.5 意见 5 详述：议题 C 的冒烟判据缺三个参数

- **位置**：§7 冒烟第 2 项「审批挂起数小时且期间重启进程，审批可恢复并走完」、§8-C。
- **意见**：这条判据目前不可判，缺三个参数：① **timeout 设多少**——`approvals.timeout` 默认 **300 秒**，超时即拒绝，且「过期的批准提示无法重新打开」。要挂起数小时就必须显式调大 timeout，而调大本身削弱 fail-closed 姿态，方案的测试态/运行态 timeout 策略未交代；② **「可恢复」判什么**——文档显示 `POST /v1/runs/{id}/approval` 解决待审批项，且有 `POST /v1/runs/{id}/resolve-unknown`（restart-unknown admission 的权威恢复端点，canonical admission 在适配器重启后仍保留 owner scope）。「重启后原审批项仍在且可解」与「重启后需重新发起一次审批」是两种不同结局，冒烟必须分清；③ **走哪条通道**——无人值守默认即时拒绝（`unattended_mode: deny`），但文档明确「能够响应审批卡的 api_server 会话仍会收到审批请求」是例外——测试必须走 API Server 通道，不能走 webhook 通道，方案未点名。
- **证据**：Security 页（`approvals.timeout` 300s、超时拒绝、过期提示不可重开、`unattended_mode` deny 及 api_server 例外）；[Programmatic Integration 文档](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration)（`/v1/runs/{id}/approval`、`/v1/runs/{id}/resolve-unknown`、「Feature-detect `features.run_unknown_resolution`」）。
- **建议改法**：冒烟项改写为带参数的三连测：**配置态 timeout 值明示 → 挂起 ≥2 小时 + 期间重启进程 → 判决矩阵**（状态保留且可解 = 通过；状态保留但需重发审批 = 有条件通过，触发 PAT 侧分段 run 设计；状态丢失 = 不通过，兜底必须进接入期方案）。C 的兜底讨论以此为唯一输入。另：`/resolve-unknown` 与 canonical admission 的 owner-scope 设计是重启恢复的正面工程证据，冒烟应优先测这条权威路径。

### 2.6 意见 6 详述：#142069 是工具层缺陷，前台可达

- **位置**：§3.4（#142069 作为关停 background_review 的依据）、§6 事故实证。
- **意见**：方案对 #142069 的引用准确，但我核了上游：该 issue **至今 open 未修**（影响 0.22.2 与 main，根因在 `tools/skill_manager_tool.py`——`write_file` 路径不校验空内容，`patch`/`content` 路径有 `_validate_frontmatter` 它没有）。这意味着：关停 background_review 消除了**已知触发路径**，但消除不了**工具层缺陷本身**——前台 agent 在正常对话里一次 `skill_manage(action=write_file, file_path=SKILL.md, file_content="")` 就能把技能打成 0 字节。curator 有快照/回滚/审计账本可部分兜底，但那是 curator 的机制，不覆盖前台写入路径。另需核：`skills.write_approval` 是否覆盖 `skill_manage` 的 write_file 路径——若覆盖，审批门是这条路径的有效刹车；若不覆盖，写入审批门对它无效，这个事实要写进运维 runbook。
- **证据**：[GitHub Issue #142069](https://github.com/NousResearch/hermes-agent/issues/142069)（open；「identical on `main` at `d923a5e` and in 0.22.2」；复现脚本自包含；0 字节 sha256 e3b0c442…）。
- **建议改法**：§3.4 补一条运维观察项：定期检查 skills 目录 0 字节/异常 SKILL.md（或利用 curator 审计账本做告警源）；执行时核实 write_approval 对 skill_manage write_file 的覆盖性并记录结论。

### 2.7 意见 7 详述：议题 B 的决策前提要重写

- **位置**：§3.5「凭据存放接受基线方案：密钥文件权限 0600 + 整机磁盘加密（调整清单取舍项 B 的建议结论，待用户确认）；密钥经安全输入进入机器」、§8-B「密钥注入类改造放迭代期」。
- **意见**：B 把「密钥注入类改造」描述为需要旁路改造、引入新组件、额外工作量——**这个前提不成立**。Hermes 原生支持外部秘密管理源，且全是配置级：Bitwarden Secrets Manager（`bws` CLI，免费档可用）、1Password（`op` CLI，`op://` 引用）、command helper（`pass` / `keepassxc-cli` / `secret-tool` / 任意打印 `KEY=VALUE` 的自定义脚本），`config.yaml` 的 `secrets.sources` 配好即用，还有 override/precedence/来源标注一整套治理。用 command helper 甚至不引入任何新组件。另一方面，方案的基线本身有官方背书——生产部署清单第 4 条正是「密钥放 `~/.hermes/.env` 并 chmod 600」；且子进程环境默认剥离 Hermes 托管凭据（仅 `terminal.env_passthrough` 声明项透传，provider 凭据不可声明），显著降低了 .env 方案的爆炸半径（对照意见 2 的 CVE：受影响版本的注入命令可读取完整进程环境）。
- **证据**：[Secrets 文档](https://hermes-agent.nousresearch.com/docs/user-guide/secrets)（三源、precedence ladder、child-process sanitized environment）；Security 页生产清单 #4。
- **建议改法**：B 的表述改为「**基线（.env 0600 + 磁盘加密）为阶段一地板，官方背书成立；密钥注入不是改造而是配置项（小时级），是否提前由用户按风险接受度定**」。子进程环境剥离作为支持基线保留的实证记入。

### 2.8 意见 8 详述：三个现成机制可零成本加固

- **位置**：§3.3 / §3.4 / §7 / 桥约束六条第 3 条。
- **意见**：① **Managed Scope**（系统级受管目录，管理员钉住用户不可改的配置与秘密）——可把治理基线（approvals、两处 write_approval、curator 关、webhook route 配置）钉成 agent 自己都改不动的结构，把理念 1 从「配置纪律」升级为「结构强制」，这正是本方案「治理先行」的终极形态；② **`HERMES_WRITE_SAFE_ROOT`**（官方 Docker 镜像即设 `/opt/data`）——把 `write_file`/`patch` 关进目录前缀，与 Docker 后端叠成双壳，补 local 后端「无沙箱」的锅；③ **`GET /v1/capabilities`**（机器可读特性位）——桥约束六条第 3 条「能力声明」可直接建立在它上面（文档原话「Feature-detect `features.run_unknown_resolution`」），adapter 不必猜下游能力。
- **证据**：官方文档索引（managed-scope 页「Administrator-pinned, user-immutable config and secrets」）；Security 页（`HERMES_WRITE_SAFE_ROOT`，官方 Docker 镜像设 `/opt/data`）；Programmatic Integration 页（`GET /v1/capabilities`「Machine-readable feature flags」）。
- **建议改法**：§3.3/§3.4 增补三项为「开跑前建议项」（managed scope 若采用，执行前置确认所装版本的支持状态）；桥约束六条第 3 条引用 `/v1/capabilities` 作为能力声明的抓取源。

### 2.9 意见 9 详述：出口管控缺席

- **位置**：§3.2（对照理念 2「默认收口、按需开放」）。
- **意见**：理念 2 的收口清单覆盖了入口（API 绑定、渠道、云组件），没覆盖 agent 自己的出口。官方有两层现成机制：**Network Egress Isolation（Docker）**——沙箱只够访问白名单主机；**iron-proxy**——出口凭据注入代理（凭据不进 agent 环境，出口调用时代理注入）。数据主权姿态下「agent 能往哪出网」应与「谁能进来」同级。这不是阶段一阻塞项，但应在方案里显式归位（本阶段最小集 or 接入期），而不是缺席。
- **证据**：官方文档索引（egress / egress/network-isolation「Segment Docker networks so the agent sandbox can only reach allowlisted hosts」/ iron-proxy「Egress credential-injection proxy」各页）。
- **建议改法**：§3.2 增加一行出口基线（建议本阶段最小集：模型 API 域名白名单 + Docker 网络分段），或显式记入接入期并注明理由。

### 2.10 意见 10 详述：引用悬空

- **位置**：§6「适配度评估（六成品 × 五契约面，文档 + 源码级核验，无活体冒烟）：Hermes 92 分居首……全文见本仓调研记录与 design-harvest.md 相关条目」。
- **意见**：本仓 `platform/` 并无「选型调研记录」这份文档，区 README 索引亦无——引用悬空。决赛对比与事故实证的细节目前只存在于方案自述与 design-harvest 的相关条目，新评审方无法追溯原始评估表（六家怎么打的、92 分怎么来的、翻盘条件原文）。按 AGENTS.md「引用不复制、可定位」的精神，这是文档缺陷。
- **证据**：`platform/` 现有文件清单与 README 索引（2026-10-21 核）。
- **建议改法**：把选型调研记录（六成品评估表 + 决赛对比 + 翻盘条件）补入 `platform/` 并更新区索引；或把 §6 该句改为指向现存文档的真实位置。

### 2.11 意见 11 详述：待核小项（执行时核，不影响结论）

1. **占槽后的镜像写入**：「MemoryProvider 单槽」已证实（文档原话「Only one external provider can be active at a time」），且激活外部 provider 后 Hermes 会自动「将内置记忆写入镜像到外部提供器」。方案 §3.4 表述准确；但接入期占槽插件设计必须把这条镜像路径纳入治理与 §3.7 归属打戳范围——否则共享层会被未经审批的本体镜像污染，「记忆不垄断」在占槽当天反而破防。
2. **插件隔离成色**：「插件进程内运行、非沙箱」的表述在 v0.21.6 起有 `plugins.isolation: host`（per-profile plugin host）选项，v0.22.x 的实际隔离成色须按安装版本重核后再决定是否写进部署检查单。
3. **webhook 细节**：design-harvest A2 的限流/幂等/签名细节（30 次/分/route、1MB body、1 小时幂等、V2 时间戳签名）本轮未逐项核到官方文档原文；接入期桥设计前补核（不影响本阶段，本阶段不建桥）。

## 3. 重点议题表态

- **A 占槽节奏**：同意「先治理后占槽」。单槽已证实，早占槽会在共享记忆线就绪前空占且关掉其他选项；两步走还顺带用真实使用验证治理基线。补一条（见意见 11.1）：占槽插件设计必须预置「内置记忆镜像写入」的治理与打戳，否则共享层被本体镜像污染。
- **B 凭据基线**：同意基线保留为阶段一地板——但按意见 7 修正框架：密钥注入是配置级选项（小时级）不是「改造」，是否提前由用户按风险接受度定；子进程环境剥离是支持基线保留的实证。基线 + 磁盘加密对个人自用阶段足够，不构成阻塞。
- **C 审批长挂起**：同意「冒烟裁定、不预设纸面结论」——但判据须按意见 5 参数化（timeout 明示、过期重发路径、API 通道、判决矩阵）。文档里的 `/resolve-unknown` 与 canonical admission owner-scope 是重启恢复设计的正面证据，冒烟优先测权威路径。若不过，兜底方向（分段 run + 状态存 PAT 侧）成立，且与桥约束「薄且无状态」天然兼容。
- **D 渠道分工**：同意本阶段零渠道，且这不是保守是正确：网关授权默认全拒（无 allowlist 时所有用户被拒，启动有警告）、配对码机制成色好（8 字符、1 小时过期、5 次失败锁 1 小时）——渠道晚接不欠技术债。D 到迭代期要定的真正问题是「渠道身份归属」而非「能否接上」。
- **桥约束六条**：充分，无多余，无缺失。两条补强：第 3 条「能力声明」可机械化为 `GET /v1/capabilities` + feature-detect（见意见 8.③）；建议把「私网/SSRF 配置面」（意见 4）列入 adapter 必须显式声明的配置面之一——它是唯一一个「不开就连不上 PAT 自己服务」的开关，静默默认是最危险的。
- **设计理念五条**：彼此无冲突。一个未覆盖的面：理念 2「默认收口」的清单缺「自治调度面」（意见 3）与「agent 出口面」（意见 9），建议各补一行或并入口径，否则理念 2 在执行清单里会漏成筛子。

## 4. 「建议重议」专节

无。本轮评审未发现与已定案事项（Hermes 选型、两线节奏、Apache-2.0、公开策略、架构蓝图）冲突的意见。意见 1/2 属事实更新，不触及选型结论；意见 7 属用户取舍项 B 的表述修正，决策权在用户。

## 附录：上游核查记录（2026-10-21，评审方可审计）

| 断言 | 出处 | 结论 |
|---|---|---|
| CVE-2026-71963（GitSpawn，CVSS v4 8.6 / v3.1 8.8，影响 0.18.2–0.21.0，修复 commit f6234d0，未入 CISA KEV） | [Rapid7](https://www.rapid7.com/db/vulnerabilities/cve-2026-71963)、[Safeguard](https://safeguard.sh/resources/blog/cve-2026-71963-hermes-agent-git-fsmonitor)、[GitSpawn 追踪](https://www.diego-rodriguez.work/blog/gitspawn-coding-agent-git-config-rce-2026-hardening) | 属实；修复含于 v0.21.1+，v0.21.6 另修 filter programs |
| v0.21.6 修 Dashboard 预授权（含会话接管，#130685，Tenable TRA-725–728） | [v0.21.6 release notes](https://github.com/NousResearch/hermes-agent/releases/tag/v0.21.6) | 属实（另修 X-Forwarded-For 限权重置、auth 日志无界写入、/auth/ 无 body 限制） |
| Issue #142069（后台 review 致 SKILL.md 0 字节并跨机同步） | [Issue #142069](https://github.com/NousResearch/hermes-agent/issues/142069) | 属实；**至今 open 未修**，影响 0.22.2 与 main，前台路径可达 |
| Runs API 端点族（POST /v1/runs、/approval、/steer、/stop、/events SSE、/resolve-unknown） | [Programmatic Integration](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration) | 属实（另有 /v1/capabilities、/v1/responses） |
| 审批默认值（mode smart、timeout 300s fail-closed、unattended/cron deny、Hardline 不可覆盖） | [Security](https://hermes-agent.nousresearch.com/docs/user-guide/security) | 属实 |
| Docker 后端加固（cap-drop ALL、no-new-privileges、pids-limit、tmpfs） | 同上 | 属实（方案引用准确） |
| DeepSeek / Kimi 原生支持 | [Providers](https://hermes-agent.nousresearch.com/docs/integrations/providers) | 属实（deepseek；kimi-coding 国际 + kimi-coding-cn 中国，共 40+ 原生 provider） |
| MemoryProvider 单槽 | [Memory Providers](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory-providers) | 属实（only one external provider active；内置记忆始终并存且镜像进外部 provider） |
| Curator 默认开、可关、有快照/回滚/账本；背景 review fork 约每 10 轮 | [Curator](https://hermes-agent.nousresearch.com/docs/user-guide/features/curator) | 属实（consolidate 默认 false；prune 确定性 pass 常开；serve/dashboard 每小时维护计时器独立于 cron） |
| 外部秘密管理源（bws / op / command helper）为配置级 | [Secrets](https://hermes-agent.nousresearch.com/docs/user-guide/secrets) | 属实（子进程默认剥离托管凭据） |
| `security.allow_private_urls` 默认 false | Security 页 | 属实（RFC1918/环回/链路本地/CGNAT/云元数据） |
| 当前 stable = v0.22.3（2026-10-21） | [Releases](https://github.com/NousResearch/hermes-agent/releases) | 属实（v0.21.6 为 stable 管线首 cut；安装器默认跟随 stable 自 v0.22.0） |
| 网关授权默认全拒、配对码机制参数 | Security 页 | 属实 |
