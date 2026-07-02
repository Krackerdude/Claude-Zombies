/**
 * Stylized inline-SVG glyphs for the power-up HUD chips (and anywhere else a
 * drop needs a 2D icon). Each is a small self-contained emblem that reads its
 * purpose at a glance — no more bare "2X / IK / ZB" letters. Two-tone so they
 * pop on the chip's dark inset disc: a bright body + a darker recess for detail.
 *
 * viewBox is a fixed 0 0 32 32; colours are baked so the markup drops straight
 * into an element's innerHTML.
 */

const LIGHT = '#ffe7ac';   // warm bright body
const DEEP = '#171008';    // recess / knockout tone
const BONE = '#f2e6c6';    // skull bone
const BLOOD = '#e2413a';   // blood red
const STEEL = '#cfd7dd';   // brass/steel

export const POWERUP_ICON_SVG = {
  // Double Points — twin coins stamped with a bold ×2
  doublePoints: `<svg viewBox="0 0 32 32">
    <ellipse cx="12" cy="20" rx="8.5" ry="8.5" fill="#b9832a"/>
    <ellipse cx="12" cy="20" rx="8.5" ry="8.5" fill="none" stroke="#7a5514" stroke-width="1.4"/>
    <ellipse cx="20" cy="12" rx="9" ry="9" fill="${LIGHT}"/>
    <ellipse cx="20" cy="12" rx="9" ry="9" fill="none" stroke="#a9791f" stroke-width="1.5"/>
    <ellipse cx="20" cy="12" rx="6.4" ry="6.4" fill="none" stroke="#c99a2c" stroke-width="1"/>
    <text x="20" y="16.4" text-anchor="middle" font-family="Anton, Impact, sans-serif" font-size="10.5" fill="${DEEP}">2×</text>
  </svg>`,

  // Insta-Kill — a grinning skull
  instaKill: `<svg viewBox="0 0 32 32">
    <path d="M16 3c-6 0-10.4 4.2-10.4 9.6 0 3 1.3 5.2 3.3 6.6v3c0 .8.6 1.4 1.4 1.4h1v2.4c0 .8.6 1.4 1.4 1.4h6.6c.8 0 1.4-.6 1.4-1.4v-2.4h1c.8 0 1.4-.6 1.4-1.4v-3c2-1.4 3.3-3.6 3.3-6.6C26.4 7.2 22 3 16 3z" fill="${BONE}"/>
    <ellipse cx="11.6" cy="13.4" rx="3" ry="3.4" fill="${DEEP}"/>
    <ellipse cx="20.4" cy="13.4" rx="3" ry="3.4" fill="${DEEP}"/>
    <path d="M16 16.6l2 4h-4z" fill="${DEEP}"/>
    <path d="M12.3 24.2v2.6M16 24.4v2.8M19.7 24.2v2.6" stroke="${DEEP}" stroke-width="1.3"/>
  </svg>`,

  // Zombie Blood — a fat blood droplet with a highlight
  zombieBlood: `<svg viewBox="0 0 32 32">
    <path d="M16 3c0 0 8 8.6 8 14.2A8 8 0 0 1 8 17.2C8 11.6 16 3 16 3z" fill="${BLOOD}"/>
    <path d="M16 3c0 0 8 8.6 8 14.2A8 8 0 0 1 8 17.2C8 11.6 16 3 16 3z" fill="none" stroke="#8c1a16" stroke-width="1.2"/>
    <path d="M12.6 18.5a3.6 3.6 0 0 0 3.2 4.4" fill="none" stroke="#ffb0aa" stroke-width="1.8" stroke-linecap="round" opacity="0.8"/>
  </svg>`,

  // Nuke — a mushroom cloud
  nuke: `<svg viewBox="0 0 32 32">
    <path d="M16 4c4 0 6.5 2.2 6.5 4.6 0 1.4-.9 2.3-1.5 2.8 1.3.4 2.4 1.5 2.4 3 0 1.9-1.8 3-3.6 3-1 0-1.7-.3-2.3-.7v2.1h-3v-2.1c-.6.4-1.3.7-2.3.7-1.8 0-3.6-1.1-3.6-3 0-1.5 1.1-2.6 2.4-3-.6-.5-1.5-1.4-1.5-2.8C9.5 6.2 12 4 16 4z" fill="${LIGHT}"/>
    <rect x="12.5" y="20.5" width="7" height="3" rx="1" fill="#b9832a"/>
    <path d="M11 25h10l-1.4 3.4a1 1 0 0 1-.9.6h-4.4a1 1 0 0 1-.9-.6z" fill="${LIGHT}"/>
  </svg>`,

  // Max Ammo — a trio of standing rounds in a clip
  maxAmmo: `<svg viewBox="0 0 32 32">
    <g>
      <rect x="8" y="9" width="4" height="11" rx="1" fill="#c9a233"/>
      <path d="M8 9l2-4 2 4z" fill="${LIGHT}"/>
      <rect x="14" y="7" width="4" height="13" rx="1" fill="#c9a233"/>
      <path d="M14 7l2-4 2 4z" fill="${LIGHT}"/>
      <rect x="20" y="9" width="4" height="11" rx="1" fill="#c9a233"/>
      <path d="M20 9l2-4 2 4z" fill="${LIGHT}"/>
    </g>
    <rect x="6" y="20" width="20" height="4" rx="1.3" fill="${STEEL}"/>
    <rect x="6" y="20" width="20" height="4" rx="1.3" fill="none" stroke="#6b737b" stroke-width="0.9"/>
  </svg>`,

  // Carpenter — a claw hammer
  carpenter: `<svg viewBox="0 0 32 32">
    <path d="M8 7c3-2 8-2 11 0l-1.4 2.6c-2-1.2-4.6-1.2-6.6 0l1.5 2.2-2.2 1.5-1.5-2.2c-1.4 1.6-1.6 3.4-.9 5L6 17C4.6 13.4 5.4 9.2 8 7z" fill="${STEEL}"/>
    <rect x="14.6" y="12.2" width="3" height="16" rx="1.4" transform="rotate(-34 16 20)" fill="#8a5a2c"/>
  </svg>`,

  // Blood Money — a coin bleeding value
  bloodMoney: `<svg viewBox="0 0 32 32">
    <circle cx="16" cy="15" r="10" fill="${LIGHT}"/>
    <circle cx="16" cy="15" r="10" fill="none" stroke="#a9791f" stroke-width="1.5"/>
    <circle cx="16" cy="15" r="7" fill="none" stroke="#c99a2c" stroke-width="1"/>
    <text x="16" y="19.5" text-anchor="middle" font-family="Anton, Impact, sans-serif" font-size="13" fill="${BLOOD}">$</text>
  </svg>`,
};

/** The chip's accent hue per power-up (drives the ring + glow). */
export const POWERUP_ICON_TINT = {
  doublePoints: '#ffcf4a',
  instaKill: '#ff5a4a',
  zombieBlood: '#e2413a',
  nuke: '#ffd23a',
  maxAmmo: '#ffd23a',
  carpenter: '#d7b06a',
  bloodMoney: '#ff7a4a',
};
