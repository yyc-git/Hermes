# OpenClaw → Hermes 迁移(实测案例,CN Desktop)

## 环境(2026-08 实测)
- 源:`C:\Users\Administrator\.openclaw`(Windows)
- 目标:`E:\Hermes Agent CN Desktop\data\hermes-home`(HERMES_HOME,Desktop 托管,非 ~/.hermes)
- 运行时:`E:\Hermes Agent CN Desktop\data\versions\0.19.0-cn.7\hermes-agent-cn-runtime-win32-x64.exe`
- 项目工作区:`D:\Github\GTS-Play`(仓库已有 AGENTS.md,Hermes 原生支持,无需迁移)

## 源数据地图(实测)
```
~/.openclaw/
├── workspace/skills/<name>/SKILL.md   ← 53 个活技能,单文件为主,格式 = YAML frontmatter(name+description)+ markdown
│                                          (tencent-channel-community 带 6 个附属文件;个别空目录需跳过)
├── skill-workshop/proposals.json      ← 271 条提案历史(259 applied),仅为记录,不是技能本体
│   └── proposals/<id>/{proposal.json, PROPOSAL.md, rollback.json}
├── memory/YYYY-MM-DD.md               ← 4 个每日日志(daily log 风格,非 Hermes fact 风格)
│   └── main.sqlite.migrated           ← 12MB 旧 sqlite 记忆,已标记 migrated,只归档
├── plugin-skills/                     ← 插件自带技能(browser-automation/canvas/feishu-*/qqbot-*),不迁
├── agents/main/qmd/sessions/*.md      ← 数千个会话文件,量大,只归档
├── cron/  credentials/  openclaw.json ← 配置与秘钥,人工逐条迁移
└── openclaw.json                      ← agents.defaults.model = opencode/deepseek-v4-flash-free
```

## 迁移执行(阶段 0–6)

### 0. 备份
```powershell
Compress-Archive "C:\Users\Administrator\.openclaw\workspace\skills" -DestinationPath "D:\backup-openclaw-skills-<date>.zip"
Copy-Item "C:\Users\Administrator\.openclaw\memory" -Destination "D:\backup-openclaw-memory-<date>" -Recurse
```

### 1. 技能复制(核心,格式天然兼容)
```powershell
$dst = "E:\Hermes Agent CN Desktop\data\hermes-home\skills\gts"
New-Item -ItemType Directory -Force $dst | Out-Null
Get-ChildItem "C:\Users\Administrator\.openclaw\workspace\skills" -Directory |
  Where-Object { $_.Name -ne "multica-create-squad-issue" } |   # 空目录跳过
  ForEach-Object { Copy-Item $_.FullName "$dst\$($_.Name)" -Recurse -Force }
```

### 2. 记忆迁移
- 4 个 daily-log md 归档到 `D:\Github\GTS-Play\笔记\openclaw-memory-archive\`
- 关键事实在对话中通过 memory 工具逐条导入(如"preproduction 插值延迟已修复:MultiplayerLoop.ts:540 用 Date.now()")

### 3. 工作区上下文
- AGENTS.md 已在仓库,开箱即用;保持工作区指向 `D:\Github\GTS-Play`,技能里的 `笔记/`、`specs/`、`test/` 相对路径才有效

### 4. 配置/秘钥(需用户确认)
- 模型已兼容:OpenClaw `opencode/deepseek-v4-flash-free` ≈ Hermes `deepseek/deepseek-v4-flash`
- API keys 从 openclaw.json auth 段/credentials 逐条核对后写入 `hermes-home\.env`,绝不整体复制

### 5. Cron
- OpenClaw `cron\` 定时任务 → `hermes cron create` 重建

### 6. 验证
```powershell
hermes skills list | findstr gts      # 期望 53 个
```
新会话触发 `feat:` 验证 gts-dev-feat 加载。

## 兼容性对照表(OpenClaw 概念 → Hermes 对应物)
| OpenClaw 依赖 | 技能中的用途 | Hermes 方案 |
|---|---|---|
| skill_workshop 提案工作流 | gts-skill-reflect 等 | skill_manage(直接改 SKILL.md) |
| opencode-schedule / OpenCode Pro 调度 | gts-code-review/plan-review 委托写代码 | shell 调 opencode CLI(有 opencode 技能) |
| 飞书通知 | 全流程等确认通知 | feishu 平台适配器 / feishu_doc 工具(需配 gateway 凭证) |
| 微信(wechat-send-message/chat-export) | 微信发消息/导记录 | weixin 适配器(需配置) |
| heartbeat 2h 主动心跳 | 自动巡检 | hermes cron |
| memorySearch 本地 embedding | 记忆检索 | 内置记忆或 memory.provider(mem0/openviking/honcho) |
| skill-exec-issue-tracker 状态文件 | .skill-exec-state.*.json(在仓库内) | 照常工作(项目内文件机制) |
| crestodian 记忆整理 | — | hermes curator |

## 实测踩坑记录
1. `hermes claw migrate` → "Migration script not found. Expected at ..._internal\optional-skills\migration\openclaw-migration\scripts\openclaw_to_hermes.py" — CN 桌面版未打包该技能,hub 搜索也无结果 → 手动迁移。**未来版本需复查**(可能上游已补)。
2. PowerShell `& "exe"` 调用被 terminal 工具判为后台化 → 用 Start-Process(见 hermes-cn-desktop-cli.md)。
3. `cmd /c "set HERMES_HOME=...&& exe ..."` 遇含空格路径解析失败 → 不要用。
4. 技能抽样格式确认:`gts-dev-feat/SKILL.md` frontmatter 只有 `name` + `description`,与 Hermes 直接兼容;proposal.json 的 `target.skillDir` 字段可反查技能真实位置。
