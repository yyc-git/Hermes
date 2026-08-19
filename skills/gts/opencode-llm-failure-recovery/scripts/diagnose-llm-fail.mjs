// diagnose-llm-fail.mjs — 一键诊断 OpenCode session/server/key 失败原因
// 2026-08-17 创,2026-08-18 B2-2 反复打磨(volcark key 实测/Hermes 端误判/启动权限制全部覆盖)
//
// 用法:node scripts/diagnose-llm-fail.mjs [sessionId]
//   不传 sid: 仅查 server 健康(兄弟说"OpenCode 死了"第一动作)
//   传 sid: 额外查该 session 的 part 表 + 日志 + volcark key 实测
//
// 输出 6 段,1 轮 LLM 决策:
//   1. server HTTP / 端口 / 进程 — 区分"server 死了"vs"agent 跑了但没动静"
//   2. volcark provider 配置 (opencode.json) — baseURL/apiKey 错配检查
//   3. session 状态 — /api/session 列表 + 指定 sid 的 DB age
//   4. volcark API key 实测(直连 ark.cn-beijing.volces.com,绕开 OpenCode 缓存)
//      🔴 实测发现:Hermes runtime 用 minimax-cn 不依赖 volcark,所以"Hermes 能用 ≠ OpenCode 能用"
//      必须实测,不能靠兄弟推断("key 应该 OK")
//   5. opencode.log 最近 5000 行 ERROR 特征 — 余额不足/stream error/exiting loop
//   6. 判定结论 + 推荐动作(发「继续」/拆 session/兄弟手动启动)

import http from 'node:http'
import https from 'node:https'
import { execSync, execFileSync } from 'node:child_process'
import { existsSync, writeFileSync, unlinkSync } from 'node:fs'
import os from 'node:os'

const sid = process.argv[2] || null
const OC = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/opencode-ai/bin/opencode.exe'
const OC_CFG = `${os.homedir()}/.config/opencode/opencode.json`
const OC_LOG = 'C:/Users/Administrator/.local/share/opencode/log/opencode.log'

if (!sid) {
  console.log('⚠️  未传 sessionId,只查 server 健康(兄弟说 "OpenCode 死了" 第一动作)')
  console.log('   完整用法:node scripts/diagnose-llm-fail.mjs <sessionId>')
  console.log('')
}

console.log('=== 1. server 健康 ===')
function get(url) {
  return new Promise((resolve) => {
    const u = new URL(url)
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, timeout: 5000 }, (res) => {
      let data = ''
      res.on('data', (c) => data += c)
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', (e) => resolve({ status: 0, body: e.message }))
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }) })
    req.end()
  })
}
const web = await get('http://127.0.0.1:4098/')
console.log(`[${web.status === 200 ? 'OK' : 'FAIL'}] 4098 HTTP = ${web.status}`)

let netstat = ''
try { netstat = execSync('netstat -ano | findstr ":4098.*LISTENING"', { encoding: 'utf8', windowsHide: true }).trim() } catch {}
console.log(`[${netstat.length > 0 ? 'OK' : 'FAIL'}] 4098 LISTENING`)

let procOut = ''
try { procOut = execSync('tasklist /FI "IMAGENAME eq opencode.exe" /FO TABLE', { encoding: 'utf8', windowsHide: true }) } catch {}
const procLines = procOut.split('\n').filter(l => /opencode\.exe/.test(l))
console.log(`[${procLines.length > 0 ? 'OK' : 'FAIL'}] opencode.exe 进程 ${procLines.length} 个`)
for (const l of procLines.slice(0, 3)) console.log(`  ${l.trim().substring(0, 100)}`)

if (!sid) {
  console.log('')
  console.log('=== 结论(server 健康检查完毕)===')
  if (web.status === 200 && procLines.length > 0) console.log('✅ server 健康,继续按常规流程')
  else console.log('🔴 server 异常,推荐:兄弟手动启动 OpenCode(agent 无权启动 GUI server)')
  process.exit(0)
}

console.log('')
console.log('=== 2. volcark provider 配置 (opencode.json) ===')
if (existsSync(OC_CFG)) {
  const cfg = execSync(`powershell -NoProfile -Command "Get-Content '${OC_CFG}' -Raw"`, { encoding: 'utf8', windowsHide: true })
  const baseURL = (cfg.match(/baseURL[^\n]*/) || [''])[0]
  const apiKey = (cfg.match(/apiKey[^\n]*/) || [''])[0]
  console.log(`  ${baseURL.trim() || '(无 baseURL)'}`)
  console.log(`  ${apiKey.trim() || '(无 apiKey)'}`)
} else console.log('  opencode.json 不存在')

console.log('')
console.log('=== 3. session 状态 ===')
try {
  const s = JSON.parse(execSync(`"${OC}" db "SELECT id, time_updated FROM session WHERE id='${sid}'" --format json`, { encoding: 'utf8', windowsHide: true }))
  if (s.length === 0) {
    console.log('[FAIL] session 不存在(可能被删或从未创建)')
  } else {
    const age = Math.round((Date.now() - s[0].time_updated) / 1000)
    console.log(`[OK] session ${sid} age=${age}s (active=${age < 240})`)
  }
} catch (e) { console.log('[FAIL] DB 查询异常: ' + e.message) }

try {
  const parts = JSON.parse(execSync(`"${OC}" db "SELECT time_updated, data FROM part WHERE session_id='${sid}' ORDER BY time_updated DESC LIMIT 6" --format json`, { encoding: 'utf8', windowsHide: true }))
  console.log('')
  console.log('=== 最近 6 条 part ===')
  const now = Date.now()
  for (const p of parts) {
    const age = Math.round((now - p.time_updated) / 1000)
    let d
    try { d = JSON.parse(p.data) } catch { continue }
    let kind = d.type || '?'
    let body = ''
    if (d.text) body = d.text.substring(0, 120)
    else if (d.tokens !== undefined) body = `reason=${d.reason} tokens.input=${d.tokens.input} tokens.output=${d.tokens.output}`
    else if (kind === 'reasoning') body = (d.text || '').substring(0, 80)
    else if (kind === 'tool') body = `${d.tool} status=${d.state?.status || '?'}`
    else body = JSON.stringify(d).substring(0, 100)
    console.log(`  [${age}s前][${kind}] ${body}`)
  }
} catch (e) { console.log('[FAIL] part 查询失败: ' + e.message) }

if (existsSync(OC_LOG)) {
  try {
    const log = execSync(`powershell -NoProfile -Command "Get-Content '${OC_LOG}' -Tail 5000"`, { encoding: 'utf8', windowsHide: true })
    const lines = log.split('\n')
    const errs = lines.filter(l => l.indexOf('level=ERROR') >= 0 && (l.indexOf(sid) >= 0 || l.indexOf('AI_APICallError') >= 0 || l.indexOf('Insufficient balance') >= 0 || l.indexOf('stream error') >= 0 || l.indexOf('API key or AK') >= 0))
    console.log('')
    console.log(`=== opencode.log 命中错误行(近 5000 行): ${errs.length} ===`)
    for (const e of errs.slice(-5)) console.log('  ' + e.substring(0, 220))
  } catch (e) { console.log('[WARN] 日志读取失败: ' + e.message) }
}

// 实测 volcark key(从 opencode.exe 进程环境读真实 key,绕开 shell 转义坑)
// 用临时 .ps1 文件避免内联 PS 命令 $_ / [D] / 中文的转义炸
const tmpPs1 = `${os.homedir()}/.tmp-diagnose-readenv-${Date.now()}.ps1`
writeFileSync(tmpPs1, `$p = Get-Process opencode -ErrorAction SilentlyContinue | Select-Object -First 1\nif ($p) {\n  $k = $p.StartInfo.EnvironmentVariables['ARK_CODING_API_KEY']\n  if ($k) { Write-Output $k }\n} else {\n  $env_k = [Environment]::GetEnvironmentVariable('ARK_CODING_API_KEY','User')\n  if ($env_k) { Write-Output $env_k }\n}`)

const key = (() => {
  try {
    return execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpPs1}"`, { encoding: 'utf8', windowsHide: true }).trim()
  } catch { return '' } finally { try { unlinkSync(tmpPs1) } catch {} }
})()

if (key) {
  console.log('')
  console.log('=== volcark API key 直连实测(绕过 OpenCode 缓存)===')
  console.log(`  key len=${key.length} prefix=${key.substring(0, 12)}...`)
  function callVolcark() {
    return new Promise((resolve) => {
      const body = JSON.stringify({ model: 'deepseek-v4-flash-ga-260731', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 })
      const req = https.request({ hostname: 'ark.cn-beijing.volces.com', path: '/api/coding/v3/chat/completions', method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'Content-Length': Buffer.byteLength(body) }, timeout: 15000 }, (res) => {
        let data = ''
        res.on('data', (c) => data += c)
        res.on('end', () => resolve({ status: res.statusCode, body: data }))
      })
      req.on('error', (e) => resolve({ status: 0, body: e.message }))
      req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }) })
      req.write(body); req.end()
    })
  }
  const vc = await callVolcark()
  const ok = vc.status === 200 && vc.body.indexOf('error') < 0
  console.log(`[${ok ? 'OK' : 'FAIL'}] volcark HTTP = ${vc.status} ${ok ? '(key 有效)' : '(key 无效/格式不对)'}`)
  if (!ok && vc.body) console.log(`  body: ${vc.body.substring(0, 250)}`)
  else if (ok) console.log(`  → key 真的有效,问题在 OpenCode server 进程缓存, kill server 重启即可(不必改 key)`)
} else console.log('').log('=== volcark key 未找到(env ARK_CODING_API_KEY + opencode 进程 env 均无) ===')

console.log('')
console.log('=== 判定结论 ===')
console.log('1. server 死/活：见上面 OpenCode 进程行 → 死了=兄弟手动启动,活着=继续')
console.log('2. session 状态：见 part 表(只有 brief text = dispatch 即死;最后 step-finish reason=unknown = LLM 失败;最后 tool bash running = 命令挂起)')
console.log('3. 日志错误：见 opencode.log 行(AI_APICallError=key 问题,Insufficient balance=余额,stream error=断流)')
console.log('4. key 实测：见 volcark 行(HTTP 200=key 真有效,问题在 OpenCode 缓存;401/403=key 真失效)')
console.log('5. 处置：按 SKILL.md 「恢复操作」节发「继续」/拆 session/OpenCode 重启')