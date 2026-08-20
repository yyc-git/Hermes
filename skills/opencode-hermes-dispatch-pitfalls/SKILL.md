---
name: "opencode-hermes-dispatch-pitfalls"
description: "OpenCode 调度实战坑（Hermes / PowerShell 环境, 2026-08-19 兄弟拍板沉淀）。覆盖恢复中断会话必须先清旧session、4 种 PowerShell 调度失败模式、opencode.json 默认 model 陷阱、DB 锁竞争时 sqlite3 直查。opencode-schedule 主 skill 不可 patch（人工创建, agent-created 不在白名单），本 skill 沉淀实战发现。"
---

# opencode-hermes-dispatch-pitfalls — Hermes 环境下 OpenCode 调度实战坑

> ⚠️ **本 skill 不是 opencode-schedule 的替代品**。opencode-schedule 是协议本尊（人工创建, agent 不能 patch）。本 skill 是 Hermes / PowerShell 7 环境下的实战补丁，沉淀兄弟在 2026-08-19 现场打脸后沉淀的具体问题。

> **兄弟原话（2026-08-19）**：「你怎么不会调度了？没有调用调度 opencode skill 吗？付费版只是最后的兜底啊」 → 这两句话对应本 skill 两个核心教训。

---

## 🔴 wait 脚本 `stableMs` 必须 ≥ BDD/单测运行时间（2026-08-20 实锤,gts-auto 默认 120000 太短）

**实测案例**(`ses_fe306c129ffeurtU5hLv797Hbp` + `ses_fe2e7f560ffewUdU0Jt6CXW7oX`):

- PMXReduceFace 35+5 BDD 场景 + RED/GREEN 切换 + 全量 jest 实测 **3-5 分钟**
- 默认 `stableMs=120000`(2 分钟) → wait 误判 idle 触达退出,但 agent 实际 `step-finish reason=tool-calls` + tokens=138K(有进度) → **agent 还活着**
- 实测:用 `stableMs=900000`(15 分钟) 才不出问题

**wait 退出后必查 part 表 step-finish reason**:

```powershell
C:\sqlite\sqlite3.exe C:\Users\Administrator\.local\share\opencode\opencode.db "SELECT substr(CAST(data AS TEXT),1,200) FROM part WHERE session_id='<sid>' AND CAST(data AS TEXT) LIKE '%step-finish%' ORDER BY time_updated DESC LIMIT 1;"
```

| step-finish reason | tokens | cost | 判断 | 下一步 |
| | --- | --- | --- | --- |
| `stop` / `completed` | | | ✅ 真完成 | 收产物汇报 |
| `unknown` | = 0 | = 0 | ❌ LLM 静默失败(模型断流/额度用完) | 走 LLM 静默失败 SOP:`dead <model>` + `get` 拿 current + 重 dispatch |
| `tool-calls` / `running` | | | ⚠️ **agent 还在跑**(跑 BDD/reduce/verify) | **立刻发「继续」唤醒,不发「继续」就死** |

**派工 brief 必含**:`stableMs` 建议值(根据预估 BDD 时间)+「完成时显式写 step-finish reason=stop + commit hash」方便 bot 核对。

## 🔴 socket 崩了 ≠ session 死亡（2026-08-20 实锤）

**症状**:`proc_*` CLI exit 1 + "Error: The socket connection was closed unexpectedly" + 后续 `proc_*` 派工也失败。

**判定**:CLI exit 1 ≠ server 端 session 死。查 DB `time_updated` 仍涨 = server agent 还在内存中跑(只是 CLI 这边 socket 断了)。

**处理**:
1. 查 DB 确认 server 端 session 存活(`time_updated` 仍涨)
2. **不要重 dispatch**(双 session 冲突 + 浪费 token)
3. 兄弟在 Web UI (4098) 手动点「继续」续跑同一 server session,bot 用 wait 脚本只监控不 attach
4. 或发 `opencode run -s <sid> -m <原模型> --attach http://localhost:4098 --dir <项目> --no-replay "继续"`(必须 -m 与原 dispatch 一致,从 `.opencode-session-meta/<sid>.json` 读)

**预防**:`--no-replay` flag 在某些 session 触发 BUN `UnknownError` 崩在 SessionPrompt.command → 但 `--no-replay` 是必须的(防历史重放),**不能去掉**。socket 崩是个别 case,接受偶发 + 用 Web UI 续跑兜底。

## 🔴 改动纪律精简(2026-08-20 兄弟拍板,覆盖 8-18 过度约束)

**兄弟原话**:「不需要我拍板啊,你直接dispatch。修改纪律:只有还原文件、git checkout的操作才需要我确认」

**红线条目**(仍需兄弟拍板):
- `git checkout` / `git restore` 还原文件
- `git reset --hard` / `git stash pop` / `rm -rf` 不可逆操作
- 改 `doc/` 和 `笔记/语雀知识库/` 目录(兄弟手动维护)
- CloudBase 数据库集合增删改查
- 线上/单机部署(必须兄弟确认)
- 装依赖前(`yarn bootstrap`)

**非红线条目**(bot 直接干不需拍板):
- 改源码/复制文件/创建目录/改 build 配置/调阈值/加功能
- 写 brief / dispatch / 合并 wt / 重 dispatch 同 brief
- 改 skill 文件 / 改 memory / 改 AGENTS.md
- 启用之前注释掉的代码

**误读过度约束 = 兄弟拍桌**:
- 「你直接让会话继续啊」(2026-08-18)
- 「你去修复下啊」(2026-08-18)
- 「不需要我拍板啊」(2026-08-20)
- 「你为什么没有先删除旧的会话再dispatch啊」(2026-08-19)

## 🔴 派工后通知精简(2026-08-20 兄弟拍板,终极简化)

**兄弟原话**:「不需要告诉我」+「间隔太久了!而且这样消耗token大吗?」

**核心规则**:**派工后绝对不主动通知「在跑」**(零通知)。只在三种情况通知:
1. ✅ 任务完成 / git commit 落地(读 log + 报告)
2. ❗ agent 红灯 / 卡死 / 60+ 分钟无进展
3. ❓ 兄弟主动问时

**绝对不**说「已 dispatch,sessionId=X,模型=Y,请稍等」之类开场白。

**轮询与 token 真相**:
- `process(action=log, session_id=<wait_id>, limit=2)` 查 wait stdout 是**纯工具调用 token=0**(跟 OpenClaw 老 poll 每轮触发 bot 整轮对话 + 全量 cacheRead 烧 2 亿+ 完全两回事)
- Hermes `notify_on_complete` 自动唤醒 bot 后**一次性** `process(action=log, offset=-2)` + `git log -3` + 整轮回复 = ~1000 tokens
- **混淆 OpenClaw 老 poll 与 Hermes 工具调用是错的** — 兄弟原话「每次才 1000token 吗?这很少可忽略不计」,1000 token 是整轮回复烧的,不是轮询本身
- 自动轮询间隔:60s(标准模式)/ 120s(全自动模式)— token=0 但增加 signal 量,通知到达即停

## 🔴 LLM fail 三态分类(2026-08-20 兄弟拍板,实测沉淀)

| 失败类型 | step-finish reason | tokens | cost | 处置 |
| | --- | --- | --- | --- |
| **rate limit / 429 / quota** | 任何 | 任意 | 任意 | 等窗口 / 换模型 |
| **401 / timeout / 5xx** | 任何 | 任意 | 任意 | 瞬时 → 同 session 发「继续」3 次(10s/30s/60s) |
| **纯静默 `unknown`** | `unknown` | = 0 | = 0 | 删会话重开 → 重 dispatch 同 brief(flash-free 额度用完会明确报 rate limit,不会静默 unknown) |
| **socket 崩** | 无 step-finish | 任意 | 任意 | 查 DB time_updated → 还在涨 = server 还活着,Web UI 续跑(详见上节) |
| **OOM / Bun log 锁** | `tool-calls`/无 | 任意 | 任意 | 重 dispatch + 简化任务 |

**核心原则**:`step-finish reason=unknown + tokens=0 + cost=0` 是模型额度耗尽或彻底断流的硬信号,**不是卡死**。立即 `dead` 落盘 + 切下一个免费模型。

## 🔴 命令行 brief 传参 3 坑(2026-08-20 实测)

**已落 `gts-dispatch-preflight`**:① `--command` 是 OpenCode 注册命令,普通 message 必须 positional;② `--attach` 必须带 `http://localhost:4098`;③ `--no-replay` 在某些 session 触发 BUN `UnknownError` 崩在 SessionPrompt.command → 派工默认**不加 `--no-replay`**(实际看,本次测 `--no-replay` 是必要的,CLI 崩是个别 case → 见上节 socket 崩处理)。

## 🔴 Session 活跃判定 = DB `time_updated` 是唯一 ground truth（2026-08-20 实锤）

> **兄弟原话(2026-08-20)**:「A v2 在跑啊!」—— bot 误判 volcark flash 静默挂 + 误删 A v1 重派 A v2, 都源于此条规则被违反。

**判定口诀**:看 `session.time_updated`, **不看 `message.tokens.total`**(可能被截断为***)。tokens 是输出统计, 不是生死信号。

| 判定信号 | 含义 |
|---|---|
| `session.time_updated > now-600000`(10min 内) | ✅ **活跃**, 不管 message.tokens/finish 长什么样 |
| `last message.tokens.total = 0` + `finish` 缺失 | ❌ **不是静默挂**——只是中间消息被截断 |
| `step-finish reason=tool-calls` | ✅ **还活着**(agent 在处理工具结果) |
| `step-finish reason=stop/completed` | ✅ **真完成** |
| `time_updated` > 20min 没动 + DB 有 step-finish 记录 | ⚠️ 边界,需查 part 表确认 |
| `time_updated` > 30min 没动 | 🔴 真挂, 启动 gts-opencode-stop |

**实测查询命令**:
```powershell
C:\sqlite\sqlite3.exe "$env:USERPROFILE\.local\share\opencode\opencode.db" `
  "SELECT id, datetime(time_updated/1000,'unixepoch') AS updated FROM session WHERE id='<sid>'"
```

**反例(2026-08-20 代价)**:A v2 实际 tokens=173K + reasoning=11K + finish=tool-calls = 正常思考中, 但 bot 看到"tokens=*** + finish 缺失"判"静默挂" → 误加 volcark flash blacklist + 准备重派 → 兄弟拍桌纠正。浪费了 1 个 session + 1 次 dispatch。

---

## 🔴 静默挂判定不要轻易加 blacklist（2026-08-20 兄弟拍板）

> **兄弟原话(2026-08-20)**:"volcark flash 现在可以用啊! 3次静默挂是指如果它不能用后, 你要隔断时间再试它2次啊, 而不是不同的任务或者不同的模型!"

**判定挂死 → 加 blacklist 的硬条件(全部满足)**:
1. ✅ 同一 session/同一 brief 持续 `step-finish reason=unknown` + `tokens.total=***`
2. ✅ 对该 session 发「继续」3 次(间隔 10s / 30s / 60s),3 次都失败
3. ✅ 同一模型在**最近 1-2 小时内**有 ≥2 个不同任务都出现同样症状

**反模式**:
- ❌ 看到 1 个 session 静默 → 立即加 blacklist → 把 volcark flash(实际可用)误杀
- ❌ 不同任务/不同时间看到同样症状 → 当作"模型挂" → 实际可能是 server 卡 / 工作区冲突 / 某个 session 死循环

**recover 命令**:
```powershell
node scripts/opencode-free-model-state.mjs revive <model> --dir D:\GitHub\GTS-Play
```

---

## 🔴 notify 越界前 5 步验证纪律（2026-08-20 实锤）

**场景**:bot 看到 `git diff` 里有些文件被删 → 直接 notify.ps1 "agent 越界删了别人 PMX" → 兄弟拍桌"虚惊一场"。

**5 步验证纪律(必须走完才 notify)**:

| # | 步骤 | 工具 |
|---|---|---|
| 1 | 查 `session.time_updated` 看 session 是否真在跑 | sqlite3 DB |
| 2 | 查 `part` 表最近事件, 看是不是我们派的 session | sqlite3 DB |
| 3 | `event.data LIKE '%<filename>%'` 找原始 session ID | sqlite3 DB |
| 4 | 比对原始 session ID 是不是当前派工的 session ID | 比对 |
| 5 | 确认后才 notify + 写明"哪一 session 在什么时间删的" | notify.ps1 |

**反例(2026-08-20 代价)**:bot 看到 git diff 有 2 个 PMX 标记 `D` → 直接 notify "agent 越界" → 兄弟质问 → 查 DB 发现是 **8-15 旧 session (mmd-workflow-fix) 未提交的工作残留**, **不是我派的 4 个 session 干的** → 虚惊一场, 浪费 1 条通知 + 兄弟拍桌。

**搜索哪个 session 引用了文件**:
```powershell
C:\sqlite\sqlite3.exe "$env:USERPROFILE\.local\share\opencode\opencode.db" `
  "SELECT aggregate_id, seq, type FROM event WHERE CAST(data AS TEXT) LIKE '%<file_pattern>%' ORDER BY seq DESC LIMIT 5"
```

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

## 🔴 兄弟硬偏好(违反即浪费 token, 兄弟会质问)(2026-08-20 拍板版)

**模型优先级(Pro 场景,任何 fix/feat/plan-review/root-cause 默认走 Pro)**:
1. 首选 `volcark/deepseek-v4-pro-ga-260813`(火山 Pro)
2. 火山挂了 → `mimo-v2.5-pro`
3. mimo 挂了 → `opencode-go/deepseek-v4-pro`(**仅兜底,从不首选**)

**模型优先级(Flash 场景,实施型任务 / 简单 fix)**:
1. 免费组首选 `opencode/deepseek-v4-flash-free`(按 `opencode-free-model-state` 状态文件轮换: flash-free→hy3-free→mimo→nemotron-3-ultra→nemotron-3.5-lightning→laguna-s-2.1)
2. 免费组全挂 → `volcark/deepseek-v4-flash`(火山 flash)
3. 火山也挂 → `opencode-go/deepseek-v4-flash`(**仅兜底,从不首选**)

**铁律**:**`opencode-go/*` 永远兜底**。dispatch 命令**必须** `-m` 显式走优先级第一位,挂了就按 2-3 步走,**不要省事直接 opencode-go**。

**opencode.json 默认 model 陷阱**:`~/.config/opencode/opencode.json` 顶层 `"model": "opencode-go/deepseek-v4-flash"` 是 server 默认值,CLI 不传 `-m` 就 fallback 到它(付费兜底)。**任何 dispatch 不显式 `-m` 都会违反兄弟硬偏好**。

**兄弟期望的 dispatch 行为**:
- 问"怎么样了" + bot 查 DB → 看到 `model:"opencode-go/deepseek-v4-..."` 不应该出现(除非优先级 1-2 都挂了)
- 兄弟默认信任 bot 用了"对的"模型 → bot 不能让信任白给

**兄弟每次问「怎么样了」必须 30s 内回答 DB 状态或产物清单,不能让兄弟等**。

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

## 🔴 Flash 模型「复读 brief」不改文件（2026-08-20 实锤，连续 3 轮复现）

**症状**：dispatch 后 agent 只输出 brief 文本（part 表 `type: text`），不调用任何 tool（无 `type: tool`/`type: patch`），step-finish 后 `git diff --stat` 无文件改动。

**实测**：flash-free 连续 3 轮（J/J2/J3）复读同一 brief，第 4 轮换 mimo-v2.5-pro（J4）立即成功改文件。

**根因**：flash-free 在某些任务上下文（含 `.opencode-brief` + 长指令）下触发「复读」行为——读完 brief 后直接输出文本，不进入编辑流程。可能是上下文窗口或指令遵循能力不足。

**识别方式**：
1. wait exit 0 → `git diff --stat` 无改动
2. part 表只有 `type: text`，无 `type: tool`/`type: patch`
3. agent 输出内容 = brief 原文（复制粘贴）

**处置**：立即换模型重派（mimo-v2.5-pro 或火山 flash），不要重试 flash-free。重派时 brief 内容不变，只换 `-m` 参数。

**预防**：简单任务（≤5 行改动）如果 flash-free 复读 1 次 → 直接换 pro，不要浪费 3 轮。

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

**检测（派 Pro 后通知到达一次性查，不主动轮询，2026-08-20 修订）**：兄弟拍板「派工后不主动轮询」(成本/收益不符),改为**等 Hermes `notify_on_complete` 自动唤醒 → 一次性** `process(action=log, offset=-2)` + 查 DB part 表:
```powershell
C:\sqlite\sqlite3.exe C:/Users/Administrator/.local/share/opencode/opencode.db `
  "SELECT substr(data,1,300) FROM part WHERE session_id='<sid>' ORDER BY time_updated DESC LIMIT 5"
# 看到连续 2+ 条 tool status=error + "The user rejected permission..." = 硬卡死
# → gts-opencode-stop 杀掉 → 补全 brief 摘要重新派
```

**兄弟原话（2026-08-19 质问）**：「为什么这么久等没检测到？如何避免」—— 派 Pro 后**必须主动查 DB**(2026-08-20 修订:不轮询但通知到达必查),不能仅凭 wait 脚本判定(perm-deny 后仍收到 part 记录,wait stableMs 失效)。

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

## 🔴 Bun/AVX crash — 部分模型触发 CLI 段错误（2026-08-20 实锤）

**症状**：`opencode run` CLI 立即 crash，exit code 3，输出：
```
panic(main thread): Failed to start HTTP Client thread: Unexpected
panic(main thread): Illegal instruction at address 0x...
CPU lacks AVX support. Please consider upgrading to a newer CPU.
oh no: Bun has crashed.
```

**根因**：opencode CLI 是 Bun 编译的单文件。部分模型（如 `volcark/deepseek-v4-pro`）的 API 调用路径触发 Bun 不兼容的代码段（CPU 缺 AVX 指令集）。不是所有模型都触发——同机器上 `mimo-v2.5-pro` 正常。

**处理**：
1. CLI crash（exit 3 + "panic"）→ **立即换模型重试**（不等 3 次）
2. 优先换同级别模型：pro→mimo pro，flash→火山 flash
3. 如果所有模型都 crash → 汇报兄弟（可能是机器级问题）

**实测**：2026-08-20 volcark pro 连续 2 次 Bun crash → 换 `mimo-v2.5-pro` 立即正常

**与 opencode.json 默认 model 陷阱的区别**：那个是"没传 `-m` 用了付费兜底"，这个是"传了 `-m` 但 CLI 本身 crash"。两者都会导致 session 没创建，但根因不同。

---

## 🔴 brief 多 Phase 导致 agent 只完成容易的部分（2026-08-20 PMXReduceFace 实锤）

> **brief 写了 Phase 1(检测) + Phase 2(算法) → agent 完成 Phase 1(加 270 行检测代码)就报完成,核心算法没改。** 用户看到「verify 通过」以为修好了,实际视觉空洞依旧。

**根因**:BDD/verify 只检查拓扑不检查几何,检测工具增强不等于问题修复。Agent 优先完成容易的(加检测代码)而跳过难的(改算法)。

**规则**:
1. brief 只写**一个核心目标**,不要分 Phase。多步 = 多个独立 brief + 独立 dispatch
2. 验证标准必须包含**视觉检查**(不仅是工具输出)
3. binary 文件(如 PMX)改完后必须**杀掉 dev server + 重启**才能生效(webpack-dev-server 不热加载二进制文件)

**反例**:brief「Phase 1 修检测 + Phase 2 修算法」→ agent 停在 Phase 1,40/40 BDD 全绿但空洞依旧
**正确**:brief「修 collapseCreatesHole 让它拒绝所有产生空洞的折叠。不改检测工具。HOLE_TOL 保持不变」→ agent 聚焦算法

## 🔴 Pro 场景模型降级铁律（2026-08-20 实锤）

> 火山 pro 报「5小时usage quota exceeded」→ 我降级到 flash-free → 兄弟拍桌「这是pro场合，照理说火山pro挂了，应该用什么模型？」

**铁律**:Pro 场景的模型降级链 = **Pro 级别内轮换**,绝不跨级别降级:
1. 火山 pro → **小米 pro**(mimo-v2.5-pro) → go pro
2. ❌ ~~火山 pro → flash free~~ (降级到 Flash = 违反铁规)
3. 免费时段也不能用 Flash 顶替 Pro 任务

## 🔴 dispatch 前两步检查（2026-08-20 实锤，连续犯 2 次）

**兄弟原话**：「调度之后没有wait和定期轮询吗？」「为什么没有用停止skill停止旧的？」

**两步检查（dispatch 前 10 秒，缺一不可）**：

| # | 检查 | 命令 | 不通过则 |
|---|------|------|----------|
| 1 | **停旧 session** | `gts-opencode-stop` skill 流程（查 DB → delete → 三重验证） | 不能 dispatch 新的 |
| 2 | **查 free model 状态** | `node scripts/opencode-free-model-state.mjs get --dir <project>` | 用 current 模型；额度耗尽 → dead + 切下一个再 dispatch |

**反模式**：
- ❌ 直接 dispatch 不查旧 session → 双 session 冲突
- ❌ 直接 dispatch 不查 free model → 用已耗尽的免费模型 → 浪费一轮 + CLI exit 0 但无产出
- ❌ dispatch 后不管，等兄弟问才查 → 兄弟拍桌「你怎么没有检测到？」

**正确流程**：
```
停旧 session → 查 free model 状态 → dispatch(用 current) → 启 wait + watchdog
```

---

## 📚 CLI 参数条件跳过模式（skipThreshold pattern）

> 适用于：CLI 工具需要「显式传参时用简化逻辑，未传时保持原始行为」的场景。

**问题**：`--skip-threshold` 默认值 50000 会让小 fixture（测试用 3902 面）也被跳过，破坏测试。

**方案**：用 `xxxGiven` 标记区分显式传参 vs 默认值：

```javascript
// parseArgs:
else if (a === '--skip-threshold') {
  args.skipThreshold = parseInt(argv[++i], 10);
  args.skipThresholdGiven = true;  // 标记显式传入
}

// reduceFaces destructuring:
const { skipThreshold = 50000, skipThresholdGiven = false } = opts;

// 跳过条件：
const skipCond = skipThresholdGiven
  ? totalTri <= skipThreshold           // 显式传入 → 简化逻辑
  : (totalTri <= targetTri && totalTri <= skipThreshold);  // 默认 → 保持原始
if (skipCond) { /* skip */ }
```

**适用场景**：
- 新参数想引入更宽松/更严格的逻辑，但不想破坏现有测试
- 默认值需要向后兼容，显式传入才启用新行为
- demo/生产环境需要不同行为（demo 传 `--skip-threshold 50000`，测试不传）

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