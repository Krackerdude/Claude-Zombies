import { RoundConfig, HoundConfig, zombieHealthForRound } from '../config/zombies.js';

/**
 * Drives the round loop: an intermission countdown, then a wave whose size,
 * health, and speed scale with the round number. A round ends when the spawn
 * manager has no zombies left owed; then the next intermission begins.
 *
 * Special ("dog") rounds are interleaved: queueSpecialRound() clears the field
 * and makes the NEXT round a hellhound wave (driven by the HoundManager instead
 * of the SpawnManager). A special round doesn't advance the round number, so the
 * normal progression resumes right after it.
 */
export class RoundManager {
  round = 0;
  state = 'intermission'; // intermission | active
  special = false; // true while a hellhound round is active
  #timer = 0;
  #spawn;
  #hounds;
  #events;
  #pendingSpecial = false;

  constructor(spawn, events, hounds = null) {
    this.#spawn = spawn;
    this.#hounds = hounds;
    this.#events = events;
  }

  reset() {
    this.round = 0;
    this.state = 'intermission';
    this.special = false;
    this.#pendingSpecial = false;
    this.#hounds?.reset();
    this.#timer = 1.0; // brief beat before round 1
    this.#events.emit('round:changed', { round: 0, state: 'intermission' });
  }

  /** Dev/scripted: clear the field NOW and make the next round a hellhound
   *  special. Works mid-round — the current wave is wiped and a short
   *  intermission spins up the dog round. */
  queueSpecialRound() {
    if (!this.#hounds) return;
    this.#spawn.reset();
    this.#hounds.reset();
    this.#pendingSpecial = true;
    this.special = false;
    this.state = 'intermission';
    this.#timer = 1.0;
    this.#events.emit('round:cleared', { round: this.round });
    this.#events.emit('round:changed', { round: this.round, state: 'intermission' });
  }

  /** Dev: clear the field and start the given round next (sets round-1, forces a
   *  brief intermission so the normal #startNext spins up round N's wave). */
  jumpToRound(n) {
    this.#spawn.reset();
    this.round = Math.max(0, (n | 0) - 1);
    this.state = 'intermission';
    this.#timer = 0.25;
    this.#events.emit('round:changed', { round: this.round, state: 'intermission' });
  }

  #startNext() {
    // a queued hellhound round runs in place of the next wave WITHOUT advancing
    // the round counter — the horde picks back up where it left off afterwards.
    if (this.#pendingSpecial && this.#hounds) {
      this.#pendingSpecial = false;
      this.special = true;
      const r = Math.max(1, this.round);
      const count = Math.min(HoundConfig.baseCount + r * HoundConfig.countPerRound, HoundConfig.maxCount);
      const health = HoundConfig.baseHealth + (r - 1) * HoundConfig.healthPerRound;
      this.#hounds.beginWave(count, { health, round: r });
      this.state = 'active';
      this.#events.emit('round:changed', { round: this.round, state: 'active', special: true, count });
      return;
    }
    this.special = false;
    this.round++;
    const count = Math.min(RoundConfig.baseCount + this.round * RoundConfig.countPerRound, RoundConfig.maxCount);
    const stats = {
      health: zombieHealthForRound(this.round),
      round: this.round, // spawn manager assigns per-zombie gait + speed
    };
    this.#spawn.beginWave(count, stats);
    this.state = 'active';
    this.#events.emit('round:changed', { round: this.round, state: 'active', count });
  }

  update(dt) {
    if (this.state === 'intermission') {
      this.#timer -= dt;
      if (this.#timer <= 0) this.#startNext();
    } else if ((this.special ? this.#hounds.remaining : this.#spawn.remaining) <= 0) {
      this.state = 'intermission';
      this.special = false;
      this.#timer = RoundConfig.interRoundDelay;
      this.#events.emit('round:cleared', { round: this.round });
    }
  }
}
