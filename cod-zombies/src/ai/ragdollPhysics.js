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
const SEG = {
  // rounded boxes (border radius) so the heavy trunk can't balance on a sharp
  // corner and prop the whole corpse up — it rolls onto a flat face and settles
  pelvis: { shape: { type: 'box', hx: 0.12, hy: 0.06, hz: 0.08, round: 0.05 }, off: { x: 0, y: -0.02, z: 0 }, mass: 24 },
  torso: { shape: { type: 'box', hx: 0.15, hy: 0.21, hz: 0.08, round: 0.05 }, off: { x: 0, y: 0.20, z: 0 }, mass: 16 },
  head: { shape: { type: 'ball', radius: 0.13 }, off: { x: 0, y: 0.18, z: 0 }, mass: 5 },
  // capsule reaches from the shoulder pivot down past the hand (~0.67 m total)
  arm: { shape: { type: 'capsule', halfHeight: 0.28, radius: 0.075 }, off: { x: 0, y: -0.32, z: 0 }, mass: 3 },
  // capsule reaches from the hip pivot all the way to the foot (~0.92 m total),
  // so the SHIN + FOOT have collision and don't punch through the floor
  leg: { shape: { type: 'capsule', halfHeight: 0.36, radius: 0.10 }, off: { x: 0, y: -0.46, z: 0 }, mass: 6 },
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
const _qInv = new THREE.Quaternion();
const _axisV = new THREE.Vector3();
const _hipOffset = new THREE.Vector3();
const _bbox = new THREE.Box3();

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
  if (tl < 1e-6) _twist.set(0, 0, 0, 1);
  else _twist.set(0, q.y / tl, 0, q.w / tl);
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

/** Clamp a rig joint's LOCAL rotation into its anatomical range in place (used
 *  once at spawn so the ragdoll starts within limits instead of reeling in). */
function clampJointLocal(joint, lim) {
  if (!joint) return;
  _qLocal.copy(joint.quaternion);
  clampSwingTwist(_qLocal, lim);
  joint.quaternion.copy(_qLocal);
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

  // CLAMP the death pose into anatomical range up-front. A zombie dies
  // mid-animation (arms raised, twisted), so the bodies would otherwise spawn
  // well outside their joint limits and visibly "compress/untwist" back into
  // range over the first half-second. Clamping the rig's joints here means the
  // ragdoll STARTS already-natural and just flops under gravity.
  clampJointLocal(J.torso, ROM.torso);
  clampJointLocal(J.head, ROM.head);
  clampJointLocal(J.shoulderL, ROM.arm);
  clampJointLocal(J.shoulderR, ROM.arm);
  clampJointLocal(J.thighL, ROM.leg);
  clampJointLocal(J.thighR, ROM.leg);
  rig.updateMatrixWorld(true); // re-bake with the clamped pose before spawning

  // every segment collides with the environment only (default ragdoll group):
  // no corpse-corpse, no player, no self collision
  const make = (joint, spec) => {
    joint.getWorldPosition(_v);
    joint.getWorldQuaternion(_q);
    return physics.createRagdollPart(
      { x: _v.x, y: _v.y, z: _v.z },
      { x: _q.x, y: _q.y, z: _q.z, w: _q.w },
      spec.shape,
      { mass: spec.mass, offset: spec.off },
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
  // Mostly a crumple in place: a gentle horizontal shove in the shot direction
  // and only a tiny upward pop (so they don't start sunk). Big launches were
  // sending them airborne enough to backflip and to slam down hard.
  const clamp = (v, a) => Math.max(-a, Math.min(a, v));
  const launch = { x: c.vx * 0.5, y: Math.min(0.6, Math.max(0.15, c.vy * 0.3)), z: c.vz * 0.5 };
  // ONE small shared tumble, axis horizontal + perpendicular to the push so it
  // topples the way it was hit; capped low so it never cartwheels over.
  const tumble = {
    x: clamp(c.vz * 0.25 + rand(0.15), 0.9),
    y: rand(0.2),
    z: clamp(-c.vx * 0.25 + rand(0.15), 0.9),
  };
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
 * into impossible poses — torso balanced upright, limbs splayed up).
 *
 * This is VELOCITY-based: when a joint is past its swing cone / twist range we
 * steer the child body back with a corrective angular velocity (and damp the
 * spin), never teleporting its position or orientation.
 *
 * `strength` (0..1) FADES the whole thing out over the corpse's first second.
 * The limits matter while the body is toppling (so it doesn't settle propped or
 * with its head spun round) — but once it has landed they only fight the floor
 * contact, which kept waking the bodies and was the "tweak on the ground". By
 * the time it's down, strength has faded to 0: no more corrective velocity, the
 * bodies stop being woken, and they sleep flat.
 */
export function enforceLimits(physics, data, strength) {
  if (strength <= 0) return;
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
    if (Math.abs(_qOrig.dot(_qRel)) >= 0.9994) continue; // within range (~4deg slop)

    // correction rotation (parent frame) that takes the current relative
    // orientation back to the clamped one: corr = clamped * orig^-1
    _qInv.copy(_qOrig).invert();
    _qNew.multiplyQuaternions(_qRel, _qInv);
    if (_qNew.w < 0) { _qNew.x = -_qNew.x; _qNew.y = -_qNew.y; _qNew.z = -_qNew.z; _qNew.w = -_qNew.w; }
    const sin = Math.sqrt(Math.max(0, 1 - _qNew.w * _qNew.w));
    if (sin < 1e-4) continue;
    const angle = 2 * Math.acos(Math.min(1, _qNew.w));   // how far past the stop
    // correction axis in world space (rotate the parent-frame axis by parent q)
    _axisV.set(_qNew.x / sin, _qNew.y / sin, _qNew.z / sin).applyQuaternion(_qP);

    const gain = 9 * strength;    // 1/s — how hard the stop pushes back (fades out)
    const w = physics.angularVelocity(cb);
    physics.setAngularVelocity(cb, {
      x: w.x * 0.9 + _axisV.x * angle * gain,
      y: w.y * 0.9 + _axisV.y * angle * gain,
      z: w.z * 0.9 + _axisV.z * angle * gain,
    });
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
export function syncRagdoll(rig, t, data, physics, life = 0) {
  const J = rig.userData?.joints;
  if (!J || !data) return;
  const { bodies } = data;

  // shape the pose with joint limits while it topples, then fade the
  // enforcement out by ~1s so it stops fighting the floor once landed
  const strength = Math.max(0, Math.min(1, (1.1 - life) / 0.9));
  enforceLimits(physics, data, strength);

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

  // floor backstop: whatever the physics settled to, never let the RENDERED
  // corpse sink below the ground. Bake the rig at the new pose, take its true
  // world bounding box, and if its LOWEST vertex is under the floor lift the
  // whole rig straight up by exactly that much (vertical only — the pose is
  // untouched). Using the AABB (not sampled joints) means no part — thick torso,
  // lower leg, anything — can poke through, however the bodies actually settled.
  rig.position.copy(t.position);
  rig.quaternion.copy(t.quaternion);
  rig.updateMatrixWorld(true);
  _bbox.setFromObject(rig);
  if (_bbox.min.y < FLOOR_Y) t.position.y += FLOOR_Y - _bbox.min.y;
}

const FLOOR_Y = 0.0;

/** Tear down all bodies + joints (freezes the rig in its last simulated pose). */
export function disposeRagdoll(physics, data) {
  if (!data) return;
  for (const j of data.joints) physics.removeJoint(j);
  for (const key in data.bodies) physics.removeBody(data.bodies[key]);
  data.joints = [];
  data.bodies = {};
}
