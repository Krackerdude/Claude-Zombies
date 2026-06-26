import * as THREE from 'three';

/**
 * World models for the tacticals: the cymbal monkey, and Lil' Arnie's jar +
 * mutated parasite. Kept here so the TacticalSystem stays about behaviour and
 * the Viewmodel can share the same look for the held versions.
 */

// sickly green/yellow ooze — used for Arnie's drool droplets and ground puddle
export function oozeMaterial(opacity = 0.85) {
  return new THREE.MeshStandardMaterial({
    color: 0x9bbf2e, emissive: 0x4a6b10, emissiveIntensity: 0.5,
    roughness: 0.3, metalness: 0.0, transparent: true, opacity, depthWrite: false,
  });
}

// --- cymbal monkey ------------------------------------------------------------
let _M = null;
function monkeyParts() {
  if (_M) return _M;
  _M = {
    fur: new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 0.85 }),
    face: new THREE.MeshStandardMaterial({ color: 0xb9966c, roughness: 0.7 }),
    fez: new THREE.MeshStandardMaterial({ color: 0x2a3d8f, roughness: 0.6 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x6b6f55, roughness: 0.8 }),
    cymbal: new THREE.MeshStandardMaterial({ color: 0xb98a2e, metalness: 0.8, roughness: 0.35 }),
    tnt: new THREE.MeshStandardMaterial({ color: 0x7a1c14, roughness: 0.7 }),
    eye: new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xc00000, emissiveIntensity: 1.4 }),
  };
  return _M;
}
export function buildMonkeyModel() {
  const P = monkeyParts();
  const g = new THREE.Group();
  const mesh = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };

  mesh(new THREE.BoxGeometry(0.26, 0.24, 0.2), P.fur, 0, 0.05, 0);          // torso
  mesh(new THREE.SphereGeometry(0.13, 12, 10), P.fur, 0, 0.27, 0);          // head
  mesh(new THREE.SphereGeometry(0.085, 10, 8), P.face, 0, 0.25, 0.07);      // muzzle
  mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.1, 12), P.fez, 0, 0.39, 0);// fez
  mesh(new THREE.SphereGeometry(0.022, 8, 6), P.eye, -0.045, 0.29, 0.105);
  mesh(new THREE.SphereGeometry(0.022, 8, 6), P.eye, 0.045, 0.29, 0.105);
  mesh(new THREE.BoxGeometry(0.28, 0.08, 0.22), P.cloth, 0, -0.06, 0.01);   // vest/legs
  for (let i = -1; i <= 1; i++) mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 8), P.tnt, i * 0.05, 0.06, -0.13);

  const arm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.13, 0.08, 0.06);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.16), P.fur);
    upper.position.set(side * -0.04, 0, 0.06); pivot.add(upper);
    const cym = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.015, 16), P.cymbal);
    cym.rotation.x = Math.PI / 2; cym.position.set(side * -0.07, 0, 0.13); pivot.add(cym);
    pivot.rotation.z = side * 0.5;
    g.add(pivot);
    return pivot;
  };
  g.userData.armL = arm(-1);
  g.userData.armR = arm(1);
  return g;
}

// --- lil' arnie: jar + mutating parasite -------------------------------------
let _A = null;
function arnieParts() {
  if (_A) return _A;
  _A = {
    // gross sickly flesh with a wet sheen (low roughness + a touch of spec)
    skin: new THREE.MeshStandardMaterial({ color: 0x6f6d49, roughness: 0.2, metalness: 0.15 }),
    skin2: new THREE.MeshStandardMaterial({ color: 0x4c4d32, roughness: 0.22, metalness: 0.12 }), // mottled darker patches
    sclera: new THREE.MeshStandardMaterial({ color: 0xcfc858, emissive: 0x6a6a18, emissiveIntensity: 0.7, roughness: 0.12, metalness: 0.1 }),
    pupil: new THREE.MeshStandardMaterial({ color: 0x0c0c06, roughness: 0.25 }),
    maw: new THREE.MeshStandardMaterial({ color: 0x140e08, roughness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xbfeede, transparent: true, opacity: 0.32, roughness: 0.1, metalness: 0.0 }),
    brass: new THREE.MeshStandardMaterial({ color: 0x9a7b34, metalness: 0.7, roughness: 0.4 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.85 }),
    fluid: new THREE.MeshStandardMaterial({ color: 0x7fd6c0, emissive: 0x1c5a4a, emissiveIntensity: 0.4, transparent: true, opacity: 0.4, roughness: 0.2 }),
  };
  return _A;
}

/** An eye: a sickly sclera with a pupil pushed out along its outward normal. A
 *  `slit` eye gets a tall vertical slit pupil (the big central one). */
function addEye(parent, x, y, z, r, P, slit = false) {
  const sclera = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), P.sclera);
  sclera.position.set(x, y, z); parent.add(sclera);
  // outward normal (radial from the body's vertical axis, biased forward)
  const nx = x, ny = (y - 0.7) * 0.4, nz = z + 0.12;
  const nl = Math.hypot(nx, ny, nz) || 1;
  const pup = new THREE.Mesh(new THREE.SphereGeometry(r * 0.46, 8, 8), P.pupil);
  if (slit) pup.scale.set(0.4, 1.25, 0.6); // vertical reptilian slit
  pup.position.set(x + (nx / nl) * r * 0.72, y + (ny / nl) * r * 0.72, z + (nz / nl) * r * 0.72);
  parent.add(pup);
  return sclera;
}

/** A CURVED tentacle: a chain of tapering segments, each on a pivot bent a
 *  little past the last so the whole thing arcs like a horn (no loose straight
 *  sticks). The base is thick so it fuses into the body. Spine nubs run its
 *  length. Returns the root pivot; `userData.mid` is the first joint (its bend
 *  stashed on `userData.base`) for the secondary flail. */
function buildTentacle(P, len, rad = 0.09, segs = 5, bend = 0.26) {
  const root = new THREE.Group();
  const segLen = len / segs;
  let parent = root, mid = null;
  for (let i = 0; i < segs; i++) {
    const r0 = rad * (1 - (i / segs) * 0.78);
    const r1 = rad * (1 - ((i + 1) / segs) * 0.78);
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, segLen * 1.04, 8), P.skin);
    seg.position.y = segLen / 2; parent.add(seg);
    if (i < segs - 1) { // spine nub on the outer edge of each joint
      const sp = new THREE.Mesh(new THREE.ConeGeometry(r0 * 0.45, r0 * 1.5, 5), P.skin2);
      sp.position.set(r0 * 0.75, segLen * 0.7, 0); sp.rotation.z = -Math.PI / 2.2; parent.add(sp);
    }
    const next = new THREE.Group();
    next.position.y = segLen; next.rotation.x = bend; // arc forward a touch each joint
    next.userData.base = bend;
    parent.add(next);
    if (i === 0) mid = next;
    parent = next;
  }
  const tip = new THREE.Mesh(new THREE.SphereGeometry(rad * 0.22, 6, 5), P.skin2); parent.add(tip);
  root.userData.mid = mid;
  return root;
}

/** The jar as thrown. userData carries the glass shell (hidden on shatter), the
 *  parasite subgroup (revealed + grown), its tentacle pivots, body, and the
 *  mouth anchor for the ooze emitter. */
export function buildArnieJar() {
  const P = arnieParts();
  const g = new THREE.Group();
  const glass = [];

  // --- parasite: an eldritch horror (hidden until the jar shatters) ---
  // NOT a sphere: a tapered, ridged vertical mass (a fanged "face" wedge under a
  // pointed crest) squatting on clawed feet, with a maw at the crown that splits
  // into three thick CURVED horn-tentacles. One great central eye, lesser eyes
  // clustered over it. Origin at the feet, rises ~1.5.
  const parasite = new THREE.Group();
  parasite.visible = false;
  parasite.scale.setScalar(0.16);

  // lower "face" — a broad wedge (wide, shallow, chin tapering down/forward)
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 14), P.skin);
  face.scale.set(1.15, 1.0, 0.82); face.position.set(0, 0.62, 0.04); parasite.add(face);
  const chin = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.5, 10), P.skin);
  chin.scale.set(1.1, 1, 0.7); chin.position.set(0, 0.34, 0.16); chin.rotation.x = Math.PI; parasite.add(chin); // points down-forward
  // central crest spike rising between the tentacles (the arrowhead ridge)
  const crest = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.95, 8), P.skin);
  crest.scale.set(0.9, 1, 0.65); crest.position.set(0, 1.12, -0.04); parasite.add(crest);
  for (const sx of [-1, 1]) { // flanking ridge spikes -> horned-skull crown
    const sr = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.62, 7), P.skin2);
    sr.position.set(sx * 0.26, 1.0, -0.1); sr.rotation.z = sx * 0.5; parasite.add(sr);
  }
  // a couple of fleshy lumps to keep it misshapen (not a smooth solid)
  for (const L of [[0.26, 0.66, 0.26, 0.2], [-0.28, 0.6, 0.24, 0.18], [0, 0.42, 0.34, 0.22]]) {
    const lump = new THREE.Mesh(new THREE.SphereGeometry(L[3], 10, 9), P.skin2);
    lump.position.set(L[0], L[1], L[2]); lump.scale.set(1, 0.8, 0.85); parasite.add(lump);
  }
  // clawed feet splayed at the base
  for (let k = 0; k < 3; k++) {
    const a = (-0.6 + k * 0.6);
    const foot = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.34, 6), P.skin);
    foot.position.set(Math.sin(a) * 0.28, 0.08, 0.22 + Math.cos(a) * 0.04);
    foot.rotation.set(1.9, 0, -Math.sin(a) * 0.5); parasite.add(foot); // claw splayed forward
  }

  // THE great central eye (vertical slit), with two larger eyes flanking below
  addEye(parasite, 0, 0.74, 0.4, 0.22, P, true);
  addEye(parasite, -0.24, 0.56, 0.34, 0.15, P);
  addEye(parasite, 0.24, 0.56, 0.34, 0.15, P);
  // subsets of smaller eyes clustered over the face/crest/flanks
  const EYES = [
    [-0.34, 0.78, 0.18, 0.08], [0.36, 0.8, 0.16, 0.085], [-0.12, 0.92, 0.26, 0.07],
    [0.14, 0.94, 0.24, 0.065], [-0.4, 0.62, 0.06, 0.07], [0.42, 0.6, 0.05, 0.06],
    [0.0, 1.06, 0.16, 0.06], [-0.2, 1.2, 0.02, 0.05], [0.22, 1.18, 0.0, 0.05],
    [-0.16, 0.42, 0.32, 0.055], [0.18, 0.4, 0.32, 0.05],
  ];
  for (const e of EYES) addEye(parasite, e[0], e[1], e[2], e[3], P);

  // crown maw: the dark gaping opening at the apex the tentacles split from,
  // ringed by a fleshy lip; the ooze shoots from here
  const maw = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), P.maw);
  maw.scale.set(1.1, 0.7, 1); maw.position.set(0, 1.34, 0.06); parasite.add(maw);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.05, 8, 14), P.skin2);
  lip.rotation.x = Math.PI / 2; lip.position.set(0, 1.36, 0.06); parasite.add(lip);
  const mouth = new THREE.Object3D(); mouth.position.set(0, 1.4, 0.1); parasite.add(mouth);

  // three thick CURVED horn-tentacles splitting up/out from the crown, their
  // fat bases sunk into the crest so they read as fused; + lesser writhers
  const tentacles = [];
  const crown = [[-0.7, 0.9], [0.7, 0.9], [0.0, 1.0]]; // [side-aim, length] — two wide, one rearing back
  for (let k = 0; k < crown.length; k++) {
    const aim = crown[k][0];
    const ten = buildTentacle(P, crown[k][1], 0.12, 5, 0.3);
    ten.position.set(Math.sin(aim) * 0.16, 1.18, -0.04);
    ten.userData.baseX = -0.5;            // lean up from vertical
    ten.userData.baseZ = aim * 0.7;       // splay to its side
    ten.rotation.set(ten.userData.baseX, 0, ten.userData.baseZ);
    parasite.add(ten); tentacles.push(ten);
  }
  for (let k = 0; k < 3; k++) {           // shorter writhers off the upper flanks
    const a = (k / 3) * Math.PI * 2 + 0.5;
    const ten = buildTentacle(P, 0.5, 0.06, 4, 0.3);
    ten.position.set(Math.cos(a) * 0.36, 0.86, Math.sin(a) * 0.28 - 0.02);
    ten.userData.baseX = -0.1 + Math.sin(a) * 0.4;
    ten.userData.baseZ = Math.cos(a) * 0.7;
    ten.rotation.set(ten.userData.baseX, a, ten.userData.baseZ);
    parasite.add(ten); tentacles.push(ten);
  }
  g.add(parasite);

  // --- the jar shell (small, around where the parasite seed sits) ---
  const jarH = 0.34, jarR = 0.17;
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(jarR, jarR, jarH, 16, 1, true), P.glass);
  cyl.position.y = jarH / 2 + 0.02; glass.push(cyl);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(jarR, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), P.glass);
  dome.position.y = jarH + 0.02; glass.push(dome);
  const fluid = new THREE.Mesh(new THREE.CylinderGeometry(jarR * 0.92, jarR * 0.92, jarH * 0.8, 16), P.fluid);
  fluid.position.y = jarH * 0.45 + 0.02; glass.push(fluid);
  // a little curled parasite seed visible inside the fluid before it bursts —
  // same sickly flesh + a single beady slit eye and a couple of nub tentacles
  const seed = new THREE.Group();
  const sbody = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), P.skin);
  sbody.scale.set(1, 0.85, 1.2); seed.add(sbody);
  addEye(seed, 0, 0.02, 0.07, 0.04, P, true);
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.006, 0.09, 6), P.skin);
    t.position.set((i - 1) * 0.03, -0.05, -0.02); t.rotation.x = 0.7 + i * 0.2; seed.add(t);
  }
  seed.position.y = jarH * 0.4 + 0.02; glass.push(seed);
  // brass lid + wood slats (the SoE jar)
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(jarR + 0.015, jarR + 0.015, 0.05, 16), P.brass);
  lid.position.y = jarH + 0.05; glass.push(lid);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.025, jarH + 0.04, 0.025), P.wood);
    slat.position.set(Math.cos(a) * jarR, jarH / 2 + 0.02, Math.sin(a) * jarR); glass.push(slat);
  }
  for (const m of glass) g.add(m);

  g.userData = { glass, parasite, tentacles, mouth };
  return g;
}

// --- the homunculus: a tribal gremlin with a spiked bone mask + spiked club ---
let _G = null;
function homuncParts() {
  if (_G) return _G;
  _G = {
    skin: new THREE.MeshStandardMaterial({ color: 0xb59164, roughness: 0.62 }),     // sickly tan flesh
    bone: new THREE.MeshStandardMaterial({ color: 0xe7dcbf, roughness: 0.6 }),        // pale skull mask
    spike: new THREE.MeshStandardMaterial({ color: 0x6f4d2c, roughness: 0.7 }),       // bone/wood spikes
    cloth: new THREE.MeshStandardMaterial({ color: 0x4f5a68, roughness: 0.88 }),      // ragged loincloth
    bead: new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.55, metalness: 0.2 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.82 }),       // club shaft
    eye: new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xc01010, emissiveIntensity: 1.5, roughness: 0.3 }),
    blood: new THREE.MeshStandardMaterial({ color: 0x6a1410, roughness: 0.5 }),
  };
  return _G;
}

/** Build the spiked club, returned as a group whose handle sits at the origin so
 *  it can be parented into a hand. The head + spikes are out along -y. */
function buildClub(P) {
  const club = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.46, 8), P.wood);
  shaft.position.y = -0.23; club.add(shaft);
  const headY = -0.5;
  const cbHead = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.2, 9), P.wood);
  cbHead.position.y = headY; club.add(cbHead);
  // ring of spikes bristling out of the club head
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.13, 6), P.spike);
    sp.position.set(Math.cos(a) * 0.085, headY + (k % 2) * 0.05 - 0.02, Math.sin(a) * 0.085);
    sp.rotation.z = -a + Math.PI / 2; sp.rotation.x = Math.sin(a) * 0.0; // point radially out
    sp.lookAt(Math.cos(a) * 1, headY, Math.sin(a) * 1);
    club.add(sp);
  }
  const tipSp = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 6), P.spike);
  tipSp.position.y = headY - 0.16; club.add(tipSp);
  return club;
}

/** A small hunched tribal gremlin. userData exposes the limb pivots (armL/armR,
 *  legL/legR, head) for the throw-flail + ground club-swing animations. */
export function buildHomunculus() {
  const P = homuncParts();
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z) => { const me = new THREE.Mesh(geo, mat); me.position.set(x, y, z); g.add(me); return me; };

  // legs (short, slightly bowed) on pivots
  const legPivot = (sx) => {
    const p = new THREE.Group(); p.position.set(sx * 0.1, 0.44, 0);
    const th = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.34, 7), P.skin); th.position.y = -0.17; p.add(th);
    const kn = new THREE.Group(); kn.position.y = -0.34; p.add(kn);
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.32, 7), P.skin); sh.position.y = -0.16; kn.add(sh);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.2), P.skin); foot.position.set(0, -0.33, 0.05); kn.add(foot);
    for (let i = -1; i <= 1; i++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.06, 5), P.bone); claw.position.set(i * 0.03, -0.34, 0.15); claw.rotation.x = 1.7; kn.add(claw); }
    g.add(p); return p;
  };
  const legL = legPivot(-1), legR = legPivot(1);

  // pelvis + hunched torso
  add(new THREE.BoxGeometry(0.24, 0.14, 0.16), P.skin, 0, 0.46, 0);
  add(new THREE.BoxGeometry(0.32, 0.36, 0.22), P.skin, 0, 0.68, -0.01); // barrel chest
  add(new THREE.SphereGeometry(0.13, 10, 8), P.skin, 0, 0.58, 0.08);    // pot belly
  // ragged loincloth strips
  for (let i = 0; i < 5; i++) { const s = add(new THREE.BoxGeometry(0.055, 0.28, 0.02), P.cloth, -0.11 + i * 0.055, 0.34, 0.11); s.rotation.x = 0.1; }
  // belt + bead necklace
  add(new THREE.BoxGeometry(0.34, 0.06, 0.24), P.bead, 0, 0.5, 0);
  for (let i = 0; i < 7; i++) { const a = -0.6 + i * 0.2; add(new THREE.SphereGeometry(0.026, 7, 6), P.bead, Math.sin(a) * 0.13, 0.84, Math.cos(a) * 0.02 + 0.1); }

  // --- head with the spiked bone mask ---
  const head = new THREE.Group(); head.position.set(0, 0.96, 0); g.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), P.skin)); // face/skin under the mask
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.145, 12, 10), P.bone);
  skull.scale.set(1, 1.08, 0.92); skull.position.set(0, 0.05, 0.0); head.add(skull); // pale skull crown
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.1), P.bone); brow.position.set(0, 0.04, 0.1); head.add(brow);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 7), P.bone); beak.position.set(0, -0.02, 0.14); beak.rotation.x = 1.9; head.add(beak); // hooked beak/nose
  // single glaring red eye (+ a smaller one)
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), P.eye); e1.position.set(0.07, 0.0, 0.12); head.add(e1);
  const e2 = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 7), P.eye); e2.position.set(-0.075, -0.01, 0.11); head.add(e2);
  // spike halo: a ring of bone/wood spikes radiating from behind the head
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2;
    const L = 0.2 + (k % 3) * 0.1;
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.012, L, 5), P.spike);
    const r = 0.13 + L * 0.5;
    sp.position.set(Math.cos(a) * r, 0.04 + Math.sin(a) * r, -0.05);
    sp.rotation.z = a - Math.PI / 2; // apex points radially outward
    head.add(sp);
  }

  // --- arms on shoulder pivots; the right hand grips the club ---
  const armPivot = (sx) => {
    const p = new THREE.Group(); p.position.set(sx * 0.18, 0.8, 0);
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.04, 0.26, 7), P.skin); up.position.y = -0.13; p.add(up);
    const el = new THREE.Group(); el.position.y = -0.26; p.add(el);
    const fo = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.24, 7), P.skin); fo.position.y = -0.12; el.add(fo);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 7), P.skin); hand.position.y = -0.24; el.add(hand);
    p.userData.el = el;
    g.add(p); return p;
  };
  const armL = armPivot(-1);
  const armR = armPivot(1);
  // club gripped in the right hand, blade/head pointing down past the fist
  const club = buildClub(P);
  club.position.y = -0.24; club.rotation.x = 0.5;
  armR.userData.el.add(club);
  // resting poses: club arm cocked up a touch, left arm hanging
  armR.rotation.set(-0.6, 0, -0.25);
  armL.rotation.set(-0.2, 0, 0.3);

  g.userData = { head, armL, armR, legL, legR, club };
  return g;
}
