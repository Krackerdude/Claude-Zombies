import * as THREE from 'three';

/**
 * Dr. Newton's Factory — the 3D set for the Liquid Divinium gamble menu, built
 * entirely from primitives (no external assets), BO3-inspired.
 *
 * Hero (unchanged framing): three verdigris brewing vats with glowing brew
 * windows, a glass transport tube, and the wager console. Around them, a
 * sprawling industrial hall recedes into pale-blue fog: rows of boilers, perk +
 * gobblegum machines, a catwalk, a perk-bottle conveyor up top-right, turning
 * gears and pipework, under an ornate brass coffered ceiling.
 *
 * Returns a THREE.Group. Consumers read `userData`:
 *   vats:    [{ group, windowMat, base, world:Vector3 }]
 *   tube:    { group, world:Vector3, topY, botY, beamMats }
 *   buttons: [{ mesh, group, restY, glowMat, world:Vector3, wager }]
 *   spin:    [{ mesh, speed }]
 *   steam:   [] (kept for the view loop)
 *   conveyor:{ a:Vector3, b:Vector3, speed, bottles:[{ mesh, u0 }] }
 *   dispose(): free geometry/materials
 */
export function buildFactory() {
  const g = new THREE.Group();
  const track = [];
  const mat = (o) => { const m = new THREE.MeshStandardMaterial(o); track.push(m); return m; };
  const M = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    track.push(geo); const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o;
  };

  // shared palette
  const verd    = mat({ color: 0x3f7d72, roughness: 0.5, metalness: 0.55 });
  const brass   = mat({ color: 0xcaa24a, roughness: 0.32, metalness: 0.9 });
  const brassDk = mat({ color: 0x8a6d2c, roughness: 0.45, metalness: 0.85 });
  const copper  = mat({ color: 0xc27a45, roughness: 0.38, metalness: 0.85 });
  const iron    = mat({ color: 0x2a2d33, roughness: 0.7, metalness: 0.6 });
  const steel   = mat({ color: 0x59616c, roughness: 0.5, metalness: 0.8 });
  const steelDk = mat({ color: 0x323841, roughness: 0.6, metalness: 0.7 });
  const wallMat = mat({ color: 0x0f1c28, roughness: 1, metalness: 0.05 });
  const beltMat = mat({ color: 0x15171d, roughness: 0.85, metalness: 0.2 });
  const glass   = mat({ color: 0xcfeaf4, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.12 });
  const lampMat = mat({ color: 0xffd8a0, emissive: 0xffb44e, emissiveIntensity: 1.7, roughness: 0.4 });
  const bottleGlass = mat({ color: 0xdff0ff, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.55 });

  g.userData = { vats: [], tube: null, buttons: [], spin: [], steam: [], conveyor: null, track };

  // ------------------------------------------------------------- helpers
  const gear = (x, y, z, r, teeth, m, speed) => {
    const grp = new THREE.Group(); grp.position.set(x, y, z);
    grp.add(M(new THREE.CylinderGeometry(r, r, 0.12, Math.max(18, teeth)), m, 0, 0, 0, Math.PI / 2));
    grp.add(M(new THREE.CylinderGeometry(r * 0.28, r * 0.28, 0.16, 16), m, 0, 0, 0, Math.PI / 2));
    const tGeo = new THREE.BoxGeometry(r * 0.24, r * 0.24, 0.13); track.push(tGeo);
    for (let i = 0; i < teeth; i++) { const a = (i / teeth) * Math.PI * 2; const t = new THREE.Mesh(tGeo, m); t.position.set(Math.cos(a) * r, Math.sin(a) * r, 0); t.rotation.z = a; grp.add(t); }
    g.add(grp); g.userData.spin.push({ mesh: grp, speed }); return grp;
  };
  const pipe = (x, y, z, len, rot, m, r = 0.09, axis = 'z') =>
    g.add(M(new THREE.CylinderGeometry(r, r, len, 12), m, x, y, z, axis === 'x' ? Math.PI / 2 : 0, 0, axis === 'z' ? rot : 0));
  const P = (parent, geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { track.push(geo); const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); parent.add(o); return o; };

  const boiler = (x, z, s, tint) => {
    const b = new THREE.Group(); b.position.set(x, -1.35, z); b.scale.setScalar(s);
    P(b, new THREE.CylinderGeometry(0.6, 0.64, 1.7, 20), verd, 0, 0.85, 0);
    for (const by of [0.2, 0.85, 1.5]) P(b, new THREE.TorusGeometry(0.62, 0.04, 8, 24), brass, 0, by, 0, Math.PI / 2);
    P(b, new THREE.SphereGeometry(0.62, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), brass, 0, 1.7, 0);
    P(b, new THREE.CylinderGeometry(0.08, 0.1, 0.5, 10), copper, 0.2, 2.05, 0);
    P(b, new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8), copper, -0.3, 2.0, 0.1);
    const em = mat({ color: 0x06080b, emissive: new THREE.Color(tint), emissiveIntensity: 0.9, roughness: 0.5 });
    P(b, new THREE.PlaneGeometry(0.34, 0.5), em, 0, 0.95, 0.63);
    g.add(b);
  };

  const perkMachine = (x, z, ry, accent) => {
    const pm = new THREE.Group(); pm.position.set(x, -1.35, z); pm.rotation.y = ry;
    P(pm, new THREE.BoxGeometry(1.1, 2.0, 0.9), steelDk, 0, 1.0, 0);
    P(pm, new THREE.BoxGeometry(1.16, 0.24, 0.96), brassDk, 0, 2.0, 0);
    const sign = mat({ color: 0x05070a, emissive: new THREE.Color(accent), emissiveIntensity: 1.5, roughness: 0.5 });
    P(pm, new THREE.PlaneGeometry(0.8, 1.2), sign, 0, 1.05, 0.46);
    P(pm, new THREE.PlaneGeometry(0.9, 0.16), sign, 0, 2.0, 0.49);
    for (const sx of [-0.45, 0.45]) P(pm, new THREE.CylinderGeometry(0.08, 0.08, 0.2, 8), iron, sx, 0.05, 0.3);
    const pl = new THREE.PointLight(accent, 0.5, 4); pl.position.set(0, 1.1, 0.8); pm.add(pl);
    g.add(pm);
  };

  const bgGum = (x, z, s) => {
    const gm = new THREE.Group(); gm.position.set(x, -1.35, z); gm.scale.setScalar(s);
    const red = mat({ color: 0xb01c14, roughness: 0.4, metalness: 0.3 });
    P(gm, new THREE.CylinderGeometry(0.3, 0.34, 0.1, 8), iron, 0, 0.05, 0);
    P(gm, new THREE.CylinderGeometry(0.26, 0.3, 1.0, 8), red, 0, 0.6, 0, 0, Math.PI / 8);
    P(gm, new THREE.SphereGeometry(0.3, 20, 16), glass, 0, 1.25, 0);
    const candy = mat({ color: 0xff7ab0, emissive: 0xff3d86, emissiveIntensity: 0.5, roughness: 0.4 });
    P(gm, new THREE.SphereGeometry(0.2, 16, 12), candy, 0, 1.15, 0);
    P(gm, new THREE.CylinderGeometry(0.12, 0.16, 0.18, 16), brass, 0, 1.55, 0);
    g.add(gm);
  };

  // =========================================================== floor + walls
  const floorMat = mat({ color: 0x141b24, roughness: 0.62, metalness: 0.4 });
  g.add(M(new THREE.PlaneGeometry(70, 46), floorMat, 0, -1.35, -8, -Math.PI / 2));
  g.add(M(new THREE.PlaneGeometry(70, 30), wallMat, 0, 5, -18));
  g.add(M(new THREE.PlaneGeometry(46, 30), wallMat, -13, 5, -8, 0, Math.PI / 2));
  g.add(M(new THREE.PlaneGeometry(46, 30), wallMat, 13, 5, -8, 0, -Math.PI / 2));

  // ============================================= ornate brass coffered ceiling
  const ceilY = 5.0;
  g.add(M(new THREE.PlaneGeometry(70, 46), wallMat, 0, ceilY + 0.4, -8, Math.PI / 2));
  for (let x = -12; x <= 12; x += 3) g.add(M(new THREE.BoxGeometry(0.5, 0.42, 44), x % 6 === 0 ? brass : brassDk, x, ceilY, -8));
  for (let z = 2; z >= -18; z -= 3.2) g.add(M(new THREE.BoxGeometry(26, 0.34, 0.42), brassDk, 0, ceilY + 0.05, z));
  const studGeo = new THREE.SphereGeometry(0.05, 6, 5); track.push(studGeo);
  for (let x = -12; x <= 12; x += 6) for (let z = 1; z >= -16; z -= 4) { const s = new THREE.Mesh(studGeo, brass); s.position.set(x, ceilY - 0.2, z); g.add(s); }
  for (const [lx, lz] of [[-3.2, -1], [3.0, -1], [-5.5, -6], [5.2, -6], [0, -10]]) {
    g.add(M(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6), iron, lx, ceilY - 0.6, lz));
    g.add(M(new THREE.ConeGeometry(0.34, 0.4, 16, 1, true), brassDk, lx, ceilY - 1.2, lz));
    g.add(M(new THREE.SphereGeometry(0.13, 14, 12), lampMat, lx, ceilY - 1.32, lz));
    const pl = new THREE.PointLight(0xffca88, 0.4, 8); pl.position.set(lx, ceilY - 1.4, lz); g.add(pl);
  }

  // ================================================ sprawling machine hall
  boiler(-5.2, -4.5, 1.05, 0x37d36a); boiler(-6.4, -8.5, 1.2, 0xffb44e); boiler(-7.6, -13, 1.35, 0x9a5cff);
  boiler(5.2, -4.5, 1.05, 0xff8a28);  boiler(6.4, -8.5, 1.2, 0x37d36a);  boiler(7.6, -13, 1.35, 0x59d0ff);
  perkMachine(-9.0, -6.5, 0.5, 0xff3b30);
  perkMachine(-10.2, -11, 0.35, 0x2fd36a);
  perkMachine(9.3, -7.5, -0.6, 0xffd23a);
  perkMachine(10.4, -12, -0.4, 0x59a6ff);
  bgGum(-3.2, -12.5, 1.1); bgGum(2.6, -14, 1.2); bgGum(8.5, -15.5, 1.3);
  g.add(M(new THREE.BoxGeometry(24, 0.16, 0.7), steelDk, 0, 1.6, -11));
  for (let x = -11; x <= 11; x += 1.4) g.add(M(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), steel, x, 1.95, -11));
  g.add(M(new THREE.CylinderGeometry(0.04, 0.04, 24, 8), brass, 0, 2.3, -11, 0, 0, Math.PI / 2));

  // ============================================ perk-bottle conveyor (top-right)
  const beltA = new THREE.Vector3(3.4, 2.6, -1.5), beltB = new THREE.Vector3(9.5, 3.7, -8);
  const beltDir = new THREE.Vector3().subVectors(beltB, beltA);
  const beltLen = beltDir.length(); const beltRot = Math.atan2(beltDir.y, Math.hypot(beltDir.x, beltDir.z));
  const beltYaw = Math.atan2(beltDir.x, -beltDir.z);
  const beltMid = new THREE.Vector3().addVectors(beltA, beltB).multiplyScalar(0.5);
  const belt = new THREE.Group(); belt.position.copy(beltMid); belt.rotation.set(0, beltYaw, 0);
  const beltSurf = new THREE.Group(); beltSurf.rotation.x = -beltRot; belt.add(beltSurf);
  P(beltSurf, new THREE.BoxGeometry(0.9, 0.08, beltLen), beltMat, 0, 0, 0);
  P(beltSurf, new THREE.BoxGeometry(0.06, 0.16, beltLen), steelDk, -0.48, 0.05, 0);
  P(beltSurf, new THREE.BoxGeometry(0.06, 0.16, beltLen), steelDk, 0.48, 0.05, 0);
  for (let z = -beltLen / 2; z <= beltLen / 2; z += 0.5) P(beltSurf, new THREE.CylinderGeometry(0.09, 0.09, 1.0, 10), steel, 0, -0.02, z, 0, 0, Math.PI / 2);
  for (const zz of [beltLen * 0.35, -beltLen * 0.35]) { const foot = beltA.clone().lerp(beltB, 0.5 + zz / beltLen); g.add(M(new THREE.CylinderGeometry(0.06, 0.06, foot.y + 1.35, 8), iron, foot.x, (foot.y - 1.35) / 2, foot.z)); }
  g.add(belt);
  const perkCaps = [0xff3b30, 0x2fd36a, 0xffd23a, 0x59a6ff, 0xff8a28, 0xb06bff];
  const bottles = [];
  for (let i = 0; i < 6; i++) {
    const bo = new THREE.Group();
    const liquid = mat({ color: perkCaps[i], emissive: new THREE.Color(perkCaps[i]), emissiveIntensity: 0.5, roughness: 0.4 });
    P(bo, new THREE.CylinderGeometry(0.11, 0.12, 0.34, 14), bottleGlass, 0, 0.17, 0);
    P(bo, new THREE.CylinderGeometry(0.1, 0.1, 0.26, 14), liquid, 0, 0.15, 0);
    P(bo, new THREE.CylinderGeometry(0.05, 0.07, 0.1, 12), steel, 0, 0.37, 0);
    P(bo, new THREE.SphereGeometry(0.05, 10, 8), liquid, 0, 0.44, 0);
    g.add(bo); bottles.push({ mesh: bo, u0: i / 6 });
  }
  g.userData.conveyor = { a: beltA, b: beltB, speed: 0.05, bottles };

  // pale-blue haze glow deep in the hall
  const hazeMat = new THREE.MeshBasicMaterial({ color: 0x7fb4e0, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }); track.push(hazeMat);
  const hazeGeo = new THREE.PlaneGeometry(30, 16); track.push(hazeGeo);
  g.add(new THREE.Mesh(hazeGeo, hazeMat)).position.set(0, 2, -15);

  // background gears + pipework framing the depth
  gear(-4.4, 2.0, -4.4, 0.9, 16, brassDk, 0.5);
  gear(-3.2, 2.8, -4.8, 0.6, 13, copper, -0.75);
  gear(4.6, 1.3, -4.5, 1.05, 18, brassDk, -0.4);
  gear(3.4, 2.7, -4.9, 0.55, 12, copper, 0.9);
  pipe(-1.6, 3.4, -5.2, 8, Math.PI / 2, copper, 0.09);
  pipe(2.2, 3.9, -5.4, 6, Math.PI / 2 + 0.12, brassDk, 0.07);
  pipe(-8.5, 1.2, -6, 4, 0.25, copper, 0.1);
  pipe(8.6, 0.6, -6, 4, -0.2, brassDk, 0.1);

  // ---------------------------------------------------------------- the vats
  const vatX = [-1.85, 0, 1.85];
  const vatTint = [0x37d36a, 0x9a5cff, 0xff8a28];
  vatX.forEach((x, i) => {
    const v = new THREE.Group(); v.position.set(x, 0, 0);

    v.add(M(new THREE.CylinderGeometry(0.72, 0.78, 0.18, 24), iron, 0, -1.16, 0));
    v.add(M(new THREE.CylinderGeometry(0.66, 0.7, 1.9, 28, 1), verd, 0, -0.2, 0));
    for (const by of [-1.0, -0.5, 0.05, 0.55]) v.add(M(new THREE.TorusGeometry(0.685, 0.035, 10, 32), brass, 0, by, 0, Math.PI / 2));
    const rivGeo = new THREE.SphereGeometry(0.022, 8, 6); track.push(rivGeo);
    for (let r = 0; r < 20; r++) { const a = (r / 20) * Math.PI * 2; const o = new THREE.Mesh(rivGeo, brassDk); o.position.set(Math.cos(a) * 0.7, 0.55, Math.sin(a) * 0.7); v.add(o); }
    v.add(M(new THREE.SphereGeometry(0.68, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), brass, 0, 0.75, 0));
    v.add(M(new THREE.TorusGeometry(0.66, 0.05, 10, 32), brassDk, 0, 0.76, 0, Math.PI / 2));
    v.add(M(new THREE.CylinderGeometry(0.09, 0.11, 0.34, 14), copper, 0.18, 1.05, 0.12));
    v.add(M(new THREE.CylinderGeometry(0.13, 0.09, 0.1, 14), brass, 0.18, 1.24, 0.12));
    v.add(M(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 10), brassDk, -0.16, 1.02, -0.05));
    v.add(M(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 20), brass, -0.34, 0.5, 0.58, Math.PI / 2));
    v.add(M(new THREE.CylinderGeometry(0.086, 0.086, 0.02, 20), iron, -0.34, 0.5, 0.61, Math.PI / 2));

    const winY = 0.02, frameZ = 0.6, paneZ = 0.7;
    v.add(M(roundedRectGeo(0.62, 0.84, 0.09), brass, 0, winY, frameZ));
    const glowMat = mat({ color: 0x05070a, emissive: new THREE.Color(vatTint[i]), emissiveIntensity: 1.35, emissiveMap: brewTex(vatTint[i], track), roughness: 0.5, metalness: 0 });
    v.add(M(new THREE.PlaneGeometry(0.5, 0.72), glowMat, 0, winY, paneZ));
    v.add(M(new THREE.PlaneGeometry(0.52, 0.74), glass, 0, winY, paneZ + 0.006));
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
  const tubeGlass = mat({ color: 0xbfeaf7, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.24, side: THREE.DoubleSide });
  tube.add(M(new THREE.CylinderGeometry(0.5, 0.82, 0.42, 28), brassDk, 0, botY + 0.1, 0));
  tube.add(M(new THREE.CylinderGeometry(tubeR, tubeR, 0.12, 28), brass, 0, botY + 0.34, 0));
  tube.add(M(new THREE.CylinderGeometry(tubeR, tubeR, tubeH, 36, 1, true), tubeGlass, 0, (botY + topY) / 2, 0));
  for (let k = 0; k <= 4; k++) { const ry = botY + 0.42 + k * (tubeH - 0.7) / 4; tube.add(M(new THREE.TorusGeometry(tubeR, 0.045, 12, 36), brass, 0, ry, 0, Math.PI / 2)); }
  tube.add(M(new THREE.CylinderGeometry(tubeR + 0.05, tubeR, 0.14, 28), brass, 0, topY + 0.04, 0));
  tube.add(M(new THREE.SphereGeometry(tubeR - 0.02, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), brass, 0, topY + 0.1, 0));
  tube.add(M(new THREE.SphereGeometry(0.09, 16, 12), lampMat, 0, topY + 0.34, 0));

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

/** Emissive map for a vat window: hot core fading to dark edges + brew streaks. */
function brewTex(hex, track) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(64, 78, 6, 64, 64, 78);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.4, '#cfd6dd'); grd.addColorStop(1, '#0a0d12');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, 128, 128);
  ctx.globalAlpha = 0.5; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) { ctx.beginPath(); const y = 40 + i * 26; ctx.moveTo(10, y); ctx.bezierCurveTo(45, y - 16, 85, y + 16, 118, y - 6); ctx.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; track.push(t); return t;
}

function numberTex(n, track) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const ctx = c.getContext('2d');
  ctx.fillStyle = '#1a1206'; ctx.font = '700 96px Oswald, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; track.push(t); return t;
}
