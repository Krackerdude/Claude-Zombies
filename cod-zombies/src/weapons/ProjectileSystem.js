import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Transform, ZombieTag, ProjectileTag, PlayerTag } from '../ecs/components/index.js';
import { Service } from '../core/ServiceLocator.js';
import { ZombieConfig } from '../config/zombies.js';
import { damageZombie } from './damage.js';

const _step = new THREE.Vector3();

/**
 * Advances launcher/wonder-weapon projectiles, detects impact (a zombie or a
 * wall), and resolves direct vs splash damage. Nav-driven zombies have no
 * colliders, so hits are distance checks; walls come from the nav grid's solid
 * cells, keeping projectiles consistent with the same world the AI navigates.
 */
export class ProjectileSystem extends System {
  #nav;
  #spawn;
  #events;
  #gameState;

  init() {
    this.#nav = this.world.services.get(Service.Nav);
    this.#spawn = this.world.services.get(Service.Spawn);
    this.#events = this.world.services.get(Service.Events);
    this.#gameState = this.world.services.get(Service.GameState);
  }

  fixedUpdate(dt) {
    if (!this.#gameState.isPlaying) return;
    const pid = this.world.first(PlayerTag);
    const ctx = {
      world: this.world,
      spawn: this.#spawn,
      events: this.#events,
      player: pid !== undefined ? this.world.get(pid, PlayerTag) : { points: 0 },
    };

    for (const id of [...this.world.query(ProjectileTag, Transform)]) {
      const p = this.world.get(id, ProjectileTag);
      const t = this.world.get(id, Transform);
      t.cachePrevious();

      p.life -= dt;
      _step.copy(p.velocity).multiplyScalar(dt);
      t.position.add(_step);

      if (p.life <= 0 || this.#hitWall(t.position)) { this.#detonate(ctx, p, t.position, null); this.world.destroyEntity(id); continue; }

      const hit = this.#hitZombie(t.position);
      if (hit !== null) { this.#detonate(ctx, p, t.position, hit); this.world.destroyEntity(id); }
    }
  }

  #hitWall(pos) {
    if (pos.y < 0.1) return true;
    const cell = this.#nav.cellAt(pos.x, pos.z);
    if (cell < 0) return true; // out of bounds
    return this.#nav.solid[cell] === 1;
  }

  #hitZombie(pos) {
    const r = ZombieConfig.radius + 0.2;
    for (const id of this.world.query(ZombieTag, Transform)) {
      const t = this.world.get(id, Transform);
      const dx = t.position.x - pos.x;
      const dy = (t.position.y + ZombieConfig.height * 0.5) - pos.y;
      const dz = t.position.z - pos.z;
      if (dx * dx + dy * dy + dz * dz <= r * r) return id;
    }
    return null;
  }

  #detonate(ctx, p, pos, directId) {
    if (p.splashRadius > 0) {
      const r2 = p.splashRadius * p.splashRadius;
      for (const id of [...this.world.query(ZombieTag, Transform)]) {
        const t = this.world.get(id, Transform);
        const dx = t.position.x - pos.x, dz = t.position.z - pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 <= r2) {
          const falloff = 1 - Math.sqrt(d2) / p.splashRadius;
          damageZombie(ctx, id, p.splashDamage * (0.5 + 0.5 * falloff), { dir: { x: dx, z: dz }, force: 1.6 }); // blown outward
          this.#events.emit('fx:blood', { x: t.position.x, y: t.position.y + 1.1, z: t.position.z, dx, dz });
        }
      }
    } else if (directId !== null) {
      const v = p.velocity;
      damageZombie(ctx, directId, p.damage, { dir: { x: v?.x ?? 0, z: v?.z ?? 1 } });
    }
    this.#events.emit('weapon:explosion', { x: pos.x, y: pos.y, z: pos.z });
  }
}
