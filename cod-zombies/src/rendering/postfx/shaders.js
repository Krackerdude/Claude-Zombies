/**
 * GLSL for the stylized post-processing stack. Kept as plain source strings so
 * the PostFX orchestrator owns all the THREE wiring (materials, uniforms, RTs)
 * and this file stays a readable shader reference. Everything runs on a single
 * full-screen triangle/quad in clip space — no model matrices involved.
 *
 * Colour-management note: the world + viewmodel are rendered into linear-light
 * render targets with the renderer's ACES tone-map already applied per-material.
 * Every stage here works in that linear space; ONLY the final composite encodes
 * to sRGB for the screen (so there is exactly one encode, no double-gamma).
 */

export const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** Straight copy — used to land the world colour in a depth-backed work buffer. */
export const COPY_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  varying vec2 vUv;
  void main() { gl_FragColor = texture2D(tDiffuse, vUv); }
`;

/**
 * Depth-of-field. Autofocuses on whatever sits under screen-centre, then melts
 * everything outside a tolerance band around that focal depth into a soft bokeh
 * disk. This is the "near subject crisp, world dissolves into murk" look.
 */
export const DOF_FRAG = /* glsl */ `
  #include <packing>
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform vec2 uTexel;
  uniform float uNear, uFar;
  uniform float uFocusDist, uFocusRange, uMaxBlur, uBokeh;
  uniform int uAutofocus;
  varying vec2 vUv;

  float linDepth(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    float viewZ = perspectiveDepthToViewZ(d, uNear, uFar);
    return -viewZ; // positive metres from the eye
  }

  void main() {
    float focus = uAutofocus == 1 ? linDepth(vec2(0.5)) : uFocusDist;
    float depth = linDepth(vUv);
    float coc = clamp((abs(depth - focus) - uFocusRange) / max(uFocusRange, 0.001), 0.0, 1.0) * uMaxBlur;

    vec3 col = texture2D(tDiffuse, vUv).rgb;
    if (coc > 0.001) {
      vec3 sum = col;
      float wsum = 1.0;
      // two offset rings (6 + 6 taps) — cheap but smooth
      for (int i = 0; i < 12; i++) {
        float a = float(i) * 0.5236;          // 30° steps
        float r = i < 6 ? 0.6 : 1.0;
        vec2 off = vec2(cos(a), sin(a)) * uTexel * uBokeh * coc * r;
        sum += texture2D(tDiffuse, vUv + off).rgb;
        wsum += 1.0;
      }
      col = sum / wsum;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Bright-pass: keep only the energy above the bloom threshold. */
export const BRIGHT_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float k = max(0.0, l - uThreshold) / max(l, 1e-4);
    gl_FragColor = vec4(c * k, 1.0);
  }
`;

/**
 * God-ray source: a soft light disc at the key light's screen position, but only
 * where the scene depth is at the far plane (background / sky between the
 * rooftops). Geometry therefore occludes the shafts, so they stream past wall
 * edges and through window gaps instead of glowing over everything.
 */
export const GODRAY_SOURCE_FRAG = /* glsl */ `
  uniform sampler2D tDepth;
  uniform vec2 uSun;
  uniform float uSize;
  varying vec2 vUv;
  void main() {
    float d = texture2D(tDepth, vUv).x;
    float sky = step(0.9999, d);                          // 1 where nothing drew
    float disc = smoothstep(uSize, 0.0, distance(vUv, uSun));
    gl_FragColor = vec4(vec3(disc * sky), 1.0);
  }
`;

/** Radial blur of the source toward the light — the classic shaft accumulation. */
export const GODRAY_BLUR_FRAG = /* glsl */ `
  #define SAMPLES 24
  uniform sampler2D tDiffuse;
  uniform vec2 uSun;
  uniform float uDensity, uWeight, uDecay;
  varying vec2 vUv;
  void main() {
    vec2 delta = (vUv - uSun) * (uDensity / float(SAMPLES));
    vec2 uv = vUv;
    vec3 col = texture2D(tDiffuse, uv).rgb;
    float illum = 1.0;
    for (int i = 0; i < SAMPLES; i++) {
      uv -= delta;
      col += texture2D(tDiffuse, uv).rgb * illum * uWeight;
      illum *= uDecay;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Separable 9-tap gaussian (run once per axis, ping-ponged for wider blur). */
export const BLUR_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uDir;
  varying vec2 vUv;
  void main() {
    vec3 s = texture2D(tDiffuse, vUv).rgb * 0.227027;
    s += texture2D(tDiffuse, vUv + uDir * 1.3846).rgb * 0.316216;
    s += texture2D(tDiffuse, vUv - uDir * 1.3846).rgb * 0.316216;
    s += texture2D(tDiffuse, vUv + uDir * 3.2308).rgb * 0.070270;
    s += texture2D(tDiffuse, vUv - uDir * 3.2308).rgb * 0.070270;
    gl_FragColor = vec4(s, 1.0);
  }
`;

/**
 * Final composite + Persona-flavoured grade. In order: chromatic aberration,
 * bloom add, exposure/contrast/lift/gain/temperature/saturation, split-toning,
 * vignette, rolling scanlines, animated grain, then the single sRGB encode.
 */
export const FINAL_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tBloom;
  uniform float uBloom;
  uniform sampler2D tGod;
  uniform float uGod;
  uniform vec3 uGodColor;
  uniform vec2 uResolution;
  uniform float uTime;

  uniform float uExposure, uContrast, uSaturation, uTemperature, uSplit;
  uniform vec3 uLift, uGain, uShadowTint, uHighlightTint;
  uniform float uVigAmt, uVigSoft;
  uniform float uAberr;
  uniform float uGrain;
  uniform float uScan, uScanDensity, uScanScroll;

  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  vec3 linearToSRGB(vec3 c) {
    c = max(c, 0.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }

  void main() {
    vec2 uv = vUv;
    vec2 toC = uv - 0.5;

    // chromatic aberration — radial RGB split that ramps toward the edges
    vec3 col;
    if (uAberr > 0.0) {
      float amt = uAberr * 0.006 * dot(toC, toC) * 4.0;
      col.r = texture2D(tDiffuse, uv - toC * amt).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv + toC * amt).b;
    } else {
      col = texture2D(tDiffuse, uv).rgb;
    }

    // additive bloom
    col += texture2D(tBloom, uv).rgb * uBloom;

    // god rays (tinted by the key light's colour)
    if (uGod > 0.0) col += texture2D(tGod, uv).rgb * uGodColor * uGod;

    // exposure → contrast (around mid grey) → lift/gain → temperature
    col *= uExposure;
    col = (col - 0.5) * uContrast + 0.5;
    col = col * uGain + uLift;
    col += vec3(uTemperature, 0.0, -uTemperature) * 0.05;

    // saturation
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(luma), col, uSaturation);

    // split toning: shadows toward teal, highlights toward amber
    vec3 split = mix(uShadowTint, uHighlightTint, smoothstep(0.0, 1.0, luma));
    col = mix(col, col * split, uSplit);

    col = max(col, 0.0);

    // vignette
    float d = length(toC) * 1.41421;
    float vig = 1.0 - smoothstep(uVigSoft, 1.0, d);
    col *= mix(1.0, vig, uVigAmt);

    // rolling scanlines
    if (uScan > 0.0) {
      float sl = sin(uv.y * uResolution.y * uScanDensity + uTime * uScanScroll * 6.2831);
      col *= 1.0 - uScan * 0.12 * (0.5 + 0.5 * sl);
    }

    // animated film grain
    if (uGrain > 0.0) {
      float g = hash(uv * uResolution + fract(uTime) * 97.13);
      col += (g - 0.5) * uGrain * 0.18;
    }

    gl_FragColor = vec4(linearToSRGB(col), 1.0);
  }
`;
