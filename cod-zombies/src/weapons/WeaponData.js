/**
 * The data half of a weapon (the behavior half is WeaponBase + subclasses).
 * Every field a weapon can vary lives here so designers tune numbers without
 * touching logic. Concrete weapons in catalog.js override only what differs
 * from their category default.
 */

export const WeaponCategory = Object.freeze({
  PISTOL: 'pistol',
  AR: 'assaultRifle',
  SMG: 'smg',
  SHOTGUN: 'shotgun',
  SNIPER: 'sniper',
  HMG: 'hmg',
  LAUNCHER: 'launcher',
  SPECIAL: 'special', // death machine, war machine
  WONDER: 'wonder', // ray gun, thundergun, ...
});

export class WeaponData {
  constructor(o = {}) {
    this.name = o.name ?? 'Weapon';
    this.category = o.category ?? WeaponCategory.AR;

    // ballistics
    this.damage = o.damage ?? 100; // per projectile/pellet
    this.headshotMultiplier = o.headshotMultiplier ?? 1.5;
    this.fireRate = o.fireRate ?? 600; // rounds per minute
    this.fireMode = o.fireMode ?? 'auto'; // auto | semi | burst | pump
    this.burstCount = o.burstCount ?? 3;
    this.range = o.range ?? 120; // m (hitscan)

    // ammo
    this.magazineSize = o.magazineSize ?? 30;
    this.ammoStockSize = o.ammoStockSize ?? 300; // max reserve carried
    this.reloadTime = o.reloadTime ?? 2.2;
    this.reloadType = o.reloadType ?? 'magazine'; // magazine | perShell | none
    this.shellReloadTime = o.shellReloadTime ?? 0.55; // per shell (shotguns)
    this.infiniteReserve = o.infiniteReserve ?? false; // specials

    // dispersion + recoil
    this.spread = o.spread ?? 0.025; // hipfire cone half-angle (rad)
    this.adsSpread = o.adsSpread ?? 0.004; // tightened while aiming
    this.recoilPitch = o.recoilPitch ?? 0.012; // per-shot kick up (rad)
    this.recoilYaw = o.recoilYaw ?? 0.006; // per-shot horizontal kick (rad, signed by pattern)
    this.recoilPattern = o.recoilPattern ?? null; // optional [[pitch,yaw],...]; null = procedural

    // projectiles
    this.projectileType = o.projectileType ?? 'hitscan'; // hitscan | pellets | projectile | cone
    this.pellets = o.pellets ?? 8; // for pellets type
    this.penetrate = o.penetrate ?? false; // pierce multiple zombies (snipers)
    this.projectileSpeed = o.projectileSpeed ?? 40; // m/s (projectile)
    this.splashRadius = o.splashRadius ?? 0;
    this.splashDamage = o.splashDamage ?? 0;
    this.coneAngle = o.coneAngle ?? 0.5; // rad half-angle (cone wonder weapons)

    // optics
    this.adsFov = o.adsFov ?? 52; // zoomed FOV (iron sights / reticle)
    this.adsTime = o.adsTime ?? 0.16; // time to raise sights (s)
    this.scoped = o.scoped ?? false; // draws the sniper scope overlay
    this.scopeFov = o.scopeFov ?? 22; // zoom when scoped

    // movement feel
    this.moveSpeedMult = o.moveSpeedMult ?? 1.0;
    this.adsMoveSpeedMult = o.adsMoveSpeedMult ?? 0.55;

    // presentation hooks (resolved by Viewmodel / audio later)
    this.animationSet = o.animationSet ?? 'rifle';
    this.soundSet = o.soundSet ?? 'rifle';
    this.muzzleEffect = o.muzzleEffect ?? 'standard'; // standard | heavy | energy | none
    this.energyColor = o.energyColor ?? 0x46f060; // plasma tint: chamber glow, muzzle, bolt, impact
    this.ejectsBrass = o.ejectsBrass ?? true; // energy weapons set false (no casings)
    this.viewmodel = o.viewmodel ?? { length: 0.55, color: 0x20242b, accent: 0x111316 };
  }
}

/** Sensible per-category baselines; catalog entries spread over these. */
export const categoryDefaults = {
  [WeaponCategory.PISTOL]: { fireMode: 'semi', fireRate: 360, magazineSize: 12, ammoStockSize: 120, reloadTime: 1.4, damage: 70, spread: 0.02, adsFov: 55, viewmodel: { length: 0.32, color: 0x2a2d33, accent: 0x111316 } },
  [WeaponCategory.AR]: { fireMode: 'auto', fireRate: 600, magazineSize: 30, ammoStockSize: 300, reloadTime: 2.2, damage: 110, spread: 0.022, viewmodel: { length: 0.6, color: 0x23272e, accent: 0x111316 } },
  [WeaponCategory.SMG]: { fireMode: 'auto', fireRate: 850, magazineSize: 32, ammoStockSize: 320, reloadTime: 1.9, damage: 75, spread: 0.03, recoilPitch: 0.008, viewmodel: { length: 0.45, color: 0x262a31, accent: 0x111316 } },
  [WeaponCategory.SHOTGUN]: { fireMode: 'pump', fireRate: 75, magazineSize: 6, ammoStockSize: 48, reloadType: 'perShell', damage: 38, pellets: 8, projectileType: 'pellets', spread: 0.12, adsSpread: 0.08, range: 30, recoilPitch: 0.03, viewmodel: { length: 0.62, color: 0x3a2c20, accent: 0x161009 } },
  [WeaponCategory.SNIPER]: { fireMode: 'semi', fireRate: 55, magazineSize: 5, ammoStockSize: 40, reloadTime: 3.0, damage: 850, scoped: true, penetrate: true, spread: 0.05, adsSpread: 0.0, recoilPitch: 0.05, range: 250, viewmodel: { length: 0.85, color: 0x1c1f24, accent: 0x0c0d10 } },
  [WeaponCategory.HMG]: { fireMode: 'auto', fireRate: 720, magazineSize: 100, ammoStockSize: 400, reloadTime: 5.0, damage: 130, spread: 0.04, recoilPitch: 0.01, moveSpeedMult: 0.8, viewmodel: { length: 0.75, color: 0x1f2228, accent: 0x0c0d10 } },
  [WeaponCategory.LAUNCHER]: { fireMode: 'semi', fireRate: 40, magazineSize: 1, ammoStockSize: 12, reloadTime: 3.2, damage: 0, projectileType: 'projectile', projectileSpeed: 38, splashRadius: 4.5, splashDamage: 1200, spread: 0.0, viewmodel: { length: 0.9, color: 0x2c3a2a, accent: 0x12180f } },
  [WeaponCategory.SPECIAL]: { fireMode: 'auto', fireRate: 900, magazineSize: 250, ammoStockSize: 0, reloadType: 'none', infiniteReserve: false, damage: 140, spread: 0.05, recoilPitch: 0.006, moveSpeedMult: 0.7, muzzleEffect: 'heavy', viewmodel: { length: 0.95, color: 0x14161a, accent: 0x000000 } },
  [WeaponCategory.WONDER]: { fireMode: 'semi', fireRate: 120, magazineSize: 20, ammoStockSize: 160, reloadTime: 2.6, projectileType: 'projectile', muzzleEffect: 'energy', viewmodel: { length: 0.6, color: 0x123a33, accent: 0x041a17 } },
};
