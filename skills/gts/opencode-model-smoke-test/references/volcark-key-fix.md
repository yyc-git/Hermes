# volcark provider key 失效自修流程（2026-08-18 两次实测定稿）

> 场景：dispatch 火山模型（volcark/deepseek-v4-flash-ga-260731 等）即死，opencode.log 报：
> `AI_APICallError: the API key or AK/SK in the request is missing or invalid. request id: 02178...`（request id 含 02178... 时间戳）
> 特征：part 表只有初始 brief、无 step-start、time_updated 停几秒（dispatch 即死）。

## 根因（实测确认，2026-08-18 两次复发定稿）

**4098 server 进程内 `ARK_CODING_API_KEY` 环境变量为空**，不是 key 本身失效：

- opencode.json 里 volcark 的 apiKey 配置是 `{env:ARK_CODING_API_KEY}` 引用（不硬编码）
- 兄弟手动配的 env var 未随 server 进程继承（server 从 Hermes 后台拉起，继承的是启动时环境）
- 纯 node https 直连 volcark API 可能 HTTP 200（key 真可用），但 OpenCode server 进程读不到 → 报 key missing

### 🔴 复发机制：Windows 进程间 env var 不反向同步（关键）

`[Environment]::SetEnvironmentVariable("ARK_CODING_API_KEY", value, "User")` 写入的是**注册表**，**只对之后新启动的进程生效**。已运行的 4098 进程内那份独立副本永远是它**启动时**继承的旧值——即使你后来改了。

**日志特征**：ERROR 之前紧跟 `cleanup failed exitCode=1`（清理子系统重载内存配置用了旧值），随后一波 volcark 401 后自动 fallback 到 opencode-go。

**含义**：
- 第一次修复后约 1 小时又复发 = 正常，因为有人/某子系统触发过清理、又重新派发了基于旧 env var 的请求
- 任何「env var 改了 / opencode.json 改了 / provider 改了」之后**必须重启 4098**，且只对**新进程**生效
- 看到 `AI_APICallError API key missing` 第一反应 = **重启 4098**（1 分钟修），别再花时间诊断配置是否对

### 诊断 SQL 不够，必须看 opencode.log

- 路径：`$env:USERPROFILE\.local\share\opencode\log\opencode.log`
- 鉴别关键字：`AI_APICallError: the API key or AK/SK in the request is missing or invalid`，request id 含 `02178...` 时间戳
- 与「opencode-go 余额不足」（`Insufficient balance`）区分
- 与「4098 不热加载」（`ProviderModelNotFoundError: Model not found`）区分

## 自修步骤（bot 可全程完成，不需要兄弟手动操作，兄弟只需提供 key）

```powershell
# ① 兄弟提供 key 后，写入用户级环境变量（持久化，重启不丢）
[Environment]::SetEnvironmentVariable("ARK_CODING_API_KEY", "<key>", "User")

# ② 查活跃 session（key 报错死的 session 不算活跃；无任务在跑才可重启）
$now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
opencode db "SELECT id, substr(title,1,50), time_updated FROM session WHERE time_updated > $($now - 600000) ORDER BY time_updated DESC LIMIT 10" --format json

# ③ 杀旧 server（opencode.exe web 进程 + 父 pwsh 都要杀）
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'opencode.*serve|opencode\.exe' } | Select-Object ProcessId, Name
Stop-Process -Id <opencode.exe PID> -Force
Stop-Process -Id <父pwsh PID> -Force
Start-Sleep -Seconds 3
# 确认端口释放：Get-NetTCPConnection -LocalPort 4098 -State Listen（空 = 已释放）

# ④ 后台重启（🔴 必须 terminal(background=true)，server 常驻永不退出）
# opencode serve --port 4098 --hostname 127.0.0.1 --print-logs

# ⑤ HTTP 就绪验证
try { $r = Invoke-WebRequest -Uri "http://localhost:4098" -TimeoutSec 5 -UseBasicParsing; "4098 在线 (HTTP $($r.StatusCode))" } catch { "未就绪: $($_.Exception.Message)" }

# ⑥ attach 实测（关键！HTTP 200 只证明 server 起来了，provider 要真实 dispatch 才验证）
# 写最小纯问答 brief（禁止改文件/跑命令，只让模型报自己名字）
# opencode run $brief -m volcark/deepseek-v4-flash-ga-260731 --attach http://localhost:4098 --title "volcark-conn-test" --no-replay --auto --dir D:\Github\GTS-Play
# 返回模型名 = ✅ 修复成功
```

## 恢复旧 session

key 失效时挂掉的 session（dispatch 即死）不需要重新 dispatch：直接对原 session 发「继续」唤醒即可
（`opencode run -s <sessionId> -m <原模型> --attach http://localhost:4098 --dir <项目> --no-replay "继续"`）。

## 诊断优先级

- 🔴 必须查 opencode.log（`$env:USERPROFILE\.local\share\opencode\log\opencode.log`）——SQL 查 part/event 看不出 key 错误
- 错误特征与「opencode-go 余额不足」（Insufficient balance）区分：前者报 `API key...missing or invalid`，后者报 `Insufficient balance`
- 与「4098 不热加载」区分：不热加载报 `ProviderModelNotFoundError: Model not found`，key 失效报 `AI_APICallError: API key missing or invalid`
