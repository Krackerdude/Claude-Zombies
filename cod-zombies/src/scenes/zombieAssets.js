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
