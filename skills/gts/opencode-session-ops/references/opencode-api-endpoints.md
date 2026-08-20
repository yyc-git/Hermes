# OpenCode HTTP API 端点速查 + 已知坑

> 本文件汇总 OpenCode 4098 Web UI 暴露的 HTTP 端点结构 + 实测踩过的坑,避免下次又拿错返回值结构。

## `/api/skill` — 列出已加载 skills

**返回结构**:`{location, data: [{name, description, location, content}, ...]}` —— 外层是对象,不是裸数组。

```powershell
$r = Invoke-WebRequest "http://127.0.0.1:4098/api/skill" -UseBasicParsing -TimeoutSec 5
$json = $r.Content | ConvertFrom-Json
$hit = $json.data | Where-Object { $_.name -eq "<skill-name>" }
```

### 踩坑记录(2026-08-19)
- ❌ 第一版:`$json | Where-Object { $_.name -eq ... }` → 返回 1 个对象(`location` 字段)
- ✅ 正确:必须 `$json.data | Where-Object ...`(数组在 `data` 字段下,外层对象先取 `data`)
- 表象:"未找到 skill"实际是已加载 — 因为 Where-Object 展开外层对象只匹到 `location` 一项

### 验证 skill 加载的字段(2026-08-19 实测)
| 字段 | 含义 |
|------|------|
| `name` | skill 名(与目录名一致) |
| `description` | frontmatter 的 description |
| `location` | 绝对路径,形如 `D:\Github\GTS-Play\.opencode\skills\<name>\SKILL.md` |
| `content` | skill 正文 markdown(去掉 frontmatter 后的 body)|

### 验证 skill 加载是否生效的最小判定
```powershell
$r = Invoke-WebRequest "http://127.0.0.1:4098/api/skill" -UseBasicParsing -TimeoutSec 5
$json = $r.Content | ConvertFrom-Json
$hit = $json.data | Where-Object { $_.name -eq "<新加的 skill 名>" }
if ($hit -and $hit.content.Length -gt 100) {
    Write-Host "✅ skill 已加载($($hit.content.Length) chars)"
} else {
    Write-Host "❌ 未找到或内容异常"
}
```

## `/api/session` — 列出活跃 sessions

**返回结构**:`{data: [{id, title, time, ...}, ...]}`

```powershell
$r = Invoke-WebRequest "http://127.0.0.1:4098/api/session" -UseBasicParsing -TimeoutSec 5
$sessions = ($r.Content | ConvertFrom-Json).data
$sessions | ForEach-Object { Write-Host "$($_.id) | $($_.title)" }
```

## `/session/{id}/message` — 追加消息到运行中 session

**🔴 关键坑(2026-08-10 实锤,见 opencode-schedule SKILL §2.5)**:
- endpoint 是 `/session/{id}/message`(**不带 /api 前缀**),带 `/api` 返回 HTML
- body 必须含 `parts` 数组(`{parts:[{type:"text",text:"..."}]}`),缺了返回 400 `Missing key ["parts"]`
- POST 是流式挂起,`Invoke-WebRequest` 默认 10s 超时会取消请求 → 必须 `curl.exe --max-time 300` 后台跑
- 验证送达:`GET /api/session/{id}/message`(**带 /api**),看消息列表是否含刚发的 text

## 通用模式

| 模式 | 风险 | 推荐 |
|------|------|------|
| `Invoke-WebRequest` GET 短查询 | 无(GET 不会挂起) | ✅ 直接用,timeout 5s 够 |
| `Invoke-WebRequest` POST 流式 | ⚠️ 会挂起到 agent 处理完 | ❌ 改用 curl.exe 后台跑 |
| `Where-Object` 过滤响应 | 外层可能是对象而非数组 | ⚠️ 先看接口结构(浏览器/打印 .data) |

## 调试技巧

接口结构不清楚时,先 `Write-Host $r.Content` 打印原始 JSON,再决定怎么 `ConvertFrom-Json`。别先假设结构,2026-08-19 `Where-Object` 直接展开外层对象那次就是栽在"以为它是数组"上。

## 附录 A：Python / PowerShell / Hermes terminal 实测坑（2026-08-19 ad-hoc verification 时遇到）

不在 OpenCode API 范畴，但做 code-review 报告核查 / Pro agent 卡死救场 / 任何 ad-hoc verify 时都会撞到的真坑：

| 坑 | 表现 | 解决 |
|---|---|---|
| `python` 命令不存在 | PS7 报 "the term 'python' is not recognized" | **必须 `uv run --no-project python <script>`**（uv 在 PATH 上） |
| `<` 重定向调 `.exe` | `sqlite3 db < script.sql` 报 "The '<' operator is reserved for future use" | 用 **`sqlite3 -init script.sql db ".quit"`** 或 PowerShell `Get-Content script.sql -Raw \| & sqlite3 ...` |
| `&` 调用 sqlite3.exe 被 Hermes terminal 误判 backgrounding | 立刻报 `Foreground command uses '&' backgrounding` | **先 `cd "C:\sqlite"`** 再用 `.\sqlite3.exe ...`（不通过 & 启动新进程） |
| Python f-string 含反斜杠 | `SyntaxError: f-string expression part cannot include a backslash` | 提前把反斜杠字符串赋给变量再用 `{var}` 嵌入，或用 `r"..."` raw 串单引号 + 转义 |
| Invoke-WebRequest POST 流式 | 10s 默认超时取消请求，消息未送达 | **必须 `curl.exe -s -X POST ... --max-time 600` 后台跑** |
| 系统 temp 写脚本 | `/tmp/` / `$env:TEMP` 权限坑 / PS 5.1 编码乱码 | 放 `$env:TEMP\hermes-verify-*.py` + 跑完 `Remove-Item` 清（参考 §🔟 模板） |

**ad-hoc verify SOP（code-review 报告核查 / OpenCode 自报数字复验必跑）**：
1. 写 `$env:TEMP\hermes-verify-<task>.py`（不用 `.tmp/`，免污染仓库）
2. `uv run --no-project python <script>` 跑
3. 跑完 `Remove-Item $env:TEMP\hermes-verify-<task>.py -Force`
4. **ad-hoc 全 PASS ≠ jest 套件 green** — 它是 OpenCode 自报可信度的二次校验，不能取代 Phase C 完整验收
5. 任何 FAIL → 汇报兄弟 + 不进入下一阶段（不能为了推进就放过）

## 附录 B：OpenCode Pro 卡死信号 + 救场（2026-08-19 code-review 实测）

**`permission auto-reject` 是 Pro 卡死的硬信号**（与权限等待不同）：

- **权限等待**：agent 想写项目外路径 → Web UI 弹 Allow/Deny → 等用户
- **permission auto-reject**（opencode.json 已配 `permission.edit=allow,bash=allow`）：agent 想读/写未在白名单的路径 → **直接 deny，无 UI 弹窗** → agent reasoning 卡住 / 继续空跑 → 53 分钟无进展

**🔴 关键区分**（第一特征）：

| 信号 | 含义 |
|---|---|
| part 表连续 2+ 条 `tool/read status=error error="The user rejected permission..."` | **permission auto-reject 触发** |
| part 表最近 tool 是 `state.status=running` 但 `time_updated` 久不动 | 权限等待 / 长 bash |
| part 表只有 `step-start` / `reasoning` / `text` 无 tool/reason 推进 | 模型在思考静默期（Pro max 80min 正常） |

**救场（确认 permission auto-reject 后）**：

```powershell
# 1. curl 发送"继续 + 不要重试被拒操作"消息（POST 不带 /api 前缀）
$sid = "ses_xxx"
$msg = "卡了 X 分钟了——刚才你尝试读 <被拒路径> 被 permission auto-reject。不要再去读外部文件!所有需要的信息 brief 里都有。直接按 brief 出报告,不要重试被拒操作。"
$body = @{ parts = @(@{ type = "text"; text = $msg }) } | ConvertTo-Json -Depth 5 -Compress
$body | Out-File -FilePath "$env:TEMP\cr-msg.json" -Encoding UTF8
curl.exe -s -X POST "http://localhost:4098/session/$sid/message" `
  -H "Content-Type: application/json" --data-binary "@$env:TEMP\cr-msg.json" --max-time 600

# 2. 15 秒后查 DB 确认 session 还活 + 看 part 表末尾是否有 text part 含"收到"
& "C:\sqlite\sqlite3.exe" "C:\Users\Administrator\.local\share\opencode\opencode.db" `
  "SELECT json_extract(data,'$.type'), datetime(time_updated/1000,'unixepoch','localtime') FROM part WHERE session_id='$sid' ORDER BY time_updated DESC LIMIT 5;"
# 看到 type='text' + 时间新鲜 = 救场成功

# 3. 失败兜底：再 30 分钟无新 part → gts-opencode-stop 杀掉，按 brief 摘要重新派（brief 已含全部信息即可独立出报告）
```

**预防**（brief 必须显式写）：

```markdown
## 工作约束（避免 permission auto-reject）
- **禁止读以下路径**：
  - ❌ <项目外仓绝对路径>
  - ❌ `<其他仓>/笔记/`（兄弟笔记）
  - ❌ `<其他仓>/README.md`（其他仓根）
- 如果权限被拒：**改用 brief 摘要 + 已读 commit 信息继续，不要重试被拒操作**
- brief 已含全部 commit 关键改动点 + 关键 diff 摘要（必要时直接读 commit message）
```

**实测案例**（2026-08-19 code-review Pro session）：agent 试图读 `D:\Github\PMXReduceFace\` + `D:\Github\GTS-Play\笔记\项目文档\rules\workflow-rules.md` 都被 auto-reject → 卡 53 分钟 → curl 发"继续"消息后 5 分钟内出报告 → 该 session 同时产出 false-negative（漏看 `mag > 0` 防护，参见附录 C）。

## 附录 C：reviewer agent 输出 false-negative 风险 + 必跑 ad-hoc verify（2026-08-19 code-review 实测）

> 这一节不只是 opencode-session-ops 的范畴，但 reviewer 跑 OpenCode Pro 任务，本质上是 session-ops 的延伸。所有 Pro / 复杂审核任务的报告都得过这一关。

**已知反模式**：Pro model 出代码审核报告时，会**漏看实际代码细节**导致 false-negative：

- 实测：reviewer 报告 `c8f92b5dc` 的 pickedTransform 算法"未做零向量防护 → 🐛"——但 `mmd-config-rules.mjs:188` 实际写了 `const normal = mag > 0 ? diff.map((d) => d / mag) : [0, 0, 1];` 完全防护了
- 同样 reviewer 报告 `brief 文件清单 vs 实际 commit 不一致` 是 🔴 —— 但其实部分 commit 是 agent 主动合并多文件到一笔（agent 解释合理）

**🔴 必修**：任何 OpenCode Pro / 复杂 review 任务跑完、bot 准备把 🐛/🔴 报告转达给兄弟之前，**必须 ad-hoc verify 一次**：

```powershell
# 写 $env:TEMP\hermes-verify-cr-<task>.py（结构参考 §🔟 模板）
# 关键检查：reviewer 列的每条 🐛 → 实际读 git diff / 源文件确认存在 → false-positive 直接丢弃
# 跑完删脚本，输出 PASS/FAIL 给兄弟参考

uv run --no-project python $env:TEMP\hermes-verify-cr-<task>.py
Remove-Item $env:TEMP\hermes-verify-cr-<task>.py -Force
```

**判定原则**：

- ad-hoc verify 后 ✅ PASS 的 🐛 → 才转达给兄弟
- ad-hoc verify 后 ❌ FAIL = false-positive → **不在兄弟面前提**（避免污染注意力）
- 真正 ad-hoc 没覆盖到的 🐛（即 reviewer 说有但脚本没验证的）→ 单独标"未实测"列，让兄弟自己决定

**记忆点**：reviewer 是 LLM，LLM 会漏看。bot 转达前**至少过一次脚手架 grep / Select-String**。这是 bot 的"硬功夫"，不能省。
