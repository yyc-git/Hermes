---
name: gts-memory-write-discipline
description: Hermes 记忆写入纪律(伞形 skill,2026-08-18 兄弟多次纠正后落地)。触发:任何"我该不该写 memory / 写哪里 / 写多长 / 用工具还是用机制"的判断。覆盖:MEMORY.md 主表 vs daily log 分类;sync_turn/nudge 用机制不主动调工具;主表一行式结论 + 出处指针;token 预检;memory 工具 batch 纪律;兄弟明确指令才主动调工具。
---

# gts-memory-write-discipline — 记忆写入纪律(伞形)

> 2026-08-18 兄弟**三次纠正**后落地的伞形 skill,把"记什么/记哪里/怎么记"全部收口。
> 适用:任何与 Hermes 记忆持久化相关的决策。
> 不适用:不需要落盘的事实(只在当轮回复里出现即可)。

---

## 核心原则(三句)

1. **MEMORY.md 主表只记事实/偏好/约束**(一行式结论 + 出处指针)
2. **用机制不用工具**——信任 `sync_turn`(每轮后自动同步)+ `nudge`(每轮后主动提示提炼 skill),**不再主动调 `memory` 工具写、不主动 `skill_manage create`**
3. **要写就 batch**——单次 `memory` 调用 + `operations` 数组,禁止拆多次 add/replace/remove 单调用

---

## 一、MEMORY.md 主表 vs daily log 分类(2026-08-18 兄弟拍板)

| 维度 | 主表 ✅ | daily log / 笔记 ❌ |
|---|---|---|
| 内容类型 | **约束结论** | 操作手册 / SOP / 踩坑经过 |
| 行数 | 1-2 行 | > 3 行 |
| 字符 | < 200 | > 200 |
| 持久期 | 跨会话稳定 | 当日/项目期 |
| 半年后回看 | 凭一行能想起去哪查 | 需要全文复现 |

**判定流程**:
1. 这是**结论**还是**手册**?结论→主表;手册→daily
2. 删掉细节后**半年后能否凭一行字知道查哪里**?能→主表;不能→daily
3. 是否有"为什么/怎么操作/踩了什么坑/具体命令"?无→主表;有→daily

**实战反例**(2026-08-18 doc 保护条目):
- ❌ 错写:4 行展开"doc/ 兄弟维护,禁 checkout/restore/reset/--hard,适用 .org/.md/.txt/.rst" → **这是手册,塞主表违反分类**
- ✅ 改后:`🔴 doc/ 下 .org/.md 兄弟亲手维护(2026-08-18 拍板),细节 daily/2026-08-18 §doc-文件保护` → **主表一行 + 指针 daily**

**违规修正动作**(兄弟提醒后):
- 把详细 SOP 移到对应 daily 段
- 主表条目改成"一行结论 + 指针到 daily § 关键词"
- **必须先 simplify 主表,再写新 daily,不能反向操作**

---

## 二、用机制不用工具(2026-08-18 兄弟拍板)

**Hermes 记忆机制已有 4 个自动钩子**(参考 `搁浅的鸽子` 文章):
- `sync_turn` 每轮后同步对话
- `nudge` 每轮后主动提示提炼 skill
- `prefetch(query)` 每轮前自动召回相关记忆
- `on_pre_compress` 上下文压缩前提取要点

**正确做法**:
| 场景 | 之前(❌ 主动调工具) | 之后(✅ 用机制) |
|---|---|---|
| 想记一件事 | `memory(action=add, ...)` | chat 里写一句事实,sync_turn 抓 |
| 想固化经验 | `skill_manage(action=create, ...)` | chat 末尾写一行成果,nudge 决定 |
| 复杂操作 | 手动总结 + 落盘 | dispatch OpenCode,agent 输出即总结 |
| 查历史 | grep MEMORY.md | state.db FTS5 + session_search |

**例外**(此时才主动调工具):
- 兄弟明确说"记 memory" / "封成 skill" / "保存笔记"
- 阻塞场景需立即落盘(等不及 sync_turn 异步)

**自检**(`memory` 工具调用前必答 3 问):
1. **兄弟明确说要存吗?** 没要 → 用机制,别调工具
2. **能用 sync_turn 抓吗?** 能 → 写好一句话,别调工具
3. **这是结论还是手册?** 手册 → 写 daily,别调 memory 工具

**反模式**(今天犯过):
- ❌ "落 memory 前自检 3 问/token 预检/回复模板必含自检一句话" → 这些是**人肉补丁**,**违反"声明事实非指令"原则** → **沉 skill 也别沉这种指令性内容**
- ❌ "我先调 memory 工具,再看看是否需要" → 信任系统,别预判

---

## 三、token 预检(实操兜底)

| 字符数 | 处理 |
|---|---|
| 1 行 (< 80) | 主表 ✅ |
| 2-3 行 (80-200) | 99% 挪 daily,主表只留指针 |
| > 3 行 | **绝对挪 daily** |

**当条 > 200 字符时默认挪 daily**,主表只留"一行结论 + `→ daily/YYYY-MM-DD.md § 关键词`"。

---

## 四、memory 工具 batch 纪律(本日踩坑)

- 🔴 **单次 `memory` 调用 + `operations` 数组 batch**
- ❌ **禁止拆多次** add/replace/remove 单调用(2026-08-18 犯 4 次循环才腾位,浪费 token + 触发 loop 警告)
- ❌ **禁止"先 add → 超了 → remove 老的 → 再 add"**,**一开始就 batch 计算好**
- 超 8000 字符 = 用 replace 把多条压缩成一条,**不要 add 新条**

### 4.1 `patch` / `memory` 工具静默 fail 模式(2026-08-18 实踩)

- 🔴 **`patch` tool 缺 `path`/`mode`/`old_string`/`new_string` 任一字段时只报 `path required` 或 `* required`**,**不告诉你哪个字段空**——和直觉相反,所有这些字段都是必填非空
- 🔴 **`patch` tool 多次重复同样错误调用会触发 `repeated_exact_failure_warning` 限频**——5 次后系统直接锁,不要再用同样参数重试
- 🔴 **走错路径的模式**:当 `skill_manage(patch)` 后续报 "Refusing background curator patch, not agent-created" 时——说明走的不是会话内 patch 路径,而是 curator 路径,**必须换 `mode='patch'` (V4A) 或 `mode='replace'` 显式重调**
- **修正动作**:每次 `patch` / `memory` 调用前**显式对齐 schema 字段名**:
  - `patch` mode=replace: `mode` + `path` + `old_string` + `new_string` 四必填
  - `patch` mode=patch (V4A): `mode` + `patch`(V4A 字符串),**patch body 必须含 `-`/`+` 行,不能全 context line**
  - `memory` replace: `action` + `target` + `old_text` + `content` 四必填
- **根因**:这俩工具的 `old_*` 字段是**必填非空**(就算想用空字符串替换也要传 `""` 而不是不传)——和直觉相反
- 单次 `memory` 单 op 调用 OK,单次 `memory` batch operations 数组里**任意一条字段缺失 = 整个 batch 失败**(all-or-nothing)——所以**补字段后再 batch,不要先 batch 失败 4 次再单条绕过**

### 4.2 兄弟专属只读目录护栏(2026-08-18 二次确认)

> ⚠️ **第一版理解错**为"三个目录全禁碰(禁 add 也禁 checkout)"——**兄弟纠正**:可 `git add <path>` 提交兄弟自己改的内容,**只禁改/还原/删除内容**

**最终规则**(落 `gts-git-commit` skill § 2 + § 4 + § 6 + 纪律 6 + 纪律 8):
- ✅ 允许:`git add <path>` 提交兄弟自己在 doc/ docs/ 语雀知识库/ 改的内容
- 🔴 禁:`git checkout -- <path>` / `git restore <path>` / `git reset --hard` / `git clean -fd <path>` / `git stash pop` 涉及这三个目录
- 🔴 禁:`write_file` / `patch` / `sed` / `rm` / `mv` / `cp` / `Add-Content` 任何 bot 触发的写
- 🔴 禁:dispatch OpenCode 让 agent 改这三个目录任意文件 → brief 必带"禁止触碰 doc/ docs/ 语雀知识库 内容"
- 校验:`git diff --cached --name-only` 出现这三个目录 → 视为兄弟改动,正常 commit;若不在兄弟已知改动清单 → 视为 bot 误写,`git restore --staged <path>` 取消暂存 + notify 兄弟
- 改/删/还原内容前 → **先列清单 + 桌面通知 + msg 通知 + 等兄弟明确确认**

#### 一句口诀(兄弟原话)

> 「doc/ docs/ 语雀知识库/ — bot 只读不写,**git add 可以(提交兄弟改的),git checkout/restore/reset --hard/clean -fd/ 禁止(改/还原内容)**」

---

## 五、state.db 全文检索(2026-08-18 兄弟问"为什么不 grep 会话记忆.db")

**state.db 是 Hermes 内置"会话记忆"机制**,比 MEMORY.md 高密度:

| 源 | 价值 | 密度 | 读权限 | 写权限 |
|---|---|---|---|---|
| MEMORY.md | 8-25 条结论 | 低(抽象、提炼过) | (已注入 prompt) | bot 调 memory 工具 |
| USER.md | 5-10 条偏好 | 低(稳定) | (已注入 prompt) | 系统自动 |
| skills/ | 程序性知识 | 中(按需) | ✅ grep OK | 🔴 curator 锁 |
| **state.db** | **所有历史对话 + tool calls + 思考** | **🔴 极高**(原始事实、决策、错误) | ✅ FTS5 OK | 🔴 只读(归档用 UPDATE 不用 DELETE) |
| 笔记/daily/ | 兄弟亲手写 | 中 | ✅ grep OK(2026-08-18 兄弟明确"可以查到资料") | 🔴 兄弟维护,bot 不写 |

**易错点**(2026-08-18 踩过):把笔记/ 当成"读也禁"的来源——**错了**。兄弟原话:"笔记/你可以 grep,因为可以查到资料"。

**读 vs 写红线**:
- 读 grep / FTS5 / 检索 = ✅ 允许(任何源)
- 写 patch / write_file / skill_manage 修改 = 🔴 禁(兄弟维护:doc/、笔记/、skills/ 都有写红线)
- git checkout / restore / reset / --hard / clean 涉及 doc/ = 🔴 禁(详见 `gts-submit-save` ② ⑤)

**实操**:
- 现成脚本:`node <hermes-session-forensics skill>/scripts/session-activity.cjs "<state.db>" <sessionId>`(自动剥 workspace 前缀、按时序输出 user timeline,`--tools` 附加 tool 调用)
- 兄弟提的"为什么 grep state.db"就是 Holographic 全文搜的桌面版等价物
- 详细 schema + 归档 + token 审计:`hermes-session-forensics/references/state-db-schema-and-archive.md`
- 轻量 3 源召回(本会话 2026-08-18 落地):`gts-memory-search/SKILL.md` + `scripts/memory-search.mjs`

---

## 六、Holographic / 外部 provider(2026-08-18 实测 desktop 不可用)

兄弟拍板**先上 Holographic**(简单+本地 SQLite FTS5+零依赖),但实测:
- Hermes **Desktop 形态**:`config.yaml` 无 provider 字段,无 `hermes memory setup` CLI,**外部 provider 切换入口缺失**
- 唯一可调:`memory_char_limit`(已 30000,够用)
- 替代方案:**用 state.db FTS5 + 写轻量 gts-memory-search skill** 模拟 Holographic 召回
- 真正方案:**装 Hermes CLI**(`pip install hermes-agent` / `npm i -g`),CLI 版有 `hermes memory setup` 切换 Holographic/Hindsight——但**装 CLI 会和 desktop 并存,不替代**;兄弟拍板

---

## 七、关联

- `gts-save-memory`(人工创建,只读):Step 4 git commit + Step 5 notify
- `hermes-session-forensics`:state.db 检索 / token 审计 / 归档 schema
- `desktop-notify-protocol`:任何"需兄弟拍板"必先 notify.ps1 双通道
- `gts-submit-save` / `gts-git-commit`:doc/ 保护红线同步(2026-08-18 改)
- `gts-memory-search`:3 源(state.db FTS5 + skills/ ripgrep + 笔记/ ripgrep)轻量召回,每轮回复前模拟 Holographic prefetch
- 详细 state.db schema / 3 源架构 / ad-hoc 验证脚本 / 边界 case:`references/state-db-3-source-recall.md`

## 八、🔴 需兄弟拍板 = 必发 notify 通知(2026-08-18 拍板,最高优先级)

**触发场景**:阻塞 / 资源申请 / 不可逆操作 / 方案选 A B C / 改 config / 删文件 / restart server / dispatch 跨模型 / 装新依赖 / 改 Hermes 自身状态。

**反模式**(本会话犯过):列 3 选 1 Holographic 升级方案 → **只在 chat 列选项,没发通知** → 兄弟质问"你怎么不通知我"。

**正确姿势**(口诀:**要拍板 = 先通知 = 最高优先级**):
1. 列方案 + 选项 → **同条消息同步** `notify.ps1 -Title "🔴 等你拍" -Message "..."`(双通道:桌面 + msg)
2. 等兄弟回复 → 收到明确确认才执行
3. 通知失败 / 静默发不出 → fallback:重发一次 + 在 chat 顶部标"⚠️ 通知可能未送达,请确认"

**纪律升级**(本会话确立):chat 里列方案 **≠** 已通知;chat 是被动通道,notify.ps1 是主动通道。兄弟可能没盯 chat,通知是唯一知道"有事等他"的方式。

**判断标准**:`getSomethingThatNeedsApproval` → `notify.ps1` → `wait` → `act`。**没这一步,任何方案都不该动手**。

## 九、ad-hoc 验证脚本模式(2026-08-18 落地)

启用任何新本地脚本(无测试套件),**不要等兄弟催**——主动写 `C:\Users\Administrator\AppData\Local\Temp\hermes-verify-<name>.mjs` 跑端到端验证:

- **位置**:`%TEMP%\hermes-verify-<name>.mjs`(hermes-verify- 前缀方便 grep,跑完删)
- **规模**:5-10 个 query × 6-8 项断言(exit 0 / stdout 非空 / JSON 解析 / 关键字段 / 边界 case / 耗时上限)
- **范围**:ad-hoc 端到端,不是测试套件,不是 linter
- **跑完删**:避免污染 `%TEMP%`;**不留 .git 仓库里**——它是一次性验证,不是测试

**理由**(本会话确立):兄弟要求"实际落盘 skill/memory,不能停在嘴上",**脚本也同理**——落盘 + 跑通 = 验完;光写不跑 = 拍脑袋承诺。**任何启用脚本前先跑 verify**。

**反例**:本会话写完 `memory-search.mjs` 第一版没测就 commit → PowerShell 引号转义 bug → 重写 → 再 verify 5/5 过。

## 来源

- `D:\Github\GTS-Play\笔记\daily\2026-08-18.md § doc 文件保护 / § memory 分类原则`
- 兄弟原话:「doc/ 和 .org、.md 这些文件,可能是我在维护,你提交 git 时直接提交它们啊,不准 checkout 或者还原它们!如果你要还原某个文件,必须要我确认!记住啊」
- 兄弟原话:「你不是有记忆机制吗?」——指向 sync_turn / nudge / prefetch 自动机制
- 兄弟原话:「如何让你用你的记忆机制而不是用 memory 工具写记忆啊?」——本 skill 存在原因
- 兄弟原话:「需要我确认的时候要发 msg 通知啊,记住啊:最高优先级」——桌面通知纪律(本 skill 决策类操作必触发 notify)

---

## 🟡 待办(2026-08-18 兄弟拍板但老 skill curator 锁住无法 patch)

| 老 skill | 状态 | 待扩内容 | 建议 |
|---|---|---|---|
| `gts/gts-memory-search` | 人工创建,curator 不能 patch | 加 state.db 全文检索段(本 skill § 五) | 兄弟人工补段;或创建新伞形 `gts-memory-search-live` 专管 state.db |
| `gts/gts-save-memory` | 人工创建,curator 不能 patch | 加"用机制不用工具"纪律(本 skill § 二) | 兄弟人工补段;或弃用 gts-save-memory,新建伞形 |
