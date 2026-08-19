---
name: "gts-test"
description: "运行GTS-Play SCF服务端部署验证BDD测试（scf-api/room1/room2/match1/all）"
---

# gts-test — 测试 SCF 服务端部署状态

## 触发词
- `测试服务端`
- `跑测试`
- `test`
- `验证部署`

## 前置条件
- 工作目录：`D:\Github\GTS-Play\packages\meta3d-platform-publish`
- 测试框架：jest-cucumber（BDD），7 个测试场景
- 测试对象：线上 SCF 服务（不涉及本地服务重启）
- 连接方式：直接调 SCF API + HTTP + WebSocket

## 流程

### Step 1: 问兄弟测试目标
> 测试哪个？scf-api / room1 / room2 / match1 / all

| 目标 | jest --testNamePattern | 覆盖场景 |
|------|----------------------|----------|
| scf-api | `SCF API` | 场景1：API 连通性 + 认证 |
| match1 | `match1` | 场景2：函数状态；场景3：HTTP 响应 |
| room1 | `room1` | 场景4：函数状态+WS支持；场景6：WS连接 |
| room2 | `room2` | 场景5：函数状态+WS支持；场景7：WS连接 |
| all | 不设过滤 | 全部7个场景 |

### Step 2: 执行测试
```bash
# 全部测试
yarn test -- --forceExit

# 按目标过滤
yarn test -- --testNamePattern "room1" --forceExit
yarn test -- --testNamePattern "match1" --forceExit
yarn test -- --testNamePattern "SCF API" --forceExit  # 注意空格
```

### Step 3: 分析结果
解析 jest 输出，给出摘要报告：

```
✅ 全部通过（N/N）
❌ N 个失败

失败详情：
- "room1 function is Active with WebSocket support" ❌
  原因：SCF API 返回 status=Offline
  建议：检查 room1 函数是否被误停用，重新部署
```

### Step 4: 通知兄弟
- **双通道通知**：桌面消息 + 飞书通知（≤10字）
- 告知测试结论：通过/失败 及关键信息
- 如有失败，问兄弟是否修复（调度 OpenCode 分析处理）

## 注意事项
- 测试线上服务，**不需要重启任何本地服务**
- 测试脚本中可能包含 API 密钥（SECRET_ID / SECRET_KEY），不要在日志中泄露
- WebSocket 测试场景（场景6、7）可能耗时较长（默认 15 秒超时）
- 如所有场景都失败，检查网络/API 密钥是否有效
- 如某服务 503/超时，可能是该 SCF 函数被冻结（冷启动需要时间），重试即可

## 参考
- feature 文件：`test/features/scf-deploy.feature`
- step 定义：`test/step-definitions/scf-deploy.steps.ts`
- jest 配置：`jest.json`（ts-jest 转换器）
- 生产 URL：
  - match: `https://1302358347-392p0efafm.ap-shanghai.tencentscf.com`
  - room1: `wss://1302358347-75c0pmliik.ap-shanghai.tencentscf.com`
  - room2: `wss://1302358347-ezkijqoed2.ap-shanghai.tencentscf.com`
