import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Transform, PlayerTag, ZombieTag, RigidBodyRef } from '../ecs/components/index.js';
import { Service } from '../core/ServiceLocator.js';
import { ZombieConfig, PlayerCombat, BarrierConfig } from '../config/zombies.js';
import { ZOMBIE_AGENT } from './NavGraph.js';
import { MoveState } from '../player/MoveState.js';

const UP = new THREE.Vector3(0, 1, 0);
const _camDir = new THREE.Vector3();
const _oc = new THREE.Vector3();
const _center = new THREE.Vector3();

/**
 * Per-zombie brain + the player's combat hooks. Runs only while playing.
 *
 * FSM: spawning -> pathing -> (teardown) -> attack. Pathing queries the nav
 * graph for a route to the player and replans on a timer or whenever the nav
 * topology changes (a barrier opened). When the next waypoint is a still-boarded
 * window, the zombie stops and tears it down before continuing — including the
 * very first window if it spawned right outside one.
 *
 * Zombies are nav-driven Transforms (no rigid body) with light separation, which
 * scales to a horde far better than per-agent character controllers.
 */
export class ZombieSystem extends System {
  #gameState;
  #nav;
  #spawn;
  #events;
  #actions;
  #camera;
  #time;

  #navDirty = false;
  #lastHpEmit = -1;
  #physics;
  #pu;

  init() {
    this.#gameState = this.world.services.get(Service.GameState);
    this.#nav = this.world.services.get(Service.Nav);
    this.#spawn = this.world.services.get(Service.Spawn);
    this.#events = this.world.services.get(Service.Events);
    this.#actions = this.world.services.get(Service.Actions);
    this.#camera = this.world.services.get(Service.Render).camera;
    this.#time = this.world.services.get(Service.Time);
    this.#physics = this.world.services.get(Service.Physics);
    this.#pu = this.world.services.has(Service.Powerups) ? this.world.services.get(Service.Powerups) : null;
    this.#events.on('nav:changed', () => { this.#navDirty = true; });
  }

  fixedUpdate(dt) {
    if (!this.#gameState.isPlaying) return;

    const pid = this.world.first(PlayerTag, Transform);
    if (pid === undefined) return;
    const player = this.world.get(pid, PlayerTag);
    const pt = this.world.get(pid, Transform);

    this.#regen(player, dt);

    const goalCell = this.#nav.nearestWalkable(pt.position.x, pt.position.z, ZOMBIE_AGENT);

    for (const id of this.world.query(ZombieTag, Transform)) {
      const z = this.world.get(id, ZombieTag);
      const t = this.world.get(id, Transform);
      t.cachePrevious();
      this.#tickZombie(z, t, pt.position, player, goalCell, dt);
      // keep the player-blocking capsule glued to the zombie (lower for crawlers)
      const ref = this.world.get(id, RigidBodyRef);
      if (ref?.body) this.#physics.setKinematicTarget(ref.body, { x: t.position.x, y: z.crawler ? 0.5 : 0.9, z: t.position.z });
    }

    this.#navDirty = false;
  }

  // --- per-zombie FSM -----------------------------------------------------

  #tickZombie(z, t, playerPos, player, goalCell, dt) {
    // Knocked flat by an explosion: inert (no movement, no swiping) while it
    // falls, writhes and climbs back up. Checked first so it always recovers
    // even if a stun / zombie-blood would otherwise short-circuit the tick.
    if (z.state === 'knocked') {
      z.knockTime -= dt;
      z.swipe = 0;
      if (z.knockTime <= 0) { z.knockTime = 0; z.state = 'pathing'; z.replan = 0; }
      return;
    }
    // Electric Cherry: stunned zombies are frozen in place
    if (z.state !== 'spawning' && this.#time.elapsed < z.stunUntil) {
      if (z.state === 'attack') { z.state = 'pathing'; z.swipe = 0; }
      return;
    }
    // Zombie Blood: the dead lose interest — no chasing, no swiping
    if (this.#pu?.zombieBlood && z.state !== 'spawning') {
      if (z.state === 'attack') { z.state = 'pathing'; z.swipe = 0; }
      return;
    }
    // Player is bleeding out: the horde loses the kill instinct and shuffles
    // away, so getting revived isn't an instant re-down from a pile-up.
    if (player && player.downed && z.state !== 'spawning') {
      if (z.state === 'attack') { z.state = 'pathing'; z.swipe = 0; }
      const dx = t.position.x - playerPos.x, dz = t.position.z - playerPos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.#moveToward(z, t, t.position.x + (dx / d) * 4, t.position.z + (dz / d) * 4, dt);
      return;
    }
    switch (z.state) {
      case 'spawning':
        z.spawnTimer -= dt;
        if (z.spawnTimer <= 0) {
          this.#commitEntry(z, t); // lock onto the window nearest this spawn
          z.state = 'pathing';
          this.#plan(z, t, goalCell);
        }
        break;

      case 'pathing': {
        z.replan -= dt;
        if (z.replan <= 0 || this.#navDirty || !z.path) {
          this.#plan(z, t, goalCell);
          z.replan = ZombieConfig.replanInterval;
        }
        if (this.#flatDist(t.position, playerPos) <= ZombieConfig.attackRange) {
          z.state = 'attack';
          z.attackTimer = 0;
          break;
        }
        this.#followPath(z, t, playerPos, dt);
        break;
      }

      case 'teardown': {
        const b = z.barrierTarget;
        // bail the instant the window is gone — whether we tore it or another
        // zombie did. Otherwise zombies clawing the same window get stuck once
        // its boards hit zero, since tear() can no longer report "opened".
        if (!b || b.open) { z.barrierTarget = null; z.state = 'pathing'; z.replan = 0; break; }
        this.#face(t, b.position.x - t.position.x, b.position.z - t.position.z, dt);
        // per-zombie tear timing: each zombie waits out its own cooldown before
        // ripping a board, so a crowd on one window can't strip it in a blink.
        z.tearCd = (z.tearCd ?? BarrierConfig.boardTearTime) - dt;
        if (z.tearCd <= 0) {
          const res = b.removeBoard();
          z.tearCd = BarrierConfig.boardTearCooldown;
          if (res.removed) this.#events.emit('barrier:changed', { id: b.id, boards: b.boards });
          if (res.opened) {
            this.#events.emit('nav:changed', { barrier: b.id });
            z.barrierTarget = null;
            z.state = 'pathing';
            z.replan = 0;
          }
        }
        break;
      }

      case 'attack': {
        this.#face(t, playerPos.x - t.position.x, playerPos.z - t.position.z, dt);

        // a swing, once started, is committed — the hit lands no matter what
        if (z.swipe > 0) {
          z.swipe -= dt;
          if (!z.swung && z.swipe <= ZombieConfig.swipeTime - ZombieConfig.swipeHitAt) {
            z.swung = true;
            const sliding = player.state === MoveState.SLIDE || player.state === MoveState.DIVE;
            const knifed = this.#time.elapsed < z.harmlessUntil;
            if (!sliding && !knifed) { // slide to duck a swipe; a knifed zombie can't connect
              this.#damagePlayer(player, ZombieConfig.attackDamage);
              player.slowUntil = this.#time.elapsed + ZombieConfig.swipeSlowDuration; // brief slow on contact
              this.#events.emit('player:damaged', { x: t.position.x - playerPos.x, z: t.position.z - playerPos.z });
            }
          }
          if (z.swipe <= 0) { z.swipe = 0; z.attackTimer = ZombieConfig.attackCooldown; }
          break; // rooted while swinging
        }

        // between swings: recover, then either disengage or wind up the next swipe
        z.attackTimer -= dt;
        if (this.#flatDist(t.position, playerPos) > ZombieConfig.attackRange * 1.3) {
          z.state = 'pathing';
          z.replan = 0;
          break;
        }
        if (z.attackTimer <= 0) { z.swipe = ZombieConfig.swipeTime; z.swung = false; }
        break;
      }
    }
  }

  /** Lock the zombie onto the window nearest its spawn — damaged or full. It
   *  will path to and tear only that one, so an open window elsewhere can't
   *  pull the whole horde through it. */
  #commitEntry(z, t) {
    const barriers = this.#nav.barriers;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < barriers.length; i++) {
      const b = barriers[i];
      const d = Math.hypot(b.position.x - t.position.x, b.position.z - t.position.z);
      if (d < bestD) { bestD = d; best = i; }
    }
    z.entryBarrier = best >= 0 ? barriers[best] : null;
    z.agent = { tearsBarriers: true, viaBarrier: best >= 0 ? best : null };
  }

  #plan(z, t, goalCell) {
    const agent = z.agent || ZOMBIE_AGENT;
    const start = this.#nav.nearestWalkable(t.position.x, t.position.z, agent);
    const path = this.#nav.findPath(start, goalCell, agent);
    if (path && path.length > 1) {
      z.path = this.#nav.toWorld(path);
      z.pathIndex = 1; // [0] is the cell we're already on
    } else {
      z.path = null; // fall back to direct chase
      z.pathIndex = 0;
    }
  }

  #followPath(z, t, playerPos, dt) {
    let tx, tz;
    if (z.path && z.pathIndex < z.path.length) {
      const wp = z.path[z.pathIndex];
      const cell = this.#nav.cellAt(wp.x, wp.z);
      const barrier = this.#nav.barrierOf(cell);

      if (barrier && !barrier.open && barrier.teardownable && !z.crawler) {
        // approach the window, then rip it down (crawlers can't tear from the floor)
        if (this.#flatDist2(t.position, wp.x, wp.z) <= ZombieConfig.reachThreshold + 0.6) {
          z.barrierTarget = barrier;
          z.state = 'teardown';
          z.tearCd = BarrierConfig.boardTearTime; // wind-up before the first rip
          return;
        }
        tx = wp.x; tz = wp.z;
      } else if (this.#flatDist2(t.position, wp.x, wp.z) <= ZombieConfig.reachThreshold) {
        z.pathIndex++;
        if (z.pathIndex < z.path.length) { tx = z.path[z.pathIndex].x; tz = z.path[z.pathIndex].z; }
        else { tx = playerPos.x; tz = playerPos.z; }
      } else { tx = wp.x; tz = wp.z; }
    } else {
      tx = playerPos.x; tz = playerPos.z;
    }

    this.#moveToward(z, t, tx, tz, dt);
  }

  #moveToward(z, t, tx, tz, dt) {
    let dx = tx - t.position.x;
    let dz = tz - t.position.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;

    // separation from nearby zombies (avoid stacking)
    let sx = 0, sz = 0;
    const sep = ZombieConfig.separation;
    for (const oid of this.world.query(ZombieTag, Transform)) {
      const ot = this.world.get(oid, Transform);
      if (ot === t) continue;
      const ox = t.position.x - ot.position.x;
      const oz = t.position.z - ot.position.z;
      const dsq = ox * ox + oz * oz;
      if (dsq > 1e-4 && dsq < sep * sep) {
        const d = Math.sqrt(dsq);
        sx += (ox / d) * (1 - d / sep);
        sz += (oz / d) * (1 - d / sep);
      }
    }

    const step = z.speed * (z.crawler ? 0.42 : 1) * dt; // crawlers drag slowly
    let mx = dx + sx * ZombieConfig.separationStrength;
    let mz = dz + sz * ZombieConfig.separationStrength;
    const ml = Math.hypot(mx, mz) || 1;
    t.position.x += (mx / ml) * step;
    t.position.z += (mz / ml) * step;
    this.#face(t, dx, dz, dt);
  }

  // --- player combat ------------------------------------------------------


  #damagePlayer(player, dmg) {
    const perks = this.world.services.has(Service.Perks) ? this.world.services.get(Service.Perks) : null;
    if (perks && perks.downed) return; // can't be hurt while bleeding out
    player.health = Math.max(0, player.health - dmg);
    player.lastDamage = this.#time.elapsed;
    this.#emitHealth(player);
    if (player.health <= 0) this.#events.emit('player:dying', {});
  }

  #regen(player, dt) {
    if (player.health >= player.maxHealth) return;
    if (this.#time.elapsed - player.lastDamage < PlayerCombat.regenDelay) return;
    player.health = Math.min(player.maxHealth, player.health + PlayerCombat.regenRate * dt);
    this.#emitHealth(player);
  }

  #emitHealth(player) {
    const hp = Math.round(player.health);
    if (hp === this.#lastHpEmit) return;
    this.#lastHpEmit = hp;
    this.#events.emit('player:health', { health: hp, max: player.maxHealth });
  }

  // --- helpers ------------------------------------------------------------

  #face(t, dx, dz, dt) {
    if (dx * dx + dz * dz < 1e-6) return;
    const target = Math.atan2(dx, dz);
    const cur = 2 * Math.atan2(t.quaternion.y, t.quaternion.w); // current Y-only yaw
    let diff = target - cur;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // shortest way around
    const maxStep = (dt || 0.016) * 11; // ~630°/s: quick but no instant snap
    const stepped = diff > maxStep ? maxStep : diff < -maxStep ? -maxStep : diff;
    t.quaternion.setFromAxisAngle(UP, cur + stepped);
  }
  #flatDist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
  #flatDist2(a, x, z) { return Math.hypot(a.x - x, a.z - z); }
}
