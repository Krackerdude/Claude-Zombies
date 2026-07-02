// Dr. Newton's Factory — roll logic, gum inventory (PackStore) and Liquid
// Divinium spending.
//
// Run: node test/factory.mjs

import { EventBus } from '../src/core/EventBus.js';
import { ProfileService } from '../src/profile/ProfileService.js';
import { MemoryAdapter } from '../src/profile/storage/MemoryAdapter.js';
import { PackStore } from '../src/gobblegums/PackStore.js';
import { DiviniumManager } from '../src/divinium/DiviniumManager.js';
import { rollFactory, wagerCost, MAX_WAGER, VAT_COST } from '../src/factory/factory.js';
import { gumById } from '../src/gobblegums/gobblegums.js';

let failures = 0;
const ok = (m) => console.log('  ok  :', m);
const fail = (m, e) => { console.error('  FAIL:', m, e ? '\n        ' + (e.stack || e) : ''); failures++; };
function assert(c, m) { c ? ok(m) : fail(m); }

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
async function profile() { return await new ProfileService(new MemoryAdapter(), { autosaveMs: 5 }).init(); }

console.log('\n[1] wagerCost clamps to 1..3 vats');
{
  assert(wagerCost(1) === VAT_COST, '1 vat costs 1 vial');
  assert(wagerCost(3) === 3 * VAT_COST, '3 vats cost 3 vials');
  assert(wagerCost(0) === VAT_COST && wagerCost(9) === MAX_WAGER * VAT_COST, 'clamps low + high');
}

console.log('\n[2] a plain roll (no procs) yields exactly `wager` gums');
{
  const never = () => 0.999; // never triggers booster/double, picks last-weighted
  for (const w of [1, 2, 3]) {
    const r = rollFactory(w, never);
    assert(r.rewards.length === w, `wager ${w} -> ${w} reward(s)`);
    assert(!r.powerBooster && r.doubles === 0 && r.multiplier === 1, `wager ${w} no modifiers`);
    assert(r.rewards.every((x) => x.count === 1), `wager ${w} single copies`);
    assert(r.rewards.every((x) => gumById(x.gum.id)), `wager ${w} rewards are real gums`);
    assert(r.cost === wagerCost(w), `wager ${w} cost matches`);
  }
}

console.log('\n[3] all-procs roll: booster fills 3 vats, doubles stack');
{
  const always = () => 0.0; // triggers everything
  const w2 = rollFactory(2, always);
  assert(w2.powerBooster && w2.vatsShown === 3 && w2.rewards.length === 3, 'wager 2 + booster -> 3 vats');
  assert(w2.doubles === 1 && w2.multiplier === 2, 'wager 2 doubles once (x2)');

  const w3 = rollFactory(3, always);
  assert(!w3.powerBooster, 'wager 3 never offers a booster (already full)');
  assert(w3.doubles === 2 && w3.multiplier === 4, 'wager 3 can double twice (x4)');
  assert(w3.rewards.every((x) => x.count === 4), 'wager 3 rewards quadrupled');
}

console.log('\n[4] rolls are deterministic for a given rng seed');
{
  const a = rollFactory(3, mulberry32(4242));
  const b = rollFactory(3, mulberry32(4242));
  assert(JSON.stringify(a) === JSON.stringify(b), 'same seed -> identical roll');
  const c = rollFactory(3, mulberry32(4243));
  assert(JSON.stringify(a) !== JSON.stringify(c), 'different seed -> different roll');
}

console.log('\n[5] PackStore gum inventory: grant/own/persist');
{
  const p = await profile();
  const packs = new PackStore(p, new EventBus());
  assert(packs.owned('always-done-swiftly') === 0, 'unknown gum owned = 0');
  assert(packs.grantGum('always-done-swiftly', 2) === 2, 'grantGum returns new count');
  packs.grantGum('always-done-swiftly', 1);
  assert(packs.owned('always-done-swiftly') === 3, 'stacks');
  packs.grantMany([{ gum: 'coagulant', count: 4 }, { gum: 'always-done-swiftly', count: 1 }]);
  assert(packs.owned('coagulant') === 4 && packs.owned('always-done-swiftly') === 4, 'grantMany applies');
  assert(packs.totalOwned() === 8, 'totalOwned sums');

  // a fresh store on the same profile restores the inventory
  const packs2 = new PackStore(p, new EventBus());
  assert(packs2.owned('coagulant') === 4, 'inventory persisted to profile');
}

console.log('\n[6] Liquid Divinium spend + affordability');
{
  const p = await profile();
  const events = new EventBus();
  const mgr = new DiviniumManager({ events, profile: p });
  mgr.grant(5, { silent: true });
  assert(mgr.count() === 5, 'granted 5');
  assert(mgr.canAfford(3) && !mgr.canAfford(6), 'canAfford reflects balance');

  let changed = null; events.on('divinium:changed', (e) => { changed = e; });
  assert(mgr.spend(3) === true && mgr.count() === 2, 'spend deducts');
  assert(changed && changed.total === 2 && changed.spent === 3, 'spend emits divinium:changed');
  assert(mgr.spend(5) === false && mgr.count() === 2, 'overspend refused, balance intact');
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}\n`);
process.exit(failures === 0 ? 0 : 1);
