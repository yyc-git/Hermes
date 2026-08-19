---
name: "gts-memory-compress"
description: "兄弟说「压缩记忆」「压缩MEMORY.md」「记忆太大」时触发。压缩 MEMORY.md 减小上下文体积，保留最高优先级规则。"
---

# 压缩记忆 Skill（gts-memory-compress）

> 触发词：`压缩记忆` / `压缩MEMORY.md` / `记忆太大` / `MEMORY.md 压缩`
> 与 `gts-skill-reflect` Step 1d 的 MEMORY.md 健康检查配套（> 50 KB 超限 → 本 skill 执行压缩）。
> 定位：MEMORY.md 是核心索引（详细内容在 MEMORY-ARCHIVE.md + skills/ + 笔记/），压缩 = 索引化瘦身，不是删知识。

## 🔴 核心原则（不可违反）

1. **🔴🔴🔴★ 最高优先级规则完整保留**：带 ★ 的规则（`🔴🔴🔴★` / `🔴🔴🔴🔴🔴★`）一字不动保留在 MEMORY.md 原文，**只索引化非 ★ 规则**（兄弟 2026-08-05 拍板）
2. **先归档再删除**：非 ★ 规则完整文本必须先补进 MEMORY-ARCHIVE.md（或确认 skill 已固化完整版），才能压缩 MEMORY.md 里的正文。**禁止先删后补**
3. **可回滚**：压缩前确认 MEMORY.md 在 git HEAD（`git status` 无未提交改动，有则先提交），git 可回滚，不额外备份
4. **只压格式不丢内容**：索引行 = `- 🔴 [标题] 一句话核心 → 指向`，指向 = ARCHIVE 章节 / 对应 SKILL.md

## 触发条件

- MEMORY.md > 50 KB（健康线，2026-08-10 兄弟拍板：从 30 KB 改回 50 KB；命令：`[math]::Round((Get-Item ...MEMORY.md).Length/1KB, 1)`）
- 兄弟说「压缩记忆 / 压缩MEMORY.md」

## 步骤

### Step 0：状态检查
1. `process(action=list)` 确认无后台任务
2. `git status` 确认 MEMORY.md 无未提交改动（有未提交 → 先走 gts-submit-save 提交，再压缩，保证可回滚）
3. 记录压缩前大小：`[math]::Round((Get-Item MEMORY.md).Length/1KB, 1)`

### Step 1：分类工作协议区条目
- 读 MEMORY.md「📣 工作协议」区，逐条标注：★（保留原文） vs 非 ★（索引化）
- 非 ★ 规则确定去向：
  - skill 已固化（opencode-schedule / gts-code-review / gts-submit-exclusive / gts-e2e-test / gts-opencode-stop / gts-deploy-standalone）→ 索引只指向 skill
  - ARCHIVE 已有完整版（`Select-String -Path MEMORY-ARCHIVE.md -Pattern '<关键词>' -SimpleMatch -Quiet`）→ 指向 ARCHIVE
  - 都没有 → 标记「需补 ARCHIVE」，走 Step 2

### Step 2：补 ARCHIVE（先归档）
- 缺失完整文本追加到 MEMORY-ARCHIVE.md 末尾「📣 工作协议 — 2026-08 新增/移出规则完整文本」章节（首次创建该章节，后续追加）
- 命令：`Add-Content -Path MEMORY-ARCHIVE.md -Value $add -Encoding UTF8`
- 原文完整复制，不改写不浓缩

### Step 3：压缩工作协议区
- 非 ★ 条目替换为一行索引（标题 + 一句话核心 + 指向）
- ★ 条目原文不动
- 实现方式二选一：
  - **PowerShell 行级替换**（多条时推荐）：anchor 子串定位行 + `RemoveAt` 吞掉正文行，`[System.IO.File]::WriteAllLines($path, $lines, $utf8)`（UTF8Encoding($false) 无 BOM）
  - `edit` 工具小批量（每条 oldText 必须精确匹配，整块替换易因不可见字符失败 → 失败时降级用 PowerShell 单条 anchor）

### Step 4：事件块迁移
- MEMORY.md 末尾的「事件/教训记录」章节（如 bone_converter 实机复测失败）→ 完整移入 MEMORY-ARCHIVE.md 重要教训区
- ARCHIVE 迁移块末尾加 `> 检索锚点：<关键词列表>`（供 QMD 命中）
- MEMORY.md 不留正文，必要时在「关键新增锚点词」补词

### Step 5：杂项清理
- 重复/空壳编号条目删除（实例：Token 优化区 26 号「已废弃见 30 号」空壳）
- 误入其他章节的碎片 → 挪到合适位置（不丢信息；实例：入库标准区的 dispatch 速查碎片 → 「🔧 工具」新小节）
- 锚点词区一般不合并（省空间有限，动它风险大于收益）

### Step 6：验证（必须全过）
1. **★ 全部保留**：`(Get-Content MEMORY.md | Where-Object { $_ -match '★' }).Count` 与压缩前一致（人工比对关键 ★ 条目）
2. **关键内容抽查**（至少 10 项全 True）：CLI exit 0 / M阶段子fix / 静默判卡死 / 论坛 CloudBase / 单机部署 / yarn bootstrap / TDD 纪律 / attach 4098 / FK 约束 / 入口检查
3. **git diff --stat 合理**：MEMORY.md 净减、MEMORY-ARCHIVE.md 净增，无异常大段删除
4. **章节结构完整**：身份 / 检索协议 / 核心锚点词 / 分层读取入口 / 工作协议 / Token 优化 / 入库标准 / 关键新增锚点词 / 工具
5. 汇报格式：压缩前 → 压缩后（KB/行数）、省了多少、★ 保留数、改动内容摘要

## 📚 历史参考

| 时间 | commit | 结果 | 手法 |
|------|--------|------|------|
| 2026-07-27 | 4bbac6f | 25.5 → 11.4 KB（↓55%） | 工作协议 18KB 整体索引化，完整文本建 ARCHIVE「工作协议 — 详细内容」章节；Token 优化区完整保留 |
| 2026-08-05 | （本次） | 36.5 → 32.1 KB | 兄弟要求保留全部 ★ → 只索引化非 ★ 25 条 + 事件块迁移 + 杂项清理 |

## ⚠️ 教训

- **保留 ★ 时压缩空间有限**：MEMORY.md 最长文本规则（静默判卡死 80 分钟 / 单机部署 / CLI exit 0 / M阶段子fix）几乎全是 ★，必须保留 → 32KB 基本是「保留全部 ★」的上限
- 要更小只剩两块（都不是 ★，需兄弟拍板）：**Token 优化区**（27/28 重复合并、32-36 长文索引化，30 号「禁止子 session」注明与 ★ 同级需保留）、**分层读取入口表超长行**（技能自我反思 / issue 机制 / MMD VMD 统一压成 1 行）
- **禁止直接 write 重写整个 MEMORY.md**（300 行手写易漏）——用 edit 小批量或 PowerShell 行级替换
- **禁止把 ★ 规则索引化**（兄弟 2026-08-05 拍板）
- **禁止先删后补**（内容丢失风险）
- 大块 edit 匹配失败时（不可见字符差异），降级 PowerShell anchor 行级替换，不要反复试 edit
