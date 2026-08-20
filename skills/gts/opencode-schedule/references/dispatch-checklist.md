# dispatch 前检查清单(Step 0 / 0.5 / 0.6 / 0.7)

> 主 skill 「2️⃣ Dispatch 流程」拆出(2026-08-20)。4 步检查缺一不可,跳过任一步 = 违规。

---

## Step 0 — 两个渠道合一检查(2026-07-31 起强制)

> **每次 dispatch 前必须同时查 process list 和 OpenCode DB。两个渠道都确认无「相同任务」的 session 才能 dispatch。**

🔴🔴🔴 **检查的是「相同任务」,不是「所有活 session」**:
- 其它任务(不同 title/brief)的活 session **不影响 dispatch**,不用等它、不用停它,直接 dispatch 新任务
- 只有**相同任务**(title 关键词匹配同一功能/同一修复点)的 session 在跑,才不能 dispatch,等它结束或汇报兄弟

⚠️ `process(poll)` 返回 exit 0 不代表 OpenCode server 端 session 已结束(Web UI 可能还在 running)
⚠️ OpenCode DB 有 session 不代表 exec shell 还活着——stale session 的 `time_updated` 仍会变化(by server-side agent)

### Step 0.7 — bot 不做源码改动(2026-08-18 兄弟拍板血泪教训)

> **bot 的模型能力 < OpenCode 模型能力**。任何代码改动/算法修复/复杂分析一律 dispatch OpenCode,**bot 亲手改 .ts/.mjs/.cjs/.tsx/.feature/.steps.ts 等源码文件 = 质量退化,违反纪律**。

**规则**:
1. **源码改动 100% dispatch OpenCode**——即使是改 1 行、加 1 个 console.log、补 1 个判断分支
2. **bot 唯一可做的源码改动**:
   - 写 dispatch brief 到 `.opencode-brief-*.md`
   - process(action=poll) 看进度
   - git commit / git push(在 agent 完成改代码后)
   - 启动 wait 脚本 + kill wait
3. **禁止 bot 自己跑 jest / tsc 验证自己改的代码**——只信 OpenCode 自报 + 独立 grep 实测
4. **agent 在跑 / agent 卡住 → bot 不自己动手**:继续等 / 发「继续」唤醒 / 派 OpenCode 修,不要自己 patch 算法
5. **实测反例**:`Phase Fix-r2` 我打算直接改 cloth-data-rules.mjs 加头饰/手套 damageParts,兄弟立刻制止说"你的模型没 OpenCode 先进"。改 OpenCode-schedule 才是 bot 能做的(改 skill 不算源码改动 = 改文档)
6. **bot 自己能做的源码改动只有** 改 .opencode-brief*.md / 改 .notes / 改 .tmp/ 临时脚本 / 改笔记 .md

**什么时候算「修复太复杂必须 OpenCode」?**——任何改动符合下列任一:
- 涉及多文件协同改动(>1 文件)
- 需要 grep 多个源文件找上下文
- 需要改算法/正则/数学公式
- 改完需要跑测试验证

→ 这种活立即 dispatch,不要自己干

### 实际命令(两个渠道合一)

```powershell
# 🔴🔴🔴 合一检查:必须一起跑,不能只做一个

Write-Host "=== 1️⃣ Exec shell session check ==="
# 通过 process(action=list) 手动检查,看有没有 opencode run 相关的 exec session 还在 running

Write-Host ""
Write-Host "=== 2️⃣ OpenCode Server session check ==="
& "C:\Users\Administrator\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe" db "SELECT id, title, time_created, time_updated FROM session ORDER BY time_created DESC LIMIT 5" --format json 2>$null
```

### 判断表(只看相同任务)

| 渠道 | 相同任务 session 特征 | 下一步 |
|------|----------------|--------|
| 1️⃣ process list | 有 `opencode run` 相关 exec session 在 running 且是**相同任务** | 等它跑完再 dispatch,或汇报兄弟 |
| 2️⃣ OpenCode DB | 最新 session 的 title 与本次任务相同 且 `time_updated` < 30 秒前 | session 还在活跃运行 → 等它 |
| 2️⃣ OpenCode DB | 相同任务 session 的 `time_updated` > 30 秒前但未停 | stale session → 需要停 |
| 2️⃣ OpenCode DB | **没有相同任务** session(其它任务在跑或都结束了) | ✅ 可以 dispatch |

---

## ~~Step 0.3 — 模型可用性预检~~ (已废弃 2026-08-20)

> **兄弟拍板：不需要模型预检。** 直接 dispatch，派完后监控是否出现 rate limit/额度耗尽，命中则 blacklist + 自动轮换。
>
> 模型故障检测改为 **post-dispatch 监控**：wait 脚本退出后查 part 表 data 是否含额度耗尽关键词（`Free usage exceeded` / `exceeded the 5-hour usage quota`），命中则 `dead <model>` + 切下一个 + 重派。详见主 skill「模型故障轮换」节。

---

## Step 0.5 — 根目录 brief 唯一性预检(2026-08-08 新增,多任务并行跑偏教训)

> **dispatch 前必须确认目标 brief 文件是唯一且内容正确的**。多任务并行时根目录会堆多个 `.opencode-brief*.md`(实测达 17 个),`opencode run $brief` 传参在 attach 模式下可能 fallback 读根目录通用 `.opencode-brief.md`,导致 agent 跑偏去改其他任务的 brief/文件。

**实例(2026-08-08 mmd-physics):** impl 和 c2 两次 dispatch 后 session 首条消息显示读的是 bone-reduce/white-line 的 brief(`summary.diffs` 指向别的任务的 `.opencode-brief-*.md`)→ agent 改了其他任务的文件 → 需 session delete 重来。

### 预检步骤(dispatch 前 10 秒)

```powershell
# 1. 列出根目录所有 brief,确认本次要用的文件存在且未被覆盖
Get-ChildItem D:\Github\GTS-Play\.opencode-brief*.md | Select-Object Name, LastWriteTime, Length

# 2. 确认目标 brief 的 LastWriteTime 是最近的(没被其他任务覆盖)
#    - 如果目标 brief 的 mtime 比 dispatch 时间早很多,可能已被别的任务流程覆盖 → 重新写
#    - 通用 `.opencode-brief.md` 在多任务并行时极可能被其他流程覆盖 → 优先用 `.opencode-brief-<task>.md` 隔离

# 3. 用 $brief 变量传参后,在 dispatch 前打印前 3 行确认内容正确
$brief.Substring(0, 200)
```

### 跑偏识别(dispatch 后立即检查)

- session 首条 user 消息的 `summary.diffs` 指向其他任务的 brief 文件 → 🔴 跑偏,`opencode session delete <id>` 重来
- agent 开始改不属于本次任务的 patch → 立即 stop,不要等它改完

### 规则

1. 多任务并行时一律用 `.opencode-brief-<task>.md` 隔离,不用通用 `.opencode-brief.md`
2. dispatch 前校验目标 brief 的 mtime 最近 + 内容头 3 行正确
3. attach 模式下若 CLI 输出异常(session 首条消息 diff 是别的文件),立即 session delete 重新 dispatch

---

## Step 0.6 — 工作区状态预检 + brief 强制项(2026-08-18 XiaHui Phase D 教训)

> **dispatch 前必须确认工作区状态**(尤其是 worktree 分支),且 brief 开头必须强制 agent 先确认再开工**。Agent 凭印象"wt1 没有 B2-2 改动"导致 Phase D 第一轮浪费一轮往返才拉回正轨。

### 预检步骤(dispatch 前 10 秒)

```powershell
# 1. 列出工作区当前状态(必须包含进 brief 作为 agent 强制确认项)
git -C D:\Github\wt1 status --short
git -C D:\Github\wt1 log --oneline -3
git -C D:\Github\wt1 branch --show-current

# 2. brief 开头强制 agent 先跑这一段,禁止从"零假设"起步
```

### brief 强制项模板(写到 brief 开头)

```markdown
## 🔴 工作区状态预检(开工前必须先确认)

执行前先跑:
````powershell
cd D:\Github\wt1
git status --short
git log --oneline -3
git branch --show-current
````

把上述输出写到报告首段,**禁止从"无改动"或"worktree 没有改动"假设起步**。如果发现工作区有非预期的改动(如 wt1 已经有 X 文件 modified),必须先核对是否属于本次任务范围,不属于则停手汇报兄弟。
```

### 跑偏识别(dispatch 后立即检查)

- agent 第一轮 reasoning/text 提到"worktree 没有改动"或"以为 wt1 是干净的" → 立刻发"继续"消息纠正(用 `POST /session/{id}/message`),明示 git log 输出
- session 首条 user 消息的 `summary.diffs` 指向其他任务的 brief 文件 → 🔴 跑偏,`opencode session delete <id>` 重来

---

## 🔴🔴🔴 time_updated 停止 ≠ session 已死(2026-08-17 XiaHui fix4/fix5 实锤教训)

> **教训:** dispatch fix5 前只看到 fix4 的 `time_updated` 停了 12 分钟就断定"已结束",直接开新 session → 兄弟指出 fix4 在 Web UI 还显示 Running——server agent 仍在内存运行,且已越界开始修 gen-mmd-config(与 fix5 撞车改同一批文件)。必须 `opencode session delete` 停掉 fix4 才避免双 session 冲突。
>
> **根因:** `time_updated` 只反映「最后写 DB 的时间」,**server agent 在模型生成/思考/分析阶段可能长时间不写 DB**。CLI exit 0 或 exec 退出同理不代表 server session 结束。

### 开新 session 前确认旧 session 真正死亡(缺一不可)

```powershell
# 1. 查 event 表最后事件类型(关键判据!)
opencode db "SELECT type, substr(CAST(data AS TEXT),1,200) AS preview FROM event WHERE aggregate_id='<旧sessionId>' ORDER BY seq DESC LIMIT 5" --format json
#    - 最后事件是 step-finish reason=stop/completed → ✅ 真完成,可开新
#    - 最后事件是 step-start / tool(read/bash running) / reasoning / text(无 step-finish stop)→ 🔴 agent 还活着,禁止直接开新
#    - 最后事件是 step-finish reason=tool-calls → 🔴 正在处理工具结果,还活着(fix4 就是这个状态)
# 2. 查 Web UI session 状态(兄弟视角)
Invoke-RestMethod -Uri "http://localhost:4098/api/session" -Method Get -TimeoutSec 10 | Select-Object -ExpandProperty data | Where-Object { $_.id -eq '<旧sessionId>' } | Select-Object id, title, @{n='updated';e={$_.time.updated}}
# 3. 有疑问(上述任一信号显示还活着)→ 先走 gts-opencode-stop 停掉旧 session(delete + 15s 复查 + title 零残留三重验证),再开新 session
```

### 判定速查表

| 最后事件 | 结论 | 能否直接开新 session |
|---------|------|:---:|
| `step-finish` reason=`stop`/`completed` | 真完成 | ✅ 可以 |
| `step-finish` reason=`tool-calls` | agent 在处理工具结果,还活着 | 🔴 先停再开 |
| `step-start` / `reasoning` / `text` | 思考/生成中,还活着 | 🔴 先停再开 |
| `tool` state=`running` | 正在执行命令 | 🔴 先停再开 |
| `time_updated` 停了但 Web UI 显示 Running | server agent 内存存活 | 🔴 先停再开 |

> ⚠️ 即使 agent 已「越界」在修超出自己 brief 的内容(如 fix4 自己开始修 gen-mmd-config),也不能放任不管开新的——必须停掉它再开新 session,否则双 agent 抢文件。
> ⚠️ 正确顺序永远是:**先停旧(确认死亡)→ 再开新**。反了就是双 session 冲突。
> ⚠️ 兄弟 2026-08-17 明确纠正:「你在开启新的会话时,要把老会话停掉啊」。

---

## 🔴 相同任务重复 dispatch 检查(核心检查项)

查 DB 时**看最新 session 的 title 和 time_created**,与本次要 dispatch 的任务比对:
- **title 关键词匹配(如都含同一功能名/同一修复点)且 session 还在活跃(time_updated < 30 秒前)** → 🔴 相同任务在跑,**不能 dispatch**,等它结束或汇报兄弟
- title 不匹配 = **其它任务** → **不影响 dispatch**,直接 dispatch 新任务
- 最近 30 分钟内相同任务已 completed → **确认是否真的需要再 dispatch**,而不是用已有结果

### 典型违规场景

- 第一次代码审核跑了但发现 brief 写错了 → 不该 dispatch 第二次审核,而是走 gts-code-review skill 重新执行完整流程
- 如果只需要补修几个问题 → dispatch 修复任务(brief 写「修复审核发现的特定问题」),不是重新 dispatch 整个审核

### 如果发现有相同任务的活 session(任一渠道检出)

| 场景 | 判断 | 操作 |
|------|------|------|
| 是自己 dispatch 的、正在正常跑的同任务 session | 不该停 | 等它结束再 dispatch 新的,或者汇报兄弟 |
| 是之前遗留的 stale session(exec 已退出但 Web UI 还在 running) | ✅ 需要停 | 调度 gts-opencode-stop |
| 跑超时/卡住很久无输出 | ⚠️ 不确定 | 汇报兄弟,让兄弟决定 |
| 是其他 skill 或兄弟手动 dispatch 的同任务 session | 不该停 | 等它结束再 dispatch 新的 |

> ✅ **其它任务的活 session:直接忽略,可以 dispatch 新任务。** 不同任务(不同 brief/不同文件)互不冲突,不用等它结束、不用停它。

### 判断需要停 → 调度 gts-opencode-stop

```
1. gts-opencode-stop skill 会收集信息、确认目标、删 session、杀子进程
2. 停完之后再继续 dispatch 新的
3. 不需要请示兄弟(bot 自己判断即可)
```

---

## 🔴🔴🔴 CLI exit 0 ≠ session 结束(2026-08-05 新增)

- `opencode run` CLI 退出(exit 0)**不代表 server 端 session 结束**——DB 里可能仍有同 title session 记录(server agent 残留/空转),直接二次 dispatch 相同任务 = 2 个同任务 session 并存 → 抢文件冲突
- **重新 dispatch 相同任务前三步预检(缺一不可)**:
  1. 查 DB:`opencode db "SELECT id, title, time_updated FROM session WHERE title='<同任务title>'"`(查全部同 title,不只最新)
  2. 有残留 → `opencode session delete <id>`(FK 约束自动终止 server agent)
  3. 再查确认 time_updated 不再涨 → 才允许重新 dispatch
- **禁止**「CLI exit 0 就认为跑完」直接二次 dispatch 同任务
- 实例:2026-08-05 fix84-review1 第一次 dispatch CLI exit 0 但模型空转未产出 → 直接重 dispatch → DB 2 个同 title session,兄弟指出应先 stop

```powershell
# 在 DB 查询中加 title 检查
$recentSessions = & "...opencode.exe" db "SELECT id, title, time_created, time_updated, completed FROM session ORDER BY time_created DESC LIMIT 3" --format json
# 人工检查:最新 session 的 title 是否跟你准备 dispatch 的任务类型一致?
# 如果已有同类型 session 刚跑完(<30min),先评估能不能用它的结果,而不是无脑 dispatch 新的
```

---

## 🔴🔴🔴 禁止用 `process(kill)` 停 OpenCode

- `process(kill)` 只杀掉本地 CLI 的 `opencode run` 进程,**不杀 server 端 build agent**
- server 端 agent 继续在内存中运行,DB `time_updated` 持续更新
- 被杀后残留的 stale session 会与后面新 dispatch 的 session 冲突,每次踩坑都是这个问题
- 需要停 → 唯一正确路径:走 `gts-opencode-stop` 的 `opencode session delete`
- 删 session 后 FK 约束(`FOREIGN KEY constraint failed`)自动终止 server 端 agent

---

## 🔴🔴🔴 exec 被 kill 后应对(2026-07-29 新增)

> 场景:exec session 因 timeout/工具侧强杀而 failed,但 OpenCode Web UI 端 session 仍在运行。
> 越界动作:bot 看到 process(list) 显示 `completed/failed` 后,不查 DB 直接 re-dispatch → 产生双 session 冲突。

### 处理纪律

| 时机 | 必须做的检查 | 原因 |
|------|-------------|------|
| dispatch 被 kill(exec 返回 `failed` / 超时强杀)后,re-dispatch 前 | ① process(action=list) 查 exec 状态 <br>② OpenCode DB 查最新 session 的 `time_updated` | exec 死 ≠ server session 死。CLI 被 kill 时 server agent 还在 Web UI 上跑 |
| process(list) 显示 OpenCode exec 为 `completed` / `failed` | **仍需查 DB** 确认 Web UI session 已结束 | `exit code 0` 只表示 CLI 正常退出,不表示 server agent 结束 |

### 处理流程

```powershell
if (前一个 dispatch 的 exec session 被 kill / 超时 / failed) {
  ① process(action=list) → 确认没有 OpenCode exec 在 running
  ② DB 查最新 session time_updated
     if (time_updated < 30s 前) → session 还在活跃 → 汇报兄弟
     else if (time_updated > 30s 前但仍在正常结束后的 update window 内) → stale → gts-opencode-stop
     else → session 已正常结束 → 可以 re-dispatch
}
```

### 错误范例

```powershell
# ❌ 错误:exec 被 kill → process(list) 显示 completed → 直接 re-dispatch
process(action=poll) → exec 超时被杀
process(action=list) → good-kelp completed ✓ (以为结束了)
dispatch new → 🔴 双 session 冲突

# ✅ 正确:介于中间的必须查 DB
process(action=poll) → exec 超时被杀
process(action=list) → good-kelp completed
# 再查 DB
opencode db "SELECT time_updated FROM session ORDER BY time_created DESC LIMIT 1"
# time_updated 还在 30 秒前 → stale → gts-opencode-stop → dispatch new
```

### 真实案例(2026-07-31 论坛通知去重 B2)

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
