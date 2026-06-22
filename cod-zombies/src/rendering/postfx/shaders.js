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

/**
 * Depth-cavity ambient occlusion. A stable, noise-light approximation: for a
 * ring of neighbours, any that sit *in front* of the centre (within a metre
 * range) count as occluders, darkening crevices, corners and the contact line
 * where a body meets the floor. Multiplies the darkening straight into the
 * scene colour, so no separate composite pass is needed.
 */
export const SSAO_FRAG = /* glsl */ `
  #include <packing>
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform vec2 uTexel;
  uniform float uNear, uFar, uRadius, uIntensity, uBias, uPower;
  varying vec2 vUv;

  float lin(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }

  void main() {
    vec3 col = texture2D(tDiffuse, vUv).rgb;
    float dC = lin(vUv);
    if (dC >= uFar * 0.9) { gl_FragColor = vec4(col, 1.0); return; } // sky
    float pr = clamp(uRadius * 40.0 / dC, 3.0, 22.0); // ring radius in px, shrinks with distance
    float occ = 0.0;
    const int N = 8;
    for (int i = 0; i < N; i++) {
      float a = float(i) / float(N) * 6.2831853 + dC * 2.7; // depth-varied rotation
      vec2 o = vec2(cos(a), sin(a)) * uTexel * pr;
      float diff = dC - lin(vUv + o);          // >0 => neighbour is nearer (a crevice)
      if (diff > uBias) occ += clamp(1.0 - (diff - uBias) / uRadius, 0.0, 1.0);
    }
    occ = pow(clamp(occ / float(N), 0.0, 1.0), uPower) * uIntensity;
    gl_FragColor = vec4(col * clamp(1.0 - occ, 0.0, 1.0), 1.0);
  }
`;

/**
 * Ink / cel outlines (Persona 5 line-art). Sobel-ish edge detect on linear
 * depth: silhouettes come from first-derivative depth gaps, interior creases
 * from the second derivative (a depth "kink" with no gap). Thresholds scale with
 * distance so far geometry doesn't fur up. Lays near-black ink into the colour.
 */
export const OUTLINE_FRAG = /* glsl */ `
  #include <packing>
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform vec2 uTexel;
  uniform float uNear, uFar, uThickness, uDepthEdge, uNormalEdge, uStrength;
  uniform vec3 uColor;
  varying vec2 vUv;

  float lin(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }

  void main() {
    vec3 col = texture2D(tDiffuse, vUv).rgb;
    vec2 t = uTexel * uThickness;
    float c = lin(vUv);
    float l = lin(vUv - vec2(t.x, 0.0)), r = lin(vUv + vec2(t.x, 0.0));
    float u = lin(vUv - vec2(0.0, t.y)), d = lin(vUv + vec2(0.0, t.y));
    float norm = max(c, 1.0);
    float gap = (abs(c - l) + abs(c - r) + abs(c - u) + abs(c - d)) / norm;
    float crease = (abs(l + r - 2.0 * c) + abs(u + d - 2.0 * c)) / norm;
    float edge = max(smoothstep(0.0, 1.0, gap * uDepthEdge),
                     smoothstep(0.0, 1.0, crease * uNormalEdge * 6.0));
    edge = clamp(edge, 0.0, 1.0) * uStrength;
    gl_FragColor = vec4(mix(col, uColor, edge), 1.0);
  }
`;

/**
 * Camera motion blur. Reconstructs each pixel's world point from depth, projects
 * it through the previous frame's view-projection to find where it was on
 * screen, and smears the colour along that screen velocity. Camera-only (no
 * per-object velocity), which is exactly the sprint/turn smear we want.
 */
export const MOTIONBLUR_FRAG = /* glsl */ `
  #define MAXS 16
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform mat4 uInvViewProj;
  uniform mat4 uPrevViewProj;
  uniform float uStrength, uMax;
  uniform int uSamples;
  varying vec2 vUv;

  void main() {
    float d = texture2D(tDepth, vUv).x;
    vec4 clip = vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    vec4 wp = uInvViewProj * clip; wp /= wp.w;
    vec4 pp = uPrevViewProj * vec4(wp.xyz, 1.0); pp /= pp.w;
    vec2 prevUv = pp.xy * 0.5 + 0.5;
    vec2 vel = (vUv - prevUv) * uStrength;
    float vl = length(vel);
    if (vl > uMax) vel *= uMax / vl;
    vec3 col = texture2D(tDiffuse, vUv).rgb;
    float w = 1.0;
    for (int i = 1; i < MAXS; i++) {
      if (i >= uSamples) break;
      float s = float(i) / float(uSamples);
      col += texture2D(tDiffuse, vUv - vel * s).rgb;
      w += 1.0;
    }
    gl_FragColor = vec4(col / w, 1.0);
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
  uniform float uAspect;   // width/height — keeps the disc circular, not an egg
  varying vec2 vUv;
  void main() {
    float d = texture2D(tDepth, vUv).x;
    float sky = step(0.9999, d);                          // 1 where nothing drew
    vec2 dd = vUv - uSun;
    dd.x *= uAspect;                                       // aspect-correct to a circle
    float disc = smoothstep(uSize, 0.0, length(dd));
    gl_FragColor = vec4(vec3(disc * disc * sky), 1.0);    // tighter core (squared)
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
    float total = 1.0;
    for (int i = 0; i < SAMPLES; i++) {
      uv -= delta;
      illum *= uDecay;
      col += texture2D(tDiffuse, uv).rgb * illum * uWeight;
      total += illum * uWeight;
    }
    // normalise to a weighted average so shafts stay bounded (no white blowout)
    gl_FragColor = vec4(col / total, 1.0);
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
 * speed-line radial burst, bloom + god-ray adds, exposure/contrast/lift/gain/
 * temperature/saturation, split-toning, posterize+dither, vignette (with the
 * reactive low-health throb), rolling scanlines, animated grain, then the single
 * sRGB encode. `uSpeed`/`uReactive` are pushed live by the host each frame.
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

  uniform float uExposure, uContrast, uSaturation, uGamma, uTemperature, uSplit;
  uniform vec3 uLift, uGain, uShadowTint, uHighlightTint;
  uniform float uVigAmt, uVigSoft;
  uniform float uAberr;
  uniform float uGrain;
  uniform float uScan, uScanDensity, uScanScroll;
  uniform float uSpeed, uLines;     // kinetic burst (sprint/slide/kill/damage)
  uniform float uReactive;          // low-health vignette throb
  uniform float uPosterize, uDither;
  uniform vec3 uHeat[4];            // explosion heat sources: xy uv, z strength
  uniform int uHeatN;
  uniform float uHeatStrength;

  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  vec3 linearToSRGB(vec3 c) {
    c = max(c, 0.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }

  void main() {
    vec2 uv = vUv;
    vec2 toC = uv - 0.5;

    // heat haze — shimmer the scene-sampling coordinate near active explosions
    vec2 sUv = uv;
    if (uHeatN > 0) {
      for (int i = 0; i < 4; i++) {
        if (i >= uHeatN) break;
        float infl = uHeat[i].z * smoothstep(0.28, 0.0, distance(uv, uHeat[i].xy));
        sUv.x += sin(uv.y * 42.0 + uTime * 9.0) * infl * 0.010 * uHeatStrength;
        sUv.y += cos(uv.x * 42.0 + uTime * 8.0) * infl * 0.008 * uHeatStrength;
      }
    }

    // chromatic aberration — radial RGB split that ramps toward the edges
    vec3 col;
    if (uAberr > 0.0) {
      float amt = uAberr * 0.006 * dot(toC, toC) * 4.0;
      col.r = texture2D(tDiffuse, sUv - toC * amt).r;
      col.g = texture2D(tDiffuse, sUv).g;
      col.b = texture2D(tDiffuse, sUv + toC * amt).b;
    } else {
      col = texture2D(tDiffuse, sUv).rgb;
    }

    // Persona kinetic burst — radial blur toward centre + dark motion streaks at
    // the edges, driven live by sprint/slide/kill/damage intensity
    if (uSpeed > 0.0) {
      vec3 rb = col; float w = 1.0;
      for (int i = 1; i <= 6; i++) {
        rb += texture2D(tDiffuse, sUv - toC * (float(i) / 6.0) * 0.16 * uSpeed).rgb;
        w += 1.0;
      }
      col = mix(col, rb / w, uSpeed * 0.7);
      float ang = atan(toC.y, toC.x);
      float streak = 0.5 + 0.5 * sin(ang * 90.0);
      float edge = smoothstep(0.22, 0.6, length(toC));
      col *= 1.0 - streak * edge * uSpeed * uLines * 0.6;
    }

    // additive bloom + god rays (tinted by the key light's colour)
    col += texture2D(tBloom, uv).rgb * uBloom;
    if (uGod > 0.0) col += texture2D(tGod, uv).rgb * uGodColor * uGod;

    // exposure → contrast (around mid grey) → lift/gain → temperature
    col *= uExposure;
    col = (col - 0.5) * uContrast + 0.5;
    col = max(col, 0.0);
    // gamma / midtone lift: brightens shadows + midtones for visibility while
    // pinning true black at black (no milky wash) and white at white
    if (uGamma != 1.0) col = pow(col, vec3(1.0 / uGamma));
    col = col * uGain + uLift;
    col += vec3(uTemperature, 0.0, -uTemperature) * 0.05;

    // saturation
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(luma), col, uSaturation);

    // split toning: shadows toward teal, highlights toward amber
    vec3 split = mix(uShadowTint, uHighlightTint, smoothstep(0.0, 1.0, luma));
    col = mix(col, col * split, uSplit);

    col = max(col, 0.0);

    // graphic-novel posterize with a hash dither to break the colour bands
    if (uPosterize > 0.0) {
      float dth = hash(gl_FragCoord.xy) - 0.5;
      col += dth * (uDither / uPosterize);
      col = floor(col * uPosterize + 0.5) / uPosterize;
    }

    // vignette — base amount, deepened by the reactive (low-health) term
    float d = length(toC) * 1.41421;
    float vig = 1.0 - smoothstep(uVigSoft, 1.0, d);
    col *= mix(1.0, vig, clamp(uVigAmt + uReactive * 0.4, 0.0, 1.0));
    // low-health blood creep from the edges
    if (uReactive > 0.0) col = mix(col, col * vec3(1.0, 0.22, 0.18), uReactive * smoothstep(0.3, 1.0, d) * 0.7);

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
