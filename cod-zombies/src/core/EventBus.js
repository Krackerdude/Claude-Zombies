/**
 * Minimal typed-ish event bus for decoupled cross-system communication.
 * Use sparingly — prefer direct dependency injection for hot paths. The bus is
 * for fan-out notifications ("player died", "round started", "asset loaded")
 * where the publisher shouldn't know its listeners.
 */
export class EventBus {
  /** @type {Map<string, Set<Function>>} */
  #handlers = new Map();

  on(type, handler) {
    let set = this.#handlers.get(type);
    if (!set) {
      set = new Set();
      this.#handlers.set(type, set);
    }
    set.add(handler);
    // Return an unsubscribe disposer for ergonomic cleanup.
    return () => this.off(type, handler);
  }

  once(type, handler) {
    const off = this.on(type, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off(type, handler) {
    this.#handlers.get(type)?.delete(handler);
  }

  emit(type, payload) {
    const set = this.#handlers.get(type);
    if (!set) return;
    // Copy to a snapshot so handlers can subscribe/unsubscribe mid-emit safely.
    for (const handler of [...set]) handler(payload);
  }

  clear() {
    this.#handlers.clear();
  }
}
