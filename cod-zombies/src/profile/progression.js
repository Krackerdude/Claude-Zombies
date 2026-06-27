/**
 * Player level / XP curve. Pure data + math — this file knows how much XP each
 * level costs and how to turn a lifetime-XP total into a level + progress. It
 * deliberately contains NO way to *earn* XP; awarding is a future system. The
 * profile stores a single source of truth (`progression.xp` = lifetime total),
 * and everything else (current level, fill ratio, "next level" target) is
 * derived here so the two can never desync.
 *
 * The curve:
 *   - Level 1 costs 4,000 XP (0 -> 1).
 *   - Each subsequent level starts out costing +600 more than the last
 *     (L2 = 4,600, L3 = 5,200 ...).
 *   - That increment ACCELERATES so the curve ramps up to a final level (35)
 *     costing exactly 50,000 XP. A flat +600 would only reach ~24k by level 35,
 *     so the per-level increase grows by a constant amount each level to land
 *     the cap on 50,000.
 *   - MAX_LEVEL is 35; there is no level beyond it.
 */

export const MAX_LEVEL = 35;

const BASE_COST = 4000;   // XP to reach level 1
const FIRST_STEP = 600;   // initial level-to-level increase
const FINAL_COST = 50000; // XP to reach MAX_LEVEL (the last level's cost)

// Increments grow linearly: step(k) = FIRST_STEP + k * ACCEL. ACCEL is solved so
// the sum of increments from level 1 to MAX_LEVEL lands cost(MAX_LEVEL) exactly
// on FINAL_COST.
const STEPS = MAX_LEVEL - 1;
const ACCEL = (FINAL_COST - BASE_COST - FIRST_STEP * STEPS) / (STEPS * (STEPS - 1) / 2);

/**
 * XP required to advance FROM (level-1) TO `level`. Valid for 1..MAX_LEVEL;
 * returns 0 outside that range (you can't "buy" level 0 or anything past the cap).
 * Rounded to the nearest 100 for clean, readable requirements.
 */
export function xpForLevel(level) {
  if (level <= 0 || level > MAX_LEVEL) return 0;
  const k = level - 1; // increments applied so far
  const raw = BASE_COST + FIRST_STEP * k + ACCEL * (k * (k - 1) / 2);
  return Math.round(raw / 100) * 100;
}

/** Cumulative lifetime XP needed to *reach* `level` from scratch. */
export function totalXpForLevel(level) {
  let sum = 0;
  for (let l = 1; l <= Math.min(level, MAX_LEVEL); l++) sum += xpForLevel(l);
  return sum;
}

/**
 * Resolve a lifetime-XP total into a progress snapshot:
 *   { level, into, needed, ratio, max }
 *     level  — current level (0..MAX_LEVEL)
 *     into   — XP earned into the current level
 *     needed — XP the current level requires (0 at the cap)
 *     ratio  — into/needed in [0,1] (1 at the cap)
 *     max    — true once MAX_LEVEL is reached
 */
export function levelFromXp(totalXp) {
  let level = 0;
  let remaining = Math.max(0, totalXp || 0);
  while (level < MAX_LEVEL) {
    const cost = xpForLevel(level + 1);
    if (remaining < cost) break;
    remaining -= cost;
    level++;
  }
  const max = level >= MAX_LEVEL;
  const needed = max ? 0 : xpForLevel(level + 1);
  return {
    level,
    into: max ? 0 : remaining,
    needed,
    ratio: needed > 0 ? remaining / needed : 1,
    max,
  };
}
