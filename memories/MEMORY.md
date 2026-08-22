# MEMORY.md — 索引

> 注入路径：$HERMES_HOME/memories/MEMORY.md（写入目标，带 .lock）
> 字符硬上限 8000（兄弟拍板 < 6400 = 80%）。主表 = 索引；详细内容 → MEMORY_ARCHIVE.md + skills/
> 兄弟 8-20 改拍板：**★ 也按一行结论 + ARCHIVE 指针走**（不再保留原文）
> 🔴 GTS-Play 项目专属规则已迁移到项目根 `.hermes.md`（20K 上限，自动加载）
§
兄弟期望直接执行 + 改动纪律 8-20 → ARCHIVE「兄弟期望直接执行 + 改动纪律」；兄弟拍板偏好(保守+现在) → gts-skill-refactor-split 伞形 skill
§
LLM fail 先分类（rate limit/瞬时/纯静默）→ ARCHIVE「OpenCode 静默失败+主动核对」
§
源码改动 100% dispatch OpenCode → ARCHIVE「源码改动 100% dispatch OpenCode」
§
数据/部署红线（CloudBase / 部署 / Clash）→ ARCHIVE「数据/部署红线」
§
bot 不做根因分析（最多 1 句方向）→ ARCHIVE + skill gts:bot-rca-discipline
§
对外断言前必须实测（不凭 commit/agent 自报）→ ARCHIVE + skill gts-dispatch-preflight
§
只读目录 + patch lie bug（doc/docs/语雀；报 success 不一定落盘）→ ARCHIVE
§
token 成本敏感（Flash 级 + 合并 dispatch + 长任务拆 session）→ ARCHIVE
§
恢复中断会话后必清旧 session（DB 三重验证）→ ARCHIVE
§
OpenCode 模型优先级：火山→mimo→go / 免费→火山→go（go 仅兜底）→ ARCHIVE + dispatch skill。小米 pro = mimo-v2.5-pro（token plan，M-I-M-O 非 mino）。plan-review：第1轮 mimo-v2.5-pro→Kimi K3 / 第2轮 GLM-5.2 Max / 第3轮 火山pro→小米pro→go pro
§
session 活跃判定（信 DB time_updated，勿用 Web UI）→ ARCHIVE
§
Hermes 默认模型 minimax-cn/MiniMax-M3，api_mode=anthropic → ARCHIVE + skill hermes-provider-config
§
GGUF 模型 2.15GB（清 C 盘默认保留）→ ARCHIVE
§
PowerShell 测大小坑（hashtable 报错；整树 timeout）→ ARCHIVE
§
Bun log 文件锁（Node.js spawn+独立 env 唯一可靠）→ ARCHIVE
§
读 Hermes 历史会话（state.db + Node24 node:sqlite）→ ARCHIVE + skill hermes-session-read
§
skill-update-discipline 纪律 8/9 → ARCHIVE + skill gts-skill-update-discipline
§
webpack 循环 TDZ（必须改定义方 export function）→ ARCHIVE
§
回忆/git 状态信源优先级（git > daily > 主表）→ ARCHIVE
§
hermes 读资料 vs OpenCode 加载链 → ARCHIVE
§
opencode run argv 3 坑（positional / attach / --no-replay）→ ARCHIVE + skill gts-dispatch-preflight
§
worktree merge 后必 remove → ARCHIVE + skill gts-worktree-junction
§
🔴 **配置/provider 查询信源(08-20)**:「配了X/接入Y」→ state.db sessions 表是第一步(LIKE 标题秒命中)。已落 gts-memory-search-v3 §11
§
🔴 **OpenCode server 卡死恢复(08-20)**:①DB time_updated 唯一 truth ②重启 server + 对挂 session 发「继续」③不乱加 blacklist。进程名=opencode.exe
§
🔴 **通知纪律(08-20)**:派工后零通知。只在①完成/git commit ②红灯/卡死/60+min ③兄弟主动问时通知。触达决策必须 notify.ps1 弹窗
§
revive-all:`node scripts/opencode-free-model-state.mjs revive-all --dir D:\\Github\\GTS-Play`。幂等可重入。改 TTL ≠ 立即清空
§
🔴 wait stableMs ≥ 15min + R/S 必须 bot 做(08-20):wait 退出后必查 part step-finish reason,tool-calls/running/无stop = 发「继续」,不重dispatch。Phase R/S 必须 bot 做(R 反思需访问记忆主表)。详见 ARCHIVE
§
关键锚点词:opencode-dispatch、静默失败、session活跃、免费组轮换、编码哲学8条、4098不热加载、api_mode、覆盖率阈40%、pmx-skip-5万、state.db、argv-3坑、worktree-remove、flash-free-24h
§
兄弟记忆纪律自检：每轮结束查主表字符数；> 5600 = 70% → 主动压缩；> 6400 = 80% → 必须压
