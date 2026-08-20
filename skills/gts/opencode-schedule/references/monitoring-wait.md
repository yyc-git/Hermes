# 监控规范(wait 主路径 + poll 降级 + exit 码处理)

> 主 skill「4️⃣ 监控步骤」拆出(2026-08-20)。dispatch 后如何盯 session 全在这里,主 skill 只引用。

## 主路径:wait-opencode-session.mjs + Hermes notify

### 决策树(一图流)

```
dispatch (background=true, timeout=0)
    ↓
立刻 DB 拿 sessionId
    ↓
立刻 terminal(background=true, timeout=0, notify_on_complete=true) 启 wait
    ↓
turn 结束 → 兄弟消息随时处理,监控不阻塞
    ↓
Hermes notify 到 → 一次性 process(action=log, offset=-2) + git log -3
    ↓
按 exit code 决策(1 轮 LLM,~1000 tokens)
```

### 2026-08-20 兄弟拍板的核心规则

🔴🔴🔴 **主监控 = `wait-opencode-session.mjs`(exec background 独立进程) + Hermes `notify_on_complete`**:

- `maxWaitMs=5400000`(90min)/ `stableMs=300000`(5min idle)
- 通知到达后**一次性** `process(action=log, offset=-2)` 读最后输出 + `git log -3` → 整轮回复
- **禁止主动轮询**(每轮整轮回复烧 token 无收益)
- 通知丢失时降级:`process(action=log, session_id=<wait_id>, limit=2)` token=0 查 stdout,间隔 **60s**(全自动 **120s**)

兄弟原话「间隔太久了!消耗token大吗?」+ 「不需要告诉我」。

### 为什么从 poll 改成 wait(2026-08-17 血泪数据)

| 路径 | token/天 | 备注 |
|---|---|---|
| OpenClaw 老 poll 每 30s | 240 轮/任务 × N 任务 = **1.6 亿 token/天**($4.76) | poll 触发 bot 整轮对话 + 全量 cacheRead |
| Hermes wait + notify | 0 token 等待 + 通知后**一次性整轮回复 ~1000 tokens** | OpenCode 干活 $0.83,bot 守着几乎 0 |
| 实际干活 | $0.83/天 | wait 不烧 LLM,只有通知到达后那 1 轮 |

### wait 脚本启动命令模板

```powershell
# 🔴 参数单位是**毫秒不是秒**(2026-08-19 实锤)—— 传秒值(如 7200/600)→ maxWaitMs=7200ms < POLL_INTERVAL 30s → 第一次 poll 立即 TIMEOUT 退出
# 正确示例:7200000 (2h) / 600000 (10min)

# 标准模板
node scripts/wait-opencode-session.mjs <sessionId> <maxWaitMs> <stableMs> --exit-on-stuck --title "<任务名>"

# 估算任务时长 × 1.5 给 maxWaitMs;静默阈值对 max 变体调到 3600+(80min)
# 例:estimate 1.5h impl 任务
node scripts/wait-opencode-session.mjs ses_xxx 8100000 600000 --exit-on-stuck --title "mmd-physics-impl"
```

### 退出码处理(通知到达后一次性决策)

| exit code | 含义 | 下一步 |
|---|---|---|
| **0** | 完成(step-finish reason=stop/completed/error) | 验证产物 / 提取报告(`extract-session-text.mjs`) |
| **1** | wait 自身脚本错(非 0/2/3/4 中任一) | 看 wait stdout 报错 |
| **2** | 超时(>maxWaitMs) | 查 DB time_updated:在涨 → 重启 wait 继续等;停了 → 发「继续」 |
| **3** | stuck(time_updated 停 >stableMs,`--exit-on-stuck` 触发) | 查 DB time_updated:在涨(模型生成阶段正常静默)→ 重启 wait(stableMs 调大);停了 → 发「继续」;Pro/max 生成报告阶段静默至少等 80 分钟 |
| **4** | 🔴 LLM 静默失败(wait 脚本内置检测:step-finish reason=unknown + tokens 全 0) | 发「继续」唤醒同一 session(兄弟拍板:不重新 dispatch,不 delete) |

### LLM 静默失败具体处置(exit 4)

```powershell
# 兄弟拍板:不重新 dispatch,不 delete,发「继续」唤醒
opencode run -s <sessionId> -m <原模型> --attach http://localhost:4098 --dir <项目> --no-replay "继续:<待办提示>"
```

🔴 **免费模型场景**:对同一免费模型发「继续」重试 3 次,每次间隔依次 **10s / 30s / 60s**(详见主 skill 顶部模型时段规则)。3 次都无法继续(继续后仍 step-finish unknown / time_updated 停)→ 才确认该模型挂了 → `node scripts/opencode-free-model-state.mjs dead <model>` 落盘 + 用 `get` 拿 current 切下一个(重新 dispatch)。

🔴 **发「继续」用 .mjs 脚本**:PS 5.1 读 UTF-8 无 BOM 中文会乱码报 string terminator 错(xiahui-data-fix-scheme 两次实锤)。

### LLM 静默失败检测三步确认

```powershell
# 1. 查 part 表最后事件 reason + tokens
opencode db "SELECT substr(CAST(data AS TEXT),1,300) FROM event WHERE aggregate_id='<sessionID>' AND type='message.part.updated.1' AND CAST(data AS TEXT) LIKE '%step-finish%' ORDER BY seq DESC LIMIT 1" --format json
# `reason\":\"unknown\"` + `tokens\":{\"input\":0,\"output\":0` + `cost\":0` → ✅ LLM 静默失败
# `reason\":\"stop\"` → 正常完成,收结果

# 2. 查 time_updated(≥10 分钟无更新)
opencode db "SELECT time_updated FROM session WHERE id='<sessionID>'"

# 3. 日志佐证(可选)
Get-Content "$env:USERPROFILE\.local\share\opencode\log\opencode.log" -Tail 8000 | Select-String -Pattern "exiting loop" | Select-Object -Last 3
```

LLM 静默失败 → ① 走 gts-opencode-stop 停掉该 session → ② 汇报兄弟(附证据)→ ③ 重新 dispatch 同一 brief(新 session)

⚠️ 区别于「CLI exit 0 + 无 step-finish + 零改动 = 存疑需兄弟确认」:LLM 静默失败有明确的证据,兄弟已授权直接 stop + 重 dispatch。

### 静默失败预防

1. Clash 保持 rule 模式(global 模式下 opencode-go API 绕代理,代理抖动 = LLM 断流;2026-08-02 实测断流时 Clash 恰为 global)
2. 长任务拆小 session(<30min)
3. brief 要求 agent 小步落盘(每完成探针/断言就写文件,断了不丢进度)
4. 断了别慌:Web UI「继续」是恢复机制(兄弟点继续后 session time_updated 恢复增长)

---

## dispatch 后标准流程(铁律,2026-08-14 兄弟连 3 次质问后定稿)

```typescript
// 0️⃣ 🔴🔴🔴 铁律:dispatch 后必须立即启动 wait 脚本盯进展,不能等结果
//    dispatch(exec background, timeout=0) → 拿 sessionId → 立即 exec(background=true, timeout=0) 启动 wait 脚本
//    兄弟问「怎么样了」时用 process(log) 读脚本 stdout(最后事件类型/idle 秒数),秒答,不经过 LLM
// 1️⃣ dispatch:exec(background=true, timeout=0) 跑 opencode run(attach 模式)
// 2️⃣ 拿 sessionId:opencode db "SELECT id FROM session WHERE title='<title>' ORDER BY time_created DESC LIMIT 1"
// 3️⃣ 启动主监控(🔴 立即,不等 completion event):
node scripts/wait-opencode-session.mjs <sessionId> <maxWaitMs> <stableMs> --exit-on-stuck --title "<任务名>"
// 4️⃣ 等待期间:turn 结束,等脚本退出(自动 wake)。兄弟消息随时处理,与监控互不干扰
// 5️⃣ 脚本退出码处理(退出后一次性决策,1 轮 LLM):
//    exit 0 = 完成 → 验证产物 / 提取报告
//    exit 4 = LLM 静默失败 → 发「继续」(免费模型 3 次重试,见主 skill 顶部)
//    exit 2 = 超时 → 查 DB 在涨? 继续等 : 发「继续」
//    exit 3 = stuck → 查 DB 在涨? 重启 wait(idle 阈值调大) : 发「继续」;Pro/max 静默至少等 80 分钟
// 6️⃣ 需要实时看 agent 输出/发现异常时:poll 辅助(单次 ≤30000,挂起即弃),CLI exit 0 ≠ agent 停止
```

---

## 🔴🔴 wait exit ≠ session 卡死(2026-08-19 实锤,prop-modal-fix impl 复盘)

wait-opencode-session.mjs 默认 `maxWaitMs=3600000`(1h)→ 满 1h exit 1(TIMEOUT)→ bot 收到通知认为「还在跑」,**但 session 可能早已 step-finish stop**(impl 案例:actual session 在 4:22 stop,wait 在 5:22 才 timeout 退出,期间 bot 没主动核对)

**免费模型额度耗尽的信号**:`> Free usage exceeded, subscribe to Go`(flash-free 输出)→ 不是卡死,是模型正常收尾报「额度没了」;CLI 会继续等收尾消息但**实际 session 已 stop**

### 判定三步(收到 wait exit/timeout 后必跑,不能凭「上一条说还在跑」推断当前状态)

```powershell
# 1. 查 part 表最后事件
opencode db "SELECT substr(CAST(data AS TEXT),1,300) FROM part WHERE session_id='<sid>' ORDER BY time_updated DESC LIMIT 1" --format json
#   - data 含 '\"reason\":\"stop\"' 或 '\"reason\":\"completed\"' → ✅ 真完成 → 收产物汇报
#   - data 含 '\"reason\":\"unknown\"' + tokens=0 + cost=0 → LLM 静默失败 → 走 LLM 静默失败 SOP
#   - data 含 '\"reason\":\"tool-calls\"' 或 '\"reason\":\"running\"' → agent 还在跑 → 重启 wait 继续等

# 2. 查 git log(确认 agent 是否 commit 了产物)
git -C D:\Github\<wt> log --oneline -3
#   - 新 commit hash 出现 → agent 已交付
#   - 无新 commit → 看 part 表是否有 step-finish stop(可能写了文件没 commit)

# 3. 看目标文件是否修改(绕过 commit 检查)
Get-Item D:\Github\<wt>\<目标文件> | Select-Object LastWriteTime
```

brother 原话(2026-08-19):「这个早就跑完了吧?你怎么没检查」—— wait timeout/通知不构成「还在跑」的判定依据,**必须重新查 DB + git log**

**预防**:wait 启动时设置合理 `maxWaitMs`(预估 1.5x);即使超时也不要立刻 kill CLI(session 仍在收尾),先查 part 表

---

## 🔴 禁止因安静时间判「卡住」

连续若干次查 stdout 无新输出 ≠ OpenCode 卡住。

- Flash 可能在运行 E2E 测试(浏览器、网络等),长时间无 shell 输出正常
- Pro 分析也可能数分钟无输出
- **`--variant max` 模型(Pro Max / GLM Max / Sol Max)生成报告阶段可能 15-30+ 分钟无任何 shell 输出** — 这是正常的,不能判卡住

### 判断是否真的卡住(单次 → 立刻决策)

1. `process(action=log, session_id=<wait_id>, limit=2)` 看 wait stdout(60s 间隔,token=0)
2. 看 stdout 显示 idle 秒数:超过 idle 阈值 + DB time_updated 不涨 → 真的卡
3. 看 stdout 显示 `step-finish reason=stop` → 已完成

### 不确定 → 汇报兄弟,绝对不擅自停

- ⚠️ **真的需要停 → 必须走 `gts-opencode-stop` skill**(先 `opencode session delete` 再杀残留子进程),**禁止用 `process(kill)`** 直接杀 exec session
- `process(kill)` 只杀掉 shell,不杀 Web UI 端的 session,造成 stale session 残留 → 下次 dispatch 会冲突

---

## 🔴 time_updated 停止 ≠ 卡住,先查 event 表区分「已完成」vs「卡住」(2026-08-01 踩坑)

### 踩坑实例

实现 session 实际 09:14 已跑完(`step-finish: stop`),但我盯着 `time_updated` 一直空等到 09:21 才确认,白等 7+ 分钟,被兄弟批评

### 根因

session **正常完成时 time_updated 同样会停止**(不再更新),「time_updated 停了」既可能是卡死也可能是跑完,仅凭它无法区分

### 正确做法

当 `time_updated` 停止推进时,先查 event 表最后几条事件,看是否含完成标志:

```powershell
opencode db "SELECT type, substr(data,1,250) AS preview FROM event WHERE aggregate_id='<sessionID>' ORDER BY seq DESC LIMIT 3" --format json
```

- 出现 `message.part.updated.1` 且 data 含 `\"type\":\"step-finish\"` + `\"reason\":\"stop\"` → **session 已跑完**,立即收集产出汇报,**不要再等**
- 最后事件是 `tool` 且 `state.status: running` 长时间(>20 分钟)不动 → 才可能是卡住
- 最后事件是 `text` 输出 → 可能还在生成/接近完成,短等再查

### 另一个坑:查询 session 必须带 WHERE id

不要用 `ORDER BY time_created DESC LIMIT 1` 取最新——并行任务(如 RCL Explore、nf-Colyseus)的 session 会插队,导致查到别人的 time_updated 误判自己的 session「还在活跃」

```powershell
# ✅ 正确:按自己 dispatch 拿到的 sessionID 查
opencode db "SELECT time_updated FROM session WHERE id='<sessionID>'" --format json
opencode db "SELECT MAX(seq) AS max_seq FROM event WHERE aggregate_id='<sessionID>'" --format json
# ❌ 错误:ORDER BY time_created DESC LIMIT 1 会拿到并行任务的最新 session
```

---

## 🔴🔴🔴 time_updated 停 1 分钟以上 → 发「继续」信息唤醒(2026-08-11 兄弟定稿)

> **规则:** 监控中如果 `time_updated` 停止推进 **≥1 分钟**,不要干等,立即向该 session 发「继续」信息让它继续干活

```powershell
# 1. 发「继续」(🔴 -m 必须与原 dispatch 相同模型,详见 session-lifecycle.md)
opencode run -s <sessionID> -m <原模型> --attach http://localhost:4098 --dir <项目> --no-replay "继续执行任务..."
#    必须 --attach + --no-replay,否则新建 session 或重读全部上下文

# 2. 后台跑:exec background=true + timeout=0(发消息 CLI 可能很快退出,server agent 收到消息继续干活)

# 3. 发送后继续用 DB `time_updated` 监控:恢复增长 → 正常;仍停 → 再按 event 表/静默失败流程判断
```

**原理:** 部分静默不是卡死,agent 停在等输入/等超时恢复;发信息能唤醒它继续

**适用范围:** 一切 poll 监控场景(Flash/Pro/GLM 等),不限于 max 模型;区别于 max 模型 80 分钟静默容忍(那是模型本身生成阶段长),普通静默 1 分钟就该唤醒

### ⚠️ 发「继续」前必须核对 session ID(2026-08-11 两次误发教训)

- **相续任务例外(2026-08-17 兄弟拍板)**:新任务与旧任务同链(同 issue/同功能后续)→ 主动对旧 session 发「继续」续接是**推荐做法**(详见 session-lifecycle.md 2.6️⃣),不属于误发;误发仅指发到**别的任务链**的 session
- 发消息前查 `opencode db "SELECT id, title, time_updated FROM session WHERE id='<sessionID>'" --format json` 确认 title 匹配当前任务
- **禁止对已完成 session 发「继续」**:已完成 session(event 末尾 step-finish reason=stop)收到 user 消息会被**重新唤醒**(time_updated 重新开始增长)→ 可能双 agent 冲突改同一批文件;误发后立即 `opencode session delete <id>` 终止

---

## poll 降级辅助(盯进展 + 发现异常,防挂)

> 🔴🔴🔴 **2026-08-20 主路径用 wait + Hermes notify,poll 只在以下情况用**:
> ① 看 wait 脚本 stdout(用 `process(action=log, session_id=<wait_id>, limit=2)`,token=0);② 实时看 agent 输出 / 发现异常(单次 ≤30s,挂起即弃)。

**禁用轮询场景**(每轮 token 烧飞):
- 看 agent 是否完成 → 用 wait 通知,不用 poll 一直问
- 出错复盘 → 直接 `process(action=log, offset=-2)` 看最后日志
- 兄弟问进度 → `process(action=log, session_id=<wait_id>, limit=2)` 一秒答

### 历史(追溯用,均已取代)

- 2026-08-15 拍板「poll 直连主路径、不用 wait 脚本」→ 2026-08-17 被取代(poll 每轮烧 LLM 轮次的根因)
- 2026-08-14 15:50 poll「挂起」:不是 poll 工具挂,是 wait 脚本完成判定 bug(已修:part 表扫描替代 event 最近 6 条)

### poll 用法(仅实时看输出用)

```typescript
// 每轮 poll:timeout ≤ 30000,挂起/报错 → 立即放弃(不等它),改用 DB 查询
process(action=poll)  // 单次 ≤30s
// poll 挂起或 aborted ≠ 任务断 → opencode db 查 time_updated 确认真实状态
// CLI exit 0 后(attach 模式)→ DB time_updated 轮询:涨=活跃;停 300s → 查 part 表末尾
//    → 发「继续」唤醒(见 session-lifecycle.md "发继续")
// session 已 done(step-finish stop)后禁止再 poll——直接 extract-session-text.mjs 提取结果
```

### 状态决策表

| 信号 | 判断 | 下一步 |
|-----------|------|--------|
| poll 到 CLI exit 0 + DB step-finish reason=stop | 完成 | 提取最终 text 汇报。dispatch 新任务前 `process(action=list)` 确认 |
| poll 到 agent 输出/事件(step-start/tool/reasoning) | 进行中 | 继续 poll(≤30s 每轮) |
| CLI exit 0 + time_updated 持续涨 | server agent 活跃 | 转 DB 轮询继续等 |
| DB time_updated 停 300s+ | 可能卡住 | 查 part 表末尾(step-finish?)→ 完成则收结果;真卡住 → 发「继续」 |
| poll/exec 报错(timed out / aborted) | 窗口坏 ≠ 任务断 | **不慌**:DB 查 time_updated 或 `wait-opencode-session.mjs --check <id>` 查真实状态 |
| **Aborted / exit 0 但无总结输出** | 不确定 | **先查 DB 确认 server session 是否还在工作**(2026-08-01 踩坑:Flash CLI 显示 "This operation was aborted" + exit 0,实际 server agent 继续跑了 20 分钟)。查 `SELECT time_updated FROM session WHERE id='<sessionID>'` + event 表最后几条 → DB 轮询继续等;time_updated 停了 → 查 event 末尾按 time_updated 停止流程判定 |
| **CLI exit 0 + event 无 step-finish + 目标文件零改动** | **存疑(不是死亡判定)** | **禁止自行重 dispatch!** 先汇报兄弟 + 附证据(time_updated 停滞时长、event 表最后事件、文件改动情况),**等兄弟确认后才可重 dispatch**(2026-08-01 兄弟明确纠正) |

---

## CLI/exec exit 0 ≠ fully done

- **exec/wait 脚本退出 ≠ OpenCode session 结束**(2026-08-14 实锤:wait 脚本 18m11s completed,但 poll 窗口挂到 25 分钟后才显示)
- **exec shell 可能在 OpenCode cleanup/discard 阶段前就退出了**,Web UI 上 session 可能还在 `Running`
- **同样注意 `Aborted` 场景**(2026-08-01):CLI 显示 `This operation was aborted` / `Error: Aborted` 但 `exit 0`,此时 **server agent 大概率仍在内存中继续工作**。**不能当任务失败处理,更不能重新 dispatch**
- **Aborted 后的正确做法**:用 DB 轮询监控 server session(time_updated 是否继续推进 + part 表最后类型);最后从 part 表提取 text 总结(extract-session-text.mjs)
- **dispatch 下一个 OpenCode 前必须 `process(action=list)` 确认**:
  - 若**相同任务**的 session 还在 Running → **不能 dispatch**,继续等
  - 若相同任务 session 已 completed/failed,或只有其它任务的 session → 可以 dispatch 新的
- 2026-07-28 踩坑:Pro 审核 poll 拿到 exit 0 + 完整报告 → 以为完了 → dispatch fix 任务 → 兄弟发现前一个还在 Web UI 跑着 → 手动结束了

### 结果提取(硬性上限 offset=-5)

```typescript
process(action=log, sessionId=<sessionId>, offset=-5)  // log 工具可靠,可用
// 或从 DB event 表提取最终 text:node scripts/extract-session-text.mjs <sessionId>
```

- 关键信息(测试结果、最终结论)在日志最后 3-5 行
- 如果 -5 不够 → 按需 -10 但需人工确认(汇报时说明原因)
- 优先 offset=-2 → 不满足才 -5 → **绝不 -10 起步**
