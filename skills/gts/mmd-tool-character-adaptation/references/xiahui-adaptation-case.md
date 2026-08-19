# XiaHui（夏卉）接入案例 — 2026-08-17 ~ 2026-08-19

TDA式宴 夏卉 / TDA Utage CORAL COAST.pmx 接入 GTS-Play mmd_tool 工作流的完整踩坑记录。原始 issue: `笔记/项目文档/issue/2026-08-17-XiaHui_mmd_tool_TDA_TDA_Utage_-27e3891d.md`。

## 角色档案

- PMX：`mods/mmd-character-extend/src/asset/TDA式宴 夏卉_opt/TDA Utage CORAL COAST.pmx`（2360616 bytes，214 bones）
- config：`packages/mmd_tool/src/workflow/config/xiahui.json`（scale=8, scaleZ=3, scaleXY=0.2）
- 工作流进度：step-2 texture ✅ / step-3 pmx ✅（35282→34059 tri, 232→214 bones）/ step-3 mmddata ❌→fix5 修复中
- MMDData.ts：dirName → `TDA式宴 夏卉_opt`、启用 `getXiahuiResourcePath`、`XIAHUI_VMD_SCALE` 全 1.0

## fix3 — cloth 材质名语义特判（bracelet + 胖次）

**失败现象**：`gen-cloth-data 失败: 关键部位材质缺失: 胖次`

**诊断输出**（`_tmp-xiahui-group-check.mjs`）：
```
jeans1 knockable=true regions=Torso,TrigoneAndButt w={"Torso":624,"TrigoneAndButt":1394}
jeans2 knockable=true regions=Thigh w={"Thigh":1302}
glasses knockable=true regions= w={}          ← 骨骼权重空 → 被丢弃
tail knockable=true regions= w={}             ← 同上
```

**修复**：
1. `/bra/` → `/\\bbra(s|ssiere)?\\b/`（bracelet 不再被误匹配；Bra 仍匹配）
2. 胖次嵌套：`pantiesDist(0.62) > clothesDist` 时胖次独立顶层节点（splice 到衣服之后）；Xiaye1 锚点（<= 时仍为 children）不变
3. 附加：`checkCriticalParts` 模型感知——XiaHui 无丝袜材质不再误报；空 PMX 退化保护仍全量要求（3.7 回归测试保护）

**验证**：诊断 critical missing 空 ✅ / cloth BDD 36/36 ✅ / 全量 mmd_tool jest 61/62（workflow-reorder 2 失败 = pre-existing，step-1 静态检查 `deleteXiaye1CommentBlocks` 不存在，与本次无关）/ gen-cloth-data CLI exit=0

**踩坑教训**：单独 CLI exit=0 就宣布全绿 → workflow step-3 集成路径才暴露 self-check 误报，多一轮 dispatch。

## fix4 — self-check 双角色误报

**失败现象**：workflow step-3 重跑 `gen-cloth-data 失败: self-check failed: non-Xiaye1 regions changed`（gen-cloth-data.mjs:379）

**根因**：`checkNonXiaye1Unchanged` 只挖除 Xiaye1 写回区域比较其余不变；MMDData.ts 已有旧 XiaHui 块（上午写入），`--force` 重新生成的块 ≠ 旧块 → 被误判「非 Xiaye1 区域变化」。单角色时代无此问题。

**修复**：self-check 挖除所有角色写回区域（Xiaye1 + 当前 character），只保护真正的非数据区域。函数名里的 Xiaye1 是历史命名，`locateXiaye1WritebackRange`/`locateXiaye1ChangedRange` 参数已通用。

**验证**：XiaHui step-3 跑通 ✅ / Xiaye1 step-3 回归通过 ✅（13:28，.done char=Xiaye1）/ 后续暴露 gen-mmd-config 骨骼名问题。

**坑**：`.workflow/step-3-mmddata.done` 是 Xiaye1 的（char 字段），XiaHui 的 done 未生成——看 done 文件内容确认角色，别只看文件名。

## fix5 — 骨骼命名差异（已定稿，方案 B 正则回退）

**失败现象**：`gen-mmd-config exit=1: manualFieldsNeeded: ikBones.yOffset`
```
warning: getUBControlledTransform: 关键骨骼缺失（下半身/下半身先），使用默认值 [0,-1.7,0.1]
warning: getPutToBreastTransform: 关键骨骼缺失（上半身2/胸骨），使用默认值 [0,1.3,0.9]
warning: getPutToShoeTransform: 关键骨骼缺失（右足ＩＫ/右つま先ＩＫ），使用默认值 [0,-0.6,-0.2]
```

**根因**（实测骨骼名）：
| 角色 | 脚尖 IK 骨 | Y |
|------|-----------|-----|
| Xiaye1 | `右つま先ＩＫ`/`左つま先ＩＫ` | 0.279 |
| XiaHui | `右足先EX`/`左足先EX` | 0.347 |

`TOE_IK_BONE_NAMES = ['右つま先ＩＫ','左つま先ＩＫ']` 匹配不到 XiaHui → `ikYOffset=null` → manualFieldsNeeded。transform 的 3 个 warning 是 fallback 可接受，真正阻塞只有 ikBones.yOffset。

**修复（实测定稿 = 方案 B，方案 A 被否）**：`measureYOffset` 精确名优先 + 正则回退（`toeIkRegex = /つま先ＩＫ|足先EX/`），**TOE_IK_BONE_NAMES 保持零改动**。

> ⚠️ **方案 A（直接往数组追加 `右足先EX/左足先EX`）有硬冲突，禁止用**：`gen-mmd-config.mjs` 写回 `ikBones.names: [...TOE_IK_BONE_NAMES]`（展开整个数组）+ BDD 断言 `toEqual(['右つま先ＩＫ','左つま先ＩＫ'])` 精确 2 元素 → 变 4 元素 = Xiaye1 行为变化 + 测试红。**改共享常量数组前先 grep 谁在展开它、谁在断言它。**

**验证**：XiaHui step-3 exit=0（ikBones.yOffset 由 null 变实测数值）/ Xiaye1 step-3 回归通过 / mmd-config+cloth 105 passed / MMDData.ts XiaHui getShoeData ikBones 非空。

## fix6 — gen-first-person-hide 写回追加语义累积（TS1117）

**失败现象**：C2 全绿后 bot 跑 `npx tsc --noEmit`（mods/mmd-character-extend）炸 5 处 TS1117（对象字面量重复属性）。实测 `getCameraPositionForFirstPersonControlsFunc` 全文 27 次、生成标记 7 处（同一块连续 3 份）。

**根因**：`writeback()` 按 `camLineIdx` 切片组装，`lines.slice(camLineIdx+1, arrStartLineIdx)` 把块内上次生成的 `NEW_CAMERA_MARKER + camera func` 整段原样保留 → 每次 `--force` 重跑累积一份。双角色 + 多轮 step-3 重跑（fix4/fix5/C2）累积到 3~4 份。

**修复**：写回改**整体重建**目标角色块 `data: { ... }` 区间——提取原始手写 camera 引用行（剥 `//` 前缀还原）、旧数组注释保留，再插新 camera func + 新数组；块内上次生成的 NEW_* 程序产物一律丢弃（替换语义，块内最多一份新内容）。新增 BDD 2.5b「--force 重复写回不累积」场景（先红后绿）。

**验证**：first-person-hide 25/25 / tsc MMDData.ts 0 错误（对比基线噪声零新增）/ 双角色 step-3 重生成后块内各恰 1 份。

## review-fix — 幂等守卫角色化 + 回归场景补漏

审核（xiahui-feat-review）发现 8 项，修复后 132/132 绿：
1. 🔴 `gen-first-person-hide.mjs:152` 幂等守卫 `src.includes(GENERATION_MARKER)` 全局判断 → 双角色文件下对 Xiaye1 非 `--force` 写回误判 `already generated`（BDD 2.2 失败 Expected 12 Received 13）→ 改为 `locateCharacterBlock` 块内查 marker
2. `writtenSrc.includes(cameraFunc)` 同样全局 → 改块内 `blockLines.join('\n').includes(cameraFunc)`
3. 补回归场景：bracelet 词边界（cloth 3.7c）、toeIkRegex 回退（mmd-config 1.13 合成 足先EX 骨骼）、checkCriticalParts 模型感知边界（cloth 3.7b）
4. C2 TDD 破坏验证发现**胖次兜底分支 0 断言**（破坏后 38/38 仍绿）→ 补 cloth 1.10「胖次离身体远 → 独立顶层节点」场景 + 破坏验证（仅 1.10 变红证明真实覆盖）

**教训**：C2 必须含 tsc 编译门禁（jest 全绿 ≠ TS 合法）；每个核心修复分支都要做 RED 破坏验证，破坏后仍全绿的 = 假测试风险，必须补场景。

## fix7 — 数据正确性 10 项清单（兄弟 2026-08-17 报告，方案 dispatch 中）

工作流生成的 XiaHui 数据 10 项不正确。issue: `笔记/项目文档/issue/2026-08-17-mmd_tool_XiaHui_10-7e5cb58a.md`。MMDData.ts 行号索引（2026-08-17 状态，定位用）：

| 函数 | XiaHui 位置 | 问题 |
|------|------------|------|
| getMMDMaterialFixData | 508（无 XiaHui 条目） | 缺 noBlendingMaterialNamesInVivo（gen-material-fix-data.mjs 只支持 Xiaye1） |
| getClothCollisionData | 1900 | 应无衣服组（jacket1 移除致手臂缺失） |
| getClothHpData | 3209 | 同 collision，去衣服组；属性按材质自动判断（cloth-hp-rules.mjs HP_PARAMS 公式） |
| getShoeData | 4505 | 当前 notIK 全ての親 +1.86 / ik +0 → 期望 -1 / +1.0 |
| getBoneNameForLightStressing | 4738 | 应清空（无胸部骨骼） |
| getDataForPartialScale | 4860 | 应清空 |
| getPickedTransform | 函数 4877 / XiaHui 4960 | 应在手心（握拳中心，掌心皮肤表面往上浮一点）；Xiaye1+XiaHui 都修 |
| getPutToShoeTransform | 函数 5171 / XiaHui 5261 | 当前 [0,-0.6,-0.2] → 期望 [0,-1.1,1.2] + isToToe:true |

**兄弟确认的期望数据（验收锚点，brief 必须整段贴入）**：
- getClothCollisionData XiaHui：头饰(Head, hat+glasses) / 鞋(LeftFoot+RightFoot, shoeDamagePart, shoes) / 奶罩(LeftBreast+RightBreast, Bra+tie) / 裤子(TrigoneAndButt, jeans1) → children 胖次(jeans2)。**无衣服组**（移除 jacket1 后手臂缺失）。注意「奶罩」「裤子」是新 damagePart 语义，cloth 规则里没有，需新增材质→分组规则
- getShoeData：shoeType.Common, notIKBones 全ての親 yOffset **-1**, ikBones 右つま先ＩＫ/左つま先ＩＫ yOffset **+1.0**（⚠️ 期望名是「右つま先ＩＫ」非 XiaHui 实际骨骼「右足先EX」——期望值≠实测骨骼值，分析写回骨骼名来源再确认语义）
- getPutToShoeTransform：[0, -1.1, 1.2] + isToToe:true（鞋子露脚趾 → 位置在脚趾之间，否则落在脚后跟接触位）
- getPickedTransform：握拳中心 = 掌心皮肤表面往上浮一点（防穿模），Xiaye1 + XiaHui 都修

**其它待修项**：
- 重复数据：gen-cloth-data/gen-mmd-config 写回注释块累积（getMMDData Xiaye1 块 4 个、getClothCollisionData XiaHui 块 6+ 个、getShoeData Xiaye1 块 5 个——替换语义只修了 gen-first-person-hide/fix6，其它 gen-* 未修）；getXiahuiResourcePath（历史命名）/getXiaHuiResourcePath（模板渲染名）双函数并存
- step-2-texture 的纹理 / vmd_bake_physics 未拷贝到 `TDA式宴 夏卉_opt/` 目录
- snapshot 两张截图姿势错误（全身截图应与 Xiaye1 一致用 a pose，工具在 `packages/mmd_tool/src/tool/snapshot/`）
- 疑点：getShoeData 生成值（+1.86/+0）与期望（-1/+1.0）差距大 → gen-mmd-config 的 yOffset 测量对 XiaHui 输出不可用，需查测量逻辑（可能误测到脚后跟/非脚尖骨）

**关键背景（避免重复出方案）**：getPickedTransform 拳头中心方案已于 2026-08-17 10:20 产出（`笔记/项目文档/changes/2026-08-17-picked-palm-center/solution.md` + specs，公式 `FistCenter=(右手首+avg(4指指１))/2` 排除拇指，Xiaye1 期望 [-0.334,-0.272,-0.019]），但 issue `2026-08-17-getPickedTransform_picked_posi-d5ba9917.md` 卡在 Step 0 **实现未落地**，`mmd-config-rules.mjs` 的 `deriveTransformOffsets()`（L139-211）仍是旧 6 骨含拇指公式 → 兄弟反馈「没修复正确」实为「没实现」。

## fix8 — pmx-reduce-face lock 策略与设计意图错位(2026-08-19 实测,jacket1 减面 44 面)

兄弟报告 `TDA式宴 夏卉_opt/TDA Utage CORAL COAST.optimized.pmx` 的 `jacket1` 材质面数从原始 6796 减到 6752(减少 44 面)。

**根因排查路径**(本次 bot 走错两次才到正确答案):
1. ❌ 第 1 次假说: 「§5 cloth collision 算法误伤 jacket1」(68728ceea commit 改 XiaHui 头饰/手套 damageParts)
   - 实测 `git show 68728ceea -- mods/mmd-character-extend/src/json/MMDData.ts` → 只改了 XiaHui 头饰/手套 +damageParts,未碰 Xiaye1
   - **commit message ≠ 事实**: commit 自报「Xiaye1 数据字节不变」是真的,但 bot 没 `git show` 验真实 diff 就接受
2. ❌ 第 2 次假说: 「bones_lite 管线副作用」
   - 兄弟直接否定: 「optimized.pmx 也有该问题」→ bones_lite 之前 optimize 已经减面
3. ✅ 真凶: `pmx-reduce-face/reduce.mjs` 的 `reduceFaces()` + `lockSmallMaterials: true` 选项
   - **lock 语义错位**: 「按 face-count 阈值锁」,不是「按材质类型锁」
   - jacket1 = 6796 面 = 最大材质 → 完全不被 lock → QEM 削 44 面

**实测方法**(1 行 node 命令,bot 派工前必跑):
```js
// D:\Github\wt1\packages\mmd_tool 工作目录
import('pmx-reduce-face/src/tool/pmx-face-reduce/reduce.mjs').then(async ({reduceFaces}) => {
  const r = await reduceFaces({
    input: 'D:/Github/wt1/mods/mmd-character-extend/src/asset/TDA式宴 夏卉/TDA Utage CORAL COAST.pmx',
    output: require('os').tmpdir() + '/jacket1-test.pmx',
    targetTriangles: 30000, lockMorph: true, lockSeams: true,
    minRetention: 0.3, lockSmallMaterials: true
  });
  // perMaterial 输出 origTri + newTri
  for (const m of r.perMaterial || []) {
    if ((m.name||'').toLowerCase().includes('jacket')) console.log(JSON.stringify(m));
  }
});
// 实测输出: {"index":19,"name":"jacket1","origTri":6796,"newTri":6752}
```

**完整 33 材质减面对比表**(关键实证数据, bot 派工前必贴 brief):
| 材质 | 原面 | 减后 | delta | 类型 |
|------|------|------|------|------|
| **jacket1** | 6796 | 6752 | **-44** | 上衣(最大,本应锁) |
| Skin01 | 4854 | 4718 | -136 | 身体 |
| jeans1 | 3622 | 3602 | -20 | 裤子 |
| face | 2020 | 1723 | -297 | 脸 |
| hear1 | 1961 | 1906 | -55 | 头发 |
| shoes | 1694 | 1694 | 0 | (锁了) |
| Hair | 1636 | 1587 | -49 | 头发 |
| jeans2 | 1512 | 1512 | 0 | (锁了) |
| **eye extra** | 1420 | 1314 | **-106** | 眼睛(本应锁) |
| hear3 | 1354 | 1270 | -84 | 头发 |
| **tie** | 768 | 394 | **-374** | 领带(减半,本应锁) |
| hat | 665 | 661 | -4 | 头饰 |
| skin02 | 631 | 629 | -2 | 皮肤 |
| Bra | 552 | 506 | -46 | 奶罩(本应锁) |
| tail | 506 | 501 | -5 | 尾巴 |
| ears/mouth/eye/bracelet/necklace1/eye+/jewels/cheek/eyewhite/neck/necklace2 | - | - | **0** | 全部锁了 |

```
lockedCount: 24936   // 总面 32k 里锁了 24k+,只剩 7k+ 给 QEM
reductionMet: false  // 没达到 ≤ 30000 目标(锁太多)
```

**`_opt/` 目录产物 byte 对比**(关键定位证据):
```
TDA式宴 夏卉/TDA Utage CORAL COAST.pmx              2360616 bytes (原始)
TDA式宴 夏卉_opt/TDA Utage CORAL COAST.orig.pmx      2360616 bytes (原始备份,字节相同)
TDA式宴 夏卉_opt/TDA Utage CORAL COAST.optimized.pmx 2315564 bytes (optimize 后,−45k)
TDA式宴 夏卉_opt/TDA Utage CORAL COAST.bones_lite.pmx 2314476 bytes (bones_lite)
TDA式宴 夏卉_opt/TDA Utage CORAL COAST.bones_lite_renamed.pmx 2314356 bytes
TDA式宴 夏卉_opt/TDA Utage CORAL COAST.pmx           2314356 bytes (当前生效 = bones_lite_renamed 副本)
```

→ optimize.pmx 已经比 orig.pmx 小 45k bytes = jacket1 减 44 面的字节体现

**派工前预置实测**(避免重复 fix7 教训——本次 bot 没实测就派了错误根因的 Phase Fix-r3):
- bot 派工前先跑上面的 reduceFaces 命令
- 把 perMaterial 表(33 行 origTri/newTri/delta) 整张贴到 brief 头部
- brief 必须明确写「jacket1 6796→6752 是 reduceFaces QEM 算法的副作用,不是 MMDData.ts cloth collision 配置变更」

**修复方向**(待兄弟拍板):
1. **方案 A**(`pmx-reduce-face` 新增 `lockByName: string[]` 选项): 接受外部传入「必须全锁的材质名列表」
2. **方案 B**(`optimize.mjs` 调 reduceFaces 前读 MMDData.ts): 收集 cloth collision 配置里的所有 damagePart 材质名,传给 lockByName
3. **方案 C**(`lockSmallMaterials` 阈值提到 7000+): 锁大衣服,只减脸/身体
4. **方案 D**(`minRetention` 从 0.3 提到 0.95): 几乎不让 QEM 动

**验收方式**(任意方案修复后必跑):
1. **jacket1 实测** = origTri(原始 6796,不被减面)
2. **全材质减幅表** — 衣服/身体/五官类材质 delta 应全为 0
3. **目标 tri 数达成**(reductionMet=true)且 jacket1 / Skin01 / face / eye extra 等都 0 减幅

**opencode session 状态**(2026-08-19 09:00 北京):
- `ses_fe87f0c9...` Phase Fix-r3 误派后,wait 7200s 超时但 session 仍 alive(53s 前还在 grep "necklace|XiaHui|材料|materials")
- 等兄弟拍板 → kill + 重派 Phase Fix-r4(hy3-free, brief 含本表实测数据)

**记忆点**:
- **cloth collision 配置 ≠ pmx 面数**: cloth collision 是 MMDData.ts 里的碰撞规则,**不改 pmx 二进制**
- **optimize.pmx 已经有 bug → bones_lite 不是真凶**: 减面发生在 optimize 阶段(调 reduceFaces),bones_lite 阶段只精简骨骼,跟面数无关
- **兄弟的设计意图**(推断): 「打掉的关键衣服 + 身体关键区域都应该锁」——`lockSmallMaterials` 是「按面数锁」,与兄弟意图错位
- **任何"X 材质面数变化"问题 → 第一站查 optimize.pmx,不是 MMDData.ts**: reduceFaces 的 perMaterial 输出是 ground truth

**关联 skill**:
- `gts-dispatch-preflight` 模式 B(配置层 ≠ 数据层): 本坑是反例——以为 MMDData.ts cloth collision 改了 → jacket1 面数减少,实际 MMDData.ts 完全不动面数
- `gts-auto` §7.4.1(对外断言必须实测): 本坑"§5 算法误伤 jacket1"假说两次都没实测就被采用,实测只需 1 行 node 命令

## 工具脚本存档

- `_tmp-xiahui-group-check.mjs` — 分组诊断（materialFaceCounts + 分组 + checkCriticalParts）
- `_tmp-xiahui-bones.mjs` / `_tmp-xiahui-feet.mjs` / `_tmp-xiaye1-feet.mjs` — 骨骼名/位置对比诊断
- 模式：`pmx-physics-reduce/pmx-loader.mjs` 的 `parser.parsePmx(bufToAB(buf), false)`，`b.position` 可能是数组或对象，需 `Array.isArray` 归一
- **fix8 减面对比脚本**: `node -e "import('pmx-reduce-face/src/tool/pmx-face-reduce/reduce.mjs').then(...)"` (1 行 node 命令,见 fix8 节)
