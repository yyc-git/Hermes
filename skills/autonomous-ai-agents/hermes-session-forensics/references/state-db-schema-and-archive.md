# Hermes state.db schema & session archive SOP

> 2026-08-18 实测：第一次尝试 `UPDATE ... WHERE ended_at IS NOT NULL` 归档零命中（schema 实测 ended_at 恒 NULL）。本文档固化正确 schema + archive 模板。

## schema 实测（state.db sessions 表）

```
id(TEXT), source(TEXT), user_id(TEXT), session_key(TEXT), chat_id(TEXT),
chat_type(TEXT), thread_id(TEXT), display_name(TEXT), origin_json(TEXT),
expiry_finalized(INTEGER), model(TEXT), model_config(TEXT),
system_prompt(TEXT), parent_session_id(TEXT),
started_at(REAL, 秒),          -- ⚠️ 单位是秒，不是毫秒
ended_at(REAL, 恒为 NULL),     -- ⚠️ 不论活跃/已结束都 NULL，别用
end_reason(TEXT),
message_count(INTEGER),        -- 0 = 空会话，可视为未启用
tool_call_count(INTEGER),
input_tokens(INTEGER), output_tokens(INTEGER),
cache_read_tokens(INTEGER), cache_write_tokens(INTEGER),
reasoning_tokens(INTEGER),
cwd(TEXT), git_branch(TEXT), git_repo_root(TEXT),
billing_provider(TEXT), billing_base_url(TEXT), billing_mode(TEXT),
estimated_cost_usd(REAL), actual_cost_usd(REAL),
cost_status(TEXT), cost_source(TEXT), pricing_version(TEXT),
title(TEXT), api_call_count(INTEGER),
handoff_state(TEXT), handoff_platform(TEXT), handoff_error(TEXT),
compression_failure_cooldown_until(REAL), compression_failure_error(TEXT),
compression_fallback_streak(INTEGER),
profile_name(TEXT), rewind_count(INTEGER),
archived(INTEGER, 0/1)         -- 软隐藏开关，可逆
```

## 活跃 vs 已死的判定

**`ended_at` 没用**，必须组合判定：

| 判定目标 | SQL 条件 |
|---|---|
| 当前真正活跃 | `ended_at IS NULL AND message_count > 0 AND started_at > (now - 4h)` |
| 可归档（已实质死亡） | `archived = 0 AND message_count > 0 AND started_at < (now - 4h)` |
| 空会话（无意义） | `message_count = 0 OR message_count = 1`（仅初始 system prompt） |

`4h` 是经验阈值（短于此视为还在跑，长于此视为已死但还没清）。可调成 `1h`（更激进）或 `24h`（保守）。

## archive 模板（dry-run 默认，--apply 才改库）

写文件 `tmp_archive_sessions.cjs`：

```js
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('E:/Hermes Agent CN Desktop/data/hermes-home/state.db');

const cutoff = (Date.now() / 1000) - 4 * 3600;
const targets = db.prepare(`
  SELECT id, title, message_count, started_at FROM sessions
  WHERE archived = 0 AND message_count > 0 AND started_at < ?
  ORDER BY started_at DESC
`).all(cutoff);

console.log(`Found ${targets.length} sessions to archive`);
for (const t of targets) console.log(`  ${t.id.substring(0,12)} | msg=${t.message_count} | ${t.title.substring(0,40)}`);

if (targets.length === 0) { console.log('nothing to do'); process.exit(0); }

const dryRun = !process.argv.includes('--apply');
console.log(dryRun ? '\n[dry-run] no changes made; pass --apply to commit' : '\n[APPLY] updating...');

if (!dryRun) {
  const stmt = db.prepare(`UPDATE sessions SET archived = 1 WHERE id = ? AND archived = 0`);
  let n = 0;
  for (const t of targets) { stmt.run(t.id); n++; }
  console.log(`[APPLY] archived ${n} sessions`);
}

const verify = db.prepare(`SELECT COUNT(*) AS c FROM sessions WHERE archived = 1`).get();
console.log(`\nAfter: ${verify.c} sessions are now archived`);
```

```bash
# 演练
node tmp_archive_sessions.cjs
# 真改
node tmp_archive_sessions.cjs --apply
# 验证
node tmp_archive_sessions.cjs --apply   # 第二次跑 0 targets = 已干净
```

恢复（误操作回滚）：
```js
db.prepare(`UPDATE sessions SET archived = 0 WHERE archived = 1 AND started_at < ?`)
  .run(cutoff);
```

## 坑

- 🔴 **路径用 forward slash**：`new DatabaseSync('E:/Hermes Agent CN Desktop/data/...')`，反斜杠会被 PowerShell 当作转义吃掉
- 🔴 **started_at 是秒**：`new Date(r.started_at * 1000)`，不是毫秒
- 🔴 **`hermes sessions archive` 无效**：schema 上 ended_at 恒 NULL，archive filter 永远 0 命中。不要再花时间试它的 `--dry-run` / `--filter` 变体
- 🔴 **写库需 Hermes 不持锁**：node:sqlite 默认 WAL 模式，可与 desktop 同时读写；如果报 SQLITE_BUSY 重试即可
- 🔴 **清理临时 .cjs**：archive 跑完删 `tmp_archive_sessions.cjs`，不要污染 hermes-home/scripts/

## 实测数据（2026-08-18）

- 总会话数：42
- 初始 archived：1
- 一轮 dry-run 候选：16（全是 08-17，已 4h+ 无活动）
- `--apply` 后 archived：17
- 含大户 `704e78`（389 calls / 88.9M cacheRead / $0.29）—— 跨日长会话典型