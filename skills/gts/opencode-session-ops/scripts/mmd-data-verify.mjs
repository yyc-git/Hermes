#!/usr/bin/env node
/**
 * mmd_data_verify.mjs — 强制最小验证集 (opencode-session-ops §1️⃣6️⃣ + §1️⃣9️⃣ 沉淀)
 *
 * 用途:OpenCode 报"§11.2 验收全过"后,bot 立刻跑这个脚本做 9 项实测断言,
 *       任何 FAIL → 立刻派 Phase Fix-r2。不信 agent 自报。
 *
 * 用法:
 *   node scripts/mmd-data-verify.mjs --file <path> --character <XiaHui|Xiaye1|...>
 *   node scripts/mmd-data-verify.mjs --file <path> --all
 *   node scripts/mmd-data-verify.mjs --file <path> --regression-base <commitHash>
 *
 * 退出码:0 = ALL PASS,1 = 有 FAIL,2 = 参数错
 *
 * 沉淀触发:2026-08-18 兄弟亲自 grep 抓到 Phase D-r2 §11.2 验收假象
 *           + Phase Fix-r3 jacket1 误伤 44 面实测反例。
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// 1. 解析参数
const args = process.argv.slice(2);
function getArg(name, fallback = null) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}
const file = getArg('--file');
const character = getArg('--character');
const allMode = args.includes('--all');
const baseHash = getArg('--regression-base');

if (!file || (!character && !allMode)) {
  console.error('用法: --file <path> [--character <name>|--all] [--regression-base <sha>]');
  process.exit(2);
}
const filePath = resolve(file);
if (!existsSync(filePath)) {
  console.error(`文件不存在: ${filePath}`);
  process.exit(2);
}

const content = readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// 2. 9 项实测断言
const results = []; // [PASS|FAIL|INFO, message]
const pass = (m) => results.push(['PASS', m]);
const fail = (m) => results.push(['FAIL', m]);
const info = (m) => results.push(['INFO', m]);

// === Check 1: 找出指定角色所有启用行块
function findCharacterBlocks(char) {
  const blocks = [];
  let startLine = -1;
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (startLine === -1) {
      if (ln.match(new RegExp(`mmdCharacter:\\s+mmdCharacter\\.${char},`)) && !ln.match().^\s*//) {
        startLine = i;
        depth = 0;
      }
    } else {
      depth += (ln.match(/{/g) || []).length;
      depth -= (ln.match(/}/g) || []).length;
      // 找到该块的结束
      if (depth <= 0 && ln.match(/^[\s]*,?\s*[}\]]/)) {
        blocks.push([startLine, i]);
        startLine = -1;
        depth = 0;
      } else if (ln.match(/^[\s]*\],?\s*$/)) {
        // 数组结束(角色 entries 数组)
        blocks.push([startLine, i]);
        startLine = -1;
        depth = 0;
      }
    }
  }
  return blocks;
}

// === Check 2: 每个 damagePart 必须配 damageParts 数组
function checkDamageParts(char) {
  const blocks = findCharacterBlocks(char);
  if (blocks.length === 0) {
    fail(`角色 ${char} 在 ${filePath} 找不到任何启用行`);
    return;
  }
  // 只对 cloth-collision 块做检查(范围 1500-1700 + 含 damagePart)
  for (const [s, e] of blocks) {
    if (e - s > 100) continue; // 大块(>100 行)通常是 getMMDData,跳过
    for (let i = s; i < e; i++) {
      if (!lines[i].match(/damagePart:/)) continue;
      // 找该行上下文 25 行内的 damageParts:
      let hasDP = false;
      let dpEmpty = false;
      for (let j = i + 1; j < Math.min(i + 25, e); j++) {
        if (lines[j].match(/^\s*\},?\s*$/)) break;
        const m = lines[j].match(/damageParts:\s*\[(.*)\]/);
        if (m && !lines[j].match(/^\s*//)) {
          hasDP = true;
          if (m[1].trim() === '') dpEmpty = true;
          break;
        }
      }
      if (!hasDP) {
        fail(`line ${i + 1}: damagePart=${lines[i].split(':')[1].trim()} 无 damageParts 数组`);
      } else if (dpEmpty) {
        fail(`line ${i + 1}: damageParts 数组为空 []`);
      } else {
        pass(`line ${i + 1}: damagePart + damageParts 都存在`);
      }
    }
  }
}

// === Check 3: §1 双函数去重
function checkResourcePathDedup(char) {
  const matches = lines.filter(l =>
    new RegExp(`^export let get${char}.*ResourcePath`).test(l)
  );
  // 也匹配 大小写不一致的变体
  const variantMatches = lines.filter(l =>
    new RegExp(`^export let get${char.charAt(0).toLowerCase() + char.slice(1)}ResourcePath`).test(l)
  );
  const total = new Set([...matches.map(m => m.trim()), ...variantMatches.map(m => m.trim())]).size;
  if (total > 1) {
    fail(`§1 双函数去重失败:找到 ${total} 个 get<${char}>ResourcePath export`);
    matches.concat(variantMatches).forEach(m => {
      const ln = lines.indexOf(m) + 1;
      info(`  line ${ln}: ${m.trim().substring(0, 80)}`);
    });
  } else if (total === 1) {
    pass(`§1 双函数去重:只有 1 个 get<${char}>ResourcePath`);
  } else {
    info(`§1 双函数去重:没找到 get<${char}>ResourcePath(可能不是该角色文件?)`);
  }
}

// === Check 4: 累积注释式旧块(应 ≤ 文件数)
function checkAccumulatedMarkers() {
  const regex = /----\s*新数据（gen-.*\.mjs\s*生成/;
  const matches = lines.filter(l => regex.test(l));
  if (matches.length === 0) {
    pass('累积注释式旧块:无 marker(全清理干净)');
  } else if (matches.length > 50) {
    fail(`累积注释式旧块: ${matches.length} 处 marker(>50 表示清理失败)`);
  } else {
    info(`累积注释式旧块: ${matches.length} 处 marker(<50 可能合理, >50 必查)`);
  }
}

// === Check 5: lightStressing / partialScale 对无胸角色跳过
function checkChestSkipped(char) {
  // 找 getBoneNameForLightStressing 函数范围(line 3356 附近) 和 getDataForPartialScale(line 3517 附近)
  const lsStart = lines.findIndex(l => /^export let getBoneNameForLightStressing/.test(l));
  const dsStart = lines.findIndex(l => /^export let getDataForPartialScale/.test(l));
  if (lsStart === -1 || dsStart === -1) {
    info('lightStressing/partialScale 函数未找到');
    return;
  }
  // 找下一个 export let 函数作为范围结束
  const lsEnd = lines.findIndex((l, i) => i > lsStart && /^export let /.test(l));
  const dsEnd = lines.findIndex((l, i) => i > dsStart && /^export let /.test(l));

  const inLightStressing = lines.slice(lsStart, lsEnd).some(l =>
    l.match(new RegExp(`mmdCharacter:\\s+mmdCharacter\\.${char},`)) && !l.match(/^\s*//)
  );
  const inPartialScale = lines.slice(dsStart, dsEnd).some(l =>
    l.match(new RegExp(`mmdCharacter:\\s+mmdCharacter\\.${char},`)) && !l.match(/^\s*//)
  );
  if (inLightStressing) {
    fail(`§8 lightStressing: ${char} 应跳过(无胸)但仍在启用行`);
  } else {
    pass(`§8 lightStressing: ${char} 已跳过(无胸)`);
  }
  if (inPartialScale) {
    fail(`§8 partialScale: ${char} 应跳过(无胸)但仍在启用行`);
  } else {
    pass(`§8 partialScale: ${char} 已跳过(无胸)`);
  }
}

// === Check 6: picked transform 期望值精确匹配
function checkPicked(char, expected) {
  const blockRegex = new RegExp(`getPickedTransform[\\s\\S]*?mmdCharacter:\\s+mmdCharacter\\.${char},[\\s\\S]{0,200}positionOffset:\\s*\\[([^\\]]+)\\]`);
  const m = content.match(blockRegex);
  if (!m) {
    fail(`§10 picked: ${char} 找不到 getPickedTransform 块`);
    return;
  }
  const actual = m[1].trim();
  if (actual === expected.join(',')) {
    pass(`§10 picked ${char}: ${actual}`);
  } else {
    fail(`§10 picked ${char}: 期望 [${expected.join(',')}] 实际 [${actual}]`);
  }
}

// === Check 7: shoe yOffset 期望值
function checkShoeYOffset(char, expectedNotIK, expectedIK) {
  const block = lines.find(l => l.match(new RegExp(`mmdCharacter:\\s+mmdCharacter\\.${char},`)));
  if (!block) return;
  // 找后续 50 行内的 notIKBones / ikBones yOffset
  const startLine = lines.indexOf(block);
  const slice = lines.slice(startLine, startLine + 100).join('\n');
  const notIKMatch = slice.match(/notIKBones[\s\S]*?yOffset:\s*(-?[\d.]+)/);
  const ikMatch = slice.match(/ikBones[\s\S]*?yOffset:\s*(-?[\d.]+)/);
  if (notIKMatch && Number(notIKMatch[1]) === expectedNotIK) {
    pass(`§7 shoe yOffset notIK: ${notIKMatch[1]}`);
  } else if (notIKMatch) {
    fail(`§7 shoe yOffset notIK: 期望 ${expectedNotIK} 实际 ${notIKMatch[1]}`);
  } else {
    info(`§7 shoe yOffset notIK: 未找到`);
  }
  if (ikMatch && Number(ikMatch[1]) === expectedIK) {
    pass(`§7 shoe yOffset ik: ${ikMatch[1]}`);
  } else if (ikMatch) {
    fail(`§7 shoe yOffset ik: 期望 ${expectedIK} 实际 ${ikMatch[1]}`);
  }
}

// === Check 8: putToShoe transform 期望
function checkPutToShoe(char, expectedOffset, expectedIsToToe = true) {
  const slice = content.substring(content.indexOf(`getPutToShoeTransform`));
  const blockMatch = slice.match(new RegExp(`mmdCharacter:\\s+mmdCharacter\\.${char},[\\s\\S]{0,500}positionOffset:\\s*\\[([^\\]]+)\\]\\s*,\\s*isToToe:\\s*(true|false)`));
  if (!blockMatch) {
    fail(`§9 putToShoe: ${char} 找不到完整块(positionOffset + isToToe)`);
    return;
  }
  const actual = blockMatch[1].trim();
  const isToToe = blockMatch[2] === 'true';
  if (actual === expectedOffset.join(',')) {
    pass(`§9 putToShoe ${char} positionOffset: ${actual}`);
  } else {
    fail(`§9 putToShoe ${char} positionOffset: 期望 [${expectedOffset.join(',')}] 实际 [${actual}]`);
  }
  if (isToToe === expectedIsToToe) {
    pass(`§9 putToShoe ${char} isToToe: ${isToToe}`);
  } else {
    fail(`§9 putToShoe ${char} isToToe: 期望 ${expectedIsToToe} 实际 ${isToToe}`);
  }
}

// === Check 9: 回归保护(可选,需 baseHash)
function checkRegression(char, baseHash) {
  if (!baseHash) {
    info('回归保护:未提供 --regression-base,跳过');
    return;
  }
  // 简化版:用 git diff 拿字符出现的次数,期望 0
  const { spawnSync } = require('node:child_process');
  const r = spawnSync('git', [
    '-C', resolve(filePath, '../..'),
    'diff', baseHash, '--', filePath
  ], { encoding: 'utf8' });
  if (r.status !== 0) {
    info(`回归保护:git diff 失败(${r.stderr?.substring(0, 100) || 'unknown'})`);
    return;
  }
  const diff = r.stdout;
  const otherChars = ['Xiaye1', 'Ciming', 'Noah', 'Moye', 'Meibiwusi', 'Vanilla']
    .filter(c => c !== char);
  let foundOtherChar = false;
  for (const oc of otherChars) {
    // 在 diff 中检查其他角色是否被修改
    const inDiff = diff.split('\n').filter(l => l.startsWith('+') || l.startsWith('-'))
      .some(l => l.includes(`mmdCharacter.${oc}`));
    if (inDiff) {
      // 但要区分 mmdCharacter.XiaHui 引用 vs mmdCharacter.Xiaye1 启用行
      const isActualChange = diff.split('\n').filter(l => l.startsWith('+') || l.startsWith('-'))
        .some(l => l.match(new RegExp(`^[+\\-]\\s+mmdCharacter:\\s+mmdCharacter\\.${oc},`)));
      if (isActualChange) {
        fail(`回归保护: ${oc} 数据被改动(可能误伤)`);
        foundOtherChar = true;
      }
    }
  }
  if (!foundOtherChar) {
    pass(`回归保护: 其他角色未被改动(baseHash=${baseHash.substring(0, 7)})`);
  }
}

// 3. 执行(单角色或全角色模式)
const targets = allMode
  ? ['XiaHui', 'Xiaye1', 'Ciming', 'Noah', 'Moye', 'Meibiwusi', 'Vanilla']
  : [character];

for (const char of targets) {
  console.log(`\n=== 验证角色 ${char} ===`);
  checkDamageParts(char);
  checkResourcePathDedup(char);
  checkChestSkipped(char);

  // picked / putToShoe / yOffset 期望值按 §11.2 表(只 XiaHui / Xiaye1 有精确期望)
  if (char === 'XiaHui') {
    checkPicked('XiaHui', [-0.335, -0.272, 0.031]);
    checkPutToShoe('XiaHui', [0, -1.1, 1.2], true);
    checkShoeYOffset('XiaHui', -1, 1.0);
  } else if (char === 'Xiaye1') {
    checkPicked('Xiaye1', [-0.334, -0.272, 0.031]);
  }

  checkRegression(char, baseHash);
}

// 全局检查(不需要指定角色)
checkAccumulatedMarkers();

// 4. 汇总
console.log('\n========== 汇总 =========');
for (const [status, msg] of results) {
  console.log(`[${status}] ${msg}`);
}
const failCount = results.filter(r => r[0] === 'FAIL').length;
const passCount = results.filter(r => r[0] === 'PASS').length;
console.log(`\n${passCount} PASS, ${failCount} FAIL`);
process.exit(failCount === 0 ? 0 : 1);