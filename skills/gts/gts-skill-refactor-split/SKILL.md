---
name: "gts-skill-refactor-split"
description: "把胖 skill（>20KB / 长平铺 / 多引用方）拆成「主入口 + references/*.md」三层结构。按职能切 reference,主 skill 只留元规则+常驻调度;按需 load 细节保住引用方 LLM 上下文。触发:兄弟说拆分/拆 skill/skill 太长/skill 太大;某个 skill >30KB 且引用方 ≥3 个;或自己 review 时看到 H2 大段堆叠无 references/。"
status: "active"
created: "2026-08-20"
umbrella: true
trigger: "skill 文件 > 30KB / 引用方 ≥ 3 / 长平铺 H2-H3 堆叠 / 兄弟说「拆分」「拆 skill」「skill 太长」「这 skill 怎么这么大」"
---

# gts-skill-refactor-split — 胖 skill 拆分 playbook

> 2026-08-20 实测沉淀：opencode-schedule 110KB / 1102 行（gts 最胖），拆成主入口 27KB + 4 个 reference，平均 12KB。引用方 33 个 skill 不受影响（name 保持兼容），bot 主线一次 load 该 skill 烧 token 从 110KB → 27KB（-76%）。

## 何时拆（决策树）

兄弟说「拆」/「skill 太长」/ 自己 review 时看到下列任一：

| 信号 | 阈值 | 拆 |
|---|---|---|
| 主 skill 文件大小 | > 30KB | ✅ 该拆 |
| 行数 | > 500 行 | ✅ 该拆 |
| 引用方 skill 数 | ≥ 3 个 | ✅ 强拆（影响面大） |
| 主入口 load 时烧 token | > 15k chars ≈ 5k tokens | ✅ 拆 |
| H2-H3 长平铺无 `references/` | 任意 | ✅ 拆（结构问题） |
| 临时 session 用一次的 skill | 任意 | ❌ 不要拆（一事一 skill） |

## 三层结构（拆分后形态）

```
<skill-name>/
├── SKILL.md              # 主入口(8-30KB):元规则 + 常驻调度 + 引用 reference
└── references/           # 按需 load(每个 5-20KB)
    ├── <topic1>.md       # 按职能切,不要按章节切
    ├── <topic2>.md
    └── ...
```

### reference 三类（按 value 切，不是按章节切）

| 类型 | 何时放 reference | 例子（opencode-schedule 实战）|
|---|---|---|
| **模板/必填清单** | 写前必查但 load 时不必背 | `references/brief-template.md` |
| **检查链/SOP** | 触发条件明确(load 时判定) | `references/dispatch-checklist.md`(Step 0/0.5/0.6/0.7) |
| **异常处置/状态机** | 出岔子才用(load 前不知道要不要查) | `references/session-lifecycle.md` / `monitoring-wait.md` |

🔴 **不要按章节切**("2️⃣" 段抽出去 / "3️⃣" 段抽出去) —— 章节切出来的 reference 是 H2 残片，没有自洽的判定条件，load 进来还是一坨。按"什么时候用"切才是真拆分。

## 7 步流程（2026-08-20 opencode-schedule 实战）

### Step 1：画边界
读全文 → 标 H2/H3 起止行号 → 列"按职能切"的候选 reference 列表（每个写一行"何时 load"）

```powershell
$content = Get-Content SKILL.md -Raw
$lines = $content -split "`n"
$markers = @()
0..($lines.Count-1) | Where-Object { $lines[$_] -match '^(#{2,3}) .+' } | ForEach-Object {
  "{0,5} {1}" -f ($_+1), $lines[$_]
}
```

### Step 2：建目录 + 用 write_file 写 reference

```powershell
New-Item -ItemType Directory -Path "<skill-dir>\references" -Force
```

每个 reference 一份 write_file，**保留原文 + 加顶层一句话"何时 load"**。原文搬过去不要"优化"，避免拆分过程中内容丢。

### Step 3：主 SKILL.md 全文重写（write_file，不用 patch）

目标：从 30KB+ 压到 8-30KB。保留：
- 顶部铁规（时段、版本、紧急红线）
- 流程骨架（命令模板 + checklist 清单）
- 5️⃣ 硬性规则（与职责无关的纪律直接保留学）
- 6️⃣ 速查表（如果是决策类 skill）

引用 reference 用一句话指向 + 一行判定条件：
```markdown
| 何时 load | 走 reference |
|---|---|
| 写 brief 前 | `references/brief-template.md` |
| dispatch 前检查 | `references/dispatch-checklist.md` |
| session 出岔子 | `references/session-lifecycle.md` |
| 等 wait / 看 exit code | `references/monitoring-wait.md` |
```

### Step 4：保持 name 不变（兼容引用方）

🔴 **绝对不要改 frontmatter 的 `name`**。改 name → 所有引用方 skill 的 SKILL.md 都要改 → 30+ 文件改动 → 高风险。

只调整 `description`（加 "入口" / 加 "按需 load" 提示），更明确。

```yaml
# 拆分前
description: "OpenCode 调度方式:写 .opencode-brief.md → $brief 变量 → opencode run --attach --no-replay"

# 拆分后(微调,加按需指引)
description: "OpenCode 调度协议入口。bot 调度 OpenCode 的铁规集合,被 gts-dev-fix 等 skill 引用。dispatch 前必 load 本 skill + 相关 reference。"
```

### Step 5：验证 3 件套（缺一不可）

```powershell
# 1) 主 skill 引用的所有 references/*.md 是否都存在
[regex]::Matches((Get-Content SKILL.md -Raw), 'references/[\w\-]+\.md') |
  ForEach-Object { $_.Value } | Sort-Object -Unique |
  ForEach-Object { $f = Join-Path "<skill-dir>" $_; if (Test-Path $f) {"✅ $_"} else {"🔴 $_ MISSING"} }

# 2) 引用方兼容(其他 skill 仍在引用 name,没破)
Get-ChildItem "<hermes-home>/skills" -Recurse -Filter SKILL.md | Where-Object {
  (Get-Content $_.FullName -Raw) -match "<skill-name>"
} | Select-Object -ExpandProperty DirectoryName

# 3) 关键命令/术语在拆分前后不丢(关键词回归)
$allText = (Get-ChildItem "<skill-dir>" -Recurse -File) | ForEach-Object { Get-Content $_ -Raw } | Out-String
@('wait-opencode-session.mjs', 'opencode session delete', '--attach http://localhost:4098', 'volcark/deepseek-v4-flash-ga-260731') |
  ForEach-Object { $hits = ([regex]::Matches($allText, [regex]::Escape($_))).Count; "{0,-50} {1} 处" -f $_, $hits }
```

🔴 **补丁**:执行 Step 1 之前,如果 MEMORY.md / 兄弟口述提到伞形 skill 已建,**先 `Test-Path <hermes-home>/skills/<name>/SKILL.md` + `Test-Path <hermes-home>/skills/gts/<name>/SKILL.md` 两个路径都试**(本会话实坑:伞形在 `gts/` 下而不是顶层)。

🔴 **正则别写错**(Step 6 见 `gts-skill-update-discipline` 纪律 3)。引号包裹、路径斜杠方向,单引号双引号在 PS 里差异很大。

### Step 6：跑 ad-hoc verify（按 `gts-skill-update-discipline` 纪律 4）

```powershell
# adhoc-check-<task>-<date>.mjs (放 Temp,跑完删)
$tempScript = "$env:TEMP\adhoc-check-skill-split-2026-08-20.mjs"
# 内容:把上面 3 个 PowerShell 块包成 node 脚本 + 跑 node $tempScript
# 完事:Remove-Item $tempScript -Force
```

### Step 7：commit + changelog

🔴 **commit 前必 `git diff --staged --stat` 核对清单完整**（`gts-skill-update-discipline` 纪律 11）。本会话同时改了 SKILL.md + 加了 4 个 reference，别让 patch tool 把别的文件一起 stage 进去。

changelog 写到 `笔记/skill-changelog/<日期>-<skill-name>-split.md`（一行结论 + 拆分前后 size 对比 + 验证 3 件套结果）。

## 拆分前后 size 预期

| 原大小 | 拆后主入口 | 单 reference 平均 | 引用方 load 减幅 |
|---|---|---|---|
| 50-80KB | 15-25KB | 10-15KB | -70% |
| 80-120KB | 25-35KB | 12-18KB | -76% |
| >150KB | 35-50KB（可能还要拆 `references/` 子层） | 15-25KB | -80%+ |

> ⚠️ 主入口 > 30KB 还是偏胖，可能需要 2 级 reference（reference 内部再有 `references/`）。本 playbook 暂不展开。

## Pitfalls

### 0. (2026-08-20 patch-lie 教训) 信任 MEMORY 主表断言的文件路径,跳过 Test-Path

- ❌ MEMORY.md 写「伞形 skill 已落 `skills/<name>/`」→ 直接 `New-Item -ItemType Directory ...` → 撞到另一 session 已经建在 `skills/gts/<name>/` 的同类伞形 → 留下两份重复
- ✅ 任何 mkdir / `New-Item -ItemType Directory -Force` 之前,**先 `Test-Path` 列**兄弟/其它 session 可能留下的同名目录(本会话实锤:伞形 skill `gts-skill-refactor-split` 真身已经在 `skills/gts/gts-skill-refactor-split/SKILL.md`,MEMORY 主表指向的 `skills/gts-skill-refactor-split/` 是上一轮没建到位)
- ✅ `git ls-files | grep <name>` 看是否 tracked;`search_files(target=files, pattern="<name>")` 列所有同名 SKILL.md / references 目录
- 同类反例:`gts-rule-landing` 在 8-19 上一轮也出现过「写『待补/悬空』标记前必须 skill_view 确认」(已写在末尾)
- 这条**与 gts-skill-update-discipline 纪律 5 (找伞形不打散) + 纪律 11 (commit staging 核对) 互补**——纪律管「该建在哪 / commit 带什么」,这条管「主表断言的不一定是真的」

### 1. 按章节切而不是按职能切
- ❌ "把 2️⃣ 段抽 reference/dispatch.md" → reference 是 H2 残片，load 进来还是得读全文找自己关心的
- ✅ "把 dispatch + Step 0/0.5/0.6/0.7 + stale/Aborted 全切到一个 reference" → 按"dispatch 前 / 后 / 出岔子"3 个阶段 load

### 2. 改 name 字段
❌ 把 `name: "opencode-schedule"` 改成 `name: "opencode-schedule-main"` → 33 个引用方 skill 全部读不到
✅ `name` 保持不变，只调 description 加 "入口"

### 3. 拆分中"优化"原文丢内容
- ❌ 顺手精简某段话 → 引发 "这什么意思？原话是怎样？" 的回查
- ✅ write_file 全文照搬，加顶层一句话"何时 load"即可；精简是后续可选迭代

### 4. 验证漏查 cross-reference
- ❌ 只查 SKILL.md 里引用的 reference 名是否都存在 → 漏掉 reference 内部互相引用（如 `brief-template.md` 引 `dispatch-checklist.md`）
- ✅ 验证脚本要把 references/ 下所有文件 grep 一遍，列出所有 `references/*.md` 引用，目标全部 Test-Path 通

### 5. 拆完直接汇报"搞定"
- ❌ 总结 + 数字给兄弟 → 漏掉 commit 步骤、漏 changelog
- ✅ 必走 7 步流程 Step 7（commit + changelog），汇报前自查"3 件套全跑 + ad-hoc verify 通过 + 清单 OK"

### 6. 同一轮 dispatch 拆 skill（撞 4098 不热加载）
❌ bot 手上在用本 skill 派工的中途，又改本 skill → 4098 server 不热加载 → 同轮 dispatch 拿不到新版本（`gts-skill-update-discipline` 历史踩坑，已记录）
✅ 拆 skill 时机 = 等手上活结束 / 兄弟明确拍"现在"

## 何时不用

- **临时 session skill**（任务级 one-off）→ 直接写 skill 当 solution，不拆
- **小 skill < 20KB** → 拆完反而更碎（reference < 5KB 没价值），先观察
- **agent 自己用的 skill**（不通过引用方 load）→ 影响面小，等真的臃肿再拆

## 关联 skill

- **`gts-skill-update-discipline`** — 写 skill 时的 5 条纪律（模式 / patch / verify / 伞形 / 主表）；本 skill 是其"拆胖 skill"场景的具体落地
- **`opencode-schedule`** — 本 playbook 第一次落地的实战标的（110KB → 27KB + 4 reference，引用方 33 个 skill 不受影响）

## 实战记录

- **2026-08-20 opencode-schedule split**: 110.8KB → 79KB（合计 5 文件 = 主 27.1KB + 4 ref 6-18KB），引用方 33 个 skill name 不变兼容，3 件套验证全通，零踩坑一次过
