---
name: windows-powershell-pitfalls
description: "Hermes terminal(PowerShell)在 Windows 上的可靠用法:& 调用符被误判为后台的规避、PS5.1 中文脚本必须带 BOM、Invoke-WebRequest 中文 body 需 UTF-8 字节、curl 别名劫持成 Invoke-WebRequest、tar.gz 必须用 System32 tar、cmd /c 引号规则、robocopy 退出码 1=成功、-and 运算符加括号。写临时脚本/调 HTTP API/解压/复制文件前先查本节。"
---

# Windows PowerShell 可靠用法(Hermes terminal)

> 本机 Hermes terminal 跑 PowerShell 7(pwsh),但 `powershell`(5.1)也常见。以下全部为实测踩坑,跨任务类型通用(迁移/调度 agent/文件操作都会遇到)。

## `&` 调用符会被 Hermes terminal 误判为后台执行

`& "C:\path with space\app.exe" args` 会被终端检测器当成 backgrounding 直接拒绝整条命令(报 "Foreground command uses '&' backgrounding")。

规避(任选):
- 无空格路径直接裸写:`C:\...\app.exe args`
- 变量赋值后调用(不带 `&`):`$exe = "C:\...\app.exe"; $exe args`
- `cmd /c "C:\path with space\app.exe" args`(路径带空格时必须整体引号)
- `Start-Process -FilePath ... -ArgumentList ... -Wait -NoNewWindow -RedirectStandardOutput out.txt -RedirectStandardError err.txt`(重定向到文件再读,适合需要捕获输出的场景)

补充实测(2026-08-17):
- 🔴 **多语句拼接时 `&` 必被误判**:`Start-Sleep 5; & "C:\...\app.exe" db "..."` 整条被拒(报 backgrounding 错),即使前面语句只是 sleep
- 🔴 **`$exe args` 变量调用在 Hermes terminal 下不可靠**:命令被包装进 `Invoke-Expression`,`$oc = "..."; $oc db "..."` 报 `Unexpected token 'db'`(IEX 上下文里变量后接参数解析失败)。skill 上方建议的 `$exe args` 只在普通 PS 会话有效
- ✅ **可靠替代:HTTP API 优先**——查 OpenCode session 状态/拿 sessionId 用 `Invoke-RestMethod -Uri "http://localhost:4098/api/session"` 按 title 过滤,完全绕开 exe 调用。例:`(Invoke-RestMethod -Uri "http://localhost:4098/api/session" -Method Get -TimeoutSec 10).data | Where-Object { $_.title -eq 'xxx' } | Select-Object id`(dispatch 后 20-30s session 才注册,拿不到就 sleep 再查)
- ✅ **最通用替代:写临时 .ps1 + `powershell -NoProfile -ExecutionPolicy Bypass -File` 执行(2026-08-17 实测定稿)**——`opencode run $brief -m ...`(dispatch)、`opencode db "SELECT ..." --format json` 等**无法用 HTTP API 替代的 exe 调用**,一律 `write_file` 写 `_tmp-*.ps1`(脚本内可自由用 `& $oc`),再 `powershell -File` 跑。实测:本机 `opencode.exe` 带参数 + 引号内嵌 SQL 时,任何内联写法(裸路径/变量/Invoke-Expression)都会在 IEX 包装下解析失败(`Unexpected token 'db'`),只有 -File 路径稳定。脚本放项目 `.workflow/` 目录(会被 git 忽略),跑完可留作诊断存档

## 临时 .ps1 脚本编码(PS 5.1)

用 `powershell -ExecutionPolicy Bypass -File x.ps1` 执行时,PS 5.1 默认按 ANSI/GBK 读**无 BOM 的 UTF-8 文件** → 中文乱码 → 引号配对错乱 → 假语法错误(`IncompleteHashLiteral`、`Unexpected token`、`MissingEndCurlyBrace` 等,报错行号对不上)。

- 🔴 **关键判据:pwsh 7 `ParseFile` 通过 ≠ powershell.exe(5.1) 能跑**。两套解析器对无 BOM 文件的编码假设不同,先用 `[System.IO.File]::ReadAllBytes()[0..2]` 查 BOM(应为 `EF BB BF`),无 BOM 先转再排错,别在语法里找原因
- 写脚本用 `[System.IO.File]::WriteAllText($path, $content, [System.Text.UTF8Encoding]::new($true))`(**带 BOM**)
- 或直接用 pwsh 执行(默认 UTF-8,无此问题)
- 🔴 patch 工具改 .ps1 后 BOM 可能被保留也可能丢,改完重新查 BOM

### 🔴 中文路径变量在无 BOM ps1 里同样乱码 → Test-Path 误报「不存在」(2026-08-17 实锤)

PS 5.1 无 BOM 脚本里 **`$dir = "D:\...\笔记\项目文档\..."` 中文路径本身被 GBK 解析成乱码**,导致:
- `Test-Path $dir` 返回 **False**(文件/目录实际存在!)
- `Get-ChildItem $dir` 空输出
- 误判「OpenCode 没写产物」→ 白跑一轮诊断(本次 xiahui-data-fix 实锤:agent 写了 15 个文件,PS 报 False,node 秒确认)

**验证中文路径存在性/列目录 → 用 node 脚本**(`readdirSync`/`statSync`/`existsSync`),别信 PS 无 BOM 脚本的 Test-Path。node 对 UTF-8 路径零歧义。

### 🔴 含中文的消息/参数一律用 .mjs 发,不用 ps1(2026-08-17 两次实锤)

向 OpenCode 发「继续」消息(`opencode run -s <sid> -m ... --no-replay "继续执行…中文…"`)时:
- ps1 里单引号字符串含中文 → PS 5.1 按 GBK 解析 → 报 `The string is missing the terminator: '` 假语法错,消息发不出去(连续两次)
- ✅ 正确姿势:`write_file` 写 `.mjs`,用 `spawn(oc, [...args, msg], {stdio:'inherit'})` 或 `execSync`,中文消息原样 UTF-8 传递,零问题
- 规则:**ps1 只跑无中文参数的命令;任何含中文的命令参数/消息 → .mjs**

**完整可复制模板(发 OpenCode「继续」消息,2026-08-17 实测通过)**:

```js
// .workflow/_tmp-continue-<task>.mjs — 发送「继续」消息(LLM 静默失败唤醒/续接)
import { spawn } from 'node:child_process'
const oc = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/opencode-ai/bin/opencode.exe'
const sid = '<sessionId>'
const msg = '【续跑】你的 LLM 请求断流了(step-finish unknown, tokens 0)。请继续完成…<待办提示>'
const args = ['run', '-s', sid, '-m', '<原dispatch同款模型>', '--attach', 'http://localhost:4098', '--dir', 'D:/Github/GTS-Play', '--no-replay', msg]
const child = spawn(oc, args, { stdio: 'inherit', windowsHide: true })
child.on('error', (e) => { console.error('spawn error: ' + e.message); process.exit(1) })
child.on('exit', (code) => { console.log('opencode run exit=' + code); process.exit(code ?? 0) })
```

后台跑 `node .workflow/_tmp-continue-<task>.mjs` → 15s 后查 DB `time_updated` 确认恢复增长 → 重启 wait 脚本监控。

## Start-Process -PassThru 轮询 ExitCode(PS 5.1)

`Start-Process -PassThru` 后轮询 `$p.HasExited`,进程退出后再读 `$p.ExitCode` 可能是 **$null**(5.1 实测)→ `if ($p.ExitCode -ne 0)` 永远进不了失败分支,`Write-Host "exit $($p.ExitCode)"` 打出空值,任务实际成功却被误判失败。

- ✅ 直接 `Start-Process -Wait -PassThru` 同步等待,ExitCode 可靠(2026-08-17 worktree-junction.ps1 实测)
- 或 `$p.Refresh()` 后再读 ExitCode(不如 -Wait 稳)
- 判断依据:git 输出日志(stdout/stderr 重定向文件)显示成功但脚本报 exit 空 → 就是此坑,不是 git 失败

## 🔴 curl 在 PowerShell 里被别名劫持成 Invoke-WebRequest(2026-08-18 实锤)

PowerShell(含 pwsh 7)内置 `curl` 别名指向 `Invoke-WebRequest`,不是真 curl。**在 node 子进程里 `shell: 'powershell.exe'` 跑 `curl -s -X POST ... -H "Content-Type: ..."` 会报 `Cannot bind parameter 'Headers'. Cannot convert the "Content-Type: application/json" value of type "System.String" to type "System.Collections.IDictionary"`**——`-H` 是 curl 的参数,Invoke-WebRequest 根本不认。

规避(任选):
- ✅ **node 脚本直接用内置 `fetch`**(顶层 await 在 .mjs 可用),零外部依赖:`fetch(url, {method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`}, body: JSON.stringify(...)})`
- 或明确用 `curl.exe`(真 curl 全名,不经过别名):`curl.exe -s -X POST ... -H ...`
- 或 `Remove-Item Alias:curl` 后再 `curl ...`
- 报错特征是 `-H` 参数绑定失败(`Cannot bind parameter 'Headers'`),一眼可辨,不是网络问题

## Invoke-WebRequest 发中文 body(PS 5.1)

`-Body $json`(字符串)按非 UTF-8 编码发送 → 服务端/agent 收到 `?`(实测 dsh agent 的 reasoning 里中文全变问号,靠推断执行)。

- 用 `[System.Text.Encoding]::UTF8.GetBytes($json)` 传字节数组
- 某些 HTTP API(如 MCP StreamableHTTP)必须带 `Accept: application/json, text/event-stream`,否则 **406 Not Acceptable**

## tar.gz 解压:必须用 System32 tar

PATH 里的 msys/Git tar 处理 Windows 路径报 `tar (child): Cannot connect to C: resolve failed` + `gzip: stdin: unexpected end of file`(误报文件损坏;实测文件完好)。**msys tar 的 gzip 报错不可信**。

```powershell
cmd /c "C:\Windows\System32\tar.exe -xzf file.tar.gz -C outdir --strip-components 1"
# 校验完整性用 System32 tar -tzf 能列出 = 完整
```

## cmd /c 传参规则

- 含空格路径整体加引号,否则按空格拆成第一个 token(`'E:\Hermes' is not recognized` 类报错)
- `set VAR=value&& cmd`:`&&` 前必须有空格,否则 `value&&` 全被当 set 的值;`&&` 后接的 exe 路径带空格也要引号

## robocopy

- **退出码 1 = 成功复制了文件**(不是失败);>1 才有问题。判断成功看复制文件数,不要用 `$LASTEXITCODE -eq 0` 判断

## 🔴 守护/长驻脚本(while 循环)PS 陷阱(2026-08-18 watch-opencode-4098.ps1 实测)

写常驻守护脚本(循环扫描→拉起/重启进程)时踩到 5 个坑,全部已修,均为类级陷阱:

- 🔴 **变量名大小写不敏感 → 局部变量覆盖参数**:函数内 `$port = Get-NetTCPConnection -LocalPort $Port ...`(小写 `$port`)会创建局部变量;PowerShell 不区分大小写,后续同一函数内读 `$Port`(参数 4098)解析到的却是刚赋值的局部 `$port`=null → `Get-NetTCPConnection -LocalPort $Port` 报 `ParameterBindingValidationException: argument is null`。**规避:函数内局部变量名绝不与参数名仅差大小写**(改 `$listener` 而非 `$port` 对 `$Port`)。
- 🔴 **双引号内 `${r.count}` 是字面变量名不是属性访问**:`"... ${r.count} total ..."` 被解析为名为 `r.count` 的变量(空),必须 `"... $($r.count) total ..."`。`${...}` 只适合纯变量名插值,属性访问一律 `$()`。
- 🔴 **`Get-Process` 无 `.Parent` 属性**:`$child.Parent.Id` 抛异常(被 -ErrorAction SilentlyContinue 吞掉 → 父进程链没杀)。取父进程必须 `Get-CimInstance Win32_Process -Filter "ProcessId=$($child.Id)"` 读 `.ParentProcessId`,再 `Get-Process -Id <ppid>`。
- 🔴 **Start-Process 不能裸命令名**:`Start-Process -FilePath "opencode"` 走 CreateProcess 语义,不解析 .ps1 shim(本机 opencode 只有 npm 全局的 .cmd/.ps1,无独立 exe)→ 启动失败静默。**必须 `-FilePath` 指向 exe 绝对路径**(`C:\Users\Administrator\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe`),且先 `Test-Path` 校验。
- 🔴 **时间戳正则必须匹配 `Z` 时区后缀**:`-match '(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})'` 会把 `2026-08-18T02:36:48.123Z` 截成无时区串,`[DateTime]::Parse` 按**本地时区**解析 → 再 ToUniversalTime() 后 age 多 8 小时(显示 "last 480m ago" 实际刚发生)。正则要 `'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)'` 带上 Z,Parse 才按 UTC。
- 🔴 **守护进程被杀 → Start-Process 拉起的服务跟着死(进程树连带,2026-08-18 实测两次)**:守护脚本 `Start-Process -FilePath <exe>` 拉起的 server 是该守护的**子进程**,`process(action=kill)` 终止守护时按进程树连带杀掉 server → 端口立即掉线(实测 kill 守护后 4098 变 TimeWait/拒连)。**含义**:① 测完守护脚本不能只 kill 守护就收工——服务也没了,需重新单独拉起服务;② 真实运行中守护必须**常驻**(一旦被杀,守护+服务一起停,下次会话要重新跑守护拉起);③ Hermes 重启 → 守护后台进程跟着死 → 服务也死,这是已知运维约束,不是脚本 bug。

**守护脚本单元验证法(不跑 while 主循环)**:读原脚本 `$src`,`$src.IndexOf('while ($true)')` 截掉主循环,`Invoke-Expression` 余下函数定义 → 直接调用各函数单测。⚠️ `param` 块在 Invoke-Expression 下**不生效**,需先手动初始化参数变量(`$Port=4098; $LogPath=...` 等)再 IEX。已验证:这样能对 Test-Volcark401/Test-4098Heartbeat 做注入 fake log 的正/负用例,不动真实服务。

## PowerShell 语法

- 复合条件运算符必须括号包裹:`if (Test-Path x -and -not (Test-Path y))` 会把 `-and` 当成 Test-Path 的参数报错 → 必须 `if ((Test-Path x) -and -not (Test-Path y))`
- `Get-Content` 读 UTF-8 文件在 PS 5.1 必须 `-Encoding UTF8`(默认 ANSI 读成乱码)
- 复杂 hash 先赋变量再 ConvertTo-Json,避免 `@{...} | ConvertTo-Json` 管道内联在旧 PS 解析出错

## 🔴 node 模板字符串里的 `$_`/`[D]` 被 PowerShell 解释器吃掉(2026-08-18 volcark 诊断实测)

Hermes terminal 把 node 命令包在 `Invoke-Expression` 里执行,JS 模板字符串里的 `$_`、`[D]iagnostics[D]`、`$env:VAR` 等会被 PS 解析器当成变量展开或报错。实测 `node -e "console.log('$env:ARK_CODING_API_KEY')"` 完全报 `Missing condition in if statement` / `EndSquareBracketExpectedAtEndOfAttribute`(巨量 PS parser error 刷屏)。

**解决:把 PowerShell 命令写进 .ps1 文件,execFileSync 调用 ps1 文件**(实测完美):
```js
// node 调用 .ps1 文件
execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'D:/.../_tmp-query.ps1'], { encoding: 'utf8', windowsHide: true })
```

```powershell
# _tmp-query.ps1 — 读 OpenCode 进程 8012 的 ARK_CODING_API_KEY(全 PS 控制,无 JS 转义问题)
$key = [System.Diagnostics.Process]::GetProcessById(8012).StartInfo.EnvironmentVariables['ARK_CODING_API_KEY']
Write-Output ("len=" + $key.Length)
Write-Output ("value=" + $key)
```

**判定方法**:node -e 命令如果输出大量 PS parser error(无 BOM UTF-8 中文乱码、`$_` 报错、`[D]` 报错等)→ 不是你的代码问题,是包装层问题,改用 .ps1 + .mjs 路线。

## 🔴 `[D]iagnostics` 等含方括号/冒号的 PS 类型名在 JS 字符串里必被误解析(2026-08-18 实测)

任何传给 PS 的字符串如果含 `[System.Diagnostics.Process]` 这类带 `[Type]` 类型字面量,会先被 JS/PS 解析器当变量展开+报语法错(`EndSquareBracketExpectedAtEndOfAttribute`)。

- ✅ 正确姿势:上面 .ps1 文件路线,完全不经过 JS 字符串嵌入
- ❌ 错误:在 .mjs 里 `execSync('powershell -Command "$p = [System.Diagnostics.Process]::..."')` —— `.Diagnostics` 必被当成 JS 对象访问,后续全部错

## 🔴 内联 PS 复杂命令必须用 .ps1 文件(2026-08-18 多场景实测)

凡是同时满足以下任一条件,强制写 .ps1 文件而不是内联 `powershell -Command`:
- 含中文路径/中文参数/中文消息
- 含 PS 类型字面量(`[System.Diagnostics.Process]`、`[DateTime]`、`[Convert]` 等)
- 含 `$env:VAR`、`$LASTEXITCODE`、`$?` 等 PS 变量(这些会被 shell 提前解析)
- 含 `$_`(PS pipeline variable,node 模板字符串里会被吃)
- 含多层引号嵌套(JSON body + curl -H + Authorization Bearer 嵌套)
- 命令长度 >200 字符(出错时 PS 错误信息定位行号已不准)

**默认行为**:需要跑 PS 命令 → 先 `write_file` 写 `_tmp-*.ps1` → `powershell -NoProfile -ExecutionPolicy Bypass -File path/to/file.ps1`

## 🔴 复合 `Get-ChildItem -Recurse` + 特殊路径 → 终端静默吞输出 exit 126(2026-08-18 实测 5 次)

**症状**:terminal 工具调 `Get-ChildItem "E:\Long Path With Spaces" -Recurse -Filter "hermes.exe" ...` 这类命令时,**完整命令被 Hermes 终端的 IEX 包装层吃掉**,stdout/stderr 均为空字符串,exit code 126。**连 `echo hello` 跟在这类命令后面都被吞**,误以为是 echo 本身挂了,实际是整条复合命令的 stdout 被剥光。

**触发条件**(任一):
- 路径含冒号(`E:\...`、`C:\...`)
- 路径含空格(`Hermes Agent CN Desktop`)
- 路径长(>60 字符)
- 复合多个 cmdlet + 管道 + Select-Object(常见 ls + 筛选模式)

**错误识别**:看到空 stdout + exit 126 + 没报错文本 → **不是命令失败,是终端吞了**。`echo hello` 测试能通就说明 shell 活着,问题在复合命令的 stdout 被剥。

**解决**:
- ✅ **改用 `search_files` 工具**(ripgrep 后端,不会触发 IEX 包装)——`search_files(path='C:/...', pattern='hermes*.exe', target='files', file_glob='*.exe')`。对路径含特殊字符 / 中文 / 长路径都稳
- ✅ 缩小 path 范围:不传根目录(`C:\` / `D:\`),传更精确的子目录
- ✅ 拆成两步:先 `cd` 进目录 → 再 `Get-ChildItem` 不带长路径
- ❌ 不要尝试 `Get-ChildItem -ErrorAction SilentlyContinue | Out-String` 这类修补(无用,输出在更上游就被吞)

## 🔴 curl.exe `-w "%{http_code}"` 在某些 wrapper 下输出乱码(2026-08-18 实测)

Hermes terminal 的 exec shell 在某些路径下会把 `curl.exe -s -o NUL -w "%{http_code}"` 的 stdout 拦了一道,导致输出含 `Command failed` 而非 HTTP code。

- 替代:用 `curl.exe -s -o response.txt -w "%{http_code}" > httpcode.txt 2>&1`,`Get-Content httpcode.txt`(仍可能被包装层拦)
- 更好替代:node `fetch` + `res.status`(零问题):
  ```js
  const r = await fetch(url); console.log('HTTP ' + r.status)
  ```
- 验证 health check 类场景(node fetch 最稳)

## 相关技能交叉引用

- `desktop-notify-protocol`(gts):notify.ps1 调用中的 `&` 坑与双机路径
- `dsh-schedule`(gts):MCP StreamableHTTP 直调、GitHub 网络诊断(git 协议被重置用 codeload + `--retry 5`,`--retry-all-errors` 旧版 curl 没有)、zstd 日志撕裂
