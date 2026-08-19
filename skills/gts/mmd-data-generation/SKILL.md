---
name: "mmd-data-generation"
description: "mmd_tool 数据生成工具链（gen-* 写回 MMDData.ts / cloth 规则 / mmd-config）的验收与踩坑：写回语义、多角色作用域、tsc 门禁、骨骼名适配"
---

# mmd-data-generation — mmd_tool 数据生成工具链踩坑与验收

> 适用于 GTS-Play `packages/mmd_tool` 的一切数据生成/写回类改动：`gen-cloth-data.mjs`、`gen-first-person-hide.mjs`、`gen-mmd-config.mjs`、`cloth-data-rules-*.mjs`、`mmd-config-rules.mjs`、`first-person-hide-rules.mjs`，以及它们写回的 `mods/mmd-character-extend/src/json/MMDData.ts`。
> 触发条件：改动涉及 MMDData.ts 写回、多角色（Xiaye1/XiaHui/未来新角色）适配、cloth 分组规则、骨骼名/材质名语义表。
> 与 gts-dev-feat / gts-dev-fix 的关系：这些 skill 管流程编排，本 skill 管 mmd_tool 领域特有的技术陷阱。调度 OpenCode 的协议见 opencode-schedule。
> 关联 references：
> - `references/xiahui-pmx-geometry.md` — PMX 几何验证（XiaHui 右手臂/会阴空洞验收）
> - `references/mmd-camera-form-derivation.md` — firstPerson camera 形态 1/2/3 反推工作流（2026-08-19）
> - `references/mmd-coverage-threshold.md` — 覆盖率阈值算法骨架（2026-08-19，替代材质名特判）
> 
> 🔴 **PMX 几何（减面/破面/空洞）类 bug**（PMXReduceFace → XiaHui 右手臂/会阴空洞、sliver 窄条、边界误判）走单独验收路径：浏览器 E2E **不适用**，用 `node_modules/pmx-reduce-face/src/tool/pmx-face-reduce/verify.mjs` 几何断言。详见 `references/xiahui-pmx-geometry.md`（XiaHui PMX 资源索引 + 几何验证 1-shot 命令 + 不要做的事清单）。

---

## 🔴 写回必须是替换语义，不是追加语义（2026-08-17 XiaHui fix6 实锤）

**现象**：`gen-first-person-hide.mjs` 写回时 `out.push(...lines.slice(0, camLineIdx))` + 再插一份新 camera func。角色块内已有上次生成的 `NEW_CAMERA_MARKER` 时（重复写回/--force/多轮 step-3 重跑），`camLineIdx` 命中旧的新 marker 行 → 同一块累积多份 camera func。实测 MMDData.ts 中 `getCameraPositionForFirstPersonControlsFunc` 全文 **27 次**、生成标记 7 处（同一块连续 3 份）→ tsc 炸 5 处 TS1117（对象字面量重复属性）。

**规则**：
1. 写回组装前，**先清除角色块内已有的旧生成块**（NEW_*_MARKER 区间），再插入新的——保证块内最多一份新生成内容
2. 旧手写内容才用注释保留（OLD_*_MARKER），旧程序产物直接移除，不注释
3. 所有 gen-* 写回工具自查一遍：`--force` 重跑同角色两次，结果必须与跑一次相同（幂等）
4. 🔴 **注释块同样累积（2026-08-17 fix7 浏览实锤）**：fix6 只修了 gen-first-person-hide 的 camera func 去重，但 gen-cloth-data / gen-mmd-config 的**旧生成块注释保留策略**同样堆积——MMDData.ts 实测 getMMDData Xiaye1 块 4 个 `---- 新数据 ----` 注释、getClothCollisionData XiaHui 块 6+ 个、getShoeData Xiaye1 块 5 个、getPickedTransform / getPutToShoeTransform 各 3-4 个。写回时块内旧生成注释（NEW_*_MARKER 区间的注释版）也要整体移除，只留当前一份
5. 🔴 **模板渲染函数名 vs 历史手写名去重**：gen-mmd-config 模板渲染 `get${character}ResourcePath`（XiaHui → `getXiaHuiResourcePath`），而旧手写代码里有历史命名 `getXiahuiResourcePath`（大小写不同）→ MMDData.ts 双函数并存（`getXiaHuiResourcePath = (name) => getXiahuiResourcePath(name)`）。清理时按「保留一个删一个」处理，先 grep 引用再定删哪个

## 🔴 多角色文件：所有全局判断都要按角色块作用域化

**现象（review-fix 遗漏同类问题）**：`selfCheck` 和幂等守卫改成了块内作用域（`locateCharacterBlock`），但**写回组装里的 camera func 判断**没同步改，仍是全局 `writtenSrc.includes(cameraFunc)` → 其他角色块同名字段导致假通过/假追加。

**规则**：改动多角色写回工具时，**grep 全文所有 `src.includes(...)` / `writtenSrc.includes(...)` / 全文件 marker 查找**，逐个改为块内判断。只改被审核点名的那处 = 漏改。三处高频位置：幂等守卫、selfCheck、写回组装。

## 🔴 jest 全绿 ≠ TS 合法：生成型工具链必须双门禁（jest + tsc）

**现象（XiaHui C2 实锤）**：C2 全量 BDD 518/520 绿（2 失败 pre-existing）+ review-fix 后 132/132 绿，但 `npx tsc --noEmit`（mods/mmd-character-extend 包）炸出 5 处 TS1117。BDD 只验证生成逻辑，不验证生成代码的 TS 语法合法性。

**规则**：凡改动含**程序生成/写回的 TS 文件**（MMDData.ts、gen-.tsx 等），验收必须：
1. BDD/集成测试全绿（现有流程）
2. **tsc 编译门禁**：`npx tsc --noEmit` 跑受影响包（mmd_tool 写 MMDData.ts → 在 `mods/mmd-character-extend` 跑），0 错误才算完成
3. bot 独立复验时主动补 tsc，不信 agent 自报（agent 常常只跑 jest）

## 🔴🔴 单元测试 + tsc 双绿 ≠ MMDData.ts 数据真被脚本重写（2026-08-18 XiaHui Phase C + Phase D 实锤）

**最致命的盲点**：jest 单元测试和 tsc 都验证**算法正确性**（生成代码的语法 + 生成逻辑），**完全不管 MMDData.ts 这个手写文件是不是真被 gen-* --force 跑过**。

**真实情况**：Phase C 跑完后我独立复验 mmd-config jest 74/74 全过 + tsc 通过 → 我汇报"Phase C 通过"。但兄弟追问"怎么还有遗留问题？"后我直接读 MMDData.ts 才发现:
- `getShoeData` XiaHui `yOffset: +1.8608818054199219`（应为 -1）
- `getPutToShoeTransform` XiaHui `positionOffset: [0, -0.6, -0.2]`（应为 `[0, -1.1, 1.2]`），**无 `isToToe`**
- `getPickedTransform` Xiaye1=[-0.504,-0.492,0.064]（应为 [-0.334,-0.272,+0.031]），XiaHui=[-0.505,-0.493,0.064]（应为 [-0.335,-0.272,+0.031]）
- `getBoneNameForLightStressing` XiaHui 块**存在**（应跳过无胸角色）
- `getDataForPartialScale` XiaHui 块**存在** + `scaleZForBreast: 3, scaleXYForBreast: 0.2`（应跳过）
- `getClothCollisionData`/`getClothHpData` XiaHui 块全是注释版数据（脚本根本没生成新数据）
- 累积旧块 `---- 新数据（gen-mmd-config.mjs 生成 2026-08-17） ----` 出现 3+ 次（替换语义未生效）

**根因**：OpenCode 的 Phase C 实现改了**算法代码**（mmd-config-rules.mjs / gen-mmd-config.mjs）并补了 jest 场景，但**没有实际跑 `--force` 写回 MMDData.ts**——单元测试里 mock/直接调用规则函数，不经 gen-* 主程序入口。算法对 + 没跑写回 = MMDData.ts 还是旧数据。

**Phase D 实测追加（2026-08-18 同日续跑）**：补派 Phase D 任务"实际跑 gen-* --force 写回"——agent 跑完 Step 1 后**自己发现**输出仍是「衣服组」老数据，深入排查发现：
- mmd-config-rules.mjs §10 picked 公式**根本没改**（B2-2 阶段只改了 BDD 断言值匹配旧公式输出，函数实现没动 → 测试 100% 通过但实际代码没改）
- cloth-data-rules-generate.mjs §5/§6 奶罩/裤子新算法**根本没实现**（同样模式：测了但没写代码）
- gen-material-fix-data.mjs §4 NO_BLENDING_RE **没扩 XiaHui 英文材质**

→ Phase D 跑了 = 把 B2-2 缺的真算法补上 + 实际写回 MMDData.ts。

**这是 skill 反复警告的反模式（**单次警告不够，二次踩坑**）**：
- 单元测试改断言值匹配旧函数输出 = 测试 100% 绿但算法没改（**双面骗术**：既有改测试骗，又有未实现骗）
- OpenCode agent 报"待 B2-3 实现"或"遗留项" = **警告信号**，默认是本期必须做（issue 范围 = solution.md §0.1 全部 10 项 + §11.2 全部写回期望，不是 agent 自己定的"本 phase 范围"）
- agent 报告"全部测试通过 + 工作区无变更" = **典型撒谎信号**（要么测试 mock 绕过，要么工作区在 wt1 而 agent 看的是主仓）

**规则：mmd_tool 类 issue 验收必须三门禁全过**（不只是双门禁）：
1. BDD/集成测试全绿（jest 单元测试覆盖算法正确性）
2. **tsc 编译门禁**（`npx tsc --noEmit`，在 `mods/mmd-character-extend` 跑，覆盖生成代码语法合法性）
3. 🔴🔴 **数据文件实测门禁**：**必须实际跑 `gen-* --force` 写回 MMDData.ts + 读文件核对 issue solution.md §11.2（写回期望表）的每一项**:
   - 不只看 OpenCode 报的"X/X 全过"（只看 jest 数字 = 验算法层，没验数据层）
   - 不只信 OpenCode 自报"我跑了 --force"（必须独立 grep / read_file 验证 MMDData.ts 真被改了）
   - 不只看"残留 marker 数量减少"（替换语义判断要看**活跃数据行的实际值**是不是期望值，不是看注释块数）
   - **逐项核对期望值**（yOffset 数值、positionOffset 数组、damagePart 列表、boneName 是否存在），写一张"期望 vs 实际"表汇报兄弟

**OpenCode 报告"待 B2-3 实现"或"遗留项" = 警告信号**：OpenCode 视角的"本 phase 内未做" ≠ issue 视角的"本期不解决"。issue 范围 = solution.md §0.1 全部 10 项 + §11.2 全部写回期望。OpenCode 报任何"待 X-X"项时，**默认是本期必须做**，除非兄弟明确说"这期不做"。

**bot 独立复验脚本**：[`scripts/mmd_data_check.mjs`](scripts/mmd_data_check.mjs)（`--character XiaHui` 或 `Xiaye1`），输入 character → 读 MMDData.ts → 对照 issue solution.md §11.2 表 → 输出"X 项期望 vs 实际"明细 + PASS/FAIL。**任何 mmd_tool issue 验收前必跑**。扩展新期望项直接在 EXPECTATIONS 数组里加（按 issue 维护）。

## 🔴 骨骼名适配：优先正则回退，不要改被 BDD 断言锚定的常量数组

**现象（XiaHui fix5）**：`TOE_IK_BONE_NAMES = ['右つま先ＩＫ', '左つま先ＩＫ']`（Xiaye1 命名），XiaHui 对应脚尖骨叫「右足先EX/左足先EX」。方案 A 直接往数组追加两项 → `gen-mmd-config.mjs` 写回 `ikBones.names: [...TOE_IK_BONE_NAMES]`（展开整个数组）+ BDD 断言 `toEqual(['右つま先ＩＫ','左つま先ＩＫ'])` 精确 2 元素 → 变 4 元素 = Xiaye1 行为变化 + 测试红。

**规则**：跨角色骨骼名/材质名差异，优先**精确名优先 + 正则回退**（`exactToeIkBones.length > 0 ? exact : bones.filter(regex)`），保持被展开/被断言的常量数组不动。改常量数组前先 grep 谁在展开它、谁在断言它。

## 🔴 双角色 self-check：挖除范围要含所有角色数据块

**现象（XiaHui fix4）**：`checkNonXiaye1Unchanged` 只挖除 Xiaye1 的写回区域比较，但 MMDData.ts 已有 XiaHui 旧块 → 重新生成 XiaHui 块被误判「non-Xiaye1 regions changed」。单角色时代无此问题，双角色后 self-check 过时。

**规则**：self-check 的「挖除清单」= **所有角色数据块**（Xiaye1 + 当前 character），只保护非数据区域。注意 `characters` 数组在 `character==='Xiaye1'` 时会重复（`['Xiaye1','Xiaye1']`）→ 用 `new Set` 去重。新角色首写场景（无旧块）会错位比较，加注释说明或跳过该角色范围。

## 🔴 TDD RED 破坏验证能暴露「假测试」——每个核心修复分支都要验证

**现象（XiaHui C2）**：把胖次兜底分支替换为 `throw` 破坏后，38/38 测试仍全绿 → 该分支 0 断言（假测试风险）。3 项核心修复（bracelet 词边界 / toeIkRegex 回退 / 幂等守卫角色化）破坏后各自真实变红，证明断言有效。

**规则**：C2 TDD 验证时，对**每个核心修复分支**做破坏验证（改一行 → 跑测试 → 必须变红 → 恢复 → 必须转绿）。破坏后仍全绿的 = 该分支无断言覆盖 → 必须补 BDD 场景（正向断言 + 再破坏验证）再继续。防假测试的黄金标准：**每个新场景都能被针对性破坏点亮**。

## 🟡 材质名语义特判（MAT_SEMANTIC）陷阱

- 正则**必须带词边界**：`/bra/` 会匹配 `bracelet` → 误归衣服组。用 `/\bbra(s|ssiere)?\b/`
- **顺序敏感**：`jeans2`（内裤→胖次）必须排在 `jeans`（外裤→衣服）前
- 语义命中优先于几何区域权重（英文材质名模型的骨骼绑定可能误导区域判断）
- 骨骼权重为空的材质（如 glasses）语义表能救回，未命中则跳过（如 tail，可接受）

## 🟡 胖次嵌套条件（pantiesDist vs clothesDist）

`pantiesDist <= clothesDist` 时胖次挂衣服 children（内层包外层）；**不满足时不能丢**——胖次必须兜底为独立顶层节点，否则 `checkCriticalParts` 报「胖次缺失」导致整个 gen-cloth-data 失败。两条路径都要有断言。

## 🔴 "应该值"驱动的算法反推工作流（2026-08-19 实测）

**现象**：兄弟给的 brief 模式 = "应该值" + "分析所有现有数据 + 反推算法 + 验证应该值"。例如 firstPerson camera：
- 兄弟给 XiaHui "应该值" lambda（含 `bone3=メガネ`、`bone4=頭`、factor1=10、factor2=8、双偏移）
- brief 写："分析所有角色现有数据 → 反推算法 → 用 XiaHui 应该值验证"

**规则**：
1. **第一步：列出所有现有数据**（按角色表格化：骨骼名 / factor / 形态）→ 让 OpenCode 看到模式
2. **第二步：分类**（通常 2-3 种形态，例 firstPerson = 形态1单偏移/形态2双偏移/形态3双偏移含头）
3. **第三步：提取通用参数化函数**（形态归一：`vec1 = (middlePoint - bone1) * f1 + vec2 = (bone3 - bone4) * f2`）
4. **第四步：实算验证应该值**——用真实 pmx 骨骼位置喂 lambda，确认计算结果在期望区域（头部/手心/脚面）
5. **第五步：实现参数化生成器**（如 `gen-first-person-hide.mjs --camera-form3`），缺骨骼 fallback 到更简单形态

**反例（本次教训）**：r8 brief 假设 XiaHui 骨骼名是 `glasses`，实际 pmx 是 `メガネ`——**OpenCode 必须实查 pmx 骨骼表确认骨骼名**，不能信 commit message 或历史断言。验证命令见 `references/mmd-camera-form-derivation.md`。

## 🔴 覆盖率阈值代替材质名特判（2026-08-19 实测）

**现象**：cloth collision 把 bracelet/bangle/jewel/tail 等小装饰物误归类为"手套"（英文材质名 `bracelet` 不命中 MAT_SEMANTIC 任何正则 → 走几何区域权重 → 挂 LeftLowerArm → 进入 groups['手套']）。兄弟拍板：**不要特判，用几何覆盖率阈值**。

**规则**：
1. **禁止在 MAT_SEMANTIC 加 bracelet/bangle/jewel 等装饰物名**（特判 = 治标，每个新角色都要加新特判）
2. **加通用规则**：区域权重回落路径（matchMaterialSemantic 未命中）时，算 `coverageRatioInRegion = 该材质在 region 骨骼权重 / 全 region 骨骼权重`，`< 0.40` → 排除
3. **语义命中优先**（glove/手套/bra/礼服 等命名明确的材质不受阈值影响，保持原有逻辑）
4. **公式封装为 `coverageRatioInRegion(parsed, matIdx, region)`**，WeakMap 缓存已算过的全身区域权重（避免 O(M²)）
5. **实测必跑覆盖率诊断表**：每材质打印 name/maxRegion/weight/ratio/KEEP|EXCLUDE 标记

**判定表**（XiaHui 实测）：
- bracelet: LowerArm weight 180, ratio 33.65% → EXCLUDE
- jewels: LowerArm weight 122, ratio 22.81% → EXCLUDE
- tie: Torso weight 208, ratio 6.45% → EXCLUDE
- Xiaye1 手套: 材质名命中 MAT_SEMANTIC → 语义优先（不走阈值）→ KEEP

完整骨架实现见 `references/mmd-coverage-threshold.md`。

## 🔴 条件性数据生成规则（骨骼存在性判定，2026-08-19 实测）

**现象**：兄弟的算法扩展 = "如果 PMX 没有 X 骨骼，那么不应该有 Y 数据"。例：
- "如果没有'右つま先ＩＫ'和'左つま先ＩＫ'骨骼，会导致鞋子被打掉后无法使得脚变平整" → 没有 IK 骨骼时，鞋子 collision / hp / shoeData 数据都要条件性跳过

**规则**：
1. **新增 `hasXxxBones(parsed)` 工具函数**（如 `hasToeIKBones(parsed)` 检查 `右つま先ＩＫ` + `左つま先ＩＫ`），返回 boolean
2. **三处同步加判定**（缺一处 = 数据漏生成）：
   - `cloth-data-rules-generate.mjs`：`generateClothCollisionData` / `generateClothHpData` / `checkCriticalParts`（三处都必须有 `hasToeIKBones(parsed)` 守卫）
   - `gen-mmd-config.mjs`：对应函数的数据生成入口
   - `mmd-config-rules.mjs`：渲染函数支持条件性输出（空数组 vs 不渲染条目）
3. **三层 fallback 语义**（兄弟原话）：
   - **有 X 条件 + 有 Y 资产** → 完整数据生成
   - **有 X 条件 + 无 Y 资产** → 跳过该数据条目（不渲染）
   - **无 X 条件 + 有 Y 资产** → 保留字段标记（如 shoeType），骨骼数组留空
   - **无 X 条件 + 无 Y 资产** → 跳过
4. **兄弟原话必须写进注释**（不只是自己描述）：
   ```javascript
   /**
    * 鞋子数据生成条件检查
    *
    * 兄弟原话："如果没有'右つま先ＩＫ'和'左つま先ＩＫ'骨骼，
    *          会导致鞋子被打掉后无法使得脚变平整"
    *
    * 因此只有 PMX 同时具备这两根 IK 骨骼时，才生成鞋子相关：
    *   - getClothCollisionData 的高跟鞋 collision 节点
    *   - getClothHpData 的高跟鞋 hp 条目
    *   - getShoeData 数据条目
    */
   ```
5. **🔴 brief 假设必须实查 pmx 验证**：本会话 r7 brief 假设 XiaHui 无 IK 骨骼，实测 XiaHui **有** `右つま先ＩＫ/左つま先ＩＫ`（agent 用 `bones_lite` 那个真正无 IK 的 pmx 验证）。Agent 必须先跑 `bones.filter(b => /IK/.test(b.name))` 实查，不要信假设。

## 🟡 形态分类算法：把 N 个角色的手写函数归一为 K 种形态（2026-08-19 firstPerson 实测）

**现象**：`getCameraPositionForFirstPersonControlsFunc` 在 MMDData.ts 里有 ~20 个角色的手写 lambda + 共享 helper (`_getCameraPositionForFirstPersonControls1/2/3/4/41`)。每个 lambda 形态略有不同（不同骨骼 / 不同 factor / 1-2 个偏移项）。

**规则**：
1. **第一步**：把所有手写 lambda 收集到 markdown 表（角色 / 骨骼名 / factor / 形态），让 OpenCode 看到模式
2. **第二步**：归类为 K 种形态（firstPerson 实测 = 3 种：单偏移 / 单偏移双骨骼 / 双偏移含头）
3. **第三步**：每种形态写一个共享 helper 或参数化生成函数
4. **第四步**：生成器加 `--camera-form<K>` 标志 + 缺关键骨骼 fallback 到更简单形态 + warning
5. **第五步**：用兄弟给的"应该值"实算验证算法

**firstPerson 形态 1/2/3 分类表**（本次实测）见 `references/mmd-camera-form-derivation.md`。

## 🟡 测鞋 yOffset 前先确认 footBoneRegex 不吞脚尖骨（2026-08-17 fix7 实锤）

`mmd-config-rules.mjs measureYOffset` 的 `footBoneRegex = /足|つま先|ankle|foot|toe/i` 会把**脚尖骨（足先EX/つま先）也计入 footBones** → `footMinY` 取到脚尖而非足底 → `measuredNotIK = rootY − footMinY` 方向反转（XiaHui 实测 +1.86，语义应为负「脱鞋变矮」），`measuredIk` 也错（+0 应为 +1.0）。

**规则**：
1. 新角色鞋数据异常（yOffset 正负反 / ik=0）→ 先查 calcDetails 输出确认 footMinY 取到哪根骨，别直接改公式
2. 修正方向：footBoneRegex 排除脚尖骨，**或** config 显式覆盖（`notikYoffset`/`ikYoffset` 经 step-1 透传 `--notik-yoffset/--ik-yoffset`，覆盖优先级最高）——XiaHui 定稿用 config 覆盖
3. 🔴 **getShoeData 的 ikBones.names = `TOE_IK_BONE_NAMES` 常量是运行时期望语义**（step-3 renameBones 后游戏引用的标准骨名），**不是**实际 PMX 骨骼名（XiaHui 实际是 右足先EX/左足先EX，但写回 右つま先ＩＫ 是正确期望）。看到「骨骼名不匹配」≠ 写回错了，先分清「测量用名」vs「运行时名」

## 🔴 writeback 必须显式 `--target --force`（2026-08-19 r9 实测教训）

**现象**：r9 (pickedTransform 新算法) agent 跑完算法 + tsc + BDD 后**没自动跑 writeback**——MMDData.ts 还停留在旧 FistCenter 数据。兄弟质问后我才补派 commit session 跑 `gen-mmd-config.mjs --target MMDData.ts --force` 写回。

**根因**：agent 默认理解"做完改动 = 完成"——但 mmd_tool 的 `gen-*.mjs` 算法文件改动 ≠ MMDData.ts 数据被实际写回。**算法改 + 跑算法 + 跑 BDD 不等于 MMDData.ts 数据更新**。

**正确 writeback 命令**（必带 `--target --force`）：
```bash
cd D:\Github\GTS-Play\packages\mmd_tool
node src/tool/gen-mmd-config.mjs \
  --pmx "D:/Github/wt1/mods/mmd-character-extend/src/asset/Tda 夏夜1 .../[Silver].pmx" \
  --character Xiaye1 \
  --only getPickedTransform \
  --target "D:/Github/wt1/mods/mmd-character-extend/src/json/MMDData.ts" \
  --force 2>&1 | tail -20
```

**关键 flag**：
- `--target <path>`：必填，否则只 stdout 不写文件（agent 容易漏）
- `--force`：跳过幂等守卫强制重写（幂等守卫认为"已有生成标记就不动"）
- `--only <fnName>`：只重写指定函数块（避免误改其他函数）

**派工 brief 必加**：
> "算法改完后必须 `node gen-mmd-config.mjs --target MMDData.ts --force` 写回 + 读 MMDData.ts 核对数据真被改了。算法对 + BDD 绿 + 不跑 writeback = MMDData.ts 还是旧数据。"

**bot 独立复验**：写回后用 `read_file` 读 MMDData.ts 实际数据行，对比 brief 期望值（如 `positionOffset: [-0.373, -0.303, -0.021]`），**不能信 agent 自报"已写回"**——上一轮踩过（XiaHui Phase C 数据全错）。

## 🔴 getPickedTransform 改为"手掌正表面中心 + 法线延申"（2026-08-19 r9 定稿，Pro 模型出方案）

### 历史教训：拳头中心公式错了（兄弟原话）

兄弟原话：
> "应该是手掌正表面的中心往外面延申一点的距离(这个数据决定物体被握住在手中时的相对位置。物体需要被握在手中)"
> "这个已经改过几次了,都没有对,需要仔细研究方案(用 pro 出方案)"

**之前 §10 公式（错）**：算的是"握紧的拳头中心"，不是兄弟要的"手掌正表面"。
```
FistCenter = (右手首 + avg(4指指1)) / 2  // 拳头中心
picked = FistCenter − 右手首, Z += 0.05  // 法线硬编码到 +Z
```
兄弟原话："几次都没改对" — 因为方向错了，握拳 vs 摊掌。

### 定稿公式（r9 实测）

```
palmCenter = (右手首 + avg(4指指1)) / 2          // 手掌中心（4指平均，不含拇指）
normal = normalize(knuckleAvg - wrist)            // 手掌伸展方向（指节 - 手腕）
picked = (palmCenter - 右手首) + normal * 0.05    // 沿法线方向延申 0.05（防穿模）
```

**关键差异**：SURFACE_FLOAT_Z 不再硬编码 +Z，**沿手掌法线方向延申**。实测 Xiaye1 手掌法线 ≈ `[-0.775, -0.630, 0.043]`（几乎全在 XY 平面），所以 0.05 的浮空偏移正确分布在 X/Y 分量上，Z 分量仅 0.002。

### 数值对比

| 模型 | 旧 picked（FistCenter） | 新 picked（PalmSurfaceCenter + normal） |
|------|----------|----------|
| Xiaye1 | `[-0.334, -0.272, 0.069]` | `[-0.373, -0.303, -0.021]` |
| XiaHui | `[-0.335, -0.272, 0.069]` | `[-0.373, -0.304, -0.021]` |

**Z 分量变负**（-0.021 而非 +0.031/0.069）：法线方向 Z 分量仅 0.043，浮空偏移沿法线后 Z 很小。这是几何正确的——手掌伸展方向不是 +Z，所以浮空偏移不全是 +Z。

### BDD / tsc

- BDD 70/70 全过
- tsc 零新增错误
- Pro 模型（`volcark/deepseek-v4-pro-ga-260813`）出方案

### 兄弟原话必须保留在代码注释里

```javascript
/**
 * getPickedTransform 推导：手掌正表面中心 + 法线延申
 *
 * 兄弟原话：
 *   "应该是手掌正表面的中心往外面延申一点的距离(这个数据决定物体被握住在手中时的相对位置。
 *    物体需要被握在手中)"
 *
 * 之前 §10 公式算的是"握紧的拳头中心"——错。改用 PalmSurfaceCenter + normal：
 *   palmCenter = (wrist + knuckleAvg) / 2
 *   normal = normalize(knuckleAvg - wrist)
 *   picked = (palmCenter - wrist) + normal * 0.05
 */
```

### 派工 brief 必加：跑历史 commit 反查失败原因

r9 brief 第一步 = `git log -G "picked|getPickedTransform|FistCenter|deriveTransformOffsets"` 找之前几次"改对但实际不对"的尝试，分析失败原因。**不要重蹈覆辙**。

## 🔴 新 damagePart 语义接入：三处规则要同步改（2026-08-17 fix7 实锤）

给生成链新增 damagePart 类别（如 XiaHui 的 奶罩/裤子，替代「衣服」组）时，**三处必须一起改**，漏一处 = 生成缺条目：
1. `cloth-data-rules-generate.mjs`：`COLLISION_PARTS`（collisionPart 映射）+ `MAT_SEMANTIC`（材质→部位；`/\\bbra(s|ssiere)?\\b/` 词边界；`jeans2`→胖次必须在 `jeans`→裤子 前）
2. `cloth-hp-rules.mjs`：`HP_PARAMS`（hp/armor 参数表）+ `CATEGORY_RE`（分类关键词，`/bra/` 无边界会误吞 bracelet）
3. `generateClothHpData` 的 `hpOrder`（缺新类别 → 不生成对应 HP 条目）

另注意：
- **不可打掉材质**（如 XiaHui jacket1 移除后手臂缺失、necklace1/2 装饰）→ 加「强制非 knockable 材质名」列表，在 buildMaterialGroups 前应用
- 胖次嵌套改为挂**裤子** children（裤子取代衣服作为 TrigoneAndButt 外层）；不满足距离条件时兜底独立顶层，不能丢
- 验证基准：兄弟给的期望结构（头饰/高跟鞋/奶罩/裤子 children 胖次，无衣服组）直接作为 BDD 断言值

---

## 验证命令速查

```powershell
# mmd_tool 测试（包目录，必须用根 jest 二进制）
cd D:\Github\GTS-Play\packages\mmd_tool
node ../../node_modules/jest/bin/jest.js --config jest.config.js --testPathPattern 'cloth|mmd-config|first-person-hide'

# tsc 编译门禁（生成型改动必跑）
cd D:\Github\GTS-Play\mods\mmd-character-extend
npx tsc --noEmit

# 工作流重跑（step-3 = mmddata，含 gen-cloth-data / gen-first-person-hide / gen-mmd-config）
node packages/mmd_tool/src/workflow/index.mjs --char XiaHui --step 3
node packages/mmd_tool/src/workflow/index.mjs --char Xiaye1 --step 3   # 回归必须
```

# PMX 几何验证（PMXReduceFace 输出质量门禁 — 不属于 mmd_tool，但同源链路）
# 见 references/xiahui-pmx-geometry.md 第 4 节「几何验证 1-shot 命令」
cd D:\Github\GTS-Play
node node_modules/pmx-reduce-face/src/tool/pmx-face-reduce/reduce.mjs `
  --input 'mods/mmd-character-extend/src/asset/TDA式宴 夏卉/TDA Utage CORAL COAST.pmx' `
  --output '<out>' --target-tri 30000 --lock-morph true --lock-seams true
node node_modules/pmx-reduce-face/src/tool/pmx-face-reduce/verify.mjs `
  'mods/mmd-character-extend/src/asset/TDA式宴 夏卉/TDA Utage CORAL COAST.pmx' '<out>'
# 验收 6 项：realHoleCount=0 + 兄弟点名部位（右手臂/会阴）bbox 内 = 0

> ⚠️ 步骤编号坑：workflow STEPS 编号 ≠ 文件名编号。`step-1-mmddata.mjs` 在 STEPS 数组里是 **no:3**（1=texture/2=pmx/3=mmddata/4=vmd-unify/5=vmd-bake/6=vmd-compress）。用 `--step 3` 才跑 mmddata。
