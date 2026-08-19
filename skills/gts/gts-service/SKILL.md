---
name: "gts-service"
description: "兄弟说「启动服务」「重启服务」「停止服务」时触发。按顺序管理 room/match/webpack 服务。重启room后必须重启match。"
---

# 服务管理 Skill

> 触发词：`启动服务` / `重启服务` / `停止服务`。
> 一键管理 GTS-Play 前后端服务。

---

## 步骤

### 启动服务

```
1. cd D:\Github\GTS-Play\packages\room-service && yarn dev (port 4003)
2. cd D:\Github\GTS-Play\packages\match-service && yarn dev (port 3000)
3. cd D:\Github\GTS-Play\packages\frontend-multiplayer && yarn webpack:dev-server (multiplayer webpack)
```

- 先 room（4003），再 match（3000），match 依赖 room
- 启动命令用 `yarn dev`（tsrpc-cli dev），webpack 用 `yarn webpack:dev-server`
- webpack-dev-server 只在修改了前端 webpack 配置时才需要重启

### 重启服务

- 先 kill 现有 room/match 进程（webpack 无需重启则保留）
- 再走启动流程
- **改 logic 后重启 room-service 时，必须同时重启 match-service**（room 重启会断开 match 的 WS 连接）
- **改 webpack 配置后**：重启 webpack-dev-server

### 停止服务

- kill room-service、match-service、webpack-dev-server 进程

### 测试后重启

- 重启 room + match 清除脏数据

---

## 执行纪律

1. 启动/重启按顺序来，不并行
2. 用 `yarn dev`，不是 `npx ts-node`；webpack 用 `yarn webpack:dev-server`
3. webpack-dev-server 无配置改动时不重启
4. 改 node_modules 必须先问兄弟
5. **禁止重启 Gateway**：重启/停止服务时只操作 room-service、match-service、webpack-dev-server，不能杀 gateway 进程
6. 停止服务时精确 kill 对应 PID，不用 `Get-Process node | Stop-Process` 这种全杀命令
7. **重启 room-service 后必须跟着重启 match-service**（room 重启会断开 match 的 WS 连接，match 不会自动重连）
