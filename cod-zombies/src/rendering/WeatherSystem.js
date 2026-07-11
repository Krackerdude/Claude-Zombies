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
  #postFX = null;    // to pulse the volumetric fog on a lightning strike
  #rain = null;
  #rainHeads = null; // Float32Array of head positions (x,y,z) per drop
  #snow = null;
  #snowRel = null;   // Float32Array of flake positions (x,y,z) relative to the column
  #snowPhase = null;
  #snowMat = null;
  #mist = null;
  #mistRel = null;
  #mistPhase = null;
  #flash = null;
  #t = 0;
  #strikeIn = 5;
  #strikeT = -1; // >=0 while a strike envelope is playing
  #center = new THREE.Vector3();

  init() {
    const sceneMgr = this.world.services.get(Service.Scene);
    this.#scene = sceneMgr.scene;
    this.#events = this.world.services.get(Service.Events);
    const render = this.world.services.has(Service.Render) ? this.world.services.get(Service.Render) : null;
    this.#postFX = render?.postFX ?? null;

    this.#buildRain();
    this.#buildSnow();
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

  #buildSnow() {
    const s = WeatherConfig.snow;
    if (!s) return;
    this.#snowRel = new Float32Array(s.count * 3);
    this.#snowPhase = new Float32Array(s.count);
    for (let i = 0; i < s.count; i++) {
      this.#snowRel[i * 3] = (Math.random() * 2 - 1) * s.area;
      this.#snowRel[i * 3 + 1] = Math.random() * s.height;
      this.#snowRel[i * 3 + 2] = (Math.random() * 2 - 1) * s.area;
      this.#snowPhase[i] = Math.random() * 6.28;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.#snowRel, 3));
    this.#snowMat = new THREE.PointsMaterial({
      map: flakeTexture(), color: s.color, size: s.size ?? 0.11, sizeAttenuation: true,
      transparent: true, opacity: s.opacity, depthWrite: false, blending: THREE.NormalBlending, fog: false,
    });
    this.#snow = new THREE.Points(geo, this.#snowMat);
    this.#snow.frustumCulled = false;
    this.#snow.raycast = () => {};
    this.#scene.add(this.#snow);
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

    // --- snow: slow drift-fall with a gentle horizontal sway, moonlit flakes ---
    const scfg = WeatherConfig.snow;
    if (this.#snow) {
      this.#snow.visible = scfg?.enabled !== false;
      if (this.#snow.visible) {
        if (p) this.#snow.position.set(p.x, 0, p.z);
        const rel = this.#snowRel, fall = scfg.speed * dt;
        for (let i = 0; i < this.#snowPhase.length; i++) {
          const b = i * 3, ph = this.#snowPhase[i];
          rel[b + 1] -= fall;
          if (rel[b + 1] < 0) rel[b + 1] += scfg.height;             // wrap to the top
          rel[b] += Math.cos(this.#t * 0.6 + ph) * scfg.sway * dt;    // sway x
          rel[b + 2] += Math.sin(this.#t * 0.5 + ph * 1.3) * scfg.sway * dt; // sway z
          if (rel[b] > scfg.area) rel[b] -= scfg.area * 2; else if (rel[b] < -scfg.area) rel[b] += scfg.area * 2;
          if (rel[b + 2] > scfg.area) rel[b + 2] -= scfg.area * 2; else if (rel[b + 2] < -scfg.area) rel[b + 2] += scfg.area * 2;
        }
        this.#snow.geometry.attributes.position.needsUpdate = true;
      }
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
      this.#flash.intensity = i;                    // lights the geometry
      const k = Math.min(1, i / 4);
      this.#postFX?.setVolumetricFlash?.(k * 0.85); // floods the FOG cool-white — the big one
      if (this.#snowMat) this.#snowMat.opacity = (WeatherConfig.snow?.opacity ?? 0.9) * (1 + k * 0.8); // flakes glare in the flash
    } else {
      this.#strikeIn -= dt;
      if (this.#strikeIn <= 0) { this.#strikeT = 0; this.#events?.emit('weather:lightning', {}); }
    }
  }

  #restoreSky() {
    this.#flash.intensity = 0;
    this.#postFX?.setVolumetricFlash?.(0);
    if (this.#snowMat) this.#snowMat.opacity = WeatherConfig.snow?.opacity ?? 0.9;
  }

  dispose() {
    for (const o of [this.#rain, this.#snow, this.#mist]) {
      if (!o) continue;
      o.removeFromParent();
      o.geometry.dispose();
      o.material.map?.dispose();
      o.material.dispose();
    }
    this.#flash?.removeFromParent();
  }
}

/** Soft six-point snowflake blob. */
function flakeTexture() {
  const s = 32, c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.beginPath(); x.arc(s / 2, s / 2, s / 2, 0, 7); x.fill();
  return new THREE.CanvasTexture(c);
}

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
