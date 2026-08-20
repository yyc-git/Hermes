# GTS-Play PMX/MMD 资产路径约定

> Phase 0 调查 PMX 相关 bug 时，先读本文件定位资产，不要从头搜索。

## 目录结构

```
GTS-Play/
├── mods/mmd-character-extend/src/asset/     ← ⭐ 主资产库（已优化/减面的版本）
│   └── <角色名>/                            ← 原始未减面 PMX + 纹理
│   └── <角色名>_opt/                        ← 已优化版本（多份 PMX：orig/bones_lite/optimized/renamed）
├── mine/mmd-character-extend/src/asset/     ← 镜像（与 mods/ 内容相同）
├── mine/mmd-character-default/src/asset/    ← 默认角色资产（如 Baixi）
├── demos/
│   ├── new_basic2/                          ← 主 demo 目录（TS 源码 + webpack）
│   │   └── public/resource/mmd/Baixi/       ← demo 用的 PMX 资产
│   └── <角色名>/                            ← ⭐ fix 时临时拷贝到此作为 demo 输入
├── packages/mmd_tool/
│   └── src/tool/
│       ├── pmx-face-reduce/reduce.mjs       ← 减面核心实现（QEM 约束边折叠）
│       ├── pmx-optimize/optimize.mjs        ← 优化入口（调用 reduceFaces）
│       └── pmx-physics-reduce/pmx-loader.mjs ← PMX 解析器
│   └── test/helpers/
│       ├── pmx-face-reduce-check.mjs        ← BDD 辅助：跑 reduce + verify
│       ├── cloth-xiahui-check.mjs           ← XiaHui 专用检查
│       └── pmx-fixture-builder.mjs          ← PMX 测试 fixture 构建
└── node_modules/pmx-reduce-face/            ← 开源减面工具（file: 依赖）
```

## PMX 文件命名约定

| 后缀 | 含义 | 用途 |
|------|------|------|
| `.pmx` | 原始 PMX | 减面工具的输入 |
| `.orig.pmx` | 备份的原始 PMX | 回归对比 |
| `.optimized.pmx` | 已减面/优化的版本 | 验收对比基线 |
| `.bones_lite.pmx` | 骨骼精简版 | 骨骼优化后的输出 |
| `.bones_lite_renamed.pmx` | 骨骼精简+重命名版 | 最终可用版本 |

## Phase 0 资产发现流程（PMX 相关 fix）

```
1. 兄弟描述 bug → 确定涉及哪个角色（XiaHui/Baixi/Haku/...）
2. 定位原始 PMX：
   - mods/mmd-character-extend/src/asset/<角色名>/*.pmx  ← 主要来源
   - mine/mmd-character-extend/src/asset/<角色名>/*.pmx  ← 镜像
3. 定位已优化版本：
   - mods/mmd-character-extend/src/asset/<角色名>_opt/   ← 包含多个版本
4. 确认 demo 输入路径：
   - 兄弟可能指定 demos/ 下的路径 → 先检查是否存在，不存在则从 mods/ 拷贝
5. 减面工具链：
   - packages/mmd_tool/src/tool/pmx-face-reduce/reduce.mjs
   - node_modules/pmx-reduce-face/（开源依赖）
```

## 常见坑

1. **`demos/` 下不一定有角色资产** — 需要从 `mods/` 手动拷贝（Copy-Item，不是符号链接）
2. **中文路径在 PowerShell 中** — `Copy-Item` 可以处理，但 `find`/`grep` 命令在 PowerShell 中不可用（用 `Select-String` 或 `search_files`）
3. **`mine/` vs `mods/`** — 两者内容基本相同，优先用 `mods/`（它是主工作副本）
4. **原始 PMX vs 优化 PMX** — 修 bug 时通常需要**原始未减面的 PMX** 作为输入（因为需要能复现减面问题）
5. **5万面以下跳过规则** — reduce.mjs 默认跳过 5 万面以下的模型，修 bug 时需要**豁免此规则**（兄弟明确说「本次减面要忽略这个默认」时，brief 中必须注明绕过 skip）
