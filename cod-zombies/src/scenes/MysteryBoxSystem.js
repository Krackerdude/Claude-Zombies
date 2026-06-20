import { System } from '../ecs/System.js';
import { Service } from '../core/ServiceLocator.js';

const lerp = (a, b, t) => a + (b - a) * t;
const damp = (cur, target, dt, rate) => cur + (target - cur) * Math.min(1, dt * rate);
const easeOut = (t) => 1 - (1 - t) * (1 - t);

/**
 * Visual driver for the mystery box. Reads the live box state the EconomySystem
 * publishes on economy.box ({ state, spinProgress, holdProgress, displayKey,
 * resultKey }) and animates the rig built by buildMysteryBox: lid flip, the
 * spinning weapon rising to eye level then lowering back over the hold window,
 * the blue aura + light, and a billboarded [E] prompt. No game state is touched.
 */
export class MysteryBoxSystem extends System {
  #gameState;
  #economy;
  #camera;
  #rig;
  #u; // rig.userData
  #gunY = 0;
  #spin = 0;
  #aura = 0;
  #pulse = 0;

  init() {
    this.#gameState = this.world.services.get(Service.GameState);
    this.#economy = this.world.services.get(Service.Economy);
    this.#camera = this.world.services.get(Service.Render).camera;
    this.#rig = this.#economy.box?.rig || null;
    this.#u = this.#rig?.userData || null;
    if (this.#u) this.#gunY = this.#u.topY;
  }

  update(dt) {
    if (!this.#rig || !this.#u) return;
    const box = this.#economy.box;
    const u = this.#u;
    const state = box.state || 'idle';
    const inUse = state === 'spinning' || state === 'ready';
    const topY = u.topY;
    const eyeY = topY + 1.15; // weapon rides up to ~player eye level

    // lid flips open while in use
    const targetLid = inUse ? Math.PI * 0.72 : 0;
    u.lidAngle = damp(u.lidAngle, targetLid, dt, 7);
    u.lidPivot.rotation.x = -u.lidAngle;

    // aura + light ramp with use; gentle pulse on top
    this.#pulse += dt * 3;
    const pulse = 0.85 + Math.sin(this.#pulse) * 0.15;
    this.#aura = damp(this.#aura, inUse ? 1 : 0, dt, 5);
    u.light.intensity = this.#aura * 2.6 * pulse;
    for (const child of u.aura.children) child.material.opacity = this.#aura * (child.rotation.x ? 0.5 : 0.6) * pulse;
    const qGlow = 0.6 + this.#aura * 0.4 * pulse;
    for (const q of u.qMarks) q.material.opacity = qGlow;

    // weapon height: rise during the spin, settle, then lower across the hold
    let targetY = topY - 0.3; // tucked inside when idle
    if (state === 'spinning') targetY = lerp(topY, eyeY, easeOut(box.spinProgress || 0));
    else if (state === 'ready') targetY = lerp(eyeY, topY + 0.15, easeOut(box.holdProgress || 0));
    this.#gunY = damp(this.#gunY, targetY, dt, state === 'idle' ? 8 : 12);
    u.gunAnchor.position.y = this.#gunY;

    // spin speed: fast during the cycle, easing to a slow idle turn once landed
    const spinSpeed = state === 'spinning' ? 9 - (box.spinProgress || 0) * 5 : inUse ? 1.2 : 0;
    this.#spin += dt * spinSpeed;
    u.gunAnchor.rotation.y = this.#spin;

    // show only the current weapon model
    const showKey = inUse ? box.displayKey : null;
    for (const [key, model] of u.models) model.visible = inUse && key === showKey;

    // billboard + pulse the [E] prompt during the grab window
    const showPrompt = state === 'ready';
    u.prompt.visible = showPrompt;
    if (showPrompt) {
      u.prompt.lookAt(this.#camera.position);
      const s = 0.95 + Math.sin(this.#pulse * 1.4) * 0.08;
      u.prompt.scale.setScalar(s);
    }
  }
}
