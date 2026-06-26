import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Service } from '../core/ServiceLocator.js';
import { Action } from '../config/keybinds.js';
import { Transform, PlayerTag, ZombieTag } from '../ecs/components/index.js';
import { damageZombie } from '../weapons/damage.js';
import { buildMonkeyModel, buildArnieJar, oozeMaterial } from './tacticalModels.js';

/**
 * Tacticals — the twin to lethal grenades. A second throwable slot bound to T,
 * mirroring the grenade's anti-spam ("pin pull" wind-up + cooldown) so they
 * can't be spammed. You hold one tactical type at a time; picking another up
 * (from the dev menu, for now) replaces it. You regain 1 per round, capped at 4.
 *
 * Kinds:
 *  - MONKEY BOMB: a wind-up cymbal monkey. On landing it hops, clashing its
 *    cymbals, luring every zombie to swarm it for 8s, then detonates for
 *    devastating damage.
 *  - LIL' ARNIE: a jar you shake, then throw. The jar shatters, the parasite
 *    mutates to zombie-size and flails its tentacles, luring the horde in and
 *    slowly tearing the limbs off — then killing — anything that touches it. It
 *    dribbles sickly green ooze from its mouth and leaves a puddle below.
 *
 * The swarm itself lives in ZombieSystem, which listens for our lure:set /
 * lure:clear events.
 */
const READY_TIME = 0.6;    // wind-up before a throw can release (the "pin")
const THROW_SPEED = 14;
const ARC_UP = 4.0;
const GRAVITY = 18;
const MAX = 4;
const PER_ROUND = 1;
const THROW_CD = 0.3;

const MONKEY = {
  active: 8.0,          // seconds of cymbal-clashing before it blows
  radius: 7.0,          // blast radius (m) — bigger than a frag
  damage: 100000,       // devastating: anything in radius dies
};
const ARNIE = {
  life: 12.0,           // seconds the parasite thrashes before it dissolves
  growTime: 0.5,        // jar-shatter -> full size
  reach: 2.3,           // tentacle kill radius (m)
  hitEvery: 0.3,        // damage-tick cadence
  hitFrac: 0.14,        // fraction of a zombie's max health shredded per tick
  dismember: 0.6,       // chance a tick also tears a limb off
};

const _fwd = new THREE.Vector3();
const _wp = new THREE.Vector3();
const OOZE_MAX = 48;

export class TacticalSystem extends System {
  #gameState; #actions; #input; #camera; #scene; #events; #spawn;
  #equipped = null;      // null | 'monkey' | 'arnie'
  #count = 0;
  #holding = false;
  #readyT = 0;
  #cd = 0;
  #thrown = [];
  #ooze = [];
  #oozeCur = 0;
  #lureId = 1;

  init() {
    const s = this.world.services;
    this.#gameState = s.get(Service.GameState);
    this.#actions = s.get(Service.Actions);
    this.#input = s.get(Service.Input);
    this.#camera = s.get(Service.Render).camera;
    this.#scene = s.get(Service.Scene).scene;
    this.#events = s.get(Service.Events);
    this.#spawn = s.get(Service.Spawn);

    // pooled ooze droplets (Arnie dribble) — recycled oldest-first
    const ooGeo = new THREE.SphereGeometry(0.05, 6, 5);
    const ooMat = oozeMaterial();
    for (let i = 0; i < OOZE_MAX; i++) {
      const m = new THREE.Mesh(ooGeo, ooMat);
      m.visible = false; m.raycast = () => {};
      this.#scene.add(m);
      this.#ooze.push({ mesh: m, active: false, vx: 0, vy: 0, vz: 0, age: 0, life: 0, r: 0.05 });
    }

    this.#events.on('state:change', ({ state }) => { if (state === 'menu') this.#clear(); });
    this.#events.on('round:changed', () => {
      if (!this.#equipped) return;
      this.#count = Math.min(MAX, this.#count + PER_ROUND);
      this.#emitCount();
    });
  }

  /** Dev hook: equip (or replace) the held tactical and top it to a full stock. */
  giveTactical(type) {
    if (type !== 'monkey' && type !== 'arnie') return;
    this.#equipped = type;
    this.#count = MAX;
    this.#holding = false; this.#readyT = 0;
    this.#events.emit('tactical:equip', { type });
    this.#emitCount();
  }

  update(dt) {
    this.#tickOoze(dt);
    this.#tickThrown(dt);
    if (!this.#gameState.isPlaying || !this.#input.pointerLocked) return;
    if (this.#cd > 0) this.#cd = Math.max(0, this.#cd - dt);

    if (!this.#holding && this.#cd <= 0 && this.#equipped && this.#count > 0 && this.#actions.pressed(Action.TACTICAL)) {
      this.#holding = true; this.#readyT = READY_TIME; this.#count--;
      this.#events.emit('tactical:cook', { active: true, type: this.#equipped });
      this.#emitCount();
    }
    if (this.#holding) {
      this.#readyT = Math.max(0, this.#readyT - dt);
      if (this.#readyT <= 0 && !this.#actions.active(Action.TACTICAL)) {
        this.#throw();
        this.#holding = false; this.#cd = THROW_CD;
        this.#events.emit('tactical:cook', { active: false, type: this.#equipped });
      }
    }
  }

  #throw() {
    const kind = this.#equipped;
    const mesh = kind === 'arnie' ? buildArnieJar() : buildMonkeyModel();
    const o = this.#camera.position;
    mesh.position.set(o.x, o.y - 0.1, o.z);
    this.#scene.add(mesh);
    _fwd.set(0, 0, -1).applyQuaternion(this.#camera.quaternion);
    this.#thrown.push({
      mesh, kind, state: 'flying',
      timer: kind === 'arnie' ? ARNIE.life : MONKEY.active,
      lureId: 0, age: 0, hitT: 0, oozeT: 0, grow: 0, puddle: null,
      vx: _fwd.x * THROW_SPEED, vy: _fwd.y * THROW_SPEED + ARC_UP, vz: _fwd.z * THROW_SPEED,
    });
  }

  #tickThrown(dt) {
    for (let i = this.#thrown.length - 1; i >= 0; i--) {
      const m = this.#thrown[i];
      if (m.state === 'flying') { this.#tickFlight(m, dt); continue; }
      m.timer -= dt; m.age += dt;
      if (m.kind === 'monkey') {
        this.#animateMonkey(m);
        if (m.timer <= 0) { this.#events.emit('lure:clear', { id: m.lureId }); this.#detonate(m.mesh.position); this.#remove(i); }
      } else {
        this.#tickArnie(m, dt);
        if (m.timer <= 0) { this.#events.emit('lure:clear', { id: m.lureId }); this.#dissolveArnie(m); this.#remove(i); }
      }
    }
  }

  #tickFlight(m, dt) {
    m.vy -= GRAVITY * dt;
    m.mesh.position.x += m.vx * dt;
    m.mesh.position.y += m.vy * dt;
    m.mesh.position.z += m.vz * dt;
    m.mesh.rotation.x += m.vx * dt * 1.5;
    m.mesh.rotation.z += m.vz * dt * 1.5;
    const groundY = m.kind === 'arnie' ? 0.0 : 0.18;
    if (m.mesh.position.y <= groundY + 0.03) {
      m.mesh.position.y = groundY;
      m.mesh.rotation.set(0, Math.atan2(m.vx, m.vz), 0);
      m.state = 'active';
      m.lureId = this.#lureId++;
      this.#events.emit('lure:set', { id: m.lureId, x: m.mesh.position.x, z: m.mesh.position.z });
      this.#events.emit('fx:shake', {});
      if (m.kind === 'arnie') this.#shatterArnie(m);
    }
  }

  // --- monkey -----------------------------------------------------------------

  #animateMonkey(m) {
    const t = m.age;
    const J = m.mesh.userData;
    m.mesh.position.y = 0.18 + Math.abs(Math.sin(t * 9)) * 0.09;
    m.mesh.rotation.y += 0.04;
    const clash = (Math.sin(t * 22) * 0.5 + 0.5) * 0.7;
    if (J.armL) J.armL.rotation.z = 0.5 + clash;
    if (J.armR) J.armR.rotation.z = -0.5 - clash;
  }

  #detonate(pos) {
    const ctx = this.#ctx();
    const mul = this.#mul();
    let pts = 0;
    for (const id of [...this.world.query(ZombieTag, Transform)]) {
      const t = this.world.get(id, Transform).position;
      const dx = t.x - pos.x, dz = t.z - pos.z;
      if (Math.hypot(dx, t.y - pos.y, dz) > MONKEY.radius) continue;
      const killed = damageZombie(ctx, id, MONKEY.damage, { award: false, dir: { x: dx, z: dz }, force: 2.2, knockChance: 1 });
      this.#events.emit('fx:blood', { x: t.x, y: t.y + 1.1, z: t.z, dx, dz });
      pts += 10 + (killed ? 50 : 0);
    }
    this.#award(ctx, pts, mul);
    this.#events.emit('fx:explosion', { x: pos.x, y: pos.y, z: pos.z, kind: 'frag' });
  }

  // --- lil' arnie -------------------------------------------------------------

  #shatterArnie(m) {
    const J = m.mesh.userData;
    for (const g of J.glass || []) g.visible = false;  // the jar breaks away
    if (J.parasite) J.parasite.visible = true;
    // ground puddle of ooze that spreads under it
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 24), oozeMaterial(0.42));
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(m.mesh.position.x, 0.03, m.mesh.position.z);
    puddle.scale.setScalar(0.2);
    puddle.renderOrder = 1;
    this.#scene.add(puddle);
    m.puddle = puddle;
    this.#events.emit('fx:blood', { x: m.mesh.position.x, y: 0.4, z: m.mesh.position.z, dx: 0, dz: 0 });
  }

  #tickArnie(m, dt) {
    const J = m.mesh.userData;
    // mutate to full size right after the jar shatters
    m.grow = Math.min(1, m.grow + dt / ARNIE.growTime);
    const dying = m.timer < 1.2;                      // last beat: shrivel + sink
    const scale = (0.16 + 1.04 * m.grow) * (dying ? Math.max(0.15, m.timer / 1.2) : 1); // ~1.2 full -> ~1.7m tall
    if (J.parasite) J.parasite.scale.setScalar(scale);

    // flail the tentacles + writhe the body
    const tt = m.age;
    if (J.tentacles) {
      for (let k = 0; k < J.tentacles.length; k++) {
        const ten = J.tentacles[k];
        const ph = tt * (5 + k * 0.7) + k * 1.9;
        ten.rotation.x = ten.userData.baseX + Math.sin(ph) * 0.8;
        ten.rotation.z = ten.userData.baseZ + Math.cos(ph * 1.3) * 0.7;
        if (ten.userData.mid) ten.userData.mid.rotation.x = Math.sin(ph * 1.7) * 0.9;
      }
    }
    if (J.body) J.body.rotation.z = Math.sin(tt * 4) * 0.12;

    // grow + hold the ground puddle
    if (m.puddle) {
      const tgt = ARNIE.reach * 0.9;
      const cur = m.puddle.scale.x;
      m.puddle.scale.setScalar(Math.min(tgt, cur + dt * 1.4));
      if (dying) m.puddle.material.opacity = 0.42 * Math.max(0, m.timer / 1.2);
    }

    // dribble ooze from the mouth
    m.oozeT -= dt;
    if (m.oozeT <= 0 && J.mouth && m.grow > 0.4 && !dying) {
      m.oozeT = 0.06;
      J.mouth.getWorldPosition(_wp);
      this.#spawnOoze(_wp.x, _wp.y, _wp.z);
    }

    // tentacle damage: shred (and dismember) zombies within reach on a cadence
    m.hitT -= dt;
    if (m.hitT <= 0 && m.grow > 0.5 && !dying) {
      m.hitT = ARNIE.hitEvery;
      this.#arnieShred(m.mesh.position);
    }
  }

  #arnieShred(pos) {
    const ctx = this.#ctx();
    const mul = this.#mul();
    const reach2 = ARNIE.reach * ARNIE.reach;
    const parts = ['armL', 'armR', 'legL', 'legR'];
    let pts = 0;
    for (const id of [...this.world.query(ZombieTag, Transform)]) {
      const z = this.world.get(id, ZombieTag);
      const t = this.world.get(id, Transform).position;
      const dx = t.x - pos.x, dz = t.z - pos.z;
      if (dx * dx + dz * dz > reach2) continue;
      const dmg = Math.max(20, (z.maxHealth || 150) * ARNIE.hitFrac);
      const part = parts[(Math.random() * parts.length) | 0];
      const killed = damageZombie(ctx, id, dmg, { award: false, dir: { x: dx, z: dz }, force: 1.4, part, dismemberChance: ARNIE.dismember });
      this.#events.emit('fx:blood', { x: t.x, y: t.y + 1.0, z: t.z, dx, dz });
      if (killed) pts += 60;
    }
    this.#award(ctx, pts, mul);
  }

  #dissolveArnie(m) {
    if (m.puddle) { this.#scene.remove(m.puddle); m.puddle = null; }
    const p = m.mesh.position;
    this.#events.emit('fx:blood', { x: p.x, y: 0.5, z: p.z, dx: 0, dz: 0 });
  }

  // --- ooze particles ---------------------------------------------------------

  #spawnOoze(x, y, z) {
    const g = this.#ooze[this.#oozeCur];
    this.#oozeCur = (this.#oozeCur + 1) % this.#ooze.length;
    g.active = true; g.age = 0; g.life = 0.7 + Math.random() * 0.6;
    const s = 0.03 + Math.random() * 0.05; g.r = s * 0.5;
    g.mesh.scale.setScalar(s / 0.05);
    g.mesh.position.set(x, y, z + 0.05);
    g.vx = (Math.random() - 0.5) * 0.8;
    g.vy = 0.4 + Math.random() * 0.8;          // drools out and down
    g.vz = 0.3 + Math.random() * 0.7;
    g.mesh.visible = true;
  }

  #tickOoze(dt) {
    if (dt > 0.05) dt = 0.05;
    for (const g of this.#ooze) {
      if (!g.active) continue;
      g.age += dt;
      if (g.age >= g.life) { g.active = false; g.mesh.visible = false; continue; }
      g.vy -= 9 * dt;
      g.mesh.position.x += g.vx * dt;
      g.mesh.position.y += g.vy * dt;
      g.mesh.position.z += g.vz * dt;
      if (g.mesh.position.y <= g.r) { g.mesh.position.y = g.r; g.vy = 0; g.vx *= 0.4; g.vz *= 0.4; }
    }
  }

  // --- shared helpers ---------------------------------------------------------

  #ctx() {
    const pid = this.world.first(PlayerTag, Transform);
    const player = pid !== undefined ? this.world.get(pid, PlayerTag) : null;
    return { world: this.world, spawn: this.#spawn, events: this.#events, player };
  }
  #mul() {
    const pu = this.world.services.has(Service.Powerups) ? this.world.services.get(Service.Powerups) : null;
    return pu ? pu.pointsMultiplier() : 1;
  }
  #award(ctx, pts, mul) {
    if (ctx.player && pts) { ctx.player.points += pts * mul; this.#events.emit('score:changed', { points: ctx.player.points }); }
  }

  #remove(i) {
    const m = this.#thrown[i];
    if (m.puddle) this.#scene.remove(m.puddle);
    this.#scene.remove(m.mesh);
    this.#thrown.splice(i, 1);
  }

  #emitCount() { this.#events.emit('tactical:count', { count: this.#count, type: this.#equipped }); }

  #clear() {
    for (const m of this.#thrown) {
      if (m.lureId) this.#events.emit('lure:clear', { id: m.lureId });
      if (m.puddle) this.#scene.remove(m.puddle);
      this.#scene.remove(m.mesh);
    }
    this.#thrown.length = 0;
    for (const g of this.#ooze) { g.active = false; g.mesh.visible = false; }
    if (this.#holding) this.#events.emit('tactical:cook', { active: false, type: this.#equipped });
    this.#holding = false; this.#readyT = 0;
  }
}
