import { RoundConfig, ZombieConfig, zombieHealthForRound } from '../config/zombies.js';

/**
 * Drives the round loop: an intermission countdown, then a wave whose size,
 * health, and speed scale with the round number. A round ends when the spawn
 * manager has no zombies left owed; then the next intermission begins.
 */
export class RoundManager {
  round = 0;
  state = 'intermission'; // intermission | active
  #timer = 0;
  #spawn;
  #events;

  constructor(spawn, events) {
    this.#spawn = spawn;
    this.#events = events;
  }

  reset() {
    this.round = 0;
    this.state = 'intermission';
    this.#timer = 1.0; // brief beat before round 1
    this.#events.emit('round:changed', { round: 0, state: 'intermission' });
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
    } else if (this.#spawn.remaining <= 0) {
      this.state = 'intermission';
      this.#timer = RoundConfig.interRoundDelay;
      this.#events.emit('round:cleared', { round: this.round });
    }
  }
}
