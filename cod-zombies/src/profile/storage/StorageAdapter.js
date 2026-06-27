/**
 * StorageAdapter — the contract the ProfileService depends on. Swapping where
 * the profile lives (IndexedDB today; Supabase / PlayFab / your own API later)
 * is implementing this four-method interface and handing a different instance to
 * ProfileService. No gameplay or UI code ever touches storage directly, so a
 * cloud backend becomes a single new adapter file, not a refactor.
 *
 * All methods are async (return Promises) even when an implementation is
 * synchronous, so the same call sites work for a networked backend.
 *
 *   init()            -> resolve when the backend is ready to read/write.
 *   load(key)         -> the stored object for `key`, or null if absent.
 *   save(key, value)  -> persist a plain, JSON-serialisable object.
 *   remove(key)       -> delete the record (used by reset/sign-out).
 *
 * This base class is intentionally a no-op (an in-memory void); use it as a
 * reference, a test double, or a "storage disabled" fallback.
 */
export class StorageAdapter {
  async init() {}
  // eslint-disable-next-line no-unused-vars
  async load(key) { return null; }
  // eslint-disable-next-line no-unused-vars
  async save(key, value) {}
  // eslint-disable-next-line no-unused-vars
  async remove(key) {}
}
