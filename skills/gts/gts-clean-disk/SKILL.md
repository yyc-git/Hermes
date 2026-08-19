---
name: "gts-clean-disk"
description: "C 盘清理专用 skill：检查空间、识别可清理的 OpenClaw/OpenCode 相关大件、按需清理"
---

# gts-clean-disk — C 盘清理 Skill

> 兄弟说「清理 C 盘」「磁盘清理」时触发。

## 踩坑（2026-08-19 实测沉淀）

- **`&` 调用符被误判 backgrounding**：调 du/robocopy 等带 `&` 的命令必须 `cmd /c '...'` 包起来，否则 terminal 抛"Foreground command uses '&' backgrounding"
- **`du -d N` 输出走 stderr**：`du 2>nul` 把结果吞了！要捕获就用 `cmd /c '... > out.txt 2>nul'`，但 stderr 仍丢。**结论**：跨平台深度扫描**用 PowerShell `Get-ChildItem -Depth N` 限深度**比 du 稳
- **PowerShell `-Depth 2` 误算总大小**：单文件子目录会被当 0 处理。**别用** Depth 估总大小，要逐层 Get-ChildItem
- **PowerShell Measure-Object 用 hashtable 报 "Cannot bind parameter 'Property'"**：别写 `-Property @{E={...}}`，改成 sum 后再 Sort-Object
- **Temp 别硬清 1.7 GB**：`Get-ChildItem $env:TEMP -Directory` 拿的目录大小含大量活文件（浏览器临时/Herems 工作目录/opencode 子进程），硬删会锁冲突。**只清明确已知子目录**：pw-* / jest / playwright_* 等 pattern 即可，**不动 opencode 和 jest 顶层目录**
- **WinSxS DISM 经常被拒**：系统有 TiWorker/TrustedInstaller 在跑时 `DISM /Online /Cleanup-Image /StartComponentCleanup` 报 6824 "another transaction is depending"。**别杀 TiWorker**——会坏系统更新状态。**改下次开机跑**（写个 startup 任务）或干脆放弃，等兄弟空闲时跑
- **scoped_dir* 几百个空目录**：是 Windows 应用沙盒残留（沙盒撤销后留下的命名空间目录），单个 0 MB，加起来可忽略。**不动**
- **桌面/微信聊天记录/地图资源是兄弟私产**：自动清脚本一律 skip，**必须人确认**
- **.cache\qmd 是 Hermes 本地 GGUF 模型**（embedding + reranker + query-expansion 各 1 个 gguf 共 2.15 GB）：删了断本地语义搜索（FTS5 之外的向量召回）。**默认不动**，兄弟明确说才清

## 步骤

### 1️⃣ 检查 C 盘空间

```
Get-PSDrive C | %{ 'C: 总容量: {0:N1} GB, 已用: {1:N1} GB, 可用: {2:N1} GB' -f (($_.Used+$_.Free)/1GB, $_.Used/1GB, $_.Free/1GB) }
```

如果可用空间 > 10 GB，问兄弟要不要继续，否则直接列大件。

### 2️⃣ 扫描可清理大件

对以下目录快速估算大小（逐个查，用 `Measure Length -Sum`）：

| 路径 | 说明 |
|------|------|
| `C:\Users\Administrator\.openclaw\npm\projects` — 找 `llama-cpp-provider-*` | ~1.5 GB，没用可删 |
| `C:\Users\Administrator\.openclaw-multica\npm\projects` — 找 `llama-cpp-provider-*` | ~1.5 GB，没用可删（有 .openclaw 版本后这个副本多余） |
| `C:\Users\Administrator\.openclaw-multica\workspace\GTS-Play` | ~780 MB，Multica 子 agent 工作区副本，不用 Multica 可删 |
| `C:\Users\Administrator\.openclaw\tmp` | ~92 MB，安全 |
| `C:\Users\Administrator\.openclaw\browser\data` | ~79 MB，安全 |
| `C:\Users\Administrator\.cache\opencode\packages` | ~580 MB（实测比 728 小），安全 |
| `C:\Users\Administrator\.cache\qmd\models` | ~2.15 GB ⚠️ Hermes 本地语义搜索模型，**默认不动** |
| `C:\Users\Administrator\.local\share` | ~2.3 GB，uv/pip 等工具 user data，没在跑 uv 任务可清 |
| `C:\Users\Administrator\AppData\Local\Temp` — `pw-*`, `pw-test-*`, `jest`, `playwright_*` | ~10+ GB，Playwright 残留 |
| `C:\Users\Administrator\AppData\Local\MEGAsync` | ~269 MB，MEGA 网盘客户端 |
| `C:\Users\Administrator\AppData\Local\accurig-updater` | ~505 MB，AcctRIG 升级器 |
| `C:\Users\Administrator\AppData\Local\binance-updater` | ~222 MB，币安升级器 |
| `C:\Users\Administrator\AppData\Local\@multicadesktop-updater` | ~167 MB，Multica 升级器 |
| `C:\Users\Administrator\AppData\Local\draw.io-updater` | ~115 MB |
| `C:\Users\Administrator\AppData\Local\cherrystudio-updater` | ~108 MB |
| `C:\Users\Administrator\AppData\Local\Microsoft\Edge\User Data\Default\Cache` 等子目录 | Edge 浏览器缓存（**只清子目录不动 Default 主目录**，否则登出） |
| `C:\Users\Administrator\AppData\Roaming\Tencent\WeChat\WeChatFiles\All Users\CDNRobot` | 微信 CDN 缓存 |
| `C:\Users\Administrator\AppData\Roaming\Tencent\WeChat\Crashpad` | 微信崩溃转储 |
| `C:\Users\Administrator\AppData\Roaming\Tencent\WeMeet\cache` | WeMeet 缓存 |
| `C:\Users\Administrator\.multica` | ~17 MB，Multica 配置/状态，安全 |
| `C:\Users\Administrator\AppData\Roaming\multica` | ~9 MB，Multica 应用数据，安全 |
| `C:\Users\Administrator\AppData\Local\npm-cache\_cacache` | ~482 MB（实测比 1.6 GB 小），安全 |

**🔴 禁自动清的（必须兄弟点头）**：
- `C:\Users\Administrator\Desktop`、`C:\Users\Administrator\地图资源` — 私产/项目素材
- `C:\Users\Administrator\AppData\Roaming\Tencent\WeChat\WeChatFiles\<wxid>\FileStorage/Msg/Config` — 聊天记录/数据库
- `C:\Users\Administrator\AppData\Local\Google\Chrome\User Data\Default` — Chrome 主配置
- `C:\Users\Administrator\AppData\Local\Microsoft\Edge\User Data\Default` — Edge 主配置
- `C:\Users\Administrator\.cache\qmd` — Hermes 本地语义模型

**🔧 全盘扫描大目录（兄弟问"还有哪些可以清理"时跑）**：
- `C:\Program Files` — 应用主目录，按大小排序
- `C:\Program Files (x86)` — 32 位应用
- `C:\ProgramData` — 应用共享数据
- `C:\Windows\WinSxS`（DISM 分析，不能用 Get-ChildItem 估大小）

### 3️⃣ 列出并确认

输出格式：
```
📊 C 盘状态: XX GB / XX GB 可用
==================================
  可清理的项目：
  1️⃣ llama-cpp-provider               1.5 GB  ⚠️ 没用可删
  2️⃣ multica-llama-cpp                1.5 GB  ⚠️ Multica 副本，没用可删
  3️⃣ multica-workspace                780 MB  ⚠️ Multica 子 agent 工作区
  4️⃣ .openclaw\tmp                     92 MB   ✅
  5️⃣ OpenCode 包缓存                  728 MB  ✅
  ...
==================================
  说编号或「全清」执行清理
```

### 4️⃣ 执行清理

根据兄弟选择的编号，执行对应的清理命令：

| # | 命令 |
|---|------|
| llama-cpp-provider | `Remove-Item "C:\Users\Administrator\.openclaw\npm\projects\openclaw-llama-cpp-provider-*" -Recurse -Force` |
| multica-llama-cpp | `Remove-Item "C:\Users\Administrator\.openclaw-multica\npm\projects\openclaw-llama-cpp-provider-*" -Recurse -Force` |
| multica-workspace | `Remove-Item "C:\Users\Administrator\.openclaw-multica\workspace\GTS-Play" -Recurse -Force` |
| .openclaw\tmp | `Remove-Item "C:\Users\Administrator\.openclaw\tmp\*" -Recurse -Force` |
| .openclaw\browser\data | `Remove-Item "C:\Users\Administrator\.openclaw\browser\data\*" -Recurse -Force` |
| OpenCode 包缓存 | `Remove-Item "C:\Users\Administrator\.cache\opencode\packages\*" -Recurse -Force` |
| npm-cache | `Remove-Item "C:\Users\Administrator\AppData\Local\npm-cache\_cacache" -Recurse -Force` |
| Temp（Playwright 残留） | `Get-ChildItem $env:TEMP -Directory \| Where-Object { $_.Name -like 'pw-*' -or $_.Name -eq 'jest' -or $_.Name -like 'playwright_*' } \| Remove-Item -Recurse -Force` |
| .local\share (uv/pip 数据) | `Remove-Item 'C:\Users\Administrator\.local\share' -Recurse -Force` |
| accurig-updater / MEGAsync / binance-updater / @multicadesktop-updater / draw.io-updater / cherrystudio-updater | `Remove-Item 'C:\Users\Administrator\AppData\Local\<dir>' -Recurse -Force`（逐个删） |
| Edge 缓存子目录（不动 Default 主目录） | `Remove-Item 'C:\Users\Administrator\AppData\Local\Microsoft\Edge\User Data\Default\Cache\*' -Recurse -Force` 等 9 个子目录（Cache/Code Cache/GPUCache/Service Worker\CacheStorage/File System/Storage\ext/component_crx_cache/GrShaderCache/ProvenanceData） |
| 微信 CDN/Crashpad/WeMeet 缓存 | `Remove-Item 'C:\Users\Administrator\AppData\Roaming\Tencent\WeChat\WeChatFiles\All Users\CDNRobot\*' -Recurse -Force` 等（**不动 FileStorage/Msg/Config/Backup**） |
| WinSxS（DISM） | 见下方 WinSxS 章节 |

**注意：**
- node_modules 长路径问题先用 `cmd /c rmdir /s /q` 尝试，不行再用 PowerShell 逐个删
- 删除后验证释放空间：`Get-PSDrive C | %{ $_.Free/1GB }`

### 5️⃣ 报告结果

输出清理前后对比：
```
操作前: X.X GB 可用
清理完成 ✅
↳ 删 xxx: +X.X GB
↳ 清 xxx: +XX MB
操作后: XX.X GB 可用
```

## 安全提示

- ⚠️ 休眠文件 (`powercfg -h off`) 不进常规清理列表，兄弟明确要求才做

## 🛠️ WinSxS 清理（兄弟要求时）

兄弟问"清理 WinSxS"或"C 盘为什么还有 90 GB"时触发。

### 分析能清多少（不实际删）

```powershell
DISM /Online /Cleanup-Image /AnalyzeComponentStore
# 看 "备份和已停用功能" 项大小 = 可回收量
# 注：日志是 GBK 中文乱码，直接看末尾百分比到 100% 后即可读关键数据
```

### 实际清理

```powershell
DISM /Online /Cleanup-Image /StartComponentCleanup
DISM /Online /Cleanup-Image /SPSuperseded
```

### 🚨 DISM 报错 6824

```
Error: 6824
The operation cannot be performed because another transaction is depending
on the fact that this property will not change.
```

**原因**：TiWorker / TrustedInstaller 在跑（Windows Update 后台），DISM 需要独占事务被拒。
**处理**：别杀 TiWorker（会坏系统更新状态）→ **等下次开机** 或 **写个 startup 任务**（任务计划程序 → 触发器"登录时" → 操作 `DISM /Online /Cleanup-Image /StartComponentCleanup`）

## 🛠️ 全盘扫描（兄弟问"还有哪些可以清理"时）

兄弟问"C 盘为什么还这么大 / 哪些应用可以卸"时跑，按大小排序各 Program Files：

```powershell
# C 盘总览
$c = Get-PSDrive C
Write-Host ("C: 总 {0:N1} GB, 已用 {1:N1} GB, 可用 {2:N1} GB" -f ($c.Used+$c.Free)/1GB, $c.Used/1GB, $c.Free/1GB)

# Program Files / (x86) 顶层大小（用 Get-ChildItem 不用 du，du 的 stderr 会被吞）
Get-ChildItem 'C:\Program Files' -Directory -Force | ForEach-Object {
  $b = (Get-ChildItem $_.FullName -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object { -not $_.PSIsContainer } |
    Measure-Object -Property Length -Sum).Sum
  [pscustomobject]@{ SizeMB = [math]::Round($b/1MB,0); Name = $_.Name }
} | Sort-Object SizeMB -Descending

# ProgramData 同理
```

### 输出模板（告诉兄弟）

```
🟢 安全可卸: X GB
🟡 视使用频率: Y GB
🔴 私产/聊天记录/必须确认: Z GB
```

**典型可卸候选**（不认识的 echo/Enterbrain/MasterPDF 等 `0 MB` 的空目录优先清），实际要不要卸让兄弟自己走"设置 → 应用"。

## 📊 实战沉淀数据（2026-08-19）

兄弟机器实测：C 盘 100 GB，初始 4.7 GB 可用（危险），清理后 10.24 GB 可用，**释放 5.5 GB**。

清理明细：
| 类别 | 大小 |
|---|---|
| Temp (pw-/jest/playwright) | 1.95 GB |
| .local\share (uv/pip) | 2.30 GB |
| .openclaw-multica\llama-cpp-provider | 1.47 GB |
| 6 个软件升级器/残留 | 1.35 GB |
| 微信/WeMeet 缓存(不动聊天) | ~500 MB |
| Edge 缓存子目录 | ~400 MB |
| OpenCode packages + npm-cache | 1.81 GB |
| .openclaw\tmp | 92 MB |
