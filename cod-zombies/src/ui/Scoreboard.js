import { Service } from '../core/ServiceLocator.js';
import { AppState } from '../core/GameState.js';

/**
 * The Tab menu — a Scoreboard/Objectives overlay, fully separate from the pause
 * menu. Pressing Tab pauses the game (via the dedicated `scoreboard` app state,
 * which freezes the world on the live frame) and shows the player stats; Tab
 * again resumes, Esc routes to the pause menu.
 *
 * For now the Scoreboard screen is just the centred player-stats block, with
 * blank "easter-egg" cases framed above/below (room for future map widgets).
 * Stats are tallied from gameplay events: Score is the running sum of all points
 * EARNED (not the spendable balance), and a headshot kill counts in both Kills
 * and Headshots.
 */
export class Scoreboard {
  #events;
  #gameState;
  #input;

  #el;
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
    this.#build();
    this.#wireStats();
    this.#bindKeys();
  }

  get isOpen() { return this.#gameState.current === AppState.SCOREBOARD; }

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
            <div class="sb-stats">
              <div class="sb-grid sb-head">
                <span class="c-name">Survivor</span>
                <span>Score</span><span>Kills</span><span>Downs</span><span>Revives</span><span>Headshots</span>
              </div>
              <div class="sb-grid sb-row">
                <span class="c-name"><i class="sb-pip"></i>Survivor One</span>
                <span class="v-score">0</span><span class="v-kills">0</span><span class="v-downs">0</span><span class="v-revives">0</span><span class="v-headshots">0</span>
              </div>
              <div class="sb-grid sb-row sb-empty-slot">
                <span class="c-name"><i class="sb-pip"></i>Open Slot</span>
                <span>—</span><span>—</span><span>—</span><span>—</span><span>—</span>
              </div>
              <div class="sb-grid sb-row sb-empty-slot">
                <span class="c-name"><i class="sb-pip"></i>Open Slot</span>
                <span>—</span><span>—</span><span>—</span><span>—</span><span>—</span>
              </div>
              <div class="sb-grid sb-row sb-empty-slot">
                <span class="c-name"><i class="sb-pip"></i>Open Slot</span>
                <span>—</span><span>—</span><span>—</span><span>—</span><span>—</span>
              </div>
            </div>
            <div class="sb-case sb-bottom"></div>
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
  }

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

  #render() {
    for (const k of ['score', 'kills', 'downs', 'revives', 'headshots']) {
      if (this.#vals[k]) this.#vals[k].textContent = this.#stats[k].toLocaleString();
    }
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
