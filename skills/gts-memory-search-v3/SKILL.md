---
name: "gts-memory-search-v3"
description: "gts-memory-search v3 伞形(2026-08-18 兄弟拍板落地)。覆盖原 gts-memory-search 人工 skill 的全部能力 + v3 新增(4 源 / trigram / top-3 多行 / --quiet / state.db 埋点 / 召回去重)。触发:每轮回复前自动跑(等价于 Holographic prefetch 桌面版),或兄弟说「召回一下」「查历史」「grep 状态库」。"
status: "active"
created: "2026-08-18"
supersedes: "gts-memory-search (人工 skill,curator 锁,内容已 v2 但 v3 能力未同步,本伞形吸收 v3)"
---

# gts-memory-search-v3 — 4 源召回伞形

> 触发：每轮回复前自动执行(等价于 Holographic / Hindsight `prefetch(query)` 钩子的桌面版手动实现)
> 目的：在不装 Hermes CLI、不改 config.yaml 的前提下,模拟外部 memory provider 的按需召回
> 创建：2026-08-18(兄弟拍板"用机制"后,desktop 形态无 Holographic/Hindsight 的折中方案)
> **吸收**: `gts-memory-search`(原人工 skill)的 v2 能力 + v3 全部新能力

---

## 召回源(4 个)

| 源 | 工具 | 已在 prompt? | 写权限 | weight |
|---|---|---|---|---|
| **A. state.db 的 `messages_fts_trigram`**(FTS5 倒排索引,**v3 改用 trigram 跟中文 n-gram 对齐**) | `sqlite3` FTS5 MATCH | ❌ | 🔴 只读,禁改 | 1.0 |
| **B. `skills\**\SKILL.md`**(本目录) | PowerShell `Get-ChildItem` + `Select-String` | ❌ | 已有 skill 写入权限纪律 | 0.8 |
| **C. `D:\Github\GTS-Play\笔记\**\*.md`**(daily/项目文档/方案/决策/代码笔记/讨论记录) | 同上 | ❌ | 🔴 兄弟亲手维护,只读 | 0.7 |
| **D. `MEMORY_ARCHIVE.md`**(v3.1 兄弟加:归档的老记忆) | 同上 | ❌(不在 prompt) | 🔴 系统管理 | 0.9 |

**排除**:
- `MEMORY.md` / `USER.md` —— 已在 system prompt,召回会重复
- `笔记/语雀知识库/` —— 兄弟红线
- `doc/` —— 不召回(写权限强红线,无 query 命中价值)
- `MEMORY_ARCHIVE.md` 不存在时 → 静默跳过(脚本 `existsSync` 判了)

---

## v3 新能力(对比 v2)

| # | 能力 | v2 | v3 |
|---|---|---|---|
| 1 | 预览 | top-1(80 字,同行) | **top-3**(80 字/条,多行输出) |
| 2 | 埋点 | 无 | **写 state.db `state_meta` 表**(`memory_search_last` key,JSON: ts/query/hit_count/sources/elapsed_ms) |
| 3 | 召回去重 | 简单 seen Set | **过滤最近 5 条 assistant message 里出现过的 ref**(`recent_filtered_count` 字段可观测) |
| 4 | `--quiet` 模式 | 无 | 跳过 📎 前缀,**输出单行 JSON** |
| 6 | 分词 | 中文 2-gram | **中文 3-gram(跟 state.db FTS5 trigram 索引一致)+ 2-gram 兜底** |
| 新增 D | 召回源 | 3 个 | **4 个(MEMORY_ARCHIVE.md 源)** |

---

## 召回 SOP(每轮回复前)

### Step 1: 提取关键词

```js
// v3 trigram 分词
function extractKeywords(q) {
  const tokens = [];
  tokens.push(...(q.match(/[A-Za-z0-9_\-\.]{2,}/g) || []).slice(0, 5));
  const cn = q.replace(/[A-Za-z0-9_\-\.\s]/g, "");
  for (let i = 0; i < cn.length - 2; i++) tokens.push(cn.slice(i, i + 3));  // 3-gram
  for (let i = 0; i < cn.length - 1; i++) tokens.push(cn.slice(i, i + 2));  // 2-gram 兜底
  return [...new Set(tokens)].slice(0, 10);
}
```

### Step 2: 4 源并行查

**Source A: state.db FTS5 trigram**
```sql
SELECT m.id, m.session_id, m.role, m.timestamp, substr(m.content, 1, 250) AS preview, rank
FROM messages_fts_trigram mft
JOIN messages m ON m.id = mft.rowid
WHERE messages_fts_trigram MATCH '"<关键词1>" OR "<关键词2>" ...'
ORDER BY rank LIMIT 5;
```

**Source B/C/D**: 每个关键词单独 `Select-String -List` 跑,合并去重

### Step 3: 召回去重 + 排序 + 截 top-5

- 读 state.db 最近 5 条 assistant message,**提取 ref 集合**(正则 `/state\.db#\d+/` + `/(?:skills|笔记)\/[^\s|"<>]+/`)
- 过滤: `if (recentRefs.has(h.ref)) continue;`
- 跨源 seen Set 去重
- 按 weight 倒序排,截 top-5

### Step 4: 注入回复

默认多行输出(每轮回复**开头**):
```
📎 召回:[state.db×5]
  top1 [state.db]: <80 字预览>
  top2 [state.db]: <80 字预览>
  top3 [state.db]: <80 字预览>
```

边界:
- 0 命中 → `📎 召回:无`
- query ≤ 2 字符 → `📎 召回:query 过短(≤2 字符),跳过`(v2 阈值从 5 降到 3)

---

## 脚本入口

`D:\Github\GTS-Play\scripts\memory-search.mjs`(Node 18+,无外部依赖)

```bash
node scripts/memory-search.mjs --query "<query>"           # 默认多行
node scripts/memory-search.mjs --query "<query>" --json    # 完整 JSON
node scripts/memory-search.mjs --query "<query>" --quiet   # 单行 JSON(无 \n)
```

JSON 字段:
- `hits[]`: top-5 命中
- `summary`: "📎 召回:[...]"
- `top_previews[]`: top-3 预览(80 字)
- `recent_filtered_count`: 召回去重过滤的数量
- `elapsed_ms`: 本次耗时

---

## 🔴 踩坑(本会话踩过)

### 1. PowerShell `Select-String -Pattern` 不支持 `|` 当 OR

每个关键词单独 `Select-String`,合并去重。**不能** `Select-String -Pattern "kw1|kw2"`。

### 2. Node `execFileSync` 调 PS 有引号地狱

中文路径 + 单引号被 Node 字符串吞。**正解**: 写临时 .ps1 文件 + `execFileSync("powershell", ["-File", ps1, "-Dir", ..., "-Pattern", ...])`,无引号转义。

### 3. `state.db` messages 表时间字段是 `timestamp` 不是 `created_at`

```sql
SELECT ... FROM messages WHERE ... ORDER BY timestamp DESC;  -- ✅
SELECT ... FROM messages WHERE ... ORDER BY created_at DESC;  -- ❌ no such column
```

### 4. Windows sqlite 多次并发调用触发 "database is locked (5)"

每个 sqlite 调用后**等 200ms** 释放连接,或 `BEGIN IMMEDIATE` 串行化。**实测场景**: verify 脚本里连续 `execFileSync("sqlite3", ...)` 5 次以上会撞锁。

### 5. state.db FTS5 默认用 `messages_fts`(普通分词),中文 2-gram 不够

**v3 改用 `messages_fts_trigram`** —— 跟中文 3-gram 分词对齐,命中质量大提升。

### 6. 兄弟专属 doc/ 笔记/ 读 vs 写区分

- 读 grep / FTS5 = ✅ 任何源
- 写 patch / write_file / skill_manage = 🔴 禁(兄弟维护的源)
- 详见 `gts-memory-write-discipline` § 4.2

---

## 验证(ad-hoc 端到端,**非测试套件**)

任何 v3.x 改动 → 写 `C:\Users\Administrator\AppData\Local\Temp\hermes-verify-memory-search-<version>.mjs`,跑 5-10 个 query × 6-8 断言,跑完删。**模板见 `templates/hermes-ad-hoc-verify.mjs`**(本会话 4 个 verify 脚本共性抽出,改 2 行配置即可复用)。

**本会话验证历史**:
- v1: 5/5(原始 3 源)
- v2: 5/5(阈值 3 + top-1 预览)
- v3: 5/5(4 源 / trigram / top-3 / --quiet / 埋点 / 去重)
- v3.1: 3/3(Source D archive)

---

## 关联

- `gts-memory-write-discipline` § 五(state.db 全文检索)+ § 九(ad-hoc verify 模式)
- `hermes-session-forensics`(state.db 详细 schema + token 审计)
- `desktop-notify-protocol`(任何"需兄弟拍板"必先 notify)
- 原 `gts-memory-search`(人工 skill,curator 锁,v2 内容;本伞形吸收 v3 能力)
