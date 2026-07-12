import * as THREE from 'three';
import { ps1Snap } from '../rendering/ps1.js';

// Lever throw endpoints (shared with PowerSystem so the anim matches the rig).
// OFF: the arm pokes STRAIGHT OUT at the player (~90°). ON: flipped up, vertical.
export const LEVER_OFF = Math.PI / 2;
export const LEVER_ON = -0.05;

/**
 * The map power switch — the classic zombies wall box: a weathered iron cabinet
 * with three voltmeter gauges up top, a recessed bank of three knife switches,
 * a hazard/electrocution plate, and the big red main lever… gripped by a
 * severed, gorified zombie hand. Wall-mounted; faces -x by default (place it on
 * an east wall) — rotate the returned group to aim it elsewhere.
 *
 * The main lever is its own pivot group (rotates about its base hinge) with the
 * hand parented to it, so PowerSystem can animate the throw and the hand pulls
 * down with it. Gauges' needles + faces glow only once power is on.
 *
 * Returns { group, lever, needles, gaugeMats } — lever is the pivot to animate,
 * needles are meshes to swing to "live", gaugeMats light up on power.
 */
function gaugeFaceTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#e8e4d2'; x.fillRect(0, 0, 128, 128);
  // arc of ticks
  x.strokeStyle = '#20211c'; x.lineWidth = 2;
  x.beginPath(); x.arc(64, 78, 46, Math.PI * 1.15, Math.PI * 1.85); x.stroke();
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 1.15 + (Math.PI * 0.7) * (i / 10);
    const r0 = 40, r1 = i % 5 === 0 ? 30 : 35;
    x.lineWidth = i % 5 === 0 ? 3 : 1.5;
    x.beginPath();
    x.moveTo(64 + Math.cos(a) * r0, 78 + Math.sin(a) * r0);
    x.lineTo(64 + Math.cos(a) * r1, 78 + Math.sin(a) * r1);
    x.stroke();
  }
  x.fillStyle = '#8a1414'; x.font = 'bold 13px monospace'; x.textAlign = 'center';
  x.fillText('VOLTS', 64, 104);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

function hazardTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#d8b31e'; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = '#111'; x.lineWidth = 6; x.strokeRect(3, 3, 122, 122);
  // lightning-bolt man
  x.fillStyle = '#111';
  x.beginPath();
  x.moveTo(74, 20); x.lineTo(52, 66); x.lineTo(66, 66); x.lineTo(50, 108);
  x.lineTo(88, 56); x.lineTo(72, 56); x.lineTo(90, 20); x.closePath(); x.fill();
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

export function buildPowerSwitch() {
  const group = new THREE.Group();

  const iron = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x3c4148, roughness: 0.85, metalness: 0.55 }));
  const ironDark = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.9, metalness: 0.4 }));
  const rust = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x5a4432, roughness: 1, metalness: 0.2 }));
  const brass = ps1Snap(new THREE.MeshStandardMaterial({ color: 0xb08440, roughness: 0.5, metalness: 0.8 }));
  const red = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x7a1512, roughness: 0.6, metalness: 0.2 }));

  // --- cabinet: a tall iron box, front face pointing -x ---
  const W = 1.05, H = 1.75, D = 0.22;
  const body = new THREE.Mesh(new THREE.BoxGeometry(D, H, W), iron);
  body.castShadow = true; body.receiveShadow = true;
  group.add(body);
  // rusty streaks: a couple of proud panels
  for (const sy of [0.55, -0.5]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(D + 0.015, 0.12, W * 0.8), rust);
    p.position.set(0, sy, 0); group.add(p);
  }
  const front = -D / 2 - 0.001; // outward (-x) face of the cabinet

  // --- three voltmeter gauges across the top ---
  const gaugeTex = gaugeFaceTexture();
  const needles = [];
  const gaugeMats = [];
  for (let i = 0; i < 3; i++) {
    const gz = (i - 1) * 0.32;
    const gy = 0.55;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 20), ironDark);
    ring.rotation.z = Math.PI / 2; ring.position.set(front, gy, gz); group.add(ring);
    const faceMat = new THREE.MeshStandardMaterial({ map: gaugeTex, emissive: 0xfff2c0, emissiveIntensity: 0 });
    gaugeMats.push(faceMat);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), faceMat);
    face.rotation.y = -Math.PI / 2; face.position.set(front - 0.031, gy, gz); group.add(face);
    // needle — pivots to a "live" reading once power is on
    const nPivot = new THREE.Group(); nPivot.position.set(front - 0.033, gy, gz);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.11, 0.012), red);
    needle.position.y = 0.045; nPivot.add(needle);
    nPivot.rotation.x = 0.9; // resting (dead) to the left
    group.add(nPivot);
    needles.push(nPivot);
  }

  // --- hazard plate (upper right) ---
  const hazard = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: hazardTexture() }));
  hazard.rotation.y = -Math.PI / 2; hazard.position.set(front - 0.002, 0.18, 0.34); group.add(hazard);

  // --- recessed knife-switch bank (three forks) in a dark panel ---
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.66), ironDark);
  panel.position.set(front + 0.03, 0.02, -0.06); group.add(panel);
  for (let i = 0; i < 3; i++) {
    const kz = -0.06 + (i - 1) * 0.2;
    for (const rail of [-0.09, 0.09]) { // two copper contacts per switch
      const contact = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.34, 0.03), brass);
      contact.position.set(front - 0.02, 0.02 + rail * 0, kz + rail); group.add(contact);
      contact.position.y = 0.02;
    }
    // the throw blade, half-closed
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.035), brass);
    blade.position.set(front - 0.03, 0.1, kz); blade.rotation.z = 0.5; group.add(blade);
  }

  // --- the big red MAIN LEVER (pivot) + gorified zombie hand ---
  // The loudest thing on the box: a long arm that pokes STRAIGHT OUT at the
  // player (~90°) while power is off, then is flipped UP to vertical on throw.
  const redBright = ps1Snap(new THREE.MeshStandardMaterial({ color: 0xc21b16, roughness: 0.42, metalness: 0.2, emissive: 0x330604, emissiveIntensity: 0.75 }));
  const lever = new THREE.Group();               // hinge proud of the face, lower-centre
  lever.position.set(front - 0.05, -0.34, 0.0);  // low enough that flipping UP tucks under the gauge row
  // hinge collar (pin runs into the wall, along z)
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.14, 16), ironDark);
  collar.rotation.x = Math.PI / 2; lever.add(collar);
  const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 12), brass);
  boss.rotation.x = Math.PI / 2; lever.add(boss);
  // long arm (points +y locally; rotation.z aims it out / up)
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.05, 0.5, 12), ironDark);
  shaft.position.y = 0.27; lever.add(shaft);
  const collarUp = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 12), brass);
  collarUp.position.y = 0.5; lever.add(collarUp);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.28, 16), redBright);
  grip.position.y = 0.66; lever.add(grip);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 12), redBright);
  knob.position.y = 0.83; lever.add(knob);

  // severed zombie hand clamped over the red grip — its "peak" grip. Parented to
  // the lever so it rides the throw. The grip axis is the lever's local +y, so
  // the hand is rolled to wrap that axis.
  const hand = buildZombieHand();
  hand.position.set(0.0, 0.64, 0);
  hand.rotation.set(0, 0, -Math.PI / 2 - 0.15); // palm onto the grip, fingers over the top
  hand.scale.setScalar(1.15);
  lever.add(hand);

  lever.rotation.z = LEVER_OFF; // poking straight out at the player (off)
  group.add(lever);

  // a red cable drooping off the lever base (matches the reference)
  const cable = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.02, 6, 16, Math.PI * 1.3), new THREE.MeshStandardMaterial({ color: 0x7a1a14, roughness: 0.7 }));
  cable.position.set(front - 0.04, -0.7, 0.14); cable.rotation.set(Math.PI / 2, 0, 0.3); group.add(cable);

  group.userData = { lever, needles, gaugeMats };
  return group;
}

/** A rotting severed hand: palm + four curled fingers + thumb, sinew-red at the
 *  wrist stump. Small, meant to clamp a lever. */
function buildZombieHand() {
  const g = new THREE.Group();
  const flesh = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x6f7a5a, roughness: 0.95 })); // greyed rot
  const wound = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x5a0e0e, roughness: 0.4, metalness: 0.05 })); // wet stump
  const bone = ps1Snap(new THREE.MeshStandardMaterial({ color: 0xd8cdb0, roughness: 0.8 }));

  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.06), flesh);
  g.add(palm);
  // wrist stump (down), exposed bone + gore
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 10), flesh);
  wrist.position.y = -0.11; g.add(wrist);
  const stump = new THREE.Mesh(new THREE.CircleGeometry(0.045, 10), wound);
  stump.rotation.x = Math.PI / 2; stump.position.y = -0.16; g.add(stump);
  const boneNub = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6), bone);
  boneNub.position.y = -0.17; g.add(boneNub);
  // four curled fingers gripping forward (+x, over the lever grip)
  for (let i = 0; i < 4; i++) {
    const fz = (i - 1.5) * 0.032;
    const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.026), flesh);
    knuckle.position.set(0.06, 0.05, fz); g.add(knuckle);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.028, 0.024), flesh);
    tip.position.set(0.085, 0.02, fz); tip.rotation.z = -0.9; g.add(tip); // curled down to clamp
  }
  // thumb wrapping the other side
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.026), flesh);
  thumb.position.set(0.05, 0.0, -0.06); thumb.rotation.y = 0.6; g.add(thumb);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}
