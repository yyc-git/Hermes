---
name: "gts-memory-write-router"
description: "归档分流 — bot 回复里显式说 '📦 归档: <内容>' 触发,自动 write_file 到 MEMORY_ARCHIVE.md,并给 MEMORY.md 同条加 #archive 标签(2.iii)。不动 MEMORY.md 已存在条目(只加标签)。Hermes Desktop 形态专属。"
status: "active"
trigger: "bot 回复里出现 '📦 归档:' 标记时自动执行"
created: "2026-08-18"
---

# gts-memory-write-router

> 触发：bot 回复里出现 `📦 归档: <内容>` 标记
> 目的：把"老教训/历史归档"性质的记忆,自动分流到 `MEMORY_ARCHIVE.md` 而不是塞进 `MEMORY.md` 主表
> 创建：2026-08-18(兄弟拍 b + iii 方案)

---

## 核心规则(兄弟 2026-08-18 拍)

- **1.b 触发**:bot 回复里**显式**写 `📦 归档: <内容>` 触发(避免智能判断误判)
- **2.iii 落盘**:
  - 追加到 `E:\Hermes Agent CN Desktop\data\hermes-home\MEMORY_ARCHIVE.md`(OpenClaw 那份拷过来后接续)
  - `MEMORY.md` 同条加 `#archive` 软标签(后续 compress 时跳过,不删内容)
- **不动 Hermes 内置 memory 工具**(sync_turn 会自动抓 bot 回复里"事实"进 MEMORY.md,所以 bot 回复里"📦 归档"那一行**也会被 sync_urn 抓到主表**——加 #archive 标签是为了后续 compress 时跳过)

---

## 触发协议

**bot 在回复里这样写**(兄弟看到就知道这条会落归档):

```
📦 归档: 兄弟拍 2026-08-18 之后,doc/ 默认 add 提交;OpenClaw→Hermes 迁移时漏拷 MEMORY-ARCHIVE.md
```

**bot 自己执行**(用 scripts/memory-write-archive.mjs):
1. 解析"📦 归档:"后面的内容
2. write_file 追加到 MEMORY_ARCHIVE.md(加 § section 标题 + 日期)
3. 在 MEMORY.md 找相似条目(关键词匹配),**追加 `#archive` 标签**(用 patch 工具 replace 旧条目末)
4. chat 内回复兄弟:"📦 已归档: <短描述>"

---

## 写入格式

**MEMORY_ARCHIVE.md 追加格式**:
```
---

## <简述>(<日期>)

<完整内容>

来源: session <sid> / turn <turn_id>
归档理由: <bot 写的理由,可空>
```

**MEMORY.md 标签格式**(原条目末加):
```
<原条目内容> [\#archive]
```

---

## 脚本入口

`scripts/memory-write-archive.mjs`:
- 入参:`--content "<要归档的内容>" [--reason "<理由>"] [--section "<section 名>"]`
- 默认 section 名 = "未分类"
- 默认 date = today YYYY-MM-DD
- 写完输出 JSON: `{ archived_to: <path>, tagged_in_memory: true|false, line: <行号> }`

---

## 何时不用

- 不是"历史教训/已过气/老背景"性质的 → **不写** 📦 归档,直接走 sync_urn → MEMORY.md
- 兄弟说"这条别归档" → 跳过
- 重复归档(30 天内同 section 已有相似内容)→ 自动跳过,bot 提示"已存在"

---

## 已知限制

- 🔴 **不动 MEMORY.md 已存在条目** — bot 看到有"#archive" 标签时不再动它(避免循环)
- 🔴 **同步两边有竞态** — 写 ARCHIVE 成功但 MEMORY 标签失败时,需要重试(暂未实现,出错时 bot 手动重跑)
- 🟡 **没去重** — 同一内容可能归档多次(兄弟 review 时手动合并)
