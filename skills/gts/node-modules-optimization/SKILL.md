---
name: "node-modules-optimization"
description: "node_modules 体积诊断与优化：实测找大头（webpack .cache / yarn 临时残留 / file: 依赖）、安全清理、worktree junction 加速。触发：node_modules 太大、yarn install 慢、worktree 建立慢"
---

# node-modules-optimization — node_modules 体积诊断与优化

## 触发条件

- 兄弟说「node_modules 太大」「7GB 怎么优化」「yarn install 太慢」「worktree 建立不了/太慢」
- 磁盘空间紧张但不在 C 盘清理范围（那是 gts-clean-disk）
- 依赖安装本身的问题 → 走 gts-yarn-bootstrap；体积/速度诊断 → 本 skill

## 🔴 核心纪律：别信猜测，先实测

兄弟可能凭直觉报元凶（实例：说「主要组成是 mods/」，实测 mods 嵌套 node_modules 总共才 19MB）。
**必须先实测各目录体积再下结论**，用 Node 脚本，不用 PowerShell 递归：

- ⚠️ PowerShell `Get-ChildItem -Recurse | Measure-Object Length -Sum` 在 7GB node_modules 上会超时（实测 120s timeout 挂掉）
- ✅ Node 同步 fs.statSync 遍历秒级完成

直接跑配套脚本（三个子命令）：

```powershell
node scripts/measure-node_modules-size.cjs top D:\Github\GTS-Play\node_modules 15
node scripts/measure-node_modules-size.cjs nested D:\Github\GTS-Play 15
node scripts/measure-node_modules-size.cjs tmp D:\Github\GTS-Play\node_modules
```

- `top`：根 node_modules 顶层目录体积排序
- `nested`：各 workspace（packages/mods/demos/...）嵌套 node_modules 体积
- `tmp`：yarn 1 临时残留（`.xxx-xxxxx` 形态）总量

## 📊 GTS-Play 实测基线（2026-08-17，约 7GB 时的构成）

| 位置 | 大小 | 性质 |
|------|------|------|
| `packages/frontend-multiplayer/node_modules/.cache` | 2.23 GB | ⚠️ webpack 编译缓存，**可删，下次编译自动重建** |
| 根 `node_modules` 的 `.xxx-xxxxx` 残留（297 个） | 598 MB | yarn 1 临时拷贝残留，可删 |
| `file:` 外部依赖（vmd-physics-bake 310MB / pmx-reduce-face 238MB / bone-converter 161MB） | ~710 MB | 整个外部目录被**拷贝**进 node_modules |
| rescript / bs-platform / @rescript 系 | ~500 MB | 双版本 + 残留 |
| 316 个 mods 嵌套 node_modules | 仅 19 MB | ❗ 用户直觉以为的大头，实测最小 |
| mods 源码（mmd-character-extend 一个就 425MB） | 487 MB | 源码/模型资源，不是依赖 |

**install 慢的真正根因**：316 个 mods workspace 逐个解析链接 + `file:` 依赖整体拷贝 + 大包（three 等）。
**worktree 慢的根因**：worktree 建完必须重新 yarn install，同样开销再来一遍（git worktree add 本身不复制 node_modules）。

## 优化方案（三刀，按风险从低到高）

### 第一刀 — 删缓存，零风险（GTS-Play 实测立省 ~2.8GB）

```powershell
# webpack 编译缓存，删了自动重建
Remove-Item D:\Github\GTS-Play\packages\frontend-multiplayer\node_modules\.cache -Recurse -Force
# yarn 1 临时残留（.xxx-xxxxx 形态），删了不影响任何东西
Get-ChildItem D:\Github\GTS-Play\node_modules -Directory |
  Where-Object Name -match '^\..+-\w{6,}$' | Remove-Item -Recurse -Force
```

### 第二刀 — worktree 秒建（junction 共享 node_modules）

worktree 建立后**不重新 install**，用目录链接共享主仓库 node_modules：

```powershell
New-Item -ItemType Junction -Path <worktree>\node_modules -Target D:\Github\GTS-Play\node_modules
```

⚠️ 注意：
- Junction 整棵共享；worktree 分支若改了 package.json 需先 `Remove-Item` 解链再重装
- 依赖不完全一致时可能缺包 → 属已知限制，先验证再推广

### 第三刀 — 治本（`file:` 依赖 + pnpm 迁移）

- `file:../../../xxx` 外部依赖是整体拷贝：评估能否改 workspace 引用或减小依赖面
- 终极方案：换 pnpm（全局 store + hardlink，7GB → ~2GB，所有 worktree 共享，install 秒级），但 Lerna + yarn 1 monorepo 迁移有成本，需兄弟拍板

## 汇报格式

先给「实测构成表」（位置/大小/性质），指出用户直觉偏差（如有），再按风险排序给三刀方案。删缓存类操作零风险可直接执行；junction / pnpm 类先确认。

## Pitfalls

- ❌ 用户说「主要组成是 X」就直接信 → 必须先实测（本 skill 就是因 mods 误判诞生的）
- ❌ PowerShell 递归统计大 node_modules → 超时；用 Node 脚本
- ❌ 删 `.cache` 前犹豫 — webpack/tsc 缓存删了自动重建，零风险
- ❌ worktree 建立后无脑重新 yarn install → 用 junction 共享
- 长路径删除问题：node_modules 深路径先 `cmd /c rmdir /s /q` 再试 PowerShell
