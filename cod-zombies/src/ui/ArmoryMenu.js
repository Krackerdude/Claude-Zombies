import { characterPortraitDataURL } from './characterPortrait.js';
import { CHARACTERS, characterById } from '../characters/characters.js';
import { setSelectedCharacter, selectedCharacterId } from '../characters/selection.js';
import {
  EMBLEMS, CALLING_CARDS, selectedEmblem, selectedCallingCard,
  selectedEmblemId, selectedCallingCardId, setEmblem, setCallingCard,
} from './identity.js';

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

const NAME_MAX = 20;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Strip control/markup chars, collapse whitespace, clamp length. */
const cleanName = (s) => String(s).replace(/[<>&"']/g, '').replace(/\s+/g, ' ').trimStart().slice(0, NAME_MAX);

export class ArmoryMenu {
  #el; #panel; #tabsEl; #onClose;
  #profileSvc; #events;
  #active = 'character';
  #open = false;
  #portraits = {};  // character id -> rendered portrait data URL (cached)
  #hl = 'richtofen';     // highlighted character (single click)
  #chosen = 'richtofen'; // confirmed selection (Select Character)
  #card;                 // synopsis modal element
  #profTab = 'emblems';  // Player Profile sub-tab: emblems | custom | cards
  #skinTab = 'richtofen'; // Skins sub-tab: which character's skins are shown

  constructor({ profile = null, events = null, onClose } = {}) {
    this.#profileSvc = profile;
    this.#events = events;
    this.#onClose = onClose;
    this.#build();
  }

  /** Current display name from the profile (falls back to the default). */
  #playerName() { return (this.#profileSvc?.get('identity.displayName', 'Survivor One') ?? 'Survivor One') || 'Survivor One'; }

  get isOpen() { return this.#open; }
  get el() { return this.#el; }

  open() {
    this.#active = 'character';
    this.#chosen = selectedCharacterId(); // reflect who the player is actually using
    this.#hl = this.#chosen;
    this.#skinTab = this.#chosen; // Skins opens on the survivor you're using
    this.#closeCard();
    this.#el.classList.add('show');
    this.#open = true;
    this.#syncTabs();
    this.#render();
  }

  close() {
    this.#closeCard();
    this.#el.classList.remove('show');
    this.#open = false;
    this.#onClose?.();
  }

  /** Arrow-key tab cycling from the UIManager (suspended while a dossier is up). */
  cycle(dir) {
    if (this.#card?.classList.contains('show')) return;
    const i = TABS.findIndex((t) => t.id === this.#active);
    const n = (i + dir + TABS.length) % TABS.length;
    this.#switch(TABS[n].id);
  }

  /** Esc from the UIManager: dismiss an open dossier first, else close the menu. */
  escape() {
    if (this.#card?.classList.contains('show')) { this.#closeCard(); return; }
    this.close();
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
      </div>
      <div class="arm-modal"><div class="arm-card"></div></div>`;
    document.body.appendChild(el);
    this.#el = el;
    this.#panel = el.querySelector('.arm-panel');
    this.#tabsEl = el.querySelector('.arm-tabs');
    this.#card = el.querySelector('.arm-modal');

    // Character interactions (delegated): click highlights, double-click opens the
    // synopsis card, and the Select button / card confirm the chosen survivor.
    this.#panel.addEventListener('click', (e) => {
      if (e.target.closest('.arm-dossier')) { this.#openCard(this.#hl); return; }
      if (e.target.closest('.arm-select')) { this.#confirm(this.#hl); return; }
      // Player Profile: sub-tab switch + emblem / calling-card pick
      const ptab = e.target.closest('.arm-ptab');
      if (ptab) { this.#profTab = ptab.dataset.ptab; this.#render(); return; }
      // Skins: per-character sub-tab switch
      const stab = e.target.closest('.arm-stab');
      if (stab) { this.#skinTab = stab.dataset.stab; this.#render(); return; }
      const em = e.target.closest('.arm-id-pick[data-kind="emblem"]');
      if (em) { setEmblem(em.dataset.id); this.#render(); return; }
      const cc = e.target.closest('.arm-id-pick[data-kind="card"]');
      if (cc) { setCallingCard(cc.dataset.id); this.#render(); return; }
      const slot = e.target.closest('.arm-char');
      if (slot) this.#highlight(slot.dataset.id);
    });
    // Player Profile: live name editing. Type → preview updates; blur/Enter commits.
    this.#panel.addEventListener('input', (e) => {
      const inp = e.target.closest('.arm-name-input');
      if (!inp) return;
      inp.value = cleanName(inp.value);
      const np = this.#panel.querySelector('.arm-np-name');
      if (np) np.textContent = inp.value.trim() || 'Survivor One';
    });
    this.#panel.addEventListener('change', (e) => {
      const inp = e.target.closest('.arm-name-input');
      if (inp) this.#commitName(inp);
    });
    this.#panel.addEventListener('keydown', (e) => {
      if (!e.target.closest('.arm-name-input')) return;
      e.stopPropagation(); // don't let typing drive the menu's tab/esc navigation
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.target.blur(); }
    });
    this.#panel.addEventListener('dblclick', (e) => {
      const slot = e.target.closest('.arm-char');
      if (slot) this.#openCard(slot.dataset.id);
    });
    this.#card.addEventListener('click', (e) => {
      if (e.target === this.#card || e.target.closest('.arm-card-close')) this.#closeCard();
      else if (e.target.closest('.arm-card-select')) { this.#confirm(this.#card.dataset.id); this.#closeCard(); }
    });

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
    const slots = CHARACTERS.map((c) => {
      const port = this.#portraitFor(c);
      const hl = c.id === this.#hl, chosen = c.id === this.#chosen;
      const pill = c.locked ? 'Locked' : chosen ? 'Selected' : hl ? 'Highlighted' : 'Available';
      return `
        <div class="arm-char${hl ? ' hl' : ''}${chosen ? ' sel' : ''}${c.locked ? ' locked' : ''}" data-id="${c.id}">
          <div class="arm-char-port">${port ? `<img src="${port}" alt="">` : '<span class="arm-q">?</span>'}</div>
          <div class="arm-char-name">${c.locked ? 'Locked' : c.name}</div>
          <div class="arm-char-tag">${c.locked ? '—' : c.role}</div>
          <div class="arm-char-pill">${pill}</div>
        </div>`;
    }).join('');
    const hlChar = characterById(this.#hl);
    const canSelect = hlChar && !hlChar.locked;
    const isChosen = this.#hl === this.#chosen && canSelect;
    return `
      <div class="arm-p-head">
        <div><h2>Character</h2><p>Highlight a survivor, open its dossier, then select it as your player.</p></div>
        <div class="arm-char-actions">
          <button class="arm-dossier">Dossier</button>
          <button class="arm-select${canSelect ? '' : ' off'}${isChosen ? ' done' : ''}">${isChosen ? 'Selected' : 'Select Character'}</button>
        </div>
      </div>
      <div class="arm-char-row">${slots}</div>
      <div class="arm-note">More survivors join the crew soon — Edward Richtofen leads the way.</div>`;
  }

  /** Render (and cache) a character's bust portrait; null for locked entries. */
  #portraitFor(char) {
    if (char.locked || !char.build) return null;
    if (this.#portraits[char.id] === undefined) {
      this.#portraits[char.id] = characterPortraitDataURL({ build: char.build, frame: 'bust', w: 300, h: 360 }) || '';
    }
    return this.#portraits[char.id];
  }

  #highlight(id) {
    if (!characterById(id)) return;
    this.#hl = id;
    if (this.#active === 'character') this.#render();
  }

  #confirm(id) {
    const c = characterById(id);
    if (!c || c.locked) return;
    setSelectedCharacter(id); // becomes the menu hero + HUD portrait (persisted in main.js)
    this.#chosen = id; this.#hl = id;
    if (this.#active === 'character') this.#render();
  }

  #openCard(id) {
    const c = characterById(id);
    if (!c) return;
    this.#hl = id;
    this.#card.dataset.id = id;
    const chosen = id === this.#chosen;
    const inner = this.#card.querySelector('.arm-card');
    if (c.locked) {
      inner.innerHTML = `
        <button class="arm-card-close" aria-label="Close">✕</button>
        <div class="arm-card-locked"><span class="arm-q">?</span><h3>Classified</h3><p>This survivor hasn't been declassified yet.</p></div>`;
    } else {
      const port = this.#portraitFor(c);
      inner.innerHTML = `
        <button class="arm-card-close" aria-label="Close">✕</button>
        <div class="arm-card-body">
          <div class="arm-card-port">${port ? `<img src="${port}" alt="">` : ''}</div>
          <div class="arm-card-info">
            <div class="arm-card-era">${c.era || ''}</div>
            <h3>${c.name}</h3>
            <div class="arm-card-role">${c.role}</div>
            <div class="arm-card-tags">${(c.tags || []).map((t) => `<span>${t}</span>`).join('')}</div>
            <p class="arm-card-syn">${c.synopsis}</p>
            <button class="arm-card-select${chosen ? ' done' : ''}">${chosen ? 'Selected' : 'Select Character'}</button>
          </div>
        </div>`;
    }
    this.#card.classList.add('show');
    if (this.#active === 'character') this.#render();
  }

  #closeCard() { this.#card?.classList.remove('show'); }

  #skins() {
    // one sub-tab per unlocked survivor; skins are grouped under the active one
    const chars = CHARACTERS.filter((c) => !c.locked);
    if (!chars.some((c) => c.id === this.#skinTab)) this.#skinTab = chars[0]?.id ?? 'richtofen';
    const tabs = chars.map((c) => `<button class="arm-stab${c.id === this.#skinTab ? ' active' : ''}" data-stab="${c.id}">${c.name}</button>`).join('');

    const idx = Math.max(0, chars.findIndex((c) => c.id === this.#skinTab));
    const base = idx * 57; // per-character hue base so each set reads distinct
    let tiles = '';
    for (let i = 0; i < 8; i++) {
      const first = i === 0;
      tiles += `<div class="arm-skin${first ? ' sel' : ' locked'}" style="--h:${(base + i * 41) % 360}"><span class="arm-skin-name">${first ? 'Default' : 'Locked'}</span></div>`;
    }
    return `
      <div class="arm-p-head">
        <div><h2>Skins</h2><p>Pick a survivor, then a skin. Each survivor keeps its own set.</p></div>
        <span class="arm-soon">Coming Soon</span>
      </div>
      <div class="arm-stabs">${tabs}</div>
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

  /** Commit an edited name to the profile (empty → default), reflecting it live. */
  #commitName(inp) {
    let v = cleanName(inp.value).trim();
    if (!v) v = 'Survivor One';
    inp.value = v;
    const np = this.#panel.querySelector('.arm-np-name');
    if (np) np.textContent = v;
    try { this.#profileSvc?.set('identity.displayName', v); } catch { /* non-fatal */ }
  }

  #profile() {
    const em = selectedEmblem(), cc = selectedCallingCard();
    const name = this.#playerName();
    // live nameplate preview — name on a tab, emblem + calling card, level + XP
    const nameplate = `
      <div class="arm-np">
        <div class="arm-np-name">${esc(name)}</div>
        <div class="arm-np-card">
          <div class="arm-np-emblem">${em.svg}</div>
          <div class="arm-np-cc"><div class="arm-np-cc-art">${cc.svg}</div><div class="arm-np-lvl">1</div></div>
          <div class="arm-np-xp"><i style="width:12%"></i></div>
        </div>
      </div>
      <div class="arm-np-meta"><span>Recruit · Rank 01</span><span class="arm-np-eq">${em.name} · ${cc.name}</span></div>
      <label class="arm-name-edit">
        <span class="arm-name-lbl">Player Name</span>
        <input class="arm-name-input" type="text" maxlength="${NAME_MAX}" spellcheck="false" autocomplete="off" value="${esc(name)}" aria-label="Player name">
      </label>`;

    const ptabs = [['emblems', 'Emblems'], ['custom', 'Custom Emblems'], ['cards', 'Calling Cards']]
      .map(([id, lbl]) => `<button class="arm-ptab${this.#profTab === id ? ' active' : ''}" data-ptab="${id}">${lbl}</button>`)
      .join('');

    let grid;
    if (this.#profTab === 'cards') {
      const selId = selectedCallingCardId();
      grid = `<div class="arm-id-grid cards">${CALLING_CARDS.map((c) => `
        <div class="arm-id-pick card${c.id === selId ? ' sel' : ''}" data-kind="card" data-id="${c.id}">
          <div class="arm-id-art">${c.svg}</div>
          <div class="arm-id-name">${c.name}</div>
        </div>`).join('')}</div>`;
    } else if (this.#profTab === 'custom') {
      grid = `<div class="arm-id-custom">
          <div class="arm-id-empty">
            <span class="arm-q">✦</span>
            <p>No custom emblems yet. Build one in the <b>Emblem Creator</b>, then equip it here.</p>
          </div>
        </div>`;
    } else {
      const selId = selectedEmblemId();
      grid = `<div class="arm-id-grid emblems">${EMBLEMS.map((e) => `
        <div class="arm-id-pick emblem${e.id === selId ? ' sel' : ''}" data-kind="emblem" data-id="${e.id}">
          <div class="arm-id-art">${e.svg}</div>
          <div class="arm-id-name">${e.name}</div>
        </div>`).join('')}</div>`;
    }

    return `
      <div class="arm-p-head">
        <div><h2>Player Profile</h2><p>Set yourself apart — equip an emblem and a calling card.</p></div>
      </div>
      <div class="arm-prof2">
        <div class="arm-prof-preview">${nameplate}</div>
        <div class="arm-id">
          <div class="arm-ptabs">${ptabs}</div>
          ${grid}
        </div>
      </div>`;
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
