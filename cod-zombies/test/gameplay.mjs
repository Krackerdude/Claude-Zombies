// Pure-function gameplay rules: zombie health scaling + gait assignment.
// No engine/DOM needed — just the config helpers.
import { zombieHealthForRound, pickGait, Gaits } from '../src/config/zombies.js';

let failures = 0;
const ok = (m) => console.log('  ok  :', m);
const fail = (m, e) => { failures++; console.log('  FAIL:', m, '\n        ' + (e?.message || e)); };
const guard = (label, fn) => { try { fn(); ok(label); } catch (e) { fail(label, e); } };
const assert = (c, m) => { if (!c) throw new Error(m); };

console.log('\n[1] health curve: +100/round to 9, then +10% compounding');
guard('round 1 is 150 hp', () => assert(zombieHealthForRound(1) === 150, `got ${zombieHealthForRound(1)}`));
guard('rounds 1-9 add a flat 100/round (…,950 at r9)', () => {
  for (let r = 1; r <= 9; r++) {
    const exp = 150 + (r - 1) * 100;
    assert(zombieHealthForRound(r) === exp, `r${r}: got ${zombieHealthForRound(r)}, want ${exp}`);
  }
});
guard('round 10 is +10% over 950 (=1045)', () => assert(zombieHealthForRound(10) === Math.round(950 * 1.1), `got ${zombieHealthForRound(10)}`));
guard('round 12 compounds 10% three times (=1264)', () => assert(zombieHealthForRound(12) === Math.round(950 * 1.1 ** 3), `got ${zombieHealthForRound(12)}`));
guard('health strictly increases every round', () => {
  for (let r = 1; r < 40; r++) assert(zombieHealthForRound(r + 1) > zombieHealthForRound(r), `not increasing at r${r}`);
});

console.log('\n[2] gait assignment trends faster as rounds climb');
const dist = (round, n = 4000) => {
  const c = { shamble: 0, walk: 0, run: 0 };
  for (let i = 0; i < n; i++) c[pickGait(round)]++;
  return c;
};
guard('pickGait only returns defined gaits', () => {
  for (let i = 0; i < 500; i++) assert(Gaits[pickGait((i % 15) + 1)], 'unknown gait');
});
guard('gait speeds are ordered shamble < walk < run', () => {
  assert(Gaits.shamble.speed < Gaits.walk.speed && Gaits.walk.speed < Gaits.run.speed, 'speeds not ordered');
});
guard('round 1 is mostly shambling and never runs', () => {
  const c = dist(1);
  assert(c.run === 0, `r1 produced ${c.run} runners`);
  assert(c.shamble > c.walk, `r1 not shamble-dominant (${JSON.stringify(c)})`);
});
guard('mid rounds are walk-dominant', () => {
  const c = dist(5);
  assert(c.walk > c.shamble && c.walk > c.run, `r5 not walk-dominant (${JSON.stringify(c)})`);
});
guard('high rounds are mostly runners', () => {
  const c = dist(12);
  assert(c.run > c.walk && c.run > c.shamble, `r12 not run-dominant (${JSON.stringify(c)})`);
});

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}\n`);
process.exit(failures === 0 ? 0 : 1);
