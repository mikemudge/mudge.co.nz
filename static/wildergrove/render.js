// Camera + world rendering for Wildergrove. Mirrors static/driftworks/render.js's
// pattern: this module owns the core map/pixel constants and all pan/zoom/
// pixel math, and every draw* function here takes plain data (arrays/Maps/
// plain objects) rather than importing world.js/player.js/buildings.js — so
// it stays a pure "given this data, draw it" layer that other not-yet-built
// modules can render against without a circular dependency.
//
// These constants (TILE_SIZE/WORLD_W/WORLD_H/MINE_W/MINE_H/PALETTE) are the
// canonical source per the design contract — world.js, buildings.js, etc.
// should import them from here rather than redefining them.

// CROPS is items.js's pure data table (growDays/stages per crop) - importing
// it here is the same kind of "pure data/constants" dependency world.js
// already takes on items.js (RESOURCE_NODE_YIELDS etc.), not a dependency on
// another module's live game state, so it doesn't break this file's "given
// plain data, draw it" contract.
import { CROPS } from './items.js';

export const TILE_SIZE = 32;
export const WORLD_W = 120; // tiles
export const WORLD_H = 90;
export const MINE_W = 40;
export const MINE_H = 30;

// Judgment call: the contract lists world.js's terrain enum values as
// "TERRAIN.GRASS, DIRT, TILLED, WATER, SAND, PATH" but doesn't say which
// module defines the enum object itself, and render.js needs a stable
// numeric-code -> color mapping to draw a Uint8Array terrain grid without
// importing world.js. Defined here (in the contract's listed order) as the
// canonical numeric codes; world.js should import TERRAIN from render.js
// rather than redefine it, so the two never drift apart.
//
// MOUNTAIN/SEA are additive, appended after the contract's original six
// rather than interleaved, so none of those original codes change value
// (would silently corrupt any already-serialized terrain array on load).
// They border the map's outer edge (world.js paints them - see
// generateOverworldTerrain) so the world reads as bounded by natural
// impassable terrain instead of just stopping at WORLD_W/WORLD_H.
//
// RIVER/STREAM are the same kind of additive append (same reason - never
// renumber an existing code). RIVER is a third hard map-edge border, the
// mirror image of MOUNTAIN/SEA but on the Woodland's west edge (world.js's
// generateOverworldTerrain paints it, wired into isTileFree exactly like
// MOUNTAIN/SEA - unconditionally impassable, no crossing mechanic, by
// design). STREAM is different in kind: thin branches/ponds carved inland
// from the river (world.js), deliberately left OUT of isTileFree's blocked
// set - confirmed player requirement that streams read as shallow, walkable
// water a player can wade across, unlike the river/sea/mountain borders.
export const TERRAIN = {
  GRASS: 0, DIRT: 1, TILLED: 2, WATER: 3, SAND: 4, PATH: 5, MOUNTAIN: 6, SEA: 7,
  RIVER: 8, STREAM: 9,
};

export const PALETTE = {
  grass: '#4a7c3f',
  grassAlt: '#5c9450',
  dirt: '#8b6544',
  tilled: '#6b4a2f',
  water: '#3a7ca5',
  sand: '#d9c398',
  mineFloor: '#6b6b6b',
  caveWall: '#2e2e33',
  path: '#b3a06e',
  treeCanopy: '#2f5d3a',
  treeTrunk: '#5c3a21',
  rock: '#8a8a8a',
  oreCopper: '#c97a4a',
  oreIron: '#9b5b4a',
  oreGold: '#d4af37',
  gem: '#7ac0e8',
  playerTunic: '#3f7d4a',
  skin: '#e0ac69',
  panelBg: '#3a2b22',
  text: '#f0e6d2',
  accent: '#d4af37',
  // Judgment call: not enumerated in the contract's palette paragraph but
  // needed for the node/actor glyphs it does describe (berry_bush's "red
  // dots", mushroom's "tan caps", and an NPC tunic distinct from the
  // player's). Chosen to sit naturally alongside the documented warm/rustic
  // palette rather than clash with it.
  berryRed: '#c0392b',
  mushroomStem: '#e6dcc4',
  npcTunic: '#7a4f8b',
  // Terracotta/earthenware, distinct from rock/dirt/ore's warmer browns so a
  // clay_deposit glyph doesn't read as just another rock or bare-dirt patch.
  clay: '#b0602f',
  // Border terrain (see TERRAIN.MOUNTAIN/SEA): dark rocky gray-purple for
  // the Foothills' east edge, and a deeper, colder blue than PALETTE.water
  // for the Coast's south edge - both meant to read as "the map ends here"
  // rather than as more of the ordinary walkable biome.
  mountain: '#4a4451',
  sea: '#1f4a68',
  // RIVER's west-edge border (see TERRAIN.RIVER): a clear, vivid medium blue,
  // distinct from both `water`'s muted teal-blue and `sea`'s much darker
  // depth so a river border reads as its own thing rather than "more sea".
  river: '#3ba7d9',
  // STREAM's inland branches/ponds (see TERRAIN.STREAM): pale and light -
  // lighter than every other water tone here - so a shallow, walkable stream
  // reads as visibly shallower than the river it branches from, at a glance.
  stream: '#8fd0e8',
  mineDirt: '#5a4632',
  // A dedicated mine-native coal source (see world.js's NODE_DEFS.coal_seam)
  // - a near-black charcoal tone, distinct from rock's neutral gray and from
  // every ore's warm metallic fleck colors, so it reads as "fuel", not ore.
  coal: '#2a2622',
};

const TERRAIN_COLORS = {
  [TERRAIN.GRASS]: PALETTE.grass,
  [TERRAIN.DIRT]: PALETTE.dirt,
  [TERRAIN.TILLED]: PALETTE.tilled,
  [TERRAIN.WATER]: PALETTE.water,
  [TERRAIN.SAND]: PALETTE.sand,
  [TERRAIN.PATH]: PALETTE.path,
  [TERRAIN.MOUNTAIN]: PALETTE.mountain,
  [TERRAIN.SEA]: PALETTE.sea,
  [TERRAIN.RIVER]: PALETTE.river,
  [TERRAIN.STREAM]: PALETTE.stream,
};

export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 2;

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

// --- Camera --------------------------------------------------------------
// camera = {x, y, zoom} - x/y are the world-px point that maps to screen
// (0, 0) at the current zoom, same convention as driftworks' render.js.
export function createCamera() {
  return { x: 0, y: 0, zoom: 1 };
}

export function centerCameraOnGrid(camera, canvas, gx, gy) {
  centerCameraOnWorld(camera, canvas, gx * TILE_SIZE, gy * TILE_SIZE);
}

// Additive vs. driftworks: Wildergrove's camera follows a smoothly-moving
// (non-grid-locked) player every frame, so main.js needs to center on a
// world-px point directly rather than only on a tile center.
export function centerCameraOnWorld(camera, canvas, wx, wy) {
  camera.x = wx - canvas.width / (2 * camera.zoom);
  camera.y = wy - canvas.height / (2 * camera.zoom);
}

export function worldToScreen(camera, wx, wy) {
  return [(wx - camera.x) * camera.zoom, (wy - camera.y) * camera.zoom];
}

export function screenToWorld(camera, sx, sy) {
  return [sx / camera.zoom + camera.x, sy / camera.zoom + camera.y];
}

export function screenToGrid(camera, sx, sy) {
  const [wx, wy] = screenToWorld(camera, sx, sy);
  return [Math.floor(wx / TILE_SIZE), Math.floor(wy / TILE_SIZE)];
}

export function gridToScreen(camera, gx, gy) {
  return worldToScreen(camera, gx * TILE_SIZE, gy * TILE_SIZE);
}

export function tilePx(camera) {
  return TILE_SIZE * camera.zoom;
}

// Zoom by `factor` while keeping the world point under (screenX, screenY)
// fixed on screen - same "zoom to cursor" formula as driftworks' render.js.
export function zoomAt(camera, screenX, screenY, factor) {
  const [wxBefore, wyBefore] = screenToWorld(camera, screenX, screenY);
  camera.zoom = clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const [wxAfter, wyAfter] = screenToWorld(camera, screenX, screenY);
  camera.x += wxBefore - wxAfter;
  camera.y += wyBefore - wyAfter;
}

// Computes the [minX, minY, maxX, maxY] grid range currently visible on
// screen (with a 1-tile margin), clamped to [0, worldW-1] / [0, worldH-1].
export function visibleGridRange(camera, canvas, worldW, worldH) {
  const [x0, y0] = screenToGrid(camera, 0, 0);
  const [x1, y1] = screenToGrid(camera, canvas.width, canvas.height);
  return [
    clamp(Math.min(x0, x1) - 1, 0, worldW - 1),
    clamp(Math.min(y0, y1) - 1, 0, worldH - 1),
    clamp(Math.max(x0, x1) + 1, 0, worldW - 1),
    clamp(Math.max(y0, y1) + 1, 0, worldH - 1),
  ];
}

// --- Terrain ---------------------------------------------------------------
// Small deterministic per-tile shading, so flat color fills aren't dead flat.
function tileHash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 0xff) + amount, 0, 255);
  const g = clamp(((n >> 8) & 0xff) + amount, 0, 255);
  const b = clamp((n & 0xff) + amount, 0, 255);
  return `rgb(${r}, ${g}, ${b})`;
}

// terrain: flat array (plain Array or Uint8Array) of length worldW*worldH,
// row-major (index = y*worldW + x), holding TERRAIN codes. Only tiles inside
// the camera's current viewport are visited - this is called every frame, so
// it must never loop the whole map.
export function drawTerrain(ctx, terrain, worldW, worldH, camera, canvas) {
  const size = tilePx(camera);
  const [minX, minY, maxX, maxY] = visibleGridRange(camera, canvas, worldW, worldH);

  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      const code = terrain[gy * worldW + gx];
      const base = TERRAIN_COLORS[code] ?? PALETTE.grass;
      const [sx, sy] = gridToScreen(camera, gx, gy);
      const h = tileHash(gx, gy);
      ctx.fillStyle = shade(base, Math.round((h - 0.5) * 16));
      ctx.fillRect(sx, sy, size + 1, size + 1); // +1 avoids seam gaps while panning
    }
  }
}

// mine: same shape as an overworld terrain grid but sized MINE_W x MINE_H,
// with three codes in play (floor / wall / dirt, per world.js's MINE_TILE) -
// kept as a separate function (rather than overloading drawTerrain) since a
// mine's obstacle tiles need their own look distinct from any overworld
// terrain code. DIRT (world.js: packed overburden a player can dig through)
// is drawn as a packed-earth brown that sits visually between the open
// mineFloor and the near-black, permanent caveWall - a reader should be able
// to tell "diggable" from "never diggable" at a glance.
export function drawMineFloor(ctx, mineGrid, camera, canvas) {
  const size = tilePx(camera);
  const [minX, minY, maxX, maxY] = visibleGridRange(camera, canvas, MINE_W, MINE_H);

  // Hardcoded 1/2 rather than importing world.js's MINE_TILE.WALL/DIRT -
  // this module never imports world.js (world.js imports TERRAIN from HERE;
  // importing back would be circular), so it reads the grid as plain
  // numeric codes the same way it always has (see the old isWall boolean
  // this replaced). Must stay in sync with world.js's MINE_TILE values.
  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      const tile = mineGrid[gy * MINE_W + gx];
      const [sx, sy] = gridToScreen(camera, gx, gy);
      const h = tileHash(gx, gy);
      const base = tile === 1 ? PALETTE.caveWall : tile === 2 ? PALETTE.mineDirt : PALETTE.mineFloor;
      ctx.fillStyle = shade(base, Math.round((h - 0.5) * 14));
      ctx.fillRect(sx, sy, size + 1, size + 1);
    }
  }
}

// A mine level's exit is otherwise plain floor (see world.js's
// carveMineTiles - it's just wherever the carving walk ended, not a
// distinct grid code), so without a marker it's genuinely indistinguishable
// from any other floor tile and effectively unfindable in a 40x30 cave.
// Drawn as a shaft of surface light plus a ladder so it reads clearly even
// from a few tiles away or at low zoom.
export function drawMineExit(ctx, exit, camera) {
  if (!exit) return;
  const size = tilePx(camera);
  const [sx, sy] = gridToScreen(camera, exit.x, exit.y);
  const cx = sx + size / 2;
  const cy = sy + size / 2;

  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 1.6);
  glow.addColorStop(0, 'rgba(212, 175, 55, 0.55)');
  glow.addColorStop(1, 'rgba(212, 175, 55, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - size * 1.6, cy - size * 1.6, size * 3.2, size * 3.2);

  ctx.fillStyle = 'rgba(212, 175, 55, 0.25)';
  ctx.fillRect(sx, sy, size + 1, size + 1);

  const railInset = size * 0.32;
  ctx.strokeStyle = PALETTE.treeTrunk;
  ctx.lineWidth = Math.max(1, size * 0.06);
  ctx.beginPath();
  ctx.moveTo(sx + railInset, sy + size * 0.15);
  ctx.lineTo(sx + railInset, sy + size * 0.85);
  ctx.moveTo(sx + size - railInset, sy + size * 0.15);
  ctx.lineTo(sx + size - railInset, sy + size * 0.85);
  const rungs = 4;
  for (let i = 0; i < rungs; i += 1) {
    const ry = sy + size * (0.22 + i * 0.18);
    ctx.moveTo(sx + railInset, ry);
    ctx.lineTo(sx + size - railInset, ry);
  }
  ctx.stroke();
}

// --- Farm plots --------------------------------------------------------
// farming.js tracks tilled/planted tiles entirely in its own `plots` Map
// (world.js's terrain array never gets a TERRAIN.TILLED write - see
// farming.js's file header) so this is the one draw* function here that
// takes a farming.js Map instead of a world.js structure. Drawn after
// drawTerrain and before drawResourceNodes/drawBuildings (main.js's job to
// order the calls that way) so crops visibly sit on the soil.
const CROP_COLORS = {
  turnip: '#c76b9e', carrot: '#d97a2e', wheat: '#d8c46a', pumpkin: '#e08a2e',
};

function drawFarmPlot(ctx, sx, sy, size, plot) {
  const pad = size * 0.06;
  const soilX = sx + pad;
  const soilY = sy + pad;
  const soilW = size - pad * 2;
  const soilH = size - pad * 2;

  // Watered soil reads as visibly darker/wetter, plus a couple of thin
  // glossy sheen streaks - without this, watering a plot was invisible
  // (confirmed bug: a player couldn't tell if watering worked at all).
  ctx.fillStyle = plot.wateredToday ? shade(PALETTE.tilled, -28) : PALETTE.tilled;
  ctx.fillRect(soilX, soilY, soilW, soilH);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.strokeRect(soilX, soilY, soilW, soilH);

  if (plot.wateredToday) {
    ctx.fillStyle = 'rgba(140, 190, 220, 0.22)';
    ctx.fillRect(soilX, soilY, soilW, soilH);
    ctx.strokeStyle = 'rgba(220, 240, 255, 0.35)';
    ctx.lineWidth = Math.max(1, size * 0.025);
    ctx.beginPath();
    ctx.moveTo(soilX + soilW * 0.2, soilY + soilH * 0.28);
    ctx.lineTo(soilX + soilW * 0.4, soilY + soilH * 0.28);
    ctx.moveTo(soilX + soilW * 0.55, soilY + soilH * 0.62);
    ctx.lineTo(soilX + soilW * 0.8, soilY + soilH * 0.62);
    ctx.stroke();
  }

  if (plot.cropId === null) return; // tilled and empty - bare soil is enough

  const crop = CROPS[plot.cropId];
  const maxStage = crop?.growDays || 1;
  const pct = clamp(plot.stage / maxStage, 0, 1);
  const ready = crop && plot.stage >= crop.growDays;
  const cx = sx + size / 2;
  const cy = sy + size / 2;

  // Stem: grows taller as the plot approaches its final stage.
  const stemH = size * (0.1 + 0.3 * pct);
  const baseY = cy + size * 0.3;
  ctx.strokeStyle = '#3f7d2f';
  ctx.lineWidth = Math.max(1, size * 0.05);
  ctx.beginPath();
  ctx.moveTo(cx, baseY);
  ctx.lineTo(cx, baseY - stemH);
  ctx.stroke();

  // Crop head: a small blob that grows and brightens toward maturity, per
  // crop where a color is defined, otherwise a generic accent ramp.
  const color = CROP_COLORS[plot.cropId] || PALETTE.accent;
  const r = size * (0.07 + 0.15 * pct);
  ctx.fillStyle = ready ? color : shade(color, Math.round(-50 + 50 * pct));
  ctx.beginPath();
  ctx.arc(cx, baseY - stemH, r, 0, Math.PI * 2);
  ctx.fill();

  if (ready) {
    // Ready-to-harvest ring, matching the resource-node hp bar's accent.
    ctx.strokeStyle = PALETTE.accent;
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.beginPath();
    ctx.arc(cx, baseY - stemH, r + size * 0.05, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// plots: farming.js's getAllPlots() Map, keyed "x,y" -> {cropId, stage,
// plantedDay, wateredToday}. Culled to the viewport like drawTerrain.
export function drawFarmPlots(ctx, plots, camera, canvas) {
  if (!plots || plots.size === 0) return;
  const size = tilePx(camera);
  const [minX, minY, maxX, maxY] = visibleGridRange(camera, canvas, WORLD_W, WORLD_H);

  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      const plot = plots.get(`${gx},${gy}`);
      if (!plot) continue;
      const [sx, sy] = gridToScreen(camera, gx, gy);
      drawFarmPlot(ctx, sx, sy, size, plot);
    }
  }
}

// --- Ground shadows ---------------------------------------------------------
// Cheap per-frame drop shadow (no precomputed noise needed - it's one ellipse
// fill) drawn under actors/nodes/buildings for a little depth. Kept as a
// single small helper so the look stays consistent everywhere it's used.
function drawGroundShadow(ctx, cx, cy, size, scale = 1) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.3, size * 0.3 * scale, size * 0.12 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

// --- Resource node iconography ---------------------------------------------
// Each drawn in local (cx, cy) with a footprint sized off `size` (the current
// on-screen tile size), so they scale cleanly with zoom.
function drawTreeNode(ctx, cx, cy, size, gx, gy) { // eslint-disable-line no-unused-vars -- gx/gy kept for dispatch-table signature uniformity
  const trunkW = size * 0.14;
  const trunkH = size * 0.32;
  ctx.fillStyle = PALETTE.treeTrunk;
  ctx.fillRect(cx - trunkW / 2, cy + size * 0.06, trunkW, trunkH);

  ctx.fillStyle = PALETTE.treeCanopy;
  ctx.beginPath();
  ctx.arc(cx, cy - size * 0.16, size * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - size * 0.2, cy - size * 0.02, size * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + size * 0.2, cy - size * 0.02, size * 0.24, 0, Math.PI * 2);
  ctx.fill();
}

function drawRockPolygon(ctx, cx, cy, r, color) {
  ctx.beginPath();
  const pts = [
    [0, -r], [r * 0.8, -r * 0.3], [r * 0.6, r * 0.8],
    [-r * 0.5, r * 0.85], [-r * 0.9, r * 0.1], [-r * 0.4, -r * 0.7],
  ];
  pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(cx + px, cy + py) : ctx.lineTo(cx + px, cy + py)));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.stroke();
}

function drawRockNode(ctx, cx, cy, size, gx, gy) { // eslint-disable-line no-unused-vars -- gx/gy kept for dispatch-table signature uniformity
  drawRockPolygon(ctx, cx, cy, size * 0.32, PALETTE.rock);
}

const ORE_FLECK_COLORS = {
  ore_copper: PALETTE.oreCopper,
  ore_iron: PALETTE.oreIron,
  ore_gold: PALETTE.oreGold,
  gem: PALETTE.gem,
};

// Base fleck layout (same scattered arrangement the old fixed array used) -
// each node then jitters these via tileHash keyed off its own grid
// coordinates, so nodes no longer all render the identical 5-dot pattern
// that read as a face (confirmed player feedback).
const ORE_FLECK_BASE = [[-0.3, -0.2], [0.25, -0.35], [0.1, 0.15], [-0.2, 0.35], [0.35, 0.3]];
const ORE_FLECK_JITTER = 0.08;

function drawOreVeinNode(ctx, cx, cy, size, oreType, gx, gy) {
  const r = size * 0.32;
  drawRockPolygon(ctx, cx, cy, r, PALETTE.rock);
  const fleckColor = ORE_FLECK_COLORS[oreType] || PALETTE.oreCopper;
  ctx.fillStyle = fleckColor;
  ORE_FLECK_BASE.forEach(([fx, fy], i) => {
    const jx = (tileHash(gx + i * 7, gy + i * 13) - 0.5) * 2 * ORE_FLECK_JITTER;
    const jy = (tileHash(gx + i * 7 + 3, gy + i * 13 + 5) - 0.5) * 2 * ORE_FLECK_JITTER;
    ctx.beginPath();
    ctx.arc(cx + (fx + jx) * r, cy + (fy + jy) * r, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawBerryBushNode(ctx, cx, cy, size, gx, gy) { // eslint-disable-line no-unused-vars -- gx/gy kept for dispatch-table signature uniformity
  ctx.fillStyle = PALETTE.grassAlt;
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.06, size * 0.32, size * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.berryRed;
  const dots = [[-0.15, -0.05], [0.1, -0.15], [0.22, 0.08], [-0.05, 0.15], [-0.25, 0.1]];
  for (const [dx, dy] of dots) {
    ctx.beginPath();
    ctx.arc(cx + dx * size, cy + dy * size, size * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMushroomNode(ctx, cx, cy, size, gx, gy) { // eslint-disable-line no-unused-vars -- gx/gy kept for dispatch-table signature uniformity
  const caps = [[-0.12, 0.06, 0.16], [0.14, 0.1, 0.13]];
  for (const [ox, oy, r] of caps) {
    const px = cx + ox * size;
    const py = cy + oy * size;
    const capR = size * r;
    ctx.fillStyle = PALETTE.mushroomStem;
    ctx.fillRect(px - capR * 0.2, py, capR * 0.4, capR * 0.6);
    ctx.fillStyle = PALETTE.sand;
    ctx.beginPath();
    ctx.arc(px, py, capR, Math.PI, 0);
    ctx.fill();
  }
}

// A small mound of terracotta clumps - deliberately soft/rounded (unlike
// rock's angular polygon) and a single warm clay tone (unlike ore's
// rock-plus-flecks look), so it reads at a glance as "diggable soft
// material" rather than another mineral node.
function drawClayDepositNode(ctx, cx, cy, size, gx, gy) { // eslint-disable-line no-unused-vars -- gx/gy kept for dispatch-table signature uniformity
  const clumps = [[-0.16, 0.08, 0.2], [0.15, 0.12, 0.17], [0, -0.05, 0.15]];
  for (const [ox, oy, r] of clumps) {
    ctx.fillStyle = PALETTE.clay;
    ctx.beginPath();
    ctx.ellipse(cx + ox * size, cy + oy * size, size * r, size * r * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.stroke();
  }
}

// Reuses the ore vein's rock-plus-flecks silhouette (same jitter treatment)
// but in solid charcoal rather than a metallic tint, so it still reads as
// "embedded mineral vein" at a glance while being visually distinct from
// every ore color - fuel, not metal.
function drawCoalSeamNode(ctx, cx, cy, size, gx, gy) {
  const r = size * 0.32;
  drawRockPolygon(ctx, cx, cy, r, PALETTE.rock);
  ctx.fillStyle = PALETTE.coal;
  ORE_FLECK_BASE.forEach(([fx, fy], i) => {
    const jx = (tileHash(gx + i * 7, gy + i * 13) - 0.5) * 2 * ORE_FLECK_JITTER;
    const jy = (tileHash(gx + i * 7 + 3, gy + i * 13 + 5) - 0.5) * 2 * ORE_FLECK_JITTER;
    ctx.beginPath();
    ctx.arc(cx + (fx + jx) * r, cy + (fy + jy) * r, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Every drawer takes the same (ctx, cx, cy, size, gx, gy) shape so the
// dispatch loop below stays uniform - only the ore/gem/coal drawers (via
// drawOreVeinNode/drawCoalSeamNode) actually use gx/gy, to jitter each
// node's fleck pattern deterministically; the rest ignore the trailing pair.
const NODE_DRAWERS = {
  tree: drawTreeNode,
  rock: drawRockNode,
  berry_bush: drawBerryBushNode,
  mushroom: drawMushroomNode,
  clay_deposit: drawClayDepositNode,
  coal_seam: drawCoalSeamNode,
  ore_copper: (ctx, cx, cy, size, gx, gy) => drawOreVeinNode(ctx, cx, cy, size, 'ore_copper', gx, gy),
  ore_iron: (ctx, cx, cy, size, gx, gy) => drawOreVeinNode(ctx, cx, cy, size, 'ore_iron', gx, gy),
  ore_gold: (ctx, cx, cy, size, gx, gy) => drawOreVeinNode(ctx, cx, cy, size, 'ore_gold', gx, gy),
  gem: (ctx, cx, cy, size, gx, gy) => drawOreVeinNode(ctx, cx, cy, size, 'gem', gx, gy),
};

// Draws a single node given its world data - exposed separately from
// drawResourceNodes so ui.js (e.g. a crafting/recipe tooltip icon) can reuse
// the exact same glyph at an arbitrary size. gx/gy are the node's grid
// coordinates (only meaningful for ore/gem's per-node fleck jitter) - pass
// any stable value (e.g. 0, 0) for a standalone icon where they don't apply.
export function drawResourceNodeGlyph(ctx, type, cx, cy, size, gx, gy) {
  const drawFn = NODE_DRAWERS[type];
  if (drawFn) drawFn(ctx, cx, cy, size, gx, gy);
}

// nodes: Map keyed "x,y" -> {type, hp, maxHp}, per world.js's documented
// shape. Only visits tiles inside the current viewport rather than the whole
// Map, so cost scales with screen size, not world size.
//
// isCoveredFn(gx, gy): optional - when given, any node whose tile still
// reports covered isn't drawn at all (not even its shadow/hp bar).
// CONFIRMED PLAYTESTING REQUEST: mine veins now always seed under dirt (see
// world.js's spawnMineNodes) so digging is required to find anything at
// all, but that only matters if the node stays invisible until the dirt
// covering it is actually cleared - drawing it regardless of tile state
// would give away exactly where to dig, defeating the point. render.js has
// no import on world.js/MINE_TILE (world.js imports the other way, to avoid
// a cycle), so main.js passes this as a plain predicate rather than a tile
// array + enum comparison - same "inject a callback, don't cross-import"
// pattern already used elsewhere (e.g. World.setFarmPlotGuard). The
// overworld call site omits this param entirely, so nothing changes there.
export function drawResourceNodes(ctx, nodes, camera, canvas, worldW, worldH, isCoveredFn) {
  const size = tilePx(camera);
  const [minX, minY, maxX, maxY] = visibleGridRange(camera, canvas, worldW, worldH);

  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      const node = nodes.get(`${gx},${gy}`);
      if (!node) continue;
      if (isCoveredFn && isCoveredFn(gx, gy)) continue;
      const [sx, sy] = gridToScreen(camera, gx, gy);
      const cx = sx + size / 2;
      const cy = sy + size / 2;
      drawGroundShadow(ctx, cx, cy, size);
      drawResourceNodeGlyph(ctx, node.type, cx, cy, size, gx, gy);

      if (node.maxHp && node.hp < node.maxHp) {
        const pct = clamp(node.hp / node.maxHp, 0, 1);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(sx + size * 0.15, sy - size * 0.08, size * 0.7, size * 0.08);
        ctx.fillStyle = PALETTE.accent;
        ctx.fillRect(sx + size * 0.15, sy - size * 0.08, size * 0.7 * pct, size * 0.08);
      }
    }
  }
}

// --- Buildings ---------------------------------------------------------
// buildings: array of instances from buildings.js's createBuilding(), each
// with {x, y, draw(ctx, x, y, camera)} per the contract - the building owns
// its own pixel math (via gridToScreen/tilePx from this module), so this
// function is just the culled dispatch loop.
export function drawBuildings(ctx, buildings, camera, canvas) {
  if (!buildings || !buildings.length) return;
  const [minX, minY, maxX, maxY] = [
    ...screenToGrid(camera, 0, 0),
    ...screenToGrid(camera, canvas.width, canvas.height),
  ];
  const lo = [Math.min(minX, maxX) - 2, Math.min(minY, maxY) - 2];
  const hi = [Math.max(minX, maxX) + 2, Math.max(minY, maxY) + 2];

  const size = tilePx(camera);
  for (const building of buildings) {
    if (building.x < lo[0] || building.x > hi[0] || building.y < lo[1] || building.y > hi[1]) continue;
    const [sx, sy] = gridToScreen(camera, building.x, building.y);
    drawGroundShadow(ctx, sx + size / 2, sy + size / 2, size);
    building.draw(ctx, building.x, building.y, camera);
  }
}

// --- Player / NPC ---------------------------------------------------------
// facingOffset: unit-ish vector per facing direction, used for the small
// direction indicator drawn on top of the capsule.
const FACING_VECTORS = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
};

function drawActor(ctx, sx, sy, size, tunicColor, facing) {
  const r = size * 0.34;
  drawGroundShadow(ctx, sx, sy, size, 0.8);
  // Body: rounded capsule (circle body + small legs stub reads fine at this
  // scale without full sprite art).
  ctx.fillStyle = tunicColor;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();

  // Head.
  ctx.fillStyle = PALETTE.skin;
  ctx.beginPath();
  ctx.arc(sx, sy - r * 0.75, r * 0.55, 0, Math.PI * 2);
  ctx.fill();

  // Facing indicator: small dot offset toward the faced direction.
  const [fx, fy] = FACING_VECTORS[facing] || FACING_VECTORS.down;
  ctx.fillStyle = PALETTE.text;
  ctx.beginPath();
  ctx.arc(sx + fx * r * 0.9, sy + fy * r * 0.5, r * 0.14, 0, Math.PI * 2);
  ctx.fill();
}

// player: {x, y, facing} with x/y in WORLD PX (smooth movement, not
// grid-locked - see player.js).
export function drawPlayer(ctx, player, camera) {
  const [sx, sy] = worldToScreen(camera, player.x, player.y);
  drawActor(ctx, sx, sy, tilePx(camera), PALETTE.playerTunic, player.facing);
}

// npc: {x, y, facing?} per quests.js's NPCS shape. Judgment call: NPCs are
// stationary map fixtures like resource nodes/buildings, so x/y are treated
// as GRID tile coordinates (not world px like the player) and drawn centered
// in that tile.
export function drawNPC(ctx, npc, camera) {
  const size = tilePx(camera);
  const [sx, sy] = gridToScreen(camera, npc.x, npc.y);
  drawActor(ctx, sx + size / 2, sy + size / 2, size, PALETTE.npcTunic, npc.facing || 'down');
}

// --- Day/night ambient tint --------------------------------------------
// A full-canvas overlay whose color/alpha shifts with the day cycle, purely
// atmospheric (kept subtle so gameplay stays readable at every hour). No
// explicit dawn/dusk/night phase data exists elsewhere in the contract, so
// this models the whole day as one brightness hump - dim at the timer's
// start/end (night), brightest at its midpoint (midday) - rather than
// inventing a phase table that nothing else references.
//
// dayProgress: 0..1, where the caller's day timer resets to 0. Values
// outside [0, 1] are clamped defensively.
const TINT_DAY = [255, 244, 214]; // faint warm midday - barely visible
const TINT_NIGHT = [18, 26, 58]; // cool blue night
const TINT_ALPHA_DAY = 0.04;
const TINT_ALPHA_NIGHT = 0.38;

export function drawDayNightTint(ctx, canvas, dayProgress) {
  const p = clamp(dayProgress, 0, 1);
  const brightness = Math.sin(p * Math.PI); // 0 at both ends, 1 at midday
  const night = 1 - brightness;

  const r = Math.round(TINT_DAY[0] + (TINT_NIGHT[0] - TINT_DAY[0]) * night);
  const g = Math.round(TINT_DAY[1] + (TINT_NIGHT[1] - TINT_DAY[1]) * night);
  const b = Math.round(TINT_DAY[2] + (TINT_NIGHT[2] - TINT_DAY[2]) * night);
  const alpha = TINT_ALPHA_DAY + (TINT_ALPHA_NIGHT - TINT_ALPHA_DAY) * night;

  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// --- Mine fog of war -----------------------------------------------------
// Without this, the mine was fully lit end to end, so the torch item had
// nothing to counteract (confirmed: a player was explicitly confused about
// what the torch was for). Darkens the whole canvas outside a radius around
// the player, leaving a soft-edged clear circle around them - main.js calls
// this last, after everything else in the mine is drawn, with a larger
// visionRadiusPx when the player is holding/has a torch.
//
// playerWx/playerWy: player's world-px position (same convention as
// drawPlayer/worldToScreen), not grid coordinates.
//
// CONFIRMED BUG this fixes: the original version punched the hole with
// destination-out directly on the main canvas. Canvas 2D is a flat raster -
// destination-out doesn't "un-draw" the terrain/nodes painted earlier this
// same frame to reveal them again, it just makes those already-blended
// pixels transparent, which then shows through to whatever's BEHIND the
// <canvas> element in the page (the body background), not the mine. That's
// exactly "just a bright light, can't see the mine" if the page behind it
// is light. Fixed by building the dark-overlay-with-a-hole on a reusable
// scratch canvas instead (where destination-out legitimately cuts a hole in
// ITS OWN freshly-drawn content, not the game's), then compositing that
// scratch canvas onto the real one with a normal source-over draw - this
// only darkens what's already on the game canvas instead of erasing it.
let fogScratchCanvas = null;
export function drawMineFog(ctx, canvas, camera, playerWx, playerWy, visionRadiusPx) {
  const [px, py] = worldToScreen(camera, playerWx, playerWy);

  if (!fogScratchCanvas || fogScratchCanvas.width !== canvas.width || fogScratchCanvas.height !== canvas.height) {
    fogScratchCanvas = document.createElement('canvas');
    fogScratchCanvas.width = canvas.width;
    fogScratchCanvas.height = canvas.height;
  }
  const sctx = fogScratchCanvas.getContext('2d');
  sctx.globalCompositeOperation = 'source-over';
  sctx.clearRect(0, 0, fogScratchCanvas.width, fogScratchCanvas.height);
  sctx.fillStyle = 'rgba(5, 5, 10, 0.88)';
  sctx.fillRect(0, 0, fogScratchCanvas.width, fogScratchCanvas.height);

  sctx.globalCompositeOperation = 'destination-out';
  const hole = sctx.createRadialGradient(px, py, 0, px, py, visionRadiusPx);
  hole.addColorStop(0, 'rgba(0, 0, 0, 1)');
  hole.addColorStop(1, 'rgba(0, 0, 0, 0)');
  sctx.fillStyle = hole;
  sctx.fillRect(px - visionRadiusPx, py - visionRadiusPx, visionRadiusPx * 2, visionRadiusPx * 2);

  ctx.drawImage(fogScratchCanvas, 0, 0);
}
