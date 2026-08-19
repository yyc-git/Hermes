---
name: agent-data-migration
description: "Migrate agent data (memory, skills, config, secrets) from another agent framework into Hermes — e.g. OpenClaw → Hermes. Covers source inventory, native importer availability, format compatibility, backup, copy, framework-specific adaptation, verification."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [migration, openclaw, hermes, memory, skills, data, agent]
---

# Agent Data Migration (e.g. OpenClaw → Hermes)

## When to use
- User wants to move from another personal-agent framework (OpenClaw / Clawdbot, Cursor, Claude Code, etc.) into Hermes — memories, skills, config, cron, credentials.
- Any "迁移 OpenClaw 到 Hermes" / "migrate X to Hermes" request.

## Core principle
Skills are the easy part: most frameworks store live skills as Markdown files with YAML frontmatter (`name` + `description`), which Hermes reads natively. The hard parts are (1) locating where the source stores LIVE data vs. history/artifacts, and (2) adapting framework-specific machinery that the skills call (skill-workshop, opencode scheduling, platform notifications, heartbeat).

## Workflow

### 1. Inventory the source — never assume the layout
For OpenClaw (`~/.openclaw/`):

| Data | Path | Migrate? |
|---|---|---|
| LIVE skills | `workspace/skills/<name>/SKILL.md` | ✅ copy as-is |
| Skill proposal history | `skill-workshop/proposals.json` + `proposals/<id>/PROPOSAL.md` | ❌ history only (hundreds of "applied" proposals collapse to ~50 live skills) |
| Memories | `memory/YYYY-MM-DD.md` (daily logs) | ⚠️ convert to Hermes fact-style entries |
| Old memory DB | `memory/*.sqlite.migrated` | ❌ archive only |
| Plugin skills | `plugin-skills/` | ❌ follow the plugin, don't copy |
| Sessions | `agents/*/qmd/sessions/*.md` | ❌ archive only (thousands of files) |
| Config | `openclaw.json` | ⚠️ extract model/provider + secrets manually |

The authoritative skill list lives in the live-skills dir, NOT in proposals.json. Cross-check `proposal.json`'s `target.skillDir` field to locate the real skill file if unsure.

### 2. Check for a native importer before hand-rolling
`hermes claw migrate --dry-run` — but it REQUIRES the `openclaw-migration` skill (script `scripts/openclaw_to_hermes.py`) at `$HERMES_HOME/skills/migration/openclaw-migration/` or the runtime's `_internal/optional-skills/`. The Hermes CN Desktop build (0.19.0-cn.7) does NOT bundle it and `hermes skills search openclaw-migration` returns nothing. → Verify first; if missing, say so plainly and plan manual migration. Never claim the official command works without running `--dry-run`.

### 3. Verify format compatibility
OpenClaw SKILL.md frontmatter = `name` + `description` → Hermes-compatible. Copy whole directories (they may carry references/scripts/assets). Validate each SKILL.md has `name` + `description`; skip empty dirs.

### 4. Backup first
Zip `workspace/skills` + copy `memory/` to a backup location before any writes.

### 5. Execute
- Skills: `Copy-Item` dirs into `$HERMES_HOME/skills/<new-category>/<name>/`.
- Memories: 🔑 **Hermes built-in memory is plain files — `$HERMES_HOME/MEMORY.md` + `USER.md`** (`hermes memory --help`: "Built-in memory (MEMORY.md/USER.md) is always active"). USER.md-style user profiles from the source often copy over almost verbatim; distilled fact-style memory can be written directly to MEMORY.md (strip source-framework machinery, rephrase in Hermes terms) instead of only re-entering facts via the memory tool in conversation. Archive the source md files verbatim into project notes as the long-term store.
- Secrets/config: manual, per-item confirmation into `$HERMES_HOME/.env` — never bulk-copy `credentials/`.

### 6. Verify
`hermes skills list | findstr <prefix>`; `/reload-skills` or new session; trigger one skill to confirm it loads.

## Pitfalls
- The `hermes` CLI is not on PATH in the CN desktop runtime — see `references/hermes-cn-desktop-cli.md` for the invocation pattern.
- Do NOT migrate skill-workshop proposals as skills (259 applied proposals ≈ 53 live skills; the proposal body is a draft, the live file is in workspace/skills).
- OpenClaw skills are often deep integrations (skill_workshop proposals, OpenCode Pro scheduling, feishu/wechat notifications, 2h heartbeat, local-embedding memory search). Build a compatibility table (OpenClaw concept → Hermes equivalent: skill_manage, shell-opencode, feishu/weixin adapters, cron, memory provider) and get user decisions on each.
- Skill bodies often reference project repo paths (`笔记/`, `specs/`, `test/`) — keep the workspace pointed at the same repo or they break.
- Preserve UTF-8; avoid editors that re-encode (no Notepad resave).

## References
- `references/openclaw-to-hermes.md` — full OpenClaw data map + worked migration plan (phases 0–6, commands, compatibility table).
- `references/hermes-cn-desktop-cli.md` — running hermes CLI from the Hermes CN Desktop runtime (Start-Process pattern, HERMES_HOME).
