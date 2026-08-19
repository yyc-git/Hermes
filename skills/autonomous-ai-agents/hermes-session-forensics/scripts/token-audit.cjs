#!/usr/bin/env node
/**
 * token-audit.cjs — 从 Hermes state.db 导出会话级 token/费用汇总
 *
 * 用法:
 *   node token-audit.cjs [state.db路径] [起始日期YYYY-MM-DD]
 * 默认路径: $env:HERMES_HOME\state.db,兜底 E:\Hermes Agent CN Desktop\data\hermes-home\state.db
 *
 * 数据源: sessions 表(每会话计费汇总)、session_model_usage 表(会话×模型细分)。
 * agent.log 里没有 token 数据,别去 grep 日志。
 * 环境要求: Node >= 23.4(node:sqlite 免 flag;本机 v24.16.0 验证通过)。
 * 无 sqlite3 CLI / 无 Python 时这就是唯一零依赖查库方式。
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const FALLBACK = 'E:\\Hermes Agent CN Desktop\\data\\hermes-home\\state.db';
const argDb = process.argv[2];
const since = process.argv[3];
const dbPath = argDb || (process.env.HERMES_HOME ? path.join(process.env.HERMES_HOME, 'state.db') : FALLBACK);

if (!fs.existsSync(dbPath)) {
  console.error('state.db not found:', dbPath);
  console.error('传参: node token-audit.cjs <path-to-state.db> [YYYY-MM-DD]');
  process.exit(1);
}

const db = new DatabaseSync(dbPath, { readOnly: true });
const sinceTs = since ? Math.floor(new Date(since + 'T00:00:00').getTime() / 1000) : 0;

const rows = db.prepare(`SELECT id, title, model, billing_provider, api_call_count, message_count,
  input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens,
  estimated_cost_usd, cost_status, cost_source,
  datetime(started_at, 'unixepoch', 'localtime') started, datetime(ended_at, 'unixepoch', 'localtime') ended
  FROM sessions WHERE started_at >= ? ORDER BY started_at`).all(sinceTs);

console.log('=== per-session (USD) ===');
let tc = { in: 0, out: 0, cr: 0, cw: 0, r: 0, cost: 0, calls: 0 };
for (const r of rows) {
  const cost = r.estimated_cost_usd ?? 0;
  const short = String(r.id).slice(-6);
  const title = String(r.title || '').slice(0, 26);
  console.log(`${r.started} | ${short} | ${title} | calls=${r.api_call_count} | in=${r.input_tokens} out=${r.output_tokens} cacheRead=${r.cache_read_tokens} reason=${r.reasoning_tokens} | $${cost.toFixed(4)}`);
  tc.in += r.input_tokens; tc.out += r.output_tokens; tc.cr += r.cache_read_tokens;
  tc.cw += r.cache_write_tokens; tc.r += r.reasoning_tokens; tc.cost += cost; tc.calls += r.api_call_count;
}

const total = tc.in + tc.out + tc.cr + tc.cw + tc.r;
console.log('\n=== totals ===');
console.log(`sessions=${rows.length} calls=${tc.calls}`);
console.log(`input=${tc.in} output=${tc.out} cacheRead=${tc.cr} cacheWrite=${tc.cw} reasoning=${tc.r}`);
console.log(`cacheRead share=${(100 * tc.cr / total).toFixed(1)}%  avg cacheRead/call=${Math.round(tc.cr / Math.max(1, tc.calls))}`);
console.log(`estimated cost=$${tc.cost.toFixed(4)} (cost_status=estimated, 非实际账单)`);

console.log('\n=== session_model_usage ===');
const usage = db.prepare(`SELECT session_id, model, api_call_count, input_tokens, output_tokens,
  cache_read_tokens, estimated_cost_usd,
  datetime(first_seen, 'unixepoch', 'localtime') first, datetime(last_seen, 'unixepoch', 'localtime') last
  FROM session_model_usage WHERE first_seen >= ? ORDER BY first_seen`).all(sinceTs);
for (const u of usage) {
  const short = u.session_id.slice(-6);
  console.log(`${u.first} | ${short} | ${u.model} | calls=${u.api_call_count} | cacheRead=${u.cache_read_tokens} | $${(u.estimated_cost_usd ?? 0).toFixed(4)}`);
}
db.close();
