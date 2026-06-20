import { System } from '../ecs/System.js';
import { Transform, PlayerTag, RigidBodyRef } from '../ecs/components/index.js';
import { Service } from '../core/ServiceLocator.js';
import { MovementController } from './MovementController.js';
import { ControlScheme } from './ControlScheme.js';
import { MoveState } from './MoveState.js';
import { ZombieConfig } from '../config/zombies.js';
import { PlayerConfig } from '../config/index.js';

/**
 * Thin glue between input and the movement model. Each fixed tick it resolves
 * the player's *intent* through the ControlScheme (which applies toggle/hold
 * modes) and hands it to the MovementController. Only runs while playing.
 *
 * Order contract: runs before PhysicsSystem in the fixed phase.
 */
export class PlayerSystem extends System {
  #gameState;
  #controller;
  #scheme;
  #time;
  #events;
  #divePeak = 0;
  #wasDiving = false;

  #intent = {
    forward: 0, strafe: 0, hasMove: false,
    sprintHeld: false, wantCrouch: false, wantProne: false, aimHeld: false,
    crouchEdge: false, proneEdge: false, jumpPressed: false,
  };

  init() {
    const physics = this.world.services.get(Service.Physics);
    const actions = this.world.services.get(Service.Actions);
    const settings = this.world.services.get(Service.Settings);
    const events = this.world.services.get(Service.Events);
    this.#events = events;
    this.#gameState = this.world.services.get(Service.GameState);
    this.#time = this.world.services.get(Service.Time);
    this.#controller = new MovementController(physics);
    this.#scheme = new ControlScheme(actions, settings, events);
  }

  fixedUpdate(dt) {
    if (!this.#gameState.isPlaying) return;

    const id = this.world.first(PlayerTag, Transform, RigidBodyRef);
    if (id === undefined) return;

    const tag = this.world.get(id, PlayerTag);
    const t = this.world.get(id, Transform);
    const ref = this.world.get(id, RigidBodyRef);

    this.#scheme.resolve(this.#intent);

    // perks: Stamin-Up speed/sprint, Juggernog health pool, drink/down gating
    const pk = this.world.services.has(Service.Perks) ? this.world.services.get(Service.Perks) : null;
    let scale = this.#time.elapsed < tag.slowUntil ? ZombieConfig.swipeSlowFactor : 1;
    if (tag.aiming) scale *= PlayerConfig.adsMoveScale; // ADS walk penalty
    if (pk) {
      tag.maxHealth = pk.maxHealth();
      tag.sprintMax = pk.sprintTime();
      tag.noSprint = pk.drinking || pk.downed;
      tag.downed = pk.downed;
      scale *= pk.moveMul();
      if (pk.downed) {
        scale = 0;
        this.#intent.forward = 0; this.#intent.strafe = 0; this.#intent.hasMove = false;
        this.#intent.sprintHeld = false; this.#intent.jumpPressed = false;
        this.#intent.crouchEdge = false; this.#intent.proneEdge = false;
      }
    }
    tag.moveScale = scale;

    // PHD Flopper: report a dive's fall height when it lands
    if (tag.state === MoveState.DIVE) this.#divePeak = Math.max(this.#divePeak, t.position.y);
    else if (this.#wasDiving && tag.grounded) {
      this.#events?.emit('player:dive-land', { height: Math.max(0, this.#divePeak - t.position.y) });
      this.#divePeak = 0;
    }
    this.#wasDiving = tag.state === MoveState.DIVE;

    this.#controller.update(tag, t, ref, this.#intent, dt);
  }

  /**
   * Per-frame edge capture. Runs every render frame (unlike fixedUpdate, which
   * can run zero times on a fast frame), latching discrete presses so jumps and
   * slide/dive starts are never dropped between fixed steps.
   */
  update() {
    if (!this.#gameState.isPlaying) { this.#scheme.clearEdges(); return; }
    this.#scheme.poll();
  }
}
