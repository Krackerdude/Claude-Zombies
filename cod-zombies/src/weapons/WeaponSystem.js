import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Transform, Renderable, PlayerTag, ZombieTag, ProjectileTag } from '../ecs/components/index.js';
import { Service } from '../core/ServiceLocator.js';
import { Action } from '../config/keybinds.js';
import { MoveState } from '../player/MoveState.js';
import { ZombieConfig, EconomyConfig } from '../config/zombies.js';
import { makeWeapon } from './catalog.js';
import { Viewmodel } from './Viewmodel.js';
import { WeaponFx } from './WeaponFx.js';
import { damageZombie } from './damage.js';

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
const _nrm = new THREE.Vector3();
const _col = new THREE.Color();
const _explo = new THREE.Vector3();

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

// body hitbox spheres relative to the zombie's feet: [centreY, radius]
// (the head is a separate, dedicated sphere handled in #rayZombies)
const HITBOXES = [[1.15, 0.34], [0.7, 0.34], [0.32, 0.26]];

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
    this.#events.on('gadget:cook', ({ active }) => { this.#cooking = active; });
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
    const busy = meleeing || this.#cooking || this.#swapT > 0 || (pk && (pk.drinking || pk.downed)); // gun stowed / out of action

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
      cook: this.#cooking ? { t: this.#cookT } : null,
      drink: this.#drinkActive ? { t: this.#drinkT, color: this.#drinkColor } : null,
      swayMul: pk ? pk.swayMul() : 1,
      swapDown: this.#swapDown(),
      damage: this.#dmgT > 0 ? { t: 1 - this.#dmgT / 0.25, side: this.#dmgSide } : null,
      shade: this.#sampleShade(dt),
      visible: playing && !w.scoped, // hide model behind the scope overlay
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

    // world-space muzzle (gun barrel tip) for tracers + shell ejection
    _muz.copy(o).addScaledVector(_fwd, 0.5).addScaledVector(_right, 0.12).addScaledVector(_up, -0.08);
    if (this.#fx) this.#fx.spawnMuzzle(_muz, _fwd, _right, _up);

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
      for (const { id, tca, headshot } of hits) {
        anyHit = true;
        const falloff = Math.pow(0.5, pen); // -50% damage per zombie already pierced
        const pk = this.#perks;
        const hsMul = headshot ? weapon.data.headshotMultiplier * (pk ? pk.headshotMul() : 1) : 1;
        const dMul = pk ? pk.damageMul(weapon.data.category) : 1;
        const dmg = weapon.data.damage * hsMul * dMul * falloff;
        if (damageZombie(this.#ctx, id, dmg, { headshot, dir: _dir })) anyKill = true;
        pen++;
      }

      // --- impact FX for this bullet ---
      if (this.#fx) {
        const ztca = hits.length ? hits[0].tca : Infinity; // nearest zombie along ray
        if (isFinite(ztca) && ztca <= wallDist) {
          _end.copy(o).addScaledVector(_dir, ztca);
          this.#fx.spawnBlood(_end, _dir);               // zombie: blood, no smoke/holes
        } else if (wallDist < weapon.data.range) {
          this.#surfaceImpact(o, _dir, wallDist);          // wall/prop: smoke + debris + hole
        } else {
          _end.copy(o).addScaledVector(_dir, weapon.data.range);
        }
        this.#fx.spawnTracer(_muz, _end);
      }
    }
    if (anyHit) this.#events.emit('weapon:hit', { killed: anyKill });
  }

  /** Raycast the world to get a precise surface point/normal/colour, then spawn
   *  the material-aware impact there. Falls back to the nav march distance. */
  #surfaceImpact(o, dir, wallDist) {
    this.#fxRay.set(o, dir);
    this.#fxRay.far = wallDist + 0.6;
    const hits = this.#fxRay.intersectObjects(this.#sceneMgr.scene.children, true);
    let pick = null;
    for (const h of hits) {
      if (!h.face || h.distance < 0.5) continue;     // clear the player capsule
      if (this.#fxIgnored(h.object)) continue;        // never put holes on zombies/corpses
      pick = h; break;
    }
    if (pick) {
      _end.copy(pick.point);
      _nrm.copy(pick.face.normal).transformDirection(pick.object.matrixWorld).normalize();
      if (_nrm.dot(dir) > 0) _nrm.multiplyScalar(-1);
      const mc = pick.object.material && pick.object.material.color;
      _col.copy(mc || _col.setHex(0x9a9a9a));
      this.#fx.spawnImpact(_end, _nrm, _col);
    }
    // if the only thing in the way was a zombie/dynamic prop, no surface impact
  }

  #fxIgnored(obj) {
    for (let o = obj; o; o = o.parent) if (o.userData && o.userData.noBulletFx) return true;
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
   * Zombie hits along a ray, nearest-first, each zombie once (penetration). Each
   * zombie is approximated by a stack of spheres — a dedicated HEAD sphere plus
   * chest / pelvis / legs — so headshots require actually hitting the head.
   * Returns { id, tca, headshot }.
   */
  #rayZombies(o, dir, range) {
    const out = [];
    for (const id of this.world.query(ZombieTag, Transform)) {
      const t = this.world.get(id, Transform);
      const x = t.position.x, y = t.position.y, z = t.position.z;
      let best = Infinity, head = false;

      const th = this.#raySphere(o, dir, x, y + 1.62, z, 0.24); // head
      if (th >= 0 && th < best) { best = th; head = true; }
      // body: chest, pelvis, shins
      for (const [cy, cr] of HITBOXES) {
        const tb = this.#raySphere(o, dir, x, y + cy, z, cr);
        if (tb >= 0 && tb < best) { best = tb; head = false; }
      }
      if (best !== Infinity && best <= range) out.push({ id, tca: best, headshot: head });
    }
    out.sort((a, b) => a.tca - b.tca);
    return out;
  }

  // --- inventory / economy API -------------------------------------------

  /** True if the player already carries this weapon key. */
  owns(key) { return this.#keys.includes(key); }

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
      if (damageZombie(this.#ctx, id, weapon.data.damage * dMul, { dir: { x: _fwd.x, z: _fwd.z } })) kill = true;
    }
    this.#events.emit('weapon:hit', { killed: kill });
  }

  // --- projectiles --------------------------------------------------------

  #spawnProjectile(weapon) {
    this.#basis();
    const energy = weapon.data.muzzleEffect === 'energy';
    const mesh = energy
      ? new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 10, 10),
          new THREE.MeshStandardMaterial({ color: 0x0a3a33, emissive: 0x46f2cf, emissiveIntensity: 3 }),
        )
      : makeRocket();

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
