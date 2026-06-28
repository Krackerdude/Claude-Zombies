/**
 * Stylized Liquid Divinium vial — a glowing, gently bubbling blue vial rendered
 * as inline SVG so it scales crisply and animates via CSS (see divinium.css).
 * Shared by the in-game earn popup and the factory tracker widget.
 *
 * Each call namespaces its gradient/clip ids with a unique suffix so multiple
 * vials can coexist on the page without id collisions.
 */
let _uid = 0;

export function diviniumVialSvg() {
  const u = `ld${++_uid}`;
  return `
  <svg class="ld-vial" viewBox="0 0 40 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="${u}-liq" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#bdefff"/>
        <stop offset="0.35" stop-color="#37a6ff"/>
        <stop offset="1" stop-color="#0b39d8"/>
      </linearGradient>
      <linearGradient id="${u}-glass" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#dff4ff" stop-opacity="0.55"/>
        <stop offset="0.5" stop-color="#9fc7e6" stop-opacity="0.12"/>
        <stop offset="1" stop-color="#dff4ff" stop-opacity="0.4"/>
      </linearGradient>
      <clipPath id="${u}-clip">
        <path d="M13 18 H27 V49 a7 7 0 0 1 -14 0 Z"/>
      </clipPath>
    </defs>

    <!-- soft outer glow halo -->
    <ellipse class="ld-halo" cx="20" cy="38" rx="17" ry="22"/>

    <!-- liquid + internal animation, clipped to the vial interior -->
    <g clip-path="url(#${u}-clip)">
      <rect class="ld-liquid" x="11" y="26" width="18" height="32" fill="url(#${u}-liq)"/>
      <path class="ld-surface" d="M11 26 q9 -5 18 0 v4 h-18 Z"/>
      <circle class="ld-bub ld-b1" cx="17" cy="50" r="1.6"/>
      <circle class="ld-bub ld-b2" cx="23" cy="52" r="1.1"/>
      <circle class="ld-bub ld-b3" cx="20" cy="48" r="2.0"/>
      <rect class="ld-streak" x="14" y="28" width="2.4" height="26" rx="1.2"/>
    </g>

    <!-- glass body + rim highlight -->
    <path class="ld-glass" d="M13 18 H27 V49 a7 7 0 0 1 -14 0 Z" fill="url(#${u}-glass)"/>
    <path class="ld-glass-edge" d="M13 18 H27 V49 a7 7 0 0 1 -14 0 Z"/>

    <!-- neck + cork -->
    <rect class="ld-neck" x="14" y="11" width="12" height="8"/>
    <rect class="ld-lip" x="12.5" y="10" width="15" height="3.5" rx="1.6"/>
    <rect class="ld-cork" x="15.5" y="5" width="9" height="6.5" rx="1.6"/>
  </svg>`;
}
