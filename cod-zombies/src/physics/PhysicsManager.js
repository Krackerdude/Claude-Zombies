import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsConfig } from '../config/index.js';

// Collision groups (membership<<16 | filter). ENV = world geometry (default
// 0xFFFF membership covers it), ACTOR = player/zombie capsules, RAGDOLL = corpse
// segments. Actors collide with ENV + ACTOR (not ragdolls, so corpses can't
// block/shove them); ragdolls collide with ENV + other RAGDOLLs (terrain + piles).
const ENV = 0x0001, ACTOR = 0x0002, RAGDOLL = 0x0004;
const GROUP_ACTOR = (ACTOR << 16) | (ENV | ACTOR);
const GROUP_RAGDOLL = (RAGDOLL << 16) | (ENV | RAGDOLL);

/** World point -> a body's local frame (conjugate-quat rotate of the offset). */
function _localAnchor(w, p, q) {
  const vx = w.x - p.x, vy = w.y - p.y, vz = w.z - p.z;
  const ix = -q.x, iy = -q.y, iz = -q.z, iw = q.w; // conjugate of a unit quat
  const tx = 2 * (iy * vz - iz * vy);
  const ty = 2 * (iz * vx - ix * vz);
  const tz = 2 * (ix * vy - iy * vx);
  return {
    x: vx + iw * tx + (iy * tz - iz * ty),
    y: vy + iw * ty + (iz * tx - ix * tz),
    z: vz + iw * tz + (ix * ty - iy * tx),
  };
}

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

  /** Kinematic capsule for a character controller (player + zombies). Tagged in
   *  the ACTOR collision group so ragdoll corpses never block or shove it. */
  createCharacterCapsule(position, { radius, halfHeight }) {
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      position.x,
      position.y,
      position.z,
    );
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius)
      .setCollisionGroups(GROUP_ACTOR);
    const collider = this.world.createCollider(colliderDesc, body);
    return { body, collider, type: 'kinematic' };
  }

  // --- ragdoll primitives (real articulated corpses) ----------------------
  // Flag the facade so callers can fall back to the procedural corpse when the
  // physics backend is a headless stub that lacks these.
  ragdollCapable = true;

  /** A dynamic box limb segment for a ragdoll: collides with the world + other
   *  ragdolls (RAGDOLL group), but NOT with actors, so corpses don't block the
   *  player/horde. Damped so piles settle + sleep instead of jittering. The body
   *  origin sits at the limb's JOINT pivot; `offset` shifts the box down the limb
   *  in the body's local frame so the collider actually wraps the bone. */
  createRagdollBox(position, quat, halfExtents, { density = 1.1, offset = null } = {}) {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(0.35)
      .setAngularDamping(0.6)
      .setCcdEnabled(true);
    if (quat) bodyDesc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setDensity(density)
      .setRestitution(0.05)
      .setFriction(0.9)
      .setCollisionGroups(GROUP_RAGDOLL);
    if (offset) colliderDesc.setTranslation(offset.x, offset.y, offset.z);
    const collider = this.world.createCollider(colliderDesc, body);
    return { body, collider, type: 'dynamic' };
  }

  /** Spherical (ball) joint anchoring two ragdoll segments at a shared world
   *  point; contacts between the directly-jointed pair are disabled so they
   *  don't fight at the socket (other segments still self-collide). */
  createSphericalJoint(handleA, handleB, worldAnchor) {
    const a = handleA.body, b = handleB.body;
    const la = a.translation(), lb = b.translation();
    const qa = a.rotation(), qb = b.rotation();
    const anchorA = _localAnchor(worldAnchor, la, qa);
    const anchorB = _localAnchor(worldAnchor, lb, qb);
    const params = RAPIER.JointData.spherical(anchorA, anchorB);
    params.contactsEnabled = false;
    const joint = this.world.createImpulseJoint(params, a, b, true);
    return joint;
  }

  applyImpulse(handle, imp) {
    handle?.body?.applyImpulse({ x: imp.x, y: imp.y, z: imp.z }, true);
  }

  setLinearVelocity(handle, v) {
    handle?.body?.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
  }

  setAngularVelocity(handle, w) {
    handle?.body?.setAngvel({ x: w.x, y: w.y, z: w.z }, true);
  }

  bodyTransform(handle) {
    const p = handle.body.translation();
    const q = handle.body.rotation();
    return { p, q };
  }

  removeJoint(joint) {
    if (joint) this.world.removeImpulseJoint(joint, true);
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
