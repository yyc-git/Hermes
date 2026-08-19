# 火山方舟（Volcengine Ark）接入 Hermes

> 触发：兄弟在 Hermes 配了火山方舟的 coding plan / API key，但模型选择器找不到。根因：火山方舟**不在** Hermes 内置 200+ provider 清单，必须用「自定义 OpenAI 兼容端点」注册。

## 关键事实（2026-08-18 实测）
- Hermes 内置 provider 清单：`$HERMES_HOME/models_dev_cache.json` 顶层 key。火山方舟（ark/volc/byte）不在其中，只有无关的 Moark。
- 在 `.env` 加 `ARK_CODING_API_KEY` **不会**自动让模型出现——没有 provider 引用这个自定义 env 名。
- 火山方舟 API 是 OpenAI 兼容，但 base_url 是 `https://ark.cn-beijing.volces.com/api/v3`（不是 `/v1`）。

## 注册步骤
1. 登录火山方舟控制台 → 「模型推理」→「在线推理」→ 创建接入点，拿到 **Endpoint ID**（形如 `ep-2024xxxx-xxxxx`）或模型接入点 id。
2. 写入 config（自定义 provider 名任意，如 `volcengine-ark`）：
```powershell
hermes config set model.provider volcengine-ark
hermes config set model.default <Endpoint ID>
hermes config set model.base_url https://ark.cn-beijing.volces.com/api/v3
hermes config set model.api_key <你的ARK key>
```
3. 验证连通性（独立会话，不污染当前）：
```powershell
hermes chat -q "1+1=？说出你用的模型"
```
直连验证模板：
```powershell
$key = "<ARK key>"
$r = Invoke-WebRequest -Uri "https://ark.cn-beijing.volces.com/api/v3/models" -Headers @{ Authorization = "Bearer $key" } -TimeoutSec 20 -UseBasicParsing
$r.StatusCode   # 200 = key 有效
$body = @{ model='<Endpoint ID>'; messages=@(@{role='user';content='1+1=?'}); max_tokens=100 } | ConvertTo-Json -Compress
Invoke-WebRequest -Uri "https://ark.cn-beijing.volces.com/api/v3/chat/completions" -Method Post -Body $body -ContentType "application/json" -Headers @{ Authorization = "Bearer $key" } -TimeoutSec 60 -UseBasicParsing
```

## 与现有 hy3（tencent-tokenhub）并存
- `model.provider` 只接受**一个** provider。设成 `volcengine-ark` 会顶掉 hy3。
- hy3 的 `.env` key 与 config 都保留，随时 `hermes config set model.provider tencent-tokenhub` 切回。
- 想两个并排可切：主 provider 留一个，另一个用命令行 `-m volcengine-ark/<Endpoint ID>` 临时指定（或反之）。会话内 `/model` 只能切「已注册进 config 的 provider」。

## 坑
- 火山方舟模型 id 是 Endpoint ID，不是 `doubao-xxx` 这种模型名（除非用模型接入点 id）。填错会 404。
- `hermes config set model.api_key` 写明文会落盘 config.yaml（含 key），`.env` 才是凭据仓库；若担心泄露可只在 `.env` 留 `ARK_CODING_API_KEY` 并确认 Hermes 能从 env 读（自定义 endpoint 的 env 读取以运行时为准，必要时显式 set api_key）。
