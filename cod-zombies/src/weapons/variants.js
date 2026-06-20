import { WeaponBase } from './WeaponBase.js';

/**
 * Category-specific behavior layered over WeaponBase. Most guns (pistol, AR,
 * SMG, sniper, HMG, death machine) are pure hitscan and need no subclass — the
 * base + data covers them, with the sniper's `penetrate` flag handled in base.
 * These three change *what a shot is*.
 */

/** Fires a spread of pellets in one trigger pull; per-shell reload via data. */
export class ShotgunWeapon extends WeaponBase {
  onFire(ctx) {
    ctx.fireHitscan(this, this.data.pellets, this.currentSpread(), { perPelletJitter: true });
  }
}

/** Launches a travelling projectile (rocket, ray-gun bolt) with optional splash. */
export class ProjectileWeapon extends WeaponBase {
  onFire(ctx) {
    ctx.spawnProjectile(this);
  }
}

/** Wonder-weapon: a wide cone blast that shreds everything in front (Thundergun). */
export class ConeWeapon extends WeaponBase {
  onFire(ctx) {
    ctx.fireCone(this);
  }
}

/** Marker base for wonder weapons, so they can carry shared upgrade hooks later. */
export class WonderWeapon extends WeaponBase {}
