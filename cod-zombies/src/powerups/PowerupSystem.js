import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Service } from '../core/ServiceLocator.js';
import { Transform, Renderable, PlayerTag, ZombieTag, PowerupTag } from '../ecs/components/index.js';
import { buildPowerupModel } from './powerups.js';
import { damageZombie } from '../weapons/damage.js';

const UP = new THREE.Vector3(0, 1, 0);

const CYCLE = ['doublePoints', 'instaKill', 'nuke', 'carpenter'];
const STANDALONE = ['zombieBlood', 'bloodMoney'];
const NAMES = {
  doublePoints: 'DOUBLE POINTS', instaKill: 'INSTA-KILL', nuke: 'NUKE',
  carpenter: 'CARPENTER', zombieBlood: 'ZOMBIE BLOOD', bloodMoney: 'BLOOD MONEY',
};
const DURATION = { doublePoints: 20, instaKill: 20, zombieBlood: 30 }; // timed power-ups
const DROP_CHANCE = 0.02;
const MAX_PER_ROUND = 4;
const PICKUP_RADIUS = 1.7;
const FLOAT_Y = 0.95; // waist height
const LIFETIME = 25;
// Every material we've tinted for Zombie Blood, mapped to its original emissive.
// A real (iterable) Map — NOT a WeakMap keyed off live zombies — so we can revert
// ALL of them on expiry even if the zombies wearing a (shared/pooled) material
// have since died (otherwise that material stays stuck yellow forever).
const _tintMap = new Map();

/**
 * Power-up drops + effects. ~2% of kills drop one (max 4/round). The four core
 * power-ups cycle (none repeats until all four have dropped); Zombie Blood and
 * Blood Money sit outside the cycle. Floating gold pickups are collected by
 * walking over them. Exposes pointsMultiplier()/instaKill/zombieBlood for the
 * damage + AI systems to read.
 */
export class PowerupSystem extends System {
  #events; #gameState; #scene; #camera; #nav; #spawn; #time;
  #active = new Map();      // type -> seconds remaining
  #cycleUsed = new Set();
  #dropsThisRound = 0;
  #suppressDrops = false;
  #fx = [];                 // transient explosion meshes

  // --- read by other systems ---
  pointsMultiplier() { return this.#active.has('doublePoints') ? 2 : 1; }
  get instaKill() { return this.#active.has('instaKill'); }
  get zombieBlood() { return this.#active.has('zombieBlood'); }

  init() {
    const s = this.world.services;
    this.#events = s.get(Service.Events);
    this.#gameState = s.get(Service.GameState);
    this.#scene = s.get(Service.Scene).scene;
    this.#camera = s.get(Service.Render).camera;
    this.#nav = s.get(Service.Nav);
    this.#spawn = s.get(Service.Spawn);
    this.#time = s.get(Service.Time);

    this.#events.on('zombie:killed', ({ x, z }) => { if (!this.#suppressDrops) this.#rollDrop(x, z); });
    this.#events.on('round:changed', () => { this.#dropsThisRound = 0; });
    this.#events.on('state:change', ({ state }) => { if (state === 'menu') this.#clearAll(); });
  }

  #rollDrop(x, z) {
    // never drop outside the walls (building half-extent 10) — must be reachable
    if (Math.abs(x) > 9.3 || Math.abs(z) > 9.3) return;
    if (this.#dropsThisRound >= MAX_PER_ROUND || Math.random() > DROP_CHANCE) return;
    const avail = CYCLE.filter((t) => !this.#cycleUsed.has(t));
    const cands = [...STANDALONE, ...(avail.length ? avail : CYCLE)];
    const type = cands[(Math.random() * cands.length) | 0];
    if (CYCLE.includes(type)) {
      this.#cycleUsed.add(type);
      if (this.#cycleUsed.size >= CYCLE.length) this.#cycleUsed.clear(); // cycle complete
    }
    this.#dropsThisRound++;
    const id = this.world.createEntity();
    this.world.add(id, new Transform({ x, y: FLOAT_Y, z }));
    this.world.add(id, new Renderable(buildPowerupModel(type), { interpolate: false }));
    this.world.add(id, new PowerupTag(type));
  }

  update(dt) {
    // float + spin pickups, blink them out near end of life
    for (const id of this.world.query(PowerupTag, Transform, Renderable)) {
      const p = this.world.get(id, PowerupTag);
      const t = this.world.get(id, Transform);
      const obj = this.world.get(id, Renderable).object3d;
      p.life += dt;
      t.position.y = FLOAT_Y + Math.sin(p.life * 2.2) * 0.08;
      t.quaternion.setFromAxisAngle(UP, p.life * 1.6);
      if (p.life > LIFETIME - 5) obj.visible = Math.floor(p.life * 6) % 2 === 0;
      if (p.life > LIFETIME) this.world.destroyEntity(id);
    }
    // transient nuke explosion
    for (let i = this.#fx.length - 1; i >= 0; i--) {
      const f = this.#fx[i];
      f.t += dt;
      const k = f.t / f.dur;
      f.mesh.scale.setScalar(0.3 + k * f.size);
      f.mesh.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) { this.#scene.remove(f.mesh); this.#fx.splice(i, 1); }
    }
    if (this.#active.has('zombieBlood')) this.#setTint(true);
  }

  fixedUpdate(dt) {
    if (!this.#gameState.isPlaying) return;
    const pid = this.world.first(PlayerTag, Transform);
    if (pid === undefined) return;
    const player = this.world.get(pid, PlayerTag);
    const pp = this.world.get(pid, Transform).position;

    // tick active timers
    for (const [type, rem] of [...this.#active]) {
      const left = rem - dt;
      if (left <= 0) { this.#active.delete(type); this.#onExpire(type); }
      else this.#active.set(type, left);
    }

    // pickup by proximity
    for (const id of [...this.world.query(PowerupTag, Transform)]) {
      const t = this.world.get(id, Transform).position;
      const dx = t.x - pp.x, dz = t.z - pp.z, dy = t.y - pp.y;
      if (dx * dx + dz * dz + dy * dy < PICKUP_RADIUS * PICKUP_RADIUS) {
        const type = this.world.get(id, PowerupTag).type;
        this.world.destroyEntity(id);
        this.#apply(type, player, pp);
      }
    }
  }

  #apply(type, player, pos) {
    this.#events.emit('powerup:pickup', { type, name: NAMES[type] });
    switch (type) {
      case 'doublePoints': this.#activate('doublePoints'); break;
      case 'instaKill': this.#activate('instaKill'); break;
      case 'zombieBlood': this.#activate('zombieBlood'); this.#events.emit('fx:zombieblood', { on: true }); break;
      case 'carpenter':
        for (const b of this.#nav.barriers) { b.boards = b.maxBoards; b.tearAcc = 0; b.repairAcc = 0; this.#events.emit('barrier:changed', { id: b.id, boards: b.boards }); }
        this.#events.emit('nav:changed', { reset: true });
        this.#award(player, 200);
        break;
      case 'bloodMoney': this.#award(player, (1 + ((Math.random() * 5) | 0)) * 500); break; // 500..2500
      case 'nuke': this.#nuke(player, pos); break;
    }
  }

  #activate(type) {
    this.#active.set(type, DURATION[type]);
    this.#events.emit('powerup:active', { type, name: NAMES[type], duration: DURATION[type] });
  }

  #onExpire(type) {
    this.#events.emit('powerup:expire', { type });
    if (type === 'zombieBlood') { this.#setTint(false); this.#events.emit('fx:zombieblood', { on: false }); }
  }

  #award(player, base) {
    player.points += base * this.pointsMultiplier();
    this.#events.emit('score:changed', { points: player.points });
  }

  #nuke(player, pos) {
    this.#suppressDrops = true;
    const ctx = { world: this.world, spawn: this.#spawn, events: this.#events, player };
    for (const id of [...this.world.query(ZombieTag)]) damageZombie(ctx, id, 1e9, { award: false, dir: { x: Math.random() - 0.5, z: Math.random() - 0.5 } });
    this.#suppressDrops = false;
    this.#award(player, 400);
    // little flash sphere at the drop + screen flash + shake
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    flash.position.set(pos.x, 1.0, pos.z);
    this.#scene.add(flash);
    this.#fx.push({ mesh: flash, t: 0, dur: 0.6, size: 6 });
    this.#events.emit('fx:flash', {});
    this.#events.emit('fx:shake', {});
  }

  #setTint(on) {
    if (on) {
      // tint every live zombie yellow, remembering each material's original
      // emissive the first time we touch it (new spawns get caught next frame).
      for (const id of this.world.query(ZombieTag, Renderable)) {
        this.world.get(id, Renderable).object3d.traverse((o) => {
          if (!o.isMesh || !o.material?.emissive) return;
          if (!_tintMap.has(o.material)) _tintMap.set(o.material, { c: o.material.emissive.getHex(), i: o.material.emissiveIntensity });
          o.material.emissive.setHex(0xffe23a);
          o.material.emissiveIntensity = 0.7;
        });
      }
    } else {
      // restore EVERY material we tinted, regardless of which zombies survive.
      for (const [mat, v] of _tintMap) { mat.emissive.setHex(v.c); mat.emissiveIntensity = v.i; }
      _tintMap.clear();
    }
  }

  #clearAll() {
    if (this.#active.has('zombieBlood')) { this.#setTint(false); this.#events.emit('fx:zombieblood', { on: false }); }
    for (const t of [...this.#active.keys()]) this.#events.emit('powerup:expire', { type: t });
    this.#active.clear();
    this.#dropsThisRound = 0;
    for (const id of [...this.world.query(PowerupTag)]) this.world.destroyEntity(id);
    for (const f of this.#fx) this.#scene.remove(f.mesh);
    this.#fx.length = 0;
  }
}
