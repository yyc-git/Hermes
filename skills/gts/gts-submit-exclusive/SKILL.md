---
name: "gts-submit-exclusive"
description: "提交doc/和笔记/语雀知识库/的专属文件。skip-worktree机制已取消（2026-08-11），改为普通git status检测+提交"
---

# gts-submit-exclusive — 提交专属文件（doc/ + 笔记/语雀知识库/）

## 触发词

兄弟说以下之一时触发：
- `提交专属`
- `提交doc`
- `提交语雀`
- `提交笔记`
- `提交我的文件`
- `提交专属文件`

也接受兄弟的具体指令，如「提交笔记/语雀知识库/的全部改动」「提交 doc/design/xxx.drawio」

## 📌 背景实况（2026-08-11 更新）

⚠️ **skip-worktree 机制已取消（兄弟拍板 2026-08-11 13:02）：**

| 项目 | 之前 | 现在 |
|------|------|------|
| skip-worktree 标志 | ✅ 278 个文件全部 S | ❌ 已全部清除 |
| .gitignore 规则 | ✅ `doc/` + `笔记/语雀知识库/` | ❌ 已移除 |
| hooks（post-commit/checkout/merge） | ✅ 自动重打 S | ❌ 已改名 `.disabled` 禁用 |

**现在的行为：**
- `git status` / `git diff` / `git ls-files` 全部**正常可见** doc/ 和 笔记/语雀知识库/ 的改动
- 提交方式 = 普通 `git add` + `git commit`，无需 `-f`、无需 update-index
- 🔴 取消隔离后暴露的历史遗留（如 `D doc/v2.0-alpha.12.org`）：磁盘已删但 git 仍跟踪的文件，**默认不提交删除**，先列清单问兄弟决定

## 项目路径

- **工作目录**: `D:\Github\GTS-Play`

## 执行步骤

### 1️⃣ 检查改动（普通 git status）

```powershell
cd D:\Github\GTS-Play

# 设置 UTF-8 控制台编码（中文路径显示/操作正常）
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# 查看专属目录的改动（modified + deleted + untracked）
git -c core.quotePath=false status --short -- "doc/" "笔记/语雀知识库/"

# 未跟踪新文件（在专属目录内）
git -c core.quotePath=false ls-files --others --exclude-standard -- "doc/" "笔记/语雀知识库/"
```

**🔴 纪律：**
- `git status` 现在直接可信，不再需要 blob hash 对比（那是 skip-worktree 时代的检测方式）
- 发现 `D`（deleted）文件 → **不自动提交删除**，列清单问兄弟（可能是历史遗留或真实删除，由兄弟决定）
- 区分本次改动与历史遗留：拿不准就列出来问

### 2️⃣ 确认提交内容

列出改动文件清单。**不询问兄弟，直接自动提交全部改动**（新增/修改类；删除类按 Step 1 纪律先问）。

### 3️⃣ 暂存文件

```powershell
cd D:\Github\GTS-Play

# 普通 add 即可（不再需要 -f / update-index / skip-worktree）
git -c core.quotePath=false add -- "doc/<文件>" "笔记/语雀知识库/<文件>"

# 中文路径批量：写临时文件用 pathspec-from-file
$paths | Set-Content -Path .git\addpaths.txt -Encoding UTF8
git -c core.quotePath=false add --pathspec-from-file=.git\addpaths.txt
Remove-Item .git\addpaths.txt
```

**🔴 完全禁止 `git add -A`。** 根据改动清单精确 add 相关文件。

### 4️⃣ 提交前校验

```powershell
git -c core.quotePath=false diff --cached --name-only
```

确认暂存区只包含本次要提交的专属文件，不含代码改动。

### 5️⃣ 提交

```powershell
git -c core.quotePath=false commit -m "doc: <简述改动>"
```

提交信息格式：
- `doc:` 前缀
- 简述改动内容
- 改得多则空一行后详列

### 6️⃣ 汇报兄弟（🔴 禁止 msg * / notify.ps1 弹窗 — 2026-08-06 修复）

```powershell
# 🔴 禁止 msg *：msg.exe 弹窗是系统级模态消息框，强制抢焦点，
# 会把兄弟正在使用的 VS Code/Chrome 等前台窗口顶掉（用户感知为"程序被关闭"）。
# notify.ps1 的 WScript.Shell Popup（0x1000 置顶 + 模态）同样抢焦点，此 skill 不用。
# 提交完成直接在聊天会话中汇报，不弹任何桌面窗。
Write-Host "✅ 已提交：<commit hash> <简述>"
```

## 🔴 纪律

1. **🔴 禁止修改这些文件的内容** — 只负责提交，不改动内容
2. **🔴 禁止 `git checkout HEAD --` / `git restore` / `git clean -fd` 还原或清理任何内容** — 2026-08-11 兄弟确认纪律：修改/还原内容必须先列清单+原因 → 问兄弟 → 等确认后才执行；gts_auto 自动化执行时禁止修改/还原（只记录待反馈项）
3. **🔴 删除类改动（D 状态）不自动提交** — 先列清单问兄弟（历史遗留 vs 真实删除）
4. **🔴 默认自动提交全部新增/修改改动** — 不询问兄弟
5. **🔴 中文路径用 `Get-ChildItem` 获取实际文件名或用 `--pathspec-from-file` 写临时文件**
6. **如果当前 GTS-Play 仓库有未提交的代码改动** → 提醒兄弟决定是否分开提交
7. **🔴 禁止用 `msg *` 或任何模态弹窗通知兄弟** — 提交完成用聊天会话汇报即可（2026-08-06 实锤：msg.exe 弹窗强制抢焦点，兄弟感知为"程序被关闭"）

## 历史（2026-08-11 取消 skip-worktree 前的旧机制，仅存档）

- 之前 doc/ 和 笔记/语雀知识库/ 被 skip-worktree + .gitignore 双重隔离，git status/diff 不可靠
- 检测改动唯一方式 = blob hash 对比（`git hash-object` WC vs `git rev-parse HEAD:<path>`）
- 提交三步走：`git update-index --no-skip-worktree` → `git add -f` → `git update-index --skip-worktree`
- 2026-08-11 兄弟发现该机制（git update-index 操作 sub index）可能与 Chrome 窗口异常关闭有关 → 拍板取消机制
- 已废弃，不再使用

## 与 git 提交相关 skill 的关系

- **gts-submit-save** — 提交代码 + 记忆，不动专属文件
- **gts-git-commit** — 提交 + 推送，不动专属文件
- **gts-submit-exclusive**（本 skill）— 只提交专属文件，不动代码
