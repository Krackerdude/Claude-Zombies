import * as THREE from 'three';
import { RenderConfig, PostFXConfig } from '../config/index.js';
import { PostFX } from './postfx/PostFX.js';

/**
 * Owns the THREE renderer and abstracts the WebGPU/WebGL backend choice behind
 * one interface. Callers only ever use: init(), render(scene, camera),
 * resize(), and the camera. They never branch on the backend.
 *
 * Strategy:
 *   - If WebGPU is available and preferred, dynamically import `three/webgpu`
 *     and use WebGPURenderer (which itself can fall back to a WebGL2 backend).
 *   - Otherwise use the classic WebGLRenderer.
 * The dynamic import means a browser without the WebGPU module/feature still
 * runs the WebGL path without a hard dependency at load time.
 */
export class RenderManager {
  /** @type {THREE.WebGLRenderer | any} */
  renderer = null;
  /** @type {THREE.PerspectiveCamera} */
  camera = null;
  /** @type {THREE.PerspectiveCamera} — fixed at origin, own FOV, for the viewmodel */
  vmCamera = null;
  backend = 'none';
  /** @type {PostFX | null} — stylized post-processing stack (WebGL only) */
  postFX = null;
  /** @type {THREE.DirectionalLight | null} — key light, drives god rays */
  sunLight = null;

  #canvas;
  #onResize;
  #overlayScene = null;
  #sunDir = new THREE.Vector3();
  #sunWorld = new THREE.Vector3();
  #camFwd = new THREE.Vector3();
  #sunInfo = { x: 0.5, y: 0.5, strength: 0, color: [1, 1, 1] };
  #heats = []; // { pos:Vector3, ms } — active heat-haze sources (explosions)
  #heatV = new THREE.Vector3();

  constructor(canvas) {
    this.#canvas = canvas;
  }

  /**
   * Force every material in `scene` to compile its shader up front. Pooled
   * effects (explosions, Ray Gun plasma) and the mystery-box weapons all live in
   * the scene graph hidden from load; without this their shaders compile the
   * first time they become visible mid-game, stalling a frame (the "first
   * explosion / first box open" freeze). Runs once during the loading screen.
   */
  prewarm(scene) {
    try { this.renderer?.compile?.(scene, this.camera); } catch { /* non-fatal */ }
  }

  async init() {
    const wantGPU =
      RenderConfig.preferWebGPU &&
      !RenderConfig.forceWebGL &&
      typeof navigator !== 'undefined' &&
      'gpu' in navigator;

    if (wantGPU) {
      try {
        const { WebGPURenderer } = await import('three/webgpu');
        const renderer = new WebGPURenderer({
          canvas: this.#canvas,
          antialias: RenderConfig.antialias,
        });
        await renderer.init();
        this.renderer = renderer;
        this.backend = 'webgpu';
      } catch (err) {
        console.warn('[RenderManager] WebGPU init failed, falling back to WebGL.', err);
      }
    }

    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.#canvas,
        antialias: RenderConfig.antialias,
        powerPreference: 'high-performance',
      });
      this.backend = 'webgl';
    }

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, RenderConfig.maxPixelRatio));
    if ('shadowMap' in this.renderer) {
      this.renderer.shadowMap.enabled = RenderConfig.shadows;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    if ('toneMapping' in this.renderer) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.0;
    }

    this.camera = new THREE.PerspectiveCamera(
      RenderConfig.fov,
      window.innerWidth / window.innerHeight,
      RenderConfig.near,
      RenderConfig.far,
    );

    // viewmodel camera: parked at the origin looking down -Z with its own FOV,
    // so the gun's framing is fully decoupled from the gameplay FOV tweens
    this.vmCamera = new THREE.PerspectiveCamera(
      RenderConfig.viewmodelFov,
      window.innerWidth / window.innerHeight,
      0.01,
      10,
    );

    // Stylized post stack. The hand-rolled GLSL stages only run under WebGL; on
    // WebGPU (node materials) we transparently fall back to the direct path.
    if (this.backend === 'webgl') {
      try {
        this.postFX = new PostFX(this.renderer, PostFXConfig);
      } catch (err) {
        console.warn('[RenderManager] PostFX init failed; using direct render path.', err);
        this.postFX = null;
      }
    }

    this.resize();
    this.#onResize = () => this.resize();
    window.addEventListener('resize', this.#onResize);

    return this;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.vmCamera) { this.vmCamera.aspect = w / h; this.vmCamera.updateProjectionMatrix(); }
    if (this.postFX) {
      const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.postFX.setSize(s.x, s.y);
    }
  }

  setFov(deg) {
    RenderConfig.fov = deg;
    this.camera.fov = deg;
    this.camera.updateProjectionMatrix();
  }

  setViewmodelFov(deg) {
    RenderConfig.viewmodelFov = deg;
    if (this.vmCamera) { this.vmCamera.fov = deg; this.vmCamera.updateProjectionMatrix(); }
  }

  setPixelRatioCap(cap) {
    RenderConfig.maxPixelRatio = cap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, cap));
    this.resize();
  }

  /** A scene drawn on top of the world with a cleared depth buffer — used for
   *  the first-person viewmodel so it never clips into geometry yet still
   *  self-occludes. */
  setOverlayScene(scene) { this.#overlayScene = scene; }

  /** Register the scene's key/directional light so god rays know where the
   *  "moon" is on screen. Pass null to disable god rays. */
  setSunLight(light) { this.sunLight = light; }

  /** Register a world-space heat source (explosion) for the heat-haze shimmer. */
  addHeat(x, y, z) {
    this.#heats.push({ pos: new THREE.Vector3(x, y, z), ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) });
    if (this.#heats.length > 16) this.#heats.shift();
  }

  /** Project the live heat sources to screen-uv with a fading strength. */
  #computeHeat(camera) {
    const out = [];
    if (!this.#heats.length) return out;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const life = 850;
    for (let i = this.#heats.length - 1; i >= 0; i--) {
      const h = this.#heats[i];
      const age = now - h.ms;
      if (age > life) { this.#heats.splice(i, 1); continue; }
      this.#heatV.copy(h.pos).project(camera);
      if (this.#heatV.z > 1) continue; // behind the camera
      const x = this.#heatV.x * 0.5 + 0.5, y = this.#heatV.y * 0.5 + 0.5;
      if (x < -0.2 || x > 1.2 || y < -0.2 || y > 1.2) continue;
      out.push({ x, y, strength: 1 - age / life });
      if (out.length >= 4) break;
    }
    return out;
  }

  /**
   * Project the key light to a screen-space "sun" descriptor for the god-ray
   * stage, or null when it's behind the camera. A directional light has no real
   * position, so we place a far point along the to-source direction and project
   * that. Strength fades as the light leaves the centre of view.
   */
  #computeSun(camera) {
    const light = this.sunLight;
    if (!light) return null;
    // direction toward the source = from target back to the light
    this.#sunDir.copy(light.position).sub(light.target.position).normalize();
    this.#sunWorld.copy(camera.position).addScaledVector(this.#sunDir, 500);
    this.#sunWorld.project(camera);
    if (this.#sunWorld.z > 1) return null; // behind the camera

    camera.getWorldDirection(this.#camFwd);
    const facing = this.#camFwd.dot(this.#sunDir); // >0 => looking toward it
    if (facing <= 0.05) return null;

    const x = this.#sunWorld.x * 0.5 + 0.5;
    const y = this.#sunWorld.y * 0.5 + 0.5;
    // fade out as the source nears/leaves the frame edges and as we look away
    const edge = Math.min(x, 1 - x, y, 1 - y);
    const strength = Math.max(0, Math.min(1, facing)) * Math.min(1, Math.max(0, edge + 0.35));
    if (strength <= 0.001) return null;

    const c = light.color;
    this.#sunInfo.x = x; this.#sunInfo.y = y; this.#sunInfo.strength = strength;
    this.#sunInfo.color[0] = c.r; this.#sunInfo.color[1] = c.g; this.#sunInfo.color[2] = c.b;
    return this.#sunInfo;
  }

  render(scene, camera = this.camera) {
    // Stylized path: the composer renders the world, grades it, then composites
    // the viewmodel sharp on top (see PostFX). A master toggle or any non-WebGL
    // backend transparently falls through to the direct path below.
    if (this.postFX && this.postFX.enabled) {
      const sun = this.#computeSun(camera);
      this.postFX.setHeat?.(this.#computeHeat(camera));
      this.postFX.render(scene, camera, this.#overlayScene, this.vmCamera || camera, sun);
      return;
    }

    // Direct path. Both WebGLRenderer.render and WebGPURenderer.render accept the
    // same signature; WebGPURenderer internally schedules async work for us.
    this.renderer.render(scene, camera);

    if (this.#overlayScene) {
      const auto = this.renderer.autoClear;
      this.renderer.autoClear = false;
      this.renderer.clearDepth?.();
      this.renderer.render(this.#overlayScene, this.vmCamera || camera);
      this.renderer.autoClear = auto;
    }
  }

  dispose() {
    window.removeEventListener('resize', this.#onResize);
    this.postFX?.dispose();
    this.renderer?.dispose?.();
  }
}
