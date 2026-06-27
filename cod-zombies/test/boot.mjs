// Headless boot smoke test. Exercises the REAL scene build + all gameplay
// systems (zombies, rounds, spawns, weapons, projectiles) using real THREE for
// math/objects and lightweight mocks for render/physics/input. This is the path
// that pure-logic tests can't cover, so wiring bugs (bad Transform args, missing
// services, null derefs in a system's update) surface here instead of in-browser.
//
// Run: node test/boot.mjs

// --- minimal DOM stubs (only what the texture utils + incidental code need) ---
const gradientStub = { addColorStop() {} };
const ctx2d = new Proxy({}, {
  get: (_t, p) => {
    if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => gradientStub;
    return () => {};
  },
  set: () => true,
});
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} }),
  getElementById: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720 };
if (!globalThis.navigator) globalThis.navigator = { userAgent: 'node' };
globalThis.performance = globalThis.performance ?? { now: () => Date.now() };
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

import * as THREE from 'three';
import { EventBus } from '../src/core/EventBus.js';
import { ServiceLocator, Service } from '../src/core/ServiceLocator.js';
import { Time } from '../src/core/Time.js';
import { World } from '../src/ecs/World.js';
import { GameState, AppState } from '../src/core/GameState.js';
import { Action } from '../src/config/keybinds.js';
import { ZombieTag, ProjectileTag, PlayerTag, Transform, Renderable, CorpseTag, RigidBodyRef } from '../src/ecs/components/index.js';
import { damageZombie } from '../src/weapons/damage.js';
import { ZombieConfig } from '../src/config/zombies.js';
import { buildArena } from '../src/scenes/ArenaScene.js';
import { buildHoundRig } from '../src/scenes/houndRig.js';
import { RenderSystem } from '../src/rendering/RenderSystem.js';
import { PlayerSystem } from '../src/player/PlayerSystem.js';
import { WEAPON_KEYS } from '../src/weapons/catalog.js';

let failures = 0;
const ok = (m) => console.log('  ok  :', m);
const fail = (m, e) => { console.error('  FAIL:', m, e ? '\n        ' + (e.stack || e) : ''); failures++; };
function guard(label, fn) { try { fn(); ok(label); } catch (e) { fail(label, e); } }

// --- mock services ---
const events = new EventBus();
const time = new Time();
const services = new ServiceLocator();
const gameState = new GameState(events);

const physics = {
  createStaticBox: () => ({ kind: 'static' }),
  createDynamicBox: () => ({ kind: 'dynamic' }),
  createCharacterCapsule: () => ({
    body: { translation: () => ({ x: 0, y: 1, z: 0 }), setNextKinematicTranslation() {}, setTranslation() {} },
    collider: { halfHeight: () => 0.6, radius: () => 0.3, setHalfHeight() {} },
    type: 'kinematic',
  }),
  moveCharacter: () => ({ movement: { x: 0, y: 0, z: 0 }, grounded: true }),
  setKinematicTarget: () => {},
  resizeCapsule: () => 0,
  hasHeadroom: () => true,
  removeBody: () => { physics._removed = (physics._removed || 0) + 1; },
};
const render = { camera: new THREE.PerspectiveCamera(60, 1.6, 0.1, 1000), renderer: {}, backend: 'mock', setFov() {}, setPixelRatioCap() {}, resize() {}, render() {}, setOverlayScene() {} };
const sceneMgr = { scene: new THREE.Scene(), sun: null, tunableTextures: [], add(o) { this.scene.add(o); } };

const pressEdges = new Set();
const heldActions = new Set();
const pressedActions = new Set();
const input = {
  pointerLocked: true, mouseDX: 0, mouseDY: 0,
  wasPressed: (c) => pressEdges.has(c), wasReleased: () => false, isDown: () => false,
};
const actions = {
  active: (a) => heldActions.has(a), pressed: (a) => pressedActions.has(a), released: () => false, axis: () => 0,
};

services.register(Service.Events, events);
services.register(Service.Time, time);
services.register(Service.GameState, gameState);
services.register(Service.Physics, physics);
services.register(Service.Render, render);
services.register(Service.Scene, sceneMgr);
services.register(Service.Input, input);
services.register(Service.Actions, actions);
services.register(Service.Assets, { onProgress() {} });

const world = new World(services);
const engineLike = { services, world };

console.log('\n[1] buildArena wires geometry + nav + AI services + systems');
guard('buildArena runs without throwing', () => buildArena(engineLike));
guard('Nav/Spawn/Round services registered', () => {
  if (!services.get(Service.Nav) || !services.get(Service.Spawn) || !services.get(Service.Round)) throw new Error('missing AI service');
});
guard('player entity exists', () => { if (world.first(PlayerTag) === undefined) throw new Error('no player'); });

// register the real RenderSystem so scene attach/detach + interpolation run
const renderSystem = new RenderSystem();
world.registerSystem(renderSystem);

// helper to advance the sim
const step = 1 / 60;
function tick(seconds) {
  const n = Math.round(seconds / step);
  for (let i = 0; i < n; i++) {
    time.elapsed += step;
    time.frameCount++;
    world.fixedUpdate(step);
    world.update(step);
    world.lateUpdate(step);
    renderSystem.draw(0); // exercises scene attach + dead-entity detach
    pressEdges.clear(); pressedActions.clear(); // edges last one tick
  }
}

console.log('\n[2] entering PLAYING starts a run + announces a weapon');
let weaponAnnounced = false, roundStarted = false;
events.on('weapon:changed', () => { weaponAnnounced = true; });
events.on('round:changed', ({ state }) => { if (state === 'active') roundStarted = true; });
guard('gameState -> PLAYING triggers system handlers', () => gameState.set(AppState.PLAYING));

console.log('\n[3] simulate ~12s: zombies spawn, path, and tear barriers');
guard('12s of fixed/update/late ticks run clean', () => tick(12));
const zombieCount = [...world.query(ZombieTag)].length;
guard(`zombies were spawned and are alive (${zombieCount})`, () => { if (zombieCount <= 0) throw new Error('no zombies spawned'); });

guard('zombies have a low-poly rig that the animator poses', () => {
  const zid = [...world.query(ZombieTag, Renderable)][0];
  if (zid === undefined) throw new Error('no zombie to inspect');
  const rig = world.get(zid, Renderable).object3d;
  const J = rig.userData?.joints;
  if (!J || !J.shoulderL || !J.thighR || !J.head) throw new Error('rig joints missing');
  const before = J.thighL.rotation.x;
  for (let i = 0; i < 20; i++) { time.elapsed += step; world.fixedUpdate(step); world.update(step); world.lateUpdate(step); }
  if (J.thighL.rotation.x === before && J.shoulderL.rotation.x === 0) throw new Error('animator did not pose the rig');
});
guard('a round became active', () => { if (!roundStarted) throw new Error('round never started'); });
guard('starting weapon was announced', () => { if (!weaponAnnounced) throw new Error('no weapon:changed'); });

console.log('\n[4] every weapon fires without throwing (hitscan / pellets / projectile / cone)');
const weapons = services.get(Service.Weapons);
const freshRun = () => { gameState.set(AppState.MENU); gameState.set(AppState.PLAYING); tick(0.1); };
const topHealth = () => { const pid = world.first(PlayerTag); if (pid !== undefined) { const p = world.get(pid, PlayerTag); p.health = p.maxHealth; } };
guard('grant + fire each catalog weapon', () => {
  freshRun();
  for (const key of WEAPON_KEYS) {
    weapons.giveWeapon(key); // equips it
    topHealth();
    heldActions.add(Action.FIRE); pressedActions.add(Action.FIRE);
    for (let i = 0; i < 40; i++) {
      time.elapsed += step; world.fixedUpdate(step); world.update(step); world.lateUpdate(step);
      pressedActions.delete(Action.FIRE); pressEdges.clear();
    }
    heldActions.delete(Action.FIRE);
    tick(0.2);
  }
});

console.log('\n[5] ADS + sniper scope path');
guard('aim down sights (sniper) emits scoped state', () => {
  let scoped = false;
  events.on('weapon:ads', (e) => { if (e.scoped) scoped = true; });
  freshRun();
  weapons.giveWeapon('dsr'); topHealth();
  heldActions.add(Action.AIM); tick(0.4);
  heldActions.delete(Action.AIM); tick(0.2);
  if (!scoped) throw new Error('scoped state never emitted');
});

console.log('\n[6] projectiles travel + detonate (ray gun)');
guard('ray gun spawns travelling projectiles', () => {
  freshRun();
  weapons.giveWeapon('rayGun'); topHealth();
  let sawProjectile = false;
  for (let s = 0; s < 5 && !sawProjectile; s++) {
    pressedActions.add(Action.FIRE); heldActions.add(Action.FIRE); heldActions.delete(Action.FIRE); // tap (reset semi latch)
    // single manual step: fixed -> update (spawns the bolt) -> inspect before the
    // next fixed step moves/cleans it up
    time.elapsed += step; world.fixedUpdate(step); world.update(step); world.lateUpdate(step);
    if ([...world.query(ProjectileTag)].length > 0) sawProjectile = true;
    pressedActions.clear(); pressEdges.clear();
    tick(0.1); // let any live bolt fly on
  }
  heldActions.delete(Action.FIRE);
  if (!sawProjectile) throw new Error('no projectile entities were created');
});

console.log('\n[7] repair a damaged window by holding interact');
let barrierChanged = false;
events.on('barrier:changed', () => { barrierChanged = true; });
guard('holding interact rebuilds boards and awards points', () => {
  gameState.set(AppState.MENU);
  gameState.set(AppState.PLAYING);
  tick(0.05);
  const nav = services.get(Service.Nav);
  const b = nav.barriers[0];
  b.boards = 2; // simulate prior damage
  const pid = world.first(PlayerTag, Transform);
  const player = world.get(pid, PlayerTag);
  const t = world.get(pid, Transform);
  t.position.set(b.position.x, 1.2, b.position.z); // stand at the window
  const ptsBefore = player.points;
  heldActions.add(Action.INTERACT);
  tick(2.0); // hold ~2s; boards rebuild at ~0.5s each
  heldActions.delete(Action.INTERACT);
  if (player.points <= ptsBefore) throw new Error('no points awarded for repair');
  if (!barrierChanged) throw new Error('no barrier:changed emitted');
});

console.log('\n[8] killed zombies remove their meshes from the scene');
guard('destroyed zombie entities are detached from the scene graph', () => {
  gameState.set(AppState.MENU);
  gameState.set(AppState.PLAYING);
  tick(4); // spawn a few
  const ids = [...world.query(ZombieTag)];
  if (ids.length === 0) throw new Error('no zombies to kill');
  const objs = ids.map((id) => world.get(id, Renderable).object3d);
  const attachedBefore = objs.filter((o) => o.parent).length;
  if (attachedBefore !== objs.length) throw new Error('zombie meshes were never attached');

  const spawnMgr = services.get(Service.Spawn);
  for (const id of ids) { world.destroyEntity(id); spawnMgr.notifyKilled(); }
  tick(0.05); // a draw runs the scene reconcile

  const stillAttached = objs.filter((o) => o.parent).length;
  const stillTagged = ids.filter((id) => world.get(id, ZombieTag) !== undefined).length;
  if (stillTagged !== 0) throw new Error(`${stillTagged} killed entities still have a ZombieTag`);
  if (stillAttached !== 0) throw new Error(`${stillAttached}/${objs.length} killed meshes still in the scene`);
});

console.log('\n[9] economy: wall-buy purchase + mystery box');
guard('buying a wall-buy grants the weapon; the box rolls + can be taken', () => {
  gameState.set(AppState.MENU);
  gameState.set(AppState.PLAYING);
  tick(0.1);
  const economy = services.get(Service.Economy);
  const weapons = services.get(Service.Weapons);
  const pid = world.first(PlayerTag, Transform);
  const player = world.get(pid, PlayerTag);
  const t = world.get(pid, Transform);

  // wall-buy
  const wb = economy.wallBuys[0];
  player.points = 6000;
  t.position.set(wb.position.x, 1.2, wb.position.z);
  pressedActions.add(Action.INTERACT);
  tick(0.05);
  pressedActions.delete(Action.INTERACT);
  if (!weapons.owns(wb.key)) throw new Error('wall-buy did not grant the weapon');
  if (player.points >= 6000) throw new Error('wall-buy did not charge points');

  // mystery box
  let boxOk = false;
  events.on('buy:ok', (e) => { if (e.box) boxOk = true; });
  player.points = 6000;
  t.position.set(economy.box.position.x, 1.2, economy.box.position.z);
  pressedActions.add(Action.INTERACT); tick(0.05); pressedActions.delete(Action.INTERACT); // start spin
  tick(4.0); // let it land (boxSpinTime ~3.2s)
  pressedActions.add(Action.INTERACT); tick(0.05); pressedActions.delete(Action.INTERACT); // take prize
  if (!boxOk) throw new Error('mystery box prize was not taken');
});

console.log('\n[10] kills ragdoll into corpses, then despawn');
guard('a killed zombie becomes a no-collision corpse that later despawns', () => {
  freshRun();
  tick(4);
  const zid = [...world.query(ZombieTag)][0];
  if (zid === undefined) throw new Error('no zombie to kill');
  const obj = world.get(zid, Renderable).object3d;
  const player = world.get(world.first(PlayerTag), PlayerTag);
  damageZombie({ world, spawn: services.get(Service.Spawn), events, player }, zid, 1e6, { dir: { x: 1, z: 0 } });
  if (world.get(zid, ZombieTag) !== undefined) throw new Error('still a live zombie after kill');
  if (world.get(zid, CorpseTag) === undefined) throw new Error('no corpse created on death');
  tick(0.2);
  if (!obj.parent) throw new Error('corpse mesh vanished immediately (should ragdoll first)');
  // ragdoll dynamics: joints stay finite + within their limits, and vary
  tick(1.5);
  const Jr = obj.userData.joints;
  const angles = [Jr.shoulderL.rotation.x, Jr.shoulderR.rotation.x, Jr.elbowL.rotation.x, Jr.kneeR.rotation.x];
  if (angles.some((a) => !Number.isFinite(a))) throw new Error('ragdoll produced non-finite joint angles');
  if (Jr.shoulderL.rotation.x < -2.71 || Jr.shoulderL.rotation.x > 0.71) throw new Error('shoulder exceeded its joint limit (would clip the torso)');
  if (Jr.elbowL.rotation.x < -0.01) throw new Error('elbow hyperextended past its stop');
  if (Math.abs(Jr.shoulderL.rotation.x - Jr.shoulderR.rotation.x) < 1e-4 && Math.abs(Jr.elbowL.rotation.x - Jr.elbowR.rotation.x) < 1e-4) {
    throw new Error('ragdoll limbs are perfectly symmetric (no per-limb variation)');
  }
  // once settled on the ground, limbs must lie limp on the floor: not flung up,
  // not buried through it
  tick(2.5);
  const eff = [Jr.handL, Jr.handR, Jr.footL, Jr.footR, Jr.head];
  obj.updateMatrixWorld(true);
  const ys = eff.map((e) => e.getWorldPosition(new THREE.Vector3()).y);
  if (ys.some((y) => y > 1.1)) throw new Error(`limb sticking up after settling (max y=${Math.max(...ys).toFixed(2)})`);
  if (ys.some((y) => y < -0.1)) throw new Error(`limb sank through the floor (min y=${Math.min(...ys).toFixed(2)})`);
  tick(11); // past 10s lifetime + sink
  if (world.get(zid, CorpseTag) !== undefined) throw new Error('corpse never despawned');
  if (obj.parent) throw new Error('corpse mesh not detached after despawn');
});

console.log('\n[11] head vs body hitboxes register distinctly');
guard('a ray through the head reports a headshot; through the chest does not', () => {
  freshRun();
  tick(3);
  const zid = [...world.query(ZombieTag, Renderable)][0];
  if (zid === undefined) throw new Error('no zombie');
  const t = world.get(zid, Transform);
  // sample the head's and chest's ACTUAL world positions from the posed rig, so
  // the probe is independent of whatever gait/lunge frame the zombie is in (a
  // fixed height is brittle — an attacking zombie pitches its head down/forward)
  const rig = world.get(zid, Renderable).object3d;
  rig.position.copy(t.position);
  rig.quaternion.copy(t.quaternion);
  rig.updateMatrixWorld(true);
  const J = rig.userData.joints;
  const headW = J.head.localToWorld(new THREE.Vector3(0, 0.2, 0)); // skull centre
  const chestW = J.torso.localToWorld(new THREE.Vector3(0, 0.26, 0)); // chest centre

  // fire each ray horizontally THROUGH the sampled point (from 5m out front)
  const ws = services.get(Service.Weapons);
  const ray = (p) => {
    const o = { x: p.x, y: p.y, z: p.z - 5 };
    return ws.rayProbe(o, { x: 0, y: 0, z: 1 }, 20).find((h) => h.id === zid);
  };
  const head = ray(headW);
  const chest = ray(chestW);
  if (!head || !head.headshot) throw new Error('head ray did not register as a headshot');
  if (!chest || chest.headshot) throw new Error('chest ray wrongly flagged as a headshot');
});

console.log('\n[11b] hellhounds have working hitboxes (quadruped capsules)');
guard('a ray through a hound body registers a hit; through its snout, a headshot', () => {
  freshRun();
  // build a hound directly (special-round spawn needs the dev flow); no physics
  // body required for the ray probe
  const hid = world.createEntity();
  world.add(hid, new Transform({ x: 0, y: 0, z: 0 }));
  world.add(hid, new Renderable(buildHoundRig(), { interpolate: true }));
  world.add(hid, new ZombieTag({ health: 200, hound: true }));
  tick(0.05); // let the anim system pose the rig once

  const rig = world.get(hid, Renderable).object3d;
  const t = world.get(hid, Transform);
  rig.position.copy(t.position); rig.quaternion.copy(t.quaternion); rig.updateMatrixWorld(true);
  const J = rig.userData.joints;
  const bodyW = J.core.getWorldPosition(new THREE.Vector3());
  const snoutW = J.head.localToWorld(new THREE.Vector3(0, 0, 0.22));

  const ws = services.get(Service.Weapons);
  // body: probe from the SIDE (+x) through the core, so the snout can't intercept
  const body = ws.rayProbe({ x: bodyW.x - 5, y: bodyW.y, z: bodyW.z }, { x: 1, y: 0, z: 0 }, 20).find((h) => h.id === hid);
  // snout: probe from the FRONT (the hound faces +z), so the muzzle is hit first
  const snout = ws.rayProbe({ x: snoutW.x, y: snoutW.y, z: snoutW.z + 5 }, { x: 0, y: 0, z: -1 }, 20).find((h) => h.id === hid);
  if (!body) throw new Error('ray through the hound body registered no hit (no hitbox)');
  if (!snout || !snout.headshot) throw new Error('ray through the hound snout did not register a headshot');
});

console.log('\n[11c] Re-Pack alternate ammo: gating, proc, and cryo freeze/shatter');
guard('AAT requires PaP, procs the effect, and a frozen zombie shatters when shot', () => {
  freshRun();
  tick(3);
  const ws = services.get(Service.Weapons);
  const aat = services.get(Service.AAT);
  if (!aat) throw new Error('no AAT service');
  // not eligible until Pack-a-Punched
  if (ws.canRepack()) throw new Error('un-PaP gun should not be Re-Pack eligible');
  if (ws.setAat('cryo')) throw new Error('setAat should fail on a non-PaP gun');
  ws.devPaP();
  if (!ws.canRepack()) throw new Error('PaP gun should be Re-Pack eligible');
  ws.setAat('cryo');
  const wpn = ws.current;
  if (wpn.aat !== 'cryo') throw new Error('AAT was not assigned');

  const zid = [...world.query(ZombieTag)].find((id) => !world.get(id, ZombieTag).hound);
  if (zid === undefined) throw new Error('no zombie');
  // force the (cooldown-gated, 10%) proc to fire by retrying with the cd cleared
  let procced = false;
  for (let i = 0; i < 400 && !procced; i++) { wpn.aatReadyAt = 0; procced = aat.tryProc(wpn, zid, { x: 0, z: 1 }); }
  if (!procced) throw new Error('cryo never procced');
  if (!(world.get(zid, ZombieTag).frozen > 0)) throw new Error('cryo proc did not freeze the target');

  // shooting a frozen zombie shatters it (instakill, no corpse)
  const player = world.get(world.first(PlayerTag), PlayerTag);
  const ctx = { world, spawn: services.get(Service.Spawn), events, player };
  const killed = damageZombie(ctx, zid, 50, { dir: { x: 0, z: 1 } });
  if (!killed) throw new Error('shooting a frozen zombie should report a kill');
  if (world.get(zid, ZombieTag) !== undefined) throw new Error('frozen zombie was not shattered (still tagged)');
  if (world.get(zid, RigidBodyRef) !== undefined) throw new Error('shattered zombie left its physics capsule behind (phantom collider)');
});

console.log('\n[12] zombies do not get stuck clawing an already-open window');
guard('teardown exits when the window is opened by someone else', () => {
  freshRun();
  let tearing = false;
  for (let i = 0; i < 200 && !tearing; i++) {
    topHealth();
    tick(0.1);
    tearing = [...world.query(ZombieTag)].some((id) => world.get(id, ZombieTag).state === 'teardown');
  }
  if (!tearing) throw new Error('no zombie reached teardown to test');
  for (const b of services.get(Service.Nav).barriers) b.boards = 0; // someone else finished it
  tick(0.2);
  const stuck = [...world.query(ZombieTag)].filter((id) => world.get(id, ZombieTag).state === 'teardown').length;
  if (stuck > 0) throw new Error(`${stuck} zombies stuck in teardown after the window opened`);
});

console.log('\n[13] zombies carry a player-blocking capsule, freed on death + reset');
guard('capsule exists, is removed on death, and reset frees the rest', () => {
  freshRun();
  tick(4);
  const zid = [...world.query(ZombieTag)][0];
  if (zid === undefined) throw new Error('no zombie spawned');
  if (world.get(zid, RigidBodyRef) === undefined) throw new Error('zombie has no collision capsule');
  const player = world.get(world.first(PlayerTag), PlayerTag);
  const before = physics._removed || 0;
  damageZombie({ world, spawn: services.get(Service.Spawn), events, player }, zid, 1e6, { dir: { x: 1, z: 0 } });
  if (world.get(zid, RigidBodyRef) !== undefined) throw new Error('capsule not detached from the corpse');
  if ((physics._removed || 0) <= before) throw new Error('capsule body was not removed on death');
  const live = [...world.query(ZombieTag)].length;
  const rm = physics._removed || 0;
  services.get(Service.Spawn).reset();
  if ((physics._removed || 0) < rm + live) throw new Error('reset did not free every live zombie capsule');
});

console.log('\n[14] committed swipe: rooted, unescapable hit, applies the slow');
guard('a swiping zombie stays put, damages the player, and sets slowUntil', () => {
  freshRun();
  const pid = world.first(PlayerTag);
  const player = world.get(pid, PlayerTag);
  const pt = world.get(pid, Transform);
  let zid;
  for (let i = 0; i < 200 && zid === undefined; i++) { tick(0.1); zid = [...world.query(ZombieTag)][0]; }
  if (zid === undefined) throw new Error('no zombie spawned');
  const z = world.get(zid, ZombieTag);
  const zt = world.get(zid, Transform);
  // force the encounter so the test doesn't depend on slow shamblers arriving
  zt.position.set(pt.position.x + 1.4, pt.position.y, pt.position.z);
  z.state = 'attack'; z.attackTimer = 0; z.swipe = 0; z.swung = false;
  for (let i = 0; i < 40 && z.swipe <= 0; i++) tick(0.02); // wind up the swing
  if (z.swipe <= 0) throw new Error('no zombie ever committed a swipe');
  topHealth();
  const x0 = zt.position.x, z0 = zt.position.z;
  const hp0 = player.health;
  const slow0 = player.slowUntil;
  for (let i = 0; i < 40 && z.swipe > 0; i++) tick(0.02); // ride out the committed swing
  if (Math.hypot(zt.position.x - x0, zt.position.z - z0) > 0.05) throw new Error('zombie moved during its committed swipe');
  if (player.health >= hp0) throw new Error('committed swipe dealt no damage');
  if (player.slowUntil <= slow0) throw new Error('swipe did not set the movement slow');
});

console.log('\n[15] the swipe slow reduces player movement speed');
services.register(Service.Settings, { controls: { crouchMode: 'hold', proneMode: 'hold', sprintMode: 'hold', aimMode: 'hold' } });
world.registerSystem(new PlayerSystem());
guard('moveScale drops to the slow factor while slowed, recovers after', () => {
  freshRun();
  const player = world.get(world.first(PlayerTag), PlayerTag);
  player.slowUntil = time.elapsed + 1.0;
  tick(0.05);
  if (Math.abs(player.moveScale - ZombieConfig.swipeSlowFactor) > 1e-6) throw new Error('moveScale not reduced while slowed');
  player.slowUntil = time.elapsed - 1.0;
  tick(0.05);
  if (Math.abs(player.moveScale - 1) > 1e-6) throw new Error('moveScale did not recover after the slow expired');
});

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}\n`);
process.exit(failures === 0 ? 0 : 1);
