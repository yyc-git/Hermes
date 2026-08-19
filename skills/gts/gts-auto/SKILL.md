---
name: "gts-auto"
description: "全自动模式：触发词「全自动」「自动」。跳过所有确认步骤，全流程自动化跑完再通知兄弟。"
---

# gts-auto — 全自动模式 Skill

> 触发词：兄弟说「全自动」「自动」时激活（如「全自动部署」「自动保存」「全自动工作流」）
> 效果：当前 skill 所有确认步骤跳过 + 自动决策 + poll 降频策略（非拉长单次 timeout）+ 完成后通知兄弟

## 🔴 激活条件

兄弟说包含「全自动」或「自动」的指令。例如：
- 「全自动部署 room」
- 「自动保存」
- 「全自动跑 workflow」

## 🔴 退出条件

全自动模式在 dispatch 后，如果兄弟与 bot 发生了 **2 轮及以上自然对话交互（非进程 poll 反馈 / 系统消息）**，
视为自动退出全自动模式，后续步骤恢复标准流程（包括 M 阶段子 fix 确认）。

**检测方式：**
1. 上一条消息是兄弟发的（不是 poll 返回或系统事件）
2. 最近 3 条兄弟消息中至少有 2 条不是「OK」「继续」「部署」等简短确认
3. 满足以上 → 退出 auto，恢复 M 阶段

## 模式变更清单

激活全自动模式后，以下规则覆盖其他 skill 中的确认/等待步骤。

### poll 监控策略（2026-08-17 兄弟拍板：主监控 = wait 脚本，poll 降级辅助）

🔴🔴🔴 **主监控 = `wait-opencode-session.mjs`（exec background 独立进程，直读 DB），poll 降级辅助**：
- 🔴🔴🔴 **dispatch 后必须立即启动 wait 脚本盯进展（兄弟连续质问后定铁律）**：dispatch → 拿 sessionId → `exec(background=true, timeout=0)` 跑 `node scripts/wait-opencode-session.mjs <sid> <maxWaitSec> <idleTimeoutSec> --exit-on-stuck --title "<任务名>"` → turn 结束等 wake。兄弟问「怎么样了」时 `process(action=log)` 读脚本 stdout（每 120s 一行状态，不烧 LLM）。禁止 dispatch 后转去做其它分析忘了启动监控
- **等待期间 LLM 完全空闲**：脚本退出（0=完成/2=超时/3=stuck）才 wake bot 一次性决策。兄弟消息随时处理，与监控互不干扰（替代 8/15 的 poll 直连：每轮 poll = 1 次 LLM 调用 + 全量前缀 cacheRead → bot 侧 1.6 亿 token/天根因）
- **poll 用法（仅辅助）**：需要实时看 agent 输出/发现异常时 `process(action=poll, sessionId=<dispatch的exec sessionId>, timeout=30000)`，单次 timeout ≤30000（工具 clamp 上限），挂起即弃改 DB 查询。CLI exit 0 ≠ agent 停止
- 🔴 **poll/exec 报错 ≠ OpenCode 断开**：OpenCode 是 server 端独立进程，exec/poll 只是看日志的窗口。窗口报错/CLI 退出/exec 会话消失都不影响 server agent 运行；用 DB `time_updated` + part 表判断真实状态
- **exit 3（stuck）处理**：查 DB `time_updated` —— 在涨（生成阶段正常静默）→ 重启 wait（idleTimeoutSec 调大）；停了 → 发「继续」：`opencode run -s <sessionId> -m <原模型> --attach http://localhost:4098 --dir <项目> --no-replay "继续"`（模型必须与原 dispatch 一致）；Pro/max 报告阶段静默至少等 80 分钟
- 🔴 **禁止「exec sleep + poll」组合**（2026-08-14 实锤：poll Start-Sleep 的 exec session 照样挂）；等待用 wait 脚本，辅助查询用 DB
- wait-opencode-session.mjs `--check` 模式：一次性秒查（active/done/stuck/gone），辅助用

### 2. 跳过所有确认

| 场景 | 全自动行为 |
|------|-----------|
| 代码审核通过 → 是否合并 | 自动合并 |
| Delta Specs 确认 | 自动覆盖旧 Specs |
| 部署确认 | 自动部署（不询问环境） |
| E2E 测试选场景 | 自动选第一个 / 最相关场景 |
| 手动测试 M 阶段 | **M 移到最后执行**（C 完成后先 R→S→通知兄弟自动步骤完成，再进 M；M 完成后再 R→S→通知） |
| 保存确认 | 自动保存 |
| 提交确认 | 自动提交（不推送） |
| 编译失败后是否继续 | 自动进修复流程 |
| 测试失败后是否继续 | 自动进修复流程 |
| 修改依赖（node_modules/） | ⛔ 停，问兄弟确认再继续。确认后必须用 `yarn bootstrap` 装 |
| 规格同步（2026-08-05 新增） | **自动执行**：按 gts-acceptance「规格同步检查」规则，实现完成后自动对比 Delta Specs 与代码行为，不一致自动回写 spec（注明「实现补充」）/更新 expected-state；无 Delta Specs 则记录「无 specs 需同步」 |

### 3. 自动修复规则

> **🔴 任何调度 OpenCode 后，必须持续监控（wait 脚本 + process list），不能跳过或只等 completion event。**
> 监控规则（wait 脚本、process list、DB time_updated 检查、退出判断）完整见 `skills/opencode-schedule/SKILL.md` → 4️⃣ 监控步骤。

#### 3.1 适用类型

以下失败类型全自动模式下**自动修复**，修完继续跑：
- 编译错误（tsc / rescript build 报错）
- 测试失败（jest / BDD 挂掉）
- 代码审核 🟡 黄灯（警告级问题）
- 编码风格/lint 问题
- 小范围逻辑错误
- E2E 测试失败（自动定位 root cause 并修复）

#### 3.2 模型分级（按修复次数递增）

| 尝试次数 | 模型 | 策略 |
|---------|------|------|
| 第 1 次 | Flash | 常规修复，快 |
| 第 2 次 | Flash | 带完整失败日志做上下文 |
| 第 3 次 | Pro | 认真分析，方向不对换策略 |
| 第 4 次 | Pro + max | 最后一次，拼尽全力 |

每次尝试：带失败日志重写 .opencode-brief.md → 按 `skills/opencode-schedule/SKILL.md` 标准方式调度（`$brief` 变量传参，禁止 pipe）→ poll

#### 3.3 自验证链（每步强制）

修复后必须自验证，不是"没报错就过"：

**编译修复后：**
1. 验证 `tsc --noEmit`（或 rescript build）exitCode === 0 && 无 error 行
2. 有 error → 不通过，走下一轮重试

**测试修复后：**
1. 验证 "Tests: XX passed, 0 failed" — 跑得通
2. 按验收标准逐条检查（引用验收 SKILL.md Step B.3 标准）：
   - 真实路径 ✅ — 调用实际代码，不用 mock
   - 覆盖核心 ✅ — 覆盖 bug 根因路径
   - 边界覆盖 ✅ — 含正常路径 + 至少一个边界
   - 可验证 ✅ — 有明确断言
3. 不满足 → 调度 OpenCode Flash 修测试 → 重跑重验证

**E2E修复后：**
1. 验证行为断言全部通过（不只是 pass count）
2. 按验收标准逐条检查（引用验收 SKILL.md Step D.0 标准）：
   - 行为验证 ✅ — 断言核心行为正确
   - 用户可见 ✅ — 验证用户能感知的结果
   - 可复现 ✅ — 步骤清晰、超时明确
   - 截图消费 ✅ — 有截图供人眼验证
   - 环境一致 ✅ — 与真实使用对标
   - 符合 Specs ✅ — 匹配模块行为契约
3. 不满足 → 调度 OpenCode Flash 修 E2E 脚本 → 重跑重验证

**部署预发后：**
验证服务可访问（curl 返回 200）

自验证不通过 → 继续走下一轮重试计数（最多 4 次）。

### 4. 停止条件与升级路径

#### 🟢 常规（第 1-2 次修复成功）
自动继续跑下一步，不通知兄弟。

#### 🟡 升级（修了 2 次没过）
升级到 Pro 模型继续修，不通知兄弟。

#### 🔴 停止（以下条件触达）
必须停，先调度 **OpenCode Pro（build 模式，只分析不写代码）** 做独立根因分析：
1. 收集失败日志 + 已尝试修复的变更历史
2. Pro 分析根因 + 建议修复策略
3. 把分析报告附在通知里一起发给兄弟

**触发条件：**
| 条件 | 量化标准 |
|------|---------|
| 修复涉及文件过多 | >10 个文件 或 跨 package API 签名变更 |
| 新增/删除文件过多 | >6 个文件 |
| 自动修复 4 次未通过 | 根因分析后停 |
| 测试大面积崩溃 | 失败率 >80% 或 核心测试套件全挂 |
| 从零重构 | 新增代码行 > 改动代码行 × 3 |
| 同一文件连改 3 次仍失败 | 方向错了，换策略 |
| 不可逆操作 | 数据库变更 / 数据迁移 |

#### ⚫ 红线（必须立即停）
- 数据库结构变更 / 数据迁移（不可逆操作）
- 涉及用户数据丢失或破坏

立刻停，`msg *` 通知兄弟 + 风险说明，不调用 Pro 分析（省时间）。

### 5. 停止通知格式

```
msg * "兄弟，全自动卡住了：🛑 [步骤名]
原因：[触发条件]
分析：[Pro 根因分析摘要 2-3 行]
建议：[推荐处理方向]"
```

红线停：
```
msg * "兄弟，全自动被红线拦截：🚫 [步骤名]
原因：[正式部署 / 数据库变更]
操作：没动任何东西，等你决定"
```

### 6. 完成通知

全流程结束后统一通知中附消耗汇报（如果当前流程有对应的 issue，通知时确认 `笔记/项目文档/issue/*.md` 的 front matter status 为 `completed`）：

```
msg * "兄弟，[skill 名称] 全自动完成！
✅ [状态：通过 / 失败于步骤X]
📊 消耗：Flash × N 轮 | Pro × N 轮 | 总重试 N 次"
```

### 6.5 反思自动落地（全自动模式专属，2026-08-18 兄弟拍板）

> 全流程结束、issue 标记 completed 之后、发出完成通知之前，**必须把 Phase R 反思报告里的可执行教训落到对应 skill**。这是全自动模式的标准关闭动作。

**规则：**
1. **反思报告里"该 patch 到 skill X"的条目** → 直接 patch skill 文件（用 `patch` 工具）：
   - 加进对应 skill 的 pitfall / 纪律段
   - 同一类条目（多 session 重复触发的）合并成一条 pitfall
2. **新创建的 skill 段标题必须带日期 + 教训触发场景**（如 `### 🔴 工作区状态预检(2026-08-18 XiaHui Phase D 教训)`），方便未来追溯
3. **patch 完用 `skill_view` 验证 skill 内容完整**，不引入 lint 错误
4. **patch 完顺手用 `process(action='list'` 或 `ls -la .hermes-home/skills/gts/<skill>/` 确认文件落地
5. **patch 结果汇报给兄弟**：「Phase R 反思已落地：patch 了 X 个 skill（Y 条 pitfall）」
6. **patch 期间遇到 skill 文件被锁（curator 拒绝背景 patch）** → 走会话内 manual patch 路径（先 `skill_view` 加载再写）

**示例**（2026-08-18 XiaHui fix 流程落地）：
- Phase R 反思报告写到 `笔记/daily/2026-08-18-phaseR-reflection.md`
- 自动 patch：
  - `opencode-schedule/SKILL.md` 加 `Step 0.6 — 工作区状态预检 + brief 强制项` 章节（防 Phase D 第一轮 wt1 状态误判重演）
  - 其它 skill 按报告条目逐个 patch
- 落地后 Phase R 报告 mark "✅ 已落地"

**非全自动模式行为：**
- 不自动 patch 任何 skill
- Phase R 报告写到 daily 后，**在给兄弟的总结消息里主动询问**："反思里有 X 条待落地补丁，是否 patch 到对应 skill？"
- 等兄弟拍板再 patch

**记忆点（必落 MEMORY）：** 全自动模式 ≠ 瞎自动。Phase R 反思的落地是质量保障最后一步，不是装饰。跳过它 = 流程质量损失，下次同类问题会重演。

## 🔴 自动完成 Issue 步骤

> 如果当前流程有对应的 issue（`笔记/项目文档/issue/<date>-<skill>-<hash8>.md`），
> 则全自动模式下 **自动推进所有剩余步骤直到 issue 状态变为 completed**。
> 这是全自动模式的最高循环逻辑，覆盖自动修复（§3）。

### 7.1 Issue 检测触发

每次进入全自动模式时，**必须先检查**是否有当前 session 对应的 issue：

```
1. 读取 .skill-exec-sessions.json（session registry）
2. 按当前 sessionId 查找 active 条目
3. 找到 → 读取对应的 issue 文件（front matter + 步骤进度表）
4. 没找到 → 正常工作流，不触发 issue 自动完成逻辑
```

### 7.2 自动步进循环

找到 issue 后，全自动模式切换为 **步进循环**：

```
loop:
  1. 读取 issue 文件，检查 status
     - status = "completed" → break（全部完成）
     - status = "aborted" → break（异常终止，通知兄弟）
     - status = "in_progress" → 继续

  2. 计算 nextStep = completedCount + 1（从 stepSequence[completedCount] 取步骤名）
     - 如果 completedCount >= totalSteps → 标记异常，通知兄弟
     - 否则 → 执行 nextStep

  3. 执行 nextStep（根据步骤名调用对应逻辑）：
     - 调度 OpenCode（如需要）→ 持续监控（§3 自动修复规则）
     - 编译检查
     - BDD/单元测试
     - E2E 测试
     - 代码审核

  4. 步骤完成后：
     - 更新 issue（status 不变，completedCount += 1，追加进度日志）
     - 更新 registry（lastUpdatedAt 刷新）
     - 回 loop 开头
```

### 7.3 自动修复的衔接

步进循环中任何步骤的自动修复（§3）完成后，自动回到 **loop 开头重新读取 issue**：

- 修复成功 → issue 的 completedCount 不变（修复不算完成步骤），继续执行当前步骤
- 修复后验证通过 → 标记当前步骤完成（issue.completedCount += 1），进下一步
- 修复 4 次失败 → 按 §4 🔴 停止条件触发根因分析 + 通知兄弟

### 7.4 Issue 完成边界

| 条件 | 行为 |
|------|------|
| `issue.status === "completed"` | ✅ 正常结束 × 发送 §6 完成通知 |
| `issue.status === "aborted"` | ❌ 异常结束 × 发送 §5 停止通知（附 abortReason） |
| 步进循环中 >5 分钟无进度（completedCount 未变化） | ⚠️ 检查 wait 脚本/DB 状态 → 如果 OpenCode 在跑则继续等 → 否则按 §4 🔴 停止触发通知 |
| 所有 remainingSteps 执行完毕但 issue 非 completed | ⚠️ 异常：调 OpenCode Pro 分析原因 → 通知兄弟 |
| **卡在 merge / dispatch / 等兄弟介入**（如 dev 工作区冲突、OpenCode server 死、session 真挂需要兄弟手动操作） | 🔴🔴🔴 **立即用 `notify.ps1` 桌面通知兄弟**(2026-08-18 XiaHui fix 教训:Phase S 卡在 merge 时未通知,兄弟没看到卡点,绕了一圈才推进) → 通知内容含:卡在哪个步骤、阻塞原因、需要的介入动作 |

### 7.4.1 🔴🔴 对外断言前必须实测(2026-08-18 XiaHui C-r2 教训)

> **Phase C-r2 报告**把"snapshot 10 失败 = PR 造成"和"`裤` 单字抢占 bug 存在"写进 Blocking 段,但 **未实测**(基线 git stash 后跑 jest 显示 snapshot 是 pre-existing,`裤` 单字在当前代码根本不存在)。Phase Fix 用实测推翻两条,浪费一轮。
>
> brief 必须强制:
> 1. 任何**对外断言**(尤其 Blocking 项)必须附 **实测命令 + 输出**(基线对比、`grep <pattern>`、实际代码行号)
> 2. 判定"某失败由本 PR 造成" → 必须 `git stash` + 跑 baseline + 对比
> 3. 判定"某 bug 存在" → 必须 grep 当前源码 + 给出具体行号
> 4. 报告单列"已实测"与"仅代码推断"两栏,区分可信度
> 5. agent 没实测就断言 = 整篇审核报告可信度评级 = 低

### 7.5 步进与修改依赖的关系

如果某步骤遇到修改依赖（`node_modules/`），按 §2 安全规则 — **必须停，问兄弟**。全自动模式此处不跳过：
- 通知兄弟 `msg *` 说明哪一步需要装依赖
- 等待兄弟确认
- 确认后 `yarn bootstrap` 装完继续
- 兄弟不确认 → 卡住（按 7.4 超时规则处理）

## 覆盖范围

该 skill 不是独立 skill，而是 **模式修饰器**，修改以下 skill 的确认行为：

- `gts-dev-workflow` — 跳过代码审核确认 / Specs 确认 / **M 阶段**
- `gts-dev-feat` — 自动模式：C 后先 R→S→通知（告知兄弟自动步骤完成），再进 M，M 后再 R→S→通知（标准模式不变）
- `gts-dev-fix` — 自动模式：C 后先 R→S→通知（告知兄弟自动步骤完成），再进 M，M 后再 R→S→通知（标准模式不变）
- `gts-dev-refactor` — 自动模式：C 后先 R→S→通知（告知兄弟自动步骤完成），再进 M，M 后再 R→S→通知（标准模式不变）
- `gts-deploy` — 跳过部署环境确认，自动部署
- `gts-e2e-test` / `gts-e2e-auto` — 跳过场景选择
- `gts-save-flow` / `gts-submit-save` — 跳过保存/提交确认
- `gts-git-commit` — 跳过确认
- `gts-code-review` — 审核完直接出结果，不询问

## 安全边界

- **修改依赖必须先确认**：任何涉及 `node_modules/` 的改动（新增/更新/删除包），必须停下来用 `msg *` 通知兄弟，等确认再继续
- **装依赖必须用 `yarn bootstrap`**：禁止使用 `npm install`。GTS-Play 项目是 Lerna monorepo，必须用 `yarn bootstrap` 来链接包
- **`yarn bootstrap` 失败 → 停**：跑完后检查 exit code / 报错，失败就 `msg *` 汇报，不自动重试修复
- **模型分级 4 次递增，最后一次用 Pro+max**
- **自验证链强制**：每步修复后检查质量标准和工具输出
- **4 次修复失败 → 独立根因分析后通知**
- **红线条件必须立即停**
- 全自动不是「瞎自动」，方向不对就停

## 执行顺序

1. 检测到全自动触发词
2. 设置全自动模式标志（跳过确认 + wait 脚本监控：wait-opencode-session.mjs 直读 DB，process list 查看）
3. **Issue 检测**：检查当前 session 是否有对应的 issue
   - 有 → 进入步进循环（§7.2），自动推进剩余步骤
   - 没有 → 按原 skill 流程执行
4. 按原 skill 流程执行（或步进循环中的当前步骤），所有暂停点自动继续
5. 失败 → 自动修复（模型分级 + 自验证链）
6. 4 次失败 / 量化条件触达 → 独立根因分析 → 通知
7. 全部完成后（issue status === completed 或无 issue 时原 skill 全部步骤完成）统一通知 + 消耗汇报

## 使用示例

```
兄弟: 全自动部署 room1
→ 自动部署到预发，不确认，完了通知

兄弟: 自动保存
→ 自动 git commit + 记忆保存，不询问

兄弟: 全自动 workflow feat:添加房间开关按钮
→ 自动 OpenCode → 编译 → 审核 → 测试 → 部署预发 → **反思 → 保存 → 通知**（自动步骤完成）→ **进入 M 阶段（手动测试）** → **反思 → 保存 → 通知**（最终完成）
  编译失败？Flash 修 → 自验证（exitCode+无error）→ 继续
  再失败？Flash 再修 → 自验证 → 继续
  还失败？Pro 修 → 自验证 → 继续
  第4次 Pro+max → 还不行？Pro 根因分析 → 通知兄弟
  测试修好了？按 Step B.3 标准验质量 → 没问题才继续
  E2E 绿了？按 Step D.0 标准验质量 → 没问题才继续
  E2E 挂了？自动修 → 修完还要过质量检查
  自动步骤全部完成 → 反思 → 保存 → 通知兄弟（自动步骤完成，准备手动测试）→ 进入 M 阶段 → 测试通过后 → 反思 → 保存 → 通知（最终完成）
```
