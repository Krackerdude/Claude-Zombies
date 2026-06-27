import { StorageAdapter } from './StorageAdapter.js';

/**
 * IndexedDB-backed storage. Chosen over localStorage because the profile will
 * grow to hold structured emblem layer data and stat blobs — IndexedDB stores
 * real objects (no JSON.stringify ceiling, no main-thread string serialisation)
 * and has a far larger quota.
 *
 * One database, one object store keyed by profile id. The whole profile is a
 * single record per id; we don't shard it into rows because the game always
 * loads and saves the document as a unit. The promisified open/get/put wrappers
 * keep the callers in async/await land.
 */
const DB_NAME = 'necropolis';
const DB_VERSION = 1;
const STORE = 'profiles';

export class IndexedDbAdapter extends StorageAdapter {
  #db = null;

  static isAvailable() {
    try { return typeof indexedDB !== 'undefined' && indexedDB !== null; }
    catch { return false; }
  }

  async init() {
    if (this.#db) return;
    this.#db = await openDb();
  }

  async load(key) {
    const db = this.#db;
    if (!db) return null;
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async save(key, value) {
    const db = this.#db;
    if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      // Store under an explicit key (out-of-line) so `value` stays a clean POJO.
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async remove(key) {
    const db = this.#db;
    if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
}
