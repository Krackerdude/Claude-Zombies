/**
 * A tiny service container. We favour explicit constructor injection across the
 * codebase, but a locator is handy for wiring at the composition root (Engine)
 * and for giving ECS systems a single handle to shared managers without passing
 * eight constructor args around.
 *
 * Supports eager singletons (register) and lazy factories (registerFactory).
 */
export class ServiceLocator {
  #services = new Map();
  #factories = new Map();

  register(key, instance) {
    if (this.#services.has(key)) {
      throw new Error(`Service "${key}" already registered.`);
    }
    this.#services.set(key, instance);
    return instance;
  }

  registerFactory(key, factory) {
    this.#factories.set(key, factory);
  }

  has(key) {
    return this.#services.has(key) || this.#factories.has(key);
  }

  get(key) {
    if (this.#services.has(key)) return this.#services.get(key);

    const factory = this.#factories.get(key);
    if (factory) {
      const instance = factory(this);
      this.#services.set(key, instance); // memoize
      return instance;
    }
    throw new Error(`Service "${key}" not found. Did you register it?`);
  }

  dispose() {
    for (const service of this.#services.values()) {
      if (typeof service?.dispose === 'function') service.dispose();
    }
    this.#services.clear();
    this.#factories.clear();
  }
}

/** Canonical service keys to avoid stringly-typed typos at call sites. */
export const Service = Object.freeze({
  Events: 'events',
  Render: 'render',
  Scene: 'scene',
  Physics: 'physics',
  Input: 'input',
  Actions: 'actions',
  Assets: 'assets',
  World: 'world',
  Time: 'time',
  Camera: 'camera',
  GameState: 'gameState',
  Settings: 'settings',
  Nav: 'nav',
  Spawn: 'spawn',
  Hounds: 'hounds',
  Round: 'round',
  Weapons: 'weapons',
  Economy: 'economy',
  Powerups: 'powerups',
  Perks: 'perks',
  Tactical: 'tactical',
  Lethal: 'lethal',
});
