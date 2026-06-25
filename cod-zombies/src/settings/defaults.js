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
    bloom: true, bloomIntensity: 1.0,
    dof: true, dofBlur: 1.0,
    godRays: true, godRaysIntensity: 1.0,
    ssao: true, ssaoIntensity: 1.55,
    outline: true, outlineStrength: 0.9,
    motionBlur: true, motionBlurStrength: 0.35,
    heatHaze: true,
    speedLines: true,
    // colour grade
    grade: true,
    gradeContrast: 1.01,
    gradeBrightness: 0.9, // gamma — shadow/midtone lift (1 = neutral; raise to see into shadow)
    gradeSaturation: 1.45,
    gradeSplit: 1.0, // 0..1 Tartarus split-tone strength (0 = no colour cast, neutral)
    // graphic-novel colour reduction
    posterize: true, posterizeLevels: 24,
    dither: true, ditherAmount: 1.0,
    // horror flavour (grain off by default — posterize+dither give the same texture)
    grain: true, grainAmount: 0.0,
    scanlines: true, scanlineAmount: 1.0,
    aberration: true, aberrationAmount: 1.0,
    vignette: true, vignetteAmount: 0.5,

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
  gameplay: {
    stylizedHealthBar: true, // reskin the health bar to match the interaction prompt
  },
};

/** Human labels + option lists for the UI, kept beside the data they drive. */
export const settingsMeta = {
  shadows: { label: 'Shadows', options: ['off', 'low', 'high'] },
  windowMode: { label: 'Window Mode', options: ['windowed', 'fullscreen', 'borderless'] },
  anisotropy: { label: 'Texture Filtering', options: [1, 2, 4, 8, 16] },
  mode: { options: ['hold', 'toggle'] },
};
