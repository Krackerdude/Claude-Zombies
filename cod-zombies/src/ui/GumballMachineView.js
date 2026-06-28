import * as THREE from 'three';
import { buildGumballMachine } from '../gobblegums/gumballMachine.js';

/**
 * A small, self-contained WebGL view that renders the 3D Dr. Monty's gumball
 * machine for the GobbleGum pack menu and slowly turns it. Its own renderer /
 * scene / camera (one extra context, alpha so it composites over the menu).
 * start()/stop() drive the spin loop; the canvas is reused across opens.
 */
export class GumballMachineView {
  #renderer = null; #scene; #camera; #machine; #canvas;
  #raf = 0; #running = false; #last = 0;

  constructor() { this.#init(); }

  #init() {
    try {
      this.#renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch { this.#renderer = null; return; } // no WebGL — pack menu still works, just no model
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.#canvas = this.#renderer.domElement;
    this.#canvas.className = 'gp-machine-canvas';

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    cam.position.set(0, 0, 7);
    cam.lookAt(0, 0, 0);

    // fixed light rig (compiled once) — warm key, cool fill, warm rim
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xfff0e0, 1.5); key.position.set(3, 4, 5); scene.add(key);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.55); fill.position.set(-4, 1, 3); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffd9a0, 0.9); rim.position.set(-1, 3, -5); scene.add(rim);

    const machine = buildGumballMachine();
    machine.rotation.y = -0.45;
    scene.add(machine);

    this.#scene = scene; this.#camera = cam; this.#machine = machine;
  }

  get ok() { return !!this.#renderer; }

  mount(container) { if (this.#canvas) { container.appendChild(this.#canvas); this.resize(); } }

  resize() {
    if (!this.#renderer || !this.#canvas) return;
    const p = this.#canvas.parentElement; if (!p) return;
    const w = Math.max(1, p.clientWidth), h = Math.max(1, p.clientHeight);
    this.#renderer.setSize(w, h, false);
    this.#camera.aspect = w / h; this.#camera.updateProjectionMatrix();
  }

  start() {
    if (!this.#renderer || this.#running) return;
    this.resize();
    this.#running = true; this.#last = performance.now();
    const loop = (t) => {
      if (!this.#running) return;
      const dt = Math.min(0.05, (t - this.#last) / 1000); this.#last = t;
      this.#machine.rotation.y += dt * 0.35;                 // slow turntable
      this.#machine.position.y = -2.05 + Math.sin(t * 0.0011) * 0.05; // gentle bob
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
}
