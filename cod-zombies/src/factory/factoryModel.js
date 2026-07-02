import * as THREE from 'three';
import { PERKS, buildPerkMachine } from '../perks/perks.js';
import { buildGumballMachine } from '../gobblegums/gumballMachine.js';

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

  // real perk + gobblegum machines lining the hall (built from the game models).
  // Placed on the floor (base y=0 → factory floor y=-1.35), collected for disposal.
  const bgMachines = [];
  const addMachine = (grp, x, z, ry = 0, s = 1) => {
    grp.position.set(x, -1.35, z); grp.rotation.y = ry; grp.scale.setScalar(s);
    g.add(grp); bgMachines.push(grp); return grp;
  };
  const perkDefs = Object.values(PERKS);

  // =========================================================== floor + walls
  const floorMat = mat({ color: 0x0c1119, roughness: 0.55, metalness: 0.5 });
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
  // Densely line both flanks with the real perk + gobblegum machines, angled to
  // face inward and receding into the fog. Kept off to the sides / behind so
  // they never crowd the hero vats. [x, z, yaw, scale, kind, perkIndex]
  const layout = [
    // left flank (turned to face right/in)
    [-4.6, -5.0, 0.45, 1.0, 'perk', 1], [-6.1, -6.3, 0.5, 1.0, 'gum'],
    [-7.4, -7.8, 0.55, 1.0, 'perk', 2], [-8.8, -9.6, 0.6, 1.05, 'gum'],
    [-5.4, -10.8, 0.4, 1.05, 'perk', 7], [-9.9, -12.4, 0.6, 1.1, 'perk', 4],
    // right flank (turned to face left/in)
    [4.9, -5.2, -0.5, 1.0, 'gum'], [6.3, -6.5, -0.5, 1.0, 'perk', 3],
    [7.7, -8.1, -0.55, 1.0, 'gum'], [9.0, -9.9, -0.6, 1.05, 'perk', 5],
    [5.6, -11.0, -0.4, 1.05, 'perk', 6], [10.0, -12.6, -0.6, 1.1, 'gum'],
    // a couple deep down the centre aisle behind the vats
    [-1.6, -13.5, 0.15, 1.05, 'perk', 8], [1.8, -14.2, -0.15, 1.05, 'gum'],
  ];
  for (const [x, z, ry, s, kind, pi] of layout) {
    addMachine(kind === 'gum' ? buildGumballMachine() : buildPerkMachine(perkDefs[pi % perkDefs.length]), x, z, ry, s);
  }
  // a few plain boiler tanks tucked between them for silhouette variety
  boiler(-3.0, -8.0, 1.0, 0x2f6b62); boiler(3.2, -8.4, 1.0, 0x2f6b62);
  // catwalk spanning mid-depth (kept high + dark)
  g.add(M(new THREE.BoxGeometry(24, 0.16, 0.7), steelDk, 0, 2.0, -11));
  for (let x = -11; x <= 11; x += 1.6) g.add(M(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), steel, x, 2.35, -11));
  g.add(M(new THREE.CylinderGeometry(0.04, 0.04, 24, 8), brass, 0, 2.7, -11, 0, 0, Math.PI / 2));

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
  // travel from the far/high end down toward the near end (correct direction)
  g.userData.conveyor = { a: beltB, b: beltA, speed: 0.05, bottles };

  // pale-blue haze glow deep in the hall
  const hazeMat = new THREE.MeshBasicMaterial({ color: 0x7fb4e0, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }); track.push(hazeMat);
  const hazeGeo = new THREE.PlaneGeometry(30, 16); track.push(hazeGeo);
  const haze = new THREE.Mesh(hazeGeo, hazeMat); haze.position.set(0, 2, -15); g.add(haze);

  // background gears mounted on backplates up on the side walls (not floating),
  // with pipes running the wall lines to tie the machinery together.
  const gearPlate = (x, y, z) => g.add(M(new THREE.BoxGeometry(2.0, 2.0, 0.2), steelDk, x, y, z));
  gearPlate(-7.2, 2.4, -7.4); gear(-6.6, 2.7, -7.2, 0.85, 16, brassDk, 0.5); gear(-7.7, 1.9, -7.2, 0.55, 13, copper, -0.75);
  gearPlate(7.2, 2.4, -7.4);  gear(6.6, 2.7, -7.2, 0.85, 16, brassDk, -0.4); gear(7.7, 1.9, -7.2, 0.55, 12, copper, 0.9);
  // horizontal service pipes running along the upper wall line + verticals down
  pipe(-7, 3.6, -7.6, 9, Math.PI / 2, copper, 0.1);
  pipe(7, 3.9, -7.6, 9, Math.PI / 2, brassDk, 0.08);
  pipe(-9.2, 0.8, -8, 5, 0.0, copper, 0.09);
  pipe(9.2, 0.6, -8, 5, 0.0, brassDk, 0.09);

  // (foreground framing gears removed — at this close, narrow-FOV camera any gear
  // wide enough to sit in the corners falls off the frame, and centred ones cover
  // the console. Left clean; revisit if the FOV is widened for framing room.)

  // -------------------------------------------------- the gobblegum machines
  // Each is a verdigris cabinet with: a RAISED CLEAR GLASS chamber (you can see
  // the gum spin/hover inside), a real tesla coil up top, a brass NAMEPLATE
  // plaque above the glass, and side detailing. `userData.vats[i]` exposes the
  // chamber centre, coil top, plate anchor + the coil material for the reveal.
  const chrome     = mat({ color: 0xccd1d8, roughness: 0.22, metalness: 0.95 });
  const ceramic    = mat({ color: 0xe6dfce, roughness: 0.6, metalness: 0.05 });
  const clearGlass = mat({ color: 0xdff2ff, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.12, side: THREE.DoubleSide });
  const darkBack   = mat({ color: 0x080b10, roughness: 0.92, metalness: 0.08 });
  const vatX = [-1.85, 0, 1.85];
  const vatTint = [0x37d36a, 0x9a5cff, 0xff8a28];
  vatX.forEach((x, i) => {
    const v = new THREE.Group(); v.position.set(x, 0, 0);

    // cabinet
    v.add(M(new THREE.CylinderGeometry(0.72, 0.78, 0.18, 24), iron, 0, -1.16, 0));       // footing
    v.add(M(new THREE.CylinderGeometry(0.66, 0.7, 1.9, 28, 1), verd, 0, -0.2, 0));       // body
    for (const by of [-1.0, -0.55, 0.62]) v.add(M(new THREE.TorusGeometry(0.685, 0.035, 10, 32), brass, 0, by, 0, Math.PI / 2)); // hoops
    const rivGeo = new THREE.SphereGeometry(0.02, 8, 6); track.push(rivGeo);
    for (let r = 0; r < 20; r++) { const a = (r / 20) * Math.PI * 2; const o = new THREE.Mesh(rivGeo, brassDk); o.position.set(Math.cos(a) * 0.7, -0.9, Math.sin(a) * 0.7); v.add(o); }
    // brass shoulder cap the coil sits on
    v.add(M(new THREE.CylinderGeometry(0.58, 0.68, 0.16, 28), brass, 0, 0.83, 0));
    v.add(M(new THREE.TorusGeometry(0.6, 0.04, 10, 32), brassDk, 0, 0.76, 0, Math.PI / 2));

    // --- tesla coil ---
    v.add(M(new THREE.CylinderGeometry(0.11, 0.13, 0.34, 16), ceramic, 0, 1.05, 0));                    // insulator base
    for (let k = 0; k < 6; k++) v.add(M(new THREE.TorusGeometry(0.115 - k * 0.004, 0.02, 8, 22), copper, 0, 0.98 + k * 0.055, 0, Math.PI / 2)); // secondary windings
    v.add(M(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 12), chrome, 0, 1.36, 0));                     // stalk
    v.add(M(new THREE.TorusGeometry(0.15, 0.055, 14, 30), chrome, 0, 1.46, 0, Math.PI / 2));            // toroid electrode
    const coilMat = mat({ color: 0x9fd4ff, emissive: new THREE.Color(0x3d86ff), emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.5 });
    v.add(M(new THREE.SphereGeometry(0.075, 18, 14), coilMat, 0, 1.53, 0));                             // discharge terminal
    // two flanking glass tubes with faint inner glow
    for (const sx of [-0.34, 0.34]) {
      v.add(M(new THREE.CylinderGeometry(0.05, 0.05, 0.52, 12, 1, true), clearGlass, sx, 1.06, 0.02));
      v.add(M(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 8), coilMat, sx, 1.06, 0.02));
      v.add(M(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), brass, sx, 0.82, 0.02));
    }

    // --- raised clear-glass display chamber (front) ---
    const cy = 0.06, backZ = 0.66, glassZ = 0.99, barZc = (backZ + glassZ) / 2, barD = glassZ - backZ;
    const fw = 0.5, fh = 0.78;
    v.add(M(new THREE.PlaneGeometry(fw + 0.02, fh + 0.02), darkBack, 0, cy, backZ + 0.002)); // dark interior backing
    // brass frame bars around the raised box
    v.add(M(new THREE.BoxGeometry(fw + 0.14, 0.08, barD), brass, 0, cy + fh / 2, barZc));
    v.add(M(new THREE.BoxGeometry(fw + 0.14, 0.08, barD), brass, 0, cy - fh / 2, barZc));
    v.add(M(new THREE.BoxGeometry(0.08, fh, barD), brass, -fw / 2 - 0.03, cy, barZc));
    v.add(M(new THREE.BoxGeometry(0.08, fh, barD), brass, fw / 2 + 0.03, cy, barZc));
    // corner bolts
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) v.add(M(new THREE.SphereGeometry(0.028, 8, 6), brassDk, sx * (fw / 2 + 0.03), cy + sy * fh / 2, glassZ - 0.02));
    // the clear front pane
    v.add(M(new THREE.PlaneGeometry(fw, fh), clearGlass, 0, cy, glassZ));
    // dim rarity glow inside so the empty chamber reads (brightens during a spin)
    const vl = new THREE.PointLight(vatTint[i], 0.3, 2.2); vl.position.set(0, cy, 0.78); v.add(vl);

    // --- nameplate plating (brass marquee above the glass) ---
    v.add(M(new THREE.BoxGeometry(0.78, 0.02, 0.14), brassDk, 0, 0.6, 0.86));       // shelf under the plate
    v.add(M(new THREE.BoxGeometry(0.72, 0.15, 0.05), brass, 0, 0.68, 0.9));          // the plaque (DOM name projects here)
    v.add(M(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 8), brassDk, 0, 0.78, 0.9, Math.PI / 2)); // plate light bar
    v.add(M(new THREE.SphereGeometry(0.03, 10, 8), lampMat, -0.3, 0.68, 0.94));      // marquee bulbs
    v.add(M(new THREE.SphereGeometry(0.03, 10, 8), lampMat, 0.3, 0.68, 0.94));

    // side gauge detail
    v.add(M(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 20), brass, -0.52, 0.2, 0.42, Math.PI / 2));
    v.add(M(new THREE.CylinderGeometry(0.086, 0.086, 0.02, 20), iron, -0.52, 0.2, 0.44, Math.PI / 2));
    v.add(M(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 10), copper, 0.5, -0.3, 0.3, 0, 0, 0.2)); // side pipe

    g.add(v);
    g.userData.vats.push({
      group: v, baseX: x, tint: vatTint[i], light: vl, coilMat,
      coilLocal: new THREE.Vector3(0, 1.53, 0),
      chamberLocal: new THREE.Vector3(0, cy, 0.8),
      chamberWorld: new THREE.Vector3(x, cy, 0.8),
      plateWorld: new THREE.Vector3(x, 0.68, 0.95),
    });
  });

  // -------------------------------- transport tube (right) — runs off-screen
  // A tall glass down-pipe: gums enter near the top for a last glance, then shoot
  // DOWN and out of frame. Open top rim (no cap) + open bottom into the depths.
  const tubeX = 3.55;
  const tube = new THREE.Group(); tube.position.set(tubeX, 0, 0);
  const topY = 1.95, entryY = 1.5, botY = -8.5;   // botY is well below the frame
  const tubeH = topY - botY;
  const tubeR = 0.5;
  const tubeGlass = mat({ color: 0xbfeaf7, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
  tube.add(M(new THREE.CylinderGeometry(tubeR, tubeR, tubeH, 36, 1, true), tubeGlass, 0, (topY + botY) / 2, 0)); // long column
  // brass rings only down the visible portion
  for (let ry = topY - 0.05; ry > -1.6; ry -= 0.72) tube.add(M(new THREE.TorusGeometry(tubeR, 0.045, 12, 36), brass, 0, ry, 0, Math.PI / 2));
  // open flared brass rim at the top (gums drop in here)
  tube.add(M(new THREE.CylinderGeometry(tubeR + 0.12, tubeR, 0.16, 28, 1, true), brass, 0, topY + 0.02, 0));
  tube.add(M(new THREE.TorusGeometry(tubeR + 0.1, 0.04, 12, 32), brass, 0, topY + 0.1, 0, Math.PI / 2));

  // downward light streaks (scrolled in the loop)
  const beamMats = [];
  for (let b = 0; b < 2; b++) {
    const bm = new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.18 + b * 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); track.push(bm);
    const bg = new THREE.CylinderGeometry(0.34 - b * 0.13, 0.34 - b * 0.13, 4.5, 24, 1, true); track.push(bg);
    const beam = new THREE.Mesh(bg, bm); beam.position.y = 0.2; tube.add(beam);
    beamMats.push(bm);
  }
  const tubeLight = new THREE.PointLight(0x9fe6ff, 0.7, 5); tubeLight.position.set(0, 0.9, 0.3); tube.add(tubeLight);
  g.add(tube);
  g.userData.tube = { group: tube, world: new THREE.Vector3(tubeX, 0, 0), topY, entryY, botY, beamMats };

  // ---------------------------------------------------------- wager console
  // A mechanical control bench: riveted iron housing, a slanted brass control
  // deck, exposed gears + pipes on the front, gauges, and the three dome buttons.
  const consoleZ = 1.7, consoleY = -1.12;
  const deck = new THREE.Group();
  deck.add(M(new THREE.BoxGeometry(2.5, 0.5, 0.8), iron, 0, consoleY - 0.14, consoleZ));            // main housing
  deck.add(M(new THREE.BoxGeometry(2.6, 0.1, 0.9), brassDk, 0, consoleY + 0.13, consoleZ));          // top lip
  // slanted control deck the buttons sit on
  const deckTop = M(new THREE.BoxGeometry(2.4, 0.06, 0.62), brass, 0, consoleY + 0.19, consoleZ + 0.02, -0.18);
  deck.add(deckTop);
  // riveted front band
  const cRiv = new THREE.SphereGeometry(0.022, 8, 6); track.push(cRiv);
  for (let r = -5; r <= 5; r++) { const o = new THREE.Mesh(cRiv, brass); o.position.set(r * 0.22, consoleY - 0.02, consoleZ + 0.41); deck.add(o); }
  // front gauges
  for (const gx of [-1.0, 1.0]) {
    deck.add(M(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 20), brass, gx, consoleY - 0.12, consoleZ + 0.4, Math.PI / 2));
    deck.add(M(new THREE.CylinderGeometry(0.095, 0.095, 0.02, 20), iron, gx, consoleY - 0.12, consoleZ + 0.42, Math.PI / 2));
    deck.add(M(new THREE.BoxGeometry(0.01, 0.08, 0.01), lampMat, gx, consoleY - 0.09, consoleZ + 0.44));
  }
  // exposed brass pipe running along the base + valve
  deck.add(M(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 12), copper, 0, consoleY - 0.32, consoleZ + 0.34, 0, 0, Math.PI / 2));
  deck.add(M(new THREE.TorusGeometry(0.1, 0.03, 8, 16), brass, 0.7, consoleY - 0.32, consoleZ + 0.36, Math.PI / 2));
  g.add(deck);
  // little spinning gears flanking the deck (added to the spin list)
  gear(-1.32, consoleY + 0.02, consoleZ + 0.36, 0.22, 12, brass, 1.1);
  gear(1.32, consoleY + 0.02, consoleZ + 0.36, 0.22, 12, brass, -1.1);

  const btnColors = [0x2fd36a, 0xffc23a, 0xff4632];
  const btnEmis   = [0x14d05a, 0xffab00, 0xff2a12];
  [-0.72, 0.1, 0.92].forEach((bx, i) => {
    const grp = new THREE.Group(); grp.position.set(bx, consoleY + 0.24, consoleZ + 0.06); grp.rotation.x = -0.18;
    grp.add(M(new THREE.BoxGeometry(0.44, 0.12, 0.44), steelDk, 0, -0.02, 0));         // pedestal
    grp.add(M(new THREE.CylinderGeometry(0.21, 0.24, 0.07, 24), brass, 0, 0.05, 0));   // brass collar
    grp.add(M(new THREE.TorusGeometry(0.2, 0.02, 8, 24), brassDk, 0, 0.08, 0, Math.PI / 2));
    const glowMat = mat({ color: btnColors[i], emissive: new THREE.Color(btnEmis[i]), emissiveIntensity: 0.85, roughness: 0.3, metalness: 0.2 });
    const dome = M(new THREE.SphereGeometry(0.16, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), glowMat, 0, 0.12, 0);
    grp.add(dome);
    grp.add(M(new THREE.PlaneGeometry(0.24, 0.16), brass, 0, -0.06, 0.24, -0.4));       // number plate
    const numMat = new THREE.MeshBasicMaterial({ map: numberTex(i + 1, track), transparent: true, depthWrite: false }); track.push(numMat);
    grp.add(M(new THREE.PlaneGeometry(0.18, 0.13), numMat, 0, -0.06, 0.247, -0.4));
    g.add(grp);
    g.userData.buttons.push({ mesh: dome, group: grp, restY: 0.12, glowMat, world: new THREE.Vector3(bx, consoleY + 0.4, consoleZ), wager: i + 1 });
  });

  g.userData.dispose = () => {
    for (const t of track) t.dispose?.();
    for (const m of bgMachines) {
      m.userData?.dispose?.();
      m.traverse((o) => { o.geometry?.dispose?.(); if (Array.isArray(o.material)) o.material.forEach((mm) => mm.dispose?.()); else o.material?.dispose?.(); });
    }
  };
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
