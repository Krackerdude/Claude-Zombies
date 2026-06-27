import { System } from '../ecs/System.js';
import { Service } from '../core/ServiceLocator.js';

const lerp = (a, b, t) => a + (b - a) * t;
const damp = (cur, target, dt, rate) => cur + (target - cur) * Math.min(1, dt * rate);
const easeOut = (t) => 1 - (1 - t) * (1 - t);

/**
 * Visual driver for the Pack-a-Punch. Reads the live state the EconomySystem
 * publishes on economy.pap ({ state, insertProgress, workProgress, holdProgress })
 * and animates the rig from buildPaP: the gun sucked into the slot, the body
 * vibrating + the red "done" flag popping up while it works, then the upgraded
 * gun rising out for the grab window and slowly sinking back if it's missed.
 */
export class PaPSystem extends System {
  #economy; #rig; #u;
  #gunY = 0; #flag = 1.45; #roll = 0;

  init() {
    this.#economy = this.world.services.get(Service.Economy);
    this.#rig = this.#economy.pap?.rig || null;
    this.#u = this.#rig?.userData || null;
    if (this.#u) this.#gunY = this.#u.insideY;
  }

  update(dt) {
    if (!this.#rig || !this.#u) return;
    const pap = this.#economy.pap;
    const u = this.#u;
    const state = pap.state || 'idle';
    const busy = state !== 'idle';

    // gun height target per phase
    let targetY = u.insideY, showGun = busy;
    if (state === 'inserting') targetY = lerp(u.grabY * 0.8, u.insideY, easeOut(pap.insertProgress || 0)); // sucked down in
    else if (state === 'working') targetY = u.insideY;                                                      // hidden, churning
    else if (state === 'ready') targetY = lerp(u.grabY, u.insideY, easeOut(pap.holdProgress || 0));         // out, then back in
    else showGun = false;
    u.gun.visible = showGun;
    this.#gunY = damp(this.#gunY, targetY, dt, 12);
    u.gunAnchor.position.y = this.#gunY;
    this.#roll += dt * (busy ? 8 : 0);
    u.gunAnchor.rotation.y = state === 'ready' ? this.#roll * 0.3 : 0; // slow turn on display

    // body vibrate + roller whirl while working
    const working = state === 'working';
    const shudder = working ? Math.sin(this.#roll * 9) * 0.012 : 0;
    u.body.position.x = shudder;
    u.body.position.y = working ? Math.abs(Math.sin(this.#roll * 13)) * 0.01 : 0;

    // red flag: folds UP (rot.z -> 0) once it's done working, stays up through the
    // grab window, drops back when idle
    const flagUp = state === 'ready' || (working && (pap.workProgress || 0) > 0.55);
    this.#flag = damp(this.#flag, flagUp ? 0 : 1.45, dt, 10);
    u.flagPivot.rotation.z = this.#flag;

    // sign glows brighter while in use
    u.sign.material.emissiveIntensity = busy ? 1.1 : 0.5;
  }
}
