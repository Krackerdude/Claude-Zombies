import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Service } from '../core/ServiceLocator.js';
import { Transform, ZombieTag, RigidBodyRef, Renderable, PlayerTag } from '../ecs/components/index.js';
import { PlayerCombat } from '../config/zombies.js';
import { damageZombie } from './damage.js';
import { severHead } from '../ai/dismember.js';

const PROC_CHANCE = 0.10;   // per-shot proc chance once off cooldown
const COOLDOWN = 8.0;       // seconds before the next proc is possible

const _v = new THREE.Vector3();

/**
 * Alternate Ammo Types (Re-Pack). Owns the proc gate (WeaponSystem calls
 * tryProc on the zombie you hit) and every AAT's gameplay + stylised FX:
 *
 *   napalm     — ignite the target + a few neighbours; they burn, then
 *                disintegrate to ash
 *   turned     — the target joins your side, instant-killing other zombies for
 *                5s, then collapses + melts
 *   fireworks  — the target's head bursts into a 3s firework show that shreds
 *                nearby zombies; the body melts
 *   thunderwall— a thundergun blast erupts behind the target, launching the
 *                cone of zombies away
 *   cryo       — the target + neighbours freeze in ice; any shot shatters them
 *   mend       — the target is smited; a holy ring scorches zombies + heals the
 *                player standing in it
 *   rift       — the target + neighbours are dragged up into a shadow rift and
 *                burst apart
 *
 * Custom deaths skip the normal ragdoll: the entity is held (state 'dead') while
 * its death animation plays, then reaped. Self-contained additive FX (no dynamic
 * lights -> no shader recompiles).
 */
export class AATSystem extends System {
  #events; #time; #scene; #spawn; #hounds; #pu; #camera;
  #fx = [];       // transient FX records: { group, age, life, kind, ... }
  #areas = [];    // persistent Light Mend areas: { x, z, t, life, group, r }
  #emitters = []; // active firework emitters: { id, t, life }

  init() {
    const s = this.world.services;
    this.#events = s.get(Service.Events);
    this.#time = s.get(Service.Time);
    this.#scene = s.get(Service.Scene).scene;
    this.#spawn = s.get(Service.Spawn);
    this.#hounds = s.has(Service.Hounds) ? s.get(Service.Hounds) : null;
    this.#pu = s.has(Service.Powerups) ? s.get(Service.Powerups) : null;
    this.#camera = s.get(Service.Render).camera;
  }

  #player() { const id = this.world.first(PlayerTag); return id !== undefined ? this.world.get(id, PlayerTag) : null; }
  #ctx() { return { world: this.world, spawn: this.#spawn, events: this.#events, player: this.#player() || { points: 0 } }; }

  // ===================== proc gate =====================
  /** Called by WeaponSystem when a shot hits a zombie. Rolls the cooldown-gated
   *  proc; returns true if it fired (so the HUD can pulse). */
  tryProc(weapon, zid, dir) {
    if (!weapon?.aat) return false;
    const z = this.world.get(zid, ZombieTag);
    if (!z || z.hound || z.state === 'dead') return false; // AATs don't apply to hellhounds
    const now = this.#time.elapsed;
    if (now < weapon.aatReadyAt) return false;
    if (Math.random() >= PROC_CHANCE) return false;
    weapon.aatReadyAt = now + COOLDOWN;
    this.#trigger(weapon.aat, zid, dir || { x: 0, z: 1 });
    this.#events.emit('weapon:aatproc', { aat: weapon.aat });
    return true;
  }

  #trigger(aat, zid, dir) {
    const z = this.world.get(zid, ZombieTag);
    const t = this.world.get(zid, Transform);
    if (!z || !t || z.state === 'dead') return;
    switch (aat) {
      case 'napalm': this.#napalm(zid, z, t); break;
      case 'turned': this.#turn(zid, z, t); break;
      case 'fireworks': this.#fireworks(zid, z, t); break;
      case 'thunderwall': this.#thunderwall(zid, z, t, dir); break;
      case 'cryo': this.#cryo(zid, z, t); break;
      case 'mend': this.#mend(zid, z, t); break;
      case 'rift': this.#rift(zid, z, t); break;
    }
  }

  // ===================== effects =====================
  #napalm(zid, z, t) {
    this.#ignite(zid, z);
    for (const id of this.#nearby(t.position.x, t.position.z, 4.0, 5, zid)) this.#ignite(id, this.world.get(id, ZombieTag));
  }
  #ignite(id, z) {
    if (!z || z.burning || z.aatDying || z.state === 'dead' || z.hound) return;
    z.burning = true; z.burnT = 0;
    const rig = this.world.get(id, Renderable)?.object3d;
    if (rig) z._fire = this.#attachFlames(rig);
    const t = this.world.get(id, Transform);
    if (t) { this.#burst(t.position.x, 1.1, t.position.z, 0xffd070, 10, 3.5); this.#burst(t.position.x, 1.1, t.position.z, 0xff4a10, 8, 2.4); } // whoosh of ignition
  }

  #turn(zid, z, t) {
    if (z.hound) return; // hounds can't be turned
    z.turned = 5.0; z.frozen = 0; z.burning = false;
    z.state = 'pathing'; z.swipe = 0;
    const rig = this.world.get(zid, Renderable)?.object3d;
    if (rig && !z._aura) z._aura = this.#attachAura(rig, 0x4ade5a);
    this.#burst(t.position.x, 1.0, t.position.z, 0x4ade5a, 14, 3);
  }

  #fireworks(zid, z, t) {
    // pop the head, then run a 3s firework show from the neck before the body melts
    const rig = this.world.get(zid, Renderable)?.object3d;
    if (rig) { const at = severHead(rig); if (at) this.#events.emit('zombie:gib', { ...at, dir: { x: 0, z: 1 }, count: 10, speed: 3.4 }); }
    this.#beginDeath(zid, z, 'fireworks');
    z.aatDyingT = 0;
    this.#emitters.push({ id: zid, t: 0, life: 3.0, tick: 0 });
  }

  #thunderwall(zid, z, t, dir) {
    // a blast that erupts BEHIND the target (away from the player) and launches
    // that cone of zombies off their feet
    const p = this.#player();
    const pp = this.#camera.position;
    let ax = t.position.x - pp.x, az = t.position.z - pp.z;
    const m = Math.hypot(ax, az) || 1; ax /= m; az /= m; // player -> target = blast direction
    const ox = t.position.x + ax * 0.6, oz = t.position.z + az * 0.6;
    this.#shockRing(ox, oz, 0x7fdcff);
    this.#events.emit('fx:shake', {});
    const ctx = this.#ctx();
    for (const id of [...this.world.query(ZombieTag, Transform)]) {
      const zt = this.world.get(id, Transform);
      let dx = zt.position.x - ox, dz = zt.position.z - oz;
      const d = Math.hypot(dx, dz);
      if (d > 7) continue;
      const facing = (dx / (d || 1)) * ax + (dz / (d || 1)) * az;
      if (d > 0.5 && facing < 0.2) continue; // only the cone in the blast direction
      damageZombie(ctx, id, 1e9, { award: true, dir: { x: ax, z: az }, force: 3.2 }); // launch the ragdoll
    }
  }

  #cryo(zid, z, t) {
    this.#freeze(zid, z);
    for (const id of this.#nearby(t.position.x, t.position.z, 4.5, 6, zid)) this.#freeze(id, this.world.get(id, ZombieTag));
    this.#burst(t.position.x, 1.0, t.position.z, 0x9fe6ff, 16, 2.4);
  }
  #freeze(id, z) {
    if (!z || z.frozen > 0 || z.aatDying || z.state === 'dead' || z.hound) return;
    z.frozen = 8.0; z.swipe = 0; z.burning = false; z.turned = 0;
    const rig = this.world.get(id, Renderable)?.object3d;
    if (rig && !z._ice) z._ice = this.#attachIce(rig);
  }
  /** Called from damage.js when a frozen zombie is shot: shatter + reap. */
  shatter(id, dir) {
    const z = this.world.get(id, ZombieTag);
    const t = this.world.get(id, Transform);
    if (!z || !t) return;
    this.#iceShards(t.position.x, 1.0, t.position.z);
    this.#detachIce(z);
    this.#creditKill(id, z, true);
    this.#dropBody(id); // remove the kinematic capsule, else a phantom collider lingers
    this.world.remove(id, ZombieTag);
    this.world.destroyEntity(id);
  }

  #mend(zid, z, t) {
    this.#smite(t.position.x, t.position.z);
    this.#beginDeath(zid, z, 'ash'); // smited to nothing
    this.#areas.push({ x: t.position.x, z: t.position.z, t: 0, life: 6.0, r: 2.6, group: this.#mendArea(t.position.x, t.position.z, 2.6), dps: 0 });
  }

  #rift(zid, z, t) {
    const cx = t.position.x, cz = t.position.z;
    this.#riftDisc(cx, cz);
    this.#pullIn(zid, z, cx, cz);
    for (const id of this.#nearby(cx, cz, 4.2, 5, zid)) this.#pullIn(id, this.world.get(id, ZombieTag), cx, cz);
  }
  #pullIn(id, z, cx, cz) {
    if (!z || z.rifting > 0 || z.aatDying || z.state === 'dead') return;
    z.rifting = 1.3; z.riftX = cx; z.riftZ = cz; z.swipe = 0; z.burning = false; z.frozen = 0;
    z.state = 'dead'; // held; AATSystem owns it now
    this.#dropBody(id);
  }

  // ===================== per-frame ticking =====================
  update(dt) {
    if (!this.world.services.get(Service.GameState).isPlaying) return;
    this.#tickFx(dt);
    this.#tickAreas(dt);
    this.#tickEmitters(dt);

    for (const id of [...this.world.query(ZombieTag, Transform)]) {
      const z = this.world.get(id, ZombieTag);
      if (z.burning) this.#tickBurning(id, z, dt);
      else if (z.aatDying) this.#tickDying(id, z, dt);
      else if (z.rifting > 0) this.#tickRift(id, z, dt);
      else if (z.frozen > 0) { z.frozen -= dt; if (z.frozen <= 0) this.#thaw(id, z); }
      else if (z.turned > 0) { z.turned -= dt; if (z.turned <= 0) this.#collapseTurned(id, z); }
    }
  }

  #tickBurning(id, z, dt) {
    z.burnT += dt;
    const t = this.world.get(id, Transform);
    // flicker the attached fire — each tongue breathes on its own phase, leaning
    // in the wind; the core glow pulses
    const fire = z._fire;
    if (fire?.userData.tongues) {
      fire.userData.t += dt;
      const tt = fire.userData.t;
      for (const f of fire.userData.tongues) {
        const ph = f.userData.ph;
        f.scale.set(0.8 + 0.25 * Math.sin(tt * 9 + ph), Math.max(0.25, 0.65 + 0.55 * Math.sin(tt * 13 + ph)), 0.8 + 0.25 * Math.cos(tt * 11 + ph));
        f.position.x = f.userData.sway + Math.sin(tt * 7 + ph) * 0.06;
      }
      if (fire.userData.core) fire.userData.core.scale.setScalar(0.85 + 0.25 * Math.sin(tt * 10));
    }
    // rising embers + occasional rolling smoke
    if (t) {
      if (Math.random() < dt * 16) this.#ember(t.position.x + (Math.random() - 0.5) * 0.5, 0.5 + Math.random() * 1.4, t.position.z + (Math.random() - 0.5) * 0.5);
      if (Math.random() < dt * 4) this.#smokePuff(t.position.x + (Math.random() - 0.5) * 0.3, 1.7 + Math.random() * 0.4, t.position.z + (Math.random() - 0.5) * 0.3);
    }
    if (z.burnT >= 1.15) { z.burning = false; this.#detachFlames(z); this.#beginDeath(id, z, 'ash'); }
  }

  #tickDying(id, z, dt) {
    z.aatDyingT += dt;
    const life = z.aatDying === 'fireworks' ? 3.0 : z.aatDying === 'meltdown' ? 1.3 : 0.75;
    if (z.aatDying === 'ash') { // crumble to drifting ash + a few last embers (pose owns the squash)
      const t = this.world.get(id, Transform);
      if (t) {
        if (Math.random() < dt * 22) this.#ashFlake(t.position.x + (Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 1.2, t.position.z + (Math.random() - 0.5) * 0.6);
        if (Math.random() < dt * 8) this.#ember(t.position.x + (Math.random() - 0.5) * 0.4, 0.4 + Math.random() * 0.9, t.position.z + (Math.random() - 0.5) * 0.4);
      }
    }
    if (z.aatDyingT >= life) { this.#creditKill(id, z); this.world.remove(id, ZombieTag); this.world.destroyEntity(id); }
  }

  #tickRift(id, z, dt) {
    z.rifting -= dt;
    const t = this.world.get(id, Transform);
    if (t) {
      // drift toward the rift centre and rise
      t.position.x += (z.riftX - t.position.x) * Math.min(1, dt * 2);
      t.position.z += (z.riftZ - t.position.z) * Math.min(1, dt * 2);
      t.position.y += dt * 2.4;
    }
    if (z.rifting <= 0 && t) {
      this.#events.emit('zombie:gib', { x: t.position.x, y: t.position.y + 0.6, z: t.position.z, dir: null, count: 20, speed: 5.0, scale: 1.1 });
      this.#burst(t.position.x, t.position.y + 0.6, t.position.z, 0xb26cff, 12, 3);
      this.#creditKill(id, z); this.world.remove(id, ZombieTag); this.world.destroyEntity(id);
    }
  }

  #collapseTurned(id, z) { this.#detachAura(z); this.#beginDeath(id, z, 'meltdown'); }
  #thaw(id, z) { this.#detachIce(z); z.frozen = 0; }

  #tickEmitters(dt) {
    for (let i = this.#emitters.length - 1; i >= 0; i--) {
      const e = this.#emitters[i];
      e.t += dt; e.tick -= dt;
      const t = this.world.get(e.id, Transform);
      if (!t || e.t >= e.life) { this.#emitters.splice(i, 1); continue; }
      if (e.tick <= 0) {
        e.tick = 0.22;
        const hx = t.position.x, hy = t.position.y + 1.7, hz = t.position.z;
        this.#firework(hx, hy, hz);
        // shred nearby zombies in pulses
        const ctx = this.#ctx();
        for (const id of this.#nearby(hx, hz, 5, 4, e.id)) damageZombie(ctx, id, 240, { award: true, dir: null });
      }
    }
  }

  #tickAreas(dt) {
    const player = this.#player();
    const pp = this.#camera.position;
    for (let i = this.#areas.length - 1; i >= 0; i--) {
      const a = this.#areas[i];
      a.t += dt;
      const k = a.t / a.life;
      if (a.group) { a.group.rotation.y += dt * 0.8; a.group.traverse((o) => { if (o.material && o.material.transparent) o.material.opacity = 0.55 * (1 - k * 0.4); }); }
      // damage zombies inside, heal the player inside
      const ctx = this.#ctx();
      a.dps = (a.dps || 0) + dt;
      if (a.dps >= 0.25) {
        a.dps = 0;
        for (const id of [...this.world.query(ZombieTag, Transform)]) {
          const zt = this.world.get(id, Transform);
          if (Math.hypot(zt.position.x - a.x, zt.position.z - a.z) <= a.r) damageZombie(ctx, id, 160, { award: true, dir: null });
        }
      }
      if (player && Math.hypot(pp.x - a.x, pp.z - a.z) <= a.r && player.health < player.maxHealth) {
        player.health = Math.min(player.maxHealth, player.health + 60 * dt);
        this.#events.emit('player:health', { health: Math.round(player.health), max: player.maxHealth });
      }
      if (a.t >= a.life) { if (a.group) this.#scene.remove(a.group); this.#areas.splice(i, 1); }
    }
  }

  // ===================== shared helpers =====================
  #beginDeath(id, z, mode) {
    z.state = 'dead'; z.aatDying = mode; z.aatDyingT = 0; z.swipe = 0;
    z.burning = false; z.frozen = 0; z.turned = 0; z.rifting = 0;
    this.#dropBody(id);
  }
  #dropBody(id) {
    const ref = this.world.get(id, RigidBodyRef);
    if (ref) { this.world.services.get(Service.Physics).removeBody(ref); this.world.remove(id, RigidBodyRef); }
  }
  #creditKill(id, z, headshot = false) {
    if (z._credited) return; z._credited = true;
    const t = this.world.get(id, Transform);
    const x = t ? t.position.x : 0, zz = t ? t.position.z : 0;
    const player = this.#player();
    const mul = this.#pu ? this.#pu.pointsMultiplier() : 1;
    if (player) { player.points += PlayerCombat.pointsKillBody * mul; this.#events.emit('score:changed', { points: player.points }); }
    if (z.hound) this.#hounds?.notifyKilled(x, zz); else this.#spawn.notifyKilled();
    this.#events.emit('zombie:killed', { headshot, x, z: zz, hound: z.hound });
  }
  #nearby(x, z, radius, max, excludeId) {
    const out = [];
    for (const id of this.world.query(ZombieTag, Transform)) {
      if (id === excludeId) continue;
      const zz = this.world.get(id, ZombieTag);
      if (zz.hound || zz.state === 'dead' || zz.aatDying || zz.burning || zz.frozen > 0 || zz.rifting > 0 || zz.turned > 0) continue;
      const t = this.world.get(id, Transform);
      const d = Math.hypot(t.position.x - x, t.position.z - z);
      if (d <= radius) out.push({ id, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out.slice(0, max).map((o) => o.id);
  }

  // ===================== FX (additive meshes, no dynamic lights) =====================
  #mkAdd(color, opacity = 0.95) { return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }); }

  #attachFlames(rig) {
    const g = new THREE.Group();
    const tongues = [];
    // a layered fire: a hot deep-red base, orange mid tongues, yellow tips, all
    // engulfing the whole body and flickering independently
    const cols = [0xff2204, 0xff2204, 0xff5a10, 0xff8a18, 0xffc23a, 0xffe87a];
    for (let i = 0; i < 11; i++) {
      const c = cols[(Math.random() * cols.length) | 0];
      const h = 0.45 + Math.random() * 0.8;
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.09 + Math.random() * 0.09, h, 6, 1, true), this.#mkAdd(c, 0.8));
      f.position.set((Math.random() - 0.5) * 0.55, 0.25 + Math.random() * 1.0, (Math.random() - 0.5) * 0.45);
      f.userData.ph = Math.random() * 6.28; f.userData.sway = f.position.x;
      g.add(f); tongues.push(f);
    }
    // a soft white-hot core glow at the chest so the silhouette reads as ablaze
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), this.#mkAdd(0xff7a20, 0.35));
    core.position.y = 0.9; g.add(core);
    g.userData.tongues = tongues; g.userData.core = core; g.userData.t = 0;
    g.traverse((o) => { o.raycast = () => {}; });
    rig.add(g); return g;
  }
  #detachFlames(z) { if (z._fire) { z._fire.parent?.remove(z._fire); z._fire = null; } }

  #attachAura(rig, color) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 24), this.#mkAdd(color, 0.85));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.1; g.add(ring);
    g.traverse((o) => { o.raycast = () => {}; });
    rig.add(g); return g;
  }
  #detachAura(z) { if (z._aura) { z._aura.parent?.remove(z._aura); z._aura = null; } }

  #attachIce(rig) {
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), new THREE.MeshStandardMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.0, emissive: 0x2a6a9a, emissiveIntensity: 0.4, flatShading: true }));
    shell.position.y = 1.0; shell.scale.set(1, 1.7, 1);
    shell.raycast = () => {};
    rig.add(shell); return shell;
  }
  #detachIce(z) { if (z._ice) { z._ice.parent?.remove(z._ice); z._ice = null; } }

  #iceShards(x, y, z) {
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xbfeeff, transparent: true, opacity: 0.9, roughness: 0.1, emissive: 0x2a6a9a, emissiveIntensity: 0.4, flatShading: true });
      const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.1 + Math.random() * 0.12), mat);
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4;
      s.position.set(x, y, z); s.raycast = () => {};
      this.#scene.add(s);
      this.#fx.push({ mesh: s, age: 0, life: 0.8 + Math.random() * 0.5, vx: Math.cos(a) * sp, vy: 2 + Math.random() * 3, vz: Math.sin(a) * sp, grav: 12, spin: 8 });
    }
  }

  /** A single bright ember that floats up and fades. */
  #ember(x, y, z) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.035 + Math.random() * 0.03, 5, 4), this.#mkAdd(Math.random() < 0.5 ? 0xffb030 : 0xff7020));
    m.position.set(x, y, z); m.raycast = () => {};
    this.#scene.add(m);
    const a = Math.random() * Math.PI * 2, sp = 0.3 + Math.random() * 0.5;
    this.#fx.push({ mesh: m, age: 0, life: 0.8 + Math.random() * 0.7, vx: Math.cos(a) * sp, vy: 1.0 + Math.random() * 1.3, vz: Math.sin(a) * sp, grav: 0.6 });
  }

  /** A dark rolling smoke puff (normal-blended so it reads as shadow, not glow). */
  #smokePuff(x, y, z) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x1a1410, transparent: true, opacity: 0.5, depthWrite: false });
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat);
    m.position.set(x, y, z); m.raycast = () => {};
    this.#scene.add(m);
    this.#fx.push({ mesh: m, age: 0, life: 1.0 + Math.random() * 0.6, vx: (Math.random() - 0.5) * 0.4, vy: 0.7 + Math.random() * 0.5, vz: (Math.random() - 0.5) * 0.4, grav: -0.3, grow: 2.2 });
  }

  /** A charred ash flake that lifts on the heat, tumbles, and crumbles away. */
  #ashFlake(x, y, z) {
    const mat = new THREE.MeshBasicMaterial({ color: Math.random() < 0.4 ? 0x3a3430 : 0x14110f, transparent: true, opacity: 0.9, depthWrite: false });
    const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.05 + Math.random() * 0.06), mat);
    m.position.set(x, y, z); m.raycast = () => {};
    this.#scene.add(m);
    const a = Math.random() * Math.PI * 2, sp = 0.3 + Math.random() * 0.6;
    this.#fx.push({ mesh: m, age: 0, life: 1.0 + Math.random() * 0.8, vx: Math.cos(a) * sp, vy: 0.6 + Math.random() * 1.0, vz: Math.sin(a) * sp, grav: 0.4, spin: 6 });
  }

  /** A radial spark/ember burst at a point. */
  #burst(x, y, z, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), this.#mkAdd(color));
      m.position.set(x, y, z); m.raycast = () => {};
      this.#scene.add(m);
      const a = Math.random() * Math.PI * 2, e = Math.acos(2 * Math.random() - 1), sp = speed * (0.4 + Math.random());
      this.#fx.push({ mesh: m, age: 0, life: 0.4 + Math.random() * 0.4, vx: Math.sin(e) * Math.cos(a) * sp, vy: Math.cos(e) * sp, vz: Math.sin(e) * Math.sin(a) * sp, grav: 3, kind: 'spark', solo: true });
    }
  }

  #firework(x, y, z) {
    const cols = [0xff48b0, 0x7fdcff, 0xffe24a, 0x8bff9b, 0xff6a18];
    const col = cols[(Math.random() * cols.length) | 0];
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), this.#mkAdd(col));
      m.position.set(x, y, z); m.raycast = () => {};
      this.#scene.add(m);
      const a = Math.random() * Math.PI * 2, e = Math.acos(2 * Math.random() - 1), sp = 4 + Math.random() * 4;
      this.#fx.push({ mesh: m, age: 0, life: 0.5 + Math.random() * 0.4, vx: Math.sin(e) * Math.cos(a) * sp, vy: Math.cos(e) * sp, vz: Math.sin(e) * Math.sin(a) * sp, grav: 6, kind: 'spark', solo: true });
    }
  }

  #shockRing(x, z, color) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.12, 8, 28), this.#mkAdd(color, 0.9));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.3, z); ring.raycast = () => {};
    this.#scene.add(ring);
    this.#fx.push({ mesh: ring, age: 0, life: 0.5, kind: 'ring', solo: true, grow: 10 });
  }

  #smite(x, z) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 8, 16, 1, true), this.#mkAdd(0xfff2b0, 0.85));
    beam.position.set(x, 4, z); beam.raycast = () => {};
    this.#scene.add(beam);
    this.#fx.push({ mesh: beam, age: 0, life: 0.5, kind: 'beam', solo: true });
  }

  #mendArea(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0.04, z);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.6, 36), this.#mkAdd(0xfff2b0, 0.4));
    disc.rotation.x = -Math.PI / 2; g.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.06, 8, 40), this.#mkAdd(0xfff7d0, 0.6));
    ring.rotation.x = -Math.PI / 2; g.add(ring);
    // a few light pillars around the rim
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), this.#mkAdd(0xfff2b0, 0.5)); p.position.set(Math.cos(a) * 2.3, 1.2, Math.sin(a) * 2.3); g.add(p); }
    g.traverse((o) => { o.raycast = () => {}; });
    this.#scene.add(g); return g;
  }

  #riftDisc(x, z) {
    const g = new THREE.Group(); g.position.set(x, 2.8, z);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), this.#mkAdd(0x2a0a4a, 0.9));
    disc.rotation.x = -Math.PI / 2; g.add(disc);
    for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.7 + i * 0.35, 0.07, 8, 28), this.#mkAdd(0xb26cff, 0.7)); r.rotation.x = -Math.PI / 2; g.add(r); }
    g.traverse((o) => { o.raycast = () => {}; });
    this.#scene.add(g);
    this.#fx.push({ group: g, age: 0, life: 1.8, kind: 'rift', spin: 4 });
  }

  #tickFx(dt) {
    for (let i = this.#fx.length - 1; i >= 0; i--) {
      const f = this.#fx[i];
      f.age += dt;
      const k = Math.min(1, f.age / f.life);
      const obj = f.mesh || f.group;
      if (f.vx != null) { f.vy -= (f.grav || 0) * dt; obj.position.x += f.vx * dt; obj.position.y += f.vy * dt; obj.position.z += f.vz * dt; }
      if (f.spin) { obj.rotation.y += f.spin * dt; obj.rotation.x += f.spin * 0.4 * dt; }
      if (f.grow) obj.scale.setScalar(1 + k * f.grow);
      // fade every additive material toward 0 (remember each base opacity once)
      obj.traverse((o) => {
        const m = o.material;
        if (!m || !m.transparent) return;
        if (m.userData._o0 == null) m.userData._o0 = m.opacity;
        m.opacity = Math.max(0, m.userData._o0 * (1 - k));
      });
      if (k >= 1) { this.#scene.remove(obj); this.#fx.splice(i, 1); }
    }
  }
}
