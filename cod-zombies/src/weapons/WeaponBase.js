/**
 * The behavior half of a weapon. Owns runtime state (ammo, cooldown, reload,
 * recoil index, ADS progress) and the fire/reload/aim state machine. It stays
 * presentation-agnostic: actual hits, projectiles, and effects are delegated to
 * the `ctx` the WeaponSystem passes into update(), so the same base drives a
 * pistol or a rocket launcher. Subclasses override onFire() (and occasionally
 * the reload) for category-specific behavior; wonder weapons override more.
 */
export class WeaponBase {
  constructor(data) {
    this.data = data;
    this.magazine = data.magazineSize;
    this.reserve = data.infiniteReserve ? Infinity : data.ammoStockSize;

    this.cooldown = 0; // time until next shot allowed
    this.reloading = false;
    this.reloadTimer = 0;
    this.shellTimer = 0; // perShell pacing

    this.recoilIndex = 0;
    this.burstLeft = 0;
    this._fireLatch = false; // for semi/burst edge handling

    this.aiming = false;
    this.adsProgress = 0; // 0 hip .. 1 fully aimed
    this.justFired = 0; // counts down, drives muzzle flash / kick visuals
  }

  get name() { return this.data.name; }
  get scoped() { return this.data.scoped && this.adsProgress > 0.6; }
  get magText() { return `${this.magazine} / ${this.reserve === Infinity ? '∞' : this.reserve}`; }

  /** 0..1 progress of the current reload action (per-shell sweeps repeat). */
  get reloadProgress() {
    if (!this.reloading) return 0;
    if (this.data.reloadType === 'perShell') return 1 - this.shellTimer / this.data.shellReloadTime;
    return 1 - this.reloadTimer / this.data.reloadTime;
  }

  /** Per-frame brain. ctx = { fireHeld, firePressed, reloadPressed, aiming, weaponCtx... }. */
  update(dt, ctx) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.justFired > 0) this.justFired -= dt;

    // aim down sights
    this.aiming = ctx.aiming;
    const target = this.aiming ? 1 : 0;
    const k = Math.min(1, dt / Math.max(0.001, this.data.adsTime));
    this.adsProgress += (target - this.adsProgress) * k;

    if (this.reloading) {
      this.#tickReload(dt, ctx);
    } else {
      this.#tickFire(dt, ctx);
      if (ctx.reloadPressed) this.startReload();
      else if (this.magazine === 0 && this.#hasReserve()) this.startReload();
    }
  }

  #tickFire(dt, ctx) {
    const mode = this.data.fireMode;
    if (mode === 'auto') {
      if (ctx.fireHeld) this.#tryFire(ctx);
    } else if (mode === 'burst') {
      // Fire the rounds of an in-flight burst (paced by cooldown). While a burst
      // is running we accept NO new input, so rapid clicks can't queue bursts or
      // dump the mag.
      if (this.burstLeft > 0) {
        if (this.#tryFire(ctx)) this.burstLeft--;
      } else if (ctx.firePressed && !this._fireLatch) {
        // start a fresh burst only on a new press after a full release
        this._fireLatch = true;
        this.burstLeft = this.data.burstCount;
        if (this.#tryFire(ctx)) this.burstLeft--;
      }
      // re-arm only once the trigger is released AND the burst has finished —
      // a click held/buffered during the burst won't start the next one
      if (!ctx.fireHeld && this.burstLeft <= 0) this._fireLatch = false;
    } else { // semi | pump
      if (ctx.firePressed && !this._fireLatch) { this._fireLatch = true; this.#tryFire(ctx); }
      if (!ctx.fireHeld) this._fireLatch = false;
    }
  }

  #tryFire(ctx) {
    if (this.cooldown > 0 || this.magazine <= 0 || this.reloading) {
      if (this.magazine <= 0) ctx.dryFire?.();
      return false;
    }
    this.magazine--;
    const frm = this.data.fireMode === 'auto' ? (ctx.fireRateMul || 1) : 1; // Double Tap (auto only)
    this.cooldown = 60 / this.data.fireRate / frm;
    this.justFired = 0.06;
    this.#applyRecoil(ctx);
    this.onFire(ctx);
    ctx.emitAmmo(this);
    return true;
  }

  /** Default: hitscan (one ray, or pellets handled by subclass). */
  onFire(ctx) {
    ctx.fireHitscan(this, 1, this.currentSpread(), { penetrate: this.data.penetrate });
  }

  currentSpread() {
    const a = this.adsProgress;
    return this.data.spread * (1 - a) + this.data.adsSpread * a;
  }

  #applyRecoil(ctx) {
    let p, y;
    const pat = this.data.recoilPattern;
    if (pat && pat.length) {
      const step = pat[Math.min(this.recoilIndex, pat.length - 1)];
      p = step[0]; y = step[1];
    } else {
      p = this.data.recoilPitch;
      y = this.data.recoilYaw * (Math.random() * 2 - 1);
    }
    // aiming tightens recoil
    const scale = 1 - 0.35 * this.adsProgress;
    ctx.addRecoil(p * scale, y * scale);
    this.recoilIndex++;
  }

  // --- reload ------------------------------------------------------------

  startReload() {
    if (this.reloading || this.data.reloadType === 'none') return;
    if (this.magazine >= this.data.magazineSize || !this.#hasReserve()) return;
    this.reloading = true;
    this.recoilIndex = 0;
    if (this.data.reloadType === 'perShell') this.shellTimer = this.data.shellReloadTime;
    else this.reloadTimer = this.data.reloadTime;
  }

  #tickReload(dt, ctx) {
    dt *= (ctx.reloadMul || 1); // Speed Cola: faster reloads
    // a fire input cancels a per-shell reload (classic shotgun behavior)
    if (this.data.reloadType === 'perShell' && ctx.firePressed && this.magazine > 0) {
      this.reloading = false;
      return;
    }
    if (this.data.reloadType === 'perShell') {
      this.shellTimer -= dt;
      if (this.shellTimer <= 0) {
        this.#loadOne();
        ctx.emitAmmo(this);
        if (this.magazine >= this.data.magazineSize || !this.#hasReserve()) this.reloading = false;
        else this.shellTimer = this.data.shellReloadTime;
      }
    } else {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) { this.#finishMagReload(); ctx.emitAmmo(this); }
    }
  }

  #finishMagReload() {
    const need = this.data.magazineSize - this.magazine;
    const take = this.reserve === Infinity ? need : Math.min(need, this.reserve);
    this.magazine += take;
    if (this.reserve !== Infinity) this.reserve -= take;
    this.reloading = false;
  }

  #loadOne() {
    this.magazine++;
    if (this.reserve !== Infinity) this.reserve--;
  }

  #hasReserve() { return this.reserve === Infinity || this.reserve > 0; }

  /** Reserve top-up (ammo pickups / max-ammo). */
  refill() {
    if (this.reserve !== Infinity) this.reserve = this.data.ammoStockSize;
    this.magazine = this.data.magazineSize;
  }
}
