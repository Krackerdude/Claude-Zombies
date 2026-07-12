import * as THREE from 'three';
import { buildGumballMachine } from '../gobblegums/gumballMachine.js';

/**
 * A small, self-contained WebGL view that renders the 3D Dr. Monty's gumball
 * machine for the GobbleGum pack menu and slowly turns it.
 *
 * PERF: the GL context is created LAZILY (on first show) and released via
 * release() when leaving the menus for gameplay — so it never sits alongside the
 * game's renderer as a second live WebGL context (the cost that made each extra
 * menu tax the in-game framerate). The scene/geometry is CPU-only and persists
 * across releases, so re-opening just re-creates a fresh context and re-uploads.
 */
export class GumballMachineView {
  #renderer = null; #scene; #camera; #machine; #canvas = null; #cy = 0;
  #host = null; #supported = null;
  #raf = 0; #running = false; #last = 0;

  constructor() { this.#buildScene(); } // CPU-only content; no GL context yet

  /** Create the GL context on demand; safe to call repeatedly. */
  #ensureRenderer() {
    if (this.#renderer) return true;
    if (this.#supported === false) return false;
    try {
      this.#renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch { this.#renderer = null; this.#supported = false; return false; } // no WebGL — menu still works, no model
    this.#supported = true;
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.#canvas = this.#renderer.domElement;
    this.#canvas.className = 'gp-machine-canvas';
    if (this.#host && this.#canvas.parentElement !== this.#host) this.#host.appendChild(this.#canvas);
    this.resize();
    return true;
  }

  #buildScene() {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(34, 1, 0.05, 100);

    // fixed light rig (compiled once) — warm key, cool fill, warm rim
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xfff0e0, 1.5); key.position.set(3, 4, 5); scene.add(key);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.55); fill.position.set(-4, 1, 3); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffd9a0, 0.9); rim.position.set(-1, 3, -5); scene.add(rim);

    const machine = buildGumballMachine();
    machine.rotation.y = -0.45;
    scene.add(machine);

    // frame the real-scale model: centre it vertically + back the camera off to
    // fit its full height with a little headroom
    const h = machine.userData.height || 1.7;
    this.#cy = -h / 2;
    machine.position.y = this.#cy;
    const fitH = h * 1.12;
    cam.position.set(0, 0, (fitH / 2) / Math.tan((cam.fov / 2) * Math.PI / 180));
    cam.lookAt(0, 0, 0);

    this.#scene = scene; this.#camera = cam; this.#machine = machine;
  }

  get ok() { return this.#supported !== false; } // optimistic; ensureRenderer confirms/creates on show

  mount(container) {
    this.#host = container;
    if (this.#ensureRenderer() && this.#canvas) {
      if (this.#canvas.parentElement !== container) container.appendChild(this.#canvas);
      this.resize();
    }
  }

  resize() {
    if (!this.#renderer || !this.#canvas) return;
    const p = this.#canvas.parentElement; if (!p) return;
    const w = Math.max(1, p.clientWidth), h = Math.max(1, p.clientHeight);
    this.#renderer.setSize(w, h, false);
    this.#camera.aspect = w / h; this.#camera.updateProjectionMatrix();
  }

  start() {
    if (this.#running) return;
    if (!this.#ensureRenderer()) return;   // (re)create the context on show
    this.resize();
    this.#running = true; this.#last = performance.now();
    const loop = (t) => {
      if (!this.#running) return;
      const dt = Math.min(0.05, (t - this.#last) / 1000); this.#last = t;
      this.#machine.rotation.y += dt * 0.35;                 // slow turntable
      this.#machine.position.y = this.#cy + Math.sin(t * 0.0011) * 0.02; // gentle bob
      this.#renderer.render(this.#scene, this.#camera);
      this.#raf = requestAnimationFrame(loop);
    };
    this.#raf = requestAnimationFrame(loop);
  }

  stop() {
    this.#running = false;
    if (this.#raf) cancelAnimationFrame(this.#raf);
    this.#raf = 0;
  }

  /** Fully release the GL context (called when leaving the menus for gameplay).
   *  The scene persists on the CPU; the next start()/mount() recreates a context. */
  release() {
    this.stop();
    if (this.#canvas?.parentElement) this.#canvas.parentElement.removeChild(this.#canvas);
    if (this.#renderer) { this.#renderer.dispose(); this.#renderer.forceContextLoss?.(); }
    this.#renderer = null; this.#canvas = null;
  }
}
