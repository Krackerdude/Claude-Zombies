import * as THREE from 'three';

/**
 * A low-poly humanoid zombie built from boxes on a pivot hierarchy so the limbs
 * can be animated (shoulders, elbows, hips, knees, waist, neck). Intentionally
 * blocky / PS2-grade, but with coherent anatomy so it reads as a shambling
 * person. Faces +z (matches the nav facing convention). Returns the root group
 * with `userData.joints` for the animation system. Units: ~1.8 m tall.
 */

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
function pivot(x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); return g; }

export function buildZombieRig(skin) {
  const root = new THREE.Group();
  const J = {};

  // --- pelvis / waist ---
  const HIP_Y = 0.94;
  const hips = pivot(0, HIP_Y, 0); J.hips = hips; root.add(hips);
  hips.add(box(0.34, 0.18, 0.24, skin.pants, 0, -0.02, 0)); // pelvis block

  // --- torso (waist pivot) ---
  const torso = pivot(0, 0.04, 0); J.torso = torso; hips.add(torso);
  torso.add(box(0.4, 0.5, 0.26, skin.shirt, 0, 0.26, 0));      // chest
  torso.add(box(0.34, 0.14, 0.24, skin.shirt, 0, 0.03, 0));    // belly seam

  // --- head (neck pivot) ---
  const head = pivot(0, 0.50, 0.02); J.head = head; torso.add(head);
  head.add(box(0.1, 0.12, 0.1, skin.flesh, 0, 0.03, 0));        // neck
  head.add(box(0.22, 0.24, 0.22, skin.flesh, 0, 0.2, 0));       // skull
  head.add(box(0.2, 0.08, 0.04, skin.flesh, 0, 0.16, 0.11));    // jaw/brow lump
  const eyeGeo = new THREE.BoxGeometry(0.045, 0.03, 0.02);
  for (const dx of [-0.055, 0.055]) {
    const eye = new THREE.Mesh(eyeGeo, skin.eye);
    eye.position.set(dx, 0.22, 0.12); // on the skull face, not the head origin
    head.add(eye);
  }

  // --- arms (reach forward by default) ---
  const arm = (side) => {
    const sx = side * 0.235;
    const sh = pivot(sx, 0.42, 0); sh.rotation.x = -1.15; sh.rotation.z = side * 0.12; // raised forward
    torso.add(sh);
    sh.add(box(0.12, 0.34, 0.13, skin.shirt, 0, -0.16, 0));    // upper arm (sleeve)
    const el = pivot(0, -0.33, 0); el.rotation.x = 0.35;       // slight bend
    sh.add(el);
    el.add(box(0.1, 0.3, 0.11, skin.flesh, 0, -0.15, 0));      // forearm
    const hand = box(0.11, 0.12, 0.13, skin.flesh, 0, -0.32, 0.01); // hand
    el.add(hand);
    return { sh, el, hand };
  };
  const L = arm(-1), R = arm(1);
  J.shoulderL = L.sh; J.elbowL = L.el; J.handL = L.hand;
  J.shoulderR = R.sh; J.elbowR = R.el; J.handR = R.hand;

  // --- legs ---
  const leg = (side) => {
    const hx = side * 0.1;
    const hip = pivot(hx, -0.02, 0); hips.add(hip);
    hip.add(box(0.16, 0.4, 0.18, skin.pants, 0, -0.2, 0));     // thigh
    const kn = pivot(0, -0.4, 0); hip.add(kn);
    kn.add(box(0.14, 0.46, 0.16, skin.pants, 0, -0.23, 0));    // shin
    const foot = box(0.16, 0.1, 0.28, skin.shoe, 0, -0.47, 0.06); // foot
    kn.add(foot);
    return { hip, kn, foot };
  };
  const LL = leg(-1), RL = leg(1);
  J.thighL = LL.hip; J.kneeL = LL.kn; J.footL = LL.foot;
  J.thighR = RL.hip; J.kneeR = RL.kn; J.footR = RL.foot;

  root.userData.joints = J;
  root.userData.rest = { shoulder: -1.15, shoulderZ: 0.12, elbow: 0.35, torso: 0.16, hipY: HIP_Y };
  root.userData.noBulletFx = true; // bullets that strike zombies make blood, never holes/debris
  return root;
}
