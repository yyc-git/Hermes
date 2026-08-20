# MEMORY_ARCHIVE — 从 memory.md 移出的详细规则/案例

> 压缩日期：2026-08-19 + 2026-08-20(二次补章节)
> 检索锚点：opencode dispatch 静默失败、yargs 拆参数、wait 脚本 patch、session 活跃判定、免费模型轮换、patch lie bug、编码哲学 8 条、GGUF 模型、Bun log 锁、PowerShell 测大小、Modal白屏、worktree dev-server 路径、argv 3 坑、wait-ms、hermes-读 vs OpenCode、回忆类信源

---

## GTS-Play 工作流

调度 OpenCode 走 opencode-schedule skill（attach 4098），监控脚本在 scripts/。这些脚本默认 DB 是 one 机路径，本机先设 `$env:OPENCODE_DB=C:\Users\Administrator\.local\share\opencode\opencode.db`。PowerShell 的 `&` 调用符被误判 backgrounding。任务完成/commit 后必须先 notify.ps1 弹桌面通知再汇报（desktop-notify-protocol skill），兄弟会查「怎么没发msg通知」。

> 检索锚点：opencode dispatch、notify.ps1、backgrounding

---

## wait-opencode-session.mjs patch 落地（2026-08-19）

THINKING_EVENT_TYPES 只含 reasoning/step-start，加 isStepFinishStop(part) data.reason=stop/completed 立即 DONE。3 铁律：派完必带 notify_on_complete=true / 下轮 turn 开头主动 check / 兄弟硬偏好异常立刻主动检。

> 检索锚点：wait脚本、isStepFinishStop、notify_on_complete

---

## 新会话默认模型受桌面 app UI 覆盖

config default 只是兜底。UI 模型选择器选过的模型存 desktop-ui.sqlite 的 ui_kv 表（key=hermes:last-used-model:managed:...,列名 value_json），新建会话优先用它。2026-08-18 实测 config=hy3 但新会话是 deepseek-v4-flash 即此因，UI 选一次 hy3 即恢复。排查路径见 hermes-provider-config skill 踩坑第 8 条。

> 检索锚点：last-used-model、ui_kv、桌面UI覆盖

---

## OpenCode 4098 server 生命周期（2026-08-18）

改 opencode.json 新增 provider/模型后 4098 不热加载（attach 报 ProviderModelNotFoundError），必须重启才生效。重启会中断所有活跃 session，先查活跃 session 等兄弟确认。4098 从 Hermes 后台进程拉起，若 Hermes 重启 4098 跟着挂。完整重启流程+独立端口验证见 opencode-model-smoke-test references/opencode-server-restart.md。

> 检索锚点：4098 不热加载、ProviderModelNotFoundError、重启流程

---

## OpenCode 静默失败+主动核对（2026-08-19）

兄弟原话"这个早就跑完了吧?你怎么没检查"：
① PowerShell `$brief` 传 positional message 被 yargs 当 array 拆 arg → `Error: You must provide a message or a command` → CLI exit 0（无明显错）→ DB 0 session = 完全静默失败
② 即使命令行带 `-m`，CLI 可能因拆参数导致 -m 没解析成功 → server 默认 fallback `opencode-go/deepseek-v4-flash`（付费 flash，违反 token 偏好）

**铁律**：dispatch 后 15s 必须查 DB 拿 sessionId（空=dispatch 失败）；30s 必须查 event 表确认实际 model（看到 opencode-go/deepseek-v4-flash = fallback 失败）；模型不对立刻 `opencode session delete <id>` 重派。

**🔴🔴 wait DONE 后必须主动核对**：wait 脚本退出码 + DONE 通知不能 100% 反映真实状态。每次收到 wait 完成通知立刻：① sqlite3 查 session.part 表末尾 step-finish reason=stop ② git log -3 看目标仓 commit ③ 状态表格立刻同步。详见 opencode-session-ops + desktop-power-pitfalls skill。

> 检索锚点：yargs拆参数、静默失败、wait DONE 主动核对

---

## 判 OpenCode session 活跃

100% 信 DB time_updated 窗口（>now-600000），勿用 Web UI /api/session 字段手判（踩坑：-not 优先级 bug 全报 running=False 差点重启 4098）。真完成三重判定：① wait --check reason=stop+idle≥30s ② Web UI 4098/api/session 查到 sid ③ bot 跑 jest+git status 核对 agent 自报。禁 Start-Process powershell "node wait...; Write-Host done" 触发 notify 误报。详见 opencode-session-ops skill。

> 检索锚点：time_updated、session活跃、三重判定

---

## opencode 模型落盘+免费组（2026-08-18）

scripts/opencode-session-meta.mjs save/get/ls 写 .opencode-session-meta/<sid>.json（provider/model/variant），发「继续」前 get 拼 -m。scripts/opencode-free-model-state.mjs get/dead/revive/set（current+blacklist 带 deadAt），调度免费时段先 get 拿 current，确认挂（3次继续+明确报错）才 dead 推进，静默 unknown 不算挂（删会话重开）。黑名单 24h 自动过期。免费组顺序 flash-free→hy3-free→mimo→nemotron-3-ultra→nemotron-3.5-lightning→laguna-s-2.1→火山→go。

> 检索锚点：session-meta、free-model-state、免费组轮换

---

## 对外断言前必须实测（2026-08-18+08-19）

commit message / agent 自报 / 历史笔记 / daily log 都=待实测假设。信了 68728ceea "Xiaye1 未变"实改 XiaHui cloth collision 不改面数，真凶在 pmx 资产 fc1e492f1。错误根因→错误派工→浪费一轮+兄弟拍桌。详见 gts-dispatch-preflight + gts-auto §7.4.1。

> 检索锚点：实测、Xiaye1、错误根因

---

## 只读目录护栏 + patch lie bug（2026-08-18）

doc/ docs/ 语雀知识库/ 三处 bot 禁写入/还原/删除内容。🔴 patch 工具 surface lie bug（2026-08-18 实锤）：会话内 patch tool 报 success:true + diff 看似成功落盘，但 skill_manage(patch) 后续报 "Refusing background curator patch, not agent-created"。未拍板。

> 检索锚点：只读目录、patch lie bug

---

## 编码哲学 8 条铁律

已落 `D:\Github\GTS-Play\AGENTS.md`「AI 写代码铁律」段（2026-08-19）：不保留向后兼容 / 选最简单实现 / 分层构建先跑起来再叠能力 / 模块化关注点分离 / 优先用成熟库 / 复用项目已有依赖 / 为长期决策禁权宜 / 少即是多。side project 适用，生产环境第1+7条需加保护层。dispatch OpenCode 写代码前必带"必遵守 AGENTS.md 8 条铁律"。

> 检索锚点：编码哲学8条、AGENTS.md

---

## 项目级规则落地（2026-08-19）

走 gts-rule-landing 四件套：AGENTS.md + .opencode/skills/ + 笔记/决策记录/ + MEMORY.md 指针。兄弟原话逐字放，不加副文本/适用范围/目的说明（自作主张加=返工）。改 .opencode/skills/ 后必提醒兄弟重启 OpenCode。

> 检索锚点：gts-rule-landing、四件套

---

## skill-update-discipline 增补（2026-08-19）

纪律 8=结果后不塞选项 menu（兄弟连嫌）。纪律 9=Windows 全局 sqlite3 查 OpenCode DB 路径（C:\sqlite\sqlite3.exe，不走 better-sqlite3）。修正纪律 7 误判（实际 gts-rule-landing 已存在）。后续写汇报前自检「纪律 8」别列 (a)(b) 选项 menu。

> 检索锚点：skill-update-discipline、选项menu、sqlite3路径

---

## OpenCode skill 改动后必须重启 4098

AGENTS.md/.opencode/skills/<name>/SKILL.md 新建/修改/删除后，4098 server 不热加载 skill 扫描结果 → 已运行 session 不会自动看到新 skill → 必须走完整重启流程（杀进程→端口轮询→HTTP 200→GET /api/skill 验证 data[].name 命中）才 dispatch。与 provider 改动重启的核心区别：provider 改动报 ProviderModelNotFoundError 明显；skill 改动无任何报错，沉默失败。接口结构 {location, data:[{name,...}]} 外层是对象不是数组。SOP 在 gts:opencode-model-smoke-test references/opencode-server-restart.md。

> 检索锚点：skill 改动重启、api/skill、沉默失败

---

## GTS-Play mmd + 算法层偏好（2026-08-19）

兄弟拍板：🔴 通用算法 > 材质名特判白名单（兄弟原话："只用几何覆盖率阈值，不要特判"）。cloth 可打掉判定用覆盖率≥40%（Phase Fix-r5 改 cloth-data-rules-generate.mjs + WeakMap 缓存）。bracelet/bangle/jewel 等不走关键词 EXCLUDED，用几何自动排除。pmx 总面<5万 skip 减面（Phase Fix-r4 改 PMXReduceFace）。

> 检索锚点：mmd算法、覆盖率阈值、pmx skip

---

## Hermes 本地搜索栈 GGUF（2026-08-19 实测）

C:\Users\Administrator\.cache\qmd\models\ 2.15 GB = embeddinggemma-300M(326 MB) + qwen3-reranker-0.6b(624 MB) + qmd-query-expansion-1.7B(1252 MB)。删除=断 gts-memory-search-v3 本地语义召回（FTS5 还在）。qmd pull 自动重下。清 C 盘默认保留，兄弟明确指令才动。

> 检索锚点：GGUF模型、qmd、语义召回

---

## PowerShell 测大小坑（2026-08-19）

`Measure-Object -Property @{E={...}}` hashtable 报"Cannot bind parameter Property"，改 ForEach-Object 累加。C:\Users\Administrator 整树递归 180s timeout，只测已知大目录。清理前后 `(Get-PSDrive C).Free/1GB` 即时读。

> 检索锚点：Measure-Object、PowerShell测大小

---

## Bun log 文件锁（2026-08-19 实锤）

opencode 1.18.15 Bun 编译版，多进程并发写 log 时用非共享句柄，新 CLI open 失败。根治：设 XDG_DATA_HOME 到独立 temp + OPENCODE_DB 指回原路径。PowerShell dispatch 也不行（多行 $brief 被 yargs 拆→静默失败）。唯一可靠：Node.js spawn(oc, args, {env}) + 独立 env。

> 检索锚点：Bun log锁、XDG_DATA_HOME、静默失败

---

## 读 Hermes 历史会话

先查 state.db（主存储，C:\sqlite\sqlite3.exe "E:\...\state.db" "SELECT..."）→ dump 文件只是 429 fallback。兄弟硬偏好："你的会话啊"→ 必须主动查 DB 不等提醒。skill hermes-session-read 是系统内置（curator 拒编辑）。

> 检索锚点：state.db、历史会话、hermes-session-read

---

## antd-mobile Modal 白屏修复（2026-08-19，commit d6681051e）

单机版 ✅ 全完成。涉及 City.tsx（setting+prop modal 改 Modal.show+replace）、Upgrade.tsx（Mask 改 useEffect+条件渲染 263 行）、MissionComplete.tsx（Modal.show）。根因：stopLoop vs Three.js requestAnimationFrame 竞态。**prop button 切换内容用 handler.replace() 不触发 onClose**；使用道具后刷新 effect 依赖加 refresh state `_`。多人版 MultiplayerHall.tsx:806 gameOverVisible 仍 JSX 模式未改，不在本次修复范围。

> 检索锚点：Modal白屏、Modal.show、handler.replace、stopLoop、requestAnimationFrame

---

## webpack dev-server 路径陷阱（2026-08-19 实锤）

wt3 worktree `node_modules` 是 junction → GTS-Play，`resolve.symlinks:true` + `resolve.modules:['node_modules']` 导致源文件解析回主仓（即使 cd 到 wt 目录启 dev-server，source map 全解析到 ../../../GTS-Play/...）。改 worktree 源码不 merge → dev-server 看不到改动；bundle 搜旧代码确认。**worktree 改了 ≠ dev-server 能看到，必须先 merge 回 dev 再从主仓测**。详见 gts-worktree-junction skill。

> 检索锚点：worktree dev-server、resolve.symlinks、junction、source map

---

## Brief 防卡死：PMX 减面/verify 等 jest 超时（2026-08-19）

PMX 减面/verify 等计算密集操作的测试，jest 可能 >300s 超时卡死 agent bash 工具。brief 必须显式写「禁止跑 jest/BDD 测试，只改代码」或「只跑单个 --testNamePattern」。验证用 `reduce.mjs` + `verify.mjs` 手动执行（PMXReduceFace 独立仓 CLI）。

> 检索锚点：brief防卡死、jest超时、reduce.mjs

---

## 回忆/git 状态类问题信源优先级（2026-08-20 兄弟拍板）

git log / git worktree list / ls = 唯一权威 > daily log / state.db > MEMORY 主表。主表是沉淀不是 git-tracked，容易和代码现状脱节（已踩：8-19 沉淀 Modal 修复清单，8-20 顺手答你时把已修的"待修"清单又吐出来；8-20 又踩"worktree 是否已 merge"凭记忆答错）。问"是否 merge/commit/部署/删除"类问题必须先实测，不准凭记忆。git ≠ 主表 → 以 git 为准，立刻 patch 主表。

> 检索锚点：信源优先级、git权威、主表脱节、实测原则

---

## hermes 读资料 vs OpenCode 加载链（2026-08-20 实锤）

兄弟问"回忆 X / v3 skill 在不在 / 昨天 commit" → **hermes 自身 read_file 0 配置直读**（~/.hermes/skills/gts-memory-search-v3/SKILL.md 即时生效）。**绝不要派 OpenCode agent 验证 v3 skill 是否在 OpenCode surge prompt** — 那是 OpenCode 加载链问题（`.opencode/opencode.json` 的 `agent.build.permission.skill` allowlist），跟 hermes 读资料能力无关。判错题 = 浪费时间 + 兄弟拍桌。完整踩坑见 opencode-dispatch-pitfalls references/hermes-read-vs-opencode-dispatch.md。

> 检索锚点：hermes直读、OpenCode加载链、allowlist、判错题

---

## worktree merge 后必须 git worktree remove（2026-08-20 兄弟拍板）

fix/feat/refactor skill 漏的硬步骤。merge 完 dev 不算完，必须依次：① merge + push ② `git worktree remove <path>` ③ `git worktree prune` ④ `git worktree list` 二次确认 ⑤ issue 记 merge commit hash。详见 gts-dev-fix M-0 + gts-dev-feat Phase B + gts-dev-refactor Phase M + gts-auto Phase S + gts-worktree-junction scripts/worktree-cleanup.ps1。

> 检索锚点：worktree清理、git worktree remove、merge后清理

---

## 兄弟说"demo"歧义（2026-08-20 实锤）

**默认指 PMXReduceFace demo**，不是 GTS-Play frontend demo。PMXReduceFace 独立仓 `D:\Github\PMXReduceFace`，`yarn webpack:dev-server` 起在 **http://localhost:8096**（跟 frontend 7093 不冲突）；LOD 对比页（LOD 100/70/55/50%），默认模型 `XiaoMeiOriginFix_02_elrein.pmx`（**不是 XiaHui**）。frontend demo 在 `packages/frontend`，端口 7093。启 PMXReduceFace demo 前 `netstat -ano | findstr :8096` 查占用防 EADDRINUSE。验证 CLI：`node src/tool/pmx-face-reduce/reduce.mjs --input X.pmx --output Y.pmx --target-ratio 0.5` + `verify.mjs X.pmx Y.pmx --target-ratio 0.5`。要测 XiaHui 走 PMXReduceFace demo，先看 demo/assets 里是否有 XiaHui PMX，没有要派 OpenCode 改 demo 源 + 加资源（源码改动 100%派）。

> 检索锚点：demo歧义、PMXReduceFace、8096、XiaoMeiOriginFix

---

## React useEffect cleanup 时序坑（2026-08-19 prop fix）

用 ref 标记「正在切换内容」防 onClose 误触发 → 失效，因为 cleanup 先执行 close() 时 ref 还是 false。正解：antd-mobile Modal.show() 返回 handler 支持 replace() 更新内容不触发 onClose，两个 effect 分离：一个管开关（[isShowProp]），一个管内容（[currentPropItem]）用 handler.replace()。

> 检索锚点：useEffect cleanup、Modal handler.replace、onClose误触发

---

## 兄弟期望直接执行 + 改动纪律（2026-08-20 兄弟拍板）

兄弟原话：「你直接让会话继续啊」「你去修复下啊」（2026-08-18 多次）；「不需要我拍板啊，你直接 dispatch」（2026-08-20 再拍）。

**改动纪律（8-20 定稿）**：
- 不需拍板直接干：源码改动 / 复制文件 / 创建目录 / 改 build 配置 / 调阈值 / 加功能 / 写 brief
- 必须列计划+等拍（不可逆操作）：`还原文件` / `git checkout` / `git reset --hard` / `git stash pop` / `rm -rf`

**遇能力外的事**：启动 GUI server / 配 API key / 查余额等 → 用一句话说明限制+给方案，别推卸或反问。

> 检索锚点：直接执行、不需拍板、不可逆操作、等拍

---

## 源码改动 100% dispatch OpenCode（2026-08-18 起算，2026-08-20 加严）

扩展名清单（100% dispatch，不允许 bot 直改）：`.ts` / `.tsx` / `.js` / `.mjs` / `.cjs` / `.feature` / `.steps.ts` / `.scss`。

理由：bot 模型 < OpenCode，bot 亲手改 = 质量退化。bot 只做调度 + 监控 + 复验 + git + notify。

**禁止**：bot 跑 jest / tsc 验证自己改的代码（自己验证自己 = 死循环）。

**仅例外**：诊断/临时验证类小改动（加日志、去 clamp、注释代码块、1 行验证修复）可直改。

> 检索锚点：源码改动、dispatch、bot模型限制

---

## 数据/部署红线（2026-08-18 兄弟拍板）

- 默认不操作 CloudBase 文档型数据库集合（增删改查/迁移），任何操作必须先问兄弟
- 线上/单机部署必须兄弟确认
- 部署前先退出 Clash（直连腾讯云最快）

> 检索锚点：CloudBase、部署红线、退Clash

---

## bot 不做根因分析（2026-08-19 拍板）

bot 主线：最多 1 句方向。读 ≥3 文件 / 写完整根因 / 出方案对比 = 违规（伞形 skill `gts:bot-rca-discipline` 拆出来管控）。

> 检索锚点：根因分析、bot-rca-discipline、违规边界

---

## webpack 循环依赖 TDZ 修复（2026-08-19 实锤）

🔴 `export { x } from "y"` 仍生成 `let x = module.x` 立即赋值，**不能消除循环 TDZ**。

**正解**：在**定义方**改 `export function`（方案 B），不能在 re-export 层用 `export { } from`（方案 A 不可靠）。

触发场景：webpack dev-server 启动崩 `Cannot access 'X' before initialization`。

> 检索锚点：循环依赖、TDZ、export function、方案B

---

## LLM fail 先分类再动手（2026-08-18 改，2026-08-19 加细）

🔴 LLM fail 先分类再动手：
- **rate limit / 429 / quota** = 真限流 → 等窗口或换模型
- **401 / timeout / 5xx** = 瞬时 → 同 session 发「继续」
- **纯静默 unknown + 模型实测可用** = 删会话直接重开（flash-free 额度用完会明确报 rate limit，不会静默 unknown；**换模型是最后手段**）
- **其余时段** → 火山 flash

> 检索锚点：LLM fail、rate limit、瞬时、静默 unknown、删会话重开

---

## token 成本敏感（2026-08-18 兄弟偏好）

兄弟对 token 成本敏感：
- 简单任务 Flash 级；复杂才 Pro
- bot 主线不做重活（读 >3 文件一律 dispatch）
- 同类小任务合并 dispatch，禁止碎片化逐个派
- fix 循环 >2 轮拆新 session
- 长任务拆 <30min 短 session + `--no-replay`
- tokens 近上限时停 + 开新
- cacheRead >50M 或运行 >2h 主动停开新

> 检索锚点：token 成本、Flash vs Pro、合并 dispatch、拆 session

---

## 恢复中断会话后必清旧 session（2026-08-19 实锤）

🔴 兄弟原话「你为什么没有先删除旧的会话再dispatch啊？」

恢复后第一步：opencode db 查同任务活跃 session → gts-opencode-stop（**禁止直接 delete，走 skill 正规流程**）→ 确认零残留（三重验证）才 dispatch 新 session。

**不能凭记忆判 session 存活，必须查 DB**。

> 检索锚点：清旧 session、gts-opencode-stop、三重验证

---

## 对外断言前必须实测（2026-08-18+08-19）

🔴 commit message / agent 自报 / 历史笔记 / daily log 都 = **待实测假设**。

信了 68728ceea「Xiaye1 未变」实改 XiaHui cloth collision 不改面数，真凶在 pmx 资产 fc1e492f1。错误根因 → 错误派工 → 浪费一轮 + 兄弟拍桌。

对外断言（尤其 Blocking）必须附实测命令 + 输出（基线对比、grep 行号），不能凭代码阅读下结论。

详见 gts-dispatch-preflight + gts-auto §7.4.1。

> 检索锚点：实测、Xiaye1、错误根因、对外断言

---

## OpenCode 调度 + 模型优先级（2026-08-20 兄弟拍板）

- 走 opencode-schedule skill（attach `http://localhost:4098`）
- wait 脚本监控（**参数单位 ms**，不是 s）
- **模型优先级 8-20**：
  - **Pro**：火山 → mimo → go
  - **Flash**：免费组轮换 → 火山 → go
- **opencode-go 仅兜底，从不首选**

详见 4 个 dispatch skill（已 patch）：gts-opencode-dispatch-hardening 铁律 9 + opencode-dispatch-pitfalls 教训 3 + opencode-hermes-dispatch-pitfalls 兄弟硬偏好（8-20 版） + gts-dispatch-preflight argv 终极模板。

> 检索锚点：opencode调度、attach 4098、模型优先级、go 兜底

---

## session 活跃判定（2026-08-18）

100% 信 DB `time_updated` 窗口（>now-600000），勿用 Web UI `/api/session` 字段手判（踩坑：`-not` 优先级 bug 全报 running=False 差点重启 4098）。

**真完成三重判定**：① wait --check reason=stop+idle≥30s ② Web UI 4098/api/session 查到 sid ③ bot 跑 jest + git status 核对 agent 自报。

详见 opencode-session-ops skill。

> 检索锚点：time_updated、session 活跃、三重判定

---

## Hermes 默认模型 + 桌面 UI 覆盖（2026-08-18）

- 默认模型：minimax-cn/MiniMax-M3（多模态，api_mode=anthropic）
- **切 provider 必显式 api_mode**
- 新会话模型受桌面 UI last-used-model 覆盖（非 config default，key=`hermes:last-used-model:managed:...`）

排查路径见 hermes-provider-config skill 踩坑第 8 条。

> 检索锚点：minimax-cn、api_mode、last-used-model、UI 覆盖

---
