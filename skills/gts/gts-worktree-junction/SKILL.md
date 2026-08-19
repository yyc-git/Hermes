---
name: "gts-worktree-junction"
description: "GTS-Play worktree 秒建 + junction 共享 node_modules(免 install)。触发:建 worktree、worktree 隔离、node_modules 太大/install 太慢、依赖共享。"
---

# gts-worktree-junction — worktree 秒建 + 依赖共享

> 2026-08-17 实测通过。解决「worktree 建立慢 / 每次都要重装 node_modules」的痛点。
> 背景:2026-08-16 曾尝试 robocopy 复制 node_modules 方案失败(兄弟拍板暂不用 worktree);2026-08-17 junction 方案实测成功。

## 触发词

- `建 worktree` / `worktree` / `开个 worktree`
- worktree 隔离(并发任务防污染,见 opencode-schedule 5️⃣)
- `node_modules 太大` / `install 太慢` / `依赖共享`

## 🔴 何时必须用 worktree：5 条触发规则（2026-08-18 实测强化）

> 兄弟原话："在 worktree 做，因为要修改 frontend/ 代码"——worktree 不是可选项，是**硬约束**。下表是必须 worktree 的 5 种情况，**任一命中 → 立即进 worktree，不要在主仓 dev 直接 dispatch**。

| 触发条件 | 原因 | 实测案例 |
|---|---|---|
| **任务涉及 frontend/ 代码改动** | opencode-schedule 5️⃣ 硬性规则（2026-08-17 兄弟拍板），attach 模式注入工作区全部未提交变更，单机代码改动有连锁影响 | 2026-08-18 xiahui-data-fix Phase D：改 step-1-mmddata.mjs(workflow) + 写回 mods/mmd-character-extend（MMDData.ts）→ 兄弟明说"在 worktree 做" |
| **跨多个代码区**（frontend + mods + mmd_tool 同时改） | 任一区可能跟并行 session 撞车；worktree 隔离=零污染 | 同上 Phase D 案例 |
| **issue 范围 ≥10 项**（如 §11.2 验收表 10 项） | 大改动 = 中途 agent 重启/stuck 时工作区已乱；worktree = 可丢弃重做 | 同上 |
| **派 OpenCode 前发现主仓 dev 有兄弟未提交改动** | dispatch 会把别人改动注入新 session 上下文（attach 注入未提交变更）；撞车 = 兄弟工作白费 | 通用防御 |
| **兄弟明确说"在 worktree 做"** | 绝对命令 | 任何时候 |

**判定前置 checklist（dispatch 前 30 秒过一遍）**：
- [ ] 任务涉及 frontend/ ？→ worktree
- [ ] 跨 ≥2 个代码区？→ worktree
- [ ] 主仓 dev 有未提交改动？→ worktree（或确认改动是自己的）
- [ ] issue §11.2 / 验收表有 ≥5 项？→ worktree
- [ ] 兄弟明说？→ worktree

**未命中 5 条中的任一** → 可以直接在主仓 dev 干（兄弟没明确要求就用 main，节省 worktree 切换成本）。

**worktree 选择**（2026-08-18 实测 wt1/wt2 已存在）：
- 现有 `wt1` / `wt2` 任一干净（无 ahead commit + 无冲突 untracked）→ 直接复用 + fast-forward 到 origin/dev
- 都不干净 → 新建 `wt3` / `wt4`（脚本 `-Clean` 先清残留）

**🔴🔴🔴 fast-forward 是入口纪律**（2026-08-18 实测）：进 worktree 后**第一步** `git fetch origin dev` + `git merge origin/dev --ff-only`。**不带 B2-2 / 最新算法改动的 worktree 跑脚本 = 用老算法，写不出新结果**（本次差点踩：wt1 落后 origin/dev 11 commit，包括 B2-2 算法改动，不 ff 就 dispatch = 浪费一轮）。

**📌 dispatch 前 readiness checklist（复用必做，2026-08-18 实测失败教训）**：

```powershell
# 1. 确认 wt1 已 fast-forward 到 origin/dev
cd D:\Github\wt1
$localHead = git rev-parse HEAD
$originDev = git rev-parse origin/dev
if ($localHead -ne $originDev) {
  Write-Host "❌ wt1 不在 origin/dev HEAD（$localHead vs $originDev），必须先 git merge origin/dev --ff-only"
  exit 1
}

# 2. 确认 junction 完好（jest 可跑）
Test-Path "packages\mmd_tool\node_modules\.bin\jest.cmd"  # 应为 True
& "packages\mmd_tool\node_modules\.bin\jest.cmd" --version  # 应输出 29.x.x

# 3. 确认工作区干净（不阻塞 dispatch，但有冲突要先解）
git status --porcelain

# 4. 确认 root .opencode-brief.md / .opencode-brief-<task>.md 唯一
Get-ChildItem -Filter ".opencode-brief*.md" -Force  # 多任务并行时 .opencode-brief-<task>.md 隔离

# 5. 写入 brief 到 wt1 根（不要写到主仓 / 系统 temp）
# 写到：D:\Github\wt1\.opencode-brief-<task>.md

# 6. dispatch 命令加 --dir D:\Github\wt1
opencode run $brief -m <模型> --attach http://localhost:4098 --title "<task>" --no-replay --auto --dir D:\Github\wt1
```

**🛑 反面教材（2026-08-18 xiahui-phaseD 实测）**：我只做了 fast-forward + jest 可用检查，**没有做第 4 步 brief 唯一性预检**。OpenCode agent 上线后**自己又读主仓 GTS-Play 的 `.opencode-brief-xiahui-b2-2.md`**（不同任务的 brief），误以为 wt1 没有改动、触发权限弹窗等待。等兄弟点 Allow 才复活，浪费 24 分钟。

**brief 防御性写法**（避免 agent 误读外部文件）：见 opencode-session-ops 第 1️⃣7️⃣ 节「防御性 brief 写法」。

--

只 junction 根 `node_modules` 后,在 worktree 里跑 `yarn webpack:dev-server` 报:
```
Cannot find module 'D:\Github\wt1\packages\frontend-multiplayer\node_modules\webpack-dev-server\bin\webpack-dev-server.js'
```
**根因**:yarn 1 workspace 的 bin 解析用各 package 的**嵌套 node_modules**(被 .gitignore,worktree checkout 后不存在)。根 junction 只覆盖顶层依赖,`packages/frontend-multiplayer/node_modules/` 等嵌套目录在 worktree 里是空的。

**解法**:遍历主仓库 `packages/mods/demos/defaults/asset-lib/*/node_modules`(GTS-Play 实测 **357 个**),全部 junction 到 worktree 对应位置。**脚本已内置(5.5 步,自动)**,手工做的话:

```powershell
# 批量级联 junction(每个 package 的 node_modules)
$main = 'D:\Github\GTS-Play'; $wt = 'D:\Github\wt1'
Get-ChildItem $main -Directory | Where-Object { $_.Name -in @('packages','mods','demos','defaults','asset-lib') } | ForEach-Object {
    Get-ChildItem $_.FullName -Directory | ForEach-Object {
        $srcNm = Join-Path $_.FullName 'node_modules'
        if (Test-Path $srcNm) {
            $rel = $_.FullName.Substring($main.Length).TrimStart('\')
            $dstNm = Join-Path $wt "$rel\node_modules"
            if (-not (Test-Path $dstNm)) { New-Item -ItemType Junction -Path $dstNm -Target $srcNm | Out-Null }
        }
    }
}
```

**验证标准**:主仓库嵌套 node_modules 数 == worktree junction 数(实测 357/357);worktree 里 `Test-Path packages\frontend-multiplayer\node_modules\webpack-dev-server\bin\webpack-dev-server.js` = True。

## 一键脚本(推荐)

`D:\Github\GTS-Play\scripts\worktree-junction.ps1`

```powershell
# 新分支(默认):建 D:\Github\wt1 + 分支 wt1 + junction 共享主仓库 node_modules
powershell -File scripts\worktree-junction.ps1 -Name wt1
# 基于已有分支(🔴 主仓库已 checkout 的分支如 dev 不能重复 checkout, 报 'already checked out')
powershell -File scripts\worktree-junction.ps1 -Name wt1 -Branch existing:dev
# 清理同名残留后重建
powershell -File scripts\worktree-junction.ps1 -Name wt1 -Clean
# 🔴 删除模式(2026-08-19 兄弟拍板):用完 merge 后删除 worktree
powershell -File scripts\worktree-junction.ps1 -Name wt1 -Remove
```

脚本内部流程:worktree add(后台跑)→ junction 链接 node_modules → 依赖验证(three/webpack/typescript 可解析即通过)→ 完成。退出码:0=成功 / 1=参数错 / 2=已存在 / 3=建立失败 / 4=删除失败。

### 🔴🔴🔴 worktree 用完即删纪律(2026-08-19 兄弟拍板,最高优先级)

> 兄弟原话:「不要一直建新的workTree啊,这样空间不够。修改worktree的逻辑:每次新建worktree,用完merge后删除worktree」
> 背景:2026-08-19 连续建 wt1/wt2/wt3/wt4 后兄弟叫停——每个 worktree 是 6.9GB node_modules junction + 14k 文件,越堆越多磁盘爆炸。

**硬规则(2026-08-19 兄弟拍板)**:
1. **worktree 用完 merge 回 dev 后,必须立即 `-Remove` 删除**,不留空闲 worktree
2. **复用优先于新建**:新任务先查现有 worktree 是否干净可复用(见 readiness checklist);都不干净才新建,用完即删
3. 删 worktree = `git worktree remove --force` + 删分支 + 删目录,junction 必须先删
4. 退出码 4 = 删除失败(目录残留)

**-Remove 内部顺序(2026-08-19 实测 verify 全 PASS,顺序关键)**:
1. 先删所有级联 junction(357 个嵌套 node_modules)+ 根 junction——`git worktree remove` 才能删非空目录
2. `git worktree remove --force`(失败不阻塞)
3. `git worktree prune`
4. 删分支 `git branch -D <名>`
5. 兜底 `cmd /c "rd /s /q"` 强删目录;仍残留 → exit 4

**删除路径的 2 个 PowerShell 坑(2026-08-19 实测)**:
- ❌ `Get-ChildItem ... | Where-Object { $_.LinkType -eq 'Junction' }` → 非 junction 目录 `$_.LinkType` 为 `$null`,`-eq` 报 `Object reference not set to an instance of an object` → 必须 `$null -ne $_.LinkType -and $_.LinkType -eq 'Junction'`
- ❌ `Remove-Item -ErrorAction SilentlyContinue` 在 `$ErrorActionPreference='Stop'` 下对 `$null` 抛异常 → 必须 try/catch 包裹或显式 `-ErrorAction Stop` + catch
- ❌ junction 残留会让 `git worktree remove --force` 报 `Directory not empty`(git 不删 junction)→ 必须先删 junction

**为什么免 install**:junction 是目录链接,直接共享主仓库已装好的 node_modules — 绕开 2026-08-16 三坑:
1. robocopy 复制 6.9GB node_modules 极慢(30min 才 1.26GB)
2. 无 yarn.lock(在 .gitignore)全量解析被 npmmirror 限流无限 Retrying
3. 并行 install 损坏 yarn v1 缓存

## 手工流程(脚本不可用时)

```powershell
# 1. 建 worktree(🔴 必须后台跑 + 长超时, 14356 文件 ~3.5min, 前台会超时被杀)
git worktree add D:\Github\GTS-Play-<任务名> -b <分支名>
# 2. junction 共享依赖(在 worktree 目录)
New-Item -ItemType Junction -Path .\node_modules -Target D:\Github\GTS-Play\node_modules
# 3. 验证
node -e "for (const m of ['three','webpack','typescript']) { require.resolve(m); console.log('OK', m) }"
# 4. dispatch 时 --dir D:\Github\GTS-Play-<任务名> → 零污染
# 5. 完成后 merge 回主仓库(同文件两边改过 → 手工解冲突)
```

## 实测验证结果(2026-08-17)

| 验证项 | 结果 |
|---|---|
| 根依赖(three/immutable/most) | ✅ junction 后正常解析 |
| 工具链(ts-node/typescript/webpack/jest/@babel/core) + .bin | ✅ 全部可用 |
| workspace 内部包(block 等) | ⚠️ 主仓库同样解析失败 → 非 junction 问题(无 main 字段,靠 tsconfig paths) |

## 边界与坑(实测确认)

1. **worktree 无 mods 的 dist/ 编译产物**(.gitignore)→ 首次使用需先构建
2. worktree 分支改 package.json 需要新依赖 → 解链 junction 独立 install 再重建
3. 共享 `.cache` webpack 缓存可能互相干扰 → worktree 设独立 cache 目录
4. **worktree add 前台超时被杀 → 留 git 锁残留**:`.git/worktrees/<name>/index.lock` + index 可能损坏 → 直接 `git worktree remove --force` + 重建,不要试图修 index

### 🔴 locked 残留恢复 SOP(2026-08-19 prop-modal-fix 实测,wt3-prop-fix 11:14 触发)

worktree-junction.ps1 默认前台跑 `git worktree add` 14356 文件 checkout → **Windows PowerShell 90s timeout** 常被杀 → wt 目录部分 checkout + `index.lock` 残留 + `git worktree list` 报 `locked`。

**恢复顺序(2026-08-19 实测可用,4 步)**:

```powershell
# 1. 清 lockfile(worktree add 残留;脚本内 -Clean 路径也会卡这里)
if (Test-Path D:\Github\GTS-Play\.git\worktrees\<wt-name>\locked) {
    Remove-Item D:\Github\GTS-Play\.git\worktrees\<wt-name>\locked -Force
}

# 2. -Clean 重跑脚本(脚本逻辑:worktree remove → 分支删 → worktree add → 357 junction)
powershell -File scripts\worktree-junction.ps1 -Name <wt-name> -Clean
# 脚本可能在 worktree remove 时报 "Directory not empty" → git worktree remove 不递归 → 手动清目录

# 3. 若 -Clean 跑后 wt 目录残留(junction 删除失败),"cmd /c rd /s /q" 强删
cmd /c "rd /s /q D:\Github\<wt-name>"

# 4. 重跑 worktree-junction.ps1 不带 -Clean(目录已清,新建)
powershell -File scripts\worktree-junction.ps1 -Name <wt-name>
```

**worktree readiness 验证(dispatch 前必跑)**:

```powershell
# 1. git worktree list 确认无 locked/prunable
git worktree list
# 期望:wt3-prop-fix 2dcd7b609 [wt3-prop-fix](无 locked/prunable)

# 2. junction 是否建好
Test-Path D:\Github\<wt-name>\node_modules\three  # True
Test-Path D:\Github\<wt-name>\packages\frontend\node_modules  # True

# 3. git index 是否有 tracked 文件(git ls-files)
git -C D:\Github\<wt-name> ls-files packages/frontend/src/.../City.tsx
# 期望:返回路径(空 = git index 空 = worktree checkout 失败,需要重做)
```

**任一项未通过 → 走恢复 SOP**。dispatch 后立即验证 worktree 可用(Test-Path + git ls-files)→ 两项 ✅ 才算 ready。

**根因分析**:worktree-junction.ps1 当前用 `Start-Process -Wait -PassThru` 同步等 `git worktree add`(行 91-92),但 PowerShell 父进程的 Start-Process 实际执行超时可能杀 subprocess 后留 lockfile。**根治需要改脚本(暂未改)**——用 background spawn + 轮询 HasExited,但脚本本身在 GTS-Play 仓 `scripts/` 目录,需单独派任务修。

**worktree dispatch 后的ready 验证 SOP(2026-08-19 实测,bot 责任)**:

```powershell
# 派工前 30 秒必跑(防止 wt 状态错但 bot 误以为 ready)
cd D:\Github\<wt-name>
$brief = Get-Content .opencode-brief.md -Raw -Encoding UTF8
if (-not (Test-Path .opencode-brief.md)) { throw "BRIEF 缺失" }
# ready 三件套:
Test-Path node_modules\three                           # junction OK?
git ls-files <改动目标文件> | Select-Object -First 1    # git index OK?
git status --short | Measure-Object | Select-Object Count  # 工作区干净?(可 0~少数 untracked)
# 三件套全 ✅ 才 dispatch
```
5. 清理 worktree 顺序:先 Remove-Item junction(node_modules)再 worktree remove --force,否则 Permission denied
6. **PS 5.1 编码坑**:给项目写 .ps1 必须 UTF-8 **with BOM**(write_file 默认无 BOM → PS 5.1 按 GBK 读中文 → 报 `Missing closing '}'`)。pwsh 7 ParseFile 检查不出此问题,必须实际 powershell.exe 跑一次验证
7. **PS 5.1 Start-Process -PassThru 坑**:轮询 HasExited 后 `$p.ExitCode` 可能为 null → 用 `-Wait` 同步等待直接规避
8. 不能 checkout 已被主仓库 checkout 的分支(dev 等)→ 新任务用 `-b` 新分支
9. worktree 操作不影响主仓库 dev 分支(worktree git 元数据在 `.git/worktrees/<name>/`,与主仓库 index 隔离);但清理时要小心别误删主仓库的 `.git/index.lock`

## 相关:node_modules 7GB 优化(2026-08-17)

实测 7GB 构成:**不是 mods 的锅**(316 个 mods 嵌套 node_modules 仅 19MB):

| 位置 | 大小 | 处理 |
|---|---|---|
| `packages/frontend-multiplayer/node_modules/.cache` | 2.23 GB | webpack 缓存,**可安全删除自动重建** |
| 根 node_modules 的 `.xxx-xxxx` yarn 残留(297 个) | ~598 MB | **可删**(`^\..+-\w{6,}$` 模式) |
| `file:` 外部依赖(vmd-physics-bake/pmx-reduce-face/bone-converter) | ~710 MB | 整体拷贝,需改造 |
| rescript/bs-platform 双版本 | ~500 MB | 10/12 并存 + 重复残留 |
| mods 源码(不含 node_modules) | 487 MB | mmd-character-extend 一个占 425MB(模型资源) |

**pnpm 迁移结论(暂缓)**:rescript 双版本 + 幽灵依赖 + 硬编码 node_modules 路径(build 脚本写死 `../../packages/logic/node_modules/rescript/...`)→ 迁移成本 2-5 个工作日,建议先跑前两刀,如需再开分支预演。

完整分析报告:`笔记/方案/2026-08-17-node_modules优化分析.md`
