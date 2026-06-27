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

  // main-menu sub-screens + cold-open intro
  #intro; #introPlayed = false;
  #fade; #mapSelect; #soon;
  #mapOpen = false; #soonOpen = false; #entering = false;

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

    // seed the CSS-overlay vars from the resolved amounts (toggle × amount);
    // applyAll() re-broadcasts the authoritative values on settings:fx next.
    const gx = this.#settings.graphics;
    this.#applyFxVars({
      grain: gx.grain !== false ? gx.grainAmount : 0,
      scanlines: gx.scanlines,
      aberration: gx.aberration !== false ? gx.aberrationAmount : 0,
      vignette: gx.vignette !== false ? gx.vignetteAmount : 0,
    });
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
      <div class="mm-daily" id="mm-daily">
        <div class="mm-daily-head">Daily Challenge</div>
        <div class="mm-daily-body">
          <div class="mm-daily-ring empty"></div>
          <div class="mm-daily-name">No Daily Quest<small>Active</small></div>
        </div>
        <div class="mm-daily-foot">Check Back Tomorrow</div>
      </div>
      <div class="mm-player">
        <div class="mm-player-row"><span class="mm-lvl">1</span><span class="mm-name">Survivor One</span></div>
        <div class="mm-gums"><i></i><i></i><i></i><i></i><i></i></div>
      </div>
      <div class="mm-title" data-text="Necropolis">Necropolis</div>
      <div class="mm-list"></div>
      <div class="mm-foot">[↑↓] Select · [Enter] Confirm</div>`;

    const list = s.querySelector('.mm-list');
    const soon = (name, sub) => () => this.comingSoon(name, sub);
    const items = [
      { label: 'Solo Game', action: () => this.openMapSelect() },
      { label: 'Multiplayer', soon: true, action: soon('Multiplayer', 'Squad up with up to three other survivors against the horde.') },
      { label: 'Theater', soon: true, action: soon('Theater', 'Re-watch and clip your finest (and grisliest) runs.') },
      { label: 'GobbleGum', soon: true, action: soon('GobbleGum', 'Browse every GobbleGum and build your loadout.') },
      { label: "Dr. Newton's Factory", soon: true, action: soon("Dr. Newton's Factory", 'Spend Liquid Divinium to spin for GobbleGums.') },
      { label: "Newton's Cookbook", soon: true, action: soon("Newton's Cookbook", 'Trade and convert GobbleGums across rarities.') },
      { label: 'Weapon Kits', soon: true, action: soon('Weapon Kits', 'Customize every weapon with attachments.') },
      { label: 'Armory', soon: true, action: soon('Armory', 'Choose your survivor, skins, emblems and calling cards.') },
      { label: 'Options', action: () => this.openOptions(AppState.MENU) },
      { label: 'Quit', action: () => this.#quit() },
    ];
    this.#mainItems = [];
    items.forEach((it, i) => {
      const e = document.createElement('div');
      e.className = 'mm-opt';
      e.style.animationDelay = `${0.12 + i * 0.05}s`;
      e.innerHTML = `<span>${it.label}${it.soon ? '<span class="mm-tag">Soon</span>' : ''}</span>`;
      e.addEventListener('click', it.action);
      e.addEventListener('mouseenter', () => this.#select(this.#mainItems.indexOf(e)));
      this.#mainItems.push(e);
      list.appendChild(e);
    });
    s.querySelector('#mm-daily').addEventListener('click', () => this.comingSoon('Daily Challenge', "Complete daily objectives for GobbleGums and Liquid Divinium."));

    this.#root.appendChild(s);
    this.#screens.main = s;

    this.#buildFade();
    this.#buildMapSelect();
    this.#buildSoon();
    this.#buildIntro();
  }

  // --- cold-open intro ----------------------------------------------------
  #buildIntro() {
    const el = document.createElement('div');
    el.id = 'mm-intro';
    el.innerHTML = `
      <div class="tk-card">
        <div class="tk-name">Team Kracker</div>
        <div class="tk-mark"><span>T</span>K</div>
        <div class="tk-sub">presents</div>
      </div>`;
    document.body.appendChild(el);
    this.#intro = el;
  }

  /** Run the boot sequence once: linger, glitch/vibrate, dissolve to the menu. */
  playIntro() {
    if (!this.#intro || this.#introPlayed) return;
    this.#introPlayed = true;
    setTimeout(() => this.#intro.classList.add('glitch'), 1500);   // start vibrating
    setTimeout(() => this.#intro.classList.add('dissolve'), 2150); // dissolve away
    setTimeout(() => { this.#intro.classList.add('gone'); }, 2900);
  }

  #buildFade() {
    const el = document.createElement('div');
    el.id = 'mm-fade';
    document.body.appendChild(el);
    this.#fade = el;
  }

  // --- map select ---------------------------------------------------------
  #buildMapSelect() {
    const el = document.createElement('div');
    el.id = 'mm-mapselect';
    el.innerHTML = `
      <div class="mm-ms-wrap">
        <div class="mm-ms-list">
          <div class="mm-ms-head">Select Map</div>
          <div class="mm-map sel" data-map="zm_test"><span>ZM_Test</span></div>
        </div>
        <div class="mm-ms-preview">
          <img class="mm-ms-shot" alt="ZM_Test" src="${this.#mapShot()}" />
          <div class="mm-ms-cap">
            <h3>ZM_Test</h3>
            <p>A condemned containment annex on the frostbitten rim of Necropolis. The reanimation trials never stopped here — the staff simply stopped leaving. Boarded windows, a dead generator, and something that still paces the dark beyond the walls. Hold out, and learn what they were really making.</p>
          </div>
        </div>
      </div>
      <div class="mm-ms-back">Back</div>`;
    el.querySelector('.mm-map').addEventListener('click', () => this.fadeToPlay());
    el.querySelector('.mm-ms-back').addEventListener('click', () => this.closeMapSelect());
    document.body.appendChild(el);
    this.#mapSelect = el;
  }

  /** A small procedural "screenshot" of the map (dark, foggy, red-lit ruin). */
  #mapShot() {
    const c = document.createElement('canvas'); c.width = 520; c.height = 300;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 300);
    g.addColorStop(0, '#0a0f18'); g.addColorStop(0.6, '#0b0a10'); g.addColorStop(1, '#060507');
    x.fillStyle = g; x.fillRect(0, 0, 520, 300);
    // distant red glow
    const rg = x.createRadialGradient(300, 210, 0, 300, 210, 240);
    rg.addColorStop(0, 'rgba(150,20,16,0.4)'); rg.addColorStop(1, 'rgba(150,20,16,0)');
    x.fillStyle = rg; x.fillRect(0, 0, 520, 300);
    // building silhouette
    x.fillStyle = '#05060a';
    x.fillRect(120, 120, 300, 160);
    x.fillRect(90, 170, 80, 110); x.fillRect(360, 150, 90, 130);
    // lit windows
    for (let i = 0; i < 7; i++) { x.fillStyle = Math.random() < 0.5 ? 'rgba(255,120,40,0.7)' : 'rgba(80,160,200,0.5)'; x.fillRect(150 + i * 38, 150 + (i % 2) * 30, 16, 22); }
    // fog band
    const fg = x.createLinearGradient(0, 230, 0, 300); fg.addColorStop(0, 'rgba(120,140,160,0)'); fg.addColorStop(1, 'rgba(150,170,190,0.22)');
    x.fillStyle = fg; x.fillRect(0, 230, 520, 70);
    // grain
    for (let i = 0; i < 1400; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`; x.fillRect(Math.random() * 520, Math.random() * 300, 1, 1); }
    return c.toDataURL();
  }

  openMapSelect() { this.#mapSelect?.classList.add('show'); this.#mapOpen = true; }
  closeMapSelect() { this.#mapSelect?.classList.remove('show'); this.#mapOpen = false; }

  // --- coming soon --------------------------------------------------------
  #buildSoon() {
    const el = document.createElement('div');
    el.id = 'mm-soon';
    el.innerHTML = `
      <div class="mm-soon-card">
        <div class="tag" id="mm-soon-tag">Feature</div>
        <h2 id="mm-soon-title">—</h2>
        <div class="sub" id="mm-soon-sub"></div>
        <div class="soon">Coming Soon</div>
      </div>
      <div class="mm-soon-back">Back</div>`;
    el.querySelector('.mm-soon-back').addEventListener('click', () => this.#closeSoon());
    document.body.appendChild(el);
    this.#soon = el;
  }

  comingSoon(name, sub = '') {
    if (!this.#soon) return;
    this.#soon.querySelector('#mm-soon-title').textContent = name;
    this.#soon.querySelector('#mm-soon-sub').textContent = sub;
    this.#soon.classList.add('show');
    this.#soonOpen = true;
  }
  #closeSoon() { this.#soon?.classList.remove('show'); this.#soonOpen = false; }

  // --- map enter: fade to black, start the run, fade back in --------------
  fadeToPlay() {
    if (this.#entering) return;
    this.#entering = true;
    this.#input.requestPointerLock(); // synchronous in the click gesture (lock now, control later)
    this.#fade.classList.remove('slow');
    this.#fade.classList.add('show'); // fade to black (~0.55s) — still in MENU, so no movement/fire
    setTimeout(() => {
      this.closeMapSelect();
      this.#gameState.set(AppState.PLAYING); // round resets (1s pre-round); control begins
      this.#fade.classList.add('slow');
      requestAnimationFrame(() => this.#fade.classList.remove('show')); // fade the map in (~0.95s)
      setTimeout(() => { this.#entering = false; this.#fade.classList.remove('slow'); }, 1000);
    }, 600);
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
        if (this.#soonOpen) { this.#closeSoon(); e.preventDefault(); return; }
        if (this.#mapOpen) { this.closeMapSelect(); e.preventDefault(); return; }
        if (this.#optionsOpen) { this.closeOptions(); e.preventDefault(); return; }
        if (this.#gameState.current === AppState.PAUSED) { this.resume(); e.preventDefault(); return; }
        // In-game Esc is handled by the browser (exits lock -> pause).
        return;
      }
      // Main-menu navigation (suspended while a sub-panel/intro is up).
      if (this.#gameState.current === AppState.MENU && !this.#optionsOpen && !this.#mapOpen && !this.#soonOpen && !this.#entering) {
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
