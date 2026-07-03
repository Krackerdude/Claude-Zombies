import { Service } from '../core/ServiceLocator.js';
import { AppState } from '../core/GameState.js';

/**
 * F4 Gun Stats menu — live-tune the weapon in your hands mid-run. Sliders (each
 * with an exact number field) drive damage, fire rate, reload speed, and the two
 * VISUAL-recoil multipliers (hip + ADS). Changes apply to the held weapon
 * immediately; a copy-ready readout echoes the exact values so a tune can be
 * screenshot / pasted straight back into chat to bake into the catalog.
 *
 * Mouse-only, like the F2 dev menu: F4 toggles, it frees the cursor + freezes
 * the world (adjust, close, then fire to feel the change).
 */
const FIELDS = [
  { k: 'damage', label: 'Damage', min: 0, max: 3000, step: 5, dp: 0 },
  { k: 'fireRate', label: 'Fire Rate (RPM)', min: 40, max: 1400, step: 10, dp: 0 },
  { k: 'reloadTime', label: 'Reload Time (s)', min: 0.3, max: 6, step: 0.1, dp: 2 },
  { k: 'visualRecoilHip', label: 'Visual Recoil · Hip', min: 0, max: 2, step: 0.05, dp: 2 },
  { k: 'visualRecoilAds', label: 'Visual Recoil · ADS', min: 0, max: 2, step: 0.05, dp: 2 },
];

export class GunStatsMenu {
  #engine; #events; #gameState; #input;
  #el; #body; #open = false;

  constructor(engine) {
    this.#engine = engine;
    this.#events = engine.services.get(Service.Events);
    this.#gameState = engine.services.get(Service.GameState);
    this.#input = engine.services.get(Service.Input);
    this.#build();
    this.#bindKeys();
  }

  get isOpen() { return this.#open; }

  #weapons() { return this.#engine.services.has(Service.Weapons) ? this.#engine.services.get(Service.Weapons) : null; }

  #build() {
    const el = document.createElement('div');
    el.id = 'gunstats';
    el.innerHTML = `
      <div class="gs-head">GUN STATS <span>[F4]</span></div>
      <div class="gs-gun" id="gs-gun">—</div>
      <div class="gs-body" id="gs-body"></div>
      <div class="gs-foot">
        <button class="gs-reset" id="gs-reset">Reset gun</button>
        <button class="gs-copy" id="gs-copy">Copy values</button>
      </div>
      <textarea class="gs-readout" id="gs-readout" readonly spellcheck="false"></textarea>`;
    document.body.appendChild(el);
    this.#el = el;
    this.#body = el.querySelector('#gs-body');
    el.querySelector('#gs-copy').addEventListener('click', () => this.#copy());
    el.querySelector('#gs-reset').addEventListener('click', () => this.#reset());
    // keep number/slider typing from leaking to the game
    el.addEventListener('keydown', (e) => { if (e.code !== 'F4') e.stopPropagation(); });
  }

  #render() {
    const ws = this.#weapons();
    const w = ws?.current;
    const gunEl = this.#el.querySelector('#gs-gun');
    if (!w) {
      gunEl.textContent = 'No weapon equipped';
      this.#body.innerHTML = '<div class="gs-empty">Draw a weapon, then reopen [F4].</div>';
      this.#el.querySelector('#gs-readout').value = '';
      return;
    }
    gunEl.textContent = `${w.data.name}  ·  ${ws.currentKey() || ''}`;
    this.#body.innerHTML = FIELDS.map((f) => {
      const v = Number(w.data[f.k] ?? 0);
      const max = Math.max(f.max, v);
      return `<div class="gs-row" data-k="${f.k}">
        <div class="gs-lbl">${f.label}</div>
        <div class="gs-ctl">
          <input class="gs-sl" type="range" min="${f.min}" max="${max}" step="${f.step}" value="${v}">
          <input class="gs-num" type="number" min="${f.min}" step="${f.step}" value="${v.toFixed(f.dp)}">
        </div>
      </div>`;
    }).join('');
    this.#body.querySelectorAll('.gs-row').forEach((row) => {
      const k = row.dataset.k;
      const sl = row.querySelector('.gs-sl'), num = row.querySelector('.gs-num');
      const apply = (val, from) => {
        if (Number.isNaN(val)) return;
        w.data[k] = val;
        if (from !== 'sl') sl.value = String(val);
        if (from !== 'num') num.value = String(val);
        this.#renderReadout();
      };
      sl.addEventListener('input', () => apply(parseFloat(sl.value), 'sl'));
      num.addEventListener('input', () => apply(parseFloat(num.value), 'num'));
    });
    this.#renderReadout();
  }

  #renderReadout() {
    const ws = this.#weapons(); const w = ws?.current;
    if (!w) return;
    const f = (k, dp) => Number(w.data[k] ?? 0).toFixed(dp);
    this.#el.querySelector('#gs-readout').value = [
      `${ws.currentKey() || w.data.name}: {`,
      `  damage: ${f('damage', 0)},`,
      `  fireRate: ${f('fireRate', 0)},`,
      `  reloadTime: ${f('reloadTime', 2)},`,
      `  visualRecoilHip: ${f('visualRecoilHip', 2)},`,
      `  visualRecoilAds: ${f('visualRecoilAds', 2)},`,
      `}`,
    ].join('\n');
  }

  #copy() {
    const ta = this.#el.querySelector('#gs-readout');
    ta.select();
    try { navigator.clipboard?.writeText(ta.value); } catch { document.execCommand?.('copy'); }
    const b = this.#el.querySelector('#gs-copy');
    b.textContent = 'Copied!'; setTimeout(() => { b.textContent = 'Copy values'; }, 1200);
  }

  #reset() {
    // rebuild the held gun from the catalog (restores default stats), then re-read
    const ws = this.#weapons();
    if (!ws?.currentKey) return;
    ws.giveWeapon?.(ws.currentKey());
    setTimeout(() => this.#render(), 0);
  }

  #bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F4') {
        e.preventDefault(); e.stopPropagation();
        const s = this.#gameState.current;
        if (s === AppState.PLAYING) this.open();
        else if (s === AppState.DEVMENU && this.#open) this.close();
        return;
      }
      if (this.#open && e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); }
    }, true);
  }

  open() {
    this.#render();
    this.#gameState.set(AppState.DEVMENU); // freeze before releasing the mouse
    this.#input.exitPointerLock?.();
    this.#el.classList.add('show');
    this.#open = true;
  }

  close() {
    this.#el.classList.remove('show');
    this.#open = false;
    this.#gameState.set(AppState.PLAYING);
    this.#input.requestPointerLock?.();
  }
}
