/**
 * Player identity cosmetics — the built-in EMBLEMS (square badges) and CALLING
 * CARDS (long banners) a player equips to set themselves apart, plus a tiny
 * selection store (mirrors characters/selection.js): the equipped ids live here,
 * listeners fire on change, and main.js bridges it to the persistent profile.
 *
 * Art is self-contained inline SVG so it scales crisply at any size and needs no
 * external assets. Emblems draw on a transparent field (their slot supplies the
 * dark backing); calling cards fill their whole banner.
 */

// --- emblems (64×64, transparent field) -------------------------------------
export const EMBLEMS = [
  {
    id: 'reaper',
    name: 'Reaper',
    svg: `<svg viewBox="0 0 64 64" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
      <path fill="#e8eef0" d="M32 9c-11 0-18.5 7.6-18.5 18.3 0 6.4 3 10.9 6.4 13.4v5.8c0 1.2 1 2.2 2.2 2.2h2.1v-4.4h2.4v4.4h3.6v-4.4h2.4v4.4h3.6v-4.4h2.4v4.4h2.1c1.2 0 2.2-1 2.2-2.2v-5.8c3.4-2.5 6.6-7 6.6-13.4C50.5 16.6 43 9 32 9z"/>
      <g fill="#0b1114"><circle cx="24" cy="29" r="5.6"/><circle cx="40" cy="29" r="5.6"/><path d="M32 33l3.2 6.4h-6.4z"/></g>
      <g fill="#34c6e0"><circle cx="24" cy="29" r="2.3"/><circle cx="40" cy="29" r="2.3"/></g>
    </svg>`,
  },
  {
    id: 'sigil',
    name: 'Aether Sigil',
    svg: `<svg viewBox="0 0 64 64" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="22" fill="none" stroke="#2fb8b0" stroke-width="2.6"/>
      <circle cx="32" cy="32" r="15" fill="none" stroke="#2fb8b0" stroke-width="1.4" opacity="0.55"/>
      <path d="M32 11 50 43 14 43Z" fill="none" stroke="#7ff0e6" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M32 53 14 21 50 21Z" fill="none" stroke="#2fb8b0" stroke-width="1.8" stroke-linejoin="round" opacity="0.7"/>
      <circle cx="32" cy="32" r="4.2" fill="#7ff0e6"/>
    </svg>`,
  },
  {
    id: 'ravage',
    name: 'Ravage',
    svg: `<svg viewBox="0 0 64 64" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
      <g fill="#c62828">
        <path d="M17 9c-2.6 15 -.4 36 6 49 2.6-15 1.4-37-6-49z"/>
        <path d="M31.5 6.5c-2.6 16 -.4 38 6 52 2.6-16 1.4-40-6-52z"/>
        <path d="M46 9c-2.6 15 -.4 36 6 49 2.6-15 1.4-37-6-49z"/>
      </g>
      <g fill="#7a1210" opacity="0.55">
        <path d="M17 9c-1.4 15 -.2 34 3 46 -2.6-13-3.6-32-3-46z"/>
        <path d="M31.5 6.5c-1.4 16 -.2 36 3 49 -2.6-14-3.6-34-3-49z"/>
        <path d="M46 9c-1.4 15 -.2 34 3 46 -2.6-13-3.6-32-3-46z"/>
      </g>
    </svg>`,
  },
];

// --- calling cards (320×64 banner) ------------------------------------------
export const CALLING_CARDS = [
  {
    id: 'necropolis',
    name: 'Necropolis',
    svg: `<svg viewBox="0 0 320 64" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="cc_nc" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#3a2350"/><stop offset="0.55" stop-color="#5b2f7a"/><stop offset="1" stop-color="#201232"/></linearGradient></defs>
      <rect width="320" height="64" fill="url(#cc_nc)"/>
      <circle cx="272" cy="20" r="15" fill="#cbaaea" opacity="0.45"/>
      <circle cx="266" cy="17" r="15" fill="#5b2f7a" opacity="0.6"/>
      <g fill="#190e28" opacity="0.6">
        <path d="M34 64V40a11 11 0 0 1 22 0v24z"/>
        <path d="M62 64V47a8 8 0 0 1 16 0v17z"/>
        <path d="M232 64V36a12 12 0 0 1 24 0v28z"/>
        <path d="M260 64V45a8 8 0 0 1 16 0v19z"/>
      </g>
      <g stroke="#c39fe6" stroke-width="1" opacity="0.16"><path d="M0 50h320"/><path d="M0 57h320"/></g>
    </svg>`,
  },
  {
    id: 'bloodmoon',
    name: 'Blood Moon',
    svg: `<svg viewBox="0 0 320 64" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="cc_bm" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#2a0d0c"/><stop offset="0.55" stop-color="#6e1512"/><stop offset="1" stop-color="#160504"/></linearGradient></defs>
      <rect width="320" height="64" fill="url(#cc_bm)"/>
      <circle cx="252" cy="30" r="22" fill="#c0392b" opacity="0.55"/>
      <circle cx="245" cy="25" r="22" fill="#2a0d0c" opacity="0.45"/>
      <g fill="#3a0a08" opacity="0.5"><circle cx="40" cy="20" r="7"/><circle cx="70" cy="44" r="5"/><circle cx="110" cy="26" r="4"/><circle cx="150" cy="48" r="6"/><circle cx="190" cy="18" r="4"/></g>
      <g stroke="#e0554a" stroke-width="1.4" opacity="0.35" stroke-linecap="round"><path d="M60 0v14"/><path d="M132 0v9"/><path d="M210 0v12"/><path d="M96 0v7"/></g>
    </svg>`,
  },
  {
    id: 'frostbite',
    name: 'Frostbite',
    svg: `<svg viewBox="0 0 320 64" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="cc_fb" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#123044"/><stop offset="0.55" stop-color="#2a6f8f"/><stop offset="1" stop-color="#0b1c28"/></linearGradient></defs>
      <rect width="320" height="64" fill="url(#cc_fb)"/>
      <g fill="#bfe8f5" opacity="0.35"><path d="M250 64 274 24 298 64z"/><path d="M284 64 302 34 320 64z"/><path d="M226 64 242 40 258 64z"/></g>
      <g stroke="#dff4fb" stroke-width="1.2" opacity="0.3" stroke-linecap="round">
        <path d="M40 12v26M28 22l24 6M52 22l-24 6M34 15l12 20M46 15l-12 20"/>
        <path d="M150 40v18M142 46l16 4M158 46l-16 4"/>
      </g>
    </svg>`,
  },
];

export const emblemById = (id) => EMBLEMS.find((e) => e.id === id) || EMBLEMS[0];
export const callingCardById = (id) => CALLING_CARDS.find((c) => c.id === id) || CALLING_CARDS[0];

// --- selection store --------------------------------------------------------
let emblemId = 'reaper';
let cardId = 'necropolis';
const listeners = new Set();
const fire = () => { for (const fn of [...listeners]) fn({ emblem: emblemId, callingCard: cardId }); };

export function selectedEmblemId() { return emblemId; }
export function selectedCallingCardId() { return cardId; }
export function selectedEmblem() { return emblemById(emblemId); }
export function selectedCallingCard() { return callingCardById(cardId); }

export function setEmblem(id) { if (!EMBLEMS.some((e) => e.id === id) || id === emblemId) return false; emblemId = id; fire(); return true; }
export function setCallingCard(id) { if (!CALLING_CARDS.some((c) => c.id === id) || id === cardId) return false; cardId = id; fire(); return true; }

/** Seed from a saved profile without notifying (called once at boot). */
export function initIdentity({ emblem, callingCard } = {}) {
  if (emblem && EMBLEMS.some((e) => e.id === emblem)) emblemId = emblem;
  if (callingCard && CALLING_CARDS.some((c) => c.id === callingCard)) cardId = callingCard;
}

export function onIdentityChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
