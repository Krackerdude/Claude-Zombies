import { Service } from '../core/ServiceLocator.js';
import { AppState } from '../core/GameState.js';
import { PlayerTag } from '../ecs/components/index.js';
import { PERKS } from '../perks/perks.js';
import { WEAPON_KEYS, weaponName } from '../weapons/catalog.js';

/**
 * F2 dev/test overlay (top-right). Freezes the game like the scoreboard and lets
 * you mouse-click to grant points, perks, and any weapon in the game without
 * touching the box. Mouse-only; F2 toggles, Esc closes. Purely a UI driver — it
 * pushes points onto the player tag and calls the perk/weapon systems' public
 * grant hooks; nothing here lives in the simulation.
 */
export class DevMenu {
  #engine; #events; #gameState; #input;
  #el; #pointsLabel;

  constructor(engine) {
    this.#engine = engine;
    this.#events = engine.services.get(Service.Events);
    this.#gameState = engine.services.get(Service.GameState);
    this.#input = engine.services.get(Service.Input);
    this.#build();
    this.#bindKeys();
    this.#events.on('score:changed', ({ points }) => {
      if (this.#pointsLabel) this.#pointsLabel.textContent = points.toLocaleString();
    });
  }

  get isOpen() { return this.#gameState.current === AppState.DEVMENU; }

  #build() {
    const el = document.createElement('div');
    el.id = 'devmenu';
    const hex = (c) => '#' + c.toString(16).padStart(6, '0');

    let html = '<div class="dev-head">DEV MENU <span>[F2]</span></div>';

    html += '<div class="dev-sec"><div class="dev-title">Round</div><div class="dev-row">';
    for (const r of [1, 5, 10, 15, 20, 25, 30]) html += `<button class="dev-btn" data-round="${r}">${r}</button>`;
    html += '</div></div>';

    html += '<div class="dev-sec"><div class="dev-title">Points <b class="dev-points">0</b></div><div class="dev-row">';
    for (const amt of [500, 1000, 5000, 10000]) html += `<button class="dev-btn" data-points="${amt}">+${amt >= 1000 ? amt / 1000 + 'k' : amt}</button>`;
    html += '<button class="dev-btn dev-warn" data-points="clear">Clear</button></div></div>';

    html += '<div class="dev-sec"><div class="dev-title">Perks <button class="dev-btn dev-mini" data-perk="__all">All</button><button class="dev-btn dev-mini dev-warn" data-perk="__none">None</button></div><div class="dev-grid">';
    for (const id of Object.keys(PERKS)) html += `<button class="dev-btn dev-perk" data-perk="${id}" style="--pc:${hex(PERKS[id].color)}">${PERKS[id].name}</button>`;
    html += '</div></div>';

    html += '<div class="dev-sec"><div class="dev-title">Weapons</div><div class="dev-list">';
    for (const key of WEAPON_KEYS) html += `<button class="dev-btn dev-gun" data-gun="${key}">${weaponName(key)}</button>`;
    html += '</div></div>';

    html += '<div class="dev-sec"><div class="dev-title">Tacticals</div><div class="dev-row">';
    html += '<button class="dev-btn" data-tactical="monkey">Monkey Bomb</button>';
    html += '</div></div>';

    html += '<div class="dev-sec"><div class="dev-title">Barriers</div><div class="dev-row">';
    html += '<button class="dev-btn dev-warn" data-barrier="break">Break All</button>';
    html += '<button class="dev-btn" data-barrier="build">Build All</button>';
    html += '</div></div>';

    el.innerHTML = html;
    document.body.appendChild(el);
    this.#el = el;
    this.#pointsLabel = el.querySelector('.dev-points');

    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.points != null) this.#addPoints(b.dataset.points);
      else if (b.dataset.perk) this.#perk(b.dataset.perk);
      else if (b.dataset.gun) this.#engine.services.get(Service.Weapons)?.giveWeapon?.(b.dataset.gun);
      else if (b.dataset.tactical) this.#engine.services.get(Service.Tactical)?.giveTactical?.(b.dataset.tactical);
      else if (b.dataset.round != null) this.#jumpRound(parseInt(b.dataset.round, 10));
      else if (b.dataset.barrier) this.#barriers(b.dataset.barrier === 'break');
    });
  }

  #player() {
    const w = this.#engine.world;
    const pid = w.first(PlayerTag);
    return pid !== undefined ? w.get(pid, PlayerTag) : null;
  }

  #addPoints(arg) {
    const p = this.#player();
    if (!p) return;
    p.points = arg === 'clear' ? 0 : Math.max(0, (p.points || 0) + parseInt(arg, 10));
    this.#events.emit('score:changed', { points: p.points });
  }

  #jumpRound(n) {
    const round = this.#engine.services.has(Service.Round) ? this.#engine.services.get(Service.Round) : null;
    round?.jumpToRound?.(n);
  }

  /** Break (open) or build (close) every window at once. */
  #barriers(open) {
    const nav = this.#engine.services.has(Service.Nav) ? this.#engine.services.get(Service.Nav) : null;
    if (!nav?.barriers) return;
    for (const bar of nav.barriers) {
      if (!bar.teardownable && open) continue; // permanent walls stay closed
      bar.boards = open ? 0 : bar.maxBoards;
      bar.tearAcc = 0; bar.repairAcc = 0;
      this.#events.emit('barrier:changed', { id: bar.id, boards: bar.boards });
    }
    this.#events.emit('nav:changed', {});
  }

  #perk(id) {
    const perks = this.#engine.services.has(Service.Perks) ? this.#engine.services.get(Service.Perks) : null;
    if (!perks) return;
    if (id === '__all') { for (const k of Object.keys(PERKS)) perks.grantPerk(k); return; }
    if (id === '__none') { perks.clearPerks(); return; }
    perks.grantPerk(id);
  }

  #bindKeys() {
    // capture phase so F2/Esc are handled before other UIs and not double-fired
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F2') {
        e.preventDefault(); e.stopPropagation();
        const s = this.#gameState.current;
        if (s === AppState.PLAYING) this.open();
        else if (s === AppState.DEVMENU) this.close();
        return;
      }
      if (this.isOpen && e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); }
    }, true);
  }

  open() {
    const p = this.#player();
    if (p && this.#pointsLabel) this.#pointsLabel.textContent = (p.points || 0).toLocaleString();
    this.#gameState.set(AppState.DEVMENU); // freeze BEFORE releasing the mouse so no auto-pause
    this.#input.exitPointerLock?.();
    this.#el.classList.add('show');
  }

  close() {
    this.#el.classList.remove('show');
    this.#gameState.set(AppState.PLAYING);
    this.#input.requestPointerLock?.();
  }
}
