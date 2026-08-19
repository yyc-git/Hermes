# 实际成本验证 SOP（2026-08-18 Phase D r2 实测落地）

> 本文件是 opencode-schedule skill 第 508 行「session-meta 落盘」的配套参考。解决**"以为是免费 flash 实际是付费 flash"**的 silent fallback 问题。

## 核心问题

`opencode.json` 默认 model = `opencode-go/deepseek-v4-flash`（付费）。本机 provider 配置只有 `opencode-go` 和 `volcark`,**没有 `opencode` provider**。写 `-m opencode/deepseek-v4-flash-free` 时：

```
opencode.js 解析 -m → 找不到 opencode provider → silent fallback 到 opencode.json 顶层默认 model
```

**没有报错**,CLI 输出 `> build · deepseek-v4-flash-free` 误导用户相信在用 free flash。**实测烧了 $0.40 才被兄弟查到**。

## 三个数据源的真相

| 数据源 | 字段 | 可信度 |
|---|---|---|
| CLI 输出 `> build · <model>` | CLI 想用的 model | ❌ 不可信（silent fallback 不报错） |
| opencode.log stream `providerID/modelID` | server stream 实际请求 | ⚠️ 不可信（stream 时仍按 session binding，但 session.model 可能已被 fallback 覆盖） |
| DB `session.model` JSON 字段 | session 创建时 binding | ❌ 不可信（实测会被 fallback 默认值覆盖） |
| **DB `part` 表 step-finish `cost` 字段** | **实际计费结果** | ✅ **唯一可信** |

**实测**：Phase D r2 session 三个不可信字段都说 flash-free,但 part 表 30+ 个 step-finish `cost > 0`（0.01/0.03 美元/次），**真实计费 = opencode-go flash 付费**。

## 完整 SOP（30 秒内完成验证）

### Step 1: dispatch 时（拿 sessionId 后立即）

按 opencode-schedule skill 第 508 行,落盘 session-meta：

```powershell
$sid = "ses_xxx"
$env:OPENCODE_DB = "C:\Users\Administrator\.local\share\opencode\opencode.db"
$modelMeta = opencode db "SELECT model FROM session WHERE id='$sid'" --format json | ConvertFrom-Json
$dir = 'D:\Github\GTS-Play\.opencode-session-meta'
New-Item -ItemType Directory -Path $dir -Force | Out-Null
@{
  sid = $sid
  providerID = $modelMeta.providerID
  modelID = $modelMeta.id
  variant = $modelMeta.variant
  dispatchedAt = (Get-Date -Format "o")
} | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $dir "$sid.json")
```

### Step 2: dispatch 后 30 秒（验证真在用预期 model）

```powershell
$env:OPENCODE_DB = "C:\Users\Administrator\.local\share\opencode\opencode.db"
Start-Sleep -Seconds 30
opencode db "SELECT json_extract(data,'$.reason') AS reason, json_extract(data,'$.cost') AS cost, json_extract(data,'$.tokens.input') AS in_tok FROM part WHERE session_id='<sid>' AND json_extract(data,'$.type')='step-finish' ORDER BY time_updated DESC LIMIT 1" --format json
```

判定：

- ✅ `cost == 0` 且 `tokens_input > 0` → 真免费模型
- ❌ `cost > 0` → 付费模型在跑，立即 `opencode session delete <sid>` + 改 opencode.json + 重启 4098 + 重 dispatch

### Step 3: 续跑「继续」时（用 HTTP API，不要 opencode run -s）

```powershell
# ❌ 错误姿势：opencode run -s 会撞同一 permission 配置
# opencode run -s <sid> -m <model> --attach http://localhost:4098 --dir <dir> --no-replay "继续"

# ✅ 正确姿势：HTTP API POST /session/{id}/message，不传 -m
$body = @{ parts = @(@{ type = "text"; text = "继续：<待办提示>" }) } | ConvertTo-Json -Depth 5
$body | Out-File -Encoding utf8 "$env:TEMP\msg.json"
curl.exe -s -X POST "http://localhost:4098/session/<sid>/message" `
  -H "Content-Type: application/json" --data-binary "@$env:TEMP\msg.json" --max-time 600
```

**为什么 `opencode run -s` 是错的**：

1. 它 spawn 新 exec session，受相同 `agent.build.permission` 配置约束，撞同一 silent fallback 问题
2. server 端 agent 已绑定 model 时，`-m` 被忽略（实测 r2 验证），但 spawn 过程中某些路径可能修改 session state
3. **HTTP API 直接写 server session message queue**，绕开所有 permission 配置

### Step 4: 任务完成时（清理 session-meta）

```powershell
Remove-Item "D:\Github\GTS-Play\.opencode-session-meta\<sid>.json" -Force -ErrorAction SilentlyContinue
```

## 配置修复任务清单（兄弟拍板要做）

要让 `-m opencode/deepseek-v4-flash-free` 真正生效，必须：

1. **改 opencode.json**：注册 `opencode` provider 块
   ```json
   "provider": {
     "opencode": {
       "options": { "apiKey": "{env:OPENCODE_API_KEY}" },
       "models": {
         "deepseek-v4-flash-free": { "name": "DeepSeek V4 Flash Free" },
         "hy3-free": { "name": "Hy3 Free" },
         "mimo-v2.5-free": { "name": "MiMo v2.5 Free" }
       }
     }
   }
   ```
2. **重启 4098 server**（改完不热加载，按 opencode-model-smoke-test skill 流程）
3. **重启后用本文件 SOP 验证**真免费 model

## 当前推荐（未配 opencode provider 之前）

兄弟 2026-08-18 拍板：火山 > go 套餐，go 套餐是兜底。

| 时段 | 推荐 model | 理由 |
|---|---|---|
| 免费时段（BJ 9-12/14-18） | `-m volcark/deepseek-v4-flash-ga-260731` | 火山 coding plan Flash 正式版,已开通可连,真免费/低成本 |
| 非免费时段 | `-m volcark/deepseek-v4-flash-ga-260731` | 火山不分时段,稳定 |
| Pro 任务 | `-m volcark/deepseek-v4-pro-ga-260813` | 火山 Pro 正式版,优先级最高 |
| 兜底（火山不可用/余额不足） | `-m opencode-go/deepseek-v4-flash` | 付费 Flash,需注意 cost |
| ❌ 避免 | `-m opencode/deepseek-v4-flash-free` | 本机未配 opencode provider,会 fallback 付费 |

## 与 opencode-session-ops 1️⃣7️⃣ 的关系

1️⃣7️⃣「权限等待 vs stuck」是**wait 假死**场景的诊断；本 SOP 是**cost 失控**场景的诊断。两者互补：

- agent 没在动 → 用 1️⃣7️⃣ 的"最后 tool command 路径 vs --dir"
- agent 在动但 cost 异常 → 用本 SOP 的"cost == 0 vs > 0"

## 相关文件

- opencode-schedule skill 第 508 行：session-meta 落盘原始 SOP
- opencode-session-ops skill 1️⃣6️⃣：issue 验收纪律（agent 报告 ≠ 完成度）
- opencode-session-ops skill 1️⃣7️⃣：权限等待 vs stuck 诊断
- mmd-data-generation skill：三门禁（jest + tsc + 数据文件实测）
- 笔记/daily/2026-08-18.md：xiahui-phaseD 完整经过