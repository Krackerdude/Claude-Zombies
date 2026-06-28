import { gumById } from '../gobblegums/gobblegums.js';

/**
 * Black Market Quests — the catalog + the rotating "available" set.
 *
 * Quests are grouped by DIFFICULTY (the menu's tabs) and each grants a REWARD:
 *   div  — Liquid Divinium (blue)
 *   xp   — XP             (yellow)
 *   gum  — a specific GobbleGum (purple; the exact gum is named)
 *
 * The available pool ROTATES every 2 hours: a deterministic, seeded pick per
 * difficulty keyed on the 2-hour window index, so all clients in the same window
 * see the same quests and it changes on its own without any server.
 */
export const WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

export const DIFFICULTIES = [
  { id: 'easy',   name: 'Easy',   color: '#5fd07a' },
  { id: 'medium', name: 'Medium', color: '#ffb347' },
  { id: 'hard',   name: 'Hard',   color: '#ff5d5d' },
];

export const REWARD_KINDS = {
  div: { id: 'div', label: 'Liquid Divinium', color: '#3aa0ff' },
  xp:  { id: 'xp',  label: 'XP',              color: '#ffce5c' },
  gum: { id: 'gum', label: 'GobbleGum',       color: '#b06bff' },
};

export function rewardColor(r) { return REWARD_KINDS[r.kind]?.color || '#ffb347'; }

/** Short reward label, e.g. "×2 Liquid Divinium", "500 XP", "GobbleGum: Perkaholic". */
export function rewardLabel(r) {
  if (r.kind === 'div') return `×${r.amount} Liquid Divinium`;
  if (r.kind === 'xp')  return `${r.amount.toLocaleString()} XP`;
  if (r.kind === 'gum') return `GobbleGum: ${gumById(r.gum)?.name ?? '???'}`;
  return '';
}

const Q = (name, obj, reward) => ({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, obj, reward });

const POOL = {
  easy: [
    Q('Headhunter',   'Get 50 headshot kills in one match',        { kind: 'div', amount: 1 }),
    Q('Warm Up',      'Reach round 5',                             { kind: 'xp', amount: 250 }),
    Q('Boarded Up',   'Rebuild barriers 15 times',                 { kind: 'xp', amount: 300 }),
    Q('Window Shopper','Buy a weapon off the wall',                { kind: 'div', amount: 1 }),
    Q('Sweet Tooth',  'Activate any GobbleGum',                    { kind: 'gum', gum: 'always-done-swiftly' }),
    Q('Knife Party',  'Get 20 melee kills',                        { kind: 'xp', amount: 300 }),
  ],
  medium: [
    Q('Power Trip',   'Pack-a-Punch a weapon',                     { kind: 'div', amount: 2 }),
    Q('Big Spender',  'Spend 7,500 points in one match',           { kind: 'gum', gum: 'shopping-free' }),
    Q('Perk Up',      'Buy 4 perks in one match',                  { kind: 'xp', amount: 500 }),
    Q('Box Diver',    'Pull from the Mystery Box 5 times',         { kind: 'div', amount: 2 }),
    Q('Sugar Rush',   'Activate 3 GobbleGums in one match',        { kind: 'gum', gum: 'pop-shocks' }),
    Q('Marathon',     'Reach round 15',                            { kind: 'xp', amount: 650 }),
  ],
  hard: [
    Q('Hellbound',    'Survive a Hellhound round',                 { kind: 'div', amount: 3 }),
    Q('Untouchable',  'Reach round 10 without going down',         { kind: 'gum', gum: 'perkaholic' }),
    Q('Ammo Hoarder', 'Earn 3 Max Ammo drops in one match',        { kind: 'div', amount: 3 }),
    Q('Apex Predator','Reach round 25',                            { kind: 'xp', amount: 1500 }),
    Q('Alchemist',    'Trigger 25 Alternate Ammo Type procs',      { kind: 'gum', gum: 'kill-joy' }),
    Q('Flawless',     'Clear 5 rounds without taking damage',      { kind: 'div', amount: 4 }),
  ],
};
// stamp difficulty onto every quest
for (const d of DIFFICULTIES) for (const q of POOL[d.id]) q.difficulty = d.id;

export const QUEST_POOL = POOL;

// --- deterministic rotation ------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function currentWindow() { return Math.floor(Date.now() / WINDOW_MS); }

/** The quests available this window, grouped by difficulty (perTier each). */
export function windowQuests(windowIdx = currentWindow(), perTier = 4) {
  const out = {};
  for (const d of DIFFICULTIES) {
    const seed = (windowIdx * 2654435761 + d.id.charCodeAt(0) * 40503) >>> 0;
    out[d.id] = shuffled(POOL[d.id], mulberry32(seed)).slice(0, Math.min(perTier, POOL[d.id].length));
  }
  return out;
}
