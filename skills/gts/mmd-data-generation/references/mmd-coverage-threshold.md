# coverageRatioInRegion 覆盖率阈值算法骨架（2026-08-19 实测）

## 背景

`cloth-data-rules-generate.mjs` 把 `bracelet/bangle/jewel/tail` 等小装饰物误归类为"手套"（英文材质名不命中 MAT_SEMANTIC → 走几何区域权重 → 挂 LeftLowerArm → 进入 `groups['手套']`）。

兄弟拍板：**不要特判，用几何覆盖率阈值 40%**。

## 算法骨架（实装于 cloth-data-rules-generate.mjs）

```javascript
// 新增常量（cloths-data-rules-generate.mjs 顶部）
export const COVERAGE_RATIO_THRESHOLD = 0.40;  // 区域覆盖率阈值（兄弟拍板）

/**
 * 计算某材质在某 region 的覆盖率。
 * coverage = 该材质在 region 骨骼权重 / 全身所有材质在 region 的骨骼权重总和
 *
 * @param {Object} parsed - PMX parse 结果
 * @param {number} matIdx - 材质索引
 * @param {string} region - region 名 (LowerArm / Torso / Head 等)
 * @returns {number} 0..1 比率
 */
export function coverageRatioInRegion(parsed, matIdx, region) {
    const totalRegionWeights = _getTotalRegionWeights(parsed);  // WeakMap 缓存
    const matWeights = collectRegionWeights(parsed, matIdx);
    const matInRegion = matWeights[region] || 0;
    const totalInRegion = totalRegionWeights.get(region) || 0;
    return totalInRegion > 0 ? matInRegion / totalInRegion : 0;
}

// WeakMap 缓存全身区域权重（避免每个材质都重算一次全身）
const _totalRegionWeightsCache = new WeakMap();
function _getTotalRegionWeights(parsed) {
    if (_totalRegionWeightsCache.has(parsed)) return _totalRegionWeightsCache.get(parsed);
    const weights = {};
    for (let mi = 0; mi < parsed.materials.length; mi++) {
        const w = collectRegionWeights(parsed, mi);
        for (const [region, wval] of Object.entries(w)) {
            weights[region] = (weights[region] || 0) + wval;
        }
    }
    _totalRegionWeightsCache.set(parsed, weights);
    return weights;
}
```

## buildMaterialGroups 集成点

```javascript
// buildMaterialGroups（cloths-data-rules-generate.mjs 现有函数）
function buildMaterialGroups(parsed, knockableMatIdx) {
    const groups = {};
    for (const mi of knockableMatIdx) {
        // 材质名语义特判（优先级最高）—— 命名明确的材质不参与阈值
        const dp = matchMaterialSemantic(parsed.materials[mi]);
        if (dp === 'EXCLUDED') continue;
        if (dp) {
            // 语义命中：直接入组，不走阈值
            if (!groups[dp]) groups[dp] = { mats: [] };
            groups[dp].mats.push({ mi, name: parsed.materials[mi] });
            continue;
        }

        // 区域权重回落路径（语义未命中）—— 加 40% 阈值
        const wmap = collectRegionWeights(parsed, mi);
        const regions = mapCollisionPart(parsed, mi);
        const maxRegion = regions.reduce((a, b) => (wmap[b] || 0) > (wmap[a] || 0) ? b : a, regions[0]);
        const dpFallback = DAMAGE_PART_OF_REGION[maxRegion];
        if (!dpFallback) continue;

        // 🔴 新增：覆盖率阈值判定（兄弟拍板）
        const ratio = coverageRatioInRegion(parsed, mi, maxRegion);
        if (ratio < COVERAGE_RATIO_THRESHOLD) {
            continue;  // < 40% 视为装饰物，排除
        }

        if (!groups[dpFallback]) groups[dpFallback] = { mats: [] };
        groups[dpFallback].mats.push({ mi, name: parsed.materials[mi] });
    }
    return groups;
}
```

## 实测诊断命令（必跑，r5 实测）

```bash
cd D:/Github/wt1/packages/mmd_tool
node --input-type=module -e "
import {parser} from './src/tool/pmx-physics-reduce/pmx-loader.mjs';
import {collectRegionWeights} from './src/tool/cloth-data-rules-collision.mjs';
import fs from 'fs';

const buf = fs.readFileSync('D:/Github/wt1/mods/mmd-character-extend/src/asset/TDA式宴 夏卉_opt/TDA Utage CORAL COAST.optimized.pmx');
const m = parser.parsePmx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), false);

// 算全身所有材质在 LowerArm 区域的总权重
let totalLowerArm = 0;
for (let i = 0; i < m.materials.length; i++) {
    const w = collectRegionWeights(m, i);
    totalLowerArm += (w['LowerArm'] || 0);
}

console.log('total LowerArm weight across all mats:', totalLowerArm);
for (let i = 0; i < m.materials.length; i++) {
    const name = typeof m.materials[i] === 'object' ? m.materials[i].name : m.materials[i];
    const w = collectRegionWeights(m, i);
    const wLower = w['LowerArm'] || 0;
    if (wLower > 0) {
        const ratio = totalLowerArm > 0 ? wLower / totalLowerArm : 0;
        console.log('  ', name.padEnd(15), 'LowerArm weight:', wLower.toFixed(2),
            'ratio:', (ratio*100).toFixed(2) + '%',
            ratio >= 0.4 ? '✅ KEEP' : '❌ EXCLUDE');
    }
}
"
```

## 判定表（XiaHui 实测，r5 输出）

```
bracelet    LowerArm weight: 180.00  ratio: 33.65%  ❌ EXCLUDE
jewels      LowerArm weight: 122.00  ratio: 22.81%  ❌ EXCLUDE
tie         Torso    weight: 208.00  ratio: 6.45%   ❌ EXCLUDE
礼服花纹1   Torso    weight: ...     ratio: ...     ✅ KEEP  (语义命中)
礼服内层薄纱1 TrigoneAndButt ...    ratio: 4.96%   ❌ EXCLUDE
```

## 兄弟原话（写进注释）

> "只有 PMX 同时具备'右つま先ＩＫ'和'左つま先ＩＫ'骨骼时，鞋子相关数据才能生成（否则鞋子被打掉后无法使脚变平整）"

通用注释模板（cloths-data-rules-generate.mjs `coverageRatioInRegion` 函数定义处）：

```javascript
/**
 * 几何覆盖率阈值（兄弟拍板，2026-08-19）
 *
 * 兄弟原话："用几何覆盖率阈值，不要特判"
 *
 * 装饰物（如 bracelet/bangle/jewel/tail）材质名不命中 MAT_SEMANTIC 任何规则，
 * 走几何区域权重路径会被错误归类为周围部位（bracelet → 手套）。
 * 用覆盖率阈值（40%）做通用排除：
 *   - 区域权重回落路径下，< 40% 的材质视为装饰物，排除
 *   - 语义命中的材质（glove/手套/bra 等）不受影响
 *
 * 阈值常量：COVERAGE_RATIO_THRESHOLD = 0.40（拍板定稿）
 */
```

## 反模式（不要做）

```javascript
// ❌ 特判 bracelet/bangle/jewel/tail —— 治标，每个新角色都要加新特判
const MAT_SEMANTIC = [
    { re: /bracelet|bangle|jewel|tail/, part: 'EXCLUDED' },  // 兄弟禁止
];

// ✅ 通用覆盖率阈值 —— 治本，任何新角色都自动正确分类
if (ratio < COVERAGE_RATIO_THRESHOLD) continue;
```
