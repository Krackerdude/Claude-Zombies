import { TimeConfig } from '../config/index.js';

/**
 * Fixed-timestep game loop with an accumulator (the canonical "Fix Your
 * Timestep" pattern). Physics/simulation run at a deterministic fixed rate;
 * rendering runs as fast as rAF allows, with an interpolation `alpha` exposed
 * for render-side smoothing.
 *
 * The loop is dependency-free: callbacks are injected, so it knows nothing
 * about ECS, rendering, or physics.
 */
export class GameLoop {
  #time;
  #fixedUpdate;
  #update;
  #render;

  #running = false;
  #rafId = 0;
  #lastTime = 0;
  #accumulator = 0;

  /**
   * @param {object} opts
   * @param {import('./Time.js').Time} opts.time
   * @param {(dt:number)=>void} opts.fixedUpdate  fixed-rate simulation tick
   * @param {(dt:number)=>void} opts.update        per-frame variable tick
   * @param {(alpha:number)=>void} opts.render     draw, with interpolation alpha
   */
  constructor({ time, fixedUpdate, update, render }) {
    this.#time = time;
    this.#fixedUpdate = fixedUpdate;
    this.#update = update;
    this.#render = render;
  }

  start() {
    if (this.#running) return;
    this.#running = true;
    this.#lastTime = performance.now();
    this.#accumulator = 0;
    this.#rafId = requestAnimationFrame(this.#tick);
  }

  stop() {
    this.#running = false;
    cancelAnimationFrame(this.#rafId);
  }

  get running() {
    return this.#running;
  }

  // Arrow class field so `this` is bound for requestAnimationFrame without
  // reassigning a private method (which is a runtime TypeError).
  #tick = (now) => {
    if (!this.#running) return;
    this.#rafId = requestAnimationFrame(this.#tick);

    const time = this.#time;
    const step = time.fixedDeltaTime;

    let frameDelta = (now - this.#lastTime) / 1000;
    this.#lastTime = now;

    // Guard against pathological deltas (alt-tab, breakpoints).
    if (frameDelta > TimeConfig.maxFrameDelta) frameDelta = TimeConfig.maxFrameDelta;

    time.unscaledDeltaTime = frameDelta;
    time.deltaTime = frameDelta * time.timeScale;
    time.elapsed += time.deltaTime;
    time.frameCount++;

    // Fixed simulation steps. Clamp the number of catch-up steps so a long
    // stall doesn't trigger a death-spiral of physics ticks.
    this.#accumulator += time.deltaTime;
    let steps = 0;
    const maxSteps = Math.ceil(TimeConfig.maxFrameDelta / step) + 1;
    while (this.#accumulator >= step && steps < maxSteps) {
      this.#fixedUpdate(step);
      this.#accumulator -= step;
      steps++;
    }

    time.alpha = step > 0 ? this.#accumulator / step : 0;

    this.#update(time.deltaTime);
    this.#render(time.alpha);
  };
}
