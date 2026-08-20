---
name: openclaw-migration
description: "从 OpenClaw 迁移到 Hermes Agent 的完整方法论。触发条件:迁移 OpenClaw 的记忆/技能/身份/配置到 Hermes,或处理 OpenClaw 遗留数据(workspace 结构、SKILL.md 格式、脚本依赖)。"
---

# OpenClaw → Hermes 迁移

> 2026-08-17 实战总结(迁移 GTS-Play 项目,52 技能 + 130+ 记忆日志 + 身份)。OpenClaw 与 Hermes 同属 agent 框架,数据格式高度兼容,迁移核心是「复制 + 适配」。

## 数据位置(最重要的事实)

OpenClaw 的全部核心数据在 **`~/.openclaw/workspace/`**,不是 `~/.openclaw/memory/`(那是旧版残留):

| 数据 | 位置 | 说明 |
|---|---|---|
| 技能本体 | `workspace/skills/` | 每个技能一个目录含 SKILL.md,格式与 Hermes **完全兼容**(YAML frontmatter: name + description) |
| 归档/禁用技能 | `workspace/skills-archive/`、`workspace/skills-disabled/` | 按需恢复(复制回 skills/ 即启用) |
| **核心记忆** | `workspace/MEMORY.md` | 索引式记忆(身份/协议/锚点词/教训),可能 40-90KB |
| 记忆归档 | `workspace/MEMORY-ARCHIVE.md` | 详细内容,更大 |
| 每日日志 | `workspace/memory/` | `YYYY-MM-DD.md` 模式,可能 100+ 个 |
| 身份 | `workspace/SOUL.md`(agent 人格)、`workspace/USER.md`(用户画像)、`workspace/IDENTITY.md`、`workspace/TOOLS.md`、`workspace/HEARTBEAT.md` | |
| 技能提案历史 | `~/.openclaw/skill-workshop/proposals.json` + `proposals/` | 271 条提案,仅历史,**无需迁移** |
| 会话历史 | `~/.openclaw/agents/main/qmd/sessions/` | 量大,建议仅归档不迁移 |
| 配置 | `~/.openclaw/openclaw.json` | 模型/heartbeat/compaction |

## 关键事实

- **Hermes built-in memory 就是 `MEMORY.md` / `USER.md`**(`hermes memory --help` 明示),与 OpenClaw 同名同概念 → USER.md 可原样复制,MEMORY.md 需提炼转换(见下)
- **`hermes claw migrate` 依赖 `openclaw-migration` 技能**,CN 桌面版未打包、官方 hub/GitHub 均无 → 多数场景**手动迁移**(技能格式天然兼容,复制即可)
- OpenClaw SKILL.md frontmatter 只需 name + description;个别技能可能缺 frontmatter(如 gts-youtube-download),需补上
- **遗留 issue/工作流可直接续跑(2026-08-17 实测)**:项目内 `.skill-exec-state.oc_*.json`(agentHost=openclaw,schemaVersion=2)+ `笔记/项目文档/issue/*.md` + `笔记/项目文档/changes/<日期>-<功能名>/` 三件套在 Hermes 下**原样可读、可直接继续**——读 state 文件确认 completedSteps/remainingSteps 定位恢复点(如 B1 ✅ 待 B2),不重新 INIT 重建工作流,直接写 brief dispatch 下一阶段;skill-exec-manager.cjs 兼容旧 state 文件。恢复点定位参考 gts-dev-fix 的「恢复交互模板」
  - **skill-exec-manager 的 check/step-done 必须在项目根目录跑**(D:\Github\GTS-Play):在 packages/ 子目录跑会按 cwd 找 state 文件 → 报 `无法读取 state 文件: ENOENT ...\packages\frontend\.skill-exec-state...`(2026-08-17 实测 crossCheck 误报)

## 迁移步骤

### 1. 备份(必做)
```powershell
robocopy "$env:USERPROFILE\.openclaw\workspace" "D:\backups\openclaw-workspace-<date>" /E /XD node_modules tmp _tmp logs diag
```

### 2. 技能复制
```powershell
$dst = "$env:HERMES_HOME\skills\gts"   # 自定义分类
New-Item -ItemType Directory -Force $dst | Out-Null
Get-ChildItem "$env:USERPROFILE\.openclaw\workspace\skills" -Directory |
  Where-Object { $_.Name -ne "<空目录名>" } |
  ForEach-Object { Copy-Item $_.FullName "$dst\$($_.Name)" -Recurse -Force }
```
- 校验每个 SKILL.md 有 name + description,缺失补 frontmatter
- 带附属文件(tencent-channel-community 嵌套结构)整目录复制,Hermes 支持 references/scripts/assets
- `hermes skills list` 验证识别(新会话或 /reload-skills 生效)

### 3. 记忆迁移
- USER.md:**原样复制**到 `$HERMES_HOME/USER.md`
- MEMORY.md:提炼转换(OpenClaw 专属机制改写为 Hermes 语境),不要整文件照搬(含大量失效工具引用)。原始完整版归档到项目 `笔记/memory/openclaw-archive/core/`
- 每日日志:原样归档(不导入 Hermes 记忆),核心事实由 Hermes 在对话中逐条"记住"
- main.sqlite(向量库):不迁移;语义检索需求用 `hermes memory setup` 配 provider 或建检索 skill

### 4. 身份迁移
- OpenClaw SOUL.md 的人格/工具约定 → 追加到 `$HERMES_HOME/SOUL.md`(保留 Hermes 基础身份行)
- USER.md 已复制(含称呼、时区、项目信息)

### 5. 脚本落地(去 OpenClaw 化)
技能内大量引用 `~/.openclaw\workspace\scripts\xxx`(wait-opencode-session.mjs、clash-proxy-manager.ps1、skill-exec-manager.cjs、抓取脚本等):
1. 复制所需脚本到**项目** `scripts/`(如 GTS-Play/scripts/)
2. 批量替换技能内路径:`workspace\scripts\` → `D:\...\项目\scripts\`
3. 残留检查:`Select-String 'workspace[\\/]scripts'`

**🔴 双机硬编码路径排查(2026-08-17 实测)**:部分脚本的 DB 路径是**硬编码的 one 机路径**,本机(Administrator)直接跑报错。症状与修法:
- `extract-session-text.mjs` / `extract-opencode-report.cjs`:默认 `C:/Users/one/.local/share/opencode/opencode.db` → 本机报 `unable to open database file` → 先 `$env:OPENCODE_DB = "C:\Users\Administrator\.local\share\opencode\opencode.db"` 再跑
- `wait-opencode-session.mjs` 是**自动探测** DB 路径的(无此问题,已跨机兼容)
- 排查法:跑脚本报 `unable to open database file` 或 `ENOENT` → 先 `Select-String 'C:/Users/(one|Administrator)' scripts/*.mjs scripts/*.cjs` 找硬编码路径

### 6. 技能内部 OpenClaw 依赖适配(核心工作量)

| OpenClaw 引用 | Hermes 对应 |
|---|---|
| `exec(background=true, timeout=0)` | `terminal(background=true)` |
| `process(action=poll/list/log)` | `process(action=poll)`(Hermes terminal 内置) |
| `sessions_spawn` | `delegate_task`(同样禁止) |
| `read` / `edit` | `read_file` / `patch`、`write_file` |
| `memory_search` | 检索协议 skill(见 gts-memory-search)或 `session_search` |
| `msg *` / `notify.ps1` 桌面通知 | 直接提醒(桌面通知待配置) |
| `skill_workshop`(提案改技能) | `skill_manage` |
| OpenClaw-whole 同步(gts-git-pull 类) | 改造/废弃(记忆源已变) |

建议:核心调度协议 skill 加「环境适配」章节作为全局映射权威,其他技能引用它即可,不逐个重写;机械替换(路径)可批量,语义改造(围绕 OpenClaw 本体的技能)单独评估。

## Pitfalls

- **误判数据位置**:记忆在 `workspace/`,不在 `~/.openclaw/memory/`(只有 4 个旧文件 + 已迁移 sqlite)
- **`hermes claw migrate` 报 "Migration script not found"**:缺 openclaw-migration 技能,别卡住,直接手动
- **PowerShell `& "path"` 可能被 Hermes terminal 误判为 backgrounding**(报 "uses '&' backgrounding")→ 改用:直接 PATH 命令、`Start-Process -Wait -RedirectStandardOutput`、或 `cmd /c`(注意路径含空格时 cmd 内需引号)
- **PowerShell `-and` 前必须有括号**:`if ((Test-Path A) -and -not (Test-Path B))`,否则 `-and` 被当作参数
- **编码**:读取技能/记忆用 `-Encoding UTF8` 或 `[System.IO.File]::ReadAllText`,PowerShell 5.1 默认 ANSI 会乱码;写入用 `UTF8Encoding::new($false)`(无 BOM)
- **技能修改后新会话生效**(当前会话不变);MEMORY.md/USER.md/SOUL.md 同样
- 迁移前若 OpenClaw gateway 还在运行,workspace 数据会持续变化,先停再迁

## 验证清单

1. `hermes skills list` → 迁移技能全部 enabled
2. 新会话提问验证记忆生效(称呼、项目信息)
3. 调度一次真实任务(如跑测试)验证工作流链路
4. 方案/归档落盘到项目 `笔记/`(方案索引登记)

## 相关

- `gts-memory-search`(检索协议 skill,替代 QMD)
- `deepseek-harness`(同类 agent 框架调度)
- hermes-agent(官方文档,受保护 bundled skill)
