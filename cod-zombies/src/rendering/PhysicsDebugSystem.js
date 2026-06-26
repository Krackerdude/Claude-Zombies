import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Service } from '../core/ServiceLocator.js';

/**
 * F3 physics debug overlay. Draws, on top of everything (no depth test):
 *   - collider WIREFRAMES + joint frames (Rapier's own debug render, its colors)
 *   - CENTRE OF MASS of every dynamic body (yellow dots)
 *   - solver CONTACT POINTS (pink/red dots) — where bodies actually touch
 *
 * Pure inspection: it never touches the simulation. Toggled with F3 (works
 * while paused too, so you can freeze a corpse and look). Rebuilds its geometry
 * each frame while visible — cheap enough for a dev toggle, and always current.
 */
export class PhysicsDebugSystem extends System {
  #physics;
  #scene;
  #enabled = false;
  #group = null;
  #lines;
  #coms;
  #contacts;
  #legend = null;
  #onKey = null;

  init() {
    this.#physics = this.world.services.get(Service.Physics);
    this.#scene = this.world.services.get(Service.Scene);
    // headless stub physics has no debug hooks — bail (tests never register us)
    if (!this.#physics || typeof this.#physics.debugLines !== 'function') return;

    this.#group = new THREE.Group();
    this.#group.visible = false;

    this.#lines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.85 }),
    );
    this.#lines.frustumCulled = false;
    this.#lines.renderOrder = 999;
    this.#group.add(this.#lines);

    this.#coms = this.#makePoints(0xffd000, 0.075, 1000);     // centres of mass
    this.#contacts = this.#makePoints(0xff2a5e, 0.1, 1001);   // contact points
    this.#group.add(this.#coms, this.#contacts);

    this.#scene.add(this.#group);
    this.#buildLegend();

    // capture-phase + preventDefault so the browser's Find-on-F3 never fires
    this.#onKey = (e) => {
      if (e.code === 'F3') { e.preventDefault(); this.#toggle(); }
    };
    window.addEventListener('keydown', this.#onKey, true);
  }

  #makePoints(color, size, renderOrder) {
    const p = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ color, size, sizeAttenuation: true, depthTest: false, transparent: true }),
    );
    p.frustumCulled = false;
    p.renderOrder = renderOrder;
    return p;
  }

  #toggle() {
    this.#enabled = !this.#enabled;
    if (this.#group) this.#group.visible = this.#enabled;
    if (this.#legend) this.#legend.style.display = this.#enabled ? 'block' : 'none';
  }

  update() {
    if (!this.#enabled || !this.#group) return;

    const lines = this.#physics.debugLines();
    setAttr(this.#lines.geometry, 'position', lines.vertices, 3);
    setAttr(this.#lines.geometry, 'color', rgbaToRgb(lines.colors), 3);

    setAttr(this.#coms.geometry, 'position', this.#physics.debugComs(), 3);
    setAttr(this.#contacts.geometry, 'position', this.#physics.debugContacts(), 3);
  }

  #buildLegend() {
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;left:10px;bottom:10px;z-index:9999;display:none;font:11px monospace;' +
      'color:#cfe;background:rgba(0,0,0,0.6);padding:6px 9px;border:1px solid #2a3340;line-height:1.5;pointer-events:none';
    el.innerHTML =
      '<b>[F3] PHYSICS DEBUG</b><br>' +
      '<span style="color:#7fff7f">▭ collider</span> wireframes<br>' +
      '<span style="color:#ffd000">● centre of mass</span><br>' +
      '<span style="color:#ff2a5e">● contact point</span>';
    document.body.appendChild(el);
    this.#legend = el;
  }

  dispose() {
    if (this.#onKey) window.removeEventListener('keydown', this.#onKey, true);
    if (this.#group && this.#scene) this.#scene.remove(this.#group);
    if (this.#legend) this.#legend.remove();
  }
}

/** Set/resize a buffer attribute from a flat array (reuses storage if it fits). */
function setAttr(geo, name, arr, itemSize) {
  const f = arr instanceof Float32Array ? arr : new Float32Array(arr);
  const existing = geo.getAttribute(name);
  if (existing && existing.array.length === f.length) {
    existing.array.set(f);
    existing.needsUpdate = true;
  } else {
    geo.setAttribute(name, new THREE.BufferAttribute(f, itemSize));
  }
  geo.setDrawRange(0, f.length / itemSize);
}

/** Rapier debug colors are RGBA per vertex; THREE vertex colors want RGB. */
function rgbaToRgb(rgba) {
  const out = new Float32Array((rgba.length / 4) * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    out[j] = rgba[i];
    out[j + 1] = rgba[i + 1];
    out[j + 2] = rgba[i + 2];
  }
  return out;
}
