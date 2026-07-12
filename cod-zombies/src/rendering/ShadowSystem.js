import { System } from '../ecs/System.js';
import { Service } from '../core/ServiceLocator.js';
import { ZombieTag, Transform, PlayerTag } from '../ecs/components/index.js';

/**
 * Shadow caching (Tier 4 — shadow LOD).
 *
 * Every shadow-casting light re-renders its depth map every frame by default —
 * the 4 corner practical spots (1024²) and the moon/sun cascade (2048²) each
 * redraw all their casters into a shadow buffer even when nothing beneath them
 * has moved. But those maps only actually CHANGE when a dynamic caster (a
 * zombie, or the player) is under the light; the static world casts the same
 * shadow forever.
 *
 * So we freeze each light's shadow map (`shadow.autoUpdate = false`) and only
 * flag `needsUpdate` on the frames a dynamic caster is within its influence —
 * plus one trailing frame after the last one leaves, to sweep away its shadow.
 * The output is pixel-identical to per-frame rendering (a frozen map reused over
 * an unchanged scene is exactly what a re-render would produce), so there is no
 * visual change at all — it just stops re-rendering shadows that can't move.
 *
 * The moon/sun covers the whole arena, so it re-renders whenever any zombie is
 * alive or the player moved; it only rests between waves. The corner spots rest
 * whenever their own corner is empty — the common case during a fight clustered
 * elsewhere.
 */
const TRAIL = 1;          // extra frames to render after a caster leaves (clear its shadow)
const WARMUP = 2;         // full captures on (re)entry to play, to seed the static maps
const PLAYER_MOVE2 = 0.0004; // (m²) player movement that dirties the sun map (~2cm)

export class ShadowSystem extends System {
  #gameState;
  #events;
  #spots;                 // [{ light, x, z, r2, occ }]
  #sun;
  #warmup = 0;
  #px = 0; #pz = 0;       // last player position (to detect movement for the sun)

  constructor(shadowSpots = [], sun = null) {
    super();
    this.#spots = shadowSpots.map((l) => {
      // A spot only casts a shadow of a caster inside its CONE, whose floor
      // footprint radius is height·tan(angle) — far smaller than the light's
      // falloff `distance`. Using distance would keep every spot "occupied" by
      // the player from across the room; the cone footprint (+ a margin for tall
      // casters leaning in) is the honest influence radius.
      const h = l.position.y || 3.2;
      const ang = Math.min(l.angle ?? 1.0, 1.45);
      const r = h * Math.tan(ang) + 1.5;
      return { light: l, x: l.position.x, z: l.position.z, r2: r * r, occ: 0, _hit: false };
    });
    this.#sun = sun;
  }

  init() {
    this.#gameState = this.world.services.get(Service.GameState);
    this.#events = this.world.services.has(Service.Events) ? this.world.services.get(Service.Events) : null;
    // freeze every managed shadow map; force one render so the static scene is
    // captured before we start gating updates
    for (const s of this.#spots) { s.light.shadow.autoUpdate = false; s.light.shadow.needsUpdate = true; }
    if (this.#sun) { this.#sun.shadow.autoUpdate = false; this.#sun.shadow.needsUpdate = true; }
    // re-seed the static maps whenever gameplay (re)starts (the arena isn't drawn
    // while in menus, so the frozen maps can go stale across a session)
    this.#events?.on('state:change', ({ state } = {}) => { if (state === 'playing') this.#warmup = 0; });
  }

  update() {
    if (!this.#gameState.isPlaying) return;
    const warming = this.#warmup < WARMUP;
    if (warming) this.#warmup++;

    // player position (also a moving shadow caster)
    let px = this.#px, pz = this.#pz, playerMoved = false;
    const pid = this.world.first(PlayerTag, Transform);
    if (pid !== undefined) {
      const p = this.world.get(pid, Transform).position;
      const dx = p.x - this.#px, dz = p.z - this.#pz;
      playerMoved = (dx * dx + dz * dz) > PLAYER_MOVE2;
      px = p.x; pz = p.z; this.#px = px; this.#pz = pz;
    }

    // corner spots: awake only while a caster (player or a zombie) is in range,
    // plus a trailing frame to erase a departed caster's shadow
    let zombies = 0;
    // pre-test the player against every spot, then fold in zombies
    for (const s of this.#spots) {
      const dx = px - s.x, dz = pz - s.z;
      s._hit = (dx * dx + dz * dz) <= s.r2;
    }
    for (const id of this.world.query(ZombieTag, Transform)) {
      zombies++;
      const zp = this.world.get(id, Transform).position;
      for (const s of this.#spots) {
        if (s._hit) continue;
        const dx = zp.x - s.x, dz = zp.z - s.z;
        if ((dx * dx + dz * dz) <= s.r2) s._hit = true;
      }
    }
    for (const s of this.#spots) {
      if (warming || s._hit) { s.light.shadow.needsUpdate = true; s.occ = TRAIL; }
      else if (s.occ > 0) { s.light.shadow.needsUpdate = true; s.occ--; } // trailing clear
    }

    // moon/sun: covers the whole arena, so it only rests when nothing dynamic is
    // moving — any live zombie or a player step re-renders it
    if (this.#sun && (warming || zombies > 0 || playerMoved)) this.#sun.shadow.needsUpdate = true;
  }
}
