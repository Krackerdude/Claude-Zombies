import * as THREE from 'three';
import { buildZombieRig } from '../scenes/zombieRig.js';
import { survivorLook } from '../scenes/MenuScene.js';

/**
 * Renders a stylized 3D "head-shot" of the survivor — the same rigged character
 * from the main-menu scene — to a data URL for the HUD player portrait. It's a
 * one-shot offscreen render (its own throwaway WebGL context), so there's no
 * per-frame cost: bake the portrait once at boot and hand back a PNG.
 *
 * This is deliberately a single character (the bald survivor) for now — when a
 * real crew exists, each survivor's rig/look drops straight into this same
 * pipeline. The point here is the TECH: a genuine render of the 3D character,
 * not a hand-drawn silhouette.
 */
export function characterPortraitDataURL(w = 320, h = 392) {
  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0); // transparent — the frame's dark backing shows behind
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    const scene = new THREE.Scene();

    // the survivor rig (bald, bare-skin look — no cosmetics for the base crewman)
    const rig = buildZombieRig(survivorLook());
    const J = rig.userData.joints;
    // neutral, alive head-shot pose: arms dropped out of the tight crop, a small
    // 3/4 turn + chin settle so the face reads as a portrait, not a mugshot
    J.shoulderL.rotation.set(-0.06, 0.12, 0.12);
    J.shoulderR.rotation.set(-0.06, -0.12, -0.12);
    J.elbowL.rotation.x = 0.2; J.elbowR.rotation.x = 0.2;
    J.torso.rotation.y = 0.06;
    J.head.rotation.set(0.05, -0.22, 0.03);
    scene.add(rig);
    rig.updateMatrixWorld(true);

    // frame tight on the skull (+ a sliver of shoulders), head high in frame
    const head = new THREE.Vector3();
    J.head.getWorldPosition(head);
    head.y += 0.22; // rise to the skull centre

    const cam = new THREE.PerspectiveCamera(25, w / h, 0.1, 20);
    cam.position.set(head.x + 0.16, head.y + 0.06, head.z + 1.08); // slightly off-axis 3/4
    cam.lookAt(head.x, head.y - 0.02, head.z);

    // stylized lighting: warm key, cool rim, soft cold fill + ambient floor
    scene.add(new THREE.HemisphereLight(0x9fb6c8, 0x090d11, 0.4));
    const key = new THREE.DirectionalLight(0xffe4bc, 2.6);
    key.position.set(head.x - 0.9, head.y + 1.1, head.z + 1.2); scene.add(key);
    const rim = new THREE.DirectionalLight(0x74b4ff, 2.2);
    rim.position.set(head.x + 1.0, head.y + 0.5, head.z - 1.2); scene.add(rim);
    const fill = new THREE.DirectionalLight(0xcad8e6, 0.55);
    fill.position.set(head.x + 0.7, head.y - 0.3, head.z + 0.9); scene.add(fill);

    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/png');

    // tear the throwaway context + geometry down
    rig.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x?.dispose?.()); else m?.dispose?.();
      }
    });
    renderer.dispose();
    renderer.forceContextLoss?.();
    return url;
  } catch (err) {
    try { renderer?.dispose?.(); } catch { /* ignore */ }
    return null;
  }
}
