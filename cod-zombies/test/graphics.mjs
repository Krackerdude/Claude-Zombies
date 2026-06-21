// Graphics-overhaul unit tests. Covers the parts of the rendering overhaul that
// are pure logic / CPU data and therefore run headless: procedural normal-map
// generation, the shared-material library's instance reuse, and the dynamic
// AtmosphereSystem flicker. The WebGL post-processing stack itself needs a GL
// context (verified via `vite build` + in-browser), so it isn't exercised here.
//
// Run: node test/graphics.mjs

import * as THREE from 'three';
import { makeNormalTexture } from '../src/util/textures.js';
import { brickWall, plankWood, concreteFloor, paintedMetal, sharedNormalMaps } from '../src/rendering/materials/surfaces.js';
import { AtmosphereSystem } from '../src/rendering/AtmosphereSystem.js';

let failures = 0;
const ok = (m) => console.log('  ok  :', m);
const fail = (m, e) => { console.error('  FAIL:', m, e ? '\n        ' + (e.stack || e) : ''); failures++; };
function guard(label, fn) { try { fn(); ok(label); } catch (e) { fail(label, e); } }

console.log('\n[1] procedural normal maps build as flat-ish tangent-space DataTextures');
guard('makeNormalTexture returns a sized DataTexture with mostly +Z normals', () => {
  const size = 64;
  const tex = makeNormalTexture({ size, freq: 6, strength: 1, kind: 'brick' });
  if (!(tex instanceof THREE.DataTexture)) throw new Error('not a DataTexture');
  if (tex.image.width !== size || tex.image.height !== size) throw new Error('wrong dimensions');
  const d = tex.image.data;
  if (d.length !== size * size * 4) throw new Error('wrong buffer length');
  let blue = 0;
  for (let i = 2; i < d.length; i += 4) blue += d[i];
  const meanBlue = blue / (size * size);
  // tangent-space normals point out of the surface => B channel sits high
  if (meanBlue < 150) throw new Error(`normals not surface-aligned (mean B=${meanBlue.toFixed(0)})`);
});
guard('all three height kinds produce finite, varied relief', () => {
  for (const kind of ['noise', 'brick', 'planks']) {
    const t = makeNormalTexture({ size: 32, kind });
    const d = t.image.data;
    let min = 255, max = 0;
    for (let i = 0; i < d.length; i += 4) { min = Math.min(min, d[i]); max = Math.max(max, d[i]); }
    if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error(`${kind}: non-finite`);
    if (max - min < 2) throw new Error(`${kind}: no horizontal relief (flat R channel)`);
  }
});

console.log('\n[2] shared surface materials reuse ONE normal map per family');
guard('repeated factory calls share the cached normal-map instance', () => {
  const a = brickWall(0x223344);
  const b = brickWall(0x554433);
  if (a === b) throw new Error('expected distinct material instances');
  if (a.normalMap == null) throw new Error('brick material lost its normal map');
  if (a.normalMap !== b.normalMap) throw new Error('brick normal map was not shared between calls');

  const grid = makeNormalTexture({ size: 8 }); // stand-in diffuse
  const f1 = concreteFloor(grid), f2 = concreteFloor(grid);
  if (f1.normalMap !== f2.normalMap) throw new Error('floor normal map not shared');
  const p1 = plankWood(), p2 = plankWood();
  if (p1.normalMap !== p2.normalMap) throw new Error('plank normal map not shared');
  if (a.normalMap === f1.normalMap) throw new Error('brick + floor must not share the same relief');
});
guard('sharedNormalMaps reports the live, in-use textures', () => {
  paintedMetal();
  const maps = sharedNormalMaps();
  if (maps.length < 4) throw new Error(`expected >=4 shared maps, got ${maps.length}`);
  if (maps.some((m) => !(m instanceof THREE.DataTexture))) throw new Error('non-DataTexture in shared set');
});

console.log('\n[3] AtmosphereSystem flickers within bounds and restores on disable');
guard('flicker stays inside the configured depth band and varies over time', () => {
  const light = { intensity: 6, userData: { flicker: { depth: 1, speed: 1, drop: 0 } } };
  const cfg = { enabled: true, flickerSpeed: 9, flickerDepth: 0.16 };
  const sys = new AtmosphereSystem([light], cfg);
  const base = 6, lo = base * (1 - 0.16) - 1e-6, hi = base + 1e-6;
  const seen = new Set();
  for (let i = 0; i < 120; i++) {
    sys.update(1 / 60);
    if (light.intensity < lo || light.intensity > hi) throw new Error(`intensity ${light.intensity.toFixed(3)} left the band [${lo.toFixed(3)}, ${hi.toFixed(3)}]`);
    seen.add(light.intensity.toFixed(3));
  }
  if (seen.size < 10) throw new Error('flicker is static (not enough variation)');
});
guard('disabling the system settles lights back to their authored intensity', () => {
  const light = { intensity: 5, userData: { flicker: { depth: 1, speed: 2, drop: 0.5 } } };
  const cfg = { enabled: true, flickerSpeed: 9, flickerDepth: 0.2 };
  const sys = new AtmosphereSystem([light], cfg);
  for (let i = 0; i < 30; i++) sys.update(1 / 60);
  cfg.enabled = false;
  sys.update(1 / 60);
  if (Math.abs(light.intensity - 5) > 1e-9) throw new Error(`did not restore base intensity (got ${light.intensity})`);
});

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}\n`);
process.exit(failures === 0 ? 0 : 1);
