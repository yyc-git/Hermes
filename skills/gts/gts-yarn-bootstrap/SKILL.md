---
name: "gts-yarn-bootstrap"
description: "安装GTS-Play依赖：yarn bootstrap（含杀残留/清node_modules/锁文件恢复/死等到完成）。可调用更新依赖"
---

# gts-yarn-bootstrap — 安装/更新依赖

## 触发词

兄弟说以下之一时触发：
- `安装依赖`
- `装依赖`
- `yarn bootstrap`
- `依赖更新`
- `install deps`
- `npm install`（此时也要纠正成 yarn bootstrap）

其他 skill 或流程中也通过引用本 skill 来调用依赖安装步骤。

## 项目路径（两个项目，先确认是哪个）

| 项目 | 工作目录 | 锁文件 | 说明 |
|------|---------|--------|------|
| **GTS-Play** | `D:\Github\GTS-Play` | `package-lock.json`（**已跟踪**，需还原） | Lerna + yarn workspaces，游戏项目 |
| **Meta3D** | `D:\Github\Meta3D` | `yarn.lock`（**被 .gitignore 忽略，无需还原**） | Lerna 4 + yarn workspaces，公开开源仓库，模组编辑器 |

判定方法：看当前任务上下文；或直接 `git -C <路径> rev-parse --show-toplevel`。

## 🔴🔴🔴🔴🔴 强制规则（2026-07-24 重大教训衍生）

**装依赖只能用 `yarn bootstrap`（或 Meta3D 下等价命令），禁止 `npm install`**。两个项目都是 Lerna monorepo，必须用 yarn 做包链接。违反后果：兄弟会立刻指出来。

## ℹ️ 重要前提

**`yarn bootstrap` 只是安装/链接已声明的依赖。如果需要新加依赖，必须先手动改对应包的 `package.json` 再加依赖字段，再跑 yarn bootstrap。**

场景区分：
- **首次安装 / 重装依赖**：直接走标准步骤
- **加新依赖**：先手动改 `<包路径>/package.json` 加入需要的包名+版本，再走标准步骤
- **更新依赖版本**：手动改 `<包路径>/package.json` 中版本号，再走标准步骤
- **子 skill/流程调用**：如果 OpenCode 改了 package.json，自动通知我执行 yarn bootstrap

## 前置检查

1. **确认无并发依赖安装进程**
   ```powershell
   tasklist /fi "ImageName eq yarn.exe" 2>nul
   # Get-Process | Where-Object {$_.CommandLine -match 'yarn|install'}
   ```
   如果有其他 yarn 进程，先等它跑完，或精确杀进程（禁止用 `Stop-Process -Name node,yarn` 无过滤杀）。
   ⚠️ **yarn 后台残留进程坑**：`yarn bootstrap` 内部 yarn install 可能作为独立进程残留（实例：PID 14544 在 lerna 显示 Done 后仍跑 10+ 分钟），且会干扰后续 install（yarn mutex 排队 + lockfile 竞争）。判断方法：`Get-Process | Where-Object {$_.CommandLine -match 'yarn.js'} `，残留就等它自然结束，不要杀（杀会导致 yarn.lock 写坏）。

2. **确认无 git index.lock 冲突**
   ```powershell
   Test-Path <项目根>\.git\index.lock
   ```

## 标准步骤

### 1️⃣ 杀残留进程（如果节点认为有必要）

```powershell
netstat -ano | findstr ":4003 :3000 :8093"
```

用 `Stop-Process -Id <PID>` 精确杀占用 node_modules 的进程
**🔴 禁止用 `Stop-Process -Name node,yarn` 无过滤杀** — 会杀掉 OpenClaw gateway

### 2️⃣ 还原锁文件（⚠️ 分项目）

**GTS-Play**（package-lock.json 被 git 跟踪）：
```powershell
git -C D:\Github\GTS-Play checkout -- package-lock.json
Test-Path D:\Github\GTS-Play\package-lock.json
```

**Meta3D**（yarn.lock 被 .gitignore 忽略）：**跳过此步**，`git checkout` 会报错。直接走第 3 步。

### 3️⃣ 开跑（⚠️ 分项目）

**GTS-Play**：
```powershell
cd D:\Github\GTS-Play && yarn bootstrap --mutex network
```

**Meta3D**：
```powershell
cd D:\Github\Meta3D && yarn bootstrap --mutex network
```
- Meta3D 根 `bootstrap` script = `lerna bootstrap`（lerna 4，root only 模式，实际内部调 yarn install）
- 🔴 **踩坑（2026-08-07）**：若 `yarn run bootstrap` 报 `The "bootstrap" command was removed by default in v7`（错误文案像 lerna v9，但本地 lerna 是 4）——通常是**残留 yarn install 进程干扰**（yarn mutex 等待异常）。绕过方案：直接 `node node_modules\lerna\cli.js bootstrap --mutex network` 或 `yarn install --mutex network`

**⚠️ 用 `exec` 开跑，`timeout` 必须设 0（不限时）** — 内容量大，不能用默认 30s。**Meta3D 全量重装可长达 12+ 分钟（实测 740s）**。

### 4️⃣ 🔴 Meta3D 专属：resolutions 缓存坑（2026-08-07 实锤）

**现象**：改根 package.json `resolutions`（如 jest ^26 → ^29）后跑 yarn install，yarn.lock 里范围合并了 `jest@^29.7.0` 但**解析版本仍是旧版**（26.6.3），node_modules 装出来的还是旧版。

**原因**：yarn 1 的 lockfile 缓存不会因 resolutions 变化自动重解析。

**解决**：
```powershell
Copy-Item yarn.lock yarn.lock.bak-jest29   # 备份
Remove-Item yarn.lock
yarn install --mutex network               # 全量重解析，超慢但必做
```
装完验证：
```powershell
node -e "console.log(require('<根>/node_modules/jest/package.json').version)"
```

### 5️⃣ Meta3D jest 29 统一升级配套（2026-08-07 实操清单）

Meta3D 根 resolutions 曾锁 jest ^26，各包声明 ^25/^26 混杂。统一升 29 需**同时**改（只改 jest 会踩 ts-jest/jest-cucumber 兼容坑）：
- 根 `resolutions`: `jest` → `^29.7.0`、`jest-environment-jsdom` → `^29.7.0`
- 各包 `devDependencies.jest` → `^29.7.0`（`^25.2.3/^25.2.7/^26.4.2` 全部替换）
- 各包 `devDependencies.ts-jest`（`^26.1.4`）→ `^29.2.5`
- 各包 `devDependencies.jest-cucumber`（`^3.0.1`）→ `^4.1.0`（3.x 不兼容 jest 29）
- `defaults/meta3d-bs-jest` 的 `dependencies.jest`（`24.3.1`）→ `^29.7.0`（无包依赖它，但保持统一）
- 批量改 JSON 用无 BOM UTF-8 读写：`[System.IO.File]::ReadAllText/WriteAllText` + `New-Object System.Text.UTF8Encoding($false)`（PS 5.1 的 Set-Content -Encoding UTF8 会写 BOM 破坏 JSON）
- 改完必须走第 4 步删锁重装，否则 resolutions 不生效

## 🔴🔴🔴 纪律（必须一字不差遵守）

1. **开跑后必须一直等到完成或报错，绝不能中途杀进程换方式**
2. **monorepo 的 workspace aggregator 在 [3/4] Linking dependencies 阶段尤其慢**，这是正常行为
3. **yarn 本身就慢**（网络下载 + npm 缓存 + 杀毒软件扫描），CPU 不动不代表卡住
4. **禁止中途 kill 后换 npm install 或其他替代方案** — 必须等 yarn 自己跑完
5. **失败停下来汇报，不自作主张修**

### 2026-07-24 踩坑教训

- 跑 `yarn install` 卡在 [3/4] Linking dependencies 很久 → 错误地 kill 了 → 换成 `npm install`
- 实际上 workspace aggregator 在大型 Lerna monorepo 就是这样的，等够时间就能过
- **正确做法**：一次 kill 后，重建步骤，重新 `yarn bootstrap --mutex network`，然后死等

### 2026-08-07 Meta3D 追加教训

- exec 后台 session 可能只是残留空 shell（命令没进去）——启动后先确认 `Get-Process` 有 node/yarn 子进程在动，别对着空 shell 死等
- lerna 显示 `Done in 66s` 但内部 yarn install 进程可能还在后台跑（独立 PID），会干扰下一次 install
- 删 yarn.lock 全量重装是最慢但最干净的路，不要尝试部分更新 lockfile

## 6️⃣ Yarn 缓存损坏诊断与修复（2026-08-19 实测）

**现象**：`yarn install` 成功（exit 0），但关键包是空壳——目录存在、`package.json` 在、`main` 字段指向 `./lib/index.js`，但 `lib/` 目录不存在。jest 无法启动（`Cannot find module`），`@babel/code-frame` 缺失导致 jest 报 ENOENT。

**诊断命令**（安装后立即验证）：
```powershell
# 检查关键包完整性
Test-Path "node_modules\@babel\code-frame\lib\index.js"   # 应为 True
Test-Path "node_modules\jest\bin\jest.js"                  # 应为 True
Test-Path "node_modules\.bin\jest.cmd"                     # 应为 True
node node_modules\jest\bin\jest.js --version               # 应输出版本号
```

**根因**：C 盘空间不足时，yarn 下载的 tarball 解压不完整（ENOENT: no such file or directory），缓存里存了残缺包。后续 `yarn install`（不带 `--force`）认为"已最新"不重新下载，继续用坏缓存。

**修复流程**：
```powershell
# 1. 清 yarn 缓存（C 盘空间释放 + 去掉坏缓存）
#    ⚠️ yarn cache clean 极慢（6826 目录可超 120s），直接删更快：
cmd /c "rd /s /q C:\Users\Administrator\AppData\Local\Yarn\Cache"
cmd /c "rd /s /q C:\Users\Administrator\AppData\Local\npm-cache"

# 2. 检查 C 盘空间（需 ≥5 GB 才够重装）
"{0:N2} GB 可用" -f ((Get-PSDrive C).Free/1GB)

# 3. 删残缺的 node_modules
Remove-Item "D:\Github\GTS-Play\node_modules" -Recurse -Force

# 4. 强制重装（必须 --force，否则 yarn 用坏缓存的 integrity 跳过下载）
yarn install --force --ignore-scripts --mutex network
#    --force: 强制从缓存重新解压（缓存已清=重新下载）
#    --ignore-scripts: 跳过 postinstall（如 gentype.exe 找不到），只做 linking

# 5. 验证（同诊断命令）
```

**⚠️ `--force` vs 不带 `--force`**：
- 不带：yarn 检查 lockfile integrity → 与 node_modules 对比 → 一致就跳过（即使文件是坏的）
- 带：强制重新解压所有包（从缓存或重新下载）

**⚠️ `--ignore-scripts` 适用场景**：
- postinstall 脚本报错（如 `gentype.exe not found`、`@parcel/watcher build-from-source.js` 缺失）
- 只需要包文件 + .bin 链接，不需要 postinstall 构建
- 跳过 scripts 不影响 jest/tsc 等 dev 依赖的功能

## 7️⃣ Worktree 共享 node_modules（junction）对依赖安装的影响

**GTS-Play worktree 结构**：
```
D:\Github\GTS-Play          [dev 分支]     ← node_modules 是实体目录
D:\Github\wt1               [wt1 分支]     ← node_modules 是 junction → GTS-Play\node_modules
D:\Github\wt2               [wt2 分支]     ← node_modules 是 junction → GTS-Play\node_modules
D:\Github\wt3-prop-fix      [wt3 分支]     ← node_modules 是 junction → GTS-Play\node_modules
```

**影响**：
- **在 GTS-Play 根目录装一次 = 所有 worktree 都恢复**（因为共享同一个物理 node_modules）
- **在 wt1 装也一样**（junction 指向 GTS-Play）
- **C 盘空间问题影响所有分支**（缓存在 C 盘，安装目标在 D 盘）
- **一个分支的包损坏 = 所有分支都坏**

**验证 junction**：
```powershell
$v = Get-Item "D:\Github\wt1\node_modules" -Force
echo "LinkType: $($v.LinkType)"   # 应为 Junction
echo "Target: $($v.Target)"       # 应指向 D:\Github\GTS-Play\node_modules
```

## 8️⃣ C 盘空间与 Yarn Cache 管理

**Yarn Cache 位置**：`C:\Users\Administrator\AppData\Local\Yarn\Cache\v6`

**缓存增长机制**：每个包的每个版本一个目录（如 `npm-@ant-design-icons-5.6.1-<hash>-integrity`），GTS-Play 这种大 monorepo 可达 **6000+ 目录、数 GB**。

**C 盘空间检查（装依赖前必做）**：
```powershell
"{0:N2} GB 可用" -f ((Get-PSDrive C).Free/1GB)
# <5 GB → 先清缓存再装
# <2 GB → 高风险，yarn 解压可能失败（产生坏缓存）
```

**快速清缓存**（比 `yarn cache clean` 快 100 倍）：
```powershell
cmd /c "rd /s /q C:\Users\Administrator\AppData\Local\Yarn\Cache"
cmd /c "rd /s /q C:\Users\Administrator\AppData\Local\npm-cache"
```

**关联**：`c-disk-cleanup-playbook` skill 有完整 C 盘清理清单。

## 执行结果报告

成功 → 简明确认：
> ✅ yarn bootstrap 完成，依赖安装成功

失败 → 停止，`msg *` 汇报：
```powershell
msg * "兄弟，yarn bootstrap 失败了——<简述原因>，建议的修复：<建议>"
```
不自作主张修，等兄弟指示。

## 被其他 skill 调用方式

其他 skill 想调用依赖安装时，直接描述步骤：
> 1. 按 `skills/gts-yarn-bootstrap/SKILL.md` 标准步骤执行 yarn bootstrap
> 2. 完成后确认 `yarn --version` 和包存在

不在 MEMORY.md 里囤这些细节，全放本 skill。
