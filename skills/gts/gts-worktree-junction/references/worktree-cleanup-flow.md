# worktree-cleanup 标准流程

> 2026-08-20 兄弟拍板。沉淀到 worktree-junction skill 下。

## 触发时机

- **fix / feat / refactor skill 的 M-0 阶段**(进手动测试前)
- **gts-auto §7.2 步进循环** B / C1 / C2 / M 任一步骤完成前(全自动模式强制)
- **手工**:merge 回 dev 后立刻跑(不等下一步)

## 5 步硬流程(缺一不可)

```
1️⃣ git worktree remove <wt路径> --force    # 删实体
2️⃣ git branch -D <wt分支>                  # 删分支(防误用)
3️⃣ git worktree prune                       # 清 git 内部元数据
4️⃣ git worktree list                        # 二次确认只剩 dev
5️⃣ (全自动模式)通知兄弟 cleanup 完成        # desktop-notify-protocol
```

## 一键脚本

`scripts/worktree-cleanup.ps1`:

```powershell
powershell -File scripts/worktree-cleanup.ps1 -WorktreePath "D:\Github\wt1" -BranchName "wt1"
```

退出码:
- `0` = 成功,只剩 dev
- `1` = `git worktree remove` 失败(八成是 junction 没清)
- `2` = `git worktree list` 还有非 dev 残留

## 等价手工命令(脚本不可用时)

```powershell
git worktree remove D:\Github\wt1 --force
git branch -D wt1
git worktree prune
git worktree list
# 期望输出:D:/Github/GTS-Play  <commit>  [dev](唯一一行)
```

## 坑(2026-08-19 prop-modal-fix + 2026-08-20 实测沉淀)

1. **先 merge 后 remove**:`git worktree remove` 之前必须先 merge 或 cherry-pick,否则改动留在未合并分支被丢弃
2. **junction 必须先删**:worktree 里的 node_modules 是 junction → Windows 文件系统对跨盘 junction 删非空目录有怪行为 → `Remove-Item <wt>\node_modules -Force` 先删 junction,再 `git worktree remove --force`
3. **`--force` 必备**:有未提交变更时 git 默认拒绝 remove,强制删会丢改动 → **先确认 dev 已 merge**
4. **`-D` vs `-d`**:`-D`(大写)强制删未合并分支;`-d`(小写)会拒绝 → **必须用 -D**
5. **二次确认算行数**:`git worktree list` 输出行数 > 1 = 还有非 dev 残留(主仓库 1 行 + 残留 N 行 = N+1 行)
6. **兄弟硬偏好**:cleanup 是 merge 完成的**判定标准**,不是可选项。merge 完成 → cleanup 完成 → 才算任务落地

## 教训引用

- **2026-08-20 实锤**:XiaHui fix / feat / refactor 任务完成后 wt1 / wt2 / wt3-prop-fix 三个 worktree **都没删**,今早兄弟发现质问 → 落本流程
- **2026-08-19 prop-modal-fix**:wt3-prop-fix locked 残留,junction 删除失败让 git worktree remove 报 "Directory not empty" → 走 junction 先删 + 兜底 `cmd /c "rd /s /q"` 强删
- **2026-08-17 state-circular fix**:兄弟提醒"它的改动在 worktree 啊"才补 merge → 教训:**M 阶段前自动 merge 不许等兄弟提醒**

## 关联 skill

- 父 skill:`gts-worktree-junction`(脚本 + PowerShell 坑)
- 上游调用:
  - `gts-dev-fix` / `gts-dev-feat` / `gts-dev-refactor` M-0(2026-08-20 加的硬步骤)
  - `gts-auto` §7.2(2026-08-20 加的 cleanup 子步)
- 相关:`gts-git-commit`(merge 后 commit 流程)、`desktop-notify-protocol`(cleanup 后通知)
