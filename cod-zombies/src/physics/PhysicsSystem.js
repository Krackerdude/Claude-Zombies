import { System } from '../ecs/System.js';
import { Transform, RigidBodyRef } from '../ecs/components/index.js';
import { Service } from '../core/ServiceLocator.js';

/**
 * Drives the physics simulation each fixed step and writes dynamic body poses
 * back into Transforms. Kinematic bodies (player) are driven the other way by
 * their own controller, so we skip syncing those here.
 *
 * Runs in fixedUpdate so it stays deterministic and decoupled from frame rate.
 */
export class PhysicsSystem extends System {
  #physics;
  #gameState;

  init() {
    this.#physics = this.world.services.get(Service.Physics);
    this.#gameState = this.world.services.get(Service.GameState);
  }

  fixedUpdate(_dt) {
    if (this.#gameState.current === 'paused') return; // freeze the world
    // Cache previous positions for render interpolation before integrating.
    // Only dynamic bodies — kinematic ones (the player) cache themselves in
    // their controller, before they move, so we must not clobber that here.
    for (const id of this.world.query(Transform, RigidBodyRef)) {
      if (this.world.get(id, RigidBodyRef).type === 'dynamic') {
        this.world.get(id, Transform).cachePrevious();
      }
    }

    this.#physics.step();

    // Pull simulated (dynamic) bodies back into the authoritative Transform.
    for (const id of this.world.query(Transform, RigidBodyRef)) {
      const ref = this.world.get(id, RigidBodyRef);
      if (ref.type !== 'dynamic') continue;

      const t = this.world.get(id, Transform);
      const p = ref.body.translation();
      const r = ref.body.rotation();
      t.position.set(p.x, p.y, p.z);
      t.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }
}
