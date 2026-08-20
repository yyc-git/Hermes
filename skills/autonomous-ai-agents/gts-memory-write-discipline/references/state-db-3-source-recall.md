# state.db 召回 + 3 源 prefetch 参考(2026-08-18 落地)

> 给 `gts-memory-write-discipline` § 五 + `gts-memory-search` 的实操层补充。
> 涵盖:state.db schema、3 源召回脚本架构、ad-hoc 验证模式、已知边界 case。

## state.db schema 速查

Hermes Desktop 形态的 `state.db` 位于 `E:\Hermes Agent CN Desktop\data\hermes-home\state.db`。

**核心表**:
- `sessions` — 会话元数据(id / title / started_at / ended_at / model / token 计数)
- `messages` — 单条对话(role / content / tool_name / tool_calls / timestamp / token_count / finish_reason / reasoning_content)
- `session_model_usage` — 按 model 聚合的 token 消耗
- `state_meta` / `gateway_routing` / `compression_locks` / `async_delegations` — 调度/压缩元信息

**FTS5 索引(现成,无需自己建)**:
- `messages_fts` + `messages_fts_trigram`(任一字符 3-gram 匹配,支持中文)
- 触发器自动同步:INSERT/UPDATE/DELETE messages 自动更新 FTS 索引
- 索引内容 = `COALESCE(content, '') || ' ' || COALESCE(tool_name, '') || ' ' || COALESCE(tool_calls, '')`(content + tool 名 + tool 调用)

**重要字段名(别猜)**:
- `timestamp` REAL(Unix epoch 秒)——不是 `created_at`
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `session_id` TEXT

## 3 源召回模式(state.db FTS5 + skills/ + 笔记/)

**架构选择**(2026-08-18 实测定稿):
- **不用** Node 直接 grep(中文 2-gram 抽词后给 ripgrep 容易误召)
- **不用** Node inline `powershell -Command`(引号地狱,详见 `windows-powershell-pitfalls` "内联 PS 复杂命令必须用 .ps1 文件")
- ✅ **用** Node `execFileSync('powershell', ['-File', tmp.ps1, ...])` 走临时 .ps1 文件
- ✅ state.db 用 `sqlite3` CLI + FTS5 MATCH(自带倒排索引,毫秒级)
- ✅ keywords 提取:英文 `[A-Za-z0-9_\-\.]{2,}` / 中文 2-gram

**单 query 召回示例**:
```sql
SELECT m.id, m.session_id, m.role, m.timestamp,
       substr(m.content, 1, 250) AS preview, rank
FROM messages_fts mft
JOIN messages m ON m.id = mft.rowid
WHERE messages_fts MATCH '"关键词1" OR "关键词2"'
ORDER BY rank
LIMIT 5;
```

**FTS5 MATCH 注意**:
- 关键词加双引号转义:`"关键词"`
- 多个 OR 连接:`"a" OR "b"`
- 单引号在 SQL 里 `''` 转义

## ad-hoc 验证脚本模式(2026-08-18 落地)

新写任何本地脚本,启用前先写 `hermes-verify-<name>.mjs` 到 `%TEMP%` 跑端到端。**不是测试套件,是一次性验证,跑完删**。

```js
// C:\Users\Administrator\AppData\Local\Temp\hermes-verify-<name>.mjs
import { execFileSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";

const SCRIPT = "D:\\path\\to\\script.mjs";
if (!existsSync(SCRIPT)) { console.error("❌ 不存在"); process.exit(1); }

const tests = [
  ["query1", "expectedSource", "描述"],
  ["query2", "expectedSource", "描述"],
  // ... 5-10 个
];

let pass = 0, fail = 0;
for (const [query, expectedSource, desc] of tests) {
  const stdout = execFileSync("node", [SCRIPT, "--query", query, "--json"], { encoding: "utf8" });
  const parsed = JSON.parse(stdout);

  const checks = [
    { name: "summary 含 📎 召回:", ok: parsed.summary.includes("📎 召回:") },
    { name: "hits 是数组", ok: Array.isArray(parsed.hits) },
    { name: "hits.length ≤ 5", ok: parsed.hits.length <= 5 },
    { name: `至少 1 命中 ${expectedSource}`, ok: parsed.hits.some((h) => h.source === expectedSource) },
    { name: "elapsed_ms < 10000", ok: parsed.elapsed_ms < 10000 },
  ];

  const ok = checks.every((c) => c.ok);
  if (ok) pass++; else fail++;
  console.log(`[${ok ? "✅" : "❌"}] ${desc}`);
  for (const c of checks) console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}`);
}
console.log(`\n通过: ${pass}/${tests.length}  失败: ${fail}/${tests.length}`);

// 跑完删自己
unlinkSync("C:\\Users\\Administrator\\AppData\\Local\\Temp\\hermes-verify-<name>.mjs");
```

**为什么 5 个 query**:足够覆盖 happy path + 边界 case;不超 10 个是因为这是 ad-hoc 不是测试套件。

## 已知边界 case

### FTS5 中文 2-gram 召回精度(2026-08-18 实测)

- 2-gram 字符抽词 → 单字符查询召回可能偏弱(只命中"xx"中间,不限"开头/结尾")
- 实测:`Holographic memory 配置 desktop` → state.db 5 命中(高质量);`这样耗时间长吗` → 5 命中(质量中)
- 兄弟看到 "state.db×0" 而非 "×5" 会觉得机制没在用 → **保留 1-2 条哪怕弱命中**优先于"0 命中"

### PS Select-String 中英混合(2026-08-18 实测)

- PowerShell 默认 GBK,中文 2-gram + ASCII 关键词同时传 → 部分组合失败
- 解决:用 `[regex]::Escape($Pattern)`(已 inline)+ 每个关键词单跑一次 Select-String(不用 `|` 一次性 OR)

### Node 字符串 → PS 命令行引号地狱(2026-08-18 实测)

- 任何含中文 / `-` 开头 / `$var` / 类型字面量 / 多层引号 的 PS 命令,**禁止** `execSync('powershell -Command "..."')`
- ✅ 必须写 .ps1 文件 → `execFileSync('powershell', ['-File', tmp.ps1, ...])`
- 详见 `windows-powershell-pitfalls` "内联 PS 复杂命令必须用 .ps1 文件"

## 跨会话迁移:state.db 怎么跨机用

- `state.db` 是 SQLite 文件,**直接 cp 即可**
- FTS5 索引跟着 db 文件走,无需重建
- 跨机时如果路径不同,改 `scripts/memory-search.mjs` 顶部的 `STATE_DB` 常量
