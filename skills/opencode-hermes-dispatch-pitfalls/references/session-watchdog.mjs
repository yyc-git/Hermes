#!/usr/bin/env node
/**
 * 轻量会话监控：纯工具轮询，检测 LLM 静默失败 / 额度耗尽 / rate limit
 * 用法: node session-watchdog.mjs <sessionId> [--interval 60] [--dir D:\Github\GTS-Play]
 * 
 * 退出码: 0=正常完成, 1=异常(需LLM处理), 2=超时
 * 
 * 与 wait-opencode-session.mjs 配合使用:
 * - wait 脚本: 主监控(完成/超时/stuck 通知)
 * - watchdog: 异常检测(60s轮询, 0 LLM token, 关键词匹配)
 */
import { execSync } from 'child_process';

const args = process.argv.slice(2);
const sessionId = args[0];
const interval = parseInt(args.find(a => a === '--interval') ? args[args.indexOf('--interval') + 1] : '60') * 1000;
const dir = args.find(a => a === '--dir') ? args[args.indexOf('--dir') + 1] : 'D:\\Github\\GTS-Play';
const dbPath = 'C:\\Users\\Administrator\\.local\\share\\opencode\\opencode.db';

const FAIL_KEYWORDS = [
    'Free usage exceeded',
    'exceeded the 5-hour usage quota',
    'rate limit',
    '429',
    '401',
    '5xx',
    'Insufficient balance',
    'socket connection was closed unexpectedly',
    'ContextOverflowError',
    'SIGKILL',
];

const DONE_KEYWORDS = ['step-finish reason=stop', 'step-finish reason=completed'];

function queryDB(sql) {
    try {
        return execSync(`C:\\sqlite\\sqlite3.exe "${dbPath}" "${sql}"`, { encoding: 'utf8', timeout: 5000 }).trim();
    } catch (e) { return ''; }
}

let lastUpdateTime = Date.now();
let lastData = '';

console.log(`[watchdog] 监控 session: ${sessionId}`);
console.log(`[watchdog] 轮询间隔: ${interval / 1000}s`);

while (true) {
    const rows = queryDB(`SELECT substr(data, 1, 500) FROM part WHERE session_id = '${sessionId}' ORDER BY time_created DESC LIMIT 2`);
    const now = Date.now();
    
    if (rows && rows !== lastData) {
        lastData = rows;
        lastUpdateTime = now;
        
        for (const kw of FAIL_KEYWORDS) {
            if (rows.includes(kw)) {
                console.log(`\n[watchdog] ⚠️ 检测到异常关键词: "${kw}"`);
                process.exit(1);
            }
        }
        
        for (const kw of DONE_KEYWORDS) {
            if (rows.includes(kw)) {
                console.log(`\n[watchdog] ✅ session 完成: ${kw}`);
                process.exit(0);
            }
        }
        
        process.stdout.write('.');
    }
    
    if (now - lastUpdateTime > 900000) {
        console.log(`\n[watchdog] ⏰ 超时: ${(now - lastUpdateTime) / 1000}s 无更新`);
        process.exit(2);
    }
    
    await new Promise(r => setTimeout(r, interval));
}
