import { System } from '../ecs/System.js';
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

    // volumetric beams: gate on the config flag + power, advance their shimmer time
    const conesOn = this.#cfg.lightCones !== false;
    for (const c of this.#cones) {
      c.visible = conesOn && c.userData.powerOn !== false;
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
