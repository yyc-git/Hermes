---
name: "gts-stop"
description: "停止当前一切操作（E2E/服务/OpenCode等），等待兄弟确认"
---

# 停止协议

> 触发词：兄弟说「停下来」「停下」「停止」「stop」「停一下」「等我确认」「先停一下」

## 要求

兄弟喊停时必须立刻停止一切正在执行的操作。

### Step 1：停掉后台任务

1. 如果有正在跑的 E2E 测试 → `process(action=kill, sessionId=<id>)` 杀掉
2. 如果有正在跑的服务/脚本 → `process(action=kill, sessionId=<id>)` 杀掉
4. 不要自己主动重启任何东西

### Step 2：清理残留进程

1. 检查 playwright chrome 残留：`Get-Process | Where-Object { $_.ProcessName -eq 'chrome' -and $_.CommandLine -match 'playwright' }`
2. 如有残留 → `Stop-Process -Force`
3. 如有启动的服务进程（room-service/match-service 等），询问兄弟是否需要保留

### Step 3：告知兄弟已停

- 简单说「已停好 + 清理情况」
- 不追问原因
- 等兄弟下一步指示

## 执行纪律

1. **优先级最高** — 兄弟说停就停，不需要问原因
2. **不要自作主张** — 停了就是停了，不要自己判断「我觉得还能继续」
3. **确保干净** — 不要留后台进程跑着不管
