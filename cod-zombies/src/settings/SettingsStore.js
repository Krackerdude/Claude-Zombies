import * as THREE from 'three';
import { defaultSettings } from './defaults.js';
import { RenderConfig } from '../config/index.js';
import { Service } from '../core/ServiceLocator.js';

const STORAGE_KEY = 'necropolis.settings.v2';

/**
 * Single source of truth for all options. Persists to localStorage and applies
 * values to the live engine (renderer, scene, camera). Pure CSS-driven horror
 * FX are broadcast on the EventBus for the UI overlay to consume, so the store
 * doesn't reach into the DOM.
 */
export class SettingsStore {
  display;
  graphics;
  controls;

  #engine;
  #events;

  constructor(engine) {
    this.#engine = engine;
    this.#events = engine.services.get(Service.Events);
    const loaded = this.#load();
    this.display = { ...defaultSettings.display, ...(loaded.display ?? {}) };
    this.graphics = { ...defaultSettings.graphics, ...(loaded.graphics ?? {}) };
    this.controls = { ...defaultSettings.controls, ...(loaded.controls ?? {}) };
  }

  /** Update a single value within a category and re-apply + persist. */
  set(category, key, value) {
    this[category][key] = value;
    this.save();
    this.applyCategory(category);
    this.#events.emit('settings:change', { category, key, value });
  }

  applyAll() {
    this.applyCategory('display');
    this.applyCategory('graphics');
    this.applyCategory('controls');
  }

  applyCategory(category) {
    if (category === 'display') this.#applyDisplay();
    else if (category === 'graphics') this.#applyGraphics();
    else if (category === 'controls') this.#applyControls();
  }

  // --- apply implementations ---------------------------------------------

  #applyDisplay() {
    const render = this.#engine.services.get(Service.Render);
    RenderConfig.fov = this.display.fov;
    render.camera.fov = this.display.fov;
    render.camera.updateProjectionMatrix();
    if (this.display.viewmodelFov != null) render.setViewmodelFov?.(this.display.viewmodelFov);

    const cap = Math.max(0.4, Math.min(this.display.renderScale, 1)) * window.devicePixelRatio;
    render.setPixelRatioCap(cap);

    this.#applyWindowMode(this.display.windowMode);
    // FX overlay (grain etc.) read window mode indirectly; nothing else needed.
  }

  #applyWindowMode(mode) {
    const el = document.documentElement;
    if (mode === 'windowed') {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    } else {
      // Browsers expose one fullscreen surface; borderless/fullscreen both map
      // to the Fullscreen API. Must be triggered by a user gesture, so failures
      // are swallowed (the option still persists and applies on next click).
      el.requestFullscreen?.().catch(() => {});
    }
  }

  #applyGraphics() {
    const render = this.#engine.services.get(Service.Render);
    const scene = this.#engine.services.get(Service.Scene);
    const renderer = render.renderer;

    if ('toneMappingExposure' in renderer) renderer.toneMappingExposure = this.graphics.exposure;

    // Shadows
    const sun = scene.sun;
    const shadowsOn = this.graphics.shadows !== 'off';
    if ('shadowMap' in renderer) {
      renderer.shadowMap.enabled = shadowsOn;
      renderer.shadowMap.needsUpdate = true;
    }
    if (sun) {
      sun.castShadow = shadowsOn;
      const size = this.graphics.shadows === 'high' ? 2048 : 1024;
      if (sun.shadow.mapSize.x !== size) {
        sun.shadow.mapSize.set(size, size);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
    }

    // Fog density
    if (scene.scene.fog instanceof THREE.FogExp2) scene.scene.fog.density = this.graphics.fog;

    // Anisotropy on tracked textures
    if (scene.tunableTextures) {
      for (const tex of scene.tunableTextures) {
        tex.anisotropy = this.graphics.anisotropy;
        tex.needsUpdate = true;
      }
    }

    // Broadcast the CSS FX values for the overlay.
    this.#events.emit('settings:fx', {
      grain: this.graphics.grain,
      scanlines: this.graphics.scanlines,
      aberration: this.graphics.aberration,
      vignette: this.graphics.vignette,
    });
  }

  #applyControls() {
    // Movement/camera systems read settings.controls live each tick, so there's
    // nothing to push imperatively. Announce mode changes so the ControlScheme
    // can clear stale toggle latches.
    this.#events.emit('settings:controls', { ...this.controls });
  }

  // --- persistence --------------------------------------------------------

  save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ display: this.display, graphics: this.graphics, controls: this.controls }),
      );
    } catch { /* storage unavailable */ }
  }

  #load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  resetCategory(category) {
    this[category] = { ...defaultSettings[category] };
    this.save();
    this.applyCategory(category);
    this.#events.emit('settings:change', { category, key: '*', value: this[category] });
  }
}
