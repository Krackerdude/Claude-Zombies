import { ZombieTag, CorpseTag, Transform, RigidBodyRef, Renderable } from '../ecs/components/index.js';
import { PlayerCombat, ZombieConfig } from '../config/zombies.js';
import { Service } from '../core/ServiceLocator.js';
import { severLimb, severLowerBody, severHead } from '../ai/dismember.js';

const LIMB_PARTS = { armL: 1, armR: 1, legL: 1, legR: 1 };

/**
 * Single place that applies damage to a zombie and resolves scoring/kills, so
 * hitscan, pellets, projectile splash, and cone weapons all award points and
 * clean up consistently. `ctx` carries { world, spawn, events, player }.
 * `opts.dir` is the killing bullet's direction — used to launch the ragdoll.
 * Returns true if this hit was the killing blow.
 */
export function damageZombie(ctx, id, amount, { award = true, headshot = false, dir = null, force = 1, part = null, knockChance = 0, flinchScale = 1, dismemberChance = 0 } = {}) {
  const z = ctx.world.get(id, ZombieTag);
  if (!z || z.state === 'dead') return false;

  // Cryo-frozen: any hit shatters it into ice shards (instant kill, no corpse).
  if (z.frozen > 0) {
    const aat = ctx.world.services.has(Service.AAT) ? ctx.world.services.get(Service.AAT) : null;
    if (aat) { aat.shatter(id, dir); return true; }
  }

  // dismemberment: a limb hit can shoot that limb clean off (chance scales with
  // caliber, passed in by the weapon). Only an attached limb, only if it didn't
  // already die this hit (handled below — the roll is before the lethal check so
  // a corpse can spawn already missing the limb).
  if (!z.hound && dismemberChance > 0 && part && LIMB_PARTS[part] && z.limbs?.[part] && Math.random() < dismemberChance) {
    const rig = ctx.world.get(id, Renderable)?.object3d;
    if (part === 'legL' || part === 'legR') {
      // shooting off a leg takes the whole lower body: instant gory crawler,
      // cut off at the waist (no single-leg hopping state)
      z.limbs.legL = false; z.limbs.legR = false;
      z.crawler = true;
      if (z.state === 'teardown') { z.state = 'pathing'; z.barrierTarget = null; z.replan = 0; } // can't tear from the floor
      if (rig) {
        severLimb(rig, 'legL'); severLimb(rig, 'legR');
        const at = severLowerBody(rig);
        if (at) ctx.events.emit('zombie:gib', { ...at, dir, count: 16, speed: 3.6, scale: 1.25 });
      }
    } else {
      z.limbs[part] = false;
      const at = rig ? severLimb(rig, part) : null;
      if (at) ctx.events.emit('zombie:gib', { ...at, dir, count: 9, speed: 3.2 });
    }
  }

  const pu = ctx.world.services.has(Service.Powerups) ? ctx.world.services.get(Service.Powerups) : null;
  const mul = pu ? pu.pointsMultiplier() : 1;
  if (pu && pu.instaKill) amount = z.health; // insta-kill: any hit is lethal

  z.health -= amount;

  let killed = false;
  if (z.health <= 0) {
    z.state = 'dead';
    if (award) ctx.player.points += (headshot ? PlayerCombat.pointsKillHead : PlayerCombat.pointsKillBody) * mul;
    const t = ctx.world.get(id, Transform);
    const kx = t ? t.position.x : 0, kz = t ? t.position.z : 0;
    // corpses/hounds alike: drop the player-blocking capsule
    const ref = ctx.world.get(id, RigidBodyRef);
    if (ref) {
      ctx.world.services.get(Service.Physics).removeBody(ref);
      ctx.world.remove(id, RigidBodyRef);
    }
    if (z.hound) {
      // hellhounds don't leave a corpse — they BURST apart into gibs and a ball
      // of fire (with a screen shake), then the entity is reaped.
      const rig = ctx.world.get(id, Renderable)?.object3d;
      ctx.events.emit('zombie:gib', { x: kx, y: 0.55, z: kz, dir, count: 24, speed: 4.2, scale: 1.15 });
      ctx.events.emit('fx:explosion', { x: kx, y: 0.6, z: kz, kind: 'hound' }); // fireball + shake
      if (rig) rig.visible = false;
      ctx.world.remove(id, ZombieTag);
      ctx.world.destroyEntity(id);
      const hounds = ctx.world.services.has(Service.Hounds) ? ctx.world.services.get(Service.Hounds) : null;
      hounds?.notifyKilled(kx, kz); // tracks the wave + drops the guaranteed Max Ammo on the last one
    } else {
      // headshot kill: the head pops — blow it off and burst it into gibs
      if (headshot) {
        const rig = ctx.world.get(id, Renderable)?.object3d;
        const at = rig ? severHead(rig) : null;
        if (at) ctx.events.emit('zombie:gib', { ...at, dir, count: 18, speed: 3.8, scale: 1.1 });
      }
      // hand the entity off to the corpse system: drop the live tag, keep the rig
      const baseYaw = t ? 2 * Math.atan2(t.quaternion.y, t.quaternion.w) : 0; // zombie's Y-only facing
      ctx.world.remove(id, ZombieTag);
      ctx.world.add(id, new CorpseTag(dir || { x: 0, z: 1 }, baseYaw, force, z.limbs));
      ctx.spawn.notifyKilled();
    }
    ctx.events.emit('zombie:killed', { headshot, x: kx, z: kz, hound: z.hound });
    killed = true;
  } else {
    // --- survived the hit: localized flinch (scaled by the gun's damage), and
    //     maybe an explosion knockdown ---
    // flinchScale << 1 for automatic/burst weapons, so rapid fire doesn't make
    // them undulate; the cap + gentler per-damage slope keep caliber from
    // dominating the reaction.
    const f = Math.min(1.1, ZombieConfig.flinchMin + amount * ZombieConfig.flinchPerDamage + (headshot ? 0.2 : 0)) * flinchScale;
    // every hit (re)fires the impulse so rapid fire keeps them visibly rocking
    z.flinch = Math.max(f, z.flinch * 0.6);
    z.flinchT = 0;
    z.flinchPart = part || (headshot ? 'head' : 'chest');
    z.flinchSign = dir ? (dir.x >= 0 ? 1 : -1) : (Math.random() < 0.5 ? 1 : -1);
    // knockdown: only from explosions (knockChance>0), only if up + not stunned
    if (knockChance > 0 && z.knockTime <= 0 && z.state !== 'spawning' && Math.random() < knockChance) {
      z.state = 'knocked';
      z.knockTime = ZombieConfig.knockDuration;
      z.knockTotal = ZombieConfig.knockDuration;
      z.swipe = 0; z.swung = false;
    }
    if (award) ctx.player.points += PlayerCombat.pointsPerHit * mul; // 10 per non-lethal hit
  }
  if (award) ctx.events.emit('score:changed', { points: ctx.player.points });
  return killed;
}
