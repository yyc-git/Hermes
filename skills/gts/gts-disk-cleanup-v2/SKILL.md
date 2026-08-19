---
name: "gts-disk-cleanup-v2"
description: 'C 盘全盘清理 v2 skill: OpenClaw/OpenCode + 浏览器缓存 + 微信 Tencent + 软件升级器 + Hermes 老版残留。兄弟说清理 C 盘/磁盘满了/再看看还能清啥触发。已知 qmd models 不要碰。'
---

# gts-disk-cleanup-v2 — C 盘清理（实战版）

> 兄弟 2026-08-19 实战经验沉淀。**取代** `gts-clean-disk` 在本会话的调用路径 — 但保留老 skill（created_by=None 不删人工 skill）。
>
> 老 skill 漏了 80% 真正大头：Chrome/Edge/Tencent/Desktop/地图资源/各类软件 updater。

## 触发条件

兄弟说以下任意一句就触发：

- "清理 C 盘" / "C 盘快满了" / "磁盘满了"
- "再看看还有啥可清的" / "继续扫" / "还有啥可清的"
- "磁盘清理" / "释放空间"

定向清理（"只清 OpenClaw" / "清 npm 缓存"）不走本 skill，用单条命令。

## 步骤

### 1️⃣ 检查 C 盘空间 + 触发路径判定

```powershell
Get-PSDrive C | Select-Object @{N='TotalGB';E={[math]::Round(($_.Used+$_.Free)/1GB,1)}}, @{N='UsedGB';E={[math]::Round($_.Used/1GB,1)}}, @{N='FreeGB';E={[math]::Round($_.Free/1GB,1)}}
```

如果 `Free < 10 GB` → 自动走"全盘扫"路径（不等兄弟确认）。
如果 `Free >= 10 GB` → 输出一行"还有 X GB 可用，要继续吗？"等兄弟点头。

### 2️⃣ 全盘候选清单扫描（**本 skill 核心**）

🔴 **绝不一次递归扫 Administrator** —— 必超时。**分批**走下面三段命令（每段独立 terminal 调用，互不依赖）：

**A 段 — 用户态可清（OpenClaw/OpenCode/缓存）**（每项 `-Recurse` 但单目录）：

| 路径 | 实测大小(2026-08-19) | 风险 | 说明 |
|------|---------------------|------|------|
| `$env:TEMP` 里的 `pw-*` / `jest` / `playwright_*` | ~1.95 GB | ✅ | Playwright 残留 |
| `C:\Users\Administrator\.openclaw-multica\npm\projects\openclaw-llama-cpp-provider-*` | ~1.47 GB | ✅ | Multica 副本，没用可删 |
| `C:\Users\Administrator\.cache\opencode\packages\*` | ~580 MB | ✅ | 重装自动恢复 |
| `C:\Users\Administrator\AppData\Local\npm-cache\_cacache` | ~482 MB | ✅ | 重装自动恢复 |
| `C:\Users\Administrator\AppData\Local\uv\cache\*` | ~442 MB | ✅ | 重装自动恢复 |
| `C:\Users\Administrator\AppData\Local\pip\cache\*` | ~126 MB | ✅ | 重装自动恢复 |
| `C:\Users\Administrator\.openclaw\tmp\*` | ~92 MB | ✅ | OpenClaw 临时 |
| `C:\Users\Administrator\.openclaw\browser\data\*` | 0 MB | ✅ | 浏览器数据（本机为空） |

**B 段 — 软件升级器残留**（位于 `C:\Users\Administrator\AppData\Local\`，单层扫描，无 `-Recurse`）：

| 路径 | 实测大小 | 风险 | 说明 |
|------|---------|------|------|
| `accurig-updater` | 505 MB | ⚠️ | AcctRIG VMD 动捕软件升级器 |
| `MEGAsync` | 269 MB | ⚠️ | MEGA 网盘同步客户端缓存 |
| `binance-updater` | 222 MB | ⚠️ | 币安桌面升级器 |
| `@multicadesktop-updater` | 167 MB | ⚠️ | Multica Desktop 升级器 |
| `draw.io-updater` | 115 MB | ⚠️ | draw.io 升级器 |
| `cherrystudio-updater` | 108 MB | ⚠️ | Cherry Studio 升级器 |

**C 段 — 浏览器/微信/Tencent**（**默认不动**，但必须列出来让兄弟决定）：

| 路径 | 实测大小 | 风险 | 说明 |
|------|---------|------|------|
| `C:\Users\Administrator\AppData\Local\Google\Chrome\User Data\Default` | 2.12 GB | 🟡 | Chrome 默认 profile（Code Cache/GPU Cache + 登录态，**清会登出**） |
| `C:\Users\Administrator\AppData\Local\Google\Chrome\User Data\extensions_crx_cache` | 71 MB | ✅ | Chrome 扩展缓存 |
| `C:\Users\Administrator\AppData\Local\Microsoft\Edge\User Data\Default` | 465 MB | 🟡 | Edge 默认 profile（同 Chrome） |
| `C:\Users\Administrator\AppData\Local\Microsoft\Edge\User Data\component_crx_cache` | 179 MB | ✅ | Edge 组件缓存 |
| `C:\Users\Administrator\AppData\Roaming\Tencent` | 1.47 GB | 🔴 | **微信聊天记录在这，禁自动清！** |

**D 段 — 用户个人数据 / Hermes 自身**（**🔴 必须兄弟点头才动**）：

| 路径 | 实测大小 | 风险 | 说明 |
|------|---------|------|------|
| `C:\Users\Administrator\Desktop` | 974 MB | 🔴 | 兄弟素材/部署包/视频/zip |
| `C:\Users\Administrator\地图资源` | 1.09 GB | 🔴 | GTS-Play 模型素材 |
| `C:\Users\Administrator\.cache\qmd\models` | 2.15 GB | 🔴 | **Hermes 本地语义搜索 GGUF（embedding+reranker+query），删了断 FTS5 之外的语义搜索** |
| `C:\Users\Administrator\.local` | 2.25 GB | 🔴 | OpenCode/Hermes 状态 |
| `C:\Users\Administrator\.cache`（除 qmd） | 80 MB | 🔴 | Hermes 缓存 |
| `C:\Users\Administrator\v2.0.0-alpha.12临时文件` | 47 MB | ✅ | **Hermes 老版迁移残留 → 可清** |

**E 段 — 其它全局目录**（一次性扫大小，让兄弟决定）：

```powershell
Get-ChildItem 'C:\Users\Administrator' -Directory -Force |
  Where-Object { $_.Name -notin @('.', '..') } |
  ForEach-Object {
    try {
      $b = (Get-ChildItem $_.FullName -Recurse -Depth 2 -ErrorAction SilentlyContinue -Force |
        Where-Object { -not $_.PSIsContainer } |
        Measure-Object -Property Length -Sum).Sum
      [pscustomobject]@{ SizeMB = [math]::Round($b/1MB,1); Name = $_.Name }
    } catch { }
  } | Sort-Object SizeMB -Descending | Format-Table -AutoSize
```

### 3️⃣ 输出格式（**风险分级必带**）

```
📊 C 盘状态: X.X GB / 100 GB 可用
============================================================
🟢 安全可清（合计 ~X.X GB）
  1️⃣  Temp playwright/jest 残留       1.95 GB  ✅
  2️⃣  OpenCode packages 缓存           580 MB  ✅
  ...

🟡 浏览器/Tencent（合计 ~X.X GB，需兄弟确认）
  10️⃣ Chrome Default profile            2.12 GB  ⚠️ 清会登出
  11️⃣ Edge Default profile             465 MB   ⚠️ 清会登出
  12️⃣ Tencent（微信/WeMeet）            1.47 GB  🔴 含聊天记录

🔴 你的个人数据（**禁自动清**，必须你点头）
  13️⃣ Desktop                          974 MB  🔴 素材/部署包
  14️⃣ 地图资源                         1.09 GB 🔴 GTS-Play 模型
  15️⃣ .cache\qmd\models               2.15 GB  🔴 Hermes 本地语义搜索
  16️⃣ v2.0.0-alpha.12临时文件          47 MB   ✅ Hermes 老版残留
============================================================
说编号或「全清」执行清理
```

### 4️⃣ 执行清理命令表

**🟢 安全批量命令**（可一次跑完）：

```powershell
# A 段
Get-ChildItem $env:TEMP -Directory |
  Where-Object { $_.Name -like 'pw-*' -or $_.Name -eq 'jest' -or $_.Name -like 'playwright_*' } |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Remove-Item 'C:\Users\Administrator\.openclaw-multica\npm\projects\openclaw-llama-cpp-provider-*' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item 'C:\Users\Administrator\.cache\opencode\packages\*' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item 'C:\Users\Administrator\AppData\Local\npm-cache\_cacache' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item 'C:\Users\Administrator\AppData\Local\uv\cache\*' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item 'C:\Users\Administrator\AppData\Local\pip\cache\*' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item 'C:\Users\Administrator\.openclaw\tmp\*' -Recurse -Force -ErrorAction SilentlyContinue

# B 段（软件升级器，按兄弟选的清）
Remove-Item 'C:\Users\Administrator\AppData\Local\accurig-updater' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item 'C:\Users\Administrator\AppData\Local\MEGAsync' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item 'C:\Users\Administrator\AppData\Local\binance-updater' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item 'C:\Users\Administrator\AppData\Local\@multicadesktop-updater' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item 'C:\Users\Administrator\AppData\Local\draw.io-updater' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item 'C:\Users\Administrator\AppData\Local\cherrystudio-updater' -Recurse -Force -ErrorAction SilentlyContinue

# D 段可清的（v2.0.0-alpha.12 老版残留）
Remove-Item 'C:\Users\Administrator\v2.0.0-alpha.12临时文件' -Recurse -Force -ErrorAction SilentlyContinue
```

**🟡 浏览器/Tencent 命令（必须兄弟明确说清 X）**：

```powershell
# Chrome Default - 清会登出
Remove-Item 'C:\Users\Administrator\AppData\Local\Google\Chrome\User Data\Default\Cache' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item 'C:\Users\Administrator\AppData\Local\Google\Chrome\User Data\Default\Code Cache' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item 'C:\Users\Administrator\AppData\Local\Google\Chrome\User Data\Default\GPUCache' -Recurse -Force -ErrorAction SilentlyContinue

# Edge 同上
Remove-Item 'C:\Users\Administrator\AppData\Local\Microsoft\Edge\User Data\Default\Cache' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item 'C:\Users\Administrator\AppData\Local\Microsoft\Edge\User Data\Default\Code Cache' -Recurse -Force -ErrorAction SilentlyContinue
```

🔴 **腾讯/微信/Dekstop/地图资源/.cache\qmd — 一律必须兄弟拍板才动**。

### 5️⃣ 报告结果

```
操作前: X.X GB 可用
清理完成 ✅
↳ A 段（缓存/残留）: +X.X GB
↳ B 段（updater）: +X.X GB
操作后: X.X GB 可用
```

## 踩坑 / Pitfalls（实战 2026-08-19 沉淀）

### P1 — `Get-ChildItem -Recurse` 在 `C:\Users\Administrator` 必超时（600s+）
❌ 错误：`Get-ChildItem 'C:\Users\Administrator' -Recurse | Measure ...`
✅ 正确：**分批**扫 + 限定深度（`-Depth 2`）+ 按目录走

### P2 — `du.exe -d N path 2>nul` 会把 du 自己的 stderr 吞了
❌ 错误：`cmd /c 'du.exe -d 1 path 2>nul' > file.txt` → 文件 0 KB
✅ 正确：用 `2>&1` 或者直接重定向到 PS 变量（不绕 nul）：
```powershell
$lines = cmd /c '"C:\Program Files (x86)\Git\usr\bin\du.exe" -d 1 "C:\Users\Administrator\AppData\Local"'
```
（du 输出走 stderr，绕过 `2>nul`）

### P3 — PowerShell `&` 调用符被 `terminal` 误判后台
❌ 错误：`cmd /c 'du.exe path 2>nul' | ForEach-Object { ... }` → `Foreground command uses '&' backgrounding`
✅ 正确：用 `cmd /c` 包起来，PowerShell 调用走变量：
```powershell
cmd /c 'cmd.exe /c "du.exe -d 1 path"' | ForEach-Object { ... }
```
或直接文件重定向：`cmd /c 'du.exe -d 1 path' > out.txt`

### P4 — `Get-PSDrive C` 报告 free space 不立即刷新
PowerShell 的 `Get-PSDrive` 有缓存层，删除后立刻查可能没反映。**插一行 `clear-variable` 或加 sleep 1**：
```powershell
$after = (Get-PSDrive C).Free/1GB  # 偶发不准
# 兜底：fsutil volume diskfree C:
& fsutil volume diskfree C: | Select-String 'Total free'
```

### P5 — 删除后实际释放 < 预期
清 1.95 GB jest/pw 实际只释放 ~300 MB；清 1.47 GB llama-cpp 释放 ~1.47 GB。
差异来自：**`Get-ChildItem -Recurse | Measure Sum` 不计 NTFS 硬链接 / 已删除但仍被句柄持有的文件**。
别在报告里写"释放 X GB"骗自己 — 写 `删除文件: 1.95 GB / 实际可用 +0.3 GB`。

### P6 — 兄弟三大红线（🔴）
1. **Desktop** — 兄弟素材/部署包，清完他找不到东西会拍桌
2. **地图资源** — GTS-Play 模型素材，删了重做几小时
3. **微信 Tencent Roaming** — 聊天记录，清了找不回来

→ 这三项**默认列出来 + 标 🔴 + 等兄弟单独说清 X 才动**。哪怕 Free < 1 GB 也不准自动清。

### P7 — `.cache\qmd\models` 是 Hermes 本地语义搜索依赖
embedding + reranker + query-expansion 三套 GGUF 模型 ~2.15 GB。
**删了会让 `gts-memory-search-v3` 的语义召回断**（FTS5 仍可用）。
不删的兜底路径：用 `qmd pull <model>` 重新下载（约 2.2 GB）。

## 与老 skill 的差异

| 项 | `gts-clean-disk` (老) | `gts-disk-cleanup-v2` (本 skill) |
|----|----------------------|----------------------------------|
| 触发判定 | 无 | 三种措辞分支（全盘/定向/继续） |
| 扫描范围 | 只 OpenClaw/OpenCode | **全盘**（浏览器/Tencent/Desktop/updater/Hermes 老版） |
| 风险分级 | 无 | 🟢🟡🔴 三级（🔴 个人数据禁自动清） |
| 浏览器 | 没列 | Chrome/Edge + 缓存分类（登出风险标注） |
| Tencent | 没列 | 🔴 标红，等单独确认 |
| Desktop/地图资源 | 没列 | 🔴 标红，等单独确认 |
| updater | 没列 | accurig/MEGAsync/binance/Multica/draw.io/cherrystudio |
| Hermes 老版残留 | 没列 | `v2.0.0-alpha.12临时文件` 47 MB |
| 扫盘坑 | 无 | P1-P7 7 条踩坑 |
| 释放空间计算 | 不准 | 标注"删除文件大小 vs 实际可用空间"差异 |

## 引用文件

无（本次会话结束，所有数据已沉淀在 SKILL.md 内）。