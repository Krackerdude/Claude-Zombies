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
const _hq = new THREE.Quaternion();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _camPos = new THREE.Vector3();
const _camQuat = new THREE.Quaternion();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3();
const _headUp = new THREE.Vector3();

// Timeline (seconds). First-person reach → desperate shaking struggle that
// weakens and gives up → slow orbit of the body → fade.
const FALL = 1.5;
const DESPERATE = 2.8;
const PAN = 10.0;
const FADE = 1.4;
const T_DESP = FALL;             // 1.5  — struggle begins
const T_PAN = FALL + DESPERATE;  // 4.3  — arm has dropped, pull out to orbit
const T_FADE = T_PAN + PAN;      // 14.3
const T_END = T_FADE + FADE;     // 15.7
const DESP_GRASP = 1.5;          // how long the desperate grasping lasts before the give-up
const PAN_BLEND = 1.3;           // ease from the collapsed pose into the orbit

const lerp = THREE.MathUtils.lerp;
const clamp01 = (t) => THREE.MathUtils.clamp(t, 0, 1);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The death cinematic. When the run ends (RoundSystem emits `death:begin` and
 * flips the app state to DEATHCAM) this system takes sole ownership of the
 * gameplay camera AND spawns the actual survivor — the same rigged character
 * from the menu — as a body collapsing on the arena floor:
 *
 *   FALL      – the first-person view drops into the survivor's eye and gazes
 *               UP the arm reaching toward the sky (rolling with the head).
 *   DESPERATE – the hand strains and shakes in fading grasping lunges, then the
 *               arm weakens and drops as the survivor gives up and lets go.
 *   PAN       – the camera pulls out into a slow, wide orbit of the arena,
 *               revealing the fallen body below (~10s).
 *   FADE   – it emits `death:fade` so the UI blacks out, then `death:finish` —
 *            RoundSystem resets the field and returns to the main menu.
 *
 * A Skip button can short-circuit to `death:finish`; the moment the state
 * leaves DEATHCAM the body is torn down and the system goes dormant.
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
  #collapsePos = new THREE.Vector3();
  #collapseQuat = new THREE.Quaternion();
  #ground = new THREE.Vector3();
  #center = new THREE.Vector3(0, 1.4, 0);
  #yaw = 0;
  #dir = 1;
  #dummy = new THREE.Object3D();
  #headBase = new THREE.Euler();           // the head bone's resting rotation
  #eye = new THREE.Vector3();              // the fixed first-person eye by the head

  #body = null;   // the fallen survivor (outer group)
  #joints = null; // its rig joints

  init() {
    this.#gameState = this.world.services.get(Service.GameState);
    this.#camera = this.world.services.get(Service.Render).camera;
    this.#events = this.world.services.get(Service.Events);
    this.#scene = this.world.services.get(Service.Scene).scene;
    this.#events.on('death:begin', () => this.#start());
  }

  /** Capture the death pose, spawn the fallen survivor, and set up the shot. */
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
    this.#dummy.quaternion.copy(this.#fromQuat);
    const e = new THREE.Euler().setFromQuaternion(this.#fromQuat, 'YXZ');
    this.#yaw = e.y;
    this.#dir = 1;

    this.#spawnBody();

    // the orbit later circles the BODY (not the map origin), so the fallen
    // survivor stays framed while the arena reveals around them
    this.#center.set(this.#ground.x, 0.5, this.#ground.z);

    // remember the head's resting pose so the desperate struggle can add tremor
    // deltas on top of it (the camera is locked to the head, so this shakes the view)
    this.#headBase.copy(this.#joints.head.rotation);

    // Fix the first-person eye just above the crown — clear of the skull, with
    // the forehead below/out of frame — so the camera gazes up-and-out at the
    // reaching hand. Each frame it looks from here at the (moving) hand, so you
    // watch your own arm strain, grasp and fall, the frame rolling with the head.
    // eye just above and a touch behind the head, so it looks up-and-out over the
    // chest at the reaching hand (arm framed cleanly, not jammed against the lens)
    this.#poseArm(1);
    this.#joints.head.getWorldPosition(_head);
    this.#joints.handR.getWorldPosition(_hand);
    _dir.copy(_head).sub(_hand); _dir.y = 0; _dir.normalize(); // horizontal: hand → behind head
    this.#eye.copy(_head).addScaledVector(_worldUp, 0.15).addScaledVector(_dir, 0.16);
    this.#poseArm(0);

    if (Math.abs(this.#camera.fov - 60) > 0.01) { this.#camera.fov = 60; this.#camera.updateProjectionMatrix(); }
  }

  /** Build the survivor rig, lay it on its back at the death spot, one arm up. */
  #spawnBody() {
    const build = selectedBuild();
    const rig = build ? build() : buildZombieRig(survivorLook());
    const J = rig.userData.joints;
    this.#joints = J;

    // Slumped bleedout: fallen onto the back but the torso + head PROP UP off the
    // ground (not flat), so the first-person eye rides high enough to see the arm
    // reaching out against the scene instead of being buried in the floor.
    rig.rotation.x = -0.72;           // reclined back, head raised
    // legs fold forward and rest on the ground in front of the propped torso
    J.thighL.rotation.set(1.15, 0, 0.12);
    J.thighR.rotation.set(1.15, 0, -0.12);
    J.kneeL.rotation.x = 0.95;
    J.kneeR.rotation.x = 1.05;
    // right arm reaches up-and-out toward the sky
    J.shoulderR.rotation.set(-0.85, -0.12, -0.10);
    J.elbowR.rotation.x = 0.4;
    // left arm hangs slack across the body
    J.shoulderL.rotation.set(0.30, 0.22, 0.20);
    J.elbowL.rotation.x = 0.55;
    // head tips back and lolls slightly
    J.head.rotation.set(-0.10, 0.28, 0.06);

    const body = new THREE.Group();
    body.position.set(this.#ground.x, 0.66, this.#ground.z);
    body.rotation.y = this.#yaw;
    body.add(rig);
    body.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    // dedicated lighting so the survivor reads no matter how dark the death spot
    // is — a warm key up by the reaching hand, a cool rim across the body
    const key = new THREE.PointLight(0xffd7ac, 3.4, 9, 2.0);
    key.position.set(0.5, 2.1, 0.6); body.add(key);
    const rim = new THREE.PointLight(0x8fb6ff, 1.5, 9, 2.0);
    rim.position.set(-0.9, 1.0, -0.7); body.add(rim);

    this.#scene.add(body);
    body.updateMatrixWorld(true);
    this.#body = body;
  }

  /**
   * Drive the reaching right arm. reach: 0 (slack) → 1 (fully outstretched).
   * tremor (0..1) adds a desperate, high-frequency shake to the shoulder/elbow
   * so a straining reach visibly trembles.
   */
  #poseArm(reach, tremor = 0) {
    const J = this.#joints; if (!J) return;
    let jx = 0, jz = 0, je = 0;
    if (tremor > 0) {
      const t = this.#t;
      jx = (Math.sin(t * 41) * 0.045 + Math.sin(t * 67 + 1.1) * 0.028) * tremor;
      jz = Math.sin(t * 53 + 0.6) * 0.05 * tremor;
      je = Math.sin(t * 59 + 2.2) * 0.06 * tremor;
    }
    J.shoulderR.rotation.x = lerp(-0.85, -1.62, reach) + jx;
    J.shoulderR.rotation.z = -0.10 + jz;
    J.elbowR.rotation.x = lerp(0.42, 0.06, reach) + je;
    this.#body.updateMatrixWorld(true);
  }

  /** Drive the head bone: base pose + a trembling strain and a final loll. */
  #poseHead(tremor, loll) {
    const J = this.#joints; if (!J) return;
    const t = this.#t;
    const tx = tremor ? Math.sin(t * 34) * 0.03 * tremor : 0;
    const tz = tremor ? Math.sin(t * 45 + 0.9) * 0.035 * tremor : 0;
    J.head.rotation.set(
      this.#headBase.x + tx - loll * 0.10,
      this.#headBase.y,
      this.#headBase.z + tz + loll * 0.45,
    );
  }

  /** First-person eye pose: sit at the fixed eye and gaze at the (moving) hand,
   *  taking the roll from the head bone so the frame tilts/rolls with the head. */
  #headCamPose(outPos, outQuat) {
    const J = this.#joints; if (!J) return;
    J.head.updateWorldMatrix(true, false);
    J.head.getWorldQuaternion(_hq);
    J.handR.getWorldPosition(_hand);
    outPos.copy(this.#eye);
    // up = world-up rolled toward the head's own up (kept world-dominant so a
    // near-vertical gaze up the arm never gimbals)
    _headUp.set(0, 1, 0).applyQuaternion(_hq);
    _up.set(0, 1, 0).addScaledVector(_headUp, 0.6).normalize();
    this.#dummy.position.copy(outPos);
    this.#dummy.up.copy(_up);
    this.#dummy.lookAt(_hand);
    outQuat.copy(this.#dummy.quaternion);
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

    if (t < T_DESP) {
      // FALL — the live gameplay view drops/tips into the head bone as the body
      // collapses onto its back; the arm shoots up into view, already trembling
      const u = easeOut(clamp01(t / FALL));
      this.#poseHead(u * 0.6, 0);
      this.#poseArm(u, u * 0.7);
      this.#headCamPose(_camPos, _camQuat);
      this.#camera.position.lerpVectors(this.#from, _camPos, u);
      this.#camera.quaternion.slerpQuaternions(this.#fromQuat, _camQuat, u);
      this.#collapsePos.copy(this.#camera.position);
      this.#collapseQuat.copy(this.#camera.quaternion);
    } else if (t < T_PAN) {
      const b = t - T_DESP;
      if (b < DESP_GRASP) {
        // STRUGGLE — a desperate, shaking, grasping reach: the hand strains in
        // fading lunges. The camera is LOCKED to the head, so the view trembles
        // with the strain and you watch your own hand grasp at the air.
        const lunge = Math.pow(Math.max(0, Math.sin(b * 4.4)), 1.5);
        this.#poseHead(1, 0);
        this.#poseArm(0.84 + 0.16 * lunge, 1);
      } else {
        // GIVE UP — the arm weakens and drops out of view; the head lolls to the
        // side as the survivor lets go (the first-person view rolls with it)
        const g = easeInOut(clamp01((b - DESP_GRASP) / (DESPERATE - DESP_GRASP)));
        this.#poseHead((1 - g) * 0.5, g);
        this.#poseArm(0.84 * (1 - g), (1 - g) * 0.6);
      }
      this.#headCamPose(_camPos, _camQuat);
      this.#camera.position.copy(_camPos);
      this.#camera.quaternion.copy(_camQuat);
      this.#collapsePos.copy(_camPos);
      this.#collapseQuat.copy(_camQuat);
    } else {
      // PAN — the arm lies still; the camera pulls out into a slow orbit
      const panT = t - T_PAN;
      this.#poseArm(0);

      const u = easeInOut(clamp01(panT / PAN));
      const ang = this.#yaw + this.#dir * (0.4 + u * Math.PI * 1.35);
      const radius = lerp(4.5, 11.0, u);
      const height = lerp(1.6, 7.5, u);
      _orbitPos.set(this.#center.x + Math.cos(ang) * radius, height, this.#center.z + Math.sin(ang) * radius);

      this.#camera.position.copy(_orbitPos);
      this.#camera.up.set(0, 1, 0);
      this.#camera.lookAt(this.#center);
      this.#camera.rotateZ(Math.sin(panT * 0.5) * 0.02);
      _orbitQuat.copy(this.#camera.quaternion);

      // ease OUT of the collapsed pose into the orbit for the first beat
      if (panT < PAN_BLEND) {
        const k = easeInOut(panT / PAN_BLEND);
        this.#camera.position.lerpVectors(this.#collapsePos, _orbitPos, k);
        this.#camera.quaternion.slerpQuaternions(this.#collapseQuat, _orbitQuat, k);
      }

      if (t >= T_FADE && !this.#faded) { this.#faded = true; this.#events.emit('death:fade', {}); }
      if (t >= T_END) { this.#events.emit('death:finish', {}); }
    }
  }
}
