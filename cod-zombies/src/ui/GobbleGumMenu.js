import { RARITIES, ACT, gumsByRarity, rarityName } from '../gobblegums/gobblegums.js';
import { gumBallHtml } from './gumBall.js';

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
  #packs; // PackStore — when set, clicking a gum edits the equipped pack

  constructor({ onClose, packs = null } = {}) {
    this.#onClose = onClose;
    this.#packs = packs;
    this.#build();
  }

  get isOpen() { return this.#open; }
  get el() { return this.#el; }

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
      <div class="gg-glass"></div>
      <div class="gg-head">
        <div class="gg-title">GobbleGum</div>
        <div class="gg-tabs"></div>
      </div>
      <div class="gg-body">
        <div class="gg-grid"></div>
        <div class="gg-detail"></div>
      </div>
      <div class="gg-foot">
        <span class="gg-foot-hint"></span>
        <div class="gg-back">Done</div>
      </div>`;
    document.body.appendChild(el);
    this.#el = el;
    this.#grid = el.querySelector('.gg-grid');
    this.#detail = el.querySelector('.gg-detail');
    this.#tabsEl = el.querySelector('.gg-tabs');
    el.querySelector('.gg-foot-hint').textContent = this.#packs
      ? 'Click a GobbleGum to add it to your pack · Click a slot to swap · [Esc] Done'
      : '[↑↓ / Click] Browse · [Esc] Back';
    this.#fillMachine();

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
      if (!cell) return;
      this.#select(cell.dataset.id);
      // in edit mode, a click also drops the gum into the equipped pack
      this.#packs?.placeGum(cell.dataset.id);
    });
  }

  /** Fill the background with a heap of colorful gumballs (a real machine well). */
  #fillMachine() {
    const bg = this.#el.querySelector('.gg-bg');
    const palette = ['#ff5db1', '#3aa0ff', '#37d36a', '#9a5cff', '#ff8a28', '#ffd83a', '#ff5d5d', '#2fd6c6', '#ffffff'];
    const rnd = (a, b) => a + Math.random() * (b - a);
    const pick = () => palette[(Math.random() * palette.length) | 0];
    const ball = (size, leftPct, edge, edgePct, op = 1) => {
      const t = rnd(4, 9).toFixed(1);
      const delay = rnd(0, 5).toFixed(1);
      const bob = (-rnd(4, 13)).toFixed(0);
      return `<div class="gg-bg-ball" style="width:${size.toFixed(0)}px;height:${size.toFixed(0)}px;` +
        `left:${leftPct.toFixed(1)}%;${edge}:${edgePct.toFixed(1)}%;--c:${pick()};--t:${t}s;--delay:${delay}s;--bob:${bob}px;opacity:${op}"></div>`;
    };
    const out = [];
    // dense pile heaped along the bottom of the glass
    for (let i = 0; i < 38; i++) out.push(ball(rnd(48, 108), rnd(-3, 100), 'bottom', rnd(-7, 26)));
    // a looser mid scatter rising off the heap
    for (let i = 0; i < 12; i++) out.push(ball(rnd(30, 60), rnd(0, 100), 'bottom', rnd(26, 66), 0.62));
    // a few drifting high up in the dome
    for (let i = 0; i < 7; i++) out.push(ball(rnd(22, 42), rnd(6, 94), 'top', rnd(5, 28), 0.42));
    bg.innerHTML = out.join('');
  }

  // --- render -------------------------------------------------------------

  #selectRarity(rid) {
    this.#rarity = rid;
    this.#el.dataset.rarity = rid; // drives the per-rarity visual signatures in CSS
    for (const b of this.#tabsEl.children) b.classList.toggle('active', b.dataset.rarity === rid);

    const gums = gumsByRarity(rid);
    this.#grid.innerHTML = gums.map((g) => {
      const acol = (ACT[g.act] ?? ACT.time).color;
      // classic gums are always-available infinites: no counter, never greyed
      const infinite = g.rarity === 'classic';
      const owned = (!infinite && this.#packs) ? this.#packs.owned(g.id) : null;
      const zero = owned === 0;
      const countHtml = infinite
        ? '<div class="gg-count gg-inf">∞</div>'
        : (owned != null ? `<div class="gg-count${zero ? ' zero' : ''}">×${owned}</div>` : '');
      return `
      <div class="gg-cell${zero ? ' gg-zero' : ''}" data-id="${g.id}" style="--acol:${acol}">
        ${countHtml}
        ${gumBallHtml(g, 112)}
        <div class="gg-name">${g.name}</div>
      </div>`;
    }).join('');
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
    const infinite = gum.rarity === 'classic';
    const owned = (!infinite && this.#packs) ? this.#packs.owned(gid) : null;
    const ownedHtml = infinite
      ? '<div class="gg-d-owned gg-inf">Always Available <b>∞</b></div>'
      : (owned != null ? `<div class="gg-d-owned${owned === 0 ? ' zero' : ''}">Owned <b>×${owned}</b></div>` : '');
    this.#detail.innerHTML = `
      <div class="gg-d-name"><span>${gum.name}</span></div>
      <div class="gg-d-rarity">${rarityName(gum.rarity)}</div>
      <div class="gg-d-act"><b>${ACT[gum.act].label}</b> · Lasts ${gum.duration}</div>
      <div class="gg-d-preview">${gumBallHtml(gum, 248)}</div>
      ${ownedHtml}
      <div class="gg-d-desc">${gum.effect}</div>`;
  }
}
