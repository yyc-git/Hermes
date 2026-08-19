---
name: "ai-trust-existing-mechanisms"
description: "Bot 想在 reply / memory / 新 skill 里加自检流程/必含项/操作前请先 X 类指令性补丁前,或想 skill_manage(create) 新建 skill 前,或想切外部 memory provider(Holographic/Hindsight/Honcho/Mem0/OpenViking)前,先确认 Hermes 主动机制 + nudge + 已有 skill 是否已覆盖。避免造低配轮子污染回复流和记忆。"
---

# AI 协作:信任已有机制,不造轮子

> **触发**:bot 准备在 reply / memory / 新 skill 里加**指令性补丁**(自检流程 / 模板必含项 / 操作前自问 / 必加 X 自检句),先读本 skill。
> **类级别**:任何任务类(不绑 GTS-Play),只要涉及"要不要发明流程"判断都适用。
> **来源**:2026-08-18 兄弟纠正"你不是有记忆机制吗"——bot 在 reply 里造了"memory 写入三问 / token 预检 / 回复模板自检",全是已有主动机制的低配轮子。

---

## 核心问题

在加任何**指令性补丁**前,**自问 1 个问题**:

> **Hermes 主动机制 / nudge / 已有 skill 是否已覆盖这个功能?**

| 已覆盖 → 停手 | 未覆盖 → 才加 |
|---|---|
| "落 memory 前自检 N 问" | (典型:无) |
| "回复末尾加 X 自检句" | 改对应伞形 skill 的 SKILL.md body |
| "封新 skill gts-X" | skill_manage(action=create) |
| "操作流程必加 Y 步骤" | 改本 skill 的 SKILL.md 主体 |
| "必加 token 预检" | nudge + compression.threshold 已自动跑 |

---

## Hermes 已自动跑的机制(不重复造)

| 机制 | 覆盖什么 | 何时跑 | bot 不该造什么 |
|---|---|---|---|
| 每轮主动记忆 | 重要事实/偏好自动沉淀 | 每轮结束 | "落 memory 前自检" |
| nudge 提醒 | 触发"要不要保存" | 定期 | "操作前请先问 X" |
| compression.threshold | 8000 字符自动压缩 | 主表超阈值 | "token 预检 < 80 字符" |
| skill 自动提炼 | 成功经验转 skill | 复杂任务后 | "封 gts-X" |
| FTS5 全文检索 | 跨会话查历史 | session_search | "先 grep memory" |
| USER.md / MEMORY.md 加载 | 启动时自动注入 | 新会话 | "开局前读 X" |
| Hermes Honcho | 用户画像推断 | 持续 | "用 declarative 写用户" |

---

## 何时不造轮子(本轮已犯的反例)

- 落 memory 前自检 3 问 → 每轮主动记忆 + nudge 已覆盖 → 停手
- 回复末尾必含指向 daily 指针 → 污染回复流 + 改后续判断 → 别加
- 封 skill gts-memory-write-discipline → skill 自动提炼会处理 → 别封
- token 预检 < 80 字符留主表 → 8000 字符硬上限 + 自动压缩已跑 → 别加
- MEMORY.md 写"回复前先 X" → 违反 declarative facts 原则 → 别写

---

## 何时应该造轮子(允许的例外)

不是所有发明都禁止。**允许**的场景:

1. 业务特定规则(GTS-Play / 写书 / 微信导出):系统不知道的业务上下文,该加
2. 跨任务硬约束(兄弟拍板的 doc/ 不准还原红线):规则是兄弟命令式,系统不感知
3. 伞形 skill 改造(改 gts-save-memory 的 Step 1 写法):这是改 skill 不是造 skill
4. 真有缺口(系统没覆盖、本轮才发现的):先确认是真缺口,再写
5. **被动响应场景需要主动通知**(chat 列方案 ≠ 已通知):`desktop-notify-protocol` 已覆盖,不是新规则,**但 bot 容易把 chat 里的"列选项"当成"通知"**,这是常踩的伪覆盖

**判据**:这条规则是约束 / 业务上下文 / 真缺口 三类之一吗?不是 → 停手。

### "Chat 列方案 ≠ 已通知"(2026-08-18 实测)

兄弟拍板:`需要我确认的时候要发 msg 通知啊,记住啊:最高优先级`

**反模式**:列 3 选 1 升级方案给兄弟 → **只在 chat 列选项** → 兄弟质问"你怎么不通知我"。

**为什么这是"伪覆盖"**:已有 `desktop-notify-protocol` skill 已经说"必须发桌面通知",但我**把 chat 里的"列选项"误读为"已通知"**。chat 是被动通道,notify.ps1 是主动通道。

**自检**:
- 我列了方案 / 选 A B C / 问兄弟拍板 → **先 notify.ps1 再列**(不是先列再补通知)
- 通知失败 / 静默发不出 → fallback:重发 + 在 chat 顶部标"⚠️ 通知可能未送达"
- 口诀:**要拍板 = 先通知 = 最高优先级**,排在 token 节约 / 自动批量化前面

这条不是新规则,只是**老规则的常错点**——bot 默认会"忘了发通知",所以本节作为高优先级常错点单列。

---

## 操作纪律

写 reply / memory / 新 skill 前**先过 1 问**:

1. 这是不是指令性补丁?→ 是且 Hermes 已覆盖 → 停手
2. 这是不是业务特定 / 兄弟拍板 / 真缺口?→ 是 → 该加就加,**加到 SKILL.md body,不加到 reply 流**
3. 这是不是为已有机制造低配轮?→ 是 → 停手,信任系统

**写 MEMORY.md 前**也过这一问:MEMORY.md 是事实/偏好/约束,不是指令。"回复前先 X" "必加 Y 自检"是指令,污染记忆。

---

## 相关 skill 索引

- gts-save-memory:记忆保存伞形,本规则在该 skill 也有镜像(Step 2b 旁注 + 末尾"信任 Hermes 主动机制"节),但该 skill 是 created_by=None,agent 改不了,本 skill 是其可改副本
- gts-submit-save / gts-git-commit:git 提交伞形,本规则适用其 doc/ 保护段
- gts-memory-compress:8000 字符压缩,本规则的 token 预检是它的轮子,禁造

---

## references/

- references/2026-08-18-trust-mechanisms.md:本轮触发经过 + 兄弟原话 + 已废弃的低配轮子清单
