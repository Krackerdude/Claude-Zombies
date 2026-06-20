import * as THREE from 'three';

/**
 * Spatial state of an entity. This is the authoritative transform that systems
 * read/write; the RenderSystem copies it onto the Object3D, and the
 * PhysicsSystem copies simulated bodies back into it.
 *
 * `previousPosition` is retained so the render phase can interpolate between
 * the last two fixed steps using GameLoop's `alpha`.
 */
export class Transform {
  constructor(position = new THREE.Vector3(), quaternion = new THREE.Quaternion()) {
    // Accept either a THREE.Vector3 or a plain {x,y,z} so call sites don't all
    // have to construct vectors.
    this.position = position.clone
      ? position.clone()
      : new THREE.Vector3(position.x ?? 0, position.y ?? 0, position.z ?? 0);
    this.previousPosition = this.position.clone();
    this.quaternion = quaternion.clone
      ? quaternion.clone()
      : new THREE.Quaternion(quaternion.x ?? 0, quaternion.y ?? 0, quaternion.z ?? 0, quaternion.w ?? 1);
    this.scale = new THREE.Vector3(1, 1, 1);
  }

  /** Call at the start of a fixed step before integrating, to enable interpolation. */
  cachePrevious() {
    this.previousPosition.copy(this.position);
  }
}

/**
 * Visual representation: any THREE.Object3D (mesh, group, loaded model). The
 * RenderSystem adds it to the scene on creation and syncs the Transform onto it.
 */
export class Renderable {
  /** @param {THREE.Object3D} object3d */
  constructor(object3d, { interpolate = true, addedToScene = false } = {}) {
    this.object3d = object3d;
    this.interpolate = interpolate;
    this.addedToScene = addedToScene;
  }
}

/**
 * Links an entity to a physics body in the PhysicsManager. Holds the opaque
 * handles rather than raw Rapier objects so the rest of the code never imports
 * Rapier directly (physics abstraction boundary).
 */
export class RigidBodyRef {
  /**
   * @param {object} opts
   * @param {*} opts.body     engine body handle (Rapier RigidBody)
   * @param {*} opts.collider engine collider handle (Rapier Collider)
   * @param {'dynamic'|'fixed'|'kinematic'} opts.type
   */
  constructor({ body, collider, type }) {
    this.body = body;
    this.collider = collider;
    this.type = type;
  }
}

/** Tag + full movement state for the locally controlled player. */
export class PlayerTag {
  constructor() {
    // look
    this.yaw = 0;
    this.pitch = 0;

    // velocity model
    this.velocity = new THREE.Vector3(); // full 3D; xz = horizontal, y = vertical
    this.grounded = false;
    this.wasGrounded = false;

    // state machine
    this.state = 'walk'; // walk | sprint | crouch | prone | slide | air | dive
    this.stance = 'stand'; // capsule profile: stand | crouch | slide | prone
    this.halfHeight = 0; // current capsule cylindrical half-height (set on spawn)

    // timers / buffers (seconds)
    this.coyote = 0; // counts down after leaving ground
    this.jumpBuffer = 0; // counts down after a jump press
    this.slideTime = 0; // elapsed slide time
    this.airJumps = 0;
    this.proneForced = false; // post-dive prone latch, cleared by a stance command
    this.airCap = 99; // horizontal speed cap while airborne (set at jump = launch speed)
    this.getUpT = 0; // counts down while rising from prone (slows the camera rise)
    this.viewLeanPitch = 0; // transient camera lean (e.g. drinking), applied by CameraController
    this.viewLeanRoll = 0;

    // intent snapshot (filled each tick by PlayerSystem)
    this.landImpact = 0; // downward speed captured on landing, for camera dip

    // combat / survival
    this.health = 100;
    this.maxHealth = 100;
    this.lastDamage = -999; // time of last hit, for regen delay
    this.points = 500;
    this.slowUntil = -999; // time until which a zombie swipe slows movement
    this.moveScale = 1; // movement speed multiplier (set from slowUntil each tick)
    this.sprintTime = 0; // seconds sprinted continuously
    this.fatigue = 0; // forced-walk timer after exhausting a sprint
    this.canSprint = true;
    this.sprintMax = 4; // max continuous sprint (raised by Stamin-Up)
    this.noSprint = false; // hard sprint lock (drinking a perk / downed)
    this.downed = false; // bleeding out: locked prone, no movement
    this.diveLock = 0; // dolphin-dive cooldown

    // weapon-driven view state (written by WeaponSystem, read by CameraController)
    this.aiming = false;
    this.adsFov = 0; // target FOV while aiming (0 = use base)
    this.recoilPitch = 0; // transient recoil offset, recovers to 0
    this.recoilYaw = 0;
  }
}

/** State + nav data for a single zombie (nav-driven, no rigid body). */
export class ZombieTag {
  constructor({ health = 150, speed = 1.7, gait = 'run' } = {}) {
    this.state = 'spawning'; // spawning | pathing | teardown | attack | dead
    this.health = health;
    this.maxHealth = health;
    this.speed = speed;
    this.gait = gait; // 'shamble' | 'walk' | 'run' — drives the animation set

    this.path = null; // array of {x,z} waypoints
    this.pathIndex = 0;
    this.replan = 0; // countdown to next replan
    this.spawnTimer = 0; // emerge delay
    this.attackTimer = 0;
    this.swipe = 0; // >0 while a committed swipe animation is playing
    this.swung = false; // whether this swipe has already landed its hit
    this.harmlessUntil = -999; // can't damage the player until this time (knifed)
    this.stunUntil = -999; // frozen by an Electric Cherry discharge until this time
    this.barrierTarget = null; // Barrier currently being torn
    this.entryBarrier = null; // committed window (nearest to spawn) — never changes
    this.agent = null; // per-zombie nav agent { tearsBarriers, viaBarrier }

    // procedural animation state (driven by ZombieAnimSystem)
    this.animTime = Math.random() * Math.PI * 2; // desynced phase
    this.walkAmt = 0;
    this.atkAmt = 0;
    this.tearAmt = 0;
  }
}

/** A flying projectile (rocket, ray-gun bolt). Moved by the ProjectileSystem. */
export class ProjectileTag {
  constructor({ velocity, damage, life = 4, splashRadius = 0, splashDamage = 0, kind = 'rocket' } = {}) {
    this.velocity = velocity; // THREE.Vector3 (m/s)
    this.damage = damage;
    this.life = life; // seconds before fizzling
    this.splashRadius = splashRadius;
    this.splashDamage = splashDamage;
    this.kind = kind;
  }
}

/**
 * A dead zombie mid-ragdoll. Carries the launch velocity (seeded from the
 * killing bullet's direction) plus blend timers the CorpseSystem uses to tip the
 * body over, go limp, then sink + despawn. Corpses have NO physics body, so they
 * never collide with the player or live zombies.
 */
export class CorpseTag {
  constructor(dir = { x: 0, z: 1 }, baseYaw = 0, force = 1) {
    let px = dir.x || 0, pz = dir.z || 0;
    const m = Math.hypot(px, pz) || 1;
    px /= m; pz /= m;
    const speed = (1.8 + Math.random() * 1.8) * force;
    this.vx = px * speed;
    this.vz = pz * speed;
    this.vy = (1.8 + Math.random() * 1.2) * force; // upward pop
    this.baseYaw = baseYaw; // keep the zombie's facing at death (no snap)
    // horizontal axis perpendicular to the push, to tip the body over IN the
    // push direction without changing its heading
    this.tiltX = pz;
    this.tiltZ = -px;
    this.roll = (Math.random() * 2 - 1) * 0.35;
    this.life = 0;
    this.grounded = false;
    this.fall = 0; // upright -> lying blend
    this.limp = 0; // limbs go slack
    this.j = null; // per-joint ragdoll state (lazily seeded by CorpseSystem)
    this.bias = 0;
  }
}

/** A floating, collectable power-up drop. Visual spin/bob handled by PowerupSystem. */
export class PowerupTag {
  constructor(type) {
    this.type = type; // 'doublePoints' | 'instaKill' | 'nuke' | 'carpenter' | 'zombieBlood' | 'bloodMoney'
    this.life = 0; // seconds since spawn (for bob + blink-out)
  }
}
