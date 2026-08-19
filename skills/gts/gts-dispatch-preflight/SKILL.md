---
name: "gts-dispatch-preflight"
description: "派工前根因验证 + 反向断言清单。bot 在写 brief 派 OpenCode 之前的硬关卡：commit message / agent 自报 / 历史断言都不是事实，必须实测才能写进 brief。错误根因 → 错误派工 → 浪费一轮 + 兄弟拍桌。"
---

# gts-dispatch-preflight — 派工前根因验证

> 触发时机：**bot 准备 dispatch OpenCode 之前**（无论 gts-dev-fix / gts-dev-feat / gts-auto / Phase Fix / 代码审核 fix brief 任何场景）。
> 效果：强制走"派工前根因验证 checklist"，避免基于错误前提派工。
> 适用：当 bug 描述里有"X 改了 / X 没变 / X 是原因"这类断言，且断言源是历史 commit message / agent 自报 / 笔记 / daily log。

## 🔴 激活条件

满足以下**任一条件**时，必须走本 skill：

1. **修复任务 brief 提到某个 commit 的自报**（如 "fix X 报告说 Y 未变"）→ 派工前必须 `git show` 验真实 diff
2. **bug 描述里有历史断言**（"X 改了 Y / X 没动 Y"），断言源 = commit message / agent 自报 / PR 描述 / 笔记 / daily log
3. **根因涉及"配置改 → 数据变"** 类推断（如 cloth 规则改面数 / 枚举改字节）→ 必须先验证配置层 ≠ 数据层
4. **承接上一轮 OpenCode 报告**（"已修 / 已完成 / 已验证"），派新 brief 时直接引用 → 视为待实测假设

## 🔴 派工前根因验证 Checklist（5 项强制）

| # | 检查 | 方法 | 失败 → 行动 |
|---|------|------|------------|
| 1 | **commit message ≠ 事实** | 任何 commit 自报"未变/已修/完成" → 必须 `git show <sha> -- <file>` 看真实 diff，核对改动行数 + 改动内容 | message 与 diff 不符 → 以 diff 为准，brief 中标注"实际改动 vs 自报不一致" |
| 2 | **配置层 ≠ 数据层** | 修改"碰撞规则/分类标签/枚举"等配置 → 不改原始数据（面数/顶点数/字节数）。验证改动是否触及数据文件本体 | 配置改动被误归因为数据变化 → 找真正数据源（pmx/二进制/原始资产） |
| 3 | **报告源必须扩展** | "对外断言源"不只 agent 自报/审核报告，还包括：commit message、PR 描述、issue 评论、文档/笔记/daily log | 把历史断言当事实 → 列入待实测清单 |
| 4 | **brief 必须含"反向验证"** | brief 中必须明确写"先做 X 实测确认根因，再做 Y 修复"，不允许 brief 直接跳到修复步骤 | brief 缺反向验证 → 补上再 dispatch |
| 5 | **agent 跑偏早熔断** | wait/DB 看到 agent 在错误方向（grep 错关键词/读错文件）→ 立即 kill + 重派，不要等完成 | agent 已跑偏 → kill + 新 brief 指明正确方向 |

## 🔴 三大根因错误模式（2026-08-19 教训汇总）

### 模式 A：信 commit message 当事实

**实例**：68728ceea commit message 写"Xiaye1 数据字节不变"，但 bot 没 `git show` 验真实 diff 就接受。

**对策**：
- 任何 commit 自报 → 必须 `git show <sha> -- <file>` + `git diff <sha>^..<sha> -- <file> | wc -l` 看真实改动行数
- 如果 commit message 与 diff 不符 → 在 brief 中显式标注"⚠️ commit 自报 X，实测 Y，以实测为准"

### 模式 B：配置层 ≠ 数据层（领域知识误判）

**实例**：本次误以为"cloth collision damageParts 数组改了 → jacket1 面数减少"。**事实上 cloth collision 不定义面数**，面数在 pmx 二进制里。

**对策**：
- brief 涉及"X 配置变化导致 Y 数据变化"时，必须先问自己："X 这类配置历史上改过 Y 数据吗？"
- 不确定 → 派工前先查一次领域知识（grep / 文档 / OpenCode 咨询），不要凭直觉推断
- brief 中显式写"X 改动 vs Y 变化的因果链"，让 OpenCode 反向验证

### 模式 C：错误根因 → 错误派工

**实例**：本次基于"§5 算法误伤 jacket1"派了 Phase Fix-r3，agent 实际在 grep "necklace|XiaHui|材料|materials"，方向完全错。

**对策**：
- 派工前 checklist 走完，发现根因不成立 → **不要硬派**，先汇报兄弟等拍
- 已经派了 + agent 在错方向跑 → 立即 kill（gts-opencode-stop）+ 新 brief 指明正确方向，不要等完成
- brief 模板必含一段"根因反向验证"：

```markdown
## 根因反向验证（必走，2026-08-19 教训）
本次派工的根因假设：<一句话>
反向验证证据：
- [ ] commit message 实测：<sha> + `git show <sha> -- <file>` 结果
- [ ] 配置层 ≠ 数据层验证：<方法>
- [ ] 数据源定位：<pmx/二进制/原始资产路径>

任何一项未做 → 不允许派工。
```

## 🔴 违反后果（实测）

- **浪费一轮 OpenCode session**：本次 ses_fe87f0c9... 跑了 2 分钟，agent 在错方向（grep necklace/XiaHui）
- **兄弟拍桌质问**：发现根因错误 → 流程信任度下降
- **wait 误判**：wait timeout 后才发现 agent 在错方向 → 增加调试成本

## ✅ 验证方法

走完 checklist 后，brief 开头必须有：

```markdown
✅ 派工前根因验证已走完：
- [1] commit 68728ceea 实测：`git show` 显示仅改 XiaHui cloth collision（+damageParts），未碰 Xiaye1
- [2] 配置层验证：cloth collision 不定义面数，面数在 pmx 资产
- [3] 数据源定位：fc1e492f1 改了 pmx 字节（1249910→1474610），可能真凶
- [4] brief 含反向验证步骤
```

## 关联 skill

- `gts-dev-fix` §「根因分析纪律」—— 已规定"无 Phase 0 时 bot 不做根因分析"
- `gts-auto` §7.4.1「对外断言前必须实测」—— 已规定 agent 自报必须实测
- `gts-code-review` §「审核结论必须可复现」—— 已规定审核类结论必须实测
- 本 skill 扩展以上三条：**派工前的所有断言源都必须实测**，包括 commit message、历史笔记、daily log

## 触发词

- "派工前根因验证"
- "commit message 实测"
- "反向断言"
- "Phase Fix 派工前"
- 兄弟说"为什么 X 改了/没改"时 → 必须走本 checklist

## 🔴 跨 git 仓派工（独立仓库，2026-08-19 PMXReduceFace 实测教训）

> **本节是 gts-dispatch-preflight 的特例扩展**：当派工目标是**独立 git 仓**（不在 wt1/worktree 内、是独立 repo，如 `D:\Github\PMXReduceFace` / `D:\Github\VibeCodingBook`），workdir 切换到外部仓时，**agent 默认倾向去 wt1/GTS-Play 主仓找上下文**（AGENTS.md / 项目规则 / 关联代码），全部被外部权限弹窗拒 → 卡死。

### 跨仓派工必做的 4 件事

1. **brief 开头显式声明 workdir 范围**：
   ```markdown
   ## 🔴 工作目录边界（必填，跨仓派工）
   - workdir = `D:\Github\<独立仓>`（绝对路径，独立 git 仓，不是 wt1/worktree）
   - **禁止 agent 读取 workdir 之外的路径**：
     - ❌ `D:\Github\GTS-Play` / `D:\Github\wt1` / 其他任何兄弟仓（除非 brief 显式允许）
     - ❌ `C:\Users\...`、`D:\Downloads\` 等系统/外部目录
     - ✅ 仅限 workdir 内（`<workdir>/src/...`、`/<workdir>/test/...`、`/<workdir>/README.md` 等）
   - **测试输入素材**（pmx/二进制/数据文件）如在 workdir 外 → 用绝对路径显式声明，标注"只读 fixture，不要尝试 patch"
   ```

2. **brief 自我包含项目规则**（不依赖 agent 读 AGENTS.md）：
   - GTS-Play 的 8 条铁律在 `D:\Github\GTS-Play\AGENTS.md`，但独立仓派工时 agent 读不到
   - 把 brief 里需要的核心规则**直接写到 brief**（如"减面目标 ≤ 50000，否则不削"），不要写"参考 AGENTS.md"

3. **跨仓读取的 fixture 处理**：
   - PMXReduceFace 跑实测要 wt1 的 pmx 资产 → brief 明确写 `D:/Github/wt1/mods/.../*.pmx` 是**只读 fixture**，agent 用 read tool 读不写
   - 但若 agent 用 edit tool 改 = 触发外部权限 → brief 必须说"如需验证 pmx 用 cp 到 workdir 临时目录再操作"

4. **派工后 30 秒内查 session 是否被权限卡**：
   - `opencode db "SELECT substr(data,1,300) FROM part WHERE session_id='<sid>' ORDER BY time_updated DESC LIMIT 1"` 看最后事件
   - 看到 `tool` `state.error` 含 "external_directory" / "user rejected permission" → 立刻判定 agent 试图越界,**不要等它自己恢复**
   - 用 HTTP API `/session/{sid}/message` 追加消息明确禁止跨仓读(详见 opencode-session-ops §1️⃣7️⃣「权限等待 vs stuck」)

### 🔴 `--attach` 参数必须带 `http://` 前缀(2026-08-19 实测踩坑)

跨仓派工常踩的另一坑:`opencode run --attach 4098`(只传端口号)**不是有效 endpoint**:

```
# ❌ 错误写法
opencode run --attach 4098 --title "phaseFix-r4" ...

# 报错
Failed to construct 'Request': Invalid URL "4098/session"
```

根因:`--attach` 参数**必须是完整 URL**(OpenCode CLI 不会自动补 `http://localhost`),不补前缀会被当成相对路径。

```powershell
# ✅ 正确写法
opencode run --attach http://localhost:4098 --title "phaseFix-r4" ...
```

**派工 checklist 加一条**:
- [ ] brief 中所有 `opencode run` 命令的 `--attach` 参数都带 `http://localhost:4098` 完整 URL
- [ ] 没 `http://` 前缀的 → 当场补全再 dispatch

### 反面教材（2026-08-19 PMXReduceFace 实测）

派 `--dir D:/Github/PMXReduceFace` 修 `reduce.mjs`（`totalTri ≤ 50000` 时直接 skip QEM），brief 里**没显式禁止跨仓读**。Agent 跑起来后：
- 读 reduce.mjs / qem.mjs / pmx-writer.mjs / 测试 ✓（workdir 内）
- 试图读 `D:\Github\GTS-Play\AGENTS.md` → **external_directory 权限拒绝** ❌
- 试图 glob `D:\Github\wt1/**/pmx-optimize*` → **external_directory 权限拒绝** ❌

Agent 浪费 30+ 秒试错才回到 workdir 内路径。如果 brief 开头明确禁止跨仓读，agent 第一秒就知道不要尝试。

### 与 opencode-session-ops §1️⃣7️⃣ 的关系

- opencode-session-ops §1️⃣7️⃣ 是**事后诊断**：agent 已被权限卡住时怎么识别 + 救
- 本节是**事前预防**：brief 写法上避免触发权限弹窗
- **两者配合**：预防 + 诊断 = 双保险

## 🔴 brief 假设必须实查 pmx（2026-08-19 r7 IK 骨骼判定教训）

**陷阱**：写 mmd-data 类 brief 时，常常基于历史 commit message / agent 自报 / 笔记 推断角色 PMX 的几何状态（如"XiaHui 没有 IK 骨骼 / 没有『頭』骨 / 没有『メガネ』骨"），但这些都是历史断言，**PMX 实际状态可能已变**或原本就猜错。

**实例（2026-08-19）**：
- r7 brief 假设"XiaHui 无 IK 骨骼"（基于历史 sense：XiaHui 是 TDA 模型 + 上一轮 jacket1 分析语境）
- 实测：XiaHui pmx **有** `右つま先ＩＫ` + `左つま先ＩＫ` 两根骨骼（agent 用 `bones.filter(b => /IK/.test(b.name))` 实查确认）
- agent 自行识别假设错误，用 `bones_lite` 那个真正无 IK 的 PMX 做替代验证，**结论仍然正确**

**规则**（任何 mmd-data / PMX 相关 brief 必跑）：
1. **禁止基于历史断言写"X 角色没有 Y 骨骼"**——必须先跑 `bones.filter(b => /<关键词>/.test(b.name))` 实查 PMX 骨骼表
2. brief 必填"实查 PMX 骨骼名"步骤（在「输入」段写明），agent 开工前必须先 grep 目标 PMX 的骨骼名，确认假设成立再继续
3. 实查脚本（写到 brief 验收段）：
   ```bash
   node --input-type=module -e "
   import {parser} from './src/tool/pmx-physics-reduce/pmx-loader.mjs';
   import fs from 'fs';
   const buf = fs.readFileSync('<目标 PMX 绝对路径>');
   const m = parser.parsePmx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), false);
   console.log('骨骼总数:', m.bones.length);
   for (const kw of ['<关键词 1>', '<关键词 2>']) {
     const matches = m.bones.filter(b => b.name && b.name.includes(kw));
     console.log(kw, '匹配:', matches.map(b => b.name));
   }
   "
   ```
4. **若 brief 的核心假设被实查推翻**：agent 不应继续 brief 给的"应该值"路径，必须汇报兄弟 + 给新 brief 修正方向（类似兄弟原话："如果没有那两个骨骼，还是要有 shoeType 数据"——这个补充规则就是 r7 假设出错后兄弟给的修正）

## 🔴 同文件派工要串行（2026-08-19 r8/r9 兄弟拍板教训）

**陷阱**：两个修复点想并行派，但**两者都改同一文件**（如 `gen-mmd-config.mjs` + `mmd-config-rules.mjs` 紧密耦合）→ 两个 agent 同时 read/edit 同一文件 = 后者可能覆盖前者产出。MMDData.ts 也有同样风险：两个 agent 都用 `write_file` 重写整个文件时，后者会覆盖。

**实例（2026-08-19）**：
- 兄弟给选项 (3) 同时派 r8 + r9，但随后选 **(a) r8 Free 立即派，r9 Pro 等 r8 完成**——明示"同文件派工要串行"
- r8 agent 实际上重写了 MMDData.ts firstPerson 函数区
- 若同时派 r9，r9 agent 也想 write_file MMDData.ts → 后者覆盖前者 → 数据丢失

**规则**（任何"派两个 OpenCode session"的场景必走判断）：
1. **派工前先列每个 session 计划改动的文件清单**——grep 两个清单的重叠文件
2. **重叠文件 ≠ 0** → **禁止并行**，串行派（前一个 done 后再派下一个）
3. **重叠文件 = 0**（如 r5 cloth 算法 vs r6 snapshot 渲染）→ 安全并行
4. **同仓不同 package**（如 GTS-Play 内 frontend vs forum）→ 安全并行（OpenCode 按 `--dir` 仓库根解析，agent 能区分 package）
5. **不同 git 仓**（如 GTS-Play vs PMXReduceFace）→ 安全并行（attach 注入按仓隔离）

**特例**：`MMDData.ts` 文件本身**永远视为重叠**——任何两个 fix 都可能涉及 MMDData.ts 写回，禁止两个 session 同时跑改 MMDData.ts。

**判定速查**：
| session A 改 | session B 改 | 同文件？| 并行？ |
|------------|------------|--------|--------|
| `cloth-data-rules-generate.mjs` | `snapshot-view.html` | ❌ | ✅ |
| `gen-mmd-config.mjs` (r8) | `gen-mmd-config.mjs` (r9 picked) | ✅ | ❌ 串行 |
| `MMDData.ts` 写回 A 函数 | `MMDData.ts` 写回 B 函数 | ✅ | ❌ 串行 |
| `gen-first-person-hide.mjs` (GTS-Play) | `reduce.mjs` (PMXReduceFace) | ❌ | ✅（不同仓）|
| `packages/frontend/...` | `packages/forum/...` | ❌ | ✅（同仓不同 package）|

**记忆点**：r8/r9 兄弟选项 (3) → (a) 的选择不是"胆小"，是**有意为之的串行保护**。当两个 session 文件清单重叠时，宁可慢一轮也不要丢数据。

## 🔴 commit-session brief：允许 agent 自调文件归属（2026-08-19 实测）

**陷阱**：commit-session brief 列两个 commit 的"精确文件清单"，但 agent 在做 `git diff` 时可能发现：
- 列在 commit 1 的文件其实没改（diff 为空）→ 不该入库
- 列在 commit 2 的文件 diff 实际是 commit 1 的逻辑依赖（必须随 commit 1 才能让 commit 2 通过验证）→ 该移到 commit 1

**实例（2026-08-19）**：
- brief 写 commit 1 含 `cloth-data-rules-generate.mjs` + `cloth-data-rules-body.mjs` + `gen-mmd-config.mjs`
- agent 跑 `git diff` 发现 commit 1 缺 `gen-mmd-config.mjs` 会导致 commit 1 验不过（mmd-config-rules.mjs 强耦合 renderShoeDataBlock，cloth 算法改了但 mmd-config-rules 没同步 → 渲染崩）
- agent 主动把 `gen-mmd-config.mjs` 从 commit 2 移到 commit 1，并在报告里说明偏差

**规则**（commit-session brief 必填）：
1. brief 列"建议文件清单"而非"硬性清单"——加一句"允许 agent 根据 git diff 实测调整文件归属，需在报告里说明偏差原因"
2. 派工前 bot 自己跑 `git diff` 看实际改动，避免列出"看起来该改但实际没改"的文件
3. 偏差合理（耦合/依赖/实际未改）→ 接受 agent 调整；偏差不合理（agent 偷工把 work 移到下一个 commit）→ kill 重派

**记忆点**：commit-session 是机械活，但**文件分组是领域知识**——agent 跑 `git diff` + 看耦合的能力比 bot 强。brief 允许偏差 ≠ 不验收，最终必须看 `git log --stat <sha>` 确认每个 commit 改的文件就是它声明的范围。

## 🔴 模式 D：UI 库 API 风格错配（import 源 vs JSX 调用点，2026-08-19 实测教训）

**陷阱**：bug 表现为 UI 异常（白屏/弹窗不显示/样式错乱），原因往往是 **import 源的命令式 API 被当成 React 组件 JSX 调用**——同类 UI 库在不同包里有不同 API 风格，但语法上都能 `<Name prop=... />` 通过 TS 编译，运行时才炸。

**实例（2026-08-19 单机版 Prop 面板白屏，**模式 D 命中但根因反转**）**：

> 🔴 **本实例的教训价值 > 模式 D 原描述**：bot 自己跑模式 D 命中后**写了完整根因 + 方案 A/B/C** → 兄弟当场拍桌质问「为什么你在做根因分析啊？应该调度opencode啊！」→ OpenCode Pro 实际跑 12 分钟反转了 bot 的根因结论。

- 兄弟反馈：游戏内按 Q 打开 Prop 面板 → 全屏变白（偶现），点弹窗里 icon 更稳白
- **bot 自判（违规）**：读完 `Scene.tsx:675-689` `_openProp` + `City.tsx:1236` `_renderProp` + `ModalUtils.ts` 三处后，bot **自己写了完整机制**：`Modal` 来自 `antd-mobile`（命令式 API `Modal.show({...})`），被错配 JSX 组件式调用 + `getContainer` 副作用挂空 mask 到 rootDom → 全屏白
- **OpenCode Pro 实跑反转**（agent 跑了 12 分钟）：
  1. 实查 `node_modules/antd-mobile/es/components/modal/modal.d.ts` → **`Modal` 是合法 React 组件**，`<Modal visible={...} content={...}>` 完全合法（`Modal.show()` 只是 `renderImperatively(React.createElement(Modal, ...))` 的语法糖）→ bot 的"JSX 错配"结论**完全错误**
  2. 真凶：`Scene.tsx:675-689` `_openProp` 调用顺序 = `setIsShowProp(true)` (异步) + `setCurrentPropItem(...)` (异步) + `handleOpenModal(state)` → **`stopLoop(state)`（`ModalUtils.ts:21-26`）同步停 Three.js 主循环**
  3. **白屏偶现** = `stopLoop` 与 `requestAnimationFrame` 渲染循环竞态——`stopLoop` 恰好在 canvas clear 后/场景绘制前触发 → canvas 冻在 clear color（白）
  4. 推荐方案：`useEffect` + 命令式 `Modal.show({...})`（参照行 960 已成功模式）

**🔴🔴 bot 实操教训（2026-08-19 反例，2026-08-19 patch 入库）**：

1. **模式 D 命中 → 1 句话写到 brief「## 已确认事实」段，立即 dispatch OpenCode Pro**——**不要 bot 自己出根因**
2. **brief 严禁「## 根因」段**（如"## 根因\n<bot 写的 3-5 句话>"）——只贴 grep/import/行号验证过的事实；根因段、副作用机制、方案 A/B/C = OpenCode Pro 的活
3. **bot 出根因 = 给 OpenCode 喂错误假设**：agent 收到预置根因倾向于"确认"而非独立分析 → 即使假设方向有重叠（如模式 D 命中），bot 自己写的细节很可能**完全错**（prop 白屏反转就是明证）→ 浪费时间 + 兄弟拍桌
4. **模式 D 的价值 = 帮 bot「派谁 + 预置哪些事实」，不是「帮 bot 写根因」**

**对策**（派工前必跑，patch 后修订）：
1. **看 import 行 vs JSX 调用点**——10 秒检查，比 trace state 链路快得多
2. 看到 `<LibName prop=...>` + 同一文件别处有 `LibName.method({...})` 命令式用法 → **API 风格错配信号**，把信号写进 brief，让 OpenCode 验证是不是这个错
3. **不要在 brief 里写"根因 = API 错配"**——只写"已确认事实：Modal 来自 antd-mobile (行 5 import)；同文件行 960 用 Modal.show({...})，行 1236 用 <Modal> JSX 调用"
4. GTS-Play `packages/frontend` 高频踩坑名单（**写到 brief 预置**）：
   - `antd-mobile` 的 `Modal` / `Toast` / `Dialog` / `ActionSheet` / `Popup` — 全是**命令式**
   - `antd`（web 版）的同名组件 — 才是**JSX 组件**
   - 两者包名只差 `-mobile`，IDE 自动 import 容易混
5. **不抢占 OpenCode Pro 的工作**——10 秒速查是「派工」依据，不是「出方案」依据

**对策**（派工前必跑）：
1. **看 import 行 vs JSX 调用点**——10 秒检查，比 trace state 链路快得多
2. 看到 `<LibName prop=...>` + 同一文件别处有 `LibName.method({...})` 命令式用法 → **API 风格错配**，八成是 bug
3. GTS-Play `packages/frontend` 高频踩坑名单：
   - `antd-mobile` 的 `Modal` / `Toast` / `Dialog` / `ActionSheet` / `Popup` — 全是**命令式**
   - `antd`（web 版）的同名组件 — 才是**JSX 组件**
   - 两者包名只差 `-mobile`，IDE 自动 import 容易混
4. 这个检查**不算"trace 根因"**——只看 2 行代码 + 1 次 grep 就能定位，不抢占 OpenCode Pro 的工作
5. brief 里把根因写明"`<Modal>` 是 antd-mobile 命令式 API，错配 JSX 调用" → OpenCode 直接出修复方案，不需要再猜

**反面信号**（不是这个模式）：
- ❌ TS/编译错误（用错 API 编译一般不报错，因为 prop 类型可能 union）
- ❌ 运行时 console error（命令式对象当组件 createElement 多数静默返回 null）
- ❌ React DevTools 报 Warning（只在某些版本有，不是稳定信号）

**记忆点**：UI 类 bug，先花 10 秒做"import 源 vs JSX 调用"交叉检查 → 把信号写进 brief「已确认事实」段 → 立即 dispatch OpenCode Pro 验证。**不要 bot 自己出根因**——模式 D 命中不等于结论正确，prop 白屏的根因反转就是反例。
