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
