import * as THREE from 'three';

/**
 * Power-up pickups: a gold object that literally represents the power-up, wrapped
 * in a green emissive mote aura (GPU Points, not flat sheets). The PowerupSystem
 * floats/spins the whole group at waist height, so the motes orbit the icon.
 */

const GOLD = 0xffcb3d;
const GOLD_DARK = 0xc8901a;

function gold(extra = {}) {
  return new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.85, roughness: 0.3, emissive: 0xffae00, emissiveIntensity: 0.45, ...extra });
}
function box(w, h, d, m) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); }
function at(mesh, x, y, z, rx = 0, ry = 0, rz = 0) {
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  return mesh;
}

// soft round sprite for the aura motes (white core, tinted by the material)
function softDot() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// a glyph stamped INTO the coin face: a light top-highlight under a dark fill
function coinGlyph(text) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); x.clearRect(0, 0, 128, 128);
  x.font = '900 84px Arial Black, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(255,240,190,0.7)'; x.fillText(text, 64, 67); // raised highlight
  x.fillStyle = '#5a3d0a'; x.fillText(text, 64, 70);               // stamped dark fill
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
}

// a struck gold medallion with the glyph embossed on both faces + a beaded rim
function goldMedallion(text) {
  const g = new THREE.Group();
  const m = gold();
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 30), m);
  coin.rotation.x = Math.PI / 2; g.add(coin);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.022, 10, 30), gold({ color: GOLD_DARK, emissiveIntensity: 0.3 }));
  g.add(rim);
  const tex = coinGlyph(text);
  for (const sz of [1, -1]) {
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.3),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    face.position.z = sz * 0.027; if (sz < 0) face.rotation.y = Math.PI;
    g.add(face);
  }
  return g;
}

// green emissive mote aura — a cloud of additive points haloing the icon
function greenAura() {
  const N = 48;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 0.18 + Math.random() * 0.36;
    const a = Math.random() * Math.PI * 2, e = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = Math.sin(e) * Math.cos(a) * r;
    pos[i * 3 + 1] = Math.cos(e) * r * 0.95;
    pos[i * 3 + 2] = Math.sin(e) * Math.sin(a) * r;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    map: softDot(), color: 0x8bff9b, size: 0.12, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  pts.raycast = () => {};
  const g = new THREE.Group();
  g.add(pts);
  g.userData.spinGlow = true;
  return g;
}

function buildShape(type) {
  const g = new THREE.Group();
  const m = gold();
  switch (type) {
    case 'doublePoints': g.add(goldMedallion('2X')); break;
    case 'bloodMoney': g.add(goldMedallion('$')); break;
    case 'instaKill': { // skull
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), m); g.add(s);
      g.add(at(box(0.13, 0.07, 0.05, m), 0, -0.15, 0.06)); // jaw
      const eye = new THREE.MeshBasicMaterial({ color: 0x102000 });
      g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), eye), -0.06, 0.02, 0.14));
      g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), eye), 0.06, 0.02, 0.14));
      break;
    }
    case 'nuke': { // bomb
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), m));
      g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8), m), 0, 0.2, 0)); // fuse cap
      const fuse = new THREE.MeshStandardMaterial({ color: 0x553311, emissive: 0xff6600, emissiveIntensity: 0.6 });
      g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 6), fuse), 0.03, 0.28, 0, 0, 0, 0.5));
      break;
    }
    case 'carpenter': { // hammer
      g.add(at(box(0.04, 0.34, 0.04, m), 0, -0.05, 0)); // handle
      g.add(at(box(0.24, 0.08, 0.09, m), 0, 0.15, 0));  // head
      break;
    }
    case 'zombieBlood': { // vial / droplet
      const glass = gold({ emissive: 0x33aa44, emissiveIntensity: 0.5, color: 0x9bff9b, metalness: 0.2, roughness: 0.1 });
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), glass));
      g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 8), glass), 0, 0.16, 0)); // teardrop top
      break;
    }
    default: g.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), m));
  }
  return g;
}

export function buildPowerupModel(type) {
  const group = new THREE.Group();
  group.add(buildShape(type));
  group.add(greenAura());
  return group;
}
