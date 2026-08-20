# MCP agent_run client for dsh-harness-mcp-server (StreamableHTTP)
# Usage: adjust $task / $cwd below, then:
#   powershell -ExecutionPolicy Bypass -File mcp-agent-run.ps1
# NOTE: keep this file English-only (PS5.1 reads UTF-8 no-BOM scripts as GBK and
# Chinese text breaks string quoting). For Chinese task text, save with BOM.
$base = "http://127.0.0.1:8090/mcp"

function Invoke-McpBody($sid, $bodyObj, $timeoutSec = 300) {
  $h = @{ "Accept" = "application/json, text/event-stream" }
  if ($sid) { $h["mcp-session-id"] = $sid }
  $json = $bodyObj | ConvertTo-Json -Depth 8 -Compress
  $r = Invoke-WebRequest -Uri $base -Method Post -Headers $h -ContentType "application/json" -Body $json -UseBasicParsing -TimeoutSec $timeoutSec
  $lines = $r.Content -split "`n"
  $dataLines = @($lines | Where-Object { $_ -like "data:*" } | ForEach-Object { $_.Substring(5).Trim() } | Where-Object { $_ })
  if ($dataLines.Count -eq 0) { return $null }
  return ($dataLines[-1] | ConvertFrom-Json)  # last SSE data line = final result
}

# 1. initialize (grab session id from response HEADER)
$initBody = @{ jsonrpc = "2.0"; id = 1; method = "initialize"; params = @{ protocolVersion = "2024-11-05"; capabilities = @{}; clientInfo = @{ name = "mcp-client"; version = "1.0" } } }
$r0 = Invoke-WebRequest -Uri $base -Method Post -Headers @{ "Accept" = "application/json, text/event-stream" } -ContentType "application/json" -Body ($initBody | ConvertTo-Json -Depth 5) -UseBasicParsing -TimeoutSec 20
$sid = $r0.Headers["mcp-session-id"]
Write-Host "session-id: $sid"

# 2. initialized notification
$null = Invoke-McpBody $sid @{ jsonrpc = "2.0"; method = "notifications/initialized" }

# 3. tools/call agent_run (sync)
$call = @{
  jsonrpc = "2.0"; id = 3; method = "tools/call"
  params = @{
    name = "agent_run"
    arguments = @{
      task = "List the first 5 entries of the current directory and return the output."
      cwd = "D:\Github\GTS-Play"
      title = "mcp-agent-run-test"
    }
  }
}
Write-Host "calling agent_run (sync)..."
$res = Invoke-McpBody $sid $call 360
if ($res) {
  $c = $res.result.content
  if ($c) { $c | ForEach-Object { Write-Host $_.text } }
  else { Write-Host ($res.result | ConvertTo-Json -Depth 6) }
  if ($res.error) { Write-Host ("[ERR] " + $res.error.message) }
} else { Write-Host "no response" }
