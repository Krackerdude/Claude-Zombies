import * as THREE from 'three';

/**
 * Fresnel rim light, injected into a MeshStandardMaterial via onBeforeCompile.
 * A cold edge glow along silhouettes so the dead read against the murk — cheap
 * (a few fragment ALU), no extra pass. Composes with any existing onBeforeCompile
 * (e.g. the PS1 vertex snap) by chaining it rather than overwriting.
 *
 * Every compiled instance registers its intensity uniform so the whole set can
 * be dimmed/lit at runtime (settings toggle) via setRimIntensity().
 */
const _rimUniforms = [];

export function addRimLight(material, { color = 0x9fb4ff, power = 2.6, intensity = 0.55 } = {}) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uRimColor = { value: new THREE.Color(color) };
    shader.uniforms.uRimPower = { value: power };
    const ui = { value: intensity };
    shader.uniforms.uRimIntensity = ui;
    _rimUniforms.push(ui);
    shader.fragmentShader =
      'uniform vec3 uRimColor;\nuniform float uRimPower;\nuniform float uRimIntensity;\n' +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 rN = normalize(vNormal);
          vec3 rV = normalize(vViewPosition);          // fragment -> camera (view space)
          float rim = pow(1.0 - clamp(dot(rN, rV), 0.0, 1.0), uRimPower);
          totalEmissiveRadiance += uRimColor * rim * uRimIntensity;
        }`,
      );
  };
  material.needsUpdate = true;
  return material;
}

/** Set the rim strength on every compiled rim material (0 = off). */
export function setRimIntensity(v) {
  for (const u of _rimUniforms) u.value = v;
}
