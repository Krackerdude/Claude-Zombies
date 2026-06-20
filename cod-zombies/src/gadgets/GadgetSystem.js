import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Service } from '../core/ServiceLocator.js';
import { Action } from '../config/keybinds.js';
import { Transform, PlayerTag, ZombieTag } from '../ecs/components/index.js';
import { damageZombie } from '../weapons/damage.js';
import { PlayerCombat } from '../config/zombies.js';

const FUSE = 4.0;          // seconds from press to detonation (cooked or not)
const READY_TIME = 0.5;    // pin-pull + draw-to-hand before a throw can release (anti-spam)
const MAX_NADES = 4;
const NADES_PER_ROUND = 2;
const THROW_SPEED = 15;
const ARC_UP = 4.0;
const GRAVITY = 18;
const RADIUS = 4.5;        // blast radius (m)
const DAMAGE = 1300;       // center damage; falls off to the edge
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

  init() {
    const s = this.world.services;
    this.#gameState = s.get(Service.GameState);
    this.#actions = s.get(Service.Actions);
    this.#input = s.get(Service.Input);
    this.#camera = s.get(Service.Render).camera;
    this.#scene = s.get(Service.Scene).scene;
    this.#events = s.get(Service.Events);
    this.#spawn = s.get(Service.Spawn);

    // flashlight: a spotlight that follows the camera (off by default)
    this.#light = new THREE.SpotLight(0xfff4d6, 0, 26, Math.PI / 7, 0.4, 1.2);
    this.#light.target = new THREE.Object3D();
    this.#scene.add(this.#light, this.#light.target);

    this.#events.on('state:change', ({ state }) => { if (state === 'menu') this.#clear(); });
    this.#events.on('round:changed', () => { this.#count = Math.min(MAX_NADES, this.#count + NADES_PER_ROUND); this.#events.emit('lethal:count', { count: this.#count }); });
    this.#events.emit('lethal:count', { count: this.#count });
  }

  update(dt) {
    this.#animateFx(dt);
    if (!this.#gameState.isPlaying || !this.#input.pointerLocked) return;

    const pid = this.world.first(PlayerTag, Transform);
    if (pid === undefined) return;
    const player = this.world.get(pid, PlayerTag);
    const ppos = this.world.get(pid, Transform).position;

    // flashlight follows the camera
    this.#light.position.copy(this.#camera.position);
    _fwd.set(0, 0, -1).applyQuaternion(this.#camera.quaternion);
    this.#light.target.position.copy(this.#camera.position).addScaledVector(_fwd, 10);
    if (this.#actions.pressed(Action.FLASHLIGHT)) { this.#lightOn = !this.#lightOn; this.#light.intensity = this.#lightOn ? 3.5 : 0; }

    // lethal: start cooking on press, throw on release, blow up at fuse end
    if (this.#nadeCd > 0) this.#nadeCd = Math.max(0, this.#nadeCd - dt);
    if (!this.#holding && this.#nadeCd <= 0 && this.#count > 0 && this.#actions.pressed(Action.LETHAL)) {
      this.#holding = true; this.#cookFuse = FUSE; this.#readyT = READY_TIME; this.#count--;
      this.#events.emit('gadget:cook', { active: true });
      this.#events.emit('lethal:count', { count: this.#count });
    }
    if (this.#holding) {
      this.#cookFuse -= dt;
      this.#readyT = Math.max(0, this.#readyT - dt);
      if (this.#cookFuse <= 0) { this.#explode(this.#camera.position, player); this.#killPlayer(player); this.#holding = false; this.#nadeCd = 0.25; this.#events.emit('gadget:cook', { active: false }); }
      // a tap still throws, but only once the pin is pulled and it's in the idle
      // hand (readyT elapsed) — so quick taps can't spam-throw. Holding cooks on.
      else if (this.#readyT <= 0 && !this.#actions.active(Action.LETHAL)) { this.#throw(this.#cookFuse); this.#holding = false; this.#nadeCd = 0.25; this.#events.emit('gadget:cook', { active: false }); }
    }

    this.#tickNades(dt, player);
  }

  #throw(fuse) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x39402c, metalness: 0.5, roughness: 0.6 }),
    );
    const o = this.#camera.position;
    mesh.position.set(o.x, o.y - 0.1, o.z);
    this.#scene.add(mesh);
    _fwd.set(0, 0, -1).applyQuaternion(this.#camera.quaternion);
    this.#nades.push({
      mesh, fuse,
      vx: _fwd.x * THROW_SPEED, vy: _fwd.y * THROW_SPEED + ARC_UP, vz: _fwd.z * THROW_SPEED,
    });
  }

  #tickNades(dt, player) {
    for (let i = this.#nades.length - 1; i >= 0; i--) {
      const n = this.#nades[i];
      n.fuse -= dt;
      n.vy -= GRAVITY * dt;
      n.mesh.position.x += n.vx * dt;
      n.mesh.position.y += n.vy * dt;
      n.mesh.position.z += n.vz * dt;
      if (n.mesh.position.y <= 0.07) { // bounce + roll along the floor
        n.mesh.position.y = 0.07;
        n.vy = Math.abs(n.vy) * 0.35;
        n.vx *= 0.6; n.vz *= 0.6;
      }
      n.mesh.rotation.x += n.vx * dt * 2;
      n.mesh.rotation.z += n.vz * dt * 2;
      if (n.fuse <= 0) {
        this.#explode(n.mesh.position, player);
        this.#scene.remove(n.mesh);
        this.#nades.splice(i, 1);
      }
    }
  }

  #explode(pos, player) {
    const ctx = { world: this.world, spawn: this.#spawn, events: this.#events, player };
    const pu = this.world.services.has(Service.Powerups) ? this.world.services.get(Service.Powerups) : null;
    const mul = pu ? pu.pointsMultiplier() : 1;
    let pts = 0;
    for (const id of [...this.world.query(ZombieTag, Transform)]) {
      const t = this.world.get(id, Transform).position;
      const dx = t.x - pos.x, dy = t.y - pos.y, dz = t.z - pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > RADIUS) continue;
      const dmg = DAMAGE * (1 - d / RADIUS); // falloff: edge zombies may survive
      const killed = damageZombie(ctx, id, dmg, { award: false, dir: { x: dx, z: dz }, force: 1.6 });
      this.#events.emit('fx:blood', { x: t.x, y: t.y + 1.1, z: t.z, dx, dz });
      pts += 10 + (killed ? 50 : 0); // 10 for a hit, +50 for a kill
    }
    if (pts) { player.points += pts * mul; this.#events.emit('score:changed', { points: player.points }); }

    // shared explosion fx (handler adds the screen shake)
    this.#events.emit('fx:explosion', { x: pos.x, y: pos.y, z: pos.z, kind: 'frag' });
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
    if (this.#holding) this.#events.emit('gadget:cook', { active: false });
    this.#holding = false;
    this.#count = MAX_NADES;
    this.#events.emit('lethal:count', { count: this.#count });
    if (this.#light) { this.#light.intensity = 0; this.#lightOn = false; }
  }
}
