import { System } from '../ecs/System.js';

const RISE = 0.22;   // seconds for a board to slam home (snappy)
const DROP = 1.3;    // how far below its slot a board starts

/**
 * Cosmetic: shows/hides window planks with the board count, and when a board is
 * repaired it rises up out of the ground and snaps into its slot with a little
 * overshoot — like the player slapping a board back on a zombies window.
 */
export class BarrierFxSystem extends System {
  #planks; #events;
  #last = new Map();
  #rising = [];

  constructor(barrierPlanks, events) {
    super();
    this.#planks = barrierPlanks;
    this.#events = events;
  }

  init() {
    for (const [b, planks] of this.#planks) {
      this.#last.set(b, b.boards);
      planks.forEach((p, i) => { p.visible = i < b.boards; p.position.y = p.userData.homeY; });
    }
    this.#events.on('barrier:changed', () => this.#sync());
    this.#events.on('nav:changed', () => this.#sync());
  }

  #sync() {
    for (const [b, planks] of this.#planks) {
      const prev = this.#last.get(b) ?? 0;
      planks.forEach((p, i) => {
        if (i < b.boards && i >= prev) {        // newly rebuilt -> rise in
          p.visible = true;
          p.position.y = p.userData.homeY - DROP;
          this.#rising.push({ p, t: 0 });
        } else if (i < b.boards) {              // already up
          p.visible = true; p.position.y = p.userData.homeY;
        } else {                                // torn off
          p.visible = false;
        }
      });
      this.#last.set(b, b.boards);
    }
  }

  update(dt) {
    for (let k = this.#rising.length - 1; k >= 0; k--) {
      const r = this.#rising[k];
      r.t += dt / RISE;
      const e = this.#easeOutBack(Math.min(1, r.t));
      r.p.position.y = r.p.userData.homeY - DROP * (1 - e);
      if (r.t >= 1) { r.p.position.y = r.p.userData.homeY; this.#rising.splice(k, 1); }
    }
  }

  #easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; }
}
