# Hermes prefetch / sync_turn 实施踩坑(2026-08-18 实测)

> 本文件记录 bot 在 Hermes Desktop 形态下手动实现 `prefetch(query)` + 信任 `sync_turn` 时遇到的 5 个真坑。**目的是让下一个 session 不用重新踩**。

---

## 坑 1:state.db 时间字段名是 `timestamp` 不是 `created_at`

**症状**: `SELECT ... created_at FROM messages` 报 `Error: in prepare, no such column: created_at`

**真相**: Hermes 内部 `messages` 表的时间字段是 `timestamp`(REAL 类型,Unix epoch 浮点),**不是** `created_at`(那是 OpenCode state.db 的命名习惯)。

**正解**:
```sql
SELECT id, session_id, role, timestamp, substr(content, 1, 250) AS preview
FROM messages
ORDER BY timestamp DESC
LIMIT 5;
```

**复用价值**: 任何查 `E:\Hermes Agent CN Desktop\data\hermes-home\state.db` 的脚本都要用 `timestamp`。**类比**: OpenCode DB 的 part 表也是 `time_updated` 不是 `updated_at`(见 `opencode-session-ops` skill 旧条)。

---

## 坑 2:Node → PowerShell 有引号地狱

**症状**: 用 `execFileSync("powershell", ["-NoProfile", "-Command", `...${path}...`])` 调 PS,中文路径 + 单引号被 Node 字符串吞掉,PS 收到空 query,无输出 / 报错。

**原因**: 
- Node 字符串里 `'` `\` `"` 都要转义
- PowerShell 又有自己的 `''` 单引号转义规则
- 中英混合路径(`E:\Hermes Agent CN Desktop\...`)让转义链爆炸

**正解**: **写临时 .ps1 文件 + spawn 调**:
```js
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

function ripgrep(dir, pattern, filter = "*.md") {
  const ps1 = join(tmpdir(), `rg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ps1`);
  const body = `param([string]$Dir,[string]$Pattern,[string]$Filter="*.md")
$results=@()
try {
  $items = Get-ChildItem -Path $Dir -Recurse -Filter $Filter -ErrorAction SilentlyContinue |
    Select-String -Pattern ([regex]::Escape($Pattern)) -List |
    Select-Object -First 5 Path, LineNumber
  foreach($it in $items) { $results += @{Path=$it.Path; Line=$it.LineNumber} }
} catch { $results += @{Error=$_.Exception.Message} }
$results | ConvertTo-Json -Compress`;
  writeFileSync(ps1, body, "utf8");
  try {
    const out = execFileSync("powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, "-Dir", dir, "-Pattern", pattern, "-Filter", filter],
      { encoding: "utf8", maxBuffer: 512 * 1024 }
    ).trim();
    if (!out || out === "null") return [];
    const items = JSON.parse(out);
    return Array.isArray(items) ? items : [items];
  } finally {
    try { unlinkSync(ps1); } catch {}
  }
}
```

**关键**:
- 临时 .ps1 在 `os.tmpdir()` 下生成,UUID 后缀防冲突
- `-ExecutionPolicy Bypass` 防 PS 拒绝执行
- `finally` 块删 .ps1,不污染临时目录
- 走 `-File` + args,不走 `-Command` 字符串,无引号问题

---

## 坑 3:PowerShell `Select-String -Pattern` 不支持 `|` 当 OR

**症状**: 
```powershell
Select-String -Path "*.md" -Pattern "keyword1|keyword2" -List
# 报错: A positional parameter cannot be found that accepts argument '...'
# 或: The string "..." is not a valid regular expression
```

**真相**: PS 的 `Select-String -Pattern` 接 regex,但 `|` 在 PS 命令行里**会先被 shell 解析为管道符**,不会传成正则的 OR。`[Regex]::Escape(...)` 也救不了。

**正解**: **每个关键词单独跑,合并去重**:
```powershell
# ❌ 错
$pattern = "kw1|kw2|kw3"
Get-ChildItem ... | Select-String -Pattern $pattern -List

# ✅ 对
$results = @()
foreach ($kw in @("kw1", "kw2", "kw3")) {
  $items = Get-ChildItem ... | Select-String -Pattern $kw -List | Select-Object -First 3 Path, LineNumber
  foreach ($it in $items) { $results += @{Path=$it.Path; Line=$it.LineNumber; Kw=$kw} }
}
$results | ConvertTo-Json -Compress
```

**复用价值**: 任何 Node → PS 的多关键词搜索场景都该这么做,而不是试图用 `|`。**未来升级**: 中文 n-gram + Windows GBK 环境下召回质量一般,可考虑加 IK/Jieba 分词或换 ripgrep 全文索引(2026-08-18 实测召回 5 query 笔记/ 命中 0 条)。

---

## 坑 4:patch 工具 `mode: replace` 必须显式 `replace_all: false`

**症状**: `patch(mode='replace', old_string='...', new_string='...')` 报 `old_string and new_string required`,明明两个都传了。

**真相**: Hermes 的 `patch` 工具在 background review 模式下,要求 `replace_all` 字段**显式声明**(即使默认是 false)。不传 = 被拒。

**正解**:
```js
// ❌ 错(隐式 default 被拒)
patch(mode='replace', old_string='...', new_string='...')

// ✅ 对
patch(mode='replace', old_string='...', new_string='...', replace_all=false)
```

**复用价值**: 任何 `patch` 工具调用,养成显式 `replace_all` 的习惯,避免重试 2-3 次。**该坑也影响 `skill_manage` 的 `patch` action**(在没 reload 完内容时也要求 skill_view 一次)。

---

## 坑 5:notify.ps1 收到 `-` 开头 / 中文动词会被解析为参数(已在 desktop-notify-protocol SKILL)

**症状**: `notify.ps1 -Message "...先..."` 报 `Cannot process argument transformation on parameter 'Timeout'. Cannot convert value "先" to type 'System.Int32'`

**真相**: notify.ps1 有 `-Timeout` 参数(数字),`-Message` 文本里**空格+数字+空格+中文动词** 会被 PowerShell 参数嗅探误当成 `-Timeout`。

**正解**:
- 整条命令用**单引号**包 `-Message '...'`
- 避免 message 文本里出现 `-Timeout 数字` 格式
- 用句号/逗号分隔,不要直接空格+数字+中文动词

**已落 `desktop-notify-protocol` SKILL.md 末尾,本文件仅作交叉引用**。

---

## 验证脚本模式(可重用)

`hermes-verify-memory-search.mjs` 模式可作模板:
- N 个 query × M 项断言
- **区分长 query(JSON 路径)和短 query(文本路径)**,断言分别写
- 第一次跑可能 0/N(验证脚本 bug 常见,**不要直接认输**),修后再跑
- 验证脚本放 `C:\Users\Administrator\AppData\Local\Temp\`(OS-safe temp,跑完删)

**不写成常驻测试套件**——ad-hoc 端到端,每次大改时跑一次即可。

---

## ad-hoc 验证 vs 单元测试(本会话关键判断)

2026-08-18 兄弟要求"改完跑测试",bot 选择写 ad-hoc 端到端脚本(node mjs)而不是 jest 单元测试。**判断依据**:
- `scripts/memory-search.mjs` 是**工具脚本**,不是业务代码
- 真实使用是 CLI 调用 + stdout 解析,不是 import 函数
- ad-hoc 跑出来的 elapsed_ms / summary 文本 / top_preview 都是**真实环境表现**
- jest 单元测试要 mock sqlite3 + child_process,Mock 一多反而失真

**复用**: 任何 `scripts/*.mjs` 类工具脚本,默认 ad-hoc 验证,不引 jest。
