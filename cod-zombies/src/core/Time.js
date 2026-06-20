/**
 * Holds the canonical time state for a frame. Systems read from a shared Time
 * instance instead of calling performance.now() themselves, which keeps every
 * system on the same clock and makes pausing / time-scaling trivial later.
 */
export class Time {
  /** Variable, scaled delta for the current rendered frame (seconds). */
  deltaTime = 0;
  /** Unscaled variable delta (seconds). */
  unscaledDeltaTime = 0;
  /** Fixed step used by the physics/simulation tick (seconds). */
  fixedDeltaTime = 1 / 60;
  /** Seconds elapsed since start (scaled). */
  elapsed = 0;
  /** Total rendered frames. */
  frameCount = 0;
  /** Global time multiplier (0 = paused, 1 = normal, 0.5 = slow-mo). */
  timeScale = 1;
  /** Interpolation factor [0,1] between the last two fixed steps, for render smoothing. */
  alpha = 0;
}
