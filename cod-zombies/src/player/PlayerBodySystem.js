import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Transform, PlayerTag } from '../ecs/components/index.js';
import { Service } from '../core/ServiceLocator.js';
import { PlayerConfig } from '../config/index.js';
import { selectedBuild } from '../characters/selection.js';
import { fpBody } from './fpBodyState.js';

const _pos = new THREE.Vector3();
const _fwd = new THREE.Vector3();

const TORSO_LEAN = -0.42; // static recline so the chest stays out of the forward view
const THIGH_BASE = 0.0;   // legs near-vertical (standing); knees get a slight bend
// pull the whole body back off the camera so the chest isn't "inside the head"
const PULLBACK = 0.06;

/**
 * First-person BODY (Option A) — the player's own rig in the WORLD scene, but
 * TORSO + LEGS only: the arms + gun live in the viewmodel overlay pass (see
 * Viewmodel), camera-locked and drawn on top so they never clip the body, the
 * camera, or walls. This world body just gives you legs/torso to look down at
 * (and is the same rig remote players / theater will use). Head + arms hidden.
 * F6 toggles it; off by default.
 */
export class PlayerBodySystem extends System {
  #scene; #time; #gameState; #camera;
  #body = null; #built = false; #enabled = false;

  init() {
    this.#scene = this.world.services.get(Service.Scene).scene;
    this.#time = this.world.services.get(Service.Time);
    this.#gameState = this.world.services.get(Service.GameState);
    this.#camera = this.world.services.get(Service.Render).camera;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F6') { e.preventDefault(); e.stopPropagation(); this.#toggle(); }
    }, true);
    if (typeof window !== 'undefined') window.__pbody = this;
  }

  get isEnabled() { return this.#enabled; }

  #toggle() {
    this.#enabled = !this.#enabled;
    fpBody.enabled = this.#enabled; // Viewmodel shows the FP arms + keeps the gun
    if (this.#enabled && !this.#built) this.#build();
    if (this.#body) this.#body.visible = this.#enabled;
  }

  #build() {
    const build = selectedBuild();
    if (!build) return;
    let rig; try { rig = build(); } catch { return; }
    const J = rig.userData?.joints;
    if (J?.head) J.head.visible = false;          // the camera lives inside the head
    if (J?.shoulderL) J.shoulderL.visible = false; // arms live in the overlay pass
    if (J?.shoulderR) J.shoulderR.visible = false;
    this.#poseStance(J);
    rig.visible = this.#enabled;
    this.#scene.add(rig);
    this.#body = rig;
    this.#built = true;
  }

  /** Static recline + a slight bent-knee stance so the legs read naturally. */
  #poseStance(J) {
    if (!J) return;
    const set = (j, x = 0, y = 0, z = 0) => { if (j) j.rotation.set(x, y, z); };
    set(J.torso, TORSO_LEAN);
    set(J.thighL, THIGH_BASE, 0, 0.04); set(J.thighR, THIGH_BASE, 0, -0.04);
    set(J.kneeL, 0.3); set(J.kneeR, 0.3);
    set(J.footL, -0.13); set(J.footR, -0.13);
  }

  lateUpdate() {
    if (!this.#enabled || !this.#body) return;
    if (!this.#gameState.isPlaying || this.world.first(PlayerTag, Transform) === undefined) {
      this.#body.visible = false;
      return;
    }
    const id = this.world.first(PlayerTag, Transform);
    const tag = this.world.get(id, PlayerTag);
    const t = this.world.get(id, Transform);
    this.#body.visible = true;

    // stand the rig on the ground under the interpolated capsule, pulled back off
    // the camera; face the aim
    _pos.lerpVectors(t.previousPosition, t.position, this.#time.alpha);
    const feetY = _pos.y - (tag.halfHeight + PlayerConfig.capsuleRadius);
    _fwd.set(0, 0, -1).applyQuaternion(this.#camera.quaternion); _fwd.y = 0; _fwd.normalize();
    this.#body.position.set(_pos.x - _fwd.x * PULLBACK, feetY, _pos.z - _fwd.z * PULLBACK);
    this.#body.rotation.y = tag.yaw + Math.PI; // rig faces +z; player forward is -z
    const J = this.#body.userData?.joints;
    if (J?.head) J.head.visible = false;
    if (J?.torso) J.torso.rotation.x = TORSO_LEAN;
  }
}
