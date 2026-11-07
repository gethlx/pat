# Grok Build 可驱动性实测（2026-11-08）

> 状态：实测记录（整体线名册复测）
> 机器：老邪云电脑（Grok Bot box）
> CLI：`grok` 1.0.52（0920c8169e27），已 xAI 登录；模型实测为 `grok-4.7-build`
> 判据：architecture-v2 §5.3 ① 非交互、结构化输出、续会话（缺一不可）

## 结论

三件套全通。另有 `grok agent leader`／`serve`／`stdio` 常驻入口（本轮未做冒烟，只确认子命令存在）。按决策规则可进宰相候选顺位三；不改指针任命（任命权仍在用户）。

计费口径：本机 Grok Build 走 SuperGrok 周共享池（与 Chat／Imagine／Voice／Build 共用），与 Grok Bot（Cursor 账）分开。

## 命令与结果

工作目录：`/tmp/grok-drive-test`。均加 `--permission-mode dontAsk --disable-web-search --no-subagents --max-turns 1`。

| 判据 | 命令要点 | 结果 |
|---|---|---|
| 非交互 | `grok -p "Reply with exactly: PONG" --output-format plain` | stdout=`PONG`，exit 0 |
| 结构化输出 | `grok -p "Return a status object" --json-schema '{status,ok}'` | 顶层含 `structuredOutput: {"status":"ok","ok":true}`，exit 0 |
| 续会话 | 先 `-p` 记住 `ZEBRA47`；再 `grok -r <sessionId> -p "What was the codeword..."` | stdout=`ZEBRA47`，exit 0 |

会话 ID 示例：`01a1b820-17eb-7ed3-b482-9dfb987a09a1`（落在 `~/.grok/sessions/`）。

## 对蓝图的改动

- `architecture-v2.md` §5.3 表与推荐顺位：Grok Build 从「待装实测／暂不入序」改为「实测三件套全通／顺位三」。
- `2026-11-06-agent-fleet-inventory.md` 名册行与待办第 4 项同步。
