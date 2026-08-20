---
name: "gts-rule-landing"
description: "GTS-Play 项目级规则/约束/编码哲学 落地的标准四件套:AGENTS.md + .opencode/skills/ + 笔记/决策记录/ + MEMORY.md 指针。触发:兄弟让我把某段规则/铁律/约定写到项目里('丢进 AGENTS.md' / '加个规则' / '写进项目' / '以后就这么干')。"
status: "active"
trigger: "兄弟说「加个规则」「铁律落地」「丢进 AGENTS.md」「写进项目」「以后就这么干」「约定是...」时触发。任何项目级硬约束的写入都走这一套。"
created: "2026-08-19"
umbrella: false
---

# gts-rule-landing — 项目级规则落地四件套

> 兄弟拍板的规则不是写完一个文件就完事。必须四件套联动,否则下次会话 / 下个 agent 看不到这条规则 = 等于没写。

## 适用场景

- 兄弟引用了一段外部规则(博客/帖子/同事的话)让我"丢进 AGENTS.md"
- 兄弟拍了板一条项目级约定(命名/测试/commit message/编码哲学...)
- 兄弟说"以后就这么干"但没说写哪里

**不适用**: 
- 任务级临时 TODO(走 daily)
- skill 库维护自身的纪律(走 gts-skill-update-discipline)
- 改既有规则(走 patch + 同流程)

## 标准四件套(按顺序)

### 1. AGENTS.md — 权威源(必落)
- 文件: `D:\Github\GTS-Play\AGENTS.md`
- 位置: 找最匹配的现有段尾(如「编码规范」后、「笔记」前)
- 内容: **兄弟原话为主,不加副文本**(2026-08-19 踩坑:我自作主张加了「适用范围」「生产环境警告」两段,兄弟追问"这是什么"+"不需要这个")
- 边界: 兄弟原文里有的警示可以留(如 Ponytail 的 side project 警告),我自己加的"适用范围说明"必须删
- 段头模板:
  ```markdown
  ## <规则名>(最高优先级,违反任何一条都视为错误)
  
  > 必要的边界说明(仅放兄弟明确说的,不放我推测的)
  
  1. ...
  ```

### 2. .opencode/skills/<name>/SKILL.md — OpenCode session 自动加载
- 文件: `D:\Github\GTS-Play\.opencode\skills\<class-name>\SKILL.md`
- 命名: class-level(不是 session 名/规则编号),如 `gts-coding-philosophy` 不是 `gts-8-rules`
- 内容: AGENTS.md 精简副本 + 「动笔前自检清单」+ 「与 brief 的关系」段
- 触发: AGENTS.md 改 .opencode/skills/ 后**必须**提醒兄弟重启 OpenCode(session 才生效)
- frontmatter 必传:
  ```yaml
  ---
  name: <class-level>
  description: <一句话,触发条件,适用>
  ---
  ```

### 3. 笔记/决策记录/<YYYY-MM-DD>-<主题>.md — 决策溯源(必落)
- 文件: `D:\Github\GTS-Play\笔记\决策记录\<日期>-<主题>.md`
- 模板段:
  1. **决策**: 一句话讲落地了什么
  2. **<主题>原文**: 引用完整规则
  3. **来源 / 引用**: 原始出处/兄弟引用来源
  4. **适用范围**: 哪些场景适用、哪些边界要收敛
  5. **配套机制**: dispatch brief 必带什么 / bot 独立验证怎么跑
  6. **落地文件清单**: 表格式
  7. **后续可能动作**: (a)(b)(c) 选项
- 价值: 未来触发了规则冲突,这是溯源依据;兄弟问"为啥要这条"时这是答案

### 4. MEMORY.md — bot 长期指针(必落)
- 文件: `E:\Hermes Agent CN Desktop\data\hermes-home\memories\MEMORY.md`
- 纪律: **一行结论 + 指针**(详细放 daily + skill)
- 必带要素:
  - 规则名字 + 落点文件路径
  - dispatch 时 brief 必带的指令(如"必遵守 AGENTS.md 8 条铁律")
  - side project vs 生产环境的边界(若有)

## 四件套联动示例(2026-08-19 实操)

兄弟发了一段"AI 写代码 8 条铁律"原文让我落,实际产出:

| 件 | 文件 | 字节 | 备注 |
|---|---|---|---|
| AGENTS.md | `D:\Github\GTS-Play\AGENTS.md` | +2484 | 新增「AI 写代码铁律」段,放「编码规范」后 |
| Skill | `.opencode/skills/gts-coding-philosophy/SKILL.md` | 3322 | class-level 名,精简副本 + 自检清单 + brief 关系 |
| 笔记 | `笔记/决策记录/2026-08-19-AI编码8条铁律落地.md` | 3738 | 决策原文 + 来源 + 适用范围 + 后续动作 |
| MEMORY.md | `E:\Hermes Agent CN Desktop\data\hermes-home\memories\MEMORY.md` | +1 行 | 一行结论 + dispatch 必带指令 |

## Pitfalls(本轮踩的)

### ❌ 自作主张加副文本
**症状**: 兄弟说"丢进 AGENTS.md",我加了三段:适用范围 / 生产环境警告 / 少即是多总结
**纠正**: 「适用范围」删了,「生产环境警告」保留(原文就有),「少即是多总结」也删
**教训**: **兄弟原文要啥放啥,我推测的别加**。要加先问,问完再加。

### ❌ 第一轮漏了 skill
**症状**: 兄弟只让我"丢进 AGENTS.md",我就只改了 AGENTS.md + MEMORY.md,没做 skill + 笔记
**纠正**: 兄弟追问"要不要做 (a)(b)"时我才补
**教训**: **四件套是默认动作,不是可选项**。即使兄弟只提了 AGENTS.md,我也应该在汇报里说"按四件套,还需要做 X/Y/Z,要不要做?"

### ❌ 改 .opencode/skills/ 漏掉"提醒重启 OpenCode"
**症状**: 第一次 .opencode/skills/ 改完没提醒(虽然这次第二轮补了)
**AGENTS.md 原文纪律**: "修改 .opencode/skills/ 下的 SKILL.md 后,提醒兄弟重启 OpenCode 使新 skill 生效"
**教训**: 这是项目自带的纪律,改完必带,不是建议。

### ❌ MEMORY.md 塞全文
**症状**: 8 条铁律 280 字,主表 82% 已经快满
**纠正**: 主表只加一行结论+指针(92 字),全文放 skill + 笔记
**教训**: 遵守 `gts-skill-update-discipline` 纪律 1:主表 ≤2 行结论,详细挪 daily/skill

## 与其他 skill 的关系

- **`gts-skill-update-discipline`** — 写 skill 时的操作纪律(本 skill 是它纪律 5「找伞形不打散」的应用案例)
- **`gts-dev-feat` / `gts-dev-fix`** — dispatch brief 时引用本 skill 落地的项目级规则
- **`hermes-agent-skill-authoring`** — SKILL.md frontmatter 格式基线

## 触发清单(看到这些就触发本 skill)

- "把这 8 条加进 AGENTS.md"
- "这条以后就这么干"
- "写进项目里"
- "加个规则"
- "约定是..."
- "拍板:..."

→ 默认走四件套,不要只改一个文件。