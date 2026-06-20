/**
 * Player locomotion states. Stance (capsule profile) is tracked separately on
 * PlayerTag because several states share a profile (walk/sprint = stand).
 *
 * Transition philosophy (anti-clunk): every transition is re-evaluated from the
 * *current* intent each fixed tick. Nothing waits for a key to be released
 * before allowing the next action — holding crouch, tapping crouch, jumping,
 * and sprinting all compose freely. Discrete actions (jump, slide start) use
 * press edges + buffers; continuous modes (sprint, crouch) use held state.
 */
export const MoveState = Object.freeze({
  WALK: 'walk',
  SPRINT: 'sprint',
  CROUCH: 'crouch',
  PRONE: 'prone',
  SLIDE: 'slide',
  AIR: 'air',
  DIVE: 'dive',
});

/** States that are airborne (no ground friction, gravity integrates). */
export const AIRBORNE = new Set([MoveState.AIR, MoveState.DIVE]);
