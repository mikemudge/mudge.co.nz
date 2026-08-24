// Keyboard/mouse input for Wildergrove. Deliberately decoupled from
// world.js/player.js/actions.js per the design contract: this module only
// (a) tracks which movement keys are down and exposes a direction vector for
// main.js/player.js to consume, (b) tracks a selected hotbar slot index, and
// (c) turns a canvas click into a grid tile via render.js's screenToGrid and
// hands it to a caller-supplied callback. It never reaches into game state
// itself - main.js/actions.js decide what a tile click or hotbar slot means.
import { screenToGrid } from './render.js';

const MOVE_KEYS = {
  w: [0, -1], arrowup: [0, -1],
  s: [0, 1], arrowdown: [0, 1],
  a: [-1, 0], arrowleft: [-1, 0],
  d: [1, 0], arrowright: [1, 0],
};

export class InputController {
  // camera: a live {x, y, zoom} object (e.g. state.camera from main.js) -
  // read (never mutated) at click time to convert screen px to a grid tile.
  // callbacks: { onTileClick(gx, gy), onCancel(), onHotbarSelect(slot) }.
  constructor(canvas, camera, callbacks = {}) {
    this.canvas = canvas;
    this.camera = camera;
    this.callbacks = callbacks;
    this.pressed = new Set(); // active movement directions, e.g. 'w'/'arrowup'
    this.selectedSlot = 0; // 0-8, first 9 inventory slots per the contract

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onClick = this._onClick.bind(this);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    canvas.addEventListener('click', this._onClick);
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.canvas.removeEventListener('click', this._onClick);
    this.pressed.clear();
  }

  // Returns a direction vector in [-1, 1] per axis, diagonal-normalized so
  // moving diagonally isn't faster than moving on one axis.
  getMoveVector() {
    let dx = 0;
    let dy = 0;
    for (const key of this.pressed) {
      const vec = MOVE_KEYS[key];
      if (!vec) continue;
      dx += vec[0];
      dy += vec[1];
    }
    if (dx !== 0 && dy !== 0) {
      const inv = 1 / Math.sqrt(2);
      dx *= inv;
      dy *= inv;
    }
    return { x: dx, y: dy };
  }

  // Accepts any non-negative inventory index, not just 0-8: keys 1-9 (below)
  // only ever pass 0-8, but ui.js also calls this directly when a player
  // clicks a slot further down the full inventory grid (e.g. a seed that
  // landed past slot 8), so main.js's buildActionCtx() - which reads
  // inventory.slots[this.selectedSlot] - can select any held item as the
  // active one, not only the first 9.
  selectSlot(slot) {
    if (slot < 0) return;
    this.selectedSlot = slot;
    this.callbacks.onHotbarSelect?.(slot);
  }

  _rectPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  _onKeyDown(e) {
    const key = e.key.toLowerCase();
    if (MOVE_KEYS[key]) {
      this.pressed.add(key);
      return;
    }
    if (key === 'escape') {
      this.callbacks.onCancel?.();
      return;
    }
    if (/^[1-9]$/.test(key)) {
      this.selectSlot(parseInt(key, 10) - 1);
    }
  }

  _onKeyUp(e) {
    const key = e.key.toLowerCase();
    if (MOVE_KEYS[key]) this.pressed.delete(key);
  }

  _onClick(e) {
    const [x, y] = this._rectPos(e);
    const [gx, gy] = screenToGrid(this.camera, x, y);
    this.callbacks.onTileClick?.(gx, gy);
  }
}
