import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { PlayerTag, Transform, RigidBodyRef, CorpseTag } from '../ecs/components/index.js';
import { Service } from '../core/ServiceLocator.js';
import { AppState } from '../core/GameState.js';
import { Stance } from '../config/index.js';
import { PlayerCombat } from '../config/zombies.js';

/**
 * Orchestrates the survival loop. Ticks round + spawn while playing, and owns
 * the single source of truth for a clean field: #resetField() wipes zombies,
 * corpses, barriers and fully restores the player (position, body, health,
 * stance, look). Both "new run from menu" and "death" route through it.
 *
 * Death is DEFERRED: a killing blow only raises a flag during the sim tick, and
 * the actual teardown happens in lateUpdate — never mid-iteration. Removing
 * physics bodies while a system is still walking the zombie list (the old bug)
 * left freed Rapier handles behind and froze the whole loop until a reload.
 */
export class RoundSystem extends System {
  #gameState;
  #round;
  #spawn;
  #hounds;
  #events;
  #nav;
  #physics;
  #spawn0 = new THREE.Vector3(6, 1.2, -6);
  #spawnYaw = 0;
  #pendingDeath = false;

  init() {
    this.#gameState = this.world.services.get(Service.GameState);
    this.#round = this.world.services.get(Service.Round);
    this.#spawn = this.world.services.get(Service.Spawn);
    this.#hounds = this.world.services.has(Service.Hounds) ? this.world.services.get(Service.Hounds) : null;
    this.#events = this.world.services.get(Service.Events);
    this.#nav = this.world.services.get(Service.Nav);
    this.#physics = this.world.services.get(Service.Physics);

    // capture the player's start pose as the respawn anchor
    const pid = this.world.first(PlayerTag, Transform);
    if (pid !== undefined) {
      this.#spawn0.copy(this.world.get(pid, Transform).position);
      this.#spawnYaw = this.world.get(pid, PlayerTag).yaw;
    }

    this.#events.on('state:change', ({ prev, state }) => {
      if (state === AppState.PLAYING && prev === AppState.MENU) this.#startRun();
      else if (state === AppState.MENU) { this.#spawn.reset(); this.#hounds?.reset(); }
    });
    // a killing blow just flags death; the reset runs at a safe point (lateUpdate)
    this.#events.on('player:down', () => { this.#pendingDeath = true; });
    // pause-menu "Restart Level": wipe the field + player and start over at round 1
    this.#events.on('game:restart', () => this.#resetField());
  }

  #startRun() {
    this.#resetField();
  }

  /** Full, safe teardown + restore. Safe to call any time a system isn't mid-iteration. */
  #resetField() {
    this.#events.emit('run:reset', {}); // wipe death/damage HUD first

    this.#spawn.reset();   // despawn zombies (+ their bodies)
    this.#hounds?.reset(); // and any hellhounds + pending strikes
    this.#clearCorpses();  // and any corpses
    this.world.flushDestroyed(); // remove from stores NOW so nothing reads a freed body

    this.#round.reset();

    // re-board every window so the arena starts sealed again
    for (const b of this.#nav.barriers) {
      b.boards = b.maxBoards;
      b.tearAcc = 0;
      b.repairAcc = 0;
      this.#events.emit('barrier:changed', { id: b.id, boards: b.boards });
    }
    this.#events.emit('nav:changed', { reset: true });

    // --- restore the player completely ---
    const pid = this.world.first(PlayerTag);
    if (pid === undefined) return;
    const p = this.world.get(pid, PlayerTag);
    const t = this.world.get(pid, Transform);
    const ref = this.world.get(pid, RigidBodyRef);

    p.health = p.maxHealth = PlayerCombat.maxHealth;
    p.points = 500;
    p.lastDamage = -999;
    p.downed = false;
    p.noSprint = false;
    p.canSprint = true;
    p.fatigue = 0;
    p.sprintTime = 0;
    p.slowUntil = -999;
    p.diveLock = 0;
    p.aiming = false;
    p.state = 'walk';
    p.proneForced = false;
    p.yaw = this.#spawnYaw;
    p.pitch = 0;
    p.recoilPitch = 0;
    p.recoilYaw = 0;
    if (p.velocity) p.velocity.set(0, 0, 0);

    // stance back to standing (capsule profile) then hard-snap to the spawn point
    if (ref && this.#physics) {
      this.#physics.resizeCapsule?.(ref, Stance.stand.halfHeight);
      this.#physics.teleport?.(ref, this.#spawn0);
    }
    p.stance = 'stand';
    p.halfHeight = Stance.stand.halfHeight;
    if (t) { t.position.copy(this.#spawn0); t.previousPosition.copy(this.#spawn0); }

    this.#events.emit('player:health', { health: p.health, max: p.maxHealth });
    this.#events.emit('score:changed', { points: 500 });
  }

  #clearCorpses() {
    for (const id of [...this.world.query(CorpseTag)]) {
      const ref = this.world.get(id, RigidBodyRef);
      if (ref && this.#physics.removeBody) this.#physics.removeBody(ref);
      this.world.destroyEntity(id);
    }
  }

  fixedUpdate(dt) {
    if (!this.#gameState.isPlaying) return;
    this.#round.update(dt);
    this.#spawn.update(dt);
    this.#hounds?.update(dt);
  }

  // Death teardown happens here, after every sim/anim system has finished its
  // pass for the frame — so no one is left holding a freed body.
  lateUpdate() {
    if (!this.#pendingDeath) return;
    this.#pendingDeath = false;
    this.#resetField();
    this.#gameState.set(AppState.MENU);
  }
}
