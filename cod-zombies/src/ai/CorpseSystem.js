import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { CorpseTag, Transform, Renderable } from '../ecs/components/index.js';
import { Service } from '../core/ServiceLocator.js';

const GRAV = 18;
const LIFETIME = 10; // seconds upright on the ground before it sinks away
const SINK_TIME = 1.8;
const UP = new THREE.Vector3(0, 1, 0);
const _qYaw = new THREE.Quaternion();
const _qTilt = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _wp = new THREE.Vector3();
const _wp2 = new THREE.Vector3();
const FLOOR_Y = 0.05;

/**
 * Animates dead zombies as ragdolling corpses: a ballistic tumble launched in
 * the killing bullet's direction, limbs going limp, the body tipping over to lie
 * on the floor, and finally sinking + shrinking away after ~10s. No physics
 * body is involved, so corpses never collide with the player or the horde.
 */
export class CorpseSystem extends System {
  #events;

  init() {
    this.#events = this.world.services.get(Service.Events);
    // clear bodies when the run ends so they don't linger into the next one
    // (only on return to menu — pause + scoreboard keep the frozen scene intact)
    this.#events.on('state:change', ({ state }) => { if (state === 'menu') this.#clear(); });
  }

  #clear() { for (const id of [...this.world.query(CorpseTag)]) this.world.destroyEntity(id); }

  fixedUpdate(dt) {
    for (const id of this.world.query(CorpseTag, Transform, Renderable)) {
      const c = this.world.get(id, CorpseTag);
      const t = this.world.get(id, Transform);
      const rig = this.world.get(id, Renderable).object3d;
      t.cachePrevious();
      c.life += dt;

      // ballistic launch -> ground settle
      if (!c.grounded) {
        c.vy -= GRAV * dt;
        t.position.x += c.vx * dt;
        t.position.y += c.vy * dt;
        t.position.z += c.vz * dt;
        if (t.position.y <= 0) { t.position.y = 0; c.grounded = true; c.vx *= 0.35; c.vz *= 0.35; }
      } else {
        const f = Math.pow(0.0008, dt); // heavy ground friction
        c.vx *= f; c.vz *= f;
        t.position.x += c.vx * dt;
        t.position.z += c.vz * dt;
      }

      c.fall = Math.min(1, c.fall + dt * (c.grounded ? 5 : 2.2));
      c.limp = Math.min(1, c.limp + dt * 4);

      // orientation: KEEP the zombie's facing (no snap), tip over in the push
      // direction by rotating about a world horizontal axis perpendicular to it
      _qYaw.setFromAxisAngle(UP, c.baseYaw);
      _axis.set(c.tiltX, 0, c.tiltZ);
      _qTilt.setFromAxisAngle(_axis, c.fall * (Math.PI / 2 - 0.05));
      t.quaternion.copy(_qTilt).multiply(_qYaw);

      // limbs go limp; then keep them resting on the floor
      this.#ragdoll(rig, c, dt);
      this.#floorClamp(rig, t, c);

      // sink + shrink away, then remove
      if (c.life > LIFETIME) {
        t.position.y -= 0.7 * dt;
        rig.scale.multiplyScalar(Math.pow(0.3, dt));
        if (c.life > LIFETIME + SINK_TIME) this.world.destroyEntity(id);
      }
    }
  }

  /**
   * Keep limbs out of the floor. After posing, we sync the rig to the corpse
   * transform, then for each end-effector that has sunk below the ground we
   * solve a single Newton step on its controlling joint (numerical gradient) to
   * raise it back to the surface — so hands/feet/head rest ON the floor instead
   * of clipping through it.
   */
  #floorClamp(rig, t, c) {
    const J = rig.userData?.joints;
    if (!J || !c.j) return;
    rig.position.copy(t.position);
    rig.quaternion.copy(t.quaternion);
    rig.updateMatrixWorld(true);

    const fix = (eff, joint, axis, state, min, max) => {
      for (let iter = 0; iter < 2; iter++) {
        eff.getWorldPosition(_wp);
        const pen = FLOOR_Y - _wp.y;
        if (pen <= 0.005) return; // resting on / above the floor
        const a0 = joint.rotation[axis];
        joint.rotation[axis] = a0 + 0.08; // probe how the effector height responds
        rig.updateMatrixWorld(true);
        eff.getWorldPosition(_wp2);
        const dyda = (_wp2.y - _wp.y) / 0.08;
        joint.rotation[axis] = a0;
        if (Math.abs(dyda) < 1e-3) { rig.updateMatrixWorld(true); return; }
        // ease toward the surface, capped so a tiny gradient can't fling the limb up
        let delta = pen / dyda;
        const MAX = 0.3;
        if (delta > MAX) delta = MAX; else if (delta < -MAX) delta = -MAX;
        joint.rotation[axis] = Math.min(max, Math.max(min, a0 + delta));
        if (state) state.v = 0; // stop the pendulum pushing it back through
        rig.updateMatrixWorld(true);
      }
    };

    // hands raised via the shoulders, feet via the hips, head via the neck
    fix(J.handL, J.shoulderL, 'x', c.j.shLx, -2.7, 0.7);
    fix(J.handR, J.shoulderR, 'x', c.j.shRx, -2.7, 0.7);
    fix(J.footL, J.thighL, 'x', c.j.thLx, -1.3, 1.6);
    fix(J.footR, J.thighR, 'x', c.j.thRx, -1.3, 1.6);
    fix(J.head, J.head, 'x', c.j.head, -0.4, 0.9);
  }

  /**
   * Procedural ragdoll. On death the limbs go limp: each joint is a
   * near-critically-damped spring that relaxes toward a slack resting pose
   * (arms hanging at the sides, legs drooping, head lolling) — relative to the
   * body, so the body's own tip-over carries them and they never point up. A
   * small per-limb kick + per-corpse bias keeps corpses from settling
   * identically. Hard limits double as crude self-collision; the floor clamp
   * (run after this) keeps anything that droops below ground resting on it.
   */
  #ragdoll(rig, c, dt) {
    const J = rig.userData?.joints;
    if (!J) return;

    // lazily seed per-joint state from the live death pose (continuous, no snap)
    if (!c.j) {
      // death throes: whip every limb hard, scaled by the killing impulse, with
      // big per-limb randomness so each corpse convulses differently
      const imp = Math.min(3, Math.hypot(c.vx, c.vy, c.vz));
      const kick = () => (Math.random() * 2 - 1) * (7 + imp * 3.5); // ±(7..17) rad/s
      const seed = (jt, ax) => ({ a: jt.rotation[ax], v: kick() });
      c.j = {
        shLx: seed(J.shoulderL, 'x'), shRx: seed(J.shoulderR, 'x'),
        shLz: seed(J.shoulderL, 'z'), shRz: seed(J.shoulderR, 'z'),
        elL: seed(J.elbowL, 'x'), elR: seed(J.elbowR, 'x'),
        thLx: seed(J.thighL, 'x'), thRx: seed(J.thighR, 'x'),
        thLz: seed(J.thighL, 'z'), thRz: seed(J.thighR, 'z'),
        knL: seed(J.kneeL, 'x'), knR: seed(J.kneeR, 'x'),
        torso: seed(J.torso, 'x'), head: seed(J.head, 'x'),
      };
      c.bias = (Math.random() * 2 - 1) * 0.35; // per-corpse asymmetry
    }

    const step = (s, eq, stiff, damp, min, max) => {
      const torque = (eq - s.a) * stiff - s.v * damp;
      s.v += torque * dt;
      s.a += s.v * dt;
      if (s.a < min) { s.a = min; if (s.v < 0) s.v *= -0.4; } // slap against the stop + bounce
      if (s.a > max) { s.a = max; if (s.v > 0) s.v *= -0.4; }
      return s.a;
    };

    const J_ = c.j;
    const b = c.bias;
    // arms hang limp at the sides, slightly splayed and bent
    J.shoulderL.rotation.x = step(J_.shLx, -0.12 + b, 26, 4.5, -2.7, 0.7);
    J.shoulderR.rotation.x = step(J_.shRx, -0.12 - b, 26, 4.5, -2.7, 0.7);
    J.shoulderL.rotation.z = step(J_.shLz, 0.18, 22, 4.5, -0.1, 1.2);
    J.shoulderR.rotation.z = step(J_.shRz, -0.18, 22, 4.5, -1.2, 0.1);
    J.elbowL.rotation.x = step(J_.elL, 0.35 + 0.2 * b, 18, 4.0, 0.05, 2.2);
    J.elbowR.rotation.x = step(J_.elR, 0.35 - 0.2 * b, 18, 4.0, 0.05, 2.2);

    // legs droop relaxed, slight bend + splay
    J.thighL.rotation.x = step(J_.thLx, 0.08 + b, 30, 6.0, -1.0, 1.2);
    J.thighR.rotation.x = step(J_.thRx, 0.08 - b, 30, 6.0, -1.0, 1.2);
    J.thighL.rotation.z = step(J_.thLz, 0.08, 26, 5.5, -0.2, 0.7);
    J.thighR.rotation.z = step(J_.thRz, -0.08, 26, 5.5, -0.7, 0.2);
    J.kneeL.rotation.x = step(J_.knL, 0.30, 22, 5.0, 0.0, 2.0);
    J.kneeR.rotation.x = step(J_.knR, 0.28, 22, 5.0, 0.0, 2.0);

    // spine + head loll
    J.torso.rotation.x = step(J_.torso, 0.05, 20, 6.0, -0.3, 0.4);
    J.head.rotation.x = step(J_.head, 0.25 + 0.2 * b, 13, 3.5, -0.3, 0.6);
    J.head.rotation.z = 0.12 * b;
  }
}
