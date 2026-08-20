// 用法: node wait-session-end.cjs <state.db路径> <sessionId> [maxMinutes=120]
// 轮询 sessions 表 ended_at，会话结束打印摘要并 exit 0；超时 exit 2。
// 配合 terminal(background=true, notify_on_complete=true) 挂后台：
//   结束 → 自动收到通知；等不到 → 收到 TIMEOUT 通知。
// 典型场景: 兄弟说「等 XX 会话结束后再继续任务」。
const { DatabaseSync } = require('node:sqlite');
const [dbPath, sid, maxMinArg] = process.argv.slice(2);
if (!dbPath || !sid) {
  console.error('用法: node wait-session-end.cjs <state.db> <sessionId> [maxMinutes]');
  process.exit(1);
}
const db = new DatabaseSync(dbPath);
const maxMin = maxMinArg ? parseInt(maxMinArg, 10) : 120;
const started = Date.now();
(async () => {
  while (Date.now() - started < maxMin * 60 * 1000) {
    const row = db.prepare(
      `SELECT ended_at, end_reason, api_call_count, message_count FROM sessions WHERE id=?`
    ).get(sid);
    if (row && row.ended_at) {
      console.log(`SESSION_ENDED ${sid} reason=${row.end_reason ?? '-'} calls=${row.api_call_count} msgs=${row.message_count}`);
      process.exit(0);
    }
    await new Promise(r => setTimeout(r, 20000));
  }
  console.log(`TIMEOUT: ${maxMin}min 内未结束`);
  process.exit(2);
})();
