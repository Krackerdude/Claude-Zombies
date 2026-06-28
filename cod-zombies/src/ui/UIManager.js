import { Service } from '../core/ServiceLocator.js';
import { AppState } from '../core/GameState.js';
import { OptionsMenu } from './OptionsMenu.js';
import { levelFromXp, MAX_LEVEL } from '../profile/index.js';
import { diviniumVialSvg } from './diviniumVial.js';
import { GobbleGumMenu } from './GobbleGumMenu.js';
import { GobblePackMenu } from './GobblePackMenu.js';
import { PlayerWidget } from './PlayerWidget.js';
import { PackStore } from '../gobblegums/PackStore.js';
import { GumballMachineView } from './GumballMachineView.js';

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
  #profile;
  #ldPopup; #ldTimer;

  // main-menu sub-screens + cold-open intro
  #intro; #introPlayed = false;
  #fade; #mapSelect; #soon;
  #mapOpen = false; #soonOpen = false; #entering = false;
  #gobblegum; #ggOpen = false;
  #packs; #widget; #packMenu; #machineView; #gpOpen = false;

  constructor(engine) {
    this.#engine = engine;
    this.#gameState = engine.services.get(Service.GameState);
    this.#settings = engine.services.get(Service.Settings);
    this.#input = engine.services.get(Service.Input);
    this.#events = engine.services.get(Service.Events);
    this.#profile = engine.services.has(Service.Profile) ? engine.services.get(Service.Profile) : null;
    this.#hud = document.getElementById('hud');

    this.#root = document.createElement('div');
    this.#root.id = 'ui-root';
    document.body.appendChild(this.#root);

    this.#buildFx();
    this.#buildMainMenu();
    this.#buildPause();
    this.#buildOptions();

    // GobbleGum: persistent pack state + the single shared player widget that is
    // re-parented between menus, the pack pre-menu (with its live 3D machine),
    // and the catalog (in edit mode it fills the equipped pack).
    this.#packs = new PackStore(this.#profile, this.#events);
    this.#widget = new PlayerWidget({ profile: this.#profile, packs: this.#packs, events: this.#events });
    this.#machineView = new GumballMachineView();
    this.#gobblegum = new GobbleGumMenu({ packs: this.#packs, onClose: () => this.#onCatalogClosed() });
    this.#packMenu = new GobblePackMenu({
      packs: this.#packs,
      machineView: this.#machineView,
      onCustomize: () => this.openGobbleGums(),
      onClose: () => this.#onPackMenuClosed(),
    });
    this.#events.on('gobblegum:changed', () => { this.#widget.refresh(); this.#packMenu.refresh(); });
    // park the widget in its home (main-menu top-right)
    this.#widget.mountTo(this.#screens.main, { top: '6%', right: 'clamp(24px,3vw,64px)' });

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

    // Level / progress shown on the main-menu player widget + pause-menu rank bar
    // are derived from the persistent profile. Paint them now and on any change.
    this.#refreshRank();
    this.#events.on('profile:loaded', () => this.#refreshRank());
    this.#events.on('profile:changed', () => this.#refreshRank());

    // Liquid Divinium: the in-game earn popup + factory tracker.
    this.#buildDiviniumPopup();
    this.#events.on('divinium:earned', ({ amount }) => this.#showDivinium(amount));
    this.#events.on('divinium:earned', () => this.#refreshDivinium());
    this.#events.on('divinium:changed', () => this.#refreshDivinium());
    this.#events.on('profile:loaded', () => this.#refreshDivinium());

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

  // --- player rank (pause-menu bar; the shared widget repaints itself) ----

  /** Snapshot the profile's level/progress and paint the pause-menu rank bar. */
  #refreshRank() {
    const xp = this.#profile?.get('progression.xp', 0) ?? 0;
    const name = this.#profile?.get('identity.displayName', 'Survivor One') ?? 'Survivor One';
    const r = levelFromXp(xp);
    const pct = Math.round(r.ratio * 100);
    const next = r.max
      ? 'Max Level'
      : `Next Level: ${(r.needed - r.into).toLocaleString()} XP`;

    // pause-menu rank bar
    const badge = this.#root.querySelector('.pm-rank-badge');
    const pname = this.#root.querySelector('.pm-rank-name');
    const pnext = this.#root.querySelector('.pm-rank-next');
    const fill = this.#root.querySelector('.pm-rank-track > i');
    if (badge) badge.textContent = r.level >= MAX_LEVEL ? 'MAX' : String(r.level);
    if (pname) pname.textContent = name;
    if (pnext) pnext.textContent = next;
    if (fill) fill.style.width = `${pct}%`;
  }

  // --- Liquid Divinium (earn popup + factory tracker) ---------------------

  #buildDiviniumPopup() {
    const el = document.createElement('div');
    el.id = 'ld-popup';
    el.innerHTML = `
      <div class="ld-popup-vial">${diviniumVialSvg()}</div>
      <div class="ld-popup-text">
        <span class="ld-popup-amt">+1</span>
        <span class="ld-popup-label">Liquid Divinium</span>
      </div>`;
    document.body.appendChild(el);
    this.#ldPopup = el;
  }

  /** Flash the stylized "+N Liquid Divinium" popup at the top-middle. */
  #showDivinium(amount) {
    const el = this.#ldPopup;
    if (!el) return;
    el.querySelector('.ld-popup-amt').textContent = `+${amount}`;
    // restart the entry animation even if it's already mid-show
    el.classList.remove('show');
    void el.offsetWidth; // reflow so the animation re-triggers
    el.classList.add('show');
    clearTimeout(this.#ldTimer);
    this.#ldTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  /** Repaint the persistent balance shown on the factory tracker widget. */
  #refreshDivinium() {
    const count = this.#profile?.get('currency.liquidDivinium', 0) ?? 0;
    for (const c of this.#root.querySelectorAll('.ld-track-count')) c.textContent = count.toLocaleString();
    const soonCount = this.#soon?.querySelector('.ld-track-count');
    if (soonCount) soonCount.textContent = count.toLocaleString();
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
      <div class="mm-title" data-text="Necropolis">Necropolis</div>
      <div class="mm-list"></div>
      <div class="mm-foot">[↑↓] Select · [Enter] Confirm</div>`;

    const list = s.querySelector('.mm-list');
    const soon = (name, sub) => () => this.comingSoon(name, sub);
    const items = [
      { label: 'Solo Game', action: () => this.openMapSelect() },
      { label: 'Multiplayer', soon: true, action: soon('Multiplayer', 'Squad up with up to three other survivors against the horde.') },
      { label: 'Theater', soon: true, action: soon('Theater', 'Re-watch and clip your finest (and grisliest) runs.') },
      { label: 'GobbleGum', action: () => this.openGobblePacks() },
      { label: "Dr. Newton's Factory", soon: true, action: () => this.comingSoon("Dr. Newton's Factory", 'Spend Liquid Divinium to spin for GobbleGums.', { divinium: true }) },
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

  /** Main menu → GobbleGum pack pre-menu (widget parks top-left). */
  openGobblePacks() {
    this.#widget.setEditable(false);
    this.#widget.mountTo(this.#packMenu.el ?? document.body, { top: '96px', left: '40px' });
    this.#packMenu.open();
    this.#gpOpen = true;
  }
  #onPackMenuClosed() {
    // return the widget to its main-menu home
    this.#widget.setEditable(false);
    this.#widget.mountTo(this.#screens.main, { top: '6%', right: 'clamp(24px,3vw,64px)' });
    this.#gpOpen = false;
  }

  /** Pack pre-menu → catalog in edit mode (widget moves to bottom-left, fills). */
  openGobbleGums() {
    this.#gobblegum.open();
    this.#widget.setEditable(true);
    this.#widget.mountTo(this.#gobblegum.el, { bottom: '24px', left: '40px' });
    this.#ggOpen = true;
  }
  #onCatalogClosed() {
    // back to the pack pre-menu — re-park the widget top-left, stop editing
    this.#ggOpen = false;
    this.#widget.setEditable(false);
    this.#packs.clearSelection();
    if (this.#gpOpen) this.#widget.mountTo(this.#packMenu.el, { top: '96px', left: '40px' });
    this.#packMenu.refresh();
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
        <div class="ld-track" id="mm-soon-divinium" hidden>
          <div class="ld-track-vial">${diviniumVialSvg()}</div>
          <div class="ld-track-main">
            <span class="ld-track-label">Liquid Divinium</span>
            <span class="ld-track-count">0</span>
          </div>
        </div>
        <div class="soon">Coming Soon</div>
      </div>
      <div class="mm-soon-back">Back</div>`;
    el.querySelector('.mm-soon-back').addEventListener('click', () => this.#closeSoon());
    document.body.appendChild(el);
    this.#soon = el;
  }

  comingSoon(name, sub = '', { divinium = false } = {}) {
    if (!this.#soon) return;
    this.#soon.querySelector('#mm-soon-title').textContent = name;
    this.#soon.querySelector('#mm-soon-sub').textContent = sub;
    // the factory screen shows the player's persistent Liquid Divinium balance
    const track = this.#soon.querySelector('#mm-soon-divinium');
    if (track) track.hidden = !divinium;
    if (divinium) this.#refreshDivinium();
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

  // Pause-menu Options categories (mirrors the OptionsMenu tabs), each a widget
  // card with a stylised line-art icon.
  static #PAUSE_CATS = [
    { id: 'gameplay', name: 'Gameplay', sub: 'Rules + HUD options', icon: '<circle cx="12" cy="12" r="7"/><path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>' },
    { id: 'display', name: 'Display', sub: 'FOV, HUD scale, resolution', icon: '<rect x="3" y="4.5" width="18" height="12" rx="1"/><path d="M9 20.5h6M12 16.5v4" stroke-linecap="round"/>' },
    { id: 'postfx', name: 'Post FX', sub: 'The stylized composer', icon: '<circle cx="12" cy="12" r="5.5"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.2 6.2l1.6 1.6M16.2 16.2l1.6 1.6M17.8 6.2l-1.6 1.6M7.8 16.2l-1.6 1.6" stroke-linecap="round"/>' },
    { id: 'graphics', name: 'Graphics', sub: 'Rendering + atmosphere', icon: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 16l5-5 3.5 3.5L15 11l6 6" stroke-linejoin="round"/><circle cx="8" cy="9.5" r="1.4"/>' },
    { id: 'controls', name: 'Controls', sub: 'Sensitivity + key bindings', icon: '<rect x="2" y="6.5" width="20" height="11" rx="2"/><path d="M6 10.5h.01M10 10.5h.01M14 10.5h.01M18 10.5h.01M8 14h8" stroke-linecap="round"/>' },
  ];

  #buildPause() {
    const s = document.createElement('div');
    s.className = 'screen';
    s.id = 'screen-pause';
    const cats = UIManager.#PAUSE_CATS.map((c) =>
      `<div class="pm-cat" data-cat="${c.id}"><div class="pm-cat-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">${c.icon}</svg></div><div class="pm-cat-name">${c.name}<small>${c.sub}</small></div></div>`,
    ).join('');
    s.innerHTML = `
      <div class="pm-head">Menu<small>Paused</small></div>
      <div class="pm-tabs">
        <div class="pm-tab active" data-tab="game"><span>Game</span></div>
        <div class="pm-tab" data-tab="options"><span>Options</span></div>
      </div>
      <div class="pm-body">
        <div class="pm-pane" data-pane="game">
          <div class="mm-list pm-gamelist">
            <div class="mm-opt" data-act="resume"><span>Resume Game</span></div>
            <div class="mm-opt" data-act="restart"><span>Restart Level</span></div>
            <div class="mm-opt" data-act="end"><span>End Game</span></div>
          </div>
        </div>
        <div class="pm-pane" data-pane="options" hidden>
          <div class="pm-grid">${cats}</div>
        </div>
      </div>
      <div class="pm-rank">
        <div class="pm-rank-badge">0</div>
        <div class="pm-rank-main">
          <div class="pm-rank-row"><span class="pm-rank-name">Survivor One</span><span class="pm-rank-next">Next Level: 4,000 XP</span></div>
          <div class="pm-rank-track"><i style="width:0%"></i></div>
        </div>
      </div>
      <div class="pm-foot">[Esc] Resume · [Enter] Confirm</div>`;

    // game-tab actions
    const acts = {
      resume: () => this.resume(),
      restart: () => { this.#events.emit('game:restart', {}); this.resume(); },
      end: () => this.toMainMenu(),
    };
    this.#pauseItems = [];
    s.querySelectorAll('.pm-gamelist .mm-opt').forEach((e) => {
      e.addEventListener('click', acts[e.dataset.act]);
      e.addEventListener('mouseenter', () => this.#selectPause(this.#pauseItems.indexOf(e)));
      this.#pauseItems.push(e);
    });
    // tab switching
    s.querySelectorAll('.pm-tab').forEach((t) => t.addEventListener('click', () => this.#switchPauseTab(t.dataset.tab)));
    // options category widgets -> open the settings on that category
    s.querySelectorAll('.pm-cat').forEach((c) => c.addEventListener('click', () => {
      this.openOptions(AppState.PAUSED);
      this.#options.goTo(c.dataset.cat);
    }));

    this.#root.appendChild(s);
    this.#screens.pause = s;
  }

  #switchPauseTab(tab) {
    const s = this.#screens.pause;
    if (!s) return;
    s.querySelectorAll('.pm-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    let shown = null;
    s.querySelectorAll('.pm-pane').forEach((p) => { p.hidden = p.dataset.pane !== tab; if (!p.hidden) shown = p; });
    this.#animatePane(shown);
    if (tab === 'game') this.#selectPause(0);
  }

  /** Restart the staggered entrance on a freshly-shown pane's items. */
  #animatePane(pane) {
    if (!pane) return;
    pane.classList.remove('pm-anim'); void pane.offsetWidth; pane.classList.add('pm-anim');
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
    this.#switchPauseTab('game'); // always open the pause menu on the Game tab
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
    if (visible === 'pause') { this.#selectPause(0); this.#animatePane(this.#screens.pause.querySelector('.pm-pane:not([hidden])')); }
    // HUD only while actually playing.
    if (this.#hud) this.#hud.style.display = state === AppState.PLAYING ? 'block' : 'none';
    document.body.dataset.state = state;
  }

  // --- keyboard -----------------------------------------------------------

  #bindGlobalKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.#ggOpen) { this.#gobblegum.close(); e.preventDefault(); return; }
        if (this.#gpOpen) { this.#packMenu.close(); e.preventDefault(); return; }
        if (this.#soonOpen) { this.#closeSoon(); e.preventDefault(); return; }
        if (this.#mapOpen) { this.closeMapSelect(); e.preventDefault(); return; }
        if (this.#optionsOpen) { this.closeOptions(); e.preventDefault(); return; }
        if (this.#gameState.current === AppState.PAUSED) { this.resume(); e.preventDefault(); return; }
        // In-game Esc is handled by the browser (exits lock -> pause).
        return;
      }
      // Main-menu navigation (suspended while a sub-panel/intro is up).
      if (this.#gameState.current === AppState.MENU && !this.#optionsOpen && !this.#mapOpen && !this.#soonOpen && !this.#ggOpen && !this.#gpOpen && !this.#entering) {
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
