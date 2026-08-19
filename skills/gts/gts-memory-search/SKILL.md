---
name: "gts-memory-search"
description: "每轮回复前用 FTS5/ripgrep 在 3 源召回 top-5 命中,模拟 Holographic prefetch 行为。Hermes Desktop 形态专属(Hindsight/Holographic 跑不了时的轻量替代)。"
status: "active"
trigger: "每轮回复前自动执行(等价于 prefetch(query) 钩子的桌面版手动实现);也可手动 `node scripts/memory-search.mjs --query \"...\"` 召回"
created: "2026-08-18"
---

# gts-memory-search

> 触发：每轮回复前自动执行(等价于 `prefetch(query)` 钩子的桌面版手动实现)
> 目的：在不装 Hermes CLI、不改 config.yaml 的前提下,模拟外部 memory provider 的按需召回
> 创建：2026-08-18(兄弟拍板"用机制"后,desktop 形态无 Holographic 的折中方案)

---

## 召回源(3 个)

| 源 | 工具 | 已在 prompt? | 写权限 |
|---|---|---|---|
| `state.db` 的 `messages_fts`(FTS5 倒排索引) | `sqlite3` FTS5 MATCH | ❌ | 🔴 只读,禁改 |
| `E:\Hermes Agent CN Desktop\data\hermes-home\skills\**\*.md` | ripgrep(`search_files`) | ❌ | 已有 skill 写入权限纪律 |
| `D:\Github\GTS-Play\笔记\**\*.md`(daily/项目文档/方案/决策/代码笔记/讨论记录) | ripgrep | ❌ | 🔴 兄弟亲手维护,只读 |

**排除**:
- `MEMORY.md` / `USER.md` —— 已经在 system prompt 注入,召回会重复
- `笔记/语雀知识库/` —— 兄弟红线
- `doc/` —— 不召回(写权限强红线,无 query 命中价值)

---

## 召回 SOP(每轮回复前)

### Step 1: 提取关键词

从当前用户 query 提取 2-5 个 token(简单分词,中文按字符 n-gram,英文按空格)。

### Step 2: 三个源并行查

**Source A: state.db FTS5**(主)
```sql
SELECT
  m.id, m.session_id, m.role, m.timestamp,
  substr(m.content, 1, 300) AS preview,
  rank
FROM messages_fts mft
JOIN messages m ON m.id = mft.rowid
WHERE messages_fts MATCH '<关键词1> OR <关键词2> ...'
ORDER BY rank
LIMIT 5;
```

**Source B: skills/ ripgrep**(次)
- `search_files(pattern=<关键词>, path=E:\Hermes Agent CN Desktop\data\hermes-home\skills, file_glob=*.md, limit=5, output_mode=content, context=2)`

**Source C: 笔记/ ripgrep**(次)
- `search_files(pattern=<关键词>, path=D:\Github\GTS-Play\笔记, file_glob=*.md, limit=5, output_mode=content, context=2)`

### Step 3: 去重 + 排序 + 截 top-5

- 跨源去重(同文件重复只取一次)
- 按"源权重 + 关键词命中数"排序:state.db=1.0, skills/=0.8, 笔记/=0.7
- 截 top-5

### Step 4: 注入回复

每轮回复**开头**加一行:
```
📎 召回:[state.db×2] [skills/gts-git-commit×1] [笔记/daily/2026-08-18×2]
```

如果 0 命中 → 输出 `📎 召回:无`(避免空召回让人疑惑)
如果 ≥1 命中 → **追加 top-1 预览**(80 字内,放在 summary 同行 `| top: <预览>`)
如果 query ≤ 2 字符 → 输出 `📎 召回:query 过短(≤2 字符),跳过`(阈值 v2 已从 5 降到 3)

---

## 脚本入口

`scripts/memory-search.mjs`(Node.js 18+,无外部依赖):
- 入参:`--query "<当前用户 query>"`
- 出参:JSON `{ hits: [...], summary: "📎 召回:[...]" }`
- 直接 stdout 拼到 bot 回复

---

## 注意事项

- 🔴 **state.db 只读**:用 `sqlite3 ... "SELECT ..."` 模式,**禁止 INSERT/UPDATE/DELETE**
- 🔴 **笔记/ 只读**:ripgrep 命中后只显示内容,**禁止 patch / write_file / skill_manage**
- 🔴 **skills/ 只读**:同上,但**已有 skill 写入权限纪律覆盖**
- **耗时不超 150ms**(FTS5 + ripgrep 倒排索引毫秒级)
- **token 注入 ≤ 1500**(5 段 × ~300 字符)
- **不与内置 MEMORY.md 重复**:明确排除

---

## 何时不用

- 用户问"**Hi / 你好 / 在吗**"等无信息量 query → 跳过召回,直接回复
- 当前 query 极短(< 3 字符) → 跳过召回(标点/单字/寒暄,无召回价值)
- 用户明确说"**别查记忆**" → 跳过
