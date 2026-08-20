---
name: "gts-dev-refactor"
description: "代码重构：refactor:触发。调度OpenCode Pro/Flash重构，我只管验证和提交。"
---

# gts-dev-refactor — 代码重构

> 当兄弟对话中包含 `refactor:` 时触发。

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

```
步骤序列（5 步）：
  0: 重构前基线检查 + 契约清单 + 删除影响分析
  B: 委托 gts-dev-workflow 实现（含方案 + 实现 + 集成测试）
  C: 验收流程（审核→测试→回归）
  M: 手动测试（交互式 checkpoint，仅普通模式）
      M-0: 明确宣布进入 M 阶段（必须说「进入 M 阶段」）
      M-1: 询问测试环境（本地开发服务器/CloudBase预发/CloudBase正式）
      M-2: 准备环境（启动服务/部署）
      M-3: 兄弟手动测试
            - 发现 bug → 宣布发起子 fix + 描述问题 + 等兄弟确认，再 dispatch
            - 不确定 bug → 询问兄弟「是否继续排查？」
            - 新需求/功能 → 询问兄弟「是否发起子 feat？」
      M-4: 完成 → 结束
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
node scripts/skill-exec-manager.cjs init $sid $wid "gts-dev-refactor" `
  --steps 0,B,C,M,R `
  --summary "<重构摘要>" `
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
  "skillName": "gts-dev-refactor",
  "sessionId": "<自动获取或生成>",
  "workflowId": "wf_<timestamp>_<random8>",
  "totalSteps": 4,
  "stepSequence": ["0", "B", "C", "M"],
  "completedSteps": [],
  "remainingSteps": [
    {"index": "0", "name": "重构前基线检查 + 契约清单 + 删除影响分析"},
    {"index": "B", "name": "委托 gts-dev-workflow 实现（含方案 + 实现 + 集成测试）"},
    {"index": "C", "name": "验收流程（审核→测试→回归→部署→保存）"}
  ],
  "completedCount": 0,
  "context": {
    "featureSummary": "<一句话描述本次重构>",
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

> 同意后 CLEANUP。委托 gts-dev-workflow 执行期间由 gts-dev-workflow 维护自己的状态文件。

### 恢复交互模板

```
🤖 检测到未完成的工作流：gts-dev-refactor

   已完成（{n}/{total}）:
     ✅ 0: 重构前基线检查 + 契约清单 + 删除影响分析

   剩余步骤（{m}/{total}）:
     📋 B: 委托 gts-dev-workflow 实现
     📋 C: 验收流程

   最后更新：{相对时间}

   🔜 即将执行下一步 Step B
   （如需跳过、调整或放弃，请现在告知）
```

#### 长时间中断恢复模板

```
🤖 检测到 {duration} 前中断的工作流：gts-dev-refactor

   上下文：
     featureSummary: <之前记录的内容>
     verificationCriteria: <之前记录的内容>

   已完成（{n}/{total}）:
     ✅ 0: 重构前基线检查 + 契约清单 + 删除影响分析

   剩余步骤（{m}/{total}）:
     📋 B: 委托 gts-dev-workflow 实现
     📋 C: 验收流程

   🔜 即将执行下一步 Step B
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

## 🔴🔴🔴★ 核心原则：所有代码操作必须调度 OpenCode（最高优先级）

**这是铁律，不是建议。违反一次就必须补 Skill 修订。**

本 skill 涉及的所有代码操作 — **代码修改、测试运行、编译检查、静态分析** — **均不得由 bot 直接执行**，必须编写 brief 调度 OpenCode（Pro / Flash）执行。

bot 在本 skill 中只负责：写 brief → dispatch → 验证输出 → git 操作 → 部署。

> 🔴 **所有 OpenCode 调度统一走 `skills/opencode-schedule/SKILL.md`**：写 brief → 预检进程列表 → `$brief` 变量传参（禁止 pipe）→ poll 跟进。

### 🔴 验证结果循环

OpenCode 跑完后，bot 只能 **阅读输出结果**，**不能直接动手修**。

```
OpenCode 完成 → bot 读结果
  ├─ 全绿 ✅ → 继续下一步
  └─ 有失败 ❌ → 分析失败原因 → 写新 brief（含失败详情+原因）→ 调度 OpenCode 修
       └─ 再读结果 → 循环直到全绿
```

### 🔄 规格同步检查（重构完成后、验收通过前必做，2026-08-05 新增）

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

> 违反后果：跳流程、漏改漏测、浪费时间。兄弟看到了会立刻指出来。

---

## 流程

### Step 0：🔴 重构前基线检查（2026-07-21 新增）

**目的：** 重构前先记录当前测试状态基线，重构后对比验证无回归。

#### 0. 🔴 先询问是否进行基准测试（2026-08-16 新增）

> 进入 Step 0 后**必须先问兄弟**是否要做基准测试，**不默认执行**（跑基线耗时，全自动模式也询问）。

```
兄弟，这次重构要做基准测试吗？
1. 要做 — 正常跑 BDD + 集成测试记录基线（下方步骤 1-2）
0. 不用 — 跳过基线检查，直接出影响清单（下方步骤 3）
```

- 兄弟选「要做」→ 执行步骤 1-2（跑基线 + 处理基线结果）
- 兄弟选「不用」→ 跳过步骤 1-2，在 issue 记录「兄弟选择跳过基准测试」，直接进入步骤 3 输出影响清单；Phase C 第 6 步回归验证改为以「重构后全量测试全绿」为参照，不做基线对比

#### 1. 跑 BDD + 集成测试记录基线（不跑 E2E，E2E 太重）

> 仅当兄弟确认「要做」基准测试时执行。

> **BDD 单元测试**（4 个 package）— 调度 OpenCode Flash 跑并记录：
> `npx jest --config packages/room-service/jest.json --forceExit 2>&1 > refactor-baseline-bdd.log && npx jest --config packages/match-service/jest.config.ts --forceExit 2>&1 >> refactor-baseline-bdd.log && npx jest --config packages/forum/jest.config.ts --forceExit 2>&1 >> refactor-baseline-bdd.log && npx jest --config packages/frontend-multiplayer/jest.config.js --forceExit 2>&1 >> refactor-baseline-bdd.log`

> **跨模块集成测试** — 走 `gts-integration-regression` skill（跑全量，记录基线），嵌套调用时不初始化独立状态文件，由 refactor skill 的现有 workflow 管理。

> 🚫 **不跑 E2E 基线**（`npm run e2e:regression` 等），太重，重构前后对比价值有限。

#### 2. 处理基线结果

- ✅ 全部绿色 → 正常基线，继续重构
- ❌ 已有红色 → 先行修复再重构，不带着红测试做重构

#### 3. 输出重构影响清单

根据重构方案，列出高风险区域：

```
## 重构影响清单
| 变更模块 | 影响边界 | 高风险集成点 | 对应回归测试 |
|---------|---------|-------------|------------|
| nf | room/match/frontend | WS协议、冷启动、消息序列化 | nf-ws-reconnect, nf-broadcast |
| frontend-multiplayer | match-service | 房间列表同步、加入/退出 | lobby-room-list, member-exit |
| ... | ... | ... | ... |
```

#### 4. 进 Step 0.5

自动继续，出完契约清单后统一确认。

---

### Step 0.5：🔴 契约清单 — 列本次重构变更的契约面

**目的：** 将重构的删除操作从「代码修改」提升为「契约变更」——列出所有将被变更的契约点，为后续删除影响分析提供输入。

🔥 来源于 2026-07-26 重构回归审查结论（`changes/20260723-refactor-regression-prevention/final-review.md`）

#### 1. 列出 4 维度契约清单

bot 根据方案文档中的结构化「改动范围」表格提取，填写以下 4 个维度：

```
## 契约清单

| 维度 | 变更项 | 类型(删除/修改) | 外部引用数 | 风险 |
|:---|:---|:---:|:---:|:---:|
| 函数/类 export | setIsDebug | 删除 | 2 | 🟡 |
| state 字段 | roomConfig.maxPlayers | 修改 | 3 | 🟡 |
| event 名 | "player:stateChange" | 删除 | 1 (dispatch) + 2 (listener) | 🔴 |
| API 签名 | GameEngine.startGame | 修改(参数变化) | 4 | 🟡 |
```

（全自动模式下自动生成，不确认）

#### 2. 分级调用方行为检查（🔥 新增 2026-07-26，S6 分级版）

对每个被修改/删除的 API，按以下分级处理：

| 场景 | 级别 | 要求 |
|:---|:---:|:---|
| 被 **删除**的函数/字段/event + 调用方仍 import | 🔴 | **必须处理**（要么不删，要么改调用方，要么确认安全） |
| 被 **修改**的 API + 有调用方且有测试 | 🟡 | 跑调用方的现有测试确认通过即可，不强制补新测试 |
| 被 **修改**的 API + 无调用方测试 | 🟢 | 建议补测试但不阻塞 |

在契约清单中额外增加一列「调用方处理方式」：

```
## 契约清单

| 维度 | 变更项 | 操作 | 引用数 | 风险 | 调用方处理方式 |
|:---|:---|:---:|:---:|:---:|:---|
| 函数 export | setIsDebug | 删除 | 2 | 🟡 | 🔴 必须：改 Login.tsx 调用 |
```

（全自动模式下：🟡 自动跑调用方测试确认通过后继续）

#### 3. 🔴 统一确认后进 Step B

> 展示基线结果 + 影响清单 + 契约清单给兄弟，等确认后才进入实现阶段。

---

### Step B: 委托 gts-dev-workflow 实现

#### 1. 调度 gts-dev-workflow 出方案

走 **[gts-dev-workflow](skills/gts-dev-workflow/SKILL.md)** Step A（方案阶段）。

- `refactor:` **架构级** → 调度 OpenCode Pro（默认 variant，不用 max；仅超大范围才 max，2026-08-10 定稿）
- `refactor:` **常规重构** → 调度 OpenCode Flash

#### 2. 🔴 出方案后等兄弟确认

gts-dev-workflow 方案产出后，**先展示方案给兄弟确认**，等回复再继续。

```
📋 重构方案已出（见 <方案文件路径>）
- 改动范围：...
- 影响模块：...

确认后继续实现？
```

不确认不进入实现阶段。

> Step B 不包含回归检查、代码审核和手动验证。三者迁移到 Phase C。

#### 3. 🔴 Post-poll 绑定：实现完成后自动 step-done

gts-dev-workflow 的 OpenCode poll 完成后（gts-dev-workflow 的实现阶段结束），回到本 skill 时更新进度：

```powershell
$sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
node scripts/skill-exec-manager.cjs step-done $sid --step-index B --step-name "委托 gts-dev-workflow"
```
> 🔴 **实现完成后直接进 Phase C 代码审核，不需要兄弟确认（2026-08-15 兄弟拍板）**：step-done 执行完立即 dispatch gts-code-review 完整流程。展示实现结果/询问「是否进入审核」属于违规。方案确认是唯一需要兄弟确认的环节。


> 🔴 gts-dev-workflow 内部已有自己的 step-done 绑定点。这里只标记「委托已完成」。

---

### Step 1.5：🔴 删除影响分析 — bot 执行

**🔥 新步骤（2026-07-26 新增，来源：重构回归防范方案 S1）**

**目的：** 在方案确认前，bot 独立执行删除影响分析，防止「编译通过、测试全绿、业务静默失效」。

#### 1. 从方案文档提取删除清单

从方案文档的「改动范围」结构化表格中提取 4 维度删除项：
- 函数/类 export 删除
- state 字段删除
- event 名删除
- API 签名修改

#### 2. grep 全仓库搜索外部引用

> 🔄 **调度 OpenCode Flash** 对每项删除/修改执行全仓库 grep（不含注释和 import 语句），搜索动态 import/require 模式，汇报结果摘要。

对每项删除/修改执行全仓库 grep（不含注释和 import 语句），搜索动态 import/require 模式。

#### 3. 生成 delete-impact.md

写入 `笔记/项目文档/changes/<日期>-<功能名>/delete-impact.md`

| 删除项 | 类型 | 外部引用数 | 风险 |
|--------|------|:--------:|:---:|
| setIsDebug | 函数 | 2 | 🟡 |
| MultiplayerErrorHandle | 组件 | 1(动态) | 🔴 |

#### 4. 风险门禁

- 🔴 有外部引用（尤其是动态引用）→ **方案不通过**，返回修改方案
- 🟡 有外部引用但可处理 → 列处理方式后继续
- 🟢 无外部引用 → 继续

（全自动模式下：🟡 自动处理保留引用策略后继续，🔴 自动阻塞方案）

---

### Phase B：实现（增强）

#### Step 2.2：🔴 Layer 3 跨项目集成测试前置门禁

**🔥 新步骤（2026-07-26 新增，来源：重构回归防范方案 S7）**

**触发条件：** 改动涉及 2+ 个 package

> 🔄 **调度 OpenCode Flash** 执行跨项目集成测试前置门禁（`npx jest --config test/integration/jest.config.js --forceExit 2>&1`），汇报结果。
- ✅ 全绿 → 正常继续
- ❌ 有失败 → 🔴 阻塞，回 Phase B 修复

（全自动模式下自动判断并回退）

---

## 🔴 E2E 场景审核（重构必做）

重构阶段必须同时审核 E2E 自动测试场景，详见：
- `skills/gts-dev-workflow/SKILL.md` → E2E 场景审核标准
- `笔记/项目文档/rules/workflow-rules.md` → E2E 场景审核规则
- `笔记/项目文档/rules/test-standards.md` → L3 跨项目集成测试 + L4 E2E 质量标准

### 核心要求

| 阶段 | 操作 |
|------|------|
| Step 1（出方案） | OpenCode 方案中同时产出 `e2e-review.md` |
| Step 4（测试后） | 检查可提取/精简的 scenarios |
| 修复专用 E2E 脚本 | 提取通用操作流程为标准 scenario |

---

## Phase M：手动测试（交互式 Checkpoint）

> 依据 `笔记/项目文档/changes/2026-07-28-manual-test-checkpoint/solution.md`

> 🔴 **全自动模式下 M 阶段不跳过，而是移到最后执行**：C 验收完成后 → 先执行 R（反思）→ S（保存）→ 通知兄弟（自动步骤完成，准备手动测试）→ 再进 M（手动测试）→ M 完成后再执行 R（反思）→ S（保存）→ 通知（最终完成）。标准模式流程不变（C→M→R→S）。
> 检测：最近 3 条兄弟消息 ≥2 条非简短确认 → 退出 auto，恢复 M。

### M-0 — 明确宣布进入 M 阶段

> 🔴🔴 **worktree 改动必须 merge 回 dev + 立刻删 worktree（2026-08-20 兄弟拍板）**：本次 refactor 若在 worktree 中实现（opencode-schedule 5️⃣ 规则：改 frontend/ 默认走 worktree），**进入 M 阶段前必须按顺序执行**：
> 1. **commit + merge 回 dev** —— 兄弟手动测试的就是 dev 代码，测试前未 merge = 测了个寂寞。merge 流程见 worktree-junction skill「完成后必须 merge 回主仓库」。
> 2. **🔴🔴 §merge-verify 5 项验证全过** —— `git worktree remove` 前**必须**跑完 worktree-junction §merge-verify，不通过 → 立即 abort + notify 兄弟，**不许自动 merge**。
> 3. **`git worktree remove <wt路径> --force`** —— §merge-verify 全过后才能跑。漏删 = D 盘残留占空间 + 下次开新 wt 误用旧分支（2026-08-20 实锤：XiaHui feat/fix/refactor 完成后 wt1/wt2/wt3-prop-fix 三个 worktree 都没删，今早才发现）。
> 4. **`git branch -D <wt分支>`** —— 删 worktree 后顺手删分支
> 5. **`git worktree prune`** —— 清 git 内部 worktree 元数据缓存
> 6. **二次确认**：`git worktree list` 只剩 dev 一个
>
> **触发时机**：全自动模式下，在 step-done B2 后、进 Phase C 前执行。标准模式：进 M 阶段前必须执行。**M-0 不执行完不许进 M-1**。
>
> 全自动模式补充：M 阶段完成后也要再检查一次。

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

按选定的环境准备，准备完成后通知兄弟测试。测试通知**必须**包含序号提示：

```
——— 测试命令 ———
测试完成后，输入对应序号发起子流程：
1️⃣ 发起子 fix：<问题描述>（发现 bug 时用）
2️⃣ 发起子 feat：<功能描述>（发现需要加功能时用）
0️⃣ OK 继续（测试通过，进入下一步）

例如：`1：页面布局错乱` → 创建一个修复任务
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
- ❌ 兄弟输入 `1：xxx` 后不能直接 dispatch，必须先等兄弟确认
- ✅ 确认后更新 issue 再 dispatch，修完回到 M-3 继续验证
- 🔴 子 fix 嵌套深度最多 1 层

### M-4 — 完成

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

## Phase C：验收

**Phase C 完成后进入 Phase M：**

走 **gts-acceptance** 验收 skill，按以下顺序执行：

1. **🔴 代码审核** — 走 gts-code-review skill 完整流程
   > 🔴 审核 brief 必须贴完整重构规则：从 `笔记/项目文档/rules/workflow-rules.md` 的 🔴🟡🟢 审核表格和 `笔记/项目文档/rules/test-standards.md` 各层验收标准实时读取，逐条贴入 brief，不能浓缩。
   > 🔴 审核范围 = 本次重构的所有改动文件（不是 .last-review diff）。
   > 🔴 **所有层级（🐛🔴🟡🟢📋）全部写进 fix brief 一次 dispatch 修完**，一条不能漏。只有兄弟明确说跳过才不修。
2. **所有 BDD 测试全绿 ✅** — > 🔄 **调度 OpenCode Flash** 执行全部 BDD/集成测试（包括新写的集成测试 + 已有的全部 BDD 测试），汇报结果。
3. **Phase 0 设计的 E2E 测试全绿 ✅** — > 🔄 **调度 OpenCode** 运行设计的 E2E 场景，汇报结果。
4. **🔴 修复 Specs（轻量自检）** — > 🔄 **调度 OpenCode Flash** 自查 specs，E2E 全绿后不等确认立即执行。
5. **🔴🔴🔴 TDD 验证集成测试** — > 🔄 **调度 OpenCode Flash** 执行 TDD 验证（撤销实现代码 → RED → 恢复 → GREEN），汇报每一步结果。
6. **🔴 回归测试验证** — > 🔄 **调度 OpenCode Flash** 跑旧 BDD 全量 + 集成测试全量（对比 Step 0 基线），汇报通过/失败详情。
   > 若 Step 0 兄弟选择跳过基准测试 → 只验证重构后全量测试全绿（无基线对比），汇报注明「未做基线对比」。

### 🐛🔴 测试失败根因分析纪律（验收/回归阶段）

回归验证或 TDD 验证中遇到测试失败，**必须先分析根因**：
| 失败类型 | 应该做什么 |
|----------|-----------|
| 被测代码有 bug（测试是对的） | 回 Phase B 修代码 |
| 测试本身写错了 | 修测试 |
| 环境/配置问题 | 修配置 |

**禁止行为：**
- ❌ 直接归类为「pre-existing」跳过，不做分析
- ❌ 默认「测试没问题是代码有问题」或「代码没问题测试写错了」

每个失败必须输出明确结论（文件、场景、根因、结论）。

> 2026-07-28 教训：match-service 2 个测试失败直接归类为 pre-existing 跳过，未分析根因。
7. **🔴 删除影响验证（阻塞门禁）** — > 🔄 **调度 OpenCode Flash** 运行 `npx tsx scripts/lint-stub-detection.ts` 检测 stub/no-op/hardcoded-return + 运行 git diff 驱动的删除影响兜底扫描，汇报结果。
   - 🔴 有 🔴 级问题 → 阻塞提交
   - 🟡 有 🟡 级问题 → 记录但不阻塞
   - ✅ 无问题 → 继续
8. **🔴 E2E 回归门禁** — > 🔄 **调度 OpenCode** 跑 E2E regression 场景（`npm run e2e:regression`），汇报结果。
9. **更新操作文档** — > 🔄 **调度 OpenCode Flash** 检查 E2E-OPERATIONS.md。
10. **🔴 stale contract 检查** — > 🔄 **调度 OpenCode Flash** 利用 delete-impact.md 作为输入，逐项验证 🔴/🟡 项是否已处理，汇报结果。
    - 未处理 → 🔴 阻塞提交
11. **🔴 手动验证**（本地修复专用）— > 🔄 **调度 OpenCode** 重启本地服务清理残留 state：
   1. 杀掉旧 room-service 进程（按端口 4003 精确杀）
   2. 杀掉旧 frontend-multiplayer webpack 进程（按端口 8093 精确杀）
   3. 启动 room-service：`cd packages/room-service && Start-Process -WindowStyle Hidden powershell -ArgumentList "-NoProfile -Command npx ts-node src/index.ts"`
   4. 启动多人联网前端：`cd packages/frontend-multiplayer && Start-Process -WindowStyle Hidden powershell -ArgumentList "-NoProfile -Command yarn webpack:dev-server"`
   > 如果是线上 → 跳过本步，走 Step 12 部署。
12. **自动部署** — 线上修复后自动部署到 SCF

> 📊 **状态追踪**：Phase C 完成 → STEP_DONE + CLEANUP
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
8. **commit message 用中文**
9. **push 时机 = 兄弟拍板**(`git checkout` / `git reset` 兄弟不拍不能动);**S 派 OpenCode 也仅在兄弟说"全自动 push"才 push**

```
🔮 技能反思 → bot 主线执行(读记忆/skill → 关联落地)
  ├─ 有改进建议 → patch skill / update memory → 兄弟原话确认
  └─ 无改进建议 → 自动继续
  ↓
保存（gts-submit-save，bot 或 OpenCode 仅 commit/push）→ 双通道通知 → 🎉 工作流完成
```

> 🔴 **保存必须在反思之后**：gts-submit-save 是工作流最后一步（通知之前），确保反思产出的 skill 更新/修复/报告能一起被提交，不会分两批。
> 🔴 **保存记忆和笔记** — > 🔄 **必须走 gts-submit-save skill 完整流程**（git commit + 保存记忆/笔记 + git push），禁止跳过或替代。
> 📊 **状态追踪**：R 步骤不阻塞 CLEANUP，CHECK 恢复时跳过 R（已完成的工作流不重新反思）。

---