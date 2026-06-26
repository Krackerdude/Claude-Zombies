import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Service } from '../core/ServiceLocator.js';
import { Action } from '../config/keybinds.js';
import { Transform, PlayerTag, ZombieTag } from '../ecs/components/index.js';
import { damageZombie } from '../weapons/damage.js';

/**
 * Tacticals — the twin to lethal grenades. A second throwable slot bound to T,
 * mirroring the grenade's anti-spam ("pin pull" wind-up + cooldown) so they
 * can't be spammed. You hold one tactical type at a time; picking another up
 * (from the dev menu, for now) replaces it. You regain 1 per round, capped at 4.
 *
 * First tactical: the MONKEY BOMB. Wind it up, throw it; on landing the cymbal
 * monkey hops in place clashing its cymbals, luring every zombie to swarm it for
 * 8 seconds — then it detonates for devastating damage. (The lure itself lives
 * in ZombieSystem, which listens for the lure:set / lure:clear events we emit.)
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

const _fwd = new THREE.Vector3();

export class TacticalSystem extends System {
  #gameState; #actions; #input; #camera; #scene; #events; #spawn;
  #equipped = null;      // null | 'monkey'
  #count = 0;
  #holding = false;
  #readyT = 0;
  #cd = 0;
  #thrown = [];
  #fx = [];
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

    this.#events.on('state:change', ({ state }) => { if (state === 'menu') this.#clear(); });
    // regain one per round (only matters once you actually have a tactical)
    this.#events.on('round:changed', () => {
      if (!this.#equipped) return;
      this.#count = Math.min(MAX, this.#count + PER_ROUND);
      this.#emitCount();
    });
  }

  /** Dev hook: equip (or replace) the held tactical and top it to a full stock. */
  giveTactical(type) {
    if (type !== 'monkey') return;
    this.#equipped = type;
    this.#count = MAX;
    this.#holding = false; this.#readyT = 0;
    this.#events.emit('tactical:equip', { type });
    this.#emitCount();
  }

  update(dt) {
    this.#animate(dt);
    this.#tickThrown(dt);
    if (!this.#gameState.isPlaying || !this.#input.pointerLocked) return;
    if (this.#cd > 0) this.#cd = Math.max(0, this.#cd - dt);

    // wind up on press, throw on release once the wind-up has elapsed (so quick
    // taps still throw but can't be spammed) — same cadence as the grenade
    if (!this.#holding && this.#cd <= 0 && this.#equipped && this.#count > 0 && this.#actions.pressed(Action.TACTICAL)) {
      this.#holding = true; this.#readyT = READY_TIME; this.#count--;
      this.#events.emit('tactical:cook', { active: true });
      this.#emitCount();
    }
    if (this.#holding) {
      this.#readyT = Math.max(0, this.#readyT - dt);
      if (this.#readyT <= 0 && !this.#actions.active(Action.TACTICAL)) {
        this.#throw();
        this.#holding = false; this.#cd = THROW_CD;
        this.#events.emit('tactical:cook', { active: false });
      }
    }
  }

  #throw() {
    const mesh = buildMonkeyModel();
    const o = this.#camera.position;
    mesh.position.set(o.x, o.y - 0.1, o.z);
    this.#scene.add(mesh);
    _fwd.set(0, 0, -1).applyQuaternion(this.#camera.quaternion);
    this.#thrown.push({
      mesh, kind: this.#equipped, state: 'flying', timer: MONKEY.active, lureId: 0, hop: 0,
      vx: _fwd.x * THROW_SPEED, vy: _fwd.y * THROW_SPEED + ARC_UP, vz: _fwd.z * THROW_SPEED,
    });
  }

  #tickThrown(dt) {
    for (let i = this.#thrown.length - 1; i >= 0; i--) {
      const m = this.#thrown[i];
      if (m.state === 'flying') {
        m.vy -= GRAVITY * dt;
        m.mesh.position.x += m.vx * dt;
        m.mesh.position.y += m.vy * dt;
        m.mesh.position.z += m.vz * dt;
        m.mesh.rotation.x += m.vx * dt * 1.5;
        m.mesh.rotation.z += m.vz * dt * 1.5;
        if (m.mesh.position.y <= 0.18) {
          // landed: plant it upright, start the cymbals, and post the lure
          m.mesh.position.y = 0.18;
          m.mesh.rotation.set(0, Math.atan2(m.vx, m.vz), 0);
          m.state = 'active';
          m.lureId = this.#lureId++;
          this.#events.emit('lure:set', { id: m.lureId, x: m.mesh.position.x, z: m.mesh.position.z });
          this.#events.emit('fx:shake', {});
        }
      } else if (m.state === 'active') {
        m.timer -= dt; m.hop += dt;
        this.#animateMonkey(m);
        if (m.timer <= 0) {
          this.#events.emit('lure:clear', { id: m.lureId });
          this.#detonate(m.mesh.position);
          this.#scene.remove(m.mesh);
          this.#thrown.splice(i, 1);
        }
      }
    }
  }

  /** Hops in place clashing the cymbals — fast, jittery, manic. */
  #animateMonkey(m) {
    const t = m.hop;
    const J = m.mesh.userData;
    const hop = Math.abs(Math.sin(t * 9)) * 0.09;          // quick little hops
    m.mesh.position.y = 0.18 + hop;
    m.mesh.rotation.y += 0.04;                              // slowly spin so it lures all around
    const clash = (Math.sin(t * 22) * 0.5 + 0.5) * 0.7;    // cymbals in/out
    if (J.armL) J.armL.rotation.z = 0.5 + clash;
    if (J.armR) J.armR.rotation.z = -0.5 - clash;
  }

  #detonate(pos) {
    const pid = this.world.first(PlayerTag, Transform);
    const player = pid !== undefined ? this.world.get(pid, PlayerTag) : null;
    const ctx = { world: this.world, spawn: this.#spawn, events: this.#events, player };
    const pu = this.world.services.has(Service.Powerups) ? this.world.services.get(Service.Powerups) : null;
    const mul = pu ? pu.pointsMultiplier() : 1;
    let pts = 0;
    for (const id of [...this.world.query(ZombieTag, Transform)]) {
      const t = this.world.get(id, Transform).position;
      const dx = t.x - pos.x, dz = t.z - pos.z;
      const d = Math.hypot(dx, t.y - pos.y, dz);
      if (d > MONKEY.radius) continue;
      const killed = damageZombie(ctx, id, MONKEY.damage, { award: false, dir: { x: dx, z: dz }, force: 2.2, knockChance: 1 });
      this.#events.emit('fx:blood', { x: t.x, y: t.y + 1.1, z: t.z, dx, dz });
      pts += 10 + (killed ? 50 : 0);
    }
    if (player && pts) { player.points += pts * mul; this.#events.emit('score:changed', { points: player.points }); }
    this.#events.emit('fx:explosion', { x: pos.x, y: pos.y, z: pos.z, kind: 'frag' });
    // a quick ring of debris fx via the gib spray for a meaty pop
    this.#events.emit('fx:shake', {});
  }

  #animate(dt) {
    for (let i = this.#fx.length - 1; i >= 0; i--) {
      const f = this.#fx[i];
      f.t += dt;
      const k = f.t / f.dur;
      f.mesh.scale.setScalar(0.2 + k * f.size);
      f.mesh.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) { this.#scene.remove(f.mesh); this.#fx.splice(i, 1); }
    }
  }

  #emitCount() { this.#events.emit('tactical:count', { count: this.#count, type: this.#equipped }); }

  #clear() {
    for (const m of this.#thrown) {
      if (m.lureId) this.#events.emit('lure:clear', { id: m.lureId });
      this.#scene.remove(m.mesh);
    }
    this.#thrown.length = 0;
    if (this.#holding) this.#events.emit('tactical:cook', { active: false });
    this.#holding = false; this.#readyT = 0;
  }
}

// --- the cymbal monkey: a cheap, in-theme low-poly model ----------------------
let _M = null;
function monkeyParts() {
  if (_M) return _M;
  _M = {
    fur: new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 0.85 }),
    face: new THREE.MeshStandardMaterial({ color: 0xb9966c, roughness: 0.7 }),
    fez: new THREE.MeshStandardMaterial({ color: 0x2a3d8f, roughness: 0.6 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x6b6f55, roughness: 0.8 }),
    cymbal: new THREE.MeshStandardMaterial({ color: 0xb98a2e, metalness: 0.8, roughness: 0.35 }),
    tnt: new THREE.MeshStandardMaterial({ color: 0x7a1c14, roughness: 0.7 }),
    eye: new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xc00000, emissiveIntensity: 1.4 }),
  };
  return _M;
}
function buildMonkeyModel() {
  const P = monkeyParts();
  const g = new THREE.Group();
  const mesh = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };

  // seated body + head
  mesh(new THREE.BoxGeometry(0.26, 0.24, 0.2), P.fur, 0, 0.05, 0);          // torso
  const head = mesh(new THREE.SphereGeometry(0.13, 12, 10), P.fur, 0, 0.27, 0);
  mesh(new THREE.SphereGeometry(0.085, 10, 8), P.face, 0, 0.25, 0.07);      // muzzle/face
  // fez hat
  mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.1, 12), P.fez, 0, 0.39, 0);
  // glowing red eyes
  mesh(new THREE.SphereGeometry(0.022, 8, 6), P.eye, -0.045, 0.29, 0.105);
  mesh(new THREE.SphereGeometry(0.022, 8, 6), P.eye, 0.045, 0.29, 0.105);
  // little vest/legs hint
  mesh(new THREE.BoxGeometry(0.28, 0.08, 0.22), P.cloth, 0, -0.06, 0.01);

  // dynamite bundle strapped to the back
  for (let i = -1; i <= 1; i++) mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 8), P.tnt, i * 0.05, 0.06, -0.13);

  // arms, each ending in a cymbal — pivot at the shoulder so they can clap
  const arm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.13, 0.08, 0.06);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.16), P.fur);
    upper.position.set(side * -0.04, 0, 0.06);
    pivot.add(upper);
    const cym = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.015, 16), P.cymbal);
    cym.rotation.x = Math.PI / 2; // face forward, edge-on toward the centre
    cym.position.set(side * -0.07, 0, 0.13);
    pivot.add(cym);
    pivot.rotation.z = side * 0.5;
    g.add(pivot);
    return pivot;
  };
  g.userData.armL = arm(-1);
  g.userData.armR = arm(1);
  return g;
}
