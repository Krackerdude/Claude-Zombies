import { Service } from '../core/ServiceLocator.js';

/**
 * Liquid Divinium — the first mechanic that persists across sessions. It is the
 * crafting currency for Dr. Newton's Factory (GobbleGums) and is earned purely
 * by *spending points*: every purchase rolls for a drop.
 *
 * Earning rules (per the design):
 *   - Base: every purchase has a flat 10% chance to drop Liquid Divinium.
 *   - Milestone: each time the round crosses a multiple of 7 (7, 14, 21 ...) the
 *     NEXT purchase is a GUARANTEED drop. After that one guaranteed drop the rate
 *     falls back to 10% until the following 7-round milestone re-arms it.
 *   - A drop awards 1–3 vials (random). The guaranteed milestone drop is still a
 *     drop, so it too awards 1–3.
 *
 * The balance lives in the persistent profile (`currency.liquidDivinium`), so it
 * survives reloads. The milestone-arm state is per-run and resets with the field.
 *
 * This manager owns no rendering — it just emits `divinium:earned` { amount,
 * total } for the HUD popup + factory widget to react to.
 */
const DROP_CHANCE = 0.10;
const MILESTONE_ROUNDS = 7;
const MIN_DROP = 1;
const MAX_DROP = 3;
const CURRENCY_PATH = 'currency.liquidDivinium';

export class DiviniumManager {
  #events;
  #profile;
  #round;

  // Highest 7-round milestone we've already armed a guaranteed drop for, and
  // whether that guaranteed drop is still owed. Both reset per run.
  #lastMilestone = 0;
  #guaranteedPending = false;

  constructor({ events, profile, round, rng = Math.random } = {}) {
    this.#events = events;
    this.#profile = profile;
    this.#round = round; // RoundManager (has .round)
    this.rng = rng;

    this.#events.on('purchase', () => this.#onPurchase());
    this.#events.on('round:changed', ({ round }) => this.#onRound(round));
    // a fresh run / restart wipes the per-run milestone arming
    this.#events.on('run:reset', () => this.#resetRun());
  }

  /** Current persisted balance. */
  count() { return this.#profile?.get(CURRENCY_PATH, 0) ?? 0; }

  /** Re-arm tracking for a new run (called on run:reset and round 0). */
  #resetRun() {
    this.#lastMilestone = 0;
    this.#guaranteedPending = false;
  }

  #onRound(round) {
    if (round === 0) { this.#resetRun(); return; }
    // Crossed into a new 7-round milestone? Arm one guaranteed drop.
    const milestone = Math.floor(round / MILESTONE_ROUNDS) * MILESTONE_ROUNDS;
    if (milestone >= MILESTONE_ROUNDS && milestone > this.#lastMilestone) {
      this.#lastMilestone = milestone;
      this.#guaranteedPending = true;
    }
  }

  #onPurchase() {
    let drop = false;
    if (this.#guaranteedPending) {
      drop = true;
      this.#guaranteedPending = false; // consumed — back to the base rate
    } else {
      drop = this.rng() < DROP_CHANCE;
    }
    if (!drop) return;

    const amount = MIN_DROP + Math.floor(this.rng() * (MAX_DROP - MIN_DROP + 1));
    this.grant(amount);
  }

  /**
   * Add `amount` vials to the persistent balance and announce it. Used by the
   * earning roll and by the dev menu. Pass { silent } to bank without the popup.
   */
  grant(amount, { silent = false } = {}) {
    if (!amount || amount <= 0) return this.count();
    const total = this.count() + amount;
    this.#profile?.set(CURRENCY_PATH, total);
    if (!silent) this.#events.emit('divinium:earned', { amount, total });
    else this.#events.emit('divinium:changed', { total });
    return total;
  }
}

/** Wire the manager into the service container (call once Round + Profile exist). */
export function registerDivinium(engine) {
  const events = engine.services.get(Service.Events);
  const profile = engine.services.has(Service.Profile) ? engine.services.get(Service.Profile) : null;
  const round = engine.services.has(Service.Round) ? engine.services.get(Service.Round) : null;
  const mgr = new DiviniumManager({ events, profile, round });
  engine.services.register(Service.Divinium, mgr);
  return mgr;
}
