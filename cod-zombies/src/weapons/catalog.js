import { WeaponData, WeaponCategory, categoryDefaults } from './WeaponData.js';
import { WeaponBase } from './WeaponBase.js';
import { ShotgunWeapon, ProjectileWeapon, ConeWeapon } from './variants.js';

/**
 * Concrete weapons. Each entry spreads its category default then overrides only
 * what makes it distinct, and names the behavior class to instantiate. Add a
 * weapon by adding a row here — nothing else needs to know about it.
 */
const C = WeaponCategory;

const defs = {
  // 20 dmg flat: round-1 8 bodyshots (7 = 140 HP, leaves 10) / 3 headshots (×3.5 = 70).
  m1911: { Class: WeaponBase, category: C.PISTOL, name: 'M1911', damage: 20, fireRate: 400, cost: 500, headshotMultiplier: 3.5 },
  vector: { Class: WeaponBase, category: C.SMG, name: 'K-Vector', damage: 70, fireRate: 950, magazineSize: 40, adsFov: 56, cost: 1000 },
  // MP5: classic SMG. 100 dmg/bullet, standard 3x head, 30-round mag, 120 reserve.
  mp5: { Class: WeaponBase, category: C.SMG, name: 'MP5', damage: 100, headshotMultiplier: 3.0,
    fireRate: 800, magazineSize: 30, ammoStockSize: 120, reloadTime: 2.0, recoilPitch: 0.009,
    cost: 0, boxOnly: true, viewmodel: { length: 0.45, color: 0x26292e, accent: 0x14161a } },
  // UZI: compact SMG. 85 dmg/bullet, standard 3x head, higher fire rate than the MP5.
  uzi: { Class: WeaponBase, category: C.SMG, name: 'UZI', damage: 85, headshotMultiplier: 3.0,
    fireRate: 950, magazineSize: 32, ammoStockSize: 160, reloadTime: 2.1, recoilPitch: 0.01,
    cost: 0, boxOnly: true, viewmodel: { length: 0.32, color: 0x2c2f35, accent: 0x141619 } },
  // KUDA (BO3): semi-futuristic SMG. 110 dmg/bullet, standard 3x head, medium
  // fire rate (slightly slower than the MP5), 30-round mag, 210 reserve.
  kuda: { Class: WeaponBase, category: C.SMG, name: 'KUDA', damage: 110, headshotMultiplier: 3.0,
    fireRate: 750, magazineSize: 30, ammoStockSize: 210, reloadTime: 2.1, recoilPitch: 0.009,
    cost: 0, boxOnly: true, viewmodel: { length: 0.38, color: 0xa39a7c, accent: 0x26282c } },
  // PPSh-41: WW2 SMG. Low damage, the highest fire rate of any SMG, huge 71-round
  // drum + hefty reserve. Standard 3x head.
  ppsh: { Class: WeaponBase, category: C.SMG, name: 'PPSH-41', damage: 65, headshotMultiplier: 3.0,
    fireRate: 1200, magazineSize: 71, ammoStockSize: 355, reloadTime: 3.0, recoilPitch: 0.008,
    cost: 0, boxOnly: true, viewmodel: { length: 0.45, color: 0x3c4045, accent: 0x6a3526 } },
  // MP40: classic WW2 SMG. Reliable damage, slower fire rate, decent ammo, 3x head.
  mp40: { Class: WeaponBase, category: C.SMG, name: 'MP40', damage: 95, headshotMultiplier: 3.0,
    fireRate: 600, magazineSize: 32, ammoStockSize: 192, reloadTime: 2.3, recoilPitch: 0.01,
    cost: 0, boxOnly: true, viewmodel: { length: 0.4, color: 0x34373c, accent: 0x222428 } },
  galil: { Class: WeaponBase, category: C.AR, name: 'GALIL', damage: 120, fireRate: 575, recoilPitch: 0.014, cost: 1200 },
  // XM4 / Commando (M4 carbine): AR. 210 dmg/bullet, standard 3x head, medium
  // 30-round mag, high reserve.
  xm4: { Class: WeaponBase, category: C.AR, name: 'XM4', damage: 210, headshotMultiplier: 3.0,
    fireRate: 720, magazineSize: 30, ammoStockSize: 300, reloadTime: 2.2, recoilPitch: 0.013,
    cost: 0, boxOnly: true, viewmodel: { length: 0.55, color: 0x26282c, accent: 0x17181c } },
  // AN-94 Abakan: AR. Medium damage, slightly slower fire rate than the XM4,
  // curved mag, red glowing iron sights, standard 3x head.
  an94: { Class: WeaponBase, category: C.AR, name: 'AN-94', damage: 180, headshotMultiplier: 3.0,
    fireRate: 660, magazineSize: 30, ammoStockSize: 270, reloadTime: 2.4, recoilPitch: 0.013,
    cost: 0, boxOnly: true, viewmodel: { length: 0.56, color: 0x262b31, accent: 0x837748 } },
  // STG-44: the first assault rifle (WW2). Slightly-upper damage, slowest AR fire
  // rate, mid mag + reserve, longer body. Standard 3x head.
  stg44: { Class: WeaponBase, category: C.AR, name: 'STG-44', damage: 205, headshotMultiplier: 3.0,
    fireRate: 580, magazineSize: 30, ammoStockSize: 240, reloadTime: 2.5, recoilPitch: 0.014,
    cost: 0, boxOnly: true, viewmodel: { length: 0.63, color: 0x2c3036, accent: 0x6a4a2e } },
  // ICR-1 (BO3): modern angular AR, very close to the Galil but slightly less
  // damage and a higher fire rate. Mid mag + reserve, green iron sights. 3x head.
  icr1: { Class: WeaponBase, category: C.AR, name: 'ICR-1', damage: 110, headshotMultiplier: 3.0,
    fireRate: 720, magazineSize: 40, ammoStockSize: 280, reloadTime: 2.2, recoilPitch: 0.012,
    cost: 0, boxOnly: true, viewmodel: { length: 0.55, color: 0x2a2e34, accent: 0x15171b } },
  // FAL: semi-automatic battle rifle. Hard-hitting per shot (semi-auto), 3x head,
  // AN-94-sized body, high 30-round mag but a modest reserve.
  fal: { Class: WeaponBase, category: C.AR, name: 'FAL', fireMode: 'semi',
    damage: 300, headshotMultiplier: 3.0, fireRate: 360, magazineSize: 30, ammoStockSize: 180,
    reloadTime: 2.4, recoilPitch: 0.03, cost: 0, boxOnly: true,
    viewmodel: { length: 0.56, color: 0x2a2f36, accent: 0xc69a5a } },
  // DINGO (BO3): bulky futuristic LMG. Fast fire rate, big 80-round drum, 320
  // reserve, standard 3x head. Slightly wider body than the HK21.
  dingo: { Class: WeaponBase, category: C.HMG, name: 'DINGO', damage: 130, headshotMultiplier: 3.0,
    fireRate: 750, magazineSize: 80, ammoStockSize: 320, reloadTime: 4.6, recoilPitch: 0.012,
    cost: 0, boxOnly: true, viewmodel: { length: 0.72, color: 0x34383f, accent: 0xb89048 } },
  // RPD: classic Soviet belt-fed LMG. Decent damage (Dingo-class), huge 120-round
  // pan drum, 360 reserve, standard 3x head. Slightly bulkier than the HK21.
  rpd: { Class: WeaponBase, category: C.HMG, name: 'RPD', damage: 130, headshotMultiplier: 3.0,
    fireRate: 650, magazineSize: 120, ammoStockSize: 360, reloadTime: 5.0, recoilPitch: 0.013,
    cost: 0, boxOnly: true, viewmodel: { length: 0.74, color: 0x2a2e34, accent: 0x8a4a28 } },
  // HAMR (BO2): an HK21-class LMG, mechanically the same gun — same 140 damage,
  // differentiated only by a higher fire rate and a smaller 75-round mag.
  hamr: { Class: WeaponBase, category: C.HMG, name: 'HAMR', damage: 140, headshotMultiplier: 3.0,
    fireRate: 770, magazineSize: 75, ammoStockSize: 300, reloadTime: 4.4, recoilPitch: 0.013,
    cost: 0, boxOnly: true, viewmodel: { length: 0.7, color: 0x9c8c5e, accent: 0x1c1e22 } },
  // STONER 63: Dingo-class LMG — lower fire rate, slightly higher damage, with a
  // similar (not identical) mag + reserve. Standard 3x head.
  stoner63: { Class: WeaponBase, category: C.HMG, name: 'STONER 63', damage: 145, headshotMultiplier: 3.0,
    fireRate: 620, magazineSize: 75, ammoStockSize: 300, reloadTime: 4.8, recoilPitch: 0.013,
    cost: 0, boxOnly: true, viewmodel: { length: 0.72, color: 0x202327, accent: 0x6a4428 } },
  // LSAT (BO2): the modern Stoner 63 — same damage, faster fire rate, but a
  // smaller 60-round belt + lighter reserve. Standard 3x head.
  lsat: { Class: WeaponBase, category: C.HMG, name: 'LSAT', damage: 145, headshotMultiplier: 3.0,
    fireRate: 700, magazineSize: 60, ammoStockSize: 240, reloadTime: 4.6, recoilPitch: 0.012,
    cost: 0, boxOnly: true, viewmodel: { length: 0.72, color: 0x2a2e34, accent: 0xb89042 } },
  // RK-5: semi-futuristic 3-round-burst pistol. 100 body / 300 headshot (x3.0).
  rk5: { Class: WeaponBase, category: C.PISTOL, name: 'RK-5', fireMode: 'burst', burstCount: 3,
    damage: 100, headshotMultiplier: 3.0, fireRate: 700, magazineSize: 20, ammoStockSize: 140,
    reloadTime: 1.6, recoilPitch: 0.016, cost: 500,
    viewmodel: { length: 0.36, color: 0x474b54, accent: 0x0e0f12 } },
  // CODA 9 (BO7): futuristic automatic machine pistol. Slightly more damage/bullet
  // than the Five-seveN, smaller mag but a much larger reserve. Standard 3x head.
  coda9: { Class: WeaponBase, category: C.PISTOL, name: 'CODA 9', fireMode: 'auto',
    damage: 90, headshotMultiplier: 3.0, fireRate: 750, magazineSize: 18, ammoStockSize: 400,
    reloadTime: 1.7, recoilPitch: 0.011, cost: 0, boxOnly: true,
    viewmodel: { length: 0.31, color: 0x6c7076, accent: 0x131519 } },
  // Dual-wield FN Five-seveN: twin mirrored viewmodels, ONE shared ammo pool.
  // Every shot alternates which gun fires. DAMAGE IS A PLACEHOLDER pending tuning.
  fiveSeven: { Class: WeaponBase, category: C.PISTOL, name: 'FIVE-SEVEN', fireMode: 'auto',
    dualWield: true, damage: 80, headshotMultiplier: 3.0, fireRate: 500,
    magazineSize: 40, ammoStockSize: 240, reloadTime: 2.1, recoilPitch: 0.012, cost: 0, boxOnly: true,
    viewmodel: { length: 0.31, color: 0x2c2f35, accent: 0x0c0e11 } },
  // The Executioner (Taurus Judge): a revolver that fires .410 shotshells —
  // a SHOTGUN mechanically (8-pellet spread). 35 dmg/pellet, standard 3x head.
  // Cylinder rotates per shot. Semi, 5-round, box-only.
  executioner: { Class: ShotgunWeapon, category: C.SHOTGUN, name: 'EXECUTIONER', fireMode: 'semi',
    pellets: 8, damage: 35, headshotMultiplier: 3.0, magazineSize: 5, ammoStockSize: 40,
    reloadType: 'magazine', reloadTime: 2.4, fireRate: 150, spread: 0.1, adsSpread: 0.06,
    range: 30, recoilPitch: 0.045, cost: 0, boxOnly: true,
    viewmodel: { length: 0.46, color: 0x9a9ea4, accent: 0x101216 } },
  // Remington New Army Model: single-action hand-cannon revolver. 450 dmg,
  // 1.5x headshot (high base damage). Box-only. Cylinder rotates per shot.
  newArmy: { Class: WeaponBase, category: C.PISTOL, name: 'NEW ARMY', fireMode: 'semi',
    damage: 450, headshotMultiplier: 1.5, fireRate: 160, magazineSize: 6, ammoStockSize: 60,
    reloadTime: 2.6, recoilPitch: 0.05, cost: 0, boxOnly: true,
    viewmodel: { length: 0.49, color: 0x565a61, accent: 0x3e424a } },
  olympia: { Class: ShotgunWeapon, category: C.SHOTGUN, name: 'OLYMPIA', damage: 42, pellets: 9, magazineSize: 2, fireRate: 90, cost: 1000 },
  // KRM-262 (BO3): tactical pump shotgun. 36 dmg/pellet, 8-shell tube, 64 reserve.
  krm: { Class: ShotgunWeapon, category: C.SHOTGUN, name: 'KRM-262', damage: 36, pellets: 8,
    headshotMultiplier: 3.0, magazineSize: 8, ammoStockSize: 64, fireRate: 80, cost: 0, boxOnly: true,
    viewmodel: { length: 0.62, color: 0x44484f, accent: 0x1c1e22 } },
  // MOG 12 (BO4): a slightly lower-tier pump shotgun. Similar pellet damage to
  // the KRM but only 4 in the mag and a smaller reserve. Stubbier, stock-less.
  mog12: { Class: ShotgunWeapon, category: C.SHOTGUN, name: 'MOG 12', damage: 36, pellets: 8,
    headshotMultiplier: 3.0, magazineSize: 4, ammoStockSize: 32, fireRate: 80, cost: 0, boxOnly: true,
    viewmodel: { length: 0.5, color: 0x222428, accent: 0xd83426 } },
  // HAYMAKER 12 (BO3): fully-automatic drum-fed shotgun. KRM-like pellet damage
  // but auto fire, a big 16-shell drum and a larger reserve.
  haymaker: { Class: ShotgunWeapon, category: C.SHOTGUN, name: 'HAYMAKER', fireMode: 'auto',
    damage: 34, pellets: 8, headshotMultiplier: 3.0, magazineSize: 16, ammoStockSize: 96,
    reloadType: 'magazine', reloadTime: 3.4, fireRate: 300, cost: 0, boxOnly: true,
    viewmodel: { length: 0.6, color: 0x3a3f46, accent: 0x16181c } },
  // STAKEOUT: cut-down pump shotgun. KRM-like but a stronger base pellet damage
  // (48) traded for a smaller 6-shell mag and a lighter 48 reserve.
  stakeout: { Class: ShotgunWeapon, category: C.SHOTGUN, name: 'STAKEOUT', damage: 48, pellets: 8,
    headshotMultiplier: 3.0, magazineSize: 6, ammoStockSize: 48, fireRate: 80, cost: 0, boxOnly: true,
    viewmodel: { length: 0.54, color: 0x3a3f46, accent: 0x6e4428 } },
  // DOUBLE-BARREL: classic side-by-side break-action. Double the KRM's pellet
  // damage, a 2-shell break action and a small 36 reserve.
  doubleBarrel: { Class: ShotgunWeapon, category: C.SHOTGUN, name: 'DOUBLE-BARREL', fireMode: 'semi',
    damage: 72, pellets: 8, headshotMultiplier: 3.0, magazineSize: 2, ammoStockSize: 36,
    reloadType: 'magazine', reloadTime: 2.6, fireRate: 160, cost: 0, boxOnly: true,
    viewmodel: { length: 0.56, color: 0x1c2026, accent: 0x8a4a26 } },
  dsr: { Class: WeaponBase, category: C.SNIPER, name: 'DSR-50', damage: 1500, magazineSize: 4, cost: 1500 },
  // SVG-300 (AW): the 2035 DSR — a higher-caliber power sniper. Much harder
  // hitting, but the big rounds mean a tiny mag and a light reserve.
  svg300: { Class: WeaponBase, category: C.SNIPER, name: 'SVG-300', damage: 2500, headshotMultiplier: 3.0,
    scoped: true, fireRate: 50, magazineSize: 3, ammoStockSize: 24, reloadTime: 3.6, recoilPitch: 0.06,
    cost: 0, boxOnly: true, viewmodel: { length: 0.9, color: 0xb8bcc2, accent: 0xff2a1e } },
  // SWISS K31 (Schmidt-Rubin): scopeless straight-pull bolt rifle. Ballista-like
  // (iron sights, 5x head) but a MASSIVE damage jump. Slow bolt fire rate, only
  // 6 rounds, and a long reload from the bolt action.
  k31: { Class: WeaponBase, category: C.SNIPER, name: 'SWISS K31', fireMode: 'semi',
    damage: 450, headshotMultiplier: 5.0, scoped: false, fireRate: 45, magazineSize: 6,
    ammoStockSize: 48, reloadTime: 4.0, recoilPitch: 0.06, cost: 0, boxOnly: true,
    viewmodel: { length: 0.86, color: 0x9a5a28, accent: 0x2a2e34 } },
  // SVU (SVU-AS): scoped semi-auto Dragunov marksman rifle. Like the Ballista but
  // slightly less damage, with a higher mag size + reserve, and an actual scope.
  svu: { Class: WeaponBase, category: C.SNIPER, name: 'SVU', fireMode: 'semi',
    damage: 80, headshotMultiplier: 5.0, scoped: true, fireRate: 330, magazineSize: 10,
    ammoStockSize: 70, reloadTime: 3.0, recoilPitch: 0.04, cost: 0, boxOnly: true,
    viewmodel: { length: 0.8, color: 0x5e2a28, accent: 0x1c1e22 } },
  // BALLISTA (BO2): the only SCOPELESS sniper — runs hooded iron sights. Plays
  // more like the FAL: semi-auto, high-ish body damage with a huge 5x headshot.
  ballista: { Class: WeaponBase, category: C.SNIPER, name: 'BALLISTA', fireMode: 'semi',
    damage: 95, headshotMultiplier: 5.0, scoped: false, fireRate: 330, magazineSize: 8,
    ammoStockSize: 56, reloadTime: 3.0, recoilPitch: 0.045, cost: 0, boxOnly: true,
    viewmodel: { length: 0.78, color: 0x8f8054, accent: 0x1c1e22 } },
  // DRAKON (BO3): scoped semi-auto marksman sniper. Slightly more body damage
  // than the Ballista, 3x head, and fires as fast as you can click (high RPM cap
  // so the trigger isn't the bottleneck). DSR-sized, side-mounted magazine.
  drakon: { Class: WeaponBase, category: C.SNIPER, name: 'DRAKON', fireMode: 'semi',
    damage: 120, headshotMultiplier: 3.0, scoped: true, fireRate: 600, magazineSize: 10,
    ammoStockSize: 60, reloadTime: 3.2, recoilPitch: 0.04, cost: 0, boxOnly: true,
    viewmodel: { length: 0.86, color: 0x3a3f46, accent: 0x6e4424 } },
  hk21: { Class: WeaponBase, category: C.HMG, name: 'HK21', damage: 140, fireRate: 700, magazineSize: 125, cost: 1500 },
  // Launchers should NOT stay instant-kills forever — tuned to stop one-shotting
  // in the round 9-12 window (zombie HP: r9 950, r10 1045, r11 1150, r12 1264).
  // M72 LAW: 1000 splash one-shots through round 9, falls off at round 10.
  rpg: { Class: ProjectileWeapon, category: C.LAUNCHER, name: 'M72 LAW', splashDamage: 1000, splashRadius: 5, cost: 2000, boxOnly: true },
  // RPG-7: very like the M72 but more damage (1200 splash → one-shots through
  // round 11, off at round 12), a smaller reserve and a longer reload.
  rpg7: { Class: ProjectileWeapon, category: C.LAUNCHER, name: 'RPG-7', splashDamage: 1200, splashRadius: 5.2,
    ammoStockSize: 8, reloadTime: 4.0, cost: 0, boxOnly: true,
    viewmodel: { length: 0.92, color: 0x2a2e34, accent: 0x7a4a26 } },
  // HELLION SALVO (BO4): 4-rocket launcher. "Aiming" only eases the FOV in a
  // touch (focusOnly) — the viewmodel never raises. 1300 splash one-shots
  // through round 12, low ~20 reserve.
  hellionSalvo: { Class: ProjectileWeapon, category: C.LAUNCHER, name: 'HELLION SALVO',
    splashDamage: 1300, splashRadius: 5.2, magazineSize: 4, ammoStockSize: 20, reloadTime: 4.6,
    focusOnly: true, adsFov: 65, cost: 0, boxOnly: true,
    viewmodel: { length: 0.94, color: 0x5e6440, accent: 0x6a6f76 } },
  // Death Machine "aims" with the simple focus zoom (no model raise) — the
  // oversized minigun never crowds the screen.
  deathMachine: { Class: WeaponBase, category: C.SPECIAL, name: 'DEATH MACHINE', damage: 160, fireRate: 1000, magazineSize: 300, focusOnly: true, adsFov: 62, cost: 0, boxOnly: true },
  rayGun: {
    Class: ProjectileWeapon, category: C.WONDER, name: 'RAY GUN',
    damage: 1000, magazineSize: 20, fireRate: 140, projectileSpeed: 45,
    splashRadius: 6.4, splashDamage: 600, adsFov: 58, cost: 0, boxOnly: true,
    energyColor: 0x46f060, ejectsBrass: false, // green plasma, no casings
  },
  thundergun: {
    Class: ConeWeapon, category: C.WONDER, name: 'THUNDERGUN',
    fireMode: 'semi', fireRate: 50, magazineSize: 2, ammoStockSize: 16,
    projectileType: 'cone', coneAngle: 0.62, range: 26, damage: 100000,
    reloadTime: 3.4, adsFov: 60, muzzleEffect: 'shockwave',
    viewmodel: { length: 0.7, color: 0x3a2a12, accent: 0x1a1206 },
    cost: 0, boxOnly: true,
  },
};

export function makeWeapon(key) {
  const def = defs[key];
  if (!def) throw new Error(`Unknown weapon: ${key}`);
  const { Class, cost, boxOnly, ...overrides } = { ...categoryDefaults[def.category], ...def };
  return new Class(new WeaponData(overrides));
}

export const WEAPON_KEYS = Object.keys(defs);
export const weaponCost = (key) => defs[key]?.cost ?? 1000;
export const weaponName = (key) => defs[key]?.name ?? key;
export const weaponCategory = (key) => defs[key]?.category ?? 'assaultRifle';

/** Weapons the mystery box can roll (everything, the only place to get the toys). */
export const BOX_POOL = WEAPON_KEYS.filter((k) => k !== 'm1911');

/** Default test loadout spanning the categories, in slot order (keys 1..N). */
export function buildLoadout() {
  return ['m1911', 'galil', 'olympia', 'dsr', 'rayGun', 'thundergun', 'deathMachine', 'rpg'].map(makeWeapon);
}
