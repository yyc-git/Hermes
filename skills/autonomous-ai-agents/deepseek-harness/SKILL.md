---
name: deepseek-harness
description: "DeepSeek Harness (dsh) 的启动、配置与任务调度。触发条件:启动 dsh Web UI、用 dsh 跑单任务(headless)、配置 dsh 模型/插件、或把 dsh 与 OpenCode 并用作 agent 框架时。"
---

# DeepSeek Harness (dsh) — 使用与调度

> DeepSeek 官方 agent 框架("Everything is a Plugin", npm 包 `@deepseek-ai/dsh`)。Web UI 默认 `http://127.0.0.1:3080`。调度方式参考 opencode-schedule 协议(结构化任务 + 明确输入输出)。

## 安装与启动

```powershell
npm install -g @deepseek-ai/dsh        # 全局安装
dsh web                                 # 启动 Web UI(长驻服务,用 terminal(background=true))
# 健康检查:http://127.0.0.1:3080 返回 200,页面标题 "DeepSeek Harness"
```

- Node 要求:≥ 20(实测 v24 正常)
- 服务是常驻进程,重启机器会消失;需要常驻可设开机自启
- 日志重定向:`dsh web 2>&1 | Out-File "$env:TEMP\dsh-web.log" -Encoding utf8`

## CLI 结构

```
dsh [options] [command] [args...]
  --profile <name>    boot 指定 profile(web / headless / tui)
  --dump-config       打印 profile 配置树
  web                 启动 Web UI(alias: --profile web)
  plugin              管理 profile 插件(pnpm 转发)
```

**单任务模式(headless)**:
```powershell
dsh --profile headless "task text"     # 回答一个任务,打印最终消息,退出
```
- headless 无 `--attach/--title/-m` 参数(区别于 opencode run);任务文本直接作为参数
- 跑完即退,适合验证/一次性任务;长任务用 background=true + notify_on_complete=true

## 配置(~/.dsh/)

| 文件 | 内容 |
|---|---|
| `settings.yaml` | `agent-default-model: {provider, model, reasoningEffort}`(Web UI 配置模型后写这里) |
| `.credentials.yaml` | API 凭证 |
| `profiles/<name>/` | 各 profile 的 cordis.yml / cordis.patch.yml / package.json(插件栈) |
| `sessions/` | 会话记录(按工作目录分目录) |

headless 与 web 共享 settings.yaml 的默认模型,Web UI 配好模型后 headless 直接用。

## 调度模式(参考 opencode-schedule)

```powershell
$task = "结构化任务:1. 读取 <绝对路径文件> 2. 总结/处理 3. 写入 <绝对路径报告文件>(UTF-8,标注由 dsh 生成) 4. 回复中输出要点。约束:禁止改其他文件/跑测试/装依赖/网络操作。"
dsh --profile headless $task
```

要点:
- 任务文本用绝对路径(终端 cwd 不一定是目标项目)
- 明确输入/输出/约束(三态定义思想同 opencode brief)
- 结果取回:headless 打印最终消息 + 任务产物文件;监控用 background + notify
- dsh 有工具能力(读文件/写文件等),验证链路 = 让它读文件→写报告→回复要点

## 文件沙箱限制(实测踩坑 2026-08-17)

- dsh agent 默认 `workspace-write` 模式:**只允许写当前会话 cwd 内**;写工作区外路径(如 `D:\Github\GTS-Play\...`)会被沙箱拦截
- 请求权限升级(danger-full-access)在 headless 下**无审批通道** → 直接失败,agent 会**降级写进 cwd**
- 实测:任务要求写 `D:\Github\GTS-Play\_tmp-x.md`,实际落到 `E:\Hermes...\0.19.0-cn.7\_tmp-x.md`(启动时 cwd)
- 对策:① 输出路径放 dsh 的 cwd 内(启动前先 cd 到目标目录)② 接受降级后自行复制 ③ 用 Web UI/MCP 模式(权限可能更高)

## MCP 集成(方式一:`@chushixixin/dsh-harness-mcp-server`)

> 拓扑:Hermes(brain)→ MCP(StreamableHTTP :8090/mcp)→ Harness agent(arms)。工具:`echo`/`harness_list_tools`/`agent_run`(同步)/`task_inbox`+`task_result`(异步队列)。Hermes 侧注册(⚠️ 交互式,需管道喂输入):
```powershell
cmd /c "(echo n& echo Y) | hermes mcp add harness_plugin --url http://127.0.0.1:8090/mcp"
# 输出 "✓ Saved ... (7/7 tools enabled)" 即成功;新会话生效
```

### MCP 客户端直调要点(无 SDK 直接 HTTP 调试时)
- StreamableHTTP 必须带 `Accept: application/json, text/event-stream`(缺 → **406 Not Acceptable**)
- 响应是 **SSE**:多行 `data: {json}`,**取最后一条**(最终结果),不能整段 ConvertFrom-Json
- `initialize` 响应头 `mcp-session-id`,后续所有请求带该 header;顺序:`initialize` → `notifications/initialized` → `tools/list` → `tools/call`
- PowerShell 写 .ps1 调试脚本:**必须 UTF-8 带 BOM** 写入(`[System.Text.UTF8Encoding]::new($true)`);PS 5.1 按 GBK 读无 BOM 文件 → 中文乱码 → 引号错乱语法崩(实测踩坑)
- 完整可复用的 MCP 直调脚本模式:见 `references/mcp-integration.md`

```powershell
dsh plugin --profile web add @chushixixin/dsh-harness-mcp-server
```

### 🔴🔴 坑 1:插件自动注册 bundle,勿再手动 insert
`dsh plugin add` 会把插件加进 profile 的 `dsh.profile.bundles`(package.json),插件自带 `cordis.yml`(insert harness-mcp-server, port 8090, host 127.0.0.1)。若再在 `cordis.patch.yml` 手动 insert 同 id → 启动报 `duplicate loader entry id: harness-mcp-server`。**cordis.patch.yml 保持空 `[]` 即可**;要改配置用 config 覆盖而非 insert。

### 🔴🔴 坑 2:上游依赖缺陷(已用本地 stub 解决,2026-08-17 实测)
插件依赖 `@deepseek-ai/dsh-agent-presets@0.0.1-rc.1`,其代码 `import '@deepseek-ai/dsh-paths'`,但 **dsh-paths 从未发布到任何 npm registry**(官方/镜像均 404),且**实测 Harness 源码仓库 master 里也不存在**(全仓 0 目录、0 package.json 声明)—— 纯私有/未发布包。启动报 `ERR_MODULE_NOT_FOUND: Cannot find package '@deepseek-ai/dsh-paths'`。
- npm 上 dsh-agent-presets 最新就是 rc.1(同样带此 bug),无版本可升级
- ✅ **workaround 已实现(实测有效)**:dsh-paths 只被用到**一个函数 `expandHomePath`**(展开 `~` 路径)。在 `~/.dsh/profiles/web/node_modules/@deepseek-ai/dsh-paths/` 建本地 stub:
  - `package.json`:`{name: "@deepseek-ai/dsh-paths", version: "0.0.1-rc.1", type: "module", main: "lib/index.js", exports: {".": "./lib/index.js", "./lib/index.js": "./lib/index.js"}}`
  - `lib/index.js`:`export function expandHomePath(p) { /* 处理 "~" 和 "~/" 前缀,展开为 process.env.USERPROFILE */ }`
  - Node 解析沿 node_modules 向上查找,物理目录即可命中(无需 pnpm 链接)
  - ⚠️ **`pnpm install` 会清掉手动 stub**——插件升级/重装后需重建;stub 完整代码见 `references/mcp-integration.md`
- stub 建好后 MCP server **正常启动**:8090 监听、`hermes mcp add harness_plugin` 注册 7 工具成功

### 🔴🔴 坑 3:dsh rc.6 `agent ctx unscoped` bug(agent_run 空结果)
stub 解决启动后,MCP server 正常,`agent_run` 能创建 Harness session(返回 sessionId)但 **assistantText/toolCalls 全空**。dsh web 日志明示:
```
[harness-mcp-server] agent ctx unscoped (dsh rc.6 bug); preset mount skipped — upgrade dsh for full tool support
```
- 根因:dsh rc.6 的 agent 上下文作用域 bug → 插件挂载 agent 工具集时被跳过 → agent 无工具可执行
- **npm latest = rc.6,无修复版**;唯一出路等上游发布新版本(或源码构建 dsh,重)
- 判定:agent_run 返回 sessionId 但内容空 = 此 bug;MCP 集成本身是通的,上游修复后重启 `dsh web` 即自动恢复
- 🔴 **headless 并不是可用替代(2026-08-17 实测修正)**:rc.6 的工具执行缺陷**影响所有外部调度方式** —— headless 真正走工具的任务同样失败(Web UI 显示 `Cannot read properties of undefined (reading 'prepare')`,或 `tool call was interrupted after it was recorded, but no result was durably recorded`)。**读文件类任务可能「侥幸成功」**(模型直接回答,没触发工具路径),不可据此判断工具可用
- **外部调度前先验证工具闭环**:发一个必须用工具的任务(pwsh 跑命令),查 session.history 是否出现 `tool/result`;失败 → 等上游新版,不要反复重试或换调度方式(CLI/MCP/HTTP API 共用同一 agent 运行时,绕不过)
- **Web UI 原生可见的调度方式(JSON-RPC API + workspaceId)见 `dsh-schedule` 技能**(gts 分类),两者重叠,以 dsh-schedule 为调度权威

## 与 OpenCode 对比

| 维度 | opencode run | dsh headless |
|---|---|---|
| 任务传参 | `$brief` 变量(文件) | 命令行任务文本 |
| attach Web UI | `--attach http://localhost:4098` | 无(独立进程跑完即退) |
| 会话标题 | `--title` | 无 |
| 监控 | wait-opencode-session.mjs + DB | background + notify |
| 模型选择 | `-m opencode-go/deepseek-v4-*` | settings.yaml 的 agent-default-model |

## Hermes 原生调度等价机制（对比类问题直接引用）

| OpenClaw/OpenCode 机制 | Hermes 等价 |
|---|---|
| dispatch + brief 文件 + DB 查重 | `delegate_task`（进程内子 agent，隔离上下文，批量并行 ≤3，结果自动回会话，无需手工 brief/DB 环节） |
| wait-opencode-session.mjs 盯 DB | `terminal(background=true, notify_on_complete=true)` — 等待期 0 LLM 调用，完成才唤醒 |
| poll 每 30s 轮询 | 反模式 — 每轮 = 1 次 LLM 调用 + 全量前缀 cacheRead（bot 侧 1.6 亿 token/天根因） |
| QMD 文件索引 + 三级检索 | 无等价 — Hermes memory 是注入式（紧凑），检索用 `session_search`（FTS5 免费）+ `search_files`；语义搜索可选配 `memory.provider` |
| gts-save-flow 命令驱动保存 | 记忆 proactive 自动保存（agent 自主判断），会话自动落盘 |

> 完整 token 经济学数据（2026-08 审计：cacheRead ≈92% 成本、6h 单 session vs 6min 短 session 差 ~26 倍、拆 session 纪律）见 `openclaw-to-hermes-migration` → `references/openclaw-pipeline-token-economics.md`，引用不重写。

## Pitfalls

- **兄弟问「对比 dsh/OpenCode/Hermes」这类问题时，先用已有知识直接回答，不要重新探索 `.openclaw`/日志文件** — 对比内容就在本 skill + openclaw-to-hermes-migration references 里，只需针对性核实具体事实（2026-08-17 教训：探索 5 轮才回答，被兄弟催「怎么思考这么久」）
- 3080 访问无内容 = 服务没启动，先 `dsh web`
- headless 任务文本含中文/特殊字符:用 `$task` 变量传参,避免引号嵌套问题
- 修改配置/插件后需要重启对应 profile 才生效
- **下载 Harness 源码仓库**:git 协议可能被重置(`SSL_read: Connection was reset` 页面却能访问);用 codeload tarball(`https://codeload.github.com/deepseek-ai/deepseek-harness/tar.gz/refs/heads/master`,curl --retry 5)。解压**必须用 `C:\Windows\System32\tar.exe`** —— PATH 里的 msys tar 解析 Windows 路径报 `Cannot connect to C: resolve failed` + `gzip: unexpected end of file`(误报文件损坏,实测文件完好;System32 tar 正常列出)
- **npm 安装的 dsh 与第三方插件版本错配时先看 dsh web 启动日志尾部**——插件自己会打 `[harness-mcp-server] ...` 诊断行(如 `agent ctx unscoped`),比猜快得多
