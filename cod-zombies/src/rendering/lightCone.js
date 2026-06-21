import * as THREE from 'three';

/**
 * A dusty volumetric light cone for a practical lamp — an additive shader cone,
 * bright at the bulb (apex) and fading down + out to soft edges, with a faint
 * gutter shimmer. Depth-tested so walls occlude the beam; never raycast against
 * (bullets/FX ignore it). Pure decoration; the AtmosphereSystem ticks its time
 * uniform and gates visibility.
 */
const CONE_VERT = /* glsl */ `
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CONE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength, uHalf, uRadius, uTime;
  varying vec3 vLocal;
  void main() {
    float h = clamp((vLocal.y / uHalf) * 0.5 + 0.5, 0.0, 1.0);   // 0 base -> 1 apex
    float radial = 1.0 - clamp(length(vLocal.xz) / uRadius, 0.0, 1.0);
    float flick = 0.9 + 0.1 * sin(uTime * 7.0 + vLocal.y * 3.0);
    float a = pow(h, 0.7) * radial * radial * uStrength * flick;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

export function buildLightCone({ color = 0xffae5c, radius = 1.2, height = 3.0, strength = 0.5 } = {}) {
  const geo = new THREE.ConeGeometry(radius, height, 20, 1, true); // open-ended, apex up
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uStrength: { value: strength },
      uHalf: { value: height / 2 },
      uRadius: { value: radius },
      uTime: { value: 0 },
    },
    vertexShader: CONE_VERT,
    fragmentShader: CONE_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.coneMat = mat;
  mesh.renderOrder = 3;
  mesh.raycast = () => {};
  return mesh;
}
