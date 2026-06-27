import { System } from '../ecs/System.js';
import { Service } from '../core/ServiceLocator.js';
import { PlayerTag } from '../ecs/components/index.js';
import { MoveState } from '../player/MoveState.js';
import { CinematicConfig, PostFXConfig } from '../config/index.js';

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * Drives the live, game-state-reactive terms of the post stack — the bits that
 * can't be static config: the Persona speed-line burst (sprint/slide/kill/
 * damage), the low-health vignette throb, the round-escalating colour grade, the
 * instakill gold rush, and the last-zombie bullet-time. Reads events + the player
 * tag, pushes values into PostFX. Inert (no-ops) when there's no post stack, so
 * it's safe under the headless harness and the WebGL-off path.
 */
export class EffectsDirector extends System {
  #fx = null;
  #render = null;
  #events;
  #time;
  #gameState;

  #burst = 0;        // speed-line burst (kills/damage), decays
  #slowT = 0;        // remaining bullet-time (real seconds)
  #round = 1;
  #instakill = false;
  #special = false;  // hellhound (dog) round — shifts the grade to blood red
  #remaining = 0;
  #roundActive = false;

  init() {
    const render = this.world.services.get(Service.Render);
    this.#render = render || null;
    this.#fx = render?.postFX || null;
    this.#events = this.world.services.get(Service.Events);
    this.#time = this.world.services.get(Service.Time);
    this.#gameState = this.world.services.get(Service.GameState);
    if (this.#time && this.#time.timeScale == null) this.#time.timeScale = 1;

    this.#events.on('zombie:killed', () => { this.#burst = Math.min(1, this.#burst + 0.5); });
    this.#events.on('player:damaged', () => { this.#burst = Math.min(1, this.#burst + 0.7); });
    // explosions push a heat-haze shimmer (projected to screen by RenderManager)
    this.#events.on('weapon:explosion', ({ x, y, z }) => this.#render?.addHeat?.(x, y, z));
    this.#events.on('round:changed', ({ round, state, special }) => {
      if (round) this.#round = round;
      this.#roundActive = state === 'active';
      this.#special = !!special && state === 'active';
      this.#applyPalette();
    });
    this.#events.on('round:cleared', () => { this.#special = false; this.#applyPalette(); });
    this.#events.on('zombies:changed', ({ remaining }) => {
      const prev = this.#remaining;
      this.#remaining = remaining;
      if (remaining === 0 && prev > 0 && this.#roundActive && CinematicConfig.slowmo.enabled) {
        this.#slowT = CinematicConfig.slowmo.duration; // the last one falls — bullet-time
      }
    });
    this.#events.on('powerup:active', ({ type }) => { if (type === 'instaKill') { this.#instakill = true; this.#applyPalette(); } });
    this.#events.on('powerup:expire', ({ type }) => { if (type === 'instaKill') { this.#instakill = false; this.#applyPalette(); } });

    this.#applyPalette();
  }

  /** Recompute the grade tint from round dread + the instakill override. */
  #applyPalette() {
    if (!this.#fx) return;
    const base = PostFXConfig.grade;
    const dread = Math.min(1, Math.max(0, (this.#round - 5) / 10)); // 0 (≤r5) → 1 (≥r15)
    let shadow = lerp3(base.shadowTint, [0.18, 0.5, 0.32], dread);   // toward sickly green
    let high = lerp3(base.highlightTint, [0.92, 0.4, 0.4], dread * 0.7); // toward blood
    let sat = base.saturation - dread * 0.18;
    let temp = base.temperature - dread * 0.1;
    if (this.#special) { // hellhound round — the world goes blood red
      shadow = [0.34, 0.08, 0.08];
      high = [1.0, 0.3, 0.26];
      sat = base.saturation + 0.05;
      temp = base.temperature + 0.22; // hot/red push
    }
    if (this.#instakill) { // gold rush (still wins, even mid dog-round)
      shadow = [0.5, 0.42, 0.2]; high = [1.0, 0.85, 0.4];
      sat = base.saturation + 0.15; temp = 0.15;
    }
    this.#fx.setGrade({ shadowTint: shadow, highlightTint: high, saturation: sat, temperature: temp });
  }

  update(dt) {
    if (!this.#fx) return;
    const playing = this.#gameState.isPlaying;

    // last-kill bullet-time — timed in REAL seconds so the scale doesn't stretch
    // its own recovery; eases back to full speed over the final window
    const real = this.#time.unscaledDeltaTime || dt;
    if (this.#slowT > 0 && playing) {
      this.#slowT -= real;
      const s = CinematicConfig.slowmo;
      if (this.#slowT > s.ease) this.#time.timeScale = s.scale;
      else this.#time.timeScale = s.scale + (1 - s.scale) * (1 - Math.max(0, this.#slowT) / s.ease);
      if (this.#slowT <= 0) { this.#slowT = 0; this.#time.timeScale = 1; }
    } else if (this.#time.timeScale !== 1) {
      this.#time.timeScale = 1;
    }

    if (!playing) { this.#fx.setReactive(0); this.#fx.setSpeedlines(0); return; }

    let speed = 0;
    const pid = this.world.first(PlayerTag);
    if (pid !== undefined) {
      const tag = this.world.get(pid, PlayerTag);
      if (tag.state === MoveState.SLIDE || tag.state === MoveState.DIVE) speed = 0.5;
      else if (tag.state === MoveState.SPRINT) speed = 0.22;
      const ratio = tag.maxHealth > 0 ? tag.health / tag.maxHealth : 1;
      let reactive = ratio < 0.5 ? (0.5 - ratio) / 0.5 : 0;
      if (reactive > 0) reactive *= 0.7 + 0.3 * Math.sin(this.#time.elapsed * 6.0); // heartbeat
      this.#fx.setReactive(Math.max(0, reactive));
    } else {
      this.#fx.setReactive(0);
    }

    this.#burst = Math.max(0, this.#burst - dt * 2.2);
    this.#fx.setSpeedlines(Math.min(1, speed + this.#burst));
  }
}
