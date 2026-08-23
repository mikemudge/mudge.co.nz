// Camera + world rendering for Driftworks. Grid/building code never touches
// pixels (per the design contract) - all pan/zoom/pixel math lives here and
// in input.js, which imports the same camera helpers from this module.
//
// The HUD/palette/panels are DOM overlay elements (see ui.js); this module
// only draws the canvas world: water, land, eroding tiles, resource nodes,
// buildings (via each building's own documented `draw()`), the placement
// ghost, and the particle layer.

// --- Shared constants -------------------------------------------------------
// items.js/grid.js/simulation.js (Agent 1) are not written yet and utils.js's
// export shape isn't part of the documented contract, so these are defined
// locally per the design doc's "use these exact values/names everywhere"
// instruction rather than imported from an unverified module.
export const TILE_SIZE = 64;
export const GRID_SIZE = 48;
export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 2.5;

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

// --- Camera -------------------------------------------------------------
// camera = {x, y, zoom} - x/y are the world-px point that maps to screen
// (0, 0) at the current zoom. This makes zoom-to-cursor a simple two-line
// operation (see zoomAt) and panning a simple screen-delta/zoom subtraction.
export function createCamera() {
  return { x: 0, y: 0, zoom: 1 };
}

export function centerCameraOnGrid(camera, canvas, gx = GRID_SIZE / 2, gy = GRID_SIZE / 2) {
  camera.x = gx * TILE_SIZE - canvas.width / (2 * camera.zoom);
  camera.y = gy * TILE_SIZE - canvas.height / (2 * camera.zoom);
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
// fixed on screen - the standard "zoom to cursor" feel, reused by wheel and
// pinch handling in input.js.
export function zoomAt(camera, screenX, screenY, factor) {
  const [wxBefore, wyBefore] = screenToWorld(camera, screenX, screenY);
  camera.zoom = clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const [wxAfter, wyAfter] = screenToWorld(camera, screenX, screenY);
  camera.x += wxBefore - wxAfter;
  camera.y += wyBefore - wyAfter;
}

export function panCamera(camera, dxScreen, dyScreen) {
  camera.x -= dxScreen / camera.zoom;
  camera.y -= dyScreen / camera.zoom;
}

// --- Small deterministic per-tile shading, so land/water aren't flat -------
function tileHash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

const RESOURCE_COLORS = {
  ore: '#b08a5a',
  crystal: '#a06bd6',
  organic: '#6fcf6a',
};

function getTileMap(snapshot) {
  // Tile[][] indexing order isn't specified by the contract (row-major by x
  // or by y) - every Tile carries its own x/y though, so build a lookup keyed
  // on those instead of guessing the array's orientation.
  const map = new Map();
  const rows = snapshot.tiles || [];
  for (const row of rows) {
    for (const tile of row) {
      if (tile) map.set(`${tile.x},${tile.y}`, tile);
    }
  }
  return map;
}

function drawWaterTile(ctx, sx, sy, size, time, gx, gy) {
  const h = tileHash(gx, gy);
  const base = 20 + Math.round(h * 10);
  ctx.fillStyle = `rgb(${base}, ${90 + Math.round(h * 15)}, ${150 + Math.round(h * 20)})`;
  ctx.fillRect(sx, sy, size, size);

  // Subtle animated wave lines - cheap sine-offset strokes, not a real sim.
  ctx.strokeStyle = 'rgba(200, 235, 255, 0.18)';
  ctx.lineWidth = Math.max(1, size * 0.03);
  const waveY = sy + size * 0.5 + Math.sin(time * 1.4 + gx * 0.7 + gy * 0.4) * size * 0.12;
  ctx.beginPath();
  ctx.moveTo(sx, waveY);
  ctx.lineTo(sx + size, waveY + Math.sin(time * 1.4 + gx * 0.7 + gy * 0.4 + 1.5) * size * 0.06);
  ctx.stroke();
}

function drawLandTile(ctx, sx, sy, size, gx, gy) {
  const h = tileHash(gx, gy);
  const g = 110 + Math.round(h * 40);
  const r = 90 + Math.round(h * 30);
  ctx.fillStyle = `rgb(${r}, ${g}, ${60 + Math.round(h * 20)})`;
  ctx.fillRect(sx, sy, size, size);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx + 0.5, sy + 0.5, size - 1, size - 1);
}

function drawErosionOverlay(ctx, sx, sy, size, erosion, time) {
  const t = clamp(erosion.timer / erosion.duration, 0, 1);
  const pulse = 0.35 + 0.25 * Math.sin(time * 6);
  ctx.fillStyle = `rgba(200, 40, 30, ${0.15 + t * 0.35})`;
  ctx.fillRect(sx, sy, size, size);

  // Crack lines radiating from the tile center, more of them as t increases.
  const cx = sx + size / 2;
  const cy = sy + size / 2;
  ctx.strokeStyle = `rgba(60, 10, 5, ${0.5 + t * 0.4})`;
  ctx.lineWidth = Math.max(1, size * 0.02);
  const crackCount = 3 + Math.floor(t * 4);
  for (let i = 0; i < crackCount; i++) {
    const angle = (i / crackCount) * Math.PI * 2 + t * 2;
    const len = size * (0.2 + 0.3 * t);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
    ctx.stroke();
  }

  // Pulsing countdown ring so the player can eyeball time remaining.
  ctx.strokeStyle = `rgba(255, 90, 60, ${pulse})`;
  ctx.lineWidth = Math.max(2, size * 0.05);
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.32 * (1 - t) + size * 0.08, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - t));
  ctx.stroke();
}

function drawResourceNode(ctx, sx, sy, size, resource) {
  const color = RESOURCE_COLORS[resource.kind] || '#ffffff';
  const cx = sx + size / 2;
  const cy = sy + size / 2;
  const r = size * (0.12 + resource.richness * 0.05);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// Seawall protection is a pure derived visual here (own tile + 4-neighbors,
// per the buildings.js contract) - duplicating that rule for rendering only
// is safe since it can never desync gameplay, only the highlight.
function seawallProtectedSet(buildings) {
  const set = new Set();
  for (const b of buildings) {
    if (b.type !== 'seawall') continue;
    set.add(`${b.x},${b.y}`);
    set.add(`${b.x + 1},${b.y}`);
    set.add(`${b.x - 1},${b.y}`);
    set.add(`${b.x},${b.y + 1}`);
    set.add(`${b.x},${b.y - 1}`);
  }
  return set;
}

// Computes the [minX, minY, maxX, maxY] grid range currently visible on
// screen (with a 1-tile margin), clamped to the grid bounds.
export function visibleGridRange(camera, canvas) {
  const [x0, y0] = screenToGrid(camera, 0, 0);
  const [x1, y1] = screenToGrid(camera, canvas.width, canvas.height);
  return [
    clamp(Math.min(x0, x1) - 1, 0, GRID_SIZE - 1),
    clamp(Math.min(y0, y1) - 1, 0, GRID_SIZE - 1),
    clamp(Math.max(x0, x1) + 1, 0, GRID_SIZE - 1),
    clamp(Math.max(y0, y1) + 1, 0, GRID_SIZE - 1),
  ];
}

// view: { ghost: {type, x, y, rotation, valid} | null, particles, time }
export function drawWorld(ctx, canvas, camera, snapshot, view) {
  ctx.fillStyle = '#04121c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const tileMap = getTileMap(snapshot);
  const size = tilePx(camera);
  const [minX, minY, maxX, maxY] = visibleGridRange(camera, canvas);
  const time = view.time || 0;

  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      const tile = tileMap.get(`${gx},${gy}`);
      const [sx, sy] = gridToScreen(camera, gx, gy);
      if (!tile || tile.type === 'water') {
        drawWaterTile(ctx, sx, sy, size, time, gx, gy);
        continue;
      }
      drawLandTile(ctx, sx, sy, size, gx, gy);
      if (tile.resource) drawResourceNode(ctx, sx, sy, size, tile.resource);
      if (tile.erosion && tile.erosion.cracking) drawErosionOverlay(ctx, sx, sy, size, tile.erosion, time);
    }
  }

  // Seawall protection highlight, drawn under buildings.
  const protectedSet = seawallProtectedSet(snapshot.buildings || []);
  if (protectedSet.size) {
    ctx.strokeStyle = 'rgba(120, 210, 255, 0.5)';
    ctx.lineWidth = Math.max(1, size * 0.04);
    for (const key of protectedSet) {
      const [gx, gy] = key.split(',').map(Number);
      if (gx < minX || gx > maxX || gy < minY || gy > maxY) continue;
      const [sx, sy] = gridToScreen(camera, gx, gy);
      ctx.strokeRect(sx + 2, sy + 2, size - 4, size - 4);
    }
  }

  for (const building of snapshot.buildings || []) {
    if (building.x < minX - 1 || building.x > maxX + 1 || building.y < minY - 1 || building.y > maxY + 1) continue;
    const [sx, sy] = gridToScreen(camera, building.x, building.y);
    building.draw(ctx, sx, sy, size, camera);
  }

  if (view.ghost) {
    if (view.ghost.tool === 'bulldoze') {
      drawBulldozeHighlight(ctx, camera, view.ghost, size);
    } else {
      drawGhost(ctx, camera, view.ghost, size);
    }
  }

  if (view.particles) view.particles.draw(ctx, camera);
}

function drawBulldozeHighlight(ctx, camera, ghost, size) {
  const [sx, sy] = gridToScreen(camera, ghost.x, ghost.y);
  ctx.globalAlpha = ghost.valid ? 0.4 : 0.12;
  ctx.fillStyle = '#ff3b3b';
  ctx.fillRect(sx, sy, size, size);
  ctx.globalAlpha = 1;
  if (ghost.valid) {
    ctx.strokeStyle = '#ff3b3b';
    ctx.lineWidth = Math.max(2, size * 0.06);
    ctx.beginPath();
    ctx.moveTo(sx + size * 0.2, sy + size * 0.2);
    ctx.lineTo(sx + size * 0.8, sy + size * 0.8);
    ctx.moveTo(sx + size * 0.8, sy + size * 0.2);
    ctx.lineTo(sx + size * 0.2, sy + size * 0.8);
    ctx.stroke();
  }
}

function drawGhost(ctx, camera, ghost, size) {
  const [sx, sy] = gridToScreen(camera, ghost.x, ghost.y);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = ghost.valid ? '#7ee787' : '#ff6b6b';
  ctx.fillRect(sx, sy, size, size);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = ghost.valid ? '#2ecc55' : '#e63c3c';
  ctx.lineWidth = 2;
  ctx.strokeRect(sx + 1, sy + 1, size - 2, size - 2);

  // Small arrow indicating the building's rotation/output direction.
  const cx = sx + size / 2;
  const cy = sy + size / 2;
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const [dx, dy] = dirs[ghost.rotation] || dirs[0];
  ctx.strokeStyle = '#0a2f10';
  ctx.lineWidth = Math.max(2, size * 0.06);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + dx * size * 0.3, cy + dy * size * 0.3);
  ctx.stroke();
}
