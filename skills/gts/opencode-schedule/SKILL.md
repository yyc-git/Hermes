---
name: "opencode-schedule"
description: "OpenCode 调度方式：写 .opencode-brief.md → $brief 变量 → opencode run --attach --no-replay"
---

# opencode-schedule — OpenCode 调度协议

> 所有调度 OpenCode 的 skill 统一引用本协议。不可单独使用，只能被 gts-dev-workflow / gts-dev-fix / gts-dev-feat / gts-dev-refactor / gts-code-review 等 skill 引用（gts-analysis 已于 2026-08-16 归档至 skills-archive/）。

> 🔴🔴🔴 **模型选择按北京时间时段（2026-08-18 兄弟拍板，2026-08-18 增补火山 coding plan，2026-08-18 定稿：火山优先级 > go 套餐，go 是兜底）**：
> - **免费时段 9:00-12:00 / 14:00-18:00 → 免费模型组优先**：`opencode/deepseek-v4-flash-free`（首选）→ `opencode/hy3-free` → `opencode/mimo-v2.5-free` → `opencode/nemotron-3-ultra-free` → `opencode/nemotron-3.5-lightning-free` → `opencode/laguna-s-2.1-free`
> - **其余时段 → 火山 coding plan 优先**：普通任务 `volcark/deepseek-v4-flash-ga-260731`（火山 flash 正式版），复杂审核/根因分析用 Pro（见下）
> 🔴 **Pro 模型（2026-08-18 兄弟拍板增补，2026-08-18 再增补：pro 场合不用免费模型）**：要使用 pro 模型时（复杂代码审核 / 复杂 bug 根因分析 / 出方案等重活）→ **优先 `volcark/deepseek-v4-pro-ga-260813`（火山 coding plan pro 正式版，2026-08-18 实测连通）**，次选 `xiaomi-token-plan/mimo-v2.5-pro`（小米 token plan pro，2026-08-19 增补），备选 `opencode-go/deepseek-v4-pro`。🔴🔴 **免费模型仅限 flash 使用场合；pro 场合绝不降级到免费模型顶替**——pro 不可用（火山/小米/go pro 都挂或余额不足）→ 汇报兄弟等充值/恢复，或经兄弟确认后用 go 付费 pro 重试，禁止用免费组任何模型顶 pro 的活。
> - 简单代码审核/简单方案仍走 Flash（2026-08-17 兄弟拍板：方案/架构设计改 Flash、简单代码审核也走 Flash）。兄弟指定模型时按兄弟说的执行。
> 🔴🔴🔴 **整体优先级（2026-08-18 兄弟拍板定稿：火山 coding plan > go 套餐，go 套餐才是兜底）**：
>   1. **免费时段 → 免费模型组**（6 个轮换，见上）
2. **火山 coding plan**（免费组全挂/额度用完，或非免费时段默认）：普通 `volcark/deepseek-v4-flash-ga-260731`，重活 `volcark/deepseek-v4-pro-ga-260813`
2.5. **小米 token plan**（火山 pro 不可用/余额不足时）：`xiaomi-token-plan/mimo-v2.5-pro`（Pro 任务备选，2026-08-19 增补）
3. **go 套餐 = 兜底**（火山/小米不可用/余额不足才用）：`opencode-go/deepseek-v4-flash`（普通）/ `opencode-go/deepseek-v4-pro`（Pro 备选）
> 🔴 **go 套餐余额不足（2026-08-17 实锤）**：`opencode-go/deepseek-v4-flash` 余额不足时会全部失败（`Insufficient balance`，实测 13:12 起连续 5 次 dispatch/续跑失败）→ go 是兜底不是首选，**任何时段优先火山**；go 余额不足 → 回退免费组（免费时段）或火山（其余时段）。
> 🔴🔴🔴 **免费组内故障轮换（2026-08-18 兄弟拍板增补，2026-08-18 再增补「3 次继续重试」）**：免费时段当前使用的免费模型 dispatch 即死 / 报错 / 断流（LLM 静默失败 reason=unknown）→ 🔴🔴 **先对同一免费模型发「继续」重试 3 次，每次间隔依次 10s / 30s / 60s**（`opencode run -s <sessionId> -m <同一免费模型> --attach http://localhost:4098 --dir <项目> --no-replay "继续"`，发完用 wait 脚本/DB time_updated 看是否恢复）→ **3 次都无法继续，才确认为该模型挂了** → 换免费组内下一个，**绝不跳级切 go 付费版**（火山仅免费组全挂时才允许切）。轮换顺序固定：`opencode/deepseek-v4-flash-free`（首选）→ `opencode/hy3-free` → `opencode/mimo-v2.5-free` → `opencode/nemotron-3-ultra-free` → `opencode/nemotron-3.5-lightning-free` → `opencode/laguna-s-2.1-free`。> 🔴🔴🔴 **免费模型状态文件化（2026-08-18 兄弟拍板落地，防止「挂了每次现场试」）**：
> - **调度免费时段模型前必须先读状态**：`node scripts/opencode-free-model-state.mjs get --dir D:\Github\GTS-Play` → 输出 `{"current":"opencode/deepseek-v4-flash-free","blacklist":[{"model":"...","deadAt":...}]}` → **用 `current` 作为本批 dispatch 的免费模型**（跳过 blacklist 里的已挂模型，不用现场试）
> - **确认某模型挂（3 次继续失败 + 明确报错 rate limit/429/401/5xx）→ 立即落盘**：`node scripts/opencode-free-model-state.mjs dead <model> --dir D:\Github\GTS-Play`（自动加入 blacklist 带 deadAt 时间戳，current 前进到组内下一个未挂的）
> - **🔴🔴🔴 单个免费模型「额度用完」(Free usage exceeded) 是硬信号，立即 dead + 切下一个（2026-08-19 实锤）**：dispatch 的 session 报 `Free usage exceeded, subscribe to Go`（或 Web UI 显示该模型额度耗尽）→ **不是"3 次继续失败"那种瞬时故障，是额度真的没了** → ① 立即 `node scripts/opencode-free-model-state.mjs dead <model>` 落盘 ② 用 `get` 拿 current（自动前进到组内下一个）③ 重新 dispatch 同 brief 用新模型。**不等 3 次继续**——额度用完继续发「继续」只会重复报错烧时间。实测（2026-08-19）：r10 用 flash-free dispatch 后 session 卡死 5 分钟无产出，兄弟指出"它免费额度用完了，报 Free usage exceeded, subscribe to Go，你应该切换下一个免费模型"，dead 后 current 自动切到 hy3-free，重新 dispatch 即正常。
> - **「3 次继续重试」仅适用于瞬时故障**（rate limit/429/401/5xx/静默 unknown）——额度用完是持久性（当天耗尽），不适用继续重试，直接 dead + 切下一个。
> - **兄弟实测某模型提前恢复可用 → 立即 revive**：`node scripts/opencode-free-model-state.mjs revive <model> --dir D:\Github\GTS-Play`（移出 blacklist，current 回到该模型）
> - **手动指定**：`node scripts/opencode-free-model-state.mjs set <model> --dir D:\Github\GTS-Play`
> - 存储位置：`.opencode-session-meta/free-model-state.json`（与 session-meta 同目录）
> - 🔴 文件是权威状态：调度时**不要凭记忆/现场测试**猜模型，一律 `get` 读文件；挂/恢复都写文件，保持文件与事实一致
>
> 🔴 **确认「挂」以明确报错为准（2026-08-18 兄弟实测修正：静默 unknown ≠ 挂）**——flash-free 新会话实测可用（额度用完会明确报 rate limit，不会静默 unknown），之前「继续 3 次失败即记挂」把瞬时/会话问题误判成模型挂（导致误用 hy3）。🔴 **确认挂 = 3 次继续失败 + 明确错误（rate limit/429/quota/401/5xx 持续）**；无明确错误的静默 unknown → 删会话重开继续用同模型。🔴 **误判恢复：被记录「挂」的模型一旦实测可用（新会话跑通），下轮 dispatch 回到首选（flash-free）重试**。仅当免费组 6 个全部不可用/额度耗尽才允许切火山（火山在 go 之上，见下）。
> 🔴 **免费模型额度用完兜底（2026-08-18 兄弟拍板增补）**：免费组 6 个全部不可用/额度耗尽 → **切火山 coding plan（不是 go 套餐）**：普通任务 `volcark/deepseek-v4-flash-ga-260731`（flash 正式版），重活 `volcark/deepseek-v4-pro-ga-260813`（pro 正式版），两者 2026-08-18 已实测连通。**火山也挂/余额不足 → 小米 pro 备选 → 都不行才轮到 go 套餐兜底**。
> 🔴 **简单任务（单模块、不跨包、无性能安全约束）用 Flash 一刀切（先写 specs 再写代码）**，不上 Pro 浪费额度。
> ⚠️ 一刀切 ≠ 跳过 specs。同一轮 dispatch 也必须**先产出 Delta Specs 文件，再写业务代码**，不能混在一起写。specs 文件路径：`笔记/项目文档/changes/<日期>-<功能名>/specs/`。

---

### 0️⃣ Hermes 环境适配(2026-08-17 OpenClaw → Hermes 迁移)

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
# 🔴 参数单位是**毫秒不是秒**（2026-08-19 实锤）—— 传秒值（如 7200/600）→ maxWaitMs=7200ms < POLL_INTERVAL 30s → 第一次 poll 立即 TIMEOUT 退出。正确示例：7200000 (2h) / 600000 (10min)

# 提取结果(exit 0 = 完成 step-finish stop 后)
node scripts/extract-session-text.mjs <sessionId>
node scripts/extract-opencode-report.cjs <sessionId>

# skill-exec 框架(状态追踪,项目内运行)
node scripts/skill-exec-manager.cjs <command> ...
```

**Hermes 版监控主路径**:dispatch 用 `terminal(background=true)` → 查 DB 拿 sessionId → 立即用 `terminal(background=true, notify_on_complete=true)` 启动 wait 脚本 → turn 结束等通知(等待期间 LLM 完全空闲)→ 通知到达后按退出码处理(0=完成读报告 / 2=超时 / 3=stuck,查 DB time_updated 决定重启 wait 或发「继续」)。poll 降级为辅助查看实时输出(单次 ≤30000,挂起即弃)。

---

### 1️⃣ 写 brief 文件

```markdown
**文件路径：** `<projectDir>/.opencode-brief.md`（🔴 多任务并行时用 `.opencode-brief-<task>.md` 隔离，见 5️⃣ 硬性规则）
**内容要求：**
- 自动在开头注入 `笔记/项目文档/project-context.md` 内容（bot 拼接，OpenCode 不自己读）
- 🔴 **全程用中文（2026-08-18 兄弟拍板）**：brief 必须写明「本任务全程用中文交流——所有消息、分析、报告、总结用中文；代码注释中文或英文均可；代码标识符/API 名/日志字符串保持英文」。OpenCode 默认爱用英文回话，不指定就会产出英文报告/总结（已同步到 docs/agent-context.md「🌐 语言约定」）
- 引用 `docs/agent-context.md`（不再逐条贴 TDD/集成测试/自验证/返回格式等规约）
  - 只需一句：`共享规约见 docs/agent-context.md，包括 TDD 纪律、集成测试纪律、自验证要求、精准读文件纪律、返回格式`
- 🔴🔴🔴 **每批只派 1 个原子单元**（RED→GREEN）：todo 写「单元1: 修 X → 验证命令 → 必须全绿才算完成」，单元没绿禁止动下一个单元的文件
- 🔴🔴🔴 **必须写红灯=阻塞硬性命令**：「任何时刻 build/jest 报错 = 当场修复，禁止开始新文件的修改；连续 3 次修复失败 → 停止输出详情，不继续」
- 🔴🔴🔴 **末尾写为什么**：「验证是门禁不是仪式」+ 上一个 session 的失败案例
- 🔴 纯方案/写 specs 任务：brief 必须写「不能写代码，只能写 specs」
- 🔴 简单任务一刀切（写 specs + 实现一轮 dispatch）：brief 必须明确写出**先写 specs 文件，再实现代码**的顺序步骤，不能混在一起
- 🔴 末尾写「不需要代码审核，代码审核是单独步骤」
- 🔴🔴🔴 禁止修改 doc/ 和 笔记/语雀知识库/ 目录（兄弟手动维护的版本日志）
- 🔴🔴🔴 **执行约束（2026-08-10 教训，brief 末尾必加）**：工作目录已是 dispatch `--dir` 设置好的路径，**禁止 `cd` 到外部目录**（尤其 Windows 下 `/d/`、`/c/` 等 Git Bash 写法会触发 `external_directory` 权限拒绝 → 零产出 exit 0）；git 命令**禁止 `git -C <外部路径>`**，直接在当前目录用 `git diff HEAD -- <file>` / `git status`；只用读取类操作（`Get-ChildItem`/`Select-String`/`Get-Content`）
- 🔴 精准读文件：读大文件时用 `offset` + `limit` 精确范围，不全文 dump
- 🔴 依赖变更（改 `package.json`）：**OpenCode 必须自己跑 `yarn bootstrap --mutex network`** 再继续
# 🔴🔴 PowerShell `-like` 大小写不敏感(2026-08-19 实锤教训):
# PowerShell 的 `-like` 操作符默认**不区分大小写**, glob 通配符 `Tda*` 会匹配 `TDA式宴 夏卉_opt/`(XiaHui 模型)
# 导致 writeback 误把 XiaHui 数据写到了 Xiaye1 角色条目上
# 修复:用更精确的 glob(包含 HMS 关键字)`Tda*HMS*_opt` + 精确文件名(不用 glob),或用 `-clike` 显式指定大小写敏感
# 例:`Get-ChildItem "Tda 夏夜1*HMS illustrious*" -Directory` 比 `Tda*_opt` 更安全
  - 过滤输出：`Select-String`（替代 grep）——`npx tsc --noEmit 2>&1 | Select-String "xxx.ts" | Select-String -NotMatch "TS6133|TS6192"`
  - 保存输出：`Out-File -Encoding utf8 xxx.txt`（替代 `> /dev/null`）
  - 多步：`;` 连接（替代 `&&`）
  - tsc 验证在**目标包目录**跑（本次改动涉及的包，如 `packages/frontend` / `packages/room-service` 等），不在仓库根目录跑（根目录 = 全仓 7000+ 行既有 unused 噪音）
- 🔴🔴 **三态定义 + 不做清单（必填，2026-08-05 新增）**：每个 brief 必须显式写清以下四段，防止 AI 玄学空间：
  - **输入**：本次任务的输入数据/文件/入口，明确到路径或数据结构
  - **输出**：期望产出物，明确到文件路径 + 内容形态
  - **失败态**：哪些情况算失败？失败时怎么处理：报错停止 / 回退 / 记录继续
  - **不做清单**：明确列出本次不做的内容（不重构无关代码 / 不动 CloudBase 数据 / 不改 UI 样式等）
  - 模板：
    ```markdown
    ## 📋 三态定义（必填）
    - **输入**：<输入数据/文件/入口>
    - **输出**：<产物路径 + 内容形态>
    - **失败态**：<失败定义 + 处理方式>
    
    ## 🚫 不做清单（必填）
    - <不做的内容列表>
    ```
```

---

### 2️⃣ Dispatch 流程（合并 0️⃣+1.5️⃣+2️⃣）



| 场景 | 判断 | 操作 |
|------|------|------|
| 是自己 dispatch 的、正在正常跑的任务 | 不该停 | 等它结束再 dispatch 新的，或者汇报兄弟 |
| 是之前遗留的 stale session（exec 已退出但 Web UI 还在 running） | ✅ 需要停 | 调度 gts-opencode-stop |
| 跑超时/卡住很久无输出 | ⚠️ 不确定 | 汇报兄弟，让兄弟决定 |
| 是其他 skill 或兄弟手动 dispatch 的 session | 不该停 | 等它结束再 dispatch 新的 |

#### 🔴🔴🔴 Step 0 — dispatch 前检查（两个渠道，缺一不可）

> **每次 dispatch 前必须同时查 process list 和 OpenCode DB。两个渠道都确认无「相同任务」的 session 才能 dispatch。跳过任何一个 = 违规。**
>
> 🔴🔴🔴 **检查的是「相同任务」，不是「所有活 session」**（2026-07-31 修正）：
> - 其它任务（不同 title/brief）的活 session **不影响 dispatch**，不用等它、不用停它，直接 dispatch 新任务
> - 只有**相同任务**（title 关键词匹配同一功能/同一修复点）的 session 在跑，才不能 dispatch，等它结束或汇报兄弟
>
> ⚠️ `process(poll)` 返回 exit 0 不代表 OpenCode server 端 session 已结束（Web UI 可能还在 running）。
> ⚠️ OpenCode DB 有 session 不代表 exec shell 还活着——stale session 的 `time_updated` 仍会变化（by server-side agent）。

#### 🔴🔴🔴 Step 0.5 — 根目录 brief 唯一性预检（2026-08-08 新增，多任务并行跑偏教训）

> **dispatch 前必须确认目标 brief 文件是唯一且内容正确的**。多任务并行时根目录会堆多个 `.opencode-brief*.md`（实测达 17 个），`opencode run $brief` 传参在 attach 模式下可能 fallback 读根目录通用 `.opencode-brief.md`，导致 agent 跑偏去改其他任务的 brief/文件。
>
> **实例（2026-08-08 mmd-physics）：** impl 和 c2 两次 dispatch 后 session 首条消息显示读的是 bone-reduce/white-line 的 brief（`summary.diffs` 指向别的任务的 `.opencode-brief-*.md`）→ agent 改了其他任务的文件 → 需 session delete 重来。

**预检步骤（dispatch 前 10 秒）：**

```powershell
# 1. 列出根目录所有 brief，确认本次要用的文件存在且未被覆盖
Get-ChildItem D:\Github\GTS-Play\.opencode-brief*.md | Select-Object Name, LastWriteTime, Length

# 2. 确认目标 brief 的 LastWriteTime 是最近的（没被其他任务覆盖）
#    - 如果目标 brief 的 mtime 比 dispatch 时间早很多，可能已被别的任务流程覆盖 → 重新写
#    - 通用 `.opencode-brief.md` 在多任务并行时极可能被其他流程覆盖 → 优先用 `.opencode-brief-<task>.md` 隔离

# 3. 用 $brief 变量传参后，在 dispatch 前打印前 3 行确认内容正确
$brief.Substring(0, 200)
```

**跑偏识别（dispatch 后立即检查）：**
- session 首条 user 消息的 `summary.diffs` 指向其他任务的 brief 文件 → 🔴 跑偏，`opencode session delete <id>` 重来
- agent 开始改不属于本次任务的 patch → 立即 stop，不要等它改完

**规则：**
1. 多任务并行时一律用 `.opencode-brief-<task>.md` 隔离，不用通用 `.opencode-brief.md`
2. dispatch 前校验目标 brief 的 mtime 最近 + 内容头 3 行正确
3. attach 模式下若 CLI 输出异常（session 首条消息 diff 是别的文件），立即 session delete 重新 dispatch

#### 🔴🔴🔴 Step 0.6 — 工作区状态预检 + brief 强制项(2026-08-18 XiaHui Phase D 教训)

> **dispatch 前必须确认工作区状态**(尤其是 worktree 分支),且 brief 开头必须强制 agent 先确认再开工**。Agent 凭印象"wt1 没有 B2-2 改动"导致 Phase D 第一轮浪费一轮往返才拉回正轨。

**预检步骤(dispatch 前 10 秒)**:

```powershell
# 1. 列出工作区当前状态(必须包含进 brief 作为 agent 强制确认项)
git -C D:\Github\wt1 status --short
git -C D:\Github\wt1 log --oneline -3
git -C D:\Github\wt1 branch --show-current

# 2. brief 开头强制 agent 先跑这一段,禁止从"零假设"起步
```

**brief 强制项模板**(写到 brief 开头):

```markdown
## 🔴 工作区状态预检(开工前必须先确认)

执行前先跑:
\`\`\`\`powershell
cd D:\Github\wt1
git status --short
git log --oneline -3
git branch --show-current
\`\`\`\`

把上述输出写到报告首段,**禁止从"无改动"或"worktree 没有改动"假设起步**。如果发现工作区有非预期的改动(如 wt1 已经有 X 文件 modified),必须先核对是否属于本次任务范围,不属于则停手汇报兄弟。
```

**跑偏识别(dispatch 后立即检查)**:
- agent 第一轮 reasoning/text 提到"worktree 没有改动"或"以为 wt1 是干净的" → 立刻发"继续"消息纠正(用 `POST /session/{id}/message`),明示 git log 输出
- session 首条 user 消息的 `summary.diffs` 指向其他任务的 brief 文件 → 🔴 跑偏,`opencode session delete <id>` 重来

#### 🔴🔴🔴 Step 0.7 — bot 不做源码改动(2026-08-18 兄弟拍板血泪教训)

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

**什么时候算"修复太复杂必须 OpenCode"?**——任何改动符合下列任一:
- 涉及多文件协同改动(>1 文件)
- 需要 grep 多个源文件找上下文
- 需要改算法/正则/数学公式
- 改完需要跑测试验证

→ 这种活立即 dispatch,不要自己干

```powershell
# 🔴🔴🔴 合一检查：必须一起跑，不能只做一个
Write-Host "=== 1️⃣ Exec shell session check ==="
# 通过 process(action=list) 手动检查，看有没有 opencode run 相关的 exec session 还在 running

Write-Host ""
Write-Host "=== 2️⃣ OpenCode Server session check ==="
& "C:\Users\Administrator\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe" db "SELECT id, title, time_created, time_updated FROM session ORDER BY time_created DESC LIMIT 5" --format json 2>$null
```

**判断是否要等（只看相同任务）：**
| 渠道 | 相同任务 session 特征 | 下一步 |
|------|----------------|--------|
| 1️⃣ process list | 有 `opencode run` 相关 exec session 在 running 且是**相同任务** | 等它跑完再 dispatch，或汇报兄弟 |
| 2️⃣ OpenCode DB | 最新 session 的 title 与本次任务相同 且 `time_updated` < 30 秒前 | session 还在活跃运行 → 等它 |
| 2️⃣ OpenCode DB | 相同任务 session 的 `time_updated` > 30 秒前但未停 | stale session → 需要停 |
| 2️⃣ OpenCode DB | **没有相同任务** session（其它任务在跑或都结束了） | ✅ 可以 dispatch |

**🔴🔴🔴 time_updated 停止 ≠ session 已死（2026-08-17 XiaHui fix4/fix5 实锤教训）：**

> **教训：** dispatch fix5 前只看到 fix4 的 `time_updated` 停了 12 分钟就断定「已结束」，直接开新 session → 兄弟指出 fix4 在 Web UI 还显示 Running——server agent 仍在内存运行，且已越界开始修 gen-mmd-config（与 fix5 撞车改同一批文件）。必须 `opencode session delete` 停掉 fix4 才避免双 session 冲突。
>
> **根因：** `time_updated` 只反映「最后写 DB 的时间」，**server agent 在模型生成/思考/分析阶段可能长时间不写 DB**。CLI exit 0 或 exec 退出同理不代表 server session 结束。

**开新 session 前确认旧 session 真正死亡（缺一不可）：**

```powershell
# 1. 查 event 表最后事件类型（关键判据！）
opencode db "SELECT type, substr(CAST(data AS TEXT),1,200) AS preview FROM event WHERE aggregate_id='<旧sessionId>' ORDER BY seq DESC LIMIT 5" --format json
#    - 最后事件是 step-finish reason=stop/completed → ✅ 真完成，可开新
#    - 最后事件是 step-start / tool(read/bash running) / reasoning / text（无 step-finish stop）→ 🔴 agent 还活着，禁止直接开新
#    - 最后事件是 step-finish reason=tool-calls → 🔴 正在处理工具结果，还活着（fix4 就是这个状态）
# 2. 查 Web UI session 状态（兄弟视角）
Invoke-RestMethod -Uri "http://localhost:4098/api/session" -Method Get -TimeoutSec 10 | Select-Object -ExpandProperty data | Where-Object { $_.id -eq '<旧sessionId>' } | Select-Object id, title, @{n='updated';e={$_.time.updated}}
# 3. 有疑问（上述任一信号显示还活着）→ 先走 gts-opencode-stop 停掉旧 session（delete + 15s 复查 + title 零残留三重验证），再开新 session
```

**判定速查表：**

| 最后事件 | 结论 | 能否直接开新 session |
|---------|------|:---:|
| `step-finish` reason=`stop`/`completed` | 真完成 | ✅ 可以 |
| `step-finish` reason=`tool-calls` | agent 在处理工具结果，还活着 | 🔴 先停再开 |
| `step-start` / `reasoning` / `text` | 思考/生成中，还活着 | 🔴 先停再开 |
| `tool` state=`running` | 正在执行命令 | 🔴 先停再开 |
| `time_updated` 停了但 Web UI 显示 Running | server agent 内存存活 | 🔴 先停再开 |

> ⚠️ 即使 agent 已「越界」在修超出自己 brief 的内容（如 fix4 自己开始修 gen-mmd-config），也不能放任不管开新的——必须停掉它再开新 session，否则双 agent 抢文件。
> ⚠️ 正确顺序永远是：**先停旧（确认死亡）→ 再开新**。反了就是双 session 冲突。
> ⚠️ 兄弟 2026-08-17 明确纠正：「你在开启新的会话时，要先把老会话停掉啊」。

**🔴 相同任务重复 dispatch 检查（核心检查项）**

查 DB 时**看最新 session 的 title 和 time_created**，与本次要 dispatch 的任务比对：
- **title 关键词匹配（如都含同一功能名/同一修复点）且 session 还在活跃（time_updated < 30 秒前）** → 🔴 相同任务在跑，**不能 dispatch**，等它结束或汇报兄弟
- title 不匹配 = **其它任务** → **不影响 dispatch**，直接 dispatch 新任务
- 最近 30 分钟内相同任务已 completed → **确认是否真的需要再 dispatch**，而不是用已有结果

**🔴🔴🔴 CLI exit 0 ≠ session 结束（2026-08-05 新增）：**
- `opencode run` CLI 退出（exit 0）**不代表 server 端 session 结束**——DB 里可能仍有同 title session 记录（server agent 残留/空转），直接二次 dispatch 相同任务 = 2 个同任务 session 并存 → 抢文件冲突
- **重新 dispatch 相同任务前三步预检（缺一不可）：**
  1. 查 DB：`opencode db "SELECT id, title, time_updated FROM session WHERE title='<同任务title>'"`（查全部同 title，不只最新）
  2. 有残留 → `opencode session delete <id>`（FK 约束自动终止 server agent）
  3. 再查确认 time_updated 不再涨 → 才允许重新 dispatch
- **禁止**「CLI exit 0 就认为跑完」直接二次 dispatch 同任务
- 实例：2026-08-05 fix84-review1 第一次 dispatch CLI exit 0 但模型空转未产出 → 直接重 dispatch → DB 2 个同 title session，兄弟指出应先 stop

```powershell
# 在 DB 查询中加 title 检查
$recentSessions = & "...opencode.exe" db "SELECT id, title, time_created, time_updated, completed FROM session ORDER BY time_created DESC LIMIT 3" --format json
# 人工检查：最新 session 的 title 是否跟你准备 dispatch 的任务类型一致？
# 如果已有同类型 session 刚跑完（<30min），先评估能不能用它的结果，而不是无脑 dispatch 新的
```

**典型违规场景：**
- 第一次代码审核跑了但发现 brief 写错了 → 不该 dispatch 第二次审核，而是走 gts-code-review skill 重新执行完整流程
- 如果只需要补修几个问题 → dispatch 修复任务（brief 写「修复审核发现的特定问题」），不是重新 dispatch 整个审核

**如果发现有相同任务的活 session（任一渠道检出）：**

| 场景 | 判断 | 操作 |
|------|------|------|
| 是自己 dispatch 的、正在正常跑的同任务 session | 不该停 | 等它结束再 dispatch 新的，或者汇报兄弟 |
| 是之前遗留的 stale session（exec 已退出但 Web UI 还在 running） | ✅ 需要停 | 调度 gts-opencode-stop |
| 跑超时/卡住很久无输出 | ⚠️ 不确定 | 汇报兄弟，让兄弟决定 |
| 是其他 skill 或兄弟手动 dispatch 的同任务 session | 不该停 | 等它结束再 dispatch 新的 |

> ✅ **其它任务的活 session：直接忽略，可以 dispatch 新任务。** 不同任务（不同 brief/不同文件）互不冲突，不用等它结束、不用停它。

**判断需要停 → 调度 gts-opencode-stop：**
```
1. gts-opencode-stop skill 会收集信息、确认目标、删 session、杀子进程
2. 停完之后再继续 dispatch 新的
3. 不需要请示兄弟（bot 自己判断即可）
```

**🔴🔴🔴 禁止用 `process(kill)` 停 OpenCode：**
- `process(kill)` 只杀掉本地 CLI 的 `opencode run` 进程，**不杀 server 端 build agent**
- server 端 agent 继续在内存中运行，DB `time_updated` 持续更新
- 被杀后残留的 stale session 会与后面新 dispatch 的 session 冲突，每次踩坑都是这个问题
- 需要停 → 唯一正确路径：走 `gts-opencode-stop` 的 `opencode session delete`
- 删 session 后 FK 约束（`FOREIGN KEY constraint failed`）自动终止 server 端 agent

**🔴🔴🔴 exec 被 kill 后应对（新增 2026-07-29）：**
> 场景：exec session 因 timeout/工具侧强杀而 failed，但 OpenCode Web UI 端 session 仍在运行。
> 越界动作：bot 看到 process(list) 显示 `completed/failed` 后，不查 DB 直接 re-dispatch → 产生双 session 冲突。

**处理纪律：**

| 时机 | 必须做的检查 | 原因 |
|------|-------------|------|
| dispatch 被 kill（exec 返回 `failed` / 超时强杀）后，re-dispatch 前 | ① process(action=list) 查 exec 状态
② OpenCode DB 查最新 session 的 `time_updated` | exec 死 ≠ server session 死。CLI 被 kill 时 server agent 还在 Web UI 上跑 |
| process(list) 显示 OpenCode exec 为 `completed` / `failed` | **仍需查 DB** 确认 Web UI session 已结束 | `exit code 0` 只表示 CLI 正常退出，不表示 server agent 结束 |

**处理流程：**
```
if (前一个 dispatch 的 exec session 被 kill / 超时 / failed) {
  ① process(action=list) → 确认没有 OpenCode exec 在 running
  ② DB 查最新 session time_updated
     if (time_updated < 30s 前) → session 还在活跃 → 汇报兄弟
     else if (time_updated > 30s 前但仍在正常结束后的 update window 内) → stale → gts-opencode-stop
     else → session 已正常结束 → 可以 re-dispatch
}
```

**错误范例（这次踩坑）：**
```
# ❌ 错误：exec 被 kill → process(list) 显示 completed → 直接 re-dispatch
process(action=poll) → exec 超时被杀
process(action=list) → good-kelp completed ✓ （以为结束了）
dispatch new → 🔴 双 session 冲突

# ✅ 正确：介于中间的必须查 DB
process(action=poll) → exec 超时被杀
process(action=list) → good-kelp completed
# 再查 DB
opencode db "SELECT time_updated FROM session ORDER BY time_created DESC LIMIT 1"
# time_updated 还在 30 秒前 → stale → gts-opencode-stop → dispatch new
```

**真实案例（2026-07-31 论坛通知去重 B2）：**
```
# 现象：opencode run CLI 显示 "Error: Aborted"（CLI 中断），但 server session 仍在跑
process(action=poll) → warm-shore 显示 Error: Aborted
# 不要 re-dispatch！先查 DB：
opencode db "SELECT time_updated FROM session ORDER BY time_created DESC LIMIT 1" --format json
# time_updated 持续更新（idle 几秒）→ server agent 活跃 → 继续等
# 验证：监控目标文件修改时间（如 forumService.ts 16:08→16:11 连续变动）
# 结果：40 分钟后 session 正常完成，全部产出（Step C 报告 + 修复 + 测试）取回成功
```

> ✅ 判定要点：CLI Aborted ≠ server session 死亡。Aborted 后查 `time_updated`，**在涨=继续等**（结合文件修改时间线佐证），不要重 dispatch；只有 `time_updated` 完全停止推进 + 进程存活 ≥80 分钟才考虑 kill（先汇报兄弟）

**🔴🔴🔴 CLI socket 崩溃后 Web UI 续跑成功案例（2026-08-05 nf Phase 5 实现）：**
```
# 现象：opencode run CLI 报 "Error: The socket connection was closed unexpectedly" exit 1（socket 崩溃）
process(action=poll) → young-nudibranch failed（exec session 死了）
# 处置：不重新 dispatch！先查 DB 确认 server 端 session 存活：
opencode db "SELECT id, time_updated FROM session WHERE title='<同任务title>' ORDER BY time_created DESC LIMIT 1"
# time_updated 持续增长（seq 1648+，part type=patch）→ server agent 活跃
# 请兄弟在 Web UI 手动点「继续」续跑同一 server session（不 attach，不新建）
# bot 用 wait 脚本只监控不 attach：node scripts/wait-opencode-session.mjs <sessionId> 3600000 90000
# 结果：session 续跑完成 T1-T11 全部任务（耗时 ~50min），产出+验证全取回
```

> ✅ 关键：**CLI socket 崩溃（exit 1）≠ session 死亡**。exec session 死了但 server 端 session 还活着时，**优先 Web UI 续跑同一 session**（兄弟手动点继续）而非重新 dispatch——零重复劳动，避免双 session 冲突。判据：DB `time_updated` 仍在涨 + 事件 seq 在推进。续跑期间 bot 只监控不 attach（wait 脚本 idle 阈值 90s，Pro/max 变体 5min）

**🔴🔴🔴 识别乱码输出，不误判：**
- OpenCode 通过工具传中文路径到 PowerShell 时，错误输出中中文可能变成 `绗旇`、`锟斤拷` 等乱码
- 这些是**编码伪像**，不是实际失败
- 判断规则：
  - 错误信息路径含 `\绗旇\` 等乱码 → 先 `exec Test-Path` 确认文件真实状态
  - `Set-Content` / `WriteAllText` 报 `DirectoryNotFoundException` 但目标文件确实存在 → 编码伪像
  - `Select-String` / `ForEach-Object` 报 PowerShell parser error → 编码伪像
- **看到乱码错误 ≠ 任务失败**，继续 poll 等结果

**🔴🔴🔴 如何判断 session 是否真的卡住（不是仅凭 shell 输出静默就判卡）：**

**🔴🔴🔴 time_updated 停止 ≠ 卡住，先查 event 表区分「已完成」vs「卡住」（2026-08-01 踩坑）：**
- **踩坑实例：** 实现 session 实际 09:14 已跑完（`step-finish: stop`），但我盯着 `time_updated` 一直空等到 09:21 才确认，白等 7+ 分钟，被兄弟批评
- **根因：** session **正常完成时 time_updated 同样会停止**（不再更新），「time_updated 停了」既可能是卡死也可能是跑完，仅凭它无法区分
- **正确做法：** 当 `time_updated` 停止推进时，先查 event 表最后几条事件，看是否含完成标志：
  ```powershell
  opencode db "SELECT type, substr(data,1,250) AS preview FROM event WHERE aggregate_id='<sessionID>' ORDER BY seq DESC LIMIT 3" --format json
  ```
  - 出现 `message.part.updated.1` 且 data 含 `\"type\":\"step-finish\"` + `\"reason\":\"stop\"`（或 completed 相关）→ **session 已跑完**，立即收集产出汇报，**不要再等**
  - 最后事件是 `tool` 且 `state.status: running` 长时间（>20 分钟）不动 → 才可能是卡住
  - 最后事件是 `text` 输出 → 可能还在生成/接近完成，短等再查
- **另一个坑：查询 session 必须带 WHERE id，不要用 `ORDER BY time_created DESC LIMIT 1` 取最新**——并行任务（如 RCL Explore、nf-Colyseus）的 session 会插队，导致查到别人的 time_updated 误判自己的 session「还在活跃」
  ```powershell
  # ✅ 正确：按自己 dispatch 拿到的 sessionID 查
  opencode db "SELECT time_updated FROM session WHERE id='<sessionID>'" --format json
  opencode db "SELECT MAX(seq) AS max_seq FROM event WHERE aggregate_id='<sessionID>'" --format json
  # ❌ 错误：ORDER BY time_created DESC LIMIT 1 会拿到并行任务的最新 session
  ```
- **判定流程：** time_updated 停 → 查 event 末尾 → step-finish/stop = 完成收结果；bash running 20min+ = 卡住走 gts-opencode-stop；text 输出 = 继续短等

**🔴🔴🔴 time_updated 停 1 分钟以上 → 发「继续」信息唤醒（2026-08-11 兄弟定稿）：**
- **规则：** 监控中如果 `time_updated` 停止推进 **≥1 分钟**，不要干等，立即向该 session 发「继续」信息让它继续干活
- **方式（如何发信息，完整步骤）：**
  1. `opencode run -s <sessionID> -m <原dispatch模型> --attach http://localhost:4098 --dir <项目绝对路径> --no-replay "继续执行任务…"`
     - 🔴🔴🔴 **`-m` 必须与原 dispatch 相同模型(2026-08-13 兄弟纠正,2026-08-18 落地读 meta)**:续跑/发「继续」不带 `-m` 会 fallback 到默认模型(flash 付费版)→ Pro 审核任务被 flash 续跑质量打折、免费任务被 flash 续跑白花 go 套餐的钱(2026-08-18 兄弟查 opencode go 账单实锤 flash 花费涨)。**发「继续」前先读 `.opencode-session-meta/<sessionId>.json`**:
     ```powershell
     $meta = node scripts/opencode-session-meta.mjs get <sessionId> --dir D:\Github\GTS-Play | ConvertFrom-Json
     # found:true → -m "$($meta.provider)/$($meta.model)"; $meta.variant 非 null 才追加 --variant $($meta.variant)
     # found:false → 查 ls 最近记录 / 回查 dispatch 时刻的 -m 参数,禁止凭记忆猜
     ```
     模型知识兜底(仅 meta 缺失时参考,不替代读 meta):原 dispatch 用 Pro → `volcark/deepseek-v4-pro-ga-260813`(若用了小米 pro 则 `xiaomi-token-plan/mimo-v2.5-pro`,若实际用了 go pro 则 `opencode-go/deepseek-v4-pro`);免费组 → 当时用的那个免费模型(flash-free / hy3-free / mimo-v2.5-free / nemotron-3-ultra-free / nemotron-3.5-lightning-free / laguna-s-2.1-free 都可能是);火山 flash → `volcark/deepseek-v4-flash-ga-260731`;原 dispatch 带 `--variant max` 才续跑带 max。**核心纪律:不凭记忆猜,读 meta。**
     - 消息内容附当前进展/待解决点提示（如「实现文件在改，请继续完成 XX，跑 RED 后修到 GREEN」），让 agent 知道接着干什么
     - 必须 `--attach`（挂到既有 server session）+ `--no-replay`（不重放历史），否则会新建 session 或重读全部上下文
  2. **后台跑**：exec `background=true` + `timeout=0`（发消息的 CLI 可能很快退出，server agent 收到消息继续干活；不要用 `timeout=N` 杀 CLI）
  3. 发送后继续用 DB `time_updated` 监控：恢复增长 → 正常；仍停 → 再按上面 event 表/静默失败流程判断
- **原理：** 部分静默不是卡死，agent 停在等输入/等超时恢复；发信息能唤醒它继续。若发了继续后 time_updated 恢复增长 → 正常继续监控；仍停 → 再按上面 event 表/静默失败流程判断
- **适用范围：** 一切 poll 监控场景（Flash/Pro/GLM 等），不限于 max 模型；区别于 max 模型 80 分钟静默容忍（那是模型本身生成阶段长），普通静默 1 分钟就该唤醒
- **⚠️ 发「继续」前必须核对 session ID 属于当前任务（2026-08-11 两次误发教训）：**
   - 🔴 **相续任务例外（2026-08-17 兄弟拍板）：** 新任务与旧任务同链（同 issue/同功能后续）→ 主动对旧 session 发「继续」续接是**推荐做法**（见 2.6️⃣），不属于误发；误发仅指发到**别的任务链**的 session
  1. 发消息前先查 `opencode db "SELECT id, title, time_updated FROM session WHERE id='<sessionID>'" --format json` 确认 title 匹配当前任务（防误发到并行任务 session）
  2. **禁止对已完成 session 发「继续」**：已完成 session（event 末尾 step-finish reason=`stop`）收到 user 消息会被**重新唤醒**（time_updated 重新开始增长）→ 可能双 agent 冲突改同一批文件；误发后立即 `opencode session delete <id>` 终止（FK 约束自动停 server agent）
  3. 多任务并行时，每次发继续前都重新核对，不凭记忆里的 session ID（本次两次误发：①发到并行 forum-review ②发到已完成 review session）

**🔴🔴🔴 LLM 静默失败检测（2026-08-02 新增，兄弟定稿）：**

**背景：** 2026-08-02 一天内 2 次 session 自己断（nimble-daisy 17:43、misty-wizard 18:03），兄弟问「如何避免」。查 70MB 日志定位到断的方式：**LLM 调用静默失败** —— 不是 agent 逻辑问题，是模型请求断了/返回空。

**特征（三步确认）：**
1. **最后事件是 step-finish 且 reason=`unknown` + tokens 全 0 + cost 0**（正常完成是 reason=`stop`/`completed` 且有 tokens）
   ```powershell
   opencode db "SELECT substr(CAST(data AS TEXT),1,300) FROM event WHERE aggregate_id='<sessionID>' AND type='message.part.updated.1' AND CAST(data AS TEXT) LIKE '%step-finish%' ORDER BY seq DESC LIMIT 1" --format json
   ```
   - `reason":"unknown"` + `tokens":{"input":0,"output":0` + `cost":0` → **LLM 静默失败** ✅
   - `reason":"stop"` → 正常完成，收结果
2. **time_updated 完全停止推进**（≥10 分钟无更新）
3. **日志佐证**（可选）：最后一次 `stream` 发起后长时间无响应 → `exiting loop`
   ```powershell
   Get-Content "$env:USERPROFILE\.local\share\opencode\log\opencode.log" -Tail 8000 | Select-String -Pattern "exiting loop" | Select-Object -Last 3
   ```

**处理（兄弟明确指示，无需再等确认）：**
```
检测到 LLM 静默失败 → ① 走 gts-opencode-stop 停掉该 session → ② 汇报兄弟（附证据：reason/tokens/time_updated）→ ③ 重新 dispatch 同一 brief（新 session）
```
⚠️ 区别于「CLI exit 0 + 无 step-finish + 零改动 = 存疑需兄弟确认」：LLM 静默失败有明确的 `step-finish unknown + tokens 0` 证据，兄弟已授权直接 stop + 重 dispatch。

**避免（预防优先）：**
1. **Clash 保持 rule 模式**（global 模式下 opencode-go API 绕代理，代理抖动 = LLM 断流；2026-08-02 实测断流时 Clash 恰为 global）
2. **长任务拆小 session**（<30min，MEMORY 规则）
3. **brief 要求 agent 小步落盘**（每完成探针/断言就写文件，断了不丢进度）
4. **断了别慌：Web UI「继续」是恢复机制**（兄弟点继续后 session time_updated 恢复增长）
- OpenCode Pro / Max / GLM / Kimi 等模型可能 15-30+ 分钟无任何 shell 输出，这是**正常的工作静默期**
- **`--variant max` 模型（Pro Max / GLM Max / Sol Max）生成报告阶段可能更长时间无 shell 输出，静默至少等 80 分钟才能考虑判断**
- `wait-opencode-session.mjs --check <sessionId>` 返回 active（或 DB `time_updated` 无变化）后：
  1. **查 DB `time_updated`**：`opencode db "SELECT time_updated FROM session WHERE id='<sessionId>'" --format json`（按 id 查，勿 ORDER BY 拿最新——并行任务会插队）
  2. 对比上次查到的值——如果还在涨 → session 活跃，**继续等**
  3. 只有 `time_updated` **完全停止推进** + 进程活着**至少 80 分钟**后，才考虑 kill
  4. **判 kill 前必须先汇报兄弟，让兄弟决定**。禁止私自 kill
- **禁止仅凭 shell 输出判断卡死** — 静默 ≠ 卡住，很多模型内部工作时不输出到 shell
- **错误范例（这次踩坑）：**
  ```
  # ❌ 错误：process(poll) 返回 no new output → 25 分钟 → 私自 kill
  # GLM-5.2 Max dispatch → 25 分钟静默 → 没汇报兄弟就直接 kill
  # 实际上 pro+max 模型生成报告阶段静默 15-30+ 分钟完全正常
  # 应该至少等 40 分钟 + 汇报兄弟再决定
  ```

**判断不该停或不确定：**
```
1. 汇报兄弟「发现相同任务 OpenCode session {title} 还在跑」
2. 等兄弟指示
3. 不可私自 dispatch 新的（其它任务的 session 在跑 → 不用汇报，直接 dispatch）
```

---

**Step A — 检查 Web UI**

```powershell
# dispatch 前必须确认 Web UI 可用（🔴 端口以 opencode.json 中配置为准，常用 4098）
$attachUrl = "http://localhost:4098"
try { $null = Invoke-WebRequest -Uri $attachUrl -TimeoutSec 3 -UseBasicParsing; Write-Output "Web UI ✅ ($attachUrl)" }
catch { throw "Web UI 未就绪 ($attachUrl)" }
```

**Step B — 检查并读取 brief 文件**

```powershell
# 🔴 用绝对路径
$briefFile = "D:\Github\GTS-Play\.opencode-brief.md"

if (-not (Test-Path $briefFile)) {
    throw "BRIEF 文件已丢失！重建后再 dispatch: $briefFile"
}

$brief = Get-Content $briefFile -Raw -Encoding UTF8
if (-not $brief) { throw "brief 为空: $briefFile" }
```

> 🔴 **`-Encoding UTF8` 必加（2026-08-06 实锤）：** PS 5.1 的 `Get-Content` 默认按系统 ANSI（GBK）读取文件，而 brief 是 UTF-8 编码 → 中文全变乱码（`鏂瑰悜 3` 之类的 mojibake）→ OpenCode 收到乱码 brief，Web UI 里也显示乱码。必须显式 `-Encoding UTF8`。PS 7 默认 UTF-8 无此问题，但本机是 PS 5.1。

**Step C — Dispatch**

```powershell
# 🔴🔴🔴 2026-08-19 实锤(兄弟原话:「为什么你在做根因分析啊」):PowerShell `$brief` 传 positional 多行中文 brief → yargs 拆 arg → 静默失败(CLI 跑 N 秒,DB 无 session)
# ✅ **必须用 `--file .opencode-brief.md` + message 简短引用**(2026-08-19 实测:rca 用 $brief 侥幸成功,impl 用 $brief 51s 静默失败改 --file 后才建出 session)
# ✅ 优先用 --file flag(规避 PS + yargs 拆 positional 风险),--file 是 opencode 1.18.x 专为 brief 设计的参数
# ❌ 禁止 stdin pipe(`Get-Content ... | opencode run ...`):Windows pipe 在 `exec(background=true)` 下冷启动竞态,OpenCode 收到空 brief → 只出计划不写代码 或 静默失败

# 标准 dispatch 模板(2026-08-19 实测验证,wt3-prop-fix impl 用此模板成功):
cd D:\Github\<worktree>
opencode run "请按 brief 执行:打开 .opencode-brief.md 阅读后按 TDD 流程实现 <任务摘要>" `
  -m <按时段选模型> `
  --attach http://localhost:4098 `
  --title "<任务名,如 prop-modal-fix-impl>" `
  --no-replay `
  --auto `
  --dir D:\Github\<worktree> `
  --file .opencode-brief.md

# 模型选择:免费时段(北京 9-12/14-18)=opencode/deepseek-v4-flash-free;
# 其余时段=volcark/deepseek-v4-flash-ga-260731(复杂审核/根因分析=volcark/deepseek-v4-pro-ga-260813 火山 pro 正式版优先,备选 opencode-go/deepseek-v4-pro),
# 见 6️⃣ 时段判定;免费组全挂 → 切火山 coding plan;go 套餐=兜底(火山不可用/余额不足才用)
```

**🔴 dispatch 后立即拿 sessionId(不等 completion event)** — dispatch 后立刻查 DB 拿 sessionId 并启动 wait 脚本(exec background),再说话。拿 sessionId:`opencode db "SELECT id FROM session WHERE title='<title>' ORDER BY time_created DESC LIMIT 1"` 或 poll 一次(仅此一次 30s,挂起就放弃)。**拿不到 = dispatch 静默失败**(2026-08-19 实锤:51s CLI 跑着但 DB 无 session 记录 = yargs 拆 positional 失败)→ kill CLI + 改用 `--file` 重派。

**🔴🔴 worktree-junction.ps1 超时/locked 残留恢复 SOP(2026-08-19 实锤)**:
- worktree-junction.ps1 默认前台跑 `git worktree add` 14356 文件 checkout → Windows PowerShell 90s timeout 常被杀 → wt 目录部分 checkout + `index.lock` 残留 + `git worktree list` 报 `locked`(实测 wt3-prop-fix 11:14 触发)
- **恢复流程**(按顺序):
  ```powershell
  # 1. 清 lockfile(worktree add 残留;脚本内 -Clean 路径也会卡在这里)
  if (Test-Path D:\Github\GTS-Play\.git\worktrees\<wt-name>\locked) {
      Remove-Item D:\Github\GTS-Play\.git\worktrees\<wt-name>\locked -Force
  }

  # 2. -Clean 重跑脚本(脚本逻辑:worktree remove → 分支删 → worktree add → 357 junction)
  powershell -File scripts\worktree-junction.ps1 -Name <wt-name> -Clean
  # 脚本可能在 worktree remove 时报 "Directory not empty" → git worktree remove 不递归 → 手动清目录
  # 进程会跑 1-3 分钟(14356 文件 checkout),期间 status 报 "running"

  # 3. 若 -Clean 跑后 wt 目录残留(junction 删除失败),"cmd /c rd /s /q" 强删
  cmd /c "rd /s /q D:\Github\<wt-name>"

  # 4. 重跑 worktree-junction.ps1 不带 -Clean(目录已清,新建)
  powershell -File scripts\worktree-junction.ps1 -Name <wt-name>
  ```
- **dispatch 前必查 worktree 状态**:`git worktree list` 看是否有 `prunable/locked`;有 → 走恢复 SOP 后再 dispatch
- **dispatch 后立即验证 worktree 可用**:`Test-Path <wt>\node_modules\three`(junction 是否建好)+ `git -C <wt> ls-files <目标文件>`(git index 是否有 tracked 文件)→ 两项都 ✅ 才算 ready

**🔴🔴🔴 dispatch 必须带 `--attach http://localhost:4098` + `--title "<任务名>"`（2026-08-03 兄弟拍板，全量改回）：**
- **兄弟要求所有 OpenCode session 都挂 4098 Web UI，方便他在 Web 上看到进度**（之前我擅自改独立本地 server 不带 --attach，兄弟看不到 session 被批评）
- **`--title` 必须显式传**：`opencode run ... --attach http://localhost:4098 --title "nf-phase3-fix3" ...`。实测验证（2026-08-03 14:31）：attach + 显式 --title → 创建**独立新 session**（如 ses_039ad03a 标题 attach-probe-验证），Web UI 可见、不混入其它活跃 session
- 之前「attach 混流/无新 session」的坑，根因是**没传 --title**（session 标题取截断 prompt，多个任务难区分 / 复用旧 session）→ 现在必须显式 title
- **`--title` 命名规范：** 用简短任务名（英文小写+连字符，如 `nf-phase3-fix3`、`bone-converter-camera`），Web UI 列表一眼可辨
- 🔴 独立本地 server（不带 --attach）**仅限**：需要隔离 build agent 上下文的特殊场景（截图分析被污染教训）且**必须提前向兄弟说明原因**；默认一律 attach 4098

**🔴 dispatch 命令关键参数：**
- `-m <模型>` — 按北京时间时段选（6️⃣）：免费时段(9-12/14-18)=免费组首选 `opencode/deepseek-v4-flash-free`，其余时段=火山 `volcark/deepseek-v4-flash-ga-260731`；免费组全挂 → 切火山 flash；**火山不可用/余额不足 → 小米 → go 套餐兜底** `opencode-go/deepseek-v4-flash`（普通）/ `opencode-go/deepseek-v4-pro`（Pro 备选）；Pro 任务优先火山 pro `volcark/deepseek-v4-pro-ga-260813`，次选 `xiaomi-token-plan/mimo-v2.5-pro`
- `--variant max` — 仅超大范围任务需要（8/10 定稿：默认不用 max，max 易 LLM 静默失败）
- `--attach http://localhost:4098` — OpenCode Web UI 连接（如 4096 被占用则动态变化，以 `opencode.json` 中 port 为准）**必须带**
- `--title "<任务名>"` — 显式 session 标题，Web UI 可见可辨，**必须带**（2026-08-03 验证：attach + title = 独立新 session 不混流）
- `--no-replay` — 不使用历史回放
- `--auto` — 自动批准未被显式 deny 的权限请求（旧版 `--dangerously-skip-permissions` 已废弃！1.18.11 起必须用 `--auto`，旧参数会导致 `--title`/`--dir`/`-m` 全部解析失败 → session 挂错项目 + 用错模型）
- `--dir D:\Github\GTS-Play` — 项目根目录（必须绝对路径）
- **exec timeout=0（不限时）** — OpenCode 做复杂改动跑 15-30 分钟正常。如果设了有限 timeout 被强杀，兄弟在 Web UI 看着 session 还在跑，这里却报告失败
- **🔴🔴🔴 `exec timeout=N` 杀掉的是 CLI，不是服务器 session** — CLI 被 kill 后，WebSocket 断开，但服务器端 session 继续运行。兄弟在 Web UI 上看到的 session 仍然活着、在跑。正确的 dispatch 模式：`exec(background=true, timeout=0)` 或 `exec(background=true)` + `timeout=0`。
- **🔴🔴🔴🔴🔴 dispatch 命令一律不设短 timeout（2026-08-12 实锤，血泪教训）** — dispatch 的 exec 调用**只允许 `background=true` + `timeout=0`（或省略 timeout）**；误带 `timeout=30` 等短值 → CLI 被 SIGKILL，但 server 端 agent 继续跑 → 以为失败实际在跑 → 需用 `opencode run -s <sessionId> -m <原dispatch模型> --attach http://localhost:4098 --dir <项目> --no-replay "继续"` 唤醒取报告，白白浪费等待 + 一次唤醒。**dispatch 命令写完后自查一遍：确认没有任何 timeout 参数**（2026-08-12 bone-converter 审核 dispatch 踩坑）。⚠️ 续跑 `-m` 必须与原 dispatch 一致（2026-08-13 兄弟纠正，见上「发继续」规则），否则模型降级质量打折。

**🔴🔴🔴 权限卡住(如要写 temp 路径)如何避免与处理(2026-08-18 兄弟提问根治):**

> **根因:** agent 想写**项目外路径**(系统 temp `C:\Users\...\AppData\Local\Temp\`、桌面、下载目录等)→ 不在 edit 允许范围 → 弹权限确认 → 卡住等人工。opencode.json 没配 `agent.build.permission` 时 server 端 agent 默认对项目外路径 ask。

**✅ 已根治(2026-08-18):** `~/.config/opencode/opencode.json` 已配:
```json
"agent": { "build": { "permission": { "edit": "allow", "bash": "allow" } } }
```
→ server 端 agent 的 edit/bash **全自动批准,不再弹确认**(CLI 退出后也生效)。
⚠️ **4098 不热加载配置,改完必须重启 4098 server 才生效**(重启流程见 opencode-model-smoke-test references/opencode-server-restart.md;重启前确认无活跃 session)。

**🔴 brief 层双保险(dispatch 时必加,防 temp/项目外路径):**
- 告诉 agent:「**临时/中间文件一律写到工作目录下**(如 `<projectDir>/.tmp/` 或当前目录),**禁止写系统 temp 路径**(`C:\Users\...\AppData\Local\Temp`、`$env:TEMP`、`/tmp`);确需写系统 temp 时,在 brief 中显式声明用途再写」
- 其它易触发权限的操作(download 到系统目录、写注册表、装全局包等)同理:brief 里提前声明允许范围
- 🔴 **禁止在 brief 里教 agent 用「绕过权限」的邪道**(如 chmod 777、直接改配置文件跳权限),那是安全红线

**万一仍被卡(配置未生效 / 全新未声明路径):**
- **特征:** session 停在 tool 事件 **permission 请求**(Web UI 弹「Allow/Deny」授权框),`time_updated` 停;这是**权限等待,不是卡死/模型问题**
- **处理:** ① 兄弟在 Web UI 手动点 Allow 授权即继续;② 或 bot 用 2.5️⃣ 追加消息提示 agent「该路径未授权,改写到工作目录内路径」→ 不用发「继续」、不重 dispatch、不 delete
- ⚠️ 别把权限等待误判成 LLM 静默失败/卡死去走唤醒或重派——先看 Web UI 是否在等授权

**🔴🔴🔴 dispatch 后必须立即拿 sessionId(不等 completion event)** — dispatch 后立刻查 DB 拿 sessionId 并启动 wait 脚本(exec background),再说话。拿 sessionId:`opencode db "SELECT id FROM session WHERE title='<title>' ORDER BY time_created DESC LIMIT 1"` 或 poll 一次(仅此一次 30s,挂起就放弃)。违反后果:兄弟需要连催 3 次。

**🔴🔴🔴 拿完 sessionId 立即落盘模型记录(2026-08-18 兄弟拍板落地,防「继续」fallback 到默认 flash)**:dispatch 用 `-m <provider>/<model> [--variant <v>]` 后,立即把模型写进 `.opencode-session-meta/<sessionId>-<title>.json`(🔴 文件名必须带任务后缀,2026-08-18 兄弟要求——多任务并行时 ls 一眼可辨、防会话相互干扰;唯一可靠来源,OpenCode DB 的 step-start 不含 model 字段,已实测):
```powershell
node scripts/opencode-session-meta.mjs save <sessionId> <provider/model> [variant] --title "<title>" --dir D:\Github\GTS-Play
# 例: node scripts/opencode-session-meta.mjs save ses_xxx opencode/deepseek-v4-flash-free --title mmd-fix --dir D:\Github\GTS-Play
# 例: node scripts/opencode-session-meta.mjs save ses_xxx volcark/deepseek-v4-pro-ga-260813 max --title review --dir D:\Github\GTS-Play
```
遗漏/想不起来时可用 `node scripts/opencode-session-meta.mjs ls --dir D:\Github\GTS-Play` 对照最近 dispatch 记录,或回查本会话 dispatch 时刻的 `-m` 参数。

**🔴 Brief 文件完整性纪律：**
- dispatch 前用 `Test-Path` 确认文件存在（2026-07-23 踩坑：前一轮可能意外删了 `.opencode-brief.md`）
- 丢失 → 从内部重建再 dispatch，禁止盲目切模型重试

**🔴 Brief 预置已确认事实（2026-08-01 教训）：**
- 重 dispatch / 已知结论的任务，把**已实测确认的事实直接写进 brief**（如 Quill 1.3.7 Image blot 渲染无 alt、specs 差异清单），agent 不再重复探测
- 首次 C2 dispatch 正是死在 agent 深挖 Quill 渲染行为上；重 dispatch 预置结论后秒过
- 目的：省 agent 探索时间 + 降低中途死亡概率

**🔴 禁止 stdin pipe（`Get-Content ... \| opencode run ...`）原因：**
- Windows pipe 在 `exec(background=true)` 下冷启动竞态，写端在 OpenCode 初始化前关闭
- OpenCode 收到空/不完整 brief → 只出计划不写代码 或 静默失败
- 第二次调度时就绪 → pipe 竞态降低 → 看起来成功
- **绕过：** `$brief = Get-Content ... -Raw -Encoding UTF8` → 传参

**🔴🔴🔴 需要停 OpenCode → 调度 gts-opencode-stop（不再禁止 kill）**

一旦 dispatch，如果在执行过程中遇到问题需要停止 OpenCode session：

**第一步：收集信息判断**
1. 检查 OpenCode session 当前状态（poll/log 看有没有输出）
2. 检查 exec 进程是否还在（`process(action=list)`）
3. 检查子进程状态（E2E runner / Chrome 等）

**第二步：判断**

| 场景 | 判断 |
|------|------|
| 卡在 build/文件找不到/路径编码错/Read failed，且长时间无输出 | ⚠️ 不确定，汇报兄弟 |
| exec session 已退出但 Web UI session 还在 Running（stale） | ✅ 需要停 |
| 子进程已死但 OpenCode session 没感知（E2E runner 被杀后还在傻等） | ✅ 需要停 |
| 只是长时间无输出，但进程正常（Pro 分析可能数分钟无输出） | 不该停，继续等 |

**第三步：需要停 → 调度 gts-opencode-stop**
- gts-opencode-stop 负责精确 kill 指定 session + 杀子进程
- 不重启服务器，不影响其他 session
- 停完后继续后续流程
- **🔴 `opencode session delete` 后 FK 约束自动阻止 server 端 agent 继续**：删 session 后，服务器内存中的 build agent 尝试写回结果时触发 FOREIGN KEY 约束失败（`EffectDrizzleQueryError: FOREIGN KEY constraint failed`），无法保存 state → 自动停止。不需要重启服务器。

**第四步：不能绕过 OpenCode 自己干**
- dispatch 后 OpenCode 卡住了 → **不能自己直接跑命令替代**（node run-regression.cjs、yarn test 等）
- 绕过 OpenCode 自己跑会导致：① 自己跑的进程和 OpenCode 抢资源 ② 兄弟在 Web UI 看到 OpenCode 还在跑以为流程没结束 ③ 测试/构建结果和自己跑的不对应
- 正确做法：需要停就调度 gts-opencode-stop 停掉，然后重新 dispatch

**🔴 禁止做的事：**
- 禁止`taskkill /F` 只杀 Chrome/node 子进程不杀 OpenCode 本体（造成 stale session）
- 禁止重启 OpenCode 服务器来停 session（会杀掉所有 session）
- 禁止绕过 OpenCode 自己跑命令代替

---

### 2.5️⃣ 给运行中 session 追加消息（2026-08-10 新增，兄弟要求补录）

> **场景：** dispatch 后兄弟补充了需求（如「测试也单独文件夹」），或 bot 发现 brief 遗漏需要追加信息。**不需要 kill 重来**，直接用 HTTP API 向运行中的 server session 追加消息。

**前提：** 目标 session 挂在 4098 Web UI（attach 模式）。先拿到 session id：

```powershell
# 1. 查 session 列表（含 title，可匹配任务名）
$sessions = (Invoke-RestMethod -Uri "http://localhost:4098/api/session" -Method Get -TimeoutSec 10).data
$sessions | ForEach-Object { Write-Host "$($_.id) | $($_.title) | updated=$($_.time.updated)" }
# 认准 title 匹配自己任务的 session id（如 pmx-texture-optimize）
```

**追加消息（关键格式）：**

```powershell
$id = "ses_xxx"  # 目标 session id
$body = @{ parts = @(@{ type = "text"; text = "【补充要求】..." }) } | ConvertTo-Json -Depth 5
$body | Out-File -FilePath "$env:TEMP\msg-body.json" -Encoding UTF8
# 🔴 必须用 curl 后台发送！Invoke-WebRequest 会挂起等到 agent 处理完（超时=取消=没送达）
curl.exe -s -X POST "http://localhost:4098/session/$id/message" `
  -H "Content-Type: application/json" --data-binary "@$env:TEMP\msg-body.json" --max-time 300
```

**🔴🔴🔴 关键坑（2026-08-10 实锤）：**
1. **endpoint 是 `/session/{id}/message`（不带 /api 前缀）**，带 `/api` 前缀返回 HTML 页面
2. **body 必须含 `parts` 数组**（`{parts:[{type:"text",text:"..."}]}`），缺了返回 400 `Missing key ["parts"]`
3. **POST 是流式挂起**：请求会一直挂着直到 agent 处理完这条消息 → `Invoke-WebRequest` 默认 10s 超时会把请求取消（消息可能没送达）→ 必须 `curl.exe --max-time 300` 后台跑，或者 exec(background=true)
4. **送达验证：** `GET http://localhost:4098/api/session/{id}/message`（带 /api！）看消息列表里有没有刚发的 text；空列表 = 没送达
5. 追加消息进队列后，agent 会继续干活，**不要以为 CLI 会打印**——CLI 已 exit，监控看 DB `time_updated` 是否继续涨
6. `--no-replay` 的 session 追加消息仍有效（消息直接进 server session，不走 replay）

---

### 2.6️⃣ 相续任务优先在旧 session 续接，不开新任务（2026-08-17 兄弟拍板）

> **规则：** 新任务与旧任务有**相续关系**时，优先在旧任务 session 中续接（发「继续」消息），**不要开新 session**。省 token（不重读上下文）+ 上下文连续（agent 记得自己刚做的改动，不用重新探索）。

**相续关系的判定（满足其一）：**
- 同一 issue / 同一功能链的后续步骤（如：实现落地 → 兄弟拍板验收调整 → 同 session 续接收尾）
- 基于旧 session 的产出/结论继续（如：方案 A 落地后改验收值、fix 后的回归验证）
- 同一任务的补丁/小修（旧 session 结论里已知的待办）

**不是相续关系**（开新 session）：全新任务、不同 issue/功能、与旧 session 产出无关的任务。

**续接流程：**

```powershell
# 1. 确认旧 session 状态：已停（time_updated 不再涨）才续接；还在涨 = 正在跑，直接追加消息或等完成
opencode db "SELECT time_updated FROM session WHERE id='<旧sessionId>'" --format json
# 2. 续接（🔴 -m 必须与原 dispatch 相同模型）
opencode run -s <旧sessionId> -m <原模型> --attach http://localhost:4098 --dir <项目> --no-replay "继续：<新要求>"
# 3. 后台跑 + 按 4️⃣ 监控（poll / DB time_updated）
```

**🔴 前提核对（防误发）：**
- 续接前必须查 DB 确认旧 session 的 title 属于**同一任务链**（同 issue/同功能），误发到别的任务 session = 双 agent 冲突（2026-08-11 两次误发教训）
- 旧 session 已 completed（step-finish reason=stop）→ 续接会**主动重新唤醒**，这正是相续续接的预期行为（区别于「误发到已完成 session 需 delete」——那是发错任务的情况）
- 旧 session 上下文已接近上限（tokens ≈900K / 多次 compaction）→ 放弃续接，开新 session 带摘要（MEMORY #34b）

**反面教训（2026-08-17）：** 方案 A 落地 session（amber-ember）结束后，验收值调整（accept062）另开了新 session → 本可续接 amber-ember（改动已在其工作区，只需改断言+验证）。代价：新 session 重读全部上下文 + 双 session 开销。

---

### 🔴🔴🔴 4️⃣ 监控步骤（wait 脚本主路径，poll 降级辅助；2026-08-17 兄弟拍板）

> 🔴🔴🔴 **2026-08-17 兄弟拍板：主监控 = `wait-opencode-session.mjs`（exec background 独立进程），替代 process(poll) 每 30s 轮询。**
> **为什么换**：poll 每 30s 一次 = 每次一次 LLM 决策轮 + 全量前缀 cacheRead → 调度 1 个 2h 任务烧 240+ 轮 → bot 侧 1.6 亿 token/天（2026-08-17 实测：OpenCode 干活才 $0.83，bot 在旁边看着烧 $4.76）。wait 脚本独立进程等待期间 LLM 完全空闲，完成/异常才 wake bot 一次性处理。
> **判活逻辑不变**：脚本直读 DB `time_updated` + part 表末尾（step-finish reason=stop = 完成），与 8/15 真相一致。8/14 的 wait 脚本完成判定 bug 已修（part 表扫描替代 event 最近 6 条），脚本路线本身可靠。
> **poll 降级为辅助**：① 看进展用 `process(action=log, sessionId=<wait脚本exec sessionId>)` 读脚本 stdout（每 120s 一行状态，**log 不烧 LLM**）；② 需要实时看 agent 输出/发现异常时用 poll（单次 ≤30000，挂起即弃，改 DB 查询）。
> **禁止「exec sleep + poll」组合**（2026-08-14 实锤）；数据量上限：<5 行、每行 <50 字、每次 <200 tokens。

**dispatch 后的标准监控流程（🔴 严格执行）：**

```typescript
// 0️⃣ 🔴🔴🔴 铁律：dispatch 后必须立即启动 wait 脚本盯进展，不能等结果（2026-08-14 兄弟连续 3 次质问）
//    dispatch（exec background, timeout=0）→ 拿 sessionId → 立即 exec(background=true, timeout=0) 启动 wait 脚本
//    兄弟问「怎么样了」时用 process(log) 读脚本 stdout（最后事件类型/idle 秒数），秒答，不经过 LLM
// 1️⃣ dispatch：exec(background=true, timeout=0) 跑 opencode run（attach 模式）
// 2️⃣ 拿 sessionId：opencode db "SELECT id FROM session WHERE title='<title>' ORDER BY time_created DESC LIMIT 1"
// 3️⃣ 启动主监控（🔴 立即，不等 completion event）：
//    exec(background=true, timeout=0) node scripts/wait-opencode-session.mjs <sessionId> <maxWaitMs> <stableMs> --exit-on-stuck --title "<任务名>"
# 🔴 参数单位是**毫秒不是秒**（2026-08-19 实锤）—— 传秒值（如 7200/600）→ maxWaitMs=7200ms < POLL_INTERVAL 30s → 第一次 poll 立即 TIMEOUT 退出。正确示例：7200000 (2h) / 600000 (10min)
//    - maxWaitSec：任务预计时长，默认 3600（长任务按需调大，如 impl 类 7200）
//    - idleTimeoutSec：静默阈值，默认 300；max 变体建议 3600+（80 分钟静默容忍）
//    - DB 路径自动探测（~/.local/share/opencode/opencode.db），跨机无需改
// 4️⃣ 等待期间：turn 结束，等脚本退出（自动 wake）。兄弟消息随时处理，与监控互不干扰
// 5️⃣ 脚本退出码处理（退出后一次性决策，1 轮 LLM）：
//    exit 0 = 完成（step-finish reason=stop/completed/error）→ 验证产物/提取报告
//    exit 4 = 🔴 LLM 静默失败（wait 脚本内置检测：step-finish reason=unknown + tokens 全 0，2026-08-17 新增）
//             → 发「继续」唤醒同一 session（兄弟拍板：不重新 dispatch，不 delete）：
//             opencode run -s <sessionId> -m <原模型> --attach http://localhost:4098 --dir <项目> --no-replay "继续：<待办提示>"
//             🔴 免费模型场景（2026-08-18 兄弟拍板增补）：对同一免费模型发「继续」重试 3 次，每次间隔依次 10s / 30s / 60s，
//                3 次都无法继续（继续后仍 step-finish unknown / time_updated 停）→ 才确认该模型挂了 → 换免费组内下一个（重新 dispatch）
//             🔴 发「继续」用 .mjs 脚本（PS 5.1 读 UTF-8 无 BOM 中文会乱码报 string terminator 错；xiahui-data-fix-scheme 两次实锤）
//    exit 2 = 超时（>maxWaitSec）→ 查 DB time_updated：在涨 → 重启 wait 继续等；停了 → 发「继续」
//    exit 3 = stuck（time_updated 停 >idleTimeoutSec，--exit-on-stuck）→ 查 DB time_updated：
//             在涨（模型生成阶段正常静默）→ 重启 wait（idleTimeoutSec 调大）；
//             停了 → 发「继续」唤醒；Pro/max 生成报告阶段静默至少等 80 分钟（MEMORY 🔴）
// 6️⃣ 需要实时看 agent 输出/发现异常时：poll 辅助（单次 ≤30000，挂起即弃），CLI exit 0 ≠ agent 停止
```

**历史（追溯用，均已取代）：**
- 2026-08-15 拍板「poll 直连主路径、不用 wait 脚本」→ 2026-08-17 被本方案取代（poll 每轮烧 LLM 轮次的根因，见上方「为什么换」）
- 2026-08-14 15:50 poll「挂起」：不是 poll 工具挂，是 wait 脚本完成判定 bug（已修：part 表扫描替代 event 最近 6 条）

**poll 用法（盯进展 + 发现异常用，防挂）：**

```typescript
// poll 的目的 = 盯进展 + 发现 OpenCode 异常并处理（agent 静默卡住 → 发「继续」；请求输入；报错信息）
// 用法：
// 1. dispatch → 立即 poll CLI session（盯进展，安全）
// 2. 每轮 poll：timeout ≤ 30000，挂起/报错 → 立即放弃（不等它），改用 DB 查询
// 3. poll 挂起或 aborted ≠ 任务断 → opencode db 查 time_updated 确认真实状态
// 4. CLI exit 0 后（attach 模式）→ DB time_updated 轮询：涨=活跃；停 300s → 查 part 表末尾 →
//    发「继续」唤醒：opencode run -s <sessionId> -m <原模型> --attach http://localhost:4098 --dir <项目> --no-replay "继续"
// 5. session 已 done（step-finish stop）后禁止再 poll——直接 extract-session-text.mjs 提取结果
```

**状态决策表（process(poll) / DB / CLI）：**

| 信号 | 判断 | 下一步 |
|-----------|------|--------|
| poll 到 CLI exit 0 + DB step-finish reason=stop | 完成 | 提取最终 text（extract-session-text.mjs）汇报。dispatch 新任务前 `process(action=list)` 确认 |
| poll 到 agent 输出/事件（step-start/tool/reasoning） | 进行中 | 继续 poll（≤30s 每轮） |
| CLI exit 0 + time_updated 持续涨 | server agent 活跃 | 转 DB 轮询继续等 |
| DB time_updated 停 300s+ | 可能卡住 | 查 part 表末尾（step-finish?）→ 完成则收结果；真卡住 → 发「继续」唤醒（见下） |
| poll/exec 报错（timed out / aborted） | 窗口坏 ≠ 任务断 | **不慌**：DB 查 time_updated 或 `wait-opencode-session.mjs --check <id>` 查真实状态 |
| **Aborted / exit 0 但无总结输出** | 不确定 | **先查 DB 确认 server session 是否还在工作**（2026-08-01 踩坑：Flash CLI 显示 "This operation was aborted" + exit 0，实际 server agent 继续跑了 20 分钟）。查 `SELECT time_updated FROM session WHERE id='<sessionID>'` + event 表最后几条：time_updated 持续涨 / 有 step-finish、patch、tool 交替 → server 仍在工作，DB 轮询继续等；time_updated 停了 → 查 event 末尾按「time_updated 停止」流程判定 |
| **CLI exit 0 + event 无 step-finish + 目标文件零改动** | **存疑（不是死亡判定）** | **禁止自行重 dispatch！** 先汇报兄弟 + 附证据（time_updated 停滞时长、event 表最后事件、文件改动情况），**等兄弟确认后才可重 dispatch**。原因：「没看到完成证据」≠「agent 已停止」——server 端 agent 可能仍在内存运行（模型生成阶段、尚未写 DB 事件/文件）。与「Aborted 但 agent 仍在工作」场景的共同结论：不能自行重 dispatch，必须等兄弟（2026-08-01 兄弟明确纠正） |

#### 🔴 CLI/exec exit 0 ≠ fully done

- **exec/wait 脚本退出 ≠ OpenCode session 结束**（2026-08-14 实锤：wait 脚本 18m11s completed，但 poll 窗口挂到 25 分钟后才显示）
- **exec shell 可能在 OpenCode cleanup/discard 阶段前就退出了**，Web UI 上 session 可能还在 `Running`
- **同样注意 `Aborted` 场景（2026-08-01）：** CLI 显示 `This operation was aborted` / `Error: Aborted` 但 `exit 0`，此时 **server agent 大概率仍在内存中继续工作**（本次 Flash 修复持续 20 分钟：time_updated 不断更新、part 表 step-finish/patch 交替）。**不能当任务失败处理，更不能重新 dispatch**
- **Aborted 后的正确做法：** 用 DB 轮询监控 server session（time_updated 是否继续推进 + part 表最后类型）；最后从 part 表提取 text 总结（extract-session-text.mjs）
- **dispatch 下一个 OpenCode 前必须 `process(action=list)` 确认：**
  - 若**相同任务**的 session 还在 Running → **不能 dispatch**，继续等
  - 若相同任务 session 已 completed/failed，或只有其它任务的 session → 可以 dispatch 新的
- 2026-07-28 踩坑：Pro 审核 poll 拿到 exit 0 + 完整报告 → 以为完了 → dispatch fix 任务 → 兄弟发现前一个还在 Web UI 跑着 → 手动结束了

**结果提取（硬性上限 offset=-5）：**

```typescript
process(action=log, sessionId=<sessionId>, offset=-5)  // log 工具可靠，可用
// 或从 DB event 表提取最终 text：node scripts/extract-session-text.mjs <sessionId>
```

- 关键信息（测试结果、最终结论）在日志最后 3-5 行
- 如果 -5 不够 → 按需 -10 但需人工确认（汇报时说明原因）
- 优先 offset=-2 → 不满足才 -5 → **绝不 -10 起步**

**关键纪律：**
- 🔴🔴🔴 **主监控 = process(poll) 直连（2026-08-15 兄弟拍板）：dispatch 后立即 poll CLI session 盯进展；poll 的价值 = 盯进展 + 发现 OpenCode 异常（静默卡住发「继续」/请求输入/报错）。单次 timeout ≤30000；挂起/报错 → 立即放弃不等它，改用 DB 查询确认真实状态；session done 后禁 poll。wait 脚本已废弃为主监控（仅 `--check` 辅助）**
- 🔴 wait 脚本/DB 查完立即判断下一步，不盲目设 cron
- 🔴 每次检查只做 1 次，完成后判断下一步
- 🔴 每轮检查输出必须 <200 tokens
- 🔴 超过 20 分钟的任务：20 分钟时正常检查汇报进度
- 大部分任务 3-15 分钟完成。总检查 ~3-4 次 = ~600 tokens

**🔴 禁止因安静时间判「卡住」**
- 主监控是 process(poll) 直连 CLI session（≤30s 每轮）+ DB time_updated 轮询（间隔 ≥60s）
- 连续若干次 poll 无新输出 ≠ OpenCode 卡住（poll 工具本身会挂起，报错 ≠ 任务断）
  - Flash 可能在运行 E2E 测试（浏览器、网络等），长时间无 shell 输出正常
  - Pro 分析也可能数分钟无输出
  - **`--variant max` 模型（Pro Max / GLM Max / Sol Max）生成报告阶段可能 15-30+ 分钟无任何 shell 输出** — 这是正常的，不能判卡住
- 轮询间隔：wait 脚本内部 20s 查 DB（2026-08-14 兄弟要求加倍），bot 侧用 process list 隔一段时间看一眼即可。poll 只在需要看实时输出时用（挂起即弃）
- 如何判断是否真的卡住：
  1. `process(poll)` 无新输出 → 查 DB `time_updated`：`C:\Users\Administrator\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe db "SELECT id, title, time_updated FROM session ORDER BY time_created DESC LIMIT 3" --format json`
  2. 如果 DB 的 `time_updated` 在最近 10 分钟内还在变化 → **session 仍在活跃运行，继续等**
  3. 如果 DB 的 `time_updated` 超过 30 分钟未变化 + poll 无输出 → 可能是真的卡住
  4. Log(offset=-2) 看最后输出 + 判断上下文
  5. **注意乱码错误输出**：Poll/log 中出现 `绗旇`、`锟斤拷` 等乱码错误 → 这是中文路径通过工具传参的编码伪像，不是实际失败。先 `exec Test-Path` 确认文件真实状态。**看到乱码错误 ≠ 任务失败。**
  6. **不确定 → 汇报兄弟，不擅自停**
- **真的需要停 → 必须走 `gts-opencode-stop` skill**（先 opencode session delete 再杀残留子进程），**禁止用 `process(kill)`** 直接杀 exec session
- `process(kill)` 只杀掉 shell，不杀 Web UI 端的 session，造成 stale session 残留 → 下次 dispatch 会冲突

**🔴🔴 wait exit ≠ session 卡死(2026-08-19 实锤,prop-modal-fix impl 复盘)**:
- wait-opencode-session.mjs 默认 `maxWaitMs=3600000`(1h)→ 满 1h exit 1(TIMEOUT)→ bot 收到通知认为"还在跑",但 **session 可能早已 step-finish stop**(impl 案例:actual session 在 4:22 stop,wait 在 5:22 才 timeout 退出,期间 bot 没主动核对)
- **免费模型额度耗尽的信号**:`> Free usage exceeded, subscribe to Go`(flash-free 输出)→ 不是卡死,是模型正常收尾报"额度没了";CLI 会继续等收尾消息但**实际 session 已 stop**
- **判定三步**(收到 wait exit/timeout 后必跑,不能凭"上一条说还在跑"推断当前状态,2026-08-19 兄弟定稿):
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
- **brother 原话(2026-08-19)**:「这个早就跑完了吧?你怎么没检查」—— wait timeout/通知不构成"还在跑"的判定依据,必须重新查 DB + git log
- **预防**:wait 启动时设置合理 `maxWaitMs`(预估 1.5x);即使超时也不要立刻 kill CLI(session 仍在收尾),先查 part 表

#### 🔴 post-poll 通用钩子：检查并更新 state issue（2026-07-29 新增）

OpenCode session 完成后（poll 确认 exit + DB 确认 completed），进入下一阶段前：

1. **检查是否存在活跃的 state file**：
   ```powershell
   Get-ChildItem "D:/Github/GTS-Play/.skill-exec-state.*.json" -ErrorAction SilentlyContinue
   ```

2. **如果存在且 `completedSteps` 落后于预期** → 通知调 step-done：
   ```
   ⚠️ 检测到 state file 进度可能落后。
   建议立即调 step-done 再进下一步。
   ```

3. **如果不存在** → 本次 dispatch 不是由有状态追踪的 skill 触发的（如 gts-e2e-test 直接调用），跳过此钩子。

> 🔴 此钩子是通用安全检查，不耦合任何特定 skill。
> 上游 skill 在 dispatch 前存了 sessionId 到 state 的，poll 后必须调 step-done。
> 如果上游 skill 不是有状态追踪的（没有 skill-exec-manager 的 INIT），此钩子自动优雅跳过。

**如果发现 state 落后于实际进度（例如对话压缩后恢复）：**

```powershell
cd D:/Github/GTS-Play
# 查找 stale state file
$stateFile = Get-ChildItem ".skill-exec-state.*.json" | Select-Object -First 1

if ($stateFile) {
  $currentCount = (Get-Content $stateFile.FullName | ConvertFrom-Json).completedCount
  $actualCount = <根据对话进度填入实际完成步数>
  if ($actualCount -gt $currentCount) {
    node scripts/skill-exec-manager.cjs sync $stateFile.Name `
      --completed-count $actualCount `
      --log-entry "post-poll sync: 对话压缩后恢复，追补 $($actualCount - $currentCount) steps"
  }
}
```

> `sync` 命令是 2026-07-29 新增，专门解决 state/issue 不同步的场景。
> 它的存在不能替代「每步完成调 step-done」的纪律，只是兜底恢复工具。

---

### 5️⃣ 硬性规则（仅 SKILL 特有，已去重）

> 已全局集成的规则（入口检查、先汇报再继续、杀进程纪律、TDD纪律、编码规则等）见 MEMORY.md → 工作协议。

- 🔴🔴🔴 **并发防污染（2026-08-15 实锤，兄弟拍板 worktree 方案）** — `opencode run --attach http://localhost:4098` 会把**工作区所有未提交变更**（含其它并发 session 正在改的文件、新建的 brief）打包注入新 session 的初始 user 消息 summary.diffs。多个 session 并发同一工作区时上下文互相污染 → agent 把别的任务的 brief/文件当成自己的任务，改错文件（2026-08-15 Xiaye1 实现 session 被 mmd-bake-parallel/camera-align 任务污染，改了 30+ 个无关文件）。
  - 🔴🔴🔴 **GTS-Play 单机代码(frontend/)默认走 worktree（2026-08-17 兄弟拍板，覆盖旧判定）**：
    - **修改 GTS-Play 的单机代码（`packages/frontend/`）→ 一律切到可用的 worktree 去干活**（现有 wt1/wt2，见下方清单）
    - **没有可用 worktree → 问兄弟「是否在当前分支(dev)上干活」→ 等兄弟确认后才 dispatch**，禁止默认在 dev 直接干
    - worktree 清单：`D:\Github\wt1`（分支 wt1，基于旧 dev 07614c745）、`D:\Github\wt2`（分支 wt2，基于 9e68824d0）。wt1/wt2 均 junction 共享主仓库 node_modules（根 + 357 个嵌套），无需 install
    - 建新 worktree：`powershell -File scripts\worktree-junction.ps1 -Name <名> [-Clean]`（含级联嵌套 junction，全自动）
    - 多任务并行时优先分配不同 worktree（wt1/wt2 轮换），避免同一 worktree 内并发
  - **dispatch 前必查并发**：`opencode db "SELECT id, title, time_updated FROM session WHERE time_updated > <1小时前时间戳>"` + `git status --porcelain | Measure-Object`；存在其它活跃 session 且工作区变更 > 阈值 → 走 worktree 隔离
  - **判定边界（2026-08-15 兄弟拍板，2026-08-17 更新）：① 不同 git 仓库互不影响，不需要 worktree；② 同一仓库内不同 package 也不互相影响（attach 注入按 package 范围，OpenCode 能识别自己的任务范围），不需要 worktree；③ GTS-Play 单机代码(frontend/)修改一律 worktree（见上）；④ 其它同一 package/同一批文件的并发任务 → 才考虑隔离，且必须经兄弟确认后才能用 worktree** — attach 注入的是 `--dir` 指向仓库的未提交变更，不同仓库互不感知；不同 package 的改动在 agent 视角可区分（2026-08-15 兄弟纠正：GTS-Play 内 frontend/multiplayer/forum/bookkeeping 并发不需要 worktree）
  - **worktree 隔离流程（根治，2026-08-17 junction 版）**：
    1. `powershell -File scripts\worktree-junction.ps1 -Name <任务名> [-Clean]`（一键: 建 worktree + 根 junction + 357 个级联嵌套 junction, 无需 install; 见 `笔记/方案/2026-08-17-node_modules优化分析.md`）
    2. dispatch 时 `--dir D:\Github\<任务名>` → session 只看到自己目录的变更，零污染
    3. 完成后 merge 回主仓库（同一文件被两边改过 → 手工解冲突，如 girl/Collision.ts）；完整 merge 步骤（wt commit → dev merge → 验证）见 worktree-junction skill「完成后必须 merge 回主仓库」（2026-08-17 兄弟拍板：M 阶段前或流程结束前必须 merge，不等兄弟提醒）
  - **串行替代方案**：等其它任务全部结束、工作区 commit 干净后再 dispatch（零风险但阻塞）
  - **禁止**：dispatch 前 stash/commit 别人的未提交变更（会打断正在跑的 session）
- 🔴🔴🔴 **dispatch 后必须立即 poll — 不是先说话，先 poll 拿 sessionId 再出声**
- 🔴🔴🔴 **session 状态必须主动核对,不要等兄弟指出(2026-08-19 兄弟定稿教训 + 2026-08-19 code-review 教训)**:wait 脚本退出码 + 通知消息不能 100% 反映 OpenCode session 真实状态。多任务并行时 wait 脚本可能超时/误报,agent 可能在 wait 退出的同时刚好 commit 完成,bot 看到通知说"还在跑"但实际 done。**每次收到 wait 完成通知时**:① 用 sqlite3 查 session.part 表最后一条 `step-finish reason=stop` 是否存在 → ② 用 `git log -3` 看目标仓是否多了新 commit → ③ 在状态表格里立刻同步 ✅ done + commit hash。**不能用"上一条通知说还在跑"推断当前状态**,必须重新查 DB + git log。**兄弟原话(2026-08-19)**:"这个早就跑完了吧?你怎么没检查"

- 🔴🔴🔴 **permission auto-reject 是硬卡死信号(2026-08-19 code-review 实锤教训)**:agent 在派工 brief 没明确禁止的路径上调用 read/bash → server 端 auto-reject → agent 没回退 → 53 分钟空转 → session 看似活(最后 part 时间近)实际卡死。**预防**:
  - 跨仓/跨 workdir 派工时 brief 必须**显式列禁**:"禁止读 D:/Github/PMXReduceFace/,禁止读 D:/Github/GTS-Play/笔记/,所有信息在 brief 里"
  - brief 必须包含"如果权限被拒,改用 brief 摘要 + 已读 commit 信息继续,不要重试被拒操作"
  - agent 必须在 brief 末尾写"已读 commit 信息足够了,不要为补 commit detail 再读 git"
  - **检测**:派工后 20 分钟主动用 sqlite3 查 part 表最近 5 条事件;看到连续 `bash/read status=error error=The user rejected permission to use this specific tool call` 重复 2+ 次 = 硬卡死,立刻 `gts-opencode-stop` 杀掉,重新派(用 brief 摘要补全方式)
- 🔴🔴🔴 **Pro 模型派工后主动 20 分钟轮询一次(2026-08-19 code-review 教训)**:Pro 模型 max 静默 80 分钟正常,但 **Pro non-max** 静默 20+ 分钟就是卡死。派 Pro 后每 20 分钟主动查 DB 而不是等 wait:
- 🔴 `exec(background=true)` + `$brief` 变量传参，**禁止 sessions_spawn**
- 🔴 先写 `.opencode-brief.md` 再 dispatch，禁止空手调度
- 🔴 `exec timeout=0` 不限时 — OpenCode 跑 15-30 分钟正常
- 🔴 遇代码修改必须调度 OpenCode — 不改代码自己手写
- 🔴 flash 按北京时间时段选模型（2026-08-18 兄弟拍板 + 火山增补 + 2026-08-18 火山>go + 免费模型挂了先 3 次继续 + 2026-08-18 误判修正 + 状态文件化）：9:00-12:00/14:00-18:00 用免费组（🔴 **先读 `scripts/opencode-free-model-state.mjs get` 拿 current**，默认首选 `opencode/deepseek-v4-flash-free`，🔴 免费模型异常 → **先对同一模型发「继续」重试 3 次（间隔依次 10s/30s/60s），3 次都无法继续 + 明确错误（rate limit/429/401/5xx）才确认挂了** → **`dead` 落盘** + 换组内下一个：hy3-free / mimo-v2.5-free / nemotron-3-ultra-free / nemotron-3.5-lightning-free / laguna-s-2.1-free，🔴 静默 unknown 不算挂（删会话重开用同模型）；🔴 误判恢复：被记「挂」的模型实测可用 → **`revive` 落盘** + 回到首选 flash-free，绝不跳级切付费/火山；仅免费组 6 个全挂才切火山）；其余时段用火山 `volcark/deepseek-v4-flash-ga-260731`；**火山不可用/余额不足 → go 套餐兜底** `opencode-go/deepseek-v4-flash`（普通）/ `opencode-go/deepseek-v4-pro`（Pro 备选）；Pro 任务优先火山 pro
- 🔴 brief 末尾必须写「不需要代码审核，代码审核是单独步骤」
- 🔴 e2e 由 OpenCode 执行：跑完后**按需判断是否做截图分析**（2026-08-01 兄弟定稿）——截图是验证目标（模型/页面真实渲染、视觉效果）→ 让 OpenCode 用它的 gts-screenshot-analyze skill 分析（ImageMagick 降质 → Kimi K2.7 多模态）；截图非验证目标或场景无截图 block → brief 说明「无需截图分析」及理由，不强制分析
- 🔴🔴🔴 需要停 OpenCode → 先收集足够信息判断 → 确认需要停 → 调度 gts-opencode-stop（不重启服务器，不影响其他 session）
  - poll 没输出 ≠ 卡住。OpenCode Pro 生成分析可能数分钟无输出
  - 不确定 → 汇报兄弟，不擅自停
- 🔴 模型选择：兄弟指定模型时按兄弟说的执行，不判断
- 🔴🔴🔴 根因分析交给 OpenCode Pro — 只做数据收集，不 trace 代码路径自己分析
- 🔴🔴 **bot 主线不做重活（2026-08-15 token 审计定稿）** — 任何「需读 >3 个文件或 >5 步分析」的工作一律 dispatch OpenCode，bot 只留决策和验收：批量文件阅读、多步代码分析、数据汇总等禁止在 bot 主线逐文件 read（每个 read 2-5k token 进上下文，每轮对话都重读）。OpenCode 会话用完即弃，bot 上下文是每轮重读的贵资源。报告只读 extract-session-text.mjs / extract-opencode-report.cjs 的摘要，不读全文。
- 🔴🔴 **同类小任务合并 dispatch（2026-08-15 token 审计定稿）** — 同类小任务（如同一测试套件拆出的多个子任务、同一功能的多个小修复点）合并成 1 个 session 一次 dispatch，禁止碎片化逐个派（8/9 add-tests 一天 24 个碎片 session，bootstrap 上下文重复浪费；本周统计验证碎片化是输入 token 膨胀主因之一）。合并上限：单 session 预估 <30min 才可合并，超过仍按长任务拆 session 规则。
- 🔴 主 session 不重复跑 tsc（信任 OpenCode 自验证结果）
- 🔴🔴🔴 禁止修改 doc/ 和 笔记/语雀知识库/（brief 中必须写）
- 🔴 依赖变更时 OpenCode 必须自己跑 `yarn bootstrap --mutex network`
- 🔴🔴🔴 **长会话 token 翻篇提醒(2026-08-18 token 审计定稿,bot 主线最易踩)** — bot 主线一次对话超过 ~80 calls 或 cacheRead 累计 >40M 就该在回复中加 ⚠️ 提示「/new 翻篇」,单会话超过 ~150 calls 强制建议翻篇。判据:`scripts/token-audit.cjs` 输出 `avg cacheRead/call >200K` 或单会话 `calls >100`。
  - **自查命令**:每完成 1 个 OpenCode 任务后跑一次 `node <hermes-home>/skills/autonomous-ai-agents/hermes-session-forensics/scripts/token-audit.cjs <state.db> <YYYY-MM-DD>` → 找 `calls >100` 的会话 → 在下次回复开头附「⚠️ 该会话已 N calls / M cacheRead,建议 /new 翻篇」
  - **典型反例(2026-08-17 → 08-18)**:会话 `704e78` 跨日跑了 12h、389 calls、cacheRead 88.9M、$0.29 —— 单会话平均每次 API call 重读 228K 历史,后面每一步成本超线性增长
  - **基线对比**:OpenClaw 轮询时代 $4.76/天 vs Hermes 实际干活 $0.26/天(参考 `openclaw-to-hermes-migration/openclaw-pipeline-token-economics.md`)。Hermes 时代 cost 大头 = 长会话 cacheRead 复读
- 🔴🔴🔴 **长任务必须拆 session（>60min 预估工作量）** — 2026-08-01 实测教训：单 session 跑 6 小时 → cache read 5.3 亿 tokens、成本 $2.66、最后 ContextOverflowError 直接死（`Request exceeds the context window`，finish:error，产出只推进到 60%）。每轮工具调用重放全量历史，上下文随步骤数线性膨胀，成本超线性增长。
  - **拆法：** 预估 >60min 的任务，按逻辑单元拆多个 <30min 的短 session（每修一批 ~10 个失败 / 一个 feature 组 / 一个阶段 = 一个 session）
  - **每个新 session 必须 `--no-replay`**（干净上下文，不加载历史回放）
  - **brief 必须预置已确认事实**（已修 bug 清单 + 剩余失败分类 + 已排除的探索方向），新 agent 不重复探测
  - **每个 session 结束 = 检查点**：汇报进度 → 兄弟确认 → 再开下一个
  - **防爆判据：** 单 session 的 step-finish `tokens.total` 接近 900K（约 85% 窗口）时，即使任务没完也要主动停，开新 session 续接——不要等到 provider 拒请求
  - 短 session 效率对比（2026-08-01 实测）：6min 方案 $0.10，6h 单 session $2.66

- 🔴🔴🔴 **bot 主线长会话强制拆 session（2026-08-16 token 审计定稿，最大杠杆）** — 8/15 实测：bot 主线 2 个超长会话（7.5h / 5.5h，750/617 次调用）共烧 $7.07，其中 **cacheRead 占 91.6%**（285M 缓存读 = $7.99）。根因不是模型贵，是长会话每次调用都重读几十万 tokens 历史。
  - **硬性规则：** bot 主线执行 skill 流程时，每完成一个 phase（方案→实现→验收等）**必须归档当前会话、开新会话继续**，禁止一个会话跑完整条流水线
  - **触顶线：** 单会话 cacheRead 累计 >50M tokens（约 $1.4）或运行 >2h → 主动停，开新会话带摘要继续（参考 MEMORY #34b 上下文触顶冻结处置）
  - **续接方式：** 新会话开头贴「已完成 X / 剩余 Y / 关键结论 Z」摘要，不加载完整历史
  - **OpenCode fix 会话上限：** fix 循环 >2 轮必须拆新 session（带已修清单 + 剩余问题），禁止同一个 fix session 无限续跑（8/15 mmd-workflow-fix 单会话 3.95M 输入 $0.41）
  - **低频检查类（heartbeat/轮询）轻量化：** 不携带大上下文，纯检查直接回答，不读文件不分析

- 🔴🔴🔴 **任务粒度：每批 <30min 且必须闭环（2026-08-01 教训）** — nf-Colyseus Phase 1 跑了 8 小时没完成：Session1 6h 爆上下文死、Session2 104min 改 3 个文件留 1 个 build bug 被 Aborted。**根因：一批任务量太大（34 个失败一次修）。**
  - **每批只派 1 个原子单元**（1 个 feature 组的失败 / 1 个 build 错误 / 1 个阶段），改完立即 build+jest 验证全绿才算完成
  - **计划是 bot 的，不是 agent 的**：bot 每批派一个单元，绿灯才放行下一个；禁止给 agent 一个 8 项大计划让它一路推到底
  - **每个 session 结束 = bot 自己跑 build+jest 验证**，不绿 → 不发下一批，回炉重派

- 🔴🔴🔴 **build 红 = 阻塞，禁止扩展（2026-08-01 教训）** — Session2 在 16:00 跑 build 发现 Room.res:365 前向引用错误，但没回头修，继续改了 25 分钟 seat 逻辑，最后 Aborted 时错误还在。**根因：agent 把 build 当「最终验证」不是「每步门禁」；todo 按文件组织，完成标准是「代码改完」不是「验证通过」。**
  - **brief 必须写硬性命令（第一优先）：**「任何时刻运行 build/jest 出现错误 = 当场修复，禁止开始任何新文件的修改。修复中禁止切换任务。连续 3 次修复尝试仍失败 → 立即停止，输出失败详情，不要继续。」
  - **todo 结构 RED→GREEN 原子单元：** 每单元 = 「修什么 + 用什么命令验证 + 必须全绿才算完成」；单元没绿禁止动下一个单元的文件
  - **brief 末尾写「为什么」：**「验证是门禁不是仪式。上一个 session 改了 3 个文件后一次性 build，发现前向引用错误时已积累 3 个文件的红灯，最后中断什么都没留下。」

- 🔴🔴🔴 **brief 文件隔离（2026-08-01 教训）** — `.opencode-brief.md` 是全局共享文件，并行任务（Tripo）会覆盖它 → 新 agent 读到的 brief 是别人的任务，预置事实全丢。
  - 多任务并行时，每个任务用独立 brief 文件：`.opencode-brief-<task>.md`（bot 在命令行 `$brief` 变量传参，不受文件名限制）
  - 或直接命令行内联传参，不依赖共享文件

- 🔴🔴🔴 **并行任务隔离（2026-08-01 教训）** — 同时只跑一个 OpenCode 任务，多任务排队。今天 Tripo+forum+nf-Colyseus 三线并行：共享 brief 被覆盖、git status 混入 3 个任务的改动、DB 查询难分彼此。

- 🔴🔴🔴 **一个 OpenCode session 只做一件事，拆并行 session（2026-08-19 兄弟拍板）** — 多个独立修复点/独立模块/独立子任务必须**并行**派多个 session，**不**在一个 session 里塞多件事。
  - **核心规则：**
    - 一个 session = 一个原子单元（一次 commit / 一个修复点 / 一个独立模块）
    - 多个独立单元 → **并行**派多个 session（不是串行派一个 session 干多件事）
    - 避免交叉影响（一个 session 改 cloth 算法，另一个改 snapshot 渲染，互不污染）
    - brief 颗粒度对齐：每个 session 独立 brief、独立验收、独立 commit
  - **反模式（必避免）：**
    - 一个 session 里既改算法又改 snapshot —— agent 上下文切换导致质量下降
    - 一个 session 跑完再派下一个 —— 串行浪费时间
  - **实例（2026-08-19 mmd_tool）：**
    - Phase Fix-r5（cloth 算法加 40% 覆盖率阈值）+ Phase Fix-r6（snapshot 渲染修空图）= 拆两个并行 session
    - 两个 session 改不同文件（r5 改 cloth-data-rules-generate.mjs，r6 改 snapshot-oneclick.cjs / snapshot-view.html），无文件冲突
    - 都用 free 模型（`opencode/deepseek-v4-flash-free`），同时 dispatch，wait 脚本独立监控
  - **判定时机：** dispatch 前先问"这次要改的是几个**互不依赖**的修复点？"——多个 → 拆并行；单个 → 一个 session。互依赖（必须前一步产出后下一步才能开始）→ 串行或同 session。
  - **workdir 共享注意：** 两个并行 session 若 `--dir` 相同，文件系统层互相可见（git status / node_modules 共享）；避免在工作区同时跑 `npm install` / `git commit` 等全局操作。文件级不冲突即可并行。

- 🔴 **dispatch 调度 checklist 固化（2026-08-01 教训，2026-08-03 更新 --title）** — dispatch 前逐项核对：
  1. 模型全名（按北京时间时段：免费时段 9-12/14-18 用免费组首选 `opencode/deepseek-v4-flash-free`，其余时段用火山 `volcark/deepseek-v4-flash-ga-260731`；Pro 任务优先 `volcark/deepseek-v4-pro-ga-260813`，次选 `xiaomi-token-plan/mimo-v2.5-pro`；免费组全挂 → 火山；**火山不可用/余额不足 → 小米 → go 兜底** `opencode-go/deepseek-v4-flash`；续跑/发「继续」用当前 session 原 dispatch 的模型——免费组任意一个、火山 flash/pro 或 go 都可能）
  2. `--attach http://localhost:4098`（先 netstat 确认端口，漏了 Web UI 看不到 session）**必须带**
  3. `--title "<任务名>"`（**必须带**，2026-08-03 兄弟拍板：所有 session 挂 4098 他才能在 Web 看到；attach+title=独立新 session 不混流，实测验证）
  4. `--no-replay`
  5. `--auto`（不是 `--dangerously-skip-permissions`，已废弃）
  6. `--dir D:\Github\GTS-Play`（绝对路径）
  7. `$brief` 变量传参（非 stdin pipe）

---

### 6️⃣ 模型选择速查

#### 复杂度判断 — 先判后选

| 判断维度 | 简单 ✅ Flash 一刀切 | 复杂 ❌ Flash 出方案+实现，Pro 仅审核/根因分析 |
|----------|-------------------|-------------------------------|
| 模式清晰度 | 已有现成模式可复制 | 需要重新设计架构或协议 |
| 影响范围 | 单模块、单文件、不跨包 | 跨包、跨模块、API 签名变更 |
| 变更类型 | 本地化改动、配置调整、已有模式扩展 | 性能优化、安全约束、数据一致性 |

**当前可用模型（免费组优先，2026-08-18 兄弟拍板 + 火山增补）：**

> 🔥 **volcark provider 配置（2026-08-18 增补，实测连通 + 推理已开启）**：
> - 已注册到 `C:\Users\Administrator\.config\opencode\opencode.json` 的 `provider.volcark`（baseURL=`https://ark.cn-beijing.volces.com/api/coding/v3`，apiKey 用 `{env:ARK_CODING_API_KEY}` 引用，不硬编码）
> - 模型 id：`deepseek-v4-flash-ga-260731`（Flash 正式版）/ `deepseek-v4-pro-ga-260813`（Pro 正式版），dispatch 用全名 `volcark/deepseek-v4-flash-ga-260731` 等
> - 🔴 **推理必须显式开（2026-08-18 实测，否则不支持推理）**：火山模型的 `options` 里必须配 `"thinking": {"type": "enabled"}`（已配好），否则 opencode 不传 thinking 参数、模型不做推理（DB part 表无 `type=reasoning` 块、tokens 无 reasoning 计数）。配好后 flash/pro 推理均生效（实测：pro 简单题 reasoning=67 tokens，flash reasoning=1）。注意不是用 `--variant`——opencode 的 variant 对自定义 provider 不会自动映射到火山的 thinking 参数，靠 options.thinking 才是真生效
> - 🔴 **4098 server 不热加载 provider 配置（2026-08-18 实测）**：改 opencode.json 后 attach 4098 dispatch 火山模型报 `ProviderModelNotFoundError: Model not found: volcark/...` → **必须重启 4098 server（`opencode serve`）才生效**；重启会中断所有活跃 session，重启前先确认无活跃 session 或等兄弟确认
> - 连通性验证：`opencode run <brief> -m volcark/deepseek-v4-flash-ga-260731 --title <t> --no-replay --auto --dir D:\Github\GTS-Play --port <独立端口>`（不带 --attach 用独立端口，不影响 4098）

```
opencode/deepseek-v4-flash-free       # Flash Free（免费组首选，默认）
opencode/hy3-free                     # Hy3 Free（免费组第 2 顺位）
opencode/mimo-v2.5-free               # MiMo v2.5 Free（免费组第 3 顺位）
opencode/nemotron-3-ultra-free        # Nemotron 3 Ultra Free（免费组第 4 顺位）
opencode/nemotron-3.5-lightning-free  # Nemotron 3.5 Lightning Free（免费组第 5 顺位）
opencode/laguna-s-2.1-free            # Laguna S 2.1 Free（免费组第 6 顺位）
volcark/deepseek-v4-flash-ga-260731   # 🔥 火山 coding plan Flash 正式版（非免费时段默认 + 免费组兜底首选，优先级>go，2026-08-18 实测连通）
volcark/deepseek-v4-pro-ga-260813     # 🔥 火山 coding plan Pro 正式版（Pro 任务优先，优先级>小米>go pro，2026-08-18 实测连通）
xiaomi-token-plan/mimo-v2.5-pro       # 小米 token plan Pro（Pro 次选，火山 pro 不可用时，2026-08-19 增补）
opencode-go/deepseek-v4-flash         # Flash 付费版（兜底，仅火山不可用/余额不足时用）
opencode-go/deepseek-v4-pro           # Pro 兜底（火山 pro 不可用/余额不足时用）
opencode-go/kimi-k2.7-code            # 备选
opencode-go/minimax-m2.7              # 备选
opencode-go/qwen3.7-plus              # 备选
```

**选模型策略（2026-08-18 兄弟拍板，按北京时间时段；2026-08-18 再定：火山 > go 套餐，go 是兜底）：**
- 🔴 **dispatch 前先判时段（北京时间 UTC+8）**：
  ```powershell
  $bjHour = [DateTimeOffset]::Now.ToOffset([TimeSpan]::FromHours(8)).Hour   # 0-23
  $freeWindow = ($bjHour -ge 9 -and $bjHour -lt 12) -or ($bjHour -ge 14 -and $bjHour -lt 18)
  ```
  - `$freeWindow = $true`（9:00-12:00 / 14:00-18:00）→ 免费模型组
  - `$freeWindow = $false`（其余时段）→ 火山 coding plan（flash / pro）
- **免费时段**：所有普通任务用免费模型组，🔴 **先读状态文件拿当前模型**（`node scripts/opencode-free-model-state.mjs get --dir D:\Github\GTS-Play` → 用 `current`），默认首选 `opencode/deepseek-v4-flash-free`；🔴 故障轮换规则（2026-08-18 兄弟拍板 + 3 次重试增补 + 2026-08-18 误判修正 + 状态文件化）：当前模型异常 → **先对同一免费模型发「继续」重试 3 次（间隔依次 10s / 30s / 60s），3 次都无法继续 + 明确错误（rate limit/429/401/5xx）才确认挂了** → **`dead` 落盘 + 只换组内下一个**（`hy3-free` → `mimo-v2.5-free` → `nemotron-3-ultra-free` → `nemotron-3.5-lightning-free` → `laguna-s-2.1-free`），**不切付费版**；🔴 静默 unknown 不算挂（删会话重开继续用同模型）；🔴 **误判恢复：被记「挂」的模型实测可用 → `revive` 落盘 + 回到首选 flash-free**；免费组 6 个全挂/额度用完 → **切火山（不是 go）**
- **非免费时段（默认）**：普通任务 `volcark/deepseek-v4-flash-ga-260731`（火山 flash 正式版），复杂审核/根因 `volcark/deepseek-v4-pro-ga-260813`（火山 pro 正式版优先，次选 `xiaomi-token-plan/mimo-v2.5-pro`，备选 `opencode-go/deepseek-v4-pro`）
- 🔥 **火山 coding plan 优先级 > 小米 token plan > go 套餐（2026-08-19 兄弟拍板增补小米）**：普通任务火山 flash（`volcark/deepseek-v4-flash-ga-260731`），重活火山 pro（`volcark/deepseek-v4-pro-ga-260813`）；**火山 pro 不可用 → 小米 pro 备选**（`xiaomi-token-plan/mimo-v2.5-pro`）；**小米也不可用 → go 套餐兜底**——只有火山/小米不可用/余额不足时才用 `opencode-go/deepseek-v4-flash` / `opencode-go/deepseek-v4-pro`
- ⚠️ **go 套餐 Insufficient balance 全挂**（2026-08-17 实锤：连续 5 次 dispatch/续跑失败）→ go 本来就是兜底，优先级低于火山；go 挂了回退免费组（免费时段）或火山（其余时段）
- **Pro 仅保留给**：复杂代码审核 / 复杂 bug 根因分析 / 出方案等重活（dispatch 前查 opencode.log 确认非 Insufficient balance；🔴 2026-08-18 兄弟拍板：**pro 场合不用免费模型顶替**——pro 余额不足/不可用 → 汇报兄弟等充值或恢复，禁止降级免费组跑 pro 的活；Pro 优先级：火山 pro → 小米 pro → go pro，三个都挂才汇报兄弟）

> ⚠️ 下表为**免费时段**（北京 9-12/14-18）默认值；**非免费时段**普通任务全部换 `volcark/deepseek-v4-flash-ga-260731`（火山 flash），Pro 行优先火山 pro（次选小米 pro `xiaomi-token-plan/mimo-v2.5-pro`，备选 opencode-go），**火山/小米不可用/余额不足才轮到 go 套餐兜底**；免费组全挂 → 切火山 coding plan（见上）。

| 任务类型 | 模型参数 | 说明 |
|----------|---------|------|
| 简单任务/出方案 | `-m opencode/deepseek-v4-flash-free` | 免费组首选；不可用换组内其它免费模型 |
| 简单修复/常规实现/重构 | `-m opencode/deepseek-v4-flash-free` | Flash Free（默认，余额不依赖） |
| Verify（场景覆盖检查） | `-m opencode/deepseek-v4-flash-free` | 同上 |
| 代码审核（简单：工具类/测试代码/非架构/<=50行修改） | `-m opencode/deepseek-v4-flash-free` | 2026-08-17 兄弟拍板：简单修改不上 Pro；免费组优先 |
| 代码审核（复杂/架构级：跨包、API 签名变更、大规模改动） | `-m volcark/deepseek-v4-pro-ga-260813` | 🔥 2026-08-18 增补：火山 coding plan Pro 正式版优先；不可用次选 `xiaomi-token-plan/mimo-v2.5-pro`（2026-08-19 增补），备选 `opencode-go/deepseek-v4-pro`；**默认 variant，不用 max**（2026-08-10 定稿：Pro max 本机 exec 环境易 LLM 静默失败；max 仅超大范围审核且做好 80 分钟静默等待预期） |
| 方案/架构设计 | `-m opencode/deepseek-v4-flash-free` | 2026-08-17 兄弟拍板改 Flash；brief 写「只写specs不写代码」；若属复杂重活方案 → 火山 pro（volcark/deepseek-v4-pro-ga-260813） |
| 复杂 bug 根因分析 | `-m volcark/deepseek-v4-pro-ga-260813` | 🔥 2026-08-18 增补：火山 coding plan Pro 正式版优先；不可用次选 `xiaomi-token-plan/mimo-v2.5-pro`（2026-08-19 增补），备选 `opencode-go/deepseek-v4-pro`；不自己分析根因 |
| 免费模型额度用完兜底 | `-m volcark/deepseek-v4-flash-ga-260731` | 🔥 2026-08-18 增补 + 火山>go：免费组 6 个全挂/额度用完 → 切火山 Flash（不是 go）；火山也挂/余额不足 → go 兜底 |
| 兄弟指定模型 | 按兄弟说的执行 | — | 不判断 |

> 🔴 **不再使用 `--agent plan`：** plan agent 禁止写文件，但 specs 需要创建 .md。改用 build 模式（默认）+ brief 中明令「只能写 specs 不写代码」。
>
> 🔴 **`--auto` 必加：** 所有 dispatch 命令必须带此参数，自动批准权限请求。
>
> 🔴 **`--dangerously-skip-permissions` 已废弃（2026-08-06 实锤）：** opencode 1.18.11 的 `run --help` 已无此参数，只有 `--auto`。传旧参数 → yargs 解析错乱 → `--title`/`--dir`/`-m` 全部失效：session title 变自动生成、directory 挂到 CLI cwd（workspace 而非 GTS-Play）、model 变 server 默认（deepseek-v4-pro 而非 flash）。实例：2026-08-06 vmdgen-standToLying-fix 三次 dispatch 全挂错项目页，兄弟在 Web UI 看不到会话。
>
> 🔴 **CLI 退出后 server 端 agent 不继承 CLI 参数（2026-08-01 踩坑，2026-08-18 已根治配置）**：CLI 进程退出（exit 0）后，server 端 agent 继续跑时按 server 配置走，**不继承** `--auto`。✅ **已配置（2026-08-18）**：`~/.config/opencode/opencode.json` 的 `agent.build.permission` 已加 `"edit": "allow", "bash": "allow"` → CLI 退出后 server agent 的编辑/命令操作也全自动，不再弹权限确认。⚠️ 改了此配置后 **4098 不热加载，必须重启 4098 server 才生效**（见「🔴🔴🔴 权限卡住如何避免」小节）。临时救急（配置未生效期间）：兄弟在 Web UI 手动授权即可继续。
