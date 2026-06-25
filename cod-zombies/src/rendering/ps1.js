/**
 * PS1-style vertex snapping. Real PlayStation hardware had no sub-pixel vertex
 * precision, so geometry visibly jitters as it moves — that telltale "wobble".
 * We reproduce it by quantizing the clip-space position to a coarse grid in the
 * vertex shader via onBeforeCompile (a WebGL hook; ignored under WebGPU's node
 * materials, which is why the renderer defaults to WebGL).
 *
 * Every compiled instance registers its snap uniform so the whole set can be
 * retuned at runtime from the Vertex Snapping option (toggle + amount slider)
 * via applyPS1() — no shader recompile. Disabling sets a grid so fine the snap
 * is sub-pixel (i.e. invisible).
 */

const _snapUniforms = [];
const NO_SNAP = 1e6; // grid so fine the quantization is sub-pixel = effectively off

/** Live state, driven by Settings (graphics.vertexSnap / vertexSnapAmount). */
export const PS1Config = { enabled: true, grid: 200 };

/**
 * @param {THREE.Material} material
 * @param {number} [grid] legacy arg — the live grid now comes from PS1Config so
 *   one global slider drives every snapped material uniformly.
 */
export function ps1Snap(material, grid) {
  void grid;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    const u = { value: PS1Config.enabled ? PS1Config.grid : NO_SNAP };
    shader.uniforms.uSnap = u;
    _snapUniforms.push(u);
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

/** Map the 0..1 "amount" slider to a snap grid (lower grid = chunkier wobble). */
export function ps1GridForAmount(amount) {
  const a = Math.max(0, Math.min(amount ?? 0.75, 1));
  return Math.round(600 - 540 * a); // 600 (subtle) .. 60 (heavy chunk)
}

/** Apply the toggle + grid live to every compiled snapped material. */
export function applyPS1(enabled, grid) {
  PS1Config.enabled = !!enabled;
  if (grid != null) PS1Config.grid = grid;
  const v = PS1Config.enabled ? PS1Config.grid : NO_SNAP;
  for (const u of _snapUniforms) u.value = v;
}
