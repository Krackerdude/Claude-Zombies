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
  #shakes = []; #teslas = []; #reels = []; #auras = [];
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
    // filmic tone-map + sRGB output for a moodier, less "flat/cartoony" look
    this.#renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 1.05;
    this.#renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.#canvas = this.#renderer.domElement;
    this.#canvas.className = 'fx-factory-canvas';

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x14303f, 0.05); // deep, cool haze that swallows the back of the hall
    const cam = new THREE.PerspectiveCamera(46, 1.7, 0.05, 120);
    cam.position.set(-0.2, 0.6, 6.2);
    cam.lookAt(0.6, -0.05, -0.5);

    // Moody rig: a dim cool ambient, a warm key + rim on the hero vats, and let
    // the vats' own emissive glow + the transport tube carry the scene. The
    // background falls into shadow so the machinery reads as silhouettes.
    scene.add(new THREE.HemisphereLight(0x9fc0dc, 0x1a1410, 0.28));
    scene.add(new THREE.AmbientLight(0x8fa8bd, 0.12));
    const key = new THREE.DirectionalLight(0xffe0b0, 1.55); key.position.set(2.5, 4.5, 6); scene.add(key);
    const fill = new THREE.DirectionalLight(0x6f9cff, 0.28); fill.position.set(-5, 1, 4); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffbe7a, 0.7); rim.position.set(-2, 4, -6); scene.add(rim);
    const front = new THREE.SpotLight(0xfff0dc, 0.9, 12, Math.PI / 5, 0.5); front.position.set(0, 1.2, 8); front.target.position.set(0.2, -0.2, 0); scene.add(front); scene.add(front.target);
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
  // Sequence: press → the hit machine(s) SHAKE + tesla-crackle + slot-spin (all
  // at once) → land on the result which hovers in its rarity aura with a nameplate
  // on the machine's plating → linger ~2s → the gum flies to the tube for a last
  // glance → shoots down the tube and off-screen.

  #runReveal(result) {
    const vats = this.#factory.userData.vats;
    const tube = this.#factory.userData.tube;
    const rewards = result.rewards;
    const SPIN = 1.6, LINGER = 2.0, TRANSIT = 0.7, LAST = 0.8, SHOOT = 0.6;
    const landed = [];

    rewards.forEach((rw, i) => {
      const vat = vats[rw.vat] ?? vats[0];
      // Phase A — shake + tesla + slot reel, simultaneously
      this.#startShake(vat, SPIN);
      this.#startTesla(vat, SPIN);
      this.#startReel(vat, SPIN);
      this.#addTween({ dur: 0.35, apply: (p) => { vat.light.intensity = 0.3 + 1.1 * p; } });

      // Phase B — land on the result gum
      this.#after(SPIN, () => {
        this.#stopReel(vat);
        const gum = buildgumballModel(rw.gum.act, { radius: 0.16 });
        const core = gum.children[0]; if (core?.material) core.material.emissiveIntensity = 0.75;
        gum.position.copy(vat.chamberLocal); gum.userData.spin = 1.3;
        vat.group.add(gum); this.#balls.push(gum);
        landed[i] = { vat, gum };
        this.#spawnAura(vat, rw.gum.rarity);
        vat.light.color.set(rarityHex(rw.gum.rarity)); vat.light.intensity = 1.5;
        this.#flash(vat.coilMat, 0.5, 3.2, 0.6);
        this.#spawnPlate(vat, rw);
      });
    });

    if (result.powerBooster) this.#after(SPIN + 0.4, () => this.#onBanner?.({ kind: 'boost', text: 'POWER BOOSTER — every vat pays out!' }));
    if (result.doubles > 0) this.#after(SPIN + 0.7, () => this.#onBanner?.({ kind: 'double', text: `DOUBLE REWARDS ×${result.multiplier}` }));

    // Phase C→E — after the linger, each gum flies to the tube (staggered), takes
    // one last glance, then shoots down and off-screen.
    const transitStart = SPIN + LINGER;
    rewards.forEach((rw, i) => {
      this.#after(transitStart + i * (TRANSIT + 0.4), () => {
        const L = landed[i]; if (!L) return;
        const { vat, gum } = L;
        this.#removePlate(vat);
        this.#clearAura(vat);
        vat.light.intensity = 0.3; vat.light.color.set(vat.tint);
        this.#scene.attach(gum); // world-space now
        const from = gum.position.clone();
        const entry = new THREE.Vector3(tube.world.x, tube.entryY, 0);
        this.#addTween({ dur: TRANSIT, ease: easeInOut, apply: (p) => { gum.position.lerpVectors(from, entry, p); gum.position.y += Math.sin(p * Math.PI) * 0.5; } });
        // last glance, then shoot straight down the tube and out of frame
        this.#after(TRANSIT + LAST, () => {
          const s = gum.position.clone();
          const exit = new THREE.Vector3(tube.world.x, tube.botY, 0);
          this.#addTween({ dur: SHOOT, ease: easeIn, apply: (p) => gum.position.lerpVectors(s, exit, p),
            onDone: () => { this.#scene.remove(gum); gum.userData.dispose?.(); const bi = this.#balls.indexOf(gum); if (bi >= 0) this.#balls[bi] = null; } });
        });
      });
    });

    const total = transitStart + (rewards.length - 1) * (TRANSIT + 0.4) + TRANSIT + LAST + SHOOT + 0.4;
    this.#after(total, () => { this.#busy = false; this.#onBusy?.(false); this.#balls = this.#balls.filter(Boolean); });
  }

  // --- reveal FX ----------------------------------------------------------

  #startShake(vat, dur) { this.#shakes.push({ vat, until: this.#t + dur }); }

  #startTesla(vat, dur) {
    const grp = new THREE.Group(); grp.position.copy(vat.coilLocal);
    const mat = new THREE.LineBasicMaterial({ color: 0xbfe4ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const lines = [];
    for (let k = 0; k < 3; k++) { const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]); const ln = new THREE.Line(geo, mat); grp.add(ln); lines.push(ln); }
    vat.group.add(grp);
    this.#teslas.push({ vat, grp, mat, lines, until: this.#t + dur });
  }

  #startReel(vat, dur) {
    const acts = ['round', 'time', 'player', 'trigger', 'whimsy'];
    const gums = [];
    for (let k = 0; k < 5; k++) {
      const gm = buildgumballModel(acts[(Math.random() * acts.length) | 0], { radius: 0.15 });
      const y0 = vat.chamberLocal.y + (k - 2) * 0.34;
      gm.position.set(vat.chamberLocal.x, y0, vat.chamberLocal.z);
      vat.group.add(gm); gums.push({ mesh: gm, y: y0 });
    }
    this.#reels.push({ vat, gums, cy: vat.chamberLocal.y, until: this.#t + dur });
  }

  #stopReel(vat) {
    const idx = this.#reels.findIndex((r) => r.vat === vat);
    if (idx < 0) return;
    for (const { mesh } of this.#reels[idx].gums) { vat.group.remove(mesh); mesh.userData.dispose?.(); }
    this.#reels.splice(idx, 1);
  }

  #spawnAura(vat, rarity) {
    const geo = new THREE.SphereGeometry(0.26, 20, 16);
    const mat = new THREE.MeshBasicMaterial({ color: rarityHex(rarity), transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat); mesh.position.copy(vat.chamberLocal);
    vat.group.add(mesh);
    this.#auras.push({ vat, mesh, geo, mat, phase: Math.random() * 6.28 });
  }

  #clearAura(vat) {
    for (let i = this.#auras.length - 1; i >= 0; i--) {
      if (this.#auras[i].vat !== vat) continue;
      const a = this.#auras[i]; vat.group.remove(a.mesh); a.geo.dispose(); a.mat.dispose();
      this.#auras.splice(i, 1);
    }
  }

  #isShaking(vat) { return this.#shakes.some((s) => s.vat === vat); }

  #stepRevealFx(dt) {
    const t = this.#t;
    // machine shake (centrifuge)
    for (let i = this.#shakes.length - 1; i >= 0; i--) {
      const s = this.#shakes[i], vat = s.vat;
      if (t >= s.until) { vat.group.position.set(vat.baseX, 0, 0); vat.group.rotation.z = 0; this.#shakes.splice(i, 1); continue; }
      const a = 0.03;
      vat.group.position.set(vat.baseX + Math.sin(t * 62) * a + (Math.random() - 0.5) * a * 0.5, Math.sin(t * 71) * a * 0.5, Math.sin(t * 54) * a * 0.4);
      vat.group.rotation.z = Math.sin(t * 48) * 0.013;
    }
    // tesla bolts crackling off the coil
    for (let i = this.#teslas.length - 1; i >= 0; i--) {
      const te = this.#teslas[i];
      if (t >= te.until) { te.vat.group.remove(te.grp); for (const ln of te.lines) ln.geometry.dispose(); te.mat.dispose(); te.vat.coilMat.emissiveIntensity = 0.5; this.#teslas.splice(i, 1); continue; }
      te.mat.opacity = 0.45 + Math.random() * 0.55;
      for (const ln of te.lines) {
        const end = new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.14 + Math.random() * 0.34, (Math.random() - 0.5) * 0.5);
        const pts = [new THREE.Vector3()];
        for (let s2 = 1; s2 < 4; s2++) { const f = s2 / 4; pts.push(new THREE.Vector3().lerpVectors(pts[0], end, f).add(new THREE.Vector3((Math.random() - 0.5) * 0.14, (Math.random() - 0.5) * 0.14, (Math.random() - 0.5) * 0.14))); }
        pts.push(end); ln.geometry.setFromPoints(pts);
      }
      te.vat.coilMat.emissiveIntensity = 2.4 + Math.random() * 1.6;
    }
    // slot-machine reels scrolling inside the chambers
    for (const reel of this.#reels) {
      for (const g of reel.gums) {
        g.y -= dt * 3.2; if (g.y < reel.cy - 0.85) g.y += 1.7;
        g.mesh.position.y = g.y; g.mesh.rotation.y += dt * 4;
        g.mesh.visible = Math.abs(g.y - reel.cy) < 0.32;
      }
    }
    // rarity auras breathing
    for (const a of this.#auras) { a.mesh.scale.setScalar(1 + 0.12 * Math.sin(t * 4 + a.phase)); a.mat.opacity = 0.26 + 0.12 * (0.5 + 0.5 * Math.sin(t * 3 + a.phase)); }
  }

  // --- nameplate on the machine plating -----------------------------------

  #spawnPlate(vat, rw) {
    if (!this.#overlay) return;
    const rcol = rarityHex(rw.gum.rarity);
    const el = document.createElement('div');
    el.className = 'fx-plate';
    el.style.setProperty('--rcol', rcol);
    el.innerHTML = `<span class="fx-plate-name">${rw.gum.name}</span>${rw.count > 1 ? `<span class="fx-plate-x">×${rw.count}</span>` : ''}`;
    this.#overlay.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    this.#plates.push({ el, world: vat.plateWorld });
  }

  #removePlate(vat) {
    const idx = this.#plates.findIndex((p) => p.world === vat.plateWorld);
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
      const v = p.world.clone().project(this.#camera);
      const x = (v.x * 0.5 + 0.5) * r.width;
      const y = (-v.y * 0.5 + 0.5) * r.height;
      // centre the nameplate just above the machine's plating anchor
      p.el.style.transform = `translate(${x.toFixed(1)}px, ${(y - 26).toFixed(1)}px) translate(-50%, -100%)`;
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
      ud.tube.beamMats.forEach((b, k) => { b.opacity = (0.18 + k * 0.07) * (0.7 + 0.3 * Math.sin(this.#t * 3 + k)); });
      // idle: coil terminals flicker faintly, chamber lights breathe
      ud.vats.forEach((vt, i) => {
        if (!this.#isShaking(vt)) vt.coilMat.emissiveIntensity += (0.5 + 0.12 * Math.sin(this.#t * 2.2 + i) - vt.coilMat.emissiveIntensity) * Math.min(1, dt * 4);
      });
      for (const ball of this.#balls) if (ball) ball.rotation.y += (ball.userData.spin || 1) * dt;
      this.#stepRevealFx(dt);
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
    for (const b of this.#balls) if (b) { (b.parent || this.#scene).remove(b); b.userData.dispose?.(); }
    this.#balls.length = 0;
    // tear down any in-flight reveal FX
    for (const s of this.#shakes) { s.vat.group.position.set(s.vat.baseX, 0, 0); s.vat.group.rotation.z = 0; }
    for (const te of this.#teslas) { te.vat.group.remove(te.grp); for (const ln of te.lines) ln.geometry.dispose(); te.mat.dispose(); te.vat.coilMat.emissiveIntensity = 0.5; }
    for (const r of this.#reels) for (const { mesh } of r.gums) { r.vat.group.remove(mesh); mesh.userData.dispose?.(); }
    for (const a of this.#auras) { a.vat.group.remove(a.mesh); a.geo.dispose(); a.mat.dispose(); a.vat.light.intensity = 0.3; a.vat.light.color.set(a.vat.tint); }
    this.#shakes.length = 0; this.#teslas.length = 0; this.#reels.length = 0; this.#auras.length = 0;
    this.#busy = false;
  }
}

function rarityHex(rarity) { return RARITIES.find((r) => r.id === rarity)?.color ?? '#ffb347'; }

const linear = (p) => p;
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const easeIn = (p) => p * p * p;
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
