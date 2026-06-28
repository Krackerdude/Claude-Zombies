import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Service } from '../core/ServiceLocator.js';
import { PlayerTag, ZombieTag, Transform } from '../ecs/components/index.js';
import { MoveState } from '../player/MoveState.js';
import { PERKS, buildPerkMachine } from './perks.js';
import { PlayerCombat } from '../config/zombies.js';
import { damageZombie } from '../weapons/damage.js';

const PLACEMENT = [
  ['quickRevive', -9.2, -7], ['juggernog', -9.2, -1], ['speedCola', -9.2, 5],
  ['phdFlopper', -5, 9.2], ['staminUp', 1, 9.2], ['doubleTap', 7, 9.2],
  ['muleKick', 9.2, 7], ['deadshot', 9.2, 1], ['electricCherry', 9.2, -5],
];
const MAX_PERKS = 5;
const DRINK_TIME = 2.2; // frantic chug, not a slow sip
const REVIVE_TIME = 10;
const STUN_TIME = 1.6;
const CHERRY_RADIUS = 4.5;
const _v = new THREE.Vector3();

export class PerkSystem extends System {
  #events; #gameState; #camera; #scene; #physics;
  #owned = new Set();
  #machines = [];
  #drinking = false; #drinkTimer = 0; #pending = null;
  #downed = false; #downTimer = 0;
  #muleStash = null;
  #changeGiven = new Set(); // machines that already paid out Lost Change

  // --- queried by other systems ---
  has(id) { return this.#owned.has(id); }
  get drinking() { return this.#drinking; }
  get downed() { return this.#downed; }
  maxHealth() { return this.#owned.has('juggernog') ? 170 : PlayerCombat.maxHealth; }
  moveMul() { return this.#owned.has('staminUp') ? 1.07 : 1; }
  sprintTime() { return this.#owned.has('staminUp') ? 12 : 4; }
  reloadMul() { return this.#owned.has('speedCola') ? 1.35 : 1; }
  repairMul() { return this.#owned.has('speedCola') ? 2 : 1; }
  fireRateMul() { return this.#owned.has('doubleTap') ? 1.3 : 1; }
  damageMul(category) { return this.#owned.has('doubleTap') && category !== 'wonder' ? 2 : 1; }
  headshotMul() { return this.#owned.has('deadshot') ? 1.25 : 1; }
  recoilMul() { return this.#owned.has('deadshot') ? 0.6 : 1; }
  swayMul() { return this.#owned.has('deadshot') ? 0.55 : 1; }
  explosionImmune() { return this.#owned.has('phdFlopper'); }
  inventoryCap() { return this.#owned.has('muleKick') ? 3 : 2; }

  init() {
    const s = this.world.services;
    this.#events = s.get(Service.Events);
    this.#gameState = s.get(Service.GameState);
    this.#camera = s.get(Service.Render).camera;
    this.#scene = s.get(Service.Scene).scene;
    this.#physics = s.get(Service.Physics);

    for (const [id, x, z] of PLACEMENT) {
      const def = PERKS[id];
      const rig = buildPerkMachine(def);
      rig.position.set(x, 0, z);
      rig.rotation.y = Math.atan2(-x, -z); // face room center
      this.#scene.add(rig);
      // collider raised ~1m above the machine so the player can't jump on top
      // (footprint unchanged; bullets ignore physics colliders).
      const colH = def.h + 1.0;
      this.#physics.createStaticBox({ x, y: colH / 2, z }, { x: 0.5, y: colH / 2, z: 0.4 });
      this.#machines.push({ id, def, x, z, rig });
    }

    this.#events.on('player:dying', () => this.#onDying());
    this.#events.on('weapon:reload-start', () => this.#onReload());
    this.#events.on('player:dive-land', ({ height }) => this.#onDive(height));
    this.#events.on('state:change', ({ state }) => {
      if (state === 'menu') this.#reset();
      else if (state === 'playing') { this.#downed = false; this.#events.emit('fx:downed', { on: false }); }
    });
  }

  /** Dev/test: force-grant a perk by id (bypasses cost + drink + cap). */
  grantPerk(id) {
    if (!PERKS[id] || this.#owned.has(id)) return;
    this.#owned.add(id);
    const def = PERKS[id];
    this.#events.emit('perk:gained', { id, name: def.name, color: def.color });
    if (id === 'juggernog') {
      const pid = this.world.first(PlayerTag);
      if (pid !== undefined) { const p = this.world.get(pid, PlayerTag); p.maxHealth = this.maxHealth(); p.health = p.maxHealth; this.#events.emit('player:health', { health: p.health, max: p.maxHealth }); }
    }
  }

  /** Dev/test: strip all perks. */
  clearPerks() {
    this.#owned.clear();
    this.#events.emit('perks:reset', {});
    const pid = this.world.first(PlayerTag);
    if (pid !== undefined) {
      const p = this.world.get(pid, PlayerTag);
      p.maxHealth = PlayerCombat.maxHealth;
      if (p.health > p.maxHealth) p.health = p.maxHealth;
      this.#events.emit('player:health', { health: p.health, max: p.maxHealth });
    }
  }

  // EconomySystem owns the shared HUD prompt + interaction; we expose machines.
  machines() { return this.#machines; }
  owns(id) { return this.#owned.has(id); }
  get count() { return this.#owned.size; }

  /** Attempt a purchase (called by EconomySystem on interact). */
  tryBuy(id, player) {
    if (this.#drinking || this.#downed) return false;
    if (this.#owned.has(id) || this.#owned.size >= MAX_PERKS) return false;
    const def = PERKS[id];
    if (player.points < def.cost) { this.#events.emit('buy:denied', {}); return false; }
    player.points -= def.cost;
    this.#events.emit('score:changed', { points: player.points });
    this.#events.emit('purchase', { kind: 'perk', cost: def.cost });
    this.#drinking = true; this.#drinkTimer = DRINK_TIME; this.#pending = id;
    this.#events.emit('perk:drink', { active: true, color: def.color });
    return true;
  }

  update(dt) {
    // sign + emblem glow pulse, slow cylinder spin, gentle light flicker (visual)
    const now = performance.now() * 0.001;
    const pulse = 0.7 + Math.sin(now * 4) * 0.3;
    for (const m of this.#machines) {
      const u = m.rig.userData;
      if (u.signMat) u.signMat.color.setHex(m.def.color).multiplyScalar(pulse + 0.4);
      if (u.chamberMat) u.chamberMat.color.setHex(m.def.color).multiplyScalar(0.8 + Math.sin(now * 3 + m.x) * 0.25);
      if (u.spin) u.spin.rotation.z = now * 0.7;
      if (u.light) u.light.intensity = 0.6 + Math.sin(now * 5 + m.z) * 0.12;
      if (u.anim) u.anim(now);
    }
    if (!this.#gameState.isPlaying) return;

    const pid = this.world.first(PlayerTag, Transform);
    if (pid === undefined) return;
    const player = this.world.get(pid, PlayerTag);

    // Lost Change: prone in front of a machine -> 100 points, once per machine
    if (player.state === MoveState.PRONE) {
      const pp = this.world.get(pid, Transform).position;
      for (const m of this.#machines) {
        if (this.#changeGiven.has(m.id)) continue;
        if ((m.x - pp.x) ** 2 + (m.z - pp.z) ** 2 <= 6.25) { // within 2.5m
          this.#changeGiven.add(m.id);
          player.points += 100;
          // award only — the "+100" points floater communicates it; no popup
          this.#events.emit('score:changed', { points: player.points });
        }
      }
    }

    // drink animation -> grant on completion
    if (this.#drinking) {
      this.#drinkTimer -= dt;
      if (this.#drinkTimer <= 0) this.#grant(this.#pending);
    }

    // downed self-revive
    if (this.#downed) {
      this.#downTimer -= dt;
      if (this.#downTimer <= 0) this.#revive(player);
    }
  }

  #grant(id) {
    this.#drinking = false;
    this.#events.emit('perk:drink', { active: false });
    if (!id) return;
    this.#owned.add(id);
    const def = PERKS[id];
    this.#events.emit('perk:gained', { id, name: def.name, color: def.color });
    if (id === 'muleKick' && this.#muleStash) {
      const w = this.world.services.get(Service.Weapons);
      w.giveWeapon?.(this.#muleStash); this.#muleStash = null;
    }
    if (id === 'juggernog') { // top up to the new bigger pool
      const pid = this.world.first(PlayerTag);
      if (pid !== undefined) { const p = this.world.get(pid, PlayerTag); p.maxHealth = this.maxHealth(); p.health = p.maxHealth; this.#events.emit('player:health', { health: p.health, max: p.maxHealth }); }
    }
  }

  // --- down / revive (quick revive) ---
  #onDying() {
    if (this.#downed) return;
    if (!this.#owned.has('quickRevive')) { this.#events.emit('player:down', {}); return; }
    this.#downed = true; this.#downTimer = REVIVE_TIME;
    this.#loseAllPerks();
    this.#events.emit('fx:downed', { on: true });
    const pid = this.world.first(PlayerTag);
    if (pid !== undefined) this.world.get(pid, PlayerTag).health = 1;
  }
  #revive(player) {
    this.#downed = false;
    player.maxHealth = this.maxHealth();
    player.health = player.maxHealth;
    this.#events.emit('fx:downed', { on: false });
    this.#events.emit('player:health', { health: player.health, max: player.maxHealth });
  }
  #loseAllPerks() {
    if (this.#owned.has('muleKick')) {
      const w = this.world.services.get(Service.Weapons);
      this.#muleStash = w.stashThird?.() ?? null; // keep the 3rd gun for a re-buy
    }
    this.#owned.clear();
    this.#events.emit('perks:reset', {});
    const pid = this.world.first(PlayerTag);
    if (pid !== undefined) this.world.get(pid, PlayerTag).maxHealth = PlayerCombat.maxHealth;
  }

  // --- electric cherry: reload zaps nearby zombies ---
  #onReload() {
    if (!this.#owned.has('electricCherry') || !this.#gameState.isPlaying) return;
    const pid = this.world.first(PlayerTag, Transform);
    if (pid === undefined) return;
    const pp = this.world.get(pid, Transform).position;
    const now = this.world.services.get(Service.Time).elapsed;
    for (const id of this.world.query(ZombieTag, Transform)) {
      const t = this.world.get(id, Transform).position;
      if ((t.x - pp.x) ** 2 + (t.z - pp.z) ** 2 <= CHERRY_RADIUS * CHERRY_RADIUS) {
        this.world.get(id, ZombieTag).stunUntil = now + STUN_TIME;
      }
    }
    this.#zap(pp);
  }

  // --- phd flopper: dive impact explosion scaled by fall height ---
  #onDive(height) {
    if (!this.#owned.has('phdFlopper') || height < 0.1) return;
    const pid = this.world.first(PlayerTag, Transform);
    if (pid === undefined) return;
    const player = this.world.get(pid, PlayerTag);
    const pp = this.world.get(pid, Transform).position;
    const radius = Math.min(8, 3 + height * 2.2);
    const dmg = 300 + height * 500;
    const ctx = { world: this.world, spawn: this.world.services.get(Service.Spawn), events: this.#events, player };
    for (const id of [...this.world.query(ZombieTag, Transform)]) {
      const t = this.world.get(id, Transform).position;
      const dx = t.x - pp.x, dz = t.z - pp.z;
      if (dx * dx + dz * dz <= radius * radius) { damageZombie(ctx, id, dmg, { dir: { x: dx, z: dz }, force: 1.6 }); this.#events.emit('fx:blood', { x: t.x, y: t.y + 1.1, z: t.z, dx, dz }); }
    }
    this.#events.emit('fx:explosion', { x: pp.x, y: pp.y + 0.5, z: pp.z, kind: 'phd' });
  }

  #zap(pos) {
    const g = new THREE.Group();
    const bolts = 10;
    for (let i = 0; i < bolts; i++) {
      const ang = (i / bolts) * Math.PI * 2 + Math.random() * 0.4;
      const segs = 6;
      const pts = [];
      for (let s = 0; s <= segs; s++) {
        const r = (s / segs) * CHERRY_RADIUS;
        const j = s === 0 ? 0 : 0.55;
        pts.push(new THREE.Vector3(
          pos.x + Math.cos(ang) * r + (Math.random() - 0.5) * j,
          0.25 + Math.random() * 0.5 * (s / segs),
          pos.z + Math.sin(ang) * r + (Math.random() - 0.5) * j,
        ));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      g.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false })));
    }
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(CHERRY_RADIUS * 0.8, CHERRY_RADIUS, 36),
      new THREE.MeshBasicMaterial({ color: 0x4fb0ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2; ring.position.set(pos.x, 0.12, pos.z);
    g.add(ring);
    this.#scene.add(g);
    this.#fx.push({ mesh: g, t: 0, dur: 0.5, bolt: true });
  }
  #blast(pos, r) { void pos; void r; } // superseded by the shared fx:explosion effect
  #fx = [];

  fixedUpdate() {}

  lateUpdate(dt) {
    for (let i = this.#fx.length - 1; i >= 0; i--) {
      const f = this.#fx[i];
      f.t += dt; const k = f.t / f.dur;
      if (f.bolt) {
        const fade = Math.max(0, 1 - k) * (0.55 + Math.random() * 0.45); // electric flicker
        f.mesh.traverse((o) => { if (o.material) o.material.opacity = fade; });
      } else {
        f.mesh.scale.setScalar(0.2 + k * f.size);
        f.mesh.material.opacity = Math.max(0, (1 - k) * 0.9);
      }
      if (k >= 1) {
        f.mesh.traverse?.((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
        this.#scene.remove(f.mesh);
        this.#fx.splice(i, 1);
      }
    }
  }

  #reset() {
    if (this.#downed) { this.#downed = false; this.#events.emit('fx:downed', { on: false }); }
    this.#owned.clear();
    this.#muleStash = null;
    this.#changeGiven.clear();
    this.#drinking = false; this.#pending = null;
    this.#events.emit('perk:drink', { active: false });
    this.#events.emit('perks:reset', {});
  }
}
