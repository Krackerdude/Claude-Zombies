import * as THREE from 'three';

/**
 * Dr. Newton's Factory — the 3D set for the Liquid Divinium gamble menu, built
 * entirely from primitives (no external assets), BO3-inspired: three verdigris
 * brewing vats with brass fittings and glowing view-windows, a tall glass
 * transport tube on the right where won gums rise and hover, three wager buttons
 * on a console up front, and animated machinery (turning gears, pipes, hanging
 * lamps, drifting steam) filling the depth behind.
 *
 * Returns a THREE.Group. Consumers read `userData`:
 *   vats:    [{ group, windowMat, world:Vector3 }]  — per-vat glow + delivery point
 *   tube:    { group, world:Vector3, topY, botY, beamMats }
 *   buttons: [{ mesh, group, restY, glowMat, world:Vector3, wager }]
 *   spin:    [{ mesh, speed }]     — gears to rotate each frame
 *   steam:   [{ mesh, phase, base }]
 *   dispose(): free geometry/materials
 */
export function buildFactory() {
  const g = new THREE.Group();
  const track = [];
  const mat = (o) => { const m = new THREE.MeshStandardMaterial(o); track.push(m); return m; };
  // build a mesh, track its geometry, position + (optionally) rotate it
  const M = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    track.push(geo); const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o;
  };

  // shared palette
  const verd    = mat({ color: 0x3f7d72, roughness: 0.5, metalness: 0.55 });   // verdigris tank body
  const brass   = mat({ color: 0xcaa24a, roughness: 0.32, metalness: 0.9 });
  const brassDk = mat({ color: 0x8a6d2c, roughness: 0.45, metalness: 0.85 });
  const copper  = mat({ color: 0xc27a45, roughness: 0.38, metalness: 0.85 });
  const iron    = mat({ color: 0x2a2d33, roughness: 0.7, metalness: 0.6 });
  const glass   = mat({ color: 0xcfeaf4, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.12 });

  g.userData = { vats: [], tube: null, buttons: [], spin: [], steam: [], track };

  // ---------------------------------------------------------------- backdrop
  const back = mat({ color: 0x0c1622, roughness: 1, metalness: 0 });
  g.add(M(new THREE.PlaneGeometry(26, 12), back, 0, 1.5, -6.5));
  const floor = mat({ color: 0x14181f, roughness: 0.9, metalness: 0.2 });
  g.add(M(new THREE.PlaneGeometry(26, 16), floor, 0, -1.35, -1, -Math.PI / 2));

  // ------------------------------------------------- background machinery
  const gear = (x, y, z, r, teeth, m, speed) => {
    const grp = new THREE.Group(); grp.position.set(x, y, z);
    grp.add(M(new THREE.CylinderGeometry(r, r, 0.12, Math.max(18, teeth)), m, 0, 0, 0, Math.PI / 2)); // disc facing camera
    grp.add(M(new THREE.CylinderGeometry(r * 0.28, r * 0.28, 0.16, 16), m, 0, 0, 0, Math.PI / 2));      // hub
    const tGeo = new THREE.BoxGeometry(r * 0.24, r * 0.24, 0.13); track.push(tGeo);
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const t = new THREE.Mesh(tGeo, m); t.position.set(Math.cos(a) * r, Math.sin(a) * r, 0); t.rotation.z = a; grp.add(t);
    }
    g.add(grp); g.userData.spin.push({ mesh: grp, speed });
  };
  gear(-4.4, 1.9, -4.2, 0.9, 16, brassDk, 0.5);
  gear(-3.2, 2.7, -4.6, 0.6, 13, copper, -0.75);
  gear(4.6, 1.2, -4.3, 1.05, 18, brassDk, -0.4);
  gear(3.4, 2.6, -4.7, 0.55, 12, copper, 0.9);
  gear(0.2, 3.1, -5.2, 0.7, 14, brassDk, 0.32);

  // criss-crossing pipes across the back wall
  const pipe = (x, y, z, len, rot, m, r = 0.09) => g.add(M(new THREE.CylinderGeometry(r, r, len, 12), m, x, y, z, 0, 0, rot));
  pipe(-1.6, 2.6, -4.9, 6, Math.PI / 2, copper);
  pipe(2.2, 3.2, -5.0, 5, Math.PI / 2 + 0.12, brassDk, 0.07);
  pipe(-4.6, 0.6, -4.0, 3.2, 0.2, copper, 0.08);
  pipe(4.9, -0.2, -3.8, 3, -0.15, brassDk, 0.08);
  pipe(0, 4.4, -3.5, 22, Math.PI / 2, iron, 0.14); // ceiling girder

  // hanging lamps casting warm pools
  const lampMat = mat({ color: 0xffd69a, emissive: 0xffb44e, emissiveIntensity: 1.4, roughness: 0.4 });
  for (const lx of [-3.4, -0.4, 2.8]) {
    g.add(M(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), iron, lx, 4.1, -3.4));
    g.add(M(new THREE.ConeGeometry(0.28, 0.3, 16, 1, true), iron, lx, 3.8, -3.4));
    g.add(M(new THREE.SphereGeometry(0.1, 14, 12), lampMat, lx, 3.72, -3.4));
  }

  // ---------------------------------------------------------------- the vats
  const vatX = [-1.85, 0, 1.85];
  const vatTint = [0x37d36a, 0x9a5cff, 0xff8a28];
  vatX.forEach((x, i) => {
    const v = new THREE.Group(); v.position.set(x, 0, 0);

    v.add(M(new THREE.CylinderGeometry(0.72, 0.78, 0.18, 24), iron, 0, -1.16, 0));   // footing
    v.add(M(new THREE.CylinderGeometry(0.66, 0.7, 1.9, 28, 1), verd, 0, -0.2, 0));   // body
    for (const by of [-1.0, -0.5, 0.05, 0.55]) v.add(M(new THREE.TorusGeometry(0.685, 0.035, 10, 32), brass, 0, by, 0, Math.PI / 2)); // hoops
    const rivGeo = new THREE.SphereGeometry(0.022, 8, 6); track.push(rivGeo);
    for (let r = 0; r < 20; r++) { const a = (r / 20) * Math.PI * 2; const o = new THREE.Mesh(rivGeo, brassDk); o.position.set(Math.cos(a) * 0.7, 0.55, Math.sin(a) * 0.7); v.add(o); }
    v.add(M(new THREE.SphereGeometry(0.68, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), brass, 0, 0.75, 0));  // domed lid
    v.add(M(new THREE.TorusGeometry(0.66, 0.05, 10, 32), brassDk, 0, 0.76, 0, Math.PI / 2));
    v.add(M(new THREE.CylinderGeometry(0.09, 0.11, 0.34, 14), copper, 0.18, 1.05, 0.12));   // chimney
    v.add(M(new THREE.CylinderGeometry(0.13, 0.09, 0.1, 14), brass, 0.18, 1.24, 0.12));
    v.add(M(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 10), brassDk, -0.16, 1.02, -0.05));  // valve spring
    v.add(M(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 20), brass, -0.34, 0.5, 0.58, Math.PI / 2));  // gauge
    v.add(M(new THREE.CylinderGeometry(0.086, 0.086, 0.02, 20), iron, -0.34, 0.5, 0.61, Math.PI / 2));

    // glowing view-window — a brass surround (solid backing) with the lit brew
    // pane sitting IN FRONT of it so a border of brass frames the glow.
    const winY = 0.02, frameZ = 0.6, paneZ = 0.7;
    v.add(M(roundedRectGeo(0.62, 0.84, 0.09), brass, 0, winY, frameZ)); // solid backing (front face ≈ 0.69)
    const glowMat = mat({
      color: 0x05070a, emissive: new THREE.Color(vatTint[i]), emissiveIntensity: 1.35,
      emissiveMap: brewTex(vatTint[i], track), roughness: 0.5, metalness: 0,
    });
    v.add(M(new THREE.PlaneGeometry(0.5, 0.72), glowMat, 0, winY, paneZ));       // the glowing brew
    v.add(M(new THREE.PlaneGeometry(0.52, 0.74), glass, 0, winY, paneZ + 0.006)); // glass sheen over it
    // inner point light so each vat throws colored light into the room
    const vl = new THREE.PointLight(vatTint[i], 0.6, 3.5); vl.position.set(0, 0.1, 0.5); v.add(vl);

    g.add(v);
    g.userData.vats.push({ group: v, windowMat: glowMat, base: 1.35, world: new THREE.Vector3(x, winY, paneZ + 0.12) });
  });

  // ------------------------------------------------- transport tube (right)
  const tubeX = 3.55;
  const tube = new THREE.Group(); tube.position.set(tubeX, 0, 0);
  const botY = -1.15, topY = 1.85;
  const tubeH = topY - botY;
  const tubeR = 0.55;
  // frosted-cyan glass that actually reads as glass (brighter, double-sided)
  const tubeGlass = mat({ color: 0xbfeaf7, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.24, side: THREE.DoubleSide });
  tube.add(M(new THREE.CylinderGeometry(0.5, 0.82, 0.42, 28), brassDk, 0, botY + 0.1, 0));   // funnel
  tube.add(M(new THREE.CylinderGeometry(tubeR, tubeR, 0.12, 28), brass, 0, botY + 0.34, 0)); // base collar
  tube.add(M(new THREE.CylinderGeometry(tubeR, tubeR, tubeH, 36, 1, true), tubeGlass, 0, (botY + topY) / 2, 0)); // column
  for (let k = 0; k <= 4; k++) { const ry = botY + 0.42 + k * (tubeH - 0.7) / 4; tube.add(M(new THREE.TorusGeometry(tubeR, 0.045, 12, 36), brass, 0, ry, 0, Math.PI / 2)); }
  // clean domed brass cap
  tube.add(M(new THREE.CylinderGeometry(tubeR + 0.05, tubeR, 0.14, 28), brass, 0, topY + 0.04, 0));
  tube.add(M(new THREE.SphereGeometry(tubeR - 0.02, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), brass, 0, topY + 0.1, 0));
  tube.add(M(new THREE.SphereGeometry(0.09, 16, 12), lampMat, 0, topY + 0.34, 0)); // glowing finial

  // upward tractor-beam: additive cylinders scrolled in the loop, brighter
  const beamMats = [];
  for (let b = 0; b < 2; b++) {
    const bm = new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.2 + b * 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); track.push(bm);
    const bg = new THREE.CylinderGeometry(0.36 - b * 0.14, 0.36 - b * 0.14, tubeH - 0.2, 24, 1, true); track.push(bg);
    const beam = new THREE.Mesh(bg, bm); beam.position.y = (botY + topY) / 2; tube.add(beam);
    beamMats.push(bm);
  }
  const tubeLight = new THREE.PointLight(0x9fe6ff, 0.8, 5); tubeLight.position.set(0, 0.6, 0.3); tube.add(tubeLight);
  g.add(tube);
  g.userData.tube = { group: tube, world: new THREE.Vector3(tubeX, 0, 0), topY, botY, beamMats };

  // ---------------------------------------------------------- wager console
  const consoleZ = 1.7, consoleY = -1.12;
  g.add(M(new THREE.BoxGeometry(2.4, 0.4, 0.7), iron, 0.1, consoleY - 0.1, consoleZ));
  g.add(M(new THREE.BoxGeometry(2.5, 0.08, 0.8), brassDk, 0.1, consoleY + 0.11, consoleZ));
  const btnColors = [0x2fd36a, 0xffc23a, 0xff4632];
  const btnEmis   = [0x14d05a, 0xffab00, 0xff2a12];
  [-0.72, 0.1, 0.92].forEach((bx, i) => {
    const grp = new THREE.Group(); grp.position.set(bx, consoleY + 0.16, consoleZ);
    grp.add(M(new THREE.BoxGeometry(0.42, 0.16, 0.42), iron, 0, 0, 0));
    grp.add(M(new THREE.CylinderGeometry(0.2, 0.22, 0.06, 24), brass, 0, 0.1, 0));
    const glowMat = mat({ color: btnColors[i], emissive: new THREE.Color(btnEmis[i]), emissiveIntensity: 0.85, roughness: 0.3, metalness: 0.2 });
    const dome = M(new THREE.SphereGeometry(0.16, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), glowMat, 0, 0.12, 0);
    grp.add(dome);
    grp.add(M(new THREE.PlaneGeometry(0.26, 0.16), brass, 0, -0.02, 0.22));
    const numMat = new THREE.MeshBasicMaterial({ map: numberTex(i + 1, track), transparent: true, depthWrite: false }); track.push(numMat);
    grp.add(M(new THREE.PlaneGeometry(0.2, 0.14), numMat, 0, -0.02, 0.226));
    g.add(grp);
    g.userData.buttons.push({ mesh: dome, group: grp, restY: 0.12, glowMat, world: new THREE.Vector3(bx, consoleY + 0.28, consoleZ), wager: i + 1 });
  });

  g.userData.dispose = () => { for (const t of track) t.dispose?.(); };
  return g;
}

/** Emissive map for a vat window: a bright hot core fading to dark edges, with a
 *  couple of lighter "brew" streaks so it glows like lit liquid, not a flat panel. */
function brewTex(hex, track) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(64, 78, 6, 64, 64, 78);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.4, '#cfd6dd'); grd.addColorStop(1, '#0a0d12');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, 128, 128);
  ctx.globalAlpha = 0.5; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) { ctx.beginPath(); const y = 40 + i * 26; ctx.moveTo(10, y); ctx.bezierCurveTo(45, y - 16, 85, y + 16, 118, y - 6); ctx.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; track.push(t); return t;
}

// rounded-rect plate geometry (for vat window frames)
function roundedRectGeo(w, h, r) {
  const s = new THREE.Shape();
  const hw = w / 2, hh = h / 2;
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh); s.quadraticCurveTo(hw, -hh, hw, -hh + r);
  s.lineTo(hw, hh - r); s.quadraticCurveTo(hw, hh, hw - r, hh);
  s.lineTo(-hw + r, hh); s.quadraticCurveTo(-hw, hh, -hw, hh - r);
  s.lineTo(-hw, -hh + r); s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 });
}

function numberTex(n, track) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const ctx = c.getContext('2d');
  ctx.fillStyle = '#1a1206'; ctx.font = '700 96px Oswald, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; track.push(t); return t;
}
