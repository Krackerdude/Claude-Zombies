import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Service } from '../core/ServiceLocator.js';

/**
 * Portal culling for the power-room annex.
 *
 * Standing in the room, the whole arena still lands in the view frustum (three.js
 * only culls the wide camera cone), but you can physically see just the slice of
 * it framed by the ~2 m doorway. This clips the arena's static decor to that
 * aperture: it builds a pyramid from the camera through the door rectangle and
 * hides any decor object whose bounding sphere lies fully outside it. The scene is
 * draw-call bound, so looking out then draws the visible slice instead of the
 * entire map.
 *
 * Two deliberate safety rails, learned from the earlier per-prop frustum cull that
 * caused eye-level jitter:
 *   1. Only STATIC decor is ever touched. We snapshot "visible at load, not a
 *      pooled/dynamic object" once; pooled things (zombies, gibs, decals, corpses)
 *      start hidden, so they're never in the set — a zombie is never culled (it's
 *      a threat you must see) and we never fight a pool's own visibility toggling.
 *   2. While culling is active the sun shadow map is FROZEN at its last full-scene
 *      bake, so a changing colour-pass caster set can't pop the shadows (the exact
 *      failure that killed the old cull). It re-bakes from the whole arena the
 *      moment you step back out.
 *
 * Runs in lateUpdate (after the camera is positioned for the frame).
 */
const _wp = new THREE.Vector3();
const _c = new THREE.Vector3();

export class PortalCullSystem extends System {
  #camera; #scene; #render; #economy; #door;
  #room; #portal;
  #items = [];        // { obj, r } — cullable static decor + cached conservative radius
  #hidden = new Set();
  #active = false;
  #primed = false;
  #planes = [new THREE.Plane(), new THREE.Plane(), new THREE.Plane(), new THREE.Plane()];
  #corners; #center;

  constructor({ room, portal } = {}) {
    super();
    this.#room = room;      // { minX, maxX, minZ, maxZ }
    this.#portal = portal;  // { minX, maxX, minY, maxY, z } — the door opening
  }

  init() {
    const s = this.world.services;
    this.#render = s.get(Service.Render);
    this.#camera = this.#render.camera;
    this.#scene = s.get(Service.Scene).scene;
    this.#economy = s.has(Service.Economy) ? s.get(Service.Economy) : null;
    this.#door = this.#economy?.door || null;
    const d = this.#portal;
    this.#corners = [
      new THREE.Vector3(d.minX, d.minY, d.z), new THREE.Vector3(d.maxX, d.minY, d.z),
      new THREE.Vector3(d.maxX, d.maxY, d.z), new THREE.Vector3(d.minX, d.maxY, d.z),
    ];
    this.#center = new THREE.Vector3((d.minX + d.maxX) / 2, (d.minY + d.maxY) / 2, d.z);
  }

  /** One-shot: collect the arena's always-visible static decor + cache a
   *  conservative bounding radius measured from each object's origin. */
  #prime() {
    this.#primed = true;
    const box = new THREE.Box3(); const sph = new THREE.Sphere();
    const roomZ = this.#portal.z + 0.5; // anything on the room side of the doorway is never culled
    for (const obj of this.#scene.children) {
      if (!obj.visible) continue;                 // pooled/dynamic things start hidden — never cull them
      if (obj.isLight || obj.isCamera) continue;  // culling lights would change the lighting
      if (obj.userData?.cell === 'room') continue; // the room's own props
      if (obj.userData?.isPlayer || obj.userData?.viewmodel) continue;
      obj.getWorldPosition(_wp);
      if (_wp.z < roomZ) continue;                 // room walls/ceiling/header/floor live here — NEVER cull them
      box.setFromObject(obj);
      if (box.isEmpty()) continue;
      box.getBoundingSphere(sph);
      const r = sph.radius + _wp.distanceTo(sph.center); // conservative from the object's origin
      if (r > 11) continue;                        // skip the big merged arena shell/floor (cheap + would look broken)
      this.#items.push({ obj, r });
    }
  }

  #inRoom() {
    const p = this.#camera.position, r = this.#room;
    return p.z <= r.maxZ + 0.2 && p.z >= r.minZ - 1 && p.x >= r.minX - 1 && p.x <= r.maxX + 1;
  }

  #buildPlanes() {
    const cam = this.#camera.position;
    for (let i = 0; i < 4; i++) {
      const a = this.#corners[i], b = this.#corners[(i + 1) % 4];
      const pl = this.#planes[i].setFromCoplanarPoints(cam, a, b);
      if (pl.distanceToPoint(this.#center) < 0) pl.negate(); // face inward (door centre on +side)
    }
  }

  #show(obj) { if (this.#hidden.has(obj)) { obj.visible = true; this.#hidden.delete(obj); } }

  #release() {
    for (const obj of this.#hidden) obj.visible = true;
    this.#hidden.clear();
    this.#active = false;
    // Hand the sun shadow back to ShadowSystem's caching mode (autoUpdate stays
    // OFF there) and force ONE fresh bake now that the full arena is un-culled.
    const sun = this.#render.sunLight;
    if (sun) { sun.shadow.autoUpdate = false; sun.shadow.needsUpdate = true; }
  }

  lateUpdate() {
    if (!this.world.services.get(Service.GameState).isPlaying) { if (this.#active) this.#release(); return; }
    if (!this.#primed) this.#prime();

    // Cull only when inside the room with the door actually open (you can't be in
    // here otherwise). Outside those conditions, restore anything we hid.
    const on = this.#inRoom() && (!this.#door || this.#door.open);
    if (!on) { if (this.#active) this.#release(); return; }

    this.#active = true;
    // Freeze the sun shadow at its current (full-scene) bake for as long as we cull.
    if (this.#render.sunLight) { this.#render.sunLight.shadow.autoUpdate = false; this.#render.sunLight.shadow.needsUpdate = false; }

    this.#buildPlanes();
    const planes = this.#planes;
    for (const it of this.#items) {
      const obj = it.obj;
      obj.getWorldPosition(_c);
      let outside = false;
      for (let i = 0; i < 4; i++) { if (planes[i].distanceToPoint(_c) < -it.r) { outside = true; break; } }
      if (outside) { if (!this.#hidden.has(obj)) { obj.visible = false; this.#hidden.add(obj); } }
      else this.#show(obj);
    }
  }
}
