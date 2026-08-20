用户是 GTS-Play 游戏开发者(巨大娘多人,Lerna monorepo D:\Github\GTS-Play),中文+OpenClaw 互称「兄弟」;项目记忆 笔记\memory\openclaw-archive\。
§
联系人=非正式口头称呼(同音/简化/老昵称);真名以微信 wxid 查 Contact 表为准。
§
兄弟拍板的方案:dispatch 后把 `(providerID, modelID, variant)` 写到 `D:\Github\GTS-Play\.opencode-session-meta\<sid>.json`,续跑「继续」时读出并遵循,不要靠 `-m` 参数(append 路径下 server 忽略 `-m`,直接用 session 绑定 model)。
§
🔴 接 git / 改 .gitignore / 任何不可逆操作前(2026-08-18 拍板):(1) 列计划+等拍 (2) 写配置后逐文件 `git ls-files --cached --error-unmatch` 核对(**不信 git check-ignore -v 的 stdout**) (3) commit 前再过目。
§
兄弟硬偏好:① 一session一事+多任务并行派;② 派前问几个修复点;③ agent自报完成不信→附实测;④ 免费组逐个试完再切付费;⑤ 全自动卡点必须notify;⑥ worktree每次新建用完即删(不问直接建)