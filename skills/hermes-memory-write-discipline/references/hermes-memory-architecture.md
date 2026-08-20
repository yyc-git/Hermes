# Hermes Agent 记忆架构详解(外部权威资料摘要)

> 来源:2026-08-18 兄弟贴的《Hermes Agent 永久记忆方案深度分析》(搁浅的鸽子,2026-06-01)
> 用途:本 skill `SKILL.md` 提到 "详见 references/hermes-memory-architecture.md" 时查这个
> 写作要求:精简摘要,只摘本次会话用得上的机制部分,不复制完整长文

---

## 双层架构(核心)

### 第一层:内置(Always Active)

- **文件**: `~/.hermes/memories/MEMORY.md`(Agent 笔记)+ `USER.md`(用户画像)
- **格式**: `§` 分隔条目,纯文本,人类可读
- **容量**: MEMORY **2200  字符 / USER 1375 字符**(**字符硬限制**,非 token)
  - 注:本会话实测已调到 30000 字符(兄弟 8/18 操作);默认 2200
- **注入方式**: 会话启动时**一次性快照注入**到 system prompt,后续冻结不变(保护 prompt cache)
- **工具**: `memory` 工具(add / replace / remove),会话中写入即时持久化
- **并发保护**: fcntl 文件锁 + 原子化 rename
- **漂移检测**: 检测外部修改(patch/手动编辑),**拒绝写入防止数据丢失**
- **注入防护**: 加载时扫描威胁模式,可疑条目用 `[BLOCKED]` 占位替换

### 第二层:外部 Provider(可选,最多一个)

通过 `MemoryProvider` ABC 接口接入;**内置 8 个可选插件**:

| 插件 | 类型 | 核心能力 | 本地模式 | 成本 |
|---|---|---|---|---|
| Honcho | 用户建模 | 多轮辩证推理 + 会话摘要 + Peer 建模 | ✅ | 本地免费 / 云免费层 |
| Hindsight | 知识图谱 | 实体解析 + 多策略检索 + LLM 合成 | `local_embedded` | 仅 LLM API |
| Mem0 | 语义搜索 | 向量检索 + 重排序 + 去重 | ❌ | 云免费层 |
| **Holographic** | **结构化事实** | **SQLite FTS5 + 信任评分 + HRR 组合** | **✅ 纯本地** | **零** |
| Supermemory | 语义存储 | 容器标签 + 多容器 + 自动捕获 | ❌ | 云 API |
| ByteRover | 知识树 | 层级知识树 + 分层检索 | ✅ 本地优先 | 零 |
| RetainDB | 混合搜索 | Vector + BM25 + 重排序 7 类记忆 | ❌ | $20/月 |
| OpenViking | 文件系统式 | `viking://` URI 寻址 + 语义搜索 | ✅ 纯本地 | 零 |

**由 MemoryManager 统一编排生命周期**;提供额外工具、turn 级前/后钩子、会话钩子。

---

## 生命周期(6 步)

1. **`initialize()`** — 会话启动,建立连接,创建资源
2. **`system_prompt_block()`** — 静态提示词注入(内置记忆全量进 system prompt)
3. **`prefetch(query)`** — **每轮前自动召回相关记忆**(这是兄弟问"为什么不 grep state.db"时我意识到的"bot 等价实现")
4. **`sync_turn(user, assistant)`** — **每轮后同步对话内容**(这是 `nudge` 的核心,自动把值得记的写进 MEMORY.md)
5. **`get_tool_schemas()` / `handle_tool_call()`** — 暴露记忆工具给模型
6. **`shutdown()`** — 会话结束时清理

**可选钩子**:
- `on_turn_start` / `on_session_end` / `on_session_switch`(`/resume`, `/branch`, `/reset`)
- `on_pre_compress` — 上下文压缩前提取要点
- `on_memory_write` — 内置 memory 工具写入时镜像到后端
- `on_delegation` — 子 Agent 委托完成时观察

---

## 关键机制与特点

### 主动记忆与遗忘
每轮对话后 Hermes 主动判断并提炼值得记住的信息。**nudge** 机制定期提醒自己保存重要内容。

### 程序性记忆(Skill)⭐
执行完复杂任务后,**自动将执行轨迹提炼成可复用的 Markdown Skill 文件**。实现经验沉淀。本会话创建的 `gts-memory-search` 就是这个机制产出的示例。

### 用户建模(Honcho)
自动从互动中推断并建立用户画像,实现个性化。

---

## 内置记忆的 9 个缺点(兄弟问的核心问题)

1. **无结构化存储** — 扁平条目列表,无模式/分类
2. **无语义搜索** — 全量注入每次对话,不支持按需检索 ← **本会话 `gts-memory-search` 解决**
3. **容量极小** — 2200 + 1375 = 3575 字符,实际 10-15 条信息
4. **无去重** — 同名条目不自动合并
5. **无自动提取** — 需 Agent 手动调 memory 工具写入 ← **本会话核心纠正:应信任 `sync_turn`**
6. **无时间衰减** — 旧信息不自动降权
7. **无信任评分** — 不可区分可靠 vs 过时
8. **冻结期盲区** — 同一会话中写入的信息对当前会话不可见(下次会话才生效)
9. **无知识图谱** — 实体间无关联

---

## 业界趋势(对比参考)

- **Letta**(`原 MemGPT` ⭐23k):虚拟内存分页,核心记忆块 + 归档 + 自编辑
- **Mem0** ⭐57k:通用记忆层,2026-04 新算法 LoCoMo 准确率 71.4→91.6
- **Cognee** ⭐17.6k:知识图谱记忆
- **Zep** ⭐4.6k:会话历史 + 用户/AI 持续画像

**短期建议**(本资料): 提升内置容量 + 装 Hindsight `local_embedded` 作为外部 provider
**本会话实际方案**(兄弟拍 C): 写轻量 `gts-memory-search` skill 模拟 `prefetch(query)` 行为,等 1-2 周观察召回质量

---

## 为什么本资料对 bot 重要

兄弟贴这份资料时,bot **正在犯**"无自动提取 = 我应手动调 memory 工具"的错误。**资料 #5 缺点正解**:
- "需 Agent 手动调 memory 工具写入" — 这是**缺点**,不是"建议手动调"
- 正确做法 = **信任 `sync_turn` + nudge** + **按需用 `prefetch` 召回**(用 state.db FTS5 模拟)
- bot 反复 add 主表 = **强化了这个缺点**,违反机制设计意图

**本 skill 解决**:
- 原则 1 告诉 bot "别再手动调 memory 工具" — 信任 `sync_turn`
- 原则 2 告诉 bot "主表只放一行 + 指针" — 解决容量小问题
- `gts-memory-search` skill 提供"按需召回" — 弥补无语义搜索
