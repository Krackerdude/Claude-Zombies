import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Service } from '../core/ServiceLocator.js';
import { goreMaterials } from '../ai/dismember.js';
import { NO_AO_LAYER } from './aoMask.js';

/**
 * Bloody gibs: when a limb is shot off or a head is blown apart, the wound
 * bursts into a spray of meat chunks that fly out, tumble, bounce and roll on
 * the floor for a moment, then shrink away. Pure presentation, event-driven and
 * pooled — a fixed ring of chunk records recycled oldest-first, integrated with
 * a tiny ballistic solver (gravity + a damped floor bounce) of its own so it
 * never touches Rapier or the gameplay sim.
 *
 * PERF (Tier 1): the pool is rendered with InstancedMesh, not one Mesh per gib.
 * Gibs only ever come in four SHAPES paired with a handful of shared gore
 * materials, so the whole spray draws as ~6 instanced meshes (one per distinct
 * shape+material combo) instead of up to 72 individual draw calls / scene-graph
 * nodes. Each frame we recompose the per-instance matrices for the live gibs of
 * every combo — trivial for a pool this size, and the visuals are identical
 * (same geometry, same materials, same per-gib transform).
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
  #combos = [];        // { geo, mat, inst, count, prev }
  // scratch objects reused every frame while rebuilding instance matrices
  #mat4 = new THREE.Matrix4();
  #pos = new THREE.Vector3();
  #quat = new THREE.Quaternion();
  #euler = new THREE.Euler();
  #scl = new THREE.Vector3();

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
    // weighted toward muscle.
    this.#palette = [
      { mat: M.blood, geo: this.#geo.chunk, form: 'chunk' },
      { mat: M.muscle, geo: this.#geo.strip, form: 'strip' },
      { mat: M.muscle, geo: this.#geo.chunk, form: 'chunk' },
      { mat: M.gut, geo: this.#geo.blob, form: 'blob' },
      { mat: M.muscle, geo: this.#geo.strip, form: 'strip' },
      { mat: M.fat, geo: this.#geo.blob, form: 'blob' },
      { mat: M.bone, geo: this.#geo.shard, form: 'shard' },
    ];

    // Collapse the palette to its distinct (geometry, material) combos and back
    // each with one InstancedMesh. Every palette entry records the combo index a
    // gib picking it should render into.
    for (const p of this.#palette) {
      let ci = this.#combos.findIndex((c) => c.geo === p.geo && c.mat === p.mat);
      if (ci < 0) {
        const inst = new THREE.InstancedMesh(p.geo, p.mat, MAX_GIBS);
        inst.count = 0;
        inst.frustumCulled = false;      // instances are scattered; a single bounds would mis-cull
        inst.castShadow = false;
        inst.raycast = () => {};
        inst.layers.enable(NO_AO_LAYER); // gore/blood is FX — never darken it with AO
        inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.#scene.add(inst);
        ci = this.#combos.push({ geo: p.geo, mat: p.mat, inst, count: 0, prev: 0 }) - 1;
      }
      p.combo = ci;
    }

    for (let i = 0; i < MAX_GIBS; i++) {
      this.#gibs.push({
        active: false, age: 0, life: 0, rest: false, radius: 0.03, combo: 0, k: 1,
        px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0,
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

      g.active = true; g.rest = false; g.age = 0; g.k = 1;
      g.life = 1.5 + Math.random() * 1.3;          // ~1.5–2.8s on the floor
      const pick = this.#palette[(Math.random() * this.#palette.length) | 0];
      g.combo = pick.combo;
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
      g.px = x + _r(0.12); g.py = y + _r(0.12); g.pz = z + _r(0.12);
      g.rx = Math.random() * 6.28; g.ry = Math.random() * 6.28; g.rz = Math.random() * 6.28;

      // velocity: a push along the bullet, a wide random scatter, an upward pop
      const spd = speed * (0.5 + Math.random());
      g.vx = ndx * spd * 0.7 + _r(spd * 1.4);
      g.vz = ndz * spd * 0.7 + _r(spd * 1.4);
      g.vy = 1.8 + Math.random() * 3.6;
      g.ax = _r(24); g.ay = _r(24); g.az = _r(24); // fast tumble
    }
  }

  update(dt) {
    if (dt > 0.05) dt = 0.05; // clamp big hitches so gibs don't tunnel the floor
    for (const g of this.#gibs) {
      if (!g.active) continue;
      g.age += dt;
      if (g.age >= g.life) {
        g.active = false;
        // a wet chunk that came to rest on the floor soaks in a little smear of
        // blood as it decays away — bone stays clean, and only some do it so the
        // floor doesn't tile red. (Airborne gibs that never landed leave nothing.)
        if (g.landed && !g.pooled && g.form !== 'shard' && Math.random() < 0.5) {
          this.#events.emit('fx:decal', {
            kind: 'blood', x: g.px, y: 0.02, z: g.pz,
            nx: 0, ny: 1, nz: 0, size: 0.18 + Math.random() * 0.16,
          });
        }
        continue;
      }

      if (!g.rest) {
        g.vy -= GRAVITY * dt;
        g.px += g.vx * dt;
        g.py += g.vy * dt;
        g.pz += g.vz * dt;
        g.rx += g.ax * dt;
        g.ry += g.ay * dt;
        g.rz += g.az * dt;

        const floor = FLOOR + g.radius;
        if (g.py <= floor) {
          g.py = floor;
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
      g.k = g.age > tail ? Math.max(0, 1 - (g.age - tail) / 0.4) : 1;
    }

    this.#flush();
  }

  /** Recompose the per-instance matrices for every combo from the live gibs. */
  #flush() {
    for (const c of this.#combos) c.count = 0;
    for (const g of this.#gibs) {
      if (!g.active) continue;
      this.#euler.set(g.rx, g.ry, g.rz);
      this.#quat.setFromEuler(this.#euler);
      this.#pos.set(g.px, g.py, g.pz);
      this.#scl.set(g.sx * g.k, g.sy * g.k, g.sz * g.k);
      this.#mat4.compose(this.#pos, this.#quat, this.#scl);
      const c = this.#combos[g.combo];
      c.inst.setMatrixAt(c.count++, this.#mat4);
    }
    for (const c of this.#combos) {
      // only re-upload a combo whose instance buffer actually has (or just lost)
      // live gibs this frame
      if (c.count > 0 || c.prev > 0) c.inst.instanceMatrix.needsUpdate = true;
      c.inst.count = c.count;
      c.prev = c.count;
    }
  }

  dispose() {
    for (const c of this.#combos) { c.inst.removeFromParent(); c.inst.dispose(); }
    for (const geo of Object.values(this.#geo)) geo.dispose();
  }
}
