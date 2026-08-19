---
name: "gts-e2e-test"
description: "兄弟说「e2e测试」时触发。支持多人版（frontend-multiplayer）和单机版（frontend）两套手动 E2E，列出可选 scenarios 供选择。线上测试跳过本地服务。"
---

# E2E 手动测试（硬性操作规程）

> 触发词：兄弟说「e2e测试」/「e2e」/「e2e test」，可附带操作描述和验证目标。
> 支持两套项目：**多人版** `packages/frontend-multiplayer`（双窗口手动操作）与**单机版** `packages/frontend`（单窗口手动操作，dev-server 7093）。
> 窗口统一走**已安装 Google Chrome 本体（channel: 'chrome'）+ GPU 硬件加速**（共享 helpers 已去掉 --disable-gpu 并加 --enable-webgl，2026-08-02 起共享框架默认）。
> 手动操作 + 可选注入专用日志，停止后抓数据验证。

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

本 skill 的执行状态追踪使用以下 **7 步序列**，对应工作流中的关键断点/恢复点：

```
步骤序列（7 步）：
  0: 判断环境 + 重启服务
  1: 解析输入 + 明确验证目标
  2: 运行测试（手动→bot直接跑，自动→调度OpenCode）
  3: 不阻塞等待（等待兄弟操控）
  4: 结果分析
  5: 更新操作文档
  R: 技能反思（调用 gts-skill-reflect，CLEANUP 后执行，不阻塞 CHECK 恢复）
```

### INIT（skill 触发时第一时间执行）

```powershell
# 1. 获取/生成 session ID 和 workflow ID
$sid = node scripts/skill-exec-manager.cjs get-session-id | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
$wid = node scripts/skill-exec-manager.cjs get-workflow-id $sid | ConvertFrom-Json | Select-Object -ExpandProperty workflowId

# 2. 同任务预检（dispatch 前查 OpenCode DB 确认无「相同任务」活跃 session；不同任务直接并行，全局 dispatch 锁已废弃 2026-08-01）
# 3. stateInit + issueCreate + registryRegister
node scripts/skill-exec-manager.cjs init $sid $wid "gts-e2e-test" `
  --steps 0,1,2,3,4,5,R `
  --summary "<测试摘要>" `
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
  "skillName": "gts-e2e-test",
  "sessionId": "<自动获取或生成>",
  "workflowId": "wf_<timestamp>_<random8>",
  "totalSteps": 6,
  "stepSequence": ["0", "1", "2", "3", "4", "5"],
  "completedSteps": [],
  "remainingSteps": [
    {"index": "0", "name": "判断环境 + 重启服务"},
    {"index": "1", "name": "解析输入 + 明确验证目标"},
    {"index": "2", "name": "运行测试"},
    {"index": "3", "name": "不阻塞等待（等待兄弟操控）"},
    {"index": "4", "name": "结果分析"},
    {"index": "5", "name": "更新操作文档"},
    {"index": "R", "name": "技能反思（调用 gts-skill-reflect）"}
  ],
  "completedCount": 0,
  "context": {
    "featureSummary": "<本次测试目标>",
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
🤖 检测到未完成的工作流：gts-e2e-test

   已完成（{n}/{total}）:
     ✅ 0: 判断环境 + 重启服务
     ✅ 1: 解析输入 + 明确验证目标

   剩余步骤（{m}/{total}）:
     📋 2: 运行测试
     📋 3: 不阻塞等待（等待兄弟操控）
     📋 4: 结果分析
     📋 5: 更新操作文档
     📋 R: 技能反思（调用 gts-skill-reflect）

   最后更新：{相对时间}

   🔜 即将执行下一步 Step 2
   （如需跳过、调整或放弃，请现在告知）
```

#### 长时间中断恢复模板

```
🤖 检测到 {duration} 前中断的工作流：gts-e2e-test

   上下文：
     featureSummary: <之前记录的内容>
     verificationCriteria: <之前记录的内容>

   已完成（{n}/{total}）:
     ✅ 0: 判断环境 + 重启服务

   剩余步骤（{m}/{total}）:
     📋 1: 解析输入 + 明确验证目标
     📋 2: 运行测试
     📋 3: 不阻塞等待（等待兄弟操控）
     📋 4: 结果分析
     📋 5: 更新操作文档
     📋 R: 技能反思（调用 gts-skill-reflect）

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

当本 skill 被其他 skill（如 `gts-acceptance`）流程中调用时：
- **由调用方管理状态文件**，本 skill 不执行 INIT/STEP_DONE/CLEANUP
- 仅在**独立触发**时（兄弟直接说「e2e测试」「e2e」）初始化自己的状态追踪

**判断方式**：执行任何步骤前读取 `.skill-exec-state.<sessionId>.json`。如果文件存在且 `skillName` 不是 `"gts-e2e-test"` → 视为嵌套调用，跳过所有状态文件操作。

**反思规则**：

| 场景 | 反思 | pitfalls 记录 |
|------|------|--------------|
| **独立触发**（兄弟直接说「e2e测试」） | ✅ Step R 执行 gts-skill-reflect | 记到自己的 issue |
| **嵌套调用**（被 gts-acceptance 调用） | ❌ 跳过反思 | 用**调用方 sessionId** 执行 `append-pitfall`，记到顶层 issue |

> 嵌套时反思由顶层 skill 统一执行，本 skill 不重复反思。

---

## 前置：判断项目类型

触发后**先判断本次 E2E 属于哪个项目**（兄弟没说时默认多人版，说了「单机」「前端」「frontend」「本地单机」则走单机版）：

| 项目 | 目录 | dev-server 端口 | 服务依赖 | 环境 |
|------|------|:---:|------|------|
| **多人版** frontend-multiplayer | `packages/frontend-multiplayer/test/e2e/` | 8093 | room-service (4003) + match-service (3000) | local / preproduction / scf |
| **单机版** frontend | `packages/frontend/test/e2e/` | **7093** | 无（只要 dev-server） | 仅 local（--env 一律回退 7093） |

> 单机版**只有手动 E2E，没有 auto 目录**；场景只开 1 个浏览器窗口；不需要登录/房间/匹配服务。

## 前置：查 E2E 操作手册

编写或修改 scenario JSON 前，先查阅对应项目的 `test/e2e/E2E-OPERATIONS.md`（多人版 `packages/frontend-multiplayer/test/e2e/E2E-OPERATIONS.md`，单机版 `packages/frontend/test/e2e/E2E-OPERATIONS.md`）：
- 找现成的操作积木（block），不重复造轮
- 查看常见操作组合，减少 trial-and-error
- 检查国际化文字对照表，用对按钮文字

测试完成后，检查是否有新的操作模式需要记录到对应项目的 E2E-OPERATIONS.md。

## 步骤

### 🔴 窗口模式规则

- **非全自动模式**（默认）→ 有头窗口（headed，兄弟可以看到浏览器工作）
- **全自动模式激活时**（gts-auto skill 生效）→ 无头窗口（`--headless`）

### Step 0：判断环境 + 重启服务 + 部署检查

**先判断测试目标（见上方「前置：判断项目类型」），再按项目分支处理：**

#### 🟢 单机版（packages/frontend）— 本地环境

1. 检查 dev-server 是否在运行（端口 7093，进程匹配 `webpack`）
2. 未运行则启动：`cd packages/frontend && yarn webpack:dev-server`（exec background + timeout=0，bot poll 等 HTTP 200）
3. 不需要 room/match 服务、不需要登录、不需要部署检查
4. 首次编译主包约 40MB+，加载慢是正常现象，不要误判为卡死

#### 多人版（frontend-multiplayer）— SCF 线上环境

1. **跳过本地服务重启**
2. **检查部署状态**：运行 `git diff HEAD -- packages/frontend/src/ packages/room-service/src/ packages/match-service/src/ packages/logic/src/` 检查是否有未部署的生产代码改动
   - 如有改动 → 询问兄弟
   - 如兄弟说「部署」→ 走 gts-deploy skill
3. **继续 Step 1**

#### 多人版（frontend-multiplayer）— 本地环境

> 🔄 **调度 OpenCode Flash** 执行以下操作并汇报：
> 1. 检查 webpack-dev-server 是否在运行（按进程匹配 `webpack`），未运行则启动
> 2. Kill 现有 room (4003) + match (3000) 进程
> 3. 启动 room-service（`yarn dev`），等启动完成
> 4. 启动 match-service（`yarn dev`），等连接成功
> 不重启会导致 match-service WS 失连。

### Step 1：解析输入 + 明确验证目标

兄弟可选择指定 scenarios 或附带验收标准。

**每次测试前必须先明确验证目标**：
- 兄弟说清楚要验证什么、预期行为是什么、怎么算通过
- 如果本次测试是在某个功能变更（`feat:/fix:/refactor:`）流程中触发的，验证目标以 `笔记/项目文档/changes/<日期>-<功能名>/spec.md` 中的验证策略为准
- 如果兄弟没有说验证目标，主动问：「这次 E2E 要验证什么？预期行为是什么？」

**无指定时：** 默认跑对应项目的 `scenarios/manual/manual-simple-flow.json`。

**指定场景时：** 列出可选 scenarios 供兄弟选择（**动态读取对应项目的 `scenarios/manual/*.json`**）：

```
=== 手动测试 Scenarios (scenarios/manual/) ===

[1]  自由操作              — scenarios/manual/manual-simple-flow.json (7块, headed, 自由操作后点停止)
[2]  双人完整流程（多人版） — scenarios/manual/manual-full-flow.json (32块, headed, 全自动)

=== 自动测试 Scenarios (scenarios/auto/) 可切换（仅多人版） ===

[... 动态读取 scenarios/auto/*.json ...]
```

运行方式（**多人版**相对于 `packages/frontend-multiplayer/test/e2e/`）：
  🔴 手动测试 → bot 直接跑（不调度 OpenCode）
    本地：    node e2e-runner.cjs scenarios/manual/<name>.json --env local
    预发：    node e2e-runner.cjs scenarios/manual/<name>.json --env preproduction
    SCF：     node e2e-runner.cjs scenarios/manual/<name>.json --env scf
  🔄 自动测试 → 调度 OpenCode Flash
    本地：    node e2e-runner.cjs scenarios/auto/<name>.json --env local
    预发：    node e2e-runner.cjs scenarios/auto/<name>.json --env preproduction

运行方式（**单机版**相对于 `packages/frontend/test/e2e/`）：
  🔴 只有手动测试 → bot 直接跑（不调度 OpenCode）
    本地：    node e2e-runner.cjs scenarios/manual/<name>.json --env local
    （或直接 `cd packages/frontend && yarn e2e:manual`，等价）
```

> **每次列出时动态读取** 对应项目 `scenarios/manual/*.json`。上面的列表是示例，以实际文件为准。

**有验收标准时：** 在选定 scenario 基础上修改或新增 scenario JSON。
**无验收标准时：** 直接跑选定 scenario。

### Step 2：生成并启动测试

**有验收标准：** 以选定的 scenario 为模板修改或新增 JSON，保存到对应目录下。

**无验收标准：** 直接跑选定的 scenario。

#### 🔴 手动测试（scenarios/manual/）— bot 直接运行

手动测试需要兄弟多次交互（操作浏览器、汇报问题等），**由 bot 直接运行 e2e-runner**，不调度 OpenCode：

```
多人版：cd packages/frontend-multiplayer/test/e2e && node e2e-runner.cjs scenarios/manual/<name>.json --env <local|preproduction|scf>
单机版：cd packages/frontend/test/e2e && node e2e-runner.cjs scenarios/manual/<name>.json --env local
       （或 cd packages/frontend && yarn e2e:manual，等价）
```

> 命令用 `exec(background=true, timeout=0)` 跑，bot 负责 poll 查看输出、等待兄弟操作、处理和测试相关的消息。

#### 🔴 自动测试（scenarios/auto/）— 调度 OpenCode

自动测试不需要兄弟交互，**调度 OpenCode Flash** 来运行：

> 🔄 **调度 OpenCode** 运行选定的 E2E 场景（仅多人版有 auto 目录；单机版无自动测试）。OpenCode 负责执行，bot 负责 poll 检查日志。
> OpenCode 命令：`cd packages/frontend-multiplayer && node e2e-runner.cjs scenarios/auto/<name>.json --env preproduction`

#### 🔴 截图分析（按需判断，需要才做）

> **每次 e2e 跑完后，brief 必须写明是否做截图分析及理由**（2026-08-01 兄弟定稿）：截图是验证目标（模型/页面真实渲染、视觉效果）→ brief 让 OpenCode 用 `gts-screenshot-analyze` 分析（ImageMagick 降质 + Kimi K2.7 多模态）；截图非验证目标或场景无截图 block → brief 写「无需截图分析」+ 理由，不强制
> OpenCode 跑完 e2e 后，读取 .opencode/skills/gts-screenshot-analyze/SKILL.md（OpenCode 侧 skill），按流程用 ImageMagick 降质 + Kimi K2.7 多模态分析生成的截图，确认页面/模型真实渲染（不只文本断言）。
> 判断标准：场景断言已覆盖验证目标 → 无需分析；只有文本断言不够、需要看图验证渲染/效果 → 分析。

#### 🔴 Step-done 绑定

e2e-runner 退出后（手动或自动），**立即**更新 issue 进度：

```powershell
$sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
node scripts/skill-exec-manager.cjs step-done $sid --step-index 2 --step-name "运行测试"
```

### Step 3：不阻塞等待

- **启动后告知兄弟，不持续等待**
- **兄弟发新消息时**：
  - 判断消息是否与当前测试相关（如看日志、分析结果、点停止等）→ **保留测试进程**，直接处理
  - 与当前测试无关（让我干别的事）→ 先停掉 e2e-runner + 杀 Chrome 进程，再处理新请求
- **如果 E2E 自然退出** → 输出结果分析 + 发通知

### Step 4：结果分析

场景退出后：

1. **日志已自动保存** — saveLogs block 或 saveE2EData 已在停止时自动保存日志
2. **简要分析** — 在会话中输出关键结论
3. **写入变更文档（如当前有变更流程）** — 如果本次测试是在某个功能变更流程中触发的，将测试结论写入对应 `log.md`：
   ```
   ## E2E 手动验证
   - 时间：<日期>
   - 验证目标：<什么行为>
   - 结论：通过/失败
   - 失败原因：<如有>
   ```

### Step 5：更新操作文档

按下方「🔴 每次 E2E 后更新操作文档」规则检查并更新**对应项目**的 `test/e2e/E2E-OPERATIONS.md`（多人版 `packages/frontend-multiplayer/test/e2e/E2E-OPERATIONS.md`，单机版 `packages/frontend/test/e2e/E2E-OPERATIONS.md`）。

### Step R：技能反思（仅独立触发时）

嵌套调用时**跳过本步骤**，直接进双通道通知。

独立触发时，调用 gts-skill-reflect：

```
走 skills/gts-skill-reflect/SKILL.md 流程（收集 pitfalls + 执行指标 + 记忆检索 → 分析 → 报告 → 等兄弟确认）
```

> 反思产出改进建议，**等兄弟确认后才执行**（skill_workshop），不自动改 skill。
> 反思不阻塞通知；反思完成后发双通道通知。

### 双通道通知

分析后发飞书通知（≤10字）+ 桌面消息告知兄弟。

---

## 索引维护规则

> Scenarios 新增/移动/重命名后，**必须同步更新本 SKILL.md 的场景索引表**（分多人版/单机版两段）。
> 运行方式统一为：多人版 `cd packages/frontend-multiplayer/test/e2e && node e2e-runner.cjs scenarios/manual/<name>.json --env <local|preproduction|scf>`（手动→bot直接跑，有头）或 `node e2e-runner.cjs scenarios/auto/<name>.json --env <local|preproduction|scf>`（自动→调度 OpenCode，无头）；单机版 `cd packages/frontend/test/e2e && node e2e-runner.cjs scenarios/manual/<name>.json --env local`（或 `cd packages/frontend && yarn e2e:manual`）。

## 🔴 每次 E2E 后更新操作文档

**每次 E2E 测试结束后（无论完成还是被停止），必须检查并更新对应项目的操作文档：**

1. 查阅对应项目的 `test/e2e/E2E-OPERATIONS.md`（多人版 / 单机版各自一份）
2. 检查本次测试中是否有**新的操作模式**（无法用现有积木组合的操作）
3. 新的原子操作 → 新建积木 `.cjs` 文件 + 更新文档
4. 新的组合模式 → 只更新文档的「常见操作组合」部分
5. 发现积木有 bug 或缺失参数 → 修复积木 + 更新文档

**违反后果：** 下次测试又得从头 trial-and-error，效率低下。

## 🔴 浏览器窗口规则（2026-08-02 起共享框架默认）

- **统一走已安装 Google Chrome 本体**：共享/项目 browser block 的 `launchPersistentContext` 均传 `channel: 'chrome'`，不用 Playwright 内置 chromium
- **GPU 硬件加速**：共享 helpers `CHROME_ARGS` 已去掉 `--disable-gpu` 并加 `--enable-webgl`（多人版 helpers 本就无 disable-gpu）
- **好处**：WebGL 游戏不卡（软件渲染卡顿根因已消除）；环境与兄弟日常 Chrome 一致
- 若某场景需要无头/软件渲染，可显式传 `channel: 'chromium'` 或自行覆盖 args 覆盖默认

## 🔴 环境通过运行参数指定

> 详细规则见对应项目的 `test/e2e/E2E-OPERATIONS.md` → **🔴 环境配置规则**（多人版 `packages/frontend-multiplayer/test/e2e/E2E-OPERATIONS.md`；单机版仅 local，`--env` 一律回退 7093）。

- 环境通过 `--env` 参数指定（`local` | `scf` | `preproduction`），**禁止**硬编码到积木或 scenario JSON
- 积木通过 `ctx.env` / `ctx.resolveUrl()` / `helpers.getMatchApiUrl()` 获取环境相关配置
- 新增环境时只在 `e2e-helpers.cjs` 的 `getPageUrl` / `resolveUrl` / `getMatchApiUrl` 中添加映射
- 违反后果：同一个场景要维护多份 JSON，维护爆炸

## 执行纪律

1. **判断项目类型**（多人版 / 单机版，见「前置：判断项目类型」），再判断测试环境
2. 多人版 SCF 线上跳过 Step 0 服务重启，但需做部署检查；单机版只有本地，只要 dev-server
3. 手动 Scenarios 在对应项目 `test/e2e/scenarios/manual/` 目录下查找（JSON 文件），多人版自动场景在 `auto/`（单机版无 auto）
4. 默认无指定时跑对应项目的 `manual/manual-simple-flow.json`
5. 有验收标准时基于 template 修改或新增 scenario JSON
6. 测试过程不阻塞等兄弟
7. 跑完后双通道通知
8. **E2E 结束后（完成/停止），更新对应项目操作文档**
