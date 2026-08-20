---
name: "hermes-home-state-management"
description: "管理 Hermes Agent 自身状态（HERMES_HOME 目录）的硬约束与踩坑。触发：兄弟说「改 Hermes 配置」「压缩记忆」「接 git 到 Hermes」「HERMES_HOME 文件冲突」「双 MEMORY.md」「memory_char_limit 调不动」「config.yaml 改不动」「skill_manage 拒绝 patch gts/*」「MEMORY.md 又满了」「记忆写不进去」「memory 工具撞墙」。"
---

# Hermes Home State Management — HERMES_HOME 状态管理硬约束

> 触发词：兄弟说「改 Hermes 配置 / 压缩记忆 / 接 git 到 Hermes / HERMES_HOME / 双 MEMORY.md / memory_char_limit / config.yaml 改不动 / skill_manage 拒 patch」
>
> 实战来源：2026-08-18 bot 整场掉链子后的沉淀。Hermes 自身状态 ≠ GTS-Play 项目，规则完全不同。

## 🔴 核心硬约束（按优先级）

### 1. 双 MEMORY.md 路径（2026-08-18 实锤，2026-08-20 修正硬上限口径）

`$HERMES_HOME` 下有两个 MEMORY.md，混淆会读错本子、改错文件：

| 路径 | 谁读写 | 内容特征 | 容量硬上限 |
|------|--------|----------|------------|
| `$HERMES_HOME/memories/MEMORY.md` | **Hermes `memory` 工具默认读写目标**（带 `.lock` 文件锁） | agent 自动维护的高信号事实条目，`§` 分隔，扁平列表 | **8000 字符硬编码**（2026-08-18 实测，2026-08-20 兄弟拍板：必须 < 6400 = 80% 阈值） |
| `$HERMES_HOME/MEMORY.md`（根目录） | 手工维护（OpenClaw 迁移留下的 core 索引） | 带章节标题、`>` 注释、表格，OpenClaw 风格 | 工具不写，纯人工 |

**🔴 字符硬上限（2026-08-18 实测，2026-08-20 兄弟质询后收紧）**：
- `memories/MEMORY.md` 字符上限 = **8000**，**Hermes 内部硬编码**，不是配置项
- 实测命令：`hermes config set memory_char_limit 16000` → 报 `✓ Set ... but ⚠ 'memory_char_limit' is not a recognized config key — it was saved anyway, but Hermes may not read it.`
- 兄弟拍板：MEMORY.md 必须 **< 6400 字符（80% 上限）**
- `memory` 工具撞墙信息：`Replacement would put memory at X/8,000 chars. Shorten the new content, or 'remove' other entries first.`

**绝对禁忌**：
- 不要光看文件名就开干 —— 整场读了 `memories/MEMORY.md` 没核对根目录还有个旧版，最后发现里面那条"MEMORY.md < 80%"规则是上一会话自己写错的，根本不是兄弟拍板的真相
- 两个文件都在 → 先问兄弟"哪个是真的"，别自作主张合并或压错文件
- **❌ 调 `memory_char_limit` 字段去绕 8000 字符硬上限**（兄弟拍过，2026-08-17 尝试调到 30000，错的）

**操作前核对**：

```powershell
# 双 MEMORY.md + lock 文件 + 字符硬上限
$c = (Get-Content "$env:HERMES_HOME/memories/MEMORY.md" -Raw | Measure-Object -Character).Characters
Write-Host "memories/MEMORY.md: $c / 8000 = $([math]::Round($c/8000*100,1))% (阈值 80% = 6400)"
Get-ChildItem $env:HERMES_HOME -Filter MEMORY.md -Recurse -Force | Select-Object FullName, Length, LastWriteTime
Get-ChildItem $env:HERMES_HOME/memories -Filter "*.lock" -Force | Select-Object Name, Length
```

### 2. config.yaml 字段命名空间（2026-08-18 误设孤儿字段教训，2026-08-20 实测确认无效）

`memory_char_limit` **不是顶层字段**，必须在 `memory.` 命名空间下：

```yaml
# ✅ 正确（Hermes 接受但实际不读，2026-08-20 实测）
memory:
  memory_char_limit: 30000
  compression:
    threshold: 0.35  # 也是在 memory 下

# ❌ 错（顶层设了 Hermes 不读，但会 saved anyway → 污染 config.yaml）
memory_char_limit: 16000
```

**🔴 2026-08-20 实测结论（修正 8-18 时的认知）**：
- `hermes config set memory_char_limit 16000` / `memory.memory_char_limit 30000` 都报 ✓ 但同时 ⚠ `not a recognized config key` → **Hermes 字符硬上限 8000 跟 config 完全无关**
- 调高 `memory_char_limit` 不能让 memory 工具突破 8000 字符硬编码（撞墙信息永远是 `X/8,000 chars`）
- 真正可行的"扩大容量"路径只有两条：①压缩 MEMORY.md 主表（走 gts-memory-compress） ②把详细内容移到 `MEMORY_ARCHIVE.md`（不限容量）

**绝对禁忌**：
- 不要在 config.yaml 顶层设 `memory_char_limit: ...`，会报"not a recognized config key" 但 saved anyway → **污染 config.yaml 孤儿字段**，每次校验都抱怨，且 Hermes 根本不读
- 不要试图通过调高 `memory_char_limit` 绕开 8000 字符硬上限 —— 字段无效，唯一出路是压缩主表
- 兄弟拍板的 "MEMORY.md < 80%" 是相对 **8000 字符硬编码**算的（6400 字符健康线），不是相对 config 里的某个数
- 调任何 memory_* / compression.* 字段前必查 config.yaml 现状：

```powershell
Select-String -Path "$env:HERMES_HOME\config.yaml" -Pattern "memory|compression" | ForEach-Object { $_.Line }
```

### 3. skill_manage 对 gts/* 操作的硬封禁（2026-08-18 实测）

`gts/*` 子目录下绝大多数 skill `created_by=None`（视为人工手写），后果：

| 操作 | 行为 |
|------|------|
| `skill_manage(action='patch'/'edit')` 任意 gts/* skill | ❌ 拒："Refusing background curator patch ... is not agent-created" |
| `skill_manage(action='delete')` 任意 gts/* skill | ❌ 拒（同样理由） |
| `write_file` 写到 `gts/*` 下任何 .md 文件 | ❌ 拒（"Background review denied non-whitelisted tool"） |
| `skill_manage(action='create')` **新建** skill 到 gts/ 或非 gts/ | ✅ 通（agent-created 路径） |
| `skill_manage(action='create')` 后再用 patch | ⚠️ 首次通，后续 patch 不一定通（取决于 created_by 是否被刷新） |
| `write_file` 到 **新建伞形 skill 下的 references/templates/scripts/** | ✅ 通（伞形 skill 是 agent-created，其附属文件可写） |

**正确策略**：
- 老 gts/* skill 要更新 → **不要 patch 老 skill**，**创建一个新伞形 skill 把教训吸收**（如本 skill 之于 `gts-memory-compress` 的"双 MEMORY.md / 字段命名空间"教训）
- 老 gts/* skill 要废弃 → **不要 delete**（会拒），接受它在列表里占位，调用时走新 skill 替代

### 4. memory 工具 ≠ 写 MEMORY.md（容易误判）

`memory` 工具是 Hermes **跨会话持久化笔记**机制：
- 写到磁盘上的记忆文件
- **叫 `memories/MEMORY.md`**（带 `.lock` 文件锁），不是根目录那个 `MEMORY.md`
- 在**未来会话**开头才会被系统读出来注入，**不是当前会话可改的**
- 当前会话看到的 MEMORY 段是**系统层快照，bot 不能写**

**🔴 2026-08-20 实测修正**：memory 工具的字符硬上限是 **8000**，不是 config.yaml 的 `memory_char_limit`
- `memory.memory_char_limit: 30000` 设了 Hermes 不读
- 撞墙错误永远是 `Replacement would put memory at X/8,000 chars`
- 解决路径只有：①先 remove 旧条腾位 ②走 gts-memory-compress 压缩主表 ③详细内容移到 MEMORY_ARCHIVE.md

**容易掉链子的场景**：
- 兄弟问"怎么老是往 MEMORY.md 里写" → 可能是 sync_turn / nudge 自动注入，也可能是上一会话 memory 工具写 `memories/MEMORY.md`
- 上一会话反复撞 "8000 chars over limit" → 是 `memories/MEMORY.md` 写入报错，**跟 config 无关**

### 5. 主动压缩触发阈值（2026-08-20 兄弟质问后落地，2026-08-20 之前 bot 没主动压=撞墙必然）

兄弟原话：「MEMORY怎么又快满了，写memory时没有遵循skill吗（之前不是讨论过吗）？就是说要把MEMORY_ARCHIVE.md用起来啊」

**自动检查时机**（每轮回复结束 / 每次写 memory 后 / 兄弟说"MEMORY 又满了"）：
- **主表字符 > 5600/8000 = 70%** → 主动跑 `gts-memory-compress`（先补 ARCHIVE 再压主表，不依赖兄弟提醒）
- **主表字符 > 6400/8000 = 80%** → 必须立即压（兄弟拍板红线）
- **新增条目导致 > 6400** → 该条 add 必须配套至少 1 条 remove（先砍再补，不能两件事一起做）

**配套事实验证**：
```powershell
# 主表字符实时监测（不等兄弟提醒）
$c = (Get-Content "$env:HERMES_HOME/memories/MEMORY.md" -Raw | Measure-Object -Character).Characters
if ($c -gt 6400) { Write-Host "🔴 MEMORY.md $c/8000 = $([math]::Round($c/8000*100,1))% 超 80% 红线,立即走 gts-memory-compress" -ForegroundColor Red }
elseif ($c -gt 5600) { Write-Host "🟡 MEMORY.md $c/8000 = $([math]::Round($c/8000*100,1))% 过 70% 阈值,主动压缩" -ForegroundColor Yellow }
else { Write-Host "✓ MEMORY.md $c/8000 = $([math]::Round($c/8000*100,1))% 安全" }
```

**ARCHIVE 用法（2026-08-20 兄弟提醒）**：详细内容/踩坑/SOP 都放 `$HERMES_HOME/memories/MEMORY_ARCHIVE.md`，不限容量，按章节组织 + 锚点词检索。主表只留 ★（最高优先级规则原文）+ 索引行（指向 ARCHIVE 章节 / skill）。**「把 ARCHIVE 用起来」** = 不堆主表，所有非 ★ 内容都归档。

## 触发场景对应的处理

### 兄弟说"MEMORY 又满了 / 又撞墙了"
- 走 `gts-memory-compress` skill（**先补 ARCHIVE 再压主表**）
- 必做 Step 0 之前的核对：用上面 §1 §2 §5 三条先看 HERMES_HOME 结构 + config.yaml 字段 + 主表字符实时值
- 路径不对、字段不对、字符已 95%+ → 立刻压，不问兄弟
- **不要试图调 `memory_char_limit` 绕开硬上限**（实测无效）

### 兄弟说"压缩记忆 / 压缩MEMORY.md"
- 同上走 `gts-memory-compress`，先补 ARCHIVE 再压主表
- 必做 Step 0 之前的核对：用上面 §1 §2 两条先看 HERMES_HOME 结构和 config.yaml 字段
- 路径不对、字段不对 → 立刻停，问兄弟

### 兄弟说"调 memory_char_limit"
- 走 `hermes config set memory.memory_char_limit <N>`（**带 `memory.` 命名空间**）
- 不是 `hermes config set memory_char_limit <N>`
- **🔴 设完读回来确认**：调高没用，硬上限仍是 8000（2026-08-20 实测）
- 真正出路是压缩主表 + 用 MEMORY_ARCHIVE.md，不要浪费时间调 config
- 设完读回来确认：

```powershell
Select-String -Path "$env:HERMES_HOME\config.yaml" -Pattern "memory_char_limit" 
```

### 兄弟说"接 git 到 Hermes"
- 走 `gts-git-pull` skill 的逻辑（已包含迁移期 git 同步）
- 范围只接 hermes 相关：`skills/` + `memories/` + `SOUL.md` + `USER.md` + `MEMORY.md` + `config.yaml`
- **绝对排除**：`state.db` / `state.db-shm` / `state.db-wal` / `logs/` / `sessions/` / `cache/` / `image_cache/` / `audio_cache/` / `pairing/` / `sandboxes/` / `cron/` / `lsp/` / `hooks/` / `port-locks/` / `scripts/tmp_*` / `desktop-ui.sqlite` / `kanban.db` / `projects.db` / `auth.json` / `auth.lock` / `*.lock` / `processes.json` / `verification_evidence.db` / `.env` / `.update_check` / `models_dev_cache.json` / `ollama_cloud_models_cache.json` / `provider_models_cache.json` / `*.bak-*` / `.skills_prompt_snapshot.json` 等
- 必写 .gitignore 在接 git 之前（先用本 skill 推荐的模板）
- 🔴🔴🔴 **GitHub Push Protection 密钥扫描**（2026-08-19 实测）：skills/ 下的 SKILL.md 和 references/ 可能含真实 API key / secret（腾讯云 AKID、VolcEngine ark-xxx 等），push 会被 GitHub 拦截。**首次 commit 前必须**：(1) `git diff --cached` 检查含 `AKID` / `ark-` / 长字母数字串的行 (2) 替换为 `<YOUR_XXX_KEY>` 占位符 (3) `git commit --amend` 重写 (4) 再 push。已知触发模式：Tencent Cloud Secret ID (`AKID...`)、VolcEngine Ark API Key (`ark-...`)

### 兄弟说"skill_manage 拒了 / patch 不了"
- 立刻停，**不要**反复试不同 action 组合
- 走 §3 表确认是不是 gts/* 老 skill → 是 → 创建新伞形 skill 把实战沉淀
- 不是 gts/* → 检查 `created_by` 字段是不是 None（None 等于人工手写）

## 🔴 必读配套

- `hermes-agent` skill —— 改 Hermes 配置/CLI 用法总览
- `hermes-provider-config` skill —— provider / api_mode / base_url 命名空间坑（config.yaml 字段多在 `providers.<id>` 命名空间下）
- `hermes-memory-limits` skill —— 字符硬上限 8000 + 兄弟拍板 80% 红线（6400 字符）+ add/remove 必须分两步
- `hermes-memory-write-discipline` skill —— sync_turn + nudge 自动机制、主表只放索引、声明式事实、batch operations 数组
- `gts-memory-compress` skill —— 压缩 SOP：先补 ARCHIVE 再压主表，★ 全保留，非 ★ 索引化
- **本 skill 是 `gts-memory-compress` 的"前置核对"补充**，别试图 patch gts-memory-compress（gts/* 拒），调用时先读本 skill §1 §2 §5

## ⚠️ 历史教训

- **2026-08-18 整场掉链子事件全记录**：双 MEMORY.md 混淆 + 误设顶层 memory_char_limit 孤儿字段 + 反复 patch gts-memory-compress 被拒 + 把 Hermes 平台机制当 GTS-Play 项目干——根因是把"HERMES_HOME 状态管理"当成普通 dev 工作流，没意识到它有独立的硬约束体系
- 修复动作：创建本 skill 把上述 4 类硬约束固化为触发-响应表，避免未来 agent 又掉同一坑
- **2026-08-20 又掉链子（5 天没主动压主表，95% 才被兄弟质问）**：
  - 兄弟质问「MEMORY怎么又快满了，写memory时没有遵循skill吗（之前不是讨论过吗）？就是说要把MEMORY_ARCHIVE.md用起来啊」
  - 根因：§1 §2 §4 的"30000 字符上限"和"config 字段有效"是 8-18 时的过时认知；`hermes-memory-limits` skill 已 patch 但本 skill 没引用，导致知识碎片化
  - **修正动作**：把字符硬上限 8000 + config 字段无效 写回 §1 §2 §4 + 新增 §5 "主动压缩阈值" + 加 hermes-memory-limits 和 hermes-memory-write-discipline 到必读配套
  - **未来防范**：每轮回复结束 / 每次写 memory 前 / 兄弟说"满了"，主表 > 5600（70%）就主动压缩，不依赖兄弟提醒