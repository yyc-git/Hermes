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
### 纪律 3:`patch` 必须显式 `mode: "replace"` + `replace_all: false`(2026-08-20 补两种 mode 区别)

**违反症状**: patch 报 "Could not find a match" / 漏 `old_string` / 多次重试

**正确**:
- 必传: `mode` + `path` + `old_string` + `new_string`
- 必传显式: `replace_all: false` (默认 false,但显式声明避免歧义)
- 改 1 行用 patch,改大量或全文件用 write_file 重写
- patch 失败: 先 read_file 看实际内容(可能跟我读时不一样了)

**🔴 patch 工具两种 mode 互斥字段(2026-08-20 一天踩 5 次)**:

| mode | 必传字段 | 禁用字段 | 用途 |
|------|---------|---------|------|
| `mode='replace'` (默认) | `path` + `old_string` + `new_string` | **`patch` 字段** | 改单文件:old_string → new_string 精确替换 |
| `mode='patch'` | `patch` 字段(V4A 格式字符串) | **`path` 字段** | 改多文件:批量 V4A patch 跨文件打补丁 |

**典型错配**:
- ❌ `mode='patch'` 但同时传 `path` → 工具说"path required" 因为它走 patch 路径不认 path
- ❌ `mode='replace'` 但同时传 `patch` 字段 → 工具优先按 patch 走,旧字符串找不到
- ❌ 反复 4-5 次都忘了到底用哪个 mode,每次换着试

**自查清单**(调 patch 前 30 秒):
1. 改 1 文件 → 用 `mode='replace'` + path + old_string + new_string(三个)
2. 改多文件或 V4A 格式 → 用 `mode='patch'` + patch 字段(只要这一个)
3. 不确定 → 默认 `mode='replace'`,99% 场景够用
4. 报"path required" → 切换 mode='patch' 路径
5. 报"Could not find a match" → 看 old_string 是否精确(读现状文件比对)

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

#### 4c:清理临时脚本时绝对不能误删兄弟的文件(2026-08-20 实锤违规)
**违反症状**: 跑完 ad-hoc verify 想清掉 `hermes-verify-*.ps1` → 写成 `Remove-Item hermes-verify-X.ps1, hermes-verify-Y.ps1, hermes-verify-Z.ps1` 列表(把兄弟 2026-08-18 创建的 `hermes-verify-precommit.ps1` 顺手带上)→ **可能误删兄弟文件**。

**正确**:
- `Remove-Item` 临时脚本时 **必须列显式文件名**(枚举 list),**不写 wildcard / 不写前缀模糊匹配**
- 删前**必查 LastWriteTime 确认是自己建的**:
  ```powershell
  # 先看时间,确认今天 vs 早
  Get-ChildItem C:\Users\Administrator\AppData\Local\Temp\hermes-verify*.ps1 -ErrorAction SilentlyContinue | Select-Object Name, LastWriteTime
  # 只删今天的(我自己建的)
  ```
- **判据**:兄弟 pre-existing 文件 LastWriteTime < 今天(8-18/8-19),我自己创建的 = 今天
- **绝对禁止**:
  - ❌ `Remove-Item hermes-verify-*`(wildcard 可能误删)
  - ❌ 列表里**包含非今天的兄弟文件**(哪怕 LastWriteTime 不一样)
  - ❌ 删完不 verify 是否还有遗留兄弟文件

#### 4d:ad-hoc 验证脚本内禁止贪心写"完整自检"(2026-08-20 实测教训)
**违反症状**: 一脚本塞 11-15 个 PASS 检查 → 跑出来发现某项 FAIL 后修脚本,改完又发现另一项 FAIL,反复 debug 5 轮(80%+ 是脚本本身 bug,不是真问题)。

**正确**:
- ad-hoc verify **只验证 ad-hoc 关心的事实**(如:文件存在 + JSON 合法 + DB 中有记录),**别套 5-15 个验证点**
- 验证粒度 = "这一个 session 我刚做的事是否落地",**不是 "全面健康检查"**
- 真的需要全面检查 → 走 `node scripts/diagnose-llm-fail.mjs`(已有完整工具),不要自己拼
- 3-5 个 PASS 即可,**别贪心**(每多一个 PASS 验证点,script-bug 概率 +20%)

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
- **review 模式工具白名单**(2026-08-20 last review 实测):**只能 `memory` + `skill_manage`**,**禁止** `patch` / `terminal` / `search_files` / `read_file` / `write_file` / `browser_*` / `web_search` / `web_extract` / `vision_analyze` / `todo` / `process` / `delegate_task` / `compact` / `context_usage` / `project_*` / `skills_list` / `skill_view`。**所有"验证/搜索/运行命令"在 review 模式拿不到就报告"无法验证",不要试图绕过**。

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

## 纪律 10:worktree merge + cleanup 必走的硬步骤(2026-08-20 兄弟拍板)

**违反症状**: gts-dev-fix M-0 写了"merge 回 dev" 但没强制 remove worktree → 兄弟实测 wt1/wt2/wt3-prop-fix 三个目录没删(D 盘占位)。**feat/refactor skill 完全没提 merge / cleanup**(2026-08-20 实锤)。

**正确**: 任何 dev 工作流(feat/fix/refactor)在 worktree 中实现后,merge 完成 = 5 步 SOP,缺一不可:

```bash
# 1. 切回主仓,merge worktree 分支
cd D:\Github\GTS-Play
git merge --no-ff wt1 -m "Merge wt1 → dev: <任务摘要>"

# 2. push 到 origin
git push origin dev

# 3. 删除 worktree 实体目录
git worktree remove D:\Github\wt1

# 4. 清残留元数据
git worktree prune

# 5. 二次确认 + 写 issue 记录
git worktree list   # 必须只看到主仓,没有任何 wt*
node scripts/skill-exec-manager.cjs step-done $sid --step-index <最后一步> --notes "merge commit: $(git rev-parse HEAD | cut -c1-8)"
```

**铁律**: step-done 最后一步必须包含 merge commit hash + worktree 来源(`wt1` / `wt2` / `wt3`),issue 文件里也要写,方便日后 grep 知道代码来自哪个 worktree。

**应用到 skill 的位置**(兄弟拍范围后由本伞形引用,不需要每个 skill 复制全文):
- `gts-dev-fix` M-0 后加 `### Worktree Cleanup(merge 后必走)`
- `gts-dev-feat` Phase B 末尾加 `### Worktree Cleanup(merge 后必走)`
- `gts-dev-refactor` Phase M 加 `### Worktree Cleanup(merge 后必走)`
- `gts-auto` Phase S 加 worktree cleanup 硬约束(全自动模式也要走)

**自查清单**(汇报"已 merge"给兄弟前):
- [ ] `git log --oneline -3 dev` 能看到 merge commit
- [ ] `git worktree list` 没有任何 wt* 残留
- [ ] issue 文件有 merge commit hash 字段
- [ ] `git status` 干净
- 缺任何一项 = 汇报前补完再说

## 纪律 11:commit 前必 `git diff --staged --stat` 核对完整清单(2026-08-20 实锤违规)

**违反症状**: `git add memories/ skills/` 之后没看 staging 区就直接 commit → 把 curator 自动 patch 的 `hermes-home-state-management` skill 一起 commit 进了"压缩记忆"的 commit 里。内容本身合理(8-20 兄弟拍板的纪律落地),但违反了"提交文件 = 本次任务该带"的纪律,而且 commit message 没体现这部分改动,日后查 git log 找不回来龙去脉。

**正确**(任何 commit 前必走 3 步):

1. **`git add <我改的路径>` 之后立刻 `git diff --staged --stat`** —— 不要假设只有"我的"在 staging
2. **每个文件确认是不是本次任务该带的** —— 意外文件(其他 session / curator / patch tool 副作用 / IDE 自动 stage / HERMES_HOME 跨仓 patch)→ `git restore --staged <file>` 取消暂存(**不删内容**)
3. **commit message 写完整** —— 如果 staging 区有合理但不属于本次主任务的改动(比如 curator 自动 patch),要么拆成单独 commit,要么 commit message 里**显式提到**(如 "memory compress + 顺手 patch curator 自动改的 skill")

**为什么容易踩**:
- `git add <具体路径>` 看似精确,但**没法阻止其他东西已在 staging**(8-20 实锤)
- HERMES_HOME 这种多 session 共享仓,curator / 其他 session / patch tool 都可能改 staging
- patch tool 有 known lie bug(8-18 实锤:报 success 但 curator 不承认)

**兄弟 8-18 拍板的 "commit 前必 `git ls-files` 核对"是改 `.gitignore` 时用的**(只读目录护栏);此处是**普适的 staging 核对纪律,任何 commit 之前必走**,跟 8-18 那条不冲突互补。

**适配 skill 位置**(由本伞形引用):
- `gts-submit-save` Step 1 ⑨ 已有的 `git diff --cached --name-only` 校验应**强化为 `git diff --staged --stat`**(看大小 + 文件名),并加"意外文件 restore --staged"步骤
- `gts-save-memory` Step 4b(Hermes Home commit)同步加这条
- `gts-git-commit` 是手写 skill(off-limits),本伞形引用本纪律即可

## 纪律 12:memory 压缩走「方案 C」—— ★ 也按一行结论 + ARCHIVE 指针(2026-08-20 兄弟改拍板)

**违反症状**: 兄弟 8-05 拍板"★ 全保留原文",但 8-19 已经改成"主表只留 ★ + 索引化非 ★";8-20 又进一步:即使 ★ 也按一行结论 + ARCHIVE 指针走(不再保留原文)。我的 MEMORY.md 上一版还残留 ★ 全文(LLM fail 先分类 270 字符等),没跟兄弟最新拍板走,撞 95% 墙才被发现。

**正确**(兄弟 8-20 改拍板):
- **任何规则(包括 ★)一律按一行结论 + ARCHIVE 章节指针写**
- 主表只保留索引 + 锚点词 + 必要警告标记(🔴 标志可放在指针里,不放整段)
- ARCHIVE 容量不限,但要:① 章节标题清晰 ② 每章节末尾「> 检索锚点:...」 ③ 文件级锚点词表
- **写新条目之前必查主表字符数**:> 5600/8000 = 70% → 主动走 `gts-memory-compress`;> 6400/8000 = 80% → 必须压;> 5600 + 新条目 > 6400 → 先压缩再 add
- **80% 红线不依赖兄弟提醒**(2026-08-20 兄弟拍板):兄弟原话「MEMORY怎么又快满了,写memory时没有遵循skill吗?就是说要把MEMORY_ARCHIVE.md用起来啊」

**真 MEMORY 主表**:`memories/MEMORY.md`(带 `.lock` 文件锁,是 Hermes `memory` 工具写入目标),**不是根目录 `MEMORY.md`**(5720 字节是 OpenClaw 迁移残留,纯手工维护)。混淆会读错本子改错文件。

**应用 skill 位置**:
- `gts-memory-compress` Step 1「分类工作协议区条目」改为:**所有条目一律索引化**,不再区分 ★ vs 非 ★(2026-08-20 改)
- `hermes-memory-write-discipline` 原则 2 加 ★ 也按一行结论+ARCHIVE 指针走(已 patch)
- 任何人 / session 写 memory 前必走 `hermes-memory-write-discipline` 触发清单(2026-08-20 已 patch:触发 6 = 主表 > 70% 主动压缩;触发 7 = 新增 > 80% 必配 remove)

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
