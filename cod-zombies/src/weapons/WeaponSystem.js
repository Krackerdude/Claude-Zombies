import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Transform, Renderable, PlayerTag, ZombieTag, ProjectileTag } from '../ecs/components/index.js';
import { Service } from '../core/ServiceLocator.js';
import { Action } from '../config/keybinds.js';
import { MoveState } from '../player/MoveState.js';
import { ZombieConfig, EconomyConfig } from '../config/zombies.js';
import { makeWeapon, PAP_SPECIAL, PAP_NAMES } from './catalog.js';
import { Viewmodel } from './Viewmodel.js';
import { WeaponFx } from './WeaponFx.js';
import { damageZombie } from './damage.js';

/** Automatic + burst weapons flinch the target far less, so sustained fire
 *  doesn't make zombies undulate; semi/single-shot weapons flinch fully. */
function flinchScaleFor(fireMode) {
  return (fireMode === 'auto' || fireMode === 'burst') ? 0.3 : 1;
}

/** Per-limb-hit chance to blow that limb off, scaling 10% (light) -> 25% (heavy
 *  caliber) on the weapon's base per-shot damage. */
function dismemberChanceFor(damage) {
  const t = Math.max(0, Math.min(1, (damage - 30) / 120));
  return 0.10 + t * 0.15;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _oc = new THREE.Vector3();
const _center = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _sunDir = new THREE.Vector3();
const _rayO = new THREE.Vector3();
const _end = new THREE.Vector3();
const _muz = new THREE.Vector3();
const _muz2 = new THREE.Vector3();
const _nrm = new THREE.Vector3();
const _col = new THREE.Color();
const _explo = new THREE.Vector3();
const _ja = new THREE.Vector3(); // bone-hitbox joint A
const _jb = new THREE.Vector3(); // bone-hitbox joint B

// explosion palettes — frag/rocket burn fiery, PHD goes purple
const EXPLO = {
  frag: { hot: 0xfff1c0, mid: 0xff9a1e, deep: 0xe24a06, ash: 0x8a6440, smoke: 0x241a12, light: 0xffa040, scale: 1.1 },
  rocket: { hot: 0xfff1c0, mid: 0xff8a14, deep: 0xd23c04, ash: 0x7e5a38, smoke: 0x20160f, light: 0xffa040, scale: 1.7 },
  phd: { hot: 0xf2dcff, mid: 0xb45cff, deep: 0x7a1edd, ash: 0x4a2a6a, smoke: 0x1c1030, light: 0xb060ff, scale: 1.3 },
};
const MELEE_TIME = 0.75;
const MELEE_HIT_AT = 0.28; // seconds into the swing when the blade connects
const MELEE_RANGE = 4.3;

/**
 * A LAW rocket whose NOSE points down local -Z (camera forward). The geometry
 * is baked to that axis on purpose: the RenderSystem overwrites the object's
 * quaternion from the Transform every frame, so a mesh-level rotation would be
 * clobbered — which is exactly what left the old plain cylinder standing
 * upright. With the axis baked in, the launch quaternion aims the nose along
 * the flight path.
 */
function makeRocket() {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x3d4a35, metalness: 0.3, roughness: 0.6 });
  const warhead = new THREE.MeshStandardMaterial({ color: 0x6e2f1c, metalness: 0.25, roughness: 0.55 });
  const finMat = new THREE.MeshStandardMaterial({ color: 0x23281f, metalness: 0.4, roughness: 0.55 });
  const nozzle = new THREE.MeshStandardMaterial({ color: 0x141619, metalness: 0.5, roughness: 0.5 });

  const bodyGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.34, 12); bodyGeo.rotateX(Math.PI / 2);
  g.add(new THREE.Mesh(bodyGeo, body));

  const noseGeo = new THREE.ConeGeometry(0.058, 0.2, 12); noseGeo.rotateX(-Math.PI / 2); // tip -> -Z
  const nose = new THREE.Mesh(noseGeo, warhead); nose.position.z = -0.27; g.add(nose);

  const tailGeo = new THREE.CylinderGeometry(0.05, 0.038, 0.07, 12); tailGeo.rotateX(Math.PI / 2);
  const tail = new THREE.Mesh(tailGeo, nozzle); tail.position.z = 0.2; g.add(tail);

  for (let i = 0; i < 4; i++) {                       // four radial tail fins
    const a = (i / 4) * Math.PI * 2;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.06, 0.1), finMat);
    fin.position.set(Math.cos(a) * 0.082, Math.sin(a) * 0.082, 0.18);
    fin.rotation.z = a - Math.PI / 2;
    g.add(fin);
  }

  g.traverse((n) => { if (n.isMesh) n.castShadow = true; });
  return g;
}

/** A glowing plasma bolt: a bright core orb + a softer halo shell, tinted. */
function makeEnergyBolt(color) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 12, 10),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  g.add(halo, core);
  return g;
}


/**
 * Owns the player's arsenal and turns input into shots. Each frame it builds a
 * `ctx` of callbacks (fireHitscan / spawnProjectile / fireCone / addRecoil /
 * emitAmmo) and hands it to the equipped weapon's update() — so all the timing
 * and ammo logic lives in the weapon, and all the world interaction lives here.
 * Also writes ADS state + recoil onto the player for the camera, switches
 * weapons (number keys / Q), and drives the viewmodel in lateUpdate.
 */
export class WeaponSystem extends System {
  #gameState;
  #input;
  #actions;
  #events;
  #camera;
  #spawn;

  #weapons = [];
  #keys = [];
  #index = 0;
  #viewmodel;
  #ctx;
  #meleeTimer = 0;
  #meleeHit = false;
  #meleeCd = 0;
  #meleeTarget = null;
  #cooking = false;
  #cookKind = 'frag';
  #tacticalCooking = false;
  #tacticalCookT = 0;
  #tacticalKind = 'monkey';
  #time;
  #drinkActive = false;
  #drinkT = 0;
  #drinkColor = 0xffffff;
  #swapT = 0; #swapDur = 0.25; #swapTarget = 0; #swapMid = false;
  #cookT = 0;
  #dmgT = 0; #dmgSide = 0;

  /** Remove and return the 3rd-slot weapon key (Mule Kick loss). */
  stashThird() {
    if (this.#weapons.length < 3) return null;
    const key = this.#keys[2];
    this.#weapons.splice(2, 1);
    this.#keys.splice(2, 1);
    if (this.#index >= this.#weapons.length) this.#equip(this.#weapons.length - 1, this.world.get(this.#playerId, PlayerTag));
    this.#emitAmmo(this.current);
    return key;
  }
  #wasReloading = false;
  #playerId;
  #nav;
  #sceneMgr = null;
  #shadeRay = new THREE.Raycaster();
  #shade = 1;
  #fx = null;
  #fxRay = new THREE.Raycaster();

  get current() { return this.#weapons[this.#index]; }
  get #perks() { return this.world.services.has(Service.Perks) ? this.world.services.get(Service.Perks) : null; }

  init() {
    this.#gameState = this.world.services.get(Service.GameState);
    this.#input = this.world.services.get(Service.Input);
    this.#actions = this.world.services.get(Service.Actions);
    this.#events = this.world.services.get(Service.Events);
    this.#camera = this.world.services.get(Service.Render).camera;
    this.#shadeRay.camera = this.#camera; this.#fxRay.camera = this.#camera;
    this.#sceneMgr = this.world.services.has(Service.Scene) ? this.world.services.get(Service.Scene) : null;
    if (this.#sceneMgr) this.#fx = new WeaponFx(this.#sceneMgr.scene);
    this.#spawn = this.world.services.get(Service.Spawn);
    this.#nav = this.world.services.get(Service.Nav);
    this.#time = this.world.services.get(Service.Time);
    this.#events.on('gadget:cook', ({ active, kind }) => { this.#cooking = active; if (active) this.#cookKind = kind || 'frag'; });
    this.#events.on('tactical:cook', ({ active, type }) => { this.#tacticalCooking = active; if (active) this.#tacticalKind = type; });
    // route every explosion through the shared FX (fiery for frag/rocket, purple for PHD)
    this.#events.on('fx:explosion', (e) => {
      if (!this.#fx) return;
      this.#fx.spawnExplosion(_explo.set(e.x, e.y ?? 0.6, e.z), EXPLO[e.kind] || EXPLO.frag);
      this.#events.emit('fx:shake', {});
    });
    this.#events.on('weapon:explosion', (e) => {
      if (!this.#fx) return;
      this.#fx.spawnExplosion(_explo.set(e.x, e.y ?? 0.6, e.z), EXPLO.rocket);
      this.#events.emit('fx:shake', {});
    });
    // ray-gun / energy hit: a coloured radial plasma burst, no fire or shake
    this.#events.on('weapon:plasma', (e) => {
      if (this.#fx) this.#fx.spawnPlasma(_explo.set(e.x, e.y ?? 0.6, e.z), e.color ?? 0x46f060);
    });
    // blood spurt on each zombie caught in a blast (spurts outward from the hit)
    this.#events.on('fx:blood', (e) => {
      if (!this.#fx) return;
      _nrm.set(e.dx || 0, 0.25, e.dz || 1).normalize();
      this.#fx.spawnBlood(_explo.set(e.x, e.y ?? 1.1, e.z), _nrm);
    });
    this.#events.on('perk:drink', ({ active, color }) => { this.#drinkActive = active; if (active) this.#drinkColor = color; });
    this.#events.on('player:damaged', ({ x, z }) => {
      // which side did the hit come from, relative to where we're looking?
      _dir.set(1, 0, 0).applyQuaternion(this.#camera.quaternion); // camera right
      this.#dmgSide = Math.sign(x * _dir.x + z * _dir.z) || 1;
      this.#dmgT = 0.25;
    });

    // start with just the sidearm; everything else comes from wall-buys / the box
    this.#weapons = [makeWeapon('m1911')];
    this.#keys = ['m1911'];
    this.#viewmodel = new Viewmodel(this.world.services.get(Service.Render));
    this.#viewmodel.setWeapon(this.current);

    this.#ctx = {
      fireHitscan: (w, n, s, o) => this.#fireHitscan(w, n, s, o),
      spawnProjectile: (w) => this.#spawnProjectile(w),
      fireCone: (w) => this.#fireCone(w),
      addRecoil: (p, y) => this.#addRecoil(p, y),
      emitAmmo: (w) => this.#emitAmmo(w),
      dryFire: () => {},
    };

    // reset to the starting loadout when a new run begins
    this.#events.on('state:change', ({ state, prev }) => {
      if (state === 'playing' && prev === 'menu') {
        this.#weapons = [makeWeapon('m1911')];
        this.#keys = ['m1911'];
        this.#index = 0;
        this.#viewmodel.setWeapon(this.current);
        this.#announce();
      }
    });
  }

  update(dt) {
    if (!this.#gameState.isPlaying || !this.#input.pointerLocked) return;
    const w = this.current;
    if (!w) return;

    this.#playerId = this.world.first(PlayerTag, Transform);
    if (this.#playerId === undefined) return;
    const player = this.world.get(this.#playerId, PlayerTag);
    this.#ctx.player = player;
    this.#ctx.world = this.world;
    this.#ctx.spawn = this.#spawn;
    this.#ctx.events = this.#events;

    this.#handleSwitch(player);
    this.#tickSwap(dt);

    // melee (F): lowers the gun + knife slash; suppresses firing/aiming
    const meleeing = this.#tickMelee(dt);
    const pk = this.#perks;
    const busy = meleeing || this.#cooking || this.#tacticalCooking || this.#swapT > 0 || (pk && (pk.drinking || pk.downed)); // gun stowed / out of action

    // can't aim while sprinting/sliding/diving (or mid-melee/cook/drink)
    const blocked = player.state === MoveState.SPRINT || player.state === MoveState.SLIDE || player.state === MoveState.DIVE;
    const aiming = this.#actions.active(Action.AIM) && !blocked && !busy;

    const prevScoped = this.current.scoped;
    this.current.update(dt, {
      fireHeld: !busy && this.#actions.active(Action.FIRE),
      firePressed: !busy && this.#actions.pressed(Action.FIRE),
      reloadPressed: !busy && this.#actions.pressed(Action.RELOAD),
      aiming,
      reloadMul: pk ? pk.reloadMul() : 1,   // Speed Cola
      fireRateMul: pk ? pk.fireRateMul() : 1, // Double Tap
      ...this.#ctx,
    });

    // publish view state for the camera
    player.aiming = this.current.aiming;
    player.adsFov = this.current.data.scoped ? this.current.data.scopeFov : this.current.data.adsFov;
    if (this.current.scoped !== prevScoped) {
      this.#events.emit('weapon:ads', { scoped: this.current.scoped });
    }

    // reload indicator state (emit while reloading + once when it ends)
    const rl = this.current.reloading;
    if (rl && !this.#wasReloading) this.#events.emit('weapon:reload-start', {});
    if (rl || this.#wasReloading) {
      this.#events.emit('weapon:reload', { active: rl, progress: this.current.reloadProgress });
    }
    this.#wasReloading = rl;
  }

  lateUpdate(dt) {
    const playing = this.#gameState.isPlaying;
    const w = this.current;
    if (this.#playerId === undefined) { this.#viewmodel.update(this.#camera, w, dt, { visible: false }); return; }
    const player = this.world.get(this.#playerId, PlayerTag);
    const speed = player ? Math.hypot(player.velocity.x, player.velocity.z) : 0;
    if (this.#drinkActive) this.#drinkT += dt; else this.#drinkT = 0;
    if (this.#cooking) this.#cookT += dt; else this.#cookT = 0;
    if (this.#tacticalCooking) this.#tacticalCookT += dt; else this.#tacticalCookT = 0;
    // drink camera move: lean head back during the chug, snap + roll-jerk on the toss
    if (player) {
      if (this.#drinkActive) {
        const t = this.#drinkT;
        const chug = Math.max(0, Math.min(1, (t - 0.15) / 0.22)) * Math.max(0, 1 - Math.max(0, (t - 1.5) / 0.2));
        const tossK = Math.max(0, 1 - Math.abs(t - 1.62) / 0.22); // brief spike at the throw
        player.viewLeanPitch = -0.16 * chug + 0.09 * tossK;
        player.viewLeanRoll = 0.13 * tossK;
      } else if (player.viewLeanPitch || player.viewLeanRoll) {
        player.viewLeanPitch *= 0.8; player.viewLeanRoll *= 0.8;
        if (Math.abs(player.viewLeanPitch) < 0.001) player.viewLeanPitch = 0;
        if (Math.abs(player.viewLeanRoll) < 0.001) player.viewLeanRoll = 0;
      }
    }
    if (this.#dmgT > 0) this.#dmgT = Math.max(0, this.#dmgT - dt);
    const pk = this.#perks;
    const slidingNow = player && (player.state === MoveState.SLIDE || player.state === MoveState.DIVE);
    this.#viewmodel.update(this.#camera, w, dt, {
      mouseDX: this.#input.mouseDX,
      mouseDY: this.#input.mouseDY,
      moveSpeed: speed,
      noBob: slidingNow,
      crouch: !!player && player.state === MoveState.CROUCH,
      prone: !!player && player.state === MoveState.PRONE,
      melee: this.#meleeTimer > 0 ? 1 - this.#meleeTimer / MELEE_TIME : 0,
      cook: this.#cooking ? { t: this.#cookT, kind: this.#cookKind } : null,
      tacticalCook: this.#tacticalCooking ? { t: this.#tacticalCookT, kind: this.#tacticalKind } : null,
      drink: this.#drinkActive ? { t: this.#drinkT, color: this.#drinkColor } : null,
      swayMul: pk ? pk.swayMul() : 1,
      swapDown: this.#swapDown(),
      damage: this.#dmgT > 0 ? { t: 1 - this.#dmgT / 0.25, side: this.#dmgSide } : null,
      shade: this.#sampleShade(dt),
      visible: playing && !!w && !w.scoped, // hidden when empty-handed (PaP) or behind the scope
    });
    if (this.#fx) this.#fx.update(dt);
  }

  // Cast from the player toward the sun; if blocked, the player is in shade, so
  // the viewmodel's key light is dimmed to match. Smoothed so shadow edges fade.
  #sampleShade(dt) {
    const sm = this.#sceneMgr;
    const sun = sm && sm.sun;
    let target = 1;
    if (sun && sm.scene) {
      _sunDir.copy(sun.position).normalize();
      _rayO.copy(this.#camera.position).addScaledVector(_sunDir, 0.5);
      this.#shadeRay.set(_rayO, _sunDir);
      this.#shadeRay.far = 45;
      const hits = this.#shadeRay.intersectObjects(sm.scene.children, true);
      target = hits.length > 0 ? 0 : 1;
    }
    this.#shade += (target - this.#shade) * Math.min(1, dt * 6);
    return this.#shade;
  }

  // --- weapon switching ---------------------------------------------------

  #handleSwitch(player) {
    for (let i = 0; i < this.#weapons.length && i < 9; i++) {
      if (this.#input.wasPressed('Digit' + (i + 1))) { this.#equip(i, player); return; }
    }
    if (this.#input.wasPressed('KeyQ')) this.#equip((this.#index + 1) % this.#weapons.length, player);
  }

  #equip(i, player) {
    if (i === this.#index) { this.#viewmodel.setWeapon(this.current); this.#announce(); return; }
    // start a lower-then-raise swap; the model changes at the bottom (off-screen)
    if (player) player.aiming = false;
    this.current.aiming = false;
    this.#swapTarget = i;
    const incoming = this.#weapons[i];
    const heavy = incoming.data.category === 'launcher' || incoming.data.category === 'wonder';
    this.#swapDur = heavy ? 0.42 : 0.25;
    this.#swapT = this.#swapDur;
    this.#swapMid = false;
  }

  #tickSwap(dt) {
    if (this.#swapT <= 0) return;
    this.#swapT -= dt;
    if (!this.#swapMid && this.#swapT <= this.#swapDur / 2) {
      this.#swapMid = true;
      this.#index = this.#swapTarget;
      this.current.aiming = false;
      this.#viewmodel.setWeapon(this.current);
      this.#announce();
    }
    if (this.#swapT < 0) this.#swapT = 0;
  }

  #swapDown() {
    if (this.#swapT <= 0) return 0;
    return Math.sin((1 - this.#swapT / this.#swapDur) * Math.PI); // 0->1->0
  }

  #announce() {
    const w = this.current;
    if (!w) { this.#events.emit('weapon:changed', { name: '—', category: null, mag: 0, reserve: 0 }); this.#events.emit('weapon:ammo', { mag: 0, reserve: 0, name: '—' }); return; }
    this.#events.emit('weapon:changed', { name: w.name, category: w.data.category, mag: w.magazine, reserve: w.reserve });
    this.#emitAmmo(w);
  }

  // --- fire resolution ----------------------------------------------------

  #basis() {
    const q = this.#camera.quaternion;
    _fwd.set(0, 0, -1).applyQuaternion(q);
    _right.set(1, 0, 0).applyQuaternion(q);
    _up.set(0, 1, 0).applyQuaternion(q);
  }

  #fireHitscan(weapon, count, spread) {
    this.#basis();
    const o = this.#camera.position;
    let anyHit = false, anyKill = false;

    // world-space muzzle (gun barrel tip) for tracers + shell ejection. Dual-wield
    // alternates the lateral offset each shot so the tracer/FX leave the gun that
    // actually fired (the weapon owns the side; the viewmodel flash reads the same).
    // As ADS rises the gun centres on the sight line, so ease the lateral + drop
    // offsets to ~0 — otherwise aimed tracers leave from the hip-right and read as
    // "stuck off to the right".
    const ads = weapon.adsProgress || 0;
    // AUTO akimbo fires BOTH barrels at once; semi/burst alternates sides
    const bothBarrels = weapon.data.dualWield && weapon.data.fireMode === 'auto';
    let mx = 0.12;
    if (weapon.data.dualWield) {
      if (bothBarrels) { weapon._dualSide = true; mx = 0.12; }
      else { weapon._dualSide = !weapon._dualSide; mx = weapon._dualSide ? 0.12 : -0.12; }
    } else mx *= (1 - ads);
    const my = -0.08 * (1 - ads * 0.85);
    _muz.copy(o).addScaledVector(_fwd, 0.5).addScaledVector(_right, mx).addScaledVector(_up, my);
    const tint = weapon.data.papTint;
    if (this.#fx) this.#fx.spawnMuzzle(_muz, _fwd, _right, _up, tint);
    if (bothBarrels) { // mirror barrel: flash + (below) tracer from the left gun too
      _muz2.copy(o).addScaledVector(_fwd, 0.5).addScaledVector(_right, -0.12).addScaledVector(_up, my);
      if (this.#fx) this.#fx.spawnMuzzle(_muz2, _fwd, _right, _up, tint);
    }

    for (let s = 0; s < count; s++) {
      const ax = (Math.random() * 2 - 1) * spread;
      const ay = (Math.random() * 2 - 1) * spread;
      _dir.copy(_fwd).addScaledVector(_right, Math.tan(ax)).addScaledVector(_up, Math.tan(ay)).normalize();

      // bullets stop at solid walls but pass through window gaps (barrier cells
      // aren't solid), so you can shoot the dead through the boards.
      const wallDist = this.#wallDistance(o, _dir, weapon.data.range);

      // every bullet penetrates, hitting each zombie it passes through once
      const hits = this.#rayZombies(o, _dir, Math.min(weapon.data.range, wallDist));
      let pen = 0;
      for (const { id, tca, headshot, part } of hits) {
        anyHit = true;
        const falloff = Math.pow(0.5, pen); // -50% damage per zombie already pierced
        const pk = this.#perks;
        const hsMul = headshot ? weapon.data.headshotMultiplier * (pk ? pk.headshotMul() : 1) : 1;
        const dMul = pk ? pk.damageMul(weapon.data.category) : 1;
        const dmg = weapon.data.damage * hsMul * dMul * falloff;
        if (damageZombie(this.#ctx, id, dmg, { headshot, dir: _dir, part, flinchScale: flinchScaleFor(weapon.data.fireMode), dismemberChance: dismemberChanceFor(weapon.data.damage) })) anyKill = true;
        pen++;
      }

      // --- impact FX for this bullet ---
      if (this.#fx) {
        const ztca = hits.length ? hits[0].tca : Infinity; // nearest zombie along ray
        if (isFinite(ztca) && ztca <= wallDist) {
          _end.copy(o).addScaledVector(_dir, ztca);
          this.#fx.spawnBlood(_end, _dir);               // zombie: blood, no smoke/holes
        } else if (wallDist < weapon.data.range && this.#surfaceImpact(o, _dir, wallDist)) {
          // #surfaceImpact hit a real surface and set _end to its exact point
        } else {
          // clean miss — OR the xz wall-march flagged a wall the real ray flew
          // over (e.g. firing upward past the rooftops). Either way the tracer
          // streaks the full distance instead of dead-ending on a stale point.
          _end.copy(o).addScaledVector(_dir, weapon.data.range);
        }
        this.#fx.spawnTracer(_muz, _end, tint);
        if (bothBarrels) this.#fx.spawnTracer(_muz2, _end, tint); // both akimbo barrels streak
      }
    }
    if (anyHit) this.#events.emit('weapon:hit', { killed: anyKill });
  }

  /** Raycast the world to get a precise surface point/normal/colour, then spawn
   *  the material-aware impact there. Sets `_end` to the surface point and
   *  returns true when it hits something solid; returns false when the ray
   *  finds nothing real (so the caller can fly the tracer to full range rather
   *  than trusting the approximate xz wall-march). */
  #surfaceImpact(o, dir, wallDist) {
    this.#fxRay.set(o, dir);
    this.#fxRay.far = wallDist + 0.6;
    const hits = this.#fxRay.intersectObjects(this.#sceneMgr.scene.children, true);
    let pick = null;
    for (const h of hits) {
      if (!h.face || h.distance < 0.5) continue;     // clear the player capsule
      if (this.#fxIgnored(h.object)) continue;        // never put holes on zombies/corpses
      if (this.#hidden(h.object)) continue;           // torn-off (invisible) planks: no floating decals
      pick = h; break;
    }
    if (pick) {
      _end.copy(pick.point);
      _nrm.copy(pick.face.normal).transformDirection(pick.object.matrixWorld).normalize();
      if (_nrm.dot(dir) > 0) _nrm.multiplyScalar(-1);
      const mc = pick.object.material && pick.object.material.color;
      _col.copy(mc || _col.setHex(0x9a9a9a));
      this.#fx.spawnImpact(_end, _nrm, _col);
      return true;
    }
    return false; // only a zombie/dynamic prop (or open sky) along the ray
  }

  #fxIgnored(obj) {
    for (let o = obj; o; o = o.parent) if (o.userData && o.userData.noBulletFx) return true;
    return false;
  }

  /** True if the object (or any ancestor) is hidden — e.g. a torn-off plank, so a
   *  shot through the empty window doesn't leave a floating decal/particle. */
  #hidden(obj) {
    for (let o = obj; o; o = o.parent) if (o.visible === false) return true;
    return false;
  }

  /** Distance to the first solid wall cell along the ray (xz march), or range. */
  #wallDistance(o, dir, range) {
    const stepLen = this.#nav.cs * 0.5;
    const steps = Math.ceil(range / stepLen);
    for (let i = 1; i <= steps; i++) {
      const d = i * stepLen;
      const cell = this.#nav.cellAt(o.x + dir.x * d, o.z + dir.z * d);
      if (cell < 0) return d; // left the arena
      if (this.#nav.solid[cell] === 1) return d; // hit a wall
    }
    return range;
  }

  /** Public hitbox probe — zombies a ray would hit, nearest-first with headshot
   *  flags. Used by tests/tooling; mirrors what firing resolves against. */
  rayProbe(o, dir, range) { return this.#rayZombies(o, dir, range); }

  // --- melee ---------------------------------------------------------------
  #tickMelee(dt) {
    if (this.#meleeCd > 0) this.#meleeCd = Math.max(0, this.#meleeCd - dt);
    if (this.#meleeTimer <= 0 && this.#meleeCd <= 0 && this.#actions.pressed(Action.MELEE)) {
      this.#meleeTimer = MELEE_TIME;
      this.#meleeHit = false;
      // lock onto a target up front and make it harmless for the whole swing,
      // so the zombie you're knifing can't trade a hit and one-shot you
      _dir.set(0, 0, -1).applyQuaternion(this.#camera.quaternion).normalize();
      const hits = this.#rayZombies(this.#camera.position, _dir, MELEE_RANGE);
      this.#meleeTarget = hits.length ? hits[0] : null;
      if (this.#meleeTarget) {
        const z = this.world.get(this.#meleeTarget.id, ZombieTag);
        if (z) { z.harmlessUntil = this.#time.elapsed + MELEE_TIME; z.swipe = 0; z.swung = true; }
      }
    }
    if (this.#meleeTimer <= 0) return false;
    const elapsed = MELEE_TIME - this.#meleeTimer;
    this.#meleeTimer -= dt;
    if (!this.#meleeHit && elapsed >= MELEE_HIT_AT) {
      this.#meleeHit = true;
      const target = this.#meleeTarget;
      if (target && this.world.get(target.id, ZombieTag)) {
        _dir.set(0, 0, -1).applyQuaternion(this.#camera.quaternion).normalize();
        const killed = damageZombie(this.#ctx, target.id, ZombieConfig.baseHealth, { award: false, headshot: target.headshot, dir: _dir });
        const pu = this.world.services.has(Service.Powerups) ? this.world.services.get(Service.Powerups) : null;
        const mul = pu ? pu.pointsMultiplier() : 1;
        this.#ctx.player.points += (killed ? 130 : 10) * mul; // knife kills are worth more
        this.#events.emit('score:changed', { points: this.#ctx.player.points });
        this.#events.emit('weapon:hit', { killed });
        if (this.#fx) { _end.copy(this.#camera.position).addScaledVector(_dir, 1.4); this.#fx.spawnBlood(_end, _dir); }
      }
    }
    if (this.#meleeTimer <= 0) { this.#meleeTimer = 0; this.#meleeTarget = null; this.#meleeCd = 0.25; }
    return true;
  }

  /** Nearest ray-sphere intersection distance, or -1 if behind/none. */
  #raySphere(o, dir, cx, cy, cz, r) {
    const ocx = cx - o.x, ocy = cy - o.y, ocz = cz - o.z;
    const b = ocx * dir.x + ocy * dir.y + ocz * dir.z;
    const c = ocx * ocx + ocy * ocy + ocz * ocz - r * r;
    const disc = b * b - c;
    if (disc < 0) return -1;
    const s = Math.sqrt(disc);
    const t0 = b - s;
    if (t0 >= 0) return t0;
    const t1 = b + s;
    return t1 >= 0 ? t1 : -1;
  }

  /**
   * Zombie hits along a ray, nearest-first, each zombie once (penetration).
   * FORM-ACCURATE: the body is a set of capsules along the actual ANIMATED rig
   * bones — head, chest, waist, and upper+lower arm / thigh+shin per limb — read
   * live each shot, so the hitboxes track the pose (and the crawl) and a
   * dismembered limb has none. A cheap bounding-sphere broad-phase skips zombies
   * the ray can't reach before any matrix work. Returns { id, tca, headshot, part }.
   */
  #rayZombies(o, dir, range) {
    const out = [];
    const ox = o.x, oy = o.y, oz = o.z, dx = dir.x, dy = dir.y, dz = dir.z;
    for (const id of this.world.query(ZombieTag, Transform)) {
      const t = this.world.get(id, Transform);
      const x = t.position.x, py = t.position.y, pz = t.position.z;
      // broad phase: a single bounding sphere around the whole body
      if (this.#raySphere(o, dir, x, py + 0.9, pz, 1.3) < 0) continue;

      const z = this.world.get(id, ZombieTag);
      const rig = this.world.get(id, Renderable)?.object3d;
      const J = rig?.userData?.joints;
      let best = Infinity, head = false, part = 'chest';

      if (J) {
        // pose the rig at the zombie's authoritative transform so the bone
        // capsules sit exactly where the body is this tick (render re-syncs it)
        rig.position.copy(t.position);
        rig.quaternion.copy(t.quaternion);
        rig.updateMatrixWorld(true);

        const seg = (pax, pay, paz, pbx, pby, pbz, r, partName, isHead) => {
          const tt = this.#raySegment(ox, oy, oz, dx, dy, dz, range, pax, pay, paz, pbx, pby, pbz, r);
          if (tt >= 0 && tt < best) { best = tt; part = partName; head = isHead; }
        };
        const bone = (jA, jB, r, partName) => {
          if (!jA || !jB) return;
          jA.getWorldPosition(_ja); jB.getWorldPosition(_jb);
          seg(_ja.x, _ja.y, _ja.z, _jb.x, _jb.y, _jb.z, r, partName, false);
        };

        // head: neck base -> skull top (dedicated, so headshots need the head)
        _ja.set(0, 0.04, 0); J.head.localToWorld(_ja);
        _jb.set(0, 0.30, 0); J.head.localToWorld(_jb);
        seg(_ja.x, _ja.y, _ja.z, _jb.x, _jb.y, _jb.z, 0.13, 'head', true);
        // chest: waist -> NECK BASE (stops below the head so its cap can't steal
        // a headshot), then waist -> hips
        _ja.set(0, -0.1, 0); J.head.localToWorld(_ja); // neck base
        J.torso.getWorldPosition(_jb);                 // waist
        seg(_jb.x, _jb.y, _jb.z, _ja.x, _ja.y, _ja.z, 0.18, 'chest', false);
        bone(J.hips, J.torso, 0.17, 'pelvis');
        // arms + legs, only the sections still attached
        if (z.limbs?.armL) { bone(J.shoulderL, J.elbowL, 0.085, 'armL'); bone(J.elbowL, J.handL, 0.075, 'armL'); }
        if (z.limbs?.armR) { bone(J.shoulderR, J.elbowR, 0.085, 'armR'); bone(J.elbowR, J.handR, 0.075, 'armR'); }
        if (z.limbs?.legL) { bone(J.thighL, J.kneeL, 0.105, 'legL'); bone(J.kneeL, J.footL, 0.095, 'legL'); }
        if (z.limbs?.legR) { bone(J.thighR, J.kneeR, 0.105, 'legR'); bone(J.kneeR, J.footR, 0.095, 'legR'); }
      } else {
        // no rig (shouldn't happen): coarse head + body spheres
        const th = this.#raySphere(o, dir, x, py + 1.62, pz, 0.24);
        if (th >= 0 && th < best) { best = th; head = true; part = 'head'; }
        const tb = this.#raySphere(o, dir, x, py + 1.0, pz, 0.36);
        if (tb >= 0 && tb < best) { best = tb; head = false; part = 'chest'; }
      }

      if (best !== Infinity && best <= range) out.push({ id, tca: best, headshot: head, part });
    }
    out.sort((a, b) => a.tca - b.tca);
    return out;
  }

  /** Ray (o + s*dir, s in [0,range]) vs a capsule of radius r around segment
   *  A-B. Returns the ray distance at closest approach if it grazes the capsule,
   *  else -1. Closest-points-between-two-segments (ray clamped to its length). */
  #raySegment(ox, oy, oz, dx, dy, dz, range, ax, ay, az, bx, by, bz, r) {
    const d1x = dx * range, d1y = dy * range, d1z = dz * range; // ray as a segment
    const d2x = bx - ax, d2y = by - ay, d2z = bz - az;          // bone segment
    const rx = ox - ax, ry = oy - ay, rz = oz - az;
    const a = d1x * d1x + d1y * d1y + d1z * d1z;
    const e = d2x * d2x + d2y * d2y + d2z * d2z;
    const f = d2x * rx + d2y * ry + d2z * rz;
    const cc = d1x * rx + d1y * ry + d1z * rz;
    const EPS = 1e-9;
    let s, tt;
    if (a <= EPS) { s = 0; tt = e <= EPS ? 0 : clamp01(f / e); }
    else if (e <= EPS) { tt = 0; s = clamp01(-cc / a); }
    else {
      const bb = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - bb * bb;
      s = denom > EPS ? clamp01((bb * f - cc * e) / denom) : 0;
      tt = (bb * s + f) / e;
      if (tt < 0) { tt = 0; s = clamp01(-cc / a); }
      else if (tt > 1) { tt = 1; s = clamp01((bb - cc) / a); }
    }
    const px = (ox + d1x * s) - (ax + d2x * tt);
    const py = (oy + d1y * s) - (ay + d2y * tt);
    const pz = (oz + d1z * s) - (az + d2z * tt);
    if (px * px + py * py + pz * pz > r * r) return -1;
    return s * range; // distance along the ray to closest approach
  }

  // --- inventory / economy API -------------------------------------------

  /** True if the player already carries this weapon key. */
  owns(key) { return this.#keys.includes(key); }

  /** The key of the currently held weapon (for the Pack-a-Punch). */
  currentKey() { return this.#keys[this.#index]; }

  /** Pack-a-Punch removed the current weapon from the player's hands and into the
   *  machine: take it OUT of the inventory and switch to the secondary (or leave
   *  the player empty-handed). Returns the removed { weapon, key } to hand back. */
  extractForPaP() {
    if (this.#weapons.length === 0) return null;
    const idx = this.#index;
    const weapon = this.#weapons[idx];
    const key = this.#keys[idx];
    this.#weapons.splice(idx, 1);
    this.#keys.splice(idx, 1);
    if (this.#weapons.length === 0) {
      this.#index = 0; // empty-handed: this.current is now undefined (no model shown)
      this.#viewmodel.setWeapon(null);
      this.#announce();
    } else {
      this.#index = Math.min(idx, this.#weapons.length - 1);
      this.current.aiming = false;
      this.#viewmodel.setWeapon(this.current);
      this.#announce();
    }
    return { weapon, key };
  }

  /** Mutate a (extracted) weapon instance into its Pack-a-Punched form: double
   *  damage, bigger reserve, crimson->pink tint, and — for ~25% of guns — a
   *  fire-mode or dual-wield change. */
  applyPaP(weapon, key) {
    const d = weapon.data;
    if (d.pap) return;
    d.pap = true;
    d.name = PAP_NAMES[key] || d.name; // flashy PaP rename
    d.papTint = { muzzle: 0x9a0b2e, tracer: 0xff5fc4 };
    d.damage *= 2;
    d.ammoStockSize = Math.round(d.ammoStockSize * 1.6);
    const special = PAP_SPECIAL[key];
    if (special === 'dual') { d.dualWield = true; d.magazineSize *= 2; }
    else if (special === 'auto') d.fireMode = 'auto';
    else if (special === 'burst') { d.fireMode = 'burst'; d.burstCount = key === 'an94' ? 2 : 3; }
    weapon.reserve = d.infiniteReserve ? Infinity : d.ammoStockSize;
    weapon.magazine = d.magazineSize;
  }

  /** Hand a weapon instance back to the player (grabbed from the machine) and
   *  equip it. */
  restoreFromPaP(weapon, key) {
    const cap = this.#perks ? this.#perks.inventoryCap() : EconomyConfig.inventoryCap;
    if (this.#weapons.length < cap) {
      this.#weapons.push(weapon); this.#keys.push(key);
      this.#equip(this.#weapons.length - 1, this.#playerId !== undefined ? this.world.get(this.#playerId, PlayerTag) : null);
    } else {
      this.#weapons[this.#index] = weapon; this.#keys[this.#index] = key;
      this.#viewmodel.setWeapon(this.current); this.#announce();
    }
  }

  /**
   * Grant a weapon (wall-buy / mystery box). If already owned, tops up ammo;
   * otherwise adds it (or swaps the current slot when the inventory is full).
   * @returns {'refilled'|'added'|'swapped'}
   */
  giveWeapon(key) {
    const player = this.#playerId !== undefined ? this.world.get(this.#playerId, PlayerTag) : null;
    const existing = this.#keys.indexOf(key);
    if (existing >= 0) {
      this.#weapons[existing].refill();
      this.#equip(existing, player);
      this.#emitAmmo(this.current);
      return 'refilled';
    }
    if (this.#weapons.length < (this.#perks ? this.#perks.inventoryCap() : EconomyConfig.inventoryCap)) {
      this.#weapons.push(makeWeapon(key));
      this.#keys.push(key);
      this.#equip(this.#weapons.length - 1, player);
      return 'added';
    }
    // full: replace the currently held slot
    this.#weapons[this.#index] = makeWeapon(key);
    this.#keys[this.#index] = key;
    this.#viewmodel.setWeapon(this.current);
    this.#announce();
    return 'swapped';
  }

  #fireCone(weapon) {
    this.#basis();
    const o = this.#camera.position;
    const cos = Math.cos(weapon.data.coneAngle);
    let kill = false;
    for (const id of [...this.world.query(ZombieTag, Transform)]) {
      const t = this.world.get(id, Transform);
      _oc.set(t.position.x - o.x, 0, t.position.z - o.z);
      const dist = _oc.length();
      if (dist > weapon.data.range || dist < 0.001) continue;
      _oc.divideScalar(dist);
      const facing = _oc.x * _fwd.x + _oc.z * _fwd.z;
      if (facing < cos) continue;
      const dMul = this.#perks ? this.#perks.damageMul(weapon.data.category) : 1;
      if (damageZombie(this.#ctx, id, weapon.data.damage * dMul, { dir: { x: _fwd.x, z: _fwd.z }, flinchScale: flinchScaleFor(weapon.data.fireMode) })) kill = true;
    }
    this.#events.emit('weapon:hit', { killed: kill });
  }

  // --- projectiles --------------------------------------------------------

  #spawnProjectile(weapon) {
    this.#basis();
    const energy = weapon.data.muzzleEffect === 'energy';
    const ecol = weapon.data.energyColor ?? 0x46f060;
    const mesh = energy ? makeEnergyBolt(ecol) : makeRocket();

    const pos = new THREE.Vector3().copy(this.#camera.position).addScaledVector(_fwd, 0.6);
    const id = this.world.createEntity();
    const tr = new Transform(pos);
    tr.quaternion.copy(this.#camera.quaternion);
    this.world.add(id, tr);
    this.world.add(id, new Renderable(mesh, { interpolate: true }));
    this.world.add(id, new ProjectileTag({
      velocity: new THREE.Vector3().copy(_fwd).multiplyScalar(weapon.data.projectileSpeed),
      damage: weapon.data.damage,
      splashRadius: weapon.data.splashRadius,
      splashDamage: weapon.data.splashDamage,
      kind: energy ? 'energy' : 'rocket',
      color: ecol,
    }));
  }

  // --- helpers ------------------------------------------------------------

  #addRecoil(pitch, yaw) {
    const player = this.world.get(this.#playerId, PlayerTag);
    if (!player) return;
    const r = this.#perks ? this.#perks.recoilMul() : 1;
    player.recoilPitch += pitch * r;
    player.recoilYaw += yaw * r;
  }

  #emitAmmo(w) {
    this.#events.emit('weapon:ammo', { mag: w.magazine, reserve: w.reserve === Infinity ? '∞' : w.reserve, reloading: w.reloading });
  }
}
