import { StorageAdapter } from './StorageAdapter.js';

/**
 * In-memory adapter. Holds records in a Map for the lifetime of the page — used
 * as the graceful fallback when IndexedDB is unavailable (private-mode quirks,
 * disabled storage, headless tests) so the game still runs with a profile that
 * simply doesn't survive a reload. Also the adapter the unit tests run against.
 *
 * Values are structured-cloned on the way in and out so callers can't mutate the
 * "stored" copy by reference — matching how a real serialising backend behaves.
 */
export class MemoryAdapter extends StorageAdapter {
  #store = new Map();

  async load(key) {
    const v = this.#store.get(key);
    return v === undefined ? null : clone(v);
  }

  async save(key, value) {
    this.#store.set(key, clone(value));
  }

  async remove(key) {
    this.#store.delete(key);
  }
}

function clone(v) {
  // structuredClone where available (Node 17+/modern browsers); JSON otherwise.
  if (typeof structuredClone === 'function') return structuredClone(v);
  return JSON.parse(JSON.stringify(v));
}
