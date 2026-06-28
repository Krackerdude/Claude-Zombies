import { ACT, gumById } from '../gobblegums/gobblegums.js';
import { gumGlyphSvg } from '../gobblegums/gumGlyphs.js';

/**
 * Shared glossy CSS gumball markup — used by the catalog grid, the pack rows and
 * the player widget so a given gum looks identical everywhere. Color + swirl +
 * emblem come from the gum's activation type; `d` is the diameter in px.
 */
export function gumBallHtml(gum, d) {
  const act = ACT[gum.act] ?? ACT.time;
  const rainbow = gum.act === 'whimsy' ? ' gg-rainbow' : '';
  return `<div class="gg-ball${rainbow}" style="--d:${d}px;--col:${act.color};--glow:${act.glow}">${gumGlyphSvg(gum.glyph)}</div>`;
}

/** A gumball by id, or an empty-socket placeholder when the slot is null. */
export function slotHtml(gumId, d) {
  const gum = gumId ? gumById(gumId) : null;
  if (gum) return gumBallHtml(gum, d);
  return `<div class="gg-empty" style="--d:${d}px"></div>`;
}
