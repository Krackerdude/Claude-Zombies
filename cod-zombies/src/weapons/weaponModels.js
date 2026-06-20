import * as THREE from 'three';
import { gunMetal, gunMetalRidged, gunGrip, gunDark, gunWood, ironSightGlow, scopeGlow } from './gunMaterials.js';

/**
 * Distinct first-person weapon models, assembled from primitives so each class
 * reads at a glance: a stubby pistol, a scoped sniper, a twin-barrel shotgun, a
 * rotary minigun, an organic ray gun, etc. Forward is -z (the muzzle direction).
 * Each builder returns { group, muzzle } where `muzzle` is the z of the barrel
 * tip, used to place the flash. Materials are OPAQUE with normal depth so the
 * parts occlude one another correctly (the viewmodel gets its own cleared-depth
 * pass to sit over the world).
 */

const STEEL = 0x32363d;
const DARK = 0x141519;
const POLY = 0x20232a;

function mat(color, { metal = 0.45, rough = 0.55, emissive = 0x000000, ei = 0 } = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, emissive, emissiveIntensity: ei });
}
function box(w, h, d, m) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); }
function tube(r1, r2, len, m, seg = 12) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg), m);
  c.rotation.x = Math.PI / 2; // axis -> z
  return c;
}
function at(mesh, x, y, z, rx = 0, ry = 0, rz = 0) {
  mesh.position.set(x, y, z);
  mesh.rotation.x += rx; mesh.rotation.y += ry; mesh.rotation.z += rz;
  mesh.castShadow = false;
  return mesh;
}

function pistol(vm) {
  const g = new THREE.Group();
  const slideMat = gunMetal(0x3e434c);          // lighter polished slide
  const frameMat = gunMetal(0x2c2f36);          // darker frame
  const noseMat = gunMetal(0x34383f);           // slide nose / bushing
  const ridgedMat = gunMetalRidged(0x383d45);   // machined serrations
  const backMat = gunMetalRidged(0x2c2f36);     // grip backstrap
  const blackMat = gunDark();
  const gripMat = gunGrip();                    // stippled black G10 panels
  const green = ironSightGlow();                // neon-green fiber sights

  // --- slide (top), long & flat with a stepped nose ---
  g.add(at(box(0.05, 0.05, 0.27, slideMat), 0, 0.035, -0.11));
  g.add(at(box(0.05, 0.052, 0.05, ridgedMat), 0, 0.035, 0.02));        // rear slide step (serration block)
  for (let i = 0; i < 4; i++) {                                        // cocking serrations
    g.add(at(box(0.052, 0.04, 0.006, ridgedMat), 0, 0.035, 0.0 + i * 0.014));
  }
  g.add(at(box(0.044, 0.046, 0.04, noseMat), 0, 0.034, -0.252));       // slide nose
  g.add(at(tube(0.02, 0.02, 0.022, noseMat), 0, 0.034, -0.262));       // barrel bushing ring
  g.add(at(tube(0.012, 0.012, 0.06, blackMat), 0, 0.034, -0.285));     // barrel / muzzle

  // --- frame + dust cover under the slide ---
  g.add(at(box(0.046, 0.034, 0.21, frameMat), 0, 0.0, -0.1));          // frame
  g.add(at(box(0.04, 0.022, 0.12, frameMat), 0, -0.018, -0.18));       // dust cover

  // --- grip (angled back), stippled side panels, mag base ---
  g.add(at(box(0.044, 0.135, 0.058, backMat), 0, -0.085, 0.0, 0.3));   // backstrap (ridged)
  for (const sx of [-1, 1]) g.add(at(box(0.007, 0.115, 0.05, gripMat), sx * 0.026, -0.085, 0.0, 0.3));
  g.add(at(box(0.044, 0.018, 0.05, blackMat), 0, -0.156, -0.012, 0.3)); // magazine base
  g.add(at(box(0.03, 0.02, 0.05, frameMat), 0, 0.012, 0.045, 0.5));     // beavertail grip safety

  // --- hammer + trigger guard + trigger ---
  g.add(at(box(0.012, 0.028, 0.014, blackMat), 0, 0.058, 0.035, -0.5)); // skeletonized hammer
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.006, 8, 16), frameMat);
  g.add(at(guard, 0, -0.045, -0.05, 0, Math.PI / 2));                    // trigger guard loop
  g.add(at(box(0.01, 0.028, 0.009, blackMat), 0, -0.04, -0.05));         // trigger

  // --- green fiber-optic iron sights (raised slightly, brighter neon) ---
  g.add(at(box(0.01, 0.022, 0.012, blackMat), 0, 0.069, -0.23));        // front sight post
  g.add(at(box(0.008, 0.008, 0.008, green), 0, 0.079, -0.232));         // front green dot
  g.add(at(box(0.044, 0.02, 0.02, blackMat), 0, 0.067, 0.018));         // rear sight block
  g.add(at(box(0.008, 0.008, 0.008, green), -0.013, 0.076, 0.018));     // rear left dot
  g.add(at(box(0.008, 0.008, 0.008, green), 0.013, 0.076, 0.018));      // rear right dot

  return { group: g, muzzle: -0.31 };
}

function smg(vm) {
  const g = new THREE.Group();
  const body = mat(vm.color, { metal: 0.5, rough: 0.5 });
  const acc = mat(vm.accent, { metal: 0.2, rough: 0.8 });
  g.add(at(box(0.055, 0.085, 0.28, body), 0, 0.01, -0.18));     // receiver
  g.add(at(box(0.04, 0.15, 0.05, acc), 0, -0.09, -0.12, -0.12)); // angled magazine
  g.add(at(box(0.042, 0.1, 0.05, mat(DARK)), 0, -0.07, -0.04, 0.18)); // pistol grip
  g.add(at(tube(0.013, 0.013, 0.13, mat(STEEL)), 0, 0.02, -0.4)); // short barrel
  g.add(at(box(0.03, 0.045, 0.1, acc), 0, 0.0, 0.04));          // folded stock nub
  g.add(at(box(0.014, 0.03, 0.05, mat(DARK)), 0, 0.07, -0.22));  // top sight
  return { group: g, muzzle: -0.47 };
}

function assaultRifle(vm) {
  const g = new THREE.Group();
  const body = mat(vm.color, { metal: 0.5, rough: 0.5 });
  const acc = mat(vm.accent, { metal: 0.2, rough: 0.85 });
  g.add(at(box(0.055, 0.08, 0.36, body), 0, 0.0, -0.22));        // receiver
  g.add(at(box(0.05, 0.06, 0.2, acc), 0, -0.005, -0.42));        // handguard
  g.add(at(box(0.045, 0.17, 0.06, acc), 0, -0.1, -0.16, -0.18)); // curved magazine
  g.add(at(box(0.042, 0.11, 0.05, mat(DARK)), 0, -0.08, -0.06, 0.2)); // grip
  g.add(at(box(0.05, 0.07, 0.13, acc), 0, -0.01, 0.06));         // stock
  g.add(at(tube(0.013, 0.013, 0.2, mat(STEEL)), 0, 0.0, -0.58)); // barrel
  g.add(at(box(0.016, 0.04, 0.12, mat(DARK)), 0, 0.07, -0.22));  // optic rail/sight
  return { group: g, muzzle: -0.66 };
}

function shotgun(vm) {
  const g = new THREE.Group();
  const body = mat(vm.color, { metal: 0.45, rough: 0.55 });
  const wood = mat(vm.accent || 0x4a2f1a, { metal: 0.05, rough: 0.9 });
  g.add(at(box(0.085, 0.075, 0.18, body), 0, 0.0, -0.2));        // break-action receiver
  g.add(at(tube(0.02, 0.02, 0.46, mat(STEEL)), 0.022, 0.02, -0.46)); // twin barrels
  g.add(at(tube(0.02, 0.02, 0.46, mat(STEEL)), -0.022, 0.02, -0.46));
  g.add(at(box(0.07, 0.09, 0.16, wood), 0, -0.02, 0.04, 0.06));  // wood stock
  g.add(at(box(0.05, 0.06, 0.12, wood), 0, -0.05, -0.34));       // forend
  return { group: g, muzzle: -0.69 };
}

function sniper(vm) {
  const g = new THREE.Group();
  const body = mat(vm.color, { metal: 0.5, rough: 0.45 });
  const acc = mat(vm.accent, { metal: 0.2, rough: 0.85 });
  const glass = mat(0x081016, { metal: 0.1, rough: 0.2, emissive: 0x10303a, ei: 0.4 });
  g.add(at(box(0.05, 0.07, 0.26, body), 0, 0.0, -0.2));          // receiver
  g.add(at(tube(0.014, 0.014, 0.5, mat(STEEL)), 0, 0.0, -0.55)); // long barrel
  g.add(at(box(0.05, 0.08, 0.16, acc), 0, -0.02, 0.06));         // stock
  g.add(at(box(0.042, 0.1, 0.05, mat(DARK)), 0, -0.07, -0.05, 0.2)); // grip
  // big scope on top
  g.add(at(tube(0.026, 0.026, 0.2, mat(DARK)), 0, 0.095, -0.2)); // scope body
  g.add(at(tube(0.027, 0.027, 0.012, glass), 0, 0.095, -0.305)); // objective lens
  g.add(at(box(0.012, 0.05, 0.012, mat(STEEL)), 0, 0.05, -0.14)); // front mount
  g.add(at(box(0.012, 0.05, 0.012, mat(STEEL)), 0, 0.05, -0.26)); // rear mount
  return { group: g, muzzle: -0.71 };
}

function hmg(vm) {
  const g = new THREE.Group();
  const body = mat(vm.color, { metal: 0.55, rough: 0.5 });
  const acc = mat(vm.accent, { metal: 0.3, rough: 0.7 });
  g.add(at(box(0.075, 0.1, 0.38, body), 0, 0.0, -0.24));         // heavy receiver
  g.add(at(box(0.09, 0.11, 0.12, acc), 0, -0.07, -0.1));         // belt box
  g.add(at(tube(0.02, 0.02, 0.32, mat(STEEL)), 0, 0.01, -0.6));  // thick barrel
  g.add(at(box(0.05, 0.07, 0.14, mat(DARK)), 0, -0.01, 0.07));   // stock
  g.add(at(box(0.014, 0.05, 0.16, mat(DARK)), 0, 0.085, -0.24)); // carry handle
  g.add(at(box(0.012, 0.12, 0.012, mat(STEEL)), 0.05, -0.12, -0.5, 0, 0, 0.4)); // bipod leg
  g.add(at(box(0.012, 0.12, 0.012, mat(STEEL)), -0.05, -0.12, -0.5, 0, 0, -0.4));
  return { group: g, muzzle: -0.76 };
}

function launcher(vm) {
  const g = new THREE.Group();
  const body = mat(vm.color, { metal: 0.4, rough: 0.6 });
  const acc = mat(vm.accent, { metal: 0.2, rough: 0.8 });
  g.add(at(tube(0.05, 0.05, 0.62, body), 0, 0.0, -0.3));         // launch tube
  g.add(at(tube(0.055, 0.04, 0.08, mat(DARK)), 0, 0.0, -0.62));  // muzzle bell
  g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 12), mat(0x6a2a1a, { rough: 0.6 })), 0, 0.0, -0.66, Math.PI / 2)); // warhead poking out
  g.add(at(box(0.042, 0.11, 0.05, mat(DARK)), 0, -0.085, -0.18, 0.2)); // grip
  g.add(at(box(0.016, 0.06, 0.04, acc), 0, 0.075, -0.1));        // sight
  return { group: g, muzzle: -0.66 };
}

function special(vm) {
  // minigun: rotary barrel cluster + drum
  const g = new THREE.Group();
  const body = mat(vm.color, { metal: 0.55, rough: 0.45 });
  const acc = mat(vm.accent, { metal: 0.4, rough: 0.6 });
  g.add(at(box(0.12, 0.12, 0.22, body), 0, 0.0, -0.2));          // housing
  g.add(at(box(0.13, 0.15, 0.13, acc), 0, -0.1, -0.06));         // ammo drum
  const cluster = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    cluster.add(at(tube(0.014, 0.014, 0.34, mat(STEEL)), Math.cos(ang) * 0.035, Math.sin(ang) * 0.035, -0.46));
  }
  g.add(cluster);
  g.add(at(box(0.045, 0.12, 0.05, mat(DARK)), 0, -0.09, 0.0, 0.2)); // grip
  return { group: g, muzzle: -0.64 };
}

function wonder(vm, cone) {
  const g = new THREE.Group();
  if (cone) {
    // thundergun: twin flared emitters
    const body = mat(vm.color || 0x3a2a12, { metal: 0.6, rough: 0.4 });
    const glow = mat(0x123a44, { emissive: 0x39d2e6, ei: 2.2, metal: 0.3, rough: 0.3 });
    g.add(at(box(0.08, 0.1, 0.26, body), 0, 0.0, -0.2));
    g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 16, 1, true), glow), 0.03, 0.02, -0.42, -Math.PI / 2));
    g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 16, 1, true), glow), -0.03, 0.02, -0.42, -Math.PI / 2));
    g.add(at(tube(0.03, 0.03, 0.1, glow), 0, 0.06, -0.16));      // glowing coil
    g.add(at(box(0.045, 0.12, 0.05, mat(DARK)), 0, -0.085, -0.04, 0.2));
    return { group: g, muzzle: -0.52 };
  }
  // ray gun: organic blob body with a green core
  const sh = mat(0x2c5a18, { metal: 0.5, rough: 0.4 });
  const core = mat(0x0c2a08, { emissive: 0x69f23a, ei: 2.6, rough: 0.3 });
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), sh), 0, 0.0, -0.16));
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), core), 0, 0.04, -0.12)); // glowing chamber
  g.add(at(tube(0.026, 0.018, 0.22, sh), 0, -0.005, -0.34));     // tapering barrel
  g.add(at(tube(0.03, 0.03, 0.04, core), 0, -0.005, -0.45));     // muzzle ring
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 18), core), 0, 0.02, -0.2, Math.PI / 2)); // fin ring
  g.add(at(box(0.045, 0.12, 0.05, sh), 0, -0.085, -0.04, 0.22)); // grip
  return { group: g, muzzle: -0.47 };
}

// --- K-Vector (Kriss Vector / Vektor K10) — first remaster to the M1911 shared
//     material standard. Boxy Super-V lower, down-angled mag ahead of the grip,
//     top rail, ribbed suppressor, folded stock, green fiber flip sights. ---
function kvector() {
  const g = new THREE.Group();
  const upper = gunMetal(0x3a3e45);        // lighter machined upper
  const lowerMetal = gunMetal(0x2c2f36);   // darker metal accents
  const lower = gunDark(0x17191e);         // matte polymer lower
  const railMat = gunMetalRidged(0x2f333a);// Picatinny rail
  const grip = gunGrip();                  // stippled grip
  const mag = gunDark(0x1c1e23);           // polymer magazine
  const barrelMat = gunDark(0x0f1013);     // near-black barrel
  const supp = gunMetalRidged(0x24272d);   // ribbed suppressor
  const bolt = gunDark(0x101216);
  const green = ironSightGlow();

  // === upper receiver: long horizontal block + top rail ===
  g.add(at(box(0.052, 0.05, 0.44, upper), 0, 0.06, -0.16));
  g.add(at(box(0.034, 0.016, 0.42, railMat), 0, 0.092, -0.16));        // top rail
  g.add(at(box(0.05, 0.03, 0.06, upper), 0, 0.04, 0.06));              // rear of upper

  // === lower receiver: the tall boxy Super-V housing ===
  g.add(at(box(0.06, 0.12, 0.26, lower), 0, -0.025, -0.1));            // main block
  g.add(at(box(0.056, 0.075, 0.12, lower), 0, 0.005, -0.28));          // stepped front
  g.add(at(box(0.05, 0.06, 0.09, lower), 0, 0.015, 0.06));             // rear / stock base
  g.add(at(box(0.062, 0.03, 0.16, lowerMetal), 0, 0.04, -0.14));       // metal seam under upper
  // a couple of visible hex bolts (the Vector's exposed fasteners)
  for (const bz of [-0.04, -0.2]) g.add(at(tube(0.007, 0.007, 0.064, bolt, 6), 0, -0.02, bz, 0, 0, Math.PI / 2));

  // === pistol grip (stippled, near-vertical) ===
  g.add(at(box(0.044, 0.13, 0.05, grip), 0, -0.105, 0.02, 0.1));
  g.add(at(box(0.046, 0.02, 0.052, bolt), 0, -0.165, 0.026, 0.1));     // grip base

  // === trigger guard + trigger ===
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 8, 16), lowerMetal);
  g.add(at(guard, 0, -0.055, -0.035, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.026, 0.009, bolt), 0, -0.05, -0.035));

  // === magazine: signature down-mag, ahead of the trigger, slight forward rake ===
  g.add(at(box(0.05, 0.035, 0.06, lower), 0, -0.085, -0.12));          // mag well lip
  g.add(at(box(0.04, 0.22, 0.05, mag), 0, -0.2, -0.125, -0.1));        // long mag body
  g.add(at(box(0.044, 0.018, 0.054, bolt), 0, -0.31, -0.137, -0.1));   // baseplate

  // === barrel + ribbed suppressor ===
  g.add(at(box(0.046, 0.05, 0.1, lowerMetal), 0, 0.03, -0.36));        // barrel housing
  g.add(at(tube(0.013, 0.013, 0.08, barrelMat), 0, 0.035, -0.42));     // barrel
  g.add(at(tube(0.024, 0.024, 0.15, supp), 0, 0.035, -0.5));           // suppressor
  g.add(at(tube(0.026, 0.026, 0.012, bolt), 0, 0.035, -0.575));        // suppressor cap

  // === charging handle + side selector ===
  g.add(at(box(0.022, 0.018, 0.034, bolt), 0, 0.104, 0.0));            // top charging knob
  g.add(at(box(0.008, 0.02, 0.026, bolt), 0.033, -0.005, -0.02));      // selector
  g.add(at(box(0.018, 0.055, 0.14, bolt), 0.036, 0.03, 0.06));         // folded stock (rear-right)

  // === green fiber flip-up sights, raised on the rail ===
  g.add(at(box(0.016, 0.02, 0.02, bolt), 0, 0.104, -0.34));            // front base
  g.add(at(box(0.01, 0.024, 0.01, bolt), 0, 0.124, -0.34));            // front post
  g.add(at(box(0.008, 0.008, 0.008, green), 0, 0.136, -0.342));        // front dot
  g.add(at(box(0.042, 0.022, 0.02, bolt), 0, 0.104, 0.0));             // rear base
  g.add(at(box(0.008, 0.008, 0.008, green), -0.013, 0.118, 0.0));      // rear left dot
  g.add(at(box(0.008, 0.008, 0.008, green), 0.013, 0.118, 0.0));       // rear right dot

  return { group: g, muzzle: -0.58 };
}

// --- Galil (IMI Galil ARM, BO2) — rebuilt to the K-Vector/M1911 standard from
//     reference. The Galil reads off four signatures: the AK-rounded receiver
//     with a domed dust cover + milled side ribs, the long barrel with a gas
//     tube riding parallel ABOVE it (joined by a gas block), the slotted muzzle
//     brake, and the deployed skeletal tubular stock. Curved steel banana
//     mag, raked AK grip, big paddle selector + bent charging handle on the
//     left, hooded green front post, green aperture peep at the rear. ---
function galil() {
  const g = new THREE.Group();
  const receiver = gunMetal(0x363b43);     // worn blued steel (catches the key)
  const receiverDk = gunMetal(0x2a2d34);   // darker machined accents / blocks
  const cover = gunMetal(0x3b4048);        // domed dust cover
  const ribbed = gunMetalRidged(0x33373f); // milled receiver ribs + handguard
  const barrelMat = gunDark(0x121317);     // near-black barrel
  const gasMat = gunMetal(0x2e323a);       // gas tube
  const magMat = gunMetal(0x31353d);       // steel banana mag
  const grip = gunGrip();                  // stippled AK grip
  const brakeMat = gunMetalRidged(0x24272d);
  const dark = gunDark(0x111317);
  const stockMat = gunMetal(0x2c3037);     // bare tubular folding stock
  const green = ironSightGlow();

  // === receiver: boxy lower + AK rear hump + rounded (cylindrical) dust cover ===
  g.add(at(box(0.058, 0.078, 0.27, receiver), 0, 0.0, -0.13));         // lower receiver
  g.add(at(box(0.056, 0.052, 0.075, receiver), 0, 0.026, -0.02));      // raised rear hump
  g.add(at(tube(0.027, 0.027, 0.25, cover, 16), 0, 0.05, -0.13));      // domed dust cover (rounded top)
  g.add(at(tube(0.027, 0.027, 0.02, receiverDk, 16), 0, 0.05, -0.005));// cover rear cap
  // milled lightening ribs down each side of the receiver
  for (const sx of [-1, 1]) g.add(at(box(0.004, 0.05, 0.15, ribbed), sx * 0.03, -0.004, -0.12));
  // two trunnion rivets on the side (AK-pattern fasteners)
  for (const bz of [-0.05, -0.2]) g.add(at(tube(0.006, 0.006, 0.062, receiverDk, 6), 0, -0.018, bz, 0, 0, Math.PI / 2));

  // === selector paddle + bent charging handle (left side — the face we see) ===
  g.add(at(box(0.012, 0.052, 0.075, dark), -0.033, 0.0, -0.05));       // big AK selector paddle
  g.add(at(box(0.016, 0.022, 0.05, receiverDk), -0.034, 0.03, -0.085, 0.3)); // charging-handle arm (bent up)
  g.add(at(tube(0.009, 0.009, 0.026, dark, 8), -0.046, 0.05, -0.075, 0, Math.PI / 2)); // cocking knob

  // === AK-style pistol grip (raked back), stippled ===
  g.add(at(box(0.044, 0.12, 0.05, grip), 0, -0.1, 0.04, 0.3));
  g.add(at(box(0.046, 0.018, 0.052, dark), 0, -0.158, 0.058, 0.3));    // grip base cap

  // === trigger guard + trigger ===
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 8, 16), receiverDk);
  g.add(at(guard, 0, -0.052, -0.035, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.026, 0.009, dark), 0, -0.047, -0.035));

  // === curved steel banana magazine — segments rake forward as they drop ===
  g.add(at(box(0.05, 0.032, 0.062, receiver), 0, -0.05, -0.105));      // mag well lip
  g.add(at(box(0.044, 0.058, 0.056, magMat), 0, -0.086, -0.108, -0.12));
  g.add(at(box(0.042, 0.058, 0.053, magMat), 0, -0.137, -0.124, -0.30));
  g.add(at(box(0.040, 0.058, 0.050, magMat), 0, -0.186, -0.156, -0.46));
  g.add(at(box(0.038, 0.052, 0.048, magMat), 0, -0.230, -0.200, -0.60));
  g.add(at(box(0.042, 0.016, 0.05, dark), 0, -0.258, -0.228, -0.60));  // floorplate
  // a couple of pressed ribs on the steel mag body
  for (const mz of [-0.118, -0.16] ) g.add(at(box(0.046, 0.006, 0.05, receiverDk), 0, -0.108, mz, -0.18));

  // === barrel + parallel gas tube above it, joined by a gas block ===
  g.add(at(box(0.05, 0.06, 0.11, ribbed), 0, 0.03, -0.31));            // short ribbed handguard
  g.add(at(tube(0.013, 0.013, 0.43, barrelMat), 0, 0.018, -0.45));     // long barrel
  g.add(at(tube(0.0085, 0.0085, 0.26, gasMat), 0, 0.052, -0.42));      // gas tube riding above
  g.add(at(box(0.024, 0.066, 0.042, receiverDk), 0, 0.035, -0.52));    // gas block (ties barrel+tube)
  g.add(at(box(0.018, 0.04, 0.016, gasMat), 0, 0.052, -0.36));         // gas-tube rear collar

  // === hooded green front sight, just ahead of the gas block ===
  g.add(at(box(0.03, 0.026, 0.038, receiverDk), 0, 0.04, -0.57));      // sight base
  for (const sx of [-1, 1]) g.add(at(box(0.006, 0.046, 0.012, dark), sx * 0.017, 0.066, -0.57)); // hood ears
  g.add(at(box(0.04, 0.008, 0.012, dark), 0, 0.09, -0.57));            // hood crossbar
  g.add(at(box(0.009, 0.03, 0.011, dark), 0, 0.062, -0.57));           // front post
  g.add(at(box(0.008, 0.008, 0.008, green), 0, 0.077, -0.572));        // front green dot

  // === rear aperture peep on the dust cover, twin green dots (BO2 look) ===
  g.add(at(box(0.032, 0.024, 0.026, dark), 0, 0.078, -0.015));         // peep base
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.004, 6, 14), dark), 0, 0.086, -0.008, 0, Math.PI / 2)); // aperture ring
  g.add(at(box(0.008, 0.008, 0.008, green), -0.012, 0.086, -0.018));   // rear left dot
  g.add(at(box(0.008, 0.008, 0.008, green), 0.012, 0.086, -0.018));    // rear right dot

  // === slotted muzzle brake (rings cut into the ridged sleeve) ===
  g.add(at(tube(0.018, 0.018, 0.08, brakeMat), 0, 0.018, -0.70));
  for (const sz of [-0.68, -0.71]) g.add(at(tube(0.0195, 0.0195, 0.006, dark, 12), 0, 0.018, sz)); // slot rings
  g.add(at(tube(0.021, 0.021, 0.012, dark, 12), 0, 0.018, -0.745));    // brake cap

  // === deployed skeletal tubular stock — extends STRAIGHT BACK to the shoulder
  //     so the gun has a proper rear (the folded-to-the-side version vanished
  //     off-screen behind the hip offset). Hinge socket on the receiver, twin
  //     tubes sweeping back to an open butt frame + rubber pad. ===
  g.add(at(box(0.05, 0.072, 0.07, receiverDk), 0, 0.005, 0.05));       // stock socket closing the receiver rear
  g.add(at(box(0.024, 0.05, 0.03, dark), 0, 0.005, 0.082));            // folding hinge knuckle
  g.add(at(tube(0.007, 0.007, 0.19, stockMat), 0, 0.045, 0.16));       // top rail
  g.add(at(tube(0.007, 0.007, 0.19, stockMat), 0, -0.035, 0.16));      // bottom rail
  g.add(at(box(0.04, 0.016, 0.1, receiverDk), 0, 0.052, 0.125));       // top comb / cheek strap
  g.add(at(box(0.014, 0.09, 0.018, stockMat), 0, 0.005, 0.252));       // vertical butt frame (closes the loop)
  g.add(at(box(0.026, 0.092, 0.03, dark), 0, 0.005, 0.262));           // rubber butt pad

  return { group: g, muzzle: -0.75 };
}

// --- Olympia (BO3) — bespoke over/under sporting shotgun. NOT a side-by-side:
//     two STACKED blued barrels with a ventilated top rib (slotted strip on
//     posts), an ornate blued receiver with gold scroll trim + a gold trigger,
//     and rich checkered-walnut forend + buttstock with a gold pinstripe and a
//     rubber recoil pad. Built on the shared gunMetal/gunWood standards. ---
function olympia() {
  const g = new THREE.Group();
  const blued = gunMetal(0x1c2029, { metal: 0.85, rough: 0.27 });  // deep-blued barrels
  const breech = gunMetal(0x262b35, { metal: 0.8, rough: 0.33 });  // receiver steel (catches engraving light)
  const gold = gunMetal(0xc99b34, { metal: 0.92, rough: 0.34 });   // scroll engraving + trigger
  const wood = gunWood(0x8f4f30);                                  // warm figured walnut
  const woodChk = gunWood(0x824327, { checker: true });            // checkered grip/forend panels
  const bead = gunMetal(0xb89248, { metal: 0.8, rough: 0.3 });     // brass front bead
  const pad = gunDark(0x0c0d0f);                                   // rubber recoil pad
  const dark = gunDark(0x0e1014);

  // === stacked (over/under) barrels ===
  g.add(at(tube(0.016, 0.016, 0.6, blued), 0, 0.026, -0.46));         // upper barrel
  g.add(at(tube(0.016, 0.016, 0.6, blued), 0, -0.006, -0.46));        // lower barrel
  for (const by of [0.026, -0.006]) {                                  // muzzle caps + dark bores
    g.add(at(tube(0.017, 0.017, 0.012, dark), 0, by, -0.758));
    g.add(at(tube(0.0095, 0.0095, 0.014, dark), 0, by, -0.762));
  }
  // thin webs joining the barrels, with gaps (the side vents)
  for (let z = -0.24; z >= -0.7; z -= 0.07) g.add(at(box(0.007, 0.022, 0.016, blued), 0, 0.01, z));

  // === ventilated top rib: a flat sighting strip on little posts ===
  g.add(at(box(0.015, 0.005, 0.57, blued), 0, 0.049, -0.46));         // rib strip
  for (let z = -0.21; z >= -0.73; z -= 0.05) g.add(at(box(0.013, 0.012, 0.014, blued), 0, 0.043, z)); // vent posts
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), bead), 0, 0.054, -0.752)); // brass front bead

  // === ornate blued receiver / breech block ===
  g.add(at(box(0.062, 0.088, 0.17, breech), 0, 0.006, -0.095));       // receiver block
  g.add(at(box(0.028, 0.024, 0.1, breech), 0, 0.052, -0.04));         // top tang
  g.add(at(box(0.012, 0.014, 0.06, gold), 0, 0.064, -0.05));          // gold top-lever
  // gold scroll trim: top + bottom border lines and a rosette on each side
  for (const sx of [-1, 1]) {
    g.add(at(box(0.004, 0.006, 0.14, gold), sx * 0.032, 0.042, -0.095)); // upper trim line
    g.add(at(box(0.004, 0.006, 0.14, gold), sx * 0.032, -0.03, -0.095));  // lower trim line
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), gold), sx * 0.033, 0.006, -0.1)); // engraved rosette
    g.add(at(box(0.004, 0.03, 0.018, gold), sx * 0.032, 0.006, -0.05)); // small scroll flourish
  }

  // === trigger guard + gold trigger ===
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.005, 8, 16), breech);
  g.add(at(guard, 0, -0.05, -0.05, 0, Math.PI / 2));
  g.add(at(box(0.008, 0.022, 0.008, gold), 0, -0.045, -0.05));        // gold trigger

  // === walnut forend, wrapping the underside of the barrels ===
  g.add(at(box(0.054, 0.052, 0.2, wood), 0, -0.026, -0.4));           // forend body
  g.add(at(box(0.04, 0.04, 0.06, wood), 0, -0.022, -0.52));           // tapered front tip
  g.add(at(box(0.057, 0.03, 0.11, woodChk), 0, -0.034, -0.4));        // checkered panel
  g.add(at(box(0.058, 0.003, 0.12, gold), 0, -0.012, -0.4));          // gold pinstripe border

  // === walnut wrist + buttstock + recoil pad ===
  g.add(at(box(0.046, 0.064, 0.12, wood), 0, -0.012, 0.03));          // wrist (grip)
  g.add(at(box(0.05, 0.05, 0.07, woodChk), 0, -0.02, 0.03));          // checkered grip panel
  g.add(at(box(0.052, 0.1, 0.18, wood), 0, 0.0, 0.17));               // buttstock body
  g.add(at(box(0.048, 0.032, 0.13, wood), 0, 0.052, 0.14));           // raised comb / cheek
  g.add(at(box(0.05, 0.108, 0.022, pad), 0, 0.0, 0.258));             // rubber recoil pad

  return { group: g, muzzle: -0.78 };
}

// --- DSR-50 (BO3) — bespoke bullpup precision rifle. Signatures: a long
//     SKELETONIZED top handguard (rectangular lightening cutouts), a big scope
//     with RED illuminated turret + objective ring (snipers glow red, not
//     green), a slotted boxy muzzle brake, a row of side ports, and an angular
//     skeletonized stock with an adjustable cheek riser. Shared gunMetal set. ---
function dsr() {
  const g = new THREE.Group();
  const body = gunMetal(0x2e333b, { metal: 0.62, rough: 0.45 }); // chassis steel
  const bodyDk = gunMetal(0x23272e);                             // darker chassis accents
  const rail = gunMetalRidged(0x2a2e35);                         // rails + skeleton
  const barrelMat = gunDark(0x121317);                           // near-black barrel
  const brakeMat = gunMetalRidged(0x24272d);                     // slotted brake
  const scopeBody = gunDark(0x0e0f12);                           // black scope tube
  const scopeMetal = gunMetal(0x2a2e35);                         // mounts + turrets
  const grip = gunGrip();
  const mag = gunDark(0x1a1d22);
  const brass = gunMetal(0x5e5e44, { metal: 0.7, rough: 0.5 });  // side port rims
  const dark = gunDark(0x0e1014);
  const red = scopeGlow(0xff2a1e);                               // red optic illumination
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a0e12, metalness: 0.2, roughness: 0.14, envMap: undefined });
  const cyl = (r1, r2, len, m, seg = 14) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg), m); // axis = y

  // === chassis / receiver (long flat lower body) ===
  g.add(at(box(0.058, 0.075, 0.52, body), 0, -0.01, -0.16));          // main chassis
  g.add(at(box(0.05, 0.022, 0.46, bodyDk), 0, 0.03, -0.15));          // raised top deck
  g.add(at(box(0.06, 0.092, 0.15, body), 0, 0.004, 0.04));            // rear bolt-action receiver
  g.add(at(box(0.016, 0.022, 0.05, dark), 0.034, 0.018, 0.06, 0, 0, 0.3)); // bolt-handle arm (right)
  g.add(at(cyl(0.011, 0.011, 0.03, dark, 8), 0.05, 0.03, 0.075, 0, 0, Math.PI / 2)); // bolt knob

  // === barrel + slotted boxy muzzle brake ===
  g.add(at(tube(0.019, 0.019, 0.36, barrelMat), 0, 0.005, -0.6));     // heavy barrel
  g.add(at(box(0.046, 0.046, 0.11, brakeMat), 0, 0.005, -0.815));     // brake block
  for (let i = 0; i < 3; i++) g.add(at(box(0.05, 0.05, 0.008, dark), 0, 0.005, -0.785 - i * 0.022)); // top slots
  for (const sx of [-1, 1]) g.add(at(box(0.006, 0.026, 0.07, dark), sx * 0.024, 0.005, -0.815)); // side vent
  g.add(at(tube(0.024, 0.024, 0.012, dark), 0, 0.005, -0.872));       // muzzle cap
  g.add(at(tube(0.011, 0.011, 0.016, dark), 0, 0.005, -0.876));       // bore

  // === skeletonized top handguard: top rail on posts, gaps = the cutouts ===
  g.add(at(box(0.046, 0.01, 0.44, rail), 0, 0.052, -0.52));           // top flat rail
  g.add(at(box(0.046, 0.008, 0.44, bodyDk), 0, 0.012, -0.52));        // lower strap
  for (let z = -0.32; z >= -0.72; z -= 0.058) {                        // vertical webs (leave rectangular gaps)
    for (const sx of [-1, 1]) g.add(at(box(0.006, 0.05, 0.024, body), sx * 0.022, 0.032, z));
  }

  // === picatinny scope rail + folding backup sight with red dots ===
  g.add(at(box(0.032, 0.014, 0.3, rail), 0, 0.05, -0.12));            // scope rail
  g.add(at(box(0.03, 0.026, 0.02, dark), 0, 0.066, 0.02));            // rear BUIS block
  for (const sx of [-1, 1]) g.add(at(box(0.006, 0.006, 0.006, red), sx * 0.009, 0.074, 0.02)); // twin red dots
  g.add(at(box(0.006, 0.006, 0.006, red), 0, 0.072, -0.21));          // front post red dot

  // === three round side ports (lightening holes, brass rims) ===
  for (let i = 0; i < 3; i++) {
    g.add(at(cyl(0.012, 0.012, 0.006, brass, 12), -0.03, 0.004, -0.18 - i * 0.045, 0, 0, Math.PI / 2));
    g.add(at(cyl(0.007, 0.007, 0.008, dark, 10), -0.031, 0.004, -0.18 - i * 0.045, 0, 0, Math.PI / 2)); // recessed hole
  }

  // === big scope (rear-centre on top), red illumination ===
  g.add(at(box(0.04, 0.03, 0.022, scopeMetal), 0, 0.085, -0.26));     // front mount ring
  g.add(at(box(0.04, 0.03, 0.022, scopeMetal), 0, 0.085, -0.04));     // rear mount ring
  g.add(at(tube(0.028, 0.028, 0.28, scopeBody), 0, 0.108, -0.15));    // main tube
  g.add(at(tube(0.038, 0.03, 0.07, scopeBody), 0, 0.108, -0.32));     // objective bell
  g.add(at(tube(0.036, 0.036, 0.008, glass), 0, 0.108, -0.357));      // objective lens
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.037, 0.005, 8, 26), red), 0, 0.108, -0.354)); // red objective ring
  g.add(at(tube(0.032, 0.03, 0.045, rail), 0, 0.108, -0.03));         // knurled magnification ring
  g.add(at(tube(0.03, 0.03, 0.006, glass), 0, 0.108, 0.02));          // ocular lens
  g.add(at(cyl(0.018, 0.018, 0.032, scopeMetal), 0, 0.142, -0.14));   // elevation turret
  g.add(at(cyl(0.0195, 0.0195, 0.006, red, 14), 0, 0.132, -0.14));    // turret red index band
  g.add(at(cyl(0.016, 0.016, 0.028, scopeMetal), 0.04, 0.108, -0.14, 0, 0, Math.PI / 2)); // windage turret (right)

  // === pistol grip + trigger ===
  g.add(at(box(0.044, 0.12, 0.05, grip), 0, -0.1, 0.0, 0.25));
  g.add(at(box(0.046, 0.018, 0.052, dark), 0, -0.158, 0.012, 0.25));  // grip base
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 8, 16), body);
  g.add(at(guard, 0, -0.05, -0.06, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.026, 0.009, dark), 0, -0.045, -0.06));         // trigger

  // === chunky .50 magazine ahead of the grip ===
  g.add(at(box(0.046, 0.05, 0.062, body), 0, -0.05, -0.14));          // mag well
  g.add(at(box(0.04, 0.11, 0.05, mag), 0, -0.115, -0.14));            // mag body
  g.add(at(box(0.044, 0.016, 0.052, dark), 0, -0.176, -0.14));        // floorplate

  // === angular skeletonized stock + adjustable cheek + recoil pad ===
  g.add(at(box(0.04, 0.02, 0.16, body), 0, 0.044, 0.18));             // top comb bar
  g.add(at(box(0.044, 0.03, 0.1, bodyDk), 0, 0.066, 0.16));           // raised cheek riser
  g.add(at(box(0.03, 0.02, 0.16, body), 0, -0.04, 0.18));             // lower bar (gap above = skeleton cutout)
  g.add(at(box(0.03, 0.12, 0.025, body), 0, 0.0, 0.255));             // rear vertical (closes the frame)
  g.add(at(box(0.046, 0.13, 0.022, mag), 0, 0.0, 0.268));             // recoil pad
  g.add(at(cyl(0.012, 0.012, 0.04, dark, 10), 0.0, -0.07, 0.255, Math.PI / 2)); // monopod spike at the toe

  return { group: g, muzzle: -0.88 };
}

// --- HK21 (BO-era, HK G3-pattern LMG) — bespoke, NO optic so it runs the
//     classic HK irons: a rotary DRUM rear sight + a hooded RING front post
//     (green). Signatures: slim stamped G3 receiver with the forward cocking
//     tube + angled HK charging handle, a wide slotted handguard, a slotted
//     flash hider, a folded bipod, a belt feed + ammo box (the LMG tell), and a
//     fixed stock. Shared gunMetal set. ---
function hk21() {
  const g = new THREE.Group();
  const receiver = gunMetal(0x2c3037);     // stamped steel
  const receiverDk = gunMetal(0x23272e);   // darker accents
  const barrelMat = gunDark(0x121317);     // near-black barrel
  const handguard = gunMetalRidged(0x2e3239); // wide slotted handguard
  const flashMat = gunMetalRidged(0x24272d);
  const drum = gunMetalRidged(0x2a2e35);   // knurled rear-sight drum
  const grip = gunGrip();
  const stockMat = gunDark(0x1a1d22);      // polymer stock
  const mag = gunDark(0x1c1f25);           // belt / ammo box
  const brass = gunMetal(0xb08a3c, { metal: 0.8, rough: 0.34 }); // belt cartridges
  const amber = gunMetal(0xc07a22, { metal: 0.4, rough: 0.6 });  // painted drum numbers
  const dark = gunDark(0x0e1014);
  const green = ironSightGlow();
  const cyl = (r1, r2, len, m, seg = 14) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg), m); // axis = y

  // === slim G3 receiver + raised top cover ===
  g.add(at(box(0.056, 0.08, 0.34, receiver), 0, 0.0, -0.12));         // receiver
  g.add(at(box(0.05, 0.022, 0.3, receiverDk), 0, 0.052, -0.12));      // top cover
  g.add(at(box(0.01, 0.02, 0.03, dark), -0.03, -0.01, 0.0));          // SEF selector (left)

  // === forward cocking tube (left of bore) + angled HK charging handle ===
  g.add(at(tube(0.012, 0.012, 0.32, receiver), -0.02, 0.05, -0.42));  // cocking tube
  g.add(at(box(0.012, 0.045, 0.016, dark), -0.034, 0.062, -0.56, 0, 0, -0.4)); // charging handle (cocked up-left)

  // === barrel + slotted flash hider ===
  g.add(at(tube(0.016, 0.016, 0.4, barrelMat), 0, 0.012, -0.5));      // barrel
  g.add(at(tube(0.02, 0.02, 0.09, flashMat), 0, 0.012, -0.745));      // flash hider
  for (const sz of [-0.72, -0.755, -0.79]) g.add(at(tube(0.021, 0.021, 0.006, dark, 12), 0, 0.012, sz)); // slot rings
  g.add(at(tube(0.022, 0.017, 0.014, dark, 12), 0, 0.012, -0.795));   // open tip

  // === wide slotted handguard (G3 SG1 style) ===
  g.add(at(box(0.064, 0.05, 0.22, handguard), 0, 0.0, -0.44));        // handguard body
  for (let i = 0; i < 4; i++) g.add(at(box(0.05, 0.014, 0.018, dark), 0, 0.026, -0.36 - i * 0.045)); // top cooling slots
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) g.add(at(box(0.006, 0.024, 0.05, dark), sx * 0.033, 0.0, -0.39 - i * 0.058)); // side slots

  // === hooded RING front sight ===
  g.add(at(box(0.024, 0.03, 0.03, dark), 0, 0.04, -0.62));            // sight base
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 8, 18), dark), 0, 0.062, -0.62)); // ring hood
  g.add(at(box(0.006, 0.022, 0.008, dark), 0, 0.056, -0.62));         // front post
  g.add(at(box(0.007, 0.007, 0.007, green), 0, 0.07, -0.622));        // front green dot

  // === HK rotary DRUM rear sight (transverse, knurled, painted numbers) ===
  g.add(at(cyl(0.024, 0.024, 0.032, drum), 0, 0.07, 0.0, 0, 0, Math.PI / 2));    // drum body (axis x)
  g.add(at(cyl(0.0245, 0.0245, 0.01, amber), 0, 0.07, 0.0, 0, 0, Math.PI / 2));  // painted index band
  g.add(at(box(0.014, 0.016, 0.016, dark), 0, 0.09, 0.0));            // aperture housing
  g.add(at(box(0.007, 0.007, 0.007, green), 0, 0.098, 0.0));          // rear green dot

  // === G3 pistol grip + trigger ===
  g.add(at(box(0.044, 0.12, 0.05, grip), 0, -0.1, 0.02, 0.28));
  g.add(at(box(0.046, 0.018, 0.052, dark), 0, -0.158, 0.04, 0.28));   // grip base
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 8, 16), receiverDk);
  g.add(at(guard, 0, -0.05, -0.02, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.026, 0.009, dark), 0, -0.045, -0.02));         // trigger

  // === belt feed + ammo box (LMG tell), feeding up the left into the receiver ===
  g.add(at(box(0.062, 0.072, 0.088, mag), 0, -0.084, -0.05));         // ammo box
  g.add(at(box(0.064, 0.01, 0.04, dark), 0, -0.052, -0.05));          // box latch
  for (let i = 0; i < 5; i++) {                                        // brass belt climbing in
    const t = i / 4;
    g.add(at(box(0.011, 0.02, 0.013, brass), -0.04 + t * 0.02, -0.046 + t * 0.05, -0.05));
  }

  // === folded bipod under the front ===
  g.add(at(box(0.02, 0.02, 0.03, dark), 0, -0.03, -0.52));            // bipod mount
  for (const sx of [-1, 1]) {
    g.add(at(tube(0.005, 0.005, 0.18, stockMat), sx * 0.012, -0.05, -0.43, 0, sx * 0.12, 0)); // leg, folded back
    g.add(at(box(0.008, 0.022, 0.008, stockMat), sx * 0.03, -0.058, -0.35));                  // foot
  }

  // === fixed G3 stock + butt pad ===
  g.add(at(box(0.05, 0.078, 0.2, stockMat), 0, 0.0, 0.16));           // stock body
  g.add(at(box(0.046, 0.092, 0.022, dark), 0, 0.0, 0.258));           // butt pad
  g.add(at(box(0.03, 0.016, 0.12, stockMat), 0, 0.05, 0.13));         // comb

  return { group: g, muzzle: -0.8 };
}

// --- M72 LAW (BO) — bespoke disposable rocket tube. Dead simple silhouette: a
//     two-tone telescoping tube (olive front / black extended rear), a yellow
//     caution band, a raised top rib carrying flip-up irons (green front blade +
//     rear peep), the rubber trigger bar on top, an upright safety lever and a
//     folded strut underneath. Open bore + open rear. Shared materials. ---
function m72() {
  const g = new THREE.Group();
  const olive = gunMetal(0x5e5b38, { metal: 0.18, rough: 0.78 });   // olive-drab outer tube
  const oliveDk = gunMetal(0x47452c, { metal: 0.18, rough: 0.82 }); // collar / top rib
  const black = gunDark(0x141519);                                  // telescoped rear tube
  const dark = gunDark(0x0b0d10);                                   // bores / sights / trigger
  const rubber = gunDark(0x1c1c20);                                 // trigger bar
  const yellow = new THREE.MeshStandardMaterial({ color: 0xc9a51e, metalness: 0.1, roughness: 0.6 });
  const green = ironSightGlow();

  // === telescoping tube: olive front (muzzle) + black extended rear (shoulder) ===
  g.add(at(tube(0.05, 0.05, 0.66, olive), 0, 0, -0.37));             // olive outer tube
  g.add(at(tube(0.046, 0.046, 0.32, black), 0, 0, 0.12));           // black inner tube (extended rearward)
  g.add(at(tube(0.053, 0.053, 0.05, oliveDk), 0, 0, -0.05));        // junction collar
  g.add(at(tube(0.051, 0.051, 0.05, yellow), 0, 0, -0.5));          // yellow caution band

  // open muzzle (front) + open breech (rear), dark recessed interiors
  g.add(at(tube(0.052, 0.052, 0.022, dark), 0, 0, -0.7));           // muzzle rim
  g.add(at(tube(0.044, 0.044, 0.05, dark), 0, 0, -0.685));          // muzzle bore
  g.add(at(tube(0.048, 0.048, 0.02, dark), 0, 0, 0.28));            // rear rim
  g.add(at(tube(0.04, 0.04, 0.06, dark), 0, 0, 0.27));              // rear bore

  // === raised top rib (the reinforcing strip the sights + trigger ride on) ===
  g.add(at(box(0.016, 0.012, 0.5, oliveDk), 0, 0.052, -0.3));

  // === flip-up front sight (tall blade, green window) ===
  g.add(at(box(0.02, 0.018, 0.026, dark), 0, 0.056, -0.62));        // base
  g.add(at(box(0.012, 0.06, 0.012, dark), 0, 0.092, -0.62));        // blade
  g.add(at(box(0.005, 0.04, 0.005, green), 0, 0.092, -0.622));      // green sight window

  // === flip-up rear peep ===
  g.add(at(box(0.022, 0.018, 0.026, dark), 0, 0.066, -0.1));        // base
  g.add(at(box(0.02, 0.05, 0.01, dark), 0, 0.096, -0.1));           // peep blade
  g.add(at(box(0.006, 0.006, 0.006, green), 0, 0.1, -0.1));         // green peep dot

  // === rubber trigger bar on top (middle) ===
  g.add(at(box(0.03, 0.022, 0.14, dark), 0, 0.062, -0.3));          // trigger housing
  g.add(at(box(0.024, 0.014, 0.1, rubber), 0, 0.076, -0.3));        // pressable rubber bar

  // === upright safety / cocking lever + folded carry strut underneath ===
  g.add(at(box(0.012, 0.045, 0.016, dark), 0, 0.088, -0.42, 0, 0, -0.2));
  g.add(at(box(0.008, 0.055, 0.008, dark), 0, -0.072, -0.16));      // strut drop
  g.add(at(box(0.008, 0.008, 0.05, dark), 0, -0.096, -0.14));       // strut foot (bent back)

  return { group: g, muzzle: -0.72 };
}

const BUILDERS = {
  pistol, smg, assaultRifle, shotgun, sniper, hmg, launcher, special, wonder,
};

/**
 * Build a model group for a weapon. @returns {{ group: THREE.Group, muzzle: number }}
 */
export function buildWeaponModel(weapon) {
  const vm = weapon.data.viewmodel || { color: 0x4a4f59, accent: 0x26282e };
  const cat = weapon.data.category;
  if (weapon.data.name === 'K-Vector') return kvector();
  if (weapon.data.name === 'GALIL') return galil();
  if (weapon.data.name === 'OLYMPIA') return olympia();
  if (weapon.data.name === 'DSR-50') return dsr();
  if (weapon.data.name === 'HK21') return hk21();
  if (weapon.data.name === 'M72 LAW') return m72();
  if (cat === 'wonder') return wonder(vm, weapon.data.projectileType === 'cone');
  const fn = BUILDERS[cat] || assaultRifle;
  return fn(vm);
}
