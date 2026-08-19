---
name: "gts-code-review"
description: "代码审核：调度OpenCode（简单审核Flash/复杂审核Pro）审查代码+测试脚本，转达结果，含specs/记忆/笔记审核步骤"
---

# gts-code-review — 代码审核

> 兄弟说「代码审核」「审核」时触发此流程。
> 调度 OpenCode 审查代码（简单审核 Flash / 复杂审核 Pro，2026-08-17 兄弟拍板），我把结果完整转达给兄弟，兄弟决定怎么修。

> ⚠️ **默认审核范围检查 `.last-review`**，包含测试和脚本文件。
> 🔴🔴🔴 **所有层级（🐛🔴🟡🟢📋）全部默认要修，一条都不能漏！**
> - 🐛 Bug — 必须修
> - 🔴 清理项 — 必须修
> - 🟡 重构项 — 必须修
> - 🟢 关注项 — 必须修
> - 📋 Specs 项 — 必须修
> **只有兄弟明确说「跳过」「不处理」「忽略」才不修。**
> 没有兄弟许可，助理不得自行判断「这个不重要先跳过」。
> 全自动模式下（gts-auto）：自动把所有发现写入 fix brief，不准遗漏任何分类/条目。

> 🔴🔴🔴 **审核标准必须从 `笔记/项目文档/rules/workflow-rules.md` 和 `笔记/项目文档/rules/test-standards.md` 实时读取，不在 skill 里硬编码。每次新增/修改规则时无需同步此 skill。**

> 🐛 **阻塞项判定纪律（2026-08-05 新增）**：审核 agent 报告「测试不可运行/关键字不匹配/构建失败」等**可验证类阻塞项**时，brief 必须要求附上「验证命令 + 实际输出」，且助理在转达/写 fix brief 前**先用真实命令独立复验**（如 `npx jest <文件> --config <config>`、`npx tsc --noEmit`）。实测案例：jest-cucumber 的 `then()` 可匹配 `.feature` 的 `And` 关键字（20/20 通过），审核 agent 却判「3 个测试不可运行」为唯一阻塞项——若直接照做会浪费一轮修复不存在的问题。**审核结论必须可复现，禁止凭代码阅读下「跑不起来」的结论。**

> 🔴🔴🔴 **全量测试验证铁律（2026-08-06 新增，nf 审核实战教训）**：OpenCode 修复 agent **只跑「改动相关 suite」是常态，会漏掉全量回归**。实测 3 个修复 session 全部自报「验证通过」但 bot 独立复验发现失败：
> - 改测试 helper 声明了字段但 return 对象漏字段 → 相关 suite 不触发，全量才暴露
> - require→动态 import 破坏同步断言 → 单文件跑通过，全量时序暴露
> - 改防叠加逻辑没同步测试断言 → agent 只跑目标 suite，其他 suite 旧期望失败
> **两条硬规则：**
> 1. **fix brief 必须包含「全量测试验证」要求**：明确写「修复后必须跑**全量**测试套件（不只改动相关），确认 0 regression」，并列出已知全量测试命令（如 monorepo 各包 jest/tsc/rescript build）
> 2. **bot 独立复验不可省**：agent 报告「验证通过」后，bot 必须自己跑**全量测试矩阵**（所有受影响包的 jest + tsc + build），不能信 agent 自报。agent 没跑到的失败 = bot 复验发现的常事。

> 🐛 **jest-cucumber feature/steps 同步纪律（2026-08-06 新增）**：jest-cucumber 严格校验 `.feature` 与 steps 步骤一致性。**改 steps 断言必须同步检查对应 feature 文件**（同文本），否则 suite 加载直接失败。实测：config-loader.feature 漏改 3000→4004 → suite 崩溃。修复验收时 grep feature 对应文本。

> 🐛 **审核建议代码必须逻辑自检（2026-08-07 新增）**：审核报告中的「修复建议代码」必须经过逻辑自检——建议代码本身可能引入新 bug（实测案例：vmd-compress 审核建议 magic 校验 `buf.toString('ascii', 0, 30) !== VMD_MAGIC`，但 VMD_MAGIC 常量仅 26 字符，按 30 字节比较会因尾部 4 个 NUL 拒绝所有真实 VMD 文件）。要求：
> 1. 审核 agent 给出修复建议代码时，必须说明该代码基于什么输入/常量，并自查边界（字符串长度、偏移量、类型）
> 2. 或者将「直接给代码」改为「描述性修复方案」（说明改什么、为什么），由修复 agent 自行实现并实测
> 3. bot 转达审核结果给修复 agent 时，若建议代码涉及魔法数字/字符串比较/偏移量，标注「建议代码需实测验证，勿直接照抄」

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
  0: 范围确认 + 记忆/笔记/Specs 审核
  1: 调度 OpenCode 审核（简单 Flash / 复杂 Pro）
  2: 转达结果 + 逐类核对 + Specs 整理
  3: OpenCode Flash 修复 + 验证核对 + .last-review
  R: 技能反思（调用 gts-skill-reflect，CLEANUP 后、保存前执行）
  S: 保存（gts-submit-save，最后一步，通知前）
```

### INIT（skill 触发时第一时间执行）

```powershell
# 1. 获取/生成 session ID 和 workflow ID
$sid = node scripts/skill-exec-manager.cjs get-session-id | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
$wid = node scripts/skill-exec-manager.cjs get-workflow-id $sid | ConvertFrom-Json | Select-Object -ExpandProperty workflowId

# 2. 同任务预检（dispatch 前查 OpenCode DB 确认无「相同任务」活跃 session；不同任务直接并行，全局 dispatch 锁已废弃 2026-08-01）
# 3. stateInit + issueCreate + registryRegister
node scripts/skill-exec-manager.cjs init $sid $wid "gts-code-review" `
  --steps 0,1,2,3,R `
  --summary "<审核摘要>" `
  --criteria "<审核标准>" `
  --specs "<关联 specs 路径，逗号分隔，可省略>"
```

### 生命周期操作

所有操作统一通过 `scripts/skill-exec-manager.cjs` CLI 入口执行。

| 操作 | 时机 | CLI 命令 | 说明 |
|------|------|---------|------|
| **INIT** | （见上方 INIT） | 同上 | 创建 state + issue + registry 注册 |
| **STEP_DONE** | 每完成一个子步骤后 | `node scripts/skill-exec-manager.cjs step-done <sessionId> --step-index <索引> --step-name "<步骤名>" [--files "<改动的文件>"]` | 更新 state + issue 进度 |
| **SYNC** | 发现 issue/state 不同步时 | `node scripts/skill-exec-manager.cjs sync <stateFile> --completed-count <n> [--log-entry "<text>"]` | 强制同步：跳过版本校验，直接推进到指定进度 |
| **CHECK** | 每次收到用户消息后 | `node scripts/skill-exec-manager.cjs check <sessionId>` | 读取 state + 交叉校验 state/issue 版本 |
| **CLEANUP** | 所有步骤完成后 | `node scripts/skill-exec-manager.cjs cleanup <sessionId> --result completed` | issue 关闭 + registry 注销 + state 删除 |
| **ABORT** | 放弃工作流 | `node scripts/skill-exec-manager.cjs abort <sessionId> [--reason "<原因>"]` | issue 标记 aborted + registry 注销 + state 删除 + 释放 dispatch lock |

> 🔴🔴🔴 **SYNC 纪律**：
> - 只用于发现 issue/state 不同步时的追补修复，不是常规操作
> - 常规场景必须调 STEP_DONE（每步完成就调），不能依赖 SYNC
> - 每次收到用户消息后先 CHECK，发现 `lastSyncedStateVersion` vs 对话进度不一致 → 调 SYNC
> - SYNC 完成后在 autoLog 里记下「sync 原因+补了多少步」

### 初始化格式（由 CLI 自动生成）

```json
{
  "schemaVersion": "2",
  "skillName": "gts-code-review",
  "sessionId": "<自动获取或生成>",
  "workflowId": "wf_<timestamp>_<random8>",
  "totalSteps": 5,
  "stepSequence": ["0", "1", "2", "3", "R"],
  "completedSteps": [],
  "remainingSteps": [
    {"index": "0", "name": "范围确认 + 记忆/笔记/Specs 审核"},
    {"index": "1", "name": "调度 OpenCode 审核（简单 Flash / 复杂 Pro）"},
    {"index": "2", "name": "转达结果 + 逐类核对 + Specs 整理"},
    {"index": "3", "name": "OpenCode Flash 修复 + 验证核对 + .last-review"},
    {"index": "R", "name": "技能反思（调用 gts-skill-reflect）"}
  ],
  "completedCount": 0,
  "context": {
    "featureSummary": "<一句话描述本次审核>",
    "verificationCriteria": "<审核标准>",
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

#### 标准恢复模板

```
🤖 检测到未完成的工作流：gts-code-review

   已完成（{n}/{total}）:
     ✅ 0: 范围确认 + 记忆/笔记/Specs 审核
     ✅ 1: 调度 OpenCode 审核（简单 Flash / 复杂 Pro）

   剩余步骤（{m}/{total}）:
     📋 2: 转达结果 + 逐类核对 + Specs 整理
     📋 3: OpenCode Flash 修复 + 验证核对 + .last-review + 通知

   最后更新：{相对时间}

   🔜 即将执行下一步 Step 2
   （如需跳过、调整或放弃，请现在告知）
```

#### 长时间中断恢复模板

```
🤖 检测到 {duration} 前中断的工作流：gts-code-review

   上下文：
     featureSummary: <之前记录的内容>
     verificationCriteria: <之前记录的内容>

   已完成（{n}/{total}）:
     ✅ 0: 范围确认 + 记忆/笔记/Specs 审核

   剩余步骤（{m}/{total}）:
     📋 1: 调度 OpenCode 审核（简单 Flash / 复杂 Pro）
     📋 2: 转达结果 + 逐类核对 + Specs 整理
     📋 3: OpenCode Flash 修复 + 验证核对 + .last-review + 通知

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

### ⚠️ 嵌套调用规则

当本 skill 被其他 skill（如 `gts-dev-fix`、`gts-dev-feat`、`gts-dev-workflow`、`gts-acceptance`）流程中调用时：
- **由调用方管理状态文件**，本 skill 不执行 INIT/STEP_DONE/CLEANUP
- 仅在**独立触发**时（兄弟直接说「代码审核」「审核」）初始化自己的状态追踪

**判断方式**：执行任何步骤前读取 `.skill-exec-state.<sessionId>.json`。如果文件存在且 `skillName` 不是 `"gts-code-review"` → 视为嵌套调用，跳过所有状态文件操作。

---

## 流程

### Step 1：确认范围（基于 .last-review 自动扫描）

**不再先问兄弟「审什么」。** 先自动检测全量变更，再让兄弟确认。

> 🔴 **嵌套调用时跳过本节**（2026-08-03 补充）：被 feat/fix/refactor 调用时，审核范围由调用方圈定（本次改动的文件清单），不基于 `.last-review` 扫描，也不写 `.last-review`。

#### 1. 获取基线

```powershell
$lastReview = Get-Content "笔记/决策记录/.last-review" -ErrorAction SilentlyContinue
if (-not $lastReview) {
    $lastReview = git rev-parse HEAD~1
    Write-Host "⚠️ .last-review 不存在，回退到 HEAD~1"
}
```

#### 2. 扫描全量变更

```powershell
$changedFiles = git diff --name-only $lastReview..HEAD
```

输出按模块分组：
- **forum/** — 论坛相关
- **frontend-multiplayer/** — 多人联网
- **match-service/** — 匹配服务
- **room-service/** — 房间服务
- **frontend/** — 单机端
- **test/** — 集成测试/基础设施
- **scripts/** — 脚本
- **docs/** / **笔记/** — 文档
- **其他** — config、构建等

#### 3. 展示给兄弟确认

```
自上次审核 ($lastReview) 以来，以下模块有变更：

📦 forum/              — N 个文件
📦 frontend-multiplayer/ — N 个文件  ← [⚠️ 包含多人联网]
📦 match-service/       — N 个文件
📦 room-service/        — N 个文件
...

兄弟，要审哪些模块？全部审还是跳过某些？
```

**兄弟无回应 / /gts_auto 模式** → 全部模块默认进入审核范围。

#### 4. 审核范围规则

- **默认包含**测试、脚本、规格文件（不限于生产代码）
- **默认包含** `笔记/项目文档/changes/<活跃变更>/specs/*.feature` 和规格文档
- 兄弟指定排除某模块 → 跳过该模块的所有文件
- 兄弟指定只审某模块 → 只审该模块

> 如果 `.last-review` 内容与当前分支无关（如切换了分支），回退到 `git diff HEAD~1` 并告知兄弟。

#### 🔴 硬性要求：必须自动扫描，不能凭记忆圈定范围

这是本次修复新增的铁律。**上一轮审核违规的根因**：助理手动圈定 forum + room-service 范围，跳过了 `.last-review` 扫描出的多人联网等模块的全量变更。

不论兄弟是否指定审核目标，**都必须先执行 git diff 扫描并展示全量变更**，让兄弟在完整信息下做选择。

### Step 2：审核记忆和笔记（新增）

在审核代码前，先检查本次改动的相关记忆和笔记是否需要同步更新：

1. **检查 daily log**：查看 `~/.openclaw/workspace/memory/<当天>-log.md`，确认是否有本次改动的记录。如果审核涉及新的经验/教训/决策，在 daily log 末尾追加。
2. **检查项目笔记**：查看 `D:\Github\GTS-Play\笔记\项目文档\changes\<活跃变更>` 下的 `log.md` 和 `solution.md`，确认是否需要更新改动描述、根因分析、修复方案。
3. **检查 lessons 目录**：如果本次发掘了新的踩坑经验/重要教训，确认 `笔记/项目文档/lessons/` 下是否有对应的总结笔记需要更新。
4. **列出需要更新的记忆/笔记列表**（不自己改，等兄弟确认）。

> 不要遍历所有笔记，只查：
> - `~/.openclaw/workspace/memory/<当天>-log.md`
> - `D:\Github\GTS-Play\笔记\项目文档\changes/<活跃变更>/log.md`（如有）
> - `D:\Github\GTS-Play\笔记\项目文档\changes/<活跃变更>/solution.md`（如有）
> - `D:\Github\GTS-Play\笔记\项目文档\lessons/`（扫一眼，有匹配的才更新）

### Step 3：审核 Specs 规格文件

在审核代码前，先审核本次改动相关的规格文件（`.feature` + `.md`）：

1. 读取活跃变更的规格文件：`笔记/项目文档/changes/<活跃变更>/specs/*.feature` 和 `笔记/项目文档/changes/<活跃变更>/*.md`（spec.md/tasks.md/log.md 等）
2. **审核规格内容**（非仅检查同步）：
   - 场景是否完整：`.feature` 的 Given-When-Then 是否覆盖了所有关键业务路径？
   - 描述是否清晰：能被不熟悉的人理解业务行为？
   - 是否存在冗余/重复的场景或描述？
   - 状态机转换是否有对应的场景？
   - spec 是否与项目实际的业务逻辑和状态定义一致？
   - 每个场景是否有实际的 `.steps.ts` 步骤定义？
   - **每个场景是否有对应的 `specs/expected-state/<场景名>.json`（期望状态 JSON）？** 缺失 → 🟡 警告。
   - `.md` 文档（spec.md/tasks.md/log.md）是否与最新实现一致？
   - **回归覆盖检查（2026-07-21 新增）：** 如果本次变更是回归 bug 修复 → 检查是否有对应的跨项目集成测试（`test/integration/<模块>/`）新增/更新？缺失 → 🔴 不通过。
   - **E2E 回归场景检查（2026-07-21 新增）：** 如果本次变更是回归 bug 修复或重构 → 走 `gts-e2e-regression` skill 做覆盖检查（只做判断+覆盖检查，不跑回归）。缺失 → 🟡 警告。
3. **对比代码行为**（对照 git diff）：
   - 改动的业务逻辑是否在 specs 中有对应场景？
   - 新增的行为是否有 specs 覆盖？无 → 标注为缺失
   - specs 描述与实际实现是否一致？不一致 → 列出需要更新的地方
4. 列出审核结果（不自己改，等兄弟确认后再 Step 6 处理）

> 不需要遍历整个仓库的 specs，只查 `笔记/项目文档/changes/<活跃变更>/specs/` 和 `笔记/项目文档/changes/<活跃变更>/` 下的文件。

### Step 4：生成审核 brief + 调度 OpenCode 审核

#### 🔴🔴🔴 先读 workflow-rules.md + test-standards.md 获取完整审核标准

在写 brief 之前，必须先：

1. **读取** `D:\Github\GTS-Play\笔记\项目文档\rules\workflow-rules.md`
2. **找到**文件中 `## 重构规则` 到 `## 变更文档化规范` 之间的完整内容
3. **读取** `D:\Github\GTS-Play\笔记\项目文档\rules\test-standards.md`
4. **找到**文件中 `## 审核清单（代码审核时引用）` 部分的完整内容
5. **逐条原文**注入到 brief 中，**禁止浓缩/省略**
   - 所有 🐛🔴🟡🟢 层级必须全部保留
   - 新增规则也会自动包含
   - 这样每次规则文件新增/修改规则后，审核时自动使用最新标准

> ⛔️ 之前 skill 里硬编码的审核标准已全部删除，必须实时读取 workflow-rules.md 和 test-standards.md。
> 违反后果：兄弟会立刻指出来，说审核标准不全，漏了新规则。

#### 🔴 追加：被删除函数的残留引用专项（🔥 新增 2026-07-26）

在注入以上审核标准后，**额外追查补充注入**「被删除/重命名 export 的残留引用」检查：

**执行：**
1. 从 git diff 中提取所有被删除/重命名的 export（函数、变量、类型、接口）
2. 对每个被删除的 export，grep 全仓库搜索引用（排除声明文件本身）
3. 将结果追加到 brief 审核标准末尾：

```
## 被删除/重命名 export 残留引用专项（🔥 2026-07-26 新增）
对 git diff 中删除/修改的每个 export：
- grep 全仓库搜索结果
- 有残留引用 → 标记为 🔴（需处理）或 🟡（需确认）
- 无残留引用 → 🟢 安全
```

（全自动模式下自动执行，不确认）

然后生成 brief 并调度。**brief 开头自动注入 `笔记/项目文档/project-context.md` 的项目上下文内容。**

调度方式严格按 `skills/opencode-schedule/SKILL.md` 的标准流程执行。**模型按审核范围选（2026-08-17 兄弟拍板）：**
- **简单审核 → Flash**（`opencode-go/deepseek-v4-flash`）：工具类修改、测试代码修改、非架构修改、<=50 行代码的修改等
- **复杂/架构级审核 → Pro**（`opencode-go/deepseek-v4-pro` **默认 variant，不用 max**）：跨包/跨模块改动、API 签名变更、架构调整、大规模改动；仅超大范围审核才 `--variant max` 且做好 80 分钟静默等待预期（2026-08-10 定稿：Pro max 本机 exec 环境易 LLM 静默失败）

通过 OpenCode Web UI 监控审核进度。

#### 🔴 OpenCode 审核 poll 完成后 → 自动 step-done（Step 1）

OpenCode 审核进程的 poll 返回完成后（无论成功/失败）：

```powershell
# 从 state 文件获取 sessionId
$sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
# 如果 INIT 时没存 sessionId → 从 .skill-exec-state.*.json 文件名的 hash 部分读

# 自动调 step-done
node scripts/skill-exec-manager.cjs step-done $sid `
  --step-index 1 `
  --step-name "调度 OpenCode 审核（简单 Flash / 复杂 Pro）" `
  --files "code-review-checklist.md"
```

> 🔴 **这是硬性绑定点，不可跳过。** 调完 step-done 再进 Step 5。
> 违反后果：issue 文件停留在 Step 1 的「已调度但未完成」状态，导致对话压缩后上下文丢失。

**⛔️ 删除内嵌审核标准 — 改为从 workflow-rules.md 实时读取**

**brief 模板：**

> 请审查以下 git diff 范围内的代码和规格文件。审核标准见下方从 workflow-rules.md 引用的内容。
>
> ```diff
> GIT_DIFF_HERE
> ```
>
> **注意：审核范围已包含测试文件、脚本文件和规格文件（`.feature` 和 `.md`），请一并审查。**
>
> 🔴 **两阶段审核（2026-08-05 新增，每个阶段独立结论）**：
> - **阶段 A：spec 合规** — 对照关联 Delta Specs（`笔记/项目文档/changes/<日期>-<功能名>/specs/` 的 README/.feature/expected-state），逐条核对：本次改动是否实现规格？有无遗漏场景？有无超出规格范围的改动？
> - **阶段 B：代码质量** — 仅对通过阶段 A 的文件，审：结构/命名/边界处理/性能/测试覆盖/重构规则
> - 阶段 A 有遗漏/超范围 → 先修规格差异，再进阶段 B（不混报）
> - 报告必须分两节输出：`### 规格合规问题（阶段 A）` + `### 代码质量问题（阶段 B）`，各自按 🐛🔴🟡🟢📋 独立排序
> - 无关联 specs 的改动 → 阶段 A 检查「改动是否符合变更文档（solution.md/tasks.md）描述」后直接进阶段 B，报告注明「无 Delta Specs，以变更文档为准」
>
> 🐛 **验证类结论必须可复现（2026-08-05 新增）**：若判定「测试不可运行 / 关键字不匹配 / 构建失败 / import 断裂」等可运行性/关键字类问题为阻塞项，必须附上你实际运行的验证命令与输出（如 `npx jest <file> --config <config>`、`npx tsc --noEmit`、grep 命令），禁止仅凭代码阅读下「跑不起来」的结论。注意 jest-cucumber 的 `then()` 能匹配 `.feature` 的 `And` 关键字（实测 20/20 通过），「And 未用 and() 注册」不构成「测试不可运行」。
>
> 审核标准（从 `笔记/项目文档/rules/workflow-rules.md` 和 `笔记/项目文档/rules/test-standards.md` 实时读取）：
>
> [🔴 将 workflow-rules.md 中 ## 重构规则 到 ## 变更文档化规范 之间的完整原文逐条贴入此处]
>
> [🔴 将 test-standards.md 中 ## 审核清单（代码审核时引用） 的完整原文逐条贴入此处]
>
> ### 📋 Specs 审核（必须审）
> 审核 `.feature` 和 `.md` 规格文件的内容质量：
> - **场景完整性**：`.feature` 的 Given-When-Then 是否覆盖了所有关键业务路径和边界情况？
> - **场景清晰度**：描述是否明确，能让不熟悉的人理解业务行为？
> - **冗余检查**：是否存在重复或多余的场景或描述？
> - **代码一致性**：spec 描述与 git diff 中改动的实际代码行为是否一致？
> - **状态机覆盖**：状态机转换和关键业务规则是否有对应的 spec 场景？
> - **步骤定义**：每个场景是否有对应的 `.steps.ts` 步骤定义？
> - **规范符合**：`.feature` 是否使用了正确的关键字（Feature/Scenario/Given/When/Then），格式是否正确？
> - **.md 文档同步**：spec.md/tasks.md/log.md 是否与最新实现和改动一致？
>
> 格式要求：
> - 按 🐛🔴🟡🟢📋 五级分类输出
> - 每条给出：问题描述 + 文件 + 行号 + 建议修复方式
> - 没内容写的类别直接为空 \( e.g. 「🐛 Bug 检查\n\n（无）」\)，不要保留空白条目
> - 不用 E2E 相关操作

### Step 5：转达审核结果给兄弟

1. 先 2-3 行摘要，再贴原始完整审核报告
2. **必须贴完整原始报告，禁止截断、摘要、浓缩** — 兄弟要看每条的具体描述和行号
3. **默认 🐛🔴🟡🟢📋 全部要修**，助理不能自己筛选
4. **gts-auto 模式**：跳过询问确认步骤，直接**把所有分类（🐛🔴🟡🟢📋）全部写入 fix brief**，不准遗漏任何类/任何条目
5. **非全自动模式**：问兄弟要不要修全部；兄弟说「一次性全部修」→ 全写进 brief；只有兄弟逐条说跳过才跳过
6. **空项直接不显示**，不要保留空标题行

> 🔴🔴🔴 **审核结果的修复必须通过 Step 8 调度 OpenCode Flash 执行，禁止手动修改代码。**
> 同 Step 8 的硬性红线：调度了 OpenCode 就让 OpenCode 改代码，助理本人不动手。

### 🔴🔴🔴 Step 5.5：构建审核清单（强制 artifact，防遗漏）

> **2026-07-22 新增，2026-07-29 重建** — 从 OpenCode 审核的原始输出中逐条提取审核发现，构建结构化 checklist 作为 artifact。
> 原始问题：助理只写了一半发现进 fix brief，因为「靠脑记」忘了另一半。

**在写 fix brief 之前，必须先执行此步，且输出必须写入文件。**

#### 步骤

1. **读取 OpenCode 审核的原始输出**（从 process log 中获取完整报告）

2. **逐条提取所有发现，按分类计数**：

   ```
   🐛 Bug × N（逐条列出序号+简述）
     1. [简述 + 文件]
     2. [简述 + 文件]
     ...

   🔴 清理 × N
     1. ...

   🟡 重构 × N
     1. ...

   🟢 关注 × N
     1. ...

   📋 Specs × N
     1. ...
   ```

3. **每条必须有文件/行号引用**。如果审核报告某条描述模糊 → 自己去 git diff 和源文件确认。

4. **将 checklist 写入 `笔记/项目文档/changes/<活跃变更>/specs/code-review-checklist.md`**（无活跃变更则写 `笔记/决策记录/code-review-checklist-<date>.md`）

5. **对照 checklist 写 fix brief**：fix brief 中的条目必须与 checklist 逐条对应，不能多一条也不能少一条。

6. **最终确认**：

   ```
   checklist 总条目: N
   fix brief 总条目: N
   → 一致 → ✅ 可以调度
   → 不一致 → 补全后再调度
   ```

> 🔴 关键改变：之前说「不贴给兄弟看」导致了 invisible = 没人执行。现在 checklist 必须写到文件，既是审计追踪也是强制核对工具。
>
> 🔴 checklist 写完后，在调度 fix brief 前，**必须复查一遍 checklist 条目数 == fix brief 条目数**，数值不匹配不得进入 Step 8。

#### 🔴 checklist 写入 + fix brief 就绪 → 自动 step-done（Step 2）

fix brief 就绪后（三次核对通过后、但 dispatch 前）：

```powershell
$sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId

node scripts/skill-exec-manager.cjs step-done $sid `
  --step-index 2 `
  --step-name "转达结果 + 逐类核对 + Specs 整理" `
  --files "code-review-checklist.md,code-review-fixes.md"
```

> 🔴 **dispatch 前执行，不在 dispatch 后。** Step 2 代表「结果已转达 + checklist 已构建 + fix brief 已就绪」，应在调度修复之前标记完成。
> 违反后果：issue 显示 Step 2 从未完成，下一个 handler 不知道 checklist 已经写好了。

### Step 6：Specs 整理

在开始修复前，根据 Step 3 的 specs 审核结果，一步步整理 specs：

1. **列出需要更新的规格文件**（基于 Step 3 发现的规格问题）
2. **逐条确认兄弟要改哪些**（不要一次全推过去，一条一条问）
3. 兄弟说「改」→ 按以下顺序操作：
   - a. 读现有文件，确认当前内容
   - b. 按 Cukes 规范更新 `.feature`（Given-When-Then）
   - c. 同步更新 `.steps.ts`（如需新步骤定义）
   - d. 更新 `.md` 文档（spec.md/tasks.md/log.md）
   - e. 如果涉及新的状态机转换 → 检查 `state/StateType.ts` 是否有对应类型
   - f. 如果需要，新增状态值到 `StateType.res`
4. 兄弟说「不改」→ 跳过，记一下后续可能补
5. 所有规格整理完毕后 → 跑 BDD 测试确认 specs 与代码一致

> Specs 位置约定：`笔记/项目文档/changes/<活跃变更>/specs/*.feature` + `笔记/项目文档/changes/<活跃变更>/*.md`
> Spec 命名规范：业务行为缩写，用连字符分隔（如 `pos-reset-detection.feature`）
> 每个 spec 对应一个场景清单（Main Specs），可被后续变更引用（Delta Specs）

### Step 8：调度 OpenCode Flash 修复（🔴🔴🔴 硬性红线）

**审核结果的修复统一通过 OpenCode Flash 执行，助理本人禁止手动改代码。**

> 🔴 **审核结果必须完整写入 specs**：在 `笔记/项目文档/changes/<活跃变更>/specs/` 下新建 `code-review-fixes.md`，将 Step 5 中兄弟确认要修的问题逐条列出（问题描述 + 文件 + 行号 + 修复方式），确保修复时有完整清单可对照。fix brief 引用此文件。

### 🚨 不遗漏规则（依赖 Step 5.5 的 checklist artifact）

**依赖 Step 5.5 写入的 `code-review-checklist.md` 作为对照依据。**

生成 fix brief 后，执行三次核对：

| # | 核对 | 方法 |
|---|------|------|
| 1 | fix brief vs checklist | 条目数必须一致，逐条对应 |
| 2 | fix brief vs 原始报告 | 每个原始分类（🐛🔴🟡🟢📋）的条目均在 brief 中有体现 |
| 3 | 条目数 == 调度条目数 | `$brief` 变量或 `-f` 文件中实际列出的问题数与 checklist 一致 |

**三次核对全部通过 → ✅ 才能调度 OpenCode Flash。**
任何一次不通过 → 补 fix brief，不调度。

> 之所以要三次核对，因为本次踩坑的血泪教训是：
> 1. 原始报告 7 个 🐛 Bug，brief 只写了 2 个（遗漏 5 个）= 核对 1 没过
> 2. brief 只写了 🐛🔴 共 5 条，漏了 🟡🟢 = 核对 2 没过
> 3. OpenCode 实际只收到 5 条指令，少修了 13 条 = 核对 3 没过

**如果三次核对发现条目数不一致，禁止调度，必须重新补全 brief。**

把所有要修的内容收集成 brief，按 `skills/opencode-schedule/SKILL.md` 的标准流程调度 OpenCode Flash。

**不听话的后果（今天刚犯的错）：**
- 审核发现 7 个问题 → 助理手动改了全部 7 个 → 违反了 MEMORY.md 的「调度 OpenCode 时禁止自己改代码」规则
- 修复逻辑复杂（消息监听器重注册 + addUser 身份恢复）→ 手动改容易出错、缺少自动化验证
- 正确做法：把 7 个问题写成 brief → 调度 OpenCode Flash 统一修 → 等结果 → 验证

**fix brief 模板（开头自动注入 project-context.md）：**
> 请在以下文件中修复代码审核指出的问题。
>
> 改动列表：
> 1. [问题描述]
> 2. [问题描述]
> ...
>
> 修改要求：
> - 每个问题精确对应修复，不要引入无关改动
> - 保持代码风格一致
> - 不需要代码审核，代码审核是单独步骤
> - 不需要 E2E 相关操作
> - 🔴🔴🔴 修复后必须跑**全量**测试套件（不只改动相关 suite），确认 0 regression。
>   全量测试命令参考（monorepo 必须用根 jest 二进制）：
>   - <包1>：cd packages/<包1> && node ../../node_modules/jest/bin/jest.js --config <config>
>   - <包2>：npx jest --config <config>
>   - tsc：npx tsc --noEmit
>   - rescript build：node ../../packages/logic/node_modules/rescript/cli/rescript.js build
>   输出实际运行结果（passed/failed 数量 + 失败列表）

> 🔴🔴🔴 **兄弟确认修什么后，助理只做 3 件事：写 brief → 调度 OpenCode → 等结果。**
> 不读代码怎么修，不改文件内容，不跑 fix 用的 tsc/jest。

### Step 8.5：🔴🔴🔴 bot 独立复验全量测试矩阵（2026-08-06 新增，不可省）

> agent 报告「验证通过」≠ 真通过。**bot 必须自己跑全量测试矩阵独立复验**，不能信 agent 自报。
> 实测（nf 审核 2026-08-06）：3 个修复 session 全部自报通过，但 bot 独立复验全部发现 agent 没跑到的失败：
> - 批2 agent 没跑全量 nf jest → 6 失败（helper return 漏 sentMessages 字段）
> - 补漏1 agent 没跑 room-service → config-loader suite 崩溃（feature 没同步 4004）
> - 补漏2 agent 没跑 frontend 全量 → 2 失败（动态 import 异步时序 + 防叠加测试期望过时）

**独立复验矩阵（所有受影响包）：**

```powershell
# 每个受影响的包都要跑，不能只跑 agent 报告的那个
# monorepo jest 路径坑：npx jest 解析到错误 node_modules，必须用根 jest 二进制
cd packages/<包名> && node ../../node_modules/jest/bin/jest.js --config <config> --silent
# tsc
npx tsc --noEmit
# rescript build
node ../../packages/logic/node_modules/rescript/cli/rescript.js build
```

**复验规则：**
- 跑全量测试矩阵后，**所有包全部 passed 才算完成**，任何 failed 都要处理（修测试或调度 agent 修源码）
- 失败归属判断：agent 引入的回归 → 再调度 Flash 修（带失败日志）；测试期望过时 → 按新行为更新断言（低风险 bot 直改或调度）
- 全量测试通过后，**修改验证才算真正完成**，才允许写 .last-review + step-done

### Step 9：验证修复

1. 检查 git diff 确认改动范围合理
2. **先问兄弟**：「要不要跑 E2E 验证？跑哪些场景？」
3. 收到兄弟回复后，调度 **一次** OpenCode Flash 会话，统一完成：
   - 跑 BDD 测试，发现问题则修复测试直到通过
   - 跑类型检查 `npx tsc --noEmit`，发现类型错误则修复
   - 检查 specs 与代码行为一致性，发现不一致则更新 specs 或代码
   - 如果 specs 有改动 → 再跑 BDD 确认规格与代码完全一致
   - 如果兄弟说要跑 E2E → 跑指定场景（确认环境→执行→分析结果→修复）
   - 汇总最终结果

> 🔴 **一次调度，全部包含**：先问 E2E 意愿，然后一个 OpenCode Flash 会话全部做完。
>
> 调度模式参考 `skills/opencode-schedule/SKILL.md`：使用 Flash 模型，`--no-replay`，$brief 变量传参，不阻塞等结果（poll 轮询）。

### Step 9.5：🔴 修复核对循环（逐条核对，不得遗漏）

**验证修复后，必须逐条核对审核意见是否真正被修复了。** 不能假设 OpenCode 修了就等于修好了。

> 🟡 **核对依据**：以 Step 8 写入的 `code-review-fixes.md` 为清单，逐条对照 git diff 检查。如果兄弟确认修的问题没有全部写入 code-review-fixes.md → 🟡 警告并补全。

#### 🔴 Token 优化 — 禁止加载完整 git diff

核对时禁止 `git diff HEAD` 一次性加载完整 diff（可能数千行 → 大幅消耗 token）。改用三步查法：

```powershell
# 1. 先拿文件清单（几行 token）
$changedFiles = git diff --name-only HEAD

# 2. 从 code-review-fixes.md 提取涉及的文件列表
#    比对：changedFiles 中是否包含了所有应修复的文件
$missingFiles = $reviewedFiles | Where-Object { $_ -notin $changedFiles }
if ($missingFiles.Count -gt 0) { → 漏修：文件级别 }

# 3. 只对有改动的文件做精准 diff，而且只读前 20 行
foreach ($file in $changedFiles) {
    $lines = git diff HEAD -- $file | Select-Object -First 20
    # 检查 diff 是否涉及审核意见中指出的行号范围
    # 检查 diff 是否做了正确的修改方向
}
```

**具体纪律：**
- 不执行裸 `git diff HEAD`（无文件路径）
- 先 `git diff --name-only`（仅文件列表，~N 行 token）
- 按文件名匹配后，只对有问题的文件做 `git diff HEAD -- <file-path>` + `Select-Object -First 30`
- 每次 diff 阅读严格 ≤30 行，超长截断
- 不读未在 `code-review-fixes.md` 清单中的文件的 diff

#### 核对清单

对于 `code-review-fixes.md` 中的**每条**问题（🐛🔴🟡🟢📋），检查：

| # | 检查项 | 说明 | 优化方式 |
|---|--------|------|--------|
| 1 | **代码被改了？** | 该文件的对应行是否有改动？ | 不读全 diff，只 `git diff HEAD -- <file>` + 前 30 行 |
| 2 | **改对方向了？** | 改动是否针对了审核意见指出的问题？ | 用 `Select-String -Pattern <关键词>` 在 diff 中快速定位，不逐行读 |
| 3 | **改动合理？** | 改动是否引入了新问题？ | 仅在怀疑时读该文件改动部分（`Select-Object -Skip 30`） |
| 4 | **改动完整？** | 如果问题涉及多个位置的同一模式，是否都修了？ | 用 `Select-String` 搜索模式出现次数对比预期 |
| 5 | **没引入新问题？** | 改动的周围代码是否被意外破坏？ | 只检查改动的文件，不检查未改动文件 |

#### 循环规则

```
1. $changedFiles = git diff --name-only HEAD
2. 比对 code-review-fixes.md 的文件清单
3. 有遗漏文件 → 直接标记为漏修，不进批量 diff
4. 文件都不缺 → 对每个文件做 git diff HEAD -- <file> | Select-Object -First 30
5. 逐条核对（只核对 code-review-fixes.md 中的条目，不核对已修的）
  → 全部匹配 → ✅ 通过，进 Step 10
  → 有未修/修偏/修错 → 重新生成 fix brief（只包含未通过的问题），调度 OpenCode Flash 再修
    → 回到 Step 1 重新核对
    → 如果连续 3 次循环同一个问题仍未修复 → 汇报兄弟「xxx 问题 OpenCode 始终没修对，建议手动修」
```

**关键：**
- 每次循环只发「未被正确修复的问题」给 OpenCode，不发已修好的
- fix brief 里附上正确的代码示例/预期写法，帮助 OpenCode 理解意图
- 这步是 bot 自己做精准 diff 检查，不调度 OpenCode 检查
- **连续 3 次不过才找兄弟**，不每次循环都问兄弟
- **总 token 预算：每次核对 ≤200 tokens 用于文件列表 + 每条审核问题 ≤50 tokens 用于 diff 验证**

#### 🔴 核对循环全部通过 → 自动 step-done（Step 3）+ cleanup

核对循环确认全部修复正确后、进 Step 10 之前：

```powershell
$sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId

node scripts/skill-exec-manager.cjs step-done $sid `
  --step-index 3 `
  --step-name "OpenCode Flash 修复 + 验证核对 + .last-review + 通知" `
  --files "$(git diff --name-only HEAD | Select-String -Pattern '\\.(ts|tsx|js|feature|steps)' | Join-String -Separator ',')"

# Step 3 是最后一步 → cleanup
node scripts/skill-exec-manager.cjs cleanup $sid --result completed
```

> 🔴 **核对通过立即执行，不在 Step 10 之后。** Step 3 代表「修复+验证核对全部完成」，应在写 .last-review 和通知之前标记扣死。
> cleanup 会关闭 issue + 注销 registry + 删除 state 文件。

### ⚠️ 嵌套调用检测（cleanup 前执行）

> 本 skill 可能被 gts-dev-feat / gts-dev-fix / gts-dev-refactor 等 skill 内部调用。
> **判断方式**：执行 cleanup 前读取 `.skill-exec-state.<sessionId>.json`，如果文件存在且 `skillName` 不是 `"gts-code-review"` → 视为嵌套调用。

| 场景 | 反思 | pitfalls 记录 |
|------|------|--------------|
| **独立触发**（兄弟直接说「代码审核」「审核」） | ✅ 执行 gts-skill-reflect | 记到自己的 issue |
| **嵌套调用**（被 feat/fix/refactor 调用） | ❌ 跳过反思 | 用**调用方 sessionId** 执行 `append-pitfall`，记到顶层 issue |

> 嵌套时反思由顶层 skill（feat/fix/refactor）统一执行，本 skill 不重复反思。

### Step R：技能反思（仅独立触发时）

嵌套调用时**跳过本步骤**，同时**跳过 Step 10（写 .last-review）**，直接进 Step 7（保存）。

> 🔴 **嵌套调用禁止写 .last-review**（2026-08-03 踩坑）：被 feat/fix/refactor 调用时，审核范围只是本次改动（非全量基线），写入会污染 `.last-review` 的「上次完整审核基线」语义，导致下次独立审核范围判定错误。

独立触发时，调用 gts-skill-reflect：

```
走 skills/gts-skill-reflect/SKILL.md 流程（收集 pitfalls + 执行指标 + 记忆检索 → 分析 → 报告 → 等兄弟确认）
```

> 反思产出改进建议，**等兄弟确认后才执行**（skill_workshop），不自动改 skill。
> 反思不阻塞通知；反思完成后进 Step 10（写 .last-review）继续。

### Step 10：写入 .last-review（仅独立触发时）

> 🔴 **嵌套调用跳过本步骤**（2026-08-03 踩坑）：`.last-review` 只由独立触发的代码审核推进，嵌套调用不得写入。

```bash
cd D:/Github/GTS-Play/
git rev-parse HEAD > 笔记/决策记录/.last-review
```

> `.last-review` 文件只由本 Skill 修改，其他 skill 不得读取或写入。

### Step 7：🔴 保存记忆和笔记（最后一步，反思之后）

反思完成、修复验证通过后，**必须走 gts-submit-save skill 完整流程**（git commit + 保存记忆/笔记 + git push），禁止跳过或替代。

补充更新：
- 更新 daily log 追加本次审核摘要（范围/问题数量/修复文件/教训）
- 如果是 lessons 级别的重要经验 → 写到 `笔记/项目文档/lessons/` 下独立文件
- 如果产生了新的工作协议/规则/红线 → 更新对应规则文档并在 daily log 中标注

> 只有 1 和 2 是必做。3 只在产生了可重复使用的规则时才做。
> 🔴 **保存必须在反思之后**：gts-submit-save 是工作流最后一步（通知之前），确保反思产出的 skill 更新/修复/报告能一起被提交，不会分两批。
> 更新时间在反思之后、写入 `.last-review` 之后（.last-review 先写、随保存一起入库）。

### Step 11：通知兄弟提交 + 询问是否执行代码检查

代码审核修复完成，飞书通知（≤10字）+ 桌面消息，等兄弟说「提交」或继续后续步骤。

#### 🔴 仅限独立调用时询问

如果本次代码审核是**兄弟直接触发**（通过说「代码审核」「审核」），**不是**由 feat/fix/refactor 等 skill 内部调用的，则审核修复完成后，**问兄弟要不要执行 `gts-health-check`（代码检查）**。

```
代码审核修复完成了，要不要跑一遍代码检查（health check）全面看一下？
```

- 兄弟说「要」→ 执行 `gts-health-check` skill
- 兄弟说「不用」「算了」→ 跳过

> feat/fix/refactor 等 skill 内部调用代码审核时，由上游 skill 全权负责后续流程，此处不再询问。

---

## 📊 Token 优化速查

| 步骤 | 耗 token 动作 | 优化方案 | 预期节省 |
|------|-------------|---------|--------|
| Step 8 写 fix brief | 内联 project-context.md 的完整上下文 | 只写一句「项目上下文见 `笔记/项目文档/project-context.md`」，OpenCode 可自行选读 | ~300-500 |
| Step 9.5 核对 | 裸 `git diff HEAD` 可能数千行 | 三步查法：`--name-only` → 文件比对 → 单文件 diff + `Select-Object -First 30` | ~2000-5000 |

### 通用原则

1. **`Select-Object -First N` 是防超载兜底** — 所有 file read、grep、git diff 的输出都要截断
2. **不要加载未改动的文件** — 只看 git diff 涉及的文件
3. **不要加载无关模块** — 审核只涉及 3 个包（frontend-multiplayer、room-service、match-service），忽略其余
4. **用 pattern 替代全文** — 确认某个模式是否存在比读完整文件省 token 10x
