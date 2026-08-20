#!/usr/bin/env node
// .tmp-dispatch.cjs — Hermes terminal 调 OpenCode 的唯一稳方式 (2026-08-19 实测)
// 用法:
//   1. 复制本文件到项目根目录, 重命名为 .tmp-dispatch-<task>.cjs
//   2. 修改下面的 task / briefFile / model / title
//   3. terminal(background=true, timeout=0) node .tmp-dispatch-<task>.cjs 2>&1 | Out-File "$env:TEMP\dispatch.log"
//
// 为什么用 node child_process.spawn 而不是 PowerShell 直接调用 opencode CLI:
// - Start-Process 把多行 $brief 拆给 yargs → 看到 --help 输出
// - cmd /c 截断多行字符串 → CLI fallback 到 server 默认 model (付费版, 违反兄弟硬偏好)
// - Get-Content | opencode run (stdin pipe) 在 background 下冷启动竞态 → CLI 挂 120s+
// - opencode run -f <file> 在 attach 模式静默失败
// → node child_process.spawn 把 args 当 JS 数组直接传 OS API, 绕开所有 shell 转义

const { spawn } = require('child_process');
const fs = require('fs');

// === 改这里 ===
const task = 'xiaHui-fix-phase0-plan';
const briefFile = '.opencode-brief-xiahui-fix-phase0-plan.md';
const model = 'opencode/deepseek-v4-flash-free';  // 兄弟硬偏好: 免费时段首选 flash-free
const title = task;
const projectDir = 'D:\\Github\\GTS-Play';
const ocExe = 'C:\\Users\\Administrator\\AppData\\Roaming\\npm\\node_modules\\opencode-ai\\bin\\opencode.exe';
// =============

const brief = fs.readFileSync(briefFile, 'utf8');
const args = [
  'run',
  brief,
  '-m', model,
  '--attach', 'http://localhost:4098',
  '--title', title,
  '--no-replay',
  '--auto',
  '--dir', projectDir,
];

const child = spawn(ocExe, args, {
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

child.stdout.on('data', (d) => process.stdout.write('[STDOUT] ' + d.toString()));
child.stderr.on('data', (d) => process.stderr.write('[STDERR] ' + d.toString()));
child.on('exit', (code) => {
  console.error(`[EXIT] code=${code}`);
  process.exit(code || 0);
});