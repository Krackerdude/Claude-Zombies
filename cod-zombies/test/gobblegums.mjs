// GobbleGum catalog integrity + 3D model factory smoke test.
//   - every gum has a valid rarity, activation and the required fields
//   - ids are unique; helpers resolve
//   - buildgumballModel builds (and disposes) for every activation type
//
// Run: node test/gobblegums.mjs

// minimal canvas/DOM stub so the gumball texture builder runs headless
const gradientStub = { addColorStop() {} };
const ctx2d = new Proxy({}, {
  get: (_t, p) => {
    if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => gradientStub;
    return () => {};
  },
  set: () => true,
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} }) };

import { GUMS, RARITIES, ACT, gumsByRarity, gumById, rarityName } from '../src/gobblegums/gobblegums.js';
import { gumGlyphSvg } from '../src/gobblegums/gumGlyphs.js';
import { buildgumballModel } from '../src/gobblegums/gumballModel.js';

let failures = 0;
const ok = (m) => console.log('  ok  :', m);
const fail = (m, e) => { console.error('  FAIL:', m, e ? '\n        ' + (e.stack || e) : ''); failures++; };
function assert(cond, m) { cond ? ok(m) : fail(m); }

const rarityIds = new Set(RARITIES.map((r) => r.id));
const actIds = new Set(Object.keys(ACT));

console.log('\n[1] every gum is well-formed');
{
  let bad = 0;
  for (const g of GUMS) {
    if (!g.id || !g.name || !g.effect || !g.duration) bad++;
    else if (!rarityIds.has(g.rarity)) bad++;
    else if (!actIds.has(g.act)) bad++;
    else if (!g.glyph) bad++;
  }
  assert(bad === 0, `all ${GUMS.length} gums have id/name/effect/duration + valid rarity/act/glyph (${bad} bad)`);
}

console.log('\n[2] ids are unique');
{
  const ids = GUMS.map((g) => g.id);
  assert(new Set(ids).size === ids.length, `no duplicate ids (${ids.length} gums)`);
}

console.log('\n[3] every rarity tab has gums; whimsical gums are all rainbow');
{
  for (const r of RARITIES) assert(gumsByRarity(r.id).length > 0, `${r.name} has ${gumsByRarity(r.id).length} gums`);
  const whimsy = gumsByRarity('whimsy');
  assert(whimsy.every((g) => g.act === 'whimsy'), 'all whimsical gums use the rainbow activation');
}

console.log('\n[4] helpers resolve');
{
  assert(gumById('perkaholic')?.name === 'Perkaholic', 'gumById finds Perkaholic');
  assert(gumById('does-not-exist') === null, 'gumById returns null for misses');
  assert(rarityName('ultra') === 'Ultra-Rare Mega', 'rarityName maps ultra');
  assert(typeof gumGlyphSvg('bolt') === 'string' && gumGlyphSvg('bolt').includes('<svg'), 'glyph svg renders');
}

console.log('\n[5] 3D gumball model builds + disposes for every activation type');
{
  for (const a of actIds) {
    try {
      const m = buildgumballModel(a);
      const okShape = m && m.children.length >= 1 && typeof m.userData.dispose === 'function';
      m.userData.dispose();
      assert(okShape, `built + disposed gumball for '${a}'`);
    } catch (e) { fail(`build gumball for '${a}'`, e); }
  }
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}\n`);
process.exit(failures === 0 ? 0 : 1);
