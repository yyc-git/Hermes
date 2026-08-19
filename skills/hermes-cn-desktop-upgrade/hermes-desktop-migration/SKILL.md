---
name: "hermes-desktop-migration"
description: "Hermes Desktop 换电脑迁移方案。触发：兄弟说「换电脑」「迁移」「新机器」。"
---

# hermes-desktop-migration

> 触发：兄弟说「换电脑」「迁移」「新机器」「跨设备」
> Hermes Desktop 换电脑时的数据迁移方案

---

## 数据分层

### 已通过 git 同步（换电脑后 `git clone` 即可）

| 路径 | 内容 |
|------|------|
| `skills/` | 所有技能 |
| `MEMORY.md` | 主记忆 |
| `USER.md` | 用户画像 |
| `SOUL.md` | 人格设定 |
| `config.yaml` | 配置 |
| `memories/` | 持久记忆 |

### 需要手动迁移（`.gitignore` 排除了 `*.db`）

| 文件 | 大小 | 说明 |
|------|------|------|
| `state.db` | ~133MB | 主会话数据库（聊天记录、记忆） |
| `kanban.db` | ~116KB | 看板数据 |
| `projects.db` | ~44KB | 项目列表 |
| `cron/executions.db` | ~20KB | 定时任务 |
| `verification_evidence.db` | ~156KB | 验证证据 |

---

## 迁移步骤

### 旧电脑

1. **关闭 Hermes Desktop**
2. **压缩整个 `hermes-home/` 目录**
   ```powershell
   Compress-Archive -Path "E:\Hermes Agent CN Desktop\data\hermes-home" -DestinationPath "D:\Downloads\hermes-home-backup.zip"
   ```
3. **拷到新电脑**（U盘/网盘/局域网共享）

### 新电脑

1. **安装 Hermes Desktop**（下载安装包）
2. **找到 hermes-home 目录**（安装后启动一次会自动创建）
3. **关闭 Hermes Desktop**
4. **用备份覆盖 hermes-home/**
5. **启动 Hermes Desktop**，验证 skills 和记忆是否正常

---

## 日常跨设备同步

如果两台电脑**不同时使用**，可以把 `state.db` 放到同步盘：

1. 把 `state.db` 移到 OneDrive/坚果云目录
2. 在 `hermes-home/` 下创建软链接：
   ```powershell
   # 原位置留空，指向同步盘
   Remove-Item "E:\Hermes Agent CN Desktop\data\hermes-home\state.db"
   New-Item -ItemType SymbolicLink -Path "E:\Hermes Agent CN Desktop\data\hermes-home\state.db" -Target "C:\Users\Administrator\OneDrive\HermesSync\state.db"
   ```
3. **注意**：SQLite 不支持多实例并发写，**不能两台电脑同时运行 Hermes**

---

## 纪律

1. 🔴 迁移前**必须关闭 Hermes Desktop**（否则 db 被锁，拷贝不完整）
2. 🔴 `state.db` 是核心数据，迁移后**先验证聊天记录是否完整**
3. 🔴 git 同步的 skills/config 换电脑后 `git pull` 即可，不需要手动拷
