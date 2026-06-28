/**
 * White line-art glyphs stamped on each GobbleGum (the emblem on the gumball).
 * Simple, single-weight 24×24 stroke icons so they read at any size and sit
 * cleanly on the colored sphere. Keys are referenced by gobblegums.js; missing
 * keys fall back to the generic 'gum' mark.
 */
const P = Object.freeze({
  flask:    '<path d="M9 3h6 M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7.5 15h9"/>',
  swift:    '<path d="M4 7l5 5-5 5 M11 7l5 5-5 5"/>',
  teleport: '<path d="M5 12a7 7 0 1 1 2 5"/><path d="M4 18v-4h4"/>',
  swap:     '<path d="M4 9h13l-4-4 M20 15H7l4 4"/>',
  bolt:     '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
  drop:     '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  shield:   '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/>',
  barrier:  '<path d="M4 9h16 M4 15h16 M8 4l-1 16 M16 4l1 16"/>',
  ghost:    '<path d="M5 21V10a7 7 0 0 1 14 0v11l-3-2-2 2-2-2-2 2-3-2z"/><path d="M9 10h.01 M15 10h.01"/>',
  star:     '<path d="M12 3l2.6 6 6.4.6-5 4.2 1.6 6.2L12 17l-5.6 3 1.6-6.2-5-4.2 6.4-.6z"/>',
  target:   '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 12h.01"/>',
  grenade:  '<path d="M9 4h6 M12 4v3 M7 9 5 7"/><circle cx="12" cy="14" r="7"/>',
  sword:    '<path d="M14 3l7 7-9 9-3 1 1-3z M5 19l3 3 M7 14l3 3"/>',
  ammo:     '<path d="M8 4h3v9l-1.5 3L8 13z M14 4h3v9l-1.5 3L14 13z"/>',
  revive:   '<circle cx="12" cy="12" r="9"/><path d="M12 8v8 M8 12h8"/>',
  fire:     '<path d="M12 3c2 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5-1-8z"/>',
  crawler:  '<path d="M3 18h4l2-3h6l2 3h4 M9 15V9a3 3 0 0 1 6 0v6"/>',
  nuke:     '<circle cx="12" cy="12" r="9"/><path d="M12 12l4-7 M12 12l-4-7 M12 12v8 M12 12h.01"/>',
  pap:      '<path d="M12 21V8 M7 13l5-5 5 5 M6 4h12"/>',
  minigun:  '<path d="M3 9h12v6H3z M15 10h5 M15 14h5 M6 9V6 M10 9V6"/>',
  gum:      '<circle cx="12" cy="12" r="8"/><path d="M9 9a3 3 0 0 1 3-2"/>',
  powerup:  '<path d="M12 4l1.8 4.2L18 6l-2.2 4.2L20 12l-4.2 1.8L18 18l-4.2-2.2L12 20l-1.8-4.2L6 18l2.2-4.2L4 12l4.2-1.8L6 6l4.2 2.2z"/>',
  tag:      '<path d="M3 11l8-8h7v7l-8 8z"/><path d="M15 7h.01"/>',
  hammer:   '<path d="M14 3l7 7-3 3-7-7z M11 6l-8 8 3 3 8-8"/>',
  burst:    '<path d="M12 3l2 5 5-3-1 6 5 1-5 3 2 5-5-3-2 5-2-5-5 3 2-5-5-3 5-1-1-6 5 3z"/>',
  box:      '<path d="M4 8l8-4 8 4-8 4z M4 8v8l8 4 8-4V8 M12 12v8"/>',
  slide:    '<path d="M3 17h10 M5 13h9 M13 7l5 5-5 5"/>',
  teddy:    '<circle cx="12" cy="13" r="5"/><circle cx="7" cy="7" r="2"/><circle cx="17" cy="7" r="2"/><path d="M10 13h4 M11 11h.01 M13 11h.01"/>',
  perkplus: '<path d="M8 8h5v10a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2z M9 5h3v3H9z M18 5v5 M15.5 7.5h5"/>',
  x2:       '<path d="M4 8l5 8 M9 8l-5 8 M14 9a2 2 0 1 1 4 0c0 2-4 3-4 7h4"/>',
  points:   '<path d="M12 3v18 M16 7a4 3 0 0 0-4-2c-3 0-4 2-4 3.2S9 11 12 11s4 1 4 3-1 3-4 3a4 3 0 0 1-4-2"/>',
  eye:      '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  insta:    '<path d="M12 3a8 8 0 0 0-5 14v3h10v-3a8 8 0 0 0-5-14z M9 11h.01 M15 11h.01 M10 16h4"/>',
  perk:     '<path d="M9 8h6v10a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z M10 4h4v4h-4z M9.5 12h5"/>',
  clock:    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  slow:     '<path d="M3 17a6 6 0 0 1 6-6 5 5 0 1 1 5 5H3z M19 11l2-2 M19 11l2 2"/>',
  wall:     '<path d="M3 6h18v12H3z M3 12h18 M10 6v6 M14 12v6"/>',
  flag:     '<path d="M5 21V4 M5 4h11l-2 4 2 4H5"/>',
  freeze:   '<path d="M12 3v18 M3 12h18 M6 6l12 12 M18 6L6 18"/>',
  music:    '<path d="M9 18V5l10-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  palette:  '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 1-2 2-2h3a4 4 0 0 0 4-4 9 9 0 0 0-9-9z"/><path d="M8 11h.01 M12 8h.01 M16 11h.01"/>',
  gift:     '<path d="M4 11h16v9H4z M3 7h18v4H3z M12 7v13"/><path d="M9 7a2 2 0 1 1 3-2 M15 7a2 2 0 1 0-3-2"/>',
  cloud:    '<path d="M6 16a4 4 0 0 1 0-8 5 5 0 0 1 10 1 3 3 0 0 1 0 7z M9 20l1-2 M14 20l1-2"/>',
  up:       '<path d="M12 21V5 M6 11l6-6 6 6"/>',
  duck:     '<circle cx="14.5" cy="7.5" r="1.2"/><path d="M4 13a6 6 0 0 0 11 3h2a3 3 0 0 0 3-3c0-2-2-3-4-3h-5a5 5 0 0 0-7 3z M16 11h3"/>',
  rainbow:  '<path d="M4 18a8 8 0 0 1 16 0 M7 18a5 5 0 0 1 10 0 M10 18a2 2 0 0 1 4 0"/>',
});

/** Raw inner-SVG markup for a glyph key (or the fallback). */
export function gumGlyphInner(key) { return P[key] ?? P.gum; }

/** A complete white-stroke <svg> string for a glyph, sized by the caller's box. */
export function gumGlyphSvg(key) {
  return `<svg class="gg-glyph" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.7"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${gumGlyphInner(key)}</svg>`;
}
