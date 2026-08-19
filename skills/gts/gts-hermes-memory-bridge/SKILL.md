---
name: "gts-hermes-memory-bridge"
description: "Hermes Desktop 形态下,无法装 Holographic/Hindsight 外部 memory provider 时,用本地脚本模拟'主动记忆'机制(prefetch 召回 + 归档分流)。伞形 skill,聚合 read/write 两路,只控 3-4 源、不动 Hermes 内置 memory 工具。"
status: "active"
trigger: "兄弟说 '用机制不用工具'、'模拟 Holographic'、'FTS5 召回'、'归档 ARCHIVE'、'写记忆分流' 时触发。也可由其他 skill 在需要 prefetch 时调用。"
created: "2026-08-18"
umbrella: true
subsumes:
  - "gts-memory-search (read 路径: 3 源 FTS5/ripgrep 召回)"
  - "gts-memory-write-router (write 路径: 归档分流)"
---

# gts-hermes-memory-bridge

> 伞形 skill:Hermes Desktop 形态专属,模拟 Holographic/Hindsight 外部 memory provider 的"主动记忆"机制
> 兄弟 2026-08-18 拍板:**不调 Hermes 内置 memory 工具,信任 sync_urn 抓 + nudge 提炼;用本伞形的脚本做 read 召回 + write 归档**
> 关联 doc: `笔记/daily/2026-08-18.md § gts-memory-search 上线` + `§ doc 文件保护` + `§ notify 红线边界`

---

## 适用场景

桌面版 Hermes(`where.exe hermes` 空、config.yaml 无 provider 切换):
- Holographic 装不上(需 CLI 形态)
- Hindsight 需 PostgreSQL + API key
- 内置 MEMORY.md 全量注入每轮耗 token 大
- 兄弟想"用机制不用 memory 工具"

→ 走本伞形,3 源召回 + 归档分流,模拟 prefetch(query) + on_memory_write。

---

## 子模块

### Read 路径 — `gts-memory-search`
**脚本**: `D:\Github\GTS-Play\scripts\memory-search.mjs`
**职责**: 每轮回复前,3-4 源召回 top-5 命中
**源**:
- A. `state.db` 的 `messages_fts_trigram` (FTS5 倒排索引,SQLite 自动维护)
- B. `hermes-home/skills/**/*.md` (ripgrep)
- C. `笔记/**/*.md` (ripgrep,**只读**)
- D. `hermes-home/MEMORY_ARCHIVE.md` (ripgrep,**只读**)
- 排除: `MEMORY.md` / `USER.md` (已在 prompt,召回会重复)
**输出**: stdout 单行 `📎 召回:[state.db×N] | top: <80字>...` 或 JSON (`--json`)
**v3 能力**: 阈值 3 字符 / top-3 多行预览 / 埋点 state_meta / 召回去重 / --quiet / trigram
**SKILL**: `skills/gts/gts-memory-search/SKILL.md`

### Write 路径 — `gts-memory-write-router`
**脚本**: `D:\Github\GTS-Play\scripts\memory-write-archive.mjs`
**职责**: bot 回复里显式 `📦 归档: <内容>` 触发,自动落 MEMORY_ARCHIVE.md + 主表加 #archive 标签
**兄弟拍 (1.b + 2.iii)**:
- 1.b 触发: 显式 `📦 归档:` 标记,避免智能判断误判
- 2.iii 落盘: 追加 ARCHIVE + 主表条目加 `[#archive]` 软标签(不删内容,后续 compress 跳过)
**SKILL**: `skills/gts/gts-memory-write-router/SKILL.md`

---

## 调用协议

### 何时跑 read (memory-search)
- 每轮回复前自动跑(`on_turn_start` 钩子的桌面版手动实现)
- 兄弟也可用 `node scripts/memory-search.mjs --query "..." [--json] [--quiet]`
- 极短 query (≤ 2 字符) 跳过,3 字符起召

### 何时跑 write (write-router)
- bot 回复里**显式**写 `📦 归档: <内容>` 触发
- 兄弟说"归档这条" / "这条属于老教训" 时
- **不**用于"现在的事实/偏好/约束"——那些让 sync_urn 抓进 MEMORY.md

---

## 严禁

- 🔴 **不调 Hermes 内置 `memory` 工具**(违反"用机制"原则)
- 🔴 **不写 MEMORY.md 已存在条目**(只 append #archive 标签)
- 🔴 **不 grep `笔记/语雀知识库/`** / **不 grep `doc/`**(兄弟维护)
- 🔴 **不删 doc/ 兄弟未提交内容**(doc 红线)
- 🟡 召回时:不输出 `📎 召回:` 行 = `quiet` 模式 `--quiet` 才合法(默认输出)

---

## Pitfalls (本轮踩过,都已修)

- PowerShell `Select-String -Pattern` 不支持 `|` 当 OR → 每个关键词单独跑,合并去重
- Node `execFileSync` 调 PS 有引号地狱(中文路径 + 单引号被吞)→ 写临时 .ps1 + spawn 调
- `state.db` messages 表时间字段是 `timestamp` 不是 `created_at`(老 OpenCode 经验复用)
- Windows sqlite "database is locked (5)" 多次并发调 → 加 200ms 间隔 或串行化
- 阈值 5→3 兄弟拍;短 query 走文本路径(非 JSON),长 query 走 JSON 路径

---

## 相关 skills (本伞形依赖/相关)

- `desktop-notify-protocol` — 写 ARCHIVE 失败时需 notify
- `gts-submit-save` / `gts-git-commit` — recall 输出 commit 时跟 doc 红线走
- `gts-memory-compress` — 写 #archive 标签后,compress 阶段跳过
- `desktop-power-pitfalls` — terminal 调脚本时踩 PowerShell 边界
