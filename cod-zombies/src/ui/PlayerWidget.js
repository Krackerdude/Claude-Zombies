import { levelFromXp } from '../profile/index.js';
import { slotHtml } from './gumBall.js';
import { rewardColor, rewardLabel } from '../quests/quests.js';
import { selectedEmblem, selectedCallingCard, onIdentityChange } from './identity.js';

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
  #profile; #packs; #events; #quests;
  #editable = false; #showQuest = false;

  constructor({ profile, packs, quests = null, events }) {
    this.#profile = profile;
    this.#packs = packs;
    this.#quests = quests;
    this.#events = events;

    const el = document.createElement('div');
    el.className = 'mm-player';
    el.innerHTML = `
      <div class="pw-plate">
        <div class="pw-name"><span class="mm-name">Survivor One</span></div>
        <div class="pw-card">
          <div class="pw-emblem" title="Emblem"></div>
          <div class="pw-cc">
            <div class="pw-cc-art"></div>
            <div class="pw-lvl"><span class="mm-lvl">0</span></div>
          </div>
          <div class="pw-xp" title="XP"><i class="pw-xp-fill"></i></div>
        </div>
      </div>
      <div class="pw-gums"><span class="pw-gum-tag">GUM</span><div class="mm-gums"></div></div>
      <div class="pw-quest" hidden>
        <div class="pw-quest-plate">
          <div class="pw-quest-txt"><span class="pw-quest-tag">Current Quest</span><span class="pw-quest-name">—</span></div>
          <span class="pw-ring pw-quest-ring" style="--qp:0"></span>
        </div>
        <div class="pw-quest-pop">
          <div class="pw-quest-obj">—</div>
          <div class="pw-quest-rw">—</div>
        </div>
      </div>`;
    this.el = el;

    el.querySelector('.mm-gums').addEventListener('click', (e) => {
      if (!this.#editable) return;
      const slot = e.target.closest('.mm-gum-slot');
      if (slot) this.#packs.selectSlot(parseInt(slot.dataset.slot, 10));
    });

    this.#events?.on('gobblegum:changed', () => this.refresh());
    this.#events?.on('profile:changed', () => this.refresh());
    this.#events?.on('profile:loaded', () => this.refresh());
    this.#events?.on('quest:changed', () => this.refresh());
    this.#events?.on('quest:refresh', () => this.refresh());
    onIdentityChange(() => this.refresh()); // repaint on emblem / calling-card change
    this.refresh();
  }

  /** Show the Current Quest section — only on the main menu, not other contexts. */
  setShowQuest(on) {
    this.#showQuest = on;
    const q = this.el.querySelector('.pw-quest');
    if (q) q.hidden = !on;
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
    const lv = levelFromXp(xp);
    this.el.querySelector('.mm-lvl').textContent = String(lv.level);
    this.el.querySelector('.mm-name').textContent = name;
    const xpFill = this.el.querySelector('.pw-xp-fill');
    if (xpFill) xpFill.style.width = `${Math.round((lv.max ? 1 : lv.ratio) * 100)}%`;

    // equipped identity — emblem badge + calling-card banner
    const em = this.el.querySelector('.pw-emblem');
    if (em) em.innerHTML = selectedEmblem().svg;
    const cc = this.el.querySelector('.pw-cc-art');
    if (cc) cc.innerHTML = selectedCallingCard().svg;

    const slots = this.#packs?.slots() ?? new Array(5).fill(null);
    const sel = this.#editable ? this.#packs?.selectedSlot : -1;
    this.el.querySelector('.mm-gums').innerHTML = slots.map((id, i) =>
      `<div class="mm-gum-slot${i === sel ? ' sel' : ''}" data-slot="${i}">${slotHtml(id, 32)}</div>`,
    ).join('');

    // Current Quest (main-menu only)
    if (this.#showQuest && this.#quests) {
      const q = this.#quests.tracked();
      const sec = this.el.querySelector('.pw-quest');
      if (q && sec) {
        sec.style.setProperty('--rk', rewardColor(q.reward));
        sec.querySelector('.pw-quest-name').textContent = q.name;
        sec.querySelector('.pw-quest-obj').textContent = q.obj;
        sec.querySelector('.pw-quest-rw').textContent = rewardLabel(q.reward);
        const ring = sec.querySelector('.pw-quest-ring');
        if (ring) { ring.style.setProperty('--qp', '0'); ring.dataset.pct = '0%'; }
      }
    }
  }
}
