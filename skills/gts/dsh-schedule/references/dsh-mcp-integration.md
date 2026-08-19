# dsh-harness-mcp-server 集成记录(2026-08-17,已跑通 server)

## 目标
Hermes = 大脑,Harness = 手臂:通过 MCP 让 Hermes 调度 Harness 执行编码任务。

## 安装步骤(已执行成功)
```powershell
dsh plugin --profile web add @chushixixin/dsh-harness-mcp-server
# 自动:写入 web profile package.json 的 dsh.profile.bundles + pnpm install(109 包,17s)
```
插件包结构:`~/.dsh/profiles/web/node_modules/@chushixixin/dsh-harness-mcp-server/`
- `cordis.yml`(bundle patch):自带 insert,id=harness-mcp-server,config: http:true, port:8090, host:127.0.0.1
- 工具:echo / harness_list_tools / agent_run(同步)/ task_inbox(异步)/ task_result(轮询)/ rename_session / attach_session
- 结果结构:{sessionId, assistantText, toolCalls, toolResults, changes, verification, leftovers}

## 踩坑 1:duplicate loader entry id(已解决)
- 现象:`dsh web` 启动失败 `duplicate loader entry id: harness-mcp-server`
- 根因:插件已作为 bundle 自动注册(自带 insert),又手动在 cordis.patch.yml insert 同 id
- 修复:cordis.patch.yml 恢复为 `[]`,插件自带配置即生效

## 踩坑 2:dsh-paths 私有依赖(✅ 已解决,stub workaround 已实施)
- 现象:`Cannot find package '@deepseek-ai/dsh-paths' imported from @deepseek-ai/dsh-agent-presets/lib/index.js`
- 根因:插件依赖 `@deepseek-ai/dsh-agent-presets@0.0.1-rc.1`(npm latest 就是 rc.1),其 lib 代码 import `@deepseek-ai/dsh-paths`(仅 index.js + invariant.js 两处,都只用 `expandHomePath`),但 package.json **未声明**该依赖(隐式依赖 bug)
- `@deepseek-ai/dsh-paths` 在 registry.npmjs.org 和 npmmirror **均 404**;deepseek-harness 公开源码 master 的 packages/ 里也**没有**这个包(全仓搜 0 个) → 纯私有/未发布
- **workaround(已实施生效)**:在 `~/.dsh/profiles/web/node_modules/@deepseek-ai/dsh-paths/` 手写 stub:
  - package.json:`{"name":"@deepseek-ai/dsh-paths","version":"0.0.1-rc.1","type":"module","main":"lib/index.js","exports":{".":"./lib/index.js","./lib/index.js":"./lib/index.js"}}`
  - lib/index.js:`export function expandHomePath(p){...}`(展开 ~ → process.env.USERPROFILE)
  - 生效验证:dsh web 启动日志出现 `[harness-mcp-server] MCP server listening on 127.0.0.1:8090`
- ⚠️ **pnpm install 可能清掉手写 stub**;升级 dsh / 重装插件后必须复查该目录

## 踩坑 3:dsh rc.6 `agent ctx unscoped`(❌ 未解决,等上游)
- 现象:agent_run 调用成功返回结构化结果,但内容全空:`{"sessionId":"...","assistantText":"","toolCalls":[],"toolResults":[],"changes":"","verification":"","leftovers":""}`
- 日志:`[harness-mcp-server] agent ctx unscoped (dsh rc.6 bug); preset mount skipped — upgrade dsh for full tool support`
- 根因:dsh rc.6 的 agent 上下文作用域 bug → 插件挂载 agent 工具集(preset)被跳过 → agent 无工具可执行
- 状态:npm latest 就是 0.1.0-rc.6,无修复版;等上游发布新版 → 重启 `dsh web` 即自动恢复(配置已就位,无需改动)

## Hermes 侧注册(交互式!)
```powershell
# mcp add 是交互式命令,必须管道喂 stdin(n=无认证,Y=启用全部工具),否则挂起超时
(echo n& echo Y) | hermes mcp add harness_plugin --url http://127.0.0.1:8090/mcp
# 确认:hermes mcp list 应显示 7 个工具
```

## StreamableHTTP 客户端模式(直调 8090 时)
1. POST /mcp,必须带 `Accept: application/json, text/event-stream`(否则 406)
2. `initialize` → 从**响应头** `mcp-session-id` 拿 session id
3. 发 `notifications/initialized` 通知(带 session-id header)
4. `tools/list` / `tools/call`:响应是 SSE(`event: message` + `data: {...}` 行),**取最后一条 data** 解析(可能有多条进度事件)
5. agent_run 参数:{task(必填), context, cwd, sessionId, title}
6. 直接复用 `scripts/mcp-agent-run.ps1`

## 网络补充
- 本机 GitHub:https 页面可访问,但 git clone 常 `OpenSSL SSL_read: Connection was reset, errno 10054`(git 协议被断);codeload tarball 通道可用但可能截断(13MB 时 gzip 校验失败)
- 代理:verge-mihomo(D:\vpn\verge-mihomo.exe)监听 7897;`D:\Github\GTS-Play\scripts\clash-proxy-manager.ps1` 有连通性检测(先测直连 github,不可达才切全局;Clash Party 无 REST API,勿强切 -Mode global)
