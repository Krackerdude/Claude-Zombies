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
    hudScale: 1.0, // uniform scale of the corner HUD widgets
    hudBounds: 26, // safe-area inset (px) pushing the HUD in off the screen edge
  },
  graphics: {
    // --- rendering ---
    shadows: 'high', // off | low | high
    exposure: 1.25, // tone-mapping exposure (renderer)
    fog: 0.011, // FogExp2 density
    anisotropy: 8, // texture filtering

    // --- post-processing composer ---
    // Master + per-effect toggle, each with an intensity where it makes sense.
    // The Post FX options tab binds straight to these; SettingsStore pushes them
    // into PostFXConfig live. Defaults mirror PostFXConfig (the authored look).
    postfx: true, // master switch for the whole composer
    bloom: true, bloomIntensity: 0.85,
    dof: true, dofBlur: 1.0,
    godRays: true, godRaysIntensity: 0.5,
    ssao: true, ssaoIntensity: 1.15,
    outline: true, outlineStrength: 0.9,
    motionBlur: true, motionBlurStrength: 0.5,
    heatHaze: true,
    speedLines: true,
    // colour grade
    grade: true,
    gradeContrast: 1.12,
    gradeBrightness: 1.0, // gamma — shadow/midtone lift (1 = neutral; raise to see into shadow)
    gradeSaturation: 1.14,
    // graphic-novel colour reduction
    posterize: true, posterizeLevels: 24,
    dither: true, ditherAmount: 0.6,
    // horror flavour
    grain: true, grainAmount: 0.14,
    scanlines: true, scanlineAmount: 0.5,
    aberration: true, aberrationAmount: 0.3,
    vignette: true, vignetteAmount: 0.55,

    // --- atmosphere (scene systems, not the composer) ---
    particles: true, // ambient dust / ash motes in the air
    decals: true, // persistent blood pools + scorch on the ground
    lightCones: true, // dusty volumetric beams under the lamps
    rimLight: true, // cold moonlight rim on the zombies
    rain: true, // rain + ground mist
    lightning: true, // periodic lightning flashes
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
