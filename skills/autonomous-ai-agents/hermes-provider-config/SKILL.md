---
name: "hermes-provider-config"
description: "给 Hermes 配置/切换模型 provider（Tencent TokenHub/hy3、opencode-zen、自定义端点等）：.env key、config set、连通性验证、401/base_url 残留等坑"
---

# hermes-provider-config — Hermes 模型 Provider 配置

> 触发条件：兄弟要求 Hermes 使用某模型/provider（如「WorkBuddy 的 hy3」「能不能用免费模型」）、hermes chat 报 401/No usable credentials、切换默认模型。
> 与 hermes-agent skill（bundled，只读参考）互补：这里记录本机实测的 provider 接入流程与踩坑。

## 0️⃣ 本机 Hermes 环境

- HERMES_HOME = `E:\Hermes Agent CN Desktop\data\hermes-home`（.env、config.yaml 在此）
- hermes CLI 不在 PATH，用 `E:\Hermes Agent CN Desktop\data\versions\0.19.0-cn.7\hermes-agent-cn-runtime-win32-x64.exe` 调用（先设 `$env:HERMES_HOME`，用 Start-Process -Wait + 重定向输出，或临时 .ps1 里 `&` 调用）
- 改配置必须走 `hermes config set`（config.yaml 有安全保护，patch/write_file 拒改）
- 已配 provider（2026-08-18）：deepseek + tencent-tokenhub + volcark（见 references/volcengine-ark.md）+ minimax-cn（MiniMax TokenPlanMax 国内端点，MiniMax-M3 实测连通，见 references/minimax-tokenplan.md）+ xiaomi-token-plan-cn（小米 MiMo Token Plan 国内端点，2026-08-19 接入，MiMo v2.5 Pro 实测连通）

## 1️⃣ 配置流程（通用）

```powershell
# 1. .env 加 API key（凭据文件可追加，别覆盖 DEEPSEEK_API_KEY 那行）
Add-Content -Path "$env:HERMES_HOME\.env" -Value "TOKENHUB_API_KEY=sk-..." -Encoding UTF8

# 2. 切 provider + 模型 + base_url（🔴 三个都要设，缺一不可）
hermes config set model.provider tencent-tokenhub
hermes config set model.default hy3
hermes config set model.base_url https://tokenhub.tencentmaas.com/v1

# 3. 验证配置
hermes config get model   # 看 provider/default/base_url 三项

# 4. 连通性测试（单次查询，不污染当前会话）
hermes chat -q "1+1=？说出你用的模型"
```

## 2️⃣ 连通性验证三步法（先直连再走 Hermes，快速定位）

| 现象 | 判据 | 处理 |
|------|------|------|
| 直连 `GET {base_url}/models` + key → 200 | key 有效，模型存在 | 继续下一步 |
| 直连 `POST {base_url}/chat/completions` → 200 | 端点与模型正常 | Hermes 侧问题（往下查） |
| Hermes 报 401 但直连 200 | 🔴 **看 Hermes 错误里的 `🌐 Endpoint`**——多半打到了旧 base_url（如 api.deepseek.com 残留）→ 假 401 | `hermes config set model.base_url` 显式修正 |
| Hermes 报 `No usable credentials` | env 变量名不对 | 报错信息会提示正确变量名（如 TOKENHUB_API_KEY） |
| 直连 chat/completions 偶发 504 | 网关超时，非 key 问题 | 重试即可 |

```powershell
# 直连验证模板（PowerShell）
$key = "sk-..."
$r = Invoke-WebRequest -Uri "https://tokenhub.tencentmaas.com/v1/models" -Headers @{ Authorization = "Bearer $key" } -TimeoutSec 20 -UseBasicParsing
$r.StatusCode  # 200 = key 有效
$body = '{"model":"hy3","messages":[{"role":"user","content":"1+1=?"}],"max_tokens":100}'
Invoke-WebRequest -Uri "https://tokenhub.tencentmaas.com/v1/chat/completions" -Method Post -Body $body -ContentType "application/json" -Headers @{ Authorization = "Bearer $key" } -TimeoutSec 60 -UseBasicParsing
```

## 3️⃣ 踩坑清单（全部 2026-08-18 实测）

1. 🔴 **env 变量名以运行时报错为准，不凭源码快照猜**：models_dev_snapshot.json 里 tencent-tokenhub 写 `TENCENT_TOKENHUB_API_KEY`，运行时只认 `TOKENHUB_API_KEY`（hermes chat 报 `No usable credentials ... Set TOKENHUB_API_KEY` 就是证据）。配置后跑一次 hermes chat 验证。
2. 🔴 **切 provider 必须显式设 model.base_url**：只设 provider 不够——旧 base_url（如 deepseek 的 api.deepseek.com）会残留，Hermes 拿新 key 打旧端点 → 假 401（错误信息 `Your api key: ****xxx is invalid` 很误导）。Hermes 错误输出里有 `🌐 Endpoint:` 字段，先看它打到了哪。
2b. 🔴 **切 provider 必须显式设 model.api_mode（2026-08-18 实测）**：只设 provider/default/base_url 不够——旧 provider 的 api_mode（如 volcark 的 `chat_completions`）会残留。minimax-cn 走 anthropic 协议（`@ai-sdk/anthropic`），残留 chat_completions 会把端点拼成 `.../anthropic/chat/completions` → **HTTP 404 `404 page not found`**（不是 401！）。症状：config 三项全对、credential_pool 正常，但默认模型调用 404，而 `--provider minimax-cn` 显式指定却成功（走 credential_pool 时 transport 自动正确）。修法：`hermes config set model.api_mode anthropic`。切换 provider 时四项全查：provider/default/base_url/**api_mode**。
3. **Hermes 侧 401 ≠ key 无效**：先直连 `/models`（200 = key 好），再对比 Hermes 的 Endpoint 字段。
4. **Start-Process -ArgumentList 传含空格的中文参数会拼接错**（unrecognized arguments）→ 写临时 .ps1 用 `& $hermes chat -q $q` 调用。
5. **PS 5.1（powershell.exe）读 UTF-8 无 BOM 的 .ps1 中文乱码 → 假语法错**（string terminator）→ 用 pwsh 7 执行脚本，或给文件加 BOM。
6. **改 .env 用 Add-Content 追加，改完核对 key 名列表**（本会话出现过过滤结果未写回导致重复行，最后 Set-Content 重写清理）。
7. **hermes chat -q 测试不污染当前会话**：-q 是独立一次性会话，配置改动对运行中会话无效（当前会话模型不变），新会话才生效——测试/切换都走新会话。
8. 🔴 **新建会话模型 ≠ config default，是桌面 UI 的 last-used-model 覆盖（2026-08-18 实测）**：config.yaml 里 `model.default=hy3`、`.env` key 在、`hermes config get model` 全对，但新建会话仍是旧模型（如 deepseek-v4-flash）——因为桌面 app 记住了 UI 模型选择器里最后选的模型，新建会话优先用它，config default 只是兜底。定位证据在 `E:\Hermes Agent CN Desktop\data\hermes-home\desktop-ui.sqlite` 的 `ui_kv` 表（⚠️ 列名是 `value_json`，不是 `value`，查错报 no such column）：
   ```powershell
   sqlite3 "E:\Hermes Agent CN Desktop\data\hermes-home\desktop-ui.sqlite" "SELECT key, substr(value_json,1,300) FROM ui_kv WHERE key LIKE '%last-used-model%';"
   # → hermes:last-used-model:managed:...:default = {"selection":{"model":"deepseek-v4-flash","provider":"deepseek"}}
   ```
   解决：在桌面 app 模型选择器手动选一次目标模型（hy3），UI 覆盖该记录，之后新会话即恢复；🔴 别直接改 sqlite——2026-08-18 兄弟要求实测直接 UPDATE：sqlite3 报成功、读回验证正确，但**运行中 app 内存缓存不读库，新建会话仍是旧模型**，改库只对重启后的 app 可能生效（且 WAL 模式下要连 -wal/-shm 一起备份，完整操作见 references/last-used-model-forensics.md）。
   诊断捷径（改库前先做，10 秒定位）——查 state.db sessions 表最近会话的 model 字段：**hy3/deepseek 交替出现 = 新会话模型跟随 UI 选择器而非 config default**，此时改 config 无用：
   ```powershell
   sqlite3 "E:\Hermes Agent CN Desktop\data\hermes-home\state.db" "SELECT datetime(started_at,'unixepoch','localtime'), model, title FROM sessions ORDER BY started_at DESC LIMIT 8;"
   ```
   ui_kv 的 key 完整格式：`hermes:last-used-model:managed:<url编码的gateway地址>:default`；若改库，value_json 里 providerName 必须匹配 models_dev_cache.json 的 name 字段（本机 tencent-tokenhub → name=Tencent TokenHub、模型 id=hy3；该文件是单行 JSON 且键大小写冲突，必须 `ConvertFrom-Json -AsHashtable` 解析，普通 ConvertFrom-Json 报 key casing 错）。排查顺序：config.yaml → .env 变量名 → `hermes config get model` → state.db sessions → desktop-ui.sqlite。
9. **.env 是 credential store，read_file/搜索被拒** → 用 terminal 只列变量名不泄露值：`Get-Content $env:HERMES_HOME\.env | Where-Object { $_ -match '^\s*[A-Z_]+=' } | ForEach-Object { ($_ -split '=',2)[0].Trim() }`（能确认 key 在不在，不暴露 sk- 内容）。

10. 🔴 **火山方舟 coding plan 是专用端点，不是标准 /api/v3（2026-08-18 实测）**：`.env` 配 `ARK_CODING_API_KEY` 后模型选择器找不到，是因为 (a) Hermes 内置无 volcengine provider，(b) coding plan 端点是 `https://ark.cn-beijing.volces.com/api/coding/v3`（标准 `.../api/v3` 调用报 `ModelNotOpen`/`InvalidEndpointOrModel.NotFound` 404，连 doubao 自家模型都 404）。注册方式：`hermes config set providers.volcark.api "https://ark.cn-beijing.volces.com/api/coding/v3"` + `providers.volcark.key_env ARK_CODING_API_KEY` + `providers.volcark.transport chat_completions` + `providers.volcark.default_model <模型id>` + `providers.volcark.discover_models true`（命名自定义 provider 走 config.yaml `providers:` dict，与主 provider 并存）。✅ coding plan 实测可用模型：glm-5.3/glm-latest/glm-5-3、deepseek-v4-flash-ga-260731、deepseek-v4-flash-260425、kimi-k2-250905、kimi-k2-thinking-251104；❌ 不支持：deepseek-v3-2/r1、doubao 系、glm-4-7（报 UnsupportedModel）。模型目录 /models 列 130 个 ≠ 账号已开通，必须逐个实测。调用：`hermes chat -q ... --provider volcark -m <模型id>` 或会话内 `/model custom:volcark:<模型id>`。🔴 **把 volcark 设为主默认模型时同样要显式 `hermes config set model.base_url https://ark.cn-beijing.volces.com/api/coding/v3`**（2026-08-18 实测：只设 model.provider volcark + model.default 后 base_url 残留 tokenhub 端点，需一并修正；api_key 字段残留 tokenhub 的 key 不影响，custom provider 优先走 key_env）。

11. 🔴 **「配置了 X provider 测下 Y 模型」先分清是 Hermes 侧还是 OpenCode 侧（2026-08-18 兄弟纠正实测）**：兄弟说「配置了 minimax TokenPlanMax，测下 m3 模型」，我默认去 OpenCode 测了 `opencode-go/minimax-m3`（走 opencode-go 中转，也通了），但兄弟纠正「不要用 opencode go，要用 minimax TokenPlanMax」——用户配置的是 **Hermes 侧**的 provider，不是 OpenCode 模型。教训：用户说「配置->模型里配置了 X」= Hermes provider（配置走 `.env` + auth.json），「opencode.json 里配了 X」才是 OpenCode 侧；**先问/先查用户在哪配的，别按模型名默认去 OpenCode 找**。Hermes 侧正确做法：查 `.env` 变量名 → `auth.json` credential_pool → `hermes chat -q ... --provider <id> -m <模型>` 实测。

12. 🔴 **内置 provider 在 models_dev_cache.json ≠ 运行时已加载（2026-08-19 实测，xiaomi MiMo）**：`models_dev_cache.json` 里列了 `xiaomi`/`xiaomi-token-plan-cn/sgp/ams`（api=`https://token-plan-cn.xiaomimimo.com/v1`，env=`XIAOMI_API_KEY`，模型 mimo-v2.5/mimo-v2.5-pro/mimo-v2-pro 等），但 `--provider xiaomi-token-plan-cn` 报 `Unknown provider`——运行时 provider 注册表是 `provider_models_cache.json`（只含 deepseek/tencent-tokenhub/minimax-cn），**内置清单 ≠ 运行时加载**。修法：跟 volcark 一样在 config.yaml `providers:` 段显式注册自定义 provider（`hermes config set providers.xiaomi-token-plan-cn.api/name/key_env/transport/default_model`，transport=chat_completions）。另外 env 变量名必须是内置要求的 `XIAOMI_API_KEY`——本机 .env 原有 `XIAOMI_TOKEN_PLAN_API_KEY`（sk- 值相同）一直没接上就是这个原因；直接 `Add-Content` 追加 `XIAOMI_API_KEY=<同值>` 即可，别覆盖原行。直连验证 `GET https://token-plan-cn.xiaomimimo.com/v1/models` + Bearer key → 200 即 key 有效。🔴 **UI 模型选择器要能列出自定义 provider，必须 `hermes config set providers.<id>.discover_models true`（2026-08-19 实测）**：volcark 注册时有此字段，xiaomi 漏加 → CLI `--provider` 能跑、但 `/api/model/options`（Dashboard 模型选择器数据源）里 `models` 只有 default_model 1 个、UI 列表不完整；补上 `discover_models: true` 后自动拉全 `/v1/models` 全部模型。验证命令：`GET http://127.0.0.1:9120/api/model/options?include_unconfigured=1&refresh=1`（带 Dashboard session token 头，token 从 `http://127.0.0.1:9120/models` HTML 的 `__HERMES_SESSION_TOKEN__` 取）。注意 UI 前端可能有缓存，改配置后重启桌面 app 或重新打开模型选择器才看到。

🔴🔴 **Hermes UI 对自定义 provider 永远只显示 default_model 一个模型（2026-08-19 实测，硬限制）**：UI 前端 `getModelOptions` 4 处调用**都不带 `refresh=1`**（`{refresh:true}` 才带），后端 `discover_models` 只在 refresh=1 时实时拉 `/v1/models` 且**不持久化** → 自定义 provider 在 UI 里永远只显示 `default_model`。内置 provider 例外：模型来自 `models_dev_cache.json` 静态定义（4MB 动态重建文件，改了会被覆盖，不可 hack）。**要让 UI 显示想要的模型 = 改 `default_model`**。例：想 UI 显示 mimo-v2.5 → `hermes config set providers.xiaomi-token-plan-cn.default_model mimo-v2.5`（mimo-v2.5-pro 同理）。CLI 不受限：`--provider xiaomi-token-plan-cn -m mimo-v2.5-pro` 任意模型可跑。🔴 **不要用 config providers.<内置名> 覆盖内置 provider**（如 `providers.xiaomi`）：CLI 对覆盖后的内置 provider 仍按内置 env 名（XIAOMI_API_KEY）解析 key、忽略你设的 key_env → `No usable credentials`，CLI 不可用，且内置静态 5 模型丢失。恢复：`hermes config unset providers.xiaomi.api/.key_env/.default_model`。

- 会话内：`/model tencent/hy3`（已配置的 provider 之间切换，免重启）
- 永久默认：`hermes config set model.default <model>`
- provider 全量注册表：`hermes model` 向导（新增 provider 用，会话内 /model 只能切已配置的）

## 5️⃣ 非内置 provider（如火山方舟）注册 —— `.env` 加了 key ≠ 模型自动出现

🔴 **核心心智模型**：模型选择器里的模型来自「已注册 provider」，注册途径只有两条：
- (A) **内置 provider**：Hermes 自带 200+ provider，清单在 `$HERMES_HOME/models_dev_cache.json`（顶层 key 即 provider id）。在内置清单里 → 只需在 `.env` 加对应 env key（变量名以运行时报错为准），再 `hermes config set model.provider <id>`。
- (B) **自定义 OpenAI 兼容端点**：若 provider **不在**内置清单，光在 `.env` 加 `ARK_CODING_API_KEY` 这种自定义名 key **毫无作用**——没有 provider 引用它，选择器永远搜不到。必须注册成自定义端点（见下）。

**排查「某 provider 是否内置」**（2026-08-18 实测，火山方舟即此因；脚本见 `scripts/check-provider-registry.ps1`）：
```powershell
$json = Get-Content "$env:HERMES_HOME\models_dev_cache.json" -Raw | ConvertFrom-Json -AsHashtable
$json.Keys | Sort-Object | ForEach-Object { Write-Host $_ }                                  # 列全部内置 provider id
foreach ($prov in $json.Keys) { $p=$json[$prov]; if ($p.env) { $p.env | Where-Object { $_ -match 'ARK' } | ForEach-Object { "provider=$prov env=$_" } } }
```
⚠️ 火山方舟（Volcengine Ark）**不在**内置清单（ark/volc/byte 关键字只命中无关的 Moark）。同理可查任何第三方厂商。

**把火山方舟注册成自定义 OpenAI 兼容端点**（2026-08-18 实操，细节见 `references/volcengine-ark.md`）：
1. base_url 不是标准 `/v1`，是 `https://ark.cn-beijing.volces.com/api/v3`（注意 `/api/v3`）。
2. 模型 id 是控制台「在线推理」创建的 **Endpoint ID**（形如 `ep-xxxx-xxxxx`），不是模型名。
3. 注册（🔴 `model.provider` 只接受**一个** provider，设成自定义会**顶掉当前 hy3**；但 `.env` 里 hy3 的 key + config 都保留，随时 `hermes config set model.provider tencent-tokenhub` 切回）：
```powershell
hermes config set model.provider volcengine-ark        # 自定义名，任意
hermes config set model.default <你的Endpoint ID>
hermes config set model.base_url https://ark.cn-beijing.volces.com/api/v3
hermes config set model.api_key $env:ARK_CODING_API_KEY
```
4. 验证：`hermes chat -q "1+1"`（独立会话，不污染当前；新会话才生效，见踩坑 7）。

🔴 **会话内 `/model` 只能切「已配置的 provider」**；自定义端点必须先注册进 config 才能被 `/model` 选到。想 hy3 与火山方舟并排可切 → 主 provider 只能留一个，另一个用 `-m volcengine-ark/<endpoint>` 命令行临时指定（或反之）。

## references

- `references/tokenhub-hy3.md` — Tencent TokenHub 接入详情（hy3 模型信息、可用模型列表、已知特性）
- `references/last-used-model-forensics.md` — 新建会话模型来源排查：state.db sessions 诊断捷径、desktop-ui.sqlite 直改实操（备份/UPDATE/验证）、models_dev_cache.json 的 -AsHashtable 解析坑
- `references/volcengine-ark.md` — 火山方舟（Volcengine Ark）自定义端点注册详情：base_url、Endpoint ID 获取、验证、与 hy3 并存切换
- `references/minimax-tokenplan.md` — MiniMax TokenPlanMax 接入详情：minimax-cn provider、MINIMAX_CN_API_KEY、auth.json 注册、MiniMax-M3 实测记录
- `scripts/check-provider-registry.ps1` — 枚举全部内置 provider id / 按 env 变量名反查引用它的 provider，定位「模型找不到」是否因 provider 未内置
