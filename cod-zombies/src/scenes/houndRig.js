import * as THREE from 'three';

/**
 * A hellhound: a low-poly, charred quadruped wolf built from boxes on a pivot
 * hierarchy so the legs/spine/head/jaw/tail animate (the same approach as the
 * humanoid zombieRig). Demonic + on fire to match the references: a gaunt
 * black-furred body, glowing ember eyes, a skeletal bared-teeth snout, an
 * exposed rib wound on the flank, and a MANE OF FIRE running from the muzzle
 * back along the neck and spine. Faces +z (nav facing convention). Returns the
 * root group with `userData.joints` for the animation system + `userData.flames`
 * (the additive flame tongues, flickered each frame). ~0.7 m at the shoulder.
 *
 * Joint naming intentionally includes a `head` joint so the shared dismember
 * code (severHead) pops the skull on a headshot kill, and `core` doubles as the
 * "hips" pivot the corpse/ragdoll code tips the body over from.
 */

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
function pivot(x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); return g; }

// shared materials (built once; many hounds reuse them)
let _M = null;
function mats() {
  if (_M) return _M;
  _M = {
    fur: new THREE.MeshStandardMaterial({ color: 0x141110, roughness: 0.92, metalness: 0.0 }),     // charred black coat
    furDk: new THREE.MeshStandardMaterial({ color: 0x0c0a09, roughness: 0.95 }),                   // deepest shadow fur
    char: new THREE.MeshStandardMaterial({ color: 0x241612, roughness: 0.8, emissive: 0x3a0c02, emissiveIntensity: 0.35 }), // smouldering skin
    flesh: new THREE.MeshStandardMaterial({ color: 0x5a0e0e, roughness: 0.4, emissive: 0x2a0404, emissiveIntensity: 0.3 }),  // exposed wound flesh
    bone: new THREE.MeshStandardMaterial({ color: 0xcab98c, roughness: 0.7 }),                     // skull snout + ribs + teeth
    eye: new THREE.MeshStandardMaterial({ color: 0xffcb3a, emissive: 0xffae18, emissiveIntensity: 1.0 }), // glowing ember eyes
    claw: new THREE.MeshStandardMaterial({ color: 0x18140f, roughness: 0.5, metalness: 0.2 }),
    flameOut: new THREE.MeshBasicMaterial({ color: 0xff5a10, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    flameIn: new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  return _M;
}

// a flame tongue: an additive outer cone + a brighter inner cone, pointing +y.
// Pushed to `flames` so the anim system can flicker its scale/opacity. The
// little group lets us flicker scale around its base.
function flame(parent, flames, x, y, z, s = 1) {
  const M = mats();
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const out = new THREE.Mesh(new THREE.ConeGeometry(0.07 * s, 0.34 * s, 7, 1, true), M.flameOut);
  out.position.y = 0.17 * s;
  const inn = new THREE.Mesh(new THREE.ConeGeometry(0.04 * s, 0.22 * s, 6, 1, true), M.flameIn);
  inn.position.y = 0.12 * s;
  g.add(out, inn);
  g.raycast = () => {}; out.raycast = () => {}; inn.raycast = () => {}; // never blocks bullets
  parent.add(g);
  flames.push({ g, baseY: 0.17 * s, sx: g.scale.x, phase: Math.random() * Math.PI * 2, s });
  return g;
}

export function buildHoundRig() {
  const M = mats();
  const root = new THREE.Group();
  const J = {};
  const flames = [];

  // --- core body pivot (the "hips" the corpse code tips over from) ---
  const core = pivot(0, 0.6, 0); J.core = core; root.add(core);

  // hindquarters (rear haunch) — fixed to the core
  core.add(box(0.30, 0.30, 0.34, M.fur, 0, 0.0, -0.26));
  core.add(box(0.26, 0.24, 0.16, M.furDk, 0, -0.02, -0.42)); // rump

  // --- chest / front torso (its own pivot so the body can crouch + lunge) ---
  const chest = pivot(0, 0.02, 0.22); J.chest = chest; core.add(chest);
  chest.add(box(0.30, 0.30, 0.30, M.fur, 0, 0.0, 0.04));      // ribcage
  chest.add(box(0.24, 0.20, 0.12, M.furDk, 0, -0.04, 0.2));   // lower chest
  // EXPOSED RIB WOUND on the left flank (bone ribs over raw flesh, like the refs)
  chest.add(box(0.02, 0.16, 0.18, M.flesh, 0.16, 0.02, 0.02));
  for (let i = 0; i < 3; i++) chest.add(box(0.03, 0.02, 0.14, M.bone, 0.17, 0.08 - i * 0.06, 0.02));

  // belly bridging chest->hind so there's no gap
  core.add(box(0.24, 0.16, 0.4, M.furDk, 0, -0.1, -0.02));

  // --- neck + head ---
  const neck = pivot(0, 0.12, 0.34); neck.rotation.x = 0.5; J.neck = neck; chest.add(neck);
  neck.add(box(0.18, 0.18, 0.22, M.fur, 0, 0.02, 0.08));      // thick neck

  const head = pivot(0, 0.0, 0.2); head.rotation.x = -0.5; J.head = head; neck.add(head);
  head.add(box(0.17, 0.16, 0.18, M.fur, 0, 0.02, 0.04));      // skull base (furred)
  // skeletal bared snout (bone) — long muzzle + jaw with teeth, like the refs
  head.add(box(0.10, 0.09, 0.20, M.bone, 0, 0.0, 0.2));        // upper muzzle
  const jaw = pivot(0, -0.05, 0.08); J.jaw = jaw; head.add(jaw);
  jaw.add(box(0.09, 0.05, 0.17, M.bone, 0, -0.02, 0.14));     // lower jaw
  // teeth: tiny bone spikes top + bottom
  for (let i = 0; i < 4; i++) {
    head.add(box(0.012, 0.04, 0.012, M.bone, -0.03 + i * 0.02, -0.06, 0.22 + (i % 2) * 0.03));
    jaw.add(box(0.012, 0.035, 0.012, M.bone, -0.03 + i * 0.02, 0.03, 0.18 + (i % 2) * 0.03));
  }
  // pointed ears
  for (const sx of [-1, 1]) { const e = box(0.04, 0.1, 0.02, M.furDk, sx * 0.07, 0.12, -0.02); e.rotation.z = sx * -0.2; head.add(e); }
  // glowing ember eyes
  for (const sx of [-1, 1]) head.add(box(0.035, 0.03, 0.02, M.eye, sx * 0.055, 0.04, 0.14));

  // --- MANE OF FIRE: muzzle-back over the head, neck and down the spine ---
  flame(head, flames, 0, 0.12, -0.02, 1.05);
  flame(head, flames, -0.06, 0.1, 0.0, 0.8);
  flame(head, flames, 0.06, 0.1, 0.0, 0.8);
  flame(neck, flames, 0, 0.14, 0.04, 1.15);
  flame(neck, flames, 0, 0.14, -0.06, 1.0);
  flame(chest, flames, 0, 0.18, 0.02, 1.1);
  flame(chest, flames, 0, 0.16, -0.12, 0.95);
  flame(core, flames, 0, 0.18, -0.18, 1.0);
  flame(core, flames, 0, 0.14, -0.36, 0.8);

  // --- tail (drooped, animated sway) ---
  const tail = pivot(0, 0.02, -0.46); tail.rotation.x = 0.9; J.tail = tail; core.add(tail);
  tail.add(box(0.06, 0.06, 0.26, M.furDk, 0, 0, -0.13));
  tail.add(box(0.04, 0.04, 0.12, M.furDk, 0, 0.0, -0.3));

  // --- legs (gaunt) --- upper -> lower -> paw, reaching the floor (y world 0) ---
  const leg = (px, pz, key) => {
    const u = pivot(px, -0.02, pz); J[key + 'U'] = u; core.add(u);
    u.add(box(0.08, 0.28, 0.09, M.fur, 0, -0.14, 0));        // upper leg
    const l = pivot(0, -0.28, 0); J[key + 'L'] = l; u.add(l);
    l.add(box(0.06, 0.26, 0.07, M.furDk, 0, -0.13, 0));      // lower leg (thin)
    const p = box(0.08, 0.06, 0.14, M.claw, 0, -0.27, 0.03); J[key + 'P'] = p; l.add(p); // paw
    return u;
  };
  leg(0.13, 0.28, 'fl'); leg(-0.13, 0.28, 'fr');   // front legs (attach near chest)
  leg(0.14, -0.26, 'bl'); leg(-0.14, -0.26, 'br'); // back legs (haunches)

  root.userData.joints = J;
  root.userData.flames = flames;
  root.userData.hound = true;
  root.userData.rest = {
    coreY: 0.6, neck: 0.5, head: -0.5, tail: 0.9,
    legU: 0, legL: 0,
  };
  root.userData.noBulletFx = true; // bullets make blood, never holes/debris
  return root;
}
