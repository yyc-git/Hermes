# 双 MEMORY.md 翻车事故档案（2026-08-18 + 2026-08-20 二度翻车）

> 本文件是 `hermes-home-state-management` skill 的参考材料。**只读**，不写。

## 事故摘要

### 2026-08-18 第一次翻车（bot 整场掉链子）

bot 整场会话（2026-08-18 下午）以为只有一个 MEMORY.md，反复读写 `memories/MEMORY.md`，最终把对话搞成"压在错的本子上讨论压缩规则"——根因是不知道根目录还有个 OpenClaw 迁移留下的旧 `MEMORY.md`。

### 2026-08-20 第二次翻车（5 天没主动压主表）

兄弟质问：「MEMORY怎么又快满了，写memory时没有遵循skill吗（之前不是讨论过吗）？就是说要把MEMORY_ARCHIVE.md用起来啊」

bot 反思错的三处：
1. **找错文件**：又去读根目录 `MEMORY.md`（5720 字节，OpenClaw 旧版），没意识到 Hermes 注入的 MEMORY 段（7669 字符）实际来自 `memories/MEMORY.md`（11441 字节）
2. **错信过时信息**：以为 `memory_char_limit` 是配置项可调到 30000，实际 8000 是硬编码，config 设了 Hermes 不读
3. **违反自己写的纪律**：8-19 拍板"主表只留 ★ + 索引化"，但一周内塞了 8 条长文（MODAL 修复细节、worktree 路径、demo 歧义等），正文该在 ARCHIVE 却堆主表

## 现场取证（已 grep 验证）

`$HERMES_HOME = E:\Hermes Agent CN Desktop\data\hermes-home`

```
FullName                                                              Length  LastWriteTime
--------                                                              ------  ------------
E:\Hermes Agent CN Desktop\data\hermes-home\MEMORY.md                 5720    2026-08-17（迁移期）
E:\Hermes Agent CN Desktop\data\hermes-home\memories\MEMORY.md        11441   2026-08-20（本会话产物）
E:\Hermes Agent CN Desktop\data\hermes-home\memories\USER.md          2112
E:\Hermes Agent CN Desktop\data\hermes-home\memories\MEMORY.md.lock   0       （memory 工具写入锁）
E:\Hermes Agent CN Desktop\data\hermes-home\memories\USER.md.lock     0
```

`.lock` 文件存在 = `memories/MEMORY.md` 是 memory 工具的写入目标；**根目录的 MEMORY.md 不带 lock，是手工维护**。

## 内容对比（避免下次再混淆）

| 文件 | 第一行 | 风格 | 谁写 |
|------|--------|------|------|
| 根目录 `MEMORY.md` | `# MEMORY.md — 核心记忆` | 章节标题 + 表格 + `>` 注释，OpenClaw 风格 | 手工（迁移时一次性写入） |
| `memories/MEMORY.md` | `用户环境:Hermes CN Desktop (0.19.0-cn.7)...` | 扁平 `§` 分隔的高信号事实条目 | memory 工具（每次会话都可能写） |

## 字符硬上限实测（2026-08-20 实锤）

```powershell
$c = (Get-Content "$env:HERMES_HOME/memories/MEMORY.md" -Raw | Measure-Object -Character).Characters
Write-Host "memories/MEMORY.md: $c / 8000 = $([math]::Round($c/8000*100,1))%"
```

- 字符硬上限 = **8000**，Hermes 内部硬编码
- 兄弟拍板：必须 **< 6400（80%）**，警示线 **5600（70%）**
- `memory_char_limit` config 字段（顶层或 `memory.` 命名空间下）设了 Hermes **不读**，永远撞 8000 墙
- 撞墙错误信息：`Replacement would put memory at X/8,000 chars. Shorten the new content, or 'remove' other entries first.`

## 2026-08-20 压缩实战（commit 83772e1）

兄弟质问 → bot 走完整 gts-memory-compress SOP：

| 文件 | 压缩前 | 压缩后 | 节省 | 阈值 |
|---|---|---|---|---|
| `memories/MEMORY.md` | 7669 字符 (95%) | **6014 字符 (75%)** | ↓ 1655 / -21.6% | 80% 红线 ✓ |
| `memories/USER.md` | 1294 字符 (94%) | **1210 字符 (88%)** | ↓ 84 / -6.5% | <1375 上限 ✓ |
| `memories/MEMORY_ARCHIVE.md` | 6210 字符 | **9781 字符** | ↑ +3571 / +57.5% | 补 7 章节 |

★ 14 条原文完整保留（所有 🔴 标志条目），8 条索引化（正文 → ARCHIVE）。

索引化的 8 条：
- wt1/wt2/wt3 + Yarn Cache + PMXReduceFace + Hermes Home 双仓提交 + request_dump 路径
- hermes-session-read 升级
- React useEffect cleanup 时序坑
- webpack dev-server 路径陷阱
- Brief 防卡死（PMX jest >300s）
- antd-mobile Modal 白屏修复（commit d6681051e）
- 兄弟说"demo"歧义

补的 ARCHIVE 新章节 7 个：
- antd-mobile Modal 白屏修复（commit d6681051e）
- webpack dev-server 路径陷阱
- Brief 防卡死
- 回忆/git 状态类问题信源优先级
- hermes 读资料 vs OpenCode 加载链
- worktree merge 后必须 git worktree remove
- 兄弟说"demo"歧义
- React useEffect cleanup 时序坑

同步 skill patch：
- `hermes-memory-write-discipline`：加 70% 主动压缩 + 80% add 必配 remove 自检
- `gts-memory-compress`：加字符 > 5600/8000 触发条件
- `hermes-home-state-management`：§1 §2 §4 修正"30000 字符上限"为"8000 字符硬编码"，加 §5 主动压缩触发阈值，引用 hermes-memory-limits

## 翻车对话还原

### 2026-08-18 第一次

1. 兄弟问"怎么老是往 MEMORY.md 里写" → 我答"我没写，是系统注入"（答得不算全错，但**没意识到兄弟指的可能是 `memories/MEMORY.md` 因为它一直在涨**）
2. 兄弟发 session ID `20260818_141830_fa1cf2` → 用 `session-activity.cjs` 还原发现上一会话在改 `opencode-llm-failure-recovery` / `gts-skill-reflect` 两个 skill，但同时反复触发 `memory` 工具试图压缩 `memories/MEMORY.md`
3. 我提议"补 'MEMORY.md < 80%' 规则进 MEMORY.md" → **完全违反兄弟拍板的"memory 分类原则"**（SOP 该放 skill，不该贴便利贴）
4. 兄弟贴出 Hermes 三层记忆架构（会话/持久/Skill），我才意识到 **MEMORY.md 本身就不是用来装规则的**，"贴便利贴"应该只贴"当前会话必须立刻知道的高信号事实"
5. 兄弟说"全自动完成" → 我直接跑 `gts-memory-compress` 准备压 → skill 加载完才发现 **没有 git 兜底（HERMES_HOME 不在 git 里）**，压错不能回滚
6. 我提议"接 git" → 兄弟说"只保存 hermes 相关文件到 git，像 openclaw 一样"
7. 我开始动手 → 第一次 `git status` 检查才看到根目录的 `MEMORY.md` 跟 `memories/MEMORY.md` 同时存在 → **这时候才发现两个 MEMORY.md 一直并存**
8. 又顺手发现 `config.yaml` 顶层有我之前误设的孤儿 `memory_char_limit: 16000`，而合法字段在 `memory.memory_char_limit: 30000`

### 2026-08-20 第二次

1. 兄弟质问"MEMORY 又满了" → bot 没主动压（5 天）
2. bot 第一反应去看根目录 `MEMORY.md`（5720 字节，OpenClaw 旧版）→ 完全错文件
3. 看到 system prompt 注入的 MEMORY 段是 7669/8000（95%）→ 跟磁盘 5720 对不上才意识到找错文件
4. 加载 `hermes-home-state-management` skill → 看到 §1 §2 §4 写的"30000 字符上限"和"config 字段有效"是 8-18 时的过时认知
5. 加载 `hermes-memory-limits` skill → 看到 8-18 兄弟已 patch 字符硬上限 8000，但本 skill（hermes-home-state-management）没引用，没及时更新
6. 加载 `hermes-memory-write-discipline` skill → 看到原则 1（用 sync_turn + nudge 不用 memory 工具）、原则 2（主表只放索引）—— 这两条本周全违反
7. 加载 `gts-memory-compress` skill → 走完整 SOP：Step 0 git 兜底 → Step 1 分类 ★ vs 非 ★ → Step 2 补 ARCHIVE 缺漏 → Step 3 压缩 → Step 4-5 杂项 → Step 6 验证
8. 压缩完成 commit 83772e1 → patch `hermes-home-state-management` / `gts-memory-compress` / `hermes-memory-write-discipline` 三个 skill

## 正确的"接手顺序"（如果未来还要重做这个流程）

```powershell
# Step 1: 看清 HERMES_HOME 现状（不要光看文件名）
$env:HERMES_HOME = "E:\Hermes Agent CN Desktop\data\hermes-home"
Get-ChildItem $env:HERMES_HOME -Force | Select-Object Name, Mode

# Step 2: 核对 MEMORY.md 双文件 + lock 文件 + 字符硬上限
$c = (Get-Content "$env:HERMES_HOME/memories/MEMORY.md" -Raw | Measure-Object -Character).Characters
Write-Host "memories/MEMORY.md: $c / 8000 = $([math]::Round($c/8000*100,1))% (阈值 80% = 6400)"
Get-ChildItem $env:HERMES_HOME -Filter MEMORY.md -Recurse -Force | Select-Object FullName, Length, LastWriteTime
Get-ChildItem $env:HERMES_HOME/memories -Filter "*.lock" -Force | Select-Object Name, Length

# Step 3: 核对 config.yaml memory 字段命名空间（即使设了 Hermes 也可能不读）
Select-String -Path "$env:HERMES_HOME\config.yaml" -Pattern "memory|compression" | ForEach-Object { $_.Line }

# Step 4:（仅当兄弟拍板接 git 时）写 .gitignore + git init + 首次 commit
```

## 哪些文件绝对不能进 git（HERMES_HOME 状态目录的"危险清单"）

接 git 前必 .gitignore 排除：

```
state.db            state.db-shm        state.db-wal        # 会话原始数据，撑爆 git
sessions/                                                          # 同上
logs/                                                                # 日志
cache/                audio_cache/         image_cache/        # 缓存
desktop-ui.sqlite     desktop-ui.sqlite.bak-*                       # 桌面 UI 状态
kanban.db             projects.db          verification_evidence.db    # 业务数据
auth.json             auth.lock            processes.json                # 凭据/进程
.env                 .update_check                                # 配置/版本
models_dev_cache.json ollama_cloud_models_cache.json  provider_models_cache.json  # 模型缓存
port-locks/            pairing/             sandboxes/        # 运行时
cron/                  lsp/                 hooks/            # 跟 agent runtime 强绑
scripts/               *.bak-*                                     # 备份残留
```

## 必读配套 skill

- `hermes-home-state-management` SKILL.md §1 §2 §4 §5（路径核对 + config 字段命名空间 + memory 工具撞墙 + 主动压缩阈值）
- `hermes-agent` skill（CLI 总览）
- `hermes-memory-limits` skill（字符硬上限 8000 + 80% 红线 + add/remove 分两步）
- `hermes-memory-write-discipline` skill（sync_turn + nudge 自动机制 + 主表只放索引 + 70%/80% 自检）
- `gts-memory-compress` skill（压缩 SOP，注意它本身 gts/* 拒 patch，但能正常 read+执行）