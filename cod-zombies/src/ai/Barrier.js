import { BarrierConfig } from '../config/zombies.js';

/**
 * A boarded window: the only thing separating the playable interior from the
 * exterior spawn void. It has `maxBoards` planks (CoD-style, 6 hits). Zombies
 * tear one board at a time before they can climb through; the player can rebuild
 * boards by holding interact nearby. It is "open" (passable on the nav graph)
 * only when every board is gone.
 *
 * Note: the player is blocked from passing a window by a separate static
 * collider regardless of board count — boards gate *zombie* entry, not the
 * player. Zombies are nav-driven and ignore the collider.
 */
export class Barrier {
  constructor({ id, position, teardownable = true, maxBoards = BarrierConfig.maxBoards }) {
    this.id = id;
    this.position = position; // THREE.Vector3 (world)
    this.teardownable = teardownable;
    this.maxBoards = maxBoards;
    this.boards = maxBoards;
    this.tearAcc = 0;
    this.repairAcc = 0;
  }

  /** Passable on the nav graph once fully torn. */
  get open() { return this.boards <= 0; }

  /** Rip a single board off immediately (timing is now owned per-zombie so a
   *  crowd can't share one accumulator and strip the whole window at once).
   *  @returns {{removed:boolean, opened:boolean}} */
  removeBoard() {
    if (this.boards <= 0) return { removed: false, opened: false };
    this.boards--;
    return { removed: true, opened: this.boards <= 0 };
  }

  /** Player rebuilds boards. @returns {{added:boolean, closed:boolean}} */
  repair(dt) {
    if (this.boards >= this.maxBoards) return { added: false, closed: false };
    this.repairAcc += dt;
    if (this.repairAcc < BarrierConfig.boardRepairTime) return { added: false, closed: false };
    this.repairAcc = 0;
    const wasOpen = this.boards <= 0;
    this.boards++;
    return { added: true, closed: wasOpen };
  }
}
