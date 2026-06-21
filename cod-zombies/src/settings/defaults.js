/**
 * Default settings, grouped by the three options tabs. The SettingsStore loads
 * an override from localStorage on top of these and applies them to the engine.
 * Keeping the shape flat-ish makes the options UI a near-direct mapping.
 */
export const defaultSettings = {
  display: {
    fov: 75, // degrees
    viewmodelFov: 70, // degrees — gun camera, independent of gameplay FOV
    renderScale: 1.0, // internal resolution scale (web "resolution")
    windowMode: 'windowed', // windowed | fullscreen | borderless
    vsync: true,
  },
  graphics: {
    shadows: 'high', // off | low | high
    exposure: 1.25, // tone-mapping exposure
    fog: 0.011, // FogExp2 density
    anisotropy: 8, // texture filtering
    // stylized WebGL post-processing pipeline (PostFX). Master + heavy stages
    // are individually toggleable for performance; off => CSS-overlay fallback.
    postfx: true, // master switch for the whole composer
    bloom: true, // additive bloom on practicals / neon / muzzle highlights
    dof: true, // depth of field (near subject crisp, world melts to murk)
    // horror post FX — drive the pipeline when postfx is on, the CSS overlay when off
    grain: 0.14, // 0..1 animated film grain
    scanlines: true,
    aberration: 0.3, // 0..1 chromatic aberration
    vignette: 0.55, // 0..1
  },
  controls: {
    sensitivity: 1.0, // multiplier on base look speed
    invertY: false,
    aimMode: 'hold', // hold | toggle
    crouchMode: 'hold',
    proneMode: 'toggle',
    sprintMode: 'hold',
  },
};

/** Human labels + option lists for the UI, kept beside the data they drive. */
export const settingsMeta = {
  shadows: { label: 'Shadows', options: ['off', 'low', 'high'] },
  windowMode: { label: 'Window Mode', options: ['windowed', 'fullscreen', 'borderless'] },
  anisotropy: { label: 'Texture Filtering', options: [1, 2, 4, 8, 16] },
  mode: { options: ['hold', 'toggle'] },
};
