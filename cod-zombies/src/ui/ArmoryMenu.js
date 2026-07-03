import { characterPortraitDataURL } from './characterPortrait.js';

/**
 * The Armory — the customization hub reached from the main menu. FRAMEWORK ONLY:
 * a tabbed shell (interactive tab rail + panel, in the options-screen language)
 * with styled placeholder content per section. No section is wired up yet.
 *
 * Tabs:
 *   Character        — pick one of the four playable survivors
 *   Skins            — skins for the chosen survivor
 *   Emblem Creator   — build custom emblems / calling cards (later)
 *   Player Profile   — identity, rank and lifetime stats
 *   Progression Pass — pick a map-themed mini pass (~30 tiers each)
 */
const TABS = [
  { id: 'character', label: 'Character' },
  { id: 'skins', label: 'Skins' },
  { id: 'emblem', label: 'Emblem Creator' },
  { id: 'profile', label: 'Player Profile' },
  { id: 'pass', label: 'Progression Pass' },
];

export class ArmoryMenu {
  #el; #panel; #tabsEl; #onClose;
  #active = 'character';
  #open = false;
  #portrait = null; // lazily-rendered survivor head-shot (cached)

  constructor({ onClose } = {}) {
    this.#onClose = onClose;
    this.#build();
  }

  get isOpen() { return this.#open; }
  get el() { return this.#el; }

  open() {
    this.#active = 'character';
    this.#el.classList.add('show');
    this.#open = true;
    this.#syncTabs();
    this.#render();
  }

  close() {
    this.#el.classList.remove('show');
    this.#open = false;
    this.#onClose?.();
  }

  /** Arrow-key tab cycling from the UIManager. */
  cycle(dir) {
    const i = TABS.findIndex((t) => t.id === this.#active);
    const n = (i + dir + TABS.length) % TABS.length;
    this.#switch(TABS[n].id);
  }

  // --- build --------------------------------------------------------------

  #build() {
    const el = document.createElement('div');
    el.id = 'armory-screen';
    el.innerHTML = `
      <div class="arm-bg"></div>
      <div class="arm-vignette"></div>
      <div class="arm-head">
        <div class="arm-title">Armory</div>
        <div class="arm-sub">Survivor · Loadout · Identity</div>
      </div>
      <div class="arm-body">
        <div class="arm-tabs"></div>
        <div class="arm-panel"></div>
      </div>
      <div class="arm-foot">
        <span>[↑↓] Section · [Esc] Back</span>
        <button class="arm-back">Back</button>
      </div>`;
    document.body.appendChild(el);
    this.#el = el;
    this.#panel = el.querySelector('.arm-panel');
    this.#tabsEl = el.querySelector('.arm-tabs');

    TABS.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'arm-tab' + (t.id === this.#active ? ' active' : '');
      b.dataset.tab = t.id;
      b.innerHTML = `<span class="num">0${i + 1} /</span><span class="lbl">${t.label}</span>`;
      b.addEventListener('click', () => this.#switch(t.id));
      this.#tabsEl.appendChild(b);
    });

    el.querySelector('.arm-back').addEventListener('click', () => this.close());
  }

  #switch(id) {
    if (id === this.#active) return;
    this.#active = id;
    this.#syncTabs();
    this.#render();
  }

  #syncTabs() {
    for (const b of this.#tabsEl.querySelectorAll('.arm-tab')) b.classList.toggle('active', b.dataset.tab === this.#active);
  }

  // --- placeholder panels (no functionality yet) --------------------------

  #head(title, sub) {
    return `<div class="arm-p-head"><div><h2>${title}</h2><p>${sub}</p></div><span class="arm-soon">Coming Soon</span></div>`;
  }

  /** The survivor head-shot, rendered once and cached. */
  #headshot() {
    if (this.#portrait === null) this.#portrait = characterPortraitDataURL() || '';
    return this.#portrait;
  }

  #render() {
    const p = this.#panel;
    p.scrollTop = 0;
    if (this.#active === 'character') p.innerHTML = this.#character();
    else if (this.#active === 'skins') p.innerHTML = this.#skins();
    else if (this.#active === 'emblem') p.innerHTML = this.#emblem();
    else if (this.#active === 'profile') p.innerHTML = this.#profile();
    else p.innerHTML = this.#pass();
  }

  #character() {
    const hs = this.#headshot();
    const slot = (n, name, sel, locked) => `
      <div class="arm-char${sel ? ' sel' : ''}${locked ? ' locked' : ''}">
        <div class="arm-char-port">${sel && hs ? `<img src="${hs}" alt="">` : '<span class="arm-q">?</span>'}</div>
        <div class="arm-char-name">${name}</div>
        <div class="arm-char-tag">${sel ? 'Selected' : locked ? 'Locked' : 'Available'}</div>
      </div>`;
    return `
      ${this.#head('Character', 'Choose your survivor from the crew.')}
      <div class="arm-char-row">
        ${slot(1, 'Survivor One', true, false)}
        ${slot(2, 'Survivor Two', false, true)}
        ${slot(3, 'Survivor Three', false, true)}
        ${slot(4, 'Survivor Four', false, true)}
      </div>
      <div class="arm-note">A full four-survivor crew is on the way — for now you play the lone survivor.</div>`;
  }

  #skins() {
    let tiles = '';
    for (let i = 0; i < 8; i++) tiles += `<div class="arm-skin${i === 0 ? ' sel' : ' locked'}" style="--h:${(i * 41) % 360}"><span class="arm-skin-name">${i === 0 ? 'Default' : 'Locked'}</span></div>`;
    return `
      ${this.#head('Skins', 'Reskin the survivor you have equipped.')}
      <div class="arm-skin-grid">${tiles}</div>
      <div class="arm-note">Unlockable skins per survivor — coming soon.</div>`;
  }

  #emblem() {
    const tool = (t) => `<div class="arm-tool"><span>${t}</span></div>`;
    return `
      ${this.#head('Emblem Creator', 'Layer shapes into a custom emblem for your calling card.')}
      <div class="arm-emblem">
        <div class="arm-emblem-tools">${['Layers', 'Shapes', 'Color', 'Rotate', 'Mirror', 'Clear'].map(tool).join('')}</div>
        <div class="arm-emblem-canvas">
          <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="30" fill="none" stroke="#2fb8b0" stroke-width="2" opacity="0.5"/><path d="M50 26v48M26 50h48" stroke="#2fb8b0" stroke-width="1.5" opacity="0.35"/></svg>
          <span class="arm-emblem-hint">Emblem canvas</span>
        </div>
        <div class="arm-emblem-layers"><div class="arm-layer">Layer 01</div><div class="arm-layer add">+ Add Layer</div></div>
      </div>
      <div class="arm-note">Emblems, calling cards and more will slot in here later.</div>`;
  }

  #profile() {
    const hs = this.#headshot();
    const stat = (v, l) => `<div class="arm-stat"><div class="arm-stat-v">${v}</div><div class="arm-stat-l">${l}</div></div>`;
    return `
      ${this.#head('Player Profile', 'Your identity, rank and lifetime record.')}
      <div class="arm-profile">
        <div class="arm-prof-card">
          <div class="arm-prof-port">${hs ? `<img src="${hs}" alt="">` : ''}</div>
          <div class="arm-prof-id">
            <div class="arm-prof-name">Survivor One</div>
            <div class="arm-prof-rank">Recruit · Rank 01</div>
            <div class="arm-prof-bar"><i style="width:12%"></i></div>
          </div>
        </div>
        <div class="arm-stats">
          ${stat('—', 'Kills')}${stat('—', 'Best Round')}${stat('—', 'Downs')}${stat('—', 'Games')}
        </div>
      </div>
      <div class="arm-note">Rank, emblem and lifetime stats will live here — coming soon.</div>`;
  }

  #pass() {
    const maps = [['Necropolis', '#6b4a8f'], ['Frostbite', '#3a7b94'], ['Cinderworks', '#a5502a'], ['Hollow', '#4a6b3a']];
    const card = ([name, col]) => `
      <div class="arm-pass" style="--pc:${col}">
        <div class="arm-pass-art"></div>
        <div class="arm-pass-name">${name}</div>
        <div class="arm-pass-meta">~30 Tiers · Locked</div>
        <div class="arm-pass-track">${'<i></i>'.repeat(10)}</div>
      </div>`;
    return `
      ${this.#head('Progression Pass', 'Pick a map-themed pass and climb its ~30 tiers.')}
      <div class="arm-pass-row">${maps.map(card).join('')}</div>
      <div class="arm-note">Each map gets its own themed mini pass — choose one to progress. Coming soon.</div>`;
  }
}
