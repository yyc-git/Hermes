---
name: "gts-opencode-stop"
description: "停止指定的 OpenCode 会话（精确 kill，不重启服务器，FK 约束自动阻止 server 端 agent 继续）。查 session ID → delete → 杀子进程。"
---

# gts-opencode-stop — 停止 OpenCode 会话

> 触发词：`停止opencode` / `kill opencode` / `终止opencode会话` / `停止opencode会话`
> 精确 kill 指定 OpenCode session，不重启服务器，不影响其他 session。

---

## 🔴 核心原则

1. **不重启 OpenCode 服务器** — 使用 `opencode session delete <sessionID>` 精确删除
2. **必须杀子进程** — 删除 session 记录不会自动杀掉它 spawn 的进程（E2E runner、Chrome/Playwright 浏览器等）
3. **先确认目标再动手** — 列出最近 session 让兄弟选，不闷头删
4. **判断 session 是否真的卡住** — 查 DB 的 `time_updated`：
   - `time_updated` 仍在变化（特别是最近 10 分钟内）→ **session 仍在活跃，不能停**
   - `time_updated` 超 30 分钟未变化 + poll 无输出 → 可以停
   - **`--variant max` 模型可能在生成报告阶段 15-30+ 分钟无 shell 输出，但 DB `time_updated` 一直在更新** → 正常，不能停
5. **其他 session 不受影响** — 服务器进程、Web UI、其他运行中的 session 保持正常
6. **FK 约束自动阻止 server 端 agent 继续** — 删 session 后，服务器内存中的 build agent 无法写回结果（message/parts 表的 FOREIGN KEY 约束失败），自动停止执行。**不需要重启服务器来清内存 agent**
7. **🔴 CLI exit 0 ≠ session 结束（2026-08-05 新增）** — `opencode run` CLI 退出（exit 0）**不代表 server 端 session 结束**：DB 里可能仍有同 title session 记录（server agent 残留/模型空转）。**重新 dispatch 相同任务前必须查 DB 清理残留**，禁止「CLI exit 0 就认为跑完」直接二次 dispatch（实例：2026-08-05 fix84-review1 两次 kimi-k3 空转 CLI exit 0，直接重 dispatch 导致 DB 2 个同 title session 并存）
8. **🔴 delete 成功必须三重验证（2026-08-05 新增）** — 只信 DB 查询，不信 delete 命令输出：① delete 返回 `Session xxx deleted` + exit 0 ② 立即查 `WHERE id='<id>'` 返回 `[]` ③ **等 15 秒再查仍 `[]`**（防 server agent 写回复活，FK 约束失败即真死）④ 全 title 扫描 `WHERE title='<同任务>'` 确认零残留才允许重新 dispatch

---

## 步骤序列

```
步骤序列（4 步）：
  1: 列出最近 session
  2: 确认目标 session
  3: 删 session + 杀子进程
  4: 验证
```

### Step 1：列出最近 session

```powershell
C:\Users\Administrator\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe db "SELECT id, title, time_created FROM session ORDER BY time_created DESC LIMIT 5" --format json
```

输出示例：
```json
[
  {
    "id": "ses_058af4b99ffe192gIWqTUZsYlo",
    "title": "E2E 单场景测试",
    "time_created": 1785218511974
  },
  ... (最多 5 条)
]
```

把结果展示给兄弟，让他选要停哪个。

**注意：** `opencode session list` 只显示持久化的 session（已完成的），不显示正在运行的。要查正在运行的 session 必须用 `opencode db` 直接查 SQLite。

### Step 2：确认目标 session

展示格式：
```
最近 OpenCode session：
  [1] ses_xxx — "E2E 回归测试" (x分钟前创建)
  [2] ses_yyy — "论坛修复" (y小时前创建)
  [3] ses_zzz — "代码审核" (z小时前创建)
  
  输入序号或 session ID 以确认要停止的会话 >
```

- 兄弟输入序号或 session ID
- 如果只有一个最近的 session，直接问「是否停止最近 session？」

### Step 3：删 session + 杀子进程

```powershell
# 1. 删 session（⚠️ server 端内存 agent 会因 FOREIGN KEY 约束自动失效）
opencode session delete <sessionID>

# 2. 杀 E2E runner 子进程
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "e2e-runner" } | ForEach-Object { taskkill /F /PID $_.Id 2>$null }

# 3. 杀 Playwright/headless Chrome 浏览器进程
Get-Process -Name "chrome" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "playwright|headless|--remote-debugging" } | ForEach-Object { taskkill /F /PID $_.Id 2>$null }
```

**🔴 `opencode session delete` 后 FK 约束如何生效（2026-07-28 验证）：**

删 session 后服务器端 build agent 的行为：
1. agent 仍然在内存中运行（不会立即消失）
2. 当它尝试写回结果（message、part 表）时，SQLite FOREIGN KEY 约束检测到 session ID 已不存在
3. 约束失败 → `EffectDrizzleQueryError: FOREIGN KEY constraint failed`
4. agent 无法保存 state → 无法继续执行下一轮 loop → **自动停止**

**结论：** 不需要重启服务器。`opencode session delete` 本身已足够让 server 端 agent 终止。

⚠️ **精准匹配规则**：
- 只杀 `e2e-runner` 命名的 node 进程（不杀 gateway、不杀其他 node 服务）
- 只杀 `playwright|headless|--remote-debugging` 的 chrome 进程（不杀兄弟自己的 Chrome）
- 不 kill OpenCode 服务器进程本身

### Step 4：验证（🔴 三重验证 + 全 title 扫描，缺一不可）

```powershell
# ===== 第一重：delete 命令返回 =====
# 执行时看到 `Session ses_xxx deleted` + exit 0

# ===== 第二重：立即查 DB（只信查询，不信 delete 输出）=====
opencode db "SELECT id, title FROM session WHERE id='<sessionID>'" --format json
# → 返回空数组 [] 即删除成功
# ⚠️ 如果返回非空 = delete 未生效，需重试/检查

# ===== 第三重：等 15 秒再查（防 server agent 写回复活）=====
Start-Sleep -Seconds 15
opencode db "SELECT id FROM session WHERE id='<sessionID>'" --format json
# → 仍返回 [] = server 端 agent 已被 FK 约束终止，不会复活
# ⚠️ 如果记录复活 = server agent 还在内存写回，需再 delete 或重启

# ===== 收尾：全 title 扫描（防同任务残留）=====
opencode db "SELECT id, title, time_updated FROM session WHERE title='<同任务title>'" --format json
# → 返回 [] = 该任务零残留，才允许重新 dispatch 相同任务
# ⚠️ 有残留 = 逐个 delete，再等 15s 复查，直到 []

# ===== 确认无残留子进程 =====
$chrome = Get-Process -Name "chrome" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "playwright|headless" } | Measure-Object | Select-Object -ExpandProperty Count
$node = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "e2e-runner" } | Measure-Object | Select-Object -ExpandProperty Count
# → chrome=0 node=0
```

**🔴 为什么必须三重验证（2026-08-05 实战教训）：**
- `opencode session delete` 输出 `deleted` 只能证明命令执行了，**不能证明 server 端 agent 已死**
- server 端 build agent 在内存中可能还活着，会尝试写回 session 记录 → 只有等 15 秒后查询仍为空，才确认 FK 约束已将其终止
- 同 title 残留检查是重新 dispatch 的前置条件：CLI exit 0 后 DB 可能仍有同 title session 记录，直接二次 dispatch = 2 个同任务 session 抢文件

---

## 调用入口

| 场景 | 触发方式 |
|------|----------|
| 兄弟说「停止opencode」 | ✅ 直接触发 |
| 兄弟说「kill opencode」 | ✅ 直接触发 |
| 兄弟说「终止opencode会话」 | ✅ 直接触发 |
| 兄弟说「停掉那个opencode」 | ✅ 直接触发 |

---

## 相关路径

| 项 | 值 |
|----|-----|
| OpenCode 数据库 | `C:\Users\Administrator\.local\share\opencode\opencode.db` |
| OpenCode CLI | `C:\Users\Administrator\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe` |
| OpenCode 服务器 Web UI | `http://localhost:4098`（如 4096 被占用则动态变化，以 `opencode.json` 中 port 为准） |
| GTS-Play 项目根 | `D:\Github\GTS-Play` |
| E2E runner | `packages/frontend-multiplayer/test/e2e/e2e-runner.cjs` |
| E2E 场景目录 | `packages/frontend-multiplayer/test/e2e/scenarios/regression/` |
