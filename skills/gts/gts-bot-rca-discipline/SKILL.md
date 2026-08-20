---
name: "gts-bot-rca-discipline"
description: "Bot 不做根因分析实战纪律：fix/feat/任何出方案任务时 bot 最多判断 1 句话方向，根因 + 方案是 OpenCode Pro 的活。2026-08-19 prop 白屏 fix 实锤教训，兄弟拍桌后落地。"
---

# gts-bot-rca-discipline — Bot 根因分析实战纪律

> **类级别 skill**：本 skill 封装 "bot 在 GTS-Play 修复 / 出方案任务中如何判断 bot 行为边界" 的实战纪律，是 prop 面板白屏 fix（2026-08-19）等多次"bot 自己出根因被兄弟拍桌"教训的沉淀。
>
> **触发场景**：bot 接 `fix:` / Phase B Step 1 / 任何"出方案"任务时，自查"我能做到哪一步"。
>
> **核心约束**：bot 最多判断 **1 句话方向**（如"是 UI 库 API 风格错配"），不读 ≥3 文件、不写完整根因、不出方案 A/B/C。

---

## 🔴 兄弟原话（硬关卡，2026-08-19 prop 白屏 fix）

> **「为什么你在做根因分析啊？应该调度opencode啊！修复skill」**
>
> **「你不要做根因分析，应该调度opencode做。你最多就判断下大致的根因方向」**
>
> —— 2026-08-19，单机版 Prop 面板白屏 fix 第一轮

---

## bot 行为边界对照表（铁律）

| 阶段 | ✅ bot 能做 | ❌ bot 禁止 |
|------|------------|------------|
| 兄弟描述 bug | **1-2 个最可疑文件**10-30 秒判断方向（**层面级判断**，如"是 UI 库 API 风格错配"或"是状态切换竞态"或"是配置层≠数据层"）；用 dispatch-preflight §模式 A-D 速查表 10 秒过一遍 | 读 ≥3 个文件做完整 trace<br>写完整根因报告（含机制解释 + 副作用链路 + 方案对比）<br>在 brief 贴"我的根因分析：..."超过 3 行<br>自报"我看了 X 文件，根因是 Y" |
| 写 brief | 预置**已实测事实**：兄弟原话 + grep 验证过的文件:行号 + 同文件不同调用点风格对照 | 预置**根因结论**<br>预置**修复方案对比 A/B/C**——方案是 OpenCode Pro 的活 |
| 派工后 | 读 OpenCode 报告 + 验收（让 OpenCode Pro 自报 → bot 独立 grep 复核） | bot 自己先出方案 → 让 OpenCode "确认"<br>派工前自己先 trace 完，让 agent 顺着 bot 思路走 |

**违反一次 = 浪费一轮 OpenCode session**（agent 收到预置根因，倾向于"确认"而非"独立分析"，或对错根因做无效修复）。

---

## 🔴 反例：2026-08-19 prop 面板白屏 fix

### 兄弟描述（30 秒）
> 单机：按 Q 打开道具面板可能白屏（偶现）（PC端）。应该要弹窗但没弹，只是全屏变白。可排查 Scene.tsx → _openProp。

### bot 第一轮做了什么（违规）

1. **读了 6 个文件**：`Scene.tsx:133/675-689/787-792`、`City.tsx:5/894-920/960/1156-1267/1596` —— **远超"1-2 个文件"上限**
2. **写了完整根因报告**："`_renderProp` 用错 antd-mobile Modal API——antd-mobile Modal 是命令式 API（`Modal.show({...})`），但 `_renderProp` 用了 JSX 组件式调用 + 自造 `visible` / `content` / `showCloseButton` 等 prop。`getContainer={() => LandscapeUtils.getRootDom()}` 副作用会挂空 wrapper 到 rootDom，覆盖 canvas → 全屏变白"
3. **写了方案 A/B/C**（命令式 Modal.show 重构 / 换成 antd Modal / 加 useMemo 优化）
4. **给了兄弟一份"修复方案对比表"等兄弟确认**

### 兄弟拍桌（2026-08-19 原话）

> **「为什么你在做根因分析啊？应该调度opencode啊！修复skill」**
>
> **「你不要做根因分析，应该调度opencode做。你最多就判断下大致的根因方向」**

### OpenCode Pro 跑了 12 分钟，反转了 bot 的全部结论

| 项目 | bot 写的（错的） | OpenCode Pro 实跑后（对的） |
|------|----------------|---------------------------|
| antd-mobile Modal 类型 | "是命令式 API，JSX 调用是错的" | 实查 `modal.d.ts`：**是合法 React 组件**，`Modal.show()` 只是 `renderImperatively(React.createElement(Modal, ...))` 语法糖 |
| 白屏机制 | "JSX 错配 + `getContainer` 副作用挂空 wrapper 到 rootDom" | **`_openProp` 调用顺序 = 异步 setState + 同步 `handleOpenModal → stopLoop`** 停 Three.js 主循环 + 渲染竞态 |
| 偶现原因 | "切 propType 反复挂" | **`stopLoop` 与 `requestAnimationFrame` 渲染循环时序竞态** —— 在 canvas clear 后/场景绘制前触发 → 冻在 clear color（白） |
| 修复方案 | 命令式 Modal.show 重构（推荐） | 同方案 A 但理由完全不同：**消除 Portal 持久化 + 修复 setState/stopLoop 时序问题** |

### 浪费了什么

- **bot 浪费**：6 个 read_file 调用（每次 2-5k token 进上下文，参 MEMORY "bot 主线不做重活"纪律）
- **OpenCode session 浪费**：agent 收到"## 根因"段预置 = 12 分钟里前 5 分钟是"重新核对 bot 的结论"而非"独立探索"
- **兄弟信任**：兄弟当场拍桌质问 → 流程信任度下降

---

## ✅ 正确做法（反向 timeline）

### 1. 兄弟报 bug → bot 10-30 秒判断方向（只读 1-2 个文件）

```powershell
# ✅ 仅读 1 个最可疑文件（兄弟指向的 Scene.tsx）
# ✅ 仅 1 次 grep（看 import 源）
# search_files Scene.tsx _openProp | head -3
# search_files City.tsx "import.*Modal" | head -5
```

**bot 应当说**：
> "大致方向：兄弟指向的 Scene.tsx + Modal 调用。可能是 UI 库 API 风格错配（antd-mobile Modal 误用 JSX 组件式），或更深的 state 副作用。**10 秒看不准，让 OpenCode Pro 出方案**。"

**绝不说**：
> ❌ "根因是 antd-mobile Modal JSX 错配，`getContainer` 挂空 wrapper..."
> ❌ "推荐方案 A：改成 Modal.show()"

### 2. 写 brief（仅"已确认事实"段）

```markdown
## 🔴 已确认事实（bot grep 验证过）

兄弟报告：游戏内按 Q 打开 Prop 面板 → 偶现全屏变白（GTX 3060 / Ryzen7 / 60GB）。

文件位置（grep 验证）：
- `packages/frontend/src/ui_layer/index/scene/component/Scene.tsx`
  - 行 133: `let [isShowProp, setIsShowProp] = useState(false)`
  - 行 675-689: `_openProp` 函数
  - 行 787-792: KeyQ case 调 `_openProp`
- `packages/frontend/src/ui_layer/index/scene/city/components/City.tsx`
  - 行 5: `import { ..., Modal, ... } from 'antd-mobile'` ← Modal 来自 antd-mobile
  - 行 960: `Modal.show({...})` 命令式用法（**同文件另一个调用点**）
  - 行 1236-1267: `_renderProp` JSX `<Modal visible={...} content={...} ...>`

兄弟原话方向：可排查 Scene.tsx → _openProp。
玩家配置：GTX 3060 / Ryzen7 / 60GB（不是显存溢出配置）。

## 🟡 不做清单

- ❌ 不写代码、不跑 jest/tsc
- ❌ 不改 doc/ 和 笔记/语雀知识库/
- ❌ 不动 packages/frontend-multiplayer
```

**严禁**写**「## 根因」段**或**「## 修复方案对比」段**——让 OpenCode Pro 自己跑。

### 3. 派工后：bot 只做验收

- 读 OpenCode 报告（`extract-session-text.mjs <sessionId>`）
- 独立 grep 复核 OpenCode 的根因结论（不直接信 agent 自报）
- 展示方案给兄弟确认
- 进 B2（让 OpenCode Flash 实现）

---

## 10 秒速查表（bot 派工前必跑）

| 模式 | 信号 | bot 派工时只需 |
|------|------|--------------|
| **A 信 commit 当事实** | commit message 说"X 未变/已修" | `git show <sha> -- <file>` 看真实 diff |
| **B 配置层 ≠ 数据层** | bug 涉及"配置改 → 数据变"推断 | 问"X 这类配置历史上改过 Y 数据吗？" |
| **C 错误根因 → 错误派工** | 历史断言"X 改了 Y" | 不要凭历史断言派工，先汇报兄弟 |
| **D UI 库 API 风格错配** | 弹窗/UI 异常 + import 行 vs JSX 调用点风格不一致 | 1 次 grep "import.*Modal" + 看 JSX 调用点 → 写进 brief「已确认事实」段 → 立即 dispatch |
| **E 显存溢出** | 白屏 + GPU/RAM 大配置 | 不要自己加显存监控日志，让 Pro 派活时自带 |
| **F 时序/竞态** | 偶现 + 切状态触发 | 1 句话提示"偶现，跟 X 状态切换有关"，不深挖 |

**命中模式 → 写进 brief「已确认事实」段 → 立即 dispatch。不要**bot 顺着模式方向自己推根因。

---

## 与其他 skill 的关系

- `gts-dev-fix` §「根因分析纪律」—— 主入口纪律（兄弟原话硬关卡 + bot 行为边界表）
- `gts-dispatch-preflight` §模式 A-F —— 10 秒速查（避免错误派工）+ §模式 D 反例（prop 白屏教训）
- `gts-auto` §7.4.1「对外断言前必须实测」—— agent 自报必须实测
- 本 skill = **prop 白屏实战反例 + bot 操作 timeline 反向演示**（已 patch 到 dispatch-preflight §模式 D，本 skill 提供完整实战 timeline）

## 触发词

- bot 在 fix / Phase B Step 1 / 任何"出方案"任务开始前自查
- 兄弟说"为什么你在做根因分析啊" → 已违规，参考本 skill 立刻纠正
- 兄弟说"你最多就判断下大致的根因方向" → 已违规但有救，参考本 skill 收紧