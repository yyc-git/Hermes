---
name: "gts-notify-boundary"
description: "notify.ps1 桌面通知的精确边界:什么时候发、什么时候不发。兄弟 2026-08-18 二次校准(开干已知任务 / 完成汇报 不发,仅需拍板时发)。同步 desktop-notify-protocol 的\"何时不发\"那一面。"
status: "active"
trigger: "bot 准备调 notify.ps1 之前必读。兄弟质问 '怎么又发了' / '不用通知' 时必查。"
created: "2026-08-18"
umbrella: false
---

# gts-notify-boundary

> 来源:兄弟 2026-08-18 两次抓 bot "开干前通知"和"完成通知"多余
> 继承自: `gts-auto` Phase S 必发通知(已有规则)+ 本轮二次校准
> 关联: `desktop-notify-protocol` skill(发的方式)+ 本 skill(发的时机)

---

## 三分法(发 / 不发 / 看情境)

### ✅ 发(`notify.ps1` 必须调)

| 场景 | 理由 |
|---|---|
| 阻塞 / 资源申请 / 不可逆操作 | 兄弟必须显式拍才动 |
| **agent 自报"完成"且涉及 git 操作(commit/merge/push/rebase)** | **不可逆**(2026-08-20 实锤:C 任务 agent 跑完 34/34 + tsc 零错误,bot 只在 chat 写"等你拍板",兄弟没看到 → 「需要我拍板为什么不发msg通知啊？？？？？」) |
| **session 静默挂掉或工作区有变化但未 commit** | **等兄弟拍续派决策**(2026-08-20 实锤:A v1/D v1 静默挂,bot 自作主张重派没通知) |
| 方案选 A/B/C 多选一 | 兄弟要拍 |
| 改 config / 装依赖 / restart server | 影响系统状态 |
| 删文件 / git restore / git reset | 不可逆 |
| dispatch 跨模型 / 跨任务 | 跨边界,代价高 |
| merge wt→dev 冲突 / dev 工作区脏 | 自动化阻塞 |
| push 权限阻塞 / 4098 死了需手动起 | 基础设施阻塞 |
| M 阶段(手动测试)准备好待兄弟操作 | 兄弟要操作 |
| **任何其他"等你拍板"状态** | 一律先 notify,不允许只发对话(2026-08-20 兄弟拍桌后铁律) |

### 🔴 致命边界(2026-08-20 兄弟拍桌实锤): chat 等你 ≠ notify.ps1

> **兄弟原话(2026-08-20)**:「需要我拍板为什么不发msg通知啊？？？？？」——C 任务 agent 跑完 34/34 测试通过、tsc 零错误,代码改动在工作区,我在 chat 里写了"等你拍板 commit",**没有调 notify.ps1**,兄弟没看到卡点。

**铁律**:**chat 是异步对话流,notify.ps1 是桌面弹窗即时触达**。任何**触达兄弟决策**的节点(commit/merge/rebase/retry/relaunch/选 worktree/选模型/M 阶段),"chat 里说"**不算通知**,必须 `notify.ps1` 弹窗:

```powershell
# 标准调用
powershell -NoProfile -ExecutionPolicy Bypass -File D:\Github\GTS-Play\scripts\notify.ps1 "<消息>" 120 "<标题>"

# 消息模板(2026-08-20 兄弟拍板版)
# 1) 开头明确"等你拍板 <事项>"
# 2) 列出待决策清单(改了什么 + 等什么操作)
# 3) 列出后台活跃 session 状态(兄弟可知道哪些仍在跑)
```

**反例**:
- ❌ "C 任务完成,等你拍板 commit" → 只在 chat 写
- ✅ "C 任务完成,等你拍板 commit" → notify.ps1 弹窗 + 同时在 chat 写

### ❌ 不发(只 chat 汇报)

| 场景 | 理由 |
|---|---|
| 开干已知任务(兄弟说 "ok" / "干" / 1/2/3 ok) | 已知开始,通知多余 |
| **派工后立即告诉兄弟"在跑"**(OpenCode dispatch 后 / Hermes 通知到达前主动说 "已 dispatch,sessionId=X,模型=Y,请稍等") | **2026-08-20 兄弟原话「不需要告诉我」 — 不发**,等 Hermes `notify_on_complete` 自动通知到达再说 |
| **主动轮询 wait 脚本每 5-10 分钟整轮回复"还在跑"** | **2026-08-20 兄弟原话「间隔太久了!消耗token大吗?」 — 不发**,整轮回复烧 token 无收益;要么 Hermes 通知机制自己驱动,要么用 `process(action=log, limit=2)` token=0 工具调用查 stdout(60s 间隔,全自动 120s) |
| 完成汇报(任务跑完 / 写完 / 改完) | 兄弟看 chat 就知道 |
| 跑脚本 / 读文件 / grep | 内部操作 |
| 提新方案 / 列选项给兄弟看 | chat 就能看 |
| 兄弟自己撤回的事 | 已结束 |

### 🔴 session 静默挂/挂掉假阳性的 notify 边界(2026-08-20 实测)

> 本会话 bot 误把 A v2 session 判为"静默挂"（last message `tokens.total=0` + `finish=不存在`），差点发 notify 说"A v2 挂了 + 重派 v3"。**兄弟拍桌："A v2 在跑啊！"**——DB `time_updated` 显示仍在跑，bot 误判。

**避免误通知的硬规则**：

1. **判定 session 死之前必查 DB `time_updated`**（不是看 tokens/finish）：
   ```
   session.time_updated > now-600000   → 活跃，不发任何 notify（哪怕看起来像挂）
   session.time_updated < now-1800000  → 真死，可以发 notify + 走 gts-opencode-stop
   ```
2. **last message 被截断可能 `tokens.total=0`**——这只是"这一条消息输出为空"，不等于 session 死
3. **`finish=tool-calls` 是 agent 调工具的正常 finish 状态**——agent 还在跑
4. **wait 脚本 `idle ≥ stableMs` 退出 ≠ session 死**——可能 agent 思考阶段静默，重启 wait 继续等

**不要基于错误判断发 notify**：
- ❌ "A v2 静默挂, 我已删, 改 volcark flash 重派 v3" → 实际 A v2 在跑
- ❌ "flash-free 今日不可靠, 我加 blacklist" → 实际是不同任务的偶发,模型本身可用
- ❌ "session 死, 我先 gts-opencode-stop" → 实际是 wait idle 退出 + agent 在跑

**判定真死后发 notify 的标准内容**：
- 必含 "DB time_updated < now-1800000 + 同 session 3 次「继续」失败" 的实测依据
- 必含 "具体错误码"（rate limit / 429 / Insufficient balance / 401 / 5xx）或 "agent 从未启动 part 表只剩 brief 回显" 的硬证据
- **不**含"我看了 last message tokens.total=0 所以挂了"这种基于表面特征的判断

### 🟡 看情境

| 场景 | 判断 |
|---|---|
| 长时间任务进度(> 5 min) | **不发**;完成后一次性发 |
| 失败 / 错误 / 异常 | **发**(兄弟要知道) |
| 需要兄弟确认又可以自己选一个干的 | **发** + 给默认 |
| 兄弟睡着/忙碌 | **发** + 桌面 + msg 双通道 |

---

## 关键边界(兄弟本轮明确)

> 开干前不要发通知啊,而是需要我确认的时候才发通知

**Bot 易踩的坑**:
- "我要开干了 3 件套" → **多余通知**(已知任务)
- "3 件套完成" → **多余通知**(完成汇报)
- "Holographic 跑不了,3 选 1" → **该发**(真阻塞)
- "已 commit `9151e22c3`" → **多余通知**(完成汇报,chat 即可)

### 2026-08-20 新坑(Hermes 通知 + OpenCode 派工联动)

兄弟两次纠正同一根因:**把 Hermes `process(action=log)` 工具调用的 token 消耗 = 0 和 OpenClaw 老 poll 每轮触发 bot 整轮对话烧 2 亿+ token 搞混了**,过度保守:

- ❌ "派工后主动告诉兄弟"在跑" → 兄弟原话「不需要告诉我」
- ❌ "派工后每 5-10 分钟轮询 + 整轮回复" → 兄弟原话「间隔太久了!消耗token大吗?」
- ✅ 派工后**静默**,等 Hermes `notify_on_complete` 自动通知 → 一次性 `process(action=log, offset=-2)` + `git log -3` → 整轮回复(这是合理时机)
- ✅ 通知丢失/不可靠时 `process(action=log, session_id=<wait_id>, limit=2)` 看 stdout → **token = 0**(纯工具调用,不等同 OpenClaw 老 poll)→ 兄弟拍板间隔 60s(全自动 120s)

**核心区别**:
- `process(action=log)` / `process(action=list)` / `terminal` / `read_file` / `search_files` 等**纯工具调用 = token 0**
- 触发 bot **整轮对话回复**才烧 token(每轮 ~1000 token 起,跟对话长度相关)
- 之前老 OpenClaw poll 把"工具调用"和"触发整轮回复"绑死了,所以每 30s 烧 2 亿 — Hermes 这层已经拆开,工具调用 0 token

**判断口诀**:
- 兄弟需要 **拍** / **选** / **给资源** → 发
- 兄弟已经 **批** / **知** / **看 chat 就够** → 不发
- "全自动" 模式 → **跳业务确认,但基础设施阻塞必发**(gts-auto 已落)

---

## 与 desktop-notify-protocol 关系

- `desktop-notify-protocol`:**怎么发**(notify.ps1 调用 / PowerShell & 坑 / 双机路径 / 兄弟通道)
- `gts-notify-boundary`:**何时发 / 不发**(本 skill)

**两个 skill 互补**:发 → 读 desktop-notify-protocol;发不发的判断 → 读本 skill。

---

## 实战对照(本轮)

| 时刻 | 应否 | 实际 |
|---|---|---|
| "Holographic 不可行,3 选 1" | ✅ | ✅ 已发 |
| "CLI vs Desktop 选 1" | ✅ | ✅ 已发 |
| "gts-memory-search 开干三件套" 开头 | ❌ | ❌ 错了 |
| "三件套完成" 结尾 | ❌ | ❌ 错了 |
| "Holographic 那份拷过来" | ✅ (不可逆) | ✅ 已发 |
| "B 方案动手前需拍 2 细节" | ✅ (歧义) | ✅ 已发 |
| "我按 1.b+2.iii 先动手" | ✅ (推测+不可逆) | ✅ 已发 |

**错 2 次,记 daily,本 skill 沉淀**。
