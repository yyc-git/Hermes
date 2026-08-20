# Hermes Read vs OpenCode Dispatch — 任务派单判定矩阵

> 本文件是 `opencode-dispatch-pitfalls` 教训 7 的扩展 reference
> 触发:任何"要不要派 OpenCode"决策前

## 兄弟原话(2026-08-20 拍桌)

> 「你不需要读取 opencode 的记忆,只需要读取你的会话记忆以及 daily log、笔记、MEMORY.md 等相关记忆和资料」

## 核心原则

**hermes 自身工具(`read_file` / `search_files` / `terminal` 跑 git/sqlite/findstr 等)能直接读的资料,100% 走 hermes,绝不派 OpenCode**。

**派 OpenCode 的任务是"实际执行 + 产出新内容"**(跑测试、改代码、出方案、审 PR、抓 bug),不是"读资料 dump 出来"。

## 判定矩阵

| 兄弟问 / 任务 | 走 hermes 自身工具 | 走 OpenCode 派单 |
|---|---|---|
| 「回忆昨天 X 修复」 | ✅ `git log --all --grep=<kw>` + `read_file` 笔记 + `read_file` skill | ❌ |
| 「v3 skill 在不在」 | ✅ `read_file <hermes-home>/skills/gts-memory-search-v3/SKILL.md` + grep 内容 | ❌ 验证 OpenCode 加载链是另一回事 |
| 「v3 skill 在 OpenCode surge prompt 里吗」 | ✅ `/api/skill` + `opencode.json` 读配置 | ❌(这是 OpenCode 加载链问题,跟 hermes 无关) |
| 「现在 Upgrade.tsx line 100 长啥样」 | ✅ `read_file` 读 1 行 | ❌ |
| 「昨天 commit `abc123` 改了什么」 | ✅ `git show <sha>` | ❌ |
| 「daily log 里 2026-08-19 写了什么」 | ✅ `read_file 笔记/.../daily/2026-08-19.md` | ❌ |
| 「现在 workspace 哪些文件 untracked」 | ✅ `git status` (terminal) | ❌ |
| 「MEMORY.md 第 50 行写啥」 | ✅ `read_file` + offset/limit | ❌ |
| 「state.db 查 session 状态」 | ✅ sqlite3 terminal | ❌ |
| 「X 仓源代码里有什么 Y 模式」 | ✅ `search_files` / `grep` | ❌ |
| 「现在代码里 X 状态」 | ✅ git + read_file | ❌ |
| | | |
| 「修 X bug」 | ❌ | ✅ `gts-dev-fix` 流程 |
| 「加 X 功能」 | ❌ | ✅ `gts-dev-feat` 流程 |
| 「refactor X 代码」 | ❌ | ✅ `gts-dev-refactor` 流程 |
| 「审这个 PR 的代码」 | ❌ | ✅ `gts-code-review` 流程 |
| 「出 X 方案 + 根因分析」 | ❌ | ✅ OpenCode Pro |
| 「X 业务代码测试失败,定位」 | ❌ | ✅ OpenCode |
| 「给 X 写集成测试,跑通」 | ❌ | ✅ OpenCode Flash |
| 「派 OpenCode 读 X 仓文件」 | ❌ | ✅(但要 brief 显式 workdir) |

## 典型蹲坑场景(2026-08-20 兄弟纠正)

### 蹲坑 1:验证 v3 skill 在 surge prompt 是否出现

**错误的做法**:
- 派 OpenCode 跑任务,问 agent "你看到哪些 skill"
- 写 `hermes-verify-skill-load-<date>.mjs` 验证脚本
- 跑 5 个断言,4 个失败,浪费 30s

**正确的做法**:
- hermes 直接 `read_file` 读 v3 skill 内容
- 完全 OK,跟 OpenCode 加载链无关

### 蹲坑 2(类似陷阱):派 OpenCode 查 git log

**错误的做法**:
- 派 OpenCode 跑 `git log --grep=...`
- brief 还写"列出 commit 哈希 + 改了什么文件"

**正确的做法**:
- hermes 直接 `terminal` 跑 `git log --all --grep=<kw>`
- 0 派单,直接拿到

### 蹲坑 3(类似陷阱):派 OpenCode 读 daily log

**错误的做法**:
- 派 OpenCode 跑 `read_file 笔记/memory/.../daily/2026-08-19.md`
- 然后问"昨天发生了什么"

**正确的做法**:
- hermes 直接 `read_file` 读 daily log
- 0 派单,直接拿到

## 误派 OpenCode 的 3 种典型 signal

派单前 30 秒,看到以下 signal 就该停:

1. **"派 OpenCode 读完 X 然后告诉我"** —— 读资料任务,走 hermes
2. **"验证 X 是否存在"** —— 验证资料存在,走 read_file / findstr / sqlite3
3. **"列出 X 是什么"** —— 列资料任务,走 read_file / grep

只有"X 内容存在 + 需要 X 推导 Y 方案 / 改 X 修 bug / 写 X 测试"才派 OpenCode。

## 边界:派 OpenCode 也能"读资料"但目的不同

| 场景 | 走 hermes | 派 OpenCode |
|---|---|---|
| "v3 skill 怎么写" | ✅ 读出来看 | ❌ |
| "v3 skill 写在 dispatch brief 里,Agent 读完按 SKILL.md 风格扩展" | ❌ | ✅(brief 上下文传染) |
| "读 Upgrade.tsx 102-110 行" | ✅ 单独读 | ❌ |
| "读 Upgrade.tsx 102-110 行 + 推导为什么 Skip 关闭后 loop 没恢复 + 给修复方案" | ❌ | ✅(推导 + 方案) |

核心差别:**纯读出口走 hermes**;**读 + 推导/改/写/测 出口走 OpenCode**。

## 关联

- `opencode-dispatch-pitfalls` 教训 7(主条目)
- `gts-dispatch-preflight` §argv 终极模板(派工前 checklist)
- `gts-opencode-dispatch-hardening` 铁律 4(外部路径访问声明)
- `gts-bot-role-boundary` 边界(读 vs 写 vs 派工)
- `gts-memory-search-v3` §7/8(回忆类问题信源优先级)
