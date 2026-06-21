import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Service } from '../core/ServiceLocator.js';
import { PlayerTag, Transform } from '../ecs/components/index.js';
import { ParticleConfig } from '../config/index.js';

/**
 * Ambient particulate — slow dust motes / drifting ash suspended in the air,
 * faint and fog-lit so they read as atmosphere rather than weather. One pooled
 * THREE.Points cloud whose volume recentres on the player every frame, so the
 * haze always surrounds the camera without ever allocating. Purely cosmetic and
 * isolated; toggled live via ParticleConfig.enabled (just hides the cloud).
 *
 * Motes live in player-relative space and wrap within a cube, so they never
 * stream off to infinity and the whole field is just a moving group + a cheap
 * per-frame attribute update.
 */
export class AmbientParticles extends System {
  #cfg;
  #points = null;
  #rel = null;     // relative offsets (the geometry's position attribute array)
  #phase = null;   // per-mote sway phase
  #t = 0;
  #center = new THREE.Vector3();

  init() {
    this.#cfg = ParticleConfig;
    const sceneMgr = this.world.services.get(Service.Scene);
    const count = this.#cfg.count;
    const vol = this.#cfg.volume;

    this.#rel = new Float32Array(count * 3);
    this.#phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.#rel[i * 3] = (Math.random() * 2 - 1) * vol;
      this.#rel[i * 3 + 1] = (Math.random() * 2 - 1) * vol;
      this.#rel[i * 3 + 2] = (Math.random() * 2 - 1) * vol;
      this.#phase[i] = Math.random() * Math.PI * 2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.#rel, 3));
    const mat = new THREE.PointsMaterial({
      map: moteTexture(),
      color: this.#cfg.color,
      size: this.#cfg.size,
      sizeAttenuation: true,
      transparent: true,
      opacity: this.#cfg.opacity,
      depthWrite: false,
      blending: THREE.NormalBlending,
      fog: true, // motes dissolve into the fog with distance — key to the mood
    });
    this.#points = new THREE.Points(geo, mat);
    this.#points.frustumCulled = false;
    this.#points.renderOrder = 2;
    this.#points.raycast = () => {}; // never intercept bullets
    sceneMgr.add(this.#points);
  }

  update(dt) {
    if (!this.#points) return;
    const on = this.#cfg.enabled;
    this.#points.visible = on;
    if (!on) return;

    // follow the player so the haze always surrounds the view
    const pid = this.world.first(PlayerTag, Transform);
    if (pid !== undefined) {
      const t = this.world.get(pid, Transform);
      this.#center.set(t.position.x, t.position.y + 1.0, t.position.z);
      this.#points.position.copy(this.#center);
    }

    this.#t += dt;
    const vol = this.#cfg.volume;
    const rise = this.#cfg.rise * dt;
    const drift = this.#cfg.drift * dt;
    const rel = this.#rel;
    for (let i = 0; i < this.#phase.length; i++) {
      const j = i * 3;
      const ph = this.#phase[i];
      rel[j] += Math.cos(this.#t * 0.6 + ph) * drift;
      rel[j + 1] += rise;
      rel[j + 2] += Math.sin(this.#t * 0.5 + ph * 1.3) * drift;
      // wrap each axis back into the cube so the field is endless
      if (rel[j] > vol) rel[j] -= vol * 2; else if (rel[j] < -vol) rel[j] += vol * 2;
      if (rel[j + 1] > vol) rel[j + 1] -= vol * 2; else if (rel[j + 1] < -vol) rel[j + 1] += vol * 2;
      if (rel[j + 2] > vol) rel[j + 2] -= vol * 2; else if (rel[j + 2] < -vol) rel[j + 2] += vol * 2;
    }
    this.#points.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    if (!this.#points) return;
    this.#points.removeFromParent();
    this.#points.geometry.dispose();
    this.#points.material.map?.dispose();
    this.#points.material.dispose();
    this.#points = null;
  }
}

/** Soft round dot for a mote — a radial alpha falloff. */
function moteTexture() {
  const s = 32;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}
