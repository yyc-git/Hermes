---
name: "mmd-tool-character-adaptation"
description: "mmd_tool 新角色接入工作流的适配坑：cloth 语义特判词边界、胖次嵌套丢弃、self-check 单角色硬编码、骨骼命名差异、checkCriticalParts 模型感知、.done 按角色区分。触发：处理新 MMD 角色（如 XiaHui/夏卉）或 mmd 角色工作流 step-3 mmddata 报错。"
---

# mmd-tool-character-adaptation — mmd_tool 多角色接入适配

> GTS-Play `packages/mmd_tool` 工作流（step-1~6）原为单角色 Xiaye1 设计，接入第二个角色（XiaHui/夏卉，TDA 式宴模型）时暴露一批「单角色硬编码」坑。本 skill 收录这些**类级适配经验**，新角色接入时逐项对照。

## 触发条件

- 兄弟要求处理新 MMD 角色（`feat:` 或直接指令，结果放 `_opt` 目录）
- mmd 角色工作流 `node packages/mmd_tool/src/workflow/index.mjs --char <角色> --step 3` 报 gen-cloth-data / gen-first-person-hide / gen-mmd-config 失败

## 工作流基础

- 配置：`packages/mmd_tool/src/workflow/config/<角色小写>.json`（steps.mmddata.params: scale/scaleZ/scaleXY/noShoe）
- 角色 PMX：`mods/mmd-character-extend/src/asset/<角色>_opt/`；结果 MMDData.ts 在 `mods/mmd-character-extend/src/json/MMDData.ts`
- **step 编号 ≠ 文件名**（易踩）：STEPS 数组 `{no: 1, name: "texture", module: step-2-texture.mjs}`、`{no: 3, name: "mmddata", module: step-1-mmddata.mjs}` — **`--step 3` 才是 mmddata（gen-cloth-data 所在步骤）**，`--step 1` 是 texture。恢复/重跑前先看 index.mjs 的 STEPS 定义，别凭文件名猜编号
- 幂等：每步完成写 `.workflow/step-N-<name>.done`，存在且未 `--force` 则跳过；**.done 按角色区分**（workflow-logger.mjs 已修）——看到 `.done` 存在不代表当前角色完成，读文件内容里的 `char` 字段确认

## 🔴 角色适配六坑（按出现频率排序）

### 坑 1：cloth 语义特判正则无词边界（MAT_SEMANTIC）

`cloth-data-rules-generate.mjs` 的 `MAT_SEMANTIC` 数组按材质名语义归类（优先级高于几何区域）。**英文词必须带词边界**：

```js
// ❌ 错误：/bra/ 匹配 bracelet（含 "bra" 子串）→ 手镯误归衣服组
{ re: /...|bra|.../, part: '衣服' }
// ✅ 正确：/\bbra(s|ssiere)?\b/ — bracelet 不再误匹配
```

- 顺序敏感：`jeans2`（内裤）必须在 `jeans`（外裤）前
- 语义命中优先于几何区域权重——英文材质名模型（XiaHui）几何绑定可能误导（牛仔裤绑髋骨）

### 🔴 坑 1b：bracelet 误判为手套的真正机制（2026-08-19 实测，词边界修不够）

**实测场景**（XiaHui TDA式宴模型）：`bracelet` 材质（360 面 / 1.06%）走 `cloth-data-rules-generate.mjs` 算法被归类到 `groups['手套']`，最终 MMDData.ts 里出现 `damagePart: "手套", damageParts: ["bracelet"]` 的错误条目。

**两条独立误判路径**（必须都堵）：

**路径 A — 词边界问题**（已在坑 1 修复）：
- `/bra/` 命中 `bracelet` → 错归 "衣服" 组（`/\bbra(s|ssiere)?\b/` 修后解决）

**路径 B — 区域权重回落（2026-08-19 实锤，词边界修了仍误判）**：
- `bracelet` 不命中任何 MAT_SEMANTIC 正则（glove/手套/グローブ/bra/jeans 等都没 bracelet）
- 走 `collectRegionWeights(parsed, mi)` → bracelet 顶点骨骼权重大概率挂 `LeftLowerArm`
- `mapCollisionPart` 吸收 Foot/Hand → regions = ['LowerArm']
- `DAMAGE_PART_OF_REGION.LowerArm = '手套'` → 进入 `groups['手套']`
- **结果**：XiaHui bracelet 仍被错归为"手套"

**🔴 兄弟拍板（2026-08-19 实测定稿）：不用特判，用几何覆盖率阈值**

> 「**只用几何覆盖率阈值，不要特判**——材质覆盖了 collisionPart 对应区域的大部分面积（>40%）才计入该部位」

**落地语义**（改 `cloth-data-rules-generate.mjs` 的 `buildMaterialGroups`）：
1. 新增 `coverageRatioInRegion(parsed, matIdx, region)` 函数：
   - 算该材质在指定 region 的骨骼权重和（复用 `collectRegionWeights`）
   - 算该 region 在全身所有材质（身体+非身体）的骨骼权重总和
   - 返回 `ratio = matWeightInRegion / totalRegionWeight`
2. 在 `buildMaterialGroups` 里，材质走"区域权重回落"路径（即 `matchMaterialSemantic` 未命中）→ 进入 `groups[part]` 前**额外判定** `coverageRatio >= 0.40`
3. **< 0.40 → 该材质不进 groups**（视为装饰物排除）
4. 命名命中（glove/手套/bra/jeans 等）→ 直接归类，不走覆盖率阈值

**为什么不用特判**：
- 兄弟原话：「bracelet 只是左手上的手镯，覆盖面积非常小，应该忽略不计」→ 表达的是"任何小装饰物都该排除"，不是"bracelet 这个词要特判"
- 特判无法覆盖未来新角色（jewelry/ring/anklet/wristband/bangle/cuff 等）→ 几何阈值通用
- Xiaye1 的"手套"材质 1434 面 / 4.43%，手部区域覆盖率 >40% → 保留（几何阈值正确）

**派工 brief 必填**（任何 mmd-data 类 issue 派 OpenCode 必跑实测）：
```bash
# 验证 XiaHui 不再有"手套"误判
cd D:\Github\wt1\packages\mmd_tool
node --input-type=module -e "
import {parser} from './src/tool/pmx-physics-reduce/pmx-loader.mjs';
import {generateClothCollisionData, generateClothHpData} from './src/tool/cloth-data-rules-generate.mjs';
import fs from 'fs';
const buf = fs.readFileSync('D:/Github/wt1/mods/mmd-character-extend/src/asset/TDA式宴 夏卉_opt/TDA Utage CORAL COAST.optimized.pmx');
const m = parser.parsePmx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), false);
const cd = generateClothCollisionData(m);
const hasGlove = cd.some(n => n.damagePart === '手套') || cd.some(n => n.children?.some(c => c.damagePart === '手套'));
console.log('XiaHui has 手套?', hasGlove, hasGlove ? 'FAIL' : 'PASS');
"
```

**记忆点**：
- **bracelet 误判 = 两条路径并存**（词边界 + 区域回落），只修一条不够
- **兄弟设计哲学：几何判定 > 名字特判**——任何"小装饰物该排除"都该用几何阈值而非关键词表
- **覆盖率阈值仅对"区域回落"路径生效**——命名命中（手套/glove/bra/jeans）不受影响，避免误伤显式材料
- **新角色接入必跑双角色回归**：Xiaye1（保留手套）+ XiaHui（无手套）+ 未来角色，确保覆盖率算法不误判

### 坑 2：胖次嵌套距离条件丢弃

`generateClothCollisionData` 把胖次作为衣服 children，条件是 `pantiesDist <= clothesDist`（内层包外层）。**条件不满足时胖次节点整体消失** → `checkCriticalParts` 报「胖次缺失」：

- 修复方向：不满足嵌套条件时，胖次**兜底为独立顶层节点**（splice 到衣服之后），damagePart='胖次'；满足时维持 children（Xiaye1 回归锚点）
- 胖次必须是「children 或独立节点二选一」，不能两者都生成

### 坑 3：self-check 单角色硬编码（双角色误报）

`gen-cloth-data.mjs` / `gen-first-person-hide.mjs` / `gen-mmd-config.mjs` 的写回 self-check（如 `checkNonXiaye1Unchanged`）**只挖除 Xiaye1 的写回区域**比较其余不变。MMDData.ts 已有旧角色块时，新角色重新生成（`--force`）的块被误判为「非 Xiaye1 区域变化」→ `self-check failed: non-Xiaye1 regions changed`：

- 修复方向：self-check 挖除**所有角色**的写回区域（Xiaye1 + 当前角色），只保护真正的非数据区域
- 单独 CLI 跑 `gen-cloth-data` exit=0 ≠ 全绿——**必须跑 workflow step-3 集成路径**，self-check 只在 workflow 里带 `--force` 重写时触发

### 坑 4：骨骼命名差异（TOE_IK_BONE_NAMES 等硬编码骨骼名）

`mmd-config-rules.mjs` 硬编码 Xiaye1 骨骼名：`TOE_IK_BONE_NAMES = ['右つま先ＩＫ', '左つま先ＩＫ']`。新角色骨骼名不同 → `measureYOffset` 找不到 toe IK → `ikYOffset=null` → `manualFieldsNeeded: ikBones.yOffset` → gen-mmd-config 拒绝写回（exit 1）：

- **实测**：Xiaye1 有 `右つま先ＩＫ`（y=0.279）；XiaHui 无此骨，脚尖骨是 `右足先EX`（y=0.347）
- 修复方向：**首选正则回退（方案 B，2026-08-17 fix5 实测定稿）**——`measureYOffset` 精确名优先 + `toeIkRegex = /つま先ＩＫ|足先EX/` 回退，**TOE_IK_BONE_NAMES 保持零改动**。⚠️ 方案 A（直接往数组加 `右足先EX` 两项）会破坏 Xiaye1 回归：BDD 断言 `toEqual(['右つま先ＩＫ','左つま先ＩＫ'])` 精确 2 元素，加元素变 4 → 直接红。**改共享常量/数组前先查测试是否有精确长度断言（toEqual/toContain 精确元素数）**
- 诊断方法：临时脚本读 PMX 骨骼名（`_tmp-xiahui-feet.mjs` 模式，用 `pmx-physics-reduce/pmx-loader.mjs` 的 `parser.parsePmx`），关键词过滤 `足|つま先|ＩＫ|下半身|上半身`，对比两角色命名
- transform 的 fallback warning（关键骨骼缺失用默认值）**可接受**，不是阻塞；真正阻塞只有 manualFieldsNeeded 字段
- ⚠️ **ikYOffset=0 是合法测量值，不是缺失**（2026-08-17 fix5 后 review 确认）：`footBoneRegex` 把脚尖骨计入 footBones，脚尖目标骨恰为最低足骨时 `measuredIk = toeIkY - footMinY = 0`（XiaHui 实测）。后续看到生成 `ikYOffset=0` 不要误当测量失败去加覆盖参数；应在 calcDetails/注释中注明「0 = 目标骨即最低足骨」语义（🟡6 修复项）

### 坑 6：gen-* 幂等守卫全局判断（多角色误判 already generated）

`gen-first-person-hide.mjs`（约 152 行）等工具的**写回前幂等守卫** `if (!opts.force && src.includes(GENERATION_MARKER))` 是**全文件全局判断**。MMDData.ts 含任一角色生成块（有 marker）后，对任何角色非 `--force` 写回都误判 `already generated`：

- 症状（2026-08-17 review 实测）：`first-person-hide.steps.ts` 2 失败（`Expected 12, Received 13` / `oldCameraLineCommented=false`）。根因链：BDD helper 基于 live MMDData.ts 重建 pristine（只还原 Xiaye1 块），残留 XiaHui 的 marker → 脚本 `already generated` exit=1 → helper 取全文件首个 marker（XiaHui 13 项英文数组）断言失败
- 修复方向：幂等守卫按目标角色块作用域判断（仿 selfCheck 用 locateCharacterBlock 先定位角色块再查 marker）；BDD helper 可改静态 baseline fixture（仿 cloth 套件的 `MMDData.cloth-baseline.ts`），不依赖 live 文件状态
- 与坑 3（self-check）区别：self-check 是「写回后比较非数据区域不变」，幂等守卫是「写回前判断是否已生成」——**两处都要角色化**。修复后必须跑 `npx jest --config jest.config.js --testPathPattern 'first-person-hide.steps'` 验证

### 坑 5：checkCriticalParts 模型感知

`checkCriticalParts` 全量要求所有关键部位（头饰/丝袜/手套/衣服/胖次/高跟鞋）。新角色**根本没有某部位材质**（如 XiaHui 无丝袜）→ 永远误报缺失：

- 修复方向：模型感知——无对应材质的关键部位不再要求；退化保护（模型完全无可打掉部位，如空 PMX）仍全量要求（保留 3.7 回归测试）

## 验证门禁(每次修复必须全绿)

1. 分组诊断:跑 bot 的临时诊断脚本(`_tmp-xiahui-group-check.mjs` 模式),确认输出含预期分组 + `critical missing` 为空
2. 重跑角色 step-3:`node packages/mmd_tool/src/workflow/index.mjs --char <角色> --step 3` → exit=0
3. **回归锚点角色**(Xiaye1)step-3 重跑 → exit=0(self-check 必须仍保护旧角色)
4. cloth 相关测试:`npx jest --config jest.config.js --testPathPattern 'cloth'`
5. 验证 MMDData.ts 中新角色块存在且 damageParts 正确

### 🔴 验证 5 的真实盲区(2026-08-18 XiaHui Phase Fix-r2 实测教训)

**坑**:bot 跑过 `damageParts` 字面存在的检查后报"§11.2 全过",但实际:
- `damagePart: "头饰"` 存在,但 **没 `damageParts` 数组**(应含 `[hat, glasses]`)
- `damagePart: "手套"` 存在,但 **没 `damageParts` 数组**(应含手套材质名)
- `damagePart: "奶罩"` 存在,但 `damageParts: []` 是空数组(不算"有")

**根因**:agent 验证 §11.2 时**只断言顶层字段名存在**(`damagePart: "奶罩"` 命中),**没断言嵌套结构完整性**(`damageParts: ["Bra", "tie"]` 数组存在 + 非空 + 含关键元素)。bot 也跟着信 agent 的"全过"。

**强制最小验证集**(mmd-data 类 issue 必须由 bot 自己跑,不能信 agent 报告):

```powershell
# 1. 每个 damagePart 必须配 damageParts 数组(除非全局 body/shoeDamagePart)
$lines = Get-Content "mods/mmd-character-extend/src/json/MMDData.ts"
for ($i=0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -match "mmdCharacter: mmdCharacter\.<角色>," -and $lines[$i] -notmatch "^\s*//") {
    $hasDP = $false
    for ($j=$i+1; $j -lt [Math]::Min($i+30, $lines.Count); $j++) {
      if ($lines[$j] -match "^\s*\},\s*$") { break }
      if ($lines[$j] -match "damageParts:\s*\[" -and $lines[$j] -notmatch "^\s*//") {
        $hasDP = $true
        # 检查数组是否真非空(下一行有元素而非 ])
        $next = $lines[$j+1].Trim()
        if ($next -match "^\]" -or $next -match "^//") {
          Write-Host "line $($i+1): damageParts 数组空!"
        }
        break
      }
    }
    if (-not $hasDP) { Write-Host "line $($i+1): 缺 damageParts 数组!" }
  }
}

# 2. §1 双函数去重:grep 应该只 1 个 export
Select-String -Path "mods/mmd-character-extend/src/json/MMDData.ts" `
  -Pattern "export let (getXiaHuiResourcePath|getXiahuiResourcePath|get<其他角色>ResourcePath)" `
  | Measure-Object | ForEach-Object { Write-Host "<角色> resourcePath 函数数: $($_.Count) (期望 1)" }

# 3. 注释式旧块:grep 累积 marker 应 ≤ 文件数
Select-String -Path "mods/mmd-character-extend/src/json/MMDData.ts" `
  -Pattern "---- 新数据（gen-.*\.mjs 生成" | Measure-Object | ForEach-Object {
  Write-Host "累积 marker 数: $($_.Count)"
  Write-Host "  → 应 ≤ 角色数 (每个角色块最多 1 个新 marker)"
}

# 4. 期望值精确匹配(非范围断言):§11.2 期望值要 toEqual 精确,不是 toBeCloseTo 范围
# 例:yOffset === -1 精确,不是 yOffset ≈ -1
```

**结论**:`OpenCode` 报告 "§11.2 验收全过" 不是终点。bot 必须按 issue §11.2 表格**逐字段 + 嵌套结构**自己 grep 验证。任何 FAIL → 立刻派 `Phase Fix-r2`,不能直接判完成。

### 坑 7：pmx-reduce-face `lockSmallMaterials` 与设计意图错位(2026-08-19 实测)

**🔴 致命陷阱**:`pmx-optimize/optimize.mjs` 第②步减面调 `reduceFaces(... lockSmallMaterials: true ...)`(`packages/mmd_tool/src/tool/pmx-optimize/optimize.mjs:90-98`)。**`lockSmallMaterials` 的语义不是「按材质类型锁」(衣服/身体/五官),而是「按 face-count 阈值锁」**——只锁**小材质**(face 数 ≤ 某个阈值),**大材质一律进 QEM 减面**。

**实测数据**(2026-08-19,原始 PMX = `TDA式宴 夏卉/TDA Utage CORAL COAST.pmx`, 2,360,616 bytes, 总面 ~32k):
```
lockedCount: 24936  // 总面 32k 里锁了 24936 → 只剩 7k+ 给 QEM
reductionMet: false  // 没达到 ≤ 30000 目标(因为 lock 太多)
```

减面前后材质面数对比(全 33 个材质):
| 材质 | 原面 | 减后 | 减幅 | 类型 |
|------|------|------|------|------|
| **jacket1** | 6796 | 6752 | **-44** | 上衣(最大,本应锁) |
| Skin01 | 4854 | 4718 | -136 | 身体 |
| jeans1 | 3622 | 3602 | -20 | 裤子 |
| face | 2020 | 1723 | -297 | 脸 |
| hear1 | 1961 | 1906 | -55 | 头发 |
| shoes | 1694 | 1694 | 0 | (锁了) |
| Hair | 1636 | 1587 | -49 | 头发 |
| **eye extra** | 1420 | 1314 | **-106** | 眼睛(本应锁) |
| **tie** | 768 | 394 | **-374** | 领带(减半,本应锁) |
| skin02 | 631 | 629 | -2 | (虽然小但没锁死) |
| Bra | 552 | 506 | -46 | 奶罩(本应锁) |

**根因诊断路径**:
1. **看到面数减少**(jacket1 6796→6752)→ ❌ 不要先去 MMDData.ts 找 cloth collision 配置
2. **MMDData.ts cloth collision 不定义面数**——它只定义材质碰撞关系
3. **真正改面数的是 pmx 二进制 → reduceFaces() 的 QEM 算法**
4. **兄弟原话(2026-08-19)**: 「这跟骨骼精简无关 bones_lite,因为 TDA Utage CORAL COAST.optimized.pmx 也有该问题」——optimize.pmx 已经在 optimize 阶段就被减面,根本走不到 bones_lite

**派工前反向断言清单**(本坑专用,任何"jacket1 / X 材质面数减少"类问题必走):

```powershell
# 1. 直接实测 reduceFaces 当前输出(empirical data, 不要信 commit message / agent 自报)
cd D:\Github\wt1\packages\mmd_tool
node -e "
import('pmx-reduce-face/src/tool/pmx-face-reduce/reduce.mjs').then(async ({reduceFaces}) => {
  const r = await reduceFaces({
    input: 'D:/Github/wt1/mods/mmd-character-extend/src/asset/TDA式宴 夏卉/TDA Utage CORAL COAST.pmx',
    output: require('os').tmpdir() + '/test.pmx',
    targetTriangles: 30000, lockMorph: true, lockSeams: true,
    minRetention: 0.3, lockSmallMaterials: true
  });
  // 只列 jacket1
  for (const m of r.perMaterial || []) {
    if ((m.name||'').toLowerCase().includes('jacket')) console.log(JSON.stringify(m));
  }
});
" 2>&1

# 2. 兄弟期望: jacket1 origTri 应 = newTri(全锁),实测 origTri=6796 newTri=6752 delta=-44 = bug
```

**修复方向**(2026-08-19 兄弟未拍板,候选方案):
- **方案 A(改 pmx-reduce-face)**: 新增 `lockByName: string[]` 选项,接受外部传入「必须全锁的材质名列表」(从 cloth collision 配置推断出哪些材质不能动)
- **方案 B(改 optimize.mjs)**: 在调 reduceFaces 前读 MMDData.ts 的 cloth collision 配置,把所有 damagePart 对应的材质名传给 lockByName
- **方案 C(改 lockSmallMaterials 阈值)**: 把阈值提到 jacket1 面数级别(如 7000+)→ 大多数衣服都会被锁,只有超大材质(脸/身体)被减
- **方案 D(调 minRetention)**: 把 minRetention 从 0.3 提到 0.95 → QEM 几乎不动

**🔴 验收方式**(任何方案修复后必跑):
1. **jacket1 实测** = origTri(原始 6796 面,不被减面)
2. **全材质减幅表** — 衣服/身体/五官类材质 delta 应全为 0
3. **目标 tri 数** 达成(reductionMet=true)且 jacket1 / Skin01 / face / eye extra 等都 0 减幅

**记忆点**:
- **cloth collision 配置 ≠ pmx 面数**: cloth collision 是 MMDData.ts 里的碰撞规则,**不改 pmx 二进制**
- **optimize.pmx 已经有 bug → bones_lite 不是真凶**: 减面发生在 optimize 阶段(调 reduceFaces),bones_lite 阶段只精简骨骼,跟面数无关
- **兄弟的设计意图**(2026-08-19 推断): 「**打掉的关键衣服 + 身体关键区域都应该锁**」——`lockSmallMaterials` 是「按面数锁」,与兄弟意图错位
- **任何"X 材质面数变化"问题 → 第一站查 optimize.pmx,不是 MMDData.ts**: reduceFaces 的 perMaterial 输出是 ground truth

### 🔴 兄弟拍板的修复方向(2026-08-19 实测定稿)

**兄弟原话**:
> 「修改 pmx-reduce-face:**减面的目标设为 5 万面。减到这个面数以下就不用减了。并且需要保证不会出现破面、空洞、多出来三角面等影响质量的情况**」

**落地语义**(`D:\Github\PMXReduceFace\src\tool\pmx-face-reduce\reduce.mjs`):

| 改动 | 当前 | 兄弟拍板 |
|------|------|----------|
| `targetTriangles` 默认值 | `null`(走 `targetRatio=0.5`) | **`50000`**(绝对目标) |
| `totalTri <= 50000` 时 | 仍调 QEM 减面 | **直接 skip QEM,copy 输入到输出** |
| 质量保证(qem.mjs 的 reject) | shapeReject/holeReject/foldOverReject/protrudeReject | **保持现状**,不动 |

**派工前实测锚点**:
```powershell
# 总面 < 50000 → skip 后 totalTri 应字节级一致
cd D:\Github\wt1\packages\mmd_tool
node -e "
import('pmx-physics-reduce/pmx-loader.mjs').then(({parser}) => {
  const fs = require('fs');
  const buf = fs.readFileSync('D:/Github/wt1/mods/mmd-character-extend/src/asset/TDA式宴 夏卉/TDA Utage CORAL COAST.pmx');
  const m = parser.parsePmx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), false);
  console.log('总面:', m.faces.length, '(35282 < 50000 → 必走 skip)');
});
"
```

**修复后验收**:
1. ✅ `reduceFaces()` 对 35282 面的模型 → `newTriangles === originalTriangles`(skip 生效)
2. ✅ 对 > 50000 面的模型 → 仍按 targetRatio 或 targetTriangles 减面
3. ✅ jacket1 实测 = 6796(origTri == newTri)
4. ✅ 测试 fixture 同步更新(如果原 expected 按 30000/0.5 ratio 写)

**关联 skill**:
- `gts-dispatch-preflight` 模式 B(配置层 ≠ 数据层): 本坑是反例——以为 MMDData.ts cloth collision 改了 → jacket1 面数减少,实际 MMDData.ts 完全不动面数
- `gts-auto` §7.4.1(对外断言必须实测): 本坑"§5 算法误伤 jacket1"假说两次都没实测就被采用,实测只需 1 行 node 命令
- `gts-dispatch-preflight` 「跨仓派工」节: PMXReduceFace 是独立 git 仓(`D:\Github\PMXReduceFace`,不在 wt1 worktree),派工时 brief 显式禁止跨仓读,见该 skill 末尾的反面教材

### 🔴 兄弟亲自 grep 才能挖出的盲区(2026-08-18 实测,Phase R 反思未覆盖)

**关键事实**:本 skill 第「验证 5 的真实盲区」节是 Phase C-r2 报告触发的(agent 自报 §11.2 全过但 §1 双函数 / §5 damageParts 漏了);Phase R 反思 patch 落地后,**兄弟本人亲自 grep `mods/mmd-character-extend/src/json/MMDData.ts` 仍然挖出了两个 agent + bot 都没看到的盲区**:

1. **§1 双函数去重未做**:`MMDData.ts:372-373` 同时存在 `getXiahuiResourcePath`(line 372 历史手写)+ `getXiaHuiResourcePath`(line 373 delegate)。issue §0.1 §1 明确要求"双函数仅保留一个",但 Phase D r2 + Phase Fix + Phase R 全部 agent 报告都说"§11.2 验收全过"。**bot 验证脚本也漏了这条 grep**。
2. **§5 damageParts 数组全缺**:XiaHui 的 cloth-collision 数据中 `头饰`/`手套`/`奶罩` 三项只有 `damagePart` 字段,没有 `damageParts` 数组(缺可打掉的材质名)。agent 只验 `damagePart` 字段名,没验 `damageParts` 数组是否存在/非空。

**根因**:**agent 的"§11.2 验收"只看顶层字段名 + 已有数据是否动过**;**bot 验证脚本也是同样思路**。两者都没 grep "所有 issue §0.1 列出的字段是否真的存在且符合预期格式"。

**升级到强约束(2026-08-18 实测后定稿)**:

```powershell
# bot 验收脚本必须做的事(任何 mmd-data 类 issue 派 OpenCode 验收前必跑):
# 1. grep issue §0.1 列出的每一个具体期望(不是只验 agent 说的那几项)
Select-String -Path "mods/mmd-character-extend/src/json/MMDData.ts" -Pattern "export let (getXiaHuiResourcePath|getXiahuiResourcePath)" | Measure-Object
# 期望:1 行(双函数去重)

# 2. §5 damagePart 各项必须配 damageParts 数组(即使 agent 报"已写"也要 grep 验证)
$lines = Get-Content "mods/mmd-character-extend/src/json/MMDData.ts"
for ($i=0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -match "mmdCharacter: mmdCharacter\.<角色>," -and $lines[$i] -notmatch "^\s*//" -and $i -gt <角色块起始>) {
    $hasDP = $false
    $hasDPEmpty = $false
    for ($j=$i+1; $j -lt [Math]::Min($i+30, $lines.Count); $j++) {
      if ($lines[$j] -match "^\s*\},?\s*$") { break }
      if ($lines[$j] -match "damageParts:\s*\[") {
        $hasDP = $true
        $next = $lines[$j+1].Trim()
        if ($next -match "^\]" -or $next -match "^//") { $hasDPEmpty = $true }
        break
      }
    }
    if (-not $hasDP) { Write-Host "FAIL line $($i+1): 缺 damageParts 数组!" }
    elseif ($hasDPEmpty) { Write-Host "FAIL line $($i+1): damageParts 数组空!" }
  }
}
# 3. §0.1 列出的其他字段(双函数去重 / lightStressing 跳过 / partialScale 跳过 / noBlending 数组 / putToShoe isToToe 等)逐项 grep
```

**memory 教训**:**OpenCode agent + bot 自验脚本都只看"agent 自己定的本 phase 范围"**;**issue 范围 = solution.md §0.1 全部 10 项 + §11.2 全部写回期望**,不是 agent 派活时定的清单。**兄弟能挖出的盲区 = agent + bot 都漏了的盲区**(派活清单 + 验收清单都不是 issue 范围)。

**`mmd_data_check.mjs` 升级要求**:脚本必须按 issue solution.md §0.1 列出的 10 项 + §11.2 期望表,**逐项**做"实际值 vs 期望值"对比(不是 agent 派的 phase 范围)。任何 FAIL → 立刻派 `Phase Fix-r2` 而不是放过。

**派 Phase Fix 时的 brief 模板**(兄弟会直接告诉 bot 自己 grep 发现的盲区,bot 写进 brief 头部):

```markdown
## 兄弟亲自 grep 发现的盲区(必须修)

⚠️ 这次 Phase R 反思没覆盖到的盲区(agent + bot 自验都没看到),需要 OpenCode 补做:

### 盲区 A: §1 双函数去重
- 当前状态: MMDData.ts:372-373 同时存在 getXiahuiResourcePath + getXiaHuiResourcePath 两个 export
- 期望: 仅保留 getXiaHuiResourcePath,删除 getXiahuiResourcePath

### 盲区 B: §5 damageParts 数组全缺
- 当前状态: 头饰 / 手套 / 奶罩 三项只有 damagePart,没 damageParts 数组
- 期望: 头饰=[hat, glasses], 手套=[glove], 奶罩=[Bra, tie]

(以下 OpenCode 自己列其他发现的盲区)
```

**记忆点**: **任何 mmd-data 类 issue 验收后,bot 必须把"issue §0.1 全部 10 项" + "§11.2 期望表"完整列出来逐项 grep**,不是"agent 自报的 phase 完成清单"。兄弟 2026-08-18 当面质问"还有重复的 getXiaHuiResourcePath / getMMDMaterialFixData 错的 / getClothCollisionData 错的"就是这次踩坑的来源——bot 应该比兄弟更早发现,不能等兄弟抓漏。

### � 双函数去重验证(2026-08-18 实测)

新角色接入时,**资源路径函数对**(`get<角色>ResourcePath` + 历史手写小写变体如 `get<角色小写>ResourcePath`)经常**两个都存在**:

```typescript
// MMDData.ts:372 (历史手写,issue §1 要求删除)
export let getXiahuiResourcePath = (name) => `...<旧路径>/pmx`
// MMDData.ts:373 (gen-mmd-config 模板渲染用,保留)
export let getXiaHuiResourcePath = (name) => getXiahuiResourcePath(name)
```

issue §0.1 §1 明确要求"**双函数仅保留一个且语义指向 `_opt` 路径**"。bot 必须 grep 验证只有 1 个 export。

**实测教训**:Phase D r2 + Phase Fix + Phase R 都自报"§11.2 验收全过",但双函数去重这条**没人做过**。最后是兄弟自己 grep 发现,Phase Fix-r2 才补上。

**新角色接入必做 grep**(写在 brief 必填):

```powershell
Select-String -Path "mods/mmd-character-extend/src/json/MMDData.ts" `
  -Pattern "export let get<角色大写>ResourcePath|export let get<角色小写>ResourcePath"
# 期望:1 行(只有大写版本,小写版本要么不存在要么已 delegate)
```

### 🔴 核心修复必须有对应 BDD 回归断言（2026-08-17 review 要求）

三个核心修复若没有 jest 覆盖，会在下次改动时静默回归。XiaHui 接入时补的场景（新角色复用）：
- **bracelet 词边界** → cloth `3.7c`：`matchMaterialSemantic('bracelet')` ≠ 衣服，`'bra'` = 衣服作对照
- **checkCriticalParts 模型感知** → cloth `3.7b`：仅缺一种关键材质（如无丝袜）→ 允许写回（原有 3.7 是全缺 → 拒绝）
- **toeIkRegex 骨骼回退** → mmd-config `1.13`：合成骨骼 `右足先EX/左足先EX`（精确名不命中 → 回退 regex），断言 notIK/ik 输出
- **幂等守卫角色化** → first-person-hide `2.2/2.5`：多角色文件下非 `--force` 写回不再误判 already generated

全量验证命令：`node ../../node_modules/jest/bin/jest.js --config jest.config.js --testPathPattern 'cloth|mmd-config|first-person-hide'`（mmd_tool 包目录跑，根目录 npx jest 会解析错 config 路径）

## 通用纪律

- 只改规则模块（cloth-data-rules-*.mjs / mmd-config-rules.mjs / gen-*.mjs），不手工改 MMDData.ts 数据（程序写回）
- 每轮 brief 预置已确认事实（材质名/骨骼名/失败日志），禁止 agent 重复探测
- 修复后必须跑 workflow 集成路径验证，**禁止只跑单独 CLI 就宣布全绿**（2026-08-17 教训：fix3 单独 CLI exit=0，workflow 里 self-check 才暴露，多一轮 dispatch）
- 🔴 **兄弟说「之前修过/没修正确」时，先查方案与实现的落地状态（2026-08-17 fix7 实测）**：搜 `笔记/项目文档/changes/` 的 solution.md + `笔记/项目文档/issue/` 的 stepSequence/status，区分两种情形——①方案已产出但**实现未落地**（issue 卡在 Step 0，脚本里公式还是旧的）→ 直接续实现，不重新出方案；②实现已落地但行为不对 → 才重新分析根因。实例：getPickedTransform 拳头中心方案（2026-08-17 10:20 产出 solution.md + specs，公式 `FistCenter=(右手首+avg(4指指１))/2` 排除拇指）卡在 issue d5ba9917 Step 0，`mmd-config-rules.mjs` 的 `deriveTransformOffsets()` 仍是旧 6 骨含拇指公式 → 兄弟反馈「没修复正确」实为「没实现」
- 🔴 **数据正确性类 fix 的期望值 = 验收基准**：兄弟会直接给目标数据（如 getClothCollisionData 无衣服组→新增「奶罩」「裤子」语义、getShoeData notIK -1/ik +1.0、getPutToShoeTransform isToToe），brief 必须整段贴入作为验收标准，禁止 agent 自行发挥；注意「期望值≠实测骨骼值」（如鞋 ikBones 期望名是「右つま先ＩＫ」而非 XiaHui 实际骨骼「右足先EX」——要分析写回时骨骼名来源再确认语义）
- 🔴 **多修复点拆并行 session（2026-08-19 兄弟拍板）**：兄弟原话「opencode 最好一次只做一件事情，以后都这样搞」。任何 mmd-data 修复涉及多个独立模块（cloth 算法 + snapshot 渲染 + pmx-reduce-face 等），**必须并行**派多个 OpenCode session，每个 session 一个原子单元（一个 commit / 一个修复点）。**禁止**把多个修复塞进一个 session —— agent 上下文切换导致质量下降。详见 `gts:opencode-schedule` §5️⃣「一个 OpenCode session 只做一件事」。**实例（2026-08-19）**：Phase Fix-r5（cloth 算法加 40% 覆盖率阈值）+ Phase Fix-r6（snapshot 渲染修空图）= 拆两个并行 session，两个 session 改不同文件无冲突，独立 brief + 独立 commit
- 详细案例：见 `references/xiahui-adaptation-case.md`（XiaHui 接入全程，fix3~fix5）
