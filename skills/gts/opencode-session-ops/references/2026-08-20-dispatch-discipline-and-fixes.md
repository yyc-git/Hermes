# 2026-08-20 实战增量沉淀(兄弟拍板 5 条规约)

> 本文件由 2026-08-20 多轮对话沉淀(兄弟拍板 5 条规约),append 到 opencode-session-ops umbrella 下。**保留本文件,不要直接 patch 主 SKILL.md**(主 SKILL.md 太长 + patch 工具受 read-before-write 限制,本文件是更稳定的扩展方式)。

---

## §A 改动纪律精简(2026-08-20 兄弟拍板)

**只有 `还原文件` / `git checkout` / `git reset --hard` / `git stash pop` / `rm -rf` 这类真不可逆操作才需要兄弟拍板确认**;其他(改源码 / 复制文件 / 创建目录 / 改 build 配置 / 调阈值 / 加功能 / 写 brief / 合并 wt / 重 dispatch)bot 直接干不需拍板。

兄弟原话(2026-08-20):
- 「不需要我拍板啊,你直接dispatch」
- 「修改纪律:只有还原文件、git checkout 的操作才需要我确认啊」

**反例(2026-08-20 实测)**:bot 写 brief 之前问"go?"被兄弟拍桌「你直接让会话继续啊」—— 历史 8-18「(1) 列计划+等拍 (2) 写配置后逐文件核对 (3) commit 前再过目」过度约束已废,本节落地精简版。

**执行边界**:这条只对**不可逆的破坏性操作**生效。**新建文件 / 新增功能 / 改阈值 / 调算法参数 / 写 brief / 派 dispatch** —— 全部直接干,等兄弟拍板 = 浪费时间。

---

## §B 派工后通知精简(2026-08-20 兄弟拍板,终极简化)

**派工后绝对不主动通知"在跑"**(不是「少通知」而是「零通知」)。只在三种情况通知:

1. 任务完成 / git commit 落地(读 log + 报告)
2. agent 红灯 / 卡死 / 60+ 分钟无进展
3. 兄弟主动问时

**绝对不**说"已 dispatch,sessionId=X,模型=Y,请稍等"之类开场白。

兄弟原话(2026-08-20):「不需要告诉我」。

---

## §C 轮询频率与 token 真相(2026-08-20 实测拍板,核心反直觉)

`process(action=log, session_id=<wait_id>, limit=2)` 是**纯工具调用 token=0**(跟 OpenClaw 老 poll 每轮触发 bot 整轮对话 + 全量 cacheRead 烧 2 亿+ 完全两回事);间隔 **60s**(全自动模式 **120s**)足够。

**🔴 禁止混淆** —— 这是本节最关键的反直觉点:

| 工具 | token 成本 |
|---|---|
| `process(action=log, ...)` | **0** (纯工具调用) |
| `terminal(command="git log ...")` | **0** (纯工具调用) |
| `read_file` 读小文件 | ~50-200/次 |
| bot 整轮回复(说一段话) | **~1000/次**(取决于上下文长度) |
| OpenClaw 老 poll 30s/轮 × 240 轮 = 2h | **2 亿+ token** |

**bot「主动轮询每 5 分钟每次发个还在跑」≈ 1000×N 次烧的就是整轮回复的 1000 token,不是轮询工具调用**(兄弟拍桌「每次才 1000token 吗?这很少可忽略不计」)。

**正确路径**:
- Hermes `notify_on_complete` 自动通知到达 → 一次性 `process(action=log, offset=-2)` + `git log -3` + 整轮回复(~1000 tokens/次) → 停止轮询
- 通知丢失/不可靠时 `process(action=log, session_id=<wait_id>, limit=2)` 看 wait stdout(token=0 工具调用,不等同 OpenClaw 老 poll),间隔 60s

**🔴🔴 关键警示**:OpenClaw 旧经历不可直接套用到 Hermes——两者 LLM 调用机制不同。混淆是错的(我之前把 ~1000 token 算到轮询头上,实际是整轮回复烧的)。

---

## §D wait `stableMs` 必须 ≥ 5 分钟(2026-08-20 实锤,gts-auto 默认 120000 太短)

> **BDD / 单测运行时长常 > 2-3 分钟,wait `stableMs=120000`(2 分钟,gts-auto 自动模式默认值)会误判 idle 触达退出,但 agent 实际 `step-finish reason=tool-calls` 还在跑。**

### 教训(2026-08-20 xiahui-LOD70-holes-fix-step2 实测)

dispatch 后启 wait:
```powershell
node scripts/wait-opencode-session.mjs <sid> 3600000 120000 --exit-on-stuck --title <name>
# stableMs=120000 (2 分钟) — gts-auto 默认值
```

wait 跑 2-3 分钟后退出,触发 `notify_on_complete`。但 agent 实际还在跑 BDD 测试:
- `step-finish reason=tool-calls`(未完成,该步因工具调用结束,agent 还会继续下一轮 loop)
- DB `time_updated` 在最近 30 秒内更新
- agent 文件改动未落地

**结果**:wait 误判 idle 触达 → 通知到达 → 误以为完成 → 触发下一阶段 → 双 agent 撞车风险。

### 正确 `stableMs`(必填)

| 任务类型 | stableMs | 备注 |
|---|---|---|
| 简单任务(单文件改 / README / 配置) | 300000 (5 分钟) | 足够 |
| BDD/单测运行(PMXReduceFace 35+ 场景实测 2-3 分钟) | **300000-600000 (5-10 分钟)** | **必填** |
| 长任务(Pro 根因分析 / 多文件改动) | 600000-1800000 (10-30 分钟) | Pro 思考期长 |
| 全自动模式标准值 | **600000 (10 分钟)** | gts-auto 默认值 |

### wait 退出后的判定(必跑,不依赖 wait stdout 文本)

```powershell
$env:OPENCODE_DB = "C:\Users\Administrator\.local\share\opencode\opencode.db"

# 1. 查 part 表最后一条事件的 step-finish reason
opencode db "SELECT substr(CAST(data AS TEXT),1,300) FROM part WHERE session_id='<sid>' AND CAST(data AS TEXT) LIKE '%step-finish%' ORDER BY time_updated DESC LIMIT 1" --format json

# - 含 'reason\":\"stop\"' / 'reason\":\"completed\"' → ✅ 真完成 → 走产物验收
# - 含 'reason\":\"tool-calls\"' / 'reason\":\"running\"' → 🔴 agent 还在跑 → 发「继续」(读 meta 拿原模型)
# - 含 'reason\":\"unknown\"' + tokens=0 → LLM 静默失败 → 发「继续」

# 2. 查 session time_updated
opencode db "SELECT id, (strftime('%s','now')*1000 - time_updated)/1000 AS idle_sec FROM session WHERE id='<sid>'"

# idle_sec < 60 → wait 误判,agent 活着
# idle_sec > 600 → 可能真停,再查 part 表确认
```

**关键修正**:gts-auto SKILL.md §3.1 默认 `stableMs=120000` 必须改为 `300000` 或 `600000`。

### 恢复措施(已用错 stableMs 后的救场)

```powershell
# 不重 dispatch,不发「继续」误唤醒 → 重启 wait 用正确毫秒值
node scripts/wait-opencode-session.mjs <sid> 7200000 600000 --exit-on-stuck --title <name>
# 7200000ms (2h) / 600000ms (10min) — 正确值
```

---

## §E gts-dev-fix 全自动模式时序(2026-08-20 兄弟拍板触发 gts-auto)

> 兄弟说「fix:xxx」+「全自动」时,本节替代 gts-dev-fix 默认的「Step1 方案 → 等兄弟确认 → Step2 实现」节奏,全自动跳过兄弟确认,直接 Phase B Step1 → Step2 → C → R+S → 通知 → M → R+S → 通知。

### 全自动模式覆盖的 gts-dev-fix 流程变更

| 标准模式步骤 | 全自动模式行为 | gts-auto §X 引用 |
|---|---|---|
| Phase 0 设计验收(E2E) | **跳过**(除非 UI/行为 bug)| gts-auto §2 「E2E 测试选场景 → 自动选第一个」 |
| Phase B Step1 出方案 | **直接派**(不写方案文档前等兄弟确认)| gts-auto §2 「Delta Specs 确认 → 自动覆盖」 |
| Phase B Step1 → Step2 方案确认 | **跳过**(全自动直接采纳 Step1 Pro 出的方案 A)| gts-auto §2 「代码审核通过 → 自动合并」 |
| Phase B Step2 实现 | 派 Flash + wait | gts-dev-fix 标准 |
| Phase C 验收 | 派 Flash + wait | gts-dev-fix 标准 |
| Phase M 手动测试 | **移到最后执行**(C 完成后 R+S+通知,然后 M,再 R+S+通知)| gts-auto §2 「手动测试 M 阶段 → M 移到最后执行」 |
| Phase R + S 保存 | 自动 commit + 通知 | gts-dev-fix + gts-auto §6.5 |

### 实战时间线(2026-08-20 xiahui-LOD70-holes-fix 实测)

```
10:00  兄弟说 "fix: PMXReduceFace XiaHui LOD_70 减面后产生新洞,走 fix skill" + 全自动
10:01  bot 派 Step1: Pro 根因分析 + 方案(自动采纳方案 A,不等兄弟确认)
10:15  Step1 完成: solution.md + specs/ + expected-state/ 全部写出
10:18  bot 派 Step2: Flash TDD 实现 + BDD 测试(Step A→F)
10:19  Step2 中途 wait stableMs=120000 误判 idle 触达退出(→ §D 教训)
10:20  bot 查 part 表 reason=tool-calls → 确认 agent 活着 → 发「继续」唤醒
10:23  Step2 续跑完成: 1 行代码修复 + 2 个常量放宽 + 5 个 BDD 场景
10:30  Step2 commit 完成: <hash> (未 push)
10:35  Phase C 验收: (在跑)
       ↓
       R+S+通知(自动)
       ↓
       M 阶段(手动测试)→ 启 dev server → 兄弟浏览器测
       ↓
       R+S+通知(最终)
```

### 跟 gts-auto §3.1 自动修复的衔接

gts-dev-fix 全自动模式触发 gts-auto §3.1「自动修复规则」:
- 编译/测试失败 → 自动重试(第1-2次 Flash,第3次 Pro,第4次 Pro+max)
- 4 次失败 → Pro 根因分析 + 通知兄弟(gts-auto §4 🔴)
- Phase C 验收失败 → 同上,自动修复或通知

---

## §F demo 歧义(2026-08-20 兄弟多次纠正实测)

> **兄弟说「demo」默认指 PMXReduceFace demo,不是 GTS-Play frontend demo。**

兄弟说「demo 怎么没反应」/「demo 能切换 X 模型」**默认指 PMXReduceFace demo**:
- 位置:`D:\Github\PMXReduceFace`(独立 git 仓,不是 GTS-Play 子目录)
- 启动:`yarn webpack:dev-server` → http://localhost:8096(端口跟 GTS-Play frontend 7093 不冲突)
- 内容:LOD 减面对比页(LOD 0/100/55/50%)
- 默认模型:`XiaoMeiOriginFix_02_elrein.pmx`(2026-08-20 commit `730e9a1` 才加多模型切换支持 Xiaye1/XiaHui)
- 默认 UI 硬编码 `MODEL_NAME='XiaoMeiOriginFix_02_elrein'`

**`frontend demo` 在兄弟语境下可能指 GTS-Play 多人联机版本**(`packages/frontend`,端口 7093),要二次确认。

**反例(2026-08-20 兄弟多次纠正)**:
1. 第一次说"demo 没反应" → bot 在 frontend demo (7093) 排查 → 兄弟说"我说的 PMXReduceFace demo"
2. 兄弟说"demo 应该能切换 Xiaye1/XiaoMei/XiaHui" → bot 在 mmd-character-extend grep → 兄弟说"demo 不是 GTS-Play,是 PMXReduceFace demo"
3. 兄弟说"LOD_70 出现洞" → bot 误以为是 GTS-Play 角色 → 实际指 PMXReduceFace 减面工具的产物

**判定方法(兄弟说"demo"时第一步)**:

| 信号 | 判定 | 资源路径 |
|---|---|---|
| 上下文提到 LOD / 减面 / 三模型切换 | **PMXReduceFace demo** | `D:\Github\PMXReduceFace\demo\assets\` |
| 上下文提到角色 / 房间 / 多人 | GTS-Play frontend demo | `packages/frontend\src\` |
| 上下文提到 XiaHui/夏卉 LOD_70 洞 | PMXReduceFace 减面工具 | `packages/mmd_tool\src\tool\pmx-face-reduce\` |
| 上下文提到游戏内选角色 | GTS-Play mmd-character-extend | `mods\mmd-character-extend\src\json\MMDData.ts` |

**关联**:MEMORY 主表「demo 歧义」段已记;opencode-schedule 主 skill 「调度流程」段可加一句 "兄弟说 demo 默认 PMXReduceFace,涉及 LOD/减面时优先派 PMXReduceFace 仓"

---

## §G 兄弟期望直接执行(8-20 终极精简)+ dispatch 派工开场白禁止

> **bot 主线风格终极精简(2026-08-20 兄弟连拍板三次沉淀)**

兄弟期望 bot 主线:
- **派工后绝对不主动通知"在跑"**(不是「少通知」而是「零通知」)。Hermes 通知机制靠谱,bot 等通知到达再一次性处理
- **不在 brief 写完前问 "go?"**(8-18 过度约束已废,8-20 拍板只对真不可逆操作要确认)
- **不在每步执行后说开场白**(直接给结果,不要"好的,我帮你...正在..."之类客套)
- **实测后立刻报结论**(不绕弯,不解释 bot 的思考过程)

兄弟原话(2026-08-20):
- 「不需要我拍板啊,你直接dispatch」
- 「不需要告诉我」
- 「每次才 1000token 吗?这很少可忽略不计」
- 「间隔太久了!消耗token大吗?」

**反面教材(本会话踩了 3 次)**:
1. brief 写完后问 "go?" → 兄弟拍板「你直接让会话继续啊」
2. 派工后说 "已 dispatch,sessionId=X,模型=Y" → 兄弟拍板「不需要告诉我」
3. 写完派工后立刻问 "要不要 push" → 兄弟拍板「不需要我拍板啊」

**正确开场白(派工完成立即响应)**:

```text
[派了]

<1 行简述任务 + sessionId + 模型>
```

派工**完成一次性响应** = 「派了 / sessionId / 模型 / workdir / 跑了 wait」。不再问"要不要 push" / "要不要发通知" / "OK 吗"——全部直接干。

**关联**:opencode-schedule SKILL.md 顶部「dispatch / session 铁规」+ gts-bot-role-boundary SKILL.md「反复问 go?」段

---

## 沉淀触发会话详情

- **会话日期**:2026-08-20
- **触发任务**:PMXReduceFace demo 加模型切换 + XiaHui LOD_70 减面洞修复
- **兄弟拍板次数**:5+ 次(每次兄弟质问「你又…」都触发一条规约沉淀)
- **沉淀内容**:7 节(§A-§G)+ 本文件 metadata
- **后续 patch 入口**:直接 patch 本文件,不要去改主 SKILL.md(主 SKILL.md 50KB+ 易触发 read-before-write 限制)