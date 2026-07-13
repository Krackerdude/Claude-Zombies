import { System } from '../ecs/System.js';
import { Service } from '../core/ServiceLocator.js';
import { AtmosphereConfig } from '../config/index.js';

/**
 * Dynamic-light atmosphere. Walks a small set of opted-in practical lights and
 * layers a deterministic flicker/pulse onto their intensity so the scene
 * breathes — guttering filament lamps, an unsteady fluorescent, a slow cold
 * pulse on the fills. Purely cosmetic and fully isolated: it only ever touches
 * lights handed to it, snapshots their base intensity once, and restores it the
 * moment the effect is disabled. No gameplay, no allocations per frame.
 *
 * Each light may carry `userData.flicker = { depth, speed, drop }` to override
 * the global feel; absent that, the AtmosphereConfig defaults apply.
 */
export class AtmosphereSystem extends System {
  #lights;
  #cones;
  #cfg;
  #t = 0;
  #wasEnabled = true;
  #camera = null;

  constructor(lights = [], cfg = AtmosphereConfig, cones = []) {
    super();
    this.#cfg = cfg;
    this.#cones = cones;
    this.#lights = lights.map((light, i) => {
      const f = light.userData.flicker || {};
      return {
        light,
        base: light.intensity,
        depth: f.depth ?? 1,
        speed: f.speed ?? 1,
        drop: f.drop ?? 0,     // 0..1 chance-weight of brief brown-outs
        seed: f.seed ?? i * 13.37 + 0.5,
      };
    });
  }

  init() {
    const s = this.world.services;
    if (s.has(Service.Render)) this.#camera = s.get(Service.Render).camera;
  }

  update(dt) {
    // Practicals gated behind the map power switch carry `userData.powerOn=false`
    // until it's thrown. We scale their intensity (and hide their beams) rather
    // than toggling `.visible`, so the scene's light COUNT never changes and no
    // shader recompile (freeze) happens when power flips on. Ungated lights have
    // powerOn === undefined → gate 1.
    const gate = (o) => (o.userData.powerOn === false ? 0 : 1);
    if (!this.#cfg.enabled) {
      if (this.#wasEnabled) { // settle every light back to its authored value once
        for (const e of this.#lights) e.light.intensity = e.base * gate(e.light);
        this.#wasEnabled = false;
      }
      for (const c of this.#cones) c.visible = false;
      return;
    }
    this.#wasEnabled = true;
    this.#t += dt;

    // volumetric beams: gate on the config flag + power, advance their shimmer time.
    // Also fade each beam out as the CAMERA enters it and stop drawing it entirely
    // once you're inside — a cone you're standing in fills the screen with additive
    // transparent overdraw (fill-rate death) for a beam you can barely perceive from
    // within. This is what made simply standing under a lamp tank the frame.
    const conesOn = this.#cfg.lightCones !== false;
    const cam = this.#camera;
    for (const c of this.#cones) {
      let vis = conesOn && c.userData.powerOn !== false;
      if (vis && cam) {
        const dx = cam.position.x - c.position.x, dz = cam.position.z - c.position.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        const r = c.userData.coneRadius ?? 1.2;
        const near = r - 0.2, far = r + 1.4;                 // gone by the axis, full past the rim + a margin
        const k = Math.max(0, Math.min(1, (d - near) / (far - near)));
        c.userData.coneMat.uniforms.uStrength.value = (c.userData.coneStrength ?? 0.5) * k;
        if (k <= 0.02) vis = false;                          // fully inside → skip the draw (kills the overdraw)
      }
      c.visible = vis;
      if (c.visible) c.userData.coneMat.uniforms.uTime.value = this.#t;
    }

    const gSpeed = this.#cfg.flickerSpeed;
    const gDepth = this.#cfg.flickerDepth;

    for (const e of this.#lights) {
      const t = this.#t * gSpeed * e.speed + e.seed;
      // layered sines read as irregular electrical flicker rather than a hum
      const n = Math.sin(t) * 0.5 + Math.sin(t * 2.3 + 1.7) * 0.3 + Math.sin(t * 5.1) * 0.2;
      let mult = 1 - gDepth * e.depth * (0.5 - 0.5 * n);
      // occasional brief brown-out for "bad wiring" character
      if (e.drop > 0) {
        const d = Math.sin(t * 0.7) + Math.sin(t * 0.37 + 2.0);
        if (d > 2.0 - e.drop) mult *= 0.55;
      }
      e.light.intensity = e.base * mult;
    }
  }
}
