import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/**
 * Centralised asset loading with caching and progress reporting.
 *
 * - De-dupes concurrent requests for the same URL (returns the in-flight
 *   promise) and caches resolved assets so a model/texture loads once.
 * - Supports a manifest preload with aggregate progress, which the loading
 *   screen subscribes to via onProgress.
 * - GLTF + DRACO are wired so compressed models "just work" later. Textures
 *   and audio buffers round out the common asset types.
 *
 * Nothing here assumes specific files exist — the demo scene generates its
 * textures procedurally, but the API is ready for real assets.
 */
export class AssetManager {
  #cache = new Map();
  #inflight = new Map();
  #gltf;
  #texture = new THREE.TextureLoader();
  #audio = new THREE.AudioLoader();
  #progressHandlers = new Set();

  constructor({ dracoDecoderPath = 'https://www.gstatic.com/draco/v1/decoders/' } = {}) {
    const draco = new DRACOLoader();
    draco.setDecoderPath(dracoDecoderPath);
    this.#gltf = new GLTFLoader();
    this.#gltf.setDRACOLoader(draco);
  }

  onProgress(handler) {
    this.#progressHandlers.add(handler);
    return () => this.#progressHandlers.delete(handler);
  }

  #emitProgress(loaded, total, label) {
    for (const h of this.#progressHandlers) h({ loaded, total, ratio: total ? loaded / total : 1, label });
  }

  // --- typed loaders ------------------------------------------------------

  loadTexture(url, { srgb = true } = {}) {
    return this.#load(url, () =>
      this.#texture.loadAsync(url).then((tex) => {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        tex.anisotropy = 8;
        return tex;
      }),
    );
  }

  loadModel(url) {
    return this.#load(url, () => this.#gltf.loadAsync(url));
  }

  loadAudio(url) {
    return this.#load(url, () => this.#audio.loadAsync(url));
  }

  // --- manifest preload ---------------------------------------------------

  /**
   * Preload a manifest of { key, url, type } entries, reporting aggregate
   * progress. Resolves to a Map<key, asset>.
   * @param {{key:string,url:string,type:'texture'|'model'|'audio'}[]} manifest
   */
  async preload(manifest) {
    const out = new Map();
    let done = 0;
    const total = manifest.length;
    this.#emitProgress(0, total, 'starting');

    await Promise.all(
      manifest.map(async ({ key, url, type }) => {
        let asset;
        if (type === 'texture') asset = await this.loadTexture(url);
        else if (type === 'model') asset = await this.loadModel(url);
        else if (type === 'audio') asset = await this.loadAudio(url);
        else throw new Error(`Unknown asset type "${type}" for ${key}`);
        out.set(key, asset);
        done++;
        this.#emitProgress(done, total, key);
      }),
    );
    return out;
  }

  get(url) {
    return this.#cache.get(url);
  }

  // --- internals ----------------------------------------------------------

  #load(url, loaderFn) {
    if (this.#cache.has(url)) return Promise.resolve(this.#cache.get(url));
    if (this.#inflight.has(url)) return this.#inflight.get(url);

    const promise = loaderFn()
      .then((asset) => {
        this.#cache.set(url, asset);
        this.#inflight.delete(url);
        return asset;
      })
      .catch((err) => {
        this.#inflight.delete(url);
        throw err;
      });

    this.#inflight.set(url, promise);
    return promise;
  }

  dispose() {
    for (const asset of this.#cache.values()) asset?.dispose?.();
    this.#cache.clear();
    this.#inflight.clear();
    this.#progressHandlers.clear();
  }
}
