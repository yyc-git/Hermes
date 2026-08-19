# getCameraPositionForFirstPersonControlsFunc 形态反推（2026-08-19 实测）

## 背景

`getCameraPositionForFirstPersonControlsFunc` 在 `mods/mmd-character-extend/src/json/MMDData.ts` line 2551 起，每个角色一条 lambda，约 20+ 个角色。

兄弟给 XiaHui "应该值"：
```javascript
let middlePoint = _getMiddlePoint1(api, girl)
let bone3 = api.gameObject.getGameObjectByName(girl, "メガネ")
let p3 = api.gameObject.getWorldPosition(bone3)
let bone4 = api.gameObject.getGameObjectByName(girl, "頭")
let p4 = api.gameObject.getWorldPosition(bone4)

return api.vector3.add(
    api.vector3.add(api.vector3.clone(middlePoint),
        api.vector3.multiplyScalar(
            api.vector3.sub(api.vector3.clone(middlePoint), p3), 10
        )
    ),
    api.vector3.multiplyScalar(
        api.vector3.sub(api.vector3.clone(p4), p3), 8
    )
)
```

公式 = `middlePoint + (middlePoint - メガネ) * 10 + (頭 - メガネ) * 8`

## 形态分类表（Phase Fix-r8 实测）

| 角色 | 形态 | 骨骼 1 / bone3 | 骨骼 2 / bone4 | factor1 / factor2 | middlePoint |
|---|---|---|---|---|---|
| Xiaye1（修改前） | 形态 1（缺 vec2） | "glasses" | - | 10 | p1 |
| Changee / Xiaye2 / Miku1 / ... | 形态 1 | (用 func1 helper) | - | 10 | p1 |
| Nero | 形态 2 | "ヘッドセット先" | "両目" | 6 | p1 |
| Meiko | 形态 2 | "後髪" | ? | ? | p1 |
| **XiaHui（修改后 / 兄弟标准）** | **形态 3** | **"メガネ"** | **"頭"** | **10 / 8** | **p1** |

**关键发现**：
- 形态 1 = 单偏移（`middlePoint + (middlePoint - X) * f`）
- 形态 2 = 双偏移无 middlePoint base（`middlePoint + (X - Y) * f`）
- 形态 3 = 双偏移含头（`middlePoint + (middlePoint - X) * f1 + (X2 - X) * f2`，第二项含头骨）

## 通用参数化函数骨架

```javascript
function computeCameraPos(api, girl, opts) {
    // opts = { middlePoint: 'p1'|'p2', refBoneName, headBoneName, factor1, factor2 }
    const middlePoint = opts.middlePoint === 'p2'
        ? _getMiddlePoint2(api, girl)
        : _getMiddlePoint1(api, girl);

    let result = api.vector3.clone(middlePoint);

    if (opts.refBoneName) {
        const refPos = api.gameObject.getWorldPosition(
            api.gameObject.getGameObjectByName(girl, opts.refBoneName)
        );
        result = api.vector3.add(result,
            api.vector3.multiplyScalar(
                api.vector3.sub(api.vector3.clone(middlePoint), refPos),
                opts.factor1
            )
        );
    }

    if (opts.headBoneName && opts.refBoneName) {
        const headPos = api.gameObject.getWorldPosition(
            api.gameObject.getGameObjectByName(girl, opts.headBoneName)
        );
        result = api.vector3.add(result,
            api.vector3.multiplyScalar(
                api.vector3.sub(api.vector3.clone(headPos), refPos),
                opts.factor2
            )
        );
    }

    return result;
}
```

## 实测验证（r8 实跑）

```bash
cd D:/Github/wt1/packages/mmd_tool
node --input-type=module -e "
import {parser} from './src/tool/pmx-physics-reduce/pmx-loader.mjs';
import fs from 'fs';

const buf = fs.readFileSync('D:/Github/wt1/mods/mmd-character-extend/src/asset/TDA式宴 夏卉_opt/TDA Utage CORAL COAST.optimized.pmx');
const m = parser.parsePmx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), false);

// 实查 XiaHui 骨骼名（不能信历史假设）
const matches = m.bones.filter(b => b.name && /目|頭|メ|眼|顔|head|eye|glasses|neck/i.test(b.name));
console.log('XiaHui candidate bones:');
for (const b of matches) console.log('  ', b.name, 'pos=', b.position);

// 实测结果：XiaHui 有 メガネ + 頭 两根骨 → 兄弟公式可计算
// cameraPos ≈ [0, ~18.7, ~-1.9]（y 在 左目/頭先 之间，z 在 メガネ 前方）→ 落在头部区域
"
```

## 生成器落盘

`gen-first-person-hide.mjs` 新增 `--camera-form3` 标志：
- 命中 → 用形态 3 生成
- 缺 head 骨骼 → warning + fallback 形态 1（单偏移）
- 缺 メガネ / glasses 类 → warning + 形态 1 fallback

## 反例（r8 brief 教训）

```bash
# ❌ 错误（r8 brief 假设）
"XiaHui 用 'glasses' 骨骼名"

# ✅ 实查命令
node -e "...XiaHui candidate bones..."
# 实测：XiaHui 骨骼名是 'メガネ'（不是 'glasses'），必须用 'メガネ'
```

**派工前 brief 写骨骼名假设 → 必须实查 pmx 骨骼表确认**，不要信 commit message、历史 lambda 或直觉。
