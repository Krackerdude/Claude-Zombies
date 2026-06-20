import { Service } from '../core/ServiceLocator.js';
import { AppState } from '../core/GameState.js';
import { OptionsMenu } from './OptionsMenu.js';

/**
 * Owns all menu DOM and orchestrates app-state transitions. The engine never
 * reaches into the page; this is the boundary. It:
 *   - builds the persistent FX overlay (grain/scanlines/vignette/aberration)
 *     and keeps its CSS vars in sync with the graphics settings
 *   - builds the main menu and pause menu, and embeds the OptionsMenu
 *   - decides which screen is visible from (state + whether options is open)
 *   - manages pointer lock (request only inside user-gesture handlers)
 */
export class UIManager {
  #engine;
  #gameState;
  #settings;
  #input;
  #events;

  #root;
  #fxVars;
  #screens = {};
  #options;

  #optionsOpen = false;
  #optionsReturn = AppState.MENU;

  #mainItems = [];
  #sel = 0;
  #pauseItems = [];
  #pauseSel = 0;
  #hud;

  constructor(engine) {
    this.#engine = engine;
    this.#gameState = engine.services.get(Service.GameState);
    this.#settings = engine.services.get(Service.Settings);
    this.#input = engine.services.get(Service.Input);
    this.#events = engine.services.get(Service.Events);
    this.#hud = document.getElementById('hud');

    this.#root = document.createElement('div');
    this.#root.id = 'ui-root';
    document.body.appendChild(this.#root);

    this.#buildFx();
    this.#buildMainMenu();
    this.#buildPause();
    this.#buildOptions();

    this.#applyFxVars(this.#settings.graphics);
    this.#events.on('settings:fx', (fx) => this.#applyFxVars(fx));
    this.#events.on('state:change', () => this.#refresh());

    this.#bindGlobalKeys();
    document.addEventListener('pointerlockchange', () => {
      // User pressed Esc (or otherwise lost lock) mid-game -> pause.
      if (!this.#input.pointerLocked && this.#gameState.isPlaying) this.pause();
    });
    // Re-acquire lock on click while playing — browsers enforce a short cooldown
    // after Esc that can make a single "Resume" click fail to re-lock.
    document.addEventListener('pointerdown', () => {
      if (this.#gameState.isPlaying && !this.#input.pointerLocked) this.#input.requestPointerLock();
    });

    this.#refresh();
  }

  // --- FX overlay ---------------------------------------------------------

  #buildFx() {
    const fx = document.createElement('div');
    fx.id = 'fx';
    fx.innerHTML = `
      <div class="vignette"></div>
      <div class="scanlines"></div>
      <div class="aberration"></div>
      <div class="grain"></div>
      <div class="flicker"></div>`;
    this.#root.appendChild(fx);
    this.#fxVars = document.documentElement;
  }

  #applyFxVars(fx) {
    const s = this.#fxVars.style;
    if (fx.grain != null) s.setProperty('--fx-grain', fx.grain);
    if (fx.scanlines != null) s.setProperty('--fx-scanlines', fx.scanlines ? 1 : 0);
    if (fx.aberration != null) s.setProperty('--fx-aberration', fx.aberration);
    if (fx.vignette != null) s.setProperty('--fx-vignette', fx.vignette);
  }

  // --- main menu ----------------------------------------------------------

  #buildMainMenu() {
    const s = document.createElement('div');
    s.className = 'screen';
    s.id = 'screen-main';
    s.innerHTML = `
      <div class="bg-letter">N</div>
      <div class="diag-slashes"></div>
      <div class="brand">
        <div class="kicker">Project</div>
        <div class="title" data-text="Necropolis">Necropolis</div>
      </div>
      <div class="menu-list"></div>
      <div class="corner bl"><span class="mark">✶</span> NECRO ENGINE</div>
      <div class="corner bc">Pre-Alpha v0.3</div>
      <div class="corner br">[↑↓] SELECT · [ENTER] CONFIRM</div>`;

    const list = s.querySelector('.menu-list');
    const items = [
      { label: 'Continue', disabled: true },
      { label: 'New Game', action: () => this.startGame() },
      { label: 'Options', action: () => this.openOptions(AppState.MENU) },
      { label: 'Quit', action: () => this.#quit() },
    ];
    this.#mainItems = [];
    items.forEach((it, i) => {
      const e = document.createElement('div');
      e.className = 'menu-item' + (it.disabled ? ' disabled' : '');
      e.style.animationDelay = `${0.15 + i * 0.08}s`;
      e.innerHTML = `<span class="idx">0${i + 1}</span>${it.label}`;
      if (!it.disabled) {
        e.addEventListener('click', it.action);
        e.addEventListener('mouseenter', () => this.#select(this.#mainItems.indexOf(e)));
        this.#mainItems.push(e);
      }
      list.appendChild(e);
    });

    this.#root.appendChild(s);
    this.#screens.main = s;
  }

  #select(i) {
    if (i < 0 || i >= this.#mainItems.length) return;
    this.#sel = i;
    this.#mainItems.forEach((e, idx) => e.classList.toggle('sel', idx === i));
  }

  // --- pause --------------------------------------------------------------

  #buildPause() {
    const s = document.createElement('div');
    s.className = 'screen';
    s.id = 'screen-pause';
    s.innerHTML = `
      <div class="pause-card">
        <div class="pause-title">Paused</div>
        <div class="menu-list">
          <div class="menu-item" data-act="resume"><span class="idx">01</span>Resume</div>
          <div class="menu-item" data-act="options"><span class="idx">02</span>Settings</div>
          <div class="menu-item" data-act="main"><span class="idx">03</span>Return to Menu</div>
        </div>
        <div class="pause-hint">[↑↓] SELECT · [ENTER] CONFIRM · [ESC] RESUME</div>
      </div>`;
    const acts = {
      resume: () => this.resume(),
      options: () => this.openOptions(AppState.PAUSED),
      main: () => this.toMainMenu(),
    };
    this.#pauseItems = [];
    s.querySelectorAll('.menu-item').forEach((e) => {
      const fn = acts[e.dataset.act];
      e.addEventListener('click', fn);
      e.addEventListener('mouseenter', () => this.#selectPause(this.#pauseItems.indexOf(e)));
      e._action = fn;
      this.#pauseItems.push(e);
    });
    this.#root.appendChild(s);
    this.#screens.pause = s;
  }

  #selectPause(i) {
    if (i < 0 || i >= this.#pauseItems.length) return;
    this.#pauseSel = i;
    this.#pauseItems.forEach((e, idx) => e.classList.toggle('sel', idx === i));
  }

  // --- options ------------------------------------------------------------

  #buildOptions() {
    const actions = this.#engine.services.get(Service.Actions);
    this.#options = new OptionsMenu(this.#settings, actions, () => this.closeOptions());
    this.#root.appendChild(this.#options.el);
    this.#screens.options = this.#options.el;
  }

  // --- transitions --------------------------------------------------------

  startGame() {
    this.#input.requestPointerLock();
    this.#gameState.set(AppState.PLAYING);
  }

  resume() {
    this.#input.requestPointerLock();
    this.#gameState.set(AppState.PLAYING);
  }

  pause() {
    this.#optionsOpen = false;
    this.#gameState.set(AppState.PAUSED);
  }

  toMainMenu() {
    this.#optionsOpen = false;
    this.#input.exitPointerLock();
    this.#gameState.set(AppState.MENU);
  }

  openOptions(returnTo) {
    this.#optionsReturn = returnTo;
    this.#optionsOpen = true;
    this.#refresh();
  }

  closeOptions() {
    this.#optionsOpen = false;
    this.#refresh();
  }

  /** Decide which single screen is visible from state + options flag. */
  #refresh() {
    const state = this.#gameState.current;
    let visible = null;
    if (this.#optionsOpen) visible = 'options';
    else if (state === AppState.MENU) visible = 'main';
    else if (state === AppState.PAUSED) visible = 'pause';

    for (const [id, el] of Object.entries(this.#screens)) {
      const on = id === visible;
      el.classList.toggle('active', on);
      if (on) {
        el.classList.remove('enter');
        void el.offsetWidth; // restart entrance animation
        el.classList.add('enter');
      }
    }

    if (visible === 'main') this.#select(0);
    if (visible === 'pause') this.#selectPause(0);
    // HUD only while actually playing.
    if (this.#hud) this.#hud.style.display = state === AppState.PLAYING ? 'block' : 'none';
    document.body.dataset.state = state;
  }

  // --- keyboard -----------------------------------------------------------

  #bindGlobalKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.#optionsOpen) { this.closeOptions(); e.preventDefault(); return; }
        if (this.#gameState.current === AppState.PAUSED) { this.resume(); e.preventDefault(); return; }
        // In-game Esc is handled by the browser (exits lock -> pause).
        return;
      }
      // Main-menu navigation.
      if (this.#gameState.current === AppState.MENU && !this.#optionsOpen) {
        if (e.code === 'ArrowDown' || e.code === 'KeyS') { this.#select((this.#sel + 1) % this.#mainItems.length); e.preventDefault(); }
        else if (e.code === 'ArrowUp' || e.code === 'KeyW') { this.#select((this.#sel - 1 + this.#mainItems.length) % this.#mainItems.length); e.preventDefault(); }
        else if (e.code === 'Enter' || e.code === 'Space') { this.#mainItems[this.#sel]?.click(); e.preventDefault(); }
      }
      // Pause-menu navigation.
      if (this.#gameState.current === AppState.PAUSED && !this.#optionsOpen) {
        if (e.code === 'ArrowDown' || e.code === 'KeyS') { this.#selectPause((this.#pauseSel + 1) % this.#pauseItems.length); e.preventDefault(); }
        else if (e.code === 'ArrowUp' || e.code === 'KeyW') { this.#selectPause((this.#pauseSel - 1 + this.#pauseItems.length) % this.#pauseItems.length); e.preventDefault(); }
        else if (e.code === 'Enter') { this.#pauseItems[this.#pauseSel]?.click(); e.preventDefault(); }
      }
    });
  }

  #quit() {
    this.#input.exitPointerLock();
    const over = document.createElement('div');
    over.style.cssText = 'position:fixed;inset:0;z-index:100;background:#000;display:flex;align-items:center;justify-content:center;color:#b3201c;font-family:Anton,Impact,sans-serif;font-size:3rem;letter-spacing:.3em;text-transform:uppercase;';
    over.textContent = 'Stay Dead.';
    document.body.appendChild(over);
    window.close?.();
  }
}
