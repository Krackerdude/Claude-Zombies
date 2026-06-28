import { slotHtml } from './gumBall.js';

/**
 * GobbleGum pack menu — the screen you land on when you pick "GobbleGum" from the
 * main menu (before the catalog). Pick which loadout pack is equipped, see its
 * five slots, and jump into the catalog to fill it via "Customize". A live 3D
 * Dr. Monty's machine turns in the centre. The shared player widget is parked
 * top-left by the UIManager.
 */
export class GobblePackMenu {
  #el; #list; #machineEl;
  #packs; #machineView; #onCustomize; #onClose;
  #open = false; #mounted = false;

  constructor({ packs, machineView, onCustomize, onClose }) {
    this.#packs = packs;
    this.#machineView = machineView;
    this.#onCustomize = onCustomize;
    this.#onClose = onClose;
    this.#build();
    packs.constructor; // (no-op) keep ref obvious
    this.#listen();
  }

  get isOpen() { return this.#open; }
  get el() { return this.#el; }
  get machineHost() { return this.#machineEl; }

  open() {
    this.#el.classList.add('show');
    this.#open = true;
    this.#render();
    if (!this.#mounted && this.#machineView?.ok) { this.#machineView.mount(this.#machineEl); this.#mounted = true; }
    this.#machineView?.start();
  }

  close() {
    this.#el.classList.remove('show');
    this.#open = false;
    this.#machineView?.stop();
    this.#onClose?.();
  }

  #build() {
    const el = document.createElement('div');
    el.id = 'gp-screen';
    el.innerHTML = `
      <div class="gp-bg"></div>
      <div class="gp-head">
        <div class="gp-sub">Public Match</div>
        <div class="gp-title"><span class="gp-knob"></span>GobbleGum</div>
      </div>
      <div class="gp-left">
        <div class="gp-label">Equipped GobbleGum Pack</div>
        <div class="gp-packs"></div>
        <button class="gp-customize">Customize GobbleGum Pack</button>
      </div>
      <div class="gp-machine"></div>
      <div class="gp-info">
        This GobbleGum Pack will be available in the GobbleGum Machine.<br>
        Find the GobbleGum Machine to use GobbleGum.
      </div>
      <div class="gp-foot"><span>[↑↓ / Click] Select Pack · [Esc] Back</span><div class="gp-back">Back</div></div>`;
    document.body.appendChild(el);
    this.#el = el;
    this.#list = el.querySelector('.gp-packs');
    this.#machineEl = el.querySelector('.gp-machine');

    el.querySelector('.gp-customize').addEventListener('click', () => this.#onCustomize?.());
    el.querySelector('.gp-back').addEventListener('click', () => this.close());
    this.#list.addEventListener('click', (e) => {
      const row = e.target.closest('.gp-pack');
      if (row) this.#packs.equip(parseInt(row.dataset.i, 10));
    });
  }

  #listen() {
    // re-render whenever the equipped pack or its contents change
    // (events come from the shared bus via PackStore)
  }

  /** Called by the UIManager on gobblegum:changed so the list reflects edits. */
  refresh() { if (this.#open) this.#render(); }

  #render() {
    const eq = this.#packs.equippedIndex;
    this.#list.innerHTML = this.#packs.packs.map((p, i) => `
      <div class="gp-pack${i === eq ? ' sel' : ''}" data-i="${i}">
        <div class="gp-pack-name">${p.name}</div>
        <div class="gp-pack-slots">${p.slots.map((id) => `<div class="gp-slot">${slotHtml(id, 46)}</div>`).join('')}</div>
      </div>`).join('');
  }
}
