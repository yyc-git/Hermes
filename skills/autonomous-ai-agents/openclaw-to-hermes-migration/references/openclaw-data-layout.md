# OpenClaw Data Layout — real inventory (2026-08-17, Windows, C:\Users\Administrator\.openclaw)

## openclaw.json (root config)
- `agents.defaults.workspace` = `C:\Users\Administrator\.openclaw\workspace` ← **data home**
- `agents.defaults.model.primary` = `opencode/deepseek-v4-flash-free`
- `agents.defaults.memorySearch.provider` = local (QMD embedding gemma, `~/.cache/qmd/models/...gguf`)
- `agents.defaults.heartbeat` = every 2h, activeHours 09:00–24:00 Asia/Shanghai
- agents.list: main (default), testagent (separate workspace/agentDir)

## workspace\ (the real data)
| Path | Content |
|---|---|
| `skills\` | 53 enabled skill dirs: 51 single `SKILL.md`; `tencent-channel-community` has 6 files (incl. nested dir + `_meta.json` + `references`); `multica-create-squad-issue` is EMPTY (skip) |
| `skills-archive\` | cnblogs-publish, gts-analysis, gts-logs, gts-recall (each single SKILL.md) |
| `skills-disabled\` | cnblogs-fetch, github-issue, tencent-channel-community |
| `MEMORY.md` | 47KB core index — sections: 身份 / 检索协议 / 核心锚点词(44) / 分层读取入口 / 工作协议 / Token 优化 / 入库标准 / 工具教训 |
| `MEMORY-ARCHIVE.md` | 88KB detailed archive |
| `MEMORY.md.bak` | 25KB previous version |
| `memory\` | 130+ daily logs 2026-05-15 → present (~2.3MB; some days split `2026-08-04-0755.md` style); `main.sqlite` 11MB (QMD vector index; true path `agents/main/qmd/xdg-cache/qmd/index.sqlite`); `.dreams\` (events.jsonl, short-term-recall.json.migrated); `auto-save-track.json`, `save-state.json` |
| `SOUL.md` | OpenClaw-bot identity: name/creature/vibe/性格/工具(默认下载 D:\Downloads\, yt-dlp 路径) |
| `USER.md` | 用户画像: 巨大娘群主, 互称兄弟, Asia/Shanghai, 中文, GTS-Play (D:/Github/GTS-Play, Lerna monorepo, Three.js + React) |
| `IDENTITY.md` | template (unfilled) |
| `TOOLS.md` / `HEARTBEAT.md` / `AGENTS.md` / `.skill-index.md` | 执行规则 / 心跳协议 / 工作区规则 / 技能索引 |

## skill-workshop\ (HISTORY only — do not migrate as skills)
- `proposals.json`: 271 proposals (259 applied, 6 rejected, 3 pending, 2 quarantined) → 53 unique skill names
- `proposals\<id>\{proposal.json, PROPOSAL.md, rollback.json}` — each proposal.json's `target.skillDir` points to `workspace\skills\<name>\SKILL.md` (how to discover the real location)
- PROPOSAL.md frontmatter: `name`, `description`, `status: proposal`, `version`, `date` — near-compatible with Hermes SKILL.md
- applied proposals are historical versions; the live skill is the current `workspace\skills\<name>\SKILL.md`

## Root-level leftovers (stale/superseded)
- `memory\` (root): 4 md (2026-07-12/21/22/23) + `main.sqlite.migrated` 12MB — partial duplicates of workspace logs
- `plugin-skills\`: browser-automation, canvas, feishu-doc/drive/perm/wiki, qqbot-channel/media/remind — plugin-provided, migrate only if plugin itself is migrated
- `agents\main\agent\openclaw-agent.sqlite` 62MB — sessions/state; `agents\main\qmd\sessions\` — thousands of session .md (do NOT migrate)
- `plugins\installs.json.migrated` — installed plugin manifest

## QMD memory_search quirks (recorded in MEMORY.md)
- qmd patched: `busy_timeout=10000` (2026-08-01) + three `CREATE TRIGGER IF NOT EXISTS` (2026-08-11, gateway cold-start concurrency) — re-patch needed after qmd upgrades (backups `store.js.bak-20260801`/`bak-20260811`)
- search priority: title exact > keyword > semantic; keyword search covers MEMORY-ARCHIVE + daily logs + 笔记/
