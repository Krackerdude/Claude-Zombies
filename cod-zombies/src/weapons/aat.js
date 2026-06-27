/**
 * Alternate Ammo Types (AATs) granted by Re-Packing a Pack-a-Punched weapon.
 * Each carries its own colour + a small stylised glyph for the HUD badge (drawn
 * as inline SVG, tinted by `color`, framed in silver by the HUD). The gameplay
 * effects live in AATSystem; this is the catalogue + presentation metadata.
 */

export const AAT_IDS = ['napalm', 'turned', 'fireworks', 'thunderwall', 'cryo', 'mend', 'rift'];

// 24x24 glyphs, filled with currentColor so the HUD can tint them per-AAT.
const GLYPH = {
  // a licking flame
  napalm: '<path d="M12 2c1 4-3 5-3 9a3 3 0 0 0 6 0c0-1-1-2-1-3 2 1 3 3 3 5a5 5 0 0 1-10 0c0-5 5-6 5-11z"/>',
  // an ally heart
  turned: '<path d="M12 21s-7-4.5-9.2-9C1.3 8.8 3 5.5 6.2 5.5c1.9 0 3.1 1 3.8 2 .7-1 1.9-2 3.8-2C17 5.5 18.7 8.8 21.2 12 19 16.5 12 21 12 21z"/>',
  // a firework starburst
  fireworks: '<g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v5M12 16v5M3 12h5M16 12h5M5.5 5.5l3.5 3.5M15 15l3.5 3.5M18.5 5.5L15 9M9 15l-3.5 3.5"/></g><circle cx="12" cy="12" r="2"/>',
  // a lightning bolt
  thunderwall: '<path d="M13 2L4 14h6l-2 8 10-13h-6z"/>',
  // a snowflake
  cryo: '<g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M12 6l2.2-2.2M12 6 9.8 3.8M12 18l2.2 2.2M12 18l-2.2 2.2"/></g>',
  // an angelic cross with rays
  mend: '<path d="M11 2h2v6h6v2h-6v12h-2V10H5V8h6z"/><g stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.8"><path d="M12 2v-0M4 6l-1-1M20 6l1-1"/></g>',
  // a swirling rift
  rift: '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M12 5a7 7 0 1 1-6.9 8.2 4.5 4.5 0 0 1 7.4-4 2.6 2.6 0 0 1-2.4 3.4"/>',
};

export const AATS = {
  napalm: { id: 'napalm', name: 'NAPALM BURST', color: '#ff6a18', glyph: GLYPH.napalm },
  turned: { id: 'turned', name: 'TURNED', color: '#4ade5a', glyph: GLYPH.turned },
  fireworks: { id: 'fireworks', name: 'FIREWORKS', color: '#ff48b0', glyph: GLYPH.fireworks },
  thunderwall: { id: 'thunderwall', name: 'THUNDERWALL', color: '#7fdcff', glyph: GLYPH.thunderwall },
  cryo: { id: 'cryo', name: 'CRYO FREEZE', color: '#8fd8ff', glyph: GLYPH.cryo },
  mend: { id: 'mend', name: 'LIGHT MEND', color: '#fff2b0', glyph: GLYPH.mend },
  rift: { id: 'rift', name: 'SHADOW RIFT', color: '#b26cff', glyph: GLYPH.rift },
};

export function aatName(id) { return AATS[id]?.name || ''; }
export function aatColor(id) { return AATS[id]?.color || '#cccccc'; }

/** Inline SVG for the HUD badge glyph, tinted to the AAT colour. */
export function aatGlyphSvg(id) {
  const a = AATS[id];
  if (!a) return '';
  return `<svg viewBox="0 0 24 24" fill="${a.color}" style="width:100%;height:100%">${a.glyph}</svg>`;
}

/** A random AAT id, optionally excluding the current one (Re-Pack re-roll). */
export function randomAat(exclude = null) {
  const pool = AAT_IDS.filter((id) => id !== exclude);
  return pool[(Math.random() * pool.length) | 0];
}
