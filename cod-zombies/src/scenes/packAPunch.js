import * as THREE from 'three';

/**
 * The Pack-a-Punch machine: a stylized teal carnival chamber on splayed legs,
 * a lit "PACK A PUNCH" sign on a post, an open slot showing internal rollers,
 * and a red "done" flag that pops up when the upgrade is ready. Returns the rig
 * with `userData` for the PaPSystem to animate (sign, flag pivot, gun anchor,
 * body for the vibrate, and the rest/grab heights).
 */
function signTexture() {
  const w = 512, h = 160, c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = '#efe6c8'; x.fillRect(0, 0, w, h);
  // harlequin diamond band
  const cols = ['#f4c9c0', '#cfe6d8', '#f3e0a8', '#e7b9d0', '#bfe0e8'];
  for (let i = 0; i < 12; i++) {
    x.fillStyle = cols[i % cols.length]; x.globalAlpha = 0.55;
    const cx = 24 + i * 44, cy = 64;
    x.beginPath(); x.moveTo(cx, cy - 34); x.lineTo(cx + 22, cy); x.lineTo(cx, cy + 34); x.lineTo(cx - 22, cy); x.closePath(); x.fill();
  }
  x.globalAlpha = 1;
  x.fillStyle = '#23201a'; x.font = 'bold 56px Georgia, serif'; x.textAlign = 'center';
  x.fillText('PACK A PUNCH', w / 2, 80);
  x.font = 'italic 28px Georgia, serif';
  x.fillText('increase your firepower!', w / 2, 124);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}

export function buildPaP() {
  const teal = new THREE.MeshStandardMaterial({ color: 0x4f8f7e, roughness: 0.6, metalness: 0.2 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.45, metalness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14181a, roughness: 0.7, metalness: 0.3 });
  const roller = new THREE.MeshStandardMaterial({ color: 0xb8b09a, roughness: 0.6, metalness: 0.3 });
  const red = new THREE.MeshStandardMaterial({ color: 0xcc2a22, roughness: 0.5 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x9a7b34, metalness: 0.7, roughness: 0.4 });

  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body); // everything that vibrates

  // chamber shell — a chunky beveled box
  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.95, 0.95), teal);
  shell.position.y = 1.0; body.add(shell);

  // --- the FOCAL POINT: a glowing recess with inward-sweeping car-wash rollers
  // a bright back wall so light spills out of the mouth (the iconic glow)
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.66),
    new THREE.MeshStandardMaterial({ color: 0xbfe9df, emissive: 0x6fd8c8, emissiveIntensity: 0.7, roughness: 0.5 }));
  glow.position.set(0, 1.02, -0.18); body.add(glow);
  const recess = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.66, 0.55), dark); recess.position.set(0, 1.02, 0.05); body.add(recess);

  // two converging rows of grooved rollers that sweep toward the centre gap the
  // gun passes through. Each roller spins about its length (PaPSystem drives it).
  const rollerMat = new THREE.MeshStandardMaterial({ color: 0xd8cdab, roughness: 0.7, metalness: 0.1 });
  const grooveMat = new THREE.MeshStandardMaterial({ color: 0x4a443a, roughness: 0.6, metalness: 0.4 });
  const rollers = [];
  const makeRoller = (x, y, tiltX, dir) => {
    const holder = new THREE.Group();
    holder.position.set(x, y, 0.18);
    holder.rotation.set(tiltX, 0, Math.PI / 2); // axis laid along world X (z=PI/2); tiltX angles it inward
    const spinner = new THREE.Group(); holder.add(spinner); // spins about its length (local Y)
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 14), rollerMat); spinner.add(cyl);
    for (const a of [0, 2.1, 4.2]) { // surface grooves so the spin reads
      const gr = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.52, 0.05), grooveMat);
      gr.position.set(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12); gr.rotation.y = a; spinner.add(gr);
    }
    spinner.userData.dir = dir;
    rollers.push(spinner); body.add(holder);
  };
  for (let i = -1; i <= 1; i++) {
    makeRoller(i * 0.34, 1.26, 0.32, 1);   // top row tilts down-inward
    makeRoller(i * 0.34, 0.78, -0.32, -1); // bottom row tilts up-inward (opposite spin)
  }

  // beveled metal frame around the mouth
  const frameMat = metal;
  for (const [w, h, x, y] of [[1.34, 0.1, 0, 1.4], [1.34, 0.1, 0, 0.64], [0.1, 0.86, -0.66, 1.02], [0.1, 0.86, 0.66, 1.02]]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), frameMat); f.position.set(x, y, 0.36); body.add(f);
  }

  // splayed legs
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.7, 8), metal);
    leg.position.set(sx * 0.55, 0.32, sz * 0.3); leg.rotation.set(sz * 0.25, 0, -sx * 0.25); body.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.12), metal); foot.position.set(sx * 0.7, 0.0, sz * 0.42); body.add(foot);
  }

  // sign post + the lit sign on top
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8), metal);
  post.position.set(0, 1.85, -0.1); body.add(post);
  const signMat = new THREE.MeshStandardMaterial({ map: signTexture(), emissive: 0x222018, emissiveIntensity: 0.5, roughness: 0.6 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 0.08), signMat);
  sign.position.set(0, 2.3, -0.1); sign.rotation.x = -0.12; body.add(sign);
  const signFrame = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.62, 0.05), teal); signFrame.position.set(0, 2.3, -0.14); signFrame.rotation.x = -0.12; body.add(signFrame);

  // red "done" flag on a pivot at the top-right corner (folds up when ready)
  const flagPivot = new THREE.Group(); flagPivot.position.set(0.7, 1.5, 0.2); body.add(flagPivot);
  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 6), metal); flagPole.position.y = 0.17; flagPivot.add(flagPole);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.01), red); flag.position.set(0.11, 0.28, 0); flagPivot.add(flag);
  flagPivot.rotation.z = 1.45; // folded down by default

  // the gun being processed rides here; the PaPSystem mounts the player's real
  // weapon model and slides this anchor along Z (in/out of the mouth)
  const gunAnchor = new THREE.Group(); gunAnchor.position.set(0, 1.02, 0); body.add(gunAnchor);

  root.userData = {
    body, sign, flagPivot, gunAnchor, rollers, glow,
    inZ: -0.15,  // sucked deep behind the rollers (hidden)
    outZ: 0.8,   // pushed forward out the entrance (grabbable)
  };
  return root;
}
