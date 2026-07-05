/**
 * The dark surround the Cookbook sits on. Deliberately sparse: no cartoon props —
 * just a deep, grimy backdrop of warm candlelight pools, ink stains and heavy
 * grain that reads well once cookbook.css blurs + darkens the whole layer, so the
 * leather tome floats in a moody, out-of-focus study (the "Dear Diary" feel).
 * Purely decorative markup; positioned + blurred by cookbook.css.
 */
export function deskSceneHtml() {
  return `
    <div class="cb-desk" aria-hidden="true">
      <div class="cb-desk-grain"></div>
      <div class="cb-glow g1"></div>
      <div class="cb-glow g2"></div>
      <div class="cb-stain s1"></div>
      <div class="cb-stain s2"></div>
      <div class="cb-stain s3"></div>
      <div class="cb-stain blood"></div>
    </div>`;
}
