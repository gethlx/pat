# Agent 家底盘查：本机实测与可驱动性评估

> 状态：草稿（落地第 0 步产物，待用户补正与实测补全）
> 维护线：整体线（评审支撑材料）
> 最后更新：2026-11-06
> 摘要：对本机与已知各厂商 agent 逐项核查可编程入口，按「可驱动性」而非「模型强弱」排序，给出名册初稿与每条连接手段的门槛与风险。

本文件是[两线综合评审 v2](2026-11-06-two-blueprint-joint-review.md)落地顺序第 0 步的执行结果。判据只有一条：**壳能不能合法、稳定地调到它**——不是它模型多强、VPS 多少核。

证据分级：**实测**＝本轮在本机跑命令看到的事实；**文献**＝官方文档/仓库；**二手**＝第三方文章（仅作线索，须复核）。

## 一、结论先给

**「谁当宰相」这个问题的真正约束不是能力，是可驱动性。** 盘完的排序与直觉不一样：

| 排名 | agent | 可驱动性 | 一句话 |
|---|---|---|---|
| **1** | **Codex CLI** | **推模式 L1+L2 齐备（实测）** | 唯一在本机实测全通的：`exec` 非交互、`--json` JSONL、`--output-schema`、`resume`、`app-server daemon`。天子级可编程面 |
| **2** | **Grok Bot** | **拉模式可行（用户实测 + 文献）** | 云电脑有 **terminal、持久文件系统、可装任意 CLI**，routines 可按计划/事件/webhook 触发。**它不需要门，它能自己出来取活** |
| **3** | **DSH** | 推模式 L2（文献，未实测） | 自托管、MIT、`acp`/`headless`/`sdk` profile 齐全；**本机未装，只有连 VPS 的入口，随时可装** |
| **4** | **WorkBuddy** | 半（实测有 CLI 但不在 PATH） | 当前壳本身。自带 `@genie/agent-cli` 2.165.0，多模型接入。适合当壳，不适合当被派活的一方 |
| **5** | **Muse** | 绕（文献+二手） | 无派活 API。**Gadgets SDK 方向是反的**（Muse 调你的硬件，不是你调 Muse）→ 归终端面 |

**最重要的一条修正（2026-11-06 夜，用户质问后重查）**：我最初把 Grok Bot 判为「有算力、没门」，**这是错的，错在只找入站的门**。官方文档与现代用法均确认：Grok Bot 的每台云电脑带 terminal、持久文件系统、可安装软件，routines 能按计划或 webhook 触发——**它完全可以自己 `git pull` 取任务、执行、`git push` 回结果**。用户在它的云电脑上驱动 Codex 已有实测。这条路**不破墙**，反而最合规：对端用自己的账号，协调面不开任何端口。

**另一条要点：Grok Bot 与 Grok Build 是两个产品。** 有本地 CLI、可脚本化、便宜（SuperGrok $30 档）的是 **Grok Build**（`grok-4.6`，读 `AGENTS.md`/`CLAUDE.md`，配置在 `~/.grok`）。Grok Bot 是订阅制云端 agent，无入站 API 但有完整 terminal。**要接的是「Bot 当拉模式 worker」＋「Build 当本地 CLI」两条腿，不是二选一。**

## 二、逐项实测记录

### 2.1 Codex CLI — 实测通过，本机唯一全通

```
$ codex --version
codex-cli 0.166.0

子命令（实测 --help）：
  exec      非交互执行（别名 e），支持 stdin 管道
  resume    续会话（--last 接最近一次）
  fork      从旧会话分叉
  review    非交互代码评审
  app-server [experimental] 内含 daemon 管理（start/stop/restart/remote-control）
  agents    浏览同一 app-server daemon 上的所有会话
  mcp       管理外部 MCP server
  plugin    管理插件
  doctor    诊断安装/配置/认证/运行时
```

关键选项（实测 `codex exec --help`）：

- `--json` → 事件以 **JSONL** 打到 stdout（结构化输出，壳可直接解析）
- `--output-schema <FILE>` → 用 JSON Schema 约束最终响应形状（**这是宰相路由决策的理想形态**）
- `-C, --cd <DIR>` → 指定工作目录
- `-s, --sandbox <MODE>` → 沙箱策略
- `--dangerously-bypass-approvals-and-sandbox` → **存在，但不该用**（见风险）
- `-o, --output-last-message <FILE>` → 末条消息落文件

本机配置（`~/.codex/config.toml`，已隐去敏感项）：

- `model = "gpt-6-luna"`，`model_reasoning_effort = "high"`
- 已挂 MCP：`computer-use`、`node_repl`、`open-knowledge`
- 已装插件：browser / unified-computer-use / chrome / visualize / documents / pdf / spreadsheets / presentations 等
- 会话资产丰富：`sessions/`、`archived_sessions/`、`memories_v2/`、`history.jsonl`、多个 SQLite（`state_5`、`thread_history_1`、`queue_1`）

**判定：Codex 是当前最重要的执行器与宰相候选。** 它同时具备非交互、结构化输出、会话续跑、常驻 daemon 四项，这在其余几家身上没有任何一家全有。

**风险两条**：
1. 它自带 memories / sessions 体系。若让 Codex 当宰相并读写记忆，**会与 PAT 的共享记忆形成第二套权威**——必须明确「PAT 记忆为主，Codex 自带记忆只当上下文缓存，不参与晋升」。
2. `--dangerously-bypass-approvals-and-sandbox` 存在。壳里**禁止**出现这个标志；一律走 `-s` 显式沙箱。

### 2.2 DSH — 未装，入口在远端

- 本机 `command -v dsh` → **absent**。用户确认：本机只有连接远端 VPS 的入口，本体随时可装。
- 远端为**用户自己租赁维护的 VPS**（不是厂商托管）。版本 `0.2.1-rc.4`，systemd 常驻，见 [DSH 验收结论 §5](../dsh-deployment-verdict.md)。
- 官方仓库 `deepseek-ai/deepseek-harness`，MIT，README 自陈「everything-is-a-plugin」、**developer preview、会有破坏性变更**。

**判定**：DSH 的最大价值不在模型，在**归属**——它是唯一「机器、凭据、运行时全在你手里」的执行器。这决定了它的用途：**当兜底宰相与长期宿主**，而不是冲在最前面的主力。

**待实测三项**（本机装好后即可做）：
1. `acp` profile 能否被外部进程稳定驱动（stdio 协议）
2. `headless` profile 的一次性执行与输出形态
3. 会话日志的实际落盘格式与完整性（关系到能否当记忆真相源）

### 2.3 WorkBuddy — 当前壳，自带 CLI 但未上 PATH

- `/Applications/WorkBuddy.app` 为 Electron 应用。
- `Contents/Resources/app.asar.unpacked/cli/` 存在，`package.json` 显示：`@genie/agent-cli` v2.165.0，含 `bin/`、`dist/`、`server.mjs`／`server.cjs`（有 server 入口）。
- `command -v workbuddy` → 无。**未暴露为系统命令。**

**判定**：它是**当前壳**，且本身已接入多家模型。这意味着两件事：
- **短期内它就是「宰相府」的现成近似物**——不必从零造调度面即可先验证「跨厂商派活顺不顺」这个假设。
- 但它**不能同时充当被派活的执行器**：壳与被调方混在一个进程里，会让「换核心」重新变成「迁移系统」，正是评审稿 2.1 要防的。

**待查一项**：`cli/bin` 下是否有可直接调起的入口；若有，它可作为壳与被调方之间的过渡桥。

### 2.4 Muse — 方向是反的，这是关键发现

本机 `/Applications/Muse.app` 只有 GUI（`Contents/MacOS/Muse`、`EndoCrashpadHandler`），无 CLI。

官方开放的是 **Muse Gadgets**（2026-10-02）：Apache-2.0 的 ESP32 固件 + Linux 设备 SDK，仓库 `facebookincubator/muse-gadget-sdk`，token 从 `gadgets.muse.ai` 领。

**但要看清楚方向**：这套 SDK 是让**你的硬件成为 Muse 的外设**——屏幕显示、按钮输入、传感器上报、"任何 Muse 可调用的本地 HTTP API"。即 **Muse 是大脑，设备是五官与手脚**。它不是「让你从外部派活给 Muse」的 API。

**理论上的迂回**：跑一个 Linux Gadget 设备作为桥，把壳的指令伪装成用户输入喂给 Muse，再把回复取回来。这条路用的是官方 SDK 与官方 token，**形式上不破墙**，但代价明确：
- 为「设备 I/O」设计的协议，拿来做任务派发，语义错配
- Meta 明写「not a supported product or developer platform」，**保留随时变更或撤回的权利**
- 官方还明说社区 skill「可能变更或失效」，且不得用于安全关键场景

**判定：Muse 不进第一批名册。** 它是**硬件终端的接口**（这正是用户第 5 条要的手机之外的补充入口），不是**派活对象**。这两个用途方向相反，不要混。

### 2.5 Grok Bot — 拉模式可行（初版判断已修正）

本机 `/Applications/Grok Bot.app` 只有 GUI，`Contents/MacOS/Grok Bot` 单一可执行，`Resources/dist` 无 CLI 痕迹。**但结论不能停在「本机没 CLI」。**

官方文档与实测用法确认的云电脑能力：

| 能力 | 事实 | 对 PAT 的意义 |
|---|---|---|
| **Terminal** | 云电脑带完整命令行，可装软件、跑脚本、用开发工具 | **可以装任何 agent 的 CLI** —— 这正是用户已实测的路径 |
| **持久文件系统** | 下载、草稿、产物跨任务保留 | 能 clone 仓库、能保存中间产物 |
| **Routines** | 可按计划、事件、webhook 触发 | **能定时醒来取任务** |
| 浏览器 + 持久会话 | 可登录网站、保持登录 | 处理无 API 的工具 |
| 24/7 常驻 | 你的设备关机它照跑 | 适合长时、通宵、定期巡检 |

**这条路径的合规性比打洞高得多**：它用厂商公开提供的 terminal，用自己的账号，协调面不需要开任何端口。这与「逆向 `:1340` 内部网关」是两件事，我上一版把二者混为一谈而误判。

**三种用法，按可靠度排序**：

1. **拉模式 worker（推荐）**：云电脑上装 CLI，跑取任务循环或挂 routine/webhook。它自己领活、干活、推结果。
2. **长时执行体**：批量研究、通宵跑批、定期巡检——24/7 常驻的价值在这里。
3. **宰相（不推荐）**：模型自动路由、不可选、不可观测，无稳定入站 API。让它当宰相等于把决策交给看不见的黑箱。

**三条硬伤（官方文档明载，必须知情）**：
- 一个账号的**所有 Bot 共用一台云电脑**，文件／浏览器会话／凭据互通，官方明写「独立 Bot 不构成安全边界」→ **不放长期凭据，用短时令牌**。
- 模型自动路由、不可选、无产品级消费上限、beta 无 SLA → **不跑不可中断的关键路径**。
- 属厂商云（Firecracker microVM，美国托管），随时可能改版 → adapter 必须**可降级**。

**待验一件事**：在它的云电脑上能否装 git 并访问你的私密仓（clone/push 一个测试文件）。这是拉模式成立的前提。

### 2.6 家底汇总表（名册初稿）

| agent | 本机 | 入口形态 | 模式 | 可续会话 | 结构输出 | 归属 | 建议角色 |
|---|---|---|---|---|---|---|---|
| Codex CLI 0.166.0 | 已装 | `exec` / `app-server` | **推**（L1+L2） | ✅ `resume` | ✅ `--json` / `--output-schema` | 厂商（订阅）| **首任宰相 ＋ 主力执行器** |
| Grok Bot | 已装（GUI） | 云电脑 terminal ＋ routines | **拉** | 由对端管 | 由对端管 | 厂商云 VM | **拉模式 worker ＋ 长时执行体** |
| DSH 0.2.1-rc.4 | 未装（远端有） | `acp` / `headless` / `sdk` | **推**（L2） | 待测 | 待测 | **自有 VPS** | **兜底宰相 ＋ 长期宿主** |
| WorkBuddy | 已装 | 内置 CLI（未上 PATH） | 半 | 待查 | 待查 | 厂商 | **宰相府现成实现**；不作被调方 |
| Muse | 已装（GUI） | Gadgets SDK（**方向相反**） | 绕 | — | — | 厂商 | **硬件终端接口**，非派活对象 |
| Grok Build | 未装 | 官方 CLI | **推**（L1） | 待测 | 待测 | 厂商（订阅）| 待实测后入册 |

## 三、由实测得出的三条判断

**① 宰相首任就是 Codex，但理由要改。**
不是我上次说的「DSH 最不添麻烦」，而是**实测事实**：Codex 是当前唯一具备「非交互 + 结构化输出 + 续会话 + 常驻 daemon」四件套的执行器。用 JSON Schema 约束路由决策输出这一项，直接把「宰相」从模糊的模型判断变成可校验的结构化调用。

**② DSH 的位置不是「更好」，是「更可靠地属于你」。**
它是唯一在你自有 VPS 上、凭据归你的执行器。所以它的正确用法：**当 Codex 不可用（额度、故障、厂商改版）时的兜底宰相，以及记忆与任务账本的长期宿主**。别把「自有」误当成「更强」。

**③ 我上一版的最大误判：把「没有入站门」等同于「不可用」。**
- Grok Bot：**有算力也有路，只是路是出站的**。云电脑有 terminal、能装 CLI、routines 能定时醒来——它是天然的执行工，不是摆设。用户已实测在其上驱动 Codex。
- Muse：**有接口没方向**。SDK 是给「造外设」的，不是给「调 agent」的。它属于用户第 5 条要的**硬件终端面**。
- 教训写下来：判断一家 agent 的价值，要同时问「我能不能调它」和「**它能不能来取我的活**」。只问前者，会把配置最好的那台机器误判成废铁。

**④ 记忆面的落点已由用户裁定，且消掉了一个过度设计。**
Git 就是短期基座：项目仓、`llm-wiki` 仓、加一个私密共享记忆仓。Git 天生满足多机多商读写、不开端口、只增不改、provenance、push 竞态即乐观并发、审计与可迁移。**关键是接口与后端分离**（`backend: git | service`），换云端服务时接口不变——这让另一份蓝图的云端方案从「竞争路线」变成「本路线的下一站」。

## 四、待补实测（下一步就能做）

按性价比排序，前三项做完，名册即可定稿：

| # | 事项 | 怎么验 | 影响 |
|---|---|---|---|
| 1 | **Grok Bot 拉模式可行性** | 在它的云电脑上装 git，clone 私密仓，push 一个测试文件 | **决定拉模式能否成立**，也是本蓝图第三阶段的前提 |
| 2 | **Codex 宰相调用原型** | `codex exec --json --output-schema route.schema.json "把以下任务派给谁"` | 直接决定宰相能否当天上线 |
| 3 | **DSH 装上** | 本机装 `@deepseek-ai/dsh@0.2.1-rc.4`，测 `acp` 与 `headless` | 决定兜底路径 |
| 4 | **Grok Build 试装** | `curl -fsSL https://x.ai/cli/install.sh \| bash`，看有无非交互模式 | 决定是否补一家厂商 |
| 5 | WorkBuddy `cli/bin` 探明 | 看是否可直接调起、有无 headless | 决定能否拿它当第一版宰相府 |
| 6 | Muse Gadget 桥可行性 | 只在「真要接 Muse 当硬件面」时做 | 低优先 |

## 五、需要用户补正的事实

以下几项我只能看到「本机有什么」，看不到「你订阅了什么、机器归谁」：

1. **各家订阅的实际档位**（决定 Grok Build 能否用、Codex 额度、Muse 是否可领 Home Link token）。
2. ~~Grok Bot 那台 VPS 能否 SSH 跑别的~~ —— **已被用户实测解答**：能在其云电脑上驱动 Codex，故拉模式成立。待补的只剩「能否装 git 并访问私密仓」。
3. **Muse 是否已有 Gadgets token**（决定硬件面今天能否动）。
4. **还有没有本机没露面的 agent**（网页版订阅、公司账号、其他机器上的 CLI）。
5. **共享记忆仓建在哪**（GitHub 私密仓 / 自租 VPS bare repo / 两者兼做镜像）——蓝图建议先 GitHub，VPS 做每日镜像。

补正后我把名册表填实，并据此出宰相轮换策略。
