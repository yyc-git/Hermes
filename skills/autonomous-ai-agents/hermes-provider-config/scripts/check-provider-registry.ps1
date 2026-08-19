# 枚举 Hermes 全部内置 provider id，并按 env 变量名反查引用它的 provider
# 用途：定位「模型/provider 在 Hermes 找不到」是否因该 provider 不在内置清单
# 用法：
#   pwsh check-provider-registry.ps1                 # 列全部内置 provider id
#   pwsh check-provider-registry.ps1 -EnvName ARK    # 反查引用了 ARK 关键字的 provider
param(
    [string]$EnvName = '',          # 可选：只反查引用了某 env 变量名的 provider（如 ARK）
    [string]$Home = $env:HERMES_HOME
)
if (-not $Home) { Write-Error 'HERMES_HOME 未设置'; exit 1 }
$cache = Join-Path $Home 'models_dev_cache.json'
if (-not (Test-Path $cache)) { Write-Error "找不到 $cache"; exit 1 }
$json = Get-Content $cache -Raw | ConvertFrom-Json -AsHashtable

Write-Host "=== 全部内置 provider id（共 $($json.Count) 个）==="
$json.Keys | Sort-Object | ForEach-Object { Write-Host $_ }

if ($EnvName) {
    Write-Host ""
    Write-Host "=== 引用了 env 变量名含 [$EnvName] 的 provider ==="
    $hit = $false
    foreach ($prov in $json.Keys) {
        $p = $json[$prov]
        if ($p.ContainsKey('env') -and $p['env']) {
            foreach ($e in $p['env']) {
                if ($e -match $EnvName) { Write-Host "  provider=$prov  env=$e  api=$($p['api'])  name=$($p['name'])"; $hit = $true }
            }
        }
    }
    if (-not $hit) { Write-Host "  (无内置 provider 引用 [$EnvName] —— 需注册为自定义端点)" }
}
