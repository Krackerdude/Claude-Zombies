import { Service } from '../core/ServiceLocator.js';
import { AppState } from '../core/GameState.js';
import { PackStore } from '../gobblegums/PackStore.js';
import { gumById } from '../gobblegums/gobblegums.js';
import { slotHtml } from './gumBall.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * The Tab menu — a fullscreen Scoreboard / Objectives overlay, separate from the
 * pause menu. Tab pauses the game (via the `scoreboard` app state, which freezes
 * the world on the live frame) and shows a full dossier:
 *
 *   • the equipped GobbleGum pack across the top, each gum on its own nameplate,
 *     under a "GobbleGums" section nameplate;
 *   • the survivor stat table in the middle;
 *   • a "Quest Items" section along the bottom (reserved for collected relics).
 *
 * Stats are tallied from gameplay events: Score is the running sum of all points
 * EARNED (not the spendable balance), and a headshot kill counts in both Kills
 * and Headshots.
 *
 * This class ALSO owns the death screen (`#deathscreen`) — the Game Over card
 * that rides on top of the DeathCamSystem's cinematic. It reuses the same
 * survivor stat block (gobblegum + quest sections omitted) and offers a Skip
 * button that jumps straight back to the main menu.
 */
export class Scoreboard {
  #events;
  #gameState;
  #input;
  #packs;
  #profile;

  #el;
  #death;
  #dsStats;
  #dsFade;
  #panels = {};
  #tabBtns = [];
  #vals = {};

  #stats = { score: 0, kills: 0, downs: 0, revives: 0, headshots: 0 };
  #prevPoints = 0;
  #primed = false;

  constructor(engine) {
    this.#events = engine.services.get(Service.Events);
    this.#gameState = engine.services.get(Service.GameState);
    this.#input = engine.services.get(Service.Input);
    const profile = engine.services.has(Service.Profile) ? engine.services.get(Service.Profile) : null;
    this.#profile = profile;
    // a fresh PackStore over the shared profile — reads the same persistent
    // equipped loadout as every other menu (it's stateless bar transient UI)
    this.#packs = new PackStore(profile, this.#events);
    this.#build();
    this.#buildDeath();
    this.#wireStats();
    this.#bindKeys();
    // keep the survivor name live if it changes in the Player Profile
    this.#events.on('profile:changed', () => this.#syncName());
    this.#events.on('profile:loaded', () => this.#syncName());
  }

  /** The current display name from the profile (falls back to the default). */
  #playerName() { return (this.#profile?.get('identity.displayName', 'Survivor One') ?? 'Survivor One') || 'Survivor One'; }

  /** Push the current name into every rendered survivor row (scoreboard + card). */
  #syncName() {
    const n = this.#playerName();
    for (const el of [this.#el, this.#death]) el?.querySelectorAll('.sb-pname').forEach((s) => { s.textContent = n; });
  }

  get isOpen() { return this.#gameState.current === AppState.SCOREBOARD; }

  // --- shared markup ------------------------------------------------------

  /** A stylized, sheared section nameplate (centered on a section's top edge). */
  #plate(text) { return `<div class="sb-plate"><span>${text}</span></div>`; }

  /** The equipped GobbleGum pack — five gums, each on its own nameplate. */
  #gumRowHtml() {
    const slots = this.#packs.slots();
    let out = '';
    for (let i = 0; i < this.#packs.slotCount; i++) {
      const gid = slots[i];
      const gum = gid ? gumById(gid) : null;
      out += `
        <div class="sb-gum${gum ? '' : ' empty'}">
          <div class="sb-gum-ball">${slotHtml(gid, 76)}</div>
          <div class="sb-gum-plate"><span>${gum ? gum.name : 'Empty'}</span></div>
        </div>`;
    }
    return out;
  }

  /** The survivor stat table. `openSlots` adds the reserved co-op rows; `baked`
   *  freezes the current values (for the death card) instead of live `.v-*` spans. */
  #statsHtml({ openSlots = true, baked = false } = {}) {
    const cell = (k) => baked
      ? `<span>${this.#stats[k].toLocaleString()}</span>`
      : `<span class="v-${k}">0</span>`;
    const open = `
      <div class="sb-grid sb-row sb-empty-slot">
        <span class="c-name"><i class="sb-pip"></i>Open Slot</span>
        <span>—</span><span>—</span><span>—</span><span>—</span><span>—</span>
      </div>`;
    return `
      <div class="sb-stats">
        <div class="sb-grid sb-head">
          <span class="c-name">Survivor</span>
          <span>Score</span><span>Kills</span><span>Downs</span><span>Revives</span><span>Headshots</span>
        </div>
        <div class="sb-grid sb-row">
          <span class="c-name"><i class="sb-pip"></i><span class="sb-pname">${esc(this.#playerName())}</span></span>
          ${cell('score')}${cell('kills')}${cell('downs')}${cell('revives')}${cell('headshots')}
        </div>
        ${openSlots ? open.repeat(3) : ''}
      </div>`;
  }

  // --- build --------------------------------------------------------------

  #build() {
    const el = document.createElement('div');
    el.id = 'scoreboard';
    el.className = 'tabmenu';
    el.innerHTML = `
      <div class="tab-shade"></div>
      <div class="tab-frame">
        <div class="tab-nav">
          <button class="tab-btn active" data-tab="scoreboard"><span>Scoreboard</span></button>
          <span class="tab-sep"></span>
          <button class="tab-btn" data-tab="objectives"><span>Objectives</span></button>
        </div>
        <div class="tab-body">
          <section class="tab-panel active" data-panel="scoreboard">
            <div class="sb-section sb-gums">
              ${this.#plate('GobbleGums')}
              <div class="sb-gum-row"></div>
            </div>
            ${this.#statsHtml({ openSlots: true })}
            <div class="sb-section sb-quests">
              ${this.#plate('Quest Items')}
              <div class="sb-quest-body"><span class="sb-quest-empty">No quest items collected.</span></div>
            </div>
          </section>
          <section class="tab-panel" data-panel="objectives">
            <div class="sb-empty">No active objectives.</div>
          </section>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.#el = el;

    el.querySelectorAll('.tab-btn').forEach((b) => {
      this.#tabBtns.push(b);
      b.addEventListener('click', () => this.#select(b.dataset.tab));
    });
    el.querySelectorAll('.tab-panel').forEach((p) => { this.#panels[p.dataset.panel] = p; });
    for (const k of ['score', 'kills', 'downs', 'revives', 'headshots']) this.#vals[k] = el.querySelector('.v-' + k);

    // keep the equipped pack live if it changes while open
    this.#events.on('gobblegum:changed', () => { if (this.isOpen) this.#renderGums(); });
  }

  #buildDeath() {
    const el = document.createElement('div');
    el.id = 'deathscreen';
    el.innerHTML = `
      <div class="ds-vignette"></div>
      <div class="ds-card">
        <div class="ds-title">Game Over</div>
        <div class="ds-sub">The dead have claimed another soul</div>
        <div class="ds-stats"></div>
        <button class="ds-skip"><span>Skip to Menu ›</span></button>
      </div>
      <div class="ds-fade"></div>`;
    document.body.appendChild(el);
    this.#death = el;
    this.#dsStats = el.querySelector('.ds-stats');
    this.#dsFade = el.querySelector('.ds-fade');
    el.querySelector('.ds-skip').addEventListener('click', () => {
      this.#hideDeathNow();
      this.#events.emit('death:finish', {}); // skip straight back to the menu
    });

    // driven by RoundSystem + DeathCamSystem across the cinematic
    this.#events.on('death:begin', () => this.#showDeath());
    this.#events.on('death:fade', () => this.#death.classList.add('fading'));
    this.#events.on('state:change', ({ state }) => { if (state === 'menu') this.#endDeath(); });
  }

  // --- death screen -------------------------------------------------------

  #showDeath() {
    this.#dsStats.innerHTML = this.#statsHtml({ openSlots: false, baked: true });
    this.#death.classList.remove('fading', 'revealing');
    this.#death.classList.add('show');
    document.body.classList.add('death-cam'); // hides the live HUD behind the card
    this.#input.exitPointerLock?.();
  }

  /** Reached when the run returns to the menu (natural finish or skip). If we've
   *  already faded to black, fade back OUT to reveal the menu; otherwise cut. */
  #endDeath() {
    if (!this.#death.classList.contains('show')) return;
    if (this.#death.classList.contains('fading')) {
      this.#death.classList.add('revealing');                 // drop the card instantly
      requestAnimationFrame(() => this.#death.classList.remove('fading')); // black → clear
      const done = (e) => {
        if (e.target !== this.#dsFade) return;
        this.#dsFade.removeEventListener('transitionend', done);
        this.#hideDeathNow();
      };
      this.#dsFade.addEventListener('transitionend', done);
    } else {
      this.#hideDeathNow();
    }
  }

  #hideDeathNow() {
    this.#death.classList.remove('show', 'fading', 'revealing');
    document.body.classList.remove('death-cam');
  }

  // --- live stats ---------------------------------------------------------

  #wireStats() {
    // Score = sum of all positive point gains (the run's earned total). The first
    // update after a run starts is the starting bankroll — primed away, not counted.
    this.#events.on('score:changed', ({ points }) => {
      if (this.#primed) { const d = points - this.#prevPoints; if (d > 0) this.#stats.score += d; }
      this.#prevPoints = points; this.#primed = true;
    });
    this.#events.on('zombie:killed', ({ headshot }) => { this.#stats.kills++; if (headshot) this.#stats.headshots++; });
    this.#events.on('player:down', () => { this.#stats.downs++; });
    this.#events.on('player:revived', () => { this.#stats.revives++; }); // wired for when revives exist

    const reset = () => { this.#stats = { score: 0, kills: 0, downs: 0, revives: 0, headshots: 0 }; this.#prevPoints = 0; this.#primed = false; };
    this.#events.on('run:reset', reset);
    this.#events.on('state:change', ({ state }) => { if (state === 'menu') reset(); });
  }

  #renderGums() {
    const row = this.#el.querySelector('.sb-gum-row');
    if (row) row.innerHTML = this.#gumRowHtml();
  }

  #render() {
    for (const k of ['score', 'kills', 'downs', 'revives', 'headshots']) {
      if (this.#vals[k]) this.#vals[k].textContent = this.#stats[k].toLocaleString();
    }
    this.#renderGums();
  }

  #select(tab) {
    this.#tabBtns.forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    for (const [k, p] of Object.entries(this.#panels)) p.classList.toggle('active', k === tab);
  }

  #bindKeys() {
    // Capture phase so Tab is intercepted before browser focus traversal, and
    // stopPropagation keeps the pause-menu's own keydown from double-firing.
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') {
        const s = this.#gameState.current;
        if (s === AppState.PLAYING) { e.preventDefault(); e.stopPropagation(); this.open(); }
        else if (s === AppState.SCOREBOARD) { e.preventDefault(); e.stopPropagation(); this.close(); }
        return;
      }
      if (!this.isOpen) return;
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); this.#toPause(); }
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.stopPropagation(); this.#select('scoreboard'); }
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.stopPropagation(); this.#select('objectives'); }
    }, true);
  }

  open() {
    this.#select('scoreboard');
    this.#render();
    this.#gameState.set(AppState.SCOREBOARD);
    this.#input.exitPointerLock?.();
    this.#el.classList.add('show');
  }

  close() {
    this.#el.classList.remove('show');
    this.#gameState.set(AppState.PLAYING);
    this.#input.requestPointerLock?.();
  }

  /** Esc from the scoreboard drops straight into the pause menu. */
  #toPause() {
    this.#el.classList.remove('show');
    this.#gameState.set(AppState.PAUSED);
  }
}
