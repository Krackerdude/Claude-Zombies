import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Transform, PlayerTag } from '../ecs/components/index.js';
import { Service } from '../core/ServiceLocator.js';
import { AppState } from '../core/GameState.js';
import { buildZombieRig } from '../scenes/zombieRig.js';
import { survivorLook } from '../scenes/MenuScene.js';

const _orbitPos = new THREE.Vector3();
const _orbitQuat = new THREE.Quaternion();
const _lookQuat = new THREE.Quaternion();
const _hand = new THREE.Vector3();
const _head = new THREE.Vector3();

// Timeline (seconds). Reach + fall → linger on the body → slow orbit → fade.
const FALL = 1.6;
const LINGER = 2.0;
const PAN = 10.0;
const FADE = 1.4;
const T_LINGER = FALL;            // 1.6
const T_PAN = FALL + LINGER;      // 3.6
const T_FADE = T_PAN + PAN;       // 13.6
const T_END = T_FADE + FADE;      // 15.0
const PAN_BLEND = 1.2;            // ease from the collapsed pose into the orbit

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
 *   FALL   – the survivor's own arm reaches up toward the sky as the first-
 *            person view drops and tips back to gaze along that reaching hand.
 *   LINGER – it holds on the outstretched hand for a beat (~2s) as the arm
 *            begins to weaken.
 *   PAN    – the arm falls and the camera pulls out into a slow, wide orbit of
 *            the arena, revealing the fallen body below (~10s).
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

    // collapse the camera to just beyond the crown of the head, gazing back
    // over the face + up the reaching arm (first-person, looking at your hand)
    this.#joints.head.getWorldPosition(_head);
    const dx = _head.x - this.#body.position.x, dz = _head.z - this.#body.position.z;
    const inv = 1 / (Math.hypot(dx, dz) || 1);
    this.#collapsePos.set(_head.x + dx * inv * 0.28, _head.y + 0.26, _head.z + dz * inv * 0.28);

    if (Math.abs(this.#camera.fov - 60) > 0.01) { this.#camera.fov = 60; this.#camera.updateProjectionMatrix(); }
  }

  /** Build the survivor rig, lay it on its back at the death spot, one arm up. */
  #spawnBody() {
    const rig = buildZombieRig(survivorLook());
    const J = rig.userData.joints;
    this.#joints = J;

    rig.rotation.x = -Math.PI / 2; // lie flat on the back, face to the sky

    // right arm reaches straight up (local "forward" = world up while supine)
    J.shoulderR.rotation.set(-0.85, -0.12, -0.10);
    J.elbowR.rotation.x = 0.4;
    // left arm rests along the ground beside the body
    J.shoulderL.rotation.set(-0.12, 0.22, 0.16);
    J.elbowL.rotation.x = 0.25;
    // legs splay a touch
    J.thighL.rotation.set(0.02, 0, 0.10);
    J.thighR.rotation.set(0.02, 0, -0.10);
    J.kneeL.rotation.x = 0.16;
    J.kneeR.rotation.x = 0.10;
    // head lolls to one side
    J.head.rotation.set(0, 0.32, 0.05);

    const body = new THREE.Group();
    body.position.set(this.#ground.x, 0.22, this.#ground.z);
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

  /** Drive the reaching right arm. reach: 0 (slack) → 1 (fully outstretched). */
  #poseArm(reach) {
    const J = this.#joints; if (!J) return;
    J.shoulderR.rotation.x = lerp(-0.85, -1.62, reach);
    J.elbowR.rotation.x = lerp(0.42, 0.06, reach);
    this.#body.updateMatrixWorld(true);
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

  /** Point the camera at a world target without disturbing anything else. */
  #lookAt(target) {
    this.#dummy.position.copy(this.#camera.position);
    this.#dummy.up.set(0, 1, 0);
    this.#dummy.lookAt(target);
    return this.#dummy.quaternion;
  }

  lateUpdate(dt) {
    if (this.#gameState.current !== AppState.DEATHCAM) { this.#teardown(); return; }
    this.#t += dt;
    const t = this.#t;

    if (t < T_LINGER) {
      // FALL — the arm reaches up; the view drops + tips to look along it
      const u = easeOut(clamp01(t / FALL));
      this.#poseArm(u);
      this.#joints.handR.getWorldPosition(_hand);
      this.#camera.position.lerpVectors(this.#from, this.#collapsePos, u);
      _lookQuat.copy(this.#lookAt(_hand));
      this.#camera.quaternion.slerpQuaternions(this.#fromQuat, _lookQuat, u);
      this.#collapseQuat.copy(this.#camera.quaternion);
    } else if (t < T_PAN) {
      // LINGER — hold on the outstretched hand as the arm slowly weakens
      const b = t - T_LINGER;
      this.#poseArm(1 - easeInOut(clamp01(b / LINGER)) * 0.18);
      this.#joints.handR.getWorldPosition(_hand);
      this.#camera.position.copy(this.#collapsePos);
      this.#camera.position.y += Math.sin(b * 1.5) * 0.01;
      this.#camera.quaternion.copy(this.#lookAt(_hand));
      this.#collapseQuat.copy(this.#camera.quaternion);
    } else {
      // PAN — the arm falls; the camera pulls out into a slow orbit
      const panT = t - T_PAN;
      const armFall = clamp01(panT / 2.2);
      this.#poseArm(0.82 - easeInOut(armFall) * 0.72);

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
