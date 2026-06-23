import * as THREE from 'three';
import { gunMetal, gunMetalRidged, gunGrip, gunDark, gunWood, engravedSteel, ironSightGlow, scopeGlow, plasmaGlow } from './gunMaterials.js';

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

// --- Death Machine (M134 minigun) — bespoke and deliberately oversized: this
//     should read as the most imposing thing in the kit. Six rotary barrels in
//     a clamped cluster, a big muzzle collar, a heavy rotor housing with the
//     electric-motor drum + top carry handle, an ammo can with a brass belt
//     feeding in, and a centred rear grip. Handles/grips are kept centred or on
//     top — nothing juts out to the left where the handless viewmodel has no
//     hand to justify it. Shared gunMetal set. ---
function deathMachine() {
  const g = new THREE.Group();
  const housing = gunMetal(0x2a2e35);
  const housingDk = gunMetal(0x1f232a);
  const barrelMat = gunMetal(0x3a3f47, { metal: 0.85, rough: 0.28 }); // blued, light-catching barrels
  const clamp = gunMetal(0x2c3037);
  const dark = gunDark(0x121317);
  const brass = gunMetal(0xb08a3c, { metal: 0.8, rough: 0.35 });
  const ammoBox = gunDark(0x1a1d22);
  const handleMat = gunDark(0x16181d);
  const grip = gunGrip();
  const RB = 0.045; // barrel-cluster radius

  // === six rotary barrels (the signature) — wrapped in one group so the whole
  //     cluster spins together about the bore axis (driven by the Viewmodel) ===
  const barrels = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.cos(a) * RB, y = Math.sin(a) * RB;
    barrels.add(at(tube(0.013, 0.013, 0.62, barrelMat), x, y, -0.55));   // barrel
    barrels.add(at(tube(0.014, 0.014, 0.022, dark), x, y, -0.86));       // dark muzzle bore
  }
  g.add(barrels);

  // === clamp/spacer collars along the cluster + larger muzzle collar ===
  for (const cz of [-0.32, -0.48, -0.64]) g.add(at(tube(0.061, 0.061, 0.024, clamp), 0, 0, cz));
  g.add(at(tube(0.067, 0.067, 0.05, clamp), 0, 0, -0.83));           // muzzle clamp
  g.add(at(tube(0.07, 0.07, 0.014, dark), 0, 0, -0.862));            // front rim

  // === heavy rotor housing (the motor block) ===
  g.add(at(box(0.14, 0.14, 0.26, housing), 0, 0, -0.1));             // main housing
  g.add(at(tube(0.06, 0.06, 0.05, housingDk), 0, 0, -0.235));        // rotor front (barrels enter)
  g.add(at(tube(0.05, 0.05, 0.04, dark), 0, 0, -0.25));              // rotor recess
  g.add(at(box(0.12, 0.12, 0.07, housingDk), 0, 0, 0.05));           // rear cap
  for (const sy of [-1, 1]) g.add(at(box(0.146, 0.02, 0.2, housingDk), 0, sy * 0.055, -0.1)); // top/bottom seam rails
  g.add(at(tube(0.03, 0.03, 0.12, housingDk), 0, 0.085, 0.0));       // electric-motor drum on top

  // === top carry handle (U-shape, centred — never on the left) ===
  g.add(at(box(0.012, 0.05, 0.012, handleMat), -0.045, 0.1, -0.1));
  g.add(at(box(0.012, 0.05, 0.012, handleMat), 0.045, 0.1, -0.1));
  g.add(at(box(0.11, 0.014, 0.014, handleMat), 0, 0.123, -0.1));

  // === ammo can (below front) + feed chute + brass belt climbing in ===
  g.add(at(box(0.12, 0.1, 0.15, ammoBox), 0, -0.13, -0.08));         // ammo can
  g.add(at(box(0.122, 0.012, 0.05, dark), 0, -0.085, -0.08));        // can latch
  g.add(at(box(0.05, 0.07, 0.05, housingDk), 0.028, -0.05, -0.06));  // feed chute (right/far side)
  for (let i = 0; i < 5; i++) {                                       // brass belt
    const t = i / 4;
    g.add(at(box(0.013, 0.024, 0.014, brass), 0.05, -0.085 + t * 0.06, -0.06));
  }

  // === centred rear grip + trigger ===
  g.add(at(box(0.05, 0.13, 0.06, grip), 0, -0.11, 0.07, 0.16));
  g.add(at(box(0.052, 0.02, 0.062, dark), 0, -0.176, 0.083, 0.16));  // grip base
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 8, 16), housingDk);
  g.add(at(guard, 0, -0.055, 0.02, 0, Math.PI / 2));
  g.add(at(box(0.012, 0.028, 0.01, dark), 0, -0.05, 0.02));          // trigger

  g.userData.barrelSpin = barrels; // the cluster the Viewmodel spins while firing
  return { group: g, muzzle: -0.88 };
}

// Retro "Blast-O-Matic" gauge face: a red→green arc dial with ticks + needle.
function blastGaugeTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d'); const cx = 64, cy = 64;
  x.fillStyle = '#3a0c0e'; x.beginPath(); x.arc(cx, cy, 62, 0, 7); x.fill();
  const cols = ['#d23b2e', '#e07a22', '#ecc22a', '#9fd23a', '#34c66a'];
  for (let i = 0; i < cols.length; i++) {
    x.strokeStyle = cols[i]; x.lineWidth = 13;
    x.beginPath(); x.arc(cx, cy, 44, Math.PI + i * (Math.PI / cols.length), Math.PI + (i + 1) * (Math.PI / cols.length)); x.stroke();
  }
  x.strokeStyle = '#1a0405'; x.lineWidth = 2;
  for (let i = 0; i <= 12; i++) { const a = Math.PI + i * (Math.PI / 12); x.beginPath(); x.moveTo(cx + Math.cos(a) * 37, cy + Math.sin(a) * 37); x.lineTo(cx + Math.cos(a) * 51, cy + Math.sin(a) * 51); x.stroke(); }
  x.strokeStyle = '#120'; x.lineWidth = 3; const na = Math.PI + 0.75; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(na) * 42, cy + Math.sin(na) * 42); x.stroke();
  x.fillStyle = '#b89038'; x.beginPath(); x.arc(cx, cy, 8, 0, 7); x.fill();
  x.fillStyle = '#e7cda0'; x.font = 'italic 11px Georgia, serif'; x.textAlign = 'center'; x.fillText('Blast-O-Matic', cx, cy + 36);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
}

// --- Ray Gun (BO wonder weapon) — bespoke retro-raygun. A glowing plasma
//     chamber (tinted by the weapon's energyColor) wrapped in brass rings, a red
//     bulbous nose, a thin barrel to a flared studded muzzle cone + ball antenna,
//     the big "Blast-O-Matic" gauge dial with back spikes, a flame top-fin, a
//     loop sight, twin top carry-handles, and a ribbed grip. ---
function rayGunModel(weapon) {
  const color = weapon?.data?.energyColor ?? 0x46f060;
  const g = new THREE.Group();
  const red = gunMetal(0x7d1417, { metal: 0.7, rough: 0.3 });
  const redDk = gunMetal(0x4f0d10, { metal: 0.6, rough: 0.42 });
  const brass = gunMetal(0xb89038, { metal: 0.85, rough: 0.3 });
  const barrelMat = gunDark(0x17191e);
  const grip = gunGrip();
  const dark = gunDark(0x0e0f12);
  const plasma = plasmaGlow(color);
  const cyl = (r1, r2, len, m, seg = 16) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg), m);

  // === ROUND main body — a chunky horizontal cylinder is the bulk (pistol-sized) ===
  g.add(at(cyl(0.05, 0.05, 0.15, red), 0, 0.012, -0.03, Math.PI / 2)); // body cylinder (axis z)
  g.add(at(box(0.05, 0.026, 0.1, redDk), 0, 0.052, -0.02));            // small top spine
  for (let i = 0; i < 4; i++) g.add(at(box(0.044, 0.006, 0.011, dark), 0, 0.067, -0.05 + i * 0.022)); // slats

  // === round, FAT "Blast-O-Matic" gauge drum at the rear ===
  g.add(at(cyl(0.062, 0.062, 0.075, red), 0, 0.028, 0.05, 0, 0, Math.PI / 2));   // drum (axis x), thick
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.009, 8, 26), brass), -0.04, 0.028, 0.05, 0, Math.PI / 2, 0)); // rim
  g.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.057, 28), new THREE.MeshBasicMaterial({ map: blastGaugeTexture() })), -0.042, 0.028, 0.05, 0, -Math.PI / 2, 0)); // face
  g.add(at(cyl(0.01, 0.01, 0.085, brass, 12), 0, 0.028, 0.05, 0, 0, Math.PI / 2)); // hub
  // mirror the gold trim onto the far (+x) face
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.009, 8, 26), brass), 0.04, 0.028, 0.05, 0, Math.PI / 2, 0)); // rim
  g.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), brass), 0.0405, 0.028, 0.05, 0, Math.PI / 2, 0)); // hub cap
  for (let i = 0; i < 3; i++) { const a = -0.45 + i * 0.45; g.add(at(cyl(0.004, 0.0015, 0.06, brass, 6), Math.sin(a) * 0.025, 0.092, 0.05, a, 0, 0)); } // back spikes

  // === three-prong rotor on the back (separate steel colour), tucked behind the
  //     drum with a red cowl hanging over the top to half-cover it ===
  const steel = gunMetal(0x6a6f77, { metal: 0.85, rough: 0.32 });
  const rotor = new THREE.Group(); rotor.position.set(0, 0.02, 0.122);
  rotor.add(at(cyl(0.014, 0.014, 0.04, steel, 12), 0, 0, 0, Math.PI / 2)); // hub (axis z)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const blade = box(0.014, 0.058, 0.02, steel);
    blade.position.set(Math.cos(a) * 0.032, Math.sin(a) * 0.032, 0);
    blade.rotation.z = a; blade.rotation.x = 0.35; // angled prong
    rotor.add(blade);
  }
  g.add(rotor);
  g.add(at(box(0.062, 0.022, 0.075, redDk), 0, 0.06, 0.105, -0.25));  // cowl roof
  g.add(at(box(0.062, 0.045, 0.016, redDk), 0, 0.045, 0.152, -0.25)); // cowl back lip (overhangs the rotor)

  // === glowing plasma chamber wrapped in brass rings ===
  g.add(at(tube(0.038, 0.038, 0.12, plasma), 0, 0.012, -0.16));
  for (const cz of [-0.115, -0.16, -0.205]) g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.041, 0.009, 8, 18), brass), 0, 0.012, cz, 0, 0, Math.PI / 2));

  // === red bulb nose + barrel + flared cone + ball antenna ===
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.042, 14, 11), red), 0, 0.012, -0.235));
  g.add(at(tube(0.012, 0.012, 0.085, barrelMat), 0, 0.012, -0.3));
  for (const bz of [-0.275, -0.32]) g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.005, 8, 14), brass), 0, 0.012, bz, 0, 0, Math.PI / 2));
  g.add(at(cyl(0.034, 0.022, 0.055, red), 0, 0.012, -0.37, Math.PI / 2)); // flared cone (axis z)
  for (const cz of [-0.355, -0.388]) g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.005, 8, 14), brass), 0, 0.012, cz, 0, 0, Math.PI / 2));
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 5), brass), Math.cos(a) * 0.026, 0.012 + Math.sin(a) * 0.026, -0.375)); } // studs
  g.add(at(tube(0.003, 0.003, 0.05, brass), 0, 0.012, -0.42));     // antenna rod
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), red), 0, 0.012, -0.45)); // ball tip

  // === flame top-fin + loop sight ===
  g.add(at(box(0.01, 0.05, 0.08, redDk), 0, 0.058, -0.18));         // fin blade
  g.add(at(box(0.01, 0.022, 0.03, red), 0, 0.09, -0.155, 0.5));     // fin tip flick
  g.add(at(tube(0.003, 0.003, 0.08, brass), 0, 0.085, -0.2, Math.PI / 2)); // sight stalk
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 8, 14), brass), 0, 0.13, -0.2, 0, Math.PI / 2, 0)); // loop

  // === twin top carry-handle loops ===
  for (const hz of [-0.05, 0.02]) g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.005, 8, 14, Math.PI), dark), 0, 0.07, hz));

  // === ribbed grip + brass trigger guard + trigger ===
  g.add(at(box(0.042, 0.12, 0.055, grip), 0, -0.075, 0.02, 0.16));
  g.add(at(box(0.044, 0.016, 0.057, dark), 0, -0.13, 0.034, 0.16));
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.005, 8, 14), brass), 0, -0.04, -0.025, 0, Math.PI / 2, 0));
  g.add(at(box(0.009, 0.022, 0.008, dark), 0, -0.035, -0.025));
  g.add(at(box(0.022, 0.024, 0.004, scopeGlow(color)), -0.042, 0.02, -0.04)); // lightning emblem

  return { group: g, muzzle: -0.46 };
}

// Yellow/black hazard stripe band for the Thundergun barrels.
function hazardTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = '#d9a81c'; x.fillRect(0, 0, 64, 32);
  x.fillStyle = '#161616';
  for (let i = -32; i < 64; i += 22) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 11, 0); x.lineTo(i + 11 + 32, 32); x.lineTo(i + 32, 32); x.closePath(); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; return t;
}

// Glowing orange emitter grid (the Thundergun's "speaker" face).
function emitterGridTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#180a00'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#ff8a1e';
  for (let i = 0; i < 128; i += 16) for (let j = 0; j < 128; j += 16) x.fillRect(i + 2, j + 2, 12, 12);
  // fade the corners so it reads as a round lit core
  const grd = x.createRadialGradient(64, 64, 20, 64, 64, 70);
  grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(10,4,0,0.9)');
  x.fillStyle = grd; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; return t;
}

// --- Thundergun (BO wonder weapon) — bespoke dual-barrel wind cannon, sized
//     like the minigun. Two big barrels with banding + hazard bands ending in
//     glowing orange emitter mouths, a chunky rear mechanism housing, a side
//     arc-gauge panel, braided hoses, a top handle and a frame grip. ---
function thunderGunModel() {
  const g = new THREE.Group();
  const steel = gunMetal(0x676d75, { metal: 0.8, rough: 0.4 });
  const steelDk = gunMetal(0x3c4046, { metal: 0.75, rough: 0.45 });
  const dark = gunDark(0x15171b);
  const brass = gunMetal(0xb89038, { metal: 0.85, rough: 0.3 });
  const grip = gunGrip();
  const emitGlow = plasmaGlow(0xff6a14);
  const emitFace = new THREE.MeshBasicMaterial({ map: emitterGridTexture(), side: THREE.DoubleSide });
  const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.6, metalness: 0.3 });
  const cyl = (r1, r2, len, m, seg = 18) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg), m);
  const ring = (r, tube, m) => new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 22), m);

  // === rear mechanism housing ===
  g.add(at(cyl(0.11, 0.11, 0.2, steel), 0, 0, 0.0, Math.PI / 2));      // big drum (axis z)
  g.add(at(cyl(0.114, 0.114, 0.05, hazardMat), 0, 0, -0.02, Math.PI / 2)); // hazard band
  g.add(at(cyl(0.112, 0.112, 0.04, steelDk), 0, 0, 0.08, Math.PI / 2));    // rear collar
  g.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), steelDk), 0, 0, 0.101)); // rear cap
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 5), brass), Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0.101)); } // bolts

  // === two big barrels with banding, hazard bands + glowing emitter mouths ===
  for (const sx of [-1, 1]) {
    const bx = sx * 0.072;
    g.add(at(cyl(0.062, 0.062, 0.42, steel), bx, 0, -0.28, Math.PI / 2)); // barrel z -0.07..-0.49
    for (const bz of [-0.17, -0.27, -0.37]) g.add(at(ring(0.064, 0.011, steelDk), bx, 0, bz, 0, 0, Math.PI / 2)); // bands
    g.add(at(cyl(0.064, 0.064, 0.05, hazardMat), bx, 0, -0.11, Math.PI / 2)); // hazard band
    // flared emitter cowl + mouth rim + glowing orange grid face + glow cone
    g.add(at(cyl(0.085, 0.066, 0.075, steel), bx, 0, -0.51, Math.PI / 2));
    g.add(at(ring(0.084, 0.013, steelDk), bx, 0, -0.545, 0, 0, Math.PI / 2));
    g.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.07, 22), emitFace), bx, 0, -0.485));
    g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.058, 0.11, 18, 1, true), emitGlow), bx, 0, -0.5, -Math.PI / 2));
  }

  // === side arc-gauge panel (left, the visible side) ===
  g.add(at(box(0.02, 0.13, 0.13, steelDk), -0.115, -0.03, 0.0, 0, 0, 0.25)); // angled plate
  g.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.05, 22), new THREE.MeshBasicMaterial({ map: blastGaugeTexture() })), -0.126, -0.0, 0.0, 0, -Math.PI / 2, 0.25));
  g.add(at(cyl(0.018, 0.018, 0.03, dark, 12), -0.126, -0.07, 0.02, 0, 0, Math.PI / 2)); // knob

  // === braided hoses from the rear to under the barrels ===
  for (const sx of [-1, 1]) {
    g.add(at(cyl(0.014, 0.014, 0.22, dark, 8), sx * 0.06, -0.085, -0.1, 0.5, sx * 0.2, 0));
    g.add(at(cyl(0.014, 0.014, 0.12, dark, 8), sx * 0.075, -0.05, -0.32, Math.PI / 2 - 0.2, 0, 0));
  }

  // === top carry handle (squared loop) ===
  g.add(at(box(0.012, 0.05, 0.012, dark), -0.05, 0.13, -0.05));
  g.add(at(box(0.012, 0.05, 0.012, dark), 0.05, 0.13, -0.05));
  g.add(at(box(0.12, 0.014, 0.014, dark), 0, 0.155, -0.05));

  // === frame cradle + grip + trigger ===
  g.add(at(box(0.26, 0.022, 0.05, steelDk), 0, -0.12, -0.12));        // cradle bar
  g.add(at(box(0.05, 0.16, 0.06, grip), 0, -0.2, 0.0, 0.12));         // pistol grip
  g.add(at(box(0.052, 0.022, 0.062, dark), 0, -0.285, 0.01, 0.12));   // grip base
  g.add(at(ring(0.032, 0.007, steel), 0, -0.13, -0.06, 0, Math.PI / 2, 0)); // trigger guard
  g.add(at(box(0.011, 0.03, 0.01, dark), 0, -0.125, -0.06));          // trigger

  return { group: g, muzzle: -0.56 };
}

// --- RK-5: semi-futuristic 3-round-burst pistol (BO3). Two-tone gunmetal slide
//     with angled "shark-tooth" serrations, a gold ribbed compensator, a red
//     trigger + red fiber-optic sights, and a textured polymer frame + mag. ---
function rk5() {
  const g = new THREE.Group();
  const slide = gunMetal(0x474b54);     // medium gunmetal slide
  const slideHi = gunMetal(0x6c717b);   // brighter machined top + cuts
  const frame = gunDark(0x191b20);      // dark polymer frame
  const grip = gunGrip(0x24262c);       // stippled grip panels
  const brass = gunMetal(0xc6a14c);     // gold compensator
  const black = gunDark(0x0e0f12);
  const red = mat(0xc81810, { metal: 0.35, rough: 0.45, emissive: 0xff2a1e, ei: 0.5 });
  const redDot = mat(0xff3a2c, { metal: 0.1, rough: 0.4, emissive: 0xff2a1e, ei: 1.6 });

  // slide body + brighter top deck
  g.add(at(box(0.054, 0.052, 0.30, slide), 0, 0.042, -0.12));
  g.add(at(box(0.05, 0.015, 0.28, slideHi), 0, 0.07, -0.13));
  // long milled side windows (dark inset) on both flanks
  for (const sx of [-1, 1]) g.add(at(box(0.004, 0.024, 0.10, black), sx * 0.028, 0.042, -0.17));
  // angled "shark-tooth" cocking serrations on the rear slide flanks
  for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) {
    g.add(at(box(0.006, 0.044, 0.012, slideHi), sx * 0.028, 0.045, 0.03 - i * 0.02, 0.5));
  }
  // front slide nose
  g.add(at(box(0.052, 0.052, 0.05, slide), 0, 0.04, -0.27));

  // gold ribbed compensator at the muzzle
  g.add(at(box(0.05, 0.046, 0.07, brass), 0, 0.032, -0.305));
  for (let i = 0; i < 4; i++) g.add(at(box(0.054, 0.05, 0.005, black), 0, 0.032, -0.285 - i * 0.014)); // rib grooves
  g.add(at(tube(0.012, 0.012, 0.06, black), 0, 0.034, -0.33)); // muzzle bore

  // frame / dust cover under the slide
  g.add(at(box(0.048, 0.03, 0.24, frame), 0, 0.006, -0.11));
  g.add(at(box(0.044, 0.02, 0.12, frame), 0, -0.012, -0.2));

  // grip — angled, textured, finger grooves, extended mag
  g.add(at(box(0.05, 0.16, 0.062, frame), 0, -0.085, 0.01, 0.28));
  for (const sx of [-1, 1]) g.add(at(box(0.006, 0.13, 0.052, grip), sx * 0.027, -0.085, 0.01, 0.28));
  for (let i = 0; i < 4; i++) g.add(at(box(0.052, 0.006, 0.05, black), 0, -0.04 - i * 0.03, 0.018 + i * 0.009, 0.28)); // finger grooves
  g.add(at(box(0.046, 0.05, 0.055, black), 0, -0.18, -0.03, 0.28)); // extended mag base

  // trigger guard + RED trigger
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 8, 16), frame);
  g.add(at(guard, 0, -0.05, -0.06, 0, Math.PI / 2));
  g.add(at(box(0.012, 0.03, 0.01, red), 0, -0.045, -0.06));

  // red fiber-optic sights: front post + dual rear dots
  g.add(at(box(0.012, 0.022, 0.012, black), 0, 0.085, -0.235));
  g.add(at(box(0.008, 0.008, 0.008, redDot), 0, 0.094, -0.237));
  g.add(at(box(0.05, 0.022, 0.02, black), 0, 0.082, 0.012));
  g.add(at(box(0.008, 0.009, 0.008, redDot), -0.014, 0.092, 0.012));
  g.add(at(box(0.008, 0.009, 0.008, redDot), 0.014, 0.092, 0.012));

  return { group: g, muzzle: -0.36 };
}

// --- Remington New Army Model (BO2) — Old-West cap-and-ball revolver. Long
//     octagonal barrel + loading lever, a 6-flute engraved cylinder (the part
//     that ROTATES a chamber per shot), engraved steel frame, brass trigger
//     guard + backstrap, and a walnut plow-handle grip. Shared materials. ---
function newArmy() {
  const g = new THREE.Group();
  const blued = gunMetal(0x2f333a, { metal: 0.8, rough: 0.32 });    // dark blued barrel
  const bluedDk = gunMetal(0x23262c, { metal: 0.78, rough: 0.36 }); // near-black steel bits
  const engCyl = engravedSteel(0x5a5f67);                           // bright engraved cylinder
  const engFrame = engravedSteel(0x474c54);                         // engraved frame
  const wood = gunWood(0x5a3620);                                   // dark walnut
  const brass = gunMetal(0x9a8642, { metal: 0.85, rough: 0.34 });
  const dark = gunDark(0x0c0e11);

  // octagonal blued barrel (8-sided) + top sighting flat + bore
  g.add(at(tube(0.023, 0.023, 0.44, blued, 8), 0, 0.03, -0.26));
  g.add(at(box(0.015, 0.009, 0.42, bluedDk), 0, 0.05, -0.26));       // top flat / sight rib
  g.add(at(tube(0.011, 0.011, 0.05, dark, 12), 0, 0.03, -0.47));     // bore
  // loading lever assembly under the barrel
  g.add(at(box(0.014, 0.016, 0.3, bluedDk), 0, 0.004, -0.24));
  g.add(at(tube(0.011, 0.011, 0.12, bluedDk), 0, 0.004, -0.12));
  g.add(at(box(0.02, 0.022, 0.03, dark), 0, -0.002, -0.1));          // lever catch
  g.add(at(box(0.034, 0.055, 0.05, engFrame), 0, 0.012, -0.04));     // barrel lug / arbor

  // CYLINDER — rotating, engraved, fluted, chamber holes + stop notches
  const cyl = new THREE.Group();
  const cgeo = new THREE.CylinderGeometry(0.052, 0.052, 0.1, 24); cgeo.rotateX(Math.PI / 2);
  cyl.add(new THREE.Mesh(cgeo, engCyl));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const holeGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.11, 10); holeGeo.rotateX(Math.PI / 2);
    cyl.add(at(new THREE.Mesh(holeGeo, dark), Math.cos(a) * 0.034, Math.sin(a) * 0.034, 0));
    const flute = new THREE.BoxGeometry(0.016, 0.014, 0.092);        // scallop between chambers
    cyl.add(at(new THREE.Mesh(flute, bluedDk), Math.cos(a + 0.52) * 0.05, Math.sin(a + 0.52) * 0.05, 0, 0, 0, a + 0.52));
    const notch = new THREE.BoxGeometry(0.012, 0.008, 0.01);         // cylinder-stop notch on the rim
    cyl.add(at(new THREE.Mesh(notch, dark), Math.cos(a + 0.26) * 0.052, Math.sin(a + 0.26) * 0.052, 0.03));
  }
  cyl.position.set(0, 0.012, 0.03);
  g.add(cyl);

  // engraved frame: recoil shield + topstrap + standing breech
  g.add(at(box(0.052, 0.09, 0.1, engFrame), 0, 0.0, 0.1));
  g.add(at(box(0.056, 0.024, 0.11, engFrame), 0, 0.044, 0.095));     // topstrap
  g.add(at(box(0.05, 0.06, 0.03, bluedDk), 0, 0.0, 0.15));           // standing breech
  // hammer with thumb spur
  g.add(at(box(0.012, 0.045, 0.018, bluedDk), 0, 0.06, 0.16, -0.35));
  g.add(at(box(0.018, 0.012, 0.014, dark), 0, 0.08, 0.172, -0.35));
  // sights
  g.add(at(box(0.006, 0.013, 0.012, dark), 0, 0.058, -0.46));        // front blade
  g.add(at(box(0.02, 0.012, 0.012, bluedDk), 0, 0.058, 0.15));       // rear notch

  // brass trigger guard + trigger + grip frame
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.006, 10, 18), brass);
  g.add(at(guard, 0, -0.058, 0.06, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.028, 0.008, bluedDk), 0, -0.05, 0.06));       // trigger
  g.add(at(box(0.044, 0.022, 0.075, brass), 0, -0.04, 0.13));        // brass backstrap

  // walnut plow-handle grip + brass butt cap
  g.add(at(box(0.046, 0.15, 0.062, wood), 0, -0.105, 0.15, 0.42));
  g.add(at(box(0.048, 0.018, 0.052, brass), 0, -0.182, 0.18, 0.42));

  g.userData.cylinder = cyl;
  g.userData.chambers = 6;
  return { group: g, muzzle: -0.49 };
}

// --- FN Five-seveN (dual-wielded). A slim, modern polymer pistol: dark slide
//     with rear serrations + ejection port, a polymer frame with an accessory
//     rail + stippled grip, and green fiber-optic 3-dot sights. The dual-wield
//     mirroring is handled by the Viewmodel; this is just the single gun. ---
function fiveSeven() {
  const g = new THREE.Group();
  const slide = gunMetal(0x2c2f35, { metal: 0.6, rough: 0.42 });
  const slideTop = gunMetal(0x363a41);
  const frame = gunDark(0x17191e);
  const grip = gunGrip(0x202329);
  const black = gunDark(0x0c0e11);
  const green = ironSightGlow();

  // slide + top deck + ejection port + rear serrations
  g.add(at(box(0.048, 0.05, 0.28, slide), 0, 0.038, -0.11));
  g.add(at(box(0.05, 0.014, 0.26, slideTop), 0, 0.062, -0.12));
  g.add(at(box(0.05, 0.028, 0.05, black), 0, 0.04, -0.05));          // ejection port
  for (let i = 0; i < 6; i++) g.add(at(box(0.05, 0.04, 0.005, slideTop), 0, 0.04, 0.03 - i * 0.012));
  g.add(at(box(0.046, 0.048, 0.04, slide), 0, 0.038, -0.252));       // nose
  g.add(at(tube(0.011, 0.011, 0.05, black), 0, 0.038, -0.285));      // barrel

  // frame / dust cover + accessory rail
  g.add(at(box(0.044, 0.03, 0.22, frame), 0, 0.004, -0.1));
  g.add(at(box(0.04, 0.014, 0.1, frame), 0, -0.014, -0.18));
  for (let i = 0; i < 3; i++) g.add(at(box(0.042, 0.004, 0.012, black), 0, -0.024, -0.16 + i * 0.02));

  // stippled polymer grip (angled) + mag base
  g.add(at(box(0.046, 0.15, 0.062, grip), 0, -0.09, 0.0, 0.26));
  g.add(at(box(0.048, 0.02, 0.055, black), 0, -0.165, -0.018, 0.26));

  // trigger guard + trigger
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.006, 8, 16), frame);
  g.add(at(guard, 0, -0.05, -0.05, 0, Math.PI / 2));
  g.add(at(box(0.011, 0.028, 0.009, black), 0, -0.045, -0.05));

  // green fiber-optic 3-dot sights
  g.add(at(box(0.012, 0.02, 0.012, black), 0, 0.078, -0.23));
  g.add(at(box(0.008, 0.008, 0.008, green), 0, 0.087, -0.232));
  g.add(at(box(0.046, 0.02, 0.018, black), 0, 0.074, 0.016));
  g.add(at(box(0.008, 0.008, 0.008, green), -0.014, 0.084, 0.016));
  g.add(at(box(0.008, 0.008, 0.008, green), 0.014, 0.084, 0.016));

  return { group: g, muzzle: -0.31 };
}

// --- The Executioner (Taurus Judge) — a stainless .410 revolver that fires
//     shotshells. Bright stainless fluted barrel with a vented rib + red fiber
//     front sight, a big 5-shot fluted cylinder (rotates per shot), and a black
//     rubber grip with the signature red backstrap spine. Shared materials. ---
function executioner() {
  const g = new THREE.Group();
  const silver = gunMetal(0xb6bcc4, { metal: 0.6, rough: 0.26 });   // stainless body
  const silverHi = gunMetal(0xd2d7dd, { metal: 0.55, rough: 0.18 }); // polished edges / highlights
  const grey = gunMetal(0x3c4046, { metal: 0.6, rough: 0.4 });      // dark-grey rib / flute recesses
  const greyDk = gunDark(0x1c1f23);                                 // near-black grooves / bores
  const rubber = gunGrip(0x26282c);                                 // dark-grey rubber grip
  const red = mat(0xc01818, { metal: 0.25, rough: 0.5 });           // red spine
  const redDot = mat(0xff3a2c, { metal: 0.1, rough: 0.4, emissive: 0xff2a1e, ei: 1.7 });

  // === SHORT stainless barrel, heavily detailed ===
  g.add(at(box(0.05, 0.058, 0.26, silver), 0, 0.036, -0.17));        // barrel slab
  g.add(at(box(0.052, 0.006, 0.26, silverHi), 0, 0.066, -0.17));     // polished top edge
  // vented top rib + slots
  g.add(at(box(0.022, 0.016, 0.26, grey), 0, 0.072, -0.17));
  for (let i = 0; i < 5; i++) g.add(at(box(0.026, 0.01, 0.012, greyDk), 0, 0.072, -0.28 + i * 0.05));
  // three scalloped flutes per side (recessed grey) with bright lips
  for (const sx of [-1, 1]) for (const z of [-0.1, -0.18, -0.26]) {
    g.add(at(box(0.006, 0.03, 0.055, grey), sx * 0.027, 0.036, z));
    g.add(at(box(0.008, 0.04, 0.064, silverHi), sx * 0.0255, 0.036, z));
  }
  // thin "RAGING JUDGE MAGNUM" engraving line along each side
  for (const sx of [-1, 1]) g.add(at(box(0.005, 0.004, 0.22, greyDk), sx * 0.026, 0.016, -0.17));
  // full underlug + ejector-rod shroud + front sight ramp + muzzle crown
  g.add(at(box(0.026, 0.026, 0.24, silver), 0, 0.004, -0.16));
  g.add(at(tube(0.012, 0.012, 0.2, greyDk), 0, 0.0, -0.16));
  g.add(at(box(0.016, 0.026, 0.05, grey), 0, 0.086, -0.29));         // front sight ramp
  g.add(at(box(0.01, 0.014, 0.04, redDot), 0, 0.092, -0.292));       // RED fiber
  g.add(at(tube(0.024, 0.024, 0.02, silverHi, 14), 0, 0.036, -0.30)); // crown
  g.add(at(tube(0.013, 0.013, 0.05, greyDk, 12), 0, 0.036, -0.31));   // bore

  // === big fluted 5-shot cylinder (rotates) ===
  const cyl = new THREE.Group();
  const cgeo = new THREE.CylinderGeometry(0.066, 0.066, 0.14, 30); cgeo.rotateX(Math.PI / 2);
  cyl.add(new THREE.Mesh(cgeo, silver));
  cyl.add(at(tube(0.07, 0.07, 0.01, silverHi, 30), 0, 0, -0.065));   // front rim
  cyl.add(at(tube(0.07, 0.07, 0.01, silverHi, 30), 0, 0, 0.065));    // rear rim
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const holeGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.15, 14); holeGeo.rotateX(Math.PI / 2);
    cyl.add(at(new THREE.Mesh(holeGeo, greyDk), Math.cos(a) * 0.04, Math.sin(a) * 0.04, 0));            // chamber
    const fl = new THREE.BoxGeometry(0.026, 0.02, 0.12);
    cyl.add(at(new THREE.Mesh(fl, grey), Math.cos(a + 0.628) * 0.064, Math.sin(a + 0.628) * 0.064, 0, 0, 0, a + 0.628)); // flute
    cyl.add(at(box(0.012, 0.008, 0.012, greyDk), Math.cos(a + 0.314) * 0.066, Math.sin(a + 0.314) * 0.066, 0.05));       // stop notch
  }
  cyl.add(at(tube(0.012, 0.012, 0.16, silverHi, 10), 0, 0, 0));      // center pin
  cyl.position.set(0, 0.03, 0.03);
  g.add(cyl);

  // === stainless frame, detailed ===
  g.add(at(box(0.056, 0.105, 0.13, silver), 0, 0.02, 0.135));
  g.add(at(box(0.062, 0.026, 0.14, silver), 0, 0.066, 0.13));        // topstrap
  g.add(at(box(0.058, 0.006, 0.13, silverHi), 0, 0.072, 0.135));     // polished edge
  g.add(at(box(0.02, 0.014, 0.026, greyDk), 0, 0.084, 0.18));        // rear sight notch
  g.add(at(box(0.01, 0.03, 0.05, grey), -0.031, 0.03, 0.09));        // cylinder release latch
  for (const z of [0.1, 0.17]) g.add(at(tube(0.006, 0.006, 0.058, greyDk, 8), 0, 0.0, z, 0, Math.PI / 2)); // frame screws
  g.add(at(box(0.016, 0.05, 0.022, grey), 0, 0.08, 0.205, -0.4));    // exposed hammer
  g.add(at(box(0.022, 0.014, 0.016, greyDk), 0, 0.104, 0.218, -0.4)); // hammer spur

  // trigger guard + trigger
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.007, 10, 18), silver);
  g.add(at(guard, 0, -0.052, 0.08, 0, Math.PI / 2));
  g.add(at(box(0.012, 0.032, 0.01, greyDk), 0, -0.046, 0.08));

  // === dark-grey rubber grip: finger grooves + RED spine + medallion ===
  g.add(at(box(0.05, 0.17, 0.072, rubber), 0, -0.105, 0.18, 0.34));
  for (let i = 0; i < 4; i++) g.add(at(box(0.052, 0.006, 0.06, greyDk), 0, -0.05 - i * 0.035, 0.205 + i * 0.012, 0.34)); // finger grooves
  g.add(at(box(0.018, 0.16, 0.022, red), 0, -0.105, 0.222, 0.34));   // RED backstrap spine
  g.add(at(box(0.014, 0.014, 0.008, redDot), 0, -0.14, 0.155, 0.34)); // red medallion
  g.add(at(box(0.052, 0.022, 0.066, greyDk), 0, -0.188, 0.205, 0.34)); // base

  g.userData.cylinder = cyl;
  g.userData.chambers = 5;
  // it's a pistol — scale the whole thing down to sit just a touch above the M1911
  const S = 0.7;
  g.scale.setScalar(S);
  return { group: g, muzzle: -0.33 * S };
}

// --- CODA 9 (BO7) — futuristic automatic machine pistol. Two-tone: gunmetal
//     upper with a full-length picatinny rail + slide cutouts over an olive/FDE
//     polymer frame; a left-side accessory module (red label + teal accent), a
//     ribbed grip and an extended "DeltaCell" bulk magazine. Shared materials. ---
function coda9() {
  const g = new THREE.Group();
  const slide = gunMetal(0x6c7076, { metal: 0.6, rough: 0.32 });    // gunmetal upper
  const slideDk = gunMetal(0x44484e, { metal: 0.6, rough: 0.4 });
  const fde = gunMetal(0x6b5d3a, { metal: 0.25, rough: 0.62 });     // olive/FDE frame
  const fdeDk = gunMetal(0x4f4528, { metal: 0.25, rough: 0.66 });
  const black = gunDark(0x131519);
  const grip = gunGrip(0x322d1d);                                   // dark-olive stippled grip
  const teal = mat(0x1c5a52, { metal: 0.4, rough: 0.5 });           // module accent
  const red = mat(0xb01818, { metal: 0.2, rough: 0.5 });
  const redDot = mat(0xff3a2c, { metal: 0.1, rough: 0.4, emissive: 0xff2a1e, ei: 1.4 });

  // === gunmetal upper + full-length picatinny top rail ===
  g.add(at(box(0.052, 0.05, 0.34, slide), 0, 0.05, -0.1));
  g.add(at(box(0.03, 0.012, 0.34, slideDk), 0, 0.078, -0.1));       // rail base
  for (let i = 0; i < 12; i++) g.add(at(box(0.032, 0.01, 0.008, black), 0, 0.087, -0.25 + i * 0.026)); // rail teeth
  // slide side cutouts (3 oval slots up front + a long mid slot)
  for (let i = 0; i < 3; i++) g.add(at(box(0.054, 0.016, 0.012, black), 0, 0.06, -0.22 + i * 0.026));
  g.add(at(box(0.054, 0.022, 0.06, black), 0, 0.05, -0.06));
  g.add(at(box(0.05, 0.05, 0.04, slideDk), 0, 0.05, -0.26));        // slide nose
  g.add(at(tube(0.012, 0.012, 0.05, black), 0, 0.05, -0.29));       // muzzle

  // === olive/FDE polymer frame ===
  g.add(at(box(0.046, 0.05, 0.3, fde), 0, 0.012, -0.08));
  g.add(at(box(0.044, 0.016, 0.14, fdeDk), 0, -0.012, -0.16));      // dust cover
  g.add(at(box(0.002, 0.006, 0.09, black), 0.024, 0.02, -0.04));    // S/N engraving line
  g.add(at(box(0.01, 0.012, 0.012, red), 0.024, 0.034, 0.02));      // S/F safety marker

  // === left-side accessory module (MOD25) ===
  g.add(at(box(0.03, 0.05, 0.08, black), -0.04, 0.0, -0.15));       // module body (juts left)
  g.add(at(box(0.034, 0.034, 0.05, slideDk), -0.046, 0.0, -0.15));  // face
  g.add(at(box(0.02, 0.012, 0.03, red), -0.052, 0.006, -0.15));     // red warning label
  g.add(at(box(0.034, 0.006, 0.06, teal), -0.046, 0.026, -0.15));   // teal accent strip
  g.add(at(box(0.024, 0.012, 0.1, black), 0, -0.02, -0.22));        // front under-rail
  for (let i = 0; i < 4; i++) g.add(at(box(0.026, 0.008, 0.006, slideDk), 0, -0.026, -0.26 + i * 0.02));

  // === ribbed grip + extended DeltaCell magazine ===
  g.add(at(box(0.046, 0.16, 0.06, grip), 0, -0.085, 0.04, 0.22));
  for (let i = 0; i < 7; i++) g.add(at(box(0.048, 0.005, 0.05, black), 0, -0.03 - i * 0.022, 0.052 + i * 0.005, 0.22)); // grip ribs
  g.add(at(box(0.05, 0.1, 0.052, fdeDk), 0, -0.205, 0.012, 0.22));  // extended mag body
  g.add(at(box(0.052, 0.016, 0.054, black), 0, -0.258, 0.0, 0.22)); // floorplate
  for (let i = 0; i < 4; i++) g.add(at(box(0.053, 0.004, 0.05, black), 0, -0.17 - i * 0.018, 0.02 + i * 0.004, 0.22)); // mag ribs

  // === trigger guard + trigger + controls ===
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 8, 16), fde);
  g.add(at(guard, 0, -0.048, -0.04, 0, Math.PI / 2));
  g.add(at(box(0.011, 0.028, 0.009, black), 0, -0.042, -0.04));     // trigger
  g.add(at(box(0.012, 0.014, 0.03, slideDk), 0.024, 0.0, 0.0));     // takedown lever
  g.add(at(box(0.01, 0.018, 0.02, slideDk), 0.024, 0.012, 0.04));   // slide stop

  return { group: g, muzzle: -0.31 };
}

// --- MP5 — the classic H&K SMG, lightly modernised. Slim rounded receiver with
//     a short top rail, cylindrical vented handguard + teal accent, the HK
//     charging tube + hooded front sight, rotary drum rear sight, a curved
//     30-round magazine, angled grip and the A3 sliding stock. Shared materials. ---
function mp5() {
  const g = new THREE.Group();
  const black = gunMetal(0x2a2d33, { metal: 0.5, rough: 0.45 });    // receiver body
  const blackHi = gunMetal(0x3c4046, { metal: 0.5, rough: 0.38 });  // edges / top deck
  const dark = gunDark(0x141619);                                   // bores / details
  const grip = gunGrip(0x1c1e22);                                   // grip + handguard
  const steel = gunMetal(0x4a4e54, { metal: 0.7, rough: 0.32 });    // barrel
  const accent = mat(0x1c5a52, { metal: 0.4, rough: 0.5 });         // subtle modern accent

  // === RECEIVER: a solid slab BODY (the MP5 shape), not a tube ===
  g.add(at(box(0.058, 0.088, 0.28, black), 0, 0.012, -0.12));       // main receiver
  g.add(at(box(0.05, 0.026, 0.28, blackHi), 0, 0.064, -0.12));      // rounded top deck
  g.add(at(box(0.06, 0.05, 0.1, black), 0, -0.024, 0.02));          // trigger-group housing
  g.add(at(box(0.061, 0.03, 0.06, dark), 0, 0.024, -0.06));         // ejection-port recess
  g.add(at(box(0.062, 0.016, 0.02, accent), 0, 0.018, -0.14));      // teal panel accent
  for (let i = 0; i < 5; i++) g.add(at(box(0.026, 0.008, 0.006, dark), 0, 0.08, -0.08 + i * 0.02)); // short top rail

  // === slim boxy handguard + short barrel + sights ===
  g.add(at(box(0.05, 0.06, 0.14, grip), 0, 0.006, -0.3));
  for (let i = 0; i < 3; i++) g.add(at(box(0.052, 0.01, 0.012, dark), 0, 0.038, -0.27 - i * 0.03)); // top vents
  g.add(at(box(0.004, 0.052, 0.12, accent), 0.026, 0.006, -0.3));   // side accent
  g.add(at(tube(0.013, 0.013, 0.12, steel), 0, 0.012, -0.42));      // short barrel
  g.add(at(tube(0.02, 0.02, 0.03, dark), 0, 0.012, -0.47));         // flash hider
  const fhood = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 8, 14), black);
  g.add(at(fhood, 0, 0.05, -0.4));                                  // hooded front sight
  g.add(at(box(0.004, 0.024, 0.006, dark), 0, 0.044, -0.4));        // front post
  g.add(at(box(0.024, 0.02, 0.024, dark), -0.034, 0.044, -0.32));   // charging handle (HK slap)

  // === rear drum sight ===
  g.add(at(box(0.034, 0.03, 0.034, blackHi), 0, 0.074, 0.0));
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.046, 14), dark);
  g.add(at(drum, 0, 0.084, 0.0, 0, 0, Math.PI / 2));

  // === curved 30-round magazine (prominent, forward of the grip) ===
  g.add(at(box(0.04, 0.13, 0.052, black), 0, -0.11, -0.04, 0.12));
  g.add(at(box(0.04, 0.11, 0.05, black), 0, -0.21, -0.005, 0.26));  // curved lower
  g.add(at(box(0.042, 0.018, 0.054, dark), 0, -0.27, 0.012, 0.26)); // floorplate

  // === grip + trigger guard + selector ===
  g.add(at(box(0.044, 0.125, 0.05, grip), 0, -0.075, 0.085, 0.3));
  g.add(at(box(0.046, 0.02, 0.05, dark), 0, -0.142, 0.063, 0.3));
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 8, 16), black);
  g.add(at(guard, 0, -0.04, 0.045, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.026, 0.009, dark), 0, -0.034, 0.045));       // trigger
  g.add(at(box(0.012, 0.012, 0.012, dark), 0.026, 0.014, 0.06));    // SEF selector

  // === compact (collapsed) stock ===
  for (const sx of [-1, 1]) g.add(at(box(0.008, 0.01, 0.1, steel), sx * 0.022, 0.012, 0.12));
  g.add(at(box(0.055, 0.078, 0.02, dark), 0, 0.012, 0.16));         // butt pad

  return { group: g, muzzle: -0.48 };
}

// --- UZI — the iconic compact SMG. Boxy stamped sheet-metal receiver (no tube)
//     with horizontal reinforcement ribs, a top charging knob, a ribbed top
//     handguard, a short barrel with a knurled nut + eared front sight, the
//     centre grip with the magazine feeding straight THROUGH it, and no stock. ---
function uzi() {
  const g = new THREE.Group();
  const black = gunMetal(0x2c2f35, { metal: 0.55, rough: 0.42 });   // stamped receiver
  const blackHi = gunMetal(0x3e4248, { metal: 0.55, rough: 0.36 }); // edges / top
  const dark = gunDark(0x141619);                                   // grooves / bores
  const grip = gunGrip(0x222428);                                   // checkered grip
  const wood = gunMetal(0x5a5a4e, { metal: 0.3, rough: 0.6 });      // olive ribbed handguard
  const steel = gunMetal(0x6a6e74, { metal: 0.7, rough: 0.3 });     // barrel / knurled nut
  const red = mat(0xb01818, { metal: 0.2, rough: 0.5 });            // selector marking

  // === boxy stamped receiver (square body, NO tube) + side ribs ===
  g.add(at(box(0.06, 0.076, 0.26, black), 0, 0.015, -0.05));
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) g.add(at(box(0.004, 0.005, 0.24, dark), sx * 0.031, -0.012 + i * 0.018, -0.05));
  g.add(at(box(0.04, 0.012, 0.26, blackHi), 0, 0.056, -0.05));      // top deck
  g.add(at(box(0.03, 0.018, 0.05, dark), 0, 0.063, 0.0));           // charging-handle housing
  g.add(at(tube(0.012, 0.012, 0.02, steel), 0, 0.076, 0.0));        // top cocking knob

  // === ribbed top handguard (front) ===
  g.add(at(box(0.05, 0.042, 0.1, wood), 0, 0.038, -0.16));
  for (let i = 0; i < 5; i++) g.add(at(box(0.052, 0.004, 0.012, dark), 0, 0.058, -0.2 + i * 0.022));

  // === short barrel + knurled nut + eared front sight ===
  g.add(at(tube(0.022, 0.022, 0.045, steel, 16), 0, 0.02, -0.21));  // knurled barrel nut
  for (let i = 0; i < 4; i++) g.add(at(tube(0.024, 0.024, 0.004, dark, 16), 0, 0.02, -0.195 - i * 0.012));
  g.add(at(tube(0.011, 0.011, 0.1, steel), 0, 0.02, -0.28));        // barrel
  g.add(at(tube(0.016, 0.016, 0.02, dark), 0, 0.02, -0.32));        // muzzle
  g.add(at(box(0.004, 0.022, 0.006, dark), 0, 0.05, -0.25));        // front post
  for (const sx of [-1, 1]) g.add(at(box(0.004, 0.024, 0.006, dark), sx * 0.013, 0.05, -0.25)); // ears

  // === rear flip sight ===
  g.add(at(box(0.024, 0.018, 0.02, dark), 0, 0.062, 0.05));
  g.add(at(box(0.018, 0.014, 0.006, blackHi), 0, 0.07, 0.05));

  // === CENTRE grip with the magazine feeding THROUGH it ===
  g.add(at(box(0.045, 0.13, 0.05, grip), 0, -0.085, -0.02));
  for (let i = 0; i < 5; i++) g.add(at(box(0.047, 0.004, 0.046, dark), 0, -0.05 - i * 0.018, -0.02)); // checkering
  g.add(at(box(0.038, 0.13, 0.044, black), 0, -0.21, -0.02));       // magazine
  g.add(at(box(0.04, 0.016, 0.046, dark), 0, -0.275, -0.02));       // floorplate
  for (let i = 0; i < 4; i++) g.add(at(box(0.041, 0.004, 0.04, dark), 0, -0.17 - i * 0.022, -0.02)); // mag ribs

  // === trigger guard + trigger + selector ===
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 8, 16), black);
  g.add(at(guard, 0, -0.038, -0.08, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.026, 0.009, dark), 0, -0.032, -0.08));
  g.add(at(box(0.012, 0.012, 0.012, red), 0.031, 0.012, 0.02));     // selector marking

  // === rear end cap (NO stock) ===
  g.add(at(box(0.062, 0.078, 0.02, blackHi), 0, 0.015, 0.085));
  g.add(at(box(0.026, 0.026, 0.014, dark), 0, 0.0, 0.095));         // sling loop

  return { group: g, muzzle: -0.33 };
}

// --- KUDA (BO3) — semi-futuristic SMG. Two-tone: tan/FDE angular upper with
//     carbon hatch panels + lightening cutouts and a full-length top rail (flip
//     ring sight + rear block) over a dark barrel shroud with a big knurled
//     muzzle device; a long curved mag, skeletonised guard, and an angular tan
//     stock. Shared materials. ---
function kuda() {
  const g = new THREE.Group();
  const tan = gunMetal(0xa39a7c, { metal: 0.35, rough: 0.5 });      // FDE body
  const tanDk = gunMetal(0x837a5e, { metal: 0.35, rough: 0.55 });   // darker tan
  const dark = gunMetal(0x26282c, { metal: 0.5, rough: 0.5 });      // dark lower / shroud
  const black = gunDark(0x141619);
  const grip = gunGrip(0x1a1c20);                                   // black grip
  const steel = gunMetal(0x55595f, { metal: 0.7, rough: 0.32 });    // muzzle / barrel
  const carbon = gunMetalRidged(0x8c845f);                          // carbon-ish hatch panel

  // === tan angular upper: carbon panel + lightening cutouts + top rail ===
  g.add(at(box(0.058, 0.07, 0.34, tan), 0, 0.03, -0.08));           // main body
  g.add(at(box(0.06, 0.05, 0.12, carbon), 0, 0.03, -0.04));         // carbon panel
  g.add(at(box(0.062, 0.018, 0.04, black), 0, 0.034, -0.14));       // cutout
  g.add(at(box(0.062, 0.02, 0.03, black), 0, 0.026, -0.18));        // cutout
  g.add(at(box(0.062, 0.026, 0.03, black), 0, 0.022, 0.04));        // ejection port
  g.add(at(box(0.026, 0.012, 0.32, dark), 0, 0.07, -0.08));         // rail base
  for (let i = 0; i < 13; i++) g.add(at(box(0.028, 0.01, 0.008, black), 0, 0.079, -0.22 + i * 0.024)); // rail teeth

  // === flip front ring sight + rear sight block ===
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 8, 14), black);
  g.add(at(ring, 0, 0.1, -0.22));
  g.add(at(box(0.006, 0.03, 0.006, black), 0, 0.088, -0.22));       // post
  g.add(at(box(0.03, 0.03, 0.04, dark), 0, 0.092, 0.02));           // rear block
  g.add(at(box(0.024, 0.018, 0.01, black), 0, 0.104, 0.02));        // aperture

  // === dark barrel shroud + big knurled muzzle device ===
  g.add(at(box(0.05, 0.05, 0.24, dark), 0, -0.012, -0.18));
  g.add(at(box(0.052, 0.01, 0.2, black), 0, 0.012, -0.18));         // shroud seam
  g.add(at(tube(0.011, 0.011, 0.04, steel), 0, -0.012, -0.31));     // barrel
  g.add(at(tube(0.032, 0.032, 0.06, steel, 20), 0, -0.012, -0.33)); // knurled muzzle cap
  for (let i = 0; i < 5; i++) g.add(at(tube(0.034, 0.034, 0.003, black, 20), 0, -0.012, -0.31 - i * 0.011)); // grooves
  g.add(at(tube(0.018, 0.018, 0.03, black, 16), 0, -0.012, -0.37)); // bore
  g.add(at(box(0.01, 0.01, 0.02, steel), 0, -0.04, -0.27));         // QD button

  // === long STRAIGHT magazine (forward of the grip) ===
  g.add(at(box(0.036, 0.25, 0.05, black), 0, -0.185, -0.03));       // straight mag body
  g.add(at(box(0.038, 0.016, 0.052, dark), 0, -0.315, -0.03));      // floorplate
  for (let i = 0; i < 6; i++) g.add(at(box(0.037, 0.004, 0.051, dark), 0, -0.09 - i * 0.035, -0.03)); // witness marks

  // === grip + skeletonised guard + controls ===
  g.add(at(box(0.04, 0.13, 0.05, grip), 0, -0.07, 0.1, 0.28));
  for (let i = 0; i < 6; i++) g.add(at(box(0.042, 0.005, 0.046, black), 0, -0.03 - i * 0.018, 0.114 + i * 0.005, 0.28)); // grip ribs
  g.add(at(box(0.01, 0.006, 0.06, tan), 0, -0.052, 0.04));          // guard bottom bar
  g.add(at(box(0.01, 0.04, 0.006, tan), 0, -0.035, 0.07));          // guard front bar
  g.add(at(box(0.01, 0.026, 0.009, black), 0, -0.03, 0.04));        // trigger
  g.add(at(box(0.014, 0.012, 0.03, dark), 0.032, 0.04, -0.02));     // charging handle
  g.add(at(box(0.012, 0.014, 0.012, tan), 0.031, 0.0, 0.06));       // bolt release

  // === angular skeletonised TAN stock ===
  g.add(at(box(0.03, 0.05, 0.1, tan), 0, 0.03, 0.15));              // stock arm
  g.add(at(box(0.012, 0.085, 0.018, tan), 0, 0.008, 0.21));         // butt upright
  g.add(at(box(0.04, 0.085, 0.014, tanDk), 0, 0.008, 0.222));       // butt pad
  g.add(at(box(0.012, 0.04, 0.05, tan), 0, -0.025, 0.18));          // lower strut

  return { group: g, muzzle: -0.38 };
}

// --- PPSh-41 — WW2 Soviet SMG. Perforated steel barrel shroud with oval cooling
//     slots + an angled compensator, a hooded front sight, blued receiver with a
//     rear sight + bolt handle, the iconic 71-round drum magazine, and a
//     one-piece reddish wooden stock. Shared materials. ---
function ppsh() {
  const g = new THREE.Group();
  const wood = gunWood(0x6a3526);                                  // reddish PPSh wood
  const woodDk = gunWood(0x4e2718);
  const steel = gunMetal(0x3c4045, { metal: 0.65, rough: 0.4 });   // blued steel
  const steelDk = gunMetal(0x2a2d31, { metal: 0.6, rough: 0.45 });
  const dark = gunDark(0x121316);                                  // bores / slot insets
  const drumMat = gunMetal(0x44484e, { metal: 0.6, rough: 0.42 }); // drum

  // === perforated barrel shroud + oval cooling slots ===
  g.add(at(box(0.05, 0.055, 0.34, steel), 0, 0.045, -0.24));
  for (let i = 0; i < 6; i++) g.add(at(box(0.052, 0.024, 0.03, dark), 0, 0.06, -0.38 + i * 0.05));        // top slots
  for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) g.add(at(box(0.004, 0.02, 0.026, dark), sx * 0.026, 0.045, -0.37 + i * 0.05)); // side slots
  g.add(at(box(0.054, 0.062, 0.05, steelDk), 0, 0.05, -0.42, 0.28)); // angled compensator
  g.add(at(tube(0.012, 0.012, 0.06, dark), 0, 0.045, -0.44));        // bore
  g.add(at(tube(0.011, 0.011, 0.3, steelDk), 0, 0.045, -0.26));      // barrel

  // === hooded front sight ===
  g.add(at(box(0.016, 0.012, 0.016, steelDk), 0, 0.078, -0.4));
  const fhood = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 8, 12), steelDk);
  g.add(at(fhood, 0, 0.092, -0.4));
  g.add(at(box(0.003, 0.014, 0.004, dark), 0, 0.09, -0.4));

  // === receiver + rear sight + bolt handle ===
  g.add(at(box(0.052, 0.06, 0.12, steel), 0, 0.04, -0.04));
  g.add(at(box(0.05, 0.014, 0.1, steelDk), 0, 0.072, -0.04));        // bolt-cover hump
  g.add(at(box(0.05, 0.022, 0.04, steelDk), 0, 0.072, -0.02));       // rear sight base
  g.add(at(box(0.03, 0.016, 0.012, dark), 0, 0.086, -0.02));         // rear leaf
  g.add(at(box(0.014, 0.012, 0.03, steelDk), 0.03, 0.05, -0.01));    // bolt handle (right)

  // === 71-round drum magazine (round face to the side) ===
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.048, 30), drumMat);
  g.add(at(drum, 0, -0.075, -0.13, 0, 0, Math.PI / 2));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.054, 16), steelDk);
  g.add(at(hub, 0, -0.075, -0.13, 0, 0, Math.PI / 2));
  const ringD = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.005, 8, 28), steelDk);
  g.add(at(ringD, -0.026, -0.075, -0.13, 0, Math.PI / 2));           // ring on the visible face

  // === one-piece reddish wooden stock ===
  g.add(at(box(0.046, 0.05, 0.16, wood), 0, -0.008, 0.07));          // wrist
  g.add(at(box(0.05, 0.09, 0.14, wood), 0, -0.018, 0.18));           // buttstock
  g.add(at(box(0.052, 0.1, 0.018, woodDk), 0, -0.018, 0.25));        // butt plate
  g.add(at(box(0.044, 0.045, 0.09, wood), 0, -0.04, 0.03, 0.18));    // wrist underside

  // === trigger guard + trigger ===
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.005, 8, 16), steelDk);
  g.add(at(guard, 0, -0.022, -0.0, 0, Math.PI / 2));
  g.add(at(box(0.009, 0.022, 0.008, dark), 0, -0.018, -0.0));

  return { group: g, muzzle: -0.45 };
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
  if (weapon.data.name === 'RK-5') return rk5();
  if (weapon.data.name === 'NEW ARMY') return newArmy();
  if (weapon.data.name === 'FIVE-SEVEN') return fiveSeven();
  if (weapon.data.name === 'EXECUTIONER') return executioner();
  if (weapon.data.name === 'CODA 9') return coda9();
  if (weapon.data.name === 'MP5') return mp5();
  if (weapon.data.name === 'UZI') return uzi();
  if (weapon.data.name === 'KUDA') return kuda();
  if (weapon.data.name === 'PPSH-41') return ppsh();
  if (weapon.data.name === 'K-Vector') return kvector();
  if (weapon.data.name === 'GALIL') return galil();
  if (weapon.data.name === 'OLYMPIA') return olympia();
  if (weapon.data.name === 'DSR-50') return dsr();
  if (weapon.data.name === 'HK21') return hk21();
  if (weapon.data.name === 'M72 LAW') return m72();
  if (weapon.data.name === 'RAY GUN') return rayGunModel(weapon);
  if (weapon.data.name === 'THUNDERGUN') return thunderGunModel();
  if (weapon.data.name === 'DEATH MACHINE') return deathMachine();
  if (cat === 'wonder') return wonder(vm, weapon.data.projectileType === 'cone');
  const fn = BUILDERS[cat] || assaultRifle;
  return fn(vm);
}
