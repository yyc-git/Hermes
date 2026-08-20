# 提取 Word (.docx) 批注并锚定正文位置
# 用法: pwsh extract-docx-comments.ps1 -Docx "D:\path\file.docx"
# 输出: 批注总数 + 每条批注(作者/时间/内容) + 锚定段落
param(
    [Parameter(Mandatory = $true)][string]$Docx
)

if (-not (Test-Path $Docx)) {
    Write-Error "文件不存在: $Docx"
    exit 1
}

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-ZipEntryText {
    param([string]$DocxPath, [string]$EntryName)
    $zip = [System.IO.Compression.ZipFile]::OpenRead($DocxPath)
    try {
        $entry = $zip.GetEntry($EntryName)
        if (-not $entry) { return $null }
        $reader = New-Object System.IO.StreamReader($entry.Open(), [System.Text.Encoding]::UTF8)
        try { return $reader.ReadToEnd() }
        finally { $reader.Close() }
    }
    finally { $zip.Dispose() }
}

$commentsXml = Get-ZipEntryText $Docx "word/comments.xml"
if (-not $commentsXml) {
    Write-Host "该 docx 没有 word/comments.xml，无批注。"
    exit 0
}

$docXml = Get-ZipEntryText $Docx "word/document.xml"

[xml]$commentsDoc = $commentsXml
[xml]$bodyDoc = $docXml
$ns = New-Object System.Xml.XmlNamespaceManager($commentsDoc.NameTable)
$ns.AddNamespace("w", "http://schemas.openxmlformats.org/wordprocessingml/2006/main")

# 1) 批注正文
$comments = $commentsDoc.SelectNodes("//w:comment", $ns)
$cmap = @{}
Write-Host "===== 批注正文 (共 $($comments.Count) 条) ====="
foreach ($c in $comments) {
    $id = $c.GetAttribute("w:id")
    $author = $c.GetAttribute("w:author")
    $date = $c.GetAttribute("w:date")
    $texts = $c.SelectNodes(".//w:t", $ns)
    $body = ($texts | ForEach-Object { $_.InnerText }) -join ""
    $cmap[$id] = [PSCustomObject]@{ Author = $author; Date = $date; Body = $body }
    Write-Host "`n[id=$id] 作者=$author 时间=$date"
    Write-Host "  内容: $body"
}

# 2) 锚定正文位置
Write-Host "`n===== 批注锚定位置 ====="
$paras = $bodyDoc.SelectNodes("//w:p", $ns)
foreach ($p in $paras) {
    $rangeStarts = $p.SelectNodes(".//w:commentRangeStart", $ns)
    $refs = $p.SelectNodes(".//w:commentReference", $ns)
    if ($rangeStarts.Count -gt 0 -or $refs.Count -gt 0) {
        $texts = $p.SelectNodes(".//w:t", $ns)
        $line = ($texts | ForEach-Object { $_.InnerText }) -join ""
        $ids = @()
        foreach ($rs in $rangeStarts) { $ids += $rs.GetAttribute("w:id") }
        foreach ($rf in $refs) { $ids += ("REF:" + $rf.GetAttribute("w:id")) }
        Write-Host "锚点[id=$($ids -join ',')] => 段落: [$line]"
    }
}
Write-Host "`n完成。"
