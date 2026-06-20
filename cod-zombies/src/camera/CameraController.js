import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Transform, PlayerTag } from '../ecs/components/index.js';
import { Service } from '../core/ServiceLocator.js';
import { PlayerConfig, RenderConfig, Stance } from '../config/index.js';
import { MoveState } from '../player/MoveState.js';

const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _pos = new THREE.Vector3();

function damp(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/**
 * First-person camera while playing; a slow brooding drift while in menus.
 *
 * Reads movement state and settings (sensitivity, invert-Y) but never writes
 * movement. All "game feel" lives here and is cosmetic: stance eye-easing,
 * impact-scaled landing dip, sprint/slide FOV kick, subtle slide roll. Position
 * is interpolated with the loop alpha for smoothness above the tick rate.
 */
export class CameraController extends System {
  #camera;
  #input;
  #time;
  #gameState;
  #settings;

  #eye = PlayerConfig.eyeHeight;
  #dip = 0;
  #fov = RenderConfig.fov;
  #roll = 0;
  #bob = 0;
  #dmgRoll = 0;
  #dmgPitch = 0;
  #events;
  #menuT = 0;

  init() {
    this.#camera = this.world.services.get(Service.Render).camera;
    this.#input = this.world.services.get(Service.Input);
    this.#time = this.world.services.get(Service.Time);
    this.#gameState = this.world.services.get(Service.GameState);
    this.#settings = this.world.services.get(Service.Settings);
    this.#fov = RenderConfig.fov;
    this.#events = this.world.services.get(Service.Events);
    this.#events.on('player:damaged', ({ x, z }) => {
      _pos.set(1, 0, 0).applyQuaternion(this.#camera.quaternion); // camera right
      const side = Math.sign(x * _pos.x + z * _pos.z) || 1;
      this.#dmgRoll = -side * 0.08; // lurch away from the blow
      this.#dmgPitch = 0.06;        // and snap up
    });
  }

  update(_dt) {
    if (!this.#gameState.isPlaying || !this.#input.pointerLocked) return;
    const id = this.world.first(PlayerTag);
    if (id === undefined) return;
    const tag = this.world.get(id, PlayerTag);

    const c = this.#settings.controls;
    const sens = PlayerConfig.mouseSensitivity * c.sensitivity;
    tag.yaw -= this.#input.mouseDX * sens;
    tag.pitch -= this.#input.mouseDY * sens * (c.invertY ? -1 : 1);
    tag.pitch = THREE.MathUtils.clamp(tag.pitch, -PlayerConfig.maxPitch, PlayerConfig.maxPitch);
  }

  lateUpdate(dt) {
    if (!this.#gameState.isPlaying) {
      this.#menuDrift(dt);
      return;
    }

    const id = this.world.first(PlayerTag, Transform);
    if (id === undefined) return;
    const tag = this.world.get(id, PlayerTag);
    const t = this.world.get(id, Transform);

    const eyeTarget = (Stance[tag.stance] ?? Stance.stand).eye;
    const eyeRate = tag.getUpT > 0 ? PlayerConfig.eyeLerpRate * 0.45 : PlayerConfig.eyeLerpRate;
    this.#eye = damp(this.#eye, eyeTarget, eyeRate, dt);

    if (tag.grounded && !tag.wasGrounded && tag.landImpact > 2.5) {
      this.#dip = Math.min(tag.landImpact * PlayerConfig.landingDipScale, 0.45);
    }
    this.#dip = damp(this.#dip, 0, PlayerConfig.landingDipRecover, dt);

    _pos.lerpVectors(t.previousPosition, t.position, this.#time.alpha);
    const feetY = _pos.y - (tag.halfHeight + PlayerConfig.capsuleRadius);
    _pos.y = feetY + this.#eye - this.#dip;

    const speed = Math.hypot(tag.velocity.x, tag.velocity.z);
    let fovTarget = RenderConfig.fov;
    if (tag.aiming && tag.adsFov > 0) {
      fovTarget = tag.adsFov; // zoom; no sprint/slide kick while aiming
    } else if (tag.state === MoveState.SLIDE || tag.state === MoveState.DIVE) {
      fovTarget += PlayerConfig.slideFovKick;
    } else if (tag.state === MoveState.SPRINT) {
      fovTarget += PlayerConfig.sprintFovKick;
    }

    // subtle camera bob with footfalls — grounded, less than the weapon bob,
    // and skipped while sliding/airborne (it isn't footsteps)
    const footing = tag.grounded && tag.state !== MoveState.SLIDE && tag.state !== MoveState.DIVE;
    this.#bob += dt * (footing ? speed : 0) * 1.5;
    const amp = Math.min(1, speed / 6) * (footing ? 1 : 0);
    _pos.y += Math.abs(Math.sin(this.#bob)) * 0.022 * amp;
    _pos.x += Math.cos(this.#bob) * 0.012 * amp;
    this.#camera.position.copy(_pos);
    // snap-zoom a touch faster than it relaxes, so ADS feels responsive
    const fovRate = tag.aiming ? PlayerConfig.fovLerpRate * 1.8 : PlayerConfig.fovLerpRate;
    this.#fov = damp(this.#fov, fovTarget, fovRate, dt);
    if (Math.abs(this.#camera.fov - this.#fov) > 0.01) {
      this.#camera.fov = this.#fov;
      this.#camera.updateProjectionMatrix();
    }

    const rollTarget = tag.state === MoveState.SLIDE ? 0.05 : 0;
    this.#roll = damp(this.#roll, rollTarget, 8, dt);

    // weapon recoil: transient offset added to the view, recovers to zero
    tag.recoilPitch = damp(tag.recoilPitch, 0, 9, dt);
    tag.recoilYaw = damp(tag.recoilYaw, 0, 7, dt);
    // damage kick: a quick tilt/jolt away from a hit that eases back out
    this.#dmgRoll = damp(this.#dmgRoll, 0, 8, dt);
    this.#dmgPitch = damp(this.#dmgPitch, 0, 8, dt);

    _euler.set(tag.pitch + tag.recoilPitch + this.#dmgPitch + (tag.viewLeanPitch || 0), tag.yaw + tag.recoilYaw, this.#roll + this.#dmgRoll + (tag.viewLeanRoll || 0));
    this.#camera.quaternion.setFromEuler(_euler);
  }

  /** Slow, uneasy orbit + bob around the arena for the main menu backdrop. */
  #menuDrift(dt) {
    this.#menuT += dt;
    const t = this.#menuT;
    const radius = 17;
    const cx = Math.sin(t * 0.06) * radius;
    const cz = Math.cos(t * 0.06) * radius;
    const cy = 6.0 + Math.sin(t * 0.23) * 0.6;
    this.#camera.position.set(cx, cy, cz);
    this.#camera.lookAt(0, 1.4 + Math.sin(t * 0.17) * 0.2, 0);
    // a touch of camera shake-ish dutch tilt
    this.#camera.rotateZ(Math.sin(t * 0.31) * 0.012);

    if (Math.abs(this.#camera.fov - RenderConfig.fov) > 0.01) {
      this.#camera.fov = RenderConfig.fov;
      this.#camera.updateProjectionMatrix();
    }
  }
}
