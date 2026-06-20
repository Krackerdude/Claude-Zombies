/**
 * A lightweight, map-based ECS World.
 *
 * - Entities are opaque integer ids.
 * - Components are plain class instances; the constructor *is* the component
 *   type key, so there are no string tags to keep in sync.
 * - Systems are objects with optional init/fixedUpdate/update/lateUpdate hooks.
 *
 * This is deliberately archetype-free: storage is a Map<Type, Map<id, comp>>.
 * That is more than fast enough for the entity counts in a zombies map
 * (hundreds, not millions) and keeps the mental model simple. The query API is
 * stable, so a future archetype/SoA rewrite wouldn't touch system code.
 */
export class World {
  #nextId = 1;
  #alive = new Set();
  /** @type {Map<Function, Map<number, object>>} */
  #stores = new Map();
  #systems = [];
  #pendingDestroy = new Set();
  #locator;

  constructor(locator) {
    this.#locator = locator;
  }

  /** Shared service container, for systems that need managers. */
  get services() {
    return this.#locator;
  }

  // --- entities -----------------------------------------------------------

  createEntity() {
    const id = this.#nextId++;
    this.#alive.add(id);
    return id;
  }

  /** Defer destruction to a safe point (end of frame) to avoid mutating during iteration. */
  destroyEntity(id) {
    this.#pendingDestroy.add(id);
  }

  isAlive(id) {
    return this.#alive.has(id);
  }

  flushDestroyed() {
    if (this.#pendingDestroy.size === 0) return;
    for (const id of this.#pendingDestroy) {
      for (const store of this.#stores.values()) store.delete(id);
      this.#alive.delete(id);
    }
    this.#pendingDestroy.clear();
  }

  // --- components ---------------------------------------------------------

  #storeFor(Type) {
    let store = this.#stores.get(Type);
    if (!store) {
      store = new Map();
      this.#stores.set(Type, store);
    }
    return store;
  }

  /** Attach a component instance; returns it for chaining. */
  add(id, component) {
    this.#storeFor(component.constructor).set(id, component);
    return component;
  }

  remove(id, Type) {
    this.#storeFor(Type).delete(id);
  }

  get(id, Type) {
    return this.#storeFor(Type).get(id);
  }

  has(id, Type) {
    return this.#storeFor(Type).has(id);
  }

  /**
   * Yield entity ids that own *every* given component type. Iterates the
   * smallest matching store first to minimise checks.
   * @param  {...Function} Types
   */
  *query(...Types) {
    if (Types.length === 0) return;

    let smallest = this.#storeFor(Types[0]);
    for (let i = 1; i < Types.length; i++) {
      const s = this.#storeFor(Types[i]);
      if (s.size < smallest.size) smallest = s;
    }

    outer: for (const id of smallest.keys()) {
      for (const Type of Types) {
        if (!this.#storeFor(Type).has(id)) continue outer;
      }
      yield id;
    }
  }

  /** Convenience: first entity with the given components, or undefined. */
  first(...Types) {
    for (const id of this.query(...Types)) return id;
    return undefined;
  }

  // --- systems ------------------------------------------------------------

  registerSystem(system) {
    system.world = this;
    this.#systems.push(system);
    system.init?.();
    return system;
  }

  fixedUpdate(dt) {
    for (const s of this.#systems) s.fixedUpdate?.(dt);
    this.flushDestroyed();
  }

  update(dt) {
    for (const s of this.#systems) s.update?.(dt);
  }

  lateUpdate(dt) {
    for (const s of this.#systems) s.lateUpdate?.(dt);
    this.flushDestroyed();
  }

  dispose() {
    for (const s of this.#systems) s.dispose?.();
    this.#systems.length = 0;
    this.#stores.clear();
    this.#alive.clear();
    this.#pendingDestroy.clear();
  }
}
