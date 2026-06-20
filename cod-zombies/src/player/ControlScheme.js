import { Action } from '../config/keybinds.js';

/**
 * Translates raw input actions into movement *intent*, honouring the per-action
 * toggle/hold modes from settings. Holds sticky state for toggled actions.
 *
 * Discrete edges (crouchEdge for slide, proneEdge for dive, jump) are always
 * the raw press edge regardless of mode. The continuous "want" booleans
 * (wantCrouch, wantProne, sprintHeld, aimHeld) are either the live held state
 * (hold mode) or the latched toggle (toggle mode). This is what lets the player
 * pick toggle-vs-hold per action without any gameplay code changing.
 */
export class ControlScheme {
  #actions;
  #settings;
  #toggles = { crouch: false, prone: false, sprint: false, aim: false };
  // Latched press-edges. Captured every render frame by poll() and consumed by
  // resolve() in the fixed step. This is what makes jump/slide/dive reliable:
  // at >60fps many frames run zero fixed steps, and a raw edge read inside the
  // fixed step would be cleared before any step sees it. Latching bridges that.
  #edges = { jump: false, crouch: false, slide: false, prone: false, sprintTgl: false, crouchTgl: false, proneTgl: false, aimTgl: false };

  constructor(actions, settings, events) {
    this.#actions = actions;
    this.#settings = settings;
    // When a mode flips to "hold", drop any stale latch so state is consistent.
    events.on('settings:controls', (c) => {
      if (c.crouchMode === 'hold') this.#toggles.crouch = false;
      if (c.proneMode === 'hold') this.#toggles.prone = false;
      if (c.sprintMode === 'hold') this.#toggles.sprint = false;
      if (c.aimMode === 'hold') this.#toggles.aim = false;
    });
  }

  /** Capture raw press-edges every frame (called from PlayerSystem.update). */
  poll() {
    const a = this.#actions;
    const e = this.#edges;
    if (a.pressed(Action.JUMP)) e.jump = true;
    if (a.pressed(Action.CROUCH)) { e.crouch = true; e.crouchTgl = true; }
    if (a.pressed(Action.SLIDE)) e.slide = true;
    if (a.pressed(Action.PRONE)) { e.prone = true; e.proneTgl = true; }
    if (a.pressed(Action.SPRINT)) e.sprintTgl = true;
    if (a.pressed(Action.AIM)) e.aimTgl = true;
  }

  clearEdges() {
    const e = this.#edges;
    e.jump = e.crouch = e.slide = e.prone = e.sprintTgl = e.crouchTgl = e.proneTgl = e.aimTgl = false;
  }

  /** Resolve a single action into a held boolean given its mode + a toggle slot. */
  #resolveHeld(action, mode, slot, toggled) {
    if (mode === 'toggle') {
      if (toggled) this.#toggles[slot] = !this.#toggles[slot];
      return this.#toggles[slot];
    }
    this.#toggles[slot] = false;
    return this.#actions.active(action);
  }

  /** Fill the provided intent object (reused to avoid allocation). */
  resolve(intent) {
    const a = this.#actions;
    const c = this.#settings.controls;
    const e = this.#edges;

    intent.forward = a.axis(Action.MOVE_BACKWARD, Action.MOVE_FORWARD);
    intent.strafe = a.axis(Action.MOVE_LEFT, Action.MOVE_RIGHT);

    intent.sprintHeld = this.#resolveHeld(Action.SPRINT, c.sprintMode, 'sprint', e.sprintTgl);
    intent.wantCrouch = this.#resolveHeld(Action.CROUCH, c.crouchMode, 'crouch', e.crouchTgl);
    intent.wantProne = this.#resolveHeld(Action.PRONE, c.proneMode, 'prone', e.proneTgl);
    intent.aimHeld = this.#resolveHeld(Action.AIM, c.aimMode, 'aim', e.aimTgl);

    // edges (latched): crouch/slide bind starts a slide; prone starts a dive
    intent.crouchEdge = e.crouch || e.slide;
    intent.proneEdge = e.prone;
    intent.jumpPressed = e.jump;

    this.#clearEdges();
    return intent;
  }

  #clearEdges() { this.clearEdges(); }
}
