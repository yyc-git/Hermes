# dsh Web UI JSON-RPC API(实测 2026-08-17,dsh 0.1.0-rc.6)

> 来源:deepseek-harness 源码 `apps/web/tests/smoke-real.e2e.ts` 的 rpc 封装 + 本机 3080 实测。

## 通用请求格式

```
POST http://127.0.0.1:3080/api/<method>
Content-Type: application/json

{
  "type": "client-request",
  "rpcId": "任意唯一id(如 hermes-session.create-123)",
  "method": "<method>",
  "payload": { ...method 参数... }
}
```

响应:

```json
{ "result": { "ok": true, "value": <返回> } }
{ "result": { "ok": false, "error": { "code": "...", "message": "..." } } }
```

## 核心方法

| 方法 | payload | 返回 value | 说明 |
|---|---|---|---|
| `session.create` | `{}` | `{ sessionId }` | 创建 Web UI 原生 session |
| `session.prompt` | `{ sessionId, mode: "queue", content: [{ type: "text", text: "..." }] }` | `{ accepted: true }` | 投递任务(mode 用 queue,异步) |
| `session.history` | `{ sessionId, maxMessages }` | `{ events: [{ event: { type, data } }], hasMore }` | 轮询事件流 |
| `session.list` | `{}` | `{ items: [{ sessionId }] }` | 列 session |
| `session.export` / `session.fork` / `session.rename` | — | — | e2e 中出现过的其他端点 |
| `settings.describe` | — | — | 设置查询 |

## 事件流类型(history events)

按顺序出现的典型事件:

```
permission/preset, sandbox/mode, approval/policy, agent/inbox/spliced,
turn/start, step/start,
user/message,               ← 任务文本
session/title,              ← 自动命名
request/header, request/context,
assistant/chunk × N,        ← 模型流式生成(数百条正常 = agent 干活)
assistant/message,          ← 完整消息(含 reasoning / tool-call blocks)
tool/call,                  ← 工具调用(name + arguments JSON)
tool/result,                ← 工具结果(⚠️ rc.6 下缺失,turn 在 tool/call 后直接结束)
step/end, turn/end
```

- `assistant/message` 的 `data.message.content` 是 blocks 数组:`{type:"reasoning",text}` / `{type:"tool-call",name,arguments}` / `{type:"text",text}`
- `data.message.source` 含模型信息:`{ provider: "deepseek-official", model: "deepseek-v4-flash" }`
- `data.usage` 含 token 统计(inputTokens/outputTokens/cacheReadTokens/reasoningTokens)

## 状态判定

| 事件特征 | 判定 |
|---|---|
| 大量 `assistant/chunk` | 模型生成中,agent 正常 |
| `assistant/message` + `tool/call` | agent 已决策并发出工具调用(调度链路全通) |
| `tool/call → step/end → turn/end` 无 result | ⚠️ rc.6 工具闭环 bug,结果未注入 |
| `turn/end` 后有最终 text 块 | 完整完成 |

## PowerShell 调用模板(PS 5.1 兼容)

```powershell
# 写文件必须 UTF8 BOM:[System.Text.UTF8Encoding]::new($true)
$base = "http://127.0.0.1:3080"
function Invoke-Rpc($method, $payloadObj) {
  $body = @{ type = "client-request"; rpcId = "hermes-$method-$(Get-Random)"; method = $method; payload = $payloadObj } | ConvertTo-Json -Depth 8 -Compress
  $r = Invoke-WebRequest -Uri "$base/api/$method" -Method Post -ContentType "application/json" -Body $body -UseBasicParsing -TimeoutSec 60
  $j = $r.Content | ConvertFrom-Json
  if (-not $j.result.ok) { throw "$method failed: $($j.result.error.code) $($j.result.error.message)" }
  return $j.result.value
}
$created = Invoke-Rpc "session.create" @{}
$sid = $created.sessionId
$null = Invoke-Rpc "session.prompt" @{ sessionId = $sid; mode = "queue"; content = @(@{ type = "text"; text = "任务文本" }) }
# 轮询 history,直到出现 assistant/message 的 text 块或超时
```

## 中文编码坑(实测)

- PS 5.1 的 `Invoke-WebRequest -Body <string>` 发送时中文可能被转成 `????`,agent 的 reasoning 里显示乱码(它靠上下文推断意图,仍会执行)
- 缓解:① .ps1 文件带 BOM 保存;② 任务文本尽量简短、关键命令用英文;③ 必要时把文本用 `[System.Text.Encoding]::UTF8.GetBytes()` 构造 body

## 关联

- 本机已跑通的示例 session:`session-888381eb-...`(事件流含 tool/call,证明调度链路通)
- dsh web 必须在目标项目目录启动,否则新 session 归属错误工作区(见 SKILL.md「工作区 = 启动 cwd」)
