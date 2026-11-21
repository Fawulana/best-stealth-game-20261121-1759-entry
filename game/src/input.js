// Keyboard and mouse input. Held keys give a steering vector; one-shot presses
// (confirm, pause, sneak toggle is held) are queued as bit flags and taken once
// by the loop, so a press between two frames is never lost or counted twice.
// A left mouse click throws a pebble toward the click point; the X key or a
// right click drops a smoke bomb — at your feet for X, at the click for a
// right click.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_SNEAK_TOGGLE = 4;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const SNEAK = new Set(['ShiftLeft', 'ShiftRight', 'KeyC']);
const SMOKE = new Set(['KeyX']);

export function createInput(canvas) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let sneak = false;
  let actions = 0;
  let click = null;
  let smokeClick = null;
  let smokeHere = false;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (SNEAK.has(event.code)) sneak = true;
    else if (SMOKE.has(event.code)) {
      if (!event.repeat) smokeHere = true;
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else return;
    // Space and Enter also scroll the page: keep the game still instead.
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (SNEAK.has(event.code)) sneak = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    up = false;
    down = false;
    left = false;
    right = false;
    sneak = false;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (event.button === 2) smokeClick = point;
    else click = point;
  });
  // The right click is a game action, not a browser menu.
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** Normalised steering vector from the held movement keys. */
    steer() {
      const x = (right ? 1 : 0) - (left ? 1 : 0);
      const y = (down ? 1 : 0) - (up ? 1 : 0);
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len };
    },
    sneaking() {
      return sneak;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The last click in canvas pixels since the last call, or null. */
    takeClick() {
      const taken = click;
      click = null;
      return taken;
    },
    /**
     * A smoke request since the last call: 'here' drops the bomb at the
     * thief's feet (the X key), a point drops it there (right click).
     */
    takeSmoke() {
      if (smokeHere) {
        smokeHere = false;
        return { here: true };
      }
      const taken = smokeClick;
      smokeClick = null;
      return taken ? { point: taken } : null;
    },
  };
}
