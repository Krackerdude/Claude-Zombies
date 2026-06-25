import * as THREE from 'three';

/**
 * A REAL articulated ragdoll for dead zombies. Seven dynamic Rapier boxes
 * (pelvis, torso, head, both upper-arms, both thighs) are linked by six
 * spherical joints and dropped into the live world at the zombie's death pose,
 * carrying the killing impulse. Rapier then simulates them — they tumble, pile
 * on each other (RAGDOLL self-collision), and settle onto whatever terrain is
 * under them, every corpse ending in a different heap. No tweening, no single
 * canned pose. Each fixed step we read the body orientations back and drive the
 * existing box rig from them, so the visible zombie IS the simulation.
 *
 * Bodies are in the RAGDOLL collision group: they hit world geometry + other
 * ragdolls, but never the player/zombie capsules (those are ACTOR), so corpses
 * can't block or shove the living. Only available when the physics backend
 * reports `ragdollCapable`; the headless test stub falls back to the procedural
 * corpse in CorpseSystem.
 */

// Per-segment collider spec: half-extents of the box + offset down the bone from
// the joint pivot (the body origin sits AT the pivot so joints line up with the
// rig). Tuned to roughly wrap each limb of the ~1.8 m box humanoid.
const SEG = {
  pelvis: { half: { x: 0.17, y: 0.10, z: 0.12 }, off: { x: 0, y: -0.02, z: 0 }, density: 1.4 },
  torso: { half: { x: 0.20, y: 0.26, z: 0.13 }, off: { x: 0, y: 0.20, z: 0 }, density: 1.2 },
  head: { half: { x: 0.12, y: 0.13, z: 0.12 }, off: { x: 0, y: 0.18, z: 0 }, density: 1.0 },
  arm: { half: { x: 0.07, y: 0.30, z: 0.07 }, off: { x: 0, y: -0.30, z: 0 }, density: 0.9 },
  leg: { half: { x: 0.09, y: 0.42, z: 0.10 }, off: { x: 0, y: -0.42, z: 0 }, density: 1.0 },
};

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qParentInv = new THREE.Quaternion();
const _qChild = new THREE.Quaternion();
const _qLocal = new THREE.Quaternion();
const _hipOffset = new THREE.Vector3();

const rand = (a) => (Math.random() * 2 - 1) * a;

/**
 * Build the seven-body ragdoll at the rig's current world pose and launch it.
 * @returns ragdoll data { bodies, joints, hipY } stored on the CorpseTag.
 */
export function buildRagdoll(rig, physics, c, t) {
  const J = rig.userData?.joints;
  if (!J) return null;
  const hipY = rig.userData.rest?.hipY ?? 0.94;

  // pose the rig at the death transform and bake world matrices so we can read
  // each joint's world position/orientation as the body spawn frame
  rig.position.copy(t.position);
  rig.quaternion.copy(t.quaternion);
  rig.updateMatrixWorld(true);

  // one collision group for the whole corpse: it piles on terrain + other
  // corpses but never self-collides (overlapping limb boxes would detonate it)
  const group = physics.allocRagdollGroup();
  const make = (joint, spec) => {
    joint.getWorldPosition(_v);
    joint.getWorldQuaternion(_q);
    return physics.createRagdollBox(
      { x: _v.x, y: _v.y, z: _v.z },
      { x: _q.x, y: _q.y, z: _q.z, w: _q.w },
      spec.half,
      { density: spec.density, offset: spec.off, group },
    );
  };

  const bodies = {
    pelvis: make(J.hips, SEG.pelvis),
    torso: make(J.torso, SEG.torso),
    head: make(J.head, SEG.head),
    armL: make(J.shoulderL, SEG.arm),
    armR: make(J.shoulderR, SEG.arm),
    legL: make(J.thighL, SEG.leg),
    legR: make(J.thighR, SEG.leg),
  };

  // spherical joints at the anatomical sockets (each at the CHILD joint's world
  // pivot, which the two bodies share)
  const anchorAt = (joint) => { joint.getWorldPosition(_v); return { x: _v.x, y: _v.y, z: _v.z }; };
  const joints = [
    physics.createSphericalJoint(bodies.pelvis, bodies.torso, anchorAt(J.torso)),
    physics.createSphericalJoint(bodies.torso, bodies.head, anchorAt(J.head)),
    physics.createSphericalJoint(bodies.torso, bodies.armL, anchorAt(J.shoulderL)),
    physics.createSphericalJoint(bodies.torso, bodies.armR, anchorAt(J.shoulderR)),
    physics.createSphericalJoint(bodies.pelvis, bodies.legL, anchorAt(J.thighL)),
    physics.createSphericalJoint(bodies.pelvis, bodies.legR, anchorAt(J.thighR)),
  ];

  // launch: the killing impulse becomes the bodies' initial velocity. Every
  // body shares ONE tumble (plus a tiny per-limb jitter) so the spherical
  // joints don't have to reconcile wildly conflicting spins (that fights the
  // solver and detonates the ragdoll). The whole corpse pitches in the shot
  // direction and rolls a little, then gravity + terrain take over.
  const launch = { x: c.vx, y: Math.max(1.2, c.vy), z: c.vz };
  // tumble axis ~ horizontal, perpendicular to the push, so it face-plants /
  // back-flops the way it was hit, with a random roll mixed in
  const tumble = {
    x: c.vz * 0.9 + rand(0.6),
    y: rand(1.2),
    z: -c.vx * 0.9 + rand(0.6),
  };
  for (const key in bodies) {
    physics.setLinearVelocity(bodies[key], launch);
    physics.setAngularVelocity(bodies[key], {
      x: tumble.x + rand(0.5), y: tumble.y + rand(0.5), z: tumble.z + rand(0.5),
    });
  }
  // a modest extra pop on the upper body sells "knocked off its feet" without
  // overwhelming the neck/spine joints
  physics.setLinearVelocity(bodies.head, { x: c.vx, y: launch.y + 0.6, z: c.vz });

  // forearms/shins are rigid extensions of the single arm/leg body — settle the
  // elbows/knees to a slack near-straight bend once, so limbs read naturally
  J.elbowL.rotation.set(0.18, 0, 0); J.elbowR.rotation.set(0.18, 0, 0);
  J.kneeL.rotation.set(0.12, 0, 0); J.kneeR.rotation.set(0.12, 0, 0);

  return { bodies, joints, hipY };
}

/**
 * Read the simulated bodies back onto the rig. The pelvis body is authoritative
 * for the root transform (written into the Transform so render interpolation
 * still works); every other driven joint's LOCAL rotation is the relative
 * rotation between its parent body and its own body, so the rig exactly tracks
 * the physics articulation.
 */
export function syncRagdoll(rig, t, data, physics) {
  const J = rig.userData?.joints;
  if (!J || !data) return;
  const { bodies } = data;

  const pelvis = physics.bodyTransform(bodies.pelvis);
  const pelvisQ = _qParentInv.set(pelvis.q.x, pelvis.q.y, pelvis.q.z, pelvis.q.w);

  // root so that the hips pivot lands on the pelvis body origin
  _hipOffset.set(0, data.hipY, 0).applyQuaternion(pelvisQ);
  t.position.set(pelvis.p.x - _hipOffset.x, pelvis.p.y - _hipOffset.y, pelvis.p.z - _hipOffset.z);
  t.quaternion.copy(pelvisQ);

  // hips: identity local under the root (root already carries the pelvis orient)
  J.hips.position.set(0, data.hipY, 0);
  J.hips.rotation.set(0, 0, 0);

  // childLocal = parentBodyQuat^-1 * childBodyQuat
  const drive = (joint, parentBody, childBody) => {
    const p = physics.bodyTransform(parentBody);
    const cc = physics.bodyTransform(childBody);
    _qParentInv.set(p.q.x, p.q.y, p.q.z, p.q.w).invert();
    _qChild.set(cc.q.x, cc.q.y, cc.q.z, cc.q.w);
    _qLocal.multiplyQuaternions(_qParentInv, _qChild);
    joint.quaternion.copy(_qLocal);
  };

  drive(J.torso, bodies.pelvis, bodies.torso);
  drive(J.head, bodies.torso, bodies.head);
  drive(J.shoulderL, bodies.torso, bodies.armL);
  drive(J.shoulderR, bodies.torso, bodies.armR);
  drive(J.thighL, bodies.pelvis, bodies.legL);
  drive(J.thighR, bodies.pelvis, bodies.legR);
}

/** Tear down all bodies + joints (freezes the rig in its last simulated pose). */
export function disposeRagdoll(physics, data) {
  if (!data) return;
  for (const j of data.joints) physics.removeJoint(j);
  for (const key in data.bodies) physics.removeBody(data.bodies[key]);
  data.joints = [];
  data.bodies = {};
}
