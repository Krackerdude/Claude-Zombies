import { Engine } from './core/Engine.js';
import { Service } from './core/ServiceLocator.js';
import { buildArena } from './scenes/ArenaScene.js';
import { PlayerTag, Transform } from './ecs/components/index.js';
import { UIManager } from './ui/UIManager.js';
import { perkIconDataURL } from './perks/perks.js';
import './ui/menu.css';

/**
 * Application bootstrap. This is the only place that touches the DOM chrome
 * (loader, HUD). It builds the Engine, loads the sandbox scene, and starts the
 * loop. Engine internals never reach back into the page.
 */
async function main() {
  const canvas = document.getElementById('game-canvas');
  const loader = document.getElementById('loader');
  const bar = document.getElementById('loader-bar');
  const status = document.getElementById('loader-status');
  const debug = document.getElementById('debug');
  const hint = document.getElementById('hint');

  const setStatus = (text, ratio = 0) => {
    status.textContent = text;
    bar.style.width = `${Math.round(ratio * 100)}%`;
  };

  try {
    setStatus('booting renderer + physics…', 0.15);
    const engine = await Engine.create(canvas);

    setStatus(`backend: ${engine.services.get(Service.Render).backend} · building world…`, 0.6);

    // AssetManager progress would feed the bar here for real manifests.
    engine.services.get(Service.Assets).onProgress(({ ratio, label }) =>
      setStatus(`loading ${label}…`, 0.6 + ratio * 0.4),
    );

    buildArena(engine);

    // --- gameplay HUD wiring (round / health / points) ---
    const events = engine.services.get(Service.Events);
    const elRound = document.getElementById('hud-round');
    const elRoundSub = document.getElementById('hud-round-sub');
    const elZombies = document.getElementById('hud-zombies');
    const elHealthFill = document.getElementById('hud-health-fill');
    const elPoints = document.getElementById('hud-points');
    const elBanner = document.getElementById('hud-banner');

    const banner = (text) => {
      if (!elBanner) return;
      elBanner.textContent = text;
      elBanner.classList.remove('show');
      void elBanner.offsetWidth;
      elBanner.classList.add('show');
    };

    events.on('round:changed', ({ round, state, count }) => {
      if (state === 'active') {
        if (elRound) elRound.textContent = String(round);
        if (elRoundSub) elRoundSub.textContent = 'ROUND';
        banner(round === 1 ? 'THE DEAD RISE' : `ROUND ${round}`);
        if (elZombies) elZombies.textContent = `${count} INBOUND`;
      }
    });
    events.on('round:cleared', () => { if (elRoundSub) elRoundSub.textContent = 'CLEARED'; });
    events.on('zombies:changed', ({ remaining }) => {
      if (elZombies) elZombies.textContent = `${remaining} LEFT`;
    });
    events.on('player:health', ({ health, max }) => {
      if (elHealthFill) elHealthFill.style.width = `${Math.max(0, (health / max) * 100)}%`;
    });
    events.on('score:changed', ({ points }) => { if (elPoints) elPoints.textContent = points.toLocaleString(); });
    events.on('player:down', () => banner('YOU DIED'));

    // --- weapon HUD wiring ---
    const elWName = document.querySelector('#hud-weapon .wname');
    const elWCat = document.querySelector('#hud-weapon .wcat');
    const elAmmo = document.getElementById('hud-ammo');
    const elMag = document.querySelector('#hud-ammo .mag');
    const elRes = document.querySelector('#hud-ammo .res');
    const elHit = document.getElementById('hitmarker');
    const elScope = document.getElementById('scope');
    const elCross = document.getElementById('crosshair');

    const elReloadPrompt = document.getElementById('reload-prompt');
    const setAmmo = (mag, reserve, reloading) => {
      if (elMag) elMag.textContent = mag;
      if (elRes) elRes.textContent = ` / ${reserve}`;
      if (elAmmo) {
        elAmmo.classList.toggle('low', typeof mag === 'number' && mag <= 5);
        elAmmo.classList.toggle('reloading', !!reloading);
      }
      // "[R] Reload" prompt when the current magazine is empty but reserves remain
      const hasReserve = reserve === '∞' || (typeof reserve === 'number' && reserve > 0);
      if (elReloadPrompt) elReloadPrompt.classList.toggle('show', mag === 0 && !reloading && hasReserve);
    };
    events.on('weapon:changed', ({ name, category, mag, reserve }) => {
      if (elWName) elWName.textContent = name;
      if (elWCat) elWCat.textContent = category;
      setAmmo(mag, reserve === Infinity ? '∞' : reserve, false);
    });
    events.on('weapon:ammo', ({ mag, reserve, reloading }) => setAmmo(mag, reserve, reloading));
    events.on('weapon:hit', ({ killed }) => {
      if (!elHit) return;
      elHit.classList.remove('show', 'kill');
      void elHit.offsetWidth;
      elHit.classList.add('show');
      if (killed) elHit.classList.add('kill');
    });
    events.on('weapon:ads', ({ scoped }) => {
      if (elScope) elScope.classList.toggle('show', !!scoped);
      if (elCross) elCross.classList.toggle('hidden', !!scoped);
    });

    // circular reload progress indicator
    const elRing = document.getElementById('reload-ring');
    const elRingFg = document.querySelector('#reload-ring .ring-fg');
    const RING_C = 2 * Math.PI * 16;
    events.on('weapon:reload', ({ active, progress }) => {
      if (elRing) elRing.classList.toggle('active', !!active);
      if (elRingFg) elRingFg.style.strokeDashoffset = String(RING_C * (1 - Math.max(0, Math.min(1, progress))));
    });

    // --- interaction prompt + economy feedback ---
    const elPrompt = document.getElementById('prompt');
    events.on('prompt:show', ({ text, affordable }) => {
      if (!elPrompt) return;
      elPrompt.textContent = text;
      elPrompt.classList.add('show');
      elPrompt.classList.toggle('denied', !affordable);
    });
    events.on('prompt:hide', () => { if (elPrompt) elPrompt.classList.remove('show'); });

    // --- power-ups: bombastic announce + compact active-timer chips + fx ---
    const elAnnounce = document.getElementById('powerup-announce');
    const elPU = document.getElementById('hud-powerups');
    const elFlash = document.getElementById('fx-flash');
    const elBlood = document.getElementById('fx-blood');
    const elApp = document.getElementById('app');
    const PU_ICON = { doublePoints: '2X', instaKill: 'IK', zombieBlood: 'ZB' };
    const puChips = new Map();
    const announce = (text) => {
      if (!elAnnounce) return;
      elAnnounce.textContent = text;
      elAnnounce.classList.remove('show'); void elAnnounce.offsetWidth; elAnnounce.classList.add('show');
    };
    events.on('powerup:pickup', ({ name }) => announce(name));
    events.on('powerup:active', ({ type, duration }) => {
      let chip = puChips.get(type);
      if (!chip && elPU) {
        const el = document.createElement('div');
        el.className = 'pu-chip';
        el.innerHTML = `<div class="pu-time"></div><div class="pu-bar"><i></i></div><div class="pu-icon">${PU_ICON[type] || '★'}</div>`;
        elPU.appendChild(el);
        chip = { el, time: el.querySelector('.pu-time'), bar: el.querySelector('.pu-bar > i') };
        puChips.set(type, chip);
      }
      if (chip) { chip.remaining = duration; chip.duration = duration; }
    });
    events.on('powerup:expire', ({ type }) => {
      const chip = puChips.get(type);
      if (chip) { chip.el.remove(); puChips.delete(type); }
    });
    setInterval(() => {
      for (const chip of puChips.values()) {
        chip.remaining = Math.max(0, chip.remaining - 0.1);
        chip.time.textContent = `${Math.ceil(chip.remaining)}s`;
        chip.bar.style.width = `${(chip.remaining / chip.duration) * 100}%`;
      }
    }, 100);
    const flash = (el, cls) => { if (el) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); } };
    events.on('fx:flash', () => flash(elFlash, 'show'));
    events.on('fx:shake', () => flash(elApp, 'shake'));
    events.on('fx:zombieblood', ({ on }) => { if (elBlood) elBlood.classList.toggle('show', !!on); });
    const elLethal = document.getElementById('hud-lethal-count');
    events.on('lethal:count', ({ count }) => { if (elLethal) elLethal.textContent = count; });

    // low health: blood creeps in from the corners + the world desaturates,
    // building below 50% and clearing as health regenerates
    const elLowHp = document.getElementById('lowhp-overlay');
    const elCanvas = document.getElementById('game-canvas');
    events.on('player:health', ({ health, max }) => {
      const ratio = max > 0 ? health / max : 1;
      const intensity = ratio < 0.5 ? (0.5 - ratio) / 0.5 : 0;
      if (elLowHp) elLowHp.style.opacity = intensity;
      if (elCanvas && !elApp.classList.contains('downed')) {
        elCanvas.style.filter = intensity > 0 ? `grayscale(${(intensity * 0.55).toFixed(2)}) brightness(${(1 - intensity * 0.12).toFixed(2)})` : '';
      }
    });

    // perks: colored chips that build up as you buy them
    const elPerks = document.getElementById('hud-perks');
    const perkChips = new Map();
    events.on('perk:gained', ({ id, name, color }) => {
      if (!elPerks || perkChips.has(id)) return;
      const chip = document.createElement('div');
      chip.className = 'perk-chip';
      chip.style.backgroundColor = '#' + color.toString(16).padStart(6, '0');
      // show the perk's actual emblem (matches the machine); fall back to initials
      const url = perkIconDataURL(id);
      if (url) {
        chip.style.backgroundImage = `url(${url})`;
        chip.style.backgroundSize = '82%';
        chip.style.backgroundRepeat = 'no-repeat';
        chip.style.backgroundPosition = 'center';
      } else {
        chip.textContent = name.split(' ').map((w) => w[0]).join('').slice(0, 3);
      }
      elPerks.appendChild(chip);
      perkChips.set(id, chip);
    });
    events.on('perks:reset', () => { perkChips.forEach((c) => c.remove()); perkChips.clear(); });

    // a brand-new run hard-wipes the death banner + all damage visuals,
    // deterministically (independent of state-change ordering)
    events.on('run:reset', () => {
      if (elBanner) { elBanner.classList.remove('show'); elBanner.textContent = ''; }
      if (elLowHp) elLowHp.style.opacity = 0;
      if (elCanvas) elCanvas.style.filter = '';
      if (elApp) elApp.classList.remove('downed');
      const od = document.getElementById('downed-overlay');
      if (od) od.classList.remove('show');
    });

    // any state change wipes the death banner + damage/death visuals so a new
    // run never starts looking (or behaving) like you're still dead
    events.on('state:change', ({ state }) => {
      if (elBanner) { elBanner.classList.remove('show'); elBanner.textContent = ''; }
      if (elLowHp) elLowHp.style.opacity = 0;
      if (elCanvas) elCanvas.style.filter = '';
      if (elApp) elApp.classList.remove('downed');
      const od = document.getElementById('downed-overlay');
      if (od) od.classList.remove('show');
    });

    // downed: desaturate the world + a slowly rotating, reddening vignette
    const elDowned = document.getElementById('downed-overlay');
    events.on('fx:downed', ({ on }) => {
      if (elApp) elApp.classList.toggle('downed', !!on);
      if (elDowned) elDowned.classList.toggle('show', !!on);
    });

    // Build menus first (subscribes to FX events + sets initial vars), then
    // push all settings into the live engine.
    const ui = new UIManager(engine);
    engine.services.get(Service.Settings).applyAll();
    setStatus('ready', 1);

    // Re-lock on click only while actually playing (e.g. after an accidental
    // unlock); the menu handles lock on Play/Resume.
    const input = engine.services.get(Service.Input);
    const gameState = engine.services.get(Service.GameState);
    canvas.addEventListener('click', () => {
      if (gameState.isPlaying && !input.pointerLocked) input.requestPointerLock();
    });

    engine.start();

    // Fade out the loader once the first frame is up.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => loader.classList.add('hidden'));
    });

    // --- debug HUD ---
    const render = engine.services.get(Service.Render);
    let acc = 0;
    let frames = 0;
    let fps = 0;
    setInterval(() => {
      const time = engine.services.get(Service.Time);
      const world = engine.world;
      const pid = world.first(PlayerTag, Transform);
      const tag = pid !== undefined ? world.get(pid, PlayerTag) : null;
      const t = pid !== undefined ? world.get(pid, Transform) : null;
      fps = Math.round(frames / (acc || 1));
      acc = 0; frames = 0;

      debug.textContent = [
        `NECROPOLIS · engine sandbox`,
        `backend   ${render.backend}`,
        `fps       ${fps}`,
        tag ? `state     ${tag.state} (${tag.stance})` : '',
        tag ? `speed     ${Math.hypot(tag.velocity.x, tag.velocity.z).toFixed(2)} m/s` : '',
        tag ? `grounded  ${tag.grounded}` : '',
        t ? `pos       ${t.position.x.toFixed(1)}, ${t.position.y.toFixed(1)}, ${t.position.z.toFixed(1)}` : '',
        input.pointerLocked ? `cursor    locked` : `cursor    free (click to lock)`,
      ].filter(Boolean).join('\n');
    }, 500);

    // Count frames for the fps readout.
    const time = engine.services.get(Service.Time);
    let last = time.frameCount;
    setInterval(() => {
      frames += time.frameCount - last;
      last = time.frameCount;
      acc += 0.1;
    }, 100);

    document.addEventListener('pointerlockchange', () => {
      hint.classList.toggle('hidden', input.pointerLocked);
    });

    // Expose for console poking during development.
    window.__engine = engine;
    window.__ui = ui;
  } catch (err) {
    console.error(err);
    setStatus(`error: ${err.message}`, 0);
  }
}

main();
