import * as THREE from 'three';
import { buildModelCategories } from '../models/modelRegistry.js';

/**
 * F5 Model Showcase — a standalone model inspector/tweaker. It boots over the
 * whole game (from the menu or mid-run) as its own fullscreen entity with its
 * own WebGL context + render loop; leaving it reloads the page (a fresh start).
 *
 * Flow: pick a category tab + a model on the left → it renders in the centre and
 * lists every part on the right. Select a part to highlight it and nudge its
 * position / rotation / scale; every change is echoed as EXACT values in a
 * copy-ready readout so tweaks can be pasted straight back into chat.
 */
const R2D = 180 / Math.PI;
const D2R = Math.PI / 180;
const f = (n, d = 3) => (Math.abs(n) < 1e-6 ? 0 : n).toFixed(d);

export class ModelShowcase {
  #gameState; #input;
  #root; #canvasWrap; #listEl; #partsEl; #xformEl; #readoutEl; #titleEl;
  #renderer; #scene; #camera; #pivot; #modelRoot; #model; #helper; #grid;
  #raf = 0; #open = false; #built = false;

  #cats = []; #activeCat = 'guns'; #activeItem = null;
  #parts = []; #sel = null; #changes = new Set();

  // orbit state
  #yaw = 0.6; #pitch = 0.25; #dist = 3; #target = new THREE.Vector3(0, 0, 0);
  #drag = false; #lx = 0; #ly = 0;

  constructor({ gameState = null, input = null } = {}) {
    this.#gameState = gameState;
    this.#input = input;
    this.#cats = buildModelCategories();
    this.#bindKey();
  }

  get isOpen() { return this.#open; }

  #bindKey() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F5') { e.preventDefault(); e.stopPropagation(); this.open(); }
    }, true);
  }

  // ---- lifecycle ----------------------------------------------------------

  open() {
    if (this.#open) return;
    if (!this.#built) this.#build();
    this.#open = true;
    this.#input?.exitPointerLock?.();
    this.#root.classList.add('show');
    this.#onResize();
    if (!this.#activeItem) this.#renderList();
    this.#loop();
  }

  #exit() {
    // leaving is "the game starting up again" — a clean reload
    window.location.reload();
  }

  // ---- DOM ----------------------------------------------------------------

  #build() {
    this.#built = true;
    const el = document.createElement('div');
    el.id = 'model-showcase';
    el.innerHTML = `
      <div class="ms-top">
        <div class="ms-brand">MODEL SHOWCASE <span>[F5]</span></div>
        <div class="ms-title" id="ms-title">Select a model</div>
        <button class="ms-exit" id="ms-exit">Exit ⟳</button>
      </div>
      <div class="ms-body">
        <div class="ms-left">
          <div class="ms-tabs" id="ms-tabs"></div>
          <div class="ms-list" id="ms-list"></div>
        </div>
        <div class="ms-center">
          <div class="ms-canvas" id="ms-canvas"></div>
          <div class="ms-hint">drag to orbit · scroll to zoom</div>
        </div>
        <div class="ms-right" id="ms-right">
          <div class="ms-r-head">Parts</div>
          <div class="ms-parts" id="ms-parts"><div class="ms-empty">Pick a model to list its parts.</div></div>
          <div class="ms-xform" id="ms-xform"></div>
          <div class="ms-r-head">Changes <button class="ms-copy" id="ms-copy">Copy</button></div>
          <textarea class="ms-readout" id="ms-readout" readonly spellcheck="false"></textarea>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.#root = el;
    this.#canvasWrap = el.querySelector('#ms-canvas');
    this.#listEl = el.querySelector('#ms-list');
    this.#partsEl = el.querySelector('#ms-parts');
    this.#xformEl = el.querySelector('#ms-xform');
    this.#readoutEl = el.querySelector('#ms-readout');
    this.#titleEl = el.querySelector('#ms-title');

    // tabs
    const tabs = el.querySelector('#ms-tabs');
    for (const c of this.#cats) {
      const b = document.createElement('button');
      b.className = 'ms-tab' + (c.id === this.#activeCat ? ' active' : '');
      b.textContent = c.label; b.dataset.cat = c.id;
      b.addEventListener('click', () => { this.#activeCat = c.id; this.#syncTabs(); this.#renderList(); });
      tabs.appendChild(b);
    }

    el.querySelector('#ms-exit').addEventListener('click', () => this.#exit());
    el.querySelector('#ms-copy').addEventListener('click', () => this.#copy());
    this.#listEl.addEventListener('click', (e) => {
      const it = e.target.closest('.ms-item'); if (it) this.#select(it.dataset.id);
    });
    this.#partsEl.addEventListener('click', (e) => {
      const p = e.target.closest('.ms-part'); if (p) this.#selectPart(parseInt(p.dataset.i, 10));
    });
    // don't let showcase key/scroll leak to the (paused) game underneath
    el.addEventListener('keydown', (e) => { if (e.code !== 'F5') e.stopPropagation(); });

    this.#setup3D();
    this.#renderList();
    window.addEventListener('resize', () => { if (this.#open) this.#onResize(); });
  }

  #syncTabs() {
    for (const b of this.#root.querySelectorAll('.ms-tab')) b.classList.toggle('active', b.dataset.cat === this.#activeCat);
  }

  #renderList() {
    const cat = this.#cats.find((c) => c.id === this.#activeCat);
    this.#listEl.innerHTML = (cat?.items || []).map((it) =>
      `<div class="ms-item${it.id === this.#activeItem?.id ? ' sel' : ''}" data-id="${it.id}">${it.name}</div>`).join('');
  }

  // ---- 3D -----------------------------------------------------------------

  #setup3D() {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.setClearColor(0x0b0e12, 1);
    if ('outputColorSpace' in r) r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = false;
    this.#canvasWrap.appendChild(r.domElement);
    this.#renderer = r;

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xbcd0e0, 0x0a0c10, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(3, 5, 4); scene.add(key);
    const fill = new THREE.DirectionalLight(0x88a0c0, 0.8); fill.position.set(-4, 2, -3); scene.add(fill);
    const grid = new THREE.GridHelper(4, 16, 0x2a3540, 0x18202a);
    scene.add(grid); this.#grid = grid;
    scene.add(new THREE.AxesHelper(0.5));
    this.#pivot = new THREE.Group(); scene.add(this.#pivot);
    this.#scene = scene;

    this.#camera = new THREE.PerspectiveCamera(42, 1, 0.005, 200);

    // orbit + zoom
    const cv = r.domElement;
    cv.addEventListener('pointerdown', (e) => { this.#drag = true; this.#lx = e.clientX; this.#ly = e.clientY; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointerup', (e) => { this.#drag = false; try { cv.releasePointerCapture(e.pointerId); } catch { /* noop */ } });
    cv.addEventListener('pointermove', (e) => {
      if (!this.#drag) return;
      this.#yaw -= (e.clientX - this.#lx) * 0.01; this.#pitch -= (e.clientY - this.#ly) * 0.01;
      this.#pitch = Math.max(-1.5, Math.min(1.5, this.#pitch));
      this.#lx = e.clientX; this.#ly = e.clientY;
    });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.#dist *= (1 + Math.sign(e.deltaY) * 0.1); this.#dist = Math.max(0.05, Math.min(60, this.#dist)); }, { passive: false });
  }

  #onResize() {
    if (!this.#renderer) return;
    const w = this.#canvasWrap.clientWidth || 1, h = this.#canvasWrap.clientHeight || 1;
    this.#renderer.setSize(w, h, false);
    this.#camera.aspect = w / h; this.#camera.updateProjectionMatrix();
  }

  #loop() {
    if (!this.#open) return;
    this.#raf = requestAnimationFrame(() => this.#loop());
    const c = this.#camera;
    c.position.set(
      this.#target.x + this.#dist * Math.cos(this.#pitch) * Math.sin(this.#yaw),
      this.#target.y + this.#dist * Math.sin(this.#pitch),
      this.#target.z + this.#dist * Math.cos(this.#pitch) * Math.cos(this.#yaw),
    );
    c.lookAt(this.#target);
    if (this.#helper) this.#helper.update();
    this.#renderer.render(this.#scene, c);
  }

  // ---- model select -------------------------------------------------------

  #select(id) {
    const cat = this.#cats.find((c) => c.id === this.#activeCat);
    const item = cat?.items.find((i) => i.id === id);
    if (!item) return;
    this.#activeItem = item;
    this.#renderList();
    this.#titleEl.textContent = `${cat.label} — ${item.name}`;
    this.#clearModel();

    let obj;
    try { obj = item.build(); } catch (err) {
      this.#partsEl.innerHTML = `<div class="ms-empty ms-err">Build failed: ${err.message}</div>`;
      return;
    }
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

    // centre + frame it without touching the model's own transform
    obj.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(obj);
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;

    this.#modelRoot = new THREE.Group();
    this.#modelRoot.position.copy(center).multiplyScalar(-1);
    this.#modelRoot.add(obj);
    this.#pivot.add(this.#modelRoot);
    this.#model = obj;

    this.#dist = maxDim * 2.4;
    this.#target.set(0, 0, 0);
    this.#grid.scale.setScalar(Math.max(1, maxDim / 2));

    this.#changes = new Set();
    this.#buildPartList(obj);
    this.#sel = null; this.#xformEl.innerHTML = '';
    this.#renderReadout();
  }

  #clearModel() {
    if (this.#helper) { this.#scene.remove(this.#helper); this.#helper.geometry?.dispose?.(); this.#helper = null; }
    if (this.#modelRoot) {
      this.#pivot.remove(this.#modelRoot);
      this.#modelRoot.traverse((o) => {
        if (o.isMesh) { o.geometry?.dispose?.(); const m = o.material; Array.isArray(m) ? m.forEach((x) => x?.dispose?.()) : m?.dispose?.(); }
      });
      this.#modelRoot = null; this.#model = null;
    }
  }

  // ---- parts --------------------------------------------------------------

  #buildPartList(root) {
    this.#parts = [];
    const depthOf = (o) => { let d = 0; let p = o; while (p && p !== root) { d++; p = p.parent; } return d; };
    let i = 0;
    root.traverse((o) => {
      this.#parts.push({ i, node: o, depth: depthOf(o), orig: { p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() } });
      i++;
    });
    const label = (o, idx) => {
      if (o.name) return o.name;
      if (o.isMesh) { const g = o.geometry?.type?.replace('Geometry', '') || 'Mesh'; return `${g} ${idx}`; }
      return `${o.type} ${idx}`;
    };
    this.#partsEl.innerHTML = this.#parts.map((p) =>
      `<div class="ms-part" data-i="${p.i}" style="padding-left:${6 + p.depth * 12}px">
         <span class="ms-part-t ${p.node.isMesh ? 'mesh' : 'grp'}">${p.node.isMesh ? '◈' : '▸'}</span>${label(p.node, p.i)}
       </div>`).join('');
  }

  #selectPart(i) {
    const part = this.#parts[i]; if (!part) return;
    this.#sel = part;
    for (const el of this.#partsEl.querySelectorAll('.ms-part')) el.classList.toggle('sel', +el.dataset.i === i);

    if (this.#helper) { this.#scene.remove(this.#helper); this.#helper = null; }
    this.#helper = new THREE.BoxHelper(part.node, 0xffb638);
    this.#scene.add(this.#helper);

    this.#renderXform(part);
  }

  #renderXform(part) {
    const n = part.node;
    const row = (lbl, axes, get, step) => `
      <div class="ms-xrow"><span class="ms-xlbl">${lbl}</span>${axes.map((ax) =>
        `<label class="ms-xf"><b>${ax}</b><input type="number" step="${step}" data-k="${lbl}" data-ax="${ax}" value="${get(ax)}"></label>`).join('')}</div>`;
    this.#xformEl.innerHTML = `
      <div class="ms-x-name">${n.name || (n.isMesh ? 'Mesh' : n.type)} <span>#${part.i}</span></div>
      ${row('pos', ['x', 'y', 'z'], (a) => f(n.position[a]), 0.005)}
      ${row('rot', ['x', 'y', 'z'], (a) => f(n.rotation[a] * R2D, 1), 1)}
      ${row('scl', ['x', 'y', 'z'], (a) => f(n.scale[a]), 0.01)}
      <div class="ms-xbtns"><button class="ms-resetpart">Reset part</button></div>`;
    this.#xformEl.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('input', () => this.#applyInput(part, inp));
    });
    this.#xformEl.querySelector('.ms-resetpart').addEventListener('click', () => this.#resetPart(part));
  }

  #applyInput(part, inp) {
    const v = parseFloat(inp.value); if (Number.isNaN(v)) return;
    const n = part.node, ax = inp.dataset.ax, k = inp.dataset.k;
    if (k === 'pos') n.position[ax] = v;
    else if (k === 'rot') n.rotation[ax] = v * D2R;
    else n.scale[ax] = v;
    this.#markChange(part);
  }

  #resetPart(part) {
    part.node.position.copy(part.orig.p);
    part.node.rotation.copy(part.orig.r);
    part.node.scale.copy(part.orig.s);
    this.#renderXform(part);
    this.#markChange(part);
  }

  #markChange(part) {
    const changed = !part.node.position.equals(part.orig.p) || !part.node.scale.equals(part.orig.s)
      || part.node.rotation.x !== part.orig.r.x || part.node.rotation.y !== part.orig.r.y || part.node.rotation.z !== part.orig.r.z;
    if (changed) this.#changes.add(part.i); else this.#changes.delete(part.i);
    this.#renderReadout();
  }

  // ---- readout ------------------------------------------------------------

  #renderReadout() {
    if (!this.#changes.size) { this.#readoutEl.value = this.#activeItem ? '(no changes — nudge a part)' : ''; return; }
    const lines = [`# ${this.#titleEl.textContent}`];
    for (const i of [...this.#changes].sort((a, b) => a - b)) {
      const p = this.#parts[i]; const n = p.node;
      const nm = n.name || (n.isMesh ? (n.geometry?.type?.replace('Geometry', '') || 'Mesh') : n.type);
      lines.push(`part #${i} (${nm}):`);
      lines.push(`  position ${f(n.position.x)}, ${f(n.position.y)}, ${f(n.position.z)}`);
      lines.push(`  rotation ${f(n.rotation.x)}, ${f(n.rotation.y)}, ${f(n.rotation.z)}  rad   (${f(n.rotation.x * R2D, 1)}, ${f(n.rotation.y * R2D, 1)}, ${f(n.rotation.z * R2D, 1)} deg)`);
      lines.push(`  scale    ${f(n.scale.x)}, ${f(n.scale.y)}, ${f(n.scale.z)}`);
    }
    this.#readoutEl.value = lines.join('\n');
  }

  #copy() {
    this.#readoutEl.select();
    try { navigator.clipboard?.writeText(this.#readoutEl.value); } catch { document.execCommand?.('copy'); }
    const btn = this.#root.querySelector('#ms-copy');
    if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 1200); }
  }
}
