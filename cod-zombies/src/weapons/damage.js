import { ZombieTag, CorpseTag, Transform, RigidBodyRef } from '../ecs/components/index.js';
import { PlayerCombat, ZombieConfig } from '../config/zombies.js';
import { Service } from '../core/ServiceLocator.js';

/**
 * Single place that applies damage to a zombie and resolves scoring/kills, so
 * hitscan, pellets, projectile splash, and cone weapons all award points and
 * clean up consistently. `ctx` carries { world, spawn, events, player }.
 * `opts.dir` is the killing bullet's direction — used to launch the ragdoll.
 * Returns true if this hit was the killing blow.
 */
export function damageZombie(ctx, id, amount, { award = true, headshot = false, dir = null, force = 1, part = null, knockChance = 0 } = {}) {
  const z = ctx.world.get(id, ZombieTag);
  if (!z || z.state === 'dead') return false;

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
    ctx.world.add(id, new CorpseTag(dir || { x: 0, z: 1 }, baseYaw, force));
    ctx.spawn.notifyKilled();
    ctx.events.emit('zombie:killed', { headshot, x: t ? t.position.x : 0, z: t ? t.position.z : 0 });
    killed = true;
  } else {
    // --- survived the hit: localized flinch (scaled by the gun's damage), and
    //     maybe an explosion knockdown ---
    const f = Math.min(1, ZombieConfig.flinchMin + amount * ZombieConfig.flinchPerDamage + (headshot ? 0.12 : 0));
    if (f > z.flinch) {                       // strongest recent hit wins (rapid fire won't shrink it)
      z.flinch = f;
      z.flinchPart = part || (headshot ? 'head' : 'chest');
      z.flinchSign = dir ? (dir.x >= 0 ? 1 : -1) : (Math.random() < 0.5 ? 1 : -1);
    }
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
