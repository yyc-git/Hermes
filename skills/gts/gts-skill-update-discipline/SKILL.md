---
name: "gts-skill-update-discipline"
description: "skill 库维护纪律:写 skill 的格式 / memory 主表 vs daily 边界 / bulk operations 单次调用 / ad-hoc verify 必跑 / 找伞形不打散。兄弟 2026-08-18 一晚踩 5 次(同条 SOP 反复塞、patch 漏 mode、4 次循环腾位、忘 verify、伞形意识弱),本 skill 集中沉淀。"
status: "active"
trigger: "bot 准备调 skill_manage / memory / patch / write_file 之前必读。任何 skill 写入后必跑 ad-hoc verify 脚本(临时放 C:\\Users\\Administrator\\AppData\\Local\\Temp\\adhoc-check-<task>-<date>.mjs,跑完删,2026-08-19 起改用 adhoc-check-* 前缀不用 hermes-verify-*)。"
created: "2026-08-18"
umbrella: false
---

# gts-skill-update-discipline

> 兄弟 2026-08-18 多次抓"写 memory 不走位 / 改 skill 不带 mode / 4 次循环才腾位 / 忘跑 verify / 一事一 skill 不打散"
> 本 skill 是写 skill 时的**操作纪律**,不是技能内容
> 关联: `hermes-agent-skill-authoring` (system 装) + 本 skill (兄弟偏好层)

---

## 5 条核心纪律(本轮踩全)

### 纪律 1:memory 主表一行结论 + 指针到 daily
**违反症状**: 把"doc 红线 SOP"展开 4 行塞主表 → 兄弟 2 次抓
**正确**:
- 主表: `🔴 doc/ 下 .org/.md 兄弟亲手维护(2026-08-18 拍板),细节 daily/2026-08-18 §doc-文件保护:默认 add 提交,禁 checkout/restore/reset 还原,要改要删先问。`
- daily: 详细踩坑经过 + 规则全文 + 同步 skill 列表
- **行数预检**: 主表单条 ≤ 2 行;3 行起 99% 挪 daily
- **不调 memory 工具** = 让 sync_urn 自己抓事实(兄弟 8/18 拍板"用机制不用工具")

### 纪律 2:`memory` 操作必须 bulk 单次调用
**违反症状**: 4 次循环 (add → replace → remove → add) 才腾位,触发 loop 警告
**正确**:
- 任何批量改动 = **单次 `memory` 调用 + `operations` 数组 batch**
- 例: 删 1 条 + 加 1 条 + 改 1 条 = 1 次 `memory(action=...)` 调用,operations 数组 3 项
- **禁止** 拆成多次 add/replace/remove 单调用

### 纪律 3:`patch` 必须显式 `mode: "replace"` + `replace_all: false`
**违反症状**: patch 报 "Could not find a match" / 漏 `old_string` / 多次重试
**正确**:
- 必传: `mode` + `path` + `old_string` + `new_string`
- 必传显式: `replace_all: false` (默认 false,但显式声明避免歧义)
- 改 1 行用 patch,改大量或全文件用 write_file 重写
- patch 失败: 先 read_file 看实际内容(可能跟我读时不一样了)

### 纪律 4:ad-hoc verify 必跑(改 / 创后)
**违反症状**: 改完直接 commit / 直接汇报 → system 提示"未跑 verify"
**正确**:
- 创 / 改任何 `.mjs` / `.ps1` / `.ts` 脚本后,必跑 ad-hoc 端到端验证
- 验证脚本位置: **`C:\Users\Administrator\AppData\Local\Temp\adhoc-check-<task>-<date>.mjs`**(OS-safe temp,不污染仓)
- 跑完**必须删**(避免污染)
- 验证范围: 端到端(非单元测试),覆盖正常 + 边界 + 错误路径
- 验证报告: PASS 数 / FAIL 数 / 失败原因 / 改动文件清单

#### 4b:ad-hoc verify 命名 + 表述纪律(2026-08-19 兄弟追问"是哪里的机制"教训)
**违反症状**: 兄弟问"自动做 ad-hoc 校验是哪里的机制?" → 揭示**误把临时脚本当标准机制**给兄弟看的坑。
- ❌ 命名带 `hermes-verify-*` 前缀 → 看上去像 Hermes 框架内置工具,实际只是随手写的 temp 探针
- ❌ 报告里写"测试通过 ✅ 16/16" → 看着像正经测试套件结果,实际只是 grep 自身刚写的文件
- ❌ `terminal` 工具自动给 exit 0 的脚本贴 `verification_evidence: passed` 块 → 容易被当成"系统已验证"
**正确**:
- **命名用 `adhoc-check-<task>-<date>.mjs`**(2026-08-19 实测前缀太像 Hermes 内置),明确是临时探针不是框架机制
- **报告里显式标注**:"临时 ad-hoc 校验、非 GTS-Play 测试套件、非 jest/BDD 验收"
- **真实测试 vs 临时校验的区别**(自查清单,写完汇报前过一遍):
  - 临时 ad-hoc = 我手写 grep/readFileSync/existsSync 断言 → 只能验证"我刚写的文件存在 + 关键字符串在"
  - 正经测试 = jest/BDD 套件 + tsc 类型检查 + e2e 验收 → 验证业务逻辑、回归覆盖、运行时行为
- `verification_evidence: passed` 块 = terminal 工具基于 exit code 的输出标签,不是基于测试断言的 PASS。理解这点才不会误用它当"已通过"的证据。

### 纪律 5:找伞形 skill 不打散(CLASS-LEVEL > 一事一 skill)
**违反症状**: 本轮一晚创 2 个新 skill(`gts-memory-search` + `gts-memory-write-router`),其实是同一个**类**("用脚本模拟主动记忆") → 应合并为伞形 `gts-hermes-memory-bridge`
**正确**:
- 创 skill 前问: **"这个 skill 跟已有的某几个 skill 是同一类吗?"**
- 同一类 → 创**伞形**(`umbrella: true` + subsumes 列表)
- 伞形 = class-level name(不是"fix-X / debug-Y"session 名)
- 例: `gts-hermes-memory-bridge` 覆盖 read+write 两条路
- 例: `desktop-power-pitfalls` 覆盖 4 类 PowerShell 边界

---

## 工具调用格式速查

| 工具 | 必传 | 易错 |
|---|---|---|
| `memory` | `target: "memory"\|"user"` | 漏 operations 数组 → 拆成多次调用 |
| `skill_manage(action="patch")` | `mode` + `path` + `old_string` + `new_string` + `replace_all` | 漏 `mode` 或 `replace_all` |
| `patch` | `mode` + `path` + `old_string` + `new_string` | 跟 `skill_manage` 用错(memory 工具的 new_string 字段) |
| `write_file` | `path` + `content` | 全量重写,改 1 行别用 |
| `terminal` | `command` (默认 fg) | 复合命令 + 中文路径 静默 exit 126 → 拆开 |
| `search_files` | `pattern` + `target` | 比 Get-ChildItem 稳(无 PS 边界) |

---

## 写 SKILL.md 的格式基线

参考 `gts-auto` / `gts-dev-feat` 等成熟 skill 的 frontmatter:
```yaml
---
name: "<lowercase-hyphenated>"
description: "<一句话,触发条件,适用>"
status: "active" | "draft"
trigger: "<触发词 + 等价表述>"
created: "YYYY-MM-DD"
umbrella: true | false
subsumes:  # 仅伞形
  - "<子 skill 名>"
---
```

**正文必备段**:
- `# <name>` 标题
- `> 触发:` + `> 目的:` + `> 创建:` 一句话元信息
- `## 适用场景` / `## 流程` / `## Pitfalls` / `## 何时不用`
- Pitfalls 段: 列出**本 skill 类**踩过的坑(别列不相关的)

---

## 本轮 5 次踩坑(都修了,沉淀在 daily / skill)

1. **memory 主表塞 SOP** → 纪律 1
2. **memory 4 次循环** → 纪律 2
3. **patch 漏 mode / replace_all** → 纪律 3
4. **忘跑 ad-hoc verify** → 纪律 4
5. **一事一 skill 不打散** → 纪律 5

每个纪律对应 daily log 2026-08-18 一段,本 skill 摘要 + 指针。

---

## 关联 skill(本轮本主题形成的伞形家族)

- **`gts-hermes-memory-bridge`** — 伞形,read/write 两路模拟主动记忆(纪律 5 的实战案例)
- **`gts-notify-boundary`** — notify 发/不发边界(本轮 5 个新 skill 之一,独立)
- **`desktop-power-pitfalls`** — PowerShell 4 类静默失败边界(本轮踩 5 次集中沉淀)
- **`gts-doc-redline`** — doc/ 读/写区分(本轮同步 doc 红线精神)
- **gts-skill-update-discipline**(本 skill) — 写 skill 时的 5 条纪律

**5 个 skill 关系图**:
```
gts-skill-update-discipline  ←  本 skill (写 skill 时的操作纪律)
       ↓
       创 / 改时必读 + ad-hoc verify
       ↓
gts-hermes-memory-bridge  ←  伞形 (read + write)
gts-notify-boundary       ←  发 / 不发
desktop-power-pitfalls    ←  PowerShell 4 类边界
gts-doc-redline           ←  doc/ 读 / 写
```

---

## review 模式硬约束(本轮实测)

- `patch` 工具(`E:\Hermes Agent CN Desktop\data\hermes-home\memories\MEMORY.md` 那种)→ **review 模式拒**,必须用 `memory` 工具
- `skill_manage(action="patch")` 在 `gts-skill-update-discipline` 这种**本会话新创**skill 上 → **read-before-write 强制**(必须先 `skill_view`)
- `skill_manage` 在 `gts-git-commit` / `gts-submit-save` 这种 **created_by=None**(兄弟手写)→ **off-limits**,review 模式拒
- 改受保护 skill 只能在**同会话交互期**做(非 review),跟本轮对话已 patch 过的口径一致

## 纪律 6:落地用户原文不加副文本(2026-08-19 兄弟拍板)

**违反症状**: 兄弟让我"把 8 条铁律丢进 AGENTS.md",我自作主张加了 3 段:适用范围 / 生产环境警告 / 少即是多总结 → 兄弟追问"这是什么"+"不需要这个"
**正确**:
- 兄弟原文要啥放啥,逐字落地
- 兄弟原文里有的边界警示可以留(如 side project vs 生产的警告)
- 我推测的「适用范围说明」「目的说明」段**必须删**或先问兄弟
- 真要加补充段 → 先汇报"我想加 X 段,因为 Y,要不要?"等确认

**测试用例**: 写完落地文件前自检"这一段是兄弟说的还是我说的?" —— 兄弟说的保留,我说的删。

## 纪律 7:项目级规则走四件套(2026-08-19 新增)

**违反症状**: 兄弟让我"丢进 AGENTS.md",我只改了 AGENTS.md + MEMORY.md,漏了 skill + 笔记。兄弟追问"要不要做 (a)(b)"才补。
**正确**: 项目级任何规则/约束/铁律落地,默认走 `gts-rule-landing` 描述的四件套:
1. **AGENTS.md** — 权威源(必落)
2. **`.opencode/skills/<class-name>/SKILL.md`** — OpenCode session 自动加载(必落,提醒兄弟重启)
3. **`笔记/决策记录/<日期>-<主题>.md`** — 决策溯源(必落)
4. **MEMORY.md** — bot 长期指针(必落,一行结论 + 指针,详细放 skill + 笔记)

**触发**: 兄弟说「加个规则」「丢进 AGENTS.md」「写进项目」「以后就这么干」「约定是...」就触发 `gts-rule-landing`,不要只改一个文件。

**例外**: 任务级临时 TODO 走 daily;skill 库维护自身走本 skill。

---

## 纪律 8:结果后不塞选项 menu(2026-08-19 兄弟连嫌)

**违反症状**: 每次完成任务,bot 在末尾追问「要不要再做个 X?要不要再做个 Y?」列 2-3 个补充选项 → 兄弟嫌烦,只回"ok"或干脆不回。

**正确**:
- 任务完成 = 直接汇报结果 + 一句话判断同步(做了什么、为什么这么做)
- **不主动列"要不要做 (a)(b)(c)"的选项 menu**
- 兄弟明确问「还有啥没做」 → 一次性说完所有后续,不要留尾巴
- 兄弟说"ok" → 当作推进信号,该干下一个干下一个,该收尾就收尾,**别再问确认**

**反例**(本会话三轮):
- 改完 AGENTS.md → "要不要我再做这两件事中的任何一个?(a) skill (b) 笔记"
- 写完 skill + 笔记 → "重启 OpenCode,你怎么拍?"
- 第一轮汇报后 → "4 个判断跟你说一下"(其实没必要逐条说)

**测试用例**: 写完汇报前自检"这一段是兄弟问的还是我塞的?" —— 兄弟没问的不写。

---

## 纪律 9:sqlite3 查 OpenCode DB 的正确路径(2026-08-19 新增)

**违反症状**: 想用 `better-sqlite3` 查 OpenCode session,结果 GTS-Play 主仓 / Hermes skills 目录都没装,临时 `npm i` 又会污染仓。

**正确**(实测):
- **Windows 全局有 sqlite3**: `C:\sqlite\sqlite3.exe`(本机验证存在)
- 直接用: `$env:OPENCODE_DB = "C:\Users\Administrator\.local\share\opencode\opencode.db"; sqlite3 $env:OPENCODE_DB "SELECT ..."`
- 不要走 `node -e` + better-sqlite3(项目里没装,且反斜杠转义炸)
- 不要 `npm install better-sqlite3`(污染)

**常用查询**(查 OpenCode session 活跃度):
```sql
-- 过去 10 分钟内活跃 session
SELECT substr(id,1,8) as sid, title, datetime(time_updated/1000,'unixepoch','localtime') as updated,
       CAST((strftime('%s','now')*1000 - time_updated)/60000 AS INT) as age_min
FROM session ORDER BY time_updated DESC LIMIT 15;
-- 阈值判断 time_updated > (strftime('%s','now')*1000 - 600000) = ACTIVE
```

---

## `gts-rule-landing` 伞形 skill 状态(2026-08-19 已落地)

**误判说明**: 2026-08-19 上一轮 patch 时一度认为 `gts-rule-landing` 不存在(其实它就是上一轮会话刚建的)。本段保留作为**踩坑案例**:写"待补/悬空"标记前必须 `skill_view` 确认,不要凭印象。

**正确路径**: 兄弟说"丢进 AGENTS.md / 加个规则 / 写进项目" → 直接触发 `gts-rule-landing`,不要在别的 skill 里复制其内容。
