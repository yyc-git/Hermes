---
name: "docx-comments-extract"
description: "读取 Word (.docx) 文档中的批注(comments)。触发:兄弟说「读取docx批注」「看下这个文档的批注」「批注版」等。普通 read_file 读不到批注,必须解包 docx 解析 word/comments.xml + 锚定正文位置。"
tags: [docx, word, comments, 批注, 文档]
---

# 读取 Word 文档批注 Skill

> 触发词:兄弟说「读取 docx 批注」「看下这个文档的批注」「某某批注版.docx 里有什么批注」等
> 适用:任何 .docx 批注版文件(目录批注、稿件批注、审稿意见等)

## 背景与原理

- Word 批注**不**在正文流里,普通文本提取(如 read_file 读 docx)只能拿到正文,拿不到批注
- .docx 本质是一个 zip 包:
  - `word/document.xml` — 正文(含批注锚点 `w:commentRangeStart` / `w:commentReference`)
  - `word/comments.xml` — 批注正文(每条 `w:comment` 含 id/author/date/文本)
- 原理:先解析 comments.xml 拿「批注说了什么」,再解析 document.xml 拿「批注批在哪个段落」,两者用批注 id 关联

## 流程

### Step 1: 确认目标文件

- 找到 .docx 路径(搜索:`.docx` 或 `*批注*`)
- 确认它是批注版(可先解包看有没有 `word/comments.xml`,没有则说明该文件无批注)

### Step 2: 提取批注正文(comments.xml)

用 PowerShell 解包读取(注意文件名含中文/空格,变量传路径):

```powershell
$docx = "<docx绝对路径>"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($docx)
$entry = $zip.GetEntry("word/comments.xml")
$reader = New-Object System.IO.StreamReader($entry.Open(), [System.Text.Encoding]::UTF8)
$xml = $reader.ReadToEnd()
$reader.Close()
$zip.Dispose()
[xml]$doc = $xml
$ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
$ns.AddNamespace("w", "http://schemas.openxmlformats.org/wordprocessingml/2006/main")
$comments = $doc.SelectNodes("//w:comment", $ns)
Write-Host "批注总数: $($comments.Count)"
foreach ($c in $comments) {
  $id = $c.GetAttribute("w:id")
  $author = $c.GetAttribute("w:author")
  $date = $c.GetAttribute("w:date")
  $texts = $c.SelectNodes(".//w:t", $ns)
  $body = ($texts | ForEach-Object { $_.InnerText }) -join ""
  Write-Host "[id=$id] 作者=$author 时间=$date"
  Write-Host "  内容: $body"
}
```

### Step 3: 锚定批注位置(document.xml)

解析正文,找到每条批注批在哪个段落(用 `w:commentRangeStart` / `w:commentReference` 的 id 对应):

```powershell
# 同样方式读出 word/document.xml 到 $xml
[xml]$doc = $xml
$ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
$ns.AddNamespace("w", "http://schemas.openxmlformats.org/wordprocessingml/2006/main")
$paras = $doc.SelectNodes("//w:p", $ns)
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
```

### Step 4: 汇总成清单

- 把批注按 id 与锚点段落一一对应,整理成「位置 → 批注内容」对照表
- 提炼批注主线(批注往往围绕几个主题反复出现)
- 问兄弟下一步(存档/改文件/先不动)

### Step 5: 存档(可选)

兄弟要求存档时,写 `笔记\素材整理\<文件名>_批注清单.md`,含:批注人/时间、逐条对照表、主线归纳、待拍板事项(checklist)

## 重要注意事项

### 🔴 read_file 读不到批注
docx 的批注不在正文文本流里。read_file 提取的是 document.xml 纯文本,批注必须解包读 comments.xml。别只靠 read_file 就说「看不到批注」。

### 🔴 批注 id 关联
comments.xml 的 `w:comment` id 与 document.xml 的 `w:commentRangeStart`/`w:commentReference` id 一一对应。个别批注只出现 `w:commentReference`(锚点段)没有 `commentRangeStart`,锚定逻辑要两种都取。

### 文件路径含中文
PowerShell 变量传路径即可,不要硬编码到命令里,避免 GBK/UTF8 乱码。

### 清理临时文件
如需导出 comments.xml 到临时文件做中转,用完删除。

## 故障排查

| 现象 | 原因 | 处理 |
|------|------|------|
| 解包没有 word/comments.xml | 该 docx 确实无批注 | 确认文件版本正确;或在 document.xml 里搜 `w:commentReference` 双确认 |
| 批注文本空白 | 批注含图片/特殊对象(非纯文本 w:t) | 检查 w:comment 下的 drawing/object 元素,说明该批注是图片批注 |
| 锚点对不上 | document.xml 里该 id 只有 REF 没有 RangeStart | 用 REF 锚点段落即可,汇总时标注 |
| XML 解析报错 | 文件损坏或含非法字符 | 改用流式正则提取 w:comment / w:t 内容兜底 |
