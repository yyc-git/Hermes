# 2026-08-18 "信任 Hermes 机制,不造轮子" 触发经过

## 事件链

1. 兄弟质问"doc/v2.0-alpha.13.org 是不是被还原过"
2. bot 排查回:未还原,工作区 modified 状态
3. 兄弟拍板:doc/ 兄弟亲手维护,git 直接 add 提交,禁 checkout/restore/reset,改前先问
4. bot 第 1 次落 memory:把 doc 红线展开成 4 行 SOP 写进 MEMORY.md 主表——违反当天早上兄弟拍板的 memory 分类原则
5. 兄弟再次纠正:MEMORY.md 不是用来记这些的,我不是今天才让你搞清楚记忆机制吗
6. bot 认错,精简主表为 1 行 + 写 daily
7. bot 接着在 reply 里发明了 3 条如何避免再写主表的自检流程(自检 3 问 / token 预检 / 回复模板必含自检句)
8. 兄弟贴 Hermes 记忆机制说明打脸:你不是有记忆机制吗——bot 造的全是低配轮子
9. bot 承认错位,本文件 + 新伞形 skill ai-trust-existing-mechanisms 沉淀

## 兄弟原话

- MEMORY.md 不是用来记这些的啊!我不是今天才让你搞清楚你的记忆机制了吗
- 你不是有记忆机制吗(贴 Hermes 三层架构 + 主动记忆 + nudge + 注意事项)

## bot 犯的 3 个错

1. 写主表时贪心展开 SOP(4 行而不是 1 行 + 指针)
2. 被纠正后修复过度——在 reply 里造自检流程(每次回复都加自检句污染回复流)
3. 没区分事实/偏好和指令——把回复前自检当约束写,违反 memory 写 declarative facts not instructions 原则

## 已被废弃的低配轮子(禁造)

- 落 memory 前自检 3 问 → Hermes nudge 已覆盖
- 回复末尾加指向 daily 指针必含项 → 污染回复流 + 改后续判断
- 封 skill gts-memory-write-discipline → skill 自动提炼会处理
- token 预检 < 80 字符留主表 → 8000 字符硬上限 + compression.threshold 已自动跑
- MEMORY.md 写回复前先 X → 违反 declarative facts 原则,污染

## 该走的正确做法(已沉淀)

- 主表 1 行结论 + 指针到 daily(写事实/偏好/约束不写 SOP)
- daily 写踩坑经过 + SOP + 命令片段
- skill 改造(改 SKILL.md body)——但 gts-save-memory 是 created_by=None,agent 改不了
- 新建伞形 skill ai-trust-existing-mechanisms(本 skill)把信任已有机制独立 class 化

## 同日相关教训串联

- 笔记/daily/2026-08-18.md § memory 分类原则 — 主表 vs daily 边界
- 笔记/daily/2026-08-18.md § doc 文件保护 — doc/ 红线
- gts-submit-save Step 1-② — doc/ 措辞已改默认 add 提交,禁还原
- gts-git-commit 步骤 4 / 纪律 6 — 同上
- ai-trust-existing-mechanisms SKILL.md — 本类教训伞形
- 本 reference — 本轮触发经过
