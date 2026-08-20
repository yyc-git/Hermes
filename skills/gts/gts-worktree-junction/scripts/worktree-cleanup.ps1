# worktree-cleanup.ps1
# 触发:fix/feat/refactor skill M-0 阶段,merge 回 dev 后立刻 cleanup worktree
# 兄弟硬偏好(2026-08-20):merge 完成 = cleanup 完成,不留 worktree 残留
# 教训:XiaHui fix/feat/refactor 完成后 wt1/wt2/wt3-prop-fix 三个 worktree 没删,占空间 + 误用旧分支

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$WorktreePath,    # e.g. D:\Github\wt1

    [Parameter(Mandatory=$true)]
    [string]$BranchName,      # e.g. wt1

    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# 1️⃣ 删除 worktree 实体(merge 完才能删,先 merge 后 remove)
Write-Host "→ 1. git worktree remove $WorktreePath --force" -ForegroundColor Cyan
$removeArgs = @('worktree','remove',$WorktreePath)
if ($Force) { $removeArgs += '--force' }
git @removeArgs
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ git worktree remove 失败,exit=$LASTEXITCODE" -ForegroundColor Red
    Write-Host "   提示:如果报 'Directory not empty',先手动删 junction:" -ForegroundColor Yellow
    Write-Host "     Remove-Item $WorktreePath\node_modules -Force" -ForegroundColor Yellow
    exit 1
}

# 2️⃣ 删除 wt 分支(防"实体没了但分支还活着"被下次误用)
Write-Host "→ 2. git branch -D $BranchName" -ForegroundColor Cyan
git branch -D $BranchName
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  git branch -D 失败(分支可能已被合并?),exit=$LASTEXITCODE,继续" -ForegroundColor Yellow
}

# 3️⃣ 清 git 内部 worktree 元数据缓存
Write-Host "→ 3. git worktree prune" -ForegroundColor Cyan
git worktree prune

# 4️⃣ 二次确认:必须只剩 dev 一个
Write-Host "→ 4. 二次确认 git worktree list" -ForegroundColor Cyan
$wtList = git worktree list
Write-Host $wtList -ForegroundColor Gray
$nonDev = $wtList | Where-Object { $_ -notmatch '\[dev\]$' -and $_.Trim() -ne '' }
if ($nonDev.Count -gt 1) {
    # 多于 1 行 = 除 dev 外还有残留(主仓库行 + 残留行)
    Write-Host "❌ 还有非 dev worktree 残留,见上方 list" -ForegroundColor Red
    exit 2
}
if ($wtList.Count -gt 1) {
    Write-Host "⚠️  worktree 数 > 1,请检查上方 list" -ForegroundColor Yellow
    exit 2
}

Write-Host "✅ worktree cleanup 完成,只剩 dev" -ForegroundColor Green
exit 0
