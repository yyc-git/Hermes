---
name: "hermes-memory-mechanism-usage"
description: "用 Hermes 主动记忆机制(sync_turn / FTS5 / nudge / memory 工具)而非反复调 memory 工具堆主表。覆盖 write discipline + 何时调 memory 工具 + 与外部 memory provider(Holographic/Hindsight)的关系。"
status: "active"
created: "2026-08-18"
---

# hermes-memory-mechanism-usage — 信任 Hermes 主动记忆

> 兄弟原话(2026-08-18):"用机制不用工具"——质疑 bot 反复调 `memory` 工具写满主表的做法。
> **核心思想**:Hermes 有 `sync_turn` 每轮后自动同步对话、有 FTS5 全文索引、有 `nudge` 主动提醒——**这套机制本来就该跑**,**bot 不该自己模拟**。
> **何时建此 skill**:看到 bot 准备调 `memory` 工具 / 准备扩主表条目 / 准备写新 skill 之前,先查本节。

---

## Hermes 主动记忆机制(系统视角,bot 只用不写)

参考 2026-06 文章 "Hermes Agent 永久记忆方案深度分析" + 实测。Hermes 记忆分**内置 + 外部插件**两层:

### 第一层:内置(Always Active)

- **MEMORY.md** + **USER.md**(`§` 分隔,纯文本,人类可读,字符硬限制,MEMORY 2200 / USER 1375 默认,本机已调 8000/4000)
- **注入方式**:会话启动时一次性快照注入 system prompt → 冻结不变(保护 prompt cache)
- **memory 工具**(add/replace/remove):会话中写入即时持久化
- **漂移检测**:检测外部修改,拒绝写入
- **防注入**:加载时扫描威胁模式,`[BLOCKED]` 占位
- **每轮 `sync_turn`**:对话内容自动同步,bot 不用手动操作

### 第二层:外部 plugin(可选,一次一个)

8 个内置: Honcho / Hindsight / Mem0 / Holographic / Supermemory / ByteRover / RetainDB / OpenViking
- 提供 **prefetch(query)** 每轮前自动召回相关记忆
- **on_turn_start** / **on_session_end** 钩子
- 由 MemoryManager 编排

### Hermes Desktop 形态的实情(2026-08-18 实测)

- **没有 `hermes memory status` / `hermes memory setup` CLI**(桌面 App 不是 CLI 装版,`where.exe hermes` 空)
- **`config.yaml` 无 provider 切换字段**(`memory:` 段只有 `memory_char_limit: 30000`,无 provider 选项)
- **没有真 Holographic / Hindsight**(外部 provider 桌面版没接入口)
- **state.db 的 `messages_fts` FTS5 索引可用**(本会话 gts-memory-search 用了)

→ **Desktop 形态的"准外部 provider" = 读 state.db FTS5**(`gts-memory-search` skill 已实现)

---

## 🔴 红线:什么时候**不该**调 memory 工具

| 场景 | 错做法 | 正做法 |
|---|---|---|
| 想让 bot 记"兄弟喜欢 X" | `memory(add, "兄弟喜欢 X")` | **让系统从 USER.md 自动推断**(对话中重复出现 → 推断) |
| 想让 bot 记"今天踩了 Y 坑" | `memory(add, "Y 坑: <100 字>")` | **写 daily log**(`笔记/daily/<日期>.md`),主表留一行指针 |
| 想让 bot 记"X 任务 SOP" | `memory(add, "X 任务步骤: ...")` | **建 skill**(`skill_manage create`),**让 nudge 提炼** |
| 想让 bot 记"复杂操作经验" | `memory(add, "复杂经验 200 字")` | **落 daily log + 写 skill 指针**;**别塞主表** |
| 想让 bot 记"长期项目知识" | `memory(add, "MMD 角色规则 200 字")` | **配 Holographic / Hindsight 外部 provider**(按需检索,不全量注入) |
| 想让 bot 记"项目背景/历史" | `memory(add, "项目背景 ...")` | **session_search 回溯 + FTS5 搜**(`gts-memory-search`) |

**判定口诀**:
- **是事实/偏好/约束 + 长期稳定** → USER.md / MEMORY.md(一行 + 指针)
- **是任务 SOP** → skill(程序性记忆)
- **是当日踩坑/对话原话** → daily log(episodic)
- **是项目长期知识** → 外部 provider(按需检索)
- **都不属于** → 别记,让 sync_turn 自动跑

---

## 🔴 主表条目约束(兄弟 2026-08-18 拍板)

**主表(MEMORY.md / USER.md)只允许**:
- **一行式结论** + **出处指针**(指向 daily / 笔记 / skill 名)
- **总长度 ≤ 字符硬限制**(默认 2200/1375,本机已调 8000/4000)

**禁止**:
- 把 SOP / 步骤 / 命令片段 / 详细诊断 / 踩坑经过写进主表
- 把"用户喜欢什么" / "今天的对话内容"塞主表
- 把"应该这么用工具"这种**指令性**内容塞主表(违反"declarative facts, not instructions"原则,memory 旧条已记)
- 一条占 2-3 行的,99% 该挪 daily
- 超过 3 行的,绝对挪 daily

**违反时**:兄弟提醒 → 把内容移到 daily → 主表只留结论 + 指针。

---

## 何时**应该**调 memory 工具(有限场景)

✅ 兄弟**明确说**"记 memory" / "记下来" / "记住这个"
✅ 主表需要新增 / 更新**用户偏好**或**环境事实**(且值 ≤ 1 行)
✅ 需要把某条 daily 内容**升级到主表**作为长期约束(合并 batch 操作)
✅ 兄弟纠正了 bot 行为 → **更新主表对应约束条目**(replace / remove)

**不要**:
- 把"今天对话" / "刚学的 X" / "临时 Y"塞主表
- 在主表写**指令**(让 bot 怎么做事)而不是**事实**(事实是什么)
- 一次 memory 调用塞 5 条 add(应单次 batch `operations` 数组)

---

## memory 操作纪律(实操)

1. **批量改动必须用单次 `memory` 调用 + `operations` 数组**(兄弟 2026-08-18 拍板)
2. **禁止拆成多次 add/replace/remove 单调用**(会触发 loop 警告 + 浪费 token)
3. **超 8000 字符时**先 remove / replace 旧条目腾位,再 add 新条目
4. **写入前自检 3 问**(兄弟拍板):
   - 是约束结论还是操作手册?(结论 → 主表;手册 → daily/skill)
   - 删掉细节后,凭一行字能知道查哪里吗?(不能 → 挪 daily)
   - 有"为什么/怎么操作/踩了什么坑/具体命令"吗?(有 → 挪 daily)

---

## 与其他 skill 的关系

- **`gts-memory-search`**:Desktop 形态的"准外部 provider"——读 state.db FTS5 + skills/ + 笔记/ 做按需召回,弥补无 prefetch hook。本 skill 主张"用机制",但**现实是 Desktop 没真 Holographic**,gts-memory-search 是现实妥协。
- **`gts-save-memory`**:写记忆的入口 skill(本 skill 之上)。
- **`desktop-notify-protocol`**:通知纪律(本会话 8/18 拍板:开干已知任务不通知,拍板才通知)。

---

## 反例(本会话 2026-08-18 实际踩坑)

### ❌ 反例 1:bot 反复 `memory(add, ...)` 堆主表

本会话开篇 4 轮:bot 试图把"doc 红线"写进主表,**展开了详细 SOP**(禁哪些命令、适用哪些扩展名、怎么落地),把"结论"写成"操作手册"——**违反"主表只一行 + 指针"**。兄弟质问"MEMORY.md 不是用来记这些的啊"。

### ❌ 反例 2:bot 调 4 次 memory 才腾位

兄弟要求落 doc 红线 → 主表 7760/8000 字符 → bot **拆 4 次单调用**(add / remove / replace / replace)→ 触发 loop 警告 3 次 + 浪费 token。

**正解**:单次 `memory` 调用 + `operations` 数组:
```js
memory({
  action: ...,
  target: "memory",
  operations: [
    { action: "remove", old_text: "<stale1>" },
    { action: "remove", old_text: "<stale2>" },
    { action: "add", content: "<new one-liner with pointer>" }
  ]
})
```

### ❌ 反例 3:bot 提"我帮兄弟封个 skill 来管 memory 写纪律"

兄弟 8/18 拍:bot 提"自检 3 问 / token 预检 / 回复模板必含自检"——**这是 bot 自创的低配版 Hermes 主动记忆机制**。正解:信任 `sync_turn` / FTS5 / nudge,**bot 不该自己造轮子**。

---

## 升级路径(未来)

- 短期:维持 gts-memory-search(DESKTOP 妥协版),跑 1-2 周观察召回质量
- 中期:兄弟装 Hermes CLI(走 CLI 跑),切真 Holographic / Hindsight,卸载 gts-memory-search
- 长期:兄弟原生体验 Hermes 主动记忆(同 CLI 模式),bot 完全不操心记忆机制
