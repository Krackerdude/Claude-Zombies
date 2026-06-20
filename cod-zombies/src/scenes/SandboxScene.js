import * as THREE from 'three';
import { Service } from '../core/ServiceLocator.js';
import { EntityFactory } from './EntityFactory.js';
import { makeGridTexture } from '../util/textures.js';

/**
 * Builds the engine-test arena: a lit ground plane, perimeter walls, a stack of
 * dynamic crates to prove physics, and the player spawn. This stands in for a
 * real map and exercises every system end-to-end (render, physics, input,
 * camera, player, ECS).
 */
export function buildSandbox(engine) {
  const sceneMgr = engine.services.get(Service.Scene);
  const scene = sceneMgr.scene;
  const factory = new EntityFactory(engine.world);

  // --- lighting ---
  const hemi = new THREE.HemisphereLight(0x3a4a66, 0x0a0c10, 0.6);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xcdd6e0, 1.6);
  sun.position.set(18, 30, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera;
  c.left = -40; c.right = 40; c.top = 40; c.bottom = -40; c.near = 1; c.far = 100;
  scene.add(sun);

  // --- materials ---
  const gridTex = makeGridTexture();
  gridTex.repeat.set(20, 20);
  sceneMgr.sun = sun;
  sceneMgr.tunableTextures = [gridTex];
  const floorMat = new THREE.MeshStandardMaterial({ map: gridTex, roughness: 0.95, metalness: 0.0 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.9 });

  // --- ground & walls ---
  const arena = 40;
  factory.staticBox(new THREE.Vector3(0, -0.5, 0), { x: arena, y: 1, z: arena }, floorMat);

  const wallH = 4;
  const t = 1;
  const half = arena / 2;
  factory.staticBox(new THREE.Vector3(0, wallH / 2, -half), { x: arena, y: wallH, z: t }, wallMat);
  factory.staticBox(new THREE.Vector3(0, wallH / 2, half), { x: arena, y: wallH, z: t }, wallMat);
  factory.staticBox(new THREE.Vector3(-half, wallH / 2, 0), { x: t, y: wallH, z: arena }, wallMat);
  factory.staticBox(new THREE.Vector3(half, wallH / 2, 0), { x: t, y: wallH, z: arena }, wallMat);

  // A ramp/step to test slopes and autostep.
  factory.staticBox(new THREE.Vector3(6, 0.25, 6), { x: 4, y: 0.5, z: 4 });
  factory.staticBox(new THREE.Vector3(6, 0.75, 9), { x: 4, y: 1.5, z: 2 });

  // --- a stack of dynamic crates ---
  for (let i = 0; i < 6; i++) {
    factory.dynamicBox(
      new THREE.Vector3(-6 + (i % 2) * 0.6, 0.75 + i * 1.05, -6),
      { x: 1, y: 1, z: 1 },
    );
  }

  // --- player ---
  factory.player(new THREE.Vector3(0, 2, 0));

  return { sun };
}
