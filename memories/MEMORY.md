User (兄弟) prefers direct, concise answers; gets impatient when the agent spends many tool calls exploring files before answering a question the user already has context on (e.g. 'compare X and Y'). Answer from knowledge first, explore only to verify specific facts, then keep it short. 兄弟期望 bot **直接执行而非反复问确认**(2026-08-18 多次:「你直接让会话继续啊」「你去修复下啊」);遇能力外的事(启动 GUI server/配 API key/查余额)用一句话说明限制+给方案,别推卸或反问。
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
wt1 是 GTS-Play 的 git worktree（分支 wt1），node_modules 通过 junction 共享 `D:\Github\GTS-Play\node_modules`。两个分支用同一份依赖——修复一边等于修复两边。其他 worktree: wt2, wt3-prop-fix。§
C 盘空间紧张(3.91GB/100GB)，Yarn Cache (`C:\Users\Administrator\AppData\Local\Yarn\Cache\v6`) 有 6826 个缓存目录是吃空间主因。bootstrap 完成后应跑 `yarn cache clean` 释放空间。§
Yarn Cache 损坏会导致 `Extracting tar content of undefined failed` 错误（如 @ant-design/icons）。清法：手动删 `$env:LOCALAPPDATA\Yarn\Cache\v6\*ant-design*` 目录，但 Windows 文件锁可能导致部分删不掉。§
GTS-Play `yarn bootstrap` 的 postinstall 有个 `gentype.exe not found` 错误（非关键），会导致 .bin 链接不建。绕过：`yarn install --ignore-scripts --mutex network` 跳过 postinstall 只做 linking。§
Hermes 会话记录在 `E:\Hermes Agent CN Desktop\data\hermes-home\sessions\request_dump_*.json`，文件名含 session_id 和 dump 时间戳。同一 session 多个 dump 取最新的。已创建 skill `hermes-session-read`。
§
§
wt1 worktree 的 node_modules 是 junction → GTS-Play 根的 node_modules（共享），修一次 = 所有 worktree 恢复。yarn cache 在 C:\Users\Administrator\AppData\Local\Yarn\Cache，大型 monorepo 可达数 GB，C 盘 <5GB 时易 corruption。Hermes 会话记录在 hermes-home/sessions/request_dump_*.json（429 限流快照，非完整对话），OpenCode 会话在 opencode.db session/part 表，两者不要混读。
§
Yarn Cache 损坏修复(2026-08-19):包装出来是空壳(package.json+LICENSE在,lib/bin缺)=缓存损坏。`--force`无效因仍从坏缓解压。修复:cmd /c "rd /s /q"直接删Yarn Cache目录( yarn cache clean太慢)> yarn install --force --ignore-scripts --mutex network。C盘Yarn Cache 6800+目录可占数GB。GTS-Play worktree(wt1/wt2/wt3)通过junction共享GTS-Play的node_modules,只需在根目录装一次。
§
Hermes Home 仓库(git@github.com:yyc-git/Hermes.git)已初始化并push(2026-08-19)。gts-submit-save + gts-save-memory 已改为双仓库提交：GTS-Play + Hermes Home。GitHub Push Protection 会扫描 skill 文件中的密钥(AKID/ark-xxx)，首次 commit 前必须脱敏。详见 hermes-home-state-management skill。
§
🔴 webpack `export { x } from "y"` 仍生成 `let x = module.x` 立即赋值，**不能消除循环 TDZ**。修循环依赖必须在定义方改 `export function`（方案 B），不能在 re-export 层用 `export { } from`（方案 A 不可靠）。
§
hermes-session-read skill 已升级:主力数据源=state.db(sessions+messages表,C:\sqlite\sqlite3.exe查询),dump文件仅429限流时才有。给会话ID查会话→先sqlite3 state.db,找不到才查dump。skill已patch。(2026-08-19)
§
React useEffect cleanup 时序坑(2026-08-19 prop fix):用 ref 标记「正在切换内容」防 onClose 误触发→失效,因为 cleanup 先执行 close()时 ref 还是 false。正解:antd-mobile Modal.show()返回handler支持replace()更新内容不触发onClose,两个effect分离:一个管开关([isShowProp]),一个管内容([currentPropItem])用handler.replace()。
§
🔴 webpack dev-server 从 worktree 启动但读主仓源码(2026-08-19 实锤):wt3 `node_modules` 是 junction→GTS-Play,`resolve.symlinks:true`+`resolve.modules:['node_modules']` 导致源文件解析回主仓。改 worktree 源码不 merge 回 dev → dev-server 看不到改动。测试必须先 merge。
§
Yarn Cache 损坏修复(2026-08-19):C盘<3GB时yarn下载的tarball解压不完整→包是空壳(目录在但无代码)→后续install用旧integrity跳过→必须`--force`+清缓存(`rd /s /q`比`yarn cache clean`快100倍)+`--ignore-scripts`跳过postinstall失败。清缓存后C盘2.58→17.67GB。
§
🔴 webpack dev-server 路径陷阱(2026-08-19 实锤):即使 cd 到 wt3 worktree 目录启动 dev-server,webpack 仍读 GTS-Play 主仓源码(source map 全解析到 ../../../GTS-Play/...)。验证:bundle 里搜旧代码确认。解决:worktree 改动必须先 merge 回 dev 再从主仓测。教训:worktree 改了 ≠ dev-server 能看到。
§
Brief 防卡死:涉及 PMX 减面/verify 等计算密集操作的测试,jest 可能 >300s 超时卡死 agent bash 工具。brief 必须显式写「禁止跑 jest/BDD 测试,只改代码」或「只跑单个 --testNamePattern」。验证用 reduce.mjs + verify.mjs 手动执行
§
🔴 回忆类问题信源优先级(2026-08-20 实锤):git log = 唯一权威 > daily log / state.db > MEMORY 主表。主表是沉淀不是 git-tracked,容易和代码现状脱节(已踩:8-19 沉淀 antd-mobile Modal 修复清单,8-20 顺手答你时把已修的"待修"清单又吐出来)。发现 git ≠ 主表 → 以 git 为准,立刻 patch 主表。
§
antd-mobile Modal 白屏修复(commit **d6681051e** 2026-08-19):单机版✅ 全完成。City.tsx(setting+prop modal 改 Modal.show+replace)、Upgrade.tsx(Mask改useEffect+条件渲染,263行)、MissionComplete.tsx(Modal.show)。根因:stopLoop vs Three.js requestAnimationFrame 竞态。prop button 切换内容用 handler.replace() 不触发 onClose;使用道具后刷新 effect 依赖加 refresh state `_`。多人版 MultiplayerHall.tsx:806 gameOverVisible 仍 JSX 模式未改,不在本次修复范围。
§
🔴 hermes 读资料 vs OpenCode 加载链(2026-08-20 实锤):兄弟问"回忆 X / v3 skill 在不在 / 昨天 commit" → **hermes 自身 read_file 0 配置直读**(~/.hermes/skills/gts-memory-search-v3/SKILL.md 即时生效)。**绝不要派 OpenCode agent 验证 v3 skill 是否在 OpenCode surge prompt** — 那是 OpenCode 加载链问题(`.opencode/opencode.json` 的 `agent.build.permission.skill` allowlist),跟 hermes 读资料能力无关。判错题 = 浪费时间 + 兄弟拍桌。
§
🔴 `opencode run` argv 3 坑(2026-08-20 实测,已落 gts-dispatch-preflight):① `--command` 是 OpenCode 注册命令,普通 message 必须 positional;② `--attach` 必须带 `http://localhost:4098`;③ `--no-replay` 在某些 session 触发 BUN `UnknownError` 崩在 SessionPrompt.command → 派工默认不加。完整模板见 gts-dispatch-preflight §「argv 终极清单」。任何 dispatch 失败 = argv 坑,先看 CLI 错误第一行。
§
🔴 wait-opencode-session.mjs 参数单位是 **ms** 不是 s(2026-08-20 实锤):`<sessionID> [maxWaitMs] [stableMs]`。我之前传 5400/1800 当秒,实际 5400ms = 5.4s,30s 后就 TIMEOUT。**Pro 思考期 → maxWaitMs=5400000(90min),stableMs=300000(5min idle)**。gts-auto 主表/skill 文字写"maxWaitSec"是错的,跟脚本不一致 → 脚本以源码为准。完整 dispatch 模板见 gts-dispatch-preflight / gts-opencode-dispatch-pitfalls。