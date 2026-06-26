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

/** A tentacle: an upper segment on a pivot + a mid segment on its own tip pivot,
 *  so it whips in two joints. A couple of small spines give the eldritch look.
 *  Returns the root pivot, with the mid pivot stashed on userData for flailing. */
function buildTentacle(P, len, rad = 0.06) {
  const root = new THREE.Group();
  const seg = (l, r0, r1) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, l, 7), P.skin);
  const up = seg(len, rad, rad * 0.72); up.position.y = len / 2; root.add(up);
  for (let i = 0; i < 2; i++) { // spine nubs
    const sp = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.4, rad * 1.3, 5), P.skin2);
    sp.position.set(rad * 0.8, len * (0.3 + i * 0.35), 0); sp.rotation.z = -Math.PI / 2; root.add(sp);
  }
  const mid = new THREE.Group(); mid.position.y = len; root.add(mid);
  const lo = seg(len * 0.85, rad * 0.72, rad * 0.3); lo.position.y = (len * 0.85) / 2; mid.add(lo);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(rad * 0.4, 6, 5), P.skin2); tip.position.y = len * 0.85; mid.add(tip);
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
  // a wet bulbous mass with ONE great central eye, clusters of lesser eyes all
  // over it, and a maw at the crown that splits into three ooze-spewing
  // tentacles. Origin at the feet, rises ~1.4.
  const parasite = new THREE.Group();
  parasite.visible = false;
  parasite.scale.setScalar(0.16);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 14), P.skin);
  body.scale.set(1.05, 1.25, 1.0); body.position.y = 0.7; parasite.add(body);
  // irregular fleshy lumps so it's a misshapen mass, not a smooth egg
  for (const L of [[0.3, 0.55, 0.34, 0.26], [-0.34, 0.62, 0.28, 0.24], [0.0, 0.34, 0.4, 0.3], [-0.26, 0.95, -0.3, 0.22], [0.32, 1.0, -0.24, 0.2]]) {
    const lump = new THREE.Mesh(new THREE.SphereGeometry(L[3], 10, 9), Math.random() < 0.5 ? P.skin : P.skin2);
    lump.position.set(L[0], L[1], L[2]); lump.scale.set(1, 0.85, 0.9); parasite.add(lump);
  }

  // THE great central eye, front-and-centre, with a vertical slit
  addEye(parasite, 0, 0.82, 0.46, 0.27, P, true);
  // subsets of smaller eyes scattered all over the body/sides
  const EYES = [
    [-0.34, 1.06, 0.26, 0.1], [0.36, 1.02, 0.22, 0.11], [-0.18, 1.2, 0.18, 0.07],
    [0.2, 1.24, 0.12, 0.06], [-0.42, 0.78, 0.12, 0.09], [0.44, 0.72, 0.1, 0.08],
    [-0.3, 0.5, 0.32, 0.07], [0.28, 0.46, 0.34, 0.075], [0.0, 0.5, 0.5, 0.06],
    [-0.48, 0.95, -0.18, 0.07], [0.46, 0.9, -0.22, 0.065], [0.12, 1.32, -0.05, 0.055],
  ];
  for (const e of EYES) addEye(parasite, e[0], e[1], e[2], e[3], P);

  // crown maw: a dark gaping opening at the top, ringed by a fleshy lip; the
  // three tentacles erupt from it and the ooze shoots from here
  const maw = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), P.maw);
  maw.scale.set(1, 0.8, 1); maw.position.set(0, 1.28, 0.04); parasite.add(maw);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 8, 14), P.skin2);
  lip.rotation.x = Math.PI / 2; lip.position.set(0, 1.3, 0.04); parasite.add(lip);
  const mouth = new THREE.Object3D(); mouth.position.set(0, 1.34, 0.06); parasite.add(mouth);

  // the three crown tentacles splitting up out of the maw, + lesser writhers
  const tentacles = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 - Math.PI / 2;
    const ten = buildTentacle(P, 0.8, 0.09);
    ten.position.set(Math.cos(a) * 0.08, 1.3, Math.sin(a) * 0.08);
    ten.userData.baseX = -0.55; ten.userData.baseZ = 0; // lean up/out from vertical
    ten.rotation.set(ten.userData.baseX, a, ten.userData.baseZ);
    parasite.add(ten); tentacles.push(ten);
  }
  for (let k = 0; k < 4; k++) {            // smaller writhing tentacles round the mass
    const a = (k / 4) * Math.PI * 2 + 0.6;
    const ten = buildTentacle(P, 0.42, 0.05);
    ten.position.set(Math.cos(a) * 0.42, 0.6 + (k % 2) * 0.18, Math.sin(a) * 0.34);
    ten.userData.baseX = -0.2 + Math.sin(a) * 0.4;
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

  g.userData = { glass, parasite, tentacles, body, mouth };
  return g;
}
