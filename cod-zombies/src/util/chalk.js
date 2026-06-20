import * as THREE from 'three';

/**
 * Procedural "chalk outline of a gun" textures for wall-buys and the mystery
 * box prize. White rough strokes on transparent background, silhouette varying
 * by weapon category. No art assets — drawn to a canvas at load time.
 */

function rough(ctx, pts, close = false) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const jx = (Math.random() - 0.5) * 3;
    const jy = (Math.random() - 0.5) * 3;
    if (i === 0) ctx.moveTo(x + jx, y + jy);
    else ctx.lineTo(x + jx, y + jy);
  });
  if (close) ctx.closePath();
  ctx.stroke();
}

// side-profile silhouettes per category, in a 256x128 box (origin top-left)
const SHAPES = {
  pistol: [[[70, 60], [180, 60], [180, 78], [120, 78], [118, 110], [96, 110], [98, 78], [70, 78]], true],
  smg: [[[50, 55], [200, 55], [200, 72], [150, 72], [148, 100], [126, 100], [128, 72], [110, 72], [108, 95], [92, 95], [94, 72], [50, 72]], true],
  assaultRifle: [[[36, 56], [214, 56], [214, 70], [150, 70], [150, 96], [128, 96], [130, 70], [96, 70], [96, 86], [78, 86], [80, 70], [36, 70]], true],
  shotgun: [[[34, 58], [220, 58], [220, 66], [200, 70], [120, 70], [120, 96], [100, 96], [102, 70], [34, 70]], true],
  sniper: [[[24, 58], [120, 50], [232, 58], [232, 66], [150, 70], [150, 98], [128, 98], [130, 70], [60, 70], [24, 68]], true],
  hmg: [[[34, 50], [210, 50], [210, 74], [150, 74], [150, 100], [126, 100], [128, 74], [60, 74], [60, 64], [34, 64]], true],
  launcher: [[[34, 52], [220, 52], [224, 72], [40, 72], [120, 72], [120, 100], [100, 100], [102, 72]], true],
  special: [[[30, 46], [216, 46], [216, 78], [150, 78], [150, 104], [122, 104], [124, 78], [40, 78], [40, 60], [30, 60]], true],
  wonder: [[[44, 56], [150, 48], [210, 60], [200, 78], [150, 74], [128, 104], [108, 104], [120, 74], [44, 74]], true],
};

export function makeChalkTexture(category = 'assaultRifle') {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 128);
  ctx.strokeStyle = 'rgba(245,245,238,0.95)';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(120,180,255,0.6)';
  ctx.shadowBlur = 6;

  const shape = SHAPES[category] || SHAPES.assaultRifle;
  rough(ctx, shape[0], shape[1]);
  // a couple of detail ticks for texture
  rough(ctx, [[shape[0][0][0] + 20, 64], [shape[0][0][0] + 20, 70]]);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Soft blue radial aura behind a chalk outline. */
export function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(90,170,255,0.55)');
  g.addColorStop(0.5, 'rgba(60,130,255,0.22)');
  g.addColorStop(1, 'rgba(40,90,200,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}
