import * as THREE from 'three';
import { ACT } from './gobblegums.js';

/**
 * Procedural 3D gumball model — a glossy candy sphere whose color + internal
 * swirl are driven by the gum's ACTIVATION type (blue/green/purple/orange and a
 * rainbow swirl for whimsical). This is the reusable framework model for showing
 * gums in the world / on the HUD when the activate-in-match flow is built; the
 * browse menu uses lighter CSS spheres for its 58-cell grid.
 *
 * Returns a THREE.Group; call .userData.dispose() to free the geometry/texture.
 */
export function buildgumballModel(actId = 'time', { radius = 0.5 } = {}) {
  const act = ACT[actId] ?? ACT.time;
  const group = new THREE.Group();

  const tex = swirlTexture(act);
  const geo = new THREE.SphereGeometry(radius, 48, 48);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.16,
    metalness: 0.0,
    emissive: new THREE.Color(act.color),
    emissiveIntensity: 0.18,
  });
  const ball = new THREE.Mesh(geo, mat);
  group.add(ball);

  // a faint glossy highlight cap so it reads as wet candy even in flat light
  const hiGeo = new THREE.SphereGeometry(radius * 1.002, 24, 24);
  const hiMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.12,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const hi = new THREE.Mesh(hiGeo, hiMat);
  hi.scale.set(1, 1, 1);
  group.add(hi);

  group.userData.act = actId;
  group.userData.dispose = () => { geo.dispose(); hiGeo.dispose(); mat.dispose(); hiMat.dispose(); tex.dispose(); };
  return group;
}

/** Canvas texture: the candy base color with a lighter sugar swirl (rainbow for whimsy). */
function swirlTexture(act) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');

  // base radial shade (lit center -> deeper rim)
  const g = ctx.createRadialGradient(s * 0.4, s * 0.36, s * 0.05, s * 0.5, s * 0.5, s * 0.6);
  g.addColorStop(0, act.glow);
  g.addColorStop(0.55, act.color);
  g.addColorStop(1, shade(act.color, -0.45));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);

  // swirling sugar bands
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  const rainbow = act.id === 'whimsy';
  for (let i = 0; i < 7; i++) {
    const t = i / 7;
    ctx.strokeStyle = rainbow ? `hsl(${Math.round(t * 360)}, 90%, 65%)` : tint(act.glow, 0.5);
    ctx.globalAlpha = rainbow ? 0.6 : 0.28;
    ctx.beginPath();
    const y = s * (0.12 + t * 0.78);
    ctx.moveTo(-20, y);
    ctx.bezierCurveTo(s * 0.3, y - 40, s * 0.7, y + 40, s + 20, y - 10);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- tiny color helpers (hex in, hex out) ---------------------------------
function shade(hex, amt) {
  const { r, g, b } = hexRgb(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return rgbHex(f(r), f(g), f(b));
}
function tint(hex, amt) {
  const { r, g, b } = hexRgb(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + (255 - v) * amt)));
  return rgbHex(f(r), f(g), f(b));
}
function hexRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbHex(r, g, b) { return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''); }
