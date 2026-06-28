// Liquid Divinium earning logic. Drives the DiviniumManager against a real
// EventBus + a MemoryAdapter-backed ProfileService with a deterministic RNG, so
// the 10% roll and the 7-round guaranteed-drop milestone are testable headless.
//
// Run: node test/divinium.mjs

import { EventBus } from '../src/core/EventBus.js';
import { ProfileService } from '../src/profile/ProfileService.js';
import { MemoryAdapter } from '../src/profile/storage/MemoryAdapter.js';
import { DiviniumManager } from '../src/divinium/DiviniumManager.js';

let failures = 0;
const ok = (m) => console.log('  ok  :', m);
const fail = (m, e) => { console.error('  FAIL:', m, e ? '\n        ' + (e.stack || e) : ''); failures++; };
function assert(cond, m) { cond ? ok(m) : fail(m); }

// A scripted RNG so each roll is exact. Falls back to `tail` once the queue runs dry.
function scriptedRng(values, tail = 0.99) {
  let i = 0;
  return () => (i < values.length ? values[i++] : tail);
}

async function makeManager(rng) {
  const events = new EventBus();
  const profile = await new ProfileService(new MemoryAdapter(), { id: 'local', autosaveMs: 5 }).init();
  const earned = [];
  events.on('divinium:earned', (e) => earned.push(e));
  const mgr = new DiviniumManager({ events, profile, round: { round: 0 }, rng });
  return { events, profile, mgr, earned };
}

console.log('\n[1] base 10% roll: under 0.10 drops, at/above does not');
{
  // first roll 0.05 -> drop; second roll 0.5 -> no drop. amount uses the next rng.
  const { events, profile, earned } = await makeManager(scriptedRng([0.05, 0.0, 0.5]));
  events.emit('purchase', {}); // 0.05 < 0.10 -> drop, amount uses 0.0 -> 1
  events.emit('purchase', {}); // 0.5 -> no drop
  assert(earned.length === 1, `one drop from two purchases (got ${earned.length})`);
  assert(earned[0].amount === 1, `amount honored rng (got ${earned[0].amount})`);
  assert(profile.get('currency.liquidDivinium', 0) === 1, 'balance persisted to profile currency');
}

console.log('\n[2] drop amount always lands in 1..3');
{
  // every purchase drops (rng 0.0 for the chance); amount rng cycles 0/0.5/0.99
  const { events, earned } = await makeManager(scriptedRng([0.0, 0.0, 0.0, 0.5, 0.0, 0.99]));
  events.emit('purchase', {}); events.emit('purchase', {}); events.emit('purchase', {});
  const amts = earned.map((e) => e.amount);
  assert(amts.length === 3 && amts.every((a) => a >= 1 && a <= 3), `amounts in range: ${amts}`);
  assert(amts[0] === 1 && amts[1] === 2 && amts[2] === 3, `amounts map from rng: ${amts}`);
}

console.log('\n[3] round-7 milestone forces a guaranteed drop even when the roll would fail');
{
  // tail 0.99 means the 10% roll always FAILS — only the guarantee can drop.
  const { events, earned } = await makeManager(scriptedRng([], 0.99));
  events.emit('purchase', {}); // pre-milestone, roll fails -> nothing
  assert(earned.length === 0, 'no drop before the milestone with a failing roll');
  events.emit('round:changed', { round: 7 }); // arms one guaranteed drop
  events.emit('purchase', {}); // guaranteed -> drop
  assert(earned.length === 1, 'first purchase after round 7 is guaranteed');
  events.emit('purchase', {}); // back to 10%, roll fails -> nothing
  assert(earned.length === 1, 'subsequent purchases fall back to the base rate');
}

console.log('\n[4] each 7-round milestone re-arms exactly one guarantee');
{
  const { events, earned } = await makeManager(scriptedRng([], 0.99));
  events.emit('round:changed', { round: 7 });
  events.emit('purchase', {}); // guaranteed #1
  events.emit('round:changed', { round: 8 }); // not a new milestone
  events.emit('purchase', {}); // fails
  events.emit('round:changed', { round: 14 }); // new milestone -> re-arm
  events.emit('purchase', {}); // guaranteed #2
  assert(earned.length === 2, `two guarantees across two milestones (got ${earned.length})`);
}

console.log('\n[5] run:reset re-arms the round-7 milestone for a fresh game');
{
  const { events, earned } = await makeManager(scriptedRng([], 0.99));
  events.emit('round:changed', { round: 7 });
  events.emit('purchase', {}); // guaranteed
  events.emit('run:reset', {}); // new run wipes milestone tracking
  events.emit('round:changed', { round: 0 });
  events.emit('round:changed', { round: 7 }); // milestone re-arms in the new run
  events.emit('purchase', {}); // guaranteed again
  assert(earned.length === 2, `guarantee re-arms after a reset (got ${earned.length})`);
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}\n`);
process.exit(failures === 0 ? 0 : 1);
