/**
 * The persistent player profile — the single document every progression system
 * (level/XP, currency, unlocks, achievements, emblems, lifetime stats) reads and
 * writes through the ProfileService. This file owns only the *shape* and the
 * *current version*; it deliberately contains no gameplay logic.
 *
 * Design rules so this stays painless to extend:
 *   - Every top-level key is a container (object/array) that features fill in.
 *     Adding a new progression system = add a bucket here + bump the version +
 *     write a migration that seeds it. Nothing else has to change.
 *   - `v` is the on-disk schema version. Bump it whenever the shape changes and
 *     add a matching entry to migrations.js so old saves upgrade in place.
 *   - Buckets start EMPTY. No starter currency, no default unlocks — that's a
 *     gameplay decision, not a storage one.
 */

export const PROFILE_VERSION = 1;

/** A fresh, empty profile at the current schema version. */
export function defaultProfile(id = 'local') {
  const ts = Date.now();
  return {
    v: PROFILE_VERSION,
    id,
    createdAt: ts,
    updatedAt: ts,

    // Who the player is (cosmetic identity). Cross-device sync later replaces
    // the local id with an account id; everything below travels with it.
    identity: {
      displayName: 'Survivor One',
      title: null,
    },

    // Level / XP / prestige. `xp` is the LIFETIME total; the current level and
    // in-level progress are derived from it via progression.js (single source of
    // truth, so they can't desync). Starts at level 0 with no progress — there is
    // no way to earn XP yet. Curve + award logic live in a future system.
    progression: {
      level: 0,
      xp: 0,
      prestige: 0,
    },

    // Spendable balances, keyed by currency id, e.g. { essence: 0, scrap: 0 }.
    currency: {},

    // Owned things, keyed by category -> list of ids:
    //   { weapons: [], gobblegums: [], perks: [], cosmetics: [] }
    unlocks: {},

    // Per-achievement state, keyed by achievement id:
    //   { [id]: { unlocked: false, progress: 0, ts: null } }
    achievements: {},

    // Custom emblems stored as re-editable layer data (NOT flattened images), so
    // they render at any resolution and can be shared as a code later. `active`
    // is the equipped emblem's id; `saved` is the player's library.
    emblems: {
      active: null,
      saved: [], // [{ id, name, layers: [...], updatedAt }]
    },

    // Lifetime counters (kills, downs, highestRound, gamesPlayed, ...). Free-form
    // so a feature can bump a stat without a schema change.
    stats: {},

    // Escape hatch for systems that aren't worth a top-level key yet.
    meta: {},
  };
}
