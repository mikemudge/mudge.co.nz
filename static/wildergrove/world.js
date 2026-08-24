// The valley: overworld terrain, the region registry, resource nodes (both
// overworld and mine), tile occupancy for buildings, and mine level
// generation. Nothing here touches pixels/camera (render.js's job) or DOM
// (ui.js's job) - this is pure world-state + world-logic, and every piece of
// it is either a plain value on `this` or reachable from one, so `serialize`
// below can save the whole thing without anything hiding in a closure.
//
// World generation (terrain + node placement + mine layout) is driven by a
// seeded RNG so it's reproducible from a stored seed; day-to-day gameplay
// randomness (exact harvest yield within a node's range) intentionally uses
// Math.random() instead - see randRange() - since only the generated layout
// itself needs to survive a save/reload byte-for-byte.
// TERRAIN is defined in render.js (see its own doc comment on why - it needs
// the numeric codes for its terrain->color table and got there first) and
// re-exported here so `import { TERRAIN } from './world.js'` also works,
// per the design doc's framing of TERRAIN as conceptually world.js's enum -
// this is the same object either way, so the two can never drift apart.
import { WORLD_W, WORLD_H, MINE_W, MINE_H, TERRAIN } from './render.js';
import { RESOURCE_NODE_YIELDS, TOOL_TIER_POWER, ORE_MIN_TIER } from './items.js';
import { createRng, randInt, choice, clamp } from './utils.js';

export { TERRAIN };

// Mine tiles are a separate small enum from overworld TERRAIN (a mine has no
// grass/water/tilled soil - just floor, wall, and dirt). DIRT is packed
// overburden carved out around the corridor (see carveMineTiles): unlike
// WALL it's temporary - World.clearMineDirt() digs it down to FLOOR - so a
// vein sitting under/behind it is a "dig here" discovery rather than a
// permanently sealed wall. render.js's drawMineFloor reads all three codes
// directly - the exit is still NOT a fourth grid code, it's the plain-floor
// tile named by the level's own `exit: {x, y}` field (see generateMine).
export const MINE_TILE = Object.freeze({
  FLOOR: 0,
  WALL: 1,
  DIRT: 2,
});

// --- Resource node definitions -------------------------------------------
// Only what's genuinely world.js's own concern lives here: hp (how tough a
// node is), blocking (does it occupy the tile for movement/placement), and
// respawnDays. Tool-tier gating (ORE_MIN_TIER) and yield item/qty
// (RESOURCE_NODE_YIELDS) are items.js's tables - imported above - kept as
// the single source of truth so this file can't drift from what actions.js
// already reads directly from items.js for its own pre-check.
//
// One respawnDays column drives all three respawn rules from the design
// doc: trees/bushes/mushrooms respawn a few days after depletion, overworld
// rock respawns too (just much more slowly), and every ore+gem has
// respawnDays: null, so "mine ore never respawns" falls out for free
// without special-casing mine vs overworld.
//
// maxHp values are tuned against items.js's TOOL_TIER_POWER (1/2/3/5 by
// tier) so a base tier-1 tool takes a handful of swings per node and a
// min-tier-gated ore takes a handful more at ITS minimum tier - a judgment
// call, since the design doc pins a swing's *stamina cost* (player.js) but
// not its damage.
export const NODE_DEFS = Object.freeze({
  tree: { harvestable: true, blocking: true, maxHp: 6, respawnDays: 3 },
  rock: { harvestable: true, blocking: true, maxHp: 5, respawnDays: 6 },
  // respawnDays: null here means "mine ore never respawns" (harvestMineNode
  // never passes an override, so these nulls are what it actually gets) -
  // confirmed via playtesting as the right call for the mine (going deeper
  // into a future level is meant to be the payoff for scarcity there). But
  // these same nulls used to ALSO apply overworld, which meant Foothills
  // ore was just as permanently finite as mine ore - once a player mined
  // out what had spawned in the areas they'd explored, that ore was gone
  // for the rest of the playthrough with no way to get more. That's fixed
  // below: harvestNode() (overworld only) passes OVERWORLD_ORE_RESPAWN_DAYS
  // as an override table so overworld ore slowly regrows while mine ore
  // stays governed by these nulls.
  ore_copper: { harvestable: true, blocking: true, maxHp: 6, respawnDays: null },
  ore_iron: { harvestable: true, blocking: true, maxHp: 10, respawnDays: null },
  ore_gold: { harvestable: true, blocking: true, maxHp: 15, respawnDays: null },
  gem: { harvestable: true, blocking: true, maxHp: 10, respawnDays: null },
  berry_bush: { harvestable: true, blocking: false, maxHp: 2, respawnDays: 2 },
  mushroom: { harvestable: true, blocking: false, maxHp: 1, respawnDays: 1 },
  // Soft and quick to gather (low maxHp) and renewable on a short timer,
  // unlike ore - the pottery loop depends on clay being plentiful rather
  // than scarce, so this is deliberately tuned closer to berry_bush/mushroom
  // than to rock.
  clay_deposit: { harvestable: true, blocking: false, maxHp: 2, respawnDays: 4 },
  // Mine-only, dedicated coal source (see items.js's RESOURCE_NODE_YIELDS
  // comment on the confirmed coal bottleneck this fixes). blocking: true and
  // never-respawning like ore, since it's mined out of a wall/dirt pocket
  // the same way, not gathered like a surface bush.
  coal_seam: { harvestable: true, blocking: true, maxHp: 5, respawnDays: null },
  // Not harvestable - interacting with it is actions.js's job (enter the
  // mine), not a mining swing.
  cave_entrance: { harvestable: false, blocking: false, maxHp: Infinity, respawnDays: null },
});

function randRange(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function tileKey(x, y) {
  return `${x},${y}`;
}

// --- Regions -------------------------------------------------------------
// Bounds are half-open: [x0, x1) x [y0, y1). The overworld is partitioned
// into a south "coast" strip plus three equal north/south-running columns
// (Woodland / Meadow / Foothills) above it - Meadow (home base) sits
// between Woodland and Foothills so both flank it, and Coast runs along the
// south edge per the design doc. COAST_ROWS is a judgment call (how deep
// the coast band is); the column split is an even three-way division of
// WORLD_W so this stays sensible if WORLD_W/H ever grow (per the doc's
// "add a region to the array" extension point).
const COAST_ROWS = 15;
const COAST_Y0 = WORLD_H - COAST_ROWS;
const COL_W = Math.round(WORLD_W / 3);

export const REGIONS = [
  { id: 'woodland', name: 'Woodland', biome: 'woodland', bounds: { x0: 0, y0: 0, x1: COL_W, y1: COAST_Y0 } },
  { id: 'meadow', name: 'Meadow', biome: 'meadow', bounds: { x0: COL_W, y0: 0, x1: COL_W * 2, y1: COAST_Y0 } },
  { id: 'foothills', name: 'Foothills', biome: 'foothills', bounds: { x0: COL_W * 2, y0: 0, x1: WORLD_W, y1: COAST_Y0 } },
  { id: 'coast', name: 'Coast', biome: 'coast', bounds: { x0: 0, y0: COAST_Y0, x1: WORLD_W, y1: WORLD_H } },
];

export function getRegionAt(x, y) {
  for (const region of REGIONS) {
    const b = region.bounds;
    if (x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1) return region;
  }
  return REGIONS[1]; // Meadow - shouldn't happen, the regions above fully tile the grid
}

// Home base spawn point: the center of the Meadow region. Not named in the
// design doc, but main.js/player.js need *some* starting coordinate, and
// this is the obvious one given "Meadow/home base" - exported additively
// rather than guessed at inline in another module.
const meadowBounds = REGIONS.find((r) => r.id === 'meadow').bounds;
export const HOME_SPAWN = {
  x: Math.floor((meadowBounds.x0 + meadowBounds.x1) / 2),
  y: Math.floor((meadowBounds.y0 + meadowBounds.y1) / 2),
};
const HOME_SAFE_RADIUS = 6; // no resource nodes spawn this close to the start

// --- Overworld terrain generation ----------------------------------------

// Per-biome chance a given grass/dirt tile is generated as bare DIRT instead
// of GRASS - purely cosmetic variety (undergrowth reads as patchier in
// Woodland, barer/rockier in Foothills). Judgment-call numbers.
const DIRT_CHANCE = { meadow: 0.08, woodland: 0.15, foothills: 0.35 };

// How many tiles deep the impassable map-edge bands are. Foothills is the
// map's easternmost column and Coast its southernmost row (see REGIONS), so
// painting these along "the outer edge of Foothills"/"the outer edge of
// Coast" is the same thing as painting them along the map's east/south
// edges - there's no other edge of either region that's also a map edge.
// A few tiles is enough to read clearly as a border without eating into
// much explorable Foothills/Coast ground. SEA_BORDER_DEPTH is deliberately
// less than COAST_ROWS so a normal WATER band still exists between the
// beach and the SEA border, rather than SEA butting straight up against SAND.
const MOUNTAIN_BORDER_DEPTH = 3;
const SEA_BORDER_DEPTH = 4;
// Third border band, on the map's west edge (Woodland's outer edge - same
// "region's outer edge doubles as a map edge" reasoning as MOUNTAIN/SEA
// above). Same depth as MOUNTAIN so all three read as a consistent "map ends
// here" width. Confirmed by the player as intentionally impassable with no
// crossing mechanic (see isTileFree) - a pure map-boundary feature, not
// something a future bridge-like building is meant to span.
const RIVER_BORDER_DEPTH = 3;

function generateOverworldTerrain(rng) {
  const terrain = new Uint8Array(WORLD_W * WORLD_H);

  // Per-column jitter so the sand/water line reads as a natural coastline
  // rather than a perfectly straight edge.
  const coastJitter = new Array(WORLD_W);
  for (let x = 0; x < WORLD_W; x++) coastJitter[x] = randInt(rng, -2, 2);

  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const region = getRegionAt(x, y);
      let value;
      if (region.biome === 'coast') {
        const sandWaterLine = COAST_Y0 + 5 + coastJitter[x];
        value = y < sandWaterLine ? TERRAIN.SAND : TERRAIN.WATER;
      } else {
        const dirtChance = DIRT_CHANCE[region.biome] ?? 0.1;
        value = rng() < dirtChance ? TERRAIN.DIRT : TERRAIN.GRASS;
      }
      // Border bands: overwrite whatever the biome would otherwise put here
      // right at the map's outer edge with genuinely impassable terrain
      // (see isTileFree) - gives the world a natural-looking boundary
      // instead of just stopping at WORLD_W/WORLD_H with no explanation.
      if (region.id === 'foothills' && x >= WORLD_W - MOUNTAIN_BORDER_DEPTH) {
        value = TERRAIN.MOUNTAIN;
      } else if (region.id === 'coast' && y >= WORLD_H - SEA_BORDER_DEPTH) {
        value = TERRAIN.SEA;
      } else if (region.id === 'woodland' && x < RIVER_BORDER_DEPTH) {
        value = TERRAIN.RIVER;
      }
      terrain[y * WORLD_W + x] = value;
    }
  }
  return terrain;
}

function carveHomePlaza(terrain) {
  const r = 2;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = HOME_SPAWN.x + dx;
      const y = HOME_SPAWN.y + dy;
      if (x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H) terrain[y * WORLD_W + x] = TERRAIN.PATH;
    }
  }
}

function isNearHomeSpawn(x, y) {
  const dx = x - HOME_SPAWN.x;
  const dy = y - HOME_SPAWN.y;
  return dx * dx + dy * dy <= HOME_SAFE_RADIUS * HOME_SAFE_RADIUS;
}

// --- Streams & ponds -------------------------------------------------------
// Unlike the RIVER border band above, STREAM tiles are ordinary inland
// terrain - carved onto what would otherwise be GRASS/DIRT, before
// spawnResourceNodes ever runs, so a node simply never rolls onto one (that
// spawn pass already only targets GRASS/DIRT tiles - see its own comment).
// Carved (and, for ponds, kept clear of the home-spawn safe radius) before
// carveHomePlaza runs, so the home plaza's forced PATH tiles always win over
// any stream/pond that happened to land nearby - defensive, since a
// stream's max reach from RIVER_BORDER_DEPTH is well short of Meadow in
// practice, but cheap insurance against that changing later.
const STREAM_COUNT = [4, 6];
const STREAM_LENGTH = [15, 25];
const POND_COUNT = [4, 6];
const POND_SIZE = [3, 8];

// A thin, 1-tile-wide walk starting just past the river's inner edge and
// biased eastward (mostly straight east, occasional north/south meander) -
// same "random walk carves a path" spirit as the mine's carveMineTiles, but
// biased rather than uniform so a stream reads as flowing inland rather than
// wandering aimlessly. Only ever overwrites plain GRASS/DIRT, and stops the
// instant it would step onto anything else (another stream, the river band,
// a future built structure's terrain, map edge) rather than overwriting or
// crossing it.
function carveStream(rng, terrain, startX, startY) {
  let x = startX;
  let y = startY;
  const length = randInt(rng, STREAM_LENGTH[0], STREAM_LENGTH[1]);
  for (let i = 0; i < length; i++) {
    const roll = rng();
    const dx = roll < 0.7 ? 1 : 0;
    const dy = roll < 0.7 ? 0 : (roll < 0.85 ? -1 : 1);
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= WORLD_W || ny >= WORLD_H) break;
    const t = terrain[ny * WORLD_W + nx];
    if (t !== TERRAIN.GRASS && t !== TERRAIN.DIRT) break; // ran into special terrain - stop rather than overwrite/cross it
    terrain[ny * WORLD_W + nx] = TERRAIN.STREAM;
    x = nx;
    y = ny;
  }
}

// Small rounded blob grown from a single seed tile, same cluster-growth
// pattern as spawnMineNodes' ore veins (pick a random already-placed tile in
// the blob, try to grow one more tile off it) but simpler - no type/hp to
// track, just terrain. Capped attempt counts on both loops so a seed boxed
// in by other special terrain/map edges just yields a smaller pond instead
// of spinning forever.
function carvePond(rng, terrain, size) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const x = randInt(rng, 0, WORLD_W - 1);
    const y = randInt(rng, 0, COAST_Y0 - 1); // Meadow/Woodland/Foothills only - never on the Coast band
    if (isNearHomeSpawn(x, y)) continue;
    if (terrain[y * WORLD_W + x] !== TERRAIN.GRASS && terrain[y * WORLD_W + x] !== TERRAIN.DIRT) continue;

    terrain[y * WORLD_W + x] = TERRAIN.STREAM;
    const blob = [{ x, y }];
    let tries = 0;
    while (blob.length < size && tries < size * 20) {
      tries++;
      const from = choice(rng, blob);
      const [dx, dy] = choice(rng, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
      const nx = from.x + dx;
      const ny = from.y + dy;
      if (nx < 0 || ny < 0 || nx >= WORLD_W || ny >= COAST_Y0) continue;
      if (isNearHomeSpawn(nx, ny)) continue;
      if (terrain[ny * WORLD_W + nx] !== TERRAIN.GRASS && terrain[ny * WORLD_W + nx] !== TERRAIN.DIRT) continue;
      terrain[ny * WORLD_W + nx] = TERRAIN.STREAM;
      blob.push({ x: nx, y: ny });
    }
    return;
  }
}

function carveStreamsAndPonds(rng, terrain) {
  const streamCount = randInt(rng, STREAM_COUNT[0], STREAM_COUNT[1]);
  for (let i = 0; i < streamCount; i++) {
    const startY = randInt(rng, 0, COAST_Y0 - 1);
    carveStream(rng, terrain, RIVER_BORDER_DEPTH, startY);
  }

  const pondCount = randInt(rng, POND_COUNT[0], POND_COUNT[1]);
  for (let i = 0; i < pondCount; i++) {
    carvePond(rng, terrain, randInt(rng, POND_SIZE[0], POND_SIZE[1]));
  }
}

// --- Resource node spawning ------------------------------------------------
// [type, chance] pairs per biome, checked in order against one rng() roll
// per eligible tile (first match wins, remaining chance rolls over to the
// next entry) - so these read directly as "% of grass/dirt tiles in this
// biome that get a tree/bush/etc." Density numbers are a judgment call the
// design doc left open; Meadow is kept sparse on purpose (a calm starting
// area), Foothills carries the bulk of the ore.
const NODE_DENSITY = {
  meadow: [['tree', 0.02], ['berry_bush', 0.015], ['mushroom', 0.005], ['rock', 0.005]],
  woodland: [['tree', 0.12], ['berry_bush', 0.02], ['mushroom', 0.015], ['rock', 0.01]],
  foothills: [
    ['rock', 0.1], ['ore_copper', 0.03], ['ore_iron', 0.015],
    ['ore_gold', 0.004], ['gem', 0.002], ['mushroom', 0.02], ['tree', 0.015],
    // Same order of magnitude as mushroom's density here - plentiful enough
    // that the pottery loop is never clay-starved.
    ['clay_deposit', 0.02],
  ],
  coast: [],
};

function rollNodeType(rng, table) {
  let roll = rng();
  for (const [type, chance] of table) {
    if (roll < chance) return type;
    roll -= chance;
  }
  return null;
}

// { type, hp, maxHp } - deliberately NOT carrying a respawnAt/inert-hp-0
// state (see the harvest/respawn comment below on why depleted nodes are
// removed from the map entirely instead).
function makeNode(type) {
  const def = NODE_DEFS[type];
  return { type, hp: def.maxHp, maxHp: def.maxHp };
}

function spawnResourceNodes(rng, terrain) {
  const nodes = new Map();
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const t = terrain[y * WORLD_W + x];
      if (t !== TERRAIN.GRASS && t !== TERRAIN.DIRT) continue;
      if (isNearHomeSpawn(x, y)) continue;
      const region = getRegionAt(x, y);
      const table = NODE_DENSITY[region.biome];
      if (!table || table.length === 0) continue;
      const type = rollNodeType(rng, table);
      if (!type) continue;
      nodes.set(tileKey(x, y), makeNode(type));
    }
  }
  return nodes;
}

// Exactly one cave_entrance, somewhere in Foothills on open ground not
// already holding another node.
function placeCaveEntrance(rng, terrain, nodes) {
  const candidates = [];
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      if (getRegionAt(x, y).biome !== 'foothills') continue;
      const t = terrain[y * WORLD_W + x];
      if (t !== TERRAIN.GRASS && t !== TERRAIN.DIRT) continue;
      if (nodes.has(tileKey(x, y))) continue;
      candidates.push({ x, y });
    }
  }
  if (candidates.length === 0) return null;
  const spot = choice(rng, candidates);
  nodes.set(tileKey(spot.x, spot.y), makeNode('cave_entrance'));
  return spot;
}

// --- Mine generation -------------------------------------------------------
// Denser/richer than the overworld's Foothills table, and ore-only - the
// mine's walkable ground is plain "stone floor" (MINE_TILE.FLOOR), not a
// harvestable rock node; only ore/gem deposits dot the floor (and, since
// veins can grow onto it - see spawnMineNodes - MINE_TILE.DIRT).
//
// These are "vein seed" chances, not final per-tile odds: each hit grows
// into a small connected cluster (see spawnMineNodes) rather than a single
// tile, so the seed chance is set to roughly 1/3 of the old flat per-tile
// density (average cluster size is 1 seed + ~2 grown tiles) to keep overall
// ore density in the mine about the same as before this change - a coarse
// judgment call, not a precise conservation of the old numbers.
// coal_seam added per confirmed playtesting feedback (a dedicated mine coal
// source - see items.js's RESOURCE_NODE_YIELDS comment); seeded at a rate
// between copper and iron since it's meant to feel like a reliable supply
// resource, not a rare one.
const MINE_VEIN_SEED_DENSITY = [
  ['ore_copper', 0.035], ['coal_seam', 0.03], ['ore_iron', 0.02], ['ore_gold', 0.007], ['gem', 0.003],
];

const MINE_DIRS = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];

// Of the WALL tiles left over right around the carved corridor, this
// fraction become DIRT instead - packed overburden the player can dig
// through (World.clearMineDirt) rather than permanent rock. CONFIRMED
// PLAYTESTING FEEDBACK: raised both the radius and chance substantially
// (was 1 tile / 60%) so most of the ground flanking the corridor is now
// diggable rather than a thin fringe - every resource node now seeds
// exclusively on DIRT (see spawnMineNodes below), so there needs to be
// enough of it that veins have somewhere to actually hide and grow.
const MINE_DIRT_CHANCE = 0.85;
const MINE_DIRT_RADIUS = 3; // how close to a carved FLOOR tile a WALL tile must be to be eligible

function carveMineTiles(rng) {
  const tiles = new Uint8Array(MINE_W * MINE_H).fill(MINE_TILE.WALL);
  let x = 1;
  let y = Math.floor(MINE_H / 2);
  tiles[y * MINE_W + x] = MINE_TILE.FLOOR;
  const entrance = { x, y };

  // Drunkard's walk: guarantees every carved tile is reachable from the
  // entrance by construction (each step only ever moves to an
  // already-adjacent-to-carved tile), which a room-and-corridor generator
  // would need extra connectivity checks to guarantee.
  const steps = Math.floor(MINE_W * MINE_H * 1.1);
  for (let i = 0; i < steps; i++) {
    const dir = MINE_DIRS[Math.floor(rng() * 4)];
    x = clamp(x + dir.dx, 1, MINE_W - 2);
    y = clamp(y + dir.dy, 1, MINE_H - 2);
    tiles[y * MINE_W + x] = MINE_TILE.FLOOR;
  }

  // The exit is just the walk's final (already-FLOOR) tile - no fourth grid
  // code, see the MINE_TILE comment above. Its coordinates are the sole
  // record of "this is the exit"; isMineExit() below checks against them.
  const exit = { x, y };

  // Wrap the carved corridor in a band of DIRT: any WALL tile within
  // MINE_DIRT_RADIUS of a FLOOR tile is eligible, and MINE_DIRT_CHANCE of
  // those flip to DIRT. Done as a second pass over the finished FLOOR
  // layout (rather than during the walk) so "near the path" means near the
  // path's final shape, not near wherever the walk happened to be at that
  // step.
  for (let ty = 0; ty < MINE_H; ty++) {
    for (let tx = 0; tx < MINE_W; tx++) {
      if (tiles[ty * MINE_W + tx] !== MINE_TILE.WALL) continue;
      let nearFloor = false;
      for (let dy = -MINE_DIRT_RADIUS; dy <= MINE_DIRT_RADIUS && !nearFloor; dy++) {
        for (let dx = -MINE_DIRT_RADIUS; dx <= MINE_DIRT_RADIUS; dx++) {
          const nx = tx + dx;
          const ny = ty + dy;
          if (nx < 0 || ny < 0 || nx >= MINE_W || ny >= MINE_H) continue;
          if (tiles[ny * MINE_W + nx] === MINE_TILE.FLOOR) { nearFloor = true; break; }
        }
      }
      if (nearFloor && rng() < MINE_DIRT_CHANCE) tiles[ty * MINE_W + tx] = MINE_TILE.DIRT;
    }
  }

  return { tiles, entrance, exit };
}

// Ore/coal/gem veins are grown as small connected clusters instead of an
// independent per-tile roll, so finding one reads as a discovery rather
// than every tile being its own coin-flip.
//
// CONFIRMED PLAYTESTING REQUEST: both the seed AND every grown tile are now
// restricted to DIRT only (never FLOOR) - previously a seed could land on
// already-open corridor floor, meaning part of a vein was sometimes visible
// the instant the mine loaded, with no digging required at all. Now a whole
// cluster stays entirely under dirt from the moment it's generated, so
// there is no resource anywhere in the mine that doesn't require clearing
// at least the one dirt tile it's sitting on first - render.js's
// drawResourceNodes also needs the covering tile to still be DIRT to skip
// drawing a node at all (see main.js's isCoveredFn), so this generation
// change and that rendering change only work correctly together.
function spawnMineNodes(rng, tiles, entrance, exit) {
  const nodes = new Map();
  const isEndpoint = (x, y) => (x === entrance.x && y === entrance.y) || (x === exit.x && y === exit.y);
  const isGrowable = (x, y) => {
    if (x < 0 || y < 0 || x >= MINE_W || y >= MINE_H) return false;
    if (tiles[y * MINE_W + x] !== MINE_TILE.DIRT) return false;
    if (isEndpoint(x, y)) return false;
    return !nodes.has(tileKey(x, y));
  };

  for (let y = 0; y < MINE_H; y++) {
    for (let x = 0; x < MINE_W; x++) {
      if (tiles[y * MINE_W + x] !== MINE_TILE.DIRT) continue;
      if (isEndpoint(x, y)) continue; // keep the entrance and exit tiles clear to stand on
      if (nodes.has(tileKey(x, y))) continue;
      const type = rollNodeType(rng, MINE_VEIN_SEED_DENSITY);
      if (!type) continue;
      nodes.set(tileKey(x, y), makeNode(type));

      // Grow 1-3 more tiles of the same type outward from the seed (and
      // from tiles the vein has already grown into), picking a random
      // eligible neighbor each step.
      const growTarget = randInt(rng, 1, 3);
      const frontier = [{ x, y }];
      for (let grown = 0; grown < growTarget; grown++) {
        const from = choice(rng, frontier);
        const candidates = MINE_DIRS
          .map((d) => ({ x: from.x + d.dx, y: from.y + d.dy }))
          .filter((p) => isGrowable(p.x, p.y));
        if (candidates.length === 0) continue; // this branch is boxed in - vein just ends up smaller than growTarget
        const next = choice(rng, candidates);
        nodes.set(tileKey(next.x, next.y), makeNode(type));
        frontier.push(next);
      }
    }
  }
  return nodes;
}

// CONFIRMED BUG (found via playtesting): carveMineTiles produces a single-
// tile-wide corridor with no branches, so ANY node placed on it blocks
// through-traffic - and spawnMineNodes/vein-clustering happily seeds
// ore_iron (needs pickaxe tier 2) or ore_gold (tier 3) on it with no
// awareness that a fresh player only has tier 1. That can wall off the exit
// completely, with no tool tier able to clear it. This guarantees a route
// from entrance to exit that a tier-1 pickaxe can always eventually clear
// (digging through any DIRT on the way needs no tier at all): first finds
// ANY path using only tile type (ignoring nodes entirely - carveMineTiles's
// walk already guarantees one exists), then strips any tier>1-gated node
// sitting on that specific path back to open ground. Ore elsewhere off that
// one path is untouched, so clustered veins can still legitimately gate
// progress deeper into the level - just never on the one guaranteed route.
function ensureTier1Path(tiles, nodes, entrance, exit) {
  const key = (x, y) => `${x},${y}`;
  const passableTile = (x, y) => {
    if (x < 0 || y < 0 || x >= MINE_W || y >= MINE_H) return false;
    return tiles[y * MINE_W + x] !== MINE_TILE.WALL;
  };

  const cameFrom = new Map();
  const visited = new Set([key(entrance.x, entrance.y)]);
  const queue = [entrance];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.x === exit.x && cur.y === exit.y) break;
    for (const d of MINE_DIRS) {
      const nx = cur.x + d.dx;
      const ny = cur.y + d.dy;
      if (!passableTile(nx, ny) || visited.has(key(nx, ny))) continue;
      visited.add(key(nx, ny));
      cameFrom.set(key(nx, ny), cur);
      queue.push({ x: nx, y: ny });
    }
  }
  if (!visited.has(key(exit.x, exit.y))) return; // shouldn't happen - carveMineTiles guarantees this

  let cur = exit;
  while (cur) {
    const nodeKey = key(cur.x, cur.y);
    const node = nodes.get(nodeKey);
    if (node && (ORE_MIN_TIER[node.type] || 1) > 1) nodes.delete(nodeKey);
    cur = cameFrom.get(nodeKey);
  }
}

function serializeMineLevel(level) {
  return {
    level: level.level,
    width: level.width,
    height: level.height,
    tiles: Array.from(level.tiles),
    nodes: Array.from(level.nodes.entries()),
    respawns: Array.from(level.respawns.entries()),
    entrance: level.entrance,
    exit: level.exit,
  };
}

function deserializeMineLevel(data) {
  return {
    level: data.level,
    width: data.width,
    height: data.height,
    tiles: Uint8Array.from(data.tiles),
    nodes: new Map(data.nodes),
    respawns: new Map(data.respawns || []),
    entrance: data.entrance,
    exit: data.exit,
  };
}

// Shared by harvestNode/harvestMineNode: both just aim it at a matched pair
// of {nodes, respawns} Maps (overworld's own pair, or one mine level's).
//
// Return contract matches actions.js's actual usage exactly (it only ever
// does `if (!result) return false; inventory.addItem(result.item,
// result.qty)`): falsy for "nothing to collect from this swing" - no node
// here, an already-depleted-and-respawning node, or a valid swing that
// didn't break the node yet - and a flat `{item, qty, bonus}` only on the
// swing that depletes it. `bonus` is `{item, qty} | null` - rock's small
// chance of an extra coal per items.js's RESOURCE_NODE_YIELDS.bonus; kept
// as an additive field actions.js can ignore today and wire up later,
// exactly like tool-tier gating below is a defensive re-check since
// actions.js already gates on items.js's ORE_MIN_TIER itself before ever
// calling this.
// Overworld-only respawn timers for otherwise-non-respawning ore types (see
// NODE_DEFS's comment above) - long enough that ore still feels genuinely
// scarce/valuable, but short enough that a depleted patch of Foothills is
// worth returning to on a later playthrough day rather than a permanent
// dead zone. Not applied to gem here since gems get their own, longer timer
// (they're confirmed the rarest node type by density - see spawn tables).
const OVERWORLD_ORE_RESPAWN_DAYS = {
  ore_copper: 15, ore_iron: 25, ore_gold: 40, gem: 60,
};

function harvestFromMap(nodesMap, respawnsMap, key, toolTier, currentDay, bonusPower = 0, respawnOverrides = null) {
  const node = nodesMap.get(key);
  if (!node) return null;
  const def = NODE_DEFS[node.type];
  if (!def || !def.harvestable) return null;

  const minTier = ORE_MIN_TIER[node.type] || 1;
  if (toolTier < minTier) return null;

  // bonusPower is additive on top of the tool tier's base power - the
  // `mining_power` food buff (items.js) adds flat power for its duration
  // rather than bumping the effective tier, so it helps every ore equally
  // without ever satisfying ORE_MIN_TIER gating on its own (a buffed tier-1
  // pickaxe still can't scratch iron - see actions.js's harvestNodeAction,
  // which checks the *unbuffed* tier against ORE_MIN_TIER before this ever
  // runs).
  const power = (TOOL_TIER_POWER[toolTier] || TOOL_TIER_POWER[1] || 1) + bonusPower;
  node.hp -= power;
  if (node.hp > 0) return null; // valid swing, node survives - nothing to report yet

  nodesMap.delete(key); // depleted: gone from the visible/interactable map...
  const respawnDays = respawnOverrides?.[node.type] ?? def.respawnDays;
  if (respawnDays) {
    respawnsMap.set(key, { type: node.type, respawnAt: currentDay + respawnDays }); // ...until this day arrives
  }

  const yieldDef = RESOURCE_NODE_YIELDS[node.type];
  const result = { item: yieldDef.item, qty: randRange(yieldDef.minQty, yieldDef.maxQty), bonus: null };
  if (yieldDef.bonus && Math.random() < yieldDef.bonus.chance) {
    result.bonus = { item: yieldDef.bonus.item, qty: yieldDef.bonus.qty };
  }
  return result;
}

// --- World --------------------------------------------------------------
export class World {
  // Takes the shared event bus explicitly (never a module-level singleton -
  // see utils.js's createEventBus doc comment) so World stays instantiable
  // in isolation; it only ever listens (`day_advanced`, to drive respawns),
  // never emits - actions.js is the one place gameplay events are emitted
  // from, per the design doc's description of it as the glue/emit layer.
  constructor(eventBus, seed = Date.now()) {
    this.bus = eventBus || null;
    this.seed = seed;
    this.currentDay = 0;

    const rng = createRng(seed);
    this.terrain = generateOverworldTerrain(rng);
    carveStreamsAndPonds(rng, this.terrain);
    carveHomePlaza(this.terrain);
    this.nodes = spawnResourceNodes(rng, this.terrain);
    this.caveEntrance = placeCaveEntrance(rng, this.terrain, this.nodes);
    this.respawns = new Map(); // "x,y" -> {type, respawnAt} - see harvestFromMap's comment

    this.buildings = new Map(); // "x,y" -> live building instance (has draw()/tick())
    this.mineLevels = []; // MINE_LEVELS from the design doc; grown by generateMine()
    // See setFarmPlotGuard() - defaults to "never occupied" so World stays
    // fully instantiable/testable on its own without a farming.js instance.
    this._isFarmPlotOccupied = () => false;

    if (this.bus) this.bus.on('day_advanced', (payload) => this._onDayAdvanced(payload.day));
  }

  // Lets main.js tell World "don't respawn a node onto a tile farming.js is
  // actively using" without World importing farming.js directly (same
  // predicate-injection pattern player.js already uses for isTileFree, per
  // the design contract's decoupling rule). Confirmed bug this fixes: a
  // depleted tree/rock respawning on a tile the player had since tilled and
  // planted, silently burying the crop since world.js had no way to know
  // farming.js's plot map existed.
  setFarmPlotGuard(isFarmPlotOccupiedFn) {
    this._isFarmPlotOccupied = isFarmPlotOccupiedFn || (() => false);
  }

  _onDayAdvanced(day) {
    this.currentDay = day;
    this._respawnDue(this.nodes, this.respawns, day);
    for (const level of this.mineLevels) this._respawnDue(level.nodes, level.respawns, day);
  }

  _respawnDue(nodesMap, respawnsMap, day) {
    for (const [key, pending] of respawnsMap) {
      if (day < pending.respawnAt) continue;
      const [xs, ys] = key.split(',');
      if (this._isFarmPlotOccupied(Number(xs), Number(ys))) continue; // still farmed - retry next day rather than bury the crop
      nodesMap.set(key, makeNode(pending.type));
      respawnsMap.delete(key);
    }
  }

  // --- Overworld queries --------------------------------------------------
  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H;
  }

  getTerrain(x, y) {
    return this.inBounds(x, y) ? this.terrain[y * WORLD_W + x] : null;
  }

  setTerrain(x, y, terrain) {
    if (!this.inBounds(x, y)) return false;
    this.terrain[y * WORLD_W + x] = terrain;
    return true;
  }

  // Depleted nodes are removed from `this.nodes` outright (see
  // harvestFromMap), so a plain Map lookup is already "not here" during a
  // respawn wait - no hp check needed.
  getNodeAt(x, y) {
    return this.nodes.get(tileKey(x, y)) || null;
  }

  getBuildingAt(x, y) {
    return this.buildings.get(tileKey(x, y)) || null;
  }

  // render.js's drawBuildings takes a plain array, not this Map - see its
  // doc comment on `buildings: array of instances...`.
  getAllBuildings() {
    return Array.from(this.buildings.values());
  }

  // Movement/placement occupancy check (player collision, ghost validity).
  // Plain water blocks unless a non-solid bridge building sits on it - the
  // one case where a building changes what's normally impassable terrain.
  // MOUNTAIN/SEA/RIVER (the map's border bands - see generateOverworldTerrain)
  // are unconditionally impassable, unlike WATER: they're the edge of the
  // playable world, not a gap a bridge is ever meant to span. STREAM
  // (inland branches/ponds off the river) is deliberately NOT in this list -
  // confirmed player requirement that streams stay freely walkable.
  isTileFree(x, y) {
    if (!this.inBounds(x, y)) return false;
    const terrain = this.getTerrain(x, y);
    if (terrain === TERRAIN.MOUNTAIN || terrain === TERRAIN.SEA || terrain === TERRAIN.RIVER) return false;
    const building = this.getBuildingAt(x, y);
    if (terrain === TERRAIN.WATER) {
      return !!building && building.solid === false;
    }
    if (building && building.solid) return false;
    const node = this.getNodeAt(x, y);
    if (node && NODE_DEFS[node.type]?.blocking) return false;
    return true;
  }

  // Can this tile be tilled? Grass/dirt only, and only if nothing else is
  // already sitting on it.
  isTileFarmable(x, y) {
    if (!this.inBounds(x, y)) return false;
    const terrain = this.getTerrain(x, y);
    if (terrain !== TERRAIN.GRASS && terrain !== TERRAIN.DIRT) return false;
    if (this.getBuildingAt(x, y)) return false;
    if (this.getNodeAt(x, y)) return false;
    return true;
  }

  // Can a watering can be refilled standing at/on this tile? Any of the
  // game's three water-bearing terrain codes qualify - the Coast's WATER,
  // the west-edge RIVER border, and inland STREAM branches/ponds - refilling
  // doesn't care which one it is, only that it's water.
  isWaterSource(x, y) {
    const terrain = this.getTerrain(x, y);
    return terrain === TERRAIN.WATER || terrain === TERRAIN.RIVER || terrain === TERRAIN.STREAM;
  }

  // `instance` is whatever buildings.js#createBuilding returned (already has
  // x/y/type/solid/draw/tick). This only checks tile validity - cost
  // affordability is checked by the caller (actions.js/buildings.js) before
  // ever calling this, per the design doc. A bridge is the one type allowed
  // (indeed required) to land on water; everything else needs dry, node-free
  // ground. Coupling to the literal 'bridge' id is a small, deliberate
  // exception to keep that one rule here rather than inventing a third
  // "isTileBuildable" predicate the design doc never asked for.
  //
  // NOTE for the integration pass: buildings.js's tryPlaceBuilding calls
  // `world.isTileFree(x, y)` as a pre-check before ever calling this, on the
  // documented assumption that isTileFree "means... independent of terrain".
  // It isn't - see isTileFree above, which correctly blocks plain water for
  // player-movement collision (player.js wires that same predicate straight
  // into movePlayer). That pre-check will therefore always reject a bridge
  // on virgin water before placeBuilding ever runs. Fix belongs in
  // buildings.js (drop that pre-check, or skip it for type === 'bridge') -
  // not patched here since buildings.js is outside this module's ownership.
  placeBuilding(instance) {
    if (!instance || !this.inBounds(instance.x, instance.y)) return false;
    if (this.getBuildingAt(instance.x, instance.y)) return false;
    const terrain = this.getTerrain(instance.x, instance.y);
    if (instance.type === 'bridge') {
      if (terrain !== TERRAIN.WATER) return false;
    } else {
      if (terrain === TERRAIN.WATER) return false;
      if (this.getNodeAt(instance.x, instance.y)) return false;
    }
    this.buildings.set(tileKey(instance.x, instance.y), instance);
    return true;
  }

  removeBuilding(x, y) {
    const key = tileKey(x, y);
    const building = this.buildings.get(key) || null;
    this.buildings.delete(key);
    return building;
  }

  // Returns falsy unless this swing depletes the node - see harvestFromMap's
  // comment for the exact contract (matches actions.js's real usage).
  // Overworld-only: passes OVERWORLD_ORE_RESPAWN_DAYS so ore slowly regrows
  // here even though NODE_DEFS itself says never (mine ore stays permanent -
  // see harvestMineNode below, which never passes this).
  harvestNode(x, y, toolTier, bonusPower = 0) {
    return harvestFromMap(
      this.nodes, this.respawns, tileKey(x, y), toolTier, this.currentDay, bonusPower,
      OVERWORLD_ORE_RESPAWN_DAYS,
    );
  }

  // --- Mine ----------------------------------------------------------------
  // The design doc's harvestNode/isTileFree signatures (x, y, toolTier) have
  // no room for "which level" - they're specified purely in terms of the
  // overworld grid. Rather than smuggling an implicit "current location"
  // mode into World (which would mean isTileFree(x, y) means two different
  // things depending on unseen prior state - exactly the kind of hidden,
  // unserializable state the design doc warns against), the mine gets its
  // own explicitly-parallel method set. main.js's state machine already
  // knows whether the player is in the overworld or a mine level, so it (via
  // player.js/actions.js) is what picks which set to call.
  generateMine(seed) {
    const rng = createRng(seed);
    const { tiles, entrance, exit } = carveMineTiles(rng);
    const nodes = spawnMineNodes(rng, tiles, entrance, exit);
    ensureTier1Path(tiles, nodes, entrance, exit);
    const level = {
      level: this.mineLevels.length + 1,
      width: MINE_W,
      height: MINE_H,
      tiles,
      nodes,
      respawns: new Map(), // always stays empty in practice (mine nodes are ore-only, never respawn) - kept for symmetry with the overworld and so a future level design that adds a respawning type isn't a structural change
      entrance,
      exit,
    };
    this.mineLevels.push(level);
    return level;
  }

  getMineLevel(index = 0) {
    return this.mineLevels[index] || null;
  }

  getMineTile(levelIndex, x, y) {
    const level = this.mineLevels[levelIndex];
    if (!level || x < 0 || y < 0 || x >= level.width || y >= level.height) return null;
    return level.tiles[y * level.width + x];
  }

  isMineExit(levelIndex, x, y) {
    const level = this.mineLevels[levelIndex];
    return !!level && level.exit.x === x && level.exit.y === y;
  }

  getMineNodeAt(levelIndex, x, y) {
    const level = this.mineLevels[levelIndex];
    if (!level) return null;
    return level.nodes.get(tileKey(x, y)) || null;
  }

  // DIRT blocks the same as WALL until dug out (see clearMineDirt) - unlike
  // WALL it's temporary, but until it's cleared a player can't walk through
  // or past it, so it has to fail this check exactly like WALL does.
  isMineTileFree(levelIndex, x, y) {
    const tile = this.getMineTile(levelIndex, x, y);
    if (tile === null || tile === MINE_TILE.WALL || tile === MINE_TILE.DIRT) return false;
    const node = this.getMineNodeAt(levelIndex, x, y);
    if (node && NODE_DEFS[node.type]?.blocking) return false;
    return true;
  }

  // Digs out one DIRT tile down to FLOOR. Returns true if this tile was
  // actually DIRT (and so is now clear), false otherwise (already FLOOR,
  // still WALL, or out of bounds/level) - mirrors removeBuilding's style of
  // a single tile mutation with no other side effects; any node that had
  // grown onto this tile (see spawnMineNodes) is untouched and becomes
  // reachable/visible now that the dirt above it is gone.
  clearMineDirt(levelIndex, x, y) {
    const level = this.mineLevels[levelIndex];
    if (!level || x < 0 || y < 0 || x >= level.width || y >= level.height) return false;
    const idx = y * level.width + x;
    if (level.tiles[idx] !== MINE_TILE.DIRT) return false;
    level.tiles[idx] = MINE_TILE.FLOOR;
    return true;
  }

  // Returns falsy unless this swing depletes the node - see harvestFromMap's
  // comment for the exact contract.
  harvestMineNode(levelIndex, x, y, toolTier, bonusPower = 0) {
    const level = this.mineLevels[levelIndex];
    if (!level) return null;
    return harvestFromMap(level.nodes, level.respawns, tileKey(x, y), toolTier, this.currentDay, bonusPower);
  }

  // --- Save/load -----------------------------------------------------------
  // Building instances carry live draw()/tick() functions and can't be
  // JSON-serialized (same reasoning as driftworks' Grid.serialize) - only
  // plain {type, x, y} descriptors are persisted. loadState() mirrors that:
  // it restores everything it can restore by itself and hands back the
  // building descriptors so main.js's load path can reconstruct each one via
  // buildings.js#createBuilding and re-place it with placeBuilding(), the
  // same path a fresh placement takes.
  serialize() {
    return {
      seed: this.seed,
      day: this.currentDay,
      terrain: Array.from(this.terrain),
      nodes: Array.from(this.nodes.entries()),
      respawns: Array.from(this.respawns.entries()),
      caveEntrance: this.caveEntrance,
      buildings: Array.from(this.buildings.values()).map((b) => ({ type: b.type, x: b.x, y: b.y })),
      mineLevels: this.mineLevels.map(serializeMineLevel),
    };
  }

  // Returns the building descriptor list - see serialize()'s comment above.
  loadState(data) {
    this.currentDay = data.day || 0;
    this.terrain = Uint8Array.from(data.terrain);
    this.nodes = new Map(data.nodes);
    this.respawns = new Map(data.respawns || []);
    if (data.caveEntrance) this.caveEntrance = data.caveEntrance;
    this.mineLevels = (data.mineLevels || []).map(deserializeMineLevel);
    this.buildings = new Map();
    return data.buildings || [];
  }
}
