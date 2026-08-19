---
name: "opencode-model-smoke-test"
description: "OpenCode 模型连通性冒烟测试：新增免费模型/新 provider 上线时，用最小问答任务串行验证能否跑通。触发词：测试模型/模型连通性/免费模型能不能用"
---

# opencode-model-smoke-test — OpenCode 模型连通性测试

> 触发场景：新增模型/免费模型上线、批量验证模型组可用性（如「依次测下 flash free 以外的免费模型能否跑通」）。真实任务调度见 opencode-schedule skill，本 skill 只负责**验证模型本身能不能跑**。

## 流程（串行，禁止并发）

1. **写最小测试 brief**：纯问答任务（如「1+1=？并说出你是哪个模型」），必须含三态定义 + 不做清单。模板：`templates/free-model-smoke-test.md`（直接复制改模型名即可）
2. **串行 dispatch**：同一测试 brief 任务**一个模型测完再测下一个**——并发 attach 同一工作区会互相污染上下文（同 opencode-schedule 5️⃣ 并发防污染规则）
3. **每个模型的标准步骤**：
   ```powershell
   # a. dispatch（background，不带短 timeout）
   $brief = Get-Content "D:\Github\GTS-Play\.opencode-brief-free-model-test.md" -Raw -Encoding UTF8
   opencode run $brief -m <模型ID> --attach http://localhost:4098 --title "free-test-<模型简称>" --no-replay --auto --dir D:\Github\GTS-Play
   # b. 查 DB 拿 sessionId（sleep 5 后再查）
   opencode db "SELECT id FROM session WHERE title='free-test-<模型简称>' ORDER BY time_created DESC LIMIT 1" --format json 2>$null
   # c. 启动 wait 监控（background + notify_on_complete=true）
   node scripts/wait-opencode-session.mjs <sessionId> 600 180 --exit-on-stuck --title "free-test-<模型简称>"
   ```
4. **验证连通性**：event 表查最后事件 = `step-finish reason=stop` + 有 `type=text` part 含预期答案 + cost=0（免费模型应零成本）→ 跑通

## 🔴 坑与判定要点

- **新 provider 上线（如火山 volcark）验证两步走（2026-08-18 实测）**：
  1. **独立端口预检**：`opencode run $brief -m <provider>/<模型> --title "conn-test" --no-replay --auto --dir D:\Github\GTS-Play --port <独立端口>`（不带 `--attach`，用 `--port` 起独立本地 server）→ 验证 provider 配置本身（key/baseURL/模型id）是否正确，**不影响 4098 上正在跑的活跃 session**
  2. **attach 4098 终验**：`opencode run ... --attach http://localhost:4098` → 报 `ProviderModelNotFoundError: Model not found: <provider>/<模型>` = **4098 server 没热加载新 provider**，必须重启 4098（完整重启流程见本 skill `references/opencode-server-restart.md`）
  - 🔴🔴 **自定义 provider（非 opencode-go 内置）独立 `--port` 模式会 fallback 到默认模型（2026-08-19 xiaomi-token-plan 实锤）**：`--port 4099` 输出 `> build · deepseek-v4-flash`（默认）而非目标模型。对自定义 provider **跳过独立端口预检，直接用 `--attach 4098` 冒烟测试**。内置 provider（volcark/opencode-go）独立端口预检仍有效
- 🔴 **看到 `AI_APICallError: the API key...missing or invalid` 第一反应 = 重启 4098**(1 分钟修,别再花时间诊断配置)——Windows 进程间 env var 不反向同步,改 env var 只对新进程生效;日志特征:ERROR 之前紧跟 `cleanup failed exitCode=1`。完整 SOP 见 `references/volcark-key-fix.md`。
- 🔴 **两个独立失败点别混淆（2026-08-18 实测）**：
  - `ProviderModelNotFoundError: Model not found` = 4098 没热加载 provider 配置 → 重启 server
  - `AI_APICallError: the API key or AK/SK in the request is missing or invalid` = server 进程内 `ARK_CODING_API_KEY` env var 为空 → **bot 可自修**（写 User scope env var + 重启 4098 + attach 实测），完整流程见本 skill `references/volcark-key-fix.md`
- `opencode models`（CLI 每次读配置文件）能列出新模型 ≠ 4098 server 已加载（server 启动时缓存配置）——两者是两套状态

- **`extract-session-text.mjs` 对纯问答 session 可能返回空/exit 1**（该脚本面向真实任务长报告）——**不是测试失败**，直接用 DB 查 part 文本：
  ```powershell
  opencode db "SELECT substr(CAST(data AS TEXT),1,400) AS preview FROM event WHERE aggregate_id='<sessionId>' ORDER BY seq DESC LIMIT 8" --format json 2>$null
  # 找 type=text 的 part，text 字段就是模型回答（如 "1+1=2，我是 hy3-free（opencode/hy3-free）。"）
  ```
- **判连通性看 part 表实际回答内容 + step-finish reason=stop**，不是看 CLI 输出或 wait 脚本退出码（wait 脚本 exit 0 只代表 DB 完成事件）
- **验证判据**：text part 含预期答案（如「2」）+ cost=0 + reason=stop；三者齐 = 跑通
- 模型 ID 用 `opencode models` 实测确认，不凭记忆写（免费模型可能增减）
- 兄弟指定测试范围（如「除了 flash free 以外」）时按兄弟说的执行

## 已实测记录（2026-08-18，供参考，会过时）

| 模型 | 结果 | 备注 |
|------|------|------|
| opencode/hy3-free | ✅ 跑通 | ~6s，回答「1+1=2，我是 hy3-free」，cost 0 |
| opencode/mimo-v2.5-free | 待续 | — |
| volcark/deepseek-v4-flash-ga-260731 | ✅ 跑通 | 火山 coding plan Flash 正式版，独立端口+attach 4098 双验证通过 |
| volcark/deepseek-v4-pro-ga-260813 | ✅ 跑通 | 火山 coding plan Pro 正式版，独立端口+attach 4098 双验证通过 |
| opencode-go/minimax-m3 | ✅ 跑通 | **OpenCode 侧**模型（走 opencode-go 中转），独立端口(4199)+attach 4098 双验证通过，回答「1+1=2，我是 minimax-m3」，cost≈0.00079（付费，非免费）；4098 无需重启即识别（opencode-go 内置 provider 模型列表动态加载，区别于 volcark 需重启）。🔴 若用户说「配置->模型里配了 minimax TokenPlanMax」指 **Hermes 侧** provider（minimax-cn / MINIMAX_CN_API_KEY / MiniMax-M3），测试走 `hermes chat --provider minimax-cn`，见 hermes-provider-config references/minimax-tokenplan.md |
| xiaomi-token-plan/mimo-v2.5-pro | ✅ 跑通 | 小米 token plan Pro，2026-08-19 新增 provider。🔴 **独立 `--port` 模式 fallback 到默认模型**（`> build · deepseek-v4-flash`），仅 `--attach 4098` 模式正确解析 `-m` → 自定义 provider 冒烟测试必须用 attach 模式。provider 添加流程见 `opencode-hermes-dispatch-pitfalls`「自定义 Provider 添加全流程」 |

> 连通性测试结果属会话状态，重新测试时以当次实测为准，不依赖本表。
> 🔥 火山 coding plan 模型需 `opencode.json` 的 `provider.volcark` 注册（baseURL=`/api/coding/v3`，key 用 `{env:ARK_CODING_API_KEY}`），且**4098 重启后才 attach 可用**——细节见 `references/opencode-server-restart.md`。
