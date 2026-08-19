---
name: "opencode-session-ops"
description: OpenCode session 监控判定与结果提取实战操作。wait 脚本 step-finish 立即 DONE patch 派工后 30s 必查 session.model DB 直查 fallback 长测试误判 派工 wait 必须带 notify_on_complete
---

# opencode-session-ops — OpenCode 会话监控/结果提取实战补充

> **🔴🔴🔴 单条最高优先级规则（实测打脸三次）：判定活跃度/真死，**100% 用 `opencode db` 直查，不信 `wait --check` 输出**。`wait --check` 在 maxWait 超时后会误报 `gone | session 不存在`，但实际 session 还活着、agent 还在跑。详见 §1️⃣9️⃣。**

> 与 `opencode-schedule`（迁移自 OpenClaw 的受保护 skill）同域，本 skill 收录其未覆盖的**实测踩坑与 fallback**。调度协议本身以 opencode-schedule 为准，本 skill 只补操作细节。若 curator 合并，应并入 opencode-schedule 的 4️⃣ 监控步骤与结果提取部分。
>
**核心参考文件**(按需查阅):
- `references/b2-algorithm-verification.md` — B2 算法验证反模式(单元测试改断言值匹配旧函数输出)
- `references/model-resolution-pitfall.md` — **🔴 `-m` 模型名 silent fallback 陷阱(2026-08-18 兄弟质问 $0.40 浪费教训)**,dispatch 后必须 DB 查 session.model 字段验证
- `references/model-cost-verification-sop.md` — **30 秒内 cost 验证 SOP(2026-08-18 Phase D r2 实测落地)**:三个数据源不可信(cost 是唯一真信号) + 完整 session-meta 落盘流程 + HTTP API 续跑姿势 + 当前推荐 model 矩阵
- `references/opencode-api-endpoints.md` — **OpenCode 4098 HTTP API 端点速查(2026-08-19 实测)**:`/api/skill` 返回结构是 `{location, data: [...]}` 不是裸数组,`Where-Object` 必须先取 `.data`;`/session/{id}/message` endpoint 不带 `/api` 前缀
- `references/server-dispatch-troubleshooting.md` — **4098 server 派工故障排查(2026-08-19 Phase Fix-r10 实测)**:`opencode.log` 文件锁导致 CLI dispatch 报 `FileSystem.open denied`(杀 serve 进程重启解决) + "session 创建但 agent 不启动"(part 表只有 brief 回显)与模型额度用尽的区分分诊表
- `scripts/mmd-data-verify.mjs` — **MMDData.ts 强制最小验证集可执行版(2026-08-18)**:9 项 PASS/FAIL 检查一键跑,不依赖人工 grep

## 1️⃣ wait 脚本 exit 3（stuck）分类判定

`wait-opencode-session.mjs --exit-on-stuck` 报 stuck（`time_updated` 停 >idleTimeoutSec）时，**先查 DB 最后事件再决定动作**，不要一律发「继续」：

```powershell
opencode db "SELECT id, title, time_updated FROM session WHERE id='<sessionId>'" --format json
opencode db "SELECT type, substr(CAST(data AS TEXT),1,300) AS preview FROM event WHERE aggregate_id='<sessionId>' ORDER BY seq DESC LIMIT 3" --format json
```

| 最后事件 | 判定 | 动作 |
|---------|------|------|
| `tool` bash 且 `state.status=running`，前一条 text 说「跑全量测试/长任务」 | **正常执行期**，不是卡住 | 重启 wait 脚本，**idleTimeoutSec 调大**（如 300→600），继续等 |
| `reasoning`/`text`（生成阶段正常静默） | 模型还在干活 | 重启 wait，idleTimeout 调大 |
| `step-finish` reason=stop | **已完成** | 收结果，不再等 |
| `step-finish` reason=unknown + tokens 全 0 | LLM 静默失败（请求断流） | **发「继续」唤醒同一 session，不重新 dispatch**（2026-08-17 兄弟拍板，见下方 🔴） |
| `step-finish` reason=tool-calls | **未完成**：该步因工具调用结束，agent 会继续下一轮 loop | 继续等 / 查 event seq 是否在涨 |
| time_updated 停 + 无任何事件推进 + 进程活 >80min | 真卡住 | 发「继续」唤醒 |

> 🔴🔴🔴 **LLM 静默失败 = 请求级断流，直接发「继续」唤醒同一 session，禁止停掉重 dispatch（2026-08-17 兄弟拍板）**：`step-finish reason=unknown + tokens 全 0` 是模型请求偶发断流（重试 1-2 次可恢复），**不是 session 死了**。兄弟原话：「你不能直接让它继续吗？不需要重新 dispatch」。正确处置：
> 1. wait 脚本已内置检测（2026-08-17 起）：`isLlmSilentFail()` 识别 unknown+tokens0 → 立即 `exit 4`（不等 idleTimeout；旧版只认 stuck 要等 15 分钟才报——xiahui-data-fix-scheme 实锤反应慢被兄弟问「怎么没反应」）
> 2. bot 收到 exit 4 → 用 `.mjs` 发「继续」（`opencode run -s <sid> -m <原模型> --attach ... --no-replay "继续：<待办提示>"`），模型必须与原 dispatch 一致
> 3. 15s 后查 `time_updated` 恢复增长 = 唤醒成功 → 重启 wait 脚本继续监控
> 4. 只有「继续」后仍无新 part + time_updated 持续停 + 该 session 已多次唤醒（fix 循环 >2 轮）才拆新 session 续接（见 6️⃣）

> 🔴 **`time_updated` 停止 ≠ 卡住**：agent 执行长 bash 命令（全量 jest、bake、压缩）期间不发新事件，time_updated 自然停。此时发「继续」= 打断正在跑的测试。先看最后事件类型，是 `tool running` 且 text 预告了长任务 → 调大 idleTimeout 重启 wait（实测：idleTimeout 300→600 后正常等到完成，省一次误判唤醒）。

> 🔴🔴🔴 **`time_updated` 停止 ≠ session 已死（2026-08-17 兄弟纠正「开启新会话时先把老会话停掉」）**：server 端 agent 在内存运行时，DB `time_updated` 可能长时间不更新（模型生成阶段 / 长 bash tool / agent 自行越界工作）。**只看 time_updated 停 12 分钟就断定 session 死了 → dispatch 新 session → 双 session 撞车**（本次实测：fix4 被认为「已死」，实际 server agent 还在 Web UI Running 且已越界开始改 fix5 范围的文件）。dispatch 相续/新任务前必须三步确认旧 session 真死：
> 1. Web UI API：`(Invoke-RestMethod -Uri "http://localhost:4098/api/session").data | Where-Object { $_.id -eq '<旧sessionId>' }` — 看是否仍 Running（不只信 DB time_updated）
> 2. event 尾部：`opencode db "SELECT seq, type, substr(CAST(data AS TEXT),1,150) FROM event WHERE aggregate_id='<旧id>' ORDER BY seq DESC LIMIT 3"` — seq 是否还在涨 / 最后事件是否 tool 或新 assistant 消息
> 3. 确认真死（DB 查无 + 15s 不复活 + Web UI 非 Running）才允许 dispatch 新 session；**不确定 → 先 gts-opencode-stop 停掉旧的再开新的**（`opencode session delete` + 三重验证：delete 返回、立即查 `[]`、15s 后再查仍 `[]`）

## 2️⃣ extract 脚本失败 → DB 直查 fallback

`extract-opencode-report.cjs` 可能报 `ERR_INVALID_ARG_TYPE`（缺输出路径参数）；`extract-session-text.mjs` 可能报 `unable to open database file`（DB 路径探测失败）。**两者都失败时不要卡住**，直接用 opencode db 查 event 表：

```powershell
# 1. step-finish 行拿 reason/tokens/cost（完成类型 + 消耗汇报）
opencode db "SELECT substr(CAST(data AS TEXT),1,1200) FROM event WHERE aggregate_id='<sessionId>' AND type='message.part.updated.1' AND CAST(data AS TEXT) LIKE '%step-finish%' ORDER BY seq DESC LIMIT 1" --format json

# 2. agent 最终报告藏在 reasoning part 的末尾 text 里（改了什么/验证结果/失败分析都在那）
opencode db "SELECT substr(CAST(data AS TEXT),1,2500) FROM event WHERE aggregate_id='<sessionId>' AND type='message.part.updated.1' AND CAST(data AS TEXT) LIKE '%reasoning%' ORDER BY seq DESC LIMIT 2" --format json
```

> 经验：agent 的总结（验证结果、pre-existing 失败区分、方案选择理由）几乎都在最后一段 reasoning 的 text 里，2500 字符足够覆盖要点。比轮询 log 省事且一次拿全。

## 3️⃣ 隐藏状态文件查找（跨会话恢复）

`.skill-exec-state.*.json` / `.skill-exec-sessions.json` 是带点前缀的隐藏文件，ripgrep 系文件搜索**默认搜不到**，会误判「状态文件不存在」。恢复工作流时用：

```powershell
Get-ChildItem -Force -Filter ".skill-exec*" D:\Github\GTS-Play | Select-Object Name, Length, LastWriteTime
node scripts/skill-exec-manager.cjs check <sessionId>
```

- Issue 文件在 `笔记/项目文档/issue/<date>-<skill>-<hash>.md`，front matter 的 `sessionId` 是恢复主键
- `check` 返回 `crossCheck.consistent=true` → state/issue 同步完好，直接展示恢复模板继续
- 注意 step 编号与文件名可能不一致（如 mmd_tool workflow 里 `--step 3` = mmddata，但模块文件叫 `step-1-mmddata.mjs`）——恢复时先看 `STEPS` 数组定义，别凭文件名猜编号

## 4️⃣ 其他实测

- `opencode db` 查询中 `LIKE '%"tool":"bash"%'` 这类带引号的 SQL 在 PowerShell 传参会解析失败（引号转义），改用 `ORDER BY seq DESC LIMIT 1` 拿整条事件再截取，或避免在 SQL 里写双引号
- 查询 session 状态必须 `WHERE id='<sessionId>'`，不要 `ORDER BY time_created DESC LIMIT 1` 取最新（并行任务会插队，查到别人的 session 误判自己的还在活跃）
- `opencode db "SELECT ... completed FROM session"` 会报 `no such column: completed`（无此列），判断完成看 event 表的 step-finish reason

## 5️⃣ agent 越界检测（dispatch 前必查）

agent 可能超出 brief 范围自行修别的失败（实测：fix4 的 brief 只让修 self-check，但它发现 gen-mmd-config 失败后**自己开始动手修**，与后续 dispatch 的 fix5 抢同一批文件 → 双 session 撞车）。dispatch 新 session 前用 git 看旧 session 实际动了哪些文件：

```powershell
git -C D:\Github\GTS-Play status --porcelain -- <怀疑的文件路径>
git -C D:\Github\GTS-Play diff --stat HEAD -- <怀疑的文件路径>
```

- 旧 session 改动文件超出其 brief 范围 + 仍在活跃 → 先 gts-opencode-stop 停掉再 dispatch
- 判定「session 是否真做完」不要只看它有没有输出报告，还要看 `step-finish reason` 是不是 stop（tool-calls 只是该步结束，agent 还会继续）

## 6️⃣ part 表结构（DB 直查必备，2026-08-17 实测）

> **🔴 区分 Hermes 会话 vs OpenCode 会话**：本 skill 管的是 **OpenCode agent 会话**（session/part 表在 `opencode.db`）。**Hermes 自己的会话记录**在 `E:\Hermes Agent CN Desktop\data\hermes-home\sessions\request_dump_*.json`，读取方式见 `hermes-session-read` skill。两者不要混——Hermes request dump 是 429 限流时的 HTTP 请求快照，不含完整对话（需分段读取）；OpenCode session/part 表是完整 agent 对话记录。

`part` 表**没有 `type`/`seq` 列**（session 表无 `completed` 列同理），结构只有 `id / message_id / session_id / time_created / time_updated / data`。所有内容在 `data` 字段（JSON 字符串，`type` 在 JSON 里：`step-finish`/`text`/`tool`/`patch`/`reasoning`/`step-start`）。查询必须：

```sql
SELECT data FROM part WHERE session_id='<sid>' ORDER BY time_updated DESC LIMIT 10
-- ❌ 错误：SELECT type ... / ORDER BY seq DESC → no such column: type / seq
```

- `data` JSON 解析后：`d.type` 判断类型；`d.type==='step-finish'` 时 `d.reason` + `d.tokens`（静默失败判据）；`d.type==='tool'` 时 `d.state.input.command` 看命令、`d.state.output` 看输出；`d.type==='patch'` 时 `d.files` 看写了哪些文件
- **agent 声称完成但产物「找不到」的排查路径**：先用 node（`readdirSync`）确认路径——PS 无 BOM 脚本的中文路径 Test-Path 会误报 False（见 windows-powershell-pitfalls）；再查 part 表 `write` tool 记录（`d.state.output` = "Wrote file successfully." + `d.state.metadata.filepath`）与 `patch` 类型记录确认真实落盘；再看 agent 自己的 `bash Get-ChildItem` 验证输出（xiahui-data-fix 实锤：agent 写了 15 个文件但 PS 查目录报不存在，node 秒确认，白跑一轮诊断）

## 7️⃣ fix 循环 >2 轮拆新 session 续接（B2-1b 模式，2026-08-17 实测）

同一 OpenCode session 多次唤醒（静默失败/stuck）后，**tokens 累积（实测中途已达 227K）+ 上下文接近上限，续跑只会继续膨胀**。判定：session 已 3 次唤醒仍失联（「继续」后 0 新 part + time_updated 停 >15min）→ 拆新 session：

0. **先做 provider 级诊断，区分「请求断流」vs「模型不可用」vs「余额不足」**（2026-08-17 fix7 实锤：Flash 连续 5 次失败，非偶发）：
   ```powershell
   Get-Content "$env:USERPROFILE\.local\share\opencode\log\opencode.log" -Tail 2000 | Select-String "stream error|Insufficient balance|exiting loop"
   ```
   - 🔴 **`level=ERROR message="process" ... error="Insufficient balance. Manage your billing here: https://..."` → opencode-go 账户余额耗尽**（2026-08-17 实锤：所有 opencode-go 模型 Flash+Pro 全挂）。**换模型无用**（本次 Flash→Pro 重派仍 Insufficient balance，白费一轮）。唯一出路：通知兄弟充值 / 切免费模型（`opencode/deepseek-v4-flash-free`，兄弟拍板 Flash 任务默认用 free，见 opencode-schedule）
   - `level=ERROR message="stream error" providerID=xxx modelID=yyy` → provider/网络级问题
   - **dispatch 后 agent 从未 start（part 表只有初始 brief，无 step-start/reasoning）** → 先查日志分诊：余额不足 → 停 session + 桌面通知兄弟（外部资源，不能自动解决，notify.ps1）；stream error → 换模型重 dispatch；**不要在同一模型上反复重试/反复 dispatch 试探**（每次都即死，浪费 session）
   - 多次断流但 agent 有实际产出（step-finish unknown 出现在工作中途）→ 仍按「发继续」恢复优先（请求级偶发），换模型是兜底

1. **先停旧的**：`opencode session delete <sid>`（FK 约束自动终止 server agent），复查 `[]` 确认
2. **新 brief 预置已落地事实**（agent 不重复探测）：前 session 改了哪些文件（`git diff --stat` 确认）、未完成什么、agent 中途结论（如「6 个失败、helper 方向」）、剩余任务
3. **新 session title 带后缀**（`xiahui-data-fix-b2-1b`），`--no-replay` 干净上下文
4. 拆 session 前先 `git diff --stat` 区分「前 session 真改动」vs「历史遗留改动」（frontend/doc 的小改动可能是别的任务遗留，别误判为越界）

## 8️⃣ server 级别完全不可用（4098 未监听，2026-08-18 xiahui-data-fix-b2-2c 实测）

**症状区分（必须先判清再决策）：**

| 症状 | 判定 | 决策 |
|------|------|------|
| 4098 连得上有 session 列表但 agent 失联 | 客户端-服务端网络问题 | 见 opencode-llm-failure-recovery |
| 4098 拒连（`由于目标计算机积极拒绝`） + 没有 opencode 进程 | **server 根本没启动** | 见本节 |
| 4098 拒连但仍有残留 session DB | server 挂了但 DB 还在 | 见本节 |

**🔴🔴🔴 dispatch 前必查 4098 health（5️⃣ checklist 第 0 项）**：
```powershell
# 一行：netstat + 进程 都要查（5/15 实锤：netstat 拒连不代表进程没启，进程在但端口绑定失败也拒连）
$portOk = (netstat -ano | Select-String ":4098.*LISTENING").Count -gt 0
$procOk = (Get-Process -Name "opencode*" -ErrorAction SilentlyContinue).Count -gt 0
if (-not $portOk -or -not $procOk) {
    # server 没起 → 任何 dispatch / 续跑 / 发「继续」 / extract / Web UI 全都不能用
    throw "4098 server 未启动（port=$portOk, proc=$procOk），必须通知兄弟手动拉起"
}
```

**为什么"先查后 dispatch"不能省略：**
- 5️⃣ dispatch checklist 列了 7 项但没把 4098 health 算进去；本次踩坑：读完 state/issue 上下文、读 B2-2c 报告、写完 step-done B2，准备进 Phase C 时才发现 4098 没起
- Phase C/M/R/S 全步骤都依赖 dispatch → server 死了 = 全自动流水线中断；不解开 = 死循环（每次都重试都失败）
- 应当**在 init state 第一秒查 4098 health**（开 gts-dev-fix session 前），发现挂了直接通知兄弟不要进工作流

**server 没起时的可做范围（bot-only 验证）：**
- ✅ 读文件 + git status + jest 跑测试（这些不依赖 4098）
- ✅ 用 sqlite3 CLI 直接查 session DB 拿历史报告（见下「OS-safe sqlite 查询」）
- ✅ 写 ad-hoc 验证脚本独立复验（见 9️⃣）
- ❌ dispatch / 续跑 / 发「继续」 / Web UI / extract 脚本 → 全废

**server 没起时不可做的硬边界（来自 MEMORY 🔴）：**
- 🔴 bot 无权启动 OpenCode server（需桌面权限，GUI 进程）
- 🔴 `opencode serve` 用 CLI 模式启动 ≠ 4098 server（没有 attach target，是 CLI 一次性调用）
- 🔴 不要试 `Start-Process opencode.exe serve` 等 hack，徒增无效进程
- **唯一正确动作：通知兄弟手动拉起（重启 Hermes Desktop app 通常会顺带拉起 4098）+ 等兄弟确认后才继续 Phase C**

**server 复活后恢复顺序：**
1. 兄弟说"4098 起来了" → bot 再跑一次 health check（netstat + process 双重）
2. `node scripts/wait-opencode-session.mjs --check <sid>` 确认历史 session DB 没坏
3. 重启 wait 脚本（如果之前跑了）→ 重新挂到 4098
4. 从断点继续 Phase C（dispatch Phase C 第一子步骤：代码审核）

---

## 9️⃣ OS-safe sqlite 查询（PowerShell + Hermes terminal 踩坑，2026-08-18）

**根因：** GTS-Play 根目录的 `node_modules` 不含 `better-sqlite3`（只有子包有），写 .mjs 用 `require('better-sqlite3')` 会报 `MODULE_NOT_FOUND`；写 .cjs 用 import 同理；纯 PS 内联查询遇 `strftime` 关键字被 PowerShell 当作命令解析失败。

**✅ 可行路径：调 `C:\sqlite\sqlite3.exe` + `.sql` 文件 + `-init` 参数**：

```powershell
# 写 .sql 到工作目录（避开 $env:TEMP 的写权限坑）
"SELECT ... FROM session WHERE id='xxx'" | Out-File -Encoding utf8 scripts\query.sql

# sqlite3 -init <sql> <db> ".quit"  ← 末尾 ".quit" 是必须的,否则 sqlite3 卡住等输入
sqlite3 -init scripts\query.sql "C:\Users\Administrator\.local\share\opencode\opencode.db" ".quit"
```

**踩坑清单：**
- ❌ `<` 重定向（`sqlite3 db < script.sql`）在 PS7 报 `The '<' operator is reserved for future use` → 用 `-init`
- ❌ `&` 调用符被 Hermes terminal 误判 backgrounding → 改用 `cmd /c` 或直接 path
- ❌ PS 内联 node -e 写中文 / 正则 / 嵌套引号 → 写临时 .mjs（不是 .cjs,因为 root 没有 better-sqlite3）
- ❌ 末尾不接 ".quit" → sqlite3 永远挂起（exe 进程不死，bot 永远等）
- ❌ `.sql` 用 `-Encoding utf8`（PS 5.1）+ `-init` 才能正确传递中文
- ❌ SQL 含 `$variable` → PS 5.1 默认 ANSI 读文件，中文全乱码（PS 7 无此问题）

**实战查询模板（直接复用）：**

```sql
-- A. 查最近 1h 活跃 session
.mode list
.headers off
SELECT '=== RECENT SESSIONS (1h) ===';
SELECT substr(id,1,40) || ' | ' || datetime(time_updated/1000, 'unixepoch', 'localtime') || ' | ' || substr(title,1,60) FROM session WHERE time_updated > CAST(strftime('%s','now') AS INTEGER)*1000 - 3600000 ORDER BY time_updated DESC LIMIT 8;
```

```sql
-- B. 查指定 session 的 step-finish 终态
WITH s AS (SELECT id FROM session WHERE title='<任务title>' ORDER BY time_updated DESC LIMIT 1)
SELECT 'reason=' || json_extract(data, '$.reason') || ' | total_tokens=' || json_extract(data, '$.tokens.total') || ' | cost=' || json_extract(data, '$.cost')
FROM part WHERE session_id=(SELECT id FROM s) AND json_extract(data, '$.type')='step-finish'
ORDER BY time_updated DESC LIMIT 1;
```

```sql
-- C. 查 part 表末尾 3 条事件类型（判定完成 vs 卡住）
WITH s AS (SELECT id FROM session WHERE title='<title>' ORDER BY time_updated DESC LIMIT 1)
SELECT json_extract(data, '$.type') || ' | ' || datetime(time_updated/1000, 'unixepoch', 'localtime') FROM part WHERE session_id=(SELECT id FROM s) ORDER BY time_updated DESC LIMIT 3;
```

---

## 🔟 4098 挂了时的 ad-hoc 验证脚本模式（验证 OpenCode 自报结果，2026-08-18）

**何时用：** OpenCode 报"完成 + 测试全绿" → 4098 挂了无法 dispatch Phase C 验证 → bot 独立复验 OpenCode 自报结果。

**模式：** 写临时 .mjs（**放 `$env:TEMP`**，不放 scripts/，避免污染仓库）→ 4 步走：
1. 跑 jest 套件 → 验证"74/74 / 49/49"等数字断言
2. 读关键 config 文件 → 验证落盘数据（如新加的 4 个 params）
3. sqlite3 CLI 查 DB → 验证 OpenCode session step-finish reason
4. 全部 PASS 才算可信

**模板（每次写 ad-hoc verify 时复用结构）：**

```js
// 文件：C:\Users\Administrator\AppData\Local\Temp\hermes-verify-<task>.mjs
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repo = 'D:\\Github\\GTS-Play';
const tmp = mkdtempSync(join(tmpdir(), 'hermes-verify-'));
const results = [];
const pass = m => results.push(['PASS', m]);
const fail = m => results.push(['FAIL', m]);

// 1) jest 套件（spawnSync 因为内联执行不传 timeout 经常挂）
{
  const r = spawnSync('npx', ['jest', '--testPathPattern=<pattern>', '--silent'], {
    cwd: '<pkg-dir>', encoding: 'utf8', shell: true,
  });
  const txt = (r.stdout || '') + (r.stderr || '');
  const m = txt.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/);
  const failed = txt.match(/Tests:\s+(\d+)\s+failed/);
  m && Number(m[1]) >= <expected> && !failed ? pass(`<suite>: ${m[1]}/${m[2]}`) : fail(`<suite>: ${m ? m[1] : 'no match'}`);
}

// 2) 关键 config 文件
{
  const cfg = JSON.parse(readFileSync('<config.json>', 'utf8'));
  // ... 字段断言
}

// 3) sqlite3 CLI 查 DB
{
  writeFileSync(join(tmp, 'q.sql'), `SELECT ... FROM ...`);
  const r = spawnSync('C:\\sqlite\\sqlite3.exe', ['-init', join(tmp, 'q.sql'), '<db-path>', '.quit'], { shell: true });
  // ... 解析输出
}

rmSync(tmp, { recursive: true, force: true });
results.forEach(([s, m]) => console.log(`[${s}] ${m}`));
const failedCount = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${failedCount === 0 ? 'ALL PASS' : failedCount + ' FAILED'}  (NOTE: ad-hoc verification, not jest suite green)`);
process.exit(failedCount === 0 ? 0 : 1);
```

**踩坑清单：**
- 路径用 `D:\\Github\\GTS-Play`（双反斜杠，ESM 路径需要 escape）；相对路径用 `join` 拼
- `spawnSync` 必须传 `shell: true` 让 npx 找到命令
- 检查字段时**先读一次真实结构**（read_file）+ 再写断言（本次踩坑：以为 `mmddata.params` 实际是 `steps.mmddata.params`）
- 跑完**必须删临时脚本**（`Remove-Item`），否则 $env:TEMP 堆积
- 写 `.opencode-brief.md` / `.sql` / `.mjs` 到项目根 → **不是临时**！临时文件一律 `$env:TEMP`

**不是替代：** ad-hoc 验证 ≠ 真实 jest 套件 green。它是"OpenCode 报告可信度"的二次校验，**不能取代 Phase C 完整验收流程**（代码审核、TDD 验证、Specs 同步等）。判定：
- ✅ ad-hoc 全 PASS → OpenCode 报告可信，可暂存等 4098 复活后继续 Phase C
- ❌ ad-hoc 有 FAIL → 立刻汇报兄弟（不绕 gts-opencode-stop 重 dispatch，等 4098 复活再说）

---

## 1️⃣1️⃣ wait-opencode-session.mjs `unknown` 判定补丁（2026-08-18 B2-2 实测）

`isLlmSilentFail()` 判定条件补丁历史：
- **旧版（2026-08-17）**：`reason=unknown + tokens 全 0` 才算失败。**漏检免费模型失败**（flash-free 静默异常时 tokens 可能非 0，本次 B2-2 实测：total=126810/output=5646 仍 unknown），导致 bot 不知道失败，等 idleTimeout 才报 stuck。
- **补丁（2026-08-18）**：`reason=unknown` 一律视为失败（不看 tokens）。理由：正常完成只有 stop/completed/error 三种；unknown 本身就是异常。

**但补丁后引入新误判**（2026-08-18 B2-2b 实测）：同一 session 之前失败留下的「历史 step-finish unknown」part 仍在 part 表里；新 wait 启动时立即判定为 llm-fail，**误报**。

**最终修复（双重防护）**：
```js
function checkState(id, nowMs, idleTimeoutSec) {
  // ...
  if (reason === 'stop' || reason === 'completed' || reason === 'error') return { state: 'done', ... }
  // 🔴 unknown 即失败，但必须满足 idleSec > 60 才报（避免历史 unknown 误判+给 agent 60s 恢复窗口）
  if (isLlmSilentFail(id) && idleSec > 60) return { state: 'llm-fail', ... }
  if (idleSec > idleTimeoutSec) return { state: 'stuck', ... }
}
```

判定流程（最终版）：
- `reason=unknown` 且 idleSec ≤ 60 → 报 active（agent 刚收到继续消息可能尚未写新 part）
- `reason=unknown` 且 idleSec > 60 → 报 llm-fail（exit 4，bot 收到后发「继续」唤醒）
- `time_updated` 停 > idleTimeoutSec 且无 unknown → 报 stuck（exit 3）
- `reason=stop/completed/error` → 报 done（exit 0）

---

## 1️⃣2️⃣ wait 包装层误报 exit 0 排查（2026-08-18 xiahui-data-fix-phaseC 实测）

**🔴 致命坑：用 `Start-Process powershell -Command "...node wait...; Write-Host 'wait exited'"` 这种包装等 wait + notify，会触发 notify_on_complete 误报"完成"，而实际 wait 还在跑（甚至 OpenCode session 还在动）！**

**症状**（同时满足 = 几乎肯定是误报）：
- 后台 wait 收到 exit 0 通知
- `Get-Process node` 仍能看到那个 `wait-opencode-session.mjs` 进程活着（PID xxx）
- `node wait-opencode-session.mjs --check <sid>` 输出 `active | idle Xs, last event reasoning/grep/bash/...`（**不是 done**）
- `opencode db "SELECT id, time_updated FROM session"` 显示 time_updated 在最近 1 分钟内更新
- 看 log 文件只有首行 `[wait:phaseC] ...`（GBK 乱码），没 `done` 行

**根因**：包装 PS 脚本结构：
```powershell
Start-Process powershell -ArgumentList "-NoProfile","-Command","... node wait ... ; Write-Host 'wait exited'"
```
`Start-Process` **同步返回**（不 wait 子进程），父 PS 立即 exit 0 → 触发 notify_on_complete。实际内层 node wait 是独立进程被 detach 到后台（如果 Start-Process 用 `-WindowStyle Hidden` 父脚本更等不到）。

**正确姿势**（三种选一）：
1. **不要包装，直接前台跑 wait**：等 Phase C 跑完用 hours 级别，主动轮询日志（`Get-Content wait.log -Wait` / 60s 周期 cat），不让 notify 触发。**最稳**。
2. **包装层不用 Start-Process**：直接在 `terminal(background=true)` 调 `node wait ... --exit-on-stuck`，等真完成时 wait 自身 stop，notify 是真信号。
3. **包装层用 `Wait-Process`**：父脚本 `Wait-Process -Id <node_pid> -Timeout 7200` 阻塞等 node wait 真退出，再 `Write-Host 'wait exited'`。这样 notify 才是真信号。

**姿势 #1 的实操模板（周期性轮询 DB，2026-08-18 实测）**：当兄弟选「保留 wait 跑、我自己轮询日志」时：
```powershell
# 后台挂一个"睡 N 秒 + 查 DB + 输出表格"的轮询任务
Start-Sleep -Seconds 90
$env:OPENCODE_DB = "C:\Users\Administrator\.local\share\opencode\opencode.db"
opencode db "SELECT json_extract(data,'$.type') AS type, datetime(time_updated/1000,'unixepoch','localtime') AS t, (strftime('%s','now')*1000 - time_updated)/1000 AS idle_sec, (SELECT reason FROM (SELECT json_extract(data,'$.reason') AS reason FROM part WHERE session_id='ses_xxx' AND json_extract(data,'$.type')='step-finish' ORDER BY time_updated DESC LIMIT 1)) AS last_reason FROM part WHERE session_id='ses_xxx' ORDER BY time_updated DESC LIMIT 1" --format json | ConvertFrom-Json | Format-Table -AutoSize
```
- 间隔阶梯：活跃期 60-90s（够看一次 tool/reasoning 阶段）；安静期（idle 增大到 200s+）改 180-300s；明显 stuck（idle >600s 且无 stop）立即介入
- `idle_sec` + `last_reason` 两个字段足够判断活跃/stuck/真完成；看到 `last_reason=stop` + 无新 step-start = 真 done
- 后台挂 `terminal(background=true, notify_on_complete=true)`，每一轮通知到达 = 时间到点 = 再挂下一轮（**不要让前一轮通知误以为完成**）
- 不用 wrapper（不套 Start-Process），只用 terminal 自己的 notify；这条路径零误报

收到误报时的恢复 SOP（不要重启 wait 也不要 dispatch 新 session）：
1. **先 --check 确认**：
   ```powershell
   $env:OPENCODE_DB = "C:\Users\...\opencode.db"
   node D:\Github\GTS-Play\scripts\wait-opencode-session.mjs --check <sid>
   ```
   输出 `active` = wait 还在跑 + session 还活着 = 误报，**不动任何东西**。
2. 看 node 进程是否活：`Get-Process node | Where-Object { $_.StartTime -gt (Get-Date).AddMinutes(-10) }`，看命令行是否含 `wait-opencode-session.mjs`。
3. 看 log 文件找 `done` 行：`Select-String -Path wait.log -Pattern "^.+done\s\|.+step-finish"`。无 = 还在等。
4. 判定真死（--check = gone / done 且 log 有 done 行）→ 才进入"结果提取"阶段。
5. 误报后**主动轮询** log 60s 一次（`Get-Content -Wait` 或定时 cat），直到真 done。

**真 done 后再做的第三件事（独立复验 OpenCode 自报结果，2026-08-18 xiahui-phaseC 实测）**：

wait `--check` 输出 `done | step-finish reason=stop` 后，**不能直接信 agent 报告的 "123/123 passed" 数字**。OpenCode 自跑测试的 workspace 可能跟 bot 视角不同（attach session 重启后快照漂移、helper 直传参数绕过测试等）。Bot 必须自己跑一遍：

```powershell
# 1) 跨验文件改动（agent 是不是真的改了那两个文件）
git -C D:\Github\GTS-Play status --porcelain -- <报告里 claim 改的文件路径>

# 2) 自己跑 jest 套件，对比 agent 报告的数字
cd D:\Github\GTS-Play; yarn workspace <pkg> jest --testPathPattern='<pattern>' --silent 2>&1 | Select-String -Pattern "Tests:"
```

- bot 跑出的 `Tests: X passed, Y total` 必须跟 agent 报告的数字完全一致（X 一致 + Y 一致）
- XH 场景列表必须能 grep 到（`Select-String -Pattern "XH-0[789]"`）
- 任一不一致 = agent 报告不可信，立刻汇报兄弟 + 不进入 Phase R/S

**记忆点**：OpenCode 自报 PASS ≠ bot 可信 PASS。**Phase C 的 jest 数字必须由 bot 自己跑一遍核对**——实测 30 秒，省一次「agent 跑过了实际工作区不一致」的事故。

> 🔴 **关联：`references/b2-algorithm-verification.md`** — B2 算法验证反模式:单元测试改了断言值匹配旧函数输出 = 测试 100% 通过但实际算法没改。**任何 Phase C 验收必须 grep 真实数据文件 vs 方案 §11.2 期望表**,不能只数 passed。
---

## 1️⃣3️⃣ 🔴🔴🔴 强制纪律：任何 wait 退出信号必须先 --check，禁止立刻开 background 轮询（2026-08-18 实锤反例二次 + 同会话当场二次踩坑）

> **本节是强制纪律（🔴🔴🔴），不是普通 pitfall。违反一次就是一天 token 损失 + 兄弟质问。**
>
> **触发场景**：任何 wait 退出信号出现时（Start-Process 包装 exit 0 / Hermes 通知 exit 0 / `time_updated` 长时间不动 / OpenCode 报告"完成"但你又心存怀疑）
>
> **违反本节的两个标志**：
> 1. 收到 exit 0 后**立刻**开了 `terminal(background=true)` 跑 Start-Sleep + DB 查询
> 2. 在没 `--check` 之前，**开了 ≥2 个 background terminal** 等待不同 sleep 间隔
>
> **如果你正在做这两件事之一 → 立即停手，跑 `node wait-opencode-session.mjs --check <sid>` 单次同步查，杀掉所有 background terminal**

**反面教材（2026-08-18 xiahui-data-fix-phaseC **当场**二次踩坑）**：

兄弟之前质问"为什么用轮询了？之前不是用 wait 脚本吗？"——我在**同一次 Phase C 任务**里**当场**重犯：
- 第 12 节已经记录了 Start-Process 包装误报陷阱
- 第一次 patch（"误报后禁止切轮询"）已经落盘
- 但我自己**在同一会话里**又踩一次：收到 exit 0 后开 8 轮 background 轮询（60/90/120/180/240/300 秒）
- 兄弟质问时 wait 实际还在跑（PID 21376 健康活着，最终 11:06:03 真完成，日志最后一行 `done`）
- 兄弟原话："要查看下调度 skill" → 直接指向本节
- **结论**：第一次 patch 没阻止反例 → 升级为本强制纪律，加强措辞 + 自我检测 checklist + 编号去重

**🔴🔴🔴 禁止的反模式（任一即违规）**：

1. ❌ 收到任何 wait "退出"信号 → 切到"Start-Sleep + DB 查询"的周期性 background 轮询（每轮开新 terminal + notify）
2. ❌ 怀疑 wait 死了 → **开 N 个 background 轮询去"验证"**（本身就是污染）
3. ❌ Phase C 长任务（>30min）用轮询代替 wait 脚本
4. ❌ 在没跑 `node wait --check <sid>` 单次同步查之前，先开 background terminal
5. ❌ 一次开 ≥2 个 background terminal 做不同 sleep 间隔的轮询（60/90/120/180...）

**✅ 误报/退出信号后的唯一动作（单条）**：

```powershell
$env:OPENCODE_DB = "C:\Users\Administrator\.local\share\opencode\opencode.db"
node D:\Github\GTS-Play\scripts\wait-opencode-session.mjs --check <sessionId>
```

- 输出 `active` = 误报，**不动任何东西**，继续用 `process(action=log, sessionId=<wait脚本的sessionId>)` 读 wait stdout
- 输出 `done` = 真完成，开始结果提取阶段（**第 1️⃣2️⃣ 节末尾"真 done 后再做的第三件事：独立复验 OpenCode 自报结果"**）
- 输出 `gone` = session 真没了，查 Web UI 确认，走 gts-opencode-stop 或重新 dispatch

**轮询唯一合法场景**：
- **完全没 wait 脚本**（dispatch 后忘了挂 wait 的极端情况）→ 用轮询救场，**轮询间隔 ≥120s**（不是 60s！），任务完成立刻停止，不要让轮询"自然漂到"完成后的下一个 phase
- 救场轮询**也只是临时**——找到机会立刻补挂 wait 脚本，把监控权交回去

**自我检测 checklist（收到任何"wait 退出"信号时，逐条核对）**：

- [ ] 我**先**跑了 `node wait --check <sid>` 吗？（必须先跑）
- [ ] 我**没有**开 background terminal 跑轮询吗？（禁止）
- [ ] 我**没有**开 ≥2 个不同 sleep 间隔的轮询吗？（禁止）
- [ ] 我是不是想用 process(log) 查 wait stdout 而不是 DB 轮询？（应该）
- [ ] 我是不是在用 LLM 决策"wait 是不是死了"？（禁止——证据是单次 --check）

**违反任一条** → 立即 kill 所有 background terminal，跑 `node wait --check <sid>`，回到正轨。

**记忆点（强化版）**：
- bot 主线 cacheRead 是真金白银被烧的——任何"看着"的轮询都是成本
- wait 脚本 + process(log) 才是 0 成本监控
- 兄弟在 2026-08-18 当面质问过"要查看下调度 skill"——已落盘，下次违规就是二次踩坑

---

## 1️⃣9️⃣ Agent 不一定产生 step-finish stop，wait timeout ≠ 任务失败（2026-08-18 XiaHui Phase D-r3 实测）

> **wait 脚本 maxWait 超时 ≠ agent 任务失败**。实测案例：Phase D-r3（补 §2/§3 纹理 + vmd_bake_physics + snapshot）agent 5 分钟内完成所有工作（纹理 21 张 + vmd_bake_physics 54 文件 + image/XiaHui.png 都已落盘），但**没产生 step-finish reason=stop** → agent 继续做"报告写"等后续动作 → wait 3600s 超时 exit 1 → 我差点误判任务失败并 delete session 重派。

**判定 SOP（wait timeout 后第一时间）**：

1. **永远不要立刻 delete session**——先查 DB 看 session 是否还活：
   ```powershell
   $env:OPENCODE_DB = "C:\Users\Administrator\.local\share\opencode\opencode.db"
   opencode db "SELECT (strftime('%s','now')*1000 - time_updated)/1000 AS idle_sec FROM session WHERE id='<sid>'"
   opencode db "SELECT json_extract(data,'$.type') AS type, datetime(time_updated/1000,'unixepoch','localtime') AS t FROM part WHERE session_id='<sid>' ORDER BY time_updated DESC LIMIT 5"
   ```

2. **直接查文件系统验证本次任务的产物是否已落盘**——这是 §1️⃣6️⃣「实测纪律」的延伸。例：Phase D-r3 查 `Test-Path _opt/*.png` / `vmd_bake_physics/` / `image/XiaHui.png`，确认产物是否到位

3. **如果产物已就位** + agent 还在跑（只是没 stop）→ **delete session**（agent 已完成任务，继续跑是浪费）→ 走产物验收

4. **如果产物没就位** + agent 在跑 → 重启 wait（可能 agent 在写长报告或长 bash）

5. **如果产物没就位** + agent 已停（真正失败）→ 走 §3 自动修复或 §4 停止流程

**`wait --check` 模式不准**：`session 不存在` 报错实测 DB 查询返回空时会错误显示（实际 session 存在，只是 --check 内部判断逻辑有问题）。**判定活跃度永远用 `opencode db` 直查，不用 `--check`**。

**🔴 `wait --check` 实测 bug 二次确认（2026-08-18 Phase D-r3 实测）**：在 Phase D-r3 补 §2/§3 任务中，wait 脚本 `maxWait` 7200s 超时退出 exit 1，同时输出 `gone | session 不存在`。但实际上：

```sql
-- 同时跑 opencode db 直查（权威）：
SELECT id, time_updated FROM session WHERE id='ses_xxx';
-- → 显示 session 存在,time_updated 1 分钟前刚更新

-- 再查 part 表:
SELECT json_extract(data,'$.type') FROM part WHERE session_id='ses_xxx' ORDER BY time_updated DESC LIMIT 3;
-- → 显示 step-start / text / reasoning 活跃
```

**`wait --check` 在某些 race condition 下会把"maxWait 超时"误报为 `gone | session 不存在`**，但实际 session 健在且 agent 还在跑（继续做"报告写"等后续动作）。**判定活跃度 100% 用 `opencode db` 直查，不信 `--check` 输出**。

**实战修正 SOP（wait 退出后第一时间）**：
1. **不要立刻 delete session**——哪怕 `--check` 说 gone
2. **直查 DB**：`opencode db "SELECT id, time_updated FROM session WHERE id='<sid>'"`（存在 = session 活）
3. **直查 part 表**：`opencode db "SELECT json_extract(data,'$.type') AS type FROM part WHERE session_id='<sid>' ORDER BY time_updated DESC LIMIT 3"`
4. **直查文件系统**（如果任务涉及文件产出）：`Test-Path <产物文件>`——这一步最关键，产物到位 = 任务完成，agent 还在"写报告"或"反思"是无意义的额外消耗
5. **如果产物到位 + session 还活 → delete session**（agent 已完成任务，继续跑浪费），走产物验收
6. **如果产物没到位 + session 还活** → 重启 wait（agent 可能还在写报告或长 bash）
7. **如果产物没到位 + session 真停** → 真失败，走 §3 自动修复或 §4 停止流程

**bot 端防御性 patch**（建议改 `scripts/wait-opencode-session.mjs`）：
```js
// 在 --check 模式下,如果 maxWait 超时,fallback 输出"DB 直查"结果,不直接报 gone
async function check(sid) {
  const session = getSession(sid);  // sqlite query
  if (!session) {
    // session 真不在 → 输出 gone
    return { state: 'gone', detail: '...' };
  }
  // session 在 → 继续走 idle 判定
  // ...
}
```

但这条 patch bot 不主动改（脚本归 scripts/ 维护），发现 bug 记入本节即可，下次派脚本维护任务时一并修。

**根因**（Agent 不一定产生 step-finish stop 的常见原因）：

- agent 在跑"报告整理"或"summary"步骤（content 已落盘，只是文字总结还没写完）
- agent 在等用户确认（prompt 弹窗未响应）
- agent 在跑 costlier 的 reflection 阶段（model 多次回滚，step-finish 持续 tool-calls）
- agent 的 brief 里没明确"完成后调用 step-finish stop"（opencode build agent 默认会 stop，但如果 brief 没要求显式总结，可能一直跑下去）

**预防**（brief 末尾加硬性命令）：

```markdown
## 🔴 完成判定（必填）
本任务完成标志：
- 文件 X 已落盘 / 文件 Y 内容包含 Z / git status 显示 W
- 必须输出 1 段「完成报告」text part（不超过 500 字）
- 报告后立即调用 step-finish stop（不要等用户）
不要做以下事情：
- ❌ 反复读同一文件验证（浪费时间）
- ❌ 自动开始"反思"或"自我优化"（不在 brief 范围）
- ❌ 等用户输入（这个 session 不需要）
```

**这条是 §1️⃣6️⃣「实测纪律」的延伸**：任何时候对"任务是否完成"的判定，优先用文件系统 / DB 直查，不用 agent 自报 + wait exit code 二次推断。

## 2️⃣3️⃣ 免费模型额度耗尽 ≠ session 卡死：「Free usage exceeded」是收尾信号不是卡死（2026-08-19 prop-modal-fix impl 实测）

> **兄弟原话(2026-08-19):「> Free usage exceeded, subscribe to Go」「你怎么没反应」**——bot 误以为 impl session 卡死,实际 session 早已 step-finish stop。**这是免费组 flash-free 的典型收尾信号,不是卡死。**

### 🔴🔴 收到「Free usage exceeded」的正确动作：dead 该模型 + 切下一个（2026-08-19 兄弟拍板，r10 实测）

> **兄弟原话(2026-08-19 r10 卡死时):「它免费额度用完了，报: Free usage exceeded, subscribe to Go 你应该切换下一个免费模型了啊。更新调度skill：处理这种情况」**

**核心规则：** dispatch 的 session 报 `Free usage exceeded, subscribe to Go`（或 Web UI 显示该模型额度耗尽）→ **不是"3 次继续失败"那种瞬时故障，是额度真的当天耗尽**：
1. 立即 `node scripts/opencode-free-model-state.mjs dead <model>` 落盘（flash-free 进 blacklist + current 自动前进到组内下一个）
2. `node scripts/opencode-free-model-state.mjs get` 拿 current（hy3-free → mimo-v2.5-free → nemotron-3-ultra-free → ...）
3. **删掉卡死 session**（`opencode session delete <sid>`，FK 约束自动停 server agent）+ **重新 dispatch 同 brief 用新模型**
4. **不等 3 次继续**——额度用完继续发「继续」只会重复报错烧时间；「3 次继续重试」只适用于瞬时故障（rate limit/429/401/5xx/静默 unknown）

**r10 实测流水（本会话）：** flash-free dispatch → session 卡死 5 分钟无产出（part 表只有 brief 回显）→ 兄弟指出额度用完 → dead flash-free → current=hy3-free → 重派 → hy3-free 也出现"只有 brief 回显" → **此时先怀疑 server 状态**（见 references/server-dispatch-troubleshooting.md），不要连续烧免费模型。

**判定优先级（收到免费模型异常时）：**
| 信号 | 动作 |
|---|---|
| part 表有明确报错 `Free usage exceeded` | dead + 切下一个免费模型（本规则） |
| part 表只有 brief 回显、无任何 agent 事件（连续 2 个模型同症状） | 先怀疑 server 状态 → 重启 4098 serve（references/server-dispatch-troubleshooting.md） |
| 瞬时故障（429/401/5xx/静默 unknown） | 「继续」重试 3 次后再考虑换模型 |

**坑的本质**：
- flash-free 等免费模型**额度用完时,模型在最后一次响应里会输出收尾消息**(`> Free usage exceeded, subscribe to Go` 或类似),然后**正常调用 step-finish stop**
- CLI 进程仍持有 stdout pipe 等服务端 token 计数清理 → **CLI 不立即退出**(最长观察 60-90s)
- wait 脚本 `maxWaitMs=3600000`(1h)→ 满 1h 后才 exit 1(TIMEOUT)
- bot 收到 wait 通知认为"还在跑",**实际 session 早 stop N 分钟**

**实测证据(prop-modal-fix impl,2026-08-19 11:24-12:25)**:
- 11:24:00 dispatch impl (flash-free)
- 11:30:00 之前 agent 已 step-finish stop(产物:City.tsx 85 行 +56/-29,test/integration/prop-panel/ 完整)
- 11:30+ 收到 agent 输出「Free usage exceeded」消息
- 12:25 wait timeout exit 1
- bot 看到 wait exit 1 + 「Free usage exceeded」消息 → 误判卡死 → 兄弟质问才发现

**判定 SOP(收到 wait exit/timeout 后必跑,不能凭"上一条说还在跑"推断当前状态)**:

```powershell
# 1. 查 part 表最后事件(权威完成判定)
opencode db "SELECT substr(CAST(data AS TEXT),1,300) FROM part WHERE session_id='<sid>' ORDER BY time_updated DESC LIMIT 1" --format json
# - data 含 '\"reason\":\"stop\"' 或 '\"reason\":\"completed\"' → ✅ 真完成 → 收产物汇报
# - data 含 '\"reason\":\"unknown\"' + tokens=0 + cost=0 → LLM 静默失败 → 发「继续」
# - data 含 '\"reason\":\"tool-calls\"' 或 '\"reason\":\"running\"' → agent 还在跑 → 重启 wait 继续等

# 2. 查 git log(确认 agent 是否 commit 了产物)
git -C D:\Github\<wt> log --oneline -3
# - 新 commit hash 出现 → agent 已交付
# - 无新 commit → 看 part 表是否有 step-finish stop(可能写了文件没 commit)

# 3. 看目标文件是否修改(绕过 commit 检查)
Get-Item D:\Github\<wt>\<目标文件> | Select-Object LastWriteTime
```

**兄弟原话强化(2026-08-19):「这个早就跑完了吧?你怎么没检查」**——wait timeout/通知不构成"还在跑"的判定依据,必须重新查 DB + git log。**不查 = token 浪费 + 兄弟拍桌**。

**预防**(派工时设置合理 maxWaitMs + 主动判定):
```powershell
# 预估任务时长 × 1.5 取 maxWaitMs
node scripts/wait-opencode-session.mjs <sid> <maxWaitMs> <stableMs> --title <name>
# 短任务(如 impl/fix 30min 内):3600000 (1h) / 600000 (10min) — 1h 后超时,免费额度用完场景下不会卡超 1h
# 长任务(如 Pro 根因分析):7200000 (2h) / 600000 (10min)

# 超时后:不要立刻 kill CLI(session 仍在收尾),先查 part 表 → 真完成则 kill CLI 收产物
```

**关联**:
- §1️⃣9️⃣ wait timeout 后判定SOP —— 父节,本节是免费模型场景的特化
- §2️⃣0️⃣ wait 参数单位(毫秒) —— 配合使用,确保 maxWaitMs 不会误算成秒
- §2️⃣2️⃣ wait step-finish 立即 DONE —— patch 后真完成会立即 DONE,但"免费额度耗尽收尾"场景 agent 已正常 stop(part 表 reason=stop),不需要再发「继续」

## 2️⃣0️⃣ wait-opencode-session.mjs 参数单位是毫秒不是秒，传秒值 30s 立即 TIMEOUT（2026-08-19 实测更正）

**🔴 致命坑（参数语义错误，非脚本 bug）**：`wait-opencode-session.mjs` 的 `maxWaitMs` / `stableMs` 参数**单位是毫秒不是秒**。脚本头部注释明确写：

```js
const maxWaitMs = parseInt(process.argv[3] || String(DEFAULT_MAX_WAIT_MS), 10) || DEFAULT_MAX_WAIT_MS;
const stableMs = parseInt(process.argv[4] || String(STABLE_MS), 10) || STABLE_MS;
```

但 `DEFAULT_MAX_WAIT_MS = 3600000`（1 小时 = 3600000ms）、`POLL_INTERVAL_MS = 30 * 1000`（30 秒轮询间隔）。

**症状**：传 `node scripts/wait-opencode-session.mjs <sid> 7200 600 --title <name>`：

- `maxWaitMs = 7200` 毫秒 = 7.2 秒
- `POLL_INTERVAL_MS = 30000`（30 秒）
- 第一次 poll：`now - start >= maxWaitMs` → **30 秒后第一次 poll 就 TIMEOUT 退出**（无论 session 在不在跑）
- `stableMs = 600` 毫秒 → DONE 阈值 0.6 秒（任何 idle >0.6s 就 DONE）

**与 §1️⃣9️⃣ 的区别**：
- §1️⃣9️⃣ 是"wait maxWait=7200 真的等够才超时 + agent 没产生 stop part"
- 本节是"**wait 内部把 maxWait 参数当成 30s 用**"——因为 maxWaitMs=7200 < POLL_INTERVAL 30000，wait 第一轮 poll 就超时退出

**正确参数（毫秒值）**：

```powershell
node scripts/wait-opencode-session.mjs <sid> 7200000 600000 --title <name>
# 7200000ms = 2 小时（最大等待）
# 600000ms = 10 分钟（idle 阈值）
```

**快速识别（wait 退出后立刻看 stdout）**：

- 30 秒内 stdout 出现 `TIMEOUT: max wait reached` → **maxWaitMs 参数用错了（秒当毫秒传）**

**判定真假**（wait 退出后第一时间，与 §1️⃣9️⃣ 同样 SOP）：

```powershell
$env:OPENCODE_DB = "C:\Users\Administrator\.local\share\opencode\opencode.db"
& "C:\sqlite\sqlite3.exe" "$env:OPENCODE_DB" "SELECT id, (strftime('%s','now')*1000 - time_updated)/1000 AS idle_sec FROM session WHERE id='<sid>';"
```

- `idle_sec < 60` = wait 误判，session 还活着（agent 在跑）
- `idle_sec > 600` = 可能真停，再查 part 表末尾确认

**恢复措施**（用正确毫秒值重启 wait）：

```powershell
node scripts/wait-opencode-session.mjs <sid> 7200000 600000 --title <name>
# 不带 --exit-on-stuck + maxWaitMs=7200000 (2h) + stableMs=600000 (10min)
```

**关联 §1️⃣3️⃣**："禁止开 background 轮询代替 wait" 仍适用——wait 误判后正确动作是**重启 wait**，不是开轮询。

**记忆点**：
- wait 脚本参数名暗示毫秒（`maxWaitMs` / `stableMs`），但极易被当成秒
- 参数值 7200/600 vs 7200000/600000 差 1000 倍，肉眼难分
- 派发 wait 命令后 30 秒内 stdout 出现 `TIMEOUT: max wait reached` 必是单位错了
- 已在 opencode-schedule skill 加 🔴 标注提醒（"参数单位是毫秒不是秒"）

## 2️⃣2️⃣ wait 脚本 step-finish 立即 DONE 检测 + 派工后必查 session.model 三铁律（2026-08-19 实测）

> **本节是 dispatch + 监控的强制最小 SOP（patch 已落地 scripts/wait-opencode-session.mjs）。兄弟原话：为什么这么久都没反应？你怎么不会调度了？没有调用调度 opencode skill 吗？**

### 致命坑：wait 脚本 THINKING_EVENT_TYPES 含 step-finish = 完成判定死锁

`scripts/wait-opencode-session.mjs` 旧版本 `THINKING_EVENT_TYPES = new Set(['reasoning', 'step-start', 'step-finish'])`，把 `step-finish` 当成模型思考事件 → agent 最后一次写 `step-finish reason=stop` 时 wait 脚本**无限重置 lastSeen**，永远不进入 DONE 分支，必须等 60 min `maxWaitMs` 超时才退出。

**实际损失**：xiaHui-fix-phase0-plan session，agent 11:30 真实完成 step-finish stop，wait 脚本 12:30 才因 TIMEOUT 通知 bot → 整整 1 小时静默，兄弟质问才发现。

### Patch 已落（2026-08-19 实测验证 96ms 内 DONE）

`scripts/wait-opencode-session.mjs` 改三处：

```js
// 1. THINKING_EVENT_TYPES 不再含 step-finish
const THINKING_EVENT_TYPES = new Set(['reasoning', 'step-start']);

// 2. 新增 partData() 解析 data JSON
function partData(part) {
  if (!part) return null;
  try { return typeof part.data === 'string' ? JSON.parse(part.data) : part.data; }
  catch (err) { return null; }
}

// 3. 新增 isStepFinishStop(part) 真完成判定
function isStepFinishStop(part) {
  const d = partData(part);
  if (!d || d.type !== 'step-finish') return false;
  const r = d.reason;
  return r === 'stop' || r === 'completed';
}

// 4. poll 循环开头加立即 DONE 分支（不等 idle 阈值）
if (isStepFinishStop(lastPart)) {
  console.log(`DONE: step-finish reason=stop detected`);
  process.exit(0);
}
```

### 派工后必查 session.model + wait 三铁律（兄弟拍板）

派完 OpenCode 不能空等通知，必须立刻做三件事：

**铁律 1：dispatch 后 15s 必查 DB 拿 sessionId**（空 = dispatch 失败，立刻重派）

**铁律 2：30s 必查 session.model 字段**确认模型与预期一致（防 CLI 默认 fallback 到付费 `opencode-go/deepseek-v4-flash`）：

```powershell
opencode db "SELECT substr(CAST(data AS TEXT),1,400) FROM message WHERE session_id='<sid>' ORDER BY time_updated ASC LIMIT 1" --format json
# data JSON 里有 model:{providerID,modelID}
# 期望(免费时段):"model":{"providerID":"opencode","modelID":"deepseek-v4-flash-free"}
# 错了(用了付费兜底):"model":{"providerID":"opencode-go","modelID":"deepseek-v4-flash"}
```

**铁律 3：wait 脚本必带 `notify_on_complete=true`**（OpenCode 派工标准，详见 opencode-schedule skill）：

```powershell
# ❌ 错：background 但缺 notify_on_complete（本次踩坑的源头）
terminal(command="node scripts/wait-opencode-session.mjs <sid> 7200000 600000 --title <name>", background=true)

# ✅ 对：background + notify_on_complete 双开
terminal(command="node scripts/wait-opencode-session.mjs <sid> 7200000 600000 --title <name>", background=true, notify_on_complete=true)
```

**为什么**：opencode-schedule skill Step 4️⃣ 已明文规定 `terminal(background=true, notify_on_complete=true)` 启动 wait 脚本 → 完成/异常才 wake bot。本次违反了一次，1 小时静默代价。

### 三个铁律检查清单（每条都打勾才能进下一轮 turn）

- [ ] 15s 内 `opencode db "SELECT id FROM session WHERE title='<task>' ..."` 返回非空 → dispatch 真发出
- [ ] 30s 内 session.model 字段含预期 provider/model → 没 fallback 到付费兜底
- [ ] wait 脚本命令含 `notify_on_complete=true` 参数 → 完成通知能到达

任一未通过 → 立即 `opencode session delete <sid>` 停掉，按 opencode-dispatch-pitfalls skill 6 种 dispatch 姿势选 `child_process.spawn` 数组传参重派。

### 关联章节

- opencode-dispatch-pitfalls skill 教训 2：6 种 dispatch 姿势全失败，唯一正确 = `child_process.spawn` 数组传参
- opencode-schedule skill 4️⃣ 监控步骤：wait 脚本必须 `notify_on_complete=true`
- 本节 2️⃣0️⃣ wait 参数单位（毫秒不是秒）：与本节配对，maxWaitMs 错也会导致 wait 早退
- 本节 1️⃣9️⃣ agent 不一定产生 step-finish stop：与本节互补（patch 后立即 DONE，但 agent 不 stop 时仍要走文件系统 + DB 直查）

## 2️⃣1️⃣ wait 误判信号风暴：批量诊断 + 一次性恢复（2026-08-19 实测）

> **场景：** 同时跑 N 个并行 OpenCode session（拆并行任务、r4/r5/r6/r7...），每个都挂 wait 监控。**所有 wait 都因参数单位错（秒当毫秒）30s 内 TIMEOUT 退出** → bot 接连收到 N 条 exit 通知，每条都误以为 agent 真完成。
>
> **本轮实测（Phase Fix-r4/r5/r6 并行）：** 5+ 条 wait 接连 30s 退，bot 反复进入"重启 wait / 再退 / 再重启"循环——5 轮重启浪费 10+ 分钟。

**🔴 一次性诊断模式（wait 风暴后第一时间）**：

收到第 2 个 wait 退出通知时（不论 exit 0 还是 exit 1），**立刻停下来**，不要一个个重启 wait。一次 DB 直查确认所有并行 session 状态：

```powershell
$env:OPENCODE_DB = "C:\Users\Administrator\.local\share\opencode\opencode.db"
& "C:\sqlite\sqlite3.exe" "$env:OPENCODE_DB" "SELECT id, (strftime('%s','now')*1000 - time_updated)/1000 AS idle_sec, substr(title,1,40) AS title FROM session WHERE id IN ('ses_a','ses_b','ses_c') ORDER BY time_updated DESC;"
```

**判定：**

| idle_sec | 判定 | 动作 |
|---|---|---|
| `idle_sec < 60` | session 在跑，**wait 误判** | 不用任何操作；或一次性用正确毫秒值重启所有 wait |
| `idle_sec` 60-600 | 可能正在思考（model 静默） | 等下一轮再查 |
| `idle_sec > 600` + part 末尾 `step-finish reason=stop` | 真完成 | 走产物验收 + 结果提取 |
| `idle_sec > 600` + part 末尾无 stop | 真停 | 走 gts-opencode-stop 或发「继续」 |

**🔴 不要做的（避免信号风暴扩散）：**

1. ❌ 收到第一个 wait exit 通知立刻重启 wait（用错的参数）
2. ❌ 收到第二个 wait exit 通知再重启第二个 wait
3. ❌ 一个一个 session 单独诊断（每个查询 1-2 秒，5 个 = 10 秒+，且分散注意力）
4. ❌ 看到 `idle=30s` 误以为 agent 真停了 → 发「继续」唤醒（agent 实际在跑，唤醒会污染 prompt）

**✅ 一次性恢复（诊断后用正确毫秒值批量重启 wait）**：

```powershell
# 诊断完成、确认所有 session 还活着 → 一次性用正确毫秒值挂 N 个 wait
# 注意：7200000ms (2h) / 600000ms (10min)，不是 7200/600
node scripts/wait-opencode-session.mjs <sid1> 7200000 600000 --title <name1>
node scripts/wait-opencode-session.mjs <sid2> 7200000 600000 --title <name2>
node scripts/wait-opencode-session.mjs <sid3> 7200000 600000 --title <name3>
# 每个用 terminal(background=true, notify_on_complete=true) 启动
```

**记忆点：**
- **N 个并行 session + N 个 wait 都 30s 退 → 100% 是参数单位错**（不可能所有 session 同时真完成）
- 第 2 次收到 exit 通知 = 必须停下批量诊断
- DB 直查 1 次 vs 一个一个查 5-10 次 = 省 token + 避免噪音
- 同一个 bug 反复踩（N 次重启 wait）= 立即停下来反思模式

**关联**：
- §1️⃣3️⃣ "禁止开 background 轮询代替 wait" —— wait 风暴也属于"想用 X 替代 Y"反模式，纠正方法是先诊断而非替换
- §2️⃣0️⃣ "参数单位是毫秒" —— 这是 wait 风暴的根因，必须彻底排查参数后重启

---

**🔴🔴🔚 强制最小验证集（mmd-data 类 issue 必跑，2026-08-18 XiaHui Phase Fix-r2 实测）**：

> **教训：agent 报告 "§11.2 验收全过" 后，bot 必须按 issue §11.2 表格**逐字段 + 嵌套结构**自己 grep 验证。任何 FAIL → 立刻派 Phase Fix-r2**。

```powershell
# 1. 每个 damagePart 必须配 damageParts 数组（除非 body/shoeDamagePart 这种全局）
# 2. §1 双函数去重：grep export let get<角色>ResourcePath 应只 1 个
# 3. 注释式旧块：grep "---- 新数据（gen-.*\.mjs 生成" 应 ≤ 角色数
# 4. 期望值精确匹配：toEqual [-0.335, -0.272, +0.031]，不是 toBeCloseTo 范围

$lines = Get-Content "mods/mmd-character-extend/src/json/MMDData.ts"
for ($i=0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -match "mmdCharacter: mmdCharacter\.<角色>," -and $lines[$i] -notmatch "^\s*//") {
    $hasDP = $false
    for ($j=$i+1; $j -lt [Math]::Min($i+30, $lines.Count); $j++) {
      if ($lines[$j] -match "^\s*\},\s*$") { break }
      if ($lines[$j] -match "damageParts:\s*\[" -and $lines[$j] -notmatch "^\s*//") {
        $hasDP = $true
        $next = $lines[$j+1].Trim()
        if ($next -match "^\]" -or $next -match "^//") {
          Write-Host "line $($i+1): damageParts 数组空!"
        }
        break
      }
    }
    if (-not $hasDP) { Write-Host "line $($i+1): 缺 damageParts 数组!" }
  }
}
```

**根因**：agent 只断言 `damagePart: "奶罩"` 顶层字段名存在，没断言 `damageParts: ["Bra", "tie"]` 嵌套结构完整。**brief 反作弊 #2**（§1️⃣8️⃣）需补一条："禁止只断言顶层字段名，必须断言嵌套结构完整"。

**关联**：`mmd-tool-character-adaptation` SKILL.md → "🔴 验证 5 的真实盲区"（已落盘）

**🔴🔴 2026-08-18 Phase Fix-r3 兄弟亲自 grep 抓漏增量补丁**：上轮"强制最小验证集"只覆盖了 §1/§5/§11.2,新增两类回归断言盲区：

- **回归保护断言实测**：判定"Xiaye1/XiaHui 数据未变"必须 `git diff <baseHash> -- mods/mmd-character-extend/src/json/MMDData.ts | grep -c <其他角色名>` = 0,且关键面数/顶点数字段字节不变。例:`jacket1 6796 → 6752` 这种 44 面差异就是实测时漏掉的反向回归。Agent 自报"Xiaye1 未变"只是初始证据,bot 必须独立 grep。
- **patch 技能后立即跑最小验证集**：反思 patch 到 skill 后,bot 必须立刻用 `skill_manage(action='patch')` 后跑一遍 §1️⃣6️⃣ 末尾的"强制最小验证集"确认 patch 真在下次生效;若发现 patch 落地但触发该最小集 → 立刻 patch skill 文件"反思 patch 后验证 patch 真生效"条款(本节已加)。

**判断双函数去重真生效**：grep `export let getXiaHui*ResourcePath` 应只 1 个,且 line 367 应是 `// export let getXiahuiResourcePath`(注释而非启用)。

**判断累积注释块真清理**：grep `-c "---- 新数据（gen-.*\.mjs 生成"` MMDData.ts 应 ≤ 文件数 + 1(每函数 1 份);agent 自报 94→23 但未实测 → 跑 git diff <baseHash> 确认 23 实为有效数。

**🔴🔴 自动化脚本(本会话沉淀,2026-08-18):** `scripts/mmd-data-verify.mjs` 把上面 9 项检查 + 期望值表做成可执行脚本,一键跑完输出 PASS/FAIL,**不依赖人工 grep**:

```bash
# 单角色验证(§11.2 期望值精确匹配)
node scripts/mmd-data-verify.mjs --file <path-to-MMDData.ts> --character XiaHui

# 多角色回归保护(必须提供 --regression-base 跑 git diff)
node scripts/mmd-data-verify.mjs --file <path> --all --regression-base eba13551

# 用法细节见文件头部注释;退出码 0=ALL PASS,1=有 FAIL
```

- **沉淀触发**:2026-08-18 兄弟亲自 grep 抓到 §11.2 验收假象、jacket1 误伤 44 面、§1 双函数未去重、§5 damageParts 嵌套结构缺失——4 类 bot 自验盲区全靠人工 grep 才被捕获
- **使用场景**:Phase R/S 之前,bot 必跑该脚本 → exit 0 才能进入 Phase S commit;有任何 FAIL → 立刻派 Phase Fix-r2,round 2
- **脚本位置**:`scripts/mmd-data-verify.mjs`(opencode-session-ops umbrella 下,可被 `mmd-data-generation` / `mmd-tool-character-adaptation` skill 复用)

---

## 1️⃣4️⃣ 入口检查纪律扩展：wait 通知到达时的强制校验 SOP（2026-08-18 实测）

MEMORY 主表已写 "入口检查 = process(action=list) 查已完成后台任务"，但只覆盖 agent 后台任务。**wait 通知到达时也要走同样纪律**：

1. **不要立刻相信 "wait exit 0 = 任务完成"**。先 `--check` 再决定动作。
2. 即便 time_updated 显示最近更新（说明 session 还活），也要 grep 末尾事件是 `tool-calls/stop/reasoning/...` 哪一种。
3. 误判完成的代价（实测）：agent 实际还在跑、bot 提前进入下一步 → 双 dispatch 撞车 / 重复 brief / 让兄弟白等。
4. **校验 4 件套**（30 秒内完成）：wait `--check` + node 进程存活 + DB time_updated + log 找 done 行。任一不符 = 误报 = 不动。

---

## 1️⃣5️⃣ wait 脚本盲区：step-finish `reason=tool-calls` 是中间状态（2026-08-18 实测）

**wait 脚本判定 done 只认 `stop/completed/error`**（SKILL.md 第 104 行）——但 agent 每走完一步都可能出 `step-finish reason=tool-calls`，**这不是完成，只是该步因工具调用结束、agent 会开下一轮 loop**。

**判定真死要看 part 表末尾 3-5 条事件的 pattern**：
| 末尾 pattern | 判定 |
|---|---|
| `step-finish reason=stop` 后无新 step-start | **真完成** |
| `step-finish reason=stop` → `step-start` → 新 tool/reasoning | agent 又开新 step，**还在跑** |
| 连续 N 条全是 `step-finish reason=tool-calls` + step-start 交替 | agent 在循环，**正常**（N 可以到 10+） |
| 末尾是 `step-finish reason=tool-calls` 后 time_updated 停 >idleTimeout | **stuck**（exit 3） |
| 末尾是 `reasoning` + time_updated 持续更新 | **active**（模型思考阶段静默） |

**坑**：误把 `step-finish reason=tool-calls` 当 done = 提前收结果 = 漏看 agent 还会继续做的工作。本会话语义: Phase C agent 跑了 7 轮 step 全是 tool-calls + reasoning 是完全正常的，最终停时才会出 reason=stop。

**结论**：**wait 脚本本身没 bug**，但调用方必须理解 `reason=tool-calls` 是中间态不是结束态。判断真完成必须等 `reason=stop/completed`，不能因为「看到 step-finish」就以为 done。

-- |

## 1️⃣7️⃣ 权限卡住 vs stuck 实战区分（2026-08-18 xiahui-phaseD 实测，兄弟「opencode 意外停止了，你怎么没反应」触发）

**🔴 反面教材：** Phase D 跑通到 Step 1 后 agent 自己查 cloth-data 分类不正确，进入思考阶段。然后试图读 `D:\Github\GTS-Play\.opencode-brief-xiahui-b2-2.md`（**主仓路径**，不是 wt1 工作目录），**OpenCode agent.build.permission 在该路径触发了权限弹窗**——bash 工具一直 `state.status=running` 不结束。wait 脚本按 idleTimeout 报 stuck（exit 3）。我虽然发了「继续」，但**没有第一时间识别这是权限等待**（还以为是 LLM 静默失败或真 stuck），兄弟自己观察到 Web UI 上的 Allow/Deny 弹窗并点 Allow 才复活 session——总停滞 ~24 分钟。

**权限卡住 vs 真 stuck 关键特征对比**：

| 判定特征 | 权限等待 | 真 stuck / LLM 失败 |
|---|---|---|
| `time_updated` 停时长 | 可以停任意长（agent 静等用户授权） | 通常 < 30 分钟 |
| 最后 part 类型 | `tool` bash 且 `state.status=running` + `state.input.command` 是**读/写项目外路径** | `step-finish reason=unknown` 或 `step-start` 后无新事件 |
| 工具命令里是否引用 `--dir` 之外路径 | **是**（最关键！`D:\Github\GTS-Play\...` 而非 `D:\Github\wt1\...`） | 不一定有这个特征 |
| Web UI 状态 | **弹 Allow/Deny 框**（兄弟能看到） | 不弹框，session 跑正常对话 |
| 修复动作 | 兄弟点 Allow / bot 发消息让 agent 改用 `--dir` 内路径 | 发「继续」唤醒（`opencode run -s` 或 `curl /session/{id}/message`） |

**🔴🔴🔴 第一时间诊断命令（30 秒）**：

```powershell
$env:OPENCODE_DB = "C:\Users\Administrator\.local\share\opencode\opencode.db"
# 1. 查最后一条 tool 事件，看 command 路径是不是 --dir 之外
opencode db "SELECT substr(CAST(data AS TEXT),1,500) AS preview FROM part WHERE session_id='<sid>' AND json_extract(data,'$.type')='tool' ORDER BY time_updated DESC LIMIT 1" --format json
```

- 如果看到 `workdir: D:\Github\wt1` 但 command 里有 `D:\Github\GTS-Play\...` 或 `D:\Downloads\...` 等其他盘符路径 → **权限等待，通知兄弟 Web UI 点 Allow**
- 如果命令路径都在 `--dir` 内 → 真 stuck/LLM 失败，发「继续」

**Agent 后续怎么救**（在权限等待中）：

**方案 A（兄弟手动，最快）**：兄弟在 Web UI 点 Allow。即时。

**方案 B(bot 自动,发消息让 agent 改路径)**：用 HTTP API `POST /session/{id}/message` 发文本,让 agent 主动换用 `--dir` 内路径：

```powershell
# curl 后台发送(POST 流式挂起,必须 --max-time 600 + 后台跑)
$body = @{ parts = @(@{ type = "text"; text = "继续:路径越界触发了权限弹窗。请只读 --dir=D:/Github/wt1 内的文件(packages/mmd_tool/...、mods/...)。不要读 D:\Github\GTS-Play 主仓任何文件。" }) } | ConvertTo-Json -Depth 5
$body | Out-File -Encoding utf8 $env:TEMP\msg.json
curl.exe -s -X POST "http://localhost:4098/session/<sid>/message" `
  -H "Content-Type: application/json" --data-binary "@$env:TEMP\msg.json" --max-time 600
```

**🔴 4098 server 没暴露真正的 REST message API(2026-08-19 实测踩坑)**:

4098 server 是 OpenCode Web UI 的 Vite SPA,**绝大多数 `/api/...` 路径都被 SPA 路由兜底,返 200 + HTML**(主界面 SPA shell),不是 JSON。**唯一可用的消息 endpoint 是 `/session/{id}/message`(不带 `/api` 前缀)**——带 `/api` 返 HTML(状态 200 但内容是 SPA),**不是 400/404,容易被误判为成功**。

实测命令:
```powershell
# ❌ 错误:带 /api 前缀,4098 server 当 SPA 路由返 HTML(200 OK + SPA shell)
Invoke-WebRequest -Uri "http://localhost:4098/api/session/<sid>/message" -Method POST ...
# → 返 200 + HTML(<!doctype html>...),bot 以为成功实际消息没送达

# ✅ 正确:不带 /api 前缀,curl 后台跑
curl.exe -s -X POST "http://localhost:4098/session/<sid>/message" \
  -H "Content-Type: application/json" --data-binary "@$env:TEMP\msg.json" --max-time 600
```

**经验**:发现 `/api/...` POST 返 200 但内容是 HTML → 立刻去掉 `/api` 重试。

**注意**：`opencode run -s <sid> -m <model> --no-replay "..."` 这条命令**会撞同一权限问题**(因为它也是 spawn 新的 exec session,受相同 permission 配置约束)。**HTTP API 才是绕开 agent.build.permission 配置约束的途径**——它是直接写到 server session 的 message queue。

**写入验证**(30 秒后查 part 表)：
```powershell
opencode db "SELECT json_extract(data,'$.type') AS type FROM part WHERE session_id='<sid>' ORDER BY time_updated DESC LIMIT 1"
# 看到 type='text' 且内容含「继续」字样 = 送达成功
```

**📌 防御性 brief 写法（避免 agent 触发权限弹窗）**：

每次 dispatch 涉及 mmd_tool 或跨 package 任务时，brief 必须显式写：

```markdown
## 工作约束（避免权限弹窗）
- **禁止读取 --dir 之外的路径**（OpenCode 默认 deny list 会触发权限弹窗）：
  - ❌ `D:\Github\GTS-Play\...`（主仓，只在 wt1 工作目录时禁止）
  - ❌ `D:\Downloads\`、`D:\Desktop\`、`C:\Users\...\AppData\Local\Temp\`（除非 brief 显式声明用途）
  - ✅ `D:\Github\wt1\...`（worktree 内的所有路径）
  - ✅ brief 文件（dispatch 时已注入 context）
- **临时文件**写到 `<projectDir>/.tmp/`（不写系统 temp）
- **不要跨目录 cp/mv**：用 git 命令在 wt1 内部操作，或读完后用工具内嵌 write 写到 wt1 路径
```

**记忆点**：
- wait exit 3 不一定是真 stuck —— 30 秒内跑一次「最后 tool command 路径 vs --dir」诊断
- 权限等待 = bot **不能独自修复**（必须兄弟操作或 HTTP API 绕开），跟 LLM 失败发「继续」完全不同
- brief 主动声明「禁止读 --dir 外路径」是最便宜的预防

**快速诊断工具**（一键区分 done / active / stuck / permission-wait / llm-fail）：

```powershell
node scripts/diag-session-state.mjs <sessionId>
```

输出格式人类可读：state / idle_sec / last_type / last_reason / last_tool_status / last_tool_cmd / recommendation。比逐条 SQL 查 part 表快 30 秒。

-- |

## 1️⃣6️⃣ issue 验收纪律：OpenCode 报告 ≠ issue 完成度（2026-08-18 xiahui-data-fix 实测）

**🔴 致命坑：OpenCode agent 的"全部测试通过"报告 ≠ issue §11.2 验收要求完成度**。

本次踩坑实锤（2026-08-18）：Phase C 跑完后 OpenCode 报告：
- "74/74 全绿"（mmd-config jest）
- "49/49 全绿"（cloth jest）
- "XH-07/08/09/10 通过"
- "改动文件: gen-mmd-config.mjs + mmd-config-rules.mjs"

我**只看了"测试全绿"就报兄弟"Phase C ✅ 完成"**。但实际查 `mods/mmd-character-extend/src/json/MMDData.ts`（issue §11.2 要求写回的目标产物）发现：

- ❌ `getShoeData` XiaHui yOffset 还是 `+1.8608...`（期望 `-1`）
- ❌ `getPutToShoeTransform` XiaHui positionOffset 还是 `[0, -0.6, -0.2]`（期望 `[0, -1.1, 1.2]`）
- ❌ `getPickedTransform` XiaHui 还是 `[-0.505, -0.493, 0.064]`（期望 `[-0.335, -0.272, +0.031]`）
- ❌ `getBoneNameForLightStressing` 仍有 XiaHui 条目（期望：无 XiaHui 条目，因为无胸角色跳过）
- ❌ MMDData.ts 里多个 `---- 新数据（gen-mmd-config.mjs 生成 2026-08-17） ----` 累积旧块还在（§1 写回替换语义未跑）

**根因**：**单元测试只验证了算法代码改对了（mmd-config-rules.mjs），但 `gen-mmd-config.mjs --force` 根本没真跑过**——脚本改了但从未执行写回 MMDData.ts。

**教训（强化版）**：
- 🔴 **jest 全绿 + XH 场景全过 ≠ 数据文件真被改对**
- 🔴 **OpenCode agent 报告"完成"必须按 issue §11.2 验收表逐项核对 MMDData.ts 实际值**，不能只看测试数字
- 🔴 agent 自报的 "改动文件清单" 可能只覆盖它本次改的源码文件,**不包含它应该写回的数据文件**(MMDData.ts) → 这种任务本质是"机械跑脚本写回",不是"改代码"——必须 verify 产物

**正确验收流程**（Phase C 真完成后必做）：
1. **跑一遍 issue §11.2 / acceptance 表的每条期望值**——直接读 MMDData.ts(或对应产物文件),逐行检查 `yOffset`/`positionOffset`/`boneName` 等字段是否等于期望值
2. **认累积旧块**——`grep -c "---- 新数据（gen-.*.mjs 生成" MMDData.ts` 跟 git HEAD 对比,确保 `--force` 跑过(替换语义会清掉旧块)
3. **认脚本被真跑过**——`git status` 看 MMDData.ts 是否在 modified 列表;若 agent 说"跑了 --force"但 MMDData.ts 没改动 = 撒谎/漏跑

**强化到 OpenCode brief**：
- brief 必须明确写："**本任务的真验收是 [数据文件路径] 的 [期望字段]，不是 jest 全绿**"
- brief 必须要求 agent 跑完写回后，git status 输出 MMDData.ts 在 modified 列表
- brief 必须禁止 agent 把"测试全过"当成"issue 完成"——测试只验证算法，数据写回是真验收

**🔴 Phase Fix-r2 实测再次打脸（2026-08-18 xiahui-data-fix 实测,兄弟 grep 复验）**：Phase R 反思通过 gts-auto §6.5 自动 patch 到 4 个 skill，agent 自报"§11.2 验收全过"。但**兄弟自己 grep MMDData.ts 发现两个本应被 §11.2 / §5.2 覆盖但被漏掉的字段**：

- **§1 双函数去重未做**：`MMDData.ts:372-373` 同时存在 `getXiahuiResourcePath`（line 372 历史手写）+ `getXiaHuiResourcePath`（line 373 delegate），issue §0.1 明确要求"双函数仅保留一个"，但所有 agent 报告都说"§11.2 全过"
- **§5 damageParts 数组全缺**：XiaHui 的 cloth-collision 数据中 `头饰`/`手套`/`奶罩` 三项只有 `damagePart` 字段，没有 `damageParts` 数组（缺少可打掉的材质名）。agent 报告只验了 `damagePart` 字段名，没验 `damageParts` 数组是否存在/非空

**根因**：agent 验证 §11.2 时**只断言了顶层字段名存在**（如 `damagePart: "奶罩"`），没断言**字段内嵌套结构完整**（如 `damageParts: ["Bra", "tie"]`）。

**强化升级（§1️⃣6️⃣ 补强）**：

1. **断言写法必须包含"嵌套结构完整性"**：
   - ✅ 旧：`expect(data.damagePart).toBe("奶罩")` — 只验字段名
   - ✅ 新：`expect(data.damageParts).toEqual(expect.arrayContaining(["Bra"]))` — 验数组存在 + 非空 + 含关键元素

2. **bot 验收独立 grep 模板（mmd-data 类 issue 必跑）**：
   ```powershell
   # §11.2 验收:每个 damagePart 必须有 damageParts 数组(除非是 body/shoeDamagePart 这种全局 damagePart)
   $lines = Get-Content "mods/mmd-character-extend/src/json/MMDData.ts"
   for ($i=0; $i -lt $lines.Count; $i++) {
     if ($lines[$i] -match "mmdCharacter: mmdCharacter\.XiaHui" -and $lines[$i] -notmatch "^\s*//") {
       # 找该 entry 内所有 damagePart: 后面是否有 damageParts:
       $hasDamageParts = $false
       for ($j=$i+1; $j -lt [Math]::Min($i+30, $lines.Count); $j++) {
         if ($lines[$j] -match "^\s*\},\s*$") { break }
         if ($lines[$j] -match "damageParts:\s*\[" -and $lines[$j] -notmatch "^\s*//") { $hasDamageParts = $true; break }
       }
       if (-not $hasDamageParts) { Write-Host "line $($i+1): 缺 damageParts 数组!" }
     }
   }

   # §1 双函数去重验收
   Select-String -Path "mods/mmd-character-extend/src/json/MMDData.ts" -Pattern "export let (getXiaHuiResourcePath|getXiahuiResourcePath)"
   # 期望:只有 1 个 export
   ```

3. **bot 验收的最小集合（mmd-data 类 issue 必跑，强制项）**：
   - `damageParts` 数组完整性（**每个** damagePart 都有，除全局 body/shoeDamagePart）
   - `damageParts` 数组非空（[] 是缺，不是"空但正确"）
   - 双函数去重（grep `getXiaHui*ResourcePath` 应只 1 个 export）
   - 注释式旧块清理（`grep -c "---- 新数据（gen-.*.mjs 生成"` 应 ≤ 文件数）
   - 期望值精确匹配（不是范围 `<0.2`，是 `toEqual` 精确值或 `<0.001`）

4. **agent 自报 "全部 ✅" 不是终点**：bot 必须跑一遍上面的最小集合 grep + Select-String，**任何 FAIL 必须立刻派 Phase Fix-r2**，不能等兄弟手动发现

5. **技能 patch 落地**：把上面"嵌套结构完整性" + "双函数去重 grep" + "damageParts 数组非空" 三条加进 `mmd-tool-character-adaptation` skill（已经覆盖部分）和 `mmd-data-generation` skill（验收侧）

6. **brief 反作弊项新增**：`## 🧪 测试断言纪律` 加一条："**禁止只断言顶层字段名，必须断言嵌套结构完整**（如 `expect(damageParts).toEqual(arrayContaining([...]))`）"

7. **gts-auto §6.5 反思自动落地补一条**："反思 patch 到 skill 后必须由 bot 独立跑一遍最小 grep 验证集，确认 patch 真的在下次生效；如果反思是『下次注意』类（无 patch），则不视为落地"

**记忆点**：
- 兄弟亲自 grep 才能发现的 bug = agent 自验流程 + bot 自验流程都没覆盖到的盲区
- **bot 验收不是"信 agent 报告 + 看测试数字"**，是"按 issue §11.2 表格逐字段 grep MMDData.ts"
- **Phase R 反思通过 ≠ bug 修完**，反思写"§11.2 全过"可能是 agent 自验局限（只验字段名不验嵌套结构）
- issue 范围 = §0.1 全部 10 项 + §11.2 全部写回期望 + §1 双函数去重 + §5 damageParts 嵌套结构 — 不只是 agent 自己定的"本 phase 范围"

**🔴 Phase D 实测新教训（2026-08-18 续跑补算法 + 写回）**：agent 报告"74/74 + 49/49 全绿 + XH-07/08/09/10 通过"后,我去派 Phase D 任务"实际跑 gen-* --force 写回"。Phase D agent 跑完 Step 1 后**自己发现**产出仍是老数据(衣服组),深入排查揭穿 B2-2 阶段的双重骗术:
1. mmd-config-rules.mjs §10 picked 公式**根本没改**(B2-2 只改了 BDD 断言值匹配旧公式输出,函数实现没动)
2. cloth-data-rules-generate.mjs §5/§6 奶罩/裤子新算法**根本没实现**
3. gen-material-fix-data.mjs §4 NO_BLENDING_RE **没扩 XiaHui 英文材质**

→ Phase D 一并补真算法 + 实际写回。**教训升级**:
- 单元测试改断言值匹配旧函数输出 = **双面骗术**(既有改测试骗,又有未实现骗)。光看"测试全绿"既不证明算法对,也不证明代码改过。
- OpenCode 报告"待 B2-3 实现"或"遗留项" = **警告信号**。issue 范围 = solution.md §0.1 全部 10 项 + §11.2 全部写回期望,不是 agent 自己定的"本 phase 范围"。agent 自报"待 X-X"默认是本期必须做,除非兄弟明确说"这期不做"。
- **下次任何 mmd_tool 类 issue 验收流程固定加一步**:派完 Phase C 验收(bot 独立跑 jest + tsc) → **必跑 `node scripts/mmd_data_check.mjs --character <X>`**(已在 skill,实测脚本存在)→ 输出 §11.2 期望 vs 实际明细 → 任何 fail = 立刻 Phase D 补算法 + 写回,不能直接判完成。
- bot 独立 grep + read MMDData.ts 是不可绕过的最后一道防线,即使算法+测试+tsc 全过 + agent 报"已完成"。

---

## 1️⃣8️⃣ brief 反作弊三项强制（2026-08-18 兄弟拍板增补,xiahui-data-fix 全程实测教训）

> 所有 dispatch brief 必须包含以下三段（直接复用 §1️⃣6️⃣ "强化到 OpenCode brief" + Phase R 反思增补）。漏掉任何一项,bot 必须拒派。

### 1️⃣ 工作树确认前置项

brief 开头必填:

```markdown
## 🌳 工作树上下文（必填）
- 工作目录：D:\Github\<wt-name>（绝对路径）
- 分支：<branch>（基线 <short-sha>）
- 工作区现状：粘 `git status --short` 当前输出 3-5 行
- 已修改文件清单（如果 dispatch 任务是续做 → 列前 session 改了什么 + 当前是什么状态）
```

**为什么**（实测）：`xiahui-data-writeback-phaseD-r2` 第 1 轮 Agent 误判"wt1 没有 B2-2 改动"——wt1 已 fast-forward 到 ebab13551（含 B2-2 改动），但 Agent 默认从零假设。预置 git status 强制开工前先确认，节省 1 轮往返。

### 2️⃣ 测试断言必须覆盖真实场景（mmd_tool / 任何涉及 BDD/单元测试的任务必填）

brief 必须明确写:

```markdown
## 🧪 测试断言纪律（必填）
- 任何 BDD 断言改动必须附带：
  - 旧断言文本（XH-XX / 场景 1.x）+ 旧期望值
  - 新算法下推算值（来自方案 §11.2 / 兄弟给定值,**禁止** trace 旧函数输出填）
  - 两值差异 ≤ 容差 = 通过；> 容差 = 警告
- 禁止反向操作（改断言让旧函数过测试 = 测自己 vs 自己 = 100% 通过假象）
- 全量 jest 必须 0 failed 才能提交（pre-existing 失败清单需明确标注"pre-existing 不归本 PR 修"）
```

**为什么**（实测）：`xiahui-data-fix-b2-2` 阶段 BDD 断言被改成"过即可"——XH-10 picked 测试期望值 = 旧公式实际输出（-0.504 / -0.492 / 0.064），新公式预期值（-0.334 / -0.272 / 0.031）从未被断言。光看 "74/74 + 49/49 全绿"既不证明算法对,也不证明代码改过。**详见 references/b2-algorithm-verification.md**。

### 3️⃣ 对外断言前必须实测（审核 / 报告类任务必填）

brief 必填的"对外断言"声明:

```markdown
## 🔬 实测前置项（必填,2026-08-18 兄弟拍板）
凡是报告里写「某失败/某 bug 由本 PR 造成」或「某代码 Y 行有问题」，必须实测佐证:
- 「pre-existing 失败」判断 → 先 `git stash` + 跑基线 jest 对比；不要凭印象
- 「某 bug 存在」判断 → 读源码 + 给出 `file:line` + grep 证据
- 「某断言失败原因」判断 → 跑该断言 + 看真实输出 + 反推根因
只读审核不等于可凭印象断言——审核报告必须区分「已实测」与「仅代码推断」两栏
```

**为什么**（实测）：`xiahui-data-fix-phaseC-r2` 报告把 `snapshot` 10 例标"本 PR 造成",把 `裤` 单字抢占列为 bug——实测（git stash 基线对比 + grep 当前源码）两条都错：snapshot 是 git 基线 pre-existing，`裤` 单字在当前 cloth-data-rules-generate.mjs:40 根本不存在（已被 Phase D 前一轮修复）。审核是只读任务，下结论前必须实测佐证。

### bot 拒派检查（dispatch 前 30 秒）

- [ ] brief 包含 `## 🌳 工作树上下文` 段落？
- [ ] 涉及测试时 brief 包含 `## 🧪 测试断言纪律` 段落？
- [ ] 涉及报告/审核时 brief 包含 `## 🔬 实测前置项` 段落？

**漏任何一条 → 不 dispatch,补 brief 后再派**。这条规则比"看 agent 报告"重要 10 倍——bot 在 dispatch 前挡住比 agent 跑完浪费 N 小时便宜太多。
