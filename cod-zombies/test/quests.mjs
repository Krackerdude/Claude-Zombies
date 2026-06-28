// Black Market Quests — rotation determinism, reward labels, and QuestStore
// tracking/persistence.
//
// Run: node test/quests.mjs

import { EventBus } from '../src/core/EventBus.js';
import { ProfileService } from '../src/profile/ProfileService.js';
import { MemoryAdapter } from '../src/profile/storage/MemoryAdapter.js';
import { QuestStore } from '../src/quests/QuestStore.js';
import { windowQuests, currentWindow, rewardLabel, DIFFICULTIES, QUEST_POOL } from '../src/quests/quests.js';
import { gumById } from '../src/gobblegums/gobblegums.js';

let failures = 0;
const ok = (m) => console.log('  ok  :', m);
const fail = (m, e) => { console.error('  FAIL:', m, e ? '\n        ' + (e.stack || e) : ''); failures++; };
function assert(c, m) { c ? ok(m) : fail(m); }

async function store() {
  const events = new EventBus();
  const profile = await new ProfileService(new MemoryAdapter(), { autosaveMs: 5 }).init();
  return { events, profile, q: new QuestStore(profile, events) };
}

console.log('\n[1] window rotation is deterministic + grouped by difficulty');
{
  const a = windowQuests(1000), b = windowQuests(1000), c = windowQuests(1001);
  assert(JSON.stringify(a) === JSON.stringify(b), 'same window -> same quests');
  assert(JSON.stringify(a) !== JSON.stringify(c), 'different window -> different rotation');
  for (const d of DIFFICULTIES) assert((a[d.id]?.length ?? 0) > 0 && a[d.id].length <= QUEST_POOL[d.id].length, `${d.name} tab populated`);
  assert(a.easy.every((x) => x.difficulty === 'easy'), 'quests carry their difficulty');
}

console.log('\n[2] reward labels (gum rewards name the exact gum)');
{
  assert(rewardLabel({ kind: 'div', amount: 2 }) === '×2 Liquid Divinium', 'divinium label');
  assert(rewardLabel({ kind: 'xp', amount: 500 }) === '500 XP', 'xp label');
  const gumQuests = Object.values(QUEST_POOL).flat().filter((q) => q.reward.kind === 'gum');
  assert(gumQuests.length > 0, 'there are gum-reward quests');
  assert(gumQuests.every((q) => gumById(q.reward.gum)), 'every gum reward points at a real gum');
  const sample = gumQuests[0];
  assert(rewardLabel(sample.reward) === `GobbleGum: ${gumById(sample.reward.gum).name}`, 'gum label names the gum');
}

console.log('\n[3] QuestStore tracks, cycles + persists');
{
  const { q, profile } = await store();
  const flat = q.flat();
  assert(flat.length === DIFFICULTIES.reduce((n, d) => n + q.byDifficulty()[d.id].length, 0), 'flat = sum of available');
  assert(q.tracked() && flat.some((x) => x.id === q.tracked().id), 'defaults to an available quest');

  const target = flat[2];
  q.setTracked(target.id);
  assert(q.tracked().id === target.id && q.isTracked(target.id), 'setTracked sticks');
  assert(profile.get('meta.questTracked') === target.id, 'tracked id persisted to profile');

  const before = q.tracked().id;
  q.cycle(1);
  assert(q.tracked().id !== before, 'cycle moves to a new quest');
  q.cycle(-1);
  assert(q.tracked().id === before, 'cycle back returns');

  // a fresh store on the same profile + window restores the tracked quest
  const q2 = new QuestStore(profile, new EventBus());
  assert(q2.tracked().id === before, 'tracked quest restored from profile');
}

console.log('\n[4] msToRefresh is within the 2-hour window');
{
  const { q } = await store();
  const ms = q.msToRefresh();
  assert(ms > 0 && ms <= 2 * 60 * 60 * 1000, `countdown in range (${Math.round(ms / 60000)} min)`);
  assert(typeof currentWindow() === 'number', 'currentWindow resolves');
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}\n`);
process.exit(failures === 0 ? 0 : 1);
