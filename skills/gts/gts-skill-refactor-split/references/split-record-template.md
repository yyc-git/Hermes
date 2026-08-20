# Skill 拆分实战记录模板

> 给 `gts-skill-refactor-split` 用：每次拆胖 skill 留一条 changelog（放 `笔记/skill-changelog/`）；下次有人问"这个 skill 怎么拆的"先 grep 实战记录。

## 模板（直接复制）

```markdown
# <skill-name> 拆分记录 — <日期>

## 触发
- 兄弟原话 / 信号：<skill 文件大小 / 引用方数 / 自己 review 发现>
- 决策（保守 vs 激进）：<见 gts-skill-refactor-split "何时拆"决策树>

## 拆分前后
| 指标 | 拆分前 | 拆分后 |
|---|---|---|
| 主 SKILL.md 大小 | X KB / N 行 | Y KB / M 行 |
| reference 数量 / 平均 | — | 4 个 / 12.5KB |
| 引用方 skill 数 | Z 个 | Z 个（不变） |
| 引用方 load 单次烧 token | W tokens | V tokens（-X%） |

## 切分依据（按职能，not 按章节）
1. `references/<topic1>.md` — 何时 load: <条件>
2. `references/<topic2>.md` — 何时 load: <条件>
3. ...

## 验证 3 件套结果
- [x] 主 skill 引用 reference 名 → 全部 exists
- [x] 引用方 skill 兼容（name 不变）→ <N 个 skill 还在引用>
- [x] 关键命令/术语回归 → <完整 / 缺失>

## Pitfalls 本次踩到
- <坑 1> → <解法>
- <坑 2> → <解法>

## Commits
- <commit hash> <subject>
```

## 已有实战记录

### 2026-08-20 — gts:opencode-schedule 拆分
- **触发**：gts skill 库最胖（110KB / 1102 行 / 7.1 万字符），33 个引用方，全平铺无 references/
- **决策**：保守版（兄弟拍板）— 1 主入口 + 4 reference，model selection 段不独立出去（保留主 skill）
- **拆分后**：主 SKILL.md 27.1KB / 335 行；4 reference（brief-template 6.3KB / dispatch-checklist 16KB / monitoring-wait 17.5KB / session-lifecycle 12.1KB）
- **切分依据**：
  - brief-template → "写 brief 前"
  - dispatch-checklist → "dispatch 前 Step 0/0.5/0.6/0.7 检查"
  - session-lifecycle → "追加消息 / 相续续接 / permission 卡 / post-poll state 钩子"（出岔子用）
  - monitoring-wait → "wait 主路径 + exit code 决策 + poll 降级 + LLM 静默失败"
- **3 件套全通**：所有 reference 链接存在 / 33 个引用方兼容 / 关键命令（wait 脚本 / session-meta / free-model-state / 6 个免费组模型名）齐
- **零踩坑一次过**：兄弟保守决策避开了 model selection 独立 skill 的 4098 不热加载风险（本轮已在派工中）
