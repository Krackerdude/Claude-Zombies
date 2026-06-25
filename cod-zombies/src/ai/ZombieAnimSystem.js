import { System } from '../ecs/System.js';
import { ZombieTag, Renderable } from '../ecs/components/index.js';
import { Service } from '../core/ServiceLocator.js';
import { ZombieConfig } from '../config/zombies.js';

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

export class ZombieAnimSystem extends System {
  #gameState;

  init() {
    this.#gameState = this.world.services.get(Service.GameState);
  }

  update(dt) {
    if (!this.#gameState.isPlaying) return;
    for (const id of this.world.query(ZombieTag, Renderable)) {
      const z = this.world.get(id, ZombieTag);
      const rig = this.world.get(id, Renderable).object3d;
      const J = rig.userData?.joints;
      if (!J) continue;
      if (z.state === 'knocked') { this.#poseKnock(z, rig.userData.rest, J); continue; }
      this.#poseOne(z, rig.userData.rest, J, dt);
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
        J.hips.rotation.x -= env * 0.5;             // hips buck
        J.hips.position.y -= env * 0.06;
        J.hips.position.z -= env * 0.1;             // whole body kicks back
        J.torso.rotation.z += env * 0.3 * s;
        break;
      case 'legs':
        J.hips.position.y -= env * 0.13;            // leg buckles, body drops + kicks back
        J.hips.position.z -= env * 0.08;
        J.kneeL.rotation.x += env * 0.7;
        J.thighL.rotation.x += env * 0.35;
        J.hips.rotation.z += env * 0.18 * s;
        break;
      default: // chest
        J.torso.rotation.x -= env * 0.85;           // torso rocks back
        J.torso.rotation.z += env * 0.55 * s;
        J.head.rotation.x -= env * 0.5;             // head whips with it
        J.shoulderL.rotation.x -= env * 0.5;        // arms fling
        J.shoulderR.rotation.x -= env * 0.5;
        J.hips.position.z -= env * 0.12;            // whole body recoils back
        break;
    }
  }

  #poseOne(z, rest, J, dt) {
    const G = GAITS[z.gait] || GAITS.run;
    const walking = z.state === 'pathing' || z.state === 'spawning';
    const swiping = z.swipe > 0;
    z.walkAmt = ease(z.walkAmt, walking ? 1 : 0, dt, 6);
    z.tearAmt = ease(z.tearAmt, z.state === 'teardown' ? 1 : 0, dt, 9);
    z.atkAmt = ease(z.atkAmt, swiping ? 1 : 0, dt, 16);

    const rate = walking ? (2.5 + z.speed * 1.8) * G.rate : 1.6;
    z.animTime += dt * rate;
    const p = z.animTime;
    const s = Math.sin(p);
    const w = z.walkAmt;
    const limpL = G.limp ? 0.55 : 1; // left leg drags on a shambler

    // legs
    J.thighL.rotation.x = -s * G.stride * limpL * w;
    J.thighR.rotation.x = s * G.stride * w;
    J.kneeL.rotation.x = Math.max(0, -s) * G.knee * limpL * w + (G.limp ? 0.18 * w : 0); // stiff bad knee
    J.kneeR.rotation.x = Math.max(0, s) * G.knee * w;

    // hips: bob + counter-sway, with a limp hitch + lean onto the good leg
    const hitch = G.limp ? Math.max(0, -s) * 0.04 * w : 0;
    // set the whole hip transform each frame as the baseline, so the flinch's
    // additive rotation/position kicks are transient and never accumulate
    J.hips.position.set(0, rest.hipY + (Math.abs(s) * 0.035 - 0.018) * w - hitch, 0);
    J.hips.rotation.x = 0;
    J.hips.rotation.y = s * 0.06 * w;
    J.hips.rotation.z = G.limp ? Math.max(0, -s) * 0.07 * w : 0;

    // torso lurch + lean + breathing
    J.torso.rotation.x = rest.torso + G.lurch * w + Math.sin(p * 0.5) * 0.03;
    J.torso.rotation.z = -s * G.lean * w;

    // head loll
    J.head.rotation.z = s * 0.05 * w + 0.04 + G.headLoll;
    J.head.rotation.x = 0.06 + Math.sin(p * 0.7) * 0.04;

    // --- arms ---
    const drift = Math.sin(p * 0.9) * G.armDrift * w;
    const armLbase = G.armReach + (G.limp ? -0.15 : 0) + drift; // shambler's left arm hangs lower
    const armRbase = G.armReach - drift;

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
    J.shoulderL.rotation.z = lerp(-G.armSplay, 0.2, z.atkAmt);
    J.shoulderR.rotation.z = lerp(G.armSplay, -0.2, z.atkAmt);

    const swRaise = Math.sin(Math.min(1, swProg) * Math.PI); // 0..1..0
    J.elbowL.rotation.x = rest.elbow + z.tearAmt * Math.max(0, claw) * 0.6 + z.atkAmt * (0.2 + swRaise * 0.6);
    J.elbowR.rotation.x = rest.elbow + z.tearAmt * Math.max(0, -claw) * 0.6 + z.atkAmt * (0.2 + swRaise * 0.6);

    // weighty lunge: rear back on the wind-up, then pitch the torso + head
    // forward through the chop (added on top of the gait pose, so it decays out)
    if (J.torso) J.torso.rotation.x += z.atkAmt * (-0.18 * swRaise + 0.55 * swDown);
    if (J.head) J.head.rotation.x += z.atkAmt * (0.45 * swDown - 0.15 * swRaise);

    // localized hit recoil, layered on last so it reads through any gait/swipe
    this.#flinch(z, J, dt);
  }
}
