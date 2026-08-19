---
name: "opencode-hermes-dispatch-pitfalls"
description: "OpenCode 调度实战坑（Hermes / PowerShell 环境, 2026-08-19 兄弟拍板沉淀）。覆盖恢复中断会话必须先清旧session、4 种 PowerShell 调度失败模式、opencode.json 默认 model 陷阱、DB 锁竞争时 sqlite3 直查。opencode-schedule 主 skill 不可 patch（人工创建, agent-created 不在白名单），本 skill 沉淀实战发现。"
---

# opencode-hermes-dispatch-pitfalls — Hermes 环境下 OpenCode 调度实战坑

> ⚠️ **本 skill 不是 opencode-schedule 的替代品**。opencode-schedule 是协议本尊（人工创建, agent 不能 patch）。本 skill 是 Hermes / PowerShell 7 环境下的实战补丁，沉淀兄弟在 2026-08-19 现场打脸后沉淀的具体问题。

> **兄弟原话（2026-08-19）**：「你怎么不会调度了？没有调用调度 opencode skill 吗？付费版只是最后的兜底啊」 → 这两句话对应本 skill 两个核心教训。

---

## 🔴 恢复中断会话必须先清旧 session（2026-08-19 实锤教训）

**场景**：会话因 429/rate-limit/超时中断后恢复，旧 OpenCode session 可能仍在 server 端运行。

**错误做法**：恢复后直接写 brief → dispatch → 两个同任务 session 并行跑 → 双 agent 抢文件冲突。兄弟质问「为什么有两个Xiahui的会话在同时跑」。

**正确做法**：
1. 恢复后第一步查 DB：`C:\sqlite\sqlite3.exe "C:\Users\Administrator\.local\share\opencode\opencode.db" "SELECT id, title, time_updated FROM session WHERE title LIKE '%<任务关键词>%'"` 
2. 有活跃的 → 走 **gts-opencode-stop** skill 流程（列 session → 确认 → delete → 三重验证 15s 复查 → 全 title 扫描零残留）
3. 确认零残留后才 dispatch 新的

**铁律**：恢复中断会话 = 先清旧再开新，和全新 start 一样过 Step 0 检查。

> 检索锚点：恢复中断、清旧session、双session冲突、rate-limit恢复

---

## 🔴 兄弟硬偏好（违反即浪费 token, 兄弟会质问）

1. **免费时段（北京 9-12 / 14-18）必须用免费组首选 `opencode/deepseek-v4-flash-free`**，不是火山 Pro，不是付费兜底版。
2. **付费版（`opencode-go/*`）仅在火山/免费组都挂时用**。opencode.json 默认 model = `opencode-go/deepseek-v4-flash`（付费兜底），**任何 dispatch 不显式 `-m` 都会 fallback 到它**。
3. 兄弟每次问「怎么样了」必须 30s 内回答 DB 状态或产物清单，不能让兄弟等。

---

## 🔴 4 种 PowerShell 调度 OpenCode 失败模式（2026-08-19 实锤教训）

兄弟 skill 默认 OpenClaw bash 写法，迁到 Hermes terminal (PowerShell 7) 后 4 种常见踩坑：

| # | 失败模式 | 表现 | 解法 |
|---|---------|------|------|
| 1 | `Start-Process -ArgumentList @('run', $brief, ...)` | PowerShell 把 `$brief`(多行字符串)传给 yargs → 看到 `--help` 输出 | **不用 Start-Process**, 用 `node child_process.spawn` |
| 2 | `cmd /c opencode.exe run "$brief" ...` | cmd.exe 不支持多行字符串 → 整个 `$brief` 被截断 → CLI fallback 到 server 默认 model (opencode-go/deepseek-v4-flash 付费) | **不用 cmd.exe**, 用 `node` |
| 3 | `Get-Content ... \| opencode run ...` (stdin pipe) | Windows pipe 在 background 下冷启动竞态, CLI 收到空 brief, 然后**挂起 120s+ 等 agent 处理** | **不用 stdin pipe**, 用 `$brief` 变量或 `node` |
| 4 | `opencode run -f <brief.md> ...` | CLI 在 attach 模式下静默退出 (exit 0) 但不创建 session, 无任何报错 | `-f` 在 attach 模式不可靠, 改用 `$brief` 变量或 `node` |

**✅ 唯一稳的方式（2026-08-19 实测）: `node` child_process.spawn 调用**

```javascript
// .tmp-dispatch.cjs — 写到工作目录（不要写系统 temp）
const { spawn } = require('child_process');
const fs = require('fs');
const brief = fs.readFileSync('.opencode-brief-<task>.md', 'utf8');
const oc = 'C:\\Users\\Administrator\\AppData\\Roaming\\npm\\node_modules\\opencode-ai\\bin\\opencode.exe';
const args = ['run', brief, '-m', '<model>', '--attach', 'http://localhost:4098', '--title', '<task>', '--no-replay', '--auto', '--dir', 'D:\\Github\\GTS-Play'];
const child = spawn(oc, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
child.stdout.on('data', d => process.stdout.write(d));
child.stderr.on('data', d => process.stderr.write(d));
child.on('exit', code => process.exit(code || 0));
```

**Hermes terminal 用法**:
```powershell
terminal(background=true, timeout=0) node .tmp-dispatch.cjs 2>&1 | Out-File "$env:TEMP\log.txt"
```

**根因总结**: PowerShell 处理多行字符串时 (Start-Process/cmd/pipeline) 会拆参数、截断、丢失换行或转义错。`node child_process.spawn` 把参数当 JS 数组直接传给 OS API, 完全绕开 shell 转义。

---

## 🔴 opencode.json 默认 model 陷阱（2026-08-19 实锤）

`~/.config/opencode/opencode.json` 的 `"model"` 字段 = `opencode-go/deepseek-v4-flash`（付费兜底版）。**任何 dispatch 命令没显式 `-m` flag 都会 fallback 到这个 server 默认 model**，不是兄弟硬偏好的免费 flash-free。

**违规典型案例**（2026-08-19 实锤）：第一次 dispatch 用 `node` + server 创建 session，session part 表显示实际用的 model = `opencode-go/deepseek-v4-flash`（付费版，违反兄弟硬偏好）。

**防御措施**：

1. **dispatch 命令自查 checklist**（opencode-schedule 已有）：
   - 命令里**必须**有 `-m opencode/deepseek-v4-flash-free` 或 volcark/.../pro
   - **免费时段首选 flash-free**（除非用 Pro 重活）
2. **dispatch 后立即查 DB part 表确认实际 model**:
   ```powershell
   C:\sqlite\sqlite3.exe C:/Users/Administrator/.local/share/opencode/opencode.db "SELECT substr(data,1,300) FROM message WHERE session_id='<id>' ORDER BY time_updated DESC LIMIT 1"
   # 输出 data 里含 \"model\":{\"providerID\":\"<provider>\",\"modelID\":\"<model>\"} → 确认实际用的模型
   ```
3. **如果发现用了错误的 model (付费版)**：
   - 立即走 `gts-opencode-stop` 停掉
   - 用对的 model 重 dispatch
   - 不要心存侥幸「跑完了就行」——**兄弟查账单实锤**, 会被质问

---

## 🔴 DB 锁竞争时用 sqlite3 直查（2026-08-19 实锤）

`opencode db` CLI 在某些时候报 `FileSystem.open ...opencode.log` 错误（log 文件被 server 进程持锁），导致无法查 session/part 表。

**解法**：用全局 sqlite3 (C:\sqlite\sqlite3.exe) 直查 DB, 完全绕开 CLI 的 log 写入：

```powershell
C:\sqlite\sqlite3.exe C:/Users/Administrator/.local/share/opencode/opencode.db "SELECT id, time_updated FROM session WHERE id='<id>'"
C:\sqlite\sqlite3.exe C:/Users/Administrator/.local/share/opencode/opencode.db "SELECT substr(data,1,400) FROM part WHERE session_id='<id>' ORDER BY time_updated DESC LIMIT 1"
```

**注意细节**：
- **part 表无 type 列**（MEMORY 已知），用 `data LIKE '%xxx%'` 过滤
- **PowerShell 单引号字符串包裹 SQL 避免双引号转义**（双引号会被 PS 吃掉）；内层 SQL 单引号用 `''` 转义
- sqlite3 输出的是单行 pipe-delimited，直接 `Out-String` 即可

---

## 🔴 `FileSystem.open ...opencode.log` 也会让 dispatch 失败（2026-08-19 实锤：杀 server 进程 + 重启 SOP）

`opencode run` CLI dispatch 报 `Error: Unexpected error / Unknown: FileSystem.open (C:\Users\Administrator\.local\share\opencode\log\opencode.log)`，**但 4098 Web UI HTTP 200 健康** —— 这不是 server 死了，是**长期运行的 server 进程（`opencode serve`）独占 opencode.log 文件句柄**（log 可涨到 30MB+），新 CLI 客户端写日志时被 OS 拒。**重试 N 次都报同样错，换独立端口也一样**（锁是 server 全局共享的）。

**处置 SOP（兄弟拍板「a」后的实测流程）**：
```powershell
# 1. 确认 server 进程 + 启动命令
Get-CimInstance Win32_Process -Filter "ProcessId = <pid>" | Select-Object CommandLine
#    → 确认是 "opencode.exe serve --print-logs"

# 2. 杀 server（释放 log 锁）——⚠️ 先确认无活跃 session 或已 done 的 session
Stop-Process -Id <pid> -Force
Start-Sleep -Seconds 3

# 3. 重启 server（相同启动命令）
Start-Process -FilePath "C:\Users\Administrator\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe" `
  -ArgumentList "serve","--print-logs" -WorkingDirectory "C:\Users\Administrator" -WindowStyle Hidden
Start-Sleep -Seconds 8

# 4. 验证恢复
Invoke-WebRequest -Uri "http://localhost:4098/api/session" -TimeoutSec 8 -UseBasicParsing   # → 200
```

**⚠️ 重启后 dispatch 注意**：
- server 刚重启时 CLI 首次 dispatch 可能挂起 120s+（初始化中）→ **用 `background=true` 派，不要前台等**
- dispatch 后照常查 DB 拿 sessionId（重启后约 30-60s 才建出 session，`sleep 15` 后再查）
- 杀 server 会中断所有活跃 session —— **先确认无活跃 session**（或只余已 step-finish stop 的 session）再杀

---

## 🔴 免费模型额度用完（`Free usage exceeded`）是硬信号，立即 dead + 切下一个（2026-08-19 兄弟指出）

**症状**：免费模型 dispatch 后 session 卡死无产出（只回显 brief，`time_updated` 停），Web UI / CLI 报 `Free usage exceeded, subscribe to Go`。

**兄弟原话（2026-08-19）**：「它免费额度用完了，报：Free usage exceeded, subscribe to Go 你应该切换下一个免费模型了啊。更新调度skill：处理这种情况」

**正确处置（不等 3 次继续）**：
```powershell
# 1. 落盘 dead → current 自动前进到组内下一个（flash-free → hy3-free）
node scripts/opencode-free-model-state.mjs dead opencode/deepseek-v4-flash-free

# 2. 拿 current（确认下一个）
node scripts/opencode-free-model-state.mjs get
#    → {"current":"opencode/hy3-free", ...}

# 3. 删掉卡死的旧 session（它绑定的模型额度没了，继续跑没意义）
opencode session delete <卡死sessionId>

# 4. 用新模型重 dispatch 同一 brief
opencode run ... -m opencode/hy3-free ...
```

**为什么不等 3 次继续**：`Free usage exceeded` 是**持久性额度耗尽**（当天没了），继续发「继续」只会重复报错烧时间。3 次继续重试**仅适用于瞬时故障**（rate limit/429/401/5xx/静默 unknown）。额度用完 = 直接 dead + 切下一个。

---

## 🔴 Pro 审核 agent 跨仓读文件 permission auto-reject 空转（2026-08-19 code-review 实锤）

**症状**：Pro 审核 agent 尝试读 workdir 外路径（如 `D:/Github/PMXReduceFace/`、`D:/Github/GTS-Play/笔记/`）→ 被 auto-reject → agent 不回退 → **53 分钟空转**。session 看似活（最后 part 时间近），实际卡死。

**预防（写进 brief 的 3 条）**：
1. **显式列禁外部路径**：「禁止读 `D:/Github/PMXReduceFace/`、`D:/Github/GTS-Play/笔记/`，所有信息在 brief 里」
2. **给 fallback 指令**：「如果权限被拒，改用 brief 摘要 + 已读 commit 信息继续，不要重试被拒操作」
3. **主动声明够用**：「已读 commit 信息足够了，不要为补 detail 再读 git」

**检测（派 Pro 后每 20 分钟主动查，不等 wait 通知）**：
```powershell
C:\sqlite\sqlite3.exe C:/Users/Administrator/.local/share/opencode/opencode.db `
  "SELECT substr(data,1,300) FROM part WHERE session_id='<sid>' ORDER BY time_updated DESC LIMIT 5"
# 看到连续 2+ 条 tool status=error + "The user rejected permission..." = 硬卡死
# → gts-opencode-stop 杀掉 → 补全 brief 摘要重新派
```

**兄弟原话（2026-08-19 质问）**：「为什么这么久等没检测到？如何避免」—— 派 Pro 后**必须主动轮询**，不能等 wait 脚本通知（wait 的 stableMs 判定被 perm-deny 后仍收到 part 记录而失效）。

---

## 🔴 自定义 Provider 添加到 opencode.json 全流程（2026-08-19 xiaomi-token-plan 实测）

> 场景：Hermes config.yaml 已有 provider（如 `xiaomi-token-plan-cn`），需要让 OpenCode 也能用。

### 前置信息收集

```powershell
# 1. 从 Hermes config.yaml 获取 API 信息
Select-String -Path "$env:HERMES_HOME\config.yaml" -Pattern "<keyword>" -Context 0,6
# 需要：api (baseURL)、key_env (环境变量名)、default_model

# 2. 从 models_dev_cache.json 获取模型清单（确认模型 ID + reasoning 能力）
$mc = Get-Content "$env:HERMES_HOME\models_dev_cache.json" -Raw | ConvertFrom-Json -AsHashtable
$mc['<provider-key>']['models'].GetEnumerator() | ForEach-Object {
  Write-Host "$($_.Key) - $($_.Value['name']) (reasoning=$($_.Value['reasoning']))"
}
```

### 写入 opencode.json

配置路径：`$env:USERPROFILE\.config\opencode\opencode.json`

```json
{
  "provider": {
    "<provider-name>": {
      "options": {
        "baseURL": "<api-url>/v1",
        "apiKey": "{env:<KEY_ENV_VAR>}"
      },
      "models": {
        "<model-id>": {
          "name": "<Display Name>",
          "options": {
            "thinking": { "type": "enabled" }
          }
        }
      }
    }
  }
}
```

**要点：**
- provider name **不含区域后缀**：Hermes 用 `xiaomi-token-plan-cn`，OpenCode 用 `xiaomi-token-plan`
- baseURL **只到 `/v1`**，不带 `/chat/completions`
- apiKey 用 `{env:VAR}` 语法（与 volcark 一致），不硬编码
- **reasoning 模型必须加** `"thinking": {"type": "enabled"}`，否则推理不生效（volcark 同理，2026-08-18 实测）
- 改完后 **4098 必须重启**（不热加载 provider 配置，见 opencode-model-smoke-test `references/opencode-server-restart.md`）

### 验证三步

```powershell
# Step 1: API 直接调用（排除网络/key 问题）
$key = $env:<KEY_ENV_VAR>
$body = @{model="<model-id>"; messages=@(@{role="user"; content="hi"}); max_tokens=50} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri "<baseURL>/chat/completions" -Method Post -Headers @{Authorization="Bearer $key"; "Content-Type"="application/json"} -Body $body -TimeoutSec 30

# Step 2: opencode models 列表确认（CLI 每次读配置文件，不依赖 server 缓存）
cmd /c "opencode.exe models" | Select-String "<provider-name>/<model-id>"

# Step 3: dispatch 冒烟测试（🔴 必须用 --attach 模式，见下方坑）
cmd /c "opencode.exe run "hi" -m <provider-name>/<model-id> --attach http://localhost:4098 --title smoke-<name> --no-replay --auto --dir D:\Github\GTS-Play"
# 成功标志：输出第一行 "> build · <model-id>" 显示目标模型名
```

---

## 🔴 独立 `--port` 模式可能 fallback 到默认模型（2026-08-19 xiaomi-token-plan 实锤）

**现象**：
- `opencode run ... -m xiaomi-token-plan/mimo-v2.5-pro --port 4099`（独立 server）→ 输出 `> build · deepseek-v4-flash`（**fallback 到默认**）
- `opencode run ... -m xiaomi-token-plan/mimo-v2.5-pro --attach http://localhost:4098`（attach 模式）→ 输出 `> build · mimo-v2.5-pro`（**正确**）

**根因推测**：独立 `--port` 模式启动新 server 进程，配置加载时序可能与 attach 模式不同，导致自定义 provider 的 `-m` 参数被忽略。

**与 opencode-model-smoke-test 的矛盾**：smoke test skill 建议「独立端口预检 → attach 终验」两步走。对内置 provider（volcark/opencode-go）独立端口预检可行，但**对新增自定义 provider 独立端口预检会误报 fallback**。

**结论**：
- 冒烟测试**必须用 `--attach` 模式**验证自定义 provider
- 独立 `--port` 预检**仅适用于已重启 4098 后的 provider**（确认 4098 已加载新配置）
- 验证成功标志：输出第一行 `> build · <目标模型名>`，不是 fallback 模型名

---

## 📚 相关参考资料

- 主协议: `gts:opencode-schedule` (Step C — Dispatch, 5️⃣ 硬性规则)
- 模型选择规则: opencode-schedule 6️⃣ 模型选择速查
- 兄弟硬偏好 (token 敏感): MEMORY #3「兄弟对 token 成本敏感」
- 之前写的 dispatch 脚本 (本会话已用): `.tmp-dispatch-xiahui.cjs` (项目根目录, 可作为模板)
- opencode 服务器 API endpoint: `POST /api/session` (创建), `POST /session/{id}/message` (发消息, 不带 /api 前缀)

---

## 💡 何时创建 vs 何时 patch opencode-schedule

- **能 patch 时**: opencode-schedule 是 created_by=None（人工创建），`skill_manage` 任何 action 都被拒 → **永远 patch 不了**
- **本 skill 存在的意义**: 把实战中发现的 patch 需求沉淀在这里, 让 bot 调度前**主动查本 skill**而不是死磕原协议
- **真正想合并到主协议**: 找兄弟手动改 opencode-schedule（人工 patch），本 skill 标记为「待合并」后归档