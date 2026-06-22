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
  galil: { Class: WeaponBase, category: C.AR, name: 'GALIL', damage: 120, fireRate: 575, recoilPitch: 0.014, cost: 1200 },
  // RK-5: semi-futuristic 3-round-burst pistol. 100 body / 300 headshot (x3.0).
  rk5: { Class: WeaponBase, category: C.PISTOL, name: 'RK-5', fireMode: 'burst', burstCount: 3,
    damage: 100, headshotMultiplier: 3.0, fireRate: 700, magazineSize: 20, ammoStockSize: 140,
    reloadTime: 1.6, recoilPitch: 0.016, cost: 500,
    viewmodel: { length: 0.36, color: 0x474b54, accent: 0x0e0f12 } },
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
