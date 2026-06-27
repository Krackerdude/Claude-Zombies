import * as THREE from 'three';
import { buildWeaponModel } from './weaponModels.js';
import { buildPerkBottle } from '../perks/perks.js';
import { buildHomunculus } from '../gadgets/tacticalModels.js';
import { gunMetal, gunGrip, gunDark } from './gunMaterials.js';
import { paintedMetal } from '../rendering/materials/surfaces.js';

const HIP = new THREE.Vector3(0.22, -0.18, -0.4);
const HIP_DUAL = new THREE.Vector3(0.0, -0.2, -0.44); // centred: twin pistols straddle it at ±DX
const ADS = new THREE.Vector3(0.0, -0.0715, -0.32);
// SMGs carry their sights high on a top rail, so they sit lower at ADS to bring
// that sight line down to centre (the K-Vector standard for the whole class).
const ADS_SMG = new THREE.Vector3(0.0, -0.118, -0.32);
// Assault rifles sit 15% lower than the generic ADS (the Galil standard for the
// whole class), dropping the sight line a touch further down-centre.
const ADS_AR = new THREE.Vector3(0.0, -0.0822, -0.32);
// LMGs (hmg) carry their sights high + the gun is bulky: drag the ADS ~20% lower
// than the generic so the sight line reads down-centre.
const ADS_HMG = new THREE.Vector3(0.0, -0.0858, -0.32);
// Non-scoped snipers sit 10% lower than the generic (scoped ones hide the model).
const ADS_SNIPER = new THREE.Vector3(0.0, -0.0787, -0.32);
// Death Machine is bespoke and oversized: drop its hip pose and pull it in
// toward the player so the minigun doesn't crowd the screen, and sit its ADS
// ~20% lower than the generic so the sight line reads down-centre.
const HIP_DM = new THREE.Vector3(0.22, -0.23, -0.34);
const ADS_DM = new THREE.Vector3(0.0, -0.0858, -0.32);
const _off = new THREE.Vector3();
const _world = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _koff = new THREE.Vector3();
const _kworld = new THREE.Vector3();
const _qk = new THREE.Quaternion();
const _ke = new THREE.Euler(0, 0, 0, 'YXZ');
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (c, target, rate, dt) => c + (target - c) * (1 - Math.exp(-rate * dt));

/**
 * First-person weapon model. Each weapon gets a distinct primitive model from
 * buildWeaponModel(). The model lives in its OWN scene that the RenderManager
 * draws in a second pass with the depth buffer cleared — so the gun always sits
 * over the world AND its own parts occlude each other correctly (the old single
 * scene used depthTest:false everywhere, which made the body see-through).
 * Carries ADS raise, recoil kick, look-sway, walk-bob, reload pose, muzzle flash.
 */
export class Viewmodel {
  #vmScene = new THREE.Scene();
  #group = new THREE.Group();
  #model = null;
  #muzzle;
  #muzzleCore;
  #flash;
  #muzzleZ = -0.5;
  // animated weapon parts exposed by the model's userData (revolver cylinder
  // that advances a chamber per shot; minigun barrel cluster that spins while firing)
  #animParts = null;
  #cylAngle = 0; #cylTarget = 0; #barrelVel = 0;
  // dual-wield (twin mirrored pistols): two holders, the left one scale.x = -1 so
  // its geometry AND its reload lean mirror for free. Shots alternate sides.
  #dual = false; #dualR = null; #dualL = null;
  #dualDX = 0.13; #dualKickR = 0; #dualKickL = 0;
  #light;
  #starTex;
  #energyTex;
  #energyFlash = false;
  #shock;
  #shockRings = [];
  #shockT = 99;
  #prevFired = 0;
  #thunder = false;
  #sway = new THREE.Vector2();
  #mvel = new THREE.Vector2(); // low-passed mouse velocity for smooth sway
  #bob = 0;
  #kick = 0;
  #prone = 0;
  #reload = 0;
  #tuck = 0;
  #holster = 0;
  #knife;
  #grenade;
  #pin;
  #monkey;
  #windKey;
  #arnie;
  #homunc;
  #syringe;
  #wraith;
  #wraithFlame;
  #semtex;
  #acidBomb;
  #bottle = null;
  #bottleColor = -1;
  #key;
  #ambient;

  constructor(renderManager) {
    renderManager.setOverlayScene(this.#vmScene);
    this.#vmScene.add(this.#group);

    // first-person lighting; the key (sun) + ambient track the world's shade
    this.#ambient = new THREE.AmbientLight(0xffffff, 0.9);
    this.#vmScene.add(this.#ambient);
    this.#key = new THREE.DirectionalLight(0xfff2dc, 0.7);
    this.#key.position.set(0.4, 1, 0.6);
    this.#vmScene.add(this.#key);
    this.#vmScene.add(new THREE.HemisphereLight(0x6677aa, 0x20140c, 0.4));

    // muzzle flash: a spiky cartoon star (3-step yellow->orange) + a white-hot
    // core, both additive so they read as bloomed against the world.
    this.#light = new THREE.PointLight(0xffd9a0, 0, 6, 2);
    this.#group.add(this.#light);
    this.#flash = new THREE.Group();
    this.#starTex = makeFlashStar();
    this.#energyTex = makeEnergyFlash();
    this.#muzzle = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.34),
      new THREE.MeshBasicMaterial({ map: this.#starTex, color: 0xffffff, transparent: true, opacity: 0, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.#muzzleCore = new THREE.Mesh(
      new THREE.PlaneGeometry(0.14, 0.14),
      new THREE.MeshBasicMaterial({ map: makeFlashCore(), color: 0xffffff, transparent: true, opacity: 0, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.#flash.add(this.#muzzle, this.#muzzleCore);
    this.#flash.renderOrder = 10;
    this.#group.add(this.#flash);

    // Thundergun shockwave: concentric rings that punch outward at extreme speed
    this.#shock = new THREE.Group();
    const ringTex = makeShockRing();
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: ringTex, color: 0xcfe6ff, transparent: true, opacity: 0, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      this.#shock.add(r); this.#shockRings.push(r);
    }
    this.#shock.renderOrder = 10; this.#shock.visible = false;
    this.#group.add(this.#shock);

    // melee knife (its own object, shown only during a swipe) — a proper combat
    // knife built from the shared gun materials: bright gunmetal blade with a
    // fuller groove + clip-point tip, dark crossguard, stippled grip, pommel.
    this.#knife = new THREE.Group();
    {
      const steel = gunMetal(0xc9cfd8);
      const dark = gunDark(0x16181d);
      const grip = gunGrip(0x2a2d33);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.24), steel);
      blade.position.z = -0.18;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.085, 4), steel);
      tip.rotation.x = -Math.PI / 2; tip.scale.set(0.2, 1, 1); // flatten to blade thickness
      tip.position.set(0, 0, -0.34);
      const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.014, 0.2), dark);
      fuller.position.set(0, 0.008, -0.18);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.028), dark);
      guard.position.z = -0.05;
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.12), grip);
      handle.position.z = 0.03;
      const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.046, 0.022), steel);
      pommel.position.z = 0.095;
      this.#knife.add(blade, tip, fuller, guard, handle, pommel);
      this.#knife.scale.setScalar(0.95); // modest on-screen size
    }
    this.#knife.visible = false;
    this.#vmScene.add(this.#knife);

    // cooked grenade held in hand — proper green frag body (shared painted-metal
    // + gunDark fuze) with a safety lever and a pull-pin that flicks off on cook
    this.#grenade = new THREE.Group();
    {
      const gbody = paintedMetal(0x40592a); gbody.roughness = 0.5; gbody.metalness = 0.55;
      const gsteel = gunDark(0x1d201a);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), gbody);
      body.scale.set(1, 1.28, 1); // ovoid frag body
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.043, 0.018, 10), gsteel);
      collar.position.y = 0.066;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.033, 0.026, 10), gsteel);
      cap.position.y = 0.087;
      const lever = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.078, 0.02), gsteel);
      lever.position.set(0.04, 0.05, 0); lever.rotation.z = 0.12;
      this.#grenade.add(body, collar, cap, lever);
    }
    this.#pin = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.02, 0.005, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0xcfc8a0, metalness: 0.85, roughness: 0.3 }),
    );
    this.#pin.add(ring);
    this.#pin.position.set(0.06, 0.085, 0);
    this.#grenade.add(this.#pin);
    this.#grenade.visible = false;
    this.#vmScene.add(this.#grenade);

    // held cymbal monkey (tactical) — a compact in-hand version with a wind-up
    // key on its side that cranks while you charge the throw (the "pin pull")
    this.#monkey = buildVmMonkey();
    this.#windKey = this.#monkey.userData.windKey;
    this.#monkey.visible = false;
    this.#vmScene.add(this.#monkey);

    // held Lil' Arnie jar (tactical) — shaken before the throw
    this.#arnie = buildVmArnieJar();
    this.#arnie.visible = false;
    this.#vmScene.add(this.#arnie);

    // held Homunculus (tactical) — injected with serum before the throw
    this.#homunc = buildHomunculus();
    this.#homunc.scale.setScalar(0.42); // a substantial creature in the hand, not a figurine
    this.#homunc.visible = false;
    this.#vmScene.add(this.#homunc);
    this.#syringe = buildVmSyringe();
    this.#syringe.scale.setScalar(1.6);
    this.#syringe.visible = false;
    this.#vmScene.add(this.#syringe);

    // held WraithFire canister (lethal) + the blue flame it bursts into on cook
    this.#wraith = buildVmWraith();
    this.#wraith.visible = false;
    this.#vmScene.add(this.#wraith);
    this.#wraithFlame = buildVmFlames();
    this.#wraithFlame.visible = false;
    this.#vmScene.add(this.#wraithFlame);

    // held Semtex cluster (lethal) — armed by pressing a button before the throw
    this.#semtex = buildVmSemtex();
    this.#semtex.visible = false;
    this.#vmScene.add(this.#semtex);

    // held Acid bomb (lethal) — a brass acid-mine with a pull pin
    this.#acidBomb = buildVmAcid();
    this.#acidBomb.visible = false;
    this.#vmScene.add(this.#acidBomb);
  }

  setWeapon(weapon) {
    if (this.#model) {
      this.#group.remove(this.#model);
      this.#model.traverse((n) => { n.geometry?.dispose?.(); n.material?.dispose?.(); });
    }
    const { group, muzzle } = buildWeaponModel(weapon);
    this.#muzzleZ = muzzle;

    // dual-wield: two holders (right normal, left mirrored via scale.x = -1)
    this.#dual = !!weapon.data.dualWield;
    if (this.#dual) {
      this.#dualR = new THREE.Group(); this.#dualR.add(group);
      this.#dualL = new THREE.Group(); this.#dualL.add(buildWeaponModel(weapon).group); this.#dualL.scale.set(-1, 1, 1);
      this.#dualKickR = 0; this.#dualKickL = 0;
      const container = new THREE.Group();
      container.add(this.#dualR, this.#dualL);
      this.#model = container;
      this.#group.add(container);
    } else {
      this.#dualR = this.#dualL = null;
      this.#model = group;
      this.#group.add(group);
    }

    // capture animated parts (cylinder / spinning barrels) from the model
    const ud = group.userData || {};
    this.#animParts = (ud.cylinder || ud.barrelSpin) ? ud : null;
    this.#cylAngle = 0; this.#cylTarget = 0; this.#barrelVel = 0;
    if (ud.cylinder) ud.cylinder.rotation.z = 0;
    if (ud.barrelSpin) ud.barrelSpin.rotation.z = 0;

    // energy weapons get a coloured plasma muzzle (tinted electric burst);
    // everything else keeps the warm cartoon star
    this.#energyFlash = weapon.data.muzzleEffect === 'energy';
    const ecol = weapon.data.energyColor ?? 0x46f060;
    const pap = weapon.data.pap;
    this.#muzzle.material.map = this.#energyFlash ? this.#energyTex : this.#starTex;
    // PaP: a pink flash with a crimson-hot core (deep crimson -> pink gradient)
    this.#muzzle.material.color.set(pap ? 0xff5fc4 : this.#energyFlash ? ecol : 0xffffff);
    this.#muzzleCore.material.color.set(pap ? 0xff2a6a : 0xffffff);
    this.#muzzle.material.needsUpdate = true;
    const fx0 = this.#dual ? this.#dualDX : 0; // dual: flash starts on the right gun
    this.#flash.position.set(fx0, 0.0, this.#muzzleZ - 0.04);
    this.#light.color.set(pap ? 0xff2a6a : this.#energyFlash ? ecol : 0xffd9a0);
    this.#light.position.set(fx0, 0.0, this.#muzzleZ);
    // Thundergun: replace the flash with expanding shockwave rings at the muzzle
    this.#thunder = weapon.data.muzzleEffect === 'shockwave';
    this.#shock.position.set(0, 0.0, this.#muzzleZ - 0.02);
    this.#shock.visible = this.#thunder;
    this.#shockT = 99; this.#prevFired = 0;
  }

  /** Twin-pistol animation: alternate the firing side per shot (muzzle flash +
   *  per-gun kick), and lean both guns inward on reload. Same local values are
   *  applied to each holder; the left holder's scale.x = -1 mirrors it. */
  #updateDual(weapon, dt) {
    if (!this.#dualR || !this.#dualL) return;
    const DX = this.#dualDX;

    // new shot -> flash + kick on the gun the WeaponSystem actually fired from
    // (weapon._dualSide), so the tracer + muzzle flash always match
    if (weapon.justFired > this.#prevFired + 1e-4) {
      const side = weapon._dualSide ? 1 : -1;
      this.#flash.position.x = side * DX;
      this.#light.position.x = side * DX;
      if (side > 0) this.#dualKickR = 1; else this.#dualKickL = 1;
    }
    this.#dualKickR += (0 - this.#dualKickR) * Math.min(1, dt * 11);
    this.#dualKickL += (0 - this.#dualKickL) * Math.min(1, dt * 11);

    // reload lean inward + slight pull to centre (left mirrors via scale.x = -1)
    const lean = this.#reload;
    const inward = lean * 0.05;
    const leanRoll = lean * 0.55;
    this.#dualR.position.set(DX - inward, 0, this.#dualKickR * 0.05);
    this.#dualR.rotation.set(this.#dualKickR * 0.22, lean * 0.15, leanRoll);
    this.#dualL.position.set(-DX + inward, 0, this.#dualKickL * 0.05);
    this.#dualL.rotation.set(this.#dualKickL * 0.22, lean * 0.15, leanRoll);
  }

  /** Place + animate the model relative to the camera. */
  update(camera, weapon, dt, opts) {
    const { mouseDX = 0, mouseDY = 0, moveSpeed = 0, visible = true } = opts;
    // track the world's light at the player: dim the sun (key) in shade, with
    // ambient/hemisphere keeping the gun readable rather than going black
    if (opts.shade != null && this.#key) {
      const s = opts.shade;
      this.#key.intensity = 0.12 + 0.6 * s;
      this.#ambient.intensity = 0.5 + 0.4 * s;
    }
    this.#group.visible = visible;
    if (!visible || !weapon) return;

    // look-sway: low-pass the mouse delta, then ease the offset toward it so a
    // quick flick glides instead of snapping straight to the clamp. ADS cuts it hard.
    const ads = weapon.adsProgress || 0;
    const swayMul = (opts.swayMul ?? 1) * (1 - ads * 0.9); // ~10% sway at full ADS
    this.#mvel.x = damp(this.#mvel.x, mouseDX, 14, dt);
    this.#mvel.y = damp(this.#mvel.y, mouseDY, 14, dt);
    const tSwayX = THREE.MathUtils.clamp(-this.#mvel.x * 0.0045 * swayMul, -0.05, 0.05);
    const tSwayY = THREE.MathUtils.clamp(this.#mvel.y * 0.0045 * swayMul, -0.05, 0.05);
    this.#sway.x = damp(this.#sway.x, tSwayX, 6, dt);
    this.#sway.y = damp(this.#sway.y, tSwayY, 6, dt);

    // walk bob (suppressed while sliding/diving, tuned down while aiming)
    const bobMul = 1 - ads * 0.65;
    const bobSpeed = opts.noBob ? 0 : moveSpeed;
    this.#bob += dt * bobSpeed * 1.6;
    const bobX = Math.cos(this.#bob) * 0.01 * Math.min(1, bobSpeed / 5) * bobMul;
    const bobY = Math.abs(Math.sin(this.#bob)) * 0.012 * Math.min(1, bobSpeed / 5) * bobMul;

    // recoil kick (rises on fire, recovers)
    if (weapon.justFired > 0) this.#kick = Math.min(1, this.#kick + dt * 18);
    else this.#kick += (0 - this.#kick) * Math.min(1, dt * 9);

    // reload pose: ease the gun down + tilt, with a mag-swap surge mid-reload
    const reloadTarget = weapon.reloading ? 1 : 0;
    this.#reload += (reloadTarget - this.#reload) * Math.min(1, dt * 9);
    const swap = Math.sin(Math.min(1, weapon.reloadProgress) * Math.PI) * this.#reload; // 0->1->0

    const cat = weapon.data.category;
    const dm = weapon.data.name === 'DEATH MACHINE';
    const dual = weapon.data.dualWield;
    // dual wield doesn't ADS; focusOnly weapons only ease the camera FOV (the
    // viewmodel stays at the hip — no raise to the eye).
    const a = (dual || weapon.data.focusOnly) ? 0 : weapon.adsProgress * (1 - this.#reload);
    const hipPos = dm ? HIP_DM : dual ? HIP_DUAL : HIP;
    const adsPos = dm ? ADS_DM
      : cat === 'smg' ? ADS_SMG
      : cat === 'assaultRifle' ? ADS_AR
      : cat === 'hmg' ? ADS_HMG
      : cat === 'sniper' ? ADS_SNIPER
      : ADS;
    _off.lerpVectors(hipPos, adsPos, a);
    _off.x += this.#sway.x + bobX - swap * 0.05;
    _off.y += this.#sway.y + bobY - this.#reload * 0.14 - swap * 0.03;
    _off.z += this.#kick * 0.06 - this.#reload * 0.04;

    // melee: brief but full down-right holster while the knife crosses
    const melee = opts.melee || 0;
    const cook = opts.cook;
    const drink = opts.drink;
    const dip = Math.sin(Math.min(1, melee) * Math.PI); // 0->1->0
    _off.y -= dip * 0.5;
    _off.x += dip * 0.34;

    // "put the gun down" actions: pull fully down + to the right, off-screen.
    // Eased so the gun visibly lowers before the action's own animation begins.
    const tacticalCook = opts.tacticalCook;
    const holsterTarget = (cook || drink || tacticalCook) ? 1 : 0;
    this.#holster = damp(this.#holster, holsterTarget, 14, dt);
    const holster = Math.max(this.#holster, opts.swapDown || 0);
    if (holster > 0) { _off.y -= holster * 0.6; _off.x += holster * 0.4; _off.z += holster * 0.05; }

    // crouch tuck: rotate the gun inward a touch (Cold-War flavor)
    const crouchTuck = opts.crouch ? 1 : 0;
    this.#tuck = damp(this.#tuck, crouchTuck, 8, dt);
    // prone: drop the gun low to sell being near the floor (tweened, not snapped)
    this.#prone = damp(this.#prone, opts.prone ? 1 : 0, 7, dt);
    _off.y -= this.#prone * 0.07;

    // damage tilt: quick back-and-forth lean away from the hit
    let dmgRoll = 0;
    if (opts.damage) {
      const k = Math.sin(opts.damage.t * Math.PI); // 0->1->0 across 0.25s
      dmgRoll = -opts.damage.side * k * 0.2;
      _off.x += opts.damage.side * k * 0.05;
      _off.y -= k * 0.035;
      _off.z += k * 0.03;
    }

    // placed directly in the viewmodel camera's frame (origin, looking -Z),
    // so look/recoil/FOV on the gameplay camera never touch the viewmodel
    this.#group.position.copy(_off);
    _e.set(this.#kick * 0.14 + this.#reload * 0.55 + swap * 0.25, swap * 0.4 + this.#tuck * 0.18, this.#reload * 0.22 + this.#tuck * 0.22 + dmgRoll);
    this.#group.quaternion.setFromEuler(_e);

    // dual-wield twin-pistol animation (alternating fire + mirrored reload lean)
    if (this.#dual) this.#updateDual(weapon, dt);

    // knife slash: a fast diagonal cut from upper-right down to lower-left
    const sweep = Math.min(1, melee / 0.4);
    this.#knife.visible = melee > 0 && sweep < 1;
    if (this.#knife.visible) {
      // fast-start, slow-middle, fast-end so the cut has weight (timing unchanged)
      const p = sweep + 0.9 * Math.sin(2 * Math.PI * sweep) / (2 * Math.PI);
      _koff.set(lerp(0.52, -0.56, p), lerp(0.14, -0.3, p), -0.21); // pulled in closer to camera
      this.#knife.position.copy(_koff);
      _ke.set(lerp(-0.4, 0.5, p), lerp(-1.05, 1.15, p), lerp(1.5, -1.7, p));
      this.#knife.quaternion.setFromEuler(_ke);
    }

    // lethal: only after the gun has lowered off-screen. Frag pulls its pin;
    // WraithFire destabilises and bursts into blue flame in the hand.
    const cookKind = cook?.kind;
    this.#grenade.visible = !!cook && (cookKind === 'frag' || !cookKind) && this.#holster > 0.85;
    this.#wraith.visible = !!cook && cookKind === 'wraithfire' && this.#holster > 0.85;
    this.#wraithFlame.visible = this.#wraith.visible;
    this.#acidBomb.visible = !!cook && cookKind === 'acid' && this.#holster > 0.85;
    if (this.#acidBomb.visible) {
      const gt = Math.max(0, cook.t - 0.16);
      const draw = Math.min(1, gt / 0.35);
      _koff.set(lerp(0.2, 0.12, draw), lerp(-0.28, -0.18, draw) + Math.sin(this.#bob) * 0.01, lerp(-0.44, -0.36, draw));
      this.#acidBomb.position.copy(_koff);
      this.#acidBomb.rotation.set(0.2, gt * 1.0, 0);
      // pull the pin: it flicks off over the first beat
      const pinPop = gt / 0.2;
      const pin = this.#acidBomb.userData.pin;
      if (pin) { pin.visible = pinPop < 1; if (pin.visible) { pin.position.set(0.09 + pinPop * 0.2, 0.04 + pinPop * 0.16, -pinPop * 0.06); pin.rotation.z = pinPop * 14; } }
    }
    this.#semtex.visible = !!cook && cookKind === 'semtex' && this.#holster > 0.85;
    if (this.#semtex.visible) {
      const gt = Math.max(0, cook.t - 0.16);
      const draw = Math.min(1, gt / 0.35);
      _koff.set(lerp(0.2, 0.12, draw), lerp(-0.27, -0.17, draw) + Math.sin(this.#bob) * 0.01, lerp(-0.42, -0.34, draw));
      this.#semtex.position.copy(_koff);
      this.#semtex.rotation.set(0.35, -0.5 + gt * 0.6, 0);
      // ARM IT: a thumb presses the detonator button down, then the LED blinks fast
      const press = Math.min(1, gt / 0.22);
      const btn = this.#semtex.userData.button, led = this.#semtex.userData.led;
      if (btn) btn.position.y = btn.userData.y - press * 0.014;
      if (led) led.visible = press >= 1 ? (Math.sin(gt * 30) > -0.2) : true; // solid then armed-blink
    }
    if (this.#wraith.visible) {
      const gt = Math.max(0, cook.t - 0.16);
      const draw = Math.min(1, gt / 0.35);
      _koff.set(lerp(0.2, 0.12, draw), lerp(-0.27, -0.17, draw) + Math.sin(this.#bob) * 0.01, lerp(-0.42, -0.34, draw));
      this.#wraith.position.copy(_koff);
      this.#wraith.rotation.set(0.15, gt * 1.4, 0);
      // instability: the flame erupts and grows, shaking the canister, as it cooks
      const inst = Math.min(1, gt / 0.5);
      const shudder = inst * 0.012;
      this.#wraithFlame.position.set(_koff.x + Math.sin(gt * 50) * shudder, _koff.y + 0.02, _koff.z);
      this.#wraithFlame.scale.setScalar(0.3 + inst * 1.0);
      animateVmFlames(this.#wraithFlame, gt);
    }
    if (this.#grenade.visible) {
      const gt = Math.max(0, cook.t - 0.16); // local time once the gun is down
      const pull = Math.min(1, gt / 0.35);
      _koff.set(lerp(0.2, 0.12, pull), lerp(-0.27, -0.17, pull) + Math.sin(this.#bob) * 0.01, lerp(-0.42, -0.34, pull));
      this.#grenade.position.copy(_koff);
      this.#grenade.quaternion.identity();
      const pinPop = gt / 0.18;
      this.#pin.visible = pinPop < 1;
      if (this.#pin.visible) {
        this.#pin.position.set(0.075 + pinPop * 0.18, 0.03 + pinPop * 0.16, -pinPop * 0.06);
        this.#pin.rotation.z = pinPop * 14;
      }
    } else {
      this.#pin.visible = true; this.#pin.position.set(0.075, 0.03, 0); this.#pin.rotation.z = 0;
    }

    // tacticals: once the gun is stowed, draw the held item up and run its
    // "pin"-gate animation, then it vanishes as the gun returns — the real one
    // has been thrown. Monkey winds its key; Arnie's jar gets shaken.
    const tcKind = tacticalCook?.kind;
    const shown = !!tacticalCook && this.#holster > 0.85;
    this.#monkey.visible = shown && tcKind === 'monkey';
    this.#arnie.visible = shown && tcKind === 'arnie';
    this.#homunc.visible = shown && tcKind === 'homunculus';
    this.#syringe.visible = this.#homunc.visible;
    if (this.#monkey.visible) {
      const gt = Math.max(0, tacticalCook.t - 0.16);     // local time once the gun is down
      const draw = Math.min(1, gt / 0.4);                // raise into the hold
      _koff.set(lerp(0.24, 0.14, draw), lerp(-0.34, -0.17, draw) + Math.sin(this.#bob) * 0.012, lerp(-0.46, -0.36, draw));
      this.#monkey.position.copy(_koff);
      // 3/4 turn so the face and the side-mounted key both read; a touch of
      // eager jitter while winding that settles as it tightens
      const wind = Math.min(1, gt / 0.7);
      const jitter = (1 - wind) * 0.05;
      _e.set(Math.sin(gt * 26) * jitter, 0.6, Math.sin(gt * 31) * jitter);
      this.#monkey.quaternion.setFromEuler(_e);
      if (this.#windKey) this.#windKey.rotation.x = gt * lerp(34, 12, wind); // cranks fast, eases as it tightens
      const clash = (Math.sin(gt * 24) * 0.5 + 0.5) * 0.5 * wind; // cymbals start twitching as it's wound
      const A = this.#monkey.userData;
      if (A.armL) A.armL.rotation.z = 0.5 + clash;
      if (A.armR) A.armR.rotation.z = -0.5 - clash;
    }
    if (this.#arnie.visible) {
      const gt = Math.max(0, tacticalCook.t - 0.16);
      const draw = Math.min(1, gt / 0.4);
      // hard shake: a fast rattle that ramps up as you wind it, the parasite
      // sloshing inside; settles to a hold for the throw
      const shake = Math.min(1, gt / 0.5);
      const amp = 0.018 * shake;
      _koff.set(
        lerp(0.22, 0.13, draw) + Math.sin(gt * 47) * amp,
        lerp(-0.34, -0.18, draw) + Math.sin(this.#bob) * 0.012 + Math.sin(gt * 39) * amp,
        lerp(-0.46, -0.36, draw),
      );
      this.#arnie.position.copy(_koff);
      _e.set(0.1 + Math.sin(gt * 41) * 0.12 * shake, 0.4, Math.sin(gt * 53) * 0.14 * shake);
      this.#arnie.quaternion.setFromEuler(_e);
      const seed = this.#arnie.userData.seed; // the parasite jostles in the fluid
      if (seed) seed.position.set(Math.sin(gt * 33) * 0.02, seed.userData.y + Math.sin(gt * 27) * 0.015, Math.cos(gt * 30) * 0.02);
    }
    if (this.#homunc.visible) {
      const gt = Math.max(0, tacticalCook.t - 0.16);
      const draw = Math.min(1, gt / 0.4);
      const rage = Math.min(1, gt / 0.6);                  // the serum takes hold
      // bigger model -> held a touch lower + further so the whole gremlin frames
      _koff.set(lerp(0.16, 0.1, draw), lerp(-0.66, -0.48, draw) + Math.sin(this.#bob) * 0.012, lerp(-0.74, -0.64, draw));
      this.#homunc.position.copy(_koff);
      // face the player, with a rising rage shudder once injected
      _e.set(Math.sin(gt * 40) * 0.06 * rage, Math.PI, Math.sin(gt * 46) * 0.09 * rage);
      this.#homunc.quaternion.setFromEuler(_e);
      const J = this.#homunc.userData;
      if (J.armL) J.armL.rotation.set(-0.3 + Math.sin(gt * 22) * 1.0 * rage, 0, 0.4);
      if (J.armR) J.armR.rotation.set(-0.6 + Math.cos(gt * 20) * 0.9 * rage, 0, -0.25);
      if (J.legL) J.legL.rotation.x = Math.sin(gt * 24) * 0.6 * rage;
      if (J.legR) J.legR.rotation.x = Math.cos(gt * 23) * 0.6 * rage;
      if (J.head) J.head.rotation.z = Math.sin(gt * 28) * 0.25 * rage;
      // syringe: jab into his torso from the side, then depress the plunger
      const jab = Math.min(1, gt / 0.3), plunge = Math.max(0, Math.min(1, (gt - 0.25) / 0.35));
      this.#syringe.position.set(_koff.x + lerp(0.24, 0.1, jab), _koff.y + 0.26, _koff.z + 0.06);
      const pl = this.#syringe.userData.plunger;
      if (pl) pl.position.y = pl.userData.y - plunge * 0.028;
    }

    // perk drink: pop the cap, raise the bottle to the mouth, bubbles, then toss
    if (drink) {
      if (!this.#bottle || this.#bottleColor !== drink.color) {
        if (this.#bottle) this.#vmScene.remove(this.#bottle);
        this.#bottle = buildPerkBottle(drink.color);
        this.#vmScene.add(this.#bottle);
        this.#bottleColor = drink.color;
      }
      this.#bottle.visible = true;
      const t = drink.t;
      const capPop = Math.min(1, t / 0.18);
      const raise = Math.max(0, Math.min(1, (t - 0.15) / 0.22)); // snaps to the mouth fast
      const toss = Math.max(0, (t - 1.5) / 0.22);                // hard throw to the side
      // shifted ~10% left (less off-shoulder) and 20% closer to camera
      _koff.set(-0.04 + raise * 0.01 - toss * 0.6, -0.2 + raise * 0.14 - toss * 0.4, -0.272);
      this.#bottle.position.copy(_koff);
      _ke.set(raise * 1.1 * (1 - toss), -toss * 0.8, -toss * 2.8); // tip back to chug, whip out on toss
      this.#bottle.quaternion.setFromEuler(_ke);
      const cap = this.#bottle.userData.cap;
      if (cap) {
        cap.visible = capPop < 1;
        cap.position.set(capPop * 0.04, 0.12 + capPop * 0.16, -capPop * 0.06);
        cap.rotation.x = capPop * 9;
      }
      for (const b of this.#bottle.userData.bubbles) { b.position.y += dt * 0.09; if (b.position.y > 0.06) b.position.y = -0.05; }
    } else if (this.#bottle) {
      this.#bottle.visible = false;
    }

    // muzzle flash decay — sharp on, quick off. Star spins + pops each frame
    // for that cartoon flicker; the core stays put and white-hot.
    const lit = Math.max(0, weapon.justFired / 0.05);
    const pop = lit > 0 && !this.#thunder;
    this.#flash.visible = pop;
    if (pop) {
      const e = this.#energyFlash;
      this.#muzzle.material.opacity = lit;
      this.#muzzle.rotation.z = e ? this.#muzzle.rotation.z + 0.35 : Math.random() * Math.PI; // plasma swirls, star flickers
      this.#muzzle.scale.setScalar(e ? 1.1 + Math.random() * 0.35 : 0.85 + Math.random() * 0.6);
      this.#muzzleCore.material.opacity = Math.min(1, lit * 1.3);
      this.#muzzleCore.scale.setScalar(e ? 1.1 + Math.random() * 0.2 : 0.9 + Math.random() * 0.25);
    }

    // Thundergun: a fresh shot launches concentric rings that blast outward fast,
    // staggered, fading as they grow — a visible "thunderclap" pressure wave.
    if (this.#thunder) {
      if (weapon.justFired > this.#prevFired + 1e-4) this.#shockT = 0; // rising edge = new shot
      this.#shockT += dt;
      for (let i = 0; i < this.#shockRings.length; i++) {
        const t = this.#shockT - i * 0.045;
        const r = this.#shockRings[i];
        if (t < 0 || t > 0.32) { r.material.opacity = 0; continue; }
        const k = t / 0.32;
        const size = 0.15 + k * k * 3.4;      // accelerating expansion (extreme speed)
        r.scale.setScalar(size);
        r.material.opacity = (1 - k) * 0.9;
        r.position.z = -k * 0.25;             // drift forward as it goes
      }
      this.#light.intensity = this.#shockT < 0.12 ? (1 - this.#shockT / 0.12) * 7 : 0;
      this.#light.color.set(0xbcd8ff);
    } else {
      this.#light.intensity = lit * (this.#energyFlash ? 5.5 : 4.5);
    }

    // animated parts: revolver cylinder advances one chamber per shot (eased);
    // minigun barrel cluster spins up while firing and coasts down after
    if (this.#animParts) {
      const ud = this.#animParts;
      if (ud.cylinder) {
        if (weapon.justFired > this.#prevFired + 1e-4) this.#cylTarget += (Math.PI * 2) / (ud.chambers || 6);
        this.#cylAngle += (this.#cylTarget - this.#cylAngle) * Math.min(1, dt * 20);
        ud.cylinder.rotation.z = this.#cylAngle;
      }
      if (ud.barrelSpin) {
        const firing = weapon.justFired > 0;
        this.#barrelVel += ((firing ? 30 : 0) - this.#barrelVel) * Math.min(1, dt * (firing ? 5 : 1.5));
        ud.barrelSpin.rotation.z += this.#barrelVel * dt;
      }
    }
    this.#prevFired = weapon.justFired;
  }
}

// A soft bright annulus — scaled up over time it reads as an expanding
// shockwave/pressure ring for the Thundergun.
function makeShockRing() {
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d'); const cx = s / 2;
  const g = x.createRadialGradient(cx, cx, 0, cx, cx, cx);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.72, 'rgba(255,255,255,0)');
  g.addColorStop(0.86, 'rgba(200,228,255,0.85)'); g.addColorStop(0.95, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(200,228,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

// Spiky cartoon muzzle star: distinct white -> yellow -> orange bands (a faked
// 3-step gradient) so it reads sharp and high-contrast like TF2.
function makeFlashStar() {
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d'); const cx = s / 2, cy = s / 2;
  const spikes = 9, outer = s * 0.48, inner = s * 0.2;
  x.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * r * (i % 2 ? 1 : 0.8 + Math.random() * 0.4);
    const py = cy + Math.sin(a) * r * (i % 2 ? 1 : 0.8 + Math.random() * 0.4);
    i ? x.lineTo(px, py) : x.moveTo(px, py);
  }
  x.closePath();
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, outer);
  g.addColorStop(0.0, '#fffdf2'); g.addColorStop(0.28, '#fff6cf');
  g.addColorStop(0.30, '#ffd23a'); g.addColorStop(0.55, '#ffb01e');
  g.addColorStop(0.57, '#ff7a12'); g.addColorStop(0.85, '#e8550a');
  g.addColorStop(1.0, 'rgba(150,40,0,0)');
  x.fillStyle = g; x.fill();
  return new THREE.CanvasTexture(c);
}

// Soft electric plasma burst: a white core with a few jagged tendrils, kept
// near-white so it tints cleanly to any energy colour (multiplied by material).
function makeEnergyFlash() {
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d'); const cx = s / 2, cy = s / 2;
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, s * 0.5);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.32, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.62, 'rgba(230,255,240,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.beginPath(); x.arc(cx, cy, s * 0.5, 0, 7); x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 3; x.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + Math.random() * 0.5;
    x.beginPath(); x.moveTo(cx, cy);
    for (let k = 1; k <= 3; k++) { const r = (k / 3) * s * 0.46; const aa = a + (Math.random() - 0.5) * 0.6; x.lineTo(cx + Math.cos(aa) * r, cy + Math.sin(aa) * r); }
    x.stroke();
  }
  return new THREE.CanvasTexture(c);
}

function makeFlashCore() {
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,248,210,0.9)');
  g.addColorStop(0.75, 'rgba(255,200,90,0.4)'); g.addColorStop(1, 'rgba(255,160,40,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

// First-person cymbal monkey held while winding up a Monkey Bomb throw. Compact,
// hand-scaled; exposes armL/armR (clapping cymbals) + a side wind-up key in
// userData so the viewmodel can crank it.
function buildVmMonkey() {
  const fur = new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 0.85 });
  const face = new THREE.MeshStandardMaterial({ color: 0xb9966c, roughness: 0.7 });
  const fez = new THREE.MeshStandardMaterial({ color: 0x2a3d8f, roughness: 0.6 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x6b6f55, roughness: 0.8 });
  const cymbal = new THREE.MeshStandardMaterial({ color: 0xb98a2e, metalness: 0.8, roughness: 0.35 });
  const tnt = new THREE.MeshStandardMaterial({ color: 0x7a1c14, roughness: 0.7 });
  const eye = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xc00000, emissiveIntensity: 1.4 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8b8c0, metalness: 0.85, roughness: 0.3 });

  const g = new THREE.Group();
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  add(new THREE.BoxGeometry(0.11, 0.1, 0.085), fur, 0, 0.02, 0);            // torso
  add(new THREE.SphereGeometry(0.055, 12, 10), fur, 0, 0.11, 0);           // head
  add(new THREE.SphereGeometry(0.036, 10, 8), face, 0, 0.1, 0.03);        // muzzle
  add(new THREE.CylinderGeometry(0.03, 0.036, 0.042, 12), fez, 0, 0.16, 0); // fez
  add(new THREE.SphereGeometry(0.01, 8, 6), eye, -0.019, 0.12, 0.044);
  add(new THREE.SphereGeometry(0.01, 8, 6), eye, 0.019, 0.12, 0.044);
  add(new THREE.BoxGeometry(0.12, 0.034, 0.092), cloth, 0, -0.035, 0.004);  // vest/legs
  for (let i = -1; i <= 1; i++) add(new THREE.CylinderGeometry(0.013, 0.013, 0.11, 8), tnt, i * 0.022, 0.025, -0.056); // dynamite

  // arms ending in cymbals, pivoting at the shoulder so they can clap
  const arm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.055, 0.03, 0.025);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.07), fur);
    upper.position.set(side * -0.016, 0, 0.026); pivot.add(upper);
    const cym = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.007, 16), cymbal);
    cym.rotation.x = Math.PI / 2; cym.position.set(side * -0.03, 0, 0.056); pivot.add(cym);
    pivot.rotation.z = side * 0.5;
    g.add(pivot);
    return pivot;
  };
  g.userData.armL = arm(-1);
  g.userData.armR = arm(1);

  // wind-up key on the right side: a shaft along X with a T crossbar; spins on X
  const key = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.04, 8), steel);
  shaft.rotation.z = Math.PI / 2; shaft.position.x = 0.02; key.add(shaft);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.012), steel);
  bar.position.x = 0.042; key.add(bar);
  key.position.set(0.055, 0.03, -0.02);
  g.add(key);
  g.userData.windKey = key;
  return g;
}

// First-person Lil' Arnie jar held while shaking up a throw. A glass jar (brass
// lid, wood slats, glowing fluid) with the curled parasite seed sloshing inside.
function buildVmArnieJar() {
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfeede, transparent: true, opacity: 0.34, roughness: 0.1 });
  const fluid = new THREE.MeshStandardMaterial({ color: 0x7fd6c0, emissive: 0x1c5a4a, emissiveIntensity: 0.5, transparent: true, opacity: 0.5, roughness: 0.2 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x9a7b34, metalness: 0.7, roughness: 0.4 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.85 });
  // sickly wet flesh + glossy sclera, matching the world parasite
  const skin = new THREE.MeshStandardMaterial({ color: 0x6f6d49, roughness: 0.2, metalness: 0.15 });
  const sclera = new THREE.MeshStandardMaterial({ color: 0xcfc858, emissive: 0x6a6a18, emissiveIntensity: 0.7, roughness: 0.12, metalness: 0.1 });
  const pupil = new THREE.MeshStandardMaterial({ color: 0x0c0c06, roughness: 0.25 });

  const g = new THREE.Group();
  const H = 0.16, R = 0.072;
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 16, 1, true), glass); cyl.position.y = 0; g.add(cyl);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass); dome.position.y = H / 2; g.add(dome);
  const fl = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.9, R * 0.9, H * 0.82, 16), fluid); fl.position.y = -0.005; g.add(fl);
  // the parasite seed: a curled tapered fleshy body (faceted lathe, no sphere)
  // with one faceted lens eye + nub tentacles
  const seedPts = [[0.0, -0.04], [0.024, -0.02], [0.036, 0.01], [0.03, 0.035], [0.0, 0.05]].map((p) => new THREE.Vector2(p[0], p[1]));
  const seed = new THREE.Group();
  const sb = new THREE.Mesh(new THREE.LatheGeometry(seedPts, 6), skin); sb.scale.z = 1.3; seed.add(sb);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.007, 0.018, 8), sclera); lens.rotation.x = Math.PI / 2; lens.position.set(0, 0.008, 0.032); seed.add(lens);
  const slit = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.018, 0.006), pupil); slit.position.set(0, 0.008, 0.04); seed.add(slit);
  for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.003, 0.05, 6), skin); t.position.set((i - 1.5) * 0.012, -0.02, 0.01); t.rotation.x = 0.6; seed.add(t); }
  seed.position.set(0, -0.01, 0); seed.userData.y = -0.01; g.add(seed); g.userData.seed = seed;
  // brass lid + wood slats
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.008, R + 0.008, 0.022, 16), brass); lid.position.y = H / 2 + 0.01; g.add(lid);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const slat = new THREE.Mesh(new THREE.BoxGeometry(0.012, H + 0.02, 0.012), wood); slat.position.set(Math.cos(a) * R, 0, Math.sin(a) * R); g.add(slat); }
  return g;
}

// A serum syringe jabbed into the Homunculus during its wind-up (the "pin" gate).
function buildVmSyringe() {
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfe0e0, transparent: true, opacity: 0.4, roughness: 0.15 });
  const serum = new THREE.MeshStandardMaterial({ color: 0x86d24a, emissive: 0x3a6a14, emissiveIntensity: 0.7, transparent: true, opacity: 0.75, roughness: 0.2 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.8, roughness: 0.3 });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.08, 12), glass));
  const fluid = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.06, 12), serum); fluid.position.y = -0.005; g.add(fluid);
  const plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 12), steel); plunger.position.y = 0.05; plunger.userData.y = 0.05; g.add(plunger);
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.05), steel); thumb.position.y = 0.075; g.add(thumb);
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.07, 6), steel); needle.position.y = -0.075; g.add(needle);
  g.rotation.set(0.2, 0, 1.15); // needle angled down-left toward the gremlin's body
  g.userData.plunger = plunger;
  return g;
}

// Held WraithFire canister — a lantern: a bright cyan glow-core caged in brass
// bars so the glow SHOWS (don't bury it in an opaque shell -> reads as black).
function buildVmWraith() {
  const brass = new THREE.MeshStandardMaterial({ color: 0x9a7b34, metalness: 0.7, roughness: 0.4 });
  const glow = new THREE.MeshBasicMaterial({ color: 0x6fe0ff });
  const halo = new THREE.MeshBasicMaterial({ color: 0x49c6ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.12, 12), glow));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.14, 12), halo));
  const capT = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.05, 0.022, 12), brass); capT.position.y = 0.07; g.add(capT);
  const capB = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.056, 0.022, 12), brass); capB.position.y = -0.07; g.add(capB);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.13, 6), brass); bar.position.set(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05); g.add(bar); }
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.03, 8), brass); fuse.position.y = 0.1; g.add(fuse);
  return g;
}

// Held Semtex brick — an olive plastic-explosive slab with a detonator button
// (pressed to arm) and a red LED. userData exposes the button + LED.
function buildVmSemtex() {
  const putty = new THREE.MeshStandardMaterial({ color: 0x6b7a32, roughness: 0.85 });
  const band = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x20241a, roughness: 0.6, metalness: 0.3 });
  const led = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.1), putty));
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.142, 0.02, 0.102), band); stripe.position.y = 0.01; g.add(stripe);
  const det = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.06), dark); det.position.y = 0.045; g.add(det);
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.014, 10), dark); button.position.y = 0.066; button.userData.y = 0.066; g.add(button);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), led); lamp.position.set(0.04, 0.05, 0.03); g.add(lamp);
  g.userData = { button, led: lamp };
  return g;
}

// Held Acid bomb — a brass acid-mine sphere with glowing green ports, a visible
// green acid core, and a pull pin. userData exposes the pin.
function buildVmAcid() {
  const brass = new THREE.MeshStandardMaterial({ color: 0x8a7a45, metalness: 0.65, roughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3526, metalness: 0.5, roughness: 0.55 });
  const glow = new THREE.MeshBasicMaterial({ color: 0x9bff3a });
  const core = new THREE.MeshBasicMaterial({ color: 0xbfff66, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  const steel = new THREE.MeshStandardMaterial({ color: 0xcfc8a0, metalness: 0.85, roughness: 0.3 });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), brass));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), core));
  const dirs = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  for (const d of dirs) {
    const n = new THREE.Vector3(d[0], d[1], d[2]);
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.021, 0.04, 8), dark);
    pod.position.copy(n).multiplyScalar(0.068); pod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n); g.add(pod);
    const port = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.008, 8), glow);
    port.position.copy(n).multiplyScalar(0.088); port.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n); g.add(port);
  }
  // pull pin (a ring + a short tang) up on top
  const pin = new THREE.Group();
  pin.add(new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 6, 12), steel));
  pin.position.set(0.09, 0.05, 0);
  g.add(pin);
  g.userData = { pin };
  return g;
}

// A small clutch of additive blue flame tongues (shared by the cook FX).
function buildVmFlames() {
  const g = new THREE.Group();
  const outer = new THREE.MeshBasicMaterial({ color: 0x2a7bff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const core = new THREE.MeshBasicMaterial({ color: 0xbfeeff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const geo = new THREE.ConeGeometry(1, 1, 7);
  const tongues = [];
  for (let i = 0; i < 8; i++) {
    const h = 0.06 + Math.random() * 0.06;
    const m = new THREE.Mesh(geo, Math.random() < 0.4 ? core : outer);
    m.scale.set(0.025, h, 0.025);
    m.position.set((Math.random() - 0.5) * 0.07, 0.02 + Math.random() * 0.05, (Math.random() - 0.5) * 0.07);
    m.userData.h = h; m.userData.r = m.scale.x; m.userData.ph = Math.random() * 6.28;
    g.add(m); tongues.push(m);
  }
  g.userData.tongues = tongues;
  return g;
}
function animateVmFlames(g, t) {
  for (const m of g.userData.tongues) {
    const f = 0.7 + 0.4 * Math.sin(t * 16 + m.userData.ph);
    m.scale.y = m.userData.h * f; m.scale.x = m.scale.z = m.userData.r * (0.85 + 0.2 * f);
    m.position.y = 0.02 + m.scale.y * 0.5; m.rotation.y += 0.1;
  }
}
