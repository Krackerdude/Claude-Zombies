// Profile persistence framework test. Exercises the storage adapter contract,
// the migration runner, and the ProfileService's read/write/coalesce/reload
// round-trip — all against the in-memory adapter so it runs headless.
//
// Run: node test/profile.mjs

import { ProfileService } from '../src/profile/ProfileService.js';
import { MemoryAdapter } from '../src/profile/storage/MemoryAdapter.js';
import { migrateProfile } from '../src/profile/migrations.js';
import { defaultProfile, PROFILE_VERSION } from '../src/profile/schema.js';

let failures = 0;
const ok = (m) => console.log('  ok  :', m);
const fail = (m, e) => { console.error('  FAIL:', m, e ? '\n        ' + (e.stack || e) : ''); failures++; };
function assert(cond, m) { cond ? ok(m) : fail(m); }
async function guard(label, fn) { try { await fn(); } catch (e) { fail(label, e); } }

console.log('\n[1] defaultProfile is at the current version with empty buckets');
{
  const p = defaultProfile();
  assert(p.v === PROFILE_VERSION, `version stamped (${p.v})`);
  assert(p.progression.level === 1 && p.progression.xp === 0, 'progression seeded at level 1 / 0 xp');
  assert(Object.keys(p.currency).length === 0, 'currency starts empty');
  assert(Array.isArray(p.emblems.saved) && p.emblems.saved.length === 0, 'emblem library starts empty');
}

console.log('\n[2] migrateProfile backfills missing buckets + tolerates garbage');
{
  const upgraded = migrateProfile({ v: 0, progression: { level: 7, xp: 42, prestige: 0 } });
  assert(upgraded.v === PROFILE_VERSION, 'old save upgraded to current version');
  assert(upgraded.progression.level === 7, 'preserved existing data (level 7)');
  assert(upgraded.currency && upgraded.achievements && upgraded.emblems, 'seeded buckets the old save lacked');
  assert(migrateProfile(null).v === PROFILE_VERSION, 'null -> fresh default profile');
  assert(migrateProfile('nonsense').v === PROFILE_VERSION, 'garbage -> fresh default profile');
}

await guard('[3] service round-trip', async () => {
  console.log('\n[3] service init seeds + persists, then a second service reloads it');
  const adapter = new MemoryAdapter();
  const a = await new ProfileService(adapter, { id: 'local', autosaveMs: 5 }).init();
  assert(a.ready, 'service reports ready after init');

  a.set('currency.essence', 250);
  a.set('identity.displayName', 'Tank Dempsey');
  a.update((d) => { d.stats.kills = (d.stats.kills || 0) + 13; });
  await a.save(); // force flush past the debounce

  const b = await new ProfileService(adapter, { id: 'local' }).init();
  assert(b.get('currency.essence') === 250, 'currency survived a reload');
  assert(b.get('identity.displayName') === 'Tank Dempsey', 'identity survived a reload');
  assert(b.get('stats.kills') === 13, 'stats survived a reload');
  assert(b.get('currency.scrap', 0) === 0, 'fallback returned for an unset path');
});

await guard('[4] coalesced writes', async () => {
  console.log('\n[4] a burst of sets collapses into a single persisted document');
  const adapter = new MemoryAdapter();
  let saves = 0;
  const orig = adapter.save.bind(adapter);
  adapter.save = (k, v) => { saves++; return orig(k, v); };

  const s = await new ProfileService(adapter, { id: 'local', autosaveMs: 20 }).init();
  const baseline = saves; // init may persist once
  for (let i = 0; i < 10; i++) s.set('currency.essence', i);
  await s.save();
  assert(saves - baseline === 1, `10 sets -> 1 flush (got ${saves - baseline})`);
  assert(s.get('currency.essence') === 9, 'last write wins');
});

await guard('[5] reset + export/import', async () => {
  console.log('\n[5] reset wipes to defaults; export/import round-trips a document');
  const s = await new ProfileService(new MemoryAdapter(), { id: 'local', autosaveMs: 5 }).init();
  s.set('currency.essence', 999);
  const snapshot = s.export();

  await s.reset();
  assert(s.get('currency.essence', 0) === 0, 'reset cleared currency');

  await s.import(snapshot);
  assert(s.get('currency.essence') === 999, 'import restored the snapshot');
});

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}\n`);
process.exit(failures === 0 ? 0 : 1);
