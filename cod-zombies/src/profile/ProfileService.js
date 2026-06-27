import { defaultProfile } from './schema.js';
import { migrateProfile } from './migrations.js';

/**
 * ProfileService — the single handle every progression system uses to read and
 * persist player data. It owns the live, in-memory profile document and hides
 * the storage backend behind a StorageAdapter, so the game code never knows
 * whether the bytes land in IndexedDB or a cloud account.
 *
 * Shape of use:
 *   const profile = await createProfileService(events);   // index.js factory
 *   profile.get('currency.essence', 0);
 *   profile.set('currency.essence', 120);                 // schedules a save
 *   profile.update(d => { d.stats.kills = (d.stats.kills||0) + 1; });
 *
 * Writes are coalesced: `set`/`update` mutate immediately and schedule a single
 * debounced flush, so a burst of changes in one frame costs one disk write. A
 * flush is also forced when the tab is hidden/closed so nothing is lost on exit.
 *
 * Events (via the shared EventBus, if one was provided):
 *   profile:loaded  { profile }
 *   profile:changed { path, value }   // path is '*' for update()/reset()
 *   profile:saved   { ok }
 */
export class ProfileService {
  #adapter;
  #events;
  #id;
  #autosaveMs;
  #timer = null;
  #dirty = false;
  #ready = false;
  #boundFlush;

  /** The live profile document. Read freely; mutate through set/update so saves fire. */
  data;

  constructor(adapter, { events = null, id = 'local', autosaveMs = 600 } = {}) {
    this.#adapter = adapter;
    this.#events = events;
    this.#id = id;
    this.#autosaveMs = autosaveMs;
    this.data = defaultProfile(id);
  }

  get ready() { return this.#ready; }

  /** Open the backend, load + migrate the stored profile (or seed a fresh one). */
  async init() {
    await this.#adapter.init();
    let raw = null;
    try { raw = await this.#adapter.load(this.#id); } catch { raw = null; }

    this.data = migrateProfile(raw, this.#id);

    // If the doc was absent or got upgraded by a migration, persist the result
    // now so the on-disk copy matches what we're running with.
    if (!raw || raw.v !== this.data.v) await this.#flush();

    this.#installUnloadHooks();
    this.#ready = true;
    this.#events?.emit('profile:loaded', { profile: this.data });
    return this;
  }

  // --- reads --------------------------------------------------------------

  /** Dot-path read: get('emblems.active') / get('currency.essence', 0). */
  get(path, fallback = undefined) {
    const v = readPath(this.data, path);
    return v === undefined ? fallback : v;
  }

  // --- writes (mutate + schedule a coalesced save) ------------------------

  /** Dot-path write, creating intermediate objects as needed. */
  set(path, value) {
    writePath(this.data, path, value);
    this.data.updatedAt = Date.now();
    this.#markDirty();
    this.#events?.emit('profile:changed', { path, value });
    return value;
  }

  /** Mutate the document via a callback (good for multi-field atomic edits). */
  update(mutator) {
    mutator(this.data);
    this.data.updatedAt = Date.now();
    this.#markDirty();
    this.#events?.emit('profile:changed', { path: '*', value: this.data });
    return this.data;
  }

  /** Force an immediate write, bypassing the debounce. Returns the flush promise. */
  save() { return this.#flush(); }

  /** Wipe to a clean default profile and persist. */
  async reset() {
    this.data = defaultProfile(this.#id);
    await this.#flush();
    this.#events?.emit('profile:changed', { path: '*', value: this.data });
    return this.data;
  }

  // --- portability (manual backup / future share-codes) -------------------

  /** Serialise the current profile to a JSON string. */
  export() { return JSON.stringify(this.data); }

  /** Replace the profile from a JSON string (migrated + persisted). */
  async import(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    this.data = migrateProfile(parsed, this.#id);
    await this.#flush();
    this.#events?.emit('profile:changed', { path: '*', value: this.data });
    return this.data;
  }

  // --- internals ----------------------------------------------------------

  #markDirty() {
    this.#dirty = true;
    if (this.#timer != null) return;
    this.#timer = setTimeout(() => { this.#timer = null; this.#flush(); }, this.#autosaveMs);
    // Don't let a pending autosave keep a Node process alive (tests/headless).
    this.#timer?.unref?.();
  }

  async #flush() {
    if (this.#timer != null) { clearTimeout(this.#timer); this.#timer = null; }
    if (!this.#dirty && this.#ready) return;
    this.#dirty = false;
    try {
      await this.#adapter.save(this.#id, this.data);
      this.#events?.emit('profile:saved', { ok: true });
    } catch {
      this.#dirty = true; // keep it dirty so a later flush retries
      this.#events?.emit('profile:saved', { ok: false });
    }
  }

  #installUnloadHooks() {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    this.#boundFlush = () => { if (this.#dirty) this.#flush(); };
    // pagehide/visibilitychange are the reliable "tab going away" signals.
    window.addEventListener('pagehide', this.#boundFlush);
    document.addEventListener?.('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.#boundFlush();
    });
  }

  dispose() {
    if (this.#boundFlush && typeof window !== 'undefined') {
      window.removeEventListener?.('pagehide', this.#boundFlush);
    }
    this.#flush();
  }
}

// --- dot-path helpers (no dependency; tiny + predictable) -----------------

function readPath(obj, path) {
  if (!path) return undefined;
  let cur = obj;
  for (const key of String(path).split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[key];
  }
  return cur;
}

function writePath(obj, path, value) {
  const keys = String(path).split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}
