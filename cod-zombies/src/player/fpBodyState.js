/**
 * Tiny shared flag so the WeaponSystem can hide its overlay gun while the
 * first-person BODY (PlayerBodySystem) is holding a world-space gun instead.
 * Keeps the two systems decoupled — the body owns this, the weapon reads it.
 */
export const fpBody = { enabled: true };

/**
 * Shared action state written by the WeaponSystem each frame and read by the
 * PlayerBodySystem so the world-held gun + hands can play the action animations
 * (melee / grenade cook / perk drink), which otherwise live only as timers in
 * WeaponSystem. Fields mirror what the old overlay viewmodel consumed.
 */
export const weaponAction = {
  melee: 0,           // 0..1 swing progress (0 = idle)
  cook: null,         // { t, kind } lethal grenade cook, or null
  tacticalCook: null, // { t, kind } tactical cook, or null
  drink: null,        // { t, color } perk drink, or null
};
