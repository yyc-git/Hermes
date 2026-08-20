---
name: hermes-session-forensics
description: "查清「另一个 Hermes 会话在干什么 / 记忆有没有自动保存 / 上个会话留下了什么 / 今天的 token 消耗与费用」。触发：用户问某个 session ID（如 20260817_100712_f74bbc）做了什么、某会话是否保存了记忆、迁移或后台会话的产出落在哪里、总结今天的 token 消耗/费用审计。"
---

# Hermes Session Forensics — 会话活动还原与记忆核验

## Trigger
- 用户问「你知道会话 X 在干什么吗」（X 为 `YYYYMMDD_HHMMSS_<hash>` 格式 session ID）
- 用户问「它的记忆自动保存没有」「上个会话保存了什么」
- 需要确认后台/迁移会话的产出落在哪（创建了什么 skill、写了什么文件、做到哪一步）

## Key facts（Hermes 记忆与会话机制）
- Hermes 记忆是 **proactive（agent 自主保存）**：对话中 agent 判断高信号事实后自动调 memory 工具保存，不需要用户说「保存」——区别于 OpenClaw 的 gts-save-flow（命令驱动：「兄弟说保存才走全流程」）
- 记忆文件：`$HERMES_HOME/memories/MEMORY.md`（条目用 `§` 分隔）+ `USER.md`。记忆是**注入式**（每轮进上下文），只存高信号事实，不存任务进度/完成日志
- 会话记录自动落盘：`$HERMES_HOME/state.db`（SQLite）+ `logs/`。没有 QMD 式文件索引，也没有内置定时备份
- 记忆"自动保存"≠ 全部保存：进度类内容靠 `session_search` 找回，不在 MEMORY.md

## Workflow（回答"会话 X 在干什么" — 快，不要探索过度）
1. **第一动作必跑现成脚本**（不要手写 SQL）：`node <skill_dir>/scripts/session-activity.cjs "<state.db路径>" <sessionId>` —— 自动剥 workspace 前缀、跳过系统注入消息、按 timestamp 排序输出 user 时间线；加 `--tools` 附加 tool 调用列表。脚本基于 `node:sqlite` 内置模块、零依赖、Windows 即开即用（无 sqlite3 CLI / 无 Python）。脚本路径不存在/报错时再 fallback 到下面的日志 grep。
2. **日志定位（脚本不够用时）**：`search_files(pattern=<sessionId>, path=$HERMES_HOME/logs, context=3)`，同时搜 `agent.log` 和 `errors.log`
   - 日志每行带 `[sessionId]` 前缀，按时间线还原：首条消息、每次 API call（in/out tokens、cache 比例）、每个 tool 调用与耗时、Turn ended
   - **长消息会被截断**：conversation turn 行的 `msg='...'` 对 workspace 注入的用户消息只显示到 `...`，日志里拿不到原文
   - `errors.log` 的 WARNING 行 = 踩坑记录（工具被拒/超时/限流/路径问题），是"它遇到了什么"的最好证据
2. **记忆核验**：读 `$HERMES_HOME/memories/MEMORY.md` — 条目内容就是该会话认为值得跨会话保留的事实（环境、偏好、流水线、迁移状态等）
3. **产物定位**：`search_files(pattern=*, path=$HERMES_HOME/skills)` 看技能目录新增（如 deepseek-harness、openclaw-migration 存在 = 迁移会话创建的）；再查项目 `笔记/`（changes/方案/）看落盘文档
4. **可选**：`state.db`（SQLite）或 desktop-ui.sqlite 拿会话元数据
5. **多会话时间线（「今天上午跑了哪些任务」类问题）**：`sessions` 表按 `started_at DESC` 排序即一天的任务清单（id/started_at/ended_at/model/api_call_count/estimated_cost_usd/title），一条 SQL 全出；再对重点会话跑 session-activity.cjs 看细节。比逐会话 grep 日志快一个量级
6. **等另一会话结束再继续（「等 XX 结束后再干 Y」）**：`node <skill_dir>/scripts/wait-session-end.cjs <state.db> <sessionId> [maxMinutes=120]` 轮询 ended_at，结束即 exit 0；配合 `terminal(background=true, notify_on_complete=true)` 挂后台，结束自动收到通知，期间不占用聊天轮次
7. **多会话等待 + 自动关机（「等下面会话完成后再关机」，2026-08-19 实测）**：`node <skill_dir>/scripts/wait-sessions-then-shutdown.mjs <sid1> <sid2> ... [--grace 60] [--max-h 12]` —— 轮询多个 Hermes 会话的 `ended_at`，全非空后执行 `shutdown /s /f /t <grace>` 强制关机。`--grace` 留取消窗口（反悔跑 `shutdown /a`），`--max-h` 防会话卡死永久挂机（超时也关机）。用 `terminal(background=true, notify_on_complete=true)` 挂后台。与 wait-session-end.cjs 的区别：支持多个会话 + 结束后自动关机。

## 🔴 会话 ID 格式判库（2026-08-19 实测踩坑）

兄弟给一个 session ID 时，**先看格式再选库**，格式判错 = 第一轮查询必然空手而归：

| ID 格式 | 所属库 | 例 |
|---------|--------|-----|
| `YYYYMMDD_HHMMSS_<hash>`（`20260819_154411_174164`） | **Hermes** `state.db` 的 `sessions` 表 | 本会话兄弟给的 `20260819_154411_174164` / `20260819_153038_5c342c` |
| `ses_<hash>`（`ses_fe6138993ffe...`） | **OpenCode** `opencode.db` 的 `session` 表 | dispatch 拿到的 sessionId |

**本次实锤**：兄弟给两个 `20260819_*` 格式 ID，我第一反应查 opencode.db → 空结果，才意识到是 Hermes 会话，改查 state.db。OpenCode 的查询工具（`opencode db`/wait 脚本）对 Hermes ID 全部无效；Hermes 的 sessions 表也没有 `time_created`/`time_updated` 列（那是 OpenCode 的），活跃判定靠 `ended_at` 是否为空（见下方 🔴 ended_at 恒 NULL 的归档坑——但**等待结束**场景下 ended_at 非空就是可靠结束信号，两者不冲突：ended_at NULL 也可能结束（归档前），但非空 = 一定已结束，等待时用它没问题）。

## OpenCode 会话取证（提取 OpenCode 侧 session 报告）

OpenCode 的 session 产出（审核报告/实现总结）不在 Hermes state.db，在 OpenCode 自己的库：
- 提取脚本：`D:\Github\GTS-Play\scripts\extract-session-text.mjs <sessionId>`（取长 text part）和 `extract-opencode-report.cjs`
- 🔴 **脚本默认 DB 路径是 one 机**（`C:/Users/one/.local/share/opencode/opencode.db`），本机（Administrator）必须先设环境变量，否则报 `unable to open database file`（2026-08-17 实锤）：
  ```powershell
  $env:OPENCODE_DB = "C:\Users\Administrator\.local\share\opencode\opencode.db"
  ```
- 活跃 session 查询：`opencode db "SELECT id, title, time_updated FROM session WHERE title='<title>' ORDER BY time_created DESC LIMIT 1" --format json`（opencode CLI 已在 PATH）
- 结果提取上限：脚本只取最后 3 个长 text part（每 part 截 6000 字符），足够还原报告主体

## Token 消耗审计(「总结今天的token消耗」→ 直接跑脚本)
- **数据在 state.db,不在 agent.log**:agent.log 只有调用事件,没有 token 数。`sessions` 表每行 = 一个会话的完整计费汇总(input/output/cache_read/cache_write/reasoning_tokens、estimated_cost_usd、api_call_count、started_at/ended_at),`session_model_usage` 表按 会话×模型 细分(含 billing_base_url)
- 一键出数:`node <skill_dir>/scripts/token-audit.cjs [state.db路径] [YYYY-MM-DD]` — Windows 无 sqlite3 CLI、无 Python,靠 Node v24 内置 node:sqlite 零依赖查库(2026-08-17 实测)
- 解读要点:
  - cacheRead 常占 90%+ token:长会话每次 API call 重读全历史 → 单会话 context 膨胀是成本主因。**avg cacheRead/call >200K 就该建议压缩/翻篇**,这是最有价值的优化信号
  - `estimated_cost_usd` 是估算(cost_source=official_docs_snapshot),汇报时注明非实际账单
  - 基线对比:OpenClaw 轮询时代 $4.76/天 vs Hermes 实际干活 $0.26/天(参考 openclaw-to-hermes-migration 的 openclaw-pipeline-token-economics.md)
- 优化抓手(2026-08-17 实测):
  - 调低压缩阈值:`hermes config set compression.threshold 0.40`(默认 0.50;config 启动时读取,**需重启桌面应用生效**)
  - 长会话 ~100 calls 就建议 `/new` 翻篇;审计完顺手归档可让列表清爽

## Pitfalls
- **🔴 request_dump JSON 必须从最新读起**（2026-08-19 实锤）：`$HERMES_HOME/sessions/request_dump_<sessionId>_<timestamp>.json` 文件名含时间戳，`search_files` 默认按修改时间排序（最旧在前）。**只读最新的那一个文件**（从末尾 offset 读最后几条 assistant+user 消息），否则只会看到会话最早期的请求，漏掉后续全部进展。兄弟质问「你读的是最早的记忆啊，没有获得它的全部记忆吗？」就是踩了这个坑
- **不要声称"记得"别的会话** — 跨会话记忆只含高信号事实，日志是唯一权威的活动来源。先查日志再回答，并说明信息来源（"查了 agent.log"）
- 这类问题期待**快速定向回答**：1 次日志 grep + 1 次记忆文件读取就够，不要展开成全面探索（兄弟会不耐烦，2026-08-17 实锤）
- session ID 在 hermes-home 找不到时，检查是否属于其他 profile（`$HERMES_HOME/profiles/<name>/`）
- 日志匹配可能上千行：用 limit/offset 分页，优先看最早的记录（会话起点）和 errors.log（坑），不要全量 dump
- 还原时区分「CLI 现象」与「真实状态」：日志里 tool error 可能是编码伪像或窗口问题，判断要结合后续成功记录
- 查 token 消耗/费用别去 grep agent.log(日志里没有 token 数据)——直接跑 scripts/token-audit.cjs 查 state.db
- PowerShell 里 `node -e "..."` 带嵌套单引号必挂(Invoke-Expression: Missing argument in parameter list)——查询写成临时 .cjs 文件再 `node "文件路径"` 执行;路径含空格必须加引号(不加引号报 MODULE_NOT_FOUND 'E:\Hermes' 这种截断路径错误)
- 🔴 **`Hermes state.db sessions.ended_at` 字段恒为 NULL**（2026-08-18 schema 实测）——不管是昨天已结束的 389 calls 会话还是 1 分钟前刚起的会话，`ended_at IS NULL` 永远成立；`hermes sessions archive` 的 `--dry-run` 各种过滤器按 ended_at 判活跃 → 永远空命中。**唯一可靠归档路径**：用 `node + node:sqlite` 直连 `state.db`，判定公式 `archived=0 AND message_count>0 AND started_at < (now-4h)`（窗口可调），然后 `UPDATE sessions SET archived=1 WHERE id IN (...)`；可逆（archived=0 恢复）。完整 schema + 现成脚本见 `references/state-db-schema-and-archive.md`。
- **`token-audit.cjs` 按日期过滤会话不会误算"已死"会话**：audit SQL 是 `WHERE started_at >= <date>` 范围查，ended_at=NULL 但 4h 前的老会话只会在它当天 audit 出现一次，下一天就被过滤掉——不必担心叠加。但想让 stats 列表清爽，先归档老会话再 audit。
- PowerShell 调 hermes exe:`& $h` 调用符被误判不稳定(同一条命令有时成功有时拒)——可靠姿势 `cmd /c "`"<exe全路径>`" args"`
- **Node 脚本顶层 await 只支持 .mjs**：.cjs 文件里 `await` 直接 SyntaxError（"await is only valid in async functions"）——等待/轮询类脚本直接用现成的 `scripts/wait-session-end.cjs`（内部 IIFE 包裹，规避此坑）；真要临时写，用 `(async () => {...})()` 包裹或存 .mjs。注：`scripts/session-activity.cjs` 是只读 + 同步 prepared statement 查询，没有顶层 await，无此限制。
- 🔴 **不要重造轮子手写 state.db 查询脚本**（2026-08-18 实锤）：兄弟问「读取会话 X 的记忆」时第一反应必须是 `node <skill_dir>/scripts/session-activity.cjs "<state.db路径>" <sessionId>`，**先 skill_view 再动手**。本会话当时没看现成脚本，手写了两版都翻车：① 第一次按列名 `created_at` 查 messages 表 → `no such column: created_at`（实际字段是 `timestamp`，单位秒不是毫秒）；② 又写一版先按 `mmddata.params` 路径读 xiahui.json → FAIL（实际是 `steps.mmddata.params`）。现成脚本早就处理：自动剥 workspace 前缀、跳过系统注入消息、按 timestamp 排序输出 user 时间线；用 `--tools` 附加 tool 调用列表。只在兄弟要查 sessions 列表/聚合统计/token 消耗时才手写 SQL。
- **还原 OpenClaw 时代任务（迁移前「早上干了啥」）**：先读 `~/.openclaw/workspace/memory/YYYY-MM-DD.md` 每日日志 —— 结构化任务摘要（时间段+任务名+结论+commit），一眼还原一天；qmd sessions/（`~/.openclaw/agents/main/qmd/sessions/`）是原始逐行对话，只作细节补充。数据位置详见 openclaw-migration skill
- **续做 OpenClaw 遗留 issue（迁移后继续 gts-* 工作流）**：遗留 issue 的 `oc_` 前缀 sessionId 可直接喂 skill-exec-manager.cjs（step-done/check 兼容，无需重新 init）；完整恢复流程 + 全量 BDD 复验坑（jest.config.js、pre-existing 判定）见 `references/openclaw-legacy-issue-resume.md`
- **skill-exec-manager.cjs 按 cwd 找 state 文件**：必须在 repo 根目录 `D:\Github\GTS-Play` 下执行；在 `packages/<pkg>` 子目录跑 `check` 会报 ENOENT「无法读取 state 文件」+ crossCheck consistent=false（2026-08-17 实测：cd packages/frontend 后 check 报错）
