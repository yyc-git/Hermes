# XiaHui PMX 减面（PMXReduceFace）资源索引与验收

> 适用于：fix:/feat: 涉及 `packages/mmd_tool/src/tool/pmx-face-reduce/reduce.mjs`（已迁移到 `node_modules/pmx-reduce-face/`）或 XiaHui PMX 几何产物时。
> 触发词：「PMXReduceFace」「XiaHui 减面」「减面空洞」「right arm hole」「会阴 hole」「PMX geometry hole」「reduceFaces」。
> 与 `mmd-data-generation` 主表的区别：主表管 MMDData.ts 写回；本表管 PMX 几何源（减面前/减面后）。

## 角色 ↔ PMX 文件名映射（关键 — 别名混淆）

兄弟文档里写「XiaHui」/「夏卉」/「TDA式宴 夏卉」/「TDA Utage CORAL COAST」是**同一人物**的不同代号。代码搜索 `xiaHui` 大概率搜不到，必须按目录名搜。

| 角色代号（兄弟用语） | PMX 文件名 | 目录 |
|---|---|---|
| XiaHui / 夏卉 | `TDA Utage CORAL COAST.pmx` | `mine/mmd-character-extend/src/asset/TDA式宴 夏卉/` |
| Xiaye1 / 夏夜 1 / HMS illustrious | `Tda HMS illustrious Prom Dress Ver1.00 [Silver].pmx` | `mine/mmd-character-extend/src/asset/Tda 夏夜1 .../` |
| Haku_Lady / QP / 旗袍 | `tda haku QP.pmx` | `mine/mmd-character-extend/src/asset/旗袍 Haku/` |

**优化产物（减过面的）= 同目录 `_opt/` 后缀**，且常含 4 个变体：
```
<TDA式宴 夏卉_opt>/
  TDA Utage CORAL COAST.orig.pmx              # 减面前原文件副本
  TDA Utage CORAL COAST.optimized.pmx         # 减面后（通用优化）
  TDA Utage CORAL COAST.bones_lite.pmx        # 减面 + 骨骼精简
  TDA Utage CORAL COAST.bones_lite_renamed.pmx # + 标准骨骼名替换
  TDA Utage CORAL COAST.pmx                   # 当前 game 实际使用（=上面 4 个中的最终版）
```

> 选哪个 PMX 跑减面/验证：源 = `mine/.../夏卉/TDA Utage CORAL COAST.pmx`；覆盖输出 = `mods/mmd-character-extend/src/asset/TDA式宴 夏卉_opt/TDA Utage CORAL COAST.pmx`（即 `bones_lite_renamed.pmx` 的副本，由 step-3-pmx 工作流生成）。

## 减面工具链位置

| 用途 | 路径 |
|---|---|
| 减面主程序 | `node_modules/pmx-reduce-face/src/tool/pmx-face-reduce/reduce.mjs`（file: 依赖，从 `D:\Github\PMXReduceFace` 拉） |
| 几何质量验证 | `node_modules/pmx-reduce-face/src/tool/pmx-face-reduce/verify.mjs` |
| BDD 辅助（桌面硬编码） | `packages/mmd_tool/test/helpers/pmx-face-reduce-check.mjs` |
| 锁定集构造 | `node_modules/pmx-reduce-face/src/tool/pmx-face-reduce/lock-set.mjs` |
| QEM 折叠核心 | `node_modules/pmx-reduce-face/src/tool/pmx-face-reduce/qem.mjs` |
| 写出 | `node_modules/pmx-reduce-face/src/tool/pmx-face-reduce/pmx-writer.mjs` |
| 工作流集成 | `packages/mmd_tool/src/tool/pmx-optimize/optimize.mjs`（`step-3-pmx.mjs` 调用） |

## 几何 bug 验收 ≠ 浏览器 E2E

**PMX 减面产生的「空洞」「破面」「sliver」是纯几何问题**，不依赖浏览器/WS/UI。Phase 0 不走 `packages/*/test/e2e/`，而是走 **`verify.mjs` 的几何断言**。`gts-dev-fix` 默认 Phase 0 是浏览器 E2E，要按本表覆写。

**验收 6 项**（`verify.mjs` 输出，`real-model-check` 已被 fix6 落地为基线）：

| # | 指标 | 健康范围（XiaHui fix6 实测） | 兄弟关注 |
|---|------|---|---|
| 1 | `newBoundaryEdges` 总数 | < 39949（fix6 质量地板） | 必查 |
| 2 | `realHoleCount`（剔除开放边界正常回缩后真洞） | = 0 | 必查 |
| 3 | MAXL（最大边长比例） | < 2.0 | — |
| 4 | AREA | < 1.5 | — |
| 5 | CURV | < 12 | — |
| 6 | P1（边界周长比） | < 1.4 | — |

> 🔴 **「空间新边界 ≠ 真洞」**（fix6 实锤）：`countSpatiallyNewBoundaryEdges` 包含**开放边界正常回缩**（如袜子口/头发末端、衣服袖口、裙摆），判定真洞必须看新边界两端点是否离输入边界 >0.2。`realHoleCount` 才是兄弟要的「减面空洞」指标。

## 典型 bug 类与代码路径

| 症状 | 可疑代码 | 验证方式 |
|------|---------|---------|
| **右手臂/会阴空洞** | `qem.mjs` collapseMesh：接缝边两侧顶点合并 + `lock-set.mjs` 没识别 XiaHui 空间重合 | `verify.mjs` → `realHoleCount` 在右手臂/会阴 bbox 过滤 = 0 |
| 手指/手镯窄条 (sliver) | QEM 折叠顺序 + max-length 约束弱 | `verify.mjs` → sliver 边数 = 0（fix6 第二/三轮已修） |
| 头发末端开放边界误判为洞 | `qem.mjs` 未区分开放 vs 真洞 | `realHoleCount` = 0（fix6 已修） |
| 材质顶点不足导致 mesh 不连续 | `lockMaterials` 没含小材质 + `min-retention` 不足 | `verify.mjs` → per-material 存活顶点比例 |
| 衣袖/裙摆合并错位 | `lockSeams=false` 折叠衣袖分离顶点 | `verify.mjs` → 袖口周长对比 |

## 几何验证 1-shot 命令

```powershell
# 1. 减面（重跑 PMXReduceFace 写入 _opt/TDA Utage CORAL COAST.pmx）
cd D:\Github\GTS-Play
node node_modules/pmx-reduce-face/src/tool/pmx-face-reduce/reduce.mjs `
  --input 'mods/mmd-character-extend/src/asset/TDA式宴 夏卉/TDA Utage CORAL COAST.pmx' `
  --output 'mods/mmd-character-extend/src/asset/TDA式宴 夏卉_opt/TDA Utage CORAL COAST.optimized.pmx' `
  --target-tri 30000 `
  --lock-morph true `
  --lock-seams true

# 2. 几何质量验证（输出 JSON：boundaryEdges/newHoleEdges/realHoleCount/MER...）
node node_modules/pmx-reduce-face/src/tool/pmx-face-reduce/verify.mjs `
  'mods/mmd-character-extend/src/asset/TDA式宴 夏卉/TDA Utage CORAL COAST.pmx' `
  'mods/mmd-character-extend/src/asset/TDA式宴 夏卉_opt/TDA Utage CORAL COAST.optimized.pmx'

# 3. 对比兄弟报告的 bug 部位（右手臂 +0.4<X<+0.7 / 会阴 +0.0<Y<+0.4 bbox 内）realHoleCount = 0 才算 fix 成功
```

## ⚠️ 不要做的事

- ❌ **不要用 `pmx-face-reduce-check.mjs`**（`packages/mmd_tool/test/helpers/`）— 硬编码读 `C:/Users/Administrator/Desktop/<modelDir>`，必须把 PMX 先拷到桌面才能跑；它是为了「CI 全自动」做的桌面兼容层，调试时绕过它直接调 `reduce.mjs` + `verify.mjs`
- ❌ **不要写浏览器 E2E** 验证 PMX 几何 — 几何问题不能靠 demo 截图判断（截图依赖光照/相机角度）
- ❌ **不要覆盖 `_opt/TDA Utage CORAL COAST.pmx`** 之前，先备份 `bones_lite_renamed.pmx` 副本 — 当前 `TDA Utage CORAL COAST.pmx` 是 `bones_lite_renamed.pmx` 的副本（bytes 相同），覆盖 = 失去骨骼重命名结果
- ❌ **不要只跑 `reduce.mjs` 不跑 `verify.mjs`** — 减面工具无内置质量门禁，必须外部 verify 6 项断言 + 部位过滤

## 历史教训（来自 MEMORY/ARCHIVE）

- **fix5 (2026-08-13)**：「空间新边界 ≠ 真洞」 — 41 条新边界中 0 真洞（区分开放边界回缩 vs 真洞，距离 >0.2 判定）
- **fix6 (2026-08-13)**：质量守卫地板 39949，6 项断言落地，`real-model-check` 基线
- **第二轮 sliver (2026-08-13)**：手指窄条清零（fix 计数）
- **本次 (2026-08-19)**：XiaHui 右手臂 + 会阴空洞 — 兄弟原话「demo增加XiaHui人物，并运行demo测试下」（手动验证环节）

## Demo 入口（手动验证 PMX 视觉效果）

PMX 几何问题**最终需要肉眼验证**，但**不是 BDD 自动化任务**。当前 demo 选 `demos/new_basic2/`（最近 webpack demo + MMDLoader），**XiaHui 默认未注册**，需加 config：

```powershell
# 启动 demo（修改 config 注册 XiaHui 后）
cd D:\Github\GTS-Play\demos\new_basic2
yarn webpack:dev-server    # 端口通常 8096
```

视觉验证清单（兄弟手动）：
1. 右手臂完整无穿模
2. 会阴（胯下）mesh 连续无洞
3. 衣袖/裙摆接缝线对齐
5. 转动视角重复检查

## 调度建议（gts-dev-fix Phase B）

| 任务 | 模型 | reason |
|------|------|--------|
| 根因分析（接缝识别/lockSeams/真洞判定） | Pro | 跨 qem.mjs + lock-set.mjs + verify.mjs 三文件，多分支 |
| 实现修复（参数/QEM 策略/接缝判定） | Pro | 同上 |
| 单测补 verify.mjs 新断言 | Flash | 纯断言改写 |
| tsc/jest 验证 | Flash | 标准门禁 |

> 工作目录在 `D:\Github\PMXReduceFace\`（独立 git 仓库，remote yyc-git/PMXReduceFace）— 修改后必须 push 该仓库 + 同步 GTS-Play `node_modules/pmx-reduce-face` file: 依赖。