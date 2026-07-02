import { gumBallHtml } from './gumBall.js';
import { gumById, RARITIES } from '../gobblegums/gobblegums.js';
import { currentRecipes, canCraft, craft, msToRefresh, TRADEABLE } from '../cookbook/cookbook.js';
import { deskSceneHtml } from './cookbookDesk.js';

/**
 * Newton's Cookbook — a physical open book of trade recipes. The spread shows
 * two pages, two recipes each (four on screen); corner arrows flip pages with a
 * page-turn animation. A sort row filters by outcome rarity (like the catalog);
 * the filtered set paginates across the book. Recipes that favour the player are
 * flagged "Special Deal!". Crafting consumes the input gums and grants the
 * output via the shared PackStore.
 */
export class CookbookMenu {
  #el; #packs; #onClose;
  #recipes = []; #sort = 'all'; #page = 0; #open = false; #anim = false;
  #timer = 0;

  constructor({ packs, onClose }) {
    this.#packs = packs;
    this.#onClose = onClose;
    this.#build();
  }

  get isOpen() { return this.#open; }
  get el() { return this.#el; }

  open() {
    this.#recipes = currentRecipes();
    this.#sort = 'all'; this.#page = 0;
    this.#el.classList.add('show');
    this.#open = true;
    this.#render();
    this.#tick();
    clearInterval(this.#timer); this.#timer = setInterval(() => this.#tick(), 1000);
  }

  close() {
    this.#el.classList.remove('show');
    this.#open = false;
    clearInterval(this.#timer); this.#timer = 0;
    this.#onClose?.();
  }

  refresh() { if (this.#open) this.#render(); }

  // --- data helpers -------------------------------------------------------

  #filtered() { return this.#sort === 'all' ? this.#recipes : this.#recipes.filter((r) => r.outRarity === this.#sort); }
  #spreads() { return Math.max(1, Math.ceil(this.#filtered().length / 4)); }

  // --- build --------------------------------------------------------------

  #build() {
    const el = document.createElement('div');
    el.id = 'cookbook-screen';
    const tabs = [['all', 'All'], ...TRADEABLE.map((r) => [r, RARITIES.find((x) => x.id === r)?.tab ?? r])];
    el.innerHTML = `
      ${deskSceneHtml()}
      <div class="cb-vignette"></div>
      <div class="cb-topbar">
        <div class="cb-head">
          <div class="cb-title">Newton's Cookbook</div>
          <div class="cb-sub">Trade GobbleGums across rarities · new recipes in <span class="cb-refresh">—</span></div>
        </div>
        <div class="cb-tabs">${tabs.map(([id, label]) => `<button class="cb-tab${id === 'all' ? ' active' : ''}" data-sort="${id}"><span>${label}</span></button>`).join('')}</div>
      </div>
      <div class="cb-book">
        <div class="cb-page cb-left">
          <div class="cb-recipes"></div>
          <button class="cb-arrow cb-prev" aria-label="Previous page">‹</button>
          <div class="cb-folio cb-folio-l"></div>
        </div>
        <div class="cb-spine"></div>
        <div class="cb-page cb-right">
          <div class="cb-recipes"></div>
          <button class="cb-arrow cb-next" aria-label="Next page">›</button>
          <div class="cb-folio cb-folio-r"></div>
        </div>
        <div class="cb-leaf"></div>
      </div>
      <div class="cb-foot"><span>[← →] Flip · Click a recipe's Trade to convert · [Esc] Close</span><div class="cb-back">Close</div></div>`;
    document.body.appendChild(el);
    this.#el = el;

    el.querySelector('.cb-tabs').addEventListener('click', (e) => {
      const t = e.target.closest('.cb-tab'); if (!t) return;
      this.#sort = t.dataset.sort; this.#page = 0; this.#render();
    });
    el.querySelector('.cb-prev').addEventListener('click', () => this.#flip(-1));
    el.querySelector('.cb-next').addEventListener('click', () => this.#flip(1));
    el.querySelector('.cb-back').addEventListener('click', () => this.close());
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('.cb-craft'); if (!btn) return;
      const card = btn.closest('.cb-recipe'); const r = this.#recipes.find((x) => x.id === card?.dataset.id);
      if (r && craft(r, this.#packs)) { card.classList.add('crafted'); this.#render(); }
    });
  }

  // --- flip + render ------------------------------------------------------

  #flip(dir) {
    if (this.#anim) return;
    const next = this.#page + dir;
    if (next < 0 || next >= this.#spreads()) return;
    this.#anim = true;
    const book = this.#el.querySelector('.cb-book');
    book.classList.add(dir > 0 ? 'turn-next' : 'turn-prev');
    setTimeout(() => { this.#page = next; this.#render(); }, 230);       // swap mid-turn
    setTimeout(() => { book.classList.remove('turn-next', 'turn-prev'); this.#anim = false; }, 480);
  }

  #tick() {
    const el = this.#el.querySelector('.cb-refresh'); if (!el) return;
    const ms = msToRefresh(); const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
    el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }

  #card(r) {
    if (!r) return '<div class="cb-recipe cb-empty"></div>';
    const inGum = gumById(r.input.gum), outGum = gumById(r.output.gum);
    const have = this.#packs.owned(r.input.gum);
    const afford = canCraft(r, this.#packs);
    const rcol = RARITIES.find((x) => x.id === r.outRarity)?.color ?? '#ffb347';
    return `
      <div class="cb-recipe${r.special ? ' cb-special' : ''}${afford ? ' cb-can' : ''}" data-id="${r.id}" style="--rcol:${rcol}">
        ${r.special ? '<div class="cb-deal">Special Deal!</div>' : ''}
        <div class="cb-kind">${r.type === 'up' ? 'Refine' : 'Break Down'}</div>
        <div class="cb-trade">
          <div class="cb-side">
            <div class="cb-ring${afford ? ' ready' : ''}" style="--p:${Math.min(1, have / r.input.count)}">
              <div class="cb-ball">${gumBallHtml(inGum, 56)}<span class="cb-qty">×${r.input.count}</span></div>
            </div>
            <div class="cb-gname">${inGum.name}</div>
            <div class="cb-have${afford ? '' : ' short'}">${have} / ${r.input.count}</div>
          </div>
          <div class="cb-mid">→</div>
          <div class="cb-side">
            <div class="cb-ring out"><div class="cb-ball">${gumBallHtml(outGum, 56)}<span class="cb-qty">×${r.output.count}</span></div></div>
            <div class="cb-gname">${outGum.name}</div>
          </div>
        </div>
        <button class="cb-craft"${afford ? '' : ' disabled'}>Trade</button>
      </div>`;
  }

  #render() {
    const filtered = this.#filtered();
    this.#page = Math.min(this.#page, this.#spreads() - 1);
    for (const b of this.#el.querySelectorAll('.cb-tab')) b.classList.toggle('active', b.dataset.sort === this.#sort);
    this.#el.dataset.sort = this.#sort;

    const base = this.#page * 4;
    const four = [filtered[base], filtered[base + 1], filtered[base + 2], filtered[base + 3]];
    this.#el.querySelector('.cb-left .cb-recipes').innerHTML = this.#card(four[0]) + this.#card(four[1]);
    this.#el.querySelector('.cb-right .cb-recipes').innerHTML = this.#card(four[2]) + this.#card(four[3]);

    const spreads = this.#spreads();
    this.#el.querySelector('.cb-folio-l').textContent = `${this.#page * 2 + 1}`;
    this.#el.querySelector('.cb-folio-r').textContent = `${this.#page * 2 + 2}`;
    this.#el.querySelector('.cb-prev').disabled = this.#page <= 0;
    this.#el.querySelector('.cb-next').disabled = this.#page >= spreads - 1;
  }
}
