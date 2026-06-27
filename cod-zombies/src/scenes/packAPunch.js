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
  // hollow front opening: a dark recess with rollers
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.6, 0.5), dark);
  mouth.position.set(0, 1.02, 0.32); body.add(mouth);
  for (let i = -2; i <= 2; i++) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.5, 12), roller);
    r.rotation.z = Math.PI / 2; r.position.set(i * 0.26, 1.18, 0.34); body.add(r);
    const rb = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 12), roller);
    rb.rotation.z = Math.PI / 2; rb.position.set(i * 0.26, 0.9, 0.3); body.add(rb);
  }
  // a metal frame around the mouth
  const frameMat = metal;
  for (const [w, h, x, y] of [[1.3, 0.08, 0, 1.34], [1.3, 0.08, 0, 0.7], [0.08, 0.72, -0.62, 1.02], [0.08, 0.72, 0.62, 1.02]]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.55), frameMat); f.position.set(x, y, 0.34); body.add(f);
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

  // the gun being processed — a placeholder dark silhouette that rises/sinks
  const gunAnchor = new THREE.Group(); gunAnchor.position.set(0, 1.05, 0.34); body.add(gunAnchor);
  const gun = new THREE.Group();
  gun.add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.12), dark));
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.1), dark); grip.position.set(-0.2, -0.13, 0); gun.add(grip);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), brass); barrel.rotation.z = Math.PI / 2; barrel.position.set(0.4, 0.02, 0); gun.add(barrel);
  gunAnchor.add(gun);
  gun.visible = false;

  root.userData = {
    body, sign, flagPivot, gunAnchor, gun,
    restY: 1.05,           // gun sits at the mouth
    insideY: 0.7,          // sucked down into the slot
    grabY: 1.95,           // risen out to grab height
  };
  return root;
}
