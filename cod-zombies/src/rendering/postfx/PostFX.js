import * as THREE from 'three';
import { PostFXConfig } from '../../config/index.js';
import { NO_AO_LAYER, VIEWMODEL_LAYER } from '../aoMask.js';
import {
  FULLSCREEN_VERT, COPY_FRAG, DOF_FRAG, BRIGHT_FRAG, BLUR_FRAG, FINAL_FRAG,
  GODRAY_SOURCE_FRAG, GODRAY_BLUR_FRAG, AO_FRAG, AO_BLUR_FRAG, AO_APPLY_FRAG, AO_VM_APPLY_FRAG, OUTLINE_FRAG, MOTIONBLUR_FRAG,
  VOLUMETRIC_MARCH_FRAG, VOLUMETRIC_COMPOSITE_FRAG,
} from './shaders.js';

/**
 * Self-contained stylized post-processing pipeline. Deliberately hand-rolled
 * (no EffectComposer) so the viewmodel overlay can be composited *between*
 * stages: the world is processed first, THEN the first-person gun is drawn sharp
 * on top, THEN the screen-space grade covers everything. That keeps the gun
 * crisp/unbloomed while the world melts into PS2-horror murk behind it.
 *
 * Pipeline per frame (each stage gateable):
 *   world → rtScene(+depth)
 *        → [SSAO] → [outline] → [motion blur] → [DOF]   (all read the world depth)
 *        → rtWork → [+ gun overlay] → [bloom] → [god rays] → grade → screen
 *
 * `enabled = false` (or a non-WebGL backend) makes RenderManager bypass this
 * entirely, so the overhaul can never regress the baseline path.
 */
export class PostFX {
  enabled = false;

  #renderer;
  #params;
  #w = 1;
  #h = 1;

  // render targets
  #rtScene = null;  // world colour + depth texture (the chain's depth source)
  #rtNormal = null; // world view-space normals (normal prepass) for AO
  #rtAOMask = null; // white where AO is excluded (emissive parts + FX)
  #rtA = null;      // full-res ping for the world-processing chain
  #rtB = null;      // full-res pong
  #rtWork = null;   // working colour buffer with a depth buffer for the gun
  #rtAOa = null;    // half-res AO ping (occlusion + denoise)
  #rtAOb = null;    // half-res AO pong
  #rtVmNormal = null; // viewmodel-only normals + depth (dedicated viewmodel AO)
  #rtVmAO = null;   // full-res viewmodel AO (the gun is the hero — no half-res blotch)
  #rtVmAOb = null;  // full-res viewmodel AO scratch (denoise)
  #rtBloomA = null; // half-res bloom ping
  #rtBloomB = null; // half-res bloom pong
  #rtGod = null;    // half-res god-ray accumulation buffer
  #rtVolA = null;   // half-res HDR volumetric scatter (march output)
  #rtVolB = null;   // half-res HDR volumetric scratch (denoise, later phases)
  #normalMat = null; // MeshNormalMaterial override for the normal prepass
  #maskMesh = null; #maskSprite = null; // solid-white stand-ins for the AO mask pass

  // volumetric key-light descriptor (world space), pushed each frame by RenderManager
  #volSunDir = new THREE.Vector3(0, 1, 0);
  #volSunColor = new THREE.Color(1, 1, 1);
  #sunLight = null;
  #volFrame = 0;

  // fullscreen quad
  #quadScene;
  #quadCam;
  #quad;
  #black; // 1×1 black fallback for the bloom/god slots when disabled

  // stage materials
  #mCopy; #mDof; #mBright; #mBlur; #mFinal; #mGodSrc; #mGodBlur; #mAO; #mAOBlur; #mAOApply; #mVmAO; #mVmBlur; #mVmApply; #mOutline; #mMotion; #mVolMarch; #mVolComposite;

  // motion-blur matrices
  #curVP = new THREE.Matrix4();
  #prevVP = new THREE.Matrix4();
  #invVP = new THREE.Matrix4();
  #prevInit = false;

  #speedEnabled = true;

  constructor(renderer, params = PostFXConfig) {
    this.#renderer = renderer;
    this.#params = params;
    this.enabled = !!params.enabled;

    this.#quadScene = new THREE.Scene();
    this.#quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.#quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.#quad.frustumCulled = false;
    this.#quadScene.add(this.#quad);

    this.#black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.#black.needsUpdate = true;

    this.#buildMaterials();

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.setSize(size.x, size.y);
  }

  #shader(frag, uniforms) {
    return new THREE.ShaderMaterial({
      uniforms, vertexShader: FULLSCREEN_VERT, fragmentShader: frag,
      depthTest: false, depthWrite: false,
    });
  }

  #buildMaterials() {
    this.#mCopy = this.#shader(COPY_FRAG, { tDiffuse: { value: null } });

    this.#mDof = this.#shader(DOF_FRAG, {
      tDiffuse: { value: null }, tDepth: { value: null },
      uTexel: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 1000 },
      uFocusDist: { value: 4 }, uFocusRange: { value: 2.4 }, uMaxBlur: { value: 1 },
      uBokeh: { value: 2.6 }, uAutofocus: { value: 1 },
    });

    // normals-based AO: occlusion pass (reads depth + normal prepass), a
    // separable depth-aware blur, and an apply pass that multiplies into colour
    this.#normalMat = new THREE.MeshNormalMaterial();
    // solid-white stand-ins for the AO-exclusion mask: tagged objects are swapped
    // to these so ANY covered pixel writes full alpha (faint FX included), and
    // depthTest off so nothing suppresses the coverage. Sprites need a sprite
    // material to keep their billboard; meshes/points use the basic one.
    this.#maskMesh = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, depthTest: false, depthWrite: false });
    this.#maskSprite = new THREE.SpriteMaterial({ color: 0xffffff, fog: false, depthTest: false, depthWrite: false });
    this.#mAO = this.#shader(AO_FRAG, {
      tDepth: { value: null }, tNormal: { value: null }, uTexel: { value: new THREE.Vector2() },
      uNear: { value: 0.3 }, uFar: { value: 250 }, uP00: { value: 1 }, uP11: { value: 1 },
      uRadius: { value: 0.6 }, uIntensity: { value: 1.0 }, uBias: { value: 0.02 }, uPower: { value: 1.5 },
    });
    this.#mAOBlur = this.#shader(AO_BLUR_FRAG, {
      tAO: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() },
      uDir: { value: new THREE.Vector2() }, uNear: { value: 0.3 }, uFar: { value: 250 },
    });
    this.#mAOApply = this.#shader(AO_APPLY_FRAG, {
      tDiffuse: { value: null }, tAO: { value: null }, tDepth: { value: null }, tMask: { value: null },
      uAOTexel: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 250 },
    });
    // dedicated viewmodel AO: same occlusion shader tuned to viewmodel scale, + apply
    this.#mVmAO = this.#shader(AO_FRAG, {
      tDepth: { value: null }, tNormal: { value: null }, uTexel: { value: new THREE.Vector2() },
      uNear: { value: 0.1 }, uFar: { value: 250 }, uP00: { value: 1 }, uP11: { value: 1 },
      uRadius: { value: 0.09 }, uIntensity: { value: 1.1 }, uBias: { value: 0.008 }, uPower: { value: 1.4 },
    });
    this.#mVmBlur = this.#shader(AO_BLUR_FRAG, {
      tAO: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() },
      uDir: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 250 },
    });
    this.#mVmApply = this.#shader(AO_VM_APPLY_FRAG, {
      tDiffuse: { value: null }, tAO: { value: null }, tDepth: { value: null },
      uAOTexel: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 250 },
    });

    this.#mOutline = this.#shader(OUTLINE_FRAG, {
      tDiffuse: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() },
      uNear: { value: 0.1 }, uFar: { value: 1000 },
      uThickness: { value: 1 }, uDepthEdge: { value: 1.1 }, uNormalEdge: { value: 0.7 },
      uStrength: { value: 0.9 }, uColor: { value: new THREE.Vector3(0.02, 0.02, 0.03) },
    });

    this.#mMotion = this.#shader(MOTIONBLUR_FRAG, {
      tDiffuse: { value: null }, tDepth: { value: null },
      uInvViewProj: { value: new THREE.Matrix4() }, uPrevViewProj: { value: new THREE.Matrix4() },
      uStrength: { value: 0.5 }, uMax: { value: 0.04 }, uSamples: { value: 8 },
    });

    this.#mBright = this.#shader(BRIGHT_FRAG, { tDiffuse: { value: null }, uThreshold: { value: 0.62 } });
    this.#mBlur = this.#shader(BLUR_FRAG, { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } });

    this.#mGodSrc = this.#shader(GODRAY_SOURCE_FRAG, {
      tDepth: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) },
      uSize: { value: 0.06 }, uAspect: { value: 1 },
    });
    this.#mGodBlur = this.#shader(GODRAY_BLUR_FRAG, {
      tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) },
      uDensity: { value: 0.6 }, uWeight: { value: 0.5 }, uDecay: { value: 0.95 },
    });

    this.#mVolMarch = this.#shader(VOLUMETRIC_MARCH_FRAG, {
      tDepth: { value: null },
      uNear: { value: 0.1 }, uFar: { value: 250 }, uP00: { value: 1 }, uP11: { value: 1 },
      uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Vector3(1, 1, 1) },
      uSunScatter: { value: 1.5 }, uHG: { value: 0.72 },
      uSunShadow: { value: null }, uSunMatrix: { value: new THREE.Matrix4() },
      uSunHasShadow: { value: 0 }, uSunBias: { value: 0.0015 },
      uFogDensity: { value: 0.06 }, uFogHeight: { value: 0.12 }, uFogY0: { value: 0 },
      uAmbient: { value: new THREE.Vector3(0.05, 0.06, 0.09) },
      uMaxDist: { value: 60 }, uSteps: { value: 40 }, uFrame: { value: 0 },
    });
    this.#mVolComposite = this.#shader(VOLUMETRIC_COMPOSITE_FRAG, {
      tScene: { value: null }, tVol: { value: null }, tDepth: { value: null },
      uVolTexel: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 250 },
      uIntensity: { value: 1 },
    });

    this.#mFinal = this.#shader(FINAL_FRAG, {
      tDiffuse: { value: null }, tBloom: { value: this.#black }, uBloom: { value: 0 },
      tGod: { value: this.#black }, uGod: { value: 0 }, uGodColor: { value: new THREE.Vector3(1, 1, 1) },
      uResolution: { value: new THREE.Vector2() }, uTime: { value: 0 },
      uExposure: { value: 1 }, uContrast: { value: 1.12 }, uSaturation: { value: 1.14 },
      uGamma: { value: 1 }, uTemperature: { value: 0 }, uSplit: { value: 0.18 },
      uLift: { value: new THREE.Vector3() }, uGain: { value: new THREE.Vector3(1, 1, 1) },
      uShadowTint: { value: new THREE.Vector3() }, uHighlightTint: { value: new THREE.Vector3() },
      uVigAmt: { value: 0.55 }, uVigSoft: { value: 0.45 },
      uAberr: { value: 0.3 }, uGrain: { value: 0.14 },
      uScan: { value: 0.5 }, uScanDensity: { value: 2.4 }, uScanScroll: { value: 0.4 },
      uSpeed: { value: 0 }, uLines: { value: 0.7 }, uReactive: { value: 0 },
      uPosterize: { value: 0 }, uDither: { value: 0 },
      uHeat: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
      uHeatN: { value: 0 }, uHeatStrength: { value: 1 },
    });

    this.applyParams(this.#params);
  }

  /** (Re)allocate render targets at the given drawing-buffer resolution. */
  setSize(w, h) {
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));
    if (w === this.#w && h === this.#h && this.#rtScene) return;
    this.#w = w; this.#h = h;

    this.#disposeTargets();

    const color = () => ({
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
      colorSpace: THREE.LinearSRGBColorSpace, depthBuffer: true, stencilBuffer: false,
    });

    const depthTex = new THREE.DepthTexture(w, h);
    depthTex.format = THREE.DepthFormat;
    depthTex.type = THREE.UnsignedIntType;
    this.#rtScene = new THREE.WebGLRenderTarget(w, h, { ...color(), depthTexture: depthTex });
    this.#rtWork = new THREE.WebGLRenderTarget(w, h, color());
    // normal prepass target — needs its own depth buffer so the nearest surface's
    // normal wins (matches rtScene's depth for the same camera/frame)
    this.#rtNormal = new THREE.WebGLRenderTarget(w, h, { ...color(), depthBuffer: true });
    this.#rtAOMask = new THREE.WebGLRenderTarget(w, h, { ...color(), depthBuffer: true });
    const chainCol = { ...color(), depthBuffer: false };
    this.#rtA = new THREE.WebGLRenderTarget(w, h, chainCol);
    this.#rtB = new THREE.WebGLRenderTarget(w, h, chainCol);

    const hw = Math.max(1, Math.floor(w / 2));
    const hh = Math.max(1, Math.floor(h / 2));
    const bcol = { ...color(), depthBuffer: false };
    this.#rtAOa = new THREE.WebGLRenderTarget(hw, hh, bcol); // AO computed + denoised at half res
    this.#rtAOb = new THREE.WebGLRenderTarget(hw, hh, bcol);
    // viewmodel AO: full-res normals (+ own depth texture) → half-res AO
    const vmDepthTex = new THREE.DepthTexture(w, h);
    vmDepthTex.format = THREE.DepthFormat; vmDepthTex.type = THREE.UnsignedIntType;
    this.#rtVmNormal = new THREE.WebGLRenderTarget(w, h, { ...color(), depthTexture: vmDepthTex });
    this.#rtVmAO = new THREE.WebGLRenderTarget(w, h, { ...color(), depthBuffer: false });
    this.#rtVmAOb = new THREE.WebGLRenderTarget(w, h, { ...color(), depthBuffer: false });
    this.#rtBloomA = new THREE.WebGLRenderTarget(hw, hh, bcol);
    this.#rtBloomB = new THREE.WebGLRenderTarget(hw, hh, bcol);
    this.#rtGod = new THREE.WebGLRenderTarget(hw, hh, bcol);
    // volumetric scatter: HDR half-res so bright shafts survive to bloom
    const volCol = { ...color(), type: THREE.HalfFloatType, depthBuffer: false };
    this.#rtVolA = new THREE.WebGLRenderTarget(hw, hh, volCol);
    this.#rtVolB = new THREE.WebGLRenderTarget(hw, hh, volCol);
    this.#mVolComposite.uniforms.uVolTexel.value.set(1 / hw, 1 / hh);

    const texel = new THREE.Vector2(1 / w, 1 / h);
    const halfTexel = new THREE.Vector2(1 / hw, 1 / hh);
    this.#mFinal.uniforms.uResolution.value.set(w, h);
    this.#mDof.uniforms.uTexel.value.copy(texel);
    this.#mAO.uniforms.uTexel.value.copy(halfTexel);
    this.#mAOBlur.uniforms.uTexel.value.copy(halfTexel);
    this.#mAOApply.uniforms.uAOTexel.value.copy(halfTexel);
    this.#mVmAO.uniforms.uTexel.value.copy(texel);     // full-res: crisp on the gun
    this.#mVmBlur.uniforms.uTexel.value.copy(texel);
    this.#mVmApply.uniforms.uAOTexel.value.copy(texel);
    this.#mOutline.uniforms.uTexel.value.copy(texel);
    this.#mGodSrc.uniforms.uAspect.value = w / h;
  }

  /** Push config values into the live uniforms. Safe to call every settings change. */
  applyParams(params) {
    this.#params = params;
    this.enabled = !!params.enabled;

    const f = this.#mFinal.uniforms;
    const g = params.grade ?? {};
    f.uExposure.value = g.exposure ?? 1;
    f.uContrast.value = g.contrast ?? 1.12;
    f.uGamma.value = g.gamma ?? 1;
    f.uSaturation.value = g.saturation ?? 1.14;
    f.uTemperature.value = g.temperature ?? 0;
    f.uSplit.value = (g.enabled === false) ? 0 : (g.splitToning ?? 0.18);
    f.uLift.value.fromArray(g.lift ?? [0, 0, 0]);
    f.uGain.value.fromArray(g.gain ?? [1, 1, 1]);
    f.uShadowTint.value.fromArray(g.shadowTint ?? [1, 1, 1]);
    f.uHighlightTint.value.fromArray(g.highlightTint ?? [1, 1, 1]);
    if (g.enabled === false) {
      f.uContrast.value = 1; f.uSaturation.value = 1; f.uTemperature.value = 0;
      f.uExposure.value = 1; f.uGamma.value = 1; f.uGain.value.set(1, 1, 1); f.uLift.value.set(0, 0, 0);
    }

    const vig = params.vignette ?? {};
    f.uVigAmt.value = vig.enabled === false ? 0 : (vig.amount ?? 0.55);
    f.uVigSoft.value = vig.softness ?? 0.45;

    const ab = params.aberration ?? {};
    f.uAberr.value = ab.enabled === false ? 0 : (ab.amount ?? 0.3);

    const grn = params.grain ?? {};
    f.uGrain.value = grn.enabled === false ? 0 : (grn.amount ?? 0.14);

    const sc = params.scanlines ?? {};
    f.uScan.value = sc.enabled === false ? 0 : (sc.amount ?? 0.5);
    f.uScanDensity.value = sc.density ?? 2.4;
    f.uScanScroll.value = sc.scroll ?? 0.4;

    const post = params.posterize ?? {};
    f.uPosterize.value = post.enabled === false ? 0 : (post.levels ?? 24);
    const di = params.dither ?? {};
    f.uDither.value = di.enabled === false ? 0 : (di.amount ?? 0.6);
    f.uLines.value = params.speedlines?.lines ?? 0.7;
    this.#speedEnabled = params.speedlines?.enabled !== false;
    if (!this.#speedEnabled) f.uSpeed.value = 0;

    const dof = params.dof ?? {};
    const d = this.#mDof.uniforms;
    d.uAutofocus.value = dof.autofocus === false ? 0 : 1;
    d.uFocusDist.value = dof.focusDistance ?? 4;
    d.uFocusRange.value = dof.focusRange ?? 2.4;
    d.uMaxBlur.value = dof.maxBlur ?? 1;
    d.uBokeh.value = dof.bokehRadius ?? 2.6;

    const ao = params.ssao ?? {}; const a = this.#mAO.uniforms;
    a.uRadius.value = ao.radius ?? 0.6; a.uIntensity.value = ao.intensity ?? 1.0;
    a.uBias.value = ao.bias ?? 0.02; a.uPower.value = ao.power ?? 1.5;

    const vao = params.viewmodelAO ?? {}; const va = this.#mVmAO.uniforms;
    va.uRadius.value = vao.radius ?? 0.09; va.uIntensity.value = vao.intensity ?? 1.1;
    va.uBias.value = vao.bias ?? 0.008; va.uPower.value = vao.power ?? 1.4;

    const ol = params.outline ?? {}; const o = this.#mOutline.uniforms;
    o.uThickness.value = ol.thickness ?? 1; o.uDepthEdge.value = ol.depthEdge ?? 1.1;
    o.uNormalEdge.value = ol.normalEdge ?? 0.7; o.uStrength.value = ol.strength ?? 0.9;
    o.uColor.value.fromArray(ol.color ?? [0.02, 0.02, 0.03]);

    const mb = params.motionBlur ?? {}; const m = this.#mMotion.uniforms;
    m.uStrength.value = mb.strength ?? 0.5; m.uMax.value = mb.max ?? 0.04;
    m.uSamples.value = Math.max(2, mb.samples ?? 8);

    this.#mBright.uniforms.uThreshold.value = params.bloom?.threshold ?? 0.62;

    const god = params.godrays ?? {};
    this.#mGodSrc.uniforms.uSize.value = god.size ?? 0.18;
    this.#mGodBlur.uniforms.uDensity.value = god.density ?? 0.6;
    this.#mGodBlur.uniforms.uWeight.value = god.weight ?? 0.5;
    this.#mGodBlur.uniforms.uDecay.value = god.decay ?? 0.95;

    const vol = params.volumetric ?? {}; const vm = this.#mVolMarch.uniforms;
    vm.uSteps.value = Math.max(4, Math.min(128, vol.steps ?? 40));
    vm.uMaxDist.value = vol.maxDistance ?? 60;
    vm.uFogDensity.value = vol.fogDensity ?? 0.06;
    vm.uFogHeight.value = vol.fogHeight ?? 0.12;
    vm.uFogY0.value = vol.fogY0 ?? 0;
    vm.uAmbient.value.fromArray(vol.ambient ?? [0.05, 0.06, 0.09]);
    vm.uSunScatter.value = vol.sunScatter ?? 1.5;
    vm.uHG.value = Math.max(0, Math.min(0.95, vol.anisotropy ?? 0.72));
    this.#mVolComposite.uniforms.uIntensity.value = vol.intensity ?? 1;
  }

  /** World-space key-light descriptor for the volumetric pass, pushed each frame
   *  by RenderManager (the screen `sun` descriptor is gated by on-screen-ness; the
   *  shafts need the sun's world direction + colour regardless of where it is). */
  setSun(dir, color, light = null) {
    if (dir) this.#volSunDir.copy(dir).normalize();
    if (color) this.#volSunColor.copy(color);
    this.#sunLight = light; // its shadow map + matrix carve the occluded shafts
  }

  /** Active heat-haze sources: array of { x, y, strength } in screen uv (≤4). */
  setHeat(sources) {
    const u = this.#mFinal.uniforms;
    const heatOn = this.#params.heatHaze?.enabled !== false;
    const n = heatOn ? Math.min(4, sources.length) : 0;
    for (let i = 0; i < n; i++) u.uHeat.value[i].set(sources[i].x, sources[i].y, sources[i].strength);
    u.uHeatN.value = n;
    u.uHeatStrength.value = this.#params.heatHaze?.strength ?? 1;
  }

  /** Persona kinetic burst intensity (0..1) — sprint/slide/kill/damage. */
  setSpeedlines(v) { this.#mFinal.uniforms.uSpeed.value = this.#speedEnabled ? Math.max(0, Math.min(1, v)) : 0; }
  /** Reactive low-health vignette throb (0..1). */
  setReactive(v) { this.#mFinal.uniforms.uReactive.value = Math.max(0, Math.min(1, v)); }
  /** Live grade override hook (state-driven palette). Partial { contrast, saturation, ... }. */
  setGrade(o) {
    const f = this.#mFinal.uniforms;
    if (o.contrast != null) f.uContrast.value = o.contrast;
    if (o.saturation != null) f.uSaturation.value = o.saturation;
    if (o.temperature != null) f.uTemperature.value = o.temperature;
    if (o.split != null) f.uSplit.value = o.split;
    if (o.shadowTint) f.uShadowTint.value.fromArray(o.shadowTint);
    if (o.highlightTint) f.uHighlightTint.value.fromArray(o.highlightTint);
  }

  #blit(material, target) {
    this.#quad.material = material;
    this.#renderer.setRenderTarget(target ?? null);
    this.#renderer.render(this.#quadScene, this.#quadCam);
  }

  render(worldScene, worldCamera, overlayScene, overlayCamera, sun = null) {
    const r = this.#renderer;
    const p = this.#params;
    const prevAutoClear = r.autoClear;
    const prevTarget = r.getRenderTarget();
    const near = worldCamera.near, far = worldCamera.far;

    const aoOn = p.ssao?.enabled !== false && (p.ssao?.intensity ?? 0) > 0;

    // 1) world → rtScene (writes the depth texture every chain stage reads)
    r.autoClear = true;
    r.setRenderTarget(this.#rtScene);
    r.render(worldScene, worldCamera);
    const depth = this.#rtScene.depthTexture;

    if (aoOn) {
      // collect every AO-excluded object once (emissive parts + FX) for the two
      // off-screen passes below
      const tagged = [];
      worldScene.traverse((o) => {
        if ((o.isMesh || o.isSprite || o.isPoints || o.isLine) && (o.layers.mask & (1 << NO_AO_LAYER)) !== 0) tagged.push(o);
      });
      const prevOverride = worldScene.overrideMaterial;
      // suppress the scene background for these off-screen passes — otherwise it
      // paints an opaque fullscreen fill (alpha 1 everywhere), which would blanket
      // the AO-exclusion mask and disable AO across the whole frame.
      const prevBg = worldScene.background;
      worldScene.background = null;

      // 1b) normal prepass → rtNormal (view-space normals for the AO). HIDE the
      // excluded objects: otherwise the override makes transparent FX (light beams,
      // smoke) opaque in the normal buffer while they wrote NO depth in the colour
      // pass — that P/N mismatch is what smears AO into beam-shaped blobs. With them
      // hidden, normals stay consistent with depth (the opaque geometry behind).
      const vis = tagged.map((o) => o.visible);
      for (const o of tagged) o.visible = false;
      worldScene.overrideMaterial = this.#normalMat;
      r.setRenderTarget(this.#rtNormal);
      r.clear();
      r.render(worldScene, worldCamera);
      worldScene.overrideMaterial = prevOverride;
      for (let i = 0; i < tagged.length; i++) tagged[i].visible = vis[i];

      // 1c) AO-exclusion mask → rtAOMask: swap the excluded objects to a SOLID
      // white stand-in and render only them (layer-filtered) onto a transparent
      // clear. Solid white → any covered pixel writes full alpha regardless of the
      // FX's real (often faint) opacity, and sprites keep their billboard.
      const mats = tagged.map((o) => o.material);
      for (const o of tagged) o.material = o.isSprite ? this.#maskSprite : this.#maskMesh;
      const prevLayer = worldCamera.layers.mask;
      const prevClear = r.getClearColor(new THREE.Color()).getHex();
      const prevAlpha = r.getClearAlpha();
      worldCamera.layers.set(NO_AO_LAYER);
      r.setRenderTarget(this.#rtAOMask);
      r.setClearColor(0x000000, 0);
      r.clear();
      r.render(worldScene, worldCamera);
      worldCamera.layers.mask = prevLayer;
      r.setClearColor(prevClear, prevAlpha);
      for (let i = 0; i < tagged.length; i++) tagged[i].material = mats[i];

      // 1d) viewmodel normal prepass → rtVmNormal: render ONLY the viewmodel layer
      // (gun + hands + props) with view normals into its OWN buffer (+ depth). The
      // dedicated viewmodel AO computed from this self-shadows the gun without ever
      // touching the world's depth, so no ghosting.
      if (p.viewmodelAO?.enabled !== false) {
        worldScene.overrideMaterial = this.#normalMat;
        worldCamera.layers.set(VIEWMODEL_LAYER);
        r.setRenderTarget(this.#rtVmNormal);
        r.clear();
        r.render(worldScene, worldCamera);
        worldCamera.layers.mask = prevLayer;
        worldScene.overrideMaterial = prevOverride;
      }
      worldScene.background = prevBg;
    }

    // 2) world-processing chain, ping-ponging rtA/rtB
    let srcTex = this.#rtScene.texture;
    let ping = this.#rtA, pong = this.#rtB;
    const run = (mat) => {
      mat.uniforms.tDiffuse.value = srcTex;
      if (mat.uniforms.tDepth) mat.uniforms.tDepth.value = depth;
      this.#blit(mat, ping);
      srcTex = ping.texture;
      const t = ping; ping = pong; pong = t;
    };

    // Alchemy AO: occlusion at half res → depth-aware bilateral denoise → multiply
    // into the colour chain. Uses real view normals so it doesn't stripe/halo.
    if (aoOn) {
      const proj = worldCamera.projectionMatrix.elements;
      const a = this.#mAO.uniforms;
      a.uNear.value = near; a.uFar.value = far; a.uP00.value = proj[0]; a.uP11.value = proj[5];
      a.tDepth.value = depth; a.tNormal.value = this.#rtNormal.texture;
      this.#blit(this.#mAO, this.#rtAOa);
      // separable bilateral blur (H then V), depth-guided
      const b = this.#mAOBlur.uniforms;
      b.uNear.value = near; b.uFar.value = far; b.tDepth.value = depth;
      b.tAO.value = this.#rtAOa.texture; b.uDir.value.set(1, 0);
      this.#blit(this.#mAOBlur, this.#rtAOb);
      b.tAO.value = this.#rtAOb.texture; b.uDir.value.set(0, 1);
      this.#blit(this.#mAOBlur, this.#rtAOa);
      // apply: depth-guided upsample + emissive mask, colour *= AO (chain step)
      const ap = this.#mAOApply.uniforms;
      ap.uNear.value = near; ap.uFar.value = far; ap.tDepth.value = depth;
      ap.tDiffuse.value = srcTex; ap.tAO.value = this.#rtAOa.texture;
      ap.tMask.value = this.#rtAOMask.texture;
      this.#blit(this.#mAOApply, ping);
      srcTex = ping.texture;
      const t = ping; ping = pong; pong = t;
    }

    // Dedicated viewmodel AO: occlusion from the viewmodel-only buffer → denoise →
    // multiply into the gun/hands. Self-shadows at the gun's scale (tiny radius),
    // no ghosting since the buffer never sees the world. No-op when no viewmodel is
    // on-screen (the buffer is empty → AO is 1 everywhere).
    if (aoOn && p.viewmodelAO?.enabled !== false) {
      const proj = worldCamera.projectionMatrix.elements;
      const vd = this.#rtVmNormal.depthTexture;
      const v = this.#mVmAO.uniforms;
      v.uNear.value = near; v.uFar.value = far; v.uP00.value = proj[0]; v.uP11.value = proj[5];
      v.tDepth.value = vd; v.tNormal.value = this.#rtVmNormal.texture;
      this.#blit(this.#mVmAO, this.#rtVmAO);
      // full-res bilateral denoise (dedicated material + scratch)
      const b = this.#mVmBlur.uniforms;
      b.uNear.value = near; b.uFar.value = far; b.tDepth.value = vd;
      b.tAO.value = this.#rtVmAO.texture; b.uDir.value.set(1, 0);
      this.#blit(this.#mVmBlur, this.#rtVmAOb);
      b.tAO.value = this.#rtVmAOb.texture; b.uDir.value.set(0, 1);
      this.#blit(this.#mVmBlur, this.#rtVmAO);
      // apply: colour *= viewmodel AO (1.0 off the gun, so world is untouched)
      const vp = this.#mVmApply.uniforms;
      vp.uNear.value = near; vp.uFar.value = far; vp.tDepth.value = vd;
      vp.tDiffuse.value = srcTex; vp.tAO.value = this.#rtVmAO.texture;
      this.#blit(this.#mVmApply, ping);
      srcTex = ping.texture;
      const t = ping; ping = pong; pong = t;
    }

    if (p.outline?.enabled !== false && (p.outline?.strength ?? 0) > 0) {
      this.#mOutline.uniforms.uNear.value = near; this.#mOutline.uniforms.uFar.value = far;
      run(this.#mOutline);
    }

    // motion blur — track the camera's view-projection across frames
    this.#curVP.multiplyMatrices(worldCamera.projectionMatrix, worldCamera.matrixWorldInverse);
    if (p.motionBlur?.enabled !== false && (p.motionBlur?.strength ?? 0) > 0) {
      this.#invVP.copy(this.#curVP).invert();
      this.#mMotion.uniforms.uInvViewProj.value.copy(this.#invVP);
      this.#mMotion.uniforms.uPrevViewProj.value.copy(this.#prevInit ? this.#prevVP : this.#curVP);
      run(this.#mMotion);
    }
    this.#prevVP.copy(this.#curVP); this.#prevInit = true; // keep current so toggling never pops

    const dofOn = p.dof?.enabled !== false && p.dof?.maxBlur !== 0;
    if (dofOn) {
      this.#mDof.uniforms.uNear.value = near; this.#mDof.uniforms.uFar.value = far;
      run(this.#mDof);
    }

    // 3) land the processed world in the depth-backed work buffer
    this.#mCopy.uniforms.tDiffuse.value = srcTex;
    this.#blit(this.#mCopy, this.#rtWork);

    // 3.5) VOLUMETRIC LIGHTING — march in-scattering (half-res, HDR), then fog the
    //      world by its transmittance and add the shafts. Done BEFORE the gun
    //      overlay so the first-person weapon stays crisp/clear of fog, and before
    //      bloom so bright beams bloom softly. rtA/rtB are free here (chain done).
    if (p.volumetric?.enabled !== false && (p.volumetric?.intensity ?? 0) > 0 && this.#rtVolA) {
      const vm = this.#mVolMarch.uniforms;
      vm.tDepth.value = depth;
      vm.uNear.value = near; vm.uFar.value = far;
      vm.uP00.value = worldCamera.projectionMatrix.elements[0];
      vm.uP11.value = worldCamera.projectionMatrix.elements[5];
      vm.uCamWorld.value.copy(worldCamera.matrixWorld);
      vm.uCamPos.value.setFromMatrixPosition(worldCamera.matrixWorld);
      vm.uSunDir.value.copy(this.#volSunDir);
      vm.uSunColor.value.set(this.#volSunColor.r, this.#volSunColor.g, this.#volSunColor.b);
      vm.uFrame.value = (this.#volFrame = (this.#volFrame + 1) & 63);
      // reuse the key light's Three.js shadow map to occlude the shafts — real
      // beams carved by geometry. FX (castShadow=false) never pollute it.
      const sm = this.#sunLight?.shadow?.map?.texture ?? null;
      vm.uSunHasShadow.value = sm ? 1 : 0;
      vm.uSunShadow.value = sm || this.#black;
      if (sm) vm.uSunMatrix.value.copy(this.#sunLight.shadow.matrix);
      this.#blit(this.#mVolMarch, this.#rtVolA);       // → half-res scatter

      const vc = this.#mVolComposite.uniforms;
      vc.tScene.value = this.#rtWork.texture; vc.tVol.value = this.#rtVolA.texture;
      vc.tDepth.value = depth; vc.uNear.value = near; vc.uFar.value = far;
      this.#blit(this.#mVolComposite, this.#rtA);      // fog world + add shafts → rtA
      this.#mCopy.uniforms.tDiffuse.value = this.#rtA.texture;
      this.#blit(this.#mCopy, this.#rtWork);           // back into the work buffer
    }

    // composite the first-person gun on top (clear of fog)
    if (overlayScene) {
      r.autoClear = false;
      r.setRenderTarget(this.#rtWork);
      r.clearDepth();
      r.render(overlayScene, overlayCamera || worldCamera);
      r.autoClear = true;
    }

    // 4) bloom (half-res bright-pass + ping-pong gaussian)
    let bloomI = 0;
    if (p.bloom?.enabled !== false && (p.bloom?.intensity ?? 0) > 0) {
      this.#mBright.uniforms.tDiffuse.value = this.#rtWork.texture;
      this.#blit(this.#mBright, this.#rtBloomA);
      const hw = this.#rtBloomA.width, hh = this.#rtBloomA.height;
      const radius = p.bloom?.radius ?? 1;
      const iters = Math.max(1, p.bloom?.iterations ?? 3);
      let a = this.#rtBloomA, b = this.#rtBloomB;
      for (let i = 0; i < iters; i++) {
        this.#mBlur.uniforms.tDiffuse.value = a.texture;
        this.#mBlur.uniforms.uDir.value.set(radius / hw, 0);
        this.#blit(this.#mBlur, b);
        this.#mBlur.uniforms.tDiffuse.value = b.texture;
        this.#mBlur.uniforms.uDir.value.set(0, radius / hh);
        this.#blit(this.#mBlur, a);
      }
      this.#mFinal.uniforms.tBloom.value = a.texture;
      bloomI = p.bloom?.intensity ?? 0.85;
    } else {
      this.#mFinal.uniforms.tBloom.value = this.#black;
    }

    // 5) god rays — disc at the key light's screen position, masked to sky depth
    let godI = 0;
    if (sun && p.godrays?.enabled !== false && (p.godrays?.intensity ?? 0) > 0) {
      this.#mGodSrc.uniforms.tDepth.value = depth;
      this.#mGodSrc.uniforms.uSun.value.set(sun.x, sun.y);
      this.#blit(this.#mGodSrc, this.#rtBloomB);
      this.#mGodBlur.uniforms.tDiffuse.value = this.#rtBloomB.texture;
      this.#mGodBlur.uniforms.uSun.value.set(sun.x, sun.y);
      this.#blit(this.#mGodBlur, this.#rtGod);
      this.#mFinal.uniforms.tGod.value = this.#rtGod.texture;
      this.#mFinal.uniforms.uGodColor.value.set(sun.color[0], sun.color[1], sun.color[2]);
      godI = (p.godrays?.intensity ?? 0.55) * sun.strength;
    } else {
      this.#mFinal.uniforms.tGod.value = this.#black;
    }

    // 6) final composite + grade → screen
    this.#mFinal.uniforms.tDiffuse.value = this.#rtWork.texture;
    this.#mFinal.uniforms.uBloom.value = bloomI;
    this.#mFinal.uniforms.uGod.value = godI;
    this.#mFinal.uniforms.uTime.value = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    this.#blit(this.#mFinal, null);

    r.autoClear = prevAutoClear;
    r.setRenderTarget(prevTarget);
  }

  #disposeTargets() {
    this.#rtScene?.depthTexture?.dispose();
    this.#rtScene?.dispose();
    this.#rtNormal?.dispose();
    this.#rtAOMask?.dispose();
    this.#rtA?.dispose();
    this.#rtB?.dispose();
    this.#rtWork?.dispose();
    this.#rtAOa?.dispose();
    this.#rtAOb?.dispose();
    this.#rtVmNormal?.depthTexture?.dispose();
    this.#rtVmNormal?.dispose();
    this.#rtVmAO?.dispose();
    this.#rtVmAOb?.dispose();
    this.#rtVolA?.dispose();
    this.#rtVolB?.dispose();
    this.#rtBloomA?.dispose();
    this.#rtBloomB?.dispose();
    this.#rtGod?.dispose();
  }

  dispose() {
    this.#disposeTargets();
    this.#black?.dispose();
    this.#normalMat?.dispose();
    this.#maskMesh?.dispose();
    this.#maskSprite?.dispose();
    this.#quad.geometry.dispose();
    for (const m of [this.#mCopy, this.#mDof, this.#mBright, this.#mBlur, this.#mFinal,
      this.#mGodSrc, this.#mGodBlur, this.#mAO, this.#mAOBlur, this.#mAOApply, this.#mVmAO, this.#mVmApply, this.#mOutline, this.#mMotion]) m?.dispose();
  }
}
