---
name: "gts-skill-reflect"
description: "技能自我反思：顶层 skill 完成后生成改进建议，等确认后走 skill_workshop。接入 gts-dev-workflow 顶层触发。"
---

# gts-skill-reflect — 技能自我反思

> 由**顶层 skill**（兄弟直接触发的 skill）在 CLEANUP 之后、**gts-submit-save（保存）之前**调用。
> 🔴 **保存是工作流最后一步**：反思必须在保存之前完成，确保反思产出的 skill 更新/修复/报告能一起被提交，不会分两批。
> 设计依据：`笔记/项目文档/changes/2026-07-31-skill-self-reflection/solution.md`
> 核心原则：**只提建议，不自动改 skill**。所有修改必须等兄弟确认。

---

## 🔴 核心原则

1. **只建议，不执行** — 反思产出建议，等兄弟确认后才走 skill_workshop
2. **数据驱动** — 基于 issue pitfalls（执行中实时记录）+ 记忆/笔记检索 + 对话补充，不凭感觉
3. **快速路径** — 无异常时不打扰兄弟，自动进通知
4. **不阻塞** — 反思失败不影响通知发送；兄弟可随时跳过

## 触发方式

### 接入的 skill（13 个）

由以下 skill 在最后步骤之后（CLEANUP 之后、**gts-submit-save 保存之前**）调用：

| skill | 步骤序列 | 反思时机 |
|-------|---------|---------|
| gts-dev-feat | 0 → B → C1 → C2 → M → C3(部署) → 🔮 → S(保存) → 通知 | CLEANUP 后、保存前 |
| gts-dev-fix | P0 → B1 → B2 → C(验收+部署) → M → 🔮 → S(保存) → 通知 | CLEANUP 后、保存前 |
| gts-dev-refactor | 0 → B → C(验收+部署) → M → 🔮 → S(保存) → 通知 | CLEANUP 后、保存前 |
| gts-code-review | 0 → 1 → 2 → 3 → 🔮 → .last-review → S(保存) → 通知 | 修复后、保存前 |
| gts-acceptance | 1 → 2 → 3 → 4 → 5 → 🔮 → S(保存) → 通知（仅独立触发） | Step 5 后、保存前 |
| gts-e2e-test | 0 → 1 → 2 → 3 → 4 → 5 → 🔮 → 通知（仅独立触发，无保存步骤） | Step 5 后 |
| gts-regression | 0 → 1 → 2 → 3 → 4 → 🔮 → 通知（仅独立触发，保存由上层调用） | Step 4 后 |
| gts-e2e-regression | 0 → 1 → 2 → 3 → 4 → 5 → 🔮 → 6(保存) → 通知（仅独立触发） | Step 5 后、保存前 |
| gts-integration-regression | 0 → 1 → 2 → 3 → 4 → 🔮 → 5(保存) → 通知（仅独立触发） | Step 4 后、保存前 |
| gts-e2e-auto | 0 → 1 → 2 → 3 → 🔮 → 通知（仅独立触发，无保存步骤） | Step 4 后 |
| gts-e2e-perf | 1 → 2 → 3 → 🔮 → 通知（始终独立触发，无保存步骤） | Step 5 后 |
| gts-health-check | 1 → 2 → 3 → 4 → 🔮 → 通知（仅独立触发，无保存步骤） | Step 4 后 |
| gts-dev-workflow | A → B → C → D → E → F → G → 🔮 → S(保存) → 通知（仅顶层直接触发时） | CLEANUP 后、保存前 |

> gts-dev-workflow 特殊说明：虽然它名义上是「工作流编排 skill」，但兄弟直接用它跟踪实际开发任务（如 issue 机制改进）时，它就是**顶层 skill，必须反思**。只有当它内部委托给 feat/fix/refactor 等子 skill 且自身仅做编排时，才由实际执行任务的子 skill 反思。
>
> 不接入：gts-save-flow（纯机械保存）、gts-auto（模式切换）

### 🔴 嵌套调用规则（最重要）

**只在顶层反思一次，子 skill 不反思，但坑照记。**

| 场景 | 反思 | pitfalls 记录 |
|------|------|--------------|
| **顶层 skill**（兄弟直接触发） | ✅ 执行反思 | 记到自己的 issue |
| **子 skill**（嵌套调用，state.skillName ≠ 自己） | ❌ 跳过反思 | 用**调用方 sessionId** 执行 `append-pitfall`，记到顶层 issue |

嵌套判断方式：执行 CLEANUP 前读取 `.skill-exec-state.<sessionId>.json`，如果 `skillName` 不是自己 → 嵌套调用。

> 例：兄弟触发 gts-dev-fix → fix 反思一次；期间调用的 acceptance/e2e-test/regression 都不反思，坑记到 fix 的 issue。

---

## 流程

### Step 0（🔴 反思数据前置收集 — 2026-07-31 反思补做教训新增）

**CLEANUP 之前**，先完成 pitfalls 写入：

1. 执行完最后一步后，**在 CLEANUP 前**回顾本次执行，把遇到的坑用 `append-pitfall` 全部写入 issue（此时 issue 还 open，可写）
2. 如果 CLEANUP 已完成才发现坑（issue 已 closed）：
   - `append-pitfall` 会返回 `issue not created, skipped`（无法写入）
   - 此时把坑记录到 daily log + 对话中，反思报告用「对话补充」路径携带
3. 反思报告本身在 CLEANUP 之后、**保存（gts-submit-save）之前**生成（pitfalls 从 issue 文件读取，已关闭也能读）

> 教训来源：2026-07-31 issue 机制改进任务 —— 反思在 CLEANUP 后补做时，pitfalls 无法 append 到已关闭 issue，只能靠对话补充。

### Step 1：收集数据

**1a. 读取 issue pitfalls**

读取本次工作流的 issue 文件（`笔记/项目文档/issue/<date>-<skill>-<hash>.md`）的 YAML front matter 中的 `pitfalls` 字段：

```yaml
pitfalls:
  - type: "dispatch_failed"
    timestamp: "2026-07-31T14:30:00+08:00"
    step: "B"
    reason: "OpenCode process killed by SIGKILL"
    retries: 2
```

> 如果 issue 已关闭（CLEANUP 完成），pitfalls 仍可从文件读取（反思在 CLEANUP 之后、通知之前执行）。

**1b. 统计执行指标**

- dispatch 次数（从 issue 进度/对话推断）
- 重试次数（pitfalls 中 retries 字段求和）
- 总耗时（workflowId 时间跨度，或 issue createdAt → completedAt）

**1c. 搜索记忆/笔记**

用内置 `memory_search` 工具搜索本次工作流相关的历史教训（关键词：功能名/模块名），识别「重复出现的模式」。

**1d. 🔴 读取内置 Curator 数据（2026-08-01 新增）**

```powershell
openclaw skills curator --json status
```

提取三类数据：

| 数据 | 用途 |
|------|------|
| `useCount` / `lastUsedAtMs` | 识别低频 skill（本次工作流用到的 skill 的使用热度；库内 0 次/超低频的） |
| `overlaps[]` | 本次涉及 skill 是否有重复候选（score ≥ 0.66 高亮） |
| `state` / `pinned` | 全局生命周期概览（active/stale/archived 计数） |

> curator 命令不可用/报错时降级：跳过 1d，报告标注「curator 数据不可用」，不阻塞反思。

**1e. 🔴 检查 MEMORY.md 大小（健康检查 — 阈值改为最大值×80%，2026-08-18 兄弟拍板）**

```powershell
# Hermes 真实路径(非 OpenClaw 老路径):
$m = Get-Item "E:\Hermes Agent CN Desktop\data\hermes-home\memories\MEMORY.md"
"当前: $([math]::Round($m.Length/1KB,1)) KB / $($m.Length) bytes"
# memory_char_limit 见 hermes config(2026-08-17 调为 30000,chars 计数,memory 工具返回占用%)
```

- **占用 > memory_char_limit × 80%** → ⚠️ 超限：MEMORY.md 只应保留索引级信息，过大说明细节/过期条目堆积。反思报告必须携带「压缩精简」建议（🟢），并在保存前执行压缩
- **≤ memory_char_limit × 80%** → ✅ 健康，无需处理（2026-08-18 兄弟拍板：不再用固定 KB 数，改为「MEMORY.md 应小于最大值的 80%」，以 memory 工具/接口返回的占用 % 为准）

**1g. 🔴 检查 HEARTBEAT.md 大小（健康检查，2026-08-10 新增）**

```powershell
[math]::Round((Get-Item C:\Users\Administrator\.openclaw\workspace\HEARTBEAT.md).Length / 1KB, 1)
```

- **> 2 KB** → 🔴 超限：HEARTBEAT.md 只应保留最近状态指针（最后提交 + 待办），历史记录在 daily log + git history。过大说明历史条目堆积，反思报告必须携带「压缩精简」建议（🟡），并在保存前执行压缩
- **≤ 2 KB** → ✅ 健康，无需处理

**1f. 🔴 采集 OpenCode 反馈/教训（2026-08-01 新增）**

反思时从本次 dispatch 的 OpenCode 侧提取非 trivial 发现（API 缺失、新问题、踩坑、改进建议等）：

| 来源 | 提取内容 |
|------|---------|
| OpenCode 输出摘要（poll/log 最后 10 行） | 完成总结中的发现/建议/踩坑描述 |
| OpenCode 报告文件（`笔记/项目文档/changes/<日期>-<功能>/report*.md` / `reflection.md`） | 分析结论、踩坑记录、改进建议 |
| 对话中记录的 OpenCode 反馈 | 兄弟转述的 OpenCode 问题 |

> 无 OpenCode dispatch 的工作流（纯手动/纯分析）跳过 1f；数据不可得时标注「OpenCode 反馈不可用」，不阻塞反思。

> **压缩精简规则（超限时按此执行，保存前完成）：**
>
> **1️⃣ 保留最高优先级（🔴🔴🔴★ 条目一律不动）**
> - 所有带 ★ 的最高优先级规则（工作协议、纪律红线）**原样保留，一字不改**
> - 核心锚点词（44 个）全部保留
> - 索引表（分层读取入口）保留，只精简描述文字，不删条目
> - 拿不准的条目 → 保守保留，移走「确定过期」的，不赌
>
> **2️⃣ 索引化 — 细节移入 MEMORY-ARCHIVE.md**
> - 详细内容/完整规则/长段落 → 移到 `MEMORY-ARCHIVE.md`（完整保留，不丢内容）
> - MEMORY.md 对应位置只留一行索引：`| 主题 | 锚点词 | 查找位置 |`
> - 移入时在 ARCHIVE 中按主题归类，避免变成第二个垃圾桶
>
> **3️⃣ token 优化（压缩目标 ≤ memory_char_limit × 80%）**
> - 删除：已完成的临时结论、过期状态、重复条目、冗余示例
> - 合并：同类规则合并成一条（如多个日期教训 → 汇总+链接到 daily log）
> - 精简：描述文字缩短，保留关键词可检索即可
> - 压缩后复查：`Get-Item "E:\Hermes Agent CN Desktop\data\hermes-home\memories\MEMORY.md" | Select Length` 确认占用 ≤ memory_char_limit × 80% 达标
>
> 压缩是**维护项不是删数据**：所有移走内容在 ARCHIVE/daily logs 里可检索回，MEMORY.md 只留索引入口。

### Step 2：分析

1. **按 pitfall type 聚类** — 同类异常多次出现 = skill 有缺陷
2. **对比历史教训** — 记忆/笔记中是否有相同教训？说明 skill 没吸收
3. **MEMORY.md 健康检查** — Step 1e 结果占用 > memory_char_limit × 80% 时，生成 🟢「压缩精简 MEMORY.md」建议；≤ 80% 跳过
4. **OpenCode 教训分级**（Step 1f 数据）— 判断每条教训的去向：

| 教训类型 | 例子 | 去向 |
|---------|------|------|
| 通用规则（跨任务可复用） | jest-cucumber step 注册计数、tsc 基线 diff、编码伪像识别 | **AGENTS.md**（OpenCode 记忆，新会话自动加载） |
| skill 流程问题 | brief 模板缺规则、poll 步骤缺失 | 🔴 skill_workshop |
| 一次性结论/项目特定 | 某模块不可测、某接口缺失 | 笔记/daily log（不入 AGENTS.md） |

> 🔴 教训入 AGENTS.md 前必须兄弟确认：展示「教训内容 + 建议位置（AGENTS.md 哪一节）」，确认后写入 `D:/Github/GTS-Play/AGENTS.md`（按主题归入现有章节或新增小节，格式与现有一致），随 GTS-Play 提交生效。

5. **生成建议**（分级）：

| 级别 | 含义 | 示例 | 执行方式 |
|:---:|------|------|---------|
| 🔴 | 改进现有 skill | brief 模板缺规则提醒 → 补上 | skill_workshop update |
| 🟡 | 新建 skill | 某操作模式反复出现 → 抽象为独立 skill | skill_workshop create |
| 🟢 | 其他优化 | 调整 poll 超时、CLI 工具改进等 | 直接执行 |
| 🟣 | **Skill 策展**（生命周期管理，2026-08-01 新增） | 低频 skill 归档；overlap 合并；关键 skill pin 保护 | `openclaw skills curator pin/unpin/restore` + skill_workshop 合并 |

**🟣 策展建议触发条件**（数据驱动，以 `openclaw skills curator --json status` 为准）：

| 条件 | 建议 |
|------|------|
| `useCount == 0` 且创建 > 60 天 | 归档候选（restore 可回滚） |
| `lastUsedAtMs` > 90 天前 | 归档候选 |
| overlap score ≥ 0.66 | 合并候选（生成合并方案，确认后 skill_workshop 合并） |
| 关键 skill（dev/提交链） | pin 保护建议（防未来自动归档） |

> 🟣 策展**不自动执行**：内置 curator 只报告候选，合并/归档决策必须兄弟确认。

### Step 3：生成反思报告

使用下方模板输出报告。

### Step 4：等兄弟确认

| 兄弟回复 | 行为 |
|---------|------|
| 确认/OK/go | 进入 Step 5 |
| 调整建议 | 按兄弟意见修改建议后重新确认 |
| 跳过/不用 | 不执行，反思报告仍写入笔记 |

### Step 5：执行（走 skill_workshop）

按确认后的建议调用 `skill_workshop`：
- 🔴 改进现有 skill → `skill_workshop action=update skill_name=<skillName>`
- 🟡 新建 skill → `skill_workshop action=create name=<skillName>`
- 🟢 其他优化 → 直接执行（如改 CLI 配置）
- 🟣 Skill 策展 → `openclaw skills curator pin/unpin/restore <skill>`（归档/合并前先出方案，兄弟确认后执行）
- 🤖 OpenCode 教训入 AGENTS.md → 兄弟确认后，按主题编辑 `D:/Github/GTS-Play/AGENTS.md`（归入现有章节或新增小节），随 GTS-Play 提交

### Step 6：记录

将反思报告写入 `笔记/项目文档/changes/<日期>-<功能名>/reflection.md`（若无此目录则新建）。执行完成的建议在报告末尾追加执行结果。

> 🔴 **必须在保存（gts-submit-save）之前完成**：reflection.md 是本次工作流的产物，随保存一起提交入库，不遗留未提交文件。

---

## 反思报告模板

```markdown
## 🔮 技能反思 — {skillName} ({workflowId})

> Issue: {issuePath}
> 工作流耗时: X 分钟 | dispatch: N 次 | 重试: M 次

### 📊 执行统计

| 指标 | 数值 |
|------|------|
| 总步骤 | {totalSteps} |
| dispatch 次数 | {dispatchCount} |
| 重试/修复次数 | {retryCount} |
| 异常事件 | {pitfallCount} |

### 🐛 异常事件摘要

{无异常 → 「✅ 本次执行顺利，无异常事件。」}
{有异常 → 逐条列出：}
1. **[dispatch_failed]** Step B: OpenCode 进程被 SIGKILL → 重试 2 次后成功
2. **[brief_missing]** Step B: 漏写 test-standards.md Layer 3 目录规范 → 导致额外 1 次 dispatch

### 💡 改进建议

#### 🔴 改进现有 skill ({n})

- **{skillName}**: {改进内容}
  - 理由: {基于什么异常事件}
  - 影响范围: {涉及哪个步骤/规则}

#### 🟡 新建 skill ({n})

- **{skillName}**: {用途}
  - 理由: {基于什么重复模式}

#### 🟢 其他优化 ({n})

- {优化内容}

#### 🟣 Skill 策展 ({n})

- **{skillName}**: {归档/合并/pin 建议}
  - 依据: {curator 数据：useCount / lastUsedAt / overlap score}

### 🧰 Skill 使用统计（内置 curator 数据）

| Skill | 使用次数 | 最后使用 | 状态 |
|-------|:------:|---------|:----:|
| {skillName} | {useCount} | {lastUsedAt} | {state} |

> 只列 top 5（本次工作流相关 + 高频 + 低频），curator 数据不可用时标注「不可用」。

### 🧹 策展候选

- 🟣 {skillName}: {依据} → {建议}
- {无候选 → 「✅ 无策展候选（curator 数据正常）。」}

### 📥 记忆健康

- workspace/memory/ 存在未提交的 daily log: `{date}.md` → 🟢 建议随本次保存一并提交
- MEMORY.md: {size}（memory_char_limit 的 80% = {max×80%}）→ ✅ 健康 / ⚠️ 超限需压缩
- HEARTBEAT.md: {size} KB（阈值 2 KB）→ ✅ 健康 / 🔴 超限需压缩
- {无未提交 daily log → 「✅ 无未提交记忆文件。」}

### 📏 MEMORY.md 健康检查

| 指标 | 状态 |
|------|------|
| 占用 | {size}（memory_char_limit={max}，80% = {max×0.8}） |
| 结论 | ✅ 健康 / ⚠️ 超限 → 建议压缩精简 |

> ⚠️ 超限时（保存前执行，规则见 Step 1e）：① 🔴🔴🔴★ 最高优先级条目原样保留；② 细节索引化移入 `MEMORY-ARCHIVE.md`（按主题归类）；③ token 优化：删过期/合并同类/精简描述，压缩到占用 ≤ memory_char_limit × 80%，复查达标。

### 📋 历史相关性

{有相关历史教训 → 列出日期+摘要+相关性}
{无 → （无相关历史教训）}
```

### 🤖 OpenCode 反馈与教训（快速路径也有）

```markdown
### 🤖 OpenCode 反馈与教训

- **{sessionId/报告来源}**: {发现/踩坑/建议}
  - 去向: AGENTS.md「{章节}」/ skill_workshop / 笔记
- {无 → 「✅ 无 OpenCode 侧教训需沉淀。」}
```

> 🔴 去向为 AGENTS.md 的条目，必须先展示给兄弟确认，确认后才写入 `D:/Github/GTS-Play/AGENTS.md`。

## Audit 模式（全库技能体检 — 2026-08-01 新增）

> 兄弟说「技能体检 / 技能策展 / audit」时触发，不依赖工作流。

```
1. openclaw skills curator --json status
2. 生成全库策展报告（低频 / overlap / pin 候选 + 建议）
3. 等兄弟逐条确认
4. 执行（pin / restore / skill_workshop 合并 / 归档）
```

- 默认频率：每 2 周一次（可 cron 提醒），或兄弟手动触发
- 建议分级与报告模板复用上方模板（Skill 使用统计 / 策展候选区块为全库版）
- 红线不变：无确认不执行任何 curator 写操作

---

## 快速路径（无异常时）

无 pitfall 记录、dispatch 全一次成功：

```
🔮 技能反思 — 本次执行顺利，无改进建议。

Issue: {issuePath}
总耗时: X 分钟 | dispatch: N 次 | 异常: 0

✅ 无异常事件。
✅ 无需改进现有 skill。
✅ 无需新建 skill。
🤖 无 OpenCode 侧教训需沉淀。
📏 MEMORY.md: {size}（memory_char_limit 的 80%）→ ✅ 健康 / ⚠️ 超限需压缩
📟 HEARTBEAT.md: {size} KB（阈值 2 KB）→ ✅ 健康 / 🔴 超限需压缩

继续通知。
```

> 📏 即使本次执行无异常，MEMORY.md 超限也必须提示（压缩不是「异常」，是维护项）。超限时不能直接走「继续通知」，先按 🟢 建议压缩精简后再继续保存步骤。

**不等兄弟确认，自动继续到保存步骤（gts-submit-save）。**

---

## 边界情况

| 场景 | 处理 |
|------|------|
| 全自动模式（gts-auto） | 反思仍执行；有建议 → 仍展示报告等确认（涉及 skill 修改不能自动），兄弟不在线 → 写入笔记标记 pending-confirm + 通知提醒 |
| CHECK 恢复时已过 R 步骤 | 做最后通知，跳过反思（issue 已关闭、状态已固化） |
| 兄弟说「跳过反思」 | 跳过，直接进通知 |
| 兄弟说「以后再说」 | 反思报告写入笔记（草稿），进通知 |
| 反思报告写入失败 | 不影响通知，内容保留在对话中 |
| issue 文件无 pitfalls 字段 | 视为无异常，走快速路径 |
| CLEANUP 已完成才发现坑 | append-pitfall 会 skip（issue closed）；坑记入 daily log + 反思报告「对话补充」路径 |
| MEMORY.md 占用 > memory_char_limit × 80% | 反思报告携带 🟢 压缩建议，保存（gts-submit-save）前按 Step 1e 压缩规则执行：🔴★ 条目保留 + 细节索引化移入 MEMORY-ARCHIVE.md（按主题归类）+ token 优化，压到 ≤ memory_char_limit × 80%，复查达标 |
| HEARTBEAT.md > 2 KB | 反思报告携带 🟡 压缩建议，保存前压缩（保留最近状态指针，历史在 daily log + git）|
| curator 命令不可用/报错 | 跳过 1d，报告标注「curator 数据不可用」，反思不阻塞 |
| audit 模式 curator 无候选 | 报告标注「✅ 无策展候选」，结束体检 |
| 全自动模式 audit | 策展建议仍展示等确认（涉及 skill 操作不自动），兄弟不在线 → 写入笔记 pending-confirm + 通知 |
| OpenCode 反馈不可得（无 dispatch / 无报告） | 跳过 1f，报告标注「OpenCode 反馈不可用」，反思不阻塞 |
| OpenCode 教训已在 AGENTS.md 存在 | 标注「已沉淀」，不重复建议 |
| 教训属一次性结论（非通用规则） | 不入 AGENTS.md，写入笔记/daily log |
| 全自动模式下 OpenCode 教训 | 仍展示等确认（AGENTS.md 写入不自动），兄弟不在线 → 写入笔记 pending-confirm + 通知 |

## 命令速查

- 步骤推进：`node scripts/skill-exec-manager.cjs step-done <sessionId> --step-index <索引> --step-name "<步骤名>" [--files "<改动的文件>"]`（⚠️ 参数是 `--step-index`/`--step-name`，不是 `--step`；调用后核对返回的 completedCount 是否 +1。静默 ok 但不推进有两种情况：① 参数名错；② **参数名正确但连续调用只生效第一次**（2026-08-04 实测：4 连发 step-done 仅首次写入 state，返回 ok:true 但 completedCount 恒为 1，疑似 worker 内 state 缓存/casWrite 版本冲突）→ 未推进时用 `sync <stateFile> --completed-count N` 追补（例如 `sync .skill-exec-state.<sessionId>.json --completed-count 4 --log-entry "..."`），完成后核对 completedSteps/remainingSteps）
- 记忆检索：内置 `memory_search` 工具（不用 CLI，冷启动慢；2026-08-01 协议反转）
- MEMORY.md 大小检查：`Get-Item "E:\Hermes Agent CN Desktop\data\hermes-home\memories\MEMORY.md" | Select Length`，占用 > memory_char_limit × 80% 即超限（memory_char_limit 见 hermes config，2026-08-17 调为 30000）
- Curator 数据：`openclaw skills curator --json status`（注意 `--json` 放在 `curator` 后面，不是 status 后面）
- 建议写入：`node scripts/skill-exec-manager.cjs append-suggestion <sessionId> --type <type> --step <step> --target-skill <skill> --issue "desc" --action "desc"`
  - type 白名单：`skill_patch / skill_create / skill_merge / skill_archive / memory / other`
  - issue/action 各 ≤200 字
- skill 更新：`skill_workshop action=update skill_name=<skillName> proposal_content=<内容>`
- skill 新建：`skill_workshop action=create name=<skillName> description=<描述> proposal_content=<内容>`
- 反思报告：写入 `笔记/项目文档/changes/<日期>-<功能名>/reflection.md`
- OpenCode 教训入记忆：兄弟确认后编辑 `D:/Github/GTS-Play/AGENTS.md`（OpenCode 记忆，新会话自动加载）
