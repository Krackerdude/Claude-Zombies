import * as THREE from 'three';
import { PlayerConfig, PhysicsConfig, Stance } from '../config/index.js';
import { MoveState, AIRBORNE } from './MoveState.js';

const UP = THREE.Object3D.DEFAULT_UP;
const _wish = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _target = new THREE.Vector3();

/**
 * Encapsulates the entire player movement model: an FSM over locomotion states
 * plus a velocity + acceleration/friction integrator. Driven once per fixed
 * tick by PlayerSystem. Only outward dependency is the physics facade.
 *
 * Stance is driven by *desired* booleans (wantCrouch/wantProne) rather than key
 * edges, so toggle/hold modes resolve cleanly upstream in ControlScheme without
 * the FSM caring. Edges (crouchEdge/proneEdge) only seed the burst moves.
 *
 *  - Horizontal motion: Quake/Source accelerate+friction → grounded weight with
 *    crisp stops; top speed is a friction equilibrium, not a clamp.
 *  - After moving, horizontal velocity reconciles to actual displacement, so
 *    walls bleed the blocked component (no sticking / buildup).
 *  - Slide is a velocity burst decayed by low friction; cancel by jumping
 *    (momentum into the air) or releasing crouch after a commit window.
 *  - Dolphin dive commits airborne and lands prone; you stay prone until you
 *    issue a stance command (input-cleared latch), so it never feels grabby.
 */
export class MovementController {
  #physics;
  #tag = null;
  #t = null;
  #ref = null;

  constructor(physics) {
    this.#physics = physics;
  }

  update(tag, t, ref, intent, dt) {
    this.#tag = tag;
    this.#t = t;
    this.#ref = ref;

    if (tag.halfHeight === 0) tag.halfHeight = ref.collider.halfHeight();

    // bleeding out: locked to prone, can't move (gravity still applies)
    if (tag.downed) {
      tag.state = MoveState.PRONE;
      this.#setStance('prone');
      tag.velocity.x = 0; tag.velocity.z = 0;
      this.#integrateVertical(dt);
      this.#applyMovement(dt);
      return;
    }

    this.#tickTimers(intent, dt);
    this.#computeWishDir(tag, intent);

    const fallSpeed = Math.max(0, -tag.velocity.y);
    this.#transition(intent, fallSpeed);
    this.#locomote(intent, dt);
    this.#integrateVertical(dt);
    this.#clampHorizontalSpeed();
    this.#applyMovement(dt);
  }

  #tickTimers(intent, dt) {
    const tag = this.#tag;
    if (intent.jumpPressed) tag.jumpBuffer = PlayerConfig.jumpBufferTime;
    else tag.jumpBuffer = Math.max(0, tag.jumpBuffer - dt);

    if (tag.grounded) {
      tag.coyote = PlayerConfig.coyoteTime;
      tag.airJumps = 0;
    } else {
      tag.coyote = Math.max(0, tag.coyote - dt);
    }

    // sprint stamina: ~4s of sprint, then a forced ~1s walk before sprinting again
    const wantSprint = intent.sprintHeld && intent.forward > 0 && tag.grounded;
    if (tag.fatigue > 0) {
      tag.fatigue = Math.max(0, tag.fatigue - dt);
      tag.canSprint = false;
      if (tag.fatigue === 0) tag.sprintTime = 0;
    } else if (wantSprint && tag.state === MoveState.SPRINT) {
      tag.sprintTime += dt;
      if (tag.sprintTime >= (tag.sprintMax || PlayerConfig.sprintMaxTime)) { tag.fatigue = PlayerConfig.sprintRecoverTime; tag.canSprint = false; }
      else tag.canSprint = true;
    } else {
      tag.sprintTime = Math.max(0, tag.sprintTime - dt * PlayerConfig.sprintRecoverRate);
      tag.canSprint = true;
    }

    // dolphin-dive lockout only counts down while standing/walking/running
    if (tag.grounded && (tag.state === MoveState.WALK || tag.state === MoveState.SPRINT)) {
      tag.diveLock = Math.max(0, (tag.diveLock || 0) - dt);
    }
    tag.getUpT = Math.max(0, (tag.getUpT || 0) - dt); // rising-from-prone weight timer
  }

  #computeWishDir(tag, intent) {
    _wish.set(intent.strafe, 0, -intent.forward);
    intent.hasMove = _wish.lengthSq() > 1e-6;
    if (_wish.lengthSq() > 1) _wish.normalize();
    _wish.applyAxisAngle(UP, tag.yaw);
  }

  #facing() {
    return _fwd.set(0, 0, -1).applyAxisAngle(UP, this.#tag.yaw);
  }

  #horizSpeed() {
    const v = this.#tag.velocity;
    return Math.hypot(v.x, v.z);
  }

  #transition(intent, fallSpeed) {
    const tag = this.#tag;
    const grounded = tag.grounded;
    const wantJump = tag.jumpBuffer > 0 && (grounded || tag.coyote > 0);

    if (tag.state === MoveState.DIVE) {
      if (grounded) {
        tag.landImpact = fallSpeed;
        this.#setStance('prone');
        tag.state = MoveState.PRONE;
        tag.velocity.x *= 0.2;
        tag.velocity.z *= 0.2;
        tag.proneForced = true;
      }
      return;
    }

    if (!grounded && !AIRBORNE.has(tag.state)) tag.state = MoveState.AIR;

    if (tag.state === MoveState.AIR) {
      if (grounded) {
        tag.landImpact = fallSpeed;
        this.#resolveLanding(intent);
      } else if (wantJump) {
        this.#doJump();
      }
      return;
    }

    if (tag.state === MoveState.SLIDE) {
      if (wantJump) { this.#doSlideJump(); return; }
      const ending =
        tag.slideTime >= PlayerConfig.slideMaxTime ||
        this.#horizSpeed() <= PlayerConfig.slideMinSpeed;
      if (ending) {
        tag.slideTime = 0;
        this.#groundedResolve(intent);
      }
      return;
    }

    if (wantJump && tag.state !== MoveState.PRONE && !tag.proneForced) { this.#doJump(); return; }

    if (tag.proneForced) {
      if (intent.crouchEdge || intent.proneEdge) {
        tag.proneForced = false;
        this.#setStance('crouch');
        tag.state = MoveState.CROUCH;
        return;
      }
      if (intent.sprintHeld && intent.forward > 0 && this.#canStand()) {
        tag.proneForced = false;
        this.#setStance('stand');
        tag.state = MoveState.SPRINT;
        return;
      }
      this.#setStance('prone');
      tag.state = MoveState.PRONE;
      return;
    }

    this.#groundedResolve(intent);
  }

  #groundedResolve(intent) {
    const tag = this.#tag;
    const sprinting = intent.sprintHeld && intent.forward > 0 && tag.canSprint && !tag.noSprint;
    // Already-sprinting always counts as "fast": a one-frame velocity dip from
    // grazing a wall/zombie (velocity reconciles to the blocked displacement in
    // #applyMovement) shouldn't drop a crouch press from a slide into a crouch.
    const fast = tag.state === MoveState.SPRINT || this.#horizSpeed() >= PlayerConfig.walkSpeed * 0.7;

    if (sprinting && intent.crouchEdge && fast) { this.#startSlide(true); return; }
    if (sprinting && intent.proneEdge && tag.diveLock <= 0) { this.#startDive(); return; }

    let desired = intent.wantProne ? 'prone' : intent.wantCrouch ? 'crouch' : 'stand';
    if (desired === 'stand' && !this.#canStand()) desired = 'crouch';
    this.#setStance(desired);

    if (desired === 'stand') tag.state = sprinting ? MoveState.SPRINT : MoveState.WALK;
    else if (desired === 'crouch') tag.state = MoveState.CROUCH;
    else tag.state = MoveState.PRONE;
  }

  #resolveLanding(intent) {
    if (intent.sprintHeld && intent.wantCrouch && this.#horizSpeed() > PlayerConfig.walkSpeed * 1.05) {
      this.#startSlide(true);
      return;
    }
    this.#groundedResolve(intent);
  }

  #doJump() {
    const tag = this.#tag;
    tag.proneForced = false;
    if (this.#canStand()) this.#setStance('stand');
    tag.airCap = Math.max(this.#horizSpeed(), PlayerConfig.walkSpeed); // jump carries launch speed, no more
    tag.velocity.y = PlayerConfig.jumpSpeed;
    tag.grounded = false;
    tag.coyote = 0;
    tag.jumpBuffer = 0;
    tag.state = MoveState.AIR;
    tag.slideTime = 0;
  }

  #doSlideJump() {
    const tag = this.#tag;
    if (this.#canStand()) this.#setStance('stand');
    tag.airCap = Math.max(this.#horizSpeed(), PlayerConfig.walkSpeed); // keep slide momentum, then wind-drag bleeds it
    tag.velocity.y = PlayerConfig.jumpSpeed;
    tag.grounded = false;
    tag.coyote = 0;
    tag.jumpBuffer = 0;
    tag.state = MoveState.AIR;
    tag.slideTime = 0;
  }

  #startSlide(boost) {
    const tag = this.#tag;
    this.#setStance('slide');
    tag.state = MoveState.SLIDE;
    tag.slideTime = 0;

    const speed = this.#horizSpeed();
    if (speed > 0.5) _dir.set(tag.velocity.x, 0, tag.velocity.z).normalize();
    else _dir.copy(this.#facing());

    const mag = boost ? PlayerConfig.slideEnterSpeed : Math.max(speed, PlayerConfig.slideMinSpeed);
    tag.velocity.x = _dir.x * mag;
    tag.velocity.z = _dir.z * mag;
  }

  #startDive() {
    const tag = this.#tag;
    this.#setStance('prone');
    tag.state = MoveState.DIVE;
    const dir = this.#facing();
    tag.velocity.x = dir.x * PlayerConfig.diveForwardSpeed;
    tag.velocity.z = dir.z * PlayerConfig.diveForwardSpeed;
    tag.velocity.y = PlayerConfig.diveUpSpeed;
    tag.grounded = false;
    tag.diveLock = 0.25; // must spend 0.25s standing/walking/running before diving again
  }

  #locomote(intent, dt) {
    const tag = this.#tag;
    const state = tag.state;

    if (state === MoveState.SLIDE) {
      this.#applyFriction(PlayerConfig.slideFriction, dt);
      if (intent.hasMove) this.#accelerate(_wish, PlayerConfig.slideSteerSpeed, PlayerConfig.slideSteerAccel, dt);
      tag.slideTime += dt;
      return;
    }
    if (state === MoveState.DIVE) return;
    if (state === MoveState.AIR) {
      // BO3-style: gentle steering toward walk speed, wind resistance bleeds any
      // excess launch speed (slide/sprint) back down, and a hard cap at the
      // launch speed stops air-strafing from building momentum.
      if (intent.hasMove) this.#accelerate(_wish, PlayerConfig.walkSpeed, PlayerConfig.airAccel, dt);
      this.#airDrag(dt);
      const v = tag.velocity;
      const sp = Math.hypot(v.x, v.z);
      const cap = tag.airCap || PlayerConfig.walkSpeed;
      if (sp > cap) { const k = cap / sp; v.x *= k; v.z *= k; }
      return;
    }

    this.#applyFriction(PlayerConfig.groundFriction, dt);
    const wishSpeed = (intent.hasMove ? this.#stateSpeed(state, intent) : 0) * (tag.moveScale ?? 1);
    if (wishSpeed > 0) this.#accelerate(_wish, wishSpeed, PlayerConfig.groundAccel, dt);
  }

  #stateSpeed(state, intent) {
    switch (state) {
      case MoveState.SPRINT: return intent.forward > 0 ? PlayerConfig.sprintSpeed : PlayerConfig.walkSpeed;
      case MoveState.CROUCH: return PlayerConfig.crouchSpeed;
      case MoveState.PRONE: return PlayerConfig.proneSpeed;
      default: return PlayerConfig.walkSpeed;
    }
  }

  #airDrag(dt) {
    const v = this.#tag.velocity;
    const speed = Math.hypot(v.x, v.z);
    const floor = PlayerConfig.walkSpeed;
    if (speed <= floor) return; // walk-speed (and slower) air motion is preserved
    const ns = floor + (speed - floor) * Math.exp(-PlayerConfig.airDrag * dt);
    const k = ns / speed;
    v.x *= k; v.z *= k;
  }

  #applyFriction(friction, dt) {
    const v = this.#tag.velocity;
    const speed = Math.hypot(v.x, v.z);
    if (speed < 1e-3) { v.x = 0; v.z = 0; return; }
    const control = Math.max(speed, PlayerConfig.stopSpeed);
    let newSpeed = speed - control * friction * dt;
    if (newSpeed < 0) newSpeed = 0;
    const k = newSpeed / speed;
    v.x *= k;
    v.z *= k;
  }

  #accelerate(dir, wishSpeed, accel, dt) {
    const v = this.#tag.velocity;
    const current = v.x * dir.x + v.z * dir.z;
    const add = wishSpeed - current;
    if (add <= 0) return;
    let accelSpeed = accel * dt * wishSpeed;
    if (accelSpeed > add) accelSpeed = add;
    v.x += dir.x * accelSpeed;
    v.z += dir.z * accelSpeed;
  }

  #integrateVertical(dt) {
    const tag = this.#tag;
    if (tag.grounded && !AIRBORNE.has(tag.state)) tag.velocity.y = -2.0;
    else tag.velocity.y += PhysicsConfig.gravity.y * dt;
  }

  #clampHorizontalSpeed() {
    const v = this.#tag.velocity;
    const speed = Math.hypot(v.x, v.z);
    const max = PlayerConfig.maxGroundSpeed;
    if (speed > max) {
      const k = max / speed;
      v.x *= k;
      v.z *= k;
    }
  }

  #applyMovement(dt) {
    const tag = this.#tag;
    const t = this.#t;
    const ref = this.#ref;
    const v = tag.velocity;

    t.cachePrevious();

    const { movement, grounded } = this.#physics.moveCharacter(ref.collider, {
      x: v.x * dt,
      y: v.y * dt,
      z: v.z * dt,
    });

    v.x = movement.x / dt;
    v.z = movement.z / dt;
    if (!grounded) v.y = movement.y / dt;

    tag.wasGrounded = tag.grounded;
    tag.grounded = grounded;

    _target.set(t.position.x + movement.x, t.position.y + movement.y, t.position.z + movement.z);
    this.#physics.setKinematicTarget(ref.body, _target);
    t.position.copy(_target);
  }

  #canStand() {
    return this.#physics.hasHeadroom(this.#ref, Stance.stand.halfHeight);
  }

  #setStance(stance) {
    const tag = this.#tag;
    if (tag.stance === stance) return;
    if (tag.stance === 'prone' && stance !== 'prone') tag.getUpT = 0.5; // weighty get-up
    const target = Stance[stance];
    const delta = this.#physics.resizeCapsule(this.#ref, target.halfHeight);
    tag.stance = stance;
    tag.halfHeight = target.halfHeight;
    if (delta !== 0) {
      this.#t.position.y += delta;
      this.#t.previousPosition.y += delta;
    }
  }
}
