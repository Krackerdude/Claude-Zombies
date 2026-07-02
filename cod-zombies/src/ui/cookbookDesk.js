/**
 * The desk the Cookbook sits on — a top-down alchemist's workbench strewn with
 * lore props, rendered as flat SVG illustrations (no 3D). Everything is arranged
 * around the edges so it frames the open book without covering the recipes.
 * Purely decorative markup; positioned by cookbook.css.
 */
export function deskSceneHtml() {
  return `
    <div class="cb-desk" aria-hidden="true">
      <div class="cb-desk-grain"></div>
      <div class="cb-stain s1"></div><div class="cb-stain s2"></div><div class="cb-stain blood"></div>
      <div class="cb-scrap sc1">${sketchPaper()}</div>
      <div class="cb-scrap sc2">${runePaper()}</div>
      <div class="cb-scrap sc3">${sketchPaper()}</div>
      <div class="cb-prop teapot">${teapot()}</div>
      <div class="cb-prop magnifier">${magnifier()}</div>
      <div class="cb-prop inkwell">${inkwell()}</div>
      <div class="cb-prop candle">${candle()}</div>
      <div class="cb-prop compass">${compass()}</div>
      <div class="cb-prop scroll">${scroll()}</div>
      <div class="cb-prop vial">${vial()}</div>
      <div class="cb-corner tl">${filigree()}</div>
      <div class="cb-corner tr">${filigree()}</div>
      <div class="cb-corner bl">${filigree()}</div>
      <div class="cb-corner br">${filigree()}</div>
    </div>`;
}

const BR = '#b8934a', BRD = '#7c5f28', BRH = '#e6c579', DK = '#2a2018', IRON = '#3b3a3c';

function teapot() {
  return `<svg viewBox="0 0 150 110">
    <path d="M28 60 q-16 -6 -20 -18 q10 2 22 8Z" fill="${BR}" stroke="${BRD}" stroke-width="2"/>
    <ellipse cx="78" cy="62" rx="48" ry="34" fill="${BR}" stroke="${BRD}" stroke-width="3"/>
    <ellipse cx="78" cy="62" rx="48" ry="34" fill="none" stroke="${BRH}" stroke-width="1.5" opacity="0.6" transform="translate(-3 -4) scale(0.9)" transform-origin="78 62"/>
    <path d="M120 52 q26 -2 24 20 q-2 -12 -22 -10Z" fill="${BR}" stroke="${BRD}" stroke-width="2"/>
    <ellipse cx="78" cy="34" rx="30" ry="12" fill="${BRD}"/>
    <ellipse cx="78" cy="30" rx="24" ry="9" fill="${BR}" stroke="${BRD}" stroke-width="2"/>
    <circle cx="78" cy="24" r="6" fill="${BRH}" stroke="${BRD}" stroke-width="1.5"/>
    <ellipse cx="70" cy="55" rx="14" ry="9" fill="${BRH}" opacity="0.45"/>
  </svg>`;
}

function magnifier() {
  return `<svg viewBox="0 0 150 150">
    <rect x="96" y="96" width="60" height="20" rx="10" fill="${DK}" stroke="${BRD}" stroke-width="2" transform="rotate(45 110 106)"/>
    <circle cx="66" cy="66" r="48" fill="none" stroke="${BR}" stroke-width="10"/>
    <circle cx="66" cy="66" r="48" fill="none" stroke="${BRH}" stroke-width="2" opacity="0.6"/>
    <circle cx="66" cy="66" r="42" fill="#bfe0ef" opacity="0.16"/>
    <path d="M40 46 a42 42 0 0 1 30 -14" stroke="#ffffff" stroke-width="6" fill="none" opacity="0.28" stroke-linecap="round"/>
  </svg>`;
}

function inkwell() {
  return `<svg viewBox="0 0 120 150">
    <path d="M34 66 L86 66 L80 128 Q60 138 40 128Z" fill="#141018" stroke="${BRD}" stroke-width="2.5"/>
    <ellipse cx="60" cy="66" rx="26" ry="8" fill="#0a0810"/>
    <ellipse cx="60" cy="65" rx="20" ry="5" fill="#2a1f45"/>
    <rect x="52" y="40" width="16" height="28" fill="${BRD}"/>
    <path d="M60 44 C 70 6 96 -6 116 4 C 92 4 78 22 66 52 Z" fill="#efe6cf" stroke="${BRD}" stroke-width="1.5"/>
    <path d="M60 46 C 74 20 92 10 108 8" stroke="${BRD}" stroke-width="1" fill="none" opacity="0.5"/>
  </svg>`;
}

function candle() {
  return `<svg viewBox="0 0 90 150">
    <ellipse cx="45" cy="138" rx="34" ry="9" fill="${BRD}"/>
    <ellipse cx="45" cy="132" rx="30" ry="8" fill="${BR}" stroke="${BRD}" stroke-width="2"/>
    <rect x="33" y="60" width="24" height="72" rx="4" fill="#efe3c6" stroke="#cbb98a" stroke-width="1.5"/>
    <ellipse cx="45" cy="60" rx="12" ry="4" fill="#f6efd8"/>
    <rect x="43" y="46" width="4" height="16" fill="#3a2a18"/>
    <ellipse class="cb-flame" cx="45" cy="34" rx="8" ry="16" fill="#ffcf6a"/>
    <ellipse cx="45" cy="38" rx="4" ry="9" fill="#fff3c8"/>
  </svg>`;
}

function compass() {
  const ticks = [];
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; ticks.push(`<line x1="${75 + Math.cos(a) * 56}" y1="${75 + Math.sin(a) * 56}" x2="${75 + Math.cos(a) * (i % 6 === 0 ? 46 : 51)}" y2="${75 + Math.sin(a) * (i % 6 === 0 ? 46 : 51)}" stroke="${BRD}" stroke-width="${i % 6 === 0 ? 2.4 : 1.2}"/>`); }
  return `<svg viewBox="0 0 150 150">
    <circle cx="75" cy="75" r="66" fill="${BR}" stroke="${BRD}" stroke-width="4"/>
    <circle cx="75" cy="75" r="60" fill="#efe6cf" stroke="${BRD}" stroke-width="2"/>
    ${ticks.join('')}
    <path d="M75 30 L84 75 L75 84 L66 75Z" fill="#b23020"/>
    <path d="M75 120 L66 75 L75 66 L84 75Z" fill="#33455a"/>
    <circle cx="75" cy="75" r="6" fill="${BRD}"/>
    <circle cx="75" cy="75" r="66" fill="none" stroke="${BRH}" stroke-width="1.5" opacity="0.5"/>
  </svg>`;
}

function scroll() {
  return `<svg viewBox="0 0 170 80">
    <rect x="20" y="16" width="130" height="48" fill="#e6dbbd" stroke="#cbb98a" stroke-width="2"/>
    ${[26, 34, 42, 50].map((y) => `<line x1="34" y1="${y}" x2="128" y2="${y}" stroke="#9a875a" stroke-width="1.4" opacity="0.5"/>`).join('')}
    <ellipse cx="20" cy="40" rx="12" ry="26" fill="${BR}" stroke="${BRD}" stroke-width="2"/>
    <ellipse cx="150" cy="40" rx="12" ry="26" fill="${BR}" stroke="${BRD}" stroke-width="2"/>
    <ellipse cx="20" cy="40" rx="5" ry="20" fill="${BRD}"/>
    <ellipse cx="150" cy="40" rx="5" ry="20" fill="${BRD}"/>
  </svg>`;
}

function vial() {
  return `<svg viewBox="0 0 60 120">
    <rect x="22" y="8" width="16" height="12" rx="2" fill="${BRD}"/>
    <path d="M20 20 H40 V88 a10 10 0 0 1 -20 0Z" fill="#bfe6ef" opacity="0.3" stroke="#8fb9c8" stroke-width="1.5"/>
    <path d="M23 60 H37 V88 a7 7 0 0 1 -14 0Z" fill="#7a3ff0" opacity="0.75"/>
    <circle cx="30" cy="80" r="2.5" fill="#c9a6ff" opacity="0.8"/>
  </svg>`;
}

function sketchPaper() {
  return `<svg viewBox="0 0 160 120" preserveAspectRatio="none">
    <rect x="4" y="4" width="152" height="112" fill="#e9dfc2" stroke="#cbb98a" stroke-width="1.5"/>
    <circle cx="80" cy="58" r="34" fill="none" stroke="#8a7448" stroke-width="1.4"/>
    <circle cx="80" cy="58" r="22" fill="none" stroke="#8a7448" stroke-width="1"/>
    <line x1="80" y1="14" x2="80" y2="102" stroke="#8a7448" stroke-width="1"/>
    <line x1="36" y1="58" x2="124" y2="58" stroke="#8a7448" stroke-width="1"/>
    ${[20, 30, 40].map((y) => `<line x1="14" y1="${y}" x2="30" y2="${y}" stroke="#8a7448" stroke-width="1"/>`).join('')}
  </svg>`;
}

function runePaper() {
  const runes = ['M10 4 L18 10 L10 16 M18 4 L10 10 L18 16', 'M4 4 L16 4 M10 4 L10 16', 'M4 16 L10 4 L16 16', 'M4 4 L16 16 M16 4 L4 16'];
  const rows = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) rows.push(`<path transform="translate(${18 + c * 26} ${20 + r * 24})" d="${runes[(r + c) % runes.length]}" stroke="#7a6238" stroke-width="1.4" fill="none"/>`);
  return `<svg viewBox="0 0 160 130" preserveAspectRatio="none">
    <rect x="4" y="4" width="152" height="122" fill="#e4d8b6" stroke="#cbb98a" stroke-width="1.5"/>
    ${rows.join('')}
  </svg>`;
}

function filigree() {
  return `<svg viewBox="0 0 120 120">
    <path d="M6 6 Q60 10 60 60 M6 6 Q10 60 60 60 M6 6 L30 6 M6 6 L6 30" fill="none" stroke="${BR}" stroke-width="2.5" opacity="0.55"/>
    <path d="M22 22 q22 2 22 24 q-2 -14 -22 -16Z" fill="${BR}" opacity="0.4"/>
    <circle cx="14" cy="14" r="3" fill="${BRH}" opacity="0.6"/>
  </svg>`;
}
