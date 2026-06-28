import * as THREE from 'three';

/**
 * Procedural 3D "Dr. Monty's" gumball machine (BO3 style) for the GobbleGum pack
 * menu: a weathered red pedestal with metal trim, a glass globe heaped with
 * colorful gumballs, a red sign topper with a silver lion medallion + glowing
 * knob, and the "GOBBLEGUM / CHEW UNTIL YOU DIE! / 5¢" plates. Built from
 * primitives + canvas-text decals so it needs no external assets.
 *
 * Returns a THREE.Group centred on the origin; call userData.dispose() to free.
 */
export function buildGumballMachine() {
  const g = new THREE.Group();
  const track = []; // geometries/materials/textures to dispose

  const mat = (o) => { const m = new THREE.MeshStandardMaterial(o); track.push(m); return m; };
  const red = mat({ color: 0xa83228, roughness: 0.55, metalness: 0.12 });
  const redDark = mat({ color: 0x7c2118, roughness: 0.6, metalness: 0.12 });
  const silver = mat({ color: 0xcaced2, roughness: 0.32, metalness: 0.9 });
  const darkMetal = mat({ color: 0x33363c, roughness: 0.5, metalness: 0.7 });
  const glass = mat({ color: 0xcfe8f2, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.16 });

  const add = (geo, material, x, y, z, ry = 0) => {
    track.push(geo);
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z); if (ry) m.rotation.y = ry;
    g.add(m); return m;
  };
  // square prism via a 4-sided cylinder rotated so a flat face points +Z
  const prism = (rt, rb, h, m, y) => add(new THREE.CylinderGeometry(rt, rb, h, 4, 1), m, 0, y, 0, Math.PI / 4);
  const collar = (rt, rb, h, m, y, seg = 8) => add(new THREE.CylinderGeometry(rt, rb, h, seg), m, 0, y, 0, Math.PI / 8);

  // --- pedestal --------------------------------------------------------
  collar(0.95, 1.05, 0.14, darkMetal, 0.07);      // flared foot
  prism(0.78, 0.92, 0.16, silver, 0.2);            // base trim
  prism(0.62, 0.78, 1.5, red, 1.0);                // main red column
  prism(0.66, 0.6, 0.12, redDark, 1.82);           // shoulder
  collar(0.86, 0.66, 0.16, silver, 1.95);          // metal collar the globe rests in
  collar(0.62, 0.84, 0.12, darkMetal, 2.05);

  // --- glass globe + gumballs -----------------------------------------
  const globeY = 2.62, globeR = 0.62;
  add(new THREE.SphereGeometry(globeR, 36, 28), glass, 0, globeY, 0);
  g.add(buildPile(globeY, globeR, track));

  // --- topper: cap, sign board, medallion, plates, knob ----------------
  collar(0.4, 0.6, 0.22, red, 3.18);               // red cap over the globe
  add(new THREE.BoxGeometry(0.95, 0.74, 0.16), red, 0, 3.62, 0);          // sign board
  add(new THREE.BoxGeometry(1.02, 0.12, 0.2), silver, 0, 3.27, 0);        // board base trim
  // silver lion medallion on the front of the board
  add(new THREE.CylinderGeometry(0.24, 0.24, 0.07, 28), silver, 0, 3.6, 0.12, Math.PI / 2)
    .rotation.set(Math.PI / 2, 0, 0);
  decal(g, lionTex(track), 0.4, 0.4, 0, 3.6, 0.17, track);
  // glowing knob on top
  const knob = mat({ color: 0xffd23a, emissive: 0xffb000, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.2 });
  add(new THREE.SphereGeometry(0.09, 20, 16), knob, 0, 4.08, 0);
  add(new THREE.CylinderGeometry(0.06, 0.09, 0.08, 16), silver, 0, 3.99, 0);

  // text decals on the front
  decal(g, textTex('DR. MONTY’S', '#f2e6c0', 320, 90, track), 0.78, 0.22, 0, 3.92, 0.09, track);
  decal(g, plateTex('GOBBLEGUM', track), 0.66, 0.17, 0, 2.96, 0.46, track);   // plate under globe collar
  decal(g, plateTex('GOBBLEGUM', track), 0.5, 0.13, 0, 1.5, 0.56, track);     // mid column plate
  decal(g, textTex('CHEW UNTIL YOU DIE!', '#e9dca8', 480, 130, track, 'italic 700 40px Georgia'), 0.74, 0.2, 0, 0.95, 0.6, track);
  // 5¢ coin slot
  add(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 24), darkMetal, 0, 0.5, 0.55, Math.PI / 2).rotation.set(Math.PI / 2, 0, 0);
  decal(g, textTex('5¢', '#d9d2c0', 90, 90, track, '700 60px Georgia'), 0.16, 0.16, 0, 0.5, 0.59, track);

  // recentre so the model pivots around its middle (camera frames it nicely)
  g.position.y = -2.05;

  g.userData.dispose = () => { for (const t of track) t.dispose?.(); };
  return g;
}

/** A heap of colorful gumballs resting in the lower half of the glass globe. */
function buildPile(globeY, globeR, track) {
  const grp = new THREE.Group();
  const palette = [0xff5db1, 0x3aa0ff, 0x37d36a, 0x9a5cff, 0xff8a28, 0xffd83a, 0xff5d5d, 0x2fd6c6, 0xffffff];
  const mats = palette.map((c) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.05 }); track.push(m); return m; });
  const r = 0.062;
  const geo = new THREE.SphereGeometry(r, 12, 10); track.push(geo);
  for (let i = 0; i < 90; i++) {
    // sample points inside the globe, biased to the bottom
    const rad = globeR - r - 0.02;
    let x, y, z;
    do {
      x = (Math.random() * 2 - 1) * rad;
      z = (Math.random() * 2 - 1) * rad;
      y = -rad + Math.random() * rad * 1.15; // bottom-weighted
    } while (x * x + y * y + z * z > rad * rad);
    const m = new THREE.Mesh(geo, mats[(Math.random() * mats.length) | 0]);
    m.position.set(x, globeY + y, z);
    grp.add(m);
  }
  return grp;
}

// --- canvas-text decals ----------------------------------------------------
function decal(parent, tex, w, h, x, y, z, track) {
  const geo = new THREE.PlaneGeometry(w, h); track.push(geo);
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  track.push(m);
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTex(c, track) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; track.push(t); return t; }

function textTex(text, color, w, h, track, font = '700 46px Oswald, Arial') {
  const c = makeCanvas(w, h); const ctx = c.getContext('2d');
  ctx.font = font;
  // shrink the font until the text fits the canvas width (with padding)
  let size = parseInt(font.match(/(\d+)px/)?.[1] || '40', 10);
  const maxW = w * 0.88;
  for (let guard = 0; guard < 40; guard++) {
    const m = (ctx.measureText(text) || { width: 0 }).width;
    if (m <= maxW || size <= 8) break;
    size -= 2; ctx.font = font.replace(/\d+px/, `${size}px`);
  }
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4;
  ctx.fillText(text, w / 2, h / 2 + 2);
  return toTex(c, track);
}

function plateTex(text, track) {
  const w = 340, h = 90; const c = makeCanvas(w, h); const ctx = c.getContext('2d');
  // brushed silver plate
  const grd = ctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#e8ecf0'); grd.addColorStop(0.5, '#aab2bb'); grd.addColorStop(1, '#7e868f');
  ctx.fillStyle = grd; roundRect(ctx, 4, 4, w - 8, h - 8, 12); ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = '#5a626b'; ctx.stroke();
  ctx.font = '700 40px Oswald, Arial'; ctx.fillStyle = '#1a1d22'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  return toTex(c, track);
}

function lionTex(track) {
  const s = 128; const c = makeCanvas(s, s); const ctx = c.getContext('2d');
  // simple silver lion-ish medallion face
  ctx.fillStyle = '#c2c8d0'; ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8b929b';
  for (let i = 0; i < 14; i++) { // mane spikes
    const a = (i / 14) * Math.PI * 2;
    ctx.beginPath(); ctx.arc(s / 2 + Math.cos(a) * s * 0.4, s / 2 + Math.sin(a) * s * 0.4, s * 0.08, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#3a3f47'; // eyes + nose
  ctx.beginPath(); ctx.arc(s * 0.4, s * 0.46, 5, 0, Math.PI * 2); ctx.arc(s * 0.6, s * 0.46, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c0202a'; ctx.beginPath(); ctx.arc(s * 0.5, s * 0.46, 4, 0, Math.PI * 2); ctx.fill(); // red eye nod to BO3
  ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.56); ctx.lineTo(s * 0.46, s * 0.64); ctx.lineTo(s * 0.54, s * 0.64); ctx.closePath();
  ctx.fillStyle = '#2a2e34'; ctx.fill();
  return toTex(c, track);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
