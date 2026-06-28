import * as THREE from 'three';

/**
 * "Dr. Monty's" gumball machine (BO3) — second-pass model, built to REAL scale so
 * it can drop into the world as a prop: ~1.7 m tall with the glass globe sitting
 * around the player's chest. Base sits on y = 0; userData.height reports the
 * total height so callers can place/centre it.
 *
 * Built from primitives + a couple of extruded silhouettes (the arched sign and
 * the clawed feet) + canvas-text decals — no external assets. Closer to the
 * in-game model than the first pass: a sculpted lion head on an arched plaque, a
 * chrome lid with a coin slot (no plate clipping the glass), Art-Deco corner
 * fins, marquee bulbs, a pull-handle and a 5¢ medallion.
 */
export function buildGumballMachine() {
  const g = new THREE.Group();
  const track = [];
  const mat = (o) => { const m = new THREE.MeshStandardMaterial(o); track.push(m); return m; };

  const redPaint = mat({ color: 0xb01c14, roughness: 0.36, metalness: 0.28 });
  const redDark  = mat({ color: 0x7c140e, roughness: 0.5, metalness: 0.2 });
  const chrome   = mat({ color: 0xccd1d8, roughness: 0.22, metalness: 0.95 });
  const chromeDk = mat({ color: 0x868d97, roughness: 0.34, metalness: 0.9 });
  const darkMetal = mat({ color: 0x24262c, roughness: 0.5, metalness: 0.7 });
  const glass    = mat({ color: 0xd6eef6, roughness: 0.03, metalness: 0.0, transparent: true, opacity: 0.13 });
  const lionMat  = mat({ color: 0xc4cad3, roughness: 0.26, metalness: 0.92 });
  const maneMat  = mat({ color: 0x9aa1ac, roughness: 0.4, metalness: 0.85 });
  const bulbMat  = mat({ color: 0xffc266, emissive: 0xff8a18, emissiveIntensity: 1.5, roughness: 0.3, metalness: 0.1 });
  const eyeMat   = mat({ color: 0xff4838, emissive: 0xff2a16, emissiveIntensity: 1.7, roughness: 0.3 });
  const knobMat  = mat({ color: 0xffd23a, emissive: 0xffae00, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.2 });

  const mesh = (geo, m, x = 0, y = 0, z = 0) => { track.push(geo); const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  // 4-sided prism, flat face toward +Z
  const prism = (rt, rb, h, m, y) => { const o = mesh(new THREE.CylinderGeometry(rt, rb, h, 4, 1), m, 0, y, 0); o.rotation.y = Math.PI / 4; return o; };
  const ring = (rt, rb, h, m, y, seg = 8) => { const o = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m, 0, y, 0); o.rotation.y = Math.PI / 8; return o; };

  // ====================================================================== feet
  const plinth = ring(0.27, 0.30, 0.05, darkMetal, 0.05);
  plinth.scale.set(1, 1, 1);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const fx = Math.cos(a) * 0.22, fz = Math.sin(a) * 0.22;
    // leg: tapered bar leaning outward to a clawed paw
    const leg = mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.16, 6), chromeDk, fx * 0.7, 0.1, fz * 0.7);
    leg.lookAt(fx * 1.6, -0.2, fz * 1.6);
    const paw = mesh(new THREE.SphereGeometry(0.055, 14, 10), chrome, fx, 0.03, fz);
    paw.scale.set(1.1, 0.55, 1.4); paw.rotation.y = a;
    for (let c = -1; c <= 1; c++) { // three claws
      const claw = mesh(new THREE.ConeGeometry(0.012, 0.05, 8), chrome, fx + Math.cos(a) * 0.05 + Math.cos(a + Math.PI / 2) * c * 0.022, 0.02, fz + Math.sin(a) * 0.05 + Math.sin(a + Math.PI / 2) * c * 0.022);
      claw.rotation.set(Math.PI / 2, 0, 0); claw.lookAt(fx * 2, -0.1, fz * 2);
    }
  }

  // ==================================================================== column
  prism(0.21, 0.235, 0.70, redPaint, 0.45);          // main tapered red column
  prism(0.236, 0.236, 0.05, chromeDk, 0.12);          // base trim
  // Art-Deco chrome corner fins running the column height
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2; // corners (flat faces at 45°)
    const fin = mesh(new THREE.BoxGeometry(0.03, 0.7, 0.06), chrome, Math.cos(a) * 0.205, 0.45, Math.sin(a) * 0.205);
    fin.rotation.y = a;
    // marquee bulbs down each corner fin
    for (let b = 0; b < 3; b++) mesh(new THREE.SphereGeometry(0.022, 12, 10), bulbMat, Math.cos(a) * 0.225, 0.24 + b * 0.18, Math.sin(a) * 0.225);
  }

  // front details (front face is +Z; flat face sits at z ≈ 0.205 → 0.165 at top taper)
  const fz = 0.2;
  mesh(new THREE.BoxGeometry(0.16, 0.05, 0.03), chrome, 0, 0.66, fz);                 // coin-return slot housing
  mesh(new THREE.BoxGeometry(0.11, 0.02, 0.02), darkMetal, 0, 0.66, fz + 0.012);       // its dark slit
  decal(g, textTex('CHEW UNTIL', '#efe2b0', 280, 90, track, 'italic 700 56px Georgia'), 0.2, 0.064, 0, 0.55, fz + 0.005, track);
  decal(g, textTex('YOU DIE!', '#efe2b0', 280, 90, track, 'italic 700 56px Georgia'), 0.17, 0.064, 0, 0.49, fz + 0.005, track);
  // 5¢ medallion (rim + face)
  const coin = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 28), chrome, 0, 0.4, fz - 0.002); coin.rotation.x = Math.PI / 2;
  decal(g, textTex('5¢', '#1a1d22', 90, 90, track, '700 58px Georgia'), 0.06, 0.06, 0, 0.4, fz + 0.012, track);
  // pull-handle below the coin
  mesh(new THREE.BoxGeometry(0.05, 0.18, 0.04), chromeDk, 0, 0.27, fz);
  mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 16), chrome, 0, 0.35, fz + 0.01).rotation.x = Math.PI / 2;

  // ============================================================== globe + tray
  // stepped chrome shelf the globe rests in
  ring(0.205, 0.205, 0.025, chrome, 0.795, 4);
  ring(0.18, 0.205, 0.03, chromeDk, 0.815, 8);
  ring(0.15, 0.175, 0.03, chrome, 0.84, 16);
  const globeY = 1.08, globeR = 0.2;
  mesh(new THREE.SphereGeometry(globeR, 40, 30), glass, 0, globeY, 0);
  mesh(new THREE.TorusGeometry(0.135, 0.018, 12, 24), chrome, 0, 0.86, 0).rotation.x = Math.PI / 2; // collar at globe base
  g.add(buildPile(globeY, globeR, track));

  // ====================================================================== lid
  // chrome lid capping the globe, with a horizontal coin slot (no glass-clipping plate)
  ring(0.085, 0.12, 0.06, chrome, 1.27, 20);
  ring(0.1, 0.085, 0.03, chromeDk, 1.31, 20);
  mesh(new THREE.BoxGeometry(0.09, 0.016, 0.03), darkMetal, 0, 1.29, 0.1);              // slot
  mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.05, 16), redPaint, 0, 1.345, 0);        // sign mount neck

  // ===================================================================== sign
  const signY = 1.55;
  const signShape = archedPlaque(0.34, 0.36, 0.12);
  const signGeo = new THREE.ExtrudeGeometry(signShape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 });
  track.push(signGeo);
  const frameGeo = new THREE.ExtrudeGeometry(archedPlaque(0.38, 0.4, 0.13), { depth: 0.04, bevelEnabled: false });
  track.push(frameGeo);
  const frame = new THREE.Mesh(frameGeo, chrome); frame.position.set(0, signY - 0.02, -0.05); g.add(frame);
  const sign = new THREE.Mesh(signGeo, redPaint); sign.position.set(0, signY, 0); g.add(sign);
  decal(g, textTex('DR. MONTY’S', '#f4ead0', 360, 90, track, '700 60px Oswald, Arial'), 0.28, 0.07, 0, signY + 0.12, 0.058, track);

  // sculpted lion head protruding from the plaque
  g.add(buildLion(lionMat, maneMat, eyeMat, darkMetal, track, 0, signY - 0.03, 0.085));

  // glowing knob lamp seated on the apex of the sign
  mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.05, 16), chrome, 0, signY + 0.18, 0.03);
  mesh(new THREE.SphereGeometry(0.045, 20, 16), knobMat, 0, signY + 0.23, 0.03);

  g.userData.height = signY + 0.29;    // ~1.85 m to the top of the lamp
  g.userData.dispose = () => { for (const t of track) t.dispose?.(); };
  return g;
}

/** A heap of gumballs resting in the lower third of the glass globe. */
function buildPile(globeY, globeR, track) {
  const grp = new THREE.Group();
  const palette = [0xff5db1, 0x3aa0ff, 0x37d36a, 0x9a5cff, 0xff8a28, 0xffd83a, 0xff5d5d, 0x2fd6c6, 0xffffff];
  const mats = palette.map((c) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.05 }); track.push(m); return m; });
  const r = 0.021;
  const geo = new THREE.SphereGeometry(r, 12, 10); track.push(geo);
  for (let i = 0; i < 80; i++) {
    const rad = globeR - r - 0.006;
    let x, y, z;
    do { x = (Math.random() * 2 - 1) * rad; z = (Math.random() * 2 - 1) * rad; y = -rad + Math.random() * rad * 1.0; }
    while (x * x + y * y + z * z > rad * rad);
    const m = new THREE.Mesh(geo, mats[(Math.random() * mats.length) | 0]);
    m.position.set(x, globeY + y, z);
    grp.add(m);
  }
  return grp;
}

/** A forward-facing sculpted lion head built from primitives (silver, BO3-style). */
function buildLion(silver, mane, eye, dark, track, x, y, z) {
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  const add = (geo, material, px, py, pz, sx, sy, sz) => {
    track.push(geo); const o = new THREE.Mesh(geo, material);
    o.position.set(px, py, pz); if (sx != null) o.scale.set(sx, sy, sz); grp.add(o); return o;
  };

  // mane: two rings of rounded lumps massed around the face (not spikes)
  const lump = new THREE.SphereGeometry(0.033, 12, 10); track.push(lump);
  for (let i = 0; i < 15; i++) { const a = (i / 15) * Math.PI * 2; const o = new THREE.Mesh(lump, mane); o.position.set(Math.cos(a) * 0.084, Math.sin(a) * 0.084, -0.012); grp.add(o); }
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + 0.3; const o = new THREE.Mesh(lump, mane); o.position.set(Math.cos(a) * 0.056, Math.sin(a) * 0.056, 0.012); o.scale.setScalar(0.82); grp.add(o); }

  // face + muzzle (clearly in front of the mane)
  add(new THREE.SphereGeometry(0.06, 20, 16), silver, 0, 0.002, 0.035, 1.05, 0.98, 0.8);
  add(new THREE.SphereGeometry(0.036, 16, 12), silver, 0, -0.022, 0.062, 1.2, 0.92, 1);     // muzzle
  add(new THREE.SphereGeometry(0.02, 12, 10), silver, -0.026, 0.028, 0.052);                 // brow ridges
  add(new THREE.SphereGeometry(0.02, 12, 10), silver, 0.026, 0.028, 0.052);
  // ears
  add(new THREE.SphereGeometry(0.016, 10, 8), silver, -0.052, 0.052, 0.018, 1, 1.2, 1);
  add(new THREE.SphereGeometry(0.016, 10, 8), silver, 0.052, 0.052, 0.018, 1, 1.2, 1);
  // glowing red eyes + dark nose
  add(new THREE.SphereGeometry(0.0105, 10, 8), eye, -0.023, 0.014, 0.082);
  add(new THREE.SphereGeometry(0.0105, 10, 8), eye, 0.023, 0.014, 0.082);
  add(new THREE.SphereGeometry(0.014, 10, 8), dark, 0, -0.012, 0.092, 1.3, 0.8, 1);            // nose
  return grp;
}

/** A rounded-top "shield" plaque outline (centred on x, rising from y=0). */
function archedPlaque(w, h, r) {
  const s = new THREE.Shape();
  const hw = w / 2;
  s.moveTo(-hw, -h / 2);
  s.lineTo(-hw, h / 2 - r);
  s.quadraticCurveTo(-hw, h / 2, -hw + r, h / 2);
  s.lineTo(hw - r, h / 2);
  s.quadraticCurveTo(hw, h / 2, hw, h / 2 - r);
  s.lineTo(hw, -h / 2);
  s.closePath();
  return s;
}

// --- canvas-text decals ----------------------------------------------------
function decal(parent, tex, w, h, x, y, z, track) {
  const geo = new THREE.PlaneGeometry(w, h); track.push(geo);
  const mt = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  track.push(mt);
  const mesh = new THREE.Mesh(geo, mt); mesh.position.set(x, y, z); parent.add(mesh);
  return mesh;
}
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTex(c, track) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; track.push(t); return t; }

function textTex(text, color, w, h, track, font = '700 46px Oswald, Arial') {
  const c = makeCanvas(w, h); const ctx = c.getContext('2d');
  ctx.font = font;
  let size = parseInt(font.match(/(\d+)px/)?.[1] || '40', 10);
  const maxW = w * 0.9;
  for (let i = 0; i < 40; i++) { const m = (ctx.measureText(text) || { width: 0 }).width; if (m <= maxW || size <= 8) break; size -= 2; ctx.font = font.replace(/\d+px/, `${size}px`); }
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 4;
  ctx.fillText(text, w / 2, h / 2 + 2);
  return toTex(c, track);
}
