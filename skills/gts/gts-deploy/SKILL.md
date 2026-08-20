---
name: "gts-deploy"
description: "部署GTS-Play服务（room1/room2/match1/frontend/all/room_preproduction/match_preproduction）到SCF或静态托管。E2E通过后自动部署到预发不询问"
---

# gts-deploy — 部署 GTS-Play 服务到线上

## 触发词
- `部署`
- `发布`
- `deploy`
- 本地 E2E 测试通过后自动触发（部署预发，不需要确认）

## 🔴 前置条件

### 代理模式管理

腾讯云 SCF / CloudBase 在 Clash 全局模式下无法访问。**部署前必须确认是「规则」模式。**

```powershell
$script = "$env:USERPROFILE\D:\Github\GTS-Play\scripts\clash-proxy-manager.ps1"
& $script -Mode rule
```

### 工作目录
- 工作目录：`D:\Github\GTS-Play\packages\meta3d-platform-publish`
- 部署到腾讯云 SCF（服务端）或 CloudBase 静态托管（前端）

### 生产 URL
- room1: `wss://1302358347-75c0pmliik.ap-shanghai.tencentscf.com?room-id=1`
- room2: `wss://1302358347-ezkijqoed2.ap-shanghai.tencentscf.com?room-id=2`
- match: `https://1302358347-392p0efafm.ap-shanghai.tencentscf.com`

### 预发 URL
- room_preproduction: `wss://1302358347-5p0tpewnpw.ap-shanghai.tencentscf.com?room-id=-1`
- match_preproduction: `https://1302358347-4k07orqj30.ap-shanghai.tencentscf.com`

## 🔴 规则

### 规则1：不要问部署什么服务
- **从改动文件判断受影响的服务**，不询问兄弟

判断逻辑：

| 改动的目录 | 必须部署的服务（生产） | 预发部署 |
|-----------|----------------------|---------|
| `packages/room-service/` | room1 + room2 | room_preproduction |
| `packages/match-service/` | match1 | match_preproduction |
| `packages/frontend-multiplayer/` | frontend | frontend（预发目录） |
| `packages/logic/` | room1 + room2 + match1 | room_preproduction + match_preproduction |

**只部署受影响的**，不多部署不必要的。

### 🔴 规则2：E2E 通过后自动部署到预发，不问兄弟

本地 E2E 测试通过后，**立即自动部署到预发环境**，不再问兄弟「要不要部署」。

- 流程：E2E 全绿 ✅ → 自动进入预发部署流程
- 部署目标：`room_preproduction` + `match_preproduction` + 预发前端（若改动了前端代码）
- 部署完成后发桌面通知告知结果
- 若部署失败 → 报错并问兄弟是否要修
- 此规则优先于 Step 2 的「等兄弟确认」（自动触发时跳过 Step 2）

## 流程

### Step 1: 判断部署目标
> 不询问，自动判断。

区分：
- **生产部署**：兄弟明确说「部署生产」「部署线上」「发布到生产」
- **预发部署**：兄弟说「部署预发」「deploy preproduction」或 E2E 通过后自动触发

### Step 2: 确认部署（仅手动触发时执行）
- 当兄弟明确说「部署」「发布」「deploy」时 → 判断是生产还是预发：
  - 如果兄弟没说预发 → 默认生产部署，询问「部署生产还是预发？」
  - 如果说了预发 → 直接部署预发不询问
- 当自动触发时（E2E 通过后）→ **跳过此步，自动部署预发**
- **双通道通知**：桌面消息 + 飞书通知（≤10字）

### Step 3: 按目标执行

#### 🔴 代理模式

部署到腾讯云 SCF/CloudBase，Clash 必须是**规则**模式：

```powershell
& $script -Mode rule
```

#### 生产部署（room1 / room2 / match1）
```bash
# room1
yarn deploy_room1

# room2
yarn deploy_room2

# match1
yarn deploy_match1
```

`deploy-scf.js` 自动做：
1. 读取桌面上的对应 zip 文件
2. base64 编码后调用 SCF `CreateFunction`/`UpdateFunctionCode` API
3. 等待函数状态变为 Active
4. 调用 `UpdateFunctionConfiguration` 设置并发/超时/内存等

#### 预发部署（room_preproduction / match_preproduction）
```bash
# 部署预发服务（并行）
yarn deploy_preproduction

# 或单独部署
yarn deploy_room_preproduction
yarn deploy_match_preproduction
```

#### 前端部署（生产）
```bash
yarn publish_multiplayer_demo_static_test
```

gulp task 自动执行：
1. `update_multiplayer_config` — 设置 `Config.ts` 为生产环境
2. `build_multiplayer_test` — webpack 构建前端
3. `delete_multiplayer_code_static` — 删除 CloudBase 旧文件
4. `update_multiplayer_code_static` — 上传到 `gts_multiplayer/dist/`

#### 前端部署（预发）
```bash
yarn publish_multiplayer_preproduction_demo_static_test
```

gulp task 自动执行：
1. `update_multiplayer_preproduction_config` — 设置 `Config.ts` 为 `environment: "preproduction"`
2. `build_multiplayer_test` — webpack 构建前端
3. `fix_multiplayer_index_paths` — 修复 index 路径
4. `delete_multiplayer_preproduction_code_static` — 删除 CloudBase 旧文件
5. `update_multiplayer_preproduction_code_static` — 上传到 `gts_multiplayer_preproduction/dist/`

### Step 4: 验证部署

#### 服务端验证
- **检查 exit code**：gulp task exit code = 0 才算成功
- **检查 SCF 状态**：确认函数状态为 Active
- **检查错误输出**：如果有 stderr，分析错误原因，给处理方案

#### 前端验证
- **检查 webpack 构建**：exit code = 0，无编译错误
- **检查上传**：`update_*_code_static` 成功
- **快速验证**：问兄弟是否需要在浏览器打开确认

### Step 5: 通知结果
- **桌面通知**（必须）：`msg * "<30字摘要>"`
- **飞书通知**（可选）：channel=feishu，≤10字
- 告知部署成功/失败、验证结论

## 注意事项
- 部署前无需重启任何服务（SCF 部署新版本后自动切换）
- 预发和生产的 SCF 函数完全独立，互不影响
- 部署预发后如需验证，跑 BDD + E2E（`--env preproduction`）
- 部署失败 → 汇报错误信息，问兄弟是否调度 OpenCode 修复
- 🔴 不询问兄弟部署什么服务，从改动文件自动判断
- 🔴 E2E 通过后自动部署预发，不询问确认（2026-07-16 修订）

## 参考
- gulpfile：`packages/meta3d-platform-publish/gulpfile.js`
- 部署脚本：`packages/meta3d-platform-publish/scripts/deploy-scf.js`
- 配置参考：`frontend-multiplayer/src/logic_layer/MultiplayerUrlConfig.ts`
