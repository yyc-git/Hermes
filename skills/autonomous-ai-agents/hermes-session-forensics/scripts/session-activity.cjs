// 还原 Hermes 会话活动：user 消息时间线 +（可选）tool 调用
// 用法: node session-activity.cjs <state.db路径> <sessionId> [--tools]
// 例:   node session-activity.cjs "E:/Hermes Agent CN Desktop/data/hermes-home/state.db" 20260817_100712_f74bbc
// 说明: state.db messages 表存全文，agent.log 的 conversation turn 行长消息会被截断(msg='...')，
//       所以还原"会话做了什么"优先用本脚本，而不是 grep 日志。
const { DatabaseSync } = require('node:sqlite');
const dbPath = process.argv[2] || 'E:/Hermes Agent CN Desktop/data/hermes-home/state.db';
const sid = process.argv[3];
const showTools = process.argv.includes('--tools');
if (!sid) { console.error('用法: node session-activity.cjs <state.db路径> <sessionId> [--tools]'); process.exit(1); }
const db = new DatabaseSync(dbPath);
const meta = db.prepare('SELECT title, model, api_call_count, estimated_cost_usd, started_at, ended_at FROM sessions WHERE id=?').get(sid);
if (meta) {
  console.log(`# ${sid} | ${meta.title ?? '(无标题)'} | model=${meta.model} | calls=${meta.api_call_count} | $${(meta.estimated_cost_usd ?? 0).toFixed(4)}`);
}
const strip = s => (s || '').replace(/\n/g, ' ').replace(/\[Hermes UI Workspace\][\s\S]*?shell commands\.\s*/, '').trim();
const rows = db.prepare(`SELECT role, content, tool_name, timestamp FROM messages WHERE session_id=? AND role IN ('user','tool') ORDER BY id`).all(sid);
for (const r of rows) {
  const d = new Date(r.timestamp * 1000).toLocaleTimeString('zh-CN', { hour12: false });
  if (r.role === 'tool') {
    if (showTools) console.log(`${d} [tool] ${r.tool_name}: ${strip(r.content).slice(0, 120)}`);
    continue;
  }
  const c = strip(r.content);
  if (!c || c.startsWith('Review the conversation') || c.startsWith('[IMPORTANT')) continue; // 跳过系统注入消息
  console.log(`${d} | ${c.slice(0, 220)}`);
}
