import * as THREE from 'three';
import { ps1Snap } from '../rendering/ps1.js';

/**
 * The nine perks. Each has a signature color/accent, a cost, a short HUD glyph,
 * a vertical machine height (some taller than the player, some shorter), and a
 * theme tag that picks a distinct topper shape on its 1940s-60s soda machine.
 */
export const PERKS = {
  quickRevive:    { name: 'QUICK REVIVE',    cost: 500,  color: 0x9fd8ff, accent: 0xffffff, glyph: 'QR', h: 1.7,  theme: 'diner' },
  juggernog:      { name: 'JUGGERNOG',       cost: 2500, color: 0xc0392b, accent: 0xffffff, glyph: 'JUG', h: 2.15, theme: 'cozy' },
  speedCola:      { name: 'SPEED COLA',      cost: 3000, color: 0x2ecc40, accent: 0xffffff, glyph: 'SC', h: 1.95, theme: 'smooth' },
  staminUp:       { name: 'STAMIN-UP',       cost: 2000, color: 0xf1c40f, accent: 0xffffff, glyph: 'SU', h: 1.85, theme: 'jazz' },
  doubleTap:      { name: 'DOUBLE TAP',      cost: 2000, color: 0xe0922a, accent: 0xffffff, glyph: 'DT', h: 1.75, theme: 'cowboy' },
  muleKick:       { name: 'MULE KICK',       cost: 4000, color: 0x1f6b3b, accent: 0xffffff, glyph: 'MK', h: 2.05, theme: 'mexican' },
  deadshot:       { name: 'DEADSHOT',        cost: 1500, color: 0xf06a12, accent: 0x141414, glyph: 'DS', h: 1.6,  theme: 'metal' },
  electricCherry: { name: 'ELECTRIC CHERRY', cost: 2000, color: 0x3a7bff, accent: 0xffffff, glyph: 'EC', h: 1.8,  theme: 'electric' },
  phdFlopper:     { name: 'PHD FLOPPER',     cost: 2000, color: 0x8e44ad, accent: 0xffffff, glyph: 'PHD', h: 1.9, theme: 'disco' },
};

function hex(n) { return `#${n.toString(16).padStart(6, '0')}`; }

function nameTexture(name, colorHex) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = colorHex; x.fillRect(0, 0, 64, 256);
  x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(0, 0, 64, 256);
  x.save();
  x.translate(32, 128); x.rotate(-Math.PI / 2);
  x.fillStyle = '#f3ead2';
  x.font = 'bold 28px Georgia, "Times New Roman", serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(name, 0, 0);
  x.restore();
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

// warm, grimy planked-wood texture for the crate body
function woodTexture(base = '#6e4a28') {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 140; i++) {
    x.strokeStyle = `rgba(${30 + (Math.random() * 40 | 0)},${16 + (Math.random() * 22 | 0)},6,0.16)`;
    const y = Math.random() * 256;
    x.beginPath(); x.moveTo(0, y);
    x.bezierCurveTo(42, y + (Math.random() * 6 - 3), 90, y + (Math.random() * 6 - 3), 128, y);
    x.stroke();
  }
  x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,0.5)';
  for (let px = 0; px <= 128; px += 32) { x.beginPath(); x.moveTo(px, 0); x.lineTo(px, 256); x.stroke(); }
  x.lineWidth = 2; x.strokeStyle = 'rgba(255,200,120,0.07)';
  for (let px = 2; px < 128; px += 32) { x.beginPath(); x.moveTo(px, 0); x.lineTo(px, 256); x.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter;
  return t;
}

// stenciled "ROOT BEER 10¢" decal, cream western lettering with grime
function labelTexture(def) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 200;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 512, 200);
  x.fillStyle = 'rgba(238,226,198,0.92)';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '900 62px Georgia, "Times New Roman", serif';
  x.fillText('ROOT BEER', 200, 70);
  x.fillStyle = hex(def.color);
  x.font = '900 70px Georgia, serif';
  x.fillText('10¢', 440, 70);
  // worn grime knocked out of the lettering
  for (let i = 0; i < 60; i++) {
    x.fillStyle = `rgba(20,10,4,${0.1 + Math.random() * 0.25})`;
    x.beginPath(); x.arc(Math.random() * 512, Math.random() * 140, Math.random() * 6, 0, 7); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter;
  return t;
}

// glyph drawn for the bottle-cap emblem (theme symbol, white on clear)
// Double Tap — crossed bullets over a starburst (the perk's signature emblem)
function doubleTapIcon() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d'); x.clearRect(0, 0, 256, 256);
  // starburst rays behind
  x.fillStyle = '#fff'; x.save(); x.translate(128, 128);
  for (let i = 0; i < 12; i++) { x.rotate(Math.PI / 6); x.beginPath(); x.moveTo(0, -44); x.lineTo(8, -100); x.lineTo(-8, -100); x.closePath(); x.fill(); }
  x.restore();
  // two crossed bullets (tips up, casings crossing low)
  const bullet = () => {
    x.fillStyle = '#fff'; x.fillRect(-13, -10, 26, 72);                 // casing
    x.beginPath(); x.moveTo(-13, -10); x.lineTo(0, -38); x.lineTo(13, -10); x.closePath(); x.fill(); // tip
    x.fillStyle = '#bdbdbd'; x.fillRect(-13, 52, 26, 12);               // rim
  };
  x.save(); x.translate(122, 120); x.rotate(-0.5); bullet(); x.restore();
  x.save(); x.translate(134, 120); x.rotate(0.5); bullet(); x.restore();
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
}

function glyphTexture(def) {
  if (def.theme === 'cowboy') return doubleTapIcon(); // Double Tap uses the cowboy chassis
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 128, 128);
  x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineWidth = 9; x.lineCap = 'round';
  x.translate(64, 64);
  x.font = '900 58px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(def.glyph, 0, 4);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter;
  return t;
}

function topper(theme, mat, accent) {
  const g = new THREE.Group();
  const box = (w, h, d) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  switch (theme) {
    case 'cowboy': { // crossed revolvers
      for (const s of [-1, 1]) { const b = box(0.04, 0.34, 0.04); b.rotation.z = s * 0.7; b.position.z = 0.33; g.add(b); }
      const star = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.04, 5), accent); star.rotation.x = -Math.PI / 2; star.position.set(0, 0.16, 0.34); g.add(star);
      break;
    }
    case 'diner': for (let i = 0; i < 5; i++) { const b = box(0.13, 0.13, 0.06); b.position.set(-0.26 + i * 0.13, 0, 0.33); b.material = i % 2 ? mat : WHITE; g.add(b); } break;
    case 'disco': { const ball = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 1, roughness: 0.15 })); ball.position.set(0, 0.16, 0.22); g.add(ball); break; }
    case 'electric': { const b = box(0.05, 0.28, 0.05); b.rotation.z = 0.5; b.position.z = 0.33; g.add(b); const b2 = box(0.05, 0.22, 0.05); b2.rotation.z = -0.5; b2.position.set(0.04, -0.13, 0.33); g.add(b2); break; }
    case 'metal': { const sk = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), WHITE); sk.position.z = 0.31; g.add(sk); break; }
    case 'mexican': { const tri = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 3), mat); tri.position.z = 0.31; tri.rotation.x = Math.PI / 2; g.add(tri); break; }
    case 'jazz': { const n = box(0.06, 0.24, 0.06); n.position.set(-0.05, 0, 0.33); g.add(n); const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat); head.position.set(-0.09, -0.11, 0.33); g.add(head); break; }
    default: { const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 14, 1, false, 0, Math.PI), mat); arch.rotation.x = Math.PI / 2; arch.position.z = 0.31; g.add(arch); }
  }
  return g;
}

// the glowing revolver-cylinder / emblem on the machine face
function centerpiece(def, brass, glass) {
  const g = new THREE.Group();
  const chamberMat = new THREE.MeshBasicMaterial({ color: def.color });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.045, 12, 28), brass); g.add(ring);
  if (def.theme === 'cowboy') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.07, 14), chamberMat);
      ch.rotation.x = Math.PI / 2; ch.position.set(Math.cos(a) * 0.105, Math.sin(a) * 0.105, 0.015);
      g.add(ch);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 12), brass); hub.rotation.x = Math.PI / 2; g.add(hub);
  } else {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.155, 28), chamberMat); disc.position.z = 0.01; g.add(disc);
    const gly = new THREE.Mesh(new THREE.CircleGeometry(0.12, 24), new THREE.MeshBasicMaterial({ map: glyphTexture(def), transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    gly.position.z = 0.025; g.add(gly);
  }
  const cover = new THREE.Mesh(new THREE.CircleGeometry(0.21, 28), glass); cover.position.z = 0.06; g.add(cover);
  g.userData.chamberMat = chamberMat;
  return g;
}

let WHITE;

// dispatch: each overhauled perk has its own bespoke machine; the rest still
// fall back to the cowboy chassis until their own pass.
export function buildPerkMachine(def) {
  switch (def.theme) {
    case 'diner': return buildDinerMachine(def);   // Quick Revive — 60s diner cooler
    case 'cozy': return buildPinupMachine(def);    // Juggernog — vintage pin-up deco
    case 'smooth': return buildSalsaMachine(def);  // Speed Cola — Mexicana / salsa
    case 'jazz': return buildDiscoMachine(def);    // Stamin-Up — 70s disco funk jukebox
    case 'mexican': return buildMuleKickMachine(def); // Mule Kick — western gun-rack
    case 'disco': return buildAtomicMachine(def);  // PHD Flopper — purple atomic deco
    case 'electric': return buildElectricMachine(def); // Electric Cherry — chair cooler + neon
    case 'metal': return buildDeadshotMachine(def); // Deadshot Daiquiri — heavy metal
    case 'cowboy':
    default: return buildCowboyMachine(def);
  }
}

// The same emblem each machine shows, keyed by perk id — used by the HUD chips
// so the on-screen icon matches the machine (no more text initials).
const PERK_ICONS = {
  quickRevive: reviveIcon, juggernog: juggIcon, speedCola: speedColaIcon,
  staminUp: staminIcon, doubleTap: doubleTapIcon, muleKick: pistolIcon,
  deadshot: reticleIcon, electricCherry: cherryIcon, phdFlopper: radIcon,
};

/** A transparent data-URL of a perk's white emblem, for DOM/HUD use. */
export function perkIconDataURL(id) {
  const fn = PERK_ICONS[id];
  return fn ? fn().image.toDataURL() : null;
}

function buildCowboyMachine(def) {
  WHITE = ps1Snap(new THREE.MeshStandardMaterial({ color: 0xefe7d2, roughness: 0.7 }));
  const woodTex = woodTexture(def.theme === 'metal' ? '#4a3526' : '#6e4a28');
  const wood = ps1Snap(new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85, metalness: 0.05 }));
  const woodDark = ps1Snap(new THREE.MeshStandardMaterial({ map: woodTex, color: 0x9a7048, roughness: 0.9 }));
  const brass = ps1Snap(new THREE.MeshStandardMaterial({ color: 0xb08440, metalness: 0.85, roughness: 0.35 }));
  const iron = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x2a2622, metalness: 0.7, roughness: 0.6 }));
  const dark = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x16130f, roughness: 0.85 }));
  const glass = new THREE.MeshStandardMaterial({ color: 0x222018, transparent: true, opacity: 0.32, roughness: 0.1, metalness: 0.4 });
  const tint = ps1Snap(new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.6, metalness: 0.2 }));
  const accent = ps1Snap(new THREE.MeshStandardMaterial({ color: def.accent ?? 0xffffff, roughness: 0.5 }));

  const g = new THREE.Group();
  const W = 0.92, D = 0.7, H = def.h, F = D / 2;
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  // decal helper: a plane held just off a surface, polygon-offset to kill z-fighting
  const decal = (w, h, mat, y, z) => {
    mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2; mat.transparent = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(0, y, z); return m;
  };

  // --- crate body + plank skirt ---
  const cab = box(W, H, D, wood); cab.position.y = H / 2; cab.castShadow = true; g.add(cab);
  const skirt = box(W + 0.015, H * 0.3, D + 0.015, woodDark); skirt.position.y = H * 0.15; g.add(skirt);

  // iron banding between sections (slightly proud, no coplanar faces)
  for (const by of [H * 0.3, H * 0.62, H - 0.04]) {
    const band = box(W + 0.03, 0.05, D + 0.03, iron); band.position.y = by; g.add(band);
  }
  const base = box(W + 0.05, 0.1, D + 0.05, iron); base.position.y = 0.05; g.add(base);

  // bolts on the corners of the upper face (rivets)
  for (const sx of [-1, 1]) for (const sy of [H * 0.64, H * 0.92]) {
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 6), brass);
    bolt.rotation.x = Math.PI / 2; bolt.position.set(sx * (W / 2 - 0.07), sy, F + 0.01); g.add(bolt);
  }

  // --- ROOT BEER 10¢ stencil across the upper body ---
  g.add(decal(W - 0.16, (W - 0.16) * 0.39, new THREE.MeshBasicMaterial({ map: labelTexture(def) }), H * 0.78, F + 0.012));

  // --- revolver-cylinder centerpiece, recessed in an iron panel ---
  const panel = box(W - 0.18, H * 0.3, 0.04, iron); panel.position.set(0, H * 0.5, F - 0.005); g.add(panel);
  const cp = centerpiece(def, brass, glass); cp.position.set(-0.04, H * 0.5, F + 0.03); g.add(cp);

  // coin door + slot beside the cylinder
  const door = box(0.18, 0.16, 0.05, brass); door.position.set(0.27, H * 0.5, F + 0.01); g.add(door);
  const slot = box(0.02, 0.07, 0.02, dark); slot.position.set(0.27, H * 0.52, F + 0.04); g.add(slot);

  // side carry handle (right side)
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 8, 16, Math.PI), brass);
  handle.rotation.y = Math.PI / 2; handle.position.set(W / 2 + 0.005, H * 0.5, 0); g.add(handle);

  // brass dispense tray at the bottom
  const trayBack = box(W - 0.34, 0.16, 0.02, dark); trayBack.position.set(0, H * 0.17, F - 0.04); g.add(trayBack);
  const tray = box(W - 0.3, 0.05, 0.12, brass); tray.position.set(0, H * 0.1, F + 0.02); g.add(tray);
  const trayLip = box(W - 0.26, 0.1, 0.04, brass); trayLip.position.set(0, H * 0.16, F + 0.05); g.add(trayLip);

  // --- header sign board (angled) + glowing bottle-cap emblem ---
  const header = box(W + 0.12, 0.34, 0.12, wood); header.position.set(0, H + 0.02, F - 0.15); header.rotation.x = -0.22; g.add(header);
  // name across the header (cream western text on its own decal)
  const headName = decal(W - 0.05, 0.2, new THREE.MeshBasicMaterial({ map: nameTextureWide(def) }), H + 0.03, F - 0.08);
  headName.rotation.x = -0.22; g.add(headName);

  // bottle-cap emblem (scalloped) — this glows + pulses (signMat)
  const capMat = new THREE.MeshBasicMaterial({ color: def.color });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 22), capMat);
  cap.rotation.x = Math.PI / 2; cap.position.set(0, H + 0.26, F - 0.02); g.add(cap);
  const capRim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.022, 8, 24), accent); capRim.position.set(0, H + 0.26, F + 0.0); g.add(capRim);
  const capGlyph = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), new THREE.MeshBasicMaterial({ map: glyphTexture(def), transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  capGlyph.position.set(0, H + 0.26, F + 0.03); g.add(capGlyph);

  const top = topper(def.theme, tint, accent); top.position.set(0, H + 0.26, 0); g.add(top);

  // vertical name banner down the left side
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.18, H * 0.6), new THREE.MeshBasicMaterial({ map: nameTexture(def.name, hex(def.color)), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  banner.position.set(-(W / 2) - 0.01, H * 0.55, 0); banner.rotation.y = -Math.PI / 2; g.add(banner);

  // small colored light so the machine casts its own glow (kept subtle)
  const light = new THREE.PointLight(def.color, 0.7, 3.2, 2.0);
  light.position.set(0, H * 0.52, F + 0.35); g.add(light);

  g.userData = { height: H, signMat: capMat, chamberMat: cp.userData.chamberMat, spin: cp, light, capGlyph };
  return g;
}

// wide horizontal western name for the header board
function nameTextureWide(def) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 512, 128);
  x.fillStyle = hex(def.color);
  x.font = '900 58px Georgia, "Times New Roman", serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 6;
  x.strokeText(def.name, 256, 66); x.fillText(def.name, 256, 66);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter;
  return t;
}

// ---------------------------------------------------------------------------
// Quick Revive — 1960s diner chest cooler (teal + chrome, cyan illuminated sign)
// ---------------------------------------------------------------------------

function scriptTexture(text, colorHex, w = 512, h = 160) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.clearRect(0, 0, w, h);
  x.fillStyle = colorHex; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = 'rgba(0,0,0,0.55)'; x.shadowBlur = 8;
  x.font = `italic bold ${Math.floor(h * 0.58)}px "Brush Script MT","Segoe Script","Lucida Handwriting",cursive`;
  x.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
}

// white "rising figure" revive emblem on a clear field (sits over a glowing disc)
function reviveIcon() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d'); x.clearRect(0, 0, 256, 256);
  x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineWidth = 12; x.lineJoin = 'round';
  // shield outline
  x.beginPath();
  x.moveTo(128, 46); x.lineTo(204, 86); x.lineTo(204, 150); x.lineTo(128, 212); x.lineTo(52, 150); x.lineTo(52, 86); x.closePath();
  x.stroke();
  // downed figure lying across the bottom (head left)
  x.lineCap = 'round';
  x.beginPath(); x.arc(80, 170, 14, 0, 7); x.fill();                    // head
  x.lineWidth = 15; x.beginPath(); x.moveTo(92, 174); x.lineTo(150, 180); x.stroke(); // body
  x.lineWidth = 11; x.beginPath(); x.moveTo(150, 180); x.lineTo(178, 170); x.stroke(); // legs
  // helper kneeling over them, one arm reaching down
  x.beginPath(); x.arc(150, 94, 15, 0, 7); x.fill();                    // head
  x.lineWidth = 13;
  x.beginPath(); x.moveTo(150, 108); x.lineTo(147, 150); x.stroke();    // torso
  x.beginPath(); x.moveTo(147, 150); x.lineTo(172, 168); x.stroke();    // kneeling leg
  x.beginPath(); x.moveTo(150, 120); x.lineTo(118, 152); x.stroke();    // arm reaching to the body
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
}

// "ICE COLD" / "SOLD HERE 40" + bubble rings, blue-on-clear decal for the cooler face
function coolerDecal(colorHex) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 320;
  const x = c.getContext('2d'); x.clearRect(0, 0, 512, 320);
  x.strokeStyle = colorHex; x.fillStyle = colorHex; x.lineWidth = 4;
  x.font = 'italic bold 34px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('ICE COLD', 80, 150);
  x.fillText('SOLD HERE', 430, 150);
  x.font = 'bold 30px Arial'; x.fillText('40', 430, 195);
  for (let i = 0; i < 9; i++) {
    x.beginPath();
    x.arc(40 + Math.random() * 90, 40 + Math.random() * 260, 6 + Math.random() * 16, 0, 7); x.stroke();
    x.beginPath();
    x.arc(380 + Math.random() * 110, 40 + Math.random() * 260, 6 + Math.random() * 16, 0, 7); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
}

function buildDinerMachine(def) {
  const teal = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x35718f, roughness: 0.5, metalness: 0.35 }));
  const chrome = ps1Snap(new THREE.MeshStandardMaterial({ color: 0xccd6dc, metalness: 0.9, roughness: 0.22 }));
  const white = ps1Snap(new THREE.MeshStandardMaterial({ color: 0xeef3f4, roughness: 0.55 }));
  const dark = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x111a1f, roughness: 0.8 }));
  const glow = new THREE.MeshBasicMaterial({ color: def.color });

  const g = new THREE.Group();
  const H = def.h, W = 1.06, D = 0.8;
  const bodyH = H * 0.58, bodyY = 0.1 + bodyH / 2;
  const F = D / 2;
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const decalMat = (mat) => { mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2; mat.transparent = true; return mat; };

  // chest body + chrome lid trim + base, on little feet
  const cab = box(W, bodyH, D, teal); cab.position.y = bodyY; cab.castShadow = true; g.add(cab);
  const lid = box(W + 0.04, 0.1, D + 0.04, chrome); lid.position.y = bodyY + bodyH / 2; g.add(lid);
  const midband = box(W + 0.02, 0.05, D + 0.02, chrome); midband.position.y = bodyY + bodyH * 0.12; g.add(midband);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8), chrome);
    foot.position.set(sx * (W / 2 - 0.1), 0.05, sz * (D / 2 - 0.1)); g.add(foot);
  }

  // recessed white dispenser panel + chrome coin mech + dark slot
  const panel = box(0.32, bodyH * 0.72, 0.04, white); panel.position.set(0, bodyY, F + 0.005); g.add(panel);
  const mech = box(0.14, 0.16, 0.06, chrome); mech.position.set(0, bodyY + bodyH * 0.2, F + 0.03); g.add(mech);
  const slot = box(0.18, 0.07, 0.07, dark); slot.position.set(0, bodyY - bodyH * 0.24, F + 0.03); g.add(slot);

  // ICE COLD / SOLD HERE + bubbles decal across the teal face
  const dec = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.06, bodyH * 0.82), decalMat(new THREE.MeshBasicMaterial({ map: coolerDecal(hex(def.color)) })));
  dec.position.set(0, bodyY, F + 0.012); g.add(dec);

  // cursive "Quick Revive" script along the chrome lid front
  const script = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.1, 0.16), decalMat(new THREE.MeshBasicMaterial({ map: scriptTexture(def.name, hex(def.color)) })));
  script.position.set(0, bodyY + bodyH * 0.42, F + 0.015); g.add(script);

  // chrome post + round illuminated sign on top
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, H * 0.28, 10), chrome);
  post.position.set(0, bodyY + bodyH / 2 + H * 0.14, -0.02); g.add(post);
  const signY = bodyY + bodyH / 2 + H * 0.3;
  const signGroup = new THREE.Group(); signGroup.position.set(0, signY, 0); g.add(signGroup);
  const signMat = glow;
  const signDisc = new THREE.Mesh(new THREE.CircleGeometry(0.21, 28), signMat); signDisc.position.z = 0.04; signGroup.add(signDisc);
  const signBack = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 24), dark); signBack.rotation.x = Math.PI / 2; signGroup.add(signBack);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.022, 8, 26), chrome); ring.position.z = 0.04; signGroup.add(ring);
  const icon = new THREE.Mesh(new THREE.CircleGeometry(0.17, 26), decalMat(new THREE.MeshBasicMaterial({ map: reviveIcon() })));
  icon.position.z = 0.06; signGroup.add(icon);

  const light = new THREE.PointLight(def.color, 0.7, 3.2, 2.0);
  light.position.set(0, signY, F + 0.2); g.add(light);

  g.userData = {
    height: H, signMat, light,
    anim: (now) => { signGroup.rotation.z = Math.sin(now * 1.4) * 0.05; }, // gentle sway
  };
  return g;
}

// ---------------------------------------------------------------------------
// Juggernog — vintage pin-up art-deco machine (deep red + cream, red cross sign)
// ---------------------------------------------------------------------------

function juggIcon() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d'); x.clearRect(0, 0, 256, 256);
  // white cross
  x.fillStyle = '#fff';
  x.fillRect(108, 56, 40, 144);
  x.fillRect(56, 108, 144, 40);
  // brass bullet across the diagonal
  x.save(); x.translate(128, 128); x.rotate(-0.7);
  x.fillStyle = '#d8b36a'; x.fillRect(-14, -70, 28, 120);
  x.beginPath(); x.moveTo(-14, -70); x.lineTo(0, -96); x.lineTo(14, -70); x.fill();
  x.restore();
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
}

function juggLabel() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 320;
  const x = c.getContext('2d'); x.clearRect(0, 0, 512, 320);
  x.fillStyle = '#7c2018'; x.textAlign = 'left'; x.textBaseline = 'middle';
  x.font = 'italic 28px Georgia, serif'; x.fillText('Drink', 40, 48);
  x.font = '900 88px Georgia, "Times New Roman", serif';
  x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 4; x.shadowOffsetY = 3;
  x.fillText('Jugger-', 36, 130);
  x.fillText('Nog', 120, 220);
  x.shadowBlur = 0;
  // 10¢ token
  x.beginPath(); x.arc(64, 224, 40, 0, 7); x.fillStyle = '#7c2018'; x.fill();
  x.fillStyle = '#e7dcc2'; x.font = '900 34px Georgia'; x.textAlign = 'center'; x.fillText('10¢', 64, 226);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
}

// tasteful 40s pin-up silhouette (seated, cream-on-clear) for the cabinet
function pinupDecal() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 384;
  const x = c.getContext('2d'); x.clearRect(0, 0, 256, 384);
  x.fillStyle = 'rgba(231,220,194,0.9)';
  x.strokeStyle = 'rgba(120,32,24,0.55)'; x.lineWidth = 4;
  x.beginPath();
  // flowing seated silhouette: hair, back, hip, legs
  x.moveTo(150, 40);
  x.bezierCurveTo(186, 50, 188, 96, 162, 110);   // head/hair
  x.bezierCurveTo(196, 120, 206, 168, 168, 196);  // back to bust
  x.bezierCurveTo(212, 214, 220, 252, 176, 268);  // waist to hip
  x.bezierCurveTo(232, 300, 214, 348, 150, 344);  // thigh
  x.bezierCurveTo(120, 342, 110, 320, 128, 300);  // knee
  x.bezierCurveTo(86, 300, 70, 268, 104, 250);     // calf line back up
  x.bezierCurveTo(70, 226, 78, 168, 118, 150);     // lower back
  x.bezierCurveTo(92, 120, 104, 64, 150, 40);      // up to shoulder
  x.closePath(); x.fill(); x.stroke();
  // raised arm
  x.lineCap = 'round'; x.lineWidth = 16; x.strokeStyle = 'rgba(231,220,194,0.9)';
  x.beginPath(); x.moveTo(150, 150); x.bezierCurveTo(196, 130, 206, 92, 196, 60); x.stroke();
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
}

function buildPinupMachine(def) {
  const red = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x97271f, roughness: 0.5, metalness: 0.25 }));
  const cream = ps1Snap(new THREE.MeshStandardMaterial({ color: 0xe7dcc2, roughness: 0.6 }));
  const chrome = ps1Snap(new THREE.MeshStandardMaterial({ color: 0xc9c2b2, metalness: 0.85, roughness: 0.3 }));
  const dark = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x161210, roughness: 0.8 }));
  const glow = new THREE.MeshBasicMaterial({ color: def.color });
  const priceMat = new THREE.MeshBasicMaterial({ color: def.color });

  const g = new THREE.Group();
  const H = def.h, W = 0.82, D = 0.72, F = D / 2;
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const decalMat = (mat) => { mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2; mat.transparent = true; return mat; };

  // lower red cabinet + cream upper panel, with a rounded deco crown
  const lowH = H * 0.66;
  const lower = box(W, lowH, D, red); lower.position.y = lowH / 2; lower.castShadow = true; g.add(lower);
  const upper = box(W - 0.02, H * 0.28, D - 0.02, cream); upper.position.y = lowH + H * 0.14; g.add(upper);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(W / 2, W / 2, D - 0.02, 16, 1, false, 0, Math.PI), red);
  crown.rotation.z = Math.PI / 2; crown.rotation.y = Math.PI / 2; crown.position.y = lowH + H * 0.28; g.add(crown);
  const base = box(W + 0.04, 0.1, D + 0.04, dark); base.position.y = 0.05; g.add(base);

  // chrome deco side fins (speed lines)
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const fin = box(0.03, lowH * 0.5, 0.04, chrome);
    fin.position.set(sx * (W / 2 + 0.005), lowH * 0.45, -D / 2 + 0.12 + i * 0.12); g.add(fin);
  }

  // "Drink Jugger-Nog 10¢" label on the cream panel
  const label = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.08, H * 0.24), decalMat(new THREE.MeshBasicMaterial({ map: juggLabel() })));
  label.position.set(0, lowH + H * 0.14, F + 0.005); g.add(label);

  // pin-up silhouette on the lower red cabinet
  const pin = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.63), decalMat(new THREE.MeshBasicMaterial({ map: pinupDecal() })));
  pin.position.set(0.0, lowH * 0.42, F + 0.012); g.add(pin);

  // chrome-framed illuminated price window ("40") + coin mech
  const winFrame = box(0.38, 0.26, 0.06, chrome); winFrame.position.set(0, lowH * 0.82, F + 0.01); g.add(winFrame);
  const winGlow = box(0.3, 0.18, 0.02, priceMat); winGlow.position.set(0, lowH * 0.82, F + 0.045); g.add(winGlow);
  const price = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.15), decalMat(new THREE.MeshBasicMaterial({ map: (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
    x.clearRect(0, 0, 256, 128); x.fillStyle = '#1a0f0c'; x.font = '900 96px Georgia'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('40', 128, 70);
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
  })() }))); price.position.set(0, lowH * 0.82, F + 0.06); g.add(price);

  // dispense recess + handle near the bottom
  const handle = box(0.04, 0.16, 0.04, chrome); handle.position.set(0, lowH * 0.46, F + 0.02); g.add(handle);
  const tray = box(0.34, 0.12, 0.06, dark); tray.position.set(0, lowH * 0.2, F + 0.02); g.add(tray);

  // round red-cross sign on a chrome neck up top (clears the deco crown)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.3, 10), chrome);
  neck.position.set(0, lowH + H * 0.48, 0.0); g.add(neck);
  const signY = lowH + H * 0.59;
  const signGroup = new THREE.Group(); signGroup.position.set(0, signY, 0.0); g.add(signGroup);
  const signMat = glow;
  const signDisc = new THREE.Mesh(new THREE.CircleGeometry(0.2, 26), signMat); signDisc.position.z = 0.04; signGroup.add(signDisc);
  const signBack = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 22), dark); signBack.rotation.x = Math.PI / 2; signGroup.add(signBack);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.02, 8, 24), chrome); ring.position.z = 0.04; signGroup.add(ring);
  const icon = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), decalMat(new THREE.MeshBasicMaterial({ map: juggIcon() })));
  icon.position.z = 0.06; signGroup.add(icon);

  const light = new THREE.PointLight(def.color, 0.7, 3.2, 2.0);
  light.position.set(0, signY, F + 0.2); g.add(light);

  g.userData = {
    height: H, signMat, chamberMat: priceMat, light,
    anim: (now) => { signGroup.rotation.z = Math.sin(now * 1.1) * 0.04; }, // subtle sway; price glow handled via chamberMat
  };
  return g;
}

// ---------------------------------------------------------------------------
// Speed Cola — Mexicana / salsa-dancer fiesta vending machine (green + fiesta)
// ---------------------------------------------------------------------------

function speedColaScript(colorHex) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 200;
  const x = c.getContext('2d'); x.clearRect(0, 0, 512, 200);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#c0392b'; x.font = 'italic 30px Georgia, serif'; x.fillText('Drink', 150, 36);
  x.font = `italic 900 78px "Brush Script MT","Segoe Script",cursive`;
  x.strokeStyle = '#5a1410'; x.lineWidth = 5;
  x.strokeText('Speed Cola', 256, 110); x.fillStyle = '#e0463a'; x.fillText('Speed Cola', 256, 110);
  x.fillStyle = '#3aa34a'; x.font = '900 30px Arial'; x.fillText('ICE COLD', 256, 178);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
}

function speedColaIcon() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d'); x.clearRect(0, 0, 256, 256);
  x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineWidth = 12; x.lineJoin = 'round'; x.lineCap = 'round';
  // shield
  x.beginPath(); x.moveTo(128, 48); x.lineTo(200, 84); x.lineTo(200, 150); x.lineTo(128, 210); x.lineTo(56, 150); x.lineTo(56, 84); x.closePath(); x.stroke();
  // open hand (Speed Cola = fast hands / quick reload)
  x.fillStyle = '#fff';
  for (let i = 0; i < 4; i++) { const fx = 106 + i * 13; const trim = (i === 0 || i === 3) ? 8 : 0; x.fillRect(fx, 90 + trim, 10, 54 - trim); } // four fingers
  x.beginPath(); x.moveTo(104, 134); x.lineTo(160, 134); x.lineTo(160, 166); x.quadraticCurveTo(132, 190, 104, 166); x.closePath(); x.fill(); // palm
  x.save(); x.translate(106, 150); x.rotate(-0.9); x.fillRect(-30, -7, 34, 14); x.restore(); // thumb
  // speed lines streaking off the wrist
  x.lineWidth = 7; for (const yy of [120, 140]) { x.beginPath(); x.moveTo(58, yy); x.lineTo(88, yy); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
}

// papel-picado bunting flag (cut-paper) in a given color
function papelTexture(colorHex) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 80;
  const x = c.getContext('2d'); x.clearRect(0, 0, 64, 80);
  x.fillStyle = colorHex; x.beginPath(); x.moveTo(2, 0); x.lineTo(62, 0); x.lineTo(62, 56); x.lineTo(32, 78); x.lineTo(2, 56); x.closePath(); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.85)'; // cut-outs
  x.beginPath(); x.arc(32, 26, 9, 0, 7); x.fill();
  for (const [px, py] of [[18, 44], [46, 44], [32, 52]]) { x.beginPath(); x.arc(px, py, 4, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
}

// serape stripe band (Mexican blanket)
function serapeTexture() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 256;
  const x = c.getContext('2d');
  const cols = ['#c0392b', '#e08a2a', '#f1c40f', '#2ecc40', '#2a6ed0', '#eeeeee'];
  for (let i = 0; i < 32; i++) { x.fillStyle = cols[i % cols.length]; x.fillRect(0, i * 8, 16, 8); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; return t;
}

// salsa-dancer silhouette (flared dress, raised arm) on a clear field
function salsaDancer() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 384;
  const x = c.getContext('2d'); x.clearRect(0, 0, 256, 384);
  x.fillStyle = 'rgba(192,57,43,0.92)'; x.strokeStyle = 'rgba(40,10,8,0.5)'; x.lineWidth = 4;
  x.beginPath();
  x.moveTo(120, 36);
  x.bezierCurveTo(150, 38, 150, 78, 126, 86);   // head
  x.bezierCurveTo(150, 96, 156, 140, 132, 168);  // torso/back
  x.bezierCurveTo(120, 180, 116, 196, 120, 210);  // waist
  x.bezierCurveTo(180, 230, 224, 330, 196, 360);  // flared skirt right
  x.bezierCurveTo(150, 340, 96, 340, 56, 360);     // skirt hem
  x.bezierCurveTo(36, 330, 78, 232, 110, 210);     // flared skirt left
  x.bezierCurveTo(104, 196, 104, 176, 112, 168);   // back to waist
  x.bezierCurveTo(92, 142, 96, 100, 116, 86);      // torso left
  x.bezierCurveTo(92, 78, 92, 40, 120, 36);
  x.closePath(); x.fill(); x.stroke();
  // raised arm
  x.lineCap = 'round'; x.lineWidth = 14; x.strokeStyle = 'rgba(192,57,43,0.92)';
  x.beginPath(); x.moveTo(132, 120); x.bezierCurveTo(176, 104, 196, 66, 188, 36); x.stroke();
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
}

function buildSalsaMachine(def) {
  const green = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x2f9e3a, roughness: 0.5, metalness: 0.2 }));
  const cream = ps1Snap(new THREE.MeshStandardMaterial({ color: 0xede7cf, roughness: 0.6 }));
  const chrome = ps1Snap(new THREE.MeshStandardMaterial({ color: 0xc9cdc6, metalness: 0.85, roughness: 0.3 }));
  const dark = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x10160f, roughness: 0.8 }));
  const glow = new THREE.MeshBasicMaterial({ color: def.color });

  const g = new THREE.Group();
  const H = def.h, W = 0.96, D = 0.72, F = D / 2;
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const decalMat = (mat) => { mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2; mat.transparent = true; return mat; };

  const cab = box(W, H, D, green); cab.position.y = H / 2; cab.castShadow = true; g.add(cab);
  const base = box(W + 0.04, 0.12, D + 0.04, dark); base.position.y = 0.06; g.add(base);

  // cream marquee with Speed Cola script + ICE COLD
  const marquee = box(W - 0.05, H * 0.2, 0.04, cream); marquee.position.set(0, H * 0.85, F + 0.005); g.add(marquee);
  const script = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.1, H * 0.17), decalMat(new THREE.MeshBasicMaterial({ map: speedColaScript() })));
  script.position.set(0, H * 0.85, F + 0.03); g.add(script);

  // serape stripe band across the lower body
  const serMat = ps1Snap(new THREE.MeshStandardMaterial({ map: serapeTexture(), roughness: 0.6 }));
  const serBand = box(W + 0.015, 0.14, D + 0.015, serMat); serBand.position.y = H * 0.16; g.add(serBand);

  // salsa-dancer silhouette on the left face
  const salsa = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.6), decalMat(new THREE.MeshBasicMaterial({ map: salsaDancer() })));
  salsa.position.set(-0.22, H * 0.45, F + 0.012); g.add(salsa);

  // glowing bottle column (chrome frame + 6 slots that chase)
  const frame = box(0.26, H * 0.5, 0.06, chrome); frame.position.set(0.28, H * 0.5, F + 0.005); g.add(frame);
  const slotMats = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.MeshBasicMaterial({ color: def.color });
    const slot = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), m);
    slot.position.set(0.28, H * 0.32 + i * 0.075, F + 0.04); g.add(slot); slotMats.push(m);
  }

  // bottom glowing vents
  const ventMats = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.MeshBasicMaterial({ color: def.color });
    const v = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.012), decalMat(m));
    v.position.set(0, H * 0.06 + i * 0.03, F + 0.012); g.add(v); ventMats.push(m);
  }

  // coin mech + dispense tray
  const mech = box(0.12, 0.14, 0.05, chrome); mech.position.set(-0.22, H * 0.66, F + 0.02); g.add(mech);
  const tray = box(0.32, 0.12, 0.06, dark); tray.position.set(-0.18, H * 0.24, F + 0.02); g.add(tray);

  // papel-picado bunting strung across the very top
  const bunting = new THREE.Group();
  const cols = ['#e8412f', '#2ad04a', '#f3c20f', '#ff7ad0', '#2a8ed0'];
  for (let i = 0; i < 7; i++) {
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.16), decalMat(new THREE.MeshBasicMaterial({ map: papelTexture(cols[i % cols.length]) })));
    flag.position.set(-0.42 + i * 0.14, H + 0.06 - Math.abs(i - 3) * 0.012, F - 0.02);
    bunting.add(flag);
  }
  g.add(bunting);

  // round sign on a chrome post
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, H * 0.18, 10), chrome);
  post.position.set(0.0, H + 0.06, -0.02); g.add(post);
  const signY = H + 0.2;
  const signGroup = new THREE.Group(); signGroup.position.set(0, signY, 0); g.add(signGroup);
  const signMat = glow;
  const signDisc = new THREE.Mesh(new THREE.CircleGeometry(0.2, 26), signMat); signDisc.position.z = 0.04; signGroup.add(signDisc);
  const signBack = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 22), dark); signBack.rotation.x = Math.PI / 2; signGroup.add(signBack);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.02, 8, 24), chrome); ring.position.z = 0.04; signGroup.add(ring);
  const icon = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), decalMat(new THREE.MeshBasicMaterial({ map: speedColaIcon() })));
  icon.position.z = 0.06; signGroup.add(icon);

  const light = new THREE.PointLight(def.color, 0.7, 3.2, 2.0);
  light.position.set(0, H * 0.6, F + 0.3); g.add(light);

  g.userData = {
    height: H, signMat, light,
    anim: (now) => {
      const head = (now * 3) % 6;
      for (let i = 0; i < slotMats.length; i++) {
        const d = Math.abs(i - head); const lit = Math.max(0, 1 - d * 0.6);
        slotMats[i].color.setHex(def.color).multiplyScalar(0.4 + lit * 1.1);
      }
      for (let i = 0; i < ventMats.length; i++) ventMats[i].color.setHex(def.color).multiplyScalar(0.6 + Math.sin(now * 4 + i) * 0.35);
      bunting.children.forEach((f, i) => { f.position.z = (D / 2 - 0.02) + Math.sin(now * 2 + i) * 0.02; f.rotation.y = Math.sin(now * 2 + i) * 0.2; });
    },
  };
  return g;
}

function discoStripes() {
  const c = document.createElement('canvas'); c.width = 48; c.height = 8;
  const x = c.getContext('2d');
  const cols = ['#c0392b', '#e0742a', '#f3c20f', '#e0742a', '#c0392b', '#7a1c16'];
  for (let i = 0; i < cols.length; i++) { x.fillStyle = cols[i]; x.fillRect(i * 8, 0, 8, 8); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; return t;
}

// funky star + afro-silhouette emblem (Cold War Stamin-Up side mark)
function funkEmblem() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d'); x.clearRect(0, 0, 128, 128);
  // star burst
  x.fillStyle = '#f3c20f'; x.translate(64, 58);
  x.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 26 : 52; const a = (i / 10) * Math.PI * 2 - Math.PI / 2; x[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
  x.closePath(); x.fill();
  // afro head silhouette
  x.fillStyle = '#3a1f12';
  x.beginPath(); x.arc(0, -2, 22, 0, 7); x.fill(); // afro
  x.fillStyle = '#7a4a2a'; x.beginPath(); x.arc(0, 6, 13, 0, 7); x.fill(); // face
  // star shades
  x.fillStyle = '#c0392b'; x.fillRect(-16, 2, 12, 7); x.fillRect(4, 2, 12, 7);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
}

// ---------------------------------------------------------------------------
// Stamin-Up — 1970s disco/funk jukebox (brass + glowing tubes + diamond lights)
// ---------------------------------------------------------------------------

function staminIcon() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d'); x.clearRect(0, 0, 256, 256);
  x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineJoin = 'round'; x.lineCap = 'round';
  // shield
  x.lineWidth = 12; x.beginPath(); x.moveTo(128, 50); x.lineTo(198, 84); x.lineTo(198, 148); x.lineTo(128, 206); x.lineTo(58, 148); x.lineTo(58, 84); x.closePath(); x.stroke();
  // swoosh / motion track curving under the runner's feet
  x.lineWidth = 11; x.beginPath(); x.ellipse(126, 168, 60, 20, -0.16, Math.PI * 0.02, Math.PI * 1.2); x.stroke();
  // running figure
  x.beginPath(); x.arc(132, 92, 15, 0, 7); x.fill();
  x.lineWidth = 13;
  x.beginPath(); x.moveTo(120, 112); x.lineTo(142, 136); x.lineTo(124, 162); x.stroke(); // torso+front leg
  x.beginPath(); x.moveTo(142, 136); x.lineTo(168, 154); x.stroke(); // back leg
  x.beginPath(); x.moveTo(128, 118); x.lineTo(102, 130); x.stroke(); // front arm
  x.beginPath(); x.moveTo(134, 122); x.lineTo(160, 112); x.stroke(); // back arm
  // motion lines
  x.lineWidth = 6; for (const yy of [108, 126]) { x.beginPath(); x.moveTo(62, yy); x.lineTo(90, yy); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
}

function staminMarquee() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d'); x.clearRect(0, 0, 512, 128);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '900 italic 76px "Arial Black", Impact, sans-serif';
  x.lineWidth = 10; x.strokeStyle = '#c0392b'; x.strokeText('STAMIN-UP', 256, 70);
  x.fillStyle = '#f3c20f'; x.fillText('STAMIN-UP', 256, 70);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
}

function sunburstTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d'); x.clearRect(0, 0, 256, 256);
  x.translate(128, 128);
  for (let i = 0; i < 16; i++) {
    x.fillStyle = i % 2 ? '#f3c20f' : '#e0742a';
    x.beginPath(); x.moveTo(0, 0);
    x.arc(0, 0, 140, (i / 16) * 6.283, ((i + 1) / 16) * 6.283); x.closePath(); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
}

function buildDiscoMachine(def) {
  const gold = ps1Snap(new THREE.MeshStandardMaterial({ color: 0xb88a36, metalness: 0.7, roughness: 0.35 }));
  const chrome = ps1Snap(new THREE.MeshStandardMaterial({ color: 0xd0c7a8, metalness: 0.9, roughness: 0.25 }));
  const darkred = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x5e1714, roughness: 0.6 }));
  const dark = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x161009, roughness: 0.8 }));
  const glow = new THREE.MeshBasicMaterial({ color: def.color });

  const g = new THREE.Group();
  const H = def.h, W = 0.9, D = 0.74, F = D / 2;
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const decalMat = (mat) => { mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2; mat.transparent = true; return mat; };

  // tiered gold cabinet + plinth base
  const lower = box(W, H * 0.5, D, gold); lower.position.y = H * 0.25; lower.castShadow = true; g.add(lower);
  const upper = box(W - 0.06, H * 0.42, D - 0.06, gold); upper.position.y = H * 0.71; g.add(upper);
  const plinth = box(W + 0.12, 0.16, D + 0.12, chrome); plinth.position.y = 0.08; g.add(plinth);
  // art-deco crown: rounded shoulder, chrome base band, framed dome + fan ribs
  const crownR = (W - 0.06) / 2;
  const crownY = H * 0.92;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(crownR, crownR, D - 0.06, 20, 1, false, 0, Math.PI), gold);
  crown.rotation.z = Math.PI / 2; crown.rotation.y = Math.PI / 2; crown.position.y = crownY; g.add(crown);
  const crownBand = box(W - 0.01, 0.06, D - 0.01, chrome); crownBand.position.y = crownY; g.add(crownBand);
  // chrome trim outlining the dome on the front + back faces
  for (const fz of [F - 0.04, -(F - 0.04)]) {
    const edge = new THREE.Mesh(new THREE.TorusGeometry(crownR - 0.005, 0.022, 8, 26, Math.PI), chrome);
    edge.position.set(0, crownY, fz); g.add(edge);
  }
  // chrome fan ribs spreading over the crown dome
  for (let i = 1; i < 6; i++) {
    const a = (i / 6) * Math.PI;
    const rib = box(0.016, crownR - 0.05, 0.016, chrome);
    rib.position.set(Math.cos(a) * (crownR * 0.5), crownY + Math.sin(a) * (crownR * 0.5), F - 0.05);
    rib.rotation.z = a - Math.PI / 2; g.add(rib);
  }
  // vertical chrome corner posts down the cabinet + chrome seam band at the tier joint
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = box(0.045, H * 0.88, 0.045, chrome);
    post.position.set(sx * (W / 2 - 0.02), H * 0.46, sz * (D / 2 - 0.02)); g.add(post);
  }
  const seam = box(W + 0.02, 0.05, D + 0.02, chrome); seam.position.y = H * 0.5; g.add(seam);

  // vertical brass speed-lines on the base front
  for (let i = 0; i < 5; i++) { const s = box(0.03, H * 0.16, 0.02, chrome); s.position.set(-0.3 + i * 0.15, H * 0.12, F + 0.005); g.add(s); }

  // big round marquee sign: rotating sunburst with the perk emblem dead-centre.
  // Sized to sit cleanly BETWEEN the nameplate and the dome band — the old wider
  // disc overlapped both, which read as bars cutting across the sign.
  const signY = H * 0.775;
  const sun = new THREE.Mesh(new THREE.CircleGeometry(0.24, 32), new THREE.MeshBasicMaterial({ map: sunburstTexture() }));
  sun.position.set(0, signY, F + 0.02); g.add(sun);
  // a second, counter-rotating sunburst layer for extra funk
  const sun2 = new THREE.Mesh(new THREE.CircleGeometry(0.205, 32), new THREE.MeshBasicMaterial({ map: sunburstTexture(), transparent: true, opacity: 0.7 }));
  sun2.position.set(0, signY, F + 0.025); g.add(sun2);
  // clean chrome ring framing the whole swirl
  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.018, 8, 30), chrome); outerRing.position.set(0, signY, F + 0.03); g.add(outerRing);

  // emblem cluster, brought to the FRONT so the icon actually shows (it used to
  // sit at z=0, buried inside the cabinet — invisible, pulse and all)
  const signGroup = new THREE.Group(); signGroup.position.set(0, signY, F + 0.03); g.add(signGroup);
  const signMat = glow;
  const signDisc = new THREE.Mesh(new THREE.CircleGeometry(0.13, 28), signMat); signDisc.position.z = 0.01; signGroup.add(signDisc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.02, 8, 28), chrome); ring.position.z = 0.02; signGroup.add(ring);
  const icon = new THREE.Mesh(new THREE.CircleGeometry(0.115, 28), decalMat(new THREE.MeshBasicMaterial({ map: staminIcon() })));
  icon.position.z = 0.03; signGroup.add(icon);

  // twinkling sequins around the rim — disco sparkle
  const sequins = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
    const sq = new THREE.Mesh(new THREE.CircleGeometry(0.013, 6), m);
    sq.position.set(Math.cos(a) * 0.265, signY + Math.sin(a) * 0.265, F + 0.028); g.add(sq); sequins.push(m);
  }

  // STAMIN-UP nameplate (dark-red marquee + glowing text)
  const plate = box(0.66, 0.16, 0.05, darkred); plate.position.set(0, H * 0.6, F + 0.01); g.add(plate);
  const plateTxt = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.15), decalMat(new THREE.MeshBasicMaterial({ map: staminMarquee() })));
  plateTxt.position.set(0, H * 0.6, F + 0.04); g.add(plateTxt);

  // row of glowing tubes behind a chrome frame
  const tubeFrame = box(0.6, 0.14, 0.05, chrome); tubeFrame.position.set(0, H * 0.5, F + 0.01); g.add(tubeFrame);
  const tubeMats = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 8), m);
    tube.position.set(-0.24 + i * 0.08, H * 0.5, F + 0.035); g.add(tube); tubeMats.push(m);
  }
  // chrome knobs row
  for (let i = 0; i < 5; i++) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 12), chrome); k.rotation.x = Math.PI / 2; k.position.set(-0.2 + i * 0.1, H * 0.42, F + 0.04); g.add(k); }

  // animated diamond light panels (dispenser + base) — disco floor
  const diaMats = [];
  const makeDiamonds = (cy, cols) => {
    for (let r = 0; r < 2; r++) for (let cc = 0; cc < cols; cc++) {
      const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const dmd = new THREE.Mesh(new THREE.CircleGeometry(0.035, 4), m);
      dmd.rotation.z = Math.PI / 4;
      dmd.position.set(-(cols - 1) * 0.045 + cc * 0.09, cy + r * 0.08, F + 0.02);
      g.add(dmd); diaMats.push(m);
    }
  };
  makeDiamonds(H * 0.3, 5);   // dispenser strip
  makeDiamonds(H * 0.1, 6);   // base strip

  // dispense tray
  const tray = box(0.42, 0.12, 0.06, dark); tray.position.set(0, H * 0.22, F + 0.02); g.add(tray);

  // --- extra furnishings: make it loud ---
  // chrome arch wings sweeping around the marquee (concentric ribs)
  for (let i = 0; i < 3; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.3 + i * 0.05, 0.018, 8, 24, Math.PI * 1.1), chrome);
    rib.position.set(0, signY - 0.02, F - 0.03 - i * 0.02); rib.rotation.z = -Math.PI * 0.05; g.add(rib);
  }
  // glowing halo disc behind the sunburst (pulses)
  const haloMat = new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.5 });
  const halo = new THREE.Mesh(new THREE.CircleGeometry(0.3, 30), haloMat); halo.position.set(0, signY, F - 0.01); g.add(halo);
  // chrome crest finial on the dome top
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), chrome); finial.position.set(0, crownY + crownR + 0.06, 0); g.add(finial);

  // vertical funk stripe panels flanking the front + base skirt
  const stripeMat = ps1Snap(new THREE.MeshStandardMaterial({ map: discoStripes(), roughness: 0.5, metalness: 0.3 }));
  for (const sx of [-1, 1]) { const sp = box(0.1, H * 0.4, 0.02, stripeMat); sp.position.set(sx * (W / 2 - 0.08), H * 0.5, F + 0.005); g.add(sp); }
  const skirt = box(W + 0.13, 0.12, D + 0.13, stripeMat); skirt.position.y = 0.2; g.add(skirt);

  // funky side emblems
  for (const sx of [-1, 1]) {
    const em = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), decalMat(new THREE.MeshBasicMaterial({ map: funkEmblem() })));
    em.position.set(sx * (W / 2 + 0.005), H * 0.78, 0); em.rotation.y = sx * Math.PI / 2; g.add(em);
  }

  // color-cycling neon edge piping (vertical corners + nameplate underline)
  const neonMats = [];
  const neon = (w, h, px, py) => { const m = new THREE.MeshBasicMaterial({ color: 0xffffff }); const e = box(w, h, 0.02, m); e.position.set(px, py, F + 0.012); g.add(e); neonMats.push(m); };
  for (const sx of [-1, 1]) neon(0.02, H * 0.42, sx * (W / 2 - 0.015), H * 0.5);
  neon(0.6, 0.015, 0, H * 0.52);
  neon(0.5, 0.015, 0, H * 0.38);

  const light = new THREE.PointLight(def.color, 0.75, 3.4, 2.0);
  light.position.set(0, signY, F + 0.3); g.add(light);

  g.userData = {
    height: H, signMat, light,
    anim: (now) => {
      sun.rotation.z = now * 0.5; // rotating sunburst behind the sign
      sun2.rotation.z = -now * 0.72; // counter-rotating layer
      sun2.material.color.setHSL((now * 0.1) % 1, 0.55, 0.6); // funk hue drift
      for (let i = 0; i < sequins.length; i++) sequins[i].opacity = Math.sin(now * 6 + i * 1.7) > 0.3 ? 0.95 : 0.18; // twinkle
      halo.scale.setScalar(1 + Math.sin(now * 4) * 0.06); haloMat.opacity = 0.4 + Math.sin(now * 4) * 0.18;
      for (let i = 0; i < tubeMats.length; i++) tubeMats[i].color.setHSL(((now * 0.3 + i * 0.13) % 1), 0.9, 0.6);
      for (let i = 0; i < diaMats.length; i++) diaMats[i].color.setHSL(((now * 0.4 + i * 0.08) % 1), 0.95, 0.55);
      for (let i = 0; i < neonMats.length; i++) neonMats[i].color.setHSL(((now * 0.5 + i * 0.2) % 1), 1.0, 0.6);
    },
  };
  return g;
}

// ---------------------------------------------------------------------------
// Mule Kick — western gun-rack machine bristling with guns + a longhorn skull
// ---------------------------------------------------------------------------

function pistolIcon() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d'); x.clearRect(0, 0, 256, 256);
  x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineWidth = 12; x.lineJoin = 'round';
  // shield
  x.beginPath(); x.moveTo(128, 50); x.lineTo(198, 84); x.lineTo(198, 148); x.lineTo(128, 206); x.lineTo(58, 148); x.lineTo(58, 84); x.closePath(); x.stroke();
  // a single side-on pistol silhouette, drawn at the current transform
  const pistol = () => {
    x.fillStyle = '#fff';
    x.fillRect(-48, -11, 96, 22);                       // slide / barrel
    x.save(); x.translate(20, 11); x.rotate(0.32); x.fillRect(-11, 0, 22, 42); x.restore(); // grip
    x.lineWidth = 8; x.strokeStyle = '#fff';
    x.beginPath(); x.arc(2, 22, 15, 0.15, Math.PI - 0.15); x.stroke(); // trigger guard
  };
  // TWO overlapping pistols (Mule Kick = carry a third weapon)
  x.save(); x.translate(112, 110); x.rotate(-0.16); pistol(); x.restore();
  x.save(); x.translate(140, 140); x.rotate(-0.16); x.scale(0.92, 0.92); pistol(); x.restore();
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
}

// a crude rifle/pistol silhouette that juts out of the cabinet
function gunProp(gunmetal, wood) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.42), gunmetal); g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), gunmetal); barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.32; g.add(barrel);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.12, 1), wood); stock.position.z = -0.24; g.add(stock);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.1, 0.04), gunmetal); mag.position.set(0, -0.06, 0.05); g.add(mag);
  return g;
}

function buildMuleKickMachine(def) {
  const cream = ps1Snap(new THREE.MeshStandardMaterial({ color: 0xcabf9a, roughness: 0.7 }));
  const wood = ps1Snap(new THREE.MeshStandardMaterial({ map: woodTexture('#6e4a28'), roughness: 0.85 }));
  const green = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x2f7a3a, roughness: 0.6, metalness: 0.2 }));
  const brass = ps1Snap(new THREE.MeshStandardMaterial({ color: 0xb08440, metalness: 0.8, roughness: 0.35 }));
  const gunmetal = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x26241f, metalness: 0.7, roughness: 0.5 }));
  const bone = ps1Snap(new THREE.MeshStandardMaterial({ color: 0xe6dec6, roughness: 0.7 }));
  const bone2 = ps1Snap(new THREE.MeshStandardMaterial({ color: 0xeae3cf, roughness: 0.55 })); // lighter ivory horns
  const rope = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.95 }));
  const dark = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x14110d, roughness: 0.85 }));
  const glow = new THREE.MeshBasicMaterial({ color: def.color });

  const g = new THREE.Group();
  const H = def.h, W = 0.9, D = 0.74, F = D / 2;
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const decalMat = (mat) => { mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2; mat.transparent = true; return mat; };

  // cream cabinet on a green plinth
  const lowH = H * 0.7;
  const cab = box(W, lowH, D, cream); cab.position.y = lowH / 2; cab.castShadow = true; g.add(cab);
  // shallow arched cap (not a full dome) + brass trim, so the topper sits proud
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(W / 2, W / 2, D, 18, 1, false, 0, Math.PI), cream);
  crown.rotation.z = Math.PI / 2; crown.rotation.y = Math.PI / 2; crown.scale.y = 0.42; crown.position.y = lowH; g.add(crown);
  const crownTop = lowH + (W / 2) * 0.42;
  const crownBand = box(W + 0.02, 0.06, D + 0.02, brass); crownBand.position.y = lowH; g.add(crownBand);
  const midBand = box(W + 0.015, 0.05, D + 0.015, brass); midBand.position.y = lowH * 0.5; g.add(midBand);
  // brass corner posts down the cabinet
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const post2 = box(0.04, lowH * 0.96, 0.04, brass); post2.position.set(sx * (W / 2 - 0.02), lowH * 0.5, sz * (D / 2 - 0.02)); g.add(post2); }
  // brass shelf disc on top to seat the orb + skull
  const shelf = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.06, 20), brass); shelf.position.set(0, crownTop + 0.03, -0.02); g.add(shelf);
  const plinth = box(W + 0.06, 0.14, D + 0.06, green); plinth.position.y = 0.07; g.add(plinth);

  // wood front panel with a gold star + glowing bottle slots
  const woodPanel = box(W - 0.18, lowH * 0.62, 0.04, wood); woodPanel.position.set(0, lowH * 0.46, F + 0.005); g.add(woodPanel);
  // ornate gold frame around the wood panel
  const fw = W - 0.15, fh = lowH * 0.66;
  for (const [bw, bh, bx, by] of [[fw, 0.035, 0, fh / 2], [fw, 0.035, 0, -fh / 2], [0.035, fh, fw / 2, 0], [0.035, fh, -fw / 2, 0]]) {
    const b = box(bw, bh, 0.05, brass); b.position.set(bx, lowH * 0.46 + by, F + 0.012); g.add(b);
  }
  // proper 5-pointed sheriff star (gold) on the panel
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.082 : 0.185;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    i ? starShape.lineTo(px, py) : starShape.moveTo(px, py);
  }
  starShape.closePath();
  const star = new THREE.Mesh(new THREE.ShapeGeometry(starShape), brass); star.position.set(0, lowH * 0.46, F + 0.02); g.add(star);
  // gold studs at the star points
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), brass);
    stud.position.set(Math.cos(a) * 0.165, lowH * 0.46 + Math.sin(a) * 0.165, F + 0.03); g.add(stud);
  }
  const slotMats = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.MeshBasicMaterial({ color: def.color });
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.04, 0.02), m);
    slot.position.set(0, lowH * 0.34 + i * 0.06, F + 0.03); g.add(slot); slotMats.push(m);
  }
  // coin door + tray
  const door = box(0.14, 0.16, 0.05, brass); door.position.set(0.28, lowH * 0.6, F + 0.01); g.add(door);
  const tray = box(0.16, 0.08, 0.06, dark); tray.position.set(0, lowH * 0.16, F + 0.03); g.add(tray);

  // "MULE KICK" western nameplate on the upper front face
  const plate = box(0.62, 0.16, 0.06, brass); plate.position.set(0, lowH * 0.9, F + 0.01); g.add(plate);
  const plateTxt = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.13), decalMat(new THREE.MeshBasicMaterial({ map: nameTextureWide(def) })));
  plateTxt.position.set(0, lowH * 0.9, F + 0.05); g.add(plateTxt);

  // guns mounted in crossed X-pairs up the sides, with a few flatter pistols
  const sideBulbs = [];
  const placeGun = (x, y, z, ry, rz) => { const gun = gunProp(gunmetal, wood); gun.position.set(x, y, z); gun.rotation.set(0, ry, rz); g.add(gun); };
  for (const sx of [-1, 1]) {
    for (let p = 0; p < 3; p++) {
      const yy = lowH * (0.32 + p * 0.24);
      placeGun(sx * (W / 2 - 0.03), yy, 0.05, sx * 1.05, 0.55);   // up-tilted
      placeGun(sx * (W / 2 - 0.03), yy, 0.05, sx * 1.05, -0.55);  // crossing down-tilt
    }
    placeGun(sx * (W / 2 - 0.02), lowH * 0.22, 0.14, sx * 1.4, 0.0); // low pistol, flatter
    // green bulb string running down the side
    for (let i = 0; i < 6; i++) {
      const m = new THREE.MeshBasicMaterial({ color: def.color });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), m);
      bulb.position.set(sx * (W / 2 + 0.015), lowH * (0.2 + i * 0.12), F - 0.05); g.add(bulb); sideBulbs.push(m);
    }
  }

  // a denser top fan of rifles bristling out behind the sign (concept gun-rack)
  const placeGunR = (x, y, z, rx, ry, rz, s = 1) => { const gun = gunProp(gunmetal, wood); gun.position.set(x, y, z); gun.rotation.set(rx, ry, rz); gun.scale.setScalar(s); g.add(gun); };
  for (let i = 0; i < 7; i++) {
    const t = i - 3;
    placeGunR(t * 0.06, crownTop + 0.02, -0.16, -0.85 + Math.abs(t) * 0.06, t * 0.42, 0, 1.05);
  }
  // extra crossed rifles high on the sides + a forward-jutting pistol
  for (const sx of [-1, 1]) {
    placeGunR(sx * (W / 2 - 0.02), lowH * 0.86, 0.0, 0, sx * 1.2, 0.7, 1.15);
    placeGunR(sx * (W / 2 - 0.02), lowH * 0.86, 0.0, 0, sx * 1.2, -0.7, 1.15);
    placeGunR(sx * (W / 2 + 0.0), lowH * 0.5, 0.16, 0, sx * 1.5, 0.1, 0.85);
  }

  // round green orb sign on a brass post above the cabinet, ringed with bulbs
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.18, 10), brass); post.position.set(0, crownTop + 0.12, -0.02); g.add(post);
  const signY = crownTop + 0.42;
  const signGroup = new THREE.Group(); signGroup.position.set(0, signY, 0); g.add(signGroup);
  const signMat = glow;
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), signMat); orb.scale.z = 0.5; orb.position.z = 0.04; signGroup.add(orb);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.025, 8, 24), brass); ring.position.z = 0.04; signGroup.add(ring);
  const icon = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), decalMat(new THREE.MeshBasicMaterial({ map: pistolIcon() })));
  icon.position.z = 0.18; signGroup.add(icon);
  const bulbMats = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const m = new THREE.MeshBasicMaterial({ color: def.color });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), m);
    bulb.position.set(Math.cos(a) * 0.27, Math.sin(a) * 0.27, 0.05); signGroup.add(bulb); bulbMats.push(m);
  }

  // rope coil lashing the topper to the post
  for (let i = 0; i < 3; i++) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.018, 6, 16), rope);
    coil.position.set(0, crownTop + 0.05 + i * 0.05, -0.02); coil.rotation.x = Math.PI / 2; g.add(coil);
  }

  // --- longhorn bull skull lashed above the orb (the Mule Kick signature) ---
  const skull = new THREE.Group(); skull.position.set(0, signY + 0.05, -0.13); g.add(skull);
  const brow = box(0.24, 0.13, 0.15, bone); brow.position.set(0, 0.06, 0); skull.add(brow);
  const snout = box(0.15, 0.16, 0.13, bone); snout.position.set(0, -0.07, 0.01); skull.add(snout);
  const nose = box(0.1, 0.08, 0.12, bone); nose.position.set(0, -0.17, 0.02); skull.add(nose);
  for (const sx of [-1, 1]) { const cheek = box(0.06, 0.09, 0.1, bone); cheek.position.set(sx * 0.1, -0.03, 0.02); skull.add(cheek); }
  for (const sx of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 6), dark); eye.position.set(sx * 0.075, 0.0, 0.07); skull.add(eye); }
  const boss = box(0.2, 0.06, 0.12, bone); boss.position.set(0, 0.12, 0); skull.add(boss); // bony ridge between horns
  // wide curving horns (parametric tapered chain, mirrored for the left)
  const makeHorn = () => {
    const horn = new THREE.Group(); let hx = 0, hy = 0;
    for (let i = 0; i < 5; i++) {
      const len = 0.15 - i * 0.012, r0 = Math.max(0.036 - i * 0.0065, 0.008), r1 = Math.max(0.036 - (i + 1) * 0.0065, 0.005);
      const phi = -0.12 + i * 0.27;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 8), bone2);
      seg.position.set(hx + Math.cos(phi) * len / 2, hy + Math.sin(phi) * len / 2, 0);
      seg.rotation.z = phi - Math.PI / 2; horn.add(seg);
      hx += Math.cos(phi) * len; hy += Math.sin(phi) * len;
    }
    return horn;
  };
  const hornR = makeHorn(); hornR.position.set(0.12, 0.12, 0); skull.add(hornR);
  const hornL = makeHorn(); hornL.position.set(-0.12, 0.12, 0); hornL.scale.x = -1; skull.add(hornL);
  // rope wrap binding the skull to the orb
  for (let i = 0; i < 2; i++) {
    const lash = new THREE.Mesh(new THREE.TorusGeometry(0.19 - i * 0.02, 0.02, 6, 18), rope);
    lash.position.set(0, signY - 0.14 + i * 0.04, -0.04); lash.rotation.x = 0.35; g.add(lash);
  }

  const light = new THREE.PointLight(def.color, 0.75, 3.2, 2.0);
  light.position.set(0, signY, F + 0.3); g.add(light);

  g.userData = {
    height: H, signMat, light,
    anim: (now) => {
      for (let i = 0; i < bulbMats.length; i++) bulbMats[i].color.setHex(def.color).multiplyScalar(0.3 + (0.5 + 0.5 * Math.sin(now * 6 - i * 0.7)) * 1.0);
      for (let i = 0; i < sideBulbs.length; i++) sideBulbs[i].color.setHex(def.color).multiplyScalar(0.3 + (0.5 + 0.5 * Math.sin(now * 5 - i * 0.5)) * 1.0);
      for (let i = 0; i < slotMats.length; i++) slotMats[i].color.setHex(def.color).multiplyScalar(0.6 + Math.sin(now * 3 + i * 0.5) * 0.35);
    },
  };
  return g;
}

// ---------------------------------------------------------------------------
// PHD Flopper — purple atomic art-deco machine with a sputnik light burst
// ---------------------------------------------------------------------------

function radIcon() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d'); x.clearRect(0, 0, 256, 256);
  x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineWidth = 12; x.lineJoin = 'round';
  // shield
  x.beginPath(); x.moveTo(128, 52); x.lineTo(196, 86); x.lineTo(196, 148); x.lineTo(128, 204); x.lineTo(60, 148); x.lineTo(60, 86); x.closePath(); x.stroke();
  // radiation trefoil
  x.translate(128, 128);
  x.fillStyle = '#fff';
  for (let i = 0; i < 3; i++) {
    x.beginPath(); x.moveTo(0, 0);
    const a0 = i * 2.094 - 0.5, a1 = i * 2.094 + 0.5;
    x.arc(0, 0, 46, a0, a1); x.closePath(); x.fill();
  }
  x.beginPath(); x.arc(0, 0, 12, 0, 7); x.fill();
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
}

// glowing mushroom-cloud panel with vertical FLOPPER text
function floppPanel() {
  const c = document.createElement('canvas'); c.width = 160; c.height = 512;
  const x = c.getContext('2d');
  const grd = x.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#ffd27a'); grd.addColorStop(0.5, '#ff9a3a'); grd.addColorStop(1, '#ff7a2a');
  x.fillStyle = grd; x.fillRect(0, 0, 160, 512);
  // mushroom cloud
  x.fillStyle = 'rgba(255,255,255,0.5)';
  x.beginPath(); x.arc(80, 120, 56, 0, 7); x.fill();
  x.fillRect(60, 150, 40, 200);
  // vertical FLOPPER text
  x.fillStyle = '#3a1c10'; x.font = '900 54px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const word = 'FLOPPER';
  for (let i = 0; i < word.length; i++) x.fillText(word[i], 80, 150 + i * 50);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
}

function buildAtomicMachine(def) {
  const purple = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x7d3a9e, roughness: 0.35, metalness: 0.4 }));
  const chrome = ps1Snap(new THREE.MeshStandardMaterial({ color: 0xc2b8cc, metalness: 0.9, roughness: 0.25 }));
  const dark = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x241133, roughness: 0.7 }));
  const glow = new THREE.MeshBasicMaterial({ color: def.color });
  const orange = new THREE.MeshBasicMaterial({ map: floppPanel() });
  const bulbY = new THREE.MeshBasicMaterial({ color: 0xffd24a });

  const g = new THREE.Group();
  const H = def.h, W = 0.6, D = 0.5, F = 0.25;
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const decalMat = (mat) => { mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2; mat.transparent = true; return mat; };
  // flattened tapered drum (rounded-rectangular cross-section) for the torso
  const drum = (rT, rB, h, m, seg = 20) => { const me = new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, h, seg), m); me.scale.z = 0.78; me.castShadow = true; return me; };

  // bottom-heavy waisted torso: wide flared hips -> pinched waist -> shoulders
  const plinth = drum(0.34, 0.37, 0.1, chrome); plinth.position.y = 0.05; g.add(plinth);
  const hips = drum(0.2, 0.34, H * 0.4, purple); hips.position.y = 0.1 + H * 0.2; g.add(hips);
  const waistY = 0.1 + H * 0.4;
  const waist = drum(0.185, 0.185, H * 0.07, chrome); waist.position.y = waistY + H * 0.035; g.add(waist);
  const torsoY0 = waistY + H * 0.07;
  const torso = drum(0.3, 0.2, H * 0.42, purple); torso.position.y = torsoY0 + H * 0.21; g.add(torso);
  const torsoTop = torsoY0 + H * 0.42;
  const shoulders = drum(0.15, 0.3, H * 0.07, purple); shoulders.position.y = torsoTop + H * 0.035; g.add(shoulders);
  // angled chrome shoulder wings (the deco flares)
  for (const sx of [-1, 1]) {
    const wing = box(0.06, H * 0.22, D * 0.5, chrome);
    wing.position.set(sx * 0.28, torsoTop - H * 0.1, 0); wing.rotation.z = sx * 0.32; g.add(wing);
  }

  // glowing mushroom-cloud FLOPPER panel (pulses) behind a chrome frame
  const panelFrame = box(0.3, H * 0.34, 0.04, chrome); panelFrame.position.set(0, H * 0.64, F + 0.005); g.add(panelFrame);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.24, H * 0.3), decalMat(orange)); panel.position.set(0, H * 0.64, F + 0.03); g.add(panel);

  // PHD FLOPPER marquee up top (art-deco glowing nameplate)
  const plate = box(0.5, 0.2, 0.05, dark); plate.position.set(0, H * 0.97, F + 0.01); g.add(plate);
  const plateGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.17), decalMat(new THREE.MeshBasicMaterial({ map: (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 160; const x = c.getContext('2d'); x.clearRect(0, 0, 512, 160);
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '900 56px Georgia, serif';
    x.fillStyle = '#f3c2ff'; x.strokeStyle = '#c060e0'; x.lineWidth = 4;
    x.strokeText('PHD', 256, 50); x.fillText('PHD', 256, 50);
    x.strokeText('FLOPPER', 256, 112); x.fillText('FLOPPER', 256, 112);
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
  })() }))); plateGlow.position.set(0, H * 0.97, F + 0.04); g.add(plateGlow);

  // color-cycling neon edge piping down the torso
  const neonMats = [];
  for (const sx of [-1, 1]) { const m = new THREE.MeshBasicMaterial({ color: 0xffffff }); const e = box(0.02, H * 0.36, 0.02, m); e.position.set(sx * 0.27, H * 0.62, F); g.add(e); neonMats.push(m); }
  { const m = new THREE.MeshBasicMaterial({ color: 0xffffff }); const e = box(0.42, 0.02, 0.02, m); e.position.set(0, H * 0.5, F * 0.85); g.add(e); neonMats.push(m); }

  // coin slot
  const coin = box(0.05, 0.08, 0.03, chrome); coin.position.set(0.18, H * 0.55, F + 0.02); g.add(coin);

  // sputnik atomic burst on top: chrome sphere + radiating rods w/ glowing bulbs
  const burstY = H * 1.15;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.2, 10), chrome); neck.position.set(0, H * 1.04, 0); g.add(neck);
  const burst = new THREE.Group(); burst.position.set(0, burstY, 0); g.add(burst);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), chrome); burst.add(core);
  const bulbMats = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0.0);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6), chrome);
    rod.position.copy(dir.clone().multiplyScalar(0.17)); rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    burst.add(rod);
    const m = bulbY.clone();
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), m);
    bulb.position.copy(dir.clone().multiplyScalar(0.28)); burst.add(bulb); bulbMats.push(m);
  }
  // radiation sign disc on the front of the core
  const signMat = glow;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.13, 22), signMat); disc.position.z = 0.1; burst.add(disc);
  const icon = new THREE.Mesh(new THREE.CircleGeometry(0.1, 22), decalMat(new THREE.MeshBasicMaterial({ map: radIcon() }))); icon.position.z = 0.11; burst.add(icon);

  const light = new THREE.PointLight(def.color, 0.8, 3.4, 2.0);
  light.position.set(0, H * 0.62, F + 0.3); g.add(light);

  g.userData = {
    height: H, signMat, chamberMat: null, light,
    anim: (now) => {
      burst.rotation.z = now * 0.4; // slow atomic spin
      for (let i = 0; i < bulbMats.length; i++) bulbMats[i].color.setHex(0xffd24a).multiplyScalar(0.4 + (0.5 + 0.5 * Math.sin(now * 5 - i * 0.6)) * 1.1);
      orange.color.setScalar(0.8 + Math.sin(now * 3) * 0.2); // mushroom-cloud flicker
      for (let i = 0; i < neonMats.length; i++) neonMats[i].color.setHSL((0.78 + Math.sin(now * 2 + i) * 0.06) % 1, 1.0, 0.6);
    },
  };
  return g;
}

// ---------------------------------------------------------------------------
// Electric Cherry — riveted electric-chair cooler with neon retro-futurist flair
// ---------------------------------------------------------------------------

function cherryIcon() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d'); x.clearRect(0, 0, 256, 256);
  x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineWidth = 12; x.lineJoin = 'round'; x.lineCap = 'round';
  x.beginPath(); x.moveTo(128, 52); x.lineTo(196, 86); x.lineTo(196, 148); x.lineTo(128, 204); x.lineTo(60, 148); x.lineTo(60, 86); x.closePath(); x.stroke();
  // cherries
  x.beginPath(); x.arc(108, 158, 24, 0, 7); x.fill();
  x.beginPath(); x.arc(152, 168, 20, 0, 7); x.fill();
  x.lineWidth = 7; x.beginPath(); x.moveTo(108, 134); x.bezierCurveTo(120, 100, 150, 96, 158, 86); x.moveTo(152, 148); x.bezierCurveTo(156, 120, 156, 100, 158, 86); x.stroke();
  // lightning bolt
  x.fillStyle = '#fff'; x.beginPath(); x.moveTo(150, 84); x.lineTo(176, 92); x.lineTo(160, 104); x.lineTo(184, 118); x.lineTo(146, 120); x.lineTo(158, 104); x.closePath(); x.fill();
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
}

function buildElectricMachine(def) {
  const body = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x23252b, roughness: 0.55, metalness: 0.55 })); // glossy near-black (concept-art body)
  const darkM = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.78, metalness: 0.5 }));
  const chrome = ps1Snap(new THREE.MeshStandardMaterial({ color: 0xb6bbc0, metalness: 0.9, roughness: 0.3 }));
  const ceramic = ps1Snap(new THREE.MeshStandardMaterial({ color: 0xe6e2d6, roughness: 0.5 }));
  const frost = ps1Snap(new THREE.MeshStandardMaterial({ color: 0xdcecff, roughness: 0.6 }));
  const glow = new THREE.MeshBasicMaterial({ color: def.color });

  const g = new THREE.Group();
  const H = def.h, W = 0.96, D = 0.82, F = D / 2;
  const bodyH = H * 0.62;
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const decalMat = (mat) => { mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2; mat.transparent = true; return mat; };

  // heavy riveted cooler box on stubby feet
  const cab = box(W, bodyH, D, body); cab.position.y = 0.12 + bodyH / 2; cab.castShadow = true; g.add(cab);
  const lid = box(W + 0.04, 0.08, D + 0.04, chrome); lid.position.y = 0.12 + bodyH; g.add(lid);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const foot = box(0.1, 0.12, 0.1, darkM); foot.position.set(sx * (W / 2 - 0.08), 0.06, sz * (D / 2 - 0.08)); g.add(foot); }
  // rivets along the front edges
  for (let i = 0; i < 8; i++) for (const sx of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), chrome);
    r.position.set(sx * (W / 2 - 0.04), 0.18 + i * (bodyH - 0.12) / 7, F); g.add(r);
  }
  // frost dripping over the top edge
  const frostStrip = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.05, 0.12), decalMat(new THREE.MeshBasicMaterial({ map: (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.clearRect(0, 0, 256, 64);
    x.fillStyle = 'rgba(230,244,255,0.9)'; for (let i = 0; i < 22; i++) { const w = 6 + Math.random() * 12; const h = 14 + Math.random() * 40; x.fillRect(i * 12, 0, w, h); }
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
  })() }))); frostStrip.position.set(0, 0.12 + bodyH - 0.05, F + 0.012); g.add(frostStrip);

  // 5¢ + cherry window
  const five = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), decalMat(new THREE.MeshBasicMaterial({ map: (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d'); x.clearRect(0, 0, 256, 256);
    x.fillStyle = '#d8d2c0'; x.font = '900 150px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('5¢', 128, 140);
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
  })() }))); five.position.set(0.2, 0.12 + bodyH * 0.52, F + 0.012); g.add(five);
  const winFrame = box(0.5, 0.16, 0.05, chrome); winFrame.position.set(0, 0.12 + bodyH * 0.82, F + 0.005); g.add(winFrame);
  const winGlow = new THREE.MeshBasicMaterial({ color: def.color });
  const win = box(0.44, 0.1, 0.02, winGlow); win.position.set(0, 0.12 + bodyH * 0.82, F + 0.035); g.add(win);
  // side lever (electric-chair throw switch)
  const leverBase = box(0.06, 0.18, 0.06, darkM); leverBase.position.set(-(W / 2) - 0.02, 0.12 + bodyH * 0.7, 0.1); g.add(leverBase);
  const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 8), chrome); lever.position.set(-(W / 2) - 0.05, 0.12 + bodyH * 0.78, 0.1); lever.rotation.z = 0.5; g.add(lever);
  const leverBall = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), glow); leverBall.position.set(-(W / 2) - 0.11, 0.12 + bodyH * 0.86, 0.1); g.add(leverBall);

  // arched neon frame + round sign on top, with electrode rods/insulators
  const topY = 0.12 + bodyH;
  const postH = H * 0.5;
  for (const sx of [-1, 1]) {
    const post = box(0.05, postH, 0.06, darkM); post.position.set(sx * 0.34, topY + postH / 2, -0.05); g.add(post);
    // ceramic insulators + electrode rods jutting out
    for (let i = 0; i < 3; i++) {
      const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.05, 8), ceramic); ins.rotation.z = Math.PI / 2;
      ins.position.set(sx * 0.42, topY + 0.12 + i * 0.13, -0.05); g.add(ins);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.14, 6), chrome); rod.rotation.z = Math.PI / 2;
      rod.position.set(sx * 0.5, topY + 0.12 + i * 0.13, -0.05); g.add(rod);
    }
  }
  // neon arch (glowing tube) across the top
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.018, 8, 24, Math.PI), glow); arch.position.set(0, topY + postH, -0.05); g.add(arch);
  // cross finial
  const finV = box(0.02, 0.16, 0.02, chrome); finV.position.set(0, topY + postH + 0.12, -0.05); g.add(finV);
  const finH = box(0.1, 0.02, 0.02, chrome); finH.position.set(0, topY + postH + 0.14, -0.05); g.add(finH);

  const signY = topY + postH * 0.55;
  const signGroup = new THREE.Group(); signGroup.position.set(0, signY, -0.02); g.add(signGroup);
  const signMat = glow;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.03, 8, 28), chrome); ring.position.z = 0.04; signGroup.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.26, 30), signMat); disc.position.z = 0.03; signGroup.add(disc);
  const icon = new THREE.Mesh(new THREE.CircleGeometry(0.2, 26), decalMat(new THREE.MeshBasicMaterial({ map: cherryIcon() }))); icon.position.z = 0.05; signGroup.add(icon);

  // energized halo behind the emblem (pulses with the lightning)
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.225, 0.022, 8, 30),
    new THREE.MeshBasicMaterial({ color: 0xbfdcff, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  halo.position.z = 0.052; signGroup.add(halo);

  // jagged lightning crackling inward into the centerpiece. Each bolt is a chain
  // of thin additive segments whose jagged path + flicker are recomputed every
  // frame, so it reads as live electricity striking the emblem rather than the
  // old static radial lines.
  const BOLTS = 7, SEGS = 5;
  const bolts = [];
  for (let i = 0; i < BOLTS; i++) {
    const m = new THREE.MeshBasicMaterial({ color: 0xd6ecff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const grp = new THREE.Group(); const seg = [];
    for (let s = 0; s < SEGS; s++) { const b = box(0.014, 1, 0.014, m); b.scale.y = 0.001; grp.add(b); seg.push(b); }
    signGroup.add(grp);
    bolts.push({ seg, mat: m, base: (i / BOLTS) * Math.PI * 2 });
  }
  // recompute one bolt's jagged path from the rim toward the centre + set its glow
  const reJag = (b, intensity) => {
    b.mat.opacity = intensity;
    if (intensity <= 0) { for (const s of b.seg) s.scale.y = 0.001; return; }
    const ang = b.base + (Math.random() - 0.5) * 0.5;
    const Rout = 0.34 + Math.random() * 0.05, Rin = 0.04 + Math.random() * 0.13;
    const ox = Math.cos(ang) * Rout, oy = Math.sin(ang) * Rout;
    const ex = Math.cos(ang) * Rin, ey = Math.sin(ang) * Rin;
    const px = -Math.sin(ang), py = Math.cos(ang); // perpendicular jitter axis
    let prevx = ox, prevy = oy; const N = b.seg.length;
    for (let s = 0; s < N; s++) {
      const t = (s + 1) / N;
      let jx = ox + (ex - ox) * t, jy = oy + (ey - oy) * t;
      if (s < N - 1) { const j = (Math.random() - 0.5) * 0.09 * (1 - t * 0.3); jx += px * j; jy += py * j; }
      const dx = jx - prevx, dy = jy - prevy, len = Math.hypot(dx, dy) || 0.001;
      const part = b.seg[s];
      part.position.set((prevx + jx) / 2, (prevy + jy) / 2, 0.07);
      part.scale.y = len; part.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
      prevx = jx; prevy = jy;
    }
  };

  // glowing bottle-tube window behind glass (over the cherry-glow backing)
  const tubeMats = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.MeshBasicMaterial({ color: def.color });
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 8), m);
    tube.position.set(-0.18 + i * 0.09, 0.12 + bodyH * 0.82, F + 0.05); g.add(tube); tubeMats.push(m);
  }
  const glassWin = box(0.46, 0.13, 0.01, new THREE.MeshStandardMaterial({ color: 0x88aacc, transparent: true, opacity: 0.22, roughness: 0.1 }));
  glassWin.position.set(0, 0.12 + bodyH * 0.82, F + 0.065); g.add(glassWin);

  // red ELECTRIC CHERRY nameplate on the lower front
  const nameP = box(0.5, 0.15, 0.04, darkM); nameP.position.set(0, 0.12 + bodyH * 0.2, F + 0.01); g.add(nameP);
  const nameTx = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.12), decalMat(new THREE.MeshBasicMaterial({ map: (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 160; const x = c.getContext('2d'); x.clearRect(0, 0, 512, 160);
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '900 56px Georgia, serif';
    x.fillStyle = '#ff3a3a'; x.strokeStyle = '#7a1010'; x.lineWidth = 4;
    x.strokeText('ELECTRIC', 256, 52); x.fillText('ELECTRIC', 256, 52);
    x.strokeText('CHERRY', 256, 112); x.fillText('CHERRY', 256, 112);
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
  })() }))); nameTx.position.set(0, 0.12 + bodyH * 0.2, F + 0.035); g.add(nameTx);
  // three speaker dials lower-left
  for (let i = 0; i < 3; i++) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 16), chrome); rim.position.set(-0.28, 0.12 + bodyH * (0.42 - i * 0.13), F + 0.02); g.add(rim);
    const cone = new THREE.Mesh(new THREE.CircleGeometry(0.042, 16), darkM); cone.position.set(-0.28, 0.12 + bodyH * (0.42 - i * 0.13), F + 0.018); g.add(cone);
  }

  // lightning-bolt wing fins flaring off the upper sides (neon-rimmed)
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0.26); finShape.lineTo(0.3, 0.13); finShape.lineTo(0.17, 0.06);
  finShape.lineTo(0.38, -0.09); finShape.lineTo(0.16, -0.05); finShape.lineTo(0.22, -0.24);
  finShape.lineTo(0, -0.12); finShape.closePath();
  const finGeo = new THREE.ShapeGeometry(finShape);
  for (const sx of [-1, 1]) {
    const finGlow = new THREE.Mesh(finGeo, glow); finGlow.scale.set(sx * 1.14, 1.14, 1); finGlow.position.set(sx * 0.36, topY + 0.16, -0.04); g.add(finGlow);
    const fin = new THREE.Mesh(finGeo, darkM); fin.scale.set(sx, 1, 1); fin.position.set(sx * 0.36, topY + 0.16, -0.03); g.add(fin);
  }

  // heavier framed arch: chrome outer rail + chrome post facings around the neon
  const archOuter = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.035, 8, 26, Math.PI), chrome); archOuter.position.set(0, topY + postH, -0.08); g.add(archOuter);
  for (const sx of [-1, 1]) { const pf = box(0.07, postH, 0.05, chrome); pf.position.set(sx * 0.41, topY + postH / 2, -0.08); g.add(pf); }

  // neon edge piping down the body front corners
  const neonMats = [];
  for (const sx of [-1, 1]) { const m = new THREE.MeshBasicMaterial({ color: def.color }); const e = box(0.02, bodyH * 0.92, 0.02, m); e.position.set(sx * (W / 2 - 0.012), 0.12 + bodyH * 0.5, F + 0.012); g.add(e); neonMats.push(m); }

  const light = new THREE.PointLight(def.color, 0.7, 3.4, 2.0);
  light.position.set(0, signY, F + 0.3); g.add(light);

  g.userData = {
    height: H, signMat, chamberMat: winGlow, light,
    anim: (now) => {
      // electric stutter on the sign + light
      const flick = (Math.sin(now * 30) > 0.7 || Math.random() > 0.92) ? 0.4 : 1.0;
      light.intensity = 0.7 * flick;
      // live lightning into the centerpiece: a random subset fires each frame
      let crackle = 0;
      for (let i = 0; i < bolts.length; i++) {
        const fire = Math.random() > 0.5;
        const a = fire ? 0.7 + Math.random() * 0.3 : 0;
        reJag(bolts[i], a); crackle = Math.max(crackle, a);
      }
      halo.material.opacity = 0.28 + crackle * 0.55;
      for (let i = 0; i < tubeMats.length; i++) tubeMats[i].color.setHex(def.color).multiplyScalar(0.5 + (0.5 + 0.5 * Math.sin(now * 4 - i * 0.6)) * 0.9);
      for (let i = 0; i < neonMats.length; i++) neonMats[i].color.setHex(def.color).multiplyScalar(0.7 * flick + 0.3);
    },
  };
  return g;
}

// ---------------------------------------------------------------------------
// Deadshot Daiquiri — heavy-metal spiked tower w/ skull, flaming guitars, glass
// ---------------------------------------------------------------------------

function reticleIcon() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d'); x.clearRect(0, 0, 256, 256);
  // head + shoulders silhouette inside the sight (Deadshot = aim for the head)
  x.fillStyle = '#fff';
  x.beginPath(); x.arc(128, 116, 26, 0, 7); x.fill();                         // head
  x.beginPath(); x.moveTo(94, 178); x.quadraticCurveTo(128, 146, 162, 178); x.lineTo(162, 192); x.lineTo(94, 192); x.closePath(); x.fill(); // shoulders
  // crosshair ring + ticks + centre dot
  x.strokeStyle = '#fff'; x.lineWidth = 10;
  x.beginPath(); x.arc(128, 128, 82, 0, 7); x.stroke();
  x.lineWidth = 8;
  for (const a of [0, 1, 2, 3]) { x.save(); x.translate(128, 128); x.rotate(a * Math.PI / 2); x.beginPath(); x.moveTo(0, -104); x.lineTo(0, -66); x.stroke(); x.restore(); }
  x.fillStyle = '#fff'; x.beginPath(); x.arc(128, 128, 7, 0, 7); x.fill();
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
}

function skullMesh(bone, eyeMat) {
  const s = new THREE.Group();
  const socketMat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 1 });
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xf2ecda, roughness: 0.55 });
  // cranium (egg-shaped) + brow ridge
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 13), bone); cranium.scale.set(1, 1.1, 0.96); cranium.position.y = 0.03; s.add(cranium);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.035, 0.05), bone); brow.position.set(0, 0.035, 0.095); s.add(brow);
  const temple = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), bone); // back of head fill
  temple.scale.set(1.4, 1, 1); temple.position.set(0, 0.04, -0.04); s.add(temple);
  // deep eye sockets + glowing eyes
  for (const sx of [-1, 1]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), socketMat); socket.position.set(sx * 0.052, 0.0, 0.082); socket.scale.set(1, 0.9, 0.65); s.add(socket);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), eyeMat); eye.position.set(sx * 0.052, 0.0, 0.1); s.add(eye);
  }
  // nasal cavity
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.055, 3), socketMat); nose.position.set(0, -0.05, 0.1); nose.rotation.z = Math.PI; nose.scale.z = 0.5; s.add(nose);
  // cheekbones / maxilla + jaw
  const maxilla = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 0.11), bone); maxilla.position.set(0, -0.08, 0.04); s.add(maxilla);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.1), bone); jaw.position.set(0, -0.14, 0.035); s.add(jaw);
  // two rows of teeth
  for (let i = 0; i < 6; i++) {
    const tx = -0.05 + i * 0.02;
    const tU = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.028, 0.02), toothMat); tU.position.set(tx, -0.108, 0.092); s.add(tU);
    const tL = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.028, 0.02), toothMat); tL.position.set(tx, -0.142, 0.082); s.add(tL);
  }
  return s;
}

function guitarMesh(metal, flameMat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.035, 0.2), metal); g.add(body);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), metal); horn.rotation.x = -Math.PI / 2; horn.position.z = -0.14; g.add(horn);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.028, 0.38), metal); neck.position.z = 0.26; g.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.03, 0.08), metal); head.position.z = 0.48; g.add(head);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 8), flameMat); flame.position.z = 0.62; flame.rotation.x = -Math.PI / 2; g.add(flame);
  g.userData.flame = flame;
  return g;
}

function buildDeadshotMachine(def) {
  const metal = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x3a3a42, metalness: 0.8, roughness: 0.4 }));
  const chrome = ps1Snap(new THREE.MeshStandardMaterial({ color: 0xc2c6cc, metalness: 0.95, roughness: 0.2 }));
  const red = ps1Snap(new THREE.MeshStandardMaterial({ color: 0xa01f1a, roughness: 0.5, metalness: 0.3 }));
  const bone = ps1Snap(new THREE.MeshStandardMaterial({ color: 0xddd6c4, roughness: 0.7 }));
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfd6da, transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0.3 });
  const glow = new THREE.MeshBasicMaterial({ color: def.color });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
  const liquid = new THREE.MeshBasicMaterial({ color: 0xd02a2a });

  const g = new THREE.Group();
  const H = def.h, W = 0.72, D = 0.72, F = D / 2;
  const bodyH = H * 0.74;
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const decalMat = (mat) => { mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2; mat.transparent = true; return mat; };

  // spiked metal tower
  const cab = box(W, bodyH, D, metal); cab.position.y = 0.1 + bodyH / 2; cab.castShadow = true; g.add(cab);
  const redTop = box(W + 0.04, 0.1, D + 0.04, red); redTop.position.y = 0.1 + bodyH - 0.05; g.add(redTop);
  // spikes around the top + bottom rims and sides
  const spike = (px, py, pz, rx, rz) => { const s = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 6), chrome); s.position.set(px, py, pz); s.rotation.set(rx, 0, rz); g.add(s); };
  for (let i = 0; i < 7; i++) { const t = -W / 2 + 0.06 + i * (W - 0.12) / 6; spike(t, 0.1 + bodyH - 0.05, F + 0.04, Math.PI / 2, 0); spike(t, 0.1 + bodyH - 0.05, -F - 0.04, -Math.PI / 2, 0); }
  for (let i = 0; i < 6; i++) { const yy = 0.16 + i * (bodyH - 0.2) / 5; spike(W / 2 + 0.04, yy, 0, 0, -Math.PI / 2); spike(-W / 2 - 0.04, yy, 0, 0, Math.PI / 2); }
  for (let i = 0; i < 4; i++) { const t = -W / 2 + 0.1 + i * (W - 0.2) / 3; spike(t, 0.12, F + 0.02, Math.PI / 2, 0); }
  // stud band on the red top
  for (let i = 0; i < 9; i++) { const stud = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), chrome); stud.position.set(-W / 2 + 0.06 + i * (W - 0.12) / 8, 0.1 + bodyH - 0.05, F + 0.02); g.add(stud); }

  // DEADSHOT DAIQUIRI flaming panel + reticle (glows/flickers)
  const panelMat = new THREE.MeshBasicMaterial({ map: (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 320; const x = c.getContext('2d');
    const grd = x.createLinearGradient(0, 320, 0, 0); grd.addColorStop(0, '#ff7a1a'); grd.addColorStop(0.5, '#7a1408'); grd.addColorStop(1, '#1a0604');
    x.fillStyle = grd; x.fillRect(0, 0, 256, 320);
    // flames at the bottom
    x.fillStyle = '#ffb02a'; for (let i = 0; i < 7; i++) { const fx = 20 + i * 32; x.beginPath(); x.moveTo(fx, 320); x.quadraticCurveTo(fx + 16, 250 - Math.random() * 40, fx + 8, 220); x.quadraticCurveTo(fx, 250, fx - 16, 320); x.fill(); }
    x.strokeStyle = '#ffcf3a'; x.lineWidth = 6; x.beginPath(); x.arc(128, 120, 56, 0, 7); x.stroke();
    x.fillStyle = '#ffcf3a'; x.font = '900 30px Georgia, serif'; x.textAlign = 'center';
    x.fillText('DEADSHOT', 128, 150); x.font = 'italic 26px Georgia'; x.fillText('Daiquiri', 128, 182);
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
  })() });
  const panelFrame = box(0.46, bodyH * 0.5, 0.04, chrome); panelFrame.position.set(0, 0.1 + bodyH * 0.62, F + 0.005); g.add(panelFrame);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.4, bodyH * 0.46), decalMat(panelMat)); panel.position.set(0, 0.1 + bodyH * 0.62, F + 0.03); g.add(panel);

  // red glowing buttons
  const btnMats = [];
  for (let i = 0; i < 4; i++) { const m = new THREE.MeshBasicMaterial({ color: 0xff2a2a }); const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), m); b.position.set(-0.18 + i * 0.12, 0.1 + bodyH * 0.32, F + 0.03); g.add(b); btnMats.push(m); }
  // dispense tray
  const tray = box(0.3, 0.1, 0.06, new THREE.MeshStandardMaterial({ color: 0x111, roughness: 0.9 })); tray.position.set(0, 0.1 + bodyH * 0.16, F + 0.02); g.add(tray);

  // side skulls — centered on each side face, facing outward
  for (const sx of [-1, 1]) { const sk = skullMesh(bone, eyeMat); sk.position.set(sx * (W / 2 + 0.04), 0.1 + bodyH * 0.5, 0); sk.rotation.y = sx * Math.PI / 2; sk.scale.setScalar(0.82); g.add(sk); }
  // skull feet
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const sk = skullMesh(bone, eyeMat); sk.position.set(sx * (W / 2 - 0.08), 0.06, sz * (D / 2 - 0.08)); sk.scale.setScalar(0.5); g.add(sk); }

  // daiquiri glass on top (martini cone + red liquid + stem)
  const topY = 0.1 + bodyH;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8), chrome); stem.position.set(0, topY + 0.1, 0.0); g.add(stem);
  const footG = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.02, 16), chrome); footG.position.set(0, topY + 0.02, 0); g.add(footG);
  const cup = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.2, 18, 1, true), glass); cup.position.set(0, topY + 0.28, 0); g.add(cup);
  const liq = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.16, 18), liquid); liq.position.set(0, topY + 0.26, 0); g.add(liq);

  // chrome skull with spiky mohawk + glowing eyes, crossed flaming guitars behind
  const skullY = topY + 0.46;
  const topSkull = skullMesh(chrome, eyeMat); topSkull.position.set(0, skullY, 0.0); topSkull.scale.setScalar(1.1); g.add(topSkull);
  for (let i = 0; i < 5; i++) { const mo = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.1, 5), chrome); mo.position.set(0, skullY + 0.12 + (i === 2 ? 0.02 : 0), -0.04 + (i - 2) * 0.03); g.add(mo); }
  const guitars = [];
  for (const sx of [-1, 1]) {
    const gu = guitarMesh(metal, flameMat);
    gu.position.set(sx * 0.05, skullY + 0.04, -0.1);
    gu.rotation.set(-0.6, sx * 0.5, sx * 0.5);
    g.add(gu); guitars.push(gu);
  }

  const light = new THREE.PointLight(def.color, 0.8, 3.4, 2.0);
  light.position.set(0, 0.1 + bodyH * 0.62, F + 0.3); g.add(light);

  const signMat = glow; // panel acts as the pulsing sign via chamberMat below
  g.userData = {
    height: H, signMat: panelMat, light,
    anim: (now) => {
      const fl = 0.7 + Math.sin(now * 12) * 0.2 + Math.random() * 0.1;
      eyeMat.color.setHex(0xff2a2a).multiplyScalar(0.7 + Math.sin(now * 6) * 0.3);
      for (const m of btnMats) m.color.setHex(0xff2a2a).multiplyScalar(0.6 + Math.sin(now * 4) * 0.4);
      for (const gu of guitars) { const f = gu.userData.flame; f.scale.set(1 + Math.sin(now * 14) * 0.2, 1 + Math.random() * 0.4, 1 + Math.sin(now * 11) * 0.2); f.material.color.setHSL(0.06 + Math.random() * 0.04, 1, 0.55); }
      light.intensity = 0.8 * fl;
    },
  };
  return g;
}

/** A glassy colored bottle held during the drink animation, with rising bubbles. */
export function buildPerkBottle(color) {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.78, roughness: 0.15, metalness: 0.1, emissive: color, emissiveIntensity: 0.3 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.13, 10), glass);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.03, 0.05, 8), glass); neck.position.y = 0.09;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 8), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.8, roughness: 0.3 })); cap.position.y = 0.12;
  g.add(body, neck, cap);
  g.userData.cap = cap;
  const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
  const bubbles = [];
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 5), bubbleMat.clone());
    b.position.set((Math.random() - 0.5) * 0.05, Math.random() * 0.1 - 0.05, (Math.random() - 0.5) * 0.05);
    g.add(b); bubbles.push(b);
  }
  g.userData.bubbles = bubbles;
  return g;
}
