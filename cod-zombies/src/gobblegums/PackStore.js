import { PACK_SLOTS, defaultPacks } from '../profile/schema.js';

/**
 * The player's GobbleGum loadout state — which pack is equipped and what gum ids
 * fill each pack's five slots. Reads/writes the persistent profile (so packs
 * survive across sessions) and broadcasts `gobblegum:changed` so every menu and
 * the shared player widget repaint from one source of truth.
 *
 * Slot editing rules (driven by the catalog):
 *   - With no slot selected, clicking a gum fills the leftmost EMPTY slot.
 *   - Clicking a filled slot SELECTS it (highlighted); the next gum click then
 *     replaces that slot and clears the selection.
 *   - A gum can only appear once per pack (duplicates are ignored).
 * The selected-slot highlight is transient UI state and is not persisted.
 */
export class PackStore {
  #profile;
  #events;
  #selected = -1; // selected slot index for replacement, or -1

  constructor(profile, events) {
    this.#profile = profile;
    this.#events = events;
  }

  #data() {
    let g = this.#profile?.get('gobblegum');
    if (!g || !Array.isArray(g.packs)) {
      g = { equipped: 0, packs: defaultPacks() };
      this.#profile?.set('gobblegum', g);
    }
    return g;
  }

  #commit() { this.#profile?.set('gobblegum', this.#data()); this.#emit(); }
  #emit() { this.#events?.emit('gobblegum:changed', { equipped: this.equippedIndex }); }

  // --- packs --------------------------------------------------------------

  get packs() { return this.#data().packs; }
  get equippedIndex() { return this.#data().equipped | 0; }
  get equippedPack() { return this.packs[this.equippedIndex] ?? this.packs[0]; }

  /** Slots (gum ids / null) of a pack — defaults to the equipped pack. */
  slots(i = this.equippedIndex) { return this.packs[i]?.slots ?? []; }

  /** Equip (select) a pack by index. Clears any pending slot selection. */
  equip(i) {
    if (i < 0 || i >= this.packs.length) return;
    this.#data().equipped = i;
    this.#selected = -1;
    this.#commit();
  }

  // --- slot editing (operates on the equipped pack) -----------------------

  get selectedSlot() { return this.#selected; }

  /** Toggle the highlighted slot used for replacement. */
  selectSlot(i) {
    this.#selected = this.#selected === i ? -1 : i;
    this.#emit();
  }

  clearSelection() {
    if (this.#selected === -1) return;
    this.#selected = -1;
    this.#emit();
  }

  /**
   * Place a gum into the equipped pack: into the selected slot if one is held,
   * else the leftmost empty slot. No-ops on duplicates or when full + unselected.
   * Returns true if the pack changed.
   */
  placeGum(gumId) {
    const slots = this.equippedPack.slots;
    const existing = slots.indexOf(gumId);

    if (this.#selected >= 0) {
      // replacing a chosen slot: ignore if that exact gum already sits elsewhere
      if (existing >= 0 && existing !== this.#selected) { this.clearSelection(); return false; }
      slots[this.#selected] = gumId;
      this.#selected = -1;
      this.#commit();
      return true;
    }

    if (existing >= 0) return false; // already in the pack, no empty-fill duplicate
    const empty = slots.indexOf(null);
    if (empty === -1) return false;  // full — must select a slot to replace
    slots[empty] = gumId;
    this.#commit();
    return true;
  }

  /** Empty a single slot of the equipped pack. */
  clearSlot(i) {
    const slots = this.equippedPack.slots;
    if (i < 0 || i >= slots.length || slots[i] == null) return;
    slots[i] = null;
    this.#commit();
  }

  get slotCount() { return PACK_SLOTS; }

  // --- gum inventory (owned counts, filled by Dr. Newton's Factory) --------
  // Stored in the same persistent `gobblegum` bucket under `inventory`:
  //   { [gumId]: count }. This is the stock the player has crafted and can
  // spend/consume; the packs above are just which gums are *equipped*.

  #inv() {
    const d = this.#data();
    if (!d.inventory || typeof d.inventory !== 'object') d.inventory = {};
    return d.inventory;
  }

  /** How many of a gum the player owns. */
  owned(gumId) { return this.#inv()[gumId] | 0; }

  /** The whole { gumId: count } map (a copy). */
  inventory() { return { ...this.#inv() }; }

  /** Total gums owned across all ids. */
  totalOwned() { return Object.values(this.#inv()).reduce((n, c) => n + (c | 0), 0); }

  /** Add `n` of a gum to the owned stock. Returns the new count. */
  grantGum(gumId, n = 1) {
    if (!gumId || n <= 0) return this.owned(gumId);
    const inv = this.#inv();
    inv[gumId] = (inv[gumId] | 0) + n;
    this.#commit();
    return inv[gumId];
  }

  /** Grant many at once (e.g. a factory roll). `rewards` = [{ gum, count }]. */
  grantMany(rewards = []) {
    const inv = this.#inv();
    let any = false;
    for (const r of rewards) {
      if (!r?.gum || !(r.count > 0)) continue;
      inv[r.gum] = (inv[r.gum] | 0) + r.count;
      any = true;
    }
    if (any) this.#commit();
    return any;
  }

  /** Remove `n` of a gum (e.g. a Cookbook trade). Returns true if it went through. */
  consumeGum(gumId, n = 1) {
    const inv = this.#inv();
    if (n <= 0 || (inv[gumId] | 0) < n) return false;
    inv[gumId] -= n;
    if (inv[gumId] <= 0) delete inv[gumId];
    this.#commit();
    return true;
  }
}
