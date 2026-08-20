---
name: "gts-mmd-tool-fixes"
description: "GTS-Play mmd_tool 工具链(MMD 角色数据生成)修复入口。覆盖 PMX 减面、cloth 数据、第一人称相机、picked transform、鞋子 cloth 等。触发:mmd_tool 报错/数据异常/PMX 减面/角色数据生成问题。"
tags: ["gts", "mmd-tool", "miko"]
related_skills: ["gts-dev-fix", "worktree-junction"]
---

# gts-mmd-tool-fixes — mmd_tool 工具链修复经验

> 2026-08-20 兄弟拍板建立的 class-level umbrella skill。
> 范围:`packages/mmd_tool/` 下所有 fix 任务通用的"三份文件"结构 + 算法上下文 + 兄弟硬偏好。
> 单一修复点的具体任务 → 走 **gts-dev-fix** skill(本 skill 提供上下文,不入 dispatch)。

## 📦 三份 reduce.mjs 不同步(必读)

| 来源 | 路径 | 行数 | 来源类型 |
|---|---|---|---|
| 上游 PMXReduceFace | `D:\Github\PMXReduceFace\src\tool\pmx-face-reduce/reduce.mjs` | 12111 | 上游仓库(有 `--skip-threshold` 等新功能) |
| GTS-Play 主仓 src copy | `D:\Github\GTS-Play\packages\mmd_tool\src\tool\pmx-face-reduce/reduce.mjs` | 7035 | 主仓内独立 copy(无新功能,需手动同步) |
| yarn workspace link | `D:\Github\GTS-Play\packages\mmd_tool/node_modules/pmx-reduce-face/` | (与上游一致) | 通过 `mmd_tool/package.json` 的 `"pmx-reduce-face": "file:../../../PMXReduceFace"` link 到上游 |

**坑(2026-08-19 实锤,worktree-junction skill 坑清单已提到但未细化)**:
- **改 src copy** 不会影响 node_modules link 调用的上游
- **改上游** 也不会同步回 src copy
- yarn install 重装会保留 node_modules link,不会清掉上游修改
- 三份代码漂移会导致:CI 跑 src copy 测试 vs dev 实际跑 node_modules 上游 → 测试通过但实际行为不一致
- **fix 算法时**:先确认 mmd_tool 实际跑的是哪一份(默认 = node_modules 上游)→ 改对的位置

## 🔴🔴🔴 M-3 子 fix 并行 dispatch 模式（2026-08-20 实锤）

兄弟在 M 阶段同时报告多个独立 mmd_tool 问题时的标准流程：

### 流程
1. 兄弟报告 N 个独立问题 → bot 快速 grep 定位方向（每个 1-2 个文件，不深挖）
2. 确认修复方向（auto 模式跳过确认直接 dispatch）
3. **每个问题写独立 brief**（`.opencode-brief-<字母>-<任务名>.md`，brief 文件隔离）
4. **并行 dispatch 多个 session**（不同 `--title`，独立 wait 监控）
5. 逐个验收（wait 通知 → git diff → 针对性测试）
6. 全部通过后统一 commit

### brief 精度纪律（M-3 子 fix 核心教训）

> G session（camera func）教训：brief 写了「诊断并修复」→ agent 做完诊断、跑了全量 jest 超时、没改文件就停了。

- ❌ brief 不能只写「诊断问题并修复」→ agent 可能只诊断不改文件
- ✅ brief 必须写**具体修复动作**：哪个文件、哪一行、改什么
- ✅ brief 必须包含**验证命令**：修完后跑什么测试确认
- ✅ 数据陈旧问题（如 MMDData.ts 需重新生成）→ brief 写明重新生成的具体命令（如 `node gen-first-person-hide.mjs --pmx ... --character XiaHui --target $tmp --force`）
- ✅ 参数传递链问题（如 skip-threshold）→ brief 写明调用链的入口文件和具体行号

### 子 fix 编号
按字母递增（继承父流程已用的字母，从下一个开始）。例：父流程用了 A/B/C/D → 子 fix 从 E/F/G 开始。

## 🎯 mmd_tool 数据生成常见 4 个问题(2026-08-19-20 XiaHui fix 完整闭环)

兄弟在 XiaHui 数据生成时列出的 bug + 修法：

| # | 问题 | 修复方向 | 状态 |
|---|---|---|---|
| 1 | PMX <5万面仍跑减面 | step-3-pmx.mjs 加 `--skip-threshold 50000`（F fix） | ✅ |
| 2 | 无 `右つま先ＩＫ`/`左つま先ＩＫ` 骨骼仍生成 `shoeDamagePart` | `getClothCollisionData`/`getClothHpData` 调用 `hasToeIKBones()` 守卫 | ✅ |
| 3 | 无 `メガネ` 骨骼时 camera func 输出垃圾 | 自适应锚点 + MMDData.ts 数据更新为双眼平均（G2 fix） | ✅ |
| 4 | `getPickedTransform` XiaHui/Xiaye1 断言值错误 | 算法已对(c8f92b5dc)，**只改测试断言**为 `[-0.5, -0.6, 0]` | ✅ |
| 5 | step-3-pmx.mjs 调 optimize 未传 skipThreshold | 加 `--skip-threshold 50000`（第 80 行，默认 50000） | ✅ F fix |
| 6 | HIDE_RULES 硬编码关键词不全 | 改为 PMX 骨骼权重扫描（filterHideMaterialNames opts.bones+vertices） | ✅ I2 fix |

### 🔴🔴 头部材质识别必须用骨骼权重扫描（2026-08-20 兄弟拍板）

**兄弟原话**：「不应该用写死的关键词啊，应该扫描pmx来得到头部的所有材质！」

**正确做法**（已实现在 `first-person-hide-rules.mjs` 的 `filterHideMaterialNames`）：
1. 解析 PMX → bones + vertices
2. 找头部根骨骼：`bones.filter(b => /頭|头|head/i.test(b.name))`
3. BFS 收集头部子树所有骨骼索引
4. 遍历材质顶点：检查 `skinIndices` 是否引用子树骨骼（`skinWeights > 0`）
5. 引用 → 标记隐藏

**为什么不用关键词**：不同角色头部材质命名差异大（XiaHui: hear1/hat/ears, Xiaye1: 头饰/发辫饰带/呆毛），硬编码无法覆盖所有变体。

**KEEP_RULES 优先级高于扫描**：Body 等服装虽有少量头部骨骼权重（如皮肤绑定），但不应隐藏 → KEEP_RULES（body/dress/skirt 等）先拦截。

> 问题 5 已修（step-3-pmx.mjs），问题 6 已修（骨骼权重扫描替代硬编码关键词）。

## 🔴 派工模型选择硬偏好(2026-08-20 兄弟拍桌)

兄弟原话:"flash 场景不是优先用免费组吗？你怎么回事啊？"

**铁律**:
- 免费时段(北京 9-12 / 14-18) → **Flash 必须用免费组 `current`**(不靠记忆,先 read `scripts/opencode-free-model-state.mjs get`)
- 非免费时段 → Flash = `volcark/deepseek-v4-flash-ga-260731`
- Pro = 火山 pro → 小米 pro → go pro(pro 场合绝不降级免费组)
- **禁止凭印象组合 -m 参数**(我犯过:自创"volcano flash + Pro 试→免费组 fallback"链 → 与铁规相反 → 兄弟拍桌)
- 详见 opencode-schedule skill 顶部铁规段

## 🛠️ 角色骨骼命名约定(MMD 标准)

- 日文骨骼名优先:`頭` / `首` / `目` / `両目` / `右目` / `左目` / `目先` / `右目先` / `左目先`
- 英文变体:`Head` / `Eye` / `Eyes` / `RightEye` / `LeftEye`
- 简化骨骼可能删除 `メガネ` / `両目` 等装饰性骨骼 → 算法需 fallback
- 鞋子 IK 骨骼:`右つま先ＩＫ` / `左つま先ＩＫ`(半角 + 全角变体都有,正则匹配时两者都要支持,见 commit d740a1dd2)

## 🆕 XiaHui LOD_70 洞根因(2026-08-20 兄弟实测)

兄弟在 dev server (8096) 浏览器测 XiaHui PMX `TDA Utage CORAL COAST.pmx` 时发现 **2 处新增真洞**:

| 位置 | 形态 | 原因 |
|---|---|---|
| 右手上臂前/后侧 | V 形空洞(2 个独立洞) | 圆柱体边界边累积折叠 |
| 胸部之间 | 长条形空洞 | 重叠材质过渡区边界边清除 |

**根因(Pro OpenCode 验证)**:`src/tool/pmx-face-reduce/qem.mjs:877` 函数 `collapseCreatesHole` 漏判 `preU===1 && preV===1 && post<2` 场景(双边边界边,折叠后唯一共享三角形被移除 → 边界边消失形成洞)。

**触发路径**:
1. 圆柱体(右臂)/材质过渡区(胸部)顶点位于边界边
2. QEM 折叠边 (u,v) 时,u 和 v 共享唯一邻居 w
3. 三角形 (u,v,w) 是 u 和 v 之间唯一的三角形
4. 折叠后 (u,v,w) 退化为 (u,u,w) → 被移除
5. 边 (u,w) 从 1 个共享三角形 → 0 → 悬空边 → 洞
6. 多次累积 → V 形或长条形空洞

**修复(方案 A, Pro 推荐)**:`qem.mjs:877` 改一行:
```diff
- if ((preU === 2 || preV === 2) && post < 2) {
+ if ((preU === 2 || preV === 2 || (preU === 1 && preV === 1)) && post < 2) {
```
同时放宽两个常量(仅 `patchHoles` 调用处):
- `HOLE_DEPTH_RATIO`: 0.5 → 0.3
- `HOLE_CHAIN_MAX_EDGES`: 8 → 16

**不动** `HOLE_ASSERT_MIN_AREA_RATIO = 8.0`(已足够严格)+ `verify.mjs`(已能检出)。

**预期影响**:LOD 面数 +100~300,质量断言全绿。

### 🔴🔴 LOD 文件缓存坑(2026-08-20 实锤)

**问题**:修复 `qem.mjs` 算法后,浏览器 demo 仍然显示空洞。根因:demo 加载的是 `demo/assets/XiaHui/*.LOD70.pmx` 等**预生成文件**,不是实时跑算法。LOD 文件是 `yarn demo:prepare` 生成的,算法改动不会自动更新它们。webpack-dev-server 只热更新 JS/CSS,不重生成 PMX 二进制。

**排查步骤**:
1. 检查 LOD 文件时间戳: `Get-ChildItem demo\assets\XiaHui -Filter *.pmx | Sort-Object LastWriteTime`
2. 对比 fix commit 时间: `git log --oneline -1`
3. **LOD 文件时间早于 fix commit = 缓存过期,必须重新生成**

**修复**:算法改动后必须重跑 `yarn demo:prepare`（~23 秒），再刷新浏览器 F5。

**验证**:跑 `node src/tool/pmx-face-reduce/verify.mjs <原始PMX> <LOD文件>` 确认 `"noNewHoles": true`。

**相关 commits**:
- 根因+方案:`笔记/项目文档/changes/2026-08-20-xiahui-LOD70-holes/solution.md` (Phase B Step 1 Pro 产出)
- Delta Specs:`笔记/项目文档/changes/2026-08-20-xiahui-LOD70-holes/specs/pmx-face-reduce-xiahui-holes.feature`
- Expected-state:同上目录 `specs/expected-state/no-new-holes-xiahui.json`

**为什么 verify 没抓到这两个洞**:
- `findHoleChains` `HOLE_DEPTH_RATIO = 0.5` → V 形洞 sagitta/mouth 比值低,被过滤
- `HOLE_CHAIN_MAX_EDGES = 8` → 胸部长条形洞链长 > 8,补面跳过
- `HOLE_ASSERT_MIN_AREA_RATIO = 8.0` → verify 断言阈值严格,小面积洞被漏报
- `countSpatiallyNewBoundaryEdges` `HOLE_TOL = 0.2` → 位移 < 0.2 边界边漏报

## 🆕 PMXReduceFace demo 加多模型切换(2026-08-20 commit 730e9a1)

兄弟要求 demo 支持 **XiaoMei / Xiaye1 / XiaHui 三个模型切换**。原本 demo 硬编码 `MODEL_NAME='XiaoMeiOriginFix_02_elrein'` 单模型。

### 模型路径模式(2026-08-20 落地)

```
demo/assets/
├── XiaoMeiOriginFix_02_elrein.pmx       (平铺,旧位置)
├── XiaoMeiOriginFix_02_elrein.LOD100/70/55/50.pmx (平铺,旧)
├── tex/                                  (XiaoMei 纹理,平铺,旧)
├── stats.json                             (扩展为 models[3] 数组)
├── Xiaye1/                                (新增子目录)
│   ├── Tda HMS illustrious Prom Dress Ver1.00 [Silver].pmx   (原版 PMX)
│   ├── Tda HMS illustrious Prom Dress Ver1.00 [Silver].LOD100/70/55/50.pmx
│   ├── data/    (12 张 png)
│   └── sph/
└── XiaHui/                                (新增子目录)
    ├── TDA Utage CORAL COAST.pmx
    ├── TDA Utage CORAL COAST.LOD100/70/55/50.pmx
    └── <22 张 png 同级>)
```

### 三处源码改动(commit 730e9a1)
1. **`scripts/prepare-demo.mjs`**: 改 `MODEL_NAME` 为 `MODELS = [{key, label, input, outputDir}, ...]` 数组;每模型传 `--skip-threshold 10000`(默认 50000);LOD 写子目录;`stats.json` 改 `models[3]`。
2. **`demo/main.ts`**: 删硬编码 `MODEL_NAME`;改 `MODELS` 注册表 + `MODEL_LODS_MAP`;UI 加 `#model-buttons` 切换条(顶部);文件路径拼接 `ASSET_BASE + baseDir + fileName`;`frameModel()` 处理不同高度用 bounding box。
3. **`demo/index.html`**: 加 `#model-bar` 切换条样式(复用 `.controls button`)。

### 三个坑(实战踩到)
- **XiaoMei 误重生成**:首次跑 `prepare-demo.mjs` stats.json 已切新格式,XiaoMei 复用分支失效而重跑(41227→41230 面数变化)。修法:用 `git checkout` 恢复 XiaoMei 全部 LOD + 增强 `loadLegacyXiaoMei()` 兼容新旧两种 stats.json 格式。
- **LOD 文件名多一个 `.pmx`**(`.pmx.LOD100.pmx`):`fileName` 带扩展名导致。修法:`lodOutFile()` 去扩展名,删除错误命名文件后重生成。
- **XiaHui verify 报 exit 1**:源模型本身自带 2 条非流形边(非 QEM 引入,roundtrip 也有)。修法:`verify.mjs` 的 `noNonManifoldEdges` 改为只断言"**新增**"非流形边(输入已有非流形 = 源资产缺陷,不计入)。

### `--skip-threshold` 参数(demo 与工具)

- `reduce.mjs` 默认 `--skip-threshold=50000`(兄弟 8-19 commit `0b50ce0` 拍的)
- demo 调用时传 `--skip-threshold=10000`(兄弟 8-20 拍的,让 ≤1 万面小模型也走 QEM 减面)
- `real-model-check.mjs` 透传 `--skip-threshold`(8-20 同步加)
- 通过 CLI 参数调用:`node src/tool/pmx-face-reduce/reduce.mjs --input X.pmx --output Y.pmx --target-ratio 0.7 --skip-threshold 10000`

### .gitignore(PMXReduceFace 仓,8-20 落地)
忽略 `.opencode-session-meta/` 会话元数据(避免 dispatch 信息污染仓库)。

### dev server 端口

- **PMXReduceFace demo**: `yarn webpack:dev-server` → http://localhost:8096(跟 GTS-Play frontend 7093 不冲突)
- 启前查占用:`netstat -ano | findstr :8096`

### 🔴🔴🔴 宁可不减面都不能引入空洞（2026-08-20 兄弟拍板铁律）

> 兄弟原话：「一定要保证质量，不能出现空洞、多余的三角面！宁可不减面都可以啊！」

**铁律**:质量 > 减面率。空洞（任何材质内部/边界）和多余三角面绝对不允许。

**验证工具盲区（2026-08-20 实锤）**:
- `newHoleEdges`（reduce 输出）:只检测「输出比输入多出的边界边」,材质内部空洞漏检
- `findHoleChains`（patchHoles）:只检测**闭合环**,单点空洞/开放缺口漏检
- `verify.mjs` 的 `noNewHoles`:依赖上述两个函数,继承所有盲区
- **BDD 测试**:测试算法行为（collapse 是否拒绝）,不检查视觉输出
- **结论**:拓扑检查通过 ≠ 视觉无空洞。最终验证必须**浏览器视觉检查**

**dispatch brief 写法**:
- ❌ 「Phase 1 修检测 + Phase 2 修算法」→ agent 停在 Phase 1
- ✅ 「修 collapseCreatesHole 让它拒绝所有产生空洞的折叠。不改检测工具。HOLE_TOL 保持不变」→ 聚焦算法

### 🔴🔴 brief 精度导致 agent 反复加检测不修算法（2026-08-20 PMXReduceFace 实锤）

**问题**：dispatch 修减面空洞算法，agent 反复加检测函数/诊断日志，不改 `collapseCreatesHole` 本身。连续 4 轮 dispatch（quality-fix / algo-fix / minimal-fix / refine-condition）都是这个模式。

**根因**：brief 写了「Phase 1 修检测 + Phase 2 修算法」→ agent 完成 Phase 1 就停了；写了「诊断」→ agent 加 console.log；写了「增强检测」→ agent 加新函数。

**正确 brief 写法**：
- ✅ 「只改 `collapseCreatesHole` 函数（line 859-884）。加入 `(preU===0 && preV===1)` 和 `(preU===1 && preV===0)` 两个条件。不加日志不加函数不改其他文件。」
- ✅ 「不允许改动的范围：`只允许改 X 文件的 Y 函数。不允许改其他任何文件、不允许加日志、不允许加新函数。」
- ❌ 「修复空洞检测和减面算法」→ 太宽泛，agent 选择最容易的路径（加检测）
- ❌ 「诊断并修复」→ agent 只诊断不修
- ❌ 「Phase 1 检测 + Phase 2 算法」→ agent 完成 Phase 1 就停

**经验**：给 OpenCode 的 brief 越窄越好。明确写「允许改什么」「禁止改什么」「验证命令是什么」。agent 倾向于做最容易的事（加代码），而不是最难的事（改算法逻辑）。

### 🔴 pre-existing 测试断言失效处理（2026-08-20 XiaHui fix 教训）

> 3 个 cloth-xiahui 测试失败（XH-05e/XH-06b/XH-06c）根因是**测试断言写错**，不是代码 bug。

**正确排查流程**：
```
测试失败
  → 读测试断言值（toBe/toEqual 的期望值）
  → 读源码实际值（MMDData.ts / HP_PARAMS / MAT_SEMANTIC regex）
  → 对比：断言值 vs 源码值
    → 一致 → 被测代码有 bug
    → 不一致 → 测试断言写错 → 改测试
```

**常见断言失效模式**：
- MAT_SEMANTIC regex 命中返回 `'EXCLUDED'` 而非 `null`（jacket/necklace 命中排除规则）
- HP_PARAMS 部位参数与 MMDData.ts 手写值不一致（裤子 hp=0.3 而非 0.2）
- feature 文件步骤文本与 steps.ts 不同步（jest-cucumber 严格匹配）

**⚠️ 改测试断言时必须同步改 feature 文件**（jest-cucumber 要求步骤文本完全匹配）。

### 🔴🔴 MMDData.ts 数据陈旧坑（2026-08-20 G session 教训）

**问题**：gen-*.mjs 脚本生成的数据写入 MMDData.ts 后，如果上游算法/骨骼变更（如 boneReduce 删了メガネ骨骼），MMDData.ts 里的旧数据不会自动更新 → 运行时引用已删除骨骼 → 功能异常。

**触发场景**：
- 骨骼简化（boneReduce）删除了某些骨骼 → camera func / cloth data 仍引用旧骨骼名
- 算法更新（如 pickedTransform 改为共享默认值）→ MMDData.ts 仍用旧公式值

**排查**：对比 MMDData.ts 中角色块的生成时间戳（注释 `gen-xxx.mjs 生成 YYYY-MM-DD`）与最近骨骼/算法变更 commit 时间

**修复**：用 gen-*.mjs 脚本重新生成 → `node gen-first-person-hide.mjs --pmx <PMX路径> --character <角色> --target MMDData.ts --force`

### 🔴 jest-cucumber feature/step 文本严格匹配（2026-08-20 I2 fix 教训）

**问题**：feature 文件的步骤文本与 steps.ts 的 `and('...')` / `then('...')` 必须**完全匹配**（含数字/标点），否则 Test suite failed to run（不是测试失败，是根本跑不起来）。

**常见坑**：
- 改了 feature 文件的数字（如「保留项共 16 个」→「20 个」）但没同步改 steps.ts
- 改了 steps.ts 的断言值但没同步改 feature 文件的步骤文本
- **两边都要改**：feature 文本 + steps.ts 的匹配文本 + expect() 断言值

## 📋 XiaHui 历史教训(2026-08-19 fix 闭环)

来自 `笔记/daily/2026-08-19-xiahui-fix-phaseR.md`:
1. 恢复中断会话必须先清旧 session(主表铁律)
2. LLM 静默 unknown → 先发「继续」重试,不是模型挂
3. Jest + PMX 减面 >300s 卡死 agent bash → brief 必须显式「禁止跑 jest,只改代码」
4. 修复在 node_modules → 待同步上游 `D:\Github\PMXReduceFace`
5. 三份 reduce.mjs 不同步是长期风险 → 加 CI diff 检查

## 🚀 标准 fix 入口流程

1. 兄弟报 bug → 走 **gts-dev-fix** skill(本 skill 提供 mmd_tool 上下文)
2. bot 初始化 skill-exec issue + 写 brief(明确「三份 reduce.mjs 用哪份」「角色骨骼命名变体」「不上游同步路径」)
3. 派工(模型按本 skill §派工硬偏好选)
4. 验收走 **gts-acceptance** + 本 skill「常见 4 个问题」对号入座验证

### 🔴 flash-free 模型「复读」行为（2026-08-20 I/J fix 实锤）

**现象**：flash-free 模型收到 brief 后只输出文本复读（echo），不调用任何工具编辑文件。连续 3 轮 dispatch（J2/J3/J6-flash）全部如此。mimo-v2.5-pro 无此问题。

**判定**：wait 退出后查 part 表，如果只有 `type: "text"` 和 `type: "file"` 事件，无 `type: "tool"` / `type: "patch"` / `type: "step-finish"` → agent 只复读没动手。

**处理**：同 brief 换模型重派（mimo-pro → 火山 flash → go flash），不要同模型反复 dispatch（结果一样）。同一 brief 同一模型连续 2 轮复读 = 该模型对该任务不可用。

**⚠️ 不要浪费时间分析「为什么复读」**——直接换模型，效率最高。

## 相关 skill

- `gts-dev-fix` — fix 入口 skill(本 skill 提供上下文)
- `worktree-junction` — 三份文件结构来源之一(node_modules link 通过 junction 共享)
- `opencode-schedule` — 派工模型选择铁律源头