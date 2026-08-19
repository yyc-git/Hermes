---
name: "gts-code-review-nested-from-fix-skill"
description: "gts-code-review 嵌套调用实战模板(2026-08-19 兄弟拍板走 fix Phase C 实测沉淀)。触发:被 gts-dev-fix/gts-dev-feat/gts-dev-workflow/gts-acceptance 调用做已落盘 commits 审核时。"
---

# 嵌套调用代码审核实战模板

> 触发条件:gts-code-review 被其他 skill 嵌套调用,且是"对已落盘 commits 做审核"(非独立触发)。
> 独立触发场景见 `gts:gts-code-review` 主 SKILL.md。

## 嵌套调用判定(2026-08-19 实测)

执行任何步骤前读取 `.skill-exec-state.<sessionId>.json`:
- 如果文件存在且 `skillName` 不是 `"gts-code-review"` → **嵌套调用,本 skill 不管理状态**
- 文件不存在或 `skillName === "gts-code-review"` → **独立触发,正常走完整流程**

## 嵌套调用方需做的工作

### 1. 状态由调用方 skill 管

**不要**新建 gts-code-review 的 state 文件——调用方 skill (如 `gts-dev-fix`) 已经 init 过 `.skill-exec-state.<sid>.json`,在那个文件里推进步骤。

### 2. 调用方 step-done 哪些步骤?

- **如果**本次代码审核是"对已落盘 commits 做审核"(2026-08-19 实锤场景:Phase Fix-r4~r9 6 commits 自动化完成后进 fix Phase C 审核):
  - 调用方的 P0/B1/B2 **隐式已完成**(commits 落地)→ 在调用方 skill 里 step-done P0/B1/B2 直接进 C
  - **不要在调用方 skill 里也 step-done C**(那是审核完成+修复完成的事)
  - 调用方 skill 自己的 Phase C 流程 = 审核 + BDD + E2E + Specs + TDD + 两层回归 → 兄弟决定要不要 dispatch 修复
- **如果**本次代码审核是"修复 + 审核"(典型 fix: 入口):
  - 调用方 B2 = 实现,完成后进 C = 审核
  - 不需要 step-done P0/B1(本来就是 fix,无独立 P0)

### 3. 派 OpenCode 审核的 brief 模板(2026-08-19 实战验证)

```markdown
# 代码审核 — <commit 范围描述>

## 上下文
<本次审核是哪个 skill 嵌套调用 + 为什么 + 涉及几个 commit>

## 审核范围
列出每个 commit hash + 1 句话描述 + 关键看什么:
- `<hash>` <仓库> <1 句话描述>
- 关键看:1) ... 2) ... 3) ...

## 审核命令
每个 commit 给出 `git show <hash> --stat` 的完整路径(注意 PMXReduceFace 是独立仓,要 `cd D:/Github/PMXReduceFace && git show <hash> --stat`)

## 审核标准(从 `笔记/项目文档/rules/workflow-rules.md` 实时读取,不要硬编码)
参考第 0 条测试质量审核 (mock/模糊断言/跨模块/旧 BDD/回归场景/真实代码)

## 报告格式
- 每个 commit 独立给一段(不要跨 commit 混合)
- 按 🐛🔴🟡🟢📋 五级分类输出
- 每条:问题描述 + 文件 + 行号 + 建议修复方式
- 末尾汇总表:commit × 分类矩阵
- 没内容类别写 "(无)"

## 🔴 必做
1. 独立核对:每条结论基于实际读 diff,**不凭印象**
2. 关注算法边界:阈值边界/字符匹配边界(全角 i)/零向量边界
3. 关注测试覆盖:每个算法改动是否有测试更新
4. 不审 <commit 范围> 之外的 commit

## 🚫 不做
- 不审其他 commit
- 不动任何代码(只审不改)
- 不 push
```

### 4. 模型选择规则

- **跨包/跨仓/架构级改动** → **Pro** (`volcark/deepseek-v4-pro-ga-260813`)
- **简单 < 50 行/单文件/工具类** → Flash (`opencode/deepseek-v4-flash-free` 优先)

判断依据看 `gts:opencode-schedule` 的模型选择速查表。

### 5. 审核范围默认

嵌套调用时审核范围 = **本次改动文件清单**(`.last-review` 不参考,不要让 agent 自动扫全分支)。

### 6. 状态同步

审核 OpenCode 完成 → bot 转达结果给兄弟,**由调用方 skill 推进状态**(本 skill 嵌套不推进自身状态)。

## 实战错误避免(2026-08-19 兄弟拍板"你怎么没检查"教训)

- **不要等兄弟来查 session 状态**:wait DONE 后必须立即 `sqlite3` 查 part 表 + `git log` 核对 commit 落盘
- **不要凭 wait 脚本 stdout 判断 session 状态**:wait 可能 30s TIME 误报但 session 实际在跑(也可能在 wait 退出的瞬间刚好 commit 完成)
- **兄弟原话(2026-08-19):"这个早就跑完了吧?你怎么没检查"** —— 不要等兄弟来问

详见 MEMORY.md "OpenCode 静默失败+主动核对"条目 + `gts:opencode-schedule` skill "session 状态必须主动核对"铁律。

## 相关 skill

- `gts:gts-code-review` —— 主 skill,嵌套调用规则
- `gts:gts-dev-fix` —— 常见调用方,Phase C Step 1 嵌代码审核
- `gts:gts-dev-workflow` —— 嵌套调用也可能
- `gts:opencode-schedule` —— 派工 + 监控 SOP
- `gts:opencode-session-ops` —— session 状态判定
