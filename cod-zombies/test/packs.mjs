// GobbleGum PackStore — slot fill/replace logic + persistence.
//
// Run: node test/packs.mjs

import { EventBus } from '../src/core/EventBus.js';
import { ProfileService } from '../src/profile/ProfileService.js';
import { MemoryAdapter } from '../src/profile/storage/MemoryAdapter.js';
import { PackStore } from '../src/gobblegums/PackStore.js';

let failures = 0;
const ok = (m) => console.log('  ok  :', m);
const fail = (m, e) => { console.error('  FAIL:', m, e ? '\n        ' + (e.stack || e) : ''); failures++; };
function assert(c, m) { c ? ok(m) : fail(m); }

async function make() {
  const events = new EventBus();
  const adapter = new MemoryAdapter();
  const profile = await new ProfileService(adapter, { autosaveMs: 5 }).init();
  return { events, adapter, profile, packs: new PackStore(profile, events) };
}

console.log('\n[1] defaults: four packs, first equipped, all slots empty');
{
  const { packs } = await make();
  assert(packs.packs.length === 4, `4 packs (got ${packs.packs.length})`);
  assert(packs.equippedIndex === 0, 'pack 0 equipped');
  assert(packs.slots().every((s) => s === null), 'equipped pack starts empty');
}

console.log('\n[2] clicking gums fills slots left-to-right, then ignores when full');
{
  const { packs } = await make();
  for (const id of ['a', 'b', 'c', 'd', 'e']) assert(packs.placeGum(id), `placed ${id}`);
  assert(JSON.stringify(packs.slots()) === JSON.stringify(['a', 'b', 'c', 'd', 'e']), 'slots filled in order');
  assert(packs.placeGum('f') === false, 'sixth gum ignored (pack full)');
}

console.log('\n[3] duplicates are not added twice');
{
  const { packs } = await make();
  assert(packs.placeGum('a') === true, 'first add ok');
  assert(packs.placeGum('a') === false, 'duplicate add ignored');
  assert(packs.slots()[1] === null, 'no second copy placed');
}

console.log('\n[4] selecting a slot then clicking a gum replaces it');
{
  const { packs } = await make();
  packs.placeGum('a'); packs.placeGum('b');
  packs.selectSlot(0);
  assert(packs.selectedSlot === 0, 'slot 0 selected');
  assert(packs.placeGum('z') === true, 'replacement placed');
  assert(packs.slots()[0] === 'z' && packs.slots()[1] === 'b', 'slot 0 swapped, slot 1 intact');
  assert(packs.selectedSlot === -1, 'selection cleared after replace');
  // replacing with a gum already present elsewhere is rejected
  packs.selectSlot(1);
  assert(packs.placeGum('z') === false, 'cannot place a duplicate into a chosen slot');
  assert(packs.slots()[1] === 'b', 'slot 1 unchanged');
}

console.log('\n[5] equipping a different pack switches the active slots');
{
  const { packs } = await make();
  packs.placeGum('a');
  packs.equip(2);
  assert(packs.equippedIndex === 2, 'pack 2 equipped');
  assert(packs.slots().every((s) => s === null), 'pack 2 still empty');
  packs.placeGum('q');
  assert(packs.slots()[0] === 'q', 'edits go to the equipped pack');
  assert(packs.packs[0].slots[0] === 'a', 'pack 0 retained its gum');
}

console.log('\n[6] packs persist on the profile (survive a fresh store + reload)');
{
  const { profile, adapter, packs } = await make();
  packs.placeGum('a'); packs.placeGum('b'); packs.equip(1); packs.placeGum('c');
  await profile.save();
  const profile2 = await new ProfileService(adapter, { autosaveMs: 5 }).init();
  const packs2 = new PackStore(profile2, new EventBus());
  assert(packs2.equippedIndex === 1, 'equipped pack persisted');
  assert(packs2.packs[0].slots[0] === 'a' && packs2.packs[0].slots[1] === 'b', 'pack 0 contents persisted');
  assert(packs2.packs[1].slots[0] === 'c', 'pack 1 contents persisted');
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}\n`);
process.exit(failures === 0 ? 0 : 1);
