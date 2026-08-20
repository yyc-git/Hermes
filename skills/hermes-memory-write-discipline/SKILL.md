---
name: "hermes-memory-write-discipline"
description: "在 Hermes Agent 里如何正确使用记忆机制 — sync_turn + nudge 自动跑,bot 不主动调 memory 工具写满主表;主表只放一行结论 + 指针,SOP 进 daily;声明式事实,非指令;batch 必用 operations 数组。触发：兄弟说『记 memory』『记忆』『MEMORY.md 满了』『用机制』,或 bot 自己想把内容写进 MEMORY.md 时。"
status: "active"
trigger: "兄弟说'记 memory / 记忆 / 写记忆 / MEMORY.md 满了 / 用机制 / 怎么用 Hermes 记忆';bot 自觉想写 memory 时自动加载自检"
created: "2026-08-18"
origin: "agent-created"
---

# hermes-memory-write-discipline — Hermes 记忆写入纪律

> 起源:2026-08-18 兄弟质问"如何让你用你的记忆机制而不是用 memory 工具写记忆",bot 当场认错并重整思路。**这是 Hermes 记忆机制的正解,不是另一个 SOP**。

## 🔴 核心原则(必读,3 条)

### 原则 1:**用机制,不用 memory 工具**

Hermes 已经有的自动化机制(详见 `references/hermes-memory-architecture.md`):
- **内置**: `sync_turn(user, assistant)` 每轮后自动同步对话 → `MEMORY.md` 冻结快照,启动时一次性注入
- **nudge**: 定期提醒自己保存重要内容
- **Skill 记忆**: 复杂任务后自动提炼成 `skills/` 下的 Markdown
- **外部 provider**(`prefetch(query)`): Holographic / Hindsight / Honcho 按需召回

**bot 正确做法**:
- 在回复里**用自然语言写出事实/结论** → `sync_turn` 自己抓
- 不主动调 `memory` 工具批量写
- 复杂操作经验**最后一段"成果总结"** → nudge 自己决定要不要提炼成 skill
- 用户偏好**让系统从对话推断**写到 USER.md,不要自己塞

**反例**(2026-08-18 bot 犯):看到事实就调 `memory(action='add', content='200 字符 SOP')`,把主表塞到 8000 字符上限。**正解**:写一行回复,让 `sync_turn` 抓。

### 原则 2:**主表只放一行 + 指针,SOP 进 daily**

**MEMORY.md 主表 = 索引**(8000 字符硬上限,**别塞 SOP**)。**正确写法**:
- ✅ `🔴 doc/ 下 .org/.md 兄弟亲手维护(2026-08-18 拍板),细节 daily/2026-08-18 §doc-文件保护`
- ❌ `🔴 doc/ 下 .org/.md 兄弟亲手维护。禁止命令:checkout/restore/reset/--hard/clean。要还原必先通知...` (展开 4 行,占位 200+ 字符)

**完整 SOP / 踩坑经过 / 命令片段** → `D:\Github\GTS-Play\笔记\daily\YYYY-MM-DD.md` 或对应笔记(`决策记录/` / `代码笔记/` / `方案/` 等)。

**自检三问**(写入主表前):
1. 这条是**约束结论**还是**操作手册**? 结论 → 主表,手册 → daily
2. 删掉细节后,**半年后我能否凭一行字知道该查哪里**? 不能 → daily
3. 是否有"为什么/怎么操作/踩了什么坑/具体命令"? 有 → daily

### 原则 3:**声明式事实,非指令**

- ✅ Declarative: `🔴 用户偏好 X(2026-08-18 拍板)` — 系统当成"既成事实"存储
- ❌ Imperative: `🔴 落主表前自检 3 问:1)...2)...3)...` — 系统当成"未来要做的事",污染后续判断,变成自我施加约束

**原因**:memory 是状态(事实),不是 SOP(指令);指令会硬编码到未来 session 的判断里。**写事实 + 指针**才不会反噬。

---

## 🔴 操作纪律(配套原则 1-3)

### memory 工具 batch 必用

任何批量 memory 改动必须**单次 `memory` 调用 + `operations` 数组**完成。**禁止**拆成多次 add/replace/remove 单调用:
- 单次 batch 在内部原子应用,字符预算按最终结果算
- 多次拆开 = 反复触发 loop 警告 + 浪费 token(2026-08-18 bot 犯 4 次循环才腾位)
- 正确示例: `memory(target='memory', operations=[{action:'replace', old_text:'...', content:'...'}, {action:'add', content:'...'}])`

### 不主动建 skill(除兄弟明示)

nudge 已覆盖"自动提炼 skill":每轮结束系统会主动提"要不要存为 skill"。**bot 不主动 `skill_manage(action='create')`**(除非兄弟明确说"封成 skill")。

---

## 不该做的(踩过的反例,2026-08-18)

| 错误 | 正确 |
|---|---|
| `memory(action='add', content='200 字符 SOP')` | 回复里写一行结论,让 sync_turn 抓 |
| `memory` 4 次循环才腾位 | 1 次 batch + operations 数组搞定 |
| 主动 `skill_manage create` | 等 nudge 提示再决定 |
| 主表写"落主表前自检 3 问"(指令) | 主表只写"主表只放结论 + 指针"(事实) |
| 把"踩坑经过 / 命令片段"塞主表 | 进 `笔记/daily/<日期>.md` |
| 拆 N 个 `memory` 单调用 | `memory(operations=[...])` 一次 |

---

## 关联

- **`gts-memory-search`**(本会话创建):按需召回(state.db FTS5 + skills/ + 笔记/ ripgrep)弥补内置主表 8000 字符上限
- **`gts-memory-compress`**:主表 > 50KB 时的索引化瘦身工具(保护 ★ 规则)
- **MEMORY.md**(`E:\Hermes Agent CN Desktop\data\hermes-home\MEMORY.md`):主表存的就是这套纪律,每次启动注入
- **state.db**(`...hermes-home\state.db`):所有历史对话原文 + FTS5 索引,本会话 `gts-memory-search` 用到

---

## 触发清单(本 skill 何时该自检)

1. bot 想 `memory` 工具 add/replace/remove → **先回答核心原则 1**(用机制不用工具)
2. bot 想把 > 2 行内容写进主表 → **原则 2**(主表只放一行 + 指针)
3. bot 写"应该 X / 必须 Y / 不要 Z" 类指令到主表 → **原则 3**(改写为事实)
4. 兄弟说"用机制" / "记忆机制" / "MEMORY.md 满了" → 直接 load 本 skill
5. memory 调用 2 次还没完成批量改动 → **操作纪律 batch**(单次 operations 数组)
6. **主表字符 > 70%(5600/8000)** → 主动走 gts-memory-compress(不依赖兄弟提醒,2026-08-20 实锤:5 天内堆满没主动压)
7. **新增条目导致主表 > 80%(6400/8000)** → 该条 add 必须配套至少 1 条 remove(原则 2 单条压缩腾位)

## 主动压缩检查(2026-08-20 兄弟质问后落地)

> bot 没主动压缩 = 撞墙是必然。兄弟原话:「MEMORY怎么又快满了,写memory时没有遵循skill吗?就是说要把MEMORY_ARCHIVE.md用起来啊」

每轮回复结束(无脑自检,无需兄弟提醒):
- 若主表 `> 5600 字符 / 8000 = 70%` → **主动跑 gts-memory-compress skill**,先补 ARCHIVE 再压主表,不让它涨到 95% 才动手
- 若主表 `> 6400 字符 / 8000 = 80%` → 必须立即压(原则 2 红线)
- 写入新条目后必须验证字符数 = 写前字符 + 新条目字符 ≤ 6400,否则先 remove 旧的腾位再 add

**配套事实**:MEMORY.md 是 Hermes 注入的常驻记忆,主表 = 索引(8000 字符硬上限,不是 KB)。ARCHIVE 是详细内容/踩坑/SOP 的归属地,容量不限但要可检索(章节标题 + 锚点词)。详见 gts-memory-compress + hermes-memory-limits skill。

---

## references/

- `references/hermes-memory-architecture.md` — Hermes 记忆机制详解(内置 + 8 个外部 provider + sync_turn 生命周期)
