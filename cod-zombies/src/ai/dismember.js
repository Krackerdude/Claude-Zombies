import * as THREE from 'three';

/**
 * Visual dismemberment: hide a limb's whole joint sub-tree on a zombie rig and
 * cap the socket with a grotesque gore wound. Pure presentation — the gameplay
 * limb state lives on ZombieTag.limbs; this just makes the body match it. Reused
 * for both live zombies and (later) their corpses.
 *
 * The wound is built from a cluster of irregular pieces so it reads as torn meat
 * rather than a clean cap: dark wet blood, brighter exposed muscle, splintered
 * white bone shards, and dangling sinew/entrails.
 */

// shoulder / hip socket positions in the parent joint's local space (must match
// zombieRig: arms attach at torso (±0.235, 0.42), legs at hips (±0.1, -0.02))
const SOCKET = {
  armL: { parent: 'torso', x: -0.235, y: 0.42, z: 0 },
  armR: { parent: 'torso', x: 0.235, y: 0.42, z: 0 },
  legL: { parent: 'hips', x: -0.1, y: -0.02, z: 0 },
  legR: { parent: 'hips', x: 0.1, y: -0.02, z: 0 },
};
const JOINT = { armL: 'shoulderL', armR: 'shoulderR', legL: 'thighL', legR: 'thighR' };

// --- shared materials: wet, grotesque palette ---------------------------------
let _mats = null;
function mats() {
  if (_mats) return _mats;
  _mats = {
    // glistening dark blood / outer wound
    blood: new THREE.MeshStandardMaterial({ color: 0x3a0404, roughness: 0.28, metalness: 0.05 }),
    // raw exposed muscle, brighter and wetter
    muscle: new THREE.MeshStandardMaterial({ color: 0x8a1212, roughness: 0.35, metalness: 0.04 }),
    // pale viscera / fat
    fat: new THREE.MeshStandardMaterial({ color: 0xb6745a, roughness: 0.5 }),
    // splintered bone — slightly pink at the marrow
    bone: new THREE.MeshStandardMaterial({ color: 0xe8ddc2, roughness: 0.78 }),
    marrow: new THREE.MeshStandardMaterial({ color: 0x9c5a5a, roughness: 0.6 }),
    // wet ropey entrails
    gut: new THREE.MeshStandardMaterial({ color: 0x6e1414, roughness: 0.22, metalness: 0.06 }),
  };
  return _mats;
}

const _chunkGeo = new THREE.BoxGeometry(1, 1, 1);
const _rnd = (s) => (Math.random() - 0.5) * s;

/** An irregular meat chunk: a unit box scaled/rotated/placed randomly. */
function chunk(mat, x, y, z, sx, sy, sz, jitter = 0.5) {
  const m = new THREE.Mesh(_chunkGeo, mat);
  m.position.set(x + _rnd(jitter * 0.1), y + _rnd(jitter * 0.1), z + _rnd(jitter * 0.1));
  m.scale.set(sx * (1 + _rnd(0.4)), sy * (1 + _rnd(0.4)), sz * (1 + _rnd(0.4)));
  m.rotation.set(_rnd(jitter), _rnd(jitter), _rnd(jitter));
  return m;
}

/** A splinter of bone poking out of a wound at a jagged angle. */
function shard(M, x, y, z, len, dir) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(_chunkGeo, M.bone);
  b.scale.set(0.035 + Math.random() * 0.02, len, 0.035 + Math.random() * 0.02);
  b.position.y = len * 0.5;
  g.add(b);
  // pink marrow tip
  const tip = new THREE.Mesh(_chunkGeo, M.marrow);
  tip.scale.set(0.03, 0.03, 0.03);
  tip.position.y = len;
  g.add(tip);
  g.position.set(x, y, z);
  g.rotation.set(dir.x + _rnd(0.5), _rnd(0.6), dir.z + _rnd(0.5));
  return g;
}

/** Remove a limb's geometry from `rig` and build a torn gore wound. Idempotent. */
export function severLimb(rig, limb) {
  const J = rig.userData?.joints;
  const spec = SOCKET[limb];
  if (!J || !spec) return;
  const joint = J[JOINT[limb]];
  if (!joint || joint.userData.severed) return;
  joint.visible = false;
  joint.userData.severed = true;

  const parent = J[spec.parent];
  if (!parent) return;
  const M = mats();
  const wound = new THREE.Group();
  wound.position.set(spec.x, spec.y, spec.z);

  // ring of dark blood-soaked outer flesh, torn ragged
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    wound.add(chunk(M.blood, Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05, 0.07, 0.06, 0.07, 0.7));
  }
  // wet exposed muscle core
  wound.add(chunk(M.muscle, 0, 0, 0, 0.1, 0.08, 0.1, 0.4));
  wound.add(chunk(M.muscle, _rnd(0.06), _rnd(0.04), _rnd(0.06), 0.06, 0.06, 0.06, 0.6));
  // a glob of pale fat
  wound.add(chunk(M.fat, _rnd(0.07), _rnd(0.03), _rnd(0.07), 0.04, 0.04, 0.04, 0.6));
  // splintered bone jutting from the centre
  wound.add(shard(M, 0, 0, 0.02, 0.07 + Math.random() * 0.04, { x: -0.3, z: 0 }));
  wound.add(shard(M, _rnd(0.05), 0, _rnd(0.05), 0.05, { x: 0.2, z: 0.2 }));
  // a couple of dangling sinew strands
  for (let i = 0; i < 3; i++) {
    const len = 0.06 + Math.random() * 0.08;
    const s = new THREE.Mesh(_chunkGeo, M.gut);
    s.scale.set(0.018, len, 0.018);
    s.position.set(_rnd(0.12), -len * 0.5 - 0.02, _rnd(0.1) + 0.04);
    s.rotation.set(_rnd(0.5), 0, _rnd(0.5));
    wound.add(s);
  }
  parent.add(wound);
}

/** Both legs gone: cut the body off at the waist — a grotesque open torso with
 *  exposed spine, ribs, viscera, and long dangling entrails (BO3 crawler). */
export function severLowerBody(rig) {
  const J = rig.userData?.joints;
  if (!J || !J.hips || J.hips.userData.lowerSevered) return;
  J.hips.userData.lowerSevered = true;
  const hips = J.hips;
  const M = mats();
  const wound = new THREE.Group();
  wound.position.set(0, -0.1, 0);

  // ragged outer ring of torn, blood-blackened flesh around the cut
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    wound.add(chunk(M.blood, Math.cos(a) * 0.14, _rnd(0.05), Math.sin(a) * 0.1, 0.08, 0.09, 0.07, 0.8));
  }
  // raw muscle wall lining the wound
  for (let i = 0; i < 5; i++) {
    wound.add(chunk(M.muscle, _rnd(0.22), _rnd(0.04), _rnd(0.14), 0.08, 0.07, 0.07, 0.5));
  }
  // exposed spine: a short stack of vertebrae down the back of the wound
  for (let i = 0; i < 4; i++) {
    const v = new THREE.Mesh(_chunkGeo, M.bone);
    v.scale.set(0.06, 0.035, 0.05);
    v.position.set(_rnd(0.02), 0.04 - i * 0.04, -0.07);
    v.rotation.set(_rnd(0.2), 0, 0);
    wound.add(v);
  }
  // jagged rib stumps splaying out of the sides
  wound.add(shard(M, -0.14, 0.06, -0.02, 0.1, { x: 0, z: 0.8 }));
  wound.add(shard(M, 0.14, 0.06, -0.02, 0.1, { x: 0, z: -0.8 }));
  // glistening organ mass spilling out the front
  wound.add(chunk(M.gut, 0, -0.04, 0.08, 0.16, 0.1, 0.1, 0.3));
  wound.add(chunk(M.fat, _rnd(0.12), -0.02, 0.08, 0.06, 0.06, 0.06, 0.5));

  // long ropey entrails dangling/dragging beneath the cut
  for (let i = 0; i < 6; i++) {
    const len = 0.16 + Math.random() * 0.22;
    const e = new THREE.Mesh(_chunkGeo, M.gut);
    e.scale.set(0.03 + Math.random() * 0.02, len, 0.03 + Math.random() * 0.02);
    e.position.set(_rnd(0.26), -0.08 - len * 0.45, 0.04 + _rnd(0.16));
    e.rotation.set(_rnd(0.6), _rnd(0.6), _rnd(0.6));
    wound.add(e);
  }
  hips.add(wound);
}
