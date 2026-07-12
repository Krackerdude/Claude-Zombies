import * as THREE from 'three';

/**
 * Coarse group-level frustum culling (Tier 2 — visibility culling).
 *
 * three.js already frustum-culls individual leaf meshes, but to do so it walks
 * the ENTIRE scene graph every frame and tests each mesh's bounding sphere. A
 * corner perk machine or the mystery box is hundreds of merged/child meshes;
 * when the player faces away, that's hundreds of wasted tests + subtree
 * traversal per frame for something entirely off-screen.
 *
 * This registers those heavy, always-present STATIC props as culling cells:
 * each caches one world-space bounding sphere (computed once — they don't move),
 * and every rendered frame we test that single sphere against the camera
 * frustum and toggle the group's `.visible`. When a cell is hidden three.js
 * skips its whole subtree — no traversal, no per-leaf tests, no draw calls.
 *
 * Shadow-safe by construction: the test sphere is inflated by MARGIN, so a cell
 * is only hidden once it sits well outside the view — far enough that the short
 * shadow it casts under the overhead moon can't reach the visible area, and far
 * enough to absorb a frame of fast turning without popping.
 *
 * Driven from RenderSystem right before the draw call, so it always uses the
 * exact camera being rendered (no one-frame lag).
 */

// how far (metres) a cell must sit outside the frustum before it's culled —
// covers max shadow reach + animated overhang + one frame of camera rotation
const MARGIN = 3.0;

export class CullingSystem {
  #cells = [];          // { obj, sphere (padded, world-space) }
  #frustum = new THREE.Frustum();
  #vp = new THREE.Matrix4();
  #viewInv = new THREE.Matrix4();
  #enabled = true;
  #primed = false;
  // stats for verification / a future HUD readout
  culled = 0;
  total = 0;

  /** Register an always-present static group as a culling cell. */
  register(obj) {
    if (!obj) return;
    this.#cells.push({ obj, sphere: new THREE.Sphere(), ready: false });
    this.#primed = false; // (re)compute bounds lazily on next apply
  }

  setEnabled(on) {
    this.#enabled = !!on;
    if (!on) for (const c of this.#cells) c.obj.visible = true; // reveal everything when off
  }

  get enabled() { return this.#enabled; }

  /** Compute each cell's world-space bounding sphere once (props are static). */
  #prime() {
    const box = new THREE.Box3();
    for (const c of this.#cells) {
      c.obj.updateMatrixWorld(true);
      box.setFromObject(c.obj);
      if (box.isEmpty()) { c.ready = false; continue; }
      box.getBoundingSphere(c.sphere);
      c.sphere.radius += MARGIN;   // inflate → shadow- and lag-safe padded frustum
      c.ready = true;
    }
    this.#primed = true;
  }

  /** Toggle each cell's visibility against `camera`'s frustum. */
  apply(camera) {
    this.total = this.#cells.length;
    this.culled = 0;
    if (!this.#enabled || !this.#cells.length) return;
    if (!this.#primed) this.#prime();

    // We run BEFORE the renderer, so camera.matrixWorldInverse still holds last
    // frame's value — recompute it from the up-to-date world matrix ourselves.
    camera.updateMatrixWorld();
    this.#viewInv.copy(camera.matrixWorld).invert();
    this.#vp.multiplyMatrices(camera.projectionMatrix, this.#viewInv);
    this.#frustum.setFromProjectionMatrix(this.#vp);

    for (const c of this.#cells) {
      if (!c.ready) continue;
      const vis = this.#frustum.intersectsSphere(c.sphere);
      if (c.obj.visible !== vis) c.obj.visible = vis;
      if (!vis) this.culled++;
    }
  }
}
