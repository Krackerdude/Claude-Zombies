import { PROFILE_VERSION, defaultProfile } from './schema.js';

/**
 * Ordered, additive migration chain. When a stored profile's `v` is older than
 * PROFILE_VERSION, the runner applies each migration whose `to` is greater than
 * the stored version, in ascending order, mutating the data forward one step at
 * a time. This means a save from any past version upgrades cleanly to current.
 *
 * To evolve the schema:
 *   1. Change the shape in schema.js and bump PROFILE_VERSION.
 *   2. Append `{ to: <newVersion>, up(data) { ... } }` here.
 *   3. `up` must be idempotent-ish and tolerant of missing keys — only seed what
 *      it adds; never assume the rest of the document is well-formed.
 *
 * v1 is the baseline shape, so there are no migrations yet. Example for later:
 *
 *   { to: 2, up(d) { d.loadouts ??= { saved: [], active: null }; } }
 */
export const MIGRATIONS = [
  // { to: 2, up(data) { data.newBucket ??= {}; } },
];

/**
 * Bring a raw, possibly-stale profile up to the current schema version.
 * Returns a profile guaranteed to be at PROFILE_VERSION. Never throws on shape:
 * a missing/garbage `v` is treated as "older than everything" and rebuilt from
 * defaults merged over whatever survived.
 */
export function migrateProfile(raw, id = 'local') {
  if (!raw || typeof raw !== 'object') return defaultProfile(id);

  // Backfill any top-level buckets the stored doc predates, then run the chain.
  let data = { ...defaultProfile(id), ...raw };
  let from = Number.isInteger(raw.v) ? raw.v : 0;

  for (const m of MIGRATIONS) {
    if (m.to > from) {
      m.up(data);
      from = m.to;
    }
  }

  data.v = PROFILE_VERSION;
  return data;
}
