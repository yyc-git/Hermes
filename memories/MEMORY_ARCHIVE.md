# MEMORY_ARCHIVE — 从 memory.md 移出的详细规则/案例

> 压缩日期：2026-08-19
> 检索锚点：opencode dispatch 静默失败、yargs 拆参数、wait 脚本 patch、session 活跃判定、免费模型轮换、patch lie bug、编码哲学 8 条、GGUF 模型、Bun log 锁、PowerShell 测大小

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
