import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Service } from '../core/ServiceLocator.js';
import { LEVER_OFF, LEVER_ON } from './powerSwitch.js';

/**
 * The map power system. Owns everything gated behind the power switch:
 *   - every built practical light is dark until power is thrown (only the
 *     moon/ambient fill the map before then),
 *   - the buyable door's swing-open animation + its ethereal buy crackle,
 *   - the switch-throw animation (the gorified hand rides the lever down),
 *   - the global `power.on` flag other systems read (perks, PaP) + a
 *     `power:changed` event they react to.
 *
 * Reads its handles off the shared economy object (door, power, poweredLights),
 * so it stays decoupled from how the scene was built. Resets to unpowered on a
 * fresh run.
 */
const DOOR_TIME = 0.7;    // seconds for the door to swing open
const DOOR_ANGLE = Math.PI * 0.52; // ~94° — swings clear into the room
const SWITCH_TIME = 0.5;  // lever throw
const FLASH_TIME = 0.7;   // door-buy crackle

const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };
const smooth = (t) => t * t * (3 - 2 * t);

export class PowerSystem extends System {
  #events; #economy; #physics; #scene;
  #door; #power; #lights = [];
  #doorAnim = -1; #switchAnim = -1; #flashT = 0; #needleT = 1;
  #flash = null;
  #blockDesc = null; // to recreate the door's player-block on reset

  init() {
    this.#events = this.world.services.get(Service.Events);
    this.#economy = this.world.services.get(Service.Economy);
    this.#physics = this.world.services.get(Service.Physics);
    this.#scene = this.world.services.get(Service.Scene).scene;
    this.#door = this.#economy.door;
    this.#power = this.#economy.power;
    this.#lights = this.#economy.poweredLights || [];
    // remember the door block's shape so a fresh run can re-seal it
    this.#blockDesc = { x: this.#door.position.x, z: this.#door.position.z };

    // ethereal blue crackle light for the door buy. It stays a PERMANENT scene
    // light (intensity 0 until the buy) so the scene's light count never changes
    // — flipping .visible would recompile every material and freeze on purchase.
    this.#flash = new THREE.PointLight(0x9fe0ff, 0, 9, 2);
    this.#flash.position.set(this.#door.position.x, 1.5, this.#door.position.z);
    this.#scene.add(this.#flash);

    this.#applyLights(false); // start dark

    this.#events.on('door:open', () => this.#openDoor());
    this.#events.on('power:on', () => this.#throwSwitch());
    this.#events.on('state:change', ({ state } = {}) => { if (state === 'playing') this.#reset(); });
  }

  /** Read by EconomySystem / PerkSystem / PaPSystem to gate their machines. */
  get isPowered() { return this.#power.on; }

  // Gate the map practicals by INTENSITY, never by .visible — every powered light
  // stays a permanent scene contributor so the light count (and thus compiled
  // shader set) is fixed. Flicker lights + dust cones are driven by
  // AtmosphereSystem, which reads the same `powerOn` flag; non-flicker lights we
  // scale here directly.
  #applyLights(on) {
    for (const l of this.#lights) {
      if (!l) continue;
      l.userData.powerOn = on;
      if (l.isLight) l.intensity = on ? (l.userData.baseIntensity ?? l.intensity) : 0;
    }
  }

  #openDoor() {
    if (this.#door.open) return;
    this.#door.open = true;
    this.#door.barrier.boards = 0;                 // nav gate opens (zombies can follow you in)
    if (this.#door.block) { this.#physics.removeBody(this.#door.block); this.#door.block = null; }
    this.#doorAnim = 0;
    this.#flashT = FLASH_TIME; // the permanent flash light pulses up via intensity
    this.#events.emit('nav:changed', { barrier: 'door_s' });
  }

  #throwSwitch() {
    if (this.#power.on || this.#switchAnim >= 0) return;
    this.#switchAnim = 0;
  }

  #powerOn() {
    this.#power.on = true;
    this.#applyLights(true);
    const u = this.#power.rig?.userData || {};
    for (const m of u.gaugeMats || []) m.emissiveIntensity = 0.9; // gauge faces light
    this.#needleT = 0;                                            // needles swing to "live"
    this.#events.emit('power:changed', { on: true });
  }

  /** Fresh run: re-seal + de-power everything (the arena persists across runs). */
  #reset() {
    if (!this.#door.open && !this.#power.on) return; // already fresh
    // door
    this.#door.open = false;
    this.#door.pivot.rotation.y = 0;
    this.#door.barrier.boards = this.#door.barrier.maxBoards || 1;
    if (!this.#door.block) {
      this.#door.block = this.#physics.createStaticBox({ x: this.#blockDesc.x, y: 1.4, z: this.#blockDesc.z }, { x: 1, y: 1.4, z: 0.5 });
    }
    this.#doorAnim = -1; this.#flashT = 0; this.#flash.intensity = 0;
    // power
    this.#power.on = false;
    this.#switchAnim = -1;
    if (this.#power.rig) {
      this.#power.rig.userData.lever.rotation.z = LEVER_OFF;
      for (const m of this.#power.rig.userData.gaugeMats || []) m.emissiveIntensity = 0;
      for (const n of this.#power.rig.userData.needles || []) n.rotation.x = 0.9;
    }
    this.#needleT = 1;
    this.#applyLights(false);
    this.#events.emit('power:changed', { on: false });
    this.#events.emit('nav:changed', { barrier: 'door_s' });
  }

  update(dt) {
    // (No per-frame light re-assert needed: AtmosphereSystem reads the same
    // `powerOn` flag we set in #applyLights, so the cones/flicker stay gated.)

    // door swing (into the room, with a little overshoot)
    if (this.#doorAnim >= 0) {
      this.#doorAnim = Math.min(1, this.#doorAnim + dt / DOOR_TIME);
      this.#door.pivot.rotation.y = easeOutBack(this.#doorAnim) * DOOR_ANGLE;
      if (this.#doorAnim >= 1) this.#doorAnim = -1;
    }
    // door-buy crackle: bright cyan flicker that fades out
    if (this.#flashT > 0) {
      this.#flashT -= dt;
      const k = Math.max(0, this.#flashT / FLASH_TIME);
      this.#flash.intensity = k * 7 * (0.55 + Math.random() * 0.45);
      if (this.#flashT <= 0) this.#flash.intensity = 0; // stays a permanent (0-intensity) light
    }
    // switch throw: the red lever (and the hand) swing down
    if (this.#switchAnim >= 0) {
      this.#switchAnim = Math.min(1, this.#switchAnim + dt / SWITCH_TIME);
      this.#power.rig.userData.lever.rotation.z = LEVER_OFF + (LEVER_ON - LEVER_OFF) * smooth(this.#switchAnim); // out/off → up/on
      if (this.#switchAnim >= 1) { this.#switchAnim = -1; this.#powerOn(); }
    }
    // gauge needles ease up to a live reading once powered
    if (this.#power.on && this.#needleT < 1) {
      this.#needleT = Math.min(1, this.#needleT + dt / 1.2);
      for (const n of this.#power.rig.userData.needles || []) n.rotation.x = 0.9 - this.#needleT * 1.55;
    }
  }
}
