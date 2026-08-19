# MEMORY.md — 核心记忆

> 来源:OpenClaw 迁移(2026-08-17)。原始完整版 + 每日日志见 `D:\Github\GTS-Play\笔记\memory\openclaw-archive\`(core/ + daily/ + identity/)
> 本文档为常驻记忆;详细内容在归档、技能中按需读取。

## 身份与称呼
- 用户叫我「兄弟」,我回「兄弟」🤜;黑话:「小龙虾」= 喊我
- 用户:巨大娘群主,游戏开发者,GTS-Play 项目(详见 USER.md)

## 项目概况
- **GTS-Play**(主项目):`D:\Github\GTS-Play`,Lerna monorepo,Three.js + React 多人联网游戏
  - 技术栈:TSRPC、room-service/match-service、webpack-dev-server、腾讯云 SCF、CloudBase(文档型数据库)、jest-cucumber BDD、Playwright 双窗口 E2E
  - 关键目录:`packages/`(frontend、mmd_tool 等)、`笔记/`、`specs/`、`test/`、`test/e2e/E2E-OPERATIONS.md`
- **VibeCodingBook**(写书):`D:\Github\VibeCodingBook`(contents/正文 + 笔记/过程 + packages/代码)
- **其他仓库**:Meta3D、PMXReduceFace(2026-08-13 开源,质量守卫地板 39949)、MyData(默认分支 master)

## 核心工作纪律(高优先级)
- **[入口检查]**:收到消息第一件事检查是否有已完成的后台任务,先汇报再处理当前消息
- **[先汇报再继续]**:工具/任务返回结果后,先出声总结(结果概要+下一步)再做下一步
- **[等确认必须通知]**:发出需确认问题后必须发桌面/消息通知,不能假设兄弟在聊天界面前
- **[OpenCode 调度]**:复杂代码修改/测试/审核一律调度 OpenCode(见 skills/opencode-schedule);dispatch 必须 `--attach http://localhost:4098` + `--title "<任务名>"`;dispatch 前先查无相同任务 session
- **[禁止 bot 直改代码]**:.ts/.tsx/.res/.js/.feature/.steps.ts 修改必须调度 OpenCode;bot 只做:读结果+分析+写 brief+dispatch+验证+git+部署。例外(2026-08-02 确认):诊断/临时验证类小改动(加日志、去 clamp、注释代码块、1 行验证修复)可直改
- **[TDD 纪律]**:先让测试真实失败再修复,禁止模拟函数;验证脚本必须真实读实现源码(防硬编码盲区)
- **[装依赖用 yarn bootstrap]**:禁止 npm install;开跑后死等到完成或报错,绝不中途杀
- **[Git 提交]**:禁止 git add -A;commit message 一律英文(中文经 PowerShell GBK 乱码);提交前清临时文件、确认未跟踪
- **[杀进程纪律]**:禁止无过滤杀 node/yarn(会杀 gateway);精确匹配服务名或按端口杀
- **[部署纪律]**:未确认不部署线上;单机部署需兄弟确认;部署上传前关 Clash(直连腾讯云最快)
- **[论坛 CloudBase 纪律]**:默认不碰 CloudBase 文档型数据库集合(增删改查/迁移),必须等兄弟确认
- **[静默判卡死]**:OpenCode Pro/Max/GLM/Kimi 静默 15-30+ 分钟正常;max 模型至少等 80 分钟;判 kill 前必须先汇报兄弟
- **[调用 skill 后逐条复核]**:必须读完整 skill,执行后逐条对照检查,注意委托链(「走 xxx skill」= 必须实际调用)
- **[清理临时文件]**:删 _tmp-*/verify-* 前先 git ls-files 确认未被跟踪

## Token 优化(精选)
- 禁止子 session,一切在主线完成(与入口检查/先汇报同级)
- 调度 brief 引用共享规约文件,不逐条复制
- 长任务拆 <30min 短 session + --no-replay;tokens 近上限时停+开新
- 同类小任务合并 dispatch,禁止碎片化逐个派
- bot 主线长会话:每完成一个 phase 归档开新会话;cacheRead>50M 或运行>2h 主动停开新
- 简单代码审核(工具类/测试代码/非架构/<=50行)用 Flash;复杂审核用 Pro 默认 variant;方案/架构设计用 Flash(2026-08-17 兄弟拍板)

## 关键教训(精选,完整版见归档)
- 微信导出必须先退出微信(运行中缺 MSG*.db-wal 增量,最新消息全丢)
- 编码:中文 commit 乱码→用英文;压缩后扫描 U+FFFD/锟斤拷 乱码
- 规格数学冲突时 agent 可能选错方向(丢核心诉求)→ bot 以产品核心诉求校验 agent 决策
- 修复 agent 可能改弱 BDD 断言掩盖问题 → 审核必须对比修复前后 feature/steps 断言差异
- worktree 慢根因=缺 yarn.lock(在 .gitignore);先复制主仓库 yarn.lock 再 install
- opencode part 表无 role 列(role 在 message 表 data JSON)
- OpenCode CLI exit 0 ≠ session 结束(server agent 残留)→ 重新 dispatch 前查 DB 清理残留

## 读取入口(技能已迁移至 Hermes:hermes-home/skills/gts/)
| 主题 | 位置 |
|------|------|
| 人格/风格 | SOUL.md |
| 用户画像 | USER.md |
| 编程流程 feat/fix/refactor | skills/gts-dev-workflow、gts-dev-feat、gts-dev-fix |
| OpenCode 调度/模型速查 | skills/opencode-schedule |
| 停止 OpenCode 会话 | skills/gts-opencode-stop |
| 代码审核 | skills/gts-code-review |
| 方案审核 | skills/gts-plan-review |
| E2E 测试/性能/回归 | skills/gts-e2e-test、gts-e2e-auto、gts-e2e-perf、gts-e2e-regression、gts-regression |
| 保存/提交/记忆 | skills/gts-save-flow、gts-submit-save、gts-save-memory、gts-git-commit、gts-git-pull |
| 部署 | skills/gts-deploy、gts-deploy-forum、gts-deploy-standalone、gts-deploy-website |
| 依赖安装 | skills/gts-yarn-bootstrap |
| 截图分析 | skills/gts-screenshot-optimize |
| 微信 | skills/wechat-send-message、wechat-chat-export |
| 知乎/博客园/语雀/贴吧 | skills/zhihu-fetch、zhihu-auto-publish、yuque-jianshu-fetch、tieba-scrape-migrate |
| 综合检查 | skills/gts-health-check、gts-clean-disk、gts-stop、gts-continue、gts-auto |
| 项目文档 | 笔记/项目文档/(specs、changes、rules、issue、knowledge、lessons) |
| 重构规则 | 笔记/项目文档/rules/workflow-rules.md |
| 写书规范 | VibeCodingBook 笔记/素材整理(初稿撰写规范、教材编写须知) |