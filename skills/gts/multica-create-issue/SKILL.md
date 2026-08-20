---
name: "multica-create-issue"
description: "创建 Multica issue：先选类型（feat/fix/refactor/验收）和是否用小队，再创建并分配"
---

# 发起 Multica Issue

调度 Multica CLI 创建 issue，由我来操作。

> 本 skill 已合并 `multica-create-squad-issue`，不再单独存在小队 issue skill。

## 触发词
兄弟说「发起issue」「创建议题」「创建任务」「发起小队issue」「小队任务」「分给小队」

## 工作流程

### Step 0: 确定类型和分配方式

同时问兄弟两个问题：

**① 类型：**

| 类型 | 对应工作流 skill | 说明 |
|------|-----------------|------|
| **feat** | `gts-dev-feat` | 新功能开发 |
| **fix** | `gts-dev-fix` | Bug 修复 |
| **refactor** | `gts-dev-refactor` | 重构（不改变外部行为） |
| **验收** | `gts-acceptance` | 验收流程（BDD→E2E→审核→部署） |
| **代码审核** | `gts-code-review` | 代码审查 + 修复 + 健康检查 → 参考 gts-code-review skill 流程，修复完成后调度 @health-check 智能体执行全面健康检查 |

**② 是否分配给小队 `gts-dev-squad`：**
- 是 → 创建时用 `--assignee-squad "gts-dev-squad"`（@dispatcher 自动分配）
- 否 → 默认指派给 @ops，或问兄弟指定给谁

### Step 1: 理解需求

- 确认 issue 标题、描述
- 确认分配到哪个项目（单机 / 多人联网 / 论坛 / 官网），默认 GTS-Play
- 如果兄弟描述不够清晰，先提问
- 优先级自动决策：
  - bug / 紧急 → urgent
  - 新功能 / feat → high
  - fix / refactor → medium
  - 验收 → medium
  - 代码审核 → medium
  - 未明确 → medium

### Step 2: 请求确认

**在创建 issue 之前，必须展示草案让兄弟确认：**

```
📋 Issue 草案（请确认）

标题：[标题]
描述：[简述]
项目：[项目名]
类型：[feat/fix/refactor/验收/代码审核]
对应工作流：[对应的skill名]
分配：[小队 gts-dev-squad / 直接指派 @xxx]
优先级：[priority]
状态：todo

请回复 "确认" 或 "修改：..." 来调整。
```

**必须等兄弟回复确认才能创建，绝对不能直接创建。**

### Step 3: 创建 issue

兄弟确认后：

**小队模式：**
```powershell
& "C:\Users\Administrator\.multica\bin\multica.exe" issue create `
  --project <项目ID> `
  --title "<title>" `
  --description "<description>" `
  --assignee "gts-dev-squad" `
  --priority <priority>
```

**直接指派：**
```powershell
& "C:\Users\Administrator\.multica\bin\multica.exe" issue create `
  --project <项目ID> `
  --title "<title>" `
  --description "<description>" `
  --assignee "<agent名>" `
  --priority <priority>
```

**项目ID速查：**
| 项目 | ID |
|------|-----|
| 官网 | `17807e49` |
| 论坛 | `b6f5d411` |
| 多人联网 | `c0f02839` |
| 单机 | `c7ce396e` |

### Step 4: 汇报结果

创建完成后，从 JSON 输出中提取 `id`（UUID，如 `68d32bb1-4bdc-4837-a7cd-8ed2980f82f5`），构造链接后汇报：

```
✅ Issue 已创建

链接：https://multica.ai/giantess-play/issues/<id>
项目：[项目名]
类型：[类型]
分配：[小队/agent]
优先级：[priority]

小队模式：@dispatcher 会自动分配
直接指派：指派的 agent 已收到任务
```

> URL 格式：`https://multica.ai/giantess-play/issues/<id>`，id 即 issue 的 UUID（如 `68d32bb1-4bdc-4837-a7cd-8ed2980f82f5`），点进去可直接看到该 issue。
> 注意：**不能用 `identifier`（`WS-45`）构造链接，必须用 `id`（UUID）**——前者会跳到错误的 `/app/issues/` 页面。
