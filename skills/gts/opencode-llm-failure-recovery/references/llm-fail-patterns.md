# LLM 失败模式特征库（2026-08-17/18 实测）

> 这是 opencode-llm-failure-recovery 的快速参考。诊断脚本 `scripts/diagnose-llm-fail.mjs` 自动检测；本文件是已知特征与实测样本。

## 各 provider 失败特征表

| provider / model | 失败特征 | tokens | opencode.log 错误 | 复现概率 | 处置 |
|------|---------|--------|-----------------|---------|------|
| **任意 provider（限流/额度预警，2026-08-18 兄弟实测补充）** | 明确报错 `rate limit` / `429` / `quota exceeded` / `rate_limit_reached` | 不定 | opencode.log `level=ERROR` + `rate limit`/`429`/`quota` 字样 | 限流窗口内持续（通常 60s~几分钟） | **等窗口再试或换组内下一个**；⚠️ 不会静默 unknown，是明确错误 | 
| **opencode-go/deepseek-v4-flash**（付费）| `step-finish reason=unknown` + tokens 全 0 | 0+0 | `level=ERROR stream error providerID=opencode-go` | 请求级偶发断流 | 「继续」1-2 次恢复 |
| **opencode-go/deepseek-v4-pro**（付费）| 同上 | 0+0 | 同上 | 同上 | 同上 |
| **opencode-go/***（余额耗尽）| `step-finish unknown` + tokens 0 | 0+0 | `error="Insufficient balance. Manage your billing here: https://..."` | 持续到充值 | **切 flash-free**（不依赖 opencode-go 余额）；或通知兄弟充值 |
| **opencode/deepseek-v4-flash-free**（免费）| `step-finish unknown` + tokens **非 0** | 可能 100K+ | `stream error providerID=opencode llm.provider=opencode` | 2026-08-18 B2-2 今日 3 次闪断 | 🔴 **先查错误再动手**：rate limit/429=等窗口或换组；瞬时(401/timeout/5xx)=同 session「继续」；静默 unknown+模型实测可用=删会话重开 |
| **volcark/deepseek-v4-flash-ga-260731**（火山）| `error="AI_APICallError: the API key or AK/SK in the request is missing or invalid"` | - | `stream error providerID=volcark` 或 `error="The API key format is is incorrect"` | 配置错或进程缓存错 | **先实测 key**（fetch 直连），HTTP 200 → kill OpenCode 重启（进程缓存旧错误）；401 → 通知兄弟换 key |
| **volcark/deepseek-v4-pro-ga-260813** | 同上 | - | 同上 | 同上 | 同上 |

## 🔴 OpenCode server 整个崩溃（2026-08-18 B2-2b 实测，三种征兆并存）

**现象**：dispatch 后 agent 完全失联，part 表只有 brief 输入，无 step-start/reasoning/tool，进程列表找不到 opencode.exe。**不是 LLM 失败，是 server 进程死了**。

**识别三步**（`scripts/diagnose-llm-fail.mjs` 已封装）：
1. `/api/session HTTP != 200`（curl 或 node http 直连 4098）
2. `netstat -ano | findstr ":4098.*LISTENING"` 无输出
3. `tasklist /FI "IMAGENAME eq opencode.exe"` 无进程

**根因排查**：
- `opencode.log` 连续 `failed to load plugin path=list error="Plugin export is not a function"` + `NotFound: FileSystem.realPath (D:/Github/GTS-Play-wt1)` 反复出现 → OpenCode CLI bug 启动期死锁
- Hermes runtime 自己进程健康（PID 8628 还活着），但 OpenCode server 是独立进程

**修复（agent 无法做，必须兄弟手动）**：
- 🔴 **agent 无权启动 OpenCode GUI server**（需桌面权限、shell 操作窗口、auth token 等沙箱外操作）→ 只能告诉兄弟"请手动启动 OpenCode"
- 兄弟手动启动后：OpenCode PID 变化（8012 → 13964），新进程拿有效 ARK_CODING_API_KEY
- 之前已 dispatch 的 session DB 保留，server 起来后可发「继续」唤醒续接 context
- **不要**：❌ 尝试 `opencode serve` 自启动；❌ 杀多次等自动复活；❌ 重 dispatch 同任务（旧 session 会被新 session 撞，2026-08-15 Xiaye1 fix4/fix5 实锤）

**关键时序**（实测 B2-2b）：
```
22:42 兄弟启动 OpenCode（server 起来，PID 13964，4098 LISTENING）
22:50 bot 发「继续」唤醒 B2-2b session ses_fedfa6d59ffe9zePee8vdpiNop
22:50 time_updated 恢复（context 续接，agent 重新跑）
```

## volcark key 排查（2026-08-18 B2-2b 实测陷阱）

### 兄弟说"Hermes 可以用 volcark"时**不能直接推断 OpenCode 也能用**

- Hermes runtime 实际配置的 provider 是 `minimax-cn`（MiniMax-M3），**不依赖 volcark**
- OpenCode 独立读 `opencode.json` 的 volcark 配置 + `{env:ARK_CODING_API_KEY}` 解析
- Hermes 进程 8628 的 env 含 ARK_CODING_API_KEY（46 字符 `ark-xxx-uuid-后缀`）但 OpenCode 进程拿不到/缓存了旧值
- **正确做法**：拿到 volcark 报错后**先实测 key**（node https 直连），不靠兄弟说"应该 OK"推断

### 实测 key 真有效

```js
import https from 'node:https'
const key = '<YOUR_VOLCENGINE_ARK_KEY>'  // 从 OpenCode 进程 env 读
const body = JSON.stringify({ model: 'deepseek-v4-flash-ga-260731', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 })
const req = https.request({
  hostname: 'ark.cn-beijing.volces.com', path: '/api/coding/v3/chat/completions', method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'Content-Length': Buffer.byteLength(body) },
  timeout: 15000,
}, res => { let d=''; res.on('data', c=>d+=c); res.on('end', ()=>console.log(res.statusCode, d.substring(0,200))) })
req.write(body); req.end()
```

- HTTP 200 + 正常 content → key 真的有效，问题在 OpenCode 进程缓存（**kill OpenCode 重启即可**，不必改 key）
- HTTP 401/403 → key 真的失效，需兄弟去 volcark 控制台拿新 key（`setx ARK_CODING_API_KEY <新key>`，然后 OpenCode 重启）
- 🔴 读 OpenCode 进程 env 用 .ps1 文件，避免内联 PS 命令的转义坑：

```powershell
# 临时 ps1（避免 $_ / [D] / 中文内联被 shell 吃掉转义）
$p = Get-Process opencode -ErrorAction SilentlyContinue | Select-Object -First 1
if ($p) {
  $k = $p.StartInfo.EnvironmentVariables['ARK_CODING_API_KEY']
  if ($k) { Write-Output $k }
} else {
  $env_k = [Environment]::GetEnvironmentVariable('ARK_CODING_API_KEY','User')
  if ($env_k) { Write-Output $env_k }
}
```

## wait 脚本判定逻辑（scripts/wait-opencode-session.mjs）

### 判定流程

```
time_updated 停
  ↓
查 part 表末尾
  ↓
有 step-finish？ → 看 reason
  ├─ stop/completed/error → done（exit 0）
  ├─ unknown              → 进一步判定
  │   ├─ idle > 60s       → llm-fail（exit 4）→ 发「继续」
  │   └─ idle ≤ 60s       → 不判 llm-fail（agent 刚恢复在 init，可能继续中）
  └─ 无 step-finish
      └─ 最后是 tool bash running > idleTimeout → stuck（exit 3）→ 中止命令或继续等
```

### 实测判定时间线

| session | 触发原因 | 处置 | 结果 |
|--------|---------|------|------|
| B2-2 (ses_fedfa6d59ffe9zePee8vdpiNop) | volcark key 报错（OpenCode 进程缓存旧失败） | 发「继续」3 次 + kill OpenCode + 兄弟手动重启 | 续跑生效（B2-2b 派生于 B2-2）|
| B2-1 / B2-1b / B2-1c（flash-free 多次断流）| 模型请求断流（tokens 126K 仍 unknown） | 「继续」3 次 + 拆 session | 3 次内恢复，第 3 次拆 B2-1c |
| 方案/B2-1 等（早期 paid Flash 余额不足）| Insufficient balance | 切 volcark（不依赖 go 余额）| 切后立即恢复 |

### 🔴 unknown 判定补丁历史（避免同类误判）

- 旧版（2026-08-17 前）：`reason=unknown + tokens 全 0` 才算失败 → **漏检免费模型失败**（flash-free 静默异常 tokens 可能 100K+，B2-2 实测三次断流都漏判）
- 补丁 1（2026-08-18 中）：`reason=unknown` 一律视为失败 → **新误判**（B2-2b 实测：历史 unknown part 仍在 part 表里，新 wait 启动立即判 llm-fail，0s 报误判）
- **最终版（2026-08-18 末）**：`reason=unknown` + `idleSec > 60` 才算失败 → 给 agent 60s 恢复窗口，同时排除历史 unknown 误判
- **测试方法**：`node scripts/wait-opencode-session.mjs --check <active-sid>` → 输出 `active` 才正常

## scripts/diagnose-llm-fail.mjs 用法

```bash
# 完整诊断（含 key 实测 + 日志）
node scripts/diagnose-llm-fail.mjs <sessionId>
# 仅 server 健康（兄弟说"OpenCode 死了"第一动作）
node scripts/diagnose-llm-fail.mjs
```

输出 6 段：1) server 健康 2) volcark 配置 3) session 状态 4) volcark key 实测 5) 日志 ERROR 6) 判定结论

## 🔴 兄弟抱怨"OpenCode 死了/没跑/报错"的第一动作（2026-08-18 实测 3 次质问教训）

兄弟说"OpenCode 死了/没跑/报错/它意外停止了"时**第一轮响应必须跑诊断**：

```bash
node scripts/diagnose-llm-fail.mjs <sid>      # 完整
# 或
node scripts/diagnose-llm-fail.mjs          # 仅 server
```

实测每次都拖到 wait 脚本 exit 3/4 才发现问题，**反应太慢**——兄弟说"你怎么没有反应？"质问 3 次。**正确做法**：兄弟抱怨 → 立即跑诊断脚本 → 1 轮 LLM 看输出定动作。

**禁止**：
- ❌ 第一轮假设"agent 还在干活、只是兄弟没刷新"
- ❌ 第一轮假设"Hermes 能用 volcark = OpenCode 也能用"
- ❌ 第一轮假设"OpenCode 进程死了会自动重启"
- ❌ 第一轮写临时 `_tmp-diag-*.mjs` 拼凑 5 个验证点（5 轮 ≈90 秒 vs 诊断脚本 5 秒）

## 关联资源

- SKILL.md：`opencode-llm-failure-recovery`（判定流程 + 调度协议）
- 调度协议：`opencode-schedule`（brief 写法、模型选择、dispatch 参数）
- 会话监控：`opencode-session-ops`（wait 脚本判定详解、part 表查询）
- 停止 session：`gts-opencode-stop`