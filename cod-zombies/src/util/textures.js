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
