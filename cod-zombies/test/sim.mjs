// Headless logic test: drives MovementController with a mocked physics facade
// on flat ground, asserting no NaNs, sane speeds, and that key BO3-style
// transitions actually fire. Run with: node test/sim.mjs
import { MovementController } from '../src/player/MovementController.js';
import { PlayerTag, Transform } from '../src/ecs/components/index.js';
import { PlayerConfig, Stance } from '../src/config/index.js';
import * as THREE from 'three';

const RADIUS = PlayerConfig.capsuleRadius;
const GROUND = 0; // feet rest at y=0

// --- mock collider/body that tracks center & half-height ---
function makeRef() {
  const state = { center: new THREE.Vector3(0, RADIUS + Stance.stand.halfHeight, 0), half: Stance.stand.halfHeight };
  const collider = {
    halfHeight: () => state.half,
    radius: () => RADIUS,
    setHalfHeight: (h) => { state.half = h; },
  };
  const body = {
    translation: () => ({ x: state.center.x, y: state.center.y, z: state.center.z }),
    setTranslation: (v) => state.center.set(v.x, v.y, v.z),
    setNextKinematicTranslation: (v) => state.center.set(v.x, v.y, v.z),
  };
  return { collider, body, type: 'kinematic', __state: state };
}

function makePhysics(ref) {
  const s = ref.__state;
  return {
    moveCharacter(_collider, desired) {
      const half = s.half + RADIUS;
      let ny = s.center.y + desired.y;
      let feet = ny - half;
      let grounded = false;
      let movementY = desired.y;
      if (desired.y <= 0 && feet <= GROUND + 1e-3) {
        movementY = (GROUND + half) - s.center.y;
        grounded = true;
      }
      return { movement: { x: desired.x, y: movementY, z: desired.z }, grounded };
    },
    setKinematicTarget(body, p) { body.setNextKinematicTranslation(p); },
    resizeCapsule(handle, newHalf) {
      const old = handle.collider.halfHeight();
      if (Math.abs(old - newHalf) < 1e-4) return 0;
      const delta = newHalf - old;
      handle.collider.setHalfHeight(newHalf);
      const p = handle.body.translation();
      handle.body.setTranslation({ x: p.x, y: p.y + delta, z: p.z });
      return delta;
    },
    hasHeadroom: () => true, // open sky in the sim
  };
}

const ref = makeRef();
const physics = makePhysics(ref);
const ctrl = new MovementController(physics);
const tag = new PlayerTag();
const t = new Transform(new THREE.Vector3(0, ref.__state.center.y, 0));

const DT = 1 / 60;
const baseIntent = {
  forward: 0, strafe: 0, hasMove: false,
  sprintHeld: false, wantCrouch: false, wantProne: false, aimHeld: false,
  crouchEdge: false, proneEdge: false, jumpPressed: false,
};

let failures = 0;
const speed = () => Math.hypot(tag.velocity.x, tag.velocity.z);
function assert(cond, msg) {
  if (!cond) { console.error('  FAIL:', msg); failures++; }
  else console.log('  ok  :', msg);
}
function checkSane() {
  const v = tag.velocity;
  if ([v.x, v.y, v.z, t.position.x, t.position.y, t.position.z].some((n) => Number.isNaN(n))) {
    console.error('  FAIL: NaN detected', { v, p: t.position });
    failures++;
  }
}
function run(ticks, overrides, pressEdgesFirstTickOnly = true) {
  for (let i = 0; i < ticks; i++) {
    const intent = { ...baseIntent, ...overrides };
    if (pressEdgesFirstTickOnly && i > 0) {
      intent.jumpPressed = false;
      intent.crouchEdge = false;
      intent.proneEdge = false;
    }
    ctrl.update(tag, t, ref, intent, DT);
    checkSane();
  }
}

console.log('\n[1] accelerate to walk speed');
run(40, { forward: 1, hasMove: true });
assert(Math.abs(speed() - PlayerConfig.walkSpeed) < 0.5, `walk ~${PlayerConfig.walkSpeed} (got ${speed().toFixed(2)})`);
assert(tag.state === 'walk', `state walk (got ${tag.state})`);

console.log('\n[2] sprint is faster than walk');
run(40, { forward: 1, hasMove: true, sprintHeld: true });
assert(speed() > PlayerConfig.walkSpeed + 1, `sprint faster (got ${speed().toFixed(2)})`);
assert(tag.state === 'sprint', `state sprint (got ${tag.state})`);

console.log('\n[3] sprint + tap crouch => slide with speed burst');
run(1, { forward: 1, hasMove: true, sprintHeld: true, crouchEdge: true, wantCrouch: true });
assert(tag.state === 'slide', `entered slide (got ${tag.state})`);
assert(speed() > PlayerConfig.sprintSpeed, `slide burst > sprint (got ${speed().toFixed(2)})`);
assert(tag.stance === 'slide', `slide stance (got ${tag.stance})`);

console.log('\n[4] holding crouch, slide decays then resolves to crouch');
run(70, { forward: 1, hasMove: true, wantCrouch: true });
assert(tag.state === 'crouch', `slide -> crouch (got ${tag.state})`);

console.log('\n[5] release crouch on flat ground => stand back up to walk');
run(20, { forward: 1, hasMove: true });
assert(tag.state === 'walk' && tag.stance === 'stand', `stood up (state ${tag.state}, stance ${tag.stance})`);

console.log('\n[6] jump leaves the ground, then lands');
run(40, { forward: 1, hasMove: true, sprintHeld: true });
const speedBeforeJump = speed();
run(1, { forward: 1, hasMove: true, sprintHeld: true, jumpPressed: true });
assert(tag.state === 'air' && !tag.grounded, `airborne after jump (state ${tag.state})`);
assert(Math.abs(speed() - speedBeforeJump) < 0.5, `horizontal momentum preserved through jump (${speedBeforeJump.toFixed(2)} -> ${speed().toFixed(2)})`);
run(120, { forward: 1, hasMove: true, sprintHeld: true }); // fall + land
assert(tag.grounded, 'landed back on ground');

console.log('\n[7] slide jump-cancel preserves momentum into the air');
run(40, { forward: 1, hasMove: true, sprintHeld: true });
run(2, { forward: 1, hasMove: true, sprintHeld: true, crouchEdge: true, wantCrouch: true });
const slideSpeed = speed();
run(1, { forward: 1, hasMove: true, wantCrouch: true, jumpPressed: true });
assert(tag.state === 'air', `slide -> jump-cancel to air (got ${tag.state})`);
assert(speed() >= slideSpeed - 0.5, `slide momentum carried into jump (${slideSpeed.toFixed(2)} -> ${speed().toFixed(2)})`);
run(120, { forward: 1, hasMove: true }); // settle on ground

console.log('\n[8] speed never exceeds the hard cap');
let maxObserved = 0;
for (let i = 0; i < 200; i++) {
  const intent = { ...baseIntent, forward: 1, hasMove: true, sprintHeld: true };
  if (i % 30 === 0) { intent.crouchEdge = true; intent.wantCrouch = true; }
  else if (i % 30 < 10) intent.wantCrouch = true;
  if (i % 30 === 12) intent.jumpPressed = true;
  ctrl.update(tag, t, ref, intent, DT);
  checkSane();
  maxObserved = Math.max(maxObserved, speed());
}
assert(maxObserved <= PlayerConfig.maxGroundSpeed + 0.01, `max horizontal speed within cap (peak ${maxObserved.toFixed(2)} <= ${PlayerConfig.maxGroundSpeed})`);

console.log('\n[9] dolphin dive from sprint commits airborne then lands prone');
run(40, { forward: 1, hasMove: true, sprintHeld: true });
run(1, { forward: 1, hasMove: true, sprintHeld: true, proneEdge: true });
assert(tag.state === 'dive', `entered dive (got ${tag.state})`);
run(120, { forward: 0, hasMove: false });
assert(tag.state === 'prone' && tag.stance === 'prone', `dive landed prone (state ${tag.state}, stance ${tag.stance})`);

console.log('\n[10] idle friction brings player to a full stop');
run(1, { proneEdge: true }); // prone latch cleared -> crouch
run(120, {}); // no input
assert(speed() < 0.05, `friction stops the player (residual ${speed().toFixed(3)})`);

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}\n`);
process.exit(failures === 0 ? 0 : 1);
