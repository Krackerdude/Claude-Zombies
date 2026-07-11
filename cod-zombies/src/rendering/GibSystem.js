import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Service } from '../core/ServiceLocator.js';
import { goreMaterials } from '../ai/dismember.js';
import { NO_AO_LAYER } from './aoMask.js';

/**
 * Bloody gibs: when a limb is shot off or a head is blown apart, the wound
 * bursts into a spray of meat chunks that fly out, tumble, bounce and roll on
 * the floor for a moment, then shrink away. Pure presentation, event-driven and
 * pooled — a fixed ring of chunk meshes recycled oldest-first, integrated with
 * a tiny ballistic solver (gravity + a damped floor bounce) of its own so it
 * never touches Rapier or the gameplay sim.
 *
 * Driven entirely off the `zombie:gib` event emitted by the damage code.
 */
const GRAVITY = 17;     // snappy fall
const FLOOR = 0.0;      // world ground plane
const MAX_GIBS = 72;

const _r = (s) => (Math.random() - 0.5) * s;

export class GibSystem extends System {
  #scene;
  #events;
  #gibs = [];
  #cur = 0;
  #palette = [];
  #geo = {};

  init() {
    this.#scene = this.world.services.get(Service.Scene).scene;
    const events = this.world.services.get(Service.Events);
    this.#events = events;
    const M = goreMaterials();

    // A little library of gib SHAPES so the spray reads as torn anatomy, not a
    // cloud of identical cubes: rough meat chunks, long stringy strips, rounded
    // organ blobs, and jagged bone shards. Unit-sized; per-gib scale sculpts them.
    this.#geo = {
      chunk: new THREE.BoxGeometry(1, 1, 1),
      strip: new THREE.BoxGeometry(1, 0.34, 0.5),        // meat/sinew strip
      blob: new THREE.IcosahedronGeometry(0.62, 0),      // organ glob (faceted, wet)
      shard: new THREE.ConeGeometry(0.4, 1.3, 5),        // bone splinter
    };
    // each palette entry pairs a wet material with the shape it tends to fly as,
    // weighted toward muscle. dl = how elongated the scale should be (strips/shards).
    this.#palette = [
      { mat: M.blood, geo: this.#geo.chunk, form: 'chunk' },
      { mat: M.muscle, geo: this.#geo.strip, form: 'strip' },
      { mat: M.muscle, geo: this.#geo.chunk, form: 'chunk' },
      { mat: M.gut, geo: this.#geo.blob, form: 'blob' },
      { mat: M.muscle, geo: this.#geo.strip, form: 'strip' },
      { mat: M.fat, geo: this.#geo.blob, form: 'blob' },
      { mat: M.bone, geo: this.#geo.shard, form: 'shard' },
    ];

    for (let i = 0; i < MAX_GIBS; i++) {
      const mesh = new THREE.Mesh(this.#geo.chunk, M.muscle);
      mesh.visible = false;
      mesh.castShadow = false;
      mesh.raycast = () => {};
      mesh.layers.enable(NO_AO_LAYER); // gore/blood is FX — never darken it with AO
      this.#scene.add(mesh);
      this.#gibs.push({
        mesh, active: false, age: 0, life: 0, rest: false, radius: 0.03,
        vx: 0, vy: 0, vz: 0, ax: 0, ay: 0, az: 0, sx: 0.05, sy: 0.05, sz: 0.05,
      });
    }

    events.on('zombie:gib', (e) => this.#burst(e));
  }

  /** Spray `count` gibs from (x,y,z), thrown outward along the bullet `dir`. */
  #burst({ x, y, z, dir = null, count = 8, speed = 3.2, scale = 1 }) {
    const dx = dir?.x ?? 0, dz = dir?.z ?? 0;
    const dl = Math.hypot(dx, dz) || 1;
    const ndx = dx / dl, ndz = dz / dl;

    for (let i = 0; i < count; i++) {
      const g = this.#gibs[this.#cur];
      this.#cur = (this.#cur + 1) % this.#gibs.length;
      const m = g.mesh;

      g.active = true; g.rest = false; g.age = 0;
      g.life = 1.5 + Math.random() * 1.3;          // ~1.5–2.8s on the floor
      const pick = this.#palette[(Math.random() * this.#palette.length) | 0];
      m.material = pick.mat;
      m.geometry = pick.geo;
      g.form = pick.form;
      g.pooled = false; g.landed = false; // hasn't left a resting blood mark / touched floor yet

      const base = (0.045 + Math.random() * 0.06) * scale;
      // sculpt the scale to the shape: strips run long, shards run long+thin,
      // chunks/blobs stay roughly cubic. Keeps each form recognisable in flight.
      if (pick.form === 'strip') {
        g.sx = base * (1.4 + Math.random() * 1.2); g.sy = base * (0.5 + Math.random() * 0.3); g.sz = base * (0.7 + Math.random() * 0.5);
      } else if (pick.form === 'shard') {
        g.sx = base * (0.5 + Math.random() * 0.3); g.sy = base * (1.6 + Math.random() * 1.2); g.sz = base * (0.5 + Math.random() * 0.3);
      } else {
        g.sx = base * (0.7 + Math.random() * 0.8); g.sy = base * (0.7 + Math.random() * 0.8); g.sz = base * (0.7 + Math.random() * 0.8);
      }
      g.radius = Math.min(g.sx, g.sy, g.sz) * 0.5;
      m.scale.set(g.sx, g.sy, g.sz);
      m.position.set(x + _r(0.12), y + _r(0.12), z + _r(0.12));
      m.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);

      // velocity: a push along the bullet, a wide random scatter, an upward pop
      const spd = speed * (0.5 + Math.random());
      g.vx = ndx * spd * 0.7 + _r(spd * 1.4);
      g.vz = ndz * spd * 0.7 + _r(spd * 1.4);
      g.vy = 1.8 + Math.random() * 3.6;
      g.ax = _r(24); g.ay = _r(24); g.az = _r(24); // fast tumble
      m.visible = true;
    }
  }

  update(dt) {
    if (dt > 0.05) dt = 0.05; // clamp big hitches so gibs don't tunnel the floor
    for (const g of this.#gibs) {
      if (!g.active) continue;
      g.age += dt;
      if (g.age >= g.life) {
        g.active = false; g.mesh.visible = false;
        // a wet chunk that came to rest on the floor soaks in a little smear of
        // blood as it decays away — bone stays clean, and only some do it so the
        // floor doesn't tile red. (Airborne gibs that never landed leave nothing.)
        if (g.landed && !g.pooled && g.form !== 'shard' && Math.random() < 0.5) {
          this.#events.emit('fx:decal', {
            kind: 'blood', x: g.mesh.position.x, y: 0.02, z: g.mesh.position.z,
            nx: 0, ny: 1, nz: 0, size: 0.18 + Math.random() * 0.16,
          });
        }
        continue;
      }
      const m = g.mesh;

      if (!g.rest) {
        g.vy -= GRAVITY * dt;
        m.position.x += g.vx * dt;
        m.position.y += g.vy * dt;
        m.position.z += g.vz * dt;
        m.rotation.x += g.ax * dt;
        m.rotation.y += g.ay * dt;
        m.rotation.z += g.az * dt;

        const floor = FLOOR + g.radius;
        if (m.position.y <= floor) {
          m.position.y = floor;
          g.landed = true;                   // touched the floor → eligible for a resting smear
          if (g.vy < -0.5) {                 // still moving: bounce + lose energy
            g.vy = -g.vy * 0.3;
            g.vx *= 0.62; g.vz *= 0.62;
            g.ax *= 0.5; g.ay *= 0.5; g.az *= 0.5;
          } else {                            // settle: slide to a stop then rest
            g.vy = 0; g.vx *= 0.7; g.vz *= 0.7;
            g.ax *= 0.6; g.az *= 0.6;
            if (Math.hypot(g.vx, g.vz) < 0.08) { g.rest = true; g.ax = g.ay = g.az = 0; }
          }
        }
      }

      // shrink away over the final 0.4s so they vanish cleanly (shared materials,
      // so we can't fade opacity — scaling to nothing reads fine for tiny gibs)
      const tail = g.life - 0.4;
      if (g.age > tail) {
        const k = Math.max(0, 1 - (g.age - tail) / 0.4);
        m.scale.set(g.sx * k, g.sy * k, g.sz * k);
      }
    }
  }

  dispose() {
    for (const g of this.#gibs) g.mesh.removeFromParent();
    for (const geo of Object.values(this.#geo)) geo.dispose();
  }
}
