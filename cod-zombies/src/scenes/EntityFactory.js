import * as THREE from 'three';
import { Transform, Renderable, RigidBodyRef, PlayerTag, ZombieTag } from '../ecs/components/index.js';
import { Service } from '../core/ServiceLocator.js';
import { PlayerConfig } from '../config/index.js';
import { ZombieConfig } from '../config/zombies.js';
import { ps1Snap } from '../rendering/ps1.js';
import { buildZombieRig } from './zombieRig.js';
import { randomZombieLook } from './zombieAssets.js';

/**
 * Prefab-style factory functions that assemble entities from components.
 * Keeping construction here (rather than scattered `world.add` calls) gives a
 * single place to evolve archetypes as gameplay systems are added.
 */
export class EntityFactory {
  #world;
  #physics;
  constructor(world) {
    this.#world = world;
    this.#physics = world.services.get(Service.Physics);
  }

  /** A static, collidable box (ground tile, wall, crate, etc.). */
  staticBox(position, size, material) {
    const half = new THREE.Vector3(size.x / 2, size.y / 2, size.z / 2);
    const handle = this.#physics.createStaticBox(position, half);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      material ?? new THREE.MeshStandardMaterial({ color: 0x2a3038 }),
    );
    mesh.castShadow = mesh.receiveShadow = true;

    const id = this.#world.createEntity();
    this.#world.add(id, new Transform(position));
    this.#world.add(id, new Renderable(mesh, { interpolate: false }));
    this.#world.add(id, new RigidBodyRef(handle));
    return id;
  }

  /** A dynamic, physics-simulated box. */
  dynamicBox(position, size, material) {
    const half = new THREE.Vector3(size.x / 2, size.y / 2, size.z / 2);
    const handle = this.#physics.createDynamicBox(position, half);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      material ?? new THREE.MeshStandardMaterial({ color: 0x8a4636, roughness: 0.8 }),
    );
    mesh.castShadow = mesh.receiveShadow = true;

    const id = this.#world.createEntity();
    this.#world.add(id, new Transform(position));
    this.#world.add(id, new Renderable(mesh));
    this.#world.add(id, new RigidBodyRef(handle));
    return id;
  }

  /** A nav-driven zombie: low-poly animated humanoid + tag + a kinematic
   *  capsule so the player physically collides with it (can't run through). */
  zombie(position, stats) {
    const group = buildZombieRig(randomZombieLook());
    const pos = position.clone ? position.clone() : new THREE.Vector3(position.x, position.y, position.z);

    // kinematic capsule the player's character controller collides with
    const handle = this.#physics.createCharacterCapsule(
      { x: pos.x, y: 0.9, z: pos.z },
      { radius: 0.32, halfHeight: 0.5 },
    );

    const id = this.#world.createEntity();
    this.#world.add(id, new Transform(pos));
    this.#world.add(id, new Renderable(group, { interpolate: true }));
    this.#world.add(id, new ZombieTag(stats));
    this.#world.add(id, new RigidBodyRef(handle));
    return id;
  }

  /** The local player: kinematic capsule + tag. No mesh (first person). */
  player(position) {
    const handle = this.#physics.createCharacterCapsule(position, {
      radius: PlayerConfig.capsuleRadius,
      halfHeight: PlayerConfig.capsuleHeight / 2,
    });

    const id = this.#world.createEntity();
    this.#world.add(id, new Transform(position));
    this.#world.add(id, new RigidBodyRef(handle));
    this.#world.add(id, new PlayerTag());
    return id;
  }
}
