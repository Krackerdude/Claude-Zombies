import * as THREE from 'three';
import { System } from '../ecs/System.js';

const RISE = 0.16;   // seconds for a board to slam home (snappier)
const DROP = 1.3;    // how far below its slot a board starts when rebuilt
const TEAR = 0.32;   // seconds for a torn board to be ripped off and flung away

/**
 * Cosmetic barrier life: shows/hides window planks with the board count and
 * plays the transitions.
 *   - Repair: the board rises out of the ground and snaps into its slot with a
 *     little overshoot (snappy) — the player slapping a board back on.
 *   - Tear-down: instead of vanishing, the board is wrenched outward + down with
 *     a violent spin, then hidden — reads as a zombie ripping it off.
 *   - Both kick out a burst of sawdust at the board.
 */
export class BarrierFxSystem extends System {
  #planks; #events; #scene;
  #last = new Map();
  #rising = [];
  #tearing = [];
  #dust = [];        // pooled sawdust particles
  #dustNext = 0;

  constructor(barrierPlanks, events, scene) {
    super();
    this.#planks = barrierPlanks;
    this.#events = events;
    this.#scene = scene;
  }

  init() {
    for (const [b, planks] of this.#planks) {
      this.#last.set(b, b.boards);
      planks.forEach((p, i) => {
        p.userData.homeX = p.position.x;   // slot centre, to snap back to after a tear
        p.userData.homeZ = p.position.z;
        p.visible = i < b.boards;
        p.position.y = p.userData.homeY;
      });
    }
    if (this.#scene) this.#initDust();
    this.#events.on('barrier:changed', () => this.#sync());
    this.#events.on('nav:changed', () => this.#sync());
  }

  // --- sawdust pool -------------------------------------------------------

  #initDust() {
    const geo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    const mat = new THREE.MeshBasicMaterial({ color: 0xc7a86a, fog: true });
    for (let i = 0; i < 96; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.userData.vel = new THREE.Vector3();
      m.userData.spin = new THREE.Vector3();
      m.userData.life = 0; m.userData.maxLife = 1;
      this.#scene.add(m);
      this.#dust.push(m);
    }
  }

  #burst(x, y, z, n = 12) {
    if (!this.#dust.length) return;
    for (let k = 0; k < n; k++) {
      const m = this.#dust[this.#dustNext = (this.#dustNext + 1) % this.#dust.length];
      m.visible = true;
      m.position.set(x + (Math.random() - 0.5) * 0.4, y + (Math.random() - 0.5) * 0.5, z + (Math.random() - 0.5) * 0.4);
      const s = 0.5 + Math.random() * 0.7;
      m.scale.setScalar(s);
      m.userData.vel.set((Math.random() - 0.5) * 2.4, 0.6 + Math.random() * 2.2, (Math.random() - 0.5) * 2.4);
      m.userData.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      m.userData.maxLife = 0.4 + Math.random() * 0.35;
      m.userData.life = m.userData.maxLife;
      m.userData.s0 = s;
    }
  }

  // --- board count -> visuals --------------------------------------------

  #sync() {
    for (const [b, planks] of this.#planks) {
      const prev = this.#last.get(b) ?? 0;
      planks.forEach((p, i) => {
        if (i < b.boards && i >= prev) {            // newly rebuilt -> rise in
          this.#cancelAnims(p);
          p.visible = true;
          p.rotation.copy(p.userData.homeRot);
          p.scale.setScalar(1);
          p.position.set(p.userData.homeX, p.userData.homeY - DROP, p.userData.homeZ);
          this.#rising.push({ p, t: 0 });
          this.#burst(p.userData.homeX, p.userData.homeY, p.userData.homeZ, 10);
        } else if (i < b.boards) {                  // already up
          p.visible = true; p.position.y = p.userData.homeY;
        } else if (i < prev) {                       // newly torn -> wrench off
          this.#cancelAnims(p);
          const dx = p.userData.homeX, dz = p.userData.homeZ;
          const len = Math.hypot(dx, dz) || 1;
          this.#tearing.push({ p, t: 0, ox: dx / len, oz: dz / len, spin: (Math.random() < 0.5 ? -1 : 1) * 9 });
          this.#burst(p.userData.homeX, p.userData.homeY, p.userData.homeZ, 12);
        } else {                                     // already absent
          p.visible = false;
        }
      });
      this.#last.set(b, b.boards);
    }
  }

  update(dt) {
    // rebuilt boards rising into their slot
    for (let k = this.#rising.length - 1; k >= 0; k--) {
      const r = this.#rising[k];
      r.t += dt / RISE;
      const e = this.#easeOutBack(Math.min(1, r.t));
      r.p.position.y = r.p.userData.homeY - DROP * (1 - e);
      if (r.t >= 1) { r.p.position.y = r.p.userData.homeY; this.#rising.splice(k, 1); }
    }

    // torn boards being flung outward + down with a spin, then hidden
    for (let k = this.#tearing.length - 1; k >= 0; k--) {
      const r = this.#tearing[k];
      r.t += dt / TEAR;
      const e = Math.min(1, r.t);
      const p = r.p;
      p.position.y = p.userData.homeY - 0.9 * e * e;                 // fall away
      p.position.x += r.ox * 3.2 * dt;                               // wrench outward
      p.position.z += r.oz * 3.2 * dt;
      p.rotation.z += r.spin * dt;
      p.scale.setScalar(Math.max(0.001, 1 - e));                     // shrink out
      if (r.t >= 1) {                                                 // park it back home, hidden
        p.visible = false;
        p.scale.setScalar(1);
        p.rotation.copy(p.userData.homeRot);
        p.position.set(p.userData.homeX, p.userData.homeY, p.userData.homeZ);
        this.#tearing.splice(k, 1);
      }
    }

    // sawdust motes
    for (const m of this.#dust) {
      if (!m.visible) continue;
      const u = m.userData;
      u.life -= dt;
      if (u.life <= 0) { m.visible = false; continue; }
      u.vel.y -= 9 * dt;                                             // gravity
      m.position.x += u.vel.x * dt;
      m.position.y += u.vel.y * dt;
      m.position.z += u.vel.z * dt;
      m.rotation.x += u.spin.x * dt; m.rotation.y += u.spin.y * dt; m.rotation.z += u.spin.z * dt;
      m.scale.setScalar(u.s0 * (u.life / u.maxLife));               // shrink as it settles
    }
  }

  /** Drop any in-flight rise/tear anim for a plank so the two never fight. */
  #cancelAnims(p) {
    this.#rising = this.#rising.filter((r) => r.p !== p);
    this.#tearing = this.#tearing.filter((r) => r.p !== p);
  }

  #easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; }
}
