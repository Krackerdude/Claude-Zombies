import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsConfig } from '../config/index.js';

/**
 * The ONLY module that imports Rapier directly. Everything else talks to
 * physics through this facade, so swapping the engine (cannon-es, a future
 * native build, etc.) would touch one file. Body/collider handles are returned
 * as opaque objects and stored in RigidBodyRef components.
 *
 * Rapier's WASM must be initialised once before a World can be created, hence
 * the async static `create()`.
 */
export class PhysicsManager {
  /** @type {RAPIER.World} */
  world = null;
  /** @type {RAPIER.KinematicCharacterController} */
  characterController = null;

  /** Async factory: loads the Rapier WASM, then builds the world. */
  static async create() {
    await RAPIER.init();
    return new PhysicsManager();
  }

  constructor() {
    const g = PhysicsConfig.gravity;
    this.world = new RAPIER.World(new RAPIER.Vector3(g.x, g.y, g.z));
    this.world.timestep = PhysicsConfig.fixedStep;

    // A reusable character controller for kinematic capsules (player, later
    // possibly humanoid zombies). offset = skin width.
    this.characterController = this.world.createCharacterController(
      PhysicsConfig.characterOffset,
    );
    this.characterController.enableAutostep(0.4, 0.2, true);
    this.characterController.enableSnapToGround(0.3);
    this.characterController.setApplyImpulsesToDynamicBodies(true);
  }

  step() {
    this.world.step();
  }

  // --- body factories -----------------------------------------------------

  /** Static, immovable collider — floors, walls, props. */
  createStaticBox(position, halfExtents) {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
      position.x,
      position.y,
      position.z,
    );
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      halfExtents.x,
      halfExtents.y,
      halfExtents.z,
    );
    const collider = this.world.createCollider(colliderDesc, body);
    return { body, collider, type: 'fixed' };
  }

  /** Dynamic rigid body box — simulated, affected by gravity/forces. */
  createDynamicBox(position, halfExtents, { density = 1, restitution = 0.1 } = {}) {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setCcdEnabled(true);
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      halfExtents.x,
      halfExtents.y,
      halfExtents.z,
    )
      .setDensity(density)
      .setRestitution(restitution);
    const collider = this.world.createCollider(colliderDesc, body);
    return { body, collider, type: 'dynamic' };
  }

  /** Kinematic capsule for a character controller (player). */
  createCharacterCapsule(position, { radius, halfHeight }) {
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      position.x,
      position.y,
      position.z,
    );
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius);
    const collider = this.world.createCollider(colliderDesc, body);
    return { body, collider, type: 'kinematic' };
  }

  /**
   * Compute and apply collide-and-slide movement for a kinematic character.
   * Returns the corrected (post-collision) translation and grounded flag.
   * @param {*} collider Rapier collider handle
   * @param {{x:number,y:number,z:number}} desired desired translation this step
   */
  moveCharacter(collider, desired) {
    const cc = this.characterController;
    cc.computeColliderMovement(collider, desired);
    const corrected = cc.computedMovement();
    return {
      movement: { x: corrected.x, y: corrected.y, z: corrected.z },
      grounded: cc.computedGrounded(),
    };
  }

  setKinematicTarget(body, position) {
    body.setNextKinematicTranslation(position);
  }

  /** Hard-snap a body to a position (instant, ignores kinematic interpolation). */
  teleport(handle, position) {
    const body = handle.body ?? handle;
    body.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
    if (body.setLinvel) body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }

  /**
   * Resize a character capsule's cylindrical half-height in place, keeping the
   * feet planted by shifting the body centre by the height delta. Returns the
   * vertical centre delta applied (so callers can mirror it into the Transform).
   * @param {{body:*,collider:*}} handle
   * @param {number} newHalfHeight
   */
  resizeCapsule(handle, newHalfHeight) {
    const old = handle.collider.halfHeight();
    if (Math.abs(old - newHalfHeight) < 1e-4) return 0;

    const delta = newHalfHeight - old; // +grow / -shrink
    handle.collider.setHalfHeight(newHalfHeight);

    // Keep feet at the same y: centre moves by +delta.
    const p = handle.body.translation();
    handle.body.setTranslation({ x: p.x, y: p.y + delta, z: p.z }, true);
    return delta;
  }

  /**
   * Is there clearance above the capsule to grow to `targetHalfHeight`?
   * Casts a short ray straight up from the current head, excluding the player's
   * own collider. Used to avoid standing up into a ceiling. Generous by design
   * so it never blocks in open space.
   * @returns {boolean} true if clear to stand
   */
  hasHeadroom(handle, targetHalfHeight) {
    const p = handle.body.translation();
    const r = handle.collider.radius();
    const currentTop = p.y + handle.collider.halfHeight() + r;
    const targetTop = p.y + targetHalfHeight + r;
    const needed = targetTop - currentTop;
    if (needed <= 0) return true;

    const origin = { x: p.x, y: currentTop - 0.02, z: p.z };
    const ray = new RAPIER.Ray(origin, { x: 0, y: 1, z: 0 });
    const hit = this.world.castRay(
      ray,
      needed + 0.05,
      true,
      undefined,
      undefined,
      handle.collider, // exclude self
    );
    return hit === null;
  }

  removeBody(handle) {
    if (handle?.body) this.world.removeRigidBody(handle.body);
  }

  dispose() {
    this.world?.free?.();
    this.world = null;
  }
}
