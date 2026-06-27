import * as THREE from 'three';
import { HoundConfig } from '../config/zombies.js';
import { ZombieTag, RigidBodyRef } from '../ecs/components/index.js';
import { Service } from '../core/ServiceLocator.js';

/**
 * Owns hellhound spawning for the special ("dog") round. Unlike the horde,
 * hounds materialise INSIDE the playable space: each spawn fires a lightning
 * strike at a random reachable interior cell, and a beat later the hound forms
 * where the bolt hit. They then path to the player on the same nav graph.
 *
 * Mirrors SpawnManager's interface (beginWave / update / reset / remaining /
 * notifyKilled) so RoundManager can drive either. When the LAST hound dies it
 * fires a guaranteed Max Ammo drop where it fell — the classic dog-round reward.
 */
export class HoundManager {
  #world; #factory; #events; #nav; #scene; #getPlayerPos;

  alive = 0;
  queue = 0;
  #stats = null;
  #timer = 0;
  #pending = [];   // strikes mid-flight: { x, z, t } -> hound forms when t <= 0
  #bolts = [];     // active lightning VFX: { group, age, life }

  constructor({ world, factory, events, nav, scene, getPlayerPos }) {
    this.#world = world;
    this.#factory = factory;
    this.#events = events;
    this.#nav = nav;
    this.#scene = scene;
    this.#getPlayerPos = getPlayerPos;
  }

  /** Hounds still owed this round (queued + forming + on the field). */
  get remaining() { return this.queue + this.#pending.length + this.alive; }

  beginWave(count, stats) {
    this.queue = count;
    this.#stats = stats;
    this.#timer = HoundConfig.firstSpawnDelay;
  }

  /** Remove every hound (+ its capsule) and clear pending strikes/bolts. */
  reset() {
    const physics = this.#world.services.get(Service.Physics);
    for (const id of [...this.#world.query(ZombieTag)]) {
      if (!this.#world.get(id, ZombieTag)?.hound) continue;
      const ref = this.#world.get(id, RigidBodyRef);
      if (ref) physics.removeBody(ref);
      this.#world.destroyEntity(id);
    }
    this.alive = 0;
    this.queue = 0;
    this.#stats = null;
    this.#pending.length = 0;
    for (const b of this.#bolts) this.#scene.remove(b.group);
    this.#bolts.length = 0;
  }

  notifyKilled(x = 0, z = 0) {
    this.alive = Math.max(0, this.alive - 1);
    this.#emitCount();
    // last hound down (none queued, none forming): guaranteed Max Ammo where it fell
    if (this.remaining <= 0) this.#events.emit('powerup:force', { type: 'maxAmmo', x, z });
  }

  update(dt) {
    this.#tickBolts(dt);
    this.#tickPending(dt);

    if (this.queue > 0 && this.alive + this.#pending.length < HoundConfig.maxAlive) {
      this.#timer -= dt;
      if (this.#timer <= 0) {
        this.#timer = HoundConfig.spawnInterval;
        this.#strike();
      }
    }
  }

  /** Pick a reachable interior cell, flash a bolt there, queue the hound. */
  #strike() {
    const p = this.#pickInteriorPoint();
    if (!p) { this.#timer = 0.2; return; } // try again shortly
    this.queue--;
    this.#pending.push({ x: p.x, z: p.z, t: HoundConfig.strikeDelay });
    this.#spawnBolt(p.x, p.z);
  }

  #tickPending(dt) {
    for (let i = this.#pending.length - 1; i >= 0; i--) {
      const s = this.#pending[i];
      s.t -= dt;
      if (s.t <= 0) {
        this.#factory.hound(new THREE.Vector3(s.x, 0, s.z), {
          health: this.#stats.health,
          speed: HoundConfig.speed * (0.95 + Math.random() * 0.1),
        });
        this.alive++;
        this.#pending.splice(i, 1);
        this.#emitCount();
        this.#spawnPoof(s.x, s.z);
      }
    }
  }

  /** Random walkable interior cell, a sensible distance from the player so a
   *  hound never forms on top of them. Rejection-samples a handful of tries. */
  #pickInteriorPoint() {
    const pp = this.#getPlayerPos();
    for (let tries = 0; tries < 24; tries++) {
      const x = (Math.random() * 2 - 1) * 8.3;
      const z = (Math.random() * 2 - 1) * 8.3;
      const cell = this.#nav.cellAt(x, z);
      if (cell < 0) continue;
      if (this.#nav.solid[cell] === 1) continue;          // wall/obstacle
      if (this.#nav.cellBarrier[cell] !== -1) continue;    // a gated window cell
      const d = Math.hypot(x - pp.x, z - pp.z);
      if (d < 4.5 || d > 14) continue;                     // not in the player's lap, not across a wall
      return { x, z };
    }
    return null;
  }

  // --- lightning VFX (additive meshes only; no dynamic lights -> no recompile) ---
  #spawnBolt(x, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xcfe4ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    // a jagged vertical bolt: thin tall segments stacked up the column, each
    // kinked to a random x/z offset so it reads as forked lightning
    for (let y = 0; y < 8; y++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.08, 0.07), mat);
      seg.position.set(x + (Math.random() - 0.5) * 0.6, y + 0.5, z + (Math.random() - 0.5) * 0.6);
      seg.rotation.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
      group.add(seg);
    }
    // ground impact flash disc
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.2, 20), new THREE.MeshBasicMaterial({ color: 0xeaf2ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.set(x, 0.03, z);
    group.add(disc);
    group.traverse((o) => { o.raycast = () => {}; });
    this.#scene.add(group);
    this.#bolts.push({ group, age: 0, life: 0.32, disc });
    this.#events.emit('fx:shake', {}); // a little jolt as it cracks down
  }

  /** A quick ember burst as the hound forms out of the strike. */
  #spawnPoof(x, z) {
    const grp = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xff7a1e, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), mat);
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.5;
      m.position.set(x + Math.cos(a) * r, 0.3 + Math.random() * 0.6, z + Math.sin(a) * r);
      grp.add(m);
    }
    grp.traverse((o) => { o.raycast = () => {}; });
    this.#scene.add(grp);
    this.#bolts.push({ group: grp, age: 0, life: 0.4, grow: true });
  }

  #tickBolts(dt) {
    for (let i = this.#bolts.length - 1; i >= 0; i--) {
      const b = this.#bolts[i];
      b.age += dt;
      const k = b.age / b.life;
      b.group.traverse((o) => { if (o.material) o.material.opacity = Math.max(0, (1 - k)) * 0.95; });
      if (b.disc) b.disc.scale.setScalar(1 + k * 1.4);
      if (b.grow) b.group.scale.setScalar(1 + k * 1.6);
      if (k >= 1) { this.#scene.remove(b.group); this.#bolts.splice(i, 1); }
    }
  }

  #emitCount() {
    this.#events.emit('zombies:changed', { remaining: this.remaining, alive: this.alive });
  }
}
