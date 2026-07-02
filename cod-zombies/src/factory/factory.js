/**
 * Dr. Newton's Factory — the roll logic for gambling Liquid Divinium into
 * GobbleGums. Pure + deterministic given an rng, so it can be unit-tested away
 * from the 3D scene that presents it.
 *
 * The player wagers 1–3 vials on the three vats (left→right). A wager of N
 * "hits" the first N vats; each hit vat yields one random gum. Two special
 * modifiers can also proc:
 *
 *   POWER BOOSTER  — only offered on a 1- or 2-vial wager. When it hits, you
 *                    receive what is in EVERY vat (upgrades the wager to all 3).
 *   DOUBLE REWARDS — doubles your entire haul. A 3-vial wager can roll it twice
 *                    (×4); smaller wagers roll it at most once (×2).
 *
 * Rarer gums are gated behind the higher vats, so wagering more both widens the
 * haul and improves the odds of something good.
 */

import { GUMS, RARITIES } from '../gobblegums/gobblegums.js';

export const VAT_COST = 1;            // vials per vat
export const MAX_WAGER = 3;
export const BOOSTER_CHANCE = 0.16;   // chance the Power Booster procs (wager < 3)
export const DOUBLE_CHANCE = 0.20;    // chance each Double Rewards roll procs

// Per-vat rarity odds (index 0 = leftmost). Higher vats reach for rarer gums.
// Each row is { rarityId: weight }; weights need not sum to 1.
const VAT_ODDS = [
  { classic: 68, mega: 27, rare: 4, ultra: 0.6, whimsy: 0.4 },   // vat 1 — bread & butter
  { classic: 44, mega: 40, rare: 12, ultra: 2.5, whimsy: 1.5 },  // vat 2 — better
  { classic: 24, mega: 40, rare: 24, ultra: 8, whimsy: 4 },      // vat 3 — best shot at rare
];

const GUMS_BY_RARITY = Object.fromEntries(
  RARITIES.map((r) => [r.id, GUMS.filter((g) => g.rarity === r.id)]),
);

/** Weighted pick of a rarity id for a given vat, then a random gum within it. */
function pickGum(vat, rng) {
  const odds = VAT_ODDS[Math.min(vat, VAT_ODDS.length - 1)];
  const total = Object.values(odds).reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  let rarity = 'classic';
  for (const [rid, w] of Object.entries(odds)) { roll -= w; if (roll <= 0) { rarity = rid; break; } }
  let pool = GUMS_BY_RARITY[rarity];
  if (!pool || !pool.length) pool = GUMS_BY_RARITY.classic;
  return pool[(rng() * pool.length) | 0];
}

/** The number of vials a wager costs. */
export function wagerCost(wager) { return Math.max(1, Math.min(MAX_WAGER, wager | 0)) * VAT_COST; }

/**
 * Roll a factory pull.
 * @param {number} wager 1..3 (clamped)
 * @param {() => number} rng  0..1 source (defaults to Math.random)
 * @returns {{
 *   wager:number, cost:number,
 *   powerBooster:boolean, doubles:number, multiplier:number,
 *   vatsShown:number,                      // how many vats light up (post-booster)
 *   rewards: Array<{ vat:number, gum:object, count:number }>
 * }}
 */
export function rollFactory(wager = 1, rng = Math.random) {
  wager = Math.max(1, Math.min(MAX_WAGER, wager | 0));
  const cost = wagerCost(wager);

  // Power Booster only offered below a full wager; when it hits, all 3 vats pay.
  const powerBooster = wager < MAX_WAGER && rng() < BOOSTER_CHANCE;
  const vatsShown = powerBooster ? MAX_WAGER : wager;

  // Double Rewards: up to 2 rolls on a full wager, else 1.
  const maxDoubles = wager === MAX_WAGER ? 2 : 1;
  let doubles = 0;
  for (let i = 0; i < maxDoubles; i++) if (rng() < DOUBLE_CHANCE) doubles++;
  const multiplier = 2 ** doubles; // 1, 2 or 4

  const rewards = [];
  for (let v = 0; v < vatsShown; v++) {
    const gum = pickGum(v, rng);
    rewards.push({ vat: v, gum, count: multiplier });
  }

  return { wager, cost, powerBooster, doubles, multiplier, vatsShown, rewards };
}
