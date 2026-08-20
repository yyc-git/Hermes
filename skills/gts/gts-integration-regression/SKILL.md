---
name: "gts-integration-regression"
description: "跨模块集成测试回归：跑 test/integration/ 下的 BDD 集成测试，含决策矩阵+覆盖检查+结果通知"
---

# gts-integration-regression — 跨模块集成测试回归

> 本 skill 只负责跨模块集成测试回归（Layer 3），不负责 E2E 全链路回归。
> 集成测试定位：快速（秒级）、无浏览器、纯 Node.js，验证包间协议一致性。

---

## 🔴 核心原则

1. **只跑 `test/integration/` 目录下的 `.feature` + `.steps.ts`** — 跨模块 BDD 集成测试
2. **🔴 跑前必须问兄弟确认** — 虽然集成测试快，但不能闷头就跑
3. **🔴 一问三合一** — 判断 + 测试范围 + 执行方式合并为一个步骤
4. **🔴 与 E2E 回归场景 1:1 映射**
   - 每个 E2E 回归场景 `fix-xxx.json` 必须有对应的集成测试 `test/integration/fix-xxx/fix-xxx.feature`
   - 如果 E2E 场景没有对应的集成测试 → 按 TDD 流程创建
   - 已有不含 `fix-` 前缀的集成测试（如 `auto-ready-guard`）→ 使用已有文件
5. **🔴 TDD 优先原则** — 集成测试回归发现的失败，直接在同一 OpenCode 会话中按 RED→GREEN 修复
6. **覆盖必补** — 之前没集成测试的 bug fix，submit 前必须新增

### 测试层级对比

| 层级 | 定位 | 执行环境 | 速度 | 位置 |
|------|------|---------|------|------|
| 单元测试（Layer 2） | 验证单个函数/模块的正确性 | Node.js | 毫秒级 | 各包 `__tests__/` |
| 跨模块集成测试（Layer 3） | 验证包间协议一致性 | Node.js（无浏览器）| 秒级 | `test/integration/` |
| E2E 回归（Layer 4） | 验证全链路 + UI 交互 | Playwright 浏览器 | 分钟级 | `scenarios/regression/` |

---

## 目录和路径

| 项 | 值 |
|----|-----|
| 项目根 | `D:\Github\GTS-Play` |
| 集成测试根 | `test/integration/` |
| 测试运行命令 | `npx jest --config test/integration/jest.config.js --no-cache --forceExit` |
| 单目录运行 | `npx jest --config test/integration/jest.config.js --no-cache --forceExit --testPathPattern={dir-name}` |
| 状态文件（v2 per-session） | `.skill-exec-state.<sessionId>.json` |

---

## 🔴 状态追踪

> 本 skill 使用 **skill-exec-issue-tracker** (Phase 0-8) 框架管理状态，支持多会话隔离、Issue 追踪和 dispatch 互斥。
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

```
步骤序列（7 步）：
  0: 询问是否全自动（跳转到 gts-auto）
  1: 判断 + 测试范围 + 执行方式（三合一）
  2: 跑集成测试回归
  3: 覆盖检查 + 结果通知
  4: 创建新集成测试（可选）
  R: 技能反思（调用 gts-skill-reflect，CLEANUP 后、保存前执行）
  5: 保存 + 汇报总结（gts-submit-save，最后一步，通知前）
```

### 生命周期操作

所有操作统一通过 `scripts/skill-exec-manager.cjs` CLI 入口执行。

| 操作 | 时机 | CLI 命令 |
|------|------|---------|
| **INIT** | skill 触发时、执行任何步骤之前 | `node scripts/skill-exec-manager.cjs init <sessionId> <workflowId> gts-integration-regression --steps 0,1,2,3,4,5,R --summary "回归原因" --criteria "N/M 通过" --specs "关联specs路径"` |
| **STEP_DONE** | 每完成一个子步骤后 | `node scripts/skill-exec-manager.cjs step-done <sessionId> --step-index <索引> --step-name "<步骤名>" [--files "..."]` |
| **CHECK** | 每次收到兄弟消息后 | `node scripts/skill-exec-manager.cjs check <sessionId>` |
| **CLEANUP** | 所有步骤完成后 | `node scripts/skill-exec-manager.cjs cleanup <sessionId> --result completed` |
| **ABORT** | 放弃工作流 | `node scripts/skill-exec-manager.cjs abort <sessionId> [--reason "<原因>"]` |

> **Session ID**：`node scripts/skill-exec-manager.cjs get-session-id`
> **Workflow ID**：`node scripts/skill-exec-manager.cjs get-workflow-id [<sessionId>]`

---

## 🔴 决策矩阵

| 条件 | 判断 | 说明 |
|------|------|------|
| 涉及 `packages/network-framework/` | ⚠️ 建议跑 | 底层网络栈改动 |
| 涉及 `packages/room-service/` 核心流程 | ⚠️ 建议跑 | CreateRoom / JoinRoom / Ready / StartGame / GameOver / Exit |
| 涉及 `packages/match-service/` 匹配逻辑 | ⚠️ 建议跑 | 匹配算法改动 |
| 涉及 `packages/frontend-multiplayer/` 多人状态机 | ⚠️ 建议跑 | 状态机逻辑改动 |
| 重构跨模块 | ⚠️ 建议跑 | gts-dev-refactor 触发的多包改动 |
| 部署到 SCF 前（含多人改动）| ⚠️ 建议跑 | 线上前必须绿 |
| E2E 回归场景新增/修改 | ⚠️ 建议跑 | 验证 1:1 映射的集成测试 |
| 兄弟说「跑集成回归」| ✅ 直接跑 | 兄弟都说了还问啥 |
| 纯单模块常量/配置/注释/测试新增 | 🙅 无需跑 | 不影响包间协议 |
| 纯文档/样式/UI 改动 | 🙅 无需跑 | 不涉及后端逻辑 |

---

### ⚠️ 嵌套调用规则

当本 skill 被其他 skill（如 `gts-regression`、`gts-dev-workflow`、`gts-acceptance`、`gts-dev-fix`）流程中调用时：
- **由调用方管理状态文件**，本 skill **不执行 INIT/STEP_DONE/CLEANUP/ABORT**
- 直接在调用方的现有 workflow 下执行步骤，不创建独立的 state 文件和 issue 文件
- 仅在**独立触发**时（兄弟直接说「跑集成回归」）初始化自己的状态追踪

**判断方式**（独立触发时在执行 INIT 前检查）：
```powershell
# 检查当前 session 是否已有活跃 workflow
$existingState = Get-ChildItem "D:\Github\GTS-Play\.skill-exec-state.$sid*.json" -ErrorAction SilentlyContinue
if ($existingState) {
  $content = Get-Content $existingState.FullName -Raw | ConvertFrom-Json
  if ($content.skillName -ne "gts-integration-regression") {
    Write-Host "NESTED_MODE: 由父 workflow ($($content.skillName)) 管理状态，跳过 INIT"
    exit
  }
}
```

**反思规则**：

| 场景 | 反思 | pitfalls 记录 |
|------|------|--------------|
| **独立触发**（兄弟说「跑集成回归」） | ✅ Step R 执行 gts-skill-reflect | 记到自己的 issue |
| **嵌套调用**（被 gts-regression/acceptance 调用） | ❌ 跳过反思 | 用**调用方 sessionId** 执行 `append-pitfall`，记到顶层 issue |

> 嵌套时反思由顶层 skill 统一执行，本 skill 不重复反思。

---

## INIT（skill 触发时第一时间执行）

```powershell
# 1. 获取/生成 session ID 和 workflow ID
$sid = node scripts/skill-exec-manager.cjs get-session-id | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
$wid = node scripts/skill-exec-manager.cjs get-workflow-id $sid | ConvertFrom-Json | Select-Object -ExpandProperty workflowId

# 2. 同任务预检（dispatch 前查 OpenCode DB 确认无「相同任务」活跃 session；不同任务直接并行，全局 dispatch 锁已废弃 2026-08-01）
# 3. stateInit + issueCreate + registryRegister
node scripts/skill-exec-manager.cjs init $sid $wid "gts-integration-regression" `
  --steps 0,1,2,3,4,5,R `
  --summary "<回归原因（基于决策矩阵）>" `
  --criteria "全量集成测试全部通过" `
  --specs "<关联 specs 路径，逗号分隔，可省略>"
```

## 步骤序列

### Step 0：询问是否全自动

```
  ？ 是否全自动运行？
  全自动模式：失败自动修复（TDD RED→GREEN 流程）→ 重跑，直到全绿
  手动模式：只跑一次，失败由兄弟决定

  [1] 全自动跑（自动修复直至通过）
  [2] 手动跑
```

- 兄弟选 1 → 设置 `context.autoMode = true`
- 兄弟选 2 → 设置 `context.autoMode = false`
- 🔴 无论哪种模式，Step 1 的测试范围/执行方式都正常走

> 如果上游 skill 已指定模式，跳过本步。

> 📊 **状态追踪：** Step 0 完成 → STEP_DONE
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index 0 --step-name "询问是否全自动" --files "context.autoMode=$autoMode"
> ```

### Step 1：判断 + 测试范围 + 执行方式（三合一）

按决策矩阵判断。如果是「🙅 无需跑」，直接跳过，流程结束。

否则输出判断结论 + 集成测试列表 + 询问，`msg *` 桌面通知。

**输出格式：**

```
──── 跨模块集成测试回归 ────
本次改动：{改动描述}
判断：{决策矩阵结论}
模式：{全自动 / 手动}

可用集成测试目录（{N}个）：
  [1] auto-ready-guard              [2]  countdown-guard
  [3] forum-contentlang             [4]  forum-notification
  [5] forum-translate               [6]  frontend
  [7] keepalive-fix                 [8]  match-flow
  [9] multiplayer-flow              [10] network-optimization
  [11] nf-bridge                    [12] prediction-init
  [13] room-overjoin                [14] room-owner-round2
  [15] round2-auto-ready            [16] specify-room-flow

选择操作：
  (A) 跑全部集成测试 ← 回车默认
  (B) 跑指定目录（输入编号，如 1,3,5 或 1-5）
  (C) 只检查覆盖，不跑测试

输入 A-C 或回车 >
────────────────────
```

**解析规则：**
- 回车 / A / a → `testScope=all`
- B / b → 再提示 `输入测试目录编号（如 1,3,5 或 1-5）>`
- C / c → 不进 Step 2，直接进 Step 3（只覆盖+通知）

> 兄弟说「跑集成回归」→ 选项 A（默认值），跳过询问。
> 兄弟说「跑部分集成测试」→ 选项 B。

记录 `context.testScope`、`context.selectedDirs`。

> 📊 **状态追踪：** Step 1 完成 → STEP_DONE
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index 1 --step-name "判断+测试范围+执行方式"
> ```

### Step 2：跑集成测试回归

#### 🔴 核心规则

1. **全部通过 OpenCode 调度完成** — bot 不手动跑 jest
2. **一次 dispatch 覆盖所有指定目录** — 集成测试快（秒级），不需要逐个串行
3. **全量跑用全量命令，指定目录用 `--testPathPattern`**

#### 命令参考

| 范围 | 命令 |
|------|------|
| 全部集成测试 | `npx jest --config test/integration/jest.config.js --no-cache --forceExit` |
| 指定目录 | `npx jest --config test/integration/jest.config.js --no-cache --forceExit --testPathPattern={dir1\|dir2}` |
| 单个目录 | `npx jest --config test/integration/jest.config.js --no-cache --forceExit --testPathPattern={dir-name}` |

#### 超时设置

集成测试快速（秒级），OpenCode brief 中用固定 timeout：

| 场景 | shellTimeout |
|------|-------------|
| 全部集成测试（~20 个目录） | 120s |
| 指定目录（1-5 个） | 60s |
| 单个目录 | 30s |

#### brief 要点

- 共享规约见 `docs/agent-context.md` + `笔记/项目文档/rules/test-standards.md` → Layer 3
- 任务：跑跨模块集成测试回归
- 范围：{全部 / 指定目录}
- 命令：`npx jest --config test/integration/jest.config.js --no-cache --forceExit {--testPathPattern={dir}}`
- shellTimeout：{timeout}s
- 要求：
  1. 先跑测试，检查结果
  2. 如果全部通过 → 通知完成
  3. 如果有失败 → **按 TDD 流程修复**：
     a. 读失败日志，分析根因（被测代码 bug / 测试本身问题 / 环境问题）
     b. 如果被测代码问题 → 修业务代码让测试通过
     c. 如果测试本身问题 → 修 `.steps.ts` / `.feature`
     d. 如果环境/配置问题 → 修 jest 配置或 mock
     e. 修完后重跑，直到全部通过
  4. 🐛🔴 **修复时必须遵守 `docs/agent-context.md` + `笔记/项目文档/rules/test-standards.md` → Layer 3 验收标准** — 逐条检查断言精确性（无模糊词）、真实 import（无 mock/simulate）、跨模块覆盖（import 2+ 项目）、返回结构匹配、状态字段正确
  5. 不需要代码审核，代码审核是单独步骤
- 约束：禁止修改 `doc/` 和 `笔记/语雀知识库/`
- 禁止修改 E2E 场景文件（`scenarios/regression/` 目录）

#### dispatch 方式（走 opencode-schedule skill）

1. 写 `.opencode-brief.md`
2. 🔴 Step 0 — dispatch 前检查进程列表：`process(action=list)`，确认没有活着的 OpenCode session
3. 检查 Web UI 可用
4. 读取 brief 文件
5. dispatch（`$brief` 变量传参，timeout=0）
6. 循环 poll（每次等 30s）直到 OpenCode 有明确完成信号

#### 失败处理

| OpenCode 结果 | bot 处理 |
|--------------|---------|
| 全部通过 | 继续 Step 3 |
| 修复后全通过 | 继续 Step 3 |
| 无法修复（OpenCode 报告） | 汇报兄弟「{目录} 修复失败：{原因}」，由兄弟决定 |
| 进程意外退出或超时 | 汇报兄弟，不走自动修复 |

#### 🔴 Post-poll 绑定：集成测试回归 OpenCode poll 完成后自动 step-done

dispatch 的 OpenCode poll 确认完成后（exit 0 + DB completed），**立即**更新 issue 进度：

```powershell
$sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
node scripts/skill-exec-manager.cjs step-done $sid --step-index 2 --step-name "跑集成测试回归"
```

### Step 3：覆盖检查 + 结果通知

**无论 Step 1 是否跳过测试，本步都执行。**

#### 覆盖检查

1. 读 `test/integration/` 下所有目录
2. 看本次改动类型是否有对应集成测试
3. 检查是否每个相关 E2E 场景都有对应的集成测试（1:1 映射）
4. 有覆盖 → ✅，无覆盖 → ⚠️ 建议新增

#### 结果通知

| 结果 | 通知 |
|------|------|
| 跳过测试 | 只通知覆盖检查 |
| 全部通过 | ✅ 全绿（Step 5 统一发送）|
| 有失败（手动模式）| Step 5 统一发送 |
| 全自动模式完成 | Step 5 统一发送 |

> 📊 **状态追踪：** Step 3 完成 → STEP_DONE
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index 3 --step-name "覆盖检查+结果通知"
> ```

### Step 4：创建新集成测试（可选的子步骤）

当 Step 3 发现需要新增且兄弟同意时执行。调度 OpenCode Flash 新建。

规则：
1. 命名目录：`test/integration/<功能名>/`
2. 文件结构：
   - `<功能名>.feature`（BDD 场景描述，参考现有 `.feature` 格式）
   - `<功能名>.steps.ts`（步骤实现，用 `jest-cucumber` 框架）
3. 必须包含回归 bug 的 commit hash 引用（如有）
4. 🐛🔴 **遵守 `笔记/项目文档/rules/test-standards.md` → Layer 3 验收标准**：所有检查项必须逐条验证（回归 bug 覆盖、真实 import、无服务依赖、Immutable 兼容、返回结构匹配、状态字段正确、无 Three.js 依赖、精确断言无模糊词、feature 标题可验证）
5. 测试必须直接调用实际业务代码，import 2+ 项目的真实源码，不 mock、不用 `_simulate*`
6. 集成测试写完后在 OpenCode 同一会话中运行验证（RED→RED 通过逻辑→GREEN）
7. 同步检查是否已有 E2E 场景引用此集成测试
8. 同步在 `笔记/项目文档/specs/` 中补充场景描述

#### 🔴 Post-poll 绑定：创建新集成测试 OpenCode poll 完成后自动 step-done

dispatch 的 OpenCode poll 确认完成后，**立即**更新 issue 进度：

```powershell
$sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
node scripts/skill-exec-manager.cjs step-done $sid --step-index 4 --step-name "创建新集成测试"
```
> ```

### Step R：技能反思（仅独立触发时）

嵌套调用时**跳过本步骤**，直接进 Step 5（保存）。

独立触发时，调用 gts-skill-reflect：

```
走 skills/gts-skill-reflect/SKILL.md 流程（收集 pitfalls + 执行指标 + 记忆检索 → 分析 → 报告 → 等兄弟确认）
```

> 反思产出改进建议，**等兄弟确认后才执行**（skill_workshop），不自动改 skill。
> 🔴 **保存必须在反思之后**：gts-submit-save 是工作流最后一步（通知之前），确保反思产出的 skill 更新/修复/报告能一起被提交，不会分两批。
> 反思不阻塞通知；反思完成后进 Step 5（保存）继续。

### Step 5：保存 + 汇报总结

所有步骤完成后执行。

#### 5.1 调用 gts-submit-save 保存

🔴 **即使无代码改动也必须调用** — 因为 issue 追踪文件（`笔记/项目文档/issue/`）是新创建的，需要提交入库。

走 `gts-submit-save` skill 执行 git commit + 记忆保存 + git push。

> 🔴 bot 执行 Step 5 时必须在调用 `gts-submit-save` 之前确保 issue 文件已纳入暂存区（`git add 笔记/项目文档/issue/`）。

#### 5.2 向兄弟汇报总结

```
msg * "跨模块集成测试回归完成

模式：{autoMode ? '全自动' : '手动'}
范围：{testScope}
结果：{passedCount}/{totalCount}通过
耗时：{总耗时}
"
```

#### 5.3 发送通知

使用 cron announce 双通道通知：
- 飞书（channel=feishu）
- clickclack（channel=clickclack）

通知内容（≤30字）：如「集成回归 {N}/{M} 通过 ✅」

```
cron(action=add, job={...})
  payload.kind="agentTurn"
  delivery.mode="announce"
```

> 📊 **状态追踪：** Step 5 完成 → STEP_DONE + CLEANUP
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index 5 --step-name "保存+汇报总结"
> node scripts/skill-exec-manager.cjs cleanup $sid --result completed
> ```

---

## 🔴 dispatch OpenCode 规则

### 通用规则

详见 `opencode-schedule/SKILL.md`，bot 只写 brief + dispatch，不手动改代码/跑命令。

### 集成测试回归专用规则

| 类型 | 模型 | 说明 |
|------|------|------|
| 跑集成测试（含自动修复）| `opencode-go/deepseek-v4-flash` | 快速任务 |
| 写新集成测试 | `opencode-go/deepseek-v4-flash` | 简单任务一刀切 |

---

## 调用入口

| 场景 | 触发方式 |
|------|----------|
| gts-dev-workflow 代码审核后 | 自动调用，Step 0 通过 context 传入模式 |
| gts-e2e-regression 失败分析时 | 自动调用，验证集成测试层 |
| 兄弟说「跑集成回归」| ✅ 直接跑默认值，进入 Step 1，不经过 Step 0 |
| 兄弟说「检查集成测试覆盖」| 只执行 Step 3 |
| 兄弟说「新建集成测试」| 只执行 Step 4 |

---

## 与其它 skill 的关系

| Skill | 关系 |
|-------|------|
| gts-e2e-regression | 互补，E2E 回归发现失败时调用本 skill 验证集成测试层 |
| gts-dev-workflow | 上游，代码审核后自动调用 |
| gts-submit-save | Step 5 调用来保存 + 汇报总结 + 通知 |
| gts-auto | Step 0 选全自动后，自动修复逻辑引用 gts-auto 模式规则 |
| gts-test-quality | 本 skill 是质量审计的数据源之一 |
