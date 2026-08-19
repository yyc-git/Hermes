# 双 MEMORY.md 翻车事故档案（2026-08-18）

> 本文件是 `hermes-home-state-management` skill 的参考材料。**只读**，不写。

## 事故摘要

bot 整场会话（2026-08-18 下午）以为只有一个 MEMORY.md，反复读写 `memories/MEMORY.md`，最终把对话搞成"压在错的本子上讨论压缩规则"——根因是不知道根目录还有个 OpenClaw 迁移留下的旧 `MEMORY.md`。

## 现场取证（已 grep 验证）

`$HERMES_HOME = E:\Hermes Agent CN Desktop\data\hermes-home`

```
FullName                                                              Length  LastWriteTime
--------                                                              ------  ------------
E:\Hermes Agent CN Desktop\data\hermes-home\MEMORY.md                 5720    2026-08-17（迁移期）
E:\Hermes Agent CN Desktop\data\hermes-home\memories\MEMORY.md        11916   2026-08-18 14:59（本会话产物）
E:\Hermes Agent CN Desktop\data\hermes-home\memories\USER.md          2273
E:\Hermes Agent CN Desktop\data\hermes-home\memories\MEMORY.md.lock   0       （memory 工具写入锁）
E:\Hermes Agent CN Desktop\data\hermes-home\memories\USER.md.lock     0
```

`.lock` 文件存在 = `memories/MEMORY.md` 是 memory 工具的写入目标；**根目录的 MEMORY.md 不带 lock，是手工维护**。

## 内容对比（避免下次再混淆）

| 文件 | 第一行 | 风格 | 谁写 |
|------|--------|------|------|
| 根目录 `MEMORY.md` | `# MEMORY.md — 核心记忆` | 章节标题 + 表格 + `>` 注释，OpenClaw 风格 | 手工（迁移时一次性写入） |
| `memories/MEMORY.md` | `用户环境:Hermes CN Desktop (0.19.0-cn.7)...` | 扁平 `§` 分隔的高信号事实条目 | memory 工具（每次会话都可能写） |

## 翻车对话还原

1. 兄弟问"怎么老是往 MEMORY.md 里写" → 我答"我没写，是系统注入"（答得不算全错，但**没意识到兄弟指的可能是 `memories/MEMORY.md` 因为它一直在涨**）
2. 兄弟发 session ID `20260818_141830_fa1cf2` → 用 `session-activity.cjs` 还原发现上一会话在改 `opencode-llm-failure-recovery` / `gts-skill-reflect` 两个 skill，但同时反复触发 `memory` 工具试图压缩 `memories/MEMORY.md`
3. 我提议"补 'MEMORY.md < 80%' 规则进 MEMORY.md" → **完全违反兄弟拍板的"memory 分类原则"**（SOP 该放 skill，不该贴便利贴）
4. 兄弟贴出 Hermes 三层记忆架构（会话/持久/Skill），我才意识到 **MEMORY.md 本身就不是用来装规则的**，"贴便利贴"应该只贴"当前会话必须立刻知道的高信号事实"
5. 兄弟说"全自动完成" → 我直接跑 `gts-memory-compress` 准备压 → skill 加载完才发现 **没有 git 兜底（HERMES_HOME 不在 git 里）**，压错不能回滚
6. 我提议"接 git" → 兄弟说"只保存 hermes 相关文件到 git，像 openclaw 一样"
7. 我开始动手 → 第一次 `git status` 检查才看到根目录的 `MEMORY.md` 跟 `memories/MEMORY.md` 同时存在 → **这时候才发现两个 MEMORY.md 一直并存**
8. 又顺手发现 `config.yaml` 顶层有我之前误设的孤儿 `memory_char_limit: 16000`，而合法字段在 `memory.memory_char_limit: 30000`

## 正确的"接手顺序"（如果未来还要重做这个流程）

```powershell
# Step 1: 看清 HERMES_HOME 现状（不要光看文件名）
$env:HERMES_HOME = "E:\Hermes Agent CN Desktop\data\hermes-home"
Get-ChildItem $env:HERMES_HOME -Force | Select-Object Name, Mode

# Step 2: 核对 MEMORY.md 双文件 + lock 文件
Get-ChildItem $env:HERMES_HOME -Filter MEMORY.md -Recurse -Force
Get-ChildItem $env:HERMES_HOME/memories -Filter "*.lock" -Force

# Step 3: 核对 config.yaml memory 字段命名空间
Select-String -Path "$env:HERMES_HOME\config.yaml" -Pattern "memory|compression" | ForEach-Object { $_.Line }

# Step 4: （仅当兄弟拍板接 git 时）写 .gitignore + git init + 首次 commit
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

- `hermes-home-state-management` SKILL.md §1 §2（路径核对 + config 字段命名空间）
- `hermes-agent` skill（CLI 总览）
- `gts-memory-compress` skill（压缩时调用，注意它本身 gts/* 拒 patch，但能正常 read+执行）