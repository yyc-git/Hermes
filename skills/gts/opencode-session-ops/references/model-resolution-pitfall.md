# OpenCode `-m` 模型名解析陷阱（2026-08-18 实锤 $0.40 浪费教训）

> 本文件是 dispatch 必修知识。opencode-schedule 顶层 SKILL.md 受保护不能直接 patch,本文件作为 reference 收录核心教训。

## 致命坑：`-m opencode/*` 在没有 `opencode` provider 配置时静默 fallback 到默认付费模型

**症状**：dispatch 时写 `-m opencode/deepseek-v4-flash-free` 想用免费模型，但 `~/.config/opencode/opencode.json` 的 `provider` 里只配了 `opencode-go` 和 `volcark`，**没有 `opencode` 这个 provider**。OpenCode 找不到 `opencode/deepseek-v4-flash-free` → **silent fallback 到 opencode.json 顶层的默认 model 字段 = `opencode-go/deepseek-v4-flash`（付费 flash）**。Session 实际跑的是付费 flash，不是免费的。

**真信号**：xiahui-data-fix-phaseD session 烧了 $0.40（最终 cost 0.40,tokens_in=1.3M, tokens_out=166K），兄弟质问「怎么用的是 flash 模型？没用在用的 flash free？」。**根因是 `-m opencode/...` 找不到 provider 后回fall 到了默认付费模型，整个 session 没人察觉**。

## 根因机制

`-m` 在 CLI 层只解析 `<provider>/<model>` 字符串，但 provider 必须**在 opencode.json `provider.<name>` 块里显式注册**（含 apiKey/options/models）。否则 OpenCode 静默 fallback 到 default model。**没有任何报错，完全不可见**。

`~/.config/opencode/opencode.json` 当前（本机 2026-08-18 实测）：
```json
{
  "model": "opencode-go/deepseek-v4-flash",  // ← 默认 model
  "provider": {
    "opencode-go": { "options": { "apiKey": "..." }, "models": {...} },
    "volcark": { "options": {...}, "models": {...} }
    // ⚠️ 没有 "opencode" provider 块
  }
}
```

写 `-m opencode/deepseek-v4-flash-free` → 找不到 `opencode` provider → fallback 到默认 `opencode-go/deepseek-v4-flash`。

## 修复与防御

### dispatch 前 5 秒：验证 provider 已注册

```powershell
$cfg = Get-Content "$env:USERPROFILE\.config\opencode\opencode.json" -Raw | ConvertFrom-Json
if (-not ($cfg.provider.PSObject.Properties.Name -contains 'opencode')) {
    throw "❌ opencode provider 未注册!用 -m opencode/* 会 fallback 到默认 model"
}
```

### dispatch 后 30 秒：DB 查 session.model 字段

```powershell
$env:OPENCODE_DB = "C:\Users\Administrator\.local\share\opencode\opencode.db"
opencode db "SELECT id, model, cost FROM session WHERE id='<sid>'" --format json
```

- ✅ `model: {"id":"deepseek-v4-flash-free","providerID":"opencode"}` = 真免费
- ❌ `model: {"id":"deepseek-v4-flash","providerID":"opencode-go"}` = 付费 fallback 错了

### cost 实时监控：30s 后 cost > 0 = 付费模型

```powershell
opencode db "SELECT id, cost, tokens_input, tokens_output FROM session WHERE id='<sid>'" --format json
```

- 30s 后 `cost > 0` → 付费（dispatch 完立刻会先有 1 个 step 调用，必然 cost > 0）
- 30s 后 `cost == 0` 且 `tokens_input > 0` → 真免费

## 想用真免费模型？必须先配

`opencode.json` 当前没注册 `opencode` provider。要用真免费模型：

```json
"provider": {
  "opencode": {
    "options": { "apiKey": "{env:OPENCODE_API_KEY}" },
    "models": {
      "deepseek-v4-flash-free": { "name": "DeepSeek V4 Flash Free" },
      "hy3-free": { "name": "Hy3 Free" },
      "mimo-v2.5-free": { "name": "MiMo v2.5 Free" }
      // 等其他 free 模型按 opencode provider 实际支持的填
    }
  }
}
```

⚠️ **改完必须重启 4098 server** 才生效（参考 opencode-model-smoke-test skill）。在重启前，任何 `-m opencode/*` 都会 fallback 到默认付费。

## 当前可用免费模型状态

实测本机 2026-08-18：
- `opencode` provider 未注册 → **free 模型不可用**
- `opencode-go` 已注册（付费 Flash/Pro/Kimi/MiniMax/Qwen）→ **任何 `-m opencode/*` 都 fallback 到这**
- `volcark` 已注册（火山 coding plan，已开通）→ `-m volcark/deepseek-v4-flash-ga-260731` 真免费时段

**实际可用的免费/低成本组合**：
- 免费时段（BJ 9-12/14-18）：`-m volcark/deepseek-v4-flash-ga-260731`（火山 Flash 正式版）= 真免费时段
- 非免费时段：`-m volcark/deepseek-v4-flash-ga-260731` 同样可用（火山不分时段）
- Pro 任务：`-m volcark/deepseek-v4-pro-ga-260813`（火山 Pro 正式版，兄弟 8/18 拍板优先）
- **兜底**：`-m opencode-go/deepseek-v4-flash`（付费 Flash，仅火山不可用/余额不足时）

**`-m opencode/deepseek-v4-flash-free` 等暂不能用**——除非配 provider + 重启 server。

## 永久固化教训

- 🔴 dispatch 写 `-m <provider>/<model>` 前**先验证 provider 已注册**（`provider.PSObject.Properties.Name` 检查）
- 🔴 dispatch 后**立即 DB 查 session.model 字段**，不是只看 CLI 输出（CLI 不报错就以为成功 = 大错）
- 🔴 不要假设 `-m` 报错 = 它没生效——silent fallback 不报错
- 🔴 改 opencode.json 后必须重启 4098（兄弟多次纠正这条）
- 🔴 想用免费模型：**先配 opencode provider**（apiKey 从 opencode-go 或 volcark 借）+ 重启 server
- 🔴 兄弟原话（2026-08-18）：「怎么用的是 flash 模型？没用在用的 flash free？」——这是 silent fallback 的真信号，必须能用 DB 一查就知道

## 🔴 Phase D r2 实测更新（2026-08-18 同日）：session.model DB 字段也不可信

**新证据**（Phase D r2，`ses_fecbd53b2ffeJVjE5yw2HcTx4c`）：
- dispatch 命令 `-m opencode/deepseek-v4-flash-free`
- `opencode.log` stream 记录 `providerID=opencode modelID=deepseek-v4-flash-free`（看似免费）
- **DB `session.model` 字段 = `{"id":"deepseek-v4-flash","providerID":"opencode-go","variant":"default"}`**（付费）
- **part 表 step-finish `cost > 0` 多次（0.01/0.03 美元/次）**——真实付费调用
- 兄弟查 opencode-go 使用量确认：实际计费来源是付费 flash

**修正诊断 SOP**（替代「DB 查 session.model 字段」）：

| 数据源 | 显示 model | 是否可信 |
|---|---|---|
| CLI 输出 `> build · <model>` | 显示的是 CLI 想用的 model | ❌ 不可信（可能 silent fallback） |
| `opencode.log` stream `providerID/modelID` | server stream 实际请求字段 | ⚠️ 部分可信（session 创建时 model 可能被 binding，但 stream 请求时仍按 session.model） |
| **DB `session.model` JSON 字段** | session 创建时 binding | ❌ 不可信（实测会被 fallback 默认值覆盖） |
| **DB `part` 表 step-finish `cost` 字段** | 实际计费结果 | ✅ **唯一可信**：free flash 单步 `cost = 0`；paid flash 单步 `cost = 0.01 ~ 0.03` 美元 |

**⚠️ 真正的 dispatch 验证流程（修正版，30 秒内可完成）**：

```powershell
$env:OPENCODE_DB = "C:\Users\Administrator\.local\share\opencode\opencode.db"
# 1. 跑 30 秒，让 session 至少完成 1 个 step
Start-Sleep -Seconds 30

# 2. 查 part 表最后一个 step-finish 的 cost —— 唯一可信信号
opencode db "SELECT json_extract(data,'$.reason') AS reason, json_extract(data,'$.cost') AS cost, json_extract(data,'$.tokens.input') AS in_tok FROM part WHERE session_id='<sid>' AND json_extract(data,'$.type')='step-finish' ORDER BY time_updated DESC LIMIT 1" --format json

# ✅ cost == 0 → 免费模型在跑
# ❌ cost > 0  → 付费模型在跑（即使 CLI/log 显示免费）→ 立刻 stop + 重 dispatch
```

**如何避免重复踩坑（兄弟拍板的标准流程）**：

兄弟提出的方案：**dispatch 后把 `(providerID, modelID, variant)` 写到固定路径的临时文件**，续跑时直接读出并遵循。落实：

```powershell
# dispatch 成功后（拿 sessionId 后立即）
$sid = "<sessionId>"
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

# 续跑「继续」时（curl POST /session/{id}/message 时），不传 -m，让 server 用 session bound model
# 避免再因 -m 参数被 silent fallback 改变 model

# 任务结束后清理
Remove-Item (Join-Path $dir "$sid.json") -Force -ErrorAction SilentlyContinue
```

**为什么不靠 `-m` 续跑**：`opencode run -s <sid> -m <model> ...` 这条命令在 append 路径下 server 会忽略 `-m`，按 session 已绑定的 model 处理（实测 r2 验证）。**唯一可靠的续跑路径**是 `POST /session/{id}/message`（HTTP API），不传 `-m`，让 server 直接把消息送进 server session 的 message queue。

## 配置修复任务清单（待执行）

兄弟拍板要改的，但用户先选「C」后才执行：
1. 在 `~/.config/opencode/opencode.json` 注册 `opencode` provider（含 apiKey/models）—— 需要 opencode 官方 free 模型 endpoint，可能需要找文档
2. 或者把默认 model 改成 volcark flash（实测可连，免费时段也可用）
3. 改完必须重启 4098 server（不热加载）
4. 新 session dispatch 后用 cost 字段验证真在用预期 model（不要信 CLI/log）

**当前推荐**：在配置修复之前，**所有 dispatch 默认用 `volcark/deepseek-v4-flash-ga-260731`**（已配可连,真免费/低成本）而不是 `opencode/deepseek-v4-flash-free`（会 fallback 付费）。兄弟 2026-08-18 拍板：火山 > go 套餐。

## 关联

- opencode-schedule SKILL.md 受保护无法直接 patch，但本 reference 提供核心教训
- 完整崩盘经过：`笔记/daily/2026-08-18.md` xiahui-phaseD 部分 + daily log 全过程
- opencode-session-ops §1️⃣6️⃣「issue 验收纪律」—— 同样的反例:agent 报告 ≠ issue 完成度
- 参考:opencode-model-smoke-test skill — 新 provider 上线时跑连通性验证