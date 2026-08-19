# XiaHui 接入实战记录（2026-08-17，feat issue: 2026-08-17-XiaHui_mmd_tool_TDA_TDA_Utage_-27e3891d.md）

## 任务背景

TDA式宴 夏卉 / TDA Utage CORAL COAST.pmx 接入，产物放 `mods/mmd-character-extend/src/asset/TDA式宴 夏卉_opt/`。
验收：工作流 step1-6 全绿 + 产物在 _opt + 游戏内 XiaHui 正常加载。

## 踩坑链（按 dispatch 轮次）

| 轮次 | 失败点 | 根因 | 修复 |
|------|--------|------|------|
| fix3 | 胖次缺失 + bracelet 误归衣服 | `/bra/` 无词边界匹配 bracelet；pantiesDist(0.62) > clothesDist 胖次节点整体丢弃 | `/\bbra(s|ssiere)?\b/`；胖次独立顶层节点兜底 |
| fix4 | `self-check failed: non-Xiaye1 regions changed` | checkNonXiaye1Unchanged 只挖 Xiaye1 块，旧 XiaHui 块被当非 Xiaye1 区域 | 挖除所有角色写回区域 |
| fix5 | `manualFieldsNeeded: ikBones.yOffset` | TOE_IK_BONE_NAMES 精确匹配，XiaHui 无 右つま先ＩＫ | measureYOffset 加 `toeIkRegex = /つま先ＩＫ|足先EX/` 正则回退（TOE_IK_BONE_NAMES 零改动保 Xiaye1 BDD） |
| review | 8 项发现：幂等守卫全局判断(🔴) + 回归场景缺失 + checkCriticalParts 语义脱节等 | `src.includes(GENERATION_MARKER)` 全文件判断，双角色文件下误判 already generated | 幂等守卫/cameraFunc 校验改角色块内作用域；补 cloth 3.7b/3.7c + mmd-config 1.13 场景；132/132 绿 |
| c2 | TDD 破坏验证暴露胖次兜底分支 0 断言（破坏后 38/38 仍绿） | 兜底路径无 BDD 覆盖 = 假测试风险 | 补 cloth 1.10「胖次离身体远→独立顶层节点」场景 + 破坏验证（仅 1.10 变红） |
| fix6 | tsc 炸 5 处 TS1117（camera func 全文 27 次） | gen-first-person-hide 写回**追加语义**，`lines.slice` 保留旧 NEW_CAMERA_MARKER 段，--force 重跑累积 | 写回改**替换语义**（整体重建角色块 data 区间，旧程序产物丢弃）；新增 2.5b「--force 不累积」场景；tsc 0 错误 |

> 🔴 **C2 全绿后必须补 tsc 编译门禁**（fix6 教训）：BDD 验证生成逻辑合法，不验证生成代码的 TS 语法。jest 132/132 全绿但 `npx tsc --noEmit`（mods/mmd-character-extend）炸 5 处 TS1117——验证矩阵 = jest + tsc 双门禁，bot 独立复验时主动补 tsc，不信 agent 自报。

## 会话事故（兄弟批评）

fix4 `time_updated` 停了 12 分钟，误判「已结束」直接 dispatch fix5 → 兄弟指出 fix4 在 Web UI 还 Running（server agent 内存存活，且已越界开始修 gen-mmd-config 与 fix5 撞车）。
- 教训已 patch 进 opencode-schedule Step 0：`time_updated 停止 ≠ session 已死`，判据是 event 表最后事件类型（step-finish reason=stop 才算完成；tool-calls/step-start/tool running 都算活着）
- 处置：`opencode session delete ses_ff1e347f0ffepu7EQysNK7KAQb` + 15s 复查 + title 扫描，fix4 的 self-check 修复成果保留（gen-cloth-data.mjs 已验证 Xiaye1 回归通过）

## 实测数据（给后续角色做参照）

- XiaHui：214 bones；脚尖骨 `右足先EX/左足先EX` y=0.347；脚踝 `右足ＩＫ` y=1.594；无 下半身先/胸骨/つま先ＩＫ（transform 走 fallback 可接受）
- Xiaye1：`右つま先ＩＫ` y=0.279；有 下半身先/胸骨
- XiaHui 材质：jeans1（牛仔裤外）/jeans2（内裤）/bracelet/glasses/tail（骨骼权重空，语义表救 glasses→头饰，tail 无匹配跳过）
- cloth BDD 36/36 绿；mmd-config+cloth 105 passed；全量 mmd_tool jest 61/62（workflow-reorder 2 个 pre-existing 失败与本次无关）
- vmd-compress：87 个动画 38.7MB → 5.8MB（平均 14.98%）

## 遗留备注

- MMDData.ts 中 getMMDMaterialFixData / getVMDScaleCoefficients 需按 mmd-no-blending-scan 结果手工补（工作流提示）
- 游戏内 XiaHui 正常加载（验收标准最后一项）需 C3 部署后人工/自动验证
