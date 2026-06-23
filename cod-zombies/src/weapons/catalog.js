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
  dsr: { Class: WeaponBase, category: C.SNIPER, name: 'DSR-50', damage: 1500, magazineSize: 4, cost: 1500 },
  hk21: { Class: WeaponBase, category: C.HMG, name: 'HK21', damage: 140, fireRate: 700, magazineSize: 125, cost: 1500 },
  rpg: { Class: ProjectileWeapon, category: C.LAUNCHER, name: 'M72 LAW', splashDamage: 1400, splashRadius: 5, cost: 2000, boxOnly: true },
  deathMachine: { Class: WeaponBase, category: C.SPECIAL, name: 'DEATH MACHINE', damage: 160, fireRate: 1000, magazineSize: 300, cost: 0, boxOnly: true },
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
