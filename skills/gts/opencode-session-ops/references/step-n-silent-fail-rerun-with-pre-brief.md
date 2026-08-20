# Step N 静默失败 → 重派 Step N+1 brief 必含已落地事实

> 沉淀自 2026-08-20 PMXReduceFace XiaHui LOD_70 洞 fix `ses_fe306c129ffeurtU5hLv797Hbp` 实战案例。
> 主 SKILL.md 顶部「Step N session 静默失败」段已经简要总结,本文档是详细操作手册 + 复盘。

## 背景

PMXReduceFace `gts-dev-fix` 全自动模式跑 `xiahui-LOD70-holes-fix-step2`(Phase B Step 2 TDD 实现):

1. **Step 1 已完成**:OpenCode Pro 写出 `笔记/项目文档/changes/2026-08-20-xiahui-LOD70-holes/solution.md`(根因 + 方案)+ `specs/pmx-face-reduce-xiahui-holes.feature`(Delta Specs)+ `specs/expected-state/no-new-holes-xiahui.json`
2. **Step 2 dispatch**:OpenCode Flash `opencode/deepseek-v4-flash-free` session `ses_fe306c129ffeurtU5hLv797Hbp`
3. **Agent 跑 BDD baseline 时静默失败**:`step-finish reason=unknown` + `tokens=0` + `cost=0`(免费模型额度耗尽 / 瞬时断流)
4. **agent 已产出**:`.tmp/verify-guard-semantics.mjs`(探索脚本,验证 5 个 BDD 场景的守卫语义)
5. **wait exit** + bot 误以为完成

如果重 dispatch 时 brief 不预置 Step 1 产出 + 探索脚本路径,**新 agent 会**:
- 重新跑 Step 1 根因分析(浪费 Pro 30 分钟)
- 重新写 solution.md + specs/(覆盖现有,git diff 噪音)
- 重新跑守卫验证(浪费时间)

## 处置流程(完整 SOP)

### 1. 检测 LLM 静默失败

```powershell
# wait 退出后立刻查 part 表最后一条 step-finish reason
$env:OPENCODE_DB = "C:\Users\Administrator\.local\share\opencode\opencode.db"
opencode db "SELECT substr(CAST(data AS TEXT),1,300) FROM part WHERE session_id='<sid>' AND CAST(data AS TEXT) LIKE '%step-finish%' ORDER BY time_updated DESC LIMIT 1" --format json
```

判定:
- `reason=unknown + tokens=0 + cost=0` → **LLM 静默失败** → 走本节 SOP

**禁止**:LLM 静默失败 ≠ session 真死,先查 DB 不要立刻重 dispatch。

### 2. 查 agent 已落地文件

```powershell
cd D:\Github\<project>
git status --short
git diff --stat
```

如果 agent 还没 commit,先看 working tree 改动(可能写了 `.tmp/`、`笔记/`、`specs/` 等)。

**判断**:
- 已有 `solution.md` / `specs/` / `.tmp/` 探索脚本 → **已完成 Step 1/2 探索,Step N 主体未跑**
- `qem.mjs` 没改 → Step 2 实现没跑
- 0 改动 → 完全静默失败,基本没产物

### 3. Dead 当前模型 + 切下一个

```powershell
node scripts/opencode-free-model-state.mjs dead <model> --dir <project>
node scripts/opencode-free-model-state.mjs get --dir <project>
# 自动切到下一个未挂的免费模型
```

**不要凭记忆选下一个模型** —— 黑名单已 dead 后 current 自动前进,看 `get` 输出。

### 4. Delete 死 session

```powershell
opencode session delete <sid>
# 立刻查 DB 确认 [ ] 残留
opencode db "SELECT id FROM session WHERE id='<sid>'"
```

**FK 约束自动停 server agent** —— 不需要再 kill 进程。

### 5. 写 Step N+1 brief(关键: 预置已落地事实)

```markdown
请按 brief 执行:打开 .opencode-brief-X.md 阅读后按 TDD 流程(Step A→F)实现 Phase B Step 2 - XiaHui LOD_70 洞修复

注意:前一个 session 在 .tmp/verify-guard-semantics.mjs 留下了探索脚本,可以参考但不要重复工作;
笔记/项目文档/changes/2026-08-20-xiahui-LOD70-holes/ 下有 Phase B Step 1 产出可直接用。
```

**必填三段**:

| 段 | 内容 |
|---|---|
| 死 session ID + 死原因 | 让新 agent 知道历史,不重复踩 |
| 已落地文件路径 | solution.md / specs/.feature / expected-state/.json + .tmp/ 探索脚本 |
| 任务域(workdir) | 避免新 agent 跑错目录 |

**不要写的**:
- ❌ "请重新分析根因"(Step 1 已完成)
- ❌ "请重新写 solution.md"(覆盖会 git diff 噪音)
- ❌ 提"根因是 X"(让 agent 失去独立分析能力,违反 brief 反作弊 §1️⃣8️⃣)

### 6. Dispatch 新 session

```powershell
node scripts/wait-opencode-session.mjs <new_sid> 7200000 600000 --exit-on-stuck --title <name>
# 7200000ms (2h) / 600000ms (10min) — 正确毫秒值,不是 7200/600
```

**关键**:`stableMs` 必须 ≥ 300000ms(5 分钟),避免 BDD/单测运行时长 >2 分钟时误判 idle。

### 7. Meta 落盘 + 监控

```powershell
node scripts/opencode-session-meta.mjs save <new_sid> <provider>/<model> [--variant <v>] --title <name> --dir <project>
```

`opencode session-meta.mjs save` 写文件 `.opencode-session-meta/<sid>-<title>.json`,发「继续」唤醒时必读这个拿原模型。

## 实战反例(必须避免)

### 反例 A:brief 没指明已落地文件

```
请重新开始 XiaHui LOD_70 洞修复任务。
```

新 agent:
- 不知道 `笔记/项目文档/changes/2026-08-20-xiahui-LOD70-holes/` 已存在
- 重新读 qem.mjs 跑根因分析(浪费 30 分钟)
- 重新写 solution.md,覆盖现有文件
- 重新跑守卫验证(浪费 15 分钟)
- 最后对比 git diff 发现"我做的事跟 Step 1 一样" — 浪费 60 分钟

### 反例 B:brief 写了根因结论

```
根因: qem.mjs:877 collapseCreatesHole 漏判 preU===1 && preV===1 && post<2
请改这行。
```

新 agent:
- 直接改 + 跑测试 + commit
- 不再独立思考是否有别的边界场景(比如材料过渡区洞链)
- bot 失去独立根因验证机会

**根因是 Step 1 的产出,不该在 Step 2 brief 重写**(除非 Step 2 验证时发现新问题)。

### 反例 C:不 dead 当前模型,继续派同模型

flash-free 额度耗尽时,不 dead 就 dispatch → 新 session 还是卡死,白白浪费一轮。
**必须先 dead → get 拿 current → 派新模型**。

## 关联章节

- 主 SKILL.md 顶部「Step N session 静默失败」段(简要总结)
- 主 SKILL.md §1️⃣1️⃣ 「wait `unknown` 判定补丁」(`isLlmSilentFail(id) && idleSec > 60`)
- 主 SKILL.md §1️⃣9️⃣ 「wait timeout ≠ 任务失败」
- `references/2026-08-20-dispatch-discipline-and-fixes.md` §D wait stableMs
- opencode-llm-failure-recovery skill「Step N session 静默失败」段(同步沉淀)
- gts-bot-role-boundary skill「启 server 前必 grep」段(同理思路:动手前先验证)
- gts-mmd-tool-fixes skill「XiaHui LOD_70 洞根因」段(本次修复的具体根因+方案)

## 实战检查清单(派工前 30 秒过一遍)

- [ ] 死 session 已 delete?(`opencode session delete <old_sid>`)
- [ ] 当前模型已 dead + get 拿 current?(避免再派同一挂掉的)
- [ ] new_sid 拿到 + meta 落盘?(避免发「继续」fallback 到默认模型)
- [ ] brief 含「前 session 死掉原因 + 已落地文件路径」?
- [ ] brief 没写根因结论 / 修复方案?(让新 agent 独立分析)
- [ ] wait stableMs ≥ 300000?(避免再次误判)
- [ ] agent 工作目录是 `<projectDir>`?(避免跑错仓)