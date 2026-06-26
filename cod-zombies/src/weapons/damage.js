import { ZombieTag, CorpseTag, Transform, RigidBodyRef, Renderable } from '../ecs/components/index.js';
import { PlayerCombat, ZombieConfig } from '../config/zombies.js';
import { Service } from '../core/ServiceLocator.js';
import { severLimb, severLowerBody } from '../ai/dismember.js';

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

  // dismemberment: a limb hit can shoot that limb clean off (chance scales with
  // caliber, passed in by the weapon). Only an attached limb, only if it didn't
  // already die this hit (handled below — the roll is before the lethal check so
  // a corpse can spawn already missing the limb).
  if (dismemberChance > 0 && part && LIMB_PARTS[part] && z.limbs?.[part] && Math.random() < dismemberChance) {
    z.limbs[part] = false;
    const rig = ctx.world.get(id, Renderable)?.object3d;
    if (rig) severLimb(rig, part);
    // losing ANY leg drops the zombie to the floor as a crawler
    if (part === 'legL' || part === 'legR') {
      z.crawler = true;
      if (z.state === 'teardown') { z.state = 'pathing'; z.barrierTarget = null; z.replan = 0; } // can't tear from the floor
      if (!z.limbs.legL && !z.limbs.legR && rig) severLowerBody(rig); // both gone: cut off at the waist
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
    // hand the entity off to the corpse system: drop the live tag, keep the rig
    const t = ctx.world.get(id, Transform);
    const baseYaw = t ? 2 * Math.atan2(t.quaternion.y, t.quaternion.w) : 0; // zombie's Y-only facing
    // corpses have no collision — remove the player-blocking capsule
    const ref = ctx.world.get(id, RigidBodyRef);
    if (ref) {
      ctx.world.services.get(Service.Physics).removeBody(ref);
      ctx.world.remove(id, RigidBodyRef);
    }
    ctx.world.remove(id, ZombieTag);
    ctx.world.add(id, new CorpseTag(dir || { x: 0, z: 1 }, baseYaw, force, z.limbs));
    ctx.spawn.notifyKilled();
    ctx.events.emit('zombie:killed', { headshot, x: t ? t.position.x : 0, z: t ? t.position.z : 0 });
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
