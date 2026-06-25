import { System } from '../ecs/System.js';
import { PlayerTag, Transform } from '../ecs/components/index.js';
import { Service } from '../core/ServiceLocator.js';
import { Action } from '../config/keybinds.js';
import { EconomyConfig, BarrierConfig } from '../config/zombies.js';
import { weaponName, weaponCost, BOX_POOL } from '../weapons/catalog.js';

/**
 * The points economy + interaction layer. Each frame it finds the single
 * interactable nearest the player (a wall-buy, the mystery box, or a damaged
 * window) and publishes a `[E]` prompt for it; pressing/holding interact acts on
 * that focus. Owns the mystery box state machine (idle → spinning → ready) and
 * grants weapons through the WeaponSystem's giveWeapon() API.
 */
export class EconomySystem extends System {
  #gameState;
  #actions;
  #events;
  #nav;
  #weapons; // WeaponSystem
  #economy; // { wallBuys, box } from the scene
  #playerId;

  #box = { state: 'idle', timer: 0, hold: 0, result: null, display: null, cycle: 0 };
  #lastPrompt = null;

  get #perks() { return this.world.services.has(Service.Perks) ? this.world.services.get(Service.Perks) : null; }

  // Capture the interact press every render frame; the fixed-step handler can
  // miss a one-frame edge on ticks where it doesn't run (cause of double-press).
  #interactEdge = false;
  update() {
    if (this.#gameState.isPlaying && this.#actions.pressed(Action.INTERACT)) this.#interactEdge = true;
  }

  init() {
    this.#gameState = this.world.services.get(Service.GameState);
    this.#actions = this.world.services.get(Service.Actions);
    this.#events = this.world.services.get(Service.Events);
    this.#nav = this.world.services.get(Service.Nav);
    this.#weapons = this.world.services.get(Service.Weapons);
    this.#economy = this.world.services.get(Service.Economy);

    this.#events.on('state:change', ({ state }) => {
      if (state !== 'playing') { this.#box.state = 'idle'; this.#events.emit('box:idle', {}); this.#prompt(null); }
    });
  }

  fixedUpdate(dt) {
    if (!this.#gameState.isPlaying) return;
    this.#playerId = this.world.first(PlayerTag, Transform);
    if (this.#playerId === undefined) return;
    const player = this.world.get(this.#playerId, PlayerTag);
    const pos = this.world.get(this.#playerId, Transform).position;

    this.#tickBox(dt);

    const focus = this.#focus(pos);
    this.#showPrompt(focus, player);

    const edge = this.#interactEdge;
    this.#interactEdge = false;
    if (!focus) return;
    if (focus.kind === 'repair') {
      if (this.#actions.active(Action.INTERACT)) this.#repair(focus.barrier, player);
    } else if (edge) {
      if (focus.kind === 'wallbuy') this.#buyWall(focus, player);
      else if (focus.kind === 'box') this.#useBox(focus, player);
      else if (focus.kind === 'perk') this.#perks?.tryBuy(focus.m.id, player);
    }
  }

  // --- focus / prompts ----------------------------------------------------

  #focus(pos) {
    let best = null;
    let bestD = EconomyConfig.interactReach;
    const consider = (cand, x, z) => {
      const d = Math.hypot(x - pos.x, z - pos.z);
      if (d < bestD) { bestD = d; best = cand; }
    };

    for (const wb of this.#economy.wallBuys) consider({ kind: 'wallbuy', wb }, wb.position.x, wb.position.z);
    const box = this.#economy.box;
    if (box) consider({ kind: 'box', box }, box.position.x, box.position.z);
    for (const b of this.#nav.barriers) {
      if (b.boards < b.maxBoards) consider({ kind: 'repair', barrier: b }, b.position.x, b.position.z);
    }
    const perks = this.#perks;
    if (perks) for (const m of perks.machines()) { if (!perks.owns(m.id)) consider({ kind: 'perk', m }, m.x, m.z); }
    return best;
  }

  #showPrompt(focus, player) {
    if (!focus) return this.#prompt(null);
    let text, affordable = true;
    if (focus.kind === 'wallbuy') {
      const owns = this.#weapons.owns(focus.wb.key);
      const cost = owns ? Math.round(focus.wb.cost * EconomyConfig.ammoRefillFactor) : focus.wb.cost;
      affordable = player.points >= cost;
      text = `[E] ${owns ? 'Ammo' : 'Buy'} ${weaponName(focus.wb.key)} — ${cost}`;
    } else if (focus.kind === 'box') {
      if (this.#box.state === 'spinning') { text = '...'; affordable = true; }
      else if (this.#box.state === 'ready') { text = `[E] Take ${weaponName(this.#box.result)}`; }
      else { affordable = player.points >= EconomyConfig.mysteryBoxCost; text = `[E] Mystery Box — ${EconomyConfig.mysteryBoxCost}`; }
    } else if (focus.kind === 'perk') {
      const perks = this.#perks;
      const cost = focus.m.def.cost;
      affordable = player.points >= cost && (!perks || perks.count < 5);
      text = `[E] Purchase ${focus.m.def.name} — ${cost}`;
    } else {
      text = '[E] Hold to Repair';
    }
    this.#prompt({ text, affordable });
  }

  #prompt(p) {
    const key = p ? `${p.text}|${p.affordable}` : null;
    if (key === this.#lastPrompt) return;
    this.#lastPrompt = key;
    if (p) this.#events.emit('prompt:show', p);
    else this.#events.emit('prompt:hide', {});
  }

  // --- wall-buys ----------------------------------------------------------

  #buyWall(focus, player) {
    const key = focus.wb.key;
    const owns = this.#weapons.owns(key);
    const cost = owns ? Math.round(focus.wb.cost * EconomyConfig.ammoRefillFactor) : focus.wb.cost;
    if (player.points < cost) { this.#events.emit('buy:denied', {}); return; }
    player.points -= cost;
    this.#weapons.giveWeapon(key);
    this.#events.emit('score:changed', { points: player.points });
    this.#events.emit('buy:ok', { key, refilled: owns });
  }

  // --- mystery box --------------------------------------------------------

  #useBox(focus, player) {
    const box = this.#box;
    if (box.state === 'ready') {
      this.#weapons.giveWeapon(box.result);
      box.state = 'idle';
      this.#events.emit('box:idle', {});
      this.#events.emit('buy:ok', { key: box.result, box: true });
      return;
    }
    if (box.state !== 'idle') return;
    if (player.points < EconomyConfig.mysteryBoxCost) { this.#events.emit('buy:denied', {}); return; }
    player.points -= EconomyConfig.mysteryBoxCost;
    this.#events.emit('score:changed', { points: player.points });
    box.state = 'spinning';
    box.timer = EconomyConfig.boxSpinTime;
    box.cycle = 0.05;
    box.result = BOX_POOL[(Math.random() * BOX_POOL.length) | 0];
    box.display = BOX_POOL[0];
    this.#events.emit('box:spin', { key: box.display });
  }

  #tickBox(dt) {
    const box = this.#box;
    if (box.state === 'spinning') {
      box.timer -= dt;
      box.cycle -= dt;
      if (box.cycle <= 0) {
        const i = (BOX_POOL.indexOf(box.display) + 1) % BOX_POOL.length;
        box.display = BOX_POOL[i];
        this.#events.emit('box:spin', { key: box.display });
        box.cycle = 0.06 + (1 - box.timer / EconomyConfig.boxSpinTime) * 0.28; // decelerate
      }
      if (box.timer <= 0) {
        box.state = 'ready';
        box.hold = EconomyConfig.boxHoldTime;
        box.display = box.result;
        this.#events.emit('box:ready', { key: box.result, name: weaponName(box.result) });
      }
    } else if (box.state === 'ready') {
      box.hold -= dt;
      if (box.hold <= 0) { box.state = 'idle'; this.#events.emit('box:idle', {}); } // prize lost
    }

    // publish live state for the MysteryBoxSystem to animate
    const eb = this.#economy.box;
    eb.state = box.state;
    eb.displayKey = box.display;
    eb.resultKey = box.result;
    eb.spinProgress = box.state === 'spinning' ? 1 - box.timer / EconomyConfig.boxSpinTime : box.state === 'ready' ? 1 : 0;
    eb.holdProgress = box.state === 'ready' ? 1 - box.hold / EconomyConfig.boxHoldTime : 0;
  }

  // --- window repair ------------------------------------------------------

  #repair(barrier, player) {
    const pk = this.world.services.has(Service.Perks) ? this.world.services.get(Service.Perks) : null;
    const res = barrier.repair((1 / 60) * (pk ? pk.repairMul() : 1));
    if (!res.added) return;
    const pw = this.world.services.has(Service.Powerups) ? this.world.services.get(Service.Powerups) : null;
    player.points += BarrierConfig.pointsPerBoard * (pw ? pw.pointsMultiplier() : 1);
    this.#events.emit('score:changed', { points: player.points });
    this.#events.emit('barrier:changed', { id: barrier.id, boards: barrier.boards });
    if (res.closed) this.#events.emit('nav:changed', { barrier: barrier.id });
  }
}
