# Hermes 阶段一配置执行与验收证据报告

> 状态：已执行，待验收方复核（存在未完成硬门槛）
> 维护线：整体线
> 最后更新：2026-10-28
> 摘要：PAT Hermes VPS 已升级至 v0.22.5，并完成治理收口、Docker 执行隔离、API 回环绑定、自治面清理及大部分行为验收；两小时 Runs 审批与服务商侧消费上限尚未取得合格证据，因此不声明 `hermes-config-spec.md` §7 全量通过。

## 0. 执行范围、判据与证据

- 判据：[`hermes-config-spec.md`](hermes-config-spec.md) §7。
- 回填清单：[`hermes-acceptance-checklist.md`](hermes-acceptance-checklist.md)。
- 安装对象：PAT 的 Hermes VPS，默认 profile。
- 远端证据目录：`/root/.hermes/acceptance/pat-20261027T235153Z/`，权限 `0700`，其中证据文件为 `0600`。
- 凭据红线：本报告只记录凭据属性、路径和权限，不记录任何 key、token 或密码值；配置哈希只覆盖不含密钥值的 `config.yaml`。
- 执行方总判断：核心运行路径和治理闸已落实，但 §7 的“两小时 Runs 审批”和“服务商侧消费上限”没有合格证据，当前只能提交验收方复核，不能宣称“开跑验收全过”。

## A. 部署三元组与版本

| 项目 | 实际值与证据 |
|---|---|
| 部署形态 | git 安装，目录 `/root/hermes-agent` |
| 安装通道 | stable，手动升级 |
| 版本 | Hermes Agent `v0.22.5`（2026.9.24），commit `bf0203a794a0`；Python `3.14.9`，OpenAI SDK `2.24.0` |
| 安全下限 | `v0.22.5 >= v0.21.6` |
| CVE-2026-71963 | 在安装仓执行 `git merge-base --is-ancestor f6234d0 HEAD`，结果 `yes` |
| 自动升级 | 未发现 Hermes systemd user timer；升级由人工执行，不启用自动升级 |
| 升级前快照 | `/root/hermes-pat-snapshots/20261028T072253/`，含配置、服务、记忆/技能/cron 及 SHA-256 |
| Hermes 自带升级备份 | `/root/.hermes/backups/pre-update-2026-10-28-072309.zip` |

升级时 VPS 的默认 Python 镜像源缺少 `setuptools==83.0.0`，改用官方 PyPI 后升级成功；升级后 `hermes config check` 通过。

**A 组结论：已落实。**

## B. 配置哈希与治理键回读

生效配置：`/root/.hermes/config.yaml`，SHA-256：

```text
3d1ddb2fc0da3dca087cf09a00cbd1699997f0b881050c99528d78a6bbdb5597
```

### B1. 治理键

| 配置键 | 实际值 |
|---|---:|
| `skills.write_approval` | `true` |
| `memory.write_approval` | `true` |
| `curator.enabled` | `false` |
| `auxiliary.background_review.enabled` | `false` |
| `skills.creation_nudge_interval` | `0` |
| `memory.nudge_interval` | `0` |
| `agent.max_turns` | `90` |
| `agent.run_budget_seconds` | `10800`（3 小时） |

Hermes 当前没有通用的“每会话 token/费用硬上限”配置；本次落实的是非零迭代上限与墙钟上限。服务商侧费用熔断见 F 组，尚未取得账户侧证据。

### B2. 凭据与模型

- `auth.adopt_external_logins: false`。
- `/root/.hermes/.env` 与 `/root/.hermes/config.yaml` 均为 `0600 root:root`。
- API Server key 已生成且长度校验通过，只保存在 `.env`；值未输出、未入仓。
- 实际主模型是 `claude-sonnet-5.5`，provider `custom:cloudrelay`，base URL `https://vpsairobot.com`。
- fallback 是 `gpt-6.1-terra`，base URL `https://fast.vpsairobot.com/v1`，`chat_completions` 模式。
- 这与规范所写“首个模型 DeepSeek / Kimi”不一致，是用户在部署后的明确路由选择；现有 key 是否“专用、可撤销、低额度”无法从 VPS 证明。
- 旧 Ark 的 6 个 provider 定义及 `ARK_API_KEY`、`ARK_BASE_URL` 已清除。

### B3. 可选云组件

- Nous Portal 未登录；`TOOL_GATEWAY_*`、`CONNECTOR_GATEWAY_*`、`HONCHO_*` 均未配置。
- Hindsight、Supermemory、Mem0、RetainDB、OpenViking 均无环境配置；外部 MemoryProvider 未启用。
- VPS 仍有既存的 Gemini 与 Tavily 凭据；Tavily 是当前 web 工具后端，Gemini 连通性检查返回 HTTP 400。本次未获授权删除这两项。

**B 组结论：有偏差。** 治理键已落实；模型选择偏离旧基线，服务商侧 key 属性和费用上限尚不可证，且 Hermes 没有通用的每会话 token/费用硬上限。

## C. 部署姿态回读

### C1. 常驻与 API

- systemd user service：`active`、`enabled`，`Restart=always`、`RestartUSec=5s`。
- API Server：`127.0.0.1:8642`；另一个 Hermes 本地控制监听同样只在 `127.0.0.1`。
- 受保护端点无 Bearer 返回 `401`，带有效 Bearer 返回 `200`；CORS 响应头不存在。
- Dashboard 未发现公网监听。公开 `/health` 是上游预期的存活探针；验收使用 `/health/detailed` 与 `/v1/capabilities` 验证鉴权。

### C2. Docker 执行后端

| 配置 | 实际值 |
|---|---|
| `terminal.backend` | `docker` |
| `terminal.docker_image` | `python:3.12-slim@sha256:12316debbfb86890f6b2d825820612741ba527ad5a44e3902759141d572bfe8f` |
| `terminal.docker_forward_env` | `[]` |
| `terminal.container_persistent` | `false` |
| `terminal.docker_volumes` | `[]` |
| `terminal.docker_mount_cwd_to_workspace` | `false` |
| `terminal.docker_network` | `false`（`--network=none`） |
| `terminal.container_cpu` | `1` |
| `terminal.container_memory` | `2048` MB |
| `terminal.container_disk` | `8192` MB（见限制） |

实测 cgroup 为 `cpu.max=100000 100000`、`memory.max=2147483648`，容器路由表只有表头。VPS 为 4 vCPU / 7.8 GiB RAM，根盘 40 GiB，执行后可用约 26 GiB。

限制与边界：

- 默认 `nousresearch/hermes-sandbox:desktop` 首次拉取超过 5 分钟无进展，故改为官方文档允许的任意 shell 镜像并按 digest 固定。当前没有容器内桌面、Chromium、Node 等完整 desktop 能力。
- 当前 Docker 存储驱动不支持 overlay2 on XFS `pquota`，所以 `container_disk: 8192` 已配置但没有形成内核强制磁盘配额。
- `docker_volumes: []` 且不挂载启动目录；Hermes 仍会自动只读挂载技能目录和缓存/附件目录，这是上游固定行为。验收命令审批期间曾临时挂载 `/root/hermes-workspace:/host-readonly:ro`，测试后已恢复为空并清理测试容器。

### C3. 其他安全项

- `security.allow_private_urls: false`。
- `HERMES_WRITE_SAFE_ROOT=/root/hermes-workspace`。
- 未建设宿主机域名级出口代理；Docker 工具容器完全断网，模型调用由固定 base URL 发起。Cloudflare 动态地址下仅靠主机防火墙做域名白名单不稳定，因此严格“模型 API 域名白名单”尚未落实。
- `approvals.mode: manual`、`approvals.timeout: 60`、`approvals.unattended_mode: deny`。
- `approvals.deny`：

```text
git push --force*
*curl*|*sh*
*wget*|*sh*
dd if=* of=/dev/*
mkfs*
*shutdown*
*reboot*
*systemctl*disable*hermes*
*rm -rf /*
```

- 本阶段未建 MQTT 桥、未接 PAT 数据层；Telegram 已按用户明确要求保留，因此不符合规范的“零消息渠道”。

**C 组结论：有偏差。** Docker、API、资源和审批收口已生效；默认 desktop 镜像未就绪、磁盘配额不受内核强制、域名级出口白名单未建立，并保留 Telegram。

## D. 自治面清点回读

| 项目 | 实际状态 |
|---|---|
| cron | `0 active, 0 total`；原 `Memory ROI 周维护` 已删除 |
| heartbeat | 未配置独立 heartbeat 任务 |
| standing goals / recurring loops | Kanban `no matching tasks`，未发现 standing goal 或 recurring loop |
| 第三方插件 | `hermes plugins list --user --json` 为 `[]` |
| 技能 | `0 hub-installed, 100 builtin, 0 local` |
| MCP | `mcp_servers: []` |
| 自动升级 timer | 无 Hermes user timer |

v0.22.5 发现 58 个已启用的内置插件注册项；它们是随发行版提供的能力/平台适配器，并不等于都已配置或正在运行。名称为：

```text
browser-browser-use, browser-browserbase, browser-firecrawl, basic, drain,
nous, self-hosted, default, deepinfra, fal, krea, meta-ai-image-gen,
openai, openai-codex, openrouter, xai, a2a-platform, bluebubbles-platform,
buzz-platform, dingtalk-platform, discord-platform, email-platform,
feishu-platform, google_chat-platform, irc-platform, line-platform,
matrix-platform, mattermost-platform, ntfy-platform, photon-platform,
qqbot-platform, raft-platform, signal-platform, simplex-platform,
slack-platform, sms-platform, teams-platform, telegram-platform,
wecom-platform, weixin-platform, whatsapp-platform, whatsapp_cloud-platform,
yuanbao-platform, deepinfra, fal, openrouter, xai, web-brave-free, web-ddgs,
web-exa, web-firecrawl, web-keenable, web-openai-native, web-parallel,
web-perplexity, web-searxng, web-tavily, web-xai
```

其中运行时实际配置的消息平台只有 Telegram；未发现 `disk-cleanup` 插件。7 个原本地技能已移出主动目录，归档在：

```text
/root/.hermes/disabled/local-skills-pat-baseline-20261027T233532Z/
```

变更前快照与监视：

- 快照工具：`/usr/local/sbin/hermes-governance-snapshot`，`0700 root:root`。
- 快照：`/root/.hermes/governance-snapshots/20261027T233556Z/`，含 tar 与逐文件 SHA-256。
- auditd 规则：`/etc/audit/rules.d/hermes-governance.rules`，`0600 root:root`；监视 `/root/.hermes/memories` 与 `/root/.hermes/skills` 的写入/属性变更。
- 最终审计日志中匹配 memory key 92 条、skill key 120 条，证明规则实际产生日志。
- 未启用第三方备份或同步；只保留本次升级备份和本地快照。

**D 组结论：已落实。**

## E. 冒烟证据

### E1. 对话与模型

- 主模型干净一轮返回 `PAT_MODEL_OK`。
- Docker 工具真实调用成功，回读 1 CPU、2 GiB、无网络路由。
- fallback 端点直接以 `gpt-6.1-terra` 请求返回 HTTP 200 和 `PAT_TERRA_OK`。
- 多次 Runs API 调用的输入规模约 130k-159k tokens，主 Claude 路由均完成；未复现此前旧 Telegram 长上下文的 Cloudflare 403。旧 Telegram 历史会话本身未做破坏性重放。

### E2. 命令审批三态

为触发上游在“存在宿主访问”时才启用的危险命令审批，测试期间临时增加只读挂载，完成后恢复最终配置。

| 场景 | 结果 |
|---|---|
| 批准 | Runs pending control 收到 `choice: once`，HTTP 200；命令 `exit_code=0`，run `completed` |
| 拒绝 | `choice: deny`，HTTP 200；命令 `BLOCKED`、`exit_code=-1`，run 正常结束 |
| 超时 | 60 秒无人响应，命令未执行，`BLOCKED`、`exit_code=-1` |
| 迟到批准 | 超时后的精确批准返回 HTTP 409 `stale_generation` |
| 不串请求 | 旧 prompt identity 发给新 run 返回 HTTP 409；新 run 仍保留自己的 pending control，随后被单独拒绝 |

生产 Docker 无显式宿主挂载时，常规危险命令检查按上游设计跳过；`approvals.deny` 仍硬拒绝。例如 `rm -rf /` 在 Docker 环境的 dry-run 结论为 `user-deny`。

### E3. Runs 长挂起

- 已验证短时 pending control、精确 identity、批准/拒绝/超时及 stale 语义。
- **未执行“审批挂起至少 2 小时、不重启后走完”的真实墙钟测试。** 短测不能替代该项。

### E4. 记忆/技能写入审批

记忆批准链路：API run 调用 memory 后只生成 `/root/.hermes/pending/memory/1163975f.json`，报告 `staged:true`；批准后才写入 `/root/.hermes/memories/MEMORY.md`。另一个 pending `2a07104c` 被拒绝后，记忆目录无对应文本。验收标记随后也通过审批门删除，最终 `MEMORY.md` 无测试残留。前后 SHA-256 位于远端证据目录。

技能 `write_file` 链路见 G 组。

### E5. 服务恢复

强制终止 gateway PID `3251634` 后，systemd 自动拉起新 PID `3253498`；API 恢复 HTTP 200，Telegram 重新连接 polling，服务最终为 `active`。

**E 组结论：有偏差。** 除两小时 Runs 挂起外，其余本体行为已取得实际证据；两小时项未做，因此不满足 §7 全过条件。

## F. 外部信号在位

### F1. 服务商侧用量信号

VPS 无法读取 Claude/Terra 服务商账户侧的告警、消费上限或 key 额度属性；本次没有用户提供的账户侧截图或控制台回读，因此该项无合格证据。

### F2. 目录变化监视

auditd 已 active，内核规则已加载：

```text
-w /root/.hermes/memories -p wa -k hermes-memory-write
-w /root/.hermes/skills -p wa -k hermes-skill-write
```

实际批准、拒绝和清理测试后，`/var/log/audit/audit.log` 已出现对应 key 的 syscall 记录。

**F 组结论：有偏差。** 目录监视已落实；服务商侧费用告警/上限未取得证据。

## G. 工具层观察项

通过 Runs API 明确调用 `skill_manage` 的 `write_file` 路径，参数为测试 skill、`references/zero-byte.md` 和空字符串内容。结果：

- 生成 pending `477f410c`，摘要为 `batch(1 ops: write_file)`；
- `/skills diff` 显示目标文件且为 `(no textual change)`；
- 主动技能目录没有创建目标文件；
- 拒绝后 pending 消失，技能目录无目标文件残留。

这证明 v0.22.5 的 `skills.write_approval` 覆盖了 #142069 相关的 0 字节 `write_file` 路径，写入在审批前不会落盘。

**G 组结论：已落实。**

## H. 偏差与未决事项

| # | 规范/目标 | 实际做法 | 原因或处置 |
|---:|---|---|---|
| 1 | 本阶段零消息渠道 | 保留 Telegram | 用户明确要求保留；已验证重启后 polling 恢复 |
| 2 | 首个模型 DeepSeek / Kimi | Claude Sonnet 5.5 + Terra fallback | 用户明确指定现行路由；两条端点均冒烟通过 |
| 3 | 默认完整 Docker sandbox | 固定 `python:3.12-slim` digest | 默认 desktop 镜像拉取停滞；当前牺牲容器内桌面/浏览器/Node 能力 |
| 4 | 容器磁盘上限 | 配置 8 GiB，但内核未强制 | 当前存储驱动不支持 XFS pquota |
| 5 | 模型 API 域名白名单 | 未建立宿主域名级代理 | 工具容器已断网，模型端点固定；Cloudflare 动态地址下主机 IP 白名单不稳 |
| 6 | 每会话 token/费用硬上限 | `max_turns=90` + `run_budget_seconds=10800` | Hermes 无通用对应硬上限；还需服务商侧熔断 |
| 7 | Runs 审批挂起 >= 2 小时 | 只完成短时三态与 stale 测试 | 未等待真实 2 小时，必须补测 |
| 8 | 服务商费用告警/上限 | 未验证 | 需要账户侧证据 |
| 9 | 当前 provider 配置结构 | `cloudrelay` 仍在旧 `custom_providers` | `hermes doctor` 提示应迁移到 `providers:`；现路由可用，未在本轮冒险改写 |
| 10 | 会话自动 reset | 旧 `session_reset.mode: both` 已被 v0.22.5 忽略 | 上游要求安装额外插件；本阶段零第三方插件，当前只用 `/new`、`/reset` |
| 11 | 依赖安全 | 上游 npm 锁文件仍报高危/中危项 | `doctor` 明示需等待上游 lockfile 修复，手工改依赖会被下次升级覆盖 |
| 12 | Gemini 连通性 | `doctor` 返回 HTTP 400 | 非当前主/fallback 路由，保留为待处理的既存配置 |
| 13 | 进程权限 | gateway 仍以 root 运行；SSH password auth 仍启用 | Docker 只隔离工具执行，插件/网关仍在宿主进程；迁移非 root 与关闭密码 SSH 涉及登录恢复风险，未在本轮授权范围内 |

### 后续补证顺序

1. 在不重启 gateway 的条件下完成一次真实 >= 2 小时 Runs approval 挂起并批准走完。
2. 从 Claude/Terra 服务商控制台提供“专用/可撤销/低额度 key”和消费告警/上限证据。
3. 单独评审 `custom_providers -> providers` 迁移、Gemini 400、`session_reset` 取舍和非 root 服务化；每项先备份、再改、再跑同一验收集。
4. 上游发布修复 npm lockfile 的稳定版后升级并重跑 `hermes doctor`。

**H 组结论：有偏差。** 偏差已完整列明；本报告不把这些事项外推为 §7 已通过。
