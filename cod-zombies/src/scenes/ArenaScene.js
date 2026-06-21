import * as THREE from 'three';
import { Service } from '../core/ServiceLocator.js';
import { EntityFactory } from './EntityFactory.js';
import { makeGridTexture } from '../util/textures.js';
import { NavGraph } from '../ai/NavGraph.js';
import { Barrier } from '../ai/Barrier.js';
import { SpawnManager } from '../ai/SpawnManager.js';
import { RoundManager } from '../ai/RoundManager.js';
import { ZombieSystem } from '../ai/ZombieSystem.js';
import { ZombieAnimSystem } from '../ai/ZombieAnimSystem.js';
import { CorpseSystem } from '../ai/CorpseSystem.js';
import { RoundSystem } from '../ai/RoundSystem.js';
import { WeaponSystem } from '../weapons/WeaponSystem.js';
import { ProjectileSystem } from '../weapons/ProjectileSystem.js';
import { EconomySystem } from '../weapons/EconomySystem.js';
import { buildMysteryBox } from './mysteryBox.js';
import { MysteryBoxSystem } from './MysteryBoxSystem.js';
import { PowerupSystem } from '../powerups/PowerupSystem.js';
import { GadgetSystem } from '../gadgets/GadgetSystem.js';
import { PerkSystem } from '../perks/PerkSystem.js';
import { BarrierFxSystem } from './BarrierFxSystem.js';
import { weaponCost, weaponCategory } from '../weapons/catalog.js';
import { makeChalkTexture, makeGlowTexture } from '../util/chalk.js';
import { PlayerTag, Transform } from '../ecs/components/index.js';
import { brickWall, plankWood, concreteFloor, sharedNormalMaps } from '../rendering/materials/surfaces.js';
import { AtmosphereSystem } from '../rendering/AtmosphereSystem.js';
import { AmbientParticles } from '../rendering/AmbientParticles.js';
import { DecalSystem } from '../rendering/DecalSystem.js';

const B = 10; // building half-extent
const T = 1; // wall thickness
const WH = 1; // window/door half-gap
const BOUNDS = { minX: -22, minZ: -22, maxX: 22, maxZ: 22 };

/**
 * The survival arena. A walled building with four boardable windows and one
 * interior door, ringed by exterior spawn points. Geometry and the navigation
 * grid are generated from the same declarative layout, so they can never drift:
 * every wall both renders a collider and stamps solid cells; every gap both
 * leaves an opening and registers a Barrier the nav graph gates on.
 */
export function buildArena(engine) {
  const sceneMgr = engine.services.get(Service.Scene);
  const scene = sceneMgr.scene;
  const events = engine.services.get(Service.Events);
  const factory = new EntityFactory(engine.world);

  // --- atmosphere ---
  // Moody but readable. The horror sells through palette + grade, not by making
  // the player blind. Cool ambient fill so nothing is pure black, a strong key
  // "moon", and warm practical point lights inside + around the building.
  scene.background = new THREE.Color(0x0a0d14);
  scene.fog = new THREE.FogExp2(0x0a0d14, 0.011);

  scene.add(new THREE.HemisphereLight(0x6678a0, 0x141820, 0.9));
  scene.add(new THREE.AmbientLight(0x3a4458, 0.55));

  const sun = new THREE.DirectionalLight(0xcdd8ea, 1.5);
  sun.position.set(-14, 24, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26; sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26; sun.shadow.camera.bottom = -26;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);
  sceneMgr.sun = sun;
  // hand the key light to the renderer so the god-ray stage knows where the
  // "moon" sits on screen (safely ignored when post-processing is unavailable)
  engine.services.get(Service.Render).setSunLight?.(sun);

  // warm practical lights so the interior + perimeter actually read. Lights can
  // opt into the AtmosphereSystem's flicker via userData.flicker; the warm
  // interior bulbs gutter like bad wiring, the cool fills breathe slowly.
  const flickerLights = [];
  const lamp = (x, z, color = 0xffae5c, intensity = 6, dist = 16, flicker = null) => {
    const l = new THREE.PointLight(color, intensity, dist, 2);
    l.position.set(x, 3.2, z);
    if (flicker) { l.userData.flicker = flicker; flickerLights.push(l); }
    scene.add(l);
    return l;
  };
  const guttering = { depth: 1.0, speed: 1.0, drop: 0.9 }; // warm bulbs, bad wiring
  const breathing = { depth: 0.5, speed: 0.28, drop: 0 };  // cool fills, slow pulse
  lamp(-5, -5, 0xffae5c, 6, 16, guttering); lamp(5, 5, 0xffae5c, 6, 16, guttering);
  lamp(-5, 5, 0xff8a4c, 6, 16, guttering); lamp(5, -5, 0xff8a4c, 6, 16, guttering); // interior corners
  lamp(0, 0, 0xc9d6ff, 4, 12, breathing); // cool center fill
  lamp(0, 16, 0x9fb4ff, 5, 20); lamp(0, -16, 0x9fb4ff, 5, 20); // exterior approaches
  lamp(16, 0, 0x9fb4ff, 5, 20); lamp(-16, 0, 0x9fb4ff, 5, 20);

  // --- floor ---
  const gridTex = makeGridTexture();
  gridTex.repeat.set(44, 44);
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(44, 1, 44),
    concreteFloor(gridTex, [22, 22]),
  );
  floor.position.y = -0.5;
  floor.receiveShadow = true;
  scene.add(floor);
  engine.services.get(Service.Physics).createStaticBox({ x: 0, y: -0.5, z: 0 }, { x: 22, y: 0.5, z: 22 });

  // register the procedural normal maps (built lazily by the materials below)
  // for anisotropy tuning alongside the floor grid.
  sceneMgr.tunableTextures = [gridTex];

  // --- nav graph (generated from the layout below) ---
  const nav = new NavGraph(BOUNDS);
  const wallMat = brickWall(0x2a323d, [6, 3]);
  // one shared plank material for every boarded window (all the same stock)
  const plankMat = plankWood(0x5a4632);

  const wall = (minX, minZ, maxX, maxZ, h = 3) => {
    const sx = maxX - minX, sz = maxZ - minZ;
    const pos = { x: (minX + maxX) / 2, y: h / 2, z: (minZ + maxZ) / 2 };
    factory.staticBox(pos, { x: sx, y: h, z: sz }, wallMat);
    nav.markSolidRect(minX, minZ, maxX, maxZ);
  };

  // perimeter walls, each split around a centred window gap (width 2)
  // north / south (run along x)
  wall(-B - 0.5, B - 0.5, -WH, B + 0.5); wall(WH, B - 0.5, B + 0.5, B + 0.5);
  wall(-B - 0.5, -B - 0.5, -WH, -B + 0.5); wall(WH, -B - 0.5, B + 0.5, -B + 0.5);
  // east / west (run along z)
  wall(B - 0.5, -B - 0.5, B + 0.5, -WH); wall(B - 0.5, WH, B + 0.5, B + 0.5);
  wall(-B - 0.5, -B - 0.5, -B + 0.5, -WH); wall(-B - 0.5, WH, -B + 0.5, B + 0.5);

  // --- barriers: boarded windows that gate the interior (playable) from the
  // exterior spawn void (non-playable). Each gets a static collider so the
  // PLAYER can never pass (boards only gate zombie entry), plus a stack of
  // plank meshes that appear/disappear with the board count. ---
  const physics = engine.services.get(Service.Physics);
  const barrierPlanks = new Map(); // barrier -> THREE.Mesh[]
  const addWindow = (id, footprint, planksColor) => {
    const cx = (footprint.minX + footprint.maxX) / 2;
    const cz = (footprint.minZ + footprint.maxZ) / 2;
    const barrier = new Barrier({ id, position: new THREE.Vector3(cx, 1.2, cz) });
    nav.addBarrier(barrier, footprint);

    // player block (zombies are nav-driven and ignore this)
    const hx = Math.max((footprint.maxX - footprint.minX) / 2, 0.5);
    const hz = Math.max((footprint.maxZ - footprint.minZ) / 2, 0.5);
    physics.createStaticBox({ x: cx, y: 1.4, z: cz }, { x: hx, y: 1.4, z: hz });

    // plank visuals — one mesh per board, stacked up the gap
    const alongX = (footprint.maxX - footprint.minX) >= (footprint.maxZ - footprint.minZ);
    const w = alongX ? (footprint.maxX - footprint.minX) + 0.5 : 0.16;
    const d = alongX ? 0.16 : (footprint.maxZ - footprint.minZ) + 0.5;
    const planks = [];
    for (let i = 0; i < barrier.maxBoards; i++) {
      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.2, d),
        plankMat,
      );
      plank.position.set(cx, 0.5 + i * 0.32, cz);
      plank.userData.homeY = plank.position.y;
      const tilt = (i % 2 ? 1 : -1) * 0.05;
      if (alongX) plank.rotation.z = tilt; else plank.rotation.x = tilt;
      plank.castShadow = true;
      scene.add(plank);
      planks.push(plank);
    }
    barrierPlanks.set(barrier, planks);
    return barrier;
  };

  addWindow('win_n', { minX: -WH, minZ: B - 0.5, maxX: WH, maxZ: B + 0.5 }, 0x5a4632);
  addWindow('win_s', { minX: -WH, minZ: -B - 0.5, maxX: WH, maxZ: -B + 0.5 }, 0x5a4632);
  addWindow('win_e', { minX: B - 0.5, minZ: -WH, maxX: B + 0.5, maxZ: WH }, 0x5a4632);
  addWindow('win_w', { minX: -B - 0.5, minZ: -WH, maxX: -B + 0.5, maxZ: WH }, 0x5a4632);

  // planks rise out of the ground and snap into place when repaired
  engine.world.registerSystem(new BarrierFxSystem(barrierPlanks, events));

  // dynamic-light atmosphere: gutter the warm bulbs, breathe the cool fills.
  // The shared normal maps join the tunable-texture set for anisotropy control.
  engine.world.registerSystem(new AtmosphereSystem(flickerLights));
  sceneMgr.tunableTextures.push(...sharedNormalMaps());

  // ambient haze + persistent ground decals (blood pools, scorch). Both are
  // isolated, event-driven, and individually disable-able for performance.
  engine.world.registerSystem(new AmbientParticles());
  engine.world.registerSystem(new DecalSystem());

  // --- exterior spawn points (outside the building) ---
  const spawnPoints = [
    new THREE.Vector3(0, 0, 15), new THREE.Vector3(5, 0, 16), new THREE.Vector3(-5, 0, 16),
    new THREE.Vector3(0, 0, -15), new THREE.Vector3(5, 0, -16), new THREE.Vector3(-5, 0, -16),
    new THREE.Vector3(15, 0, 0), new THREE.Vector3(16, 0, 5), new THREE.Vector3(16, 0, -5),
    new THREE.Vector3(-15, 0, 0), new THREE.Vector3(-16, 0, 5), new THREE.Vector3(-16, 0, -5),
  ];

  // --- economy props: wall-buys (chalk gun outlines) + mystery box ---
  const chalkCache = new Map();
  const chalkFor = (cat) => { if (!chalkCache.has(cat)) chalkCache.set(cat, makeChalkTexture(cat)); return chalkCache.get(cat); };
  const glowTex = makeGlowTexture();

  const wallBuys = [];
  const addWallBuy = (key, x, y, z, rotY) => {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotY;
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.7, 1.7),
      new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    glow.position.z = -0.02;
    const chalk = new THREE.Mesh(
      new THREE.PlaneGeometry(2.1, 1.05),
      new THREE.MeshBasicMaterial({ map: chalkFor(weaponCategory(key)), transparent: true, depthWrite: false }),
    );
    group.add(glow, chalk);
    scene.add(group);
    wallBuys.push({ id: 'wb_' + key, key, cost: weaponCost(key), position: new THREE.Vector3(x, y, z) });
  };

  // placed on interior wall faces, normals pointing into the room
  addWallBuy('galil', -5, 1.6, -B + 0.55, 0); // south wall, faces +z
  addWallBuy('dsr', 5, 1.6, B - 0.55, Math.PI); // north wall, faces -z
  addWallBuy('olympia', -B + 0.55, 1.6, 4, Math.PI / 2); // west wall, faces +x
  addWallBuy('vector', B - 0.55, 1.6, -4, -Math.PI / 2); // east wall, faces -x

  // mystery box in a corner — classic wooden crate on cinder blocks
  const boxPos = new THREE.Vector3(-6, 0, 6);
  const boxRig = buildMysteryBox();
  boxRig.position.copy(boxPos);
  scene.add(boxRig);
  physics.createStaticBox({ x: boxPos.x, y: 0.66, z: boxPos.z }, { x: 1.0, y: 0.66, z: 0.42 });

  // live state is published here by the EconomySystem; the MysteryBoxSystem reads it
  const economy = {
    wallBuys,
    box: { position: boxPos, rig: boxRig, state: 'idle', spinProgress: 0, holdProgress: 0, displayKey: null, resultKey: null },
  };

  // --- player ---
  const playerId = factory.player(new THREE.Vector3(6, 1.2, -6));
  const getPlayerPos = () => engine.world.get(playerId, Transform).position;

  // --- AI services (registered before the systems that read them) ---
  engine.services.register(Service.Nav, nav);
  const spawn = new SpawnManager({ world: engine.world, factory, events, spawnPoints, getPlayerPos });
  engine.services.register(Service.Spawn, spawn);
  const round = new RoundManager(spawn, events);
  engine.services.register(Service.Round, round);
  engine.services.register(Service.Economy, economy);

  // --- AI systems ---
  const powerups = new PowerupSystem();
  engine.services.register(Service.Powerups, powerups);
  engine.world.registerSystem(powerups);
  engine.world.registerSystem(new ZombieSystem());
  engine.world.registerSystem(new ZombieAnimSystem());
  engine.world.registerSystem(new CorpseSystem());
  engine.world.registerSystem(new RoundSystem());

  // --- weapons + economy ---
  const weaponSystem = new WeaponSystem();
  engine.services.register(Service.Weapons, weaponSystem);
  engine.world.registerSystem(weaponSystem);
  engine.world.registerSystem(new ProjectileSystem());
  engine.world.registerSystem(new GadgetSystem());
  const perkSystem = new PerkSystem();
  engine.services.register(Service.Perks, perkSystem);
  engine.world.registerSystem(perkSystem);
  engine.world.registerSystem(new EconomySystem());
  engine.world.registerSystem(new MysteryBoxSystem());

  return { nav, playerId };
}
