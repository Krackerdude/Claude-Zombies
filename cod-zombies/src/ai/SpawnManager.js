import * as THREE from 'three';
import { RoundConfig, Gaits, pickGait } from '../config/zombies.js';
import { ZombieTag, RigidBodyRef } from '../ecs/components/index.js';
import { Service } from '../core/ServiceLocator.js';

/**
 * Owns wave spawning. Zombies enter from spawn points placed *outside* the
 * playable boundary; the nav graph routes them in (through boardable windows).
 * Tracks the live count and a pending queue; the round director calls update().
 */
export class SpawnManager {
  #world;
  #factory;
  #events;
  #getPlayerPos;
  #spawnPoints; // THREE.Vector3[] (exterior)

  alive = 0;
  queue = 0;
  #stats = null;
  #timer = 0;
  #bag = []; // shuffled spawn-point indices, refilled when empty

  constructor({ world, factory, events, spawnPoints, getPlayerPos }) {
    this.#world = world;
    this.#factory = factory;
    this.#events = events;
    this.#spawnPoints = spawnPoints;
    this.#getPlayerPos = getPlayerPos;
  }

  /** Zombies still owed this round (pending + on the field). */
  get remaining() { return this.queue + this.alive; }

  beginWave(count, stats) {
    this.queue = count;
    this.#stats = stats;
    this.#timer = RoundConfig.firstSpawnDelay;
  }

  /** Remove every zombie (+ its capsule) and reset counters. */
  reset() {
    const physics = this.#world.services.get(Service.Physics);
    for (const id of [...this.#world.query(ZombieTag)]) {
      const ref = this.#world.get(id, RigidBodyRef);
      if (ref) physics.removeBody(ref);
      this.#world.destroyEntity(id);
    }
    this.alive = 0;
    this.queue = 0;
    this.#stats = null;
  }

  notifyKilled() {
    this.alive = Math.max(0, this.alive - 1);
    this.#emitCount();
  }

  update(dt) {
    if (this.queue <= 0 || this.alive >= RoundConfig.maxAlive) return;
    this.#timer -= dt;
    if (this.#timer > 0) return;
    this.#timer = RoundConfig.spawnInterval;
    this.#spawnOne();
  }

  #spawnOne() {
    const p = this.#pickSpawn();
    const gait = pickGait(this.#stats.round);
    const speed = Gaits[gait].speed * (0.9 + Math.random() * 0.2); // slight per-zombie jitter
    const variant = (Math.random() * 4) | 0; // 1 of 4 subtle animation personalities
    this.#factory.zombie(new THREE.Vector3(p.x, 0, p.z), { health: this.#stats.health, speed, gait, variant });
    this.alive++;
    this.queue--;
    this.#emitCount();
  }

  /** Even distribution: cycle every spawn point in a reshuffled order so the
   *  horde comes from all around the map, not one corner. */
  #pickSpawn() {
    if (this.#bag.length === 0) {
      this.#bag = this.#spawnPoints.map((_, i) => i);
      for (let i = this.#bag.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [this.#bag[i], this.#bag[j]] = [this.#bag[j], this.#bag[i]];
      }
    }
    return this.#spawnPoints[this.#bag.pop()];
  }

  #emitCount() {
    this.#events.emit('zombies:changed', { remaining: this.remaining, alive: this.alive });
  }
}
