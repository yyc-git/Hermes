# dsh MCP 集成完整记录(2026-08-17 实测)

> 环境:npm 全局 `@deepseek-ai/dsh@0.1.0-rc.6`,Node v24.16.0,Windows。插件 `@chushixixin/dsh-harness-mcp-server@0.1.10`。

## 集成步骤(已验证可行)

```powershell
# 1. 装插件(自动注册为 web profile 的 bundle)
dsh plugin --profile web add @chushixixin/dsh-harness-mcp-server
#    → 写 profile package.json 的 dependencies + dsh.profile.bundles,插件自带 cordis.yml(insert + port 8090)
#    不要手动改 cordis.patch.yml insert 同 id(→ duplicate loader entry id 崩溃);保持 [] 即可

# 2. 修复上游私有依赖 dsh-paths(见下),然后重启
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 3080,8090 } | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
dsh web   # background;验证 3080 + 8090 同时监听

# 3. Hermes 注册(交互式,管道喂 n + Y)
cmd /c "(echo n& echo Y) | hermes mcp add harness_plugin --url http://127.0.0.1:8090/mcp"
# 成功标志: "✓ Connected! Found 7 tool(s)" + "Saved ... (7/7 tools enabled)"
```

## dsh-paths 本地 stub(完整代码)

位置:`~/.dsh/profiles/web/node_modules/@deepseek-ai/dsh-paths/`(物理目录,Node 沿 node_modules 向上解析即命中)。

`package.json`:
```json
{
  "name": "@deepseek-ai/dsh-paths",
  "version": "0.0.1-rc.1",
  "description": "local stub for un-published upstream package (dsh-agent-presets rc.1 implicit dependency)",
  "type": "module",
  "main": "lib/index.js",
  "exports": { ".": "./lib/index.js", "./lib/index.js": "./lib/index.js" }
}
```

`lib/index.js`:
```js
export function expandHomePath(p) {
  if (typeof p !== "string") return p;
  if (p === "~") return process.env.USERPROFILE || process.env.HOME || p;
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    const home = process.env.USERPROFILE || process.env.HOME || "";
    return home ? p.replace(/^~[\\/]/, home + "\\") : p;
  }
  return p;
}
export default { expandHomePath };
```

⚠️ 只有 dsh-agent-presets 的 `lib/index.js` 和 `lib/invariant.js` 引用了 dsh-paths,且只用 `expandHomePath`。`pnpm install` 会清掉手动 stub,插件升级/重装后需重建。

## 已知限制:dsh rc.6 `agent ctx unscoped` bug

dsh web 日志:
```
[harness-mcp-server] apply called, port= 8090
[harness-mcp-server] MCP server listening on 127.0.0.1:8090
[harness-mcp-server] 存量捞回完成: attached=0 failed=0
[harness-mcp-server] agent ctx unscoped (dsh rc.6 bug); preset mount skipped — upgrade dsh for full tool support
```
- 表现:`agent_run` 返回 `{sessionId, assistantText:"", toolCalls:[], ...}`(session 创建成功但 agent 无工具)
- npm latest = rc.6,无修复;等上游。修复后重启 dsh web 自动恢复,无需改任何配置

## MCP StreamableHTTP 直调脚本模式(无 SDK 调试)

PowerShell 要点:
- 必须 `Accept: application/json, text/event-stream`(缺 → 406)
- 响应 SSE:多行 `data: {json}`,取最后一条
- initialize 响应头 `mcp-session-id`,后续请求带上
- .ps1 文件用 UTF-8 **带 BOM** 写入(PS5.1 按 GBK 读无 BOM → 中文乱码语法崩)

```powershell
$base = "http://127.0.0.1:8090/mcp"
function Invoke-McpBody($sid, $bodyObj, $timeoutSec = 300) {
  $h = @{ "Accept" = "application/json, text/event-stream" }
  if ($sid) { $h["mcp-session-id"] = $sid }
  $r = Invoke-WebRequest -Uri $base -Method Post -Headers $h -ContentType "application/json" `
    -Body ($bodyObj | ConvertTo-Json -Depth 8 -Compress) -UseBasicParsing -TimeoutSec $timeoutSec
  $dataLines = @($r.Content -split "`n" | Where-Object { $_ -like "data:*" } |
    ForEach-Object { $_.Substring(5).Trim() } | Where-Object { $_ })
  if ($dataLines.Count -eq 0) { return $null }
  return ($dataLines[-1] | ConvertFrom-Json)   # 取最后一条(最终结果)
}
# 握手
$initBody = @{ jsonrpc = "2.0"; id = 1; method = "initialize"; params = @{
  protocolVersion = "2024-11-05"; capabilities = @{}; clientInfo = @{ name = "hermes-cli-test"; version = "1.0" } } }
$r0 = Invoke-WebRequest -Uri $base -Method Post -Headers @{ "Accept" = "application/json, text/event-stream" } `
  -ContentType "application/json" -Body ($initBody | ConvertTo-Json -Depth 5) -UseBasicParsing -TimeoutSec 20
$sid = $r0.Headers["mcp-session-id"]
$null = Invoke-McpBody $sid @{ jsonrpc = "2.0"; method = "notifications/initialized" }
# tools/call agent_run
$res = Invoke-McpBody $sid @{ jsonrpc = "2.0"; id = 3; method = "tools/call"; params = @{
  name = "agent_run"; arguments = @{ task = "..."; cwd = "D:\Github\GTS-Play"; title = "..." } } }
```

agent_run inputSchema(0.1.10):`task`(string,必填)/ `context`(string)/ `cwd`(string)/ `sessionId`(string,续接)/ `title`(string)。返回结构化:`sessionId / assistantText / toolCalls / toolResults / changes / verification / leftovers`。

## 相关

- headless 沙箱(workspace-write,写外部路径降级进 cwd)详见主 SKILL.md
- dsh 插件生态:`dsh plugin --profile <name> add <pkg>`;`--patch ./xxx.yml` 可叠加额外配置层
- 服务状态:3080 = Web UI,8090 = MCP,同一 dsh web 进程
