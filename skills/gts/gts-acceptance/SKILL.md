---
name: "gts-acceptance"
description: "验收流程：BDD→E2E→Specs→TDD验证→代码审核→回归→E2E回归→操作文档→手动验证→部署→保存→通知"
---

# 验收流程（硬性操作规程）

> 触发词：兄弟说「验收：<标准>」或「验收」。
> 自动循环模式：Specs 发现 → 逐个问题走 TDD 修复（注入 Specs）→ 全量集成测试 → Specs 覆盖验证 → E2E 自动验收 → 自动部署 → 双通道通知（含覆盖统计）。
> 全程自动化：执行 `gts-dev-fix` 时不需要兄弟确认。
> ⚠️ 验收结束时必须执行双通道通知，禁止只跑完不说话。

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

本 skill 的执行状态追踪使用以下 **6 步序列**，对应工作流中的关键断点/恢复点：

```
步骤序列（6 步）：
  1: TDD 修复（写/改 BDD 测试 → RED 失败 → 修代码 → GREEN 通过，循环直到 BDD 全绿）
  2: E2E 自动验收 + 检查 + 确认（失败 → 回到 Step 1 继续 TDD 修复，循环）
  3: Specs 修复 + TDD 验证 + 代码审核
  4: 回归测试 + E2E 回归门禁 + 操作文档
  5: 手动验证 + 部署
  R: 技能反思（调用 gts-skill-reflect，CLEANUP 后、保存前执行）
  S: 保存（gts-submit-save，最后一步，通知前）

> 🔴🔴🔴 **核心循环（2026-08-02 兄弟定稿）**：验收 = `TDD(BDD RED→GREEN) → E2E → E2E 失败回 TDD` 循环。
> 必须先让 BDD 测试全绿（修复代码直到通过），**然后**才跑 E2E；E2E 失败必须**回到 Step 1 继续 TDD 修复**（不是单向流水线走完），直到 BDD + E2E 双绿才进后续步骤。
```

### INIT（skill 触发时第一时间执行）

```powershell
# 1. 获取/生成 session ID 和 workflow ID
$sid = node scripts/skill-exec-manager.cjs get-session-id | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
$wid = node scripts/skill-exec-manager.cjs get-workflow-id $sid | ConvertFrom-Json | Select-Object -ExpandProperty workflowId

# 2. 同任务预检（dispatch 前查 OpenCode DB 确认无「相同任务」活跃 session；不同任务直接并行，全局 dispatch 锁已废弃 2026-08-01）
# 3. stateInit + issueCreate + registryRegister
node scripts/skill-exec-manager.cjs init $sid $wid "gts-acceptance" `
  --steps 1,2,3,4,5,R `
  --summary "<验收摘要>" `
  --criteria "<验收标准>" `
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
  "skillName": "gts-acceptance",
  "sessionId": "<自动获取或生成>",
  "workflowId": "wf_<timestamp>_<random8>",
  "totalSteps": 5,
  "stepSequence": ["1", "2", "3", "4", "5"],
  "completedSteps": [],
  "remainingSteps": [
    {"index": "1", "name": "BDD + 删除影响验证"},
    {"index": "2", "name": "E2E 自动验收 + 检查 + 确认"},
    {"index": "3", "name": "Specs 修复 + TDD 验证 + 代码审核"},
    {"index": "4", "name": "回归测试 + E2E 回归门禁 + 操作文档"},
    {"index": "5", "name": "手动验证 + 部署 + 保存"},
    {"index": "R", "name": "技能反思（调用 gts-skill-reflect）"}
  ],
  "completedCount": 0,
  "context": {
    "featureSummary": "<本次验收目标>",
    "verificationCriteria": "<验收标准>"
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
🤖 检测到未完成的工作流：gts-acceptance

   已完成（{n}/{total}）:
     ✅ 1: BDD + 删除影响验证
     ✅ 2: E2E 自动验收 + 检查 + 确认

   剩余步骤（{m}/{total}）:
     📋 3: Specs 修复 + TDD 验证 + 代码审核
     📋 4: 回归测试 + E2E 回归门禁 + 操作文档
     📋 5: 手动验证 + 部署 + 保存
   📋 R: 技能反思（调用 gts-skill-reflect）

   最后更新：{相对时间}

   🔜 即将执行下一步 Step 3
   （如需跳过、调整或放弃，请现在告知）
```

#### 长时间中断恢复模板

```
🤖 检测到 {duration} 前中断的工作流：gts-acceptance

   上下文：
     featureSummary: <之前记录的内容>
     verificationCriteria: <之前记录的内容>

   已完成（{n}/{total}）:
     ✅ 1: BDD + 删除影响验证

   剩余步骤（{m}/{total}）:
     📋 2: E2E 自动验收 + 检查 + 确认
     📋 3: Specs 修复 + TDD 验证 + 代码审核
     📋 4: 回归测试 + E2E 回归门禁 + 操作文档
     📋 5: 手动验证 + 部署 + 保存
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

当本 skill 被其他 skill（如 `gts-dev-fix`、`gts-dev-feat`、`gts-dev-workflow`、`gts-dev-refactor`）流程中调用时：
- **由调用方管理状态文件**，本 skill 不执行 INIT/STEP_DONE/CLEANUP
- 仅在**独立触发**时（兄弟直接说「验收：<标准>」「验收」）初始化自己的状态追踪

**判断方式**：执行任何步骤前读取 `.skill-exec-state.<sessionId>.json`。如果文件存在且 `skillName` 不是 `"gts-acceptance"` → 视为嵌套调用，跳过所有状态文件操作。

**反思规则**：

| 场景 | 反思 | pitfalls 记录 |
|------|------|--------------|
| **独立触发**（兄弟直接说「验收」） | ✅ Step R 执行 gts-skill-reflect | 记到自己的 issue |
| **嵌套调用**（被 feat/fix/refactor 调用） | ❌ 跳过反思 | 用**调用方 sessionId** 执行 `append-pitfall`，记到顶层 issue |

> 嵌套时反思由顶层 skill 统一执行，本 skill 不重复反思。

---

## 🔴🔴🔴★ 核心原则：所有代码操作必须调度 OpenCode（最高优先级）

**这是铁律，不是建议。违反一次就必须补 Skill 修订。**

本 skill 涉及的所有代码相关操作 — **代码修改、测试运行、编译检查、测试文件创建/修改** — **均不得由 bot 直接执行**，必须编写 brief 调度 OpenCode（Pro / Flash）执行。

bot 在本 skill 中只负责：写 brief → dispatch → 验证输出 → git 操作 → 部署。

> 🔴 **所有 OpenCode 调度统一走 `skills/opencode-schedule/SKILL.md`**：写 brief → 预检进程列表 → `$brief` 变量传参（禁止 pipe）→ poll 跟进。

> #### 🔴 Post-poll 绑定配置
>
> 本 skill 在**独立触发时**有独立状态追踪。每次 OpenCode poll 完成后，如果存在 active state file（`.skill-exec-state.*.json`），应检查当前进度是否匹配实际完成数。若落后则调 step-done：
>
> ```powershell
> $sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
> node scripts/skill-exec-manager.cjs step-done $sid --step-index <当前步索引> --step-name "<步骤名>"
> ```
>
> 本 skill 步骤较多，不强制每步加独立绑定点，而是在 STEP_DONE 标记处（每步末尾）检查：poll 完成后当前步骤是否为最后一 dispatch → 调 step-done。
>
> **由调用方管理状态文件时**（嵌套模式）：由调用方负责 step-done，本 skill 不执行。

### 🔴 验证结果循环

OpenCode 跑完后，bot 只能 **阅读输出结果**，**不能直接动手修**。

```
OpenCode 完成 → bot 读结果
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

> 违反后果：跳流程、漏改漏测、浪费时间。兄弟看到了会立刻指出来。

---

## 🔴 前置：查 E2E 操作手册

编写或修改 E2E scenario JSON 前，先查阅 `packages/frontend-multiplayer/test/e2e/E2E-OPERATIONS.md`：
- 找现成的操作积木（block），用积木组合出验收场景
- 查看常见操作组合，减少 trial-and-error
- 检查国际化文字对照表，用对按钮文字

E2E 验收通过后，同步更新操作文档（见 Step E2）。

## 🔴 两级测试流程规则（本 Skill 所有步骤共用）

### 区分

| 层级 | 工具 | 成本 | 验证内容 |
|------|------|------|---------|
| 集成测试 | BDD / jest | 低（秒级） | 代码层逻辑，纯函数/逻辑层/API 流程 |
| 自动测试 | E2E Playwright | 高（分钟级） | 浏览器层完整渲染 + 用户交互 |

### 流程纪律

**集成测试 > E2E 自动测试** — 因为集成测试成本更低，应优先使用。

```
Bug/验收标准 → 写/改 BDD 测试复现 → 收集数据 → 调度 OpenCode Pro 分析根因
→ 修改测试使其按根因场景真实失败（RED）
→ 调度 OpenCode 修复代码 → 集成测试全绿（GREEN）
→ 调度 OpenCode 写/改 E2E 测试脚本 → 跑 E2E
→ ✅ E2E 通过 → 自动部署 → 双通道通知
→ ❌ E2E 失败 → 回到 TDD：写/改 BDD 测试复现 E2E 失败行为 → RED → 修 → GREEN → 重跑 E2E（循环）
```

> 🔴🔴🔴 **核心循环（2026-08-02 兄弟定稿）**：先 TDD 修到 BDD 全绿 → 再跑 E2E；E2E 失败必须回 TDD 继续修，不允许单向流水线。

### 预发 bug 的特殊处理

预发环境 E2E 只跑预发，本地不跑。

| 类型 | 处理 |
|------|------|
| 预发 bug | 预发 E2E 复现（`--env preproduction`）→ 截图+日志 → 调度 OpenCode Pro 分析 |
| 本地 bug | 本地 E2E 复现 |
| 预发部署/环境 bug | 预发 E2E |

## 通知协议（本 Skill 所有步骤共用）

验收结束时执行**双通道通知**：

### 1️⃣ 桌面通知
```bash
msg * "<30字摘要>"
```

### 2️⃣ 飞书通知（可选，仅在线 bug 或部署时）
```json
{
  "kind": "agentTurn",
  "message": "<通知内容（≤10字）>",
  "delivery": { "mode": "announce", "channel": "feishu", "to": "user:ou_..." }
}
```

### 通知纪律
- 飞书通知内容 **≤10 字**
- 桌面通知必须调用 `msg *`
- 结果通知在验收结束或部署完成时发送

---

## E2E 验收协议

### 适用的测试脚本

- E2E 验收脚本：`packages/frontend-multiplayer/test/e2e/scenarios/auto/*.json`（通过 `node e2e-runner.cjs` 运行）
- 窗口模式由下方 🔴 窗口模式规则决定

### 脚本结构

```
登录 → 创建房间 → 加入 → 准备 → 开始游戏 → 操作 → DebugEndGame → 验证 UI 元素
→ 关闭弹窗 → 返回房间 → 再次进入 → 截图
```

### 🔴🔴🔴 E2E 验证标准 — 必须验证行为正确，不只是无报错（2026-07-15 新增）

每个 E2E scenario 的 evaluate/assert 块必须对核心行为做断言：

| 场景 | 必须验证 | 不能只验 |
|------|---------|---------|
| 人物移动 | 位置/状态变化（`getCameraState` 或坐标） | `keyboard.down('w')` 没 crash |
| 游戏启动 | `inGame` 状态变化 / canvas 出现 | `sendEnterGame` 没 throw |
| 加入房间 | `roomId !== -1` | API 返回了结果 |

**经验教训（2026-07-15）：** 31/31 全绿但问题仍然存在，因为验证的是「没报错」不是「行为正确」。

---

## 🔴🔴🔴 TDD 纪律 — 先让测试失败（2026-07-06 新增）

验收流程中必须先让集成测试因 bug 真实失败，再修复代码使其通过。

- **禁止用模拟函数代替实际代码做集成测试**
- **正确做法**：测试必须直接调用被测试的实际代码/组件，在不修复时因 bug 真实 ❌ 失败
- **2026-07-15 补充：必须看到真实的失败场景再设计 fix**
  - 先加诊断日志确认失败模式 → 再设计修复方案
  - 禁止猜根因：不通过加日志确认就写代码修复
  - 如果 OpenCode 一次性写修复+测试（未 RED），必须人工制造 RED 场景或追加诊断
- 跟「先汇报再继续」「等确认发通知」「入口检查」同级最高优先级

---

## 流程（流水线 — 自动执行，不需要兄弟确认）

> 严格按以下顺序执行，**每一步都不跳过**。
> 🔴 窗口模式：**非全自动模式**（默认）→ 有头 headed | **全自动模式激活时**（gts-auto 生效）→ 无头 headless

### Step 1: TDD 修复循环 — BDD 全绿 ✅（🔴 2026-08-02 兄弟定稿：验收从这里开始）

> 🔄 **调度 OpenCode Flash** 执行以下 TDD 循环，直到全部 BDD + 集成测试通过：

**TDD 循环（必须先 RED 再 GREEN）：**

```
1. 写/改 BDD 测试复现验收标准（兄弟给的标准直接转成测试断言）
2. 跑测试 → 必须真实 ❌ RED（因 bug 失败，不是测试本身写错）
3. 调度 OpenCode 修复代码 → 再跑测试 → ✅ GREEN
4. 还有未通过的 BDD → 回到 2 继续修，直到全部通过
```

> 🔴🔴🔴 **验收标准直接转 BDD 断言**：兄弟说「验证 X」→ 第一步就是写能测 X 的 BDD 测试（如「模型不移动」「手臂/头在移动」），**必须先跑出 RED 再修**。
>
> 🔴 **禁止跳过 RED**：如果直接写修复+测试（未 RED），必须人工制造 RED 场景或追加诊断（2026-07-15 纪律）。

> 如果还有未通过的 BDD：
> 1. 🔴 审查是否与本次改动相关（同一函数/类型/模块/测试文件）
> 2. 🔴 相关 → 必须修复。没有「预存失败」这个说法
> 3. ✅ 完全不相关的独立模块 → 记录到 daily log 并说明理由
> 
> #### 🔴🔴🔴 [预存失败零容忍]
> 跑全量测试后，所有 **已有 failure** 必须逐条审查：
> - 同一类型/接口/常量 → **修**
> - 同一模块/功能 → **修**
> - 同一测试文件/feature → **修**
> - 完全不相关独立模块 → 标记预存 + 说明理由记录到 daily log
> **禁止用「这条早就坏了」跳过修复**
>
> #### 🐛🔴 [测试失败根因分析纪律]
> **每个失败必须先判断根因归属，不能默认「pre-existing」跳过。**
> ```
> 测试失败
>   ├── 被测代码有 bug（测试是对的）→ 修代码
>   ├── 测试本身写错了 → 修测试
>   └── 环境/配置问题 → 修配置
> ```
> 每个失败输出明确结论：文件、场景、根因、结论（被测代码bug/测试写错/预存无关）。
> 2026-07-28 教训：match-service 2 个测试 failure 直接归类 pre-existing 没分析根因。

**OpenCode 执行命令**（按项目实际测试配置调整）：`npx jest --config <项目 jest config> --forceExit 2>&1`

**OpenCode 返回格式**：JSON 摘要（通过/失败数、失败详情路径）

### Step 2: E2E 自动验收 ✅（🔴 失败 → 回到 Step 1 TDD 循环）

> 🔴🔴🔴 **前置条件：Step 1 BDD 必须全绿**（2026-08-02 兄弟定稿：先 TDD 修到 BDD 通过，再跑 E2E）。
> 🔄 **调度 OpenCode** 运行 Phase 0 设计的 E2E 测试场景。OpenCode 负责执行，bot 负责 poll 收集日志和截图。
> 🔴 **E2E 失败 → 必须回到 Step 1 继续 TDD 修复**（先写/改 BDD 测试复现 E2E 失败行为 → RED → 修 → GREEN → 再跑 E2E），循环直到 BDD + E2E 双绿。不是单向流水线。

运行命令：`cd packages/frontend-multiplayer && node e2e-runner.cjs <场景JSON路径>`

**OpenCode 返回的 E2E 结果要求：**
- 通过/失败状态
- 截图路径列表
- 日志摘要（含失败时的关键上下文）
- 控制台错误摘要

bot 收到结果后判断：
- ✅ 通过 → 进 Step 2.1
- ❌ 失败 → bot 读取 OpenCode 返回的失败日志和截图，调度 **OpenCode Pro** 分析根因 → 修 → **🔴 走 gts-code-review 审核修复代码** → 重测
- 🔴🔴 **再次失败 → 循环修复：** 如果审核后重测仍然失败 → 返回到「加诊断日志」步骤重新走一遍循环（诊断→根因→修→审核→重测），每轮有新增代码则必须重新审核
- 全自动模式下自动执行代码审核（`gts-code-review skip` 标记不生效——E2E 失败后的修复必须审核）

> **验证标准** — 必须验证行为正确，不只是无报错。OpenCode 返回的结果中每个 evaluate/assert 块的输出必须有明确的通过/失败标记。

#### Step 2.1: 检查 E2E 测试符合验收标准

> 🔄 **调度 OpenCode Flash** 读 E2E scenario JSON 文件，按以下标准逐条检查并输出 ✅/❌：

| # | 检查项 | 说明 |
|---|--------|------|
| 1 | 行为验证 ✅ | E2E 的 evaluate/assert 块必须断言核心行为正确（不只是检查无报错） |
| 2 | 用户可见 ✅ | 验证的是用户能感知的结果（位置变化、UI 变化、状态变化），不是内部变量 |
| 3 | 可复现 ✅ | 步骤清晰、无歧义、有明确等待和超时 |
| 4 | 截图消费 ✅ | 步骤中包含至少一个 screenshot 块供人眼验证 |
| 5 | 环境一致 ✅ | 与真实使用环境对标（headless vs headful 差异、tab visibility 等） |
| 6 | 符合 Specs ✅ | 验收标准匹配 `笔记/项目文档/specs/` 中的 Main Specs 行为契约 |

**发现问题 → 调度 OpenCode Flash 修改 E2E 脚本**，修改完再运行。

#### Step 2.2: 验证确认

> 🔄 **调度 OpenCode** 读 E2E 结果日志 + 截图，逐一回答以下问题并输出结论：

1. **每个 bug 的成功标准是否被验证了？**（不是「没报错」，是「行为正确」）
2. **E2E 环境与真实使用环境一致吗？**（headless vs real browser、tab visibility 等差异）
3. **截图被检查了吗？**（不是纯装饰）
4. **如果兄弟现在测试，能复现 E2E 的通过结果吗？**

如果任何一条答「否」→ Bot 告知兄弟不能算验收通过，需要补测。

### Step 3: 🔴 修复 Specs（轻量自检）

> 🔄 **调度 OpenCode Flash** 检查并同步 specs：
- 新增或修改的 .feature 场景 → 在 `笔记/项目文档/specs/` 中补充/更新对应模块的场景描述
- 新增的 E2E 验收场景 → 在 `笔记/项目文档/specs/` 中补充对应模块的场景描述
- 确保主 specs 场景清单与 BDD 测试场景保持同步

### Step 4: 🔴🔴🔴 TDD 验证集成测试

> 🔄 **调度 OpenCode Flash** 执行 TDD 验证流程，汇报每一步的结果：

**必须执行，不可跳过。** 操作步骤：
1. 撤销修复代码 → 运行集成测试（RED）
2. 恢复修复代码 → 运行集成测试（GREEN）

> 如果集成测试不因 bug revert 而失败（RED 变 GREEN），说明测试没有真正覆盖 bug 路径。

#### 🔴 Post-poll 绑定：TDD 验证 OpenCode poll 完成后自动 step-done

poll 确认 TDD 验证完成后，**立即**更新 issue 进度：

```powershell
$sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
node scripts/skill-exec-manager.cjs step-done $sid --step-index 4 --step-name "TDD 验证集成测试"
```

### Step 5: 🔴 代码审核

代码已修改完成，此时审核代码质量。走 gts-code-review skill 完整流程（调度 OpenCode Pro 做外部审核，不是 OpenCode Flash 的自审）。

> 🔴 审核 brief 必须贴完整重构规则：从 `笔记/项目文档/rules/workflow-rules.md` 的 🔴🟡🟢 审核表格和 `笔记/项目文档/rules/test-standards.md` 各层验收标准实时读取，逐条贴入 brief，不能浓缩。
> 🔴 审核范围 = 本变更的所有改动文件（不是 .last-review diff）。
> 🔴 **所有层级（🐛🔴🟡🟢📋）全部写进 fix brief 一次 dispatch 修完**，一条不能漏。只有兄弟明确说跳过才不修。

### Step 6: 🔴 两层回归（集成 + E2E）

> 走 **`gts-regression`** skill 统一执行两层回归：先集成回归（Layer 3）再 E2E 回归（Layer 4），场景和环境一次选定。

**如果旧 BDD + 集成回归 + E2E 不全绿 → 回归失败**，回退并重新设计修复方案。

> **注意：** 如果旧 BDD 中**本来就有红了的失败**（即预存失败），必须按 Step 1 的 🔴🔴🔴 [预存失败零容忍] 规则逐条审查决定是否修复。预存失败不能作为「旧 BDD 红了但不回退」的借口。

### Step 8: 更新操作文档

> 🔄 **调度 OpenCode Flash** 执行以下操作并汇报：
1. 查阅 `test/e2e/E2E-OPERATIONS.md`，确认本次验收使用到的操作是否已有对应积木
2. 新的原子操作 → 新建积木 `.cjs` + 更新文档
3. 新的组合模式 → 更新「常见操作组合」
4. 积木有 bug → 修复积木 + 更新文档

### Step 9: 🔴 手动验证（交互式 M 阶段）

> 本步是 M 阶段入口。进入后必须明确宣布「进入手动验证阶段」。

**流程：**

**9.1 明确宣布进入手动验证：**
```
? 进入手动验证阶段。兄弟，要测本地还是线上？
1. 本地开发服务器
2. CloudBase 预发布
3. CloudBase 正式
```

**9.2 准备环境：** 本地修复需重启服务（调度 OpenCode 执行）：
1. 杀掉旧 room-service 进程（按端口 4003 精确杀）
2. 杀掉旧 frontend-multiplayer webpack 进程（按端口 8093 精确杀）
3. 启动 room-service：`cd packages/room-service && Start-Process -WindowStyle Hidden powershell -ArgumentList "-NoProfile -Command npx ts-node src/index.ts"`
4. 启动多人联网前端：`cd packages/frontend-multiplayer && Start-Process -WindowStyle Hidden powershell -ArgumentList "-NoProfile -Command yarn webpack:dev-server"`

线上修复 → 跳过重启，直接部署（Step 10）。

**9.3 兄弟验证：** 兄弟手动测试。发现问题时：

| 问题类型 | 行为 |
|---------|------|
| 明显 bug | 宣布「发起子 fix：<描述>」→ 等兄弟确认 → dispatch |
| 不确定 bug | 问兄弟「要排查吗？」 |
| 新需求 | 问兄弟「要发起子 feat 吗？」 |

- ❌ 不能默默地修
- ✅ 必须说「发起子 fix」+ 简要描述 + 等兄弟回 OK

### Step 10: 自动部署到预发

- E2E 本地通过后 → **自动部署到预发环境**，不询问兄弟
- 部署流程：走 gts-deploy skill，目标为预发环境（`deploy_preproduction`）
- 部署失败 → 报错，问兄弟要不要修

### Step R：技能反思（仅独立触发时）

嵌套调用时**跳过本步骤**，直接进 Step 11（保存）。

独立触发时，调用 gts-skill-reflect：

```
走 skills/gts-skill-reflect/SKILL.md 流程（收集 pitfalls + 执行指标 + 记忆检索 → 分析 → 报告 → 等兄弟确认）
```

> 反思产出改进建议，**等兄弟确认后才执行**（skill_workshop），不自动改 skill。
> 反思不阻塞通知；反思完成后进 Step 11（保存）继续。
> 🔴 **保存必须在反思之后**：gts-submit-save 是工作流最后一步（通知之前），确保反思产出的 skill 更新/修复/报告能一起被提交，不会分两批。

### Step 11: 🔴 保存记忆和笔记（最后一步）

> 🔄 **必须走 gts-submit-save skill 完整流程**（git commit + 保存记忆/笔记 + git push），禁止跳过或替代。

### Step 12: 双通道通知

**通知时机：** 验收结束时立即执行。

| 结果 | 桌面消息 | 飞书通知（≤10字） |
|------|---------|-----------------|
| 全绿 + 部署成功 | ✅ ✅ | `验收通过+已部署` |
| E2E 失败 | ❌ | `验收未通过` |
| 部署失败 | ⚠️ 部署失败 | `部署失败` |

通知内容必须包含：
- 测试结果（全绿/失败）
- 测试文件/功能
- 部署结果

---

## 验收优化记录

### 历史教训（重要！）
1. **不要模拟**：集成测试不要 mock 实际代码（replayState / MockWsClient），必须调用 `readState` / `writeState` 真实操作
2. **验收流程全程自动化**：E2E 期间不打断不确认，不要问「我要跑了哦？」
3. **验收结束必须通知**：禁止只跑完不说话（2026-06-26 规则收紧）
4. **TDD 纪律**：必须先 RED 失败再 GREEN，禁止跳过（2026-07-06 新增）
5. **根因分析交给 OpenCode Pro**：不自己分析根因（2026-07-06 新增）
6. **E2E 通过后自动部署到预发**：不询问，直接部署预发（2026-07-06 兄弟要求，2026-07-16 改为预发）
7. **验证行为正确，不只是无报错**（2026-07-15 新增）。看 `pass/fail` 计数不够，每个核心行为必须有断言
8. **先确认失败模式再设计 fix**（2026-07-15 新增）。禁止猜根因：加日志重现失败→日志分析→设计修复→RED→GREEN
9. **截图必须消费**（2026-07-15 新增）。截图不是为了装饰，必须被人眼或 automated check 验证
10. **E2E 环境必须对标真实使用**（2026-07-15 新增）。headless 独立浏览器 ≠ 实际浏览器标签页。渲染层差异可能掩盖问题
11. **E2E 失败也要先确认失败模式**（2026-07-15 新增）。加诊断日志（截图+控制台+网络）→ OpenCode Pro 分析根因，禁止猜
12. **集成测试必须符合 feat/fix 标准**（2026-07-16 新增）。在 Step B.3 按真实路径/覆盖核心/边界覆盖/可验证 4 条逐条检查
13. **E2E 测试必须符合验收标准**（2026-07-16 新增）。在 Step D.0 按行为验证/用户可见/可复现/截图消费/环境一致/符合 Specs 6 条逐条检查

---

## 附录：多测试/多 bug 顺序验收（2026-07-19 修订）

如果兄弟报告了多个 bug 或多个测试需要验收，分两阶段走，效率更高：

### 第一阶段：逐个集成测试修复（批量）

对所有 bug/测试，按顺序逐个走集成测试阶段，**不穿插 E2E**：

1. 列清单，排好顺序
2. 按顺序逐个：
   - Step A（识别问题）
   - Step B（集成测试 RED）
   - Step B.3（检查集成测试质量）
   - Step C（修复 GREEN）
   - Step C.4（同步更新 Specs）
   - Step C.5（expected-state 校验）
3. 所有 bug 的集成测试全部通过后，进入第二阶段

### 第二阶段：统一 E2E 验收

一次 E2E 验收覆盖所有已修复的场景：

1. Step D.0（检查 E2E 脚本质量 — 检查是否覆盖了所有修复的场景）
2. Step D（统一跑 E2E — 一次覆盖所有修复）
3. Step D.3（验证确认）
4. Step D.4（同步更新 Specs — 验证确认通过后再更新）
5. Step E2（更新操作文档）
6. Step G（自动部署到预发）
7. Step H（双通道通知）

### 例外情况

- 如果兄弟指定「逐个完全走完」→ 每个 bug 独立走完完整流程（含 E2E）再搞下一个
- 如果某个 bug 的 E2E 场景和其他 bug 互斥或环境冲突 → 独立验收

## 附录：指定 E2E 场景验收

如果兄弟直接指定了几个 E2E scenario JSON 文件要验收通过（不先从 bug 出发）：

### 🔴 第一阶段：读场景 + 写集成测试（必做）

> **每个 E2E scenario 必须先有对应的集成测试，才能进入 E2E 阶段。**
> 集成测试成本远低于 E2E，优先用集成测试验证核心行为，E2E 只做端到端验证。

1. **读 E2E scenario JSON** — 理解每个场景的操作步骤和预期行为
2. **写 BDD 集成测试** — 根据 E2E 场景的核心行为，写对应的 .feature + .steps.ts，调用实际代码
3. **跑集成测试**：
   - 有 bug → RED ❌ → 走 Step C 修复 → Step C.4 同步 specs
   - 无 bug → 全绿 ✅ → 跳过修复，直接同步 specs
4. 每个 E2E 场景都走完以上步骤

**违反后果：** 缺少集成测试就直接跑 E2E，遇到失败只能从浏览器截图猜根因，无法低成本复现。

### 第二阶段：统一 E2E 验收

1. Step D.0（检查 E2E 脚本质量）
2. Step D（统一跑所有指定 E2E 场景）
3. Step D.3（验证确认）
4. Step D.4（同步更新 Specs — 验证确认通过后补充 E2E 场景描述到主 specs）
5. Step E2（更新操作文档）
6. Step G（自动部署到预发）
7. Step H（双通道通知）

### 关键区别

> 🔴 集成测试阶段在两个流程中都是**必做**。

| 从 bug 出发 | 从 E2E 场景出发 |
|------------|---------------|
| bug → 写集成测试复现 → 修复 → E2E 验收 | E2E 场景 → 读场景写集成测试 → 可能有 bug 也可能没有 |
| 集成测试匹配已知 bug | 集成测试匹配 E2E 场景行为 |
| RED 是可预期的 | RED 可能不出现（代码本来就没问题） |

## 附录：参考文件
- E2E 基础路径：`packages/frontend-multiplayer/test/e2e/`
- E2E runner: `packages/frontend-multiplayer/test/e2e/e2e-runner.cjs`
- E2E helper: `packages/frontend-multiplayer/test/e2e/e2e-helpers.cjs`
- 自动测试场景：`packages/frontend-multiplayer/test/e2e/scenarios/auto/*.json`
- 验收教训（2026-07-15）：`笔记/项目文档/knowledge/e2e-acceptance-lessons-2026-07-15.md`
- 场景索引维护规则：见 `skills/gts-e2e-test/SKILL.md` 和 `skills/gts-e2e-auto/SKILL.md`
