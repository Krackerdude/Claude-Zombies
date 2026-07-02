// Newton's Cookbook — recipe generation (deterministic, classic-free, tier-
// correct, special-deal flags, sorted) + crafting against the gum inventory.
//
// Run: node test/cookbook.mjs

import { EventBus } from '../src/core/EventBus.js';
import { ProfileService } from '../src/profile/ProfileService.js';
import { MemoryAdapter } from '../src/profile/storage/MemoryAdapter.js';
import { PackStore } from '../src/gobblegums/PackStore.js';
import { windowRecipes, currentRecipes, canCraft, craft, baseUp, baseDown, TIER, OUTCOME_ORDER, RECIPE_COUNT } from '../src/cookbook/cookbook.js';
import { gumById } from '../src/gobblegums/gobblegums.js';

let failures = 0;
const ok = (m) => console.log('  ok  :', m);
const fail = (m, e) => { console.error('  FAIL:', m, e ? '\n        ' + (e.stack || e) : ''); failures++; };
function assert(c, m) { c ? ok(m) : fail(m); }
async function packs() {
  const p = await new ProfileService(new MemoryAdapter(), { autosaveMs: 5 }).init();
  return new PackStore(p, new EventBus());
}

console.log('\n[1] deterministic per window + full pool');
{
  const a = windowRecipes(1000), b = windowRecipes(1000), c = windowRecipes(1001);
  assert(JSON.stringify(a) === JSON.stringify(b), 'same window -> identical recipes');
  assert(JSON.stringify(a) !== JSON.stringify(c), 'different window -> different recipes');
  assert(a.length === RECIPE_COUNT, `pool has ${RECIPE_COUNT} recipes`);
  assert(typeof currentRecipes()[0] === 'object', 'currentRecipes resolves');
}

console.log('\n[2] no classic; real gums; correct tier direction');
{
  const rs = windowRecipes(42);
  assert(rs.every((r) => gumById(r.input.gum) && gumById(r.output.gum)), 'inputs + outputs are real gums');
  assert(rs.every((r) => gumById(r.input.gum).rarity !== 'classic' && gumById(r.output.gum).rarity !== 'classic'), 'classic never appears');
  for (const r of rs) {
    const ti = TIER[gumById(r.input.gum).rarity], to = TIER[gumById(r.output.gum).rarity];
    if (r.type === 'up') { if (!(ti < to && r.output.count === 1 && r.input.count >= 2)) { fail('up recipe shape'); break; } }
    else { if (!(ti > to && r.input.count === 1 && r.output.count >= 2)) { fail('down recipe shape'); break; } }
  }
  ok('every recipe has a real tier jump in the right direction');
  assert(rs.every((r) => r.jump === Math.abs(TIER[gumById(r.output.gum).rarity] - TIER[gumById(r.input.gum).rarity])), 'jump matches the tier gap');
}

console.log('\n[3] special-deal flags reflect a better-than-standard trade');
{
  const rs = windowRecipes(7);
  assert(rs.every((r) => r.special === (r.type === 'up' ? r.input.count < baseUp(r.jump) : r.output.count > baseDown(r.jump))), 'special ⟺ in player\'s favour');
  assert(rs.some((r) => r.special) && rs.some((r) => !r.special), 'a mix of special + standard deals');
}

console.log('\n[4] sorted by outcome rarity');
{
  const rs = windowRecipes(9);
  let okOrder = true;
  for (let i = 1; i < rs.length; i++) if (OUTCOME_ORDER[rs[i].outRarity] < OUTCOME_ORDER[rs[i - 1].outRarity]) okOrder = false;
  assert(okOrder, 'recipes grouped/sorted by outcome');
}

console.log('\n[5] craft consumes input + grants output; blocked when short');
{
  const p = await packs();
  const r = windowRecipes(3).find((x) => x.type === 'up');
  assert(!canCraft(r, p) && craft(r, p) === false, 'cannot craft without the inputs');
  p.grantGum(r.input.gum, r.input.count);
  assert(canCraft(r, p), 'canCraft once inputs are owned');
  assert(craft(r, p) === true, 'craft succeeds');
  assert(p.owned(r.input.gum) === 0, 'inputs consumed');
  assert(p.owned(r.output.gum) === r.output.count, 'output granted');
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}\n`);
process.exit(failures === 0 ? 0 : 1);
