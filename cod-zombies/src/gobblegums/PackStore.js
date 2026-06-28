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
}
