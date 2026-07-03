import * as THREE from 'three';
import { buildZombieRig } from '../scenes/zombieRig.js';

/**
 * Edward Richtofen — "The Scientist" (Axis-Victory timeline). Built off the
 * shared human rig, then decorated bespoke to mimic his look: dark slicked-back
 * side-parted hair + moustache, pale gaunt skin with cold blue eyes, a worn tan
 * leather waistcoat over a light collared dress shirt (sleeves rolled to bare
 * forearms), a leather bandolier of vials across the chest, a buckled belt with
 * a hip pouch, and grey trousers.
 */

const std = (color, roughness = 0.7, metalness = 0.04) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const basic = (color) => new THREE.MeshBasicMaterial({ color });

function mats() {
  return {
    flesh: std(0xcaa585, 0.6),     // pale European skin
    eye: std(0x0c0e13, 0.4),
    iris: std(0x4c7390, 0.35),     // cold pale-blue eyes
    hair: std(0x1b1510, 0.78),     // near-black dark brown, slicked
    shirt: std(0xbcc4c9, 0.72),    // light grey-blue dress shirt (sleeves)
    vest: std(0x94875c, 0.74),     // worn tan/olive leather waistcoat
    vestDk: std(0x6d6340, 0.82),
    strap: std(0x4a3324, 0.68),    // dark brown leather
    pants: std(0x474e56, 0.86),    // grey-blue trousers
    shoe: std(0x1b1610, 0.7),
    brass: std(0x9c7b32, 0.42, 0.55),
    glass: std(0x2f9ab0, 0.3, 0.1),
    glow: basic(0x66f0e6),
    blood: std(0x5e1410, 0.7),
  };
}

// centred box helper (matches the rig's own)
function box(w, h, d, mat, x = 0, y = 0, z = 0, rot) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function buildRichtofen() {
  const M = mats();
  const look = { human: true, skin: { flesh: M.flesh, shirt: M.shirt, pants: M.pants, shoe: M.shoe, eye: M.eye } };
  const rig = buildZombieRig(look);
  const J = rig.userData.joints;

  addHead(J.head, M);
  addOutfit(J.torso, M);
  addBloodFlecks(J, M);
  return rig;
}

// --- head: slicked-back parted hair, two-strip moustache, cold blue irises ---
function addHead(head, M) {
  // hair — thick on top, tapering thin down the sides, fading out under the ear
  head.add(box(0.238, 0.105, 0.21, M.hair, 0, 0.315, -0.02));           // crown (thick, on top)
  head.add(box(0.206, 0.13, 0.05, M.hair, 0, 0.228, -0.116));           // back — stops at the hairline
  for (const s of [-1, 1]) head.add(box(0.02, 0.10, 0.19, M.hair, s * 0.117, 0.278, -0.02));   // upper sides (above the ear)
  for (const s of [-1, 1]) head.add(box(0.014, 0.075, 0.045, M.hair, s * 0.115, 0.223, 0.06)); // thin sideburn, fades under the ear
  head.add(box(0.205, 0.075, 0.10, M.hair, 0.012, 0.345, 0.05, [0.28, 0, -0.06]));             // swept-up front
  head.add(box(0.05, 0.07, 0.05, M.hair, -0.078, 0.322, 0.093, [0.15, 0.2, -0.25]));           // forelock swoop (left)

  // a longer nose (taller bridge + tip), sitting over the base human nose
  head.add(box(0.04, 0.095, 0.05, M.flesh, 0, 0.172, 0.12));

  // two-strip moustache under the nose (a gap at the philtrum), no beard
  for (const s of [-1, 1]) head.add(box(0.052, 0.022, 0.032, M.hair, s * 0.034, 0.122, 0.117));

  // cold blue irises tucked behind the rig's dark pupils
  for (const s of [-1, 1]) head.add(box(0.034, 0.03, 0.02, M.iris, s * 0.05, 0.214, 0.119));
}

// --- torso outfit -----------------------------------------------------------
function addOutfit(t, M) {
  // open shirt collar around the neck (light)
  for (const s of [-1, 1]) t.add(box(0.09, 0.13, 0.05, M.shirt, s * 0.078, 0.47, 0.115, [0, 0, s * 0.32]));

  // waistcoat — a REAL vest that wraps the whole torso: front panel, both
  // sides, and a back panel, not just a plate slapped on the chest
  t.add(box(0.43, 0.47, 0.035, M.vest, 0, 0.27, 0.135));                // front
  t.add(box(0.44, 0.47, 0.035, M.vest, 0, 0.27, -0.135));              // back
  for (const s of [-1, 1]) t.add(box(0.035, 0.47, 0.30, M.vest, s * 0.216, 0.27, 0)); // wrap around the sides
  t.add(box(0.06, 0.2, 0.02, M.shirt, 0, 0.41, 0.156));                 // shirt V at the opening
  for (const by of [0.35, 0.29, 0.23, 0.17]) t.add(box(0.02, 0.02, 0.02, M.vestDk, 0, by, 0.156)); // buttons
  for (const s of [-1, 1]) t.add(box(0.13, 0.10, 0.02, M.vestDk, s * 0.11, 0.15, 0.152));          // lower pockets

  // leather straps across the chest (a bandolier over the shoulder + a chest belt)
  t.add(box(0.055, 0.64, 0.03, M.strap, -0.02, 0.28, 0.17, [0, 0, 0.62]));
  t.add(box(0.42, 0.05, 0.03, M.strap, 0, 0.30, 0.168));
  for (const s of [-1, 1]) t.add(box(0.045, 0.045, 0.02, M.brass, s * 0.16, 0.30, 0.185)); // strap rings

  // vials clipped to the bandolier, clustered off to his right (our left)
  for (let i = 0; i < 3; i++) {
    const vx = -0.11 + i * 0.045;
    t.add(box(0.026, 0.085, 0.028, M.glass, vx, 0.235, 0.188));
    t.add(box(0.028, 0.02, 0.03, M.glow, vx, 0.283, 0.188));
  }

  // buckled waist belt + a hip pouch
  t.add(box(0.45, 0.06, 0.285, M.strap, 0, 0.03, 0));
  t.add(box(0.075, 0.05, 0.02, M.brass, 0, 0.03, 0.147));
  t.add(box(0.13, 0.15, 0.075, M.strap, 0.175, 0.0, 0.1));
}

// --- a scatter of dried blood, per his gory portraits -----------------------
function addBloodFlecks(J, M) {
  const spot = (parent, x, y, z, s = 0.02) => parent.add(box(s, s, 0.006, M.blood, x, y, z));
  spot(J.head, 0.06, 0.24, 0.118, 0.02);
  spot(J.head, -0.05, 0.19, 0.118, 0.016);
  spot(J.head, 0.02, 0.30, 0.115, 0.014);
  spot(J.torso, 0.12, 0.33, 0.157, 0.03);
  spot(J.torso, -0.09, 0.2, 0.157, 0.022);
  spot(J.torso, 0.05, 0.12, 0.157, 0.026);
}
