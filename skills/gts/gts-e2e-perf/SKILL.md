---
name: "gts-e2e-perf"
description: "兄弟说「e2e性能」「性能测试」时触发。双窗口+CDP Profiler录制，自动分析FPS/CPU热点+短通知。基于 blocks 积木系统。"
---

# E2E 性能测试（硬性操作规程）

> 触发词：兄弟说「e2e性能」/「性能测试」/「性能录制」。
> 两种模式：
> - **多人版**（`packages/frontend-multiplayer/`）：双窗口 + CDP Profiler 录制，用户操控，自动分析摘要 + 短通知。
> - **单机版**（`packages/frontend/`）：单窗口 + CDP Profiler 录制，用户操控，自动分析摘要 + 短通知。
> 基于积木系统：多人版 `e2e-runner.cjs scenarios/manual/perf-scene3.json`；单机版 `e2e-runner.cjs scenarios/manual/perf-manual.json`
> 🔴 **两种模式都由 bot 直接后台跑 runner**（不调度 OpenCode）——性能录制是纯 runner 执行，无代码编写需求。

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

本 skill 的执行状态追踪使用以下 **4 步序列**，对应工作流中的关键断点/恢复点：

```
步骤序列（4 步）：
  1: 启动性能录制（bot 直接后台跑 runner）
  2: 不阻塞等待（兄弟手动录制）
  3: 输出分析摘要 + 更新操作文档
  R: 技能反思（调用 gts-skill-reflect，CLEANUP 后执行，不阻塞 CHECK 恢复）
```

### INIT（skill 触发时第一时间执行）

```powershell
# 1. 获取/生成 session ID 和 workflow ID
$sid = node scripts/skill-exec-manager.cjs get-session-id | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
$wid = node scripts/skill-exec-manager.cjs get-workflow-id $sid | ConvertFrom-Json | Select-Object -ExpandProperty workflowId

# 2. 同任务预检（dispatch 前查 OpenCode DB 确认无「相同任务」活跃 session；不同任务直接并行，全局 dispatch 锁已废弃 2026-08-01）
# 3. stateInit + issueCreate + registryRegister
node scripts/skill-exec-manager.cjs init $sid $wid "gts-e2e-perf" `
  --steps 1,2,3,R `
  --summary "<性能测试目标>" `
  --criteria "<性能基准>" `
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
  "skillName": "gts-e2e-perf",
  "sessionId": "<自动获取或生成>",
  "workflowId": "wf_<timestamp>_<random8>",
  "totalSteps": 4,
  "stepSequence": ["1", "2", "3", "R"],
  "completedSteps": [],
  "remainingSteps": [
    {"index": "1", "name": "启动性能录制（bot 直接后台跑 runner）"},
    {"index": "2", "name": "不阻塞等待（兄弟手动录制）"},
    {"index": "3", "name": "输出分析摘要 + 更新操作文档"},
    {"index": "R", "name": "技能反思（调用 gts-skill-reflect）"}
  ],
  "completedCount": 0,
  "context": {
    "featureSummary": "<本次性能测试目标>",
    "verificationCriteria": "<性能基准>"
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
🤖 检测到未完成的工作流：gts-e2e-perf

   已完成（{n}/{total}）:
     ✅ 1: 启动性能录制（bot 直接后台跑 runner）

   剩余步骤（{m}/{total}）:
     📋 2: 不阻塞等待（兄弟手动录制）
     📋 3: 输出分析摘要 + 更新操作文档
     📋 R: 技能反思（调用 gts-skill-reflect）

   最后更新：{相对时间}

   🔜 即将执行下一步 Step 2
   （如需跳过、调整或放弃，请现在告知）
```

#### 长时间中断恢复模板

```
🤖 检测到 {duration} 前中断的工作流：gts-e2e-perf

   上下文：
     featureSummary: <之前记录的内容>
     verificationCriteria: <之前记录的内容>

   已完成（{n}/{total}）:
     ✅ 1: 启动性能录制（bot 直接后台跑 runner）

   剩余步骤（{m}/{total}）:
     📋 2: 不阻塞等待（兄弟手动录制）
     📋 3: 输出分析摘要 + 更新操作文档
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

---

## 前置：确定模式 + 查对应 E2E 操作手册

### 模式判定

| 线索 | 模式 |
|------|------|
| 兄弟提到「单机」「单机性能」「7093」 | 单机版 |
| 兄弟提到「多人」「联网」或未指定 | 多人版（默认） |

编写或修改性能测试 scenario 前，先查阅对应版本的操作手册：
- 多人版：`packages/frontend-multiplayer/test/e2e/E2E-OPERATIONS.md`
- 单机版：`packages/frontend/test/e2e/E2E-OPERATIONS.md`

找现成的操作积木（block），用积木组合出场景；性能测试的常规操作优先用积木，不手写 evaluate。

测试完成后，同步更新操作文档（见 Step 3）。

## 步骤

## 🔴 环境通过运行参数指定

> 详细规则见对应版本的 E2E-OPERATIONS.md → **🔴 环境配置规则**。

- **多人版**：环境通过 `--env` 参数指定（`local` | `scf` | `preproduction`），**禁止**硬编码到积木或 scenario JSON；积木通过 `ctx.env` / `ctx.resolveUrl()` / `helpers.getMatchApiUrl()` 获取环境相关配置；新增环境时只在 `e2e-helpers.cjs` 的映射函数中添加
- **单机版**：**只有 local 环境**，URL 固定 `http://localhost:7093`；`--env` 参数解析保留但无论传什么值一律回退 local（`e2e-helpers.cjs` 中 resolveUrl 统一回退）

### Step 1：启动性能录制 scenario

> 🤖 **两种模式都由 bot 直接后台跑 runner**（不调度 OpenCode）——性能录制是纯 runner 执行（手动场景，无代码编写需求），bot 负责启动 + poll 检查完成。2026-08-02 兄弟拍板：与 gts-e2e-test 单机分支一致，全部 bot 直跑。
> 🔴 **必须 poll**：启动后持续 poll 检查 scenario 是否退出，不能丢到后台不管。

**多人版**命令：
`node D:\Github\GTS-Play\packages\frontend-multiplayer\test\e2e\e2e-runner.cjs scenarios/manual/perf-scene3.json`

scenario 使用 `?user=t1`（创房窗口）、`?user=t2`（加入窗口）URL参数免登录。基于积木系统，流程包含：

1. `browser` — 启动双独立窗口
2. `login` x2 — P1/P2 分别登录
3. `waitText` / `click` — P1 创建房间、P2 加入房间
4. `click` — P2 准备、P1 开始游戏
5. `waitCanvas` x2 — 等待双方进入游戏
6. `injectPerfOverlay` — 每个窗口注入录制浮层（▶ 按钮 + FPS 显示）
7. `waitPerfRecord` — 等用户点「▶ 录制此窗口」
8. `startCdpProfiler` — 启动 CDP Profiler
9. `waitPerfStop` — 等用户点停止或 2 分钟超时（实时更新 FPS 浮层）
10. `stopCdpProfiler` — 停止 CDP，保存原始数据
11. `analyzePerf` — 分析 CPU Top / FPS / API 耗时

**单机版**命令（dev-server 7093 需先启动）：
```powershell
# 1. 确认 dev-server（未启动则后台启动）
netstat -ano | findstr ":7093" | findstr LISTENING
# 未启动：cd D:\Github\GTS-Play\packages\frontend; yarn webpack:dev-server（后台）

# 2. 跑场景（后台，必 poll）
cd D:\Github\GTS-Play\packages\frontend\test\e2e
node e2e-runner.cjs scenarios/manual/perf-manual.json --env local
```

单机版基于积木系统，流程包含（单窗口，players 0-based 默认 `[0]`，label `player1`）：

1. `browser` — 启动 1 个有头窗口到 `http://localhost:7093`（players: 1, headless: false, separate: true, channel: chrome, viewport 1280x800）
2. `sleep` — 等待游戏加载
3. `injectPerfOverlay` — 注入录制浮层（▶/⏹ 按钮 + FPS 显示），默认 players `[0]`
4. `waitPerfRecord` — 等兄弟点「▶ 录制此窗口」
5. `startCdpProfiler` — 启动 CDP Profiler
6. `waitPerfStop` — 等兄弟点停止或 2 分钟超时（实时更新 FPS 浮层）
7. `stopCdpProfiler` — 停止 CDP，完整 profile 原始数据落盘 `perf-data/`
8. `analyzePerf` — 分析 CPU Top / FPS（单机无多人 API 日志，API/GameState 段自动跳过）
9. `saveLogs` / `checkErrors` — 保存日志 + 检查报错

- 工作目录：多人版 `D:\Github\GTS-Play\packages\frontend-multiplayer\test\e2e`；单机版 `D:\Github\GTS-Play\packages\frontend\test\e2e`
- 以 background 模式运行
- 启动后告知兄弟：
  - 多人版：「✅ 性能录制已就绪，双窗口并排，点要录制的窗口上的「▶ 录制此窗口」，操作角色，点停止结束」
  - 单机版：「✅ 性能录制已就绪，窗口已打开 7093，点右上角「▶ 录制此窗口」，自由操作游戏，点「⏹ 停止录制」结束（或 2min 超时自动停止）」

### Step 2：等待录制完成

- **poll 等待**：持续 poll 检查 scenario 是否退出（标准 30s timeout），用户操作期间不报错
- 用户自己操控：点开始 → 操作角色 → 点停止

#### 🔴 Post-poll 绑定：录制 scenario poll 完成后自动 step-done

poll 确认 scenario 退出后（runner 退出），**立即**更新 issue 进度：

```powershell
$sid = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
node scripts/skill-exec-manager.cjs step-done $sid --step-index 1 --step-name "启动性能录制（bot 直接后台跑 runner）"
```

### Step 3：输出分析 + 短通知

scenario 退出后：

1. **保存性能数据** — CDP Profiler 原始数据 + FPS 记录存入 `test/e2e/perf-data/`（已 gitignore），分析块自动保存
2. **日志自动保存** — saveLogs block 在停止时自动保存
3. analyzePerf block 自动输出分析摘要：

```
=== 性能摘要 — player1 (20.9s) ===

-- FPS --
  平均: 58 | 最低: 11（t=5.5s）

-- 耗时 Top 函数（>1ms） --
  1. updateMatrixWorld  173ms (2.8%)
  ...

-- API 耗时 --（仅多人版有日志时显示；单机版无多人 API 日志自动跳过）

-- 优化建议 --
  🔴 最低 FPS 11，对应操作需检查
```

4. 短通知

#### 🔴 变更文档写入（Step 3 完成后）

如果本次性能测试是在某个功能变更流程中触发的（`笔记/项目文档/changes/` 下有对应目录），将性能摘要写入该变更的 `log.md`：

```
## 性能测试
- 时间：<日期>
- 模式：多人版（perf-scene3）/ 单机版（perf-manual）
- 运行方式：<对应版本的 e2e-runner 命令>
- FPS 平均/最低：58/11
- 耗时 Top：updateMatrixWorld(2.8%), fillRect(0.9%), (garbage collector)(0.8%)
- 建议：<主要优化建议>
```

### Step 4：更新操作文档

性能测试完成后，检查是否有新的操作或交互模式需要记录到对应版本的 `test/e2e/E2E-OPERATIONS.md`：
- 新的操作积木 → 新建 + 更新文档
- 新的组合模式 → 更新「常见操作组合」

> 📊 **状态追踪：** Step 4 完成 → STEP_DONE + CLEANUP
> ```powershell
> node scripts/skill-exec-manager.cjs step-done $sid --step-index 3 --step-name "输出分析摘要 + 更新操作文档"
> node scripts/skill-exec-manager.cjs cleanup $sid --result completed
> ```

### Step R：技能反思

本 skill 仅独立触发（兄弟说「性能测试」），始终执行反思：

```
走 skills/gts-skill-reflect/SKILL.md 流程（收集 pitfalls + 执行指标 + 记忆检索 → 分析 → 报告 → 等兄弟确认）
```

> 反思产出改进建议，**等兄弟确认后才执行**（skill_workshop），不自动改 skill。
> 反思不阻塞通知；反思完成后发短通知。

## 索引维护规则

> Scenarios 新增/移动/重命名后，**必须同步更新本 SKILL.md 的场景路径引用**。

## 执行纪律

1. 跑固定 scenarios：多人版 `scenarios/manual/perf-scene3.json`；单机版 `scenarios/manual/perf-manual.json`，不动态生成
2. 多人版 URL 使用 `?user=t1` / `?user=t2` 免登录；单机版无登录，URL 固定 localhost:7093
3. 单机版 players 索引 0-based（`injectPerfOverlay` 默认 `[0]`，label `player1`）；多人版 1-based（`[1,2]`）
4. 性能数据（CDP Profiler 原始数据 + FPS 记录）保存到对应版本的 `test/e2e/perf-data/`（已 gitignore），不删除
5. 完整日志保存到对应版本的 `test/e2e/__logs__/`（已 gitignore），不删除
6. **必须 poll**：持续 poll 检查 scenario 退出，不能丢到后台不管
7. **bot 直接后台跑 runner，不调度 OpenCode**（2026-08-02 兄弟拍板）
8. 分析结果在会话中给出，通知只发短提醒
9. 和 `gts-e2e-test`（手动双窗口）、`gts-e2e-auto`（自动验收）互不触发
10. **E2E 测试中发现错误、兄弟喊我修复/分析时** → 按 `skills/opencode-schedule/SKILL.md` 标准方式调度 OpenCode（`$brief` 变量传参，禁止 pipe），**brief 开头自动注入 `笔记/项目文档/project-context.md`**，把完整上下文（日志/截图/错误信息）传给 OpenCode。**我自己不分析日志、不自己写修复代码**。
