/**
 * Central, mutable-at-runtime configuration. Grouped by concern so that the
 * future options menu can bind directly to these objects. Nothing here should
 * import engine modules — this is a leaf module to avoid cycles.
 */

export const RenderConfig = {
  // WebGL by default: the retro post-FX + PS1 vertex-snap use GLSL onBeforeCompile
  // hooks that WebGPU's node materials ignore. Flip to true to try WebGPU.
  preferWebGPU: false,
  forceWebGL: false,
  maxPixelRatio: 2,
  antialias: true,
  shadows: true,
  fov: 75, // degrees — gameplay camera (tweens with sprint/slide)
  viewmodelFov: 70, // degrees — dedicated viewmodel camera, never tweened
  // Tight far plane for screen-space depth precision. The old far of 1000 (with
  // near 0.1 = 10000:1) starved the depth buffer on large flat floors — a cause
  // of banding/striping. far 250 (2500:1) is 4x tighter and the arena fog fully
  // saturates well before 250m, so nothing visible is lost. near stays at 0.1:
  // the first-person arms/hands sit within ~0.3m of the eye, so a larger near
  // clips them (the normals-based AO no longer leans on depth precision anyway).
  near: 0.1,
  far: 250,
};

/**
 * Stylized post-processing stack. Pure data (no engine imports) so it stays a
 * leaf module the renderer + settings can both read. Every stage is individually
 * gateable for performance; `enabled:false` bypasses the whole composer and
 * renders straight to the screen exactly like the pre-overhaul path.
 *
 * Target look: PS2 survival-horror atmosphere (RE / Silent Hill) with a
 * Persona-flavoured grade — strong color identity, dramatic contrast, intentional
 * grain/aberration. Effects serve mood + readability, not raw fidelity.
 */
export const PostFXConfig = {
  enabled: true,

  // --- depth of field: near subject stays crisp, the rest melts to murk ---
  dof: {
    enabled: true,
    autofocus: true,     // focus on whatever sits under screen-centre
    focusDistance: 4.0,  // metres — used when autofocus is off
    focusRange: 2.4,     // metres of acceptably-sharp depth around focus
    maxBlur: 1.0,        // 0..1 strength of the far/near melt
    bokehRadius: 2.6,    // px disk radius at full CoC
  },

  // --- bloom: blooms the practicals, neon, muzzle highlights ---
  bloom: {
    enabled: true,
    // low threshold so the practicals actually bloom — campfire, neon, perk
    // panels and glowing signage sit well below the old 0.62 in this dark night
    // scene, so only the moon + additive muzzle FX ever crossed it. The world's
    // matte surfaces stay far under 0.4, so lowering this blooms the light
    // sources without hazing the dark geometry.
    threshold: 0.55,     // luminance above which a pixel blooms (soft-knee, so this is the mid-point)
    knee: 0.7,           // soft-knee width (0 = hard cut, 1 = very gradual ramp) — no popping
    intensity: 0.9,      // additive strength of the combined bloom buffer
    radius: 1.0,         // per-level blur spread multiplier
    scatter: 0.85,       // how much each wider mip bleeds up the chain (bloom reach)
    iterations: 3,       // (legacy; multi-scale mip chain now governs width)
  },

  // --- god rays: light shafts streaming from the moon past the rooftops ---
  // Minimal + atmospheric. The source is a soft disc at the key light's screen
  // position, masked to background (sky) pixels so geometry occludes the shafts.
  // Retired in favour of the real ray-marched volumetric pass below. The old
  // screen-space radial blur only faked sun shafts (no geometric occlusion, sun
  // had to be on-screen). Kept off so the sun halo now comes from bloom.
  godrays: {
    enabled: false,
    size: 0.05, density: 0.55, weight: 0.4, decay: 0.93, intensity: 1.0,
  },

  // --- volumetric lighting: true ray-marched in-scattering ---
  // A half-res post pass reconstructs each pixel's world ray from depth and
  // marches through a participating medium (height fog), accumulating light that
  // scatters toward the eye. The sun/moon is sampled against a dedicated depth
  // map so its shafts are OCCLUDED by real geometry (beams through windows,
  // rails, doorways); nearby practical lights add dusty local glow. A
  // Henyey–Greenstein phase makes beams bloom when you look toward the source,
  // and Beer–Lambert transmittance turns distance into atmospheric haze.
  volumetric: {
    enabled: true,
    intensity: 1.0,       // master multiplier on the scattered light added to the scene
    steps: 40,            // ray-march samples (quality vs cost); dithered so this can stay modest
    maxDistance: 60,      // metres — how far the march reaches before it stops accumulating
    resScale: 0.5,        // march at this fraction of screen res (0.5 = half), then upsample
    // participating medium (fog)
    fogDensity: 0.06,     // base extinction per metre at the fog floor
    fogHeight: 0.12,      // exponential height falloff (bigger = fog hugs the floor tighter)
    fogY0: 0.0,           // world height where fog is densest
    ambient: [0.05, 0.06, 0.09], // faint sky/bounce scatter so shadowed fog isn't pure black
    // sun / moon shaft
    sunScatter: 1.5,      // in-scatter strength of the key light
    anisotropy: 0.72,     // Henyey–Greenstein g (0 = uniform, →1 = sharp forward beams)
    // local practical lights (lamps, fire, muzzle, explosions)
    localScatter: 1.4,    // in-scatter strength of nearby point lights
    localLights: 6,       // max practicals sampled per frame (nearest to camera)
    // shadow map for the sun's occluded shafts
    sunShadowSize: 1024,  // resolution of the dedicated sun depth map
    sunShadowExtent: 28,  // half-width (m) of the ortho frustum tracked around the player
  },

  // --- colour grade: the Persona identity lives here ---
  grade: {
    enabled: true,
    exposure: 1.0,       // multiplied on top of the renderer's tone-map exposure
    contrast: 1.01,      // S-curve contrast around mid grey (gentle — posterize carries the punch)
    gamma: 0.9,          // midtone/shadow lift (1 = neutral). The "Shadow Brightness"
                         // slider drives this: >1 opens the dark range without washing black.
    saturation: 1.45,    // global saturation push
    temperature: 0.0,    // -1 cool .. +1 warm overall tint
    lift: [0.0, 0.0, 0.0],       // neutral — a blue-biased lift here was the light-blue
                                 // wash on the whole frame (use Shadow Brightness instead)
    gain: [1.04, 1.00, 0.96],   // highlights pulled warm (RGB mul)
    // duotone-ish split toning: shadows toward teal, highlights toward amber.
    // This is the Tartarus colour identity — now driven by the "Split Tone" slider.
    shadowTint: [0.20, 0.42, 0.55],
    highlightTint: [1.00, 0.78, 0.45],
    splitToning: 1.0,    // 0..1 how strongly the split tint is mixed in
  },

  // --- ambient occlusion: a depth-cavity darkening that grounds geometry,
  // sinks corners + where zombies meet the floor into shadow (readability) ---
  // Normals-based horizon AO (Alchemy AO): real view normals from a normal
  // prepass + a depth-aware bilateral denoise, computed at half res. Reads as a
  // subtle contact shadow (object-to-floor, corners, creases) rather than a
  // scene-wide darken. radius is world metres — small on this human-scale arena.
  ssao: {
    enabled: true,
    radius: 0.6,         // metres — sampling hemisphere; contact-shadow scale
    intensity: 1.0,      // darkening strength (0.6–1.1 tasteful)
    bias: 0.02,          // metres — reject near-coplanar samples (no flat-floor shimmer)
    power: 1.5,          // contrast of the occlusion falloff
  },

  // Dedicated viewmodel AO: the first-person gun/hands get their OWN AO pass from
  // a viewmodel-only depth+normal buffer, so they self-shadow (arm creases, under
  // the trigger guard, where the hand grips) without ghosting against the world.
  // Radius is tiny — the gun is only ~0.5 m across at ~0.3 m from the eye.
  viewmodelAO: {
    enabled: true,
    radius: 0.08,        // metres — viewmodel-scale sampling hemisphere
    intensity: 0.45,     // darkening strength — SUBTLE (a whisper of contact shade)
    bias: 0.012,         // metres — reject flat surfaces so they don't self-shade/noise
    power: 1.3,          // contrast
  },

  // --- ink / cel outlines: Persona 5 line-art on geometry edges (Sobel on
  // depth + reconstructed normals) ---
  outline: {
    enabled: true,
    color: [0.02, 0.02, 0.03], // near-black ink
    thickness: 1.0,            // sample spread in pixels
    depthEdge: 1.1,            // depth-discontinuity sensitivity
    normalEdge: 0.7,           // normal-discontinuity sensitivity
    strength: 0.9,             // how hard the ink is laid in
  },

  // --- camera motion blur: reproject the previous frame along per-pixel screen
  // velocity (camera-only) for a smear on fast turns / sprints ---
  motionBlur: {
    enabled: true,
    strength: 0.35,      // 0..1 smear amount
    samples: 8,          // taps along the velocity vector
    max: 0.04,           // clamp the per-pixel velocity (uv) so it never streaks wildly
  },

  // --- heat haze: localized refraction ripples around explosions / fire ---
  heatHaze: { enabled: true, strength: 1.0 },

  // --- Persona speed-lines + radial blur: a kinetic burst driven at runtime by
  // sprint / slide / damage / kills (intensity is pushed live, not configured) ---
  speedlines: { enabled: true, blur: 0.6, lines: 0.7 },

  // --- graphic-novel colour reduction layered into the final grade ---
  posterize: { enabled: true, levels: 24 },   // banded colour steps (higher = subtler)
  dither: { enabled: true, amount: 1.0 },      // ordered dither to break the bands

  // --- screen-space horror flavour (overhauled from the old CSS overlay) ---
  vignette: { enabled: true, amount: 0.5, softness: 0.45 },
  aberration: { enabled: true, amount: 1.0 },   // radial RGB split, edge-weighted
  grain: { enabled: true, amount: 0.0, animated: true }, // off by default (posterize+dither cover it)
  scanlines: { enabled: true, amount: 1.0, density: 2.4, scroll: 0.4 }, // CRT roll
};

/**
 * Dynamic-light atmosphere: subtle, deterministic flicker/pulse layered onto
 * tagged practical lights so the scene breathes. Isolated + disable-able; the
 * AtmosphereSystem only touches lights that opt in via userData.flicker.
 */
export const AtmosphereConfig = {
  enabled: true,
  flickerSpeed: 9.0,   // base hertz of the noise drive
  flickerDepth: 0.16,  // fraction of base intensity the flicker can swing
  lightCones: true,    // dusty volumetric beams under the practical lamps
};

/**
 * Fresnel rim light baked into the zombie skins — a cold moonlight catch along
 * the silhouette so the dead read against the murk. Cheap (a few fragment ALU);
 * runtime-toggled by zeroing the registered rim uniforms.
 */
export const RimConfig = {
  enabled: true,
  color: 0x9fb4ff,     // cold blue-white edge
  power: 2.6,          // falloff sharpness
  intensity: 0.55,     // emissive strength of the rim
};

/**
 * Ambient particulate that hangs in the air — slow dust motes / drifting embers
 * lit by the fog. Recentred on the player so the volume always surrounds the
 * camera. Pure atmosphere; isolated GPU Points, disable-able.
 */
export const ParticleConfig = {
  enabled: true,
  count: 220,          // mote count
  volume: 16,          // half-extent of the cube the motes wander (metres)
  rise: 0.12,          // upward drift (m/s)
  drift: 0.22,         // lateral sway amplitude
  size: 0.05,          // point size (metres)
  opacity: 0.45,       // base alpha — kept faint so it reads as haze, not snow
  color: 0xbfc8d8,     // cool ash/dust tint
};

/**
 * Persistent ground decals stamped where the world remembers violence: blood
 * pools under the fallen, scorch rings from explosions, energy burns from
 * plasma. Pooled + recycled (oldest reused past `max`), each fading out over its
 * lifetime. Complements WeaponFx (which owns the transient impact bursts).
 */
export const DecalConfig = {
  enabled: true,
  max: 56,             // pooled GROUND decals (pools/scorch); oldest recycled beyond this
  bloodLife: 38,       // seconds a blood pool persists before it has faded
  scorchLife: 55,      // seconds a scorch/burn persists
  // surface decals — normal-oriented, stamped on whatever a shot hits: blood
  // spray on the wall/floor BEHIND a hit zombie, and bullet pockmarks that build
  // up where you hold. Bigger budget + longer life so the room escalates.
  surfaceMax: 180,     // pooled surface decals (spray + pockmarks)
  splatLife: 70,       // seconds a blood spray persists
  holeLife: 120,       // seconds a bullet pockmark persists
};

/**
 * Silent-Hill weather. Rain is a GPU streak field that follows the player; the
 * WeatherSystem also drives occasional lightning that strobes the fog + key
 * light, and a low ground-mist band. All isolated + disable-able.
 */
export const WeatherConfig = {
  // Snow suits the aurora night — moonlit flakes drifting down, catching the
  // lightning. Rain is kept as an alternative (enable it + disable snow for a
  // thunderstorm look).
  snow: {
    enabled: true,
    count: 1300,         // flake count in the volume around the player
    area: 18,            // half-extent (metres) of the snow column
    height: 16,          // column height
    speed: 2.4,          // slow drift-fall (m/s)
    sway: 0.9,           // horizontal sway amplitude
    size: 0.11,          // world-space flake size
    opacity: 0.9,
    color: 0xe2ecff,     // moonlit cool white
  },
  rain: {
    enabled: false,
    count: 900,          // streak count in the volume around the player
    area: 16,            // half-extent (metres) of the rain column
    height: 14,          // column height
    speed: 32,           // fall speed (m/s)
    length: 0.5,         // streak length (m)
    opacity: 0.32,
    color: 0x9fb0c4,
  },
  lightning: {
    enabled: true,
    minGap: 7,           // seconds between strikes (min)
    maxGap: 18,          // seconds between strikes (max)
  },
  mist: {
    enabled: true,
    count: 40,           // ground-mist puff count (kept sparse so it reads as haze)
    area: 18,
    height: 1.0,         // motes hug the floor
    size: 3.0,           // world-space puff size
    opacity: 0.06,       // very faint — overlapping puffs build up fast
    color: 0x8a93a6,     // cool grey-blue ground fog
  },
};

/**
 * Cinematic time + framing. The slow-mo triggers when the last zombie of a
 * round falls; the reactive vignette pulses with low health (driven live).
 */
export const CinematicConfig = {
  slowmo: { enabled: true, scale: 0.35, duration: 1.1, ease: 0.12 }, // last-kill bullet-time
};

export const PhysicsConfig = {
  gravity: { x: 0, y: -22.0, z: 0 }, // punchier than real gravity, feels better for FPS
  fixedStep: 1 / 60, // seconds
  maxSubSteps: 5, // clamp the accumulator so a stall can't spiral
  characterOffset: 0.08, // skin width for the kinematic controller
};

/**
 * Movement tuning for the player. The feel comes from a velocity +
 * acceleration/friction model (Quake/Source lineage) rather than directly
 * setting position, which is what makes it read as "grounded and weighted"
 * while still snappy. BO3-flavoured: punchy sprint, a momentum slide you can
 * cancel, dolphin dive, jump-buffering and coyote time so nothing feels
 * dropped.
 */
export const PlayerConfig = {
  // top speeds (m/s)
  walkSpeed: 5.0,
  sprintSpeed: 7.6,
  crouchSpeed: 2.8,
  proneSpeed: 1.4,

  // acceleration / friction (Quake-style units: per-second)
  groundAccel: 70,
  groundFriction: 9.5,
  stopSpeed: 2.0, // friction floor so low speeds still bleed off crisply
  airAccel: 14, // steers direction in air without piling on speed
  airControlSpeed: 7.6, // wish-speed cap used for air steering
  airDrag: 1.9, // wind resistance: bleeds excess air speed back toward walk speed

  // jump
  jumpSpeed: 7.6, // ~1.3 m apex under 22 m/s^2 gravity
  coyoteTime: 0.12, // grace window to still jump after leaving ground
  jumpBufferTime: 0.12, // press-jump-before-landing still fires on land
  maxAirJumps: 0, // single jump for grounded feel (raise later if wanted)

  // slide (BO3): sprint + tap crouch. Burst of speed, decays, steerable a bit.
  slideEnterSpeed: 14.5, // initial burst (well above sprint)
  slideMinSpeed: 3.5, // drop below -> resolve to crouch/stand
  slideMinTime: 0.2, // commit window
  slideFriction: 0.6, // minimal falloff — the slide keeps its speed
  slideMaxTime: 0.6, // short + snappy; ends here (while still fast) rather than crawling out
  slideSteerSpeed: 3.0, // curve influence only — kept below slideMinSpeed so it never floors the slide
  slideSteerAccel: 16,
  slideRecovery: 0.75, // after a slide ends, must "recover" this long before sliding again
  slideBufferTime: 0.2, // a sprint-slide press persists this long so a 1-frame dip can't eat it

  // sprint fatigue (BO3): sprint ~4s, then forced ~1s walk before sprinting again
  sprintMaxTime: 4.0,
  sprintRecoverTime: 1.0,
  sprintRecoverRate: 1.5, // how fast the stamina meter refills while not sprinting

  // dolphin dive (BO3): sprint + prone. Committed in the air, lands prone.
  diveForwardSpeed: 10.5,
  diveUpSpeed: 6.0,

  // hard ceiling on horizontal ground speed so slide/jump chaining can't
  // compound into runaway velocity — keeps it grounded.
  maxGroundSpeed: 15.0,
  adsMoveScale: 0.55, // movement slowed to this fraction while aiming

  // capsule + camera
  capsuleRadius: 0.35,
  capsuleHeight: 1.1, // standing cylindrical segment (total ~ height + 2*radius)
  eyeHeight: 1.62,
  crouchEyeHeight: 0.95,
  proneEyeHeight: 0.45,
  slideEyeHeight: 0.7,
  eyeLerpRate: 14, // how fast the camera settles to a new stance eye height
  landingDipScale: 0.09, // camera dip on landing, scaled by fall speed
  landingDipRecover: 9,

  // look
  mouseSensitivity: 0.0022,
  maxPitch: Math.PI / 2 - 0.05,

  // fov feel
  sprintFovKick: 15, // extra degrees while sprinting
  slideFovKick: 20,
  fovLerpRate: 11,
};

/**
 * Per-stance capsule dimensions (cylindrical half-height of the capsule) and
 * eye heights. The MovementController resizes the collider and keeps the feet
 * planted when these change.
 */
export const Stance = {
  stand: { halfHeight: PlayerConfig.capsuleHeight / 2, eye: PlayerConfig.eyeHeight },
  crouch: { halfHeight: 0.2, eye: PlayerConfig.crouchEyeHeight },
  slide: { halfHeight: 0.2, eye: PlayerConfig.slideEyeHeight },
  prone: { halfHeight: 0.06, eye: PlayerConfig.proneEyeHeight },
};

export const TimeConfig = {
  maxFrameDelta: 0.25, // clamp huge deltas (tab refocus) to avoid teleporting
};
