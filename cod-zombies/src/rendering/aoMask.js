import * as THREE from 'three';

/**
 * Ambient-occlusion exclusion tagging.
 *
 * AO is a screen-space contact-shadow effect — it has no business darkening
 * things that EMIT light or that are pure FX (they only muddy the image). We
 * exclude them deterministically (not by a brightness guess): tagged meshes are
 * flagged onto a dedicated render layer, PostFX renders those into a mask, and
 * the AO apply pass forces "no occlusion" wherever the mask is set.
 *
 * Two ways in:
 *   markNoAO(obj)        — force-exclude a whole subtree (opaque FX the material
 *                          rule can't detect: gibs, muzzle flash, etc.)
 *   autoTagNoAO(root)    — walk a subtree and exclude only the light-emitting /
 *                          FX PARTS by material (perk panels, neon, tracers,
 *                          impacts, plasma…), leaving the solid body to get AO.
 */
export const NO_AO_LAYER = 11;

/** A material that emits light or is a pure additive/transparent effect —
 *  i.e. something AO should never touch. */
function emitsOrFx(m) {
  if (!m) return false;
  if (m.isMeshBasicMaterial) return true;                 // unlit = self-lit / FX
  if (m.transparent === true) return true;                // sprites, decals, glows
  if (m.blending === THREE.AdditiveBlending) return true; // energy / muzzle / tracers
  const e = m.emissive;                                   // lit surface with a glow
  if (e && (m.emissiveIntensity ?? 1) > 0 && (e.r + e.g + e.b) > 0.001) return true;
  return false;
}

const RENDERABLE = (o) => o.isMesh || o.isSprite || o.isPoints;

/** Force every renderable under `obj` out of AO (use for opaque FX the material
 *  rule can't see, e.g. blood gibs). */
export function markNoAO(obj) {
  obj.traverse((o) => { if (RENDERABLE(o)) o.layers.enable(NO_AO_LAYER); });
}

/** Tag only the light-emitting / FX parts under `root` (by material), so the
 *  solid geometry of the same model still receives AO. */
export function autoTagNoAO(root) {
  root.traverse((o) => {
    if (!RENDERABLE(o)) return;
    const mat = o.material;
    const hit = Array.isArray(mat) ? mat.some(emitsOrFx) : emitsOrFx(mat);
    if (hit) o.layers.enable(NO_AO_LAYER);
  });
}
