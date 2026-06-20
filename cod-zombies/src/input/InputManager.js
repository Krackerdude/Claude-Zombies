/**
 * Captures raw device input: keyboard, mouse buttons, mouse motion, and pointer
 * lock. It exposes *raw* state keyed by KeyboardEvent.code (and synthetic
 * "Mouse0/1/2"). The semantic layer (InputActions) maps these to game actions.
 *
 * Per-frame edges (justPressed/justReleased) are tracked and cleared by
 * endFrame(), which the Engine calls after update(). Mouse motion is
 * accumulated and consumed by the camera, then reset each frame.
 */
export class InputManager {
  #down = new Set();
  #justPressed = new Set();
  #justReleased = new Set();

  mouseDX = 0;
  mouseDY = 0;
  wheelDelta = 0;
  pointerLocked = false;

  #element;
  #bound = {};

  constructor(element = document.body) {
    this.#element = element;
  }

  init() {
    this.#bound.keydown = (e) => this.#onKey(e, true);
    this.#bound.keyup = (e) => this.#onKey(e, false);
    this.#bound.mousedown = (e) => this.#onMouse(e, true);
    this.#bound.mouseup = (e) => this.#onMouse(e, false);
    this.#bound.mousemove = (e) => this.#onMouseMove(e);
    this.#bound.wheel = (e) => { this.wheelDelta += Math.sign(e.deltaY); };
    this.#bound.contextmenu = (e) => e.preventDefault();
    this.#bound.pointerlockchange = () => {
      this.pointerLocked = document.pointerLockElement === this.#element;
    };
    this.#bound.blur = () => this.#clearAll();

    window.addEventListener('keydown', this.#bound.keydown);
    window.addEventListener('keyup', this.#bound.keyup);
    window.addEventListener('mousedown', this.#bound.mousedown);
    window.addEventListener('mouseup', this.#bound.mouseup);
    window.addEventListener('mousemove', this.#bound.mousemove);
    window.addEventListener('wheel', this.#bound.wheel, { passive: true });
    this.#element.addEventListener('contextmenu', this.#bound.contextmenu);
    document.addEventListener('pointerlockchange', this.#bound.pointerlockchange);
    window.addEventListener('blur', this.#bound.blur);
    return this;
  }

  requestPointerLock() {
    this.#element.requestPointerLock?.();
  }

  exitPointerLock() {
    document.exitPointerLock?.();
  }

  // --- raw queries --------------------------------------------------------

  isDown(code) { return this.#down.has(code); }
  wasPressed(code) { return this.#justPressed.has(code); }
  wasReleased(code) { return this.#justReleased.has(code); }

  /** Clears per-frame edges and motion deltas. Call once after update(). */
  endFrame() {
    this.#justPressed.clear();
    this.#justReleased.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
  }

  // --- handlers -----------------------------------------------------------

  #onKey(e, isDown) {
    const code = e.code;
    // While actively playing (pointer locked) swallow the browser's default key
    // actions so gameplay keys can't bookmark (Ctrl+D), reload (Ctrl+R), find
    // (Ctrl+F), scroll (Space), tab away, etc. Function keys pass through so
    // F5/F11/F12 still work. NOTE: Ctrl+W/Ctrl+T/Ctrl+N are reserved by the
    // browser and cannot be intercepted by any web page.
    if (this.pointerLocked && !/^F\d+$/.test(code)) e.preventDefault();
    if (isDown) {
      if (!this.#down.has(code)) this.#justPressed.add(code);
      this.#down.add(code);
    } else {
      this.#down.delete(code);
      this.#justReleased.add(code);
    }
  }

  #onMouse(e, isDown) {
    const code = `Mouse${e.button}`;
    if (isDown) {
      if (!this.#down.has(code)) this.#justPressed.add(code);
      this.#down.add(code);
    } else {
      this.#down.delete(code);
      this.#justReleased.add(code);
    }
  }

  #onMouseMove(e) {
    if (!this.pointerLocked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  }

  #clearAll() {
    this.#down.clear();
    this.#justPressed.clear();
    this.#justReleased.clear();
  }

  dispose() {
    window.removeEventListener('keydown', this.#bound.keydown);
    window.removeEventListener('keyup', this.#bound.keyup);
    window.removeEventListener('mousedown', this.#bound.mousedown);
    window.removeEventListener('mouseup', this.#bound.mouseup);
    window.removeEventListener('mousemove', this.#bound.mousemove);
    window.removeEventListener('wheel', this.#bound.wheel);
    this.#element.removeEventListener('contextmenu', this.#bound.contextmenu);
    document.removeEventListener('pointerlockchange', this.#bound.pointerlockchange);
    window.removeEventListener('blur', this.#bound.blur);
  }
}
