# session 生命周期异常处理(2.5 / 2.6 / Aborted / socket / permission)

> 主 skill「2.5️⃣」「2.6️⃣」+ 各种异常场景拆出(2026-08-20)。dispatch 后任何「session 还活着但出了岔子」的处置都走这里。

---

## 2.5️⃣ 给运行中 session 追加消息(2026-08-10 新增,兄弟要求补录)

> **场景:** dispatch 后兄弟补充了需求(如「测试也单独文件夹」),或 bot 发现 brief 遗漏需要追加信息。**不需要 kill 重来**,直接用 HTTP API 向运行中的 server session 追加消息。

### 前提

目标 session 挂在 4098 Web UI(attach 模式)。先拿到 session id:

```powershell
# 1. 查 session 列表(含 title,可匹配任务名)
$sessions = (Invoke-RestMethod -Uri "http://localhost:4098/api/session" -Method Get -TimeoutSec 10).data
$sessions | ForEach-Object { Write-Host "$($_.id) | $($_.title) | updated=$($_.time.updated)" }
# 认准 title 匹配自己任务的 session id(如 pmx-texture-optimize)
```

### 追加消息(关键格式)

```powershell
$id = "ses_xxx"  # 目标 session id
$body = @{ parts = @(@{ type = "text"; text = "【补充要求】..." }) } | ConvertTo-Json -Depth 5
$body | Out-File -FilePath "$env:TEMP\msg-body.json" -Encoding UTF8
# 🔴 必须用 curl 后台发送!Invoke-WebRequest 会挂起等到 agent 处理完(超时=取消=没送达)
curl.exe -s -X POST "http://localhost:4098/session/$id/message" `
  -H "Content-Type: application/json" --data-binary "@$env:TEMP\msg-body.json" --max-time 300
```

### 🔴🔴🔴 关键坑(2026-08-10 实锤)

1. **endpoint 是 `/session/{id}/message`(不带 /api 前缀)**,带 `/api` 前缀返回 HTML 页面
2. **body 必须含 `parts` 数组**(`{parts:[{type:"text",text:"..."}]}`),缺了返回 400 `Missing key ["parts"]`
3. **POST 是流式挂起**:请求会一直挂着直到 agent 处理完这条消息 → `Invoke-WebRequest` 默认 10s 超时会把请求取消(消息可能没送达)→ 必须 `curl.exe --max-time 300` 后台跑,或者 exec(background=true)
4. **送达验证:** `GET http://localhost:4098/api/session/{id}/message`(带 /api!)看消息列表里有没有刚发的 text;空列表 = 没送达
5. 追加消息进队列后,agent 会继续干活,**不要以为 CLI 会打印**——CLI 已 exit,监控看 DB `time_updated` 是否继续涨
6. `--no-replay` 的 session 追加消息仍有效(消息直接进 server session,不走 replay)

---

## 2.6️⃣ 相续任务优先在旧 session 续接,不开新任务(2026-08-17 兄弟拍板)

> **规则:** 新任务与旧任务有**相续关系**时,优先在旧任务 session 中续接(发「继续」消息),**不要开新 session**。省 token(不重读上下文)+ 上下文连续(agent 记得自己刚做的改动,不用重新探索)。

### 相续关系的判定(满足其一)

- 同一 issue / 同一功能链的后续步骤(如:实现落地 → 兄弟拍板验收调整 → 同 session 续接收尾)
- 基于旧 session 的产出/结论继续(如:方案 A 落地后改验收值、fix 后的回归验证)
- 同一任务的补丁/小修(旧 session 结论里已知的待办)

**不是相续关系**(开新 session):全新任务、不同 issue/功能、与旧 session 产出无关的任务。

### 续接流程

```powershell
# 1. 确认旧 session 状态:已停(time_updated 不再涨)才续接;还在涨 = 正在跑,直接追加消息或等完成
opencode db "SELECT time_updated FROM session WHERE id='<旧sessionId>'" --format json
# 2. 续接(🔴 -m 必须与原 dispatch 相同模型)
opencode run -s <旧sessionId> -m <原模型> --attach http://localhost:4098 --dir <项目> --no-replay "继续:<新要求>"
# 3. 后台跑 + 按 monitoring-wait.md 监控(poll / DB time_updated)
```

### 🔴 前提核对(防误发)

- 续接前必须查 DB 确认旧 session 的 title 属于**同一任务链**(同 issue/同功能),误发到别的任务 session = 双 agent 冲突(2026-08-11 两次误发教训)
- 旧 session 已 completed(step-finish reason=stop)→ 续接会**主动重新唤醒**,这正是相续续接的预期行为(区别于「误发到已完成 session 需 delete」——那是发错任务的情况)
- 旧 session 上下文已接近上限(tokens ≈900K / 多次 compaction)→ 放弃续接,开新 session 带摘要(MEMORY #34b)

### 反面教训(2026-08-17)

方案 A 落地 session(amber-ember)结束后,验收值调整(accept062)另开了新 session → 本可续接 amber-amber(改动已在其工作区,只需改断言+验证)。代价:新 session 重读全部上下文 + 双 session 开销。

---

## 🔴 CLI Aborted 后仍可续跑(2026-07-31 论坛通知去重 B2 案例)

```
# 现象:opencode run CLI 显示 "Error: Aborted"(CLI 中断),但 server session 仍在跑
process(action=poll) → warm-shore 显示 Error: Aborted
# 不要 re-dispatch!先查 DB:
opencode db "SELECT time_updated FROM session ORDER BY time_created DESC LIMIT 1" --format json
# time_updated 持续更新(idle 几秒)→ server agent 活跃 → 继续等
# 验证:监控目标文件修改时间(如 forumService.ts 16:08→16:11 连续变动)
# 结果:40 分钟后 session 正常完成,全部产出(Step C 报告 + 修复 + 测试)取回成功
```

> ✅ 判定要点:CLI Aborted ≠ server session 死亡。Aborted 后查 `time_updated`,**在涨=继续等**(结合文件修改时间线佐证),不要重 dispatch;只有 `time_updated` 完全停止推进 + 进程存活 ≥80 分钟才考虑 kill(先汇报兄弟)

---

## 🔴🔴🔴 CLI socket 崩溃后 Web UI 续跑成功案例(2026-08-05 nf Phase 5 实现)

```
# 现象:opencode run CLI 报 "Error: The socket connection was closed unexpectedly" exit 1(socket 崩溃)
process(action=poll) → young-nudibranch failed(exec session 死了)
# 处置:不重新 dispatch!先查 DB 确认 server 端 session 存活:
opencode db "SELECT id, time_updated FROM session WHERE title='<同任务title>' ORDER BY time_created DESC LIMIT 1"
# time_updated 持续增长(seq 1648+,part type=patch)→ server agent 活跃
# 请兄弟在 Web UI 手动点「继续」续跑同一 server session(不 attach,不新建)
# bot 用 wait 脚本只监控不 attach:node scripts/wait-opencode-session.mjs <sessionId> 3600000 90000
# 结果:session 续跑完成 T1-T11 全部任务(耗时 ~50min),产出+验证全取回
```

> ✅ 关键:**CLI socket 崩溃(exit 1)≠ session 死亡**。exec session 死了但 server 端 session 还活着时,**优先 Web UI 续跑同一 session**(兄弟手动点继续)而非重新 dispatch——零重复劳动,避免双 session 冲突。判据:DB `time_updated` 仍在涨 + 事件 seq 在推进。续跑期间 bot 只监控不 attach(wait 脚本 idle 阈值 90s,Pro/max 变体 5min)

---

## 🔴🔴🔴 识别乱码输出,不误判

- OpenCode 通过工具传中文路径到 PowerShell 时,错误输出中中文可能变成 `绗旇`、`锟斤拷` 等乱码
- 这些是**编码伪像**,不是实际失败
- 判断规则:
  - 错误信息路径含 `\\绗旇\\` 等乱码 → 先 `exec Test-Path` 确认文件真实状态
  - `Set-Content` / `WriteAllText` 报 `DirectoryNotFoundException` 但目标文件确实存在 → 编码伪像
  - `Select-String` / `ForEach-Object` 报 PowerShell parser error → 编码伪像
- **看到乱码错误 ≠ 任务失败**,继续 poll 等结果

---

## 🔴 权限卡住(等 Allow/Deny 授权框)

**根因:** agent 想写**项目外路径**(系统 temp `C:\Users\...\AppData\Local\Temp\`、桌面、下载目录等)→ 不在 edit 允许范围 → 弹权限确认 → 卡住等人工

### 处理(误判警示)

- **特征:** session 停在 tool 事件 **permission 请求**(Web UI 弹「Allow/Deny」授权框),`time_updated` 停;这是**权限等待,不是卡死/模型问题**
- **处理:** ① 兄弟在 Web UI 手动点 Allow 授权即继续;② 或 bot 用 2.5️⃣ 追加消息提示 agent「该路径未授权,改写到工作目录内路径」→ 不用发「继续」、不重 dispatch、不 delete
- ⚠️ 别把权限等待误判成 LLM 静默失败/卡死去走唤醒或重派——先看 Web UI 是否在等授权

### ✅ 已根治(2026-08-18,主 skill 写)

`~/.config/opencode/opencode.json` 已配 `agent.build.permission = {edit: "allow", bash: "allow"}` → server 端 agent 全自动批准,不再弹确认。⚠️ **4098 不热加载,改完必须重启 4098 server 才生效**。

### 预防(brief 必加)

- 临时/中间文件一律写到工作目录下(如 `<projectDir>/.tmp/` 或当前目录),**禁止写系统 temp 路径**
- 其它易触发权限的操作同理:brief 里提前声明允许范围

---

## 🔴 dispatch 后立即拿 sessionId(不等 completion event,2026-08-13 兄弟连催 3 次后定)

dispatch 后立刻查 DB 拿 sessionId 并启动 wait 脚本(exec background),再说话。

```powershell
opencode db "SELECT id FROM session WHERE title='<title>' ORDER BY time_created DESC LIMIT 1"
# 或 poll 一次(仅此一次 30s,挂起就放弃)
```

**拿不到 = dispatch 静默失败**(2026-08-19 实锤:51s CLI 跑着但 DB 无 session 记录 = yargs 拆 positional 失败)→ kill CLI + 改用 `--file` 重派。

### 拿完 sessionId 立即落盘模型记录(2026-08-18 兄弟拍板落地)

dispatch 用 `-m <provider>/<model> [--variant <v>]` 后,立即把模型写进 `.opencode-session-meta/<sessionId>-<title>.json`(🔴 文件名必须带任务后缀,多任务并行 ls 一眼可辨):

```powershell
node scripts/opencode-session-meta.mjs save <sessionId> <provider/model> [variant] --title "<title>" --dir D:\Github\GTS-Play
# 例: node scripts/opencode-session-meta.mjs save ses_xxx opencode/deepseek-v4-flash-free --title mmd-fix --dir D:\Github\GTS-Play
# 例: node scripts/opencode-session-meta.mjs save ses_xxx volcark/deepseek-v4-pro-ga-260813 max --title review --dir D:\Github\GTS-Play
```

**为什么不读 DB step-start 拿模型?** OpenCode DB 的 step-start 不含 model 字段(已实测),session-meta 落盘是唯一可靠来源。

发「继续」/续跑前必读 meta:

```powershell
$meta = node scripts/opencode-session-meta.mjs get <sessionId> --dir D:\Github\GTS-Play | ConvertFrom-Json
# found:true → -m "$($meta.provider)/$($meta.model)";$meta.variant 非 null 才追加 --variant $($meta.variant)
# found:false → 查 ls 最近记录 / 回查 dispatch 时刻的 -m 参数,禁止凭记忆猜
```

### 发「继续」通用命令模板(2026-08-18 定稿)

```powershell
opencode run -s <sessionId> -m <原dispatch模型> --attach http://localhost:4098 --dir <项目> --no-replay "继续:<待办提示>"
```

⚠️ `-m` 必须与原 dispatch 相同模型,否则模型降级,质量打折 + 多花 go 套餐的钱。

---

## 🔴 post-poll 通用钩子:检查并更新 state issue(2026-07-29 新增)

OpenCode session 完成后(poll 确认 exit + DB 确认 completed),进入下一阶段前:

1. **检查是否存在活跃的 state file:**

   ```powershell
   Get-ChildItem "D:/Github/GTS-Play/.skill-exec-state.*.json" -ErrorAction SilentlyContinue
   ```

2. **如果存在且 `completedSteps` 落后于预期** → 通知调 step-done:

   ```
   ⚠️ 检测到 state file 进度可能落后。
   建议立即调 step-done 再进下一步。
   ```

3. **如果不存在** → 本次 dispatch 不是由有状态追踪的 skill 触发的(如 gts-e2e-test 直接调用),跳过此钩子。

> 🔴 此钩子是通用安全检查,不耦合任何特定 skill。
> 上游 skill 在 dispatch 前存了 sessionId 到 state 的,poll 后必须调 step-done。
> 如果上游 skill 不是有状态追踪的(没有 skill-exec-manager 的 INIT),此钩子自动优雅跳过。

### state 落后恢复(对话压缩后 sync)

```powershell
cd D:/Github/GTS-Play
$stateFile = Get-ChildItem ".skill-exec-state.*.json" | Select-Object -First 1

if ($stateFile) {
  $currentCount = (Get-Content $stateFile.FullName | ConvertFrom-Json).completedCount
  $actualCount = <根据对话进度填入实际完成步数>
  if ($actualCount -gt $currentCount) {
    node scripts/skill-exec-manager.cjs sync $stateFile.Name `
      --completed-count $actualCount `
      --log-entry "post-poll sync: 对话压缩后恢复,追补 $($actualCount - $currentCount) steps"
  }
}
```

> `sync` 命令是 2026-07-29 新增,专门解决 state/issue 不同步的场景。
> 它的存在不能替代「每步完成调 step-done」的纪律,只是兜底恢复工具。
