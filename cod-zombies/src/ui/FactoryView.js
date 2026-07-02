import * as THREE from 'three';
import { buildFactory } from '../factory/factoryModel.js';
import { buildgumballModel } from '../gobblegums/gumballModel.js';
import { RARITIES } from '../gobblegums/gobblegums.js';

/**
 * The live 3D view for Dr. Newton's Factory. Owns its own renderer / scene /
 * camera (alpha, composited over the menu chrome). Renders the factory set,
 * animates the machinery, raycasts the three wager buttons for hover/click, and
 * plays the full reward-reveal sequence: won gums rise from below into the glass
 * transport tube, hover there with 2D nameplates, then fly into the vat they came
 * from while its window flashes.
 *
 * Interaction contract: `onWager(wager)` is called when a button is confirmed and
 * must return the already-resolved roll result (spent + granted by the caller) or
 * null if the player can't afford it (the view then plays a denial buzz).
 */
export class FactoryView {
  #renderer = null; #scene; #camera; #factory; #canvas; #overlay = null;
  #raf = 0; #running = false; #last = 0; #t = 0;
  #ray = new THREE.Raycaster(); #ptr = new THREE.Vector2(-2, -2);
  #hover = -1; #busy = false;
  #tweens = []; #sched = []; #plates = []; #balls = [];
  #onWager; #onBusy; #onBanner;

  constructor({ onWager, onBusy = null, onBanner = null } = {}) {
    this.#onWager = onWager; this.#onBusy = onBusy; this.#onBanner = onBanner;
    this.#init();
  }

  get ok() { return !!this.#renderer; }

  #init() {
    try {
      this.#renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch { this.#renderer = null; return; }
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.#canvas = this.#renderer.domElement;
    this.#canvas.className = 'fx-factory-canvas';

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x3a6a92, 0.03); // pale-blue hall haze
    const cam = new THREE.PerspectiveCamera(46, 1.7, 0.05, 120);
    cam.position.set(-0.2, 0.6, 6.2);
    cam.lookAt(0.6, -0.05, -0.5);

    // warm factory rig + a cool cyan kick from the transport tube
    scene.add(new THREE.HemisphereLight(0xdcecff, 0x241c14, 0.7));
    scene.add(new THREE.AmbientLight(0xbfd0e0, 0.35));
    const key = new THREE.DirectionalLight(0xffe6c2, 1.9); key.position.set(3, 5, 6); scene.add(key);
    const fill = new THREE.DirectionalLight(0x8fb4ff, 0.7); fill.position.set(-5, 1, 4); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffca88, 1.0); rim.position.set(-2, 4, -6); scene.add(rim);
    const front = new THREE.DirectionalLight(0xfff2e0, 0.6); front.position.set(0, 1.5, 8); scene.add(front); // camera-side fill
    const tubeGlow = new THREE.PointLight(0x8fdcff, 1.1, 9); tubeGlow.position.set(3.55, 1.2, 1); scene.add(tubeGlow);

    const factory = buildFactory();
    scene.add(factory);

    this.#scene = scene; this.#camera = cam; this.#factory = factory;

    this.#canvas.addEventListener('pointermove', (e) => this.#onPointerMove(e));
    this.#canvas.addEventListener('pointerdown', () => { if (this.#hover >= 0) this.confirm(this.#hover + 1); });
  }

  mount(container, overlay) {
    if (!this.#canvas) return;
    container.appendChild(this.#canvas);
    this.#overlay = overlay || container;
    this.resize();
  }

  resize() {
    if (!this.#renderer || !this.#canvas) return;
    const p = this.#canvas.parentElement; if (!p) return;
    const w = Math.max(1, p.clientWidth), h = Math.max(1, p.clientHeight);
    this.#renderer.setSize(w, h, false);
    this.#camera.aspect = w / h; this.#camera.updateProjectionMatrix();
  }

  // --- interaction --------------------------------------------------------

  #onPointerMove(e) {
    const r = this.#canvas.getBoundingClientRect();
    this.#ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  /** Keyboard/gamepad selection (0-based) from the menu. */
  setHover(i) { this.#hover = Math.max(-1, Math.min(2, i)); }
  get hover() { return this.#hover; }

  /** Confirm a wager (1..3). Runs the reveal if the caller reports it as paid. */
  confirm(wager) {
    if (this.#busy || !this.#factory) return;
    const btn = this.#factory.userData.buttons[wager - 1];
    if (!btn) return;
    const result = this.#onWager?.(wager);
    if (!result) { this.#denyPress(btn); return; }  // couldn't afford
    this.#busy = true; this.#onBusy?.(true);
    this.#pressButton(btn);
    this.#runReveal(result);
  }

  #pressButton(btn) {
    // depress the DOME within its housing (restY is the dome's LOCAL y), not the
    // whole button group — moving the group launched it up to the vat.
    this.#addTween({ dur: 0.09, apply: (p) => { btn.mesh.position.y = btn.restY - 0.06 * p; } });
    this.#after(0.09, () => this.#addTween({ dur: 0.18, ease: easeOut, apply: (p) => { btn.mesh.position.y = btn.restY - 0.06 * (1 - p); } }));
    this.#flash(btn.glowMat, 0.85, 2.6, 0.4);
  }

  #denyPress(btn) {
    // three quick red-ish flickers to say "no"
    for (let i = 0; i < 3; i++) this.#after(i * 0.12, () => this.#flash(btn.glowMat, 0.85, 0.2, 0.1));
    this.#onBanner?.({ kind: 'deny', text: 'Not enough Liquid Divinium' });
  }

  // --- reward reveal ------------------------------------------------------

  #runReveal(result) {
    const vats = this.#factory.userData.vats;
    const tube = this.#factory.userData.tube;
    const rewards = result.rewards;
    const slotGap = 0.8;
    const topSlot = tube.topY - 0.7;

    rewards.forEach((rw, i) => {
      const start = i * 0.32;                          // stagger the pulls
      const originVat = vats[rw.vat] ?? vats[0];
      const ball = buildgumballModel(rw.gum.act, { radius: 0.34 });
      const core = ball.children[0];
      if (core?.material) { core.material.emissiveIntensity = 0.6; } // read boldly in the tube
      // all rewards are SUCKED UP from the tube's funnel base, regardless of vat
      const bottom = new THREE.Vector3(tube.world.x, tube.botY + 0.25, 0);
      ball.position.copy(bottom);
      ball.scale.setScalar(0.3);
      ball.userData.spin = 1.0 + Math.random() * 0.6;
      this.#scene.add(ball);
      this.#balls.push(ball);

      const slot = new THREE.Vector3(tube.world.x, topSlot - i * slotGap, 0);
      // 1) suck up the tube to the hover slot (grow as it enters)
      this.#after(start, () => {
        this.#flash(originVat.windowMat, originVat.base, originVat.base + 1.2, 0.4);
        this.#addTween({
          dur: 0.85, ease: easeOut,
          apply: (p) => { ball.position.lerpVectors(bottom, slot, p); ball.scale.setScalar(0.3 + 0.7 * Math.min(1, p * 1.4)); },
        });
      });
      // nameplate fades in once it's hovering
      this.#after(start + 0.95, () => this.#spawnPlate(ball, rw));
    });

    // modifier banners
    if (result.powerBooster) this.#after(1.0, () => this.#onBanner?.({ kind: 'boost', text: 'POWER BOOSTER — every vat pays out!' }));
    if (result.doubles > 0) this.#after(1.2, () => this.#onBanner?.({ kind: 'double', text: `DOUBLE REWARDS ×${result.multiplier}` }));

    // 2) after the showcase hold, each gum flies LEFT into its origin vat window
    const holdEnd = rewards.length * 0.35 + 2.6;
    rewards.forEach((rw, i) => {
      const originVat = vats[rw.vat] ?? vats[0];
      this.#after(holdEnd + i * 0.22, () => {
        const ball = this.#balls[i]; if (!ball) return;
        this.#removePlate(ball);
        const from = ball.position.clone();
        const to = originVat.world.clone();
        const arcUp = Math.max(from.y, to.y) + 0.4;
        this.#addTween({
          dur: 0.7, ease: easeInOut,
          apply: (p) => {
            ball.position.lerpVectors(from, to, p);
            ball.position.y += Math.sin(p * Math.PI) * (arcUp - Math.max(from.y, to.y)); // slight arc over
            ball.scale.setScalar(1 - 0.68 * p);
          },
          onDone: () => {
            this.#flash(originVat.windowMat, originVat.base, originVat.base + 2.4, 0.7);
            this.#scene.remove(ball); ball.userData.dispose?.();
            this.#balls[i] = null;
          },
        });
      });
    });

    // release the console
    this.#after(holdEnd + rewards.length * 0.22 + 1.0, () => { this.#busy = false; this.#onBusy?.(false); this.#balls.length = 0; });
  }

  #spawnPlate(ball, rw) {
    if (!this.#overlay) return;
    const rcol = RARITIES.find((r) => r.id === rw.gum.rarity)?.color ?? '#ffb347';
    const el = document.createElement('div');
    el.className = 'fx-plate';
    el.style.setProperty('--rcol', rcol);
    el.innerHTML = `<span class="fx-plate-name">${rw.gum.name}</span>${rw.count > 1 ? `<span class="fx-plate-x">×${rw.count}</span>` : ''}`;
    this.#overlay.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    this.#plates.push({ el, ball });
  }

  #removePlate(ball) {
    const idx = this.#plates.findIndex((p) => p.ball === ball);
    if (idx < 0) return;
    const { el } = this.#plates[idx];
    el.classList.remove('show');
    this.#after(0.3, () => el.remove());
    this.#plates.splice(idx, 1);
  }

  #updatePlates() {
    if (!this.#plates.length) return;
    const r = this.#canvas.getBoundingClientRect();
    for (const p of this.#plates) {
      const v = p.ball.position.clone().project(this.#camera);
      const x = (v.x * 0.5 + 0.5) * r.width;
      const y = (-v.y * 0.5 + 0.5) * r.height;
      // anchor the plate's right edge just left of the gum so it never covers it
      p.el.style.transform = `translate(${(x - 30).toFixed(1)}px, ${y.toFixed(1)}px) translate(-100%, -50%)`;
    }
  }

  // --- tiny tween/timer runner -------------------------------------------

  #addTween(t) { t.start = this.#t; t.ease = t.ease || linear; this.#tweens.push(t); }
  // schedule on the render clock (not wall-clock) so the choreography stays in
  // step with the tweens even if the frame-rate dips.
  #after(sec, fn) { this.#sched.push({ at: this.#t + sec, fn }); }
  #stepSched() {
    for (let i = this.#sched.length - 1; i >= 0; i--) {
      if (this.#t >= this.#sched[i].at) { const fn = this.#sched[i].fn; this.#sched.splice(i, 1); fn(); }
    }
  }
  #flash(mat, base, peak, dur) {
    this.#addTween({ dur, apply: (p) => { mat.emissiveIntensity = peak + (base - peak) * p; }, onDone: () => { mat.emissiveIntensity = base; } });
  }

  #stepTweens(dt) {
    for (let i = this.#tweens.length - 1; i >= 0; i--) {
      const tw = this.#tweens[i];
      const p = Math.min(1, (this.#t - tw.start) / tw.dur);
      tw.apply(tw.ease(p));
      if (p >= 1) { tw.onDone?.(); this.#tweens.splice(i, 1); }
    }
  }

  // --- loop ---------------------------------------------------------------

  start() {
    if (!this.#renderer || this.#running) return;
    this.resize();
    this.#running = true; this.#last = performance.now();
    const loop = (now) => {
      if (!this.#running) return;
      const dt = Math.max(0, Math.min(0.05, (now - this.#last) / 1000)); this.#last = now; this.#t += dt;
      const ud = this.#factory.userData;

      for (const s of ud.spin) s.mesh.rotation.z += s.speed * dt;
      ud.tube.beamMats.forEach((b, k) => { b.opacity = (0.2 + k * 0.08) * (0.7 + 0.3 * Math.sin(this.#t * 3 + k)); });
      // vats "whir" — the brew glow breathes (flash tweens override during a pull)
      if (!this.#busy) ud.vats.forEach((vt, i) => { vt.windowMat.emissiveIntensity = vt.base + 0.28 * Math.sin(this.#t * 1.8 + i * 1.3); });
      for (const st of ud.steam) { st.mesh.position.y = st.base.y + Math.sin(this.#t * 0.3 + st.phase) * 0.25; st.mesh.material.opacity = 0.04 + 0.03 * (0.5 + 0.5 * Math.sin(this.#t * 0.5 + st.phase)); }
      for (const ball of this.#balls) if (ball) ball.rotation.y += (ball.userData.spin || 1) * dt;
      // perk bottles ride the conveyor and loop
      if (ud.conveyor) { const cv = ud.conveyor; for (const bt of cv.bottles) { const u = (bt.u0 + this.#t * cv.speed) % 1; bt.mesh.position.lerpVectors(cv.a, cv.b, u); bt.mesh.rotation.y = this.#t * 0.6; } }

      // hover raycast (only when idle)
      if (!this.#busy) this.#updateHover();
      this.#applyHover(dt);

      this.#stepSched();
      this.#stepTweens(dt);
      this.#updatePlates();

      // slow parallax sway of the camera
      this.#camera.position.x = -0.2 + Math.sin(this.#t * 0.18) * 0.22;
      this.#camera.position.y = 0.6 + Math.sin(this.#t * 0.13) * 0.06;
      this.#camera.lookAt(0.6, -0.05, -0.5);

      this.#renderer.render(this.#scene, this.#camera);
      this.#raf = requestAnimationFrame(loop);
    };
    this.#raf = requestAnimationFrame(loop);
  }

  #updateHover() {
    this.#ray.setFromCamera(this.#ptr, this.#camera);
    const domes = this.#factory.userData.buttons.map((b) => b.mesh);
    const hit = this.#ray.intersectObjects(domes, false)[0];
    this.#hover = hit ? domes.indexOf(hit.object) : -1;
    if (this.#canvas) this.#canvas.style.cursor = this.#hover >= 0 ? 'pointer' : 'default';
  }

  #applyHover(dt) {
    this.#factory.userData.buttons.forEach((b, i) => {
      const on = i === this.#hover && !this.#busy;
      const target = on ? 1.12 : 1.0;
      b.mesh.scale.setScalar(b.mesh.scale.x + (target - b.mesh.scale.x) * Math.min(1, dt * 12));
      // ease the idle glow toward its hover/rest level; active flash tweens run
      // AFTER this in stepTweens and override the material, so they win.
      const want = on ? 1.5 : 0.85;
      b.glowMat.emissiveIntensity += (want - b.glowMat.emissiveIntensity) * Math.min(1, dt * 8);
    });
  }

  stop() {
    this.#running = false;
    if (this.#raf) cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    this.#sched.length = 0; this.#tweens.length = 0;
    for (const p of this.#plates) p.el.remove();
    this.#plates.length = 0;
    for (const b of this.#balls) if (b) { this.#scene.remove(b); b.userData.dispose?.(); }
    this.#balls.length = 0;
    this.#busy = false;
  }
}

const linear = (p) => p;
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const easeIn = (p) => p * p * p;
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
