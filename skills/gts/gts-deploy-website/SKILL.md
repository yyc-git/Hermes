---
name: "gts-deploy-website"
description: "部署官网 (packages/website) 到 CloudBase 静态托管，支持中英文 i18n"
---

# gts-deploy-website — 官网部署 Skill

## 触发词
- `部署官网`
- `deploy website`

## 前置条件
- 工作目录：`D:\Github\GTS-Play\packages\website`
- 部署 via `meta3d-platform-publish` gulpfile 的 `publish_website_demo_static_test` 任务
- CloudBase 环境：`meta3d-local-9gacdhjl439cff76`
- 托管路径：`gts_website/dist/`

## 🔴 代理模式管理

CloudBase 在 Clash 全局模式下无法访问。部署前确认：

```powershell
$script = "$env:USERPROFILE\D:\Github\GTS-Play\scripts\clash-proxy-manager.ps1"
& $script -Mode rule
```

---

## 部署流程

### Step 1: 构建并部署

```bash
cd D:\Github\GTS-Play\packages\meta3d-platform-publish
npx gulp publish_website_demo_static_test
```

gulp task 自动完成：
1. `update_website_config` — 设置生产配置
2. `build_website` — webpack 构建官网（`packages/website`）
3. `fix_website_index_paths` — 修复 index.html 中的资源路径
4. `delete_website_code_static` — 删除 CloudBase `gts_website/dist/` 旧文件
5. `update_website_code_static` — 上传构建产物到 `gts_website/dist/`

### Step 2: 验证部署

- **检查 exit code**：gulp task exit code = 0 才算成功
- **构建产物**：检查是否有 index.html 和 js/css 文件
- **手动验证**：问兄弟是否需要打开浏览器确认

### Step 3: 通知结果

- 桌面通知：`msg * "官网部署完成"`
- 告知中英文访问地址：
  - 中文：`https://meta3d-local-9gacdhjl439cff76-1302358347.tcloudbaseapp.com/gts_website/dist/`
  - 英文：`https://meta3d-local-9gacdhjl439cff76-1302358347.tcloudbaseapp.com/gts_website/dist/?language=en`

## 注意事项

- 官网是 webpack 项目，有完整 i18n 支持
- 中英文通过 URL 参数 `?language=en` 切换
- 部署后通知兄弟强制刷新（Ctrl+Shift+R）
- 构建时 `dist/` 可能被锁 → 换输出目录如 `C:\website_build` 构建
- `packages/website/` 是唯一正确的官网源码位置（`_website-src/` 是废弃的 Docusaurus 源，`D:\Github\GTS-Play-Website*` 也是废弃的独立 Docusaurus 项目）
