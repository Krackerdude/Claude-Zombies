import * as THREE from 'three';
import { buildZombieRig } from '../scenes/zombieRig.js';

/**
 * Takeo Masaki — "The Yokai Hunter." A wandering ronin from a mystical feudal
 * Japan. Built off the shared human rig, then decorated to read wholly apart
 * from Richtofen + Dempsey: black hair slicked back into a short nape tail, a
 * small CENTRED goatee with a thin moustache (no wraparound beard), a torn
 * olive sleeveless field tunic over a red undershirt with crossed leather
 * straps, green-lensed goggles resting at the collar, cloth-wrapped bare
 * forearms, copper segmented thigh armour, steel shin greaves, and a katana
 * slung at the hip.
 */

const std = (color, roughness = 0.7, metalness = 0.04) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const basic = (color) => new THREE.MeshBasicMaterial({ color });

function mats() {
  return {
    flesh: std(0xc79a72, 0.6),       // warm East-Asian skin
    eye: std(0x0c0e13, 0.4),
    iris: std(0x3a2416, 0.4),        // dark brown eyes
    hair: std(0x14100c, 0.8),        // near-black, slicked
    tunic: std(0x74784a, 0.82),      // worn/torn olive field tunic
    tunicDk: std(0x555833, 0.86),
    red: std(0x7d2c26, 0.8),         // red undershirt at the collar
    strap: std(0x63432b, 0.68),      // brown leather straps
    strapDk: std(0x4a3120, 0.72),
    pouch: std(0x5a3d27, 0.74),
    gog: std(0x2f251a, 0.55, 0.2),   // goggle frame/rubber
    lens: std(0x1f7a44, 0.25, 0.1),  // green glass
    lensGlow: basic(0x36e089),
    pants: std(0x3b3e42, 0.86),      // dark grey breeches
    plate: std(0xa5632f, 0.5, 0.55), // copper thigh armour
    plateDk: std(0x7a4520, 0.55, 0.5),
    wrap: std(0xb4a184, 0.86),       // dirty cloth hand/arm wraps
    steel: std(0x9aa0a6, 0.5, 0.6),  // shin greaves
    shoe: std(0x40342a, 0.72),
    sheath: std(0x1b1917, 0.6),      // katana scabbard
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

export function buildTakeo() {
  const M = mats();
  // skin.shirt = flesh so the sleeveless tunic leaves bare shoulders + arms;
  // the tunic itself is wrapped on separately over the torso.
  const look = { human: true, skin: { flesh: M.flesh, shirt: M.flesh, pants: M.pants, shoe: M.shoe, eye: M.eye } };
  const rig = buildZombieRig(look);
  const J = rig.userData.joints;

  addHead(J.head, M);
  addOutfit(J.torso, M);
  addArms(J, M);
  addLegs(J, M);
  addKatana(J.hips, M);
  addBlood(J, M);
  return rig;
}

// --- head: slicked-back hair + nape tail, centred goatee, thin moustache ------
function addHead(head, M) {
  // slicked back tight to the skull, then gathered UP into a man-bun at the
  // back of the crown
  head.add(box(0.228, 0.07, 0.205, M.hair, 0, 0.3, -0.02));             // crown, slicked flat + back
  head.add(box(0.206, 0.11, 0.05, M.hair, 0, 0.245, -0.116));           // back, sweeping up to the knot
  head.add(box(0.05, 0.055, 0.05, M.strapDk, 0, 0.315, -0.135));        // the tie band at the base of the bun
  head.add(box(0.13, 0.14, 0.13, M.hair, 0, 0.37, -0.15));             // the man-bun knot, proud at the back-top
  head.add(box(0.07, 0.06, 0.07, M.hair, 0, 0.44, -0.16));            // top nub of the knot
  for (const s of [-1, 1]) head.add(box(0.02, 0.085, 0.185, M.hair, s * 0.117, 0.27, -0.02));  // thin slicked sides
  for (const s of [-1, 1]) head.add(box(0.014, 0.06, 0.045, M.hair, s * 0.115, 0.225, 0.058)); // short sideburn
  head.add(box(0.198, 0.045, 0.075, M.hair, 0, 0.34, 0.0, [0.22, 0, 0]));                       // swept-back front band

  // a single THIN moustache — matched to Dempsey's
  head.add(box(0.088, 0.016, 0.03, M.hair, 0, 0.12, 0.117));

  // a small CENTRED goatee sitting ON the chin — narrow, does NOT reach the
  // sides and does not hang onto the neck
  head.add(box(0.028, 0.02, 0.026, M.hair, 0, 0.104, 0.115));           // soul patch under the lip
  head.add(box(0.055, 0.05, 0.032, M.hair, 0, 0.083, 0.112));           // chin tuft, tucked to the jaw

  // dark brown irises behind the rig's pupils
  for (const s of [-1, 1]) head.add(box(0.034, 0.03, 0.02, M.iris, s * 0.05, 0.214, 0.119));
}

// --- torso: torn sleeveless tunic, red collar, crossed straps, goggles --------
function addOutfit(t, M) {
  // torn olive tunic WRAPPING the whole torso (front, back, sides)
  t.add(box(0.44, 0.5, 0.035, M.tunic, 0, 0.26, 0.135));                // front
  t.add(box(0.44, 0.5, 0.035, M.tunic, 0, 0.26, -0.135));              // back
  for (const s of [-1, 1]) t.add(box(0.035, 0.5, 0.28, M.tunic, s * 0.216, 0.26, 0)); // sides
  // ragged torn sleeve caps at the shoulders (sleeveless)
  for (const s of [-1, 1]) t.add(box(0.11, 0.14, 0.24, M.tunicDk, s * 0.205, 0.44, 0, [0, 0, s * -0.2]));
  // a jagged torn hem strip at the waist
  for (const s of [-1, 1]) t.add(box(0.14, 0.05, 0.03, M.tunicDk, s * 0.1, 0.02, 0.14));

  // red undershirt showing at the open V collar
  t.add(box(0.14, 0.16, 0.02, M.red, 0, 0.44, 0.153));
  for (const s of [-1, 1]) t.add(box(0.08, 0.12, 0.045, M.tunic, s * 0.08, 0.47, 0.125, [0, 0, s * 0.34])); // collar flaps

  // crossed leather straps over the chest (an X bandolier)
  for (const s of [-1, 1]) t.add(box(0.05, 0.66, 0.03, M.strap, 0, 0.27, 0.17, [0, 0, s * 0.6]));
  t.add(box(0.05, 0.05, 0.02, M.brass, 0, 0.30, 0.19));                 // buckle where they cross
  // a pouch clipped to the left strap
  t.add(box(0.11, 0.12, 0.06, M.pouch, -0.15, 0.34, 0.165));
  t.add(box(0.11, 0.03, 0.062, M.strapDk, -0.15, 0.40, 0.166));        // pouch flap

  // green-lensed goggles resting at the collarbone
  t.add(box(0.2, 0.055, 0.05, M.gog, 0, 0.40, 0.16, [0.1, 0, 0]));      // strap band
  for (const s of [-1, 1]) {
    t.add(box(0.07, 0.06, 0.03, M.gog, s * 0.05, 0.40, 0.182));         // eye cups
    t.add(box(0.05, 0.045, 0.015, M.lens, s * 0.05, 0.40, 0.198));      // green lens
    t.add(box(0.05, 0.045, 0.008, M.lensGlow, s * 0.05, 0.40, 0.205));  // lens glow
  }

  // waist belt + buckle
  t.add(box(0.46, 0.055, 0.29, M.strap, 0, 0.03, 0));
  t.add(box(0.075, 0.05, 0.02, M.brass, 0, 0.03, 0.147));
}

// --- arms: bare, wrapped in dirty cloth from wrist up the forearm -------------
function addArms(J, M) {
  for (const el of [J.elbowL, J.elbowR]) {
    // cloth wrap over the forearm, banded so it reads as bindings
    el.add(box(0.112, 0.24, 0.122, M.wrap, 0, -0.18, 0));
    for (let i = 0; i < 4; i++) el.add(box(0.118, 0.012, 0.128, M.strapDk, 0, -0.09 - i * 0.055, 0)); // wrap seams
  }
  J.handL.add(box(0.125, 0.135, 0.145, M.wrap, 0, 0, 0));               // wrapped hands
  J.handR.add(box(0.125, 0.135, 0.145, M.wrap, 0, 0, 0));
}

// --- legs: copper segmented thigh armour (right), steel greaves, dark boots ---
function addLegs(J, M) {
  // copper thigh plates strapped down one thigh (opposite the katana hip)
  const thigh = J.thighL;
  thigh.add(box(0.14, 0.11, 0.05, M.plateDk, -0.02, -0.06, 0.095));     // hip guard / holster block
  for (let i = 0; i < 4; i++) thigh.add(box(0.145, 0.055, 0.06, M.plate, -0.02, -0.16 - i * 0.062, 0.092)); // segmented tassets
  thigh.add(box(0.03, 0.34, 0.02, M.strap, 0.075, -0.2, 0.11));        // retaining strap

  // steel shin greaves over both shins
  for (const kn of [J.kneeL, J.kneeR]) {
    kn.add(box(0.155, 0.3, 0.045, M.steel, 0, -0.24, 0.075));
    kn.add(box(0.16, 0.03, 0.05, M.strapDk, 0, -0.12, 0.078));          // top buckle band
  }
}

// --- katana slung at the left hip --------------------------------------------
function addKatana(hips, M) {
  const g = new THREE.Group();
  g.position.set(0.24, 0.02, -0.02);
  g.rotation.z = 0.35; g.rotation.x = 0.18;
  g.add(box(0.045, 0.72, 0.05, M.sheath, 0, -0.3, 0));                  // scabbard
  g.add(box(0.05, 0.05, 0.06, M.brass, 0, 0.05, 0));                    // tsuba (guard)
  g.add(box(0.035, 0.2, 0.045, M.strapDk, 0, 0.17, 0));                 // wrapped handle
  g.add(box(0.06, 0.04, 0.03, M.strap, 0, -0.02, 0.05));               // belt loop
  hips.add(g);
}

function addBlood(J, M) {
  const spot = (parent, x, y, z, s = 0.022) => parent.add(box(s, s, 0.006, M.blood, x, y, z));
  spot(J.head, 0.07, 0.24, 0.118, 0.018);
  spot(J.head, -0.05, 0.18, 0.118, 0.014);
  spot(J.torso, 0.12, 0.33, 0.157, 0.03);
  spot(J.torso, -0.08, 0.18, 0.157, 0.022);
  spot(J.torso, 0.05, 0.11, 0.157, 0.026);
}
