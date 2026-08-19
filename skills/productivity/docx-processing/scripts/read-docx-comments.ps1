# read-docx-comments.ps1 — 提取 Word docx 批注(编辑审阅意见)
# 用法: pwsh scripts/read-docx-comments.ps1 -DocxPath "D:\...\xxx批注版.docx"
# 输出: 每条批注的作者/时间/内容 + 锚定的正文段落(批在目录的哪一节)
# 原理: docx 是 zip,批注在 word/comments.xml,普通文本提取读不到;锚点定位用 word/document.xml 的 w:commentRangeStart
param(
  [Parameter(Mandatory=$true)][string]$DocxPath
)

if (-not (Test-Path $DocxPath)) { Write-Error "文件不存在: $DocxPath"; exit 1 }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($DocxPath)
$nsUri = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

# --- 1) 读批注 comments.xml ---
$entry = $zip.GetEntry("word/comments.xml")
if (-not $entry) {
  Write-Host "该 docx 无批注(word/comments.xml 不存在),可能只是普通文本文件"
  $zip.Dispose(); exit 0
}
$reader = New-Object System.IO.StreamReader($entry.Open(), [System.Text.Encoding]::UTF8)
$xml = $reader.ReadToEnd(); $reader.Close()

[xml]$doc = $xml
$ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
$ns.AddNamespace("w", $nsUri)
$comments = @($doc.SelectNodes("//w:comment", $ns))

# --- 2) 锚点映射: commentRangeStart id -> 所在段落文本 ---
$anchorMap = @{}
$dentry = $zip.GetEntry("word/document.xml")
if ($dentry) {
  $reader2 = New-Object System.IO.StreamReader($dentry.Open(), [System.Text.Encoding]::UTF8)
  $dxml = $reader2.ReadToEnd(); $reader2.Close()
  [xml]$ddoc = $dxml
  $dns = New-Object System.Xml.XmlNamespaceManager($ddoc.NameTable)
  $dns.AddNamespace("w", $nsUri)
  foreach ($p in @($ddoc.SelectNodes("//w:p", $dns))) {
    $starts = @($p.SelectNodes(".//w:commentRangeStart", $dns))
    if ($starts.Count -gt 0) {
      $texts = @($p.SelectNodes(".//w:t", $dns))
      $line = ($texts | ForEach-Object { $_.InnerText }) -join ""
      foreach ($rs in $starts) { $anchorMap[$rs.GetAttribute("w:id")] = $line }
    }
  }
}
$zip.Dispose()

Write-Host "批注总数: $($comments.Count)"
$i = 0
foreach ($c in $comments) {
  $i++
  $id = $c.GetAttribute("w:id")
  $author = $c.GetAttribute("w:author")
  $date = $c.GetAttribute("w:date")
  $texts = @($c.SelectNodes(".//w:t", $ns))
  $body = ($texts | ForEach-Object { $_.InnerText }) -join ""
  $anchor = ""
  if ($anchorMap.ContainsKey($id)) { $anchor = $anchorMap[$id] }
  Write-Host "-----"
  Write-Host "[$i] id=$id 作者=$author 时间=$date"
  if ($anchor) { Write-Host "锚定段落: [$anchor]" }
  Write-Host "批注内容: $body"
}
