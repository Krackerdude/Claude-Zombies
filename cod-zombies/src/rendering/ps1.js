/**
 * PS1-style vertex snapping. Real PlayStation hardware had no sub-pixel vertex
 * precision, so geometry visibly jitters as it moves — that telltale "wobble".
 * We reproduce it by quantizing the clip-space position to a coarse grid in the
 * vertex shader via onBeforeCompile (a WebGL hook; ignored under WebGPU's node
 * materials, which is why the renderer defaults to WebGL).
 *
 * @param {THREE.Material} material
 * @param {number} grid lower = chunkier wobble (≈ vertical "resolution")
 */
export function ps1Snap(material, grid = 200) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSnap = { value: grid };
    shader.vertexShader =
      'uniform float uSnap;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 snapped = gl_Position;
          snapped.xyz /= snapped.w;            // to NDC
          snapped.xy = floor(snapped.xy * uSnap) / uSnap; // quantize
          snapped.xyz *= snapped.w;            // back to clip space
          gl_Position = snapped;
        }`,
      );
  };
  material.needsUpdate = true;
  return material;
}
