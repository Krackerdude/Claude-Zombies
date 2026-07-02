/**
 * Newton's Cookbook — trade recipes for converting GobbleGums between rarities.
 * Pure + deterministic given a window index, so it can be unit-tested away from
 * the book UI that presents it.
 *
 * Two kinds of trade:
 *   UP   — a LARGE amount of a lower-tier gum → ONE gum of a higher tier.
 *   DOWN — ONE higher-tier gum → a large amount of a lower-tier gum.
 * The bigger the tier jump, the greater the cost (up) or return (down).
 *
 * Recipes deviate ±1–2 from the standard cost/return; when a recipe lands in the
 * player's favour it is flagged `special` ("Special Deal!"). The pool refreshes
 * on a fixed window (deterministic per window, so it's stable within a session
 * and identical for every client).
 *
 * Classic gums are infinite — they are NEVER an ingredient or an outcome here.
 */

import { GUMS } from '../gobblegums/gobblegums.js';

// Tradeable rarities only (classic is excluded entirely). `TIER` ranks quality;
// whimsical sits alongside rare in value but is its own outcome category.
export const TIER = Object.freeze({ mega: 1, rare: 2, ultra: 3, whimsy: 2 });
export const TRADEABLE = Object.freeze(['mega', 'rare', 'ultra', 'whimsy']);
const GUMS_BY_RAR = Object.fromEntries(TRADEABLE.map((r) => [r, GUMS.filter((g) => g.rarity === r)]));

// how the sort/outcome tabs order (mirrors the catalog, minus classic)
export const OUTCOME_ORDER = Object.freeze({ mega: 0, rare: 1, whimsy: 2, ultra: 3 });

export const WINDOW_MS = 2 * 60 * 60 * 1000;      // recipes refresh every 2 hours
export const PAGE_SIZE = 2;                        // recipes per book PAGE (spread = 2 pages)
export const RECIPE_COUNT = 24;                    // pool size (per window)

export function currentWindow(now = Date.now()) { return Math.floor(now / WINDOW_MS); }
export function msToRefresh(now = Date.now()) { return WINDOW_MS - (now % WINDOW_MS); }

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// standard input/return counts by tier jump (1 or 2)
export function baseUp(jump) { return 4 + 3 * jump; }    // jump1 → 7, jump2 → 10
export function baseDown(jump) { return 3 + 2 * jump; }  // jump1 → 5, jump2 → 7

/** The deterministic recipe pool for a window, sorted by outcome then deals. */
export function windowRecipes(windowIndex) {
  const rng = mulberry32(((windowIndex + 1) * 2654435761) >>> 0);
  const pick = (arr) => arr[(rng() * arr.length) | 0];
  const out = [];

  for (let i = 0; out.length < RECIPE_COUNT && i < RECIPE_COUNT * 4; i++) {
    const up = rng() < 0.55; // slightly favour trade-ups
    let inR = pick(TRADEABLE), outR = pick(TRADEABLE);
    if (TIER[inR] === TIER[outR]) continue;          // need a real tier jump
    if (up && TIER[inR] > TIER[outR]) [inR, outR] = [outR, inR]; // up: in < out
    if (!up && TIER[inR] < TIER[outR]) [inR, outR] = [outR, inR]; // down: in > out
    const jump = Math.abs(TIER[outR] - TIER[inR]);
    const inGum = pick(GUMS_BY_RAR[inR]);
    const outGum = pick(GUMS_BY_RAR[outR]);
    if (!inGum || !outGum || inGum.id === outGum.id) continue;

    const dev = ((rng() * 5) | 0) - 2; // -2..+2
    let input, output, special;
    if (up) {
      const base = baseUp(jump);
      input = { gum: inGum.id, count: Math.max(2, base + dev) };
      output = { gum: outGum.id, count: 1 };
      special = input.count < base;          // fewer needed = a better deal
    } else {
      const base = baseDown(jump);
      input = { gum: inGum.id, count: 1 };
      output = { gum: outGum.id, count: Math.max(2, base + dev) };
      special = output.count > base;         // more returned = a better deal
    }
    out.push({ id: `w${windowIndex}-${out.length}`, type: up ? 'up' : 'down', jump, special, input, output, outRarity: outGum.rarity });
  }

  out.sort((a, b) => (OUTCOME_ORDER[a.outRarity] - OUTCOME_ORDER[b.outRarity]) || (b.special - a.special) || (a.jump - b.jump));
  return out;
}

/** The current window's recipes. */
export function currentRecipes(now = Date.now()) { return windowRecipes(currentWindow(now)); }

/** True if the player owns enough of the input gum to run this recipe. */
export function canCraft(recipe, packs) { return (packs?.owned(recipe.input.gum) ?? 0) >= recipe.input.count; }

/** Run a recipe: consume the input, grant the output. Returns true on success. */
export function craft(recipe, packs) {
  if (!packs || !canCraft(recipe, packs)) return false;
  if (!packs.consumeGum(recipe.input.gum, recipe.input.count)) return false;
  packs.grantGum(recipe.output.gum, recipe.output.count);
  return true;
}
