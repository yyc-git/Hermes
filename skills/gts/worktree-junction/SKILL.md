---
name: "worktree-junction"
description: "git worktree + junction 共享 node_modules 秒建可用 worktree(替代 robocopy/install)。触发:建 worktree、worktree 太慢、worktree 装依赖、node_modules 过大、并发隔离。"
---

# worktree-junction — junction 共享依赖的 worktree 建立

> 2026-08-17 实测于 GTS-Play(Lerna monorepo:316 mods + 36 packages,14356 文件)。
> 一键脚本:`D:\Github\GTS-Play\scripts\worktree-junction.ps1`(含根 junction + 357 个级联嵌套 junction)
> 完整分析:`D:\Github\GTS-Play\笔记\方案\2026-08-17-node_modules优化分析.md`

## 触发场景

- 兄弟说「建 worktree」「worktree 太慢」「worktree 装依赖麻烦」
- OpenCode 并发隔离需要独立工作区(opencode-schedule 5️⃣ 规则:改 frontend/ 默认走 worktree)
- node_modules 过大导致 install 慢(7GB 案例)

## 为什么 junction 而非 install / 复制(实测对比)

| 方案 | 结果 |
|------|------|
| robocopy 复制 node_modules | ❌ 30min 只 1.26GB/6.9GB |
| worktree 内 yarn install | ❌ yarn.lock 在 .gitignore → 无 lock 全量解析被 npmmirror 限流无限 Retrying |
| **junction 共享主仓库 node_modules** | ✅ 秒建、零复制、无需 install |

## 🔴 核心:根 junction 不够,必须级联嵌套

只 junction 根 `node_modules` 后跑 `yarn webpack:dev-server` 报:
```
Cannot find module 'D:\Github\wt1\packages\frontend-multiplayer\node_modules\webpack-dev-server\bin\webpack-dev-server.js'
```
**根因**:yarn 1 workspace 的 bin 解析用各 package 的**嵌套 node_modules**(被 .gitignore,worktree checkout 后不存在)。根 junction 只覆盖顶层依赖。

**解法**:遍历主仓库 `packages/mods/demos/defaults/asset-lib/*/node_modules`(实测 357 个),全部 junction 到 worktree 对应位置。脚本已内置(5.5 步),验证标准:主仓库嵌套数 == worktree junction 数。

## 使用

```powershell
# 建 worktree(默认新分支 <Name>,junction 全自动)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\worktree-junction.ps1 -Name wt1
# 基于已有分支
powershell -File scripts\worktree-junction.ps1 -Name wt1 -Branch existing:dev
# 清理残留重来(无条件删同名分支 + 注册 + 目录 + 锁)
powershell -File scripts\worktree-junction.ps1 -Name wt1 -Clean
# 手动清理
git worktree remove --force D:\Github\wt1 && git branch -D wt1
```

## 合并回主仓库(worktree 任务完成后)

> 2026-08-17 state-circular fix 实测。worktree 的改动**必须 merge 回 dev**(兄弟会主动提醒——改 frontend 代码默认走 worktree,但测试/部署/验收都在 dev 上)。opencode-schedule 只提「完成后 merge」无具体流程,本节补齐。

### 合并前三查(缺一不可)

```powershell
cd D:\Github\GTS-Play
git merge-base dev wt1        # 1. 分支关系:等于 wt1 HEAD = wt1 是 dev 后代 → merge 干净零冲突
git log dev..wt1 --oneline    # 2. wt1 独有提交(空 = 改动未 commit,需先在 wt1 commit)
git status --porcelain | Select-String "business_layer/State|test/integration/xxx"   # 3. dev 工作区未提交变更是否涉及 merge 路径
```

- merge-base = wt1 HEAD(worktree 基于旧 dev 建、无独有历史)→ `git merge wt1` 三方合并只应用 wt1 的新 commit
- dev 工作区有大量未提交变更(其他任务)时:**禁止 stash/commit 别人的变更**;只要不涉及 merge 路径,git merge 正常执行

### 合并流程

```powershell
# 1. wt1:commit(只提交 staged 文件,防止误带临时文件)
cd D:\Github\wt1
git add packages/frontend/src/xxx test/integration/xxx "笔记/项目文档/changes/2026-08-17-xxx/"
git commit -m "fix: xxx (issue yyy)"
# 🔴 .opencode-brief*.md 不在 .gitignore(git check-ignore exit=1)→ 禁止 git add -A,用显式路径

# 2. dev:merge
cd D:\Github\GTS-Play
git merge wt1

# 3. 验证:目标文件内容已更新 + git log --oneline -2 显示 Merge commit
```

### 🔴 坑:OpenCode agent 可能残留 dev-server 占端口

B2 实现 agent 可能违规启动 dev-server(哪怕 brief 明令「不启动 dev-server」)验证页面,进程挂在 **worktree 路径**(`D:\Github\wt1\packages\frontend\node_modules\.bin\...webpack-dev-server.js`)且不退出 → 后续 M 阶段启动 dev 服务时 EADDRINUSE。

排查:**健康检查返回 200 ≠ 服务是你要的**,先查监听进程来源:
```powershell
$conn = Get-NetTCPConnection -LocalPort 7093 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
(Get-CimInstance Win32_Process -Filter "ProcessId=$($conn.OwningProcess)").CommandLine   # 路径含 wt1 = agent 残留
```
处理:确认是残留(agent session 已结束)→ Stop-Process 杀掉 → 重启 dev 服务。杀之前看启动时间/命令行,确认不是兄弟手动开的。

## 坑清单(全部实测,建 worktree 前必读)

1. **`git worktree add` 前台必超时被杀**(14356 文件 3-4min)→ 脚本内用 `Start-Process -Wait` 同步等待(不能用轮询 HasExited,见下)
2. **被杀后留 git 锁**:`.git/worktrees/<name>/index.lock` → 手动删;worktree 的 git 元数据在 `.git/worktrees/<名>`(**目录名不是分支名**,如 add -b test-junction 建到 wt-test 目录则路径是 worktrees/GTS-Play-wt-test)
3. **删残留目录前先删 junction**:`Remove-Item <wt>\node_modules`(junction)再 `git worktree remove`,否则 Permission denied
4. **`-Clean` 必须无条件删同名分支**:残留分支(worktree 注册已无)会挡 `worktree add -b` 报 `a branch named 'wt2' already exists`
5. **同分支不能重复 checkout**:`worktree add <path> dev` 报 `'dev' is already checked out at 'D:/Github/GTS-Play'` → 必须开新分支
6. **worktree 无 mods 的 `dist/` 编译产物**(.gitignore)→ 首次使用需先构建
7. **改 package.json 需要新依赖** → 删 junction 后独立 install,装完重建 junction
7a. **node_modules 部分损坏（如 @babel scope 被清空）** → 不需要重建 junction，只需在 GTS-Play 根目录跑一次 `yarn bootstrap`，junction 共享的物理 node_modules 恢复后所有 worktree 自动修复。验证：`(gci node_modules\@babel -Directory).Count` 应 >0，`Test-Path node_modules\.bin\jest.cmd` 应 True
8. **worktree 里跑 dev-server 与主仓库端口冲突**,不可同时跑同一服务
9. **dispatch 前检查 wt 内关键文件存在性**:基于旧 dev 分支的 worktree(如 wt1=07614c745、wt2=9e68824d0)可能缺新近新增的共享文件(docs/agent-context.md、笔记/项目文档/rules/test-standards.md、openclaw-archive/ 等)→ dispatch 前批量 `Test-Path` 确认;缺文件就把内容预置进 brief,别让 agent 在 wt 里空找(2026-08-17 state-circular fix 实测:wt1 齐全,但缺文件属正常,预检是习惯不是运气)

## 🔴 完成后必须 merge 回主仓库（2026-08-17 state-circular fix 教训，兄弟拍板）

> worktree 只是隔离工作区，**改动最终必须 merge 回 dev**。gts-dev-fix / gts-dev-feat / gts-dev-refactor 流程应在 M 阶段前（或流程结束前）自动执行 merge，不要等兄弟提醒（2026-08-17 实锤：B2 完成直接进 M，兄弟提醒「它的改动在 worktree 啊」才补 merge）。

### merge 步骤（worktree commit → 主仓库 merge → 验证）

```powershell
# 1️⃣ worktree 内 commit（只 add 本任务文件；.opencode-brief*.md 等临时文件不进）
cd D:\Github\wt1
git add <本任务改动文件/目录>
git commit -m "fix: <功能> (<issue 号>)"

# 2️⃣ 回主仓库 merge（先诊断分支关系，防意外带入）
cd D:\Github\GTS-Play
git merge-base dev wt1          # == wt1 HEAD → wt1 是 dev 后代，merge 干净
git merge wt1

# 3️⃣ 验证落地
git log --oneline -2            # 应见 Merge commit + wt1 的 fix commit
Get-Content <改动文件>           # 确认内容已更新
```

### 前置检查（merge 前）
- 🔴 dev 工作区未提交变更**不涉及** merge 路径 → git 允许 merge（`git status --porcelain | Select-String <路径>` 无输出）
- dev 工作区有他人未提交变更时**禁止 stash/commit**（opencode-schedule 纪律）——只要不涉及 merge 路径可直接 merge
- wt 分支基于旧 dev 时：merge-base == wt HEAD 说明 wt 是 dev 后代，三方合并只应用 wt 的新 commit，不会带回旧代码
- 冲突 → 手工解后 `git commit`（仅当 dev 前进期间同文件被改）

## 从 worktree 启动 dev-server（2026-08-19 兄弟拍板）

> 🔴 **必须用 `yarn webpack:dev-server`**，不能用 `npx webpack serve`。原因：项目 webpack 配置通过 yarn scripts 定制（dev-server 配置、环境变量、resolve 路径等），`npx webpack serve` 用默认配置会丢失自定义设置。

```powershell
# ✅ 正确：从 worktree 的 frontend 目录启动
cd D:\Github\<worktree>\packages\frontend
yarn webpack:dev-server

# ❌ 错误：npx webpack serve 用默认配置，丢失项目自定义设置
cd D:\Github\<worktree>\packages\frontend
npx webpack serve --port 7093
```

启动后验证：webpack 编译日志应显示 `compiled successfully`（无 ERROR），且 Content 目录指向 worktree 路径（`Content not from webpack is served from 'D:\Github\<worktree>\packages\frontend\src\resource'`）。

### 🔴🔴 实测重大坑：webpack 可能读主仓而非 worktree（2026-08-19 Scene.ts TDZ 修复实锤）

**现象**：在 worktree 目录启动 `yarn webpack:dev-server`，修改 worktree 里的源文件，浏览器报错不变（仍是旧代码）。

**根因**：webpack 的 source map 路径全部解析到 `../../../GTS-Play/...`（主仓），说明 webpack 实际在读 **GTS-Play 主仓的文件**，不是 worktree 的。即使 `cd` 到 worktree 目录启动 dev-server，webpack 的模块解析链（`resolve.modules: ['node_modules']`）通过 node_modules junction 回到主仓，可能导致源文件也解析到主仓。

**验证方法**：
```powershell
# 1. 启动 dev-server 后，从 bundle 确认文件来源
$resp = Invoke-WebRequest -Uri "http://localhost:7093/" -TimeoutSec 10
$mainJs = ([regex]::Matches($resp.Content, 'src="(static/js/main[^"]+)"'))[0].Groups[1].Value
$resp2 = Invoke-WebRequest -Uri "http://localhost:7093/$mainJs" -TimeoutSec 15
# 搜索你改的函数名，看 bundle 里是新代码还是旧代码
$resp2.Content -match "你的函数名"
```

**结论**：在 worktree 中测试前端代码**不可靠**——改了 worktree 的文件，webpack 可能读主仓的旧版本。**正确流程**：worktree commit → merge 回 dev → 从 dev 启动 dev-server 测试。

## 验证

```powershell
# junction 确认
Get-Item <wt>\node_modules | Select-Object LinkType, Target   # 期望 Junction
# 级联覆盖:主仓库嵌套 node_modules 数 == worktree junction 数
# 依赖解析(在 wt 目录内)
node -e "for (const m of ['three','webpack','typescript']) { try { require.resolve(m); console.log('OK '+m) } catch(e) { console.log('FAIL '+m) } }"
# 终极验证:worktree 内 yarn webpack:dev-server 能起(兄弟实测通过)
```

## 相关 skill

- `opencode-schedule`:worktree 隔离流程 + frontend/ 默认走 worktree 规则(2026-08-17 兄弟拍板)
- `windows-powershell-pitfalls`:PS 5.1 BOM/Start-Process 坑(脚本开发时踩)
- `gts-yarn-bootstrap`:worktree 依赖变更时的 install 纪律
