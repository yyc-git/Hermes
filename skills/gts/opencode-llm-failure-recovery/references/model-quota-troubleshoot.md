# Provider/Model Quota 故障排查速查(2026-08-17/18 实测定稿)

> 配合 `opencode-llm-failure-recovery` 使用,本文聚焦 **外部资源/配置类问题**(不是模型本身逻辑问题),常见症状是 OpenCode 日志反复报错但 dispatch 仍无进展。

## 当前可用 Provider 全景

| Provider | 模型 | 状态 | 用途 |
|---------|------|------|------|
| `opencode-go` | `deepseek-v4-flash`, `deepseek-v4-pro` 等 | 🔴 **余额不足**(2026-08-17 起持续 Insufficient balance) | 仅在免费组全挂 + 火山挂时才用(经兄弟确认) |
| `opencode`(免费组) | `deepseek-v4-flash-free` → `hy3-free` → `mimo-v2.5-free` → `nemotron-3-ultra-free` → `nemotron-3.5-lightning-free` → `laguna-s-2.1-free` | ✅ **默认首选**(兄弟拍板 2026-08-18),按序轮换 | 9-12/14-18 免费时段 Flash 任务 |
| `volcark` | `deepseek-v4-flash-ga-260731`, `deepseek-v4-pro-ga-260813` | ✅ **实测连通**(2026-08-18),`thinking.type=enabled` 已配 | 免费组全挂 / Pro 任务优先 |

## Provider 资源故障的特征与排查

### 1. `opencode-go` 余额不足 — 最常见也最难定位

**症状**:
```
ERROR message="process" error="Insufficient balance. Manage your billing here: https://..."
```

**特征**:
- 所有 `opencode-go/*` 模型(Flash/Pro/Kimi 等)同时全挂
- 切 Pro 模型重派同样失败(余额与模型无关,是账号级问题)
- opencode.log 反复 `stream error providerID=opencode-go modelID=...`

**排查路径**(必查):
```powershell
Get-Content "$env:USERPROFILE\.local\share\opencode\log\opencode.log" -Tail 3000 | Select-String "Insufficient balance|stream error|exiting loop" | Select-Object -First 15
```

**处置**:
1. **切免费组**(首选 `opencode/deepseek-v4-flash-free`,免费时段限定)
2. 或切火山(`volcark/deepseek-v4-flash-ga-260731`)
3. **不要在 opencode-go 反复重试/换模型**——白费 token(本次 2026-08-17 B2-1 Flash→Pro 重派仍 Insufficient balance)

### 2. 免费模型静默异常退出 — 容易漏检

**症状**(2026-08-18 B2-2 实测):
```
step-finish reason="unknown"
tokens: { total: 126810, input: 14668, output: 5646 }  ← tokens 非 0,关键!
```

**关键特征**:与付费版断流不同,**模型生成了内容但 step 异常结束**(可能是 provider 端主动断开或限流)。无 ERROR 日志(只有 `INFO message="exiting loop"`)。

**排查**:
- `opencode db "SELECT data FROM part WHERE session_id='<sid>' ORDER BY time_updated DESC LIMIT 5"`
- 最后一条 part 的 JSON `reason="unknown"` + tokens 非 0 → 免费模型静默失败
- `opencode log` grep `exiting loop` 看对应 session 的 provider/model

**处置**:
- 轮换免费组(用下一个 `opencode/hy3-free` 等,**不重试刚挂的**)
- 重试 1-2 次发「继续」即可恢复,无需拆 session(单次失败是请求级断流)

### 3. volcark API key 失效或缺失

**症状**(2026-08-18 B2-2b 实测):
```
ERROR message="stream error" providerID=volcark modelID=deepseek-v4-flash-ga-260731
ERROR error="AI_APICallError: the API key or AK/SK in the request is missing or invalid"
```

**关键判别**:`API key format is incorrect` 或 `AK/SK missing` → key 真失效;`Cannot connect to API / socket closed` → 网络/provider 端问题。

**先实测 key 是否真的失效**(不要盲信 OpenCode 报错):
```js
// 用纯 node https 实测(不依赖 OpenCode)
const https = require('node:https')
const req = https.request({
  hostname: 'ark.cn-beijing.volces.com',
  path: '/api/coding/v3/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${key}`,
    'Content-Length': Buffer.byteLength(body),
  },
}, (res) => { let d=''; res.on('data', c=>d+=c); res.on('end', () => console.log(res.statusCode, d)) })
```

- HTTP 200 → key 有效,问题是 OpenCode server 进程缓存了**旧失败状态** → **kill OpenCode 重启**(实测 2026-08-18 B2-2b 解决)
- HTTP 401/403 → key 真失效 → 通知兄弟去 https://console.volcengine.com/ark 拿新 key,`setx ARK_CODING_API_KEY <新key>`,然后 kill OpenCode 重启

**OpenCode server 自动重启机制**:Hermes 拉的 server,kill 旧进程后会自动拉起新进程(实测),4098 端口重新可监听,旧 session DB 保留(可重新发「继续」)。

### 4. 三重资源同时挂(2026-08-18 B2-2b 实锤最坏情况)

`opencode-go` 余额不足 + 免费组静默失败 + volcark key 失效 → **没有任何可用 provider**。这种情况出现时:
1. stop 当前 OpenCode session(`opencode session delete`)
2. 桌面通知兄弟写明三重状态(`msg *` 或 notify.ps1)
3. **不自动重试**(重试只会烧 cacheRead 浪费 token)
4. 等兄弟恢复至少一个 provider 后继续

## Provider 配置位置

| Provider | 配置文件位置 | key 来源 |
|---------|------------|----------|
| `opencode-go` | `~/.config/opencode/opencode.json` → `provider.opencode-go.options.apiKey` | 硬编码 `"«redacted:sk-…»"`(已注入付费余额,余额不足自动报) |
| `opencode` 免费组 | 由 OpenCode 内置管理,无需手动配 | 无 key(OpenCode 服务器转发) |
| `volcark` | `~/.config/opencode/opencode.json` → `provider.volcark.options.apiKey` | `{env:ARK_CODING_API_KEY}` 占位符 → 读环境变量 |

**配置修改注意**:OpenCode 4098 server **不热加载** opencode.json → 改完必须 kill server 重启(启动时读一次配置)。重启前先查无活跃 session,或经兄弟确认。

## 临时诊断脚本模板(.ps1 + .mjs,2026-08-18 实测)

OpenCode 进程环境变量读取模板(避免 JS 模板字符串转义问题):
```powershell
# _tmp-oc-env.ps1
$key = [System.Diagnostics.Process]::GetProcessById(8012).StartInfo.EnvironmentVariables['ARK_CODING_API_KEY']
Write-Output ("len=" + $key.Length)
Write-Output ("value=" + $key)
```

```js
// 调用
execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '.workflow/_tmp-oc-env.ps1'], { encoding: 'utf8', windowsHide: true })
```

**为什么不用 node -e**:实测 `node -e "...[System.Diagnostics.Process]..."` 在 Hermes terminal 里被 `Invoke-Expression` 包装后,`[D]iagnostics` 等被当 JS 属性访问,后续所有 `Unexpected token` 错误刷屏。`.ps1` 文件路线零问题。

## 实测速记

- 2026-08-17:opencode-go 余额耗尽起(13:12 后所有 dispatch 报 Insufficient balance)
- 2026-08-18 06:27:flash-free 静默失败被识别(reason=unknown + tokens 非 0)
- 2026-08-18 08:06:volcark 报 AI_APICallError,实测 key 仍有效,杀 OpenCode 重启后恢复

(更多细节见 opencode-llm-failure-recovery 主 skill)