/**
 * Hearthmere — camera, screen<->tile picking, active tool, drag state,
 * selection and hotkeys (DESIGN §12, §13).
 *
 * Knows no game rule. It picks a tile, tracks what the player is pointing at,
 * and calls documented command methods (`buildings.place` / `placeMany` /
 * `demolish`) or emits the frozen `tool:changed` / `select:changed` events.
 * Whether a placement is legal, affordable or sensible is `buildings.js`'s
 * answer, never this file's.
 *
 * Projection comes exclusively from `utils.isoX/isoY/unIsoX/unIsoY`; there is
 * exactly one projection in the codebase and `screenToTile` is its exact
 * inverse. (0.5, 0.5) is the centre of tile (0,0), so `floor()` of the
 * un-projected float tile coordinate IS the tile — no half-tile offset.
 *
 * No DOM at module scope (§18): every listener is attached in init() and
 * removed in destroy(), so a restart cannot stack duplicate handlers.
 */

import {
  GRID_W, GRID_H, TILE_W, TILE_H, MIN_ZOOM, MAX_ZOOM, BUILDING_BY_ID, SPEEDS,
} from './constants.js';
import {
  isoX, isoY, unIsoX, unIsoY, clamp, approach,
} from './utils.js';

const HW = TILE_W / 2;
const HH = TILE_H / 2;

// Iso world-pixel bounding box of the whole map diamond. Tile corner (0,0)
// projects to (0,0); the south corner (GRID_W, GRID_H) to the bottom.
const WORLD_MIN_X = -GRID_H * HW;
const WORLD_MAX_X = GRID_W * HW;
const WORLD_MIN_Y = 0;
const WORLD_MAX_Y = (GRID_W + GRID_H) * HH;

const EDGE_PAN_MARGIN = 26;     // screen px from the canvas edge
const EDGE_PAN_SPEED = 900;     // screen px/sec
const KEY_PAN_SPEED = 950;      // screen px/sec
const PAN_DECAY = 6.0;          // momentum e-folding rate, 1/sec
const MIN_MOMENTUM = 14;        // world px/sec below which momentum stops
const TAP_PX = 6;               // pointer travel that still counts as a click
const PAN_TO_RATE = 7.0;        // smooth panTo easing rate
const WHEEL_ZOOM_RATE = 0.0016;
const PICK_VILLAGER_RADIUS = 0.6;   // tiles

const PAN_KEYS = {
  KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1,
  ArrowUp: 1, ArrowLeft: 1, ArrowDown: 1, ArrowRight: 1,
};

/** True when the event target is a text field, so hotkeys must not fire. */
function isTypingTarget(t) {
  if (!t || !t.tagName) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable === true;
}

export function createInput(game) {
  return new Input(game);
}

class Input {
  // Constructor must not reach into other modules (§12) — init() does that.
  constructor(game) {
    this.game = game;
    this.canvas = null;

    /** Camera in iso world-pixel space; x/y is the point at the canvas centre. */
    this.cam = { x: 0, y: 0, zoom: 1 };

    /** '' = inspect/select, 'demolish', or a BUILDING_BY_ID def id. */
    this.tool = '';
    /** Tile index under the cursor, -1 when the cursor is off-map or off-canvas. */
    this.hover = -1;
    this.hoverX = -1;
    this.hoverY = -1;
    this.selected = { kind: '', id: -1 };

    /** Drag placement (§12): live L-shaped preview, committed on release. */
    this.dragging = false;
    this.dragFrom = -1;
    this.dragTiles = [];

    this.viewW = 0;
    this.viewH = 0;
    this.edgePan = true;

    /**
     * §13's hotkeys are listed under the ui.js section, and ui.js binds its
     * own window keydown for all of them. Two handlers means Space, M and
     * `,`/`.` fire twice and cancel each other out, so by default input.js
     * yields every §13 key to ui.js when ui.js is handling keys, and keeps
     * only the camera keys (WASD/arrows), which ui.js never touches.
     * Force it either way with true (input owns them) or false (never).
     */
    this.ownsHotkeys = 'auto';

    this.vel = { x: 0, y: 0 };
    this.panGoal = null;

    this._keys = new Set();
    this._pointers = new Map();
    this._panPointer = -1;
    this._placePointer = -1;
    this._pinch = null;
    this._ptrX = 0;
    this._ptrY = 0;
    this._ptrInside = false;
    this._downX = 0;
    this._downY = 0;
    this._moved = 0;
    this._downButton = 0;
    this._roadCycle = 0;
    this._miniPointer = -1;
    this._lastSpeed = 1;
    this._lastNow = 0;
    this._tmpTile = { x: 0, y: 0, fx: 0, fy: 0, idx: -1 };
    this._miniTile = { x: 0, y: 0 };
    this._binds = null;
    this._started = false;
  }

  /* ------------------------------------------------------------------ *
   * Lifecycle
   * ------------------------------------------------------------------ */

  init() {
    // Idempotent: a restart that calls init() twice must not end up with two
    // sets of handlers and a camera that pans at double speed.
    if (this._started) this.destroy();

    const game = this.game;
    this.canvas = game.canvas || null;
    this.resize();

    if (this.cam.x === 0 && this.cam.y === 0) {
      const start = game.world && game.world.start;
      if (start) this.centreOnTile(start.x + 0.5, start.y + 0.5);
      else this.centreOnTile(GRID_W / 2, GRID_H / 2);
    }
    this.clampCam();

    const c = this.canvas;
    if (!c || typeof window === 'undefined') {
      this._started = true;
      this._lastNow = this._now();
      return;
    }

    // Pointer Events unify mouse, pen and touch; the browser must not also
    // scroll/zoom the page out from under the canvas.
    c.style.touchAction = 'none';

    const b = {
      down: (e) => this._onPointerDown(e),
      move: (e) => this._onPointerMove(e),
      up: (e) => this._onPointerUp(e),
      cancel: (e) => this._onPointerCancel(e),
      leave: () => { this._ptrInside = false; this._updateHover(); },
      wheel: (e) => this._onWheel(e),
      menu: (e) => e.preventDefault(),
      key: (e) => this._onKeyDown(e),
      keyUp: (e) => this._onKeyUp(e),
      blur: () => { this._keys.clear(); },
    };
    this._binds = b;

    c.addEventListener('pointerdown', b.down);
    c.addEventListener('pointermove', b.move);
    c.addEventListener('pointerleave', b.leave);
    c.addEventListener('wheel', b.wheel, { passive: false });
    c.addEventListener('contextmenu', b.menu);
    // up/cancel on window: a drag that ends outside the canvas must still end.
    window.addEventListener('pointerup', b.up);
    window.addEventListener('pointercancel', b.cancel);
    window.addEventListener('keydown', b.key);
    window.addEventListener('keyup', b.keyUp);
    window.addEventListener('blur', b.blur);

    this._started = true;
    this._lastNow = this._now();
  }

  /** Removes every listener. Safe to call twice. */
  destroy() {
    const b = this._binds;
    const c = this.canvas;
    if (b && c && typeof window !== 'undefined') {
      c.removeEventListener('pointerdown', b.down);
      c.removeEventListener('pointermove', b.move);
      c.removeEventListener('pointerleave', b.leave);
      c.removeEventListener('wheel', b.wheel);
      c.removeEventListener('contextmenu', b.menu);
      window.removeEventListener('pointerup', b.up);
      window.removeEventListener('pointercancel', b.cancel);
      window.removeEventListener('keydown', b.key);
      window.removeEventListener('keyup', b.keyUp);
      window.removeEventListener('blur', b.blur);
    }
    this._binds = null;
    this._started = false;
    this._keys.clear();
    this._pointers.clear();
    this._panPointer = -1;
    this._placePointer = -1;
    this._pinch = null;
    this.dragging = false;
    this.dragTiles.length = 0;
    this.vel.x = 0;
    this.vel.y = 0;
  }

  /** Re-reads the canvas size. main.js must call this on window resize. */
  resize() {
    const c = this.canvas;
    if (!c) return;
    // CSS pixels, not backing-store pixels: screen coordinates everywhere in
    // this file (and in render.js) are CSS px from the canvas top-left.
    this.viewW = c.clientWidth || c.width || 0;
    this.viewH = c.clientHeight || c.height || 0;
    this.clampCam();
  }

  serialize() {
    return {
      cam: { x: this.cam.x, y: this.cam.y, zoom: this.cam.zoom },
      tool: this.tool,
      selected: { kind: this.selected.kind, id: this.selected.id },
    };
  }

  restore(obj) {
    if (!obj) return;
    const cam = obj.cam || obj;
    if (cam && typeof cam.x === 'number') {
      this.cam.x = cam.x;
      this.cam.y = cam.y;
      this.cam.zoom = clamp(cam.zoom || 1, MIN_ZOOM, MAX_ZOOM);
    }
    this.setTool(typeof obj.tool === 'string' ? obj.tool : '');
    if (obj.selected) this.select(obj.selected.kind, obj.selected.id);
    this.clampCam();
  }

  /* ------------------------------------------------------------------ *
   * Projection (the exact inverse of render.js's, both via utils)
   * ------------------------------------------------------------------ */

  /** Iso world pixel -> screen (CSS) px. */
  worldToScreenX(wx) {
    return (wx - this.cam.x) * this.cam.zoom + this.viewW * 0.5;
  }

  worldToScreenY(wy) {
    return (wy - this.cam.y) * this.cam.zoom + this.viewH * 0.5;
  }

  /** Float tile coords -> screen (CSS) px. (0.5, 0.5) is tile (0,0)'s centre. */
  tileToScreenX(tx, ty) {
    return this.worldToScreenX(isoX(tx, ty));
  }

  tileToScreenY(tx, ty) {
    return this.worldToScreenY(isoY(tx, ty));
  }

  /**
   * Screen (CSS) px -> tile. `fx`/`fy` are the float tile coordinates, `x`/`y`
   * their floor (raw, possibly out of range) and `idx` is -1 off-map.
   */
  screenToTile(sx, sy) {
    return this.screenToTileInto(sx, sy, { x: 0, y: 0, fx: 0, fy: 0, idx: -1 });
  }

  /** As screenToTile, but fills a caller-owned object — no per-frame garbage. */
  screenToTileInto(sx, sy, out) {
    const cam = this.cam;
    const wx = (sx - this.viewW * 0.5) / cam.zoom + cam.x;
    const wy = (sy - this.viewH * 0.5) / cam.zoom + cam.y;
    const fx = unIsoX(wx, wy);
    const fy = unIsoY(wx, wy);
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    const ok = x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
    out.x = x;
    out.y = y;
    out.fx = fx;
    out.fy = fy;
    out.idx = ok ? y * GRID_W + x : -1;
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Camera
   * ------------------------------------------------------------------ */

  centreOnTile(tx, ty) {
    this.cam.x = isoX(tx, ty);
    this.cam.y = isoY(tx, ty);
    this.clampCam();
  }

  /**
   * Keeps the camera centre inside the map's world-space bounding box, and
   * when the map is larger than the viewport keeps the whole viewport inside
   * it, so the map can never be panned or zoomed off screen.
   */
  clampCam() {
    const cam = this.cam;
    cam.zoom = clamp(cam.zoom, MIN_ZOOM, MAX_ZOOM);
    const halfW = this.viewW * 0.5 / cam.zoom;
    const halfH = this.viewH * 0.5 / cam.zoom;
    const mapW = WORLD_MAX_X - WORLD_MIN_X;
    const mapH = WORLD_MAX_Y - WORLD_MIN_Y;

    if (mapW > halfW * 2) cam.x = clamp(cam.x, WORLD_MIN_X + halfW, WORLD_MAX_X - halfW);
    else cam.x = (WORLD_MIN_X + WORLD_MAX_X) * 0.5;

    if (mapH > halfH * 2) cam.y = clamp(cam.y, WORLD_MIN_Y + halfH, WORLD_MAX_Y - halfH);
    else cam.y = (WORLD_MIN_Y + WORLD_MAX_Y) * 0.5;
  }

  /**
   * Zoom anchored on a screen point. Anchoring on the cursor rather than the
   * canvas centre is what makes an iso builder feel right: the tile you are
   * pointing at is the one you zoom into.
   */
  zoomAt(sx, sy, factor) {
    const cam = this.cam;
    const z0 = cam.zoom;
    const z1 = clamp(z0 * factor, MIN_ZOOM, MAX_ZOOM);
    if (z1 === z0) return;
    const dx = sx - this.viewW * 0.5;
    const dy = sy - this.viewH * 0.5;
    // World point under (sx, sy) must be unchanged after the zoom.
    cam.x += dx / z0 - dx / z1;
    cam.y += dy / z0 - dy / z1;
    cam.zoom = z1;
    this.panGoal = null;
    this.clampCam();
  }

  /** Smooth pan to a tile (ui.js alert clicks, §13). */
  panTo(tx, ty, zoom) {
    this.panGoal = {
      x: isoX(tx, ty),
      y: isoY(tx, ty),
      zoom: typeof zoom === 'number' ? clamp(zoom, MIN_ZOOM, MAX_ZOOM) : this.cam.zoom,
    };
    this.vel.x = 0;
    this.vel.y = 0;
  }

  /** Smooth pan to a world-pixel point. */
  panToWorld(wx, wy) {
    this.panGoal = { x: wx, y: wy, zoom: this.cam.zoom };
    this.vel.x = 0;
    this.vel.y = 0;
  }

  /** Smooth pan onto a building ({x,y,w,h}), a villager ({vx,vy}) or a tile idx. */
  focusOn(thing) {
    if (thing === null || thing === undefined) return;
    if (typeof thing === 'number') {
      this.panTo((thing % GRID_W) + 0.5, ((thing / GRID_W) | 0) + 0.5);
      return;
    }
    if (typeof thing.vx === 'number') {
      this.panTo(thing.vx, thing.vy);
      return;
    }
    if (typeof thing.x === 'number') {
      const w = thing.w || 1;
      const h = thing.h || 1;
      this.panTo(thing.x + w * 0.5, thing.y + h * 0.5);
      return;
    }
    if (typeof thing.idx === 'number') this.focusOn(thing.idx);
  }

  /* ------------------------------------------------------------------ *
   * Tools and selection
   * ------------------------------------------------------------------ */

  /**
   * `setTool('bakery')`, and ui.js's `setTool(kind, defId)` form —
   * `('build', 'bakery')`, `('select')`, `('demolish')` — both land here.
   * The stored `tool` is always a plain string: '' for inspect, 'demolish',
   * or a `BUILDING_BY_ID` def id, which is what render.js's ghost reads.
   */
  setTool(a, b) {
    let next = '';
    if (typeof b === 'string' && b) next = b;
    else if (typeof a === 'string') next = a === 'select' || a === 'build' || a === 'none' ? '' : a;
    else if (a && typeof a === 'object') next = a.defId || a.id || '';
    if (next === this.tool) return;
    this.cancelDrag();
    this.tool = next;
    this._emit('tool:changed', { tool: next });
  }

  /** ui.js's close button and inspector use this name. */
  clearSelection() {
    this.select('', -1);
  }

  select(kind, id) {
    const k = kind || '';
    const i = typeof id === 'number' ? id : -1;
    if (this.selected.kind === k && this.selected.id === i) return;
    this.selected.kind = k;
    this.selected.id = i;
    this._emit('select:changed', { kind: k, id: i });
  }

  /**
   * `R` cycles dirt path -> cobbled road. ui.js owns the key (F2) and passes
   * `false` while the cobbled road is still locked, so the cycle never parks
   * the player on a tool they cannot use.
   */
  nextRoadTool(cobbledAllowed) {
    const onRoad = this.tool === 'path' || this.tool === 'road';
    this._roadCycle = (onRoad && cobbledAllowed !== false) ? 1 - this._roadCycle : 0;
    return this._roadCycle === 0 ? 'path' : 'road';
  }

  /**
   * The minimap is drawn by render.js on the canvas, so the click lands here.
   * Returns the tile under a screen point, or null when it is not on the map.
   */
  minimapTileAt(px, py) {
    const r = this.game.render;
    const box = r && typeof r.minimapAt === 'function' ? r.minimapAt() : null;
    if (!box) return null;
    if (px < box.x || py < box.y || px >= box.x + box.size || py >= box.y + box.size) return null;
    // Scratch, like _tmpTile: this runs on every hover update.
    const t = this._miniTile;
    t.x = clamp((px - box.x) * (GRID_W / box.size), 0, GRID_W - 0.001);
    t.y = clamp((py - box.y) * (GRID_H / box.size), 0, GRID_H - 0.001);
    return t;
  }

  cancelDrag() {
    if (!this.dragging) return;
    this.dragging = false;
    this.dragFrom = -1;
    this.dragTiles.length = 0;
    this._placePointer = -1;
  }

  /**
   * Esc / right-click: back out one step at a time — live drag, then the
   * active tool, then the selection.
   */
  cancel() {
    if (this.dragging) { this.cancelDrag(); return; }
    if (this.tool) { this.setTool(''); return; }
    if (this.selected.kind) this.select('', -1);
    this._emit('ui:escape', {});
  }

  /* ------------------------------------------------------------------ *
   * Frame update — camera only. Deliberately uses wall-clock time, not the
   * simulation dt, so the camera still pans while the game is paused.
   * ------------------------------------------------------------------ */

  update() {
    const now = this._now();
    let dt = (now - this._lastNow) / 1000;
    this._lastNow = now;
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;

    const cam = this.cam;
    const perScreenPx = 1 / cam.zoom;

    // Keyboard pan. Speed is constant in screen px so it feels the same at
    // every zoom level.
    let kx = 0;
    let ky = 0;
    const keys = this._keys;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) kx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) kx += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) ky -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) ky += 1;
    if (kx !== 0 || ky !== 0) {
      const n = kx !== 0 && ky !== 0 ? Math.SQRT1_2 : 1;
      cam.x += kx * n * KEY_PAN_SPEED * perScreenPx * dt;
      cam.y += ky * n * KEY_PAN_SPEED * perScreenPx * dt;
      this.panGoal = null;
      this.vel.x = 0;
      this.vel.y = 0;
    }

    // Edge pan, only while the pointer is over the canvas and not dragging.
    if (this.edgePan && this._ptrInside && this._panPointer < 0 && !this.dragging) {
      let ex = 0;
      let ey = 0;
      if (this._ptrX < EDGE_PAN_MARGIN) ex = -1 + this._ptrX / EDGE_PAN_MARGIN;
      else if (this._ptrX > this.viewW - EDGE_PAN_MARGIN) ex = 1 - (this.viewW - this._ptrX) / EDGE_PAN_MARGIN;
      if (this._ptrY < EDGE_PAN_MARGIN) ey = -1 + this._ptrY / EDGE_PAN_MARGIN;
      else if (this._ptrY > this.viewH - EDGE_PAN_MARGIN) ey = 1 - (this.viewH - this._ptrY) / EDGE_PAN_MARGIN;
      if (ex !== 0 || ey !== 0) {
        cam.x += ex * EDGE_PAN_SPEED * perScreenPx * dt;
        cam.y += ey * EDGE_PAN_SPEED * perScreenPx * dt;
        this.panGoal = null;
      }
    }

    // Momentum from a released drag-pan.
    if (this._panPointer < 0 && (this.vel.x !== 0 || this.vel.y !== 0)) {
      cam.x += this.vel.x * dt;
      cam.y += this.vel.y * dt;
      const decay = Math.exp(-PAN_DECAY * dt);
      this.vel.x *= decay;
      this.vel.y *= decay;
      if (Math.abs(this.vel.x) + Math.abs(this.vel.y) < MIN_MOMENTUM) {
        this.vel.x = 0;
        this.vel.y = 0;
      }
    }

    // Smooth panTo / focusOn.
    const goal = this.panGoal;
    if (goal) {
      cam.x = approach(cam.x, goal.x, PAN_TO_RATE, dt);
      cam.y = approach(cam.y, goal.y, PAN_TO_RATE, dt);
      cam.zoom = approach(cam.zoom, goal.zoom, PAN_TO_RATE, dt);
      if (Math.abs(cam.x - goal.x) < 0.5 && Math.abs(cam.y - goal.y) < 0.5
        && Math.abs(cam.zoom - goal.zoom) < 0.002) {
        cam.x = goal.x;
        cam.y = goal.y;
        cam.zoom = goal.zoom;
        this.panGoal = null;
      }
    }

    this.clampCam();
    this._updateHover();
  }

  /* ------------------------------------------------------------------ *
   * Pointer handling
   * ------------------------------------------------------------------ */

  _onPointerDown(e) {
    const c = this.canvas;
    // A click that lands on a DOM overlay never reaches the canvas, so there
    // is nothing to fight ui.js over — but a stray retarget is still ignored.
    if (e.target !== c) return;
    const p = this._localPoint(e);
    this._pointers.set(e.pointerId, { x: p.x, y: p.y, t: this._now() });
    this._ptrX = p.x;
    this._ptrY = p.y;
    this._ptrInside = true;
    this.vel.x = 0;
    this.vel.y = 0;
    this.panGoal = null;
    if (c.setPointerCapture) {
      try { c.setPointerCapture(e.pointerId); } catch (err) { void err; }
    }

    if (this._pointers.size === 2) {
      this._beginPinch();
      this.cancelDrag();
      this._panPointer = -1;
      this._placePointer = -1;
      e.preventDefault();
      return;
    }
    if (this._pointers.size > 2) return;

    this._downX = p.x;
    this._downY = p.y;
    this._moved = 0;
    this._downButton = e.button;

    // The minimap sits on the canvas, so its clicks arrive here. It jumps the
    // camera outright and keeps following the pointer, which is what a minimap
    // is for — no tool is armed and nothing is placed.
    if (e.button === 0) {
      const mt = this.minimapTileAt(p.x, p.y);
      if (mt) {
        this._miniPointer = e.pointerId;
        this.cancelDrag();
        this.panGoal = null;
        this.centreOnTile(mt.x, mt.y);
        this._updateHover();
        e.preventDefault();
        return;
      }
    }

    const placing = e.button === 0 && this.tool !== '';
    if (placing) {
      const def = BUILDING_BY_ID[this.tool];
      const t = this.screenToTile(p.x, p.y);
      if (def && def.drag === true && t.idx >= 0) {
        this.dragging = true;
        this.dragFrom = t.idx;
        this._placePointer = e.pointerId;
        this._rebuildDragLine(t.x, t.y);
      } else {
        this._placePointer = e.pointerId;
      }
    } else {
      // Left-drag with no tool, or any middle/right drag, pans.
      this._panPointer = e.pointerId;
    }
    e.preventDefault();
  }

  _onPointerMove(e) {
    const p = this._localPoint(e);
    this._ptrX = p.x;
    this._ptrY = p.y;
    this._ptrInside = true;

    const rec = this._pointers.get(e.pointerId);
    if (rec) {
      const dxs = p.x - rec.x;
      const dys = p.y - rec.y;
      const now = this._now();
      const dt = Math.max(1, now - rec.t) / 1000;
      rec.x = p.x;
      rec.y = p.y;
      rec.t = now;
      this._moved += Math.abs(dxs) + Math.abs(dys);

      if (this._pinch) {
        this._updatePinch();
      } else if (this._miniPointer === e.pointerId) {
        const mt = this.minimapTileAt(p.x, p.y);
        if (mt) this.centreOnTile(mt.x, mt.y);
      } else if (this._panPointer === e.pointerId) {
        const z = this.cam.zoom;
        this.cam.x -= dxs / z;
        this.cam.y -= dys / z;
        // Smoothed so a single jittery sample can't fling the camera.
        this.vel.x = this.vel.x * 0.7 + (-dxs / z / dt) * 0.3;
        this.vel.y = this.vel.y * 0.7 + (-dys / z / dt) * 0.3;
        this.clampCam();
      } else if (this.dragging && this._placePointer === e.pointerId) {
        const t = this.screenToTile(p.x, p.y);
        if (t.idx >= 0) this._rebuildDragLine(t.x, t.y);
      }
    }
    this._updateHover();
  }

  _onPointerUp(e) {
    const had = this._pointers.delete(e.pointerId);
    if (this._pointers.size < 2 && this._pinch) this._pinch = null;
    if (!had) return;
    const c = this.canvas;
    if (c && c.releasePointerCapture) {
      try { c.releasePointerCapture(e.pointerId); } catch (err) { void err; }
    }

    if (this._miniPointer === e.pointerId) {
      this._miniPointer = -1;
      return;
    }

    if (this._panPointer === e.pointerId) {
      this._panPointer = -1;
      if (this._moved < TAP_PX) {
        this.vel.x = 0;
        this.vel.y = 0;
        // A right-button press that never moved is a cancel, not a pan; a
        // left one is a selection click that happened to arm the pan.
        if (this._downButton === 2) this.cancel();
        else if (this._downButton === 0) this._pickAt(this.screenToTile(this._downX, this._downY));
      }
      return;
    }

    if (this._placePointer === e.pointerId) {
      this._placePointer = -1;
      if (this.dragging) {
        this.dragging = false;
        this.dragFrom = -1;
        // A fresh array, once per gesture: `dragTiles` is reused every
        // pointermove, so handing buildings.js the live one would clear the
        // list out from under it if it kept the reference.
        if (this.dragTiles.length > 0) this._commitMany(this.dragTiles.slice());
        this.dragTiles.length = 0;
        return;
      }
      if (this._moved < TAP_PX) {
        const t = this.screenToTile(this._downX, this._downY);
        if (t.idx >= 0) this._commitTile(t);
      }
      return;
    }
  }

  _onPointerCancel(e) {
    this._pointers.delete(e.pointerId);
    if (this._pointers.size < 2) this._pinch = null;
    if (this._placePointer === e.pointerId) this.cancelDrag();
    if (this._panPointer === e.pointerId) this._panPointer = -1;
    if (this._miniPointer === e.pointerId) this._miniPointer = -1;
  }

  _onWheel(e) {
    e.preventDefault();
    const p = this._localPoint(e);
    // deltaMode 1 = lines, 2 = pages: normalise to something px-ish.
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= this.viewH || 600;
    this.zoomAt(p.x, p.y, Math.exp(-dy * WHEEL_ZOOM_RATE));
    this._updateHover();
  }

  _beginPinch() {
    const it = this._pointers.values();
    const a = it.next().value;
    const b = it.next().value;
    if (!a || !b) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    this._pinch = {
      dist: Math.max(1, Math.hypot(dx, dy)),
      cx: (a.x + b.x) * 0.5,
      cy: (a.y + b.y) * 0.5,
    };
  }

  _updatePinch() {
    const it = this._pointers.values();
    const a = it.next().value;
    const b = it.next().value;
    const pin = this._pinch;
    if (!a || !b || !pin) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const cx = (a.x + b.x) * 0.5;
    const cy = (a.y + b.y) * 0.5;
    // Two-finger drag pans, the spread zooms, both anchored on the midpoint.
    const z = this.cam.zoom;
    this.cam.x -= (cx - pin.cx) / z;
    this.cam.y -= (cy - pin.cy) / z;
    this.zoomAt(cx, cy, dist / pin.dist);
    pin.dist = dist;
    pin.cx = cx;
    pin.cy = cy;
  }

  _localPoint(e) {
    const c = this.canvas;
    if (!c || !c.getBoundingClientRect) return { x: e.clientX || 0, y: e.clientY || 0 };
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /* ------------------------------------------------------------------ *
   * Keyboard (§13)
   * ------------------------------------------------------------------ */

  /** True when ui.js is handling §13's hotkeys and input.js must not. */
  _yieldHotkeys() {
    if (this.ownsHotkeys === true) return false;
    if (this.ownsHotkeys === false) return true;
    const ui = this.game.ui;
    // Probed per keypress, not at init: ui.init() may run after input.init().
    return !!(ui && typeof ui.onKey === 'function');
  }

  _onKeyDown(e) {
    if (isTypingTarget(e.target)) return;
    const code = e.code;
    // Camera keys are always input.js's, hotkeys may not be.
    if (PAN_KEYS[code] === 1) {
      this._keys.add(code);
      this.panGoal = null;
      e.preventDefault();
      return;
    }
    if (this._yieldHotkeys()) return;

    const ui = this.game.ui;
    const modal = !!(ui && ui.modalOpen);
    if (code === 'Escape') {
      // An open modal owns Escape; ui.js closes it and the tool stays put.
      if (modal) this._emit('ui:escape', {});
      else this.cancel();
      e.preventDefault();
      return;
    }
    if (modal) return;

    switch (code) {
      case 'Space':
        this._togglePause();
        e.preventDefault();
        break;
      case 'Digit1': case 'Digit2': case 'Digit3':
      case 'Digit4': case 'Digit5': case 'Digit6': {
        const n = code.charCodeAt(5) - 48;
        // Shift+1..4 are the §13 overlays; a bare digit is a gear, one per
        // SPEEDS entry above pause.
        if (e.shiftKey) { if (n <= 4) this._overlay(n); }
        else if (n < SPEEDS.length) this._setGear(n);
        else break;
        e.preventDefault();
        break;
      }
      case 'Digit0':
        this._setSpeed(0);
        e.preventDefault();
        break;
      case 'KeyR':
        // Repeated presses cycle dirt path -> cobbled road; buildings.js is
        // what decides whether the player may actually afford either.
        this.setTool(this.nextRoadTool(true));
        e.preventDefault();
        break;
      case 'Delete': case 'Backspace':
        this.setTool('demolish');
        e.preventDefault();
        break;
      case 'KeyM':
        if (ui && typeof ui.toggleBuildMenu === 'function') ui.toggleBuildMenu();
        this._emit('ui:build-menu', {});
        e.preventDefault();
        break;
      case 'Comma':
        this._cycleAlert(-1);
        e.preventDefault();
        break;
      case 'Period':
        this._cycleAlert(1);
        e.preventDefault();
        break;
      default:
        break;
    }
  }

  _onKeyUp(e) {
    this._keys.delete(e.code);
  }

  _togglePause() {
    const g = this.game;
    if (typeof g.togglePause === 'function') { g.togglePause(); return; }
    if (g.speed === 0) this._setSpeed(this._lastSpeed || 1);
    else { this._lastSpeed = g.speed || 1; this._setSpeed(0); }
  }

  /** `n` is a gear — an index into SPEEDS, matching ui.js's own key handler. */
  _setGear(n) {
    const g = n < 0 ? 0 : n >= SPEEDS.length ? SPEEDS.length - 1 : n | 0;
    this._setSpeed(SPEEDS[g]);
  }

  _setSpeed(n) {
    const g = this.game;
    if (n > 0) this._lastSpeed = n;
    if (typeof g.setSpeed === 'function') { g.setSpeed(n); return; }
    g.speed = n;
    if (g.state === 'playing' || g.state === 'paused') g.state = n === 0 ? 'paused' : 'playing';
  }

  _overlay(n) {
    const ui = this.game.ui;
    if (ui && typeof ui.setOverlay === 'function') ui.setOverlay(n);
    this._emit('ui:overlay', { overlay: n });
  }

  _cycleAlert(dir) {
    const ui = this.game.ui;
    if (ui && typeof ui.cycleAlert === 'function') ui.cycleAlert(dir);
    this._emit('ui:cycle-alert', { dir });
  }

  /* ------------------------------------------------------------------ *
   * Hover, picking and placement commands
   * ------------------------------------------------------------------ */

  _updateHover() {
    // F3: hover is -1 over any overlay, so no build ghost is drawn under the
    // minimap — the tile it happens to cover is not the one being pointed at.
    if (!this._ptrInside || this.minimapTileAt(this._ptrX, this._ptrY)) {
      this.hover = -1;
      this.hoverX = -1;
      this.hoverY = -1;
      return;
    }
    const t = this.screenToTileInto(this._ptrX, this._ptrY, this._tmpTile);
    this.hover = t.idx;
    this.hoverX = t.idx >= 0 ? t.x : -1;
    this.hoverY = t.idx >= 0 ? t.y : -1;
  }

  /** Villager first (they are small and on top), then the building, else nothing. */
  _pickAt(t) {
    if (t.idx < 0) { this.select('', -1); return; }
    const g = this.game;
    const v = g.villagers;
    if (v) {
      let id = -1;
      if (typeof v.pickAt === 'function') id = v.pickAt(t.fx, t.fy, PICK_VILLAGER_RADIUS);
      else {
        const list = v.list || v.all || null;
        if (list) {
          let best = PICK_VILLAGER_RADIUS * PICK_VILLAGER_RADIUS;
          for (let i = 0; i < list.length; i++) {
            const a = list[i];
            if (!a || a.dead) continue;
            const dx = a.vx - t.fx;
            const dy = a.vy - t.fy;
            const d = dx * dx + dy * dy;
            if (d < best) { best = d; id = a.id; }
          }
        }
      }
      if (id >= 0) { this.select('villager', id); return; }
    }
    const w = g.world;
    const bid = w && w.building ? w.building[t.idx] : -1;
    if (bid >= 0) { this.select('building', bid); return; }
    this.select('', -1);
  }

  _commitTile(t) {
    const g = this.game;
    const b = g.buildings;
    if (!b) return;
    if (this.tool === 'demolish') {
      this._demolishTile(t);
      return;
    }
    const def = BUILDING_BY_ID[this.tool];
    if (!def) return;
    if (def.drag === true && typeof b.placeMany === 'function') {
      this._commitMany([t.idx]);
      return;
    }
    if (typeof b.place !== 'function') return;
    const made = b.place(this.tool, t.x, t.y);
    // Nobody else knows the click failed, so this is where the player is told.
    if (!made && b.lastError) this._emit('toast', { text: b.lastError, kind: 'warn' });
  }

  /**
   * A tile holds either a building or a road, never both, and buildings.js
   * takes them down through different calls (`demolish(id)` vs
   * `removeRoad(idx)`). Choosing between them is a lookup, not a rule.
   */
  _demolishTile(t) {
    const g = this.game;
    const b = g.buildings;
    let inst = null;
    if (typeof b.atTile === 'function') inst = b.atTile(t.idx);
    if (!inst) {
      const id = g.world && g.world.building ? g.world.building[t.idx] : -1;
      if (id >= 0) inst = (typeof b.get === 'function' ? b.get(id) : null) || { id };
    }
    if (inst) {
      // Pulling a finished building down refunds nothing, so ui.js asks first.
      // A road is one wood and instant, and stays a single click.
      const ui = g.ui;
      if (ui && typeof ui.askDemolish === 'function') ui.askDemolish(inst.id);
      else if (typeof b.demolish === 'function') b.demolish(inst.id);
      return;
    }
    if (typeof b.removeRoad === 'function') b.removeRoad(t.idx);
  }

  _commitMany(tiles) {
    const b = this.game.buildings;
    if (!b) return;
    if (typeof b.placeMany === 'function') {
      const res = b.placeMany(this.tool, tiles);
      if (res && res.placed === 0 && res.failed > 0 && res.reason) {
        this._emit('toast', { text: res.reason, kind: 'warn' });
      }
      return;
    }
    if (typeof b.place === 'function') {
      for (let i = 0; i < tiles.length; i++) {
        b.place(this.tool, tiles[i] % GRID_W, (tiles[i] / GRID_W) | 0);
      }
    }
  }

  /**
   * L-shaped (Manhattan) run from the drag origin to (x, y): the longer axis
   * is walked first, so the corner lands where the player's wrist expects it.
   * Result is `this.dragTiles`, de-duplicated, in-bounds, in draw order.
   */
  _rebuildDragLine(x, y) {
    const out = this.dragTiles;
    out.length = 0;
    if (this.dragFrom < 0) return;
    const ax = this.dragFrom % GRID_W;
    const ay = (this.dragFrom / GRID_W) | 0;
    const bx = clamp(x, 0, GRID_W - 1);
    const by = clamp(y, 0, GRID_H - 1);
    const dx = bx - ax;
    const dy = by - ay;
    const sx = dx === 0 ? 0 : dx > 0 ? 1 : -1;
    const sy = dy === 0 ? 0 : dy > 0 ? 1 : -1;

    if (Math.abs(dx) >= Math.abs(dy)) {
      for (let cx = ax; ; cx += sx) {
        out.push(ay * GRID_W + cx);
        if (cx === bx || sx === 0) break;
      }
      for (let cy = ay + sy; sy !== 0; cy += sy) {
        out.push(cy * GRID_W + bx);
        if (cy === by) break;
      }
    } else {
      for (let cy = ay; ; cy += sy) {
        out.push(cy * GRID_W + ax);
        if (cy === by || sy === 0) break;
      }
      for (let cx = ax + sx; sx !== 0; cx += sx) {
        out.push(by * GRID_W + cx);
        if (cx === bx) break;
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Internals
   * ------------------------------------------------------------------ */

  _emit(name, payload) {
    const bus = this.game.bus;
    if (bus && typeof bus.emit === 'function') bus.emit(name, payload);
  }

  _now() {
    return typeof performance !== 'undefined' && performance.now
      ? performance.now() : Date.now();
  }
}
