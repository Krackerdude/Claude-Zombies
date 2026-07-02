/**
 * The NECROPOLIS title — a designed SVG emblem, not a font with a gradient.
 * Layers (back → front): a burst of angular purple/teal crystal shards, a soft
 * breathing spectral glow, then the wordmark rendered three times for a carved
 * look — a dark drop for depth, the main fill with a turbulence/displacement
 * filter that chisels rough stone edges into the glyphs, and a light rim stroke.
 * A jagged glowing fault-line grounds it and a row of runic ticks rides beneath.
 * The flowing purple→teal→green gradient, the glow and a gentle float animate it.
 */
export function menuLogoSvg() {
  // A faceted crystal shard: split down a central spine into a shadow facet and
  // a lit facet, with a bright chine-line and a tip glint so it reads as cut
  // gemstone rather than a flat triangle. `tone` picks the base gradient.
  const P = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`;
  const shard = (cx, tipY, baseY, w, tone, opacity = 1, tilt = 0) => {
    const tip = [cx + tilt, tipY];
    const bl = [cx - w, baseY];
    const br = [cx + w, baseY];
    const bm = [cx - w * 0.18, baseY];               // spine meets the base off-centre
    const knee = [cx + w * 0.34, baseY + (tipY - baseY) * 0.42]; // a bevel breaking the right edge
    const glint = [cx + tilt * 0.55, tipY + (baseY - tipY) * 0.16];
    return `<g opacity="${opacity}">
      <polygon points="${P(...tip)} ${P(...bl)} ${P(...br)}" fill="url(#necShard${tone})"/>
      <polygon points="${P(...tip)} ${P(...bl)} ${P(...bm)}" fill="#05010f" opacity="0.34"/>
      <polygon points="${P(...tip)} ${P(...bm)} ${P(...knee)}" fill="#ffffff" opacity="0.10"/>
      <polygon points="${P(...tip)} ${P(...knee)} ${P(...br)}" fill="#ffffff" opacity="0.20"/>
      <polygon points="${P(...tip)} ${P(...glint)} ${P(cx - w * 0.14, tipY + (baseY - tipY) * 0.28)}" fill="#ffffff" opacity="0.6"/>
      <polyline points="${P(...tip)} ${P(...bm)}" fill="none" stroke="#ffffff" stroke-width="1.1" opacity="0.5"/>
      <polyline points="${P(...tip)} ${P(...knee)}" fill="none" stroke="#04030a" stroke-width="1" opacity="0.4"/>
    </g>`;
  };

  // Two clusters: a tall crown behind the wordmark, plus shorter risers below.
  // Slim sliver shards tucked between the big ones make it read as a fractured
  // cluster (the detail the plain triangles were missing).
  const shards = [
    shard(150, -46, 154, 33, 'P', 1, 6),
    shard(214, 96, 150, 12, 'T', 0.75, -3),
    shard(286, -58, 145, 44, 'T', 1, -5),
    shard(404, -66, 138, 31, 'P', 1, 4),
    shard(462, 84, 140, 11, 'G', 0.7, 2),
    shard(520, -74, 135, 36, 'G', 1, 0),
    shard(648, -60, 140, 35, 'P', 1, -4),
    shard(716, 90, 146, 12, 'P', 0.72, 3),
    shard(772, -52, 145, 41, 'T', 1, 5),
    shard(874, -40, 155, 33, 'P', 1, -6),
    shard(332, 348, 251, 33, 'P', 0.82, -4),
    shard(518, 360, 254, 34, 'T', 0.82, 3),
    shard(694, 352, 251, 33, 'P', 0.82, -3),
  ].join('');

  // runic tick band under the wordmark
  const runes = [];
  const glyphs = ['M2 0 L10 6 L2 12 M10 0 L2 6 L10 12', 'M0 0 L12 0 M6 0 L6 12 M0 12 L12 12',
    'M0 0 L6 12 L12 0', 'M2 0 L2 12 M2 6 L11 1 M2 6 L11 11', 'M0 0 L12 0 L6 12 Z',
    'M6 0 L6 12 M0 4 L12 4', 'M0 0 L0 12 L10 6 Z', 'M2 1 L10 11 M10 1 L2 11'];
  for (let i = 0; i < 13; i++) {
    const x = 150 + i * 56;
    runes.push(`<path transform="translate(${x} 296)" d="${glyphs[i % glyphs.length]}"/>`);
  }

  return `
<svg class="nec-logo" viewBox="0 -56 1000 420" xmlns="http://www.w3.org/2000/svg" aria-label="Necropolis" role="img">
  <defs>
    <linearGradient id="necFlow" x1="0" y1="0" x2="520" y2="40" gradientUnits="userSpaceOnUse" spreadMethod="repeat">
      <stop offset="0"    stop-color="#c08cff"/>
      <stop offset="0.17" stop-color="#8aa6ff"/>
      <stop offset="0.34" stop-color="#52e6da"/>
      <stop offset="0.5"  stop-color="#9bff9e"/>
      <stop offset="0.66" stop-color="#52e6da"/>
      <stop offset="0.83" stop-color="#8aa6ff"/>
      <stop offset="1"    stop-color="#c08cff"/>
      <animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="520 0" dur="9s" repeatCount="indefinite"/>
    </linearGradient>
    <linearGradient id="necShardP" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d8bcff"/><stop offset="0.45" stop-color="#7a3ff0"/><stop offset="1" stop-color="#1c0d35"/>
    </linearGradient>
    <linearGradient id="necShardT" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b6fff4"/><stop offset="0.5" stop-color="#2bb7ab"/><stop offset="1" stop-color="#0a3b38"/>
    </linearGradient>
    <linearGradient id="necShardG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d4ffba"/><stop offset="0.5" stop-color="#5fbf4e"/><stop offset="1" stop-color="#123a10"/>
    </linearGradient>
    <!-- chisels rough stone edges + a rocky grain into the letters -->
    <filter id="necStone" x="-12%" y="-30%" width="124%" height="160%">
      <feTurbulence type="fractalNoise" baseFrequency="0.015 0.024" numOctaves="3" seed="9" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="8" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="necSoft" x="-50%" y="-70%" width="200%" height="240%"><feGaussianBlur stdDeviation="17"/></filter>
    <filter id="necShardGlow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3"/></filter>
  </defs>

  <!-- faceted crystal shards bursting out behind the wordmark -->
  <g class="nec-shards" filter="url(#necShardGlow)">
    ${shards}
  </g>

  <!-- breathing spectral glow -->
  <text class="nec-glow" x="500" y="232" text-anchor="middle" textLength="930" lengthAdjust="spacingAndGlyphs"
        fill="url(#necFlow)" filter="url(#necSoft)">NECROPOLIS</text>

  <!-- carved stone wordmark: drop shadow, chiselled fill, light rim -->
  <text class="nec-cut" x="507" y="240" text-anchor="middle" textLength="930" lengthAdjust="spacingAndGlyphs" fill="#04030a">NECROPOLIS</text>
  <text class="nec-main" x="500" y="232" text-anchor="middle" textLength="930" lengthAdjust="spacingAndGlyphs"
        fill="url(#necFlow)" filter="url(#necStone)">NECROPOLIS</text>
  <text class="nec-rim" x="500" y="232" text-anchor="middle" textLength="930" lengthAdjust="spacingAndGlyphs"
        fill="none" stroke="#e6fbff" stroke-width="1.1" opacity="0.32">NECROPOLIS</text>

  <!-- jagged glowing fault-line beneath -->
  <path class="nec-fault" d="M120 280 L300 274 L360 286 L520 272 L600 288 L760 274 L880 282"
        fill="none" stroke="url(#necFlow)" stroke-width="3.2" stroke-linejoin="bevel" filter="url(#necShardGlow)"/>
  <!-- runic ticks -->
  <g class="nec-runes" fill="none" stroke="#86efe0" stroke-width="2.2" stroke-linecap="round" opacity="0.55">
    ${runes.join('')}
  </g>
</svg>`;
}
