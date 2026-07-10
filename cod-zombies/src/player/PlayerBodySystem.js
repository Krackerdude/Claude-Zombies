import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Transform, PlayerTag } from '../ecs/components/index.js';
import { Service } from '../core/ServiceLocator.js';
import { PlayerConfig } from '../config/index.js';
import { selectedBuild } from '../characters/selection.js';
import { buildWeaponModel } from '../weapons/weaponModels.js';
import { papCamo } from '../weapons/gunMaterials.js';
import { makeFlashStar, makeFlashCore, buildVmFrag, buildVmWraith, buildVmSemtex, buildVmAcid } from '../weapons/Viewmodel.js';
import { fpBody, weaponAction } from './fpBodyState.js';
import { buildPerkBottle } from '../perks/perks.js';

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
const DUAL_DX = 0.16; // dual-wield: each twin sits this far to its side of centre
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
// where the off hand holds the holstered gun during a one-handed action — a FIXED
// camera-space rest so the arm stays put instead of chasing the swaying weapon
const ANCHOR_REST = new THREE.Vector3(0.16, -0.72, -0.19);
// melee left-hand knife-swing keyframes (camera-local: +x right, +y up, -z forward)
const MEL_REST = new THREE.Vector3(-0.10, -0.44, -0.30); // off the bottom-left
const MEL_WIND = new THREE.Vector3(0.26, 0.12, -0.42);   // wound up, upper-right
const MEL_SLASH = new THREE.Vector3(-0.30, -0.16, -0.32); // slashed through, lower-left
// grenade cook (pin pulled, cocked) then throw follow-through
const NADE_COOK = new THREE.Vector3(-0.02, -0.02, -0.46); // held up cocked, in view (left hand)
const NADE_THROW = new THREE.Vector3(-0.10, -0.02, -0.52); // flung forward on release
const THROW_TIME = 0.4;
// the OTHER (right) hand reaches in to pull the pin / arm the device, then pulls away
const PULL_REST = new THREE.Vector3(0.26, -0.40, -0.32);  // resting low-right (off the gun)
const PULL_GRAB = new THREE.Vector3(0.06, -0.04, -0.44);  // at the throwable's pin
const PULL_AWAY = new THREE.Vector3(0.46, -0.48, -0.30);  // pin yanked back DOWN-RIGHT, off-screen the way it came
const _rt = new THREE.Vector3();
// perk drink — the bottle is placed directly in CAMERA space so its NECK meets the
// lips (bottom-centre of the view), tilted back to pour; the hand follows to hold it.
const BOTTLE_HOLD = new THREE.Vector3(0.0, -0.05, -0.28);   // bottle centre at the chug
const BOTTLE_LOW = new THREE.Vector3(0.06, -0.52, -0.26);   // off-screen low (raise from / drop to)
const BOTTLE_TILT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 2.32); // neck → lips, base up
const DRINK_HOLD = new THREE.Vector3(0.0, -0.17, -0.27);    // wrist grips the bottle body
const DRINK_LOW = new THREE.Vector3(-0.02, -0.55, -0.28);
const _mDrink = new THREE.Matrix4(); const _m2Drink = new THREE.Matrix4();
const _vDrink = new THREE.Vector3(); const _qDrink = new THREE.Quaternion(); const _sDrink = new THREE.Vector3();
// reload: a WEIGHTY generic motion (no per-gun keyframes) — lower + tilt the whole
// weapon, with a two-beat mag-swap punch. The hands ride the gun; the support hand
// dips a touch toward the mag on the swap.
const RELOAD_DROP = 0.14;   // how far the gun eases down at the hip
const RELOAD_ROLL = 0.34;   // tilt left (roll) so the mag side rocks toward the player
const RELOAD_PITCH = 0.42;  // muzzle rises as the gun rocks back
// inspect (one-handed): raise the empty hand into view, turn it, lower
const INSPECT_TIME = 1.6;
const INS_UP = new THREE.Vector3(0.05, -0.06, -0.26);
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
  #gunHolder = new THREE.Group(); #gunHolderL = new THREE.Group(); // R gun; L gun (dual-wield)
  #gunAnchors = null; #gunAnchorsL = null; #dual = false;
  #gunKey = null; #gunSightY = 0.08; #gunDrop = 0; #aimPitch = 0;
  #walkAmt = 0; #walkPhase = 0; #idle = 0; #restHipY = 0.94; // locomotion state
  #lastYaw = 0; #lastPitch = 0; #swayYaw = 0; #swayPitch = 0; #leanRoll = 0; // look-sway + strafe lean
  #crouchAmt = 0; #slideAmt = 0; #proneAmt = 0; // eased stance blends
  #reloadAmt = 0; // eased reload blend (weighty lower + tilt, no per-gun keyframes)
  #holsterAmt = 0; #knife = null; #throwables = {}; #activeThrow = null; #bottle = null; #bottleColor = -1; #drinkK = 0;
  #wasCooking = false; #throwT = 0; #inspectT = 0; #lastThrowKind = 'frag';
  #leftTarget = new THREE.Group(); #rightTarget = new THREE.Group(); // action IK targets
  #flash = null; #flashStar = null; #flashCore = null; #flashLight = null;

  init() {
    this.#scene = this.world.services.get(Service.Scene).scene;
    this.#time = this.world.services.get(Service.Time);
    this.#gameState = this.world.services.get(Service.GameState);
    this.#weapons = null; // resolved lazily in #syncGun (registers with the scene)
    this.#camera = this.world.services.get(Service.Render).camera;
    this.#physics = this.world.services.has(Service.Physics) ? this.world.services.get(Service.Physics) : null;
    this.#scene.add(this.#gunHolder); this.#scene.add(this.#gunHolderL); this.#gunHolderL.visible = false;
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
      // inspect (KeyH): a quick one-handed look at the hand while the gun holsters
      if (e.code === 'KeyH' && this.#enabled && !e.repeat && this.#inspectT <= 0) this.#inspectT = INSPECT_TIME;
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
    this.#gunHolderL.visible = this.#enabled && this.#dual;
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
    this.#killRaycast(this.#flash);
    this.#scene.add(rig);
    this.#body = rig;
    this.#built = true;
    // one-handed action rig: a world-space IK target the left hand reaches for during
    // gestures, plus the props it holds (knife / grenade / perk bottle), each shown
    // only during its own action.
    this.#scene.add(this.#leftTarget); this.#scene.add(this.#rightTarget);
    if (J?.handL) {
      // knife is our own hand-scale combat knife (kept — it reads better than the
      // overlay's). Throwables REUSE the real viewmodel models, sized up for the hand.
      this.#knife = this.#buildKnife(); this.#knife.visible = false; J.handL.add(this.#knife);
      this.#throwables = { frag: buildVmFrag(), wraithfire: buildVmWraith(), semtex: buildVmSemtex(), acid: buildVmAcid() };
      // frag needs a pull-pin like the overlay's (the shared builder omits it)
      const fragPin = new THREE.Group();
      fragPin.add(new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 6, 12), new THREE.MeshStandardMaterial({ color: 0xcfc8a0, metalness: 0.85, roughness: 0.3 })));
      fragPin.position.set(0.06, 0.085, 0); this.#throwables.frag.add(fragPin); this.#throwables.frag.userData = { pin: fragPin };
      for (const k in this.#throwables) {
        const p = this.#throwables[k]; p.visible = false;
        p.scale.setScalar(1.7); p.rotation.set(2.5, 0, 0); p.position.set(0, -0.04, 0);
        const pin = p.userData?.pin; if (pin) pin.userData = { x: pin.position.x, y: pin.position.y, z: pin.position.z };
        J.handL.add(p);
      }
      this.#bottle = buildPerkBottle(0x66ccff); this.#bottle.visible = false;
      // cap/neck points UP-and-OUT of the fist toward the mouth (not the base); modest
      // scale so it doesn't fill the view and clip into the face when raised.
      this.#bottle.scale.setScalar(1.5); this.#bottle.rotation.set(1.9, 0, 0); this.#bottle.position.set(0, -0.05, 0);
      J.handL.add(this.#bottle);
    }
    this.#killRaycast(this.#body); // body + hand-held props ignore bullet/shade rays
  }

  /** Our own hand-scale combat knife (blade along -Y, pitched forward out of the fist). */
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

  #tintBottle(color) {
    if (!this.#bottle || this.#bottleColor === color) return;
    this.#bottleColor = color;
    this.#bottle.traverse((o) => { if (o.material && o.material.emissive) { o.material.color.setHex(color); o.material.emissive.setHex(color); } });
  }

  /** Drive the LEFT hand through the active one-handed action (melee / grenade /
   *  drink), placing the IK target in camera space and showing the right prop.
   *  Returns true if an action took the hand. */
  #hideProps() {
    if (this.#knife) this.#knife.visible = false;
    if (this.#bottle) this.#bottle.visible = false;
    for (const k in this.#throwables) this.#throwables[k].visible = false;
  }

  #poseLeftAction(J, A) {
    this.#hideProps();
    let took = true;
    if (A.melee > 0) {
      segLerp(_lt, A.melee, MEL_REST, MEL_WIND, MEL_SLASH, 0.25, 0.45);
      if (this.#knife) this.#knife.visible = true;
    } else if (A.drink) {
      const t = A.drink.t;
      // raise (0..0.45) → chug at the lips (0.45..1.4) → drop off-screen (1.4..1.8)
      let k;
      if (t < 0.45) k = t / 0.45;
      else if (t < 1.4) k = 1;
      else k = 1 - clampN((t - 1.4) / 0.4, 0, 1);
      this.#drinkK = k * k * (3 - 2 * k); // smoothstep
      _lt.lerpVectors(DRINK_LOW, DRINK_HOLD, this.#drinkK);
      if (this.#bottle) { this.#bottle.visible = t < 1.7; this.#tintBottle(A.drink.color); }
    } else if (this.#inspectT > 0) {
      const p = 1 - this.#inspectT / INSPECT_TIME; // raise → hold/turn → lower
      if (p < 0.28) _lt.copy(MEL_REST).lerp(INS_UP, p / 0.28);
      else if (p < 0.72) { _lt.copy(INS_UP); _lt.x += Math.sin((p - 0.28) * 10) * 0.03; } // small turn
      else _lt.copy(INS_UP).lerp(MEL_REST, (p - 0.72) / 0.28);
    } else {
      took = false;
    }
    if (!took) return false;
    this.#leftTarget.position.copy(_lt).applyQuaternion(this.#camera.quaternion).add(this.#camera.position);
    this.#leftTarget.updateWorldMatrix(true, false);
    this.#solveArm(J.shoulderL, J.elbowL, this.#leftTarget, -1, 1, true); // locked: no rotate-around
    // Drink: drive the bottle DIRECTLY in camera space (independent of the hand
    // IK) so its neck reliably meets the lips, tilted to pour. The hand is posed
    // near the body above so it reads as holding it.
    if (A.drink && this.#bottle) {
      const cam = this.#camera;
      _vDrink.lerpVectors(BOTTLE_LOW, BOTTLE_HOLD, this.#drinkK).applyQuaternion(cam.quaternion).add(cam.position);
      _qDrink.copy(cam.quaternion).multiply(BOTTLE_TILT);
      this.#bottle.parent.updateWorldMatrix(true, false);
      _mDrink.compose(_vDrink, _qDrink, _sDrink.set(1.5, 1.5, 1.5));
      _mDrink.premultiply(_m2Drink.copy(this.#bottle.parent.matrixWorld).invert());
      _mDrink.decompose(this.#bottle.position, this.#bottle.quaternion, this.#bottle.scale);
    }
    return true;
  }

  /** Reload support hand: grab the foregrip, but dip a touch down/back toward the
   *  mag well on the swap surge (generic — the mag sits below every gun). */
  #poseReloadHand(J, surge) {
    if (!this.#gunAnchors?.gripL || !J.shoulderR) return;
    this.#gunAnchors.gripL.getWorldPosition(_lt);
    _camRight.set(0, -1, 0).applyQuaternion(this.#camera.quaternion); // camera-down
    _lt.addScaledVector(_camRight, surge * 0.11);                     // dip toward the mag
    this.#leftTarget.position.copy(_lt);
    this.#leftTarget.updateWorldMatrix(true, false);
    this.#solveArm(J.shoulderR, J.elbowR, this.#leftTarget, 1);
  }

  /** TWO-handed throwable cook: the LEFT hand holds the device up while the RIGHT
   *  hand reaches in and pulls the pin / arms it (matched to each throwable's own
   *  prop animation), then the left hand flings it forward on release. */
  #poseThrowable(J, A) {
    this.#hideProps();
    const kind = A.cook ? (A.cook.kind || 'frag') : this.#lastThrowKind;
    if (A.cook) this.#lastThrowKind = kind;
    const prop = this.#throwables[kind] || this.#throwables.frag;
    this.#activeThrow = prop;

    // LEFT hand: hold the device up (cook) → fling forward (release)
    if (A.cook) { _lt.copy(MEL_REST).lerp(NADE_COOK, clampN(A.cook.t / 0.35, 0, 1)); prop.visible = true; }
    else { const tp = 1 - this.#throwT / THROW_TIME; _lt.copy(NADE_COOK).lerp(NADE_THROW, clampN(tp * 1.4, 0, 1)); prop.visible = tp < 0.4; }
    this.#leftTarget.position.copy(_lt).applyQuaternion(this.#camera.quaternion).add(this.#camera.position);
    this.#leftTarget.updateWorldMatrix(true, false);
    if (J.shoulderL) this.#solveArm(J.shoulderL, J.elbowL, this.#leftTarget, -1);

    // RIGHT hand: while cooking, reach in and prep the device; on release, snap back
    // toward the (holstered) gun. Prop's own part (pin / button) animates to match.
    if (A.cook) {
      const t = A.cook.t, isBtn = kind === 'semtex';
      if (t < 0.22) _rt.copy(PULL_REST).lerp(PULL_GRAB, t / 0.22);            // reach in
      else if (isBtn) _rt.copy(PULL_GRAB);                                    // hold on the detonator
      else if (t < 0.5) _rt.copy(PULL_GRAB).lerp(PULL_AWAY, (t - 0.22) / 0.28); // yank the pin out
      else _rt.copy(PULL_AWAY);
      this.#rightTarget.position.copy(_rt).applyQuaternion(this.#camera.quaternion).add(this.#camera.position);
      this.#rightTarget.updateWorldMatrix(true, false);
      if (J.shoulderR) this.#solveArm(J.shoulderR, J.elbowR, this.#rightTarget, 1);
      this.#animThrowPart(prop, kind, t);
    } else if (this.#gunAnchors?.gripR && J.shoulderR) {
      this.#solveArm(J.shoulderR, J.elbowR, this.#gunAnchors.gripR, 1); // recover to the gun
    }
  }

  /** Animate a throwable's own moving part to match its overlay animation. */
  #animThrowPart(prop, kind, t) {
    if (kind === 'semtex') {
      const btn = prop.userData?.button, led = prop.userData?.led;
      const press = clampN((t - 0.2) / 0.22, 0, 1);
      if (btn) btn.position.y = (btn.userData?.y ?? btn.position.y) - press * 0.014;
      if (led) led.visible = press >= 1 ? Math.sin(t * 30) > -0.2 : true;
    } else { // frag / acid: flick the pull-pin off
      const pin = prop.userData?.pin;
      if (!pin) return;
      const pop = clampN((t - 0.22) / 0.28, 0, 1);
      pin.visible = pop < 1;
      if (pin.visible && pin.userData) { pin.position.set(pin.userData.x + pop * 0.06, pin.userData.y + pop * 0.05, pin.userData.z - pop * 0.03); pin.rotation.z = pop * 14; }
    }
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
    // rebuild when the model, its Pack-a-Punch state, or dual-wield changes
    const key = w ? `${w.data.modelName || w.data.name}|${w.data.pap ? 1 : 0}|${w.data.dualWield ? 1 : 0}` : null;
    if (key === this.#gunKey) return;
    this.#gunKey = key;
    while (this.#gunHolder.children.length) this.#gunHolder.remove(this.#gunHolder.children[0]);
    while (this.#gunHolderL.children.length) this.#gunHolderL.remove(this.#gunHolderL.children[0]);
    this.#gunAnchors = this.#gunAnchorsL = null; this.#dual = false; this.#gunHolderL.visible = false;
    if (!w) return;
    const built = buildWeaponModel(w);
    if (!built?.group) return;
    if (w.data.pap) this.#applyPap(built.group);
    this.#killRaycast(built.group);
    this.#gunHolder.add(built.group);
    this.#gunAnchors = built.anchors || null;
    this.#gunSightY = built.sightY ?? 0.08; // sight height → ADS raise target
    // taller guns (scopes/tall sights) sit LOWER on screen at the hip for visibility
    // (ADS is unaffected — it centres on the sight line regardless)
    this.#gunDrop = clampN(((built.height ?? 0.08) - 0.08) * 0.6, 0, 0.14);
    // dual-wield: build a second, mirrored gun for the left hand
    if (w.data.dualWield) {
      const left = buildWeaponModel(w);
      if (left?.group) {
        if (w.data.pap) this.#applyPap(left.group);
        this.#killRaycast(left.group);
        this.#gunHolderL.add(left.group);
        this.#gunHolderL.scale.set(-1, 1, 1); // mirror
        this.#gunAnchorsL = left.anchors || null;
        this.#dual = true; this.#gunHolderL.visible = this.#enabled;
      }
    }
  }

  /** Make every mesh in `obj` invisible to raycasts — the first-person body, gun and
   *  props live in the world scene, but bullet-impact / shade rays must ignore them
   *  (otherwise shots register hits on the gun/arms right in front of the camera). */
  #killRaycast(obj) { obj.traverse((o) => { o.raycast = () => {}; }); }

  /** Swap the gun-metal materials for the animated Pack-a-Punch holo camo (leaving
   *  sights / wood / grips / energy cores). The camo animates via the shared tick. */
  #applyPap(group) {
    const camo = papCamo();
    group.traverse((o) => { if (o.isMesh && o.material?.userData?.papSwap) o.material = camo; });
  }

  /** Place a gun holder at a world position, oriented to the camera aim with the
   *  shared muzzle-climb + look-sway + strafe-lean rotations. */
  #placeHolder(holder, pos, kickVis) {
    holder.position.copy(pos);
    holder.quaternion.copy(this.#camera.quaternion);
    holder.rotateX(kickVis * 0.16); // muzzle climb
    holder.rotateY(this.#swayYaw); holder.rotateX(this.#swayPitch); holder.rotateZ(this.#leanRoll);
    holder.updateWorldMatrix(true, true);
  }

  lateUpdate(dt) {
    if (!this.#enabled || !this.#body) return;
    if (!this.#gameState.isPlaying || this.world.first(PlayerTag, Transform) === undefined) {
      this.#body.visible = false; this.#gunHolder.visible = false; this.#gunHolderL.visible = false;
      if (this.#flash) { this.#flash.visible = false; this.#flashLight.intensity = 0; }
      return;
    }
    const id = this.world.first(PlayerTag, Transform);
    const tag = this.world.get(id, PlayerTag);
    const t = this.world.get(id, Transform);
    this.#body.visible = true;
    this.#gunHolder.visible = true;
    this.#gunHolderL.visible = this.#dual;

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
    _gunOff.y -= this.#gunDrop * (1 - ads); // taller guns ride lower at the hip (not in ADS)
    // WEIGHTY RELOAD: ease the whole gun down + tilt it left, with a two-beat mag-swap
    // punch (a down-tug when the mag drops, an up-snap when it seats). Generic — no
    // per-gun content. The lean/pitch are applied to the holder just below.
    const reloadingNow = !!(this.#weapons?.current?.reloading);
    const rp = clampN(this.#weapons?.current?.reloadProgress || 0, 0, 1);
    this.#reloadAmt = damp(this.#reloadAmt, reloadingNow ? 1 : 0, 9, dtc);
    const ra = this.#reloadAmt;
    const surge = Math.sin(rp * Math.PI) * ra;                        // 0→1→0 across the reload
    const magOut = Math.max(0, 1 - Math.abs(rp - 0.30) / 0.10) * ra;  // beat: the mag drops out
    const magIn = Math.max(0, 1 - Math.abs(rp - 0.62) / 0.10) * ra;   // beat: the fresh mag seats
    _gunOff.y -= RELOAD_DROP * ra + surge * 0.03 + magOut * 0.05 - magIn * 0.045;
    _gunOff.x -= surge * 0.035;
    _gunOff.z += ra * 0.04; // pull toward the body
    const reloadRoll = RELOAD_ROLL * ra + surge * 0.12;   // tilt left, deepening on the swap
    const reloadPitch = RELOAD_PITCH * ra + magIn * 0.18; // muzzle rises + snaps on seat
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
    // grenade throw follow-through: fires briefly when a cook is released
    const cookActive = !!A.cook;
    if (this.#wasCooking && !cookActive) this.#throwT = THROW_TIME;
    this.#wasCooking = cookActive;
    if (this.#throwT > 0) this.#throwT = Math.max(0, this.#throwT - dtc);
    if (this.#inspectT > 0) this.#inspectT = Math.max(0, this.#inspectT - dtc);
    const offAction = A.melee > 0 || cookActive || !!A.drink || this.#throwT > 0 || this.#inspectT > 0;
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
    // For dual-wield the twins straddle the SCREEN CENTRE (remove the single-gun's
    // rightward bias) by ±DUAL_DX, so the two arms read as a clean mirror.
    const baseX = _gunOff.x - (this.#dual ? GUN_LOCAL.x : 0);
    _gunOff.x = baseX + (this.#dual ? DUAL_DX : 0);
    _gun.copy(_gunOff).applyQuaternion(this.#camera.quaternion).add(this.#camera.position);
    this.#placeHolder(this.#gunHolder, _gun, kickVis);
    if (ra > 0.002 && !this.#dual) { // reload rock: tilt left + pitch up on top of the aim
      this.#gunHolder.rotateZ(reloadRoll); this.#gunHolder.rotateX(reloadPitch);
      this.#gunHolder.updateWorldMatrix(true, true);
    }
    if (this.#dual) {
      _gunOff.x = baseX - DUAL_DX;
      _gun.copy(_gunOff).applyQuaternion(this.#camera.quaternion).add(this.#camera.position);
      this.#placeHolder(this.#gunHolderL, _gun, kickVis);
    }
    this.#body.updateWorldMatrix(true, true);
    if (J && this.#gunAnchors) {
      if (A.cook || this.#throwT > 0) {
        // THROWABLE: two-handed — left holds the device, right pulls the pin / arms it
        this.#poseThrowable(J, A);
      } else if (this.#dual && this.#gunAnchorsL) {
        // DUAL-WIELD: each hand holds its NEAR gun (no reaching across). The dominant
        // hand (screen-right = anatomic-left joints after the 180° flip) takes the
        // right gun; the off hand takes the left gun.
        this.#hideProps();
        if (this.#gunAnchors.gripR && J.shoulderL) this.#solveArm(J.shoulderL, J.elbowL, this.#gunAnchors.gripR, -1);   // right gun (+DX)
        if (this.#gunAnchorsL.gripR && J.shoulderR) this.#solveArm(J.shoulderR, J.elbowR, this.#gunAnchorsL.gripR, 1);  // left gun (-DX)
      } else if (w && w.reloading && J.shoulderL) {
        // RELOAD: both hands ride the gun (which lowers + tilts, handled above). The
        // dominant hand stays on the trigger grip; the support hand grabs the foregrip
        // but dips toward the mag well on the swap surge — a single generic motion.
        this.#hideProps();
        if (this.#gunAnchors.gripR && J.shoulderL) this.#solveArm(J.shoulderL, J.elbowL, this.#gunAnchors.gripR, -1);
        this.#poseReloadHand(J, surge);
      } else {
        const tookLeft = this.#holsterAmt > 0.4 && J.shoulderL && this.#poseLeftAction(J, A);
        if (tookLeft) {
          // one-handed action: the anchor hand keeps the (holstered) gun, but held
          // at a FIXED, locked rest so it doesn't rotate around with the sway
          if (J.shoulderR) {
            this.#rightTarget.position.copy(ANCHOR_REST).applyQuaternion(this.#camera.quaternion).add(this.#camera.position);
            this.#rightTarget.updateWorldMatrix(true, false);
            this.#solveArm(J.shoulderR, J.elbowR, this.#rightTarget, 1, 1, true);
          }
        } else {
          // DEFAULT hold: dominant hand (screen-right = shoulderL) on the TRIGGER grip,
          // support hand (screen-left = shoulderR) on the FOREGRIP — no reaching across.
          this.#hideProps();
          const isPistol = w?.data?.category === 'pistol';
          if (this.#gunAnchors.gripR && J.shoulderL) this.#solveArm(J.shoulderL, J.elbowL, this.#gunAnchors.gripR, -1);
          // support hand onto the foregrip (stretch hard for far handguards so it
          // actually reaches the bulk of a long rifle); but a PISTOL is held with
          // BOTH hands cupping the grip — never reach forward to the barrel
          if (this.#gunAnchors.gripL && J.shoulderR) this.#solveArm(J.shoulderR, J.elbowR, this.#gunAnchors.gripL, 1, isPistol ? 1 : 1.6);
        }
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
  #solveArm(sh, el, anchor, side, stretch = 1, lock = false) {
    let { L1, L2 } = ARM;
    anchor.getWorldPosition(_tgt);   // target (world)
    sh.getWorldPosition(_S);         // shoulder (world)
    _toT.copy(_tgt).sub(_S);
    let d = _toT.length();
    // Stretchy IK: when the target sits past full reach (a far foregrip on a long
    // gun), PHYSICALLY lengthen the arm — the IK only sets bone rotations, so we
    // must also scale the shoulder subtree by the same factor or the hand stays
    // short of the target. stretch === 1 keeps the arm rigid (normal case).
    const reach = (L1 + L2) * 0.999;
    let sUsed = 1;
    if (stretch > 1 && d > reach) {
      sUsed = Math.min(d, (L1 + L2) * stretch) / (L1 + L2);
      L1 *= sUsed; L2 *= sUsed;
    }
    sh.scale.setScalar(sUsed); // actually grow/reset the arm so the math holds
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
    if (lock) {
      // LOCKED: a fixed, purely view-relative pole — no aim-pitch tracking, no
      // up-aim tuck. The elbow keeps a constant angle so a scripted action arm
      // stays put and can't rotate/flip around as you look about.
      _pole.copy(_poleBase).applyQuaternion(this.#camera.quaternion);
    } else {
      _camRight.set(1, 0, 0).applyQuaternion(this.#camera.quaternion);
      _pole.copy(_poleBase).applyAxisAngle(_camRight, this.#aimPitch);
      // when looking UP, blend the pole toward straight world-down so the elbows drop
      // BELOW the grips and the forearms hang down out of the gun's line instead of
      // splaying across it. (The gun itself doesn't move — only the arm routing.)
      const up = clampN((this.#aimPitch - ARMS_TUCK_START) / ARMS_TUCK_RANGE, 0, 1);
      const tuck = up * up * (3 - 2 * up) * ARMS_TUCK_MAX; // smoothstep
      if (tuck > 0) _pole.lerp(_WORLD_DOWN, tuck).normalize();
    }
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
