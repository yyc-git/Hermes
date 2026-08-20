---
name: "gts-e2e-regression"
description: "E2E回归测试：跑 regression/ 目录场景，含决策矩阵+覆盖检查+结果通知"
---

# gts-e2e-regression — E2E 回归测试

> 本 skill 只负责 E2E 回归，不负责手动验收选场景（那是 gts-e2e-test / gts-e2e-auto 的事）。

---

## 🔴 核心原则

1. **只跑 `scenarios/regression/` 目录** — `general/` 是手动验收用的，不自动跑
2. **🔴 跑前必须先问兄弟确认** — E2E 回归很重（浏览器+WS+服务端全链路），不能闷头就跑
3. **🔴 一问三合一** — 判断 + 环境 + 场景选择合并为一个步骤，减少来回确认
4. **🔴 E2E 回归与跨模块集成测试 1:1 映射**
   - 每个 E2E 回归场景 `fix-xxx.json` 必须对应一个跨模块集成测试 `fix-xxx.feature`
   - 集成测试目录：`test/integration/fix-xxx/fix-xxx.feature`
   - 如果 E2E 场景没有对应的集成测试 → 在修复时优先按 TDD 流程创建
5. **🔴 TDD 优先：E2E 发现失败 → 先通过集成测试 → 再通过 E2E**
   - E2E 回归场景失败时，先分析根因
   - 如果是代码逻辑问题 → **先通过 TDD 流程修/创建对应的跨模块集成测试**
     - RED：集成测试因 bug 真实失败
     - GREEN：修业务代码让集成测试通过
   - 集成测试通过后，**再**跑 E2E 端到端验证
   - 集成测试验证核心逻辑，E2E 验证全链路 + UI 交互，两层互不替代
6. **覆盖必补** — 之前没回归场景的 bug fix，submit 前必须新增

### E2E ↔ 集成测试 映射规则

| 概念 | 定位 | 执行环境 | 速度 |
|------|------|---------|------|
| 跨模块集成测试 `.feature` | 验证核心业务逻辑正确性 | Node.js（无浏览器）| 秒级 |
| E2E 回归场景 `.json` | 验证端到端全链路 + UI 交互 | Playwright 浏览器 | 分钟级 |

**命名约定：**
- E2E 场景：`scenarios/regression/fix-xxx.json`
- 集成测试目录：`test/integration/fix-xxx/`
- 集成测试文件：`test/integration/fix-xxx/fix-xxx.feature` + `fix-xxx.steps.ts`
- 如果已有不含 `fix-` 前缀的集成测试（如 `auto-ready-guard` → `fix-auto-ready-guard`），使用已有文件，不需要重命名

**一个 E2E 场景失败时的 TDD 决策树：**
```
E2E 场景失败
  ├── 根因是场景脚本问题（按钮文字/等待时长/ignorePatterns）
  │   └── 修场景 JSON，重跑 E2E
  ├── 根因是代码逻辑问题 → 有对应集成测试
  │   ├── 集成测试本身失败 ❌ → TDD：修代码让集成测试 GREEN
  │   └── 集成测试通过 ✅ → 集成测试覆盖不够 → 先扩集成测试 RED→GREEN
  └── 根因是代码逻辑问题 → 无对应集成测试
      └── 按 TDD 流程新建集成测试 RED → 修代码 GREEN → 再跑 E2E
```

---

## 环境和命令对照

| 环境 | `--env` 参数 | 前置条件 |
|------|------------|---------|
| 本地（默认） | `local` | room-service + match-service + webpack-dev-server 已启动 |
| SCF 线上 | `scf` | 已部署到 SCF |
| 预发 | `preproduction` | 已部署到预发环境 |

---

## 目录和路径

| 项 | 值 |
|----|-----|
| 项目根 | `D:\Github\GTS-Play` |
| 回归场景 | `packages/frontend-multiplayer/test/e2e/scenarios/regression/` |
| 回归运行器 | `packages/frontend-multiplayer/test/e2e/run-regression.cjs`（支持串行/并行） |
| 单场景运行器 | `packages/frontend-multiplayer/test/e2e/e2e-runner.cjs` |
| 状态文件（v2 per-session） | `.skill-exec-state.<sessionId>.json` |

---

## 🔴 状态追踪

> 本 skill 使用 **skill-exec-issue-tracker** (Phase 0-8) 框架管理状态，支持多会话隔离、Issue 追踪和 dispatch 互斥。
> 本机制遵循 `笔记/项目文档/changes/2026-07-28-skill-exec-issue-tracker/solution.md` 的实现规格。
> 不再使用旧版单文件 `.skill-exec-state.json`。

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
步骤序列（8 步）：
  0: 询问是否全自动（跳转到 gts-auto）
  1: 判断 + 环境 + 场景选择（三合一）
  2: 检查服务可用性（仅 local）
  3: 跑回归测试
  4: 覆盖检查 + 结果通知
  5: （可选）创建新回归场景
  R: 技能反思（调用 gts-skill-reflect，CLEANUP 后、保存前执行）
  6: 保存 + 汇报总结（gts-submit-save，最后一步，通知前）
```

### 生命周期操作

所有操作统一通过 `scripts/skill-exec-manager.cjs` CLI 入口执行。

| 操作 | 时机 | CLI 命令 |
|------|------|---------|
| **INIT** | skill 触发时、执行任何步骤之前 | `node scripts/skill-exec-manager.cjs init <sessionId> <workflowId> gts-e2e-regression --steps 0,1,2,3,4,5,6,R --summary "回归原因" --criteria "N/M 通过" --specs "关联specs路径"` |
| **STEP_DONE** | 每完成一个子步骤后 | `node scripts/skill-exec-manager.cjs step-done <sessionId> --step-index <索引> --step-name "<步骤名>" [--files "..."]` |
| **CHECK** | 每次收到兄弟消息后 | `node scripts/skill-exec-manager.cjs check <sessionId>` |
| **CLEANUP** | 所有步骤完成后 | `node scripts/skill-exec-manager.cjs cleanup <sessionId> --result completed` |
| **ABORT** | 放弃工作流 | `node scripts/skill-exec-manager.cjs abort <sessionId> [--reason "<原因>"]` |

> **Session ID**：`node scripts/skill-exec-manager.cjs get-session-id`
> **Workflow ID**：`node scripts/skill-exec-manager.cjs get-workflow-id [<sessionId>]`

### 初始化格式（由 CLI 自动生成）

`init` 命令生成的 state 文件格式（v2 schema）：

```json
{
  "_version": 1,
  "schemaVersion": "2",
  "sessionId": "<自动获取>",
  "workflowId": "wf_<timestamp>_<random8>",
  "skillName": "gts-e2e-regression",
  "totalSteps": 8,
  "stepSequence": ["0","1","2","3","4","5","6","R"],
  "completedSteps": [],
  "remainingSteps": ["0","1","2","3","4","5","6","R"],
  "completedCount": 0,
  "context": {
    "featureSummary": "<回归原因>",
    "autoMode": false,
    "env": "local",
    "selectedScenarios": [],
    "scenarioCount": 0,
    "result": ""
  },
  "issuePath": "笔记/项目文档/issue/<date>-gts-e2e-regression-<hash>.md",
  "issueSyncStatus": "synced",
  "status": "active",
  "startedAt": "<ISO 时间>",
  "lastUpdatedAt": "<ISO 时间>"
}
```

### 恢复交互模板

```
🤖 检测到未完成的工作流：gts-e2e-regression (session: {sessionId})

   已完成（{n}/{total}）:
     ✅ 0: 询问是否全自动（是）
     ✅ 1: 判断 + 环境 + 场景选择（local, 4/10 个场景）

   剩余步骤（{m}/{total}）:
     📋 2: 检查服务可用性
     📋 3: 跑回归测试
     📋 4: 覆盖检查 + 结果通知
     📋 5: 创建新回归场景

   Issue: {issuePath}
   模式：全自动 | 环境：local | 场景：4/10
   最后更新：{相对时间}

   🔜 即将执行下一步 Step 2
```

### 故障处理

| 场景 | 处理方式 |
|------|----------|
| `check` 返回 `exists: false` | 正常 → 无未完成 workflow |
| JSON 解析失败 | 展示原始内容给兄弟，手动决定 |
| remainingSteps 为空但文件未清理 | 自动 CLEANUP |
| issue 创建失败 | 不阻塞 workflow，下次 CHECK 补建 |

### 手动命令

| 兄弟说的 | 行为 |
|----------|------|
| "查看当前进度" | `check <sessionId>` + 展示完整状态 |
| "跳过这个步骤" | `step-done <sessionId> --step-index <索引>` |
| "重新执行上一步" | 回退最近一个 completedStep 并重标记 |
| "放弃这个工作流" | `abort <sessionId> --reason "用户手动中断"`

---

## 🔴 决策矩阵

| 条件 | 判断 | 说明 |
|------|------|------|
| 涉及 `packages/network-framework/` | ⚠️ 建议跑 | 底层网络栈改动 |
| 涉及 `packages/room-service/` 核心流程 | ⚠️ 建议跑 | CreateRoom / JoinRoom / Ready / StartGame / GameOver / Exit |
| 涉及 `packages/frontend-multiplayer/` 多人状态机 | ⚠️ 建议跑 | 状态机逻辑／UI组件改动 |
| 重构跨模块 | ⚠️ 建议跑 | gts-dev-refactor 触发的多包改动 |
| 部署到 SCF 前（含多人改动） | ⚠️ 建议跑 | 线上前必须绿 |
| 兄弟说「跑回归」 | ✅ 直接跑 | 兄弟都说了还问啥 |
| 纯单模块常量/配置/注释/测试新增 | 🙅 无需跑 | 不影响运行时多人流程 |

---

### ⚠️ 嵌套调用规则

当本 skill 被其他 skill（如 `gts-regression`、`gts-acceptance`、`gts-dev-workflow`）流程中调用时：
- **由调用方管理状态文件**，本 skill **不执行 INIT/STEP_DONE/CLEANUP/ABORT**
- 直接在调用方的现有 workflow 下执行步骤，不创建独立的 state 文件和 issue 文件
- 仅在**独立触发**时（兄弟直接说「跑回归」）初始化自己的状态追踪

**判断方式**（独立触发时在执行 INIT 前检查）：
```powershell
$existingState = Get-ChildItem "D:\Github\GTS-Play\.skill-exec-state.$sid*.json" -ErrorAction SilentlyContinue
if ($existingState) {
  $content = Get-Content $existingState.FullName -Raw | ConvertFrom-Json
  if ($content.skillName -ne "gts-e2e-regression") {
    Write-Host "NESTED_MODE: 由父 workflow ($($content.skillName)) 管理状态，跳过 INIT"
    exit
  }
}
```

**反思规则**：

| 场景 | 反思 | pitfalls 记录 |
|------|------|--------------|
| **独立触发**（兄弟说「跑回归」） | ✅ Step R 执行 gts-skill-reflect | 记到自己的 issue |
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
node scripts/skill-exec-manager.cjs init $sid $wid "gts-e2e-regression" `
  --steps 0,1,2,3,4,5,6,R `
  --summary "<回归原因（基于决策矩阵）>" `
  --criteria "全量回归 N 个场景全部通过" `
  --specs "<关联 specs 路径，逗号分隔，可省略>"
```

## 步骤序列

```
步骤序列（6 步）：
  0: 询问是否全自动（跳转到 gts-auto）
  1: 判断 + 环境 + 场景选择（三合一）
  2: 检查服务可用性（仅 local）
  3: 跑回归测试
  4: 覆盖检查 + 结果通知
  5: （可选）创建新回归场景
```

### Step 0：询问是否全自动

```
  ？ 是否全自动运行？
  全自动模式：失败自动修复（修 JSON + 记 Specs + 写 BDD 集成测试）→ 重跑，直到全绿
  手动模式：只跑一次，失败由兄弟决定

  [1] 全自动跑（自动修复直至通过）
  [2] 手动跑
```

- 兄弟选 1 → 设置 `context.autoMode = true`
- 兄弟选 2 → 设置 `context.autoMode = false`
- 🔴 无论哪种模式，Step 1 的环境/场景选择都正常走，全自动只影响失败后的修复行为

> 如果上游 skill 已指定模式（如 gts-e2e-auto 调用时已知全自动），跳过本步。

> 📊 **状态追踪：** Step 0 完成 → STEP_DONE
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index 0 --step-name "询问是否全自动" --files "context.autoMode=$autoMode"
> ```

### Step 1：判断 + 环境 + 场景选择（三合一）

按决策矩阵判断。如果是「🙅 无需跑」，直接跳过，流程结束。

否则输出判断结论 + 动态场景列表 + 询问，`msg *` 桌面通知。

**输出格式（动态列出当前所有场景）：**

```
──── E2E 回归 ────
本次改动：重构多人状态机（packages/frontend-multiplayer/）
判断：⚠️ 建议跑回归
模式：{全自动 / 手动}

可用场景：
  [1] fix-auto-ready-guard          [2]  fix-basic-flow-two-rounds
  [3] fix-exit-no-refresh           [4]  fix-ingame-stability
  [5] fix-kick-player               [6]  fix-move-verify
  [7] fix-player-defeated           [8]  fix-postgame-state-exit
  [9] refactor-ready-state-sync     [10] refactor-room-lifecycle

选择操作：
  (A) 跑回归（local + 全部场景 + 串行）← 回车默认
  (B) 跑回归（scf + 全部场景 + 串行）
  (C) 跑回归（preproduction + 全部场景 + 串行）
  (D) 跑回归（local + 全部场景 + 并行 2 路）
  (E) 跑回归（local + 全部场景 + 并行（自定义路数））
  (F) 跑回归 + 自定义配置（选环境 + 场景 + 串行/并行）
  (G) 只检查覆盖，不跑回归

输入 A-G 或回车 >
────────────────────
```

**解析规则：**
- 回车 / A / a → `env=local, scenarios=all, mode=serial`
- B / b → `env=scf, scenarios=all, mode=serial`
- C / c → `env=preproduction, scenarios=all, mode=serial`
- D / d → `env=local, scenarios=all, mode=parallel(2)`
- E / e → env=local, scenarios=all, 再问 `并行跑几路？(2-6) >` → 限制 2-6 路
- F / f → 进入自定义配置子流程：先问环境（local/scf/preproduction），再问串行/并行（并行则问路数），再问场景（all/指定序号）
- G / g → 不进 Step 2-3，直接进 Step 4（只覆盖+通知）

> 如果已知环境（如上游 skill 已指定 scf 或兄弟说「跑 SCF 回归」），直接跳转到对应选项，不用再问。
> 兄弟说「跑回归」→ 选项 A（默认值），跳过询问。
> 兄弟说「跑部分场景」→ 选 F 后指定场景序号。
> 兄弟说「并行跑回归」→ 选项 D（默认并行 2 路），跳过询问。
> 🔴 此步不受 autoMode 影响 — 全自动模式仍然正常询问环境/场景选择。

记录 `context.env`、`context.selectedScenarios`、`context.scenarioCount`、`context.parallel`（并行路数，0=串行）。

> 📊 **状态追踪：** Step 1 完成 → STEP_DONE
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index 1 --step-name "判断+环境+场景选择"
> ```

### Step 2：检查服务可用性

仅 `local` 环境执行。

```
检查项：
  1. room-service: curl http://localhost:4003/healthz --timeout 3 → 200?
  2. match-service: curl http://localhost:3000/healthz --timeout 3 → 200?
  3. webpack-dev-server: curl http://localhost:8093 --timeout 5 → 200?
```

**任一失败 → 自动启动/重启缺失服务**，不询问兄弟：

```
⚠️ 本地服务未完全就绪，自动启动...
  ❌ room-service (localhost:4003) — 未响应
  ✅ match-service (localhost:3000)
  ❌ webpack-dev-server (localhost:8093) — 未响应
→ 走 gts-service skill 启动缺失服务
```

走 `gts-service` skill 按顺序启动缺失的服务（room → match → webpack）。
启动完成后重新检查一次，仍失败则报告并终止流程。

`scf` / `preproduction` 环境跳过本步。

> 📊 **状态追踪：** Step 2 完成 → STEP_DONE
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index 2 --step-name "检查服务可用性"
> ```

### Step 3：跑回归

> 🔴 跑 E2E 场景和修 E2E 场景，全部通过调度 OpenCode 完成，bot 不直接跑也不直接改 JSON。
> 从 2026-07-30 起，改为一次 dispatch 跑 `run-regression.cjs` 完成全部选定场景，不再逐个场景分别 dispatch。

#### Step 3.0：清理残留 E2E 进程

每次跑 E2E 前，必须清理一切残留的 Playwright Chromium 浏览器进程，保证只有一个 E2E 在跑。**这一步是 bot 直接跑命令（在 dispatch OpenCode 之前），不是丢给 OpenCode 做。**

**命令：**
```powershell
# 1. 杀所有 Playwright 的 Chromium（精准匹配 CommandLine）
Get-Process -Name "chrome" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "playwright|headless|--remote-debugging" } | ForEach-Object { Write-Output "Kill chrome $($_.Id)"; taskkill /F /PID $_.Id 2>$null }

# 2. 杀残留的 node e2e-runner / run-regression 进程（防僵尸）
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "e2e-runner|run-regression|e2e-runner-lib" } | ForEach-Object { Write-Output "Kill node runner $($_.Id)"; taskkill /F /PID $_.Id 2>$null }

# 3. 杀 playwright/chromium/msedge 等浏览器进程
@("chromium","playwright","msedge","chrome-headless-shell") | ForEach-Object {
  Get-Process -Name $_ -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.CommandLine -match "playwright|headless|--remote-debugging|browserType") {
      Write-Output "Kill $_ $($_.Id)"
      taskkill /F /PID $_.Id 2>$null
    }
  }
}
```

> ⚠️ **精准匹配**：只杀 playwright/headless 的 chrome，不杀兄弟自己的 Chrome。

确认清理完后再 dispatch OpenCode 跑回归。执行完清理后，用 `Get-Process -Name chrome -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "playwright|headless" } | Measure-Object` 确认已清 0。

#### 跑回归（一次 dispatch 跑 run-regression.cjs）

根据 Step 1 的选择，一次 dispatch OpenCode 跑 `run-regression.cjs`，传入选好的参数。

**构造 run-regression.cjs 参数：**

| `context` 字段 | 对应 CLI 参数 | 说明 |
|----------------|-------------|------|
| `env=local` | `--env local` | 环境 |
| `env=scf` | `--env scf` | |
| `env=preproduction` | `--env preproduction` | |
| `parallel=0`（串行） | 不传 `--parallel` | 默认串行 |
| `parallel=2` | `--parallel 2` | 并行 2 路 |
| `parallel=3` | `--parallel 3` | 并行 3 路 |
| `selectedScenarios` 指定 | `--scenarios \"1,3,5\"` | 只跑部分场景 |
| 全量 | 不传 `--scenarios` | 跑全部 |

**总是加 `--skip-logs`** — 回归场景默认跳过 saveLogs/screenshot（失败时由 OpenCode 手动检查）。

**shellTimeout 估算：**

一次 dispatch 的 shellTimeout 按所有场景的最大 single 值 × 批次数估算：

```
shellTimeout = max(600, min(场景数 × 180, 1800))   // 串行：总超时按场景数递增，封顶 1800s
shellTimeout = max(600, min(ceil(场景数 / 并行路数) × 300, 2400))  // 并行：按批次数算，放宽到 2400s 封顶
```

| 模式 | 场景数 | shellTimeout |
|------|--------|-------------|
| 串行 | 8 | 1440s |
| 串行 | 5 | 900s |
| 并行 2 路 | 8 | 1200s |
| 并行 3 路 | 8 | 800s |

**brief 要点：**
- 任务：跑 `run-regression.cjs` 完成全部选定 E2E 回归场景
- 命令：`cd packages/frontend-multiplayer/test/e2e && node run-regression.cjs --env {env} {--parallel N} {--scenarios \"...\"} --skip-logs`
- **shellTimeout**：{shellTimeout}s
- 要求：
  1. 先跑 run-regression.cjs
  2. 如果全部通过 → 通知完成
  3. 如果有失败 → 读日志分析根因（`__logs__/` 目录检查每个失败场景）
  4. **分清是场景脚本问题还是被测代码逻辑问题**
  5. 对于每个失败场景，检查 `test/integration/` 下有无对应的 `.feature` 集成测试
  6. **TDD 优先**：如果被测代码问题，先跑集成测试（RED→GREEN），再修 E2E 场景 JSON
  7. 修复完成后重跑 run-regression.cjs 验证，循环直到全绿
- 集成测试命令：`npx jest --config test/integration/jest.config.js --no-cache --forceExit`
- 修复范围：可修改 E2E 场景 JSON、集成测试 `.feature` / `.steps.ts`、业务代码 `.ts`
- 约束：不需要代码审核，代码审核是单独步骤
- **禁止修改 doc/ 和 笔记/语雀知识库/**

**dispatch 方式（走 opencode-schedule skill）：**
1. 写 `.opencode-brief.md`（含 shellTimeout）
2. 🔴 Step 0 — dispatch 前检查进程列表：`process(action=list)`，确认没有活着的 OpenCode session
3. 检查 Web UI 可用（`http://localhost:4098`）
4. 读取 brief 文件
5. dispatch（`$brief` 变量传参）
6. 循环 poll（每次等 60s 新输出）直到 OpenCode 有明确完成信号
   - 不要自己判「卡住」—— `process(poll)` 可以无限循环
   - 单次跑全部场景可能耗时 2-10 分钟，中间长时间无输出也正常（并行场景同时跑，仅汇总时输出）
   - 确实需要停 → 走 gts-opencode-stop

#### 失败处理

> 失败后的修复逻辑已集成到 OpenCode brief 中，按照 **TDD 优先** 原则（先通过跨模块集成测试，再修 E2E 场景）。

**OpenCode 返回后：**

| OpenCode 结果 | bot 处理 |
|--------------|---------|
| 全部通过 | 继续进 Step 4 |
| 部分失败但已修复（OpenCode 报告修复通过） | 继续进 Step 4 |
| 无法修复（OpenCode 报告修复失败） | 汇报兄弟「{失败场景列表} 修复失败：{原因}」，由兄弟决定 |
| 进程意外退出或超时 | 汇报兄弟，不走自动修复 |

> #### 🔴 Post-poll 绑定：OpenCode 跑回归完成后自动 step-done
>
> dispatch OpenCode 跑回归的 poll 确认完成后（exit 0 + DB completed），**立即**执行以下 step-done：
>
> ```powershell
> $sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
> node scripts/skill-exec-manager.cjs step-done $sid --step-index 3 --step-name "跑回归测试"
> ```
>
> 此步完成后进 Step 4。
>
### Step 4：覆盖检查 + 结果通知

**无论 Step 1 是否跳过回归，本步都执行。**

#### 覆盖检查

1. 读 regression/ 目录下所有 `.json` 场景
2. 看本次改动类型是否有对应场景
3. 有覆盖 → ✅，无覆盖 → ⚠️ 建议新增

#### 结果通知

| 结果 | 通知 |
|------|------|
| 跳过回归 | 只通知覆盖检查 |
| 全部通过 | —（Step 6 统一发送） |
| 有失败（手动模式）| —（Step 6 统一发送） |
| 全自动模式完成 | —（Step 6 统一发送） |

> Step 4 的覆盖检查结果传递到 Step 6，由 Step 6 统一调用 gts-submit-save 保存 + 汇报 + 发通知。
> 不影响 Step 3 失败处理中的通知（失败时需要立即通知兄弟）。

> 📊 **状态追踪：** Step 4 完成 → STEP_DONE
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index 4 --step-name "覆盖检查+结果通知"
> ```

### Step 5：创建新回归场景 + 对应集成测试（可选的子步骤）

当 Step 4 发现需要新增且兄弟同意时执行。调度 OpenCode Flash 新建。

规则：
1. 提取通用操作流程，优先用 `gameFlow` / `gameOverFlow` 等高阶积木
2. 命名 `fix-<功能名>.json`
3. 必须 `prepareEnv` 开头 + `checkErrors` + `saveLogs` 结尾
4. 环境无关
5. **必须同步创建对应的跨模块集成测试**，放在 `test/integration/fix-<功能名>/` 目录：
   - `fix-<功能名>.feature`（BDD 场景描述）
   - `fix-<功能名>.steps.ts`（步骤实现）
   - 集成测试优先用 TDD 流程写：先 RED（因真实 bug 失败）再 GREEN（修代码）
6. 同步在 `笔记/项目文档/specs/` 中补充场景描述

> 📊 **状态追踪：** Step 5 完成 → STEP_DONE
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index 5 --step-name "创建新回归场景"
> ```

### Step R：技能反思（仅独立触发时）

嵌套调用时**跳过本步骤**，直接进 Step 6（保存）。

独立触发时，调用 gts-skill-reflect：

```
走 skills/gts-skill-reflect/SKILL.md 流程（收集 pitfalls + 执行指标 + 记忆检索 → 分析 → 报告 → 等兄弟确认）
```

> 反思产出改进建议，**等兄弟确认后才执行**（skill_workshop），不自动改 skill。
> 🔴 **保存必须在反思之后**：gts-submit-save 是工作流最后一步（通知之前），确保反思产出的 skill 更新/修复/报告能一起被提交，不会分两批。
> 反思不阻塞通知；反思完成后进 Step 6（保存）继续。

### Step 6：保存 + 汇报总结 + 通知

所有步骤完成后执行。

#### 6.1 调用 gts-submit-save 保存

🔴 **即使无代码改动也必须调用** — 因为 issue 追踪文件（`笔记/项目文档/issue/`）是新创建的，需要提交入库。

走 `gts-submit-save` skill 执行 git commit + 记忆保存 + git push：
- git commit（OpenClaw workspace + GTS-Play 两仓库）
- git push
- 保存记忆（daily log + MEMORY.md 更新）

> 提交范围必须包含 `笔记/项目文档/issue/` 目录下的新 issue 文件。`gts-submit-save` 如果默认只 add 已有文件，需要确保 issue 文件被 git add。
> 🔴 bot 执行 Step 6 时必须在调用 `gts-submit-save` 之前确保 issue 文件已纳入暂存区（`git add 笔记/项目文档/issue/`）。

#### 6.2 向兄弟汇报总结

```
msg * "E2E回归完成

模式：{autoMode ? '全自动' : '手动'}
环境：{env}
场景：{N}个
结果：{passedCount}/{totalCount}通过
耗时：{总耗时}
"
```

#### 6.3 发送通知

使用 cron announce 双通道通知：
- 飞书（channel=feishu, to=user:ou_2412e799eac60d83f54ecb2601f0ba80）
- clickclack（channel=clickclack）

通知内容（≤30字）：如「E2E回归 {N}/{M} 通过 ✅」

```
cron(action=add, job={...})
  payload.kind="agentTurn"
  delivery.mode="announce"
```

> 📊 **状态追踪：** Step 6 完成 → STEP_DONE + CLEANUP
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index 6 --step-name "保存+汇报总结"
> node scripts/skill-exec-manager.cjs cleanup $sid --result completed
> ```

---

---

## 🔴 dispatch OpenCode 规则

### 通用规则

详见 `opencode-schedule/SKILL.md`，bot 只写 brief + dispatch，不手动改代码/跑命令。

### E2E 回归专用规则

| 类型 | 模型 | 说明 |
|------|------|------|
| 跑 E2E 回归（用 run-regression.cjs）| `opencode-go/deepseek-v4-flash` | 一次 dispatch 跑完所有场景 + 自动修复 + 重跑 |
| 写 BDD 集成测试 | `opencode-go/deepseek-v4-flash` | 简单任务一刀切 |

### 注意

- brief 末尾必须写「不需要代码审核，代码审核是单独步骤」
- run-regression.cjs 参数参考：`node run-regression.cjs --help`（查看完整参数列表）

---

## 调用入口

| 场景 | 触发方式 |
|------|----------|
| gts-dev-workflow Step 2.5 | 自动调用，Step 0 通过 context 传入模式 |
| gts-e2e-auto 回归阶段 | 自动调用，全自动模式，但 Step 1 仍然正常询问环境/场景 |
| 兄弟说「跑回归」 | ✅ 直接跑默认值，进入 Step 1，不经过 Step 0 |
| 兄弟说「全自动跑回归」 | ✅ 全自动模式 + 进入 Step 0（确认模式）→ Step 1（选环境/场景） |
| 兄弟说「检查回归覆盖」 | 只执行 Step 4 |
| 兄弟说「跑 SCF 回归」 | ✅ 直接跑，env=scf，跳过 Step 1 询问 |

---

## 与其它 skill 的关系

| Skill | 关系 |
|-------|------|
| gts-integration-regression | 互补，本 skill 发现 E2E 失败涉及代码逻辑 → 调用 `gts-integration-regression` 验证集成测试层 |
| gts-dev-workflow | 上游，Step 2.5 自动调用本 skill |
| gts-e2e-test | 兄弟手动选场景测试，不走回归 |
| gts-e2e-auto | 全自动验收流程，回归阶段调用本 skill |
| gts-save-flow | submit 前检查回归是否通过 |
| gts-submit-save | Step 6 调用来保存 + 汇报总结 + 通知 |
| gts-deploy | 部署前触发本 skill（--env scf / --env preproduction） |
| gts-service | Step 2 检查失败时调用来启动服务 |
| gts-auto | Step 0 选全自动后，自动修复逻辑引用 gts-auto 模式规则（模型分级、自验证链、停止条件） |
