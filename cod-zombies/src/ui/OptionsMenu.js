import { Action } from '../config/keybinds.js';
import { sectionTitle, slider, toggle, segmented, select, keybindRow } from './components.js';

const KEYBIND_ACTIONS = [
  [Action.MOVE_FORWARD, 'Move Forward'],
  [Action.MOVE_BACKWARD, 'Move Backward'],
  [Action.MOVE_LEFT, 'Move Left'],
  [Action.MOVE_RIGHT, 'Move Right'],
  [Action.JUMP, 'Jump'],
  [Action.SPRINT, 'Sprint'],
  [Action.CROUCH, 'Crouch'],
  [Action.PRONE, 'Prone'],
  [Action.SLIDE, 'Slide'],
  [Action.FIRE, 'Fire'],
  [Action.AIM, 'Aim'],
  [Action.RELOAD, 'Reload'],
  [Action.INTERACT, 'Interact'],
];

const TABS = [
  { id: 'controls', label: 'Controls' },
  { id: 'graphics', label: 'Graphics' },
  { id: 'display', label: 'Display' },
];

/**
 * The tabbed options screen. Builds its DOM once, rebuilds the active panel on
 * tab switch. Every control mutates the SettingsStore (which persists + applies
 * to the engine live) or InputActions (keybinds). Nothing here knows about the
 * renderer or physics — it edits settings, the store does the wiring.
 */
export class OptionsMenu {
  el;
  #settings;
  #actions;
  #panel;
  #active = 'controls';
  #onBack;

  constructor(settings, actions, onBack) {
    this.#settings = settings;
    this.#actions = actions;
    this.#onBack = onBack;
    this.el = this.#build();
  }

  #build() {
    const screen = document.createElement('div');
    screen.className = 'screen';
    screen.id = 'screen-options';
    screen.innerHTML = `
      <div class="opt-head">Options<small>System / Configuration</small></div>
      <div class="opt-tabs"></div>
      <div class="opt-panel"></div>
      <div class="opt-foot">
        <button class="btn-ghost" data-reset>Reset Section</button>
        <button class="btn-ghost" data-back>◄ Back &nbsp;[ESC]</button>
      </div>`;

    const tabsEl = screen.querySelector('.opt-tabs');
    TABS.forEach((tab, i) => {
      const b = document.createElement('div');
      b.className = 'opt-tab' + (tab.id === this.#active ? ' active' : '');
      b.innerHTML = `<span class="num">0${i + 1} /</span> ${tab.label}`;
      b.addEventListener('click', () => this.#switch(tab.id));
      b.dataset.tab = tab.id;
      tabsEl.appendChild(b);
    });

    this.#panel = screen.querySelector('.opt-panel');
    screen.querySelector('[data-back]').addEventListener('click', () => this.#onBack());
    screen.querySelector('[data-reset]').addEventListener('click', () => {
      this.#settings.resetCategory(this.#active === 'controls' ? 'controls' : this.#active);
      if (this.#active === 'controls') this.#actions.resetToDefaults();
      this.#renderPanel();
    });

    this.#renderPanel();
    return screen;
  }

  #switch(id) {
    this.#active = id;
    this.el.querySelectorAll('.opt-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === id));
    this.#renderPanel();
  }

  #renderPanel() {
    this.#panel.innerHTML = '';
    if (this.#active === 'controls') this.#buildControls();
    else if (this.#active === 'graphics') this.#buildGraphics();
    else this.#buildDisplay();
  }

  // --- panels -------------------------------------------------------------

  #buildControls() {
    const s = this.#settings.controls;
    const set = (k, v) => this.#settings.set('controls', k, v);
    const p = this.#panel;

    p.appendChild(sectionTitle('Look'));
    p.appendChild(slider({
      label: 'Mouse Sensitivity', min: 0.2, max: 3, step: 0.05, value: s.sensitivity,
      format: (v) => v.toFixed(2) + '×', onChange: (v) => set('sensitivity', v),
    }));
    p.appendChild(toggle({ label: 'Invert Look Y', value: s.invertY, onChange: (v) => set('invertY', v) }));

    p.appendChild(sectionTitle('Input Modes'));
    const modeRow = (label, key, sub) => segmented({
      label, sublabel: sub, options: ['hold', 'toggle'], labels: ['HOLD', 'TOGGLE'],
      value: s[key], onChange: (v) => set(key, v),
    });
    p.appendChild(modeRow('Aim', 'aimMode', 'Hold or toggle to aim down sight'));
    p.appendChild(modeRow('Crouch', 'crouchMode', 'Hold or toggle crouch'));
    p.appendChild(modeRow('Prone', 'proneMode', 'Hold or toggle prone'));
    p.appendChild(modeRow('Sprint', 'sprintMode', 'Hold or toggle sprint'));

    p.appendChild(sectionTitle('Key Bindings'));
    const binds = this.#actions.getBindings();
    KEYBIND_ACTIONS.forEach(([action, label]) => {
      p.appendChild(keybindRow({
        label,
        code: binds[action]?.[0],
        onRebind: (code) => this.#actions.rebind(action, [code]),
      }));
    });
  }

  #buildGraphics() {
    const g = this.#settings.graphics;
    const set = (k, v) => this.#settings.set('graphics', k, v);
    const p = this.#panel;

    p.appendChild(sectionTitle('Rendering'));
    p.appendChild(segmented({
      label: 'Shadows', options: ['off', 'low', 'high'], labels: ['OFF', 'LOW', 'HIGH'],
      value: g.shadows, onChange: (v) => set('shadows', v),
    }));
    p.appendChild(slider({
      label: 'Exposure', min: 0.3, max: 2, step: 0.05, value: g.exposure,
      format: (v) => v.toFixed(2), onChange: (v) => set('exposure', v),
    }));
    p.appendChild(slider({
      label: 'Fog Density', sublabel: 'Atmospheric murk', min: 0, max: 0.06, step: 0.002, value: g.fog,
      format: (v) => v.toFixed(3), onChange: (v) => set('fog', v),
    }));
    p.appendChild(select({
      label: 'Texture Filtering', options: [1, 2, 4, 8, 16], value: g.anisotropy,
      format: (v) => (v === 1 ? 'Bilinear' : `${v}× Aniso`), onChange: (v) => set('anisotropy', v),
    }));

    p.appendChild(sectionTitle('Post-Processing'));
    p.appendChild(toggle({
      label: 'Post-Processing', sublabel: 'Stylized composer (bloom, DOF, grade, grain)',
      value: g.postfx !== false, onChange: (v) => set('postfx', v),
    }));
    p.appendChild(toggle({
      label: 'Bloom', sublabel: 'Glow on lights, neon and muzzle flash',
      value: g.bloom !== false, onChange: (v) => set('bloom', v),
    }));
    p.appendChild(toggle({
      label: 'Depth of Field', sublabel: 'Soft focus falloff into the murk',
      value: g.dof !== false, onChange: (v) => set('dof', v),
    }));
    p.appendChild(toggle({
      label: 'God Rays', sublabel: 'Light shafts from the moon past the rooftops',
      value: g.godRays !== false, onChange: (v) => set('godRays', v),
    }));
    p.appendChild(toggle({
      label: 'Ambient Occlusion', sublabel: 'Sinks corners + contact shadows into the dark',
      value: g.ssao !== false, onChange: (v) => set('ssao', v),
    }));
    p.appendChild(toggle({
      label: 'Ink Outlines', sublabel: 'Persona-style line-art on edges',
      value: g.outline !== false, onChange: (v) => set('outline', v),
    }));
    p.appendChild(toggle({
      label: 'Motion Blur', sublabel: 'Camera smear on fast turns / sprint',
      value: g.motionBlur !== false, onChange: (v) => set('motionBlur', v),
    }));
    p.appendChild(slider({
      label: 'Film Grain', min: 0, max: 1, step: 0.05, value: g.grain,
      format: (v) => Math.round(v * 100) + '%', onChange: (v) => set('grain', v),
    }));
    p.appendChild(toggle({ label: 'Scanlines', value: g.scanlines, onChange: (v) => set('scanlines', v) }));
    p.appendChild(slider({
      label: 'Chromatic Aberration', min: 0, max: 1, step: 0.05, value: g.aberration,
      format: (v) => Math.round(v * 100) + '%', onChange: (v) => set('aberration', v),
    }));
    p.appendChild(slider({
      label: 'Vignette', min: 0, max: 1, step: 0.05, value: g.vignette,
      format: (v) => Math.round(v * 100) + '%', onChange: (v) => set('vignette', v),
    }));

    p.appendChild(sectionTitle('Atmosphere'));
    p.appendChild(toggle({
      label: 'Ambient Particles', sublabel: 'Dust + ash motes drifting in the air',
      value: g.particles !== false, onChange: (v) => set('particles', v),
    }));
    p.appendChild(toggle({
      label: 'Ground Decals', sublabel: 'Persistent blood pools + scorch marks',
      value: g.decals !== false, onChange: (v) => set('decals', v),
    }));
    p.appendChild(toggle({
      label: 'Light Beams', sublabel: 'Dusty volumetric cones under the lamps',
      value: g.lightCones !== false, onChange: (v) => set('lightCones', v),
    }));
    p.appendChild(toggle({
      label: 'Zombie Rim Light', sublabel: 'Cold moonlight edge on the dead',
      value: g.rimLight !== false, onChange: (v) => set('rimLight', v),
    }));
    p.appendChild(toggle({
      label: 'Rain + Mist', sublabel: 'Rain streaks and low ground fog',
      value: g.rain !== false, onChange: (v) => set('rain', v),
    }));
    p.appendChild(toggle({
      label: 'Lightning', sublabel: 'Periodic storm flashes',
      value: g.lightning !== false, onChange: (v) => set('lightning', v),
    }));
  }

  #buildDisplay() {
    const d = this.#settings.display;
    const set = (k, v) => this.#settings.set('display', k, v);
    const p = this.#panel;

    p.appendChild(sectionTitle('View'));
    p.appendChild(slider({
      label: 'Field of View', sublabel: 'Vertical FOV in degrees', min: 60, max: 110, step: 1, value: d.fov,
      format: (v) => v + '°', onChange: (v) => set('fov', v),
    }));
    p.appendChild(slider({
      label: 'Viewmodel FOV', sublabel: 'Gun camera — unaffected by sprint/slide FOV', min: 50, max: 90, step: 1, value: d.viewmodelFov ?? 70,
      format: (v) => v + '°', onChange: (v) => set('viewmodelFov', v),
    }));

    p.appendChild(sectionTitle('HUD'));
    p.appendChild(slider({
      label: 'HUD Scale', sublabel: 'Size of the corner HUD widgets', min: 0.7, max: 1.4, step: 0.05, value: d.hudScale ?? 1,
      format: (v) => Math.round(v * 100) + '%', onChange: (v) => set('hudScale', v),
    }));
    p.appendChild(slider({
      label: 'HUD Bounds', sublabel: 'Safe-area padding from the screen edges', min: 0, max: 80, step: 2, value: d.hudBounds ?? 0,
      format: (v) => v + 'px', onChange: (v) => set('hudBounds', v),
    }));

    p.appendChild(sectionTitle('Resolution'));
    p.appendChild(slider({
      label: 'Render Scale', sublabel: 'Internal resolution (web)', min: 0.5, max: 1, step: 0.05, value: d.renderScale,
      format: (v) => Math.round(v * 100) + '%', onChange: (v) => set('renderScale', v),
    }));
    p.appendChild(segmented({
      label: 'Window Mode', options: ['windowed', 'fullscreen', 'borderless'],
      labels: ['WINDOWED', 'FULLSCREEN', 'BORDERLESS'], value: d.windowMode,
      onChange: (v) => set('windowMode', v),
    }));
    p.appendChild(toggle({ label: 'V-Sync', sublabel: 'Cap to display refresh', value: d.vsync, onChange: (v) => set('vsync', v) }));
  }
}
