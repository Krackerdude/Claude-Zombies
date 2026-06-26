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

// Per-segment spec: collider shape + offset down the bone from the joint pivot
// (the body origin sits AT the pivot so joints line up with the rig), and an
// explicit mass in kg. The PELVIS is by far the heaviest so the whole corpse's
// centre of mass sits at the waist and it topples/anchors like a real body;
// limbs are light. Arms/legs are CAPSULES and the head a BALL so they roll and
// settle on the ground instead of catching on box corners and vibrating; the
// torso/pelvis stay boxes (they come to rest on a broad flat face — stable).
// Masses (kg) chosen for SENSIBLE ratios across the joints: the pelvis is still
// the heaviest (so the centre of mass sits at the waist and the body topples
// like a real one), but no segment is more than ~4x a body it's jointed to.
// The old 10:1 pelvis:arm ratio made the solver unstable at the shoulder.
const SEG = {
  pelvis: { shape: { type: 'box', hx: 0.17, hy: 0.10, hz: 0.12 }, off: { x: 0, y: -0.02, z: 0 }, mass: 16 },
  torso: { shape: { type: 'box', hx: 0.20, hy: 0.26, hz: 0.13 }, off: { x: 0, y: 0.20, z: 0 }, mass: 14 },
  head: { shape: { type: 'ball', radius: 0.13 }, off: { x: 0, y: 0.18, z: 0 }, mass: 5 },
  arm: { shape: { type: 'capsule', halfHeight: 0.26, radius: 0.075 }, off: { x: 0, y: -0.30, z: 0 }, mass: 4 },
  // capsule lengthened + dropped so it reaches the FOOT (~0.92m below the hip),
  // not just the shin — the lower leg/foot had no collider before, which is why
  // it clipped through the floor (CCD can't help a collision that isn't there).
  leg: { shape: { type: 'capsule', halfHeight: 0.36, radius: 0.10 }, off: { x: 0, y: -0.46, z: 0 }, mass: 8 },
};

// Anatomical range-of-motion per driven joint, measured from the neutral
// (straight/hanging) local pose. `swing` is the max cone half-angle the limb's
// long axis (local Y) may tip away from neutral; `twist` is the signed rotation
// allowed AROUND that long axis. These dead-zones stop the physics body from
// driving the rig into impossible poses — most importantly the head no longer
// spins in circles (its twist is clamped to a small range). Radians.
const ROM = {
  torso: { swing: 0.55, twistMin: -0.45, twistMax: 0.45 }, // spine: small lean/rotate
  head: { swing: 0.85, twistMin: -0.70, twistMax: 0.70 },  // neck: nod/tilt, limited turn
  arm: { swing: 1.85, twistMin: -1.20, twistMax: 1.20 },   // shoulder: very mobile
  leg: { swing: 1.20, twistMin: -0.55, twistMax: 0.55 },   // hip: forward/back, little splay
};

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qParentInv = new THREE.Quaternion();
const _qChild = new THREE.Quaternion();
const _qLocal = new THREE.Quaternion();
const _twist = new THREE.Quaternion();
const _swing = new THREE.Quaternion();
const _qTmp = new THREE.Quaternion();
const _qP = new THREE.Quaternion();
const _qC = new THREE.Quaternion();
const _qRel = new THREE.Quaternion();
const _qOrig = new THREE.Quaternion();
const _qNew = new THREE.Quaternion();
const _hipOffset = new THREE.Vector3();

const rand = (a) => (Math.random() * 2 - 1) * a;

/**
 * Clamp a joint-local rotation to a swing cone + twist range about the limb's
 * long axis (local Y), in place. Swing-twist decomposition: split the rotation
 * into a turn AROUND Y (twist) and the remaining tip AWAY from Y (swing), clamp
 * each, recombine. Keeps the rendered skeleton anatomically plausible no matter
 * what the free physics body does.
 */
function clampSwingTwist(q, lim) {
  if (q.w < 0) { q.x = -q.x; q.y = -q.y; q.z = -q.z; q.w = -q.w; } // shortest arc
  // twist = component around Y
  const tl = Math.hypot(q.y, q.w);
  // Near a 180deg swing (the limb flipped opposite its neutral — e.g. an arm
  // thrown overhead when the back/shoulders hit the ground first) the twist axis
  // is undefined and the swing/twist split flips sign frame-to-frame: the "crazy
  // twist". The limb is far past its swing limit there anyway, so skip the
  // decomposition and just pull the whole rotation straight back toward neutral
  // to the swing cone — continuous, no flip.
  if (tl < 0.3) {
    const cosHalf = Math.cos(lim.swing * 0.5);
    if (q.w < cosHalf) {
      const vlen = Math.hypot(q.x, q.y, q.z) || 1;
      const s = Math.sin(lim.swing * 0.5) / vlen;
      q.set(q.x * s, q.y * s, q.z * s, cosHalf);
    }
    return;
  }
  _twist.set(0, q.y / tl, 0, q.w / tl);
  // swing = q * twist^-1  (twist is unit -> inverse is conjugate)
  _swing.copy(q).multiply(_qTmp.set(0, -_twist.y, 0, _twist.w));

  // clamp swing cone
  let sw = Math.min(1, Math.abs(_swing.w));
  const swingAngle = 2 * Math.acos(sw);
  if (swingAngle > lim.swing) {
    const axisLen = Math.hypot(_swing.x, _swing.z); // y ~ 0 after decomposition
    if (axisLen > 1e-6) {
      const half = lim.swing * 0.5;
      const s = Math.sin(half) / axisLen * (_swing.w < 0 ? -1 : 1);
      _swing.set(_swing.x * s, 0, _swing.z * s, Math.cos(half));
    }
  }
  // clamp twist around Y
  let twistAngle = 2 * Math.atan2(_twist.y, _twist.w);
  const cl = Math.min(lim.twistMax, Math.max(lim.twistMin, twistAngle));
  if (cl !== twistAngle) _twist.set(0, Math.sin(cl * 0.5), 0, Math.cos(cl * 0.5));

  q.copy(_swing).multiply(_twist);
}

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
    return physics.createRagdollPart(
      { x: _v.x, y: _v.y, z: _v.z },
      { x: _q.x, y: _q.y, z: _q.z, w: _q.w },
      spec.shape,
      { mass: spec.mass, offset: spec.off, group },
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
  const launch = { x: c.vx, y: Math.max(1.0, c.vy), z: c.vz };
  // ONE shared tumble — axis horizontal and perpendicular to the push, so it
  // face-plants / back-flops the way it was hit, with a touch of roll. The OLD
  // version scaled with the (variable, sometimes large) kill force and had a
  // big random term, so the SAME shot could roll a gentle topple OR a violent
  // spin — the 50/50 — and a fast spin whips a limb hard enough to tunnel.
  // Smaller coefficients + a HARD CAP on the total spin standardise it: every
  // corpse gets a consistent gentle tumble, none can ever spin fast. Gravity
  // does the real toppling.
  const SPIN_CAP = 1.3; // rad/s ceiling on launch spin
  let tx = c.vz * 0.28 + rand(0.18);
  let ty = rand(0.22);
  let tz = -c.vx * 0.28 + rand(0.18);
  const tmag = Math.hypot(tx, ty, tz);
  if (tmag > SPIN_CAP) { const k = SPIN_CAP / tmag; tx *= k; ty *= k; tz *= k; }
  const tumble = { x: tx, y: ty, z: tz };
  for (const key in bodies) {
    physics.setLinearVelocity(bodies[key], launch);
    physics.setAngularVelocity(bodies[key], tumble);
  }

  // forearms/shins are rigid extensions of the single arm/leg body — settle the
  // elbows/knees to a slack near-straight bend once, so limbs read naturally
  J.elbowL.rotation.set(0.18, 0, 0); J.elbowR.rotation.set(0.18, 0, 0);
  J.kneeL.rotation.set(0.12, 0, 0); J.kneeR.rotation.set(0.12, 0, 0);

  return { bodies, joints, hipY };
}

// Joint -> ROM table, in the order limits must be enforced (a parent before its
// children, so children read the already-corrected parent orientation).
const LIMIT_ORDER = [
  ['pelvis', 'torso', 'torso'],
  ['torso', 'head', 'head'],
  ['torso', 'armL', 'arm'],
  ['torso', 'armR', 'arm'],
  ['pelvis', 'legL', 'leg'],
  ['pelvis', 'legR', 'leg'],
];

/**
 * Enforce anatomical joint limits on the PHYSICS bodies (Rapier spherical
 * joints are free ball joints with no stops, so without this the corpse settles
 * into impossible poses — torso balanced upright, limbs splayed up). Each step,
 * for every joint we measure the child's orientation relative to its parent; if
 * it's outside the swing cone / twist range we snap it back to the boundary and
 * bleed off the angular velocity that drove it past, exactly like a joint stop.
 * Because the bodies themselves stay in range, the visual (which follows them
 * 1:1) lies flat instead of clipping/contorting.
 */
export function enforceLimits(physics, data) {
  const { bodies } = data;
  for (const [pk, ck, lk] of LIMIT_ORDER) {
    const pb = bodies[pk], cb = bodies[ck];
    const p = physics.bodyTransform(pb);
    const c = physics.bodyTransform(cb);
    _qP.set(p.q.x, p.q.y, p.q.z, p.q.w);
    _qC.set(c.q.x, c.q.y, c.q.z, c.q.w);
    _qParentInv.copy(_qP).invert();
    _qRel.multiplyQuaternions(_qParentInv, _qC);
    _qOrig.copy(_qRel);
    clampSwingTwist(_qRel, ROM[lk]);
    if (Math.abs(_qOrig.dot(_qRel)) < 0.99995) { // was outside the allowed range
      _qNew.multiplyQuaternions(_qP, _qRel);     // corrected child orientation
      physics.setBodyRotation(cb, _qNew);
      physics.setBodyTranslation(cb, c.p);       // re-pin the joint anchor (= origin)
      const w = physics.angularVelocity(cb);     // kill the energy at the stop
      physics.setAngularVelocity(cb, { x: w.x * 0.2, y: w.y * 0.2, z: w.z * 0.2 });
    }
  }
}

/**
 * Read the simulated bodies back onto the rig. The pelvis body is authoritative
 * for the root transform (written into the Transform so render interpolation
 * still works); every other driven joint's LOCAL rotation is the relative
 * rotation between its parent body and its own body, so the rig tracks the
 * physics articulation 1:1 (no separate visual clamp — the bodies are already
 * within their limits, so the rig can't diverge from where they actually rest).
 */
export function syncRagdoll(rig, t, data, physics) {
  const J = rig.userData?.joints;
  if (!J || !data) return;
  const { bodies } = data;

  // keep the physics bodies anatomically posed first, then mirror them
  enforceLimits(physics, data);

  const pelvis = physics.bodyTransform(bodies.pelvis);
  const pelvisQ = _qParentInv.set(pelvis.q.x, pelvis.q.y, pelvis.q.z, pelvis.q.w);

  // root so that the hips pivot lands on the pelvis body origin
  _hipOffset.set(0, data.hipY, 0).applyQuaternion(pelvisQ);
  t.position.set(pelvis.p.x - _hipOffset.x, pelvis.p.y - _hipOffset.y, pelvis.p.z - _hipOffset.z);
  t.quaternion.copy(pelvisQ);

  // hips: identity local under the root (root already carries the pelvis orient)
  J.hips.position.set(0, data.hipY, 0);
  J.hips.rotation.set(0, 0, 0);

  // childLocal = parentBodyQuat^-1 * childBodyQuat (bodies already within ROM)
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
