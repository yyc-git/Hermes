---
name: "gts-test-quality"
description: "测试质量审计工具: mock检测/模糊断言/跨模块覆盖/旧BDD不变性。被其他skill调用，不独立触发。"
---

# gts-test-quality — 测试质量审计工具

> 被其他 skill 调用（gts-dev-workflow Step 2.3、gts-code-review、gts-acceptance），不独立触发。
> 检查标准来自 `笔记/项目文档/rules/workflow-rules.md` → 测试质量审核标准 和 `笔记/项目文档/rules/test-standards.md` → 各层质量标准。

## 检查项

### 1. Mock 检测

```powershell
cd D:\Github\GTS-Play\packages\frontend-multiplayer
Select-String -Path "jest.config.js" -Pattern "State|Manager|network-framework|tsrpc" -SimpleMatch
```

输出: 标注哪些核心模块被 mock 了。

### 2. 模糊断言检测

```powershell
cd D:\Github\GTS-Play
Get-ChildItem -Recurse -Filter "*.feature" | Select-String -Pattern "correctly|properly|should be managed|appropriately" | Select-Object -First 20
```

输出: 模糊断言文件清单 + 行数。

### 3. 跨模块覆盖检测

检查 `test/integration/` 是否存在，统计覆盖的模块边界。

### 4. 旧BDD修改检测

```powershell
cd D:\Github\GTS-Play
git diff --stat -- "**/test/**" "**/*.feature" "**/*.steps.ts"
```

输出: 本次改动中修改的测试文件列表。如有已有 BDD feature/steps 被修改 → 🔴。

### 5. 回归场景检查

```powershell
Get-ChildItem D:\Github\GTS-Play\packages\frontend-multiplayer\test\e2e\scenarios\regression -Filter "*.json" -ErrorAction SilentlyContinue | Measure-Object | Select-Object -ExpandProperty Count
```

### 6. 真实代码检测（2026-07-21 新增）

检查集成测试是否真的测试了生产代码，而非模拟类:

```powershell
# 查 steps 文件是否 import 自真实模块
cd D:\Github\GTS-Play
Select-String -Path "test/integration/**/*.steps.ts" -Pattern "from.*src/" -List
```

**标准:**
- 🔴 如果测试文件中出现自建的模拟类（如 `class CountdownManager`、`class ExitHandler`、`class WsMessageBuffer`）→ 测试的是模拟代码，不是真实代码
- 🔴 如果测试文件只 import 了 `jest-cucumber` 和 `loadFeature`，没有任何 `from "packages/` 或 `from "../../src/` 的 import → 可能没有测试真实代码
- ✅ 检查通过：至少有一个 `import { xxx } from "../../src/models/"` 或 `from "<真实的模块路径>"`
- ✅ 异常：纯逻辑/算法测试可以自建测试辅助函数，但核心行为必须有真实代码调用

**输出:**
```
## 真实代码检测
| 文件 | import真实代码 | 含模拟类 | 结论 |
|------|-------------|---------|------|
| host-exit.steps.ts | ✅ removeUserAndMaybeTransferHost | ❌ | ✅ PASS |
| countdown-race.steps.ts | ❌ 无 | ✅ CountdownManager | 🔴 FAIL |
| ws-race.steps.ts | ❌ 无 | ✅ WsMessageBuffer | 🔴 FAIL |
```

### 7. 注释代码扫描（2026-07-21 新增）

检测本次改动中是否有大段被注释掉的代码（临时禁用但没人回头修）。

**背景：** ApiAddUser.ts:123 整段被注释掉——之前有 "global state corruption" bug 所以暂时禁用，但没人回头修。这种模式是「修复 bug 引入新问题」的高发源头。

```powershell
cd D:\Github\GTS-Play
# 扫描本次 diff 中连续 3+ 行注释（// 开头）
git diff HEAD -- "*.ts" "*.js" "*.tsx" | Select-String -Pattern "^\+\s*//" | Group-Object -NoElement

# 扫描改动的文件中是否有被注释的函数/方法（/* ... */ 整段注释）
git diff HEAD -- "*.ts" "*.js" "*.tsx" | Select-String -Pattern "^\+\s*/\*" -Context 0,5
```

**标准:**
- 🔴 本次改动新增了连续 5+ 行注释代码（`//` 或 `/* */`）→ 可能是临时禁用但没写 TODO
- 🟡 本次改动新增了 3-4 行注释代码 → 警告，确认是否有对应 TODO/Issue
- 🟡 已有被注释的旧代码在本文件中存活 >30 天 → 僵尸代码，建议清理或恢复
- ✅ 如果注释的代码有明确 TODO 注释（如 `// TODO(#123): 修复 global state corruption 后恢复`）→ 可接受

**输出:**
```
## 注释代码扫描
| 文件 | 注释行数 | 有TODO | 存活天数 | 结论 |
|------|---------|--------|---------|------|
| ApiAddUser.ts:123 | 12 | ❌ 无 | >30天 | 🔴 僵尸代码 |
| GameLogic.ts:89 | 3 | ✅ "TODO: remove after v3.1" | 5天 | ✅ 可接受 |
| Room.ts:45 | 5 | ❌ 无 | 新增 | 🟡 需确认 |
```

## 调用方式

被其他 skill 调用时，执行上述检查，输出摘要：

```
## 测试质量报告
| 检查项 | 结果 | 详情 |
|--------|------|------|
| mock检测 | ✅/🔴 | N个核心模块被mock（列出） |
| 模糊断言 | ✅/🟡 | N处模糊断言（列出文件） |
| 跨模块覆盖 | ✅/🟡 | 缺失的边界：... |
| 旧BDD修改 | ✅/🔴 | N个测试文件被修改 |
| 回归场景 | ✅/🟡 | regression/下N个场景 |
| 真实代码 | ✅/🔴 | N个文件含模拟类 |
| 注释代码 | ✅/🔴/🟡 | N处大段注释（列出文件+行号） |
```

---

## ⚠️ 不直接修改代码

本 skill 只做检查和报告，不自动修改测试文件。
修改建议通过 brief 传给 OpenCode 处理。
