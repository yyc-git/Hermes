---
name: "hermes-session-read"
description: "读取 Hermes 自己的历史会话记录（主力=state.db，备选=request_dump JSON）。触发:兄弟说「读取XX会话的记忆/上下文」「那个会话最后做了什么」「恢复上一个会话」。"
tags: [hermes, session, memory, recovery]
---

# hermes-session-read — 读取 Hermes 历史会话记录

## 🔴 数据源优先级（2026-08-19 修正）

**⚠️ dump 文件只在 429 限流时才生成，大多数会话没有 dump！**

| 优先级 | 数据源 | 路径 | 覆盖范围 |
|--------|--------|------|----------|
| **1（主力）** | `state.db` SQLite | `E:\Hermes Agent CN Desktop\data\hermes-home\state.db` | **所有会话**的完整对话历史 |
| 2（备选） | request_dump JSON | `sessions/request_dump_*.json` | 仅 429 限流会话 |

**给会话 ID 查会话 → 先查 state.db，找不到才查 dump 文件。**

## state.db 查询（主力路径）

SQLite3 路径: `C:\sqlite\sqlite3.exe`
DB 路径: `E:\Hermes Agent CN Desktop\data\hermes-home\state.db`

### 表结构

**sessions 表** — 会话元数据:
| 列 | 说明 |
|-----|------|
| `id` | 会话 ID（如 `20260819_104949_b59938`） |
| `title` | 会话标题（skill 触发时的摘要） |
| `model` | 使用的模型 |
| `started_at` / `ended_at` | Unix 时间戳 |
| `message_count` | 消息总数 |

**messages 表** — 完整对话历史:
| 列 | 说明 |
|-----|------|
| `session_id` | 关联 sessions.id |
| `role` | `user` / `assistant` / `tool` |
| `content` | 消息文本 |
| `tool_calls` | assistant 的工具调用 JSON |
| `tool_name` | tool 角色的工具名 |
| `timestamp` | Unix 时间戳 |

### 快速查询模板

```powershell
# 1. 按 session_id 查会话元数据
C:\sqlite\sqlite3.exe "E:\Hermes Agent CN Desktop\data\hermes-home\state.db" `
  "SELECT id, title, model, message_count, datetime(started_at, 'unixepoch', 'localtime') as started FROM sessions WHERE id LIKE '%<关键词>%';"

# 2. 列出最近 N 个会话
C:\sqlite\sqlite3.exe "E:\Hermes Agent CN Desktop\data\hermes-home\state.db" `
  "SELECT id, substr(title, 1, 60) as title, model, datetime(started_at, 'unixepoch', 'localtime') as started FROM sessions ORDER BY started_at DESC LIMIT 20;"

# 3. 提取某会话的所有用户消息
C:\sqlite\sqlite3.exe "E:\Hermes Agent CN Desktop\data\hermes-home\state.db" `
  "SELECT substr(content, 1, 300) as preview FROM messages WHERE session_id='<SESSION_ID>' AND role='user' ORDER BY timestamp ASC;"

# 4. 提取某会话的 assistant 回复（跳过纯 tool 调用）
C:\sqlite\sqlite3.exe "E:\Hermes Agent CN Desktop\data\hermes-home\state.db" `
  "SELECT substr(content, 1, 300) as preview FROM messages WHERE session_id='<SESSION_ID>' AND role='assistant' AND content IS NOT NULL AND length(content) > 10 ORDER BY timestamp ASC;"

# 5. 提取最后 N 条消息（快速看最新状态）
C:\sqlite\sqlite3.exe "E:\Hermes Agent CN Desktop\data\hermes-home\state.db" `
  "SELECT role, substr(content, 1, 200) as preview, datetime(timestamp, 'unixepoch', 'localtime') as time FROM messages WHERE session_id='<SESSION_ID>' ORDER BY timestamp DESC LIMIT 15;"

# 6. FTS 全文搜索（搜关键词找会话）
C:\sqlite\sqlite3.exe "E:\Hermes Agent CN Desktop\data\hermes-home\state.db" `
  "SELECT m.session_id, substr(m.content, 1, 100) FROM messages_fts f JOIN messages m ON f.rowid = m.id WHERE messages_fts MATCH '<关键词>' LIMIT 10;"
```

## dump 文件（备选路径，仅 429 限流会话）

```
E:\Hermes Agent CN Desktop\data\hermes-home\sessions\
```

文件名格式: `request_dump_{session_id}_{retry_timestamp}.json`

- **同一 session_id 可能有多个 dump 文件**（429 限流重试时每个失败请求都 dump 一次）
- **取最新 dump 时间的文件** — 它包含最完整的对话上下文

### dump 文件快速定位

```powershell
# 列出所有 dump（按创建时间排序）
Get-ChildItem "E:\Hermes Agent CN Desktop\data\hermes-home\sessions\request_dump_*.json" |
  Select-Object Name, @{N='SizeKB';E={[math]::Round($_.Length/1KB)}} |
  Sort-Object Name
```

## 文件结构

JSON 格式，顶层字段:

| 字段 | 说明 |
|------|------|
| `timestamp` | dump 时间 |
| `session_id` | Hermes 会话 ID (如 `20260819_085411_353d93`) |
| `reason` | dump 原因 (`max_retries_exhausted` = 429 限流) |
| `request.body.messages` | **完整对话历史** (数组，按时间排序) |
| `error` | 最后一次失败的错误信息 |

## 对话历史结构 (`messages` 数组)

每条 message 的 `role`:

| role | 内容格式 | 说明 |
|------|----------|------|
| `user` | string 或 content 数组 | 用户输入（含 system metadata 如 workspace/model 变更） |
| `assistant` | string 或 content 数组 | bot 回复 + tool_calls |
| `tool` | tool_call_id 匹配 | 工具执行结果 |

assistant 的 `tool_calls` 数组里每项: `{id, type:"function", function:{name, arguments}}`

## 读取策略（文件通常 1-2MB+）

**不要一次性读整个文件**，用分段读取:

```powershell
# 1. 先读最后 500 行（最新进展）
read_file -path "<dump文件>" -offset (<总行数>-500) -limit 500

# 2. 如果需要完整上下文，从头读但分段
read_file -path "<dump文件>" -offset 1 -limit 500     # 初始对话
read_file -path "<dump文件>" -offset 501 -limit 500   # 中间进展
# ...直到最新

# 3. 或用 terminal 的 Select-String 搜索关键内容
Select-String -Path "<dump文件>" -Pattern "step-finish|jacket1|完成" | Select-Object -First 20
```

## 快速提取关键信息的模板

```powershell
# 提取所有 assistant 回复的文本内容（跳过 tool_calls）
$dump = Get-Content "<dump文件>" -Raw | ConvertFrom-Json
$dump.request.body.messages |
  Where-Object { $_.role -eq 'assistant' } |
  ForEach-Object {
    if ($_.content -is [string]) { $_.content }
    elseif ($_.content -is [array]) {
      ($_.content | Where-Object { $_.type -eq 'text' } | ForEach-Object { $_.text }) -join "`n"
    }
  } |
  Select-Object -Last 5  # 最后 5 条 bot 回复 = 最新状态
```

```powershell
# 提取最后一条用户消息（通常包含"继续"或新的指令）
$dump = Get-Content "<dump文件>" -Raw | ConvertFrom-Json
$dump.request.body.messages |
  Where-Object { $_.role -eq 'user' } |
  Select-Object -Last 1 |
  ForEach-Object { if ($_.content -is [string]) { $_.content } else { $_.content[0].text } }
```

## 常见场景

### "读取XX会话的记忆"
1. **先查 state.db**：`SELECT ... FROM sessions WHERE id LIKE '%<XX>%'`
2. 找到 → 提取 assistant 最后几条回复总结当前状态
3. 没找到 → 再查 dump 文件

### "那个会话最后做了什么"
1. **先查 state.db**：提取最后 15 条消息（`ORDER BY timestamp DESC LIMIT 15`）
2. 找 `step-finish` / 最后 tool call / assistant 总结
3. dump 文件是备选

### "恢复上一个会话"
1. **state.db** 定位 + 提取最后状态
2. 提取: 改了哪些文件、卡在哪、下一步是什么
3. 与当前 DB 里 OpenCode session 状态交叉验证

## 注意事项

- **🔴 state.db 包含所有会话的完整历史**，dump 文件只是 429 限流时的快照
- **完整对话历史在 state.db 的 messages 表里**（所有会话都有）
- **OpenCode 调度相关的会话**还有 OpenCode 自己的 DB（`C:\Users\Administrator\.local\share\opencode\opencode.db`），含 session/part 表
- state.db 很大（128MB+），用 `C:\sqlite\sqlite3.exe` 查询，不用整个读文件
