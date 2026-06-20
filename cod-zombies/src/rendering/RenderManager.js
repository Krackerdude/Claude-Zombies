import * as THREE from 'three';
import { RenderConfig } from '../config/index.js';

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

  #canvas;
  #onResize;
  #overlayScene = null;

  constructor(canvas) {
    this.#canvas = canvas;
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

  render(scene, camera = this.camera) {
    // Both WebGLRenderer.render and WebGPURenderer.render accept the same
    // signature; WebGPURenderer internally schedules async work for us.
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
    this.renderer?.dispose?.();
  }
}
