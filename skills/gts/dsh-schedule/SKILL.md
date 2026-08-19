---
name: dsh-schedule
description: "调度 DeepSeek Harness (dsh) 执行任务。需要让 dsh 跑代码/测试/分析任务,或排查 dsh 配置/插件问题时使用。headless 单任务模式已跑通(2026-08-17);MCP 集成(方式一)有上游依赖缺陷需注意。"
---

# dsh-schedule — DeepSeek Harness 调度

> DeepSeek Harness(dsh,`@deepseek-ai/dsh`)作为 Hermes 的「手臂」执行任务(Hermes = 大脑)。本技能记录调度方式、沙箱行为、配置位置与已知缺陷。

## 环境事实(本机已验证)

| 项 | 值 |
|---|---|
| 安装 | npm 全局 `@deepseek-ai/dsh`(0.1.0-rc.6),`dsh` 在 PATH |
| Web UI | `dsh web` → http://127.0.0.1:3080 |
| 模型配置 | `~/.dsh/settings.yaml` → `agent-default-model: provider: deepseek-official, model: deepseek-v4-flash` |
| profile | `~/.dsh/profiles/<web\|headless>/`(cordis.yml 空根 + cordis.patch.yml 用户层 + package.json 的 dsh.profile.bundles) |
| 会话记录 | `~/.dsh/sessions/`(按 cwd 分目录) |

## 调度方式一:headless 单任务(✅ 已跑通,默认推荐)

```powershell
$task = "结构化任务文本:背景/步骤/输出要求/约束"
dsh --profile headless $task
```

- 单任务问答:打印最终 assistant 消息后退出;跑完即退,无 attach 概念
- 长任务用 `terminal(background=true, notify_on_complete=true)`(参考 opencode-schedule 的监控思路)
- 任务文本风格参考 opencode-schedule 的 brief:明确输入/输出/失败态/不做清单
- 结果提取:stdout(重定向到日志文件)+ 任务要求的报告文件

### 🔴 工作区 = 启动 cwd(兄弟纠正 2026-08-17)
- dsh 的工作区由**进程启动目录**决定:headless 的 session 归属、沙箱可写范围、Web UI 的默认工作区全都看启动 cwd
- **启动 dsh web / headless 一律 `terminal(workdir=<项目根>)`**(如 D:\Github\GTS-Play)。从错误目录启动 → Web UI 默认工作区指向错误路径(出现过 E:\Hermes Agent CN Desktop\... 变成工作区的「工作区错误」),headless 写文件也落错地方
- 判定:看 `~/.dsh/sessions/` 下 session 目录名(`--D-Github-GTS-Play--` = 正确);`~/.dsh/storages/workspace.json` 记录已注册工作区

### 🔴 沙箱限制(实测 2026-08-17)
- 默认 `workspace-write` 沙箱:**只能写启动 cwd 工作区**,写工作区外路径被拒
- 申请权限升级(danger-full-access)在 headless 下**无审批通道** → 直接失败关闭
- 表现:报告**降级写入启动 cwd**(如 E 盘工作区),任务本身完成
- 对策:任务要求写文件时,启动时 workdir 指向目标项目 → 报告落在工作区内即可正常写;否则接受降级后由 Hermes 事后移动

## 调度方式二:MCP(方式一,dsh-harness-mcp-server)⚠️ server 已跑通,agent_run 被 rc.6 bug 阻塞

- 插件:`@chushixixin/dsh-harness-mcp-server`(npm 0.1.10),装进 web profile 后**自动注册为 bundle**(自带 cordis.yml insert,端口 8090/127.0.0.1)
- 目标架构:Hermes(MCP client)→ http://127.0.0.1:8090/mcp → Harness agent(工具:agent_run / task_inbox / task_result)
- **当前状态(2026-08-17)**:MCP server **已正常运行**(8090 监听),`hermes mcp add harness_plugin` 成功(7 工具:echo / harness_list_tools / agent_run / task_inbox / task_result / rename_session / attach_session)
- 🔴 **缺陷 1(已解决)**:`@deepseek-ai/dsh-paths` 私有依赖缺失(`ERR_MODULE_NOT_FOUND`,dsh-agent-presets rc.1 的隐式依赖 bug,该包从未发布 npm、公开源码也没有)。**workaround 已实施**:在 `~/.dsh/profiles/web/node_modules/@deepseek-ai/dsh-paths/` 手写 stub 包(只导出 `expandHomePath`,见 references/dsh-mcp-integration.md)。⚠️ pnpm install 可能清掉手写 stub,升级后需复查
- 🔴 **缺陷 2(未解决,等上游)**:dsh rc.6 `agent ctx unscoped` bug → 插件日志 `preset mount skipped — upgrade dsh for full tool support` → `agent_run` 能创建 session 但返回空结果(assistantText/toolCalls 全空)。npm latest 就是 rc.6,无修复版;等 dsh 发布新版本后重启 `dsh web` 即自动恢复(配置已就位)
- 🔴 插件已自动注册时**不要再手动 insert 同 id**:`cordis.patch.yml` 里 insert `harness-mcp-server` 会报 `duplicate loader entry id` 启动失败;插件自带 insert,只需(如有需要)config 覆盖
- 🔴 `hermes mcp add` 是**交互式**命令:必须管道喂 stdin 否则挂起超时:`(echo n& echo Y) | hermes mcp add <name> --url <url>`(n=无认证,Y=启用全部工具)
- MCP 客户端直调:`scripts/mcp-agent-run.ps1`(StreamableHTTP:Accept 头 / SSE 解析 / session-id 处理,英文提示词避免 PS 编码问题)

## 调度方式三:Web UI JSON-RPC API(✅ 调度全通 + Web UI 可见 + 历史正常)

> 2026-08-17 验证:兄弟要求「web ui 要能够看到」时用此方式。创建的是 **Web UI 原生 session**:完全可见、历史正常加载(对比 headless 的 torn record 问题)。

dsh web 的 API 是 Cordis api-gateway 风格,`POST http://127.0.0.1:3080/api/<method>`:

```json
{ "type": "client-request", "rpcId": "任意唯一id", "method": "<method>", "payload": { ... } }
```

响应:`{ "result": { "ok": true, "value": ... } | { "ok": false, "error": { code, message } } }`

**核心流程**:
1. `session.create` `{ workspaceId: "<id>" }` → `{ sessionId }` 🔴 **必须带 workspaceId**,否则 session 不归入任何工作区(兄弟 2026-08-17 纠正:「怎么没在GTS-Play工作区中」)。workspaceId 从 `~/.dsh/storages/workspace.json` 的 `tables.workspaces` 键取(如 GTS-Play = `3f49bb06-...`);带 workspaceId 创建后,该 session 以工作区路径为 cwd 落地,Web UI 里正确显示在工作区下
2. `session.prompt` `{ sessionId, mode: "queue", content: [{ type: "text", text: "任务" }] }` → `{ accepted: true }`
3. 轮询 `session.history` `{ sessionId, maxMessages }` → 事件流:`turn/start` → `user/message` → `assistant/chunk`(生成中,可能数百条)→ `assistant/message`(含 reasoning + tool-call)→ `tool/call` → `step/end` → `turn/end`
4. `session.list` `{}` → `{ items: [{ sessionId }] }`

**要点**:
- 事件类型见 `references/dsh-web-api.md`;`assistant/chunk` 大量出现 = 模型在生成(agent 正常干活)
- 🔴 **中文任务文本易乱码**:PS 5.1 下 Invoke-WebRequest -Body 字符串默认编码问题 → agent 收到 `????`(实测 reasoning 里中文全变问号,靠推断执行)。对策:脚本文件带 BOM 执行、必要时任务文本用英文或显式 UTF-8 字节发送
- 轮询超时:agent 生成可能 1-2 分钟才出 assistant/message;poll 间隔 5s、上限按任务估
- ⚠️ rc.6 限制(与缺陷 2 同源):`tool/call` 后事件流直接 `step/end → turn/end`,**无 tool/result、无最终文本** —— 工具结果回合不闭环,agent 发出工具调用后拿不到结果。等上游修复

## dsh 常用操作

```powershell
dsh --help                          # 顶层命令(web/plugin/--profile)
dsh --profile headless --help       # headless 参数(仅 task 文本)
dsh web                             # 启动 Web UI(后台常驻,3080)
dsh plugin --profile web add <pkg>  # 装插件(自动进 bundle + pnpm install)
dsh --dump-config                   # 看 profile 组合树
# 重启 web:按 3080 端口定位进程 Stop-Process → dsh web 重新后台启动
```

## Hermes 下执行命令的坑(本次踩到)

- **避免 `& "路径"` 调用符**:Hermes terminal 检测器会把 `&` 误判为 backgrounding 而拒绝整条命令。用:裸命令(`opencode db ...`)、`Start-Process`、或变量赋值后 `$var` 调用
- **PowerShell 运算符要加括号**:`if (Test-Path x -and -not (Test-Path y))` 会把 `-and` 当成 Test-Path 参数报错;必须 `if ((Test-Path x) -and -not (Test-Path y))`
- **GitHub 网络诊断**:页面 https 可访问 ≠ git 协议可用(git clone 可能 `Connection reset 10054`);codeload tarball 通道可能截断(下载后必须 `tar -tzf` 校验,`gzip: unexpected end of file` = 不完整,用 `curl --retry 5 --retry-delay 3` 重下;⚠️ 旧版 curl **无 `--retry-all-errors`** 参数,别加)
- **Windows tar 坑**:PATH 里的 msys/Git tar 解析 Windows 路径报 `tar (child): Cannot connect to C: resolve failed` → 文件可能完好,改用 `C:\Windows\System32\tar.exe`(System32 的 tar 能正常处理)
- **PS 5.1 中文脚本必须带 BOM**:写含中文的 .ps1 用 `[System.Text.UTF8Encoding]::new($true)`,否则 PS5.1 按 GBK 读 → 中文乱码、引号配对错乱、语法报错(`IncompleteHashLiteral` 等假错误)
- **MCP StreamableHTTP 客户端模式**(调 8090 时):① 必须带 `Accept: application/json, text/event-stream` 头(否则 406 Not Acceptable)② 响应是 SSE(`data:` 行,可能多条 → 取最后一条解析)③ session-id 从 initialize 响应头 `mcp-session-id` 拿,后续请求带上 ④ 直接复用 `scripts/mcp-agent-run.ps1`
- **zstd session 日志撕裂**:headless 运行中 Web UI 加载该 session 报 `corrupt Zstandard session log: complete frame contains a torn JSONL record` —— 是「还在写入」的正常现象(非真损坏),等任务完成后再看;任务结果从 stdout 日志拿,不依赖 session 历史
