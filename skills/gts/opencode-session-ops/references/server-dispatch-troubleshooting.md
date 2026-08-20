# 4098 Server 派工故障排查（dispatch 失败 / agent 不启动）

> 2026-08-19 Phase Fix-r10 实锤沉淀。场景：`opencode run` 派工异常但 4098 HTTP 健康。
> 归 opencode-session-ops umbrella，配合 §2️⃣3️⃣（Free usage exceeded 收尾信号）一起用。

## 症状 1：`opencode run` 报 `Unknown: FileSystem.open (...\opencode.log)`（exit 1）

**现象：**
```
Error: Unexpected error

Unknown: FileSystem.open (C:\Users\Administrator\.local\share\opencode\log\opencode.log)
```
- 4098 HTTP 仍返回 200（`Invoke-WebRequest http://localhost:4098/api/session` 正常）
- 换独立端口 `--port 4094` 也一样报 → 不是端口问题
- `Get-Content opencode.log` 也报 `Access to the path ... is denied`（文件被独占）

**根因：** 长时间运行的 `opencode serve --print-logs` 进程持有 log 文件句柄（实测 31MB log），新 CLI 客户端尝试写同一 log 文件被 OS 拒绝。**server 进程活着 + HTTP 200 ≠ CLI 能派工**——CLI 派工前要写 log，写不进就整体失败。

**修复（兄弟拍板方案 a）：**
```powershell
# 1. 确认 serve 进程
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match "opencode.*serve" } | Select-Object ProcessId, CommandLine
# 2. 杀 server 进程（释放 log 锁）
Stop-Process -Id <PID> -Force
# 3. 重启 server（与原启动一致：serve --print-logs）
Start-Process -FilePath "C:\Users\Administrator\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe" -ArgumentList "serve","--print-logs" -WorkingDirectory "C:\Users\Administrator" -WindowStyle Hidden
# 4. 验证 HTTP 恢复 200
Invoke-WebRequest -Uri "http://localhost:4098/api/session" -TimeoutSec 8 -UseBasicParsing
```

**坑：**
- **不要尝试在 serve 运行时清空 log**（`Get-Content | Set-Content` 报 Access denied）——先杀进程释放锁，或不管 log 大小
- 杀 serve 会中断所有活跃 session；确认无未完成的重要 session 再动手（本 session code-review 已 done，安全）
- `opencode session delete` 管的是**数据库记录**，serve 锁的是**文件**——log 锁只有杀 serve 进程才能释放

## 症状 2：dispatch 成功但 agent 不启动（part 表只有 brief 回显）

**现象：**
- `opencode run` 正常创建 session（DB 有记录），但跑几分钟 agent 无任何产出
- part 表只有 1 条 = brief 内容回显，**没有 step-start / tool / reasoning / step-finish 任何后续事件**
- `time_updated` 停在 dispatch 时刻附近不再涨
- wait 脚本报 `DONE: session idle >= 300s`（last=text，不是 step-finish stop）

**与"模型额度用完"的关键区别（分诊表）：**
| 特征 | 模型额度用完 (Free usage exceeded) | server agent 不启动 |
|---|---|---|
| part 表 | 有 agent 输出 + 明确报错 `Free usage exceeded, subscribe to Go` | 只有 brief 回显，无后续事件 |
| 判定 | 额度真没了，dead + 切组内下一个免费模型（§2️⃣3️⃣ 延伸） | 怀疑 server 状态，重启 4098 serve |
| 处理 | `free-model-state.mjs dead` + 用 `get` 拿 current 重派 | `opencode session delete` + 重启 serve |

**教训（2026-08-19）：** server 重启后连派两个免费模型（flash-free、hy3-free）都出现"只有 brief 回显"——本会话误判为模型额度逐个 `dead`，实际更像是 serve 重启后 build agent 状态异常。**下次遇到"part 表只有 brief 回显、无任何 agent 事件"，先怀疑 server 状态（重启 serve 再试），不要连续烧免费模型。**

**处理三步：**
1. 查 part 表确认"只有 brief 回显"（`SELECT data FROM part WHERE session_id='<sid>' ORDER BY time_updated DESC LIMIT 3`）
2. 有明确额度报错 → `free-model-state.mjs dead` + 切下一个（见 SKILL.md §2️⃣3️⃣ 延伸）
3. 无任何 agent 事件（只有 brief）→ `opencode session delete <sid>` + **重启 4098 serve**（症状 1 步骤）再派

## 通用核对纪律（本 session 重申）

- wait 脚本 `DONE` / `TIMEOUT` 通知 **不能 100% 反映真实状态**，收到通知后必须用 sqlite3 查 part 表末尾事件确认
- dispatch 失败分三类：① CLI 报错（log 锁/参数）→ 修 CLI 环境；② session 创建但 agent 不跑 → server 状态；③ agent 跑但报模型错误 → 模型/额度
- 免费模型连续 2 个"只有 brief 回显"= 优先怀疑 server 状态，不是逐个 dead 模型
