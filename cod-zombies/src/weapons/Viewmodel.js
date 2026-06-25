import * as THREE from 'three';
import { buildWeaponModel } from './weaponModels.js';
import { buildPerkBottle } from '../perks/perks.js';
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
    this.#muzzle.material.map = this.#energyFlash ? this.#energyTex : this.#starTex;
    this.#muzzle.material.color.set(this.#energyFlash ? ecol : 0xffffff);
    this.#muzzle.material.needsUpdate = true;
    const fx0 = this.#dual ? this.#dualDX : 0; // dual: flash starts on the right gun
    this.#flash.position.set(fx0, 0.0, this.#muzzleZ - 0.04);
    this.#light.color.set(this.#energyFlash ? ecol : 0xffd9a0);
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
    const holsterTarget = (cook || drink) ? 1 : 0;
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

    // grenade: only after the gun has lowered off-screen; then pull the pin
    // (it flicks off) and draw the grenade into the hold
    this.#grenade.visible = !!cook && this.#holster > 0.85;
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
