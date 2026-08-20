---
name: hermes-memory-limits
description: "Hermes MEMORY.md 的硬约束与运维纪律。🔴 MEMORY.md 字符上限是 Hermes 内部硬编码 8000,不是配置项;`memory_char_limit` config 字段不存在。兄弟拍板 MEMORY.md 必须 < 6400(80%)。新增与压缩不能并行——先 archive+remove 腾位,再 add。任何 agent 准备动 MEMORY.md 前必读本 skill,否则会撞 7994/8000 的墙反复拒写。"
---

# Hermes MEMORY.md 硬约束(Memory Limits)

> 本类约束:跨任务类型通用,凡是涉及修改、压缩、查看 MEMORY.md 之前必读。

## 🔴🔴🔴 三条硬约束(2026-08-18 实测)

1. **MEMORY.md 字符上限 = 8000,硬编码**,不可配置
   - 实测命令:`hermes config set memory_char_limit 16000` → 报 `✓ Set memory_char_limit = 16000 in ...config.yaml` 但同时 `⚠ 'memory_char_limit' is not a recognized config key — it was saved anyway, but Hermes may not read it.`(Custom top-level keys are supported and bridged to the environment for skills/external tools.)
   - Hermes 内部硬编码,与 config 无关;memory 工具写满即拒,报 "would put memory at X/8,000 chars"

2. **兄弟拍板:MEMORY.md 必须 < 6400 字符(80% 上限)**
   - 来源:20260818_141830_fa1cf2 会话,兄弟说"补上 另外修改反思skill:检查MEMORY.md的大小改为应该小于最大值的 80%"
   - 落入 gts-skill-reflect skill 的"📏 MEMORY.md 健康线"检查项

3. **新增条目和压缩不能并行** —— 必须先 archive/remove 腾位,再 add
   - 实测:20260818_141830_fa1cf2 会话里,agent 想"既压缩旧条又加新条",memory 工具反复报 "would put memory at 8,011/8,000 chars -- over the limit",最后只能 remove 旧的腾出 384 字符才 add 成功一条
   - 一句话:**先砍再补,不能两件事一起做**

## memory 工具的正确两步姿势(撞墙时必走)

```js
// Step 1:腾位(删旧条)
// memory(action='remove', old_text='<旧的某条精确子串>')
// Step 2:补新
// memory(action='add', content='<新条>')
```

❌ 不要用 batch(operations 数组)想一次做完 —— 当前 usage 接近 8000 时,batch 也撞墙,且 batch 字段名错 (`replace` 无 `content` 参数)会被全拒。

## 为什么这条约束要单独存在

兄弟工作区的 `gts-memory-compress` skill 是 created_by=None(视人工创建),skill_manage patch 拒、references 文件 write 也拒。本次发现无法直接修补它。所以新建本 agent-created umbrella skill 承载约束,未来 agent 通过 skill_list 看到本 skill 主动加载。

## 配套工具

- **压缩**:`gts-memory-compress`(兄弟手工 skill,patch 不了——但要执行前必读本 skill,校准 8000 真实上限,而非 50KB 健康线)
- **审计 token**:`hermes-session-forensics` 的 `scripts/token-audit.cjs`(查 state.db,别 grep 日志)
- **健康检查**:`gts-skill-reflect` 的"📏 MEMORY.md 健康线"步骤

## 判据:是不是这条撞墙

错误信息特征:`Replacement would put memory at X/8,000 chars. Shorten the new content, or 'remove' other entries first.` 或 `After applying all N operations, memory would be at X/8,000 chars -- over the limit. Remove other entries first.`

→ 立即停下,先 `memory status` 看当前 usage,然后先 remove 再 add。

## 触发本 skill 的场景

- 准备 `memory(action='add'|'replace')` 任何写操作前
- 触发 `gts-memory-compress` 前(避免按 50KB 目标跑,实际触不到)
- 兄弟说"记忆太大 / 压缩记忆 / MEMORY.md 满了"任何时候
- 看到 memory 工具拒写报错时

## 历史教训

| 时间 | 会话 | 教训 |
|------|------|------|
| 2026-08-17 | (历史) | 之前认为 `memory_char_limit` 是配置项,可调到 30000,**错了** —— 这个 config 字段根本不存在,Hermes 不读 |
| 2026-08-18 | 20260818_141830_fa1cf2 | 想"既删旧条又加新条",反复撞 7994/8000 的墙;最后只能 remove 旧的腾出 384 字符才 add 成功。**新增和压缩必须分两步** |
| 2026-08-18 | 20260818_142930_xxxx | 兄弟拍板 "MEMORY.md < 80% 上限",但当时 MEMORY.md 已 7877 字符(超过 6400 阈值),事后才腾位 |