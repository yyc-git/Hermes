---
name: "gts-save-memory"
description: "兄弟说「记忆」时触发。收集上下文→写daily log+笔记→git commit + push。被gts-submit-save/gts-save-flow调用。"
---

# gts-save-memory

> 触发：兄弟说「记忆」「保存记忆」「保存笔记」
> 或被 `gts-submit-save` / `gts-save-flow` 调用
> 只动 `笔记/memory/` + `笔记/`，git commit + push（HERMES_HOME 仓库）
> 🔴 **HEARTBEAT.md 已废弃（2026-08-18 兄弟确认）**：OpenClaw 遗留物，无实际用途，**不再更新**
> 🔴 Hermes 化(2026-08-17)：OpenClaw 已迁移归档。daily log 写入 `D:\Github\GTS-Play\笔记\memory\openclaw-archive\daily\`；MEMORY.md 持久规则写入 Hermes 系统记忆（hermes-home，用 memory 工具）或项目 `笔记/memory/`；通知用 `scripts\notify.ps1`

---

## 流程

### Step 1：收集记忆素材

在写任何文件前，先收齐全话记忆素材：

| 类别 | 收集来源 | 示例 |
|------|---------|------|
| **改了什么** | git diff --stat / commit 信息 | `前端房间列表排序改为按最后活跃时间降序` |
| **为什么改** | git log / 会话上下文 | `用户反馈房间列表找不到刚进房的房间，根因是只按创建时间排` |
| **关键决策** | 方案讨论 / 兄弟拍板 | `决定排序放前端做，不依赖后端排序` |
| **踩坑/教训** | 调试过程 / 问题修复 | `room-service dispose() 未解绑事件导致内存泄漏` |
| **新规则/协议** | 新增红线、工作协议 | `新规则：改排序必须加 E2E 验证` |
| **测试结果** | BDD / E2E 运行结果 | `BDD 全绿（32 pass），E2E 场景 3 全绿` |
| **部署/发布** | 部署了什么环境 | `room-service 部署到预发 v2.3.1` |
| **工作进度** | 当前 step 完成 / 下一步 | `Step B 完成，已进入 C（审核）阶段` |

### Step 2：按目的地分写

#### 2a. daily log — `D:\Github\GTS-Play\笔记\memory\openclaw-archive\daily\YYYY-MM-DD.md`

格式：
```markdown
## [YYYY-MM-DD HH:MM] <类别标签> <一句话标题>

**改动：** <改了什么文件/模块，具体改动>
**原因：** <为什么改>
**决策：** <做出的关键决策及其理由>
**踩坑：** <遇到的问题和解决方式>
**结果：** <测试结果 / 部署状态 / 当前进度>
```

**类别标签对照：**
| 标签 | 适用场景 |
|------|---------|
| `[开发]` | 新功能/修复/重构 |
| `[审核]` | 代码审核 |
| `[测试]` | E2E/BDD/集成测试 |
| `[部署]` | 部署/发布 |
| `[规则]` | 新规则/工作协议 |
| `[方案]` | 方案设计/讨论 |
| `[笔记]` | 知识整理/学习 |

**规则：**
- 🔴 只能用 `edit` 在文件末尾追加，禁止 `write` 覆盖
- 每次追加一条，不要合并多条
- 跟已有条目之间空一行分隔
- 无内容可写时标记「无变化」

#### 2b. 持久规则/教训 — Hermes 系统记忆（`memory` 工具 → hermes-home/MEMORY.md）或项目 `D:\Github\GTS-Play\笔记\memory\`

只有符合以下 **至少 2 条** 的才写入 MEMORY.md：
- 会影响未来决策（>2周有效期）
- 会被重复使用（流程/偏好/规则）
- 会造成明显损失（忘了会踩坑）
- 可操作、可验证（不是情绪感受）

格式：
```markdown
- 🔴 [规则/教训描述] — 原因/场景（时间）
```
放在对应分类下（工作协议 / 技术约束 / 项目规则等）。

> 如果 MEMORY.md 引用部分较长，更新后同步执行 `openclaw memory index` 重建索引。

#### 2c. ~~保存标记 — `HEARTBEAT.md`~~（已废弃 2026-08-18）

> 🔴 **不再更新 HEARTBEAT.md**：兄弟确认是 OpenClaw 遗留物、无实际用途。**跳过此步**，也不要往 daily log 里写 HEARTBEAT 引用。

### Step 3：保存笔记

- 项目知识 → 按类型归入 `笔记/` 下（`项目文档/`、`决策记录/`、`方案/`、`讨论记录/`、`代码笔记/`）
- 只写新知，不重写已有

### Step 4：git commit + push

```powershell
cd D:\\Github\\GTS-Play
Write-Host "=== 要提交的文件 ==="
git status --short -- 笔记/memory/openclaw-archive/daily/YYYY-MM-DD.md 笔记/memory/ 笔记/ 2>&1

# 🔴 禁止 git add -A
git add 笔记/memory/openclaw-archive/daily/YYYY-MM-DD.md
# 有笔记改动也加
git add 笔记/

git diff --cached --name-only  # 校验暂存区
git commit -m "save memory: <摘要>"
git push
```

#### 4b. Hermes Home git commit + push
```powershell
cd "E:\Hermes Agent CN Desktop\data\hermes-home"
git add MEMORY.md memories/
git diff --cached --name-only  # 校验暂存区
git commit -m "memory: <摘要>"
git push
```

> commit + push 一次完成。两个仓库（GTS-Play + Hermes Home）都提交

### Step 5：通知兄弟

```powershell
# Hermes 版(替代 OpenClaw 的 msg *): 桌面弹窗
powershell -NoProfile -ExecutionPolicy Bypass -File D:\Github\GTS-Play\scripts\notify.ps1 "兄弟，记忆已保存：<commit hash 前 7 位> — <摘要>" 60 "Hermes"
```

---

## 规则

| 指令 | 行为 |
|------|------|
| "记忆" / "保存记忆" | 仅 Step 1→2a→2b→4（2c HEARTBEAT 已废弃跳过） |
| "保存笔记" | 仅 Step 3→4 |
| 同时提到 | 全流程 |

## 🔴 纪律

1. 🔴 commit + push 一次完成
2. 🔴 daily log 只能用 `edit` 追加，禁止 `write` 覆盖
3. 🔴 禁止 `git add -A`，必须精确 add
4. 🔴 MEMORY.md 只写符合 4 条标准至少 2 条的规则/教训
