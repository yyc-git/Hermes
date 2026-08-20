#!/usr/bin/env node
// diag-session-state.mjs — OpenCode session 快速诊断（区分 done / active / stuck / permission-wait / llm-fail）
//
// 用法：
//   node diag-session-state.mjs <sessionId> [--db <path>]
//
// 默认 DB 路径：C:\Users\Administrator\.local\share\opencode\opencode.db
// （可通过 OPENCODE_DB env 或 --db 覆盖）
//
// 输出格式（人类可读）：
//   [state] active | done | stuck | permission-wait | llm-fail | gone
//   [idle_sec] <N>  (从 time_updated 算到当前)
//   [last_type] <type>  (最近 part 类型)
//   [last_reason] <reason>  (最近 step-finish 的 reason)
//   [last_tool_status] <status>  (最近 tool 的 state.status)
//   [last_tool_path] <workdir vs command paths>  (关键：判断是否 --dir 越界)
//   [recommendation] <下一步动作>

import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const sessionId = args[0];
if (!sessionId) {
  console.error('usage: node diag-session-state.mjs <sessionId> [--db <path>]');
  process.exit(1);
}

const dbIdx = args.indexOf('--db');
const dbPath = dbIdx >= 0 ? args[dbIdx + 1] :
  process.env.OPENCODE_DB || join(process.env.USERPROFILE || 'C:\\Users\\Administrator',
    '.local\\share\\opencode\\opencode.db');

if (!existsSync(dbPath)) {
  console.error(`DB not found: ${dbPath}`);
  process.exit(2);
}

const db = new DatabaseSync(dbPath, { readOnly: true });

// 1. session 行
const sess = db.prepare(`SELECT id, time_updated FROM session WHERE id=?`).get(sessionId);
if (!sess) {
  console.log('[state] gone');
  console.log('[recommendation] session 不存在（可能已删或从未创建），重新 dispatch');
  db.close();
  process.exit(0);
}

const nowMs = Date.now();
const idleSec = Math.round((nowMs - sess.time_updated) / 1000);

// 2. 最后 5 条 part
const lastParts = db.prepare(`
  SELECT json_extract(data, '$.type') AS type,
         json_extract(data, '$.reason') AS reason,
         json_extract(data, '$.state.status') AS tool_status,
         json_extract(data, '$.state.input.command') AS tool_cmd,
         json_extract(data, '$.state.input.filePath') AS tool_fp,
         json_extract(data, '$.state.input.workdir') AS tool_workdir,
         time_updated
  FROM part WHERE session_id=? ORDER BY time_updated DESC LIMIT 5
`).all(sessionId);

const lastType = lastParts[0]?.type || 'none';
const lastReason = lastParts[0]?.reason || null;
const lastToolStatus = lastParts[0]?.tool_status || null;
const lastToolCmd = lastParts[0]?.tool_cmd || null;
const lastToolFp = lastParts[0]?.tool_fp || null;
const lastToolWorkdir = lastParts[0]?.tool_workdir || null;

// 3. 判定
let state = 'active';
let recommendation = '';

if (lastReason === 'stop' || lastReason === 'completed' || lastReason === 'error') {
  state = 'done';
  recommendation = '✅ 真完成。提取报告 + 独立复验 issue §11.2 期望表';
} else if (lastType === 'tool' && lastToolStatus === 'running' && idleSec > 60) {
  // 检查是否越界（command 里有 --dir 之外的路径）
  // 简单启发：command 包含 'D:\Github\GTS-Play\' 而 workdir 是 'D:\Github\wt1'
  const wdir = (lastToolWorkdir || '').replace(/\\/g, '/').toLowerCase();
  const cmd = (lastToolCmd || '').replace(/\\/g, '/').toLowerCase();
  const fp = (lastToolFp || '').replace(/\\/g, '/').toLowerCase();

  // 收集所有出现在 cmd/fp 里的根路径（盘符+根目录）
  const pathRe = /([a-z]:\/?[a-z0-9_\-\. \u4e00-\u9fff]+)/gi;
  const candidates = new Set();
  for (const m of (cmd + ' ' + fp).matchAll(pathRe)) candidates.add(m[1].replace(/\/$/, ''));
  // 移除 wdir 的子串
  const outside = [...candidates].filter(p => p && !p.startsWith(wdir));

  if (outside.length > 0) {
    state = 'permission-wait';
    recommendation = `⚠️ 权限等待：workdir=${wdir}，但 command/fp 含外部路径 ${outside.slice(0, 3).join(', ')}。通知兄弟 Web UI 点 Allow，或用 curl POST /session/{id}/message 让 agent 改用 --dir 内路径`;
  } else {
    state = 'active';
    recommendation = `tool bash running ${idleSec}s，路径都在 --dir 内 = 正常执行长任务。不要介入，继续观察`;
  }
} else if (lastReason === 'unknown' && idleSec > 60) {
  state = 'llm-fail';
  recommendation = '🔴 LLM 静默失败（step-finish unknown）。发「继续」唤醒同一 session（用 curl POST /session/{id}/message），不重新 dispatch';
} else if (idleSec > 600) {
  state = 'stuck';
  recommendation = `time_updated 停 ${idleSec}s（>10min）。先查最后 5 条 part 模式（是不是 tool running 跨路径？），再决定发「继续」/重启 wait / 通知兄弟`;
} else {
  state = 'active';
  recommendation = `agent 仍在思考/执行（idle ${idleSec}s），不需要介入`;
}

// 4. 输出
console.log(`[state] ${state}`);
console.log(`[idle_sec] ${idleSec}`);
console.log(`[last_type] ${lastType}`);
console.log(`[last_reason] ${lastReason || '-'}`);
console.log(`[last_tool_status] ${lastToolStatus || '-'}`);
if (lastToolCmd) {
  const cmdPreview = lastToolCmd.length > 150 ? lastToolCmd.slice(0, 150) + '...' : lastToolCmd;
  console.log(`[last_tool_cmd] ${cmdPreview}`);
}
if (lastToolWorkdir) console.log(`[last_tool_workdir] ${lastToolWorkdir}`);
if (lastToolFp) console.log(`[last_tool_filepath] ${lastToolFp}`);
console.log(`[recommendation] ${recommendation}`);

db.close();