// All canvas drawing for Railwright. Reads game/world/network/trains state,
// never mutates it (design contract section 2 - render.js is read-only).
//
// Every access into world/network/trains/economy is defensive: those modules
// are being built in parallel and may be partial or absent while this file is
// developed, and even once finished a given frame may run before some piece
// of state exists (e.g. before the first site is placed). A render crash
// would kill the whole game loop, so nothing in here may throw.
//
// Art direction (design contract section 1): ink on a warm survey map. The
// base of every land tile is the parchment cream - terrain type is read from
// *drawn* texture (stipple, hatching, contour lines) and irregular hand-inked
// boundary strokes between regions, never from a full-saturation flat wash
// and never from a blurred layer. Track, stations and signals are inked
// crisply over it in dark steel with a warm highlight. Day/night lerps the
// live-drawn layers; at night stations and signal lamps are the brightest
// things on screen because signal legibility outranks prettiness.
import {
  GRID_W, GRID_H, TILE, MIN_ZOOM, MAX_ZOOM, DIR_DX, DIR_DY,
  ITEMS, SITE_KINDS, LOCOS, WAGONS, STATION_RADIUS, PALETTE,
} from './constants.js';
import { toXY, inBounds, clamp, lerp } from './utils.js';

// --- Camera ----------------------------------------------------------------
// camera = {x, y, zoom}: x/y is the world-px point mapped to screen (0,0) at
// the current zoom (same convention as static/driftworks/render.js). Kept to
// exactly these three fields per the design contract's `game.camera` shape.
export function createCamera() {
  return { x: GRID_W * TILE / 2 - 400, y: GRID_H * TILE / 2 - 300, zoom: 1 };
}

export function worldToScreen(camera, wx, wy) {
  return [(wx - camera.x) * camera.zoom, (wy - camera.y) * camera.zoom];
}

export function screenToWorld(camera, sx, sy) {
  return [sx / camera.zoom + camera.x, sy / camera.zoom + camera.y];
}

export function screenToTile(camera, sx, sy) {
  const [wx, wy] = screenToWorld(camera, sx, sy);
  return { x: Math.floor(wx / TILE), y: Math.floor(wy / TILE) };
}

// Last canvas size drawWorld() was called with, cached so centerOn() (which
// per the camera-helper contract takes no canvas argument) still has enough
// information to actually center the viewport rather than just guessing.
let _lastCanvasW = 1280;
let _lastCanvasH = 720;

// x, y are tile coordinates (fractional allowed, e.g. a train's mid-hop
// position) - the camera is moved so that tile is centred on screen.
export function centerOn(camera, x, y) {
  const wx = (x + 0.5) * TILE;
  const wy = (y + 0.5) * TILE;
  camera.x = wx - _lastCanvasW / (2 * camera.zoom);
  camera.y = wy - _lastCanvasH / (2 * camera.zoom);
}

export function clampCamera(camera, canvas) {
  camera.zoom = clamp(camera.zoom, MIN_ZOOM, MAX_ZOOM);
  const worldW = GRID_W * TILE;
  const worldH = GRID_H * TILE;
  const viewW = canvas.width / camera.zoom;
  const viewH = canvas.height / camera.zoom;
  // Let a small view wander within the map; a view wider than the map is
  // centred on it instead of pinned to an edge.
  camera.x = viewW >= worldW ? (worldW - viewW) / 2 : clamp(camera.x, 0, worldW - viewW);
  camera.y = viewH >= worldH ? (worldH - viewH) / 2 : clamp(camera.y, 0, worldH - viewH);
}

// --- Palette / day-night -----------------------------------------------
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpColour(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r = Math.round(lerp(a[0], b[0], t));
  const g = Math.round(lerp(a[1], b[1], t));
  const bl = Math.round(lerp(a[2], b[2], t));
  return `rgb(${r}, ${g}, ${bl})`;
}

// Day runs roughly [0.2 .. 0.8] of timeOfDay; outside that we're in night.
// A soft cosine blend around the two boundaries avoids a hard pop at dawn/dusk.
function dayFactor(timeOfDay) {
  const t = ((timeOfDay % 1) + 1) % 1;
  const dawn = 0.5 - 0.5 * Math.cos(clamp((t - 0.15) / 0.15, 0, 1) * Math.PI);
  const dusk = 0.5 - 0.5 * Math.cos(clamp((0.85 - t) / 0.15, 0, 1) * Math.PI);
  if (t < 0.15 || t > 0.85) return 0;
  if (t < 0.3) return dawn;
  if (t > 0.7) return dusk;
  return 1;
}

// Blended palette for this frame - every colour lerped day->night by how far
// through the night cycle we are.
function currentPalette(timeOfDay) {
  const day = dayFactor(typeof timeOfDay === 'number' ? timeOfDay : 0.5);
  const out = {};
  for (const key of Object.keys(PALETTE.day)) {
    out[key] = lerpColour(PALETTE.night[key], PALETTE.day[key], day);
  }
  out._dayFactor = day;
  return out;
}

// --- Small deterministic per-tile hash, used to break up flat tile colours
// with dither/noise and to jitter drawn boundary lines, so the map reads as
// drawn, not as a grid. -------------------------------------------------
function tileHash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// Accepts either '#rrggbb' or 'rgb(r, g, b)' - currentPalette() always hands
// out the latter (lerpColour's output format), so shade()/mix() must
// understand both rather than silently falling back to grey for every
// palette colour.
function parseColour(str) {
  if (str[0] === '#') return hexToRgb(str);
  const m = /rgba?\(([^)]+)\)/.exec(str);
  if (m) {
    const parts = m[1].split(',').map((s) => parseFloat(s));
    return [parts[0], parts[1], parts[2]];
  }
  return [136, 136, 136];
}

function shade(colour, amount) {
  const [r, g, b] = parseColour(colour);
  const f = (v) => clamp(Math.round(v + amount), 0, 255);
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

// Linear blend between two colours (hex or rgb() strings), t in [0..1].
// Used to keep terrain washes and site-building tones *restrained* -
// e.g. a hill tile is mostly-parchment blended a little toward pal.hill,
// not a flat fill of pal.hill.
function mix(colourA, colourB, t) {
  const a = parseColour(colourA);
  const b = parseColour(colourB);
  const r = Math.round(lerp(a[0], b[0], t));
  const g = Math.round(lerp(a[1], b[1], t));
  const bl = Math.round(lerp(a[2], b[2], t));
  return `rgb(${r}, ${g}, ${bl})`;
}

function roundedRectPath(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
  }
}

// --- Terrain (layer 1) ---------------------------------------------------
// Every land type is mostly the parchment base - hill/mountain are a
// restrained blend toward their accent colour, and forest gets its green
// from a low-alpha tint + canopy texture (see drawForestRegion), never from
// a flat saturated fill. Water is the one fully-saturated colour because it
// is a hard gameplay boundary (bridges/tunnels) and must read unambiguously,
// though its *shape* is still drawn as a soft ribbon, not a tile grid (see
// drawWaterRegion).
// Elevation is gameplay-relevant (track cost, train speed), so its tint step
// has to be strong enough to read at a glance on a hill-heavy map - these are
// shared with drawElevationRegions() so the flat fallback (minimap) and the
// traced region fill never drift apart.
const HILL_TINT = 0.56;
const MOUNTAIN_TINT = 0.66;

function terrainBaseColour(pal, type) {
  switch (type) {
    case 'water': return pal.water;
    case 'mountain': return mix(pal.parchment, pal.mountain, MOUNTAIN_TINT);
    case 'hill': return mix(pal.parchment, pal.hill, HILL_TINT);
    default: return pal.parchment;
  }
}

// --- Low-frequency spatial noise (world-space, wavelength unrelated to
// TILE) - the source of every "reads as drawn, not as a tile grid" fix
// below: tonal drift, stipple clustering, and boundary-crossing jitter all
// come from this same field. It's a fixed procedural pattern rather than
// something seeded per-map - it stands in for paper/ground texture, not
// terrain layout, so it doesn't need to vary with the world seed and stays
// stable across repeated terrain rebakes (day<->night bucket flips).
function hash2i(ix, iy) {
  let h = (ix * 374761393 + iy * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return ((h >>> 0) % 100000) / 100000;
}

function smoothField(x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = x - x0;
  const sy = y - y0;
  const fx = sx * sx * (3 - 2 * sx);
  const fy = sy * sy * (3 - 2 * sy);
  const n00 = hash2i(x0, y0);
  const n10 = hash2i(x0 + 1, y0);
  const n01 = hash2i(x0, y0 + 1);
  const n11 = hash2i(x0 + 1, y0 + 1);
  return lerp(lerp(n00, n10, fx), lerp(n01, n11, fx), fy);
}

// Sampled in world pixels at a wavelength (~163px, ~5 tiles) with no integer
// relationship to TILE (32px), so the patches it produces are bigger than a
// tile and never land their edges on a tile boundary.
function fieldNoise(wx, wy) {
  return smoothField(wx / 163, wy / 163);
}

// Pass: low-frequency tonal drift across the whole terrain layer. This
// replaces the old per-tile random brightness wobble, which was exactly the
// "visible axis-aligned tile-grid checkerboard" problem - every tile got an
// independent random shade, so the eye grouped same-toned tiles into square
// patches. Sampling a continuous field in world pixels instead means
// neighbouring tiles drift together and the resulting patches are irregular
// and larger than a tile.
function drawTonalDrift(ctx, w, h) {
  const cell = 11; // px - deliberately not a divisor of TILE (32)
  for (let py = 0; py < h; py += cell) {
    for (let px = 0; px < w; px += cell) {
      const n = fieldNoise(px + cell * 0.5, py + cell * 0.5);
      const amt = (n - 0.5) * 20;
      if (Math.abs(amt) < 1.5) continue; // skip near-neutral cells - keeps it quiet
      const a = clamp(Math.abs(amt) / 40, 0, 0.14);
      ctx.fillStyle = amt > 0 ? `rgba(255,250,235,${a})` : `rgba(40,34,26,${a})`;
      ctx.fillRect(px, py, cell, cell);
    }
  }
}

// --- Region tracing (water / forest masses) --------------------------------
// A dual-grid marching-squares pass over a per-tile scalar field, used to
// draw a terrain feature as one continuous shape with a hand-inked edge
// instead of a grid of coloured tile squares. Corner values are the average
// of the (up to 4) tiles touching that grid corner, so the crossing point on
// a tile's edge falls naturally off-centre near a cove or headland rather
// than always at the tile midpoint - this is what lets the drawn edge cut
// across tile corners instead of following them.
function buildCornerField(tiles, valueFn) {
  const gw = GRID_W + 1;
  const gh = GRID_H + 1;
  const field = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 0; dy++) {
        for (let dx = -1; dx <= 0; dx++) {
          const tx = gx + dx;
          const ty = gy + dy;
          if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) continue;
          const t = tiles[ty * GRID_W + tx];
          if (!t) continue;
          sum += valueFn(t);
          count++;
        }
      }
      field[gy * gw + gx] = count ? sum / count : 0;
    }
  }
  return field;
}

// Fraction along an edge where the field crosses `level`. Corner values only
// take a handful of discrete steps (multiples of 1/4, from averaging up to 4
// tiles), so a small hand-drawn jitter is added on top to stop a run of
// identically-valued tiles producing a visibly repeating crossing point.
function crossingFrac(vA, vB, level, jx, jy) {
  const denom = vB - vA;
  let t = Math.abs(denom) < 1e-6 ? 0.5 : (level - vA) / denom;
  t += (tileHash(jx, jy) - 0.5) * 0.3;
  return clamp(t, 0.08, 0.92);
}

const CELL_TL = { x: 0, y: 0 };
const CELL_TR = { x: 1, y: 0 };
const CELL_BR = { x: 1, y: 1 };
const CELL_BL = { x: 0, y: 1 };

// Marching-squares cell geometry for tile (x,y) against `level`, in local
// unit-square coordinates. `case` 0 (nothing crosses this tile) and 15 (the
// whole tile is inside) are the fast paths callers handle themselves.
function cellGeometry(field, x, y, level) {
  const gw = GRID_W + 1;
  const v00 = field[y * gw + x];
  const v10 = field[y * gw + (x + 1)];
  const v11 = field[(y + 1) * gw + (x + 1)];
  const v01 = field[(y + 1) * gw + x];
  let c = 0;
  if (v00 >= level) c |= 1;
  if (v10 >= level) c |= 2;
  if (v11 >= level) c |= 4;
  if (v01 >= level) c |= 8;
  if (c === 0 || c === 15) return { case: c };
  const T = { x: crossingFrac(v00, v10, level, x * 9 + 1, y * 3 + 2), y: 0 };
  const R = { x: 1, y: crossingFrac(v10, v11, level, x * 5 + 3, y * 7 + 4) };
  const B = { x: crossingFrac(v01, v11, level, x * 11 + 5, y * 2 + 6), y: 1 };
  const L = { x: 0, y: crossingFrac(v00, v01, level, x * 4 + 7, y * 6 + 8) };
  return { case: c, T, R, B, L };
}

// Fill polygon(s) and "shoreline" boundary segment(s) for a marching-squares
// case, in local unit-square coordinates. Cases 5/10 are the ambiguous
// saddles, resolved as two separate corners rather than one connected band -
// fine at tile scale, and rare given the corner field is already smoothed by
// averaging.
function caseShapes(g) {
  const { case: c, T, R, B, L } = g;
  switch (c) {
    case 1: return { polys: [[CELL_TL, T, L]], edges: [[L, T]] };
    case 2: return { polys: [[T, CELL_TR, R]], edges: [[T, R]] };
    case 3: return { polys: [[CELL_TL, CELL_TR, R, L]], edges: [[L, R]] };
    case 4: return { polys: [[R, CELL_BR, B]], edges: [[R, B]] };
    case 5: return { polys: [[CELL_TL, T, L], [R, CELL_BR, B]], edges: [[L, T], [R, B]] };
    case 6: return { polys: [[T, CELL_TR, CELL_BR, B]], edges: [[T, B]] };
    case 7: return { polys: [[CELL_TL, CELL_TR, CELL_BR, B, L]], edges: [[L, B]] };
    case 8: return { polys: [[L, CELL_BL, B]], edges: [[L, B]] };
    case 9: return { polys: [[CELL_TL, T, B, CELL_BL]], edges: [[T, B]] };
    case 10: return { polys: [[T, CELL_TR, R], [L, CELL_BL, B]], edges: [[T, R], [L, B]] };
    case 11: return { polys: [[CELL_TL, CELL_TR, R, B, CELL_BL]], edges: [[R, B]] };
    case 12: return { polys: [[L, R, CELL_BR, CELL_BL]], edges: [[L, R]] };
    case 13: return { polys: [[CELL_TL, T, R, CELL_BR, CELL_BL]], edges: [[T, R]] };
    case 14: return { polys: [[T, CELL_TR, CELL_BR, CELL_BL, L]], edges: [[L, T]] };
    default: return { polys: [], edges: [] };
  }
}

// Draws a per-tile predicate ("is this tile forest/water") as one continuous
// inked shape: a plain rect for fully-interior tiles, a marching-squares cut
// polygon for boundary tiles (so the edge wanders across tile corners), and
// one batched ink stroke along every crossing edge. Returns the corner field
// so callers can reuse it (e.g. to decide interior vs. edge canopy density).
function drawRegion(ctx, tiles, predicate, opts) {
  const level = opts.level ?? 0.5;
  const field = buildCornerField(tiles, (t) => (predicate(t) ? 1 : 0));
  const boundary = [];
  ctx.beginPath();
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const tile = tiles[y * GRID_W + x];
      if (!tile) continue;
      const g = cellGeometry(field, x, y, level);
      if (g.case === 0) continue;
      const ox = x * TILE;
      const oy = y * TILE;
      if (g.case === 15) { ctx.rect(ox, oy, TILE, TILE); continue; }
      const shape = caseShapes(g);
      for (const poly of shape.polys) {
        ctx.moveTo(ox + poly[0].x * TILE, oy + poly[0].y * TILE);
        for (let i = 1; i < poly.length; i++) ctx.lineTo(ox + poly[i].x * TILE, oy + poly[i].y * TILE);
        ctx.closePath();
      }
      boundary.push({ ox, oy, edges: shape.edges });
    }
  }
  ctx.globalAlpha = opts.fillAlpha ?? 1;
  ctx.fillStyle = opts.fillStyle;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.beginPath();
  for (const b of boundary) {
    for (const [p0, p1] of b.edges) {
      ctx.moveTo(b.ox + p0.x * TILE, b.oy + p0.y * TILE);
      ctx.lineTo(b.ox + p1.x * TILE, b.oy + p1.y * TILE);
    }
  }
  ctx.globalAlpha = opts.strokeAlpha ?? 1;
  ctx.strokeStyle = opts.strokeStyle;
  ctx.lineWidth = opts.strokeWidth ?? 1;
  ctx.stroke();
  ctx.globalAlpha = 1;

  return field;
}

// Pass: water as one continuous inked ribbon (irregular banks cutting across
// tile corners, softer/less saturated colour, dark ink shoreline) instead of
// flat per-tile squares with hard stepped edges.
function drawWaterRegion(ctx, tiles, pal) {
  drawRegion(ctx, tiles, (t) => t.type === 'water', {
    fillStyle: mix(pal.water, pal.parchment, 0.1),
    strokeStyle: pal.ink,
    strokeAlpha: 0.4,
    strokeWidth: Math.max(1, TILE * 0.06),
  });
}

// Pass: forest as clustered woodland masses with a soft ink edge, instead of
// confetti dots scattered evenly per tile. The fill is a restrained wash (as
// before), just shaped to the actual contiguous mass rather than one tile.
function drawForestRegion(ctx, tiles, pal) {
  return drawRegion(ctx, tiles, (t) => t.type === 'forest', {
    fillStyle: pal.forest,
    fillAlpha: 0.34,
    strokeStyle: shade(pal.forest, -34),
    strokeAlpha: 0.48,
    strokeWidth: Math.max(1, TILE * 0.045),
  });
}

// Canopy texture drawn *inside* the forest mass from drawForestRegion, using
// its corner field to tell interior tiles (denser dabs, this is the body of
// the woodland) from edge tiles (sparse, so the ink edge stays clean) -
// clustered texture rather than an even scatter.
function drawForestCanopyTexture(ctx, tiles, field, pal) {
  ctx.fillStyle = shade(pal.forest, -42);
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const tile = tiles[y * GRID_W + x];
      if (!tile || tile.type !== 'forest') continue;
      const g = cellGeometry(field, x, y, 0.5);
      const interior = g.case === 15;
      const n = interior ? 5 : 2;
      const ox = x * TILE;
      const oy = y * TILE;
      for (let i = 0; i < n; i++) {
        const hh = tileHash(x * 4 + i * 2, y * 6 + i * 3);
        const px = ox + (0.15 + hh * 0.7) * TILE;
        const py = oy + (0.15 + tileHash(y * 5 + i, x * 3 + i) * 0.7) * TILE;
        ctx.beginPath();
        ctx.arc(px, py, TILE * (interior ? 0.075 : 0.05), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function elevAt(tiles, x, y) {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return 0;
  const t = tiles[y * GRID_W + x];
  return t ? (t.elevation || 0) : 0;
}

// Pass: hill/mountain elevation drawn as nested regions (same corner-cut
// marching-squares shape as water/forest, not a flat per-tile wash) whose
// ink edge *is* the survey-map contour line - so the tonal wash and the
// contour ring share one boundary instead of the wash staying a hard-edged
// square underneath an unrelated contour swatch. Mountain nests inside hill
// (elevation>=3 is a subset of elevation>=2), giving two visibly nested
// rings that actually follow the high ground's shape.
function drawElevationRegions(ctx, tiles, pal) {
  const hillField = drawRegion(ctx, tiles, (t) => (t.elevation ?? 0) >= 2, {
    fillStyle: mix(pal.parchment, pal.hill, HILL_TINT),
    strokeStyle: 'rgba(43, 38, 32, 0.4)',
    strokeWidth: 1.6,
  });
  drawRegion(ctx, tiles, (t) => (t.elevation ?? 0) >= 3, {
    fillStyle: mix(pal.parchment, pal.mountain, MOUNTAIN_TINT),
    strokeStyle: 'rgba(43, 38, 32, 0.45)',
    strokeWidth: 2,
  });
  return hillField;
}

// Pass: a restrained hachure texture across hill ground (elevation 2, not the
// steeper rock-face hatching mountain gets) - short ticks clustered denser in
// the interior than at the boundary, same convention as the forest canopy
// dabs, so hill reads as textured high ground rather than a flat tint step.
function drawHillTexture(ctx, tiles, field) {
  // Alpha/width tuned to still read after the terrain layer's cached bake is
  // blitted at a scaled-down zoom (~0.6-0.7, the common play zoom) - a 1px
  // tick at that scale anti-aliases away almost completely.
  ctx.strokeStyle = 'rgba(43, 38, 32, 0.32)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const tile = tiles[y * GRID_W + x];
      if (!tile || (tile.elevation ?? 0) < 2) continue;
      const g = cellGeometry(field, x, y, 0.5);
      const interior = g.case === 15;
      const n = interior ? 4 : 1;
      const ox = x * TILE;
      const oy = y * TILE;
      for (let i = 0; i < n; i++) {
        const hh = tileHash(x * 7 + i * 3, y * 9 + i * 5);
        const cx = ox + (0.18 + hh * 0.64) * TILE;
        const cy = oy + (0.18 + tileHash(y * 8 + i, x * 6 + i) * 0.64) * TILE;
        const tick = TILE * 0.2;
        ctx.moveTo(cx, cy - tick * 0.5);
        ctx.lineTo(cx, cy + tick * 0.5);
      }
    }
  }
  ctx.stroke();
}

// Pass: a few hatch ticks perpendicular to the local slope on genuinely
// steep mountain ground - the survey-map convention for a rock face, added
// only where there's a real gradient rather than as a fixed per-tile
// pattern.
function drawSteepFaceHatching(ctx, tiles) {
  ctx.strokeStyle = 'rgba(43, 38, 32, 0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const tile = tiles[y * GRID_W + x];
      if (!tile || (tile.elevation ?? 0) < 3) continue;
      const dx = elevAt(tiles, x + 1, y) - elevAt(tiles, x - 1, y);
      const dy = elevAt(tiles, x, y + 1) - elevAt(tiles, x, y - 1);
      const mag = Math.hypot(dx, dy);
      if (mag < 0.4) continue;
      const nx = dx / mag;
      const ny = dy / mag;
      const px = -ny;
      const py = nx;
      const cx = x * TILE + TILE * 0.5;
      const cy = y * TILE + TILE * 0.5;
      for (const off of [-0.18, 0.18]) {
        const bx = cx + nx * TILE * off * 2;
        const by = cy + ny * TILE * off * 2;
        ctx.moveTo(bx - px * TILE * 0.22, by - py * TILE * 0.22);
        ctx.lineTo(bx + px * TILE * 0.22, by + py * TILE * 0.22);
      }
    }
  }
  ctx.stroke();
}

// Pass: quiet, low-contrast texture across plain terrain so vast stretches
// of it don't read as a featureless void - fine stipple, clustered by the
// same low-frequency field as drawTonalDrift so it reads as an occasional
// natural patch rather than an even coat.
function drawPlainStipple(ctx, tiles, pal) {
  ctx.fillStyle = shade(pal.parchment, -22);
  ctx.globalAlpha = 0.12;
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const tile = tiles[y * GRID_W + x];
      if (!tile || tile.type !== 'plain') continue;
      const n = fieldNoise((x + 0.5) * TILE, (y + 0.5) * TILE);
      if (n < 0.35 || n > 0.68) continue;
      const ox = x * TILE;
      const oy = y * TILE;
      for (let i = 0; i < 2; i++) {
        const hh = tileHash(x * 6 + i * 2, y * 4 + i);
        const px = ox + (0.15 + hh * 0.7) * TILE;
        const py = oy + (0.15 + tileHash(y * 3 + i, x * 5 + i) * 0.7) * TILE;
        ctx.beginPath();
        ctx.arc(px, py, TILE * 0.025, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
}

// Landslide hazard hatching - the only piece of the old per-tile detail pass
// that wasn't part of the checkerboard/swatch/confetti critique, so it's
// left exactly as it was.
function drawHazardDetail(ctx, tile, sx, sy, size) {
  if (!tile.blocked) return;
  ctx.fillStyle = 'rgba(176, 55, 44, 0.25)';
  ctx.fillRect(sx, sy, size, size);
  ctx.strokeStyle = 'rgba(176, 55, 44, 0.55)';
  ctx.lineWidth = Math.max(1, size * 0.05);
  ctx.beginPath();
  ctx.moveTo(sx + size * 0.15, sy + size * 0.85);
  ctx.lineTo(sx + size * 0.85, sy + size * 0.15);
  ctx.stroke();
}

// Animated water shimmer - drawn live each frame on top of the cached
// terrain blit - only for tiles actually within the current viewport, since
// this is the one piece of "layer 1" that can't be pre-rendered.
function drawWaterShimmer(ctx, tile, sx, sy, size, time) {
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.10 + 0.05 * Math.sin(time * 1.3 + tile.x)})`;
  ctx.lineWidth = Math.max(1, size * 0.04);
  const wy = sy + size * (0.35 + 0.2 * Math.sin(time * 1.1 + tile.x * 0.6 + tile.y * 0.3));
  ctx.beginPath();
  ctx.moveTo(sx, wy);
  ctx.lineTo(sx + size, wy + Math.sin(time * 1.1 + tile.x + 2) * size * 0.08);
  ctx.stroke();
}

// A small tileable paper-grain speckle pattern, built once and reused as a
// low-alpha overlay across the whole terrain layer - reinforces the "drawn
// on paper" look and helps mask any residual tile seams. Deterministic (own
// tiny xorshift, not Math.random) so repeated repaints don't flicker.
let _grainPattern = null;
function getGrainPattern(ctx) {
  if (_grainPattern) return _grainPattern;
  const size = 96;
  const src = (typeof document !== 'undefined')
    ? document.createElement('canvas')
    : (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : null);
  if (!src) return null;
  src.width = size;
  src.height = size;
  const sctx = src.getContext('2d');
  let seed = 0x9e3779b9;
  const rnd = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return ((seed >>> 0) / 4294967296);
  };
  for (let i = 0; i < 260; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const a = 0.05 + rnd() * 0.10;
    sctx.fillStyle = rnd() < 0.5 ? `rgba(43,38,32,${a})` : `rgba(255,250,235,${a})`;
    sctx.fillRect(x, y, 1, 1);
  }
  _grainPattern = ctx.createPattern(src, 'repeat');
  return _grainPattern;
}

// --- Terrain pre-render (perf: layer 1 only redrawn when it changes) -------
// Static terrain is painted once to an offscreen canvas; per-frame drawWorld
// just blits the visible slice of it. invalidateTerrain() forces a repaint
// (call it whenever world.tiles actually changes - landslides, generation).
// Also repainted on a day<->night bucket flip so the cached layer doesn't
// freeze at whatever time of day the map happened to first load - twice a
// day-cycle is cheap, every frame is not.
let _terrainCanvas = null;
let _terrainCtx = null;
let _terrainDirty = true;
let _terrainBucket = null;

export function invalidateTerrain() {
  _terrainDirty = true;
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return null;
}

function ensureTerrainCanvas() {
  if (_terrainCanvas) return;
  // OffscreenCanvas isn't universally available; makeCanvas() falls back to
  // a detached <canvas> element, which every browser target for this game
  // supports.
  _terrainCanvas = makeCanvas(GRID_W * TILE, GRID_H * TILE);
  _terrainCtx = _terrainCanvas ? _terrainCanvas.getContext('2d') : null;
}

function repaintTerrain(world, pal, bucket) {
  ensureTerrainCanvas();
  if (!_terrainCtx) return;
  const tiles = world?.tiles;
  if (!Array.isArray(tiles)) return;
  const w = GRID_W * TILE;
  const h = GRID_H * TILE;

  _terrainCtx.clearRect(0, 0, w, h);
  _terrainCtx.fillStyle = pal.parchment;
  _terrainCtx.fillRect(0, 0, w, h);

  // Pass 1: flat per-tile land fills, crisp (no blur - softness comes from
  // the drawn region/contour passes below, not from smearing the whole
  // layer). Water and hill/mountain are deliberately skipped here - each
  // gets its own region pass below that draws it as one continuous
  // corner-cut shape rather than a grid of flat-filled tile squares.
  for (let idx = 0; idx < tiles.length; idx++) {
    const tile = tiles[idx];
    if (!tile || tile.type === 'water' || (tile.elevation ?? 0) >= 2) continue;
    _terrainCtx.fillStyle = terrainBaseColour(pal, tile.type);
    _terrainCtx.fillRect(tile.x * TILE, tile.y * TILE, TILE, TILE);
  }

  // Pass 2: low-frequency tonal drift - fixes the tile-grid checkerboard and
  // doubles as plain terrain's "faint tonal drift" texture.
  try { drawTonalDrift(_terrainCtx, w, h); } catch { /* keep baking */ }

  // Pass 3: water as one inked ribbon, cut across tile corners.
  try { drawWaterRegion(_terrainCtx, tiles, pal); } catch { /* keep baking */ }

  // Pass 4: forest as clustered canopy masses with a soft ink edge.
  try {
    const forestField = drawForestRegion(_terrainCtx, tiles, pal);
    drawForestCanopyTexture(_terrainCtx, tiles, forestField, pal);
  } catch { /* keep baking */ }

  // Pass 5: hill/mountain as nested contour regions + hill hachures + steep-
  // face hatching on the steeper mountain ground.
  try {
    const hillField = drawElevationRegions(_terrainCtx, tiles, pal);
    drawHillTexture(_terrainCtx, tiles, hillField);
    drawSteepFaceHatching(_terrainCtx, tiles);
  } catch { /* keep baking */ }

  // Pass 6: quiet stipple texture across plain terrain.
  try { drawPlainStipple(_terrainCtx, tiles, pal); } catch { /* keep baking */ }

  // Pass 7: remaining crisp per-tile detail (landslide hazard only now).
  for (let idx = 0; idx < tiles.length; idx++) {
    const tile = tiles[idx];
    if (!tile) continue;
    drawHazardDetail(_terrainCtx, tile, tile.x * TILE, tile.y * TILE, TILE);
  }

  // Pass 8: whole-map paper grain, very low alpha.
  const grain = getGrainPattern(_terrainCtx);
  if (grain) {
    _terrainCtx.fillStyle = grain;
    _terrainCtx.fillRect(0, 0, w, h);
  }

  _terrainDirty = false;
  _terrainBucket = bucket;
}

// Live animated water overlay, drawn each frame on top of the cached
// terrain blit - only for tiles actually within the current viewport, since
// this is the one piece of "layer 1" that can't be pre-rendered.
function drawVisibleWaterShimmer(ctx, world, camera, zoom, time) {
  const tiles = world?.tiles;
  if (!Array.isArray(tiles)) return;
  const size = TILE * zoom;
  const topLeft = screenToTile(camera, -size, -size);
  const bottomRight = screenToTile(camera, _viewportW + size, _viewportH + size);
  const loX = clamp(topLeft.x, 0, GRID_W - 1);
  const loY = clamp(topLeft.y, 0, GRID_H - 1);
  const hiX = clamp(bottomRight.x, 0, GRID_W - 1);
  const hiY = clamp(bottomRight.y, 0, GRID_H - 1);
  for (let y = loY; y <= hiY; y++) {
    for (let x = loX; x <= hiX; x++) {
      const tile = tiles[y * GRID_W + x];
      if (!tile || tile.type !== 'water') continue;
      const [sx, sy] = worldToScreen(camera, x * TILE, y * TILE);
      drawWaterShimmer(ctx, tile, sx, sy, size, time);
    }
  }
}

// --- Sites (layer 2) -------------------------------------------------------
function siteFootprintScreen(camera, site) {
  const [sx, sy] = worldToScreen(camera, site.x * TILE, site.y * TILE);
  const size = TILE * camera.zoom;
  return { sx, sy, w: size * 2, h: size * 2, size };
}

// Site buildings get their own restrained, low-saturation warm tone - never
// pal.station, which at night is deliberately a bright glow colour reserved
// for the passenger-station canopy. Reusing it here was why plain industrial
// glyphs (headframes, silos) were rendering as garish saturated yellow.
function buildingTone(pal) {
  return mix('#3a2c1e', '#8f7454', 0.4 + pal._dayFactor * 0.15);
}

// Fills a rect (or the current path's bounding box, if w/h omitted) with a
// gradient light at the upper-left, dark at the lower-right - a single,
// consistent light direction applied uniformly across every site glyph.
function shadedFillRect(ctx, x, y, w, h, mid) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, shade(mid, 26));
  g.addColorStop(1, shade(mid, -24));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

function shadedFillPath(ctx, x0, y0, x1, y1, mid) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, shade(mid, 26));
  g.addColorStop(1, shade(mid, -24));
  ctx.fillStyle = g;
  ctx.fill();
}

// Per-kind silhouette, drawn centred in a unit box [-1..1] scaled by `s`
// (roughly half the footprint size) so every glyph shares one coordinate
// convention regardless of zoom. A soft drop shadow (offset down-right, i.e.
// light from the upper-left) grounds every building the same way.
function drawSiteGlyph(ctx, kind, s, pal, level) {
  ctx.fillStyle = 'rgba(30, 24, 16, 0.22)';
  ctx.beginPath();
  ctx.ellipse(s * 0.12, s * 0.86, s * 0.62, s * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();

  const mid = buildingTone(pal);
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = Math.max(1, s * 0.08);
  switch (kind) {
    case 'coal_mine':
    case 'iron_mine':
    case 'quarry': {
      // Headframe: an A-frame pit-head tower over a winding wheel.
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, s * 0.8);
      ctx.lineTo(0, -s * 0.9);
      ctx.lineTo(s * 0.5, s * 0.8);
      ctx.moveTo(-s * 0.3, s * 0.2);
      ctx.lineTo(s * 0.3, s * 0.2);
      ctx.strokeStyle = shade(mid, -30);
      ctx.stroke();
      ctx.strokeStyle = pal.ink;
      ctx.fillStyle = shade(mid, 20);
      ctx.beginPath();
      ctx.arc(0, -s * 0.55, s * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'smelter':
    case 'refinery': {
      // Chimney with a squat base building.
      shadedFillRect(ctx, -s * 0.7, s * 0.3, s * 1.4, s * 0.5, mid);
      ctx.strokeRect(-s * 0.7, s * 0.3, s * 1.4, s * 0.5);
      shadedFillRect(ctx, -s * 0.18, -s * 0.9, s * 0.3, s * 1.2, shade(mid, -10));
      ctx.strokeRect(-s * 0.18, -s * 0.9, s * 0.3, s * 1.2);
      break;
    }
    case 'farm': {
      // Silo: a rounded-top cylinder.
      ctx.beginPath();
      ctx.moveTo(-s * 0.4, s * 0.8);
      ctx.lineTo(-s * 0.4, -s * 0.3);
      ctx.arc(0, -s * 0.3, s * 0.4, Math.PI, 0);
      ctx.lineTo(s * 0.4, s * 0.8);
      ctx.closePath();
      shadedFillPath(ctx, -s * 0.4, -s * 0.7, s * 0.4, s * 0.8, mix(mid, pal.hill, 0.3));
      ctx.stroke();
      break;
    }
    case 'sawmill': {
      // Circular saw blade over a low shed.
      shadedFillRect(ctx, -s * 0.7, s * 0.2, s * 1.4, s * 0.6, mid);
      ctx.strokeRect(-s * 0.7, s * 0.2, s * 1.4, s * 0.6);
      ctx.beginPath();
      ctx.arc(0, -s * 0.15, s * 0.45, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * s * 0.45, -s * 0.15 + Math.sin(a) * s * 0.45);
        ctx.lineTo(Math.cos(a) * s * 0.6, -s * 0.15 + Math.sin(a) * s * 0.6);
        ctx.stroke();
      }
      break;
    }
    case 'oil_well': {
      // Derrick: a tapered lattice tower.
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, s * 0.8);
      ctx.lineTo(-s * 0.12, -s * 0.9);
      ctx.lineTo(s * 0.12, -s * 0.9);
      ctx.lineTo(s * 0.5, s * 0.8);
      ctx.moveTo(-s * 0.35, s * 0.35);
      ctx.lineTo(s * 0.35, s * 0.35);
      ctx.moveTo(-s * 0.22, -s * 0.1);
      ctx.lineTo(s * 0.22, -s * 0.1);
      ctx.stroke();
      break;
    }
    case 'logging_camp': {
      // A small cabin roof beside a stack of felled logs.
      ctx.beginPath();
      ctx.moveTo(-s * 0.85, s * 0.75);
      ctx.lineTo(-s * 0.85, s * 0.05);
      ctx.lineTo(-s * 0.45, -s * 0.4);
      ctx.lineTo(-s * 0.05, s * 0.05);
      ctx.lineTo(-s * 0.05, s * 0.75);
      ctx.closePath();
      shadedFillPath(ctx, -s * 0.85, -s * 0.4, -s * 0.05, s * 0.75, mid);
      ctx.stroke();
      const logColour = mix(mid, '#6b4a2c', 0.55);
      for (let i = 0; i < 3; i++) {
        const ly = s * 0.42 - i * s * 0.24;
        ctx.fillStyle = shade(logColour, i * 10);
        ctx.beginPath();
        ctx.ellipse(s * 0.45, ly, s * 0.4, s * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'mill': {
      // A gabled mill building with a small grain chute.
      ctx.beginPath();
      ctx.moveTo(-s * 0.7, s * 0.75);
      ctx.lineTo(-s * 0.7, 0);
      ctx.lineTo(0, -s * 0.55);
      ctx.lineTo(s * 0.7, 0);
      ctx.lineTo(s * 0.7, s * 0.75);
      ctx.closePath();
      shadedFillPath(ctx, -s * 0.7, -s * 0.55, s * 0.7, s * 0.75, mix(mid, pal.hill, 0.25));
      ctx.stroke();
      shadedFillRect(ctx, s * 0.45, s * 0.05, s * 0.3, s * 0.45, shade(mid, -12));
      ctx.strokeRect(s * 0.45, s * 0.05, s * 0.3, s * 0.45);
      break;
    }
    case 'factory':
    case 'workshop':
    case 'machine_works': {
      // Sawtooth-roofed works building.
      ctx.beginPath();
      ctx.moveTo(-s * 0.8, s * 0.7);
      ctx.lineTo(-s * 0.8, 0);
      ctx.lineTo(-s * 0.4, -s * 0.35);
      ctx.lineTo(0, 0);
      ctx.lineTo(s * 0.4, -s * 0.35);
      ctx.lineTo(s * 0.8, 0);
      ctx.lineTo(s * 0.8, s * 0.7);
      ctx.closePath();
      shadedFillPath(ctx, -s * 0.8, -s * 0.35, s * 0.8, s * 0.7, mid);
      ctx.stroke();
      break;
    }
    case 'port': {
      // Quay: a jetty over water with a small crane arm.
      shadedFillRect(ctx, -s * 0.85, s * 0.3, s * 1.7, s * 0.3, shade(mid, -6));
      ctx.strokeRect(-s * 0.85, s * 0.3, s * 1.7, s * 0.3);
      ctx.beginPath();
      ctx.moveTo(s * 0.3, s * 0.3);
      ctx.lineTo(s * 0.3, -s * 0.7);
      ctx.lineTo(s * 0.75, -s * 0.4);
      ctx.stroke();
      break;
    }
    case 'town':
    case 'city':
    default: {
      // Clustered roofs, count scaled by level (1..5) so growth reads
      // instantly on the map. A warmer terracotta tone distinguishes
      // habitation from the cooler industrial-building tone above.
      const roofTone = mix(mid, '#8a4a34', 0.35);
      const n = clamp(level ?? 1, 1, 5);
      for (let i = 0; i < n; i++) {
        const ang = (i / Math.max(n, 1)) * Math.PI * 2;
        const cx = Math.cos(ang) * s * 0.4 * (n > 1 ? 1 : 0);
        const cy = Math.sin(ang) * s * 0.3 * (n > 1 ? 1 : 0);
        const rs = s * 0.42;
        ctx.beginPath();
        ctx.moveTo(cx - rs, cy + rs * 0.6);
        ctx.lineTo(cx, cy - rs * 0.7);
        ctx.lineTo(cx + rs, cy + rs * 0.6);
        ctx.closePath();
        shadedFillPath(ctx, cx - rs, cy - rs * 0.7, cx + rs, cy + rs * 0.6, roofTone);
        ctx.stroke();
      }
      break;
    }
  }
}

function drawStockIndicator(ctx, site, sx, sy, w, h, pal) {
  // A tiny bar under the footprint: green fill = stock ready to move,
  // amber outline pulses if demand is going unmet (a quick glance tells
  // the player "this site needs attention").
  const stock = site.stock || {};
  const demand = site.demand || {};
  let stockTotal = 0;
  for (const k in stock) stockTotal += stock[k] || 0;
  let demandTotal = 0;
  for (const k in demand) demandTotal += demand[k] || 0;
  const cap = 240;
  const barY = sy + h + 2;
  const barW = w * 0.8;
  const barX = sx + w * 0.1;
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(barX, barY, barW, 3);
  ctx.fillStyle = pal.signalGreen;
  ctx.fillRect(barX, barY, barW * clamp(stockTotal / cap, 0, 1), 3);
  if (demandTotal > 0) {
    ctx.strokeStyle = pal.signalRed;
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, 3);
  }
}

// A legible label plate: a translucent plate behind the text (parchment by
// day, dark ink by night) so site names read against any terrain underneath.
function drawLabelPlate(ctx, text, cx, baselineY, pal, fontPx) {
  ctx.font = `${fontPx}px Georgia, serif`;
  ctx.textAlign = 'center';
  const textW = ctx.measureText(text).width;
  const padX = fontPx * 0.42;
  const padY = fontPx * 0.3;
  const plateW = textW + padX * 2;
  const plateH = fontPx + padY * 1.6;
  const plateX = cx - plateW / 2;
  const plateY = baselineY - fontPx * 0.92;
  const night = pal._dayFactor < 0.5;
  ctx.fillStyle = night ? 'rgba(24, 22, 26, 0.68)' : 'rgba(232, 223, 196, 0.82)';
  ctx.strokeStyle = night ? 'rgba(232, 223, 196, 0.18)' : 'rgba(43, 38, 32, 0.22)';
  ctx.lineWidth = 1;
  roundedRectPath(ctx, plateX, plateY, plateW, Math.max(1, plateH), Math.min(6, plateH / 2));
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = pal.ink;
  ctx.fillText(text, cx, baselineY);
}

function drawSites(ctx, world, camera, pal, zoom) {
  const sites = world?.sites;
  if (!Array.isArray(sites)) return;
  for (const site of sites) {
    if (!site) continue;
    const { sx, sy, w, h, size } = siteFootprintScreen(camera, site);
    if (sx + w < 0 || sy + h < 0 || sx > _viewportW || sy > _viewportH) continue;
    // A small, irregular ground-clearing patch (not a big translucent
    // circle wash) so the glyph reads against terrain without looking like
    // placeholder art.
    ctx.fillStyle = 'rgba(232, 223, 196, 0.4)';
    ctx.beginPath();
    ctx.ellipse(sx + w / 2, sy + h * 0.58, w * 0.42, h * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(sx + w / 2, sy + h / 2);
    drawSiteGlyph(ctx, site.kind, size * 0.8, pal, site.level);
    ctx.restore();
    if (zoom >= 0.55) {
      drawLabelPlate(ctx, site.name || SITE_KINDS[site.kind]?.name || site.kind, sx + w / 2, sy - 3, pal, Math.max(9, size * 0.28));
      drawStockIndicator(ctx, site, sx, sy, w, h, pal);
    }
  }
}

// --- Track (layer 3) --------------------------------------------------------
// Angle (radians) for each of the 8 directions, matching DIR_DX/DIR_DY.
const DIR_ANGLE = DIR_DX.map((dx, i) => Math.atan2(DIR_DY[i], dx));

function forEachLink(links, fn) {
  if (!links) return;
  for (let d = 0; d < 8; d++) {
    if (links & (1 << d)) fn(d);
  }
}

function drawSleepersAndRails(ctx, cx, cy, half, dirs, pal, highlight) {
  // One stub per active link direction, drawn from tile centre outward -
  // shared tiles (junctions) end up with correctly overlapping stubs rather
  // than needing special-cased geometry per link count.
  for (const d of dirs) {
    const ang = DIR_ANGLE[d];
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const ex = cx + dx * half;
    const ey = cy + dy * half;
    // Perpendicular for sleeper ticks / ballast band.
    const px = -dy;
    const py = dx;

    // Ballast: a soft, wide inked band under everything - not a solid bright
    // stripe, just enough tonal shift to read as "graded trackbed".
    ctx.strokeStyle = 'rgba(70, 58, 44, 0.22)';
    ctx.lineWidth = Math.max(1, half * 0.5);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Sleepers next (under the rails).
    ctx.strokeStyle = 'rgba(90, 74, 56, 0.55)';
    ctx.lineWidth = Math.max(1, half * 0.14);
    const sleeperCount = 3;
    for (let i = 1; i <= sleeperCount; i++) {
      const t = i / (sleeperCount + 1);
      const tx = cx + dx * half * t;
      const ty = cy + dy * half * t;
      ctx.beginPath();
      ctx.moveTo(tx + px * half * 0.32, ty + py * half * 0.32);
      ctx.lineTo(tx - px * half * 0.32, ty - py * half * 0.32);
      ctx.stroke();
    }

    // Two rails, dark steel with a warm inked highlight along the inner edge.
    const railOff = half * 0.18;
    ctx.strokeStyle = pal.rail;
    ctx.lineWidth = Math.max(1, half * 0.09);
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + px * railOff * sgn, cy + py * railOff * sgn);
      ctx.lineTo(ex + px * railOff * sgn, ey + py * railOff * sgn);
      ctx.stroke();
    }
    if (highlight) {
      ctx.strokeStyle = pal.railHighlight;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = Math.max(1, half * 0.035);
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + px * railOff * sgn, cy + py * railOff * sgn);
        ctx.lineTo(ex + px * railOff * sgn, ey + py * railOff * sgn);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
}

function drawCatenaryPole(ctx, cx, cy, half, pal) {
  ctx.strokeStyle = shade(pal.rail, -20);
  ctx.lineWidth = Math.max(1, half * 0.08);
  ctx.beginPath();
  ctx.moveTo(cx - half * 0.55, cy - half * 0.9);
  ctx.lineTo(cx - half * 0.55, cy - half * 0.15);
  ctx.moveTo(cx - half * 0.75, cy - half * 0.7);
  ctx.lineTo(cx - half * 0.35, cy - half * 0.7);
  ctx.stroke();
}

function drawTrack(ctx, game, camera, pal, zoom) {
  const track = game?.network?.track;
  if (!track || typeof track.values !== 'function') return;
  const simplified = zoom < 0.75;
  for (const t of track.values()) {
    if (!t) continue;
    const { x, y } = toXY(t.idx);
    if (!inBounds(x, y)) continue;
    const [sx, sy] = worldToScreen(camera, (x + 0.5) * TILE, (y + 0.5) * TILE);
    const half = TILE * zoom * 0.5;
    if (sx + half < 0 || sy + half < 0 || sx - half > _viewportW || sy - half > _viewportH) continue;

    if (t.kind === 'bridge') {
      // Piers: small dark rectangles either side of the tile, under the deck.
      ctx.fillStyle = shade(pal.rail, -10);
      ctx.fillRect(sx - half * 0.9, sy + half * 0.5, half * 0.35, half * 0.9);
      ctx.fillRect(sx + half * 0.55, sy + half * 0.5, half * 0.35, half * 0.9);
      ctx.fillStyle = shade(pal.station, 10);
      ctx.fillRect(sx - half, sy - half * 0.3, half * 2, half * 0.6);
    } else if (t.kind === 'tunnel') {
      // Portal: a dark arch the track vanishes into.
      ctx.fillStyle = pal.ink;
      ctx.beginPath();
      ctx.arc(sx, sy, half * 0.75, Math.PI, 0);
      ctx.fill();
    }

    const dirs = [];
    forEachLink(t.links, (d) => dirs.push(d));
    if (!simplified) {
      drawSleepersAndRails(ctx, sx, sy, half, dirs, pal, true);
      if (t.electrified) drawCatenaryPole(ctx, sx, sy, half, pal);
    } else {
      // LOD: below ~0.75 zoom, just an inked line per link - still reads as
      // "track" without per-sleeper cost at a distance.
      ctx.strokeStyle = pal.rail;
      ctx.lineWidth = Math.max(1, half * 0.25);
      for (const d of dirs) {
        const ang = DIR_ANGLE[d];
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(ang) * half, sy + Math.sin(ang) * half);
        ctx.stroke();
      }
    }
  }
}

// --- Signals (layer 5) ------------------------------------------------------
function drawSignals(ctx, game, camera, pal, zoom, dayFactorNow) {
  const signals = game?.network?.signals;
  if (!signals || typeof signals.values !== 'function') return;
  for (const sig of signals.values()) {
    if (!sig) continue;
    const a = toXY(sig.a);
    const b = toXY(sig.b);
    const mx = (a.x + b.x) / 2 + 0.5;
    const my = (a.y + b.y) / 2 + 0.5;
    const [sx, sy] = worldToScreen(camera, mx * TILE, my * TILE);
    if (sx < -20 || sy < -20 || sx > _viewportW + 20 || sy > _viewportH + 20) continue;
    // Perpendicular offset so the post sits beside the link, not on top of it.
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const px = (-dy / len) * TILE * zoom * 0.35;
    const py = (dx / len) * TILE * zoom * 0.35;
    const postH = TILE * zoom * 0.5;

    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = Math.max(1, zoom * 1.2);
    ctx.beginPath();
    ctx.moveTo(sx + px, sy + py);
    ctx.lineTo(sx + px, sy + py - postH);
    ctx.stroke();

    const lampColour = sig.green ? pal.signalGreen : pal.signalRed;
    const lampR = Math.max(2, TILE * zoom * 0.12);
    const lampX = sx + px;
    const lampY = sy + py - postH;
    // At night the lamp gets a soft glow halo - the brightest thing on
    // screen, per the art direction brief.
    const glow = 1 - dayFactorNow;
    if (glow > 0.05) {
      const grad = ctx.createRadialGradient(lampX, lampY, 0, lampX, lampY, lampR * 4);
      grad.addColorStop(0, sig.green ? 'rgba(120,255,120,0.55)' : 'rgba(255,90,70,0.55)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.globalAlpha = glow;
      ctx.beginPath();
      ctx.arc(lampX, lampY, lampR * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = lampColour;
    ctx.beginPath();
    ctx.arc(lampX, lampY, lampR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// --- Stations (layer 4) -----------------------------------------------------
function drawStations(ctx, game, camera, pal, zoom) {
  const stations = game?.stations;
  if (!stations || typeof stations.values !== 'function') return;
  for (const st of stations.values()) {
    if (!st) continue;
    const tiles = Array.isArray(st.tiles) ? st.tiles : [];
    if (!tiles.length) continue;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const idx of tiles) {
      const { x, y } = toXY(idx);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const [sx, sy] = worldToScreen(camera, minX * TILE, minY * TILE);
    const w = (maxX - minX + 1) * TILE * zoom;
    const h = (maxY - minY + 1) * TILE * zoom;
    if (sx + w < 0 || sy + h < 0 || sx > _viewportW || sy > _viewportH) continue;

    // Platform slab.
    ctx.fillStyle = shade(pal.station, 20);
    ctx.fillRect(sx - w * 0.06, sy - h * 0.06, w * 1.12, h * 1.12);
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - w * 0.06, sy - h * 0.06, w * 1.12, h * 1.12);

    // Canopy: a peaked roof, brighter than the platform so it reads as a
    // building; glows warm at night.
    const canopyLit = pal._dayFactor < 0.5;
    ctx.fillStyle = canopyLit ? pal.station : shade(pal.station, -10);
    ctx.beginPath();
    ctx.moveTo(sx - w * 0.1, sy + h * 0.15);
    ctx.lineTo(sx + w / 2, sy - h * 0.35);
    ctx.lineTo(sx + w * 1.1, sy + h * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (canopyLit) {
      const grad = ctx.createRadialGradient(sx + w / 2, sy + h * 0.1, 0, sx + w / 2, sy + h * 0.1, w * 0.8);
      grad.addColorStop(0, 'rgba(224, 192, 96, 0.35)');
      grad.addColorStop(1, 'rgba(224, 192, 96, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(sx - w * 0.5, sy - h * 0.5, w * 2, h * 1.6);
    }

    if (zoom >= 0.5) {
      // Platform-count dots + waiting-cargo dot row.
      const platforms = st.platforms || 1;
      for (let i = 0; i < platforms; i++) {
        ctx.fillStyle = pal.ink;
        ctx.beginPath();
        ctx.arc(sx + w * 0.15 + i * w * 0.12, sy + h * 1.2, Math.max(1.5, w * 0.03), 0, Math.PI * 2);
        ctx.fill();
      }
      const waiting = st.waiting || {};
      let wx = sx + w * 0.5;
      for (const item of Object.keys(waiting)) {
        if (!waiting[item]) continue;
        ctx.fillStyle = ITEMS[item]?.colour || '#999';
        ctx.beginPath();
        ctx.arc(wx, sy + h * 1.2, Math.max(1.5, w * 0.035), 0, Math.PI * 2);
        ctx.fill();
        wx += w * 0.1;
      }
    }
  }
}

// --- Trains (layer 6) -------------------------------------------------------
function trainWorldPos(train) {
  const path = train?.path;
  if (!Array.isArray(path) || path.length === 0) return null;
  const i = clamp(train.pathIndex ?? 0, 0, path.length - 1);
  const a = toXY(path[i]);
  const j = clamp(i + 1, 0, path.length - 1);
  const b = toXY(path[j]);
  const t = clamp(train.t ?? 0, 0, 1);
  return {
    x: lerp(a.x, b.x, t) + 0.5,
    y: lerp(a.y, b.y, t) + 0.5,
    angle: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

// Shared drop shadow for every consist unit, drawn in *screen* space (before
// the unit's own rotation) so the light direction stays consistent no matter
// which way the train is facing - same convention as the site glyphs.
function drawUnitShadow(ctx, sx, sy, len, wid) {
  ctx.fillStyle = 'rgba(20, 16, 12, 0.28)';
  ctx.beginPath();
  ctx.ellipse(sx + len * 0.08, sy + wid * 0.32, len * 0.52, wid * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawCoupling(ctx, cx, cy, angle, length) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.strokeStyle = 'rgba(20, 18, 16, 0.75)';
  ctx.lineWidth = Math.max(1, length * 0.22);
  ctx.beginPath();
  ctx.moveTo(-length / 2, 0);
  ctx.lineTo(length / 2, 0);
  ctx.stroke();
  ctx.restore();
}

// Locomotive silhouette: boiler barrel, smokebox/chimney leading, a taller
// cab block trailing (where the consist couples on), with wheel ticks
// suggested beneath. `detail` gates the finer linework at low zoom.
function drawLoco(ctx, half, fillColour, detail) {
  const len = half * 1.7;
  const wid = half * 1.0;
  const ink = 'rgba(0,0,0,0.55)';

  if (detail) {
    // Running-wheel ticks beneath the boiler.
    ctx.strokeStyle = 'rgba(20,18,16,0.65)';
    ctx.lineWidth = Math.max(1, half * 0.1);
    for (const t of [-0.28, 0, 0.32]) {
      ctx.beginPath();
      ctx.moveTo(len * t, wid * 0.32);
      ctx.lineTo(len * t, wid * 0.5);
      ctx.stroke();
    }
  }

  // Cab (trailing, taller and visibly darker - this is where wagons couple
  // on, and the tonal jump from the boiler is what keeps the silhouette from
  // reading as one plain capsule).
  ctx.fillStyle = shade(fillColour, -34);
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1, half * 0.1);
  roundedRectPath(ctx, -len * 0.5, -wid * 0.5, len * 0.38, wid, wid * 0.08);
  ctx.fill();
  ctx.stroke();
  if (detail) {
    // Cab roof overhang - a thin lighter cap, and a window square.
    ctx.fillStyle = shade(fillColour, -46);
    ctx.fillRect(-len * 0.52, -wid * 0.52, len * 0.42, wid * 0.12);
    ctx.fillStyle = 'rgba(220, 232, 236, 0.6)';
    ctx.fillRect(-len * 0.42, -wid * 0.2, len * 0.14, wid * 0.24);
  }

  // Boiler barrel.
  ctx.fillStyle = fillColour;
  roundedRectPath(ctx, -len * 0.16, -wid * 0.34, len * 0.62, wid * 0.68, wid * 0.3);
  ctx.fill();
  ctx.stroke();
  if (detail) {
    // A single warm boiler band for a touch of ink linework.
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(1, half * 0.05);
    ctx.beginPath();
    ctx.moveTo(len * 0.06, -wid * 0.34);
    ctx.lineTo(len * 0.06, wid * 0.34);
    ctx.stroke();
  }

  // Smokebox cap (leading end).
  ctx.fillStyle = shade(fillColour, -22);
  ctx.strokeStyle = ink;
  ctx.beginPath();
  ctx.arc(len * 0.42, 0, wid * 0.3, -Math.PI / 2, Math.PI / 2);
  ctx.fill();
  ctx.stroke();

  // Chimney - a bold, near-black stack so it reads at a glance even at
  // zoom 1, and doubles as the visual anchor for the steam plume.
  ctx.fillStyle = 'rgba(15,14,13,0.92)';
  roundedRectPath(ctx, len * 0.2, -wid * 0.3, len * 0.14, wid * 0.3, wid * 0.04);
  ctx.fill();
  ctx.stroke();
}

// Wagon silhouettes, one per WAGONS type - each reads as a distinct body,
// with a heaped/visible cargo load in the item's colour when laden.
function drawWagon(ctx, half, type, fillColour, cargoColour, detail) {
  const len = half * 1.3;
  const wid = half * 0.86;
  const ink = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = Math.max(1, half * 0.1);
  ctx.strokeStyle = ink;

  switch (type) {
    case 'tanker': {
      // A cylinder: capsule body plus a small dome hatch on top.
      ctx.fillStyle = cargoColour || fillColour;
      roundedRectPath(ctx, -len * 0.5, -wid * 0.4, len, wid * 0.8, wid * 0.4);
      ctx.fill();
      ctx.stroke();
      if (detail) {
        ctx.fillStyle = shade(cargoColour || fillColour, 24);
        ctx.beginPath();
        ctx.ellipse(0, -wid * 0.4, len * 0.12, wid * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'flatbed': {
      // A low flat deck; laden cargo sits as stacked bars/logs on top.
      ctx.fillStyle = fillColour;
      roundedRectPath(ctx, -len * 0.5, wid * 0.1, len, wid * 0.24, wid * 0.05);
      ctx.fill();
      ctx.stroke();
      if (cargoColour) {
        ctx.fillStyle = cargoColour;
        const bars = 4;
        for (let i = 0; i < bars; i++) {
          const bx = -len * 0.42 + (i / (bars - 1)) * len * 0.8;
          ctx.beginPath();
          ctx.ellipse(bx, -wid * 0.06, len * 0.09, wid * 0.16, 0, 0, Math.PI * 2);
          ctx.fill();
          if (detail) ctx.stroke();
        }
      }
      break;
    }
    case 'hopper': {
      // Open-top hopper - a trapezoid body, heaped cargo mound when laden.
      ctx.fillStyle = fillColour;
      ctx.beginPath();
      ctx.moveTo(-len * 0.5, wid * 0.4);
      ctx.lineTo(-len * 0.36, -wid * 0.3);
      ctx.lineTo(len * 0.36, -wid * 0.3);
      ctx.lineTo(len * 0.5, wid * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (detail) {
        for (const t of [-0.2, 0.2]) {
          ctx.beginPath();
          ctx.moveTo(len * t, -wid * 0.28);
          ctx.lineTo(len * t * 1.15, wid * 0.38);
          ctx.stroke();
        }
      }
      if (cargoColour) {
        ctx.fillStyle = shade(cargoColour, 6);
        ctx.beginPath();
        ctx.moveTo(-len * 0.34, -wid * 0.26);
        ctx.quadraticCurveTo(0, -wid * 0.62, len * 0.34, -wid * 0.26);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'boxcar':
    case 'coach':
    default: {
      // Closed body with a distinct roofline.
      ctx.fillStyle = fillColour;
      roundedRectPath(ctx, -len * 0.5, -wid * 0.36, len, wid * 0.72, wid * 0.1);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = shade(fillColour, -18);
      roundedRectPath(ctx, -len * 0.5, -wid * 0.46, len, wid * 0.14, wid * 0.06);
      ctx.fill();
      if (detail) {
        ctx.strokeStyle = ink;
        if (type === 'coach') {
          ctx.fillStyle = 'rgba(232, 228, 218, 0.75)';
          const windows = 3;
          for (let i = 0; i < windows; i++) {
            const wx = -len * 0.3 + (i / (windows - 1)) * len * 0.6;
            ctx.fillRect(wx - len * 0.06, -wid * 0.16, len * 0.12, wid * 0.24);
          }
        } else {
          ctx.beginPath();
          ctx.moveTo(0, -wid * 0.3);
          ctx.lineTo(0, wid * 0.3);
          ctx.stroke();
        }
      }
      break;
    }
  }
}

function drawTrains(ctx, game, camera, zoom) {
  const trains = game?.trains;
  if (!Array.isArray(trains)) return;
  const half = TILE * zoom * 0.5;
  const detail = zoom >= 0.9;
  const spacing = half * 1.55;
  for (const train of trains) {
    if (!train) continue;
    const pos = trainWorldPos(train);
    if (!pos) continue;
    const [sx, sy] = worldToScreen(camera, pos.x * TILE, pos.y * TILE);
    if (sx < -60 || sy < -60 || sx > _viewportW + 60 || sy > _viewportH + 60) continue;

    const loco = LOCOS[train.locoId];
    const locoColour = loco?.colour || '#444';
    const wagons = Array.isArray(train.wagons) ? train.wagons : [];

    // Precompute every unit's screen centre first so shadows/couplings can
    // be laid down before any body silhouette is drawn on top of them.
    const centres = [{ sx, sy }];
    for (let w = 0; w < wagons.length; w++) {
      const d = spacing * (w + 1);
      centres.push({ sx: sx - Math.cos(pos.angle) * d, sy: sy - Math.sin(pos.angle) * d });
    }

    for (const c of centres) drawUnitShadow(ctx, c.sx, c.sy, half * 1.6, half * 0.95);
    for (let i = 1; i < centres.length; i++) {
      const mx = (centres[i - 1].sx + centres[i].sx) / 2;
      const my = (centres[i - 1].sy + centres[i].sy) / 2;
      drawCoupling(ctx, mx, my, pos.angle, half * 0.4);
    }

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(pos.angle);
    drawLoco(ctx, half, locoColour, detail);
    ctx.restore();

    for (let w = 0; w < wagons.length; w++) {
      const wag = wagons[w];
      const c = centres[w + 1];
      const laden = wag && wag.item && wag.qty > 0;
      const cargoColour = laden ? ITEMS[wag.item]?.colour : null;
      const wagonFill = WAGONS[wag?.type] ? '#5f6a72' : '#5f6a72';
      ctx.save();
      ctx.translate(c.sx, c.sy);
      ctx.rotate(pos.angle);
      drawWagon(ctx, half, wag?.type, wagonFill, cargoColour, detail);
      ctx.restore();
    }

    if (train.state === 'waiting_signal' && zoom >= 0.5) {
      ctx.fillStyle = '#b0372c';
      ctx.font = `bold ${Math.max(9, half * 0.9)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('!', sx, sy - half * 1.6);
    }
  }
}

// --- Overlays (layer 7) ------------------------------------------------------
function drawTrackGhost(ctx, camera, ghost, pal, zoom) {
  if (!ghost || !Array.isArray(ghost.tiles)) return;
  const half = TILE * zoom * 0.5;
  for (const seg of ghost.tiles) {
    const { x, y } = toXY(seg.idx);
    const [sx, sy] = worldToScreen(camera, x * TILE, y * TILE);
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = seg.legal === false ? '#c0372c' : pal.railHighlight;
    ctx.fillRect(sx, sy, TILE * zoom, TILE * zoom);
    ctx.globalAlpha = 1;
  }
  if (typeof ghost.totalCost === 'number') {
    const last = ghost.tiles[ghost.tiles.length - 1];
    const { x, y } = toXY(last.idx);
    const [sx, sy] = worldToScreen(camera, (x + 0.5) * TILE, y * TILE);
    ctx.fillStyle = pal.ink;
    ctx.font = 'bold 12px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(`$${Math.round(ghost.totalCost)}`, sx, sy - half - 4);
  }
}

function drawSelectedTrainRoute(ctx, game, camera, pal, zoom) {
  const sel = game?.selection;
  if (!sel || sel.kind !== 'train') return;
  const train = (game.trains || []).find((t) => t && t.id === sel.id);
  if (!train || !Array.isArray(train.path)) return;
  ctx.strokeStyle = pal.accent;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = Math.max(2, TILE * zoom * 0.12);
  ctx.beginPath();
  const startI = clamp(train.pathIndex ?? 0, 0, train.path.length - 1);
  for (let i = startI; i < train.path.length; i++) {
    const { x, y } = toXY(train.path[i]);
    const [sx, sy] = worldToScreen(camera, (x + 0.5) * TILE, (y + 0.5) * TILE);
    if (i === startI) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawSelectedStationCatchment(ctx, game, camera, pal, zoom) {
  const sel = game?.selection;
  if (!sel || sel.kind !== 'station' && sel.kind !== 'site') return;
  const site = (game.world?.sites || []).find((s) => s && (s.id === sel.id || s.stationId === sel.id));
  if (!site) return;
  const [sx, sy] = worldToScreen(camera, (site.x + 1) * TILE, (site.y + 1) * TILE);
  ctx.strokeStyle = pal.accent;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.arc(sx, sy, STATION_RADIUS * TILE * zoom, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

// Distinguishable fill per blockId so adjoining blocks read apart at a
// glance; deterministic (no randomness) so a block keeps its colour frame
// to frame.
function blockColour(blockId) {
  let h = 0;
  const s = String(blockId);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsla(${hue}, 65%, 55%, 0.28)`;
}

function drawBlockOverlay(ctx, game, camera, zoom) {
  if (!game?.showBlocks) return;
  const track = game?.network?.track;
  const blocks = game?.network?.blocks;
  if (!track || typeof track.values !== 'function') return;
  for (const t of track.values()) {
    if (!t || t.blockId == null) continue;
    const { x, y } = toXY(t.idx);
    const [sx, sy] = worldToScreen(camera, x * TILE, y * TILE);
    ctx.fillStyle = blockColour(t.blockId);
    ctx.fillRect(sx, sy, TILE * zoom, TILE * zoom);
    const block = blocks && typeof blocks.get === 'function' ? blocks.get(t.blockId) : null;
    if (block && block.occupants && block.occupants.size > 0) {
      ctx.strokeStyle = 'rgba(255, 210, 60, 0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 1, sy + 1, TILE * zoom - 2, TILE * zoom - 2);
    }
  }
}

// --- Viewport cache (updated each drawWorld call; used for culling and by
// centerOn() which has no canvas argument) ----------------------------------
let _viewportW = 1280;
let _viewportH = 720;

// --- Entry point -------------------------------------------------------------
export function drawWorld(ctx, game, camera) {
  const canvas = ctx.canvas;
  _viewportW = canvas.width;
  _viewportH = canvas.height;
  _lastCanvasW = canvas.width;
  _lastCanvasH = canvas.height;

  const timeOfDay = game?.world?.clock?.timeOfDay;
  const pal = currentPalette(timeOfDay);
  const time = game?.elapsed ?? 0;

  ctx.fillStyle = pal.parchment;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Cheap day/night responsiveness for the cached terrain layer: repaint on
  // a coarse bucket flip (roughly twice a day-cycle), not on the change that
  // actually invalidated it. This is what keeps the parchment cream visible
  // even when the game happens to load at night, without paying for a full
  // terrain repaint every frame.
  const bucket = pal._dayFactor >= 0.5 ? 'day' : 'night';
  if (_terrainCanvas && bucket !== _terrainBucket) _terrainDirty = true;
  if (_terrainDirty) {
    // Bake with the *full* day or night palette, not whatever blend happens
    // to be live at the instant the bucket flips (which - right at the 0.5
    // threshold - is always close to a 50/50 mix and would never actually
    // show the full parchment cream). The live-drawn layers below still
    // blend smoothly frame to frame; only this cached layer steps in two.
    const terrainPal = bucket === 'day' ? { ...PALETTE.day, _dayFactor: 1 } : { ...PALETTE.night, _dayFactor: 0 };
    repaintTerrain(game?.world, terrainPal, bucket);
  }

  // Blit the visible slice of the pre-rendered terrain layer.
  if (_terrainCanvas) {
    const worldW = GRID_W * TILE;
    const worldH = GRID_H * TILE;
    const sx0 = clamp(camera.x, 0, worldW);
    const sy0 = clamp(camera.y, 0, worldH);
    const sw = clamp(canvas.width / camera.zoom, 1, worldW - sx0);
    const sh = clamp(canvas.height / camera.zoom, 1, worldH - sy0);
    const dx0 = (sx0 - camera.x) * camera.zoom;
    const dy0 = (sy0 - camera.y) * camera.zoom;
    try {
      ctx.drawImage(_terrainCanvas, sx0, sy0, sw, sh, dx0, dy0, sw * camera.zoom, sh * camera.zoom);
    } catch {
      // Terrain canvas can throw if it has zero extent (e.g. degenerate
      // camera during setup) - skip a frame rather than crash the loop.
    }
  }

  const zoom = clamp(camera.zoom, MIN_ZOOM, MAX_ZOOM);

  try { drawVisibleWaterShimmer(ctx, game?.world, camera, zoom, time); } catch { /* never break the loop */ }
  try { drawSites(ctx, game?.world, camera, pal, zoom); } catch { /* never break the loop */ }
  try { drawTrack(ctx, game, camera, pal, zoom); } catch { /* never break the loop */ }
  try { drawStations(ctx, game, camera, pal, zoom); } catch { /* never break the loop */ }
  try { drawSignals(ctx, game, camera, pal, zoom, pal._dayFactor); } catch { /* never break the loop */ }
  try { drawTrains(ctx, game, camera, zoom); } catch { /* never break the loop */ }

  try {
    drawTrackGhost(ctx, camera, game?.trackGhost, pal, zoom);
    drawSelectedTrainRoute(ctx, game, camera, pal, zoom);
    drawSelectedStationCatchment(ctx, game, camera, pal, zoom);
    drawBlockOverlay(ctx, game, camera, zoom);
  } catch { /* never break the loop */ }

  try { game?.particles?.draw?.(ctx, camera); } catch { /* never break the loop */ }
}

// --- Minimap -----------------------------------------------------------------
export function drawMinimap(ctx, game, rect) {
  const { x, y, w, h } = rect;
  const pal = currentPalette(game?.world?.clock?.timeOfDay);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = pal.parchment;
  ctx.fillRect(x, y, w, h);

  const sx = w / (GRID_W * TILE);
  const sy = h / (GRID_H * TILE);

  const tiles = game?.world?.tiles;
  if (Array.isArray(tiles)) {
    for (const tile of tiles) {
      if (!tile) continue;
      ctx.fillStyle = terrainBaseColour(pal, tile.type, tile.elevation);
      ctx.fillRect(x + tile.x * TILE * sx, y + tile.y * TILE * sy, TILE * sx + 1, TILE * sy + 1);
    }
  }

  const track = game?.network?.track;
  if (track && typeof track.values === 'function') {
    ctx.fillStyle = pal.rail;
    for (const t of track.values()) {
      if (!t) continue;
      const { x: tx, y: ty } = toXY(t.idx);
      ctx.fillRect(x + tx * TILE * sx, y + ty * TILE * sy, Math.max(1, TILE * sx), Math.max(1, TILE * sy));
    }
  }

  const sites = game?.world?.sites;
  if (Array.isArray(sites)) {
    ctx.fillStyle = pal.station;
    for (const site of sites) {
      if (!site) continue;
      ctx.fillRect(x + site.x * TILE * sx, y + site.y * TILE * sy, Math.max(2, TILE * sx * 2), Math.max(2, TILE * sy * 2));
    }
  }

  const trains = game?.trains;
  if (Array.isArray(trains)) {
    ctx.fillStyle = pal.accent;
    for (const train of trains) {
      const pos = trainWorldPos(train);
      if (!pos) continue;
      ctx.beginPath();
      ctx.arc(x + pos.x * TILE * sx, y + pos.y * TILE * sy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Camera viewport indicator, so the minimap doubles as a "where am I".
  const cam = game?.camera;
  if (cam) {
    const canvasW = _viewportW;
    const canvasH = _viewportH;
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 1;
    ctx.strokeRect(
      x + cam.x * sx, y + cam.y * sy,
      (canvasW / cam.zoom) * sx, (canvasH / cam.zoom) * sy,
    );
  }

  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.restore();
}
