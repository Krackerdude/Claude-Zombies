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
    skin: new THREE.MeshStandardMaterial({ color: 0x6fae3a, roughness: 0.55, metalness: 0.0 }),
    belly: new THREE.MeshStandardMaterial({ color: 0xa7c96b, roughness: 0.5 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x3d6b25, roughness: 0.6 }),
    eye: new THREE.MeshStandardMaterial({ color: 0xd8e85a, emissive: 0x8a9a20, emissiveIntensity: 0.8, roughness: 0.3 }),
    pupil: new THREE.MeshStandardMaterial({ color: 0x101808, roughness: 0.4 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xbfeede, transparent: true, opacity: 0.32, roughness: 0.1, metalness: 0.0 }),
    brass: new THREE.MeshStandardMaterial({ color: 0x9a7b34, metalness: 0.7, roughness: 0.4 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.85 }),
    fluid: new THREE.MeshStandardMaterial({ color: 0x7fd6c0, emissive: 0x1c5a4a, emissiveIntensity: 0.4, transparent: true, opacity: 0.4, roughness: 0.2 }),
  };
  return _A;
}

/** A tentacle: an upper segment on a pivot, plus a mid segment on its own pivot
 *  at the tip, so it can whip in two joints. Returns the root pivot, with the
 *  mid pivot stashed on userData for the flail animation. */
function buildTentacle(P, len) {
  const root = new THREE.Group();
  const seg = (l, r0, r1) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, l, 7), P.skin);
  const up = seg(len, 0.06, 0.045); up.position.y = len / 2; root.add(up);
  const mid = new THREE.Group(); mid.position.y = len; root.add(mid);
  const lo = seg(len * 0.85, 0.045, 0.02); lo.position.y = (len * 0.85) / 2; mid.add(lo);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), P.dark); tip.position.y = len * 0.85; mid.add(tip);
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

  // --- parasite (hidden until the jar shatters) ---
  const parasite = new THREE.Group();
  parasite.visible = false;
  parasite.scale.setScalar(0.16);
  // bulbous body (origin at the feet, rises ~1.4)
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), P.skin);
  body.scale.set(1, 1.35, 0.95); body.position.y = 0.72; parasite.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), P.belly);
  belly.scale.set(1, 1.1, 0.7); belly.position.set(0, 0.6, 0.28); parasite.add(belly);
  // big bulging eyes + dark pupils, front upper
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), P.eye);
    eye.position.set(sx * 0.22, 1.12, 0.34); parasite.add(eye);
    const pup = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 7), P.pupil);
    pup.position.set(sx * 0.24, 1.12, 0.48); parasite.add(pup);
  }
  // gaping maw (the ooze source) — a dark recess with a lower lip anchor
  const maw = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 9), P.pupil);
  maw.scale.set(1, 0.7, 0.6); maw.position.set(0, 0.86, 0.42); parasite.add(maw);
  const mouth = new THREE.Object3D(); mouth.position.set(0, 0.82, 0.52); parasite.add(mouth);
  // tentacles ringing the upper body, splayed outward + up
  const tentacles = [];
  const N = 6;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    const ten = buildTentacle(P, 0.55 + (k % 2) * 0.12);
    ten.position.set(Math.cos(a) * 0.34, 0.95 + Math.sin(a * 2) * 0.05, Math.sin(a) * 0.26);
    ten.userData.baseX = -0.5 + Math.sin(a) * 0.3; // splay up/out
    ten.userData.baseZ = Math.cos(a) * 0.6;
    ten.rotation.set(ten.userData.baseX, a, ten.userData.baseZ);
    parasite.add(ten);
    tentacles.push(ten);
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
  // a little curled parasite seed visible inside the fluid before it bursts
  const seed = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), P.skin);
  seed.scale.set(1, 0.8, 1.2); seed.position.y = jarH * 0.4 + 0.02; glass.push(seed);
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
