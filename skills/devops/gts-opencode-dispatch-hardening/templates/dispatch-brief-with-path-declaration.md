# 派工 brief 模板 - 跨仓/外部路径防卡死版

## 完整模板(必填段已标🔴)

```markdown
# <任务名>

## 🔴 外部路径访问声明(必填 - 2026-08-19 教训)
- ✅ 允许读: D:/Github/<workdir> 及其子目录
- ❌ 禁止读: D:/Github/<其他仓>/(跨仓)
- ❌ 禁止读: D:/Github/<其他项目>/笔记/(跨项目笔记)
- ❌ 禁止读: 任何 /d/* / /c/* 等 Git Bash 写法路径
- ❌ 禁止读: 系统 temp (C:/Users/.../AppData/Local/Temp 等)
- 任何被拒操作:用 brief 摘要 + 已读 commit 信息继续,**不要重试被拒操作**

## 🔴 工作区状态预检(必填)
执行前先跑:
\`\`\`powershell
cd <workdir>
git status --short
git log --oneline -5
git branch --show-current
\`\`\`
报告首段必须包含上述输出。

## 任务目标
...

## 验收清单(每条必须独立实测 + 输出命令+结果)
1. ...
2. ...

## 不做清单
- ...
```

## 关键点

1. **路径声明段必须放在 brief 最开头** — agent 第一眼看到就建立边界
2. **每个禁止路径具体列出** — 不要写"等外部路径"这种含糊词
3. **拒绝后行为明示** — "用 brief 摘要继续"是 fallback,不要让 agent 自己瞎试
4. **Git Bash 路径写法也要禁** — `/d/Github/...` 这种 PowerShell 也认得但容易被 perm-deny

## 反模式

❌ brief 里只写"不要读外部文件" — 太模糊,agent 不知道具体是哪些
❌ brief 里没拒绝行为 — agent 拿到 perm-deny 后不知道怎么办
❌ brief 里只写"按 brief 出报告" — 缺路径边界

## 已踩坑

- 2026-08-19 code-review Pro session:agent 读 PMXReduceFace + GTS-Play 笔记被拒后空转 53 分钟,brief 没显式列禁
- 修复后:brief 加"外部路径访问声明"段 + "拒绝后用 brief 摘要继续" 指引
