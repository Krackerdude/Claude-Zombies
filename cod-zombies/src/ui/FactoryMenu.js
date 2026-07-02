import { diviniumVialSvg } from './diviniumVial.js';
import { wagerCost } from '../factory/factory.js';

/**
 * Dr. Newton's Factory menu shell. Almost the entire screen is the live 3D scene
 * (FactoryView); the only DOM chrome is the title bar, the Liquid Divinium
 * balance panel, the reward nameplates (positioned over the 3D balls by the
 * view), transient modifier banners, and the footer hints. The FactoryView is
 * created by the UIManager (which owns spend/roll/grant) and handed in here.
 */
export class FactoryMenu {
  #el; #view; #onClose; #canvasHost; #overlay; #bannerEl; #countEl;
  #open = false; #mounted = false;

  constructor({ view, onClose }) {
    this.#view = view;
    this.#onClose = onClose;
    this.#build();
  }

  get isOpen() { return this.#open; }
  get el() { return this.#el; }
  get busy() { return this.#el.classList.contains('busy'); }

  open() {
    this.#el.classList.add('show');
    this.#open = true;
    if (!this.#mounted && this.#view?.ok) { this.#view.mount(this.#canvasHost, this.#overlay); this.#mounted = true; }
    this.#view?.start();
  }

  close() {
    this.#el.classList.remove('show');
    this.#open = false;
    this.#view?.stop();
    this.#onClose?.();
  }

  /** Repaint the balance panel. */
  setDivinium(n) { if (this.#countEl) this.#countEl.textContent = String(n).padStart(3, '0'); }

  /** Reflect the view's busy state (locks the footer hint / stops nav). */
  setBusy(on) { this.#el.classList.toggle('busy', !!on); }

  /** Flash a transient modifier / denial banner. */
  banner({ kind, text }) {
    const b = this.#bannerEl;
    b.className = `fx-banner fx-banner-${kind}`;
    b.textContent = text;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(this._bt); this._bt = setTimeout(() => b.classList.remove('show'), 2400);
  }

  #build() {
    const el = document.createElement('div');
    el.id = 'factory-screen';
    el.innerHTML = `
      <div class="fx-canvas-host"></div>
      <div class="fx-overlay"></div>
      <div class="fx-vignette"></div>
      <div class="fx-head"><span class="fx-head-bar"></span><h1>Dr. Newton's Factory</h1></div>
      <div class="fx-ld">
        <div class="fx-ld-vial">${diviniumVialSvg()}</div>
        <div class="fx-ld-body">
          <span class="fx-ld-label">Liquid Divinium</span>
          <span class="fx-ld-count">000</span>
        </div>
      </div>
      <div class="fx-banner"></div>
      <div class="fx-foot">
        <span class="fx-foot-hint">
          <b>1</b> Vat · <b>2</b> Vats · <b>3</b> Vats — ${wagerCost(1)}/${wagerCost(2)}/${wagerCost(3)} Divinium ·
          Chance at <span class="fx-hl-boost">Power Booster</span> + <span class="fx-hl-double">Double Rewards</span>
        </span>
        <span class="fx-foot-keys">[1 / 2 / 3 or Click] Wager · [Esc] Back</span>
        <button class="fx-back">Back</button>
      </div>`;
    document.body.appendChild(el);
    this.#el = el;
    this.#canvasHost = el.querySelector('.fx-canvas-host');
    this.#overlay = el.querySelector('.fx-overlay');
    this.#bannerEl = el.querySelector('.fx-banner');
    this.#countEl = el.querySelector('.fx-ld-count');
    el.querySelector('.fx-back').addEventListener('click', () => this.close());
  }
}
