import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Transform, PlayerTag } from '../ecs/components/index.js';
import { Service } from '../core/ServiceLocator.js';
import { AppState } from '../core/GameState.js';

const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _orbitPos = new THREE.Vector3();
const _orbitQuat = new THREE.Quaternion();
const _tmp = new THREE.Vector3();

// Timeline (seconds). Fall → linger on the body → slow orbit of the map → fade.
const FALL = 1.2;
const LINGER = 2.0;
const PAN = 10.0;
const FADE = 1.4;
const T_LINGER = FALL;            // 1.2
const T_PAN = FALL + LINGER;      // 3.2
const T_FADE = T_PAN + PAN;       // 13.2
const T_END = T_FADE + FADE;      // 14.6
const PAN_BLEND = 1.1;            // ease from the collapsed pose into the orbit

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The death cinematic. When the run ends (RoundSystem emits `death:begin` and
 * flips the app state to DEATHCAM) this system takes sole ownership of the
 * gameplay camera and runs a scripted, pre-determined sequence:
 *
 *   FALL   – the view drops to the floor and rolls onto its side, as if the
 *            survivor collapsed and their outstretched hand hit the ground.
 *   LINGER – it holds on the body for a beat (~2s), breathing faintly.
 *   PAN    – a slow, wide orbit of the arena that pulls out and rises (~10s).
 *   FADE   – it emits `death:fade` so the UI blacks out, keeps drifting, then
 *            emits `death:finish` — RoundSystem resets the field and returns to
 *            the main menu.
 *
 * The whole thing can be short-circuited by the Skip button, which emits
 * `death:finish` directly; the moment the state leaves DEATHCAM this system
 * goes dormant again.
 */
export class DeathCamSystem extends System {
  #gameState;
  #camera;
  #events;

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

  init() {
    this.#gameState = this.world.services.get(Service.GameState);
    this.#camera = this.world.services.get(Service.Render).camera;
    this.#events = this.world.services.get(Service.Events);
    this.#events.on('death:begin', () => this.#start());
  }

  /** Capture the death pose + compute the collapsed target the instant we die. */
  #start() {
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
    _euler.setFromQuaternion(this.#fromQuat, 'YXZ');
    this.#yaw = _euler.y;
    // roll toward whichever side keeps the fall reading on-screen
    this.#dir = Math.sin(this.#yaw) >= 0 ? 1 : -1;

    // collapsed pose: head near the floor, tipped onto its side, gazing up the arm
    _tmp.set(Math.sin(this.#yaw) * 0.25, 0, Math.cos(this.#yaw) * -0.25); // slight forward slump
    this.#collapsePos.copy(this.#ground).add(_tmp);
    this.#collapsePos.y = 0.34;
    _euler.set(0.32, this.#yaw + this.#dir * 0.18, this.#dir * 1.08, 'YXZ');
    this.#collapseQuat.setFromEuler(_euler);

    // cinematic FOV, clear of any lingering ADS zoom
    if (Math.abs(this.#camera.fov - 58) > 0.01) { this.#camera.fov = 58; this.#camera.updateProjectionMatrix(); }
  }

  lateUpdate(dt) {
    if (this.#gameState.current !== AppState.DEATHCAM) return;
    this.#t += dt;
    const t = this.#t;

    if (t < T_LINGER) {
      // FALL — collapse to the floor
      const u = easeOut(THREE.MathUtils.clamp(t / FALL, 0, 1));
      this.#camera.position.lerpVectors(this.#from, this.#collapsePos, u);
      this.#camera.quaternion.slerpQuaternions(this.#fromQuat, this.#collapseQuat, u);
    } else if (t < T_PAN) {
      // LINGER — hold on the body with a faint breath
      const b = (t - T_LINGER);
      this.#camera.position.copy(this.#collapsePos);
      this.#camera.position.y += Math.sin(b * 1.6) * 0.012;
      this.#camera.quaternion.copy(this.#collapseQuat);
    } else {
      // PAN — slow wide orbit of the arena, pulling out + rising
      const panT = t - T_PAN;
      const u = easeInOut(THREE.MathUtils.clamp(panT / PAN, 0, 1));
      const a0 = Math.atan2(this.#ground.z, this.#ground.x);
      const ang = a0 + this.#dir * u * (Math.PI * 1.25);
      const radius = THREE.MathUtils.lerp(6.5, 16.5, u);
      const height = THREE.MathUtils.lerp(2.2, 8.5, u);
      _orbitPos.set(Math.cos(ang) * radius, height, Math.sin(ang) * radius);

      // face the arena, with a whisper of dutch tilt
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

      // hand the UI its fade cue, then close it out
      if (t >= T_FADE && !this.#faded) { this.#faded = true; this.#events.emit('death:fade', {}); }
      if (t >= T_END) { this.#events.emit('death:finish', {}); }
    }
  }
}
