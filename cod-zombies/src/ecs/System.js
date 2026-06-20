/**
 * Base class for ECS systems. Subclasses override the lifecycle hooks they
 * care about; the World calls them in phase order each frame:
 *
 *   fixedUpdate(dt)  — deterministic simulation (physics, controllers)
 *   update(dt)       — per-frame logic (camera, input-driven intent)
 *   lateUpdate(dt)   — after everything moved (sync transforms -> visuals)
 *
 * `this.world` is injected on registration. Systems pull other managers from
 * `this.world.services` (the ServiceLocator) to stay loosely coupled.
 */
export class System {
  /** @type {import('./World.js').World} */
  world = null;

  init() {}
  dispose() {}

  /** @param {number} _dt */
  fixedUpdate(_dt) {}
  /** @param {number} _dt */
  update(_dt) {}
  /** @param {number} _dt */
  lateUpdate(_dt) {}
}
