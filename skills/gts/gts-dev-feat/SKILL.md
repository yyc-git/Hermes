---
name: "gts-dev-feat"
description: "brief 模板 Steps A-F; 审核清单与 Layer 3 对齐; feat 开发 skill; Step0 默认时间倒序"
---

## 概述

gts-dev-feat — 新功能开发（feat: 触发入口）

> 兄弟对话以 `feat:` 开头时 → 进入本 skill。
> 作为 feat 的单一入口，再委托 gts-dev-workflow 实现。
> **gts-dev-workflow 中不再侦听 feat:**，避免冲突。

---

## 🔴 状态追踪（全局）

> 本 skill 使用 **skill-exec-issue-tracker** (Phase 0-8) 框架管理状态，支持多会话隔离、Issue 追踪和 dispatch 互斥。
> 本机制遵循 `笔记/项目文档/changes/2026-07-28-skill-exec-issue-tracker/solution.md` 的实现规格。
> 不再使用旧版单文件 `.skill-exec-state.json`，改用 per-session 文件。

### 文件定义

| 文件 | 用途 | 是否纳入 git |
|------|------|:----------:|
| `.skill-exec-state.<sessionId>.json` | per-session 状态文件（v2 schema） | ❌ .gitignore |
| `.skill-exec-sessions.json` | 会话注册表（永不删除） | ❌ .gitignore |
| `.skill-exec-dispatch.lock` | dispatch 互斥锁（30min TTL + heartbeat） | ❌ .gitignore |
| `笔记/项目文档/issue/<date>-<skill>-<hash>.md` | Issue 追踪文件（YAML front matter + Markdown body） | ✅ |
| `scripts/skill-exec-manager.cjs` | CLI 入口（统一调用 state/issue/registry/dispatch-lock） | ✅ |

### 步骤序列

本 skill 的执行状态追踪使用以下 **7 步序列**，对应工作流中的关键断点/恢复点：

```
步骤序列（7 步）：
  0: 需求确认（与我确认需求、验收标准）
  B: 实现（出方案 + **等我确认方案** + 实现 + 集成测试）
  C1: 审核+BDD+E2E
  C2: 修复Specs+TDD+回归
  M: 手动测试（交互式 checkpoint，仅普通模式）
      M-0: 明确宣布进入 M 阶段（必须说「进入 M 阶段」）
      M-1: 询问测试环境（本地开发服务器/CloudBase预发/CloudBase正式）
      M-2: 准备环境（启动webpack dev-server / 部署到对应环境）
      M-3: 兄弟手动测试
            - 发现 bug → 宣布发起子 fix + 描述问题 + 等兄弟确认，再 dispatch
            - 不确定 bug → 询问兄弟「是否继续排查？」
            - 新需求/功能 → 询问兄弟「是否发起子 feat？」
      M-4: 完成 → 问「要重新审核吗？」→ 是则循环 C1-C2-M，否则进 C3
  C3: 部署（CLEANUP 后进 R）
  R: 技能反思（调用 gts-skill-reflect，CLEANUP 后、保存前执行）
  S: 保存（gts-submit-save，最后一步，通知前）
```
> **v6 修正**（2026-07-30）：M-0 新增明确宣布入口；M-3 改为必须宣布「发起子 fix」+ 等确认；auto 退出条件：dispatch 后兄弟交互 2 轮及以上视为退出 auto、恢复 M。
>
> **v7 修正**（2026-07-31）：M-2 通知增加序号提示模板；M-3 改为序号触发（`1：<问题描述>` / `2：<功能描述>`）。完整方案见 `笔记/项目文档/changes/2026-07-28-manual-test-checkpoint/solution.md` v4。

### INIT（skill 触发时第一时间执行）

```powershell
# 1. 获取/生成 session ID 和 workflow ID
$sid = node scripts/skill-exec-manager.cjs get-session-id | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
$wid = node scripts/skill-exec-manager.cjs get-workflow-id $sid | ConvertFrom-Json | Select-Object -ExpandProperty workflowId

# 2. 同任务预检（dispatch 前查 OpenCode DB 确认无「相同任务」活跃 session；不同任务直接并行，全局 dispatch 锁已废弃 2026-08-01）
# 3. stateInit + issueCreate + registryRegister
node scripts/skill-exec-manager.cjs init $sid $wid "gts-dev-feat" `
  --steps 0,B,C1,C2,M,C3,R `
  --summary "<功能摘要>" `
  --criteria "<验收标准>" `
  --specs "<关联 specs 路径，逗号分隔，可省略>"
```

### 生命周期操作

所有操作统一通过 `scripts/skill-exec-manager.cjs` CLI 入口执行。

| 操作 | 时机 | CLI 命令 | 说明 |
|------|------|---------|------|
| **INIT** | (见上方 INIT 段落) | 同上 | 创建 state + issue + registry 注册 |
| **STEP_DONE** | 每完成一个子步骤后 | `node scripts/skill-exec-manager.cjs step-done <sessionId> --step-index <索引> --step-name "<步骤名>" [--files "<改动的文件>"]` | 更新 state + issue 进度 |
| **CHECK** | 每次收到用户消息后 | `node scripts/skill-exec-manager.cjs check <sessionId>` | 读取 state + 交叉校验 state/issue 版本 |
| **CLEANUP** | 所有步骤完成后 | `node scripts/skill-exec-manager.cjs cleanup <sessionId> --result completed` | issue 关闭 + registry 注销 + state 删除 |
| **ABORT** | 放弃工作流 | `node scripts/skill-exec-manager.cjs abort <sessionId> [--reason "<原因>"]` | issue 标记 aborted + registry 注销 + state abort + 释放 dispatch lock |

> **Session ID 获取**：每次 INIT 前先 `node scripts/skill-exec-manager.cjs get-session-id` 获取当前 session ID（优先 `OPENCLAW_SESSION_ID` 环境变量 → `OPENCLAW_INSTANCE_ID` → 自动生成 `oc_<timestamp>_<random4>`）。
> **Workflow ID 获取**：`node scripts/skill-exec-manager.cjs get-workflow-id [<sessionId>]` 生成 `wf_<timestamp>_<random8>`，与 sessionId 独立。

### 初始化格式（由 CLI 自动生成）

技能启动时通过 `init` CLI 命令自动创建。生成的 state 文件格式（v2 schema）：

```json
{
  "_version": 1,
  "schemaVersion": "2",
  "sessionId": "<自动获取或生成>",
  "workflowId": "wf_<timestamp>_<random8>",
  "skillName": "gts-dev-feat",
  "totalSteps": 5,
  "stepSequence": ["0", "B", "M", "C1", "C2", "C3"],
  "completedSteps": [],
  "remainingSteps": ["0", "B", "M", "C1", "C2", "C3"],
  "completedCount": 0,
  "context": {
    "featureSummary": "<一句话描述本次任务>",
    "verificationCriteria": "<关键验收标准>",
    "briefPath": "<brief 文件路径>"
  },
  "issuePath": "笔记/项目文档/issue/<date>-<skill>-<hash>.md",
  "issueSyncStatus": "synced",
  "status": "active",
  "startedAt": "<ISO 时间>",
  "lastUpdatedAt": "<ISO 时间>"
}
```

同时自动创建 Issue 文件：`笔记/项目文档/issue/<YYYY-MM-DD>-<skillName>-<hash8>.md`（YAML front matter + Markdown body 进度日志）。

补充字段（CLI 附加到 context 中传递）：
- `lastCheckpoint`：检查点标记，如 `waiting-user-confirm`、`before-e2e`
- `branch`、`notes`、`modifiedFiles`

### 恢复交互模板

#### 标准恢复模板

```
🤖 检测到未完成的工作流：gts-dev-feat

   已完成（{n}/{total}）:
     ✅ 0: 需求确认
     ✅ B: 实现

   剩余步骤（{m}/{total}）:
     📋 M: 手动测试
     📋 C1: 审核+BDD+E2E
     📋 C2: 修复Specs+TDD+回归
     📋 C3: 部署 → R: 反思 → S: 保存

   最后更新：{相对时间}（检查点：{lastCheckpoint}）

   🔜 即将执行下一步 C1
   （如需跳过、调整或放弃，请现在告知）
```

#### 长时间中断恢复模板

```
🤖 检测到 {duration} 前中断的工作流：gts-dev-feat

   实例：{instanceLabel}
   进度：{n}/{total} 已完成

   剩余步骤：
     📋 M: 手动测试
     📋 C1: 审核+BDD+E2E
     📋 C2: 修复Specs+TDD+回归
     📋 C3: 部署 → R: 反思 → S: 保存

   本次任务：{featureSummary}
   验收标准：{verificationCriteria}

   上次中断在 {checkpoint} 阶段。
   🔜 正在恢复执行接下来的步骤
```

> 长时间中断恢复 + 上下文压缩同时发生时，`featureSummary` 和 `verificationCriteria` 保证不需再问兄弟需求。

#### 冲突提示模板

```
🤖 ⚠️ 检测到已有未完成的 {skillName} 工作流（{n}/{total}）

   Session: {sessionId}
   Issue: {issuePath}

   要放弃它，开始新的任务吗？
   选项：
   A) 放弃旧任务（自动 ABORT：关闭 issue + 注销 registry + 删除 state）
   B) 先完成旧任务，再做新任务
   （旧工作流已超过 24h → ⚠️ 请确认是否仍在进行）
```

> 冲突检测：dispatch 前应检查 OpenCode DB 是否已有「相同任务」活跃 session（title 关键词匹配）；不同任务直接并行，全局 dispatch 锁已废弃（2026-08-01）。

### 故障处理

| 场景 | 处理方式 |
|------|----------|
| `check` 返回 `exists: false` | 正常 → 无未完成 workflow，继续执行 |
| JSON 解析失败 | 展示原始内容给兄弟，手动决定恢复或删除 |
| remainingSteps 为空但文件未清理 | 自动执行 CLEANUP |
| issue 创建失败 | 不阻塞 workflow（降级方案），`issuePath: null` + `issueSyncStatus: "pending_create"`，下次 CHECK 补建 |
| registry 注册失败 | 不影响核心工作流，降级为单会话模式，可后续重建 |

### 手动命令

兄弟可通过自然语言管理状态：

| 兄弟说的 | 行为 |
|----------|------|
| "查看当前进度" | `check <sessionId>` + 展示完整状态 + cross-check 结果 |
| "跳过这个步骤" | `step-done <sessionId> --step-index <索引>`（将该步直接移到 completed，不执行） |
| "重新执行上一步" | 从 `completedSteps` 回退到 `remainingSteps` + `step-done` |
| "放弃这个工作流" | `abort <sessionId> --reason "用户手动中断"` |

#### 恢复交互模板

当 `check` 发现活跃 workflow 时自动展示：

```
🤖 检测到未完成的工作流：{skillName} (session: {sessionId})

   已完成 ({n}/{total}):
     ✅ {completedSteps 列表}

   剩余步骤 ({m}/{total}):
     📋 {remainingSteps 列表}

   本次任务：{featureSummary}
   验收标准：{verificationCriteria}

   Issue: {issuePath}
   最后更新：{相对时间}(检查点: {lastCheckpoint})

   🔜 即将执行下一步 {nextStep}
```

### 上下文压缩恢复

> 上下文压缩后，对话历史被清空但 state/issue 文件保留，`check` CLI 读取文件恢复信息。

#### 恢复规则

| 规则 | 说明 |
|------|------|
| **第一步** | 收到兄弟消息后 `check <sessionId>` 读取状态 |
| **第二步** | 展示剩余步骤 + context 中的 `featureSummary` + `verificationCriteria` |
| **第三步** | 如果 context 信息完整 → 直接继续，不再问兄弟 |
| **第四步** | 如果 context 不完整 → 简洁确认：「之前做到xxx了，继续？」 |
| **第五步** | `crossCheck` 结果不一致 → 执行 `syncStateToIssue` 自动修复 |

> `featureSummary` 和 `verificationCriteria` 是压缩恢复后的生命线，INIT 时必须写入。

#### 信息分级

| 级别 | 字段 | 作用 |
|:----:|------|------|
| 🟢 关键 | `featureSummary` + `verificationCriteria` | 独立决策，不打断兄弟 |
| 🟡 重要 | `briefPath` + `modifiedFiles` | 快速定位 |
| 🔵 辅助 | `notes` + `lastActionResult` | 跳过踩坑 |

#### 恢复模板

```
🤖 检测到未完成的工作流：{skillName} (session: {sessionId})

   已完成 ({n}/{total}):
     ✅ {completedSteps 列表}

   剩余步骤 ({m}/{total}):
     📋 {remainingSteps 列表}

   本次任务：{featureSummary}
   验收标准：{verificationCriteria}
   Issue: {issuePath}

   🔜 正在继续 Step {nextIndex}: {nextName}
```

---

## Phase 0：设计验收（开始前先做）

每次 feat 开发之前，必须先设计完整的验收流程。

### Step 0：与我确认需求

1. 兄弟说「feat：xxx」→ 我理解需求后，向兄弟确认：
   - 功能目标
   - 变更范围
   - 验收标准
   - 🔴 **数据展示排序方向**：凡涉及列表/记录/历史/日志展示的功能，默认按**时间倒序（最新在前）**作为产品默认，直接写入 specs 断言顺序，无需额外询问（除非兄弟明确要求正序）

2. 等我的回答。我说「OK」才继续。
   - 🔴 **发出需确认问题后必须立即发桌面通知**（`scripts/notify.ps1 "<问题摘要>" 60 "OpenClaw 待确认"`），不能假设兄弟在聊天界面前。本机路径 `C:\Users\Administrator\D:\Github\GTS-Play\scripts\notify.ps1`（one 机为 `C:\Users\one\...`）。

3. **🔴 INIT 时写丰富 context：使用 CLI manager**：
   ```powershell
   # 获取 session ID
   $sid = node scripts/skill-exec-manager.cjs get-session-id | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
   # 生成 workflow ID
   $wid = node scripts/skill-exec-manager.cjs get-workflow-id $sid | ConvertFrom-Json | Select-Object -ExpandProperty workflowId
   # stateInit + issueCreate + registryRegister
   node scripts/skill-exec-manager.cjs init $sid $wid "gts-dev-feat" `
     --steps 0,B,C1,C2,M,C3,R `
     --summary "<一句话功能概要>" `
     --criteria "<验收标准>" `
     --specs "<关联 specs 路径，逗号分隔，可省略>"
   ```
   
   > `context.featureSummary`、`context.verificationCriteria` 这些信息是压缩恢复后的生命线，保证我不需要再问兄弟「我们做到哪了」「需求是什么」

> 📊 **状态追踪**：Step 0 完成 → STEP_DONE
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index 0 --step-name "需求确认"
> ```

---

## Phase B：实现（含出方案 + 等我确认方案 + 实现）

> Step 0（需求确认）完成后进入 Phase B。**B 阶段内部含两个环节：出方案 → 等我确认 → 实现**。
> 方案确认后进入实现阶段，实现完成后**直接进入 Phase C1 代码审核（不需要兄弟确认，2026-08-15 兄弟拍板）**，C 完成后进入 Phase M（手动测试）。

### 🔴🔴🔴★ 职责边界（最高优先级）

**这个表是铁律，不是建议。违反一次就必须补 Skill 修订。**

| 谁 | 只能做什么 | 绝对不做什么 |
|----|-----------|-------------|
| **我（bot）** | 阅读分析 → 写 brief → 调度 OpenCode → 读结果汇报 → git 操作 → 部署 | 不手动写/改 .ts/.tsx/.res/.js/.scss 文件、不手动跑 `jest`/`tsc`/`webpack`、不手动修编译/测试错误 |
| **OpenCode** | 改代码、写测试、跑测试（RED/GREEN）、自我验证、跑 tsc、修编译/测试错误 | 不做部署、不做 git commit |

> 🔴 **所有 OpenCode 调度统一走 `skills/opencode-schedule/SKILL.md`**：写 brief → 预检进程列表 → `$brief` 变量传参（禁止 pipe）→ poll 跟进。本 skill 委托 gts-dev-workflow 执行调度，但最终统一遵守 opencode-schedule 协议。

### 🔴 验证结果循环（OpenCode 完成后）

OpenCode 跑完后，我（bot）只能 **阅读输出结果**，**不能直接动手修**。

```
OpenCode 完成 → 我读结果
  ├─ 全绿 ✅ → 继续下一步
  └─ 有失败 ❌ → 分析失败原因 → 写新 brief（含失败详情+原因）→ 调度 OpenCode 修
       └─ 再读结果 → 循环直到全绿
```

### 🔄 规格同步检查（实现完成后、验收通过前必做，2026-08-05 新增）

> 与「E2E 后更新 E2E-OPERATIONS.md」同级别纪律（知乎调研落地项 P3）。

1. **对比**：本次实现的 Delta Specs（`笔记/项目文档/changes/<日期>-<功能名>/specs/` 的 README/.feature/expected-state）与最终代码行为
2. **不一致时分类处理**：
   - 实现比 spec 多 → 回写 spec 补充（注明「实现补充」）
   - 实现比 spec 少 / 行为不同 → 🟡 判断：是 bug 还是 spec 过时？bug → 回 OpenCode 修；spec 过时 → 更新 spec
3. **expected-state JSON 一并同步**（验收断言以最终版为准）
4. **同步完成才允许标记 issue completed**
5. 无 Delta Specs 的改动 → 跳过（仅在 issue 记录「无 specs 需同步」）

**关键约束：**
1. ❌ 我不手动改文件（无论 .ts/.tsx/.res/.js/.scss/.feature/.steps.ts）
2. ❌ 我不手动跑 jest、tsc、webpack
3. ❌ 我读到编译/测试错误后，不分析完就推测原因
4. ✅ 我只读结果、分析原因、写 brief、调度 OpenCode、汇报
5. ✅ 我可以读完整输出以定位失败点

> 🔴🔴🔴 违反此规则的后果：跳流程、漏改、漏测、浪费时间。兄弟看到了会立刻指出来。

### 🔴🔴🔴 Phase B 内部子流程

Phase B 内部按顺序分 **两个环节**：出方案 + 等我确认 → 实现。

#### 环节 1：出方案 + 等我确认方案

委托 **gts-dev-workflow** 执行出方案：

- **复杂任务**：调度 OpenCode Pro 出方案 + Delta Specs
- **简单任务**（纯 UI/纯前端/无后端逻辑/不跨包）：可调度 OpenCode Flash 写 specs
- 产出物：
  - 🔴 **必须**将方案文档写入 `笔记/项目文档/changes/<日期>-<功能名>/solution.md`
  - 🔴 **必须**将 Delta Specs 写入 `笔记/项目文档/changes/<日期>-<功能名>/specs/`
  - 🔴 **必须**将 Expected-state JSON 写入 `笔记/项目文档/changes/<日期>-<功能名>/specs/expected-state/`
  - 🔴 纯方案/specs 任务：brief 必须写「不能写代码，只能写 specs」
  - 🔴🔴 **量化预估必须多尺寸样本实测（2026-08-07 新增）**：方案涉及压缩率/性能/体积/耗时等量化预估时，必须基于**至少 3 个代表性样本（大/中/小）的真实测量**（解析/压测脚本实测），**禁止单样本外推**。specs 中量化阈值必须**区分「预估阈值」与「实测值」**，标注样本来源与置信度。若实测与预估偏差 >30%，以实测为准并回写 specs。
    - 实例：vmd-compress specs ≤10% 按 2.4MB keep_crawl 单样本外推，实测 480KB walk 仅 16.63%，阈值不可达 → 兄弟拍板改 ≤30%，多一次 dispatch + 决策
    - 违反后果：方案确认后才发现阈值不可达 → 多一轮 dispatch + 兄弟决策成本
  - 🔴🔴 **删除/裁剪/级联类方案必须写清级联边界（2026-08-08 新增）**：方案/规格涉及「删除 X 时连带删除 Y」「级联删除」「裁剪链上部件」等规则时，solution.md + specs 必须明确：
    - **级联边界**：哪些引用类型可级联（如 IK owner 删除后其 effector 可连带）、哪些保守保留（如 parent/connect/grant 引用消失的骨骼保留在树中）
    - **排除清单**：明确列出「不删」的候选（有引用/有子级/断链风险），防止实现 agent 自行扩大删除范围
    - **验证断言**：specs 中必须有「被删对象无残留引用」类断言兜底
    - 实例：mmd-bone-reduce 刀B1 级联初版过度删除（parent 连带 [40][57][125] 被删，21 vs 规格 18）→ 多一轮修正 dispatch
    - 违反后果：实现 agent 按字面理解「连带删除」扩大范围 → 规格偏差 → 审核/回归才发现 → 额外 dispatch

OpenCode 出方案完成后，**必须先展示方案给我确认**，我说「OK」才能进实现环节。

展示格式：
```
## 方案摘要
<方案简要说明>

## Delta Specs 清单
<specs 文件列表，含 .feature 中的场景名称>

## 改动范围
<改哪些文件、新增/修改/删除>

方案 OK 吗？进实现环节？
```

> 🔴 展示方案等确认后，同样必须发桌面通知（同 Step 0，notify.ps1）。

- 我说「OK」→ 进实现环节
- 我说「不行/改方案」→ 按我说的方向改方案，改完再确认

#### 环节 2：实现 + 集成测试

Delta Specs 确认后，委托 **gts-dev-workflow** 执行 **实现 + 集成测试** — 调度 OpenCode Flash，包含以下子步骤：
  > 🔴🔴🔴 **Delta Specs 门禁：没有确认不准调度 OpenCode 写代码。**
  - 简单任务一轮 dispatch 场景：brief 中先写完 specs 文件清单，OpenCode 执行时**先写 specs 文件，再实现代码**，不能跳顺序
  1. **设计集成测试**：根据 E2E 验收步骤 + changes specs + 方案
  2. **编写代码**：写集成测试代码
  3. **检查标准**：按测试标准逐条检查已写好的测试代码
  4. **运行 RED 🔴**：确认因功能未实现而真实失败
  5. **修复业务代码**：实现功能使测试通过（GREEN ✅）

> 实现环节不包含代码审核和手动验证。代码审核迁移到 Phase C1，手动验证迁移到 Phase M。

> 🔴 **实现完成后直接进 C1，不展示结果等确认（2026-08-15 兄弟拍板）**：OpenCode 实现 poll 完成后（step-done 绑定执行完），**立即 dispatch C1 代码审核**（gts-code-review 完整流程）。不要停下来问兄弟「要进入审核吗/先看看产物吗」。方案确认是唯一需要兄弟确认的环节。

#### 🔴 实现环节 brief 模板（必须照抄）

```markdown
# <功能名称>

共享规约见 `docs/agent-context.md`。

## 方案
<粘贴已确认的方案>

## Changes Specs（变更规格 — 集成测试依据）
<粘贴 `笔记/项目文档/changes/<日期>-<功能名>/specs/` 中的 .feature 内容>

## 🟢 TDD 流程要求

必须严格按以下顺序执行，**一步不能省**：

### Step A：设计集成测试
根据 E2E 确认的操作步骤 + 验收标准 + 方案 + changes specs，设计集成测试：
- 后端改动 → BDD Feature + Steps（`test/integration/`，跨项目多模块）
- 前端改动 → jest integration test（`test/integration/`，走完整真实路径，不 mock）

### Step B：检查标准（逐条打勾，输出 ✅/❌ 结果）

**从 `笔记/项目文档/rules/test-standards.md` → Layer 3 验收标准 实时读取检查清单。**

按读取到的标准逐条检查已写好的测试代码：

输出格式：
```
- [✅] #...
- [❌] #...（发现问题 → 回到 Step A 修改测试代码）
```

> 🔴 **禁止在 skill 中硬编码检查清单** — 2026-07-22 修订。清单从 `test-standards.md` 实时读取，每次新增/修改规则时无需同步此 skill。

### Step C：写集成测试代码
**只写测试代码，不动业务代码。**

### Step D：运行 RED 🔴
运行集成测试，确认因功能未实现而真实失败。

### Step E：实现业务代码
实施方案使集成测试通过。

### Step F：运行 GREEN ✅
运行全部 BDD 测试确认全绿：
```
npx jest --config jest.config.ts --no-cache packages/room-service/test/ --forceExit --detectOpenHandles 2>&1
```

### 🐛🔴 测试失败根因分析纪律（TDD 流程内）

Step D（RED）或 Step F（GREEN）中如果出现测试失败，**必须先分析根因**：
- 是被测代码有 bug（测试是对的）→ 修代码
- 是测试本身写错了（断言/路径/配置）→ 修测试
- 是环境/配置问题 → 修配置

**禁止行为：**
- ❌ 直接归类为「pre-existing」跳过，不做分析
- ❌ 默认「测试没问题、是代码有问题」
- ❌ 默认「代码没问题、是测试写错了」

每个失败输出明确结论（文件、场景、根因、结论）。

## 命令
- BDD 测试：`npx jest --config jest.config.ts --no-cache packages/room-service/test/ --forceExit --detectOpenHandles 2>&1`
- tsc：`npx tsc --noEmit 2>&1`
```

> 写 brief 必须使用此模板，**禁止删减 TDD 流程步骤**

> #### 🔴 Post-poll 绑定：OpenCode 实现 poll 完成后自动 step-done
>
> Phase B（Steps D/E/F TDD 循环）dispatch 的 OpenCode poll 确认完成后，**立即**执行：
>
> ```powershell
> $sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
> node scripts/skill-exec-manager.cjs step-done $sid --step-index B --step-name "实现" --files "$(git diff --name-only HEAD)"
> ```
> 🔴 **step-done 后立即 dispatch C1 代码审核（2026-08-15 兄弟拍板）**：实现完成不需要兄弟确认，直接进 gts-code-review 完整流程。展示实现结果/询问「是否进入审核」属于违规。


#### 🔴🔴🔴 回归 bug 集成测试疫苗规则（硬性规则）

**每次回归 bug 修复 → 必须同步补一个集成测试。**
集成测试就是「防止同样 bug 再次出现」的疫苗。

- 所有回归 bug 修复必须包含对应的集成测试
- 集成测试写入 `test/integration/<相关模块>/`
- 必须覆盖 bug 的完整触发路径（不 mock 核心逻辑）
- 通过 TDD 验证（RED → GREEN）才算锁定 bug
- 例外：纯配置/文档/样式/文案的修复可不补

---

## Phase M：手动测试（交互式 Checkpoint）

> 依据 `笔记/项目文档/changes/2026-07-28-manual-test-checkpoint/solution.md`

**实现完成后进入 Phase M（手动测试 checkpoint）**。

> 🔴 全自动模式跳过 M。但 dispatch 后与兄弟 2 轮及以上自然对话交互，视为退出 auto，M 阶段恢复。
> 检测：最近 3 条兄弟消息 ≥2 条非简短确认 → 退出 auto，恢复 M。

### M-0 — 明确宣布进入 M 阶段

**进入 M 阶段时，必须明确说出「进入 M 阶段（手动测试）」。**

模板：
```
? Phase C 完成，现在进入 M 阶段（手动测试）。

兄弟，要在哪个环境测试？
1. 本地开发服务器
2. CloudBase 预发布
3. CloudBase 正式
```

### M-1 — 询问测试环境

先询问测试环境，不能默认本地：

```
兄弟，要在哪个环境手动测试？
1. 本地开发服务器 — 启动webpack dev-server
2. CloudBase 预发布 — 部署到预发
3. CloudBase 正式 — 直接部署正式
```

### M-2 — 准备环境

按兄弟选择的环境操作：

| 环境 | 操作 |
|------|------|
| 本地开发服务器 | 启动 webpack dev-server（`cd packages/frontend && yarn webpack:dev-server`） |
| CloudBase 预发 | 部署到预发布环境 |
| CloudBase 正式 | 部署到正式环境 |

准备完成后通知兄弟：

```
🤖 ✅ 环境已就绪

   环境：{环境名称}
   地址：{对应 URL}

   🔴 手动测试检查点

   ——— 测试命令 ———
   测试完成后，输入对应序号发起子流程：
   1️⃣ 发起子 fix：<问题描述>（发现 bug 时用）
   2️⃣ 发起子 feat：<功能描述>（发现需要加功能时用）
   0️⃣ OK 继续（测试通过，进入下一步）

   例如：`1：按钮点击无反应` → 创建一个修复任务
```

### M-3 — 兄弟手动测试

兄弟手动测试。**发现 bug 时，兄弟用序号格式报告：**

| 兄弟输入 | 含义 | bot 行为 |
|-----------|------|---------|
| `1：<问题描述>` 或 `1: <问题描述>` | 报告 bug → 发起子 fix | 更新 issue `manualPhase.subTask={type:"fix", needed:true, confirmed:false, description}` → 等兄弟确认 → 确认后 dispatch |
| `2：<功能描述>` 或 `2: <功能描述>` | 报告新需求 → 发起子 feat | 记录到 issue，不阻塞 M（标记 deferred） |
| `0` 或 `OK 继续` | 测试通过 | 进入 Complete M |
| 不确定的文本 | 根因不清 | 询问兄弟「要继续排查吗？」 |

**关键原则：**
- ❌ 兄弟输入 `1：xxx` 后不能直接 dispatch，必须先等兄弟确认（发出确认问题后必须发桌面通知，同 Step 0，notify.ps1）
- ✅ 确认后更新 issue 再 dispatch，修完回到 M-3 继续验证
- 🔴 子 fix 嵌套深度最多 1 层

### M-4 — 完成

兄弟确认手动测试通过：

```
1. UPDATE state 文件（casWrite）：
   - completedSteps 追加 M 步骤
   - remainingSteps 移除 M
   - completedCount += 1
   - lastCheckpoint → "manual-testing-completed"
   - checkpointData.manualTesting.status → "completed"
   - _version += 1

2. 更新 issue 文件：进度表 M 步骤 → ✅

3. Bot 进入 Phase C（验收）
```

### 有 Bug — 委派子 Fix

M-3 阶段发现 bug 时按上述规则处理（宣布→等确认→dispatch）。手动触发也可用「有 bug：xxx」：

```
1. 明确宣布「发起子 fix：<问题描述>」→ 等兄弟确认
2. 兄弟确认后 dispatch OpenCode
3. 子 fix 完成后回到 M checkpoint
4. 所有 fix 完成后统一回归验证
```

🔴 **子 fix 嵌套深度最多 1 层**（子 fix 中不能再发子 fix）。

> **子 fix 嵌套深度最多 1 层**，子 fix 发现 bug 不继续委派，直接在当前 fix 中修。
> **完整 M 阶段设计**（Enter M / Bug 上报 / 子 fix 委派 / 回归 / Complete M）见 `2026-07-28-manual-test-checkpoint/solution.md`。

> 📊 **状态追踪**：Phase M 完成 → STEP_DONE
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index M --step-name "手动测试"
> ```

---

## Phase C：验收

> 🔴 窗口模式：**非全自动模式**（默认）→ 有头 headed | **全自动模式激活时**（gts-auto 生效）→ 无头 headless

> 📊 **恢复检查点**：Phase M（手动测试）完成后 → CHECK 读取状态文件（`check <sessionId>`），展示剩余 Phase C 步骤

### C1 组：审核+BDD+E2E

1. **🔴 代码审核** — 必须走 gts-code-review skill 完整流程（调度 OpenCode Pro 审核），`skip` 标记不生效
   > 代码审核不由 OpenCode Flash 自审。自我审查在 brief 模板 Step B 中由 Flash 执行，不是替代外部审核。此处由 OpenCode Pro 做独立外部审核。
   
   > 🔴 **审核范围**：本 feat 的所有改动文件。不依赖 `.last-review` diff（那是 gts-code-review 独立触发或 fix 流程的默认行为）。在 brief 中注明「scope = 本次 feat 的全部改动文件」。
   > 🔴 **代码审核 brief 必须贴完整重构规则**：从 `笔记/项目文档/rules/workflow-rules.md` 的 🔴🟡🟢 审核表格和 `笔记/项目文档/rules/test-standards.md` 各层验收标准实时读取，**逐条贴入 brief**，不能浓缩。
   > 🔴 **修复纪律**：审核结果回来后，**逐条列出所有 🐛🔴🟡🟢📋 问题**，全部写进 fix brief 一次 dispatch 修完。没有兄弟明确说跳过，不得自己判断跳过任何级别。

2. **所有 BDD 测试全绿 ✅** — 🔄 **我调度 OpenCode Flash** 跑全部 BDD/集成测试（新写的 + 已有的），我不手动跑，OpenCode 汇报结果。
3. **E2E 测试全绿 ✅** — 我先从 `test/e2e/E2E-OPERATIONS.md` 列出可选场景（含简短说明）→ 兄弟选择后 → 🔄 **我调度 OpenCode** 运行所选场景，OpenCode 汇报结果。
> 📊 **状态追踪**：Step C1 完成 → STEP_DONE
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index C1 --step-name "审核+BDD+E2E"
> ```

### C2 组：修复Specs+TDD+回归

4. **🔴 修复 Specs（轻量自检）** — > 🔄 **调度 OpenCode Flash** 自查 specs，E2E 全绿后不等确认立即执行。
5. **🔴🔴🔴 TDD 验证集成测试** — > 🔄 **调度 OpenCode Flash** 执行 TDD 验证（撤销实现代码 → RED → 恢复 → GREEN），汇报每一步结果。
6. **🔴 回归测试验证** — > 🔄 **调度 OpenCode Flash** 跑旧 BDD 全量 + 集成测试全量，汇报通过/失败详情。
7. **🔴 E2E 回归门禁** — > 🔄 **调度 OpenCode** 跑 E2E regression 场景（`npm run e2e:regression`），汇报结果。
8. **更新操作文档** — > 🔄 **调度 OpenCode Flash** 检查 E2E-OPERATIONS.md。

> 📊 **状态追踪**：Step C2 完成 → STEP_DONE
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index C2 --step-name "修复Specs+TDD+回归"
> ```

### C3 组：部署

> 🔴🔴🔴 **C3 门禁：C1（审核+BDD+E2E）和 C2（修复Specs+TDD+回归）必须全部完成才能进入 C3。禁止跳过 C1/C2 直接部署。**

9. **🔴 手动验证**（本地修复专用）— > 🔄 **调度 OpenCode** 重启本地服务清理残留 state：
   1. 杀掉旧 room-service 进程（按端口 4003 精确杀）
   2. 杀掉旧 frontend-multiplayer webpack 进程（按端口 8093 精确杀）
   3. 启动 room-service：`cd packages/room-service && Start-Process -WindowStyle Hidden powershell -ArgumentList "-NoProfile -Command npx ts-node src/index.ts"`
   4. 启动多人联网前端：`cd packages/frontend-multiplayer && Start-Process -WindowStyle Hidden powershell -ArgumentList "-NoProfile -Command yarn webpack:dev-server"`
   > 如果是线上 bug → 跳过本步，走 Step 10 部署。
10. **自动部署** — 线上修复后自动部署到 SCF

> 📊 **状态追踪**：Step C3 完成 → STEP_DONE + CLEANUP
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index C3 --step-name "部署"
> node scripts/skill-exec-manager.cjs cleanup $sid --result completed
> ```

---

## R 组：技能反思（gts-skill-reflect）

> CLEANUP 完成后、保存之前，调用 **gts-skill-reflect** skill 执行技能反思：
> 读取 issue pitfalls + 记忆检索 + 对话补充 → 生成改进建议 → **等兄弟确认** → skill_workshop 执行。
> 无异常时走快速路径（自动进保存，不打断兄弟）。

```
🔮 技能反思 → 调用 gts-skill-reflect
  ├─ 有改进建议 → 展示报告 → 等兄弟确认 → 走 skill_workshop
  └─ 无改进建议 → 自动继续
  ↓
保存（gts-submit-save，最后一步）→ 双通道通知 → 🎉 工作流完成
```

> 🔴 **保存必须在反思之后**：gts-submit-save 是工作流最后一步（通知之前），确保反思产出的 skill 更新/修复/报告能一起被提交，不会分两批。
> 🔴 **保存记忆和笔记** — > 🔄 **必须走 gts-submit-save skill 完整流程**（git commit + 保存记忆/笔记 + git push），禁止跳过或替代。
> 📊 **状态追踪**：R 步骤不阻塞 CLEANUP，CHECK 恢复时跳过 R（已完成的工作流不重新反思）。
