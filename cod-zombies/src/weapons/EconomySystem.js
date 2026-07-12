import { System } from '../ecs/System.js';
import { PlayerTag, Transform } from '../ecs/components/index.js';
import { Service } from '../core/ServiceLocator.js';
import { Action } from '../config/keybinds.js';
import { EconomyConfig, BarrierConfig } from '../config/zombies.js';
import { weaponName, weaponCost, BOX_POOL } from '../weapons/catalog.js';
import { buildWeaponModel } from '../weapons/weaponModels.js';

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
  #pap = { state: 'idle', timer: 0, hold: 0, key: null, weapon: null };
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
      if (state !== 'playing') {
        this.#box.state = 'idle'; this.#events.emit('box:idle', {});
        this.#clearPaP();
        this.#prompt(null);
      }
    });
  }

  fixedUpdate(dt) {
    if (!this.#gameState.isPlaying) return;
    this.#playerId = this.world.first(PlayerTag, Transform);
    if (this.#playerId === undefined) return;
    const player = this.world.get(this.#playerId, PlayerTag);
    const pos = this.world.get(this.#playerId, Transform).position;

    this.#tickBox(dt);
    this.#tickPaP(dt, player);

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
      else if (focus.kind === 'pap') { if (this.#isPowered) this.#usePaP(player); else this.#events.emit('buy:denied', {}); }
      else if (focus.kind === 'perk') this.#perks?.tryBuy(focus.m.id, player);
      else if (focus.kind === 'door') this.#buyDoor(focus, player);
      else if (focus.kind === 'power') this.#turnOnPower(focus);
    }
  }

  /** True on maps without a power system, else the live power state. Perks
   *  (except Quick Revive) and Pack-a-Punch stay inert until this flips on. */
  get #isPowered() { const p = this.#economy.power; return !p || p.on; }

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
    const pap = this.#economy.pap;
    if (pap) consider({ kind: 'pap', pap }, pap.position.x, pap.position.z);
    for (const b of this.#nav.barriers) {
      if (b.teardownable && b.boards < b.maxBoards) consider({ kind: 'repair', barrier: b }, b.position.x, b.position.z);
    }
    const perks = this.#perks;
    if (perks) for (const m of perks.machines()) { if (!perks.owns(m.id)) consider({ kind: 'perk', m }, m.x, m.z); }
    const door = this.#economy.door;
    if (door && !door.open) consider({ kind: 'door', door }, door.position.x, door.position.z);
    const power = this.#economy.power;
    if (power && !power.on) consider({ kind: 'power', power }, power.position.x, power.position.z);
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
    } else if (focus.kind === 'pap') {
      if (!this.#isPowered && this.#pap.state === 'idle') { text = '[E] Pack-a-Punch — Requires Power'; affordable = false; }
      else if (this.#pap.state === 'ready') { text = '[E] Take Weapon'; affordable = true; }
      else if (this.#pap.state !== 'idle') { text = '...'; affordable = true; }
      else if (this.#weapons.current?.data?.pap) { // already punched -> Re-Pack for an Alternate Ammo Type
        affordable = player.points >= EconomyConfig.papRepackCost;
        text = `[E] Re-Pack — ${EconomyConfig.papRepackCost}`;
      } else { affordable = player.points >= EconomyConfig.papCost; text = `[E] Pack-a-Punch — ${EconomyConfig.papCost}`; }
    } else if (focus.kind === 'perk') {
      const perks = this.#perks;
      const cost = focus.m.def.cost;
      // every perk but Quick Revive is dead until power (Quick Revive works pre-power, per zombies)
      if (!this.#isPowered && focus.m.id !== 'quickRevive') { text = `[E] ${focus.m.def.name} — Requires Power`; affordable = false; }
      else { affordable = player.points >= cost && (!perks || perks.count < 5); text = `[E] Purchase ${focus.m.def.name} — ${cost}`; }
    } else if (focus.kind === 'door') {
      affordable = player.points >= focus.door.cost;
      text = `[E] Open Door — ${focus.door.cost}`;
    } else if (focus.kind === 'power') {
      affordable = true;
      text = '[E] Turn On Power';
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
    this.#events.emit('purchase', { kind: owns ? 'ammo' : 'wallbuy', cost });
    this.#events.emit('buy:ok', { key, refilled: owns });
  }

  // --- power room: buyable door + power switch ----------------------------

  #buyDoor(focus, player) {
    const door = focus.door;
    if (door.open) return;
    if (player.points < door.cost) { this.#events.emit('buy:denied', {}); return; }
    player.points -= door.cost;
    this.#events.emit('score:changed', { points: player.points });
    this.#events.emit('purchase', { kind: 'door', cost: door.cost });
    this.#events.emit('door:open', {}); // PowerSystem swings it + opens the nav gate
  }

  #turnOnPower(focus) {
    if (focus.power.on) return;
    this.#events.emit('power:on', {}); // free; PowerSystem throws the switch + lights the map
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
    this.#events.emit('purchase', { kind: 'box', cost: EconomyConfig.mysteryBoxCost });
    box.state = 'spinning';
    box.timer = EconomyConfig.boxSpinTime;
    box.cycle = 0.05;
    // never roll a gun the player already owns (fall back to the full pool only
    // in the impossible case they somehow own everything in it)
    const pool = BOX_POOL.filter((k) => !this.#weapons.owns(k));
    const roll = pool.length ? pool : BOX_POOL;
    box.result = roll[(Math.random() * roll.length) | 0];
    box.display = roll[0];
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

  // --- pack-a-punch -------------------------------------------------------

  #usePaP(player) {
    const pap = this.#pap;
    if (pap.state === 'ready') {
      // grab the upgraded weapon back out of the machine
      const key = pap.key, weapon = pap.weapon;
      this.#weapons.applyPaP(weapon, key);
      this.#weapons.restoreFromPaP(weapon, key);
      this.#clearPaP();
      this.#events.emit('buy:ok', { key, pap: true });
      return;
    }
    if (pap.state !== 'idle') return;
    const w = this.#weapons.current;
    if (!w) { this.#events.emit('buy:denied', {}); return; }            // nothing in hand
    // already Pack-a-Punched: Re-Pack it for a (new) random Alternate Ammo Type
    if (w.data.pap) {
      if (player.points < EconomyConfig.papRepackCost) { this.#events.emit('buy:denied', {}); return; }
      const id = this.#weapons.repackWeapon();
      if (!id) { this.#events.emit('buy:denied', {}); return; }
      player.points -= EconomyConfig.papRepackCost;
      this.#events.emit('score:changed', { points: player.points });
      this.#events.emit('purchase', { kind: 'repack', cost: EconomyConfig.papRepackCost });
      this.#events.emit('buy:ok', { repack: true });
      return;
    }
    if (player.points < EconomyConfig.papCost) { this.#events.emit('buy:denied', {}); return; }
    // pull the gun out of the player's hands and into the machine
    const taken = this.#weapons.extractForPaP();
    if (!taken) { this.#events.emit('buy:denied', {}); return; }
    player.points -= EconomyConfig.papCost;
    this.#events.emit('score:changed', { points: player.points });
    this.#events.emit('purchase', { kind: 'pap', cost: EconomyConfig.papCost });
    pap.weapon = taken.weapon; pap.key = taken.key;
    pap.state = 'inserting'; pap.timer = EconomyConfig.papInsertTime;
    // hand the machine the REAL gun model to show going in/out
    this.#economy.pap.gunModel = buildWeaponModel(taken.weapon).group;
    this.#events.emit('pap:insert', { key: pap.key });
  }

  #clearPaP() {
    const pap = this.#pap;
    pap.state = 'idle'; pap.key = null; pap.weapon = null;
    if (this.#economy.pap) this.#economy.pap.gunModel = null;
    this.#events.emit('pap:idle', {});
  }

  #tickPaP(dt, player) {
    const pap = this.#pap;
    if (pap.state === 'inserting') {
      pap.timer -= dt;
      if (pap.timer <= 0) { pap.state = 'working'; pap.timer = EconomyConfig.papWorkTime; this.#events.emit('pap:work', {}); }
    } else if (pap.state === 'working') {
      pap.timer -= dt;
      if (pap.timer <= 0) { pap.state = 'ready'; pap.hold = EconomyConfig.papHoldTime; this.#events.emit('pap:ready', { key: pap.key }); }
    } else if (pap.state === 'ready') {
      pap.hold -= dt;
      if (pap.hold <= 0) this.#clearPaP(); // grab window missed — the gun is lost to the machine
    }

    // publish live state for the PaPSystem to animate
    const ep = this.#economy.pap;
    if (ep) {
      ep.state = pap.state;
      ep.displayKey = pap.key;
      ep.insertProgress = pap.state === 'inserting' ? 1 - pap.timer / EconomyConfig.papInsertTime : pap.state === 'idle' ? 0 : 1;
      ep.workProgress = pap.state === 'working' ? 1 - pap.timer / EconomyConfig.papWorkTime : (pap.state === 'ready' ? 1 : 0);
      ep.holdProgress = pap.state === 'ready' ? 1 - pap.hold / EconomyConfig.papHoldTime : 0;
    }
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
