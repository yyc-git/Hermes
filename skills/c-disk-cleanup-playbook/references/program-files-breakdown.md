# Program Files 应用级清单（2026-08-19 实扫）

兄弟问"哪些应用可以卸"时调此清单 + `references/scan-c-drive.ps1` 实时复核。

## Program Files（主，64-bit 应用）

| 应用 | 大小 | 状态 | 备注 |
|---|---|---|---|
| **Tencent** | 1.09 GB | 🔴 在用 | 微信/QQ 本体 |
| **WindowsApps** | 770 MB | 🔒 系统 | Microsoft Store 应用 |
| **Google** (Chrome) | 501 MB | 🔴 在用 | 主浏览器 |
| **draw.io** | 399 MB | 🟡 可选 | 流程图工具，问兄弟频率 |
| **Mozilla Firefox** | 330 MB | 🟡 可选 | 备用浏览器，问兄弟用不用 |
| **PowerShell** | 273 MB | 🔴 Hermes 用 | pwsh 7 |
| **NVIDIA Corporation** | 181 MB | 🔴 显卡驱动 | 别动 |
| **Common Files** | 179 MB | 🔴 共享组件 | 别动 |
| **ImageMagick-7.1.2-Q16-HDRI** | 61 MB | 🟡 可选 | CLI 图像处理，问兄弟 |
| **Realtek** | 46 MB | 🔴 声卡驱动 | 别动 |
| **Reference Assemblies** | 35 MB | 🔴 .NET | 别动 |
| **DesktopClient** | 16 MB | ❓ 不认识 | 可能是某个云盘客户端 |
| **ASUS** | 3 MB | 🔴 主板工具 | 别动 |
| **scoped_dir\*** (几百个) | 0 MB | 🔒 系统 | Windows 应用沙盒残留，DISM 清 |

## Program Files (x86)（32-bit 应用）

| 应用 | 大小 | 状态 | 备注 |
|---|---|---|---|
| **Microsoft** | 3.85 GB | 🟡 | 含 Edge/OneDrive/Skype 等 MS 系，可单独检查 |
| **Git** | 794 MB | 🔴 Hermes/OpenCode 用 | 别动 |
| **Google** (x86) | 531 MB | 🟡 | 跟主 Chrome 重叠？检查是不是 Chrome x86 旧版 |
| **EasyShare** | 456 MB | 🟡 | 联想一键恢复，问兄弟还做不做系统恢复 |
| **letsvpn** | 117 MB | 🟡 | VPN，问兄弟还续不续费 |
| **EchoFindSearch** | 47 MB | ❓ | 不认识，可能是浏览器劫持或推广软件，**先查**再决定 |
| **Enterbrain** | 20 MB | ❓ | RPG Maker 相关，问兄弟玩不玩 |
| **Tencent** (x86) | 14 MB | 🔴 微信用 | 别动 |
| **Kingsoft** | 1 MB | 🟡 | WPS 残留，问兄弟用 WPS 还是 Office |
| **MasterPDF** | 0 MB | 🟢 可卸 | PDF 工具 |
| **Chromebrowser** | 0 MB | 🟢 可卸 | 可能是 Chrome 卸载器残留 |
| **oioi11 / SysCeo / wincompress** | 0 MB | 🟢 可卸 | 不认识，看名字像 PUP |
| **InstallShield Installation Information** | 6 MB | 🔴 系统 | 安装器残留，**别手动删** |

## 走卸载的标准流程

**绝不**直接 `Remove-Item C:\Program Files\XXX` —— 那样会留注册表/服务/计划任务残留。

正确姿势：
1. **设置 → 应用 → 已安装的应用**（Win10/11）
2. 找到目标应用 → 点 ⋯ → 卸载
3. 卸完再扫一遍 `C:\Program Files` 看是否还有残留子目录
4. 再扫 `C:\ProgramData` 和 `AppData\Local` 看是否还有 app data 残留

WinSxS（Windows 更新备份）通常占 5-10 GB，可用 admin 跑：
```
DISM /Online /Cleanup-Image /SPSuperseded
DISM /Online /Cleanup-Image /StartComponentCleanup
```
**兄弟明确要求才做**（有破坏性，失败可能需要重装）。