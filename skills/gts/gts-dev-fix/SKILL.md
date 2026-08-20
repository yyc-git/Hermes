---
name: "gts-dev-fix"
description: "修复 skill: brief Step B 禁止 _simulate*; Step C 嵌入完整审核清单; Step G 独立步骤+完整重构规则引用"
---

# gts-dev-fix — Bug 修复（fix: 触发入口）

> 兄弟对话以 `fix:` 开头时 → 进入本 skill。
> 作为 fix 的单一入口，再委托 gts-dev-workflow 实现。
> **gts-dev-workflow 中不再侦听 fix:**，避免冲突。

---

## 🔴 状态追踪（全局）

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

本 skill 的执行状态追踪使用以下 **6 步序列**，对应工作流中的关键断点/恢复点：

```
步骤序列（6 步）：
  P0: 设计验收（含 E2E 场景设计 + 确认 + 检查 + 运行复现）
  B1: 出方案 + 根因分析（OpenCode Pro）+ 确认方案
  B2: 实现 + 集成测试（OpenCode Flash）
  C: 验收流程（含审核→测试→部署）
  M: 手动验证（交互式 checkpoint，仅普通模式）
      M-1: 询问测试环境（本地开发服务器/CloudBase预发/CloudBase正式）
      M-0: 明确宣布进入 M 阶段（必须说「进入 M 阶段」）
      M-1: 询问测试环境（本地开发服务器/CloudBase预发/CloudBase正式）
      M-2: 准备环境（启动服务 / 确认部署状态）
      M-3: 兄弟手动验证
            - 发现 bug → 宣布发起子 fix + 描述问题 + 等兄弟确认，再 dispatch OpenCode 修
            - 不确定的 bug（根因不清/影响不明）→ 询问兄弟「是否继续排查？」
            - 新需求/功能 → 询问兄弟「是否发起子 feat？」
      M-4: 完成 → 结束
  R: 技能反思（调用 gts-skill-reflect，CLEANUP 后、保存前执行）
  S: 保存（gts-submit-save，最后一步，通知前）
```
> **v6 修正**（2026-07-30）：M-3 改为必须宣布「发起子 fix」+ 等确认；M-0 新增明确宣布入口；auto 模式退出条件：dispatch 后兄弟交互 2 轮以上视为退出 auto、恢复 M。
>
> **v7 修正**（2026-07-31）：M-2 通知增加序号提示模板；M-3 改为序号触发（`1：<问题描述>`）。完整方案见 `笔记/项目文档/changes/2026-07-28-manual-test-checkpoint/solution.md` v4。

### INIT（skill 触发时第一时间执行）

```powershell
# 1. 获取/生成 session ID 和 workflow ID
$sid = node scripts/skill-exec-manager.cjs get-session-id | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
$wid = node scripts/skill-exec-manager.cjs get-workflow-id $sid | ConvertFrom-Json | Select-Object -ExpandProperty workflowId

# 2. 同任务预检（dispatch 前查 OpenCode DB 确认无「相同任务」活跃 session；不同任务直接并行，全局 dispatch 锁已废弃 2026-08-01）
# 3. stateInit + issueCreate + registryRegister
node scripts/skill-exec-manager.cjs init $sid $wid "gts-dev-fix" `
  --steps P0,B1,B2,C,M,R `
  --summary "<fix 摘要>" `
  --criteria "<验收标准>" `
  --specs "<关联 specs 路径，逗号分隔，可省略>"
```

### 生命周期操作

所有操作统一通过 `scripts/skill-exec-manager.cjs` CLI 入口执行。

| 操作 | 时机 | CLI 命令 |
|------|------|---------|
| **INIT** | (见上方 INIT 段落) | 同上 |
| **STEP_DONE** | 每完成一个子步骤后 | `node scripts/skill-exec-manager.cjs step-done <sessionId> --step-index <索引> --step-name "<步骤名>" [--files "..."]` |
| **CHECK** | 每次收到用户消息后 | `node scripts/skill-exec-manager.cjs check <sessionId>` |
| **CLEANUP** | 所有步骤完成后 | `node scripts/skill-exec-manager.cjs cleanup <sessionId> --result completed` |
| **ABORT** | 放弃工作流 | `node scripts/skill-exec-manager.cjs abort <sessionId> [--reason "<原因>"]` |

> **Session ID**：`node scripts/skill-exec-manager.cjs get-session-id`（优先 `OPENCLAW_SESSION_ID` 环境变量）
> **Workflow ID**：`node scripts/skill-exec-manager.cjs get-workflow-id [<sessionId>]`

### 初始化格式

技能启动时自动创建（INIT）：

```json
{
  "schemaVersion": "1",
  "skillName": "gts-dev-fix",
  "owner": "openclaw",
  "totalSteps": 5,
  "stepSequence": ["P0", "B1", "B2", "C"],
  "completedSteps": [],
  "remainingSteps": [
    {"index": "P0", "name": "设计验收（含 E2E 场景设计 + 确认 + 检查 + 运行复现）"},
    {"index": "B1", "name": "出方案 + 根因分析（OpenCode Pro）+ 确认方案"},
    {"index": "B2", "name": "实现 + 集成测试（OpenCode Flash）"},
    {"index": "C", "name": "验收流程（自动进入，含审核→测试→部署→保存）"}
  ],
  "context": {
    "featureSummary": "<一句话描述本次fix任务>",
    "verificationCriteria": "<关键验收标准>",
    "briefPath": "<brief 文件路径>"
  },
  "startedAt": "<UTC 时间>",
  "lastUpdatedAt": "<UTC 时间>"
}
```

补充字段（可选，视需要设置）：
- `instanceLabel`：用于区分同一 skill 的多个实例
- `lastCheckpoint`：可选检查点标记，如 `waiting-user-confirm`、`waiting-manual-test`
- `context`：可选的上下文信息（不含代码正文和敏感信息）
  - `featureSummary`：功能概要（一句话描述本次任务）
  - `verificationCriteria`：验收标准（关键验收点）
  - `branch`、`issueId`、`notes`、`briefPath`、`modifiedFiles` 等

### 恢复交互模板

#### 标准恢复模板

```
🤖 检测到未完成的工作流：gts-dev-fix

   已完成（{n}/{total}）:
     ✅ P0: 设计验收
     ✅ B1: 出方案 + 根因分析

   剩余步骤（{m}/{total}）:
     📋 B2: 实现 + 集成测试（OpenCode Flash）
     📋 C: 验收流程（自动进入）

   最后更新：{相对时间}（检查点：{lastCheckpoint}）

   🔜 即将执行下一步 B2
   （如需跳过、调整或放弃，请现在告知）
```

#### 长时间中断恢复模板

```
🤖 检测到 {duration} 前中断的工作流：gts-dev-fix

   实例：{instanceLabel}
   进度：{n}/{total} 已完成

   剩余步骤：
     📋 B2: 实现 + 集成测试（OpenCode Flash）
     📋 C: 验收流程（自动进入）

   上次中断在 {checkpoint} 阶段。
   🔜 正在恢复执行接下来的步骤
```

#### 冲突提示模板

```
🤖 ⚠️ 检测到已有未完成的 gts-dev-fix 工作流（{n}/{total}）

   要放弃它，开始新的任务吗？
   选项：
   A) 放弃旧任务，开始新工作流
   B) 先完成旧任务，再做新任务
   （旧工作流已超过 24h → ⚠️ 请确认是否仍在进行）
```

### 故障处理

| 场景 | 处理方式 |
|------|----------|
| 文件不存在 | 正常 → 无未完成 workflow，继续执行 |
| JSON 解析失败 | 展示原始内容给兄弟，手动决定恢复或删除 |
| remainingSteps 为空但文件未清理 | 自动识别为完成，执行 CLEANUP |
| 文件被锁定 | 重试 3 次（间隔 1s），仍失败则告知兄弟手动删除 |
| 文件超过 1KB | UPDATE 时截断可选字段（context 优先），保留核心标识和剩余步骤 |

### 手动命令

兄弟可通过自然语言管理状态：

| 兄弟说的 | 行为 |
|----------|------|
| "查看当前进度" | READ + 展示完整状态 |
| "跳过这个步骤" | UPDATE（将该步直接移到 completed，不执行） |
| "重新执行上一步" | 回退最近一个 completedStep 到 remainingSteps |
| "放弃这个工作流" | ABORT（删除状态文件） |

---

## 🔴🔴🔴★ 核心原则：所有代码操作必须调度 OpenCode（最高优先级）

**这是铁律，不是建议。违反一次就必须补 Skill 修订。**

本 skill 涉及的所有代码相关操作 — **代码修改、测试运行、编译检查、静态分析、
测试文件创建/修改、E2E 场景创建/修改** — **均不得由 bot 直接执行**，
必须编写 brief 调度 OpenCode（Pro / Flash）执行。

bot 在本 skill 中只负责：写 brief → dispatch → 验证输出 → git 操作 → 部署。

### 🔴 验证结果循环

OpenCode 跑完后，bot 只能 **阅读输出结果**，**不能直接动手修**。

```
OpenCode 完成 → bot 读结果
  ├─ 全绿 ✅ → 继续下一步
  └─ 有失败 ❌ → 分析失败原因 → 写新 brief（含失败详情+原因）→ 调度 OpenCode 修
       └─ 再读结果 → 循环直到全绿
```

### 🔄 规格同步检查（修复完成后、验收通过前必做，2026-08-05 新增）

> 与「E2E 后更新 E2E-OPERATIONS.md」同级别纪律（知乎调研落地项 P3）。

1. **对比**：本次改动的 Delta Specs（`笔记/项目文档/changes/<日期>-<功能名>/specs/` 的 README/.feature/expected-state）与最终代码行为
2. **不一致时分类处理**：
   - 实现比 spec 多 → 回写 spec 补充（注明「实现补充」）
   - 实现比 spec 少 / 行为不同 → 🟡 判断：是 bug 还是 spec 过时？bug → 回 OpenCode 修；spec 过时 → 更新 spec
3. **expected-state JSON 一并同步**（验收断言以最终版为准）
4. **同步完成才允许标记 issue completed**
5. 无 Delta Specs 的改动 → 跳过（仅在 issue 记录「无 specs 需同步」）

### 🔴🔴 禁止事项清单

1. ❌ 不手动改 `.ts`/`.tsx`/`.res`/`.js`/`.scss`/`.feature`/`.steps.ts` 文件
2. ❌ 不手动跑 `jest`/`tsc`/`webpack`
3. ❌ 读到编译/测试错误后，不分析完就推测原因
4. ❌ 以「只是修测试文件」为理由手动改代码

### ✅ 仅允许的事项

1. ✅ 读 OpenCode 输出结果、定位失败点
2. ✅ 分析失败原因（写 brief 时附上）
3. ✅ 写 brief、调度 OpenCode
4. ✅ git 操作（add/commit/push/status/log/diff）
5. ✅ 部署
6. ✅ 通知兄弟

> 违反后果：跳流程、漏改漏测、浪费时间。

---

## 🔴🔴🔴 Phase 0：设计验收（fix 开始前先做）

每次 fix 之前，必须先设计专门的 E2E 自动验收场景和集成测试。

> 🔴 **bot 的角色**：需要 Phase 0 时，bot 只做**初步判断根因方向**（快速定位可疑模块/代码路径，不深入 trace、不追根到底）——**目的是知道诊断日志打哪里**，在 E2E 中复现并定位根因。最终根因分析结论由 OpenCode Pro 给出（Phase B Step 1）。

### 何时跳过 Phase 0（无需 E2E 验收）

> 🔴 **单机项目（packages/frontend）fix 不默认跳过 Phase 0**（2026-08-03 兄弟定稿）——单机版已有手动 E2E 基础设施（`packages/frontend/test/e2e/`，dev-server 7093），可设计 E2E 场景复现/验收，走 **gts-e2e-test 单机分支**（bot 启动 dev-server + runner，兄弟手动操作）。

以下情况**无需 Phase 0（E2E 验收）**，直接进入 Phase B：
- 纯配置/文档/样式/国际化文案修复（不涉及运行时行为验证）
- 简单逻辑修复，不需要 UI/E2E 行为验证
- 兄弟明确说「不需要 e2e / 不用 e2e 验收 / 直接修」

**跳过 Phase 0 时：**
- 🔴 **bot 不自己分析根因**（不问兄弟加日志、不 trace 代码路径推断）
- 🔴 先**分析要修复的内容**（基于 bug 描述梳理修复范围/涉及点）→ **展示给兄弟确认明确的修复内容**（兄弟描述可能不清楚，需进一步确认）
- 🔴 确认后 → 进入 **Phase B Step 1**，调度 **OpenCode Pro** 出方案——**根因分析由 OpenCode 负责**（基于 bug 描述 + 代码上下文 + 已确认的修复内容）
- 步骤序列跳过 P0：`--steps B1,B2,C,M,R`

### Step 0.1：设计 E2E 自动验收场景（操作步骤 + 诊断日志）

**🔴 先查操作手册：** 查阅对应项目的 E2E-OPERATIONS.md，
找现成的操作积木（block），用积木组合出验收场景，不从头写原始 blocks。

- 多人版（frontend-multiplayer）：`packages/frontend-multiplayer/test/e2e/E2E-OPERATIONS.md`
- 单机版（frontend）：`packages/frontend/test/e2e/E2E-OPERATIONS.md`

> 🔴 **单机版 fix 也走 Phase 0**（不默认跳过）：单机版有手动 E2E 基础设施（gts-e2e-test 单机分支），设计 E2E 场景 → 启动 dev-server (7093) + runner → 兄弟手动操作复现 bug。

根据兄弟报告的 bug，设计纯用户操作流程复现它，**并在关键路径插入诊断日志用于定位根因**。

**诊断日志设计原则：**
- 在 E2E 场景的关键路径插入诊断日志，用于确认失败模式
- 不只是看到报错，要能看到**失败的上下文和条件**（如关键变量值、状态流转）
- 优先用 E2E blocks 诊断（`enableLogging`、`evaluate`、`scfLogs`、`saveLogs`），零部署
- 只有需要看服务端内部逻辑时，才改 .ts 源码加 `[DIAG:xxx]` 日志
- 本步只**设计**诊断日志方案（日志放什么位置、打什么变量），不实际调度 OpenCode

格式要求：

```
场景名称：<bug 复现场景>

诊断日志方案：
- <添加位置>：<日志内容>（打印 <关键变量>）
- <添加位置>：<日志内容>（打印 <关键变量>）

复现步骤：
1. <操作复现 step-by-step>
实际行为（bug）：
- ❌ <错误行为>
预期行为（修复后）：
- ✅ <正确行为>
验收标准：
- ✅ <可验证的修复结果>
```

### Step 0.2：与我确认

将设计好的操作步骤展示给我，问：

| 项目 | 内容 |
|------|------|
| 场景名称 | <场景名称> |
| 复现步骤 | <step-by-step> |
| 实际行为(bug) | ❌ <错误行为> |
| 预期行为(修复后) | ✅ <正确行为> |
| 验收标准 | ✅ <标准1>, ✅ <标准2> |

OK 吗？需要调整吗？

等我的回答。我说「OK」才继续。

**我可能调整步骤或验收标准**，按我确认的版本为准。

### Step 0.3：检查 E2E 符合验收标准

检查设计的 E2E 是否满足以下验收标准（逐条验证）：

| # | 检查项 | 说明 |
|---|--------|------|
| 1 | 行为验证 ✅ | E2E 的 evaluate/assert 块必须断言核心行为正确（修复后行为正确，不只是无报错） |
| 2 | 用户可见 ✅ | 验证的是用户能感知的结果（位置变化、UI 变化、状态变化），不是内部变量 |
| 3 | 可复现 ✅ | 步骤清晰、无歧义、有明确等待和超时 |
| 4 | 截图消费 ✅ | 步骤中包含至少一个 screenshot 块供人眼验证 |
| 5 | 环境一致 ✅ | 与真实使用环境对标（headful/keydown 等） |
| 6 | 符合 Specs ✅ | 验收标准匹配 `笔记/项目文档/specs/` 中的 Main Specs 行为契约 |

**为什么需要这步：** 2026-07-15 教训 — 验证「没报错」不等于「行为正确」。

发现不符合的，先修 E2E 设计，修完继续。

*集成测试相关的步骤（设计、编写、检查标准、运行RED）已移至 Phase B Step 2，与实现一起由 OpenCode Flash 完成。*

### Step 0.4：运行 E2E 复现问题 + 收集诊断数据（fix 特供）

**先按 Step 0.1 设计的诊断日志方案，向 E2E scenario JSON 中添加诊断日志 block，保存到 `test/e2e/diagnosis/` 目录（如 `test/e2e/diagnosis/<日期>-<功能名>.json`）。**

> 🔄 **运行 E2E 复现问题并收集诊断数据**（SCF 日志、E2E 日志、截图），汇报结果和诊断数据：
> - **多人版** → 调度 OpenCode 运行（自动 E2E）
> - **单机版** → 走 **gts-e2e-test 单机分支**（手动 E2E：bot 启动 dev-server 7093 + runner，兄弟手动操作，点停止按钮收尾）

**如果 E2E 意外通过了** → E2E 设计有问题（没抓到 bug），回到 Step 0.1 重做。

> 📊 **状态追踪**：Step P0 完成 → STEP_DONE
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index P0 --step-name "设计验收"
> ```

---

## Phase B：实现

委托 **[gts-dev-workflow](skills/gts-dev-workflow/SKILL.md)** 执行：

- **Step 1（出方案 + 根因分析 + Delta Specs + Changes 规格文档）**
  - **有 Phase 0** → 基于 Phase 0 E2E 运行收集的诊断数据 → 调度 **OpenCode Pro** 分析根因 + 产出方案 + Delta Specs
  - **无 Phase 0（跳过 E2E 验收）** → 基于**已与兄弟确认的修复内容**（见「何时跳过 Phase 0」），直接调度 **OpenCode Pro**，brief 中贴 bug 描述 + 相关代码上下文 + 确认的修复内容，**让 OpenCode 自己分析根因** + 产出方案 + Delta Specs（bot 不做预分析）
  - 🔴 OpenCode Pro **必须**将方案文档写入 `笔记/项目文档/changes/<日期>-<功能名>/solution.md`
  - 🔴 Delta Specs 写入 `笔记/项目文档/changes/<日期>-<功能名>/specs/`
  - 🔴 **Expected-state JSON** 写入 `笔记/项目文档/changes/<日期>-<功能名>/specs/expected-state/`，每个 Scenario 一个 JSON 文件，描述 state 转换的预期值（文档用途，非测试运行时断言）
  - 这些 changes specs 将作为 Step 2 集成测试设计的**主要依据之一**

#### 🔴 Step 1 → Step 2 之间：等我确认方案

OpenCode Pro 出方案后，**必须先展示给我确认**，我说「OK」才能进 Step 2。

展示格式：

```
## 根因
<根因摘要>

## 修复方案
<推荐方案说明>

## 方案对比
| 方案 | 说明 | 优点 | 缺点 |
|------|------|------|------|
| A（推荐） | ... | ... | ... |
| B | ... | ... | ... |
| C | ... | ... | ... |
```

问：「方案 OK 吗？进 Step 2 实现？」等我说 OK。

- 我说「OK」→ 进 Step 2
- 我说「不行/改方案」→ 按我说的方向改方案，改完再确认

> 🔴 **dispatch Step 2 前抽查 Delta Specs 一致性**（2026-07-31 新增）：OpenCode Pro 批量写多个 Scenario 的 expected-state 时，同一规则在不同场景可能写出相反期望（如 scenario A 期望去重、scenario B 同规则却期望共存）。进 Step 2 前，bot 快速对比各 expected-state JSON 中**同一规则**的期望是否自洽；发现矛盾 → 以 expected-state JSON 为准修正方案语义，并在 Step 2 brief 中注明裁决结果（例：2026-07-31 论坛通知去重 scenario-2 vs scenario-4，收敛为「只对管理员去重」）

> 📊 **状态追踪**：Step B1 完成 → STEP_DONE
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index B1 --step-name "方案确认"
> ```

- **Step 2（实现 + 集成测试）** — 调度 OpenCode Flash，包含以下子步骤：
  1. **设计集成测试**：根据以下依据设计集成测试：
     - Step 0.1 确认的 E2E 操作步骤
     - 验收标准
     - Step 1 的根因分析
     - 🔴 **changes specs（`笔记/项目文档/changes/<日期>-<功能名>/specs/` 中的 .feature 文件）**
     - 🔴 **测试写入 `<projectRoot>/test/integration/`**（repo 根目录，不是任何单个包内），参见 `笔记/项目文档/rules/test-standards.md` → Layer 3 目录规范
     - 🔴 **跨项目多模块**：因为回归 bug 通常涉及多个模块交互，集成测试必须 import 2+ 项目的真实代码（如 room-service + match-service、nf + room-service、frontend + room-service），只测单个模块 = 测不到跨模块 bug
     - 目录命名：按回归流程命名（如 `multiplayer-flow/`、`match-flow/`、`nf-bridge/`、`frontend/`、`countdown-guard/` 等）
  2. **编写代码**：写集成测试代码（feature + steps，所有断言写在 steps.ts 的 Given/When/Then 中）
  3. **检查标准**：按 `笔记/项目文档/rules/test-standards.md` → **Layer 3（跨项目集成BDD）** 的验收标准逐条检查已写好的测试代码
  4. **运行 RED 🔴**：确认因 bug 存在而真实失败
  5. **修复业务代码**：修复 bug 使测试通过（GREEN ✅）

> Step 2 不包含回归检查、代码审核和手动验证。这三者迁移到 Phase C。

#### 🔴🔴🔴 回归 bug 修复后强制补集成测试（疫苗规则）

每次回归 bug 修复完成 → **必须同步补一个集成测试**，作为「防止同样 bug 再次出现」的疫苗。

**规则：**
- 所有回归 bug 修复（fix: 入口）必须包含对应的集成测试
- 集成测试写入 `test/integration/<相关模块>/`
- 集成测试必须覆盖 bug 的完整触发路径（不 mock 核心逻辑）
- 测试通过 TDD 验证（先因 bug 真实 RED，修复后 GREEN）→ 才算锁定了 bug
- 🔴 违反后果：没锁定 → 下次重构不小心再引入同 bug → 线上再炸一次

**例外：** 纯配置/文档/样式/国际化文案的修复（不涉及运行时逻辑）可不补。兄弟决定。

#### 🔴 测试分层构建时机总览（2026-07-21 新增）

**跨项目集成测试（Layer 3，`test/integration/`）** — 回归 bug 修复后**立即补**（疫苗）：
- 触发：每次回归 bug fix → 同步写跨项目集成测试
- 纯 TS 不依赖运行时，守卫包间协议一致性
- TDD 验证（RED→GREEN）才算锁定 bug

**E2E regression 场景（Layer 4，`test/e2e/scenarios/regression/`）** — 每次修复后 + 提交前**构建并跑**：
- 触发：fix 完成后补 E2E regression 场景
- 提交前运行 E2E 回归门禁（Phase C Step 6）
- 依赖浏览器 + WS + 服务，守卫真实多窗口流程

**两者关系：** 集成测试是开发阶段快速疫苗，E2E regression 是提交前最后门禁。**缺一不可。**

#### 🔴 Phase B Step 2 brief 模板（必须照抄）

```markdown
# 修复：<bug名称>

共享规约见 `docs/agent-context.md`。

## 根因
<粘贴 Step 1 的根因>

## 修复方案
<粘贴 Step 1 的推荐方案>

## Changes Specs（变更规格 — 集成测试依据）
<粘贴 `笔记/项目文档/changes/<日期>-<功能名>/specs/` 中的 .feature 内容>

## 🟢 TDD 流程要求

必须严格按以下顺序执行：

### Step A：设计集成测试
根据 E2E 确认的操作步骤 + 验收标准 + 根因分析 + changes specs，设计集成测试：
- 🔴 **写入 `<projectRoot>/test/integration/`**（repo 根目录，不是任何单个包内），参见 `笔记/项目文档/rules/test-standards.md` → Layer 3 目录规范
- 🔴 **跨项目多模块**：回归 bug 涉及多个模块交互 → 测试必须 import 2+ 项目的真实代码（如 room + match、nf + room、frontend + room）
- 目录命名：按回归流程（`multiplayer-flow/`、`match-flow/`、`nf-bridge/`、`frontend/`、`countdown-guard/` 等）

### Step B：写集成测试代码
写集成测试代码（feature + steps），只写测试，不动业务代码。所有断言直接写在 steps.ts 的 Given/When/Then 中（`expect()`），不依赖外部 JSON 文件。

> Expected-state JSON 属于 changes specs 文档（见 Step 1），不放在 test/ 目录下。

**🔴 禁止创建 `_simulate*` 模拟函数绕过真实代码路径** — 必须直接调用被测试源文件的导出函数。被测试代码是什么，测试就调什么，不封装、不模拟、不简化。

### 🔴 Step C：运行检查标准（逐条打勾，输出 ✅/❌ 结果）— **此步骤不可跳过**

**⚠️ 在 Step C 全部 ✅ 通过前，禁止进入 Step D（RED 测试）。**

**从 `笔记/项目文档/rules/test-standards.md` → Layer 3 验收标准 实时读取检查清单。**

读取后逐条检查已写好的测试代码，**每条都必须输出 ✅ 或 ❌**。

**输出格式（必选）：** 逐条检查并输出结果，保存到输出末尾：
```
[Step-C 检查结果]
- [✅] ...
- [❌] ...（发现问题 → 回到 Step B 修改测试代码，直到全部 ✅）
```

**Step C 全部 ✅ → 进 Step D。有任何 ❌ → 回 Step B 修复测试代码，修完再跑 Step C 重检，直到全 ✅。**

> 🔴 **禁止在 skill 中硬编码检查清单** — 2026-07-22 修订。清单从 `test-standards.md` 实时读取，每次新增/修改规则时无需同步此 skill。

### Step D：运行 RED 🔴
运行集成测试，确认因 bug 真实存在而失败。

### Step E：修复业务代码
实施修复方案，使集成测试通过。

### Step F：运行 GREEN ✅
运行全部 BDD 测试确认全绿。

> 🔴🔴 **全量 jest 关门纪律(2026-08-18 XiaHui fix B2 教训)**:"GREEN" 不是只看"改动相关 suite 全过"就结束——必须跑 **`yarn workspace <pkg> jest`** 全量(覆盖同包所有 suite),确认零失败。**已存在的失败是 pre-existing**(本次任务不归本 PR 修),但**本次改动**造成的失败必须 = 0。验证步骤:
> 1. 改动前先跑全量 jest,记录 baseline 失败清单
> 2. 改完后跑全量 jest
> 3. diff baseline vs 当前,新增失败 = 本 PR 阻塞项,必修
> 4. 不允许"为绿而绿"——**禁止改测试断言让旧算法通过**(实测案例:B2 阶段把 XH-10 picked 断言改成旧公式输出值,旧算法也能绿,失去回归保护;直到 Phase C-r2 才被发现)
> 5. 发现"测试断言陈旧" 需更新断言时,必须用真实业务场景值(如新公式推导值),不允许编造

## 命令

> 🔴 **验证命令必须用 PowerShell 兼容语法（2026-08-01 教训）**：OpenCode 跑在 Windows PowerShell 环境，`grep`、`/dev/null`、`> /dev/null` 会直接报错（`grep: not recognized` / `Could not find a part of the path 'D:\dev\null'`）。
> - 过滤输出用 `Select-String`，不用 `grep`：`npx tsc --noEmit 2>&1 | Select-String "girl/Collision.ts" | Select-String -NotMatch "TS6133|TS6192"`
> - 保存输出用 `Out-File`，不用 `> /dev/null`：`npx tsc --noEmit -p tsconfig.json 2>&1 | Out-File -Encoding utf8 tsc_out.txt`
> - 多步命令用 `;` 连接（如 `cd packages/<目标包>; npx tsc --noEmit 2>&1 | Select-String "xxx"`），不用 `&&` 链
> - `2>&1` 本身在 PowerShell 合法（重定向错误流），可保留；但不能跟 `grep`/`/dev/null` 搭配

- BDD 测试：`npx jest --config jest.config.ts --no-cache packages/room-service/test/ --forceExit --detectOpenHandles 2>&1`
- tsc：`npx tsc --noEmit 2>&1`（?? 在**目标包目录**跑（本次改动涉及的包，如 `packages/frontend` / `packages/room-service` 等），不在仓库根目录跑——根目录会把全仓所有包一起编译，报 7000+ 行既有 unused 噪音，淹没真实错误。例：`cd D:\Github\GTS-Play\packages\frontend; npx tsc --noEmit -p tsconfig.json 2>&1 | Select-String "girl/Collision.ts|little_man/Shoot.ts" | Select-String -NotMatch "TS6133|TS6192"`）
```

> 写 brief 必须使用此模板，**禁止删减 TDD 流程步骤**

> #### 🔴 Post-poll 绑定：OpenCode 修复 poll 完成后自动 step-done
>
> Step D/E/F（TDD 循环）dispatch 的 OpenCode poll 确认完成后，**立即**执行：
>
> ```powershell
> $sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
> node scripts/skill-exec-manager.cjs step-done $sid --step-index B2 --step-name "实现+集成测试"
> ```
> 🔴 **实现完成后直接进 Phase C 代码审核，不需要兄弟确认（2026-08-15 兄弟拍板）**：step-done 执行完立即 dispatch gts-code-review 完整流程（或按必要性评估标记的审核深度）。展示实现结果/询问「是否进入审核」属于违规。方案确认是唯一需要兄弟确认的环节。


## 🐛🔴 测试失败根因分析纪律（通用规则）

**测试失败后，必须先回答：是被测代码有 bug，还是测试本身有问题？**

正确流程：
```
测试失败
  ├── 被测代码有 bug（测试是对的）→ 修代码
  ├── 测试本身写错了 → 修测试
  └── 环境/配置问题 → 修配置
```

**禁止行为：**
- ❌ 直接归类为「pre-existing」跳过，不做根因分析
- ❌ 默认认为「测试没问题、是代码有问题」（可能测试断言/路径不对）
- ❌ 默认认为「代码没问题、是测试写错了」（可能真漏了 bug）

**每个失败必须输出明确结论：**
```
[测试失败分析]
文件：test/xxx.steps.ts:xx
场景：xxx
根因：被测代码的 xxx 逻辑在 yyy 条件下返回 zzz，预期是 aaa
结论：✅ 被测代码有 bug → 修代码（或 ✅ 测试断言不对 → 修测试）
```
> 这条纪律与「禁止用 pre-existing 跳过修复」同级最高优先级。

> 2026-07-28 教训补充：之前 match-service 2 个测试失败，我直接归类为「pre-existing」，没分析到底是被测代码 bug 还是测试本身问题。这是错的。

### 🔴🔴🔴 Phase C → Phase M 过渡

**Phase C 完成后：**
1. 🗒️ **输出 B 阶段汇报总结** — 整理根因分析结论、改动文件列表、修复方案摘要、OpenCode 编译/测试结果，简要汇总给兄弟看
2. 🅿️ **自动进入 Phase M（手动测试）** — 不等兄弟确认，进入手动测试 checkpoint

兄弟说「搞定了」「完成了」等不中断此流程。

---

## Phase M：手动测试（交互式 Checkpoint）

> 依据 `笔记/项目文档/changes/2026-07-28-manual-test-checkpoint/solution.md`

> 🔴 **全自动模式下 M 阶段不跳过，而是移到最后执行**：C 验收完成后 → 先执行 R（反思）→ S（保存）→ 通知兄弟（自动步骤完成，准备手动测试）→ 再进 M（手动测试）→ M 完成后再执行 R（反思）→ S（保存）→ 通知（最终完成）。标准模式流程不变（C→M→R→S）。
> **全自动模式退出条件：** 如果全自动 dispatch 后有 2 轮以上兄弟与 bot 交互（非进程 poll 反馈），
> 视为自动退出全自动模式，M 阶段恢复生效。bot 应在检测到连续交互后重新进入 M 阶段。
> 检测方式：上一条消息是兄弟发的（非 poll 反馈/系统消息）且本轮不是首次进入?
> 则检查最近 3 条兄弟消息是否有 2 条以上非「OK」「继续」「部署」等简短确认 → 视为退出 auto。

### M-0 — 明确宣布进入 M 阶段

> 🔴🔴 **worktree 改动必须 merge 回 dev + 立刻删 worktree（2026-08-20 兄弟拍板）**：本次 fix 若在 worktree 中实现（opencode-schedule 5️⃣ 规则：改 frontend/ 默认走 worktree），**进入 M 阶段前必须按顺序执行**：
> 1. **commit + merge 回 dev** —— 兄弟手动测试的就是 dev 代码，测试前未 merge = 测了个寂寞（2026-08-17 实锤被兄弟提醒）。merge 流程见 worktree-junction skill「完成后必须 merge 回主仓库」。
> 2. **🔴🔴 §merge-verify 5 项验证全过** —— `git worktree remove` 前**必须**跑完 worktree-junction §merge-verify（5 个命令 + 判定规则），不通过 → 立即 abort + notify 兄弟，**不许自动 merge**。**这是改动不丢的最后保险丝**。
> 3. **`git worktree remove <wt路径> --force`** —— §merge-verify 全过后才能跑。漏删 = D 盘残留占空间 + 下次开新 wt 误用旧分支（2026-08-20 实锤：XiaHui fix 完成后 wt1/wt2/wt3-prop-fix 三个 worktree 都没删，今早才发现）。
> 4. **`git branch -D <wt分支>`** —— 删 worktree 后顺手删分支，防止「worktree 实体没了但分支还活着」
> 5. **`git worktree prune`** —— 清 git 内部 worktree 元数据缓存
> 6. **二次确认**：`git worktree list` 只剩 dev 一个
>
> **触发时机**：全自动模式下，在 step-done B2 后、进 Phase C 前执行。标准模式：进 M 阶段前必须执行。**M-0 不执行完不许进 M-1**。
>
> 全自动模式补充：M 阶段完成后也要再检查一次（防止 M 阶段期间手抖又开了 wt）。

> 🔴 **全自动模式下**：C 验收完成后，先执行 R（反思）→ S（保存）→ 通知兄弟（自动步骤完成），然后再进入 M 阶段。

**进入 M 阶段时，必须明确说出「进入 M 阶段（手动测试）」（在 worktree cleanup 完成之后）。**

模板：
```
? Phase C 完成，现在进入 M 阶段（手动测试）。

兄弟，要在哪个环境测试？
1. 本地开发服务器
2. CloudBase 预发布
3. CloudBase 正式
```

### M-1 — 询问测试环境

先询问兄弟测试环境：

```
兄弟，要在哪个环境手动测试？
1. 本地开发服务器 — 启动服务
2. CloudBase 预发布 — 部署到预发
3. CloudBase 正式 — 部署正式
```

### M-2 — 准备环境

按选定的环境准备，准备完成后通知兄弟测试。测试通知**必须**包含序号提示模板。

**通知模板（必含）：**
```
——— 测试命令 ———
测试完成后，输入对应序号发起子流程：
1️⃣ 发起子 fix：<问题描述>（发现 bug 时用）
2️⃣ 发起子 feat：<功能描述>（发现需要加功能时用）
0️⃣ OK 继续（测试通过，进入下一步）

例如：`1：状态变更通知文案太笼统` → 创建一个修复任务
```

**记录到 issue：** 通知发出后，更新 issue 文件的 `manualPhase.prompted = true`。

### M-3 — 兄弟手动验证

兄弟手动验证 fix。**发现 bug 时，兄弟用序号格式报告：**

**规则：**

| 兄弟输入 | 含义 | bot 行为 |
|-----------|------|---------|
| `1：<问题描述>` 或 `1: <问题描述>` | 报告 bug → 发起子 fix | 更新 issue `manualPhase.subTask={type:"fix", needed:true, confirmed:false, description}` → 等兄弟确认 → 确认后 dispatch OpenCode 修 |
| `2：<功能描述>` 或 `2: <功能描述>` | 报告新需求 → 发起子 feat | 记录到 issue，不阻塞 M（标记 deferred，后续单独处理） |
| `0` 或 `OK 继续` | 测试通过 | 进入 Complete M |
| 其他文本 | 不确定的 bug / 异常 | 询问兄弟「要继续排查吗？」 |

**关键原则：**
- ❌ 兄弟输入 `1：xxx` 后不能直接 dispatch，必须先等兄弟确认
- ✅ 确认后更新 issue 再 dispatch OpenCode 修，修完回到 M-3 继续验证
- 🔴 子 fix 嵌套深度最多 1 层（子 fix 中不能再发子 fix）
- 🔴 dispatch 后 CLI 被 SIGKILL 不立刻重试（见 dispatch 后冷却协议）

### M-4 — 完成

兄弟确认手动测试通过。

兄弟确认手动测试通过。

> ?? **状态追踪**：Phase M 完成 → STEP_DONE
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index M --step-name "手动测试"
> ```

> **子 fix 嵌套深度最多 1 层**（子 fix 中不能再发子 fix）。完整 M 阶段设计见 `2026-07-28-manual-test-checkpoint/solution.md`。

> 📊 **状态追踪**：Phase M 完成 → STEP_DONE
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index M --step-name "手动测试"
> ```

> 🔴 **全自动模式下 M-4 完成后**：M 完成 → 执行 R（反思）→ S（保存）→ 通知兄弟（最终完成）。R 和 S 是工作流最后一步。

---

## Phase C：验收（运行所有 BDD 测试 + Phase 0 设计的 E2E）

> 🔴 窗口模式：**非全自动模式**（默认）→ 有头 headed | **全自动模式激活时**（gts-auto 生效）→ 无头 headless

走 **gts-acceptance** 验收 skill，按以下顺序执行：

1. **🔴 代码审核**（原 Step 2.5）— 根据 Step 1 的「代码审核必要性评估」标记决定审核深度：
   - `required`（涉及运行时核心逻辑）→ 深度审核，走 gts-code-review skill 完整流程（调度 OpenCode）
   - `skip`（极简改动）→ > 🔄 **调度 OpenCode Flash** 做轻量审核
   > 代码审核由 OpenCode 执行，bot 只负责写 brief 和传达结果。
   > 🔴 审核 brief 必须贴完整重构规则：从 `笔记/项目文档/rules/workflow-rules.md` 的 🔴🟡🟢 审核表格和 `笔记/项目文档/rules/test-standards.md` 各层验收标准实时读取，逐条贴入 brief，不能浓缩。
   > 🔴 审核范围 = 本次 fix 的所有改动文件（不是 .last-review diff）。
   > 🔴 **所有层级（🐛🔴🟡🟢📋）全部写进 fix brief 一次 dispatch 修完**，一条不能漏。只有兄弟明确说跳过才不修。
2. **所有 BDD 测试全绿 ✅** — > 🔄 **调度 OpenCode Flash** 执行全部 BDD/集成测试（包括 Phase B Step 2 设计的集成测试 + 已有的全部 BDD 测试），汇报结果。
3. **Phase 0 设计的 E2E 测试全绿 ✅** — 运行 Phase 0 Step 0.1 设计的 E2E 场景，汇报结果：
   - **多人版** → 🔄 **调度 OpenCode** 运行（自动 E2E）
   - **单机版** → 走 **gts-e2e-test 单机分支**（手动 E2E：bot 启动 dev-server + runner，兄弟手动操作）
   > 无 Phase 0（跳过 E2E 验收）→ 本步跳过
4. **🔴 修复 Specs（轻量自检）** — > 🔄 **调度 OpenCode Flash** 自查 specs，E2E 全绿后不等确认立即执行。
5. **🔴🔴🔴 TDD 验证集成测试** — > 🔄 **调度 OpenCode Flash** 执行 TDD 验证（撤销修复代码 → RED → 恢复 → GREEN），汇报每一步结果。
    > 如果集成测试不因 bug revert 而失败（RED 变 GREEN），说明测试没有真正覆盖 bug 路径。
6. **🔴 两层回归** — > 走 **`gts-regression`** skill 统一执行（集成回归 → E2E 回归），环境+场景继承 Phase B 上下文。旧 BDD 全量 + 集成测试 + E2E 场景一次搞定。
8. **更新操作文档** — 检查 E2E-OPERATIONS.md，无新模式则跳过
9. **🔴 手动验证**（本地修复专用）— > 🔄 **调度 OpenCode** 重启本地服务清理残留 state：
   1. 杀掉旧 room-service 进程（按端口 4003 精确杀）
   2. 杀掉旧 frontend-multiplayer webpack 进程（按端口 8093 精确杀）
   3. 启动 room-service：`cd packages/room-service && Start-Process -WindowStyle Hidden powershell -ArgumentList "-NoProfile -Command npx ts-node src/index.ts"`
   4. 启动多人联网前端：`cd packages/frontend-multiplayer && Start-Process -WindowStyle Hidden powershell -ArgumentList "-NoProfile -Command yarn webpack:dev-server"`
   > 如果是线上 bug → 跳过本步，走 Step 10 部署。
10. **自动部署** — 线上 bug 修复后自动部署到 SCF

> 📊 **状态追踪**：Step C 完成 → STEP_DONE + CLEANUP
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index C --step-name "验收流程"
> node scripts/skill-exec-manager.cjs cleanup $sid --result completed
> ```

---

## R 组：技能反思（gts-skill-reflect）—— 🔴 必须 bot 做，禁用 OpenCode (2026-08-20 兄弟拍板)

> **🔴 R/S 必须由 bot 做,不能派 OpenCode**(兄弟原话「R/S 应该由你来做,而不是 OpenCode」)——R 反思需**访问 bot 记忆主表**(MEMORY.md / ARCHIVE.md),只有 bot 能做;OpenCode **不可见** bot 记忆,派它写反思会失去记忆关联导致下次同类问题重演。**S(保存)** 由 bot 做(整合记忆/skill 落地)或派 OpenCode 只做 commit + push(纯机械操作,无记忆依赖)。
>
> OpenCode 可做:写反思 .md 草稿到 `.tmp/` + git commit docs/ 目录;**禁做**:落地 skill patch、更新 memory、整合当日教训。

> CLEANUP 完成后、保存之前，bot 主线执行技能反思：
> 1. 读 phase-c-verification.md + issue pitfalls + 当日 daily log
> 2. 🔍 整合 bot 记忆主表相关条目(对照同类教训)
> 3. **关联到对应 skill / memory**(patch skill 文件 / update memory)
> 4. 生成反思报告 → 兄弟原话确认 → 自动进保存

**🔴 配套 R/S 操作硬规**(2026-08-20 实锤):

1. **反思报告必须含** 5 段: ①过程总结 ②教训(每条带具体文件:行号 + 实测命令)③记忆/skill 落地条目清单 ④spec 同步状态 ⑤修复完整度评估 + 待 push 状态
2. **patch skill 前**用 `skill_view` 验证 skill 内容完整 + 不引入 lint 错误
3. **patch skill 后**用 `ls -la .hermes-home/skills/gts/<skill>/` 确认文件落地
4. **不擅自动 OpenCode**(dispatch 排程会打断兄弟浏览 dev server / 浪费 token)
5. **R 完成 = 兄弟拍板 S**(commit + push);**全自动模式下 R + S 都由 bot 做**(记忆/skill 落地必须 bot;commit/push 是机械动作可派 OpenCode 但非必须)
6. **commit 前必看 git status + 核对 staged 文件清单**,避免漏文件 / 多文件
7. **commit message 用中文**
8. **push 时机 = 兄弟拍板**(`git checkout` / `git reset` 兄弟不拍不能动);**S 派 OpenCode 也仅在兄弟说"全自动 push"才 push**

```
🔮 技能反思 → bot 主线执行(读记忆/skill → 关联落地)
  ├─ 有改进建议 → patch skill / update memory → 兄弟原话确认
  └─ 无改进建议 → 自动继续
  ↓
保存（gts-submit-save，最后一步）→ 双通道通知 → 🎉 工作流完成
```

> 🔴 **保存必须在反思之后**：gts-submit-save 是工作流最后一步（通知之前），确保反思产出的 skill 更新/修复/报告能一起被提交，不会分两批。
> 🔴 **保存记忆和笔记** — > 🔄 **必须走 gts-submit-save skill 完整流程**（git commit + 保存记忆/笔记 + git push），禁止跳过或替代。
> 📊 **状态追踪**：R 步骤不阻塞 CLEANUP，CHECK 恢复时跳过 R（已完成的工作流不重新反思）。

### 关于 Phase B 已完成检查的重新验证要求

**Step C 检查清单的结果不能作为最终验收依据。** Phase C 必须重新执行 TDD 验证（Step 4），因为：
- Step C 是 OpenCode 的自检，可能遗漏问题（如本次 `_simulate*` 和 numeric enum 问题）
- Phase C 的 TDD 验证（revert → RED → restore → GREEN）是最终的质量门禁
- 两者不矛盾：自检用于快速发现当场能修的问题，TDD 验证用于锁定 bug 不出门

> 📊 **状态追踪**：R 步骤不阻塞 CLEANUP，CHECK 恢复时跳过 R（已完成的工作流不重新反思）。

---

## 🔴🔴🔴 根因分析纪律（兄弟原话硬关卡，2026-08-19 实锤教训）

> **兄弟原话（2026-08-19 prop 白屏 fix）：** 「**为什么你在做根因分析啊？应该调度opencode啊！修复skill**」
> 「**你不要做根因分析，应该调度opencode做。你最多就判断下大致的根因方向**」

### 🔴🔴🔴 bot 行为边界（铁律）

| 阶段 | bot 能做的 | bot **禁止**做的 |
|------|----------|---------------|
| 兄弟描述 bug | **只读 1-2 个最可疑文件/路径做"大致方向"判断**（10-30 秒判断，如"是 UI 库 API 风格错配 / 是算法副作用 / 是配置层"这种层面）；用 dispatch-preflight §模式 A-D 速查表 10 秒过一遍 | ❌ 读 ≥3 个文件做完整 trace<br>❌ 写出完整根因报告（含机制解释 + 副作用链路 + 方案对比）<br>❌ 在 brief 里贴"我的根因分析：..."超过 3 行<br>❌ 自报"我看了 X 文件，根因是 Y" |
| 写 brief | **预置已实测事实**（兄弟原话 + grep 验证过的文件:行号 + 同文件成功的命令式用法） | ❌ 预置"根因结论"<br>❌ 预置"修复方案对比 A/B/C"——方案是 OpenCode 的活 |
| 派工后 | **读 OpenCode 报告 + 验收** | ❌ 自己先出方案 → 让 OpenCode "确认" |

**违反一次 = 浪费一轮 OpenCode session**（agent 收到预置根因，倾向于"确认"而非"独立分析"，或对错根因做无效修复）。

### 分两种情况：

**A. 需要 Phase 0（E2E 验收）→ bot 只做初步判断根因方向：**

- 🔴 **初步判断根因方向**（快速定位可疑模块/路径，不深入 trace）——**目的是设计诊断日志方案：日志打哪里、打什么变量**，在 E2E 场景中复现并定位根因
- 🔴 **「大致方向」的判断上限**：看一眼可疑文件 + 1 次 grep 命中关键 import/调用 → 知道"诊断日志打 `getContainer` 附近"即可；不写完整 trace
- 基于初步方向 → Phase 0 Step 0.1 设计 E2E 场景 + 诊断日志 → Step 0.4 运行复现收集诊断数据
- 🔴 **最终根因分析由 OpenCode Pro 负责**（Phase B Step 1，基于收集的诊断数据）

**B. 无需 Phase 0（跳过 E2E 验收）→ bot 不做根因分析，先确认修复内容，再进 Phase B：**

- 🔴 **不自己分析根因**：不 trace 代码路径、不问兄弟加日志、不做预判断
- 🔴 **不读 ≥3 个源文件推断根因** —— 读完只贴"我读了 X.tsx 行 1156-1267，可能涉及 antd-mobile Modal"这一句话级别
- 🔴 **先分析要修复的内容**：基于 bug 描述梳理修复范围/涉及点 → 展示给兄弟确认（兄弟描述可能不清楚，需进一步确认）
- 🔴 确认修复内容后 → 进入 **Phase B Step 1**，调度 **OpenCode Pro** 出方案
- **根因分析由 OpenCode 负责**：brief 中贴 bug 描述 + 相关代码上下文 + **已 grep 验证过的事实**（行号 + import 列表），让 OpenCode Pro 自行分析根因 + 产出方案 + Delta Specs
- 🔴 **brief 严禁贴 bot 的"根因分析"段**（如"## 根因\n<bot 写的 3-5 句话>"）—— 只贴"## 已确认事实"（grep/import 验证），根因段由 OpenCode Pro 写
- 展示 OpenCode 方案给兄弟确认后，再进 Step 2 实现

### 🔴🔴 10 秒速查表（bot 派工前必跑，dispatch-preflight §模式 A-D 已在 umbrella skill）

派工前花 10 秒过一遍，命中直接 dispatch，**不要自己再做 trace**：

| 模式 | 信号 | bot 派工时只需 |
|------|------|--------------|
| **A 信 commit 当事实** | commit message 说"X 未变/已修" | `git show <sha> -- <file>` 看真实 diff |
| **B 配置层 ≠ 数据层** | bug 涉及"配置改 → 数据变"推断 | 问"X 这类配置历史上改过 Y 数据吗？" |
| **C 错误根因 → 错误派工** | 历史断言"X 改了 Y" | 不要凭历史断言派工，先汇报兄弟 |
| **D UI 库 API 风格错配** | 弹窗/UI 异常 + import 行 vs JSX 调用点风格不一致 | 1 次 grep "import.*Modal" + 看 JSX 调用点，直接 dispatch 修 |
| **E 显存溢出** | 白屏 + GPU/RAM 大配置 | 不要自己加显存监控日志，让 Pro 派活时自带 |
| **F 时序/竞态** | 偶现 + 切状态触发 | 1 句话提示"偶现，跟 X 状态切换有关"，不深挖 |

### 🎯 加日志的方式（按优先级）

线上环境加诊断日志有**两种方式**：

**方式 1（推荐）：E2E Blocks 诊断（无需部署）**
- 在 E2E scenario JSON 中添加 blocks，不修改服务端代码
- 可用 block：`enableLogging`（拦截 fetch/WS/TSRPC）、`evaluate`（任意 JS）、`scfLogs`（SCF 日志）、`saveLogs`（存文件）
- 优势：零部署、零风险、全链路
- 详情：`笔记/项目文档/knowledge/e2e-diagnostic-without-deploy.md`

**方式 2（需要部署）：修改服务端 .ts 源文件**
- 在关键路径加 `console.log('[DIAG:xxx] ...')`
- 编译 tsc → 部署到 SCF
- 优势：可看服务端内部逻辑
- 劣势：需要部署等待、有污染代码风险

**选择原则：** 优先方式 1（E2E blocks），客户端 API 调用链和返回都能抓到。只有需要看服务端内部逻辑（如 init() DB restore）才用方式 2。

- **不自己 trace 代码路径推断根因**（一律交给 OpenCode Pro）
- 这步之后才调度 OpenCode Flash 修复

---

### 通用规则

- 决定加日志 → 日志收集完 → 写 brief → 调度 **OpenCode Pro** 分析根因
- 这步之后才调度 OpenCode Flash 修复

---

## 模型选择

与 gts-dev-workflow 一致，具体命令模板见 `skills/opencode-schedule/SKILL.md`：

| 任务 | 模型 |
|------|------|
| 复杂bug修复 | Pro（默认 variant，不用 max；仅超大范围才 max，2026-08-10 定稿） |
| 简单修复 | Flash |

## 🔴🔴🔴 调度纪律

### 🔴 所有 OpenCode 调度统一走 opencode-schedule skill

**禁止在此处自行写 dispatch 命令。** 所有 OpenCode 调度（Pro 或 Flash）**严格按 `skills/opencode-schedule/SKILL.md` 的顺序执行**：

1. 构造 brief → 写 `.opencode-brief.md`
2. 按 opencode-schedule → 2️⃣ dispatch 命令模板执行
3. 确认 sessionId → 按 3️⃣ 状态确认
4. 立即 poll → 按 4️⃣ poll 步骤轮询

### 🔴🔴🔴 需要停 OpenCode → 调度 gts-opencode-stop

- **OpenCode Pro 天然慢**，生成分析报告可能需要数分钟，期间可能长时间无输出
- 先收集信息判断：进程是否还在？session 是否 stale？有输出吗？
- 需要停 → 调度 `gts-opencode-stop` skill（精确 kill 指定 session + 杀子进程，不重启服务器）
- 不确定 → 汇报兄弟
- 即使超过 poll 超时（300s），也要继续 poll 等待，不主动 kill
- 对 `process(action=poll)` 返回的 `Process exited with signal SIGKILL` 或 `ProviderModelNotFoundError` 视为正常退出报告（非卡死）
