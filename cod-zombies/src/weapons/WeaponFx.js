import * as THREE from 'three';

/**
 * World-space shooting effects — the M1911 blueprint that every gun will reuse.
 * Everything is POOLED: meshes/sprites are created once and recycled, so firing
 * never allocates. WeaponSystem calls the spawn* methods on each shot and ticks
 * update(dt) once a frame.
 *
 * Split of responsibilities:
 *   - muzzle FLASH lives on the viewmodel (screen-locked to the gun).
 *   - here we own what happens out in the world: tracers, the brass that ejects,
 *     surface impacts (smoke + material-coloured debris + bullet holes), and the
 *     separate zombie reaction (blood spurt + splatter, no smoke, no holes).
 */

const _z = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

// ---- shared textures (built once) ----
function softTex(draw, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  draw(x, size);
  const t = new THREE.CanvasTexture(c);
  return t;
}
function smokeTexture() {
  return softTex((x, s) => {
    const r = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = r; x.fillRect(0, 0, s, s);
  });
}
function sparkTexture() {
  return softTex((x, s) => {
    const r = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,240,190,0.8)');
    r.addColorStop(1, 'rgba(255,180,80,0)');
    x.fillStyle = r; x.fillRect(0, 0, s, s);
  });
}
function bloodTexture() {
  return softTex((x, s) => {
    x.clearRect(0, 0, s, s);
    for (let i = 0; i < 7; i++) {
      const px = s / 2 + (Math.random() - 0.5) * s * 0.5;
      const py = s / 2 + (Math.random() - 0.5) * s * 0.5;
      const rad = s * (0.08 + Math.random() * 0.16);
      const r = x.createRadialGradient(px, py, 0, px, py, rad);
      r.addColorStop(0, 'rgba(120,0,4,0.95)'); r.addColorStop(1, 'rgba(80,0,2,0)');
      x.fillStyle = r; x.beginPath(); x.arc(px, py, rad, 0, 7); x.fill();
    }
  }, 64);
}
function holeTexture() {
  return softTex((x, s) => {
    x.clearRect(0, 0, s, s);
    const r = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(8,8,10,0.95)'); r.addColorStop(0.55, 'rgba(20,18,18,0.7)');
    r.addColorStop(0.8, 'rgba(40,38,38,0.25)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = r; x.fillRect(0, 0, s, s);
  });
}
// an OPAQUE, internally-shaded fireball lobe (bright centre -> dark rim, hard
// edge) so overlapping puffs read as distinct billows instead of a glow blob.
// Greyscale so it can be tinted to any fire/smoke colour per-instance.
function puffTexture() {
  return softTex((x, s) => {
    const r = x.createRadialGradient(s * 0.42, s * 0.42, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0.0, 'rgba(255,255,255,1)');
    r.addColorStop(0.4, 'rgba(232,232,232,1)');
    r.addColorStop(0.72, 'rgba(150,150,150,1)');
    r.addColorStop(0.9, 'rgba(78,78,78,0.96)');
    r.addColorStop(1.0, 'rgba(36,36,36,0)');
    x.fillStyle = r; x.beginPath(); x.arc(s / 2, s / 2, s / 2, 0, 7); x.fill();
  }, 96);
}
// sharp spiky flame tongue (additive), tinted per-instance
function flameStarTexture() {
  const s = 96, c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d'); const cx = s / 2, cy = s / 2, spikes = 8, outer = s * 0.48, inner = s * 0.19;
  x.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const rr = i % 2 ? inner : outer; const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
    i ? x.lineTo(px, py) : x.moveTo(px, py);
  }
  x.closePath();
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, outer);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,244,190,0.9)'); g.addColorStop(1, 'rgba(255,180,80,0)');
  x.fillStyle = g; x.fill();
  return new THREE.CanvasTexture(c);
}

export class WeaponFx {
  #scene;
  #pools = {};
  #parts = [];      // active particle records
  #free = [];       // recycled record objects (avoid GC)
  #tex = {};

  constructor(scene) {
    this.#scene = scene;
    this.#tex = {
      smoke: smokeTexture(), spark: sparkTexture(), blood: bloodTexture(), hole: holeTexture(),
      puff: puffTexture(), star: flameStarTexture(),
    };
    // pre-build pools of meshes/sprites
    this.#pools = {
      tracer: this.#pool(24, () => this.#mkTracer()),
      smoke: this.#pool(40, () => this.#mkSprite(this.#tex.smoke, THREE.NormalBlending)),
      spark: this.#pool(90, () => this.#mkSprite(this.#tex.spark, THREE.AdditiveBlending)),
      debris: this.#pool(48, () => this.#mkDebris()),
      blood: this.#pool(80, () => this.#mkSprite(this.#tex.blood, THREE.NormalBlending)),
      hole: this.#pool(28, () => this.#mkHole()),
      shell: this.#pool(18, () => this.#mkShell()),
      // explosions — opaque shaded fire lobes + glowing cores + flame tongues +
      // tan smoke + glowing streaks + solid destruction chunks
      puff: this.#pool(54, () => this.#mkSprite(this.#tex.puff, THREE.NormalBlending)),
      fireball: this.#pool(36, () => this.#mkSprite(this.#tex.puff, THREE.AdditiveBlending)),
      star: this.#pool(20, () => this.#mkSprite(this.#tex.star, THREE.AdditiveBlending)),
      billow: this.#pool(30, () => this.#mkSprite(this.#tex.smoke, THREE.NormalBlending)),
      comet: this.#pool(30, () => this.#mkComet()),
      chunk: this.#pool(30, () => this.#mkChunk()),
      flash: this.#pool(2, () => this.#mkLight()),
    };
    // Keep the explosion/plasma flash lights PERMANENTLY in the scene (visible,
    // intensity 0 when idle). A point light appearing for the first time changes
    // the scene's light count, which forces every material to recompile its
    // shader — the half-second freeze on the first explosion / Ray Gun shot.
    // Counting them from load means explosions only modulate intensity: no
    // recompile, no hitch. Two lights cover overlapping blasts cheaply.
    for (const s of this.#pools.flash.slots) { s.mesh.visible = true; s.mesh.intensity = 0; }
  }

  // ---- pool plumbing ----
  #pool(n, factory) {
    const slots = [];
    for (let i = 0; i < n; i++) {
      const m = factory(); m.visible = false;
      m.traverse((o) => { o.raycast = () => {}; }); // bullets must never hit our own FX
      this.#scene.add(m); slots.push({ mesh: m, busy: false });
    }
    return { slots, cur: 0 };
  }
  #take(kind) {
    const p = this.#pools[kind];
    for (let i = 0; i < p.slots.length; i++) { const s = p.slots[(p.cur + i) % p.slots.length]; if (!s.busy) { p.cur = (p.cur + i + 1) % p.slots.length; s.busy = true; return s; } }
    const s = p.slots[p.cur]; p.cur = (p.cur + 1) % p.slots.length; return s; // all busy -> steal oldest-ish
  }
  #rec(kind, slot, life, opts) {
    const r = this.#free.pop() || {};
    r.kind = kind; r.slot = slot; r.age = 0; r.life = life;
    r.vx = opts.vx || 0; r.vy = opts.vy || 0; r.vz = opts.vz || 0;
    r.grav = opts.grav || 0; r.grow = opts.grow || 0; r.spin = opts.spin || 0;
    r.s0 = opts.s0 || 1; r.o0 = opts.o0 != null ? opts.o0 : 1; r.fade = opts.fade || 'linear';
    this.#parts.push(r);
    return r;
  }

  // ---- mesh factories ----
  #mkTracer() {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    return m;
  }
  #mkSprite(tex, blending) {
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, blending });
    return new THREE.Sprite(mat);
  }
  #mkDebris() {
    return new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9, transparent: true }));
  }
  #mkChunk() {
    return new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.13), new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.95, transparent: true }));
  }
  #mkHole() {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.12),
      new THREE.MeshBasicMaterial({ map: this.#tex.hole, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    );
    return m;
  }
  #mkShell() {
    const g = new THREE.Group();
    const brass = new THREE.MeshStandardMaterial({ color: 0xc8a23a, metalness: 0.9, roughness: 0.35 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.05, 8), brass);
    body.rotation.z = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.008, 8), brass);
    rim.rotation.z = Math.PI / 2; rim.position.x = -0.026;
    g.add(body, rim);
    return g;
  }

  // ---- public spawns ----
  /** Bright streak from the muzzle to where the bullet landed. */
  spawnTracer(from, to) {
    const s = this.#take('tracer'); const m = s.mesh;
    _v.subVectors(to, from); const len = _v.length(); if (len < 0.05) { s.busy = false; return; }
    _v.normalize();
    m.position.copy(from).addScaledVector(_v, len * 0.5);
    _q.setFromUnitVectors(_z, _v); m.quaternion.copy(_q); // local +Z runs muzzle->hit
    m.scale.set(0.022, 0.022, len);                       // thin beam, length along Z
    m.material.opacity = 0.9; m.visible = true;
    this.#rec('tracer', s, 0.05, { o0: 0.9, fade: 'linear' });
  }

  /** Non-zombie surface hit: smoke + material-coloured sparks/debris + a hole. */
  spawnImpact(point, normal, color) {
    const c = color || new THREE.Color(0x9a9a9a);
    // smoke (1-2 puffs), faintly tinted toward the surface
    for (let i = 0; i < 2; i++) {
      const s = this.#take('smoke'); const m = s.mesh;
      m.material.color.copy(c).lerp(new THREE.Color(0xbfbfbf), 0.6);
      m.material.opacity = 0.5; m.position.copy(point).addScaledVector(normal, 0.04 + Math.random() * 0.05);
      m.scale.setScalar(0.12); m.visible = true;
      this.#rec('smoke', s, 0.55 + Math.random() * 0.3, { vy: 0.5 + Math.random() * 0.4, grow: 0.7, o0: 0.5, fade: 'out' });
    }
    // sparks (hot, additive) fanning off the normal
    const nsp = 5 + (Math.random() * 4 | 0);
    for (let i = 0; i < nsp; i++) {
      const s = this.#take('spark'); const m = s.mesh;
      const d = this.#hemi(normal, 0.9);
      m.material.color.setHex(0xffd27a); m.material.opacity = 1; m.scale.setScalar(0.05);
      m.position.copy(point).addScaledVector(normal, 0.02); m.visible = true;
      this.#rec('spark', s, 0.18 + Math.random() * 0.18, { vx: d.x * 3, vy: d.y * 3 + 0.5, vz: d.z * 3, grav: 6, o0: 1, fade: 'out', grow: -0.6 });
    }
    // debris chips in the surface colour
    const nd = 3 + (Math.random() * 3 | 0);
    for (let i = 0; i < nd; i++) {
      const s = this.#take('debris'); const m = s.mesh;
      m.material.color.copy(c); const d = this.#hemi(normal, 0.8);
      const sc = 0.5 + Math.random(); m.scale.setScalar(sc);
      m.position.copy(point).addScaledVector(normal, 0.02);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); m.visible = true;
      this.#rec('debris', s, 0.5 + Math.random() * 0.4, { vx: d.x * 2.4, vy: d.y * 2.4 + 1, vz: d.z * 2.4, grav: 9, spin: 12, o0: 1, fade: 'late' });
    }
    this.#spawnHole(point, normal, c);
  }

  /** Zombie hit: blood spurt + lingering splatter + a small pool. No smoke/holes. */
  spawnBlood(point, dir) {
    // spurt — a touch more, faster, bigger
    const n = 6 + (Math.random() * 3 | 0);
    for (let i = 0; i < n; i++) {
      const s = this.#take('blood'); const m = s.mesh;
      m.material.color.setHex(0x8a0008); m.material.opacity = 0.92; m.scale.setScalar(0.08 + Math.random() * 0.06);
      m.position.copy(point);
      m.visible = true;
      const sx = (Math.random() - 0.5) * 2.6, sy = Math.random() * 1.9, sz = (Math.random() - 0.5) * 2.6;
      this.#rec('blood', s, 0.3 + Math.random() * 0.18, { vx: dir.x * 1.6 + sx, vy: dir.y * 0.7 + sy + 0.2, vz: dir.z * 1.6 + sz, grav: 7.5, o0: 0.92, fade: 'out', grow: -0.3 });
    }
    // lingering splat marks right at the wound
    for (let i = 0; i < 2; i++) {
      const s = this.#take('blood'); const m = s.mesh;
      m.material.color.setHex(0x5c0006); m.material.opacity = 0.7; m.scale.setScalar(0.1 + Math.random() * 0.06);
      m.position.copy(point).add(_v.set((Math.random() - 0.5) * 0.18, (Math.random() - 0.5) * 0.18, (Math.random() - 0.5) * 0.18));
      m.visible = true;
      this.#rec('blood', s, 0.5 + Math.random() * 0.3, { vy: -0.2, grav: 1.5, o0: 0.7, fade: 'late', grow: 0.15 });
    }
    // a small bout of pooled blood at the point of impact — darker, larger, lingers
    {
      const s = this.#take('blood'); const m = s.mesh;
      m.material.color.setHex(0x3e0004); m.material.opacity = 0.78; m.scale.setScalar(0.16 + Math.random() * 0.08);
      m.position.copy(point).add(_v.set((Math.random() - 0.5) * 0.1, -0.04, (Math.random() - 0.5) * 0.1));
      m.visible = true;
      this.#rec('blood', s, 1.2 + Math.random() * 0.4, { vy: -0.25, grav: 0.8, o0: 0.78, fade: 'late', grow: 0.18 });
    }
  }

  /** At-the-muzzle effects in world space: light cartoony smoke + a few forward
   *  sparks + the ejected shell. (The bright flash itself is on the viewmodel.) */
  spawnMuzzle(pos, dir, right, up) {
    // one light, fast-rising smoke wisp
    {
      const s = this.#take('smoke'); const m = s.mesh;
      m.material.color.setHex(0xb9b6ad); m.material.opacity = 0.32;
      m.position.copy(pos).addScaledVector(dir, 0.08); m.scale.setScalar(0.1); m.visible = true;
      this.#rec('smoke', s, 0.45, { vx: dir.x * 0.6, vy: 0.7, vz: dir.z * 0.6, grow: 0.6, o0: 0.32, fade: 'out' });
    }
    // a few hot sparks spitting forward out of the barrel
    for (let i = 0; i < 4; i++) {
      const s = this.#take('spark'); const m = s.mesh;
      m.material.color.setHex(0xffe39a); m.material.opacity = 1; m.scale.setScalar(0.045);
      m.position.copy(pos).addScaledVector(dir, 0.05); m.visible = true;
      this.#rec('spark', s, 0.1 + Math.random() * 0.1, {
        vx: dir.x * 7 + (Math.random() - 0.5) * 2, vy: dir.y * 7 + (Math.random() - 0.5) * 1.5 + 0.3,
        vz: dir.z * 7 + (Math.random() - 0.5) * 2, grav: 4, o0: 1, fade: 'out', grow: -0.5,
      });
    }
    this.spawnShell(pos, right, up);
  }

  #mkComet() {
    const g = new THREE.Group();
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffc14a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    const head = this.#mkSprite(this.#tex.spark, THREE.AdditiveBlending);
    g.add(tail, head);
    return g;
  }
  #mkLight() {
    return new THREE.PointLight(0xffffff, 0, 9, 2);
  }

  /**
   * Big additive fireball + rolling dark billows + glowing-tipped streaks +
   * sparks + a light flash. Palette-driven so PHD can go purple while frag and
   * the LAW stay fiery. opts: { hot, mid, deep, smoke, light, scale }.
   */
  spawnExplosion(point, opts = {}) {
    const hot = opts.hot ?? 0xfff1c0, mid = opts.mid ?? 0xff9a1e, deep = opts.deep ?? 0xe24a06;
    const ash = opts.ash ?? 0x8a6440, smoke = opts.smoke ?? 0x241a12, lightC = opts.light ?? 0xffa040;
    const S = opts.scale ?? 1;
    const CHUNKS = [0x6b4a2e, 0x4a3320, 0x595959, 0x3a3a3a, 0x2d2622];
    const jit = (rad) => _v.set((Math.random() - 0.5) * rad, (Math.random() - 0.4) * rad, (Math.random() - 0.5) * rad);

    // 1) white-hot core flash
    {
      const s = this.#take('fireball'); const m = s.mesh;
      m.material.color.setHex(hot); m.material.opacity = 1;
      m.position.copy(point); m.scale.setScalar(1.4 * S); m.visible = true;
      this.#rec('fireball', s, 0.18, { o0: 1, fade: 'out', grow: 5 * S });
    }
    // 2) OPAQUE fireball body — distinct shaded lobes, discrete colour bands,
    //    held briefly then dissipated so it reads as a solid cartoon fireball
    const nBody = 13 + (Math.random() * 7 | 0);
    for (let i = 0; i < nBody; i++) {
      const s = this.#take('puff'); const m = s.mesh;
      const roll = Math.random();
      m.material.color.setHex(roll < 0.45 ? mid : roll < 0.8 ? deep : hot);
      m.material.opacity = 1;
      m.position.copy(point).add(jit(1.5 * S));
      m.scale.setScalar((0.9 + Math.random() * 1.0) * S);
      m.visible = true;
      this.#rec('puff', s, 0.5 + Math.random() * 0.45, { vx: (Math.random() - 0.5) * 1.2, vy: 0.4 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 1.2, grow: 1.3 * S, o0: 1, fade: 'late' });
    }
    // 3) bright inner cores (additive) punching through
    const nHot = 5 + (Math.random() * 3 | 0);
    for (let i = 0; i < nHot; i++) {
      const s = this.#take('fireball'); const m = s.mesh;
      m.material.color.setHex(Math.random() < 0.5 ? hot : mid); m.material.opacity = 0.95;
      m.position.copy(point).add(jit(0.7 * S));
      m.scale.setScalar((0.6 + Math.random() * 0.7) * S); m.visible = true;
      this.#rec('fireball', s, 0.26 + Math.random() * 0.2, { vy: 0.4 + Math.random() * 0.6, grow: 1.6 * S, o0: 0.95, fade: 'out' });
    }
    // 4) sharp flame tongues licking out
    const nStar = 5 + (Math.random() * 4 | 0);
    for (let i = 0; i < nStar; i++) {
      const s = this.#take('star'); const m = s.mesh;
      const a = Math.random() * Math.PI * 2, rad = (0.4 + Math.random() * 0.7) * S;
      m.material.color.setHex(Math.random() < 0.6 ? hot : mid); m.material.opacity = 1;
      m.position.copy(point).add(_v.set(Math.cos(a) * rad, (Math.random() - 0.2) * rad, Math.sin(a) * rad));
      m.scale.setScalar((0.5 + Math.random() * 0.6) * S); m.visible = true;
      m.material.rotation = Math.random() * 6;
      this.#rec('star', s, 0.18 + Math.random() * 0.14, { vy: 0.6, grow: 1.2 * S, o0: 1, fade: 'out' });
    }
    // 5) tan, lit outer smoke billows that roll out + up
    const nAsh = 6 + (Math.random() * 4 | 0);
    for (let i = 0; i < nAsh; i++) {
      const s = this.#take('puff'); const m = s.mesh;
      m.material.color.setHex(Math.random() < 0.5 ? ash : deep); m.material.opacity = 0.9;
      const a = Math.random() * Math.PI * 2, rad = (0.8 + Math.random() * 0.9) * S;
      m.position.copy(point).add(_v.set(Math.cos(a) * rad, (0.2 + Math.random() * 1.0) * S, Math.sin(a) * rad));
      m.scale.setScalar((1.0 + Math.random() * 0.9) * S); m.visible = true;
      this.#rec('puff', s, 0.9 + Math.random() * 0.6, { vy: 0.5 + Math.random() * 0.7, grow: 1.5 * S, o0: 0.9, fade: 'late' });
    }
    // 6) dark rising smoke aftermath
    const nSmoke = 4 + (Math.random() * 3 | 0);
    for (let i = 0; i < nSmoke; i++) {
      const s = this.#take('billow'); const m = s.mesh;
      m.material.color.setHex(smoke); m.material.opacity = 0.5;
      m.position.copy(point).add(_v.set((Math.random() - 0.5) * 1.4 * S, (0.6 + Math.random() * 1.1) * S, (Math.random() - 0.5) * 1.4 * S));
      m.scale.setScalar((1.0 + Math.random() * 0.8) * S); m.visible = true;
      this.#rec('billow', s, 1.3 + Math.random() * 0.8, { vy: 0.8 + Math.random() * 0.7, grow: 1.4 * S, o0: 0.5, fade: 'late' });
    }
    // 7) glowing-tipped streaks fired radially outward
    const nc = 11 + (Math.random() * 6 | 0);
    for (let i = 0; i < nc; i++) {
      const s = this.#take('comet'); const m = s.mesh;
      const a = Math.random() * Math.PI * 2, up = 0.2 + Math.random() * 1.3;
      _v.set(Math.cos(a), up, Math.sin(a)).normalize();
      const spd = (8 + Math.random() * 9) * S;
      m.position.copy(point); m.visible = true;
      const tail = m.children[0], head = m.children[1];
      const col = Math.random() < 0.5 ? hot : mid;
      tail.material.color.setHex(col); tail.material.opacity = 1;
      head.material.color.setHex(col); head.material.opacity = 1;
      this.#rec('comet', s, 0.55 + Math.random() * 0.5, {
        vx: _v.x * spd, vy: _v.y * spd, vz: _v.z * spd, grav: 10, o0: 1,
        tailLen: (0.6 + Math.random() * 0.7) * S, thick: 0.05 * S, headScale: (0.12 + Math.random() * 0.08) * S,
      });
    }
    // 8) DESTRUCTION — solid chunks blown out, tumbling, with gravity
    const nk = 9 + (Math.random() * 7 | 0);
    for (let i = 0; i < nk; i++) {
      const s = this.#take('chunk'); const m = s.mesh;
      m.material.color.setHex(CHUNKS[Math.random() * CHUNKS.length | 0]); m.material.opacity = 1;
      const a = Math.random() * Math.PI * 2, up = 0.3 + Math.random() * 1.4;
      _v.set(Math.cos(a), up, Math.sin(a)).normalize();
      const spd = (6 + Math.random() * 9) * S, sc = (0.7 + Math.random() * 1.6);
      m.scale.set(sc * (0.6 + Math.random()), sc * (0.6 + Math.random()), sc * (0.6 + Math.random()));
      m.position.copy(point).addScaledVector(_v, 0.2);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); m.visible = true;
      this.#rec('chunk', s, 0.9 + Math.random() * 0.7, { vx: _v.x * spd, vy: _v.y * spd + 1.5, vz: _v.z * spd, grav: 13, spin: 12 + Math.random() * 10, o0: 1, fade: 'late' });
    }
    // 9) sparks
    const ns = 18 + (Math.random() * 10 | 0);
    for (let i = 0; i < ns; i++) {
      const s = this.#take('spark'); const m = s.mesh;
      const a = Math.random() * Math.PI * 2, up = Math.random() * 1.5;
      _v.set(Math.cos(a), up, Math.sin(a)).normalize();
      const spd = (6 + Math.random() * 9) * S;
      m.material.color.setHex(hot); m.material.opacity = 1; m.scale.setScalar(0.06 * S + 0.03);
      m.position.copy(point); m.visible = true;
      this.#rec('spark', s, 0.3 + Math.random() * 0.35, { vx: _v.x * spd, vy: _v.y * spd + 1, vz: _v.z * spd, grav: 9, o0: 1, fade: 'out', grow: -0.4 });
    }
    // 10) light flash
    {
      const s = this.#take('flash'); const L = s.mesh;
      L.color.setHex(lightC); L.position.copy(point).add(_v.set(0, 0.6 * S, 0));
      L.distance = 12 * S; L.intensity = 14 * S; L.visible = true;
      this.#rec('flash', s, 0.38, { o0: 14 * S });
    }
  }

  /**
   * Coloured radial plasma burst for energy hits (Ray Gun). No fire, smoke,
   * debris or shake — a white core, an expanding tinted glow, a spherical spark
   * spray and a coloured light pop, all in the bolt's energy colour.
   */
  spawnPlasma(point, color) {
    const col = new THREE.Color(color);
    const lightHex = col.clone().lerp(new THREE.Color(0xffffff), 0.5).getHex();
    // white-hot core
    {
      const s = this.#take('fireball'); const m = s.mesh;
      m.material.color.setHex(0xffffff); m.material.opacity = 1;
      m.position.copy(point); m.scale.setScalar(0.7); m.visible = true;
      this.#rec('fireball', s, 0.16, { o0: 1, fade: 'out', grow: 6 });
    }
    // expanding tinted glow lobes
    for (let i = 0; i < 8; i++) {
      const s = this.#take('fireball'); const m = s.mesh;
      m.material.color.copy(col); m.material.opacity = 0.95;
      const a = Math.random() * Math.PI * 2, rad = 0.15 + Math.random() * 0.5;
      m.position.copy(point).add(_v.set(Math.cos(a) * rad, (Math.random() - 0.4) * rad, Math.sin(a) * rad));
      m.scale.setScalar(0.5 + Math.random() * 0.7); m.visible = true;
      this.#rec('fireball', s, 0.3 + Math.random() * 0.22, { o0: 0.9, fade: 'out', grow: 2.6 });
    }
    // spherical spark spray (all directions)
    for (let i = 0; i < 24; i++) {
      const s = this.#take('spark'); const m = s.mesh;
      const a = Math.random() * Math.PI * 2, z = Math.random() * 2 - 1, r = Math.sqrt(1 - z * z);
      const spd = 5 + Math.random() * 7;
      m.material.color.copy(col); m.material.opacity = 1; m.scale.setScalar(0.07);
      m.position.copy(point); m.visible = true;
      this.#rec('spark', s, 0.22 + Math.random() * 0.24, { vx: Math.cos(a) * r * spd, vy: z * spd, vz: Math.sin(a) * r * spd, grav: 2.5, o0: 1, fade: 'out', grow: -0.5 });
    }
    // a few flame tendrils licking out, tinted
    for (let i = 0; i < 5; i++) {
      const s = this.#take('star'); const m = s.mesh;
      m.material.color.copy(col); m.material.opacity = 1; m.material.rotation = Math.random() * 6;
      const a = Math.random() * Math.PI * 2, rad = 0.25 + Math.random() * 0.45;
      m.position.copy(point).add(_v.set(Math.cos(a) * rad, (Math.random() - 0.2) * rad, Math.sin(a) * rad));
      m.scale.setScalar(0.45 + Math.random() * 0.5); m.visible = true;
      this.#rec('star', s, 0.2 + Math.random() * 0.14, { o0: 1, fade: 'out', grow: 1.4 });
    }
    // coloured light pop
    {
      const s = this.#take('flash'); const L = s.mesh;
      L.color.setHex(lightHex); L.position.copy(point).add(_v.set(0, 0.3, 0));
      L.distance = 7; L.intensity = 8; L.visible = true;
      this.#rec('flash', s, 0.26, { o0: 8 });
    }
  }

  /** Brass casing tossed from the ejection port. */
  spawnShell(pos, right, up) {
    const s = this.#take('shell'); const m = s.mesh;
    m.position.copy(pos); m.visible = true;
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    this.#rec('shell', s, 1.1, {
      vx: right.x * 2.2 + up.x * 1.2 + (Math.random() - 0.5),
      vy: right.y * 2.2 + up.y * 1.6 + 1.4,
      vz: right.z * 2.2 + up.z * 1.2 + (Math.random() - 0.5),
      grav: 9.5, spin: 18, o0: 1, fade: 'late', s0: 1,
    });
  }

  #spawnHole(point, normal, color) {
    const s = this.#take('hole'); const m = s.mesh;
    m.position.copy(point).addScaledVector(normal, 0.012);
    _v.copy(normal); m.quaternion.setFromUnitVectors(_z, _v.lengthSq() < 1e-6 ? _z : _v.normalize());
    // dark, faintly tinted toward the surface it bit into
    m.material.color.copy(color || _v.set(0.6, 0.6, 0.6)).multiplyScalar(0.28);
    m.material.opacity = 0.9;
    m.scale.setScalar(0.7 + Math.random() * 0.5); m.visible = true;
    // holes linger a few seconds then fade out, then the slot frees itself
    this.#rec('hole', s, 6 + Math.random() * 2, { o0: 0.9, fade: 'late' });
  }

  #hemi(normal, spread) {
    // random direction biased to the surface normal hemisphere
    const x = (Math.random() - 0.5) * 2, y = (Math.random() - 0.5) * 2, z = (Math.random() - 0.5) * 2;
    _v.set(x, y, z).normalize().lerp(normal, 1 - spread).normalize();
    if (_v.dot(normal) < 0) _v.addScaledVector(normal, -2 * _v.dot(normal));
    return { x: _v.x, y: _v.y, z: _v.z };
  }

  // ---- per-frame tick ----
  update(dt) {
    for (let i = this.#parts.length - 1; i >= 0; i--) {
      const r = this.#parts[i]; r.age += dt; const t = r.age / r.life;
      if (t >= 1) {
        // flash lights stay in the scene (intensity 0) so the light count never
        // changes; everything else hides on expiry.
        if (r.kind === 'flash') r.slot.mesh.intensity = 0; else r.slot.mesh.visible = false;
        r.slot.busy = false; this.#parts.splice(i, 1); this.#free.push(r); continue;
      }
      const m = r.slot.mesh;

      // light flash: quick quadratic falloff of intensity
      if (r.kind === 'flash') { m.intensity = r.o0 * (1 - t) * (1 - t); continue; }

      // comet streak: integrate, orient the tail along travel, fade head+tail
      if (r.kind === 'comet') {
        m.position.x += r.vx * dt; m.position.y += r.vy * dt; m.position.z += r.vz * dt; r.vy -= r.grav * dt;
        _v.set(r.vx, r.vy, r.vz); const sp = _v.length();
        const tail = m.children[0], head = m.children[1];
        if (sp > 0.01) {
          _v.multiplyScalar(1 / sp);
          _q.setFromUnitVectors(_z, _v); tail.quaternion.copy(_q);
          tail.scale.set(r.thick, r.thick, r.tailLen);
          tail.position.set(-_v.x * r.tailLen * 0.5, -_v.y * r.tailLen * 0.5, -_v.z * r.tailLen * 0.5);
        }
        head.scale.set(r.headScale, r.headScale, 1);
        const o = r.o0 * Math.min(1, (1 - t) * 1.8);
        tail.material.opacity = o * 0.9; head.material.opacity = o;
        continue;
      }
      // integrate motion
      if (r.vx || r.vy || r.vz || r.grav) {
        r.vy -= r.grav * dt;
        m.position.x += r.vx * dt; m.position.y += r.vy * dt; m.position.z += r.vz * dt;
      }
      if (r.spin) { m.rotation.x += r.spin * dt; m.rotation.z += r.spin * 0.7 * dt; }
      if (r.grow) { const sc = Math.max(0.01, (m.scale.x) + r.grow * dt); if (m.isSprite) m.scale.set(sc, sc, 1); }
      // fade curve
      let o = r.o0;
      if (r.fade === 'out') o = r.o0 * (1 - t);
      else if (r.fade === 'late') o = r.o0 * Math.min(1, (1 - t) * 2.2); // hold, then fade tail
      else o = r.o0 * (1 - t);
      if (m.material) m.material.opacity = o;
    }
  }
}
