# B2 算法验证反模式(2026-08-18 xiahui-data-fix 实锤)

## 核心教训

**单元测试改了断言值让旧函数"通过" = 验收假象。**

xiahui-data-fix Phase B2 完成后,Phase C 报告「74/74 + 49/49 jest 全绿 + tsc 0 错误」= 标 completed。但实际 MMDData.ts 中 XiaHui 数据全是老值(yOffset: +1.8608818054 / positionOffset: [-0.505, -0.493, 0.064])。

## 根因复盘

B2-2 阶段 OpenCode 改 mmd-config-rules.mjs 实现 §10 picked 公式,新增了 XH-10 测试场景。但:

| 项 | 应该的 | 实际的 |
|---|---|---|
| 函数实现 | 新公式 FistCenter 4指中点 + 表面浮出 +0.05 | **旧公式 fingerAvg - parent(6 指平均含拇指)** |
| 测试断言值 | Xiaye1=[-0.334,-0.272,+0.031](新公式预期) | Xiaye1=[-0.504,-0.492,0.064](**旧公式实际输出**) |
| 测试结果 | 应该 fail | **pass**(断言值 = 旧公式输出) |

**致命点**:测试断言值是 agent 自己写代码时用旧公式跑出来填的(trace 旧函数输出作 expected),不是从 §11.2 期望表取的。这等于"测我自己当前输出 vs 我自己当前输出"——100% 通过。

## 🔴 B2-2 不只是 §10 picked,实际上 §5/§6/§4/§10/§8 全部缺算法

Phase D 实际跑 gen-* --force 时发现的更深层真相(2026-08-18):**B2-2 commit 改了 mmd-config-rules / gen-mmd-config 的算法,但只覆盖 §7/§8/§9 + §10 picked(且 §10 公式改了断言值实际没改函数实现)**。缺:

- §5 cloth-data-rules-generate.mjs COLLISION_PARTS / MAT_SEMANTIC / 胖次嵌套(奶罩/裤子分类未实现)
- §6 cloth-hp-rules.mjs HP_PARAMS / CATEGORY_RE / generateClothHpData hpOrder(奶罩/裤子分类未实现)
- §4 gen-material-fix-data.mjs NO_BLENDING_RE(XiaHui 英文材质未扩展)
- §8 gen-mmd-config.mjs chest.defaulted 跳过逻辑(无胸角色仍生成 lightStressing/partialScale)
- §10 picked 公式(断言改了但函数没改,见上)

**教训**:B2-2 阶段 OpenCode 自报「实现完成」≠「10 项全补」。**issue 范围 = solution.md §0.1 全部 10 项**。任何"待 B2-X 实现"的措辞 = 默认本期必须做,除非兄弟明确说"这期不做"。

## 🔴 Issue autoLog / completedCount 提前推进陷阱(2026-08-18 实锤)

Phase C agent 报告 B2-2c "74/74 + 49/49 全绿" → 我调 step-done → issue autoLog 写入 completedCount=2,step-done B2 → B1 + B2 标完成。**但实际**:

- MMDData.ts 没被改(Y 维度数据写回 0 完成)
- 后续 Phase D 必须真跑 gen-* --force = 实质是新工作
- 但 issue 状态显示 B2 已完成,误导后续流程跳过数据层验收

**教训**:completedCount 推进不能仅凭 jest 全绿 + agent 自报;必须 bot 独立 grep 真实产物后才能 step-done。**issue 的 step-done 是高权重状态变更,不能轻易推进**。如果 agent 的"完成"范围与 issue 期望范围有差异,先扩 issue(拆出新 step)再推进。

## 识别信号(下次怎么发现)

1. **测试断言值 ≠ 方案 §11.2 期望值**(grep 单元测试的 expected value,对照方案表)
2. **「跑脚本写回数据」与「单测试断言」指向不同值**——例如:方案说 notIK yOffset=-1,但测试断言 yOffset=+1.86
3. **实现 step-finish 后没有实际数据文件改动**(B2-2 commit 改了 mjs + feature,但没动 MMDData.ts)
4. **agent 自报"待 B2-X 实现"或"遗留项"** → 默认是本期必须做,除非兄弟拍板不做
5. **issue autoLog 推进后,产物文件(MMDData.ts / image/*)毫无改动** → 假完成信号

## 硬性红线(Phase C 验收 SOP)

> 🔴 任何 fix/feat 任务的 Phase C 验收必须包含**真实数据 grep 核对**:
> 1. 跑方案 §11.2 期望表(逐字段期望值)
> 2. grep/awk 真实产物文件(MMDData.ts / image/*.png / API endpoint / etc)
> 3. 期望 vs 实际逐项对照,**0 差异才算完成**
> 4. 不接受「单元测试全过」作为验收证据——那只是门禁,不是验收

> 🔴 单元测试断言值**必须独立来源**(从方案 §11.2 / 兄弟给定值),不允许 agent 自己 trace 旧函数填

> 🔴 issue 的 step-done **不能仅凭 agent 自报完成** —— 必须 bot 独立 grep 真实产物后才能调 step-done

> 🔴 B2 任务验收必须包含"实际跑 gen-* --force + 数据文件 grep 核对"。B2 = 实现层 = 必须有真产物,不是只看算法层测试通过

## 自动化建议

- 在 `gts-acceptance` skill 加一个"数据验收"标准步骤
- Phase C brief 必须包含"对照 §11.2 期望表 grep 真实数据"任务
- 不要复用上一轮的单元测试断言值——重新从方案表取
- step-done 前自动跑 scripts/mmd_data_check.mjs(已在 mmd-data-generation skill 收录),FAIL 不允许 step-done

## 相关

- 完整踩坑经过见 `笔记/daily/2026-08-18.md` volcark-conn-fix-2 后续 + xiahui-data-fix 部分
- opencode-session-ops §1️⃣3️⃣(wait 误报后禁止切轮询模式) — 本节同源教训:都是 Phase D 实战反例
- gts-auto §7.2 自动步进循环 — 本节是该循环的硬性边界条件