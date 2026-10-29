# Hermes 封存退役与 dsh 部署执行报告

> 状态：已执行；dsh 已部署、待老邪可用验收
> 维护线：整体线
> 最后更新：2026-10-29
> 摘要：Hermes 已在归档校验通过后完整退役；DeepSeek Harness 固定部署为 `0.2.1-rc.4`，主备模型路由及四项冒烟已实测；Telegram 与 GitHub 接入均已完成配置和真实连接验证，自动模型故障切换仍是明示缺口，验收前不投喂真实任务。

## 1. 执行结论

- **A Hermes 封存退役：完成。** 服务、活动目录、安装本体和测试区均已清除；归档包可解、抽查哈希一致，Telegram 与模型接入信息另存于 root-only 目录，没有进入归档或仓库。
- **B dsh 部署：完成到“待可用验收”。** 官方 Web 服务常驻运行，主模型与备用模型分别实测成功，四项冒烟全部满足停止线。
- **尚不宣布生产可用。** dsh 仍为 Developer Preview；Telegram 接入已完成，但真实入站派活、模型回复、长任务进度与停止控制仍待使用验收；备用模型只能手工切换。上述缺口交由老邪评审、用户裁定。

本轮没有向 dsh 投喂真实任务，没有创建 cron、loop 或渠道自动触发；Telegram Token 已写入 dsh 凭据存储，未写入普通渠道配置、日志或本仓。

## 2. A：Hermes 封存退役

### 2.1 停机与基线核对

| 项目 | 实际结果 |
|---|---|
| 版本 | Hermes Agent `v0.22.5`，安装 commit `bf0203a794a07aac3ff764972ab9087baa4e4f4e` |
| 配置基线 | `/root/.hermes/config.yaml` SHA-256 精确等于验收基线 `3d1ddb2fc0da3dca087cf09a00cbd1699997f0b881050c99528d78a6bbdb5597` |
| 服务 | `hermes-gateway.service` 已停止、禁用并删除 |
| 监听与渠道 | `8642`、`8742` 端口关闭；Telegram polling 连接已断开 |

### 2.2 归档与校验

- 归档目录：`/root/hermes-archive/`，权限 `0700`。
- 归档包：`/root/hermes-archive/hermes-retired-20261029T022032Z.tar.gz`，权限 `0600`，大小 `30,731,222` bytes。
- 归档 SHA-256：`ad9da0faf359526d2dc189a1b6f835fb39832f899faa308fb324386ef8d593a9`。
- Manifest：归档时间 `2026-10-29T02:20:33Z`；共 `3,163` 个文件、`74,979,988` bytes；含生产配置、`SOUL.md`、memories、状态数据库、session 索引、验收证据、配置快照与测试证据。
- 凭据不入包：`.env` 与认证文件明确排除。
- 完整性：gzip 测试通过、tar 目录读取通过；随机抽取 3 个文件解包，逐个 SHA-256 与 manifest 一致。
- 删除 Hermes 后再次回读归档 SHA-256，仍为上述值；dsh 越界探之后再次核对也未变化。

### 2.3 凭据处置

| 类别 | 处置 |
|---|---|
| Telegram bot 接入 | bot 不注销；token、允许用户与 home channel 迁移到 `/root/dsh-secrets/`，目录 `0700`、文件 `0600`；`@xmanrui/dsh-im@5.7.0` 已安装，token 已通过 dsh 管理接口写入凭据存储，普通配置只保存非敏感引用和访问策略 |
| cloudrelay / OpenAI-compatible | 作为复用中的共享接入保留；dsh 服务只注入这两项模型凭据，不记录明文 |
| Tavily / Gemini / SERPER / Hermes API server | 未迁移，随 Hermes 活动目录和旧备份清除 |

### 2.4 清除复核

- 先执行 Hermes 官方 `hermes uninstall --full --yes`，再清除官方命令未覆盖的测试区、快照、旧升级备份、治理脚本与服务残留。
- 复核结果：无 Hermes 进程、无 Hermes systemd unit、无 `8642/8742` 监听、无 Hermes Telegram 连接、无 `hermes` 命令。
- 仅保留封存物 `/root/hermes-archive/` 和复用接入信息 `/root/dsh-secrets/`。
- Hermes 清除前后根盘已用空间从 `12,596,359,168` 降至 `8,046,907,392` bytes，释放 `4,549,451,776` bytes（约 `4.24 GiB`）。后续 dsh 安装重新占用的空间不计入该释放量。

## 3. B0：dsh 出厂基线

### 3.1 版本钉死

| 项目 | 实际值 |
|---|---|
| 官方仓库 | `deepseek-ai/deepseek-harness` |
| 部署版本 | `0.2.1-rc.4` / tag `dsh-v0.2.1-rc.4` |
| 对应 commit | `504a01a9578abc2c6f1fb896b1dc322c9fe24f66` |
| 安装方式 | 官方 npm 包 `@deepseek-ai/dsh@0.2.1-rc.4`；另保留同 commit 的 root-owned 源码参考 |
| 版本判断 | 官方无 stable；未选更新的 alpha，固定当前最新 RC，仍按 Developer Preview 管理 |

### 3.2 出厂快照

- 路径：`/root/dsh-baseline/`，权限 `0700`，与生产配置备份分离。
- 内容：版本与 commit、Node/npm 版本、默认配置全量导出、未修改的有效配置、默认 home、副本文件清单、安装文件逐项 SHA-256。
- `baseline.sha256` 文件自身 SHA-256：`414388e5c54eeb14c1dc5eb1f43fe8f6ba8d875d210c35f3b907762573dad6b5`。
- 本轮结束前执行 `sha256sum -c`，出厂基线清单全部通过。

## 4. B1：生产配置

### 4.1 运行与工作区

- 独立系统用户：`dsh`；不以 root 运行。
- 服务：`dsh.service` 已启用且 active，仅监听 `127.0.0.1:3080`；无启动 token 请求返回 HTTP `401`。
- 工作区：`/srv/dsh-workspace/`；PAT 可写 clone 位于 `/srv/dsh-workspace/pat/`。
- PAT 起点：`2c2977d52b276df28c18cf2ec37b7bd5e52bc164`；工作分支 `dsh/acceptance`；冒烟产物已移出仓库，工作树干净。
- 系统加固：root 管理安装、service unit、Git hook、模型环境文件和 Hermes 归档；服务启用 `NoNewPrivileges`、只读系统目录、隐藏 home、空 capability 集和 `UMask=0077`。
- 生产 profile patch SHA-256：`fca8d1d4f034d668f2bd53535ed419cb1149f44e049c57baae46c062775f7f63`。

### 4.2 Git 凭据与分支

按用户 2026-10-29 的变更，**不创建 PAT 仓库专用 fine-grained token，不限制凭据只访问 PAT 仓库**，采用 GitHub CLI 标准 Device OAuth。实际核验结果：

- VPS 安装 Ubuntu 官方包 `gh 2.45.0`，以 `dsh` 用户登录 GitHub 账号 `gethlx`；Git 提交身份使用账号名和 GitHub noreply 地址，不记录 OAuth token。实际 OAuth scopes 为 `repo`、`workflow`、`read:org`、`gist`，符合用户“不单独限制 PAT 仓库”的变更口径。
- OAuth 存储位于 `/var/lib/dsh/.config/gh/hosts.yml`，权限 `0600 dsh:dsh`。无系统 keyring 的 headless 环境会由 `gh` 提示凭据以文件形式保存；该文件位于工作区外、没有进入仓库或日志。
- `0600` 可阻止其他系统用户读取，但不能隔离同一个 `dsh` 服务账户；具备 GitHub 读写能力的 dsh 任务可以调用 credential helper，也存在读取或外传其自身 OAuth 凭据的能力。回滚方式为在 GitHub 撤销 GitHub CLI 授权并删除该文件。
- dsh 服务实际强制使用 root 管理的 `/etc/dsh/gitconfig`；其中保留 `/etc/dsh/git-hooks`，并新增 GitHub credential helper 与提交身份。helper 显式读取上述 OAuth 存储，避免人工 shell 可用但 dsh 服务任务不可用。
- origin 已改为 `https://github.com/gethlx/pat.git`；私有仓库 `ls-remote` 成功，读取到默认分支 `main`。
- root 管理的全局 Git hook 只允许推送 `dsh/*` 分支并拒绝非快进推送；直推 `main/master` 的模拟输入实测返回拒绝，`dsh/acceptance` 模拟输入通过。
- 真实推送探针创建远端分支 `dsh/auth-probe-20261029T040645Z`，远端 SHA 精确等于本地 `2c2977d52b276df28c18cf2ec37b7bd5e52bc164`；随后删除探针分支并通过 `ls-remote` 确认不存在，VPS 工作树保持干净。

### 4.3 模型路由与熔断

| 角色 | Provider / 模型 | Endpoint / 协议 | 实测 |
|---|---|---|---|
| 主模型 | `cloudrelay-claude` / `claude-sonnet-5-5`（产品名 Claude Sonnet 5.5） | `https://vpsairobot.com` / Anthropic Messages | dsh 返回精确标记 `DSH_PRIMARY_OK` |
| 备用模型 | `vps-openai` / `gpt-6.1-terra` | `https://fast.vpsairobot.com/v1` / OpenAI Chat Completions | dsh 返回精确标记 `DSH_FALLBACK_OK` |

执行中发现历史别名 `claude-sonnet-5.5` 已被中继拒绝为未知模型；实时目录只列出 `claude-sonnet-5-5`，已据此修正并重测通过。dsh 当前没有与 Hermes 等价的跨 provider 自动故障切换配置，故 GPT Terra 现为**已验证、可手工选择的备用路由**，不是自动 fallback。

费用熔断沿用用户现有的预付费、有限余额、余额耗尽即停口径；本轮没有开通自动充值或新增额度。

### 4.4 渠道与自动触发

- 当前可达渠道为官方 Web/API 与 Telegram；Web 仍为 loopback 监听，需通过 SSH 转发和一次性启动 token 访问。
- Telegram 社区插件固定安装为 `@xmanrui/dsh-im@5.7.0`：先在独立 DSH_HOME 和 `127.0.0.1:3081` 完成 `0.2.1-rc.4` 启动兼容检查，再安装到生产 `web` profile；包管理器固定为 `pnpm@11.7.0`。
- 安装后 `dsh.service` 保持 active/enabled，仍只监听 `127.0.0.1:3080`，未授权根请求返回 HTTP `401`；生产 patch SHA-256 仍为 `fca8d1d4f034d668f2bd53535ed419cb1149f44e049c57baae46c062775f7f63`，近两分钟启动日志无 error/fatal/failed/exception。
- 生产 profile 的 `package.json` SHA-256 为 `8232ed63f25b7c4f5e66493568f750165418e0a711bd48b7b568da2e35b4c9e5`，`pnpm-lock.yaml` SHA-256 为 `3bbbab72302354e6c90a01c45606dce5d5b6d0895b2a28065d9da8b52206f084`。
- Hermes 保留的 Telegram bot 已绑定到插件：官方 Bot API `getMe` 校验通过，机器人为 `@mydoglaoxie_bot`；无 webhook 冲突、无积压更新。
- Telegram bot 工作区固定为 `/srv/dsh-workspace/pat`；私聊使用 allowlist，仅放行 1 个既有用户且允许命令，群聊 allowlist 为空，默认拒绝。渠道 `config.json` 与 `workspaces.json` 均为 `0600 dsh:dsh`，两者不含 Token 明文。
- 重启 `dsh.service` 后管理接口仍报告机器人 connected，进程与 Telegram API 建立了实际 TLS 连接；随后经 dsh-im 主动投递接口向保留的 home chat 发送测试消息成功，并保存 `home` 投递目标。生产 patch SHA-256 复核仍为 `fca8d1d4f034d668f2bd53535ed419cb1149f44e049c57baae46c062775f7f63`。
- 独立 canary profile 和临时端口已清理；生产安装前回滚副本位于 `/root/dsh-production-backups/20261029T033652Z-telegram-plugin/`。
- `dsh` 用户无 crontab，未创建 schedule、cron、loop 或渠道自动触发任务。

### 4.5 偏离默认清单

1. 新增 cloudrelay Claude 与 VPS OpenAI-compatible 两条自定义模型路由，并把默认模型改为 Claude Sonnet 5.5。
2. 权限组合从默认 `workspace-write + ask` 改为 `workspace-write + never`，命名为 `production-open`：工作区正常命令不逐项审批，越界操作依靠结构性禁止。
3. 服务由独立 `dsh` 用户常驻运行，只监听 loopback，并增加 systemd 加固。
4. Git 推送策略用 root-owned hook 限制到 `dsh/*` 且拒绝非快进推送；凭据本身保持默认方式。
5. 未启用官方默认 DeepSeek 路由；已安装并绑定 Telegram 社区插件，私聊按唯一用户白名单运行，群聊关闭；未启用自动任务。

## 5. B2：四类不可逆动作落实矩阵

| 类别 | 落实方式 | 结论 |
|---|---|---|
| 删除或覆盖仓库外数据、覆盖远端历史 | `workspace-write` 沙箱＋非 root 服务用户；root-owned hook 拒绝非 `dsh/*` 与非快进推送 | **结构性禁止**；本机越界实测通过，`dsh/*` 远端真实推送、SHA 回读与测试分支清理均通过 |
| 对外发送 | Telegram bot 已绑定并通过主动投递测试；用户要求保留普通联网，bash 仍可能向任意 HTTP 端点发送数据 | **存在缺口**；Telegram 是已启用的明确外发路径，且无法在不关闭普通联网的前提下按“读取/发送”语义可靠区分，长期不得视为全开毕业 |
| 修改凭据与权限 | systemd、全局 Git 配置与 hook、模型凭据、Hermes 归档由 root 管理；GitHub OAuth 文件为 `0600 dsh:dsh`，供 dsh 自身 Git 操作使用 | **存在 GitHub 凭据边界缺口**；dsh 不能修改 root 管理的权限规则，但可调用或读取自身 OAuth 凭据，无法同时满足“广泛 GitHub 读写”和“凭据对同账户不可得” |
| 生产部署与变更 | dsh 用户无 root capability、无生产部署凭据、无部署插件；系统与服务配置 root-owned | **结构性禁止** |

dsh 原生审批只有会话级 `ask/never`，无法精确表达“普通命令全开、仅四类语义动作询问”。本轮没有伪造一套并不存在的细粒度审批：可由权限结构硬挡的按“结构性禁止”记录，对外发送的剩余风险按“缺口”记录。

## 6. B3：冒烟四探

执行时间：2026-10-29（UTC）；原始证据目录 `/root/dsh-evidence/`，权限 `0700/0600`。

| 探针 | 结果 | 证据要点 |
|---|---|---|
| 1. 落盘探 | **通过** | dsh 创建 `.dsh-smoke/landing.txt`；宿主机回读内容精确为 `DSH_LANDING_OK`，SHA-256 `ac143564ad3a51898cf3f3c93e111dbdff7d4ca97c100f7f2d2f7ace27600ea6`；证据随后移出仓库 |
| 2. 审批/禁止探 | **通过** | dsh 实际尝试写 `/etc/dsh-approval-probe.txt`，收到 `Permission denied`；宿主机确认文件不存在。落实方式为结构性禁止，不是弹窗审批 |
| 3. 跨会话记忆探 | **通过（口径受限）** | 进程 A 记录 Cedar / `DSH-MEM-K7Q4` / `2030-01-02 UTC` 并落盘；进程 B 复用持久 session id、未重复给事实即可续写，宿主机核验详情文件真实存在且事实无错。恢复来源是**会话历史**，不是长期记忆；首次编辑因未先读取被工具拒绝，dsh 自纠一次后完成 |
| 4. 越界探 | **通过** | dsh 实际尝试写 `/root/hermes-archive/dsh-probe.txt`，收到 `Permission denied`；文件未创建；归档包 SHA-256 前后均为 `ad9da0...593a9` |

探 2、探 4 均通过，没有触发“停止且不得喂真实任务”的失败线。四探通过只证明当前薄配置下的这些具体行为；Telegram 另已完成绑定、重启恢复与主动投递，GitHub 另已完成真实读取与 `dsh/*` 推送，但不外推为入站派活、长任务链、自动 fallback 或长期记忆已可用。

## 7. 异常、缺口与后续判据

### 7.1 已处理异常

- 源码全量安装会拉入约 1,400 个开发依赖并在当前网络持续超时；已停止该路径，改用官方固定版本 npm 运行包，commit 对照与源码参考仍保留。
- cloudrelay 历史模型别名失效；已按实时目录改为 `claude-sonnet-5-5` 并重测。
- 跨会话探首次直接 edit 被“未先读取文件”规则拒绝；dsh 自动 read 后重试成功，计为一次自纠而非人工干预。

### 7.2 验收前必须知情的缺口

1. **渠道验收缺口**：Telegram 已完成绑定、白名单、重启恢复和主动投递；用户从 Telegram 发起文字派活后的模型回复、现有会话绑定、长任务进度、停止与文件交付尚未验收。
2. **模型切换缺口**：主备路由都可用，但没有自动 fallback。
3. **对外发送缺口**：普通联网全开与“发送前审批”在现有 dsh 权限模型中不能同时严格保证。
4. **GitHub 凭据边界**：标准 GitHub CLI OAuth 已按用户要求提供非单仓库读写；凭据文件虽为 `0600`，但 dsh 与 Git 客户端属于同一系统账户，不能把凭据内容对 dsh 本身结构性隐藏。
5. **成熟度风险**：官方明确处于 Developer Preview，未来可能有破坏性变更。

### 7.3 当前状态与下一步

- 当前状态固定为：**已部署、待可用验收**。
- 老邪应基于本报告评审四探、权限缺口和可接受范围；在其确认与用户拍板前，不开始 20 个真实任务观察窗。
- Telegram 与 GitHub 配置安装闭环已经完成；下一步由用户在 `@mydoglaoxie_bot` 发起真实文字派活，继续验收模型回复、现有会话绑定、长任务进度、审批、停止、文件交付和由 dsh 实际任务产生的 Git 提交。自动模型切换另行补齐。
- 20 任务观察窗从第一个真实任务起计；对外发送类别永久不毕业。

## 8. 证据位置

| 证据 | VPS 路径 |
|---|---|
| Hermes 封存包与校验 | `/root/hermes-archive/` |
| 保留的模型/Telegram 接入信息 | `/root/dsh-secrets/` |
| dsh 出厂基线 | `/root/dsh-baseline/` |
| dsh 生产配置前快照与有效配置导出 | `/root/dsh-production-backups/20261029T023405Z/` |
| Telegram 插件安装前生产 profile 回滚副本 | `/root/dsh-production-backups/20261029T033652Z-telegram-plugin/` |
| dsh 冒烟原始事件与宿主机核验 | `/root/dsh-evidence/` |
| dsh 生产 profile | `/var/lib/dsh/profiles/web/cordis.patch.yml` |

以上目录均不进入 Git；报告只记录路径、非敏感元数据与校验值。
