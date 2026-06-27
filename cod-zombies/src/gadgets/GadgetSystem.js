import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Service } from '../core/ServiceLocator.js';
import { Action } from '../config/keybinds.js';
import { Transform, PlayerTag, ZombieTag, Renderable, RigidBodyRef } from '../ecs/components/index.js';
import { damageZombie } from '../weapons/damage.js';
import { PlayerCombat, ZombieConfig } from '../config/zombies.js';
import { paintedMetal } from '../rendering/materials/surfaces.js';

// Shared frag-grenade parts, built once and reused by every throw. Body uses the
// shared painted-metal material (with its environment normal map) tinted military
// green; the fuze assembly is a darker shared metal.
let _nade = null;
function grenadeModel() {
  if (!_nade) {
    const body = paintedMetal(0x40592a); body.roughness = 0.5; body.metalness = 0.55;
    const steel = ps1Steel();
    _nade = {
      body, steel,
      bodyGeo: new THREE.SphereGeometry(0.062, 12, 10),
      collarGeo: new THREE.CylinderGeometry(0.04, 0.046, 0.02, 10),
      capGeo: new THREE.CylinderGeometry(0.03, 0.036, 0.03, 10),
      leverGeo: new THREE.BoxGeometry(0.012, 0.075, 0.024),
      ringGeo: new THREE.TorusGeometry(0.016, 0.005, 6, 12),
    };
  }
  const P = _nade;
  const g = new THREE.Group();
  const body = new THREE.Mesh(P.bodyGeo, P.body); body.scale.set(1, 1.28, 1); // ovoid frag body
  const collar = new THREE.Mesh(P.collarGeo, P.steel); collar.position.y = 0.074;
  const cap = new THREE.Mesh(P.capGeo, P.steel); cap.position.y = 0.097;
  const lever = new THREE.Mesh(P.leverGeo, P.steel); lever.position.set(0.038, 0.078, 0); lever.rotation.z = 0.1;
  const ring = new THREE.Mesh(P.ringGeo, P.steel); ring.position.set(-0.042, 0.09, 0); ring.rotation.y = Math.PI / 2;
  g.add(body, collar, cap, lever, ring);
  return g;
}
let _steel = null;
function ps1Steel() {
  _steel = _steel || new THREE.MeshStandardMaterial({ color: 0x1d201a, metalness: 0.75, roughness: 0.45 });
  return _steel;
}

const FUSE = 4.0;          // seconds from press to detonation (cooked or not)
const READY_TIME = 0.5;    // pin-pull + draw-to-hand before a throw can release (anti-spam)
const MAX_NADES = 4;
const NADES_PER_ROUND = 2;
const THROW_SPEED = 15;
const ARC_UP = 4.0;
const GRAVITY = 18;
const RADIUS = 4.5;        // blast radius (m)
const DAMAGE = 1300;       // center damage; falls off to the edge
// Semtex cluster: sticks to whatever it hits (ground / zombie), then on the
// blast flings three bomblets that airburst on the next ground touch
const SEMTEX = {
  mainRadius: 3.6, mainDamage: 1100,
  count: 3, bombletRadius: 2.8, bombletDamage: 700,
  stickDist: 0.7, // how close to a zombie it'll stick mid-flight
};
// Acid bomb: a contact grenade that lays a corrosive pool — dissolves legs into
// crawlers, then melts the whole zombie away if it lingers
const ACID = {
  poolRadius: 2.8, poolLife: 6.5, tick: 0.18,
  legTime: 1.0,   // exposure (s) before the legs dissolve -> crawler
  bodyTime: 2.6,  // a crawler this long in the acid melts away entirely
};
// WraithFire: a contact grenade that lays a pool of spectral blue fire
const WRAITH = {
  fuse: 3.0,             // safety fuse if it never touches ground
  poolRadius: 2.7,       // fire pool radius (m)
  poolLife: 5.0,         // seconds the fire burns
  tick: 0.2,             // damage cadence
  dmgPerTick: 650,       // immense — melts anything standing in it
};
const _fwd = new THREE.Vector3();

/**
 * Player gadgets: lethal grenades (G) and the flashlight (K).
 * Tap/hold G to cook a 4s grenade; release to throw it on an arc (it rolls).
 * Hold it the full 4s and it goes off in your hand — lethal to you. Each zombie
 * caught in a blast is worth 10 points, +50 more if the blast kills it.
 */
export class GadgetSystem extends System {
  #gameState; #actions; #input; #camera; #scene; #events; #spawn;
  #holding = false;
  #cookFuse = 0;
  #readyT = 0;
  #count = MAX_NADES; // start with a full 4
  #nadeCd = 0;
  #nades = [];
  #fx = [];
  #light = null;
  #lightOn = false;
  #lethalKind = 'frag'; // 'frag' | 'wraithfire' | 'semtex' | 'acid'
  #firePools = [];
  #burning = [];
  #acidPools = [];
  #melting = []; // zombie ids dissolving fully into the acid
  #physics = null;

  init() {
    const s = this.world.services;
    this.#gameState = s.get(Service.GameState);
    this.#actions = s.get(Service.Actions);
    this.#input = s.get(Service.Input);
    this.#camera = s.get(Service.Render).camera;
    this.#scene = s.get(Service.Scene).scene;
    this.#events = s.get(Service.Events);
    this.#spawn = s.get(Service.Spawn);
    this.#physics = s.has(Service.Physics) ? s.get(Service.Physics) : null;

    // flashlight: a powerful spotlight that follows the camera (off by default).
    // Long reach, wide cone, gentle falloff so it actually lights the arena.
    // (color, intensity[0=off], distance, angle, penumbra, decay)
    this.#light = new THREE.SpotLight(0xfff4d6, 0, 70, Math.PI / 4.2, 0.5, 1.0);
    this.#light.target = new THREE.Object3D();
    this.#scene.add(this.#light, this.#light.target);

    this.#events.on('state:change', ({ state }) => { if (state === 'menu') this.#clear(); });
    this.#events.on('round:changed', () => { this.#count = Math.min(MAX_NADES, this.#count + NADES_PER_ROUND); this.#emitCount(); });
    this.#emitCount();
  }

  /** Dev hook: swap the equipped lethal (replaces the grenade). Count is shared. */
  giveLethal(kind) {
    if (kind !== 'frag' && kind !== 'wraithfire' && kind !== 'semtex' && kind !== 'acid') return;
    this.#lethalKind = kind;
    this.#count = MAX_NADES;
    this.#events.emit('lethal:equip', { kind });
    this.#emitCount();
  }

  #emitCount() { this.#events.emit('lethal:count', { count: this.#count, kind: this.#lethalKind }); }

  update(dt) {
    this.#animateFx(dt);
    this.#tickFire(dt);
    this.#tickAcid(dt);
    if (!this.#gameState.isPlaying || !this.#input.pointerLocked) return;

    const pid = this.world.first(PlayerTag, Transform);
    if (pid === undefined) return;
    const player = this.world.get(pid, PlayerTag);
    const ppos = this.world.get(pid, Transform).position;

    // flashlight follows the camera
    this.#light.position.copy(this.#camera.position);
    _fwd.set(0, 0, -1).applyQuaternion(this.#camera.quaternion);
    this.#light.target.position.copy(this.#camera.position).addScaledVector(_fwd, 16);
    if (this.#actions.pressed(Action.FLASHLIGHT)) { this.#lightOn = !this.#lightOn; this.#light.intensity = this.#lightOn ? 11 : 0; }

    // lethal: start cooking on press, throw on release, blow up at fuse end
    if (this.#nadeCd > 0) this.#nadeCd = Math.max(0, this.#nadeCd - dt);
    if (!this.#holding && this.#nadeCd <= 0 && this.#count > 0 && this.#actions.pressed(Action.LETHAL)) {
      this.#holding = true; this.#cookFuse = FUSE; this.#readyT = READY_TIME; this.#count--;
      this.#events.emit('gadget:cook', { active: true, kind: this.#lethalKind });
      this.#emitCount();
    }
    if (this.#holding) {
      this.#cookFuse -= dt;
      this.#readyT = Math.max(0, this.#readyT - dt);
      if (this.#cookFuse <= 0) {
        // cooked too long — goes off in your hand (WraithFire torches your feet,
        // Acid pools under you; Semtex/Frag blast)
        if (this.#lethalKind === 'wraithfire') this.#ignitePool({ x: ppos.x, y: 0, z: ppos.z });
        else if (this.#lethalKind === 'acid') this.#igniteAcid({ x: ppos.x, z: ppos.z });
        else this.#explode(this.#camera.position, player);
        this.#killPlayer(player); this.#holding = false; this.#nadeCd = 0.25; this.#events.emit('gadget:cook', { active: false });
      }
      // a tap still throws, but only once the pin is pulled and it's in the idle
      // hand (readyT elapsed) — so quick taps can't spam-throw. Holding cooks on.
      else if (this.#readyT <= 0 && !this.#actions.active(Action.LETHAL)) { this.#throw(this.#cookFuse); this.#holding = false; this.#nadeCd = 0.25; this.#events.emit('gadget:cook', { active: false }); }
    }

    this.#tickNades(dt, player);
  }

  #throw(fuse) {
    const kind = this.#lethalKind;
    const mesh = kind === 'wraithfire' ? wraithModel() : kind === 'semtex' ? semtexModel() : kind === 'acid' ? acidModel() : grenadeModel();
    const o = this.#camera.position;
    mesh.position.set(o.x, o.y - 0.1, o.z);
    this.#scene.add(mesh);
    _fwd.set(0, 0, -1).applyQuaternion(this.#camera.quaternion);
    this.#nades.push({
      mesh, kind, fuse: kind === 'wraithfire' ? WRAITH.fuse : fuse, stuck: false, stickId: -1, ox: 0, oy: 0, oz: 0,
      vx: _fwd.x * THROW_SPEED, vy: _fwd.y * THROW_SPEED + ARC_UP, vz: _fwd.z * THROW_SPEED,
    });
  }

  #tickNades(dt, player) {
    for (let i = this.#nades.length - 1; i >= 0; i--) {
      const n = this.#nades[i];
      n.fuse -= dt;

      // --- Semtex: sticks to the first surface (ground or a zombie) it touches ---
      if (n.kind === 'semtex' && n.stuck) {
        if (n.stickId >= 0) { // riding a zombie/corpse — follow it, or blow if it's gone
          const zt = this.world.get(n.stickId, Transform);
          if (zt) n.mesh.position.set(zt.position.x + n.ox, zt.position.y + n.oy, zt.position.z + n.oz);
          else n.fuse = Math.min(n.fuse, 0);
        }
        if (n.fuse <= 0) { this.#clusterBurst(n.mesh.position, player); this.#scene.remove(n.mesh); this.#nades.splice(i, 1); }
        continue;
      }

      n.vy -= GRAVITY * dt;
      n.mesh.position.x += n.vx * dt;
      n.mesh.position.y += n.vy * dt;
      n.mesh.position.z += n.vz * dt;

      if (n.kind === 'semtex') { // stick to a zombie it flies into
        const hit = this.#nearestStick(n.mesh.position);
        if (hit) {
          const zt = this.world.get(hit, Transform).position;
          n.stuck = true; n.stickId = hit;
          n.ox = n.mesh.position.x - zt.x; n.oy = n.mesh.position.y - zt.y; n.oz = n.mesh.position.z - zt.z;
          continue;
        }
      }

      if (n.mesh.position.y <= 0.07) {
        if (n.kind === 'wraithfire') { this.#ignitePool({ x: n.mesh.position.x, y: 0, z: n.mesh.position.z }); this.#scene.remove(n.mesh); this.#nades.splice(i, 1); continue; }
        if (n.kind === 'acid') { this.#igniteAcid({ x: n.mesh.position.x, z: n.mesh.position.z }); this.#scene.remove(n.mesh); this.#nades.splice(i, 1); continue; }
        if (n.kind === 'bomblet') { this.#explode(n.mesh.position, player, SEMTEX.bombletRadius, SEMTEX.bombletDamage); this.#scene.remove(n.mesh); this.#nades.splice(i, 1); continue; }
        if (n.kind === 'semtex') { n.mesh.position.y = 0.05; n.stuck = true; n.stickId = -1; continue; } // sticks flat to the floor
        n.mesh.position.y = 0.07; // frag bounces + rolls
        n.vy = Math.abs(n.vy) * 0.35;
        n.vx *= 0.6; n.vz *= 0.6;
      }
      n.mesh.rotation.x += n.vx * dt * 2;
      n.mesh.rotation.z += n.vz * dt * 2;
      if (n.fuse <= 0) {
        if (n.kind === 'wraithfire') this.#ignitePool({ x: n.mesh.position.x, y: 0, z: n.mesh.position.z });
        else if (n.kind === 'acid') this.#igniteAcid({ x: n.mesh.position.x, z: n.mesh.position.z });
        else if (n.kind === 'semtex') this.#clusterBurst(n.mesh.position, player);
        else if (n.kind === 'bomblet') this.#explode(n.mesh.position, player, SEMTEX.bombletRadius, SEMTEX.bombletDamage);
        else this.#explode(n.mesh.position, player);
        this.#scene.remove(n.mesh);
        this.#nades.splice(i, 1);
      }
    }
  }

  /** Nearest zombie within sticking distance of a point, or null. */
  #nearestStick(pos) {
    let best = SEMTEX.stickDist * SEMTEX.stickDist, hit = null;
    for (const id of this.world.query(ZombieTag, Transform)) {
      const t = this.world.get(id, Transform).position;
      const dx = t.x - pos.x, dy = (t.y + 1.0) - pos.y, dz = t.z - pos.z; // aim at torso height
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) { best = d; hit = id; }
    }
    return hit;
  }

  // --- WraithFire: spectral blue fire pools -----------------------------------

  #ignitePool(pos) {
    const group = buildFirePool(WRAITH.poolRadius);
    group.position.set(pos.x, 0.02, pos.z);
    this.#scene.add(group);
    this.#firePools.push({ group, x: pos.x, z: pos.z, t: 0, dmgT: 0 });
    this.#events.emit('fx:shake', {}); // blue fire reads on its own; no orange fireball
  }

  /** Animate + expire fire pools and burning corpses; while playing, the pools
   *  scorch any zombie standing over them and ignite the ones they kill. */
  #tickFire(dt) {
    const playing = this.#gameState.isPlaying;
    for (let i = this.#firePools.length - 1; i >= 0; i--) {
      const p = this.#firePools[i];
      p.t += dt;
      animateFlames(p.group, p.t);
      // quick fade in/out at the very start/end
      const k = p.t < 0.3 ? p.t / 0.3 : p.t > WRAITH.poolLife - 0.6 ? Math.max(0, (WRAITH.poolLife - p.t) / 0.6) : 1;
      p.group.scale.set(1, 0.4 + k * 0.6, 1);
      setFlameOpacity(p.group, k);
      if (playing) {
        p.dmgT -= dt;
        if (p.dmgT <= 0) { p.dmgT = WRAITH.tick; this.#burnZombies(p.x, p.z); }
      }
      if (p.t >= WRAITH.poolLife) { this.#scene.remove(p.group); disposeFlames(p.group); this.#firePools.splice(i, 1); }
    }
    for (let i = this.#burning.length - 1; i >= 0; i--) {
      const b = this.#burning[i];
      b.t += dt;
      animateFlames(b.group, b.t * 1.4);
      const k = b.t < 0.25 ? b.t / 0.25 : 1; // flare up fast
      setFlameOpacity(b.group, k);
      // BURN AWAY: once the ragdoll has had a moment to fall, the corpse shrinks
      // into the flames and vanishes over the final stretch
      if (b.rig && b.t > b.burnStart) {
        const p = Math.min(1, (b.t - b.burnStart) / (b.life - b.burnStart));
        const s = Math.max(0.001, 1 - p);
        b.rig.scale.setScalar(s);
        setFlameOpacity(b.group, 1 - p);
      }
      if (b.t >= b.life) {
        if (b.rig) b.rig.visible = false;     // gone — CorpseSystem reaps the husk later
        b.group.removeFromParent(); disposeFlames(b.group); this.#burning.splice(i, 1);
      }
    }
  }

  #burnZombies(px, pz) {
    const pid = this.world.first(PlayerTag, Transform);
    const player = pid !== undefined ? this.world.get(pid, PlayerTag) : null;
    const ctx = { world: this.world, spawn: this.#spawn, events: this.#events, player };
    const pu = this.world.services.has(Service.Powerups) ? this.world.services.get(Service.Powerups) : null;
    const mul = pu ? pu.pointsMultiplier() : 1;
    const r2 = WRAITH.poolRadius * WRAITH.poolRadius;
    let pts = 0;
    for (const id of [...this.world.query(ZombieTag, Transform)]) {
      const t = this.world.get(id, Transform).position;
      const dx = t.x - px, dz = t.z - pz;
      if (dx * dx + dz * dz > r2) continue;
      const killed = damageZombie(ctx, id, WRAITH.dmgPerTick, { award: false, dir: { x: dx, z: dz }, force: 0.6 });
      if (killed) { pts += 60; this.#igniteCorpse(id); } // stylized fiery death
    }
    if (player && pts) { player.points += pts * mul; this.#events.emit('score:changed', { points: player.points }); }
  }

  /** Set a freshly-killed zombie's corpse alight — flames engulf the ragdoll as
   *  it falls, then it chars and burns away (shrinks into the fire) over ~2.4s. */
  #igniteCorpse(id) {
    const rig = this.world.get(id, Renderable)?.object3d;
    if (!rig?.userData?.joints) return;
    const flames = buildCorpseFlames();
    rig.add(flames); // on the ROOT so it covers + scales with the whole body
    this.#burning.push({ group: flames, rig, t: 0, burnStart: 1.2, life: 2.4 });
  }

  // --- Acid bomb: corrosive pools that dissolve legs then melt the body --------

  #igniteAcid(pos) {
    const group = buildAcidPool(ACID.poolRadius);
    group.position.set(pos.x, 0.02, pos.z);
    this.#scene.add(group);
    this.#acidPools.push({ group, x: pos.x, z: pos.z, t: 0, dmgT: 0 });
    this.#events.emit('fx:shake', {});
  }

  #tickAcid(dt) {
    const playing = this.#gameState.isPlaying;
    for (let i = this.#acidPools.length - 1; i >= 0; i--) {
      const p = this.#acidPools[i];
      p.t += dt;
      animateAcid(p.group, p.t);
      const k = p.t < 0.35 ? p.t / 0.35 : p.t > ACID.poolLife - 0.8 ? Math.max(0, (ACID.poolLife - p.t) / 0.8) : 1;
      setFlameOpacity(p.group, k);
      if (playing) { p.dmgT -= dt; if (p.dmgT <= 0) { p.dmgT = ACID.tick; this.#acidAffect(p.x, p.z); } }
      if (p.t >= ACID.poolLife) { this.#scene.remove(p.group); disposeFlames(p.group); this.#acidPools.splice(i, 1); }
    }
    // reap zombies that have fully melted away (their bodyMelt is driven by anim)
    for (let i = this.#melting.length - 1; i >= 0; i--) {
      const id = this.#melting[i];
      const z = this.world.get(id, ZombieTag);
      if (!z) { this.#melting.splice(i, 1); continue; }
      if (z.bodyMelt >= 1) { this.#despawnMelted(id); this.#melting.splice(i, 1); }
    }
  }

  /** Apply acid exposure to every zombie standing in the pool: a pain-slow, then
   *  dissolved legs -> crawler, then (if it lingers) a full-body melt. */
  #acidAffect(px, pz) {
    const r2 = ACID.poolRadius * ACID.poolRadius;
    for (const id of this.world.query(ZombieTag, Transform)) {
      const z = this.world.get(id, ZombieTag);
      if (z.melting) continue;
      const t = this.world.get(id, Transform).position;
      const dx = t.x - px, dz = t.z - pz;
      if (dx * dx + dz * dz > r2) continue;
      z.acidSlow = 0.4;       // refreshed while inside -> slowed + writhing
      z.acid += ACID.tick;
      if (!z.crawler && !z.meltingLegs && z.acid >= ACID.legTime) {
        z.meltingLegs = true; z.legMelt = 0;
        if (z.state === 'teardown') { z.state = 'pathing'; z.barrierTarget = null; z.replan = 0; }
      } else if (z.crawler && z.acid >= ACID.bodyTime) {
        z.melting = true; z.bodyMelt = 0; this.#melting.push(id);
      }
    }
  }

  /** A melted zombie is gone — no ragdoll, just dissolved. Mirror the kill
   *  bookkeeping (points, spawn count) and remove it. */
  #despawnMelted(id) {
    const pid = this.world.first(PlayerTag, Transform);
    const player = pid !== undefined ? this.world.get(pid, PlayerTag) : null;
    const pu = this.world.services.has(Service.Powerups) ? this.world.services.get(Service.Powerups) : null;
    const mul = pu ? pu.pointsMultiplier() : 1;
    const t = this.world.get(id, Transform)?.position;
    const ref = this.world.get(id, RigidBodyRef);
    if (ref && this.#physics) { this.#physics.removeBody(ref); this.world.remove(id, RigidBodyRef); }
    this.#spawn.notifyKilled();
    if (player) { player.points += PlayerCombat.pointsKillBody * mul; this.#events.emit('score:changed', { points: player.points }); }
    this.#events.emit('zombie:killed', { headshot: false, x: t ? t.x : 0, z: t ? t.z : 0 });
    this.world.destroyEntity(id);
  }

  #explode(pos, player, radius = RADIUS, damage = DAMAGE) {
    const ctx = { world: this.world, spawn: this.#spawn, events: this.#events, player };
    const pu = this.world.services.has(Service.Powerups) ? this.world.services.get(Service.Powerups) : null;
    const mul = pu ? pu.pointsMultiplier() : 1;
    let pts = 0;
    for (const id of [...this.world.query(ZombieTag, Transform)]) {
      const t = this.world.get(id, Transform).position;
      const dx = t.x - pos.x, dy = t.y - pos.y, dz = t.z - pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > radius) continue;
      const falloff = 1 - d / radius; // edge zombies may survive
      const killed = damageZombie(ctx, id, damage * falloff, { award: false, dir: { x: dx, z: dz }, force: 1.6, knockChance: ZombieConfig.knockChance * (0.4 + 0.6 * falloff) });
      this.#events.emit('fx:blood', { x: t.x, y: t.y + 1.1, z: t.z, dx, dz });
      pts += 10 + (killed ? 50 : 0); // 10 for a hit, +50 for a kill
    }
    if (player && pts) { player.points += pts * mul; this.#events.emit('score:changed', { points: player.points }); }

    // shared explosion fx (handler adds the screen shake)
    this.#events.emit('fx:explosion', { x: pos.x, y: pos.y, z: pos.z, kind: 'frag' });
  }

  // --- Semtex cluster bomb ----------------------------------------------------

  /** Main blast, then fling 3 bomblets that airburst on the next ground touch. */
  #clusterBurst(pos, player) {
    this.#explode(pos, player, SEMTEX.mainRadius, SEMTEX.mainDamage);
    for (let i = 0; i < SEMTEX.count; i++) {
      const mesh = bombletModel();
      mesh.position.set(pos.x, pos.y + 0.1, pos.z);
      this.#scene.add(mesh);
      const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 4;
      this.#nades.push({
        mesh, kind: 'bomblet', fuse: 2.0,
        vx: Math.cos(a) * sp, vy: 3 + Math.random() * 2.5, vz: Math.sin(a) * sp,
      });
    }
  }

  #killPlayer(player) {
    const pk = this.world.services.has(Service.Perks) ? this.world.services.get(Service.Perks) : null;
    if (pk && pk.explosionImmune()) return; // PHD Flopper shrugs off the blast
    player.health = 0;
    this.#events.emit('player:health', { health: 0, max: player.maxHealth ?? PlayerCombat.maxHealth });
    this.#events.emit('player:dying', {});
  }

  #animateFx(dt) {
    for (let i = this.#fx.length - 1; i >= 0; i--) {
      const f = this.#fx[i];
      f.t += dt;
      const k = f.t / f.dur;
      f.mesh.scale.setScalar(0.2 + k * f.size);
      f.mesh.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) { this.#scene.remove(f.mesh); this.#fx.splice(i, 1); }
    }
  }

  #clear() {
    for (const n of this.#nades) this.#scene.remove(n.mesh);
    this.#nades.length = 0;
    for (const p of this.#firePools) { this.#scene.remove(p.group); disposeFlames(p.group); }
    this.#firePools.length = 0;
    for (const b of this.#burning) { b.group.removeFromParent(); disposeFlames(b.group); }
    this.#burning.length = 0;
    for (const p of this.#acidPools) { this.#scene.remove(p.group); disposeFlames(p.group); }
    this.#acidPools.length = 0;
    this.#melting.length = 0;
    if (this.#holding) this.#events.emit('gadget:cook', { active: false });
    this.#holding = false;
    this.#count = MAX_NADES;
    this.#emitCount();
    if (this.#light) { this.#light.intensity = 0; this.#lightOn = false; }
  }
}

// --- WraithFire models + spectral-flame helpers ------------------------------
// Blue spectral fire built from additive cones (no textures): a ring + core of
// flickering tongues over a glowing ground disc. Each pool owns its materials so
// they can fade independently.
let _wraithParts = null;
function wraithModel() {
  // a lantern: a bright cyan glow-core in a brass cage so the glow actually
  // SHOWS (the old version buried it inside an opaque shell -> read as black)
  if (!_wraithParts) {
    _wraithParts = {
      brass: new THREE.MeshStandardMaterial({ color: 0x9a7b34, metalness: 0.7, roughness: 0.4 }),
      glow: new THREE.MeshBasicMaterial({ color: 0x6fe0ff }),
      halo: new THREE.MeshBasicMaterial({ color: 0x49c6ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
  }
  const P = _wraithParts;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.12, 12), P.glow));       // glowing core
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.14, 12), P.halo));       // additive bloom
  const capT = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.05, 0.022, 12), P.brass); capT.position.y = 0.07; g.add(capT);
  const capB = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.056, 0.022, 12), P.brass); capB.position.y = -0.07; g.add(capB);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.13, 6), P.brass); bar.position.set(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05); g.add(bar); }
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.03, 8), P.brass); fuse.position.y = 0.1; g.add(fuse);
  return g;
}

// --- Semtex cluster models ---------------------------------------------------
let _semtexParts = null;
function semtexParts() {
  if (!_semtexParts) _semtexParts = {
    putty: new THREE.MeshStandardMaterial({ color: 0x6b7a32, roughness: 0.85, metalness: 0.0 }), // olive plastic explosive
    band: new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.6 }),                   // caution band
    dark: new THREE.MeshStandardMaterial({ color: 0x20241a, roughness: 0.6, metalness: 0.3 }),    // detonator
    led: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),                                        // blinking light
  };
  return _semtexParts;
}
/** A flat brick of semtex with a detonator + red LED + sticky caution band. */
function semtexModel() {
  const P = semtexParts();
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.085), P.putty); g.add(body);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.122, 0.018, 0.087), P.band); band.position.y = 0.008; g.add(band);
  const det = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.05), P.dark); det.position.y = 0.04; g.add(det);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 5), P.led); led.position.set(0.02, 0.056, 0.02); g.add(led);
  const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.03, 6), P.dark); prong.position.set(-0.015, 0.06, 0); g.add(prong);
  return g;
}
let _bombletGeo = null;
function bombletModel() {
  const P = semtexParts();
  if (!_bombletGeo) _bombletGeo = new THREE.IcosahedronGeometry(0.03, 0);
  const g = new THREE.Group();
  const ball = new THREE.Mesh(_bombletGeo, P.dark); g.add(ball);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 5), P.led); dot.position.set(0, 0.028, 0); g.add(dot);
  return g;
}

// --- Acid bomb model + corrosive pool ---------------------------------------
// A brass naval-mine sphere with protruding canister pods, glowing acid-green
// ports, and a visible green acid core peeking through (built once, reused).
let _acidParts = null;
export function acidModel() {
  if (!_acidParts) _acidParts = {
    brass: new THREE.MeshStandardMaterial({ color: 0x8a7a45, metalness: 0.65, roughness: 0.45 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x3a3526, metalness: 0.5, roughness: 0.55 }),
    glow: new THREE.MeshBasicMaterial({ color: 0x9bff3a }),                                   // acid-green ports
    core: new THREE.MeshBasicMaterial({ color: 0xbfff66, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  const P = _acidParts;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), P.brass)); // mine body
  // a green acid core that glows out through the ports
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), P.core));
  // protruding canister pods at the cardinal points, each with a glowing port
  const dirs = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  for (const d of dirs) {
    const n = new THREE.Vector3(d[0], d[1], d[2]);
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.05, 8), P.dark);
    pod.position.copy(n).multiplyScalar(0.085); pod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n); g.add(pod);
    const port = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.01, 8), P.glow);
    port.position.copy(n).multiplyScalar(0.11); port.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n); g.add(port);
    // little horn prongs flanking each pod (naval-mine look)
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.04, 5), P.brass);
    horn.position.copy(n).multiplyScalar(0.12); horn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n); g.add(horn);
  }
  return g;
}

/** A bubbling corrosive pool: a glowing green ground disc with rising,
 *  popping acid blobs. No dynamic lights (avoids the shader-recompile hitch). */
function buildAcidPool(radius) {
  const g = new THREE.Group();
  const goo = flameMat(0x86e02a, 0.6); goo.blending = THREE.NormalBlending; // murky green, not additive
  const froth = flameMat(0xc6ff6a, 0.85);
  g.userData.mats = [goo, froth];
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), goo);
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.012; g.add(disc);
  if (!_blobGeo) _blobGeo = new THREE.IcosahedronGeometry(1, 0);
  const bubbles = [];
  for (let i = 0; i < 16; i++) {
    const rr = Math.sqrt(Math.random()) * radius * 0.9, a = Math.random() * Math.PI * 2;
    const s = 0.08 + Math.random() * 0.12;
    const m = new THREE.Mesh(_blobGeo, Math.random() < 0.4 ? froth : goo);
    m.scale.setScalar(s);
    m.position.set(Math.cos(a) * rr, 0.02, Math.sin(a) * rr);
    m.userData.s = s; m.userData.ph = Math.random() * 6.28; m.userData.rr = rr; m.userData.a = a;
    g.add(m); bubbles.push(m);
  }
  g.userData.bubbles = bubbles;
  return g;
}
let _blobGeo = null;
/** Bubble the acid: blobs swell + rise then pop back, the surface roils. */
function animateAcid(g, t) {
  const bubbles = g.userData.bubbles; if (!bubbles) return;
  for (const m of bubbles) {
    const ph = t * 3 + m.userData.ph;
    const cyc = (Math.sin(ph) * 0.5 + 0.5); // 0..1 swell-and-pop
    m.scale.setScalar(m.userData.s * (0.5 + cyc * 0.9));
    m.position.y = 0.02 + cyc * 0.12;
    m.rotation.x += 0.04; m.rotation.z += 0.03;
  }
}

const _coneGeo = new THREE.ConeGeometry(1, 1, 7);
function flameMat(color, opacity) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}
/** A pool of spectral fire of the given radius, centred at the group origin. */
function buildFirePool(radius) {
  const g = new THREE.Group();
  const outer = flameMat(0x2a7bff, 0.85); // blue body
  const core = flameMat(0xbfeeff, 0.9);   // white-hot core
  g.userData.mats = [outer, core];
  // glowing ground disc
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), flameMat(0x1f6bff, 0.5));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.01; g.userData.mats.push(disc.material); g.add(disc);
  // flame tongues across the pool
  const tongues = [];
  const N = 22;
  for (let i = 0; i < N; i++) {
    const rr = Math.sqrt(Math.random()) * radius * 0.92;
    const a = Math.random() * Math.PI * 2;
    const h = 0.6 + Math.random() * 0.9;
    const m = new THREE.Mesh(_coneGeo, Math.random() < 0.35 ? core : outer);
    m.scale.set(0.14 + Math.random() * 0.1, h, 0.14 + Math.random() * 0.1);
    m.position.set(Math.cos(a) * rr, h * 0.5, Math.sin(a) * rr);
    m.userData.h = h; m.userData.ph = Math.random() * 6.28; m.userData.r = m.scale.x; m.userData.by = 0; // sits on the ground
    g.add(m); tongues.push(m);
  }
  // NOTE: deliberately no dynamic PointLight — adding/removing lights at runtime
  // forces THREE to recompile every material's shader (the per-throw freeze). The
  // additive flame cones read as glowing on their own.
  g.userData.tongues = tongues;
  return g;
}
/** Flames that engulf a whole burning corpse — tongues spread over the body so
 *  the ragdoll visibly chars and burns away. Attached to the rig ROOT. */
function buildCorpseFlames() {
  const g = new THREE.Group();
  const outer = flameMat(0x2a7bff, 0.9), core = flameMat(0xcdf2ff, 0.95);
  g.userData.mats = [outer, core];
  const tongues = [];
  for (let i = 0; i < 14; i++) {
    const h = 0.28 + Math.random() * 0.4;
    const m = new THREE.Mesh(_coneGeo, Math.random() < 0.4 ? core : outer);
    m.scale.set(0.12, h, 0.12);
    // spread up the body (feet to head) and around it
    m.position.set((Math.random() - 0.5) * 0.5, 0.2 + Math.random() * 1.25, (Math.random() - 0.5) * 0.34);
    m.userData.h = h; m.userData.ph = Math.random() * 6.28; m.userData.r = m.scale.x; m.userData.by = m.position.y;
    g.add(m); tongues.push(m);
  }
  g.userData.tongues = tongues;
  return g;
}
function animateFlames(g, t) {
  const tongues = g.userData.tongues; if (!tongues) return;
  for (const m of tongues) {
    const f = 0.7 + 0.3 * Math.sin(t * 12 + m.userData.ph) + 0.15 * Math.sin(t * 23 + m.userData.ph * 2);
    m.scale.y = m.userData.h * f;
    m.scale.x = m.scale.z = m.userData.r * (0.85 + 0.2 * f);
    m.position.y = m.userData.by + m.scale.y * 0.5;
    m.rotation.y += 0.06;
  }
}
function setFlameOpacity(g, k) {
  const base = [0.85, 0.9, 0.5];
  const mats = g.userData.mats; if (!mats) return;
  for (let i = 0; i < mats.length; i++) mats[i].opacity = (base[i] ?? 0.85) * k;
}
function disposeFlames(g) {
  for (const m of g.userData.mats || []) m.dispose();
}
