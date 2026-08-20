# verify-junction.ps1 — 验证 worktree junction 依赖可用性
# 用法:.\verify-junction.ps1 -Worktree "D:\Github\GTS-Play-wt-xxx"
# 对照主仓库:同样失败的包 = 非 junction 问题

param(
    [Parameter(Mandatory = $true)]
    [string]$Worktree,
    [string]$MainRepo = "D:\Github\GTS-Play"
)

Write-Host "=== 验证 junction: $Worktree -> $MainRepo ==="

# 1. junction 是否存在
$link = Get-Item "$Worktree\node_modules" -ErrorAction SilentlyContinue
if (-not $link -or $link.LinkType -ne 'Junction') {
    Write-Host "FAIL junction 不存在或不是 Junction" -ForegroundColor Red
    exit 1
}
Write-Host "OK  junction -> $($link.Target)"

# 2. 根依赖解析(两边都要能过)
node -e "for (const m of ['three','immutable','most','ts-node','typescript','webpack','jest']) { try { require.resolve(m); console.log('OK  ', m) } catch(e) { console.log('FAIL', m) } }" 2>&1
Write-Host "--- 对照主仓库(同样失败=非 junction 问题) ---"
Push-Location $MainRepo
node -e "for (const m of ['three','immutable','most','ts-node','typescript','webpack','jest']) { try { require.resolve(m); console.log('OK  ', m) } catch(e) { console.log('FAIL', m) } }" 2>&1
Pop-Location

Write-Host "=== 完成:worktree 失败项若主仓库同样失败,则 junction 正常 ==="
