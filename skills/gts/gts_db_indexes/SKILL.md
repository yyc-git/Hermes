
---
name: "gts_db_indexes"
description: "按兄弟确认的集合和索引配置，创建CloudBase DB索引"
---

# gts_db_indexes — CloudBase DB 索引管理

## 触发词
- `建索引`
- `创建索引`
- `同步索引`
- `索引管理`
- `DB 索引`

## 前提

- 脚本位置：`packages/forum/scripts/create-forum-indexes.ts`
- 使用 `@cloudbase/manager-node` 管理 API（普通 database SDK 不支持创建索引）
- CloudBase 环境：`meta3d-local-9gacdhjl439cff76`
- 凭据：从 `cloudbaserc.json` 的 `envVariables.TMT_SECRET_ID` / `TMT_SECRET_KEY` 程序化读取

## 🔴 纪律

### 规则1：🔴🔴🔴🔴🔴 必须等兄弟确认 — 不得自动执行

**索引和集合不是固定的，不能预设或自动执行。**

每次需要建索引时：
1. **先问兄弟**哪些集合需要建索引（线上/本地/预发？全部还是部分？）
2. **问清需要什么索引**（字段组合、排序方向、索引名）
3. **兄弟确认后才能执行**

严禁：
- ❌ 不问直接跑脚本
- ❌ 预设默认集合列表自动执行
- ❌ 根据代码自动推断需要哪些索引

### 规则2：索引创建是幂等的

- 已存在的索引名会被 CloudBase 静默忽略（不会报错也不会覆盖）
- 可以重复运行，不影响已有索引
- 新索引只增不删

### 规则3：目标集合不存在时静默跳过

- 如果指定的集合不存在，脚本会输出警告并继续处理其他集合

## 执行步骤

### Step 1: 先和兄弟确认

问清楚：
- 哪个/哪些集合需要建索引？
- 索引的字段组合、名称、排序方向？

等兄弟回复确认后才进入下一步。

### Step 2: 确认 Clash 模式

CloudBase 在 Clash 全局模式下不可访问，确认是**规则**模式：

```powershell
$script = "$env:USERPROFILE\D:\Github\GTS-Play\scripts\clash-proxy-manager.ps1"
& $script -Mode rule
```

### Step 3: 读取凭据并运行

```powershell
cd D:\Github\GTS-Play\packages\forum
$config = Get-Content cloudbaserc.json -Raw | ConvertFrom-Json
$env:TCB_SECRET_ID = $config.functions[0].envVariables.TMT_SECRET_ID
$env:TCB_SECRET_KEY = $config.functions[0].envVariables.TMT_SECRET_KEY
npx ts-node scripts/create-forum-indexes.ts <集合名逗号分隔>
```

### Step 4: 验证结果

脚本会自动验证每个集合的索引列表，检查建好的索引是否符合预期。

### Step 5: 通知兄弟

- 桌面通知：`msg * "论坛索引创建成功"`
- 文案简要说明哪些集合建了哪些索引

## 脚本说明

脚本 `create-forum-indexes.ts` 接受逗号分隔的集合名作为参数。没有参数时不会默认执行任何操作。

## 注意事项

- 脚本用 `require("@cloudbase/manager-node")`，不是 `@cloudbase/node-sdk`
- PowerShell 里直接设 `$env:TCB_SECRET_KEY` 时注意变量名中的点号 `…`，建议写入临时文件然后 `ts-node` 跑
