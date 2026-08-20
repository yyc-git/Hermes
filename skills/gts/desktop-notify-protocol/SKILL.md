---
name: desktop-notify-protocol
description: 兄弟协作的桌面通知协议（notify.ps1）。触发：向兄弟发出需确认问题/等确认、任务完成需验收、等待兄弟操作时必须发桌面通知，不能只回消息。含 Hermes terminal 调用坑（& 前缀误判后台）与双机路径。
---

# desktop-notify-protocol — 桌面通知协议

> 纪律来源：2026-08-17 兄弟纠正「现在没有桌面通知吗（msg?）」——问确认类问题只回消息没弹通知。gts-dev-feat 已固化 3 处确认点，本技能把纪律通用化到所有与兄弟协作的场景。

## 必须发桌面通知的场景

- **发出需兄弟确认的问题后**（方案确认、commit 确认、部署确认、E2E 场景选择等）——回消息的同时必须弹通知
- 任务完成、需要兄弟验收/查看结果时
- 等待兄弟手动操作（如手动 E2E）开始时
- 长任务结束（保存完成、部署完成等）

判定标准：兄弟此刻不在聊天窗口盯着，通知是他知道「有事等他」的唯一途径。拿不准就发。

> 🔴 **最容易漏的场景：gts-submit-save 收尾**（2026-08-17 实测被兄弟纠正「怎么没有发msg通知」）——commit + push + 记忆保存完成后，**必须** notify.ps1 弹通知再聊天汇报；命令成功无输出（exit 0）即为送达；不要因为「聊天里已经说了」就跳过通知。

> 🔴🔴🔴 **2026-08-18 实测追加：** gts-auto 全自动模式走到 Phase S(commit + merge + push + issue close)时，**任何一步阻塞**（dev 工作区脏 / merge CONFLICT / push 拒权限 / 兄弟手动干预是唯一路径），bot **必须立刻发通知**，不要假设"兄弟在 chat 自己看到"。实测反例:Phase S 跑 merge 撞 dev 工作区 190 个 uncommitted 改动，bot 写完"需要兄弟处理"就停了 30+ 分钟没发通知，兄弟质问"你怎么不通知我？"——严重失职。
>
> **触发词:** gts-auto / 全自动模式 + Phase S / commit / merge / push / dev 工作区脏 / issue close
>
> **强制动作:** 阻塞发生第一秒 → `powershell -File notify.ps1 -Title "🛑 gts-auto 卡住" -Message "<具体阻塞 + 需要兄弟做什么>"` → **同一条消息也发 chat**（双通道） → 等兄弟回复后才继续。

> 🔴🔴🔴🔴 **2026-08-18 实测追加(最高优先级)：需兄弟拍板 = 必发 msg 通知 = 排在 token 节约 / 自动批量化前面**。触发：阻塞 / 资源申请 / 不可逆操作 / 方案选 A B C / 改 config / 删文件 / restart server / dispatch 跨模型 / 装新依赖。**回 chat 列方案 ≠ 已通知**，必须双通道：桌面 + msg。判定口诀：要拍板 = 先通知 = 最高优先级。实测反例:列 3 选 1 Holographic 升级方案给兄弟,只在 chat 列没发通知 → 兄弟质问"你怎么不通知我"。

> 🔴🔴🔴🔴 **2026-08-18 二次校准(兄弟打脸教训)：notify 边界 = 四种场景,不止"需确认"一种**。**当日实测兄弟 2 次纠正**"开干前/完成后都多余通知了",重新校准如下：

| 场景 | 发通知? | 例 |
|---|---|---|
| 🔴 **需兄弟拍板**(阻塞 / 选 A B C / 改 config / 删文件 / restart / 装依赖 / 不可逆) | ✅ **必发** | "Holographic 不可行,你拍 A/B/C" |
| 🔴 **agent 已完成产物待兄弟操作**(2026-08-20 实锤:fix 跑完 34/34 通过 + tsc 零错误,代码改动在工作区,兄弟要 commit → 必发) | ✅ **必发** | "C 任务跑完,等你拍板 commit 5 个 mmd_tool 文件" |
| ❌ **开干已知任务**(兄弟已说 "ok" / "干" / "1.ok 2.ok 3.ok" 选过方案) | **不发** | 三件套开干前 1 条 notify = 多余,撤不掉 |
| ❌ **完成 / 进度汇报** | **不发** | "三件套完成 ✅" 结尾 notify = 多余,撤不掉 |
| ✅ **阻塞 / 失败 / 需兄弟手动操作** | ✅ **必发** | OpenCode session 卡死 / 部署权限拒 / agent 申请外部资源 |

**判定口诀**: "等你拍 = 必发" / "已拍板干 = 不发" / "搞完汇报 = 不发" / "卡住等救 = 必发" / **"产物就绪等你操作 = 必发"**(2026-08-20 新增)。**聊天里列完选项等你回 ≠ 已通知,必须再 notify.ps1 双通道**;**兄弟已 ok 后,任何 "开干" "完成" "干完" 类通知都是 noise,兄弟会再纠正**。

**🔴 致命反例(2026-08-20 兄弟拍桌)**:C 任务 agent 跑完 34/34 + tsc 零错误,代码改动在工作区,我在 chat 写"等你拍板 commit",**没发 notify.ps1**。兄弟质问「需要我拍板为什么不发msg通知啊？？？？？」——4 个 `?` 表明强烈不满。修复:gts-auto §7.4 已固化"等兄弟拍板通知硬规"段,本 skill 同步加此条目。

## 调用方式（2026-08-18 实测更新：OpenClaw 迁移后脚本已复制到 GTS-Play 项目）

用 `powershell -File` 方式调用（最稳，实测 exit 0 送达），**不要用 `&` 前缀**：

```powershell
# ✅ 实测成功（2026-08-18）
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\Github\GTS-Play\scripts\notify.ps1" -Title "任务完成" -Message "xxx 已完成"
# 参数：-Title 标题 / -Message 内容；exit 0 且无输出 = 送达
```

## 🔴 坑：Hermes terminal 里 `&` 前缀会被拦截

- `& "D:\...\notify.ps1" -Message "..."` → Hermes terminal 把 `&` 误判为后台运行符号，拒绝执行（exit -1，报 "Foreground command uses '&' backgrounding"）
- 正确写法：用 `powershell -File "完整路径"` 包一层（2026-08-18 实测），或把脚本完整路径直接当命令名、不加 `&`
- 调用前可先 `Test-Path` 确认脚本存在。🔴 找不到 notify.ps1 时先查 `D:\Github\GTS-Play\scripts\`，不要只搜 hermes-home/skills 目录（2026-08-18 实测：脚本在项目 scripts 下，不在 skills 目录）

## 路径（2026-08-18 更新：OpenClaw 迁移后）

| 机器 | 路径 |
|------|------|
| 本机 Administrator（GTS-Play 项目，当前有效） | `D:\Github\GTS-Play\scripts\notify.ps1` |
| 旧 OpenClaw 残留路径（已废弃） | `C:\Users\Administrator\.openclaw\workspace\scripts\notify.ps1` |
| one 机 | `C:\Users\one\.openclaw\workspace\scripts\notify.ps1` |

⚠️ 用错机器路径会报「文件不存在」，通知静默发不出去（2026-08-17 教训）。

## 关联

- `gts-dev-feat`：3 处等确认点（Step 0 / B 环节1 方案确认 / M-3 子fix确认）
- `gts-save-memory`：Step 5 通知兄弟（保存完成）
- 与 `msg *` 可并用；Hermes 环境优先 notify.ps1

---

## 🔴 坑（2026-08-18 新增）：PowerShell `-` 参数解析陷阱

notify.ps1 有 `-Timeout` 参数(数字),若 `-Message` 文本里出现**空格+数字+空格+中文动词**格式,PowerShell 会把中文动词"先""下一步"等误当成 `-Timeout` 参数解析,导致:

```
Cannot process argument transformation on parameter 'Timeout'.
Cannot convert value "先" to type 'System.Int32'.
```

**触发表达(避开)**:`-Message "...先..."`、`-Message "...下一步..."`、`-Message "...确认后..."` 等。

**正确姿势**:
- 整条命令用**单引号**包 `-Message '...'`(避免内插变量触发参数嗅探)
- 避免 message 文本里出现 `-Timeout 数字` 格式
- message 文本用句号/逗号分隔,不要直接空格+数字+中文动词

**自测命令**(发送前 dry-run):
```powershell
# 错误(会报 timeout 参数错):
powershell -NoProfile -Command "& notify.ps1 -Title 'dry' -Message '先看一下'"

# 正确(单引号 + 改写文本):
powershell -NoProfile -Command "& notify.ps1 -Title 'dry' -Message '请先查看'"
```
