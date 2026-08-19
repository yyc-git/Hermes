---
name: "gts-regression"
description: "两层回归编排：先跑跨模块集成测试回归（gts-integration-regression），再跑E2E回归（gts-e2e-regression），场景和环境一次选定"
---

# gts-regression — 两层回归编排

> 本 skill 是 gts-integration-regression + gts-e2e-regression 的上层编排器。
> 环境+场景一次选定，先快速层（集成测试，秒级）再慢速层（E2E，分钟级）。
> 场景列表以 E2E regression 场景为基准，集成测试目录与之 1:1 映射。

---

## 🔴 核心原则

1. **环境 + 场景一次选定** — 不用跑完集成测试再问一遍 E2E 选什么
2. **先集成回归，再 E2E 回归** — Layer 3 先验证代码逻辑，Layer 4 再验证全链路 UI
3. **场景列表出自 E2E regression 场景**（`scenarios/regression/*.json`），集成测试目录与之映射
4. **如果集成回归失败且自动修复不通过 → 不继续 E2E** — 避免浪费浏览器+服务资源跑一个有根因 bug 的场景
5. **最终结果以 E2E 为准** — E2E 全绿才算全绿

### 场景 ↔ 集成测试目录 映射规则

```
E2E regression 场景                    对应集成测试目录（推测）
fix-auto-ready-guard.json           →  auto-ready-guard/
fix-basic-flow-two-rounds.json      →  multiplayer-flow/（或通用流程目录）
fix-exit-no-refresh.json            →  room-owner-round2/
fix-ingame-stability.json           →  room-owner-round2/
fix-kick-player.json                →  room-owner-round2/
fix-move-verify.json                →  frontend/
fix-player-defeated.json            →  room-owner-round2/
fix-postgame-state-exit.json        →  multiplayer-flow/
refactor-ready-state-sync.json      →  multiplayer-flow/
refactor-room-lifecycle.json        →  multiplayer-flow/
```

- 映射关系可在 `test/integration/` 下按目录查找：去掉 `fix-` 前缀即为目录名（如 `fix-auto-ready-guard` → `auto-ready-guard`），找不到则匹配最接近的目录
- 如果新增了场景但尚未有集成测试 → 集成回归步骤中提示并自动创建（按 TDD 流程）

---

## 🔴 状态追踪

> 本 skill 使用 **skill-exec-issue-tracker** (Phase 0-8) 框架管理状态。

### 文件定义

| 文件 | 用途 | 是否纳入 git |
|------|------|:----------:|
| `.skill-exec-state.<sessionId>.json` | per-session 状态文件（v2 schema） | ❌ .gitignore |
| `.skill-exec-sessions.json` | 会话注册表 | ❌ .gitignore |
| `.skill-exec-dispatch.lock` | dispatch 互斥锁（30min TTL + heartbeat） | ❌ .gitignore |
| `笔记/项目文档/issue/<date>-<skill>-<hash>.md` | Issue 追踪文件 | ✅ |
| `scripts/skill-exec-manager.cjs` | CLI 入口 | ✅ |

### 步骤序列

```
步骤序列（6 步）：
  0: 询问是否全自动
  1: 环境 + 场景选择（三合一）
  2: 跑集成测试回归（委托 gts-integration-regression）
  3: 跑 E2E 回归（委托 gts-e2e-regression）
  4: 结果汇总
  R: 技能反思（调用 gts-skill-reflect，CLEANUP 后执行，不阻塞 CHECK 恢复）
```

### 生命周期操作

| 操作 | 时机 | CLI 命令 |
|------|------|---------|
| **INIT** | skill 触发时 | `node scripts/skill-exec-manager.cjs init <sessionId> <workflowId> gts-regression --steps 0,1,2,3,4,R --summary "回归原因" --criteria "全部通过" --specs "关联specs路径"` |
| **STEP_DONE** | 每完成一个子步骤后 | `node scripts/skill-exec-manager.cjs step-done <sessionId> --step-index <索引> --step-name "<步骤名>"` |
| **CHECK** | 每次收到兄弟消息后 | `node scripts/skill-exec-manager.cjs check <sessionId>` |
| **CLEANUP** | 所有步骤完成后 | `node scripts/skill-exec-manager.cjs cleanup <sessionId> --result completed` |
| **ABORT** | 放弃工作流 | `node scripts/skill-exec-manager.cjs abort <sessionId> [--reason "<原因>"]` |

---

## 目录和路径

| 项 | 值 |
|----|-----|
| 项目根 | `D:\Github\GTS-Play` |
| 回归场景 | `packages/frontend-multiplayer/test/e2e/scenarios/regression/` |
| 集成测试根 | `test/integration/` |
| 子 skill 路径 | `skills/gts-integration-regression/SKILL.md` |
| 子 skill 路径 | `skills/gts-e2e-regression/SKILL.md` |

---

### ⚠️ 嵌套调用规则

当本 skill 被其他 skill（如 `gts-dev-workflow`、`gts-acceptance`、`gts-dev-fix`）流程中调用时：
- **由调用方管理状态文件**，本 skill **不执行 INIT/STEP_DONE/CLEANUP/ABORT**
- 直接在调用方的现有 workflow 下执行步骤，不创建独立的 state 文件和 issue 文件
- 仅在**独立触发**时（兄弟说「跑回归」「跑两层回归」）初始化自己的状态追踪

**判断方式**（独立触发时在执行 INIT 前检查）：
```powershell
$existingState = Get-ChildItem "D:\Github\GTS-Play\.skill-exec-state.$sid*.json" -ErrorAction SilentlyContinue
if ($existingState) {
  $content = Get-Content $existingState.FullName -Raw | ConvertFrom-Json
  if ($content.skillName -ne "gts-regression") {
    Write-Host "NESTED_MODE: 由父 workflow ($($content.skillName)) 管理状态，跳过 INIT"
    exit
  }
}
```

**反思规则**：

| 场景 | 反思 | pitfalls 记录 |
|------|------|--------------|
| **独立触发**（兄弟说「跑回归」） | ✅ Step R 执行 gts-skill-reflect | 记到自己的 issue |
| **嵌套调用**（被 dev-workflow/acceptance 调用） | ❌ 跳过反思 | 用**调用方 sessionId** 执行 `append-pitfall`，记到顶层 issue |

> 嵌套时反思由顶层 skill 统一执行，本 skill 不重复反思。

---

## INIT（skill 触发时第一时间执行）

```powershell
# 1. 获取/生成 session ID 和 workflow ID
$sid = node scripts/skill-exec-manager.cjs get-session-id | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
$wid = node scripts/skill-exec-manager.cjs get-workflow-id $sid | ConvertFrom-Json | Select-Object -ExpandProperty workflowId

# 2. 同任务预检（dispatch 前查 OpenCode DB 确认无「相同任务」活跃 session；不同任务直接并行，全局 dispatch 锁已废弃 2026-08-01）
# 3. stateInit + issueCreate + registryRegister
node scripts/skill-exec-manager.cjs init $sid $wid "gts-regression" `
  --steps 0,1,2,3,4,R `
  --summary "<回归原因>" `
  --criteria "集成回归+E2E回归全部通过" `
  --specs "<关联 specs 路径，逗号分隔，可省略>"
```

## 步骤序列

### Step 0：询问是否全自动

```
  ？ 是否全自动运行？
  全自动模式：两层回归都自动修复，直到全绿
  手动模式：只跑一次，失败由兄弟决定

  [1] 全自动跑（自动修复直至通过）
  [2] 手动跑
```

- 兄弟选 1 → 设置 `context.autoMode = true`
- 兄弟选 2 → 设置 `context.autoMode = false`

> 📊 **状态追踪：** Step 0 完成 → STEP_DONE
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index 0 --step-name "询问是否全自动" --files "context.autoMode=$autoMode"
> ```

### Step 1：环境 + 场景选择（三合一）

列出当前所有可用场景，一次选定环境和场景。此选择将同时用于 Step 2（集成回归）和 Step 3（E2E 回归）。

**输出格式（动态列出 regression/ 目录下所有场景）：**

```
──── 两层回归（集成 + E2E）────
本次改动：{改动描述}
判断：{基于决策矩阵}

模式：{全自动 / 手动}

可用场景（scenarios/regression/）：
  [1] fix-auto-ready-guard            [2]  fix-basic-flow-two-rounds
  [3] fix-exit-no-refresh             [4]  fix-ingame-stability
  [5] fix-kick-player                 [6]  fix-move-verify
  [7] fix-player-defeated             [8]  fix-postgame-state-exit
  [9] refactor-ready-state-sync       [10] refactor-room-lifecycle

选择操作：
  (A) 跑两层回归（local + 全部 10 个场景）← 回车默认
  (B) 跑两层回归（scf + 全部 10 个场景）
  (C) 跑两层回归（preproduction + 全部 10 个场景）
  (D) 跑 local + 指定场景（输入场景序号，如 1,3,5 或 1-5）
  (E) 跑 scf + 指定场景
  (F) 跑 preproduction + 指定场景
  (G) 跳过回归

输入 A-G 或回车 >
────────────────────
```

**解析规则：**
- 回车 / A / a → `env=local, scenarios=all`
- B / b → `env=scf, scenarios=all`
- C / c → `env=preproduction, scenarios=all`
- D / d → env=local, 再提示 `输入场景序号（如 1,3,5 或 1-5）>`
- E / e → env=scf, 再问场景编号
- F / f → env=preproduction, 再问场景编号
- G / g → 不进 Step 2-3，直接结束

> 如果上游 skill 已知环境，直接跳转对应选项。

记录 `context.env`、`context.selectedScenarios`、`context.scenarioCount`。

> 📊 **状态追踪：** Step 1 完成 → STEP_DONE
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index 1 --step-name "环境+场景选择"
> ```

### Step 2：跑集成测试回归（委托 gts-integration-regression）

将 Step 1 选定的环境和场景传入 `gts-integration-regression` skill。

**调用方式：** 通知兄弟「进入快速层 — 跨模块集成测试回归」，然后**以嵌套方式**调用 `gts-integration-regression` 的流程，但跳过其 Step 0（询问是否全自动）和 Step 1（判断+范围选择），直接进入其 Step 2。

> ⚠️ **嵌套模式：** gts-integration-regression 不独立创建 state/issue 文件，所有状态追踪由 gts-regression 的 workflow 统一管理。

**场景映射规则：**
- 根据 `fix-xxx.json` 名称，去掉 `fix-` 前缀作为集成测试目录名
- 如 `fix-auto-ready-guard` → `auto-ready-guard/`
- 如 `fix-basic-flow-two-rounds` → 匹配 `multiplayer-flow/` 或最接近的目录
- 如果不存在对应目录 → 在 Step 2 中提示并自动创建（TDD 流程）

**执行流程：**
1. 根据所选 E2E 场景推导出需要跑的集成测试目录
2. 如果推导出的目录全部存在 → 跑 `npx jest --config test/integration/jest.config.js --no-cache --forceExit --testPathPattern={dir1|dir2|...}`
3. 如果有些场景没有对应集成测试 → 先 TDD 创建（同 `gts-integration-regression` Step 4 的规则），再跑
4. 调度 OpenCode Flash 执行

**集成测试全绿 → 进入 Step 3。集成测试有失败且自动修复不通过 → 报告兄弟，不继续 E2E。**

#### 🔴 Post-poll 绑定：集成测试回归 OpenCode poll 完成后自动 step-done

dispatch 的 OpenCode poll 确认完成后，**立即**更新 issue 进度：

```powershell
$sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
node scripts/skill-exec-manager.cjs step-done $sid --step-index 2 --step-name "集成测试回归"
```

### Step 3：跑 E2E 回归（委托 gts-e2e-regression）

将 Step 1 选定的环境和场景传入 `gts-e2e-regression` skill。

**调用方式：** 通知兄弟「进入慢速层 — E2E 回归测试」，然后**以嵌套方式**调用 `gts-e2e-regression` 的流程，但跳过其 Step 0（询问是否全自动）和 Step 1（环境+场景选择），直接进入其 Step 2（检查服务可用性）和 Step 3（跑回归）。

> ⚠️ **嵌套模式：** gts-e2e-regression 不独立创建 state/issue 文件，所有状态追踪由 gts-regression 的 workflow 统一管理。

**关键差异：**
- 不重新询问环境/场景 — 直接使用 Step 1 的选择
- 不重新询问是否全自动 — 直接使用 Step 0 的选择
- 先检查服务可用性（仅 local 环境），走 `gts-e2e-regression` Step 2
- 逐个场景跑 E2E 回归（`node e2e-runner.cjs scenarios/regression/{scenario}.json --env {env}`）
- 自动修复按 `gts-e2e-regression` 的 TDD 流程

**结果：** E2E 全绿 → 汇总结果。有失败 → 按全自动/手动模式处理。

#### 🔴 Post-poll 绑定：E2E 回归 OpenCode poll 完成后自动 step-done

dispatch 的 OpenCode poll 确认完成后，**立即**更新 issue 进度：

```powershell
$sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
node scripts/skill-exec-manager.cjs step-done $sid --step-index 3 --step-name "E2E回归"
```

### Step 4：结果汇总

汇总两层回归的结果，向兄弟汇报。

#### 结果格式

```
──── 两层回归结果 ────
模式：{autoMode ? '全自动' : '手动'}
环境：{env}
场景：{N}个

Layer 3 集成回归：{passedCount}/{totalCount} 通过 ✅/❌
  耗时：{x}s
  详情（失败列表）：...

Layer 4 E2E 回归：{passedCount}/{totalCount} 通过 ✅/❌
  耗时：{x}min
  详情（失败列表）：...

总体结果：✅ 全绿 / ❌ {N}个失败
```

#### 通知

- `msg *` 桌面通知
- cron announce 双通道（飞书 + clickclack）

> 📊 **状态追踪：** Step 4 完成 → STEP_DONE + CLEANUP
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index 4 --step-name "结果汇总"
> node scripts/skill-exec-manager.cjs cleanup $sid --result completed
> ```

### Step R：技能反思（仅独立触发时）

嵌套调用时**跳过本步骤**，直接完成通知。

独立触发时，调用 gts-skill-reflect：

```
走 skills/gts-skill-reflect/SKILL.md 流程（收集 pitfalls + 执行指标 + 记忆检索 → 分析 → 报告 → 等兄弟确认）
```

> 反思产出改进建议，**等兄弟确认后才执行**（skill_workshop），不自动改 skill。
> 反思不阻塞通知；反思完成后发双通道通知。

---

## 🔴 决策矩阵

| 条件 | 判断 | 说明 |
|------|------|------|
| 涉及 `packages/network-framework/` | ⚠️ 建议跑 | 底层网络栈改动 |
| 涉及 `packages/room-service/` 核心流程 | ⚠️ 建议跑 | 多人核心逻辑 |
| 涉及 `packages/match-service/` | ⚠️ 建议跑 | 匹配/房间管理 |
| 涉及 `packages/frontend-multiplayer/` 状态机 | ⚠️ 建议跑 | 多人 UI 联动 |
| 重构跨模块 | ⚠️ 建议跑 | 多包改动 |
| 部署到 SCF 前（含多人改动）| ⚠️ 建议跑 | 线上前必须绿 |
| 兄弟说「跑回归」「跑两层回归」| ✅ 直接跑 | |
| 纯单模块常量/配置/注释/测试新增 | 🙅 无需跑 | |
| 纯文档/样式/UI 改动 | 🙅 无需跑 | |

---

## 调用入口

| 场景 | 触发方式 |
|------|----------|
| 兄弟说「跑回归」「跑两层回归」| ✅ 进入 Step 1，跳过 Step 0 |
| 兄弟说「全自动跑回归」| ✅ 全自动 + 进入 Step 0 |
| gts-dev-workflow 代码审核后 | 自动调用，通过 context 传入模式 |
| gts-acceptance Step 6 + 7 合并调用 | 自动调用 |
| 兄弟说「跳过回归」| 退出，不做任何操作 |

---

## 与其它 skill 的关系

| Skill | 关系 |
|-------|------|
| gts-integration-regression | 下层 — Step 2 委托它执行集成回归 |
| gts-e2e-regression | 下层 — Step 3 委托它执行 E2E 回归 |
| gts-dev-workflow | 上游 — 代码审核后自动调用 |
| gts-acceptance | 上游 — 验收流程中合并调用 Step 6+7 |
| gts-auto | 全自动模式引用 |
| gts-service | E2E 回归过程中由下层 skill 调用 |
| gts-submit-save | 回归完成后由上层 skill 调用来保存 |
