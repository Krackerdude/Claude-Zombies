import * as THREE from 'three';

/**
 * SHARED weapon material standard. The expensive parts — the brushed grain, the
 * environment reflection, the grip stipple, the ridge bump — are authored ONCE
 * and cached, then reused across every gun. Colour, though, varies per part:
 * a slide is a lighter polished steel, a frame a darker grey, the barrel near
 * black. So `gunMetal(color)` hands back a material that SHARES the maps but
 * carries its own tone, and instances are cached per colour so we still only
 * pay once for any given shade.
 *
 * Metalness is kept moderate (not 1.0) so the base tone reads under the
 * viewmodel key light instead of going flat-black, and the env map is a soft
 * sheen rather than a hard gradient.
 */

let _env, _brushed, _stipple, _ridge, _wood, _checker;

export function gunEnv() {
  if (_env) return _env;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  const grd = x.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0.0, '#333944'); grd.addColorStop(0.4, '#222730');
  grd.addColorStop(0.72, '#15181d'); grd.addColorStop(1.0, '#0b0c0f');
  x.fillStyle = grd; x.fillRect(0, 0, 256, 128);
  for (const [px, py, w] of [[70, 34, 70], [190, 28, 52]]) {
    const r = x.createRadialGradient(px, py, 0, px, py, w);
    r.addColorStop(0, 'rgba(220,230,245,0.4)'); r.addColorStop(1, 'rgba(220,230,245,0)');
    x.fillStyle = r; x.fillRect(0, 0, 256, 128);
  }
  _env = new THREE.CanvasTexture(c);
  _env.mapping = THREE.EquirectangularReflectionMapping;
  return _env;
}

export function brushedRoughness() {
  if (_brushed) return _brushed;
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#6b6b6b'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1500; i++) {
    const y = Math.random() * 256, xx = Math.random() * 256, len = 26 + Math.random() * 200;
    const v = 64 + (Math.random() * 80 | 0);
    x.strokeStyle = `rgba(${v},${v},${v},0.22)`; x.lineWidth = 1;
    x.beginPath(); x.moveTo(xx, y); x.lineTo(xx + len, y + (Math.random() - 0.5) * 1.4); x.stroke();
  }
  _brushed = new THREE.CanvasTexture(c);
  _brushed.wrapS = _brushed.wrapT = THREE.RepeatWrapping;
  return _brushed;
}

export function gripStipple() {
  if (_stipple) return _stipple;
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#5c5c5c'; x.fillRect(0, 0, 128, 128);
  for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) {
    const px = 5 + i * 11 + (j % 2) * 5, py = 5 + j * 11;
    const r = x.createRadialGradient(px, py, 0, px, py, 5);
    r.addColorStop(0, '#f2f2f2'); r.addColorStop(1, '#444444');
    x.fillStyle = r; x.beginPath(); x.arc(px, py, 4.4, 0, 7); x.fill();
  }
  _stipple = new THREE.CanvasTexture(c);
  _stipple.wrapS = _stipple.wrapT = THREE.RepeatWrapping;
  return _stipple;
}

export function ridgeBump() {
  if (_ridge) return _ridge;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  for (let i = 0; i < 64; i += 4) { x.fillStyle = (i % 8 < 4) ? '#dadada' : '#2c2c2c'; x.fillRect(i, 0, 4, 64); }
  _ridge = new THREE.CanvasTexture(c);
  _ridge.wrapS = _ridge.wrapT = THREE.RepeatWrapping;
  return _ridge;
}

/**
 * Figured-walnut grain, kept near-neutral (luminance, not hue) so the material
 * `color` sets the actual tone — a light stock and a dark forend share this one
 * map. Flowing streaks along U with a few cathedral arcs for character.
 */
export function woodGrain() {
  if (_wood) return _wood;
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#c2c2c2'; x.fillRect(0, 0, 256, 256); // mid base; color multiplies in
  for (let i = 0; i < 80; i++) {
    const y = Math.random() * 256;
    const dark = Math.random() < 0.62;
    const v = dark ? 70 + (Math.random() * 45 | 0) : 180 + (Math.random() * 60 | 0);
    x.strokeStyle = `rgba(${v},${v},${v},${0.08 + Math.random() * 0.18})`;
    x.lineWidth = 0.5 + Math.random() * 2.2;
    x.beginPath(); x.moveTo(0, y);
    x.bezierCurveTo(80, y + (Math.random() * 30 - 15), 170, y + (Math.random() * 30 - 15), 256, y + (Math.random() * 22 - 11));
    x.stroke();
  }
  for (let i = 0; i < 5; i++) { // figure / cathedral arcs
    const cy = Math.random() * 256;
    x.strokeStyle = 'rgba(60,50,44,0.12)'; x.lineWidth = 1.6;
    x.beginPath(); x.moveTo(0, cy); x.quadraticCurveTo(128, cy - 40 - Math.random() * 50, 256, cy); x.stroke();
  }
  _wood = new THREE.CanvasTexture(c);
  _wood.wrapS = _wood.wrapT = THREE.RepeatWrapping;
  return _wood;
}

// diamond checkering, bump-only (drives the raised feel on grip/forend panels)
export function woodChecker() {
  if (_checker) return _checker;
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#8a8a8a'; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = '#1c1c1c'; x.lineWidth = 2;
  for (let i = -128; i < 128; i += 11) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 128, 128); x.stroke();
    x.beginPath(); x.moveTo(i + 128, 0); x.lineTo(i, 128); x.stroke();
  }
  _checker = new THREE.CanvasTexture(c);
  _checker.wrapS = _checker.wrapT = THREE.RepeatWrapping;
  _checker.repeat.set(3, 3);
  return _checker;
}

// === the standard, parameterised by tone (maps shared, instances cached) ===
const _cache = new Map();

export function gunMetal(color = 0x363b43, opts = {}) {
  const ridged = !!opts.ridged;
  const metal = opts.metal ?? 0.68;
  const rough = opts.rough ?? 0.4;
  const key = `${color}|${ridged}|${metal}|${rough}`;
  if (_cache.has(key)) return _cache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color, metalness: metal, roughness: rough,
    roughnessMap: brushedRoughness(), envMap: gunEnv(), envMapIntensity: 0.55,
  });
  if (ridged) { m.bumpMap = ridgeBump(); m.bumpScale = 0.4; }
  _cache.set(key, m);
  return m;
}

export function gunMetalRidged(color = 0x363b43) { return gunMetal(color, { ridged: true }); }

export function gunGrip(color = 0x7c828e) {
  const key = `grip|${color}`;
  if (_cache.has(key)) return _cache.get(key);
  const stip = gripStipple();
  const m = new THREE.MeshStandardMaterial({
    color, metalness: 0.18, roughness: 0.82,
    // the stipple drives BOTH the albedo (so the dots read under any light, not
    // just a raking muzzle flash) and the bump (for the raised feel)
    map: stip, bumpMap: stip, bumpScale: 0.85,
    envMap: gunEnv(), envMapIntensity: 0.3,
  });
  _cache.set(key, m);
  return m;
}

export function gunDark(color = 0x121317) {
  const key = `dark|${color}`;
  if (_cache.has(key)) return _cache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.55, envMap: gunEnv(), envMapIntensity: 0.4 });
  _cache.set(key, m);
  return m;
}

/**
 * SHARED brushed-walnut wood, parameterised by tone (grain map shared, instances
 * cached per colour) — the wood counterpart to gunMetal. Low metalness with a
 * soft env sheen reads as oiled/varnished stock. Pass `checker: true` for the
 * diamond-checkered grip/forend panels (swaps the bump to the checker pattern).
 */
export function gunWood(color = 0x8f4f30, opts = {}) {
  const checker = !!opts.checker;
  const key = `wood|${color}|${checker}`;
  if (_cache.has(key)) return _cache.get(key);
  const grain = woodGrain();
  const m = new THREE.MeshStandardMaterial({
    color, metalness: 0.0, roughness: 0.62,
    map: grain,
    bumpMap: checker ? woodChecker() : grain,
    bumpScale: checker ? 0.9 : 0.18,
    envMap: gunEnv(), envMapIntensity: 0.22, // faint varnish sheen
  });
  _cache.set(key, m);
  return m;
}

export function ironSightGlow() {
  if (_cache.has('sight')) return _cache.get('sight');
  const m = new THREE.MeshStandardMaterial({ color: 0x35e84f, emissive: 0x22e83c, emissiveIntensity: 0.95, metalness: 0, roughness: 0.4 });
  _cache.set('sight', m);
  return m;
}

/**
 * Illuminated-optic glow (scope reticle/turret markings, rail tritium dots).
 * Same idea as ironSightGlow but parameterised — snipers run red, the rest of
 * the kit runs green. Cached per colour.
 */
export function scopeGlow(color = 0xff2a1e) {
  const key = `scopeglow|${color}`;
  if (_cache.has(key)) return _cache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.15, metalness: 0, roughness: 0.4 });
  _cache.set(key, m);
  return m;
}
