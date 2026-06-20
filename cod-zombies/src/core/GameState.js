/**
 * App-level state machine: menu | playing | paused. Systems read this to decide
 * whether to simulate, capture the mouse, or drift the camera. Transitions are
 * announced on the EventBus so the UI can react without the engine importing it.
 */
export const AppState = Object.freeze({
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
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
