兄弟期望 bot **直接执行而非反复问确认**(2026-08-18 多次:「你直接让会话继续啊」「你去修复下啊」;2026-08-20 再次拍板「不需要我拍板啊,你直接dispatch,只有还原文件、git checkout的操作才需要我确认」)。遇能力外的事(启动 GUI server/配 API key/查余额)用一句话说明限制+给方案,别推卸或反问。**改动纪律(8-20 定稿)**:源码改动/复制文件/创建目录/改 build 配置/调阈值/加功能/写 brief → agent 直接干不需拍板;真不可逆操作(`还原文件`/`git checkout`/`git reset --hard`/`git stash pop`/`rm -rf`)= 列计划+等拍。
§
🔴 LLM fail 先分类再动手(2026-08-18改):rate limit/429/quota=真限流等窗口或换模型;401/timeout/5xx=瞬时→同session发「继续」;纯静默unknown+模型实测可用=删会话直接重开(flash-free额度用完会明确报rate limit,不会静默unknown),换模型是最后手段;其余时段火山 flash
§
🔴 源码改动(.ts/.tsx/.js/.mjs/.cjs/.feature/.steps.ts/.scss)100% 必须 dispatch OpenCode(bot模型<OpenCode,bot亲手改=质量退化)。bot只做调度+监控+复验+git+notify。禁止bot跑jest/tsc验证自己改的代码
§
🔴 数据/部署红线:默认不操作CloudBase文档型数据库集合(增删改查),任何操作必须先问兄弟;线上/单机部署必须兄弟确认;部署前先退出Clash
§
🔴 bot不做根因分析(2026-08-19):最多1句方向,读≥3文件/写完整根因/出方案对比=违规。伞形skill gts:bot-rca-discipline
§
🔴 对外断言前必须实测(2026-08-18+08-19):commit/agent自报/历史笔记都=待实测假设。详见 gts-dispatch-preflight + gts-auto §7.4.1
§
🔴 兄弟专属只读目录:doc/docs/语雀知识库/ bot禁写入还原删除。🔴 patch工具lie bug(2026-08-18实锤):报success但curator不承认
§
兄弟对token成本敏感:简单任务Flash级、复杂才Pro;bot主线不做重活(读>3文件一律dispatch);同类小任务合并dispatch;fix循环>2轮拆新session
§
🔴 恢复中断会话后dispatch前必须先清旧session(2026-08-19实锤):恢复后第一步opencode db查同任务活跃session→gts-opencode-stop(禁止直接delete,走skill正规流程)→确认零残留(三重验证)才dispatch新session。不能凭记忆判session存活,必须查DB。兄弟原话「你为什么没有先删除旧的会话再dispatch啊？」
§
OpenCode调度:opencode-schedule skill(attach 4098)+wait脚本监控(ms单位,54100s=90min)。**模型优先级(2026-08-20 兄弟拍板)**:Pro=火山→mimo→go;Flash=免费组轮换→火山→go。**opencode-go仅兜底,从不首选**。详见4个dispatch skill(已patch):gts-opencode-dispatch-hardening 铁律9 + opencode-dispatch-pitfalls 教训3 + opencode-hermes-dispatch-pitfalls 兄弟硬偏好(2026-08-20版) + gts-dispatch-preflight argv终极模板。
§
OpenCode session活跃判定:100%信DB time_updated(>now-600000),勿用Web UI字段。4098不热加载provider/skill配置→改完必须重启。详见opencode-model-smoke-test skill
§
Hermes默认模型=minimax-cn/MiniMax-M3(多模态,api_mode=anthropic);切provider必显式api_mode。新会话模型受桌面UI last-used-model覆盖(非config default)。详见hermes-provider-config skill
§
GTS-Play编码哲学8条:不保留向后兼容/选最简单实现/分层构建/模块化/优先成熟库/复用依赖/禁权宜/少即是多→落AGENTS.md
§
项目级规则落地gts-rule-landing四件套:AGENTS.md+.opencode/skills/+笔记/决策记录/+MEMORY指针。改.opencode/skills/后必提醒兄弟重启OpenCode
§
GTS-Play mmd算法偏好(2026-08-19):通用算法>材质名特判(覆盖率阈值40%)。pmx总面<5万skip减面
§
skill改动重启:AGENTS.md/`.opencode/skills/`改动后4098不热加载→必须重启+查/api/skill验证(沉默失败,无报错)。详见opencode-model-smoke-test skill
§
Hermes本地搜索GGUF模型2.15GB(C:\Users\Administrator\.cache\qmd\models\):删除=断语义召回(FTS5还在)。qmd pull自动重下。清C盘默认保留
§
PowerShell测大小坑:Measure-Object hashtable报错改ForEach-Object累加;整树递归180s timeout只测已知大目录
§
Bun log文件锁(2026-08-19):opencode多进程并发写log→新CLI open失败。根治:XDG_DATA_HOME独立temp+OPENCODE_DB指回。唯一可靠:Node.js spawn+独立env
§
读Hermes历史会话:先查state.db(主存储)→dump只是429 fallback。skill hermes-session-read是系统内置
§
gts-skill-update-discipline:纪律8=不塞选项menu / 纪律9=sqlite3路径C:\sqlite\sqlite3.exe / 汇报前自检纪律8
§
**关键新增锚点词**:opencode-dispatch、yargs拆参数、静默失败、wait-DONE核对、session活跃、免费组轮换、patch-lie-bug、编码哲学8条、GGUF模型、Bun-log锁、4098不热加载、skill改动重启、last-used-model覆盖、api_mode、覆盖率阈值40%、pmx-skip-5万、state.db、hermes-session-read
§
兄弟记忆压缩偏好(2026-08-19):memory.md只留最高优先级规则原文+索引,踩坑/具体案例/详细说明放MEMORY_ARCHIVE.md。详细内容→ARCHIVE+skill指针,不堆主表。
§
wt1/wt2/wt3 + Yarn Cache + PMXReduceFace + Hermes Home 双仓提交 + request_dump 路径 → ARCHIVE「wt1/wt2/wt3 工作流」「Hermes Home 仓库」章节（2026-08-19）
§
🔴 webpack `export { x } from "y"` 仍生成 `let x = module.x` 立即赋值，**不能消除循环 TDZ**。修循环依赖必须在定义方改 `export function`（方案 B），不能在 re-export 层用 `export { } from`（方案 A 不可靠）。
§
hermes-session-read skill 升级（state.db 主力，dump 仅 429 fallback）→ ARCHIVE「读 Hermes 历史会话」章节（2026-08-19，已 patch）
§
React useEffect cleanup 时序坑（antd-mobile Modal.replace()）→ ARCHIVE「React useEffect cleanup 时序坑」（2026-08-19 prop fix）
§
webpack dev-server 路径陷阱（worktree junction 解析回主仓）→ ARCHIVE「webpack dev-server 路径陷阱」（2026-08-19 实锤）+ gts-worktree-junction skill
§
Brief 防卡死：PMX jest >300s 超时 → ARCHIVE「Brief 防卡死」（2026-08-19）
§
🔴 回忆/git 状态类问题信源优先级(2026-08-20 兄弟拍板):git log/git worktree list/ls = 唯一权威 > daily log / state.db > MEMORY 主表。主表是沉淀不是 git-tracked,容易和代码现状脱节(已踩:8-19 沉淀 Modal 修复清单,8-20 顺手答你时把已修的"待修"清单又吐出来;8-20 又踩"worktree 是否已 merge"凭记忆答错)。问"是否 merge/commit/部署/删除"类问题必须先实测,不准凭记忆。git ≠ 主表 → 以 git 为准,立刻 patch 主表。
§
antd-mobile Modal 白屏修复(commit **d6681051e** 2026-08-19) → ARCHIVE 章节（City/Upgrade/MissionComplete.tsx 已修；多人版 MultiplayerHall.tsx:806 gameOverVisible 仍 JSX 模式未改）
§
🔴 hermes 读资料 vs OpenCode 加载链(2026-08-20 实锤):兄弟问"回忆 X / v3 skill 在不在 / 昨天 commit" → **hermes 自身 read_file 0 配置直读**(~/.hermes/skills/gts-memory-search-v3/SKILL.md 即时生效)。**绝不要派 OpenCode agent 验证 v3 skill 是否在 OpenCode surge prompt** — 那是 OpenCode 加载链问题(`.opencode/opencode.json` 的 `agent.build.permission.skill` allowlist),跟 hermes 读资料能力无关。判错题 = 浪费时间 + 兄弟拍桌。
§
🔴 `opencode run` argv 3 坑(2026-08-20 实测,已落 gts-dispatch-preflight):① `--command` 是 OpenCode 注册命令,普通 message 必须 positional;② `--attach` 必须带 `http://localhost:4098`;③ `--no-replay` 在某些 session 触发 BUN `UnknownError` 崩在 SessionPrompt.command → 派工默认不加。完整模板见 gts-dispatch-preflight §「argv 终极清单」。任何 dispatch 失败 = argv 坑,先看 CLI 错误第一行。
§
🔴 wait-opencode-session.mjs 参数单位是 **ms** 不是 s(2026-08-20 实锤):`<sessionID> [maxWaitMs] [stableMs]`。我之前传 5400/1800 当秒,实际 5400ms = 5.4s,30s 后就 TIMEOUT。**Pro 思考期 → maxWaitMs=5400000(90min),stableMs=300000(5min idle)**。gts-auto 主表/skill 文字写"maxWaitSec"是错的,跟脚本不一致 → 脚本以源码为准。完整 dispatch 模板见 gts-dispatch-preflight / gts-opencode-dispatch-pitfalls。
§
🔴 **worktree merge 后必须 `git worktree remove`(2026-08-20 兄弟拍板)**:fix/feat/refactor skill 漏的硬步骤。merge 完 dev 不算完,必须依次:① merge + push ② `git worktree remove <path>` ③ `git worktree prune` ④ `git worktree list` 二次确认 ⑤ issue 记 merge commit hash。详见 gts-dev-fix M-0 + gts-dev-feat Phase B + gts-dev-refactor Phase M + gts-auto Phase S。
§
🔴 兄弟说"demo"歧义(2026-08-20 实锤):**默认指 PMXReduceFace demo**,不是 GTS-Play frontend demo。`yarn webpack:dev-server` 起在 **http://localhost:8096**(frontend 7093),默认模型 `XiaoMeiOriginFix_02_elrein.pmx`(非 XiaHui)。完整 CLI + 端口检查 + 资源位置 → ARCHIVE「兄弟说 demo 歧义」(2026-08-20 实锤)。