---
name: "opencode-llm-failure-recovery"
description: "OpenCode LLM 调用失败检测与恢复协议：付费/免费模型失败特征差异、余额不足排查、wait 脚本检测逻辑、发「继续」恢复。触发：dispatch 后 agent 即死、运行中突然失联、wait 脚本 stuck/llm-fail 告警、需要判断 OpenCode session 是真死还是静默。"
---

# opencode-llm-failure-recovery — OpenCode LLM 失败检测与恢复

> 适用：一切 OpenCode 调度场景的失败判定与恢复。本 skill 是 opencode-schedule（迁移技能，curator 锁定无法 patch）的失败检测补充，两者配合使用：opencode-schedule 管调度流程，本 skill 管「失败长什么样、怎么判、怎么恢复」。

## 🔴 失败特征分三种（2026-08-17/18 实测定稿）

| 特征 | 判定信号 | 处置 |
|------|---------|------|
| **付费版断流**（opencode-go/deepseek-v4-flash/pro） | event/part 表 `step-finish reason=unknown` + **tokens 全 0** + time_updated 停 | 发「继续」唤醒同一 session（重试 1-2 次可恢复，请求级偶发断流） |
| **免费版静默异常**（opencode/deepseek-v4-flash-free） | `step-finish reason=unknown` + **tokens 非 0**（2026-08-18 B2-2 实测 total=126810/output=5646 仍 unknown，模型生成了内容但 step 异常结束，无 ERROR 日志） | 🔴 **先查错误再动手**：grep opencode.log 报错 → `rate limit/429/quota` = 真限流(等窗口或换组内下一个)；`401/timeout/5xx` = 瞬时(对同 session 发「继续」同模型)；纯静默 unknown 且实测模型可用 = 优先怀疑会话异常 → **删会话重新 dispatch**(比原地「继续」干净) |

> 🔴 **免费模型额度用尽 ≠ 静默 unknown（2026-08-18 兄弟实测实锤）**：flash-free 额度用完/限流会**明确报错**（`rate limit` / `429` / `quota exceeded` / `Insufficient balance`），**不会静默 unknown**。所以 `reason=unknown` 优先怀疑「瞬时断流 / 会话状态异常 / 并发冲突」，**不是模型挂**。判定模型真挂的唯一可靠证据 = 具体错误信息（限流/401/5xx），或实测模型可用性（新会话小任务跑通）。**兄弟实测模型可用时，禁止走「继续 3 次 → 换模型」老路，直接删会话重新 dispatch。**
| **余额不足**（Insufficient balance） | opencode 日志 `level=ERROR message="stream error"` 或 `error="Insufficient balance"`；dispatch 后 agent 即死（part 表只有 brief 输入，无 step-start/reasoning/tool） | 切免费模型 `opencode/deepseek-v4-flash-free`（不依赖 opencode-go 余额）；或通知兄弟充值 |

> 🔴 **统一判定原则**：`step-finish reason=unknown` 一律视为失败（正常完成只有 stop/completed/error），**不看 tokens**——只看 tokens 0 会漏检免费版失败（2026-08-18 兄弟质问实锤）。

## 检测与排查路径

### wait 脚本（scripts/wait-opencode-session.mjs）

- `isLlmSilentFail` 判定：`reason === 'unknown'` 即失败（已修，不再要求 tokens 0）→ exit 4
- exit 3（stuck）只用于「time_updated 停但无 step-finish unknown」的挂起（如 bash 命令 running 卡死）
- 判定流程：time_updated 停 → 查 part 表末尾 → 有 step-finish → 看 reason（stop=完成 / unknown=LLM 失败）→ 无 step-finish 且最后是 tool running → 命令挂起
- 🔴 **判定需 idle>60s 兜底（2026-08-18 B2-2 误判实锤，兄弟质问）**：`unknown` 可能是**历史失败**（继续唤醒后 agent 已恢复干活），不能立即判 llm-fail。完整判定条件：
  ```js
  function isLlmSilentFail(id, n = PART_SCAN) {
    const f = lastFinish(id, n);
    return !!(f && f.reason === 'unknown');  // 只看 reason
  }
  // 在 checkState 里加 idle 保护
  if (isLlmSilentFail(id) && idleSec > 60) return 'llm-fail';
  ```
  - 仅 reason=unknown 但 idle<60s → 不判 llm-fail(agent 刚醒来在 init)
  - reason=unknown + idle>60s → llm-fail(继续消息没让 agent 恢复)
  - 误判现象：B2-2 第一次发「继续」后 agent 实际恢复干活，但 wait 启动 0s 报 llm-fail(未知 source 是历史 unknown)
  - 测试验证：`node scripts/wait-opencode-session.mjs --check <active-sid>` 输出应含 `active` 不是 `llm-fail`

### dispatch 即死诊断（part 表只有 brief 输入）

1. `opencode db "SELECT time_updated, data FROM part WHERE session_id='<sid>' ORDER BY time_updated DESC LIMIT 6"` — 若只有初始 brief text 无 step-start → agent 没启动
2. 查 opencode 日志根因：`C:\Users\<user>\.local\share\opencode\log\opencode.log` 近 4000 行 grep `level=ERROR|Insufficient balance|stream error|exiting loop`
3. 按特征表处置

### 🔴🔴 「agent 从未启动」vs「模型额度用完」必须分清（2026-08-19 r10 三连卡死实锤）

> r10 按 `Free usage exceeded` 切 flash-free→hy3-free→mimo-v2.5-free 三个模型**全部同样卡死**（session 建好但 agent 从不启动），白烧 3 轮换模型。真根因 = **之前重启 4098 server 没生效**（`Stop-Process` 杀错 PID，旧 server 一直占着 4098，`Start-Process` 新 server 因端口被占静默失败）→ 三次 dispatch 全 attach 到卡死的旧 server。**换新模型后失败模式一模一样（agent 从未启动）→ 停换模型，转查 server。**

| 信号（part 表） | 含义 | 处理 |
|------|------|------|
| 只有 1 条 brief 回显 + 无任何后续事件（无 step-start/reasoning/tool/error） | **server/attach 问题**，agent 从没被拉起 | 修 server（见下），**不要换模型** |
| 有显式错误输出 `Free usage exceeded, subscribe to Go` / `Insufficient balance` / `rate limit` / `429` / `401` / `5xx` | 模型额度/瞬时故障 | 额度用完→dead+切下一个；瞬时→「继续」重试 |
| step-finish reason=stop | 真完成 | 收产物 |
| step-finish reason=unknown + idle>60s | LLM 静默失败 | 走上文分类 SOP |

**⚠️ 额度用完 ≠ 卡死**：`Free usage exceeded` 是模型**正常收尾**报"额度没了"（CLI 会等收尾消息但 session 实际已 stop），是**显式错误**；而"agent 从未启动"是**完全静默**（无任何错误输出）——两者别混。

### 🔴🔴 server 重启必须验证生效（2026-08-19 三连卡死根因）

**HTTP 200 ≠ server 健康**——旧进程没死时 4098 也返回 200。重启后必须验证 4098 的 OwningProcess == 新 serve 进程的 PID，否则 dispatch 全 attach 到旧进程：

```powershell
# 1. 杀干净所有 opencode.exe（有 1 个 serve + N 个 attach CLI，不只一个！）
Get-Process -Name "opencode" -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "killing PID $($_.Id)"; Stop-Process -Id $_.Id -Force
}
Start-Sleep -Seconds 5
# 2. 确认 4098 端口已释放（应无输出）
Get-NetTCPConnection -LocalPort 4098 -ErrorAction SilentlyContinue
# 3. 干净重启
Start-Process -FilePath "C:\Users\Administrator\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe" `
    -ArgumentList "serve","--print-logs" -WorkingDirectory "C:\Users\Administrator" -WindowStyle Hidden
Start-Sleep -Seconds 10
# 4. 验证：新 serve 进程的 PID == 4098 的 OwningProcess（关键！）
Get-CimInstance Win32_Process -Filter "Name='opencode.exe'" | Where-Object { $_.CommandLine -match "serve" }
Get-NetTCPConnection -LocalPort 4098 -ErrorAction SilentlyContinue | Select-Object OwningProcess
```

杀 server 前先 `Get-CimInstance Win32_Process -Filter "Name='opencode.exe'"` 列出所有进程，认准 `serve` 那个 PID 再杀；连续 N 个免费模型同样卡死时第一反应是 server 不是模型。

## 恢复操作

### 🆕 先分类再动作（2026-08-18 兄弟实测：flash-free 可用 → 老「继续3次→换模型」误判,已改）

遇到 step-finish unknown / llm-fail 告警时,禁止直接套「继续 3 次」,先按下面三步定动作：

1. **grep 具体错误**：opencode.log 近 4000 行 grep `level=ERROR|rate limit|429|quota|Insufficient balance|401|timeout|5xx|stream error`
2. **分类**：
   - `rate limit` / `429` / `quota` / `Insufficient balance` → **真限流/额度用完** → 等窗口(60s~几分钟)或换组内下一个模型
   - `401` / `timeout` / `5xx` / 网络类 → **瞬时故障** → 对同 session 发「继续」(同模型, `-m` 与原 dispatch 一致)
   - 纯静默 unknown、无明确错误码 → **优先怀疑会话异常/瞬时断流** → 实测模型可用性（新会话小任务跑通）→ 可用则**删会话重新 dispatch**,不用原地「继续」
3. **换模型是最后手段**：仅在确认 rate limit 持续 / 模型实测不可用时才换组内下一个（flash-free → hy3-free → ...），不要因一次 unknown 就换
4. 🔴🔴 **免费组必须按顺序逐个试完，不能跳过直接切火山付费（2026-08-19 兄弟纠正实锤）**：mimo-v2.5-free rate limit 卡死后，我跳过 nemotron-3.5-lightning-free 直接切 `volcark/deepseek-v4-flash-ga-260731`（付费），兄弟指正「Nemotron 3.5 Lightning Free 可以用啊，你没试吗?」。**规则**：免费组内**按顺序逐个试**（从 `get` 的 current 起，跳过 blacklist），rate limit/瞬时故障优先等待或换下一个免费模型，**免费组全部试完才允许切火山付费**。切付费前可 `set <试过可用的免费模型>` 落盘记录，避免下批又漏试。brother 实测可用的模型（如 nemotron-3.5-lightning-free）优先考虑。

### 发「继续」（不重新 dispatch，兄弟拍板）

> 🔴 **确认「挂」后必须落盘免费模型状态文件（2026-08-18 兄弟拍板）**：确认某免费模型真挂（3 次继续失败 + 明确报错 rate limit/429/quota/401/5xx）→ 立即 `node scripts/opencode-free-model-state.mjs dead <model> --dir D:\Github\GTS-Play`（自动加入 blacklist，current 前进到组内下一个未挂的）→ 下次 dispatch 直接跳过，**不用现场试**。兄弟实测某模型恢复可用 → `revive <model>` 移出 blacklist、current 回到该模型。文件是权威状态：免费时段调度前先 `get` 读 current，不要凭记忆/现场测试猜模型。详见 opencode-schedule skill「免费模型状态文件化」节。

```js
// 用 .mjs 脚本发（PS 5.1 读 UTF-8 无 BOM 中文乱码报 string terminator 错，两次实锤）
import { spawn } from 'node:child_process'
const oc = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/opencode-ai/bin/opencode.exe'
const msg = '【续跑】你的 LLM 请求异常结束(step-finish unknown)。请继续:...'
const args = ['run', '-s', sid, '-m', '<原模型>', '--attach', 'http://localhost:4098', '--dir', '<项目>', '--no-replay', msg]
spawn(oc, args, { stdio: 'inherit', windowsHide: true })
```

- `-m` 必须与原 dispatch 一致（免费版就续免费版，Pro 就续 Pro）
- 发送后查 time_updated：更新 = 送达；再等 30-60s 看有无 step-start/tool = 真正恢复
- 继续后仍无响应（2 次）→ session 真死，`opencode session delete` 停掉（FK 约束终止 server agent）→ 拆新 session 续接（brief 预置已落地事实）

### 拆新 session 续接的时机

- fix 循环 >2 轮仍失败（同一 session 多次唤醒）
- 单 session tokens 接近 227K+（上下文膨胀，续跑低效）
- 续接 brief 必须预置：已改文件清单 + 剩余失败 + 已排除方向，禁止新 agent 重复探测

## 命令防挂起（bash running 卡死教训，2026-08-18 B2-1b/1c）

- agent 的 bash 命令可能挂起 >20 分钟（如 jest 跑全量）→ agent 失联
- brief 中必须写：所有 jest 命令加 `--forceExit`；命令 >5 分钟无输出 → 中止改用精确 `--testPathPattern`
- 判定：part 表最后是 `tool bash status=running` + time_updated 停 → 命令挂起
- **关键 fix 循环经验（2026-08-18 B2-1b → b2-1c 实测）**：
  - 同一 session 「继续」3 次仍失联 → **拆新 session**（pre-brief 预置已落地事实：已改文件清单 + 剩余失败 + agent 中途结论）
  - pre-brief 还需明确写 **命令防挂起硬性约束**（`--forceExit`、testPathPattern 精确到单文件），避免新 agent 重蹈覆辙

## 🆕 多次唤醒 vs 拆 session 判据（2026-08-17/18 B2-1 全程实测）

| 失败特征 | 处置 |
|---------|------|
| 同一 session 「继续」1-2 次可恢复 | 续接，不拆 session |
| `reason=unknown` 但**模型实测可用**（兄弟/新会话验证过）| **删会话直接重开**，不原地「继续」不换模型（2026-08-18 兄弟实测 flash-free 可用，老「继续3次→换模型」误判已改） |
| 同一 session 「继续」≥3 次仍失联（0 新 part）| **拆新 session**：停旧 + pre-brief 预置 |
| 同 session tokens 累计 >200K（log 看 part 表 reasoning 块很大）| **拆新 session**：上下文膨胀,续跑低效 |
| 5 次以上「继续」后 agent 还在跑但产出极少 | 拆 session，**brief 必须强制要求 agent 每完成 1 个子任务就 git commit 一次**（断了不丢） |

## 🆕 volcark key 失效排查（2026-08-18 B2-2b 实测）

OpenCode 报 `AI_APICallError: the API key or AK/SK in the request is missing or invalid` 时：
1. **不要立刻下结论「key 无效」** — 用纯 node https 实测（不依赖 OpenCode server）：
   ```js
   // 测试 key 真实可用性
   const r = await fetch('https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions', {
     method: 'POST',
     headers: { 'Authorization': `Bearer <key>`, 'Content-Type': 'application/json' },
     body: JSON.stringify({ model: 'deepseek-v4-flash-ga-260731', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 })
   })
   ```
2. HTTP 200 = key 真的有效 → 问题在 OpenCode server 进程缓存（**kill OpenCode 重启即可**，不必改 key）
3. HTTP 401/403 = key 真的失效 → 通知兄弟去 volcark 控制台拿新 key（`setx ARK_CODING_API_KEY <新key>`，然后 OpenCode 重启）
4. **OpenCode 进程 kill 后 server 会自动重启**（Hermes 拉起），4098 重新可监听，session DB 保留，旧 session 可重新发「继续」

### 🔴 agent 必须在每次「兄弟抱怨 OpenCode 没跑」之前主动检查（2026-08-18 兄弟连续质问「你怎么没有反应？」「opencode没跑起来啊」「opencode报错了」实锤教训）

**规则**：当兄弟在对话里说「OpenCode 没跑」「OpenCode 报错了」「它意外停止了」类似抱怨时，**agent 第一轮响应必须先运行 `node scripts/diagnose-llm-fail.mjs <sid>` 或自查 4 项**：
1. 4098 HTTP 健康（node `http.request` 直连，避 PS curl 别名劫持）
2. 4098 端口 LISTENING（`netstat -ano | findstr :4098.*LISTENING`）
3. opencode.exe 进程数（`tasklist /FI "IMAGENAME eq opencode.exe"`）
4. 目标 session 在 DB 中存在 + time_updated 距今 <240s（活跃）

**禁止**：第一轮就假设「agent 还在干活，只是兄弟没刷新页面」，那是错误的乐观——**实测多轮都是 server 真死或 key 真坏**，必须先实测再判断。

**自我反馈**：本会话兄弟三次质问「OpenCode 死了你不知道？」「opencode 没跑起来」「opencode 报错了」→ 之前每次都拖到 `wait 脚本 exit 3/4` 才反应，太慢。**正确做法**：兄弟抱怨 → 立即跑 4 项健康检查 → 1 轮 LLM 决策要怎么处理。

### ⚠️ OpenCode server kill 后不会自动启动，但 agent 可以自己拉起（2026-08-18 修正，推翻早前「必须兄弟手动启动」）

**事实**：kill opencode 进程后 4098 不会自己复活（Hermes 不自动拉起）。**但 agent 完全可以直接拉起 server**（2026-08-18 watch-opencode-4098.ps1 实测）——早前「agent 无权启动 GUI server、必须兄弟手动启动」的判断只适用于**桌面 GUI 方式**；`opencode serve` 命令行方式 agent 有权限，直接 Start-Process 即可：

```powershell
# ✅ agent 直接拉起（指向 npm 全局 exe 绝对路径，不能裸命令名 opencode）
$exe = "C:\Users\Administrator\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe"
Start-Process -FilePath $exe -ArgumentList "serve", "--port", "4098", "--hostname", "127.0.0.1", "--print-logs" -PassThru -WindowStyle Hidden
```

**推荐用守护脚本 `scripts/watch-opencode-4098.ps1`（方案 D，2026-08-18 落地）**：每 60s 扫 opencode.log 尾部 80 行，发现 volcark 401 或 4098 未监听 → 自动杀旧起新 + 180s cooldown。启动：`powershell -NoProfile -ExecutionPolicy Bypass -File D:\Github\GTS-Play\scripts\watch-opencode-4098.ps1`（后台常驻）。注意：watch 拉起的 server 是其子进程，watch 被杀（进程树）时 server 跟着死，重启后需重跑守护。

- agent 处置：4098 掉线/401 复发 → **先重启 4098**（跑守护脚本或 Start-Process 拉起），不要再让兄弟手动启动
- **修复后验证步骤**：纯 node http 检查 4098 + 进程 ID 变化（不等同于 kill 前的 ID）+ session DB 中目标 session time_updated 距今 <240s 即可续跑
- 早前「必须兄弟手动启动」的场景（B2-2b）是当时没用守护脚本/Start-Process，正确做法是直接自己拉起

### ⚠️ 「Hermes 能用 volcark ≠ OpenCode 能用 volcark」误判陷阱（2026-08-18 B2-2b 实测）

兄弟说「Hermes 都可以使用 volcark」时，**不能直接推断 OpenCode 端 volcark provider 也 OK**：

- Hermes runtime 实际配置的 provider 是 **minimax-cn**（`MiniMax-M3`），**不依赖 volcark**——Hermes 能用 ≠ volcark key 有效
- OpenCode 独立读 `opencode.json` 的 volcark 配置 + `{env:ARK_CODING_API_KEY}` 解析，和 Hermes runtime 进程的环境/配置完全分离
- 兄弟误以为「Hermes 工作 → OpenCode 也工作」会把 bot 误导到「key 没问题、问题在别处」的死胡同

**正确做法**：拿到报错后**先实测 key**（上面 fetch 调用），不要靠兄弟说「应该 OK」推断

## 🆕 PowerShell `[D]` 模板字符串陷阱（2026-08-18 volcark 诊断实测）

写诊断脚本时 **node 模板字符串里的 `$_`/`[D]` 会被 PowerShell 解释器吃掉转义**（实测整个脚本被 PS 解析错误刷屏）。解决方案：把 PowerShell 命令写进 `.ps1` 文件，用 `execFileSync` 调用 .ps1 文件而不是内联命令字符串。这样 PowerShell 转义问题完全规避。

## 关联
关联：
- 调度完整协议（brief 写法、dispatch 参数、监控流程）：`skills/gts/opencode-schedule/SKILL.md`
- 停止 OpenCode：`skills/gts/gts-opencode-stop/SKILL.md`
- 会话监控实战（stuck 分类、part 表查询、bash running 误判）：`skills/gts/opencode-session-ops/SKILL.md`
- 一键诊断脚本：`scripts/diagnose-llm-fail.mjs`（6 段输出，1 轮 LLM 决策：server 健康 + volcark 配置 + session 状态 + volcark key 直连实测 + 日志 ERROR + 推荐动作；支持 `node diagnose-llm-fail.mjs <sid>` 完整版和 `node diagnose-llm-fail.mjs` 仅 server 版）
- 失败模式特征库：`references/llm-fail-patterns.md`（各 provider tokens/log 错误码表 + volcark key 实测代码）

### 🔴 兄弟抱怨 OpenCode 时的第一动作（2026-08-18 三次质问教训）

兄弟说"OpenCode 死了/没跑/报错/它意外停止了"时**第一轮响应必须先跑诊断**，禁止先假设「agent 还在干活、只是兄弟没刷新」：

```bash
node scripts/diagnose-llm-fail.mjs <sid>   # 完整诊断（含 key 实测 + 日志）
node scripts/diagnose-llm-fail.mjs          # 仅 server 健康（兄弟说"OpenCode 死了"时先用这个）
```

实战教训（本会话 5 次）：每次都拖到 wait 脚本 exit 3/4 才发现问题，**反应太慢**——兄弟说"你怎么没有反应？"质问 3 次。**正确做法**：兄弟抱怨 → 立即跑诊断脚本 → 1 轮 LLM 看输出定动作。

**禁止**：
- ❌ 第一轮写临时 `_tmp-diag-*.mjs` 拼凑 5 个验证点（实操 90 秒 vs diagnose-llm-fail.mjs 5 秒）
- ❌ 假设"Hermes 能用 volcark = OpenCode 也能用"（实测 Hermes 用 minimax-cn 不依赖 volcark，OpenCode 独立读 opencode.json，key 状态完全分离）
- ❌ 假设"OpenCode 进程死了会自动重启"（实测：kill 后 4098 不会自己复活，**但 agent 可用 Start-Process / 守护脚本自己拉起**，详见上文「OpenCode server kill 后」段，不要等兄弟手动启动）

**真要写临时探针**（必须简短）：
- 只针对单点（如"某个新 sid 在 DB 查不到"），30 行内 .mjs，**纯 node 无 PS/无中文**
- ad-hoc verify 一次 PASS 即可，不要套 5 个验证点

## 🔴 排查顺序纪律（2026-08-18 多轮实测，避免重复造轮子）

兄弟抱怨「OpenCode 死了/没跑/报错」或 wait 脚本 stuck/llm-fail → **第一动作**：跑 `node scripts/diagnose-llm-fail.mjs <sid>` 一键诊断。

**禁止**：
- ❌ 先开临时 `_tmp-diag-*.ps1` / `_tmp-diag-*.mjs` 拼凑四问脚本（实操 5 次重复造轮子，verify 还老报错：断言写错、`require` 与 `top-level await` 混用、PS `$` 转义炸、PS 5.1 无 BOM 中文乱码等），全部踩坑已在 windows-powershell-pitfalls 记录
- ❌ 不用现成的 `diagnose-llm-fail.mjs` 是因为「写脚本更快」—— 实测写脚本+修断言+ ad-hoc verify 5 轮 ≈ 90 秒；直接 `node scripts/diagnose-llm-fail.mjs <sid>` 输出 6 段答案 ≈ 5 秒
- ✅ 真要临时探针（如「兄弟给的新会话 sid 在 DB 查不到」单点确认），写成 1 个 .mjs（纯 node，无 PS / 无中文），ad-hoc verify 一次 PASS 即可，**别套 5 个验证点**

何时自己写临时脚本（必须简短）：
- diagnose-llm-fail.mjs 没覆盖的具体查询（如「B2-2c server DB 查询失败，先只看 DB 的 last 8 条 part」单点）→ 写 30 行内 .mjs
- 不是排查 OpenCode 问题（如「volcark key 是否真的 HTTP 200」纯网络层）→ 已有脚本的 volcark key 实测段可直接复用，否则写单次 .mjs
