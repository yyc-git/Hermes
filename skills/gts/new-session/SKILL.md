---
name: "new-session"
description: "开一个没有父 session 的全新独立会话。webchat 输入 /new 即可触发"
---

# New Session

> 触发词：`/new` / `开新会话` / `新会话`
> 创建一个全新的独立代理会话，没有父 session 继承链。

---

## 原因

当前 webchat 每次开新标签页会继承上一个 session 的 parentKey，形成链式结构：
```
parent → child → grandchild → ...
```
链越长，越容易触发 "session file changed while embedded prompt lock was released" 错误。

## 操作

### 方法 1：CLI 新会话（推荐）

在终端运行：

```powershell
openclaw chat
```

这会启动一个全新的 CLI 聊天会话，独立于所有 webchat session，完全没有 parent session。

### 方法 2：关标签页重启

```powershell
# 关闭所有 webchat 标签页，然后运行：
openclaw gateway restart
```

重启后重新打开 webchat → 全新的根 session，parent 链从 0 开始。

### 方法 3：无痕/隐私窗口

浏览器开无痕窗口访问 webchat 链接，不会继承现有标签页的 cookie/session 状态。
