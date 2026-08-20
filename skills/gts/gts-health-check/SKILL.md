---
name: "gts-health-check"
description: "编译检查 → 集成测试回归 → 全量BDD+E2E → specs一致性+预存错误检查 (所有测试走OpenCode)"
---

# gts-health-check — 项目健康检查

> 兄弟说「健康检查」「代码检查」「health check」「全面检查」时触发。

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

本 skill 的执行状态追踪使用以下 **5 步序列**，对应工作流中的关键断点/恢复点：

```
步骤序列（5 步）：
  1: 编译检查（tsc + rescript build）
  2: 核心流程集成测试回归（调 gts-integration-regression，OpenCode 一次会话）
  3: 全量 BDD + E2E general 场景（合并为一次 OpenCode 会话）
  4: Specs 一致性 + 预存错误检查 + 报告
  R: 技能反思（调用 gts-skill-reflect，CLEANUP 后执行，不阻塞 CHECK 恢复）
```

### INIT（skill 触发时第一时间执行）

```powershell
# 1. 获取/生成 session ID 和 workflow ID
$sid = node scripts/skill-exec-manager.cjs get-session-id | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
$wid = node scripts/skill-exec-manager.cjs get-workflow-id $sid | ConvertFrom-Json | Select-Object -ExpandProperty workflowId

# 2. 同任务预检（dispatch 前查 OpenCode DB 确认无「相同任务」活跃 session；不同任务直接并行，全局 dispatch 锁已废弃 2026-08-01）
# 3. stateInit + issueCreate + registryRegister
node scripts/skill-exec-manager.cjs init $sid $wid "gts-health-check" `
  --steps 1,2,3,4,R `
  --summary "<检查范围>" `
  --criteria "<全部通过标准>" `
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
  "skillName": "gts-health-check",
  "sessionId": "<自动获取或生成>",
  "workflowId": "wf_<timestamp>_<random8>",
  "totalSteps": 5,
  "stepSequence": ["1", "2", "3", "4", "R"],
  "completedSteps": [],
  "remainingSteps": [
    {"index": "1", "name": "编译检查（tsc + rescript build）"},
    {"index": "2", "name": "核心流程集成测试回归（调 gts-integration-regression）"},
    {"index": "3", "name": "全量 BDD + E2E general 场景"},
    {"index": "4", "name": "Specs 一致性 + 预存错误检查 + 报告"},
    {"index": "R", "name": "技能反思（调用 gts-skill-reflect）"}
  ],
  "completedCount": 0,
  "context": {
    "featureSummary": "<检查范围>",
    "verificationCriteria": "<全部通过标准>"
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

#### 标准恢复模板

```
🤖 检测到未完成的工作流：gts-health-check

   已完成（{n}/{total}）:
     ✅ 1: 编译检查（tsc + rescript build）
     ✅ 2: 核心流程集成测试回归

   剩余步骤（{m}/{total}）:
     📋 3: 全量 BDD + E2E general 场景
     📋 4: Specs 一致性 + 预存错误检查 + 报告
     📋 R: 技能反思（调用 gts-skill-reflect）

   最后更新：{相对时间}

   🔜 即将执行下一步 Step 3
   （如需跳过、调整或放弃，请现在告知）
```

#### 长时间中断恢复模板

```
🤖 检测到 {duration} 前中断的工作流：gts-health-check

   上下文：
     featureSummary: <之前记录的内容>
     verificationCriteria: <之前记录的内容>

   已完成（{n}/{total}）:
     ✅ 1: 编译检查（tsc + rescript build）

   剩余步骤（{m}/{total}）:
     📋 2: 核心流程集成测试回归
     📋 3: 全量 BDD + E2E general 场景
     📋 4: Specs 一致性 + 预存错误检查 + 报告
     📋 R: 技能反思（调用 gts-skill-reflect）

   🔜 即将执行下一步 Step 2
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

### ⚠️ 嵌套调用规则

当本 skill 被其他 skill（如 `gts-code-review`）流程中调用时：
- **由调用方管理状态文件**，本 skill 不执行 INIT/STEP_DONE/CLEANUP
- 仅在**独立触发**时（兄弟直接说「健康检查」「health check」）初始化自己的状态追踪

**判断方式**：执行任何步骤前读取 `.skill-exec-state.<sessionId>.json`。如果文件存在且 `skillName` 不是 `"gts-health-check"` → 视为嵌套调用，跳过所有状态文件操作。

**反思规则**：

| 场景 | 反思 | pitfalls 记录 |
|------|------|--------------|
| **独立触发**（兄弟说「健康检查」） | ✅ Step R 执行 gts-skill-reflect | 记到自己的 issue |
| **嵌套调用**（被 gts-code-review 等调用） | ❌ 跳过反思 | 用**调用方 sessionId** 执行 `append-pitfall`，记到顶层 issue |

> 嵌套时反思由顶层 skill 统一执行，本 skill 不重复反思。

---

## 概述

本 skill 对 GTS-Play 项目进行全面的健康检查，依次合并为以下 4 步，尽量减少 OpenCode 调度次数：

| # | 检查项 | 说明 | 调度类型 |
|---|--------|------|---------|
| 1 | 编译检查 ✅ | room-service tsc、match-service tsc、frontend-multiplayer tsc --noEmit、logic rescript build | OpenCode Flash 一次会话 |
| 2 | 核心流程集成测试回归 🎮 | 调 `gts-integration-regression` skill 跑全部跨模块集成测试 | OpenCode Flash 一次会话 |
| 3 | 全量 BDD + E2E general 📋🧪 | 一次 OpenCode 会话跑全部 BDD + 列出 E2E 场景供选择 | OpenCode Flash 一次会话 |
| 4 | Specs 一致性 + 预存错误检查 🔍❌ | 最后汇总步骤，bot 直接执行（不需 OpenCode） | 无需调度 |

---

## 前置要求

- 本地服务已启动（room-service + match-service + webpack-dev-server）
- OpenCode Web UI 已运行（`opencode web`）
- 项目在 `D:\Github\GTS-Play`

---

## 执行流程

### 🔴 纪律：所有测试运行全部走 OpenCode，bot 禁止手动跑 jest/tsc/e2e-runner

> 核心规则：
> - 编译检查、BDD 测试、集成测试回归、E2E 运行 → **全部调度 OpenCode Flash** 执行
> - bot 只做：写 brief → dispatch → poll 结果 → 汇总报告
> - Bot 直接做的（不需 OpenCode）：Specs 一致性核对（读文件对比）、预存错误扫描（Select-String）、报告生成

### 🔴 合并策略：同类工作合并为一次 OpenCode 会话

> 每步的 OpenCode 会话中尽可能合并多个检查项：
> - Step 2：跑全部 `test/integration/` 下的集成测试（一个 npx jest 命令完成全部）
> - Step 3：跑全部 BDD + 列出 E2E 场景（一个 OpenCode 会话中先跑 BDD 再读目录）
> - 减少 OpenCode 调度次数 → 减少 token 消耗 + 加快检查速度

---

### Step 1：编译检查

> 🔄 **调度 OpenCode Flash** 执行 4 项编译检查并汇报结果：
> 1. room-service `npx tsc --noEmit`
> 2. match-service `npx tsc --noEmit`
> 3. frontend-multiplayer `npx tsc --noEmit`
> 4. logic `npx rescript build`（如有）
> OpenCode 输出摘要，只报告是否存在错误。
> **必须 poll**：dispatch 后持续 poll 等待 OpenCode 完成并输出报告（参考 `opencode-schedule/SKILL.md` 4️⃣ Poll 步骤，30s timeout）。

#### 🔴 Post-poll 绑定

```powershell
$sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
node scripts/skill-exec-manager.cjs step-done $sid --step-index 1 --step-name "编译检查（tsc + rescript build）"
```

---

### Step 2：核心流程集成测试回归

> 🔄 **调用 `gts-integration-regression` skill**，一次 OpenCode 会话跑全部跨模块集成测试。

#### 执行步骤

1. **不询问确认**：健康检查场景下直接跑集成测试回归，不问「要不要跑」
2. **读 `gts-integration-regression/SKILL.md`** 确认当前测试目录和运行命令
3. **调度 OpenCode Flash** 一次会话跑完 `test/integration/` 全部 `.feature`：
   - 运行命令：`cd D:\Github\GTS-Play && npx jest --config test/integration/jest.config.js --no-cache --forceExit --verbose`
   - OpenCode 输出汇总表：每个目录/模块的通过状态
4. **poll 结果**：30s timeout，读取最后 10 行获取汇总
5. **结果写入健康报告**：通过的模块 ✅ / 失败的模块 ❌

> 如果集成测试回归发现失败 → 按 TDD 纪律在同一 OpenCode 会话中修复（RED→GREEN），不拆成单独的 fix 步骤。

#### 🔴 Post-poll 绑定

```powershell
$sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
node scripts/skill-exec-manager.cjs step-done $sid --step-index 2 --step-name "核心流程集成测试回归"
```

---

### Step 3：全量 BDD + E2E general 场景（合并为一次 OpenCode 会话）

> 🔄 **调度一次 OpenCode Flash**，完成以下两件事：
> 1. 跑全部非集成 BDD 测试（room-service、frontend-multiplayer 等包各自的 BDD）
> 2. 读取 `packages/frontend-multiplayer/test/e2e/scenarios/general/*.json` 列出 E2E 场景

#### 调度 brief 模板

```markdown
## 执行内容（合并，不分步）

### 1. 跑全部 BDD 测试
- 运行：`cd packages/room-service && npx jest --config jest.config.js --no-cache --verbose`
- 也运行：`cd packages/frontend-multiplayer && npx jest --config jest.config.js --no-cache --verbose`
- 输出摘要表格给结果：通过/失败/总个数

### 2. 列出可用的 E2E general 场景
- 读取 `packages/frontend-multiplayer/test/e2e/scenarios/general/*.json` 目录
- 输出带序号的列表给健康报告

### 要求
- 不提问，直接执行
- 不需要 E2E 运行，只需要列出
- 不需要代码审核或修改
```

#### poll + 结果处理

OpenCode 输出中提取：
- BDD 通过数/失败数
- E2E 场景列表

将 E2E 场景列表呈现给兄弟，等兄弟选择再跑（见下面 E2E 运行子步骤）。

#### 🔴 兄弟选择 E2E 场景后 — 另调度一次 OpenCode 运行

等兄弟回复选号后，调度新的 OpenCode Flash 会话运行所选场景：

```markdown
## 运行 E2E 场景

- 场景文件：scenarios/general/<场景名>.json
- 运行命令：`cd packages/frontend-multiplayer/test/e2e && node e2e-runner.cjs scenarios/general/<場景名>.json`
- 输出报错信息即可，不需要过多解释
```

#### 🔴 Post-poll 绑定

```powershell
$sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
node scripts/skill-exec-manager.cjs step-done $sid --step-index 3 --step-name "全量 BDD + E2E general 场景"
```

---

### Step 4：Specs 一致性 + 预存错误检查 + 报告（bot 直接执行，不调 OpenCode）

#### 4a. Specs 与测试一致性

检查 `笔记/项目文档/specs/` 下的 `.md` 文件是否与对应的测试文件保持同步：

1. 读取 specs 目录下的每个 `.md` 文件，提取其中的**行为契约**（通常是 `###` 或 `- ✅` 格式的条款）
2. 查找对应的 `.feature` 文件（`room-service/test/features/`、`frontend-multiplayer/test/features/`）
3. 对比 specs 中的行为条款是否都有对应的 Scenario
4. 输出不一致项

**判断标准：**
- Specs 中有但测试中没有 → 🟡 测试遗漏
- 测试中有但 specs 中没有 → 🟡 specs 未更新（需要补充）
- 一致 → ✅

**输出格式：**
```
### Specs 一致性检查

| Spec 文件 | 行为条款数 | 覆盖 Scenario 数 | 缺失条款 | 状态 |
|-----------|-----------|-----------------|---------|------|
| collision.md | 5 | 3 | 边界碰撞、多层碰撞 | 🟡 |
| room-service.md | 8 | 8 | 无 | ✅ |
```

#### 4b. 预存错误检查

扫描代码库中是否存在以下标记（bot 直接执行，不调 OpenCode）：

```powershell
cd D:\Github\GTS-Play
Select-String -Path "packages/**/*.{ts,res,js}" -Pattern "TODO.*FIX|FIXME|HACK|XXX|\[DIAG:" -CaseSensitive:$false -SimpleMatch:$false | Select-Object FileName, LineNumber, Line | Select-Object -First 20
```

**Token 纪律：** 用单次 Select-String 合并多 pattern，一次跑完。只取前 20 条。

#### 4c. 输出健康报告

按以下模板输出完整报告：

```
# GTS-Play 健康报告 — <日期>

## 发现的问题

### 🟡 中等问题

（Step 4a specs 不一致项）

### 🟢 轻微问题

（Step 4b 预存错误）

## Step by Step 结果

### 1️⃣ 编译检查
- room-service tsc: ✅ / ❌
- match-service tsc: ✅ / ❌
- frontend-multiplayer tsc: ✅ / ❌
- logic rescript: ✅ / ❌

### 2️⃣ 核心流程集成测试回归
- 通过 N 个 | 失败 N 个
- 测试覆盖模块：[列表]

### 3️⃣ 全量 BDD
- room-service BDD: N 通过 / M 失败
- frontend-multiplayer BDD: N 通过 / M 失败

### 3️⃣ E2E 场景（待兄弟选择）
- 可用场景：[列表]

## 总计

- 🟡 中等问题：N 个
- 🟢 轻微问题：N 个
- ✅ 编译检查：全部通过
- ✅ 核心流程：N 模块全绿
- ✅ BDD：全部通过

🏁 总体状态：✅ 健康 / ⚠️ 需关注 / ❌ 不健康
```

#### 🔴 Post-poll 绑定

```powershell
$sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
node scripts/skill-exec-manager.cjs step-done $sid --step-index 4 --step-name "Specs 一致性 + 预存错误检查 + 报告"
# 最后一步 → cleanup
node scripts/skill-exec-manager.cjs cleanup $sid --result completed
```

### Step R：技能反思（仅独立触发时）

嵌套调用时**跳过本步骤**，直接输出报告。

独立触发时，调用 gts-skill-reflect：

```
走 skills/gts-skill-reflect/SKILL.md 流程（收集 pitfalls + 执行指标 + 记忆检索 → 分析 → 报告 → 等兄弟确认）
```

> 反思产出改进建议，**等兄弟确认后才执行**（skill_workshop），不自动改 skill。
> 反思不阻塞报告输出；反思完成后发双通道通知。

---

## 报告格式

检查完成后输出统一格式的健康报告。

报告结构：按严重程度列出所有发现的**问题**，然后列出**已确认正常的路径**。

### 报告结构

```
# GTS-Play 健康报告 — <日期>

## 发现的问题

### 🔴 严重问题
| 位置 | 问题描述 | 根因 | 修复建议 |
|------|---------|------|---------|

### 🟡 中等问题
| 位置 | 问题描述 | 根因 | 修复建议 |
|------|---------|------|---------|

### 🟢 轻微问题
| 位置 | 问题描述 | 根因 | 修复建议 |
|------|---------|------|---------|

## 已确认正常的路径

列出所有检查项中确认无问题的内容：

- ✅ 编译：room-service tsc、match-service tsc、frontend-multiplayer tsc --noEmit、logic rescript build
- ✅ BDD：room-service 32 feature、frontend-multiplayer 16 feature（全部通过）
- ✅ Specs：room-service.md（8 行为契约全部覆盖）
- ✅ 游戏流程：创建→加入→准备→开始→退出 代码路径完整
- ✅ 预存错误：无 TODO:FIX / DIAG 残留

## 总计

- 🔴 严重问题：N 个
- 🟡 中等问题：N 个
- 🟢 轻微问题：N 个
- ✅ 已确认正常：N 项

🏁 总体状态：✅ 健康 / ⚠️ 需关注 / ❌ 不健康
```

### 问题分级标准

| 级别 | 说明 | 典型场景 |
|------|------|---------|
| 🔴 严重 | 影响线上用户体验，或功能不可用 | 编译失败、核心流程代码不存在、BDD 大规模挂掉 |
| 🟡 中等 | 有潜在风险，但当前不影响核心功能 | 缺少 BDD 测试覆盖、checklist 过时、小范围 specs 遗漏 |
| 🟢 轻微 | 代码质量/可维护性问题，不影响功能 | 残留 TODO、console.error 在非关键路径、文档格式问题 |

---

## 游戏流程文档维护

### 更新时机

每次以下操作后必须更新 `笔记/项目文档/knowledge/game-flow-checklist.md`：
- 新增游戏流程（如新玩法、新交互模式）
- 修改现有流程（如 UI 调整、交互方式变更）
- 修复游戏流程 bug 后
- 新增 E2E general 场景后

### 更新规则

1. 检查 `笔记/项目文档/knowledge/game-flow-checklist.md` 是否覆盖本次改动涉及的流程
2. 如未覆盖 → 新增条目
3. 如已有但过时 → 更新
4. 同时更新对应的代码路径记录和 BDD 覆盖信息

---

## 🔴 纪律

- **所有测试运行全部走 OpenCode Flash 调度，bot 禁止手动跑 jest/tsc/e2e-runner**
- **Step 3（E2E general）必须等兄弟回复选场景，再另调度一次 OpenCode 运行**
- **同类检查合并为一次 OpenCode 会话，减少调度次数**
- **报告必须按分级问题格式输出**
- **每个问题必须标注：位置、描述、根因、修复建议**
- **正常路径也要列出，确认了哪些就写哪些**
- **每次健康检查后更新 `memory/` 中的检查记录**

---

## 📊 全流程 Token 优化速查

| 步骤 | 耗 token 动作 | 优化方案 | 预期节省 |
|------|-------------|---------|--------|
| Step 1 编译检查 | 3 个 tsc + 1 个 rescript build | 调度一次 OpenCode 完成全部 4 项编译检查；poll 时只读最后 15 行 | ~500-2000 |
| Step 2 集成回归 | Jest 完整输出（可能数千行） | 调度一次 OpenCode 跑完所有集成测试；poll 时只读 `Tests:` 汇总行 + 失败的场景名 | ~3000+ |
| Step 3 BDD + E2E 场景 | BDD 输出 + 目录读 | 合并为一次 OpenCode 会话（一次调度 token 省一半）；BDD 输出只读 `Tests:` 汇总行；E2E 列表只读文件名 | ~2000-4000 |
| Step 4 预存错误 | 扫描全仓 | 用单次 `Select-String -Pattern "TODO.*FIX|FIXME|HACK|XXX|\[DIAG:"` 合并所有 pattern；只取前 20 条 | ~500 |

### 通用原则

1. **`Select-Object -First N` 是防超载兜底** — 所有命令输出都要截断
2. **不要加载完整 BDD/Jest 测试输出** — 只要 `Tests: N passed, 0 failed` 这一行
3. **不要加载未改动文件的代码** — 检查流程只需要确认文件存在、路径完整，不需要读文件内容
4. **合并 pattern 搜索** — 用 `-Pattern` 带 | 合并多个搜索模式，不分开跑
5. **合并 OpenCode 调度** — 同类工作合并为一次 dispatch，减少调度数也减少 context token
