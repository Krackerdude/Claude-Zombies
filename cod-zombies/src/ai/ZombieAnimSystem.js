import { System } from '../ecs/System.js';
import { ZombieTag, Renderable, PlayerTag, Transform } from '../ecs/components/index.js';
import { Service } from '../core/ServiceLocator.js';
import { ZombieConfig } from '../config/zombies.js';

// Animation budgeting — distant zombies recompute their (trig-heavy) skeletal
// pose at a lower cadence, holding the last pose between updates. Pure CPU: it
// only skips POSE MATH, never rendering and never the shadow pass, so unlike
// frustum culling it can't cause frame-time spikes. Gait SPEED is unchanged —
// the skipped dt is banked and applied on the next real pose, so a body never
// slow-mos, it's just sampled coarser. Bands start well out (a 144Hz display can
// catch a stutter, so keep them generous) and anything the player would notice a
// hitch on — a swing, teardown, knockdown, alt-ammo death, fresh hit-flinch —
// always runs full rate regardless of distance.
const ANIM_MID2 = 18 * 18;   // beyond this: pose every 2nd frame
const ANIM_FAR2 = 30 * 30;   // beyond this: pose every 3rd frame

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (cur, target, dt, rate) => cur + (target - cur) * Math.min(1, dt * rate);

/**
 * Drives the three zombie gaits + the committed swipe, all procedurally.
 *   - shamble: arms hanging at the sides, short dragging strides with a limp
 *     (one leg stiff/short, hips hitching) — the slow early-round tone
 *   - walk:    arms raised, longer strides, a touch quicker
 *   - run:     the aggressive reach-forward sprint (fastest)
 *   - swipe:   a rooted raise-then-chop synced to the zombie's swing timer
 *   - teardown: fast alternating claws at a window
 * Gait is fixed per zombie (no inter-gait blending); walk/attack/tear weights
 * still ease for smooth state changes. Visual only — runs in update().
 */
const GAITS = {
  shamble: { stride: 0.30, knee: 0.50, lurch: 0.05, lean: 0.05, armReach: -0.20, armSplay: 0.1, armDrift: 0.06, headLoll: 0.12, rate: 0.95, limp: true },
  walk: { stride: 0.55, knee: 0.80, lurch: 0.10, lean: 0.06, armReach: -1.50, armSplay: 0.10, armDrift: 0.10, headLoll: 0.04, rate: 1.0, limp: false },
  run: { stride: 0.70, knee: 0.95, lurch: 0.16, lean: 0.08, armReach: -1.15, armSplay: 0.12, armDrift: 0.12, headLoll: 0.0, rate: 1.15, limp: false },
};

// --- per-zombie animation variants ------------------------------------------
// Four subtle "personalities" per gait, layered on top of the base pose so a
// horde reads as many different bodies rather than one cloned shuffle. Think
// mocap takes from different actors: small, plausible offsets to posture, limb
// carriage, cadence and weight — NEVER anything that changes the silhouette
// enough to misread in combat, and NEVER anything that touches movement speed
// or mechanics. Every field is a small delta/multiplier over the gait baseline:
//   armL/armR  additive shoulder pitch per arm (asymmetric carriage/drag)
//   splay      extra outward shoulder spread (both arms)
//   headX/headZ additive head pitch (nod) / roll (loll)
//   torsoX     additive forward hunch ; torsoZ constant side-lean (weight)
//   rate       cadence multiplier (visual only) ; stride swing-length multiplier
//   sway       secondary idle-sway amplitude multiplier
//   hipTilt    constant pelvis side-tilt (weight on one leg)
//   hipSway    hip counter-rotation amplitude multiplier
//   legL/legR  per-leg stride multiplier (a subtle drag on one side)
const V_BASE = { armL: 0, armR: 0, splay: 0, headX: 0, headZ: 0, torsoX: 0, torsoZ: 0, rate: 1, stride: 1, sway: 1, hipTilt: 0, hipSway: 1, legL: 1, legR: 1 };
const mkV = (list) => list.map((v) => ({ ...V_BASE, ...v }));
const VARIANTS = {
  // slow, hunched, dragging — already limps; variants shift which side/posture
  shamble: mkV([
    { armR: -0.22, headX: 0.08, torsoX: 0.05, hipTilt: 0.025, legR: 0.85, stride: 0.95, rate: 0.95 }, // right arm hangs, head bowed, right leg drags
    { armL: -0.40, armR: -0.05, headX: -0.04, sway: 1.25, stride: 1.05 },                              // left arm reaching out ahead
    { armL: -0.12, armR: -0.18, headZ: 0.10, torsoZ: 0.06, hipTilt: 0.03, rate: 0.9, stride: 0.9 },    // listing to one side, head lolled
    { armL: 0.10, armR: 0.10, headX: -0.03, headZ: -0.05, torsoX: -0.03, sway: 0.7, rate: 1.05 },      // stiff, arms close, little sway
  ]),
  // arms raised, longer strides
  walk: mkV([
    { headX: 0.05, torsoX: 0.02, stride: 1.0 },                                                        // classic forward reach
    { armL: -0.22, armR: 0.34, torsoZ: 0.035, hipTilt: 0.02, stride: 1.05 },                           // one arm high, the other lowered
    { armL: 0.16, armR: 0.16, headX: 0.10, torsoX: 0.07, rate: 0.95, stride: 0.9 },                    // hunched, head down, arms lower
    { headZ: 0.10, torsoZ: -0.04, sway: 1.4, hipSway: 1.3, rate: 1.05, stride: 1.1 },                  // loose lurcher, big sway
  ]),
  // aggressive sprint
  run: mkV([
    { torsoX: 0.05, armL: -0.15, armR: -0.15, stride: 1.05, rate: 1.05 },                              // committed lunge
    { armL: -0.20, armR: 0.20, hipTilt: 0.02, legL: 1.05, stride: 1.1 },                               // asymmetric pumping
    { torsoX: 0.09, headX: 0.06, splay: 0.06, hipSway: 1.2 },                                          // low charging hunch, arms wide
    { torsoX: -0.02, armL: 0.10, armR: 0.10, sway: 0.8, rate: 1.1, stride: 0.95 },                     // stiff upright, quick cadence
  ]),
};

export class ZombieAnimSystem extends System {
  #gameState;
  #frame = 0;

  init() {
    this.#gameState = this.world.services.get(Service.GameState);
  }

  update(dt) {
    if (!this.#gameState.isPlaying) return;
    this.#frame++;
    const pid = this.world.first(PlayerTag, Transform);
    const ppos = pid !== undefined ? this.world.get(pid, Transform).position : null;

    for (const id of this.world.query(ZombieTag, Renderable)) {
      const z = this.world.get(id, ZombieTag);
      const rig = this.world.get(id, Renderable).object3d;
      const J = rig.userData?.joints;
      if (!J) continue;
      const rest = rig.userData.rest;
      // hellhounds are quadrupeds with their own gallop/lunge rig — always full rate
      if (z.hound) { this.#poseHound(z, rig, rest, J, dt); continue; }
      // alternate-ammo states (humanoid zombies only)
      if (z.frozen > 0) continue;                                  // encased in ice: hold the pose

      // --- animation budgeting: throttle only distant, non-urgent locomotion ---
      const urgent = z.aatDying || z.rifting > 0 || z.melting || z.meltingLegs ||
        z.state === 'knocked' || z.swipe > 0 || z.state === 'teardown' ||
        z.flinch > 0 || z.acidSlow > 0;
      let dtEff = dt;
      if (!urgent && ppos) {
        const t = this.world.get(id, Transform)?.position ?? rig.position;
        const dx = t.x - ppos.x, dz = t.z - ppos.z, d2 = dx * dx + dz * dz;
        const stride = d2 > ANIM_FAR2 ? 3 : d2 > ANIM_MID2 ? 2 : 1;
        if (stride > 1) {
          if (z.animPhase === undefined) z.animPhase = (id * 7) & 7; // stagger the bands
          z.animAccum = (z.animAccum || 0) + dt;                      // bank this frame's dt
          if ((this.#frame + z.animPhase) % stride !== 0) continue;   // hold last pose
          dtEff = z.animAccum; z.animAccum = 0;                       // apply all elapsed since last pose
        }
      }
      // flush any banked dt (e.g. a zombie that just came into close range) so its
      // gait resumes at the right speed, never in slow motion
      if (z.animAccum) { dtEff = dt + z.animAccum; z.animAccum = 0; }

      if (z.aatDying) { this.#poseDisintegrate(z, rig, rest, J); continue; } // ash / melt-away
      if (z.rifting > 0) { this.#poseRiftRise(z, rest, J); continue; }       // dragged up into the rift
      // acid bomb dissolves — these override the normal gait entirely
      if (z.melting) { this.#poseMelt(z, rig, rest, J, dtEff); continue; }
      if (z.meltingLegs) { this.#poseLegMelt(z, rig, rest, J, dtEff); continue; }
      if (z.crawler) { this.#poseCrawl(z, rest, J, dtEff); }
      else if (z.state === 'knocked') { this.#poseKnock(z, rest, J); }
      else { this.#poseOne(z, rest, J, dtEff); }
      if (z.acidSlow > 0) this.#acidWrithe(z, J); // layered pain shudder while in the acid
    }
  }

  /** Explosion knockdown: slam onto the back, writhe, sit up onto hands & knees,
   *  then climb back to the feet — all from the hip pivot so it never fights the
   *  Transform sync that owns the rig's world position/facing. */
  #poseKnock(z, rest, J) {
    const k = z.knockTotal > 0 ? 1 - z.knockTime / z.knockTotal : 1; // 0..1 progress
    const seg = (a, b) => Math.min(1, Math.max(0, (k - a) / (b - a)));
    const sm = (t) => t * t * (3 - 2 * t);
    const fall = sm(seg(0.0, 0.13));      // slammed flat
    const recover = sm(seg(0.5, 0.8));    // sit up / roll onto hands & knees
    const stand = sm(seg(0.82, 1.0));     // rise to the feet
    const writhe = Math.sin(z.knockTime * 7) * 0.06 * fall * (1 - recover);

    // whole-body pitch: upright -> flat on the back -> over onto the front -> up
    let pitch = lerp(0, -1.5, fall);
    pitch = lerp(pitch, 1.1, recover);
    pitch = lerp(pitch, 0, stand);
    let hipY = lerp(rest.hipY, 0.32, fall);
    hipY = lerp(hipY, 0.5, recover);
    hipY = lerp(hipY, rest.hipY, stand);
    J.hips.position.y = hipY;
    J.hips.rotation.set(pitch, 0, writhe);

    J.torso.rotation.x = rest.torso + 0.25 * fall * (1 - recover) - 0.3 * recover;
    J.torso.rotation.z = writhe * 0.5;
    J.head.rotation.x = 0.35 * fall * (1 - stand) - 0.2 * recover;
    J.head.rotation.z = writhe;

    const legUp = fall * (1 - recover);
    J.thighL.rotation.set(lerp(0, 0.7, legUp) - 0.5 * recover, 0, 0);
    J.thighR.rotation.set(lerp(0, 0.5, legUp) - 0.4 * recover, 0, 0);
    J.kneeL.rotation.x = lerp(0, 1.0, legUp) + 0.6 * recover;
    J.kneeR.rotation.x = lerp(0, 0.8, legUp) + 0.6 * recover;

    const armOut = fall * (1 - recover);
    J.shoulderL.rotation.set(lerp(rest.shoulder, -0.3, fall), 0, lerp(rest.shoulderZ, 1.0, armOut));
    J.shoulderR.rotation.set(lerp(rest.shoulder, -0.3, fall), 0, lerp(-rest.shoulderZ, -1.0, armOut));
    J.elbowL.rotation.x = rest.elbow + 0.5 * recover;
    J.elbowR.rotation.x = rest.elbow + 0.5 * recover;
  }

  /** Crawler: legs gone, the zombie has fallen prone and drags itself along the
   *  floor with its arms (alternating reach-forward / pull-back), head raised to
   *  track the player, with a reach-up slash for its attack. `crawlAmt` eases the
   *  fall-to-the-floor from the moment it loses a leg. */
  #poseCrawl(z, rest, J, dt) {
    z.crawlAmt = ease(z.crawlAmt, 1, dt, 4); // settle into the prop over ~0.5s
    const c = z.crawlAmt;
    const walking = z.state === 'pathing' || z.state === 'spawning';
    const swiping = z.swipe > 0;
    z.atkAmt = ease(z.atkAmt, swiping ? 1 : 0, dt, 14);
    z.walkAmt = ease(z.walkAmt, walking ? 1 : 0, dt, 6);
    z.animTime += dt * (4.5 + z.speed * 2) * z.walkAmt;
    const p = z.animTime;
    const cyc = Math.sin(p);

    // BO3 sphinx prop: waist low on the floor, the whole upper body RAISED on
    // the arms and leaning toward the player, head up scanning. Reads tall above
    // the corpses instead of collapsing face-down.
    J.hips.position.set(0, lerp(rest.hipY, 0.34, c), 0);
    J.hips.rotation.set(lerp(0, 0.5, c), cyc * 0.05 * c * z.walkAmt, 0);     // lean forward, slight sway
    J.torso.rotation.set(rest.torso - 0.12 * c, 0, cyc * 0.05 * z.walkAmt);  // arch the chest up
    J.head.rotation.set(lerp(0.06, -0.6, c), 0, 0);                          // head up, eyes forward

    // arms straight, planting the hands on the ground forward to PROP the chest
    // up; they reach forward and pull back to drag the body along
    const planted = lerp(rest.shoulder, 0.3, c);                  // -> ~straight down to the floor (world)
    const reachL = planted - Math.max(0, cyc) * 0.55 * z.walkAmt; // reach forward then pull
    const reachR = planted - Math.max(0, -cyc) * 0.55 * z.walkAmt;
    const swProg = swiping ? 1 - z.swipe / ZombieConfig.swipeTime : 0;
    const swUp = Math.min(1, swProg / 0.4), swDown = Math.max(0, swProg - 0.4) / 0.6;
    const atkSh = lerp(-2.4, 0.2, swDown);                        // rear an arm up, then swipe down
    // plant the hands forward and a touch out to prop the chest like a sphinx.
    // NOTE the signs: outward splay is L negative / R positive (same convention
    // as the standing gait). Keep the splay SMALL — too much swings the arms out
    // sideways and lifts the hands off the floor; we want them reaching down.
    const splay = lerp(0, 0.18, c);
    if (J.shoulderL.visible) {
      J.shoulderL.rotation.set(lerp(reachL, atkSh, z.atkAmt), 0, -splay);
      J.elbowL.rotation.x = lerp(rest.elbow, 0.15, c) + z.atkAmt * swUp * 0.5; // arm extended to prop
    }
    if (J.shoulderR.visible) {
      J.shoulderR.rotation.set(lerp(reachR, atkSh, z.atkAmt), 0, splay);
      J.elbowR.rotation.x = lerp(rest.elbow, 0.15, c) + z.atkAmt * swUp * 0.5;
    }

    // a remaining leg (rare now) trails limp behind; severed ones are skipped
    if (J.thighL.visible) { J.thighL.rotation.set(lerp(0, 0.3, c), 0, 0.15 * c); J.kneeL.rotation.x = lerp(0, 0.7, c); }
    if (J.thighR.visible) { J.thighR.rotation.set(lerp(0, 0.3, c), 0, -0.15 * c); J.kneeR.rotation.x = lerp(0, 0.7, c); }

    this.#flinch(z, J, dt);
  }

  /** A pained convulsion layered over the normal gait while a zombie stands in
   *  acid — it hunches, jerks, throws its head back and claws at the air. */
  #acidWrithe(z, J) {
    const t = z.animTime;
    const sh = Math.sin(t * 24);
    J.torso.rotation.x += 0.1 + sh * 0.08;
    J.torso.rotation.z += Math.cos(t * 19) * 0.12;
    J.head.rotation.x -= 0.18 + sh * 0.12;
    J.head.rotation.z += Math.sin(t * 17) * 0.15;
    if (J.shoulderL.visible) J.shoulderL.rotation.x -= 0.6 + sh * 0.4;
    if (J.shoulderR.visible) J.shoulderR.rotation.x -= 0.6 - sh * 0.4;
  }

  /** Legs dissolving: the zombie buckles in place, its thighs shrinking to
   *  nothing as it drops, upper body convulsing — then it becomes a crawler with
   *  the legs melted clean away (no gore, no gibs). */
  #poseLegMelt(z, rig, rest, J, dt) {
    z.legMelt = Math.min(1, z.legMelt + dt * 1.6);
    const lm = z.legMelt;
    const t = (z.animTime += dt * 9); // fast pain writhe
    J.hips.position.set(0, lerp(rest.hipY, 0.32, lm), 0);
    J.hips.rotation.set(lerp(0, 0.45, lm), Math.sin(t) * 0.05, 0);
    const s = Math.max(0.001, 1 - lm);
    if (J.thighL) { J.thighL.scale.setScalar(s); J.thighL.rotation.set(0.2, 0, 0.12); }
    if (J.thighR) { J.thighR.scale.setScalar(s); J.thighR.rotation.set(0.2, 0, -0.12); }
    J.torso.rotation.set(rest.torso + 0.3 * lm + Math.sin(t) * 0.1, 0, Math.cos(t * 1.3) * 0.12);
    J.head.rotation.set(-0.3 + Math.sin(t * 1.2) * 0.15, Math.sin(t) * 0.2, 0);
    const claw = Math.sin(t * 1.5);
    if (J.shoulderL.visible) { J.shoulderL.rotation.set(-1.0 + claw * 0.4, 0, 0.3); J.elbowL.rotation.x = 0.6; }
    if (J.shoulderR.visible) { J.shoulderR.rotation.set(-1.0 - claw * 0.4, 0, -0.3); J.elbowR.rotation.x = 0.6; }
    if (lm >= 1) { // become a crawler, legs gone
      z.crawler = true; z.limbs.legL = false; z.limbs.legR = false; z.meltingLegs = false; z.crawlAmt = 0;
      if (J.thighL) J.thighL.visible = false;
      if (J.thighR) J.thighR.visible = false;
    }
  }

  /** The whole body melting into the acid: it squashes down and spreads as it
   *  slumps into a puddle, head and limbs sagging in. GadgetSystem reaps it once
   *  `bodyMelt` completes (the rig is near-flat by then). */
  #poseMelt(z, rig, rest, J, dt) {
    z.bodyMelt = Math.min(1, z.bodyMelt + dt * 0.7); // ~1.4s to fully dissolve
    const m = z.bodyMelt;
    const t = (z.animTime += dt * 6);
    rig.scale.set(1 + m * 0.5, Math.max(0.04, 1 - m * 0.96), 1 + m * 0.5); // squash + spread into goo
    J.hips.position.set(0, lerp(z.crawler ? 0.34 : rest.hipY, 0.08, m), 0);
    J.hips.rotation.set(lerp(0.3, 1.2, m), Math.sin(t) * 0.04 * (1 - m), 0);
    J.torso.rotation.set(lerp(rest.torso, 1.3, m), 0, Math.sin(t * 1.1) * 0.08 * (1 - m));
    J.head.rotation.set(lerp(0, 1.2, m), 0, 0);
    const droop = lerp(0.3, 1.4, m);
    if (J.shoulderL.visible) { J.shoulderL.rotation.set(droop, 0, 0.5 * m); J.elbowL.rotation.x = droop; }
    if (J.shoulderR.visible) { J.shoulderR.rotation.set(droop, 0, -0.5 * m); J.elbowR.rotation.x = droop; }
    if (J.thighL?.visible) J.thighL.rotation.set(-0.2, 0, 0.4 * m);
    if (J.thighR?.visible) J.thighR.rotation.set(-0.2, 0, -0.4 * m);
  }

  /** AAT death: the body crumbles/melts down and sinks away. Napalm ('ash')
   *  collapses fast; a Turned ally ('meltdown') slumps; a Fireworks body melts
   *  slowly across its 3s show. */
  #poseDisintegrate(z, rig, rest, J) {
    const life = z.aatDying === 'fireworks' ? 3.0 : z.aatDying === 'meltdown' ? 1.3 : 0.75;
    const m = Math.min(1, z.aatDyingT / life);
    rig.scale.set(1 + m * 0.1, Math.max(0.05, 1 - m * 0.95), 1 + m * 0.1); // squash into a pile
    J.hips.position.set(0, lerp(rest.hipY, 0.1, m), 0);
    J.hips.rotation.set(lerp(0, 0.4, m), 0, 0);
    J.torso.rotation.set(rest.torso + 0.6 * m, 0, 0);
    if (J.head.visible) J.head.rotation.set(0.5 * m, 0, 0);
    if (J.shoulderL.visible) { J.shoulderL.rotation.set(0.4 * m, 0, 0.3 * m); J.elbowL.rotation.x = 0.5 * m; }
    if (J.shoulderR.visible) { J.shoulderR.rotation.set(0.4 * m, 0, -0.3 * m); J.elbowR.rotation.x = 0.5 * m; }
    if (J.thighL.visible) J.thighL.rotation.set(0.2 * m, 0, 0.1 * m);
    if (J.thighR.visible) J.thighR.rotation.set(0.2 * m, 0, -0.1 * m);
  }

  /** Shadow Rift: arms thrown up, back arched, legs dangling as the body is
   *  dragged upward (the Transform raises Y; this just poses the limbs). */
  #poseRiftRise(z, rest, J) {
    J.hips.position.set(0, rest.hipY, 0);
    J.hips.rotation.set(-0.1, 0, 0);
    J.torso.rotation.set(rest.torso - 0.3, 0, 0);
    if (J.head.visible) J.head.rotation.set(-0.4, 0, 0);
    J.shoulderL.rotation.set(-2.6, 0, -0.3); J.elbowL.rotation.x = 0.2;
    J.shoulderR.rotation.set(-2.6, 0, 0.3); J.elbowR.rotation.x = 0.2;
    J.thighL.rotation.set(0.3, 0, 0.1); J.kneeL.rotation.x = 0.3;
    J.thighR.rotation.set(0.3, 0, -0.1); J.kneeR.rotation.x = 0.3;
  }

  /** Hellhound: a fast four-legged bounding gallop, body low and pitching with
   *  the bound, head down scanning, tail + mane of fire flickering. The attack
   *  rears back then pounces forward with the jaws snapping open. All joints are
   *  written fresh each frame so the flinch kick can't accumulate. */
  #poseHound(z, rig, rest, J, dt) {
    const walking = z.state === 'pathing' || z.state === 'spawning';
    const swiping = z.swipe > 0;
    z.walkAmt = ease(z.walkAmt, walking ? 1 : 0, dt, 6);
    z.atkAmt = ease(z.atkAmt, swiping ? 1 : 0, dt, 16);
    const w = z.walkAmt;

    z.animTime += dt * (walking ? 3.4 + z.speed * 1.2 : 1.6);
    const p = z.animTime;
    const fSw = Math.sin(p);            // front-leg pair swing
    const rSw = Math.sin(p - 1.2);      // rear pair, offset for a bound
    const bob = Math.abs(Math.sin(p));

    // attack: rear back on the wind-up, pounce forward through the chop
    const swProg = swiping ? 1 - z.swipe / ZombieConfig.swipeTime : 0;
    const pounce = Math.sin(Math.min(1, swProg) * Math.PI);      // 0..1..0
    const rear = Math.max(0, Math.sin(Math.min(1, swProg) * Math.PI * 0.5) - swProg); // early wind-up

    // --- body core: bob + gallop pitch, lunge forward on the pounce ---
    const corePitch = Math.sin(p) * 0.09 * w + z.atkAmt * (-0.35 * rear + 0.2 * pounce);
    J.core.position.set(0, rest.coreY + (bob * 0.09 - 0.045) * w + z.atkAmt * pounce * 0.06, z.atkAmt * pounce * 0.32);
    J.core.rotation.set(corePitch, 0, 0);
    J.chest.rotation.set(Math.sin(p + 0.6) * 0.05 * w, 0, 0);

    // --- head + neck: low and scanning, thrusts forward on the bite ---
    J.neck.rotation.set(rest.neck + 0.06 * w + z.atkAmt * (-0.3 * pounce + 0.25 * rear), Math.sin(p * 0.5) * 0.12 * w, 0);
    J.head.rotation.set(rest.head + Math.sin(p * 0.7) * 0.05 * w + z.atkAmt * (0.2 * pounce), Math.sin(p * 0.5) * 0.1 * w, 0);
    if (J.jaw) J.jaw.rotation.x = 0.12 + Math.sin(p * 2) * 0.05 * w + z.atkAmt * (0.4 + pounce * 0.5); // pant + snap open

    // --- tail: streams behind, sways ---
    if (J.tail) J.tail.rotation.set(rest.tail - 0.1 * w + Math.sin(p * 1.3) * 0.18 * w, Math.cos(p) * 0.22 * w, 0);

    // --- legs: bounding gallop (front pair together, rear pair together) ---
    const setLeg = (key, sw, sign) => {
      const u = J[key + 'U'], l = J[key + 'L'];
      if (!u) return;
      u.rotation.set(sw * 0.9 * w + z.atkAmt * (sign > 0 ? -0.5 * rear + 0.6 * pounce : 0.5 * pounce), 0, 0);
      if (l) l.rotation.x = Math.max(0, -sw) * 0.9 * w + 0.18 * w + z.atkAmt * 0.3;
    };
    setLeg('fl', fSw, 1); setLeg('fr', fSw * 0.96, 1);   // front (sign +1: tuck on pounce)
    setLeg('bl', rSw, -1); setLeg('br', rSw * 0.96, -1); // rear (drive on pounce)

    // --- mane of fire: flicker scale + opacity per tongue ---
    const flames = rig.userData.flames;
    if (flames) {
      for (const f of flames) {
        const fl = 0.7 + 0.45 * Math.sin(p * 9 + f.phase);
        f.g.scale.set(0.8 + 0.2 * Math.sin(p * 7 + f.phase * 1.3), fl, 0.8 + 0.2 * Math.cos(p * 8 + f.phase));
      }
    }

    // --- localized hit recoil (head/body jerk) ---
    if (z.flinch > 0) {
      z.flinchT += dt;
      const DUR = 0.3;
      if (z.flinchT >= DUR) { z.flinch = 0; z.flinchT = 0; }
      else {
        const u = z.flinchT / DUR;
        const env = z.flinch * (Math.exp(-3.5 * u) - Math.exp(-9 * u)) * 3.0;
        J.head.rotation.x -= env * 0.5;
        J.core.rotation.z += env * 0.22 * z.flinchSign;
        J.core.position.z -= env * 0.08;
      }
    }
  }

  /** Localized hit recoil, layered on top of the gait. A proper IMPULSE — a fast
   *  punch-in to a big amplitude, then a smooth spring-back with a touch of
   *  follow-through over ~0.3s — so it reads with real oomph. Only touches joints
   *  the gait resets every frame, so it can never accumulate. */
  #flinch(z, J, dt) {
    if (z.flinch <= 0) return;
    z.flinchT += dt;
    const DUR = 0.32;
    if (z.flinchT >= DUR) { z.flinch = 0; z.flinchT = 0; return; }
    const u = z.flinchT / DUR; // 0..1 through the impulse
    // difference-of-exponentials impulse: 0 -> quick peak (~u 0.17) -> soft tail.
    // *3 normalises the peak to ~1, then a damped sine adds the spring overshoot.
    const e = (Math.exp(-3.5 * u) - Math.exp(-9 * u)) * 3.0;
    const env = z.flinch * (e - 0.18 * Math.sin(u * 9.0) * Math.exp(-4 * u)); // overshoot/settle
    const s = z.flinchSign;

    switch (z.flinchPart) {
      case 'head':
        J.head.rotation.x -= env * 1.15;            // head snaps back hard
        J.head.rotation.z += env * 0.8 * s;
        J.torso.rotation.x -= env * 0.3;            // a little carries into the torso
        J.hips.position.z -= env * 0.05;
        break;
      case 'pelvis':
        J.hips.rotation.x -= env * 0.28;            // hips buck (waist bend toned down)
        J.hips.position.y -= env * 0.06;
        J.hips.position.z -= env * 0.1;             // whole body kicks back (force kept)
        J.torso.rotation.z += env * 0.18 * s;
        break;
      case 'legs':
        J.hips.position.y -= env * 0.13;            // leg buckles, body drops + kicks back
        J.hips.position.z -= env * 0.08;
        J.kneeL.rotation.x += env * 0.7;
        J.thighL.rotation.x += env * 0.35;
        J.hips.rotation.z += env * 0.18 * s;
        break;
      default: // chest
        J.torso.rotation.x -= env * 0.5;            // torso rocks back (waist bend toned down — bodies don't fold like that)
        J.torso.rotation.z += env * 0.35 * s;
        J.head.rotation.x -= env * 0.5;             // head whips with it (kept)
        J.shoulderL.rotation.x -= env * 0.5;        // arms fling (kept)
        J.shoulderR.rotation.x -= env * 0.5;
        J.hips.position.z -= env * 0.12;            // whole body recoils back (force kept)
        break;
    }
  }

  #poseOne(z, rest, J, dt) {
    const G = GAITS[z.gait] || GAITS.run;
    // per-zombie personality (subtle posture/cadence offsets layered on the gait)
    const V = (VARIANTS[z.gait] || VARIANTS.run)[z.variant & 3] || V_BASE;
    const walking = z.state === 'pathing' || z.state === 'spawning';
    const swiping = z.swipe > 0;
    z.walkAmt = ease(z.walkAmt, walking ? 1 : 0, dt, 6);
    z.tearAmt = ease(z.tearAmt, z.state === 'teardown' ? 1 : 0, dt, 9);
    z.atkAmt = ease(z.atkAmt, swiping ? 1 : 0, dt, 16);

    const rate = (walking ? (2.5 + z.speed * 1.8) * G.rate : 1.6) * V.rate;
    z.animTime += dt * rate;
    const p = z.animTime;
    const s = Math.sin(p);
    const w = z.walkAmt;
    const limpL = G.limp ? 0.55 : 1; // left leg drags on a shambler

    // legs: V.stride scales overall swing length, V.legL/legR give one side a
    // subtle drag (shorter) or longer reach for an uneven, weighted gait
    const strideL = G.stride * V.stride * V.legL, strideR = G.stride * V.stride * V.legR;
    J.thighL.rotation.x = -s * strideL * limpL * w;
    J.thighR.rotation.x = s * strideR * w;
    J.kneeL.rotation.x = Math.max(0, -s) * G.knee * limpL * V.legL * w + (G.limp ? 0.18 * w : 0); // stiff bad knee
    J.kneeR.rotation.x = Math.max(0, s) * G.knee * V.legR * w;

    // hips: bob + counter-sway, with a limp hitch + lean onto the good leg
    const hitch = G.limp ? Math.max(0, -s) * 0.04 * w : 0;
    // set the whole hip transform each frame as the baseline, so the flinch's
    // additive rotation/position kicks are transient and never accumulate
    J.hips.position.set(0, rest.hipY + (Math.abs(s) * 0.035 - 0.018) * w - hitch, 0);
    J.hips.rotation.x = 0;
    J.hips.rotation.y = s * 0.06 * V.hipSway * w;
    J.hips.rotation.z = (G.limp ? Math.max(0, -s) * 0.07 * w : 0) + V.hipTilt; // constant weighted lean

    // torso lurch + lean + breathing (+ variant hunch / constant side-lean / sway)
    J.torso.rotation.x = rest.torso + G.lurch * w + Math.sin(p * 0.5) * 0.03 * V.sway + V.torsoX;
    J.torso.rotation.z = -s * G.lean * w + V.torsoZ;

    // head loll (+ variant nod / roll)
    J.head.rotation.z = s * 0.05 * w + 0.04 + G.headLoll + V.headZ;
    J.head.rotation.x = 0.06 + Math.sin(p * 0.7) * 0.04 * V.sway + V.headX;

    // --- arms --- (variant biases each arm's carriage for asymmetric reach/drag)
    const drift = Math.sin(p * 0.9) * G.armDrift * w;
    const armLbase = G.armReach + (G.limp ? -0.15 : 0) + drift + V.armL; // shambler's left arm hangs lower
    const armRbase = G.armReach - drift + V.armR;

    // swipe: rear back high overhead, then chop down hard (hit lands ~mid-swing)
    const swProg = swiping ? 1 - z.swipe / ZombieConfig.swipeTime : 0; // 0->1 through the swing
    const swDown = Math.max(0, swProg - 0.4) / 0.6;                    // chop in the back half
    const atkShoulder = lerp(-2.6, 0.05, swDown);                       // way back -> slam forward

    // tear: alternating rip
    const claw = Math.sin(p * 2.4);
    const tearL = rest.shoulder + claw * 0.5;
    const tearR = rest.shoulder - claw * 0.5;

    let shL = lerp(armLbase, tearL, z.tearAmt);
    let shR = lerp(armRbase, tearR, z.tearAmt);
    shL = lerp(shL, atkShoulder, z.atkAmt);
    shR = lerp(shR, atkShoulder, z.atkAmt);
    J.shoulderL.rotation.x = shL;
    J.shoulderR.rotation.x = shR;
    // splay arms OUTWARD from the body at rest (the signs were inverted, which
    // swung the forearms inward and clipped them through the torso); the attack
    // still pulls them in/forward for the overhead chop.
    J.shoulderL.rotation.z = lerp(-G.armSplay - V.splay, 0.2, z.atkAmt);
    J.shoulderR.rotation.z = lerp(G.armSplay + V.splay, -0.2, z.atkAmt);

    const swRaise = Math.sin(Math.min(1, swProg) * Math.PI); // 0..1..0
    // elbows hang nearly STRAIGHT through the gaits (stiff zombie reach); the
    // bend only eases in for the attack/tear, so the swing pose is unchanged
    const elbowBase = lerp(0.05, rest.elbow, Math.max(z.atkAmt, z.tearAmt));
    J.elbowL.rotation.x = elbowBase + z.tearAmt * Math.max(0, claw) * 0.6 + z.atkAmt * (0.2 + swRaise * 0.6);
    J.elbowR.rotation.x = elbowBase + z.tearAmt * Math.max(0, -claw) * 0.6 + z.atkAmt * (0.2 + swRaise * 0.6);

    // missing arms change the attack. A severed arm is already hidden, so a
    // one-armed zombie automatically chops with its remaining arm; if BOTH arms
    // are gone it can't claw, so it lunges/headbutts harder with the whole body.
    const noArms = z.limbs && !z.limbs.armL && !z.limbs.armR;
    const lunge = noArms ? 2.2 : 1; // headbutt drive
    // weighty lunge: rear back on the wind-up, then pitch the torso + head
    // forward through the chop (added on top of the gait pose, so it decays out)
    if (J.torso) J.torso.rotation.x += z.atkAmt * (-0.18 * swRaise + 0.55 * swDown) * lunge;
    if (J.head) J.head.rotation.x += z.atkAmt * (0.45 * swDown - 0.15 * swRaise) * lunge;
    if (noArms && J.hips) J.hips.position.z += z.atkAmt * swDown * 0.12; // whole body pitches in

    // localized hit recoil, layered on last so it reads through any gait/swipe
    this.#flinch(z, J, dt);
  }
}
