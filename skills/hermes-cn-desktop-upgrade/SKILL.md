---
name: "hermes-cn-desktop-upgrade"
description: "Hermes CN 桌面 app(Electron 打包形态)版本升级/回滚/版本查询的标准流程。桌面 app 无独立 hermes CLI,走 GitHub releases + manifest 切版本 + 双进程协调(4098 OpenCode + desktop runtime)。触发:兄弟说「升级 hermes」「升级桌面版」「桌面 app 更新」「hermes 是最新版吗」「能不能升到 0.20」。"
status: "active"
trigger: "兄弟说「升级 hermes」「升级桌面 app」「desktop update」「hermes 有新版本吗」「回滚 hermes」时触发。任何对 E:\\Hermes Agent CN Desktop\\ 安装的版本变更都走本 skill。"
created: "2026-08-19"
umbrella: false
---

# hermes-cn-desktop-upgrade — Hermes CN 桌面 app 升级流程

> ⚠️ 桌面 app 形态 = Electron 打包 = 无独立 `hermes` CLI。所有"升级"动作不是 `npm update -g`,而是:
> 1. 查 GitHub releases 找目标版本
> 2. 下载 runtime zip
> 3. 解压到 `data\versions\<新版本>\`
> 4. 写 manifest.json
> 5. 切 current 标记
> 6. 退出 app + 拉起新 runtime
> 7. 验证 desktop UI + 协调 4098 OpenCode server

## 关键事实(2026-08-19 实测)

| 项 | 值 |
|----|-----|
| 安装根目录 | `E:\Hermes Agent CN Desktop\` |
| 主启动器 | `E:\Hermes Agent CN Desktop\hermes-agent-cn-desktop.exe` |
| 实际 runtime | `E:\Hermes Agent CN Desktop\data\versions\<版本号>\hermes-agent-cn-runtime-win32-x64.exe` |
| 版本目录结构 | `data\versions\<runtime-version>\` 每个版本独立目录 |
| 版本元数据 | `data\versions\<version>\manifest.json`(含 runtimeVersion / kernelVersion / artifactUrl / sha256 / signature) |
| 升级源仓库 | `Eynzof/Hermes-CN-Core` GitHub releases(非 NousResearch 官方) |
| 资产 URL 模板 | `https://github.com/Eynzof/Hermes-CN-Core/releases/download/runtime-v<X.Y.Z>-cn.<N>/hermes-agent-cn-runtime-win32-x64.zip` |
| 升级模式 | 覆盖/并存(manifest 决定) |
| 没有 CLI | 别找 `hermes` 命令,没有 |

## 适用场景

- 兄弟说「升级 hermes」「升到 0.20」「桌面 app 更新」
- 兄弟问「hermes 是最新版吗」「能不能升级」
- 跨 minor 版本升级(已知有兼容性风险,见 cn.5 commit message「修复覆盖升级后自定义模型配置失效」)
- 出问题要回滚到上一稳定版本

**不适用**:
- 改 Hermes 内置 skill / memory / config(走 `hermes-home-state-management` skill)
- 改 OpenCode server 版本(走 `opencode` skill / `opencode-model-smoke-test` 的 server-restart 流程)
- 改模型 provider(走 `hermes-provider-config` skill)

## 升级前必查(快速决策清单)

回答完这三件事才动手:

1. **当前版本** vs **目标版本**(间隔几个 minor/几个 cn.x 修订)
2. **是否有"自定义模型配置失效"风险**——查目标版本 commit message,若含"fix: 修复覆盖升级后..."则升级后必查 config
3. **是否有正在跑的 session**(OpenCode 4098 + Hermes 当前会话)— 升级会断

## 升级流程(标准 7 步)

### Step 1:查当前版本

```powershell
Get-Content "E:\Hermes Agent CN Desktop\data\versions\<当前版本目录>\manifest.json"
# 拿 runtimeVersion / kernelVersion / sourceCommit 对比目标版本
```

### Step 2:查最新稳定版(GitHub releases)

```powershell
# GitHub API 限流 60/h 未鉴权,优先用浏览器
$releases = Invoke-WebRequest "https://api.github.com/repos/Eynzof/Hermes-CN-Core/releases?per_page=10" -UseBasicParsing -TimeoutSec 15
# 失败回退:浏览器打开 https://github.com/Eynzof/Hermes-CN-Core/releases
```

识别 "Latest" 标签 = 当前最新稳定版。读 commit message 看是否含 "fix:..."、"feat:..."、"BREAKING:"。

### Step 3:拍升级方案(向兄弟汇报 3 件事)

| Q | 选项 |
|---|------|
| Q1:升级方式 | (a) 桌面 app 内点"检查更新"(稳) / (b) bot 手工下载+解压+切版本 / (c) 你有官方升级脚本 |
| Q2:升级窗口 | (d) 现在升(对话会断) / (e) 等方便时升(bot 先下好 zip 放着) |
| Q3:跨 minor 怎么升 | (f) 直跳 latest(享受所有修复) / (g) 一步一步升(零风险但重启多次) |

**推荐**: b + d + f(默认推荐但需兄弟确认)。本 skill 不自动执行,任何升级都要兄弟拍板。

### Step 4:备份 hermes-home(不可逆前的兜底)

```powershell
$backupPath = "E:\Hermes Agent CN Desktop\data\hermes-home.bak-$(Get-Date -Format 'yyyy-MM-dd')"
Copy-Item -Path "E:\Hermes Agent CN Desktop\data\hermes-home" -Destination $backupPath -Recurse -Force
# 备份内容包括:MEMORY.md / USER.md / skills/ / memories/ / plugins/ / cron/ / .env / config.yaml
```

### Step 5:下载 runtime zip

下载到默认目录(`D:\Downloads\`),保留源 URL + SHA256:

```powershell
$url = "https://github.com/Eynzof/Hermes-CN-Core/releases/download/runtime-v<X.Y.Z>-cn.<N>/hermes-agent-cn-runtime-win32-x64.zip"
$zipPath = "D:\Downloads\hermes-agent-cn-runtime-v<X.Y.Z>-cn.<N>-win32-x64.zip"
Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
# 校验 SHA256
Get-FileHash $zipPath -Algorithm SHA256
# 对比 manifest.json 里的 sha256 字段
```

### Step 6:解压到新版本目录

```powershell
$newVersion = "<X.Y.Z>-cn.<N>"
$targetDir = "E:\Hermes Agent CN Desktop\data\versions\$newVersion"
Expand-Archive -Path $zipPath -DestinationPath $targetDir -Force
# 解压后必有:hermes-agent-cn-runtime-win32-x64.exe + manifest.json
Test-Path "$targetDir\hermes-agent-cn-runtime-win32-x64.exe"  # 必须 True
Test-Path "$targetDir\manifest.json"  # 必须 True
```

### Step 7:切 current 标记 + 退出 + 拉起新 runtime

⚠️ 这一步必须先退出 desktop app + 杀 OpenCode 4098(若有)。流程:

```powershell
# 1. 通知兄弟:"升级就绪,需要你退出 desktop app"
# 2. 等兄弟确认退出后再继续
# 3. 兄弟确认后:启动新 runtime(继承 current 自动切)
Start-Process -FilePath "$targetDir\hermes-agent-cn-runtime-win32-x64.exe" -ArgumentList @("serve","--print-logs") -WindowStyle Hidden
# 4. 等就绪 + 拉起 OpenCode 4098(若需要,见 opencode-model-smoke-test references/opencode-server-restart.md)
# 5. 验证:/api/skill 返回新 skill 列表,关键 skill(如 gts-coding-philosophy)还在
```

## Pitfalls(本轮 + 历史踩)

### ❌ 假设有 `hermes` CLI
**症状**: 在 PATH 里找 `hermes` 命令,找不到 = 以为升级失败
**真相**: 桌面 app 是 Electron 打包形态,**没有独立 CLI**。所有"升级"通过 zip 替换 + manifest 切版本。

### ❌ 不查 GitHub releases 就升
**症状**: 直接下个最新版 zip,不看 commit message
**坑**: 0.20.0-cn.5 的 commit message 是「fix: 修复覆盖升级后自定义模型配置失效」——意味着**升级路径上出过一次配置丢失 bug**,cn.5 是修这个的。从 0.19.0 直接跳过去前必须确认目标版本含此修复。

### ❌ 不备份 hermes-home
**症状**: 升级出问题了,记忆/技能/配置全没
**正确**: Step 4 必备份到 `hermes-home.bak-<date>\`,出问题一键回滚。

### ❌ 不通知兄弟就启动新 runtime
**症状**: bot 直接 `Start-Process` 新 exe,兄弟的 desktop app 还在用旧 runtime
**坑**: 双 runtime 抢端口 / 文件锁冲突 / 兄弟的 session 状态丢失
**正确**: 必须先通知兄弟退出 app,等确认后再启。

### ❌ 不协调 OpenCode 4098
**症状**: 升级 desktop 后,4098 server 还在跑旧 session
**坑**: 4098 跟 desktop runtime 是独立进程(见 opencode-model-smoke-test),desktop 升级不会自动重启 4098。升级完成后**单独重启 4098**(按 references/opencode-server-restart.md)。

### ❌ GitHub API 限流当成"网络问题"
**症状**: `Invoke-WebRequest https://api.github.com/...` 返回 403
**真相**: GitHub 未鉴权 60 次/小时,已用完
**正确**: 切浏览器看 releases 页,或等限流窗口恢复(不重试,会扣更多次)。

### ❌ GitHub releases 看岔到 fork
**症状**: 看 NousResearch/hermes-agent(官方)找最新版
**真相**: 桌面 app 用的是 **CN 分叉** `Eynzof/Hermes-CN-Core`(forked from NousResearch/hermes-agent)
**正确**: 只看 `Eynzof/Hermes-CN-Core/releases`,别看 NousResearch 主仓(版本号不一定同步)。

## 回滚流程

```powershell
# 1. 停新 runtime(若有)
Get-Process -Name "hermes-agent-cn-runtime*" -ErrorAction SilentlyContinue | Stop-Process -Force
# 2. 切 current 到旧版本目录(改 manifest.json 或 current.json 指针)
# 3. 启动旧 runtime
Start-Process -FilePath "E:\Hermes Agent CN Desktop\data\versions\<旧版本>\hermes-agent-cn-runtime-win32-x64.exe" -ArgumentList @("serve","--print-logs") -WindowStyle Hidden
# 4. 还原 hermes-home 备份(若配置被新版本改坏了)
Remove-Item -Recurse -Force "E:\Hermes Agent CN Desktop\data\hermes-home"
Copy-Item -Path "E:\Hermes Agent CN Desktop\data\hermes-home.bak-<date>" -Destination "E:\Hermes Agent CN Desktop\data\hermes-home" -Recurse -Force
```

## 关联 skill

- **`hermes-home-state-management`** — 升级涉及 hermes-home 状态时(备份/还原)协同
- **`opencode-model-smoke-test`** — 升级后需重启 OpenCode 4098(server-restart 流程)
- **`gts-skill-update-discipline`** — 升级涉及 skill 时遵守版本纪律

## 触发清单(看到这些就触发本 skill)

- "升级 hermes"
- "升到 0.20"
- "桌面 app 更新"
- "desktop update"
- "hermes 是最新版吗"
- "能不能升级"
- "回滚 hermes"
- "升级出问题了"