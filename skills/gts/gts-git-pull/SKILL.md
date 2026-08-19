---
name: "gts-git-pull"
description: "兄弟说「拉取」「更新」「同步」时触发。拉取各项目仓库 git(GTS-Play/VibeCodingBook/MyData/PMXReduceFace)。2026-08-17 迁移改造:原 OpenClaw-whole 记忆/skill 同步逻辑已废弃(记忆/技能现由 Hermes 管理)。"
---

# Git 拉取 Skill(2026-08-17 迁移改造版)

> 触发词:`拉取` / `更新` / `同步`
> 与 `gts-save-flow`(推)成对,反向操作。
> 只做拉取,不做提交/推送。
> **2026-08-17 迁移改造**:原「拉取 OpenClaw-whole 同步记忆/skill」逻辑已废弃 —— 记忆/技能已迁移至 Hermes(`E:\Hermes Agent CN Desktop\data\hermes-home`)与项目 `笔记/`,不再从 OpenClaw-whole 同步。本技能仅保留**项目仓库拉取**功能。

## Step 0:GitHub 连通性检查(代理管理)

拉取前调用代理管理脚本确认 GitHub 可达:

```powershell
$script = "D:\Github\GTS-Play\scripts\clash-proxy-manager.ps1"
& $script
```

**脚本语义:**
- 先测 GitHub 连通性(raw.githubusercontent.com,404/403 也算可达)→ 可达则跳过切模式,直接输出 `github-ok`
- 不可达才尝试 Clash RESTful API 切全局(兼容 Clash Verge Rev 等有 external-controller 的环境)
- 都不可行 → 报错,提示在 Clash Party GUI 手动切模式

**⚠️ 当前环境(Clash Party / mihomo-party)**:无 REST API(external-controller 为空,走命名管道 gRPC),旧脚本的 9097 API 不可用。**不要**调用 `-Mode global` 强切(会报错),直接跑 `& $script` 靠连通性检测即可。

## Step 1:确认 stash(可选)

- 如果本地有未提交改动,先问兄弟要不要 stash 再拉:
  ```powershell
  git stash push -m "auto-stash before pull"
  ```

## Step 2:项目仓库 git pull

> GitHub 连通性检查通过(Step 0 输出 `github-ok`)后执行。

项目仓库清单(按需增删,路径 + 分支):

| 仓库 | 路径 | 分支 | 说明 |
|------|------|------|------|
| GTS-Play | `D:\Github\GTS-Play` | dev | 主项目(Lerna monorepo) |
| VibeCodingBook | `D:\Github\VibeCodingBook` | main | 写书项目 |
| MyData | `D:\Github\MyData` | master | 资料仓库(**默认分支是 master,不是 main**) |
| PMXReduceFace | `D:\Github\PMXReduceFace` | main | 开源减面工具 |

```powershell
$projects = @(
  @{ Path = "D:\Github\GTS-Play";      Name = "GTS-Play" },
  @{ Path = "D:\Github\VibeCodingBook"; Name = "VibeCodingBook" },
  @{ Path = "D:\Github\MyData";        Name = "MyData" },
  @{ Path = "D:\Github\PMXReduceFace"; Name = "PMXReduceFace" }
)

foreach ($p in $projects) {
  $path = $p.Path
  if (-not (Test-Path "$path\.git")) {
    Write-Output "⚠️ $($p.Name):$path 不存在或不是 git 仓库,跳过"
    continue
  }
  $dirty = git -C $path status --porcelain | Measure-Object -Line | Select-Object -ExpandProperty Lines
  if ($dirty -gt 0) {
    Write-Output "⚠️ $($p.Name):有 $dirty 个未提交改动,跳过拉取(先问兄弟怎么处理)"
    continue
  }
  Write-Output "--- pulling $($p.Name) ---"
  git -C $path pull --ff-only
  if ($LASTEXITCODE -ne 0) {
    Write-Output "⚠️ $($p.Name) pull 失败(可能是分叉需 merge/rebase),先问兄弟再处理"
  }
}
```

**纪律:**

- **只拉不推**:项目仓库出现新 commit 是兄弟/OpenCode 推的,拉回来即可
- 有未提交改动 → **跳过该仓库并问兄弟**,不自动 stash/checkout
- pull 失败(非 fast-forward)→ 不自动 merge/rebase,问兄弟
- 汇报时逐个列:拉了多少 commit(`git log --oneline HEAD@{1}..HEAD`)+ 是否有跳过/失败

## Step 3:处理冲突

- 如果拉取失败或有冲突:
  - 列出冲突文件清单
  - 问兄弟如何处理(保留本地/接受远程/手动合并)
- 成功则继续

## Step 4:通知完成

- 列出各项目仓库的拉取结果:新增 commit 数 + 跳过/失败项
- 通知兄弟:拉取完成 + 改动内容

---

## 执行纪律

0. 只拉项目仓库 git;**不再同步 OpenClaw-whole 记忆/skill**(2026-08-17 迁移后废弃)
1. 不跟 `gts-save-flow` / `gts-git-commit` 混用
2. **本地有未提交改动时先问兄弟**,不自动 stash
3. 冲突情况下不自动解决,问兄弟
4. 拉取完成后通知兄弟
5. **当前环境(Clash Party)无 Clash REST API**:不要强切全局模式,靠 GitHub 连通性检测;若 GitHub 不可达且脚本报错,提示兄弟手动在 Clash Party GUI 切换
6. 项目仓库有未提交改动或 pull 失败时跳过并问兄弟,禁止自动 stash/merge
