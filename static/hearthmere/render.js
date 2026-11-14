/**
 * Hearthmere — all canvas drawing (DESIGN §1 art direction, §3 projection).
 *
 * Reads simulation state and paints it. It never writes a single field on
 * world/buildings/villagers/economy/military — that is a frozen rule (§2) and
 * the only render-owned mutable state in here is view state (camera fallback,
 * overlay choice, caches, decorative rubble timers).
 *
 * No DOM at module scope: everything that touches `document` lives inside
 * init() or later (§18), so this file imports cleanly under Node 22.
 *
 * Layering, in order:
 *   sky -> cached ground chunks -> hover/selection footprint -> sorted entity
 *   pass -> ambient day/night tint -> emissive pass (windows, braziers,
 *   market) -> particles -> overlays -> build ghost -> screen-space HUD bits.
 * The tint is one full-screen multiply, which is why lit windows are collected
 * during the entity pass and painted afterwards: light belongs on top of dusk.
 */

import * as C from './constants.js';
import * as U from './utils.js';

const HW = C.TILE_W / 2;
const HH = C.TILE_H / 2;
const GW = C.GRID_W;
const GH = C.GRID_H;

// Ground is cached to offscreen canvases in blocks of this many tiles. Terrain
// changes rarely and re-jittering 5184 diamonds every frame will not hold
// 60fps, so chunks are built once and blitted until something dirties them.
const CHUNK = 8;
const CHUNKS_X = Math.ceil(GW / CHUNK);
const CHUNKS_Y = Math.ceil(GH / CHUNK);
const CHUNK_BUILD_BUDGET = 3;   // per frame, so a pan never stalls a frame
const CHUNK_CACHE_MAX = 48;

// Cosmetic only: a tile of elevation lifts its diamond by this many world px.
const ELEV_LIFT = 6;

// How far a cliff face is sunk under the tile in front of it, so the tile that
// paints over its base cannot nibble the face itself.
const FACE_BURY = 2;

// Deepest a tile can hang below its own diamond: the 4-step drop the map
// generator can produce, plus the bury. Ground chunks reserve this much.
const FACE_DROP = ELEV_LIFT * 4 + FACE_BURY;

// Tonal steps a terrain type is painted in, per tile, from its colour/colourAlt.
const GROUND_TONES = 6;

// World px the tallest thing (a Keep, a cathedral spire) rises above its tile.
const TALLEST = 130;

// Detail level for the current frame, set from the camera zoom at the top of
// update(). 2 = full, 1 = no hairline detail, 0 = sub-pixel detail dropped.
// Module-scope because the shape drawers are plain functions and the renderer
// is single-threaded: whoever is mid-update owns it.
let DETAIL = 2;

const SUB_RUBBLE = 0;
const SUB_PROP = 1;
const SUB_BUILDING = 2;
const SUB_UNIT = 3;

const KIND_PROP = 0;
const KIND_BUILDING = 1;
const KIND_RUBBLE = 2;
const KIND_UNIT = 3;
const KIND_ENEMY = 4;

export const OVERLAY_NAMES = ['roads', 'happiness', 'food', 'raid'];

/* ------------------------------------------------------------------ *
 * Terrain blend ranks (§1: water < sand < grass < meadow < forest < rock)
 * ------------------------------------------------------------------ */

// SHORE and MOUNTAIN are absent from the frozen priority list; shore sits just
// above water (it is water) and mountain above everything (it overhangs).
const BLEND_RANK = new Int8Array(8);
(function buildBlendRank() {
  for (let i = 0; i < C.TERRAIN_BLEND_PRIORITY.length; i++) {
    BLEND_RANK[C.TERRAIN_BLEND_PRIORITY[i]] = (i + 1) * 2;
  }
  BLEND_RANK[C.TERRAIN.SHORE] = BLEND_RANK[C.TERRAIN.WATER] + 1;
  BLEND_RANK[C.TERRAIN.MOUNTAIN] = 14;
})();

/* ------------------------------------------------------------------ *
 * Placement refusals (§7's checks) mapped to the tile test behind them
 * ------------------------------------------------------------------ */

// The reason strings are frozen by §7 and ADDENDUM P3. A reason absent here
// is one no single tile is to blame for — cost, tier, an empty gather radius.
const FAULT_MODE = {
  'needs flat ground': 1,
  'a building is in the way': 2,
  'a building is there': 2,
  'a road is in the way': 3,
  'a road is already here': 3,
  'too close to a wall': 4,
  'blocked': 5,
  'needs dry land': 5,
  'trees in the way': 5,
  'too rocky to build on': 5,
  'too steep to build on': 5,
  'needs rock': 6,
  'needs meadow': 6,
  'needs water': 6,
};

const FOOTPRINT_TERRAIN = {
  'needs rock': [C.TERRAIN.ROCK],
  'needs meadow': [C.TERRAIN.MEADOW],
  'needs water': [C.TERRAIN.WATER, C.TERRAIN.SHORE],
};

/** §5's buildable terrain, plus the quarry/mine exception §7 check 3 makes. */
function groundOkFor(def, t) {
  const info = C.TERRAIN_INFO[t];
  if (info && info.buildable) return true;
  return def.needsTerrain === 'rock' && t === C.TERRAIN.ROCK;
}

// Orthogonal neighbours in the order E, S, W, N — and the two diamond corners
// each of those edges is shared with. EDGE_* are offsets from the tile centre.
const NB_DX = [1, 0, -1, 0];
const NB_DY = [0, 1, 0, -1];
const NB_T = new Int8Array(4);
const EDGE_X = [HW, 0, 0, -HW, -HW, 0, 0, HW];
const EDGE_Y = [0, HH, HH, 0, 0, -HH, -HH, 0];
const EMPTY = [];

/* ------------------------------------------------------------------ *
 * Day / night keyframes
 * ------------------------------------------------------------------ */

// `tint` is multiplied over the finished world at `amt` alpha; `night` drives
// how strongly windows, braziers and the market glow.
// Dawn breaks by NIGHT_END and dusk closes after NIGHT_START (constants.js),
// so the working day is lit end to end rather than starting in the dark.
const SKY_STOPS = [
  { t: 0.00, sky: '#0c1230', tint: '#1a2352', amt: 0.66, night: 1.00 },
  { t: 0.14, sky: '#151e42', tint: '#20294f', amt: 0.60, night: 1.00 },
  { t: 0.20, sky: '#453b58', tint: '#6d4a58', amt: 0.34, night: 0.55 },
  { t: 0.28, sky: '#7d7370', tint: '#d9895a', amt: 0.16, night: 0.12 },
  { t: 0.42, sky: '#96a08e', tint: '#fff0d2', amt: 0.05, night: 0.00 },
  { t: 0.56, sky: '#9aa694', tint: '#fff4d8', amt: 0.04, night: 0.00 },
  { t: 0.70, sky: '#ab9478', tint: '#f2b273', amt: 0.13, night: 0.00 },
  { t: 0.82, sky: '#7a5d61', tint: '#d3753f', amt: 0.25, night: 0.28 },
  { t: 0.90, sky: '#372f4e', tint: '#493a61', amt: 0.45, night: 0.78 },
  { t: 0.96, sky: '#151b3b', tint: '#1c2550', amt: 0.62, night: 1.00 },
  { t: 1.01, sky: '#0c1230', tint: '#1a2352', amt: 0.66, night: 1.00 },
];

// Seasonal wash mixed into every ground colour before it is cached.
const SEASON_WASH = [
  { hex: '#93b56a', amt: 0.16, sky: '#8fa27f' },   // Spring — fresh green
  { hex: '#cdb452', amt: 0.11, sky: '#a8a582' },   // Summer — gold
  { hex: '#b06a33', amt: 0.22, sky: '#a88a68' },   // Autumn — rust
  { hex: '#e2e9f2', amt: 0.52, sky: '#8e9aa8' },   // Winter — snow
];

const AUTUMN_LEAF = ['#b4632c', '#c8863a', '#95452c', '#a8752f'];
const SPRING_LEAF = ['#5d8a4e', '#6d9a55', '#7aa85e', '#588047'];
const SUMMER_LEAF = ['#4f7a46', '#5d8a4c', '#69954f', '#456c3f'];
const WINTER_LEAF = ['#3d5442', '#46604a', '#354a3b', '#3f5845'];

/* ------------------------------------------------------------------ *
 * Tiny drawing helpers (no allocation)
 * ------------------------------------------------------------------ */

/**
 * Tile centre in iso world pixels. FROZEN by ADDENDUM F3: the centre of tile
 * (tx, ty) is isoX/isoY(tx + 0.5, ty + 0.5), which is the same x as
 * isoX(tx, ty) but a half-diamond lower — treating isoX(tx, ty) as the centre
 * is the half-tile bug, and it would put every drawn tile half a diamond away
 * from the tile input.js picks.
 */
function tcx(tx, ty) {
  return (tx - ty) * HW;
}

function tcy(tx, ty) {
  return (tx + ty + 1) * HH;
}

function tri(g, ax, ay, bx, by, cx, cy) {
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(bx, by);
  g.lineTo(cx, cy);
  g.closePath();
  g.fill();
}

function quad(g, ax, ay, bx, by, cx, cy, dx, dy) {
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(bx, by);
  g.lineTo(cx, cy);
  g.lineTo(dx, dy);
  g.closePath();
  g.fill();
}

// Two stacked bands deep, so a one-step lip is about 0.14 alpha at the edge.
const BROW_FILL = ['rgba(30,24,19,0.083)', 'rgba(30,24,19,0.112)', 'rgba(30,24,19,0.140)'];

/**
 * The shaded lip along a tile edge that steps down away from the camera. Two
 * stacked bands rather than a gradient: a chunk rebuild paints thousands of
 * these and a per-tile createLinearGradient is not worth the edge.
 */
function brow(g, cx, cy, ax, ay, bx, by, steps) {
  g.fillStyle = BROW_FILL[steps < 1 ? 0 : steps > 3 ? 2 : steps - 1];
  for (let i = 0; i < 2; i++) {
    const u = i === 0 ? 0.34 : 0.15;
    quad(g, ax, ay, bx, by, lerpN(bx, cx, u), lerpN(by, cy, u), lerpN(ax, cx, u), lerpN(ay, cy, u));
  }
}

function dot(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, 6.2831853);
  g.fill();
}

function ellipse(g, x, y, rx, ry) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, 6.2831853);
  g.fill();
}

function line(g, ax, ay, bx, by, w, hex) {
  g.strokeStyle = hex;
  g.lineWidth = w;
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(bx, by);
  g.stroke();
}

/** Point at parameter u along a->b, raised by v * height. */
function faceX(ax, bx, u) {
  return ax + (bx - ax) * u;
}

function faceY(ay, by, u, lift) {
  return ay + (by - ay) * u - lift;
}

function lerpN(a, b, t) {
  return a + (b - a) * t;
}

/* ------------------------------------------------------------------ *
 * Footprint geometry
 * ------------------------------------------------------------------ */

/**
 * The rhombus covering a w*h footprint whose north (top) tile is (x, y),
 * written into `o`. Corners are named for the compass direction they point in
 * screen space: n = top, e = right, s = bottom, w = left.
 */
function footprint(o, x, y, w, h, inset) {
  const nx = tcx(x, y);
  const ny = tcy(x, y) - HH;
  const ex = tcx(x + w - 1, y) + HW;
  const ey = tcy(x + w - 1, y);
  const sx = tcx(x + w - 1, y + h - 1);
  const sy = tcy(x + w - 1, y + h - 1) + HH;
  const wx = tcx(x, y + h - 1) - HW;
  const wy = tcy(x, y + h - 1);
  const cx = (nx + ex + sx + wx) * 0.25;
  const cy = (ny + ey + sy + wy) * 0.25;
  o.cx = cx;
  o.cy = cy;
  o.nx = lerpN(cx, nx, inset); o.ny = lerpN(cy, ny, inset);
  o.ex = lerpN(cx, ex, inset); o.ey = lerpN(cy, ey, inset);
  o.sx = lerpN(cx, sx, inset); o.sy = lerpN(cy, sy, inset);
  o.wx = lerpN(cx, wx, inset); o.wy = lerpN(cy, wy, inset);
  return o;
}

function newRhomb() {
  return { nx: 0, ny: 0, ex: 0, ey: 0, sx: 0, sy: 0, wx: 0, wy: 0, cx: 0, cy: 0 };
}

/** Copy `a` into `b`, lifted by `dy` world px and scaled about its centre. */
function raise(a, b, dy, scale) {
  const s = scale === undefined ? 1 : scale;
  b.cx = a.cx; b.cy = a.cy - dy;
  b.nx = lerpN(a.cx, a.nx, s); b.ny = lerpN(a.cy, a.ny, s) - dy;
  b.ex = lerpN(a.cx, a.ex, s); b.ey = lerpN(a.cy, a.ey, s) - dy;
  b.sx = lerpN(a.cx, a.sx, s); b.sy = lerpN(a.cy, a.sy, s) - dy;
  b.wx = lerpN(a.cx, a.wx, s); b.wy = lerpN(a.cy, a.wy, s) - dy;
  return b;
}

function fillRhomb(g, o) {
  g.beginPath();
  g.moveTo(o.nx, o.ny);
  g.lineTo(o.ex, o.ey);
  g.lineTo(o.sx, o.sy);
  g.lineTo(o.wx, o.wy);
  g.closePath();
  g.fill();
}

// Scratch rhombi. The renderer is single-threaded and these never escape a
// draw call, so reusing them keeps the entity pass allocation-free.
const RH_A = newRhomb();
const RH_B = newRhomb();
const RH_C = newRhomb();
const RH_D = newRhomb();

/* ------------------------------------------------------------------ *
 * What the shape drawer actually raised
 * ------------------------------------------------------------------ */

/**
 * Damage and repair are painted on a building's real masonry, so they need the
 * wall box and the roof the shape drawer just put down. A parallel table of
 * per-shape heights would drift the first time a drawer changed, so `box()`
 * and `roof()` record the largest one they draw instead. Recording is off
 * unless drawBuilding turns it on, so an unhurt town pays nothing for it.
 */
let SHAPE_REC = false;
const WALL_REC = { area: 0, base: newRhomb(), top: newRhomb() };
const ROOF_REC = { area: 0, alongX: false, ax: 0, ay: 0, bx: 0, by: 0, eaves: newRhomb() };

function copyRhomb(a, b) {
  b.nx = a.nx; b.ny = a.ny;
  b.ex = a.ex; b.ey = a.ey;
  b.sx = a.sx; b.sy = a.sy;
  b.wx = a.wx; b.wy = a.wy;
  b.cx = a.cx; b.cy = a.cy;
}

/** Screen area of a rhombus, near enough: the two diagonals multiplied. */
function rhombSpan(o) {
  return (o.ex - o.wx) * (o.sy - o.ny);
}

// Scratch points for the wall/roof parameterisations below.
const PT0 = { x: 0, y: 0 };
const PT1 = { x: 0, y: 0 };
const PT2 = { x: 0, y: 0 };
const PT3 = { x: 0, y: 0 };

/**
 * A point on one of the two camera-facing wall faces of the recorded box.
 * `side` 0 is the W-S edge and 1 the S-E edge; `u` runs along that edge and
 * `v` climbs the wall, so a tapered box is followed rather than guessed at.
 * The same face parameterisation `window2` hangs panes on.
 */
function wallPt(u, v, side, out) {
  const b = WALL_REC.base, t = WALL_REC.top;
  const bax = side ? b.sx : b.wx, bay = side ? b.sy : b.wy;
  const bbx = side ? b.ex : b.sx, bby = side ? b.ey : b.sy;
  const tax = side ? t.sx : t.wx, tay = side ? t.sy : t.wy;
  const tbx = side ? t.ex : t.sx, tby = side ? t.ey : t.sy;
  out.x = lerpN(lerpN(bax, bbx, u), lerpN(tax, tbx, u), v);
  out.y = lerpN(lerpN(bay, bby, u), lerpN(tay, tby, u), v);
  return out;
}

/**
 * A point on the camera-facing slope of the recorded roof: `u` runs along the
 * ridge, `v` climbs from the eaves (0) to the ridge (1).
 */
function roofPt(u, v, out) {
  const e = ROOF_REC.eaves;
  const f0x = ROOF_REC.alongX ? e.wx : e.ex;
  const f0y = ROOF_REC.alongX ? e.wy : e.ey;
  out.x = lerpN(lerpN(f0x, e.sx, u), lerpN(ROOF_REC.ax, ROOF_REC.bx, u), v);
  out.y = lerpN(lerpN(f0y, e.sy, u), lerpN(ROOF_REC.ay, ROOF_REC.by, u), v);
  return out;
}

/** A quad in wall-face (u, v) space, on both camera-facing faces if asked. */
function wallQuad(g, u0, u1, v0, v1, side) {
  wallPt(u0, v0, side, PT0);
  wallPt(u1, v0, side, PT1);
  wallPt(u1, v1, side, PT2);
  wallPt(u0, v1, side, PT3);
  quad(g, PT0.x, PT0.y, PT1.x, PT1.y, PT2.x, PT2.y, PT3.x, PT3.y);
}

/**
 * Extrude a footprint upward into a box: left face 12% darker than the top,
 * right face 22% darker (§1). `top` receives the raised rhombus so callers can
 * put a roof on it.
 */
function box(g, o, lift, height, col, top, topScale) {
  raise(o, top, lift + height, topScale);
  raise(o, RH_D, lift, 1);
  // Left face: the S-W edge, facing the viewer's lower left.
  g.fillStyle = col.wallL;
  quad(g, RH_D.wx, RH_D.wy, RH_D.sx, RH_D.sy, top.sx, top.sy, top.wx, top.wy);
  // Right face: the E-S edge.
  g.fillStyle = col.wallR;
  quad(g, RH_D.sx, RH_D.sy, RH_D.ex, RH_D.ey, top.ex, top.ey, top.sx, top.sy);
  g.fillStyle = col.wall;
  fillRhomb(g, top);
  if (SHAPE_REC) {
    const a = rhombSpan(top);
    if (a > WALL_REC.area) {
      WALL_REC.area = a;
      copyRhomb(RH_D, WALL_REC.base);
      copyRhomb(top, WALL_REC.top);
    }
  }
  return top;
}

/**
 * Pitched roof over the rhombus `o`. `hip` 0 gives gable ends (a triangle at
 * each end of a full-length ridge), 0.25 gives a hipped roof. `alongX` runs
 * the ridge down the tile-x axis, which is the long axis when w >= h.
 */
function roof(g, o, height, col, alongX, hip) {
  let a1x, a1y, b1x, b1y, p0x, p0y, p1x, p1y, q0x, q0y, q1x, q1y;
  if (alongX) {
    p0x = o.wx; p0y = o.wy; p1x = o.nx; p1y = o.ny;   // upper-left edge
    q0x = o.sx; q0y = o.sy; q1x = o.ex; q1y = o.ey;   // lower-right edge
  } else {
    p0x = o.nx; p0y = o.ny; p1x = o.ex; p1y = o.ey;
    q0x = o.wx; q0y = o.wy; q1x = o.sx; q1y = o.sy;
  }
  const mAx = (p0x + p1x) * 0.5;
  const mAy = (p0y + p1y) * 0.5;
  const mBx = (q0x + q1x) * 0.5;
  const mBy = (q0y + q1y) * 0.5;
  a1x = lerpN(mAx, mBx, hip); a1y = lerpN(mAy, mBy, hip) - height;
  b1x = lerpN(mBx, mAx, hip); b1y = lerpN(mBy, mAy, hip) - height;
  if (SHAPE_REC) {
    const a = rhombSpan(o);
    if (a > ROOF_REC.area) {
      ROOF_REC.area = a;
      ROOF_REC.alongX = alongX;
      ROOF_REC.ax = a1x; ROOF_REC.ay = a1y;
      ROOF_REC.bx = b1x; ROOF_REC.by = b1y;
      copyRhomb(o, ROOF_REC.eaves);
    }
  }

  if (alongX) {
    // Back slope (faces away, up-right), then the two ends, then the front.
    g.fillStyle = col.roofB;
    quad(g, o.nx, o.ny, o.ex, o.ey, b1x, b1y, a1x, a1y);
    g.fillStyle = col.roofE;
    tri(g, o.wx, o.wy, o.nx, o.ny, a1x, a1y);
    tri(g, o.sx, o.sy, o.ex, o.ey, b1x, b1y);
    g.fillStyle = col.roof;
    quad(g, o.wx, o.wy, o.sx, o.sy, b1x, b1y, a1x, a1y);
  } else {
    g.fillStyle = col.roofB;
    quad(g, o.nx, o.ny, o.wx, o.wy, b1x, b1y, a1x, a1y);
    g.fillStyle = col.roofE;
    tri(g, o.nx, o.ny, o.ex, o.ey, a1x, a1y);
    tri(g, o.wx, o.wy, o.sx, o.sy, b1x, b1y);
    g.fillStyle = col.roof;
    quad(g, o.ex, o.ey, o.sx, o.sy, b1x, b1y, a1x, a1y);
  }
  // Courses across the visible slope: what stops a big roof reading as a flat
  // polygon at zoom 1, and sub-pixel noise below it.
  if (DETAIL < 2) {
    line(g, a1x, a1y, b1x, b1y, 1.2, col.ridge);
    ROOF_OUT.ax = a1x; ROOF_OUT.ay = a1y; ROOF_OUT.bx = b1x; ROOF_OUT.by = b1y;
    return ROOF_OUT;
  }
  const fx0 = alongX ? o.wx : o.ex;
  const fy0 = alongX ? o.wy : o.ey;
  const fx1 = alongX ? o.sx : o.sx;
  const fy1 = alongX ? o.sy : o.sy;
  g.strokeStyle = col.course;
  g.lineWidth = 0.9;
  g.beginPath();
  for (let i = 1; i < 5; i++) {
    const k = i / 5;
    g.moveTo(lerpN(fx0, a1x, k), lerpN(fy0, a1y, k));
    g.lineTo(lerpN(fx1, b1x, k), lerpN(fy1, b1y, k));
  }
  g.stroke();
  // Ridge catches the last of the light; in winter it catches snow instead.
  line(g, a1x, a1y, b1x, b1y, 1.2, col.ridge);
  ROOF_OUT.ax = a1x; ROOF_OUT.ay = a1y; ROOF_OUT.bx = b1x; ROOF_OUT.by = b1y;
  return ROOF_OUT;
}

const ROOF_OUT = { ax: 0, ay: 0, bx: 0, by: 0 };

/** Pyramid / cone cap over a rhombus — spires, turrets, tower tops. */
function cap(g, o, height, col) {
  const ax = o.cx;
  const ay = o.cy - height;
  g.fillStyle = col.roofB;
  tri(g, o.nx, o.ny, o.ex, o.ey, ax, ay);
  tri(g, o.wx, o.wy, o.nx, o.ny, ax, ay);
  g.fillStyle = col.roof;
  tri(g, o.wx, o.wy, o.sx, o.sy, ax, ay);
  g.fillStyle = col.roofE;
  tri(g, o.sx, o.sy, o.ex, o.ey, ax, ay);
  CAP_OUT.x = ax; CAP_OUT.y = ay;
  return CAP_OUT;
}

const CAP_OUT = { x: 0, y: 0 };

/**
 * A window on one of the two visible wall faces. `o` is the TOP rhombus of the
 * wall box; `side` 0 = left (W-S edge), 1 = right (S-E edge); `u` runs along
 * that edge and `down` is the fraction of `wallH` below the eaves.
 * Records a glow when the town is lit so the emissive pass can find it.
 */
function window2(R, g, o, wallH, down, side, u, wpx, hpx, col) {
  let ax, ay, bx, by;
  if (side === 0) { ax = o.wx; ay = o.wy; bx = o.sx; by = o.sy; }
  else { ax = o.sx; ay = o.sy; bx = o.ex; by = o.ey; }
  const len = Math.hypot(bx - ax, by - ay);
  if (len < 1) return;
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  const px = faceX(ax, bx, u) + ux * -wpx * 0.5;
  const py = faceY(ay, by, u, -wallH * down) + uy * -wpx * 0.5;
  if (DETAIL < 1) {
    // Below this the pane is sub-pixel, but the light it throws is not.
    if (R.lit) R.addGlow(px, py, 16 + wpx * 2.2, 0.5);
    return;
  }
  g.fillStyle = R.lit ? col.glass : col.glassDay;
  g.beginPath();
  g.moveTo(px, py);
  g.lineTo(px + ux * wpx, py + uy * wpx);
  g.lineTo(px + ux * wpx, py + uy * wpx + hpx);
  g.lineTo(px, py + hpx);
  g.closePath();
  g.fill();
  if (R.lit) R.addGlow(px + ux * wpx * 0.5, py + hpx * 0.5, 16 + wpx * 2.2, 0.5);
}

const RH_E = newRhomb();
const RH_F = newRhomb();
const RH_G = newRhomb();
const RH_SITE = newRhomb();

// Bare, unweathered timber: the tone every site's ghost is washed toward.
const SITE_TIMBER = '#e2d3b0';

// Eaves height per shape, so a site's scaffolding is as tall as the thing it
// will become: a Chapel towers over a hut from the first peg.
const SITE_WALL_H = {
  hut: 15, house: 18, hall: 24, church: 30, keep: 34, tower: 36,
  workshop: 18, store: 22, yard: 10, field: 4, mine: 13, well: 10,
  wall: 10, gate: 16,
};

// Stand-in instance for the blueprint ghost: the shape drawers only read the
// footprint origin and (for stores) the inventory, and a site has neither yet.
const SITE_B = { x: 0, y: 0, id: -1, inv: null, built: true };

/** Chimney stack with a lit mouth at night. */
function chimney(g, R, x, y, w, h, col) {
  g.fillStyle = col.trimD;
  quad(g, x - w * 0.5, y, x, y + w * 0.32, x, y + w * 0.32 - h, x - w * 0.5, y - h);
  g.fillStyle = col.trim;
  quad(g, x, y + w * 0.32, x + w * 0.5, y, x + w * 0.5, y - h, x, y + w * 0.32 - h);
  g.fillStyle = col.trimL;
  quad(g, x, y + w * 0.32 - h, x + w * 0.5, y - h, x, y - w * 0.32 - h, x - w * 0.5, y - h);
  if (R.lit) {
    g.fillStyle = '#c8642a';
    dot(g, x, y - h - w * 0.1, w * 0.22);
    R.addGlow(x, y - h, 14, 0.35);
  }
}

/** Snow settles on the up-facing planes in Winter (§1: Winter must look hard). */
function snowRoof(g, o, r, alongX) {
  g.fillStyle = 'rgba(238,244,252,0.62)';
  if (alongX) quad(g, o.nx, o.ny, o.ex, o.ey, r.bx, r.by, r.ax, r.ay);
  else quad(g, o.nx, o.ny, o.wx, o.wy, r.bx, r.by, r.ax, r.ay);
  g.fillStyle = 'rgba(246,250,255,0.45)';
  if (alongX) quad(g, o.wx, o.wy, o.sx, o.sy, r.bx, r.by, r.ax, r.ay);
  else quad(g, o.ex, o.ey, o.sx, o.sy, r.bx, r.by, r.ax, r.ay);
}

/* ------------------------------------------------------------------ *
 * Shape drawers — one recognisable silhouette per `shape` hint.
 * Each takes the full-size footprint rhombus `base` and draws in world px.
 * ------------------------------------------------------------------ */

function drawHut(R, g, base, def, b, col, lift) {
  const t = raise(base, RH_B, 0, 0.60);
  const top = box(g, t, lift, 10, col, RH_C, 1);
  const r = roof(g, top, 14, col, def.w >= def.h, 0);
  window2(R, g, top, 10, 0.30, 1, 0.55, 3.4, 3.4, col);
  // Door on the left face, and a drying rack leaning on the gable end.
  g.fillStyle = col.trimD;
  quad(g, faceX(top.wx, top.sx, 0.36), faceY(top.wy, top.sy, 0.36, -10),
    faceX(top.wx, top.sx, 0.56), faceY(top.wy, top.sy, 0.56, -10),
    faceX(top.wx, top.sx, 0.56), faceY(top.wy, top.sy, 0.56, 0),
    faceX(top.wx, top.sx, 0.36), faceY(top.wy, top.sy, 0.36, 0));
  line(g, top.ex + 2, top.ey, top.ex - 1, top.ey - 13, 1.3, col.trimD);
  if (R.winter) snowRoof(g, top, r, def.w >= def.h);
}

function drawHouse(R, g, base, def, b, col, lift) {
  const t = raise(base, RH_B, 0, 0.70);
  const wallH = 13 + def.houses * 0.35;
  const top = box(g, t, lift, wallH, col, RH_C, 1);
  const alongX = def.w >= def.h;
  const r = roof(g, top, 13 + wallH * 0.2, col, alongX, 0);
  window2(R, g, top, wallH, 0.28, 0, 0.30, 3.2, 3.6, col);
  window2(R, g, top, wallH, 0.28, 1, 0.68, 3.2, 3.6, col);
  // Door, then the chimney on the ridge's high end.
  g.fillStyle = col.trimD;
  quad(g, faceX(top.sx, top.ex, 0.28), faceY(top.sy, top.ey, 0.28, -wallH * 0.62),
    faceX(top.sx, top.ex, 0.46), faceY(top.sy, top.ey, 0.46, -wallH * 0.62),
    faceX(top.sx, top.ex, 0.46), faceY(top.sy, top.ey, 0.46, 0),
    faceX(top.sx, top.ex, 0.28), faceY(top.sy, top.ey, 0.28, 0));
  chimney(g, R, lerpN(r.ax, r.bx, 0.78), lerpN(r.ay, r.by, 0.78) + 2, 5, 9, col);
  if (R.winter) snowRoof(g, top, r, alongX);
}

function drawHall(R, g, base, def, b, col, lift) {
  const t = raise(base, RH_B, 0, 0.86);
  const wallH = 18 + def.w * 1.6;
  const top = box(g, t, lift, wallH, col, RH_C, 1);
  const alongX = def.w >= def.h;
  const r = roof(g, top, 13 + def.w * 1.2, col, alongX, 0.22);
  for (let i = 0; i < 3; i++) {
    window2(R, g, top, wallH, 0.22, 0, 0.22 + i * 0.26, 3.2, 5, col);
    window2(R, g, top, wallH, 0.22, 1, 0.22 + i * 0.26, 3.2, 5, col);
  }
  // Porch: two posts and a lintel on the south corner, plus a banner.
  const px = top.sx;
  const gy = top.sy + wallH;         // ground level at the south corner
  const ly = gy - wallH * 0.72;      // porch lintel
  g.fillStyle = col.trimD;
  quad(g, px - 8, gy - 1, px - 5, gy + 0.6, px - 5, ly + 0.6, px - 8, ly - 1);
  quad(g, px + 5, gy + 0.6, px + 8, gy - 1, px + 8, ly - 1, px + 5, ly + 0.6);
  g.fillStyle = col.trim;
  quad(g, px - 8, ly - 1, px, ly + 3, px + 8, ly - 1, px, ly - 5);
  g.fillStyle = R.accent;
  quad(g, px - 1.6, ly - 3, px + 1.6, ly - 3, px + 1.6, ly + 7, px - 1.6, ly + 9);
  if (R.winter) snowRoof(g, top, r, alongX);
}

function drawChurch(R, g, base, def, b, col, lift) {
  // Nave down the long axis, then a steeple planted on the west corner so the
  // silhouette reads as a church from across the valley.
  const t = raise(base, RH_B, 0, 0.72);
  const wallH = 20 + def.w * 1.2;
  const top = box(g, t, lift, wallH, col, RH_C, 1);
  const alongX = def.w >= def.h;
  const r = roof(g, top, 18 + def.w * 1.8, col, alongX, 0);
  for (let i = 0; i < 3; i++) {
    window2(R, g, top, wallH, 0.20, 0, 0.2 + i * 0.28, 2.8, 6.5, col);
    window2(R, g, top, wallH, 0.20, 1, 0.2 + i * 0.28, 2.8, 6.5, col);
  }
  if (R.winter) snowRoof(g, top, r, alongX);

  const twr = RH_E;
  const tw = 8.5;
  twr.cx = lerpN(base.wx, base.cx, 0.34);
  twr.cy = lerpN(base.wy, base.cy, 0.34);
  twr.nx = twr.cx; twr.ny = twr.cy - tw * 0.5;
  twr.ex = twr.cx + tw; twr.ey = twr.cy;
  twr.sx = twr.cx; twr.sy = twr.cy + tw * 0.5;
  twr.wx = twr.cx - tw; twr.wy = twr.cy;
  const towerH = wallH + 22 + def.w * 2;
  const ttop = box(g, twr, lift, towerH, col, RH_F, 1);
  window2(R, g, ttop, towerH, 0.14, 0, 0.5, 3, 5, col);
  window2(R, g, ttop, towerH, 0.14, 1, 0.5, 3, 5, col);
  const apex = cap(g, ttop, 22, col);
  line(g, apex.x, apex.y - 1, apex.x, apex.y - 8, 1.4, R.accent);
  line(g, apex.x - 2.6, apex.y - 5.5, apex.x + 2.6, apex.y - 5.5, 1.4, R.accent);
  if (R.lit) R.addGlow(ttop.cx, ttop.cy - 6, 30, 0.4);
}

function drawKeep(R, g, base, def, b, col, lift) {
  const t = raise(base, RH_B, 0, 0.80);
  const wallH = 34;
  const top = box(g, t, lift, wallH, col, RH_C, 1);
  // Battlements: alternating merlons along the two viewer-facing edges.
  g.fillStyle = col.trim;
  for (let side = 0; side < 2; side++) {
    const ax = side === 0 ? top.wx : top.sx;
    const ay = side === 0 ? top.wy : top.sy;
    const bx = side === 0 ? top.sx : top.ex;
    const by = side === 0 ? top.sy : top.ey;
    for (let i = 0; i < 5; i++) {
      const u = 0.06 + i * 0.22;
      const x = faceX(ax, bx, u);
      const y = faceY(ay, by, u, 0);
      quad(g, x - 3, y, x + 3, y + 1.5, x + 3, y - 5.5, x - 3, y - 7);
    }
  }
  g.fillStyle = col.wall;
  fillRhomb(g, top);
  // Four corner turrets.
  const corners = [top.nx, top.ny, top.ex, top.ey, top.sx, top.sy, top.wx, top.wy];
  for (let i = 0; i < 4; i++) {
    const cx0 = lerpN(corners[i * 2], top.cx, 0.12);
    const cy0 = lerpN(corners[i * 2 + 1], top.cy, 0.12);
    const tr = RH_E;
    tr.cx = cx0; tr.cy = cy0;
    tr.nx = cx0; tr.ny = cy0 - 3.4;
    tr.ex = cx0 + 6.5; tr.ey = cy0;
    tr.sx = cx0; tr.sy = cy0 + 3.4;
    tr.wx = cx0 - 6.5; tr.wy = cy0;
    const tt = box(g, tr, 0, 13, col, RH_F, 1);
    cap(g, tt, 11, col);
  }
  for (let i = 0; i < 3; i++) {
    window2(R, g, top, wallH, 0.26, 0, 0.24 + i * 0.26, 2.6, 6, col);
    window2(R, g, top, wallH, 0.26, 1, 0.24 + i * 0.26, 2.6, 6, col);
  }
  g.fillStyle = R.accent;
  quad(g, top.nx - 0.8, top.ny - 20, top.nx + 0.8, top.ny - 20, top.nx + 11, top.ny - 16, top.nx + 0.8, top.ny - 11);
  line(g, top.nx, top.ny - 21, top.nx, top.ny, 1.3, col.trimD);
  if (R.winter) { g.fillStyle = 'rgba(240,246,254,0.5)'; fillRhomb(g, top); }
}

function drawTower(R, g, base, def, b, col, lift) {
  const t = raise(base, RH_B, 0, def.w > 1 ? 0.52 : 0.68);
  const h = 22 + def.w * 7;
  const top = box(g, t, lift, h, col, RH_C, 0.74);
  const r = cap(g, top, 12 + def.w * 2, col);
  window2(R, g, top, h, 0.24, 0, 0.5, 3, 4, col);
  window2(R, g, top, h, 0.24, 1, 0.5, 3, 4, col);
  if (def.id === 'windmill') {
    // Sails are what makes a windmill read as a windmill and not a watchtower.
    const sx = top.cx;
    const sy = top.cy - 4;
    const a = R.time * 0.7;
    g.strokeStyle = col.trimD;
    g.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) {
      const th = a + i * 1.5707963;
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(sx + Math.cos(th) * 15, sy + Math.sin(th) * 15);
      g.stroke();
    }
    g.fillStyle = col.roof;
    for (let i = 0; i < 4; i++) {
      const th = a + i * 1.5707963;
      quad(g, sx + Math.cos(th) * 5, sy + Math.sin(th) * 5,
        sx + Math.cos(th) * 15, sy + Math.sin(th) * 15,
        sx + Math.cos(th) * 15 - Math.sin(th) * 3.4, sy + Math.sin(th) * 15 + Math.cos(th) * 3.4,
        sx + Math.cos(th) * 5 - Math.sin(th) * 3, sy + Math.sin(th) * 5 + Math.cos(th) * 3);
    }
  } else {
    // Lookout railing + a brazier: towers are the night-watch light sources.
    line(g, top.wx, top.wy - 2, top.sx, top.sy - 2, 1.2, col.trimD);
    line(g, top.sx, top.sy - 2, top.ex, top.ey - 2, 1.2, col.trimD);
    g.fillStyle = col.trimD;
    quad(g, t.wx, t.wy - h * 0.55, t.sx, t.sy - h * 0.55, t.sx, t.sy - h * 0.55 - 3, t.wx, t.wy - h * 0.55 - 3);
    quad(g, t.sx, t.sy - h * 0.55, t.ex, t.ey - h * 0.55, t.ex, t.ey - h * 0.55 - 3, t.sx, t.sy - h * 0.55 - 3);
    if (R.lit) {
      g.fillStyle = '#ffbb55';
      dot(g, r.x, r.y + 4, 2.2);
      R.addGlow(r.x, r.y + 4, 34, 0.75);
    }
  }
  if (R.winter) { g.fillStyle = 'rgba(240,246,254,0.4)'; tri(g, top.wx, top.wy, top.sx, top.sy, r.x, r.y); }
}

function drawWorkshop(R, g, base, def, b, col, lift) {
  const t = raise(base, RH_B, 0, 0.74);
  const wallH = 13;
  const top = box(g, t, lift, wallH, col, RH_C, 1);
  const alongX = def.w >= def.h;
  const hi = 9 + def.w * 1.4;
  const r = roof(g, top, hi, col, alongX, 0.34);
  // Wide open working front, then the big stack that is the shape's signature.
  g.fillStyle = col.trimD;
  quad(g, faceX(top.wx, top.sx, 0.30), faceY(top.wy, top.sy, 0.30, -wallH * 0.8),
    faceX(top.wx, top.sx, 0.74), faceY(top.wy, top.sy, 0.74, -wallH * 0.8),
    faceX(top.wx, top.sx, 0.74), faceY(top.wy, top.sy, 0.74, 0),
    faceX(top.wx, top.sx, 0.30), faceY(top.wy, top.sy, 0.30, 0));
  window2(R, g, top, wallH, 0.22, 1, 0.6, 5, 4, col);
  chimney(g, R, lerpN(r.ax, r.bx, 0.2), lerpN(r.ay, r.by, 0.2) + 3, 8, 20, col);
  if (R.winter) snowRoof(g, top, r, alongX);
  // Lean-to bolted to the SW face with barrels under it. Anchored part-way
  // down the wall and sloping outward, so it reads as attached rather than as
  // a table standing in the yard.
  const u0 = 0.52;
  const u1 = 0.92;
  const ax0 = faceX(top.wx, top.sx, u0);
  const ay0 = faceY(top.wy, top.sy, u0, -wallH * 0.38);
  const ax1 = faceX(top.wx, top.sx, u1);
  const ay1 = faceY(top.wy, top.sy, u1, -wallH * 0.38);
  const ex = -8;                       // outward from the SW face, in screen px
  const ey = 5;
  line(g, ax0 + ex, ay0 + ey + wallH * 0.62, ax0 + ex, ay0 + ey, 1.4, col.trimD);
  line(g, ax1 + ex, ay1 + ey + wallH * 0.62, ax1 + ex, ay1 + ey, 1.4, col.trimD);
  g.fillStyle = col.roofB;
  quad(g, ax0, ay0, ax1, ay1, ax1 + ex, ay1 + ey, ax0 + ex, ay0 + ey);
  for (let i = 0; i < 3; i++) {
    const bx = lerpN(ax0, ax1, 0.2 + i * 0.3) + ex * 0.55;
    const by = lerpN(ay0, ay1, 0.2 + i * 0.3) + ey * 0.55 + wallH * 0.58;
    g.fillStyle = i % 2 ? col.crateA : col.crateD;
    ellipse(g, bx, by - 2.4, 2.8, 3.2);
    g.fillStyle = col.crateM;
    ellipse(g, bx, by - 4.6, 2.8, 1.2);
  }
  if (R.lit) R.addGlow(top.cx, top.cy - 4, 26, 0.35);
}

function drawStore(R, g, base, def, b, col, lift) {
  const t = raise(base, RH_B, 0, 0.84);
  const wallH = 14;
  const top = box(g, t, lift, wallH, col, RH_C, 1);
  const alongX = def.w >= def.h;
  const r = roof(g, top, 12, col, alongX, 0.3);
  // Wide double doors on the front face — a barn, not a house.
  g.fillStyle = col.trimD;
  quad(g, faceX(top.wx, top.sx, 0.34), faceY(top.wy, top.sy, 0.34, -wallH * 0.78),
    faceX(top.wx, top.sx, 0.70), faceY(top.wy, top.sy, 0.70, -wallH * 0.78),
    faceX(top.wx, top.sx, 0.70), faceY(top.wy, top.sy, 0.70, 0),
    faceX(top.wx, top.sx, 0.34), faceY(top.wy, top.sy, 0.34, 0));
  line(g, faceX(top.wx, top.sx, 0.52), faceY(top.wy, top.sy, 0.52, -wallH * 0.78),
    faceX(top.wx, top.sx, 0.52), faceY(top.wy, top.sy, 0.52, 0), 1, col.trim);
  // Delivered stock stacked on the apron, so a full store looks full.
  const fill = R.storeFullness(b);
  const n = Math.round(fill * 5);
  for (let i = 0; i < n; i++) {
    const u = 0.18 + (i % 3) * 0.3;
    const v = (i / 3 | 0) * 4.5;
    const x = faceX(base.sx, base.ex, u * 0.5) - 4;
    const y = faceY(base.sy, base.ey, u * 0.5, lift + v) - 2;
    g.fillStyle = i % 2 ? col.crateA : col.crateB;
    quad(g, x - 3.4, y, x, y + 1.8, x + 3.4, y, x, y - 1.8);
    g.fillStyle = col.crateD;
    quad(g, x - 3.4, y, x, y + 1.8, x, y + 5, x - 3.4, y + 3.4);
    g.fillStyle = col.crateM;
    quad(g, x, y + 1.8, x + 3.4, y, x + 3.4, y + 3.4, x, y + 5);
  }
  window2(R, g, top, wallH, 0.24, 1, 0.6, 3, 3, col);
  if (R.winter) snowRoof(g, top, r, alongX);
}

/** Post-and-rail fence around a rhombus — the yard/field enclosure. */
function fence(g, o, hgt, hex, hexD) {
  const xs = [o.nx, o.ex, o.sx, o.wx];
  const ys = [o.ny, o.ey, o.sy, o.wy];
  g.strokeStyle = hex;
  g.lineWidth = 1.1;
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    g.moveTo(xs[i], ys[i] - hgt);
    g.lineTo(xs[(i + 1) & 3], ys[(i + 1) & 3] - hgt);
    g.moveTo(xs[i], ys[i] - hgt * 0.45);
    g.lineTo(xs[(i + 1) & 3], ys[(i + 1) & 3] - hgt * 0.45);
  }
  g.stroke();
  g.strokeStyle = hexD;
  g.lineWidth = 1.5;
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 3; k++) {
      const u = 0.16 + k * 0.34;
      const px = faceX(xs[i], xs[(i + 1) & 3], u);
      const py = faceY(ys[i], ys[(i + 1) & 3], u, 0);
      g.moveTo(px, py);
      g.lineTo(px, py - hgt);
    }
  }
  g.stroke();
}

function drawYard(R, g, base, def, b, col, lift) {
  const pad = raise(base, RH_G, lift, 0.94);
  g.fillStyle = col.yard;
  fillRhomb(g, pad);
  if (def.id === 'market') {
    // Stalls with striped awnings. The market is one of the two things that
    // must be unmistakably bright at night (§1).
    for (let i = 0; i < 4; i++) {
      const u = 0.22 + (i % 2) * 0.46;
      const v = 0.24 + ((i / 2) | 0) * 0.46;
      const x = lerpN(lerpN(pad.wx, pad.nx, u), lerpN(pad.sx, pad.ex, u), v);
      const y = lerpN(lerpN(pad.wy, pad.ny, u), lerpN(pad.sy, pad.ey, u), v);
      g.fillStyle = col.trimD;
      line(g, x - 8, y, x - 8, y - 12, 1.3, col.trimD);
      line(g, x + 8, y, x + 8, y - 12, 1.3, col.trimD);
      // Striped canopy as two pitched faces, so it reads as a stall roof.
      for (let s = 0; s < 5; s++) {
        const u0 = s / 5;
        const u1 = (s + 1) / 5;
        g.fillStyle = s % 2 ? U.shade(R.accent, -0.18) : '#e8dcc0';
        quad(g, x - 10 + u0 * 20, y - 12, x - 10 + u1 * 20, y - 12,
          x - 10 + u1 * 20 + 3, y - 18, x - 10 + u0 * 20 + 3, y - 18);
        g.fillStyle = s % 2 ? '#e8dcc0' : U.shade(R.accent, -0.3);
        quad(g, x - 10 + u0 * 20 + 3, y - 18, x - 10 + u1 * 20 + 3, y - 18,
          x - 10 + u1 * 20 + 6, y - 13, x - 10 + u0 * 20 + 6, y - 13);
      }
      g.fillStyle = col.crateA;
      quad(g, x - 5, y - 4, x, y - 2, x + 5, y - 4, x, y - 6);
      if (R.lit) R.addGlow(x, y - 8, 34, 0.8);
    }
  } else {
    // A shed in the north corner plus stock milling about the enclosure.
    const sh = RH_E;
    sh.cx = lerpN(pad.nx, pad.cx, 0.34); sh.cy = lerpN(pad.ny, pad.cy, 0.34);
    sh.nx = sh.cx; sh.ny = sh.cy - 6;
    sh.ex = sh.cx + 12; sh.ey = sh.cy;
    sh.sx = sh.cx; sh.sy = sh.cy + 6;
    sh.wx = sh.cx - 12; sh.wy = sh.cy;
    const st = box(g, sh, 0, 9, col, RH_F, 1);
    roof(g, st, 8, col, true, 0.2);
    window2(R, g, st, 9, 0.26, 0, 0.6, 3, 3, col);
    const stockHex = def.id === 'apiary' ? '#d9a13c' : col.stock;
    const n = def.w * def.h > 8 ? 7 : 4;
    for (let i = 0; i < n; i++) {
      const hx = U.hash2(b.x + i, b.y, 0x5a1) ;
      const hy = U.hash2(b.x, b.y + i, 0x77b);
      const u = 0.18 + hx * 0.64;
      const v = 0.4 + hy * 0.52;
      const x = lerpN(lerpN(pad.wx, pad.nx, u), lerpN(pad.sx, pad.ex, u), v);
      const y = lerpN(lerpN(pad.wy, pad.ny, u), lerpN(pad.sy, pad.ey, u), v);
      const wob = Math.sin(R.time * 1.3 + i * 2.1) * 1.4;
      g.fillStyle = 'rgba(0,0,0,0.18)';
      ellipse(g, x + wob, y, 3, 1.4);
      if (def.id === 'apiary') {
        g.fillStyle = stockHex;
        quad(g, x - 3, y - 1, x + 3, y - 1, x + 2.2, y - 6, x - 2.2, y - 6);
      } else {
        g.fillStyle = stockHex;
        ellipse(g, x + wob, y - 3.4, 3.4, 2.4);
        g.fillStyle = col.stockD;
        dot(g, x + wob + 3, y - 4.6, 1.5);
      }
    }
  }
  fence(g, pad, 6, col.trim, col.trimD);
  if (R.winter) { g.fillStyle = 'rgba(236,243,252,0.5)'; fillRhomb(g, pad); }
}

function drawField(R, g, base, def, b, col, lift) {
  const pad = raise(base, RH_G, lift, 0.96);
  g.fillStyle = R.winter ? col.soilWinter : col.soil;
  fillRhomb(g, pad);
  const rows = def.h * 3;
  const cropped = !R.winter && R.season !== C.SEASON_SPRING;
  const cropHex = R.season === C.SEASON_SPRING ? col.cropYoung : col.crop;
  if (def.id === 'orchard') {
    for (let ty = 0; ty < def.h; ty++) {
      for (let tx = 0; tx < def.w; tx++) {
        const cx = tcx(b.x + tx, b.y + ty);
        const cy = tcy(b.x + tx, b.y + ty) - lift;
        drawTreeAt(R, g, cx, cy, U.hash2(b.x + tx, b.y + ty, 0x3f1), 0.68, true);
      }
    }
  } else {
    g.lineWidth = 1.6;
    g.strokeStyle = R.winter ? col.furrowWinter : col.furrow;
    g.beginPath();
    for (let i = 1; i < rows; i++) {
      const u = i / rows;
      g.moveTo(lerpN(pad.wx, pad.nx, u), lerpN(pad.wy, pad.ny, u));
      g.lineTo(lerpN(pad.sx, pad.ex, u), lerpN(pad.sy, pad.ey, u));
    }
    g.stroke();
    if (cropped) {
      g.strokeStyle = cropHex;
      g.lineWidth = 2.6;
      g.beginPath();
      for (let i = 1; i < rows; i += 2) {
        const u = i / rows;
        g.moveTo(lerpN(pad.wx, pad.nx, u), lerpN(pad.wy, pad.ny, u) - 2.2);
        g.lineTo(lerpN(pad.sx, pad.ex, u), lerpN(pad.sy, pad.ey, u) - 2.2);
      }
      g.stroke();
      if (def.id === 'wheat_farm') {
        // A few standing sheaves so a wheat field reads as wheat, not a lawn.
        g.fillStyle = col.crop;
        for (let i = 0; i < 4; i++) {
          const u = 0.2 + i * 0.2;
          const x = lerpN(lerpN(pad.wx, pad.nx, u), lerpN(pad.sx, pad.ex, u), 0.62);
          const y = lerpN(lerpN(pad.wy, pad.ny, u), lerpN(pad.sy, pad.ey, u), 0.62);
          tri(g, x - 3, y, x + 3, y, x, y - 9);
        }
      }
    }
  }
  fence(g, pad, 4, col.trim, col.trimD);
  if (R.winter) { g.fillStyle = 'rgba(233,241,251,0.6)'; fillRhomb(g, pad); }
}

function drawMine(R, g, base, def, b, col, lift) {
  const pad = raise(base, RH_G, lift, 0.94);
  // The pit itself: a dark excavation sunk below the ground plane.
  g.fillStyle = col.pitRim;
  fillRhomb(g, pad);
  const inner = raise(pad, RH_E, -3, 0.62);
  g.fillStyle = col.pit;
  fillRhomb(g, inner);
  g.fillStyle = col.pitDeep;
  ellipse(g, inner.cx, inner.cy + 1, (inner.ex - inner.wx) * 0.3, (inner.sy - inner.ny) * 0.28);
  // Timber headframe — the A-frame is the mine's silhouette.
  const hx = lerpN(pad.nx, pad.cx, 0.42);
  const hy = lerpN(pad.ny, pad.cy, 0.42);
  const hs = 1 + def.w * 0.35;
  line(g, hx - 7 * hs, hy + 3, hx, hy - 18 * hs, 1.8 * hs, col.trimD);
  line(g, hx + 7 * hs, hy + 3, hx, hy - 18 * hs, 1.8 * hs, col.trimD);
  line(g, hx - 4 * hs, hy - 6 * hs, hx + 4 * hs, hy - 6 * hs, 1.3 * hs, col.trim);
  line(g, hx, hy - 18 * hs, hx + 6 * hs, hy - 12 * hs, 1.4 * hs, col.trimD);
  g.fillStyle = col.trimD;
  dot(g, hx, hy - 18 * hs, 1.6 * hs);
  // Spoil heaps and a cart.
  for (let i = 0; i < 3; i++) {
    const u = 0.3 + i * 0.2;
    const x = lerpN(pad.wx, pad.sx, u);
    const y = lerpN(pad.wy, pad.sy, u);
    g.fillStyle = i % 2 ? col.spoilA : col.spoilB;
    tri(g, x - 6, y, x + 6, y, x, y - 5.5);
  }
  g.fillStyle = col.crateD;
  quad(g, pad.sx - 6, pad.sy - 4, pad.sx, pad.sy - 2, pad.sx + 6, pad.sy - 4, pad.sx, pad.sy - 6);
  g.fillStyle = col.crateM;
  quad(g, pad.sx - 6, pad.sy - 4, pad.sx, pad.sy - 2, pad.sx, pad.sy + 1, pad.sx - 6, pad.sy - 1);
  if (R.lit) {
    g.fillStyle = '#ffc066';
    dot(g, hx, hy - 6 * hs, 1.8 * hs);
    R.addGlow(hx, hy - 6 * hs, 26, 0.5);
  }
}

function drawWell(R, g, base, def, b, col, lift) {
  const pad = raise(base, RH_G, lift, def.w > 1 ? 0.80 : 0.62);
  const rx = (pad.ex - pad.wx) * 0.5;
  const ry = (pad.sy - pad.ny) * 0.5;
  g.fillStyle = col.wallR;
  ellipse(g, pad.cx, pad.cy, rx, ry);
  g.fillStyle = col.wall;
  ellipse(g, pad.cx, pad.cy - 5, rx, ry);
  g.fillStyle = col.water;
  ellipse(g, pad.cx, pad.cy - 5, rx * 0.62, ry * 0.62);
  if (def.w > 1) {
    // Fountain: a central spout instead of a winding roof.
    g.fillStyle = col.wall;
    quad(g, pad.cx - 3, pad.cy - 5, pad.cx + 3, pad.cy - 5, pad.cx + 2, pad.cy - 15, pad.cx - 2, pad.cy - 15);
    g.fillStyle = col.water;
    ellipse(g, pad.cx, pad.cy - 16, 3.2, 2);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.2566 + R.time;
      g.fillStyle = 'rgba(200,228,240,0.7)';
      dot(g, pad.cx + Math.cos(a) * rx * 0.5, pad.cy - 12 + Math.abs(Math.sin(a * 2)) * 6, 0.9);
    }
  } else {
    line(g, pad.cx - rx * 0.7, pad.cy - 5, pad.cx - rx * 0.7, pad.cy - 17, 1.5, col.trimD);
    line(g, pad.cx + rx * 0.7, pad.cy - 5, pad.cx + rx * 0.7, pad.cy - 17, 1.5, col.trimD);
    g.fillStyle = col.roof;
    quad(g, pad.cx - rx - 1, pad.cy - 17, pad.cx, pad.cy - 23, pad.cx + rx + 1, pad.cy - 17, pad.cx, pad.cy - 15);
    g.fillStyle = col.trimD;
    quad(g, pad.cx - 2, pad.cy - 16, pad.cx + 2, pad.cy - 16, pad.cx + 2, pad.cy - 12, pad.cx - 2, pad.cy - 12);
  }
}

function drawWall(R, g, base, def, b, col, lift) {
  const h = def.id === 'stone_wall' ? 15 : 12;
  wallSegment(R, g, base, b, col, lift, h, false);
}

function drawGate(R, g, base, def, b, col, lift) {
  const h = def.id === 'stone_gate' ? 19 : 16;
  wallSegment(R, g, base, b, col, lift, h, true);
}

/**
 * A 1x1 wall/gate tile drawn as a band that reaches to whichever orthogonal
 * neighbours are also walls, so a drag-placed line reads as one wall rather
 * than a row of isolated blocks (§1: road/wall connectivity outranks pretty).
 */
function wallSegment(R, g, base, b, col, lift, h, isGate) {
  const mask = R.wallMaskAt(b.x, b.y);
  const cx = base.cx;
  const cy = base.cy - lift;
  const t = 7;
  // Midpoints of the four shared edges, in tile-neighbour order E, S, W, N.
  const ex = [HW * 0.5, -HW * 0.5, -HW * 0.5, HW * 0.5];
  const ey = [HH * 0.5, HH * 0.5, -HH * 0.5, -HH * 0.5];
  const any = mask !== 0;
  for (let d = 0; d < 4; d++) {
    const reach = (mask & (1 << d)) ? 1 : (any ? 0 : 0.55);
    if (reach === 0) continue;
    const mx = cx + ex[d] * reach;
    const my = cy + ey[d] * reach;
    const px = -ey[d] / HH * t * 0.5;
    const py = ex[d] / HW * t * 0.5;
    g.fillStyle = col.wallL;
    quad(g, cx + px, cy + py, mx + px, my + py, mx + px, my + py - h, cx + px, cy + py - h);
    g.fillStyle = col.wallR;
    quad(g, cx - px, cy - py, mx - px, my - py, mx - px, my - py - h, cx - px, cy - py - h);
    g.fillStyle = col.wall;
    quad(g, cx + px, cy + py - h, mx + px, my + py - h, mx - px, my - py - h, cx - px, cy - py - h);
  }
  // Cap block over the junction so corners do not show a notch.
  g.fillStyle = col.wallL;
  quad(g, cx - t * 0.6, cy, cx, cy + t * 0.3, cx, cy + t * 0.3 - h, cx - t * 0.6, cy - h);
  g.fillStyle = col.wallR;
  quad(g, cx, cy + t * 0.3, cx + t * 0.6, cy, cx + t * 0.6, cy - h, cx, cy + t * 0.3 - h);
  g.fillStyle = col.wall;
  quad(g, cx, cy + t * 0.3 - h, cx + t * 0.6, cy - h, cx, cy - t * 0.3 - h, cx - t * 0.6, cy - h);
  if (isGate) {
    // Gatehouse: a raised block with an arch you can see through.
    g.fillStyle = col.trimD;
    quad(g, cx - 5, cy + 1, cx + 5, cy + 1, cx + 5, cy - h * 0.62, cx - 5, cy - h * 0.62);
    g.fillStyle = col.trim;
    quad(g, cx - 8, cy - h, cx + 8, cy - h, cx + 6, cy - h - 8, cx - 6, cy - h - 8);
    g.fillStyle = R.accent;
    quad(g, cx - 1, cy - h - 8, cx + 1, cy - h - 8, cx + 7, cy - h - 5, cx + 1, cy - h - 2);
    if (R.lit) R.addGlow(cx, cy - h - 4, 26, 0.45);
  }
  if (R.winter) { g.fillStyle = 'rgba(238,245,253,0.55)'; ellipse(g, cx, cy - h, t * 1.4, t * 0.5); }
}

/* ------------------------------------------------------------------ *
 * Procedural props. Everything varies on hash2 so a forest is never stamped.
 * ------------------------------------------------------------------ */

/**
 * One tree. `h` is the tile's stable 0..1 hash — it picks conifer vs broadleaf,
 * height, lean and canopy colour so neighbouring trees never match.
 */
function drawTreeAt(R, g, cx, cy, h, scale, orchard) {
  // Three decorrelated streams off one tile hash: species, size, lean. Using
  // `h` for all three would make every tall tree a conifer and vice versa.
  const hs = (h * 7919) % 1;
  const hl = (h * 104729) % 1;
  const conifer = !orchard && hs > 0.55;
  const s = scale * (0.72 + hl * 0.68);
  const lean = (hl - 0.5) * 4;
  const trunkH = (conifer ? 9 : 8) * s;
  g.fillStyle = 'rgba(0,0,0,0.20)';
  ellipse(g, cx + 1.5 * s, cy + 1, 6 * s, 2.6 * s);
  g.fillStyle = R.treeTrunk;
  quad(g, cx - 1.4 * s, cy, cx + 1.4 * s, cy, cx + 1.1 * s + lean, cy - trunkH, cx - 1.1 * s + lean, cy - trunkH);
  const set = R.leafSet(h);
  const leafA = set.a;
  const leafB = set.b;
  if (R.winter && !conifer) {
    // Bare branches, then a rime of snow on the upper forks.
    g.strokeStyle = R.treeTrunk;
    g.lineWidth = 1.1 * s;
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -2.6 + i * 0.62;
      g.moveTo(cx + lean, cy - trunkH);
      g.lineTo(cx + lean + Math.cos(a) * 8 * s, cy - trunkH + Math.sin(a) * 8 * s);
    }
    g.stroke();
    g.strokeStyle = 'rgba(240,246,255,0.75)';
    g.lineWidth = 0.9 * s;
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -2.6 + i * 0.62;
      g.moveTo(cx + lean + Math.cos(a) * 3 * s, cy - trunkH + Math.sin(a) * 3 * s - 1);
      g.lineTo(cx + lean + Math.cos(a) * 8 * s, cy - trunkH + Math.sin(a) * 8 * s - 1);
    }
    g.stroke();
    return;
  }
  if (conifer) {
    const tiers = 3;
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers;
      const y = cy - trunkH - i * 6.5 * s;
      const w = (10 - i * 2.4) * s;
      g.fillStyle = i === tiers - 1 ? leafA : leafB;
      tri(g, cx + lean - w, y + 3 * s, cx + lean + w, y + 3 * s, cx + lean * (1 + t), y - 9 * s);
      g.fillStyle = leafA;
      tri(g, cx + lean - w * 0.55, y + 2 * s, cx + lean + w * 0.2, y + 2 * s, cx + lean * (1 + t) - w * 0.2, y - 8 * s);
    }
    if (R.winter) {
      g.fillStyle = 'rgba(238,245,255,0.55)';
      tri(g, cx + lean - 5 * s, cy - trunkH - 12 * s, cx + lean + 5 * s, cy - trunkH - 12 * s, cx + lean, cy - trunkH - 22 * s);
    }
  } else {
    const r = (orchard ? 6.5 : 9.5) * s;
    g.fillStyle = leafB;
    ellipse(g, cx + lean, cy - trunkH - r * 0.5, r, r * 0.82);
    g.fillStyle = leafA;
    ellipse(g, cx + lean - r * 0.24, cy - trunkH - r * 0.72, r * 0.72, r * 0.6);
    g.fillStyle = set.c;
    ellipse(g, cx + lean - r * 0.38, cy - trunkH - r * 0.86, r * 0.34, r * 0.26);
    if (orchard && (R.season === C.SEASON_SUMMER || R.season === C.SEASON_AUTUMN)) {
      g.fillStyle = '#b04f42';
      dot(g, cx + lean + r * 0.3, cy - trunkH - r * 0.4, 1.3 * s);
      dot(g, cx + lean - r * 0.4, cy - trunkH - r * 0.2, 1.1 * s);
    }
  }
}

function drawProp(R, g, res, amount, tx, ty, cx, cy) {
  const h = U.hash2(tx, ty, R.seed);
  switch (res) {
    case C.RESOURCE.TREE: {
      // A depleted stand thins out rather than vanishing in one step.
      const full = amount / 40;
      drawTreeAt(R, g, cx + (h - 0.5) * 12, cy + (U.hash2(tx, ty, 0x99) - 0.5) * 6, h, 0.8 + full * 0.35, false);
      if (full > 0.55) {
        // A filler crown rather than a second full tree: doubles the apparent
        // density of a stand for two fills instead of eight.
        const h2 = U.hash2(tx, ty, 0x4d1);
        const st = R.leafSet(h2);
        const fx = cx - 10 + h2 * 7;
        const fy = cy + 5;
        g.fillStyle = st.b;
        ellipse(g, fx, fy - 8, 7 + h2 * 2, 6);
        g.fillStyle = st.a;
        ellipse(g, fx - 2, fy - 10, 5, 3.6);
      }
      if (full < 0.35) {
        g.fillStyle = R.treeTrunk;
        ellipse(g, cx + 8, cy + 3, 3, 1.6);
      }
      break;
    }
    case C.RESOURCE.STONE: {
      for (let i = 0; i < 3; i++) {
        const hx = U.hash2(tx + i, ty, 0x21b);
        const hy = U.hash2(tx, ty + i, 0x7c3);
        const x = cx + (hx - 0.5) * 22;
        const y = cy + (hy - 0.5) * 10;
        const r = 3 + hx * 4;
        g.fillStyle = 'rgba(0,0,0,0.18)';
        ellipse(g, x, y + 1, r, r * 0.4);
        g.fillStyle = R.rockMid;
        quad(g, x - r, y, x, y + r * 0.42, x + r, y, x, y - r * 0.42);
        g.fillStyle = R.rockDark;
        quad(g, x - r, y, x, y + r * 0.42, x, y + r * 0.42 - r * 0.8, x - r, y - r * 0.8);
        g.fillStyle = R.rockLight;
        quad(g, x - r, y - r * 0.8, x, y + r * 0.42 - r * 0.8, x + r, y - r * 0.8, x, y - r * 0.42 - r * 0.8);
      }
      break;
    }
    case C.RESOURCE.IRON:
    case C.RESOURCE.CLAY: {
      const oc = R.oreCols[res];
      const spent = amount === 0;
      for (let i = 0; i < (spent ? 2 : 4); i++) {
        const hx = U.hash2(tx + i * 3, ty, 0x31f);
        const hy = U.hash2(tx, ty + i * 3, 0x5b7);
        const x = cx + (hx - 0.5) * 24;
        const y = cy + (hy - 0.5) * 11;
        const r = 2.4 + hx * 3;
        g.fillStyle = 'rgba(0,0,0,0.16)';
        ellipse(g, x, y + 1, r, r * 0.45);
        g.fillStyle = spent ? oc.c : oc.a;
        quad(g, x - r, y, x, y + r * 0.45, x + r, y, x, y - r * 0.55);
        g.fillStyle = spent ? oc.a : oc.b;
        tri(g, x - r, y, x, y - r * 0.55, x, y);
      }
      break;
    }
    case C.RESOURCE.BERRY: {
      const n = amount > 18 ? 3 : amount > 6 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const hx = U.hash2(tx + i, ty, 0x9a1);
        const x = cx + (hx - 0.5) * 20;
        const y = cy + (U.hash2(tx, ty + i, 0x2c8) - 0.5) * 9;
        g.fillStyle = 'rgba(0,0,0,0.16)';
        ellipse(g, x, y + 1, 5, 2);
        g.fillStyle = R.winter ? '#7a8378' : R.bushDark;
        ellipse(g, x, y - 3, 5.5, 4.2);
        g.fillStyle = R.winter ? '#98a094' : R.bushLight;
        ellipse(g, x - 1.4, y - 4.6, 3.4, 2.6);
        if (!R.winter && amount > 4) {
          g.fillStyle = '#8e4a5e';
          dot(g, x + 2, y - 3, 1.1);
          dot(g, x - 2.4, y - 2, 1);
          dot(g, x + 0.4, y - 5.6, 1);
        }
      }
      break;
    }
    case C.RESOURCE.HERB: {
      g.strokeStyle = R.winter ? '#8f9a8c' : '#6f9a5e';
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const hx = U.hash2(tx + i, ty + i, 0x4e2);
        const x = cx + (hx - 0.5) * 24;
        const y = cy + (U.hash2(tx, ty + i, 0x8d3) - 0.5) * 10;
        g.moveTo(x, y);
        g.lineTo(x + (hx - 0.5) * 3, y - 4.5);
      }
      g.stroke();
      if (!R.winter) {
        g.fillStyle = '#c3d17a';
        for (let i = 0; i < 3; i++) {
          const hx = U.hash2(tx + i * 2, ty, 0x113);
          dot(g, cx + (hx - 0.5) * 20, cy + (U.hash2(tx, ty + i, 0x664) - 0.5) * 8 - 5, 1.2);
        }
      }
      break;
    }
    case C.RESOURCE.GAME: {
      // Deer graze: they drift on a slow sine so the wild feels alive.
      const n = amount > 14 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const ph = U.hash2(tx + i, ty, 0x7f1) * 6.28;
        const x = cx + Math.sin(R.time * 0.32 + ph) * 9;
        const y = cy + Math.cos(R.time * 0.21 + ph) * 4;
        g.fillStyle = 'rgba(0,0,0,0.2)';
        ellipse(g, x, y + 0.5, 4, 1.6);
        g.fillStyle = '#8b6a4a';
        ellipse(g, x, y - 4, 4.2, 2.6);
        g.fillStyle = '#7a5b3e';
        quad(g, x - 3, y - 2.5, x - 2, y - 2.5, x - 2, y, x - 3, y);
        quad(g, x + 2, y - 2.5, x + 3, y - 2.5, x + 3, y, x + 2, y);
        g.fillStyle = '#9a7a56';
        dot(g, x + 4, y - 7, 1.9);
        line(g, x + 4, y - 8.4, x + 5.6, y - 11, 0.9, '#6d5136');
        line(g, x + 4, y - 8.4, x + 2.6, y - 11, 0.9, '#6d5136');
      }
      break;
    }
    case C.RESOURCE.FISH: {
      // Fish sit on SHORE tiles: a couple of ripples, no solid body.
      g.strokeStyle = 'rgba(220,238,246,0.5)';
      g.lineWidth = 1;
      for (let i = 0; i < 2; i++) {
        const ph = U.hash2(tx + i, ty, 0x2ab) * 6.28;
        const rr = 3 + ((R.time * 0.9 + ph) % 2) * 5;
        g.beginPath();
        g.ellipse(cx + (U.hash2(tx, ty + i, 0x51) - 0.5) * 18, cy + (U.hash2(tx + i, ty, 0x77) - 0.5) * 8,
          rr, rr * 0.5, 0, 0, 6.2831853);
        g.stroke();
      }
      break;
    }
    default:
      break;
  }
}

const SHAPE_DRAW = {
  hut: drawHut,
  house: drawHouse,
  hall: drawHall,
  church: drawChurch,
  keep: drawKeep,
  tower: drawTower,
  workshop: drawWorkshop,
  store: drawStore,
  yard: drawYard,
  field: drawField,
  mine: drawMine,
  well: drawWell,
  wall: drawWall,
  gate: drawGate,
};

const SKIN = ['#e0b184', '#c68f63', '#a97247', '#efc59b'];

// villagers.js PH.TO_DOOR — a gatherer walking its harvest back to the door.
// Mirrored rather than imported so render.js stays loadable without villagers.
const PH_TO_DOOR = 5;

/**
 * A villager: 5px two-tone figure, tunic from ROLE_COLOURS, skin dot, 2px
 * shadow ellipse (§1). `s` resists zoom so the figure stays trackable.
 */
function drawVillager(R, g, v, x, y, s, moving) {
  const tunic = C.ROLE_COLOURS[v.role] || C.ROLE_COLOURS.idler;
  const bob = moving ? Math.sin(R.time * 9 + v.id * 1.7) * 0.9 * s : 0;
  g.fillStyle = 'rgba(0,0,0,0.32)';
  ellipse(g, x, y, 3.4 * s, 1.7 * s);
  const ty = y + bob;
  // A one-pixel dark edge behind the torso only: without it 5px of tunic
  // dissolves into painted grass at zoom 1; with a full rim the figure reads
  // as a dark pill instead of a person.
  g.fillStyle = 'rgba(24,20,18,0.5)';
  g.fillRect(x - 3.1 * s, ty - 9.6 * s, 6.2 * s, 6.4 * s);
  // Legs (the darker tone), torso (the tunic), head.
  g.fillStyle = R.tunicDark(tunic);
  g.fillRect(x - 2 * s, ty - 4 * s, 1.6 * s, 4 * s);
  g.fillRect(x + 0.4 * s, ty - 4 * s, 1.6 * s, 4 * s);
  g.fillStyle = tunic;
  g.fillRect(x - 2.5 * s, ty - 9 * s, 5 * s, 5.4 * s);
  g.fillStyle = R.tunicLight(tunic);
  g.fillRect(x - 2.5 * s, ty - 9 * s, 1.6 * s, 5.4 * s);
  g.fillStyle = 'rgba(24,20,18,0.5)';
  dot(g, x, ty - 10.6 * s, 2.5 * s);
  g.fillStyle = SKIN[v.id & 3];
  dot(g, x, ty - 10.6 * s, 1.9 * s);
  g.fillStyle = R.tunicDark(tunic);
  quad(g, x - 2 * s, ty - 11.2 * s, x + 2 * s, ty - 11.2 * s, x + 1.6 * s, ty - 12.6 * s, x - 1.6 * s, ty - 12.6 * s);
  if (v.role === 'soldier' || v.role === 'militia') {
    g.fillStyle = '#9aa3ad';
    quad(g, x - 2.2 * s, ty - 11 * s, x + 2.2 * s, ty - 11 * s, x + 1.8 * s, ty - 13 * s, x - 1.8 * s, ty - 13 * s);
    line(g, x + 3 * s, ty - 2 * s, x + 4 * s, ty - 15 * s, 1 * s, '#8d7a55');
  }
  const carry = v.carry;
  if (carry && carry.qty > 0 && carry.item) {
    const it = C.ITEMS[carry.item];
    g.fillStyle = 'rgba(0,0,0,0.25)';
    dot(g, x + 3.4 * s, ty - 7.4 * s, 2.1 * s);
    g.fillStyle = it ? it.colour : '#cccccc';
    dot(g, x + 3.2 * s, ty - 7.8 * s, 1.8 * s);
  } else if (v.phase === PH_TO_DOOR) {
    // A gatherer walking a harvest home has no v.carry — buildings.js does the
    // write at the door — so the sack is what keeps "nothing teleports" visible.
    g.fillStyle = 'rgba(0,0,0,0.25)';
    dot(g, x + 3.4 * s, ty - 7.2 * s, 2.4 * s);
    g.fillStyle = '#b09a72';
    dot(g, x + 3.2 * s, ty - 7.6 * s, 2.1 * s);
    g.fillStyle = '#8a7450';
    g.fillRect(x + 2.1 * s, ty - 9.4 * s, 2.2 * s, 1.1 * s);
  }
  if (v.role === 'soldier' || v.role === 'militia') drawSoldierHp(R, g, v, x, y, s);
}

/**
 * A soldier's hit points, in the enemy bar's geometry so a melee reads as one
 * picture, and in the renderer's friendly green so a glance separates your men
 * from theirs. `military.js` owns the numbers: `hpById` is live hp and the kit
 * carries `maxHp`, which runs from ~132 unarmoured to ~238 in plate — the
 * spread an Armoury buys. Read through `kits`, never `kitOf()`, which would
 * lazily write a kit row into a module this one may not mutate.
 * Wounds do not carry between raids, so the bar is a raid-time thing already.
 */
function drawSoldierHp(R, g, v, x, y, s) {
  const mil = R.game.military;
  const hps = mil && mil.hpById;
  if (!hps || typeof hps.get !== 'function') return;
  const hp = hps.get(v.id);
  if (hp === undefined) return;
  const kit = mil.kits && typeof mil.kits.get === 'function' ? mil.kits.get(v.id) : null;
  const maxHp = kit && kit.maxHp > 0 ? kit.maxHp : 0;
  if (maxHp <= 0 || hp >= maxHp) return;
  const w = 14 * s;
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(x - w * 0.5, y - 20 * s, w, 2.4);
  g.fillStyle = '#7ed078';
  g.fillRect(x - w * 0.5, y - 20 * s, w * Math.max(0, hp / maxHp), 2.4);
}

function drawEnemy(R, g, e, x, y, s) {
  const def = R.enemyDef(e);
  const sz = (def ? def.size : 5) * s * 0.2;
  const hex = def ? def.colour : '#8e3f36';
  g.fillStyle = 'rgba(0,0,0,0.3)';
  ellipse(g, x, y, 3.6 * sz, 1.7 * sz);
  if (def && def.id === 'ram') {
    // The ram is a machine, not a man — a beam on a low frame.
    g.fillStyle = U.shade(hex, -0.25);
    quad(g, x - 9 * sz, y - 2 * sz, x + 9 * sz, y - 2 * sz, x + 9 * sz, y - 5 * sz, x - 9 * sz, y - 5 * sz);
    g.fillStyle = hex;
    quad(g, x - 10 * sz, y - 6 * sz, x + 10 * sz, y - 6 * sz, x + 10 * sz, y - 9 * sz, x - 10 * sz, y - 9 * sz);
    g.fillStyle = '#5c646c';
    dot(g, x + 10 * sz, y - 7.5 * sz, 2.4 * sz);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    dot(g, x - 6 * sz, y - 1.2 * sz, 1.8 * sz);
    dot(g, x + 6 * sz, y - 1.2 * sz, 1.8 * sz);
  } else {
    g.fillStyle = U.shade(hex, -0.3);
    g.fillRect(x - 2.2 * sz, y - 4.5 * sz, 1.8 * sz, 4.5 * sz);
    g.fillRect(x + 0.5 * sz, y - 4.5 * sz, 1.8 * sz, 4.5 * sz);
    g.fillStyle = hex;
    g.fillRect(x - 3 * sz, y - 10 * sz, 6 * sz, 6 * sz);
    g.fillStyle = U.shade(hex, 0.18);
    g.fillRect(x - 3 * sz, y - 10 * sz, 2 * sz, 6 * sz);
    g.fillStyle = '#5a4a44';
    dot(g, x, y - 11.6 * sz, 2.1 * sz);
    line(g, x - 3.4 * sz, y - 3 * sz, x - 4.6 * sz, y - 16 * sz, 1.1 * sz, '#4a4038');
    if (def && def.aura) {
      g.strokeStyle = 'rgba(255,150,60,0.55)';
      g.lineWidth = 1.4;
      g.beginPath();
      g.ellipse(x, y, 16 + Math.sin(R.time * 3) * 2, 8 + Math.sin(R.time * 3), 0, 0, 6.2831853);
      g.stroke();
    }
  }
  const maxHp = e.maxHp || (def ? def.hp : 40);
  if (e.hp !== undefined && e.hp < maxHp) {
    const w = 14 * s;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(x - w * 0.5, y - 20 * sz, w, 2.4);
    g.fillStyle = '#d05040';
    g.fillRect(x - w * 0.5, y - 20 * sz, w * Math.max(0, e.hp / maxHp), 2.4);
  }
}

/* ------------------------------------------------------------------ *
 * The renderer
 * ------------------------------------------------------------------ */

class Renderer {
  constructor(game) {
    // MUST NOT read other modules here (§12) — only after init().
    this.game = game;
    this.canvas = null;
    this.ctx = null;
    this.dpr = 1;
    this.viewW = 800;
    this.viewH = 600;

    // Fallback camera. input.js owns the real one; update() adopts
    // `game.input.cam` whenever it exists so both see the same object.
    this.cam = { x: 0, y: 0, zoom: 1 };
    this.z = 1;                    // cam.zoom, sanity-checked, read-only copy

    this.time = 0;
    this.frame = 0;
    this.seed = 1;
    this.season = C.SEASON_SPRING;
    this.winter = false;
    this.lit = false;          // true when windows should be glowing
    this.night = 0;
    this.accent = '#b8453c';

    // ui.js toggles these with Shift+1..Shift+4 (ADDENDUM F1) via
    // setOverlay(id, on), and may also write render.overlays[id] directly.
    this.overlays = { roads: false, happiness: false, food: false, raid: false };
    this.showMinimap = true;
    this.stats = { frameMs: 0, drawn: 0, chunks: 0, glows: 0 };

    // Reusable draw list: entries are pooled, the array is truncated and
    // refilled, and sorted in place with a numeric comparator (§2 perf).
    this.drawList = [];
    this.pool = [];
    this.poolUsed = 0;

    this.glows = [];
    this.glowUsed = 0;
    this.glowSprite = null;

    this.chunks = new Array(CHUNKS_X * CHUNKS_Y).fill(null);
    this.chunkHash = new Int32Array(CHUNKS_X * CHUNKS_Y).fill(-1);
    this.chunkScale = 1;
    this.groundRev = -1;
    this.snowAmt = 0;
    this.groundAllDirty = true;

    this.terrainCols = null;       // [terrain][variant][elev] hex, per season
    this.defCols = new Map();      // defId -> derived face colours, per season
    this.siteCols = new Map();     // the same, washed toward bare timber, for sites
    this.faceCols = new Map();     // ground colour -> cliff face colour, per snow depth
    this.colSeason = -1;

    this.wallGrid = new Uint8Array(GW * GH);
    this.wallGridFrame = -999;

    this.rubble = [];              // decorative only; never read by the sim
    this.raidInfo = null;          // cached from raid:warned / raid:started

    this.heatGrids = null;         // overlay scratch grids, one per kind
    this.heatFrame = -999;

    this.minimap = null;
    this.minimapDirty = true;
    this._miniRect = { x: 0, y: 0, size: 132 };

    // buildings.repairState() allocates a record per call, so each one is held
    // for a few frames rather than rebuilt per building per frame.
    this.repairCache = new Map();
    // defId -> the inset and eaves height of the wall box that shape drawer
    // raises, learned from the box itself so scaffolding fits the building
    // rather than its footprint. See drawScaffold.
    this.shapeBox = new Map();

    this.ghostCache = { key: '', ok: false, reason: '', worth: null, fault: [] };
    // Screen-space plaque for the armed gathering tool, filled by drawPreview
    // and painted after the world transform is dropped. Null when no gathering
    // tool is armed or the cursor is off the map.
    this.ghostWorth = null;
    this.ghostWorthAt = null;
    // ui.js flags the building a cut-off hut needs pulled down. Purely a view
    // marker with a wall-clock life; nothing reads it back.
    this.flagAt = null;
    this.unsubs = [];
    this._pt = { x: 0, y: 0 };
  }

  /* ---- lifecycle ------------------------------------------------- */

  init() {
    const game = this.game;
    this.canvas = game.canvas || null;
    this.ctx = game.ctx || (this.canvas ? this.canvas.getContext('2d') : null);
    if (this.canvas) this.resize();
    this.buildGlowSprite();
    const bus = game.bus;
    if (bus) {
      this.unsubs.push(bus.on('building:placed', () => this.markGroundDirty()));
      this.unsubs.push(bus.on('building:completed', () => this.markGroundDirty()));
      this.unsubs.push(bus.on('building:destroyed', (p) => this.onDestroyed(p)));
      this.unsubs.push(bus.on('season:changed', () => { this.colSeason = -1; this.markGroundDirty(); }));
      // Copied, not retained: the payload belongs to military.js.
      this.unsubs.push(bus.on('raid:warned', (p) => {
        this.raidInfo = { wave: p.wave, daysUntil: p.daysUntil, passes: p.passes };
      }));
      this.unsubs.push(bus.on('raid:started', (p) => {
        if (this.raidInfo) this.raidInfo = { wave: p.wave, daysUntil: 0, passes: this.raidInfo.passes };
      }));
      this.unsubs.push(bus.on('raid:ended', () => { this.raidInfo = null; }));
    }
    if (game.world && game.world.seed !== undefined) this.seed = game.world.seed | 0;
    return this;
  }

  dispose() {
    for (let i = 0; i < this.unsubs.length; i++) this.unsubs[i]();
    this.unsubs.length = 0;
  }

  /** main.js must call this on window resize; update() also self-checks. */
  resize() {
    const c = this.canvas;
    if (!c) return;
    const dpr = Math.min(typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1, 2);
    const w = c.clientWidth || c.width || 800;
    const h = c.clientHeight || c.height || 600;
    this.dpr = dpr;
    this.viewW = w;
    this.viewH = h;
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }
  }

  serialize() {
    return {
      overlays: {
        roads: this.overlays.roads, happiness: this.overlays.happiness,
        food: this.overlays.food, raid: this.overlays.raid,
      },
      minimap: this.showMinimap,
    };
  }

  restore(obj) {
    if (!obj) return;
    if (obj.overlays) {
      for (let i = 0; i < OVERLAY_NAMES.length; i++) {
        const k = OVERLAY_NAMES[i];
        if (typeof obj.overlays[k] === 'boolean') this.overlays[k] = obj.overlays[k];
      }
    } else if (typeof obj.overlay === 'string' && this.overlays[obj.overlay] !== undefined) {
      this.overlays[obj.overlay] = true;
    }
    if (typeof obj.minimap === 'boolean') this.showMinimap = obj.minimap;
    this.heatFrame = -999;
  }

  /* ---- public view API (ui.js / input.js / main.js) ---------------- */

  /**
   * ui.js toggles the four §13 overlays through this. `on` omitted toggles.
   * `setOverlay('none')` clears them all. Unknown ids are ignored.
   */
  setOverlay(id, on) {
    if (id === 'none' || id === '' || id === null || id === undefined) {
      this.overlays.roads = false;
      this.overlays.happiness = false;
      this.overlays.food = false;
      this.overlays.raid = false;
    } else if (this.overlays[id] !== undefined) {
      this.overlays[id] = on === undefined ? !this.overlays[id] : !!on;
    }
    this.heatFrame = -999;
    return this.overlays;
  }

  /** True while any §13 overlay is on — ui.js dims its own chrome on this. */
  anyOverlay() {
    return this.overlays.roads || this.overlays.happiness || this.overlays.food || this.overlays.raid;
  }

  toggleMinimap() {
    this.showMinimap = !this.showMinimap;
    return this.showMinimap;
  }

  /** Anything that changes terrain, roads or building footprints calls this. */
  markGroundDirty() {
    this.groundAllDirty = true;
    this.minimapDirty = true;
    this.wallGridFrame = -999;
    this.heatFrame = -999;
  }

  /* ---- projection (shared with input.js; both derive from utils) --- */

  worldToScreenX(wx) { return (wx - this.cam.x) * this.z + this.viewW * 0.5; }
  worldToScreenY(wy) { return (wy - this.cam.y) * this.z + this.viewH * 0.5; }
  screenToWorldX(sx) { return (sx - this.viewW * 0.5) / this.z + this.cam.x; }
  screenToWorldY(sy) { return (sy - this.viewH * 0.5) / this.z + this.cam.y; }

  /**
   * CSS pixels relative to the canvas -> tile. Elevation is ignored on
   * purpose: picking uses the flat projection so the tile under the cursor is
   * always the tile the cursor is geometrically over.
   */
  screenToTile(sx, sy) {
    const wx = this.screenToWorldX(sx);
    const wy = this.screenToWorldY(sy);
    const x = Math.floor(U.unIsoX(wx, wy));
    const y = Math.floor(U.unIsoY(wx, wy));
    const p = this._pt;
    p.x = x;
    p.y = y;
    p.idx = U.inBounds(x, y) ? U.toIdx(x, y) : -1;
    return p;
  }

  /** Centre the camera on a tile — the alerts panel pans here. */
  centreOnTile(x, y) {
    this.cam.x = tcx(x, y);
    this.cam.y = tcy(x, y);
  }

  /* ---- palettes (rebuilt on season change, never per frame) -------- */

  ensurePalettes(season) {
    if (this.colSeason === season) return;
    this.colSeason = season;
    const wash = SEASON_WASH[season];
    // [terrain][variant][elev] — elev only lightens, since elevation is
    // cosmetic and a raised tile catches more sky.
    const t = [];
    for (let i = 0; i < C.TERRAIN_INFO.length; i++) {
      const info = C.TERRAIN_INFO[i];
      const water = i === C.TERRAIN.WATER || i === C.TERRAIN.SHORE;
      const amt = water ? wash.amt * 0.35 : i === C.TERRAIN.MOUNTAIN ? wash.amt * 0.7 : wash.amt;
      // Water and mountain cover huge unbroken areas, so their tone spread is
      // damped; grass and forest can take the full range without banding.
      const spread = water ? 0.3 : i === C.TERRAIN.MOUNTAIN ? 0.6 : 1;
      const vars = [];
      for (let v = 0; v < GROUND_TONES; v++) {
        const k = 0.5 + (v / (GROUND_TONES - 1) - 0.5) * spread;
        let base = U.mix(info.colour, info.colourAlt, k);
        base = U.mix(base, wash.hex, amt);
        const lifts = [];
        for (let e = 0; e < 5; e++) lifts.push(U.shade(base, e * 0.022));
        vars.push(lifts);
      }
      t.push(vars);
    }
    this.terrainCols = t;
    this.defCols.clear();
    this.siteCols.clear();
    this.faceCols.clear();

    const leaves = season === C.SEASON_AUTUMN ? AUTUMN_LEAF
      : season === C.SEASON_WINTER ? WINTER_LEAF
        : season === C.SEASON_SPRING ? SPRING_LEAF : SUMMER_LEAF;
    const sets = [];
    for (let i = 0; i < 4; i++) {
      sets.push({ a: leaves[i], b: U.shade(leaves[i], -0.22), c: U.shade(leaves[i], 0.16) });
    }
    this.leafSets = sets;
    this.oreCols = [];
    for (let i = 0; i < C.RESOURCE_INFO.length; i++) {
      const rc = C.RESOURCE_INFO[i].colour;
      this.oreCols.push({ a: rc, b: U.shade(rc, 0.18), c: U.shade(rc, -0.28) });
    }
    this.treeTrunk = U.mix('#5a4630', wash.hex, season === C.SEASON_WINTER ? 0.2 : 0.05);
    this.rockMid = '#8f8e87';
    this.rockDark = '#6f6e68';
    this.rockLight = '#a6a59d';
    this.bushDark = season === C.SEASON_AUTUMN ? '#6d5a3c' : '#4d6b45';
    this.bushLight = season === C.SEASON_AUTUMN ? '#8a7248' : '#658a58';
    this.accent = '#b8453c';
    this._tunicD = new Map();
    this._tunicL = new Map();
  }

  /** Canopy colour for a tree, varying per tile and per season. */
  /** Canopy triple (base / shaded / lit) for a tree, by stable tile hash. */
  leafSet(h) {
    return this.leafSets[(((h * 1013) % 1) * 4) | 0];
  }

  leafShade(h) {
    return this.leafSet(h).b;
  }

  tunicDark(hex) {
    let v = this._tunicD.get(hex);
    if (v === undefined) { v = U.shade(hex, -0.32); this._tunicD.set(hex, v); }
    return v;
  }

  tunicLight(hex) {
    let v = this._tunicL.get(hex);
    if (v === undefined) { v = U.shade(hex, 0.14); this._tunicL.set(hex, v); }
    return v;
  }

  /** Derived faces for one building def. Cached: shade() allocates strings. */
  colsFor(def) {
    let c = this.defCols.get(def.id);
    if (c !== undefined) return c;
    const p = def.palette || { roof: '#8a7050', wall: '#c8b795', trim: '#5f4b30' };
    const winter = this.season === C.SEASON_WINTER;
    const wall = winter ? U.mix(p.wall, '#c9d6e4', 0.12) : p.wall;
    const roofC = winter ? U.mix(p.roof, '#b9c6d6', 0.12) : p.roof;
    c = {
      wall: wall,
      wallL: U.shade(wall, -0.12),        // §1: left face 12% darker
      wallR: U.shade(wall, -0.22),        // §1: right face 22% darker
      roof: roofC,
      roofB: U.shade(roofC, -0.16),
      roofE: U.shade(roofC, -0.28),
      ridge: U.shade(roofC, 0.22),
      course: U.rgba(U.shade(roofC, -0.45), 0.35),
      trim: p.trim,
      trimD: U.shade(p.trim, -0.25),
      trimL: U.shade(p.trim, 0.2),
      glass: '#ffd291',
      glassDay: U.shade(p.trim, -0.12),
      crateA: '#b9955f', crateB: '#a4854f', crateM: '#8f7444', crateD: '#7a6239',
      yard: U.mix(wall, '#8d8158', 0.55),
      stock: '#ddd6c4', stockD: '#b3a993',
      soil: '#7d6144', soilWinter: '#8b8478',
      furrow: '#65492f', furrowWinter: '#9aa0a6',
      crop: '#cbab5e', cropYoung: '#8fae5c',
      pit: '#5f5952', pitDeep: '#4a453f', pitRim: U.shade(wall, -0.18),
      spoilA: '#8a8279', spoilB: '#736c64',
      water: '#4f7285',
    };
    this.defCols.set(def.id, c);
    return c;
  }

  /**
   * The same faces washed toward bare timber. A site's ghost has to read as a
   * frame, not as the painted building: with every face near the same tone the
   * silhouette carries the meaning, and the overlapping fills of a shape drawer
   * cannot stack their way back to full opacity.
   */
  siteColsFor(def) {
    let c = this.siteCols.get(def.id);
    if (c !== undefined) return c;
    const src = this.colsFor(def);
    c = {};
    for (const k in src) {
      const v = src[k];
      c[k] = typeof v === 'string' && v.charCodeAt(0) === 35 ? U.mix(v, SITE_TIMBER, 0.40) : v;
    }
    c.course = U.rgba(U.shade(c.roof, -0.35), 0.28);
    this.siteCols.set(def.id, c);
    return c;
  }

  /* ---- ambient -------------------------------------------------- */

  ambient(timeOfDay) {
    const t = timeOfDay - Math.floor(timeOfDay);
    let i = 0;
    while (i < SKY_STOPS.length - 2 && SKY_STOPS[i + 1].t <= t) i++;
    const a = SKY_STOPS[i];
    const b = SKY_STOPS[i + 1];
    const k = (t - a.t) / (b.t - a.t);
    const out = this._amb || (this._amb = { sky: '', tint: '', amt: 0, night: 0 });
    out.sky = U.mix(a.sky, b.sky, k);
    out.tint = U.mix(a.tint, b.tint, k);
    out.amt = lerpN(a.amt, b.amt, k);
    out.night = lerpN(a.night, b.night, k);
    if (this.season === C.SEASON_WINTER) {
      out.sky = U.mix(out.sky, '#93a4b6', 0.25);
      out.tint = U.mix(out.tint, '#b9cede', 0.18);
      out.amt = Math.min(0.75, out.amt + 0.05);
    }
    return out;
  }

  buildGlowSprite() {
    if (typeof document === 'undefined') return;
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,214,150,0.95)');
    grad.addColorStop(0.35, 'rgba(255,178,92,0.42)');
    grad.addColorStop(1, 'rgba(255,150,60,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    this.glowSprite = c;
  }

  /** Entity drawers call this; the emissive pass paints them after the tint. */
  addGlow(x, y, r, intensity) {
    let e = this.glows[this.glowUsed];
    if (e === undefined) { e = { x: 0, y: 0, r: 0, i: 0 }; this.glows.push(e); }
    e.x = x; e.y = y; e.r = r; e.i = intensity;
    this.glowUsed++;
  }

  /* ---- module-shape lookups, all defensive ----------------------- */

  buildingList() {
    const b = this.game.buildings;
    if (!b) return EMPTY;
    return b.list || b.all || b.buildings || EMPTY;
  }

  villagerList() {
    const v = this.game.villagers;
    if (!v) return EMPTY;
    return v.list || v.all || v.villagers || EMPTY;
  }

  enemyList() {
    const m = this.game.military;
    if (!m) return EMPTY;
    return m.enemies || m.units || EMPTY;
  }

  enemyDef(e) {
    if (e.def) return e.def;
    if (e.typeIdx !== undefined && C.ENEMY_TYPES[e.typeIdx]) return C.ENEMY_TYPES[e.typeIdx];
    return C.ENEMY_BY_ID[e.type || e.typeId || e.defId || e.kind] || null;
  }

  defOf(b) {
    return C.BUILDING_BY_ID[b.defId] || null;
  }

  /** 0..1 fill of a storage building, for the visible stock on its apron. */
  storeFullness(b) {
    const def = this.defOf(b);
    if (!def || !def.storage || !b.inv) return 0;
    let n = 0;
    for (const k in b.inv) n += b.inv[k];
    return U.clamp(n / (def.storage.cap || 100), 0, 1);
  }

  /** Bitmask of adjacent wall/gate tiles in tile-neighbour order E, S, W, N. */
  wallMaskAt(x, y) {
    if (this.wallGridFrame !== this.frame) this.rebuildWallGrid();
    let m = 0;
    if (x + 1 < GW && this.wallGrid[U.toIdx(x + 1, y)]) m |= 1;
    if (y + 1 < GH && this.wallGrid[U.toIdx(x, y + 1)]) m |= 2;
    if (x > 0 && this.wallGrid[U.toIdx(x - 1, y)]) m |= 4;
    if (y > 0 && this.wallGrid[U.toIdx(x, y - 1)]) m |= 8;
    return m;
  }

  rebuildWallGrid() {
    this.wallGridFrame = this.frame;
    const list = this.buildingList();
    this.wallGrid.fill(0);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const def = this.defOf(b);
      if (!def || (def.shape !== 'wall' && def.shape !== 'gate')) continue;
      this.wallGrid[U.toIdx(b.x, b.y)] = 1;
    }
  }

  onDestroyed(p) {
    const def = C.BUILDING_BY_ID[p.defId];
    this.rubble.push({ x: p.x, y: p.y, w: def ? def.w : 1, h: def ? def.h : 1, t: 8 });
    this.markGroundDirty();
  }

  /* ---- ground cache ---------------------------------------------- */

  /**
   * Ground lives in 8x8-tile offscreen chunks. Terrain changes rarely and
   * re-jittering 5184 diamonds (plus blend masks and road cobbles) every frame
   * will not hold 60fps, so a chunk is painted once and blitted until
   * `world.rev`, the season or the snow depth moves.
   */
  chunkBounds(ci, out) {
    const cx = ci % CHUNKS_X;
    const cy = (ci / CHUNKS_X) | 0;
    const tx0 = cx * CHUNK;
    const ty0 = cy * CHUNK;
    const tx1 = Math.min(tx0 + CHUNK - 1, GW - 1);
    const ty1 = Math.min(ty0 + CHUNK - 1, GH - 1);
    out.tx0 = tx0; out.ty0 = ty0; out.tx1 = tx1; out.ty1 = ty1;
    out.wx = tcx(tx0, ty1) - HW - 3;
    out.wy = tcy(tx0, ty0) - HH - 3 - ELEV_LIFT * 4;
    out.w = (tcx(tx1, ty0) + HW + 3) - out.wx;
    out.h = (tcy(tx1, ty1) + HH + 3 + FACE_DROP) - out.wy;
    return out;
  }

  buildChunk(ci) {
    const world = this.game.world;
    if (!world || typeof document === 'undefined') return null;
    const b = this.chunkBounds(ci, this._cb || (this._cb = {}));
    const s = this.chunkScale;
    let ch = this.chunks[ci];
    if (ch === null) {
      ch = { canvas: document.createElement('canvas'), g: null, scale: 0, wx: 0, wy: 0, w: 0, h: 0, used: 0 };
      ch.g = ch.canvas.getContext('2d');
      this.chunks[ci] = ch;
    }
    const pw = Math.ceil(b.w * s);
    const ph = Math.ceil(b.h * s);
    if (ch.canvas.width !== pw || ch.canvas.height !== ph) { ch.canvas.width = pw; ch.canvas.height = ph; }
    ch.scale = s; ch.wx = b.wx; ch.wy = b.wy; ch.w = b.w; ch.h = b.h;
    const g = ch.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, pw, ph);
    g.setTransform(s, 0, 0, s, -b.wx * s, -b.wy * s);
    g.lineCap = 'round';
    // Painter's order inside the chunk too: elevation makes tiles overlap.
    for (let d = 0; d <= (b.tx1 - b.tx0) + (b.ty1 - b.ty0); d++) {
      for (let tx = b.tx0; tx <= b.tx1; tx++) {
        const ty = b.ty0 + d - (tx - b.tx0);
        if (ty < b.ty0 || ty > b.ty1) continue;
        this.paintTile(g, tx, ty);
      }
    }
    this.chunkHash[ci] = this.groundRev;
    ch.used = this.frame;
    this.stats.chunks = (this.stats.chunks + 1) & 0xffff;
    return ch;
  }

  paintTile(g, tx, ty) {
    const world = this.game.world;
    const idx = U.toIdx(tx, ty);
    const t = world.terrain[idx];
    const elev = world.elev ? world.elev[idx] : 0;
    const lift = elev * ELEV_LIFT;
    const cx = tcx(tx, ty);
    const cy = tcy(tx, ty) - lift;
    const cols = this.terrainCols[t];
    const variant = (U.hash2(tx, ty, this.seed) * GROUND_TONES) | 0;
    const base = cols[variant][elev];

    const rank = BLEND_RANK[t];
    let blends = 0;
    for (let d = 0; d < 4; d++) {
      const nx = tx + NB_DX[d];
      const ny = ty + NB_DY[d];
      if (!U.inBounds(nx, ny)) { NB_T[d] = -1; continue; }
      const nt = world.terrain[U.toIdx(nx, ny)];
      NB_T[d] = BLEND_RANK[nt] > rank ? nt : -1;
      if (NB_T[d] >= 0) blends++;
    }

    U.diamondPath(g, cx, cy, HW + 2, HH + 1.2, idx);
    g.fillStyle = base;
    g.fill();
    if (blends > 0) {
      g.save();
      g.clip();
      // Lower priority first, so the highest-priority terrain paints last.
      for (let pass = 0; pass < 14; pass++) {
        for (let d = 0; d < 4; d++) {
          const nt = NB_T[d];
          if (nt < 0 || BLEND_RANK[nt] !== pass) continue;
          this.blendBand(g, tx, ty, d, cx, cy, this.terrainCols[nt][variant][elev]);
        }
      }
      this.texture(g, t, tx, ty, cx, cy, idx);
      g.restore();
    } else {
      this.texture(g, t, tx, ty, cx, cy, idx);
    }
    if (world.road && world.road[idx] > 0) this.paintRoad(g, world, tx, ty, idx, cx, cy, t);
    if (elev > 0) this.elevEdges(g, world, tx, ty, elev, base, cx, cy);
  }

  /**
   * A raised tile's own side faces, on the two edges that face the camera (its
   * E and S edges), plus a brow where the ground steps down *behind* it. The
   * back faces are hidden by the tile itself, so on a hill rising toward the
   * camera the brow is the only thing that can mark the step — without it the
   * lift alone is indistinguishable from flat ground (ADDENDUM AL1).
   *
   * Drawn after the tile's own ground so the diamond's seam overshoot cannot
   * eat the faces, and sunk FACE_BURY px under the tile in front for the same
   * reason: the tile in front paints later, and hides the base, not the face.
   */
  elevEdges(g, world, tx, ty, elev, base, cx, cy) {
    const e = world.elev;
    // Every face starts 1px inside the tile: diamondPath jitters its corners
    // by ±1.5px and the face must not leave a hairline of sky behind.
    const eE = U.inBounds(tx + 1, ty) ? e[U.toIdx(tx + 1, ty)] : elev;
    if (eE < elev) {
      const dy = (elev - eE) * ELEV_LIFT + FACE_BURY;
      g.fillStyle = this.faceCol(base, 0);
      quad(g, cx + HW, cy - 1, cx, cy + HH - 1, cx, cy + HH + dy, cx + HW, cy + dy);
    }
    const eS = U.inBounds(tx, ty + 1) ? e[U.toIdx(tx, ty + 1)] : elev;
    if (eS < elev) {
      const dy = (elev - eS) * ELEV_LIFT + FACE_BURY;
      g.fillStyle = this.faceCol(base, 1);
      quad(g, cx, cy + HH - 1, cx - HW, cy - 1, cx - HW, cy + dy, cx, cy + HH + dy);
    }
    const eN = U.inBounds(tx, ty - 1) ? e[U.toIdx(tx, ty - 1)] : elev;
    if (eN < elev) brow(g, cx, cy, cx, cy - HH, cx + HW, cy, elev - eN);
    const eW = U.inBounds(tx - 1, ty) ? e[U.toIdx(tx - 1, ty)] : elev;
    if (eW < elev) brow(g, cx, cy, cx - HW, cy, cx, cy - HH, elev - eW);
  }

  /** §1's face split, applied to a cliff: the E face reads darker than the S. */
  faceCol(base, side) {
    const key = base + side;
    let c = this.faceCols.get(key);
    if (c === undefined) {
      c = U.shade(base, side === 0 ? -0.26 : -0.14);
      if (this.snowAmt > 0.02) c = U.mix(c, '#e2e9f2', this.snowAmt * 0.18);
      this.faceCols.set(key, c);
    }
    return c;
  }

  /**
   * The §1 blend mask: the higher-priority terrain spills across the shared
   * edge with a seeded ragged inner boundary, so shorelines and forest edges
   * are organic instead of staircased. Called inside the tile's own clip.
   */
  blendBand(g, tx, ty, d, cx, cy, hex) {
    const px = cx + EDGE_X[d * 2];
    const py = cy + EDGE_Y[d * 2];
    const qx = cx + EDGE_X[d * 2 + 1];
    const qy = cy + EDGE_Y[d * 2 + 1];
    const mx = (px + qx) * 0.5;
    const my = (py + qy) * 0.5;
    const a = 0.18 + U.hash2(tx * 4 + d, ty, 0x1f3) * 0.44;
    const bb = 0.16 + U.hash2(tx, ty * 4 + d, 0x8c5) * 0.5;
    const c = 0.18 + U.hash2(tx + d, ty + d, 0x6b2) * 0.44;
    g.fillStyle = hex;
    g.beginPath();
    // Overshoot the two shared corners; the clip trims them back exactly.
    g.moveTo(cx + (px - cx) * 1.2, cy + (py - cy) * 1.2);
    g.lineTo(cx + (qx - cx) * 1.2, cy + (qy - cy) * 1.2);
    g.lineTo(lerpN(qx, cx, c), lerpN(qy, cy, c));
    g.lineTo(lerpN(mx, cx, bb), lerpN(my, cy, bb));
    g.lineTo(lerpN(px, cx, a), lerpN(py, cy, a));
    g.closePath();
    g.fill();
  }

  texture(g, t, tx, ty, cx, cy, idx) {
    const h = U.hash2(tx, ty, 0x4411);
    if (t === C.TERRAIN.GRASS || t === C.TERRAIN.MEADOW) {
      g.strokeStyle = t === C.TERRAIN.MEADOW ? 'rgba(196,206,138,0.55)' : 'rgba(150,172,116,0.5)';
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i < 4; i++) {
        const x = cx + (U.hash2(tx + i, ty, 0x71) - 0.5) * 44;
        const y = cy + (U.hash2(tx, ty + i, 0x33) - 0.5) * 20;
        g.moveTo(x, y + 1.5);
        g.lineTo(x + (h - 0.5) * 2, y - 2.5);
      }
      g.stroke();
    } else if (t === C.TERRAIN.SAND) {
      g.fillStyle = 'rgba(232,216,180,0.45)';
      for (let i = 0; i < 5; i++) {
        dot(g, cx + (U.hash2(tx + i, ty, 0x9b) - 0.5) * 44, cy + (U.hash2(tx, ty + i, 0x2e) - 0.5) * 20, 0.9);
      }
    } else if (t === C.TERRAIN.ROCK || t === C.TERRAIN.MOUNTAIN) {
      g.fillStyle = 'rgba(255,255,255,0.07)';
      tri(g, cx - 14, cy + 2, cx + 6, cy - 5, cx + 12, cy + 4);
      g.fillStyle = 'rgba(0,0,0,0.10)';
      tri(g, cx + 2, cy + 6, cx + 16, cy - 1, cx + 10, cy + 7);
    } else if (t === C.TERRAIN.WATER || t === C.TERRAIN.SHORE) {
      g.strokeStyle = t === C.TERRAIN.SHORE ? 'rgba(198,222,232,0.35)' : 'rgba(150,182,198,0.22)';
      g.lineWidth = 1.1;
      g.beginPath();
      for (let i = 0; i < 2; i++) {
        const y = cy + (i - 0.5) * 9 + (h - 0.5) * 5;
        g.moveTo(cx - 13, y);
        g.quadraticCurveTo(cx, y - 3, cx + 13, y);
      }
      g.stroke();
    } else if (t === C.TERRAIN.FOREST) {
      g.fillStyle = 'rgba(38,58,40,0.28)';
      ellipse(g, cx + (h - 0.5) * 16, cy + (U.hash2(ty, tx, 0x55) - 0.5) * 8, 11, 5);
    }
    if (this.snowAmt > 0.02 && t !== C.TERRAIN.WATER) {
      g.fillStyle = 'rgba(240,247,255,' + (this.snowAmt * 0.5).toFixed(2) + ')';
      U.diamondPath(g, cx, cy, HW + 2, HH + 1.2, idx + 7777);
      g.fill();
      if (this.snowAmt > 0.4) {
        g.fillStyle = 'rgba(255,255,255,0.7)';
        for (let i = 0; i < 3; i++) {
          dot(g, cx + (U.hash2(tx + i, ty, 0xa3) - 0.5) * 40, cy + (U.hash2(tx, ty + i, 0xb7) - 0.5) * 18, 0.8);
        }
      }
    }
  }

  /**
   * Roads are drawn as a band reaching to every roaded orthogonal neighbour,
   * so a network reads as connected cobbles rather than isolated squares
   * (§1: road connectivity outranks prettiness).
   */
  paintRoad(g, world, tx, ty, idx, cx, cy, terrain) {
    const kind = world.road[idx];
    const cobble = kind === C.ROAD_COBBLE;
    const bridge = terrain === C.TERRAIN.WATER || terrain === C.TERRAIN.SHORE;
    const surf = bridge ? '#9a7a4e' : cobble ? '#94938b' : '#8b7250';
    const edge = bridge ? '#6f5432' : cobble ? '#76756e' : '#6d5738';
    let links = 0;
    for (let d = 0; d < 4; d++) {
      const nx = tx + NB_DX[d];
      const ny = ty + NB_DY[d];
      NB_T[d] = U.inBounds(nx, ny) && world.road[U.toIdx(nx, ny)] > 0 ? 1 : 0;
      links += NB_T[d];
    }
    g.fillStyle = edge;
    this.roadShape(g, cx, cy, links, 0.60, 1.0);
    g.fillStyle = surf;
    this.roadShape(g, cx, cy, links, 0.50, 0.88);
    if (bridge) {
      g.strokeStyle = '#6f5432';
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 1; i < 5; i++) {
        g.moveTo(cx - HW * 0.5 + i * 6, cy - HH * 0.3 + i * 3);
        g.lineTo(cx + HW * 0.15 + i * 6, cy + HH * 0.4 + i * 3);
      }
      g.stroke();
    } else if (cobble) {
      for (let i = 0; i < 9; i++) {
        const hx = U.hash2(tx * 3 + i, ty, 0x5f);
        const hy = U.hash2(tx, ty * 3 + i, 0x91);
        const x = cx + (hx - 0.5) * 40;
        const y = cy + (hy - 0.5) * 19;
        g.fillStyle = hx > 0.5 ? 'rgba(174,173,164,0.75)' : 'rgba(118,117,110,0.6)';
        quad(g, x - 3, y, x, y + 1.5, x + 3, y, x, y - 1.5);
      }
    } else {
      g.fillStyle = 'rgba(104,84,58,0.5)';
      for (let i = 0; i < 5; i++) {
        dot(g, cx + (U.hash2(tx + i, ty, 0x27) - 0.5) * 38, cy + (U.hash2(tx, ty + i, 0x6d) - 0.5) * 17, 1.1);
      }
    }
  }

  roadShape(g, cx, cy, links, core, reach) {
    g.beginPath();
    if (links === 0) {
      g.moveTo(cx, cy - HH * core);
      g.lineTo(cx + HW * core, cy);
      g.lineTo(cx, cy + HH * core);
      g.lineTo(cx - HW * core, cy);
      g.closePath();
      g.fill();
      return;
    }
    // Centre diamond, then one trapezoid per link out to the shared edge.
    g.moveTo(cx, cy - HH * core);
    g.lineTo(cx + HW * core, cy);
    g.lineTo(cx, cy + HH * core);
    g.lineTo(cx - HW * core, cy);
    g.closePath();
    for (let d = 0; d < 4; d++) {
      if (!NB_T[d]) continue;
      const px = cx + EDGE_X[d * 2] * reach;
      const py = cy + EDGE_Y[d * 2] * reach;
      const qx = cx + EDGE_X[d * 2 + 1] * reach;
      const qy = cy + EDGE_Y[d * 2 + 1] * reach;
      g.moveTo(lerpN(px, cx, 1 - core), lerpN(py, cy, 1 - core));
      g.lineTo(px, py);
      g.lineTo(qx, qy);
      g.lineTo(lerpN(qx, cx, 1 - core), lerpN(qy, cy, 1 - core));
      g.closePath();
    }
    g.fill();
  }

  /* ---- frame ------------------------------------------------------ */

  takeItem() {
    let e = this.pool[this.poolUsed];
    if (e === undefined) {
      e = { key: 0, kx: 0, sub: 0, kind: 0, ref: null, a: 0, b: 0 };
      this.pool.push(e);
    }
    this.poolUsed++;
    return e;
  }

  /** Draws the frame. Reads state only — this method never writes to the sim. */
  update(dt, game) {
    if (game) this.game = game;
    const g = this.ctx;
    if (!g || !this.canvas) return;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
    this.frame++;
    this.time += dt;
    if ((this.frame & 31) === 0) this.resize();

    const gm = this.game;
    if (gm.input && gm.input.cam) this.cam = gm.input.cam;
    const cam = this.cam;
    // input.js owns the camera and its clamping; render only reads it, with a
    // local fallback so a degenerate zoom cannot divide by zero here.
    this.z = (cam.zoom > 0 && Number.isFinite(cam.zoom)) ? cam.zoom : 1;
    DETAIL = this.z >= 0.75 ? 2 : this.z >= 0.45 ? 1 : 0;

    const world = gm.world;
    const clock = (world && world.clock) || DEFAULT_CLOCK;
    this.season = clock.season | 0;
    this.winter = this.season === C.SEASON_WINTER;
    if (world && world.seed !== undefined) this.seed = world.seed | 0;
    this.ensurePalettes(this.season);
    const amb = this.ambient(clock.timeOfDay || 0);
    this.night = amb.night;
    this.lit = amb.night > 0.12;
    this.snowAmt = world && world.weather ? U.clamp(world.weather.snow, 0, 1) : (this.winter ? 1 : 0);

    // Decorative rubble ages out; it is render-local, never simulation state.
    for (let i = this.rubble.length - 1; i >= 0; i--) {
      this.rubble[i].t -= dt;
      if (this.rubble[i].t <= 0) U.removeSwap(this.rubble, i);
    }

    const dpr = this.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = amb.sky;
    g.fillRect(0, 0, this.viewW, this.viewH);
    if (!world || !world.terrain) { this.stats.frameMs = 0; return; }

    // World transform: everything below is in iso world pixels.
    const z = this.z;
    const ox = dpr * (this.viewW * 0.5 - cam.x * z);
    const oy = dpr * (this.viewH * 0.5 - cam.y * z);
    g.setTransform(dpr * z, 0, 0, dpr * z, ox, oy);

    const pad = 72 / z;
    const wx0 = cam.x - this.viewW / (2 * z) - pad;
    const wx1 = cam.x + this.viewW / (2 * z) + pad;
    const wy0 = cam.y - this.viewH / (2 * z) - pad;
    const wy1 = cam.y + this.viewH / (2 * z) + pad;
    // Viewport in iso world pixels; particles.js culls against these.
    this.vx0 = wx0; this.vx1 = wx1; this.vy0 = wy0; this.vy1 = wy1;

    // The tile rect reaches further south than the viewport: a keep or a
    // cathedral anchored just below the bottom edge still draws up into view,
    // and culling on the plain viewport would pop it out.
    let tx0 = 1e9, tx1 = -1e9, ty0 = 1e9, ty1 = -1e9;
    for (let i = 0; i < 4; i++) {
      const px = i & 1 ? wx1 : wx0;
      const py = i & 2 ? wy1 + TALLEST : wy0;
      const a = U.unIsoX(px, py);
      const b = U.unIsoY(px, py);
      if (a < tx0) tx0 = a;
      if (a > tx1) tx1 = a;
      if (b < ty0) ty0 = b;
      if (b > ty1) ty1 = b;
    }
    tx0 = Math.max(0, Math.floor(tx0) - 1);
    ty0 = Math.max(0, Math.floor(ty0) - 1);
    tx1 = Math.min(GW - 1, Math.ceil(tx1) + 1);
    ty1 = Math.min(GH - 1, Math.ceil(ty1) + 1);

    this.drawGround(g, world);
    this.drawTileHighlights(g, world);
    const parts = gm.particles;
    // ADDENDUM F4: ground particles under the entity pass, overhead over it,
    // both with the world transform already set.
    if (parts && typeof parts.drawGroundWorld === 'function') parts.drawGroundWorld(g, this);
    this.drawEntities(g, world, tx0, ty0, tx1, ty1, z);
    if (parts && typeof parts.drawOverheadWorld === 'function') parts.drawOverheadWorld(g, this);
    else if (parts && typeof parts.draw === 'function') parts.draw(g, this);

    // Ambient pass: one multiply over the finished world.
    if (amb.amt > 0.015) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha = amb.amt;
      g.fillStyle = amb.tint;
      g.fillRect(0, 0, this.viewW, this.viewH);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.setTransform(dpr * z, 0, 0, dpr * z, ox, oy);
    }
    this.drawGlows(g);
    this.drawOverlay(g, world, tx0, ty0, tx1, ty1);
    this.drawPreview(g, world);
    this.drawSelection(g);

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawRaidArrow(g, world);
    this.drawGhostHud(g);
    if (this.showMinimap) this.drawMinimap(g, world);

    this.stats.frameMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    this.stats.glows = this.glowUsed;
  }

  drawGround(g, world) {
    const wantScale = this.z <= 0.7 ? 0.6 : this.z <= 1.3 ? 1 : 2;
    if (wantScale !== this.chunkScale) {
      this.chunkScale = wantScale;
      this.chunkHash.fill(-1);
    }
    const revBase = world.rev === undefined ? (this.frame / 30) | 0 : world.rev | 0;
    const rev = ((revBase * 131 + this.season * 7 + Math.round(this.snowAmt * 4)) | 0);
    if (this.groundAllDirty || rev !== this.groundRev) {
      this.groundRev = rev;
      this.groundAllDirty = false;
      this.chunkHash.fill(-1);
      this.faceCols.clear();   // keyed on ground colour, but snow is mixed in
      this.minimapDirty = true;
    }
    let budget = CHUNK_BUILD_BUDGET;
    const bb = this._cb2 || (this._cb2 = {});
    // (cx + cy) ascending keeps raised chunks compositing in painter order.
    for (let d = 0; d <= CHUNKS_X + CHUNKS_Y - 2; d++) {
      for (let cx = 0; cx < CHUNKS_X; cx++) {
        const cy = d - cx;
        if (cy < 0 || cy >= CHUNKS_Y) continue;
        const ci = cy * CHUNKS_X + cx;
        this.chunkBounds(ci, bb);
        if (bb.wx > this.vx1 || bb.wx + bb.w < this.vx0 || bb.wy > this.vy1 || bb.wy + bb.h < this.vy0) continue;
        let ch = this.chunks[ci];
        if (this.chunkHash[ci] !== this.groundRev || ch === null || ch.scale !== this.chunkScale) {
          if (budget > 0) { ch = this.buildChunk(ci); budget--; }
        }
        if (ch === null || ch === undefined) continue;
        ch.used = this.frame;
        g.drawImage(ch.canvas, ch.wx, ch.wy, ch.w, ch.h);
      }
    }
    this.evictChunks();
  }

  evictChunks() {
    let live = 0;
    for (let i = 0; i < this.chunks.length; i++) if (this.chunks[i] !== null) live++;
    if (live <= CHUNK_CACHE_MAX) return;
    for (let i = 0; i < this.chunks.length && live > CHUNK_CACHE_MAX; i++) {
      const ch = this.chunks[i];
      if (ch === null || this.frame - ch.used < 120) continue;
      ch.canvas.width = 1;
      ch.canvas.height = 1;
      this.chunks[i] = null;
      this.chunkHash[i] = -1;
      live--;
    }
  }

  elevAt(x, y) {
    const w = this.game.world;
    if (!w || !w.elev || !U.inBounds(x, y)) return 0;
    return w.elev[U.toIdx(x, y)] * ELEV_LIFT;
  }

  /**
   * Painter's algorithm on `tx + ty` ascending, then `tx` ascending (§3).
   * Multi-tile buildings sort by their maximum (south) corner so they occlude
   * everything behind them; units use their float tile position minus the
   * half-tile offset so a unit standing on a tile sorts exactly like that tile.
   */
  drawEntities(g, world, tx0, ty0, tx1, ty1, z) {
    const list = this.drawList;
    list.length = 0;
    this.poolUsed = 0;
    this.glowUsed = 0;

    const res = world.resource;
    const bld = world.building;
    if (res) {
      for (let ty = ty0; ty <= ty1; ty++) {
        const row = ty * GW;
        for (let tx = tx0; tx <= tx1; tx++) {
          const idx = row + tx;
          if (res[idx] === 0) continue;
          if (bld && bld[idx] >= 0) continue;
          const e = this.takeItem();
          e.kind = KIND_PROP; e.sub = SUB_PROP;
          e.key = tx + ty; e.kx = tx; e.a = tx; e.b = ty; e.ref = idx;
          list.push(e);
        }
      }
    }

    const bl = this.buildingList();
    for (let i = 0; i < bl.length; i++) {
      const b = bl[i];
      const def = this.defOf(b);
      // path/road/bridge carry instance:false — they live in world.road and
      // are painted with the ground, never as instances.
      if (!def || def.instance === false) continue;
      if (b.x > tx1 || b.x + def.w - 1 < tx0 || b.y > ty1 || b.y + def.h - 1 < ty0) continue;
      const e = this.takeItem();
      e.kind = KIND_BUILDING; e.sub = SUB_BUILDING;
      e.key = (b.x + def.w - 1) + (b.y + def.h - 1);
      e.kx = b.x + def.w - 1;
      e.ref = b; e.a = 0; e.b = 0;
      list.push(e);
    }

    for (let i = 0; i < this.rubble.length; i++) {
      const r = this.rubble[i];
      if (r.x > tx1 || r.x + r.w - 1 < tx0 || r.y > ty1 || r.y + r.h - 1 < ty0) continue;
      const e = this.takeItem();
      e.kind = KIND_RUBBLE; e.sub = SUB_RUBBLE;
      e.key = (r.x + r.w - 1) + (r.y + r.h - 1);
      e.kx = r.x + r.w - 1;
      e.ref = r;
      list.push(e);
    }

    const vl = this.villagerList();
    for (let i = 0; i < vl.length; i++) {
      const v = vl[i];
      if (v.dead) continue;
      const ux = v.vx - 0.5;
      const uy = v.vy - 0.5;
      if (ux < tx0 - 1 || ux > tx1 + 1 || uy < ty0 - 1 || uy > ty1 + 1) continue;
      const e = this.takeItem();
      e.kind = KIND_UNIT; e.sub = SUB_UNIT;
      // Sorting in tile-index space: a unit at the centre of tile (tx, ty) has
      // vx+vy = tx+ty+1, so key = vx+vy-1 sorts it exactly like that tile.
      e.key = ux + uy; e.kx = ux; e.ref = v; e.a = ux; e.b = uy;
      list.push(e);
    }

    const el = this.enemyList();
    for (let i = 0; i < el.length; i++) {
      const en = el[i];
      // military.js pools enemies; an inactive slot is a corpse, not a unit.
      if (en.dead || en.active === false) continue;
      const ux = (en.vx !== undefined ? en.vx : en.x) - 0.5;
      const uy = (en.vy !== undefined ? en.vy : en.y) - 0.5;
      if (ux < tx0 - 1 || ux > tx1 + 1 || uy < ty0 - 1 || uy > ty1 + 1) continue;
      const e = this.takeItem();
      e.kind = KIND_ENEMY; e.sub = SUB_UNIT;
      e.key = ux + uy; e.kx = ux; e.ref = en; e.a = ux; e.b = uy;
      list.push(e);
    }

    list.sort(cmpDraw);
    this.stats.drawn = list.length;

    const vs = 0.5 * Math.max(1, 0.75 / z);
    const lod = z < 0.62;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      switch (e.kind) {
        case KIND_PROP: {
          const lift = world.elev ? world.elev[e.ref] * ELEV_LIFT : 0;
          const cx = tcx(e.a, e.b);
          const cy = tcy(e.a, e.b) - lift;
          if (lod) this.drawPropLod(g, world.resource[e.ref], e.a, e.b, cx, cy);
          else drawProp(this, g, world.resource[e.ref], world.amount ? world.amount[e.ref] : 20, e.a, e.b, cx, cy);
          break;
        }
        case KIND_BUILDING:
          this.drawBuilding(g, e.ref, z);
          break;
        case KIND_RUBBLE:
          this.drawRubble(g, e.ref);
          break;
        case KIND_UNIT: {
          const v = e.ref;
          const lift = this.elevAt(Math.round(e.a), Math.round(e.b));
          const x = U.isoX(e.a + 0.5, e.b + 0.5);
          const y = U.isoY(e.a + 0.5, e.b + 0.5) - lift;
          // v.path is a reused buffer — v.path.length is its capacity, so the
          // live length is v.pathLen (villagers.js handoff).
          const moving = !!(v.path && v.pathStep < (v.pathLen !== undefined ? v.pathLen : v.path.length));
          if (lod) {
            g.fillStyle = 'rgba(0,0,0,0.25)';
            ellipse(g, x, y, 3, 1.4);
            g.fillStyle = C.ROLE_COLOURS[v.role] || C.ROLE_COLOURS.idler;
            g.fillRect(x - 2.4, y - 8, 4.8, 7);
          } else {
            drawVillager(this, g, v, x, y, vs * 2, moving);
          }
          break;
        }
        case KIND_ENEMY: {
          const lift = this.elevAt(Math.round(e.a), Math.round(e.b));
          drawEnemy(this, g, e.ref, U.isoX(e.a + 0.5, e.b + 0.5), U.isoY(e.a + 0.5, e.b + 0.5) - lift, vs * 2);
          break;
        }
        default:
          break;
      }
    }
  }

  /** Zoomed right out, props collapse to a blob: 1500 trees still hold 60fps. */
  drawPropLod(g, res, tx, ty, cx, cy) {
    if (res === C.RESOURCE.TREE) {
      g.fillStyle = this.leafShade(U.hash2(tx, ty, this.seed));
      ellipse(g, cx, cy - 6, 8, 6);
    } else if (res === C.RESOURCE.STONE || res === C.RESOURCE.IRON || res === C.RESOURCE.CLAY) {
      g.fillStyle = C.RESOURCE_INFO[res].colour;
      ellipse(g, cx, cy - 2, 7, 3.5);
    } else if (res === C.RESOURCE.BERRY || res === C.RESOURCE.HERB) {
      g.fillStyle = res === C.RESOURCE.BERRY ? '#5d7a50' : '#6f9a5e';
      ellipse(g, cx, cy - 2, 5, 3);
    } else if (res === C.RESOURCE.GAME) {
      g.fillStyle = '#8b6a4a';
      ellipse(g, cx, cy - 3, 4, 2.4);
    }
  }

  drawRubble(g, r) {
    const o = footprint(RH_A, r.x, r.y, r.w, r.h, 0.9);
    const fade = U.clamp(r.t / 8, 0, 1);
    g.globalAlpha = fade;
    g.fillStyle = '#57514a';
    fillRhomb(g, o);
    for (let i = 0; i < 7; i++) {
      const hx = U.hash2(r.x + i, r.y, 0x8e);
      const hy = U.hash2(r.x, r.y + i, 0x2d);
      const x = lerpN(lerpN(o.wx, o.nx, hx), lerpN(o.sx, o.ex, hx), hy);
      const y = lerpN(lerpN(o.wy, o.ny, hx), lerpN(o.sy, o.ey, hx), hy);
      g.fillStyle = i % 2 ? '#6e675e' : '#4f4942';
      quad(g, x - 4, y, x, y + 2, x + 4, y, x, y - 2.6);
    }
    g.fillStyle = 'rgba(40,34,30,0.5)';
    ellipse(g, o.cx, o.cy - 3, 10, 5);
    g.globalAlpha = 1;
  }

  drawBuilding(g, b, z) {
    const def = this.defOf(b);
    const lift = this.elevAt(b.x, b.y);
    const col = this.colsFor(def);
    const o = footprint(RH_A, b.x, b.y, def.w, def.h, 1);
    // Contact shadow, cast east: the 12%/22% face shading puts the light in
    // the upper left, so the shadow has to fall the other way or the building
    // reads as pasted onto the ground.
    if (DETAIL >= 1) {
      raise(o, RH_B, lift - 1, 1.0);
      const sh = Math.min(9, 4 + def.w * 1.2);
      g.fillStyle = 'rgba(26,22,18,0.19)';
      g.beginPath();
      g.moveTo(RH_B.nx + sh, RH_B.ny + sh * 0.45);
      g.lineTo(RH_B.ex + sh, RH_B.ey + sh * 0.45);
      g.lineTo(RH_B.sx + sh, RH_B.sy + sh * 0.45);
      g.lineTo(RH_B.wx + sh, RH_B.wy + sh * 0.45);
      g.closePath();
      g.fill();
    }
    g.fillStyle = 'rgba(28,24,20,0.16)';
    raise(o, RH_B, lift - 1, 0.96);
    fillRhomb(g, RH_B);

    if (!b.built) {
      this.drawSite(g, b, def, o, col, lift, z);
      return;
    }

    const maxHp = b.maxHp || def.maxHp || 100;
    const frac = (b.hp !== undefined && maxHp > 0) ? U.clamp(b.hp / maxHp, 0, 1) : 1;
    const rep = b.repairing ? this.repairInfo(b) : null;

    // The scaffold's far pole goes up before the building and the rest after,
    // so the frame reads as standing around it rather than leaning on the roof
    // (ADDENDUM AO1: in this projection, order is what makes an edge read).
    if (rep) this.drawScaffold(g, def, o, lift, 0);

    const marked = frac < 1 || rep !== null;
    SHAPE_REC = marked;
    if (marked) { WALL_REC.area = 0; ROOF_REC.area = 0; }
    const draw = SHAPE_DRAW[def.shape] || drawHut;
    draw(this, g, o, def, b, col, lift);
    SHAPE_REC = false;
    // Only this building's own box: WALL_REC still holds the last marked
    // building's when nothing was recorded for this one.
    if (marked && WALL_REC.area > 0) this.noteShapeBox(def, o);

    if (frac < 1) this.drawDamage(g, b, def, o, lift, frac);
    if (rep) this.drawRepair(g, def, o, lift, rep, z);
    else if (frac < 1) this.damageBar(g, def, o, lift, frac, z);
    if (b.active === false) this.badge(g, o, lift, '#6f8fbf', 0, z);
    else if (b.idleReason) this.badge(g, o, lift, (b.idleReason === 'no road' || b.idleReason === 'cut off') ? '#c8503f' : '#d79a35', 1, z);
  }

  /**
   * Construction site. §1 puts readability first, so a site has to say *which*
   * building it is becoming, not merely that something is going up: a ghost of
   * the finished silhouette stands inside scaffolding cut to that building's
   * own height, with the real walls rising through it as `progress` climbs.
   */
  drawSite(g, b, def, o, col, lift, z) {
    // Dedicated scratch: the ghost pass below runs a shape drawer, which uses
    // every other RH_* as its own working space.
    const pad = raise(o, RH_SITE, lift, 0.96);
    g.fillStyle = '#7c6a52';
    fillRhomb(g, pad);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    ellipse(g, pad.cx, pad.cy, (pad.ex - pad.wx) * 0.32, (pad.sy - pad.ny) * 0.3);

    const ratio = def.buildTime > 0 ? U.clamp((b.progress || 0) / def.buildTime, 0, 1) : 1;

    // Walls actually standing, to this shape's own eaves height. Drawn first:
    // the ghost is translucent, so the real masonry reads through it.
    const full = (SITE_WALL_H[def.shape] || 18) + def.w * 1.6;
    const grown = full * ratio;
    if (grown > 1.5) {
      const t = raise(o, RH_C, 0, 0.74);
      box(g, t, lift, grown, col, RH_E, 1);
    }

    // The plan over it, washed toward bare timber: faint at the first peg,
    // nearly solid by the last, and always the finished silhouette.
    const ghost = SHAPE_DRAW[def.shape] || drawHut;
    SITE_B.x = b.x;
    SITE_B.y = b.y;
    const wasLit = this.lit;
    this.lit = false;               // an empty frame has no hearth to glow
    g.globalAlpha = 0.42 + 0.32 * ratio;
    ghost(this, g, o, def, SITE_B, this.siteColsFor(def), lift);
    g.globalAlpha = 1;
    this.lit = wasLit;

    // Scaffolding poles at the four corners, with rails and one diagonal brace.
    const h = full + 6;
    const px = [pad.nx, pad.ex, pad.sx, pad.wx];
    const py = [pad.ny, pad.ey, pad.sy, pad.wy];
    g.strokeStyle = '#9c7d4e';
    g.lineWidth = 1.6;
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      g.moveTo(px[i], py[i]);
      g.lineTo(px[i], py[i] - h);
    }
    for (let k = 1; k <= 2; k++) {
      const hy = h * (k / 3);
      for (let i = 0; i < 4; i++) {
        g.moveTo(px[i], py[i] - hy);
        g.lineTo(px[(i + 1) & 3], py[(i + 1) & 3] - hy);
      }
    }
    g.moveTo(px[3], py[3]);
    g.lineTo(px[2], py[2] - h);
    g.stroke();

    this.drawMaterialPile(g, pad, b.delivered);

    if (z > 0.45) {
      const w = 26 + def.w * 6;
      const y = pad.ny - h - 8;
      g.fillStyle = 'rgba(20,18,16,0.65)';
      g.fillRect(pad.cx - w * 0.5 - 1, y - 1, w + 2, 6);
      g.fillStyle = '#8ec06a';
      g.fillRect(pad.cx - w * 0.5, y, w * ratio, 4);
    }
  }

  /**
   * Raid damage on a standing building. Every mark is parameterised on the box
   * and the roof the shape drawer actually raised, so it lands on masonry
   * instead of beside it: scorched ground around the footing, char climbing the
   * two camera-facing faces, cracks in those faces, and — past half health — a
   * gap torn in the near roof slope with the rafters showing through.
   *
   * The roof gap and the ground scorch are the two that still carry when the
   * building is twenty pixels wide, which is the zoom the player surveys from.
   */
  drawDamage(g, b, def, o, lift, frac) {
    const hurt = U.clamp(1 - frac, 0, 1);

    // Scorched ground, a ring wider than the building standing on it: the one
    // mark a field, a yard or a well can carry, since those shapes raise no
    // walls at all, and the only one with any area left at minimum zoom.
    const pad = raise(o, RH_B, lift, 1.05);
    g.fillStyle = 'rgba(38,28,20,' + (0.13 + 0.26 * hurt).toFixed(3) + ')';
    fillRhomb(g, pad);
    if (WALL_REC.area <= 0) return;

    // Char up the W-S and S-E faces, as the two stacked bands `brow` lays on a
    // ground lip — an area, so it survives DETAIL dropping to 0.
    const v = 0.22 + 0.48 * hurt;
    for (let side = 0; side < 2; side++) {
      g.fillStyle = 'rgba(26,20,16,' + (0.15 + 0.25 * hurt).toFixed(3) + ')';
      wallQuad(g, 0, 1, 0, v * 0.55, side);
      g.fillStyle = 'rgba(26,20,16,' + (0.07 + 0.13 * hurt).toFixed(3) + ')';
      wallQuad(g, 0, 1, v * 0.55, v, side);
    }

    if (hurt > 0.4 && ROOF_REC.area > 0) {
      const k = U.clamp((hurt - 0.4) / 0.6, 0, 1);
      const cu = 0.28 + 0.44 * U.hash2(b.x, b.y, 0x5d1);
      const hw = 0.09 + 0.09 * k;
      const u0 = U.clamp(cu - hw, 0.05, 0.86);
      const u1 = U.clamp(cu + hw, 0.14, 0.95);
      const v1 = 0.34 + 0.62 * k;
      // Torn, not cut: the upper lip walks along the slope in four steps so the
      // hole reads as broken tiles rather than a patch painted on the roof.
      g.fillStyle = 'rgba(22,17,14,0.88)';
      g.beginPath();
      roofPt(u0, 0.06, PT0);
      g.moveTo(PT0.x, PT0.y);
      roofPt(u1, 0.06, PT0);
      g.lineTo(PT0.x, PT0.y);
      for (let i = 4; i >= 0; i--) {
        const t = i / 4;
        const jag = 0.78 + 0.34 * U.hash2(b.x + i, b.y - i, 0x91);
        roofPt(lerpN(u0, u1, t), v1 * (i === 0 || i === 4 ? 0.62 : jag), PT0);
        g.lineTo(PT0.x, PT0.y);
      }
      g.closePath();
      g.fill();
      if (DETAIL >= 1) {
        // A rafter or two left standing across the hole, and the splintered lip.
        g.strokeStyle = '#a2854f';
        g.lineWidth = 1;
        g.beginPath();
        for (let i = 1; i <= 2; i++) {
          const u = lerpN(u0, u1, i / 3);
          roofPt(u, 0.06, PT0);
          roofPt(u, v1 * 0.9, PT1);
          g.moveTo(PT0.x, PT0.y);
          g.lineTo(PT1.x, PT1.y);
        }
        g.stroke();
        g.strokeStyle = 'rgba(226,211,176,0.5)';
        g.lineWidth = 1.2;
        g.beginPath();
        for (let i = 4; i >= 0; i--) {
          const t = i / 4;
          const jag = 0.78 + 0.34 * U.hash2(b.x + i, b.y - i, 0x91);
          roofPt(lerpN(u0, u1, t), v1 * (i === 0 || i === 4 ? 0.62 : jag), PT0);
          if (i === 4) g.moveTo(PT0.x, PT0.y); else g.lineTo(PT0.x, PT0.y);
        }
        g.stroke();
      }
    }

    if (DETAIL < 1) return;

    const cracks = hurt > 0.6 ? 5 : hurt > 0.3 ? 3 : 2;
    g.strokeStyle = 'rgba(26,18,14,0.62)';
    g.lineWidth = 1.1;
    g.beginPath();
    for (let i = 0; i < cracks; i++) {
      const side = i & 1;
      let u = 0.12 + 0.72 * U.hash2(b.x + i, b.y, 0x3c1);
      let vv = 0.55 + 0.4 * U.hash2(b.x, b.y + i, 0x7a2);
      wallPt(u, vv, side, PT0);
      g.moveTo(PT0.x, PT0.y);
      for (let k = 0; k < 3; k++) {
        u += (U.hash2(b.x + i, b.y + k, 0x1b7) - 0.5) * 0.15;
        vv -= 0.15 + 0.09 * hurt;
        if (vv < 0.03) vv = 0.03;
        wallPt(U.clamp(u, 0.03, 0.97), vv, side, PT0);
        g.lineTo(PT0.x, PT0.y);
      }
    }
    g.stroke();

    // Masonry down at the foot of the worst of it.
    if (hurt > 0.5) {
      for (let i = 0; i < 3; i++) {
        wallPt(0.2 + 0.6 * U.hash2(b.x + i, b.y + i, 0x2d9), 0, i & 1, PT0);
        const y = PT0.y + 2 + i * 1.4;
        g.fillStyle = i & 1 ? '#6b6259' : '#544d46';
        quad(g, PT0.x - 3.2, y, PT0.x, y + 1.7, PT0.x + 3.2, y, PT0.x, y - 1.7);
      }
    }
  }

  /** Just clear of whatever the shape drawer raised: where a marker goes. */
  markerY(o, lift) {
    if (ROOF_REC.area > 0) return (ROOF_REC.ay + ROOF_REC.by) * 0.5 - 7;
    if (WALL_REC.area > 0) return WALL_REC.top.cy - 7;
    return o.ny - lift - 18;
  }

  /**
   * Remember how far inside its footprint this shape's walls sit, and how tall
   * they are, from the box it just raised. Scaffolding has to go up before the
   * building it wraps, and a second table of per-shape numbers would drift the
   * first time a drawer changed — so the drawer teaches it instead, and a def
   * seen once is exact from then on.
   */
  noteShapeBox(def, o) {
    const span = o.ex - o.wx;
    if (!(span > 0)) return;
    let e = this.shapeBox.get(def.id);
    if (e === undefined) { e = { scale: 0.8, h: 18 }; this.shapeBox.set(def.id, e); }
    e.scale = (WALL_REC.base.ex - WALL_REC.base.wx) / span;
    e.h = WALL_REC.base.ny - WALL_REC.top.ny;
  }

  /**
   * How much of a building the raid took, in one plaque above its roof: what
   * still stands in bone, what is gone in rust. Sized with a floor on its
   * screen size — the villager `vs` trick — because the question it answers is
   * asked with the whole valley on screen, where a world-space bar is a pixel.
   */
  damageBar(g, def, o, lift, frac, z) {
    const s = Math.max(1, 0.85 / z);
    const w = (18 + def.w * 4) * s;
    const h = 3.2 * s;
    const x = o.cx - w * 0.5;
    const y = this.markerY(o, lift) - h;
    g.fillStyle = 'rgba(18,16,13,0.72)';
    g.fillRect(x - s, y - s, w + s * 2, h + s * 2);
    g.fillStyle = '#cfc2a4';
    g.fillRect(x, y, w * frac, h);
    g.fillStyle = frac > 0.5 ? '#b5502f' : '#932f22';
    g.fillRect(x + w * frac, y, w * (1 - frac), h);
  }

  /**
   * The scaffolding around a repair: deliberately the frame a building site
   * wears — four poles, rails at thirds, one diagonal brace, the same timber —
   * because a repair *is* construction work. What tells the two apart is that
   * a building is standing inside this one. Cut to the shape's eaves from
   * SITE_WALL_H, the table a site's own scaffold is already cut to.
   *
   * `pass` 0 is the north pole and its rails, drawn before the building; 1 is
   * the three the viewer sees in front of it. Returns the pole height.
   */
  drawScaffold(g, def, o, lift, pass) {
    const fit = this.shapeBox.get(def.id);
    const pad = raise(o, RH_SITE, lift, (fit ? fit.scale : 0.8) + 0.1);
    const h = (fit ? fit.h : (SITE_WALL_H[def.shape] || 18) + def.w * 1.6) + 7;
    const px = [pad.nx, pad.ex, pad.sx, pad.wx];
    const py = [pad.ny, pad.ey, pad.sy, pad.wy];
    g.strokeStyle = '#9c7d4e';
    g.lineWidth = 1.6;
    g.beginPath();
    if (pass === 0) {
      g.moveTo(px[0], py[0]);
      g.lineTo(px[0], py[0] - h);
      for (let k = 1; k <= 2; k++) {
        const hy = h * (k / 3);
        g.moveTo(px[3], py[3] - hy); g.lineTo(px[0], py[0] - hy);
        g.moveTo(px[0], py[0] - hy); g.lineTo(px[1], py[1] - hy);
      }
    } else {
      for (let i = 1; i < 4; i++) {
        g.moveTo(px[i], py[i]);
        g.lineTo(px[i], py[i] - h);
      }
      for (let k = 1; k <= 2; k++) {
        const hy = h * (k / 3);
        g.moveTo(px[1], py[1] - hy); g.lineTo(px[2], py[2] - hy);
        g.moveTo(px[2], py[2] - hy); g.lineTo(px[3], py[3] - hy);
      }
      g.moveTo(px[3], py[3]);
      g.lineTo(px[2], py[2] - h);
    }
    g.stroke();
    return h;
  }

  /**
   * A repair in progress, so the player never re-clicks a building already
   * being worked on. `phase` splits the two situations that want different
   * answers from them: 'hauling' is a bare frame with a part-filled tarp
   * beside it, waiting on the road; 'building' has the plank deck up at the
   * height the work has reached, a ladder to it, and fresh timber replacing
   * the char from the foot of the wall upward.
   */
  drawRepair(g, def, o, lift, st, z) {
    const h = this.drawScaffold(g, def, o, lift, 1);
    const pad = RH_SITE;                 // the pad drawScaffold just fitted
    const working = st.phase === 'building';
    const work = U.clamp(st.work, 0, 1);

    if (working) {
      // Bare, unweathered timber — the site ghost's own tone — coming up the
      // wall over the char as the work is done.
      if (WALL_REC.area > 0 && work > 0.02) {
        const gone = st.maxHp > 0 ? U.clamp(1 - st.hp / st.maxHp, 0, 1) : 0;
        const v = (0.22 + 0.48 * gone) * work;
        g.fillStyle = 'rgba(226,211,176,0.30)';
        wallQuad(g, 0, 1, 0, v, 0);
        wallQuad(g, 0, 1, 0, v, 1);
      }
      const dy = 6 + (h - 12) * work;
      g.strokeStyle = '#c3a366';
      g.lineWidth = 3.2;
      g.beginPath();
      g.moveTo(pad.ex, pad.ey - dy);
      g.lineTo(pad.sx, pad.sy - dy);
      g.lineTo(pad.wx, pad.wy - dy);
      g.stroke();
      g.strokeStyle = 'rgba(66,50,30,0.5)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(pad.ex, pad.ey - dy + 2.2);
      g.lineTo(pad.sx, pad.sy - dy + 2.2);
      g.lineTo(pad.wx, pad.wy - dy + 2.2);
      g.stroke();
      if (DETAIL >= 1) {
        // Ladder up to the deck from the near corner.
        const lx = lerpN(pad.sx, pad.ex, 0.26);
        const ly = lerpN(pad.sy, pad.ey, 0.26);
        g.strokeStyle = '#9c7d4e';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(lx, ly); g.lineTo(lx + 3, ly - dy);
        g.moveTo(lx + 3.4, ly); g.lineTo(lx + 6.4, ly - dy);
        for (let r = 1; r < 5; r++) {
          const t = r / 5;
          g.moveTo(lerpN(lx, lx + 3, t), ly - dy * t);
          g.lineTo(lerpN(lx + 3.4, lx + 6.4, t), ly - dy * t);
        }
        g.stroke();
      }
    } else {
      // Pegged out and empty until the hauliers come: the tarp is the delivery
      // point, and a site shows the same one for the same reason.
      g.fillStyle = 'rgba(40,34,28,0.20)';
      ellipse(g, lerpN(pad.wx, pad.cx, 0.34), lerpN(pad.wy, pad.cy, 0.34) + 2, 12, 6);
      this.drawMaterialPile(g, pad, st.onHand);
    }

    // The two halves repairState itself reports: a bar stuck short in amber is
    // waiting on materials, one stuck short in green is waiting on a builder.
    const s = Math.max(1, 0.85 / z);
    const w = (22 + def.w * 5) * s;
    const bh = 3.4 * s;
    const x = o.cx - w * 0.5;
    const y = Math.min(this.markerY(o, lift), pad.ny - h) - bh;
    g.fillStyle = 'rgba(18,16,13,0.72)';
    g.fillRect(x - s, y - s, w + s * 2, bh + s * 2);
    g.fillStyle = '#8a8069';                    // the empty track, so a repair
    g.fillRect(x, y, w, bh);                    // barely begun is a bar, not a blot
    g.fillStyle = '#c9a24a';
    g.fillRect(x, y, w * 0.5 * U.clamp(st.supplied, 0, 1), bh);
    g.fillStyle = '#8ec06a';
    g.fillRect(x + w * 0.5, y, w * 0.5 * work, bh);
    g.fillStyle = 'rgba(18,16,13,0.55)';
    g.fillRect(x + w * 0.5 - s * 0.5, y, s, bh);
  }

  /**
   * Materials standing on a tarp by the west corner, for a site's deliveries
   * and for a repair's undelivered-into-structure pile alike. The player has
   * to be able to see at a glance that the stone turned up and the planks did
   * not.
   */
  drawMaterialPile(g, pad, counts) {
    if (!counts) return;
    let cols = 0;
    for (const k in counts) if (counts[k] > 0) cols++;
    if (cols === 0) return;
    const bx0 = lerpN(pad.wx, pad.cx, 0.30);
    const by0 = lerpN(pad.wy, pad.cy, 0.30);
    g.fillStyle = 'rgba(40,34,28,0.22)';
    ellipse(g, bx0 + cols * 5, by0 + 2, 9 + cols * 5, 6);
    let n = 0;
    for (const item in counts) {
      const qty = counts[item];
      if (!qty) continue;
      const it = C.ITEMS[item];
      const hex = it ? it.colour : '#9a917c';
      const light = U.shade(hex, 0.14);
      const dark = U.shade(hex, -0.22);
      const stacks = Math.min(5, 1 + ((qty / 3) | 0));
      for (let st = 0; st < stacks; st++) {
        const x = bx0 + n * 10 + (st & 1) * 3.5;
        const y = by0 - (st >> 1) * 5 - (st & 1) * 1.5;
        g.fillStyle = light;
        quad(g, x - 5, y, x, y + 2.6, x + 5, y, x, y - 2.6);
        g.fillStyle = dark;
        quad(g, x - 5, y, x, y + 2.6, x, y + 7.6, x - 5, y + 5);
        g.fillStyle = hex;
        quad(g, x, y + 2.6, x + 5, y, x + 5, y + 5, x, y + 7.6);
      }
      n++;
    }
  }

  /**
   * `buildings.repairState` allocates a fresh record per call and is pure, so
   * the renderer holds each one for a few frames instead of asking per
   * building per frame. A repair runs for minutes; six frames of lag on a
   * progress bar is invisible.
   */
  repairInfo(b) {
    let e = this.repairCache.get(b.id);
    if (e !== undefined && this.frame - e.frame < 6) return e.st;
    const bs = this.game.buildings;
    const st = (bs && typeof bs.repairState === 'function') ? bs.repairState(b.id) : null;
    if (e === undefined) {
      if (this.repairCache.size > 128) this.repairCache.clear();
      e = { frame: 0, st: null };
      this.repairCache.set(b.id, e);
    }
    e.frame = this.frame;
    e.st = st;
    return st;
  }

  /** Small canvas badge over an idle or paused building (§1 legibility). */
  badge(g, o, lift, hex, glyph, z) {
    if (z < 0.5) return;
    const x = o.nx;
    const y = o.ny - lift - 26;
    g.fillStyle = 'rgba(20,18,16,0.55)';
    dot(g, x, y + 1, 6.4);
    g.fillStyle = hex;
    dot(g, x, y, 6);
    g.fillStyle = '#20201c';
    if (glyph === 1) {
      g.fillRect(x - 0.9, y - 3.4, 1.8, 4.4);
      g.fillRect(x - 0.9, y + 1.8, 1.8, 1.8);
    } else {
      g.fillRect(x - 2.4, y - 3, 1.7, 6);
      g.fillRect(x + 0.7, y - 3, 1.7, 6);
    }
  }

  /** Emissive pass — lit windows, braziers and the market, over the dusk tint. */
  drawGlows(g) {
    if (this.glowUsed === 0 || this.glowSprite === null) return;
    g.globalCompositeOperation = 'lighter';
    const spr = this.glowSprite;
    const k = U.clamp(this.night, 0, 1);
    for (let i = 0; i < this.glowUsed; i++) {
      const e = this.glows[i];
      g.globalAlpha = U.clamp(e.i * k, 0, 1);
      g.drawImage(spr, e.x - e.r, e.y - e.r * 0.85, e.r * 2, e.r * 1.7);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  drawTileHighlights(g, world) {
    const inp = this.game.input;
    if (!inp) return;
    const sel = inp.selected;
    if (sel && sel.kind === 'building' && sel.id !== undefined && sel.id >= 0) {
      const b = this.findBuilding(sel.id);
      if (b) {
        const def = this.defOf(b);
        if (def) {
          const o = footprint(RH_A, b.x, b.y, def.w, def.h, 1);
          g.fillStyle = 'rgba(255,238,190,0.22)';
          raise(o, RH_B, this.elevAt(b.x, b.y), 1);
          fillRhomb(g, RH_B);
        }
      }
    }
    const hv = inp.hover;
    if (hv !== undefined && hv >= 0 && hv < GW * GH) {
      const tx = U.toX(hv);
      const ty = U.toY(hv);
      const lift = world.elev ? world.elev[hv] * ELEV_LIFT : 0;
      U.diamondPath(g, tcx(tx, ty), tcy(tx, ty) - lift, HW - 1, HH - 0.5, hv);
      g.strokeStyle = 'rgba(255,252,235,0.55)';
      g.lineWidth = 1.4;
      g.stroke();
    }
  }

  findBuilding(id) {
    const bs = this.game.buildings;
    if (bs && typeof bs.byId === 'object' && bs.byId) {
      const v = bs.byId[id] || bs.byId.get && bs.byId.get(id);
      if (v) return v;
    }
    if (bs && typeof bs.get === 'function') return bs.get(id);
    const list = this.buildingList();
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* ---- build preview, drag preview, selection --------------------- */

  /**
   * Ghost + drag preview. `input.ghost` wins if it exists; otherwise the ghost
   * is derived from `input.tool` (a building defId) and `input.hover`.
   * Validity comes from `buildings.canPlace`, cached per tile so a held mouse
   * does not re-validate every frame.
   */
  drawPreview(g, world) {
    const inp = this.game.input;
    this.ghostWorth = null;
    if (!inp) return;
    const bs = this.game.buildings;

    const tiles = inp.dragTiles;
    if (tiles && tiles.length) {
      const dragDef = (inp.ghost && inp.ghost.defId) || (typeof inp.tool === 'string' ? inp.tool : null);
      for (let i = 0; i < tiles.length; i++) {
        const idx = tiles[i];
        if (idx < 0 || idx >= GW * GH) continue;
        const tx = U.toX(idx);
        const ty = U.toY(idx);
        const ok = this.canPlaceCached(bs, dragDef, tx, ty);
        const lift = world.elev ? world.elev[idx] * ELEV_LIFT : 0;
        g.fillStyle = ok ? 'rgba(126,208,120,0.38)' : 'rgba(214,84,66,0.40)';
        U.diamondPath(g, tcx(tx, ty), tcy(tx, ty) - lift, HW - 1, HH - 0.5, undefined);
        g.fill();
        g.strokeStyle = ok ? 'rgba(180,240,170,0.7)' : 'rgba(255,150,130,0.7)';
        g.lineWidth = 1.2;
        g.stroke();
      }
      return;
    }

    if (inp.hover !== undefined && inp.hover < 0) return;
    let defId = null;
    let gx = 0;
    let gy = 0;
    let ok = true;
    if (inp.ghost && inp.ghost.defId) {
      defId = inp.ghost.defId;
      gx = inp.ghost.x | 0;
      gy = inp.ghost.y | 0;
      ok = inp.ghost.ok !== false;
    } else if (typeof inp.tool === 'string' && C.BUILDING_BY_ID[inp.tool] && inp.hover >= 0) {
      defId = inp.tool;
      gx = U.toX(inp.hover);
      gy = U.toY(inp.hover);
      ok = this.canPlaceCached(bs, defId, gx, gy);
    }
    if (defId === null) return;
    const def = C.BUILDING_BY_ID[defId];
    if (!def || !U.inBounds(gx, gy)) return;

    // §13/U3 — what the patch under the cursor is actually worth, before the
    // timber is spent. Cached per tile; drawn in screen space further down.
    if (def.gathers) {
      this.canPlaceCached(bs, defId, gx, gy);
      const worth = this.ghostCache.worth;
      if (worth) {
        this.ghostWorth = worth;
        // The plaque must never award a verdict the footprint contradicts, so
        // it carries canPlace's answer for this tile as well as the patch's.
        this.ghostWorthAt = { x: gx, y: gy, def, ok: ok && this.ghostCache.ok, why: this.ghostCache.reason };
        this.drawGatherRange(g, def, gx, gy);
      }
    }

    const lift = this.elevAt(gx, gy);
    const o = footprint(RH_A, gx, gy, def.w, def.h, 1);
    g.fillStyle = ok ? 'rgba(126,208,120,0.30)' : 'rgba(214,84,66,0.34)';
    raise(o, RH_B, lift, 1);
    fillRhomb(g, RH_B);
    g.globalAlpha = 0.5;
    GHOST_B.x = gx;
    GHOST_B.y = gy;
    const draw = SHAPE_DRAW[def.shape] || drawHut;
    draw(this, g, o, def, GHOST_B, this.colsFor(def), lift);
    g.globalAlpha = 1;
    if (!ok) {
      // On top of the ghost: the tiles at fault are the answer to "why not
      // here?", and they must not be read as part of the building (AL2).
      this.canPlaceCached(bs, defId, gx, gy);
      if (this.ghostCache.key === this.ghostKey(defId, gx, gy)) {
        this.drawFaultTiles(g, world, this.ghostCache.fault);
      }
    }
    g.strokeStyle = ok ? 'rgba(170,245,160,0.9)' : 'rgba(255,140,120,0.9)';
    g.lineWidth = 1.8;
    raise(o, RH_B, lift, 1);
    g.beginPath();
    g.moveTo(RH_B.nx, RH_B.ny);
    g.lineTo(RH_B.ex, RH_B.ey);
    g.lineTo(RH_B.sx, RH_B.sy);
    g.lineTo(RH_B.wx, RH_B.wy);
    g.closePath();
    g.stroke();
  }

  /**
   * `canPlace` plus, for a gathering def, `siteWorth` — both are full radius
   * scans, so they share one cache slot keyed on tile + groundRev and are run
   * once per hovered tile rather than once per frame.
   */
  ghostKey(defId, x, y) {
    return defId + '|' + x + '|' + y + '|' + this.groundRev;
  }

  canPlaceCached(bs, defId, x, y) {
    if (!bs || typeof bs.canPlace !== 'function' || !defId) return true;
    const key = this.ghostKey(defId, x, y);
    if (this.ghostCache.key === key) return this.ghostCache.ok;
    let r = null;
    try {
      r = bs.canPlace(defId, x, y);
    } catch (ignored) {
      void ignored;
    }
    let worth = null;
    const def = C.BUILDING_BY_ID[defId];
    if (def && def.gathers && typeof bs.siteWorth === 'function') {
      try {
        worth = bs.siteWorth(defId, x, y);
      } catch (ignored) {
        void ignored;
      }
    }
    this.ghostCache.key = key;
    this.ghostCache.ok = !!(r && r.ok);
    this.ghostCache.reason = (r && r.reason) || '';
    this.ghostCache.worth = worth;
    this.faultTiles(def, x, y, this.ghostCache.ok ? '' : this.ghostCache.reason, this.ghostCache.fault);
    return this.ghostCache.ok;
  }

  /**
   * The footprint tiles that are actually breaking the rule `canPlace` refused
   * on (ADDENDUM AL2). `canPlace` hands back a reason and not a tile, so the
   * per-tile test behind each reason is repeated here — read-only, over at
   * most sixteen tiles, and only when a placement has already been refused.
   * An empty list means the refusal is not about any one tile (cost, tier, a
   * missing shore) and the whole footprint stays marked instead.
   */
  faultTiles(def, x, y, reason, out) {
    out.length = 0;
    const world = this.game.world;
    if (!world || !def || !reason) return out;
    const mode = FAULT_MODE[reason] || 0;
    if (mode === 0) return out;
    if (mode === 2 || mode === 4) {
      if (this.wallGridFrame !== this.frame) this.rebuildWallGrid();
    }
    const w = def.w > 0 ? def.w : 1;
    const h = def.h > 0 ? def.h : 1;
    const elev = world.elev;
    // Check 4 measures every tile against the footprint's north corner, but
    // what the player needs to see is the step, so the minority side is marked.
    let flat = 0;
    if (mode === 1 && elev) {
      let best = -1;
      for (let dx = 0; dx < w; dx++) {
        for (let dy = 0; dy < h; dy++) {
          if (!U.inBounds(x + dx, y + dy)) continue;
          const e = elev[U.toIdx(x + dx, y + dy)];
          let n = 0;
          for (let ax = 0; ax < w; ax++) {
            for (let ay = 0; ay < h; ay++) {
              if (U.inBounds(x + ax, y + ay) && elev[U.toIdx(x + ax, y + ay)] === e) n++;
            }
          }
          if (n > best) { best = n; flat = e; }
        }
      }
    }
    const want = mode === 6 ? FOOTPRINT_TERRAIN[reason] : null;
    for (let dx = 0; dx < w; dx++) {
      for (let dy = 0; dy < h; dy++) {
        if (!U.inBounds(x + dx, y + dy)) continue;
        const idx = U.toIdx(x + dx, y + dy);
        let bad = false;
        if (mode === 1) bad = elev ? elev[idx] !== flat : false;
        else if (mode === 2) bad = world.building[idx] >= 0 && this.wallGrid[idx] === 0;
        else if (mode === 3) bad = world.road[idx] !== C.ROAD_NONE;
        else if (mode === 4) bad = this.wallGrid[idx] === 1;
        else if (mode === 5) bad = !groundOkFor(def, world.terrain[idx]);
        else if (mode === 6) bad = want.indexOf(world.terrain[idx]) < 0;
        if (bad) out.push(idx);
      }
    }
    return out;
  }

  /** ADDENDUM AL2: the specific tiles a refused placement is refusing over. */
  drawFaultTiles(g, world, fault) {
    for (let i = 0; i < fault.length; i++) {
      const idx = fault[i];
      const tx = U.toX(idx);
      const ty = U.toY(idx);
      const cx = tcx(tx, ty);
      const cy = tcy(tx, ty) - (world.elev ? world.elev[idx] * ELEV_LIFT : 0);
      U.diamondPath(g, cx, cy, HW - 2, HH - 1, undefined);
      g.fillStyle = 'rgba(206,56,38,0.45)';
      g.fill();
      g.strokeStyle = 'rgba(255,214,200,0.95)';
      g.lineWidth = 1.6;
      g.stroke();
      g.beginPath();
      g.moveTo(cx - 8, cy - 4);
      g.lineTo(cx + 8, cy + 4);
      g.moveTo(cx + 8, cy - 4);
      g.lineTo(cx - 8, cy + 4);
      g.stroke();
    }
  }

  /** A timed marker on a tile, for ui.js to point at a building to pull down. */
  flagTile(x, y, seconds) {
    this.flagAt = { x, y, until: this.time + (seconds > 0 ? seconds : 5) };
  }

  /**
   * The reach of a gathering hut's ghost. A circle of radius r in tile space
   * is an axis-aligned ellipse in iso, because (dx-dy) and (dx+dy) are the two
   * projected axes: r*sqrt2 tiles on each, scaled by the half-tile.
   */
  drawGatherRange(g, def, gx, gy) {
    const r = (def.gathers.radius | 0) * 1.41421356;
    if (r <= 0) return;
    const cx = tcx(gx + (def.w >> 1), gy + (def.h >> 1));
    const cy = tcy(gx + (def.w >> 1), gy + (def.h >> 1));
    g.save();
    g.beginPath();
    g.ellipse(cx, cy, r * HW, r * HH, 0, 0, 6.2831853);
    g.strokeStyle = 'rgba(255,246,214,0.5)';
    g.lineWidth = 1.4;
    g.setLineDash(RANGE_DASH);
    g.stroke();
    g.setLineDash(EMPTY_DASH);
    g.restore();
  }

  /**
   * The site-worth plaque and the cut-off flag: both are screen-space, drawn
   * after the world transform is dropped so they stay legible at every zoom.
   */
  drawGhostHud(g) {
    const flag = this.flagAt;
    if (flag) {
      if (this.time > flag.until) this.flagAt = null;
      else {
        const sx = this.worldToScreenX(tcx(flag.x, flag.y));
        const sy = this.worldToScreenY(tcy(flag.x, flag.y));
        // A ring that expands and fades on each beat, so the eye catches it
        // wherever the camera lands, over roof or grass alike.
        const beat = (this.time * 1.6) % 1;
        const rx = (26 + beat * 22) * this.z;
        const ry = rx * (HH / HW);
        g.strokeStyle = 'rgba(20,14,12,' + (0.5 * (1 - beat)).toFixed(2) + ')';
        g.lineWidth = 6;
        g.beginPath();
        g.ellipse(sx, sy, rx, ry, 0, 0, 6.2831853);
        g.stroke();
        g.strokeStyle = 'rgba(255,146,96,' + (0.95 * (1 - beat)).toFixed(2) + ')';
        g.lineWidth = 3;
        g.stroke();
        const lift = 30 + Math.sin(this.time * 5) * 5;
        g.beginPath();
        g.moveTo(sx, sy - lift + 16);
        g.lineTo(sx - 11, sy - lift - 6);
        g.lineTo(sx + 11, sy - lift - 6);
        g.closePath();
        g.fillStyle = 'rgba(236,96,64,0.96)';
        g.fill();
        g.strokeStyle = 'rgba(28,16,12,0.85)';
        g.lineWidth = 2;
        g.stroke();
      }
    }

    const w = this.ghostWorth;
    const at = this.ghostWorthAt;
    if (!w || !at) return;
    const item = C.ITEMS[w.item];
    const what = ((item && item.name) || w.item).toLowerCase();
    const head = w.feeds > 0
      ? 'This patch feeds ' + fmt1(w.feeds) + ' a day; its ' + w.jobs
        + ' workers eat ' + fmt1(w.eats) + '.'
      : 'Nothing to gather here.';
    const sub = w.nodes + (w.nodes === 1 ? ' patch of ' : ' patches of ') + what
      + ' in reach · ' + fmt1(w.perDay) + ' ' + what + '/day'
      + (w.min > 0 ? ' · needs ' + fmt1(w.min) : '');
    const verdict = !w.ok
      ? 'Too thin — placement will refuse it.'
      : at.ok === false
        ? 'The patch is fine; the ground is not — ' + (at.why || 'blocked') + '.'
        : (w.feeds >= w.eats * 2 ? 'A strong site.' : 'It will pay for itself.');
    const good = w.ok && at.ok !== false;

    g.font = '700 12.5px system-ui, sans-serif';
    const wHead = g.measureText(head).width;
    g.font = '500 11px system-ui, sans-serif';
    const bw = Math.max(wHead, g.measureText(sub).width, g.measureText(verdict).width) + 20;
    const bh = 54;
    // Clamped on the box, not on the anchor: HUD_TOP keeps it clear of the top
    // bar, which is opaque and would otherwise swallow the refusal line.
    const sx = U.clamp(this.worldToScreenX(tcx(at.x, at.y)), bw * 0.5 + 12, this.viewW - bw * 0.5 - 12);
    const sy = U.clamp(this.worldToScreenY(tcy(at.x, at.y)) - 62, HUD_TOP + bh, this.viewH - 12);
    const bx = sx - bw * 0.5;
    const by = sy - bh;
    g.fillStyle = 'rgba(24,19,16,0.86)';
    roundRect(g, bx, by, bw, bh, 5);
    g.fill();
    g.strokeStyle = good ? 'rgba(150,210,140,0.85)' : 'rgba(226,120,96,0.9)';
    g.lineWidth = 1.5;
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.font = '700 12.5px system-ui, sans-serif';
    g.fillStyle = good ? '#f4ecd8' : '#ffd3c4';
    g.fillText(head, sx, by + 18);
    g.font = '500 11px system-ui, sans-serif';
    g.fillStyle = 'rgba(226,216,194,0.82)';
    g.fillText(sub, sx, by + 33);
    g.fillStyle = good ? 'rgba(168,222,158,0.95)' : 'rgba(246,158,134,0.95)';
    g.fillText(verdict, sx, by + 47);
    g.textAlign = 'start';
  }

  drawSelection(g) {
    const inp = this.game.input;
    const sel = inp && inp.selected;
    if (!sel || sel.id === undefined || sel.id < 0) return;
    const pulse = 0.6 + Math.sin(this.time * 4) * 0.2;
    if (sel.kind === 'villager') {
      const list = this.villagerList();
      for (let i = 0; i < list.length; i++) {
        const v = list[i];
        if (v.id !== sel.id) continue;
        const x = U.isoX(v.vx, v.vy);
        const y = U.isoY(v.vx, v.vy) - this.elevAt(Math.floor(v.vx), Math.floor(v.vy));
        g.strokeStyle = 'rgba(255,244,200,' + pulse.toFixed(2) + ')';
        g.lineWidth = 1.6;
        g.beginPath();
        g.ellipse(x, y, 8, 4, 0, 0, 6.2831853);
        g.stroke();
        g.beginPath();
        g.moveTo(x, y - 24);
        g.lineTo(x - 3.5, y - 30);
        g.lineTo(x + 3.5, y - 30);
        g.closePath();
        g.fillStyle = 'rgba(255,244,200,0.9)';
        g.fill();
        return;
      }
      return;
    }
    const b = this.findBuilding(sel.id);
    if (!b) return;
    const def = this.defOf(b);
    if (!def) return;
    const o = footprint(RH_A, b.x, b.y, def.w, def.h, 1);
    raise(o, RH_B, this.elevAt(b.x, b.y), 1);
    g.strokeStyle = 'rgba(255,240,190,' + pulse.toFixed(2) + ')';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(RH_B.nx, RH_B.ny);
    g.lineTo(RH_B.ex, RH_B.ey);
    g.lineTo(RH_B.sx, RH_B.sy);
    g.lineTo(RH_B.wx, RH_B.wy);
    g.closePath();
    g.stroke();
  }

  /* ---- §13 overlays ---------------------------------------------- */

  drawOverlay(g, world, tx0, ty0, tx1, ty1) {
    if (this.overlays.roads) this.overlayRoads(g, world, tx0, ty0, tx1, ty1);
    if (this.overlays.happiness) this.overlayHeat(g, world, 'happiness', tx0, ty0, tx1, ty1);
    if (this.overlays.food) this.overlayHeat(g, world, 'food', tx0, ty0, tx1, ty1);
    if (this.overlays.raid) this.overlayRaid(g, world);
  }

  overlayHeat(g, world, kind, tx0, ty0, tx1, ty1) {
    const heat = this.ensureHeat(kind);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const idx = ty * GW + tx;
        const v = heat[idx];
        if (v <= 0.01) continue;
        const lift = world.elev ? world.elev[idx] * ELEV_LIFT : 0;
        g.fillStyle = kind === 'happiness' ? heatColour(v) : 'rgba(120,200,130,' + (0.16 + v * 0.3).toFixed(3) + ')';
        U.diamondPath(g, tcx(tx, ty), tcy(tx, ty) - lift, HW - 1, HH - 0.5, idx);
        g.fill();
      }
    }
  }

  /** Coarse per-tile influence grid, rebuilt at most a few times a second. */
  ensureHeat(kind) {
    if (this.heatGrids === null) this.heatGrids = {};
    let entry = this.heatGrids[kind];
    if (entry === undefined) {
      entry = { grid: new Float32Array(GW * GH), frame: -999 };
      this.heatGrids[kind] = entry;
    }
    if (this.frame - entry.frame < 45 && this.heatFrame !== -999) return entry.grid;
    entry.frame = this.frame;
    this.heatFrame = this.frame;
    const heat = entry.grid;
    heat.fill(0);
    const list = this.buildingList();
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.built) continue;
      const def = this.defOf(b);
      if (!def) continue;
      let radius;
      let amount;
      if (kind === 'happiness') {
        if (!def.happiness) continue;
        radius = def.happiness.radius;
        amount = def.happiness.amount;
      } else {
        const feeds = def.id === 'market' || (def.storage && def.storage.classes && def.storage.classes.indexOf('food') >= 0);
        if (!feeds) continue;
        radius = def.id === 'market' ? 12 : 8;
        amount = 1;
      }
      const cx = b.x + (def.w - 1) * 0.5;
      const cy = b.y + (def.h - 1) * 0.5;
      const x0 = Math.max(0, Math.floor(cx - radius));
      const x1 = Math.min(GW - 1, Math.ceil(cx + radius));
      const y0 = Math.max(0, Math.floor(cy - radius));
      const y1 = Math.min(GH - 1, Math.ceil(cy + radius));
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const d = U.tileDist(tx, ty, cx, cy);
          if (d > radius) continue;
          heat[ty * GW + tx] += amount * (1 - d / radius) * 0.045;
        }
      }
    }
    return heat;
  }

  overlayRoads(g, world, tx0, ty0, tx1, ty1) {
    // Wash everything back, then put the network and its connection state in
    // front of it. This is the overlay that answers "why is this idle?".
    g.fillStyle = 'rgba(14,16,26,0.55)';
    g.fillRect(this.vx0, this.vy0, this.vx1 - this.vx0, this.vy1 - this.vy0);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const idx = ty * GW + tx;
        const r = world.road ? world.road[idx] : 0;
        if (!r) continue;
        const lift = world.elev ? world.elev[idx] * ELEV_LIFT : 0;
        g.fillStyle = r === C.ROAD_COBBLE ? 'rgba(240,226,180,0.85)' : 'rgba(196,160,110,0.75)';
        U.diamondPath(g, tcx(tx, ty), tcy(tx, ty) - lift, HW - 2, HH - 1, idx);
        g.fill();
      }
    }
    const list = this.buildingList();
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const def = this.defOf(b);
      if (!def || def.shape === 'wall') continue;
      if (b.x > tx1 || b.x + def.w - 1 < tx0 || b.y > ty1 || b.y + def.h - 1 < ty0) continue;
      const o = footprint(RH_A, b.x, b.y, def.w, def.h, 0.92);
      g.fillStyle = b.connected ? 'rgba(120,210,120,0.5)' : 'rgba(220,80,64,0.6)';
      fillRhomb(g, o);
      if (!b.connected) {
        g.strokeStyle = 'rgba(255,120,100,0.9)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(o.wx + 4, o.cy - 8);
        g.lineTo(o.ex - 4, o.cy + 8);
        g.moveTo(o.ex - 4, o.cy - 8);
        g.lineTo(o.wx + 4, o.cy + 8);
        g.stroke();
      }
    }
  }

  overlayRaid(g, world) {
    const passes = (world && world.passes) || (this.raidInfo && this.raidInfo.passes) || EMPTY;
    if (!passes.length) return;
    const start = (world && world.start) || { x: GW >> 1, y: GH >> 1 };
    const ex = tcx(start.x, start.y);
    const ey = tcy(start.x, start.y);
    g.setLineDash(DASH);
    g.lineDashOffset = -this.time * 24;
    for (let i = 0; i < passes.length; i++) {
      const p = passes[i];
      const px = tcx(p.x, p.y);
      const py = tcy(p.x, p.y);
      g.strokeStyle = 'rgba(226,92,66,0.85)';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(px, py);
      g.quadraticCurveTo((px + ex) * 0.5, (py + ey) * 0.5 - 60, ex, ey);
      g.stroke();
      g.fillStyle = 'rgba(226,92,66,0.6)';
      dot(g, px, py, 10);
    }
    g.setLineDash(EMPTY_DASH);
    g.lineDashOffset = 0;
  }

  /* ---- screen-space furniture ------------------------------------ */

  /**
   * Raid direction. §1 puts raid-direction readability above prettiness, so
   * this is drawn last, in screen space, and clamps to the viewport edge when
   * the pass is off-screen.
   */
  drawRaidArrow(g, world) {
    const mil = this.game.military;
    const active = !!(mil && (mil.raidActive || mil.active));
    const info = this.raidInfo;
    if (!active && !info) return;
    let passes = (info && info.passes) || null;
    if ((!passes || !passes.length) && world) passes = world.passes;
    if (!passes || !passes.length) return;

    const town = (world && world.start) || { x: GW >> 1, y: GH >> 1 };
    const tsx = this.worldToScreenX(tcx(town.x, town.y));
    const tsy = this.worldToScreenY(tcy(town.x, town.y));
    const pulse = 0.55 + Math.sin(this.time * 3) * 0.25;
    g.font = '600 12px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    for (let i = 0; i < passes.length; i++) {
      const p = passes[i];
      if (!p || p.x === undefined) continue;
      let sx = this.worldToScreenX(tcx(p.x, p.y));
      let sy = this.worldToScreenY(tcy(p.x, p.y));
      const m = 46;
      sx = U.clamp(sx, m, this.viewW - m);
      sy = U.clamp(sy, m, this.viewH - m);
      const ang = Math.atan2(tsy - sy, tsx - sx);
      g.save();
      g.translate(sx, sy);
      g.rotate(ang);
      g.fillStyle = 'rgba(226,92,66,' + pulse.toFixed(2) + ')';
      g.beginPath();
      g.moveTo(26, 0);
      g.lineTo(-6, -13);
      g.lineTo(-1, 0);
      g.lineTo(-6, 13);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(255,214,200,0.85)';
      g.lineWidth = 1.5;
      g.stroke();
      g.restore();
      const label = (p.name || 'Pass') + (info && info.daysUntil !== undefined ? ' — ' + info.daysUntil + 'd' : '');
      g.fillStyle = 'rgba(18,14,14,0.72)';
      const tw = g.measureText(label).width + 12;
      g.fillRect(sx - tw * 0.5, sy + 18, tw, 17);
      g.fillStyle = '#ffd9cc';
      g.fillText(label, sx, sy + 27);
    }
    g.textAlign = 'start';
    g.textBaseline = 'alphabetic';
  }

  /**
   * Screen rect of the minimap in CSS pixels from the canvas top-left, or null
   * while it is hidden. input.js reads this to pan from a click on it.
   */
  minimapAt() {
    if (!this.showMinimap) return null;
    const r = this._miniRect;
    r.size = 132;
    r.x = this.viewW - r.size - 14;
    r.y = this.viewH - r.size - 14;
    return r;
  }

  drawMinimap(g, world) {
    if (typeof document === 'undefined') return;
    const rect = this.minimapAt();
    const size = rect.size;
    const x = rect.x;
    const y = rect.y;
    if (this.minimap === null) {
      this.minimap = document.createElement('canvas');
      this.minimap.width = GW;
      this.minimap.height = GH;
      this.minimapDirty = true;
    }
    if (this.minimapDirty) {
      const mg = this.minimap.getContext('2d');
      const img = mg.createImageData(GW, GH);
      const d = img.data;
      for (let i = 0; i < GW * GH; i++) {
        const hex = world.road && world.road[i] ? '#c9b184' : C.TERRAIN_INFO[world.terrain[i]].colour;
        const c = U.hexToRgb(hex);
        d[i * 4] = c.r; d[i * 4 + 1] = c.g; d[i * 4 + 2] = c.b; d[i * 4 + 3] = 255;
      }
      mg.putImageData(img, 0, 0);
      this.minimapDirty = false;
    }
    g.fillStyle = 'rgba(16,16,20,0.72)';
    g.fillRect(x - 4, y - 4, size + 8, size + 8);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.minimap, x, y, size, size);
    g.imageSmoothingEnabled = true;

    const k = size / GW;
    const list = this.buildingList();
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const def = this.defOf(b);
      if (!def) continue;
      g.fillStyle = b.built ? (def.cat === 'military' ? '#d08a6a' : '#f0e6cf') : '#8fb0d8';
      g.fillRect(x + b.x * k, y + b.y * k, Math.max(1.5, def.w * k), Math.max(1.5, def.h * k));
    }
    const el = this.enemyList();
    for (let i = 0; i < el.length; i++) {
      const e = el[i];
      const ux = e.vx !== undefined ? e.vx : e.x;
      const uy = e.vy !== undefined ? e.vy : e.y;
      g.fillStyle = '#e2452c';
      g.fillRect(x + ux * k - 1, y + uy * k - 1, 3, 3);
    }
    // Viewport rectangle: the visible world rect mapped back into tile space.
    // Zoomed out it is far larger than the map, so it is clipped to the box —
    // unclipped it draws a huge stray diamond across the whole screen.
    g.save();
    g.beginPath();
    g.rect(x, y, size, size);
    g.clip();
    g.strokeStyle = 'rgba(255,252,235,0.85)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const px = (i === 1 || i === 2) ? this.vx1 : this.vx0;
      const py = (i >= 2) ? this.vy1 : this.vy0;
      const ux = U.unIsoX(px, py);
      const uy = U.unIsoY(px, py);
      if (i === 0) g.moveTo(x + ux * k, y + uy * k);
      else g.lineTo(x + ux * k, y + uy * k);
    }
    g.closePath();
    g.stroke();
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.strokeRect(x - 4.5, y - 4.5, size + 9, size + 9);
  }
}

/* ------------------------------------------------------------------ *
 * Module-level scratch shared by the renderer
 * ------------------------------------------------------------------ */

const DEFAULT_CLOCK = { day: 1, timeOfDay: 0.5, season: 0, year: 1 };
const DASH = [7, 7];
const RANGE_DASH = [4, 5];
// Screen px the opaque top bar covers; screen-space furniture stays below it.
const HUD_TOP = 86;
const EMPTY_DASH = [];

/** One decimal, and no trailing `.0` — the plaque compares two of these. */
function fmt1(n) {
  const v = Math.round(n * 10) / 10;
  return v === Math.round(v) ? String(v) : v.toFixed(1);
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
// The ghost is drawn by the same shape functions as a real building, which
// expect an instance; this stand-in supplies only the fields they read.
const GHOST_B = { x: 0, y: 0, id: -1, inv: null, built: true };

function cmpDraw(p, q) {
  return (p.key - q.key) || (p.kx - q.kx) || (p.sub - q.sub);
}

// Red -> amber -> green across the useful range of civic radiance, with the
// alpha climbing too, so a thin fringe reads as "barely covered" rather than
// as the same green as a town square.
function heatColour(v) {
  const k = U.clamp(v * 0.8, 0, 1);
  let r, gg, bb;
  if (k < 0.5) {
    const t = k * 2;
    r = 214; gg = Math.round(70 + t * 100); bb = 60;
  } else {
    const t = (k - 0.5) * 2;
    r = Math.round(214 - t * 140); gg = Math.round(170 + t * 40); bb = Math.round(60 + t * 40);
  }
  return 'rgba(' + r + ',' + gg + ',' + bb + ',' + (0.14 + k * 0.34).toFixed(3) + ')';
}

/**
 * DESIGN §12 module shape. Must not read other modules — init() does that.
 */
export function createRender(game) {
  return new Renderer(game);
}
