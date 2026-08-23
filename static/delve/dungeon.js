// dungeon.js - procedural dungeon generation, the dungeon data structure,
// query helpers over that structure, and three.js mesh construction from it.
//
// This module intentionally knows nothing about the player, the camera, or
// the game loop - it just produces data (generateDungeon) and geometry
// (buildDungeonMeshes) from that data. Later iterations (enemies, loot,
// stairs transitions) should be able to do everything they need by reading
// the Dungeon object and calling the query helpers below, without touching
// generation internals.

import { createRng, randInt } from './utils.js';

// ---------------------------------------------------------------------------
// Tunable generation constants
// ---------------------------------------------------------------------------

// World-space size (in three.js units) of one grid cell. Every world-space
// query/placement in the game should go through this constant rather than
// hard-coding a number, so the whole dungeon can be rescaled in one place.
export const CELL_SIZE = 2;

// Grid dimensions, in cells. Kept square-ish and in the 40-60 range per spec.
export const GRID_WIDTH = 50;
export const GRID_HEIGHT = 50;

// How many rooms we *try* to place. Actual count may be lower if the grid
// fills up before every attempt finds a free spot (see MAX_PLACEMENT_ATTEMPTS).
export const ROOM_COUNT_MIN = 8;
export const ROOM_COUNT_MAX = 13;

// Room footprint, in cells (width/height each independently randomized in
// this range).
export const ROOM_SIZE_MIN = 4;
export const ROOM_SIZE_MAX = 9;

// Minimum gap (in cells) enforced between two rooms' bounding boxes, so
// rooms don't sit flush against each other with no wall between them.
const ROOM_PADDING = 1;

// How many random (x, y, w, h) placements we'll try per room before giving up
// on placing further rooms.
const MAX_PLACEMENT_ATTEMPTS = 200;

// How many extra (non-MST) corridors to add between random rooms, purely so
// the layout isn't a strict tree (creates the occasional loop). Doesn't
// affect the "fully connected" guarantee, which the MST pass already gives.
const EXTRA_LOOP_EDGES = 2;

// Wall height in world units - used by buildDungeonMeshes.
export const WALL_HEIGHT = 3;

// ---------------------------------------------------------------------------
// Cell types
// ---------------------------------------------------------------------------

export const CellType = Object.freeze({
  VOID: 0,   // nothing here - not rendered, not walkable
  FLOOR: 1,  // walkable ground (room interior or corridor)
  WALL: 2,   // a VOID cell that borders a FLOOR cell (solid, not walkable)
});

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

// A single rectangular room, in grid cells, plus derived world-space info.
// `connections` is filled in during corridor carving with the ids of every
// other room this one has a direct corridor to (used to compute the
// start -> stairs graph distance, and reusable later for e.g. gating loot by
// how "deep" a room is).
function makeRoom(id, gx, gy, gw, gh) {
  const worldMinX = gx * CELL_SIZE;
  const worldMinZ = gy * CELL_SIZE;
  const worldMaxX = (gx + gw) * CELL_SIZE;
  const worldMaxZ = (gy + gh) * CELL_SIZE;
  return {
    id,
    gx, gy, gw, gh,
    // Center cell (integer grid coords) - used as the corridor endpoint.
    centerCell: {
      cx: gx + Math.floor(gw / 2),
      cy: gy + Math.floor(gh / 2),
    },
    // World-space AABB and center, for spawning enemies/loot/etc later.
    worldBounds: { minX: worldMinX, minZ: worldMinZ, maxX: worldMaxX, maxZ: worldMaxZ },
    center: { x: (worldMinX + worldMaxX) / 2, z: (worldMinZ + worldMaxZ) / 2 },
    connections: [],
  };
}

function roomsOverlap(a, b, padding) {
  return !(
    a.gx + a.gw + padding <= b.gx ||
    b.gx + b.gw + padding <= a.gx ||
    a.gy + a.gh + padding <= b.gy ||
    b.gy + b.gh + padding <= a.gy
  );
}

function placeRooms(rng, gridWidth, gridHeight) {
  const targetCount = randInt(rng, ROOM_COUNT_MIN, ROOM_COUNT_MAX);
  const rooms = [];
  let attempts = 0;
  while (rooms.length < targetCount && attempts < targetCount * MAX_PLACEMENT_ATTEMPTS) {
    attempts++;
    const gw = randInt(rng, ROOM_SIZE_MIN, ROOM_SIZE_MAX);
    const gh = randInt(rng, ROOM_SIZE_MIN, ROOM_SIZE_MAX);
    const gx = randInt(rng, 1, gridWidth - gw - 1);
    const gy = randInt(rng, 1, gridHeight - gh - 1);
    const candidate = { gx, gy, gw, gh };
    const overlaps = rooms.some((r) => roomsOverlap(candidate, r, ROOM_PADDING));
    if (!overlaps) {
      rooms.push(makeRoom(rooms.length, gx, gy, gw, gh));
    }
  }
  return rooms;
}

function carveLine(cells, roomOf, gridWidth, x0, x1, y0, y1) {
  // Either x0 === x1 (vertical run) or y0 === y1 (horizontal run).
  const xStart = Math.min(x0, x1);
  const xEnd = Math.max(x0, x1);
  const yStart = Math.min(y0, y1);
  const yEnd = Math.max(y0, y1);
  for (let y = yStart; y <= yEnd; y++) {
    for (let x = xStart; x <= xEnd; x++) {
      const idx = y * gridWidth + x;
      if (cells[idx] !== CellType.FLOOR) {
        cells[idx] = CellType.FLOOR;
        // Leave roomOf as -1 (corridor cell) unless it already belongs to a
        // room - carveLine never overwrites roomOf, only cells.
      }
    }
  }
}

// Carves an L-shaped corridor between two room centers (grid coords),
// choosing horizontal-then-vertical or vertical-then-horizontal at random.
function carveCorridor(cells, roomOf, gridWidth, rng, from, to) {
  const horizontalFirst = rng() < 0.5;
  if (horizontalFirst) {
    carveLine(cells, roomOf, gridWidth, from.cx, to.cx, from.cy, from.cy);
    carveLine(cells, roomOf, gridWidth, to.cx, to.cx, from.cy, to.cy);
  } else {
    carveLine(cells, roomOf, gridWidth, from.cx, from.cx, from.cy, to.cy);
    carveLine(cells, roomOf, gridWidth, from.cx, to.cx, to.cy, to.cy);
  }
}

function connectRoom(rooms, a, b) {
  a.connections.push(b.id);
  b.connections.push(a.id);
}

// Connects every room into a single connected graph using a simple
// nearest-neighbor MST (Prim's algorithm): repeatedly link the closest
// (unconnected room, connected room) pair until all rooms are reached. This
// guarantees full connectivity - no isolated rooms - regardless of layout.
function connectAllRooms(cells, roomOf, gridWidth, rng, rooms) {
  if (rooms.length <= 1) return;

  const connected = [rooms[0]];
  const remaining = rooms.slice(1);

  while (remaining.length > 0) {
    let bestI = -1;
    let bestJ = -1;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const r = remaining[i];
      for (let j = 0; j < connected.length; j++) {
        const c = connected[j];
        const dx = r.center.x - c.center.x;
        const dz = r.center.z - c.center.z;
        const dist = dx * dx + dz * dz;
        if (dist < bestDist) {
          bestDist = dist;
          bestI = i;
          bestJ = j;
        }
      }
    }
    const room = remaining[bestI];
    const target = connected[bestJ];
    carveCorridor(cells, roomOf, gridWidth, rng, room.centerCell, target.centerCell);
    connectRoom(rooms, room, target);
    connected.push(room);
    remaining.splice(bestI, 1);
  }

  // A few extra edges between random rooms, purely for loop variety - not
  // needed for connectivity (already guaranteed above).
  for (let i = 0; i < EXTRA_LOOP_EDGES && rooms.length > 2; i++) {
    const a = rooms[randInt(rng, 0, rooms.length - 1)];
    const b = rooms[randInt(rng, 0, rooms.length - 1)];
    if (a.id === b.id || a.connections.includes(b.id)) continue;
    carveCorridor(cells, roomOf, gridWidth, rng, a.centerCell, b.centerCell);
    connectRoom(rooms, a, b);
  }
}

function stampRoomFloors(cells, roomOf, gridWidth, room) {
  for (let y = room.gy; y < room.gy + room.gh; y++) {
    for (let x = room.gx; x < room.gx + room.gw; x++) {
      const idx = y * gridWidth + x;
      cells[idx] = CellType.FLOOR;
      roomOf[idx] = room.id;
    }
  }
}

// Marks every VOID cell that 4-directionally borders a FLOOR cell as WALL.
function markWalls(cells, gridWidth, gridHeight) {
  // Read from the floor layout as it stood before this pass - safe here
  // because we only ever turn VOID into WALL based on a FLOOR neighbor,
  // never based on another WALL, so a single forward pass is sufficient
  // (no cell's classification depends on evaluation order).
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const idx = y * gridWidth + x;
      if (cells[idx] !== CellType.VOID) continue;
      const hasFloorNeighbor =
        (x > 0 && cells[idx - 1] === CellType.FLOOR) ||
        (x < gridWidth - 1 && cells[idx + 1] === CellType.FLOOR) ||
        (y > 0 && cells[idx - gridWidth] === CellType.FLOOR) ||
        (y < gridHeight - 1 && cells[idx + gridWidth] === CellType.FLOOR);
      if (hasFloorNeighbor) {
        cells[idx] = CellType.WALL;
      }
    }
  }
}

// BFS over the room-connection graph (rooms as nodes, corridors as edges) -
// NOT straight-line distance - so "stairs" always end up somewhere you
// actually have to walk a path to reach.
function bfsRoomDistances(rooms, startId) {
  const dist = new Array(rooms.length).fill(Infinity);
  dist[startId] = 0;
  const queue = [startId];
  while (queue.length > 0) {
    const cur = queue.shift();
    const room = rooms[cur];
    for (const nbId of room.connections) {
      if (dist[nbId] === Infinity) {
        dist[nbId] = dist[cur] + 1;
        queue.push(nbId);
      }
    }
  }
  return dist;
}

/**
 * Generates a new procedural dungeon.
 *
 * @param {object} [options]
 * @param {number} [options.seed] - RNG seed; omit for a random dungeon.
 * @param {number} [options.width] - grid width in cells (default GRID_WIDTH).
 * @param {number} [options.height] - grid height in cells (default GRID_HEIGHT).
 * @returns {Dungeon}
 *
 * Dungeon shape (the contract later iterations should build against):
 * {
 *   width, height,        // grid dimensions, in cells
 *   cellSize,             // === CELL_SIZE, world units per cell
 *   cells,                // Uint8Array[width*height], CellType per cell,
 *                         // indexed [y * width + x]
 *   roomOf,               // Int16Array[width*height], room id per cell or
 *                         // -1 if the cell isn't part of a room (e.g. a
 *                         // corridor cell)
 *   rooms,                // Room[] - see makeRoom() above for shape
 *   startRoomId, stairsRoomId, // ids into `rooms`
 *   startPos, stairsPos,  // {x, z} world-space spawn points
 * }
 */
export function generateDungeon(options = {}) {
  const rng = options.seed !== undefined ? createRng(options.seed) : createRng((Math.random() * 0xffffffff) >>> 0);
  const width = options.width || GRID_WIDTH;
  const height = options.height || GRID_HEIGHT;

  const cells = new Uint8Array(width * height); // defaults to CellType.VOID (0)
  const roomOf = new Int16Array(width * height).fill(-1);

  const rooms = placeRooms(rng, width, height);
  for (const room of rooms) {
    stampRoomFloors(cells, roomOf, width, room);
  }

  connectAllRooms(cells, roomOf, width, rng, rooms);
  markWalls(cells, width, height);

  const startRoomId = 0;
  const distances = bfsRoomDistances(rooms, startRoomId);
  let stairsRoomId = startRoomId;
  let bestDist = -1;
  for (let i = 0; i < rooms.length; i++) {
    if (distances[i] !== Infinity && distances[i] > bestDist) {
      bestDist = distances[i];
      stairsRoomId = i;
    }
  }

  const startRoom = rooms[startRoomId];
  const stairsRoom = rooms[stairsRoomId];

  return {
    width,
    height,
    cellSize: CELL_SIZE,
    cells,
    roomOf,
    rooms,
    startRoomId,
    stairsRoomId,
    startPos: { x: startRoom.center.x, z: startRoom.center.z },
    stairsPos: { x: stairsRoom.center.x, z: stairsRoom.center.z },
  };
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

// Raw cell type at grid coords, CellType.VOID if out of bounds.
export function getCell(dungeon, cx, cy) {
  if (cx < 0 || cy < 0 || cx >= dungeon.width || cy >= dungeon.height) {
    return CellType.VOID;
  }
  return dungeon.cells[cy * dungeon.width + cx];
}

export function isFloorCell(dungeon, cx, cy) {
  return getCell(dungeon, cx, cy) === CellType.FLOOR;
}

// Converts a world-space (x, z) position to the grid cell containing it.
export function worldToCell(dungeon, x, z) {
  return {
    cx: Math.floor(x / dungeon.cellSize),
    cy: Math.floor(z / dungeon.cellSize),
  };
}

// True if the world-space point (x, z) sits inside a floor cell. Handy for
// spawn placement ("is this candidate point walkable?").
export function isFloorWorld(dungeon, x, z) {
  const { cx, cy } = worldToCell(dungeon, x, z);
  return isFloorCell(dungeon, cx, cy);
}

// True if the world-space point (x, z) is solid (wall or void/out-of-bounds)
// - the complement of isFloorWorld, exported separately since "is this
// blocked" reads more clearly at collision call sites.
export function isSolidWorld(dungeon, x, z) {
  return !isFloorWorld(dungeon, x, z);
}

// ---------------------------------------------------------------------------
// three.js mesh construction
// ---------------------------------------------------------------------------

// Cheap deterministic hash -> [0, 1), used for per-room/per-cell color
// variation without needing to thread the generation RNG into render code.
function hash01(x, y) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

function floorColor(THREE, dungeon, cx, cy) {
  const roomId = dungeon.roomOf[cy * dungeon.width + cx];
  const color = new THREE.Color();
  if (roomId >= 0) {
    const n = hash01(roomId * 13.37, roomId * 7.77);
    // Warm stone tones, lightness/hue nudged per-room so adjacent rooms read
    // as distinct spaces.
    color.setHSL(0.09 + n * 0.05, 0.18, 0.34 + n * 0.12);
  } else {
    // Corridors: cooler, darker gray.
    color.setHSL(0.6, 0.05, 0.24);
  }
  return color;
}

function wallColor(THREE, dungeon, cx, cy) {
  const base = floorColor(THREE, dungeon, cx, cy);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  const color = new THREE.Color();
  color.setHSL(hsl.h, hsl.s * 0.7, Math.max(0.1, hsl.l - 0.16));
  return color;
}

function setFaceColors(geometry, color) {
  for (const face of geometry.faces) {
    face.color.copy(color);
  }
}

// Builds one small plane geometry per wall segment, positioned and oriented
// for the given side of the given cell, ready to be merged into the big
// wall geometry. `direction` is one of 'north' | 'south' | 'east' | 'west'
// (north/south border the cell above/below in grid Y => world Z; east/west
// border in grid X => world X).
function wallSegmentGeometry(THREE, cellSize, wallHeight, direction, worldX, worldZ) {
  const geo = new THREE.PlaneGeometry(cellSize, wallHeight);
  // PlaneGeometry starts flat in the XY plane (facing +/-Z) - exactly what
  // north/south walls need already; east/west walls need a 90 degree turn
  // around Y so the plane instead faces +/-X.
  if (direction === 'east' || direction === 'west') {
    geo.rotateY(Math.PI / 2);
  }
  const halfCell = cellSize / 2;
  let offsetX = 0;
  let offsetZ = 0;
  if (direction === 'north') offsetZ = -halfCell;
  else if (direction === 'south') offsetZ = halfCell;
  else if (direction === 'west') offsetX = -halfCell;
  else if (direction === 'east') offsetX = halfCell;
  // Lift so the wall's base sits on the floor (y=0) instead of straddling it.
  geo.translate(worldX + offsetX, wallHeight / 2, worldZ + offsetZ);
  return geo;
}

/**
 * Builds three.js meshes for the dungeon: one merged floor mesh (every FLOOR
 * cell) and one merged wall mesh (a wall segment on every FLOOR-cell edge
 * that borders a non-floor cell). Geometry is merged into these two meshes
 * total (rather than one mesh per cell) to keep draw calls low - this three
 * version predates InstancedMesh, and per-cell meshes would be far too many
 * draw calls for anything but a tiny dungeon.
 *
 * Returns a THREE.Group containing both meshes, ready to add to a scene.
 */
export function buildDungeonMeshes(dungeon, THREE) {
  const group = new THREE.Group();
  group.name = 'dungeon';

  const floorGeometry = new THREE.Geometry();
  const wallGeometry = new THREE.Geometry();
  const cellSize = dungeon.cellSize;

  const neighbors = [
    { dx: 0, dy: -1, dir: 'north' },
    { dx: 0, dy: 1, dir: 'south' },
    { dx: -1, dy: 0, dir: 'west' },
    { dx: 1, dy: 0, dir: 'east' },
  ];

  for (let cy = 0; cy < dungeon.height; cy++) {
    for (let cx = 0; cx < dungeon.width; cx++) {
      if (!isFloorCell(dungeon, cx, cy)) continue;

      const worldX = (cx + 0.5) * cellSize;
      const worldZ = (cy + 0.5) * cellSize;

      const plane = new THREE.PlaneGeometry(cellSize, cellSize);
      plane.rotateX(-Math.PI / 2);
      plane.translate(worldX, 0, worldZ);
      setFaceColors(plane, floorColor(THREE, dungeon, cx, cy));
      floorGeometry.merge(plane);

      for (const { dx, dy, dir } of neighbors) {
        if (isFloorCell(dungeon, cx + dx, cy + dy)) continue;
        const segment = wallSegmentGeometry(THREE, cellSize, WALL_HEIGHT, dir, worldX, worldZ);
        setFaceColors(segment, wallColor(THREE, dungeon, cx, cy));
        wallGeometry.merge(segment);
      }
    }
  }

  const floorMaterial = new THREE.MeshStandardMaterial({
    vertexColors: THREE.FaceColors,
    roughness: 0.9,
    metalness: 0.0,
  });
  const wallMaterial = new THREE.MeshStandardMaterial({
    vertexColors: THREE.FaceColors,
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
  floorMesh.name = 'dungeon-floor';
  floorMesh.receiveShadow = true;

  const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
  wallMesh.name = 'dungeon-walls';
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;

  group.add(floorMesh);
  group.add(wallMesh);
  return group;
}
