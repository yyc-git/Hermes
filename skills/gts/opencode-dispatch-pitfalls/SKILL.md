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
| `bash -c "...sed ... \$brief ..."` | 路径转义错误、dispatch 不发 | bash 嵌套引号 + 多行 brief 在 PS→bash 边界极易破坏 |

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

## 🔴 教训 3：CLI 默认 model fallback 陷阱

**根因**：`C:\Users\Administrator\.config\opencode\opencode.json` 顶层 `"model": "opencode-go/deepseek-v4-flash"` 是 server 默认值，CLI 不传 `-m` 就用它。OpenCode 不会自动按兄弟免费时段偏好选免费组。

**兄弟硬偏好**：免费时段用 `opencode/deepseek-v4-flash-free`；**付费版是最后兜底，不是首选**（见 6️⃣ 时段模型优先级）。

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