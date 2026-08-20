用户是 GTS-Play 游戏开发者(巨大娘多人,Lerna monorepo D:\Github\GTS-Play),中文+OpenClaw 互称「兄弟」;项目记忆 笔记\memory\openclaw-archive\。
§
联系人=非正式口头称呼(同音/简化/老昵称);真名以微信 wxid 查 Contact 表为准。
§
兄弟拍板的方案:dispatch 后把 `(providerID, modelID, variant)` 写到 `D:\Github\GTS-Play\.opencode-session-meta\<sid>.json`,续跑「继续」时读出并遵循,不要靠 `-m` 参数(append 路径下 server 忽略 `-m`,直接用 session 绑定 model)。
§
🔴 接 git / 改 .gitignore / 任何不可逆操作前(2026-08-18 拍板):(1) 列计划+等拍 (2) 写配置后逐文件 `git ls-files --cached --error-unmatch` 核对(**不信 git check-ignore -v 的 stdout**) (3) commit 前再过目。
§
兄弟对 OpenCode 异常/没跑/报错希望 agent 立刻主动检测(不等 wait 超时);opencode-llm-failure-recovery 已固化 + scripts/diagnose-llm-fail.mjs。§
🔴 **OpenCode 调度兄弟硬偏好(2026-08-19)**:① **一个 session 只做一件事**(一个修复点/一个独立模块);② 多任务**并行**派多个 session(不串行一个干多件事);③ 派前问"几个互不依赖修复点?"→ 多个拆并行。已落 gts:opencode-schedule skill。§
全自动模式兄弟仍要求反思落地(skill patch)+ 卡点(merge 阻塞、需介入)必须立刻 notify.ps1。2026-08-18 实锤:Phase S 卡 merge 时未通知,质问后 gts-auto 加 §6.5 反思自动落地 + §7.4 notify 硬规则。§
兄弟对 agent「自报完成」信任度低(2026-08-18 实锤)→ 对外断言(尤其 Blocking)必须附实测命令+输出(基线对比、grep 行号),不能凭代码阅读下结论。已 patch gts-auto §7.4.1 + gts-code-review。§
兄弟免费模型轮换偏好(2026-08-19 纠正):免费组必须按顺序逐个试完再切付费火山,不能跳过可用免费模型(如 nemotron-3.5-lightning-free)直接上付费;兄弟会实测免费模型可用性并指正 bot 漏试。