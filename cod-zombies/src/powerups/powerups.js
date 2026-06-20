import * as THREE from 'three';

/**
 * Power-up pickups: a gold object that literally represents the power-up, wrapped
 * in a subtle green gaseous glow. Built from primitives + a couple of canvas
 * glyph planes. The PowerupSystem floats/spins them at waist height.
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

function glyphPlane(text, size = 0.42) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 128, 128);
  x.fillStyle = '#ffce3f';
  x.strokeStyle = '#7a5200';
  x.lineWidth = 5;
  x.font = 'bold 96px Arial Black, Arial';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.strokeText(text, 64, 70);
  x.fillText(text, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  // two crossed quads so it reads from any angle
  const g = new THREE.Group();
  const a = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  const b = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  b.rotation.y = Math.PI / 2;
  g.add(a, b);
  return g;
}

function greenGlow() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const grad = x.createRadialGradient(64, 64, 6, 64, 64, 64);
  grad.addColorStop(0, 'rgba(120,255,140,0.55)');
  grad.addColorStop(0.5, 'rgba(70,220,90,0.22)');
  grad.addColorStop(1, 'rgba(70,220,90,0)');
  x.fillStyle = grad; x.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), mat);
    p.rotation.y = (i / 3) * Math.PI;
    g.add(p);
  }
  g.userData.spinGlow = true;
  return g;
}

function buildShape(type) {
  const g = new THREE.Group();
  const m = gold();
  switch (type) {
    case 'doublePoints': g.add(glyphPlane('2X', 0.46)); break;
    case 'bloodMoney': g.add(glyphPlane('$', 0.46)); break;
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
  group.add(greenGlow());
  return group;
}
