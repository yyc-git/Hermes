# Code Review 卡死案例详细复盘 (2026-08-19)

## 完整时间线

| 时间 (北京) | 事件 |
|------------|------|
| 11:17:09 | agent 读 `D:/Github/PMXReduceFace` 被 perm-deny |
| 11:17:09 | agent 读 `D:/Github/GTS-Play/笔记/项目文档/rules/workflow-rules.md` 被 perm-deny |
| 11:17:16 | agent 最后一次工具调用完成(step-finish reason=tool-calls) |
| 11:17:16 ~ 12:09 | session 空转 53 分钟,无新事件 |
| 12:09 | bot 查 DB 发现卡死 |
| 12:09 | bot 用 curl 发"继续"消息,curl 超时 60s 但消息实际送达 |
| 12:11 | agent 收到消息,开始 reasoning 出报告 |

## part 表证据

```sql
-- 卡死前最后 5 个 part
call_6825d8442f514c1c9de22d7a  read   error  workflow-rules.md        external_directory permission denied
call_26c024e05ee44d7ca398ddc6  bash   error  git show 0b50ce0 (PMXReduceFace)  external_directory permission denied
call_d01164fbc8c04158ac7b0419  bash   ok     git show 102f342e1 --stat
call_17b9debb638648aa98828f06  bash   ok     git show 5c9aef88b --stat
call_7ad9cb041a3248f4a298deac  bash   ok     git show be243ac71 --stat
```

## 关键观察

1. agent 读 wt1 仓内 commit **成功**(5 次 ok)
2. agent 读 PMXReduceFace 仓 + GTS-Play 笔记目录 **失败**(2 次 perm-deny)
3. agent 失败后没回退,也没新工具调用,空转 53 分钟
4. time_updated 在卡死期间不变(1787109436528 一直保持)
5. bot 发"继续"消息后,agent 收到并开始 reasoning 出报告

## 错误处理流程对照

按 `gts-opencode-dispatch-hardening` 铁律 2:

| 步骤 | 本次做法 | 应做 |
|------|---------|------|
| 检测 perm-deny | 派工后 53 分钟才发现 | 派工后 20 分钟主动轮询 |
| 主动核对 status | 没核对(依赖 wait) | 查 part 表最近 5 条事件 |
| 判断卡死 | 知道 53 分钟没动,但等兄弟问 | 30 分钟不动 + perm-deny 重复 = 立刻停 |
| 重新派 | 用 curl 发消息(碰巧成功) | 用 `gts-opencode-stop` 杀掉 + 重新派(brief 加路径声明) |

## brief 改进

原 brief 缺"外部路径访问声明"段。改进后:

```markdown
## 🔴 外部路径访问声明(必填)
- ✅ 允许读: D:/Github/wt1 及其子目录
- ❌ 禁止读: D:/Github/PMXReduceFace/(其他仓)
- ❌ 禁止读: D:/Github/GTS-Play/笔记/(其他项目笔记)
- ❌ 禁止读: 任何 /d/* / /c/* 等 Git Bash 写法
- 任何被拒操作:用 brief 摘要 + 已读 commit 信息继续,**不要重试被拒操作**
```

## wait 脚本问题

`wait-opencode-session.mjs` stableMs=600000 (10分钟),理论上 10 分钟 idle 应该报 stuck。

实际脚本逻辑:`idle = now - lastSeen`,`lastSeen` 在 `ts !== lastTs` 或 THINKING_EVENT_TYPES 命中时重置。

问题:agent 卡死后**没有任何新事件**(无 tool call / reasoning / step-finish),所以 `lastSeen` 不更新 = idle 持续涨,但脚本确实应该报 stuck。

**实测**:本次 session 卡 53 分钟都没触发 stuck 报警 — wait 脚本可能 bug,或者脚本检测逻辑对 perm-deny 后无事件状态处理有问题。

**绕过方案**:不依赖 wait stuck 检测,主动 20 分钟轮询一次 + 查 perm-deny 重复模式。
