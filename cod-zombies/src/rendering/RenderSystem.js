import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Transform, Renderable } from '../ecs/components/index.js';
import { Service } from '../core/ServiceLocator.js';
import { AppState } from '../core/GameState.js';

const _lerp = new THREE.Vector3();

/**
 * Bridges ECS data to the THREE scene graph:
 *   - On first sight of a Renderable, parents its Object3D under the scene.
 *   - Each lateUpdate, copies the Transform onto the Object3D. When the
 *     entity also has interpolation enabled, it lerps between the previous and
 *     current fixed-step positions using the loop's alpha for smooth motion.
 *   - Issues the actual draw call (it owns the render() invocation).
 */
export class RenderSystem extends System {
  #render;
  #sceneMgr;
  #gameState;
  #inScene = new Map(); // entityId -> Object3D currently parented in the scene

  init() {
    this.#render = this.world.services.get(Service.Render);
    this.#sceneMgr = this.world.services.get(Service.Scene);
    this.#gameState = this.world.services.has(Service.GameState) ? this.world.services.get(Service.GameState) : null;
  }

  /** Attach new renderables and detach ones whose entity was destroyed. */
  #syncScene() {
    const live = new Set();
    for (const id of this.world.query(Renderable)) {
      live.add(id);
      const r = this.world.get(id, Renderable);
      if (!r.addedToScene) {
        this.#sceneMgr.add(r.object3d);
        r.addedToScene = true;
        this.#inScene.set(id, r.object3d);
      }
    }
    // Anything we parented whose entity no longer has a Renderable is dead —
    // remove it from the graph and release its GPU resources. Without this,
    // killed zombies leave their meshes (and a growing draw list) behind.
    for (const [id, obj] of this.#inScene) {
      if (!live.has(id)) {
        obj.removeFromParent();
        this.#dispose(obj);
        this.#inScene.delete(id);
      }
    }
  }

  #dispose(obj) {
    obj.traverse?.((n) => {
      n.geometry?.dispose?.();
      const m = n.material;
      if (Array.isArray(m)) m.forEach((x) => x?.dispose?.());
      else m?.dispose?.();
    });
  }

  /** @param {number} alpha interpolation factor from the GameLoop */
  draw(alpha) {
    this.#syncScene();

    for (const id of this.world.query(Transform, Renderable)) {
      const t = this.world.get(id, Transform);
      const r = this.world.get(id, Renderable);
      const obj = r.object3d;

      if (r.interpolate) {
        _lerp.lerpVectors(t.previousPosition, t.position, alpha);
        obj.position.copy(_lerp);
      } else {
        obj.position.copy(t.position);
      }
      obj.quaternion.copy(t.quaternion);
      obj.scale.copy(t.scale);
    }

    // draw the 3D main-menu backdrop ONLY on the main menu — pause / scoreboard /
    // F2 freeze the live gameplay frame and overlay on top of it, so they keep
    // rendering the arena
    const useMenu = this.#sceneMgr.menuScene && this.#gameState && this.#gameState.current === AppState.MENU;
    this.#render.render(useMenu ? this.#sceneMgr.menuScene : this.#sceneMgr.scene);
  }
}
