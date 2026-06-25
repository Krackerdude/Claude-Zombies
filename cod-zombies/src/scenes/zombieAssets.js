import * as THREE from 'three';
import { ps1Snap } from '../rendering/ps1.js';
import { addRimLight } from '../rendering/rimLight.js';
import { RimConfig } from '../config/index.js';

/**
 * Procedural "PS2 horror" zombie skins. Each skin is a set of materials (flesh,
 * shirt, pants, shoes) built from low-res canvas textures with mottled grime and
 * blood — crunchy, nearest-filtered, intentionally low quality. A small fixed
 * set is generated once and shared across the horde for cheap crowd variety
 * (think the RE/Silent Hill civilian zombies). Built lazily so it only runs in a
 * real browser; the headless harness stubs the canvas calls to no-ops.
 */

const SIZE = 64;

function canvasTex(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const x = c.getContext('2d');
  draw(x);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

function rgb(r, g, b) { return `rgb(${r | 0},${g | 0},${b | 0})`; }

// scatter small rects of a colour to fake mottling / fabric noise / blood
function speckle(x, color, count, sizeMin, sizeMax, alpha = 1) {
  x.globalAlpha = alpha;
  x.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const s = sizeMin + Math.random() * (sizeMax - sizeMin);
    x.fillRect(Math.random() * SIZE, Math.random() * SIZE, s, s);
  }
  x.globalAlpha = 1;
}

function blood(x, count = 14) {
  for (let i = 0; i < count; i++) {
    const r = 90 + Math.random() * 70;
    speckle(x, rgb(r, 12, 10), 1, 2, 6, 0.85);
  }
  speckle(x, rgb(60, 6, 6), 6, 1, 3, 0.7); // dried darker
}

function fleshTex([r, g, b]) {
  return canvasTex((x) => {
    x.fillStyle = rgb(r, g, b); x.fillRect(0, 0, SIZE, SIZE);
    speckle(x, rgb(r * 0.7, g * 0.78, b * 0.7), 70, 2, 5, 0.5);   // shadow mottle
    speckle(x, rgb(r * 1.12, g * 1.1, b * 1.05), 50, 1, 3, 0.4);  // highlight
    speckle(x, rgb(70, 92, 64), 18, 2, 5, 0.45);                  // necrotic green
    blood(x, 10);
  });
}

function clothTex([r, g, b], { tatters = true } = {}) {
  return canvasTex((x) => {
    x.fillStyle = rgb(r, g, b); x.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < SIZE; i += 2) { // woven striations
      x.globalAlpha = 0.12; x.fillStyle = i % 4 ? rgb(r * 0.8, g * 0.8, b * 0.8) : rgb(r * 1.1, g * 1.1, b * 1.1);
      x.fillRect(0, i, SIZE, 1);
    }
    x.globalAlpha = 1;
    speckle(x, rgb(r * 0.6, g * 0.6, b * 0.6), 40, 2, 6, 0.4);    // grime
    if (tatters) { x.fillStyle = rgb(r * 0.4, g * 0.4, b * 0.4); for (let i = 0; i < 6; i++) x.fillRect(Math.random() * SIZE, SIZE - 10 + Math.random() * 10, 3 + Math.random() * 6, 6); }
    blood(x, 20);
  });
}

function snapMat(map, { rough = 1, metal = 0, rim = true } = {}) {
  const mat = ps1Snap(new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: metal }));
  // cold moonlight rim along the silhouette so the dead pop out of the murk
  if (rim && RimConfig.enabled) addRimLight(mat, { color: RimConfig.color, power: RimConfig.power, intensity: RimConfig.intensity });
  return mat;
}

// civilian-zombie palettes — flesh tone + shirt + pants + shoe
const PALETTES = [
  { flesh: [150, 150, 132], shirt: [196, 188, 120], pants: [78, 84, 52], shoe: [40, 34, 28] }, // tan shirt / olive
  { flesh: [140, 146, 130], shirt: [120, 124, 130], pants: [86, 96, 120], shoe: [30, 30, 34] }, // gray tee / jeans
  { flesh: [156, 150, 138], shirt: [208, 206, 200], pants: [60, 62, 70], shoe: [26, 26, 30] }, // white shirt / dark
  { flesh: [138, 148, 132], shirt: [66, 92, 140], pants: [44, 48, 60], shoe: [22, 22, 26] }, // blue uniform
  { flesh: [150, 142, 120], shirt: [120, 132, 80], pants: [70, 60, 46], shoe: [34, 28, 22] }, // green vest / brown
  { flesh: [128, 120, 116], shirt: [150, 60, 58], pants: [40, 42, 46], shoe: [24, 22, 24] }, // ashen / red shirt
  { flesh: [120, 134, 124], shirt: [40, 44, 50], pants: [54, 58, 66], shoe: [20, 20, 22] }, // gray-green rot / charcoal
  { flesh: [162, 140, 118], shirt: [180, 150, 96], pants: [96, 84, 60], shoe: [40, 32, 24] }, // sallow / khaki
  { flesh: [134, 130, 140], shirt: [92, 70, 120], pants: [48, 44, 58], shoe: [26, 24, 30] }, // livid / purple shirt
];

let _skins = null;

export function getZombieSkins() {
  if (_skins) return _skins;
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x120000, emissive: 0xff2a1e, emissiveIntensity: 3.0 });
  _skins = PALETTES.map((p) => ({
    flesh: snapMat(fleshTex(p.flesh)),
    shirt: snapMat(clothTex(p.shirt)),
    pants: snapMat(clothTex(p.pants, { tatters: false })),
    shoe: snapMat(clothTex(p.shoe, { tatters: false }), { rough: 0.85 }),
    eye: eyeMat,
  }));
  return _skins;
}

export function randomZombieSkin() {
  const s = getZombieSkins();
  return s[(Math.random() * s.length) | 0];
}

/* ===========================================================================
   Modular cosmetics — hair, beards, hats and outerwear layered onto the same
   rig with the same crunchy materials, so the horde reads as a crowd of people
   instead of a line of bald clones. Everything is a shared, cached material
   (cheap) and a few boxes attached to the head/torso joints by zombieRig.
   =========================================================================== */

function hairTex([r, g, b]) {
  return canvasTex((x) => {
    x.fillStyle = rgb(r, g, b); x.fillRect(0, 0, SIZE, SIZE);
    speckle(x, rgb(r * 0.55, g * 0.55, b * 0.55), 120, 1, 3, 0.55); // strands / shadow
    speckle(x, rgb(r * 1.3, g * 1.3, b * 1.25), 45, 1, 2, 0.3);     // highlight wisps
  });
}

// hair + beard colours (beards reuse the same set)
const HAIR_COLORS = {
  black: [30, 26, 24], darkbrown: [48, 33, 21], brown: [86, 58, 36],
  gray: [124, 120, 114], blonde: [188, 156, 92], ginger: [156, 84, 40], white: [196, 192, 184],
};
let _hairMats = null;
export function hairMat(name) {
  if (!_hairMats) { _hairMats = {}; for (const k in HAIR_COLORS) _hairMats[k] = snapMat(hairTex(HAIR_COLORS[k]), { rough: 0.96 }); }
  return _hairMats[name] || _hairMats.black;
}

// cloth accessories share one cache keyed by a colour name
const _clothMats = new Map();
function clothMatFor(key, rgbArr) {
  let m = _clothMats.get(key);
  if (!m) { m = snapMat(clothTex(rgbArr, { tatters: false })); _clothMats.set(key, m); }
  return m;
}

const OUTER = { gray: [96, 98, 104], navy: [44, 54, 86], olive: [78, 82, 48], brown: [78, 58, 40], maroon: [92, 44, 46], black: [34, 34, 38], tan: [150, 132, 92] };
const TIES = { red: [150, 30, 30], navy: [36, 44, 78], green: [36, 72, 46], black: [28, 28, 32], gold: [150, 120, 40] };
const APRONS = { white: [200, 196, 186], tan: [164, 142, 100], denim: [64, 82, 118], forest: [44, 70, 48] };
const HATS = [
  { style: 'cap', key: 'cap_black', color: [34, 34, 38] },
  { style: 'cap', key: 'cap_red', color: [140, 40, 38] },
  { style: 'cap', key: 'cap_navy', color: [40, 50, 80] },
  { style: 'beanie', key: 'beanie_gray', color: [110, 108, 104] },
  { style: 'beanie', key: 'beanie_brown', color: [80, 50, 40] },
  { style: 'hardhat', key: 'hardhat_yellow', color: [196, 168, 40] },
];

const HAIR_STYLES = ['buzz', 'short', 'messy', 'mohawk', 'balding', 'long', 'bun'];
const BEARDS = ['none', 'none', 'none', 'stubble', 'goatee', 'full'];
const TOPS = ['plain', 'plain', 'hoodie', 'jacket', 'vest', 'tie', 'apron'];

const keysOf = (o) => Object.keys(o);
const pick = (a) => a[(Math.random() * a.length) | 0];
const pickKey = (o) => pick(keysOf(o));

function topMatFor(top) {
  if (top === 'tie') { const k = pickKey(TIES); return clothMatFor('tie_' + k, TIES[k]); }
  if (top === 'apron') { const k = pickKey(APRONS); return clothMatFor('apron_' + k, APRONS[k]); }
  const k = pickKey(OUTER); return clothMatFor('outer_' + k, OUTER[k]); // hoodie / jacket / vest
}

/** A full randomized appearance: base skin + hair + beard + hat + outerwear. */
export function randomZombieLook() {
  const skin = randomZombieSkin();
  const hasHat = Math.random() < 0.22;
  const hatEntry = hasHat ? pick(HATS) : null;
  const hairC = pickKey(HAIR_COLORS);
  const hair = hasHat
    ? (Math.random() < 0.4 ? 'balding' : 'bald')        // a hat hides most hair
    : (Math.random() < 0.12 ? 'bald' : pick(HAIR_STYLES));
  const beard = pick(BEARDS);
  const beardC = Math.random() < 0.75 ? hairC : pickKey(HAIR_COLORS);
  const top = pick(TOPS);
  return {
    skin,
    hair, hairMat: hairMat(hairC),
    beard, beardMat: hairMat(beardC),
    hat: hatEntry ? hatEntry.style : 'none', hatMat: hatEntry ? clothMatFor(hatEntry.key, hatEntry.color) : null,
    top, topMat: top === 'plain' ? null : topMatFor(top),
  };
}

/** Park one tiny hidden quad per shared zombie material in the scene so the
 *  load-time prewarm compiles + uploads them all and the first wave never
 *  hitches (mirrors the box/effect prewarm). */
export function prewarmZombieCosmetics(scene) {
  const mats = [];
  for (const s of getZombieSkins()) mats.push(s.flesh, s.shirt, s.pants, s.shoe, s.eye);
  for (const k in HAIR_COLORS) mats.push(hairMat(k));
  for (const k in OUTER) mats.push(clothMatFor('outer_' + k, OUTER[k]));
  for (const k in TIES) mats.push(clothMatFor('tie_' + k, TIES[k]));
  for (const k in APRONS) mats.push(clothMatFor('apron_' + k, APRONS[k]));
  for (const h of HATS) mats.push(clothMatFor(h.key, h.color));
  const g = new THREE.Group();
  g.visible = false; g.position.set(0, -100, 0);
  const geo = new THREE.PlaneGeometry(0.01, 0.01);
  for (const m of mats) g.add(new THREE.Mesh(geo, m));
  scene.add(g);
}
