---
name: "gts-deploy-forum"
description: "🔴 独立 skill — 只部署论坛（forum）到 CloudBase 静态托管，不涉及其他服务"
---

# gts-deploy-forum — 论坛独立部署

## 🔴 核心规则

### 规则1：本 skill 只部署 forum，不碰其他服务

**这是独立的论坛 deployment skill，和 gts-deploy 完全分开。**

- 用户说「部署全部」「部署论坛」「deploy forum」= 走本 skill
- **绝对不准触发 `gts-deploy` 的 `deploy_all` 或其他服务的部署（room/match/frontend）**
- 只执行：forum yarn build → cloudbase hosting deploy

### 规则2：🔴🔴🔴🔴🔴★ 默认不碰CloudBase文档数据库集合
- ⚠️ 「DB」= **CloudBase 文档型数据库的集合（collections）**，不是传统 SQL
- 修改论坛项目的 CloudBase 后端代码时，**默认不操作 CloudBase 文档数据库集合**
- 任何涉及 collections 的操作（增删改查集合、修改文档、数据迁移等），无论是否全自动，**必须先问兄弟确认**
- 违反后果：写错线上数据、搞垮服务

### 规则3：论坛只有生产环境，不问兄弟

- forum **无预发环境**，部署即线上
- 用户说「部署论坛」→ 默认生产部署 **不问「生产还是预发」**

## 部署步骤

### Step 1: 确认 Clash 模式

CloudBase 在 Clash 全局模式下不可用，部署前确认是**规则**模式：

```powershell
$script = "$env:USERPROFILE\D:\Github\GTS-Play\scripts\clash-proxy-manager.ps1"
& $script -Mode rule
```

### Step 2: 构建论坛

```bash
cd D:\Github\GTS-Play\packages\forum
yarn build
```

### Step 3: 部署到 CloudBase

```bash
cloudbase hosting deploy dist/ gts_forum/dist --envId meta3d-local-9gacdhjl439cff76
```

### Step 4: 通知结果

- 桌面通知：`msg * "论坛部署成功"`
- 提醒兄弟强制刷新浏览器（Ctrl+Shift+R）

## 注意事项

- 如果构建时 `dist/` 目录被锁（EBUSY），换个输出目录如 `C:\forum_build` 构建
- CloudBase CLI 已安装，命令名 `cloudbase`
- **🔴 禁止触发 gts-deploy 的任何功能**
