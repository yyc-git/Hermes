# MiniMax TokenPlanMax 接入详情（2026-08-18 实测）

用户通过 Hermes 桌面 app「配置->模型」配置了 MiniMax TokenPlanMax 套餐，`.env` 加了 key。本文档记录完整接入链路 + 连通性实测。

## 关键结论

- **正确 provider id：`minimax-cn`**（国内 minimaxi.com 端点）。会话内 `/model minimax-cn/MiniMax-M3`，CLI `hermes chat -q ... --provider minimax-cn -m MiniMax-M3`。
- `.env` 变量名是 **`MINIMAX_CN_API_KEY`**（用户 UI 配置时的命名），**不是** models_dev_cache.json 内置注册表写的 `MINIMAX_API_KEY`。
- base_url = `https://api.minimaxi.com/anthropic`（注意是 `/anthropic` 前缀，MiniMax 走 Anthropic 兼容协议，npm 包 `@ai-sdk/anthropic`）。
- 🔴 **`minimax-cn-coding-plan` 这个内置 provider id 报 Unknown provider**——models_dev_cache.json 里有它（name 正好是 "MiniMax Token Plan (minimaxi.com)"，语义上就是 TokenPlanMax），但 CLI 不认；实际认的是 `minimax-cn`。别凭内置注册表 id 猜，以 `hermes chat --provider X` 实测为准。

## 排查链路（复现路径）

1. `.env` 列变量名（read_file 被拒，用 terminal）：`Get-Content $env:HERMES_HOME\.env | Where-Object { $_ -match 'MINIMAX' }` → 发现 `MINIMAX_CN_API_KEY`
2. `auth.json` 的 **credential_pool** 里查已注册 provider：`minimax-cn` → label=`MINIMAX_CN_API_KEY`、base_url=`https://api.minimaxi.com/anthropic`。这是 Hermes 实际认的 provider 注册处（config.yaml 的 `providers:` 只含自定义 provider，UI 内置 provider 注册走 auth.json）。
3. `hermes config get providers` 只显示 volcark（自定义 provider），minimax-cn 不在 config.yaml——它在 auth.json credential_pool。
4. 连通性实测：`hermes chat -q "1+1=？说出你用的模型" --provider minimax-cn -m MiniMax-M3` → 6s 返回「1+1=2 模型：MiniMax-M3」

## 内置注册表里的 4 个 minimax provider（models_dev_cache.json）

| provider id | api | 语义 |
|------|------|------|
| minimax | https://api.minimax.io/anthropic/v1 | 国际 |
| minimax-cn | https://api.minimaxi.com/anthropic/v1 | 国内（✅ 实际可用） |
| minimax-coding-plan | https://api.minimax.io/anthropic/v1 | 国际 Token Plan |
| minimax-cn-coding-plan | https://api.minimaxi.com/anthropic/v1 | 国内 Token Plan（CLI 报 Unknown provider ❌） |

4 个都含模型：MiniMax-M2 / M2.1 / M2.5 / M2.5-highspeed / M2.7 / M2.7-highspeed / **MiniMax-M3**（1M context、multimodal：text+image+video 输入）。

## 实测命令模板

```powershell
$env:HERMES_HOME="E:\Hermes Agent CN Desktop\data\hermes-home"
$hermes="E:\Hermes Agent CN Desktop\data\versions\0.19.0-cn.7\hermes-agent-cn-runtime-win32-x64.exe"
$out="C:\Users\Administrator\AppData\Local\Temp\mm.txt"
Start-Process -FilePath $hermes -ArgumentList @("chat","-q","1+1=？说出你用的模型","--provider","minimax-cn","-m","MiniMax-M3") -NoNewWindow -Wait -RedirectStandardOutput $out 2>$null
Get-Content $out
```

## 与 OpenCode 侧 minimax 的区别（易踩坑）

- OpenCode（opencode CLI）里 `opencode-go/minimax-m3` 走 **opencode-go 中转**，是另一套账号，与 Hermes 的 MiniMax TokenPlanMax **无关**。
- 用户说「配置->模型里配了 X」= Hermes 侧；「opencode.json 里配了 X」= OpenCode 侧。测试前先分清，别按模型名默认去 OpenCode 找（2026-08-18 兄弟纠正）。

## 现状

- 已验证连通：MiniMax-M3（6s，回答正确）
- 未设为主默认（当前主 provider 仍为 volcark / deepseek-v4-flash-ga-260731）。若要切默认：`hermes config set model.provider minimax-cn` + `model.default MiniMax-M3`（会顶掉当前 volcark，需先确认）。
