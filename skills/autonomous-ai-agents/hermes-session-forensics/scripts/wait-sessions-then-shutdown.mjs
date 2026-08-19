// 等一个或多个 Hermes 会话结束后执行强制关机（2026-08-19 实测通过）
// 与 wait-session-end.cjs 的区别：本脚本支持【多个】会话 + 结束后触发 shutdown，适合「等会话跑完自动关机」场景
// 用法: node wait-sessions-then-shutdown.mjs <sessionId> [<sessionId>...] [--grace 60] [--max-h 12]
//   --grace N : shutdown /t N 秒（默认 60，留取消窗口；反悔在任意终端跑 shutdown /a）
//   --max-h N : 最长等待小时数（默认 12，超时也关机，防会话卡死永久挂机）
// 依赖: C:\sqlite\sqlite3.exe（或用 SQLITE 环境变量指向别的 sqlite3）
// 原理: 轮询 Hermes state.db sessions 表，ended_at 全非空 = 会话结束 → 触发关机
// 注意: 判定活跃看 ended_at 是否为空，Hermes sessions 表没有 time_created/time_updated（那是 OpenCode 的列）
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const DB = 'E:\\Hermes Agent CN Desktop\\data\\hermes-home\\state.db';
const SQLITE = process.env.SQLITE || 'C:\\sqlite\\sqlite3.exe';
const LOG = (process.env.TMP || 'C:\\Users\\Administrator\\AppData\\Local\\Temp') + '\\hermes-wait-sessions.log';

const argv = process.argv.slice(2);
const sids = argv.filter(a => !a.startsWith('--'));
const grace = (argv.find(a => a.startsWith('--grace')) || '--grace 60').split(' ')[1] || '60';
const maxH = Number((argv.find(a => a.startsWith('--max-h')) || '--max-h 12').split(' ')[1] || 12);
const POLL_MS = 30000;

function log(msg) {
  const line = `[${new Date().toLocaleString('zh-CN', { hour12: false })}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG, line + '\n', 'utf8'); } catch (e) {}
}

function runShutdown() {
  const r = spawnSync('shutdown', ['/s', '/f', '/t', grace, '/c', `Hermes auto-shutdown: sessions done, shutdown in ${grace}s. Cancel: shutdown /a`], { encoding: 'utf8' });
  log(`shutdown 返回 exit=${r.status} ${(r.stdout || '').trim()} ${(r.stderr || '').trim()}`);
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function main() {
  if (!sids.length) { log('用法: node wait-sessions-then-shutdown.mjs <sessionId> [...]'); process.exit(2); }
  log(`监控启动，等待 ${sids.length} 个会话结束: ${sids.join(', ')}（grace=${grace}s, max=${maxH}h）`);
  const start = Date.now();
  const maxWaitMs = maxH * 3600 * 1000;
  const inList = sids.map(s => `'${s}'`).join(',');

  while (true) {
    if (Date.now() - start > maxWaitMs) { log('已达最长等待，强制关机'); runShutdown(); process.exit(1); }

    const q = `SELECT id || '|' || COALESCE(ended_at,'') FROM sessions WHERE id IN (${inList});`;
    const r = spawnSync(SQLITE, [DB, q], { encoding: 'utf8' });
    if (r.status !== 0) { log('查询失败，30s 重试: ' + (r.stderr || '').trim()); await sleep(POLL_MS); continue; }

    const status = {};
    for (const line of (r.stdout || '').split('\n')) {
      const m = line.trim().match(/^([^|]+)\|(.*)$/);
      if (m) status[m[1]] = m[2];
    }

    let allDone = true;
    const detail = [];
    for (const s of sids) {
      if (s in status) {
        const done = status[s] !== '';
        detail.push(`${s}=${done ? 'DONE' : 'running'}`);
        if (!done) allDone = false;
      } else {
        detail.push(`${s}=NOT_FOUND`);
        allDone = false;
      }
    }

    if (allDone) { log(`全部会话已结束 (${detail.join(' | ')}），执行强制关机`); runShutdown(); process.exit(0); }

    log(`等待中: ${detail.join(' | ')}`);
    await sleep(POLL_MS);
  }
}

main().catch((e) => { log('异常: ' + (e && e.stack ? e.stack : String(e))); process.exit(3); });
