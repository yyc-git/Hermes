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

1. **修复任务 brief 提到某个 commit 的自报**(如 "fix X 报告说 Y 未变")→ 派工前必须 `git show` 验真实 diff
2. **bug 描述里有历史断言**("X 改了 Y / X 没动 Y")，断言源 = commit message / agent 自报 / PR 描述 / 笔记 / daily log
3. **根因涉及"配置改 → 数据变"** 类推断(如collision 规则改面数 / 枚举改字节)→ 必须先验证配置层 ≠ 数据层
4. **承接上一轮 OpenCode 报告**("已修 / 已完成 / 已验证")，派新 brief 时直接引用 → 视为待实测假设
5. **兄弟说"X 应该 Y"**(期望式描述,如"demo 应该可以切换模型"/"X 应该已经修好")→ 派工前必须 grep 实查,不能信期望(模式 F)

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
- 兄弟说"X 应该 Y"(期望式) → 必须先 grep 实查,不走"启服务测 Y"快速路径(模式 F)

### 派工后通知等待 vs 主动轮询(2026-08-20 兄弟拍板)

派工后的"等待策略" 4 选 1:

| 场景 | 正确做法 | token 成本 | 兄弟拍板原话 |
|------|---------|----------|------------|
| Hermes 通知可信 | **不轮询**,等 `notify_on_complete` 自动唤醒 → `process(action=log, offset=-2)` 读最后输出 + `git log -3` 看 commit → 整轮回复 | 0 token(只读 + 一次性回复) | 「不需要告诉我」 |
| 通知丢失/不可靠 | `process(action=log, session_id=<wait_id>, limit=2)` 看 wait stdout | **0 token/token调用**(纯工具) | 「间隔 60s」|
| Pro non-max 静默 20+ 分钟 | 仍不轮询,等通知到达一次性查 DB part 表 | 0 token | 「不需要告诉我」 |
| 全自动模式 | 同上,轮询间隔 120s | 0 token | 「全自动 120s」 |

**核心**:OpenCode 派工后 bot 主线**不主动通知「在跑」**(兄弟原话「不需要告诉我」);`process(action=log)` 工具调用是 token=0,**不是**等误 OpenClaw 老 poll 每轮触发整轮对话烧 2 亿 token 的场景。

**记忆点**:派工 → 拿 sessionId → 落盘 meta → 启 wait 脚本(`maxWaitMs=5400000`/`stableMs=300000`)→ turn 结束,**等 Hermes 通知**。通知到达后**一次性**读 + 验收。**不轮询,不通知"在跑"**。

#### 🔴 wait `stableMs` 必须 ≥ 600000 全自动模式,300000 普通模式(2026-08-20 实锤)

**根因**:gts-auto 默认 `idleTimeoutSec=120`(2min) 在 BDD/单测场景下严重不够。PMXReduceFace `yarn test:bdd --runInBand` 跑 35+ BDD 实测 5+ 分钟,期间 agent 调 `npx jest ...` 跑命令间隙无 part 更新,wait 误判 idle 触达退出 → agent 实际 `step-finish reason=tool-calls` 还在跑。

**两次踩坑(2026-08-20 实测)**:stableMs=120000(gts-auto 默认)误判 → 改 300000 仍误判 → 改 900000(15min)最终正确等到完成。

**wait 退出后,先查 part 表 `step-finish reason` 字段再决定下一步**(避免误判导致重 dispatch 或发「继续」):

```powershell
opencode db "SELECT substr(CAST(data AS TEXT),1,300) FROM part WHERE session_id='<sid>' ORDER BY time_updated DESC LIMIT 1" --format json
```

| part 最后 step-finish reason | 结论 | 下一步 |
|---|---|---|
| `stop` / `completed` | ✅ 真完成 | 收产物汇报 |
| `tool-calls` / `running` | agent 还在调用工具,wait 误判 | 发「继续」唤醒(读 meta 拿原 `-m`),**不要**进下一阶段 |
| `unknown` + tokens 0 + cost 0 | 🔴 LLM 静默失败 | 走静默失败 SOP(见 gts-opencode-session-ops 或本 skill 主表) |

**🔴 硬性派工 brief 模板补充**:派工时 wait 参数必须按场景选,不要凭记忆默认:

| 场景 | `maxWaitMs` | `stableMs` | 理由 |
|---|---|---|---|
| 全自动 + BDD/单测 | 3600000-5400000 (60-90 min) | **600000-900000 (10-15 min)** | jest 跑 5+ 分钟正常,工具调用间隙无输出 |
| 普通模式 + 轻量任务 | 1800000-3600000 (30-60 min) | 300000 (5 min) | Flash 完成通常 < 2 min |
| Pro/Max 报告阶段 | 7200000-14400000 (2-4 h) | 4800000 (80 min) | 模型内部思考+报告生成长 |

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

## 🔴 模式 E：回答"改没改/修没修"必查 git,不信 MEMORY 沉淀(2026-08-20 实测)

**陷阱**:兄弟问「X 修了没 / X 改了哪些 / 上次 fix 改了什么」类历史状态问题,bot 凭 MEMORY/daily log 沉淀直接报「已修 / 待修 / 改了 N 个文件」——MEMORY 写的是**某次 commit 时刻的快照**,但后续可能有 bug 修复 / 回归 / 重构让状态变化,而 MEMORY 不会自动追新。

**实例(2026-08-20 实测)**:

- 兄弟问「回忆昨天对 Modal 白屏的修复」
- bot 凭 MEMORY 答「已修:City prop modal;待修:setting modal/City.tsx:848 + MissionEnd/MissionFail/MissionComplete + Upgrade Mask」
- 兄弟立刻质疑「不是都修复完成了吗?」+ 给出 commit `7a7029a3` 锚点
- 实测 `git log --grep="antd-mobile Modal"` → 真实 commit 是 `d6681051e`,3 个文件一次性修完(City.tsx/Upgrade.tsx/MissionComplete.tsx)
- MEMORY 沉淀里的「待修清单」是**过期快照**,**昨天 commit 已全清**——bot 误导了兄弟

**🔴 实战规则**(`gts-dispatch-preflight` 适用域扩展:任何对外断言不只是派工前):

1. **回答"X 改没改 / X 修了什么"类问题前,先 git 查证**(不信记忆/MEMORY/daily/笔记):
   - `git log --all --oneline --grep="<关键词>" -20` 找真实 commit hash
   - `git show --stat <sha>` 看真实改动文件 + diff 行数
   - **不要抄 commit message 当真实改动**——message 可能漏写/夸大
2. **MEMORY 沉淀的"待修清单"默认带「last_verified_at」语境**——超出 24h 必须 git 复查
3. **回答格式应该含真实 commit hash + 改动文件 + diff 行数**,而不是「改了个大致内容」
4. **如果 MEMORY 沉淀 vs git 实测不一致**:
   - 立刻汇报兄弟"⚠️ MEMORY 沉淀 X,git 实测 Y,以 git 为准"
   - 这是兄弟第一次纠正的强信号 → 同步 patch 相关 skill(MEMORY 沉淀 → 改名「策略快照」+ 加 last_verified_at 字段)
5. **触发词**(本模式适用):「回忆」「上次」「昨天」「改了/修了/修复了 X 吗」「X 状态如何」「X 现在什么情况」

**🔴 派工 checklist 的延伸(本模式应用)**:

派工 brief 里写「X 已修 / X 未变」类历史断言,**同样必须 `git show <sha>` 实测**,不能信：
- commit message 自报(模式 A 已覆盖)
- agent 自报(模式 A 已覆盖)
- **MEMORY 沉淀** ← 本模式新增
- **daily log / 笔记 / OpenClaw archive** ← 本模式新增
- **兄弟上下文口述**(兄弟也可能记错,实测最稳)

**记忆点**：**任何"对外断言 X 改没改 / X 修了什么"前,先 git 查证**。MEMORY 是策略快照不是事实快照,带 timestamp 才有意义。兄弟质问"不是都修复了吗?"的根因 = bot 把 MEMORY 当事实,没 git 复查。

## 🔴 模式 F:用户说"X 应该能/应该有" → 实查代码,不信期望(2026-08-20 实测)

**陷阱**:兄弟描述任务时用"**应该**可以/已经有/能切换"等期望式表述(如"demo 应该可以切换三个模型"),bot 容易**把期望当事实**,直接进入"启 server → 测试"路径,跳过了"验证功能是否真的存在"这一步。结果 = 启错 server / 跑错 demo / 浪费 30+ 分钟才发现"功能根本没做"。

**实例(2026-08-20 实测,3 次踩同一坑)**:

兄弟说"回忆昨天 PMXReduceFace 修复,打开 demo dev server 测试(应该要有 XiaHui 模型)"。bot 反应:
1. **第 1 次跑偏**:把"demo"等同于 `packages/frontend` 游戏 demo → 启 frontend dev-server → grep 角色选择 UI → 发现 XiaHui 全在注释里
2. **第 2 次跑偏**:兄弟纠正"我说的是 PMXReduceFace 的 demo" → 找到 `D:\Github\PMXReduceFace` → 启 PMXReduceFace webpack dev-server (8096) → 但端口 7093 的 frontend dev-server 没杀,撞端口
3. **第 3 次跑偏**:兄弟说"demo 中应该可以切换 Xiaye1/XiaoMei/XiaHui" → bot 还是没 grep `demo/main.ts` 实查,凭"应该"推下去 → 最终 grep 才看到 main.ts 是**单模型**(`MODEL_NAME = 'XiaoMeiOriginFix_02_elrein'`),没有切换 UI

**根因**:bot 收到期望式描述时,**默认走"快速路径"**(信任用户语境 → 启服务 → 准备测试),跳过了**前置验证**("X 真的存在吗")。

**🔴 实战规则**(任何带"应该""可以""已经有"的用户描述必走):

1. **5 秒实查原则**:兄弟说"X 应该 Y",bot 第一反应**不是**"启 X 服务测 Y",而是**"grep 代码确认 X 有 Y 这个能力"**——只读 1 个文件 10 秒,比启服务+排错 30 分钟快得多。
2. **关键词触发,自动跑验证**:
   - "demo 应该可以切换/选择 X" → grep `demo/main.*` / `demo/index.*` 找模型列表定义,确认是否有 MODEL_LIST / dropdown / 多模型 UI
   - "X 应该已经接好了" → grep 角色名 / 资源路径,确认 MMDData.ts / config 里是否真注册
   - "X 应该能跑/能进" → grep `dev-server` / `entry` / `main`,确认启动入口存在
3. **多 demo / 多入口时必先盘点**:GTS-Play 仓内同时存在:
   - `packages/frontend` 游戏 demo(端口 7093)
   - `D:\Github\PMXReduceFace` PMXReduceFace 工具 demo(端口 8096)
   - `D:\Github\GTS-Play\demos/` 旧 demos 目录(basic1 / new_basic2)
   - `packages/bone_converter` V12 demo(独立 Vite/React)
   兄弟说"demo"不指定 → bot 必须**先列所有可能 demo + 各自端口/入口**,问清是哪个再启,不能猜。
4. **期望不符的礼貌反问格式**(写到回复里):
   ```
   兄弟你说"X 应该 Y",但我 grep 实测:
   - [✅] 某文件 行 N 显示 Y 已实现
   - [❌] 某文件 显示当前状态是 Z(≠ Y)
   
   是 (a) 你记错了,功能没做 → 要派 OpenCode 实现
   还是 (b) 你想做的是别的入口 → 请指明
   ```
5. **派生检查单**(派工前 checklist 加一条):
   - [ ] 兄弟说"X 应该 Y"类期望 → bot 第一步 grep 代码实查,**不直接派工**
   - [ ] 实查发现 Y 不存在 → **反问兄弟**,不闷头派工去做"已经有 Y"
   - [ ] 实查发现 Y 存在但状态不符(部分实现/老旧/分支错)→ 报告兄弟 + 等拍板

**反面教材(2026-08-20 实测三连)**:

| 步骤 | bot 动作 | 实际状态 | 浪费 |
|------|---------|---------|------|
| 启 frontend dev-server | 端口冲突,失败 | 不是用户说的 demo | 30s |
| grep 角色 UI | 全在注释里,误导"未接入" | XiaHui 在 `mmd-character-extend` 启用着 | 1min |
| 重新理解"PMXReduceFace demo" | 找到正确仓库 | 还是没查 demo 是否支持多模型 | 2min |
| 启 PMXReduceFace dev-server | 兄弟纠正后 | 实际是单模型 demo | 5min |

**总计浪费 ~9 分钟 + 兄弟拍桌 2 次**。如果一开始(第 0 步)就 grep `D:\Github\PMXReduceFace\demo\main.ts` 找 `MODEL_NAME`/`LODS`,看到是单模型,**立即**反问"要不要加多模型切换功能"(派工 A 方案),就跳过所有 9 分钟的冤枉路。

**记忆点**:**用户说"应该"= bot 必须实查,不信任任**。`grep` 10 秒 ≤ 启服务 30 分钟,10 倍速节省。

## 🔴 `opencode run` argv 踩坑终极清单(2026-08-20 实测,3 条并列)

**陷阱**:bot 写 Node `spawn(oc, [...args])` 派工时,OpenCode CLI 的 argv 解析有 3 个隐藏坑,任何一个踩了都导致 dispatch 失败 + 留 stale session 污染 DB。

### 坑 1: `--command` 是 OpenCode 命令调用,不是普通 message

OpenCode CLI 把 `--command` 视为**注册命令关键字**(init / review / customize-opencode / gts-* 等),不是 message 文本。

```javascript
// ❌ 错误(2026-08-20 实测,OpenCode 报 "Command not found: \"<message>\". Available commands: ..."):
spawn(oc, ['run', '--command', '请按 brief 输出方案', '--file', brief, ...])
// → server 端 error: Unexpected server error,ref=err_xxx
// → DB 留 stale session(model=空),需要手动 delete
```

```javascript
// ✅ 正确: 普通 message 用 positional,yargs 把它当 `message..` 数组
spawn(oc, ['run', '请按 brief 输出方案', '--file', brief, ...])
```

**派工 checklist 加一条**:
- [ ] brief 派工 spawn argv 第一项 `message` **必须是 positional**,不能 `--command <message>`
- [ ] `--command` 只用于 OpenCode 注册命令(init/review/gts-xxx),由 OpenCode CLI 解析

### 坑 2: `--attach` 必须带 `http://` 前缀(已存在,放在这里再提醒)

```javascript
// ❌ 错误:
spawn(oc, ['run', '--attach', '4098', ...])
// → server 报 "Failed to construct 'Request': Invalid URL \"4098/session\""

// ✅ 正确:
spawn(oc, ['run', '--attach', 'http://localhost:4098', ...])
```

### 坑 3: `--no-replay` 在某些 session 触发 BUN 内部崩

2026-08-20 实测:`opencode run --no-replay --attach http://localhost:4098 --title "..."` + 中文 message → `SessionPrompt.command` 在 `B:/~BUN/root/chunk-46zs0me7.js:1094:15735` 抛 `UnknownError: UnknownError`,DB 留 stale session(model=空)。

**避开法**:本会话测试下来,**不用 `--no-replay`** 派工也能正常(普通 `message` 模式);不确定 `--no-replay` 是否必须时,先不加,等结果稳定再补。

### 派工 argv 终极模板(2026-08-20 跑通版)

```javascript
const args = [
  'run',                                          // 子命令
  '请按 brief 文件执行任务',                        // positional message (坑 1)
  '--file', briefPath,                            // 附件
  '--dir', projectDir,                            // 工作目录
  '--attach', 'http://localhost:4098',            // server URL (坑 2)
  '-m', 'volcark/deepseek-v4-pro-ga-260813',     // 模型 (8-20 兄弟拍板:Pro 优先火山,opencode-go 兜底)
  '--title', 'gts-dev-fix-<task>-<phase>',        // session 标题
  '--auto',                                       // auto-approve permissions
  // ❌ 不要 --no-replay (坑 3,可能 BUN 崩)
  // ❌ 不要 --command (BUN 内部 UnknownError)
];

// 兄弟 8-20 拍板 模型优先级(2026-08-20):
//   Pro:   volcark/deepseek-v4-pro-ga-260813 → mimo-v2.5-pro → opencode-go/deepseek-v4-pro (兜底)
//   Flash: opencode/<free组: flash-free→hy3-free→mimo→nemotron-3-ultra→nemotron-3.5-lightning→laguna-s-2.1> → volcark/...-flash → opencode-go/deepseek-v4-flash (兜底)
// opencode-go /* 是兜底,从不首选

// 派工前必读 free-model-state(2026-08-20 实测):
//   免费时段必须先 `node scripts/opencode-free-model-state.mjs get --dir D:\Github\GTS-Play`
//   用 `current` 值(跳过 blacklist),不要凭记忆/现场测试猜模型
//   Flash 重派同 free 模型挂掉时 → volcark 兜底,详见 opencode-llm-failure-recovery 「静默挂掉重派默认 volcark 兜底」节
```

**记忆点**:dispatch 失败 = 90% 是 argv 坑。先看 CLI 错误第一行(message / URL / command),对照上表 3 条命中其一 → 修 spawn argv,**不要猜测 server 逻辑**。

## 🔴 派工后「立刻」纪律(2026-08-20 XiaHui 4-session 实测)

> 派工命令发出 ≠ 派工完成。**派工 → 拿 sid → 落盘 session-meta → 起 wait 脚本**,这 4 步必须**在同一次 LLM 回合内**完成,中间不许插任何"我先分析下"等其他输出。

### 4 步必带检查表(每派一个 session 必走)

| 顺序 | 动作 | 严格度 |
|------|------|--------|
| 1 | `opencode run ...`(background=true)派工 | 🔴 |
| 2 | **立刻**(同一 turn)`opencode db` 查新 sessionId → 写 `.opencode-session-meta/<sid>.json`(providerID/modelID/briefPath/step/note) | 🔴 必须同 turn |
| 3 | **立刻**(同一 turn)`node scripts/wait-opencode-session.mjs <sid> 5400000 300000 --exit-on-stuck`(background=true, notify_on_complete=true) | 🔴 必须同 turn |
| 4 | turn 结束等 Hermes 通知 | ✅ |

### 反面教材(2026-08-20 XiaHui 4-session 实测)

我派了 4 个 OpenCode session(A/B/C/D)处理 XiaHui mmd_tool 修复,但**派完只起了 1 个 wait 脚本**就回兄弟报告——结果:
- A v1 静默挂掉(session 建好 30s 后 tokens.total=0、无 finish 事件)→ 5 分钟后才被 wait 脚本通知(因为只有 A 起了 wait)
- 兄弟拍桌质问「你怎么没检查?」(**opencode-schedule 5️⃣ 兄弟原话**,本次重新踩了一遍)
- B/C/D 三个 session 在我"回兄弟"那 1 分钟内**完全没被监控**——任何挂掉我都看不到

### 为什么"立刻"

- wait 脚本 30s 一个 poll 周期,session 静默挂掉的窗口最长 30s
- 晚启 wait 5 分钟 = 多烧 5 分钟盲等 + 兄弟拍桌
- 派工同 turn 落盘 meta + 起 wait = **零额外 token 成本**(都是同步工具调用),不浪费 LLM 决策轮

### session-meta JSON 必填字段

```json
{
  "sessionId": "ses_xxx",
  "title": "xiahui-fix-xxx",
  "task": "<一句话任务摘要>",
  "providerID": "opencode | volcark | xiaomi-token-plan",
  "modelID": "deepseek-v4-flash-free | deepseek-v4-pro-ga-260813 | ...",
  "variant": "default",
  "startedAt": "<UTC ISO>",
  "briefPath": ".opencode-brief-xxx.md",
  "issuePath": "笔记/项目文档/issue/<date>-<skill>-<hash>.md",
  "step": "B1 | B2 | C | ...",
  "note": "<可选: 重派原因 / 兄弟特别偏好 / 特别约束>"
}
```

**`note` 字段重派时必填**(2026-08-20 实测):例如 `note: "A v1 (opencode/deepseek-v4-flash-free) 静默挂掉,改 volcark flash 重派"` 留下完整因果链,后续 review / Phase C 验收时可以追溯。

### 多个 session 并行时

- 每个 session **独立 dispatch 命令 + 独立 meta + 独立 wait**(都 background=true)
- 同 turn 内多次 `terminal(background=true)` 调用 = Hermes 同步并行启动,零额外 token
- **不要**「派 A → 等 A 完成 → 派 B → ...」(串行浪费)也**不要**「派 A → 回兄弟报告 → 派 B → ...」(漏起 wait)
