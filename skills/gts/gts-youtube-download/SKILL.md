---
name: gts-youtube-download
description: "下载 YouTube 视频（触发词：下载YouTube/下油管/yt下载）。yt-dlp + 代理 + 反机器人绕过 + cookie 提取 + ffmpeg 合并。"
---

# gts-youtube-download SKILL.md

## 触发词
兄弟说「下载YouTube」「下YouTube视频」「yt下载」「下油管」

## 步骤

### Step 1: 设代理
```powershell
& "$env:USERPROFILE\D:\Github\GTS-Play\scripts\clash-proxy-manager.ps1" -Mode global
$env:HTTPS_PROXY="http://127.0.0.1:7897"
```

### Step 2: 查格式
```powershell
& "$env:TEMP\yt-dlp.exe" -F "URL"
```

### 🔴 Step 2b: 如果被拦截（"Sign in to confirm you're not a bot"）
```powershell
& "$env:TEMP\yt-dlp.exe" --extractor-args "youtube:player_client=android_embedded" -F "URL"
```
`android_embedded` 是 2026-07-27 验证能绕过 bot 检测的客户端。备选：`android`、`web`、`ios`。TV 客户端可能提示 DRM protected。

### Step 3: 下载
```powershell
# 最佳 1080p h.264 + AAC
& "$env:TEMP\yt-dlp.exe" --extractor-args "youtube:player_client=android_embedded" -f "137+140" -o "D:\Downloads\%(title)s.%(ext)s" "URL"
# 或自动最佳
& "$env:TEMP\yt-dlp.exe" --extractor-args "youtube:player_client=android_embedded" -f "bestvideo[height<=?1080]+bestaudio/best[height<=?1080]" -o "D:\Downloads\%(title)s.%(ext)s" "URL"
```

### Step 4: 合并（如果无 ffmpeg 自动合并）
```powershell
& "$env:TEMP\ffmpeg\ffmpeg.exe" -i "video.mp4" -i "audio.m4a" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 "output.mkv" -y
```

### Step 5: 清理 + 恢复代理
```powershell
& "$env:USERPROFILE\D:\Github\GTS-Play\scripts\clash-proxy-manager.ps1" -Mode rule
```

## 🔴 纪律
1. **杀 Chrome 必须先问兄弟同意**，不同意就用 Playwright channel 模式
2. **下完立刻切回 rule 模式**（否则腾讯云/CloudBase 不通）
3. GitHub 下载用 `curl -L` 比 `Invoke-WebRequest` 稳定

## 工具路径
- yt-dlp: `$env:TEMP\yt-dlp.exe`
- ffmpeg: `$env:TEMP\ffmpeg\ffmpeg.exe`
- 下载目录: `D:\Downloads\`
