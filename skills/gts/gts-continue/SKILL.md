---
name: "gts-continue"
description: "继续/恢复工作流：检测进行中的issue，展示状态并恢复执行剩余步骤"
---

# gts-continue — 继续/恢复工作流

> 兄弟说「继续」「接着」「恢复」时触发此流程。
> 核心逻辑：
> 1. 有 active issue → 自动匹配当前会话的 issue，否则列出所有让兄弟选
> 2. 当前有 skill 流程中 → 自动匹配当前会话，否则列出所有让兄弟选
> 3. 都没有 → 检查近期工作或给出可推进的方向，让兄弟选择

---

## 🔴 前置规则

### 当前会话标识

判断「当前会话」的方法：

```powershell
cd D:/Github/GTS-Play
$currentSessionId = node scripts/skill-exec-manager.cjs get-session-id 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty sessionId
```

如果命令失败或无输出，则跳过会话匹配，直接列出所有。

### 入口检测（每次被触发时执行）

```
1. 获取当前 sessionId

2. 扫描 笔记/项目文档/issue/ 下 status: "in_progress" 的 issue
   ├─ 0 个 → 跳到第 3 步
   ├─ 1 个且 sessionId 匹配当前会话 → 自动选定，进 Step 2
   ├─ 1 个但 sessionId 不匹配/未知 → 列出让兄弟确认
   └─ 多个 → 列出所有让兄弟选

3. 检查当前对话上下文是否有未完成的 skill 流程
   ├─ 能确定当前在跑的 skill → 按 skillName 扫描关联 issue
   │   ├─ 找到 → 自动选定，进 Step 2
   │   └─ 没找到 → 提示兄弟
   └─ 不确定 → 跳到第 4 步

4. 没有未完成工作流 → 检查近期 git 活动 + 待办
   ├─ 有未提交改动 → 问「要提交吗？」
   ├─ 有可推进方向 → 列出给兄弟选
   └─ 啥都没有 → 「目前没有需要继续的工作」
```

### 会话匹配细化逻辑

```powershell
# 获取当前 sessionId
$currentSessionId = node scripts/skill-exec-manager.cjs get-session-id 2>$null
if ($currentSessionId) {
    $sid = ($currentSessionId | ConvertFrom-Json).sessionId
}

# 扫描所有 in_progress issue
$issues = Get-ChildItem "笔记/项目文档/issue/" -Filter "*.md" | ForEach-Object {
    $c = Get-Content $_ -Raw
    if ($c -match 'status: "in_progress"') {
        $issueSessionId = if ($c -match 'sessionId: "(\w+)"') { $Matches[1] } else { $null }
        [PSCustomObject]@{
            File = $_.Name
            SessionId = $issueSessionId
            IsCurrentSession = ($issueSessionId -and $sid -and $issueSessionId -eq $sid)
        }
    }
}

# 按匹配度排序
$matched = $issues | Where-Object { $_.IsCurrentSession }
$unmatched = $issues | Where-Object { -not $_.IsCurrentSession }

# 决策
if ($matched.Count -eq 1) {
    # 自动选中
} elseif ($matched.Count -gt 1) {
    # 异常：同一个 session 多个 active issue → 列出让兄弟选
} else {
    # 全部 unmatched → 列出让兄弟选
}
```

---

## Step 1：扫描进行中的 issue

```powershell
cd D:/Github/GTS-Play
$issues = Get-ChildItem "笔记/项目文档/issue/" -Filter "*.md" | ForEach-Object {
    $c = Get-Content $_ -Raw
    if ($c -match 'status: "in_progress"') {
        [PSCustomObject]@{ File = $_; Content = $c }
    }
}
```

对每个匹配的 issue，解析以下字段：

| 字段 | YAML 键 | 用途 |
|------|---------|------|
| 标题 | 首个 `# ` 行 | 显示给兄弟看 |
| skill 名称 | `skillName:` | 路由到正确的 skill 步骤 |
| sessionId | `sessionId:` | 匹配当前会话 |
| totalSteps | `totalSteps:` | 总步数 |
| completedCount | `completedCount:` | 已完成步数 |
| updatedAt | `updatedAt:` | 最后更新时间 |
| autoLog | `autoLog:` | 详细的步骤完成日志 |

---

## Step 2：展示恢复状态给兄弟

### 单 issue（自动选中，匹配当前会话）

```
🤖 检测到未完成的工作流：<title>

   工作流：<skillName>（{completedCount}/{totalSteps}）
   最后更新：<相对时间>
   会话匹配：✅ 当前会话

   已完成（{completedCount}/{totalSteps}）:
     ✅ <步骤1>
     ✅ <步骤2>

   剩余步骤（{remaining}/{totalSteps}）:
     📋 <步骤N+1>
     📋 <步骤N+2>

   🔜 即将执行下一步：<步骤名>
   继续吗？
```

### 多 issue（让兄弟选）

```
🤖 发现 {N} 个未完成的工作流，请选择要继续的：

   [1] <title1> | <skillName> | {completed}/{total} | {相对时间} | 🟢当前会话
   [2] <title2> | <skillName> | {completed}/{total} | {相对时间}
   ...

   回复序号继续，或输入：
   - 「跳过 N」跳过某个
   - 「放弃 N」放弃某个
   - 「全部放弃」放弃所有
```

### 模板变量填充规则

| 变量 | 来源 |
|------|------|
| skill名称 | issue 的 `title` 或从 `skillName` 查找对应 skill 的描述 |
| title | issue 文件首个 `# ` 行 |
| 相对时间 | 从 `updatedAt` 计算（注意时区：issue 可能用 UTC 或 +08:00） |
| 已完成步骤 | 从 `autoLog` 解析（status: completed 的 entry），格式化为 ✅ `<step_name>` |
| 剩余步骤 | totalSteps 减去 completedCount，从 skill 的已知步骤序列推断 |

---

## Step 3：路由到下一步

### 3a. 兄弟确认继续

兄弟说「继续」或序号 → 找到这个 skill 的 SKILL.md，按照其步骤序列执行下一步。

> 🔴 **关键原则**：继续执行不是重新实现该 skill，而是**直接切入对应步骤**。例如 gts-code-review Step 2（转达结果）不需要重新跑 Step 0/1。

### 3b. 兄弟说跳过

```powershell
node scripts/skill-exec-manager.cjs step-done <sessionId> --step-index <跳过步骤索引> --step-name "<跳过步骤名>"
```

### 3c. 兄弟说放弃

```powershell
node scripts/skill-exec-manager.cjs abort <sessionId> --reason "用户选择放弃"
```

### 3d. 兄弟说清除（状态僵死时）

如果 issue 显示 `in_progress` 但兄弟确认已完成：
```powershell
$sid = <sessionId>
$stateFile = ".skill-exec-state.$sid.json"
if (Test-Path $stateFile) {
    node scripts/skill-exec-manager.cjs sync $stateFile --completed-count <totalSteps> --log-entry "继续清除: 所有步骤实际已完成"
}
node scripts/skill-exec-manager.cjs cleanup $sid --result completed
```

---

## Step 4：状态同步修复

### 状态丢失检测

```powershell
$sid = <issue 的 sessionId>
$stateFile = ".skill-exec-state.$sid.json"
if (-not (Test-Path $stateFile)) {
    Write-Host "⚠️ State 文件丢失，需要重建或仅依赖 issue"
}
```

### 处理方式

| 场景 | 处理方式 |
|------|---------|
| state 文件存在且同步 | 直接 check → 读取 remainingSteps |
| state 文件丢失，issue 在 | 无法调 step-done，但 cleanup/abort 有 fallback 路径 |
| state 和 issue 都丢失 | 按无 issue 处理 |

> **推荐做法：** state 丢失时直接手动执行剩余步骤，执行完后用 `cleanup` 关闭 issue（cleanup 有 fallback）。不重建 state 文件。

---

## Step 5：无 active issue 时提供方向（第 3 层）

当没有 active issue 时，按以下顺序检查并提供选项：

### 5a. 检查 GTS-Play 未提交改动

```powershell
cd D:/Github/GTS-Play
git status --porcelain
```

有未提交 → 添加选项：「提交当前改动」

### 5b. 检查 workspace 未提交改动

```powershell
cd C:/Users/Administrator/.openclaw/workspace
git status --porcelain
```

有未提交 → 添加选项：「同步 workspace 记忆」

### 5c. 检查最近的 daily log

查看当天日志，判断中长期间断后需要恢复哪些上下文。

### 5d. 推荐方向

输出格式：
```
目前没有进行中的工作流，可以推进的方向：

   [1] 提交 GTS-Play 当前改动并推送
   [2] 提交 workspace 记忆并推送
   [3] 检查项目健康状态（health check）
   [4] <基于日志/记忆的其他推荐>

   回复序号或直接告诉我你想做什么
```

---

## 附录 A：全部 13 个带 issue-tracker 的 skill 步骤序列

### gts-code-review（4 步）
```
0: 范围确认 + 记忆/笔记/Specs 审核
1: 调度 OpenCode Pro 审核
2: 转达结果 + 逐类核对 + Specs 整理
3: OpenCode Flash 修复 + 验证核对 + .last-review + 通知
```

### gts-dev-workflow（7 步）
```
A: 分析/方案（OpenCode Pro）
B: 调度 OpenCode 实现
C: 编译检查
D: BDD 测试
E: E2E 测试
F: 代码审核
G: 保存/提交
```

### gts-dev-fix（5 步）
```
P0: 设计验收（含 E2E 场景设计 + 确认 + 复现跑）
B1: 出方案 + 根因分析（OpenCode Pro）+ 确认方案
B2: 实现 + 集成测试（OpenCode Flash）
C: 验收流程（含审核→测试→部署→保存）
M: 手动验证（交互式 checkpoint，仅普通模式）
```

### gts-dev-feat（6 步）
```
0: 需求确认（与我确认需求、验收标准）
B: 实现（出方案 + 等我确认方案 + 实现 + 集成测试）
C1: 审核+BDD+E2E
C2: 修复Specs+TDD+回归
M: 手动测试（交互式 checkpoint，仅普通模式）
C3: 部署+保存+通知
```

### gts-dev-refactor（4 步）
```
0: 重构前基线检查 + 契约清单 + 删除影响分析
B: 委托 gts-dev-workflow 实现
C: 验收流程
M: 手动测试（交互式 checkpoint，仅普通模式）
```

### gts-acceptance（5 步）
```
1: BDD + 删除影响验证
2: E2E 自动验收 + 检查 + 确认
3: Specs 修复 + TDD 验证 + 代码审核
4: 回归测试 + E2E 回归门禁 + 操作文档
5: 手动验证 + 部署 + 保存 + 通知
```

### gts-health-check（4 步）
```
1: 编译检查（tsc + rescript build）
2: 核心流程集成测试回归
3: 全量 BDD + E2E general 场景
4: Specs 一致性 + 预存错误检查 + 报告
```

### gts-save-flow（3 步）
```
0: 改动总结（等兄弟确认）
1: 审核 + BDD + 编译
2: 规格同步 + 笔记 + 记忆 + GitHub 同步
```

### gts-e2e-regression（7 步）
```
0: 询问是否全自动（跳转到 gts-auto）
1: 判断 + 环境 + 场景选择（三合一）
2: 检查服务可用性（仅 local）
3: 跑回归测试
4: 覆盖检查 + 结果通知
5: （可选）创建新回归场景
6: 保存 + 汇报总结 + 通知
```

### gts-integration-regression（6 步）
```
0: 询问是否全自动（跳转到 gts-auto）
1: 判断 + 测试范围 + 执行方式（三合一）
2: 跑集成测试回归
3: 覆盖检查 + 结果通知
4: 创建新集成测试（可选）
5: 保存 + 汇报总结 + 通知
```

### gts-regression（5 步）
```
0: 询问是否全自动
1: 环境 + 场景选择（三合一）
2: 跑集成测试回归（委托 gts-integration-regression）
3: 跑 E2E 回归（委托 gts-e2e-regression）
4: 结果汇总 + 通知
```

### gts-e2e-auto（4 步）
```
0: 列出可用 scenario，等兄弟选择
1: 根据所选 scenario 准备环境（调度 OpenCode）
2: 按顺序执行 E2E（调度 OpenCode）
3: 更新操作文档 + 结果汇总 + 通知
```

### gts-e2e-test（6 步）
```
0: 判断环境 + 重启服务
1: 解析输入 + 明确验证目标
2: 调度 OpenCode 运行测试
3: 不阻塞等待（等待兄弟操控）
4: 结果分析
5: 通知 + 更新操作文档
```
