---
name: "gts-doc-redline"
description: "doc/ 和笔记/ 类文件的读/写区分纪律:读(grep / FTS5 / ripgrep / 不修改内容)= 自由;写(checkout / restore / reset / 重写 / 删)= 兄弟拍板。兄弟 2026-08-18 明确\"可能是我在维护\"+ \"笔记/可以 grep\"。同步 gts-submit-save 和 gts-git-commit 里的 doc/ 段落。"
status: "active"
trigger: "bot 准备对 doc/ 笔记/ 语雀知识库/ 下任何文件做读或写操作前必读。看到 git diff 出现 doc/ / 笔记/ 语雀知识库/ 文件时,先确认走读路径还是写路径。"
created: "2026-08-18"
umbrella: false
---

# gts-doc-redline

> 来源:兄弟 2026-08-18 拍板两段
> ① "doc/ 和 .org、.md 这些文件,可能是我在维护,你提交 git 时**直接提交它们啊**,不准 checkout 或者还原它们!如果你要还原某个文件,**必须要我确认**!"
> ② "笔记/你可以 grep,因为可以查到资料"
> 关联: `gts-submit-save` Step 1-② + `gts-git-commit` Step 4 + `gts-save-flow`

---

## 核心区分:读 vs 写

| 操作 | 类型 | 自由? | 规则 |
|---|---|---|---|
| `git status` 显示 doc/ / 笔记/ | 读 | ✅ | 看到就看到 |
| `git diff` / `git log` 看 doc/ 改动 | 读 | ✅ | 自由 |
| `git add doc/...` / `git add 笔记/...` | **写** | ✅ | **默认 add** |
| `git commit` 含 doc/ 改动 | **写** | ✅ | **直接 commit** |
| `git grep` / `ripgrep` / FTS5 召回 doc/ | 读 | ✅ | **不禁止** |
| `git checkout -- doc/...` | **写**(还原) | ❌ | **必须 notify 兄弟确认** |
| `git restore doc/...` / `git restore --staged doc/...` | **写**(还原/取消暂存) | ❌ | 同上 |
| `git reset HEAD doc/...` | **写** | ❌ | 同上 |
| `git reset --hard` (涉及 doc/) | **写**(不可逆) | ❌ | 同上 |
| `git clean -fd doc/` | **写**(删) | ❌ | 同上 |
| `write_file` / `patch` / 编辑 doc/ | **写**(重写) | ❌ | 同上 |
| grep `笔记/语雀知识库/` | 读 | 🟡 | **不 grep**(兄弟维护,doc 红线精神) |
| grep `笔记/` (非语雀知识库/) | 读 | ✅ | **可 grep**(兄弟明确"可以") |

---

## 默认行为(已与 gts-submit-save / gts-git-commit 同步)

### commit 阶段
- `git status` 看到 doc/ / 笔记/ 改动 → **直接 `git add doc/...` 一并提交**
- 不问、不 revert、不 restore
- 即使"看着像多余段落"也只 add+commit,不能 revert
- 提交前校验: 不应误 exclude doc/(默认包含)

### grep / FTS5 召回阶段
- `git grep` / `ripgrep` / FTS5 MATCH doc/ = **合法**(读,不算违反红线)
- **不** grep `笔记/语雀知识库/`(兄弟维护,doc 红线精神)
- **可** grep `笔记/(其他)`(兄弟明确"笔记/可以 grep")

---

## 触发 notify 的写操作(强制拍板)

bot 在执行以下任一操作**前**,**必须**先 `notify.ps1` 弹桌面 + msg 通知兄弟,**等明确确认**才执行:

| 操作 | 理由 |
|---|---|
| `git checkout -- doc/<file>` | 还原兄弟的版本日志 |
| `git restore doc/<file>` | 同上 |
| `git reset HEAD doc/<file>` | 从暂存撤(等价还原) |
| `git reset --hard` (若涉及 doc/) | 不可逆 + 跨文件 |
| `git clean -fd doc/` | 删未跟踪 doc 文件 |
| 任何 `write_file` / `patch` 改 doc/ 下文件 | 直接改内容 |
| 任何 `rm` 删 doc/ 下文件 | 删 |
| 任何覆盖写 doc/ 下文件 | 重写 |

**通知模板**:
```
Title: "doc/ 写操作需拍板"
Message: "要 [restore|delete|rewrite] doc/<file>,等兄弟确认。理由: <为什么>。回滚方法: <怎么做回滚>。🔴"
```

---

## 兄弟已明确允许的写操作(不需通知)

- `git add doc/...` / `git add 笔记/...`(提交场景)
- `git commit -m "..."` 含 doc/ 改动
- `git push` 含 doc/ 改动
- 兄弟**自己**改 doc/(这是兄弟,不是 bot)

---

## 实战对照(本轮)

| 时刻 | 应否 | 实际 |
|---|---|---|
| "doc/v2.0-alpha.13.org 是不是被还原过" — bot 查 git log | 读 | ✅ 自由 |
| bot 跑 `git diff doc/...` 看 v2.0 内容 | 读 | ✅ 自由 |
| `ripgrep` 命中 `笔记/daily/2026-08-18.md` | 读 | ✅ 自由(兄弟明确可 grep) |
| `ripgrep` 命中 `笔记/语雀知识库/` | 读 | ❌ 应避免 |
| bot 准备 `git checkout -- doc/...` | 写 | ❌ 必须先 notify |
| bot 准备 commit 含 doc/ 改动 | 写 | ✅ 直接 add+commit |

**0 错** — 本规则本轮没踩过坑,但**已记好防护**。

---

## Pitfalls

- 🔴 **"默认 add doc/"** 不等于 "可以 checkout doc/" — 一个是 commit 路径,一个是 restore 路径,完全相反
- 🔴 兄弟的 "默认 add" 不代表 bot 主动 add 不需要校验 — 仍要走 `git diff --cached --name-only` 确认
- 🟡 grep doc/ 不是写,所以跟 "doc 红线" 无关 — 别混淆
- 🟡 兄弟的 "笔记/可以 grep" 是 **笔记/ 整体**,不是 `笔记/语雀知识库/`(子集除外)
