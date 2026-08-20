# brief 模板与必填项

> 主 skill 「1️⃣ 写 brief 文件」整段拆出（2026-08-20）。dispatch 前必须按此模板填 brief，禁止裸调。

## 1. 文件路径

`<projectDir>/.opencode-brief.md`

🔴 **多任务并行时用 `.opencode-brief-<task>.md` 隔离**（见主 skill 5️⃣ 硬性规则 + dispatch-checklist Step 0.5 预检）

## 2. 完整模板（直接复制）

```markdown
# <任务标题,如"mmd-physics-fix impl">

## 🔴 工作区状态预检(开工前必须先确认)
(详见 references/dispatch-checklist.md → Step 0.6)

执行前先跑:
```powershell
cd D:\Github\<worktree>
git status --short
git log --oneline -3
git branch --show-current
```
把上述输出写到报告首段,**禁止从"零改动"或"worktree 没有改动"假设起步**。如果发现工作区有非预期的改动(如 wt1 已经有 X 文件 modified),必须先核对是否属于本次任务范围,不属于则停手汇报兄弟。

---

## 📋 三态定义（必填,2026-08-05 新增）
- **输入**:<输入数据/文件/入口>
- **输出**:<产物路径 + 内容形态>
- **失败态**:<失败定义 + 处理方式>

## 🚫 不做清单（必填）
- <不做的内容列表>

---

## 🌐 语言与规约声明(开头固定)

- **全程用中文**(2026-08-18 兄弟拍板):所有消息、分析、报告、总结用中文;代码注释中文或英文均可;代码标识符/API 名/日志字符串保持英文
- 共享规约见 `docs/agent-context.md`,包括 TDD 纪律、集成测试纪律、自验证要求、精准读文件纪律、返回格式

## 🎯 任务目标
- <本批要做的 1 个原子单元,RED→GREEN>

## 🚦 硬性门禁(必写,2026-08-01 教训)
> 任何时刻运行 build/jest 出现错误 = **当场修复**,禁止开始任何新文件的修改。
> 修复中禁止切换任务。连续 3 次修复尝试仍失败 → 立即停止,输出失败详情,不要继续。

> **验证是门禁不是仪式。**(上一个 session 失败案例:<具体>)

## ⚙️ 执行约束(brief 末尾,2026-08-10 教训)

- 工作目录已是 dispatch `--dir` 设置好的路径,**禁止 `cd` 到外部目录**(尤其 Windows 下 `/d/`、`/c/` 等 Git Bash 写法会触发 `external_directory` 权限拒绝 → 零产出 exit 0)
- git 命令**禁止 `git -C <外部路径>`**,直接在当前目录用 `git diff HEAD -- <file>` / `git status`
- 只用读取类操作(`Get-ChildItem`/`Select-String`/`Get-Content`)
- 🔴 精准读文件:读大文件时用 `offset` + `limit` 精确范围,不全文 dump
- 🔴 依赖变更(改 `package.json`):**OpenCode 必须自己跑 `yarn bootstrap --mutex network`** 再继续

### PowerShell 坑(2026-08-19 实锤)

🔴🔴 **PowerShell `-like` 大小写不敏感**:默认**不区分大小写**,glob 通配符 `Tda*` 会匹配 `TDA式宴 夏卉_opt/`(XiaHui 模型) → writeback 写错条目
- **修复**:用更精确的 glob(包含 HMS 关键字)`Tda*HMS*_opt` + 精确文件名(不用 glob),或用 `-clike` 显式指定大小写敏感
- 例:`Get-ChildItem "Tda 夏夜1*HMS illustrious*" -Directory` 比 `Tda*_opt` 更安全

替换命令:
- 过滤输出:`Select-String`(替代 grep)——`npx tsc --noEmit 2>&1 | Select-String "xxx.ts" | Select-String -NotMatch "TS6133|TS6192"`
- 保存输出:`Out-File -Encoding utf8 xxx.txt`(替代 `> /dev/null`)
- 多步:`;` 连接(替代 `&&`)
- tsc 验证在**目标包目录**跑(本次改动涉及的包,如 `packages/frontend` / `packages/room-service` 等),不在仓库根目录跑(根目录 = 全仓 7000+ 行既有 unused 噪音)

---

## 🚫 禁止项(必写)

- 🔴🔴🔴 禁止修改 `doc/` 和 `笔记/语雀知识库/` 目录(兄弟手动维护的版本日志)
- 🔴 末尾写「不需要代码审核,代码审核是单独步骤」
- 🔴 纯方案/写 specs 任务:brief 必须写「不能写代码,只能写 specs」
- 🔴 简单任务一刀切(写 specs + 实现一轮 dispatch):brief 必须明确写出**先写 specs 文件,再实现代码**的顺序步骤,不能混在一起

## 🚫 权限边界(brief 双保险,防 temp/项目外路径)

- 临时/中间文件一律写到工作目录下(如 `<projectDir>/.tmp/` 或当前目录)
- **禁止写系统 temp 路径**(`C:\Users\...\AppData\Local\Temp`、`$env:TEMP`、`/tmp`)
- 确需写系统 temp 时,在 brief 中显式声明用途再写
- 其它易触发权限的操作(download 到系统目录、写注册表、装全局包等)同理:brief 里提前声明允许范围
- 🔴 **禁止在 brief 里教 agent 用"绕过权限"的邪道**(如 chmod 777、直接改配置文件跳权限),那是安全红线
```

## 3. 各必填项快速索引

| 项 | 来源教训 | 缺失后果 |
|---|---|---|
| 文件路径 `.opencode-brief-<task>.md` 隔离 | 2026-08-08 多任务跑偏 | 通用 brief 被覆盖,agent 读到别人的任务 |
| 中文声明 | 2026-08-18 兄弟拍板 | OpenCode 产出英文报告/总结 |
| 引用 `docs/agent-context.md` | TDD/集成测试规约集中维护 | 每 brief 重复贴一份,容易漏 |
| 每批只派 1 个原子单元 | 2026-08-01 nf-Colyseus 教训 | agent 一路推到底,中间 build 红灯不回头 |
| 红灯=阻塞硬性命令 | 2026-08-01 build 红还继续改 | 改完 25 分钟全部 Aborted |
| 三态定义 + 不做清单 | 2026-08-05 防 AI 玄学空间 | agent 自己定义边界,跑偏 |
| 工作区状态预检 | 2026-08-18 XiaHui Phase D | agent 凭印象开工,改错文件 |
| 「验证是门禁不是仪式」+ 失败案例 | 上一 session 血泪教训 | 新 agent 重蹈覆辙 |
| 执行约束(禁 cd 外部/禁 `git -C`) | 2026-08-10 权限拒绝 | exit 0 零产出 |
| PowerShell `-clike` 警告 | 2026-08-19 XiaHui writeback 错位 | 写错角色条目 |
| 临时文件落工作目录 | 2026-08-18 权限卡住 | 弹权限,卡死 |
| 禁改 `doc/` + `笔记/语雀知识库/` | 兄弟手动维护版本日志 | commit 冲突 |
| 「不需要代码审核」声明 | brief 末尾 | agent 顺手审核,浪费 token |
| 「不写代码只写 specs」(纯方案任务) | agent 默认想写代码 | specs 任务被破坏 |

## 4. bot 拼接 brief 的固定动作

dispatch 前 bot 自己:

1. 读 `笔记/项目文档/project-context.md` → 拼接到 brief 开头(`OpenCode 不自己读`,bot 注)
2. 按上面模板填入任务专属内容(三态、目标、门禁、约束等)
3. 写到 `<projectDir>/.opencode-brief-<task>.md`
4. 跑 `references/dispatch-checklist.md` Step 0.5 预检(列根目录所有 brief + 检查 mtime + 打印头 3 行)
5. 然后才走 dispatch
