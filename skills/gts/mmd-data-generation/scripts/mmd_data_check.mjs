// scripts/mmd_data_check.mjs
// mmd_tool 数据写回实测脚本：读 MMDData.ts，对照 issue solution.md §11.2 期望表，
// 输出"期望 vs 实际"明细 + PASS/FAIL。
//
// 用法：
//   node scripts/mmd_data_check.mjs --character XiaHui
//   node scripts/mmd_data_check.mjs --character XiaHui --mmd-data <path> --json
//
// 默认路径：
//   --mmd-data D:/Github/GTS-Play/mods/mmd-character-extend/src/json/MMDData.ts
//
// 期望定义在本脚本 EXPECTATIONS 数组里，按 issue 维护。当前预置 XiaHui 10 项
// + Xiaye1 picked 回归项（取自 2026-08-17-xiahui-data-fix solution.md §11.2）。
//
// 教训（2026-08-18 XiaHui Phase C）：单元测试 + tsc 双绿 ≠ 数据文件真被脚本重写。
// 本脚本是第三门禁 — 必须实际读 MMDData.ts 核对 issue §11.2 期望值。

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
}
const character = getArg('character', 'XiaHui');
const mmdDataPath = resolve(getArg('mmd-data', 'D:/Github/GTS-Play/mods/mmd-character-extend/src/json/MMDData.ts'));
const jsonOutput = args.includes('--json');

const mmd = readFileSync(mmdDataPath, 'utf8');

// 工具：取 character 块内容（从 mmdCharacter: mmdCharacter.<X> 起到下一个 mmdCharacter: 或函数结尾）
function extractBlocks(src, char) {
  const lines = src.split('\n');
  const blocks = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`mmdCharacter: mmdCharacter.${char}`)) {
      cur = { start: i, lines: [] };
    } else if (cur && (/^export let\s/.test(lines[i].trim()) || /^export function\s/.test(lines[i].trim()) || /^}\s*$/.test(lines[i].trim()))) {
      cur.end = i;
      blocks.push(cur);
      cur = null;
    } else if (cur) {
      cur.lines.push(lines[i]);
    }
  }
  return blocks;
}

// 工具：从块内提取「未注释」的数值/字段
function uncommentedText(blocks) {
  return blocks.map(b => b.lines).flat().filter(l => !l.trim().startsWith('//')).join('\n');
}

// 工具：找 mmdCharacter 块内特定 key 的非注释值
function findFieldValue(blocks, key) {
  const text = uncommentedText(blocks);
  const re = new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*$`, 'm');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

// 工具：取函数体（含尾随换行）
function getFuncBody(src, funcName) {
  const re = new RegExp(`export let ${funcName} = \\([\\s\\S]+?\\n\\}\\n`);
  const m = src.match(re);
  return m ? m[0] : '';
}

const blocks = extractBlocks(mmd, character);

const EXPECTATIONS = {
  XiaHui: [
    // §11.2 写回期望表（2026-08-17-xiahui-data-fix solution.md）
    { id: '§7',  func: 'getShoeData',          key: 'yOffset',          expect: '-1', note: 'notIKBones 全ての親 yOffset' },
    { id: '§7',  func: 'getShoeData',          key: 'ikYOffset',        expect: '+1.0', note: 'ikBones yOffset（toEqual 容差 <0.001）' },
    { id: '§9',  func: 'getPutToShoeTransform', key: 'positionOffset',  expect: '[0, -1.1, 1.2]', note: 'positionOffset 数组' },
    { id: '§9',  func: 'getPutToShoeTransform', key: 'isToToe',         expect: 'true', note: '鞋子露脚趾' },
    { id: '§10', func: 'getPickedTransform',    key: 'positionOffset',  expect: '[-0.335, -0.272, +0.031]', note: '拳心+表面浮出（容差 <0.001）' },
    { id: '§8',  func: 'getBoneNameForLightStressing', key: '__no_block__', expect: 'absent', note: '无胸角色 → 不应有 XiaHui 块' },
    { id: '§8',  func: 'getDataForPartialScale',       key: '__no_block__', expect: 'absent', note: '无胸角色 → 不应有 XiaHui 块' },
    { id: '§5',  func: 'getClothCollisionData', key: '__damagePart_衣服__', expect: 'absent', note: 'XiaHui 应无衣服组' },
    { id: '§5',  func: 'getClothCollisionData', key: '__damagePart_奶罩__', expect: 'present', note: '应有奶罩组（Bra+tie）' },
  ],
  Xiaye1: [
    // 回归保护
    { id: '§10', func: 'getPickedTransform', key: 'positionOffset', expect: '[-0.334, -0.272, +0.031]', note: '拳心+表面浮出（兄弟要求双角色都修）' },
  ],
};

const expList = EXPECTATIONS[character] || [];

const results = [];
for (const e of expList) {
  let actual = null;
  let pass = false;
  let detail = e.note;

  if (e.key === '__no_block__') {
    const funcBody = getFuncBody(mmd, e.func);
    const charIdx = funcBody.indexOf(`mmdCharacter: mmdCharacter.${character}`);
    pass = charIdx < 0;
    actual = pass ? 'absent (无 XiaHui 块)' : 'present (仍有 XiaHui 块)';
  } else if (e.key.startsWith('__damagePart_')) {
    const partName = e.key.replace('__damagePart_', '').replace('__', '');
    const funcBody = getFuncBody(mmd, e.func);
    const charIdx = funcBody.indexOf(`mmdCharacter: mmdCharacter.${character}`);
    const after = charIdx >= 0 ? funcBody.substring(charIdx) : '';
    const nextChar = after.indexOf('mmdCharacter:', 'mmdCharacter:'.length);
    const charBlock = nextChar >= 0 ? after.substring(0, nextChar) : after;
    const uncommented = charBlock.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    const re = new RegExp(`damagePart:\\s*["']?${partName}["']?`);
    const hasPart = re.test(uncommented);
    if (e.expect === 'absent') {
      pass = !hasPart;
      actual = hasPart ? 'present (非注释)' : 'absent (或仅注释)';
    } else {
      pass = hasPart;
      actual = hasPart ? 'present (非注释)' : 'absent';
    }
  } else {
    actual = findFieldValue(blocks, e.key);
    pass = actual === e.expect;
  }

  results.push({
    issue: e.id,
    func: e.func,
    field: e.key,
    expect: e.expect,
    actual,
    pass,
    detail,
  });
}

if (jsonOutput) {
  const failed = results.filter(r => !r.pass);
  console.log(JSON.stringify({
    character,
    mmdDataPath,
    totalChecks: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    results,
    verdict: failed.length === 0 ? 'PASS' : 'FAIL',
  }, null, 2));
} else {
  console.log(`=== mmd_data_check: character=${character} ===`);
  console.log(`MMDData.ts: ${mmdDataPath}`);
  console.log('');
  for (const r of results) {
    const mark = r.pass ? '✅' : '❌';
    console.log(`${mark} [${r.issue}] ${r.func}.${r.field}`);
    console.log(`    期望: ${r.expect}`);
    console.log(`    实际: ${r.actual}`);
    console.log(`    说明: ${r.detail}`);
    console.log('');
  }
  const failed = results.filter(r => !r.pass);
  console.log(`=== ${results.length - failed.length}/${results.length} PASS, ${failed.length} FAIL ===`);
  console.log(failed.length === 0 ? '✅ ALL PASS — 数据写回符合 §11.2 期望' : `❌ FAIL — ${failed.length} 项不符合,issue 未实质完成`);
}

process.exit(results.every(r => r.pass) ? 0 : 1);