/**
 * Tuning for the undead systems. Kept separate from the core engine config so
 * gameplay designers can iterate here without touching movement/render tables.
 */

export const NavConfig = {
  cellSize: 1.0, // grid resolution (m)
  agentRadius: 0.4, // obstacles inflated by this when marking the grid solid
  barrierPenalty: 18, // path cost added for routing through a boarded barrier
  diagonal: true,
};

export const ZombieConfig = {
  baseHealth: 150,
  healthPerRound: 100,
  healthGrowthAfter: 0.10, // round 10+ : +10% per round instead of a flat +100

  baseSpeed: 1.7, // m/s (shambling)
  speedPerRound: 0.06,
  maxSpeed: 3.3,

  reachThreshold: 0.4, // waypoint arrival distance
  replanInterval: 0.8, // seconds between path recomputes while chasing
  spawnRiseTime: 0.6, // brief emerge delay before pathing

  teardownTime: 2.2, // seconds to rip a barrier open

  attackRange: 2.0, // slightly raised so presence creates pressure
  attackInterval: 0.55,
  attackCooldown: 1.0, // after a zombie swings, IT waits this long before swinging again // recovery between committed swipes
  attackDamage: 34, // ~1/3 of the player's 100 base health -> three-hit down
  swipeTime: 0.5, // committed, unescapable swing duration
  swipeHitAt: 0.25, // seconds into the swing when the hit lands
  swipeSlowDuration: 0.3, // how long the player is slowed after being hit
  swipeSlowFactor: 0.55, // movement multiplier while slowed

  separation: 0.85, // desired min spacing between zombies
  separationStrength: 1.6,

  radius: 0.45, // for hitscan + separation
  height: 1.8,
};

export const BarrierConfig = {
  maxBoards: 6, // hits to fully tear a window open (CoD-style)
  boardTearTime: 0.45, // seconds a zombie spends ripping one board
  boardRepairTime: 0.5, // seconds the player spends rebuilding one board
  repairReach: 2.4, // how close the player must be to repair (m)
  pointsPerBoard: 10, // score for each board rebuilt
};

export const RoundConfig = {
  baseCount: 6,
  countPerRound: 3,
  maxCount: 60,
  maxAlive: 24,
  spawnInterval: 1.3,
  firstSpawnDelay: 1.5,
  interRoundDelay: 7.0,
};

export const PlayerCombat = {
  maxHealth: 100,
  regenDelay: 2.8, // faster onset after last hit
  regenRate: 39, // hp/sec (amped up)
  hitscanRange: 90,
  hitDamage: 55,
  // scoring (CoD-style)
  pointsPerHit: 10, // every bullet that hits a zombie (incl. each penetration)
  pointsKillBody: 50, // body-shot kill bonus
  pointsKillHead: 100, // headshot kill bonus
};

export const EconomyConfig = {
  inventoryCap: 2, // weapons the player can carry
  mysteryBoxCost: 950,
  boxSpinTime: 3.2, // seconds the box cycles before landing
  boxHoldTime: 10.0, // seconds the prize rises/settles/lowers before it's lost
  ammoRefillFactor: 0.45, // wall-buy ammo top-up costs this fraction of the gun price
  interactReach: 2.6,
};

/**
 * The three zombie gaits. Each pairs a movement speed with an animation set:
 *  - shamble: very slow, arms at the sides, short dragging strides (sets the
 *    early-round tone)
 *  - walk:    arms raised, longer strides, a touch quicker (no real urgency)
 *  - run:     the aggressive reach-forward sprint (the classic look), fastest
 */
export const Gaits = {
  shamble: { speed: 0.85, anim: 'shamble' },
  walk: { speed: 1.74, anim: 'walk' },
  run: { speed: 3.51, anim: 'run' },
};

/** Zombie hp by round: +100/round through round 9, then +10% compounding. */
export function zombieHealthForRound(r) {
  if (r <= 9) return ZombieConfig.baseHealth + (r - 1) * ZombieConfig.healthPerRound; // 150..950
  const r9 = ZombieConfig.baseHealth + 8 * ZombieConfig.healthPerRound; // 950
  return Math.round(r9 * Math.pow(1 + ZombieConfig.healthGrowthAfter, r - 9));
}

/** Pick a gait for a spawning zombie — the horde trends faster as rounds climb. */
export function pickGait(round) {
  let w;
  if (round <= 3) w = [['shamble', 0.85], ['walk', 0.15]];
  else if (round <= 6) w = [['shamble', 0.30], ['walk', 0.55], ['run', 0.15]];
  else if (round <= 9) w = [['shamble', 0.05], ['walk', 0.40], ['run', 0.55]];
  else w = [['walk', 0.20], ['run', 0.80]];
  const r = Math.random();
  let acc = 0;
  for (const [g, p] of w) { acc += p; if (r <= acc) return g; }
  return w[w.length - 1][0];
}
