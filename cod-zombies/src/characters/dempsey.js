import * as THREE from 'three';
import { buildZombieRig } from '../scenes/zombieRig.js';

/**
 * "Tank" Dempsey — the Vietnam veteran. Built off the shared human rig, then
 * decorated to read completely apart from Richtofen: short cropped military hair
 * (higher hairline, faded sides), a short bushy moustache with jaw stubble, a
 * heavier squared jaw and a broader/shorter nose, cold blue eyes. He wears a
 * worn brown leather field jacket (collar, flap pockets, brass buttons, waist
 * belt) over a grey tee, a trinocular scope slung on a chest strap, gloves, tan
 * riding breeches and brown lace-up boots.
 */

const std = (color, roughness = 0.7, metalness = 0.04) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

function mats() {
  return {
    flesh: std(0xc99f79, 0.6),      // weathered, ruddier skin
    eye: std(0x0c0e13, 0.4),
    iris: std(0x4c7390, 0.35),      // cold blue eyes
    hair: std(0x3a2c1c, 0.82),      // short dark-blonde/brown, cropped
    stubble: std(0x4b3d2e, 0.86),   // moustache + jaw stubble shadow
    tee: std(0x8b9195, 0.85),       // grey undershirt
    jacket: std(0x7c5d39, 0.72),    // worn brown leather field jacket
    jacketDk: std(0x5c4526, 0.8),
    strap: std(0x4a3324, 0.68),
    glove: std(0x2c231a, 0.7),
    binoc: std(0x24252b, 0.5, 0.3), // scope barrels (dark metal)
    binocDk: std(0x131419, 0.5, 0.3),
    pants: std(0xb2a482, 0.86),     // tan riding breeches
    shoe: std(0x5a4530, 0.72),      // brown boots
    brass: std(0x9c7b32, 0.42, 0.55),
    blood: std(0x5e1410, 0.7),
  };
}

function box(w, h, d, mat, x = 0, y = 0, z = 0, rot) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function buildDempsey() {
  const M = mats();
  // skin.shirt doubles as the jacket-sleeve tone so his arms read as jacket, not tee
  const look = { human: true, skin: { flesh: M.flesh, shirt: M.jacket, pants: M.pants, shoe: M.shoe, eye: M.eye } };
  const rig = buildZombieRig(look);
  const J = rig.userData.joints;

  addHead(J.head, M);
  addOutfit(J.torso, M);
  addArms(J, M);
  addBlood(J, M);
  return rig;
}

// --- head: full short hair pushed forward, thin moustache, broad short nose ---
function addHead(head, M) {
  // full crop on top, brought forward to a low hairline; short faded sides
  head.add(box(0.238, 0.09, 0.21, M.hair, 0, 0.315, -0.01));            // crown (full on top)
  head.add(box(0.2, 0.10, 0.05, M.hair, 0, 0.235, -0.116));             // back
  for (const s of [-1, 1]) head.add(box(0.02, 0.08, 0.19, M.hair, s * 0.117, 0.27, -0.02));    // short faded sides
  for (const s of [-1, 1]) head.add(box(0.012, 0.045, 0.04, M.hair, s * 0.115, 0.238, 0.06));  // tiny sideburn
  head.add(box(0.212, 0.072, 0.082, M.hair, 0.008, 0.324, 0.074, [0.14, 0, -0.04]));           // full front, hanging slightly lower onto the forehead

  // broader, shorter nose (vs Richtofen's long one)
  head.add(box(0.05, 0.058, 0.052, M.flesh, 0, 0.158, 0.12));

  // a single THIN moustache — no beard, no stubble
  head.add(box(0.088, 0.016, 0.03, M.hair, 0, 0.12, 0.117));

  // cold blue irises
  for (const s of [-1, 1]) head.add(box(0.034, 0.03, 0.02, M.iris, s * 0.05, 0.214, 0.119));
}

// --- torso: brown field jacket over a grey tee, binoculars on a strap --------
function addOutfit(t, M) {
  t.add(box(0.2, 0.18, 0.04, M.tee, 0, 0.43, 0.12));                    // grey tee at the neck/chest
  t.add(box(0.44, 0.5, 0.04, M.jacket, 0, 0.26, 0.135));               // jacket front panel
  t.add(box(0.1, 0.17, 0.02, M.tee, 0, 0.44, 0.158));                  // tee showing at the open collar
  for (const s of [-1, 1]) t.add(box(0.1, 0.12, 0.05, M.jacketDk, s * 0.11, 0.47, 0.13, [0.22, 0, s * 0.36])); // collar flaps
  for (const by of [0.40, 0.33, 0.26, 0.19, 0.12]) t.add(box(0.02, 0.02, 0.02, M.brass, 0, by, 0.157));       // button placket
  for (const s of [-1, 1]) { t.add(box(0.14, 0.11, 0.02, M.jacketDk, s * 0.12, 0.34, 0.152)); t.add(box(0.018, 0.018, 0.02, M.brass, s * 0.12, 0.30, 0.16)); } // chest flap pockets
  for (const s of [-1, 1]) t.add(box(0.15, 0.12, 0.02, M.jacketDk, s * 0.12, 0.11, 0.152));                   // lower flap pockets

  // waist belt + buckle
  t.add(box(0.46, 0.055, 0.29, M.strap, 0, 0.05, 0));
  t.add(box(0.08, 0.05, 0.02, M.brass, 0, 0.05, 0.157));

  // scope on a strap slung across the chest — his signature (vs Richtofen's vials)
  t.add(box(0.05, 0.62, 0.03, M.strap, 0.0, 0.28, 0.176, [0, 0, 0.62]));
  t.add(box(0.05, 0.04, 0.02, M.brass, 0.16, 0.30, 0.185));            // strap buckle
  for (let i = 0; i < 3; i++) {                                        // trinocular cluster (centre-left)
    const bx = -0.088 + i * 0.05;
    t.add(box(0.045, 0.11, 0.06, M.binoc, bx, 0.195, 0.205));
    t.add(box(0.05, 0.032, 0.066, M.binocDk, bx, 0.255, 0.205));       // eyepiece caps
  }
}

// --- arms: jacket sleeves down to gloves ------------------------------------
function addArms(J, M) {
  J.elbowL.add(box(0.125, 0.32, 0.125, M.jacket, 0, -0.15, 0));
  J.elbowR.add(box(0.125, 0.32, 0.125, M.jacket, 0, -0.15, 0));
  J.handL.add(box(0.125, 0.135, 0.145, M.glove, 0, 0, 0));
  J.handR.add(box(0.125, 0.135, 0.145, M.glove, 0, 0, 0));
}

function addBlood(J, M) {
  const spot = (parent, x, y, z, s = 0.024) => parent.add(box(s, s, 0.006, M.blood, x, y, z));
  spot(J.head, 0.07, 0.23, 0.118, 0.02);
  spot(J.head, -0.06, 0.17, 0.118, 0.016);
  spot(J.torso, 0.13, 0.36, 0.157, 0.032);
  spot(J.torso, -0.1, 0.22, 0.157, 0.024);
  spot(J.torso, 0.04, 0.14, 0.157, 0.028);
}
