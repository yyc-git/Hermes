---
name: "desktop-power-pitfalls"
description: "Hermes terminal(PowerShell 7)在 Windows 上的 4 类静默失败边界:复合命令吞引号 / & 调符误判后台 / 复合参数解析错 / 长路径被 GBK 吃掉。兄弟 2026-08-18 一晚撞 5 次,本 skill 集中沉淀。"
status: "active"
trigger: "terminal 跑复合命令、复合参数、长中文路径、PowerShell + Node 互调时 必读。出现 exit 126 + 空输出、ParameterBindingException、A positional parameter 报错 时查本 skill。"
created: "2026-08-18"
umbrella: false
---

# desktop-power-pitfalls

> 兄弟 2026-08-18 一晚撞 5 次同源错误(terminal exit 126 空输出 / 复合参数解析失败),本 skill 集中沉淀
> 适用:Hermes Desktop + terminal 工具(pwsh 7) + Node 子进程 + PowerShell 互调

---

## 4 类边界(本轮撞全)

### 边界 1:复合命令 + 中文路径 / 特殊字符 = 静默 exit 126 空输出

**症状**:
```
$ Get-ChildItem "E:\Hermes Agent CN Desktop\data\hermes-home" -Recurse -Filter "hermes.exe" -ErrorAction SilentlyContinue
exit_code: 126  output: ""  (空)
```

**根因**: PowerShell 对带空格 / 中文 / 长路径的复合命令,**参数被吞**但**不报错**(只吞参数,不抛错)。`errorAction SilentlyContinue` 加重沉默。

**绕开**:
- **拆成单条命令**(`cd` + `node` + `echo` 分开)
- **用 search_files / read_file 替代** Get-ChildItem (避免路径)
- **临时文件 + spawn** 调(见边界 4)

---

### 边界 2:Node `execFileSync` 调 PowerShell = 引号地狱

**症状**:
```
execFileSync("powershell", ["-NoProfile", "-Command", `Get-ChildItem "${DIR}" -Pattern '${KW}'`])
# 中文路径 + 单引号被 Node 字符串包裹后,PS 收到的实际是空 Pattern
# → "Select-String : A positional parameter cannot be found that accepts argument '...'"
```

**根因**: Node 字符串里 `'` 跟 PS 的 `'...'` 冲突,被 PS 当作空字符串或参数边界。

**绕开**:
- **写临时 .ps1 文件 + spawn 调**:`-File <path> -Dir <dir> -Pattern <pat>`(参数显式,无引号冲突)
- 见 gts-hermes-memory-bridge 的 `ripgrep()` helper

---

### 边界 3:PowerShell 参数 `=` 紧接的"-"开头的字符串 = 解析错

**症状**:
```powershell
pwsh -NoProfile -File notify.ps1 -Message '你先 state.db 优先' -Title 'x'
# PW error: "Cannot process argument transformation on parameter 'Timeout'. Cannot convert value '先' to type 'System.Int32'"
```

**根因**: PS 看 `-Message` 后第一个 token 是 `你先`,把 `先` 当成下一参数 `-Timeout` 的值。

**绕开**:
- **message 整体用单引号包裹**(PS 单引号不展开)
- **避免 message 里以 `-` / 数字 / 关键字开头**
- **实在要用,先 `''` 双单引号转义**

---

### 边界 4:Windows sqlite 并发调 = "database is locked (5)"

**症状**:
```
$ sqlite3 state.db "SELECT ..."
Error: stepping, database is locked (5)
```

**根因**: Windows sqlite 不像 Linux 那样自动释放,前一个 handle 没关就开新连接,锁敏感。

**绕开**:
- **每条 sqlite 调用后 200ms 间隔**(busy-wait 即可)
- 或 `--retry` (sqlite3 自带) / 串行化所有 sqlite 调用

### 边界 6(2026-08-19):PowerShell `& "<绝对路径>"` 调用符误判 backgrounding

**症状**:
```powershell
$ "C:\Users\Administrator\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe" db "SELECT id FROM session WHERE title='prop-modal-fix-rca'" --format json
exit_code: -1  status: "Foreground command uses '&' backgrounding. Use terminal(background=true) for long-lived processes"
# 或者
Invoke-Expression '..."C:\...\opencode.exe" db "..."...'
Invoke-Expression: Unexpected token 'db' in expression or statement
```

**根因**: PowerShell 的 `&` 是**调用运算符(call operator)**——PS parser 看到 `& "<path>"` 会先按 backgrounding job 语义解析,即使后面不是 background command;绝对路径含空格/中文/`(...)\` 时进一步触发 syntax error。

**绕开**:
- **直接 PATH 调**(系统已有 `opencode.exe` 在 PATH):`opencode db "SELECT ..." --format json` —— PS 看不到 `&` 就不解析
- **路径必须用绝对路径时**:用 `Start-Process` 替代 `&`,或把路径放到变量里:`$exe = "C:\...\opencode.exe"; & $exe db "..."`(变量形式 PS 不会当 backgrounding)
- **Hermes terminal 是前台命令**(`background=false`)时,这种调用**100% 必须用变量形式或 Start-Process**,不能用 `& "<绝对路径>"`
- background=true 时不踩此坑(terminal 自己处理 backgrounding 语义)

**实测案例(2026-08-19 prop-modal-fix-rca)**:dispatch 完后想用 `& "C:\...\opencode.exe" db ...` 查 sessionId → 3 次连续报这个错 → 改用 PATH 直调 `opencode db ...` 一次过。

### 边界 5:系统级 shutdown / reboot 命令 = 平台硬红线

**症状**:
```
$ shutdown /f /t 60 /c "..."
exit_code: -1
status: "BLOCKED (hardline): system shutdown/reboot.
  This command is on the unconditional blocklist and cannot be executed via the agent"
```

**根因**: platform 把 `shutdown` / `reboot` / `halt` / `poweroff` 加在**无条件 blocklist**,即使 `--yolo` / `approvals.mode=off` / cron approve mode 也通不过。

**绕开**:
- **不能绕开**。这是平台护栏,不是配置问题。
- bot 不能替用户执行系统关机/重启/休眠
- 用户如需关机,必须**自己在 terminal / GUI 操作**:
  - Windows: Win+X → 关机 / U / S,或 `shutdown /a` 取消已排队的
  - 通知用户时附"需手动执行"提示

---

## 速查表(本轮 6 次撞的快速对照)

| 错 误 | 边 界 | 修 法 |
|---|---|---|
| `Get-ChildItem "E:\Hermes Agent CN Desktop\...` 空输出 | 1 | search_files 替代 或 拆单条 |
| `execFileSync("powershell", ["-Command", "..."])` 收到空 Pattern | 2 | 写临时 .ps1 文件 |
| `-Message '你先 ...'` 报 Timeout | 3 | 单引号包裹,避免 `-` 开头 |
| `sqlite3` 连环调报 locked (5) | 4 | 200ms 间隔 / `--retry` |
| 复合命令 `cd X; cmd1; cmd2` 后段被吞 | 1 | 拆开,或用 `;` 改 `&&` |
| `shutdown /f /t 60` 被护栏挡 exit -1 | 5 | **不能绕**,通知用户手动执行 |

---

## 不要捕获到 memory(本类是工具坑,环境变了会变)

- ❌ 不要写 "terminal exit 126 = 某具体错"(exit 126 在 PS 里是 "command not found" 或复合命令参数被吞,**不同版本不同**)
- ❌ 不要写 "PowerShell 中文路径必坏"(PowerShell 7 已支持,只在复合命令 + errorAction SilentlyContinue 下触发)

**修法比"是什么错"更稳定**——把"修法"沉淀到 skill,具体错作为 reference。

---

## 相关 skill

- `windows-powershell-pitfalls` (system 装) — 通用 PowerShell 坑
- `gts-hermes-memory-bridge` — 实战用到本 skill 边界 2 和 4
- `desktop-notify-protocol` — 实战用到本 skill 边界 3
