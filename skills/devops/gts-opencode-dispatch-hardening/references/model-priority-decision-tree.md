# Model Priority Decision Tree (2026-08-20 兄弟拍板)

> 本文件是 `gts-opencode-dispatch-hardening` 铁律 9 + 铁律 10 的扩展 reference
> 触发:任何 `-m` 决策 / 派工前 30 秒选模型时

## 兄弟硬偏好优先级(2026-08-20 拍板)

### Pro 场景
任何 fix/feat/plan-review/root-cause/复杂审核任务,默认走 Pro。

| 优先级 | model 路径 | 何时用 |
|---|---|---|
| 1 (首选) | `volcark/deepseek-v4-pro-ga-260813` | 火山 Pro,主路径 |
| 2 | `mimo-v2.5-pro` | 火山挂了 |
| 3 (兜底) | `opencode-go/deepseek-v4-pro` | 火山 + mimo 都挂了 |

### Flash 场景
实施型任务 / 简单 fix / 简单审核,默认走 Flash。

| 优先级 | model 路径 | 何时用 |
|---|---|---|
| 1 (首选) | `opencode/deepseek-v4-flash-free` | 询问 `opencode-free-model-state` 状态文件 current |
| 2 | `opencode/hy3-free` | 1 额度用完 |
| 3 | `mimo` | 1+2 挂了 |
| 4 | `nemotron-3-ultra` | 1+2+3 挂了 |
| 5 | `nemotron-3.5-lightning` | 1+2+3+4 挂了 |
| 6 | `laguna-s-2.1` | 1+2+3+4+5 挂了 |
| 7 | `volcark/deepseek-v4-flash` | 免费组全挂 |
| 8 (兜底) | `opencode-go/deepseek-v4-flash` | 免费组 + 火山都挂 |

**铁律**:`opencode-go/*` 永远兜底,从不首选。

## 🔴 配置默认 ≠ 兄弟偏好默认(2026-08-20 实锤认知偏差)

### 错误的推理链

```
我打开 GTS-Play/.opencode/opencode.json
  ↓
看到 agent.build.model = "opencode-go/deepseek-v4-flash"
  ↓
推理: "项目默认 = 兄弟偏好默认"
  ↓
B1/B2 都用 -m opencode-go/deepseek-v4-{pro,flash}
  ↓
兄弟拍桌: "为什么没用火山的模型?opencode go 的模型是兜底啊"
```

### 真相

| 维度 | 配置文件 `opencode.json` | 兄弟硬偏好 |
|---|---|---|
| 性质 | OpenCode 工具兜底(CLI 漏传 -m 时 fallback) | 业务硬纪律(显式 -m 必走) |
| 谁定的 | OpenCode 安装时 / 项目初始配置 | 兄弟 8-20 拍板(基于 token 经济 + 套餐覆盖) |
| 谁用 | CLI 漏传 -m 时 | 任何 dispatch 必走 |
| 派工时怎么处理 | **忽略** | **必读 + 严格按优先级** |

反模式:打开 `.opencode/opencode.json` → 看到 `agent.build.model` → 直接复制到 `-m`。
正确做法:根本不看 `.opencode/opencode.json` 的 model 字段,直接按兄弟优先级表选 `-m`。

## 派工前 30 秒决策树

```
开始派工
  ↓
是什么任务?
  ├─ fix/feat/复杂审核/plan-review/root-cause → Pro 场景 → 首选 volcark/deepseek-v4-pro-ga-260813
  └─ 实施/简单 fix/简单审核 → Flash 场景 → 查 opencode-free-model-state current 字段
  ↓
显式 -m <选定模型>
  ↓
派工 → 30s 内查 DB session.model 字段
  ├─ 与 -m 一致 → ✅ 继续
  └─ 不一致(走了 fallback) → 立即 gts-opencode-stop 杀 + 重派
```

## 检测命令清单

### 派工前
```powershell
# 查免费组当前 current
node scripts/opencode-free-model-state.mjs get
# → {"current":"opencode/<model>", ...}
```

### 派工后 30 秒
```powershell
# 查 session 实际 model
C:\sqlite\sqlite3.exe "C:\Users\Administrator\.local\share\opencode\opencode.db" "SELECT substr(data,1,400) FROM message WHERE session_id='<sid>' ORDER BY time_updated ASC LIMIT 1"
# data JSON 里 "model":{"providerID":"<p>","modelID":"<m>"} 是实际跑的模型
```

## 兄弟拍桌原话(2026-08-20)

- 「为什么没用火山的模型?」
- 「opencode go 的模型是兜底啊」
- 「pro 场景优先用火山 pro,然后是 mimo-v2.5-pro,最后才是 opencode go pro」
- 「flash 场景优先用免费模型,然后是火山 flash,最后才是 opencode go flash」

## 关联

- `gts-opencode-dispatch-hardening` 铁律 9(优先级表)+ 铁律 10(配置默认 vs 偏好默认)
- `opencode-dispatch-pitfalls` 教训 3(CLI 默认 model fallback 陷阱,已重写)
- `opencode-hermes-dispatch-pitfalls` 兄弟硬偏好(2026-08-20 拍板版)
- `gts-dispatch-preflight` argv 终极模板(-m 默认值已 patch 为 volcark)
- `opencode-free-model-state` 状态文件:免费组自动轮换,挂了的自动 dead + 切下一个
