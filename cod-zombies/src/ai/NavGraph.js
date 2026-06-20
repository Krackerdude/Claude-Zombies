import { NavConfig } from '../config/zombies.js';

const SQRT2 = Math.SQRT2;

/** Minimal binary min-heap keyed by f-score, storing cell indices. */
class MinHeap {
  #items = []; // [idx, f]
  get size() { return this.#items.length; }
  push(idx, f) {
    const a = this.#items;
    a.push([idx, f]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][1] <= a[i][1]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.#items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let s = i;
        if (l < a.length && a[l][1] < a[s][1]) s = l;
        if (r < a.length && a[r][1] < a[s][1]) s = r;
        if (s === i) break;
        [a[s], a[i]] = [a[i], a[s]];
        i = s;
      }
    }
    return top[0];
  }
}

/**
 * A uniform grid navigation graph generated over the arena bounds. Cells are
 * either solid (permanent obstacle), a barrier gap (gated), or open. Pathfinding
 * is 8-connected A* with no corner-cutting and a pluggable agent that decides
 * which cells it may enter and at what extra cost (so zombies will route through
 * boarded windows, with a penalty, while the player would not).
 *
 * "Generated": the scene builder declares obstacle rects + barrier gaps; this
 * rasterises them into the grid. When a barrier opens/closes, no rebuild is
 * needed — the cell stays a barrier cell and the agent predicate re-evaluates,
 * so live replans see the new topology immediately.
 */
export class NavGraph {
  constructor(bounds) {
    const cs = NavConfig.cellSize;
    this.cs = cs;
    this.minX = bounds.minX;
    this.minZ = bounds.minZ;
    this.cols = Math.ceil((bounds.maxX - bounds.minX) / cs);
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / cs);
    const n = this.cols * this.rows;

    this.solid = new Uint8Array(n);
    this.cellBarrier = new Int16Array(n).fill(-1);
    this.barriers = []; // Barrier[]
    this.barrierPenalty = NavConfig.barrierPenalty;

    // scratch buffers reused across A* calls (avoids per-call allocation)
    this._g = new Float32Array(n);
    this._f = new Float32Array(n);
    this._came = new Int32Array(n);
    this._gen = new Int32Array(n); // visit stamp per search
    this._stamp = 0;
  }

  // --- indexing -----------------------------------------------------------
  index(col, row) { return row * this.cols + col; }
  inBounds(col, row) { return col >= 0 && row >= 0 && col < this.cols && row < this.rows; }
  colOf(i) { return i % this.cols; }
  rowOf(i) { return (i / this.cols) | 0; }

  worldOf(i) {
    return {
      x: this.minX + (this.colOf(i) + 0.5) * this.cs,
      z: this.minZ + (this.rowOf(i) + 0.5) * this.cs,
    };
  }

  cellAt(x, z) {
    const col = Math.floor((x - this.minX) / this.cs);
    const row = Math.floor((z - this.minZ) / this.cs);
    return this.inBounds(col, row) ? this.index(col, row) : -1;
  }

  // --- authoring ----------------------------------------------------------

  /** Mark all cells overlapping a world-space rect as solid (inflated by agentRadius). */
  markSolidRect(minX, minZ, maxX, maxZ) {
    const r = NavConfig.agentRadius;
    const c0 = Math.max(0, Math.floor((minX - r - this.minX) / this.cs));
    const c1 = Math.min(this.cols - 1, Math.floor((maxX + r - this.minX) / this.cs));
    const r0 = Math.max(0, Math.floor((minZ - r - this.minZ) / this.cs));
    const r1 = Math.min(this.rows - 1, Math.floor((maxZ + r - this.minZ) / this.cs));
    for (let row = r0; row <= r1; row++)
      for (let col = c0; col <= c1; col++) this.solid[this.index(col, row)] = 1;
  }

  /** Register a barrier and bind the grid cells it occupies (clearing solid there). */
  addBarrier(barrier, footprint) {
    const id = this.barriers.length;
    this.barriers.push(barrier);
    const { minX, minZ, maxX, maxZ } = footprint;
    const c0 = Math.max(0, Math.floor((minX - this.minX) / this.cs));
    const c1 = Math.min(this.cols - 1, Math.floor((maxX - this.minX) / this.cs));
    const r0 = Math.max(0, Math.floor((minZ - this.minZ) / this.cs));
    const r1 = Math.min(this.rows - 1, Math.floor((maxZ - this.minZ) / this.cs));
    for (let row = r0; row <= r1; row++)
      for (let col = c0; col <= c1; col++) {
        const i = this.index(col, row);
        this.solid[i] = 0;
        this.cellBarrier[i] = id;
      }
    return barrier;
  }

  barrierOf(i) {
    const b = this.cellBarrier[i];
    return b >= 0 ? this.barriers[b] : null;
  }

  // --- agent traversal rules ---------------------------------------------

  /** Can this agent stand on cell i right now? */
  canEnter(i, agent) {
    if (this.solid[i]) return false;
    const bId = this.cellBarrier[i];
    if (bId < 0) return true; // ordinary floor
    const b = this.barriers[bId];
    // A committed zombie may ONLY pass through its assigned window — every other
    // barrier (open or not) is a wall to it. This is what keeps each zombie on
    // the window nearest its spawn instead of funnelling to whichever opens.
    if (agent.tearsBarriers && agent.viaBarrier != null) {
      if (bId !== agent.viaBarrier) return false;
      return b.open || b.teardownable;
    }
    if (b.open) return true;
    return agent.tearsBarriers && b.teardownable;
  }

  enterPenalty(i, agent) {
    const bId = this.cellBarrier[i];
    if (bId < 0) return 0;
    const b = this.barriers[bId];
    if (b && !b.open && agent.tearsBarriers && b.teardownable) return this.barrierPenalty;
    return 0;
  }

  /** Nearest enterable cell to a world point, spiralling outward. */
  nearestWalkable(x, z, agent) {
    const start = this.cellAt(x, z);
    if (start >= 0 && this.canEnter(start, agent)) return start;
    const sc = Math.floor((x - this.minX) / this.cs);
    const sr = Math.floor((z - this.minZ) / this.cs);
    for (let ring = 1; ring < Math.max(this.cols, this.rows); ring++) {
      for (let dr = -ring; dr <= ring; dr++)
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const col = sc + dc, row = sr + dr;
          if (!this.inBounds(col, row)) continue;
          const i = this.index(col, row);
          if (this.canEnter(i, agent)) return i;
        }
    }
    return -1;
  }

  // --- A* -----------------------------------------------------------------

  /**
   * @returns {number[]|null} array of cell indices start..goal, or null.
   */
  findPath(start, goal, agent) {
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [start];

    const stamp = ++this._stamp;
    const { _g: g, _f: f, _came: came, _gen: gen } = this;
    const open = new MinHeap();

    gen[start] = stamp;
    g[start] = 0;
    f[start] = this.#h(start, goal);
    came[start] = -1;
    open.push(start, f[start]);

    const cols = this.cols;
    const gcol = this.colOf(goal), grow = this.rowOf(goal);

    while (open.size) {
      const cur = open.pop();
      if (cur === goal) return this.#reconstruct(came, goal);

      const ccol = cur % cols;
      const crow = (cur / cols) | 0;

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dc === 0 && dr === 0) continue;
          const ncol = ccol + dc, nrow = crow + dr;
          if (!this.inBounds(ncol, nrow)) continue;
          const ni = nrow * cols + ncol;
          if (!this.canEnter(ni, agent)) continue;

          const diag = dc !== 0 && dr !== 0;
          if (diag) {
            if (!NavConfig.diagonal) continue;
            // no corner cutting: both orthogonal cells must be enterable
            if (!this.canEnter(crow * cols + ncol, agent) || !this.canEnter(nrow * cols + ccol, agent)) continue;
          }

          const step = (diag ? SQRT2 : 1) + this.enterPenalty(ni, agent);
          const tentative = g[cur] + step;
          if (gen[ni] !== stamp || tentative < g[ni]) {
            gen[ni] = stamp;
            g[ni] = tentative;
            came[ni] = cur;
            const fi = tentative + this.#hcr(ncol, nrow, gcol, grow);
            f[ni] = fi;
            open.push(ni, fi);
          }
        }
      }
    }
    return null;
  }

  #h(i, goal) {
    return this.#hcr(this.colOf(i), this.rowOf(i), this.colOf(goal), this.rowOf(goal));
  }
  #hcr(c, r, gc, gr) {
    const dx = Math.abs(c - gc), dy = Math.abs(r - gr);
    return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy); // octile
  }

  #reconstruct(came, goal) {
    const path = [goal];
    let c = came[goal];
    while (c !== -1) { path.push(c); c = came[c]; }
    path.reverse();
    return path;
  }

  /** Convert a cell-index path to world waypoints {x,z}. */
  toWorld(path) {
    return path.map((i) => this.worldOf(i));
  }
}

/** Shared agent descriptor for the undead (tears boardable barriers). */
export const ZOMBIE_AGENT = { tearsBarriers: true };
