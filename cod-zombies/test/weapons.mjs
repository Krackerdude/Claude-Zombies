// Headless test for weapon behavior (pure JS — no THREE/DOM).
// Run: node test/weapons.mjs
import { makeWeapon } from '../src/weapons/catalog.js';

let failures = 0;
const assert = (c, m) => { if (!c) { console.error('  FAIL:', m); failures++; } else console.log('  ok  :', m); };
const near = (a, b, tol, m) => assert(Math.abs(a - b) <= tol, `${m} (${a} ~= ${b})`);

const DT = 1 / 60;

function makeCtx() {
  const c = {
    shots: 0, pellets: 0, projectiles: 0, cones: 0, recoil: [], ammoEmits: 0, lastSpread: 0,
    fireHeld: false, firePressed: false, reloadPressed: false, aiming: false,
    fireHitscan: (w, n, s) => { c.shots++; c.pellets += n; c.lastSpread = s; },
    spawnProjectile: () => { c.projectiles++; },
    fireCone: () => { c.cones++; },
    addRecoil: (p, y) => c.recoil.push([p, y]),
    emitAmmo: () => { c.ammoEmits++; },
    dryFire: () => {},
  };
  return c;
}
const step = (w, c, n, set = {}) => {
  Object.assign(c, set);
  for (let i = 0; i < n; i++) {
    w.update(DT, c);
    c.firePressed = false; // edge only on first frame of the block
  }
};

console.log('\n[1] auto fire respects fire rate + magazine');
{
  const w = makeWeapon('galil'); // 575 RPM, mag 30
  const c = makeCtx();
  step(w, c, 60, { fireHeld: true, firePressed: true }); // 1 second held
  const expected = Math.floor((575 / 60) * 1.0);
  near(c.shots, expected, 2, 'shots in 1s ~= RPM/60');
  assert(w.magazine === 30 - c.shots, 'magazine decremented per shot');
  assert(c.recoil.length === c.shots, 'recoil applied once per shot');
}

console.log('\n[2] semi fire needs a fresh trigger pull');
{
  const w = makeWeapon('m1911');
  const c = makeCtx();
  step(w, c, 30, { fireHeld: true, firePressed: true }); // hold: only 1 shot
  assert(c.shots === 1, 'one shot while held');
  step(w, c, 2, { fireHeld: false, firePressed: false }); // release
  step(w, c, 2, { fireHeld: true, firePressed: true }); // press again
  assert(c.shots === 2, 'second pull fires again');
}

console.log('\n[3] shotgun sprays pellets + reloads per shell');
{
  const w = makeWeapon('olympia'); // mag 2, 9 pellets, perShell
  const c = makeCtx();
  step(w, c, 1, { fireHeld: true, firePressed: true });
  assert(c.pellets === 9, 'one trigger pull = full pellet count');
  // empty it (wait out the pump cooldown between shots), then reload shell-by-shell
  step(w, c, 45, { fireHeld: false, firePressed: false });
  step(w, c, 1, { fireHeld: true, firePressed: true });
  step(w, c, 5, { fireHeld: false, firePressed: false });
  assert(w.magazine === 0, 'magazine emptied');
  step(w, c, 300, { reloadPressed: false }); // plenty of time for shells (auto-reload kicked in at empty)
  assert(w.magazine === 2 && !w.reloading, 'reloaded both shells incrementally');
}

console.log('\n[4] reserve drains on a magazine reload');
{
  const w = makeWeapon('galil'); // mag 30, reserve 300
  const c = makeCtx();
  step(w, c, 30, { fireHeld: true, firePressed: true }); // fire some
  const firedMag = 30 - w.magazine;
  step(w, c, 1, { fireHeld: false, firePressed: false, reloadPressed: true });
  step(w, c, 200, { reloadPressed: false });
  assert(w.magazine === 30, 'magazine refilled');
  assert(w.reserve === 300 - firedMag, 'reserve reduced by rounds loaded');
}

console.log('\n[5] ADS tightens spread');
{
  const w = makeWeapon('galil');
  const c = makeCtx();
  const hip = w.currentSpread();
  step(w, c, 60, { aiming: true }); // raise sights fully
  const ads = w.currentSpread();
  assert(ads < hip, `ADS spread < hip spread (${ads.toFixed(4)} < ${hip.toFixed(4)})`);
  assert(w.adsProgress > 0.9, 'ADS progress reaches ~1');
}

console.log('\n[6] projectile + cone weapons dispatch correctly');
{
  const ray = makeWeapon('rayGun'); const cr = makeCtx();
  step(ray, cr, 1, { fireHeld: true, firePressed: true });
  assert(cr.projectiles === 1 && cr.shots === 0, 'ray gun spawns a projectile, not a hitscan');

  const tg = makeWeapon('thundergun'); const ct = makeCtx();
  step(tg, ct, 1, { fireHeld: true, firePressed: true });
  assert(ct.cones === 1, 'thundergun fires a cone');
}

console.log('\n[7] death machine never reloads (reloadType none)');
{
  const w = makeWeapon('deathMachine');
  const c = makeCtx();
  w.magazine = 1;
  step(w, c, 1, { fireHeld: true, firePressed: true });
  assert(w.magazine === 0, 'fired last round');
  step(w, c, 1, { reloadPressed: true });
  step(w, c, 60, { reloadPressed: false });
  assert(!w.reloading && w.magazine === 0, 'cannot reload — stays empty');
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}\n`);
process.exit(failures === 0 ? 0 : 1);
