---
name: "gts-cloudbase-collection"
description: "创建CloudBase TDS集合（生产+本地+预发），提示手动设置安全规则"
---

# gts-cloudbase-collection — 创建 CloudBase TDS 集合

## 触发词

兄弟说以下之一时触发：
- `创建集合`
- `create collection`
- `加集合`
- `新增集合`
- 任何需要新建 CloudBase TDS 集合的场景

涉及依赖操作时（如装包），必须先调用 `skills/gts-yarn-bootstrap/SKILL.md`。

## 🔴 纪律

1. **安全规则无法通过 CLI/SDK 设置** — 创建后只能去 CloudBase 控制台手动设置（见下方教训）
2. **涉及 npm install 必须先走 gts-yarn-bootstrap** — 禁止直接 npm install
3. **创建前先确认集合是否已存在** — 避免重复创建报错

## 前置条件

- 项目路径：`D:\Github\GTS-Play`
- 凭证来源：`packages/meta3d-platform-publish/src/cloudbase-host/CloudbaseHostService.ts` 的 `getLocalEnvData()`
- 依赖：`@cloudbase/node-sdk`（已在 `packages/meta3d-platform-publish/node_modules/` 中存在），`@cloudbase/manager-node`（已在根 `node_modules/` 中存在）

## 标准步骤

### 1️⃣ 确认集合名称和范围

确定集合的基础名（如 `forum_subscriptions`），并按环境确认：

| 环境 | 后缀 | 示例 |
|------|------|------|
| 生产（默认） | 无 | `forum_subscriptions` |
| 本地开发 | `_local` | `forum_subscriptions_local` |
| 预发（如有） | `_preproduction` | `forum_subscriptions_preproduction` |

本地开发集合后缀约定见 `packages/forum/src/api/config.ts` 的 `getCollectionName()` 函数。

### 2️⃣ 创建集合

使用 `@cloudbase/node-sdk` 创建集合（已测试验证可行）：

```javascript
// 🔴 从 meta3d-platform-publish 源文件提取完整凭证（不要用显示截断的 AKIDdL…lhcM）
// 源文件：packages/meta3d-platform-publish/src/cloudbase-host/CloudbaseHostService.ts → getLocalEnvData()
// 实际值包含完整字符，不是带 … 的版本
const tcb = require('@cloudbase/node-sdk');
const app = tcb.init({
  secretId: '<YOUR_TENCENT_SECRET_ID>',
  secretKey: '<YOUR_TENCENT_SECRET_KEY>',
  env: envId
});
const db = app.database();

// 逐个创建（主库 + _local + _preproduction）
for (const name of names) {
  try {
    await db.createCollection(name);
    console.log(`✓ ${name} 创建成功`);
  } catch(e) {
    if (e.message?.includes('exist') || e.code === 'OperationDenied.CollectionExists') {
      console.log(`- ${name} 已存在，跳过`);
    } else {
      console.error(`✗ ${name} 创建失败:`, e.message);
    }
  }
}
```

如果 `@cloudbase/node-sdk` 未在项目根安装，先走 `gts-yarn-bootstrap` 在对应 package 中安装。

### 3️⃣ 提示手动设置安全规则

创建完成后，输出提示列表，让兄弟去 CloudBase 控制台设置安全规则：

```
⚠️ 集合已创建，请前往 CloudBase 控制台设置安全规则：

  1. 打开 https://console.cloud.tencent.com/tcb/db/index?envId=<envId>
  2. 对以下集合分别设置 → 安全规则：

  ┌──────────────────────────────────────┬──────────────────────────────┐
  │ 集合名称                             │ 建议安全规则                 │
  ├──────────────────────────────────────┼──────────────────────────────┤
  │ <集合名>                             │ {"read": true, "write": true}│
  │ <集合名_local>                       │ {"read": true, "write": true}│
  │ <集合名_preproduction>               │ {"read": true, "write": true}│
  └──────────────────────────────────────┴──────────────────────────────┘
```

### 4️⃣ 验证集合是否可用

创建 + 设权限后，通过 `@cloudbase/manager-node` 验证：

```javascript
const { CloudService } = require('@cloudbase/manager-node/lib/utils/cloud-api-request');
const tcb = new CloudService(context, 'tcb', '2018-06-08');
const desc = await tcb.request('DescribeDatabaseACL', {
  EnvId: envId,
  CollectionName: name
});
// 检查 desc.AclTag 和 desc.Rule
```

验证规则是否符合预期。

## 📣 教训记录（2026-07-30）

### 背景
兄弟想为 `forum_subscriptions` 集合设置 `{ "read": true, "write": true }` 权限。

### 踩坑过程
1. **CloudBase CLI v2.8.25** — 没有 `permission` 命令
2. **CloudBase CLI v3.x `tcb permission set`** — 命令已废弃，提示 "不再执行实际操作"
3. **`@cloudbase/manager-node` 的 `ModifyDatabaseACL`** — 支持改 `AclTag`（READONLY/ADMINONLY/CUSTOM）但不接受 `Rule` 参数
4. **`flexdb.UpdateTable`** — 同样不支持 `SecurityRule` 参数
5. **`@cloudbase/manager-node` 的 `cloudBaseRequest` 管理 API** — 通过 `tcb-api.tencentcloudapi.com/admin` 发起的请求，已验证 `SetCollectionSecurityRule`、`ModifyDatabaseACL` 等 action 存在（返回 `SIGN_PARAM_INVALID` 而非 `INVALID_ACTION`），但 `cloudBaseRequest` 的签名机制与这些 action 不兼容，始终返回 `INVALID_ACTION`
6. **结局**：NoSQL 集合安全规则只能通过 CloudBase 控制台网页 UI 设置

### 结论
- CloudBase TDS（NoSQL）集合的安全规则**没有可用的 CLI/SDK API** 进行编程式设置
- 唯一方式：CloudBase 控制台 → 数据库 → 安全规则
- `tcb permission set`、`ModifyDatabaseACL` 等都不支持设置规则内容

### 后续操作建议
- 如需批量操作，考虑用 `puppeteer` 或 Playwright 自动化控制台操作
- 或迁移到 CloudBase 新政策系统（OPA Rego），但会改变整个鉴权模型
