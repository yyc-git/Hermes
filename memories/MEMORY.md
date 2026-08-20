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
OpenCode 调度 + 模型优先级 8-20（火山→mimo→go / 免费→火山→go；go 仅兜底）→ ARCHIVE「opencode 模型落盘+免费组」+ 4 个 dispatch skill。🔴 小米 pro = mimo-v2.5-pro（token plan，OpenCode ID `xiaomi-token-plan/mimo-v2.5-pro`，M-I-M-O 非 mino，兄弟口语叫 Mino）。gts-plan-review 链 8-20 定：第1轮 mimo-v2.5-pro → Kimi K3 兜底 / 第2轮 GLM-5.2 Max 不变 / 第3轮 火山pro→小米pro→go pro
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
worktree merge 后必 remove（5 步流程）→ ARCHIVE「worktree merge 后必须 git worktree remove」+ skill gts-worktree-junction
§
🔴 **worktree 不问直接建+删(2026-08-20 兄弟拍板)**:dispatch 前没有可用 worktree → 直接建新,不问兄弟。用完即删。merge 回 dev 才进 M 阶段。
§
关键锚点词:opencode-dispatch、静默失败、session活跃、免费组轮换、编码哲学8条、4098不热加载、api_mode、覆盖率阈40%、pmx-skip-5万、state.db、argv-3坑、worktree-remove
§
兄弟记忆纪律自检：每轮结束查主表字符数；> 5600/8000 = 70% → 主动走 gts-memory-compress；> 6400/8000 = 80% → 必须压
§
胖 skill 拆分(2026-08-20):opencode-schedule 110KB → 主入口 27KB + 4 reference。playbook 落 `gts-skill-refactor-split`。原则:保守>激进;现在拆;name 不改;按职能切。
§
🔴 **通知纪律(2026-08-20)**:派工后零通知。只在①完成/git commit ②红灯/卡死/60+min ③兄弟主动问时通知。**chat 等你 ≠ notify.ps1**:触达决策必须 notify.ps1 弹窗(兄弟拍桌实锤)。
§
revive-all(2026-08-20):`node scripts/opencode-free-model-state.mjs revive-all --dir D:\Github\GTS-Play`。幂等可重入。改 TTL ≠ 立即清空(两独立动作)。
§
🔴 wait stableMs 必须 ≥ 15 分钟 + R/S 必须 bot 做(2026-08-20 实锤):① PMXReduceFace step2 BDD 40+reduce+verify 全跑 12-15 分钟,gts-auto 默认 120000 实测**2 次**误判 idle(`tool-calls` 还在跑);正确 900000-1200000(15-20 分钟);wait 退出后必查 part `step-finish reason`,`tool-calls`/`running`/无 `stop` = 立刻发「继续」(读 meta),**不**重 dispatch。② **gts-dev-fix Phase R/S 必须 bot 做**(兄弟原话「R/S 应该由你来做,而不是 OpenCode」)——R 反思需访问记忆主表,只有 bot 能做;OpenCode 只写 .md + commit docs。**gts-auto §7.2 步进循环 R/S 步骤禁用 OpenCode dispatch**,改用 bot 主线:读 phase-c-verification → 整合记忆/skill 落地 → commit。详见 ARCHIVE「wait stableMs + R/S 教训」。
§
🔴🔴🔴 **dispatch 前模型选择三步走(2026-08-20 一天犯 2 次,兄弟拍桌)**:①算北京时间(9-12/14-18=免费窗口)②`node scripts/opencode-free-model-state.mjs get` 拿 current ③免费→Flash=current;非免费→volcark flash;Pro=火山pro→小米pro→go pro。**禁止凭记忆选模型,每次都必须走三步**。兄弟原话「火山模型都挂了啊！你怎么不吸取教训」「flash场景不是优先用免费组吗？」
§
**ad-hoc verify(8-20)**: write_file 后必 verify→清理 temp 脚本(Test-Path=False)。禁止漏清理/清理错脚本
§
**ok=默认A(8-20)**: 多选项兄弟回"ok"→默认选A。歧义时notify确认
§
🔴 **最近配置/provider 类查询的源优先级(2026-08-20 实锤)**:用户说「前几天才配了 X / 刚刚接入 Y / opencode 跑通了 Z」类关键词(token plan / provider / modelID / 接入 / MiMo / xiaomi / 火山)→ **state.db sessions 表是第一步**(LIKE 标题:「接入」「配」「Mimo」秒级命中),不是 MEMORY.md/ARCHIVE.md。配置接入类改动**几乎不会写主表**,只在会话标题和消息里。复盘根因:我先 grep 笔记/skill 文件,被兄弟拍桌纠正「搜索下这3天的记忆(包括会话记忆)啊」。已落 gts-memory-search-v3 §11 强约束。
§
🔴 **OpenCode server 卡死恢复(2026-08-20)**:①DB time_updated 是唯一 ground truth ②不要杀残留 session,优先重启 server + 对挂 session 发「继续」③不要给没问题的模型加 blacklist(全局停摆≠model 挂)。进程名=`opencode.exe`(非node.exe)。PowerShell $_ 转义坑→用脚本文件。bot 不擅自 commit。
§
不完整修复传播(8-20):brief 必须强制调用入口同步参数+持久化数据重新生成。mmd_tool 材质识别禁止硬编码关键词,应扫描 PMX 骨骼权重动态识别。
§
模型 fallback 铁规(2026-08-20):场景决定模型等级→等级内按优先级 fallback,不能跨等级降级。Pro=小米pro→go pro;Flash=火山flash→go flash。
§
PMX 骨骼权重扫描技术（替代硬编码关键词）→ skill mmd-pmx-bone-weight-scan。触发:需要根据骨骼关系判断材质类别时。探测脚本: packages/mmd_tool/scripts-explain/__explore_scan.mjs。
§
🔴 PMXReduceFace 质量铁律(2026-08-20 兄弟拍板):空洞(任何材质内部/边界)和多余三角面绝对不允许。宁可不减面都不能引入视觉缺陷。验证工具(newHoleEdges/findHoleChains)有盲区——只检测闭合环+边界边差异,材质内部单点空洞漏检。修复前必须先修验证工具。
§
🔴 gts-dev-fix INIT 铁律(2026-08-20):skill 触发后**第一条命令必须是 INIT**(skill-exec-manager.cjs init),禁止「先看看代码方向再补 INIT」。兄弟原话「issue都不开启吗？」。sid/wid 获取和 init 分两条命令用 `;` 连接,不能用 `&&`(PowerShell 7 报错)。
§
**fix skill 实战纪律（2026-08-20 实锤，5 条）**：① INIT 是第一步，skill 触发后第一时间 `skill-exec-manager.cjs init`，不跳过不问；② dispatch 前**必须** load opencode-schedule skill 并按其流程走，不自行写 dispatch 命令；③ 改 frontend/ 默认走 worktree，直接建不问兄弟；④ dispatch 前先验证模型可用性（`opencode run "echo ok" -m <model>`），火山挂了用小米 pro；⑤ junction 必须在 worktree 完全初始化后（`Test-Path` 确认关键文件存在）再创建，否则文件全丢。
§
flash-free echo-only 实锤(8-20):连续3轮只复读 brief 不动手。检测:`SELECT type,count(*) FROM part WHERE session_id='<sid>' GROUP BY type` 全 text=复读。server 重启后/模型切换后/inline 传参易触发。重试或换模型。已落 skill opencode-echo-only-detection。
§
🔴 **单机版 fix 不走 E2E + 不做根因分析(2026-08-20 兄弟拍板)**：直接跳 Phase 0 进 Phase B。isHideUI=true 是全局开关（所有UI不显示）,部分UI消失→问题在个别组件 Redux 状态。
§
🔴 **OpenCode server 启动 + 模型 API Key 失效(2026-08-20)**：① `opencode serve --port 4098`（不是 `opencode server`，会被解析成目录）② 小米 pro API Key 失效→ same blacklist 流程 dead+get+重 dispatch
§
PMXReduceFace 验证工具盲区(2026-08-20 实锤):verify.mjs/newHoleEdges/findHoleChains 只检查拓扑(边/面数量关系)不检查几何(补面位置是否正确)。BDD 测试也只验证算法行为不验证视觉输出。结果: agent 报告 40/40 BDD 全绿 + noNewHoles=true,但用户肉眼仍见空洞。教训: agent 自报「通过」不可信,必须实测验证(§7.4.1 已有)。修复必须在算法层(collapseCreatesHole)而非检测层。
§
🔴 **worktree 强制建+删(2026-08-20)**:同上方 worktree 不问直接建条目。
§
🔴 **fix 任务默认用 Pro 不用 Flash(2026-08-20 兄弟纠正)**:兄弟原话「你不是要用pro吗？pro不用免费模型。除非是flash场景」。fix 任务(跨包/改类型签名)→ Pro;Flash 仅用于纯配置/文档/极简单文件改动。dispatch 前必须走 opencode-schedule 模型选择流程。
§
§ **gts-dev-fix Phase 0 待更新(2026-08-20)**：skill 是用户创建的无法自动 patch。需手动改 Phase 0 段落：单机(frontend/)跳过 E2E。当前 skill 写的「不默认跳过」已过期。
§ **fix 任务模型选择(2026-08-20)**:fix 默认用 Pro（火山pro→小米pro→go pro），不用 Flash。兄弟原话「你不是要用pro吗？pro不用免费模型」。Flash 仅纯配置/文档/极简单文件改动。
§
🔴 dispatch 后双监控(2026-08-20):① wait 脚本(主,完成/超时通知)② session-watchdog.mjs(异常检测,60s轮询,0 LLM token,关键词匹配额度耗尽/rate limit/静默失败,命中→退出码1→LLM分析+dead+重派)。禁止 dispatch 后不管或反复 poll。已落 opencode-schedule 两个 reference。
§
🔴 **fix skill INIT 必须是第一条命令(2026-08-20 实锤)**:兄弟原话「issue都不开启吗？怎么没走fix skill」——skill-exec-manager.cjs init 是状态追踪入口,跳过=无追踪=流程失控。禁止「先看看代码方向再补 INIT」。已在 gts-dev-fix skill INIT 段落标注,但因 skill 受保护无法 patch,bot 自身必须记住。
§
🔴 **worktree 每次建新+用完即删,不该问兄弟(2026-08-20 兄弟纠正)**:兄弟原话「不是每次都建新的吗,用完即删除吗？要记住啊」——opencode-schedule 已有 worktree 规则,但 bot 仍在问「是否建新 worktree」,属于没执行已有规则。
§
session-watchdog.mjs: 轻量异常检测脚本(60s轮询DB part表,0 LLM token)。退出码:0=完成,1=异常需LLM,2=超用。位于 scripts/session-watchdog.mjs + opencode-hermes-dispatch-pitfalls/references/。与 wait-opencode-session.mjs 配合双监控。