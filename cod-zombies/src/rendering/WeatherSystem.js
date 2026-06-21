import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Service } from '../core/ServiceLocator.js';
import { PlayerTag, Transform } from '../ecs/components/index.js';
import { WeatherConfig } from '../config/index.js';

/**
 * Silent-Hill weather. Owns three isolated, player-following pieces:
 *   - Rain: a GPU LineSegments streak field falling around the camera, wrapped
 *     within a column so it's endless with no per-frame allocation.
 *   - Lightning: a non-shadow flash light + a brief sky/fog brighten on a random
 *     cadence, double-struck for that storm flicker (emits 'weather:lightning').
 *   - Ground mist: a low, slow Points band hugging the floor.
 * Each gates live on its WeatherConfig flag. Purely cosmetic; nothing here
 * touches gameplay. Headless-safe (only builds GPU objects + does math).
 */
export class WeatherSystem extends System {
  #scene;
  #events = null;
  #rain = null;
  #rainHeads = null; // Float32Array of head positions (x,y,z) per drop
  #mist = null;
  #mistRel = null;
  #mistPhase = null;
  #flash = null;
  #bgBase = new THREE.Color();
  #fogBase = new THREE.Color();
  #t = 0;
  #strikeIn = 5;
  #strikeT = -1; // >=0 while a strike envelope is playing
  #center = new THREE.Vector3();

  init() {
    const sceneMgr = this.world.services.get(Service.Scene);
    this.#scene = sceneMgr.scene;
    this.#events = this.world.services.get(Service.Events);
    if (this.#scene.background?.isColor) this.#bgBase.copy(this.#scene.background);
    if (this.#scene.fog?.color) this.#fogBase.copy(this.#scene.fog.color);

    this.#buildRain();
    this.#buildMist();

    // a broad, steep, shadowless flash light for lightning
    this.#flash = new THREE.DirectionalLight(0xcdd8ff, 0);
    this.#flash.position.set(8, 26, -6);
    this.#scene.add(this.#flash);
    this.#scene.add(this.#flash.target);

    this.#strikeIn = this.#randGap();
  }

  #randGap() {
    const l = WeatherConfig.lightning;
    return l.minGap + Math.random() * (l.maxGap - l.minGap);
  }

  #buildRain() {
    const r = WeatherConfig.rain;
    const n = r.count;
    this.#rainHeads = new Float32Array(n * 3);
    const verts = new Float32Array(n * 6); // head + tail per drop
    for (let i = 0; i < n; i++) {
      this.#rainHeads[i * 3] = (Math.random() * 2 - 1) * r.area;
      this.#rainHeads[i * 3 + 1] = Math.random() * r.height;
      this.#rainHeads[i * 3 + 2] = (Math.random() * 2 - 1) * r.area;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    const mat = new THREE.LineBasicMaterial({
      color: r.color, transparent: true, opacity: r.opacity, depthWrite: false, fog: true,
    });
    this.#rain = new THREE.LineSegments(geo, mat);
    this.#rain.frustumCulled = false;
    this.#rain.raycast = () => {};
    this.#writeRain();
    this.#scene.add(this.#rain);
  }

  #writeRain() {
    const r = WeatherConfig.rain;
    const heads = this.#rainHeads;
    const v = this.#rain.geometry.attributes.position.array;
    const slant = 0.12 * r.length;
    for (let i = 0; i < heads.length / 3; i++) {
      const x = heads[i * 3], y = heads[i * 3 + 1], z = heads[i * 3 + 2];
      const o = i * 6;
      v[o] = x; v[o + 1] = y; v[o + 2] = z;                       // head (bottom)
      v[o + 3] = x + slant; v[o + 4] = y + r.length; v[o + 5] = z; // tail (top)
    }
    this.#rain.geometry.attributes.position.needsUpdate = true;
  }

  #buildMist() {
    const m = WeatherConfig.mist;
    this.#mistRel = new Float32Array(m.count * 3);
    this.#mistPhase = new Float32Array(m.count);
    for (let i = 0; i < m.count; i++) {
      this.#mistRel[i * 3] = (Math.random() * 2 - 1) * m.area;
      this.#mistRel[i * 3 + 1] = Math.random() * m.height;
      this.#mistRel[i * 3 + 2] = (Math.random() * 2 - 1) * m.area;
      this.#mistPhase[i] = Math.random() * 6.28;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.#mistRel, 3));
    const mat = new THREE.PointsMaterial({
      map: mistTexture(), color: m.color, size: m.size ?? 3.0, sizeAttenuation: true,
      transparent: true, opacity: m.opacity, depthWrite: false, blending: THREE.NormalBlending, fog: true,
    });
    this.#mist = new THREE.Points(geo, mat);
    this.#mist.frustumCulled = false;
    this.#mist.raycast = () => {};
    this.#scene.add(this.#mist);
  }

  #playerCenter() {
    const pid = this.world.first(PlayerTag, Transform);
    if (pid === undefined) return null;
    return this.world.get(pid, Transform).position;
  }

  update(dt) {
    this.#t += dt;
    const p = this.#playerCenter();

    // --- rain ---
    const rcfg = WeatherConfig.rain;
    this.#rain.visible = rcfg.enabled !== false;
    if (this.#rain.visible) {
      if (p) this.#rain.position.set(p.x, 0, p.z);
      const heads = this.#rainHeads;
      const fall = rcfg.speed * dt;
      for (let i = 1; i < heads.length; i += 3) {
        heads[i] -= fall;
        if (heads[i] < 0) heads[i] += rcfg.height;
      }
      this.#writeRain();
    }

    // --- ground mist ---
    const mcfg = WeatherConfig.mist;
    this.#mist.visible = mcfg.enabled !== false;
    if (this.#mist.visible) {
      if (p) this.#mist.position.set(p.x, 0, p.z);
      const rel = this.#mistRel;
      for (let i = 0; i < this.#mistPhase.length; i++) {
        const ph = this.#mistPhase[i];
        rel[i * 3] += Math.cos(this.#t * 0.3 + ph) * 0.12 * dt * mcfg.area;
        rel[i * 3 + 2] += Math.sin(this.#t * 0.25 + ph * 1.3) * 0.12 * dt * mcfg.area;
        for (const a of [0, 2]) {
          const k = i * 3 + a;
          if (rel[k] > mcfg.area) rel[k] -= mcfg.area * 2; else if (rel[k] < -mcfg.area) rel[k] += mcfg.area * 2;
        }
      }
      this.#mist.geometry.attributes.position.needsUpdate = true;
    }

    // --- lightning ---
    this.#updateLightning(dt);
  }

  #updateLightning(dt) {
    if (WeatherConfig.lightning.enabled === false) {
      if (this.#flash.intensity !== 0) this.#restoreSky();
      return;
    }
    if (this.#strikeT >= 0) {
      this.#strikeT += dt;
      const t = this.#strikeT;
      let i = 0;
      if (t < 0.06) i = (t / 0.06) * 4.0;                  // strike 1 rise
      else if (t < 0.12) i = (1.0 - (t - 0.06) / 0.06) * 4.0; // fall
      else if (t < 0.16) i = 0.0;                          // dark beat
      else if (t < 0.22) i = ((t - 0.16) / 0.06) * 3.0;    // strike 2
      else if (t < 0.45) i = (1.0 - (t - 0.22) / 0.23) * 3.0; // fade
      else { this.#restoreSky(); this.#strikeT = -1; this.#strikeIn = this.#randGap(); return; }
      this.#flash.intensity = i;
      const k = Math.min(1, i / 4) * 0.6;
      if (this.#scene.background?.isColor) this.#scene.background.lerpColors(this.#bgBase, COL_FLASH, k);
      if (this.#scene.fog?.color) this.#scene.fog.color.lerpColors(this.#fogBase, COL_FLASH, k * 0.7);
    } else {
      this.#strikeIn -= dt;
      if (this.#strikeIn <= 0) { this.#strikeT = 0; this.#events?.emit('weather:lightning', {}); }
    }
  }

  #restoreSky() {
    this.#flash.intensity = 0;
    if (this.#scene.background?.isColor) this.#scene.background.copy(this.#bgBase);
    if (this.#scene.fog?.color) this.#scene.fog.color.copy(this.#fogBase);
  }

  dispose() {
    for (const o of [this.#rain, this.#mist]) {
      if (!o) continue;
      o.removeFromParent();
      o.geometry.dispose();
      o.material.map?.dispose();
      o.material.dispose();
    }
    this.#flash?.removeFromParent();
  }
}

const COL_FLASH = new THREE.Color(0xaecbff);

/** Soft round blob for a mist puff. */
function mistTexture() {
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.5)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}
