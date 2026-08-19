---
name: "gts-deploy-standalone"
description: "部署单机项目（packages/frontend）到 CloudBase 静态托管。默认 publish_demo_static；mods/、asset-lib/ 有新增内容时用 publish_demo。🔴 线上环境有玩家使用，部署前必须兄弟确认"
---

# gts-deploy-standalone — 单机项目部署 Skill

## 触发词
- `部署单机`
- `deploy standalone`
- `deploy demo`
- `publish_demo`
- `publish_demo_static`

## 🔴🔴🔴 核心规则

### 规则1：部署前必须兄弟确认（线上环境）
- **单机项目是线上环境，有玩家在使用**
- 无论什么情况，部署前**必须先问兄弟、等兄弟确认**，禁止自作主张直接部署
- 确认话术：「单机是线上环境，确认部署？(yarn publish_demo_static / publish_demo)」
- 兄弟没明确回复「部署/确认」→ 不执行

### 规则2：部署方式二选一（从改动内容判断，不询问）

| 改动内容 | 部署命令 |
|---------|---------|
| 只改了 frontend 代码（默认情况） | `yarn publish_demo_static` |
| **`mods/`、`asset-lib/` 有新增内容** | `yarn publish_demo` |

判断依据：
- `git status` 看是否有 `mods/`、`asset-lib/` 下的新增/修改文件
- 只改 `packages/frontend/` → `publish_demo_static`
- `mods/` 或 `asset-lib/` 有新增 → `publish_demo`（会更新平台代码，含 mods/asset-lib 相关资源）

### 规则3：Clash 必须规则模式
CloudBase 在 Clash 全局模式下不可用。部署前确认：

```powershell
$script = "$env:USERPROFILE\D:\Github\GTS-Play\scripts\clash-proxy-manager.ps1"
& $script -Mode rule
```

### 规则4：🔴 上传前必须关闭 Clash 代理（2026-08-08 兄弟实测）
- **批量上传（update_platform_code_static，479 文件）时，Clash 代理开着会超时失败**（`[object Object]` error after ~2.5min）
- 兄弟实测：**关掉 Clash 代理后直连腾讯云最快**，上传秒完
- 正确流程：
  1. 部署前：**退出 Clash**（或关系统代理）→ 直连
  2. 执行部署（`yarn publish_demo_static_test` / `publish_demo`）
  3. 部署完成：**恢复 Clash**（重新打开）
- ⚠️ 其他需要代理的操作（GitHub pull 等）不受影响，各自独立管理
- 2026-08-08 踩坑：16:50/17:31/17:35/17:40 四次 `publish_demo_static_test` 全部在 update_platform_code_static 超时失败（`[object Object]`，2.5min+），单文件上传正常 → 实锤是批量上传被代理拖垮

### 规则5：部署上传失败重试纪律
- 若 `update_platform_code_static` 失败（`[object Object]`）→ 先检查 Clash 是否开着（规则4）
- 关闭代理后重试即可，不要反复重试同一状态

---

## 部署流程

### Step 1: 确认部署
1. 检查改动：`git status` + `git diff --stat`（判断是否需要 `publish_demo`）
2. 向兄弟确认（规则1），说明用哪个命令
3. 兄弟确认后才继续

### Step 2: 设置 Clash 规则模式
```powershell
$script = "$env:USERPROFILE\D:\Github\GTS-Play\scripts\clash-proxy-manager.ps1"
& $script -Mode rule
```

### Step 3: 执行部署

```bash
cd D:\Github\GTS-Play\packages\meta3d-platform-publish

# 默认（只改 frontend 代码）
yarn publish_demo_static

# mods/ 或 asset-lib/ 有新增内容时
yarn publish_demo
```

gulp task 自动完成（publish_demo_static）：
1. `not_mark_test` — 非测试标记
2. `update_config` — 设置生产配置
3. `build` — webpack 构建 frontend
4. `delete_platform_code_static` — 删除 CloudBase 旧静态文件
5. `update_platform_code_static` — 上传新静态文件
6. `update_system` — 更新系统文件
7. `commit` — 自动提交

publish_demo 额外包含：
- `delete_platform_code` + `update_platform_code`（更新完整平台代码，覆盖 mods/、asset-lib/ 等资源）

### Step 4: 验证部署
- **检查 exit code**：gulp task exit code = 0 才算成功
- **检查构建**：无 webpack 编译错误
- **检查上传**：`update_*_code_static` 成功
- 快速验证：问兄弟是否需要打开浏览器确认

### Step 5: 通知结果
- 桌面通知：`msg * "单机部署成功"`（或失败原因）
- 提醒兄弟强制刷新浏览器（Ctrl+Shift+R）

## 注意事项
- 部署在 `D:\Github\GTS-Play\packages\meta3d-platform-publish` 目录执行（不是 packages/frontend）
- 🔴 部署前必须兄弟确认（线上有玩家，规则1）
- 🔴 `mods/`、`asset-lib/` 有新增 → 必须用 `publish_demo`，不能用 `publish_demo_static`（否则新资源不会上线）
- 构建时 `dist/` 可能被锁（EBUSY）→ 换输出目录构建
- CloudBase 环境：`meta3d-local-9gacdhjl439cff76`
- 部署失败 → 汇报错误信息，问兄弟是否调度 OpenCode 修复

## 参考
- gulpfile：`packages/meta3d-platform-publish/gulpfile.js`
- 发布脚本：`packages/meta3d-platform-publish/scripts/publish.js`
