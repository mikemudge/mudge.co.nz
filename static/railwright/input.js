// Camera pan/zoom + tool state machine for Railwright. Never mutates
// simulation state directly - it calls documented command methods on
// game.network / game.economy / game.trainManager and reads/writes only the
// shared interaction fields on `game` (tool, camera, selection, hoverTile,
// trackGhost, paused, speed, showMinimap, showBlocks, helpOpen, ...),
// the same fields render.js and ui.js read to draw ghosts/overlays/panels.
// There is no callbacks object: the shared `game` object is the entire
// coordination surface between input.js, ui.js and render.js, except for the
// one signal that only ui.js can act on correctly (closing its topmost open
// panel on Escape without also deselecting) - see the 'railwright:escape'
// window event below.
//
// Screen<->world/tile maths is never duplicated here - it always goes
// through render.js's camera helpers so input.js and render.js can't drift
// out of sync on the camera convention.
import {
  worldToScreen, screenToWorld, screenToTile, clampCamera,
} from './render.js';
import { STATION_RADIUS, DIR_DX, DIR_DY } from './constants.js';
import { toIdx, toXY, signalKeyFor } from './utils.js';

// DESIGN.md §3 - grid/zoom bounds. Defined locally rather than imported:
// they're not in this agent's confirmed constants.js export list, and a
// wrong guess at the export name would crash on the very first import.
const GRID_W = 72;
const GRID_H = 56;
const TILE = 32;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.2;

export const TOOLS = ['inspect', 'track', 'signal', 'station', 'bulldoze', 'wire'];
const TOOL_KEYS = { 1: 'inspect', 2: 'track', 3: 'signal', 4: 'station', 5: 'bulldoze', 6: 'wire' };
const SPEED_STEPS = [0, 1, 2, 4]; // 0 == paused, matches DESIGN.md's speed values

const TAP_THRESHOLD_PX = 6;
const EDGE_PAN_MARGIN = 28; // px from canvas edge that triggers edge-scroll
const KEY_PAN_SPEED = 720; // world px/sec at zoom 1, for WASD/arrow/edge pan
const SIGNAL_HIT_PX = 20; // generous hit-test radius around a track link's midpoint

function isTypingTarget(e) {
  const t = e.target;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'
    || t.tagName === 'SELECT' || t.isContentEditable);
}

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
}

// Shared speed/pause logic - exported so ui.js's HUD speed controls drive
// the exact same state transition as the keyboard shortcuts, rather than a
// second copy of the "0 == paused" rule drifting out of sync.
export function setGameSpeed(game, speed) {
  game.speed = speed;
  game.paused = speed === 0;
  if (game.state === 'playing' || game.state === 'paused') {
    game.state = game.paused ? 'paused' : 'playing';
  }
}

export function stepGameSpeed(game, delta) {
  const i = SPEED_STEPS.indexOf(game.speed);
  const next = SPEED_STEPS[Math.min(SPEED_STEPS.length - 1, Math.max(0, (i < 0 ? 1 : i) + delta))];
  setGameSpeed(game, next);
}

export function togglePause(game) {
  if (game.paused) {
    setGameSpeed(game, game.lastSpeed || 1);
  } else {
    game.lastSpeed = game.speed || 1;
    setGameSpeed(game, 0);
  }
}

export class InputController {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    // Not in DESIGN.md §10's game object, but ui.js needs a canvas reference
    // too (e.g. to centre the camera on a jumped-to train) - stash it here
    // rather than have two separately-configured sources of truth.
    if (!game.canvas) game.canvas = canvas;

    this.pointers = new Map(); // pointerId -> {x, y}
    this.dragTotal = 0;
    this.pinch = null;
    this.panButton = null; // true while a middle/right/space drag is panning
    this.heldKeys = new Set();
    this.spaceHeld = false;
    this.trackDrag = null; // { fromIdx } while laying a track run
    this.bulldozeDragging = false;
    this.wireDragging = false;
    this._lastBulldozeIdx = null;
    this._lastWireIdx = null;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onBlur = this._onBlur.bind(this);

    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this._onContextMenu);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
  }

  destroy() {
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
    this.canvas.removeEventListener('wheel', this._onWheel);
    this.canvas.removeEventListener('contextmenu', this._onContextMenu);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
  }

  // --- Tool state ----------------------------------------------------------
  setTool(tool) {
    if (!TOOLS.includes(tool)) return;
    this._cancelDrag();
    this.game.tool = tool;
  }

  _cancelDrag() {
    this.trackDrag = null;
    this.game.trackGhost = null;
    this.bulldozeDragging = false;
    this.wireDragging = false;
  }

  // --- Per-frame camera pan (WASD / arrows / edge scroll) -------------------
  // Called by main.js's loop with the same `dt` (game seconds) as everything
  // else, so hold-to-pan speed does not depend on frame rate.
  update(dt) {
    if (!this.canvas || this.game.state !== 'playing') return;
    const cam = this.game.camera;
    if (!cam) return;
    let dx = 0;
    let dy = 0;
    if (this.heldKeys.has('arrowleft') || this.heldKeys.has('a')) dx -= 1;
    if (this.heldKeys.has('arrowright') || this.heldKeys.has('d')) dx += 1;
    if (this.heldKeys.has('arrowup') || this.heldKeys.has('w')) dy -= 1;
    if (this.heldKeys.has('arrowdown') || this.heldKeys.has('s')) dy += 1;

    const hover = this._lastPointerPx;
    if (hover && !this.panButton) {
      const rect = this.canvas.getBoundingClientRect();
      if (hover.x < EDGE_PAN_MARGIN) dx -= 1;
      else if (hover.x > rect.width - EDGE_PAN_MARGIN) dx += 1;
      if (hover.y < EDGE_PAN_MARGIN) dy -= 1;
      else if (hover.y > rect.height - EDGE_PAN_MARGIN) dy += 1;
    }

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy) || 1;
      const speed = (KEY_PAN_SPEED * dt) / cam.zoom;
      cam.x += (dx / len) * speed;
      cam.y += (dy / len) * speed;
      clampCamera(cam, this.canvas);
    }
  }

  // --- Pointer helpers -------------------------------------------------------
  _rectPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _tileAt(x, y) {
    const { x: tx, y: ty } = screenToTile(this.game.camera, x, y);
    return { tx, ty, idx: inBounds(tx, ty) ? toIdx(tx, ty) : null };
  }

  _isPanTrigger(e) {
    return e.button === 1 || e.button === 2 || this.spaceHeld;
  }

  // --- Pointer events --------------------------------------------------------
  _onPointerDown(e) {
    if (this.game.state !== 'playing') return;
    const p = this._rectPos(e);
    // Pointer capture can throw (e.g. a synthetic/replayed pointer event with
    // no real active pointer behind it) - never let that abort the rest of
    // the gesture's setup.
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    this.pointers.set(e.pointerId, p);
    this._lastPointerPx = p;

    if (this.pointers.size === 1) {
      this.dragTotal = 0;
      if (this._isPanTrigger(e)) {
        this.panButton = true;
      } else {
        this.panButton = false;
        this._toolPress(p);
      }
    } else if (this.pointers.size === 2) {
      const pts = [...this.pointers.values()];
      this.pinch = {
        dist: Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)),
        zoom: this.game.camera.zoom,
        midX: (pts[0].x + pts[1].x) / 2,
        midY: (pts[0].y + pts[1].y) / 2,
      };
      this.dragTotal = Infinity;
      this.panButton = false;
    }
  }

  _onPointerMove(e) {
    const p = this._rectPos(e);
    this._lastPointerPx = p;
    const { tx, ty, idx } = this._tileAt(p.x, p.y);
    this.game.hoverTile = inBounds(tx, ty) ? { x: tx, y: ty, idx } : null;

    if (!this.pointers.has(e.pointerId)) return;
    const prev = this.pointers.get(e.pointerId);
    this.pointers.set(e.pointerId, p);

    if (this.pointers.size === 1) {
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      this.dragTotal += Math.hypot(dx, dy);
      if (this.panButton) {
        const cam = this.game.camera;
        cam.x -= dx / cam.zoom;
        cam.y -= dy / cam.zoom;
        clampCamera(cam, this.canvas);
      } else {
        this._toolDrag(p);
      }
    } else if (this.pointers.size === 2 && this.pinch) {
      const pts = [...this.pointers.values()];
      const dist = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const targetZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.pinch.zoom * (dist / this.pinch.dist)));
      this._zoomTo(midX, midY, targetZoom);
      const cam = this.game.camera;
      cam.x -= (midX - this.pinch.midX) / cam.zoom;
      cam.y -= (midY - this.pinch.midY) / cam.zoom;
      clampCamera(cam, this.canvas);
      this.pinch.midX = midX;
      this.pinch.midY = midY;
    }
  }

  _onPointerUp(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const wasSize = this.pointers.size;
    const p = this.pointers.get(e.pointerId) || this._lastPointerPx;
    this.pointers.delete(e.pointerId);

    if (wasSize === 1 && this.pointers.size === 0) {
      if (!this.panButton && this.dragTotal < TAP_THRESHOLD_PX) {
        this._toolTap(p);
      }
      this._toolRelease(p);
      this.panButton = false;
    } else if (wasSize >= 2) {
      this.pinch = null;
      this.dragTotal = Infinity;
    }
  }

  _onBlur() {
    this.heldKeys.clear();
    this.spaceHeld = false;
    this.panButton = false;
  }

  // --- Zoom ------------------------------------------------------------------
  _zoomTo(screenX, screenY, targetZoom) {
    const cam = this.game.camera;
    const [wxBefore, wyBefore] = screenToWorld(cam, screenX, screenY);
    cam.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, targetZoom));
    const [wxAfter, wyAfter] = screenToWorld(cam, screenX, screenY);
    cam.x += wxBefore - wxAfter;
    cam.y += wyBefore - wyAfter;
  }

  _onWheel(e) {
    if (this.game.state !== 'playing') return;
    e.preventDefault();
    const p = this._rectPos(e);
    const factor = 1.0015 ** -e.deltaY;
    this._zoomTo(p.x, p.y, this.game.camera.zoom * factor);
    clampCamera(this.game.camera, this.canvas);
  }

  _onContextMenu(e) {
    e.preventDefault(); // right-click is a pan trigger, not a menu
  }

  // --- Tool-specific press/drag/release/tap ----------------------------------
  _toolPress(p) {
    const { idx } = this._tileAt(p.x, p.y);
    const { tool } = this.game;
    if (tool === 'track' && idx != null) {
      this.trackDrag = { fromIdx: idx };
      this.game.trackGhost = null;
    } else if (tool === 'bulldoze') {
      this.bulldozeDragging = true;
      this._lastBulldozeIdx = null;
      this._bulldozeAt(idx);
    } else if (tool === 'wire') {
      this.wireDragging = true;
      this._lastWireIdx = null;
      this._wireAt(idx);
    }
  }

  _toolDrag(p) {
    const { idx } = this._tileAt(p.x, p.y);
    const { tool } = this.game;
    if (tool === 'track' && this.trackDrag && idx != null) {
      this._updateTrackPlan(idx);
    } else if (tool === 'bulldoze' && this.bulldozeDragging) {
      this._bulldozeAt(idx);
    } else if (tool === 'wire' && this.wireDragging) {
      this._wireAt(idx);
    } else if (tool === 'station') {
      this._updateStationHover(idx);
    }
  }

  _toolRelease() {
    const { tool } = this.game;
    if (tool === 'track' && this.trackDrag) {
      this._commitTrackPlan();
    }
    this.trackDrag = null;
    this.bulldozeDragging = false;
    this.wireDragging = false;
  }

  _toolTap(p) {
    const { tool } = this.game;
    const { idx } = this._tileAt(p.x, p.y);
    if (tool === 'inspect') {
      this._inspectAt(p, idx);
    } else if (tool === 'signal') {
      this._toggleSignalNear(p, idx);
    } else if (tool === 'station') {
      this._buildStationAt(idx);
    }
  }

  // --- track tool --------------------------------------------------------
  _updateTrackPlan(toIdxVal) {
    const { network } = this.game;
    if (!network?.planTrack) return;
    try {
      this.game.trackGhost = network.planTrack(this.trackDrag.fromIdx, toIdxVal);
    } catch (err) {
      console.error('planTrack failed', err);
      this.game.trackGhost = null;
    }
  }

  _commitTrackPlan() {
    const plan = this.game.trackGhost;
    this.game.trackGhost = null;
    if (!plan || !plan.legal) {
      if (plan && plan.reason) this._toast(plan.reason, 'bad');
      return;
    }
    const { network } = this.game;
    try {
      const ok = network?.buildTrack?.(plan);
      if (!ok) this._toast('Could not build track there.', 'bad');
    } catch (err) {
      console.error('buildTrack failed', err);
    }
  }

  // --- bulldoze tool -------------------------------------------------------
  // A landslide-blocked tile has no track to remove - bulldozing it instead
  // pays economy.repairTile's fee to clear the blockage.
  _bulldozeAt(idx) {
    if (idx == null || idx === this._lastBulldozeIdx) return;
    this._lastBulldozeIdx = idx;
    const { network, world, economy } = this.game;
    const tile = world?.tiles?.[idx];
    try {
      if (tile?.blocked && typeof economy?.repairTile === 'function') {
        if (!economy.repairTile(idx)) this._toast('Cannot repair that yet.', 'bad');
        return;
      }
      network?.removeTrack?.(idx);
    } catch (err) {
      console.error('removeTrack/repairTile failed', err);
    }
  }

  // --- wire (electrify) tool -------------------------------------------------
  _wireAt(idx) {
    if (idx == null || idx === this._lastWireIdx) return;
    this._lastWireIdx = idx;
    const { network, economy } = this.game;
    if (typeof network?.electrifyTrack !== 'function') return;
    try {
      const result = network.electrifyTrack(idx, economy?.unlockedTechs);
      if (!result?.ok) this._toast(result?.reason || 'Cannot electrify that tile yet.', 'bad');
    } catch (err) {
      console.error('electrifyTrack failed', err);
    }
  }

  // --- station tool ---------------------------------------------------------
  _nearestSite(idx) {
    const sites = this._sitesArray();
    if (!sites.length || idx == null) return null;
    const { x: tx, y: ty } = toXY(idx);
    let best = null;
    let bestDist = Infinity;
    for (const site of sites) {
      if (site.stationId) continue; // already served
      const cx = site.x + 0.5;
      const cy = site.y + 0.5;
      const d = Math.hypot(tx - cx, ty - cy);
      if (d <= STATION_RADIUS && d < bestDist) {
        bestDist = d;
        best = site;
      }
    }
    return best;
  }

  _sitesArray() {
    const src = this.game.world?.sites;
    if (!src) return [];
    if (src instanceof Map) return [...src.values()];
    if (Array.isArray(src)) return src;
    return Object.values(src);
  }

  _updateStationHover(idx) {
    const { network } = this.game;
    const hasTrack = idx != null && !!network?.track?.has?.(idx);
    const site = hasTrack ? this._nearestSite(idx) : null;
    this.game.stationHover = site ? { idx, siteId: site.id, siteName: site.name, valid: true } : null;
  }

  _buildStationAt(idx) {
    this._updateStationHover(idx);
    const hover = this.game.stationHover;
    if (!hover || !hover.valid) {
      this._toast('Stations must be built on track near an unserved site.', 'bad');
      return;
    }
    const site = this._sitesArray().find((s) => s.id === hover.siteId);
    // network.js has no site lookup of its own (by design - see its
    // buildStation comment), so the caller supplies what the station should
    // serve: a name and the site's `consumes` items as `accepts`.
    const opts = {
      name: site?.name ? `${site.name} Station` : undefined,
      accepts: (site?.consumes || []).map((c) => c.item),
    };
    const { network } = this.game;
    try {
      const result = network?.buildStation?.(hover.siteId, idx, opts);
      if (!result?.ok) this._toast(result?.reason || 'Could not build a station there.', 'bad');
    } catch (err) {
      console.error('buildStation failed', err);
    }
  }

  // --- signal tool -----------------------------------------------------------
  // Signals live on a link between two tiles, not on a tile, so hit-testing
  // scans the small set of links near the click and picks whichever link's
  // screen-space midpoint is closest - generous on purpose per the design brief.
  _toggleSignalNear(p, idx) {
    const { network } = this.game;
    if (!network?.track || idx == null) return;
    const { x: tx, y: ty } = toXY(idx);
    let bestKey = null;
    let bestA = null;
    let bestB = null;
    let bestDist = Infinity;
    for (let ny = ty - 1; ny <= ty + 1; ny += 1) {
      for (let nx = tx - 1; nx <= tx + 1; nx += 1) {
        if (!inBounds(nx, ny)) continue;
        const a = toIdx(nx, ny);
        const trackA = network.track.get(a);
        if (!trackA) continue;
        for (let d = 0; d < 8; d += 1) {
          if (!((trackA.links >> d) & 1)) continue;
          const bx = nx + DIR_DX[d];
          const by = ny + DIR_DY[d];
          if (!inBounds(bx, by)) continue;
          const b = toIdx(bx, by);
          if (b < a) continue; // visit each link once (a < b)
          const [ax, ay] = worldToScreen(this.game.camera, (nx + 0.5) * TILE, (ny + 0.5) * TILE);
          const [bxs, bys] = worldToScreen(this.game.camera, (bx + 0.5) * TILE, (by + 0.5) * TILE);
          const midX = (ax + bxs) / 2;
          const midY = (ay + bys) / 2;
          const dist = Math.hypot(p.x - midX, p.y - midY);
          if (dist < bestDist && dist <= SIGNAL_HIT_PX) {
            bestDist = dist;
            bestKey = signalKeyFor(a, b);
            bestA = a;
            bestB = b;
          }
        }
      }
    }
    if (bestKey == null) return;
    try {
      if (network.signals?.has?.(bestKey)) {
        network.removeSignal?.(bestA, bestB);
      } else {
        network.placeSignal?.(bestA, bestB);
      }
    } catch (err) {
      console.error('signal toggle failed', err);
    }
  }

  // --- inspect tool ------------------------------------------------------
  _inspectAt(p, idx) {
    const train = this._hitTestTrain(p);
    if (train) {
      this._select('train', train.id);
      return;
    }
    if (idx != null) {
      const station = this._stationAt(idx);
      if (station) {
        this._select('station', station.id);
        return;
      }
      const site = this._siteAt(idx);
      if (site) {
        this._select('site', site.id);
        return;
      }
    }
    this._select(null, null);
  }

  _hitTestTrain(p) {
    const trains = this.game.trains;
    if (!Array.isArray(trains)) return null;
    let best = null;
    let bestDist = Infinity;
    for (const t of trains) {
      if (t.headIdx == null) continue;
      const { x: tx, y: ty } = toXY(t.headIdx);
      const [sx, sy] = worldToScreen(this.game.camera, (tx + 0.5) * TILE, (ty + 0.5) * TILE);
      const dist = Math.hypot(p.x - sx, p.y - sy);
      if (dist < bestDist && dist <= TILE * this.game.camera.zoom * 0.6) {
        bestDist = dist;
        best = t;
      }
    }
    return best;
  }

  _stationAt(idx) {
    // network.js is the module that actually owns the stations Map;
    // game.stations (DESIGN.md §10) is expected to be the same reference.
    const stations = this.game.stations ?? this.game.network?.stations;
    if (!stations) return null;
    const list = stations instanceof Map ? [...stations.values()] : Object.values(stations);
    return list.find((s) => s.tiles?.includes(idx)) || null;
  }

  _siteAt(idx) {
    // world.siteAt is an O(1) lookup via each tile's siteId; fall back to a
    // footprint scan if world.js hasn't wired that up.
    if (typeof this.game.world?.siteAt === 'function') return this.game.world.siteAt(idx);
    const { x: tx, y: ty } = toXY(idx);
    return this._sitesArray().find((s) => tx >= s.x && tx < s.x + 2 && ty >= s.y && ty < s.y + 2) || null;
  }

  _select(kind, id) {
    this.game.selection = { kind, id };
    this.game.bus?.emit?.('selection:changed', { kind, id });
  }

  _toast(text, kind = 'info') {
    this.game.bus?.emit?.('toast', { text, kind });
  }

  // --- Keyboard --------------------------------------------------------------
  _onKeyDown(e) {
    if (isTypingTarget(e)) return;
    const key = e.key.toLowerCase();
    if (key === ' ') {
      this.spaceHeld = true;
      if (!e.repeat) togglePause(this.game);
      e.preventDefault();
      return;
    }
    this.heldKeys.add(key);
    if (this.game.state !== 'playing' && key !== '?') return;
    if (key === 'escape') {
      if (this.trackDrag || this.bulldozeDragging || this.wireDragging) {
        this._cancelDrag();
      } else {
        // ui.js owns which panel (if any) is topmost, so it decides whether
        // Escape closes a panel or falls through to deselecting.
        window.dispatchEvent(new CustomEvent('railwright:escape'));
      }
      return;
    }
    if (/^[1-6]$/.test(key)) {
      this.setTool(TOOL_KEYS[key]);
      return;
    }
    if (key === '+' || key === '=') {
      stepGameSpeed(this.game, 1);
    } else if (key === '-' || key === '_') {
      stepGameSpeed(this.game, -1);
    } else if (key === 'm') {
      this.game.showMinimap = !this.game.showMinimap;
    } else if (key === 'b') {
      this.game.showBlocks = !this.game.showBlocks;
    } else if (key === '?' || key === '/') {
      this.game.helpOpen = !this.game.helpOpen;
    }
  }

  _onKeyUp(e) {
    if (isTypingTarget(e)) return;
    const key = e.key.toLowerCase();
    if (key === ' ') this.spaceHeld = false;
    this.heldKeys.delete(key);
  }
}
