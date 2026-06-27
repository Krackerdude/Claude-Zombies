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

  // hit reactions — a punchy, readable jolt with follow-through (not a twitch)
  flinchPerDamage: 1 / 300, // flinch intensity per point of damage (caliber feel — gentler so big calibers don't dominate)
  flinchMin: 0.45, // even a peashooter visibly rocks them
  // explosion knockdown
  knockChance: 0.55, // chance a non-lethal explosion knocks a zombie down
  knockDuration: 2.4, // total fall -> writhe -> get-up time (s)
};

export const BarrierConfig = {
  maxBoards: 6, // hits to fully tear a window open (CoD-style)
  boardTearTime: 0.45, // wind-up before a zombie rips its FIRST board
  boardTearCooldown: 1.0, // a zombie must wait this long before ripping another board
  boardRepairTime: 1.0, // seconds the player holds to rebuild one board (sequential, ~1s each)
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

/**
 * Hellhound special ("dog") round. Fast, low-health quadrupeds that spawn INSIDE
 * the playable space via lightning strikes and hunt the player until the last
 * one drops a guaranteed Max Ammo. Count scales gently with the round number.
 */
export const HoundConfig = {
  baseCount: 6,
  countPerRound: 1,     // +1 per round the special is triggered on
  maxCount: 16,
  maxAlive: 8,
  speed: 4.4,           // faster than a sprinting zombie
  baseHealth: 120,
  healthPerRound: 22,
  spawnInterval: 2.1,   // between lightning strikes — trickle them in, not a swarm
  firstSpawnDelay: 1.6,
  strikeDelay: 0.5,     // lightning flash -> hound materialises
  strikeSeparation: 6,  // min distance between consecutive strike points
  attackDamage: 32,
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
  // Pack-a-Punch
  papCost: 5000,
  papRepackCost: 2500, // Re-Pack an already-punched gun for an Alternate Ammo Type
  papInsertTime: 1.0,  // gun sucked into the machine
  papWorkTime: 1.5,    // vibrate + whirl, red "done" flag pops up
  papHoldTime: 5.0,    // grab window: rises out, then slowly sucked back in
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
