# Project Necropolis — Engine Foundation

First-person zombies-survival game. **This drop is the engine layer only** — the
frameworks the rest of the game is built on. It boots into a playable sandbox
(walk + look + jump on a physics arena with dynamic crates) that exercises every
system end-to-end.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle in dist/
```

Click the canvas to lock the cursor. **WASD** move · **Shift** sprint · **Space**
jump · **Esc** release cursor. A debug overlay (top-left) shows backend, FPS,
grounded state, and position.

## What's implemented this phase

| Area | Module(s) |
|---|---|
| Renderer (WebGPU → WebGL fallback) | `rendering/RenderManager.js` |
| Scene management | `rendering/SceneManager.js`, `rendering/RenderSystem.js` |
| Fixed-timestep game loop | `core/GameLoop.js`, `core/Time.js` |
| Entity/Component/System | `ecs/World.js`, `ecs/System.js`, `ecs/components/` |
| Input (raw + remappable actions) | `input/InputManager.js`, `input/InputActions.js` |
| Camera controller (FPS look) | `camera/CameraController.js` |
| Player controller (kinematic) | `player/PlayerSystem.js` |
| Physics abstraction (Rapier) | `physics/PhysicsManager.js`, `physics/PhysicsSystem.js` |
| Asset pipeline (GLTF/tex/audio) | `assets/AssetManager.js` |
| Composition root / DI | `core/Engine.js`, `core/ServiceLocator.js` |

## Movement (this drop)

A full BO3-flavoured first-person moveset built on a velocity +
acceleration/friction model (Quake/Source lineage). The "weight" is physical —
it comes from acceleration ramps and friction, not from locking inputs. **No
transition is gated on a key release**; every state is re-evaluated from current
intent each fixed tick, so actions compose freely.

| Mechanic | How |
|---|---|
| Walk / sprint | WASD, hold Shift (sprint needs forward intent) |
| Crouch | hold Ctrl/C — eases height, slows you |
| Prone | tap X — toggles up to crouch on tap |
| Jump | Space — with **coyote time** + **jump buffering** so presses never drop |
| Slide | sprint + tap crouch — speed burst that decays; steerable |
| Slide cancel | **jump** mid-slide (momentum carries into the air) or **release crouch** after a short commit window (momentum carries into sprint/walk) |
| Slide chaining | slide → jump → land-while-crouched re-slides; bounded by `maxGroundSpeed` so it never runs away |
| Dolphin dive | sprint + tap X — committed in the air, lands prone |

Capsule height and eye height change per stance (collider resizes in place with
feet kept planted and interpolation kept pop-free). Camera feel: stance eye-ease,
landing dip scaled by impact, sprint/slide FOV kick, subtle slide roll — all
read-only off movement state.

**Where to tune it:** everything lives in `PlayerConfig` / `Stance` in
`src/config/index.js` (speeds, accel, friction, slide timing, jump, FOV kicks).
The state machine is `src/player/MovementController.js`; `PlayerSystem.js` only
maps input actions to intent.

**Test it headlessly:** `node test/sim.mjs` drives the controller through walk /
sprint / slide / slide-cancel / jump / dive / friction with a mocked physics
facade and asserts the behaviour.

## Weapons (this drop)

A data-plus-behavior split. `weapons/WeaponData.js` holds everything a gun can
vary — damage, fireRate, magazine/reserve, reloadTime, recoil, spread,
projectileType, ADS optics, plus the presentation hooks (animationSet, soundSet,
muzzleEffect, viewmodel). `weapons/WeaponBase.js` holds the behavior: ammo, the
fire-mode state machine (auto / semi / burst / pump), magazine vs per-shell
reload, recoil, and the ADS raise. A weapon is `new Class(new WeaponData(...))`.

Most guns are pure hitscan, so the base + data covers pistols, ARs, SMGs,
snipers (with `penetrate`), and HMGs. The subclasses in `weapons/variants.js`
change *what a shot is*: `ShotgunWeapon` sprays pellets and reloads per shell,
`ProjectileWeapon` launches a travelling round (the M72 rocket and the Ray Gun
bolt, both with splash via the `ProjectileSystem`), and `ConeWeapon` is the
Thundergun's wide instakill blast. `WonderWeapon` is a marker base for future
upgrade hooks. Categories and concrete guns live in `weapons/catalog.js` — add a
row and it appears; nothing else needs to know.

`WeaponSystem` (ECS) is the bridge: it feeds input into the equipped weapon's
`update()`, handing it a `ctx` of callbacks (`fireHitscan`, `spawnProjectile`,
`fireCone`, `addRecoil`, `emitAmmo`). All world interaction — raycasts against
zombies, projectile spawns, scoring — lives there via the shared
`weapons/damage.js`. It writes ADS + recoil onto the player for the camera, and
drives the procedural `Viewmodel` (depth-overlaid placeholder gun with ADS raise,
recoil kick, sway, walk-bob, and a muzzle flash).

ADS works on every gun: hipfire spread tightens toward `adsSpread`, FOV zooms to
`adsFov`, recoil eases. Snipers set `scoped`, which swaps to a higher `scopeFov`
and draws the full-screen scope overlay (hiding the viewmodel and crosshair).
Switch weapons with number keys `1-8` or `Q`; `MOUSE2` aims, `R` reloads.

Test the logic headless: `node test/weapons.mjs` (fire modes, cadence,
magazine/reserve, reload types, ADS spread, projectile/cone dispatch).

## Zombie AI (this drop)

Four systems, all driven off a **generated navigation graph** rather than hand-placed
waypoints. The arena (`scenes/ArenaScene.js`) is declared once; every wall both
renders a collider and stamps solid cells, and every gap both leaves an opening
and registers a `Barrier` the graph gates on — so geometry and nav can't drift.

- **NavGraph + pathfinding** (`ai/NavGraph.js`) — a uniform grid with 8-connected
  A* (octile heuristic, binary heap, no corner-cutting, reused scratch buffers).
  Traversal is decided by a pluggable agent: zombies may route *through* a boarded
  window at a cost penalty; the player may not. Barriers are cells, not baked
  edges, so opening one needs no rebuild — the next replan just sees it.
- **Spawn manager** (`ai/SpawnManager.js`) — seeds zombies from exterior spawn
  points outside the building, biased toward the player, throttled by spawn
  interval and a max-alive cap.
- **Zombie FSM** (`ai/ZombieSystem.js`) — `spawning → pathing → teardown →
  attack`. Pathing replans on a timer or whenever nav topology changes. When the
  next waypoint is a still-boarded window the zombie stops and tears it down
  (timed) before entering — including the first window if it spawned right
  outside one. Nav-driven Transforms with light separation (no per-agent rigid
  body) so a horde stays cheap.
- **Round system** (`ai/RoundManager.js` + `ai/RoundSystem.js`) — intermission
  countdown, then a wave whose count/health/speed scale with the round; clears
  when none remain, then the next intermission begins.

Two barrier kinds demonstrate dynamic replanning: **windows** (zombies tear open)
and one interior **door** (player opens with `F`) — opening either republishes
nav and live zombies reroute. A placeholder **hitscan** (left mouse) lets you kill
zombies and drive the loop before the real weapon system lands; player health
regenerates after a few seconds without being hit.

Test the nav/pathfinding logic headless: `node test/nav.mjs` (A*, barrier gating,
tear-to-open, no corner-cutting). Movement: `node test/sim.mjs`.

## Menu & settings (this drop)

A DOM/CSS UI layer over the canvas — PS2 survival-horror skin (bone / blood /
sickly-teal, animated film grain, scanlines, vignette, chromatic aberration,
flicker) with Persona-style kinetic skewed typography and staggered entrances.

App flow is a small state machine — `MENU -> PLAYING -> PAUSED`
(`core/GameState.js`). Systems read it: the player only simulates while playing,
physics freezes while paused, and the camera does a slow brooding orbit-drift
behind the main menu. `ui/UIManager.js` owns the menus and is the only code that
touches the page.

The **options** screen (`ui/OptionsMenu.js`) has three tabs and everything
drives the engine live:
- **Display** - FOV, render scale (web "resolution"), window mode
  (windowed/fullscreen/borderless via the Fullscreen API), V-Sync.
- **Graphics** - shadows (off/low/high), exposure, fog density, texture
  filtering, plus the horror post-FX (film grain, scanlines, chromatic
  aberration, vignette) feeding the CSS overlay through an event.
- **Controls** - mouse sensitivity, invert-Y, hold/toggle mode per action
  (aim/crouch/prone/sprint), and click-to-rebind keybindings.

Settings live in one place (`settings/SettingsStore.js`): persisted to
localStorage and applied to the renderer / scene / camera. Toggle-vs-hold is
resolved in `player/ControlScheme.js`, which turns raw actions into movement
intent so the FSM never has to care which mode is active.

## Architecture principles

- **ES modules + classes** throughout; one responsibility per module.
- **ECS**: entities are ids, components are data, systems hold behaviour. The
  `World` query API is stable so storage can later be swapped for archetypes
  without touching system code.
- **Dependency injection** at the composition root (`Engine`). Systems pull
  shared managers from the `ServiceLocator` rather than importing each other.
- **Physics is a hard boundary**: only `PhysicsManager.js` imports Rapier.
  Everything else uses opaque body handles, so the engine is swappable.
- **Renderer is backend-agnostic**: callers never branch on WebGPU vs WebGL.
- **Determinism**: simulation runs on a fixed timestep with an accumulator;
  rendering interpolates between steps via `alpha` for smoothness.
- **Input intent is decoupled from keys** via the action layer, so the future
  keybinds menu just mutates bindings — no gameplay code changes.

## Phase order contracts (don't break these)

- In the fixed phase, `PlayerSystem` runs **before** `PhysicsSystem`: the player
  sets its kinematic target, then `world.step()` applies it.
- `Transform` is the authoritative pose. Dynamic bodies write into it after the
  step; the player writes its predicted pose; the renderer/camera only read it.
- `Transform.position` for the player is the **capsule centre**; the camera
  converts to feet then adds eye height.

## Next phases (not in this drop)

Movement state machine (sprint/slide/crouch/prone), main menu + options/keybinds
UI, FOV slider wiring, zombie navigation/pathfinding with off-map spawns and
breakable barriers, perks, Pack-a-Punch, wall buys, buyable doors, mystery box.
The hooks (`PlayerTag.stance`, `RenderConfig.fov`, the action table, the
EventBus, swappable scenes) are already in place for these.
