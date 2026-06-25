// Headless test for NavGraph A* + barrier gating. Pure JS (no THREE/DOM).
// Run: node test/nav.mjs
import { NavGraph } from '../src/ai/NavGraph.js';
import { Barrier } from '../src/ai/Barrier.js';

let failures = 0;
const assert = (c, m) => { if (!c) { console.error('  FAIL:', m); failures++; } else console.log('  ok  :', m); };

const PLAYER = { tearsBarriers: false };
const ZOMBIE = { tearsBarriers: true };

// 11x11 grid, full wall on cols 4-5 splitting left/right, one window gap at row 5.
const nav = new NavGraph({ minX: 0, minZ: 0, maxX: 11, maxZ: 11 });
nav.markSolidRect(4.6, -1, 5.4, 12); // full-height wall (cols 4-5)
const window = nav.addBarrier(
  new Barrier({ id: 'win', position: { x: 5, z: 5.5 }, teardownable: true }),
  { minX: 4.1, minZ: 5, maxX: 5.9, maxZ: 6 },
);

const leftCell = nav.cellAt(1.5, 5.5);
const rightCell = nav.cellAt(9.5, 5.5);

console.log('\n[1] wall actually separates the halves');
assert(leftCell >= 0 && rightCell >= 0, 'endpoints are valid cells');
assert(nav.findPath(leftCell, rightCell, PLAYER) === null,
  'player cannot path through a closed window (no route)');

console.log('\n[2] zombie routes through a boarded window');
const zPath = nav.findPath(leftCell, rightCell, ZOMBIE);
assert(zPath !== null, 'zombie finds a path through the closed window');
assert(zPath.some((i) => nav.barrierOf(i) === window), 'that path crosses the barrier cell');

console.log('\n[3] path is contiguous (each step is a grid neighbour)');
let contiguous = true;
for (let i = 1; i < zPath.length; i++) {
  const dc = Math.abs(nav.colOf(zPath[i]) - nav.colOf(zPath[i - 1]));
  const dr = Math.abs(nav.rowOf(zPath[i]) - nav.rowOf(zPath[i - 1]));
  if (dc > 1 || dr > 1) contiguous = false;
}
assert(contiguous, 'no waypoint jumps more than one cell');

console.log('\n[4] opening the window lets the player through + drops zombie cost');
const costOf = (path, agent) => {
  let c = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const diag = nav.colOf(a) !== nav.colOf(b) && nav.rowOf(a) !== nav.rowOf(b);
    c += (diag ? Math.SQRT2 : 1) + nav.enterPenalty(b, agent);
  }
  return c;
};
const closedCost = costOf(zPath, ZOMBIE);
for (let i = 0; i < window.maxBoards; i++) window.removeBoard(); // rip every board
assert(window.open, 'window fully torn = open');
const pPathOpen = nav.findPath(leftCell, rightCell, PLAYER);
assert(pPathOpen !== null, 'player can path once the window is open');
const openCost = costOf(nav.findPath(leftCell, rightCell, ZOMBIE), ZOMBIE);
assert(openCost < closedCost, `zombie path is cheaper once open (${openCost.toFixed(1)} < ${closedCost.toFixed(1)})`);

console.log('\n[5] boards: six tears to open, repair re-closes');
const b2 = new Barrier({ id: 't', position: { x: 0, z: 0 } });
let opened = 0, removed = 0;
for (let i = 0; i < 200; i++) { const r = b2.removeBoard(); if (r.removed) removed++; if (r.opened) opened++; }
assert(b2.open && opened === 1 && removed === b2.maxBoards, `tears all ${b2.maxBoards} boards, opens exactly once (removed ${removed})`);
const rep = b2.repair(1);
assert(rep.added && rep.closed && b2.boards === 1 && !b2.open, 'a repair rebuilds a board and re-closes the window');

console.log('\n[6] nearestWalkable escapes a solid point');
const inWall = nav.nearestWalkable(5.0, 1.5, ZOMBIE); // inside the wall column
assert(inWall >= 0 && nav.canEnter(inWall, ZOMBIE), 'nearestWalkable returns an enterable cell near a solid');

console.log('\n[7] no corner cutting through diagonal solids');
const nav2 = new NavGraph({ minX: 0, minZ: 0, maxX: 5, maxZ: 5 });
nav2.solid[nav2.index(2, 1)] = 1; // exact single-cell obstacles (avoid radius inflation)
nav2.solid[nav2.index(1, 2)] = 1;
// going from (col1,row1) to (col2,row2) diagonally would cut the corner between them
const cutPath = nav2.findPath(nav2.cellAt(1.5, 1.5), nav2.cellAt(2.5, 2.5), ZOMBIE);
let cutsCorner = false;
if (cutPath) {
  for (let i = 1; i < cutPath.length; i++) {
    const a = cutPath[i - 1], b = cutPath[i];
    if (nav2.colOf(a) === 1 && nav2.rowOf(a) === 1 && nav2.colOf(b) === 2 && nav2.rowOf(b) === 2) cutsCorner = true;
  }
}
assert(cutPath !== null && !cutsCorner, 'path reaches goal without slicing the diagonal corner');

console.log('\n[7] committed zombies stick to their assigned window (no funnelling)');
// add a second window further down the same wall; open #1, keep #2 boarded
const window2 = nav.addBarrier(
  new Barrier({ id: 'win2', position: { x: 5, z: 9.5 }, teardownable: true }),
  { minX: 4.1, minZ: 9, maxX: 5.9, maxZ: 10 },
);
// window (#1, index 0) was already torn open in [4]; window2 (#1 index 1) is full
const agentVia2 = { tearsBarriers: true, viaBarrier: 1 };
const p2 = nav.findPath(nav.cellAt(1.5, 9.5), nav.cellAt(9.5, 9.5), agentVia2);
assert(p2 !== null, 'a zombie committed to window #2 still finds a route');
assert(p2.some((i) => nav.barrierOf(i) === window2), 'it crosses its assigned (boarded) window #2');
assert(!p2.some((i) => nav.barrierOf(i) === window), 'it does NOT divert to the already-open window #1');

const agentVia1 = { tearsBarriers: true, viaBarrier: 0 };
const p1 = nav.findPath(nav.cellAt(1.5, 5.5), nav.cellAt(9.5, 5.5), agentVia1);
assert(p1 && p1.some((i) => nav.barrierOf(i) === window), 'a zombie committed to window #1 uses window #1');

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}\n`);
process.exit(failures === 0 ? 0 : 1);
