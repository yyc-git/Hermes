# MEMORY.md — 索引

> 注入路径：$HERMES_HOME/memories/MEMORY.md（写入目标，带 .lock）
> 字符硬上限 8000（兄弟拍板 < 6400 = 80%）。主表 = 索引；详细内容 → MEMORY_ARCHIVE.md + skills/
> 兄弟 8-20 改拍板：**★ 也按一行结论 + ARCHIVE 指针走**（不再保留原文）

§
兄弟期望直接执行 + 改动纪律 8-20 → ARCHIVE「兄弟期望直接执行 + 改动纪律」
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