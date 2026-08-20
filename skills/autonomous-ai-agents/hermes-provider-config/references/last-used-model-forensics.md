# 新建会话模型来源排查 — last-used-model 取证(2026-08-18 实测)

场景:config.yaml 里 `model.default=hy3`、.env key 在、`hermes config get model` 全对,但**新建会话仍是旧模型**(如 deepseek-v4-flash)。

## 根因(已验证)

Hermes CN Desktop 的新会话模型**跟随 UI 模型选择器的当前选中值**(app 内存态,启动时加载),不是 config default。config default 只是兜底。UI 选择器的持久化位置 = `desktop-ui.sqlite` 的 `ui_kv` 表,key=`hermes:last-used-model:managed:<url编码的gateway地址>:default`。

## 10 秒诊断捷径

```powershell
# state.db sessions 表:最近会话 model 交替出现(hy3/deepseek) = 跟随 UI 选择器,改 config 无用
sqlite3 "E:\Hermes Agent CN Desktop\data\hermes-home\state.db" "SELECT datetime(started_at,'unixepoch','localtime'), model, title FROM sessions ORDER BY started_at DESC LIMIT 8;"
# → 2026-08-18 05:34:04|hy3|...  /  05:34:40|deepseek-v4-flash|...  交替 = 铁证
```

注意:系统自动创建的会话(如「Hermes UI 工作区问候确认」)可能走 config default 显示 hy3,与手动新会话混在一起,所以看交替模式而不是只看有没有 hy3。

## 排查顺序

1. config.yaml(读无保护,可直接 read_file)
2. .env 变量名(.env 是 credential store,read_file 被拒 → terminal 只列变量名:`Get-Content $env:HERMES_HOME\.env | Where-Object { $_ -match '^\s*[A-Z_]+=' } | ForEach-Object { ($_ -split '=',2)[0].Trim() }`)
3. `hermes config get model`(Start-Process -Wait + RedirectStandardOutput,见 windows-powershell-pitfalls)
4. state.db sessions 表(诊断捷径,见上)
5. desktop-ui.sqlite ui_kv(确认 UI 记住的模型)

## 直改 sqlite 的实测结论(兄弟要求验证)

```powershell
# 备份(⚠️ WAL 模式下必须连 -wal/-shm 一起备份,否则恢复不完整)
$db="E:\Hermes Agent CN Desktop\data\hermes-home\desktop-ui.sqlite"
Copy-Item $db "$db.bak-lastused" -Force
Copy-Item "$db-wal" "$db-wal.bak-lastused" -Force -ErrorAction SilentlyContinue
Copy-Item "$db-shm" "$db-shm.bak-lastused" -Force -ErrorAction SilentlyContinue

# UPDATE(注意:ui_kv 列名是 value_json,不是 value)
$ts=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$val='{"selection":{"model":"hy3","provider":"tencent-tokenhub","providerName":"Tencent TokenHub"},"ts":'+$ts+'}'
$sql="UPDATE ui_kv SET value_json='"+$val+"', updated_at="+$ts+" WHERE key='hermes:last-used-model:managed:http%3A%2F%2F127.0.0.1%3A9120:default';"
sqlite3 $db $sql
sqlite3 $db "SELECT key, value_json FROM ui_kv WHERE key LIKE '%last-used-model%';"  # 验证

# 结果:sqlite3 exit=0、读回正确,但运行中 app 不读库 → 新建会话仍是旧模型
# 结论:改库只对重启后的 app 可能生效;唯一立即可靠解法 = UI 模型选择器手动切,或重启 app
```

## providerName 匹配坑

改 value_json 时 providerName 必须匹配 models_dev_cache.json 里 provider 的 `name` 字段,否则 UI 可能认不出:

```powershell
# models_dev_cache.json 是单行 JSON 且不同 provider 的模型键大小写冲突(flexai/DeepSeek-V4-Flash-0731 vs flexai/deepseek-v4-flash-0731)
# → 普通 ConvertFrom-Json 报 "contains keys with different casing",必须 -AsHashtable
$j = Get-Content "E:\Hermes Agent CN Desktop\data\hermes-home\models_dev_cache.json" -Raw | ConvertFrom-Json -AsHashtable
$p = $j['tencent-tokenhub']   # name=Tencent TokenHub, models: hy3 / hy3-preview
```

## 相关表结构备忘

- `desktop-ui.sqlite`:`ui_kv(key, value_json, updated_at)`、`session_ui_state`(无模型字段,只有 title/workspace/pinned 等)
- `state.db`:`sessions(id, model, model_config, source, started_at, title, ...)` — model_config JSON 里含 provider/base_url,可交叉验证实际走的端点
