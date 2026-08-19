# 从 Hermes CN Desktop 运行时调用 hermes CLI

Hermes CN Desktop 是 PyInstaller one-folder 打包。**`hermes` 不在 PATH**,系统也无 python3/pip。任何 CLI 操作(技能管理、memory、migrate 等)必须走运行时 exe。

## 关键路径
- 运行时 exe:`E:\Hermes Agent CN Desktop\data\versions\<version>\hermes-agent-cn-runtime-win32-x64.exe`(每个版本独立目录;`_internal\` 内含 Python 3.14 包,含 `hermes_cli`)
- HERMES_HOME:`E:\Hermes Agent CN Desktop\data\hermes-home` — 每次调用前必须设置;Desktop 托管 home 是权威,不是 `~/.hermes`
- 用**当前版本目录**里的 exe,保证 CLI 与运行中的 App 版本一致

## 坑:PowerShell `&` 调用被拦截
terminal 工具会把含 `& "path\...exe"` 的前台命令判为后台化("Foreground command uses '&' backgrounding")。**可靠写法 — Start-Process + 输出重定向**:

```powershell
$env:HERMES_HOME = "E:\Hermes Agent CN Desktop\data\hermes-home"
$exe = "E:\Hermes Agent CN Desktop\data\versions\0.19.0-cn.7\hermes-agent-cn-runtime-win32-x64.exe"
$o = "$env:TEMP\out.txt"; $e = "$env:TEMP\err.txt"
Start-Process -FilePath $exe -ArgumentList @("skills","list") -Wait -NoNewWindow -RedirectStandardOutput $o -RedirectStandardError $e
Get-Content $o -Raw; Get-Content $e -Raw
```

要点:
- `-Wait -NoNewWindow` + 重定向到临时文件 = 前台行为;结束后读文件
- 纯 `& $exe --help` 单命令偶尔能过(检测是启发式的),Start-Process 形式永远安全
- 参数逐个放进 `-ArgumentList @(...)`,含空格路径不会拆错

## 别用
- `cmd /c "set HERMES_HOME=...&& exe ..."` — 含空格路径会被 cmd 在第一个空格处拆开 → 报 "'E:\Hermes' is not recognized"

## 常用 CLI 调用(桌面运行时)
| 目的 | 参数 |
|---|---|
| 记忆状态 | `memory status` |
| 技能仓库搜索 | `skills search <q>` |
| OpenClaw 导入预览 | `claw migrate --source <path> --dry-run`(需要 openclaw-migration 技能,CN 版未打包) |
| 技能列表 | `skills list` |
| 配置路径 | `config path` |
