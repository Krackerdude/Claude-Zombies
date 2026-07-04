/**
 * Tiny shared flag so the WeaponSystem can hide its overlay gun while the
 * first-person BODY (PlayerBodySystem) is holding a world-space gun instead.
 * Keeps the two systems decoupled — the body owns this, the weapon reads it.
 */
export const fpBody = { enabled: false };
