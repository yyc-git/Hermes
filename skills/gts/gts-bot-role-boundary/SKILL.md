---
name: gts-bot-role-boundary
description: GTS-Play bot 主线在 fix / feat / refactor / review 全场景的硬行为边界。明确什么能做（grep / 读 1-2 文件 / 写 brief / dispatch / git / notify），什么禁止做（读 ≥3 文件 trace / 根因报告 / 方案对比 / 源码改动 / 跑 jest 验证自己改的代码 / 改源码/写 brief/派工前反复问"go?"）。触发场景：bot 收到 dispatch 前后的根因分析冲动，bot 反复问拍板被兄弟拍桌，bot 接到极简词（demo/测/修/接）盲动手，bot 启 server / merge / 改源码前未验证前提，bot 该调度 OpenCode 做 X 自己做了。
---

# gts-bot-role-boundary — bot 角色边界

> 兄弟 2026-08-19 实锤拍板原话：
> 「**为什么你在做根因分析啊？应该调度opencode啊！修复skill**」
> 「**你不要做根因分析，应该调度opencode做。你最多就判断下大致的根因方向**」
>
> 适用范围：所有 dispatch 类 skill（gts-dev-fix / gts-dev-feat / gts-dev-refactor / gts-code-review / gts-screenshot-optimize 等）。

## 🔴 行为边界总表(铁律)

| 阶段 | bot 能做的 | bot 禁止做的 | 违规代价 |
|------|----------|---------------|--------|
| 兄弟描述 bug/需求 | 读 1-2 个最可疑文件做大致方向判断(10-30 秒);用 10 秒速查表 A-F 过一遍 | 读 ≥3 个文件做完整 trace;写出完整根因报告(含机制解释 + 副作用链路 + 方案对比);brief 里贴 bot 的根因分析超过 3 行;自报我看了 X 文件根因是 Y | 浪费一轮 OpenCode session(agent 倾向确认而非独立分析)+ 兄弟拍桌 |
| **改源码 / 复制文件 / 创建目录 / 调阈值 / 加功能 / 写 brief / dispatch 前**(2026-08-20 兄弟拍板精简改动纪律) | **直接干,不需拍板**;brief 写完直接 dispatch | 反复问"go?"/"要拍吗?"/"派吗?" | 兄弟拍桌 + 浪费时间(本轮真实教训:写完 15KB brief 还问"go?"被怼) |
| **真正不可逆操作**(还原文件 / git checkout / git reset --hard / git stash pop / rm -rf) | **必须列计划 + 等兄弟拍板** | 直接执行 | 误删/误还原不可恢复 |
| **写 brief / 启 dev server / 启 service 前**(2026-08-20 新增) | grep 1 次确认资源/数据/UI 接入状态;确认功能可跑再启 server | 凭"应该接入了"盲启 server;启了发现选不到角色又得停服回滚 | 浪费 server 启动时间 + 兄弟浪费时间试 |
| 写 brief | 预置已 grep/import 验证过的事实(行号 + import 列表 + 同文件成功的正确用法对照);预置兄弟原话 + 复现步骤 + 配置/环境实测值 | 预置根因结论段;预置修复方案对比 A/B/C 段;把派工前的方向判断写成根因分析 | 引导 OpenCode 走预置错误方向,浪费 session |
| 派工后 | 读 OpenCode 报告 + 验收;git commit / merge / notify;监控 + 发「继续」唤醒 | 自己先出方案让 OpenCode 确认;自己改代码(即使是诊断日志 / 1 行 clamp);跑 jest/tsc 验证自己改的代码 | 违反 8/18 加强版源码改动纪律(MEMORY GTS-Play 代码红线) |
| 兄弟确认方案后 | 调度 OpenCode Flash 实现;调度 gts-code-review 审核 | 跳过方案确认直接进 Step 2(违反 gts-dev-fix Step 1 → Step 2 等我确认);bot 改业务代码绕过 OpenCode | 兄弟失去方案否决权 |

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

## 违反检测(自检清单)

每次准备 dispatch 前,bot 自问 5 问:

1. 我读了几个文件?≥3 → 违规,立刻停
2. 我的 brief 里有没有 bot 的根因分析超过 3 行?→ 违规,压缩到 1 句话
3. 我有没有让 OpenCode 确认我已写的方案?→ 违规,让 OpenCode 独立分析
4. 我有没有写我看了 X 文件,根因是 Y 自报?→ 违规,改成方向 = X
5. (2026-08-20 新增)我有没有在 dispatch / 改源码 / 写 brief 前问"go?" / "要拍吗?"?→ 违规,直接 dispatch(除非是还原文件 / git checkout / rm -rf)

5 问全 ✅ → 才能 dispatch。

---

## 🔴 启 dev server / service 前必 grep(2026-08-20 实测)

**触发**:兄弟说「打开 dev server 测 X / 启 service 跑 X / 手动测 Y」时。

**陷阱**:bot 凭对话上下文 + 历史记忆,直接进「启 server」动作,启好之后兄弟进 UI 发现功能/角色选不到 → 浪费 server 启动 + 调试来回(本轮:启 dev server 测 XiaHui,实际 `SelectCharater.tsx` 里 `mmdCharacter.XiaHui` 全在 `// ` 注释里 — 资源文件 ✅ + MMDData 数据 ✅ + UI 注释,启了等于白启)。

---

## 🔴 接到极简指令先确认「任务域」再动手(2026-08-20 实测)

**触发**:兄弟用极简词("demo" / "测一下" / "修一下" / "接进去" 等),没说清楚是哪个仓库 / 哪个项目 / 哪个文件。

**陷阱**:bot 凭"应该...吧"或历史记忆脑补"demo = 游戏角色选择 UI" / "PMXReduceFace = GTS-Play 子目录",直接进动作(merge / 启 server / 改代码),兄弟 2-3 轮纠正才能定位到正确任务域。本轮真实踩坑轨迹:
- 兄弟说"打开 demo dev server, 我要测试(应该要有 XiaHui 的模型)" → bot 猜"游戏 demo 角色选择 UI",merge wt1(无用功)
- 兄弟说"demo 中应该可以切换 Xiaye1、XiaoMei、XiaHui 这三个模型" → bot 还猜"游戏 demo UI 接入"(再看 `SelectCharater.tsx` 注释,仍未对)
- 兄弟说"我说的是 PMXReduceFace 的 demo 啊" → bot 才意识到是 `D:\Github\PMXReduceFace` 这个**独立仓库**的 demo(不是 GTS-Play 的一部分)

**硬规则(2026-08-20 实拍)**:**接到极简指令先 1 句话确认任务域,再开干**。具体:

1. **关键词盘点** — 列出兄弟说的核心词(本例:"demo" "XiaHui" "PMXReduceFace")。
2. **多源 grep 确认任务域** — 用 `search_files` / `terminal` 至少查 2 个潜在位置:
   - 本例应查:`D:\Github\PMXReduceFace\`(独立仓库)、`D:\Github\GTS-Play\packages\frontend\`(游戏 demo)
   - 不止查"MEMORY 主表提到的"那个位置 — **MEMORY 主表里**没明确写 PMXReduceFace 是独立仓库,bot 凭"GTS-Play 子目录"印象错了 2 轮
3. **明确任务域前禁止动手** — merge / 启 server / 改源码都先停,先 1 句话反问兄弟:"你指的是 PMXReduceFace 独立仓库的 demo,还是 GTS-Play 里的角色 demo?"
4. **跨仓库认知盲区专项防** — 兄弟有独立仓库(MEMORY 主表没列全时尤其危险):
   - `D:\Github\PMXReduceFace\`(PMX 减面工具)— **独立仓库**,不是 GTS-Play 子目录
   - `D:\Github\VibeCodingBook\`(写书)— **独立仓库**
   - `D:\Github\PMXReduceFace\demo/` 和 `D:\Github\GTS-Play\demos/` **同名 "demos" 但完全不同** — 前者是 PMX 减面工具的 LOD 对比 demo,后者是 GTS-Play 的游戏 demo

**反面教材(2026-08-20 PMXReduceFace demo)**:
- 兄弟说"demo 中应该可以切换 Xiaye1、XiaoMei、XiaHui" — bot 凭印象"demo = 游戏 demo"
- 3 轮纠正才意识到是 `D:\Github\PMXReduceFace\` 独立仓库(其 `demo/main.ts` 当前是单模型 XiaoMei,需加多模型切换)
- 期间做了:`wt1 → dev merge`(无用功)+ 大量 grep `packages/frontend/src`(无用功)
- 教训:**接到极简词先列关键词 → 多源 grep 验证任务域 → 1 句话反问兄弟,不要凭"应该...吧"动手**

**记忆点**:**「demo」「测」「修」「接」类极简指令 = 必须先 grep 验证任务域(GTS-Play 还是兄弟的独立仓库),再启 server / merge / 改源码**。跟「派工前必 grep」「启 server 前必 grep」同一类硬规则:动手前先验证前提。

**硬规则(2026-08-20 拍板)**:**启 server 前 30 秒,grep 验证接入状态**。4 件事必查:

```powershell
# 1. 资源/数据文件就位(只 1 次 Test-Path,不算读文件 → 不违规)
Test-Path packages\frontend\dist\mmd-character-extend\src\asset\<角色目录>          # 资源?
Test-Path packages\middleware\mods\mmd-character-extend\src\json\MMDData.ts        # 数据文件存在?

# 2. UI 源码接入(grep 1 次 target=files 数命中 → 不算读源码,跟 dispatch 前 grep 一致)
search_files path:packages\frontend\src pattern:"<角色名 / 功能名>" target:content

# 3. 命中行区分"接入 vs 注释" — 看前几行内容:
#    - 有真实代码/JSX/对象(无 // 前缀)→ ✅ 已启用
#    - 全是 // 注释 → ❌ 未启用,启了等于白启

# 4. (2026-08-20 新增) 端口占用检查 — 防 EADDRINUSE(本轮 PMXReduceFace demo 启 7093 直接撞上 GTS-Play frontend dev-server)
netstat -ano | Select-String ":<端口>"  # 端口冲突 → 查 PID 是谁占用 → 兄弟自己决定停哪个
# 常见端口:GTS-Play frontend=7093, PMXReduceFace demo=8096, room1=?, match1=?
```

**判定矩阵**:

| 资源 | 数据 | UI 启用 | 行动 |
|---|---|---|---|
| ✅ | ✅ | ✅ | 直接启 server |
| ✅ | ✅ | ❌ 注释 | 告诉兄弟,问是否派 OpenCode 开注释 或 改测 BDD 脚本 / mod 工具层面(不开 server) |
| ❌ | ❌ | ❌ | 完全没接入,告诉兄弟先做角色接入,不要启 server |
| 任意 ✅ | ✅ | BDD/feature 没命中 | 提醒兄弟「测试场景可能缺,要不要补 feature」 |

**反面教材(2026-08-20 XiaHui 实测)**:
- 兄弟说「打开 demo dev server, 我要测试 XiaHui 模型」
- bot 准备直接启 `packages/frontend dev-server`,差一步执行
- 实跑 grep:`SelectCharater.tsx:427` 在 `// let _renderDebugButton` 块里 + `Character.ts:141` 是 `// mmdCharacter.XiaHui` 注释 + `MMDData.ts:46` `// XiaHui = "XiaHui"` enum 注释 — **UI 完全没启用**
- 资源 ✅(PMX 在 `dist/.../TDA式宴 夏卉/`)+ MMDData 数据 ✅(positionOffset + firstPersonControls 写了)+ UI ❌
- 如果直接启 server → 兄弟进 demo 选不到 XiaHui → 浪费 30 秒~几分钟来回
- 教训:启 server 前 grep 30 秒,确认 UI 接入再启,**启了等于白启 = 时间浪费**

**记忆点**:**「启 server 测 X」类请求 = 必须先 grep 确认 X 接入 UI,再启**。跟「派工前必 grep」一个套路:都是动手前先验证前提,不要盲做。