#!/usr/bin/env node
// adhoc-check-skill-split.mjs — 验证 3 件套（拆胖 skill 后必跑,见 gts-skill-refactor-split Step 5）
//
// 用法: node adhoc-check-skill-split.mjs <skill-dir> <skill-name>
// 例:   node adhoc-check-skill-split.mjs "E:\Hermes Agent CN Desktop\data\hermes-home\skills\gts\opencode-schedule" opencode-schedule
//
// 检查:
//   1. SKILL.md 引用的 references/*.md 全部 exists
//   2. 引用方兼容(全 skill 库 grep <skill-name>,列出还在引用的 skill 名)
//   3. 关键命令/术语在拆分前后不丢(术语从 SKILL.md 顶部 grep 关键词)
//
// 输出: PASS / FAIL + 失败明细
// 跑完必删: rm $env:TEMP\adhoc-check-skill-split-*.mjs

import fs from 'node:fs';
import path from 'node:path';

const [, , skillDir, skillName] = process.argv;
if (!skillDir || !skillName) {
  console.error('用法: node adhoc-check-skill-split.mjs <skill-dir> <skill-name>');
  process.exit(1);
}

const skillMd = path.join(skillDir, 'SKILL.md');
if (!fs.existsSync(skillMd)) {
  console.error(`🔴 SKILL.md not found: ${skillMd}`);
  process.exit(1);
}

const mainText = fs.readFileSync(skillMd, 'utf8');
const allFiles = walkDir(skillDir);
const allText = allFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');
const refsDir = path.join(skillDir, 'references');

let pass = 0, fail = 0;
const fails = [];

console.log(`\n=== 验证 3 件套: ${skillName} ===\n`);

// 1) references 链接存在性
console.log('1️⃣ 主 SKILL.md 引用的 references/*.md 是否都存在:');
const refMatches = [...new Set([...mainText.matchAll(/references\/([\w\-\.]+\.md)/g)].map(m => m[1]))];
if (refMatches.length === 0) {
  console.log('  (无引用 — 主 skill 不指向 reference)');
} else {
  for (const ref of refMatches.sort()) {
    const f = path.join(refsDir, ref);
    if (fs.existsSync(f)) {
      console.log(`  ✅ ${ref}  (${(fs.statSync(f).size/1024).toFixed(1)}KB)`);
      pass++;
    } else {
      console.log(`  🔴 ${ref} MISSING`);
      fails.push(`missing-reference: ${ref}`);
      fail++;
    }
  }
}

// 1b) references 内部互相引用的 cross-reference
console.log('\n1️⃣b references 内部 cross-reference:');
if (fs.existsSync(refsDir)) {
  const refsFiles = fs.readdirSync(refsDir).filter(f => f.endsWith('.md'));
  for (const rf of refsFiles) {
    const t = fs.readFileSync(path.join(refsDir, rf), 'utf8');
    const crossRefs = [...new Set([...t.matchAll(/references\/([\w\-\.]+\.md)/g)].map(m => m[1]))];
    for (const cr of crossRefs) {
      const cf = path.join(refsDir, cr);
      if (fs.existsSync(cf)) {
        console.log(`  ✅ ${rf} → ${cr}`);
        pass++;
      } else {
        console.log(`  🔴 ${rf} → ${cr} MISSING`);
        fails.push(`cross-reference-missing: ${rf} → ${cr}`);
        fail++;
      }
    }
  }
}

// 2) 引用方兼容:全 skill 库 grep <skill-name>
console.log('\n2️⃣ 引用方兼容(全 skill 库 grep):');
const skillsRoot = path.resolve(skillDir, '..', '..'); // <hermes-home>/skills
const allSkills = walkDir(skillsRoot).filter(f => f.endsWith('SKILL.md') && f !== skillMd);
const referrers = allSkills.filter(f => fs.readFileSync(f, 'utf8').includes(skillName));
if (referrers.length === 0) {
  console.log('  (无引用方 — skill 是独立的)');
} else {
  for (const r of referrers.sort()) {
    const rel = path.relative(skillsRoot, path.dirname(r));
    console.log(`  ✅ ${rel}`);
    pass++;
  }
}

// 3) 关键命令/术语回归(从主 skill 顶部 50 行 grep)
console.log('\n3️⃣ 关键术语回归(从原 skill 头部 grep,新版全文件搜):');
const headText = mainText.split('\n').slice(0, 50).join('\n');
const keywords = [...new Set([...headText.matchAll(/`(?:node|opencode|gts|git|cd)[\s\S]{1,80}?`/g)].map(m => m[0].slice(1, -1)))];
const criticalKeywords = keywords.filter(k => k.length > 5 && k.length < 80).slice(0, 15);
for (const kw of criticalKeywords) {
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'g');
  const hits = (allText.match(re) || []).length;
  if (hits > 0) {
    console.log(`  ✅ "${kw.slice(0, 60)}${kw.length > 60 ? '...' : ''}"  ${hits} 处`);
    pass++;
  } else {
    console.log(`  🔴 "${kw}"  0 处(可能丢了!)`);
    fails.push(`keyword-lost: ${kw}`);
    fail++;
  }
}

// 总结
console.log(`\n=== 总计: PASS ${pass} / FAIL ${fail} ===`);
if (fail > 0) {
  console.log('\n🔴 失败明细:');
  fails.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
} else {
  console.log('\n✅ 3 件套全通,胖 skill 拆分完成。');
  process.exit(0);
}

function walkDir(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      out.push(...walkDir(full));
    } else if (e.isFile()) {
      out.push(full);
    }
  }
  return out;
}
