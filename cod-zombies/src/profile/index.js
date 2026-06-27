/**
 * Public surface of the profile module + the factory that wires the right
 * storage adapter for the current environment. Game code should construct the
 * service through `createProfileService` rather than `new ProfileService` so the
 * backend selection (and, later, the cloud-vs-local choice) lives in one place.
 */
import { ProfileService } from './ProfileService.js';
import { IndexedDbAdapter } from './storage/IndexedDbAdapter.js';
import { MemoryAdapter } from './storage/MemoryAdapter.js';

export { ProfileService } from './ProfileService.js';
export { StorageAdapter } from './storage/StorageAdapter.js';
export { IndexedDbAdapter } from './storage/IndexedDbAdapter.js';
export { MemoryAdapter } from './storage/MemoryAdapter.js';
export { defaultProfile, PROFILE_VERSION } from './schema.js';
export { migrateProfile, MIGRATIONS } from './migrations.js';
export { MAX_LEVEL, xpForLevel, totalXpForLevel, levelFromXp } from './progression.js';

/**
 * Build and initialise a ProfileService for this environment.
 *   - Uses IndexedDB when available; falls back to in-memory otherwise so the
 *     game never hard-fails on storage (the profile just won't survive reload).
 *   - Pass a future cloud adapter here to flip the whole game to synced saves.
 *
 * @returns {Promise<ProfileService>} an initialised, ready-to-use service.
 */
export async function createProfileService({ events = null, id = 'local', adapter = null } = {}) {
  const backend = adapter ?? (IndexedDbAdapter.isAvailable() ? new IndexedDbAdapter() : new MemoryAdapter());
  const service = new ProfileService(backend, { events, id });
  await service.init();
  return service;
}
