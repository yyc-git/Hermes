# Session Archaeology — reconstructing past Hermes sessions from logs

Verified 2026-08-17 on Hermes CN Desktop 0.19.0-cn.7 (HERMES_HOME = `E:\Hermes Agent CN Desktop\data\hermes-home`).

## When to use
User asks "what was session <id> doing?", "did that session save memory?", or you need to check whether past work persisted skills/memory. There is no cross-session memory of past sessions — logs are the source of truth.

## Steps
1. Session IDs: `YYYYMMDD_HHMMSS_<rand>` (e.g. `20260817_100712_f74bbc`).
2. Grep the two log files for the ID (search_files, pattern = the ID):
   - `$HERMES_HOME/logs/agent.log` — main activity record
   - `$HERMES_HOME/logs/errors.log` — warnings/failures (often more informative than agent.log)
3. Log-line anatomy (agent.log):
   - `agent.turn_context: conversation turn: session=<id> ... msg='<first user msg>'` — what the session started with
   - `agent.conversation_loop: API call #N: model=... in=... out=... total=... cache=...` — token usage per LLM call
   - `agent.tool_executor: tool <name> completed (Ns, N chars)` — every tool call and its cost
   - `agent.conversation_loop: Turn ended: reason=... api_calls=N/90` — turn outcome
   - errors.log WARNING lines with `[<session-id>]` — failures, curator refusals, rate limits
4. To check what got persisted: `memories/MEMORY.md` (entries separated by `§`) and the `skills/` tree — compare LastWriteTime against session start time. Memory/skill writes appear as `tool_executor: tool memory/skill_manage` lines; curator refusals appear as WARNING lines (`Refusing background curator patch ... not agent-created (created_by=None)`).

## Real example (2026-08-17, session `20260817_100712_f74bbc` = OpenClaw→Hermes migration)
- First msg `你好` at 10:07:23 → turned out to be the full migration session.
- errors.log revealed the story: `hermes claw migrate --help` exploration, GitHub API rate-limit (unauthenticated 60 req/hr), `openclaw-migration` skill 404 (not in repo/hub), curator refusals on `opencode-schedule` / `gts-save-memory` (manually authored skills are off-limits), `&` backgrounding rejections, `E:\Hermes` space-in-path failure.
- Persistence check: `memories/MEMORY.md` had 7 fresh entries (env, OpenClaw data layout, user preference "direct concise answers", dual-agent pipeline, migration done, dsh installed); `skills/` had `deepseek-harness`, `openclaw-migration`, `openclaw-to-hermes-migration`, `agent-data-migration` + 50+ `gts/*` copies → the session had auto-saved everything, no user trigger.

## Pitfalls
- `search_files` across HERMES_HOME for the ID matches only log files — session JSONL transcripts are not kept as plain files there; logs + state.db are the record.
- A turn ending / "CLI exit 0" is NOT process death for server-side agents (OpenCode pattern) — for those, use DB `time_updated` checks (see `opencode-schedule` skill), not logs alone.
- Compare error-log timestamps across sessions — parallel sessions interleave in the same log files, so filter by the exact session ID.
