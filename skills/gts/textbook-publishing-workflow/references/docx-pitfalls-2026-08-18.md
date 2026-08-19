# docx 生成/填充 实测踩坑（2026-08-18 写书项目）

## WPS/Word 锁文件坑（实锤）

- 现象：python-docx `doc.save(原路径)` 报 `PermissionError: [Errno 13]`；PowerShell `Move-Item` 报「文件存在」；但读取正常
- 根因：目标 docx 被 WPS/Word 正打开（本机多个 `wps` 进程，`Get-Process wps,WINWORD` 可见）
- 绕过：
  1. 先 `doc.save(临时路径)`（临时文件保存成功 → 证明是源文件被锁，不是读取问题）
  2. 再尝试 `Move-Item -Path tmp -Destination 目标 -Force` 替换
  3. 仍失败（锁未释放）→ 直接把更新版放到新位置（如 `contents/`），明确告知兄弟「关闭 WPS 后我再删旧版」
- 验证：改完独立验证目标那份 docx（不依赖已删的临时脚本）

## 本机 python 环境

- `D:\4.1\python\bin\python.exe`（Python 3.11.7，已装 python-docx 1.2.0 + lxml，2026-08-18 pip 装的）
- `&` 调用符会被 Hermes PowerShell 误判 backgrounding → 用完整路径直接调用，不用 `&`

## 临时脚本纪律

- 探查/填充/验证的 `.py` 写 `C:\Users\Administrator\AppData\Local\Temp\`（勿留仓库内），验证脚本名带 `hermes-verify-` 前缀
- 用完即删；文档任务无单测，验证 = ad-hoc 断言（可读性 + 内容完整性 + 无模板残留 + 关键字段）
- 系统会提示「临时文件变更未验证」——用临时 `hermes-verify-` 脚本跑一遍新鲜验证再清理即可，不用过度响应

## 定点改 docx 保留兄弟 WPS 填的内容（2026-08-18 实锤）

场景：docx 已被兄弟在 WPS 里手动填过（如作者年龄 37、职称），但审核发现个别文字要改（如「学中做做中学」→「学中做、做中学」、漏「在线运行环境」）。此时**绝不能重新生成整份 docx 覆盖**（会把兄弟填的内容冲掉）。

- 正确做法：python-docx 打开原文件，**逐 run 替换目标文本**：
  ```python
  for p in cell.paragraphs:
      for run in p.runs:
          if "学中做做中学" in run.text:
              run.text = run.text.replace("学中做做中学", "学中做、做中学")
  ```
  - 若关键字跨 run（单个 run 里找不到）→ 整段重建：删全部 runs + `p.add_run(新文本)`（丢失该段 run 级格式，但保内容）
- 定位目标 cell：按 `_tc` 去重找行 + 在该 cell 的 paragraphs 里扫关键字
- 改完 `doc.save(原路径)` 验证：只改目标文字，其他（兄弟填的年龄 37 等）原样保留

- 模板是合并单元格大表格：`row.cells` 对合并格返回重复对象 → 按 `_tc` 去重后取内容区
- 模板指导行（「简要阐述…」「以下文字为示例」「参考：本书严格」）必须剔除，正式交付零残留
- 未定字段填 `【待填】`，别编造日期/数值
- 顶部单格字段（书名/作者/时间）按行号+列索引精确定位
