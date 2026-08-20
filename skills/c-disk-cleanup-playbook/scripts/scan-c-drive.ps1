# scan-c-drive.ps1 — C 盘大件扫描脚本（避坑版）
# 用法: powershell -ExecutionPolicy Bypass -File scan-c-drive.ps1
# 跑完会输出 Top 30 大目录 + 各 AppData 子目录大小 + qmd 模型状态

$c = Get-PSDrive C
Write-Host ("C: 总 {0:N1} GB, 已用 {1:N1} GB, 可用 {2:N1} GB" -f (($c.Used+$c.Free)/1GB), $c.Used/1GB, $c.Free/1GB)
Write-Host ""

# Helper: 算目录大小（不递归过深，避坑）
function Get-DirSize-Safe($path, [int]$maxDepth = 1) {
  if (-not (Test-Path $path)) { return 0 }
  try {
    $b = (Get-ChildItem $path -Recurse -Depth $maxDepth -ErrorAction SilentlyContinue -Force |
      Where-Object { -not $_.PSIsContainer } |
      Measure-Object -Property Length -Sum).Sum
    if (-not $b) { 0 } else { $b }
  } catch { 0 }
}

# Top directories of user profile
Write-Host '=== C:\Users\Administrator 顶层目录 ==='
Get-ChildItem 'C:\Users\Administrator' -Directory -ErrorAction SilentlyContinue -Force |
  Where-Object { $_.Name -notin @('.', '..') } |
  ForEach-Object {
    [pscustomobject]@{
      SizeMB = [math]::Round((Get-DirSize-Safe $_.FullName 2)/1MB, 1)
      Name = $_.Name
    }
  } | Sort-Object SizeMB -Descending | Select-Object -First 25 | Format-Table -AutoSize

# AppData\Local 子目录
Write-Host ''
Write-Host '=== C:\Users\Administrator\AppData\Local 子目录（单层）==='
$localPath = 'C:\Users\Administrator\AppData\Local'
Get-ChildItem $localPath -Directory -ErrorAction SilentlyContinue -Force |
  Where-Object { $_.Name -notin @('.', '..') } |
  ForEach-Object {
    [pscustomobject]@{
      SizeMB = [math]::Round((Get-DirSize-Safe $_.FullName 1)/1MB, 1)
      Name = $_.Name
    }
  } | Sort-Object SizeMB -Descending | Select-Object -First 20 | Format-Table -AutoSize

# qmd 模型状态（⚠️ 重要 - Hermes 语义搜索依赖）
Write-Host ''
Write-Host '=== qmd 模型状态 ==='
$qmdPath = 'C:\Users\Administrator\.cache\qmd'
if (Test-Path $qmdPath) {
  Get-ChildItem $qmdPath -Directory -ErrorAction SilentlyContinue -Force |
    ForEach-Object {
      [pscustomobject]@{
        SizeMB = [math]::Round((Get-DirSize-Safe $_.FullName 1)/1MB, 1)
        Name = $_.Name
      }
    } | Sort-Object SizeMB -Descending | Format-Table -AutoSize
  Get-ChildItem "$qmdPath\models" -File -ErrorAction SilentlyContinue -Force |
    ForEach-Object {
      [pscustomobject]@{
        SizeMB = [math]::Round($_.Length/1MB, 1)
        Name = $_.Name
      }
    } | Sort-Object SizeMB -Descending | Format-Table -AutoSize
} else {
  Write-Host 'qmd 目录不存在'
}

# Temp 顶层
Write-Host ''
Write-Host '=== Temp 顶层 ==='
$temp = $env:TEMP
Get-ChildItem $temp -Directory -ErrorAction SilentlyContinue -Force |
  ForEach-Object {
    [pscustomobject]@{
      SizeMB = [math]::Round((Get-DirSize-Safe $_.FullName 1)/1MB, 1)
      Name = $_.Name
      LastWrite = $_.LastWriteTime.ToString('MM-dd HH:mm')
    }
  } | Sort-Object SizeMB -Descending | Select-Object -First 15 | Format-Table -AutoSize

# 浏览器 + 微信缓存
Write-Host ''
Write-Host '=== Chrome User Data ==='
$chrome = 'C:\Users\Administrator\AppData\Local\Google\Chrome\User Data'
if (Test-Path $chrome) {
  Get-ChildItem $chrome -Directory -ErrorAction SilentlyContinue -Force |
    ForEach-Object {
      [pscustomobject]@{
        SizeMB = [math]::Round((Get-DirSize-Safe $_.FullName 1)/1MB, 1)
        Name = $_.Name
      }
    } | Sort-Object SizeMB -Descending | Select-Object -First 8 | Format-Table -AutoSize
}

Write-Host ''
Write-Host '=== Edge User Data ==='
$edge = 'C:\Users\Administrator\AppData\Local\Microsoft\Edge\User Data'
if (Test-Path $edge) {
  Get-ChildItem $edge -Directory -ErrorAction SilentlyContinue -Force |
    ForEach-Object {
      [pscustomobject]@{
        SizeMB = [math]::Round((Get-DirSize-Safe $_.FullName 1)/1MB, 1)
        Name = $_.Name
      }
    } | Sort-Object SizeMB -Descending | Select-Object -First 8 | Format-Table -AutoSize
}

Write-Host ''
Write-Host '=== Tencent ==='
$tc = 'C:\Users\Administrator\AppData\Roaming\Tencent'
if (Test-Path $tc) {
  Get-ChildItem $tc -Directory -ErrorAction SilentlyContinue -Force |
    ForEach-Object {
      [pscustomobject]@{
        SizeMB = [math]::Round((Get-DirSize-Safe $_.FullName 1)/1MB, 1)
        Name = $_.Name
      }
    } | Sort-Object SizeMB -Descending | Format-Table -AutoSize
}

# Program Files（双层）
Write-Host ''
Write-Host '=== Program Files (单层) ==='
Get-ChildItem 'C:\Program Files' -Directory -ErrorAction SilentlyContinue -Force |
  Where-Object { $_.Name -notlike 'scoped_dir*' -and $_.Name -notin @('.','..') } |
  ForEach-Object {
    [pscustomobject]@{
      SizeMB = [math]::Round((Get-DirSize-Safe $_.FullName 1)/1MB, 0)
      Name = $_.Name
    }
  } | Sort-Object SizeMB -Descending | Select-Object -First 20 | Format-Table -AutoSize

Write-Host ''
Write-Host '=== Program Files (x86) (单层) ==='
Get-ChildItem 'C:\Program Files (x86)' -Directory -ErrorAction SilentlyContinue -Force |
  Where-Object { $_.Name -notin @('.','..') } |
  ForEach-Object {
    [pscustomobject]@{
      SizeMB = [math]::Round((Get-DirSize-Safe $_.FullName 1)/1MB, 0)
      Name = $_.Name
    }
  } | Sort-Object SizeMB -Descending | Select-Object -First 20 | Format-Table -AutoSize

Write-Host ''
Write-Host '扫描完成 ✅'