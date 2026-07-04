import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Transform, PlayerTag } from '../ecs/components/index.js';
import { Service } from '../core/ServiceLocator.js';
import { PlayerConfig } from '../config/index.js';
import { selectedBuild } from '../characters/selection.js';
import { buildWeaponModel } from '../weapons/weaponModels.js';
import { makeFlashStar, makeFlashCore } from '../weapons/Viewmodel.js';
import { fpBody } from './fpBodyState.js';

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
const TORSO_LEAN_DOWN = 0.28;  // extra recline per rad of downward pitch: opens the
                               // sightline past the chest to the legs when you look down
// NOTE sign: after the 180° body facing, NEGATIVE thigh.x swings the legs
// FORWARD (world -z); positive kicks them backward (reads as "backwards legs").
// Give the thighs a static forward angle so the knees + feet sit forward/under
// the hip; swing them further forward as you look down so they fill the view.
const THIGH_BASE = -0.28;
const THIGH_FLEX_DOWN = 0.45;  // extra forward hip flex per rad of downward pitch
// pull the whole body back off the camera so the chest isn't "inside the head".
// This is bounded by arm reach at LEVEL aim (the gun is furthest forward there);
// looking down brings the gun close to the body so the dynamic lean is free.
const PULLBACK = 0.16;
// The gun's BARREL tracks the full camera pitch (points all the way up/down), but
// the gun PIVOTS AROUND THE GRIP: the hands are placed using an EASED pitch so they
// stay in a comfortable, reachable spot near the ready position instead of rising
// up past the face when you look up. Only the barrel swings up out of frame.
// Asymmetric: down keeps ~full range so the legs still read.
const GRIP_UP_LIN = 0.35;  // up: hands track 1:1 until here (~20°)
const GRIP_UP_MAX = 0.65;  // up: hand-target pitch asymptote (~37°)
const GRIP_DN_LIN = 1.1;   // down: near-full range
const GRIP_DN_MAX = 1.5;
function easeGripPitch(p) {
  if (p >= 0) {
    if (p <= GRIP_UP_LIN) return p;
    const r = GRIP_UP_MAX - GRIP_UP_LIN;
    return GRIP_UP_LIN + r * (1 - Math.exp(-(p - GRIP_UP_LIN) / r));
  }
  const a = -p;
  if (a <= GRIP_DN_LIN) return p;
  const r = GRIP_DN_MAX - GRIP_DN_LIN;
  return -(GRIP_DN_LIN + r * (1 - Math.exp(-(a - GRIP_DN_LIN) / r)));
}
const _UNIT_X = new THREE.Vector3(1, 0, 0);
const _qFull = new THREE.Quaternion();
const _qEased = new THREE.Quaternion();
const _qCorr = new THREE.Quaternion();
const _gripTgt = new THREE.Vector3();
const _rotGripLocal = new THREE.Vector3();

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
  #gripLocalR = new THREE.Vector3(); #hasGripLocal = false;
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
    this.#scene.add(rig);
    this.#body = rig;
    this.#built = true;
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
      // cache the primary grip's offset in holder-local space: with the holder at
      // identity, the grip's world position IS its holder-local position. Used to
      // pivot the gun's pitch around the grip so the hands stay put while the barrel
      // swings up (see lateUpdate).
      this.#hasGripLocal = false;
      if (this.#gunAnchors?.gripR) {
        const pp = this.#gunHolder.position.clone(), pq = this.#gunHolder.quaternion.clone();
        this.#gunHolder.position.set(0, 0, 0); this.#gunHolder.quaternion.identity();
        this.#gunHolder.updateWorldMatrix(true, true);
        this.#gunAnchors.gripR.getWorldPosition(this.#gripLocalR);
        this.#gunHolder.position.copy(pp); this.#gunHolder.quaternion.copy(pq);
        this.#hasGripLocal = true;
      }
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

    // stand the rig on the ground under the interpolated capsule; face the aim
    _pos.lerpVectors(t.previousPosition, t.position, this.#time.alpha);
    const feetY = _pos.y - (tag.halfHeight + PlayerConfig.capsuleRadius);
    // pull the body back along the (horizontal) aim so the chest isn't at the eye
    _fwd.set(0, 0, -1).applyQuaternion(this.#camera.quaternion); _fwd.y = 0; _fwd.normalize();
    this.#body.position.set(_pos.x - _fwd.x * PULLBACK, feetY, _pos.z - _fwd.z * PULLBACK);
    this.#body.rotation.y = tag.yaw + Math.PI; // rig faces +z; player forward is -z
    const J = this.#body.userData?.joints;
    if (J?.head) J.head.visible = false;
    // as you look DOWN, recline the chest further back and swing the thighs forward
    // so the sightline opens past the chest and the legs fill the lower view (this
    // is what makes the legs visible "like before"). Free on arm reach because the
    // gun sits close to the body when aimed down.
    this.#aimPitch = tag.pitch;              // drives the adaptive elbow pole in #solveArm
    const down = Math.max(0, -tag.pitch);
    if (J?.torso) J.torso.rotation.x = TORSO_LEAN - down * TORSO_LEAN_DOWN;
    const thighFlex = THIGH_BASE - down * THIGH_FLEX_DOWN; // negative = forward
    if (J?.thighL) J.thighL.rotation.x = thighFlex;
    if (J?.thighR) J.thighR.rotation.x = thighFlex;

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

    // Pivot the gun around the GRIP: the barrel points along the FULL camera pitch,
    // but the HANDS are placed with an EASED pitch so they stay near the ready
    // position and don't rise up past the face when looking up. Only the barrel
    // swings out of frame. (Bullets/aim track the camera in WeaponSystem — untouched.)
    _qFull.copy(this.#camera.quaternion);
    _qFull.multiply(_qCorr.setFromAxisAngle(_UNIT_X, kickVis * 0.16)); // muzzle climb baked in
    const corr = easeGripPitch(this.#aimPitch) - this.#aimPitch;
    _qEased.copy(this.#camera.quaternion).multiply(_qCorr.setFromAxisAngle(_UNIT_X, corr));
    if (this.#hasGripLocal) {
      // grip target = where the grip sits under the EASED pitch (stays reachable/low)
      _gripTgt.copy(_gunOff).add(this.#gripLocalR).applyQuaternion(_qEased).add(this.#camera.position);
      // place the holder so gripR lands on that target while the gun uses the FULL orient
      _rotGripLocal.copy(this.#gripLocalR).applyQuaternion(_qFull);
      this.#gunHolder.position.copy(_gripTgt).sub(_rotGripLocal);
    } else {
      _gun.copy(_gunOff).applyQuaternion(_qFull).add(this.#camera.position);
      this.#gunHolder.position.copy(_gun);
    }
    this.#gunHolder.quaternion.copy(_qFull);
    this.#gunHolder.updateWorldMatrix(true, true);
    this.#body.updateWorldMatrix(true, true);
    if (J && this.#gunAnchors) {
      if (this.#gunAnchors.gripR && J.shoulderR) this.#solveArm(J.shoulderR, J.elbowR, this.#gunAnchors.gripR, 1);
      if (this.#gunAnchors.gripL && J.shoulderL) this.#solveArm(J.shoulderL, J.elbowL, this.#gunAnchors.gripL, -1);
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
