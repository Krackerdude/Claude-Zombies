import { System } from '../ecs/System.js';
import { Service } from '../core/ServiceLocator.js';

const lerp = (a, b, t) => a + (b - a) * t;
const damp = (cur, target, dt, rate) => cur + (target - cur) * Math.min(1, dt * rate);
const easeOut = (t) => 1 - (1 - t) * (1 - t);

/**
 * Visual driver for the Pack-a-Punch. Reads economy.pap ({ state, insert/work/
 * holdProgress, gunModel }) and animates the rig from buildPaP: the player's
 * ACTUAL gun model is mounted in the machine's mouth and slid IN (sucked behind
 * the rollers), the body vibrates with the red flag popping up while it works,
 * then the upgraded gun is pushed forward OUT the entrance for the grab window
 * and slowly sinks back in if it's missed. Motion is along Z (in/out), not up.
 */
export class PaPSystem extends System {
  #economy; #rig; #u;
  #gunZ = 0; #flag = 1.45; #roll = 0; #mounted = null;

  init() {
    this.#economy = this.world.services.get(Service.Economy);
    this.#rig = this.#economy.pap?.rig || null;
    this.#u = this.#rig?.userData || null;
    if (this.#u) this.#gunZ = this.#u.inZ;
  }

  update(dt) {
    if (!this.#rig || !this.#u) return;
    const pap = this.#economy.pap;
    const u = this.#u;
    const state = pap.state || 'idle';
    const busy = state !== 'idle';

    // mount / unmount the live gun model as the machine takes / releases it.
    // NOTE: we only detach — buildWeaponModel shares cached materials/geometry, so
    // disposing here would corrupt other guns. The detached group is GC'd.
    if (pap.gunModel !== this.#mounted) {
      if (this.#mounted) u.gunAnchor.remove(this.#mounted);
      this.#mounted = pap.gunModel || null;
      if (this.#mounted) {
        this.#mounted.rotation.set(0, Math.PI, 0); // barrel faces out the entrance
        this.#mounted.scale.setScalar(1.25);
        this.#mounted.position.set(0, 0, 0);
        u.gunAnchor.add(this.#mounted);
      }
    }

    // gun slides along Z: outZ = pushed out the entrance, inZ = sucked deep inside
    let targetZ = u.inZ;
    if (state === 'inserting') targetZ = lerp(u.outZ, u.inZ, easeOut(pap.insertProgress || 0)); // your gun sliding in
    else if (state === 'working') targetZ = u.inZ;
    else if (state === 'ready') targetZ = lerp(u.outZ, u.inZ, easeOut(pap.holdProgress || 0));   // pushed out, then sinks back
    this.#gunZ = damp(this.#gunZ, targetZ, dt, 12);
    u.gunAnchor.position.z = this.#gunZ;
    if (this.#mounted) this.#mounted.visible = busy;

    // rollers churn + body vibrates while it works
    this.#roll += dt * (busy ? 9 : 0.6);
    const working = state === 'working';
    for (const r of u.rollers) r.rotation.y = this.#roll * (r.userData.dir || 1);
    const shudder = working ? Math.sin(this.#roll * 7) * 0.012 : 0;
    u.body.position.x = shudder;
    u.body.position.y = working ? Math.abs(Math.sin(this.#roll * 10)) * 0.01 : 0;

    // red "done" flag folds up near the end of the work cycle, drops when idle
    const flagUp = state === 'ready' || (working && (pap.workProgress || 0) > 0.55);
    this.#flag = damp(this.#flag, flagUp ? 0 : 1.45, dt, 10);
    u.flagPivot.rotation.z = this.#flag;

    // inner glow + sign pulse while in use
    if (u.glow) u.glow.material.emissiveIntensity = (busy ? 1.6 : 0.7) * (0.85 + Math.sin(this.#roll * 1.5) * 0.15);
    u.sign.material.emissiveIntensity = busy ? 1.1 : 0.5;
  }
}
