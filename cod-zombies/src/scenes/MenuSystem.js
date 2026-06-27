import * as THREE from 'three';
import { System } from '../ecs/System.js';
import { Service } from '../core/ServiceLocator.js';
import { buildMenuScene } from './MenuScene.js';

const _look = new THREE.Vector3();

/**
 * Builds + owns the 3D main-menu backdrop and frames the camera on it whenever
 * the game isn't being played (menu / pause). Registers the scene on the
 * SceneManager so RenderSystem draws it in place of the arena. A slow, cinematic
 * camera drift keeps the survivor + campfire composed on the right of frame,
 * leaving the left clear for the menu UI.
 */
export class MenuSystem extends System {
  #gameState; #camera; #sceneMgr; #time;
  #menu = null;
  #t = 0;

  init() {
    this.#gameState = this.world.services.get(Service.GameState);
    this.#camera = this.world.services.get(Service.Render).camera;
    this.#sceneMgr = this.world.services.get(Service.Scene);
    this.#time = this.world.services.get(Service.Time);

    this.#menu = buildMenuScene();
    this.#sceneMgr.menuScene = this.#menu.scene; // RenderSystem renders this when not playing
  }

  /** Compile the menu scene's materials up-front (called during the loader). */
  prewarm(render) { try { render?.renderer?.compile?.(this.#menu.scene, this.#camera); } catch { /* headless */ } }

  update(dt) {
    if (this.#gameState.isPlaying) return;
    this.#t += dt;
    this.#menu.update(dt, this.#t);
  }

  // own the camera AFTER CameraController's menu drift, so we frame the backdrop
  lateUpdate() {
    if (this.#gameState.isPlaying) return;
    const t = this.#t;
    // composed slightly left + low, looking at the survivor/fire on the right;
    // a gentle handheld sway + breathing dolly
    const sway = Math.sin(t * 0.25), sway2 = Math.sin(t * 0.17 + 1.0);
    // composed from the left looking across at the survivor (right third); the
    // fire falls to the lower-left foreground, leaving the menu's left clear
    this.#camera.position.set(-1.3 + sway * 0.12, 1.78 + sway2 * 0.05, 5.1 + Math.sin(t * 0.12) * 0.15);
    _look.set(0.7 + sway * 0.05, 1.12, -0.3); // balanced: nebula in the upper third, hero + fire in the lower middle
    this.#camera.lookAt(_look);
    this.#camera.rotateZ(Math.sin(t * 0.21) * 0.006); // faint dutch tilt
    const FOV = 50;
    if (Math.abs(this.#camera.fov - FOV) > 0.01) { this.#camera.fov = FOV; this.#camera.updateProjectionMatrix(); }
  }
}
