// Pointer/keyboard input for Driftworks. Uses the Pointer Events API so
// mouse and touch share one code path (tracking active pointers in a Map
// makes two-finger pinch straightforward), per the design contract:
//   mouse: drag = pan, wheel = zoom, click = place, R/right-click = rotate
//          ghost, Escape = deselect, 1-9/palette = select building type.
//   touch: one-finger drag = pan, two-finger pinch = zoom, tap = place.
//
// This module owns no state of its own beyond in-progress gesture tracking;
// persistent state (camera, selection, hover) lives on the shared `state`
// object passed in from main.js, and it calls simulation.placeBuilding /
// simulation.removeBuilding directly, as specified.
import {
  screenToGrid, zoomAt, panCamera, GRID_SIZE, MIN_ZOOM, MAX_ZOOM,
} from './render.js';
import { BUILDING_DEFS } from './buildings.js';

export const BULLDOZE_TOOL = '__bulldoze__';

const TAP_THRESHOLD_PX = 6;

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export class InputController {
  constructor(canvas, state, callbacks = {}) {
    this.canvas = canvas;
    this.state = state;
    this.callbacks = callbacks;
    this.pointers = new Map(); // pointerId -> {x, y} in canvas-local px
    this.dragTotal = 0;
    this.pinch = null; // {dist, zoom, midX, midY}
    this.buildingKeys = Object.keys(BUILDING_DEFS);

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);

    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this._onContextMenu);
    window.addEventListener('keydown', this._onKeyDown);
  }

  destroy() {
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
    this.canvas.removeEventListener('wheel', this._onWheel);
    this.canvas.removeEventListener('contextmenu', this._onContextMenu);
    window.removeEventListener('keydown', this._onKeyDown);
  }

  // --- Selection helpers, also used by ui.js palette buttons -------------
  selectBuilding(type) {
    this.state.selectedBuildingType = this.state.selectedBuildingType === type ? null : type;
    this.callbacks.onSelectionChanged?.(this.state.selectedBuildingType);
  }

  deselect() {
    if (!this.state.selectedBuildingType) return;
    this.state.selectedBuildingType = null;
    this.callbacks.onSelectionChanged?.(null);
  }

  rotateGhost() {
    this.state.ghostRotation = (this.state.ghostRotation + 1) % 4;
  }

  _rectPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  _updateHover(x, y) {
    const [gx, gy] = screenToGrid(this.state.camera, x, y);
    if (gx < 0 || gy < 0 || gx >= GRID_SIZE || gy >= GRID_SIZE) {
      this.state.hoverTile = null;
    } else {
      this.state.hoverTile = { x: gx, y: gy };
    }
  }

  _onPointerDown(e) {
    if (this.state.status !== 'playing') return;
    const [x, y] = this._rectPos(e);
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x, y });

    if (this.pointers.size === 1) {
      this.dragTotal = 0;
    } else if (this.pointers.size === 2) {
      const pts = [...this.pointers.values()];
      this.pinch = {
        dist: Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)),
        zoom: this.state.camera.zoom,
        midX: (pts[0].x + pts[1].x) / 2,
        midY: (pts[0].y + pts[1].y) / 2,
      };
      this.dragTotal = Infinity; // a multi-touch gesture is never a tap
    }
    this._updateHover(x, y);
  }

  _onPointerMove(e) {
    const [x, y] = this._rectPos(e);
    this._updateHover(x, y);
    if (!this.pointers.has(e.pointerId)) return;

    const prev = this.pointers.get(e.pointerId);
    this.pointers.set(e.pointerId, { x, y });

    if (this.pointers.size === 1) {
      const dx = x - prev.x;
      const dy = y - prev.y;
      this.dragTotal += Math.hypot(dx, dy);
      panCamera(this.state.camera, dx, dy);
    } else if (this.pointers.size === 2 && this.pinch) {
      const pts = [...this.pointers.values()];
      const dist = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const targetZoom = clamp(this.pinch.zoom * (dist / this.pinch.dist), MIN_ZOOM, MAX_ZOOM);
      const factor = targetZoom / this.state.camera.zoom;
      if (factor !== 1) zoomAt(this.state.camera, midX, midY, factor);
      panCamera(this.state.camera, midX - this.pinch.midX, midY - this.pinch.midY);
      this.pinch.midX = midX;
      this.pinch.midY = midY;
    }
  }

  _onPointerUp(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const wasSize = this.pointers.size;
    this.pointers.delete(e.pointerId);

    if (wasSize === 1 && this.pointers.size === 0) {
      if (this.dragTotal < TAP_THRESHOLD_PX) {
        const [x, y] = this._rectPos(e);
        this._handleTap(x, y);
      }
    } else if (wasSize >= 2) {
      this.pinch = null;
      this.dragTotal = Infinity;
      if (this.pointers.size === 1) {
        // One finger remains after a pinch ends - it should keep panning
        // smoothly rather than being treated as a fresh tap.
        this.dragTotal = Infinity;
      }
    }
  }

  _handleTap(x, y) {
    if (this.state.status !== 'playing') return;
    const [gx, gy] = screenToGrid(this.state.camera, x, y);
    if (gx < 0 || gy < 0 || gx >= GRID_SIZE || gy >= GRID_SIZE) return;

    const type = this.state.selectedBuildingType;
    if (!type) return;

    if (type === BULLDOZE_TOOL) {
      const removed = this.state.simulation.removeBuilding(gx, gy);
      if (removed) this.callbacks.onRemoved?.(gx, gy);
      return;
    }

    const placed = this.state.simulation.placeBuilding(gx, gy, type, this.state.ghostRotation);
    if (placed) {
      this.callbacks.onPlaced?.(gx, gy, type);
    } else {
      this.callbacks.onPlacementRejected?.(gx, gy);
    }
  }

  _onWheel(e) {
    if (this.state.status !== 'playing') return;
    e.preventDefault();
    const [x, y] = this._rectPos(e);
    // Smooth exponential zoom; negative deltaY (scroll up) zooms in.
    const factor = Math.pow(1.0015, -e.deltaY);
    zoomAt(this.state.camera, x, y, factor);
  }

  _onContextMenu(e) {
    e.preventDefault();
    if (this.state.status === 'playing') this.rotateGhost();
  }

  _onKeyDown(e) {
    if (this.state.status !== 'playing') return;
    const key = e.key.toLowerCase();
    if (key === 'r') {
      this.rotateGhost();
      return;
    }
    if (key === 'escape') {
      this.deselect();
      return;
    }
    if (/^[1-9]$/.test(key)) {
      const type = this.buildingKeys[parseInt(key, 10) - 1];
      if (type) this.selectBuilding(type);
    }
  }
}
