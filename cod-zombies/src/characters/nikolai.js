import * as THREE from 'three';
import { buildZombieRig } from '../scenes/zombieRig.js';

/**
 * Nikolai Belinski — "The Soviet Tank Engineer." An armored-warfare specialist
 * and mechanic from the Soviet–Afghan War. Built off the shared human rig, then
 * decorated wholly apart from the others: a worn brown leather tanker/flight
 * helmet with dangling chin straps and vintage round goggles pushed up on top,
 * a full brown beard framed by the helmet, a padded rolled collar, an olive
 * breastplate with a polished steel waist band, a canvas rifle sling across the
 * chest, a star-buckle belt with pouches + a hip satchel, a coiled hose down one
 * side, a back radio pack with a tool slung over the shoulder, gauntlet gloves,
 * grey breeches and tall boots — and caked in dried blood throughout.
 */

const std = (color, roughness = 0.7, metalness = 0.04) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

function mats() {
  return {
    flesh: std(0xc99f79, 0.6),       // weathered pale skin
    eye: std(0x0c0e13, 0.4),
    iris: std(0x5a7f95, 0.35),       // pale blue eyes
    beard: std(0x6b4f32, 0.85),      // brown gunslinger beard
    brow: std(0x6b4f32, 0.82),       // brown eyebrows (match the beard, not black)
    leather: std(0x35271a, 0.72),    // DARK brown helmet leather (darker than any hair, for clarity)
    leatherDk: std(0x241a10, 0.76),
    gogStrap: std(0x4a3826, 0.7),
    gogFrame: std(0x2a2018, 0.55, 0.2),
    lens: std(0x15161a, 0.3, 0.4),   // smoked round lenses
    pad: std(0xb0a284, 0.86),        // padded collar / roll
    plate: std(0x8f8a5f, 0.55, 0.3), // olive breastplate
    plateDk: std(0x6c6842, 0.6, 0.2),
    steel: std(0xa6abb0, 0.4, 0.7),  // polished steel waist band + buckle
    sling: std(0xcfc6ad, 0.8),       // off-white canvas rifle sling
    belt: std(0x5c4326, 0.68),
    pouch: std(0x6b4d2f, 0.74),
    canvas: std(0xc6bda2, 0.85),     // satchel
    canvasDk: std(0x9c9276, 0.85),
    hose: std(0x2b2b2e, 0.7),        // ribbed rubber hose
    glove: std(0xa89a80, 0.78),      // worn light gauntlet gloves
    jacket: std(0x5a4632, 0.78),     // dark weathered sleeves under the armor
    pants: std(0x585f66, 0.86),      // grey-blue breeches
    boot: std(0x6a5842, 0.72),       // tall worn boots
    bootDk: std(0x4c3f2f, 0.75),
    pack: std(0x4a4a44, 0.6, 0.2),   // back radio/tool pack
    gold: std(0xb08a2e, 0.42, 0.5),  // Soviet star
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

export function buildNikolai() {
  const M = mats();
  // sleeves read as the dark weathered jacket; the chest is hidden under armor
  const look = { human: true, skin: { flesh: M.flesh, shirt: M.jacket, pants: M.pants, shoe: M.boot, eye: M.eye } };
  const rig = buildZombieRig(look);
  const J = rig.userData.joints;

  addHead(J.head, M);
  addOutfit(J.torso, M);
  addBack(J.torso, M);
  addArms(J, M);
  addLegs(J, M);
  addBlood(J, M);
  return rig;
}

// --- head: leather flight helmet framing a full beard, goggles up on top ------
function addHead(head, M) {
  // leather helmet shell — pushed UP off the brow so the forehead breathes,
  // and kept dark so it separates clearly from the brown hair/beard
  head.add(box(0.256, 0.15, 0.254, M.leather, 0, 0.328, -0.005));       // dome / crown (raised)
  head.add(box(0.25, 0.05, 0.05, M.leather, 0, 0.318, 0.112));          // brow band (raised off the eyebrows)
  head.add(box(0.248, 0.27, 0.06, M.leather, 0, 0.21, -0.12));          // back of the head
  for (const s of [-1, 1]) head.add(box(0.05, 0.25, 0.235, M.leather, s * 0.123, 0.17, -0.005)); // ear flaps down past the jaw
  for (const s of [-1, 1]) head.add(box(0.035, 0.11, 0.03, M.leatherDk, s * 0.10, 0.035, 0.08));  // dangling chin straps
  head.add(box(0.05, 0.03, 0.03, M.steel, 0.055, 0.025, 0.085));        // chin-strap buckle
  head.add(box(0.02, 0.15, 0.24, M.leatherDk, 0, 0.333, -0.005));       // crown seam piping

  // vintage round goggles pushed UP onto the top of the helmet
  head.add(box(0.25, 0.05, 0.06, M.gogStrap, 0, 0.378, 0.07, [0.12, 0, 0]));    // strap band
  for (const s of [-1, 1]) {
    head.add(box(0.088, 0.088, 0.055, M.gogFrame, s * 0.063, 0.385, 0.10, [0.12, 0, 0])); // lens housing
    head.add(box(0.062, 0.062, 0.025, M.lens, s * 0.063, 0.387, 0.127, [0.12, 0, 0]));     // smoked lens
  }
  head.add(box(0.04, 0.05, 0.04, M.gogFrame, 0, 0.385, 0.115, [0.12, 0, 0])); // nose bridge of the goggles

  // brown eyebrows (over the rig's near-black base pair)
  for (const s of [-1, 1]) head.add(box(0.062, 0.024, 0.028, M.brow, s * 0.05, 0.248, 0.11));

  // a defined straight nose (was missing)
  head.add(box(0.046, 0.082, 0.056, M.flesh, 0, 0.166, 0.125));

  // a GUNSLINGER beard: moustache + a chin beard framing the mouth — it stops
  // at the corners of the mouth and does NOT reach the sides of the face
  head.add(box(0.10, 0.022, 0.032, M.beard, 0, 0.122, 0.119));          // moustache
  for (const s of [-1, 1]) head.add(box(0.026, 0.062, 0.036, M.beard, s * 0.046, 0.088, 0.115)); // frames down from the mouth corners
  head.add(box(0.11, 0.072, 0.05, M.beard, 0, 0.058, 0.108));           // chin beard

  // pale blue irises behind the rig's pupils
  for (const s of [-1, 1]) head.add(box(0.034, 0.03, 0.02, M.iris, s * 0.05, 0.214, 0.119));
}

// --- torso: padded collar, breastplate, sling, star belt, satchel, hose -------
function addOutfit(t, M) {
  // padded rolled collar around the base of the neck
  t.add(box(0.24, 0.1, 0.08, M.pad, 0, 0.5, 0.1));                      // front roll
  t.add(box(0.24, 0.1, 0.08, M.pad, 0, 0.5, -0.1));                     // back roll
  for (const s of [-1, 1]) t.add(box(0.08, 0.1, 0.22, M.pad, s * 0.12, 0.5, 0));      // side rolls

  // olive breastplate over the chest + a polished steel waist band
  t.add(box(0.42, 0.3, 0.04, M.plate, 0, 0.35, 0.14));                  // upper plate
  for (const s of [-1, 1]) t.add(box(0.04, 0.3, 0.22, M.plate, s * 0.205, 0.35, 0.02)); // side wrap
  t.add(box(0.44, 0.14, 0.05, M.steel, 0, 0.16, 0.145));               // polished steel band
  for (const s of [-1, 1]) t.add(box(0.02, 0.02, 0.02, M.plateDk, s * 0.06, 0.235, 0.162)); // rivets

  // canvas rifle sling slung diagonally across the chest
  t.add(box(0.05, 0.7, 0.03, M.sling, 0, 0.28, 0.178, [0, 0, 0.6]));

  // star-buckle belt with pouches
  t.add(box(0.46, 0.07, 0.29, M.belt, 0, 0.02, 0));
  t.add(box(0.09, 0.09, 0.025, M.steel, 0, 0.02, 0.155));               // buckle plate
  t.add(box(0.05, 0.05, 0.008, M.gold, 0, 0.02, 0.17));                 // Soviet star
  t.add(box(0.1, 0.13, 0.06, M.pouch, -0.15, -0.01, 0.13));             // ammo pouch (left)
  t.add(box(0.09, 0.11, 0.05, M.pouch, 0.14, -0.02, 0.14));            // pouch (right)

  // canvas map satchel on the right hip
  t.add(box(0.18, 0.18, 0.09, M.canvas, 0.18, -0.06, 0.09));
  t.add(box(0.18, 0.05, 0.095, M.canvasDk, 0.18, 0.04, 0.09));         // flap

  // coiled ribbed hose hanging down the left side
  for (let i = 0; i < 8; i++) t.add(box(0.06, 0.03, 0.06, M.hose, -0.255, 0.42 - i * 0.05, 0.05));
  t.add(box(0.06, 0.03, 0.09, M.hose, -0.255, 0.04, 0.09));            // loop out at the bottom
  t.add(box(0.06, 0.09, 0.06, M.hose, -0.215, 0.03, 0.12));
}

// --- back: radio/tool pack + a slung tool over the shoulder -------------------
function addBack(t, M) {
  t.add(box(0.22, 0.24, 0.08, M.pack, 0, 0.28, -0.165));               // pack body
  t.add(box(0.13, 0.15, 0.03, M.plateDk, 0, 0.28, -0.21));             // pack face detail
  for (const s of [-1, 1]) t.add(box(0.05, 0.34, 0.03, M.belt, s * 0.16, 0.34, 0.12, [0, 0, s * 0.3])); // shoulder straps
  // a tool / entrenching handle slung up over the right shoulder
  t.add(box(0.025, 0.42, 0.025, M.leatherDk, -0.14, 0.44, -0.1, [0.18, 0, 0.12]));
  t.add(box(0.05, 0.09, 0.05, M.steel, -0.17, 0.62, -0.14, [0.18, 0, 0.12]));
}

// --- arms: dark sleeves down to worn gauntlet gloves -------------------------
function addArms(J, M) {
  for (const el of [J.elbowL, J.elbowR]) el.add(box(0.115, 0.09, 0.125, M.glove, 0, -0.285, 0)); // gauntlet cuffs
  J.handL.add(box(0.13, 0.145, 0.155, M.glove, 0, 0, 0));
  J.handR.add(box(0.13, 0.145, 0.155, M.glove, 0, 0, 0));
}

// --- legs: grey breeches bloused into tall worn boots ------------------------
function addLegs(J, M) {
  for (const kn of [J.kneeL, J.kneeR]) {
    kn.add(box(0.17, 0.32, 0.185, M.boot, 0, -0.32, 0.015));            // tall boot shaft
    kn.add(box(0.178, 0.05, 0.195, M.bootDk, 0, -0.17, 0.015));         // fold at the top of the boot
  }
}

function addBlood(J, M) {
  const spot = (parent, x, y, z, s = 0.03) => parent.add(box(s, s, 0.006, M.blood, x, y, z));
  // caked and spattered — Nikolai's reference is drenched
  spot(J.head, 0.08, 0.24, 0.118, 0.016);
  spot(J.torso, 0.1, 0.38, 0.162, 0.05);
  spot(J.torso, -0.12, 0.32, 0.162, 0.035);
  spot(J.torso, 0.05, 0.22, 0.168, 0.045);
  spot(J.torso, 0.14, 0.14, 0.15, 0.03);
  spot(J.torso, -0.06, 0.12, 0.15, 0.04);
  spot(J.torso, 0.02, 0.3, 0.162, 0.028);
  spot(J.kneeL, 0.04, -0.3, 0.11, 0.04);
  spot(J.kneeR, -0.03, -0.2, 0.1, 0.03);
  spot(J.elbowR, 0.02, -0.15, 0.07, 0.03);
}
