# OpenCode 4098 server 重启流程（改配置后必读）

> 触发场景（任一改动后均需重启 4098，server 不热加载任何配置）：
> - 修改 `C:\Users\Administrator\.config\opencode\opencode.json`（新增 provider / 改 baseURL / 加模型）→ 报 `ProviderModelNotFoundError: Model not found: <provider>/<model>`
> - 新建/修改/删除 `D:\Github\GTS-Play\.opencode\skills\<name>\SKILL.md` → **无报错**，只表现为 agent session 读不到新 skill（更难排查，必须主动验证 `/api/skill`）
> - 改 `agent.build.permission`（如加 `"edit": "allow"`）→ 探针 brief 验证才能确认生效
>
> 根因（2026-08-18 实测）：**4098 server 启动时加载全部配置（provider / skill 扫描 / permission），运行中不热加载**。`opencode models`（CLI 每次读文件）能列出新模型，但 attach 4098 走的是 server 内存里的旧配置 / 旧 skill 列表 / 旧 permission。
> 根因（2026-08-18 实测）：**4098 server 启动时加载 provider 配置，运行中不热加载**。`opencode models`（CLI 每次读文件）能列出新模型，但 attach 4098 走的是 server 内存里的旧配置。
> 处置：必须重启 4098 server。重启会中断**所有**活跃 session——重启前先查活跃 session，有活任务先等兄弟确认。

## 前提检查（缺一不可）

```powershell
# 1. 确认当前有没有活跃 session（重启会全部中断）
$now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
opencode db "SELECT id, title, time_updated FROM session WHERE time_updated > $($now - 600000) ORDER BY time_updated DESC LIMIT 10" --format json 2>$null
# 有结果 = 有活跃 session → 汇报兄弟等确认再重启；空 = 可以重启

# 2. 确认 4098 端口占用者（4098 是 attach Web UI，server 由 opencode serve 提供）
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'opencode.*serve|opencode.exe' } | Select-Object ProcessId, Name, @{n='cmd';e={$_.CommandLine.Substring(0,[Math]::Min(100,$_.CommandLine.Length))}}
```

## 完整重启步骤（2026-08-18 实操验证）

```powershell
# Step 1 — 杀旧 server（父包装 powershell + opencode.exe serve 两个都要杀）
Stop-Process -Id <opencode.exe serve 的 PID> -Force
Stop-Process -Id <父 powershell 的 PID> -Force
Start-Sleep -Seconds 2
# 确认没有残留 serve 进程（残留可能是刚 fork 的，再等 1 秒复查，通常自动消失）

# Step 2 — 确认端口已释放
Get-NetTCPConnection -LocalPort 4098 -ErrorAction SilentlyContinue   # 空 = 已释放
# 注意：Get-NetTCPConnection 找不到连接时命令本身 exit 1，这是正常的，看输出而非 exit code

# Step 3 — 后台重启（🔴 必须 terminal(background=true)，server 是长驻进程永不退出）
# 命令：opencode serve --port 4098 --hostname 127.0.0.1 --print-logs

# Step 4 — 就绪验证（等 3-5 秒后）
try { $r = Invoke-WebRequest -Uri "http://localhost:4098" -TimeoutSec 5 -UseBasicParsing; "4098 在线 (HTTP $($r.StatusCode))" } catch { "未就绪: $($_.Exception.Message)" }

# Step 5 — attach 实测新 provider（关键！HTTP 200 只证明 server 起来了，provider 要真实 dispatch 才验证）
# 写一个最小纯问答 brief（禁止改文件/跑命令，只让模型报自己名字）
# opencode run $brief -m <新provider>/<模型> --attach http://localhost:4098 --title "<验证任务>" --no-replay --auto --dir D:\Github\GTS-Play
# 返回模型名 = ✅ provider 加载成功；再报 ProviderModelNotFoundError = 配置没生效，检查 opencode.json 语法/路径
```

## Skill 改动后的端到端验证（2026-08-19 新增，与 provider 改动重启并列）

> 场景：在 `D:\Github\GTS-Play\.opencode\skills\<name>\SKILL.md` 新建 / 修改 / 删除任何 skill 后，**不会有任何报错**，只表现为「agent session 不知道新 skill」→ brief 里强约束等于白写 → 必须主动验证。

**Step 1-4 同上完整重启步骤**（杀进程 → 端口检查 → 后台拉起 → HTTP 200 探活）

**Step 5（skill 改动特化）— `/api/skill` 端到端验证：**

```powershell
try {
  $r = Invoke-WebRequest "http://127.0.0.1:4098/api/skill" -UseBasicParsing -TimeoutSec 5
  $json = $r.Content | ConvertFrom-Json
  # 🔴 关键：response 结构是 {location:{...}, data:[{name,...}]}，外层是对象不是数组！
  # 错误写法：$json | Where-Object { $_.name -eq "..." } → 只看到 location 一项，误判"1 个 skill"
  # 正确写法：
  $hit = $json.data | Where-Object { $_.name -eq "<新 skill 名>" }
  if ($hit) {
    Write-Host "✅ skill 已加载: name=$($hit.name)"
    Write-Host "  description: $($hit.description)"
    Write-Host "  location: $($hit.location)"
    Write-Host "  content_len: $($hit.content.Length) chars"
  } else {
    Write-Host "❌ 未找到 skill <新 skill 名>"
  }
} catch {
  Write-Host "❌ /api/skill 不通: $($_.Exception.Message)"
}
```

**判据：**
- ✅ `hit` 非空 + `content.Length > 100` → 加载成功，可以 dispatch
- ❌ `hit` 为空 → 重启没生效（杀进程没杀干净 / server 启动失败），复查 Step 1-4
- ❌ `/api/skill` 抛错 → 4098 还没完全就绪，再等几秒重试

**反面教训（2026-08-19 实测）：** 仅 HTTP 200 + 没查 `/api/skill` 直接 dispatch → agent session 启动后**默默**读不到新 skill → brief 强约束的"必遵守 8 条铁律"被无视 → agent 继续引依赖写抽象层 → 等到产线/评审时才发现规则没生效。

**与 provider 改动重启的核心区别：**

| 维度 | provider 改动 | skill 改动 |
|------|---------------|-----------|
| 触发报错 | ✅ `ProviderModelNotFoundError` 明显 | ❌ 无报错，沉默失败 |
| 验证手段 | attach 实测 dispatch 跑通 | `/api/skill` 直接查加载列表 |
| 误判风险 | 低（报错明显） | 高（必须主动验证，否则会被掩盖） |

## 独立端口验证技巧（不想重启时的连通性预检）

改 opencode.json 后、决定是否重启前，可以先**不 attach 4098**、用独立端口验证新 provider 的模型真实连通：

```powershell
opencode run $brief -m volcark/deepseek-v4-flash-ga-260731 --title "conn-test" --no-replay --auto --dir D:\Github\GTS-Play --port <独立端口如 4199>
```

- `--port` 指定独立本地 server，**不 attach 4098**，不影响 4098 上正在跑的活跃 session
- CLI 每次读最新 opencode.json → 能测出 provider 配置本身是否正确（key、baseURL、模型 id）
- ⚠️ 局限：这只证明「CLI 能连」，**不代表 4098 server 已加载**——attach 4098 仍可能报 ProviderModelNotFoundError 直到重启
- 判定：独立端口连通 + 无活跃 session → 直接重启 4098；独立端口连通 + 有活跃 session → 先汇报兄弟

## 权限配置（agent.build.permission）生效验证（2026-08-18 新增）

> 场景：被权限卡住（agent 想写项目外 temp/桌面路径弹确认）→ 根治是 opencode.json 加
> `"agent": { "build": { "permission": { "edit": "allow", "bash": "allow" } } }`（--auto 只在 CLI 存活时生效，
> CLI 退出后 server agent 按此配置走）。改完同样要重启 4098 才生效。重启后跑下面的探针确认：

```powershell
# 探针 brief（.opencode-brief-permverify.md，只做 3 件事）：
# ① bash 跑 Write-Output "perm-test-ok" | Out-File -FilePath "D:\Github\GTS-Play\.perm-test.txt" -Encoding UTF8
# ② 写文件工具建 D:\Github\GTS-Play\.perm-test2.txt，内容 hello from opencode
# ③ 中文汇报模型名 + "权限验证通过，edit/bash 均已放行"（禁止改其他文件）
opencode run $brief -m volcark/deepseek-v4-flash-ga-260731 --attach http://localhost:4098 --title "perm-config-verify" --no-replay --auto --dir D:\Github\GTS-Play
# 成功判据：两个 marker 文件生成且内容正确 + ~20s 内 step-finish stop 没被卡；失败=卡 permission 等待（Web UI 弹授权框）
# 顺带验证：provider 加载成功 + 中文输出生效。清理：git ls-files 确认未跟踪后删 3 个临时文件
```

## 相关坑

- 🔴 重启 4098 会中断所有活跃 session（2026-08-18 实测：xiahui-data-fix-b2-1c 的 jest 被重启打断）——必须提前查活跃 session 并等兄弟确认
- 🔴 **判活跃 session 别用 /api/session 手写 running 标志**（2026-08-18 实测：`-not $_.time.updated -eq $null` 表达式写错 → 全返回 False，误判「无活跃」而重启，实际 session 还在跑被中断）——一律用上面前提检查的 DB 查询 `time_updated > now-600000`，有结果=活跃
- 🔴 4098 从 Hermes 后台进程拉起的话，Hermes 重启会导致 4098 跟着挂——如需独立常驻，要另配守护/开机自启
- provider 注册格式（opencode.json）：`"provider": { "<名>": { "options": { "baseURL": "...", "apiKey": "{env:XXX_API_KEY}" }, "models": { "<模型id>": { "name": "..." } } } }`，apiKey 用 `{env:VAR}` 引用环境变量避免硬编码
- 改 opencode.json 前先 `Copy-Item` 备份（如 `.bak-<日期>`）
