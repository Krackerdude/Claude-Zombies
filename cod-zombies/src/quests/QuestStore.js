import { WINDOW_MS, DIFFICULTIES, windowQuests, currentWindow } from './quests.js';

/**
 * Owns the active Black Market Quests rotation and which quest the player has
 * chosen to track. The available set rolls over every 2 hours (see quests.js);
 * the tracked quest id persists on the profile. If a rollover drops the tracked
 * quest, it falls back to the first available one. Broadcasts `quest:changed`
 * (tracked switched) and `quest:refresh` (the window rolled over).
 */
export class QuestStore {
  #profile;
  #events;
  #window;
  #avail;

  constructor(profile, events) {
    this.#profile = profile;
    this.#events = events;
    this.#roll();
  }

  #roll() {
    this.#window = currentWindow();
    this.#avail = windowQuests(this.#window);
  }

  /** Re-roll if the 2-hour window changed since last access. */
  #sync() {
    if (currentWindow() === this.#window) return;
    this.#roll();
    this.#events?.emit('quest:refresh', {});
    // keep the tracked id valid for the new window
    const t = this.tracked();
    if (t) this.#profile?.set('meta.questTracked', t.id);
    this.#events?.emit('quest:changed', { id: t?.id ?? null });
  }

  /** Quests available this window, grouped by difficulty id. */
  byDifficulty() { this.#sync(); return this.#avail; }
  difficulties() { return DIFFICULTIES; }

  /** Flat list of all available quests (easy → hard order). */
  flat() { this.#sync(); return DIFFICULTIES.flatMap((d) => this.#avail[d.id]); }

  /** The currently tracked quest (defaults to the first available). */
  tracked() {
    const id = this.#profile?.get('meta.questTracked', null);
    const f = this.flat();
    return f.find((q) => q.id === id) || f[0] || null;
  }

  isTracked(id) { return this.tracked()?.id === id; }

  setTracked(id) {
    if (!this.flat().some((q) => q.id === id)) return;
    this.#profile?.set('meta.questTracked', id);
    this.#events?.emit('quest:changed', { id });
  }

  /** Step the tracked quest through the available list (widget arrows). */
  cycle(dir) {
    const f = this.flat();
    if (!f.length) return;
    const cur = this.tracked();
    let i = f.findIndex((q) => q.id === cur?.id);
    i = (i + dir + f.length) % f.length;
    this.setTracked(f[i].id);
  }

  /** Milliseconds until the next 2-hour rollover. */
  msToRefresh() { return WINDOW_MS - (Date.now() % WINDOW_MS); }
}
