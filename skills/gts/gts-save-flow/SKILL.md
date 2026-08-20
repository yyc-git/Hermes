---
name: "gts-save-flow"
description: "Full save flow: audit→BDD→compile→specs→notes→memory→git push. Added daily log append-only rule."
---

# gts-save-flow

> 触发：兄弟说「保存」
> 8 步串行：改动总结(确认)→审核→BDD→编译检查→规格同步→笔记→记忆→GitHub同步
> BDD/编译 调度 OpenCode Flash 执行，git 由 bot 执行

---

## 🔴 状态追踪（全局）

> 本 skill 使用 **skill-exec-issue-tracker**（Phase 0-8）框架管理状态，支持多会话隔离、Issue 追踪和 dispatch 互斥。
> 不再使用旧版单文件 `.skill-exec-state.json`。
> 本机制遵循 `笔记/项目文档/changes/2026-07-28-skill-exec-issue-tracker/solution.md` 的实现规格。

### 文件定义

| 文件 | 用途 | 是否纳入 git |
|------|------|:----------:|
| `.skill-exec-state.<sessionId>.json` | per-session 状态文件（v2 schema） | ❌ .gitignore |
| `.skill-exec-sessions.json` | 会话注册表（永不删除） | ❌ .gitignore |
| `.skill-exec-dispatch.lock` | dispatch 互斥锁（30min TTL + heartbeat） | ❌ .gitignore |
| `笔记/项目文档/issue/<date>-<skill>-<hash>.md` | Issue 追踪文件（YAML front matter + Markdown body） | ✅ |
| `scripts/skill-exec-manager.cjs` | CLI 入口（统一调用 state/issue/registry/dispatch-lock） | ✅ |

### 步骤序列

本 skill 的执行状态追踪使用以下 **3 步序列**，对应工作流中的关键断点/恢复点：

| 索引 | 步骤 |
|------|------|
| 0 | 改动总结（等兄弟确认） |
| 1 | 审核 + BDD + 编译 |
| 2 | 规格同步 + 笔记 + 记忆 + GitHub 同步 |

### INIT（skill 触发时第一时间执行）

```powershell
# 1. 获取/生成 session ID 和 workflow ID
$sid = node scripts/skill-exec-manager.cjs get-session-id | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
$wid = node scripts/skill-exec-manager.cjs get-workflow-id $sid | ConvertFrom-Json | Select-Object -ExpandProperty workflowId

# 2. 同任务预检（dispatch 前查 OpenCode DB 确认无「相同任务」活跃 session；不同任务直接并行，全局 dispatch 锁已废弃 2026-08-01）
# 3. stateInit + issueCreate + registryRegister
node scripts/skill-exec-manager.cjs init $sid $wid "gts-save-flow" `
  --steps 0,1,2 `
  --summary "<保存摘要>" `
  --criteria "<全部通过>" `
  --specs "<关联 specs 路径，逗号分隔，可省略>"
```

### 生命周期操作

所有操作统一通过 `scripts/skill-exec-manager.cjs` CLI 入口执行。

| 操作 | 时机 | CLI 命令 | 说明 |
|------|------|---------|------|
| **INIT** | （见上方 INIT） | 同上 | 创建 state + issue + registry 注册 |
| **STEP_DONE** | 每完成一个子步骤后 | `node scripts/skill-exec-manager.cjs step-done <sessionId> --step-index <索引> --step-name "<步骤名>" [--files "<改动的文件>"]` | 更新 state + issue 进度 |
| **CHECK** | 每次收到用户消息后 | `node scripts/skill-exec-manager.cjs check <sessionId>` | 读取 state + 交叉校验 state/issue 版本 |
| **CLEANUP** | 所有步骤完成后 | `node scripts/skill-exec-manager.cjs cleanup <sessionId> --result completed` | issue 关闭 + registry 注销 + state 删除 |
| **ABORT** | 放弃工作流 | `node scripts/skill-exec-manager.cjs abort <sessionId> [--reason "<原因>"]` | issue 标记 aborted + registry 注销 + state 删除 + 释放 dispatch lock |

### 初始化格式（由 CLI 自动生成）

```json
{
  "schemaVersion": "2",
  "skillName": "gts-save-flow",
  "sessionId": "<自动获取或生成>",
  "workflowId": "wf_<timestamp>_<random8>",
  "totalSteps": 3,
  "stepSequence": ["0", "1", "2"],
  "completedSteps": [],
  "remainingSteps": [
    {"index": "0", "name": "改动总结（等兄弟确认）"},
    {"index": "1", "name": "审核 + BDD + 编译"},
    {"index": "2", "name": "规格同步 + 笔记 + 记忆 + GitHub 同步"}
  ],
  "completedCount": 0,
  "context": {
    "featureSummary": "<本次保存摘要>",
    "verificationCriteria": "<全部通过>"
  },
  "issuePath": "笔记/项目文档/issue/<date>-<skill>-<hash>.md",
  "issueSyncStatus": "synced",
  "startedAt": "<ISO 时间>",
  "lastUpdatedAt": "<ISO 时间>",
  "_version": 1
}
```

同时自动创建 Issue 文件：`笔记/项目文档/issue/<YYYY-MM-DD>-<skillName>-<hash8>.md`（YAML front matter + Markdown body 进度日志）。

### 恢复交互模板

```
🤖 检测到未完成的工作流：gts-save-flow

   已完成（{n}/{total}）:
     ✅ 0: 改动总结（等兄弟确认）

   剩余步骤（{m}/{total}）:
     📋 1: 审核 + BDD + 编译
     📋 2: 规格同步 + 笔记 + 记忆 + GitHub 同步

   最后更新：{相对时间}

   🔜 即将执行下一步 Step 1
   （如需跳过、调整或放弃，请现在告知）
```

#### 长时间中断恢复模板

```
🤖 检测到 {duration} 前中断的工作流：gts-save-flow

   上下文：
     featureSummary: <之前记录的内容>
     verificationCriteria: <之前记录的内容>

   已完成（{n}/{total}）:
     ✅ 0: 改动总结（等兄弟确认）

   剩余步骤（{m}/{total}）:
     📋 1: 审核 + BDD + 编译
     📋 2: 规格同步 + 笔记 + 记忆 + GitHub 同步

   🔜 即将执行下一步 Step 1
```

### 故障处理

| 场景 | 处理方式 |
|------|----------|
| `check` 返回 `exists: false` | 正常 → 无未完成 workflow，继续执行 |
| JSON 解析失败 | 展示原始内容给兄弟，手动决定 |
| remainingSteps 为空但文件未清理 | 自动 CLEANUP |
| CLI 执行失败 | 重试 3 次，仍失败则告知兄弟 |

### 手动命令

| 兄弟说的 | 行为 |
|----------|------|
| "查看当前进度" | `node scripts/skill-exec-manager.cjs check <sessionId>` 展示完整状态 |
| "跳过这个步骤" | `node scripts/skill-exec-manager.cjs step-done <sessionId> --step-index <索引> --step-name "<步骤名>"` |
| "重新执行上一步" | 回退最近一个 completedStep（修改 state + issue） |
| "放弃这个工作流" | `node scripts/skill-exec-manager.cjs abort <sessionId> [--reason "<原因>"]` |

---

## 流程

### Step 0：改动总结

1. 读 `.last-save` SHA → `git log --oneline <sha>..HEAD` + `git diff --stat` → 改动摘要
2. 问题预警（服务端/ node_modules 改动）
3. 输出摘要，⏸️ 等兄弟确认「继续」

### Step 1：快速审核

`git status` 过改动合理性，有问题通知兄弟。

### Step 2：BDD 测试（OpenCode Flash）

按改动范围执行对应 jest：
- `packages/frontend/` → `npx jest --config jest.multiplayer.json --silent`
- `packages/room-service/` 或 `packages/match-service/` → `npx jest --config jest.json --silent`
- `test/integration/` → `npx jest --config test/integration/jest.config.js --no-cache --forceExit`

修到全绿。新/改测试时对照 `test-standards.md` 检查分层合规性。

#### 🔴 Post-poll 绑定：BDD 测试 OpenCode poll 完成后自动 step-done

```powershell
$sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
node scripts/skill-exec-manager.cjs step-done $sid --step-index 2 --step-name "BDD 测试"
```

### Step 2.5：编译检查（OpenCode Flash）

`npx tsc --noEmit`，零错误继续。jest/ts-jest 不做类型检查。

#### 🔴 Post-poll 绑定：编译检查 OpenCode poll 完成后自动 step-done

```powershell
$sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
node scripts/skill-exec-manager.cjs step-done $sid --step-index 2 --step-name "编译检查"
```

### Step 3：规格同步

改动涉及业务逻辑时：
- 对比 `笔记/项目文档/changes/` 中 specs 与实现
- 新增场景 → 补 specs；不符 → 更新 specs
- 同步 `.steps.ts`；需新状态 → 查 `StateType.ts`
- 更新后重跑 BDD

纯文档/配置改动跳过。

### Step 4：更新笔记

按内容归入 `笔记/`：决策→`决策记录/`，重构→`方案/`+`代码笔记/`，调试→`讨论记录/`

### Step 5：更新持久记忆

- `workspace/memory/YYYY-MM-DD.md` — **🔴 禁止 `write` 覆盖，只能用 `edit` 在末尾追加**
- `MEMORY.md`（规则/教训）

### Step 6：GitHub 同步（三段提交）

⚠️ push 可能需翻墙，失败通知兄弟手动推。

**🔴 强制：先调用 `gts-submit-exclusive` → 处理 doc/ + 笔记/语雀知识库/ 的 skip-worktree 文件 → 再继续后续提交**

> **无论 `doc/` 或 `笔记/语雀知识库/` 有没有改动，都必须走 `gts-submit-exclusive`**
> 因为 skip-worktree 隔离的文件不会被 `git status` 展示，误判「无改动」会漏提交

#### 🔴 Post-Step 绑定：GitHub 同步完成后自动 step-done

```powershell
$sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
node scripts/skill-exec-manager.cjs step-done $sid --step-index 6 --step-name "GitHub同步"
```

#### Part 0：GTS-Play commit + push

```
cd D:\Github\GTS-Play
git status --short
清理临时文件（.opencode-brief-*.md, .compiler.log, compiler-info.json, test-results/, dist/产物, lib/bs/编译日志）
git add <改动文件> <specs> <测试> <相关笔记>  # 🔴 禁止 git add -A
git diff --cached --name-only 校验暂存区
git commit -m "feat|fix|refactor: <摘要>"
git push origin dev
```

#### Part 1：写入 .last-save + .openclaw commit

```
cd C:\Users\Administrator\.openclaw
$SHA = git rev-parse HEAD
Set-Content workspace/笔记/决策记录/.last-save $SHA -NoNewline  # 先写再 add
git status --short
git add workspace/笔记/决策记录/.last-save <其他改动文件>
git diff --cached --name-only 校验
git commit -m "save: <日期> <摘要>"
```

#### Part 2：push .openclaw

```
git push origin main
```

#### Part 3：Step 6 step-done（确保 GitHub 同步步骤计入进度）

```powershell
$sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
node scripts/skill-exec-manager.cjs step-done $sid --step-index 6 --step-name "GitHub同步"
```

---

## 提交纪律

1. 串行，不跳步
2. 测试不过必须修
3. GTS-Play commit+push → `.last-save` → `.openclaw` push，顺序不可乱
4. 先写 `.last-save` 再 `git add`
5. 🔴 禁止 `git add -A`，提交前校验暂存区
6. 相关文件：变更 specs + 主 specs 模块 + 测试 + 源码 + 相关笔记
7. doc/ & 笔记/语雀知识库/ 走 `gts-submit-exclusive` skill，不走内联 git
8. 🔴 提交前清理临时文件（`.opencode-brief-*.md`, `.compiler.log`, `test-results/`, `dist/`, `lib/bs/`），排除 doc/ 和笔记/语雀知识库/
