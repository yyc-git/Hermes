---
name: "opencode-dispatch-pitfalls"
description: 2026-08-19 实测踩坑 — 派工前必 load opencode-schedule skill + 多行 brief 传参 6 种姿势失败 + CLI 默认 model fallback + 误判兄弟 session 归属 + Bun log 文件锁根治
tags: []
related_skills: []
---

# OpenCode Dispatch 实测踩坑（2026-08-19 三连击）

> 来源：xiaHui-fix-phase0-plan dispatch 任务，兄弟三次质问"怎么样了？付费版只是兜底""你怎么不会调度了？""你怎么不问就 stop?"——核心是**没有 load opencode-schedule skill 就开干**，硬试多种 CLI 传参姿势全部踩坑。

## 🔴 教训 1：dispatch 流程不是看一眼就知道，要 load skill

兄弟原话："你怎么不会调度了？没有调用调度 opencode skill 吗？"

**根因**：本次 dispatch 我**没先 `skill_view('gts:opencode-schedule')` 看完整规范**，只凭记忆 + 部分经验开干，导致：
- 多行 brief 传参试了 6 种姿势（Start-Process/& / pipe/-f/cmd/bash）全失败
- 没意识到 CLI 不传 `-m` 时会 fallback 到 server 默认 model `opencode-go/deepseek-v4-flash`（付费兜底）
- 看到类似自己 title 的 session 就想 stop，差点误伤兄弟正在跑的 `prop-modal-fix-rca`

**铁律**：**dispatch 前必 load skill**（至少 `opencode-schedule`）。本 skill 已经把多行 brief 传参写进 Step C（"$brief 变量传参非 stdin pipe"），但**Step C 默认假设 $brief 是单字符串**——多行 brief 在 PowerShell 下拆分详见下方"教训 2"。

## 🔴 教训 2：多行 brief 传参 6 种姿势全失败（2026-08-19 实测）

| 方式 | 症状 | 根因 |
|------|------|------|
| `Start-Process opencode.exe -ArgumentList @('run', $brief, '-m', '...')` | 进程秒退、log 空、DB 无 session | PowerShell 把 `$brief` 多行字符串当多个 arg 拆分；yargs 看到第一个 token 像 `--help` 就报 help 退出；`Start-Process -ArgumentList @()` 数组也不救 |
| `& 'opencode.exe' run $brief ...` (Hermes) | exit 124 / "Foreground command uses '&' backgrounding" | Hermes terminal 把 `& opencode` 误判为 backgrounding,自动 token kill |
| `Get-Content brief.md \| opencode run ...` | 永远挂起、CLI 不退 | Windows pipe 在 `exec(background=true)` 下冷启动竞态；CLI 等 agent 处理完才返回 |
| `Start-Process opencode.exe -ArgumentList @('run', '-f', brief.md, ...)` | log 空、进程秒退 | `-f` flag 在 attach 模式 + 多文件 args 场景解析异常 |
| `cmd /c "opencode run $brief ..."` | brief 被截断、CLI fallback 到 server 默认 model | `cmd.exe` 不支持多行字符串 → `$brief` 截断成第一行 → CLI 缺 message → 用 server 默认 `opencode-go/deepseek-v4-flash`（付费兜底） |
| `bash -c "...sed ... $brief ..."` | 路径转义错误、dispatch 不发 | bash 嵌套引号 + 多行 brief 在 PS→bash 边界极易破坏 |
| `--command "请按 brief 执行..."` 想走 brief message | `Error: Command not found: "<msg>". Available commands: init, review, ...` | **`--command` 是 OpenCode 1.18.x 注册命令**(init/review/customize-opencode/...),**不是 message 字段**。普通 message 必须用 positional `message..` 或 `--file` 附件,见下方表下解法 |

### ✅ 2026-08-19 实测新姿势(prop-modal-fix-impl 修复成功):`--file .opencode-brief.md` + 简短 message

兄弟原话:"为什么你在做根因分析啊?"——关联的另一个 dispatch 静默失败根因(prop 白屏 fix 期间):

- rca 派工用 `$brief` 侥幸成功(同一时段 10:55)
- impl 派工用 `$brief` 51s CLI 跑着但 DB 无 session 记录(11:24)—— yargs 拆 positional 失败
- 改用 `--file .opencode-brief.md` flag + 简短 message("请按 brief 执行:打开 .opencode-brief.md 阅读后按 TDD 流程实现 ...")→ DB session 立即出现

**✅ 改用 `--file` 写法(推荐,2026-08-19 实测)**:

```powershell
cd D:\Github\<worktree>
opencode run "请按 brief 执行:打开 .opencode-brief.md 阅读后按 TDD 流程实现 <任务摘要>" `
  -m opencode/deepseek-v4-flash-free `
  --attach http://localhost:4098 `
  --title "<任务名>" `
  --no-replay --auto `
  --dir D:\Github\<worktree> `
  --file .opencode-brief.md
```

**🔴 关键**:
- `--file` 是 opencode 1.18.x 专为 brief 文件设计的参数(`opencode run --help` 验证:`-f, --file  file(s) to attach to message [array]`)
- brief 文件路径在 `--dir` 解析后是相对路径 → 必须先 `cd <worktree>` 或传绝对路径
- message 简短一句话引用 brief 内容(agent 拿到 message 后自己 read brief 文件)
- ❌ 禁止 `$brief` positional 传多行中文内容(PS + yargs 拆 arg 风险,时灵时不灵;同会话内 rca 成功 → impl 失败就是教训)

**何时仍用 spawn 写法(重型方案)**:`--file` 不能解析的特殊 brief(如含二进制附件、要传 stdin-pipe 输入)时回退到 spawn,但 99% 场景 `--file` 够用,且比 spawn 简洁。

**dispatch 后立即验证 session 真创建**(拿不到 = 静默失败,30s 内必查):

```powershell
opencode db "SELECT id FROM session WHERE title='<title>' ORDER BY time_created DESC LIMIT 1" --format json
# 返回空 = dispatch 静默失败 → kill CLI + 检查 CLI 退出码(>0 = CLI 报错;0 但无 session = yargs 拆 positional 失败)
```

### ✅ 唯一重型姿势:`child_process.spawn` 数组传参

```js
// .tmp-dispatch-<task>.cjs（项目根临时脚本，git add 时排除）
const { spawn } = require('child_process');
const fs = require('fs');

const brief = fs.readFileSync('.opencode-brief-<task>.md', 'utf8');
const oc = 'C:\\Users\\Administrator\\AppData\\Roaming\\npm\\node_modules\\opencode-ai\\bin\\opencode.exe';

const args = [
  'run', brief,                                         // ← multi-line string 直接当 message[0] 数组元素
  '-m', 'opencode/deepseek-v4-flash-free',              // ← 必传！否则 server fallback 到付费 go
  '--attach', 'http://localhost:4098',
  '--title', '<task-name>',
  '--no-replay', '--auto',
  '--dir', 'D:\\Github\\GTS-Play',
];

const child = spawn(oc, args, {
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

child.stdout.on('data', (d) => process.stdout.write('[STDOUT] ' + d.toString()));
child.stderr.on('data', (d) => process.stderr.write('[STDERR] ' + d.toString()));
child.on('exit', (code) => {
  console.error(`[EXIT] code=${code}`);
  process.exit(code || 0);
});
```

跑法：
```powershell
node .tmp-dispatch-<task>.cjs 2>&1 | Out-File $env:TEMP\dispatch-<task>.log
```

**踩坑要点**：
- brief 必须 utf8 读（默认 ANSI 读 UTF-8 中文乱码）
- argv 数组里 brief 是单独元素（node spawn 内部 argv[0]=oc, argv[1]='run', argv[2]=brief）；**绝对不要把 brief 拼到 args 字符串里**
- stdio: ignore stdin（避免 pipe 竞态）、pipe stdout/stderr（写 log 验真）
- windowsHide:true（不弹黑色 console 窗口）
- 跑完确认 log 首行含 `> build · <model-name>`（不是 `opencode run [message..]` help 文本）= dispatch 真发出

## 🔴 教训 3:CLI 默认 model fallback 陷阱 + 兄弟 8-20 拍板模型优先级

**根因**:`C:\Users\Administrator\.config\opencode\opencode.json` 顶层 `"model": "opencode-go/deepseek-v4-flash"` 是 server 默认值,CLI 不传 `-m` 就用它。OpenCode 不会自动按兄弟免费时段偏好选免费组。

**兄弟硬偏好(2026-08-20 拍板)** — **Pro 场景**:
1. 首选 `volcark/deepseek-v4-pro-ga-260813`(火山 Pro)
2. 火山挂了 → `mimo-v2.5-pro`
3. mimo 挂了 → `opencode-go/deepseek-v4-pro`(opencode-go 仅兜底)

**兄弟硬偏好(2026-08-20 拍板)** — **Flash 场景**:
1. 免费组(按顺序): `opencode/deepseek-v4-flash-free` → `opencode/hy3-free` → `mimo` → `nemotron-3-ultra` → `nemotron-3.5-lightning` → `laguna-s-2.1`
2. 免费组全挂 → `volcark/deepseek-v4-flash`(火山 flash)
3. 火山也挂 → `opencode-go/deepseek-v4-flash`(opencode-go 仅兜底)

**铁律**:**`opencode-go/*` 永远兜底,从不首选**。dispatch 前**显式** `-m` 走优先级第一位,挂了就按兄弟硬偏好 2-3 步走,**不要**省事直接 opencode-go。**付费版是最后兜底,不是首选**。

### 🔴 派工前必跑 Step 0:free-model-state 文件读取(2026-08-20 兄弟实锤纠错)

**兄弟 2026-08-20 原话**:"flash场景不是优先用免费组吗?你怎么回事啊?"

**触发场景**:任何 dispatch(无论免费/付费时段)在写 `opencode run -m <model>` 之前,bot 凭印象写了"火山 flash + Pro 试→免费组轮换 fallback",**完全反向**——免费时段必须用免费组首选,不是 fallback。

**硬性 Step 0(派工前必跑)**:

```powershell
# 派工前 1 步(无论时段)
node scripts/opencode-free-model-state.mjs get --dir D:\Github\GTS-Play
# 输出:{"current":"opencode/deepseek-v4-flash-free","blacklist":[]}
# current 即为派工用的 -m 参数(免费时段)
# 非免费时段默认 = volcark/deepseek-v4-flash-ga-260731
```

**禁止的派工模式**:
- ❌ 凭记忆/印象写 `-m volcark/...`(免费时段必须用 free current)
- ❌ 用"免费组 → 火山 flash"以外的优先级顺序
- ❌ 跳过 `get` 直接派工(即使前 5 次派工都用了同一个模型)
- ❌ 派工后**才**意识到用错了模型(发现时已经烧 1 次 session)

**正确的派工模式**:
1. 读时段(`bjHour` 9-12/14-18 = 免费时段)
2. 读 state 文件(`get` → `current`)
3. 用 `current` 写 `-m`(免费时段 = free current;非免费时段 = 火山 flash/pro)
4. Pro 任务一律 `volcark/deepseek-v4-pro-ga-260813`(火山 pro 优先),不走免费组
5. dispatch 后**立即**写 `.opencode-session-meta/<sid>.json`(见下方"session-meta 落盘")

**与 dispatch-checklist.md Step 0 的衔接**:Step 0 查 OpenCode DB 同任务活跃 session(避免双 session 撞车),本节查 free-model-state(避免用错模型)。**两者都必跑**。

**🔴 dispatch 后必须查 session.model 字段验证**：

```powershell
opencode db "SELECT substr(CAST(data AS TEXT),1,400) FROM message WHERE session_id='<sid>' ORDER BY time_updated ASC LIMIT 1" --format json
# ↑ data JSON 里有 model:{providerID,modelID} 字段
# 期望(免费时段):"model":{"providerID":"opencode","modelID":"deepseek-v4-flash-free"}
# 错了(用了付费兜底):"model":{"providerID":"opencode-go","modelID":"deepseek-v4-flash"}
```

**验证结果处理**：
- ✅ model 字段是预期的 → 落盘 `.opencode-session-meta/<sid>-<title>.json`，继续监控
- ❌ model 字段不是预期的（用了付费兜底）→ 立即 `opencode session delete <sid>` 停掉，重新 dispatch（必须传 `-m`）

### 🔴 dispatch 后立即写 session-meta 文件(2026-08-20 实测,4 session 并行踩坑)

**触发**:派工后 30 秒内必须落盘 `.opencode-session-meta/<sid>.json`(兄弟硬偏好,续跑时读出并遵循 model 绑定,**不能靠 `-m` 参数**)。

**反面教材(2026-08-20 XiaHui fix 4 session 并行实测)**:bot 派了 4 个 session,只写了 3 个 session-meta,A v2 重派时**忘写 meta** → 后续 verification 检查发现 FAIL 才补写。**派工 + 写 meta 必须是同一个原子动作,不能"先派再补"**。

**正确流程(派工后 30 秒内三件套)**:

```powershell
# 1. 拿 sessionId(opencode DB 查)
$id = C:\sqlite\sqlite3.exe "$env:USERPROFILE\.local\share\opencode\opencode.db" "SELECT id FROM session WHERE title='<task>' ORDER BY time_created DESC LIMIT 1"

# 2. 写 meta 文件(.opencode-session-meta/<sid>.json,文件名 = sessionId + .json)
$meta = @{
    sessionId  = $id
    title      = "<task-title>"
    task       = "<一句话描述>"
    modelID    = "<如 volcark/deepseek-v4-flash-ga-260731>"
    providerID = "<volcark|opencode|...>"
    variant    = "default"
    startedAt  = "<UTC ISO>"
    briefPath  = ".opencode-brief-<task>.md"
    issuePath  = "<关联 issue 路径>"
    step       = "<B2|C|M|...>"
} | ConvertTo-Json -Depth 3
$meta | Out-File ".opencode-session-meta\$id.json" -Encoding utf8

# 3. 启 wait 脚本(terminal(background=true, notify_on_complete=true))
```

**禁止**:派工后**忘写** meta 等到 verification 检查 FAIL 才补——verification 会盯这个,补写 ≠ 原子动作。

**模型绑定用途**:续跑同一个 session 时(`opencode run -s <sid> "继续..."`),`-m` 参数被 server 忽略,直接用 session 绑定的 model。所以**meta 必须写 model 字段** 才能续跑正确。

**为何 6 次 dispatch 都失败**（2026-08-19 实测）：
1. 兄弟问"怎么样了？付费版只是兜底啊"——发现自己前一轮用了 `opencode-go/deepseek-v4-flash`
2. 想用 `-m` 显式传 → 但 PowerShell 多行 brief 传参问题让我失败 6 次（Start-Process/& / pipe/-f/cmd/bash 全踩坑，详见教训 2）
3. 最终靠 `child_process.spawn` 数组传参才成功
4. **记忆点**：兄弟问"怎么样了" → 第一件事查 session.model，发现用了付费版 → 不绕弯路 stop 重派

**🔴 dispatch 调试清单（失败时按序排查，不要重试）**：

| 序号 | 排查项 | 命令 | 期望 |
|------|--------|------|------|
| 1 | opencode.exe 路径 | `Test-Path 'C:\Users\Administrator\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe'` | True |
| 2 | 4098 server 监听 | `netstat -ano \| Select-String ":4098.*LISTENING"` | 至少 1 行 |
| 3 | opencode 进程活 | `Get-Process -Name opencode` | ≥1 行 |
| 4 | CLI 帮助版能跑 | `opencode run --help` | 输出 usage 不报错 |
| 5 | brief 完整（UTF-8） | `Get-Content brief.md -Raw -Encoding UTF8 \| Measure-Object -Character` | >0 且中文不乱码 |
| 6 | CLI 退出码 | 看 dispatch log | 0 = 正常 dispatch；非 0 = CLI 报错 |
| 7 | DB session 创建 | `opencode db "SELECT id FROM session WHERE title='<task>' ORDER BY time_created DESC LIMIT 1"` | 至少 1 个 |
| 8 | session model 字段 | `opencode db "...message WHERE session_id='<sid>' ORDER BY time_updated ASC LIMIT 1"` | provider/model 与预期一致 |

任一项不符 → 修该项 + 重 dispatch；不要反复改 brief / 重试命令。

## 🔴 教训 4：stop session 前必须三重身份核对

兄弟原话："你怎么不问就 stop？"

**反面教材**（2026-08-19 实测踩坑）：兄弟在 Web UI 跑自己的 `prop-modal-fix-rca` 任务（标题看着像 rca 审核），模型用火山 Pro，改的文件是 `笔记/项目文档/issue/...-Prop_Q_*.md` —— 我误以为是"上一轮 stale session"想 stop，**幸亏被 token kill 救下**（前面 dispatch 命令 `--help` 触发了 backgrounding 检测，stop 命令没真发出）。后续对话兄弟才指出"你怎么不问就 stop"。

### stop 前 4 步身份核对（30 秒内）

```powershell
# 1. 查 session 元数据
$env:OPENCODE_DB = "C:\Users\Administrator\.local\share\opencode\opencode.db"
opencode db "SELECT id, title, time_created, time_updated FROM session WHERE id='<sid>'" --format json

# 2. 看 session 当前 message/summary.diffs（它正在改什么文件？）
opencode db "SELECT substr(CAST(data AS TEXT),1,400) FROM message WHERE session_id='<sid>' ORDER BY time_updated DESC LIMIT 1" --format json

# 3. 看 server model 字段（它用哪个模型跑的？）
opencode db "SELECT substr(CAST(data AS TEXT),1,300) FROM message WHERE session_id='<sid>' ORDER BY time_updated ASC LIMIT 1" --format json
# ↑ 第一条 message 含 model:{providerID,modelID} 字段

# 4. 看该 session 的 .opencode-session-meta/<sid>-<title>.json 文件存不存在
Test-Path "D:\Github\GTS-Play\.opencode-session-meta\<sid>-<title>.json"
```

### 判定矩阵

| 信号 | 判定 | 动作 |
|------|------|------|
| title 是自己 brief 的 title + summary.diffs 改的文件在 brief 范围 | **自己的** | 走 gts-opencode-stop |
| title 是兄弟其他任务（如 `prop-modal-fix-rca`、`test-dispatch`、`test-dispatch3`） | **兄弟的** | **禁止 stop**，汇报兄弟 |
| title 撞名（都叫 `phaseFix-rN`）但 summary.diffs 改的文件不在自己 brief 范围 | **兄弟的**（撞名） | **禁止 stop** |
| meta 文件不存在 + model 不是自己 dispatch 的 | 高度怀疑兄弟的 | 先汇报兄弟再决定 |

### 🔴 判归属的硬性原则

- **没经兄弟同意前，任何 opencode session 都按"非自己"处理**
- 自己 dispatch 的 session 必有 `.opencode-session-meta/<sid>-<title>.json`（兄弟 dispatch 的不会写这个路径）→ **Test-Path meta 是最权威归属判据**
- 实在拿不准 → 汇报兄弟，等指示

## 🔴 教训 5：跨仓审核派工权限卡死 + Bun log 文件锁（2026-08-19 code-review 实测）

**场景 A：审核 agent 跨仓读被拒 → 静默空转 53 分钟**

- 派工 workdir=`D:\Github\wt1`，但 brief 要求审 PMXReduceFace 仓（独立仓）+ GTS-Play 笔记
- agent 尝试 `git show` 跨仓 → **permission auto-reject**（external_directory）
- agent **没回退**，卡在 perm-deny 后空转 53 分钟，session 看似活（time_updated 近）实际死
- **如何检测**：派工后 20 分钟主动 sqlite3 查 part 表最近 5 条，看到连续 `status=error error="The user rejected permission"` 重复 2+ 次 = 硬卡死
- **修复**：`curl POST /session/{id}/message` 发"继续"提示 agent 改用 brief 摘要（本会话实测有效，agent 收到后出完整报告）
- **预防（brief 必写）**：
  - `禁止读 D:/Github/PMXReduceFace/，禁止读 D:/Github/GTS-Play/笔记/，所有信息在 brief 里`
  - `如果权限被拒，改用 brief 摘要 + 已读 commit 信息继续，不要重试被拒操作`
  - 审核 agent 用 `--file .opencode-brief.md` 时，brief 里**把所有 commit 的 diff 摘要都写全**（跨仓 commit 尤甚，否则 agent 拿不到关键 diff 信息）

**场景 B：Bun log 文件锁 → CLI 派工报 `FileSystem.open (opencode.log)`**

- 症状：`opencode run` 立即报 `Unknown: FileSystem.open (C:\Users\Administrator\.local\share\opencode\log\opencode.log)`，exit 1，DB 无 session
- **根因（2026-08-19 Restart Manager API 实测确认）**：opencode 1.18.x 是 Bun 编译的 178MB 单文件。Bun 的 `Bun.file(path, {flag: "a"})` append 模式在 Windows 上实际用 `FileShare::None`（非共享句柄）。**当多个 opencode 进程同时活着**（1 server + N CLI client），新 CLI 启动时 open 同一 log → 被已有进程独占句柄挡住 → `FileSystem.open` 失败
- **什么时候触发**：兄弟 dispatch 了多个并行 session（如用不同免费模型重试同一任务）→ 多个 CLI 进程同时活着 → 新 dispatch 撞锁。不是"server 长时间运行"的问题，是**并发进程数量**的问题
- **根治（已验证 2026-08-19）**：设 `XDG_DATA_HOME` 到独立 temp 目录，让 log 文件走 temp，同时 `OPENCODE_DB` 指回原 DB 路径（保持 server 共享）：
  ```javascript
  // Node child_process.spawn 模板：
  const env = Object.assign({}, process.env, {
    XDG_DATA_HOME: path.join(os.tmpdir(), `opencode-log-${process.pid}`),
    OPENCODE_DB: path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db'),
  });
  const child = spawn(oc, ['run', brief, '-m', model, '--attach', 'http://localhost:4098', ...], { env });
  ```
- **检测方法**：查 opencode 进程数 + log 文件句柄
  ```powershell
  Get-Process opencode | Format-Table Id,StartTime,@{n='WS(MB)';e={[math]::Round($_.WorkingSet64/1MB,1)}}
  # 4 个 opencode 进程 = 1 server + 3 CLI = log 锁概率极高
  ```
- **临时缓解**（等兄弟 session 自然结束）：不杀兄弟进程，等锁释放后重试
- **不推荐**：杀 server 重启（会断所有活跃 session）；XDG_DATA_HOME 隔离是零干扰方案

**关联**：审核报告 false-negative 教训（agent 跨仓读被拒后基于 brief 推理、可能凭空捏造 bug）见 `gts-code-review` skill"审核报告可能 false negative"段——bot 转达前必须 ad-hoc 独立验证最高优先级条目。

## 🔴 教训 6：wait-opencode-session.mjs 参数单位是 **ms** 不是 s（2026-08-20 实锤）

**症状**：dispatch Pro 后启动 wait 脚本后台盯，**30 秒后 wait 报 "TIMEOUT max wait reached" 退出 1**。但 DB `session.time_updated` 仍在涨（Pro 在推理中）—— wait 脚本误报 timeout,等真要命的 80 分钟思考期到了反而没盯。

**根因**：wait 脚本签名是 `node scripts/wait-opencode-session.mjs <sessionID> [maxWaitMs] [stableMs]`,**单位是毫秒**。我之前按记忆传 `5400 1800`(以为是秒),实际 **5400ms = 5.4 秒**,立刻触发 maxWaitMs 超时。gts-auto 主表和 skill 文字里写"maxWaitSec"是**错的**,跟脚本源码不一致 → 以脚本源码为准。

**✅ 正确参数(Pro 思考期至少 30min,推荐 90min)**:

```powershell
node scripts/wait-opencode-session.mjs <sid> 5400000 300000 --exit-on-stuck --title "<任务名>"
#                                                                       ↑        ↑
#                                                                       maxWaitMs stableMs
#                                                                       90min    5min idle
```

- **Pro 思考期静默**(gemini-3 系列 + 全网知识检索)可能 60-80 分钟无 part 更新 → maxWaitMs **至少 3,600,000(60min)**,推荐 5,400,000(90min)
- **stableMs = 300,000(5min)** 判定 idle 完成。Pro/max 变体输出 `reasoning` 事件时 wait 知道不算 idle,自动重置计时器
- **wait 脚本退出 1 不等于 session 死**(gts-auto 铁律):DB 查 `session.time_updated` 在涨 = 推理中,继续等;不在涨 = 真死,查 `part` 表找根因
- **wait 脚本必须 notify_on_complete=true + background=true**(gts-auto §poll 监控策略主监控),否则 turn 结束就拿不到结果

**🚨 三个 skill 文字与脚本不一致,需要 reconcile**:

| 位置 | 写的 | 实际 |
|------|------|------|
| gts-auto 主表 | "maxWaitSec" | 源码是 ms |
| gts-auto SKILL.md | "wait-<sid> <maxWaitSec> <idleTimeoutSec>" | 源码是 ms |
| opencode-session-ops | "wait 脚本 step-finish 立即 DONE" | 对,但脚本 timeout 参数仍写 ms |

**patch 思路**:任何 dispatch wait 都用 `node scripts/wait-opencode-session.mjs --help` 验证一遍签名(脚本源码是 ground truth),不要凭主表/skill 记忆传参。

**🔴 关联**:`gts-auto` 主表 + `gts-auto` SKILL.md `§poll 监控策略`段 + `opencode-session-ops` 都需要 reconcile "maxWaitSec" → "maxWaitMs" 措辞。本 skill 落地 8-20 实测模板,主表/skills 留 R 阶段统一 patch(避免本会话多 patch 抢散)。

**🔴 wait 脚本 30s 真超时,DB 仍在涨的恢复路径**:

```powershell
# 1. 确认 session 活着
opencode db "SELECT id, time_updated, (time_updated - strftime('%s','now')*1000) AS age_ms FROM session WHERE id='<sid>'"
# 2. age_ms 绝对值 < 600000(10min) → 在跑,重启 wait(参数改对)
node scripts/wait-opencode-session.mjs <sid> 5400000 300000 --exit-on-stuck --title "<重新盯>" 2>&1
# 3. age_ms > 1800000(30min) → 停了,发「继续」:opencode run -s <sid> -m <原model> --attach ...
```

## 🔴 教训 7：hermes 验证自身资料 ≠ 派 OpenCode 验证 OpenCode 加载链(2026-08-20 兄弟纠正)

**兄弟原话**："你不需要读取 opencode 的记忆,只需要读取你的会话记忆以及 daily log、笔记、MEMORY.md 等相关记忆和资料"

**典型蹲坑场景**:兄弟问"回忆 X / v3 skill 在不在 / 昨天 commit 是什么" → bot 写了 `verify-skill-load.mjs` 脚本去测 `~/.opencode/opencode.json` 的 skill 路径配置 + 4098 /api/skill 是否列出。

**🔴 错在哪**:

- hermes 自身 `read_file <hermes-home>/skills/gts-memory-search-v3/SKILL.md` 就是**直接读 v3 skill 完整内容**,0 配置即时生效(主表踩坑 2026-08-20)
- bot 测的是 **OpenCode server 加载链**(`agent.build.permission.skill` allowlist) — 这是 OpenCode 派单时 surge prompt 里有没有该 skill,跟 **hermes 能不能读 v3 skill** 是两件事
- 派 OpenCode 验证 OpenCode 加载链 = 错题 + 浪费一轮 + 兄弟拍桌

**铁律**(巩固 `gts-bot-role-boundary` 边界):

| 兄弟问 | 走 hermes 自身工具 | 走 OpenCode 派单 |
|--------|-------------------|------------------|
| "回忆昨天 X 修复" | ✅ git log + read_file 笔记 + read_file skill | ❌ |
| "v3 skill 在不在" | ✅ `read_file skills/gts-memory-search-v3/SKILL.md` + grep 内容 | ❌ 验证 OpenCode 加载链是另一回事 |
| "现在代码状态" | ✅ git show + read_file | ❌ |
| "派 OpenCode 读 X 仓文件" | ❌ | ✅ |
| "review 我刚派的任务" | ❌ | ✅ |

**记忆点**:兄弟说"读资料" = hermes 自身工具(`read_file`/`search_files`/`terminal` 跑 git/sqlite/findstr)。兄弟说"运行 X" / "派 X" = OpenCode 派工。**别把 hermes 读资料能力包装成派 OpenCode 任务**。

#### 教训 8:wait `stableMs` 必须 ≥ 600000 (10 min) 全自动化,300000 (5 min) 普通(2026-08-20 实测)

**根因**:gts-auto 默认 `idleTimeoutSec=120` (120s=2min) 在 BDD/单测场景下**严重不够**。PMXReduceFace `yarn test:bdd --runInBand` 跑 35+ BDD 实测 5+ 分钟,期间 agent 调 `npx jest ...` 跑命令间隙无 part 更新,wait 误判 idle 触达退出 → agent 实际 `step-finish reason=tool-calls` 还在跑。

**两次踩坑(2026-08-20 实测)**:
- `stableMs=120000`(gts-auto 默认):wait exit 后查 part 表 `reason=tool-calls`,agent 还在跑 BDD
- `stableMs=300000`(5min):仍然不够,再次误判
- `stableMs=900000`(15min):最终正确等到完成

**wait 退出后,先查 part 表 `step-finish reason` 字段再决定下一步**(避免误判导致重 dispatch 或发「继续」):

```powershell
# wait 退出后 30 秒内必跑
opencode db "SELECT substr(CAST(data AS TEXT),1,300) FROM part WHERE session_id='<sid>' ORDER BY time_updated DESC LIMIT 1" --format json
```

| part 最后 step-finish reason | 结论 | 下一步 |
|---|---|---|
| `stop` / `completed` | ✅ 真完成 | 收产物汇报 |
| `tool-calls` / `running` | agent 还在调用工具,wait 误判 | 发「继续」唤醒(读 meta 拿原 `-m`),**不要**进下一阶段 |
| `unknown` + tokens 0 + cost 0 | 🔴 LLM 静默失败 | 走静默失败 SOP |

**🔴 硬性规则**:
| 场景 | `stableMs` 推荐 | 理由 |
|---|---|---|
| 全自动模式 + BDD/单测 | **600000-900000 (10-15 min)** | jest/BDD 跑 5+ 分钟正常,工具调用间隙无输出 |
| 普通模式 / 轻量任务 | 300000 (5 min) | Flash 测试完成通常 < 2 min |
| Pro/Max 报告阶段 | 3600000-4800000 (60-80 min) | 模型内部思考+报告生成阶段长 |

**铁律**:**不要凭 wait 退出码 0/3 推断「完成/卡死」**,必须查 part 表。看到 `reason=tool-calls` 就发「继续」(读 meta 拿原 `-m`,不要凭记忆),**不要进下一阶段或重 dispatch**(避免双 session 冲突)。

#### 教训 9:LLM 静默失败 `reason=unknown + tokens=0` 的快速处置(2026-08-20 实测)

**触发**:wait exit 4 或查 part 表 `reason=unknown` + `tokens.input=0, tokens.output=0, cost=0`。

**处置**:
| 模型 | 步骤 |
|---|---|
| 付费(火山/小米/go) | ①立刻发「继续」唤醒(读 meta 拿原 `-m`)→ ②wait 重启 → ③3 次失败后 stop + 重 dispatch |
| 免费(opencode/*) | ①对同一模型发「继续」重试 3 次,间隔 10s/30s/60s → ②3 次失败 + 明确报错 = 真挂 → ③`node scripts/opencode-free-model-state.mjs dead <model>` + 用 `get` 拿 current 切下一个 + 重 dispatch |

**关键**:`reason=unknown` **不等于**"模型挂",可能是瞬时网络/agent 内部问题。先发「继续」(免费模型按 10s/30s/60s 间隔 3 次),3 次后看是否恢复 + 有明确报错才记 dead。

#### 教训 10:socket connection closed ≠ session 死(2026-08-20 实测)

CLI exit 1 报 `"The socket connection was closed unexpectedly"`(`B:/~BUN/root/chunk-46zs0me7.js:1094:15735` 抛 `UnknownError`):

- server agent **可能仍在内存中运行**(DB `time_updated` 持续涨 + 事件 seq 推进)
- 优先 Web UI 续跑同一 session(兄弟手动点继续),不要立即重 dispatch(避免双 session 冲突)
- 重 dispatch 前必查:`opencode db "SELECT time_updated FROM session WHERE id='<sid>'"` — 还在涨 = server 活着,等通知
- 如果 server 真死 → 才按 gts-auto 4 次失败递增策略重派(Flash→Flash→Pro→Pro+max)

**反面案例**:XiaHui Step 2 session(`ses_fe2e7f560ffewUdU0Jt6CXW7oX`) socket崩了 → 误以为任务失败 → 删除 session → 重 dispatch 浪费一轮。**正确做法**:查 DB 确认 server 还在才删,不在则继续等。

#### 教训 11:续接 session 前必须清理残留 opencode run 进程(2026-08-20 实测)

**症状**:多次 dispatch「继续」到同一 session 时,新 dispatch 的 CLI 进程无输出/静默退出(exit 4294967295=-1),DB 无新 part 记录。旧的 opencode run 进程仍活着,占着 session 消息队列入口。

**根因**:前一次 dispatch 的 CLI 进程残留(被 `Stop-Process` kill 但 opencode.exe 子进程存活,或 CLI 没退出)。多个 opencode run 进程竞争同一 session → 新进程消息被排队或丢弃。

**续接前必做(清理残留进程)**:
```powershell
# 查所有 opencode run 进程(排除 serve)
Get-CimInstance Win32_Process -Filter "Name='opencode.exe'" |
  Where-Object { $_.CommandLine -match 'opencode run' -and $_.CommandLine -notmatch 'serve' } |
  Select-Object ProcessId, @{N='Args';E={$_.CommandLine.Substring(0, [Math]::Min(100, $_.CommandLine.Length))}}
# Kill 全部 + 等 2 秒 + 确认只剩 server → 再发「继续」
```

**反面案例(2026-08-20)**:Pro session 火山额度耗尽 → 尝试 hy3-free 续接 → flash-free 续接 → 全部无输出。查 `Get-CimInstance Win32_Process` 发现 **5 个 opencode run 进程**同时抢同一 session。kill 残留后重派才成功。

#### 教训 12:Pro 额度耗尽必须同级别 fallback,不能降级到 Flash(2026-08-20 实锤)

**兄弟原话**:「这是pro场合,照理说火山pro挂了,应该用什么模型?」

**错误**:火山 Pro 报 `Free usage exceeded`(5 小时限额) → 我 fallback 到 flash-free(降级)。兄弟纠正后用 mimo-v2.5-pro(同级别 fallback)。

**正确 Pro fallback 链**:
1. `volcark/deepseek-v4-pro-ga-260813` (火山 Pro) — 首选
2. `xiaomi-token-plan/mimo-v2.5-pro` (小米 Pro) — 火山挂了
3. `opencode-go/deepseek-v4-pro` (go Pro) — 都挂了才用

**🔴 严禁**:Pro 任务降级到 Flash。场景决定模型等级 → 等级内按优先级 fallback → 不跨等级降级。额度耗尽是硬信号,立即切链中下一个,不需要 3 次重试。