---
name: "docx-processing"
description: "处理 Word(.docx) 文档:提取批注/修订、读正文与表格、编辑审阅意见整理。触发:读 docx 批注、编辑批注版、审阅意见、Word 文档内容提取。"
---

# Word docx 处理 Skill

> 触发词:读 docx 批注、编辑批注版、审阅意见、Word 文档内容提取、docx 表格
> 场景:兄弟的书《Vibe Coding开发与应用》编辑(人邮社佘战文)以「批注版.docx」返回目录/章节审阅意见——此场景会反复出现
> 关联:书项目仓库 `D:\Github\VibeCodingBook\`(contents/ 正文 + 笔记/素材整理/ 编辑附件)

## 核心坑:docx 批注普通读不出来

docx 本质是 zip。**批注存在 `word/comments.xml`,普通的 docx 文本提取(如 read_file 的自动提取)只解析 document.xml 正文,完全看不到批注**。要读批注必须把 docx 当 zip 打开、解析 comments.xml。

## 步骤

1. **一键脚本**:`scripts/read-docx-comments.ps1 -DocxPath "<文件路径>"` → 输出每条批注的作者/时间/内容 + 锚定到正文所在章节段落(2026-08-18 实测 12 条批注全提取)
2. **手工原理**(脚本不可用时的替代路径):
   - `Add-Type -AssemblyName System.IO.Compression.FileSystem` + `[System.IO.Compression.ZipFile]::OpenRead($docx)`
   - 用 UTF-8 `StreamReader` 读 `word/comments.xml`(否则中文乱码)
   - 命名空间:`w` = `http://schemas.openxmlformats.org/wordprocessingml/2006/main`,用 `XmlNamespaceManager` 注册
   - 每条批注 = `//w:comment` 节点,取属性 `w:id` / `w:author` / `w:date`,正文拼 `.//w:t`
   - **锚点定位**:`word/document.xml` 里 `w:commentRangeStart`(带 w:id)所在段落,拼该段落 `w:t` 文本 → 就知道批注批在目录/正文的哪一行
3. 整理成清单 → 与兄弟逐条确认采纳/不采纳(方向性建议需拍板)→ 落回 `目录.md` / 正文

## 编辑批注常见主线(2026-08-18 实测 12 条归纳)

- **命名规范化**:去动词头「了解/理解/对比」直接名词化;「从0」→「从零」;「AI 辅助编程」→「Vibe Coding辅助编程」;Brief vs Agent Brief 全目录统一
- **表述一致性**:2.3 节「工作模式」改表述则第 7~15 章、16.1 需同步
- **篇幅删减**:编辑建议砍「从零开发」案例章节(点名第 13 章美术工具,需美术知识较难)
- **冗余删除**:与 1.3 等前文重复的小节建议删

## 配套文件

- `scripts/read-docx-comments.ps1` — 提取 docx 批注 + 锚点定位的一键脚本（读）
- `scripts/fill-docx-from-md.py` — 从 markdown 填写 Word 模板表格（表单/申报表类 docx 生成，写）

## 写 docx：从 markdown 填充 Word 模板表格（2026-08-18 选题表实测）

> 场景：把填写稿内容（md）填进编辑的模板 docx（如【选题审查意见表】.docx）生成新文件，不覆盖模板原件。

### 前置：python 环境（本机已装 python-docx）
- 🔴 **本机 python 不在 PATH**（`python` / `py` / `where python` 都找不到）。用 `D:\4.1\python\bin\python.exe`（Python 3.11，已装 python-docx 1.2.0）。
- 若报 `ModuleNotFoundError: No module named 'docx'`：`D:\4.1\python\bin\python.exe -m pip install python-docx`（会连带装 lxml）。
- 8-12 生成目录 docx 的 python 环境当时在 OpenClaw 侧，现在本机唯一可用的是 4.1 的 python——先查这个，别满盘找 python.exe。

### 流程
1. **探查模板结构**：写临时 py 脚本读 `doc.tables`，列出每个表格行数/列数、每行独立单元格文本（先 `independent_cells` 去重再看），确认各栏目对应的行号。模板是单表单格式，8 大板块各占一行。
2. **md 内容按 `## ` 二级标题切板块**（脚本内置），每个板块正文填到对应表格行的内容区（`cells[1]`）。
3. **清洗 markdown**：去标题标记 `#`、加粗 `**`、引用 `>`、列表 `-`；**剔除模板指导行**（如「（简要阐述为什么提出此选题方案…）」「（内容提要，不少于 200 字…）」——这些是模板给作者的填写说明，正式填好的 docx 不应保留；用「以（开头的前缀」精确匹配，别误删真实内容行）。
4. **验证**：生成后必须读回 docx 逐栏抽查（开头/结尾、字符数）+ 全文档占位残留检查（`XXX，博士`/`以下文字为示例`/`202x年`/`哈工大XXX` 应全无）+ 模板指导行首段确认已剔除。

### 🔴 三个关键坑（实测踩过）
1. **`row.cells` 对合并单元格重复返回**：表单模板大量合并单元格，遍历 `row.cells` 会拿到同一格多次。必须按 `_tc` 元素去重（`independent_cells`），否则 `set_cell_text` 把同一格覆盖多次，前面的内容丢失。
2. **不要编造待填字段**：模板里「预计交样章时间/交全稿时间」「年龄/职称」等兄弟没定的字段填 `【待填】`，别自作主张写日期/数值。
3. **PowerShell 的 `&` 调用符会被误判为后台 backgrounding**：`& $py -c ...` 直接报错。调用 python 用全路径裸执行 `D:\4.1\python\bin\python.exe -c "..."`，不要用 `&`；装包用 `terminal(background=true)`。

### 🔴🔴 WPS 锁文件坑（2026-08-18 实锤）
兄弟常用 WPS 打开 docx 查看。WPS 开着目标文件时：
- `doc.save(原路径)` 报 `PermissionError: [Errno 13]`
- `Move-Item -Force` 报「文件存在」（Move-Item 对已存在目标默认拒绝，-Force 也因锁失败）

**处理流程**：
1. 先 `doc.save(临时路径)`（读取正常，只是写原路径被锁）
2. 尝试替换原文件；失败 → **把更新版 Copy 到新目标位置**（如 contents/），让兄弟明确知道最新版在哪
3. 检测 WPS 进程：`Get-Process wps`（多个 wps 进程 = 占用）
4. 告知兄弟「关闭 WPS 里打开的文档后我再删旧版」，避免新旧版本混淆
5. 更新后必须**独立验证目标那份**（不是临时那份）

### md→docx 从零生成（中文教材排版，2026-08-18 目录 docx 实测）

> 场景：把 md 目录/正文**从零生成** docx（非模板填充）。规格参考 8-12 目录 docx（正文宋体五号 1.5 倍行距、标题黑体、学时表带框线）。

**排版规格（中文教材/高校惯例）：**
| 元素 | 字体 | 字号 | 说明 |
|------|------|------|------|
| 文档大标题 | 黑体 | 16pt | 居中、1.5 倍行距、段后 12pt |
| 一级标题（## 部分） | 黑体 | 14pt | 段前 12pt 段后 6pt |
| 章标题（### 第X章） | 黑体 | 12pt | 段前 6pt 段后 3pt |
| 节标题（N.N） | 黑体 | 11pt | 加粗 |
| 小节标题（N.N.N） | 黑体 | 10.5pt | 加粗 |
| 正文 | 宋体 | 10.5pt(五号) | 1.5 倍行距、西文 Times New Roman |
| 表格 | 黑体表头/宋体内容 | 10.5pt | Table Grid 框线、居中 |

页边距：上下 2.54cm、左右 3.18cm。中文字体必须用 `run._element.rPr.rFonts.set(qn("w:eastAsia"), "黑体"/"宋体")` 设置，西文设 `run.font.name = "Times New Roman"`。

**md→docx 解析规则（按行分类，优先级从高到低）：**
1. 代码块 ``` → 开关跳过
2. HTML 注释 `<!-- -->` → 跳过（目录 3.3 下有注释掉的备选小节）
3. `|` 开头连续行 → 解析为表格（去 `---` 分隔行）
4. `# ` 文档标题 → 16pt 居中
5. `## ` 一级标题
6. `### 第X章` → 章标题（12pt）
7. `### ` 其他（附录 A.x 等）→ 二级
8. `> ` 引用 → 正文
9. `- ` 列表 → 正文带 `• ` 前缀、左缩进
10. `N.N.N` / `N.N` / `A.N` 编号标题 → 节/小节标题（黑体加粗）
11. `**加粗段**` → 加粗正文（正文内 `**加粗**` 用 `re.split(r"(\*\*[^*]+\*\*)", text)` 拆段处理）
12. 其余 → 正文

**验证要点：**
- 章节数正则要排除「更新点」里的 `第N章新增…` 列表行：用 `^第\d+章\s` + `'新增' not in text` 判断，否则多计 1
- 生成后读回：14 章完整、每章小结+练习齐全、无被删章节残留、无工具标注/修订说明残留

### docx → md 回写主源（编辑改好格式后同步，2026-08-18 实测）

场景：编辑在 WPS 里改好目录格式（编号双空格、加「课堂案例：」等）后发回 docx，需要**从 docx 提取回 md 覆盖主源**（如 `contents/目录.md`），让 md 与编辑确认版一致，后续 md→docx 才能产出相同版式。

- 脚本思路：python-docx 读 `doc.paragraphs`，按行正则分类重建 md：
  - 文档标题 → `# 标题`；`第[一二三四]部分`/`附录` → `## 标题`；`第X章` → `### 第X章…`；`A.N` / `N.N` / `N.N.N` → 原样（**保留编辑的编号后空格数**）；`• 列表` → `- 内容`；其他 → 原样
- 写回用 `newline="\n"` 保持 LF（git 会提示 CRLF 转换，属正常）
- **验证必做**：生成的 md 行数应 = docx 段落数；章标题集合与 docx 逐一比对（`set(docx)^set(md)` 为空）；抽查编辑新增的差异点（如「课堂案例：」）
- 🔴 **md 是唯一主源**：编辑 docx 定稿后，旧的过程 md（如 `目录_…_资料融合修订版2.md`）保留作过程稿但**不要**再当正式源；正式 docx 从编辑原样复制到 contents 并注明「编辑确认版」
- 附带注意：编辑 docx 里偶尔有漏改（如附录 A.1 仍是单空格，正文都双空格）——保持编辑原样，是否统一问兄弟，别擅自改

### 定点改 run 保留兄弟 WPS 填的内容（2026-08-18 实锤）
场景：docx 已被兄弟在 WPS 里手动填过（如作者年龄 37、职称），审核发现个别文字要改（如「学中做做中学」→「学中做、做中学」、漏「在线运行环境」）。**绝不能重新生成整份 docx 覆盖**（会把兄弟填的内容冲掉）。

- 正确做法：python-docx 打开原文件，**逐 run 替换目标文本**：
  ```python
  for p in cell.paragraphs:
      for run in p.runs:
          if "学中做做中学" in run.text:
              run.text = run.text.replace("学中做做中学", "学中做、做中学")
  ```
  - 若关键字跨 run（单个 run 找不到）→ 整段重建：删全部 runs + `p.add_run(新文本)`（丢该段 run 级格式但保内容）
- 定位目标 cell：按 `_tc` 去重找行 + 在该 cell 的 paragraphs 里扫关键字
- 改完 `doc.save(原路径)` 验证：只改目标文字，兄弟填的年龄 37 等原样保留

### 模板字段映射速查（选题审查意见表）
- R0 书名 / R3 作者(独立 cell#1) / R5-R6 交样章、交全稿时间(cell#4)
- R8 选题思路 / R9 读者对象 / R10 作者情况 / R11 内容提要 / R12 配套教辅 / R13 市场分析 / R14 卖点分析 / R15 推广建议
- 「系列教材策划说明」编辑注明作者不用填，跳过

## 故障排查

| 现象 | 处理 |
|------|------|
| 报「无批注」 | docx 包里没有 word/comments.xml → 该文档确实无批注,只是普通文本 |
| 批注中文乱码 | 读 comments.xml 必须用 UTF-8 StreamReader,不要用默认编码 |
| 批注取不全 | 批注正文可能在多个 w:t 里拆分,要 `.//w:t` 全拼再 join,不能只取第一个 |
