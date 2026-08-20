---
name: "gts-mmd-character-onboarding"
description: "GTS-Play 新增 MMD 角色接入工具链：config/<char>.json + gen-* 工具适配（材质分组/self-check/骨骼名），验证门禁与踩坑清单。触发：加新角色、角色数据生成失败、clot data 缺失/骨骼不匹配"
---

# gts-mmd-character-onboarding — MMD 新角色接入工具链

> 为 GTS-Play 接入新 MMD 角色（新建 `packages/mmd_tool/src/workflow/config/<char>.json` + 让 gen-* 工具链适配新模型）的任务类型。
> 已实战角色：Xiaye1（基线）、XiaHui（2026-08-17，踩坑链见 `references/xiahui-onboarding-2026-08-17.md`）。

## 角色接入流程总览

1. **建配置**：`packages/mmd_tool/src/workflow/config/<char小写>.json`（复制 xiaye1.json，改 character/modelDir/pmxFile/scale 等）
2. **建资源目录**：`mods/mmd-character-extend/src/asset/<char>_opt/`（放 orig.pmx 和处理的 pmx）
3. **工作流跑通**：`node packages/mmd_tool/src/workflow/index.mjs --char <char>` — 但新角色几乎必然卡在 gen-* 工具链，按下方「三处硬编码适配」修
4. **验证门禁**（见下）
5. **MMDData.ts**：`mods/mmd-character-extend/src/json/MMDData.ts` 加 `<CHAR>_VMD_SCALE` + switch case + dirName 指向 `_opt`（gen-mmd-config 自动写回大部分）

## 三处硬编码适配（新角色必踩，按出现顺序）

### 1. cloth 材质分组（cloth-data-rules-generate.mjs）

- **英文材质名模型几何区域误导**（牛仔裤绑定髋骨 → 归错部位）→ 引入 `MAT_SEMANTIC` 语义特判表（优先级高于几何区域），未命中才走区域权重
- **正则词边界**：`/bra/` 会匹配 `bracelet` → 用 `/\bbra(s|ssiere)?\b/`。同类词（jeans/hat/shoe）都可能误匹配长词，必须加词边界
- **顺序敏感**：`jeans2`（内裤）必须在 `jeans`（外裤）前，否则内裤先被外裤词吞掉
- **胖次嵌套条件**：`pantiesDist <= clothesDist` 不满足时胖次节点整体消失 → 兜底：条件不满足时胖次作为独立顶层节点生成，保证 `checkCriticalParts` 通过
- **checkCriticalParts 模型感知**：新模型可能没有某关键部位材质（XiaHui 无丝袜）→ 模型无对应材质时不再要求该部位；保留空 PMX 退化保护 + 回归测试

### 2. gen-* 写回 self-check 单角色硬编码（gen-cloth-data.mjs / gen-first-person-hide.mjs）

- **症状**：新角色 `--force` 重新生成时报 `self-check failed: non-Xiaye1 regions changed`；单独 CLI 跑却 exit=0（旧块已在 MMDData.ts，写回内容变化触发比较）
- **根因**：`checkNonXiaye1Unchanged` 只挖除 Xiaye1 数据块再比较，新角色块被当「非 Xiaye1 区域」
- **修复**：挖除**所有角色**的写回区域（Xiaye1 + 当前 character 各收集 ranges 统一 removeRanges），只保护非数据块区域；Xiaye1 意外改动仍要报错
- 🔴 **教训：只验证 CLI 单独跑不够，必须跑 workflow step-3 集成路径**（XiaHui fix4 单独 CLI 绿了，workflow 里才暴露）

### 2b. gen-* 幂等守卫也要角色化（多角色误判 already generated）

- **症状**（2026-08-17 review 实测）：`first-person-hide.steps.ts` 2 失败（`Expected 12, Received 13` / `oldCameraLineCommented=false`）
- **根因**：`gen-first-person-hide.mjs:152` 幂等守卫 `if (!opts.force && src.includes(GENERATION_MARKER))` 是**全文件全局判断**——MMDData.ts 含任一角色 marker 后，对任何角色非 `--force` 写回都误判 `already generated`；BDD helper 基于 live 文件重建 pristine 时残留别的角色 marker
- **修复**：幂等守卫按目标角色块作用域判断（仿 selfCheck 用 locateCharacterBlock 定位角色块再查 marker）；BDD helper 改静态 baseline fixture（仿 cloth 的 `MMDData.cloth-baseline.ts`）
- **self-check 与幂等守卫是两处**：self-check = 写回后比较非数据区域不变；幂等守卫 = 写回前判断是否已生成。都要角色化

### 3. 骨骼名硬编码（mmd-config-rules.mjs）

- **症状**：`gen-mmd-config exit=1`，`manualFieldsNeeded: ikBones.yOffset`；transform warning（下半身先/胸骨/つま先ＩＫ 缺失走 fallback）可接受
- **根因**：`TOE_IK_BONE_NAMES = ['右つま先ＩＫ','左つま先ＩＫ']` 精确匹配；XiaHui 用 `右足先EX/左足先EX`（同脚尖语义）→ 匹配不到 → ikYOffset=null
- **修复**：`measureYOffset` 精确名优先 + 正则回退（`toeIkRegex = /つま先ＩＫ|足先EX/`），**保持 TOE_IK_BONE_NAMES 零改动**（BDD 断言 `toEqual(['右つま先ＩＫ','左つま先ＩＫ'])` 精确 2 元素，直接加元素会破坏 Xiaye1 回归）
- **排查工具**：临时脚本列骨骼名+position，Y 坐标对比确认语义等价（Xiaye1 つま先ＩＫ 0.279 vs XiaHui 足先EX 0.347）

## 验证门禁（全自动流程）

```powershell
# 1. 分组诊断（临时脚本，只读）→ critical missing 为空 + 分组含预期部位
node _tmp-<char>-group-check.mjs

# 2. 新角色 step-3 → exit=0
node packages/mmd_tool/src/workflow/index.mjs --char <char> --step 3

# 3. 🔴 旧角色回归（self-check 必须仍保护 Xiaye1）→ exit=0
node packages/mmd_tool/src/workflow/index.mjs --char Xiaye1 --step 3

# 4. cloth + mmd-config 测试
npx jest --config jest.config.js --testPathPattern 'cloth|mmd-config'

# 5. 全流程 → step1-6 全绿，产物在 mods/mmd-character-extend/src/asset/<char>_opt/
node packages/mmd_tool/src/workflow/index.mjs --char <char>
```

## PMX 资产路径约定

> 🔑 **Phase 0 调查 PMX 相关 bug 时，先读 `references/pmx-asset-conventions.md` 定位资产**，不要从头搜索。覆盖目录结构、文件命名约定、资产发现流程和常见坑。

## 调度纪律（本类任务强制）

- 所有 OpenCode 调度走 `opencode-schedule` skill：brief 预置已确认事实（实测骨骼名/材质名/失败日志），禁止 agent 重复探测
- 修复任务每轮一个原子单元（分组 → self-check → 骨骼名），验证门禁全绿才进下一个
- 开新 session 前**必须先确认旧 session 真死**（opencode-schedule Step 0：event 表最后事件 + Web UI 状态 + 三重 delete 验证），兄弟 2026-08-17 明确纠正「开启新的会话时，要先把老会话停掉」
- 全自动模式：失败自动修复（Flash→Flash→Pro→Pro+max），4 次失败才停
