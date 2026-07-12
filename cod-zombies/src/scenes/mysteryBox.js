import * as THREE from 'three';
import { ps1Snap } from '../rendering/ps1.js';
import { makeWeapon, BOX_POOL } from '../weapons/catalog.js';
import { buildWeaponModel } from '../weapons/weaponModels.js';
import { mergeStatic } from '../util/mergeStatic.js';

/**
 * The classic zombies mystery box: a long, weathered wooden ammo crate sitting
 * on cinder blocks, two glowing question marks on the hinged lid. When in use it
 * flips open, raises a spinning, glowing weapon to eye level, then lowers it
 * back in over the hold window. Pure visuals — the EconomySystem owns the timing
 * and writes live state to the shared economy.box object, which the
 * MysteryBoxSystem reads to drive this rig.
 */

// --- procedural textures ---------------------------------------------------
function plankTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#6b4a24';
  x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i++) {
    const n = (Math.sin(i * 12.9) * 43758.5) % 1;
    x.fillStyle = `rgba(0,0,0,${0.04 + Math.abs(n) * 0.06})`;
    x.fillRect(0, i, 128, 1);
  }
  // plank seams
  x.strokeStyle = 'rgba(20,12,4,0.7)';
  x.lineWidth = 2;
  for (let y = 16; y < 128; y += 26) { x.beginPath(); x.moveTo(0, y); x.lineTo(128, y); x.stroke(); }
  // faint stenciled text bands
  x.fillStyle = 'rgba(30,20,8,0.5)';
  x.font = 'bold 9px monospace';
  x.fillText('7.62 RIFLE ROUNDS', 8, 60);
  x.fillText('LOT MK4 — 1942', 14, 96);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function questionTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 128, 128);
  x.fillStyle = '#ffd27a';
  x.font = 'bold 110px Georgia, serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('?', 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

function promptTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 256, 128);
  // key cap
  x.strokeStyle = '#dff1ff'; x.lineWidth = 5;
  x.fillStyle = 'rgba(20,40,70,0.55)';
  roundRect(x, 94, 18, 68, 60, 10); x.fill(); x.stroke();
  x.fillStyle = '#eaf6ff';
  x.font = 'bold 44px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('E', 128, 50);
  x.font = 'bold 26px Arial';
  x.fillStyle = '#bfe3ff';
  x.fillText('TAKE WEAPON', 128, 104);
  const t = new THREE.CanvasTexture(c);
  return t;
}

function radialGlow() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(150,200,255,0.9)');
  g.addColorStop(1, 'rgba(80,150,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function roundRect(x, px, py, w, h, r) {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}

// give a weapon model a soft emissive glow + a white rim shell
function addHighlight(model) {
  const meshes = [];
  model.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) {
    if (m.material && m.material.emissive !== undefined) {
      m.material = m.material.clone();
      m.material.emissive = new THREE.Color(0x5a93ff);
      m.material.emissiveIntensity = 0.4;
    }
    const shell = new THREE.Mesh(
      m.geometry,
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    shell.scale.setScalar(1.08);
    m.add(shell);
  }
}

// --- build -----------------------------------------------------------------
export function buildMysteryBox() {
  const group = new THREE.Group();
  const L = 1.95, H = 0.5, D = 0.66; // crate body
  const legH = 0.42;                 // cinder block height
  const topY = legH + H;             // crate top surface

  const wood = plankTexture();
  const woodMat = ps1Snap(new THREE.MeshStandardMaterial({ map: wood, color: 0x8a6a3c, roughness: 1, metalness: 0 }));
  const blockMat = ps1Snap(new THREE.MeshStandardMaterial({ color: 0x9a9a90, roughness: 1 }));

  // cinder block supports
  for (const sx of [-L / 2 + 0.25, -0.2, 0.2, L / 2 - 0.25]) {
    const blk = new THREE.Mesh(new THREE.BoxGeometry(0.34, legH, 0.42), blockMat);
    blk.position.set(sx, legH / 2, 0);
    blk.castShadow = true;
    group.add(blk);
  }

  // crate body
  const body = new THREE.Mesh(new THREE.BoxGeometry(L, H, D), woodMat);
  body.position.y = legH + H / 2;
  body.castShadow = true;
  group.add(body);

  // hinged lid, pivoting at the back top edge
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, topY, -D / 2);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(L, 0.09, D), woodMat);
  lid.position.set(0, 0.045, D / 2);
  lidPivot.add(lid);
  // metal strap across the lid
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, D + 0.02), ps1Snap(new THREE.MeshStandardMaterial({ color: 0x3a352c, roughness: 0.8, metalness: 0.4 })));
  strap.position.set(0, 0.05, D / 2);
  lidPivot.add(strap);
  // two glowing question marks on the lid
  const qTex = questionTexture();
  const qMarks = [];
  for (const qx of [-L / 4, L / 4]) {
    const q = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.34),
      new THREE.MeshBasicMaterial({ map: qTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    q.rotation.x = -Math.PI / 2;
    q.position.set(qx, 0.1, D / 2);
    lidPivot.add(q);
    qMarks.push(q);
  }
  group.add(lidPivot);

  // gun display rig (rises from inside the crate)
  const gunAnchor = new THREE.Group();
  gunAnchor.position.set(0, topY, 0);
  const models = new Map();
  for (const key of BOX_POOL) {
    const m = buildWeaponModel(makeWeapon(key)).group;
    m.scale.setScalar(1.6);
    m.rotation.y = Math.PI / 2; // present broadside
    addHighlight(m);
    // The box pre-builds EVERY weapon model (so a reveal never hitches) and shows
    // one at a time, rotating as a whole — nothing inside animates here. Collapse
    // each from hundreds of primitives/materials into a few merged meshes: same
    // look, a fraction of the scene-graph nodes, materials and traversal cost.
    // `m` stays the toggle handle for the reveal; only its innards are merged.
    mergeStatic(m);
    m.visible = false;
    gunAnchor.add(m);
    models.set(key, m);
  }
  group.add(gunAnchor);

  // blue point light (off until in use)
  const light = new THREE.PointLight(0x5aa8ff, 0, 7, 2);
  light.position.set(0, topY + 0.7, 0);
  group.add(light);

  // aura: a rising column of glowing motes (replaces the old crossed beam
  // sheets) + a soft ground glow, all additive blue. The motes are GPU Points
  // animated by MysteryBoxSystem so the box breathes light when in use.
  const aura = new THREE.Group();
  const PCOUNT = 110;
  const colH = 2.1; // column height the motes rise through
  const pgeo = new THREE.BufferGeometry();
  const ppos = new Float32Array(PCOUNT * 3);
  const pseed = new Float32Array(PCOUNT);
  for (let i = 0; i < PCOUNT; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * L * 0.42;
    ppos[i * 3] = Math.cos(a) * r;
    ppos[i * 3 + 1] = Math.random() * colH;
    ppos[i * 3 + 2] = Math.sin(a) * r * (D / L);
    pseed[i] = 0.55 + Math.random() * 0.9; // rise speed
  }
  pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
  const particles = new THREE.Points(pgeo, new THREE.PointsMaterial({
    map: radialGlow(), color: 0x8ec8ff, size: 0.17, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  particles.position.y = topY + 0.05;
  particles.frustumCulled = false;
  particles.raycast = () => {};
  aura.add(particles);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(L * 1.3, D * 3.2),
    new THREE.MeshBasicMaterial({ map: radialGlow(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = topY + 0.02;
  ground.raycast = () => {};
  aura.add(ground);
  group.add(aura);

  // world-space "[E] TAKE WEAPON" prompt, billboarded by the system
  const prompt = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.45),
    new THREE.MeshBasicMaterial({ map: promptTexture(), transparent: true, depthWrite: false, depthTest: false }),
  );
  prompt.position.set(0, topY + 1.5, 0);
  prompt.renderOrder = 999;
  prompt.visible = false;
  group.add(prompt);

  group.userData = {
    lidPivot, gunAnchor, models, light, aura, ground, prompt, qMarks, topY, lidAngle: 0,
    particles: { points: particles, seed: pseed, h: colH },
  };
  return group;
}
