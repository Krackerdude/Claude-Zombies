/**
 * The single source of truth for input *intent*. Systems ask the InputActions
 * layer about abstract actions (MOVE_FORWARD, JUMP, …) and never touch raw key
 * codes. The keybinds menu will mutate `defaultBindings` (or a user override of
 * it) and call InputActions.rebind() — no gameplay code needs to change.
 *
 * Key identifiers use KeyboardEvent.code ("KeyW", "Space", "ShiftLeft", …).
 * Mouse buttons use the synthetic codes "Mouse0" (left), "Mouse1" (middle),
 * "Mouse2" (right).
 */

export const Action = Object.freeze({
  MOVE_FORWARD: 'MOVE_FORWARD',
  MOVE_BACKWARD: 'MOVE_BACKWARD',
  MOVE_LEFT: 'MOVE_LEFT',
  MOVE_RIGHT: 'MOVE_RIGHT',
  JUMP: 'JUMP',
  SPRINT: 'SPRINT',
  CROUCH: 'CROUCH',
  PRONE: 'PRONE',
  SLIDE: 'SLIDE',
  INTERACT: 'INTERACT',
  RELOAD: 'RELOAD',
  FIRE: 'FIRE',
  AIM: 'AIM',
  MELEE: 'MELEE',
  LETHAL: 'LETHAL',
  FLASHLIGHT: 'FLASHLIGHT',
  PAUSE: 'PAUSE',
});

/** action -> array of bound key codes (multiple bindings allowed per action). */
export const defaultBindings = {
  [Action.MOVE_FORWARD]: ['KeyW'],
  [Action.MOVE_BACKWARD]: ['KeyS'],
  [Action.MOVE_LEFT]: ['KeyA'],
  [Action.MOVE_RIGHT]: ['KeyD'],
  [Action.JUMP]: ['Space'],
  [Action.SPRINT]: ['ShiftLeft'],
  [Action.CROUCH]: ['ControlLeft', 'KeyC'],
  [Action.PRONE]: ['KeyX'],
  [Action.SLIDE]: ['KeyZ'],
  [Action.INTERACT]: ['KeyE'],
  [Action.RELOAD]: ['KeyR'],
  [Action.FIRE]: ['Mouse0'],
  [Action.AIM]: ['Mouse2'],
  [Action.MELEE]: ['KeyF'],
  [Action.LETHAL]: ['KeyG'],
  [Action.FLASHLIGHT]: ['KeyK'],
  [Action.PAUSE]: ['Escape'],
};
