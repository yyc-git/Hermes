# OpenClaw → OpenCode pipeline: architecture, protocol & token economics (2026-08 audit)

Domain notes from comparing Hermes vs OpenClaw (2026-08-17). Relevant to migration
rationale: the token audit below is WHY the user considered leaving OpenClaw.

## Architecture (GTS-Play setup)
- **OpenClaw bot** = orchestrator/manager. Lives at `C:\Users\Administrator\.openclaw`
  (`workspace/` = real data home: skills/, MEMORY.md, memory/*.md daily logs, qmd sqlite).
  Skills: `opencode-schedule` (dispatch protocol, the hub), `gts-auto` (全自动 mode),
  `gts-dev-feat` / `gts-dev-workflow` / `gts-code-review` / `gts-opencode-stop`, etc.
- **OpenCode** = coding worker, server mode with Web UI at `http://localhost:4098`.
  Sessions tracked in SQLite (`opencode db "SELECT ..."`), per-session state in `event`/`part`
  tables. DeepSeek models via `opencode-go` provider.
- User is "兄弟"; bot replies "兄弟". Chinese-language workflow skills.

## Dispatch protocol (opencode-schedule skill, distilled)
1. Write brief to `.opencode-brief-<task>.md` (unique per task; root `.opencode-brief.md`
   is shared and gets overwritten in parallel work).
2. Pass brief via `$brief` variable, NOT stdin pipe (Windows pipe cold-start race → empty brief):
   ```
   opencode run $brief -m opencode-go/deepseek-v4-flash --attach http://localhost:4098 \
     --title "<task>" --no-replay --auto --dir D:\Github\GTS-Play
   ```
   exec background + timeout=0 (short timeout kills only the CLI; server agent keeps running).
3. **Model tiers**: Flash `opencode-go/deepseek-v4-flash` default (paid; simple tasks,
   schemes, simple review); Pro `opencode-go/deepseek-v4-pro` only for complex/arch-level
   review & root-cause analysis; `--variant max` only for very large scope (LLM silent-fail
   prone, 80-min silence tolerance). Free tier `opencode/deepseek-v4-flash-free` = OpenClaw's
   own model, not for dispatch.
4. **Duplicate-dispatch guard**: check process list AND `opencode db` for same-title active
   session before dispatch. CLI exit 0 ≠ session done (server agent may still run). To stop:
   `opencode session delete <id>` (FK constraint kills the server agent) — never process(kill).
5. **Monitoring** (2026-08-17 final): `wait-opencode-session.mjs <sid> <maxWait> <idleTimeout>
   --exit-on-stuck` as independent background process reading DB `time_updated` + part table
   (`step-finish reason=stop` = done). Zero LLM calls while waiting. Poll is auxiliary only.
   Silence ≥1 min → send "继续" to same session (`-m` MUST match original dispatch model).
6. **Continuation**: same task-chain (same issue/feature) → resume old session with "继续"
   instead of new session (saves re-reading context). New session only when context near limit
   (~900K tokens).
7. **Parallel pollution**: `--attach` injects ALL uncommitted workspace changes into the new
   session's context → same-package concurrent tasks need git worktree isolation.

## Token audit (8/15–8/17, the killer numbers)
| Scenario | Measured |
|---|---|
| 2h task, bot polls every 30s | 240+ LLM turns × full-prefix cacheRead → **~160M tokens/day on the bot side** |
| Same day | OpenCode did the work for **$0.83**; bot watching burned **$4.76** |
| Two long bot sessions (7.5h/5.5h, 750/617 calls) | $7.07 total, **cacheRead = 91.6%** (285M cached reads = $7.99) |
| Single 6h OpenCode session | 530M cacheRead, $2.66, then ContextOverflowError death at 60% output |
| Control | 6-min short session = **$0.10** |

Root cause: every call in a long session / poll loop re-reads hundreds of K of history
(cacheRead); cost grows super-linearly with step count. Fixes that worked:
1. Wait-script monitoring (0 LLM calls while waiting) instead of poll loops.
2. Split >60min work into <30min sessions, `--no-replay`, brief preloads confirmed facts.
3. Bot line never does heavy work (>3 files / >5-step analysis → dispatch OpenCode);
   reads only extract-session-text.mjs summaries, <200 tokens per check.

## Hermes equivalents (migration pitch)
- `terminal(background=true, notify_on_complete=true)` = wait-script pattern, built-in.
- `delegate_task` = dispatch with isolated context, summaries only, no brief files/DB checks.
- Automatic context compression (50% threshold) = replaces manual session splitting.
- No CLI/server process split → no stale sessions, no FK-constraint kill tricks needed.
- Cost of that: no OpenClaw-style Web UI (localhost:4098) visibility for the user.
