---
name: "gts-worktree"
description: "git worktree 管理:junction 共享 node_modules 免 install 秒建;worktree 慢根因(yarn.lock gitignore);建立/清理/踩坑。触发:兄弟说 worktree、建工作树、分支隔离开发"
---

# gts-worktree — worktree 建立/共享依赖/清理

> 背景:兄弟用 worktree 做分支隔离开发(OpenCode attach 并发污染根治方案,见 opencode-schedule 5️⃣)。2026-08-16 首次尝试失败拍板不用;2026-08-17 junction 方案实测通过。
> 完整方案:笔记/方案/2026-08-17-node_modules优化分析.md

## 🔴 先查记忆再动手(2026-08-17 教训)

兄弟说 worktree 相关需求时,**先检索已有笔记/记忆**(gts-memory-search):
- `笔记/memory/openclaw-archive/daily/2026-08-16.md` — 首次 worktree 尝试完整踩坑
- `笔记/方案/2026-08-17-node_modules优化分析.md` — junction 方案 + 实测结论
- `MEMORY.md` 的 worktree 条目

## 核心方案:junction 共享 node_modules(2026-08-17 实测通过)

worktree 建立后**不重新 yarn install**,用目录 Junction 共享主仓库 node_modules:

```powershell
# 1. 后台建 worktree(🔴 必须后台,见踩坑1)
git worktree add D:\Github\GTS-Play-wt-<名称> -b <分支名>
# 等 notify_on_complete 通知,不要 poll 前台

# 2. 秒建 junction(零复制、零 install)
New-Item -ItemType Junction -Path 'D:\Github\GTS-Play-wt-<名称>\node_modules' -Target 'D:\Github\GTS-Play\node_modules'

# 3. 验证依赖可用(不需要 install)
node -e "const t = require('three'); console.log('three OK', t.REVISION)"
```

### 实测验证结论(2026-08-17)

| 验证项 | 结果 |
|---|---|
| 根依赖 three/immutable/most | ✅ junction 后正常解析 |
| 工具链 ts-node/typescript/webpack/jest/@babel/core + .bin | ✅ 全部可用 |
| workspace 内部包(block) / tsx | ⚠️ **主仓库同样解析失败,非 junction 问题**(block 无 main 字段靠 tsconfig paths;tsx 不在根依赖) |

**判定原则**:worktree 解析失败的包,必须对照主仓库——主仓库也失败 = 非 junction 问题,不要误判。

### 🔴🔴 核心:根 junction 不够,必须级联嵌套 junction(2026-08-17 实测)

只 junction 根 node_modules 后跑 `yarn webpack:dev-server` 报 `Cannot find module '...\packages\frontend-multiplayer\node_modules\webpack-dev-server\bin\webpack-dev-server.js'`。根因:yarn 1 workspace 的 bin 解析用各 package 的**嵌套 node_modules**(.gitignore 排除,worktree checkout 后不存在)。解法:遍历主仓库 `packages/mods/demos/defaults/asset-lib/*/node_modules`(实测 357 个)全部级联 junction。**优先用 `scripts/worktree-junction.ps1`(内置此步骤,含 -Clean 清理)**,手工批量 junction 代码见 gts-worktree-junction skill。

### junction 方案边界(必须告知兄弟)

1. worktree 全新 checkout **无 mods 的 `dist/` 编译产物**(被 .gitignore)→ 首次使用需先构建
2. worktree 分支改 package.json 需新依赖 → 解链 junction 独立 install(或主仓库装完再共享)
3. 共享 `.cache` webpack 缓存可能互相干扰 → 建议 worktree 设独立 cache 目录
4. Junction 是 Windows 目录链接(非符号链接),`Get-Item` 显示 LinkType=Junction

## 🔴 踩坑清单(全部实测)

1. **`git worktree add` 必须后台跑**:GTS-Play 14356 个文件,前台 120s 超时被杀,留下半成品 + git 锁。`background=true + notify_on_complete=true`,约 3.5 分钟。
2. **超时被杀后 git 锁残留**:报 `Another git process seems to be running`。清锁:
   ```powershell
   # worktree 的 git 元数据在 .git/worktrees/<worktree目录名>/ 下(注意是目录名,不是分支名)
   Remove-Item 'D:\Github\GTS-Play\.git\worktrees\<目录名>\index.lock' -Force
   ```
3. **index 损坏时别硬修**:`git checkout -- .` / `git reset --hard` 反复报错 → 直接 `git worktree remove --force` + `git branch -D` 重建,别在坏 worktree 里折腾。
4. **删 junction 顺序**:先 `Remove-Item <worktree>\node_modules -Force`(删 junction 本身,不递归),再 `git worktree remove --force`,否则 Permission denied。删除后 `git worktree prune`。
5. **主仓库安全隔离原理**(兄弟会问):worktree 的 git 元数据在 `.git/worktrees/<name>/`,与主仓库 index 是两套文件;`git reset --hard` 只在 worktree 目录生效。操作前先展示主仓库 `git status` 完好。
6. **worktree add 慢的根因不是文件多,是 yarn.lock 被 .gitignore**(2026-08-16 实锤):新 worktree 无 lock → 全量解析被 npmmirror 限流无限 Retrying。junction 方案直接跳过 install 绕开此坑;若必须独立 install,先 `Copy-Item` 主仓库 yarn.lock 再装。
7. **yarn v1 缓存不支持并发写**(2026-08-16):两个 worktree 并行 install 互相破坏缓存(ENOENT .yarn-metadata.json)→ 必须串行。

## 清理流程(测试/用完)

```powershell
Remove-Item <worktree>\node_modules -Force -ErrorAction SilentlyContinue  # 先删 junction
git worktree remove --force <worktree路径>
git branch -D <分支名>
git worktree prune
git worktree list  # 验证只剩主仓库
```

## 验证(在 worktree 目录内)

```powershell
# junction 确认
Get-Item <wt>\node_modules | Select-Object LinkType, Target   # 期望 Junction
# 级联覆盖:主仓库嵌套 node_modules 数 == worktree junction 数(357/357)
# 依赖解析
node -e "for (const m of ['three','webpack','typescript']) { try { require.resolve(m); console.log('OK '+m) } catch(e) { console.log('FAIL '+m) } }"
# 终极验证:worktree 内 yarn webpack:dev-server 能起(兄弟实测通过)
```

## node_modules 体积诊断

worktree 慢/install 慢的伴生问题:node_modules 7GB 诊断与瘦身 → `references/node_modules-optimization.md`
