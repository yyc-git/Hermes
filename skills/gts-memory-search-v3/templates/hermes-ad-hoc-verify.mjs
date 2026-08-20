#!/usr/bin/env node
/**
 * Hermes ad-hoc verify 模板(本会话确立,2026-08-18)
 *
 * 用途: 任何新本地脚本启用前,端到端验证。不是测试套件,不是 linter。
 * 模式: C:\Users\Administrator\AppData\Local\Temp\hermes-verify-<name>.mjs,跑完删
 * 规模: 5-10 个 query × 6-8 项断言
 *
 * 用法:
 *   1. 复制本文件到 %TEMP%\hermes-verify-<your-script-name>.mjs
 *   2. 改 SCRIPT 路径 + 改 tests 数组 + 改每段的 checks
 *   3. 跑 `node <路径>`,看通过/失败
 *   4. 跑完删 `Remove-Item <路径> -Force`
 *
 * 实战记录(本会话):
 *   - hermes-verify-memory-search.mjs: v1 5/5
 *   - hermes-verify-memory-search-v2.mjs: 5/5(第 1 次 0/5 因 #4 验证脚本 bug,修后 5/5)
 *   - hermes-verify-memory-search-v3.mjs: 5/5
 *   - hermes-verify-memory-search-archive.mjs: 3/3
 */

import { execFileSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ========== 配置区(改这两行) ==========
const SCRIPT = "D:\\Github\\GTS-Play\\scripts\\your-script.mjs";
// ====================================

if (!existsSync(SCRIPT)) {
  console.error("❌ 脚本不存在:", SCRIPT);
  process.exit(1);
}

// 跑 + 200ms 间隔(避 Windows sqlite 锁;非 sqlite 脚本去掉 sleep 也行)
function run(query, extraArgs = []) {
  const args = [SCRIPT, "--query", query, ...extraArgs];
  const out = execFileSync("node", args, {
    encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 15000,
  }).trim();
  const until = Date.now() + 200;
  while (Date.now() < until) {}  // busy-wait 200ms
  return out;
}
function parseJsonSafe(s) { try { return JSON.parse(s); } catch { return null; } }

// ========== 测试用例(改这数组) ==========
const tests = [
  // [query, 预期]
  ["sample query 1", { short: false, minHits: 1 }],
  ["sample query 2", { short: false, minHits: 1 }],
  ["a", { short: true, expectSummaryContains: "过短" }],  // 边界:2 字符跳过
  // ... 5-10 个 query
];
// ========================================

let pass = 0, fail = 0;
const t0 = Date.now();

for (const [query, expected] of tests) {
  const ts = Date.now();
  let stdout = "", err = null;
  try {
    const useJson = !expected.short;
    const args = [SCRIPT, "--query", query];
    if (useJson) args.push("--json");
    stdout = execFileSync("node", args, {
      encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 15000,
    });
  } catch (e) { err = e; }
  const elapsed = Date.now() - ts;

  let parsed = null, parseOk = false;
  if (stdout && !err && !expected.short) {
    try { parsed = JSON.parse(stdout); parseOk = true; } catch {}
  }

  const checks = [];
  checks.push({ name: "exit 0 + stdout 非空", ok: !err && !!stdout });
  if (!expected.short) checks.push({ name: "JSON 解析成功", ok: parseOk });

  if (expected.short) {
    // 短 query 路径: stdout 是文本(非 JSON)
    checks.push({
      name: `stdout 含 "${expected.expectSummaryContains}"`,
      ok: !!stdout && stdout.includes(expected.expectSummaryContains),
    });
  } else {
    // 长 query 路径: JSON 含必要字段
    checks.push({ name: "summary 字段存在", ok: parseOk && typeof parsed.summary === "string" });
    checks.push({ name: "hits 是数组", ok: parseOk && Array.isArray(parsed.hits) });
    checks.push({ name: `hits >= ${expected.minHits}`, ok: parseOk && parsed.hits.length >= expected.minHits });
    checks.push({ name: "hits <= 5", ok: parseOk && parsed.hits.length <= 5 });
    checks.push({ name: "elapsed_ms < 10000", ok: parseOk && parsed.elapsed_ms < 10000 });
    // 加你脚本特有的字段检查:
    // checks.push({ name: "top_previews 字段", ok: Array.isArray(parsed.top_previews) });
  }

  const allOk = checks.every((c) => c.ok);
  if (allOk) pass++; else fail++;

  console.log(`\n[${allOk ? "✅" : "❌"}] ${expected.short ? "短 query(应跳过)" : "长 query(应召回)"}`);
  console.log(`    query: "${query}"`);
  console.log(`    elapsed: ${elapsed}ms (脚本内: ${parsed?.elapsed_ms ?? "?"}ms)`);
  if (err) console.log(`    ERROR: ${String(err).slice(0, 200)}`);
  else console.log(`    summary: ${parsed?.summary?.slice(0, 80) || stdout.split("\n")[0]}`);
  for (const c of checks) console.log(`      ${c.ok ? "✓" : "✗"} ${c.name}`);
}

const totalElapsed = Date.now() - t0;
console.log(`\n========== VERIFY SUMMARY ==========`);
console.log(`通过: ${pass}/${tests.length}   失败: ${fail}/${tests.length}`);
console.log(`总耗时: ${totalElapsed}ms`);
console.log(`验证范围: ad-hoc 端到端(非测试套件)`);
console.log(`====================================`);

process.exit(fail > 0 ? 1 : 0);
