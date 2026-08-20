---
name: hermes-desktop-usage
description: "Operate the Hermes CN Desktop app: chat input is LOCKED while the agent is busy (no mid-turn messaging in the desktop UI), workarounds (background tasks / parallel sessions), reconstructing what past sessions did from logs, and the proactive memory auto-save behavior."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [windows]
metadata:
  hermes:
    tags: [hermes, desktop, ui, sessions, memory, windows, input-lock]
    related_skills: [hermes-agent, openclaw-to-hermes-migration, deepseek-harness]
---

# Hermes CN Desktop — Usage & Operations

Trigger: user asks about the desktop app's behavior ("为什么不能继续发消息", "what was session X doing", "记忆自动保存没有"), or needs long-running work that must not block the chat.

## 1. Chat input is LOCKED while the agent is busy (verified 2026-08-17, CN build 0.19.0-cn.7)

- While the agent is mid-turn (LLM call or tool execution), the desktop chat textarea/send button are **disabled**. The user cannot send mid-turn messages from the desktop UI — it is a serial chat surface.
- The backend **does** support mid-turn steering (`User injection prompt:` / `/steer` protocol exists in the system prompt), but the CN desktop UI does not expose it.
- 🔴 **Pitfall: do not tell the user "you can send mid-turn messages" based on backend design alone — verify the specific UI build first.** This exact mistake happened 2026-08-17 (agent claimed mid-turn messaging works; user reported the input was locked).
- Workarounds, in order of usefulness:
  1. **Long/heavy work → run it in the background** (`terminal(background=true, notify_on_complete=true)`, or `delegate_task` which is background by default). The turn ends quickly → input unlocks → the result re-enters the conversation when done. Mirrors the user's OpenClaw wait-script pattern (LLM idle while waiting).
  2. **Urgent parallel question → open a second session window.** Hermes supports concurrent sessions; they don't interfere.
  3. `/steer` and busy-time injection are only available in the **CLI** (`hermes`) and the **web dashboard** — not the CN desktop chat.

## 2. Session archaeology — "what was session X doing?"

- Session IDs look like `20260817_100712_f74bbc` (YYYYMMDD_HHMMSS_rand).
- Grep `$HERMES_HOME/logs/agent.log` + `logs/errors.log` for the ID — the logs are the activity source of truth:
  - `agent.turn_context: conversation turn: session=... msg='<first user msg>'` → what the session started with
  - `agent.conversation_loop: API call #N: ... in=... out=... cache=...` → token usage
  - `agent.tool_executor: tool <name> completed` → every tool call
  - `logs/errors.log` WARNING lines → failures, curator refusals, rate limits (often the most informative)
- Persistence check: `$HERMES_HOME/memories/MEMORY.md` (§-separated compact entries) + `$HERMES_HOME/skills/` tree — compare LastWriteTime vs session start.
- Sessions auto-persist (state.db + logs); no user action needed.
- Full verified recipe + example: `references/session-archaeology.md`.

## 3. Memory auto-saves — no trigger word needed

- Hermes memory is **proactive**: the agent itself decides when a fact is durable (user preferences, corrections, environment facts, tool quirks) and calls the memory tool — no 「保存」 command required.
- Contrast with OpenClaw: user must say 「保存/提交」 to trigger gts-save-flow (MEMORY.md + daily log + git commit). Explain this difference when the user asks whether they need to save.
- Memory stores only compact high-signal facts; task progress/completed-work lives in sessions (retrieve via session_search or logs), NOT in memory.
- No timer-based periodic save by default. If the user wants OpenClaw-style daily logs, add a `hermes cron create` job that summarizes the day into the notes dir.

## 4. Changing Hermes config from the desktop runtime (hermes CLI not on PATH)

On the CN Desktop build, `hermes` is NOT on PATH and `patch`/`write_file` refuse to edit `config.yaml` (security protection). The only sanctioned way is `hermes config set` via the bundled runtime exe. Verified working template (2026-08-17, build 0.19.0-cn.7):

```powershell
$env:HERMES_HOME="E:\Hermes Agent CN Desktop\data\hermes-home"
$exe="E:\Hermes Agent CN Desktop\data\versions\0.19.0-cn.7\hermes-agent-cn-runtime-win32-x64.exe"
$out="$env:TEMP\hermes-config-out.txt"; $err="$env:TEMP\hermes-config-err.txt"
Start-Process -FilePath $exe -ArgumentList @("config","set","approvals.mode","smart") -Wait -NoNewWindow -RedirectStandardOutput $out -RedirectStandardError $err
Get-Content $out -ErrorAction SilentlyContinue; Get-Content $err -ErrorAction SilentlyContinue
```

Pitfalls:
- 🔴 `Start-Process -Wait` WITHOUT `-RedirectStandardOutput`/`-RedirectStandardError` **drops all output** — you can't tell if the set succeeded. Always redirect to temp files and read them back.
- `& $exe` gets misparsed as backgrounding by the terminal tool — use `Start-Process -Wait`, not the call operator.
- Config changes take effect on the **next session** (restart), not mid-turn.

`approvals.mode` semantics (asked repeatedly by 兄弟):
- `smart` (default) — auto-approve low-risk commands once, deny high-risk, prompt when uncertain.
- `manual` — always prompt.
- `off` — skip ALL approval prompts (equivalent to `--yolo`; also `HERMES_YOLO_MODE=1`, or `/yolo` in CLI sessions to toggle).
- YOLO/off does NOT disable secret redaction — independent toggles.
- 兄弟 flip-flopped off→smart→off in one session (2026-08-17): don't push back on the choice, just apply it. Final state: off.

## 5. Interaction style for this user (兄弟)

- **Answer from knowledge FIRST; explore files only to verify a specific fact.** Multi-call file exploration before answering a question the user already has context on triggers impatience ("怎么思考这么久？", 2026-08-17).
- Keep answers short; use tables for comparisons; cite the user's own measured numbers when they exist (they audit token costs themselves).
- When the user interrupts with a question, treat it as a redirect — answer it directly, don't finish the exploration first.

## 6. 🔴 Memory provider 切换在 desktop 不可行(2026-08-18 实锤)

**不要在 desktop 上跑 `hermes memory status` / `hermes memory setup` / `hermes memory install` 这类 CLI**——desktop runtime exe 不暴露这些子命令。文章里推荐的 Holographic / Hindsight / Honcho / Mem0 / OpenViking 等 provider 切换流程,**desktop 形态下无入口**。

**desktop 真实持久层只有 3 件套**:

1. `config.yaml` 的 `memory.memory_char_limit`(本机已 30000,实测生效,虽然 `hermes-memory-limits` 指出 8000 是硬编码内层限,但**写入配额看 char_limit**)
2. `MEMORY.md` / `USER.md`(`$HERMES_HOME/memories/` 下,§ 分隔条目,会启动时全量注入)
3. `skills/` 目录 SKILL.md(程序性知识)

**真要切 Holographic / Hindsight**(兄弟要"配个简单的"):

- **方案 A(兄弟自装 Hermes CLI)**:`pip install hermes-agent` 或 `npm i -g hermes`,然后 `hermes memory setup` 选 Holographic。**desktop 当前进程不变**,CLI 写的 provider 不影响 desktop
- **方案 B(简单)**:不切 provider,继续用内置 + 把 memory_char_limit 调高 + 配 `ai-trust-existing-mechanisms` 那条"信任系统,主动记忆+nudge 已覆盖"纪律,日常够用
- **方案 C(本机跑 Holographic 当 standalone)**:Holographic 本身就是 SQLite FTS5 + 零依赖,可以**独立跑**不接 Hermes 框架,bot 每轮 `search_files` ripgrep 模拟召回——但这是**轻量替代**,不是真 Holographic

**判据**:兄弟说"切 provider / 配 Holographic / 装 Hindsight" → 先**停下来确认形态**(desktop 不可切),不要直接跑 `hermes memory setup` 等半天没反应。

## Reference

- `references/session-archaeology.md` — verified recipe for reconstructing past-session activity from logs (grep patterns, log-line anatomy, real example from the 2026-08-17 migration session).
