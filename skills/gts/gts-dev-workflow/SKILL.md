---
name: "gts-dev-workflow"
description: "brief Step C 嵌入完整审核清单; Step B 禁止 _simulate*; Step G 独立步骤+完整重构规则引用"
---

# gts-dev-workflow — GTS-Play 多人联网 TDD 流程

> 兄弟说 `feat:` / `refactor:` → 自动触发本 skill。
> **gts-dev-workflow 不再侦听 fix:**，fix 由 gts-dev-fix 统一入口。

---

本 skill 是一个**编排型技能**，它的核心工作是：
1. 把配置和上下文写给 OpenCode
2. 调度 OpenCode 执行实际工作
3. 我（助手）只负责验证 + 提交

所有 OpenCode 调度相关细节统一由 `opencode-schedule/SKILL.md` 管理，
本 skill 只写「调度什么、调度了谁、等什么结果」。

## 🔴🔴🔴★ 核心原则：所有代码操作必须调度 OpenCode（最高优先级）

**这是铁律，不是建议。违反一次就必须补 Skill 修订。**

本 skill 涉及的所有代码相关操作 — **代码修改、测试运行、编译检查、静态分析、
测试文件创建/修改、E2E 场景创建/修改** — **均不得由 bot 直接执行**，
必须编写 brief 调度 OpenCode（Pro / Flash）执行。

bot 在本 workflow 中只负责：写 brief → dispatch → 验证输出 → git 操作 → 部署。

### 🔴 验证结果循环（OpenCode 完成后）

OpenCode 跑完后，bot 只能 **阅读输出结果**，**不能直接动手修**。

```
OpenCode 完成 → bot 读结果
  ├─ 全绿 ✅ → 继续下一步
  └─ 有失败 ❌ → 分析失败原因 → 写新 brief（含失败详情+原因）→ 调度 OpenCode 修
       └─ 再读结果 → 循环直到全绿
```

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

> 违反后果：跳流程、漏改漏测、浪费时间。兄弟看到了会立刻指出来。详情见 `opencode-schedule/SKILL.md`。

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

本 skill 的执行状态追踪使用以下 **7 步序列**：

```
步骤序列（9 步）：
  A: 分析/方案（OpenCode Pro）
  B: 调度 OpenCode 实现
  C: 编译检查
  D: BDD 测试
  E: E2E 测试
  F: 代码审核
  G: 回归事后复盘
  R: 技能反思（仅顶层直接触发时，调用 gts-skill-reflect）
  S: 保存（gts-submit-save，最后一步，通知前）
```

> 🔴🔴🔴 **phase 归档点（2026-08-16 token 审计定稿）** — 每完成一个大 phase（A 方案确认 / B 实现完成 / F 审核完成）必须归档当前 bot 会话、开新会话继续，禁止一个会话跑完整条流水线（8/15 教训：bot 主线 7.5h 会话烧 $3.55，cacheRead 占 91.6%）。新会话开头贴摘要：已完成 / 剩余 / 关键结论。详见 opencode-schedule 5️⃣ 硬性规则。

### INIT（skill 触发时第一时间执行）

```powershell
# 1. 获取/生成 session ID 和 workflow ID
$sid = node scripts/skill-exec-manager.cjs get-session-id | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
$wid = node scripts/skill-exec-manager.cjs get-workflow-id $sid | ConvertFrom-Json | Select-Object -ExpandProperty workflowId

# 2. 同任务预检（dispatch 前查 OpenCode DB 确认无「相同任务」活跃 session；不同任务直接并行，全局 dispatch 锁已废弃 2026-08-01）
# 3. stateInit + issueCreate + registryRegister
node scripts/skill-exec-manager.cjs init $sid $wid "gts-dev-workflow" `
  --steps A,B,C,D,E,F,G `
  --summary "<任务摘要>" `
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
  "skillName": "gts-dev-workflow",
  "sessionId": "<自动获取或生成>",
  "workflowId": "wf_<timestamp>_<random8>",
  "totalSteps": 7,
  "stepSequence": ["A", "B", "C", "D", "E", "F", "G"],
  "completedSteps": [],
  "remainingSteps": [
    {"index": "A", "name": "分析/方案（OpenCode Pro）"},
    {"index": "B", "name": "调度 OpenCode 实现"},
    {"index": "C", "name": "编译检查"},
    {"index": "D", "name": "BDD 测试"},
    {"index": "E", "name": "E2E 测试"},
    {"index": "F", "name": "代码审核"},
    {"index": "G", "name": "回归事后复盘"}
  ],
  "completedCount": 0,
  "context": {
    "featureSummary": "<一句话描述本次任务>",
    "verificationCriteria": "<关键验收标准>",
    "briefPath": "<brief 文件路径>"
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
🤖 检测到未完成的工作流：gts-dev-workflow

   已完成（{n}/{total}）:
     ✅ A: 分析/方案
     ✅ B: 调度 OpenCode 实现

   剩余步骤（{m}/{total}）:
     📋 C: 编译检查
     📋 D: BDD 测试
     📋 E: E2E 测试
     📋 F: 代码审核
     📋 G: 回归事后复盘

   最后更新：{相对时间}

   🔜 即将执行下一步 Step C
   （如需跳过、调整或放弃，请现在告知）
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

## 覆盖范围

所有调度 OpenCode 的 skill（本文件、gts-code-review、以及其他需要 opencode 的 skill）。

---

## 🔴 统一 OpenCode 调度流程

详见 `opencode-schedule/SKILL.md`，本 skill 只做协调。

---

## Phase A：分析 + 方案

> `feat:` / `refactor:` 触发时 → 进 Phase A。

**核心原则：**

| 阶段 | 谁来做 | 输出 |
|------|--------|------|
| 根因分析 + 方案 | OpenCode Pro | `changes/<功能名>/solution.md` |
| 代码实现 + 测试 | OpenCode Flash | 代码 + 测试 |
| 代码审核 | 走 gts-code-review skill 完整流程 | 审核报告 |
| E2E 场景选择 | 我（列出可选场景 → 兄弟选择） | 场景列表 |
| E2E 执行 | 调度 OpenCode | E2E 结果报告 |
| 部署 | 我（助手） | — |

**不调度的步骤：**
- 方案确认 — 我审方案，向兄弟展示，等兄弟 OK
- 结果确认 — 我读 OpenCode 的结果，确认符合要求
- 代码审核 — 我调度 gts-code-review skill，转达结果
- 提交 — 兄弟说「提交」才提交

### 🔴 判断是否「兄弟已确认方案」

如果在 Phase A Step 2 之前检查发现 `笔记/项目文档/changes/` 已有活跃变更（即兄弟已确认方案的 changes specs），同时方案 specs 中已包含 Expected-state JSON + Delta Specs（即 OpenCode Pro 已产出完整方案）→ **跳过 Step 1 的方案阶段，直接进 Step 2**

### Step 1：方案评估（OpenCode Pro）

> 方案评估应包含：
> - 代码审核必要性评估标记（skip / required）
> - 方案整体复杂度评估（simple / complex）

**调度 OpenCode Pro 分析需求/方案：**
1. 读 `笔记/项目文档/specs/` 中的 Main Specs
2. 读 `笔记/项目文档/changes/<活跃变更>/` 下的 Delta Specs（如无，自动补全）
3. 分析需要的改动范围（文件级）
4. 评估代码审核必要性（skip / required）
5. 评估整体复杂度（simple / complex）
6. 输出方案文档到 `笔记/项目文档/changes/<日期>-<功能名>/`
7. 我评估后展示给兄弟，等兄弟确认后再进 Step 2

**Step 1 内容（写入 brief）：**

```
## 需求

## 改动范围
- <文件路径> — <改动类型 + 一句话说明>

## 代码审核必要性评估
- required（涉及运行时核心逻辑修改）
- skip（极简改动，纯文档/配置/常量/注释/测试等，不影响运行时核心逻辑）

## 复杂度
- simple（1-2个文件改动，不影响模块边界）
- complex（跨模块/重构级改动）

## 方案
### 方案 A（推荐）
### 方案 B
### 方案 C
```

### 🔴 任务粒度标准（写方案/issue 步骤时遵守，2026-08-05 新增）

> 借鉴 superpowers writing-plans：任务细到「热情但经验不足的初级工程师 + 零项目上下文也能执行」。不强制 2-5 分钟那么极端，但要求：**执行者无需做设计决策**。

每个任务必须同时满足：
1. **单文件级别 or 单一职责**（一个任务只做一件事）
2. **含精确文件路径**（`packages/xxx/src/.../file.ts`，不是「相关模块」）
3. **含验证步骤**（怎么写确认做对了：`npx jest <文件>` / `npx tsc --noEmit` / 具体操作）
4. **不含设计决策**（方案已定才拆任务；方案未定 → 单独拆一个「出方案」任务）
5. 拆不出验证步骤的任务 → 拆回「先写验证方法」任务

**反面示例（禁止）：**「优化一下性能」「完善错误处理」「重构相关代码」——无路径、无验证、含设计决策
**正面示例：**「`packages/room-service/src/room.ts` 添加 `closeRoom(roomId)` 导出 + `npx jest packages/room-service/test/room.test.ts` 验证」

> 📊 **状态追踪**：Step A 完成 → STEP_DONE（移入 completed，更新 remainingSteps）

---

## Phase B：实现 + 测试

### Step 2：调度 OpenCode Flash 实现 + 写测试

**调度 OpenCode Flash（使用 Step 2 brief 模板），让它执行：**

- 读方案文档（`solution.md`）
- 读 specs（Main Specs + Delta Specs）
- 理解项目结构和编码规范
- 实现代码 + 测试
- 自我验证

**等待 OpenCode 完成 → 读结果 → 验证。**

#### 🔴 Post-poll 绑定：OpenCode 实现 poll 完成后自动 step-done

poll 确认 OpenCode 完成后，**立即**更新 issue 进度：

```powershell
$sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
node scripts/skill-exec-manager.cjs step-done $sid --step-index B --step-name "调度 OpenCode 实现"
```

#### Step 2 brief 模板（必须照抄）

```markdown
# <功能名称或修复名称>

共享规约见 `docs/agent-context.md`。

## 方案
<粘贴 Step 1 的方案>

## Changes Specs（变更规格 — 集成测试依据）
<粘贴 `笔记/项目文档/changes/<日期>-<功能名>/specs/` 中的 .feature 文件内容>

## 🟢 TDD 流程要求

必须严格按以下顺序执行，**一步不能省**：

### Step A：设计集成测试
- 后端改动 → BDD Feature + Steps（`test/integration/`，跨项目多模块）
- 前端改动 → jest integration test（`test/integration/`，走完整真实路径，不 mock）

### Step B：写集成测试代码
**只写测试代码（feature + steps），不动业务代码。所有断言直接写在 steps.ts 的 Given/When/Then 中。**

**🔴 禁止创建 `_simulate*` 模拟函数绕过真实代码路径** — 必须直接调用被测试源文件的导出函数。被测试代码是什么，测试就调什么，不封装、不模拟、不简化。

### 🔴 Step C：运行检查标准（逐条打勾，输出 ✅/❌ 结果）— **此步骤不可跳过**

**⚠️ 在 Step C 全部 ✅ 通过前，禁止进入 Step D（RED 测试）。有 ❌ → 回 Step B 修复测试代码 → 修完重检 Step C → 直到全 ✅。**

按以下 Layer 3 验收标准逐条检查已写好的测试代码，**每条都必须输出 ✅ 或 ❌**：

| # | 检查项 | 说明 | 严重度 |
|---|--------|------|--------|
| 1 | 回归 bug 覆盖 | 每个 Scenario 覆盖对应路径 | 🔴 |
| 2 | 跨模块 | import 2+ 项目的真实代码（单模块可豁免，注明原因） | 🔴 |
| 3 | 真实 import | 所有包 import 真实源码，**禁止 `_simulate*` 模拟函数** | 🔴 |
| 4 | 不依赖运行时 | 不需要启动服务进程 | 🔴 |
| 5 | Immutable 兼容 | List/Map 正确传递给接收数组的 API | 🔴 |
| 6 | 返回结构匹配 | 函数返回值结构准确匹配 | 🟡 |
| 7 | scenario 注释 bug | 头部注释对应的 bug/commit hash | 🟢 |
| 8 | 无 Three.js 依赖 | 前端包 mock 绕开渲染链 | 🟡 |
| 9 | 精确断言 | **注意 TypeScript numeric enum 不是字符串** | 🔴 |
| 10 | feature 标题可验证 | Scenario 标题写明具体验证行为 | 🟡 |
| 11 | **契约维度残留引用（🔥 新增 2026-07-26）** | 检查涉及删除/修改的导出是否有残留外部引用（stub / state 字段 / event 名 / API 签名一致性） | 🔴 |

**输出格式（必选）：** 逐条检查并输出结果，保存到输出末尾：
```
[Step-C 检查结果]
- [✅] #1 回归 bug 覆盖：4 个 Scenario 覆盖了全部修复路径
- [❌] #3 真实 import：`_simulate*` 绕过真实路径，需直接调用
...
```

**Step C 全部 ✅ → 进 Step C-ext 外部验证。有任何 ❌ → 回 Step B 修改测试代码，修完再跑 Step C 重检，直到全 ✅。**

### Step C-ext：🔴 证据规范 + 最小抽样验证（🔥 新增 2026-07-26）

**目的：** 防止 OpenCode pleasing bias 导致 Step C 虚过。OpenCode 必须附带证据，bot 最小抽样验证。

#### 1. 证据规范

OpenCode 输出 Step C 结果时，**每项检查必须附带证据路径**（不可只写结论）：

```
[Step-C 检查结果 - 证据版]
- [✅] #1 回归 bug 覆盖：4 个 Scenario 覆盖了全部修复路径
   证据：test/integration/scenario-01.feature 对应 bug #fix-bug1
- [✅] #3 真实 import：全部使用真实 import
   证据：test/integration/steps/xxx.steps.ts:12 import { processGameState } from '../../room-service/src/...'
- [✅] #11 契约维度：（无残留引用）
   证据：grep -r "setIsDebug" src/ 结果 = 0 条（仅本文件声明本身）
```

#### 2. 最小抽样验证（调度 OpenCode 独立验证）

调度 OpenCode Flash（或 Flash-free）执行抽样验证，**不由 bot 手动 grep**。

**验证 brief：**
```markdown
# Step C-ext：证据抽样验证

验证 OpenCode Flash 之前的产出是否符合 Step C 证据规范。

OpenCode Flash 的 Step C 结果：
<粘贴 OpenCode Flash 的完整 Step C 输出>

## 任务
1. 从 #1-#11 中随机抽取 2-3 项
2. 对照证据中的文件路径，grep 检查证据是否属实
3. 输出验证报告：
   - [✅] #N：证据属实（说明确认方式）
   - [❌] #N：证据不实（说明差异）
4. 全部一致 → 输出 ✅ 最终通过
5. 任一不一致 → 输出 ❌ 需回 Step B
```

**结果处理：**
- 验证 ❌ → 整批判定失败，回 Step B 修复测试代码
- 验证 ✅ → 进 Step D（RED 测试）

（全自动模式下：自动调度验证 OpenCode，发现不一致自动回退）

---

### Step D：运行 RED 🔴
运行集成测试，确认因功能未实现/bug 真实存在而真实失败。

### Step E：修复/实现业务代码
实施修复/实现方案，使集成测试通过。

### Step F：运行 GREEN ✅
运行全部 BDD 测试确认全绿。

## 命令
- BDD 测试：`npx jest --config jest.config.ts --no-cache packages/room-service/test/ --forceExit --detectOpenHandles 2>&1`
- tsc：`npx tsc --noEmit 2>&1`

> 写 brief 必须使用此模板，**禁止删减 TDD 流程步骤**

> 📊 **状态追踪**：Step B 完成 → STEP_DONE（OpenCode 实现完成，移入 completed）

---

## Phase B 剩余步骤（OpenCode 完成后 — 我执行的步骤）

### Step 2.3：🔴 重构回归门禁（涉及重构时强制）

**触发条件：** 本次改动涉及以下任一目录/文件:
- `packages/network-framework/`
- `packages/frontend-multiplayer/`
- `packages/room-service/`
- `packages/match-service/`
- 任何 `jest.config.*` 或 `tsconfig.*` 变更
- 任何跨模块接口/协议的修改

**执行内容（自动执行，不询问兄弟，全部调度 OpenCode）：**

#### 1. 调度 OpenCode Flash 执行回归门禁检查

bot 编写 brief → dispatch OpenCode Flash → 等结果 → 读报告。

**brief 模板：**
```markdown
# GTS-Play 重构回归门禁检查

变更范围：
<粘贴本次变更涉及的文件和模块>

## 1. 旧BDD不可变性检查（最高优先级）

运行全部已有 BDD 测试，确认仍然是绿色：

```
cd D:\Github\GTS-Play
npx jest --config packages/room-service/jest.json --forceExit 2>&1
npx jest --config packages/match-service/jest.config.ts --forceExit 2>&1
npx jest --config packages/forum/jest.config.ts --forceExit 2>&1
npx jest --config packages/frontend-multiplayer/jest.config.js --forceExit 2>&1
npx jest --config test/integration/jest.config.js --forceExit 2>&1
```

### 🔴 旧BDD红了 → 不准改测试文件！
- 列出具体红了哪些测试及原因
- 红了的 BDD 说明重构引入了回归，必须回头修复代码

### 🔴🔴🔴 预存失败检查
如果全量测试中**本来就有红了的测试**（预存失败），逐条审查是否与本次改动相关：
1. 共享同一类型/接口/常量/函数？→ **需修复**
2. 断言同一模块/功能的输出？→ **需修复**
3. 在同一测试文件或 feature 中？→ **需修复**
4. 完全不相关的独立业务模块 → 标记预存
5. **禁止用「预存失败」「这条早就坏了」跳过修复**

### 🐛🔴 测试失败根因分析纪律（每个失败必须判断）

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

> 2026-07-28 教训补充：之前 match-service 2 个测试失败，我直接归类为

## 2. 测试质量审计

执行 7 项检查，逐项输出 ✅/❌：
- mock检测 — 检查是否使用了 mock/stub 绕过真实代码
- 模糊断言 — 检查断言是否精确（非 toBeDefined/not.toThrow 等）
- 跨模块覆盖 — 检查测试覆盖了至少 2 个项目模块
- 旧BDD修改 — 检查是否有旧 BDD 被改动
- 回归场景 — 检查是否有场景覆盖核心回归路径
- 真实代码 — 检查测试直接调用真实代码，无模拟函数
- 注释代码 — 检查是否有注释掉的测试/断言

## 3. 两层回归（集成 + E2E）

> 调用 `gts-regression` skill 统一处理，不再自行拆开。

如果改动涉及多模块边界或 E2E 场景，走 `gts-regression` skill，包含：
1. 环境+场景一次选定
2. 先跑集成测试回归（Layer 3，秒级）
3. 再跑 E2E 回归（Layer 4，分钟级）
4. 结果汇总
```

#### 2. 验证回归门禁结果（bot 负责）

bot 读 OpenCode 报告，验证：

| 结果 | 处理 |
|------|------|
| ❌ 旧BDD红了或预存失败相关 | 🔴 不准改测试文件，必须先回头修代码 |
| ❌ 测试质量审计有 ❌ 项 | 记入审核报告，转代码审核步骤处理 |
| ❌ 核心流程无 E2E 场景覆盖 | 🔴 必须先补场景 |
| ✅ 全部通过 | 继续进下一步 |

> 📊 **状态追踪**：编译+BDD 通过 → STEP_DONE C/D
> **恢复检查点**：Step E（E2E测试）后，读取 `.skill-exec-state.json`，展示剩余步骤：
> 📋 Step F: 代码审核
> 📋 Step G: 回归事后复盘

### Step 2.5：🔴 代码审核（实现后立刻执行）

**根据触发类型 + Step 1 的「代码审核必要性评估」标记联合决定：**

**feat: 触发：** 🔴 **必须做代码审核**

> 🔴 审核 brief 必须贴完整重构规则：从 `笔记/项目文档/rules/workflow-rules.md` 的 🔴🟡🟢 审核表格和 `笔记/项目文档/rules/test-standards.md` 各层验收标准实时读取，逐条贴入 brief，不能浓缩。
> 🔴 审核范围 = 本次变动的所有改动文件（不是 .last-review diff，那是独立调用 gts-code-review 时的默认范围）。
> 🔴 **所有层级（🐛🔴🟡🟢📋）全部写进 fix brief 一次 dispatch 修完**，一条不能漏。只有兄弟明确说跳过才不修。

| 标记 | 行为 |
|------|------|
| `skip` | 轻量审核 — 走 gts-code-review skill 但用 Flash 模型 |
| `required` | 深度审核 — 走 gts-code-review skill 完整流程 |

**refactor: 触发：**

| 标记 | 行为 |
|------|------|
| `required` | 必须进行代码审核 |
| `skip` | 轻量审核，但不可完全跳过 |

---

> （后续步骤不变，省略）

---

> 📊 **状态追踪**：Step F 完成 → STEP_DONE（代码审核完成，移入 completed）

### Step G：🔴 回归事后复盘（🔥 新增 2026-07-26，S11）

**触发条件：** 本次开发/修复过程中**发现并修复了回归 bug**

**执行：**

#### 1. 根因归类

确认该回归 bug 属于哪种模式：
- 模式1 no-op stub？模式2 动态断裂？模式3 管线时序？模式4 死代码？模式5 API漂移？模式6 state退役？

#### 2. 门禁穿透分析

回答以下问题并写入 `笔记/项目文档/lessons/YYYY-MM-DD-regression-review.md`：

```
## 回归复盘 — <功能名>

### 回归概要
- 现象：
- 根因模式：
- 修复方案：

### 门禁穿透分析

此回归通过了哪些门禁？为什么没拦住？
- [ ] tsc --noEmit（未启用 noUnusedLocals / 已启用但没拦）
- [ ] BDD 测试（对应功能的测试随删除而删 / 测试集不覆盖此路径）
- [ ] lint-stub-detection（未运行 / 规则未覆盖此模式）
- [ ] delete-impact.md（方案阶段未发现 / 方案文档未列此项）
- [ ] 代码审核（审核人员漏了 / 审核标准不包含此项）
- [ ] Step C-ext 抽样验证（样本未命中 / 未执行）

### 门禁更新

需要更新哪个门禁来防止同类问题再次出现？
- [ ] 更新 gts-dev-refactor Step 1.5 删除清单维度
- [ ] 更新 gts-dev-workflow Step C #11 检查项
- [ ] 更新 lint-stub-detection.ts 规则
- [ ] 更新 gts-code-review Step 4 审核标准
- [ ] 更新 gts-acceptance Step 1.5 验证步骤

### 实施的改进
- 已更新：
- 待跟进：
```

#### 3. 更新门禁

根据第 2 步分析，立即更新对应的 skill/规则/工具——**不等兄弟确认**（全自动模式）

（全自动模式下：自动生成复盘报告并更新门禁后继续）

> 📊 **状态追踪**：Step G 完成 → STEP_DONE G

---

## R 组：技能反思（仅顶层直接触发时）—— 🔴 必须 bot 做，禁用 OpenCode (2026-08-20 兄弟拍板)

> **🔴 R/S 必须由 bot 做,不能派 OpenCode**(兄弟原话「R/S 应该由你来做,而不是 OpenCode」)——R 反思需**访问 bot 记忆主表**(MEMORY.md / ARCHIVE.md),只有 bot 能做;OpenCode **不可见** bot 记忆,派它写反思会失去记忆关联导致下次同类问题重演。**S(保存)** 由 bot 做(整合记忆/skill 落地)或派 OpenCode 只做 commit + push(纯机械操作,无记忆依赖)。
>
> 被 feat/fix/refactor 等 skill **嵌套委托**时，反思由顶层 skill 统一执行，本 skill 跳过 R 和 S。
> **顶层直接触发**（兄弟直接用 gts-dev-workflow 跟踪任务）时，bot 主线执行技能反思：
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

## S 组：保存（gts-submit-save，最后一步）

> 🔴 **保存必须在反思之后**：gts-submit-save 是工作流最后一步（通知之前），确保反思产出的 skill 更新/修复/报告能一起被提交，不会分两批。
> 🔴 **保存记忆和笔记** — > 🔄 **必须走 gts-submit-save skill 完整流程**（git commit + 保存记忆/笔记 + git push），禁止跳过或替代。

> 📊 **状态追踪**：全部步骤完成 → CLEANUP（删除状态文件）
> ```powershell
> node scripts/skill-exec-manager.cjs cleanup $sid --result completed
> ```
> 🎉 工作流完成
