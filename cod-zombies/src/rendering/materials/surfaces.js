import * as THREE from 'three';
import { ps1Snap } from '../ps1.js';
import { makeNormalTexture } from '../../util/textures.js';

/**
 * Shared environment materials. Per the overhaul directive: build ONE material
 * per surface family (brick, floor, plank, metal) with its own procedural normal
 * map, then reuse the instance everywhere it fits — small per-call colour tweaks
 * are made on lightweight clones so the heavy maps stay shared on the GPU.
 *
 * All materials are PS1-vertex-snapped to stay in the established retro look, and
 * keep their normal map + tunable diffuse so the SettingsStore can adjust
 * anisotropy. Everything here is constructed lazily and is headless-safe (normal
 * maps are CPU DataTextures; nothing touches a GL context until first render).
 */

let _brickNormal = null;
let _plankNormal = null;
let _concreteNormal = null;
let _metalNormal = null;

const normal = (cache, opts) => cache ?? makeNormalTexture(opts);

/** Normal maps exposed so the scene can register them for anisotropy tuning. */
export function sharedNormalMaps() {
  return [_brickNormal, _plankNormal, _concreteNormal, _metalNormal].filter(Boolean);
}

/** Brick perimeter walls — running-bond mortar relief. One shared instance. */
export function brickWall(color = 0x2a323d, repeat = [3, 2]) {
  _brickNormal = normal(_brickNormal, { size: 256, freq: 5, strength: 1.1, kind: 'brick' });
  _brickNormal.repeat.set(repeat[0], repeat[1]);
  return ps1Snap(new THREE.MeshStandardMaterial({
    color, roughness: 0.92, metalness: 0.0,
    normalMap: _brickNormal, normalScale: new THREE.Vector2(0.8, 0.8),
  }));
}

/** Boarded-window planks — long grain + seams. One shared instance for them all. */
export function plankWood(color = 0x5a4632) {
  _plankNormal = normal(_plankNormal, { size: 256, freq: 6, strength: 1.0, kind: 'planks' });
  return ps1Snap(new THREE.MeshStandardMaterial({
    color, roughness: 1.0, metalness: 0.0,
    normalMap: _plankNormal, normalScale: new THREE.Vector2(0.7, 0.7),
  }));
}

/** Floor — keeps its diffuse grid map, adds a rain-slicked sheen: low roughness
 *  so the lamps + lightning streak across it, with a ripple normal for the wet
 *  break-up (the Silent Hill street look). */
export function concreteFloor(map, repeat = [12, 12]) {
  _concreteNormal = normal(_concreteNormal, { size: 256, freq: 10, strength: 0.7, kind: 'noise' });
  _concreteNormal.repeat.set(repeat[0], repeat[1]);
  return ps1Snap(new THREE.MeshStandardMaterial({
    map, roughness: 0.42, metalness: 0.1,
    normalMap: _concreteNormal, normalScale: new THREE.Vector2(0.85, 0.85),
  }));
}

/** Painted metal — railings, props. Faint orange-peel relief, slight sheen. */
export function paintedMetal(color = 0x20242b) {
  _metalNormal = normal(_metalNormal, { size: 128, freq: 14, strength: 0.4, kind: 'noise' });
  return ps1Snap(new THREE.MeshStandardMaterial({
    color, roughness: 0.55, metalness: 0.6,
    normalMap: _metalNormal, normalScale: new THREE.Vector2(0.3, 0.3),
  }));
}
