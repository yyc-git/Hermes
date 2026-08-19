---
name: "gts-opencode-dispatch-hardening"
description: "OpenCode 派工防御加固:permission auto-reject 防卡死、Pro 主动轮询、外部路径 brief 硬性声明、session 状态主动核对 — 实战血泪沉淀"
---

# gts-opencode-dispatch-hardening — OpenCode 派工防御加固

> 触发场景:任何派工前 / 派工中监控 / 派工后核对(本 skill 是其他派工 skill 的加固层,**引用而非替代**)
> 核心:`opencode-schedule` 提供了协议层(模型选择/dispatch 命令/wait 脚本),本 skill 沉淀实战防御层(perm-deny / 主动轮询 / 跨仓边界 / 状态核对)

## 🔴 6 条防御铁律(2026-08-19 兄弟定稿血泪)

### 铁律 1:session 状态必须主动核对(不要等兄弟指出)

**触发条件**:每次收到 wait 完成通知时 + 兄弟问"怎么样了"时
**症状**:wait 通知 + 兄弟抓"这个早就跑完了吧?你怎么没检查"
**正确做法**:
1. 用 sqlite3 查 `session.part` 表最后一条 `step-finish reason=stop` 是否存在
2. 用 `git log -3` 看目标仓是否多了新 commit
3. 状态表格立刻同步 ✅ done + commit hash

**反模式**:靠"上一条通知说还在跑"推断当前状态 — wait 通知可能延迟、误报、agent 静默

### 铁律 2:permission auto-reject 是硬卡死信号

**触发条件**:part 表最近 5 条事件出现 `bash/read status=error error=The user rejected permission to use this specific tool call` 重复 2+ 次
**症状**:agent 拿到 perm-deny 后没回退 → 持续空转(session time_updated 不变,但 session 没退出)
**实测**:2026-08-19 code-review session 卡 53 分钟空转,直到 bot 手动发"继续"消息才复活

**预防(brief 必写)**:
- 跨仓/跨 workdir 派工 brief 必须**显式列禁**外部路径
- brief 末尾写:`如果权限被拒,改用 brief 摘要 + 已读 commit 信息继续,不要重试被拒操作`
- 已读 commit 后写:`已读 commit 信息足够了,不要为补 commit detail 再读 git`

**处理**:触发硬卡死 → 立刻 `gts-opencode-stop` 杀掉 → 重新派(用 brief 摘要补全方式)

**反模式**:用 HTTP API `/session/{id}/message` 给卡死 session 发消息 → curl 超时,server 端不响应(本轮实测)

### 铁律 3:Pro non-max 派工后 20 分钟主动轮询一次

**触发条件**:派 Pro 模型(non-max)后
**依据**:Pro max 静默 80 分钟正常,但 Pro non-max 静默 20+ 分钟 = 卡死信号

**轮询命令**(每 20 分钟):
```powershell
$tu = & "C:\sqlite\sqlite3.exe" "C:\Users\Administrator\.local\share\opencode\opencode.db" "SELECT time_updated FROM session WHERE id='<sid>';" | ForEach-Object { ($_ -split '\|')[1] }
$ageMin = [Math]::Floor(([DateTimeOffset]::Now.ToUnixTimeMilliseconds() - $tu) / 60000)
# > 20 分钟 → 查 part 表最近事件判断
```

**判断**:
- 推进(step-finish / tool completed / text / reasoning)→ 继续等
- 卡 perm-deny → 立刻停 + 重派
- 卡空(无新事件)→ 30 分钟还不动 → 停 + 派 Pro 根因分析

### 铁律 4:派工 brief 模板硬性增加"外部路径访问声明"段

**模板**(放在 brief 开头,缺这段 = 违规):
```markdown
## 🔴 外部路径访问声明(必填)
- ✅ 允许读:`<项目 workdir>` 及其子目录
- ❌ 禁止读:跨仓/跨 workdir 路径(具体列出)
- ❌ 禁止读:文档/笔记/外部数据(具体列出)
- 任何被拒操作:用 brief 摘要 + 已读 commit 信息继续,**不要重试被拒操作**
```

**为什么**:brief 没这段 = agent 有可能去碰不该碰的路径 → perm-deny → 卡死

### 铁律 5:wait 脚本参数单位是毫秒不是秒

**触发条件**:任何 `wait-opencode-session.mjs` 调用
**症状**:传 `7200 600` (秒)→ maxWaitMs=7200ms < POLL_INTERVAL 30s → 第一次 poll 立即 TIMEOUT 退出
**正确示例**:`7200000 600000` (2h / 10min) — 单位是毫秒
**反模式**:`7200 600` 或 `3600 300` — 都错

**已踩坑 5+ 次**,每次浪费 30 分钟。

### 铁律 6:一个 OpenCode session 只做一件事,拆并行 session

**触发条件**:多个独立修复点 / 独立模块 / 独立子任务
**核心**:多任务**并行**派多个 session(不是串行派一个 session 干多件事)
**反模式**:
- 一个 session 里既改算法又改 snapshot → agent 上下文切换导致质量下降
- 一个 session 跑完再派下一个 → 串行浪费时间

**workdir 共享注意**:两个并行 session 若 `--dir` 相同,文件系统层互相可见。文件级不冲突即可并行。

### 铁律 7:派单命令禁用 `--command` flag(2026-08-20 verify-skill-load 实锤)

**触发条件**:任何 `opencode run` dispatch
**症状**:session 进了 DB 但 `model` 字段为空(老 skill) + event 表最后一条是 `event`(握手),不是 `command` 注入 → server log 报 `SessionPrompt.command BUN 内部 UnknownError: UnknownError`(chunk-46zs0me7.js:1094:15735,无真因)
**根因不明**:可能 `--no-replay` + 中文 message + `--auto` 三者组合触发 BUN 边界
**踩坑实例**:2026-08-20 verify-skill-load 任务,尝试 `opencode run --command "..." --file <brief> --attach ... --no-replay --auto --dir ...` → session 建了 + model 字段空 + command 注入崩
**正确写法**:消息直接传 positional,不用 `--command`:
```powershell
opencode run "请按 brief 执行:打开 .opencode-brief.md 阅读后按 TDD 流程实现 <任务摘要>" `
  -m <model> `
  --attach http://localhost:4098 `
  --title "<任务名>" `
  --no-replay `
  --auto `
  --dir D:\Github\GTS-Play `
  --file .opencode-brief.md
```
**验证三件套**(dispatch 后立即查,缺一不可):
1. `session.time_created` 与 dispatch 时间戳吻合
2. `event` 表最后一条事件是正常 `message.*.1`,不是直接崩在 `command` 阶段
3. `session.model` 字段非空(老 skill 落盘在 session_meta 文件里,真 OK)

**判定**:拿到 sessionId 但 `model` 为空 → 🔴 BUN command 崩,按 `gts-opencode-stop` 走 delete + 三重验证 + 改正确路径重派

### 铁律 8:hermes-home 那一层 skill 默认不进 GTS-Play 项目级 surge prompt(2026-08-20 实锤)

**触发条件**:在 `hermes-home/skills/` 改了业务 skill(如 `gts-memory-search-v3`、`gts-auto`、`gts-bot-rca-discipline`)后,以为重启 4098 就生效
**症状**:重启 4098 → 跑了 1 个最小任务 → agent 列自己看到的 skill → **没看到 hermes-home 那一层的 skill**
**根因**:GTS-Play 项目级 `.opencode/opencode.json` 的 `agent.build.permission.skill` 是白名单(allow 列表),**只允许**这 7 个本地 skill:
- `gts-e2e-test`
- `gts-e2e-auto`
- `gts-e2e-perf`
- `gts-save-flow`
- `gts-submit-save`
- `gts-save-memory`
- `gts-recall`

**hermes-home 那一层**(`E:\Hermes Agent CN Desktop\data\hermes-home\skills/`)的 skill **默认不在** GTS-Play dispatch 的 surge prompt 里 → 改这些 skill + 重启 = 兄弟以为已生效,**实际未生效**
**验证方法**:dispatch 一个最小任务让 agent 列自己能看到哪些 skill:
```powershell
opencode run "请列出你在当前 surge prompt 里能看到的全部 skill 名称(从系统 prompt / tools 部分)," `
  -m opencode/deepseek-v4-flash-free --attach http://localhost:4098 `
  --title "verify-skill-load" --no-replay --auto --dir D:\Github\GTS-Play
```
**根治路径**(待兄弟拍板,优先级从高到低):
1. 把高频 hermes-home skill 加到 `D:\Github\GTS-Play\.opencode\opencode.json` 的 `agent.build.permission.skill` 白名单
2. 改 `~/.config/opencode/opencode.json` 全局配置 `permission.skill."*": "allow"`(注意 allow 与 load 是两个独立维度)
3. 写一份 skill 副本到 `D:\Github\GTS-Play\.opencode\skills/<name>/SKILL.md`(项目级目录,会被默认加载)
4. 临时:在 brief 里**手动把 skill 关键段落贴进去**(成本最低,但每次派工都要贴)

**反模式**:改 hermes-home skill → 重启 4098 → 以为生效 → 完成"修复" → 兄弟 3 天后再次质问"为什么没生效" → 浪费时间

## 📋 派工 checklist(整合 8 条铁律)

派工前 30 秒必须过一遍:

| # | 检查项 | 必做 |
|---|--------|------|
| 1 | brief 开头有"外部路径访问声明"段? | ✅ |
| 2 | brief 末尾有"权限被拒处理"指引? | ✅ |
| 3 | 跨仓/跨 workdir 路径都列禁了? | ✅ |
| 4 | wait 脚本参数单位是毫秒? | ✅ |
| 5 | Pro non-max 派工后准备 20 分钟主动轮询? | ✅ |
| 6 | 多任务已拆并行 session? | ✅ |
| 7 | 状态表格列出所有 session 真实状态(not 上一条通知)? | ✅ |
| 8 | dispatch 命令**没**用 `--command` flag?消息走 positional? | ✅ |
| 9 | 改 hermes-home skill 后验证过 surge prompt 实际包含? | ✅ |

## 🚫 反模式总结(本会话反复踩过的坑)

| 反模式 | 后果 | 修复 |
|--------|------|------|
| 派工后不主动核对状态 | 兄弟抓"早跑完了你没检查" | 铁律 1 |
| wait 传秒值 | 30 秒立即 TIMEOUT | 铁律 5 |
| brief 没列禁外部路径 | agent perm-deny 卡死 | 铁律 2 + 4 |
| 串行派多任务 | 时间浪费 | 铁律 6 |
| 派 Pro non-max 后等 wait | 静默 80 分钟没提醒 | 铁律 3 |
| 卡死 session 试 curl 发消息 | curl 超时不响应 | 铁律 2 处理流程 |
| 用 `--command` flag 派单 | BUN session.command UnknownError | 铁律 7 |
| 改 hermes-home skill 重启就以为生效 | skill 没加载,白改 | 铁律 8 |

## 📊 实战案例(2026-08-19)

### 案例 1:r4 早已 done 但 bot 不知道
- 时间:11:09 北京派 r4,agent 12 分钟后 commit `0b50ce0` 并 idle
- bot 没主动查 DB → 状态表一直标"🔄 跑中"
- 兄弟 1 小时后抓:"这个早就跑完了吧?你怎么没检查"
- **根因**:依赖 wait 通知,wait 跑了 7200s 都没退出但 session 已 done
- **修复**:铁律 1 — 收到通知或兄弟问时,主动查 DB + git log

### 案例 2:code-review Pro session 卡 53 分钟
- 时间:11:17 北京派 Pro 审核,agent 读 PMXReduceFace 仓 + GTS-Play 笔记被 perm-deny
- agent 没回退 → 持续空转
- 兄弟 53 分钟后问"怎么样了"
- bot 查 DB 发现 agent 在 perm-deny 后只空转没动作
- **根因**:brief 没显式列禁跨仓路径 + agent 拿 perm-deny 没回退策略
- **修复**:铁律 2 + 4 — brief 显式列禁 + 处理流程

### 案例 3:r9 writeback 误匹配路径
- agent 用 `Tda*_opt` glob → PowerShell `-like` 不区分大小写 → 误匹配 `TDA式宴 夏卉_opt/` (XiaHui)
- 把 XiaHui 的 picked 数据写到了 Xiaye1 条目
- agent 自报并自纠(用 `Tda*HMS*_opt` 重做)
- **根因**:PowerShell `-like` 大小写不敏感
- **修复**:glob 必须包含唯一关键字(如 `HMS`),或用 `-clike` 显式大小写敏感

## 🔗 关联 skill

- `gts:opencode-schedule` — 派工协议层(命令/wait/模型)
- `gts:gts-opencode-stop` — 杀 session 流程
- `gts:opencode-session-ops` — session ops 实战
- `gts:opencode-llm-failure-recovery` — LLM 静默失败处理
