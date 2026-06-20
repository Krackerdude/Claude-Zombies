import { defaultBindings } from '../config/keybinds.js';

/**
 * Semantic input layer. Gameplay asks "is JUMP active?" not "is Space down?".
 * Bindings are action -> [keyCodes]; the keybinds menu mutates these via
 * rebind()/addBinding() and everything downstream updates automatically.
 *
 * Bindings are persisted to localStorage so player choices survive reloads.
 */
const STORAGE_KEY = 'necropolis.bindings.v1';

export class InputActions {
  #input;
  /** @type {Record<string, string[]>} */
  #bindings;

  constructor(inputManager) {
    this.#input = inputManager;
    this.#bindings = this.#load() ?? structuredClone(defaultBindings);
  }

  // --- queries ------------------------------------------------------------

  /** True while any key bound to the action is held. */
  active(action) {
    const codes = this.#bindings[action];
    if (!codes) return false;
    for (const code of codes) if (this.#input.isDown(code)) return true;
    return false;
  }

  /** True only on the frame a bound key went down. */
  pressed(action) {
    const codes = this.#bindings[action];
    if (!codes) return false;
    for (const code of codes) if (this.#input.wasPressed(code)) return true;
    return false;
  }

  released(action) {
    const codes = this.#bindings[action];
    if (!codes) return false;
    for (const code of codes) if (this.#input.wasReleased(code)) return true;
    return false;
  }

  /** -1 / 0 / +1 helper for an axis defined by two opposing actions. */
  axis(negativeAction, positiveAction) {
    return (this.active(positiveAction) ? 1 : 0) - (this.active(negativeAction) ? 1 : 0);
  }

  // --- rebinding (used by the future options menu) ------------------------

  getBindings() {
    return structuredClone(this.#bindings);
  }

  /** Replace all key codes for an action. */
  rebind(action, codes) {
    this.#bindings[action] = [...codes];
    this.#save();
  }

  addBinding(action, code) {
    (this.#bindings[action] ??= []).push(code);
    this.#save();
  }

  resetToDefaults() {
    this.#bindings = structuredClone(defaultBindings);
    this.#save();
  }

  #save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#bindings));
    } catch { /* storage may be unavailable; non-fatal */ }
  }

  #load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
