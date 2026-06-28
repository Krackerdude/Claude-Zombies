import { RARITIES, ACT, gumsByRarity, rarityName } from '../gobblegums/gobblegums.js';
import { gumGlyphSvg } from '../gobblegums/gumGlyphs.js';

/**
 * GobbleGum browser overlay. A self-contained full-screen panel (opened from the
 * main menu) that lets you flip through every gum by rarity. Left ~2/3 is a grid
 * of glossy gumball widgets; the right ~1/3 blows up the selected gum with its
 * rarity, activation and effect. Purely a catalog/preview for now — earning,
 * equipping and activating gums are future systems.
 *
 * The gumballs are CSS spheres (color + swirl + emblem driven by activation
 * type) so all 58 cells render instantly; the reusable 3D gumball model
 * (gumballModel.js) is for in-world / HUD use when that flow is built.
 */
export class GobbleGumMenu {
  #el; #grid; #detail; #tabsEl;
  #rarity = 'classic';
  #selId = null;
  #onClose;
  #open = false;

  constructor({ onClose } = {}) {
    this.#onClose = onClose;
    this.#build();
  }

  get isOpen() { return this.#open; }

  open() {
    this.#el.classList.add('show');
    this.#open = true;
    this.#selectRarity(this.#rarity);
  }

  close() {
    this.#el.classList.remove('show');
    this.#open = false;
    this.#onClose?.();
  }

  // --- build --------------------------------------------------------------

  #build() {
    const el = document.createElement('div');
    el.id = 'gg-screen';
    el.innerHTML = `
      <div class="gg-bg"></div>
      <div class="gg-head">
        <div class="gg-title">GobbleGum</div>
        <div class="gg-tabs"></div>
      </div>
      <div class="gg-body">
        <div class="gg-grid"></div>
        <div class="gg-detail"></div>
      </div>
      <div class="gg-foot">
        <span>[↑↓ / Click] Browse · [Esc] Back</span>
        <div class="gg-back">Back</div>
      </div>`;
    document.body.appendChild(el);
    this.#el = el;
    this.#grid = el.querySelector('.gg-grid');
    this.#detail = el.querySelector('.gg-detail');
    this.#tabsEl = el.querySelector('.gg-tabs');

    // rarity tabs
    for (const r of RARITIES) {
      const b = document.createElement('button');
      b.className = 'gg-tab';
      b.dataset.rarity = r.id;
      b.innerHTML = `<span>${r.tab}</span>`;
      b.addEventListener('click', () => this.#selectRarity(r.id));
      this.#tabsEl.appendChild(b);
    }

    el.querySelector('.gg-back').addEventListener('click', () => this.close());
    this.#grid.addEventListener('click', (e) => {
      const cell = e.target.closest('.gg-cell');
      if (cell) this.#select(cell.dataset.id);
    });
  }

  // --- render -------------------------------------------------------------

  #selectRarity(rid) {
    this.#rarity = rid;
    for (const b of this.#tabsEl.children) b.classList.toggle('active', b.dataset.rarity === rid);

    const gums = gumsByRarity(rid);
    this.#grid.innerHTML = gums.map((g) => `
      <div class="gg-cell" data-id="${g.id}">
        ${ballHtml(g, 86)}
        <div class="gg-name">${g.name}</div>
      </div>`).join('');
    this.#grid.scrollTop = 0;

    // select the first gum in the tab
    if (gums.length) this.#select(gums[0].id);
  }

  #select(gid) {
    const gum = gumsByRarity(this.#rarity).find((g) => g.id === gid);
    if (!gum) return;
    this.#selId = gid;
    for (const c of this.#grid.children) c.classList.toggle('sel', c.dataset.id === gid);

    const rcol = RARITIES.find((r) => r.id === gum.rarity)?.color ?? '#ffb347';
    this.#detail.style.setProperty('--rcol', rcol);
    this.#detail.innerHTML = `
      <div class="gg-d-name">${gum.name}</div>
      <div class="gg-d-rarity">${rarityName(gum.rarity)}</div>
      <div class="gg-d-act"><b>${ACT[gum.act].label}</b> · Lasts ${gum.duration}</div>
      <div class="gg-d-preview">${ballHtml(gum, 190)}</div>
      <div class="gg-d-desc">
        ${gum.effect}
        <div class="gg-d-flavor">One Gumball is consumed each time this GobbleGum is used. Find Liquid Divinium in-game to craft more in Dr. Newton's Factory.</div>
      </div>`;
  }
}

/** Build a glossy CSS gumball element for a gum at a given pixel diameter. */
function ballHtml(gum, d) {
  const act = ACT[gum.act] ?? ACT.time;
  const rainbow = gum.act === 'whimsy' ? ' gg-rainbow' : '';
  return `<div class="gg-ball${rainbow}" style="--d:${d}px; --col:${act.color}; --glow:${act.glow}">${gumGlyphSvg(gum.glyph)}</div>`;
}
