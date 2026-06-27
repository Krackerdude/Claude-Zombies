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

let _env, _brushed, _stipple, _ridge, _wood, _checker, _plasma, _engrave;

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

/**
 * Ornate acanthus scrollwork for engraved firearms (the New Army revolver, fancy
 * lever guns, etc). Drives BOTH bump + roughness so the engraving catches the
 * light as recessed grooves with raised lips. Grayscale (luminance), so the
 * material `color` sets the tone. One shared map.
 */
export function engraveTexture() {
  if (_engrave) return _engrave;
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#9a9a9a'; x.fillRect(0, 0, 256, 256); // raised metal field
  x.lineCap = 'round';
  const scroll = (cx, cy, r0, turns, dir, col, lw) => {
    x.strokeStyle = col; x.lineWidth = lw;
    x.beginPath(); let first = true;
    for (let a = 0; a <= turns * Math.PI * 2; a += 0.22) {
      const r = r0 * (1 - (a / (turns * Math.PI * 2)) * 0.8);
      const px = cx + Math.cos(a) * r * dir, py = cy + Math.sin(a) * r;
      if (first) { x.moveTo(px, py); first = false; } else x.lineTo(px, py);
    }
    x.stroke();
  };
  for (let i = 0; i < 95; i++) {
    const cx = Math.random() * 256, cy = Math.random() * 256;
    const r0 = 5 + Math.random() * 14, turns = 0.8 + Math.random() * 1.4, dir = Math.random() < 0.5 ? 1 : -1;
    scroll(cx, cy, r0, turns, dir, 'rgba(42,42,42,0.85)', 2.4);           // recessed groove
    scroll(cx - 0.8, cy - 0.8, r0, turns, dir, 'rgba(228,228,228,0.4)', 0.9); // raised lip
  }
  for (let i = 0; i < 45; i++) { // connecting tendrils for density
    x.strokeStyle = 'rgba(48,48,48,0.6)'; x.lineWidth = 1.5;
    const x0 = Math.random() * 256, y0 = Math.random() * 256;
    x.beginPath(); x.moveTo(x0, y0);
    x.quadraticCurveTo(x0 + (Math.random() - 0.5) * 50, y0 + (Math.random() - 0.5) * 50, x0 + (Math.random() - 0.5) * 72, y0 + (Math.random() - 0.5) * 72);
    x.stroke();
  }
  _engrave = new THREE.CanvasTexture(c);
  _engrave.wrapS = _engrave.wrapT = THREE.RepeatWrapping;
  _engrave.repeat.set(2.5, 2.5);
  return _engrave;
}

// === the standard, parameterised by tone (maps shared, instances cached) ===
const _cache = new Map();

/** Engraved steel — gunMetal with the scrollwork bump/roughness laid in. */
export function engravedSteel(color = 0x4a4f57) {
  const key = `engrave|${color}`;
  if (_cache.has(key)) return _cache.get(key);
  const eng = engraveTexture();
  const m = new THREE.MeshStandardMaterial({
    color, metalness: 0.72, roughness: 0.4,
    roughnessMap: eng, bumpMap: eng, bumpScale: 0.6,
    envMap: gunEnv(), envMapIntensity: 0.75,
  });
  m.userData.papSwap = true; // engraved steel is gun-metal — Pack-a-Punch covers it
  _cache.set(key, m);
  return m;
}

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
  m.userData.papSwap = true; // the gun's metal body — Pack-a-Punch camo replaces it
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
  m.userData.papSwap = true; // dark metal (barrels, fittings) — covered by the camo
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
 * Energy-chamber plasma. A swirly emissive map (random soft blobs) so the glow
 * reads as churning plasma instead of a flat panel; the tone is the perk/weapon
 * energy colour. Used for the Ray Gun's chamber and any future energy core.
 */
export function plasmaTexture() {
  if (_plasma) return _plasma;
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#101010'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 70; i++) {
    const px = Math.random() * 128, py = Math.random() * 128, r = 5 + Math.random() * 22;
    const v = 120 + (Math.random() * 135 | 0);
    const grd = x.createRadialGradient(px, py, 0, px, py, r);
    grd.addColorStop(0, `rgba(${v},${v},${v},0.55)`); grd.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = grd; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
  }
  _plasma = new THREE.CanvasTexture(c);
  _plasma.wrapS = _plasma.wrapT = THREE.RepeatWrapping;
  return _plasma;
}

/** Glowing energy-core material, tinted by colour (maps shared, cached per tone). */
export function plasmaGlow(color = 0x46f060) {
  const key = `plasma|${color}`;
  if (_cache.has(key)) return _cache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color: 0x0a0a0a, emissive: color, emissiveIntensity: 2.4, emissiveMap: plasmaTexture(),
    metalness: 0.2, roughness: 0.4, transparent: true, opacity: 0.95,
  });
  _cache.set(key, m);
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

// === Pack-a-Punch camo: a single shared, ANIMATED holographic material that
// replaces gun-metal on a punched weapon. Flowing diagonal energy bands cycling
// crimson -> pink -> magenta -> gold, with a moving sparkle, injected as extra
// emissive on a normal PBR base so the gun's form still shades. =============
let _papCamo = null;
const PAP_FRAG_HEAD = `
uniform float uTime;
varying vec3 vPapPos;
vec3 papHue(float t){
  t = fract(t);
  vec3 crimson = vec3(0.55,0.0,0.12), pink = vec3(1.0,0.32,0.72);
  vec3 magenta = vec3(0.86,0.10,0.96), gold = vec3(1.0,0.80,0.22);
  if (t < 0.34) return mix(crimson, pink, t/0.34);
  if (t < 0.67) return mix(pink, magenta, (t-0.34)/0.33);
  return mix(magenta, gold, (t-0.67)/0.33);
}
`;
const PAP_FRAG_BODY = `
{
  float flow = vPapPos.x*6.0 + vPapPos.y*3.5 + vPapPos.z*2.0;
  float band = pow(0.5 + 0.5*sin(flow - uTime*5.0), 1.6);
  vec3 camo = papHue(flow*0.05 + uTime*0.14);
  totalEmissiveRadiance += camo * band * 1.35;
  float spark = pow(max(0.0, sin(vPapPos.x*55.0 + vPapPos.y*47.0 + uTime*14.0)), 30.0);
  totalEmissiveRadiance += vec3(1.0,0.92,1.0) * spark * 2.2;
}
`;
export function papCamo() {
  if (_papCamo) return _papCamo;
  const m = new THREE.MeshStandardMaterial({ color: 0x140810, metalness: 0.55, roughness: 0.3, envMap: gunEnv(), envMapIntensity: 0.7 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPapPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPapPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PAP_FRAG_HEAD)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + PAP_FRAG_BODY);
    m.userData.shader = shader;
  };
  m.userData.isPapCamo = true;
  _papCamo = m;
  return m;
}
/** Advance the shared camo animation (call once per frame). */
export function papCamoTick(dt) {
  const s = _papCamo && _papCamo.userData.shader;
  if (s) s.uniforms.uTime.value += dt;
}
