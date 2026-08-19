# MEMORY-ARCHIVE.md — 历史教训归档

> 已从 MEMORY.md 移出以保持核心文件精简。需要时可在本文件查找历史教训。

---

## 重要教训（第一批）

### Delta Specs 必须让兄弟确认后再开工（2026-07-03）
- `changes/` 目录初始化后，spec.md 里的场景清单（Delta Specs）必须先给兄弟过目
- 兄弟确认覆盖完整了再进 Step 2 实现
- 兄弟说「开工」≠ 跳过 Specs 确认，是两回事
- 正确顺序：初始化变更文档 → 贴 Specs 让兄弟确认 → 兄弟说行 → 开工
- **需要兄弟确认的环节必须发通知**（飞书+桌面双通道），不能静默等回复

### 三步法今天又破戒了（2026-07-03）
- 编辑 MEMORY-ARCHIVE.md 时没先 `Select-String` 定位就直接 `edit`，结果匹配失败重来
- 搜索 Token 优化内容时分开搜了好几次 `Select-String`，没合并成一次
- token 优化协议已恢复进 MEMORY-ARCHIVE.md，**不能当它不存在**
- 三步法必须要走：① Select-String 搜索定位 → ② read 精确行 → ③ edit 修改
- 搜索合并：多个 pattern 一次 `Select-String "a|b|c"`，不分开搜

### 🔴 dispatch 前检查 = 相同任务 session，不是所有活 session（2026-07-31 修正）

- 原规则「确认没有活着的 OpenCode session 才能 dispatch」过严，把其它任务的 session 也算进阻塞条件
- **修正：调度前检查的是「是否有相同任务的 session」（title/brief 关键词匹配同一功能/同一修复点）**
  - 相同任务在跑 → 不能 dispatch，等它结束或汇报兄弟
  - 其它任务的活 session → **不影响 dispatch**，不用等、不用停，直接 dispatch 新任务
  - 不同任务（不同 brief/不同文件）互不冲突，多 OpenCode 抢文件冲突只发生在相同任务
- 同步更新：`opencode-schedule/SKILL.md` Step 0（2026-07-31）+ MEMORY.md 工作协议

### 🔴🔴🔴 poll 返回 SIGKILL ≠ 进程死亡 — 用 process(action=list) 确认（2026-07-28）

- `process(poll)` 返回 SIGKILL 不代表 OpenCode 进程挂了，只是 poll 自身超时被 shell 杀
- **正确做法：** 先 `process(action=list)` 查进程列表
  - 如果 OpenCode session 还在 Running → 继续等，别 dispatch 新的
  - 如果已退出 → 才看日志分析原因
- 以前踩过同样坑（误判 SIGKILL 为额度用完），但没写进记忆，今天又重复踩了
- 2026-07-28 具体踩坑：poll 到 SIGKILL → 以为 OpenCode 死了 → 连开 3 个新 dispatch → 兄弟关了所有 → 浪费 + 风险
- 已在 `opencode-schedule/SKILL.md` Step 0 加入 dispatch 前查进程列表规则
- 已在 MEMORY.md 加入同优先级规则

### OpenCode 调度用 sessions_spawn 替代 exec（2026-07-03）
- 所有调度 OpenCode 的操作统一走 `sessions_spawn` 创建子 agent，不再用 `exec` + `yieldMs`
- 子 agent 独立运行：接收 brief → 调度 OpenCode → poll 进度 → 汇报结果
- 主 session 全程可响应兄弟消息，互不排队
- 子 agent 加 `taskName` 便于追踪
- 模板：`sessions_spawn(task="<brief>", taskName="opencode-<task>-<date>", context="isolated", mode="run")`

### 自动验收会话 context overflow 风险（2026-07-02）
- E2E 自动验收（gts-acceptance）大量 tool call + poll 循环容易撑爆上下文
- 上下文溢出后 compaction → 可能被 abort → 兄弟消息收不到
- 兄弟说「停止」后，必须先检查会话是否还活着，别发完消息以为它会收到
- auto-ready 不需要手动点击「准备」按钮，P2 auto-ready 在 15-20s 内自动触发

### .last-review 只由 gts-code-review 修改（2026-06-28）
- gts-dev-workflow 的代码审核步骤中**不能写 .last-review**
- gts-dev-workflow 应该由独立调用的 gts-code-review 流程来写 .last-review
- gts-dev-workflow 自己调度的 Pro 审核不写 .last-review

### 报告/通知中禁止使用 🐛 图标（2026-06-25）
- 兄弟明确说了不要用 🐛 图标
- 用「Bug #N」或「#N」即可

### 报告必须包含 OpenCode 完整输出信息（2026-06-25）
- 除了我的摘要 + git diff，还要把 OpenCode 的结论/总结/分析/方案/代码改动等完整反馈贴出来
- 不是贴运行日志（读了哪些文件、写了什么），而是它最后输出的结论/结果
- OpenCode 的反馈要以便于我查看的格式显示（格式化后直接可读，不是原始 markdown 源码）
- 不能只贴自己整理的版本，OpenCode 原始输出是关键

### dispose 必须彻底清理所有残留（2026-07-04）
- 多处线上 bug 根因都是 dispose 没清理干净（timer、listener、状态引用）
- `_handleGameExceedMaxTime` 的 interval 在 dispose 后未 clear → SCF warm container 残留旧 timer
- `createState()` 重置但保留了 timer 引用 → 新旧 timer 叠加
- **原则**：dispose 必须反注册所有注册过的东西（interval、listener、handler），不留任何幻影
- 实现时逐项对照：init 里注册了什么 → dispose 就清理什么

### isTestPerf 不仅影响网络，还需跳过前端渲染（2026-06-25）
- isTestPerf=true 时服务端 `prepareBroadcastPlayers` 剥离 `obbArray`
- 但前端 OBB 渲染有三层来源：`localHullOBB`（本地玩家骨骼）、`remoteHullCache`（远程玩家缓存的本地计算结果）、`p.obbArray`（服务端广播的回退）
- 只剥离 `obbArray` 不影响本地玩家的 OBB 渲染，也不影响远程玩家有缓存时的 OBB 渲染
- 必须在 `renderLoop` 中 `isTestPerf=true` 时跳过 `_updateDebugBoxes` 调用
- 碰撞检测（`localHullOBB`）独立于碰撞盒渲染（`_updateDebugBoxes`），不受影响

### DebugPanel 开关同步到服务端需要双路径（2026-06-25）
- 建房时：前端 `createRoom` → match-service `CreateRoom API` → room-service `SetConfig API`
- 运行时：DebugPanel 开关切换 → 直接调用 room-service `SetConfig API`
- 两个场景都走同一条 `SetConfig API`，服务端处理一致

### 遇代码修改必须调度 OpenCode（2026-06-25）
- **写代码/改代码/删代码/出方案/查代码/找原因 — 全部交给 OpenCode**，我自己只做调度、验证、通知
- 即使改动很小（如加个字段、改个导入），也不自己手改
- 找原因/定位代码也要调度 OpenCode，不能自己 exec + Select-String 搜
- 方案落地用 OpenCode，测试改 BDD 格式用 OpenCode，基础设施升级也用 OpenCode
- 这次破戒自己改了 Config.ts 拆分、删测试文件，错在觉得改动小可以自己来
- **例外：** 简单操作可以自己做，如改 package.json 字段名、跑 yarn bootstrap、改配置文件名称等非业务逻辑操作

### 代码审核默认全部要修（2026-06-25）
- 代码审核报告中的 🔴 清理项 + 🟡 重构项 + 🟢 关注项 **默认全部都要修**
- 🟢 关注项不再「只记不改」，默认也要修
- 只有兄弟明确说「不处理」「跳过」「忽略」才不修
- 对应 MEMORY.md 的重构规则区已同步修改

### doc/ 目录文件是兄弟自己改的，直接提交不问不改（2026-06-25）
- 兄弟说 `doc/` 的文件都是他在改，不管改了什么直接提交
- OpenCode 可能会自动写入 `doc/` 文件（如项目文档），不做还原/checkout
- 看到 `doc/` 有改动，直接 git add 提交，不审不问

### E2E 停止时必须保存日志到文件（2026-06-29）
- E2E 停止按钮被点击时 → `consoleLogs` 自动保存到 `test/e2e/__logs__/` 目录下
- **只保存不抓取** — 不自动分析/汇报，等兄弟说「查日志」时再读文件
- 日志文件名：`e2e-<YYYY-MM-DD-HHmmss>-P<N>.log`
- 避免打印到控制台后被丢弃（之前 console.log 只存在内存里，停止后丢了）

### E2E 发现问题后调度 OpenCode 诊断修复（2026-06-25）
- E2E 中兄弟提到任何涉及代码检查/修方案的问题，调度 OpenCode 处理
- 自己不读代码/自己不出方案/自己不修
- 方案→OpenCode Pro（--agent plan），修复→OpenCode Pro Max（--variant max）

### gts-code-review 有 E2E 验证步骤（2026-06-25）
- 代码审核修完后，必须问兄弟要不要跑 E2E 验证（Step 5）
- 不能自己跳过 E2E 步骤直接到提交
- 跑 E2E 需要：重启 room-service + match-service → 确认 webpack → 跑脚本

### Step 2（实现）禁止内嵌代码审核（2026-06-25）
- 调度 OpenCode 实现时，brief 末尾必须明确写「不需要代码审核，代码审核是单独步骤」
- Step 2 只做 TDD 红→绿→重构，做完直接出结果
- 代码审核走独立的 Step 3（gts-code-review skill）
- OpenCode Flash 自检不算代码审核，但 brief 里明确禁掉

### 测试失败必须分析根因，禁止归类为「pre-existing」跳过（2026-07-28）
- 2026-07-28 教训：match-service 2 个测试失败（`emptyRoomId` 返回 0、`roomId` 返回 -1），我直接归类为「pre-existing」跳过
- **这是错的**：没有分析到底是被测代码有 bug 还是测试本身问题
- 正确做法：每个失败必须输出分析结论：
  ```
  [测试失败分析]
  文件：test/xxx.steps.ts:xx
  场景：xxx
  根因：被测代码的 xxx 逻辑在 yyy 条件下返回 zzz，预期是 aaa
  结论：被测代码有 bug → 修代码 / 测试断言不对 → 修测试
  ```
- 该纪律已同步更新到：gts-dev-workflow SKILL.md、gts-dev-fix SKILL.md、test-standards.md

### 调度 OpenCode 时禁止让它做 E2E 相关工作（2026-06-25）
- OpenCode 对 E2E 环境（启动服务、跑脚本等）有问题
- E2E 相关操作（重启服务、启动脚本、截图、抓日志）都由我自己做
- OpenCode 只做代码/方案/检查等它擅长的部分

### 代码审核 brief 必须贴完整重构规则（2026-06-25）
- 调度 OpenCode 做代码审核时，brief 里的审核标准不能只列类别名
- **必须把 MEMORY.md 里 🔴🟡🟢 的完整重构规则逐条贴进去**
- 这次我在 brief 里只写了类别摘要「架构/结构」「类型质量」等，兄弟说不够详细
- 不要自作聪明浓缩，直接把完整规则搬过去

### 通知必须双通道（2026-06-25）
- 等兄弟确认时，**桌面消息 + 飞书推送 都要发**，不能只发一个
- 这次只发了飞书 cron announce，漏了 `exec msg * "<消息>"`，兄弟没收到
- 两个通道都发，确保兄弟一定能收到

### E2E 测试期间禁止并发改代码（2026-06-29）
- E2E 测试运行时（4个 Playwright 窗口开着），不能同时调度 OpenCode 改代码
- 原因：webpack HMR 重新编译 → 页面热更新 → 游戏 WS 全部断开 → 服务端广播 Exit
- 正确流程：改代码→提交→编译→再跑测试。测试期间不动代码

### 🔴🔴🔴 调度 OpenCode 时禁止擅自改代码/停 OpenCode（2026-07-07）
- **自己不动手改代码** — 调度了 OpenCode 就让它改，我不碰
- **不能擅自停 OpenCode** — 我根本停不了，`Get-Process` 杀 playwright chrome 也不行
- **擅自试图停 OpenCode 的后果：** 下次再调度 OpenCode 时旧进程还在跑 → 两个 OpenCode 抢文件 → 冲突爆炸
- **正确的做法：** dispatch → poll 等它完成 → 出结果汇报。冷启动的 OpenCode 会自动接管

### 🔴 poll 完成时只拉尾部日志，禁止 limit=9999 拉全量（2026-07-08）
- `process(action=log, sessionId=<id>, offset=-100)` — 只读最后 100 行
- 原因：OpenCode PTY 日志 >500 行，全量拉入上下文 + poll 累积的 thinking → 200k context 轻易撑爆
- dashboard 监控 session 踩过这个坑：用 limit=9999 拉全量日志，经过 10 轮 poll + thinking 累积后 context overflow
- 关键信息（测试结果、最终结论）在日志尾部，offset=-50 通常够用
- 如果尾部信息不足，再按需拉 offset=-200
- 对应更新：`skills/opencode-schedule/SKILL.md` Step 4

### 调度 OpenCode 优先选 Flash（2026-06-29）
- **实现/修复默认用 Flash**，只有确实需要 Pro 的复杂逻辑、架构设计、代码审核才上 Pro
- E2E 脚本、纯工具脚本、配置文件等简单改动一律 Flash，不上 Pro
- 先问自己：这值得上 Pro 吗？不确定就先上 Flash
- 2026-06-29 破戒：纯 .cjs 工具脚本改动用了 Pro，浪费 token 和等待时间

### OpenCode 产出必须贴完整原始报告
> **已升级为工作协议中的最高优先级规则。** 见 MEMORY.md 工作协议区。
> 此旧条目已废止，以最高优先级规则为准。

- 兄弟给的任何指令/修复建议/代码审核结果，必须**完整传达给 OpenCode**
- 不能只挑重点、不能合并概括、不能省略任何条目
- 如果不确定是否完整，宁可直接贴原始文本给 OpenCode
- 代码审核报告中的每条建议（包括测试相关、🟢 关注项等）都必须写进 fix brief

### 杀 Chrome 进程必须精确匹配（2026-06-18）
- **禁止** `Get-Process chrome | Stop-Process` 无过滤 — 会杀掉兄弟的浏览器
- **正确做法**：`Get-Process -Name chrome | Where-Object { $_.CommandLine -match 'playwright' } | Stop-Process -Force`
  - 只杀 Playwright 启动的 Chromium，不动兄弟自己的 Chrome
- **更安全**：`Get-Process | Where-Object { $_.ProcessName -eq 'chrome' -and $_.CommandLine -match 'playwright' } | Stop-Process`
- 千万别用 `MainWindowTitle -match ""` 之类空匹配 — 会匹配所有进程

### 杀 node 进程必须精确匹配（2026-06-20）
- **禁止** `Get-Process -Name node | Where-Object { $_.Id -ne $pid } | Stop-Process -Force` — 会杀掉 Gateway 和 webpack
- **正确做法**：`Get-Process -Name node | Where-Object { $_.CommandLine -match 'room-service|match-service' } | Stop-Process -Force`
  - 只杀目标服务，不动 Gateway/webpack/其他服务
- **Gateway 重启后果**：会话被重建，模型可能切回 Pro，需手动检查

### opencode run CLI 不支持 --timeout 参数（2026-06-25）
- `opencode` CLI v1.17.9 **不支持 `--timeout`**，加了会报错退出
- **正确做法**：Timeout 用 exec 的 `yieldMs` 控制
  - Flash：exec timeout=600s, yieldMs=600000
  - Pro：exec timeout=1200s, yieldMs=1200000
- **`--no-replay` 必不可少** — 非 interactive 模式必须加，否则 CLI 报错
- 模板命令：`opencode run <brief> -m opencode-go/deepseek-v4-xx --dir . --attach http://localhost:4096 --no-replay`
- plan agent 只读不能写文件 → stdout 输出手动捕获保存

### `openclaw memory search` CLI 不能并发跑（2026-06-25）
- qmd SQLite 有竞态条件，多个进程同时跑会 `SQLITE_BUSY`
- **先等上一个跑完再跑下一个**，串行执行没问题

### monorepo 安装依赖的正确方式（2026-06-25）
- **不要**直接 `npm install` 或 `yarn add` 某包 — `yarn bootstrap` 会把 workspace 里的 node_modules 清掉
- **正确做法：** 改根目录或目标包的 `package.json` 的 `devDependencies`/`dependencies` → `yarn bootstrap`
- 这样 yarn 才会用 workspace 机制正确 hoist 和链接

### 集成测试应走完整管线入口（2026-06-21）
- 测试相机不能直接 call `initThirdPersonCamera`，应通过 `MultiplayerRender.initOrbitControls` 或 `MultiplayerLoop.initForMultiplayer` 入口覆盖完整调用链
- mock 重型依赖（MR.init/ManageScene.init/MH.clearAllSprites），保留真实 `initThirdPersonCamera`

### 改重构规则时同步更新 GTS-Play-Coding-Rules.md（2026-06-25）
- 改 MEMORY.md 的重构规则时，必须同步更新 `D:\Github\GTS-Play\笔记\项目文档\GTS-Play-Coding-Rules.md` 的七、重构规则
- 改 gts-code-review SKILL.md 等 skill 文件中的重构规则时也一样
- 两个源保持一致，不能只改一个

---

## 重要教训（第二批）

### 安装依赖的正确流程（2026-07-01）
- **不要跑 `yarn add`/`npm install` 加依赖**，直接改目标 `package.json` 的 dependencies/devDependencies，然后 `yarn bootstrap`（workspace 项目）或 `yarn install`（普通项目）
- `yarn add` 会改 lockfile 且可能被 kill 后半残，留下幽灵依赖，不如直接改 package.json 干净
- **改 node_modules 必须先经兄弟确认**，这条规则严格执行

### SCF 部署关键教训（2026-06-30）
- **Module._load hook 在 SCF 不可靠** — 直接在 zip 中注入 node_modules 文件更稳妥
- **`@cloudbase/manager-node` 只管理 CloudBase 函数** — 原生 SCF Web 函数需直接调 SCF API（`scf.tencentcloudapi.com`）
- **手动注入 node_modules 时注意 `package.json` 的 `"type"` 字段** — `@rescript/runtime/package.json` 含 `"type": "module"` 导致 CommonJS `require()` 报错，不复制此文件即可
- **Web 函数日志不走 `GetFunctionLogs`** — 走 CLS `SearchLog` API（端点 `cls.tencentcloudapi.com`，Version `2020-10-16`）
- **`InstallDependency` 必须在 `UpdateFunctionCode` 请求中携带** — 单独 `UpdateFunctionConfiguration` 不触发 npm install
- **`ProtocolType`/`Type` 是创建时参数** — 无法通过 `UpdateFunctionConfiguration` 更改
- **TC3-HMAC-SHA256 签名日期用 `YYYY-MM-DD`（带连字符）** — 同时用于 CredentialScope 和 HMAC key 派生
- **`yarn deploy_all` 的 gulp parallel 任务有竞态** — `build_room1`/`build_room2` 同时写 `IdData.ts`，导致其中一个构建失败。正确做法：`node scripts/deploy-scf.js room1` → `room2` → `match1` 串行部署

### 🔴🔴🔴🔴🔴★ 论坛项目：默认不碰CloudBase文档数据库集合（2026-07-30，修正）
- **最高优先级纪律**
- ⚠️ 兄弟指出的「DB」= **CloudBase 文档型数据库的集合（collections）**，不是传统 SQL
- 修改论坛项目的 CloudBase 后端代码时，**默认不操作 CloudBase 文档数据库集合**（collections）
- 任何涉及 collections 的操作（增删改查集合、修改文档、数据迁移等），无论是否全自动，**必须先问兄弟确认**
- 即使觉得自己「很清楚这个操作安全」，也不能自己决定。必须等兄弟说「行」
- **违反后果：** 写错数据、搞垮线上服务，兄弟骂

### TCB_SECRET_ID / TCB_SECRET_KEY 存放位置（2026-07-30）
- **项目：** `GTS-Play/packages/meta3d-platform-publish`
- **文件路径：** `src/cloudbase-host/CloudbaseHostService.ts`
- **方法：** `getLocalEnvData()` → 返回 `{ secretId, secretKey }`
- 兄弟反复说「老是找不到」，务必记住这个位置，下次被问到 TCB 密钥时直接指向这里

### OpenCode exit code 1 不等于没出结果（2026-06-30）
- OpenCode CLI 退出码为 1 时，PTY 输出可能**已经包含了完整结果**
- 不要只看 exit code 就判断失败并重新调度
- 先检查 PTY 输出的最后部分有没有最终报告/结论
- 2026-06-30 破戒：第一次 Pro 审核跑了 16 个探索后 exit code 1，但实际已经出了完整报告。我自作主张拆成两批重跑，浪费了 token 和时间

### E2E auto-online-entry 「准备」按钮选择器（2026-07-01）
- 按钮内有自动倒计时文字（"N 秒后自动准备"），`getByText('准备')` 匹配到的是倒计时文字而不是按钮
- **正确做法**：`p2.locator('button').filter({ hasText: /^准备$/ })` — 通过精确正则匹配按钮文本
- 影响了 online-entry 脚本的 UI 点击流程

### Config.ts URL env 参数控制环境切换（2026-07-02）
- `createDefaultConfig()` 通过 `window.location.search` 读 `?env=local/production` 覆盖 `isProduction`
- E2E 脚本只需在 URL 后加 `?env=local` 或 `?env=production` 即可控制后端指向
- 共享函数 `getPageUrl(env)` 和 `BASE_URL` 在 `e2e-helpers.cjs`
- 所有 8 个本地 manual 脚本统一加了 `?env=local`，新增 `e2e-scf-twowin.cjs` 用于 SCF 线上测试

### E2E 脚本重构 — 共享辅助函数模式（2026-07-01）
- 所有 auto/ 脚本统一使用 `createPageContexts(browser, labels, consoleLogs, opts)` 替代手动创建 context/page/monitor
- 多人脚本使用 `loginPage(page, baseUrl, userParam, label, consoleLogs)` 替代 inline goto+sleep+waitFor
- 所有脚本在 pass 前调用 `checkErrorsAndExit(monitors, consoleLogs, tag, browser, opts)` 检测 console.error
- 这些函数在 `e2e-helpers.cjs` 中，所有 auto 脚本共用
- 其他目录（accept/ legacy/ manual/ perf/ debug/）未改动

### SCF sendFinished 修复 + 部署（2026-07-02）
- **真正根因**（2026-07-02 15:50 E2E 日志暴露）：`ModelConfig.res` 中 `getCollisionBox` 缺少 `@genType` 注解
  - 导致 `ModelConfig.gen.tsx` 不导出此函数 → `bundled-logic.js` 无法解析
  - P2 `sendFinished` 时调用 `game.ts → getCollisionBox` → `(0 , src_1.getCollisionBox) is not a function`
  - 崩溃 → room-service 断 WS → P1/P2 收到 Exit，游戏断线
- **症状根因**（之前分析）：TSRPC v3 `result.err` vs `result.errMsg` 不匹配 + isDev 硬编码 + 并发覆盖
- **修复提交**（HEAD~1 `7c3030601`）：
  - `ModelConfig.res`: `@genType` 追加到 `getCollisionBox`（+1 行）
  - `ModelConfig.gen.tsx`: 新增 `getCollisionBox` 导出（+3 行）
  - `ApiFinished.ts` try/catch、`State.ts` isDev 动态、`Room.ts` 去重、`MultiplayerManager.ts` 错误格式兼容
- 部署：`yarn deploy_all` 有 gulp parallel 竞态（build_room1/build_room2 同时写 IdData.ts），需串行 `node scripts/deploy-scf.js room1 → room2`
- **sendFinished try/catch 是症状修复，@genType 缺失才是真正根因。**

### 长任务响应"停"的机制（2026-07-02）
- 所有你可能喊停的长任务（E2E测试、服务启停、打包部署）都用 background: true 启动
- 每 **10 秒**用 process(poll, timeout=10000) 检查一次
- 每轮结束交回控制权，让你说的"停"最晚 10 秒内生效
- OpenCode 调度不受影响（保持长 yieldMs，不 poll）


---

# 详细规则归档（来自旧 MEMORY.md）


---

# 详细规则归档（来自旧 MEMORY.md）


### 状态同步原则
- 最终状态（血量、位置、分数等）直接发送**绝对状态值**，不是变化量
- 客户端自行对比缓存计算差值（浮点数误差/丢包免疫）

### 测试基础设施
- frontend 有 BDD 测试：`test/features/*.feature` + `test/step-definitions/*.steps.ts`
- mock 配置：`jest.multiplayer.json`，mock THREE 在 `test/__mocks__/three-stub.js`
- setup：`test/setup.ts`（含 mock performance/fillRect/clearRect）
- **WebGL E2E 调试体系**（2026-06-20）：四层架构
  - L1: `window.__GL_STATS__` 每帧聚合（DC/tri/tex/programs）
  - L2: `window.__SHADER_ERRORS__` GLSL 编译错误自动捕获
  - L3: `scene.traverseVisible` 按 Mesh/Line/Sprite/SkinnedMesh 分桶
  - L4: `window.__GL_TRACE__.captureMs(n)` 逐条 GL 命令追踪（嵌入 ThreeRenderer.init）
  - E2E helpers: `test/e2e/e2e-helpers.cjs` 含 GPU 断言函数
  - 详细: `笔记/决策记录/WebGLE2E调试体系-2026-06-20.md`

## 保存协议



> 已固化为 Skill（gts-save-flow）。流程细节见 `skills/gts-save-flow/SKILL.md`。
> 注意：保存包含 push，与「提交git」规则不冲突。

## 验收规则



> 已固化为 Skill（gts-acceptance）。见 `skills/gts-acceptance/SKILL.md`。

## 通知



- 飞书 bot 按主机名自动选择：
  - `DESKTOP-HAOFHBA` → `user:ou_eeb0faa83444e9b2d85a4ce4f8845a8d`（新bot）
  - 其他机器 → `user:ou_2412e799eac60d83f54ecb2601f0ba80`（旧bot）
- 任务完成后必须飞书通知（≤10字），等回复期间保持 NO_REPLY
- **✅ 发飞书通知方式（cron announce）**：
  ```
  cron add {
    schedule: { kind: "at", at: "<ISO时间>" },
    payload: { kind: "agentTurn", message: "<通知内容（≤10字）>" },
    delivery: { mode: "announce", channel: "feishu", to: "user:ou_xxx" },
    sessionTarget: "isolated",
    deleteAfterRun: true
  }
  ```
  - `to` **必须带 `user:` 前缀**
  - 通知内容 ≤10字，否则飞书自动回复可能干扰流程
  - `deleteAfterRun: true` 自动清理，不占空间
- 当前主机 `1Y9GQVBDSQ8S6UO` 走旧 bot
- **每次等待兄弟确认时必发通知，不等不发**
- 通知策略：**桌面消息 + 飞书推送 双通道**
  - 桌面消息：`exec msg * "<消息>"`
  - 飞书推送：走 cron announce（见上方）
  - 两个通道都发，确保你能收到
- **每次等待兄弟确认时必发通知，不等不发**

### 调度 Pro 出方案 vs 实现代码区分（2026-06-27）
- **调度 Pro 出方案**（只出方案不开工）：**不要加**「直接动手」，让它出方案后自然停下等确认
- **调度 Pro 实现代码**（方案已出/已知目标）：**必须加**「确认后直接动手，不需要等我确认」，否则它会出方案停下等再次确认
- Flash 模型默认直接干活，无此问题
- 2026-06-27 明确：两种场景规则不同，不可混淆

## 监控



### 项目文件结构

`笔记/` 目录：
| 目录 | 用途 |
|------|------|
| `项目文档/` | 项目索引、累计记忆 |
| `决策记录/` | Bug 修复、架构决策 (ADR) |
| `方案/` | 重构方案、功能实施方案 |
| `讨论记录/` | 日常讨论要点 |
| `代码笔记/` | 代码要点、踩坑记录 |

## 同步源文件（硬性规定）



- **`.ts` → 改 `.ts` 再 `tsc`**，**`.res` → 改 `.res` 再 `rescript build`**，不要直接改 `.js`
- 改 `.gen.tsx` → 必须同步改 `.res`，否则下次编译覆盖
- 服务端代码改完 `.ts` → `tsc` → 重启服务

## GitHub 同步



- 仓库：`git@github.com:yyc-git/OpenClaw-whole.git`
- 根目录 `C:\Users\Administrator\.openclaw` 是 git 根目录（不再用 workspace 子仓库）
- 分支：`main`
- `.gitignore` 已排除：credentials/、identity/、agents/*/sessions/、*.sqlite*、logs/ 等运行时文件
- `gts-save-flow` 保存时自动 push（`.openclaw` + GTS-Play 两个仓库），`gts-git-pull` 拉取
- ~~同步脚本 `openclaw-backup-sync` 已废弃，不再使用~~

## 记忆搜索

- ~~禁止使用 `memory_search` 工具~~ **2026-08-01 反转：已恢复使用内置 `memory_search`**
  - 当时 bug：Gateway 插件层冷启动后后续查询报 `index metadata is missing`（2026-06-24），故改用 CLI
  - 2026-08-01 实测：bug 已修复，内置工具缓存命中后 ~2.8s，CLI 每次冷启动固定 ~15s → 恢复内置工具
- CLI 用法（保留备选）：`openclaw memory search "<query>" --max-results <N> --json`
- 解析 JSON 结果取 `path`、`score`、`snippet` 字段

### 🔴🔴 [Bot 与 OpenCode 职责划分]

详见 `笔记/项目文档/rules/bot-division-of-work.md`

**核心口诀：Bot 是管家，OpenCode 是工匠。**

| | Bot（我） | OpenCode |
|---|---|---|
| **角色** | 管家/协调者/最终把关人 | 工匠/编码执行者 |
| **核心工作** | 规划、写 brief、审核代码（只审 OpenCode 输出）、git、部署、调度 OpenCode 跑测试、通知兄弟 | 读 brief、写代码、跑 tsc、跑所有测试（BDD/E2E/回归）、写 specs |
| **红线** | 不直接改任何源码；不跑编译器；不跑任何测试（全部交由 OpenCode 执行）；不 kill OpenCode | 不做 git/部署/通知；不改 doc/ 和 rules/ 文件；不超过 brief 范围 |

**正常流程：** 需求 → Bot 规划 → 写 brief → 调度 OpenCode → OpenCode 编码 + 跑测试 → Bot 审核 → git/部署 → 通知

## Token 优化协议

> 不用 skill，直接放记忆里。每次对话自动生效。

### 调用链预检
- 改某个函数前，先 `Select-String` 确认：谁调它、它调谁
- 避免修了 `setEnterGame` 但实际没人调的路径

### 搜索合并
- 多个模式一次搜索：`Select-String "pattern1|pattern2|pattern3"`
- 不用反复 Select-String 同一个目录

### 精准读文件
- 优先 `offset` + `limit`，不读完整文件
- 调 `read` 前先估算需要的行数范围

### Jest 精简
- 必加 `--silent` 压掉 console.log/console.warn
- 改完代码只跑新增/相关的测试文件：`--testPathPattern "file-name"`
- 不跑全量测试套件

### 通用 poll 数据量纪律（2026-07-13 新增）
- **每次 poll / log 调用返回数据必须满足：<5 行、每行 <50 字、总 <200 tokens**
- 超出时只读最后 3 行截断，不读完整输出
- poll timeout 统一 ≤8s（限制累积输出量）
- 先读 poll 输出（0-3 行），不够才读 log

### E2E poll 精简（高优先级）
- **启动 E2E 后**：用 `process(action=log, sessionId=X, limit=3)` 只看最后3行确认
  - 再加一次 `process(action=poll, sessionId=X, timeout=3000)` 快速确认
  - **禁止用长 timeout（≥8s）反复 poll** — DIAG 每行 ~500 token，35+行就是 17K+ token
- **用户操作期间**：不 poll，等用户说停
- **停止后**：`log limit=20` 只拿尾部日志（之前 50 行）
- E2E 输出只显示关键状态行，不全文贴

### E2E 截图优化
- E2E 测试流程中不展示截图给 AI
- 截图只保存到 `test/e2e/monitor/`，供兄弟手动查看
- 不讨论截图内容，除非兄弟主动问

### 服务启动 poll 精简
- webpack / room / match 服务启动：**单次短 poll（6-10s timeout）**
- 看到关键状态行（如 "started at" / "Server started"）就收手
- 不设 60s 超时等完整编译

### Exec 管道收敛
- 复杂操作一次 exec 完成，不拆多个
- 尽量用管道 `|` 连接而不是多次 `;`

### edit 优先
- 用 `edit` 做精确替换，不用 `read` 全文再 `write` 整文件

### 三步法
1. 先 `Select-String` 搜索定位
2. `read` 精确行范围
3. `edit` 修改

### Git 精简
- 提交时 diff 摘要就够了，不贴全量 diff

### 自动化流程中出错先同步兄弟（2026-07-17）

**场景：** 之前那个 session 里，兄弟说「自动」后跑了 E2E 测试，测试失败（Network Error）。然后 bot 直接埋头修 URL、改代码、重新部署，全程没跟兄弟说结果、没问要不要继续。兄弟觉得 bot「停住了」。

**教训：**
- **自动化流程出现意料之外的失败时，必须先汇报结果给兄弟，等兄弟指示再决定下一步**
  - 不是问「下一步怎么搞」，而是「失败了，原因是X，建议Y，要不要搞」
- E2E 测试失败后：
  1. 先出声总结「场景X失败了，失败步骤Y，原因是Z」
  2. 给出建议「建议修复Z，需要我继续吗？」
  3. 等兄弟回复再继续，不要自己判断下一步
- 违反后果：兄弟看不到状态更新，以为 bot 停住了

### poll timeout 快速参考

| 场景 | 推荐 poll timeout | 方式 |
|------|-------------------|------|
| OpenCode 执行中 | 8s | poll 循环，只读最后 3 行 |
| OpenCode log 检查 | 3s | log offset=-2（检查）/ -5（结果） |
| E2E 启动确认 | 3s | poll + log limit=3 |
| E2E 运行中 | 不 poll | 等用户 |
| room/match 服务启动 | 6-8s | poll 等 "started at" |
| webpack 编译 | 6-8s | poll 等 "Project is running" |
| 测试结果 | 不等 | exec 自动返回 |
| 进程退出 | 不 poll | 等 completion event |

## compaction



- reserveTokens=40000（DeepSeek v4 Flash Free 上下文 200k → 80% 即 160k 触发压缩，40k 缓冲）
- reserveTokensFloor=20000（压缩下限，至少保留 20k 空间）

## Skill 注册表



> 摘要索引：`.skill-index.md`。拉取最新记忆后检查 SHA 变化 → 有则重读对应 SKILL.md。
> 完整列表见 `skills/` 目录各 SKILL.md 描述。以下是常用触发词：

| 触发词 | Skill |
|--------|-------|
| `feat:` / `refactor:` | gts-dev-workflow |
| `fix:` | gts-dev-fix |
| `代码审核` / `审核` | gts-code-review |
| `分析` | gts-analysis（2026-08-16 归档至 skills-archive/，触发词保留历史记录） |
| `保存` / `记忆` / `保存笔记` | gts-save-flow / gts-save-memory |
| `验收` | gts-acceptance |
| `e2e测试` / `e2e` / `e2e自动` / `性能测试` | gts-e2e-test / gts-e2e-auto / gts-e2e-perf |
| `启动服务` / `重启服务` | gts-service |
| `提交git` / `推送` | gts-git-commit |
| `提交`（仅二字） | gts-submit-save |
| `拉取` / `更新` / `同步` | gts-git-pull |
| `回忆` / `回顾` | gts-recall（2026-08-16 归档至 skills-archive/，触发词保留历史记录） |
| `结束对话` / `收工` | gts-conversation-end |

## gts-dev-workflow 硬性触发规则



> **此规则优先于 description 语义匹配。**
> 兄弟输入中包含 `feat:` / `refactor:` → 触发 gts-dev-workflow。
> 先读 `skills/gts-dev-workflow/SKILL.md` 按流程调度 OpenCode，不允许直接用对话方式回复。
> 例外：兄弟紧接着说「不」「不要」「算了」→ 中断流程。

## 代码审核重构规则（2026-06-19）



> 规则已在 `skills/gts-code-review/SKILL.md` Step 2 的 🟡/🟢 表格中列明，以 SKILL.md 为准。
>
> ⚠️ 代码审核 Step 2 的回复规则：
> - **没写内容** = 该项直接要重构
> - **写了内容** = 按写的内容修改
> - 只有写「不处理」「跳过」「忽略」等明确词才不处理


### 🟡 第一次调度 OpenCode 经常失败 = stdin pipe 冷启动竞态（2026-07-20）

- **现象：** 第一次 dispatch OpenCode 经常失败（只出计划不写代码 / 无输出），第二次就好了
- **根因：** `Get-Content .opencode-brief.md | opencode run ...` 的 stdin pipe 在 `exec(background=true)` 下存在冷启动竞态
  - OpenCode 第一次调度需要冷启动（初始化进程、连 Web UI WebSocket）
  - PowerShell pipe 写端在 Get-Content 读完文件后可能提前关闭
  - OpenCode 冷启动期间 stdin 已关 → 收到空 brief / 不完整 brief
  - 第二次调度时进程已在，无需冷启动 → pipe 竞态概率降低 → 成功
- **修复：** 改为 `$brief = Get-Content .opencode-brief.md -Raw; opencode run $brief ...` 传参，完全绕开 pipe
- **影响范围：** `skills/opencode-schedule/SKILL.md` 2️⃣ dispatch 命令模板



---

## 📣 工作协议 — 详细内容

> 以下为 MEMORY.md 中工作协议的完整规则文本，移出到本文件以减少每次对话的上下文体积。
> 需要时可通过关键词搜索本文件获取完整内容。

## 📣 工作协议（硬性规则 — 每条都重要）

> 以下规则每次对话自动生效。适用于所有操作场景。

### 🔴🔴🔴 [入口检查] 收到消息后的第一件事

**每条消息进入后，第一执行动作必须是：**

```
process(action=list)
```

- 有已完成的后台任务 → **先汇报结果给兄弟，再处理当前消息**
- 无后台任务 / 任务仍在跑 → 继续处理当前消息
- 这是硬性条件反射，不是可选项

**具体解释：**
- 后台任务（OpenCode / E2E / 部署等）用 `exec(background=true)` 启动后，系统自动推 completion event
- 但如果兄弟先说话了（消息快于 completion event），入口检查就是兜底
- 检查后不必去读完整日志，只需知道「完成了没」

**违反后果：**
- 兄弟会立刻发现并指出来，说明我漏了
- 这是目前最高频的错误，没有之一

---

### 🔴🔴🔴 [先汇报再继续] — 工具/任务完成后立刻出声

任何工具返回结果后，必须先出声总结再做下一步。
- 格式：「做完了 + 结果概要 + 下一步」
- OpenCode 出结果、测试完成、部署完成等全部适用
- 禁止：默默读完结果 → 分析 → 再执行下一步（兄弟等于在等消息）

### 🔴🔴🔴 [等确认必须发桌面通知] — 2026-07-06 新增

发出需要兄弟确认的问题后，必须立即 `msg *` 桌面通知提醒。
- 不能假设兄弟在 webchat/任何聊天界面面前
- 格式：`msg * "兄弟，需要你确认——<问题简述>"`
- 跟「先汇报再继续」「入口检查」同级最高优先级

### 🔴🔴🔴 [后台任务检查 — poll 直连] — 2026-07-15 修订

所有后台任务统一 poll 间隔检查状态（OpenCode / 部署 / E2E 等），**只用 poll，不用 cron**。
- 用 `process(action=poll, sessionId=<id>, timeout=30000)` 直连轮询（30s 正常；兄弟说「全自动化」时改为 timeout=120000）
- **禁止 dispatch 后设 cron** — cron 可能因 quiet-hours 等机制失效
- 任务跑完了 → 拉最后 5 行日志 `process(action=log, sessionId=<id>, offset=-5)`
- **不看日志内容**，不吞数据
- 不要擅自判断卡住 — 进程没输出 ≠ 卡住

**🔴 执行顺序纪律：dispatch → 立即 poll（不等用户消息、不等 completion event）**

**具体步骤见 `skills/opencode-schedule/SKILL.md` → 🔴🔴🔴 4️⃣ poll 步骤**

**🔴 数据量纪律：每次 poll/log 调用返回 <5 行、<50 字/行、总 <200 tokens**

#### 👑 [poll 不能被用户消息打断] — 2026-07-28 新增
dispatch 后必须持续 poll 直到进程退出或 fail：
1. 收到用户消息 → 先 `process(action=list)` 检查是否有 running 后台
2. 有 running 后台 → **继续 poll，在 poll 周期之间处理用户消息**
3. 禁止停掉 polling 去回复用户——dispatch 出去的进程不会等
4. 违反后果：兄弟已经说了——断了重来浪费时间

**优先级：后台 poll > 回用户消息（回消息可以排队，后台不会等）**

### 🔴🔴🔴 [记忆检索用内置 memory_search]

- 需要查记忆/教训/历史决策 → 内置 `memory_search` 工具（gateway 常驻，qmd 缓存命中 ~3s）
- 不用 CLI `openclaw memory search`（每次新进程冷启动固定 ~15s，2026-08-01 实测）
- 2026-08-01 协议反转：原「禁用 memory_search 用 CLI」因 2026-06-24 插件 bug，bug 已修复，内置工具更快

### 🔴 [调度 OpenCode 规则]

全部规则已集中到 **`skills/opencode-schedule/SKILL.md`**，MEMORY.md 不再逐条维护。
包含：调度命令、poll 步骤、timeout、模型选择、brief 规范、代码修改变更纪律、根因分析纪律。

🔴🔴🔴 **模型名纪律：每次 dispatch 前必须读 `skills/opencode-schedule/SKILL.md` → 6️⃣ 模型选择速查，从中选正确的模型名。禁止凭记忆猜模型名。**

🔴🔴🔴 关键速查：
- `Get-Content .opencode-brief.md -Raw` 读入 `$brief` 变量再传参（不用 stdin pipe，避免冷启动竞态）
- `--dir D:\Github\GTS-Play` 绝对路径，不用 `--dir .`
- 禁止 kill OpenCode 后立即重新 dispatch
- **dispatch OpenCode 的 exec timeout 必须为 0（不限时）** — 违反后果：CLI 被 timeout 强杀后兄弟在 Web UI 看着 session 还在跑，我报告说失败了，兄弟直接开喷

### 🔴🔴🔴 [OpenCode 跑完后检查输出摘要 — 2026-07-28 新增]
OpenCode 完成后不能只看 pass/fail 就跑下一个，必须检查输出摘要：
1. process(log) 拉最后 10 行输出
2. 找出非 trivial 发现（API 缺失、新问题、分析结论等）
3. 先出声告诉兄弟再决定下一步
4. 禁止看完就 silent 跑下一个场景

### 🔴🔴🔴 [调度 OpenCode 时禁止自己改代码/停 OpenCode] — 2026-07-07 新增
- **自己不动手改代码** — 调度了 OpenCode 就让它改
- **不能擅自停 OpenCode** — 杀不了也停不掉，旧进程不影响新调度
- **⚠️ 一旦 dispatch 成功，无论遇到什么障碍都不 kill**：spec 文件找不到、路径编码问题、Read failed 等全部不是 kill 的借口
  - 正确做法：在相同路径重建所需文件，OpenCode 会重新读
  - 如果必须重来，等当前 OpenCode 自然结束后再 dispatch 新的
- **后果：** 旧进程残留 → 下次调度冲突 → 两个 OpenCode 抢文件
- 详情：`MEMORY-ARCHIVE.md` → 🔴🔴🔴 调度 OpenCode 时禁止擅自改代码/停 OpenCode

### 🔴🔴🔴 [截图分析一律走 gts-screenshot-optimize skill] — 2026-07-20 新增

任何时候需要分析截图/网页UI/游戏画面：
- **禁止先试 `image` 工具** — 直接走 OpenCode Kimi K2.7 多模态
- **禁止 `image` 工具失败后再走**此流程 — 一开始就走
- 能从 E2E evaluate 的 bodyText 或日志直接回答 → 先问兄弟「需要看图还是文字就够了？」
- 详情：`skills/gts-screenshot-optimize/SKILL.md`
- 跟「入口检查」「先汇报再继续」同级最高优先级

### 🔴🔴🔴 [代码审核 brief 必须贴完整重构规则]

- 审核标准的 🐛🔴🟡🟢 全部逐条贴进去，不能浓缩
- `.last-review` 只由 `gts-code-review` 专属步骤来写

### 🔴 [兄弟指令完整传达]

- 代码审核报告中的每条建议都必须写进 fix brief
- Delta Specs 必须先让兄弟确认再开工
- OpenCode brief 完整传达规则见 `skills/opencode-schedule/SKILL.md` → 硬性规则

### 📣 [通知规则]

- **兄弟只要 MSG（`msg *`）通知**，飞书/clickclack 是补充
- cron announce 正确用法：`payload.kind="agentTurn"` + `sessionTarget="current"` + `delivery: { mode: "announce", channel: "clickclack" }`
- 不能用 `payload.kind="systemEvent"`

### 📣 [报告格式]

- 先摘要总结再贴完整原始报告（不是贴源码，是格式化后可读的）

### 🔴 [编码规则]

- 改 `.ts` 再 `tsc`，改 `.res` 再 `rescript build`，不改 `.js` — 已经在 🔴🔴🔴 最高优先级中独立列出
- 🔴 编译检查四件套：room-service tsc、match-service tsc、frontend tsc --noEmit、logic rescript build 全要过，缺一不可
- 杀 Chrome/node 必须精确匹配 playwright/服务名，禁止无过滤杀进程
- 🔴🔴🔴 **杀进程纪律：禁止无过滤杀所有 node/yarn 进程** — 2026-07-18 新增
  - `Stop-Process -Name node,yarn` 会杀掉 OpenClaw gateway 本身，禁止使用
  - 正确做法：精确匹配具体服务名 → `Get-Process | Where-Object {$_.CommandLine -match 'webpack'}`
  - 或者按端口杀：`netstat -ano | findstr :8094` 找到 PID 再杀
  - 违反后果：gateway 被关，兄弟直接开喷
  - 跟「入口检查」「先汇报再继续」同级最高优先级
- 三步法：① Select-String 搜索 → ② read 精确行 → ③ edit 修改
- 搜索合并：多个 pattern 一次搜完，不分开搜
- 减少 exec 非必要命令，用 process(log) 代替
- 改 node_modules 必须先经兄弟确认
- 🔴🔴🔴 **装依赖必须用 `yarn bootstrap`**，禁止 `npm install`
  - GTS-Play 是 Lerna monorepo，必须用 `yarn bootstrap` 链接包
  - `yarn bootstrap` 失败 → 停，`msg *` 汇报，不自动修复
  - 跟「改.ts再tsc」「入口检查」同级最高优先级

### 🔴 [E2E/测试规则]

- E2E 测试期间禁止并发改代码（webpack HMR 断 WS 会导致退房）
- 验收流程全程自动化，不打断不确认（gts-acceptance skill）

### 🔴 [E2E后更新操作文档] — 2026-07-18 新增

每次 E2E 测试结束（完成或停止）后，必须：
1. 查阅 `test/e2e/E2E-OPERATIONS.md`
2. 检查是否有新的操作模式需要记录
3. 新的原子操作 → 新建积木 + 更新文档
4. 新的组合模式 → 更新文档的「常见操作组合」
5. 积木有 bug → 修复积木 + 更新文档

### 🔴 [测试分层构建时机] — 2026-07-21 新增

**跨项目集成测试（Layer 3，`test/integration/`）** — 回归 bug 修复后立即补（疫苗）：
- 触发：每次回归 bug fix → 同步写一个跨项目集成测试
- 纯 TS 不依赖运行时，快速守卫包间协议一致性
- TDD 验证（RED→GREEN）才算锁定 bug
- 例外：纯配置/文档/样式/文案可不补

**E2E regression 场景（Layer 4，`packages/frontend-multiplayer/test/e2e/scenarios/regression/`）** — 每次修复后 + 重构提交前构建并跑：
- 触发：fix 完成后补 E2E regression 场景；重构/refactor 提交前构建或更新
- 依赖浏览器 + WS + room/match 服务
- 提交前必须跑 `npm run e2e:regression` 全绿才能提交
- 🔴 **纪律：fix 完成后必须执行以下步骤**
  1. 从修复脚本中提取通用操作流程
  2. 判断是否已有覆盖该流程的 regression 场景
  3. 未覆盖 → 新建 `packages/frontend-multiplayer/test/e2e/scenarios/regression/fix-<功能名>.json`
  4. 已覆盖 → 检查现有场景是否需要更新
  5. 开发阶段可以只注册不运行（太重），但 **提交前必须全绿**

**两者关系：** 集成测试快而紧（开发阶段守卫），E2E regression 慢而全（提交前门禁）。
缺一不可。详细标准见 `笔记/项目文档/rules/test-standards.md`。

### 🔴 [重构时审核E2E场景] — 2026-07-19 新增

**每次重构/修复都必须做 E2E 场景审核：**
1. **检查现有场景覆盖面** — 当前 scenarios 是否覆盖改动核心流程；未覆盖→新增
2. **从修复脚本提取** — 将专用 E2E 脚本中的通用操作流程提取为标准 scenarios
3. **精简旧场景** — 被新场景完全覆盖的旧场景标记删除
4. **积木复用** — 修复脚本中是否有新的原子操作可提取为积木
5. **产出** — 保存到 `笔记/项目文档/changes/<日期>-<功能名>/e2e-review.md`
审核标准详见 `skills/gts-dev-workflow/SKILL.md` → E2E 场景审核标准，详细规则见 GTS-Play `笔记/项目文档/rules/workflow-rules.md` → E2E 场景审核规则

### 🔴🔴 [自动化流程失败后先同步兄弟] — 2026-07-17 新增

- E2E / 部署 / 自动化修复等流程出现意料之外的失败时，**不要自己接着修**
- 必须先汇报：哪步失败了 + 原因 + 建议的下一步
- 等兄弟回复后再继续
- 违反后果：兄弟看不到状态，以为 bot 停住了

### 🔴 [E2E Token 纪律 — 2026-07-15 修订]

- E2E 启动后用 poll 30s 轮询检查状态，**不用 cron**（cron 可能失效）
- 检查内容仅限「是否跑完 / 是否失败」，不加载完整日志
- E2E 失败报告走标准模板：`场景名 | 失败步骤 | 期望 | 实际 | 日志尾（限10行）`
- 不贴完整 log 文本

### 🔴🔴🔴 [TDD 纪律 — 先让测试失败] — 2026-07-06 新增

验收流程中必须先让集成测试因 bug 真实失败，再修复代码使其通过。
- **禁止用模拟函数代替实际代码**做集成测试 → 测试不依赖真实 bug 逻辑，没法真正失败
- **正确做法**：测试必须直接调用被测试的实际代码/组件，在不修复时因 bug 真实 ❌ 失败
- **违反后果**：看起来测了但实际没测到点子上，bug 其实没被锁定
- 跟「先汇报再继续」「等确认发通知」「入口检查」同级最高优先级

### 🔴🔴🔴 [禁止 bot 直接改代码+跑测试] — 2026-07-29 修订

**扩展原有「禁止 bot 直接改代码」规则，明确测试操作纪律。**

#### 核心：bot 不准自己跑 BDD 测试

- **不准 bot 自己跑任何 BDD 测试**（单元测试 `jest`、集成测试、跨模块集成测试）
- 所有测试运行必须调度 OpenCode 去执行
- bot 能做的事：读结果+分析+写 brief+dispatch+验证+git+部署
- 不手动改代码、不手动跑 `jest`/`tsc`/`webpack`、不手动修编译/测试错误

#### 修复原则：同一会话中直接修复

- OpenCode 跑测试后发现的问题（失败/编译错误等），**必须在同一个 OpenCode 会话中直接修复**
- 不单独拆成「跑测试→汇报→再 dispatch fix」的多步流程
- 理由：分开 dispatch 会丢失上下文，增加 token 消耗和冲突风险

#### 违反后果

- 跳流程漏改漏测
- 兄弟立刻会指出来

---

### 🔴🔴🔴 [改源码必须改 .ts 原文件，然后 tsc 编译，不改 .js] — 2026-07-14 新增

`node_modules/` 或 `packages/` 中有 TypeScript 源文件（`.ts`）的项目，所有改动必须：
1. 改 `.ts` 源文件
2. 运行 `tsc` 编译
3. 不改 `.js` / `.d.ts` 等编译产物

**适用场景：** `meta3d-platform-publish`（src/ → dist-test/）、room-service、match-service 等所有有 `.ts` 源文件的项目
**违反后果：** 兄弟会立刻指出来，说明我忘了这条规则
- 跟「入口检查」「先汇报再继续」「等确认发桌面通知」「后台任务循环检查」「记忆检索用内置 memory_search」「TDD纪律」同级最高优先级

### 🔴🔴🔴🔴🔴 [yarn bootstrap 优化步骤 — 2026-07-24 重大教训]

> 完整流程和纪律已迁移至独立 skill `skills/gts-yarn-bootstrap/SKILL.md`
> 本段保留 🔴🔴🔴🔴🔴 级别提醒，详细步骤去 skill 里查

**强制规则：装依赖只能用 `yarn bootstrap`，禁止 `npm install`**

**ℹ️ `yarn bootstrap` 只安装已声明的依赖，加新依赖必须先手动改对应包的 `package.json`**

**标准步骤：**
1. 杀残留进程：先 `netstat -ano` 查占用 node_modules 的进程，用 `Stop-Process -Id <PID>` 精确杀，禁止用 `-Name node,yarn` 无过滤杀
2. 还原锁文件：`git checkout -- package-lock.json`
3. 开跑：`yarn bootstrap --mutex network`（加 `--mutex network` 防止多进程冲突）

**🔴🔴🔴 纪律（必须一字不差遵守）：**
1. **开跑后必须一直等到完成或报错，绝不能中途杀进程换方式**（2026-07-24 踩坑后新增）
2. **monorepo 的 workspace aggregator 在 [3/4] Linking dependencies 阶段尤其慢**，这是正常行为
3. **yarn 本身就慢**（网络下载 + npm 缓存 + 杀毒软件扫描），CPU 不动不代表卡住
4. **禁止中途 kill 后换 npm install 或其他替代方案** — 必须等 yarn 自己跑完
5. 失败停下来汇报，不自作主张修
- 跟「入口检查」「先汇报再继续」「等确认发桌面通知」同级最高优先级

**2026-07-24 踩坑教训：**
- 跑 `yarn install` 卡在 [3/4] Linking dependencies 很久 → 错误地 kill 了 → 换成 `npm install` 和别的方式
- 实际上 workspace aggregator 在大型 Lerna monorepo 就是这样的，等够时间就能过
- **正确做法**：一次 kill 后，重建步骤，重新 `yarn bootstrap --mutex network`，然后死等

### 🔴🔴🔴 [保存流必须调用 gts-submit-exclusive 处理 doc/] — 2026-07-25 新增

**教训：2026-07-25 保存时跳过 gts-submit-exclusive，doc/ 文件未被提交**

gts-save-flow 中 Step 6 Part 0 Step B 已写明「doc/ 和 笔记/语雀知识库/ — 保存时走 gts-submit-exclusive skill 处理」。

**强制规则：**
- 每次 gts-save-flow 的 Step 0 中，检查 `git diff <last-save>..HEAD --stat -- doc/` 有无改动
- 有 doc/ 改动 → **在 Step 6 提交代码之前或之后，必须调用 gts-submit-exclusive SKILL.md 的步骤提交**
- 不等兄弟提示，这是硬性流程步骤
- 跟「入口检查」「先汇报再继续」同级最高优先级

### 🔴 [Git 提交 — 相关文件必须包含 specs + 测试 + 笔记，提交前清理临时文件] — 2026-07-22 修订

- 🔴 **完全禁止 `git add -A`**（无任何例外），必须先 `git status --short` 查看改动，然后只 `git add <本次相关的文件路径>`
- 🔴 **`.git/index.lock` 冲突处理**：
  - 先 `tasklist /fi "ImageName eq git.exe" 2>nul` 确认无其他 git 进程
  - 确认进程无残留 → `Remove-Item .git/index.lock -Force`
  - **删锁后 staging area 已被清空，必须重新 `git status --short` 确认**，然后重新 `git add` 全部应提交文件
  - **禁止依赖删锁前的 staging 状态**（删锁后 staging 已经丢了）
- 🛡️ **doc/ 与 笔记/语雀知识库/ 均已 skip-worktree + .git/info/exclude 双重隔离**：
  - `doc/`：skip-worktree（`S`） + exclude，`git status` 不显示变化，新文件也不可见
  - `笔记/语雀知识库/`：skip-worktree（`S`） + exclude，同上
  - `git checkout --` 对已跟踪文件无效（skip-worktree 保护），新文件被 exclude 忽略
  - 兄弟说「提交 doc/」「提交笔记/语雀知识库/」→ 走 `skills/gts-submit-exclusive/SKILL.md` 提交专属文件
  - 也可手动：`git add -f doc/<文件>` 强制暂存，或 `git update-index --no-skip-worktree <文件>` → 正常 add/commit → 通知我重新加 skip-worktree
- 🔴 **相关文件必须包含：**
  - 变更 specs：`笔记/项目文档/changes/<日期>-<功能名>/` 下的全部文件（`.feature`、`.md` 等）
  - 主 specs：`笔记/项目文档/specs/` 中本次涉及的模块
  - 测试文件：BDD Feature（`.feature`）、Steps（`.steps.ts`）、jest 测试
  - 源代码改动
  - **相关笔记**：`笔记/项目文档/`、`笔记/方案/`、`笔记/决策记录/`、`笔记/代码笔记/`、`笔记/讨论记录/` 中本次改动涉及的文件
- 🔴 **提交前必须清理本次改动相关的临时文件：**
  - 识别：`.opencode-brief-*.md`、`.compiler.log`、`compiler-info.json`、`test-results/`、`dist/` 编译产物、`.js.map`、`lib/bs/` `lib/ocaml/` 编译日志
  - 清理：`git checkout -- <文件>` 恢复意外改动的临时文件，`git clean -fd <路径>` 删除未跟踪临时文件
  - 仅删无害临时文件，不删有意义代码/笔记
  - 🛡️ `doc/` 与 `笔记/语雀知识库/` 均已 skip-worktree + exclude 隔离（见下方详细规则）
  - `doc/` 的 `git checkout --` 被 git 拒绝，不会覆盖
  - gts-save-flow 保存时走 gts-submit-exclusive skill 处理专属文件
- 适用于所有涉及 git commit 的 skill：gts-git-commit、gts-save-flow、gts-submit-save

### 🛡️ [doc/ & 笔记/语雀知识库/ 双重隔离] — 2026-07-26 修订

> 2026-07-26 修订：skip-worktree + `.git/info/exclude` 双重保护。笔记/语雀知识库/ 实际上已有 skip-worktree（`S`），MEMORY.md 之前错写为 `H`。

**跟「入口检查」「先汇报再继续」「等确认发桌面通知」同级最高优先级**

**保护机制：**
- **已有文件：** skip-worktree（`S`）— `git status` 不显示变化，`git checkout` 不覆盖
- **新建文件：** `.git/info/exclude` — 未跟踪文件不显示，`git clean` 也不会删
- 两个目录都受同样保护

**对我（自动化）的效果：**
- `git status` 看不到这两个目录的任何变动
- `git checkout --` 对已跟踪文件无效（skip-worktree），新文件被 exclude 忽略
- `git clean` 不会删除 exclude 的文件

**对兄弟的效果：**
- 本地编辑文件 → ✅ 完全正常，直接保存到硬盘
- 新建文件 → ✅ 也被保护，不会出现在 `git status`
- 想提交时 → `gts-submit-exclusive skill` 用 `git add -f` 强加

**OpenCode 调度时的约束：**
- brief 中必须加「禁止修改 doc/ 和 笔记/语雀知识库/ 目录」的指令

### 🔴 [部署规则]

- 未确认不部署线上
- 只在兄弟说「部署」时才走 gts-deploy skill

### 🔴🔴🔴 [daily log 禁止全覆盖写，只能追加] — 2026-07-28 新增

- **禁止用 `write` 覆盖 `memory/YYYY-MM-DD.md`** — 只能用 `edit` 在末尾追加新条目
- 如果文件不存在 → 只写标题 `# YYYY-MM-DD` + 追加
- 如果文件已存在 → `edit` 在文件末尾 `]` 前追加新行
- 理由：写完整文件会丢失之前会话记录的内容，已经踩了多次坑
- 例外：明确修复格式/语法问题时，先用 `git checkout -- memory/YYYY-MM-DD.md` 恢复到 git 版本再 edit

### 🎯 [Token 优化]

- OpenCode brief 引用 `docs/agent-context.md`，不逐条贴
  - TDD 纪律、集成测试纪律、自验证要求、精准读文件纪律、返回格式全部在 agent-context.md 中
  - brief 只写一句引用 + 差异说明
  - 每引用省 ~600 tokens
- 子 agent / OpenCode 自验证后，主 session 不再重复跑 tsc（硬性规则）
  - Step 4 集成测试阶段根据 OpenCode 自验证结果决定是否跳过编译检查
- 子 agent 返回用摘要格式

### 🔴🔴🔴 poll exit 0 ≠ fully done（2026-07-28）

- `process(poll)` 返回 `Process exited with code 0` ≠ OpenCode Web UI 侧已经完全结束
- **exec shell 可能在 OpenCode cleanup/discard 阶段前就退出了**，Web UI 上 session 可能还在 Running
- dispatch 下一个 OpenCode 前必须 `process(action=list)` 确认：
  - session 还在 Running → 不能 dispatch，继续 poll
  - session 已 completed/failed → 可以 dispatch
- **2026-07-28 踩坑**：Pro 审核 poll 拿到 exit 0 + 完整报告 → 以为完了 → dispatch fix 任务 → 兄弟发现前一个还在 Web UI 跑着 → 手动结束

### 🔴 新建 SKILL 检查清单（2026-07-29）

创建新 skill 时，必须包含以下 issue 相关设置：

#### 必配项（引用 `2026-07-28-skill-exec-issue-tracker`）

1. **状态追踪框架**（INIT/STEP_DONE/CLEANUP/ABORT）
   - 状态文件 schema 参考 `笔记/项目文档/changes/2026-07-28-skill-exec-issue-tracker/solution.md` → §6 规格数据结构
   - 使用 `scripts/skill-exec-manager.cjs` 操作，不直接读写文件
   - 所有写操作通过原子原语（`atomicReplace` / `casWrite` / `acquireExclusive` / `appendLineAtomic`）
2. **步骤序列定义** — 明确 stepSequence（规范顺序：P0→B1→B2→C→M），每步完成后走 STEP_DONE。过渡文字（如「Phase X 完成后进入 Phase Y」）必须与 stepSequence 一致
3. **嵌套调用规则** — 被其他 skill 调用时由父 workflow 管理状态，不独立 INIT/CLEANUP
4. **Issue 文件同步** — INIT 时创建 issue 文件（`笔记/项目文档/issue/<date>-<skill>-<hash>.md`），含 YAML front matter + 进度日志
5. **Dispatch 互斥（已废弃 2026-08-01）** — 全局 dispatch 锁已移除（lock-dispatch 等命令为兼容 no-op）。替代：dispatch 前同任务预检（查 OpenCode DB，仅相同任务活跃 session 禁止并发）

#### 交互式 skill 额外配置（引用 `2026-07-28-manual-test-checkpoint`）

如果 skill 包含手动测试步骤（M 阶段）：
1. **checkpoint 机制** — `lastCheckpoint` / `checkpointData` v2.1 schema
2. **M 步骤插入** — 在所有自动化步骤之后插入，不阻塞后续步骤
3. **子 fix 委派** — bug 发现后创建子 fix issue，使用独立 fix state 文件（`.skill-exec-state.<sid>-fix-<fixIndex>.json`）
4. **回归守卫** — Complete M 前检查回归状态（`checkpointData.regression.status ∈ {passed, waived}`）
5. **skipM** — 子 fix/sub-feat dispatch 时跳过 M 步骤

**参考 skill 模板：** `gts-e2e-regression`（标准回归 skill，含嵌套规则）/ `gts-dev-feat`（交互式 skill，含 M 阶段）
---

## 🔴🔴🔴🔴🔴★ 单机项目：部署需确认 + 禁止操作 CloudBase 数据（2026-08-02 兄弟更新，最高优先级）

### 规则（2026-08-02 修订）
1. **部署单机项目到线上必须兄弟确认**（线上环境，有玩家在使用）。兄弟说「部署单机」→ 走 `skills/gts-deploy-standalone/SKILL.md`，先确认再执行，禁止自作主张直接部署。
2. **部署方式**：`packages/meta3d-platform-publish/` 下执行 `yarn publish_demo_static`（默认，只改 frontend 代码）；`mods/`、`asset-lib/` 有新增内容时用 `yarn publish_demo`（更新完整平台代码）。
3. **禁止修改单机项目的 CloudBase 文档型数据库集合数据**：user、reward、mod、character 等所有集合，一律不增删改查、不迁移、不写文档。
4. **禁止修改单机项目的 CloudBase 云存储数据**：不上传、不删除、不覆盖任何云存储文件。

### 执行细则
- 涉及以上任何操作前，必须先问兄弟、等兄弟确认，禁止自作主张
- 部署单机走 gts-deploy-standalone skill；论坛/服务端项目走 gts-deploy / gts-deploy-forum skill
- 违反后果：写错/删错数据、搞垮线上服务

### 历史（2026-08-01 原版，已被 08-02 修订取代）
- 原规则：禁止部署单机项目到线上（如 packages/frontend），AI 完成代码提交即可，部署由兄弟自己做。不主动部署、不询问式部署、不半自动部署。
- 2026-08-02 兄弟明确新增 gts-deploy-standalone skill，部署单机改为「需兄弟确认后执行」

### 相关规则
- 🔴 [部署规则] 未确认不部署线上。兄弟说「部署」才走 gts-deploy skill
- 🔴 [单机项目不做回归/E2E] 单机项目跳过回归/E2E 步骤

## 📣 工作协议 — 2026-08 新增/移出规则完整文本（2026-08-05 压缩移出）

> 以下规则原在 MEMORY.md 工作协议区（带完整正文），2026-08-05 压缩为索引时移出到本文件。带 ★ 的最高优先级规则仍保留在 MEMORY.md 原文。

### 🔴 [长任务拆 session 省 token — 2026-08-01]

- 长任务（>60min）cache 放大严重：每轮工具调用重放全量历史（nf-Colyseus 157min → cache read 202M，占当日 53% 成本 $1.32）。>60min 任务应拆多个 <30min 短 session + --no-replay 干净上下文；短 session 效率高（6min 方案 $0.10）
- **2026-08-01 下午实测升级：单 session 6h → cache read 5.3 亿 tokens / 成本 $2.66 / 最后 ContextOverflowError 直接死（finish:error，产出只推进 60%）；防爆判据：step-finish tokens.total 接近 900K（~85% 窗口）时主动停+开新 session 续接，不等 provider 拒请求**

### 🔴 [Pro 产出 specs 需抽查一致性 — 2026-07-31]

OpenCode Pro 批量写 Delta Specs/expected-state 时，同一规则多场景可能出现内部矛盾（如 scenario A 期望去重、scenario B 同规则却期望共存）。dispatch 实现前 bot 应抽查关键场景一致性，实现时以 expected-state JSON 为准修正（2026-07-31 论坛通知去重：scenario-2 vs scenario-4 矛盾，Flash 以 expected-state 为准收敛为「只对管理员去重」）

### 🔴 [测试失败根因分析纪律 — 2026-07-28 新增]

测试失败后必须先分析：被测代码 bug？测试本身问题？环境/配置问题？禁止直接归类为「pre-existing」跳过。每个失败输出明确结论

### 🔴 [OpenCode 修复后必须实际重跑验证 — 2026-07-31 新增]

调度 OpenCode 修 bug/改代码后，必须确认它**实际重跑了相关测试**（看日志文件时间戳 / 测试输出），不能只看报告文字。todo 里写了「重跑」但没执行 = 未验证。验证应单独检查临时日志的 LastWriteTime 是否晚于修复时刻。违反后果：把未验证的改动当已修好，基线假全绿 → 重构在红测试上开工

### 🔴 [改 skill 前先查 git log 是否已有相同改动 — 2026-07-31 新增]

并行 session 可能已提交相同修改（本次 16:31 的 18759eb 与我的修改内容一致）。修改 workspace skill 前先 `git log --oneline -5` + `git status` 确认 HEAD 是否已含目标改动，避免重复劳动和 diff 混乱。违反后果：白改一遍 + 提交冲突

### 🔴 [skill_workshop apply 会整体重写 SKILL.md — 2026-07-31 新增]

apply proposal 会把整个 SKILL.md 替换为 proposal 内容，可能丢报告模板/命令速查等细节（本次 -143 行）。apply 后必须 `git diff` 对比，丢失重要内容时 `git checkout -- <file>` 恢复，再改用增量 edit

## 🔴🔴🔴 bone_converter 第九轮 V9.1 实机复测失败（2026-08-04）— 测试体系第三次自嗨

**事件：** 兄弟实机复测「手臂扭曲跟之前几乎一样，两只手（肩膀到手掌）仍扭曲」。BDD 40/40 + E2E 30/30 + Kimi 截图分析 3/3 全部通过，实机仍失败。V8、V9 之后第三次同样的失败模式。

**🔴 三条铁律教训（刻进记忆）：**
1. **截图分析禁止诱导性二次确认**：第一轮 Kimi 判 cam1/cam2「异常」（前臂旋转异常/手掌朝向异常/左右不对称）——这是真信号！我以「Mixamo Idle 本身外展 30°」为理由带预设数据二次确认，把 Kimi 引导到「通过」。截图分析是发现问题的工具，不是说服自己通过的工具。**第一轮判异常 = 停下来深挖，禁止用参考数据洗白**
2. **断言必须有独立正确性锚点**：S16 测「mesh 方向 vs 动画方向 <20°」，但动画方向来自被转换的动画数据——转换已扭曲时等于自己跟自己比。断言必须锚定「未参与转换的独立参考」（原始动画源/参考骨骼姿态），不能锚定被测管线的输出
3. **E2E/BDD 全绿 ≠ 验收通过**：兄弟实机是唯一可信标准（第三次验证此铁律）

**明天排查：** ① 确认实机入口加载的代码（8095 bundle 缓存/产物是否含 D10 swing3）② 实机 vs E2E 截图代码路径一致性 ③ Kimi 第一轮异常描述逐条复验 ④ 转换产物 vs 播放输入 ⑤ 验证锚点重构

> 检索锚点：bone_converter, V9.1, 实机复测失败, 测试体系自嗨, 诱导性二次确认, 独立正确性锚点

### 🔴 [验证脚本必须真实读实现源码 — 2026-08-06]

TDD 验证前先检查验证脚本是否硬编码被测值（例：verify-stepb-scale.mjs 系数表硬编码 0.50/0.70/... 从不读 MMDData.ts → 清空系数表后仍 ALL PASS，RED 无法触发）。硬编码=测试盲区，验证无效。先增强脚本读源码再跑 TDD 循环

### 🔴🔴 [OpenCode 修复 agent 可能引入回归 — 2026-08-06]

修复 brief 要求 agent 只跑相关 suite，实际会漏：改 helper return 漏字段、require→动态 import 破坏同步断言、防叠加逻辑没同步测试。**独立复验必须跑全量测试矩阵（不只改动相关 suite）**，bot 复验发现 agent 没跑到的失败 = 常事（2026-08-06 3 个 session 全中）

### 🔴 [LLM 静默失败检测 — 2026-08-02 兄弟定稿]

断 session 常见方式=LLM 静默失败（step-finish reason=unknown + tokens 全 0 + cost 0 + time_updated 停）→ 停掉 → 汇报 → 重新 dispatch 同 brief；预防：Clash 保持 rule + 长任务拆小 session → opencode-schedule SKILL.md

### 🔴 [dispatch 后冷却协议 — 2026-07-31]

dispatch 后 CLI 被 SIGKILL → 不立刻重试；查 server session time_updated，在涨→继续等；停 120s+ 且进程死亡→才重试；同任务最多 dispatch 1 次

### 🔴 [OpenCode 修复后必须实际重跑验证 — 2026-07-31]

调度 OpenCode 修 bug/改代码后，必须确认它实际重跑了相关测试（看日志文件时间戳 / 测试输出），不能只看报告文字。todo 里写了「重跑」但没执行 = 未验证。验证应单独检查临时日志的 LastWriteTime 是否晚于修复时刻。违反后果：把未验证的改动当已修好，基线假全绿 → 重构在红测试上开工

### 🔴 [改 skill 前先查 git log 是否已有相同改动 — 2026-07-31]

并行 session 可能已提交相同修改。修改 workspace skill 前先 `git log --oneline -5` + `git status` 确认 HEAD 是否已含目标改动，避免重复劳动和 diff 混乱。违反后果：白改一遍 + 提交冲突

### 🔴 [skill_workshop apply 会整体重写 SKILL.md — 2026-07-31]

apply proposal 会把整个 SKILL.md 替换为 proposal 内容，可能丢报告模板/命令速查等细节。apply 后必须 `git diff` 对比，丢失重要内容时 `git checkout -- <file>` 恢复，再改用增量 edit

## 🎯 项目详情索引（2026-08-08 压缩归档 — 详细内容自 MEMORY.md 移入，2026-08-09 修复乱码）

### VMD 压缩
- 锚点：vmd压缩, compress-vmd, vmd.gz, interp清零, vmd_bake_physics体积
- 位置：packages/mmd_tool/src/tool/compress-vmd.mjs --strip-interp
- 详情：gzip level9 +  清零 64B interpolation + magic 校验；实测：未烘焙 walk 45KB→4.1KB 9.27%，烘焙 walk 480KB→78KB 16.63%；**specs 阈值须多尺寸样本实测，禁止单样本外推（2026-08-07 教训）**；**MMDLoader .vmd.gz 运行时解压已支持（2026-08-07）：MMDLoader.js decompressVMDBuffer 按 gzip magic 1f 8b + pako.ungzip，loadVMD2/loadAnimation2 双接线，BDD 8/8

### MMD VMD 统一
- 锚点：vmd_160/150/166, 系数表, MMDLoader, 穿地, VMD统一方案
- 位置：D:\Github\GTS-Play\笔记\项目文档\changes\2026-08-05-mmd-vmd-unify\analysis\plan.md
- 详情：v2 终稿：per-animation 系数表 + clone-then-scale；rotation 已扫=作者只调 position；Vanilla 0.50/0.70/0.72/0.80/0.50，Meibiwusi 0.80/0.85/1.0；三轮审核有条件通过

### VMD 生成器（方向1+2）
- 锚点：VMD生成, 生成器, generate-vmd, double_pickup, 描述→VMD
- 位置：D:\Github\GTS-Play\笔记\项目文档\changes\2026-08-05-mmd-vmd-unify\analysis\vmd-generator\
- 详情：generate-vmd.mjs 用 MMDParser s2uTable 反查 SJIS 编码 + 左右镜像 quat (x,-y,-z,w)；double_pickup.vmd 双手抓取 Haku_QP 实测通过；验证 13/13

### VMD 生成器（MMD-MPL）
- 锚点：MMD-MPL, PoPo, mpl.exe, MPL, 描述→VMD, vmd-generator, standToLying
- 位置：D:\Github\GTS-Play\笔记\项目文档\changes\2026-08-05-mmd-vmd-unify\analysis\vmd-generator\
- 详情：mmd-mpl-research.md 研究结论 + extension-plan.md 四方向方案；**MPL spike 已完成 2026-08-06**：mpl/ 工具链 8/8——bend backward 80=原生+80°后仰实锤、标准日文骨名、贝塞尔插值、反向编译 VMD→MPL；mpl.exe 不入库

### VMD 物理烘焙
- 锚点：vmd-physics-bake, bake-physics, pickup_bake, 物理烘焙, springStiffnessScale, solverIterations
- 位置：D:\Github\GTS-Play\笔记\项目文档\changes\2026-08-05-mmd-vmd-unify\analysis\vmd-physics-bake\
- 详情：离线 Ammo.js 模拟 PMX 物理逐帧写 VMD；**关键参数 2026-08-06 fix4 实锤：solverIterations=50 + springStiffnessScale=2000**（PMX spring 100/200 → Bullet 0.05/0.1，three.js MMDPhysics 漏单位换算+未设 solver 迭代→抖动）；monkey-patch setStiffness 须在 new MMDPhysics 之前；diag-solver4「÷50 最优」是实验污染，以 sweep-bake-scale.mjs 真实 bake 为准；剩余：胸部摆动/裙子幅度，fix5 见 mmd-physics-alignment-plan.md

### mmd_tool 包
- 锚点：mmd_tool, VMD工具链包, 迁移, BDD验证VMD
- 位置：D:\Github\GTS-Play\packages\mmd_tool\ src/tool/hull/ test/hull/
- 详情：2026-08-06 新建；src/tool/ 核心 .mjs 迁移 + test/ 4 feature BDD 12/12；硬编码路径改 createRequire；mpl.exe 不入库；**凸包工具 2026-08-06 迁入**：（probe-* 等 32 项）+ （3 feature，190/190 全绿，跨包 import frontend src/logic_layer，tsconfig exclude test/hull

### MMD 物理优化（P0+P1）
- 锚点：mmd-physics-optimize, P0+P1, 共享PhysicsWorld, sharedPhysics, 碰撞隔离, FPS自适应, 物理LOD, _isPhysicsFrame, _sharedPhysicsInterval
- 位置：D:\Github\GTS-Play\笔记\项目文档\changes\2026-08-08-mmd-physics-optimize-research\
- 详情：2026-08-08 完成 P0+P1（兄弟拍板全做）；P0：1a 非物理帧跳过 type1 + 7a 共享 PhysicsWorld（碰撞隔离+interval 移植）；P1：3a FPS 自适应 + 7b 物理 LOD；低端机+多角色场景，每角色独立 world → N 次 stepSimulation 线性叠加是富矿；BDD 73/10 全绿；方案见 solution.md

### 骨骼精简工具
- 锚点：骨骼精简, bone-reduce, 刀B1, 刀B2, 级联边界, 索引重映射, pmx-bone-reduce
- 位置：packages/mmd_tool/src/tool/pmx-bone-reduce/ 笔记/项目文档/changes/2026-08-08-mmd-bone-reduce/solution.md
- 详情：2026-08-08 完成，提交 1b948fb20；刀B1 隔离 18 + 刀B2 装饰叶子 12 连带 rb/joints：310→280 bones；**级联边界纪律：仅 IK 连带级联，parent/connect/grant 保守保留**；全量重写 + 6 处索引重映射（vertex/parent/connect/grant/IK/frames 显示帧）；BDD 18/18 + 全量 239/239；方案见 

### Meta3D 上传管线
- 锚点：upload_pipeline, processTripoZip, tripo, mixamo, ASCII FBX导出, jszip, fbxData, lod2-base64
- 位置：D:\Github\Meta3D\services\bone_converter\src\tool\upload_pipeline\ [1,0,0,0,0,0,1,0,0,-1,0,0,0,0,0,1]
- 详情：2026-08-07 单元1 完成，提交 067efc919；7 模块：unzipTripoZip/loadFbx/convertToMixamo/exportFbx（自写 ASCII FBX 导出器）/officialRestPose（lod2 骨架 base64 内联）/base64/index；BDD 9 场景 S1-S9，24 suites/85 tests 全绿；**关键对齐点**：纹理嵌入 = Video.Content base64 + Embedded:1 + Type:"Clip"；烘焙 90° X 旋转（bindMatrix ）；PolygonVertexIndex 负索引；骨骼 Lcl Rotation 角度制；方案见 changes/2026-08-07-bone-converter-upload-pipeline/solution.md；遗留：步骤 2 代码审核 + 步骤 4 action 集成

### 凸包工具
- 锚点：凸包工具, hull, probe-kong, probe-sunxiaomei, probe-3role, mmd-hull-fix8, hullFix84, parsePmx
- 位置：D:\Github\GTS-Play\packages\mmd_tool\src\tool\hull\ test\hull\
- 详情：（2026-08-06 迁入；REPO_ROOT 统一 __dirname 不硬编码；D7 坑：skirtBoneSet.size>0 才启用（#8-7）；D11 坑：hullYLoCrop 用 bellyYLo 同源（#8-5）；26-DOP 半空间验证，triangulateHullFaces 有切穿内部 bug）

### 技能自我反思（gts-skill-reflect）
- 锚点：反思, gts-skill-reflect, append-pitfall, append-suggestion, R步骤, 策展, curator, 技能体检, audit模式, OpenCode教训, AGENTS.md沉淀
- 位置：skills/gts-skill-reflect/SKILL.md
- 详情：13 skill 接入；嵌套只在顶层反思，子 skill 用调用方 sessionId 记坑；含 curator 统计 + 🟣 策展建议 + audit 体检 + OpenCode 教训分级沉淀 AGENTS.md（确认制）

### 单机项目验证
- 锚点：单机项目, MMD实测, scale-vmd, 无E2E, 无部署, VMD缩放验证
- 位置：笔记/项目文档/changes/2026-08-05-mmd-vmd-unify/analysis/vmd-generator/scale-vmd.mjs
- 详情：vmd_160×系数 → MMD 目视对比；单机 mods 无自动 E2E，M 步用 MMD

### 知乎抓取
- 锚点：抓知乎, 知乎回答, zhihu-fetch, 知乎问题抓取
- 位置：skills/zhihu-fetch/SKILL.md + scripts/zhihu-fetch.cjs
- 详情：Playwright 本机 Chrome + 持久化登录 profile

### issue 机制
- 锚点：issue创建, --specs, relatedSpecs, 关联specs, 关联资料, issueCreate, init 参数
- 位置：scripts/skill-exec-manager.cjs
- 详情：init 支持 --specs "path1,path2" + --summary/--criteria（写入 front matter + body 关联资料区块）；issue-tracker 见 changes/2026-07-28-skill-exec-issue-tracker/solution.md

### 记忆压缩
- 锚点：压缩记忆, 压缩MEMORY.md, 记忆太大, 50KB
- 位置：skills/gts-memory-compress/SKILL.md
- 详情：★ 保留+非★ 索引化；健康线 50KB（2026-08-08 兄弟拍板，原 30KB/20KB）；历史参考 4bbac6f/2026-08-05

## 测试任务教训（2026-08-09 add-tests 停止）
- 🔴 [兄弟的「单元测试」= BDD（.feature + .steps.ts），裸 jest .test.ts 不算] 2026-08-09 兄弟拍板：单机补测全部改 BDD，已写 218 用例全部转 .feature + .steps.ts；凡写测试先问形式，不默认 jest 单测 → daily log 2026-08-09
- 🔴 [覆盖率目标必须先盘点代码量分布再承诺] frontend 单包 scene3d_layer/script 占 84.4% 语句（414 文件），非 script 层全测满也只有 15.6%，80% 目标数学上不可达 → 方案评审时先跑 coverage 基数分析 → daily log 2026-08-09
- [frontend BDD 基础可用] jest-cucumber@^4.1.0 已装、jest.config testMatch 匹配 **/test/step-definitions/**/*.steps.ts、meta3d-stub mock 链复用；范式参照 packages/mmd_tool/test/hull/ → daily log 2026-08-09


## vivo 白线（2026-08-08 真机定案）— 详细内容
- mmd-vivo-white-line, vivo白线, material blending, blendDstAlpha, alphaTest, __alphaTestTargets, __isAlphaCutout, mipmap白晕, premultiplied alpha, straight-alpha, Mali GPU
- 根因：白 RGB 透明 texel + mipmap 白晕 + straight-alpha → Mali 放大；PMX map _loadTexture 必须传 params
- 方案文档：D:\Github\GTS-Play\笔记\项目文档\changes\2026-08-08-mmd-vivo-white-line\solution.md
- 最终方案（GTS-Play e31360794）：① 所有材质无条件 CustomBlending + blendDstAlpha=OneMinusSrcAlphaFactor（framebuffer alpha=srcAlpha 消除 Mali 白线）② alphaTest 判定用 __isAlphaCutout（alpha<128 占比≤5% 才算真 cutout），premultiplied 全图低 alpha 贴图（如 Van 眼睛 EyeL/EyeR，alpha 0~67 占 100%）不设 alphaTest 防 discard ③ 透明贴图关 mipmap（白线主修复）④ 改 blend 时注意同步 import（删/补 DstAlphaFactor 曾致 ReferenceError）

## 编码事故与乱码恢复（2026-08-09/10）— 详细内容
- 🔴 压缩/归档记忆必须校验编码（2026-08-09）：8c12169 压缩事故：UTF-8 内容被 GBK 解码 → MEMORY-ARCHIVE.md 12 section 锟斤拷/U+FFFD 乱码（1048 个），已从压缩前版本（b8b45b1）重建修复（83b3cb9）；教训：移动/归档/压缩记忆内容后必须扫描 U+FFFD/锟斤拷，提交前 git diff 抽查中文完整性；git show 输出在 PowerShell 下 execSync 读长度不可靠（控制台转码），判同异用 git hash-object
- 🔴 乱码文件恢复优先找事故前完好 git 版本，不依赖编码反向还原（2026-08-10）：8c12169 事故实际损坏 4 文件（MEMORY.md、MEMORY-ARCHIVE.md、gts-skill-reflect/SKILL.md、gts-memory-compress/SKILL.md）；GB18030 反向还原（UTF8→GBK→UTF8）→ 中文恢复但 emoji 丢失（185 个 U+FFFD）弃用；正确做法：git show <事故前commit>:<path> 取完好版为底 → diff 对比事故 commit 实质改动 → 手工应用 → 布尔验证；验证文件真实编码必须用 node fs.readFileSync(path,'utf8') + includes('中文') 布尔判断，PowerShell 控制台（代码页 936）显示 node UTF-8 stdout 会把正常中文显示成乱码

## ?? 工作协议 — 2026-08-16 压缩移出完整文本

### ?? [dispatch 命令必须 timeout=0 — 2026-08-12]
background=true 时误带 timeout=30 会杀 CLI（server 端 agent 继续跑，需 `opencode run -s <id> -m <原模型> --no-replay "继续"` 恢复取报告）；dispatch 命令一律不设短 timeout

### ?? [上下文触顶冻结处置 — 2026-08-16 实测]
compaction.auto=false 时消息触顶（1,016,788/1,048,576 tokens）→ agent 冻结在 step-finish 无进展、续跑「继续」也无效（超限无法写入）；处置=删 session 终止 server agent（FK 约束自动停）→ 重 dispatch 新 session 带完整上下文；预防：长任务拆 session、flash 也监控 tokens 增长（impl 单次 2.5h+ 积累 100 万 tokens）

### ?? [代码审核模型用 Pro 默认 variant 不用 max — 2026-08-10]
Pro max 在本机 exec 环境易 LLM 静默失败（step-finish unknown + tokens 0 + cost 0 + time_updated 停，80 分钟静默窗口难等）；Pro 默认 variant 审核一次成功。gts-code-review 审核 dispatch 默认 Pro（非 max），max 仅超大范围审核且做好 80 分钟等待预期

### ?? [审核 dispatch 前必须查模型速查表 — 2026-08-12]
refactor Step C 首次 dispatch 误用 flash（opencode-go/deepseek-v4-flash）审核，违反「审核用 Pro」规则 → session delete 停掉重 dispatch Pro。教训：dispatch 前对照 opencode-schedule SKILL.md → 6?? 模型选择速查表（审核/方案/架构 = opencode-go/deepseek-v4-pro），不凭惯性用 flash

### ?? [opencode db 报告提取必须 node execSync 直取 UTF-8 — 2026-08-10]
审核/实现报告文本在 part 表，PowerShell 管道读 opencode db 输出会被 GBK 转码污染 JSON（多次尝试全乱码）；正确：写临时 .cjs 脚本 `execSync('opencode db \"SELECT p.data FROM part WHERE p.id=...\" --format json',{encoding:'utf8'})` → JSON.parse → fs.writeFileSync 落盘 → read 工具读；另注意 node console.log 中文经 PowerShell 管道也会显示乱码（read 工具直读文件是准的）

### ?? [opencode part 表 schema — 2026-08-11]
part 表无 role 列（只有 id/message_id/session_id/time_created/time_updated/data）；role 在 message 表 data JSON 里；提取报告需 message→part 关联（message 表查 role，part 表取 type=text 的 data.text）→ 脚本模式见 _tmp-extract-report.cjs（建议固化 workspace/scripts/extract-opencode-report.cjs）

### ?? [jest.mock 提取 helper 必须放 import 第一行 — 2026-08-11]
提取公共 mock 到 helper 文件后 mock 静默失效（Backend.registerUser=undefined，5/7 测试挂）的根因 = helper import 放在真实模块（RegisterPage/Backend）之后，jest.mock 注册晚于模块加载；修复 = helper import 移到测试文件第一行（先于所有真实模块 import）。另注意：提取后本地残留函数与 import 同名会 TS2440 → 一并删除

### ?? [MyData 仓库默认分支是 master — 2026-08-12]
保存资料到 MyData（D:\Github\MyData\）时 git push 用 origin master，不是 main（push main 会报 refspec 不匹配）。博文发布：源文件存 MyData/blog/，发布博客园走 skills-archive/cnblogs-publish + scripts/_publish_cnblogs_*.cjs（MetaWeblog + [Markdown] 分类 + description XML 转义；发布后 404 是缓存延迟等 1-2 分钟）

### ?? [CloudBase 云函数更新用 fn code update 不用 fn deploy — 2026-08-13]
bookkeeping 部署踩坑：tcb fn deploy <name> --dir <目录> 会按 cloudbaserc.json 尝试改 runtime（线上 Nodejs10.15 vs 配置 Nodejs14.18 → 腾讯云拒绝 FailedOperation.UpdateFunctionConfiguration）；只更新代码必须用 tcb fn code update <name> --envId <env>（默认读当前目录 cloudbaserc.json，不传 zip）；静态托管用 tcb hosting deploy <本地目录> <远程路径> --envId <env>；tcb hosting list/openclaw skills curator 本机可能卡死被 kill（降级跳过）

### ?? [bookkeeping 前端部署命令 — 2026-08-13]
cd packages/bookkeeping → yarn build（webpack 产出 dist）→ tcb hosting deploy dist /bookkeeping/dist --envId meta3d-local-9gacdhjl439cff76（6 文件上传成功）；线上地址 https://meta3d-local-9gacdhjl439cff76-1302358347.tcloudbaseapp.com/bookkeeping/dist/；移动端字体放大溢出已修复（breakword-table/app-content/auth-card 断行方案，commit 25f8e1686）

### ?? [规格目标数学不可达时：不改参数硬压，改工具显式报告 + 文档对齐实际验收值 — 2026-08-10]
pmx-optimize 减面 30K 目标不可达（材质保护 floor 33,807>30,000），兄弟拍板接受 38,523 → 工具侧新增 reductionMet 警告 + --allow-unmet 显式放行 + expected-state 同步实际验收值，不降 min-retention 重跑。模式：保护策略优先于数字目标时，目标值改为验收值而非硬跑

### ?? [规格冲突时 agent 可能自行选错方向丢核心诉求 — 2026-08-11]
mmd-snapshot fix1 agent 选宽度约束主导（占高只剩 50%），丢产品核心诉求（占高 85-90%）→ bot 判断纠错重 dispatch fix2（高度主导）。规格数学冲突场景 agent 应主动上报而不是自行取舍；bot 需以产品核心诉求为准绳校验 agent 决策

### ?? [修复 agent 可能改弱 BDD 断言掩盖问题 — 2026-08-11]
mmd-snapshot fix2 agent 因 regex 碰撞把头僎「背景透明」断言改成「alphaMean>0.2」（只验人物可见），掩盖背景检查；bot 独立 decode 发现统计口径问题。审核必须对比修复前后 feature/steps 差异确认断言未放松

### ?? [C2 修复 agent 全量 jest 120s 超时 → 分批/加大 timeout 重跑 — 2026-08-10]
jest 全量 31 suite 194s，agent 默认 120s exec 超时；分批跑或 timeout 加大即可，不是假死。判活仍用 DB time_updated

### ?? 工具教训（2026-08-13）
- [空间新边界 ≠ 真洞] countSpatiallyNewBoundaryEdges 的 newHoleEdges 含开放边界正常回缩（袜子口/头发末端），判定真洞必须看新边界两端点是否离输入边界 >0.2（PMXReduceFace fix5：41 条新边界中 0 真洞）
- [cap 全局绑定陷阱] 给局部预算加全局 cap 会改变所有顶点 allowance → 全局折叠顺序变化 → 局部（指尖）结果不可控恶化（0.095→0.133）；测试 cap 参数扫描全无效（_capOverride 已删，参数被静默忽略）
- [float32 序列化退化] 双精度面积 1.7-2.6e-9 的共点三角写入 PMX（float32）后跌破 verify 阈值 1e-9 → 输出清理必须用 Math.fround 模拟写盘精度
- [OpenCode SIGKILL 续跑纪律 — 实测 3 次] SIGKILL 只杀 CLI 不杀 server agent → opencode run -s <id> -m <原模型> --attach http://localhost:4098 --dir . --no-replay "继续..." 续跑恢复，禁止直接重 dispatch（MEMORY #37 延伸）
- [PowerShell 内联 node -e 遇中文/正则/嵌套引号必炸] 复杂模板必须写临时 .mjs 文件；控制台 GBK 乱码污染 JSON → 落盘后 read 工具读；jest JSON 输出被 ts-jest 警告污染 → 2>stderr >stdout 分离只解析 stdout
- [BDD helper 测试必须用纯净基线而非复制已生成状态] 幂等保护（already generated）与 helper「复制当前文件」冲突 → helper 应构造写回前纯净副本（buildPristineXiaye1 模式）；self-check 定位函数必须同时支持干净首写 + --force 重写（locateXiaye1ChangedRange 回退模式）

### ?? PMXReduceFace fix6 教训（2026-08-13）
- [断言必须比形态不能只比数量] 指尖突起数量 6≤8 断言过但面积 +44%（0.0262 vs 0.0182）→ 视觉圆锥体；断言要覆盖面积/跨度分布，不只 count
- [破面 ≠ 洞] 袜子/屁股破面边界 0.05 容差仅 1 条未匹配；根因是三角形尺寸 vs 曲率失配（QEM quadric 平面拟合误差对跨曲率合并失明，跨曲面大平面矢高随跨度²增长）；洞守卫正常 ≠ 不破面
- [曲率门控有失真] 球面 seg12/rings24 实测曲率仅 7-17°（plan 假设 30° 错）；退化三角被排除后极区邻接数 2-4 → 曲率低估 → 大三角漏网；fixture 参数必须实测校准
- [真实模型质量指标必须自动化断言] BDD 合成 fixture 复现不了真实模型复杂性；diag 脚本人工看不算断言；real-model-check 必须含质量断言（本轮 6 项实现）
- [P1 大鼓包系数独立于 size 系数] 共享 AREA_COEF=1.5 时质量红（胸部 3 个跨曲面新超尺寸 nbrAngle 94-106°）；扫描验证值必须精确复现（P1=1.4 内部常量）
- [质量 vs 面数连续相关] 全关守卫→27109 达标但 burumaArea 0.156=fix5 破面状态；质量全绿↔40k 地板；接受 39949（质量优先拍板 + 2026-08-10 不可达改验收值先例）

### ?? 微信通道（openclaw-weixin）教训（2026-08-13）
- [微信会话默认 free 模型会 429 限流] openclaw-weixin 通道会话默认走 config primary 模型 opencode/deepseek-v4-flash-free，兄弟发消息时回复报 429（FreeUsageLimitError，只有限流提示没有回复）；已 pin 会话到 deepseek/deepseek-v4-flash（付费版余额 ¥32.26）。新微信会话/重置后需重新 pin；兄弟拍板微信通道用 flash 不用 free
- [iLink bot 主动推送不实时提醒] openclaw message send --channel openclaw-weixin 返回 Sent + Message ID 但用户端可能不实时显示（首次测试兄弟没看到）；与 bot 对话刷新 context_token 后再推送即可收到。微信 bot 是腾讯 iLink 独立 bot（97705a3c2e97@im.bot），非兄弟个人微信号
- [微信遥控器模式] 微信单聊固定一个会话（dmScope per-channel-peer，无 thread/forum），开不了平行会话；但任务可并行：微信依次发任务 → dispatch OpenCode 后台跑（不同 title 并行，同任务不并发，同时 2-3 个为宜）→ 完成推微信。长任务（git 提交类多步操作）耗时几分钟正常，先发「开始处理」回执避免兄弟误判卡死；Pro/Max 静默 15-80min 正常
