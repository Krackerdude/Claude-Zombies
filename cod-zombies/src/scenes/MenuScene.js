import * as THREE from 'three';
import { buildZombieRig } from './zombieRig.js';

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
  scene.background = new THREE.Color(0x0a1018);
  scene.fog = new THREE.FogExp2(0x0c141f, 0.03);

  // --- lights (cold moonlight key + warm fire) ---
  scene.add(new THREE.HemisphereLight(0x3a5070, 0x0a0e14, 0.85));
  scene.add(new THREE.AmbientLight(0x1a2636, 0.6));
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
  // a faint warm scorch + glow disc under the fire
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), new THREE.MeshBasicMaterial({ color: 0x2a1408 }));
  scorch.rotation.x = -Math.PI / 2; scorch.position.set(0.7, 0.01, 1.0);
  scene.add(scorch);

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
  // a ring of trees, denser + bigger toward the back, leaving the front open
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 6 + Math.random() * 26;
    const x = Math.cos(a) * r, z = Math.sin(a) * r - 2;
    if (z > 3.5 && Math.abs(x) < 5) continue; // keep the foreground (toward camera) clear
    scene.add(conifer(x, z, 0.9 + Math.random() * 1.7));
  }

  // --- the hero tree the survivor leans on (directly behind him) ---
  const heroTree = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 4.6, 10), trunkMat);
  heroTree.position.set(2.75, 2.3, -1.1); heroTree.rotation.z = 0.05;
  scene.add(heroTree);

  // --- the survivor, leaning (the hero) ---
  const survivor = buildSurvivor();
  survivor.position.set(2.25, 0, -0.2);
  survivor.rotation.y = -1.0;   // angled toward the fire / camera so the crossed arms read
  survivor.scale.setScalar(1.12);
  scene.add(survivor);
  // a dedicated warm key so the survivor reads clearly against the dark
  const keyLight = new THREE.PointLight(0xffc080, 5.5, 9, 2);
  keyLight.position.set(1.3, 1.7, 1.5);
  scene.add(keyLight);

  // --- campfire + three log seats ---
  const fire = buildCampfire();
  fire.position.set(0.35, 0, 0.75);
  scene.add(fire);

  // --- falling snow ---
  const snow = buildSnow();
  scene.add(snow.points);

  return {
    scene,
    fireLight,
    _flames: fire.userData.flames,
    _emberT: 0,
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
      // snow drift
      snow.update(dt);
    },
  };
}

// --- the leaning survivor (repurposed humanoid rig, posed + de-zombified) -----
function buildSurvivor() {
  const M = {
    flesh: new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.65 }),      // human skin
    shirt: new THREE.MeshStandardMaterial({ color: 0x6a4a32, roughness: 0.7 }),       // worn leather jacket (warm, catches firelight)
    pants: new THREE.MeshStandardMaterial({ color: 0x44474e, roughness: 0.82 }),      // grey trousers
    shoe: new THREE.MeshStandardMaterial({ color: 0x1c1812, roughness: 0.7 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x0c0d11, roughness: 0.4 }),          // dark, NOT glowing
  };
  const rig = buildZombieRig(M); // bare-skin look -> no zombie cosmetics
  const J = rig.userData.joints;

  // lean the whole body back onto the tree
  rig.rotation.x = -0.16;

  // arms crossed over the chest
  J.shoulderL.rotation.set(-1.35, 0, 0.55);
  J.elbowL.rotation.x = 1.7;
  J.shoulderR.rotation.set(-1.35, 0, -0.55);
  J.elbowR.rotation.x = 1.7;

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

  // --- three log seats around the fire (the co-op spots) — kept behind/left of
  // the fire so they never cross the camera's line to the survivor ---
  const seatPos = [[-1.3, -1.0], [-1.7, 0.3], [0.2, -1.6]];
  for (const [sx, sz] of seatPos) {
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.5, 9), new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 0.9 }));
    seat.rotation.z = Math.PI / 2;
    seat.rotation.y = Math.atan2(sz, sx) + Math.PI / 2;
    seat.position.set(sx, 0.2, sz);
    g.add(seat);
  }

  g.userData.flames = flames;
  return g;
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
