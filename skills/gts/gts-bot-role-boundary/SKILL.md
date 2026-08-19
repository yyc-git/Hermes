---
name: gts-bot-role-boundary
description: GTS-Play bot 主线在 fix / feat / refactor / review 全场景的硬行为边界。明确什么能做（grep / 读 1-2 文件 / 写 brief / git / notify），什么禁止做（读 ≥3 文件 trace / 根因报告 / 方案对比 / 源码改动 / 跑 jest 验证自己改的代码）。触发场景：bot 收到 dispatch 前后的根因分析冲动，或者兄弟质问为什么在做 X，或者该调度 OpenCode 做 X。
---

# gts-bot-role-boundary — bot 角色边界

> 兄弟 2026-08-19 实锤拍板原话：
> 「**为什么你在做根因分析啊？应该调度opencode啊！修复skill**」
> 「**你不要做根因分析，应该调度opencode做。你最多就判断下大致的根因方向**」
>
> 适用范围：所有 dispatch 类 skill（gts-dev-fix / gts-dev-feat / gts-dev-refactor / gts-code-review / gts-screenshot-optimize 等）。

## 🔴 行为边界总表（铁律）

| 阶段 | bot 能做的 | bot 禁止做的 | 违规代价 |
|------|----------|---------------|--------|
| 兄弟描述 bug/需求 | 读 1-2 个最可疑文件做大致方向判断（10-30 秒）；用 10 秒速查表 A-F 过一遍 | 读 ≥3 个文件做完整 trace；写出完整根因报告（含机制解释 + 副作用链路 + 方案对比）；brief 里贴 bot 的根因分析超过 3 行；自报我看了 X 文件根因是 Y | 浪费一轮 OpenCode session（agent 倾向确认而非独立分析）+ 兄弟拍桌 |
| 写 brief | 预置已 grep/import 验证过的事实（行号 + import 列表 + 同文件成功的正确用法对照）；预置兄弟原话 + 复现步骤 + 配置/环境实测值 | 预置根因结论段；预置修复方案对比 A/B/C 段；把派工前的方向判断写成根因分析 | 引导 OpenCode 走预置错误方向，浪费 session |
| 派工后 | 读 OpenCode 报告 + 验收；git commit / merge / notify；监控 + 发「继续」唤醒 | 自己先出方案让 OpenCode 确认；自己改代码（即使是诊断日志 / 1 行 clamp）；跑 jest/tsc 验证自己改的代码 | 违反 8/18 加强版源码改动纪律（MEMORY GTS-Play 代码红线） |
| 兄弟确认方案后 | 调度 OpenCode Flash 实现；调度 gts-code-review 审核 | 跳过方案确认直接进 Step 2（违反 gts-dev-fix Step 1 → Step 2 等我确认）；bot 改业务代码绕过 OpenCode | 兄弟失去方案否决权 |

## 🔴 「大致方向」判断的硬上限（10-30 秒能完成的）

| 可做（10-30 秒） | 不可做（超过 30 秒 = 越界） |
|------------------|---------------------------|
| 1 次 grep（import.*Modal 或 from antd-mobile） | 完整读 3+ 文件 trace 链路 |
| 看 import 行 vs JSX 调用点对比 1 次 | 验证 antd-mobile Modal 完整 API（这是 OpenCode Pro 的活） |
| 1 句话定位是 X 包 import vs Y 调用风格错配 | 写出 getContainer 副作用 → portal → 覆盖 canvas 完整链路 |
| grep Modal.show / Modal.alert 看同文件命令式用法是否存在 | 对比 JSX vs 命令式 API prop 列表 |
| 判断配置层 vs 数据层、commit 自报 vs 实际 diff | 自己跑 git show / npm scripts 验证 |

判据：写出来的内容如果超过 1 段（3 行）+ 涉及 ≥2 个代码位置 → 已经超过大致方向，stop。

## 🔴 10 秒速查表（派工前必跑）

| 模式 | 信号 | bot 派工时只需 | 详见 |
|------|------|---------------|------|
| A 信 commit 当事实 | commit message 说 X 未变/已修/完成 | git show sha -- file 看真实 diff | gts-dispatch-preflight §A |
| B 配置层 ≠ 数据层 | bug 涉及配置改 → 数据变推断 | 问 X 这类配置历史上改过 Y 数据吗 | gts-dispatch-preflight §B |
| C 错误根因 → 错误派工 | 历史断言 X 改了 Y | 不要凭历史断言派工，先汇报兄弟 | gts-dispatch-preflight §C |
| D UI 库 API 风格错配 | 弹窗/UI 异常 + import 行 vs JSX 调用点风格不一致 | 1 次 grep import.*Modal + 看 JSX 调用点，直接 dispatch 修 | gts-dispatch-preflight §D |
| E 显存溢出 | 白屏 + GPU/RAM 大配置 + 玩家报告 | 1 句话 显存溢出嫌疑，让 Pro 派活时自带诊断 | — |
| F 时序/竞态 | 偶现 + 切状态触发 | 1 句话 偶现，跟 X 状态切换有关 | — |

命中任一模式 → 10 秒 grep + 1 句话 → 直接 dispatch，禁自己再做 trace。

## 🔴 brief 模板硬约束（bot 写 brief 必查）

```
## ✅ 已确认事实（grep/import/行号验证，不含根因结论）
- 兄弟原话：quote
- 文件:行号 — import / 调用点 / 同文件正确用法对照
- 环境实测:已 grep 验证的 import 列表 / 关键 prop 列表

## ❌ 不要写（违规）
- ## 根因（bot 写的 3-5 句话机制解释）
- ## 修复方案对比 A/B/C
- ## 副作用链路分析
- ## 我分析了...
```

## 🔴 实战反例（2026-08-19 prop 白屏 fix）

| 违规 | 正确做法 |
|------|---------|
| bot 读 6 个文件（Scene.tsx + City.tsx + Modal 同文件 960 行 + import grep + scss）trace 出 Modal 是 antd-mobile 命令式 API → JSX 调用静默返回 null + getContainer 副作用挂 rootDom → 切 propType 反复挂 mask → 覆盖 canvas → 全屏变白 | 1 次 grep Modal.*from antd-mobile + 看 _renderProp 行 1236 的 JSX 调用 = 1 句话 UI 库 API 错配，Modal 是命令式被当 JSX 组件用 + dispatch |
| bot 在 brief 里写根因段 Modal 是 antd-mobile 命令式 API 误用成 JSX 组件式调用，副作用挂空 mask 覆盖 canvas + 方案 A/B/C | brief 只贴已确认事实：City.tsx:5 import Modal from antd-mobile + City.tsx:960 同一文件用 Modal.show() 命令式 API 正确 + City.tsx:1236 _renderProp 把 Modal 当 JSX 调用 |
| bot 自报我看了 X 文件，根因是 Y | bot 只说方向 = UI 库 API 错配（同文件 5 行后有正确用法对照），具体根因 OpenCode Pro 验 |

## 🔴 关联纪律

- gts-dev-fix SKILL.md 根因分析纪律段 —— 已加兄弟原话硬关卡
- gts-dispatch-preflight §模式 A-D —— commit/data/UI 三类常见误判速查
- MEMORY GTS-Play 代码红线 —— 源码改动 100% dispatch
- opencode-schedule bot 主线不做重活 —— 读 >3 文件一律 dispatch

## 触发词

- bot 又在做根因分析
- 为什么你在做 X、应该调度 OpenCode
- bot 不要自己 trace
- 最多判断下大致的根因方向

## 违反检测（自检清单）

每次准备 dispatch 前，bot 自问 5 问：

1. 我读了几个文件？≥3 → 违规，立刻停
3. 我的 brief 里有没有 bot 的根因分析超过 3 行？→ 违规，压缩到 1 句话
4. 我有没有让 OpenCode 确认我已写的方案？→ 违规，让 OpenCode 独立分析
5. 我有没有写我看了 X 文件，根因是 Y 自报？→ 违规，改成方向 = X

5 问全 ✅ → 才能 dispatch。