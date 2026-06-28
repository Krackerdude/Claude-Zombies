import { levelFromXp } from '../profile/index.js';
import { slotHtml } from './gumBall.js';

/**
 * The player widget — level badge, name, and the five GobbleGum slots of the
 * equipped pack. There is exactly ONE instance; it is physically re-parented
 * between the main menu (top-right), the GobbleGum pack menu (top-left) and the
 * catalog (bottom-left) rather than duplicated, so every screen shows the same
 * live state. Repaints itself whenever the profile or the equipped pack changes.
 *
 * In editable mode (while customizing in the catalog), clicking a slot selects
 * it for replacement (orange highlight) via the PackStore.
 */
export class PlayerWidget {
  el;
  #profile; #packs; #events;
  #editable = false;

  constructor({ profile, packs, events }) {
    this.#profile = profile;
    this.#packs = packs;
    this.#events = events;

    const el = document.createElement('div');
    el.className = 'mm-player';
    el.innerHTML = `
      <div class="pw-row">
        <div class="pw-lvl"><span class="mm-lvl">0</span><small>LVL</small></div>
        <div class="pw-name"><span class="mm-name">Survivor One</span></div>
      </div>
      <div class="pw-gums"><span class="pw-gum-tag">GUM</span><div class="mm-gums"></div></div>`;
    this.el = el;

    el.querySelector('.mm-gums').addEventListener('click', (e) => {
      if (!this.#editable) return;
      const slot = e.target.closest('.mm-gum-slot');
      if (slot) this.#packs.selectSlot(parseInt(slot.dataset.slot, 10));
    });

    this.#events?.on('gobblegum:changed', () => this.refresh());
    this.#events?.on('profile:changed', () => this.refresh());
    this.#events?.on('profile:loaded', () => this.refresh());
    this.refresh();
  }

  /**
   * Move the single widget into a container at an explicit corner. `scale` grows
   * it from whichever corner it's anchored to (so it never drifts off-screen).
   */
  mountTo(container, { top = 'auto', right = 'auto', bottom = 'auto', left = 'auto' } = {}, scale = 1.3) {
    const s = this.el.style;
    s.position = 'absolute'; s.top = top; s.right = right; s.bottom = bottom; s.left = left;
    s.transformOrigin = `${top !== 'auto' ? 'top' : 'bottom'} ${left !== 'auto' ? 'left' : 'right'}`;
    s.setProperty('--pw-scale', scale);
    container.appendChild(this.el);
  }

  /** Enable slot selection + highlight (only while customizing a pack). */
  setEditable(on) {
    this.#editable = on;
    this.el.classList.toggle('mm-editable', on);
    this.refresh();
  }

  refresh() {
    const xp = this.#profile?.get('progression.xp', 0) ?? 0;
    const name = this.#profile?.get('identity.displayName', 'Survivor One') ?? 'Survivor One';
    this.el.querySelector('.mm-lvl').textContent = String(levelFromXp(xp).level);
    this.el.querySelector('.mm-name').textContent = name;

    const slots = this.#packs?.slots() ?? new Array(5).fill(null);
    const sel = this.#editable ? this.#packs?.selectedSlot : -1;
    this.el.querySelector('.mm-gums').innerHTML = slots.map((id, i) =>
      `<div class="mm-gum-slot${i === sel ? ' sel' : ''}" data-slot="${i}">${slotHtml(id, 32)}</div>`,
    ).join('');
  }
}
