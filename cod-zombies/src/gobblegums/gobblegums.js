/**
 * GobbleGum catalog — the data backbone for Dr. Newton's Factory consumables.
 * Pure data: every gum's identity, rarity, activation type, effect text and
 * duration. No gameplay effects are implemented here yet (that's a future
 * system); this is the framework the menu browses and the earn/equip flow will
 * draw from.
 *
 * ACTIVATION drives the gum's COLOR / 3D model (per the design):
 *   Blue   (round)   — round-based, consumed instantly on use
 *   Green  (time)    — time-based, consumed instantly on use
 *   Purple (player)  — player-activated with a button; held until you choose
 *   Orange (trigger) — fires when you do a certain thing (melee, slide, get hit,
 *                      buy a perk, pull from the box, ...)
 *   Rainbow(whimsy)  — whimsical novelty gums
 *
 * RARITY drives which tab a gum lives under and ramps effect power upward.
 */

export const ACT = Object.freeze({
  round:   { id: 'round',   label: 'Round Based',     color: '#3aa0ff', glow: '#9bd2ff' },
  time:    { id: 'time',    label: 'Time Based',      color: '#37d36a', glow: '#aef0c2' },
  player:  { id: 'player',  label: 'Player Activated',color: '#9a5cff', glow: '#d3b6ff' },
  trigger: { id: 'trigger', label: 'Triggered',       color: '#ff8a28', glow: '#ffcf8f' },
  whimsy:  { id: 'whimsy',  label: 'Whimsical',       color: '#ff5db1', glow: '#ffd0ec' },
});

// Tab order matches the in-game menu (left → right).
export const RARITIES = Object.freeze([
  { id: 'classic', tab: 'Classic',     name: 'Classic',         color: '#c7b3e6' },
  { id: 'mega',    tab: 'Mega',        name: 'Mega',            color: '#b06bff' },
  { id: 'rare',    tab: 'Rare Mega',   name: 'Rare Mega',       color: '#ffb347' },
  { id: 'ultra',   tab: 'Ultra Mega',  name: 'Ultra-Rare Mega', color: '#ff5d5d' },
  { id: 'whimsy',  tab: 'Whimsical',   name: 'Whimsical',       color: '#5de0ff' },
]);

const id = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Compact tuple form keeps the big list readable: [name, act, effect, duration, glyph]
function pack(rarity, rows) {
  return rows.map(([name, act, effect, duration, glyph]) => ({
    id: id(name), name, rarity, act, effect, duration, glyph,
  }));
}

export const GUMS = [
  ...pack('classic', [
    ['Alchemical Antithesis', 'time',    'While active, every 10 points earned restores 1 bullet to your current weapon\'s reserve ammo.', '60 seconds', 'flask'],
    ['Always Done Swiftly',   'time',    'Aim down sights significantly faster.', '3 minutes', 'swift'],
    ['Anywhere But Here!',    'player',  'Instantly teleports you to a random safe location and creates a blast that knocks down nearby zombies.', '1 activation', 'teleport'],
    ['Armamental Accomplishment', 'time','Switch weapons and recover from sprinting significantly faster.', '3 minutes', 'swap'],
    ['Arsenal Accelerator',   'time',    'Charges your Specialist Weapon faster from earned points.', '10 minutes', 'bolt'],
    ['Coagulant',             'time',    'Bleed out more slowly while downed.', '20 minutes', 'drop'],
    ['Danger Closest',        'round',   'Grants immunity to explosive damage.', '3 rounds', 'shield'],
    ['Fata Morgana',          'player',  'Instantly repairs every barrier on the map.', '1 activation', 'barrier'],
    ['In Plain Sight',        'player',  'Zombies completely ignore you.', '10 seconds (2 activations)', 'ghost'],
    ['Lucky Crit',            'time',    'Increases the chance of triggering an Alternate Ammo Type effect.', '1 minute', 'star'],
    ['Now You See Me',        'time',    'All zombies target you instead of your teammates.', '10 seconds', 'target'],
    ['Projectile Vomiting',   'time',    'Throw grenades farther and faster.', '5 minutes', 'grenade'],
    ['Sword Flay',            'time',    'Greatly increases melee damage.', '2.5 minutes', 'sword'],
    ['Stock Option',          'time',    'Weapons draw ammo directly from reserves instead of requiring reloads.', '3 minutes', 'ammo'],
  ]),
  ...pack('mega', [
    ['Aftertaste',            'round',   'If you are revived while active, you keep all of your perks (except Solo Quick Revive).', '3 rounds', 'revive'],
    ['Board Games',           'round',   'Rebuilding barriers awards greatly increased points.', '5 rounds', 'barrier'],
    ['Board to Death',        'time',    'Nearby barriers automatically rebuild themselves.', '5 minutes', 'barrier'],
    ['Burned Out',            'trigger', 'The next zombie that hits you ignites nearby zombies.', '2 activations (hits taken)', 'fire'],
    ['Crawl Space',           'player',  'Converts nearby zombies into crawlers.', '5 activations', 'crawler'],
    ['Dead of Nuclear Winter','player',  'Spawns a Nuke power-up.', '2 activations', 'nuke'],
    ['Disorderly Combat',     'time',    'Gives you a different random weapon every 10 seconds.', '5 minutes', 'swap'],
    ['Ephemeral Enhancement', 'player',  'Temporarily Pack-a-Punches the weapon you\'re currently holding.', '60 seconds per activation (2 activations)', 'pap'],
    ['Fatal Contraption',     'player',  'Spawns a Death Machine power-up.', '2 activations', 'minigun'],
    ['Flavor Hexed',          'player',  'Immediately grants another random GobbleGum from your equipped GobbleGum Pack.', '1 activation', 'gum'],
    ['Idle Eyes',             'time',    'Zombies completely ignore all players.', '30 seconds', 'ghost'],
    ['I\'m Feeling Lucky',    'player',  'Spawns a random power-up.', '2 activations', 'powerup'],
    ['Immolation Liquidation','player',  'Spawns a Fire Sale power-up.', '3 activations', 'tag'],
    ['Licensed Contractor',   'player',  'Spawns a Carpenter power-up.', '3 activations', 'hammer'],
    ['Mind Blown',            'player',  'Releases a powerful blast around the player that kills nearby zombies.', '2 activations', 'burst'],
    ['Phoenix Up',            'player',  'Instantly revives all downed teammates with all of their perks restored.', '1 activation', 'revive'],
    ['Pop Shocks',            'trigger', 'Melee attacks unleash an electric shock that instantly kills nearby zombies.', '5 melee activations', 'bolt'],
    ['Respin Cycle',          'player',  'Re-spins the current Mystery Box weapon.', '2 activations', 'box'],
    ['Slaughter Slide',       'trigger', 'Sliding creates an explosion that kills nearby zombies.', '6 slides', 'slide'],
    ['Unbearable',            'trigger', 'If the Mystery Box rolls a Teddy Bear, it automatically re-spins instead of moving.', 'Until triggered once', 'teddy'],
    ['Unquenchable',          'trigger', 'Allows you to purchase one additional perk beyond the normal perk limit.', 'Until your next perk purchase', 'perkplus'],
    ['Who\'s Keeping Score?', 'player',  'Spawns a Double Points power-up.', '2 activations', 'x2'],
  ]),
  ...pack('rare', [
    ['Bullet Boost',          'player',  'Re-Pack-a-Punches your current Pack-a-Punched weapon, giving it a new Alternate Ammo Type.', '2 activations', 'pap'],
    ['Cache Back',            'player',  'Spawns a Max Ammo power-up.', '1 activation', 'ammo'],
    ['Crate Power',           'trigger', 'The next weapon you take from the Mystery Box comes Pack-a-Punched.', 'Until your next Mystery Box weapon', 'box'],
    ['Extra Credit',          'player',  'Spawns a personal Bonus Points power-up worth 1,250 points (2,500 during Double Points).', '4 activations', 'points'],
    ['Fear in Headlights',    'time',    'Zombies you look directly at become completely frozen.', '2 minutes', 'eye'],
    ['Kill Joy',              'player',  'Spawns an Insta-Kill power-up.', '2 activations', 'insta'],
    ['On the House',          'player',  'Spawns a free random Perk Bottle power-up for every player.', '1 activation', 'perk'],
    ['Soda Fountain',         'trigger', 'Every perk you purchase also grants a free random perk, ignoring the perk limit.', '5 perk purchases', 'perkplus'],
    ['Temporal Gift',         'round',   'Extends the duration of all power-ups that spawn while active.', '1 round', 'clock'],
    ['Undead Man Walking',    'time',    'Slows all zombies to shambling speed.', '4 minutes', 'slow'],
    ['Wall Power',            'trigger', 'The next wall weapon you purchase comes Pack-a-Punched.', 'Until your next wall weapon purchase', 'wall'],
  ]),
  ...pack('ultra', [
    ['Perkaholic',            'player',  'Instantly grants every perk available on the current map.', '1 activation', 'perk'],
    ['Shopping Free',         'time',    'All purchases (except GobbleGum machines) cost 0 points.', '1 minute', 'tag'],
    ['Near Death Experience', 'round',   'Revives yourself or nearby teammates automatically while active. Revived players keep all of their perks.', '3 rounds', 'revive'],
    ['Self Medication',       'trigger', 'While active, killing a zombie while downed revives you and keeps all of your perks.', '3 activations', 'revive'],
    ['Power Vacuum',          'round',   'Greatly increases the spawn rate of power-ups.', '4 rounds', 'powerup'],
    ['Profit Sharing',        'time',    'Points earned by any player are awarded to every player.', '2 minutes', 'points'],
    ['Reign Drops',           'player',  'Spawns one of every standard power-up (excluding Fire Sale and Death Machine).', '1 activation', 'powerup'],
    ['Round Robbin',          'player',  'Immediately ends the current round and awards the round completion bonus.', '1 activation', 'flag'],
    ['Killing Time',          'time',    'Freezes all zombies in place. When the effect ends, they instantly die.', '20 seconds', 'freeze'],
    ['Secret Shopper',        'time',    'Allows wall weapons to be purchased even if you already own the maximum number of weapons.', '10 minutes', 'wall'],
  ]),
  ...pack('whimsy', [
    ['Die Pitched',           'whimsy',  'Zombies have high-pitched voices.', '3 minutes', 'music'],
    ['Eye Candy',             'whimsy',  'Cycles through various visual color filters for the entire game.', '4 minutes', 'palette'],
    ['Holiday Cheer',         'whimsy',  'Zombies wear festive holiday decorations.', '3 minutes', 'gift'],
    ['Indigestion',           'whimsy',  'Zombies killed experience extreme flatulence.', '3 minutes', 'cloud'],
    ['Newtonian Negation',    'whimsy',  'Zombies killed fly straight upward into the sky.', '3 minutes', 'up'],
    ['Quacknarok',            'whimsy',  'Zombies wear rubber ducky inner tubes.', '3 minutes', 'duck'],
    ['Rainburps',             'whimsy',  'Zombies killed belch rainbow bubbles.', '3 minutes', 'rainbow'],
    ['Tone Death',            'whimsy',  'Changes the pitch of most in-game sound effects.', '3 minutes', 'music'],
  ]),
];

/** All gums in a rarity, in catalog order. */
export function gumsByRarity(rarityId) { return GUMS.filter((g) => g.rarity === rarityId); }

/** Look up a single gum definition by id. */
export function gumById(gid) { return GUMS.find((g) => g.id === gid) ?? null; }

/** Human label for a rarity id (e.g. 'ultra' -> 'Ultra-Rare Mega'). */
export function rarityName(rarityId) { return RARITIES.find((r) => r.id === rarityId)?.name ?? rarityId; }
