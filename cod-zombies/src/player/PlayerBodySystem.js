import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Transform, PlayerTag } from '../ecs/components/index.js';
import { Service } from '../core/ServiceLocator.js';
import { PlayerConfig } from '../config/index.js';
import { selectedBuild } from '../characters/selection.js';
import { buildWeaponModel } from '../weapons/weaponModels.js';
import { makeFlashStar, makeFlashCore } from '../weapons/Viewmodel.js';
import { fpBody, weaponAction } from './fpBodyState.js';

const _pos = new THREE.Vector3();
const _gun = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _adsLocal = new THREE.Vector3();
const _gunOff = new THREE.Vector3();
const _mz = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (c, target, rate, dt) => c + (target - c) * (1 - Math.exp(-rate * dt));
const GUN_REACH = 0.85; // camera→muzzle distance; wall nearer than this pulls the gun back
// two-bone IK scratch (world-space, converted to local at the end)
const _tgt = new THREE.Vector3();
const _S = new THREE.Vector3();
const _toT = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _poleBase = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _bendAxis = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const _upperDir = new THREE.Vector3();
const _foreDir = new THREE.Vector3();
const _qWorld = new THREE.Quaternion();
const _qWorldE = new THREE.Quaternion();
const _qParent = new THREE.Quaternion();
const _hinge = new THREE.Vector3();
const _ax = new THREE.Vector3();
const _ay = new THREE.Vector3();
const _az = new THREE.Vector3();
const _mBasis = new THREE.Matrix4();
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
const shortAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/**
 * World quaternion that points a bone's rest axis (-Y) along `dir`, with the
 * roll LOCKED so the bone's local +X aligns with `ref` (projected perpendicular).
 * Using a shared reference for both arm bones kills the wrist twist/spin that
 * setFromUnitVectors produces (it leaves the roll arbitrary).
 */
function aimBasis(out, dir, ref) {
  _ay.copy(dir).multiplyScalar(-1);                 // object +Y = -dir → -Y = dir
  _ax.copy(ref).addScaledVector(_ay, -ref.dot(_ay)); // ref ⟂ to y
  if (_ax.lengthSq() < 1e-6) { _ax.set(1, 0, 0).addScaledVector(_ay, -_ay.x); }
  _ax.normalize();
  _az.crossVectors(_ax, _ay).normalize();
  _ax.crossVectors(_ay, _az).normalize();
  _mBasis.makeBasis(_ax, _ay, _az);
  out.setFromRotationMatrix(_mBasis);
}

// gun held in front of the eyes, in CAMERA space (right, down, forward). The
// gun aims along the camera's -z, so it tracks pitch/yaw exactly.
const GUN_LOCAL = new THREE.Vector3(0.06, -0.1, -0.34);
const ARM = { L1: 0.33, L2: 0.32 };
// lean the TORSO back (away from aim): a base recline keeps the chest out of the
// forward view, and it leans back FURTHER the more you look down so the chest
// clears the sightline to the legs (dynamic — keeps the hip reach to the gun).
const TORSO_LEAN = -0.24;      // base recline; kept modest so the shoulders stay
                               // in reach of the gun even with the bigger pullback
const TORSO_LEAN_DOWN = 0.0;   // no extra recline on down-aim — keep the torso natural
                               // and visible with the legs (body is pushed back instead)
const DOWN_PULLBACK = 0.22;    // extra pushback per rad of downward pitch: opens a clear
                               // sightline to the floor while keeping the torso in view
                               // (torso nudged forward vs. before for better balance)
// NOTE sign: after the 180° body facing, NEGATIVE thigh.x swings the legs
// FORWARD (world -z); positive kicks them backward (reads as "backwards legs").
// Give the thighs a static forward angle so the knees + feet sit forward/under
// the hip; swing them further forward as you look down so they fill the view.
const THIGH_BASE = -0.28;
const THIGH_FLEX_DOWN = 0.20;  // extra forward hip flex per rad of downward pitch (kept
                               // small so the legs hang more naturally, not leaned forward)
// --- locomotion: a sin-phase walk/run cycle for the legs + a footfall body bob.
// Per-gait amplitudes; the phase advances with horizontal speed so cadence tracks
// how fast you actually move. Everything scales by #walkAmt (eases in/out of motion)
// so a standing player is byte-identical to the static pose.
const KNEE_BASE = 0.5;         // resting knee bend (matches poseStance)
const FOOT_BASE = -0.2;        // resting ankle (matches poseStance)
const STEP_K = 1.5;            // phase advance per (m/s): sets footstep cadence vs. speed
const GUN_BOB_V = 0.03;        // gun vertical walk-bob amplitude (footfall dip)
const GUN_BOB_H = 0.018;       // gun horizontal walk-bob amplitude (side-to-side)
const LOCO = {
  walk:   { stride: 0.55, knee: 0.60, bob: 0.035, sway: 0.05, lift: 0.12, cadence: 1.0,  twist: 0.06 },
  sprint: { stride: 0.85, knee: 1.00, bob: 0.06,  sway: 0.09, lift: 0.20, cadence: 1.15, twist: 0.10 },
  crouch: { stride: 0.35, knee: 0.45, bob: 0.02,  sway: 0.03, lift: 0.08, cadence: 1.0,  twist: 0.04 },
};
const STRAFE_SPLAY = 0.8;      // lateral leg splay when strafing (vs. fore/aft swing)
// gun look-sway: the world gun trails your look so a turn feels weighty (this is what
// the old viewmodel did; restored here for the world-held gun). Bullets are unaffected.
const SWAY_YAW_K = 0.035;      // gun yaw-sway per rad/s of look turn
const SWAY_PITCH_K = 0.028;    // gun pitch-sway per rad/s of look tilt
const SWAY_MAX = 0.14;         // clamp on the sway offset (rad)
const STRAFE_LEAN = 0.11;      // gun roll (lean) when moving left/right
// --- STANCE: crouch / slide / prone reshape the whole body (blended from standing).
// hipY = hip-joint height (world, above the feet); pitch = whole-body forward tilt at
// the hips; knee/thigh/torso = extra joint bends layered on the aim pose.
const STANCE = {
  crouch: { hipY: 0.56, pitch: 0.12,  knee: 1.15, thigh: -0.80, torso: 0.12 },
  slide:  { hipY: 0.46, pitch: -0.35, knee: 0.55, thigh: -0.90, torso: -0.30 },
  prone:  { hipY: 0.22, pitch: 1.32,  knee: 0.30, thigh: 0.10,  torso: 0.05 },
};
const PRONE_PUSHBACK = 0.62;   // shove the rig back when prone so the body trails the head
// --- ONE-HANDED ACTIONS: melee / grenade / drink / inspect lower the gun off-screen
// (held in the RIGHT hand) while the LEFT hand performs the gesture. The gun is
// dropped by a holster offset; the left hand reaches keyframed CAMERA-LOCAL targets.
const HOLSTER = new THREE.Vector3(0.10, -0.55, 0.14); // gun drop: right + down + back, off-screen
// melee left-hand knife-swing keyframes (camera-local: +x right, +y up, -z forward)
const MEL_REST = new THREE.Vector3(-0.10, -0.44, -0.30); // off the bottom-left
const MEL_WIND = new THREE.Vector3(0.26, 0.12, -0.42);   // wound up, upper-right
const MEL_SLASH = new THREE.Vector3(-0.30, -0.16, -0.32); // slashed through, lower-left
const _lt = new THREE.Vector3();
// lerp v = a→b→c→a across t in [0,1] with the given segment splits
function segLerp(out, t, a, b, c, s1, s2) {
  if (t <= s1) out.copy(a).lerp(b, t / s1);
  else if (t <= s2) out.copy(b).lerp(c, (t - s1) / (s2 - s1));
  else out.copy(c).lerp(a, (t - s2) / (1 - s2));
  return out;
}
// pull the whole body back off the camera so the chest isn't "inside the head".
// This is bounded by arm reach at LEVEL aim (the gun is furthest forward there);
// looking down brings the gun close to the body so the dynamic lean is free.
const PULLBACK = 0.16;
// When looking up, pull the elbows DOWN so the forearms hang below the grips and
// the arms don't splay across the gun. Ramps in with up-pitch. (Applied in the
// adaptive elbow pole in #solveArm.)
const ARMS_TUCK_START = 0.35; // begin tucking past ~20° up
const ARMS_TUCK_RANGE = 0.7;  // fully tucked ~1.05 rad (~60°) up
const ARMS_TUCK_MAX = 0.9;    // how far the pole blends toward straight-down (0..1)
const TORSO_LEAN_UP = 0.7;    // forward chest lean at full up-aim: raises the shoulders
                              // toward the raised gun so the arms reach + bend
const _WORLD_DOWN = new THREE.Vector3(0, -1, 0);

/**
 * First-person BODY — the player's own rig, in the WORLD scene, holding a
 * world-space gun. Because it lives in the world it is naturally anchored: legs
 * are there when you look down, and the gun (placed relative to the camera, so
 * it aims where you look) is held with both hands via two-bone arm IK to the
 * weapon's gripR/gripL sockets. Head hidden (camera lives there). Same rig
 * remote players / theater will use. F6 toggles it; off by default.
 */
export class PlayerBodySystem extends System {
  #scene; #time; #gameState; #weapons; #camera; #physics;
  #body = null; #built = false; #enabled = false; #wallPush = 0; #kick = 0;
  #gunHolder = new THREE.Group();
  #gunAnchors = null; #gunKey = null; #gunSightY = 0.08; #aimPitch = 0;
  #walkAmt = 0; #walkPhase = 0; #idle = 0; #restHipY = 0.94; // locomotion state
  #lastYaw = 0; #lastPitch = 0; #swayYaw = 0; #swayPitch = 0; #leanRoll = 0; // look-sway + strafe lean
  #crouchAmt = 0; #slideAmt = 0; #proneAmt = 0; // eased stance blends
  #holsterAmt = 0; #knife = null; #leftTarget = new THREE.Group(); // one-handed action state
  #flash = null; #flashStar = null; #flashCore = null; #flashLight = null;

  init() {
    this.#scene = this.world.services.get(Service.Scene).scene;
    this.#time = this.world.services.get(Service.Time);
    this.#gameState = this.world.services.get(Service.GameState);
    this.#weapons = null; // resolved lazily in #syncGun (registers with the scene)
    this.#camera = this.world.services.get(Service.Render).camera;
    this.#physics = this.world.services.has(Service.Physics) ? this.world.services.get(Service.Physics) : null;
    this.#scene.add(this.#gunHolder);
    // world-space muzzle flash for the held gun — REUSES the overlay viewmodel's
    // flash textures (star + white-hot core) so it looks identical; just lives in
    // the world scene (the overlay's is camera-locked) + a brief point light.
    const flashMat = (tex) => new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.#flash = new THREE.Group();
    this.#flashStar = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), flashMat(makeFlashStar()));
    this.#flashCore = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.14), flashMat(makeFlashCore()));
    this.#flash.add(this.#flashStar, this.#flashCore);
    this.#flash.renderOrder = 999; this.#flash.visible = false;
    this.#scene.add(this.#flash);
    this.#flashLight = new THREE.PointLight(0xffd9a0, 0, 6, 2);
    this.#scene.add(this.#flashLight);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F6') { e.preventDefault(); e.stopPropagation(); this.#toggle(); }
    }, true);
    if (typeof window !== 'undefined') window.__pbody = this;
  }

  get isEnabled() { return this.#enabled; }

  get _dbg() {
    const J = this.#body?.userData?.joints;
    const wp = (o) => { const v = new THREE.Vector3(); o?.getWorldPosition(v); return v.toArray().map((n) => +n.toFixed(2)); };
    return {
      cam: this.#camera && wp(this.#camera), gun: wp(this.#gunHolder),
      handR: J?.handR && wp(J.handR), gripR: this.#gunAnchors?.gripR && wp(this.#gunAnchors.gripR),
      handL: J?.handL && wp(J.handL), gripL: this.#gunAnchors?.gripL && wp(this.#gunAnchors.gripL),
      shR: J?.shoulderR && wp(J.shoulderR),
      jf: this.#weapons?.current?.justFired, flashVis: this.#flash?.visible, flashOp: this.#flashStar?.material?.opacity,
      wallPush: +this.#wallPush.toFixed(2),
      muzzle: this.#gunAnchors?.muzzle && (() => { const v = new THREE.Vector3(); this.#gunAnchors.muzzle.getWorldPosition(v); return v.toArray().map((n) => +n.toFixed(2)); })(),
    };
  }

  #toggle() {
    this.#enabled = !this.#enabled;
    fpBody.enabled = this.#enabled;                 // WeaponSystem hides its overlay gun
    if (this.#enabled && !this.#built) this.#build();
    if (this.#body) this.#body.visible = this.#enabled;
    this.#gunHolder.visible = this.#enabled;
    if (!this.#enabled && this.#flash) { this.#flash.visible = false; this.#flashLight.intensity = 0; }
  }

  #build() {
    const build = selectedBuild();
    if (!build) return;
    let rig; try { rig = build(); } catch { return; }
    const J = rig.userData?.joints;
    if (J?.head) J.head.visible = false; // the camera lives inside the head
    this.#poseStance(J);
    rig.visible = this.#enabled;
    this.#restHipY = rig.userData?.rest?.hipY ?? 0.94;
    this.#scene.add(rig);
    this.#body = rig;
    this.#built = true;
    // one-handed action rig: a world-space IK target the left hand reaches for during
    // gestures, and a knife prop held in the left hand (shown only mid-swing).
    this.#scene.add(this.#leftTarget);
    if (J?.handL) { this.#knife = this.#buildKnife(); this.#knife.visible = false; J.handL.add(this.#knife); }
  }

  /** A simple combat knife held in the off hand during a melee swing. */
  #buildKnife() {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xc7ccd4, metalness: 0.9, roughness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1c22, metalness: 0.5, roughness: 0.7 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.22, 0.04), steel); blade.position.y = -0.20;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 4), steel); tip.position.y = -0.33; tip.rotation.z = Math.PI; tip.scale.set(0.7, 1, 1.4);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.05), dark); guard.position.y = -0.08;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.045), dark); handle.position.y = -0.015;
    g.add(blade, tip, guard, handle);
    g.rotation.set(-1.3, 0, 0); // pitch the blade forward out of the fist
    g.position.set(0, -0.04, 0);
    return g;
  }

  /** Bent-knee stance for natural-looking legs; arms are driven by IK. */
  #poseStance(J) {
    if (!J) return;
    const set = (j, x = 0, y = 0, z = 0) => { if (j) j.rotation.set(x, y, z); };
    set(J.torso, TORSO_LEAN); // recline the upper body back, out of the forward view
    set(J.thighL, THIGH_BASE, 0, 0.04); set(J.thighR, THIGH_BASE, 0, -0.04);
    set(J.kneeL, 0.5); set(J.kneeR, 0.5);   // knee bend brings the shin back down under the body
    set(J.footL, -0.2); set(J.footR, -0.2); // level the feet with the ground
  }

  /** (Re)build the held gun model when the weapon changes. */
  #syncGun() {
    // Service.Weapons registers with the scene, after this system's init(), so
    // resolve it lazily the first time it exists.
    if (!this.#weapons) {
      if (!this.world.services.has(Service.Weapons)) return;
      this.#weapons = this.world.services.get(Service.Weapons);
    }
    const w = this.#weapons.current;
    const key = w ? (w.data.modelName || w.data.name) : null;
    if (key === this.#gunKey) return;
    this.#gunKey = key;
    while (this.#gunHolder.children.length) this.#gunHolder.remove(this.#gunHolder.children[0]);
    this.#gunAnchors = null;
    if (!w) return;
    const built = buildWeaponModel(w);
    if (built?.group) {
      this.#gunHolder.add(built.group);
      this.#gunAnchors = built.anchors || null;
      this.#gunSightY = built.sightY ?? 0.08; // sight height → ADS raise target
    }
  }

  lateUpdate(dt) {
    if (!this.#enabled || !this.#body) return;
    if (!this.#gameState.isPlaying || this.world.first(PlayerTag, Transform) === undefined) {
      this.#body.visible = false; this.#gunHolder.visible = false;
      if (this.#flash) { this.#flash.visible = false; this.#flashLight.intensity = 0; }
      return;
    }
    const id = this.world.first(PlayerTag, Transform);
    const tag = this.world.get(id, PlayerTag);
    const t = this.world.get(id, Transform);
    this.#body.visible = true;
    this.#gunHolder.visible = true;

    // eased stance blends (crouch / slide / prone), derived from the stance machine
    const dtc = dt || 0.016;
    const stance = tag.stance;
    this.#crouchAmt = damp(this.#crouchAmt, stance === 'crouch' ? 1 : 0, 10, dtc);
    this.#slideAmt = damp(this.#slideAmt, stance === 'slide' ? 1 : 0, 13, dtc);
    this.#proneAmt = damp(this.#proneAmt, stance === 'prone' ? 1 : 0, 9, dtc);
    const cr = this.#crouchAmt, sl = this.#slideAmt, pr = this.#proneAmt;
    const stand = clampN(1 - cr - sl - pr, 0, 1);

    // stand the rig on the ground under the interpolated capsule; face the aim
    _pos.lerpVectors(t.previousPosition, t.position, this.#time.alpha);
    const feetY = _pos.y - (tag.halfHeight + PlayerConfig.capsuleRadius);
    // pull the body back along the (horizontal) aim so the chest isn't at the eye;
    // push it back FURTHER as you look down. Prone pitches the body forward at the
    // hips, so push the whole rig BACK there — the head comes forward to the camera
    // and the torso + legs trail BEHIND it (as they should when lying down).
    const down = Math.max(0, -tag.pitch);
    const pull = PULLBACK + down * DOWN_PULLBACK + pr * PRONE_PUSHBACK;
    _fwd.set(0, 0, -1).applyQuaternion(this.#camera.quaternion); _fwd.y = 0; _fwd.normalize();
    this.#body.position.set(_pos.x - _fwd.x * pull, feetY, _pos.z - _fwd.z * pull);
    this.#body.rotation.y = tag.yaw + Math.PI; // rig faces +z; player forward is -z
    const J = this.#body.userData?.joints;
    if (J?.head) J.head.visible = false;
    // as you look DOWN, recline the chest further back and swing the thighs forward
    // so the sightline opens past the chest and the legs fill the lower view (this
    // is what makes the legs visible "like before"). Free on arm reach because the
    // gun sits close to the body when aimed down.
    this.#aimPitch = tag.pitch;              // drives the adaptive elbow pole in #solveArm
    // as you look UP, lean the chest FORWARD toward the aim so the shoulders rise up
    // to the raised gun — this brings the grip back within arm reach so the arms can
    // BEND, letting the elbow-tuck route the forearms below the gun instead of a
    // fully-extended arm spearing across the view. Ramps in with up-pitch.
    const up = clampN((tag.pitch - ARMS_TUCK_START) / ARMS_TUCK_RANGE, 0, 1);
    const upLean = up * up * (3 - 2 * up); // smoothstep
    const torsoLean = TORSO_LEAN - down * TORSO_LEAN_DOWN + upLean * TORSO_LEAN_UP;
    // keep a natural forward hip flex + bent knee as you look down (knees stay bent
    // from poseStance — no stretching the legs straight).
    const thighFlex = THIGH_BASE - down * THIGH_FLEX_DOWN; // negative = forward

    // --- LOCOMOTION + STANCE: a walk/run cycle blended over the base pose, plus a
    // stance offset that lowers + reshapes the whole body (crouch / slide / prone).
    // Everything scales by #walkAmt / stance blends, so standing is identical to the
    // static pose. Cadence tracks real horizontal speed.
    this.#idle += dtc;
    const spd = Math.hypot(tag.velocity.x, tag.velocity.z);
    const st = tag.state;
    const moving = tag.grounded && spd > 0.6 && (st === 'walk' || st === 'sprint' || st === 'crouch' || st === 'prone');
    this.#walkAmt = damp(this.#walkAmt, moving ? 1 : 0, 8, dtc);
    const g = LOCO[st === 'sprint' ? 'sprint' : (cr > 0.5 || st === 'crouch') ? 'crouch' : 'walk'];
    this.#walkPhase += dtc * spd * STEP_K * g.cadence;
    const wa = this.#walkAmt;
    const swL = Math.sin(this.#walkPhase), swR = Math.sin(this.#walkPhase + Math.PI);
    const breathe = Math.sin(this.#idle * 1.6) * 0.012 * (1 - wa); // gentle idle sway
    // decompose velocity into the player's own frame: fc = forward/back (-1..1),
    // lc = right/left (-1..1). The step swing points along the MOVE direction, so
    // one mechanism gives forward walk, backpedal (reversed), and side-step (lateral).
    const cy = Math.cos(tag.yaw), sy = Math.sin(tag.yaw);
    const fc = spd > 0.2 ? (tag.velocity.x * -sy + tag.velocity.z * -cy) / spd : 1;
    const lc = spd > 0.2 ? (tag.velocity.x * cy + tag.velocity.z * -sy) / spd : 0;

    // stance-blended base pose: lerp the standing/aim values toward each stance target
    const hipYBase = this.#restHipY * stand + STANCE.crouch.hipY * cr + STANCE.slide.hipY * sl + STANCE.prone.hipY * pr;
    const bodyPitch = STANCE.crouch.pitch * cr + STANCE.slide.pitch * sl + STANCE.prone.pitch * pr;
    const kneeBase = KNEE_BASE * stand + STANCE.crouch.knee * cr + STANCE.slide.knee * sl + STANCE.prone.knee * pr;
    const thighBase = thighFlex * stand + STANCE.crouch.thigh * cr + STANCE.slide.thigh * sl + STANCE.prone.thigh * pr;
    const torsoBase = torsoLean * stand + STANCE.crouch.torso * cr + STANCE.slide.torso * sl + STANCE.prone.torso * pr;
    const upW = clampN(1 - sl - pr, 0, 1); // upright walk cycle plays for stand + crouch
    const crawl = pr * wa;                 // army-crawl leg flutter (prone only)

    // legs: directional walk swing (scaled by the upright factor) + prone crawl flutter
    if (J?.thighL) { J.thighL.rotation.x = thighBase - swL * g.stride * fc * wa * upW + swL * 0.26 * crawl; J.thighL.rotation.z = 0.04 + swL * g.stride * lc * STRAFE_SPLAY * wa * upW; }
    if (J?.thighR) { J.thighR.rotation.x = thighBase - swR * g.stride * fc * wa * upW + swR * 0.26 * crawl; J.thighR.rotation.z = -0.04 + swR * g.stride * lc * STRAFE_SPLAY * wa * upW; }
    if (J?.kneeL) J.kneeL.rotation.x = kneeBase + (g.knee * wa * upW + 0.5 * crawl) * Math.max(0, -swL);
    if (J?.kneeR) J.kneeR.rotation.x = kneeBase + (g.knee * wa * upW + 0.5 * crawl) * Math.max(0, -swR);
    if (J?.footL) J.footL.rotation.x = FOOT_BASE + swL * g.lift * fc * wa * upW;
    if (J?.footR) J.footR.rotation.x = FOOT_BASE + swR * g.lift * fc * wa * upW;
    // body: stance hip height + whole-body pitch, footfall dip, sway/breathe, pelvic twist
    if (J?.hips) {
      J.hips.position.y = hipYBase - g.bob * (0.5 - 0.5 * Math.cos(2 * this.#walkPhase)) * wa * upW;
      J.hips.rotation.set(bodyPitch, swL * g.twist * wa * upW, 0);
    }
    if (J?.torso) { J.torso.rotation.x = torsoBase + breathe; J.torso.rotation.z = swL * g.sway * wa * upW; }

    // --- GUN LOOK-SWAY + STRAFE LEAN (applied to the holder below in the placement) ---
    const yawVel = shortAngle(tag.yaw - this.#lastYaw) / dtc; this.#lastYaw = tag.yaw;
    const pitchVel = (tag.pitch - this.#lastPitch) / dtc; this.#lastPitch = tag.pitch;
    // ADS steadies the weapon: fade the look-sway + strafe lean out as you aim in
    const swayGate = 1 - (this.#weapons?.current?.adsProgress || 0);
    this.#swayYaw = damp(this.#swayYaw, clampN(-yawVel * SWAY_YAW_K, -SWAY_MAX, SWAY_MAX) * swayGate, 9, dtc);
    this.#swayPitch = damp(this.#swayPitch, clampN(-pitchVel * SWAY_PITCH_K, -SWAY_MAX, SWAY_MAX) * swayGate, 9, dtc);
    // gun leans (rolls) toward the strafe direction, ever so slightly, while moving
    this.#leanRoll = damp(this.#leanRoll, (spd > 0.6 ? -lc : 0) * STRAFE_LEAN * swayGate, 8, dtc);

    // place the gun in front of the eyes, aimed along the camera, then reach the
    // hands to its grip sockets
    this.#syncGun();
    // hip → ADS: raise the gun so its sight line (sightY) centres on the eye axis
    const ads = this.#weapons?.current?.adsProgress || 0;
    _adsLocal.set(0, -this.#gunSightY, -0.34);
    _gunOff.set(lerp(GUN_LOCAL.x, _adsLocal.x, ads), lerp(GUN_LOCAL.y, _adsLocal.y, ads), lerp(GUN_LOCAL.z, _adsLocal.z, ads));
    // near-wall pushback: if a solid wall is closer than the muzzle reach, pull
    // the gun back toward the camera so it doesn't poke through geometry
    let targetPush = 0;
    if (this.#physics?.raycastWall) {
      _rayDir.set(0, 0, -1).applyQuaternion(this.#camera.quaternion); // unit aim dir
      const hitDist = this.#physics.raycastWall(this.#camera.position, _rayDir, GUN_REACH);
      if (hitDist != null) targetPush = Math.min(0.55, Math.max(0, GUN_REACH - hitDist));
    }
    this.#wallPush = damp(this.#wallPush, targetPush, 20, dt || 0.016);
    _gunOff.z += this.#wallPush; // z is forward-negative → += pulls the gun in

    // visual recoil: the gun kicks back + up on each shot and recovers, scaled by
    // the weapon's hip/ADS recoil. The hands follow because the arm IK solves
    // AFTER the gun is placed. (View/camera kick still lives in WeaponSystem.)
    const w = this.#weapons?.current;
    if (w && w.justFired > 0) this.#kick = Math.min(1, this.#kick + (dt || 0.016) * 18);
    else this.#kick += (0 - this.#kick) * Math.min(1, (dt || 0.016) * 9);
    const vrHip = w?.data.visualRecoilHip ?? 1.0;
    const vrAds = w?.data.visualRecoilAds ?? 0.4;
    const kickVis = this.#kick * (vrHip + (vrAds - vrHip) * ads);
    _gunOff.z += kickVis * 0.05;   // kick back toward the shoulder
    _gunOff.y += kickVis * 0.012;  // and a touch up
    // one-handed action: drop the gun off-screen (right hand keeps it) while the
    // left hand does the gesture. Eased so it dips out and comes back smoothly.
    const A = weaponAction;
    const offAction = A.melee > 0;
    this.#holsterAmt = damp(this.#holsterAmt, offAction ? 1 : 0, 14, dtc);
    _gunOff.x += HOLSTER.x * this.#holsterAmt;
    _gunOff.y += HOLSTER.y * this.#holsterAmt;
    _gunOff.z += HOLSTER.z * this.#holsterAmt;

    // walk-bob the GUN in sync with the footfall cadence so the weapon rides with
    // the body's bob (the hands IK to it, so gun + hands move together). Vertical
    // dips twice per stride (footfalls); a gentle horizontal figure-8 side to side.
    // Faded out by ADS/stance-upright so aiming and prone stay steady.
    const bobAmt = wa * upW * swayGate;
    _gunOff.y += -(0.5 - 0.5 * Math.cos(2 * this.#walkPhase)) * GUN_BOB_V * g.bob / 0.035 * bobAmt;
    _gunOff.x += Math.sin(this.#walkPhase) * GUN_BOB_H * bobAmt;

    // gun tracks the FULL camera aim (position + orientation) — it stays exactly
    // where it was. The ARMS are what move out of the way at up-aim (see #solveArm).
    _gun.copy(_gunOff).applyQuaternion(this.#camera.quaternion).add(this.#camera.position);
    this.#gunHolder.position.copy(_gun);
    this.#gunHolder.quaternion.copy(this.#camera.quaternion);
    this.#gunHolder.rotateX(kickVis * 0.16); // muzzle climb
    // look-sway (gun trails the turn) + strafe lean (gun rolls toward the move) —
    // small local rotations on the holder; the hands follow via the IK below.
    this.#gunHolder.rotateY(this.#swayYaw);
    this.#gunHolder.rotateX(this.#swayPitch);
    this.#gunHolder.rotateZ(this.#leanRoll);
    this.#gunHolder.updateWorldMatrix(true, true);
    this.#body.updateWorldMatrix(true, true);
    if (J && this.#gunAnchors) {
      // RIGHT hand always holds the gun (follows it off-screen when holstered)
      if (this.#gunAnchors.gripR && J.shoulderR) this.#solveArm(J.shoulderR, J.elbowR, this.#gunAnchors.gripR, 1);
      // LEFT hand: normal support grip, UNLESS a one-handed action has taken it
      const leftBusy = this.#holsterAmt > 0.4 && A.melee > 0;
      if (leftBusy && J.shoulderL) {
        // MELEE: swing the knife from off-screen up-and-across, then recover
        segLerp(_lt, A.melee, MEL_REST, MEL_WIND, MEL_SLASH, 0.25, 0.45);
        this.#leftTarget.position.copy(_lt).applyQuaternion(this.#camera.quaternion).add(this.#camera.position);
        this.#leftTarget.updateWorldMatrix(true, false);
        if (this.#knife) this.#knife.visible = true;
        this.#solveArm(J.shoulderL, J.elbowL, this.#leftTarget, -1);
      } else {
        if (this.#knife) this.#knife.visible = false;
        if (this.#gunAnchors.gripL && J.shoulderL) this.#solveArm(J.shoulderL, J.elbowL, this.#gunAnchors.gripL, -1);
      }
    }
    this.#updateFlash();
  }

  /** Pop a world-space muzzle flash at the gun's muzzle socket while firing. */
  #updateFlash() {
    const w = this.#weapons?.current;
    const lit = w ? Math.max(0, (w.justFired || 0) / 0.05) : 0;
    const muzzle = this.#gunAnchors?.muzzle;
    if (lit > 0 && muzzle) {
      muzzle.getWorldPosition(_mz);
      this.#flash.position.copy(_mz);
      this.#flash.lookAt(this.#camera.position);
      this.#flash.visible = true;
      this.#flashStar.material.opacity = Math.min(1, lit);
      this.#flashStar.rotation.z = Math.random() * Math.PI;         // cartoon flicker spin
      this.#flashStar.scale.setScalar(0.85 + Math.random() * 0.6);
      this.#flashCore.material.opacity = Math.min(1, lit * 1.3);
      this.#flashCore.scale.setScalar(0.9 + Math.random() * 0.25);
      this.#flashLight.position.copy(_mz);
      this.#flashLight.intensity = lit * 4.5;
    } else {
      this.#flash.visible = false;
      this.#flashStar.material.opacity = 0; this.#flashCore.material.opacity = 0;
      this.#flashLight.intensity = 0;
    }
  }

  /** Analytic two-bone IK: shoulder aims the upper arm, elbow bends by the law
   *  of cosines, a pole hint keeps the elbow down-and-out. Bones rest along -Y. */
  #solveArm(sh, el, anchor, side) {
    const { L1, L2 } = ARM;
    anchor.getWorldPosition(_tgt);   // target (world)
    sh.getWorldPosition(_S);         // shoulder (world)
    _toT.copy(_tgt).sub(_S);
    let d = _toT.length();
    d = clampN(d, Math.abs(L1 - L2) + 0.02, (L1 + L2) * 0.999);
    _dir.copy(_toT).normalize();
    // elbow sits on the circle where the two bones meet; place it toward a pole
    // hint (down + toward the camera) so the elbow hangs naturally.
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    // ADAPTIVE elbow pole: the base hint is "down / slight out / toward camera",
    // but a fixed WORLD hint flips the elbow when you aim far up or down. Rotate it
    // by the camera pitch around the camera's right axis so it tracks the AIM line —
    // the elbow then stays consistently below/behind the arm at every pitch.
    _poleBase.set(side * 0.35, -0.85, 0.4);
    _camRight.set(1, 0, 0).applyQuaternion(this.#camera.quaternion);
    _pole.copy(_poleBase).applyAxisAngle(_camRight, this.#aimPitch);
    // when looking UP, blend the pole toward straight world-down so the elbows drop
    // BELOW the grips and the forearms hang down out of the gun's line instead of
    // splaying across it. (The gun itself doesn't move — only the arm routing.)
    const up = clampN((this.#aimPitch - ARMS_TUCK_START) / ARMS_TUCK_RANGE, 0, 1);
    const tuck = up * up * (3 - 2 * up) * ARMS_TUCK_MAX; // smoothstep
    if (tuck > 0) _pole.lerp(_WORLD_DOWN, tuck).normalize();
    _bendAxis.copy(_pole).addScaledVector(_dir, -_pole.dot(_dir)); // perpendicular to dir
    if (_bendAxis.lengthSq() < 1e-6) _bendAxis.set(0, -1, 0); else _bendAxis.normalize();
    _elbow.copy(_S).addScaledVector(_dir, a).addScaledVector(_bendAxis, h);
    // hinge axis = normal of the arm plane; shared by both bones to lock the roll
    _hinge.crossVectors(_dir, _bendAxis).normalize();
    _upperDir.copy(_elbow).sub(_S).normalize();
    _foreDir.copy(_tgt).sub(_elbow).normalize();
    // orient the upper arm (local -Y at the elbow) with roll fixed to the hinge
    aimBasis(_qWorld, _upperDir, _hinge);
    sh.parent.getWorldQuaternion(_qParent);
    sh.quaternion.copy(_qParent.invert().multiply(_qWorld)); // _qWorld = sh's new world quat
    // orient the forearm (local -Y at the target), same hinge → no wrist spin
    aimBasis(_qWorldE, _foreDir, _hinge);
    el.quaternion.copy(_qWorld.invert().multiply(_qWorldE)); // parent(el) world quat = sh world quat
  }
}
