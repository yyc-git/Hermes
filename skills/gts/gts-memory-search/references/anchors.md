# 核心锚点词(从 OpenClaw MEMORY.md 迁移,2026-08-17)

> 检索时优先使用这些锚点词;命中关键词后按 MEMORY.md「读取入口」表定位详细文件。

## 项目/技术
GTS-Play, OpenCode, E2E, BDD, SCF, TSRPC, room-service, match-service, webpack-dev-server

## 多智能体
Multica, 多智能体, 桥接, 智能体, squad, m-skill

## 技能/流程
token-opt, gts-skill, MEMORY-ARCHIVE, MEMORY, QMD, 重构规则, 代码审核, 验收, gts-acceptance
通知, 飞书, 部署, deploy-scf, 状态同步, isProduction, isTestPerf, 保存, 提交, gts-youtube-download
状态同步, 绝对状态, 长任务, 模型选择, yieldMs
spawn-subagent
yarn-bootstrap
submit-exclusive
gts-opencode-stop

## OpenCode 调度/卡死判定
FK-constraint, CLI-kill-not-session-kill
静默判卡死, session-静默, time_updated, 禁止仅凭shell输出判卡死, shell-输出-静默-不判卡死, 80分钟, max模型静默

## 技能反思
技能反思, 自我反思, gts-skill-reflect, append-pitfall, R步骤, pitfalls, 嵌套反思

## MMD/VMD 工具链
MMD-MPL, PoPo, mpl.exe, MPL, VMD生成器, vmd-generator, standToLying
VMD压缩, compress-vmd, vmd.gz, interp清零, interpolation-strip, vmd_bake_physics体积
骨骼精简, bone-reduce, 刀B1, 刀B2, pmx-bone-reduce, 级联边界, 索引重映射

## 微信
wechat-chat-export, 微信聊天记录, 导出微信聊天, wxid, PyWxDump, 微信密钥, openclaw-weixin, 微信通道, 微信发消息, 429限流

## 关键教训速记
- [导出微信聊天必须先退出微信 — 2026-08-11] 运行中解密缺 `MSG*.db-wal` 增量(最新消息全丢);退出微信 wal 自动 checkpoint 合并,key 固定派生重启不变 → 详见 skills/wechat-chat-export/SKILL.md Step 0
- [中文 commit 乱码 — 2026-08-06] PowerShell `git commit -m "中文"` 传参 GBK 乱码 → commit message 一律英文
- [worktree 慢根因 — 2026-08-16] yarn.lock 在 .gitignore(不在 git)→ 新 worktree 无 lock 被限流;先复制主仓库 yarn.lock 再 install
