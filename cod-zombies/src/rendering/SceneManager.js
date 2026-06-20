import * as THREE from 'three';

/**
 * Owns the active THREE.Scene and provides hooks for swapping scenes (main menu
 * vs in-game map) without other systems caring. Also centralises ambient
 * lighting/fog setup so scene construction stays declarative.
 *
 * RenderSystem asks the SceneManager for `.scene` each frame; gameplay code
 * adds/removes Object3Ds through add()/remove().
 */
export class SceneManager {
  /** @type {THREE.Scene} */
  scene = new THREE.Scene();

  /** Graphics-tunable handles the SettingsStore can reach (set by scene build). */
  sun = null;
  tunableTextures = [];

  constructor() {
    this.scene.background = new THREE.Color(0x05060a);
    this.scene.fog = new THREE.FogExp2(0x05060a, 0.018);
  }

  add(object3d) {
    this.scene.add(object3d);
    return object3d;
  }

  remove(object3d) {
    this.scene.remove(object3d);
  }

  /** Swap to a fresh scene, disposing the old graph's geometries/materials. */
  setScene(scene) {
    this.#disposeGraph(this.scene);
    this.scene = scene;
    return scene;
  }

  #disposeGraph(root) {
    root.traverse((obj) => {
      obj.geometry?.dispose?.();
      const mat = obj.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.());
      else mat?.dispose?.();
    });
  }

  dispose() {
    this.#disposeGraph(this.scene);
  }
}
