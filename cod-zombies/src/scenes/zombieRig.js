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

export function buildZombieRig(look) {
  const skin = look.skin || look; // accept a full "look" or a bare skin (legacy)
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

  if (look && look.human) {
    // Humanized face for survivors: proper eyes (sclera + pupil), a defined
    // nose, ears and a brow — and NO zombie jaw/brow face-plate. Keeps them
    // clearly apart from the shambling dead.
    const sclera = new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: 0.45 });
    const brow = new THREE.MeshStandardMaterial({ color: 0x2c1e12, roughness: 0.75 });
    for (const dx of [-0.05, 0.05]) {
      head.add(box(0.058, 0.02, 0.03, brow, dx, 0.248, 0.106));      // dual, separated eyebrows
      head.add(box(0.05, 0.036, 0.025, sclera, dx, 0.214, 0.108));  // eye white
      head.add(box(0.02, 0.028, 0.02, skin.eye, dx, 0.214, 0.122)); // pupil
    }
    head.add(box(0.036, 0.056, 0.042, skin.flesh, 0, 0.16, 0.118));  // nose (smaller, protruding)
    head.add(box(0.085, 0.014, 0.025, skin.eye, 0, 0.116, 0.11));   // mouth line
    for (const dx of [-1, 1]) head.add(box(0.028, 0.075, 0.06, skin.flesh, dx * 0.118, 0.205, 0.0)); // ears (eye-height)
  } else {
    head.add(box(0.2, 0.08, 0.04, skin.flesh, 0, 0.16, 0.11));    // jaw/brow lump
    const eyeGeo = new THREE.BoxGeometry(0.045, 0.03, 0.02);
    for (const dx of [-0.055, 0.055]) {
      const eye = new THREE.Mesh(eyeGeo, skin.eye);
      eye.position.set(dx, 0.22, 0.12); // on the skull face, not the head origin
      head.add(eye);
    }
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

  // --- modular cosmetics (only when a full "look" was passed) ---
  if (look && look.skin) {
    addHair(head, look, box);
    addBeard(head, look, box);
    addHat(head, look, box);
    addClothing(torso, look, skin, box);
  }

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

// Cosmetics are children of the head/torso joints so they animate with the body.
// Head-local: skull box is centred ~y0.2, front face z0.11, top y0.32.

function addHair(head, look, box) {
  const m = look.hairMat;
  if (!m || !look.hair || look.hair === 'bald') return;
  switch (look.hair) {
    case 'buzz':
      head.add(box(0.226, 0.04, 0.226, m, 0, 0.305, -0.002));
      break;
    case 'short':
      head.add(box(0.236, 0.075, 0.236, m, 0, 0.31, -0.008));
      break;
    case 'messy':
      head.add(box(0.252, 0.1, 0.252, m, 0, 0.31, 0));
      head.add(box(0.07, 0.07, 0.07, m, 0.1, 0.37, 0.05));
      head.add(box(0.06, 0.06, 0.06, m, -0.09, 0.36, -0.06));
      head.add(box(0.06, 0.06, 0.06, m, 0.02, 0.38, -0.02));
      break;
    case 'mohawk':
      head.add(box(0.05, 0.15, 0.25, m, 0, 0.37, 0));
      break;
    case 'balding':
      head.add(box(0.24, 0.04, 0.11, m, 0, 0.3, -0.085));            // back fringe
      for (const sx of [-1, 1]) head.add(box(0.035, 0.11, 0.2, m, sx * 0.115, 0.2, -0.015)); // side hair
      break;
    case 'long':
      head.add(box(0.242, 0.075, 0.242, m, 0, 0.31, 0));
      for (const sx of [-1, 1]) head.add(box(0.05, 0.22, 0.2, m, sx * 0.122, 0.15, -0.02)); // hangs at sides
      head.add(box(0.22, 0.24, 0.05, m, 0, 0.13, -0.125));          // down the back
      break;
    case 'bun':
      head.add(box(0.236, 0.06, 0.236, m, 0, 0.31, 0));
      head.add(box(0.1, 0.1, 0.1, m, 0, 0.38, -0.07));              // top-knot
      break;
  }
}

function addBeard(head, look, box) {
  const m = look.beardMat;
  if (!m || !look.beard || look.beard === 'none') return;
  switch (look.beard) {
    case 'stubble':
      head.add(box(0.206, 0.11, 0.035, m, 0, 0.12, 0.1));
      break;
    case 'goatee':
      head.add(box(0.07, 0.09, 0.05, m, 0, 0.075, 0.115));
      break;
    case 'full':
      head.add(box(0.205, 0.14, 0.06, m, 0, 0.11, 0.09));
      head.add(box(0.16, 0.08, 0.05, m, 0, 0.035, 0.09));           // hangs off the chin
      for (const sx of [-1, 1]) head.add(box(0.04, 0.13, 0.06, m, sx * 0.1, 0.17, 0.055)); // sideburns
      break;
  }
}

function addHat(head, look, box) {
  const m = look.hatMat;
  if (!m || !look.hat || look.hat === 'none') return;
  switch (look.hat) {
    case 'cap':
      head.add(box(0.236, 0.08, 0.236, m, 0, 0.34, -0.01));         // dome
      head.add(box(0.2, 0.025, 0.13, m, 0, 0.315, 0.16));           // bill
      break;
    case 'beanie':
      head.add(box(0.248, 0.15, 0.248, m, 0, 0.34, 0));             // pulled-down knit
      break;
    case 'hardhat':
      head.add(box(0.252, 0.11, 0.252, m, 0, 0.355, 0));            // shell
      head.add(box(0.3, 0.02, 0.3, m, 0, 0.31, 0));                 // brim ring
      break;
  }
}

function addClothing(torso, look, skin, box) {
  const m = look.topMat;
  if (!m || !look.top || look.top === 'plain') return;
  switch (look.top) {
    case 'hoodie':
      torso.add(box(0.34, 0.2, 0.16, m, 0, 0.5, -0.1));             // hood bunched behind the neck
      torso.add(box(0.42, 0.5, 0.03, m, 0, 0.26, 0.135));           // hoodie front
      torso.add(box(0.22, 0.12, 0.04, m, 0, 0.15, 0.14));           // kangaroo pocket
      break;
    case 'jacket': {
      torso.add(box(0.44, 0.5, 0.04, m, 0, 0.26, 0.12));            // jacket body
      torso.add(box(0.04, 0.5, 0.03, skin.shirt, 0, 0.26, 0.155));  // open shirt strip down the middle
      for (const sx of [-1, 1]) {                                    // lapels
        const lap = box(0.08, 0.3, 0.03, m, sx * 0.11, 0.36, 0.15);
        lap.rotation.z = sx * 0.22;
        torso.add(lap);
      }
      break;
    }
    case 'vest':
      torso.add(box(0.43, 0.44, 0.03, m, 0, 0.28, 0.13));           // vest front panel
      torso.add(box(0.05, 0.44, 0.02, skin.shirt, 0, 0.28, 0.15));  // shirt showing at the opening
      break;
    case 'tie':
      torso.add(box(0.055, 0.3, 0.02, m, 0, 0.27, 0.142));          // tie
      torso.add(box(0.075, 0.05, 0.03, m, 0, 0.46, 0.142));         // knot
      break;
    case 'apron':
      torso.add(box(0.3, 0.42, 0.02, m, 0, 0.2, 0.135));            // apron front
      torso.add(box(0.14, 0.06, 0.02, m, 0, 0.5, 0.12));            // neck bib
      break;
  }
}
