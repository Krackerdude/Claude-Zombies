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
  near: 0.1,
  far: 1000,
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
    threshold: 0.62,     // luminance above which a pixel blooms
    intensity: 0.85,     // additive strength of the bloom buffer
    radius: 1.0,         // blur spread multiplier
    iterations: 3,       // gaussian H/V passes (more = softer/wider)
  },

  // --- god rays: light shafts streaming from the moon past the rooftops ---
  // Minimal + atmospheric. The source is a soft disc at the key light's screen
  // position, masked to background (sky) pixels so geometry occludes the shafts.
  godrays: {
    enabled: true,
    size: 0.05,          // uv radius of the (aspect-corrected, circular) moon disc
    density: 0.55,       // radial step scale (longer = reaches further)
    weight: 0.4,         // per-sample contribution (blur is normalised, so bounded)
    decay: 0.93,         // falloff along the shaft
    intensity: 0.5,      // additive strength in the final composite
  },

  // --- colour grade: the Persona identity lives here ---
  grade: {
    enabled: true,
    exposure: 1.0,       // multiplied on top of the renderer's tone-map exposure
    contrast: 1.12,      // S-curve contrast around mid grey
    saturation: 1.14,    // global saturation push
    temperature: 0.0,    // -1 cool .. +1 warm overall tint
    lift: [0.02, 0.03, 0.05],   // shadows pushed cool/blue (RGB add)
    gain: [1.04, 1.00, 0.96],   // highlights pulled warm (RGB mul)
    // duotone-ish split toning: shadows toward teal, highlights toward amber
    shadowTint: [0.20, 0.42, 0.55],
    highlightTint: [1.00, 0.78, 0.45],
    splitToning: 0.18,   // 0..1 how strongly the split tint is mixed in
  },

  // --- ambient occlusion: a depth-cavity darkening that grounds geometry,
  // sinks corners + where zombies meet the floor into shadow (readability) ---
  ssao: {
    enabled: true,
    radius: 0.55,        // metres — depth gap that counts as a crevice
    intensity: 1.15,     // darkening strength
    bias: 0.025,         // ignore tiny depth diffs (no self-occlusion shimmer)
    power: 1.6,          // contrast of the occlusion falloff
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
    strength: 0.5,       // 0..1 smear amount
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
  dither: { enabled: true, amount: 0.6 },      // ordered dither to break the bands

  // --- screen-space horror flavour (overhauled from the old CSS overlay) ---
  vignette: { enabled: true, amount: 0.55, softness: 0.45 },
  aberration: { enabled: true, amount: 0.3 },   // radial RGB split, edge-weighted
  grain: { enabled: true, amount: 0.14, animated: true }, // animated film grain
  scanlines: { enabled: true, amount: 0.5, density: 2.4, scroll: 0.4 }, // CRT roll
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
  max: 56,             // pooled decals; oldest recycled beyond this
  bloodLife: 38,       // seconds a blood pool persists before it has faded
  scorchLife: 55,      // seconds a scorch/burn persists
};

/**
 * Silent-Hill weather. Rain is a GPU streak field that follows the player; the
 * WeatherSystem also drives occasional lightning that strobes the fog + key
 * light, and a low ground-mist band. All isolated + disable-able.
 */
export const WeatherConfig = {
  rain: {
    enabled: true,
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
