import * as THREE from 'three';
import { buildZombieRig } from './zombieRig.js';
import { randomZombieLook } from './zombieAssets.js';
import { selectedBuild, onCharacterChange } from '../characters/selection.js';
import { autoTagNoAO } from '../rendering/aoMask.js';

/**
 * The main-menu backdrop: a separate, self-lit THREE scene — a dark snowy
 * conifer forest at night with a lone survivor leaning languidly against a
 * tree, arms crossed and one boot propped behind him, warming at a campfire
 * ringed by three log seats (the future co-op spots). Falling snow + a flickery
 * fire glow sell the cold. Rendered by RenderSystem whenever the game isn't
 * being played; animated by MenuSystem.
 *
 * It carries its OWN lights (a fixed count, compiled once) so it can be genuinely
 * dark without fighting the bright arena rig — and so swapping to it never churns
 * the arena's shaders.
 */
export function buildMenuScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06060f);
  scene.fog = new THREE.FogExp2(0x0c1426, 0.02);

  // --- the cosmic nebula sky (a fog-immune skydome behind everything) ---
  scene.add(buildSkydome());

  // --- lights (cold moonlight key + warm fire) ---
  scene.add(new THREE.HemisphereLight(0x44597e, 0x0a0e14, 1.0));
  scene.add(new THREE.AmbientLight(0x1d2a3c, 0.7));
  const moon = new THREE.DirectionalLight(0x91a8d6, 1.25); // cool key/rim from behind-left
  moon.position.set(-7, 11, -8);
  scene.add(moon);
  const fill = new THREE.DirectionalLight(0x6f86b4, 0.45);  // soft front fill so faces read
  fill.position.set(2, 4, 7);
  scene.add(fill);
  // the campfire's warm pool of light (flickered in update) — local to this scene
  const fireLight = new THREE.PointLight(0xff7a2a, 5.5, 15, 2);
  fireLight.position.set(0.35, 0.75, 0.75);
  scene.add(fireLight);

  // --- snowy ground ---
  const snowMat = new THREE.MeshStandardMaterial({ color: 0x9fb0c4, roughness: 0.95, metalness: 0.0 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), snowMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  scene.add(ground);
  // a faint warm scorch under the fire (melted snow ring)
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(0.95, 24), new THREE.MeshBasicMaterial({ color: 0x241410 }));
  scorch.rotation.x = -Math.PI / 2; scorch.position.set(0.35, 0.012, 0.75);
  scene.add(scorch);

  // distant snow-capped mountains ringing the horizon (fogged for depth)
  buildMountains(scene);

  // --- conifer forest: dark layered silhouettes receding into the fog ---
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x241c16, roughness: 0.9 });
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x0e1a16, roughness: 1.0 });
  const snowCapMat = new THREE.MeshStandardMaterial({ color: 0xaebccd, roughness: 0.9 });
  const conifer = (x, z, s = 1) => {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 1.4 * s, 6), trunkMat);
    trunk.position.y = 0.7 * s; g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const tier = new THREE.Mesh(new THREE.ConeGeometry((0.9 - i * 0.22) * s, (1.5 - i * 0.25) * s, 7), foliageMat);
      tier.position.y = (1.3 + i * 0.95) * s; g.add(tier);
      const cap = new THREE.Mesh(new THREE.ConeGeometry((0.9 - i * 0.22) * s * 0.7, (0.4) * s, 7), snowCapMat);
      cap.position.y = (1.7 + i * 0.95) * s; g.add(cap);
    }
    g.rotation.y = Math.random() * Math.PI;
    return g;
  };
  // a dense ring of trees, bigger toward the back, leaving the front open. A far
  // band closes off the background so you never see past the treeline.
  for (let i = 0; i < 110; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 6 + Math.random() * 34;
    const x = Math.cos(a) * r, z = Math.sin(a) * r - 2;
    if (z > 3.5 && Math.abs(x) < 5) continue; // keep the foreground (toward camera) clear
    scene.add(conifer(x, z, 0.9 + Math.random() * 1.9));
  }
  // a tight back wall of trees so the horizon reads as forest, not void
  for (let i = 0; i < 34; i++) {
    const x = -34 + i * 2 + (Math.random() - 0.5) * 1.5;
    scene.add(conifer(x, -22 - Math.random() * 8, 1.6 + Math.random() * 1.6));
  }

  // low ground foliage: snowy bushes, rocks and dead-grass tufts
  scatterFoliage(scene, conifer);

  // --- the hero tree the survivor leans on (directly behind him) ---
  const heroTree = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.44, 4.8, 10), trunkMat);
  heroTree.position.set(3.15, 2.4, -0.7); heroTree.rotation.z = 0.06;
  scene.add(heroTree);

  // --- the survivor, leaning (the hero) — this IS the selected player character,
  //     posed by the fire; rebuilt in place whenever the Armory changes who you play ---
  const mkSurvivor = () => {
    const rig = buildSurvivor(selectedBuild());
    rig.position.set(2.55, 0, 0.35);
    rig.rotation.y = -1.05; // angled toward the fire / camera so the crossed arms read
    rig.scale.setScalar(1.18);
    return rig;
  };
  let survivor = mkSurvivor();
  scene.add(survivor);
  onCharacterChange(() => {
    scene.remove(survivor);
    survivor.traverse((o) => { if (o.isMesh) { o.geometry?.dispose?.(); const m = o.material; Array.isArray(m) ? m.forEach((x) => x?.dispose?.()) : m?.dispose?.(); } });
    survivor = mkSurvivor();
    scene.add(survivor);
  });
  // dedicated warm key + a cool back-rim so he pops off the dark forest
  const keyLight = new THREE.PointLight(0xffc080, 7.0, 10, 2);
  keyLight.position.set(1.5, 1.8, 1.7);
  scene.add(keyLight);
  const rimLight = new THREE.PointLight(0x9fb6e0, 2.0, 8, 2);
  rimLight.position.set(3.6, 2.4, -1.0);
  scene.add(rimLight);

  // --- campfire + three log seats ---
  const fire = buildCampfire();
  fire.position.set(0.35, 0, 0.75);
  scene.add(fire);

  // --- a few zombies shambling aimlessly out in the foggy distance ---
  const wanderers = buildWanderers(scene);

  // --- falling snow ---
  const snow = buildSnow();
  scene.add(snow.points);

  // exclude the campfire flames/glow + snow (light-emitting / FX) from AO
  autoTagNoAO(scene);

  return {
    scene,
    fireLight,
    snow,
    update(dt, t) {
      // flicker the fire light + flames
      const fl = 2.6 + Math.sin(t * 21) * 0.5 + Math.sin(t * 7.3) * 0.4 + (Math.random() - 0.5) * 0.5;
      fireLight.intensity = Math.max(1.5, fl);
      for (const f of fire.userData.flames) {
        const ph = f.userData.ph;
        f.scale.set(0.8 + 0.25 * Math.sin(t * 11 + ph), Math.max(0.3, 0.7 + 0.5 * Math.sin(t * 15 + ph)), 0.8 + 0.25 * Math.cos(t * 13 + ph));
      }
      // breathing idle on the survivor
      survivor.userData.idle?.(t);
      // the distant dead shuffle around
      for (const w of wanderers) animateWanderer(w, dt);
      // snow drift
      snow.update(dt);
    },
  };
}

// The survivor's material "look" (bare-skin, de-zombified). Shared so anything
// that needs the SAME hero — e.g. the fallen body in the death cinematic —
// renders the identical character we pose on the menu.
export function survivorLook() {
  return {
    human: true, // build the humanized face (eyes+pupils, nose, ears; no zombie plate)
    flesh: new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.65 }),      // human skin
    shirt: new THREE.MeshStandardMaterial({ color: 0x6a4a32, roughness: 0.7 }),       // worn leather jacket (warm, catches firelight)
    pants: new THREE.MeshStandardMaterial({ color: 0x44474e, roughness: 0.82 }),      // grey trousers
    shoe: new THREE.MeshStandardMaterial({ color: 0x1c1812, roughness: 0.7 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x0c0d11, roughness: 0.4 }),          // dark, NOT glowing
  };
}

// --- the leaning survivor (any character rig, posed by the fire) -------------
function buildSurvivor(build) {
  const rig = build ? build() : buildZombieRig(survivorLook()); // selected character, or the bare survivor
  const J = rig.userData.joints;

  // lean the whole body back onto the tree
  rig.rotation.x = -0.16;

  // arms crossed over the chest with a relaxed ~90° elbow bend: upper arms drop
  // down + slightly forward with the elbows out to the sides, then the forearms
  // fold horizontally across the front, one tucked over the other.
  J.shoulderL.rotation.set(-1.07, 0.04, 0.28); // left arm a touch more forward — rides on top
  J.elbowL.rotation.set(-0.05, 0, 1.5);
  J.shoulderR.rotation.set(-0.95, -0.04, -0.28);
  J.elbowR.rotation.set(-0.05, 0, -1.5);

  // one boot propped back against the trunk (left leg), right leg bears the weight
  J.thighL.rotation.set(0.15, 0, 0.05);
  J.kneeL.rotation.x = 1.45;
  J.thighR.rotation.set(-0.05, 0, -0.04);
  J.kneeR.rotation.x = 0.08;

  // head tilted down, gazing into the fire
  J.head.rotation.set(0.22, -0.25, 0.05);
  // settle the torso a touch
  J.torso.rotation.x = 0.05;

  // store rest values we breathe around
  const baseTorsoX = J.torso.rotation.x, baseHeadX = J.head.rotation.x, baseHipY = J.hips.position.y;
  rig.userData.idle = (t) => {
    const b = Math.sin(t * 1.1);
    J.torso.rotation.x = baseTorsoX + b * 0.015;
    J.head.rotation.x = baseHeadX + Math.sin(t * 1.1 + 0.6) * 0.02;
    J.hips.position.y = baseHipY + b * 0.006;
  };
  return rig;
}

// --- campfire: stacked logs + a cluster of additive flame cones + embers -------
function buildCampfire() {
  const g = new THREE.Group();
  const logMat = new THREE.MeshStandardMaterial({ color: 0x3a2616, roughness: 0.9 });
  const charMat = new THREE.MeshStandardMaterial({ color: 0x140d08, roughness: 1.0, emissive: 0x401403, emissiveIntensity: 0.5 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.95 });

  // ring of stones
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13 + Math.random() * 0.06), stoneMat);
    s.position.set(Math.cos(a) * 0.62, 0.06, Math.sin(a) * 0.62);
    s.rotation.set(Math.random(), Math.random(), Math.random());
    g.add(s);
  }
  // burning logs criss-crossed in the centre
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.8, 7), i < 2 ? charMat : logMat);
    log.position.set(0, 0.1, 0); log.rotation.set(Math.PI / 2, a, (Math.random() - 0.5) * 0.2);
    g.add(log);
  }

  // additive flame tongues (flickered in update)
  const flames = [];
  const cols = [0xff2a06, 0xff5a14, 0xff8a1e, 0xffc23a, 0xffe87a];
  for (let i = 0; i < 9; i++) {
    const c = cols[(Math.random() * cols.length) | 0];
    const f = new THREE.Mesh(
      new THREE.ConeGeometry(0.1 + Math.random() * 0.08, 0.5 + Math.random() * 0.5, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    f.position.set((Math.random() - 0.5) * 0.3, 0.25 + Math.random() * 0.35, (Math.random() - 0.5) * 0.3);
    f.userData.ph = Math.random() * 6.28;
    f.raycast = () => {};
    g.add(f); flames.push(f);
  }
  // a hot core glow
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff8a30, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.position.y = 0.3; g.add(core);

  // --- three log seats evenly RINGING the fire (the future co-op spots), each
  // laid tangent to the circle ---
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 0.9 });
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x2e2014, roughness: 0.95 });
  const seatR = 1.5;
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i / 3) * Math.PI * 2; // one log toward the camera, two back
    const grp = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.23, 1.5, 10), seatMat);
    seat.rotation.z = Math.PI / 2; grp.add(seat);
    // a couple of cut-end rings so it reads as a felled log
    for (const ex of [-0.75, 0.75]) { const end = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.235, 0.04, 10), barkMat); end.rotation.z = Math.PI / 2; end.position.x = ex; grp.add(end); }
    grp.position.set(Math.cos(a) * seatR, 0.21, Math.sin(a) * seatR);
    grp.rotation.y = Math.PI / 2 - a; // lay the log TANGENT to the ring (long side faces the fire, you sit on top facing in)
    g.add(grp);
  }

  g.userData.flames = flames;
  return g;
}

// --- cosmic nebula skydome (a painted equirect canvas on a huge inverted sphere,
//     immune to fog so the forest fogs to a silhouette against the stars) -------
function buildSkydome() {
  const w = 2048, h = 1024;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  // vertical gradient: deep violet zenith -> indigo -> dark blue horizon
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0.0, '#241653'); g.addColorStop(0.32, '#2c2068');
  g.addColorStop(0.52, '#1b2257'); g.addColorStop(0.66, '#101a44');
  g.addColorStop(1.0, '#070b1c');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  // soft nebula clouds (additive). The bright galactic core sits at u~0.72 so it
  // lands in the camera's forward view; smaller wisps spread the colour around.
  x.globalCompositeOperation = 'lighter';
  const cloud = (cx, cy, r, col, a) => { const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); x.globalAlpha = a; x.fillStyle = rg; x.fillRect(cx - r, cy - r, r * 2, r * 2); };
  cloud(w * 0.72, h * 0.32, 540, 'rgba(150,185,255,1)', 0.7);   // bright galactic core
  cloud(w * 0.72, h * 0.32, 270, 'rgba(235,242,255,1)', 0.8);
  cloud(w * 0.58, h * 0.27, 420, 'rgba(160,70,215,1)', 0.55);   // purple
  cloud(w * 0.84, h * 0.40, 460, 'rgba(60,130,235,1)', 0.5);    // blue
  cloud(w * 0.50, h * 0.46, 340, 'rgba(40,180,190,0.9)', 0.4);  // teal wisp
  cloud(w * 0.92, h * 0.22, 320, 'rgba(200,90,180,0.9)', 0.45); // magenta
  cloud(w * 0.30, h * 0.30, 360, 'rgba(120,80,220,0.9)', 0.4);
  cloud(w * 0.12, h * 0.40, 300, 'rgba(70,120,210,0.8)', 0.35);
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  // stars — denser/brighter up high, sparse near the horizon
  for (let i = 0; i < 2600; i++) {
    const sx = Math.random() * w, sy = Math.random() * h * 0.8;
    const b = Math.random();
    const r = b > 0.97 ? 2.2 : b > 0.85 ? 1.3 : 0.7;
    x.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.75})`;
    x.beginPath(); x.arc(sx, sy, r, 0, 7); x.fill();
    if (b > 0.985) { x.fillStyle = 'rgba(180,210,255,0.5)'; x.beginPath(); x.arc(sx, sy, r * 3, 0, 7); x.fill(); }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(220, 40, 24),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  sky.raycast = () => {};
  return sky;
}

// --- distant snow-capped mountains ringing the horizon ------------------------
function buildMountains(scene) {
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x141a30, roughness: 1.0 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x8294b4, roughness: 0.9 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
    const r = 44 + Math.random() * 18;
    const ht = 15 + Math.random() * 16;
    const wd = ht * (0.7 + Math.random() * 0.3);
    const px = Math.cos(a) * r, pz = Math.sin(a) * r;
    const peak = new THREE.Mesh(new THREE.ConeGeometry(wd, ht, 5), rockMat);
    peak.position.set(px, ht / 2 - 3, pz); peak.rotation.y = Math.random() * Math.PI;
    scene.add(peak);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(wd * 0.42, ht * 0.34, 5), capMat);
    cap.position.set(px, ht - ht * 0.17 - 3, pz); cap.rotation.y = peak.rotation.y;
    scene.add(cap);
  }
}

// --- low ground foliage: snowy bushes, half-buried rocks, dead-grass tufts -----
function scatterFoliage(scene, conifer) {
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x16261d, roughness: 1.0 });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xaebccd, roughness: 0.9 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.95 });
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x2c3a2c, roughness: 1.0 });
  const fireX = 0.35, fireZ = 0.75, charX = 2.25, charZ = -0.2;
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 2.2 + Math.random() * 24;
    const px = Math.cos(a) * r, pz = Math.sin(a) * r - 2;
    if (Math.hypot(px - fireX, pz - fireZ) < 1.7) continue;   // clear of the firepit
    if (Math.hypot(px - charX, pz - charZ) < 1.0) continue;   // clear of the survivor
    const roll = Math.random();
    if (roll < 0.45) { // snowy bush — a clump of dark lobes capped with snow
      const grp = new THREE.Group(); grp.position.set(px, 0, pz);
      const n = 2 + (Math.random() * 3 | 0);
      for (let k = 0; k < n; k++) {
        const s = 0.18 + Math.random() * 0.22;
        const lobe = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), bushMat);
        lobe.position.set((Math.random() - 0.5) * 0.4, s * 0.7, (Math.random() - 0.5) * 0.4); grp.add(lobe);
        const cap = new THREE.Mesh(new THREE.IcosahedronGeometry(s * 0.8, 0), snowMat);
        cap.position.set(lobe.position.x, lobe.position.y + s * 0.5, lobe.position.z); cap.scale.y = 0.5; grp.add(cap);
      }
      scene.add(grp);
    } else if (roll < 0.72) { // half-buried rock with a snow cap
      const s = 0.2 + Math.random() * 0.4;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
      rock.position.set(px, s * 0.4, pz); rock.rotation.set(Math.random(), Math.random(), Math.random());
      scene.add(rock);
      const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(s * 0.7, 0), snowMat);
      cap.position.set(px, s * 0.7, pz); cap.scale.y = 0.4; scene.add(cap);
    } else { // dead-grass tuft
      const grp = new THREE.Group(); grp.position.set(px, 0, pz);
      for (let k = 0; k < 5; k++) {
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.25 + Math.random() * 0.2, 4), grassMat);
        blade.position.set((Math.random() - 0.5) * 0.18, 0.13, (Math.random() - 0.5) * 0.18);
        blade.rotation.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5); grp.add(blade);
      }
      scene.add(grp);
    }
  }
}

// --- distant wandering zombies (animated by hand; this scene isn't ECS) --------
function buildWanderers(scene) {
  const out = [];
  for (let i = 0; i < 5; i++) {
    const rig = buildZombieRig(randomZombieLook());
    const a = Math.random() * Math.PI * 2;
    const r = 9 + Math.random() * 8;
    const x = Math.cos(a) * r, z = Math.sin(a) * r - 2;
    rig.position.set(x, 0, z);
    const heading = Math.random() * Math.PI * 2;
    rig.rotation.y = heading;
    scene.add(rig);
    out.push({ rig, J: rig.userData.joints, phase: Math.random() * 6.28, speed: 0.18 + Math.random() * 0.18, heading, x, z });
  }
  return out;
}

function animateWanderer(w, dt) {
  const J = w.J;
  w.phase += dt * 2.0;
  const p = w.phase, s = Math.sin(p);
  // a slow shamble: legs alternate, arms hang and sway, torso hunched
  J.thighL.rotation.x = s * 0.32; J.thighR.rotation.x = -s * 0.32;
  J.kneeL.rotation.x = Math.max(0, -s) * 0.5 + 0.1; J.kneeR.rotation.x = Math.max(0, s) * 0.5 + 0.1;
  J.shoulderL.rotation.set(-0.35 + s * 0.12, 0, 0.1); J.shoulderR.rotation.set(-0.35 - s * 0.12, 0, -0.1);
  J.elbowL.rotation.x = 0.3; J.elbowR.rotation.x = 0.3;
  J.torso.rotation.x = 0.14; J.head.rotation.set(0.12, Math.sin(p * 0.5) * 0.2, s * 0.04);
  J.hips.rotation.y = s * 0.05;
  // wander forward, drifting heading; turn back if it strays too far
  w.heading += Math.sin(p * 0.11) * 0.4 * dt;
  w.x += Math.sin(w.heading) * w.speed * dt;
  w.z += Math.cos(w.heading) * w.speed * dt;
  const d = Math.hypot(w.x, w.z + 2);
  if (d > 19 || d < 7) { w.heading += Math.PI; w.x += Math.sin(w.heading) * w.speed * dt * 2; w.z += Math.cos(w.heading) * w.speed * dt * 2; }
  w.rig.position.set(w.x, 0, w.z);
  w.rig.rotation.y = w.heading;
}

// --- falling snow as a recycled point cloud ----------------------------------
function buildSnow() {
  const N = 900;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N);
  const R = 22, H = 16;
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * R * 2;
    pos[i * 3 + 1] = Math.random() * H;
    pos[i * 3 + 2] = (Math.random() - 0.5) * R * 2 - 2;
    vel[i] = 0.5 + Math.random() * 1.1;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xdfe8f4, size: 0.06, transparent: true, opacity: 0.85, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.raycast = () => {};
  return {
    points,
    update(dt) {
      const p = geo.attributes.position.array;
      const tt = performance.now() * 0.001;
      for (let i = 0; i < N; i++) {
        p[i * 3 + 1] -= vel[i] * dt;
        p[i * 3] += Math.sin(tt * 0.6 + i) * 0.004; // gentle sway
        if (p[i * 3 + 1] < 0) { p[i * 3 + 1] = H; }
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
