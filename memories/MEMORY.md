# MEMORY.md — 索引

> 注入路径：$HERMES_HOME/memories/MEMORY.md（写入目标，带 .lock）
> 字符硬上限 8000（兄弟拍板 < 6400 = 80%）。主表 = 索引；详细内容 → MEMORY_ARCHIVE.md + skills/
> 兄弟 8-20 改拍板：**★ 也按一行结论 + ARCHIVE 指针走**（不再保留原文）
§
兄弟期望直接执行 + 改动纪律 8-20 → ARCHIVE「兄弟期望直接执行 + 改动纪律」；**兄弟对「skill 拆分」类决策拍板偏好(2026-08-20 opencode-schedule)**:① 列「激进 vs 保守」2 方案对比 + 选 **保守**(影响面小,引用方 33 个兼容);② 直接拍「现在」(不等手上活告一段落,即使改的 skill 正被 4098 引用)。已落 `gts-skill-refactor-split` 伞形 skill。
§
LLM fail 先分类（rate limit/瞬时/纯静默）→ ARCHIVE「OpenCode 静默失败+主动核对」第 ② 段（2026-08-18 改）
§
源码改动 100% dispatch OpenCode → ARCHIVE「源码改动 100% dispatch OpenCode」
§
数据/部署红线（CloudBase / 部署 / Clash）→ ARCHIVE「数据/部署红线」
§
bot 不做根因分析（最多 1 句方向）→ ARCHIVE「bot 不做根因分析」+ skill gts:bot-rca-discipline
§
对外断言前必须实测（不凭 commit/agent 自报）→ ARCHIVE「对外断言前必须实测」+ skill gts-dispatch-preflight
§
只读目录 + patch lie bug（doc/docs/语雀；报 success 不一定落盘）→ ARCHIVE「只读目录护栏 + patch lie bug」
§
token 成本敏感（Flash 级 + 合并 dispatch + 长任务拆 session）→ ARCHIVE「GTS-Play 工作流」第 1 段
§
恢复中断会话后必清旧 session（DB 三重验证）→ ARCHIVE「判 OpenCode session 活跃」
§
OpenCode 调度 + 模型优先级 8-20（火山→mimo→go / 免费→火山→go；go 仅兜底）→ ARCHIVE「opencode 模型落盘+免费组」+ 4 个 dispatch skill
§
session 活跃判定（信 DB time_updated，勿用 Web UI）→ ARCHIVE「判 OpenCode session 活跃」
§
Hermes 默认模型（minimax-cn/MiniMax-M3，api_mode=anthropic）→ ARCHIVE「新会话默认模型受桌面 app UI 覆盖」+ skill hermes-provider-config
§
GTS-Play 编码哲学 8 条 → AGENTS.md「AI 写代码铁律」+ ARCHIVE「编码哲学 8 条铁律」
§
项目级规则落地 gts-rule-landing 四件套 → ARCHIVE「项目级规则落地」+ skill gts-rule-landing
§
mmd 算法偏好（通用算法 > 材质名特判；覆盖率阈值 40%；pmx 总面 <5万 skip）→ ARCHIVE「GTS-Play mmd + 算法层偏好」
§
skill 改动重启 4098（沉默失败，必查 /api/skill）→ ARCHIVE「OpenCode skill 改动后必须重启 4098」
§
GGUF 模型 2.15GB（清 C 盘默认保留）→ ARCHIVE「Hermes 本地搜索栈 GGUF」
§
PowerShell 测大小坑（hashtable 报错；整树 timeout）→ ARCHIVE「PowerShell 测大小坑」
§
Bun log 文件锁（Node.js spawn+独立 env 唯一可靠）→ ARCHIVE「Bun log 文件锁」
§
读 Hermes 历史会话（先 state.db，dump 仅 429）→ ARCHIVE「读 Hermes 历史会话」+ skill hermes-session-read
§
skill-update-discipline 纪律 8/9 → ARCHIVE「skill-update-discipline 增补」+ skill gts-skill-update-discipline
§
webpack 循环 TDZ（必须改定义方 export function，re-export 层不可靠）→ ARCHIVE「webpack 循环依赖 TDZ 修复」
§
回忆/git 状态信源优先级（git > daily > 主表）→ ARCHIVE「回忆/git 状态类问题信源优先级」
§
hermes 读资料 vs OpenCode 加载链（hermes 直读 vs OpenCode skill allowlist）→ ARCHIVE「hermes 读资料 vs OpenCode 加载链」
§
opencode run argv 3 坑（positional / attach / --no-replay）→ ARCHIVE「opencode run argv 3 坑」+ skill gts-dispatch-preflight
§
wait-opencode-session.mjs 参数单位是 ms（maxWaitMs=5400000, stableMs=300000）→ ARCHIVE「wait-opencode-session.mjs patch 落地」
§
worktree merge 后必 remove（5 步流程）→ ARCHIVE「worktree merge 后必须 git worktree remove」+ skill gts-worktree-junction
§
兄弟说「demo」歧义（默认 PMXReduceFace demo，:8096）→ ARCHIVE「兄弟说 demo 歧义」
§
**关键新增锚点词**：opencode-dispatch、yargs拆参数、静默失败、wait-DONE核对、session活跃、免费组轮换、patch-lie-bug、编码哲学8条、GGUF模型、Bun-log锁、4098不热加载、skill改动重启、last-used-model覆盖、api_mode、覆盖率阈值40%、pmx-skip-5万、state.db、hermes-session-read、argv-3坑、wait-ms、worktree-remove、demo歧义、信源优先级
§
兄弟记忆压缩偏好 8-20 改：主表 = 一行结论 + ARCHIVE 指针；★ 也按此走。详细内容 → ARCHIVE + skill 指针
§
兄弟记忆纪律自检：每轮结束查主表字符数；> 5600/8000 = 70% → 主动走 gts-memory-compress；> 6400/8000 = 80% → 必须压
§
🔴 派工后通知精简(2026-08-20 兄弟拍板):**派工后不主动通知"在跑"**。轮询机制(2026-08-20 修正):**主动 `process(action=log, session_id=wait_id, limit=2)` 间隔 60s**(全自动模式 120s)看 wait stdout — 这是**纯工具调用不走 LLM,token = 0**(跟 OpenClaw 老 poll 每轮 2 亿+ 完全不同,OpenClaw poll 触发 bot 整轮对话+全量 cacheRead,Hermes `process(action=log)` 只读 process buffer);看到 `DONE: step-finish reason=stop` → 立刻整轮回复烧 ~1000 token → 停止轮询;看到还在跑 → 静默等下次轮询。**只在三种情况主动通知兄弟**:① 任务完成 / git commit 落地(读 log + 报告);② agent 红灯 / 卡死 / 60+ 分钟无进展;③ 兄弟主动问时。**绝对不**说"已 dispatch,sessionId=X,模型=Y,请稍等"之类开场白。
§
§
胖 skill 拆分(2026-08-20):opencode-schedule 110KB → 主入口 27KB + 4 reference(avg 12KB);name 保持兼容 33 个引用方;bot load 减 76%。playbook 落 `gts-skill-refactor-split`(三层结构 + 7 步流程 + 验证 3 件套 + split-record-template + verify-split.mjs)。
**关键决策原则(兄弟拍)**:① 保守(影响面小)优于激进;② 现在拆(不等手上活);③ name 绝不改;④ reference 按「职能」切不要按「章节」切;⑤ 主入口 > 30KB 仍偏胖要 2 级 reference。下次再有 >30KB skill → 直接套。
**opencode-schedule 4 reference 列表**(按场景 load 别全读):brief-template.md(写 brief 前必)/ dispatch-checklist.md(Step 0/0.5/0.6/0.7 + stale + Aborted + socket 崩溃)/ session-lifecycle.md(2.5 追加 + 2.6 续接 + permission 卡 + post-poll state)/ monitoring-wait.md(wait 主路径 + 4 退出码 + LLM 静默 + poll 降级)。**主 skill 只看**:模型时段铁规 + Hermes 适配 + 调度流程 + 必带参数 checklist + 5️⃣ 硬性规则。