---
name: "opencode-echo-only-detection"
description: "检测 OpenCode agent '复读'模式（echo-only）：读 brief 但不调工具，零文件改动。触发:dispatch 后 part 表只有 text 事件无 tool/patch/bash。"
tags: [opencode, debugging, pitfall]
---

# opencode-echo-only-detection — Agent 复读模式检测

## 症状
wait 退出后查 part 表，agent 只输出了 brief 文本的 echo（`type: text` + `synthetic: true`），没有任何 `tool` / `patch` / `bash` 调用 → 零文件改动。

## 与 LLM 静默失败的区别
| 特征 | LLM 静默失败（exit 4） | Agent 复读（echo-only） |
|------|----------------------|----------------------|
| part 表最后事件 | `step-finish reason=unknown` + tokens=0 | `text`（只有 brief echo） |
| tokens | 全 0 | 非 0（agent 读了 brief 但没动手） |
| 文件改动 | 无 | 无 |

## 触发条件（2026-08-20 实测 3 种场景）
1. **OpenCode server 刚重启**：冷启动后第一个 session 容易复读
2. **模型切换后**：从 A 模型切到 B 模型，B 模型首个 session 可能复读
3. **brief 通过 inline 传参而非 --file**：agent 收到内联文本后只 echo

## 检测命令
```powershell
# 查 part 表事件类型分布
C:\sqlite\sqlite3.exe opencode.db "SELECT type, count(*) as cnt FROM part WHERE session_id='<sid>' GROUP BY type;"
# 全是 text/file = 复读；有 tool/patch/bash = 正常
```

## 处置
1. 确认复读 → 不需 stop/delete（session 已自然结束）
2. 重新 dispatch（同模型，复读是概率性的，重试通常能过）
3. 连续 2 次复读 → 换模型
4. 换模型也复读 → 检查 brief 内容（过长/编码/server 状态）
