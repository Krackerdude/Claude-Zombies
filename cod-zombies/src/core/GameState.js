/**
 * App-level state machine: menu | playing | paused | scoreboard. Systems read
 * this to decide whether to simulate, capture the mouse, or drift the camera.
 * `scoreboard` is a second paused state (the Tab menu) that freezes the world
 * just like `paused` but is owned by a separate UI from the pause menu.
 * Transitions are announced on the EventBus so the UI can react without the
 * engine importing it.
 */
export const AppState = Object.freeze({
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  SCOREBOARD: 'scoreboard',
  DEVMENU: 'devmenu', // F2 dev/test overlay — freezes the live frame like scoreboard
  DEATHCAM: 'dying',  // post-death cinematic: player collapsed, camera panning the map
});

export class GameState {
  #current = AppState.MENU;
  #events;

  constructor(events) {
    this.#events = events;
  }

  get current() {
    return this.#current;
  }

  get isPlaying() {
    return this.#current === AppState.PLAYING;
  }

  set(state) {
    if (state === this.#current) return;
    const prev = this.#current;
    this.#current = state;
    this.#events.emit('state:change', { prev, state });
  }
}
