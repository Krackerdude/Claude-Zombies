import * as THREE from 'three';

/**
 * Generates a simple procedural grid/checker texture via a 2D canvas so the
 * sandbox has readable surfaces without shipping image files. Real maps will
 * use AssetManager.loadTexture instead; this is purely scaffolding.
 */
export function makeGridTexture({
  size = 512,
  cells = 16,
  base = '#1a1f27',
  line = '#2c3440',
  accent = '#3a4656',
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  const step = size / cells;
  ctx.lineWidth = 1;
  for (let i = 0; i <= cells; i++) {
    ctx.strokeStyle = i % 4 === 0 ? accent : line;
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, size);
    ctx.moveTo(0, i * step);
    ctx.lineTo(size, i * step);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// --- procedural normal maps ------------------------------------------------
// Built from a CPU heightfield into a DataTexture (no canvas getImageData), so
// they generate identically in the browser and in the headless test harness.
// These add surface relief under the dynamic lights without shipping art.

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Generate a tangent-space normal map (THREE.DataTexture) from a procedural
 * heightfield. `kind` shapes the height:
 *   - 'noise'    fine grain / plaster / concrete tooth
 *   - 'brick'    horizontal courses + vertical perpends (mortar grooves)
 *   - 'planks'   long vertical boards with seams + wood grain
 */
export function makeNormalTexture({ size = 256, freq = 8, strength = 1.0, kind = 'noise' } = {}) {
  const data = new Uint8Array(size * size * 4);

  const height = (px, py) => {
    const u = px / size, v = py / size;
    if (kind === 'brick') {
      const rows = freq;
      const ry = v * rows;
      const course = Math.floor(ry);
      const offset = course % 2 ? 0.5 : 0.0;       // running bond
      const bx = (u * rows + offset);
      const mortarV = Math.min(ry - course, course + 1 - ry);      // dist to course line
      const mortarH = Math.min(bx - Math.floor(bx), Math.floor(bx) + 1 - bx);
      const groove = Math.min(smooth(mortarV, 0.08), smooth(mortarH, 0.06));
      return groove * 0.85 + valueNoise(u * 40, v * 40) * 0.15;
    }
    if (kind === 'planks') {
      const cols = freq;
      const bx = u * cols;
      const seam = Math.min(bx - Math.floor(bx), Math.floor(bx) + 1 - bx);
      const grain = valueNoise(u * cols * 2.0, v * 6) * 0.5 + valueNoise(u * 80, v * 12) * 0.2;
      return smooth(seam, 0.05) * 0.8 + grain * 0.2;
    }
    // noise
    return valueNoise(u * freq * 2, v * freq * 2) * 0.6 + valueNoise(u * freq * 8, v * freq * 8) * 0.4;
  };

  const s = strength * 2.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hL = height((x - 1 + size) % size, y);
      const hR = height((x + 1) % size, y);
      const hD = height(x, (y - 1 + size) % size);
      const hU = height(x, (y + 1) % size);
      let nx = (hL - hR) * s, ny = (hD - hU) * s, nz = 1.0;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv; ny *= inv; nz *= inv;
      const i = (y * size + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * 0.5 + 0.5) * 255;
      data[i + 2] = (nz * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  tex.anisotropy = 8;
  return tex;
}

function smooth(d, edge) {
  // 0 in the groove, 1 on the face — a soft ramp out of the seam
  const t = Math.min(1, Math.max(0, d / edge));
  return t * t * (3 - 2 * t);
}
