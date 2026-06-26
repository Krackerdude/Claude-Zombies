import * as THREE from 'three';

/**
 * Visual dismemberment: hide a limb's whole joint sub-tree on a zombie rig and
 * cap the socket with a gore stump. Pure presentation — the gameplay limb state
 * lives on ZombieTag.limbs; this just makes the body match it. Reused for both
 * live zombies and (later) their corpses.
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

const _stumpGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
let _goreMat = null;
function goreMat() {
  // dark wet meat — bone/organ detail is faked by a couple of small inner bits
  if (!_goreMat) _goreMat = new THREE.MeshStandardMaterial({ color: 0x4a0e0e, roughness: 0.65, metalness: 0.0 });
  return _goreMat;
}
let _boneMat = null;
function boneMat() {
  if (!_boneMat) _boneMat = new THREE.MeshStandardMaterial({ color: 0xcfc4a8, roughness: 0.8 });
  return _boneMat;
}

/** Remove a limb's geometry from `rig` and stump the socket. Idempotent. */
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
  // ragged meat stump
  const stump = new THREE.Mesh(_stumpGeo, goreMat());
  stump.position.set(spec.x, spec.y, spec.z);
  stump.rotation.set((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4);
  parent.add(stump);
  // a nub of bone poking out
  const bone = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.07), boneMat());
  bone.position.set(spec.x, spec.y, spec.z + 0.05);
  parent.add(bone);
}

/** Both legs gone: cut the body off at the waist — a grotesque gore mass with
 *  dangling organs and exposed spine where the lower body was (BO3 crawler). */
export function severLowerBody(rig) {
  const J = rig.userData?.joints;
  if (!J || !J.hips || J.hips.userData.lowerSevered) return;
  J.hips.userData.lowerSevered = true;
  const hips = J.hips;
  // raw meat mass capping the waist
  const mass = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.22), goreMat());
  mass.position.set(0, -0.12, 0.01);
  hips.add(mass);
  // exposed spine stub
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.14, 0.055), boneMat());
  spine.position.set(0, -0.1, -0.05);
  hips.add(spine);
  // dangling organs/entrails
  for (let i = 0; i < 4; i++) {
    const len = 0.1 + Math.random() * 0.12;
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.05, len, 0.05), goreMat());
    e.position.set((Math.random() - 0.5) * 0.2, -0.18 - len * 0.4, (Math.random() - 0.5) * 0.16);
    hips.add(e);
  }
}
