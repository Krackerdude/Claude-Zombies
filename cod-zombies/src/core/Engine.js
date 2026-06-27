import { ServiceLocator, Service } from './ServiceLocator.js';
import { EventBus } from './EventBus.js';
import { Time } from './Time.js';
import { GameLoop } from './GameLoop.js';

import { World } from '../ecs/World.js';
import { RenderManager } from '../rendering/RenderManager.js';
import { SceneManager } from '../rendering/SceneManager.js';
import { RenderSystem } from '../rendering/RenderSystem.js';
import { PhysicsManager } from '../physics/PhysicsManager.js';
import { PhysicsSystem } from '../physics/PhysicsSystem.js';
import { InputManager } from '../input/InputManager.js';
import { InputActions } from '../input/InputActions.js';
import { AssetManager } from '../assets/AssetManager.js';
import { CameraController } from '../camera/CameraController.js';
import { PlayerSystem } from '../player/PlayerSystem.js';
import { GameState } from './GameState.js';
import { SettingsStore } from '../settings/SettingsStore.js';
import { createProfileService } from '../profile/index.js';

import { PhysicsConfig } from '../config/index.js';

/**
 * Composition root. Constructs and wires every manager, registers them in the
 * ServiceLocator, builds the ECS World, and registers systems in a deliberate
 * phase order. Owns the GameLoop and exposes start/stop.
 *
 * System order (fixed phase): PlayerSystem -> PhysicsSystem. The player sets
 * its kinematic target, then the physics step applies it. RenderSystem draws
 * separately in the render phase so it can use the interpolation alpha.
 *
 * Async because the renderer (WebGPU init) and physics (WASM init) both need
 * to await before the first frame.
 */
export class Engine {
  /** @type {ServiceLocator} */
  services;
  /** @type {World} */
  world;
  /** @type {Time} */
  time;

  #loop;
  #renderSystem;

  static async create(canvas) {
    const engine = new Engine();
    await engine.#init(canvas);
    return engine;
  }

  async #init(canvas) {
    this.services = new ServiceLocator();
    this.time = new Time();
    this.time.fixedDeltaTime = PhysicsConfig.fixedStep;

    // --- managers (async ones first) ---
    const render = await new RenderManager(canvas).init();
    const physics = await PhysicsManager.create();
    const scene = new SceneManager();
    const input = new InputManager(canvas).init();
    const actions = new InputActions(input);
    const assets = new AssetManager();
    const events = new EventBus();

    // --- register services ---
    this.services.register(Service.Time, this.time);
    this.services.register(Service.Events, events);
    this.services.register(Service.Render, render);
    this.services.register(Service.Scene, scene);
    this.services.register(Service.Physics, physics);
    this.services.register(Service.Input, input);
    this.services.register(Service.Actions, actions);
    this.services.register(Service.Assets, assets);

    // App state + settings must exist before systems init (systems read them).
    const gameState = new GameState(events);
    this.services.register(Service.GameState, gameState);
    const settings = new SettingsStore(this);
    this.services.register(Service.Settings, settings);

    // Persistent player profile (level, currency, unlocks, achievements,
    // emblems). Async: opens IndexedDB and loads/migrates the saved document
    // before systems come up so they can read progression at init.
    const profile = await createProfileService({ events });
    this.services.register(Service.Profile, profile);

    // --- ECS world + systems ---
    this.world = new World(this.services);
    this.services.register(Service.World, this.world);

    // Fixed-phase order matters (see class docstring).
    this.world.registerSystem(new PlayerSystem());
    this.world.registerSystem(new PhysicsSystem());
    // Variable/late phase.
    this.world.registerSystem(new CameraController());
    this.#renderSystem = this.world.registerSystem(new RenderSystem());

    // --- loop ---
    this.#loop = new GameLoop({
      time: this.time,
      fixedUpdate: (dt) => this.world.fixedUpdate(dt),
      update: (dt) => {
        this.world.update(dt);
        this.world.lateUpdate(dt);
        input.endFrame();
      },
      render: (alpha) => this.#renderSystem.draw(alpha),
    });
  }

  start() { this.#loop.start(); }
  stop() { this.#loop.stop(); }

  dispose() {
    this.#loop?.stop();
    this.world?.dispose();
    this.services?.dispose();
  }
}
