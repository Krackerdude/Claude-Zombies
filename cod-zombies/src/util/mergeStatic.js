import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Static geometry merge — the core draw-call / scene-graph reduction tool.
 *
 * Walks a subtree and collapses its non-animated meshes into ONE merged mesh per
 * distinct MATERIAL LOOK (not per material object), baking each source mesh's
 * transform (relative to `root`) into the merged geometry. A procedural prop of
 * hundreds of little primitives — each historically its own mesh + its own
 * cloned material — becomes a handful of meshes sharing a few deduped materials.
 *
 * This is pure throughput: identical triangles, identical pixels, far fewer draw
 * calls, scene-graph nodes, materials and per-frame traversal. Because it bakes
 * transforms, only apply it to parts that DON'T move independently — mark any
 * animated mesh (or a subtree) with `userData.noMerge = true` to leave it alone.
 * `root` itself keeps its identity/transform, so a merged prop can still be
 * moved/rotated/toggled as a whole (e.g. the box gun that rises on a reveal).
 *
 * Returns { before, after } mesh counts for logging/verification.
 */

// A stable signature for a material's *look*, so two separately-created
// materials with the same appearance share one merged mesh + one material.
function materialSig(m) {
  if (!m || Array.isArray(m)) return null; // skip multi-material meshes
  const c = m.color ? m.color.getHexString() : 'none';
  const e = m.emissive ? m.emissive.getHexString() : 'none';
  return [
    m.type, c, e,
    m.roughness ?? '-', m.metalness ?? '-',
    m.transparent ? 't' : 'o', (m.opacity ?? 1).toFixed(2),
    m.side, m.blending, m.depthWrite ? 'dw' : 'nd', m.depthTest ? 'dt' : 'nt',
    m.map ? m.map.uuid : 'nomap', m.emissiveIntensity ?? '-', m.flatShading ? 'flat' : 'sm',
  ].join('|');
}

// Normalise a geometry to a common attribute set (position, normal, uv) so a
// batch of mixed primitives can be merged; anything missing gets a filler.
function normalizeGeo(src, matrix) {
  let g = src.clone();
  g.applyMatrix4(matrix);
  g.morphAttributes = {};
  if (g.index) g = g.toNonIndexed();          // uniform non-indexed batch → merge never mismatches
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const n = g.attributes.position.count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  // strip anything exotic that would break a uniform merge
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  }
  return g;
}

export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const _m = new THREE.Matrix4();

  const groups = new Map(); // sig -> { mat, geos:[], cast, receive }
  const originals = [];
  let before = 0;

  root.traverse((o) => {
    if (!o.isMesh) return;
    before++;
    if (o.userData?.noMerge) return;
    // don't merge across an animated ancestor
    for (let p = o; p && p !== root.parent; p = p.parent) if (p.userData?.noMerge) return;
    const sig = materialSig(o.material);
    if (!sig || !o.geometry || !o.geometry.attributes?.position) return;
    _m.multiplyMatrices(rootInv, o.matrixWorld);
    let geo;
    try { geo = normalizeGeo(o.geometry, _m); } catch { return; }
    let g = groups.get(sig);
    if (!g) { g = { mat: o.material, geos: [], cast: false, receive: false }; groups.set(sig, g); }
    g.geos.push(geo);
    g.cast = g.cast || o.castShadow;
    g.receive = g.receive || o.receiveShadow;
    originals.push(o);
  });

  if (!groups.size) return { before, after: before };

  // detach the originals we're replacing
  for (const o of originals) o.parent && o.parent.remove(o);

  let after = before - originals.length;
  for (const { mat, geos, cast, receive } of groups.values()) {
    let merged = null;
    try { merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false); } catch { merged = null; }
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = cast; mesh.receiveShadow = receive;
    mesh.raycast = () => {};        // merged static props aren't ray targets
    root.add(mesh);
    after++;
  }
  return { before, after };
}
