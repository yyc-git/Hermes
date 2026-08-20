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

### 7. 🔴 回忆类问题信源优先级(2026-08-20 实锤)

**权威顺序:`git log` > `state.db` / `daily log` > MEMORY 主表**

- MEMORY 主表 = 沉淀,不是 git-tracked,容易和代码现状脱节(本会话踩:8-19 沉淀 antd-mobile Modal 修复清单,8-20 顺手答你时把"已修完"的"待修"又吐出来)
- 兄弟问"回忆 X / 昨天做了 Y / 那个 commit 是什么" → **必须先 `git log --grep=...`**,git 落地才作数
- 发现 git ≠ 主表 → 以 git 为准,**立刻 patch 主表**(不要等兄弟纠正)

### 8. 回忆类问题判定矩阵

| 兄弟说法 | 必走步骤 | 禁用 |
|---|---|---|
| "回忆昨天 X 修复" / "那个 commit 是啥" | `git log --all --grep=<关键词>` → 看 stat | 直接吐主表 |
| "上次我们怎么讨论 Y" | `state.db` query + `笔记/memory/openclaw-archive/daily/` | 跳过 daily log 直答 |
| "你之前学到的 Z 是什么" | 主表 + skill 索引 | 不查 |
| "现在代码里 X 状态" | `git log` + `git show` + 读当前文件 | 凭记忆判定 |

**核心**:回答"项目级历史状态"(代码/修复/提交)前,**0 步 git 都不能跳**。对话上下文引用("刚才我说的")才走 state.db。

### 9. 🔴 hermes 读资料 vs OpenCode 加载链 — 边界(2026-08-20 实锤)

**绝对边界**:本 skill 服务的是 **hermes 自身**(我)读取 4 源(state.db / skills / 笔记/ / MEMORY_ARCHIVE)的能力。**跟 OpenCode agent 加载 v3 skill 是不是进 surge prompt 完全无关**。

**错误路径(本会话踩)**:
- 验证"v3 skill 是否被 OpenCode 加载" → 派 OpenCode agent 读 `.opencode/opencode.json` + `/api/skill`
- 写了个 `hermes-verify-skill-load-20260820.mjs` 跑 7 个断言,其中 5 个失败
- 全部方向错了 —— 这些断言测的是 **OpenCode 加载链**,不是 hermes 自身能不能 read v3 skill

**正解**:
- 我(hermes)能不能用 v3 skill → **直接 `read_file` `~/.hermes/skills/gts-memory-search-v3/SKILL.md`** 即可,即时生效
- OpenCode agent 能不能用 v3 skill → 那是 OpenCode config 问题(`.opencode/opencode.json` 的 `agent.build.permission.skill` allowlist),跟本 skill 无关
- **不要把"我读 v3 skill"和"OpenCode 加载 v3 skill"混为一谈**;前者 0 配置,后者需要补 allowlist + 重启 4098

**trigger 关键词**:兄弟问"回忆 X / 昨天 Y / v3 skill 在不在 / 那个 commit 是什么"且**属于 hermes 自身能力** → 走本 skill §7/§8 流程(纯读)。**不要触发 OpenCode 派单**。

**例外**:如果兄弟明确说"让 OpenCode agent 验证 X" → 那走 OpenCode 加载链,不在本 skill 范围。

### 11. 🔴 "前几天才配了 X / 刚跑通了 Y" 类查询的源优先级(2026-08-20 实锤)

**触发关键词**:
- 「前几天」「刚刚」「才配了」「才接入」「刚跑通了 X」
- 用户提的**模型/provider/CLI 名词**(`mino-v2.5-pro` / `MiniMax-M3` / `token plan` / `MiMo` / `xiaomi`)
- 用户提的**实际跑通的命令/状态**(「opencode 跑通了 X」)

**错误源优先级**(本会话踩):
1. 默认查 MEMORY.md / MEMORY_ARCHIVE.md → ❌ 主表只记沉淀经验,**配置接入类改动通常不写主表**
2. 默认 `search_files` 扫 skills/ 和 笔记/ → ⚠️ 能命中但命中率低、容易漏
3. **跳过 state.db sessions 表** → ❌ 这是最大的漏 —— 配置接入类的会话标题就是「接入 X」「把 Y 配进 Z」,LIKE 一下立刻命中

**正确源优先级**(2026-08-20 兄弟纠正后):
1. **state.db sessions 表**(优先按标题 LIKE 关键词:`接入`, `token plan`, `配`, `Mimo`, `mino`, `Xiaomi`)→ 拿到会话 ID + model字段(知道当时实际用的是哪个模型/provider)
2. **state.db messages 表**(拿到该会话 assistant 复述,内容里有完整 provider/model 字符串 + 接入命令)
3. **`skills/**/*.md`**(用 `search_files` 搜完整 modelID,如 `mimo-v2.5-pro`,命中的是 model-priority-decision-tree.md / hermes-provider-config 这类已沉淀的决策文档)
4. MEMORY_ARCHIVE.md + 笔记/daily(最后查,作为兜底补充)

**实测验证**(本会话 2026-08-20):
```sql
-- 第1步:sessions 表按标题 LIKE 关键词定位(秒级命中)
SELECT id, model, datetime(started_at,'unixepoch','localtime')
FROM sessions
WHERE title LIKE '%mino%' OR title LIKE '%token plan%' OR title LIKE '%Xiaomi%' OR title LIKE '%XiaHui%'
ORDER BY started_at DESC LIMIT 15;
-- → 20260819_133232_ef7734 | mimo-v2.5-pro | 2026-08-19 13:32:33 | 「修改调度skill:把mino-v2.5-pro(token plan)作为pro场景的...」

-- 第2步:messages 表拿完整接入链
SELECT id, role, substr(content,1,600) FROM messages
WHERE session_id='20260819_130615_64145d' AND content LIKE '%token%'
ORDER BY timestamp LIMIT 20;
-- → assistant 原话:「Hermes 内置 provider 里有 xiaomi-token-plan-cn...env 变量名要求是 XIAOMI_API_KEY,而 .env 里现在存的是 XIAOMI_TOKEN_PLAN_API_KEY」

-- 第3步:搜 skills/ 找决策表
search_files pattern='mimo-v2.5-pro' path=skills/devops/...
-- → gts-opencode-dispatch-hardening/references/model-priority-decision-tree.md
--   Pro 场景优先级: volcark/deepseek-v4-pro-ga-260813 → mimo-v2.5-pro → opencode-go/deepseek-v4-pro
```

**反模式**:「我靠,你搜索下这3天的记忆(包括会话记忆)啊」—— 这是兄弟原话(2026-08-20),复盘根本原因就是**我没主动查 state.db sessions 表**,只在文件层面 grep。

**强约束**:用户提任何「token plan / provider / modelID / 接入 / 跑通了 X」类关键词 → **state.db sessions 是第一步**,不是最后一步。

### 10. 🔴 4 源 cross-check 必跑(2026-08-20 实锤)

**触发**:回答"项目级历史状态" + 多个源信息冲突时,**必须 4 源并查**才能定论:

| 源 | 工具 | 用途 |
|---|---|---|
| git log | terminal `git log --grep` | 代码真状态(唯一权威) |
| daily log | `笔记/memory/openclaw-archive/daily/<date>.md` | 当天落地动作全记录 |
| state.db | sqlite3 + FTS5 | 对话上下文 + tool 调用 |
| MEMORY 主表 | system prompt 注入 | 沉淀经验,允许过期 |

**本会话踩**:8-19 daily log 全文无 Modal 修复记录,git log 有 `d6681051e`,MEMORY 主表有过期"待修"清单 → 三个源 2-1-1 冲突 → **必须立刻 reconcile**:
- 主表过期 → patch 主表,以 git 为准
- daily log 漏写 → 标记"daily log 缺口",非阻断但提示

**禁止**:只查 1 个源就答 → 出错率高(本会话 8-20 第一轮"已修/待修"全错就是这个原因)

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
