---
name: "opencode-schedule"
description: "OpenCode 调度协议入口。bot 调度 OpenCode 的铁规集合,被 gts-dev-workflow / gts-dev-fix / gts-dev-feat / gts-dev-refactor / gts-code-review 等 skill 引用。dispatch 前必 load 本 skill + 相关 reference。"
---

# opencode-schedule — OpenCode 调度协议(2026-08-20 拆分瘦身后)

> **入口 skill。** 所有调度 OpenCode 的 skill 统一引用本协议。**不可单独使用**,只能被 gts-dev-workflow / gts-dev-fix / gts-dev-feat / gts-dev-refactor / gts-code-review 等 skill 引用(gts-analysis 已于 2026-08-16 归档至 skills-archive/)。
>
> 拆分结构:
> - 本文件:模型时段元规则 + Hermes 工具适配 + 调度铁规 + 模型速查(精简,常驻)
> - `references/brief-template.md` — brief 模板与必填项
> - `references/dispatch-checklist.md` — dispatch 前 4 步检查(Step 0/0.5/0.6/0.7)+ stale/Aborted/socket 崩溃处理
> - `references/session-lifecycle.md` — 2.5 追加消息 / 2.6 相续续接 / permission 卡 / post-poll state 钩子
> - `references/monitoring-wait.md` — wait 主路径 + 退出码处理 + poll 降级 + LLM 静默失败
>
> **load 策略**:常驻 load 主 skill;dispatch 前按需 load 1-2 个 reference;监控 session 出岔子才 load monitoring-wait。

---

## ⚡ 顶部铁规(必背,模型时段+免费组故障轮换)

> 🔴🔴🔴 **模型选择按北京时间时段(2026-08-18 兄弟拍板,2026-08-18 增补火山 coding plan,2026-08-18 定稿:火山优先级 > go 套餐,go 是兜底)**:
> - **免费时段 9:00-12:00 / 14:00-18:00 → 免费模型组优先**(见下 6️⃣ 速查)
> - **其余时段 → 火山 coding plan 优先**:`volcark/deepseek-v4-flash-ga-260731`(普通)/ `volcark/deepseek-v4-pro-ga-260813`(复杂)
> - **Pro 任务优先级**:火山 pro → 小米 pro (`xiaomi-token-plan/mimo-v2.5-pro`)→ go pro,三个都挂才汇报兄弟;**pro 场合绝不降级免费模型顶替**
> - **简单代码审核/简单方案仍走 Flash**(2026-08-17 兄弟拍板);兄弟指定模型时按兄弟说的执行

🔴🔴🔴 **整体优先级(火山 > 小米 > go = 兜底)**:

1. **免费时段 → 免费模型组**(见下故障轮换)
2. **火山 coding plan**(免费组全挂/额度用完,或非免费时段默认)
   - 普通:`volcark/deepseek-v4-flash-ga-260731`
   - 重活:`volcark/deepseek-v4-pro-ga-260813`
3. **小米 token plan**(火山 pro 不可用/余额不足时):`xiaomi-token-plan/mimo-v2.5-pro`(2026-08-19 增补)
4. **go 套餐 = 兜底**(免费组+火山组全部不可用才用):`opencode-go/deepseek-v4-flash` / `opencode-go/deepseek-v4-pro`

🔴 **go 套餐余额不足(2026-08-17 实锤)**:连续 5 次 Insufficient balance → 回退免费组(免费时段)或通知兄弟

🔴🔴🔴 **模型故障轮换(2026-08-20 扩展:免费组+火山组统一 blacklist)**:

> **不需要模型预检**——dispatch 前不做 smoke test/连通性测试,直接派。派完后监控是否出现 rate limit/额度耗尽,命中则 blacklist + 自动轮换。

- **dispatch 前必须先读状态**:`node scripts/opencode-free-model-state.mjs get --dir D:\\Github\\GTS-Play` → 用 `current`(跳过 blacklist 里的已挂模型,不用现场试)
- **当前模型异常 → 先对同一模型发「继续」重试 3 次**(间隔依次 10s / 30s / 60s)→ 3 次都无法继续 + 明确报错(rate limit/429/401/5xx 持续)→ 才确认挂
- **挂的判定以明确报错为准**：`step-finish reason=\"unknown\"` 不算挂（删会话重开继续用同模型）；明确报 rate limit/429/quota/401/5xx + 继续不了 → `dead` 落盘 + 换组内下一个
- **🔴🔴 额度耗尽关键词（必须识别，查 part 表 data）**：
  - 免费模型：`Free usage exceeded, subscribe to Go`
  - **火山模型：`You have exceeded the 5-hour usage quota. It will reset at`**（兄弟拍板：火山 5h 限流走同样 blacklist 机制）
  - 命中任一 → 立即 dead + 切下一个 + 重新 dispatch（不问兄弟）
- **🔴🔴🔴 额度耗尽是硬信号,立即 dead + 切下一个**:不是「3 次继续失败」那种瞬时故障,是额度真的没了 → ① 立即 `dead <model>` ② `get` 拿 current(自动前进)③ 重新 dispatch 同 brief 用新模型。**不等 3 次继续**
- **🔴🔴🔴 火山模型 5h 限流自动轮换**:
  - 火山模型报 `You have exceeded the 5-hour usage quota` → 立即 `dead <volcark-model>`(TTL=5h,5h 后自动恢复)
  - `get` 自动前进:火山组内下一个(flash→pro) → 免费组(免费时段) → go 兜底
  - 5h 内所有火山模型都限流 → 降级到免费组(免费时段)或 go 兜底(非免费时段)
  - **不需要问兄弟**——5h 限流是确定性故障,自动轮换即可
- **挂/恢复命令**:
  ```powershell
  # 死(立即落盘 blacklist + current 前进)
  # 免费模型:18h 后自动恢复
  node scripts/opencode-free-model-state.mjs dead <model> --dir D:\\Github\\GTS-Play
  # 火山模型:5h 后自动恢复(同命令,脚本根据模型名自动判断 TTL)
  node scripts/opencode-free-model-state.mjs dead volcark/deepseek-v4-flash-ga-260731 --dir D:\\Github\\GTS-Play
  # 恢复(实测可用)
  node scripts/opencode-free-model-state.mjs revive <model> --dir D:\\Github\\GTS-Play
  # 一键恢复全部
  node scripts/opencode-free-model-state.mjs revive-all --dir D:\\Github\\GTS-Play
  # 手动指定
  node scripts/opencode-free-model-state.mjs set <model> --dir D:\\Github\\GTS-Play
  ```
- 存储位置:`.opencode-session-meta/free-model-state.json`(与 session-meta 同目录)
- 🔴 文件是权威状态:调度时**不要凭记忆/现场测试**猜模型,一律 `get` 读文件
- **🔴 误判恢复**:被记「挂」的模型一旦实测可用(新会话跑通)→ `revive` 恢复
- 免费组+火山组全部不可用才允许 go 套餐兜底

🔴 **简单任务(单模块、不跨包、无性能安全约束)用 Flash 一刀切(先写 specs 再写代码)**,不上 Pro 浪费额度

⚠️ 一刀切 ≠ 跳过 specs。同一轮 dispatch 也必须**先产出 Delta Specs 文件,再写业务代码**,不能混在一起写(specs 路径:`笔记/项目文档/changes/<日期>-<功能名>/specs/`)

---

## 0️⃣ Hermes 环境适配(2026-08-17 OpenClaw → Hermes 迁移)

> 本 skill 从 OpenClaw 迁移。**OpenCode 侧的一切(CLI 命令、DB 查询、模型名、dispatch 参数、attach 4098)完全不变**。以下仅适配「bot 用哪个工具执行」——把 OpenClaw 工具名替换为 Hermes 工具:

| OpenClaw 写法 | Hermes 实际执行 |
|---|---|
| `exec(background=true, timeout=0)` | `terminal(background=true)`(后台无超时) |
| `process(action=poll)` / `process(action=list)` / `process(action=log, sessionId=...)` | `process(action=poll)`(Hermes terminal 内置,按 session_id 查后台进程) |
| `sessions_spawn` | `delegate_task`(**仍然禁止使用**,规则不变) |
| `read` / `edit` 工具 | `read_file` / `patch`、`write_file` |
| `memory_search` | `gts-memory-search` 技能(三级检索协议)/ `session_search` |
| `msg *` / `notify.ps1` 桌面通知 | Hermes 无同款;等确认时直接提醒,桌面通知待配置 |
| `opencode db ...` | 直接 `opencode db ...`(CLI 已在 PATH,无需完整路径) |

**脚本路径**(已复制到项目 `D:\Github\GTS-Play\scripts\`,不再依赖 .openclaw):

```powershell
# 主监控(与 wait 脚本设计一致:等待期间 LLM 空闲,完成才通知)
# 用 terminal(background=true, notify_on_complete=true) 启动,退出即通知:
node scripts/wait-opencode-session.mjs <sessionId> <maxWaitMs> <stableMs> --exit-on-stuck --title "<任务名>"
# 🔴 参数单位是**毫秒不是秒**(2026-08-19 实锤)—— 传秒值(如 7200/600)→ maxWaitMs=7200ms < POLL_INTERVAL 30s → 第一次 poll 立即 TIMEOUT 退出
# 正确示例:maxWaitMs=7200000 (2h) / stableMs=600000 (10min)

# 提取结果(exit 0 = 完成 step-finish stop 后)
node scripts/extract-session-text.mjs <sessionId>
node scripts/extract-opencode-report.cjs <sessionId>

# skill-exec 框架(状态追踪,项目内运行)
node scripts/skill-exec-manager.cjs <command> ...
```

**Hermes 版监控主路径**:dispatch 用 `terminal(background=true)` → 查 DB 拿 sessionId → 立即用 `terminal(background=true, notify_on_complete=true)` 启动 wait 脚本 → turn 结束等通知(等待期间 LLM 完全空闲)→ 通知到达后按退出码处理(0=完成读报告 / 2=超时 / 3=stuck,查 DB time_updated 决定重启 wait 或发「继续」)。详见 `references/monitoring-wait.md`。

---

## 调度流程(精简版,dispatch 前必看)

### dispatch 标准命令(2026-08-19 实测验证模板)

```powershell
cd D:\Github\<worktree>

# 🔴 必须用 --file flag + 简短 message 引用(规避 PowerShell `$brief` positional + yargs 拆参数 静默失败)
# 详见 references/brief-template.md

opencode run "请按 brief 执行:打开 .opencode-brief.md 阅读后按 TDD 流程实现 <任务摘要>" `
  -m <按时段选模型,见 6️⃣> `
  --attach http://localhost:4098 `
  --title "<任务名,如 prop-modal-fix-impl>" `
  --no-replay `
  --auto `
  --dir D:\Github\<worktree> `
  --file .opencode-brief.md
```

**🔴 必带参数 checklist**(2026-08-03 兄弟拍板):

| 参数 | 必带 | 备注 |
|---|---|---|
| `-m <model>` | ✅ | 按 6️⃣ 时段选;**火山 pro 优先 > 小米 pro > go pro**;Pro 场合绝不降级免费组 |
| `--attach http://localhost:4098` | ✅ | 兄弟要求挂 4098 Web UI;漏了看不到 session |
| `--title "<任务名>"` | ✅ | **必须显式**,attach+title=独立新 session 不混流(Web UI 可辨);英文小写+连字符 |
| `--no-replay` | ✅ | 干净上下文 |
| `--auto` | ✅ | 自动批准权限;⚠️ `--dangerously-skip-permissions` 已废弃(1.18.11 后),旧参数导致 yargs 解析错乱 |
| `--dir <绝对路径>` | ✅ | 项目根目录(绝对路径) |
| `--file .opencode-brief.md` | ✅ | **禁止 stdin pipe**(`\| Get-Content ...` 在 `exec(background=true)` 下冷启动竞态,OpenCode 收到空 brief) |
| `exec background=true + timeout=0` | ✅ | **禁止短 timeout**——CLI 被 SIGKILL 但 server agent 继续跑,误以为失败;⚠️ `timeout=N` 杀的是 CLI 不是 server session |

### dispatch 前后必查

| 时机 | 必查项 | 走 reference |
|---|---|---|
| **dispatch 前(Step 0)** | process list + OpenCode DB 双渠道;相同任务 session 还在活跃 → 不能 dispatch | `references/dispatch-checklist.md` |
| **dispatch 前(Step 0.5)** | 根目录 brief 唯一性预检(多任务并行时) | `references/dispatch-checklist.md` |
| **dispatch 前(Step 0.6)** | 工作区状态预检 + brief 强制项(worktree 场景) | `references/dispatch-checklist.md` |
| **dispatch 前(Step 0.7)** | bot 不做源码改动的边界判定 | `references/dispatch-checklist.md` |
| **dispatch 后立即** | 拿 sessionId + 落盘 session-meta | `references/session-lifecycle.md` |
| **dispatch 后立即** | 启 wait 脚本(`terminal(background=true, timeout=0, notify_on_complete=true)`) | `references/monitoring-wait.md` |
| **wait 通知到达后** | 按 exit code 决策(1 轮 LLM,~1000 tokens);不再主动轮询 | `references/monitoring-wait.md` |
| **session 真完成后** | 提取报告 + post-poll state 同步 | `references/session-lifecycle.md` |

---

## 5️⃣ 硬性规则(仅 SKILL 特有,已去重)

> 已全局集成的规则(入口检查、先汇报再继续、杀进程纪律、TDD 纪律、编码规则等)见 MEMORY.md → 工作协议。

### 一、并发 + 工作区防污染

🔴🔴🔴 **并发防污染(2026-08-15 实锤,2026-08-17 worktree 根治)** — `opencode run --attach http://localhost:4098` 会把**工作区所有未提交变更**(含其它并发 session 正在改的文件、新建的 brief)打包注入新 session 的初始 user 消息 summary.diffs。多个 session 并发同一工作区时上下文互相污染 → agent 把别的任务的 brief/文件当成自己的任务,改错文件(2026-08-15 Xiaye1 实现 session 被 mmd-bake-parallel/camera-align 任务污染,改了 30+ 个无关文件)。

🔴🔴🔴 **GTS-Play 单机代码(`packages/frontend/`)默认走 worktree(2026-08-17 兄弟拍板,覆盖旧判定)**:

- 修改 GTS-Play 的单机代码 → **一律切到可用的 worktree**(现有 wt1/wt2)
- 没有可用 worktree → 问兄弟「是否在当前分支(dev)上干活」→ 等确认后才 dispatch
- worktree 清单:`D:\Github\wt1`(分支 wt1,基于旧 dev 07614c745)/ `D:\Github\wt2`(分支 wt2,基于 9e68824d0)。wt1/wt2 均 junction 共享主仓库 node_modules(根 + 357 个嵌套),无需 install
- 建新 worktree:`powershell -File scripts\worktree-junction.ps1 -Name <名> [-Clean]`(含级联嵌套 junction,全自动)
- 多任务并行时优先分配不同 worktree,避免同一 worktree 内并发

🔴 **判定边界(2026-08-17 更新)**:① 不同 git 仓库互不影响 → 不需要;② 同一仓库内不同 package → 不互相影响 → 不需要;③ GTS-Play 单机代码(frontend/)→ 一律 worktree;④ 其它同一 package/同一批文件的并发任务 → 才考虑隔离,且**必须经兄弟确认**。

🔴 **worktree 隔离流程**:① `worktree-junction.ps1 -Name <任务名> [-Clean]` → ② dispatch 时 `--dir D:\Github\<任务名>` → ③ 完成后 merge 回主仓库(完整 merge 步骤见 worktree-junction skill「完成后必须 merge 回主仓库」,**M 阶段前或流程结束前必须 merge,不等兄弟提醒**)。

🔴 **禁止**:dispatch 前 stash/commit 别人的未提交变更(会打断正在跑的 session)

### 二、dispatch / session 铁规

- 🔴🔴🔴 **dispatch 后必须立即拿 sessionId**(不等 completion event,2026-08-13 兄弟连催 3 次后定)→ 详见 `references/session-lifecycle.md`
- 🔴🔴🔴 **session 状态必须主动核对(2026-08-19 兄弟定稿)**:wait 脚本退出码 + 通知消息**不能 100% 反映** OpenCode session 真实状态。每次收到 wait 完成通知时:① 查 session.part 表最后一条 `step-finish reason=stop` 是否存在 → ② `git log -3` 看目标仓是否多了新 commit → ③ 在状态表格里立刻同步 ✅ done + commit hash。**禁止用「上一条通知说还在跑」推断当前状态**,必须重新查 DB + git log。**兄弟原话(2026-08-19)**:「这个早就跑完了吧?你怎么没检查」
- 🔴🔴🔴 **permission auto-reject 是硬卡死信号(2026-08-19 code-review 实锤)**:跨仓/跨 workdir 派工时 brief 必须**显式列禁** + 「权限被拒改用 brief 摘要继续」+ 「已读 commit 足够,不要为补 commit detail 再读 git」。派工 20 分钟后查 part 表最近 5 条事件;看到连续 `bash/read status=error error=The user rejected permission to use this specific tool call` 重复 2+ 次 = 硬卡死,立刻 `gts-opencode-stop` 杀掉,重新派
- 🔴🔴🔴 **Pro 模型派工后不主动轮询(2026-08-20 修订)**:Pro max 静默 80 分钟正常,卡死判定**仍由 wait 脚本做**,不是 bot 主动查 DB。Hermes 通知到达后一次性 `process(action=log, offset=-2)` 看 agent 最后状态,该发「继续」发「继续」,该 stop 就 stop。兄弟原话「间隔太久了!消耗token大吗?」+「不需要告诉我」
- 🔴 `exec(background=true)` + `$brief` 变量传参,**禁止 sessions_spawn**
- 🔴 先写 `.opencode-brief.md` 再 dispatch,禁止空手调度
- 🔴 `exec timeout=0` 不限时 — OpenCode 跑 15-30 分钟正常
- 🔴 遇代码修改必须调度 OpenCode — 不改代码自己手写
- 🔴 brief 末尾必须写「不需要代码审核,代码审核是单独步骤」
- 🔴 e2e 由 OpenCode 执行:跑完后**按需判断是否做截图分析**(2026-08-01 兄弟定稿)—— 截图是验证目标 → 让 OpenCode 用 gts-screenshot-analyze skill 分析;非验证目标 → brief 说明「无需截图分析」及理由,不强制分析
- 🔴🔴🔴 需要停 OpenCode → 先收集足够信息判断 → 确认需要停 → 调度 gts-opencode-stop(不重启服务器,不影响其他 session)
  - poll 没输出 ≠ 卡住(Pro 数分钟无输出正常;max 15-30+ 分钟也正常)
  - 不确定 → 汇报兄弟,不擅自停
- 🔴 模型选择:兄弟指定模型时按兄弟说的执行,不判断
- 🔴🔴🔴 根因分析交给 OpenCode Pro — 只做数据收集,不 trace 代码路径自己分析

### 三、bot 主线 token 节流(2026-08-15/16 token 审计定稿)

- 🔴🔴 **bot 主线不做重活(2026-08-15 token 审计)** — 任何「需读 >3 个文件或 >5 步分析」的工作一律 dispatch OpenCode,bot 只留决策和验收;批量文件阅读、多步代码分析、数据汇总等禁止在 bot 主线逐文件 read(每个 read 2-5k token 进上下文,每轮对话都重读)
- 🔴🔴 **同类小任务合并 dispatch(2026-08-15)** — 同类小任务(同一测试套件拆出的多个子任务、同一功能的多个小修复点)合并成 1 个 session 一次 dispatch,禁止碎片化逐个派(8/9 add-tests 一天 24 个碎片 session,bootstrap 上下文重复浪费);合并上限:单 session 预估 <30min 才可合并,超过仍按长任务拆 session 规则
- 🔴 主 session 不重复跑 tsc(信任 OpenCode 自验证结果)
- 🔴🔴🔴 **长会话 token 翻篇提醒(2026-08-18 定稿,bot 主线最易踩)** — bot 主线一次对话超过 ~80 calls 或 cacheRead 累计 >40M → 在回复中加 ⚠️ 提示「/new 翻篇」,单会话超过 ~150 calls 强制建议翻篇。判据:`scripts/token-audit.cjs` 输出 `avg cacheRead/call >200K` 或单会话 `calls >100`
  - **自查**:每完成 1 个 OpenCode 任务后跑 `node <hermes-home>/skills/autonomous-ai-agents/hermes-session-forensics/scripts/token-audit.cjs <state.db> <YYYY-MM-DD>` → 找 `calls >100` 的会话
  - **典型反例(2026-08-17 → 08-18)**:会话 `704e78` 跨日跑了 12h、389 calls、cacheRead 88.9M、$0.29
- 🔴🔴🔴 **长任务必须拆 session(>60min 预估工作量)(2026-08-01 实锤)**:单 session 跑 6h → cache read 5.3 亿 tokens、$2.66、ContextOverflowError 死
  - **拆法**:按逻辑单元拆多个 <30min 短 session
  - 每个新 session 必须 `--no-replay`(干净上下文)
  - brief 必须预置已确认事实(已修 bug 清单 + 剩余失败分类 + 已排除探索方向)
  - **防爆判据**:step-finish `tokens.total` 接近 900K 时即使没完也要主动停,开新 session 续接
- 🔴🔴🔴 **bot 主线长会话强制拆 session(2026-08-16,最大杠杆)** — 8/15 实测:bot 主线 2 个超长会话(7.5h / 5.5h)共烧 $7.07,cacheRead 占 91.6%
  - **硬性规则**:每完成一个 phase(方案 → 实现 → 验收)**必须归档当前会话、开新会话继续**
  - **触顶线**:单会话 cacheRead 累计 >50M tokens(约 $1.4)或运行 >2h → 主动停开新会话带摘要
  - **OpenCode fix 会话上限**:fix 循环 >2 轮必须拆新 session,禁止同一个 fix session 无限续跑

### 四、任务粒度 + 防红灯扩散(2026-08-01 nf-Colyseus 教训)

- 🔴🔴🔴 **任务粒度:每批 <30min 且必须闭环** — nf-Colyseus Phase 1 跑了 8 小时没完成(Session1 6h 爆上下文死,Session2 104min 改 3 文件留 1 个 build bug 被 Aborted)。根因:一批任务量太大(34 个失败一次修)
  - 每批只派 1 个原子单元(1 个 feature 组的失败 / 1 个 build 错误 / 1 个阶段),改完立即 build+jest 验证全绿才算完成
  - 计划是 bot 的,不是 agent 的:bot 每批派一个单元,绿灯才放行下一个
  - 每个 session 结束 = bot 自己跑 build+jest 验证,不绿 → 不发下一批,回炉重派

- 🔴🔴🔴 **build 红 = 阻塞,禁止扩展(2026-08-01)** — Session2 16:00 build 红灯没回头修,继续改了 25 分钟 seat 逻辑,最后 Aborted 时错误还在。**根因:agent 把 build 当「最终验证」不是「每步门禁」**
  - **brief 必须写硬性命令**:"任何时刻运行 build/jest 出现错误 = 当场修复,禁止开始任何新文件的修改。修复中禁止切换任务。连续 3 次修复尝试仍失败 → 立即停止,输出失败详情,不要继续。"
  - todo 结构 RED → GREEN 原子单元:每单元 = "修什么 + 用什么命令验证 + 必须全绿才算完成";单元没绿禁止动下一个单元的文件
  - brief 末尾写"为什么":"验证是门禁不是仪式"

### 五、并行 + brief 隔离(2026-08-01/19 教训)

- 🔴🔴🔴 **brief 文件隔离(2026-08-01)** — `.opencode-brief.md` 是全局共享文件,并行任务会覆盖它 → 新 agent 读到的 brief 是别人的任务,预置事实全丢
  - 多任务并行时,每个任务用独立 brief 文件:`.opencode-brief-<task>.md`
  - 或直接命令行内联传参,不依赖共享文件
  - 详见 `references/brief-template.md`

- 🔴🔴🔴 **并行任务隔离(2026-08-01)** — 同时只跑一个 OpenCode 任务,多任务排队。三线并行(共享 brief 被覆盖、git status 混入、DB 查询难分)

- 🔴🔴🔴 **一个 OpenCode session 只做一件事,拆并行 session(2026-08-19 兄弟拍板)** — 多个独立修复点/独立模块/独立子任务必须**并行**派多个 session,**不**在一个 session 里塞多件事
  - 一个 session = 一个原子单元
  - 多个独立单元 → **并行**派多个 session(不是串行派一个 session 干多件事)
  - **判定时机**:dispatch 前先问"几个互不依赖修复点?"→ 多个 → 拆并行;单个 → 一个 session。互依赖 → 串行或同 session
  - **workdir 共享注意**:两个并行 session 若 `--dir` 相同,文件系统层互相可见(共享 node_modules / git status);避免在工作区同时跑 `npm install` / `git commit` 等全局操作。文件级不冲突即可并行

### 六、保护目录 + 依赖

- 🔴🔴🔴 禁止修改 `doc/` 和 `笔记/语雀知识库/` 目录(兄弟手动维护的版本日志,brief 中必须写)
- 🔴 依赖变更(改 `package.json`)时 OpenCode 必须自己跑 `yarn bootstrap --mutex network`

---

## 6️⃣ 模型选择速查(精简,完整细节看顶部铁规)

### 复杂度判断 — 先判后选

| 判断维度 | 简单 ✅ Flash 一刀切 | 复杂 ❌ Flash 出方案+实现,Pro 仅审核/根因分析 |
|----------|-------------------|-------------------------------|
| 模式清晰度 | 已有现成模式可复制 | 需要重新设计架构或协议 |
| 影响范围 | 单模块、单文件、不跨包 | 跨包、跨模块、API 签名变更 |
| 变更类型 | 本地化改动、配置调整、已有模式扩展 | 性能优化、安全约束、数据一致性 |

### 当前可用模型(免费组优先,2026-08-18 兄弟拍板 + 火山增补)

> 🔥 **volcark provider 配置(2026-08-18 增补,实测连通 + 推理已开启)**:
> - 注册在 `C:\Users\Administrator\.config\opencode\opencode.json` 的 `provider.volcark`,apiKey 用 `{env:ARK_CODING_API_KEY}` 引用
> - 模型 id:`deepseek-v4-flash-ga-260731`(Flash)/ `deepseek-v4-pro-ga-260813`(Pro)
> - 🔴 **推理必须显式开**(2026-08-18 实测):`options` 里必须配 `"thinking": {"type": "enabled"}`,否则不做推理(DB part 表无 `type=reasoning` 块)
> - 🔴 **4098 server 不热加载 provider 配置**:改 opencode.json 后必须重启 4098 server 才生效

```
opencode/deepseek-v4-flash-free       # Flash Free(免费组首选)
opencode/hy3-free                     # Hy3 Free(2 顺位)
opencode/mimo-v2.5-free               # MiMo v2.5 Free(3 顺位)
opencode/nemotron-3-ultra-free        # Nemotron 3 Ultra Free(4 顺位)
opencode/nemotron-3.5-lightning-free  # Nemotron 3.5 Lightning Free(5 顺位)
opencode/laguna-s-2.1-free            # Laguna S 2.1 Free(6 顺位)
volcark/deepseek-v4-flash-ga-260731   # 🔥 火山 Flash(非免费时段默认 + 免费组兜底)
volcark/deepseek-v4-pro-ga-260813     # 🔥 火山 Pro(Pro 任务优先)
xiaomi-token-plan/mimo-v2.5-pro       # 小米 Pro(火山 pro 不可用时)
opencode-go/deepseek-v4-flash         # 兜底 flash
opencode-go/deepseek-v4-pro           # 兜底 pro
opencode-go/kimi-k2.7-code            # 备选
opencode-go/minimax-m2.7              # 备选
opencode-go/qwen3.7-plus              # 备选
```

### 时段判定(北京时间 UTC+8)

```powershell
$bjHour = [DateTimeOffset]::Now.ToOffset([TimeSpan]::FromHours(8)).Hour   # 0-23
$freeWindow = ($bjHour -ge 9 -and $bjHour -lt 12) -or ($bjHour -ge 14 -and $bjHour -lt 18)
# $true = 免费时段 9-12 / 14-18 → 免费组
# $false = 其余时段 → 火山 flash/pro
```

### 按任务类型选模型

> ⚠️ 下表为**免费时段**默认值;**非免费时段**普通任务全部换 `volcark/deepseek-v4-flash-ga-260731`(火山 flash),Pro 行优先火山 pro(次选小米 pro,备选 opencode-go),**火山/小米不可用/余额不足才轮到 go 套餐兜底**;免费组全挂 → 切火山。

| 任务类型 | 模型参数 | 说明 |
|----------|---------|------|
| 简单任务/出方案 | `-m opencode/deepseek-v4-flash-free` | 免费组首选;不可用换组内其它免费模型 |
| 简单修复/常规实现/重构 | `-m opencode/deepseek-v4-flash-free` | Flash Free(默认) |
| Verify(场景覆盖检查) | `-m opencode/deepseek-v4-flash-free` | 同上 |
| 代码审核(简单 ≤50 行) | `-m opencode/deepseek-v4-flash-free` | 2026-08-17 兄弟拍板:简单不上 Pro |
| 代码审核(复杂/架构级) | `-m volcark/deepseek-v4-pro-ga-260813` | 火山 pro 优先;次选小米 pro;备选 go pro;**默认 variant 不用 max** |
| 方案/架构设计 | `-m opencode/deepseek-v4-flash-free` | 2026-08-17 兄弟拍板改 Flash;复杂重活方案 → 火山 pro |
| 复杂 bug 根因分析 | `-m volcark/deepseek-v4-pro-ga-260813` | 不自己分析根因 |
| 免费模型额度用完兜底 | `-m volcark/deepseek-v4-flash-ga-260731` | 火山 Flash(不是 go) |
| 兄弟指定模型 | 按兄弟说的执行 | — |

### 命令行参数增补

🔴 **不再使用 `--agent plan`**:plan agent 禁止写文件,但 specs 需要创建 .md。改用 build 模式(默认)+ brief 中明令「只能写 specs 不写代码」

🔴 **`--auto` 必加**:所有 dispatch 命令必须带此参数,自动批准权限请求

🔴 **`--dangerously-skip-permissions` 已废弃(2026-08-06 实锤)**:opencode 1.18.11 已无此参数,只有 `--auto`。传旧参数 → yargs 解析错乱 → `--title`/`--dir`/`-m` 全部失效

🔴 **CLI 退出后 server 端 agent 不继承 CLI 参数(2026-08-01 踩坑,2026-08-18 已根治)**:CLI exit 0 后 server 端 agent 继续跑时按 server 配置走,**不继承** `--auto`。已配置 `~/.config/opencode/opencode.json` 的 `agent.build.permission` = `{"edit": "allow", "bash": "allow"}` → CLI 退出后 server agent 全自动,不再弹权限确认。⚠️ 改此配置后 **4098 不热加载,必须重启 4098 server 才生效**

---

## 4 个 reference 快速导航

| 文件 | 何时 load | 大小 |
|---|---|---|
| `references/brief-template.md` | dispatch 写 brief 前(必) | 6.3KB |
| `references/dispatch-checklist.md` | dispatch 前 Step 0/0.5/0.6/0.7 检查(必) | 16KB |
| `references/session-lifecycle.md` | 2.5 追加消息 / 2.6 相续续接 / permission 卡 / post-poll state 钩子时 | 12KB |
| `references/monitoring-wait.md` | dispatch 后启 wait / 看 exit code 处理 / Aborted/socket 崩溃 / time_updated 停止判定 / LLM 静默失败时 | 17.5KB |

> 🔴 **拆分原则**:主 SKILL.md 是常驻 meta(模型时段 + Hermes 适配 + 铁规 + 速查);4 个 reference 是按需深读。load 主 skill → 决策点 → load 对应 reference。

> 🔴 **拆分历史**:2026-08-20 主 SKILL.md 从 108KB / 1102 行瘦身到 ~30KB,拆出 4 个 reference。原内容 100% 保留,只是按职责重排。旧内容搜索可以用 `git log -p opencode-schedule/SKILL.md | grep <keyword>` 追溯。

---

## 历史 / 追溯

- **2026-08-20 拆分**:主 SKILL.md 从 108KB 拆成 ~30KB + 4 个 reference(`references/brief-template.md` / `dispatch-checklist.md` / `session-lifecycle.md` / `monitoring-wait.md`)。拆分动机:gts 技能库最胖,引用子 skill load 时一次性 110KB 进上下文,是 8/15 bot 一轮对话 cacheRead 88M 的根因之一
- **2026-08-17 wait 取代 poll 主路径**(开篇 + monitoring-wait.md):OpenClaw 老 poll 每轮烧 LLM 决策轮 + 全量 cacheRead → 1.6 亿 token/天;Hermes wait + notify 反而 0 token 等待 + 通知后一次性 ~1000 tokens
- **2026-08-15 token 审计定稿**:bot 主线不做重活 + 同类小任务合并 dispatch
- **2026-08-08 多任务并行跑偏教训**:brief 文件隔离 + Step 0.5 预检
- **2026-08-01 nf-Colyseus Phase 1 教训**:每批 <30min 闭环 + build 红 = 阻塞 + 长任务拆 session
- **2026-07-29 state issue 钩子**:post-poll 检查 .skill-exec-state.*.json 进度
