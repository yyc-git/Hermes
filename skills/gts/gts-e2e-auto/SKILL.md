---
name: "gts-e2e-auto"
description: "兄弟选 scenario 后再决定是否启本地服务或部署。先列场景等选，按所选决策环境。"
---

# E2E 自动测试（硬性操作规程）

> 触发词：兄弟说「e2e自动」/「e2e auto」/「自动测试」。
> 列场景等选 → 按所选决策环境（本地服务 / 预发环境）→ 顺序执行 → 通知。

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
  0: 列出可用 scenario，等兄弟选择
  1: 根据所选 scenario 准备环境（调度 OpenCode）
  2: 按顺序执行 E2E（调度 OpenCode）
  3: 更新操作文档 + 结果汇总
  R: 技能反思（调用 gts-skill-reflect，CLEANUP 后执行，不阻塞 CHECK 恢复）
```

### INIT（skill 触发时第一时间执行）

```powershell
# 1. 获取/生成 session ID 和 workflow ID
$sid = node scripts/skill-exec-manager.cjs get-session-id | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
$wid = node scripts/skill-exec-manager.cjs get-workflow-id $sid | ConvertFrom-Json | Select-Object -ExpandProperty workflowId

# 2. 同任务预检（dispatch 前查 OpenCode DB 确认无「相同任务」活跃 session；不同任务直接并行，全局 dispatch 锁已废弃 2026-08-01）
# 3. stateInit + issueCreate + registryRegister
node scripts/skill-exec-manager.cjs init $sid $wid "gts-e2e-auto" `
  --steps 0,1,2,3,R `
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
  "skillName": "gts-e2e-auto",
  "sessionId": "<自动获取或生成>",
  "workflowId": "wf_<timestamp>_<random8>",
  "totalSteps": 5,
  "stepSequence": ["0", "1", "2", "3", "R"],
  "completedSteps": [],
  "remainingSteps": [
    {"index": "0", "name": "列出可用 scenario，等兄弟选择"},
    {"index": "1", "name": "根据所选 scenario 准备环境（调度 OpenCode）"},
    {"index": "2", "name": "按顺序执行 E2E（调度 OpenCode）"},
    {"index": "3", "name": "更新操作文档 + 结果汇总"},
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
🤖 检测到未完成的工作流：gts-e2e-auto

   已完成（{n}/{total}）:
     ✅ 0: 列出可用 scenario，等兄弟选择

   剩余步骤（{m}/{total}）:
     📋 1: 根据所选 scenario 准备环境（调度 OpenCode）
     📋 2: 按顺序执行 E2E（调度 OpenCode）
     📋 3: 更新操作文档 + 结果汇总
     📋 R: 技能反思（调用 gts-skill-reflect）

   最后更新：{相对时间}

   🔜 即将执行下一步 Step 1
   （如需跳过、调整或放弃，请现在告知）
```

#### 长时间中断恢复模板

```
🤖 检测到 {duration} 前中断的工作流：gts-e2e-auto

   上下文：
     featureSummary: <之前记录的内容>
     verificationCriteria: <之前记录的内容>

   已完成（{n}/{total}）:
     ✅ 0: 列出可用 scenario，等兄弟选择

   剩余步骤（{m}/{total}）:
     📋 1: 根据所选 scenario 准备环境（调度 OpenCode）
     📋 2: 按顺序执行 E2E（调度 OpenCode）
     📋 3: 更新操作文档 + 结果汇总
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
- 仅在**独立触发**时（兄弟直接说「e2e自动」「自动测试」）初始化自己的状态追踪

**判断方式**：执行任何步骤前读取 `.skill-exec-state.<sessionId>.json`。如果文件存在且 `skillName` 不是 `"gts-e2e-auto"` → 视为嵌套调用，跳过所有状态文件操作。

**反思规则**：

| 场景 | 反思 | pitfalls 记录 |
|------|------|--------------|
| **独立触发**（兄弟说「e2e自动」） | ✅ Step R 执行 gts-skill-reflect | 记到自己的 issue |
| **嵌套调用**（被 gts-acceptance 调用） | ❌ 跳过反思 | 用**调用方 sessionId** 执行 `append-pitfall`，记到顶层 issue |

> 嵌套时反思由顶层 skill 统一执行，本 skill 不重复反思。

---

## 前置：查 E2E 操作手册

编写或修改 scenario JSON 前，先查阅 `packages/frontend-multiplayer/test/e2e/E2E-OPERATIONS.md`：
- 找现成的操作积木（block），不重复造轮
- 查看常见操作组合，用已有积木拼装场景
- 检查国际化文字对照表，用对按钮文字

测试完成后，同步更新操作文档（见 Step 3）。

## 步骤

### 🔴 窗口模式规则

- **非全自动模式**（默认）→ 有头窗口（headed，兄弟能看到浏览器工作）
- **全自动模式激活时**（gts-auto skill 生效）→ 无头窗口（`--headless`）

### Step 0：列出可用 scenario，等兄弟选择（带序号）

扫描 `packages/frontend-multiplayer/test/e2e/scenarios/auto/` 下的 JSON 文件，输出带序号的列表：

```
=== 可用自动 E2E Scenarios (scenarios/auto/) ===

[ ] ① create-room-join-game.json — 创建/加入/开始游戏（本地）
[ ] ② gameover-twocycle.json — 双用户联机到结束（本地）
[ ] ③ room-lifecycle.json — 房间生命周期（本地）
[ ] ④ move-verify.json — 移动验证+KB操作（本地）
[ ] ⑤ perf-scene3.json — 性能录制（本地）
[ ] ⑥ test-hooks.json — 自定义 hooks 验证（本地）
[ ] ⑦ scf-keepalive-verify.json — 保活验证（预发环境）
[ ] ⑧ scf-member-list-check.json — 成员列表状态检查（预发环境）

```

等兄弟勾选后进入 Step 1。

### Step 1：根据所选 scenario 决定环境准备

分析兄弟勾选的 scenarios，按环境分组：

#### 纯本地 scenarios（不选预发场景时）

> 🔄 **调度 OpenCode Flash** 执行以下操作并汇报：
> 1. Kill 现有 room (4003) + match (3000) 进程
> 2. 启动 room-service（`yarn dev`），等启动完成
> 3. 启动 match-service（`yarn dev`），等连接成功
> 4. 确认 webpack-dev-server (8093) 已在运行
5. 继续 Step 2

不重启会导致 match-service WS 失连，游戏卡在"查找房间中"。

#### 含预发环境 scenarios（选了预发场景时）
1. **跳过本地服务重启**
2. **前置检查**：确认预发 SCF 函数（`room_preproduction`+`match_preproduction`）已部署且状态 Active
3. 继续 Step 2

#### 混合（既有本地又有预发）
先跑本地环境的，本地跑完再切预发环境（用 `--env preproduction`）跑预发场景。

### Step 2：按顺序执行（调度 OpenCode）

> 🔄 **调度 OpenCode** 运行 E2E 场景。OpenCode 负责执行，bot 负责 poll 收集日志和截图。
> 本地场景：`cd packages/frontend-multiplayer && node e2e-runner.cjs scenarios/auto/<name>.json`

#### 🔴 截图分析（按需判断，需要才做）

> **每次 e2e 跑完后，brief 必须写明是否做截图分析及理由**（2026-08-01 兄弟定稿）：截图是验证目标（模型/页面真实渲染、视觉效果）→ brief 让 OpenCode 用 `gts-screenshot-analyze` 分析（ImageMagick 降质 + Kimi K2.7 多模态）；截图非验证目标或场景无截图 block → brief 写「无需截图分析」+ 理由，不强制
> OpenCode 跑完 e2e 后，读取 .opencode/skills/gts-screenshot-analyze/SKILL.md（OpenCode 侧 skill），按流程用 ImageMagick 降质 + Kimi K2.7 多模态分析生成的截图，确认页面/模型真实渲染（不只文本断言）。
> 判断标准：场景断言已覆盖验证目标 → 无需分析；只有文本断言不够、需要看图验证渲染/效果 → 分析。
> 预发场景：`cd packages/frontend-multiplayer && node e2e-runner.cjs scenarios/auto/<name>.json --env preproduction`

- 有多个场景时，按顺序逐个调度 OpenCode 运行
- 全部场景完成后进入 Step 3

#### 🔴 Post-poll 绑定：每轮 OpenCode poll 完成后自动 step-done

每轮单个场景的 OpenCode poll 确认完成后（exit 0 + DB completed），**立即**更新 issue 进度：

```powershell
$sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
node scripts/skill-exec-manager.cjs step-done $sid --step-index 2 --step-name "按顺序执行 E2E（调度 OpenCode）"
```

> 🔴 全部场景跑完后，调一次 step-done 即可。多个场景共用 Step 2 的 step-done。

### Step 3：更新操作文档

每次 E2E 自动测试结束后（无论全部通过还是部分失败），必须：
1. 查阅 `test/e2e/E2E-OPERATIONS.md`
2. 检查本次运行中是否有新的操作模式需要记录
3. 新的原子操作 → 新建积木 `.cjs` + 更新文档
4. 新的组合模式 → 更新文档的「常见操作组合」
5. 积木有 bug → 修复积木 + 更新文档

### Step 4：结果汇总

全部完成后汇总通过/失败结果。

#### 结果格式

```
=== E2E 自动测试结果 ===

[PASS/FAIL] ① create-room-join-game.json — 创建/加入/开始游戏（本地）
[PASS/FAIL] ⑦ scf-keepalive-verify.json — 保活验证（预发）
...

前端日志：已检查 ✅ / ❌ 发现 N 个错误
服务端日志：已检查 ✅ / ❌ 发现 N 个错误
截图分析：已保存，可供查看

总结果：PASS / FAIL
```

> 📊 **状态追踪：** Step 4 完成 → STEP_DONE + CLEANUP
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index 3 --step-name "更新操作文档 + 结果汇总"
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

## 执行纪律

1. **先选场景，再决策环境** — 本地用 `--env local`，预发用 `--env preproduction`
2. **「日志」默认包含：前端（console.error/pageerror）+ 服务端（room_preproduction/match_preproduction）**
3. Scenarios 在 `packages/frontend-multiplayer/test/e2e/scenarios/auto/` 目录查找（JSON 文件）
4. 测试过程不阻塞等兄弟
5. 跑完后双通道通知（桌面 `msg *` + 飞书或 clickclack）

## 🔴 环境通过运行参数指定

> 详细规则见 `packages/frontend-multiplayer/test/e2e/E2E-OPERATIONS.md` → **🔴 环境配置规则**。

- 环境通过 `--env` 参数指定（`local` | `scf` | `preproduction`），**禁止**硬编码到积木或 scenario JSON
- 积木通过 `ctx.env` / `ctx.resolveUrl()` / `helpers.getMatchApiUrl()` 获取环境相关配置
- 新增环境时只在 `e2e-helpers.cjs` 的 `getPageUrl` / `resolveUrl` / `getMatchApiUrl` 中添加映射
- 违反后果：同一个场景要维护多份 JSON，维护爆炸
