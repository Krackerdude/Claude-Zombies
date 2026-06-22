import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Service } from '../core/ServiceLocator.js';
import { DecalConfig } from '../config/index.js';

/**
 * Persistent ground decals — the world remembering violence. Blood pools spread
 * under the fallen, scorch rings burn where rockets land, plasma scars where
 * energy bolts hit. These LINGER (tens of seconds) and are lit by the dynamic
 * lights, so the floor glistens near a lamp and goes black in shadow — distinct
 * from WeaponFx, which owns the brief impact bursts and short-lived spatter.
 *
 * Everything is pooled: `max` flat quads built once, the oldest recycled when
 * the pool is exhausted. Driven entirely off existing combat events, so no
 * gameplay or weapon code is touched. Toggled live via DecalConfig.enabled.
 */
export class DecalSystem extends System {
  #cfg;
  #scene;
  #slots = [];
  #cur = 0;
  #tex = {};

  init() {
    this.#cfg = DecalConfig;
    const sceneMgr = this.world.services.get(Service.Scene);
    this.#scene = sceneMgr.scene;
    const events = this.world.services.get(Service.Events);

    this.#tex = { blood: bloodDecalTexture(), scorch: scorchDecalTexture() };

    // pool of flat, upward-facing quads
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < this.#cfg.max; i++) {
      const mat = new THREE.MeshStandardMaterial({
        transparent: true, opacity: 0, depthWrite: false,
        roughness: 0.6, metalness: 0.0,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2; // lie flat on the floor
      m.visible = false;
      m.raycast = () => {};
      this.#scene.add(m);
      this.#slots.push({ mesh: m, age: 0, life: 0, fadeIn: 0.4, peak: 1, active: false });
    }

    events.on('zombie:killed', ({ x, z }) => this.#stamp('blood', x, z));
    events.on('weapon:explosion', ({ x, y, z }) => { if (y < 1.4) this.#stamp('scorch', x, z); });
    events.on('weapon:plasma', ({ x, y, z, color }) => { if (y < 1.4) this.#stamp('plasma', x, z, color); });
  }

  #stamp(kind, x, z, color) {
    if (!this.#cfg.enabled) return;
    const slot = this.#slots[this.#cur];
    this.#cur = (this.#cur + 1) % this.#slots.length;
    const m = slot.mesh;
    const mat = m.material;

    if (kind === 'blood') {
      mat.map = this.#tex.blood;
      mat.color.setHex(0x6e0206);
      mat.emissive.setHex(0x000000);
      mat.roughness = 0.45;                 // wet sheen catches the lamps
      slot.life = this.#cfg.bloodLife;
      slot.peak = 0.92;
      const sc = 1.2 + Math.random() * 1.0;
      m.scale.set(sc, sc, 1);
    } else if (kind === 'plasma') {
      const c = new THREE.Color(color ?? 0x46f060);
      mat.map = this.#tex.scorch;
      mat.color.copy(c).multiplyScalar(0.5);
      mat.emissive.copy(c).multiplyScalar(0.35); // faint residual glow
      mat.roughness = 0.7;
      slot.life = this.#cfg.scorchLife * 0.7;
      slot.peak = 0.85;
      const sc = 1.6 + Math.random() * 1.0;
      m.scale.set(sc, sc, 1);
    } else { // scorch
      mat.map = this.#tex.scorch;
      mat.color.setHex(0x141210);
      mat.emissive.setHex(0x000000);
      mat.roughness = 0.95;
      slot.life = this.#cfg.scorchLife;
      slot.peak = 0.9;
      const sc = 2.0 + Math.random() * 1.4;
      m.scale.set(sc, sc, 1);
    }
    mat.needsUpdate = true;
    // tiny y jitter + random spin so overlapping decals don't z-fight or tile.
    // Spin about LOCAL Z (which maps to world-up once the quad is laid flat by
    // rotation.x = -PI/2): that rotates the decal in its own plane and keeps it
    // dead flat. Spinning rotation.y here tilts the normal off vertical — that
    // was the jarring diagonal angle on blood / plasma / scorch.
    m.position.set(x, 0.03 + Math.random() * 0.02, z);
    m.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
    mat.opacity = 0;
    slot.age = 0;
    slot.active = true;
    m.visible = true;
  }

  update(dt) {
    for (const slot of this.#slots) {
      if (!slot.active) continue;
      slot.age += dt;
      if (slot.age >= slot.life) { slot.active = false; slot.mesh.visible = false; slot.mesh.material.opacity = 0; continue; }
      const mat = slot.mesh.material;
      // quick spread-in, long hold, gentle fade over the final 30%
      const fin = Math.min(1, slot.age / slot.fadeIn);
      const tailStart = slot.life * 0.7;
      const fade = slot.age > tailStart ? 1 - (slot.age - tailStart) / (slot.life - tailStart) : 1;
      mat.opacity = slot.peak * fin * fade;
    }
  }

  dispose() {
    for (const slot of this.#slots) {
      slot.mesh.removeFromParent();
      slot.mesh.material.dispose();
    }
    this.#slots[0]?.mesh.geometry.dispose();
    for (const t of Object.values(this.#tex)) t.dispose();
  }
}

// --- procedural decal textures (canvas; headless-safe, no getImageData) ---

function bloodDecalTexture() {
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d');
  // central pool + irregular satellite droplets
  const blob = (px, py, rad, a) => {
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, `rgba(120,2,8,${a})`);
    g.addColorStop(0.7, `rgba(90,0,6,${a * 0.85})`);
    g.addColorStop(1, 'rgba(70,0,4,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, rad, 0, 7); x.fill();
  };
  blob(s / 2, s / 2, s * 0.36, 0.95);
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2, r = s * (0.18 + Math.random() * 0.26);
    blob(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, s * (0.04 + Math.random() * 0.1), 0.8);
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

function scorchDecalTexture() {
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');   // tintable hot core
  g.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  // a few charred flecks around the rim
  x.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, r = s * (0.3 + Math.random() * 0.18);
    x.beginPath(); x.arc(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, s * (0.01 + Math.random() * 0.03), 0, 7); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}
