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
  g.add(at(box(0.04, 0.022, 0.12, frameMat), 0, -0.018, -0.155));      // dust cover

  // --- grip (near-vertical, seated up into the frame), stippled panels, mag ---
  g.add(at(box(0.046, 0.15, 0.058, backMat), 0, -0.062, 0.006, 0.14));  // backstrap (ridged), top buried in frame
  for (const sx of [-1, 1]) g.add(at(box(0.007, 0.13, 0.05, gripMat), sx * 0.027, -0.062, 0.006, 0.14)); // side panels
  g.add(at(box(0.046, 0.02, 0.052, blackMat), 0, -0.138, -0.005, 0.14)); // magazine floorplate (flush at grip base)
  g.add(at(box(0.028, 0.022, 0.05, frameMat), 0, 0.006, 0.02, 0.3));     // beavertail grip safety

  // --- hammer + trigger guard + trigger ---
  g.add(at(box(0.012, 0.028, 0.014, blackMat), 0, 0.058, 0.05, -0.394)); // skeletonized hammer
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.006, 8, 16), frameMat);
  g.add(at(guard, 0, -0.035, -0.03, 0, Math.PI / 2));                    // trigger guard loop
  g.add(at(box(0.01, 0.028, 0.009, blackMat), 0, -0.025, -0.03));        // trigger

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
  g.add(at(box(0.01, 0.024, 0.01, bolt), 0, 0.106, -0.34));            // front post (level with rear dots)
  g.add(at(box(0.008, 0.008, 0.008, green), 0, 0.118, -0.342));        // front dot
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
  g.add(at(box(0.044, 0.12, 0.05, grip), 0, -0.094, 0.04, 0.14));
  g.add(at(box(0.046, 0.018, 0.052, dark), 0, -0.161, 0.032, 0.14));    // grip base cap

  // === trigger guard + trigger ===
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 8, 16), receiverDk);
  g.add(at(guard, 0, -0.052, -0.035, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.026, 0.009, dark), 0, -0.047, -0.035));

  // === straight steel magazine (one body, slight forward rake — the segmented
  //     banana version read badly) ===
  g.add(at(box(0.05, 0.032, 0.062, receiver), 0, -0.05, -0.1));        // mag well lip
  g.add(at(box(0.046, 0.2, 0.056, magMat), 0, -0.15, -0.097, -0.08));  // mag body (seated up into the well)
  g.add(at(box(0.048, 0.018, 0.058, dark), 0, -0.25, -0.089, -0.08));  // floorplate
  for (let i = 0; i < 4; i++) g.add(at(box(0.048, 0.006, 0.05, receiverDk), 0, -0.1 - i * 0.03, -0.126 + i * 0.002, -0.08)); // pressed ribs

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

  // === walnut wrist + SCULPTED buttstock + recoil pad (a shaped stock with a
  //     swept comb and a dropped belly/toe — not two stacked cubes) ===
  g.add(at(box(0.046, 0.064, 0.12, wood), 0, -0.012, 0.03));          // wrist (grip)
  g.add(at(box(0.05, 0.05, 0.07, woodChk), 0, -0.02, 0.03));          // checkered grip panel
  g.add(at(box(0.05, 0.05, 0.2, wood), 0, 0.018, 0.16, -0.06));       // comb line (sweeps up to the heel)
  g.add(at(box(0.05, 0.066, 0.15, wood), 0, -0.03, 0.12, -0.16));     // belly drops toward the toe
  g.add(at(box(0.046, 0.024, 0.13, woodChk), 0, 0.05, 0.13, -0.05));  // raised cheek comb
  g.add(at(box(0.014, 0.022, 0.05, wood), 0, 0.052, 0.06));           // comb nose
  g.add(at(box(0.05, 0.13, 0.024, pad), 0, -0.006, 0.246, -0.08));    // angled rubber recoil pad

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
  g.add(at(box(0.044, 0.12, 0.05, grip), 0, -0.094, 0.0, 0.14));
  g.add(at(box(0.046, 0.018, 0.052, dark), 0, -0.161, -0.008, 0.14));  // grip base
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
  g.add(at(box(0.044, 0.12, 0.05, grip), 0, -0.094, 0.02, 0.14));
  g.add(at(box(0.046, 0.018, 0.052, dark), 0, -0.161, 0.012, 0.14));   // grip base
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
  // angled "shark-tooth" cocking serrations on the rear slide flanks (kept fully
  // on the slide — the rear row used to overhang the back edge)
  for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) {
    g.add(at(box(0.006, 0.044, 0.012, slideHi), sx * 0.028, 0.045, 0.0 - i * 0.02, 0.5));
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
  g.scale.setScalar(0.8); // hand-sized, not a cannon (~20% down in the viewmodel)
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

  // stippled polymer grip (seated up into the frame) + mag base
  g.add(at(box(0.046, 0.15, 0.062, grip), 0, -0.072, 0.006, 0.14));
  g.add(at(box(0.048, 0.02, 0.055, black), 0, -0.153, -0.005, 0.14));

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
  g.add(at(box(0.02, 0.014, 0.026, greyDk), 0, 0.092, 0.18));        // rear sight notch (level with front ramp)
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
  // it's a pistol — scale the whole thing down so it reads hand-sized, not a
  // Desert Eagle (0.7 → 0.56, another ~20% off in the viewmodel)
  const S = 0.56;
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
  g.add(at(box(0.046, 0.16, 0.06, grip), 0, -0.079, 0.04, 0.14));
  g.add(at(box(0.05, 0.1, 0.052, fdeDk), 0, -0.203, 0.023, 0.14));  // extended mag body
  g.add(at(box(0.052, 0.016, 0.054, black), 0, -0.252, 0.016, 0.14)); // floorplate

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
  const black = gunMetal(0x2a2d33, { metal: 0.52, rough: 0.42 });   // receiver body
  const blackHi = gunMetal(0x3c4046, { metal: 0.5, rough: 0.36 });  // edges / top
  const dark = gunDark(0x141619);                                   // bores / details
  const grip = gunGrip(0x1c1e22);                                   // grip + handguard
  const steel = gunMetal(0x4a4e54, { metal: 0.72, rough: 0.3 });    // barrel / cocking tube

  // === slim receiver body (the MP5 silhouette) ===
  g.add(at(box(0.048, 0.072, 0.32, black), 0, 0.014, -0.1));        // main receiver
  g.add(at(tube(0.026, 0.026, 0.3, blackHi, 16), 0, 0.042, -0.11)); // rounded top spine
  g.add(at(box(0.013, 0.026, 0.05, dark), 0.026, 0.02, -0.04));     // ejection port (right)
  // HK forward cocking tube along the upper-left + the slap charging handle
  g.add(at(tube(0.012, 0.012, 0.3, steel), -0.02, 0.044, -0.3));
  g.add(at(box(0.014, 0.038, 0.018, dark), -0.036, 0.06, -0.44, 0, 0, -0.35)); // cocking handle (HK slap)

  // === slimline handguard + short barrel + hooded front sight ===
  g.add(at(box(0.044, 0.05, 0.16, grip), 0, 0.0, -0.34));
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) g.add(at(box(0.005, 0.03, 0.012, dark), sx * 0.023, 0.0, -0.4 + i * 0.04)); // finger grooves
  g.add(at(tube(0.012, 0.012, 0.16, steel), 0, 0.012, -0.44));      // barrel
  g.add(at(tube(0.019, 0.019, 0.04, dark, 14), 0, 0.012, -0.52));   // flash hider
  g.add(at(tube(0.012, 0.012, 0.018, dark, 12), 0, 0.012, -0.55));  // bore
  g.add(at(box(0.024, 0.03, 0.03, black), 0, 0.04, -0.44));         // front sight base
  const fhood = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0045, 8, 16), dark);
  g.add(at(fhood, 0, 0.066, -0.44));                                // hooded ring front sight
  g.add(at(box(0.004, 0.02, 0.006, dark), 0, 0.058, -0.44));        // front post

  // === low-profile HK rotary drum rear sight (no tall hump) ===
  g.add(at(box(0.03, 0.024, 0.03, blackHi), 0, 0.058, 0.0));        // sight base
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.03, 14), dark);
  g.add(at(drum, 0, 0.072, 0.0, 0, 0, Math.PI / 2));                // rotary drum (axis x)

  // === STRAIGHT 30-round magazine (one box, slight forward rake — no curve) ===
  g.add(at(box(0.046, 0.034, 0.058, black), 0, -0.05, -0.04));      // mag well
  g.add(at(box(0.04, 0.17, 0.05, black), 0, -0.15, -0.026, 0.13));  // straight mag body
  g.add(at(box(0.042, 0.018, 0.052, dark), 0, -0.236, -0.01, 0.13)); // floorplate

  // === grip + trigger guard + SEF selector ===
  g.add(at(box(0.044, 0.12, 0.05, grip), 0, -0.066, 0.06, 0.14));
  g.add(at(box(0.046, 0.018, 0.05, dark), 0, -0.133, 0.052, 0.14));  // grip cap
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 8, 16), black);
  g.add(at(guard, 0, -0.03, 0.0, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.024, 0.008, dark), 0, -0.026, 0.0));         // trigger
  g.add(at(box(0.012, 0.014, 0.024, blackHi), -0.026, 0.006, 0.02)); // SEF selector (left)

  // === deployed A3 retractable stock (substantial — reaches the shoulder) ===
  g.add(at(box(0.046, 0.062, 0.05, black), 0, 0.014, 0.07));        // stock socket
  for (const sx of [-1, 1]) g.add(at(box(0.011, 0.014, 0.16, steel), sx * 0.019, 0.014, 0.16)); // twin side rails
  g.add(at(box(0.034, 0.016, 0.1, blackHi), 0, 0.042, 0.13));       // top strut / cheek
  g.add(at(box(0.05, 0.082, 0.024, dark), 0, 0.01, 0.235));         // butt plate
  g.add(at(box(0.03, 0.07, 0.02, black), 0, 0.01, 0.222));          // pad neck

  return { group: g, muzzle: -0.54 };
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
  g.add(at(box(0.004, 0.05, 0.006, dark), 0, 0.045, -0.25));        // front post (taller — sight line matches the rear)
  for (const sx of [-1, 1]) g.add(at(box(0.004, 0.05, 0.006, dark), sx * 0.013, 0.045, -0.25)); // ears

  // === rear flip sight ===
  g.add(at(box(0.024, 0.018, 0.02, dark), 0, 0.058, 0.05));
  g.add(at(box(0.018, 0.014, 0.006, blackHi), 0, 0.062, 0.05));     // notch (level with the front post)

  // === CENTRE grip with the magazine feeding THROUGH it ===
  g.add(at(box(0.045, 0.13, 0.05, grip), 0, -0.085, -0.02));
  g.add(at(box(0.038, 0.13, 0.044, black), 0, -0.21, -0.02));       // magazine
  g.add(at(box(0.04, 0.016, 0.046, dark), 0, -0.275, -0.02));       // floorplate

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
  g.add(at(box(0.006, 0.026, 0.006, black), 0, 0.085, -0.22));      // post
  g.add(at(box(0.03, 0.024, 0.04, dark), 0, 0.08, 0.02));           // rear block (lowered)
  g.add(at(box(0.024, 0.014, 0.01, black), 0, 0.097, 0.02));        // aperture (level with the post)

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

  // === grip + skeletonised guard + controls (grip raised to meet the body —
  //     it floated below) ===
  g.add(at(box(0.04, 0.13, 0.05, grip), 0, -0.042, 0.1, 0.14));
  g.add(at(box(0.01, 0.006, 0.06, tan), 0, -0.05, 0.04));           // guard bottom bar
  g.add(at(box(0.01, 0.04, 0.006, tan), 0, -0.033, 0.07));          // guard front bar
  g.add(at(box(0.01, 0.026, 0.009, black), 0, -0.028, 0.04));       // trigger
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

  // === 71-round drum magazine (rotated so the round face sits to the side) ===
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.048, 30), drumMat);
  g.add(at(drum, 0, -0.075, -0.13, Math.PI / 2, 0, 0));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.054, 16), steelDk);
  g.add(at(hub, 0, -0.075, -0.13, Math.PI / 2, 0, 0));
  const ringD = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.005, 8, 28), steelDk);
  g.add(at(ringD, 0, -0.075, -0.105));                               // ring on the visible face

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

// --- MP40 — WW2 German SMG. Tubular dark-grey receiver with a flat top + ribs,
//     a thin barrel with the resting bar + hooded front sight, flip rear sight,
//     left cocking handle, a bakelite mag housing + straight stick magazine, a
//     bakelite grip and a folded under-folding stock. Shared materials. ---
function mp40() {
  const g = new THREE.Group();
  const steel = gunMetal(0x34373c, { metal: 0.62, rough: 0.3 });   // dark-grey sheen
  const steelDk = gunMetal(0x222428, { metal: 0.6, rough: 0.36 });
  const steelHi = gunMetal(0x44484e, { metal: 0.62, rough: 0.26 });
  const bake = gunMetal(0x2a2420, { metal: 0.15, rough: 0.6 });    // bakelite housing
  const grip = gunGrip(0x241f1a);                                 // bakelite grip
  const dark = gunDark(0x121316);
  const mag = gunMetal(0x3a3d42, { metal: 0.55, rough: 0.4 });

  // === tubular receiver (round body) with flat top + end rings ===
  g.add(at(tube(0.044, 0.044, 0.26, steel, 22), 0, 0.03, -0.04));
  g.add(at(box(0.05, 0.02, 0.24, steelHi), 0, 0.066, -0.04));       // flat top strip
  g.add(at(tube(0.046, 0.046, 0.012, steelDk, 22), 0, 0.03, 0.06)); // rear ring
  g.add(at(tube(0.046, 0.046, 0.012, steelDk, 22), 0, 0.03, -0.16));// front ring

  // === barrel + muzzle nut + resting bar + hooded front sight ===
  g.add(at(tube(0.013, 0.013, 0.28, steel), 0, 0.03, -0.31));
  g.add(at(tube(0.02, 0.02, 0.03, steelDk, 16), 0, 0.03, -0.45));   // muzzle nut
  g.add(at(tube(0.014, 0.014, 0.02, dark, 14), 0, 0.03, -0.47));    // bore
  g.add(at(box(0.018, 0.03, 0.018, steelDk), 0, 0.008, -0.26));     // resting-bar mount
  g.add(at(box(0.06, 0.012, 0.012, steelDk), 0, -0.01, -0.26));     // resting bar
  g.add(at(box(0.012, 0.036, 0.014, steelDk), 0, 0.058, -0.43));    // front sight base (taller — raises the sight line to the rear)
  const fhood = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 8, 12), steelDk);
  g.add(at(fhood, 0, 0.086, -0.43));
  g.add(at(box(0.003, 0.012, 0.004, dark), 0, 0.082, -0.43));

  // === rear flip sight + cocking handle (left) ===
  g.add(at(box(0.02, 0.018, 0.018, steelDk), 0, 0.07, 0.04));
  g.add(at(box(0.016, 0.012, 0.006, dark), 0, 0.082, 0.04));
  g.add(at(box(0.012, 0.012, 0.02, steelHi), -0.044, 0.04, -0.02));

  // === bakelite mag housing + straight stick magazine ===
  g.add(at(box(0.046, 0.06, 0.06, bake), 0, -0.03, -0.1));          // housing / fore-grip
  g.add(at(box(0.036, 0.18, 0.044, mag), 0, -0.16, -0.1, 0.08));    // straight mag (slight lean)
  g.add(at(box(0.038, 0.016, 0.046, dark), 0, -0.245, -0.118, 0.08)); // floorplate

  // === bakelite pistol grip + trigger guard ===
  g.add(at(box(0.04, 0.12, 0.048, grip), 0, -0.054, 0.06, 0.14));
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.005, 8, 16), steelDk);
  g.add(at(guard, 0, -0.03, 0.02, 0, Math.PI / 2));
  g.add(at(box(0.009, 0.022, 0.008, dark), 0, -0.025, 0.02));

  // === folded under-folding stock (compact) ===
  g.add(at(box(0.014, 0.012, 0.16, steelDk), 0, -0.044, 0.0));      // strut
  g.add(at(box(0.05, 0.02, 0.04, steelDk), 0, -0.044, 0.08));       // folded shoulder piece

  return { group: g, muzzle: -0.48 };
}

// --- XM4 / Commando (M4 carbine) — the classic AR. Barrel + A2 birdcage flash
//     hider, A-frame front sight tower, ribbed handguard, flat-top upper with a
//     short rail + rear drum sight, forward assist + ejection port, curved
//     STANAG mag, A2 grip and a collapsible carbine stock. Shared materials. ---
function xm4() {
  const g = new THREE.Group();
  const black = gunMetal(0x26282c, { metal: 0.5, rough: 0.45 });   // receiver
  const blackHi = gunMetal(0x383b40, { metal: 0.5, rough: 0.4 });
  const poly = gunDark(0x17181c);                                  // handguard/grip/stock
  const steel = gunMetal(0x44484e, { metal: 0.7, rough: 0.3 });    // barrel
  const mag = gunMetal(0x3a3d42, { metal: 0.55, rough: 0.4 });
  const dark = gunDark(0x101113);

  // === barrel + A2 birdcage flash hider ===
  g.add(at(tube(0.012, 0.012, 0.16, steel), 0, 0.03, -0.42));
  g.add(at(tube(0.018, 0.018, 0.05, dark, 14), 0, 0.03, -0.52));    // flash hider
  for (let i = 0; i < 3; i++) g.add(at(tube(0.02, 0.02, 0.003, blackHi, 14), 0, 0.03, -0.5 - i * 0.012));
  g.add(at(tube(0.012, 0.012, 0.02, dark, 12), 0, 0.03, -0.545));   // bore

  // === A-frame front sight tower + gas block ===
  g.add(at(box(0.038, 0.05, 0.045, black), 0, 0.052, -0.4));
  g.add(at(box(0.016, 0.05, 0.022, black), 0, 0.088, -0.4));        // upright
  g.add(at(box(0.028, 0.016, 0.02, black), 0, 0.112, -0.4));        // sight ears
  g.add(at(box(0.016, 0.016, 0.034, steel), 0, 0.016, -0.43));      // gas block under

  // === chunky ribbed handguard (the M4's bulk) ===
  g.add(at(box(0.074, 0.072, 0.2, poly), 0, 0.028, -0.28));
  g.add(at(box(0.066, 0.066, 0.2, blackHi), 0, 0.028, -0.28));      // inner core (rounder read)
  for (let i = 0; i < 7; i++) g.add(at(box(0.076, 0.006, 0.018, dark), 0, 0.066, -0.37 + i * 0.026)); // top ribs
  for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) g.add(at(box(0.006, 0.05, 0.018, dark), sx * 0.038, 0.028, -0.37 + i * 0.026)); // side ribs

  // === flat-top upper receiver + rail + rear drum sight ===
  g.add(at(box(0.062, 0.062, 0.2, black), 0, 0.028, -0.08));
  g.add(at(box(0.064, 0.016, 0.2, blackHi), 0, 0.062, -0.08));      // flat top
  for (let i = 0; i < 8; i++) g.add(at(box(0.066, 0.01, 0.006, dark), 0, 0.072, -0.15 + i * 0.02)); // rail teeth
  g.add(at(box(0.026, 0.034, 0.03, black), 0, 0.086, 0.02));        // rear sight tower
  g.add(at(tube(0.013, 0.013, 0.018, dark, 12), 0, 0.1, 0.02, 0, 0, Math.PI / 2)); // drum
  g.add(at(box(0.018, 0.018, 0.026, blackHi), 0.034, 0.04, -0.02)); // forward assist (right)
  g.add(at(box(0.024, 0.026, 0.05, blackHi), 0.034, 0.028, 0.03));  // ejection port / dust cover

  // === bulky lower receiver: curved STANAG mag + grip + trigger ===
  g.add(at(box(0.058, 0.062, 0.12, black), 0, -0.002, -0.04));      // lower receiver / mag well
  g.add(at(box(0.048, 0.13, 0.056, mag), 0, -0.1, -0.06, 0.1));     // mag upper (curved)
  g.add(at(box(0.048, 0.06, 0.056, mag), 0, -0.21, -0.03, 0.18));   // mag lower
  g.add(at(box(0.05, 0.018, 0.058, dark), 0, -0.25, -0.01, 0.18));  // floorplate
  g.add(at(box(0.046, 0.115, 0.05, poly), 0, -0.062, 0.06, 0.4));   // A2 grip
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 8, 16), black);
  g.add(at(guard, 0, -0.036, 0.0, 0, Math.PI / 2));
  g.add(at(box(0.012, 0.026, 0.009, dark), 0, -0.03, 0.0));         // trigger

  // === buffer tube + bulky collapsible carbine stock ===
  g.add(at(tube(0.026, 0.026, 0.16, blackHi), 0, 0.03, 0.1));
  g.add(at(box(0.06, 0.088, 0.12, poly), 0, 0.02, 0.16));           // stock body
  g.add(at(box(0.064, 0.1, 0.024, poly), 0, 0.018, 0.215));         // butt pad
  g.add(at(box(0.016, 0.05, 0.07, poly), 0, -0.024, 0.13));         // stock lever/lower

  return { group: g, muzzle: -0.55 };
}

// --- AN-94 Abakan — Russian AR. AK-style blued receiver, tan/olive ribbed
//     handguard + grip + skeletonised stock, a long barrel with the muzzle
//     brake, a hooded front sight + dual rear, all with RED glowing fibre dots,
//     and a curved banana magazine. Shared materials. ---
function an94() {
  const g = new THREE.Group();
  const black = gunMetal(0x262b31, { metal: 0.55, rough: 0.4 });   // blued AK receiver
  const blackDk = gunMetal(0x16191d, { metal: 0.5, rough: 0.45 });
  const tan = gunMetal(0x837748, { metal: 0.2, rough: 0.6 });      // olive/tan furniture
  const tanDk = gunMetal(0x645b36, { metal: 0.2, rough: 0.62 });
  const grip = gunGrip(0x6e6438);                                  // tan grip
  const steel = gunMetal(0x3a3e44, { metal: 0.7, rough: 0.3 });    // barrel
  const mag = gunMetal(0x1c1f23, { metal: 0.5, rough: 0.45 });     // black curved mag
  const dark = gunDark(0x0e0f12);
  const red = mat(0xff2a1e, { metal: 0.1, rough: 0.4, emissive: 0xff2a1e, ei: 1.8 }); // glowing sights

  // === barrel + muzzle brake + hooded front sight (red) ===
  g.add(at(tube(0.012, 0.012, 0.18, steel), 0, 0.03, -0.42));
  g.add(at(tube(0.018, 0.018, 0.06, blackDk, 14), 0, 0.03, -0.53)); // muzzle brake
  for (let i = 0; i < 3; i++) g.add(at(box(0.04, 0.006, 0.012, dark), 0, 0.03, -0.5 - i * 0.014)); // slots
  g.add(at(tube(0.012, 0.012, 0.02, dark, 12), 0, 0.03, -0.56));    // bore
  g.add(at(box(0.026, 0.04, 0.03, blackDk), 0, 0.05, -0.45));       // front sight base
  const fhood = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 8, 14), blackDk);
  g.add(at(fhood, 0, 0.085, -0.45));
  g.add(at(box(0.006, 0.018, 0.006, blackDk), 0, 0.078, -0.45));    // post
  g.add(at(box(0.006, 0.006, 0.006, red), 0, 0.082, -0.45));        // red front dot

  // === tan ribbed handguard ===
  g.add(at(box(0.05, 0.05, 0.18, tan), 0, 0.018, -0.3));
  g.add(at(box(0.046, 0.03, 0.16, tanDk), 0, 0.052, -0.3));         // gas-tube cover
  for (let i = 0; i < 6; i++) g.add(at(box(0.052, 0.004, 0.014, dark), 0, 0.066, -0.37 + i * 0.026)); // top ribs
  for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) g.add(at(box(0.004, 0.034, 0.014, dark), sx * 0.026, 0.018, -0.37 + i * 0.026)); // side ribs

  // === blued receiver (lengthened to bridge the handguard AND the stock so
  //     neither floats) + optic rail + rear sight (red) + selector ===
  g.add(at(box(0.052, 0.06, 0.34, black), 0, 0.02, -0.05));
  g.add(at(box(0.054, 0.02, 0.32, blackDk), 0, 0.052, -0.05));      // dust cover
  g.add(at(box(0.024, 0.014, 0.1, blackDk), 0, 0.066, -0.04));      // rail base
  for (let i = 0; i < 5; i++) g.add(at(box(0.026, 0.008, 0.006, dark), 0, 0.074, -0.08 + i * 0.02));
  g.add(at(box(0.03, 0.02, 0.02, blackDk), 0, 0.066, 0.04));        // rear sight base
  for (const sx of [-1, 1]) g.add(at(box(0.006, 0.006, 0.006, red), sx * 0.012, 0.08, 0.04)); // red rear dots (level with front)
  g.add(at(box(0.014, 0.04, 0.03, blackDk), 0.03, 0.0, -0.02));     // selector (right)

  // === curved banana magazine ===
  g.add(at(box(0.04, 0.1, 0.05, mag), 0, -0.075, -0.05, 0.12));
  g.add(at(box(0.04, 0.1, 0.05, mag), 0, -0.165, -0.02, 0.24));     // lower (more curve)
  g.add(at(box(0.042, 0.016, 0.052, dark), 0, -0.212, 0.0, 0.24));  // floorplate

  // === tan grip + trigger guard ===
  g.add(at(box(0.04, 0.12, 0.046, grip), 0, -0.05, 0.045, 0.14));
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 8, 16), blackDk);
  g.add(at(guard, 0, -0.03, 0.0, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.024, 0.008, dark), 0, -0.025, 0.0));

  // === olive/tan skeletonised stock (pulled forward to meet the receiver) ===
  g.add(at(box(0.024, 0.045, 0.12, tan), 0, 0.02, 0.1));
  g.add(at(box(0.012, 0.08, 0.018, tan), 0, 0.0, 0.17));            // butt upright
  g.add(at(box(0.045, 0.085, 0.016, tanDk), 0, 0.0, 0.18));         // butt pad
  g.add(at(box(0.012, 0.035, 0.06, tan), 0, -0.025, 0.13));         // lower strut

  return { group: g, muzzle: -0.56 };
}

// --- STG-44 — the first true assault rifle (WW2). Long blued stamped receiver
//     with oval lightening slots + a rounded top, a long thin barrel with a
//     hooded front sight + gas tube, a tangent rear sight, a curved magazine, a
//     brown bakelite grip and the wooden buttstock. Shared materials. ---
function stg44() {
  const g = new THREE.Group();
  const steel = gunMetal(0x2c3036, { metal: 0.62, rough: 0.34 });   // blued steel
  const steelHi = gunMetal(0x3e434a, { metal: 0.6, rough: 0.3 });
  const steelDk = gunMetal(0x1a1d22, { metal: 0.58, rough: 0.4 });
  const wood = gunWood(0x6a4a2e);                                   // brown stock
  const woodDk = gunWood(0x4e3420);
  const bakeGrip = gunWood(0x5a3a22);                               // bakelite grip
  const mag = gunMetal(0x1c1f23, { metal: 0.5, rough: 0.45 });      // black mag
  const dark = gunDark(0x0e0f12);

  // === long thin barrel + gas tube + hooded front sight ===
  g.add(at(tube(0.011, 0.011, 0.26, steel), 0, 0.04, -0.46));
  g.add(at(tube(0.008, 0.008, 0.2, steelDk), 0, 0.066, -0.42));     // gas tube
  g.add(at(tube(0.016, 0.016, 0.02, steelDk, 12), 0, 0.04, -0.6));  // muzzle nut
  g.add(at(tube(0.01, 0.01, 0.02, dark, 12), 0, 0.04, -0.62));      // bore
  g.add(at(box(0.02, 0.07, 0.024, steelDk), 0, 0.055, -0.56));      // front sight base (tall — raises the post to the rear leaf)
  const fhood = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.003, 8, 12), steelDk);
  g.add(at(fhood, 0, 0.088, -0.56));
  g.add(at(box(0.004, 0.016, 0.005, dark), 0, 0.084, -0.56));       // post

  // === long stamped receiver: rounded top + oval lightening slots ===
  g.add(at(box(0.05, 0.07, 0.34, steel), 0, 0.035, -0.16));
  g.add(at(tube(0.026, 0.026, 0.34, steelHi, 18), 0, 0.058, -0.16)); // rounded top
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) g.add(at(box(0.004, 0.02, 0.05, dark), sx * 0.026, 0.03, -0.26 + i * 0.07)); // oval slots
  g.add(at(box(0.044, 0.03, 0.14, steelDk), 0, -0.005, -0.3));      // lower fore
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) g.add(at(box(0.005, 0.014, 0.012, dark), sx * 0.023, -0.005, -0.36 + i * 0.03)); // cooling slots

  // === tangent rear sight ===
  g.add(at(box(0.024, 0.018, 0.05, steelDk), 0, 0.07, -0.02));
  g.add(at(box(0.02, 0.024, 0.012, steelDk), 0, 0.086, 0.0));       // leaf
  g.add(at(box(0.008, 0.008, 0.006, dark), 0, 0.092, 0.0));         // notch

  // === curved magazine (seated up into the well) ===
  g.add(at(box(0.038, 0.1, 0.05, mag), 0, -0.075, -0.05, 0.12));
  g.add(at(box(0.038, 0.1, 0.05, mag), 0, -0.165, -0.02, 0.24));    // lower curve
  g.add(at(box(0.04, 0.016, 0.052, dark), 0, -0.212, 0.0, 0.24));   // floorplate

  // === brown bakelite grip + trigger guard ===
  g.add(at(box(0.038, 0.1, 0.044, bakeGrip), 0, -0.044, 0.04, 0.14));
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.005, 8, 16), steelDk);
  g.add(at(guard, 0, -0.028, 0.0, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.022, 0.008, dark), 0, -0.024, 0.0));

  // === wooden buttstock (flat, with the oval hole) ===
  g.add(at(box(0.036, 0.06, 0.1, wood), 0, 0.012, 0.08));           // neck
  g.add(at(box(0.046, 0.11, 0.12, wood), 0, 0.0, 0.17));            // butt
  g.add(at(box(0.048, 0.12, 0.018, woodDk), 0, 0.0, 0.22));         // butt plate
  g.add(at(box(0.05, 0.04, 0.045, dark), 0, 0.0, 0.16));            // oval cutout (inset)

  return { group: g, muzzle: -0.63 };
}

// --- ICR-1 (BO3) — modern angular AR (Honey Badger family). A flat-sided dark
//     gunmetal receiver with a full-length Picatinny top rail, a long slot-cut
//     KeyMod handguard, a stubby flash hider, flip-up GREEN fiber sights, a
//     straight polymer mag and a tubular skeleton collapsing stock. Reads as a
//     close cousin of the Galil (same length) but cleaner / more modern. ---
function icr1() {
  const g = new THREE.Group();
  const body = gunMetal(0x2a2e34, { metal: 0.6, rough: 0.38 });    // receiver / handguard
  const bodyHi = gunMetal(0x363b42, { metal: 0.58, rough: 0.34 }); // raised panels / rail
  const bodyDk = gunMetal(0x191c20, { metal: 0.55, rough: 0.44 }); // shadow cuts / accents
  const steel = gunMetal(0x3a3f46, { metal: 0.72, rough: 0.28 });  // barrel steel
  const poly = gunMetal(0x202327, { metal: 0.25, rough: 0.6 });    // polymer mag / stock
  const grip = gunGrip(0x23262b);                                  // stippled grip
  const dark = gunDark(0x101216);
  const green = ironSightGlow();

  // === barrel + stubby flash hider out the front ===
  g.add(at(tube(0.012, 0.012, 0.16, steel), 0, 0.018, -0.42));
  g.add(at(tube(0.02, 0.02, 0.05, bodyDk, 14), 0, 0.018, -0.52));     // flash hider body
  for (let i = 0; i < 3; i++) g.add(at(tube(0.022, 0.022, 0.005, dark, 14), 0, 0.018, -0.5 - i * 0.016)); // cut rings
  g.add(at(tube(0.013, 0.013, 0.018, dark, 12), 0, 0.018, -0.55));    // bore

  // === long slotted handguard (KeyMod look) wrapping the barrel ===
  g.add(at(box(0.05, 0.052, 0.26, body), 0, 0.022, -0.3));
  g.add(at(box(0.052, 0.018, 0.24, bodyHi), 0, 0.05, -0.3));          // top rail run over the handguard
  for (let i = 0; i < 9; i++) g.add(at(box(0.054, 0.006, 0.008, dark), 0, 0.06, -0.4 + i * 0.024)); // top rail teeth
  // slot cutouts down each side + the bottom of the handguard
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) g.add(at(box(0.005, 0.024, 0.034, dark), sx * 0.026, 0.018, -0.39 + i * 0.05));
  for (let i = 0; i < 4; i++) g.add(at(box(0.026, 0.005, 0.034, dark), 0, -0.006, -0.39 + i * 0.05)); // bottom slots

  // === flat-sided receiver + continuous top rail ===
  g.add(at(box(0.052, 0.066, 0.22, body), 0, 0.02, -0.07));
  g.add(at(box(0.052, 0.02, 0.2, bodyHi), 0, 0.055, -0.07));          // receiver rail
  for (let i = 0; i < 8; i++) g.add(at(box(0.054, 0.006, 0.008, dark), 0, 0.066, -0.15 + i * 0.024)); // rail teeth
  g.add(at(box(0.014, 0.03, 0.05, bodyDk), 0.03, 0.012, -0.02));      // ejection port (right)
  g.add(at(box(0.012, 0.024, 0.024, bodyDk), -0.032, 0.026, -0.12));  // charging handle (left)
  g.add(at(box(0.012, 0.03, 0.022, bodyHi), -0.032, -0.004, 0.01));   // ambi selector

  // === flip-up GREEN sights: hooded front over the gas block, rear on the receiver ===
  g.add(at(box(0.024, 0.034, 0.026, bodyDk), 0, 0.044, -0.45));       // front sight base
  for (const sx of [-1, 1]) g.add(at(box(0.005, 0.04, 0.01, dark), sx * 0.014, 0.07, -0.45)); // hood ears
  g.add(at(box(0.034, 0.007, 0.01, dark), 0, 0.092, -0.45));          // hood crossbar
  g.add(at(box(0.006, 0.026, 0.008, dark), 0, 0.066, -0.45));         // front post
  g.add(at(box(0.007, 0.007, 0.007, green), 0, 0.078, -0.452));       // front green dot
  g.add(at(box(0.03, 0.024, 0.022, bodyDk), 0, 0.072, 0.0));          // rear sight base
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.0035, 6, 14), dark), 0, 0.08, 0.006, 0, Math.PI / 2)); // aperture
  for (const sx of [-1, 1]) g.add(at(box(0.007, 0.007, 0.007, green), sx * 0.011, 0.08, -0.004)); // twin green rear dots

  // === straight polymer magazine ===
  g.add(at(box(0.046, 0.03, 0.058, body), 0, -0.05, -0.05));          // mag well lip
  g.add(at(box(0.04, 0.14, 0.052, poly), 0, -0.13, -0.045, 0.06));    // straight mag body (mild rake)
  g.add(at(box(0.042, 0.016, 0.054, dark), 0, -0.2, -0.032, 0.06));   // floorplate

  // === stippled pistol grip + trigger guard ===
  g.add(at(box(0.04, 0.1, 0.046, grip), 0, -0.049, 0.06, 0.14));
  g.add(at(box(0.042, 0.016, 0.048, dark), 0, -0.105, 0.053, 0.14));  // grip base cap
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.005, 8, 16), bodyDk);
  g.add(at(guard, 0, -0.028, 0.0, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.022, 0.008, dark), 0, -0.024, 0.0));

  // === tubular skeleton collapsing stock — rear stays near z 0.22 ===
  g.add(at(box(0.05, 0.064, 0.05, body), 0, 0.02, 0.06));             // stock socket / buffer
  g.add(at(tube(0.008, 0.008, 0.14, steel), 0, 0.046, 0.14));         // top tube
  g.add(at(tube(0.008, 0.008, 0.14, steel), 0, -0.018, 0.14));        // bottom tube
  g.add(at(box(0.034, 0.018, 0.07, bodyDk), 0, 0.05, 0.12));          // cheek riser
  g.add(at(box(0.018, 0.092, 0.022, poly), 0, 0.014, 0.205));         // vertical butt frame
  g.add(at(box(0.03, 0.1, 0.03, dark), 0, 0.014, 0.218));             // rubber butt pad

  return { group: g, muzzle: -0.55 };
}

// --- FAL — the classic FN FAL battle rifle. Blued stamped/milled steel
//     receiver with a hump-backed top, a long blued barrel ending in a slotted
//     flash hider + winged front sight, blonde-wood handguard (three oval
//     lightening slots), a wood pistol grip + full wooden buttstock with a
//     steel butt plate, an aperture rear sight and a slightly-curved steel mag.
//     Same length class as the AN-94. Shared gunMetal/gunWood standards. ---
function fal() {
  const g = new THREE.Group();
  const blued = gunMetal(0x2a2f36, { metal: 0.7, rough: 0.3 });    // blued receiver/barrel
  const bluedHi = gunMetal(0x3a4047, { metal: 0.68, rough: 0.26 });
  const bluedDk = gunMetal(0x16191d, { metal: 0.66, rough: 0.4 }); // shadow cuts
  const wood = gunWood(0xc69a5a);                                  // blonde furniture
  const woodDk = gunWood(0x9a7038);
  const grip = gunWood(0xb88a4e);                                  // wood pistol grip
  const mag = gunMetal(0x232830, { metal: 0.6, rough: 0.4 });      // blued steel mag
  const dark = gunDark(0x0e0f12);

  // === long blued barrel + slotted flash hider + winged front sight ===
  g.add(at(tube(0.012, 0.012, 0.22, blued), 0, 0.034, -0.44));
  g.add(at(tube(0.018, 0.018, 0.07, bluedDk, 14), 0, 0.034, -0.56));  // flash hider
  for (let i = 0; i < 4; i++) g.add(at(box(0.04, 0.006, 0.01, dark), 0, 0.034, -0.53 - i * 0.016)); // vertical slots
  g.add(at(tube(0.012, 0.012, 0.018, dark, 12), 0, 0.034, -0.6));     // bore
  g.add(at(box(0.03, 0.024, 0.034, bluedDk), 0, 0.05, -0.48));        // front sight block
  for (const sx of [-1, 1]) g.add(at(box(0.006, 0.044, 0.014, bluedDk), sx * 0.016, 0.082, -0.48)); // protective wings
  g.add(at(box(0.006, 0.026, 0.01, dark), 0, 0.07, -0.48));           // front post
  g.add(at(box(0.026, 0.03, 0.05, bluedDk), 0, 0.044, -0.4));         // gas block / front band

  // === blonde-wood handguard with three oval lightening slots ===
  g.add(at(box(0.052, 0.06, 0.2, wood), 0, 0.026, -0.28));
  g.add(at(box(0.04, 0.034, 0.18, woodDk), 0, 0.06, -0.28));          // top wood (under barrel ridge)
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++)
    g.add(at(box(0.005, 0.022, 0.04, dark), sx * 0.027, 0.022, -0.34 + i * 0.07)); // oval slots each side
  g.add(at(box(0.05, 0.018, 0.04, bluedDk), 0, -0.006, -0.36));       // lower handguard cap

  // === blued receiver with the FAL hump-back + aperture rear sight ===
  g.add(at(box(0.05, 0.07, 0.22, blued), 0, 0.026, -0.08));
  g.add(at(box(0.05, 0.03, 0.1, bluedHi), 0, 0.066, -0.12));          // raised hump (front of receiver top)
  g.add(at(box(0.046, 0.026, 0.06, bluedDk), 0, 0.022, 0.02));        // rear hump step
  g.add(at(box(0.03, 0.026, 0.026, bluedDk), 0, 0.07, 0.0));          // rear sight base
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.0035, 6, 14), dark), 0, 0.082, 0.006, 0, Math.PI / 2)); // aperture
  g.add(at(box(0.012, 0.026, 0.026, bluedDk), -0.032, 0.024, -0.14)); // charging handle (left)
  g.add(at(box(0.012, 0.03, 0.022, bluedHi), -0.031, -0.006, -0.04)); // safety/selector lever (left)
  g.add(at(box(0.014, 0.026, 0.05, bluedDk), 0.03, 0.018, -0.06));    // ejection port (right)

  // === slightly-curved blued steel magazine ===
  g.add(at(box(0.046, 0.03, 0.058, blued), 0, -0.05, -0.05));         // mag well lip
  g.add(at(box(0.04, 0.09, 0.052, mag), 0, -0.1, -0.045, 0.1));
  g.add(at(box(0.04, 0.07, 0.05, mag), 0, -0.17, -0.018, 0.24));      // lower (mild curve)
  g.add(at(box(0.042, 0.016, 0.052, dark), 0, -0.21, 0.0, 0.24));     // floorplate

  // === wood pistol grip + trigger guard ===
  g.add(at(box(0.04, 0.1, 0.046, grip), 0, -0.049, 0.06, 0.14));
  g.add(at(box(0.042, 0.016, 0.048, woodDk), 0, -0.105, 0.053, 0.14)); // grip cap
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.005, 8, 16), bluedDk);
  g.add(at(guard, 0, -0.028, 0.0, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.022, 0.008, dark), 0, -0.024, 0.0));

  // === full wooden buttstock with steel butt plate (rear stays ~z 0.22) ===
  g.add(at(box(0.044, 0.066, 0.08, wood), 0, 0.01, 0.07));            // wrist/neck
  g.add(at(box(0.05, 0.108, 0.11, wood), 0, -0.004, 0.16, -0.05));    // butt body (slight drop)
  g.add(at(box(0.052, 0.118, 0.018, bluedDk), 0, -0.01, 0.215, -0.05)); // steel butt plate
  g.add(at(box(0.046, 0.03, 0.06, woodDk), 0, 0.046, 0.12));          // comb top

  return { group: g, muzzle: -0.6 };
}

// --- DINGO (BO3) — bulky futuristic LMG. Slab-sided dark gunmetal body slightly
//     wider than the HK21, with angular faceted panels, gold/tan diagonal racing
//     stripes, a wide DUAL-PORT muzzle shroud (two bores), a long slotted barrel
//     shroud, flip-up GREEN irons front + rear, a big cylindrical drum magazine
//     hanging down-and-forward, red accent switches, and a skeleton stock. ---
function dingo() {
  const g = new THREE.Group();
  const body = gunMetal(0x34383f, { metal: 0.62, rough: 0.36 });   // main grey body
  const bodyHi = gunMetal(0x434852, { metal: 0.6, rough: 0.3 });   // raised facets / catches light
  const bodyDk = gunMetal(0x1c1f24, { metal: 0.58, rough: 0.44 }); // shadow channels
  const steel = gunMetal(0x4a4f57, { metal: 0.78, rough: 0.24 });  // bright op-rod / barrel
  const tan = gunMetal(0xb89048, { metal: 0.45, rough: 0.5 });     // gold/tan stripes
  const drumMat = gunMetal(0x3a3e45, { metal: 0.55, rough: 0.4 }); // cylindrical mag
  const grip = gunGrip(0x26292f);
  const dark = gunDark(0x0e1014);
  const green = ironSightGlow();
  const red = mat(0xd83426, { metal: 0.2, rough: 0.4, emissive: 0xd83426, ei: 1.2 }); // red accents

  // === wide DUAL-PORT muzzle shroud (two bores side by side) ===
  g.add(at(box(0.07, 0.062, 0.12, bodyDk), 0, 0.02, -0.66));          // muzzle block
  for (const sx of [-1, 1]) {
    g.add(at(tube(0.018, 0.018, 0.12, dark, 14), sx * 0.018, 0.02, -0.66)); // bore tube
    g.add(at(tube(0.019, 0.019, 0.018, dark, 14), sx * 0.018, 0.02, -0.72)); // bore mouth
  }
  for (let i = 0; i < 3; i++) g.add(at(box(0.074, 0.006, 0.008, dark), 0, 0.05, -0.64 - i * 0.02)); // top vents

  // === long slotted barrel shroud (faceted, with a tan diagonal stripe) ===
  g.add(at(box(0.066, 0.07, 0.28, body), 0, 0.02, -0.42));
  g.add(at(box(0.07, 0.026, 0.26, bodyHi), 0, 0.058, -0.42));         // raised top spine
  for (let i = 0; i < 8; i++) g.add(at(box(0.072, 0.006, 0.008, dark), 0, 0.072, -0.53 + i * 0.03)); // top rail teeth
  // side cooling slots
  for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) g.add(at(box(0.006, 0.03, 0.026, dark), sx * 0.034, 0.018, -0.52 + i * 0.05));
  // faceted lower lightening cut
  g.add(at(box(0.05, 0.022, 0.24, bodyDk), 0, -0.026, -0.42));
  // gold/tan diagonal racing stripe across the shroud (two angled segments)
  for (const sx of [-1, 1]) {
    g.add(at(box(0.004, 0.05, 0.03, tan), sx * 0.035, 0.024, -0.46, 0, 0, 0.5));
    g.add(at(box(0.004, 0.05, 0.03, tan), sx * 0.035, 0.024, -0.4, 0, 0, 0.5));
  }
  // bright internal op-rod showing through the slots
  g.add(at(tube(0.012, 0.012, 0.34, steel), 0, 0.03, -0.42));

  // === bulky faceted receiver (slightly wider than HK21) ===
  g.add(at(box(0.072, 0.084, 0.24, body), 0, 0.018, -0.1));
  g.add(at(box(0.076, 0.03, 0.22, bodyHi), 0, 0.064, -0.1));          // raised top deck
  for (let i = 0; i < 7; i++) g.add(at(box(0.078, 0.006, 0.008, dark), 0, 0.08, -0.18 + i * 0.028)); // top rail
  g.add(at(box(0.05, 0.04, 0.05, bodyDk), 0.038, 0.0, -0.04));        // right ejection block
  g.add(at(box(0.012, 0.026, 0.04, steel), -0.04, 0.03, -0.15));      // left charging handle
  g.add(at(box(0.022, 0.024, 0.022, red), 0.04, 0.01, 0.02));         // red fire-selector button (right)
  g.add(at(box(0.05, 0.02, 0.05, bodyDk), 0, -0.05, -0.06));          // belt/feed underside block
  // gold/tan diagonal stripe block across the receiver top-left
  g.add(at(box(0.004, 0.04, 0.06, tan), -0.038, 0.05, -0.1, 0, 0, 0.6));

  // === flip-up GREEN irons: front blade over the shroud, rear aperture ===
  g.add(at(box(0.028, 0.03, 0.022, bodyDk), 0, 0.078, -0.34));        // front sight base
  for (const sx of [-1, 1]) g.add(at(box(0.005, 0.034, 0.01, dark), sx * 0.014, 0.1, -0.34)); // wings
  g.add(at(box(0.006, 0.022, 0.008, dark), 0, 0.083, -0.34));         // front post (level with rear aperture)
  g.add(at(box(0.007, 0.007, 0.007, green), 0, 0.104, -0.342));       // front green dot
  g.add(at(box(0.032, 0.028, 0.024, bodyDk), 0, 0.084, 0.02));        // rear sight housing
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0035, 6, 14), dark), 0, 0.094, 0.026, 0, Math.PI / 2)); // aperture
  for (const sx of [-1, 1]) g.add(at(box(0.007, 0.007, 0.007, green), sx * 0.012, 0.094, 0.016)); // twin green rear dots

  // === pistol grip + trigger guard (Dingo-marked) ===
  g.add(at(box(0.046, 0.11, 0.05, grip), 0, -0.054, 0.04, 0.14));
  g.add(at(box(0.048, 0.018, 0.052, dark), 0, -0.116, 0.032, 0.14));   // grip cap
  g.add(at(box(0.004, 0.04, 0.03, tan), 0.024, -0.05, 0.05, 0, 0, 0.5)); // tan grip stripe
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 8, 16), bodyDk);
  g.add(at(guard, 0, -0.03, 0.0, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.026, 0.009, dark), 0, -0.026, 0.0));

  // === big cylindrical DRUM magazine hanging down-and-forward ===
  g.add(at(box(0.05, 0.04, 0.05, bodyDk), 0, -0.07, -0.1));           // mag housing collar
  g.add(at(tube(0.05, 0.05, 0.16, drumMat, 22), 0, -0.16, -0.13, 0.32)); // drum body (tilted forward)
  g.add(at(tube(0.052, 0.052, 0.018, bodyDk, 22), 0, -0.224, -0.16, 0.32)); // drum end cap
  g.add(at(tube(0.053, 0.053, 0.016, bodyDk, 22), 0, -0.1, -0.105, 0.32));  // drum top cap
  for (let i = 0; i < 4; i++) g.add(at(box(0.084, 0.004, 0.026, bodyDk), 0, -0.12 - i * 0.026, -0.135, 0.32)); // drum ribs
  g.add(at(box(0.01, 0.05, 0.04, red), 0.03, -0.17, -0.14, 0.32));    // red drum indicator stripe

  // === skeleton stock (rear stays ~z 0.2) ===
  g.add(at(box(0.06, 0.07, 0.06, body), 0, 0.018, 0.05));             // stock socket
  g.add(at(tube(0.009, 0.009, 0.16, steel), 0, 0.05, 0.13));          // top tube
  g.add(at(tube(0.009, 0.009, 0.16, steel), 0, -0.02, 0.13));         // bottom tube
  g.add(at(box(0.04, 0.022, 0.08, bodyDk), 0, 0.056, 0.11));          // cheek rest
  g.add(at(box(0.02, 0.1, 0.024, body), 0, 0.016, 0.205));            // vertical butt frame
  g.add(at(box(0.034, 0.108, 0.03, dark), 0, 0.016, 0.218));          // butt pad

  return { group: g, muzzle: -0.74 };
}

// --- RPD — classic Soviet belt-fed LMG. Long near-black barrel with a hooded
//     front post + gas tube, reddish-brown wood handguard, a slab blued receiver
//     with a top rail + leaf rear sight, a brass belt feeding from a big ROUND
//     PAN DRUM that hangs below (its flat circular face pointing SIDEWAYS — axis
//     along X, ry = PI/2), wood pistol grip + full wooden buttstock with a black
//     butt plate, and a folded bipod. Slightly bulkier than the HK21. ---
function rpd() {
  const g = new THREE.Group();
  const blued = gunMetal(0x2a2e34, { metal: 0.66, rough: 0.34 });   // blued receiver
  const bluedHi = gunMetal(0x3a4047, { metal: 0.64, rough: 0.3 });
  const bluedDk = gunMetal(0x16191d, { metal: 0.62, rough: 0.42 }); // shadow cuts / drum
  const barrelMat = gunDark(0x141519);                              // near-black barrel
  const wood = gunWood(0x934c26);                                   // reddish-brown furniture
  const woodDk = gunWood(0x6c3618);
  const grip = gunWood(0x8a4824);                                   // wood pistol grip
  const drumMat = gunMetal(0x24272d, { metal: 0.58, rough: 0.42 }); // dark blued pan drum
  const brass = gunMetal(0xb08a3c, { metal: 0.82, rough: 0.32 });   // belt cartridges
  const dark = gunDark(0x0c0d10);

  // === long near-black barrel + gas tube + hooded front post ===
  g.add(at(tube(0.013, 0.013, 0.42, barrelMat), 0, 0.02, -0.5));
  g.add(at(tube(0.009, 0.009, 0.32, bluedDk), 0, -0.014, -0.46));     // gas tube below
  g.add(at(box(0.024, 0.05, 0.05, bluedDk), 0, 0.01, -0.42));         // gas block / front band
  g.add(at(box(0.026, 0.03, 0.034, bluedDk), 0, 0.046, -0.66));       // front sight base
  for (const sx of [-1, 1]) g.add(at(box(0.006, 0.04, 0.012, bluedDk), sx * 0.014, 0.078, -0.66)); // open "U" ears
  g.add(at(box(0.006, 0.026, 0.01, dark), 0, 0.066, -0.66));          // front post
  g.add(at(tube(0.013, 0.013, 0.018, dark, 12), 0, 0.02, -0.71));     // muzzle bore

  // === reddish-brown wood handguard (short, ahead of the receiver) ===
  g.add(at(box(0.05, 0.058, 0.16, wood), 0, 0.012, -0.32));
  g.add(at(box(0.052, 0.024, 0.14, woodDk), 0, 0.044, -0.32));        // top wood ridge
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) g.add(at(box(0.004, 0.03, 0.014, dark), sx * 0.026, 0.012, -0.37 + i * 0.05)); // grip grooves

  // === slab blued receiver + top rail + leaf rear sight ===
  g.add(at(box(0.062, 0.088, 0.26, blued), 0, 0.014, -0.1));
  g.add(at(box(0.06, 0.026, 0.24, bluedHi), 0, 0.062, -0.1));         // raised top cover
  g.add(at(box(0.03, 0.012, 0.16, bluedDk), 0, 0.08, -0.12));         // rail base
  for (let i = 0; i < 8; i++) g.add(at(box(0.032, 0.007, 0.008, dark), 0, 0.088, -0.18 + i * 0.022)); // rail teeth
  g.add(at(box(0.03, 0.024, 0.022, bluedDk), 0, 0.084, 0.02));        // rear sight leaf base
  g.add(at(box(0.024, 0.014, 0.01, dark), 0, 0.098, 0.022));          // rear notch
  g.add(at(box(0.012, 0.024, 0.04, bluedHi), -0.038, 0.03, -0.1));    // left charging handle
  g.add(at(box(0.05, 0.04, 0.05, bluedDk), 0.038, 0.0, -0.04));       // right side block / dust cover

  // === brass belt feeding up from the drum (left) into the feed tray ===
  g.add(at(box(0.052, 0.022, 0.06, bluedDk), 0, 0.044, -0.04));       // feed tray cover hinge
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    g.add(at(box(0.012, 0.022, 0.013, brass), -0.03 - t * 0.012, -0.02 + t * 0.06, -0.05)); // cartridges climbing in
  }

  // === big ROUND PAN DRUM hanging below — flat face SIDEWAYS (axis = X) ===
  g.add(at(box(0.05, 0.04, 0.06, bluedDk), 0, -0.05, -0.07));         // drum hanger collar
  g.add(at(tube(0.084, 0.084, 0.058, drumMat, 26), 0, -0.14, -0.07, 0, Math.PI / 2)); // drum body (axis X → round face to the side)
  for (const fx of [-1, 1]) {                                          // concentric ribs on each circular face
    g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.005, 8, 24), drumMat), fx * 0.03, -0.14, -0.07, 0, Math.PI / 2));
    g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.004, 8, 24), bluedDk), fx * 0.031, -0.14, -0.07, 0, Math.PI / 2));
    g.add(at(tube(0.012, 0.012, 0.01, dark, 12), fx * 0.032, -0.14, -0.07, 0, Math.PI / 2)); // hub
  }
  g.add(at(box(0.066, 0.026, 0.05, drumMat), 0, -0.055, -0.07));      // drum top latch shroud
  g.add(at(box(0.05, 0.018, 0.04, bluedHi), 0, -0.072, -0.07));       // latch band (light catch)

  // === wood pistol grip + trigger guard ===
  g.add(at(box(0.04, 0.1, 0.046, grip), 0, -0.049, 0.07, 0.14));
  g.add(at(box(0.042, 0.016, 0.048, woodDk), 0, -0.105, 0.063, 0.14)); // grip cap
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 8, 16), bluedDk);
  g.add(at(guard, 0, -0.028, 0.02, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.024, 0.008, dark), 0, -0.024, 0.02));          // trigger

  // === full wooden buttstock with black butt plate (rear ~z 0.22) ===
  g.add(at(box(0.044, 0.062, 0.08, blued), 0, 0.012, 0.05));          // metal stock neck/socket
  g.add(at(box(0.05, 0.1, 0.12, wood), 0, -0.004, 0.16));             // wood butt body
  g.add(at(box(0.052, 0.112, 0.018, dark), 0, -0.01, 0.215));         // black butt plate
  g.add(at(box(0.046, 0.03, 0.06, woodDk), 0, 0.044, 0.12));          // comb top

  // === folded bipod under the front ===
  g.add(at(box(0.02, 0.02, 0.03, dark), 0, -0.02, -0.5));             // bipod mount
  for (const sx of [-1, 1]) {
    g.add(at(tube(0.005, 0.005, 0.16, bluedDk), sx * 0.012, -0.04, -0.42, 0, sx * 0.1, 0)); // leg folded back
    g.add(at(box(0.008, 0.02, 0.008, bluedDk), sx * 0.028, -0.05, -0.35));                   // foot
  }

  return { group: g, muzzle: -0.72 };
}

// --- HAMR (BO2) — modern SCAR/ACR-pattern LMG in FDE tan + black. Flat-top
//     receiver with a full-length Picatinny rail, hooded RING flip sights front
//     + rear with a knurled rotary drum (1·2·3) adjuster, a black barrel with a
//     slotted muzzle brake + folded bipod, a tan handguard, a big round DRUM
//     magazine (flat face sideways, axis X) and a tan collapsing stock. ---
function hamr() {
  const g = new THREE.Group();
  const tan = gunMetal(0x9c8c5e, { metal: 0.34, rough: 0.54 });     // FDE body
  const tanHi = gunMetal(0xb2a06e, { metal: 0.32, rough: 0.48 });   // lighter panels
  const tanDk = gunMetal(0x756840, { metal: 0.34, rough: 0.58 });   // shadowed tan
  const black = gunMetal(0x1c1e22, { metal: 0.55, rough: 0.42 });   // black furniture/rail
  const blackDk = gunDark(0x111316);
  const steel = gunMetal(0x3a3f46, { metal: 0.74, rough: 0.26 });   // barrel
  const drumMat = gunMetal(0x242a2e, { metal: 0.55, rough: 0.42 }); // dark drum
  const amber = gunMetal(0xc0962e, { metal: 0.5, rough: 0.5 });     // painted sight numbers
  const grip = gunGrip(0x2a2c30);
  const dark = gunDark(0x0c0d10);

  // === black barrel + slotted muzzle brake ===
  g.add(at(tube(0.013, 0.013, 0.3, steel), 0, 0.02, -0.46));
  g.add(at(tube(0.019, 0.019, 0.07, blackDk, 14), 0, 0.02, -0.6));    // muzzle brake
  for (const sz of [-0.58, -0.61]) g.add(at(tube(0.0205, 0.0205, 0.006, dark, 12), 0, 0.02, sz)); // slot rings
  g.add(at(tube(0.013, 0.013, 0.018, dark, 12), 0, 0.02, -0.64));     // bore
  g.add(at(box(0.022, 0.04, 0.04, blackDk), 0, 0.012, -0.42));        // gas block

  // === tan handguard with rail slots ===
  g.add(at(box(0.054, 0.058, 0.2, tan), 0, 0.016, -0.32));
  g.add(at(box(0.05, 0.018, 0.18, black), 0, 0.05, -0.32));           // top rail over handguard
  for (let i = 0; i < 7; i++) g.add(at(box(0.052, 0.006, 0.008, dark), 0, 0.06, -0.4 + i * 0.024)); // rail teeth
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) g.add(at(box(0.005, 0.026, 0.026, dark), sx * 0.028, 0.016, -0.39 + i * 0.05)); // side slots

  // === tan flat-top receiver + continuous black rail ===
  g.add(at(box(0.058, 0.078, 0.26, tan), 0, 0.014, -0.1));
  g.add(at(box(0.05, 0.02, 0.24, black), 0, 0.056, -0.1));            // receiver rail
  for (let i = 0; i < 9; i++) g.add(at(box(0.052, 0.006, 0.008, dark), 0, 0.066, -0.2 + i * 0.024)); // rail teeth
  g.add(at(box(0.05, 0.03, 0.06, tanHi), 0, 0.02, -0.02));            // raised charging block
  g.add(at(box(0.012, 0.024, 0.05, black), -0.036, 0.03, -0.16));     // left charging handle
  g.add(at(box(0.05, 0.04, 0.05, tanDk), 0.036, 0.0, -0.04));         // right side block / port

  // === hooded RING flip sights: front blade + rear ring with rotary drum ===
  g.add(at(box(0.022, 0.03, 0.022, blackDk), 0, 0.072, -0.36));       // front sight base
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0035, 8, 18), blackDk), 0, 0.096, -0.36)); // ring hood
  g.add(at(box(0.005, 0.02, 0.008, dark), 0, 0.09, -0.36));           // front post
  g.add(at(box(0.026, 0.034, 0.026, blackDk), 0, 0.074, 0.02));       // rear sight base
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.0035, 8, 18), blackDk), 0, 0.1, 0.02)); // rear ring aperture
  // knurled rotary range drum (1·2·3) on the right of the rear sight
  g.add(at(tube(0.016, 0.016, 0.026, blackDk, 16), 0.03, 0.066, 0.02, 0, Math.PI / 2)); // drum body (axis X)
  g.add(at(tube(0.0165, 0.0165, 0.008, amber, 16), 0.03, 0.066, 0.02, 0, Math.PI / 2)); // painted index band

  // === big round DRUM magazine — flat face SIDEWAYS (axis = X) ===
  g.add(at(box(0.05, 0.04, 0.06, tanDk), 0, -0.05, -0.06));           // mag well collar
  g.add(at(tube(0.072, 0.072, 0.056, drumMat, 24), 0, -0.13, -0.06, 0, Math.PI / 2)); // drum body
  for (const fx of [-1, 1]) {
    g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.005, 8, 22), drumMat), fx * 0.029, -0.13, -0.06, 0, Math.PI / 2)); // face rib
    g.add(at(tube(0.012, 0.012, 0.01, dark, 12), fx * 0.031, -0.13, -0.06, 0, Math.PI / 2)); // hub
  }
  g.add(at(box(0.06, 0.024, 0.05, drumMat), 0, -0.055, -0.06));       // drum top latch

  // === pistol grip + trigger guard ===
  g.add(at(box(0.042, 0.1, 0.046, grip), 0, -0.049, 0.07, 0.14));
  g.add(at(box(0.044, 0.016, 0.048, blackDk), 0, -0.105, 0.063, 0.14)); // grip cap
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 8, 16), black);
  g.add(at(guard, 0, -0.028, 0.02, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.024, 0.008, dark), 0, -0.024, 0.02));

  // === tan SCAR collapsing stock (rear ~z 0.2) ===
  g.add(at(box(0.05, 0.07, 0.06, tan), 0, 0.014, 0.06));              // stock body front
  g.add(at(box(0.05, 0.06, 0.1, tanDk), 0, 0.01, 0.15));              // stock body
  g.add(at(box(0.052, 0.092, 0.022, blackDk), 0, 0.004, 0.205));      // butt plate
  g.add(at(box(0.046, 0.024, 0.08, tanHi), 0, 0.046, 0.12));          // raised comb
  g.add(at(box(0.014, 0.04, 0.04, black), 0, -0.03, 0.07));           // sling/hinge block

  // === folded bipod under the front ===
  g.add(at(box(0.02, 0.02, 0.03, blackDk), 0, -0.02, -0.46));         // bipod mount
  for (const sx of [-1, 1]) {
    g.add(at(tube(0.005, 0.005, 0.16, black), sx * 0.012, -0.04, -0.38, 0, sx * 0.1, 0)); // leg folded back
    g.add(at(box(0.008, 0.02, 0.008, black), sx * 0.028, -0.05, -0.31));                   // foot
  }

  return { group: g, muzzle: -0.66 };
}

// --- STONER 63 — all-black belt/box-fed LMG. Long black barrel with a slotted
//     flash hider + flip front sight, the signature PERFORATED heat-shield
//     handguard (row of round holes) over a finned lower handguard, a vertical
//     front foregrip, a brown WOOD carry handle on top, a ribbed box magazine
//     inserted from below, a pistol grip and a solid black polymer fixed stock,
//     plus a folded bipod. Dingo-class size, all-black. ---
function stoner63() {
  const g = new THREE.Group();
  const black = gunMetal(0x202327, { metal: 0.58, rough: 0.4 });    // main body
  const blackHi = gunMetal(0x2f343b, { metal: 0.56, rough: 0.34 }); // light-catching panels
  const blackDk = gunDark(0x111316);                                // shadow / flash hider
  const steel = gunMetal(0x3a3f46, { metal: 0.76, rough: 0.26 });   // barrel
  const wood = gunWood(0x6a4428);                                   // brown wood carry handle
  const woodDk = gunWood(0x4c2e16);
  const mag = gunMetal(0x1b1e23, { metal: 0.5, rough: 0.46 });      // box mag
  const grip = gunGrip(0x1f2228);
  const dark = gunDark(0x0c0d10);

  // === long black barrel + slotted flash hider + hooded flip front sight ===
  g.add(at(tube(0.013, 0.013, 0.42, steel), 0, 0.024, -0.5));
  g.add(at(tube(0.019, 0.019, 0.07, blackDk, 14), 0, 0.024, -0.66));  // flash hider
  for (const sz of [-0.64, -0.67]) g.add(at(tube(0.0205, 0.0205, 0.006, dark, 12), 0, 0.024, sz)); // slot rings
  g.add(at(tube(0.013, 0.013, 0.018, dark, 12), 0, 0.024, -0.7));     // bore
  g.add(at(box(0.024, 0.05, 0.05, blackDk), 0, 0.014, -0.44));        // gas block / front band
  g.add(at(box(0.024, 0.028, 0.03, blackDk), 0, 0.05, -0.5));         // front sight base
  for (const sx of [-1, 1]) g.add(at(box(0.005, 0.038, 0.012, blackDk), sx * 0.013, 0.08, -0.5)); // protective ears
  g.add(at(box(0.006, 0.024, 0.01, dark), 0, 0.066, -0.5));           // front post

  // === perforated heat-shield handguard (row of round holes) + finned lower ===
  g.add(at(box(0.05, 0.044, 0.22, black), 0, 0.044, -0.32));          // shield body
  g.add(at(box(0.052, 0.012, 0.2, blackHi), 0, 0.07, -0.32));         // top strap
  for (const sx of [-1, 1]) for (let i = 0; i < 8; i++)
    g.add(at(tube(0.009, 0.009, 0.012, dark, 12), sx * 0.026, 0.05, -0.41 + i * 0.024, 0, Math.PI / 2)); // round perforations
  g.add(at(box(0.046, 0.05, 0.2, black), 0, -0.006, -0.32));          // finned lower handguard
  for (let i = 0; i < 9; i++) g.add(at(box(0.05, 0.052, 0.006, dark), 0, -0.006, -0.41 + i * 0.022)); // vertical cooling fins

  // === vertical front foregrip ===
  g.add(at(box(0.034, 0.08, 0.036, grip), 0, -0.07, -0.34));
  g.add(at(box(0.036, 0.014, 0.038, dark), 0, -0.114, -0.34));        // foregrip cap

  // === black receiver ===
  g.add(at(box(0.054, 0.082, 0.26, black), 0, 0.016, -0.08));
  g.add(at(box(0.05, 0.022, 0.24, blackHi), 0, 0.062, -0.08));        // top cover
  g.add(at(box(0.012, 0.024, 0.05, blackHi), -0.034, 0.03, -0.14));   // left charging handle
  g.add(at(box(0.05, 0.04, 0.05, blackDk), 0.034, 0.0, -0.02));       // right feed-cover block

  // (removed the tall wood carry handle — it sat over the sight line and blocked ADS)

  // === rear flip peep sight ===
  g.add(at(box(0.026, 0.026, 0.024, blackDk), 0, 0.078, 0.04));       // rear base
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.0035, 6, 14), dark), 0, 0.09, 0.046, 0, Math.PI / 2)); // aperture

  // === ribbed box magazine inserted from below (slight forward rake) ===
  g.add(at(box(0.05, 0.03, 0.058, blackDk), 0, -0.05, -0.04));        // mag well
  g.add(at(box(0.046, 0.14, 0.06, mag), 0, -0.14, -0.05, 0.06));      // box mag body
  g.add(at(box(0.048, 0.018, 0.062, dark), 0, -0.214, -0.04, 0.06));  // floorplate

  // === pistol grip + trigger guard ===
  g.add(at(box(0.042, 0.1, 0.046, grip), 0, -0.049, 0.07, 0.14));
  g.add(at(box(0.044, 0.016, 0.048, dark), 0, -0.105, 0.063, 0.14));  // grip cap
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 8, 16), blackDk);
  g.add(at(guard, 0, -0.028, 0.02, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.024, 0.008, dark), 0, -0.024, 0.02));

  // === solid black polymer fixed stock (AR-style, rear ~z 0.22) ===
  g.add(at(box(0.05, 0.066, 0.08, black), 0, 0.012, 0.05));           // stock neck
  g.add(at(box(0.052, 0.1, 0.12, blackHi), 0, 0.0, 0.16));            // stock body
  g.add(at(box(0.054, 0.11, 0.02, blackDk), 0, -0.004, 0.215));       // butt plate
  g.add(at(box(0.046, 0.03, 0.06, black), 0, 0.05, 0.12));            // comb top

  // === folded bipod under the front ===
  g.add(at(box(0.02, 0.02, 0.03, blackDk), 0, -0.026, -0.5));         // bipod mount
  for (const sx of [-1, 1]) {
    g.add(at(tube(0.005, 0.005, 0.16, blackDk), sx * 0.012, -0.046, -0.42, 0, sx * 0.1, 0)); // leg folded back
    g.add(at(box(0.008, 0.02, 0.008, blackDk), sx * 0.028, -0.056, -0.35));                   // foot
  }

  return { group: g, muzzle: -0.74 };
}

// --- LSAT (BO2) — modern boxy belt-fed LMG. Dark gunmetal body with gold/brass
//     accents, a chunky perforated muzzle brake, a top Picatinny rail with
//     hooded RING flip sights, a left-side belt of BLUE-tipped cartridges with a
//     red round-counter display, a square ammo box hanging below, a pistol grip
//     and a skeletonised collapsing stock. NO bipod. ---
function lsat() {
  const g = new THREE.Group();
  const body = gunMetal(0x2a2e34, { metal: 0.6, rough: 0.38 });    // dark gunmetal
  const bodyHi = gunMetal(0x3a4047, { metal: 0.58, rough: 0.32 }); // light-catching facets
  const bodyDk = gunDark(0x141519);                                // shadow channels
  const steel = gunMetal(0x44494f, { metal: 0.76, rough: 0.26 });  // bright barrel
  const gold = gunMetal(0xb89042, { metal: 0.85, rough: 0.34 });   // brass/gold accents
  const boxMat = gunMetal(0x222428, { metal: 0.5, rough: 0.46 });  // square ammo box
  const brass = gunMetal(0xb08a3c, { metal: 0.82, rough: 0.32 });  // belt cartridge bodies
  const grip = gunGrip(0x23262b);
  const dark = gunDark(0x0c0d10);
  const blue = mat(0x2f6cff, { metal: 0.3, rough: 0.4, emissive: 0x2f6cff, ei: 1.1 }); // blue cartridge tips
  const redLed = mat(0xff2a1e, { metal: 0.2, rough: 0.4, emissive: 0xff2a1e, ei: 1.6 }); // red counter

  // === barrel + chunky perforated muzzle brake (gold-accented) + brass collar ===
  g.add(at(tube(0.014, 0.014, 0.34, steel), 0, 0.022, -0.46));
  g.add(at(tube(0.02, 0.02, 0.03, gold, 14), 0, 0.022, -0.4));        // brass barrel collar
  g.add(at(box(0.046, 0.05, 0.1, bodyDk), 0, 0.022, -0.64));          // muzzle-brake block
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++)
    g.add(at(tube(0.008, 0.008, 0.05, dark, 10), sx * 0.022, 0.022, -0.62 + i * 0.026, 0, Math.PI / 2)); // drilled holes
  g.add(at(tube(0.015, 0.015, 0.018, dark, 12), 0, 0.022, -0.69));    // bore
  g.add(at(box(0.05, 0.012, 0.1, gold), 0, 0.05, -0.64));             // gold top strap on brake

  // === hooded RING front sight on a folding base ===
  g.add(at(box(0.022, 0.03, 0.024, bodyDk), 0, 0.05, -0.44));         // front sight base
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0035, 8, 18), bodyDk), 0, 0.078, -0.44)); // ring hood
  g.add(at(box(0.005, 0.02, 0.008, dark), 0, 0.072, -0.44));          // front post

  // === slotted handguard with side rail + small accent holes ===
  g.add(at(box(0.056, 0.062, 0.2, body), 0, 0.018, -0.3));
  g.add(at(box(0.05, 0.018, 0.18, bodyHi), 0, 0.052, -0.3));          // top rail
  for (let i = 0; i < 7; i++) g.add(at(box(0.052, 0.006, 0.008, dark), 0, 0.062, -0.38 + i * 0.024)); // rail teeth
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) g.add(at(tube(0.006, 0.006, 0.01, dark, 10), sx * 0.029, 0.018, -0.37 + i * 0.045, 0, Math.PI / 2)); // side accent holes

  // === boxy faceted receiver + top rail ===
  g.add(at(box(0.06, 0.084, 0.26, body), 0, 0.016, -0.08));
  g.add(at(box(0.052, 0.024, 0.24, bodyHi), 0, 0.064, -0.08));        // raised top deck
  for (let i = 0; i < 8; i++) g.add(at(box(0.054, 0.006, 0.008, dark), 0, 0.08, -0.18 + i * 0.026)); // rail teeth
  g.add(at(box(0.012, 0.024, 0.05, gold), -0.038, 0.03, -0.14));      // gold charging handle (left)
  g.add(at(box(0.05, 0.04, 0.06, bodyDk), 0.036, 0.0, -0.02));        // right feed cover block

  // === hooded RING rear flip sight (gold-accented) ===
  g.add(at(box(0.026, 0.026, 0.024, bodyDk), 0, 0.062, 0.04));        // rear base (lowered to the sight line)
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0035, 8, 18), gold), 0, 0.082, 0.04)); // gold ring aperture (level with front post)

  // === left-side belt of BLUE-tipped cartridges + red round-counter display ===
  g.add(at(box(0.05, 0.05, 0.06, bodyDk), -0.03, -0.02, -0.05));      // feed throat (left)
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    g.add(at(box(0.014, 0.022, 0.012, brass), -0.046, -0.06 + t * 0.07, -0.03 - t * 0.0)); // brass cartridge
    g.add(at(box(0.006, 0.008, 0.012, blue), -0.056, -0.06 + t * 0.07, -0.03));            // blue tip
  }
  g.add(at(box(0.018, 0.022, 0.012, dark), -0.044, -0.1, 0.02));      // counter housing
  g.add(at(box(0.014, 0.014, 0.006, redLed), -0.05, -0.1, 0.02));     // red "100" LED face

  // === square ammo box hanging below ===
  g.add(at(box(0.05, 0.03, 0.058, bodyDk), 0, -0.05, -0.04));         // mag well
  g.add(at(box(0.064, 0.11, 0.08, boxMat), 0, -0.12, -0.04));         // square ammo box
  g.add(at(box(0.066, 0.012, 0.04, dark), 0, -0.072, -0.04));         // box top latch
  for (const sx of [-1, 1]) g.add(at(box(0.004, 0.09, 0.06, dark), sx * 0.033, -0.12, -0.04)); // box edge seams
  g.add(at(box(0.05, 0.018, 0.014, gold), 0, -0.1, -0.001));          // small gold latch tab

  // === pistol grip + trigger guard ===
  g.add(at(box(0.042, 0.1, 0.046, grip), 0, -0.049, 0.07, 0.14));
  g.add(at(box(0.044, 0.016, 0.048, dark), 0, -0.105, 0.063, 0.14));  // grip cap
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 8, 16), bodyDk);
  g.add(at(guard, 0, -0.028, 0.02, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.024, 0.008, dark), 0, -0.024, 0.02));

  // === skeletonised collapsing stock (rear ~z 0.22, NO bipod) ===
  g.add(at(box(0.056, 0.072, 0.06, body), 0, 0.016, 0.06));           // stock socket
  g.add(at(box(0.05, 0.04, 0.12, bodyDk), 0, 0.046, 0.15));           // top strut
  g.add(at(box(0.05, 0.03, 0.1, bodyDk), 0, -0.03, 0.14));            // bottom strut
  g.add(at(box(0.026, 0.092, 0.024, body), 0, 0.01, 0.205));          // vertical butt frame
  g.add(at(box(0.04, 0.1, 0.03, dark), 0, 0.01, 0.218));             // butt pad

  return { group: g, muzzle: -0.71 };
}

// --- BALLISTA (BO2) — the scopeless precision rifle. FDE-tan angular chassis
//     with teardrop lightening cuts, a long black barrel + slotted muzzle brake,
//     a top rail carrying hooded IRON sights ONLY (open-prong front + a hooded
//     RING rear aperture — NO scope), a pistol grip, a box magazine, a folded
//     bipod and a skeletonised adjustable stock. Built iron-sights-only. ---
function ballista() {
  const g = new THREE.Group();
  const tan = gunMetal(0x8f8054, { metal: 0.32, rough: 0.55 });    // FDE chassis
  const tanHi = gunMetal(0xa5946a, { metal: 0.3, rough: 0.48 });   // lighter facets
  const tanDk = gunMetal(0x6c6040, { metal: 0.32, rough: 0.58 });  // shadowed tan
  const black = gunMetal(0x1c1e22, { metal: 0.52, rough: 0.42 });  // black rail/furniture
  const blackDk = gunDark(0x111316);
  const barrelMat = gunDark(0x141519);                             // near-black barrel
  const steel = gunMetal(0x3e434a, { metal: 0.74, rough: 0.26 });  // bright steel
  const mag = gunMetal(0x1a1d22, { metal: 0.5, rough: 0.45 });     // box mag
  const grip = gunGrip(0x26282d);
  const dark = gunDark(0x0c0d10);

  // === long black barrel + slotted boxy muzzle brake ===
  g.add(at(tube(0.016, 0.016, 0.4, barrelMat), 0, 0.02, -0.5));
  g.add(at(box(0.042, 0.042, 0.1, blackDk), 0, 0.02, -0.7));          // brake block
  for (let i = 0; i < 3; i++) g.add(at(box(0.046, 0.046, 0.008, dark), 0, 0.02, -0.67 - i * 0.022)); // top slots
  for (const sx of [-1, 1]) g.add(at(box(0.006, 0.024, 0.06, dark), sx * 0.022, 0.02, -0.7)); // side vents
  g.add(at(tube(0.016, 0.016, 0.016, dark, 12), 0, 0.02, -0.755));    // bore
  g.add(at(box(0.03, 0.03, 0.06, tanDk), 0, 0.014, -0.42));           // barrel clamp / gas block

  // === FDE handguard with rail + teardrop lightening cuts ===
  g.add(at(box(0.056, 0.06, 0.22, tan), 0, 0.018, -0.32));
  g.add(at(box(0.046, 0.016, 0.2, black), 0, 0.052, -0.32));          // top rail
  for (let i = 0; i < 8; i++) g.add(at(box(0.048, 0.006, 0.008, dark), 0, 0.062, -0.41 + i * 0.024)); // rail teeth
  for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) g.add(at(box(0.006, 0.03, 0.07, blackDk), sx * 0.029, 0.014, -0.38 + i * 0.09, 0, 0, 0.2)); // angled cuts

  // === angular FDE receiver + continuous rail ===
  g.add(at(box(0.058, 0.078, 0.26, tan), 0, 0.014, -0.1));
  g.add(at(box(0.05, 0.02, 0.24, black), 0, 0.054, -0.1));            // receiver rail
  for (let i = 0; i < 9; i++) g.add(at(box(0.052, 0.006, 0.008, dark), 0, 0.064, -0.2 + i * 0.024)); // rail teeth
  // teardrop lightening cuts down the receiver sides (the Ballista's signature)
  for (const sx of [-1, 1]) {
    g.add(at(box(0.006, 0.044, 0.1, blackDk), sx * 0.03, 0.0, -0.13, 0, 0, 0.25));
    g.add(at(box(0.006, 0.034, 0.05, blackDk), sx * 0.03, -0.01, 0.0, 0, 0, 0.25));
  }
  g.add(at(box(0.014, 0.024, 0.05, tanHi), -0.034, 0.03, -0.16));     // left charging handle
  g.add(at(box(0.05, 0.04, 0.06, tanDk), 0.034, 0.0, -0.02));         // right bolt/port block

  // === hooded IRON sights ONLY — open-prong front + hooded RING rear (NO scope) ===
  g.add(at(box(0.022, 0.026, 0.024, blackDk), 0, 0.064, -0.46));      // front sight base
  for (const sx of [-1, 1]) g.add(at(box(0.005, 0.034, 0.012, blackDk), sx * 0.012, 0.092, -0.46)); // open prongs
  g.add(at(box(0.005, 0.024, 0.01, dark), 0, 0.082, -0.46));          // front post
  g.add(at(box(0.028, 0.03, 0.024, blackDk), 0, 0.07, 0.04));         // rear sight base
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.005, 10, 20), blackDk), 0, 0.098, 0.04)); // hooded ring aperture
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0028, 8, 16), dark), 0, 0.098, 0.038)); // inner aperture ring

  // === box magazine ahead of the grip ===
  g.add(at(box(0.05, 0.03, 0.058, tanDk), 0, -0.05, -0.06));          // mag well
  g.add(at(box(0.044, 0.11, 0.052, mag), 0, -0.11, -0.06, 0.04));     // mag body
  g.add(at(box(0.046, 0.016, 0.054, dark), 0, -0.172, -0.05, 0.04));  // floorplate

  // === pistol grip + trigger guard ===
  g.add(at(box(0.042, 0.1, 0.046, grip), 0, -0.049, 0.07, 0.14));
  g.add(at(box(0.044, 0.016, 0.048, dark), 0, -0.105, 0.063, 0.14));  // grip cap
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 8, 16), tanDk);
  g.add(at(guard, 0, -0.028, 0.02, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.024, 0.008, dark), 0, -0.024, 0.02));

  // === skeletonised adjustable stock (rear ~z 0.22) ===
  g.add(at(box(0.05, 0.066, 0.07, tan), 0, 0.012, 0.06));             // stock neck
  g.add(at(box(0.044, 0.022, 0.14, tanDk), 0, 0.046, 0.15));          // top comb bar
  g.add(at(box(0.046, 0.03, 0.1, tanHi), 0, 0.066, 0.13));            // adjustable cheek riser
  g.add(at(box(0.034, 0.02, 0.14, tan), 0, -0.03, 0.15));             // lower bar (skeleton gap above)
  g.add(at(box(0.03, 0.1, 0.024, tan), 0, 0.018, 0.205));             // rear vertical frame
  g.add(at(box(0.046, 0.11, 0.022, blackDk), 0, 0.014, 0.218));       // recoil pad

  // === folded bipod under the front ===
  g.add(at(box(0.02, 0.02, 0.03, blackDk), 0, -0.022, -0.42));        // bipod mount
  for (const sx of [-1, 1]) {
    g.add(at(tube(0.005, 0.005, 0.16, black), sx * 0.012, -0.042, -0.34, 0, sx * 0.1, 0)); // leg folded back
    g.add(at(box(0.008, 0.02, 0.008, black), sx * 0.028, -0.052, -0.27));                   // foot
  }

  return { group: g, muzzle: -0.78 };
}

// --- DRAKON (BO3) — ornate scoped semi-auto marksman rifle. A long slotted
//     STEEL barrel shroud (oval lightening cuts) over rich walnut furniture with
//     gold scroll accents, a knurled muzzle brake, a big scope on top, an
//     angular gunmetal receiver, a SIDE-mounted (left) box magazine, and a
//     thumbhole wood stock with an engraved gold side plate. DSR-sized. ---
function drakon() {
  const g = new THREE.Group();
  const steel = gunMetal(0x42474e, { metal: 0.78, rough: 0.24 });   // bright shroud steel
  const steelDk = gunMetal(0x2a2e34, { metal: 0.7, rough: 0.34 });
  const barrelMat = gunDark(0x141519);                              // near-black barrel
  const wood = gunWood(0x6e4424);                                   // walnut furniture
  const woodDk = gunWood(0x4c2e16);
  const gold = gunMetal(0xb8923c, { metal: 0.88, rough: 0.32 });    // brass/gold accents
  const goldEngrave = engravedSteel(0xb8923c);                      // ornate engraved plate
  const bodyMat = gunMetal(0x2e333b, { metal: 0.64, rough: 0.36 }); // gunmetal receiver
  const olive = gunMetal(0x5e6038, { metal: 0.4, rough: 0.52 });    // olive side magazine
  const scopeBody = gunDark(0x0e0f12);
  const scopeMetal = gunMetal(0x2a2e35);
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a0e12, metalness: 0.2, roughness: 0.14 });
  const grip = gunWood(0x66401f);
  const dark = gunDark(0x0c0d10);
  const red = scopeGlow(0xff2a1e);
  const cyl = (r1, r2, len, m, seg = 14) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg), m); // axis = y

  // === barrel + knurled muzzle brake (bright bore) ===
  g.add(at(tube(0.015, 0.015, 0.42, barrelMat), 0, 0.01, -0.56));
  g.add(at(tube(0.026, 0.026, 0.08, steelDk, 16), 0, 0.01, -0.79));   // brake body
  for (const sz of [-0.77, -0.8, -0.83]) g.add(at(tube(0.028, 0.028, 0.006, dark, 14), 0, 0.01, sz)); // knurl rings
  g.add(at(tube(0.022, 0.022, 0.014, gold, 14), 0, 0.01, -0.84));     // gold front collar
  g.add(at(tube(0.013, 0.013, 0.018, dark, 12), 0, 0.01, -0.85));     // bright bore

  // === long slotted STEEL barrel shroud (oval lightening cuts) ===
  g.add(at(box(0.046, 0.05, 0.42, steel), 0, 0.04, -0.52));
  g.add(at(box(0.05, 0.014, 0.42, steelDk), 0, 0.066, -0.52));        // top strap
  for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) g.add(at(box(0.005, 0.026, 0.05, dark), sx * 0.024, 0.04, -0.66 + i * 0.07)); // side ovals
  for (let i = 0; i < 5; i++) g.add(at(box(0.022, 0.005, 0.05, dark), 0, 0.066, -0.66 + i * 0.07)); // top ovals

  // === rich walnut forend below the shroud (with a long groove) ===
  g.add(at(box(0.052, 0.05, 0.36, wood), 0, -0.012, -0.48));
  g.add(at(box(0.054, 0.012, 0.28, woodDk), 0, -0.034, -0.46));       // bottom groove inlay
  for (const sx of [-1, 1]) g.add(at(box(0.005, 0.02, 0.24, woodDk), sx * 0.027, -0.01, -0.46)); // side grooves
  g.add(at(tube(0.012, 0.012, 0.04, gold, 12), 0, -0.012, -0.3, 0, Math.PI / 2)); // gold barrel-band stud

  // === angular gunmetal receiver + gold accents + panel rivets ===
  g.add(at(box(0.058, 0.082, 0.26, bodyMat), 0, 0.012, -0.12));
  g.add(at(box(0.05, 0.024, 0.24, steelDk), 0, 0.058, -0.12));        // raised top deck (scope rail base)
  g.add(at(box(0.05, 0.014, 0.06, gold), 0, 0.066, -0.02));           // gold rail accent
  for (let i = 0; i < 4; i++) g.add(at(tube(0.004, 0.004, 0.062, dark, 6), 0, 0.0, -0.18 + i * 0.06, 0, 0, Math.PI / 2)); // panel rivets
  g.add(at(box(0.014, 0.024, 0.05, steelDk), 0.034, 0.024, -0.06));   // right charging handle
  g.add(at(box(0.018, 0.03, 0.026, gold), 0, -0.008, 0.02, 0, 0, 0.2)); // brass action accent

  // === big scope on top (red illumination) ===
  g.add(at(box(0.04, 0.03, 0.022, scopeMetal), 0, 0.088, -0.22));     // front mount ring
  g.add(at(box(0.04, 0.03, 0.022, scopeMetal), 0, 0.088, -0.02));     // rear mount ring
  g.add(at(tube(0.026, 0.026, 0.26, scopeBody), 0, 0.11, -0.12));     // main tube
  g.add(at(tube(0.036, 0.028, 0.07, scopeBody), 0, 0.11, -0.27));     // objective bell
  g.add(at(tube(0.034, 0.034, 0.008, glass), 0, 0.11, -0.305));       // objective lens
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.005, 8, 24), red), 0, 0.11, -0.302)); // red objective ring
  g.add(at(tube(0.03, 0.028, 0.045, scopeMetal), 0, 0.11, 0.0));      // knurled magnification ring
  g.add(at(tube(0.028, 0.028, 0.006, glass), 0, 0.11, 0.04));         // ocular lens
  g.add(at(cyl(0.016, 0.016, 0.03, scopeMetal), 0, 0.142, -0.11));    // elevation turret
  g.add(at(cyl(0.0175, 0.0175, 0.006, red, 14), 0, 0.133, -0.11));    // turret red index band

  // === SIDE-mounted (left) box magazine — projects out the left, raked down ===
  g.add(at(box(0.03, 0.05, 0.06, steelDk), -0.034, -0.03, -0.06));    // side mag well
  g.add(at(box(0.11, 0.06, 0.052, olive), -0.1, -0.05, -0.06, 0, 0, 0.34)); // mag body (out to the left)
  g.add(at(box(0.018, 0.062, 0.054, dark), -0.158, -0.07, -0.06, 0, 0, 0.34)); // mag end cap
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 8, 16), gold), -0.1, -0.05, -0.032, 0, 0, 0.34)); // gold emblem ring

  // === thumbhole walnut stock with engraved gold side plate (rear ~z 0.22) ===
  g.add(at(box(0.046, 0.07, 0.08, wood), 0, 0.008, 0.04));            // wrist
  g.add(at(box(0.044, 0.022, 0.16, wood), 0, 0.052, 0.16));           // top comb bar
  g.add(at(box(0.042, 0.07, 0.05, grip), 0, -0.06, 0.08, 0.2));       // thumbhole grip column
  g.add(at(box(0.04, 0.03, 0.05, dark), 0, -0.02, 0.115));            // thumbhole inner shadow (the hole)
  g.add(at(box(0.05, 0.11, 0.1, wood), 0, -0.004, 0.18));             // butt body
  g.add(at(box(0.004, 0.08, 0.07, goldEngrave), 0.026, 0.0, 0.18));   // engraved gold side plate (right)
  g.add(at(box(0.004, 0.08, 0.07, goldEngrave), -0.026, 0.0, 0.18));  // engraved gold side plate (left)
  g.add(at(box(0.052, 0.118, 0.02, dark), 0, -0.01, 0.225));          // recoil pad

  // === trigger guard + trigger ===
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 8, 16), bodyMat);
  g.add(at(guard, 0, -0.04, -0.04, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.026, 0.009, dark), 0, -0.035, -0.04));         // trigger

  return { group: g, muzzle: -0.85 };
}

// --- SVG-300 (AW) — the 2035 power sniper / coil rifle. Polished CHROME barrel
//     assembly with glowing RED energy grooves, a chunky faceted muzzle with
//     rectangular vents, a long slab shroud, a beefy futuristic scope on top, a
//     skeletonised gunmetal frame (lightening holes + triangular bracing), a
//     magazine block underneath, a holed pistol grip with a red trigger, and a
//     skeleton stock. DSR-sized but heavier. ---
function svg300() {
  const g = new THREE.Group();
  const chrome = gunMetal(0xb8bcc2, { metal: 0.92, rough: 0.18 });  // polished silver
  const chromeDk = gunMetal(0x7c8086, { metal: 0.86, rough: 0.26 });
  const body = gunMetal(0x2c3037, { metal: 0.64, rough: 0.38 });    // gunmetal frame
  const bodyDk = gunDark(0x16181c);                                 // shadow / skeleton
  const scopeBody = gunDark(0x121419);
  const scopeMetal = gunMetal(0x2a2e35);
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a0e12, metalness: 0.2, roughness: 0.14 });
  const grip = gunGrip(0x24272c);
  const dark = gunDark(0x0c0d10);
  const red = mat(0xff2a1e, { metal: 0.2, rough: 0.4, emissive: 0xff2a1e, ei: 1.8 }); // energy grooves
  const cyl = (r1, r2, len, m, seg = 14) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg), m); // axis = y

  // === chunky faceted (octagonal) muzzle block with rectangular vents ===
  g.add(at(tube(0.038, 0.038, 0.12, chrome, 8), 0, 0.022, -0.78));    // octagonal muzzle
  g.add(at(tube(0.04, 0.04, 0.014, chromeDk, 8), 0, 0.022, -0.84));   // front cap
  g.add(at(tube(0.016, 0.016, 0.02, dark, 12), 0, 0.022, -0.85));     // bore
  for (const sx of [-1, 1]) g.add(at(box(0.012, 0.022, 0.04, dark), sx * 0.026, 0.022, -0.76)); // rectangular vents

  // === long polished slab barrel shroud + red energy grooves ===
  g.add(at(box(0.05, 0.064, 0.5, chrome), 0, 0.022, -0.48));
  g.add(at(box(0.054, 0.016, 0.5, chromeDk), 0, 0.058, -0.48));       // top facet strip
  g.add(at(box(0.03, 0.07, 0.5, chromeDk), 0, 0.0, -0.48));           // lower facet
  // rows of glowing red energy dashes along the top and sides
  for (let i = 0; i < 6; i++) {
    g.add(at(box(0.026, 0.005, 0.05, red), 0, 0.067, -0.66 + i * 0.07));        // top dash
    for (const sx of [-1, 1]) g.add(at(box(0.004, 0.018, 0.05, red), sx * 0.026, 0.03, -0.66 + i * 0.07)); // side dash
  }
  // rectangular window cutouts near the front
  for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) g.add(at(box(0.006, 0.026, 0.06, dark), sx * 0.026, 0.02, -0.64 + i * 0.1));

  // === skeletonised gunmetal frame (mid-body) ===
  g.add(at(box(0.052, 0.09, 0.28, body), 0, 0.006, -0.06));          // receiver core
  g.add(at(box(0.048, 0.026, 0.26, chromeDk), 0, 0.058, -0.06));      // scope-rail deck
  g.add(at(box(0.054, 0.01, 0.16, red), 0, 0.072, -0.04));           // red rail accent line
  // lightening holes + triangular bracing down the sides
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) g.add(at(tube(0.008, 0.008, 0.054, dark, 10), sx * 0.026, -0.02, -0.16 + i * 0.05, 0, 0, Math.PI / 2)); // holes
    g.add(at(box(0.004, 0.06, 0.012, body), sx * 0.027, -0.01, 0.04, 0, 0, 0.5)); // diagonal brace
    g.add(at(box(0.004, 0.06, 0.012, body), sx * 0.027, -0.01, -0.16, 0, 0, -0.5));
  }
  g.add(at(box(0.014, 0.024, 0.05, chromeDk), 0.03, 0.03, -0.12));    // right charging block

  // === beefy futuristic scope on top ===
  g.add(at(box(0.05, 0.034, 0.024, scopeMetal), 0, 0.09, -0.18));     // front mount
  g.add(at(box(0.05, 0.034, 0.024, scopeMetal), 0, 0.09, 0.02));      // rear mount
  g.add(at(box(0.05, 0.05, 0.24, scopeBody), 0, 0.122, -0.08));       // boxy scope housing
  g.add(at(tube(0.03, 0.034, 0.06, scopeBody, 16), 0, 0.122, -0.21));// objective bell
  g.add(at(tube(0.03, 0.03, 0.008, glass), 0, 0.122, -0.242));        // objective lens
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.005, 8, 24), red), 0, 0.122, -0.239)); // red objective ring
  g.add(at(box(0.03, 0.02, 0.06, scopeMetal), 0, 0.15, -0.02));       // top control pod
  g.add(at(box(0.012, 0.012, 0.008, red), 0, 0.158, -0.02));          // red indicator
  g.add(at(tube(0.026, 0.026, 0.006, glass), 0, 0.122, 0.045));       // ocular lens

  // === magazine block underneath ===
  g.add(at(box(0.05, 0.05, 0.06, bodyDk), 0, -0.06, -0.1));           // mag well
  g.add(at(box(0.046, 0.1, 0.058, body), 0, -0.13, -0.1));            // mag body (short, big rounds)
  g.add(at(box(0.048, 0.018, 0.06, dark), 0, -0.186, -0.1));          // floorplate
  g.add(at(box(0.05, 0.01, 0.04, red), 0, -0.09, -0.07));             // red mag accent

  // === holed pistol grip + red trigger ===
  g.add(at(box(0.044, 0.11, 0.05, grip), 0, -0.049, 0.06, 0.14));
  for (let i = 0; i < 3; i++) g.add(at(tube(0.007, 0.007, 0.052, dark, 8), 0, -0.05 - i * 0.025, 0.066 + i * 0.006, 0, 0, Math.PI / 2)); // grip holes
  g.add(at(box(0.046, 0.016, 0.052, dark), 0, -0.110, 0.052, 0.14)); // grip cap
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.005, 8, 16), body);
  g.add(at(guard, 0, -0.03, 0.0, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.026, 0.009, red), 0, -0.026, 0.0));            // red trigger

  // === skeleton stock (triangular cutouts, rear ~z 0.22) ===
  g.add(at(box(0.05, 0.084, 0.06, body), 0, 0.006, 0.06));           // stock socket
  g.add(at(box(0.044, 0.022, 0.16, chromeDk), 0, 0.05, 0.16));        // top bar
  g.add(at(box(0.038, 0.02, 0.14, body), 0, -0.04, 0.16));           // bottom bar (skeleton gap)
  for (const sx of [-1, 1]) g.add(at(box(0.004, 0.07, 0.012, body), sx * 0.02, 0.004, 0.14, 0, 0, 0.5)); // diagonal braces
  g.add(at(box(0.03, 0.11, 0.024, body), 0, 0.006, 0.205));          // rear vertical frame
  g.add(at(box(0.048, 0.12, 0.022, dark), 0, 0.002, 0.218));         // butt pad

  return { group: g, muzzle: -0.86 };
}

// --- SWISS K31 (Schmidt-Rubin) — classic full-wood straight-pull bolt rifle.
//     Long blued barrel with a brass-tipped muzzle + hooded front blade, a
//     tangent rear sight, a near-full-length walnut stock with steel barrel
//     bands, the signature bright STRAIGHT-PULL bolt with the RING pull loop on
//     the right, a trigger guard and a wooden buttstock. Iron sights only. ---
function k31() {
  const g = new THREE.Group();
  const wood = gunWood(0x9a5a28);                                   // warm walnut
  const woodDk = gunWood(0x6e3c18);
  const blued = gunMetal(0x2a2e34, { metal: 0.66, rough: 0.34 });   // blued steel
  const bluedDk = gunDark(0x16191d);
  const barrelMat = gunDark(0x1a1d22);                              // barrel
  const brightSteel = gunMetal(0x9498a0, { metal: 0.86, rough: 0.2 }); // white bolt steel
  const brass = gunMetal(0xb08a3c, { metal: 0.82, rough: 0.34 });   // muzzle/front tip
  const dark = gunDark(0x0c0d10);

  // === long blued barrel + brass-tipped muzzle + hooded front blade ===
  g.add(at(tube(0.012, 0.012, 0.62, barrelMat), 0, 0.03, -0.46));
  g.add(at(tube(0.016, 0.016, 0.04, brass, 14), 0, 0.03, -0.78));    // brass muzzle collar
  g.add(at(tube(0.011, 0.011, 0.018, dark, 12), 0, 0.03, -0.81));    // bore
  g.add(at(box(0.022, 0.026, 0.03, bluedDk), 0, 0.05, -0.74));       // front sight base
  for (const sx of [-1, 1]) g.add(at(box(0.005, 0.032, 0.012, bluedDk), sx * 0.011, 0.078, -0.74)); // protective ears
  g.add(at(box(0.005, 0.02, 0.01, dark), 0, 0.07, -0.74));           // front blade

  // === near-full-length walnut forend (under the barrel) + barrel bands ===
  g.add(at(box(0.044, 0.05, 0.56, wood), 0, 0.0, -0.42));            // forend
  g.add(at(box(0.03, 0.022, 0.5, woodDk), 0, 0.03, -0.42));          // upper handguard wood strip
  for (const bz of [-0.36, -0.6]) {                                  // steel barrel bands
    g.add(at(tube(0.026, 0.026, 0.022, bluedDk, 14), 0, 0.012, bz));
    g.add(at(box(0.05, 0.012, 0.024, bluedDk), 0, -0.02, bz));       // band lower lug
  }
  g.add(at(box(0.012, 0.016, 0.02, bluedDk), 0, -0.044, -0.58));     // forward sling swivel

  // === tangent rear sight on the barrel ahead of the receiver ===
  g.add(at(box(0.03, 0.02, 0.05, bluedDk), 0, 0.05, -0.2));          // rear sight base
  g.add(at(box(0.026, 0.026, 0.012, bluedDk), 0, 0.07, -0.18));      // tangent leaf
  g.add(at(box(0.012, 0.008, 0.008, dark), 0, 0.082, -0.18));        // rear notch

  // === blued receiver ===
  g.add(at(box(0.046, 0.058, 0.22, blued), 0, 0.018, -0.06));
  g.add(at(box(0.04, 0.02, 0.2, bluedDk), 0, 0.05, -0.06));          // receiver top flat
  g.add(at(box(0.05, 0.05, 0.07, blued), 0, -0.02, -0.1));           // magazine housing (flush 6-rd box)
  g.add(at(box(0.046, 0.024, 0.06, bluedDk), 0, -0.05, -0.1));       // magazine floor

  // === signature STRAIGHT-PULL bolt with the RING pull loop (right side) ===
  g.add(at(tube(0.013, 0.013, 0.2, brightSteel), 0.012, 0.046, -0.02)); // bolt body (bright)
  g.add(at(box(0.02, 0.03, 0.05, brightSteel), 0.012, 0.046, 0.06));    // bolt sleeve / cocking piece
  g.add(at(box(0.016, 0.022, 0.04, brightSteel), 0.03, 0.03, 0.05, 0, 0, 0.3)); // bolt handle arm (out right)
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 8, 18), brightSteel), 0.046, 0.018, 0.07, Math.PI / 2)); // RING pull loop (vertical)

  // === trigger guard + trigger ===
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.005, 8, 16), bluedDk);
  g.add(at(guard, 0, -0.03, 0.0, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.024, 0.008, dark), 0, -0.026, 0.0));          // trigger

  // === wooden buttstock with butt plate (rear ~z 0.22) ===
  g.add(at(box(0.04, 0.066, 0.1, wood), 0, -0.01, 0.08));            // wrist/comb neck
  g.add(at(box(0.046, 0.11, 0.12, wood), 0, -0.024, 0.17));          // butt body
  g.add(at(box(0.044, 0.03, 0.07, woodDk), 0, 0.044, 0.11));         // raised comb
  g.add(at(box(0.048, 0.12, 0.018, bluedDk), 0, -0.03, 0.225));      // steel butt plate
  g.add(at(box(0.012, 0.016, 0.02, bluedDk), 0, -0.084, 0.12));      // rear sling swivel

  return { group: g, muzzle: -0.82 };
}

// --- SVU (SVU-AS) — bullpup Dragunov marksman rifle. Black receiver + skeleton
//     thumbhole stock, the signature maroon RIBBED bakelite handguard, a fat
//     cylindrical muzzle device, a PSO scope on top (red lens), a curved
//     Dragunov magazine forward of the grip, and a hooded front sight. Scoped. ---
function svu() {
  const g = new THREE.Group();
  const maroon = gunMetal(0x5e2a28, { metal: 0.34, rough: 0.52 });  // maroon bakelite
  const maroonDk = gunMetal(0x44201e, { metal: 0.34, rough: 0.56 });
  const black = gunMetal(0x1c1e22, { metal: 0.52, rough: 0.42 });   // black furniture
  const blackHi = gunMetal(0x2a2e34, { metal: 0.5, rough: 0.36 });
  const barrelMat = gunDark(0x141519);
  const steel = gunMetal(0x3a3f46, { metal: 0.74, rough: 0.26 });
  const mag = gunMetal(0x1a1d22, { metal: 0.5, rough: 0.45 });
  const scopeBody = gunDark(0x0e0f12);
  const scopeMetal = gunMetal(0x2a2e35);
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a0e12, metalness: 0.2, roughness: 0.14 });
  const grip = gunGrip(0x222428);
  const dark = gunDark(0x0c0d10);
  const red = scopeGlow(0xff2a1e);
  const cyl = (r1, r2, len, m, seg = 14) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg), m); // axis = y

  // === fat cylindrical muzzle device + barrel (front pulled back to the
  //     handguard/receiver so it doesn't float out ahead) ===
  g.add(at(tube(0.014, 0.014, 0.26, barrelMat), 0, 0.024, -0.4));
  g.add(at(tube(0.028, 0.028, 0.12, black, 16), 0, 0.024, -0.58));    // fat muzzle brake body
  for (const sz of [-0.54, -0.58, -0.62]) g.add(at(tube(0.03, 0.03, 0.006, dark, 14), 0, 0.024, sz)); // grooves
  g.add(at(tube(0.026, 0.026, 0.016, blackHi, 16), 0, 0.024, -0.65)); // front cap
  g.add(at(tube(0.014, 0.014, 0.018, dark, 12), 0, 0.024, -0.655));   // bore
  g.add(at(box(0.026, 0.04, 0.04, blackHi), 0, 0.046, -0.44));        // gas block
  g.add(at(box(0.022, 0.026, 0.03, black), 0, 0.066, -0.44));         // hooded front sight base
  for (const sx of [-1, 1]) g.add(at(box(0.005, 0.03, 0.012, black), sx * 0.011, 0.092, -0.44)); // ears

  // === maroon RIBBED bakelite handguard (the SVU signature) ===
  g.add(at(box(0.05, 0.058, 0.2, maroon), 0, 0.014, -0.28));
  g.add(at(tube(0.028, 0.028, 0.18, maroon, 16), 0, 0.04, -0.28));    // rounded ribbed top
  for (let i = 0; i < 9; i++) g.add(at(box(0.056, 0.05, 0.006, maroonDk), 0, 0.02, -0.36 + i * 0.02)); // vertical cooling ribs
  for (const sx of [-1, 1]) g.add(at(box(0.006, 0.04, 0.16, maroonDk), sx * 0.027, 0.012, -0.28)); // side rails

  // === black receiver ===
  g.add(at(box(0.05, 0.072, 0.24, black), 0, 0.014, -0.08));
  g.add(at(box(0.044, 0.022, 0.22, blackHi), 0, 0.052, -0.08));       // top cover / scope base
  g.add(at(box(0.014, 0.024, 0.05, blackHi), -0.032, 0.03, -0.12));   // left charging handle
  g.add(at(box(0.05, 0.04, 0.05, dark), 0.032, 0.0, -0.02));          // right port block

  // === PSO scope on top (offset mount, red lens) ===
  g.add(at(box(0.024, 0.04, 0.04, scopeMetal), -0.026, 0.078, -0.04)); // side mount bracket (left, Dragunov-style)
  g.add(at(box(0.03, 0.03, 0.05, scopeMetal), 0, 0.1, -0.14));         // front mount
  g.add(at(tube(0.024, 0.024, 0.24, scopeBody), 0, 0.118, -0.06));     // main tube
  g.add(at(tube(0.032, 0.026, 0.06, scopeBody), 0, 0.118, -0.18));     // objective bell
  g.add(at(tube(0.03, 0.03, 0.008, glass), 0, 0.118, -0.212));         // objective lens
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.005, 8, 24), red), 0, 0.118, -0.209)); // red lens ring
  g.add(at(cyl(0.015, 0.015, 0.028, scopeMetal), 0, 0.146, -0.08));    // elevation turret
  g.add(at(tube(0.026, 0.024, 0.05, scopeBody), 0, 0.118, 0.06, 0.5)); // angled eyepiece
  g.add(at(tube(0.024, 0.024, 0.006, glass), 0, 0.13, 0.085));         // ocular lens

  // === curved Dragunov magazine forward of the grip ===
  g.add(at(box(0.046, 0.03, 0.056, dark), 0, -0.04, -0.04));          // mag well
  g.add(at(box(0.04, 0.08, 0.05, mag), 0, -0.09, -0.05, 0.18));
  g.add(at(box(0.04, 0.06, 0.048, mag), 0, -0.15, -0.02, 0.4));       // lower (curved)
  g.add(at(box(0.042, 0.016, 0.05, dark), 0, -0.19, 0.005, 0.4));     // floorplate

  // === pistol grip + trigger guard ===
  g.add(at(box(0.042, 0.1, 0.046, grip), 0, -0.044, 0.06, 0.14));
  g.add(at(box(0.044, 0.016, 0.048, dark), 0, -0.100, 0.053, 0.14));    // grip cap
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 8, 16), black);
  g.add(at(guard, 0, -0.026, 0.0, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.024, 0.008, dark), 0, -0.022, 0.0));

  // === black skeleton thumbhole stock (rear ~z 0.22) ===
  g.add(at(box(0.048, 0.07, 0.07, black), 0, 0.012, 0.06));           // stock front
  g.add(at(box(0.044, 0.022, 0.14, blackHi), 0, 0.05, 0.15));         // top comb bar
  g.add(at(box(0.046, 0.03, 0.06, black), 0, 0.07, 0.12));            // cheek riser
  g.add(at(box(0.04, 0.046, 0.04, black), 0, -0.05, 0.12, 0.2));      // thumbhole grip column
  g.add(at(box(0.034, 0.026, 0.04, dark), 0, -0.012, 0.13));          // thumbhole inner shadow
  g.add(at(box(0.03, 0.1, 0.024, black), 0, 0.014, 0.205));           // rear vertical frame
  g.add(at(box(0.046, 0.11, 0.022, dark), 0, 0.01, 0.218));           // butt pad

  return { group: g, muzzle: -0.66 };
}

// --- RPG-7 — classic shoulder-fired rocket launcher. A long steel tube with the
//     brown WOOD heat-shield wraps, a bulbous olive PG-7 warhead + conical nose
//     at the front, the flared venturi blast cone at the rear, raised iron sights
//     on top, a pistol grip + trigger and a forward grip underneath. ---
function rpg7() {
  const g = new THREE.Group();
  const tubeMat = gunMetal(0x2a2e34, { metal: 0.62, rough: 0.36 }); // steel tube
  const tubeDk = gunDark(0x16191d);
  const wood = gunWood(0x7a4a26);                                  // wood heat shield
  const woodDk = gunWood(0x583218);
  const olive = gunMetal(0x4e5836, { metal: 0.3, rough: 0.6 });    // PG-7 warhead
  const oliveDk = gunMetal(0x3a4128, { metal: 0.3, rough: 0.62 });
  const steel = gunMetal(0x3a3f46, { metal: 0.74, rough: 0.28 });
  const grip = gunGrip(0x222428);
  const dark = gunDark(0x0c0d10);

  // === main launch tube ===
  g.add(at(tube(0.03, 0.03, 0.56, tubeMat), 0, 0.02, -0.24));
  g.add(at(tube(0.031, 0.031, 0.04, tubeDk, 18), 0, 0.02, -0.46)); // forward reinforcing ring
  g.add(at(tube(0.031, 0.031, 0.04, tubeDk, 18), 0, 0.02, 0.02));  // rear reinforcing ring

  // === brown wood heat-shield wraps around the middle ===
  for (const wz of [-0.12, -0.04]) {
    g.add(at(tube(0.036, 0.036, 0.07, wood, 18), 0, 0.02, wz));
    g.add(at(tube(0.037, 0.037, 0.008, woodDk, 18), 0, 0.02, wz - 0.034)); // wrap seam
    g.add(at(tube(0.037, 0.037, 0.008, woodDk, 18), 0, 0.02, wz + 0.034));
  }

  // === bulbous olive PG-7 warhead + conical nose at the front ===
  g.add(at(tube(0.024, 0.024, 0.05, steel), 0, 0.02, -0.49));       // sustainer neck (into the tube)
  g.add(at(tube(0.038, 0.038, 0.08, olive, 18), 0, 0.02, -0.56));   // bulbous warhead body
  g.add(at(tube(0.038, 0.006, 0.1, olive, 18), 0, 0.02, -0.66));    // conical nose (tapers to a point)
  g.add(at(tube(0.04, 0.04, 0.01, oliveDk, 18), 0, 0.02, -0.515));  // warhead base band
  for (let i = 0; i < 3; i++) g.add(at(tube(0.039, 0.039, 0.005, oliveDk, 18), 0, 0.02, -0.6 - i * 0.018)); // nose scribe lines

  // === flared venturi blast cone at the rear (opens rearward) ===
  g.add(at(tube(0.03, 0.052, 0.09, tubeMat, 18), 0, 0.02, 0.085));  // flare cone
  g.add(at(tube(0.052, 0.052, 0.01, tubeDk, 18), 0, 0.02, 0.13));   // flare lip

  // === raised iron sights on top (front blade + rear leaf) ===
  g.add(at(box(0.014, 0.06, 0.016, tubeDk), 0, 0.07, -0.34));       // front sight post
  g.add(at(box(0.022, 0.012, 0.016, tubeDk), 0, 0.098, -0.34));     // front blade housing
  g.add(at(box(0.005, 0.018, 0.008, dark), 0, 0.1, -0.34));         // front blade
  g.add(at(box(0.016, 0.07, 0.018, tubeDk), 0, 0.075, -0.02));      // rear sight post
  g.add(at(box(0.026, 0.022, 0.012, tubeDk), 0, 0.108, -0.02));     // rear leaf
  g.add(at(box(0.014, 0.008, 0.006, dark), 0, 0.112, -0.02));       // rear notch

  // === pistol grip + trigger guard (underneath, mid) ===
  g.add(at(box(0.04, 0.1, 0.044, grip), 0, -0.07, 0.0, 0.12));
  g.add(at(box(0.042, 0.016, 0.046, dark), 0, -0.122, 0.006, 0.12)); // grip cap
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.005, 8, 16), tubeDk);
  g.add(at(guard, 0, -0.03, -0.04, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.022, 0.008, dark), 0, -0.026, -0.04));        // trigger

  // === forward grip (underneath, ahead of the trigger) ===
  g.add(at(box(0.036, 0.085, 0.04, grip), 0, -0.06, -0.24));
  g.add(at(box(0.038, 0.014, 0.042, dark), 0, -0.106, -0.24));       // forward grip cap

  return { group: g, muzzle: -0.71 };
}

// --- HELLION SALVO (BO4) — bulky futuristic 4-rocket launcher. A smooth grey
//     ribbed launch tube (yellow band) up front, a boxy olive breech wrapped in
//     tactical canvas/webbing with straps + clips and a small blue status screen,
//     a firing pistol grip with a red trigger, a forward support grip, a small
//     folding top sight and a rear shoulder pad. ---
function hellionSalvo() {
  const g = new THREE.Group();
  const olive = gunMetal(0x5e6440, { metal: 0.2, rough: 0.74 });   // canvas-wrapped breech
  const oliveDk = gunMetal(0x44492c, { metal: 0.2, rough: 0.76 }); // straps / shadow
  const grey = gunMetal(0x6a6f76, { metal: 0.6, rough: 0.38 });    // launch tube
  const greyDk = gunMetal(0x4a4e54, { metal: 0.58, rough: 0.42 });
  const black = gunMetal(0x1c1e22, { metal: 0.52, rough: 0.44 });  // furniture / grips
  const blackHi = gunMetal(0x2a2e34, { metal: 0.5, rough: 0.36 });
  const yellow = gunMetal(0xc6a02e, { metal: 0.4, rough: 0.5 });   // caution band
  const grip = gunGrip(0x202329);
  const dark = gunDark(0x0c0d10);
  const red = mat(0xd83426, { metal: 0.2, rough: 0.4, emissive: 0xd83426, ei: 1.2 }); // trigger accent
  const blue = mat(0x2f9cff, { metal: 0.2, rough: 0.3, emissive: 0x2f9cff, ei: 1.4 }); // status screen

  // === smooth grey ribbed launch tube (front, pulled back to meet the breech)
  //     + yellow band + bore ===
  g.add(at(tube(0.036, 0.036, 0.34, grey, 20), 0, 0.026, -0.34));
  for (let i = 0; i < 4; i++) g.add(at(tube(0.038, 0.038, 0.006, greyDk, 18), 0, 0.026, -0.24 - i * 0.06)); // groove rings
  g.add(at(tube(0.04, 0.04, 0.03, yellow, 18), 0, 0.026, -0.42));     // yellow caution band
  g.add(at(tube(0.04, 0.04, 0.016, greyDk, 18), 0, 0.026, -0.505));   // muzzle ring
  g.add(at(tube(0.03, 0.03, 0.02, dark, 16), 0, 0.026, -0.52));       // bore
  g.add(at(box(0.05, 0.012, 0.28, greyDk), 0, 0.058, -0.34));         // top spine strip
  // tapered collar that blends the tube into the breech (kills the abrupt step)
  g.add(at(tube(0.05, 0.07, 0.07, oliveDk, 18), 0, 0.018, -0.16));

  // === small folding top sight on the tube ===
  g.add(at(box(0.016, 0.024, 0.014, black), 0, 0.078, -0.26));        // sight base
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.003, 6, 14), black), 0, 0.094, -0.26)); // ring aperture

  // === olive breech — ROUNDED, not a slab: a slimmer lower block under a
  //     rounded top barrel, with chamfered front facets, wrapped in canvas ===
  g.add(at(box(0.082, 0.092, 0.28, olive), 0, -0.004, -0.02));        // main lower block (slimmer)
  g.add(at(tube(0.05, 0.05, 0.28, oliveDk, 18), 0, 0.046, -0.02));    // rounded top (no boxy top)
  for (const sx of [-1, 1]) g.add(at(box(0.024, 0.07, 0.06, olive), sx * 0.036, 0.0, -0.15, 0, sx * 0.5, 0)); // angled front cheeks
  // canvas straps / webbing crossing the body
  for (const sz of [-0.1, 0.02, 0.1]) g.add(at(box(0.086, 0.014, 0.016, oliveDk), 0, 0.012, sz));
  for (const sx of [-1, 1]) g.add(at(box(0.006, 0.08, 0.2, oliveDk), sx * 0.042, -0.01, -0.02)); // side seam
  // clips / fasteners (small black greebles)
  for (const sz of [-0.08, 0.0, 0.08]) for (const sx of [-1, 1]) g.add(at(box(0.014, 0.018, 0.018, black), sx * 0.045, 0.012, sz));
  // small blue status screen on the left side
  g.add(at(box(0.006, 0.03, 0.05, dark), -0.044, -0.006, -0.06));     // screen bezel
  g.add(at(box(0.004, 0.022, 0.04, blue), -0.047, -0.006, -0.06));    // blue screen face
  // rear shoulder pad (closes the breech, ~z 0.2)
  g.add(at(tube(0.05, 0.05, 0.04, black, 18), 0, 0.03, 0.14));        // rounded buffer
  g.add(at(box(0.07, 0.11, 0.03, black), 0, 0.0, 0.17));             // butt pad
  g.add(at(box(0.045, 0.08, 0.02, blackHi), 0, 0.0, 0.188));         // pad face

  // === firing pistol grip + trigger guard (under the breech) ===
  g.add(at(box(0.044, 0.11, 0.05, grip), 0, -0.085, 0.0, 0.18));
  g.add(at(box(0.046, 0.018, 0.052, dark), 0, -0.14, 0.01, 0.18));   // grip cap
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 8, 16), black);
  g.add(at(guard, 0, -0.04, -0.05, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.024, 0.008, red), 0, -0.036, -0.05));         // red trigger

  // === forward angular support grip (under the tube, pulled back with it) ===
  g.add(at(box(0.038, 0.09, 0.044, black), 0, -0.06, -0.26, -0.16));
  for (let i = 0; i < 3; i++) g.add(at(box(0.04, 0.006, 0.046, dark), 0, -0.05 - i * 0.022, -0.254 - i * 0.004, -0.16)); // grip ridges
  g.add(at(box(0.04, 0.014, 0.046, blackHi), 0, -0.106, -0.276, -0.16)); // grip cap

  return { group: g, muzzle: -0.54 };
}

// --- KRM-262 (BO3) — tactical pump shotgun. Angular grey gunmetal body with
//     skeletonised cuts + oval-slotted handguard, a blocky stepped muzzle, an
//     under-barrel tube magazine, a ribbed sliding pump, a top rail with a
//     red-fiber flip front sight + a red-dot reflex optic (copper ring), a
//     pistol grip and an open skeleton stock. Worn copper accent patch. ---
function krm() {
  const g = new THREE.Group();
  const body = gunMetal(0x44484f, { metal: 0.62, rough: 0.36 });   // grey gunmetal
  const bodyHi = gunMetal(0x565b63, { metal: 0.6, rough: 0.3 });
  const bodyDk = gunDark(0x1a1c20);                                // shadow / cuts
  const steel = gunMetal(0x3a3f46, { metal: 0.74, rough: 0.26 });  // barrel
  const copper = gunMetal(0x7a4a32, { metal: 0.55, rough: 0.48 }); // worn copper patch / optic ring
  const black = gunMetal(0x1c1e22, { metal: 0.52, rough: 0.44 });
  const grip = gunGrip(0x23262b);
  const glass = new THREE.MeshStandardMaterial({ color: 0x140a08, metalness: 0.2, roughness: 0.14 });
  const dark = gunDark(0x0c0d10);
  const red = mat(0xff2a1e, { metal: 0.2, rough: 0.4, emissive: 0xff2a1e, ei: 1.8 }); // fiber + dot

  // === barrel + blocky stepped muzzle + under-barrel tube magazine (front
  //     pulled back so it meets the receiver instead of floating out ahead) ===
  g.add(at(tube(0.015, 0.015, 0.32, steel), 0, 0.026, -0.42));
  g.add(at(box(0.04, 0.044, 0.08, bodyDk), 0, 0.026, -0.56));        // blocky muzzle
  g.add(at(box(0.044, 0.012, 0.06, body), 0, 0.05, -0.56));          // muzzle top step
  g.add(at(tube(0.015, 0.015, 0.02, dark, 12), 0, 0.026, -0.605));   // bore
  g.add(at(tube(0.014, 0.014, 0.32, bodyDk, 14), 0, -0.006, -0.38)); // tube magazine under barrel
  g.add(at(box(0.026, 0.016, 0.05, black), 0, -0.012, -0.52));       // mag cap

  // === oval-slotted handguard over the barrel ===
  g.add(at(box(0.05, 0.05, 0.26, body), 0, 0.026, -0.34));
  g.add(at(box(0.054, 0.014, 0.24, bodyHi), 0, 0.054, -0.34));       // top strap
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) g.add(at(box(0.005, 0.022, 0.046, dark), sx * 0.026, 0.026, -0.42 + i * 0.06)); // oval side slots
  for (let i = 0; i < 3; i++) g.add(at(box(0.022, 0.005, 0.046, dark), 0, 0.052, -0.4 + i * 0.07)); // top slots

  // === ribbed sliding pump (under-barrel forend) ===
  g.add(at(box(0.046, 0.05, 0.12, black), 0, -0.03, -0.28));
  for (let i = 0; i < 4; i++) g.add(at(box(0.05, 0.05, 0.008, dark), 0, -0.03, -0.33 + i * 0.026)); // finger grooves
  g.add(at(box(0.05, 0.012, 0.12, bodyDk), 0, -0.056, -0.28));       // pump underside rail

  // === angular grey receiver with skeletonised cuts + copper patch ===
  g.add(at(box(0.05, 0.082, 0.26, body), 0, 0.014, -0.1));
  g.add(at(box(0.046, 0.024, 0.06, copper), 0, 0.02, -0.16));        // worn copper accent patch
  for (const sx of [-1, 1]) {                                        // skeleton triangle cuts (front of receiver)
    g.add(at(box(0.006, 0.05, 0.014, bodyDk), sx * 0.026, 0.0, -0.18, 0, 0, 0.5));
    g.add(at(box(0.006, 0.05, 0.014, bodyDk), sx * 0.026, 0.0, -0.13, 0, 0, -0.5));
  }
  g.add(at(box(0.012, 0.024, 0.05, bodyHi), -0.03, 0.03, -0.04));    // left charging handle
  g.add(at(box(0.05, 0.04, 0.05, bodyDk), 0.03, 0.0, 0.0));          // right ejection block

  // === top rail + red-fiber flip front sight + red-dot reflex optic ===
  g.add(at(box(0.024, 0.014, 0.22, bodyDk), 0, 0.058, -0.12));       // rail base
  for (let i = 0; i < 8; i++) g.add(at(box(0.026, 0.006, 0.008, dark), 0, 0.066, -0.2 + i * 0.024)); // rail teeth
  g.add(at(box(0.02, 0.026, 0.018, black), 0, 0.076, -0.34));        // front sight base
  g.add(at(box(0.006, 0.018, 0.008, red), 0, 0.094, -0.34));         // red fiber front post
  // clean rear iron notch (replaces the ugly copper reflex ring), level with the front post
  g.add(at(box(0.024, 0.022, 0.02, black), 0, 0.082, -0.02));        // rear sight base
  g.add(at(box(0.018, 0.012, 0.008, dark), 0, 0.099, -0.02));        // rear notch

  // === pistol grip + trigger guard ===
  g.add(at(box(0.042, 0.1, 0.046, grip), 0, -0.049, 0.06, 0.14));
  g.add(at(box(0.044, 0.016, 0.048, dark), 0, -0.105, 0.053, 0.14));  // grip cap
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 8, 16), bodyDk);
  g.add(at(guard, 0, -0.028, 0.0, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.024, 0.008, copper), 0, -0.024, 0.0));        // copper trigger

  // === open skeleton stock (rear ~z 0.2) ===
  g.add(at(box(0.05, 0.07, 0.06, body), 0, 0.014, 0.06));            // stock socket
  g.add(at(box(0.044, 0.022, 0.13, bodyHi), 0, 0.05, 0.15));         // top bar
  g.add(at(box(0.04, 0.02, 0.11, body), 0, -0.03, 0.14));            // bottom bar (skeleton gap)
  g.add(at(box(0.03, 0.094, 0.024, body), 0, 0.01, 0.2));            // rear vertical frame
  g.add(at(box(0.046, 0.104, 0.022, dark), 0, 0.006, 0.214));        // butt pad

  return { group: g, muzzle: -0.61 };
}

// --- MOG 12 (BO4) — compact stock-less pump shotgun. A dark slab body with
//     rows of oval lightening holes + a square slotted muzzle, an under-barrel
//     tube magazine, a top rail with a red-fiber front sight, the signature
//     leather sling with a RED band slung under the barrel, a pistol grip with
//     a red trigger + red selector, and no stock. Stubbier than the KRM. ---
function mog12() {
  const g = new THREE.Group();
  const black = gunMetal(0x222428, { metal: 0.5, rough: 0.46 });   // dark body
  const blackHi = gunMetal(0x32363c, { metal: 0.5, rough: 0.38 });
  const bodyDk = gunDark(0x131418);
  const steel = gunMetal(0x3a3f46, { metal: 0.74, rough: 0.28 });  // barrel
  const leather = gunWood(0x4a3422);                               // sling strap
  const grip = gunGrip(0x202329);
  const dark = gunDark(0x0c0d10);
  const red = mat(0xd83426, { metal: 0.2, rough: 0.4, emissive: 0xd83426, ei: 1.4 }); // accents

  // === short barrel + square slotted muzzle + tube magazine ===
  g.add(at(tube(0.015, 0.015, 0.22, steel), 0, 0.022, -0.34));
  g.add(at(box(0.044, 0.046, 0.08, bodyDk), 0, 0.022, -0.46));       // square muzzle block
  for (const sx of [-1, 1]) g.add(at(box(0.006, 0.026, 0.05, dark), sx * 0.02, 0.022, -0.46)); // side slot cuts
  g.add(at(box(0.03, 0.006, 0.05, dark), 0, 0.044, -0.46));          // top slot
  g.add(at(tube(0.015, 0.015, 0.02, dark, 12), 0, 0.022, -0.5));     // bore
  g.add(at(tube(0.013, 0.013, 0.24, bodyDk, 14), 0, -0.006, -0.32)); // under-barrel tube mag
  g.add(at(box(0.024, 0.014, 0.04, black), 0, -0.012, -0.42));       // mag cap

  // === dark slab body with oval lightening holes ===
  g.add(at(box(0.05, 0.088, 0.4, black), 0, 0.012, -0.18));
  g.add(at(box(0.054, 0.016, 0.34, blackHi), 0, 0.058, -0.18));      // top spine
  for (const sx of [-1, 1]) {                                        // oval lightening holes (two rows)
    for (let i = 0; i < 3; i++) g.add(at(box(0.005, 0.024, 0.05, dark), sx * 0.026, 0.024, -0.3 + i * 0.07));
    for (let i = 0; i < 3; i++) g.add(at(tube(0.006, 0.006, 0.054, dark, 8), sx * 0.026, -0.022, -0.28 + i * 0.05, 0, 0, Math.PI / 2)); // dot row
  }

  // === top rail + red-fiber front sight ===
  g.add(at(box(0.022, 0.012, 0.3, bodyDk), 0, 0.064, -0.16));        // rail
  for (let i = 0; i < 9; i++) g.add(at(box(0.024, 0.006, 0.008, dark), 0, 0.072, -0.28 + i * 0.026)); // teeth
  g.add(at(box(0.02, 0.024, 0.016, black), 0, 0.08, -0.36));         // front sight base
  g.add(at(box(0.006, 0.016, 0.008, red), 0, 0.096, -0.36));         // red fiber front post

  // === leather sling with a RED band slung under the barrel ===
  for (let i = 0; i < 5; i++) {                                       // drooping strap (arc of segments)
    const t = i / 4, droop = Math.sin(t * Math.PI) * 0.05;
    g.add(at(box(0.01, 0.012, 0.06, leather), 0, -0.05 - droop, -0.36 + t * 0.18));
  }
  g.add(at(box(0.012, 0.016, 0.024, red), 0, -0.1, -0.27));          // red strap band

  // === pistol grip + trigger guard (rear, no stock) ===
  g.add(at(box(0.046, 0.072, 0.06, blackHi), 0, 0.006, 0.06));       // grip housing / rear cap
  g.add(at(box(0.014, 0.026, 0.03, red), 0.024, 0.012, 0.04));       // red selector switch (right)
  g.add(at(box(0.044, 0.12, 0.05, grip), 0, -0.064, 0.08, 0.14));     // pistol grip
  g.add(at(box(0.046, 0.018, 0.052, dark), 0, -0.131, 0.072, 0.14));   // grip cap
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 8, 16), bodyDk);
  g.add(at(guard, 0, -0.03, 0.02, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.026, 0.009, red), 0, -0.026, 0.02));          // red trigger

  return { group: g, muzzle: -0.51 };
}

// --- HAYMAKER 12 (BO3) — bulky fully-auto drum-fed shotgun. Angular dark-grey
//     slab body with a top ordnance rail + flip irons, a bright cylindrical
//     barrel housing, a skeletal CAGE muzzle brake, a big round DRUM magazine
//     hanging below, a textured pistol grip with a red ammo counter, and an
//     angular skeleton stock. ---
function haymaker() {
  const g = new THREE.Group();
  const body = gunMetal(0x3a3f46, { metal: 0.6, rough: 0.38 });    // grey body
  const bodyHi = gunMetal(0x4c525a, { metal: 0.58, rough: 0.32 }); // raised panels
  const bodyDk = gunDark(0x16181c);                                // shadow cuts
  const steel = gunMetal(0x6a6f76, { metal: 0.76, rough: 0.26 });  // bright barrel housing
  const drumMat = gunMetal(0x26292e, { metal: 0.55, rough: 0.42 });// dark drum
  const grip = gunGrip(0x23262b);
  const dark = gunDark(0x0c0d10);
  const red = mat(0xff2a1e, { metal: 0.2, rough: 0.4, emissive: 0xff2a1e, ei: 1.6 }); // counter + sight

  // === skeletal CAGE muzzle brake + barrel ===
  g.add(at(tube(0.015, 0.015, 0.16, dark), 0, 0.026, -0.46));
  g.add(at(tube(0.028, 0.028, 0.1, bodyHi, 12), 0, 0.026, -0.62));    // cage body
  for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) g.add(at(box(0.01, 0.024, 0.026, dark), sx * 0.026, 0.026, -0.6 - i * 0.034)); // side cage slots
  for (let i = 0; i < 2; i++) g.add(at(box(0.024, 0.01, 0.026, dark), 0, 0.05, -0.6 - i * 0.034)); // top cage slots
  g.add(at(tube(0.03, 0.03, 0.012, bodyHi, 12), 0, 0.026, -0.67));    // front ring
  g.add(at(tube(0.016, 0.016, 0.02, dark, 12), 0, 0.026, -0.66));     // bore

  // === bright cylindrical barrel housing under the rail ===
  g.add(at(tube(0.024, 0.024, 0.24, steel, 18), 0, 0.018, -0.36));
  for (const rz of [-0.44, -0.3]) g.add(at(tube(0.026, 0.026, 0.014, body, 18), 0, 0.018, rz)); // barrel clamps

  // === angular slab body + top ordnance rail ===
  g.add(at(box(0.056, 0.07, 0.4, body), 0, 0.012, -0.18));
  g.add(at(box(0.058, 0.024, 0.36, bodyHi), 0, 0.054, -0.18));        // top deck
  for (let i = 0; i < 12; i++) g.add(at(box(0.06, 0.006, 0.008, dark), 0, 0.07, -0.34 + i * 0.026)); // rail teeth
  // angular panel cuts down the sides
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) g.add(at(box(0.005, 0.03, 0.018, dark), sx * 0.029, 0.01, -0.3 + i * 0.08, 0, 0, 0.4));
  g.add(at(box(0.012, 0.024, 0.05, bodyHi), -0.034, 0.03, -0.06));    // left charging handle
  g.add(at(box(0.05, 0.04, 0.05, bodyDk), 0.034, 0.0, -0.04));        // right ejection block

  // === flip-up iron sights front + rear (red accents) ===
  g.add(at(box(0.018, 0.034, 0.016, bodyDk), 0, 0.082, -0.32));       // front sight base
  for (const sx of [-1, 1]) g.add(at(box(0.004, 0.026, 0.01, dark), sx * 0.01, 0.1, -0.32)); // front ears
  g.add(at(box(0.03, 0.03, 0.02, bodyDk), 0, 0.078, 0.02));           // rear flip base
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0035, 6, 14), bodyDk), 0, 0.096, 0.02, 0, Math.PI / 2)); // rear ring
  for (const sx of [-1, 1]) g.add(at(box(0.005, 0.005, 0.005, red), sx * 0.012, 0.096, 0.014)); // red rear dots

  // === big round DRUM magazine hanging below (round face forward) ===
  g.add(at(box(0.05, 0.04, 0.06, bodyDk), 0, -0.04, -0.08));          // mag well collar
  g.add(at(tube(0.058, 0.058, 0.054, drumMat, 24), 0, -0.13, -0.1));  // drum body (axis z -> round face forward)
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.005, 8, 24), bodyDk), 0, -0.13, -0.128)); // face rib
  for (let i = 0; i < 6; i++) {                                       // face bolts
    const a = (i / 6) * Math.PI * 2;
    g.add(at(tube(0.003, 0.003, 0.008, dark, 6), Math.cos(a) * 0.046, -0.13 + Math.sin(a) * 0.046, -0.128));
  }
  g.add(at(box(0.03, 0.018, 0.01, bodyHi), 0, -0.07, -0.128));        // release latch

  // === textured pistol grip + red ammo counter + trigger ===
  g.add(at(box(0.044, 0.1, 0.048, grip), 0, -0.049, 0.06, 0.14));
  g.add(at(box(0.046, 0.016, 0.05, dark), 0, -0.105, 0.053, 0.14));    // grip cap
  g.add(at(box(0.018, 0.016, 0.01, dark), 0, -0.012, 0.02));          // counter housing
  g.add(at(box(0.013, 0.011, 0.005, red), 0, -0.012, 0.015));         // red ammo counter
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 8, 16), bodyDk);
  g.add(at(guard, 0, -0.028, 0.0, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.024, 0.008, dark), 0, -0.024, 0.0));

  // === angular skeleton stock (rear ~z 0.2) ===
  g.add(at(box(0.054, 0.07, 0.06, body), 0, 0.012, 0.06));            // stock socket
  g.add(at(box(0.046, 0.04, 0.12, bodyDk), 0, 0.046, 0.15));          // top strut
  g.add(at(box(0.044, 0.03, 0.1, bodyDk), 0, -0.028, 0.14));          // bottom strut
  for (const sx of [-1, 1]) g.add(at(box(0.004, 0.06, 0.012, body), sx * 0.024, 0.008, 0.13, 0, 0, 0.5)); // diagonal braces
  g.add(at(box(0.03, 0.1, 0.026, body), 0, 0.01, 0.205));            // vertical butt frame
  g.add(at(box(0.04, 0.108, 0.03, dark), 0, 0.01, 0.218));           // butt pad

  return { group: g, muzzle: -0.68 };
}

// --- STAKEOUT — cut-down sawed-off pump shotgun (no stock). A bright PERFORATED
//     steel heat-shield (rows of drilled holes) over the barrel, a brown
//     leather-wrapped forend holding spare brass + a red shell, a worn blued
//     receiver with a diagonal leather strap, an under-barrel pump slide, a
//     checkered pistol grip and a trigger. Compact. ---
function stakeout() {
  const g = new THREE.Group();
  const shroud = gunMetal(0x8a8e94, { metal: 0.72, rough: 0.32 });  // bright perforated shroud
  const blued = gunMetal(0x3a3f46, { metal: 0.68, rough: 0.34 });   // worn blued receiver
  const bluedDk = gunMetal(0x23272d, { metal: 0.66, rough: 0.42 });
  const barrelMat = gunDark(0x16181c);
  const leather = gunWood(0x6e4428);                                // forend wrap / straps
  const leatherDk = gunWood(0x4a2e16);
  const brass = gunMetal(0xb08a3c, { metal: 0.82, rough: 0.32 });   // spare shells
  const redShell = gunMetal(0x9a3a2a, { metal: 0.3, rough: 0.55 }); // red shotshell
  const grip = gunGrip(0x1f2227);
  const dark = gunDark(0x0c0d10);

  // === barrel + bright PERFORATED heat-shield + bore (pulled back to the
  //     receiver + thicker shroud — the front floated and the gun read thin) ===
  g.add(at(tube(0.015, 0.015, 0.34, barrelMat), 0, 0.028, -0.34));
  g.add(at(tube(0.03, 0.03, 0.3, shroud, 18), 0, 0.028, -0.36));     // shroud (bulkier)
  g.add(at(tube(0.015, 0.015, 0.02, dark, 12), 0, 0.028, -0.51));    // bore
  // drilled holes: a top row + two side rows down the shroud
  for (let i = 0; i < 7; i++) {
    g.add(at(tube(0.006, 0.006, 0.014, dark, 8), 0, 0.058, -0.24 - i * 0.036, Math.PI / 2)); // top
    for (const sx of [-1, 1]) g.add(at(tube(0.006, 0.006, 0.014, dark, 8), sx * 0.03, 0.028, -0.24 - i * 0.036, 0, Math.PI / 2)); // sides
  }

  // === brown leather-wrapped forend (where shroud meets receiver) ===
  g.add(at(tube(0.033, 0.033, 0.1, leather, 16), 0, 0.026, -0.16));
  for (const wz of [-0.12, -0.2]) g.add(at(tube(0.034, 0.034, 0.01, leatherDk, 16), 0, 0.026, wz)); // binding rings
  // spare shells tucked in the wrap (brass heads + a red one)
  g.add(at(tube(0.012, 0.012, 0.03, brass, 12), 0.034, 0.03, -0.14, 0, Math.PI / 2));
  g.add(at(tube(0.012, 0.012, 0.03, redShell, 12), 0.034, 0.0, -0.14, 0, Math.PI / 2));

  // === under-barrel pump slide (bulkier) ===
  g.add(at(box(0.04, 0.04, 0.13, bluedDk), 0, -0.014, -0.3));
  for (let i = 0; i < 3; i++) g.add(at(box(0.044, 0.044, 0.006, dark), 0, -0.014, -0.34 + i * 0.03)); // grooves
  g.add(at(box(0.014, 0.05, 0.03, bluedDk), 0, -0.044, -0.24));      // slide arm down to the action

  // === worn blued receiver (bulkier + lengthened to meet the forend) + strap ===
  g.add(at(box(0.06, 0.088, 0.22, blued), 0, 0.012, -0.04));
  g.add(at(box(0.056, 0.026, 0.18, bluedDk), 0, 0.054, -0.04));      // top step
  g.add(at(box(0.014, 0.026, 0.04, bluedDk), 0.034, 0.02, 0.0));     // ejection port (right)
  g.add(at(box(0.05, 0.018, 0.14, leather), 0, 0.01, -0.02, 0, 0, 0.5)); // diagonal strap
  g.add(at(box(0.05, 0.014, 0.04, leatherDk), 0, -0.02, 0.04, 0, 0, 0.5)); // strap tail

  // === checkered pistol grip + trigger guard (no stock) ===
  g.add(at(box(0.044, 0.12, 0.05, grip), 0, -0.054, 0.08, 0.14));
  g.add(at(box(0.046, 0.018, 0.052, dark), 0, -0.121, 0.072, 0.14)); // grip cap
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 8, 16), bluedDk);
  g.add(at(guard, 0, -0.028, 0.02, 0, Math.PI / 2));
  g.add(at(box(0.01, 0.024, 0.008, dark), 0, -0.024, 0.02));         // trigger

  return { group: g, muzzle: -0.51 };
}

// --- DOUBLE-BARREL — classic side-by-side coach gun. Two deep-blued barrels
//     joined by a top rib (front bead), a reddish-brown wood forend, a blued
//     break-action receiver with engraved case-hardened side plates + a top
//     lever, brass shell heads at the breech, a trigger guard with twin
//     triggers, and a warm wooden buttstock with a steel butt plate. ---
function doubleBarrel() {
  const g = new THREE.Group();
  const blued = gunMetal(0x1c2026, { metal: 0.72, rough: 0.26 });   // deep-blued barrels
  const bluedHi = gunMetal(0x2c323a, { metal: 0.7, rough: 0.24 });
  const receiver = engravedSteel(0x5a5248);                         // case-hardened engraved receiver
  const wood = gunWood(0x8a4a26);                                   // reddish-brown furniture
  const woodDk = gunWood(0x5e3216);
  const brass = gunMetal(0xb08a3c, { metal: 0.82, rough: 0.32 });   // shell heads
  const dark = gunDark(0x0c0d10);
  const BX = 0.019; // half the barrel spacing (side-by-side)

  // === two side-by-side blued barrels + joining ribs ===
  for (const sx of [-1, 1]) {
    g.add(at(tube(0.018, 0.018, 0.62, blued), sx * BX, 0.024, -0.36));
    g.add(at(tube(0.018, 0.018, 0.02, dark, 14), sx * BX, 0.024, -0.66)); // bore
  }
  g.add(at(box(0.012, 0.01, 0.6, bluedHi), 0, 0.044, -0.35));         // top sighting rib
  g.add(at(box(0.012, 0.01, 0.6, blued), 0, 0.004, -0.35));           // bottom joining rib
  g.add(at(box(0.04, 0.012, 0.6, blued), 0, 0.024, -0.35));           // mid web between barrels
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 8), bluedHi), 0, 0.052, -0.64)); // front bead

  // === reddish-brown wood forend under the barrels ===
  g.add(at(box(0.054, 0.036, 0.28, wood), 0, -0.008, -0.4));
  g.add(at(box(0.056, 0.012, 0.26, woodDk), 0, -0.026, -0.4));        // forend bottom groove
  g.add(at(box(0.05, 0.026, 0.03, dark), 0, -0.01, -0.52));           // forend tip latch
  g.add(at(box(0.044, 0.014, 0.05, bluedHi), 0, -0.026, -0.3));       // forend iron / latch lug

  // === blued break-action receiver + engraved side plates + top lever ===
  g.add(at(box(0.058, 0.07, 0.16, receiver), 0, 0.012, -0.02));
  for (const sx of [-1, 1]) g.add(at(box(0.004, 0.05, 0.12, receiver), sx * 0.03, 0.008, -0.02)); // engraved side plates
  g.add(at(box(0.05, 0.024, 0.06, bluedHi), 0, 0.05, -0.02));         // top strap
  g.add(at(box(0.012, 0.014, 0.05, bluedHi), 0, 0.058, 0.04));        // opening top lever
  // brass shell heads at the breech (where the barrels meet the receiver)
  for (const sx of [-1, 1]) g.add(at(tube(0.015, 0.015, 0.012, brass, 12), sx * BX, 0.024, -0.085));

  // === trigger guard + twin triggers ===
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, 8, 18), bluedHi);
  g.add(at(guard, 0, -0.038, 0.04, 0, Math.PI / 2));
  g.add(at(box(0.009, 0.024, 0.008, dark), 0, -0.03, 0.028));         // front trigger
  g.add(at(box(0.009, 0.022, 0.008, dark), 0, -0.03, 0.05));          // rear trigger

  // === SCULPTED wooden buttstock + steel butt plate — a swept comb and a
  //     dropped belly/toe instead of a single slab cube ===
  g.add(at(box(0.044, 0.066, 0.1, wood), 0, -0.004, 0.1));            // wrist
  g.add(at(box(0.048, 0.05, 0.16, wood), 0, 0.022, 0.17, -0.05));     // comb line (sweeps to the heel)
  g.add(at(box(0.05, 0.07, 0.12, wood), 0, -0.03, 0.15, -0.16));      // belly drops toward the toe
  g.add(at(box(0.046, 0.026, 0.11, woodDk), 0, 0.046, 0.15, -0.05));  // raised cheek comb
  g.add(at(box(0.014, 0.024, 0.05, wood), 0, 0.05, 0.08));            // comb nose
  g.add(at(box(0.052, 0.124, 0.018, dark), 0, -0.012, 0.244, -0.07)); // angled steel butt plate

  return { group: g, muzzle: -0.68 };
}

const BUILDERS = {
  pistol, smg, assaultRifle, shotgun, sniper, hmg, launcher, special, wonder,
};

/**
 * Build a model group for a weapon. @returns {{ group: THREE.Group, muzzle: number }}
 */
// Per-gun iron-sight height (local Y of the aligned front+rear sight line). ADS
// drops the viewmodel by exactly this so EACH gun centres on its OWN sights,
// instead of every gun in a class sharing one offset (which left many misaligned).
// Keyed by model name; guns absent here fall back to the per-class ADS offset.
const SIGHT_Y = {
  'M1911': 0.079, 'RK-5': 0.093, 'NEW ARMY': 0.064, 'FIVE-SEVEN': 0.086, 'EXECUTIONER': 0.099, 'CODA 9': 0.063,
  'K-Vector': 0.118, 'MP5': 0.066, 'UZI': 0.069, 'KUDA': 0.097, 'PPSH-41': 0.094, 'MP40': 0.088,
  'GALIL': 0.082, 'XM4': 0.11, 'AN-94': 0.082, 'STG-44': 0.092, 'ICR-1': 0.08, 'FAL': 0.082,
  'DINGO': 0.094, 'RPD': 0.086, 'HAMR': 0.086, 'STONER 63': 0.079, 'LSAT': 0.082, 'HK21': 0.078,
  'KRM-262': 0.1,
};

// ---- Attachment sockets ---------------------------------------------------
// Named reference transforms every weapon exposes so the hands/arms, muzzle
// flash, mag-drop and shell-eject all read from ONE authored place instead of
// per-gun offsets scattered through the code. gripR = the character's firing
// hand (pistol grip + trigger); gripL = the support hand (handguard/foregrip) —
// these are the CHARACTER's anatomy, not screen sides. Positions are gun-local
// (forward = -z). Class defaults cover every gun; per-gun entries override only
// where a default reads wrong. muzzle + ads derive from data we already hold.
// Values are authored in the F5 Model Showcase (they render as movable markers)
// and pasted back here — nothing downstream hardcodes a weapon offset again.
const SOCKET_ORDER = ['gripR', 'gripL', 'muzzle', 'ads', 'mag', 'shell'];

const CLASS_SOCKETS = {
  pistol:       { gripR: [0, -0.085, 0.01], gripL: [-0.02, -0.11, -0.06], mag: [0, -0.13, -0.005], shell: [0.03, 0.04, -0.03] },
  smg:          { gripR: [0, -0.075, 0.05], gripL: [0, -0.02, -0.28],     mag: [0, -0.12, -0.1],   shell: [0.035, 0.03, -0.05] },
  assaultRifle: { gripR: [0, -0.085, 0.06], gripL: [0, -0.03, -0.4],      mag: [0, -0.11, -0.14],  shell: [0.035, 0.02, -0.06] },
  hmg:          { gripR: [0, -0.085, 0.07], gripL: [0, -0.03, -0.42],     mag: [0, -0.12, -0.05],  shell: [0.04, 0.02, -0.06] },
  shotgun:      { gripR: [0, -0.065, 0.08], gripL: [0, -0.03, -0.3],      mag: [0, -0.05, -0.2],   shell: [0.035, 0.03, -0.04] },
  sniper:       { gripR: [0, -0.085, 0.06], gripL: [0, -0.03, -0.36],     mag: [0, -0.11, -0.05],  shell: [0.035, 0.03, -0.05] },
  launcher:     { gripR: [0, -0.2, 0.0],    gripL: [0, -0.03, -0.3],      mag: null,               shell: null },
  special:      { gripR: [0, -0.09, 0.05],  gripL: [0, -0.03, -0.2],      mag: null,               shell: null },
  wonder:       { gripR: [0, -0.09, 0.05],  gripL: [0, -0.03, -0.2],      mag: null,               shell: null },
};

// Per-gun overrides — only where the class default is off. Any omitted key
// falls back to the class default. Seed lightly; spot-fix in F5 and paste.
const WEAPON_SOCKETS = {
  // 'AN-94': { gripL: [0, -0.03, -0.42] },
  // New Army's walnut plow-handle sits well BACK (z≈+0.15), not up by the cylinder
  // like a modern pistol — put both grips on the actual handle.
  'NEW ARMY': { gripR: [0, -0.085, 0.15], gripL: [0.02, -0.12, 0.15] },
  // Executioner (Judge) revolver — same deal, its rubber grip sits back at z≈+0.18.
  'EXECUTIONER': { gripR: [0, -0.085, 0.18], gripL: [0.02, -0.12, 0.18] },
};

function socketMarker(name) {
  const col = name === 'gripR' ? 0x39ff88 : name === 'gripL' ? 0x39c6ff : name === 'muzzle' ? 0xff5a3c
    : name === 'ads' ? 0xffd23c : name === 'mag' ? 0xb27bff : 0xff7bd0;
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.014, 0),
    new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.92 }));
  m.renderOrder = 999;
  m.name = name;
  m.userData.socket = true;
  return m;
}

function attachSockets(model, weapon, showMarkers, box) {
  const cat = weapon.data.category;
  const nm = weapon.data.modelName || weapon.data.name;
  const base = CLASS_SOCKETS[cat] || CLASS_SOCKETS.assaultRifle;
  const over = WEAPON_SOCKETS[nm] || {};
  const derived = {
    muzzle: [0, 0.01, model.muzzle ?? -0.5],
    ads: [0, model.sightY ?? 0.085, -0.12],
  };
  const src = { ...base, ...derived, ...over };
  // Two-handed guns: place the SUPPORT-hand grip on the actual handguard, scaled by
  // the gun's length, so the hand reaches a logical hold (longer gun → farther out,
  // within reach) instead of floating at a fixed class z. Pistols keep the close hold.
  if (box && cat !== 'pistol' && !over.gripL && src.gripL) {
    const z = Math.max(-0.44, Math.min(-0.16, box.min.z * 0.6)); // 60% toward the muzzle, capped to arm reach
    src.gripL = [src.gripL[0], src.gripL[1], z];
  }
  const anchors = {};
  for (const name of SOCKET_ORDER) {
    const p = src[name];
    if (!p) continue;
    const marker = socketMarker(name);
    marker.position.set(p[0], p[1], p[2]);
    marker.visible = !!showMarkers;
    model.group.add(marker);
    anchors[name] = marker;
  }
  model.anchors = anchors;
  return model;
}

export function buildWeaponModel(weapon, opts = {}) {
  const model = buildWeaponModelInner(weapon);
  const nm = weapon.data.modelName || weapon.data.name;
  if (model && SIGHT_Y[nm] != null && model.sightY == null) model.sightY = SIGHT_Y[nm];
  if (model && model.group) {
    // measure the built gun so the first-person body can react to its size:
    //   height → how tall (sights/scope) → sit lower on screen for visibility
    //   fwd    → how long → push the support-hand grip forward onto the handguard
    const box = new THREE.Box3().setFromObject(model.group);
    model.height = box.max.y;   // top extent above the gun origin
    model.fwd = -box.min.z;     // forward extent (muzzle end)
    attachSockets(model, weapon, opts.sockets, box);
  }
  return model;
}

function buildWeaponModelInner(weapon) {
  const vm = weapon.data.viewmodel || { color: 0x4a4f59, accent: 0x26282e };
  const cat = weapon.data.category;
  const nm = weapon.data.modelName || weapon.data.name; // stable: PaP renames don't swap the model
  if (nm === 'RK-5') return rk5();
  if (nm ==='NEW ARMY') return newArmy();
  if (nm ==='FIVE-SEVEN') return fiveSeven();
  if (nm ==='EXECUTIONER') return executioner();
  if (nm ==='CODA 9') return coda9();
  if (nm ==='MP5') return mp5();
  if (nm ==='UZI') return uzi();
  if (nm ==='KUDA') return kuda();
  if (nm ==='PPSH-41') return ppsh();
  if (nm ==='MP40') return mp40();
  if (nm ==='XM4') return xm4();
  if (nm ==='AN-94') return an94();
  if (nm ==='STG-44') return stg44();
  if (nm ==='ICR-1') return icr1();
  if (nm ==='FAL') return fal();
  if (nm ==='DINGO') return dingo();
  if (nm ==='RPD') return rpd();
  if (nm ==='HAMR') return hamr();
  if (nm ==='STONER 63') return stoner63();
  if (nm ==='LSAT') return lsat();
  if (nm ==='K-Vector') return kvector();
  if (nm ==='GALIL') return galil();
  if (nm ==='KRM-262') return krm();
  if (nm ==='MOG 12') return mog12();
  if (nm ==='HAYMAKER') return haymaker();
  if (nm ==='STAKEOUT') return stakeout();
  if (nm ==='DOUBLE-BARREL') return doubleBarrel();
  if (nm ==='OLYMPIA') return olympia();
  if (nm ==='BALLISTA') return ballista();
  if (nm ==='DRAKON') return drakon();
  if (nm ==='SVG-300') return svg300();
  if (nm ==='SWISS K31') return k31();
  if (nm ==='SVU') return svu();
  if (nm ==='DSR-50') return dsr();
  if (nm ==='HK21') return hk21();
  if (nm ==='M72 LAW') return m72();
  if (nm ==='RPG-7') return rpg7();
  if (nm ==='HELLION SALVO') return hellionSalvo();
  if (nm ==='RAY GUN') return rayGunModel(weapon);
  if (nm ==='THUNDERGUN') return thunderGunModel();
  if (nm ==='DEATH MACHINE') return deathMachine();
  if (cat === 'wonder') return wonder(vm, weapon.data.projectileType === 'cone');
  const fn = BUILDERS[cat] || assaultRifle;
  return fn(vm);
}
