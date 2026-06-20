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
  shamble: { stride: 0.30, knee: 0.50, lurch: 0.05, lean: 0.05, armReach: -0.20, armSplay: 0.38, armDrift: 0.06, headLoll: 0.12, rate: 0.95, limp: true },
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
      this.#poseOne(z, rig.userData.rest, J, dt);
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
    J.hips.position.y = rest.hipY + (Math.abs(s) * 0.035 - 0.018) * w - hitch;
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
    J.shoulderL.rotation.z = lerp(G.armSplay, 0.2, z.atkAmt);
    J.shoulderR.rotation.z = lerp(-G.armSplay, -0.2, z.atkAmt);

    const swRaise = Math.sin(Math.min(1, swProg) * Math.PI); // 0..1..0
    J.elbowL.rotation.x = rest.elbow + z.tearAmt * Math.max(0, claw) * 0.6 + z.atkAmt * (0.2 + swRaise * 0.6);
    J.elbowR.rotation.x = rest.elbow + z.tearAmt * Math.max(0, -claw) * 0.6 + z.atkAmt * (0.2 + swRaise * 0.6);

    // weighty lunge: rear back on the wind-up, then pitch the torso + head
    // forward through the chop (added on top of the gait pose, so it decays out)
    if (J.torso) J.torso.rotation.x += z.atkAmt * (-0.18 * swRaise + 0.55 * swDown);
    if (J.head) J.head.rotation.x += z.atkAmt * (0.45 * swDown - 0.15 * swRaise);
  }
}
