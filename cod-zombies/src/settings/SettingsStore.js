import * as THREE from 'three';
import { defaultSettings } from './defaults.js';
import { RenderConfig, PostFXConfig, ParticleConfig, DecalConfig, AtmosphereConfig, RimConfig, WeatherConfig } from '../config/index.js';
import { setRimIntensity } from '../rendering/rimLight.js';
import { applyPS1, ps1GridForAmount } from '../rendering/ps1.js';
import { Service } from '../core/ServiceLocator.js';

// v5: added the `gameplay` category (stylized health bar toggle).
const STORAGE_KEY = 'necropolis.settings.v5';

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
  gameplay;

  #engine;
  #events;

  constructor(engine) {
    this.#engine = engine;
    this.#events = engine.services.get(Service.Events);
    const loaded = this.#load();
    this.display = { ...defaultSettings.display, ...(loaded.display ?? {}) };
    this.graphics = { ...defaultSettings.graphics, ...(loaded.graphics ?? {}) };
    this.controls = { ...defaultSettings.controls, ...(loaded.controls ?? {}) };
    this.gameplay = { ...defaultSettings.gameplay, ...(loaded.gameplay ?? {}) };
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
    this.applyCategory('gameplay');
  }

  applyCategory(category) {
    if (category === 'display') this.#applyDisplay();
    else if (category === 'graphics') this.#applyGraphics();
    else if (category === 'controls') this.#applyControls();
    else if (category === 'gameplay') this.#applyGameplay();
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

    // HUD scale + safe-area bounds (read by hud.css via CSS variables)
    const hud = document.getElementById('hud');
    if (hud) {
      hud.style.setProperty('--hud-scale', String(this.display.hudScale ?? 1));
      hud.style.setProperty('--hud-inset', `${this.display.hudBounds ?? 0}px`);
    }

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

    // Drive the stylized WebGL post stack when present. The horror FX (grain,
    // scanlines, aberration, vignette) move into the pipeline here; the CSS
    // overlay is suppressed below so they never double up.
    const g = this.graphics;
    const postOn = render.postFX && g.postfx !== false;
    if (render.postFX) {
      const P = PostFXConfig;
      P.enabled = g.postfx !== false;

      P.bloom.enabled = g.bloom !== false; P.bloom.intensity = g.bloomIntensity;
      P.dof.enabled = g.dof !== false; P.dof.maxBlur = g.dofBlur;
      P.godrays.enabled = g.godRays !== false; P.godrays.intensity = g.godRaysIntensity;
      P.ssao.enabled = g.ssao !== false; P.ssao.intensity = g.ssaoIntensity;
      // the viewmodel AO rides the same AO toggle + intensity slider, scaled down
      // (the near gun wants only a whisper: ~0.45 at the 1.55 default slider)
      P.viewmodelAO.enabled = g.ssao !== false; P.viewmodelAO.intensity = g.ssaoIntensity * 0.29;
      P.outline.enabled = g.outline !== false; P.outline.strength = g.outlineStrength;
      P.motionBlur.enabled = g.motionBlur !== false; P.motionBlur.strength = g.motionBlurStrength;
      P.heatHaze.enabled = g.heatHaze !== false;
      P.speedlines.enabled = g.speedLines !== false;

      // colour grade. exposure stays at its neutral config default — the
      // renderer tone-map (above) owns overall exposure so we don't double it.
      // gradeBrightness drives gamma: the shadow-lift "visibility" knob.
      P.grade.enabled = g.grade !== false;
      P.grade.contrast = g.gradeContrast;
      P.grade.gamma = g.gradeBrightness;
      P.grade.saturation = g.gradeSaturation;
      P.grade.splitToning = g.gradeSplit;

      P.posterize.enabled = g.posterize !== false; P.posterize.levels = g.posterizeLevels;
      P.dither.enabled = g.dither !== false && g.ditherAmount > 0; P.dither.amount = g.ditherAmount;

      P.grain.enabled = g.grain !== false && g.grainAmount > 0; P.grain.amount = g.grainAmount;
      P.scanlines.enabled = g.scanlines !== false; P.scanlines.amount = g.scanlineAmount;
      P.aberration.enabled = g.aberration !== false && g.aberrationAmount > 0; P.aberration.amount = g.aberrationAmount;
      P.vignette.enabled = g.vignette !== false && g.vignetteAmount > 0; P.vignette.amount = g.vignetteAmount;

      render.postFX.applyParams(P);
    }

    // Scene-level atmosphere systems read these config flags live each frame,
    // so toggling here takes effect immediately (independent of the composer).
    ParticleConfig.enabled = g.particles !== false;
    DecalConfig.enabled = g.decals !== false;
    AtmosphereConfig.lightCones = g.lightCones !== false;
    setRimIntensity(g.rimLight !== false ? RimConfig.intensity : 0);
    WeatherConfig.rain.enabled = g.rain !== false;
    WeatherConfig.mist.enabled = g.rain !== false;
    WeatherConfig.lightning.enabled = g.lightning !== false;

    // PS1 vertex snapping — retune every snapped material live (no recompile).
    applyPS1(g.vertexSnap !== false, ps1GridForAmount(g.vertexSnapAmount));

    // CSS overlay: the fallback when the WebGL stack is off (or unavailable).
    // When the pipeline owns these effects, zero the CSS layer to avoid stacking.
    this.#events.emit('settings:fx', postOn
      ? { grain: 0, scanlines: false, aberration: 0, vignette: 0 }
      : {
          grain: g.grain !== false ? g.grainAmount : 0,
          scanlines: g.scanlines,
          aberration: g.aberration !== false ? g.aberrationAmount : 0,
          vignette: g.vignette !== false ? g.vignetteAmount : 0,
        });
  }

  #applyControls() {
    // Movement/camera systems read settings.controls live each tick, so there's
    // nothing to push imperatively. Announce mode changes so the ControlScheme
    // can clear stale toggle latches.
    this.#events.emit('settings:controls', { ...this.controls });
  }

  #applyGameplay() {
    // Flag the HUD so hud.css can swap the health bar skin (styled <-> plain).
    const hud = document.getElementById('hud');
    if (hud) hud.dataset.healthbar = this.gameplay.stylizedHealthBar ? 'styled' : 'plain';
  }

  // --- persistence --------------------------------------------------------

  save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ display: this.display, graphics: this.graphics, controls: this.controls, gameplay: this.gameplay }),
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
