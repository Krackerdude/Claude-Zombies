import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Service } from '../core/ServiceLocator.js';

/**
 * Animated night skydome — the source the volumetric shafts stream from and the
 * bright disc the bloom haloes. A big inverted sphere follows the camera so its
 * edge is never reached; a single fragment shader paints, per view direction:
 *
 *   - a deep night gradient (indigo horizon → near-black zenith),
 *   - a 3D twinkling star field (denser + brighter up high),
 *   - flowing AURORA BOREALIS curtains (green→teal→violet, domain-warped fbm that
 *     shimmers and drifts over time), and
 *   - a detailed glowing MOON aligned to the key light's direction, with maria
 *     surface detail, a bright HDR core (so it blooms) and a soft halo.
 *
 * Fog-immune and depth-write-off so real geometry always occludes it; excluded
 * from AO and never a bullet target. Purely presentation.
 */
export class SkySystem extends System {
  #mat = null;
  #mesh = null;
  #camera = null;
  #t = 0;

  init() {
    const sceneMgr = this.world.services.get(Service.Scene);
    const scene = sceneMgr.scene;
    const sun = sceneMgr.sun;

    // moon sits in the key light's direction, so the shafts appear to pour from it
    const moonDir = new THREE.Vector3(0, 1, 0);
    if (sun) moonDir.copy(sun.position).sub(sun.target.position).normalize();
    const moonColor = new THREE.Color(0xdfe6ff);

    this.#mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uMoonDir: { value: moonDir },
        uMoonColor: { value: new THREE.Vector3(moonColor.r, moonColor.g, moonColor.b) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vDir;
        uniform float uTime;
        uniform vec3 uMoonDir;
        uniform vec3 uMoonColor;

        float hash(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float vnoise(vec2 p){
          vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          float a=hash2(i), b=hash2(i+vec2(1,0)), c=hash2(i+vec2(0,1)), d=hash2(i+vec2(1,1));
          return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
        }
        float fbm(vec2 p){
          float v=0.0, a=0.5;
          for(int i=0;i<5;i++){ v+=a*vnoise(p); p*=2.02; a*=0.5; }
          return v;
        }

        void main(){
          vec3 dir = normalize(vDir);
          float up = clamp(dir.y, 0.0, 1.0);

          // --- night gradient ---
          vec3 horizon = vec3(0.020, 0.030, 0.060);
          vec3 zenith  = vec3(0.008, 0.012, 0.030);
          vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.8, up));
          // faint cool ground-glow rising from the horizon
          col += vec3(0.02,0.05,0.06) * smoothstep(0.25, -0.05, dir.y);

          // --- stars (3D cell hash; twinkle; denser up high) ---
          if (dir.y > -0.05) {
            vec3 sp = dir * 260.0;
            vec3 cell = floor(sp);
            float h = hash(cell);
            if (h > 0.982) {
              vec3 off = vec3(hash(cell+1.3), hash(cell+2.7), hash(cell+4.1)) - 0.5;
              float d = length(fract(sp) - 0.5 + off);
              float tw = 0.55 + 0.45*sin(uTime*2.5 + h*63.0);
              float star = smoothstep(0.28, 0.0, d) * tw;
              float warm = step(0.5, hash(cell+9.0));
              vec3 sc = mix(vec3(0.8,0.85,1.0), vec3(1.0,0.9,0.75), warm);
              col += sc * star * smoothstep(-0.05, 0.5, dir.y) * 1.8;
            }
          }

          // --- aurora borealis: drifting, domain-warped curtains in the mid sky ---
          if (dir.y > 0.015) {
            vec2 auv = dir.xz / dir.y;              // planar projection (curtains hang vertical)
            float aur = 0.0;
            for (int i = 0; i < 3; i++) {
              float fi = float(i);
              vec2 w = vec2(fbm(auv*0.5 + uTime*0.03 + fi), fbm(auv*0.5 - uTime*0.025 - fi)); // domain warp
              vec2 p = auv*(0.7 + fi*0.5) + w*0.8 + vec2(uTime*(0.03+0.012*fi), 0.0);
              float n = fbm(p);
              aur += pow(max(0.0, n - 0.12), 2.1) * (1.0 - fi*0.2);   // higher threshold + contrast → distinct curtains, dark gaps
            }
            // band-limit to the mid sky and shape a soft vertical falloff
            aur *= smoothstep(0.02, 0.26, dir.y) * smoothstep(1.5, 0.34, dir.y);
            float ramp = fbm(auv*0.4 + uTime*0.02);
            vec3 aurCol = mix(vec3(0.10,1.00,0.55), vec3(0.45,0.20,1.00), clamp(ramp,0.0,1.0));
            aurCol = mix(aurCol, vec3(0.15,0.90,0.80), 0.35);   // teal midtone
            col += aurCol * aur * 1.35;
          }

          // --- moon (aligned to the key light) ---
          float md = dot(dir, normalize(uMoonDir));
          float ang = acos(clamp(md, -1.0, 1.0));
          float R = 0.05;                             // angular radius (rad)
          float disc = smoothstep(R, R*0.92, ang);
          // maria/crater surface detail across the disc — keep the disc from
          // clipping so the darker seas actually read against the bright face
          vec2 muv = dir.xy * 22.0 + dir.z * 7.0;
          float surf = fbm(muv)*0.6 + fbm(muv*2.3)*0.4;   // 0..1
          float shade = 0.45 + 0.85 * surf;               // ~0.45 (maria) .. 1.3 (highlands)
          vec3 moonSurf = uMoonColor * shade;
          col = mix(col, moonSurf, disc);
          // only the very centre goes HDR-hot (for a tight bloom kernel), so the
          // rest of the disc keeps its detail instead of blowing out to white
          float core = smoothstep(R*0.55, 0.0, ang);
          col += uMoonColor * core * 0.5;
          // soft outer halo
          float halo = smoothstep(R*6.0, R, ang);
          col += uMoonColor * halo*halo * 0.28;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const geo = new THREE.SphereGeometry(220, 48, 32);
    this.#mesh = new THREE.Mesh(geo, this.#mat);
    this.#mesh.renderOrder = -1000;      // paint first, behind everything
    this.#mesh.frustumCulled = false;
    this.#mesh.raycast = () => {};       // never a bullet/FX target
    // (no markNoAO: depthWrite:false leaves sky at far depth, which AO already
    //  skips — and tagging it would blanket the whole AO-exclusion mask white)
    scene.add(this.#mesh);

    // drop the flat background colour — the dome covers every direction now
    scene.background = null;

    const render = this.world.services.has(Service.Render) ? this.world.services.get(Service.Render) : null;
    this.#camera = render?.camera ?? null;
  }

  update(dt) {
    this.#t += dt;
    if (this.#mat) this.#mat.uniforms.uTime.value = this.#t;
    // keep the dome centred on the eye so its edge is never reached
    if (this.#mesh && this.#camera) this.#mesh.position.copy(this.#camera.position);
  }

  dispose() {
    this.#mesh?.geometry.dispose();
    this.#mat?.dispose();
    this.#mesh?.removeFromParent();
  }
}
