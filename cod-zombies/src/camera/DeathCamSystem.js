import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Transform, PlayerTag } from '../ecs/components/index.js';
import { Service } from '../core/ServiceLocator.js';
import { AppState } from '../core/GameState.js';
import { buildZombieRig } from '../scenes/zombieRig.js';
import { survivorLook } from '../scenes/MenuScene.js';
import { selectedBuild } from '../characters/selection.js';

const _orbitPos = new THREE.Vector3();
const _orbitQuat = new THREE.Quaternion();
const _hand = new THREE.Vector3();
const _head = new THREE.Vector3();
const _fwd = new THREE.Vector3();

// Timeline (seconds): settle onto the prone body → reach the hand out → the arm
// and head drop (death) → THEN the death cam pulls out into its slow orbit.
const FALL = 1.3;   // settle the view down onto the prone survivor
const REACH = 1.3;  // hand held out, trembling
const DROP = 1.2;   // arm falls, head sinks to the ground
const PAN = 10.0;   // the actual death cam — slow wide orbit
const FADE = 1.4;
const T_REACH = FALL;                 // 1.3
const T_DROP = FALL + REACH;          // 2.6
const T_PAN = FALL + REACH + DROP;    // 3.8
const T_FADE = T_PAN + PAN;           // 13.8
const T_END = T_FADE + FADE;          // 15.2
const PAN_BLEND = 1.2;                // ease from the resting pose into the orbit

const lerp = THREE.MathUtils.lerp;
const clamp01 = (t) => THREE.MathUtils.clamp(t, 0, 1);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The death cinematic. When the run ends (RoundSystem emits `death:begin` and
 * flips the app state to DEATHCAM) this system takes sole ownership of the
 * gameplay camera AND spawns the actual survivor — the same rigged character
 * from the menu — lying PRONE on the arena floor:
 *
 *   FALL   – the view settles down onto the prone survivor.
 *   REACH  – the survivor's arm is stretched out along the ground, the hand
 *            straining/trembling as they cling on.
 *   DROP   – the arm falls limp and the head sinks to the ground (death). The
 *            camera settles to the dirt with it.
 *   PAN    – only now does the death cam take over: a slow, wide orbit of the
 *            arena revealing the fallen body (~10s).
 *   FADE   – emits `death:fade` (UI blacks out) then `death:finish` — RoundSystem
 *            resets the field and returns to the main menu.
 *
 * The camera only ever eases between FIXED points/targets — it never tracks a
 * moving joint per frame, so it can't jitter or flip.
 */
export class DeathCamSystem extends System {
  #gameState;
  #camera;
  #events;
  #scene;

  #t = 0;
  #faded = false;
  #from = new THREE.Vector3();
  #fromQuat = new THREE.Quaternion();
  #restPos = new THREE.Vector3();
  #restQuat = new THREE.Quaternion();
  #ground = new THREE.Vector3();
  #center = new THREE.Vector3(0, 1.4, 0);
  #yaw = 0;
  #dummy = new THREE.Object3D();

  // fixed camera framing, computed once when the body spawns
  #eye = new THREE.Vector3();          // first-person-ish eye by the prone head
  #look = new THREE.Vector3();         // the reaching hand (look target)
  #groundEye = new THREE.Vector3();    // eye sunk to the floor as the head dies
  #groundLook = new THREE.Vector3();   // the dirt just ahead (final downward gaze)

  #body = null;   // the fallen survivor (outer group)
  #joints = null; // its rig joints

  init() {
    this.#gameState = this.world.services.get(Service.GameState);
    this.#camera = this.world.services.get(Service.Render).camera;
    this.#events = this.world.services.get(Service.Events);
    this.#scene = this.world.services.get(Service.Scene).scene;
    this.#events.on('death:begin', () => this.#start());
  }

  /** Capture the death pose, spawn the prone survivor, and pre-compute the shot. */
  #start() {
    this.#teardown(); // safety — never leave two bodies
    this.#t = 0;
    this.#faded = false;
    this.#from.copy(this.#camera.position);
    this.#fromQuat.copy(this.#camera.quaternion);

    // where the body lies (player's feet), and which way it was facing
    const pid = this.world.first(PlayerTag, Transform);
    if (pid !== undefined) {
      const t = this.world.get(pid, Transform);
      this.#ground.set(t.position.x, 0, t.position.z);
    } else {
      this.#ground.set(this.#from.x, 0, this.#from.z);
    }
    const e = new THREE.Euler().setFromQuaternion(this.#fromQuat, 'YXZ');
    this.#yaw = e.y;

    this.#spawnBody();

    // the orbit later circles the BODY, so it stays framed as the arena reveals
    this.#center.set(this.#ground.x, 0.4, this.#ground.z);

    // Pre-compute the (fixed) framing from the FULLY-reaching pose: an eye just
    // above/behind the prone head, looking forward-down at the outstretched hand.
    this.#poseArm(1); this.#poseHead(1);
    this.#joints.head.getWorldPosition(_head);
    this.#joints.handR.getWorldPosition(_hand);
    this.#look.copy(_hand);
    _fwd.copy(_hand).sub(_head); _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-4) _fwd.set(0, 0, 1);
    _fwd.normalize();                                  // horizontal head → hand
    this.#eye.copy(_head).addScaledVector(_fwd, -0.14); this.#eye.y += 0.14;
    // where the view ends up once the head has sunk to the dirt
    this.#groundEye.set(this.#eye.x, 0.16, this.#eye.z).addScaledVector(_fwd, 0.06);
    this.#groundLook.copy(this.#groundEye).addScaledVector(_fwd, 0.6); this.#groundLook.y = 0.0;
    this.#poseArm(0); this.#poseHead(1);

    if (Math.abs(this.#camera.fov - 62) > 0.01) { this.#camera.fov = 62; this.#camera.updateProjectionMatrix(); }
  }

  /** Build the survivor rig and lay it PRONE (face-down) on the death spot. */
  #spawnBody() {
    const build = selectedBuild();
    const rig = build ? build() : buildZombieRig(survivorLook());
    const J = rig.userData.joints;
    this.#joints = J;

    rig.rotation.x = Math.PI / 2; // face-down on the ground, body along +Z

    // legs lie straight out behind, feet splayed a touch
    J.thighL.rotation.set(0.0, 0, 0.08);
    J.thighR.rotation.set(0.0, 0, -0.08);
    J.kneeL.rotation.x = 0.12;
    J.kneeR.rotation.x = 0.08;
    // left arm lies slack along the ground beside the body
    J.shoulderL.rotation.set(0.55, 0.10, 0.18);
    J.elbowL.rotation.x = 0.35;
    // (right arm + head are driven by #poseArm / #poseHead)

    const body = new THREE.Group();
    body.position.set(this.#ground.x, 0.12, this.#ground.z); // resting on the floor
    body.rotation.y = this.#yaw;
    body.add(rig);
    body.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    // dedicated lighting so the survivor reads however dark the death spot is
    const key = new THREE.PointLight(0xffd7ac, 3.2, 9, 2.0);
    key.position.set(0.4, 1.6, 0.8); body.add(key);
    const rim = new THREE.PointLight(0x8fb6ff, 1.4, 9, 2.0);
    rim.position.set(-0.8, 1.0, -0.6); body.add(rim);

    this.#scene.add(body);
    body.updateMatrixWorld(true);
    this.#body = body;
  }

  /**
   * Right arm reaching out along the ground. reach: 0 (limp at the side) →
   * 1 (fully outstretched past the head). tremor (0..1) adds a fine strain shake.
   */
  #poseArm(reach, tremor = 0) {
    const J = this.#joints; if (!J) return;
    let jx = 0, je = 0;
    if (tremor > 0) {
      const t = this.#t;
      jx = (Math.sin(t * 33) * 0.03 + Math.sin(t * 51 + 1.1) * 0.02) * tremor;
      je = Math.sin(t * 44 + 2.0) * 0.04 * tremor;
    }
    J.shoulderR.rotation.x = lerp(-0.35, -1.48, reach) + jx;
    J.shoulderR.rotation.z = -0.06;
    J.elbowR.rotation.x = lerp(0.55, 0.10, reach) + je;
    this.#body.updateMatrixWorld(true);
  }

  /** Head: lift 1 = raised to look at the hand, lift 0 = dropped flat on the ground. */
  #poseHead(lift) {
    const J = this.#joints; if (!J) return;
    J.head.rotation.set(lerp(0.0, -0.62, lift), 0.08 * lift, 0.05 * lift);
    this.#body.updateMatrixWorld(true);
  }

  /** Aim the camera from pos at target (world-up); stash the result on the camera. */
  #aim(pos, target) {
    this.#camera.position.copy(pos);
    this.#dummy.position.copy(pos);
    this.#dummy.up.set(0, 1, 0);
    this.#dummy.lookAt(target);
    this.#camera.quaternion.copy(this.#dummy.quaternion);
  }

  #teardown() {
    if (!this.#body) return;
    this.#scene.remove(this.#body);
    this.#body.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x?.dispose?.()); else m?.dispose?.();
      }
    });
    this.#body = null;
    this.#joints = null;
  }

  lateUpdate(dt) {
    if (this.#gameState.current !== AppState.DEATHCAM) { this.#teardown(); return; }
    this.#t += dt;
    const t = this.#t;

    if (t < T_REACH) {
      // FALL — ease the view down from the live camera onto the prone eye while
      // the arm stretches out and the head lifts to watch the hand
      const u = easeOut(clamp01(t / FALL));
      this.#poseArm(u, u * 0.4);
      this.#poseHead(u);
      this.#aim(this.#eye, this.#look);
      this.#camera.position.lerpVectors(this.#from, this.#eye, u);
      this.#camera.quaternion.slerpQuaternions(this.#fromQuat, this.#camera.quaternion, u);
      this.#restPos.copy(this.#camera.position);
      this.#restQuat.copy(this.#camera.quaternion);
    } else if (t < T_DROP) {
      // REACH — the hand is held out, straining and trembling; camera dead steady
      this.#poseArm(1, 1);
      this.#poseHead(1);
      this.#aim(this.#eye, this.#look);
      this.#restPos.copy(this.#eye);
      this.#restQuat.copy(this.#camera.quaternion);
    } else if (t < T_PAN) {
      // DROP — the arm falls limp and the head sinks to the ground; the camera
      // settles down to the dirt with it (this is the "head-dying" beat)
      const g = easeInOut(clamp01((t - T_DROP) / DROP));
      this.#poseArm(1 - g);
      this.#poseHead(1 - g);
      _orbitPos.lerpVectors(this.#eye, this.#groundEye, g);        // reuse temp
      _head.lerpVectors(this.#look, this.#groundLook, g);
      this.#aim(_orbitPos, _head);
      this.#restPos.copy(_orbitPos);
      this.#restQuat.copy(this.#camera.quaternion);
    } else {
      // PAN — the death cam takes over: a slow wide orbit of the fallen body
      const panT = t - T_PAN;
      this.#poseArm(0);
      this.#poseHead(0);

      const u = easeInOut(clamp01(panT / PAN));
      const ang = this.#yaw + 0.4 + u * Math.PI * 1.35;
      const radius = lerp(4.5, 11.0, u);
      const height = lerp(1.4, 7.5, u);
      _orbitPos.set(this.#center.x + Math.cos(ang) * radius, height, this.#center.z + Math.sin(ang) * radius);

      this.#camera.position.copy(_orbitPos);
      this.#camera.up.set(0, 1, 0);
      this.#camera.lookAt(this.#center);
      this.#camera.rotateZ(Math.sin(panT * 0.5) * 0.02);
      _orbitQuat.copy(this.#camera.quaternion);

      if (panT < PAN_BLEND) {
        const k = easeInOut(panT / PAN_BLEND);
        this.#camera.position.lerpVectors(this.#restPos, _orbitPos, k);
        this.#camera.quaternion.slerpQuaternions(this.#restQuat, _orbitQuat, k);
      }

      if (t >= T_FADE && !this.#faded) { this.#faded = true; this.#events.emit('death:fade', {}); }
      if (t >= T_END) { this.#events.emit('death:finish', {}); }
    }
  }
}
