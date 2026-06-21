import * as THREE from 'three';
import { PostFXConfig } from '../../config/index.js';
import {
  FULLSCREEN_VERT, COPY_FRAG, DOF_FRAG, BRIGHT_FRAG, BLUR_FRAG, FINAL_FRAG,
  GODRAY_SOURCE_FRAG, GODRAY_BLUR_FRAG,
} from './shaders.js';

/**
 * Self-contained stylized post-processing pipeline. Deliberately hand-rolled
 * (no EffectComposer) so the viewmodel overlay can be composited *between*
 * stages: the world is graded/DOF'd/bloomed first, THEN the first-person gun is
 * drawn sharp on top, THEN the screen-space grade (grain/vignette/aberration/
 * scanlines) covers everything. That ordering keeps the gun crisp and unbloomed
 * while the world melts into PS2-horror murk behind it.
 *
 * Pipeline per frame (when enabled):
 *   world → rtScene(+depth) → [DOF] → rtWork → [+ gun overlay] → [bloom] → grade → screen
 *
 * Everything is gateable for performance. `enabled = false` (or a non-WebGL
 * backend) makes RenderManager bypass this entirely and draw straight to screen,
 * so the overhaul can never regress the baseline path.
 */
export class PostFX {
  enabled = false;

  #renderer;
  #params;
  #w = 1;
  #h = 1;

  // render targets
  #rtScene = null;  // world colour + depth texture (DOF source)
  #rtWork = null;   // working colour buffer with a depth buffer for the gun
  #rtBloomA = null; // half-res bloom ping
  #rtBloomB = null; // half-res bloom pong
  #rtGod = null;    // half-res god-ray accumulation buffer

  // fullscreen quad
  #quadScene;
  #quadCam;
  #quad;
  #black; // 1×1 black fallback for the bloom slot when disabled

  // stage materials
  #mCopy; #mDof; #mBright; #mBlur; #mFinal; #mGodSrc; #mGodBlur;

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
      uniforms,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: frag,
      depthTest: false,
      depthWrite: false,
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

    this.#mBright = this.#shader(BRIGHT_FRAG, {
      tDiffuse: { value: null }, uThreshold: { value: 0.62 },
    });

    this.#mBlur = this.#shader(BLUR_FRAG, {
      tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() },
    });

    this.#mGodSrc = this.#shader(GODRAY_SOURCE_FRAG, {
      tDepth: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) },
      uSize: { value: 0.06 }, uAspect: { value: 1 },
    });
    this.#mGodBlur = this.#shader(GODRAY_BLUR_FRAG, {
      tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) },
      uDensity: { value: 0.6 }, uWeight: { value: 0.5 }, uDecay: { value: 0.95 },
    });

    this.#mFinal = this.#shader(FINAL_FRAG, {
      tDiffuse: { value: null }, tBloom: { value: this.#black }, uBloom: { value: 0 },
      tGod: { value: this.#black }, uGod: { value: 0 }, uGodColor: { value: new THREE.Vector3(1, 1, 1) },
      uResolution: { value: new THREE.Vector2() }, uTime: { value: 0 },
      uExposure: { value: 1 }, uContrast: { value: 1.12 }, uSaturation: { value: 1.14 },
      uTemperature: { value: 0 }, uSplit: { value: 0.18 },
      uLift: { value: new THREE.Vector3() }, uGain: { value: new THREE.Vector3(1, 1, 1) },
      uShadowTint: { value: new THREE.Vector3() }, uHighlightTint: { value: new THREE.Vector3() },
      uVigAmt: { value: 0.55 }, uVigSoft: { value: 0.45 },
      uAberr: { value: 0.3 }, uGrain: { value: 0.14 },
      uScan: { value: 0.5 }, uScanDensity: { value: 2.4 }, uScanScroll: { value: 0.4 },
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

    const hw = Math.max(1, Math.floor(w / 2));
    const hh = Math.max(1, Math.floor(h / 2));
    const bcol = { ...color(), depthBuffer: false };
    this.#rtBloomA = new THREE.WebGLRenderTarget(hw, hh, bcol);
    this.#rtBloomB = new THREE.WebGLRenderTarget(hw, hh, bcol);
    this.#rtGod = new THREE.WebGLRenderTarget(hw, hh, bcol);

    this.#mFinal.uniforms.uResolution.value.set(w, h);
    this.#mDof.uniforms.uTexel.value.set(1 / w, 1 / h);
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
    f.uSaturation.value = g.saturation ?? 1.14;
    f.uTemperature.value = g.temperature ?? 0;
    f.uSplit.value = (g.enabled === false) ? 0 : (g.splitToning ?? 0.18);
    f.uLift.value.fromArray(g.lift ?? [0, 0, 0]);
    f.uGain.value.fromArray(g.gain ?? [1, 1, 1]);
    f.uShadowTint.value.fromArray(g.shadowTint ?? [1, 1, 1]);
    f.uHighlightTint.value.fromArray(g.highlightTint ?? [1, 1, 1]);
    if (g.enabled === false) { // grade off: neutral pass-through
      f.uContrast.value = 1; f.uSaturation.value = 1; f.uTemperature.value = 0;
      f.uExposure.value = 1; f.uGain.value.set(1, 1, 1); f.uLift.value.set(0, 0, 0);
    }

    const vig = params.vignette ?? {};
    f.uVigAmt.value = vig.enabled === false ? 0 : (vig.amount ?? 0.55);
    f.uVigSoft.value = vig.softness ?? 0.45;

    const ab = params.aberration ?? {};
    f.uAberr.value = ab.enabled === false ? 0 : (ab.amount ?? 0.3);

    const gr = params.grain ?? {};
    f.uGrain.value = gr.enabled === false ? 0 : (gr.amount ?? 0.14);

    const sc = params.scanlines ?? {};
    f.uScan.value = sc.enabled === false ? 0 : (sc.amount ?? 0.5);
    f.uScanDensity.value = sc.density ?? 2.4;
    f.uScanScroll.value = sc.scroll ?? 0.4;

    const dof = params.dof ?? {};
    const d = this.#mDof.uniforms;
    d.uAutofocus.value = dof.autofocus === false ? 0 : 1;
    d.uFocusDist.value = dof.focusDistance ?? 4;
    d.uFocusRange.value = dof.focusRange ?? 2.4;
    d.uMaxBlur.value = dof.maxBlur ?? 1;
    d.uBokeh.value = dof.bokehRadius ?? 2.6;

    this.#mBright.uniforms.uThreshold.value = params.bloom?.threshold ?? 0.62;

    const god = params.godrays ?? {};
    this.#mGodSrc.uniforms.uSize.value = god.size ?? 0.18;
    this.#mGodBlur.uniforms.uDensity.value = god.density ?? 0.6;
    this.#mGodBlur.uniforms.uWeight.value = god.weight ?? 0.5;
    this.#mGodBlur.uniforms.uDecay.value = god.decay ?? 0.95;
  }

  #blit(material, target) {
    this.#quad.material = material;
    this.#renderer.setRenderTarget(target ?? null);
    this.#renderer.render(this.#quadScene, this.#quadCam);
  }

  /**
   * Run the full pipeline. worldScene/worldCamera draw the world; the optional
   * overlayScene/overlayCamera (the viewmodel) are composited sharp on top.
   * `sun` (or null) is { x, y, strength, color:[r,g,b] } in screen-uv space,
   * supplied by RenderManager from the key light — it drives the god rays.
   */
  render(worldScene, worldCamera, overlayScene, overlayCamera, sun = null) {
    const r = this.#renderer;
    const p = this.#params;
    const prevAutoClear = r.autoClear;
    const prevTarget = r.getRenderTarget();

    // keep camera-dependent uniforms current
    this.#mDof.uniforms.uNear.value = worldCamera.near;
    this.#mDof.uniforms.uFar.value = worldCamera.far;

    // 1) world → rtScene (writes the depth texture DOF reads)
    r.autoClear = true;
    r.setRenderTarget(this.#rtScene);
    r.render(worldScene, worldCamera);

    // 2) DOF (or straight copy) → rtWork
    const dofOn = p.dof?.enabled !== false && p.dof?.maxBlur !== 0;
    if (dofOn) {
      this.#mDof.uniforms.tDiffuse.value = this.#rtScene.texture;
      this.#mDof.uniforms.tDepth.value = this.#rtScene.depthTexture;
      this.#blit(this.#mDof, this.#rtWork);
    } else {
      this.#mCopy.uniforms.tDiffuse.value = this.#rtScene.texture;
      this.#blit(this.#mCopy, this.#rtWork);
    }

    // 3) composite the viewmodel sharp on top of the graded world
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

    // 5) god rays — disc at the key light's screen position, masked to sky
    //    depth, radial-blurred into shafts. Only when the light is on-screen.
    let godI = 0;
    if (sun && p.godrays?.enabled !== false && (p.godrays?.intensity ?? 0) > 0) {
      this.#mGodSrc.uniforms.tDepth.value = this.#rtScene.depthTexture;
      this.#mGodSrc.uniforms.uSun.value.set(sun.x, sun.y);
      this.#blit(this.#mGodSrc, this.#rtBloomB); // reuse pong as the source buffer
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
    this.#rtWork?.dispose();
    this.#rtBloomA?.dispose();
    this.#rtBloomB?.dispose();
    this.#rtGod?.dispose();
  }

  dispose() {
    this.#disposeTargets();
    this.#black?.dispose();
    this.#quad.geometry.dispose();
    for (const m of [this.#mCopy, this.#mDof, this.#mBright, this.#mBlur, this.#mFinal, this.#mGodSrc, this.#mGodBlur]) m?.dispose();
  }
}
