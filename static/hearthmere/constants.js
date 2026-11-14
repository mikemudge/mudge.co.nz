// Hearthmere — shared data tables.
//
// Root of the dependency graph: this file imports nothing, touches no DOM and
// has no side effects, so every other module (and the headless QA harness) can
// import it freely. Data only — the lookup maps at the bottom are built from
// the tables above them and contain no game rules.
//
// Numbers here are the balance surface. DESIGN.md freezes building ids, names,
// categories, footprints, tiers, job counts and role strings; everything else
// (costs, times, yields, colours) is owned here.

/* ------------------------------------------------------------------ *
 * §3  Grid, projection, time
 * ------------------------------------------------------------------ */

export const GRID_W = 72;
export const GRID_H = 72;
export const TILE_W = 64;
export const TILE_H = 32;
export const MIN_ZOOM = 0.35;
export const MAX_ZOOM = 2.4;

// 8-way, index 0 = East, clockwise in tile space: 0:E 1:SE 2:S 3:SW 4:W 5:NW 6:N 7:NE
export const DIR_DX = [1, 1, 0, -1, -1, -1, 0, 1];
export const DIR_DY = [0, 1, 1, 1, 0, -1, -1, -1];
export const OPPOSITE = [4, 5, 6, 7, 0, 1, 2, 3];

// A gatherer's day is dominated by travel: a hunter's round trip alone is ~58
// game-seconds, so the working day has to be long enough to hold one (§5, M2).
export const DAY_SECONDS = 100;

// Daylight is [NIGHT_END, NIGHT_START] of the day fraction — the window in
// which buildings work and villagers are out. Anything that dims the map or
// stops a work loop reads these, so the visual night and the economic night
// cannot drift apart.
export const NIGHT_END = 0.18;
export const NIGHT_START = 0.92;
export const SEASON_DAYS = 12;
export const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'];
export const SEASON_SPRING = 0;
export const SEASON_SUMMER = 1;
export const SEASON_AUTUMN = 2;
export const SEASON_WINTER = 3;
export const DAYS_PER_YEAR = SEASON_DAYS * 4;

// Index is the speed setting itself; `dt` is pre-multiplied by this in main.js.
// A 6x is offered because a 12-day season at DAY_SECONDS=100 is ~6.7 real
// minutes at 3x, so a player who has dealt with their alerts spends a long
// while watching. DAY_SECONDS itself stays at 100 — ADDENDUM M2 raised it so
// a gatherer's round trip fits inside the working day, and shortening the day
// again would reopen that. Let the player skip time instead.
export const SPEEDS = [0, 1, 2, 3, 6];

/* ------------------------------------------------------------------ *
 * §5-§10  Tuning constants
 * ------------------------------------------------------------------ */

export const MAX_VILLAGERS = 220;
export const VILLAGER_TICK_SPLIT = 3;
/**
 * W2 — a load must clear more than a gather trip creates, or collection can
 * never catch a working hut up: a forager brings home a 10-unit basket per
 * trip into an `outputCap` of 40. This empties a half-full hut in one haul.
 */
export const CARRY_CAP = 24;
export const FOOD_PER_DAY = 1.0;
export const WINTER_FOOD_MULT = 1.25;
export const BIRTH_CHANCE = 0.06;
// `buildTime` is builder-seconds of work after a site's materials land, so a
// three-builder crew clears it in buildTime/3 seconds against a 74-second
// working day. Expansion is paced here rather than in the gather rates: a town
// is never short of a material (it banks ~200 wood at a normal building
// cadence), so gathering does not gate how fast a village grows, while
// buildTime costs in-game days directly. Wood is also upstream of plank and of
// every food hut, so cutting it cuts food breadth rather than expansion.
export const BUILD_RATE = 1.0;          // builder-seconds added per real second, per builder
export const UNEMPLOYED_BUILD_RATE = 0.6;
export const HAND_GATHER_SECONDS = 8;   // §16.1, seconds per 1 wood gathered by hand
export const PATH_NODE_BUDGET = 4000;
export const PATH_CALLS_PER_TICK = 40;
export const TASK_REBUILD_INTERVAL = 1.0;
export const TASK_TIMEOUT = 120;
export const FLEE_RADIUS = 6;
export const SOLDIER_RESPONSE = 25;
export const RAID_MAX_SECONDS = 180;

export const ROAD_NONE = 0;
export const ROAD_DIRT = 1;
export const ROAD_COBBLE = 2;

/* ------------------------------------------------------------------ *
 * §5  Terrain
 * ------------------------------------------------------------------ */

export const TERRAIN = {
  WATER: 0, SHORE: 1, SAND: 2, GRASS: 3, MEADOW: 4, FOREST: 5, ROCK: 6, MOUNTAIN: 7,
};

export const RESOURCE = {
  NONE: 0, TREE: 1, STONE: 2, IRON: 3, CLAY: 4, BERRY: 5, HERB: 6, FISH: 7, GAME: 8,
};

// Painted-dusk palette: sage / ochre / slate, all desaturated. `colour` is the
// top face of the diamond, `colourAlt` the seeded darker variation render mixes
// in so the ground never reads as a flat lattice.
export const TERRAIN_INFO = [
  { t: 0, name: 'Water',    walkable: false, buildable: false, farmMult: 0,   moveSpeed: 0,    colour: '#3f5a6b', colourAlt: '#36505f' },
  { t: 1, name: 'Shallows', walkable: false, buildable: false, farmMult: 0,   moveSpeed: 0,    colour: '#6d92a0', colourAlt: '#5f8493' },
  { t: 2, name: 'Sand',     walkable: true,  buildable: true,  farmMult: 0.5, moveSpeed: 0.85, colour: '#cbb489', colourAlt: '#bda67c' },
  { t: 3, name: 'Grass',    walkable: true,  buildable: true,  farmMult: 1.0, moveSpeed: 0.85, colour: '#7d9463', colourAlt: '#70875a' },
  { t: 4, name: 'Meadow',   walkable: true,  buildable: true,  farmMult: 1.5, moveSpeed: 0.85, colour: '#96a568', colourAlt: '#89985d' },
  { t: 5, name: 'Forest',   walkable: true,  buildable: false, farmMult: 0,   moveSpeed: 0.60, colour: '#4f6b4c', colourAlt: '#446043' },
  { t: 6, name: 'Rock',     walkable: true,  buildable: false, farmMult: 0,   moveSpeed: 0.65, colour: '#8c8b85', colourAlt: '#7d7c77' },
  { t: 7, name: 'Mountain', walkable: false, buildable: false, farmMult: 0,   moveSpeed: 0,    colour: '#6e6a68', colourAlt: '#5e5b59' },
];

// Low to high: the higher type's diamond is drawn clipped to a ragged edge over
// the lower one, so shorelines and forest edges are organic (§1, art direction).
export const TERRAIN_BLEND_PRIORITY = [
  TERRAIN.WATER, TERRAIN.SAND, TERRAIN.GRASS, TERRAIN.MEADOW, TERRAIN.FOREST, TERRAIN.ROCK,
];

export const RESOURCE_INFO = [
  { r: 0, name: '',         item: '',         start: 0,   regrow: 0, cap: 0,   colour: '#000000' },
  { r: 1, name: 'Trees',    item: 'wood',     start: 40,  regrow: 1, cap: 40,  colour: '#3f5c3e' },
  { r: 2, name: 'Stone',    item: 'stone',    start: 400, regrow: 0, cap: 400, colour: '#9a9a93' },
  { r: 3, name: 'Iron ore', item: 'iron_ore', start: 250, regrow: 0, cap: 250, colour: '#7d6a5c' },
  { r: 4, name: 'Clay',     item: 'clay',     start: 300, regrow: 0, cap: 300, colour: '#b07a55' },
  { r: 5, name: 'Berries',  item: 'berries',  start: 30,  regrow: 3, cap: 30,  colour: '#8e4a5e' },
  { r: 6, name: 'Herbs',    item: 'herbs',    start: 25,  regrow: 2, cap: 25,  colour: '#6f9a5e' },
  { r: 7, name: 'Fish',     item: 'fish',     start: 60,  regrow: 4, cap: 60,  colour: '#7fa3b3' },
  { r: 8, name: 'Game',     item: 'venison',  start: 25,  regrow: 2, cap: 25,  colour: '#8b4a3c' },
];

/* ------------------------------------------------------------------ *
 * §6  Movement speed (tiles/sec)
 * ------------------------------------------------------------------ */

// Off-road always works, it is just ~2x slower. Roads are the optimisation
// problem; they are never a correctness requirement for *travel* (§16).
// ROAD_COBBLE must stay the fastest tile in the game -- FASTEST_SPEED is
// normalised against it and A*'s octile heuristic is only admissible while the
// cheapest tile costs exactly 1 (ADDENDUM C).
export const MOVE_SPEED = {
  // indexed by world.road: 0 none, 1 dirt, 2 cobble
  road: [0, 1.15, 1.55],
  // indexed by TERRAIN; 0 means impassable
  terrain: [0, 0, 0.85, 0.85, 0.85, 0.60, 0.65, 0],
};

// The fastest tile in the game (cobbled road). Path costs are normalised
// against it so the cheapest tile costs exactly 1.0 and utils.octile stays
// admissible -- see DESIGN.md ADDENDUM C.
export const FASTEST_SPEED = 1.55;

/** A* cost for a tile. Never used to move a villager -- that uses speedFor(). */
export function moveCostFor(road, terrain) {
  const s = speedFor(road, terrain);
  return s > 0 ? FASTEST_SPEED / s : Infinity;
}

export const MOVE_SPEED_ROAD = MOVE_SPEED.road;
export const MOVE_SPEED_TERRAIN = MOVE_SPEED.terrain;

/** Tiles/sec for a tile. Road beats terrain whenever a road is present. */
export function speedFor(road, terrain) {
  if (road > 0) return MOVE_SPEED.road[road] || MOVE_SPEED.road[1];
  return MOVE_SPEED.terrain[terrain] || 0;
}

/* ------------------------------------------------------------------ *
 * §4  Items
 * ------------------------------------------------------------------ */

// `value` is the Trading Post sell price. Every processing step is priced above
// the sum of its inputs so chains pay; foods additionally gain nutrition
// (4 grain = 2.4 units becomes 4 bread = 6.4 units).
const ITEM_LIST = [
  // --- goods -------------------------------------------------------
  { id: 'wood',      name: 'Timber',        cls: 'good', category: 'raw',      tier: 1, value: 2,   stackWeight: 1,   colour: '#8a6a43', icon: '🪵' },
  { id: 'plank',     name: 'Planks',        cls: 'good', category: 'material', tier: 1, value: 6,   stackWeight: 1,   colour: '#c19a63', icon: '🟫' },
  { id: 'stone',     name: 'Stone',         cls: 'good', category: 'raw',      tier: 1, value: 3,   stackWeight: 2,   colour: '#9a9a93', icon: '🪨' },
  { id: 'clay',      name: 'Clay',          cls: 'good', category: 'raw',      tier: 2, value: 2,   stackWeight: 2,   colour: '#b07a55', icon: '🟠' },
  { id: 'brick',     name: 'Bricks',        cls: 'good', category: 'material', tier: 2, value: 14,  stackWeight: 2,   colour: '#a45a45', icon: '🧱' },
  { id: 'charcoal',  name: 'Charcoal',      cls: 'good', category: 'material', tier: 2, value: 8,   stackWeight: 1,   colour: '#3a3532', icon: '⬛' },
  { id: 'iron_ore',  name: 'Iron Ore',      cls: 'good', category: 'raw',      tier: 3, value: 5,   stackWeight: 2,   colour: '#7d6a5c', icon: '⛰️' },
  { id: 'iron',      name: 'Iron',          cls: 'good', category: 'metal',    tier: 3, value: 20,  stackWeight: 2,   colour: '#8e959c', icon: '⚙️' },
  { id: 'steel',     name: 'Steel',         cls: 'good', category: 'metal',    tier: 4, value: 68,  stackWeight: 2,   colour: '#b9c2cb', icon: '🔩' },
  { id: 'tools',     name: 'Tools',         cls: 'good', category: 'tool',     tier: 3, value: 32,  stackWeight: 1,   colour: '#6f7c86', icon: '🔨' },
  { id: 'wool',      name: 'Wool',          cls: 'good', category: 'raw',      tier: 2, value: 4,   stackWeight: 1,   colour: '#e3ded0', icon: '🐑' },
  { id: 'cloth',     name: 'Cloth',         cls: 'good', category: 'textile',  tier: 3, value: 12,  stackWeight: 1,   colour: '#9d7fa3', icon: '🧵' },
  { id: 'hide',      name: 'Hides',         cls: 'good', category: 'raw',      tier: 1, value: 5,   stackWeight: 1,   colour: '#8d6b4e', icon: '🦌' },
  { id: 'leather',   name: 'Leather',       cls: 'good', category: 'textile',  tier: 3, value: 14,  stackWeight: 1,   colour: '#7a5638', icon: '👜' },
  { id: 'herbs',     name: 'Herbs',         cls: 'good', category: 'raw',      tier: 2, value: 4,   stackWeight: 1,   colour: '#6f9a5e', icon: '🌿' },
  { id: 'medicine',  name: 'Medicine',      cls: 'good', category: 'lux',      tier: 3, value: 30,  stackWeight: 1,   colour: '#6fae9b', icon: '🧪' },
  { id: 'candle',    name: 'Candles',       cls: 'good', category: 'lux',      tier: 4, value: 26,  stackWeight: 1,   colour: '#e8cf8a', icon: '🕯️' },
  { id: 'coin',      name: 'Coin',          cls: 'good', category: 'currency', tier: 1, value: 1,   stackWeight: 0.1, colour: '#d4a72c', icon: '🪙' },

  // --- arms (goods, but stored only by the Armoury) -----------------
  { id: 'spear',          name: 'Spear',          cls: 'good', category: 'arms', tier: 1, value: 18,  stackWeight: 1, colour: '#a98d63', icon: '🔱' },
  { id: 'sword',          name: 'Sword',          cls: 'good', category: 'arms', tier: 2, value: 52,  stackWeight: 1, colour: '#aab4bd', icon: '⚔️' },
  { id: 'crossbow',       name: 'Crossbow',       cls: 'good', category: 'arms', tier: 3, value: 60,  stackWeight: 1, colour: '#96754d', icon: '🏹' },
  { id: 'halberd',        name: 'Halberd',        cls: 'good', category: 'arms', tier: 4, value: 175, stackWeight: 1, colour: '#8e9aa5', icon: '🗡️' },
  { id: 'gambeson',       name: 'Gambeson',       cls: 'good', category: 'arms', tier: 1, value: 32,  stackWeight: 1, colour: '#cbbf9e', icon: '🧥' },
  { id: 'leather_armour', name: 'Leather Armour', cls: 'good', category: 'arms', tier: 2, value: 38,  stackWeight: 1, colour: '#8a6741', icon: '🥼' },
  { id: 'mail',           name: 'Mail Hauberk',   cls: 'good', category: 'arms', tier: 3, value: 78,  stackWeight: 2, colour: '#939da6', icon: '🔗' },
  { id: 'plate',          name: 'Plate Harness',  cls: 'good', category: 'arms', tier: 4, value: 265, stackWeight: 3, colour: '#c3ccd6', icon: '🦺' },
  { id: 'shield',         name: 'Shield',         cls: 'good', category: 'arms', tier: 2, value: 27,  stackWeight: 1, colour: '#7e6a4f', icon: '🛡️' },

  // --- foods -------------------------------------------------------
  { id: 'berries',     name: 'Berries',     cls: 'food', category: 'food', group: 'produce', nutrition: 0.6, tier: 1, value: 3,  stackWeight: 1, colour: '#8e4a5e', icon: '🫐' },
  { id: 'mushrooms',   name: 'Mushrooms',   cls: 'food', category: 'food', group: 'produce', nutrition: 0.6, tier: 1, value: 3,  stackWeight: 1, colour: '#a9866b', icon: '🍄' },
  { id: 'cabbage',     name: 'Cabbage',     cls: 'food', category: 'food', group: 'produce', nutrition: 0.9, tier: 2, value: 4,  stackWeight: 1, colour: '#7fa06a', icon: '🥬' },
  { id: 'carrots',     name: 'Carrots',     cls: 'food', category: 'food', group: 'produce', nutrition: 0.9, tier: 2, value: 4,  stackWeight: 1, colour: '#d08641', icon: '🥕' },
  { id: 'apples',      name: 'Apples',      cls: 'food', category: 'food', group: 'produce', nutrition: 0.8, tier: 2, value: 4,  stackWeight: 1, colour: '#b04f42', icon: '🍎' },
  { id: 'grain',       name: 'Grain',       cls: 'food', category: 'food', group: 'grain',   nutrition: 0.6, tier: 2, value: 3,  stackWeight: 1, colour: '#cbab5e', icon: '🌾' },
  { id: 'flour',       name: 'Flour',       cls: 'food', category: 'food', group: 'grain',   nutrition: 0.8, tier: 2, value: 7,  stackWeight: 1, colour: '#e4dcc4', icon: '🥣' },
  { id: 'bread',       name: 'Bread',       cls: 'food', category: 'food', group: 'grain',   nutrition: 1.6, tier: 2, value: 16, stackWeight: 1, colour: '#b5844a', icon: '🍞' },
  { id: 'fish',        name: 'Fish',        cls: 'food', category: 'food', group: 'fish',    nutrition: 1.0, tier: 1, value: 5,  stackWeight: 1, colour: '#7fa3b3', icon: '🐟' },
  { id: 'smoked_fish', name: 'Smoked Fish', cls: 'food', category: 'food', group: 'fish',    nutrition: 1.6, tier: 3, value: 24, stackWeight: 1, colour: '#a3764f', icon: '🍥' },
  { id: 'venison',     name: 'Venison',     cls: 'food', category: 'food', group: 'meat',    nutrition: 1.4, tier: 1, value: 8,  stackWeight: 1, colour: '#8b4a3c', icon: '🍖' },
  { id: 'mutton',      name: 'Mutton',      cls: 'food', category: 'food', group: 'meat',    nutrition: 1.3, tier: 2, value: 7,  stackWeight: 1, colour: '#b0705f', icon: '🥩' },
  { id: 'pork',        name: 'Pork',        cls: 'food', category: 'food', group: 'meat',    nutrition: 1.4, tier: 3, value: 8,  stackWeight: 1, colour: '#c48b7f', icon: '🥓' },
  { id: 'eggs',        name: 'Eggs',        cls: 'food', category: 'food', group: 'dairy',   nutrition: 0.7, tier: 2, value: 4,  stackWeight: 1, colour: '#efe3c4', icon: '🥚' },
  { id: 'milk',        name: 'Milk',        cls: 'food', category: 'food', group: 'dairy',   nutrition: 0.7, tier: 3, value: 4,  stackWeight: 1, colour: '#f1efe6', icon: '🥛' },
  { id: 'cheese',      name: 'Cheese',      cls: 'food', category: 'food', group: 'dairy',   nutrition: 1.5, tier: 3, value: 11, stackWeight: 1, colour: '#e0be62', icon: '🧀' },
  { id: 'honey',       name: 'Honey',       cls: 'food', category: 'food', group: 'sweet',   nutrition: 0.9, tier: 3, value: 8,  stackWeight: 1, colour: '#d9a13c', icon: '🍯' },
  { id: 'ale',         name: 'Ale',         cls: 'food', category: 'food', group: 'sweet',   nutrition: 0.8, tier: 3, value: 11, stackWeight: 1, colour: '#a5702f', icon: '🍺' },
];

export const ITEMS = {};
for (let i = 0; i < ITEM_LIST.length; i++) {
  const it = ITEM_LIST[i];
  // §4 names the field `class` and `foodGroup`; `cls`/`group` are the safe
  // spellings. Both are published so either reading is correct.
  it.class = it.cls;
  if (it.group) it.foodGroup = it.group;
  ITEMS[it.id] = it;
}

export const ITEM_IDS = ITEM_LIST.map((it) => it.id);
export const GOOD_IDS = ITEM_LIST.filter((it) => it.cls === 'good' && it.category !== 'arms').map((it) => it.id);
export const ARMS_IDS = ITEM_LIST.filter((it) => it.category === 'arms').map((it) => it.id);
export const FOOD_IDS = ITEM_LIST.filter((it) => it.cls === 'food').map((it) => it.id);

/** Storage class of an item: 'arms' | 'food' | 'good'. Armouries take only arms. */
export function itemClass(id) {
  const it = ITEMS[id];
  if (!it) return 'good';
  if (it.category === 'arms') return 'arms';
  return it.cls;
}

/**
 * ADDENDUM J3.1: no single item may hold more than this share of a store's
 * capacity for its class, so a class can never be monopolised by one item that
 * nothing consumes. `ITEM_CLASS_FLOOR` keeps the rule from shrinking a small
 * buffer (a house's 6-unit larder) to an unusable size; below it the whole
 * class room stays available to one item. Enforced in buildings.capacityFor().
 */
export const ITEM_CLASS_SHARE = 0.40;
export const ITEM_CLASS_FLOOR = 12;

/* ------------------------------------------------------------------ *
 * §4 / §9.4  Food groups
 * ------------------------------------------------------------------ */

export const FOOD_GROUPS = [
  { id: 'grain',   name: 'Grain',   colour: '#cbab5e' },
  { id: 'meat',    name: 'Meat',    colour: '#a8564a' },
  { id: 'fish',    name: 'Fish',    colour: '#6f93a6' },
  { id: 'produce', name: 'Produce', colour: '#7fa06a' },
  { id: 'dairy',   name: 'Dairy',   colour: '#e2d9c0' },
  { id: 'sweet',   name: 'Sweet',   colour: '#d9a13c' },
];

export const FOOD_GROUP_IDS = FOOD_GROUPS.map((g) => g.id);

/* §9.4's health formula lives here rather than in economy.js because
 * contentViolations() gates the tier table against it — the roster and the
 * gate it must clear have to be checked against the same numbers. economy.js
 * re-exports HEALTH_BASE and is the only consumer of all three. */
export const HEALTH_BASE = 22;
export const VARIETY_HEALTH = 0.62;
/* AF2: points of slack a tier's health gate must leave under the food ceiling
 * of the tier below. A town never sits at its ceiling — it has to hold every
 * qualifying food at once — and §9.4's penalties take 12 for a woodless Winter
 * and 31 for one starving day. */
export const TIER_HEALTH_HEADROOM = 8;

/* ------------------------------------------------------------------ *
 * §7 / ADDENDUM A  Buildings
 * ------------------------------------------------------------------ */

const R = RESOURCE;

// Costs climb steeply with tier on purpose: a Cottage is a day-1 decision, a
// Cathedral is a season-long project.
export const BUILDINGS = [

  /* ---- Infrastructure -------------------------------------------- */
  {
    id: 'path', name: 'Dirt Path', cat: 'infra', tier: 1, w: 1, h: 1,
    cost: { wood: 1 }, buildTime: 0, jobs: 0, role: null,
    instance: false, road: ROAD_DIRT, drag: true, solid: false,
    hp: 20, maxHp: 20,
    palette: { roof: '#9c8055', wall: '#8a6f49', trim: '#6f5938' }, shape: 'field',
    desc: 'A beaten track. Doubles walking speed and connects buildings so they can work at all.',
  },
  {
    id: 'road', name: 'Cobbled Road', cat: 'infra', tier: 2, w: 1, h: 1,
    cost: { stone: 1 }, buildTime: 0, jobs: 0, role: null,
    instance: false, road: ROAD_COBBLE, drag: true, solid: false,
    hp: 40, maxHp: 40,
    palette: { roof: '#a3a29a', wall: '#8f8e86', trim: '#75746d' }, shape: 'field',
    desc: 'Upgrades a dirt path in place. The fastest ground in the valley — pave your haul routes first.',
  },
  {
    id: 'bridge', name: 'Bridge', cat: 'infra', tier: 2, w: 1, h: 1,
    cost: { plank: 3 }, buildTime: 0, jobs: 0, role: null,
    instance: false, road: ROAD_DIRT, drag: true, solid: false,
    needsTerrain: 'water', hp: 60, maxHp: 60,
    palette: { roof: '#b08f5c', wall: '#95784c', trim: '#6f5b39' }, shape: 'field',
    desc: 'Carries a path over water. Turns a lake detour into a straight line.',
  },
  {
    id: 'town_centre', name: 'Town Centre', cat: 'infra', tier: 1, w: 3, h: 3,
    cost: { wood: 30, stone: 20 }, buildTime: 200, jobs: 2, role: 'porter',
    unique: true, prePlaced: true, solid: true,
    storage: { classes: ['good', 'food'], cap: 240, classCap: 120 },
    happiness: { radius: 14, amount: 12 },
    inputCap: 60, outputCap: 60, hp: 400, maxHp: 400,
    palette: { roof: '#8c5a4a', wall: '#cfc0a3', trim: '#6b5138' }, shape: 'hall',
    desc: 'The heart of the valley. Holds your starting stores and radiates cheer; lose it and the town is finished.',
  },
  {
    id: 'well', name: 'Well', cat: 'infra', tier: 1, w: 1, h: 1,
    cost: { stone: 6, wood: 2 }, buildTime: 40, jobs: 0, role: null,
    happiness: { radius: 8, amount: 4 }, solid: true, hp: 90, maxHp: 90,
    palette: { roof: '#7d6a4e', wall: '#9a9990', trim: '#6a695f' }, shape: 'well',
    desc: 'Clean water for the surrounding houses. Cheap happiness you can sprinkle through a young town.',
  },
  {
    id: 'fountain', name: 'Fountain', cat: 'infra', tier: 3, w: 2, h: 2,
    cost: { stone: 24, brick: 10 }, buildTime: 150, jobs: 0, role: null,
    happiness: { radius: 12, amount: 10 }, upkeep: { coin: 0.3 },
    solid: true, hp: 160, maxHp: 160,
    palette: { roof: '#8ea7b0', wall: '#b7b5aa', trim: '#77766c' }, shape: 'well',
    desc: 'A stone basin for a proper town square. Wide, strong happiness for a neighbourhood of townhouses.',
  },

  /* ---- Housing ---------------------------------------------------- */
  // `foodCap` is the household larder (ADDENDUM J1): ordinary 'food'-class
  // inventory that hauliers fill and residents eat from at home.
  {
    id: 'cottage', name: 'Cottage', cat: 'housing', tier: 1, w: 2, h: 2,
    cost: { wood: 6 }, buildTime: 50, jobs: 0, role: null,
    houses: 4, foodCap: 6, solid: true, hp: 80, maxHp: 80,
    palette: { roof: '#a8895e', wall: '#d6c7a8', trim: '#6f5a3d' }, shape: 'house',
    desc: 'Thatch and daub for four. The cheapest way to hold people in the valley on day one.',
  },
  {
    id: 'house', name: 'House', cat: 'housing', tier: 2, w: 2, h: 2,
    cost: { wood: 8, plank: 6 }, buildTime: 80, jobs: 0, role: null,
    houses: 7, foodCap: 6, upgradeFrom: 'cottage', solid: true, hp: 110, maxHp: 110,
    palette: { roof: '#96745a', wall: '#dcd0b4', trim: '#6a533a' }, shape: 'house',
    desc: 'A timbered house for seven. Build it over a cottage to keep the residents and pay only the difference.',
  },
  {
    // Tier 2: density is the answer to the tier-3 population gate, so the
    // building that supplies it cannot sit behind the gate it opens.
    id: 'townhouse', name: 'Townhouse', cat: 'housing', tier: 2, w: 2, h: 2,
    cost: { plank: 12, stone: 14, wood: 12 }, buildTime: 130, jobs: 0, role: null,
    houses: 11, foodCap: 6, upgradeFrom: 'house', solid: true, hp: 150, maxHp: 150,
    palette: { roof: '#7d5f57', wall: '#c9b79c', trim: '#5c4733' }, shape: 'house',
    desc: 'Stone and two storeys for eleven. Density is how you get to a hundred people without paving the whole valley.',
  },
  {
    id: 'manor', name: 'Manor', cat: 'housing', tier: 4, w: 3, h: 3,
    cost: { plank: 18, brick: 18, stone: 14, cloth: 6 }, buildTime: 220, jobs: 0, role: null,
    houses: 18, foodCap: 6, upgradeFrom: 'townhouse', upkeep: { coin: 0.4 },
    happiness: { radius: 6, amount: 4 }, solid: true, hp: 220, maxHp: 220,
    palette: { roof: '#6d5b63', wall: '#d3c4a6', trim: '#54422f' }, shape: 'hall',
    desc: 'Eighteen under one grand roof, and a little civic pride with it. Costs coin every day to keep.',
  },

  /* ---- Gathering -------------------------------------------------- *
   * `minPerDay` is U3's floor under a food-gathering site, in units/day the
   * patch supplies forever: §5's regrowth, which is the ceiling however much
   * is standing today. Below it `canPlace` refuses with 'not enough
   * <resource> nearby'. It is set to what the hut's own workers eat — jobs x
   * FOOD_PER_DAY over the item's nutrition — because a hut that cannot feed
   * its own crew is futile. One berry bush regrows 3 units = 1.8 nutrition
   * against two foragers eating 2.0, so berries are the one food whose single
   * node is below the line; two bushes clear it. A deer tile (2 x 1.4) and a
   * fish tile (4 x 1.0) already clear it on their own.
   *
   * Stone, clay, iron and timber carry 40-400 units on a single node, so one
   * node is never futile there — it runs out, and 'resource exhausted' says
   * so and names the fix (§16.8). Those defs declare no floor.
   * ------------------------------------------------------------------ */
  {
    id: 'woodcutter', name: "Woodcutter's Hut", cat: 'gather', tier: 1, w: 2, h: 2,
    cost: { wood: 8 }, buildTime: 60, jobs: 2, role: 'forester',
    gathers: { resource: R.TREE, item: 'wood', radius: 8, time: 3, yield: 4, basket: 12, winterMult: 1 },
    needsResource: R.TREE, outputCap: 40, solid: true, hp: 90, maxHp: 90,
    palette: { roof: '#8d7048', wall: '#b99a6d', trim: '#5f4b30' }, shape: 'hut',
    desc: 'Fells trees within eight tiles for timber. Everything in the valley starts here — build it first.',
  },
  {
    id: 'forager', name: "Forager's Hut", cat: 'gather', tier: 1, w: 2, h: 2,
    cost: { wood: 6 }, buildTime: 50, jobs: 2, role: 'forager',
    gathers: {
      resource: R.BERRY, item: 'berries', radius: 9, time: 3.5, yield: 5, basket: 10, winterMult: 0.5,
      minPerDay: 4,
      alt: { terrain: TERRAIN.FOREST, item: 'mushrooms', yield: 5 },
    },
    needsResource: R.BERRY, outputCap: 40, solid: true, hp: 80, maxHp: 80,
    palette: { roof: '#7f8a55', wall: '#b4a87e', trim: '#57603a' }, shape: 'hut',
    desc: 'Picks berries and mushrooms from the wild. Needs no inputs and no season but Winter, so it is your famine floor.',
  },
  {
    id: 'hunter', name: "Hunter's Lodge", cat: 'gather', tier: 1, w: 2, h: 2,
    cost: { wood: 10 }, buildTime: 60, jobs: 2, role: 'hunter',
    gathers: {
      resource: R.GAME, item: 'venison', radius: 12, time: 5, yield: 3, basket: 6, winterMult: 0.6,
      minPerDay: 2,
      byproduct: { item: 'hide', chance: 0.5, qty: 1 },
    },
    needsResource: R.GAME, outputCap: 30, solid: true, hp: 90, maxHp: 90,
    palette: { roof: '#6f5a41', wall: '#a98d67', trim: '#4c3d2a' }, shape: 'hut',
    desc: 'Takes deer for venison, and a hide half the time. Winter thins the herds but never stops them.',
  },
  {
    id: 'fisher', name: "Fisherman's Hut", cat: 'gather', tier: 1, w: 2, h: 2,
    cost: { wood: 8 }, buildTime: 60, jobs: 2, role: 'fisher',
    gathers: {
      resource: R.FISH, item: 'fish', radius: 8, time: 4, yield: 5, basket: 10, winterMult: 0.5,
      minPerDay: 2,
    },
    needsTerrain: 'shore', needsResource: R.FISH, outputCap: 40,
    solid: true, hp: 80, maxHp: 80,
    palette: { roof: '#6b8490', wall: '#b0a98e', trim: '#48606a' }, shape: 'hut',
    desc: 'Works the shallows for fish. Must sit beside the shore, and the lake never runs dry.',
  },
  {
    id: 'quarry', name: 'Quarry', cat: 'gather', tier: 1, w: 3, h: 3,
    cost: { wood: 14 }, buildTime: 100, jobs: 3, role: 'quarrier',
    gathers: { resource: R.STONE, item: 'stone', radius: 7, time: 4, yield: 2, basket: 4, winterMult: 1 },
    needsTerrain: 'rock', needsResource: R.STONE, outputCap: 50,
    solid: true, hp: 120, maxHp: 120,
    palette: { roof: '#84837b', wall: '#a5a49a', trim: '#63625b' }, shape: 'mine',
    desc: 'Cuts stone out of a rock outcrop. Finite — when the node runs out, move the quarry, not the town.',
  },
  {
    id: 'clay_pit', name: 'Clay Pit', cat: 'gather', tier: 2, w: 2, h: 2,
    cost: { wood: 10, plank: 2 }, buildTime: 70, jobs: 2, role: 'digger',
    gathers: { resource: R.CLAY, item: 'clay', radius: 7, time: 3.5, yield: 2, basket: 4, winterMult: 1 },
    needsResource: R.CLAY, outputCap: 40, solid: true, hp: 90, maxHp: 90,
    palette: { roof: '#9a6f4a', wall: '#bd9169', trim: '#6b4c30' }, shape: 'mine',
    desc: 'Digs clay for the Kiln. Bricks are the gateway to every tier-3 building, so site this early.',
  },
  {
    id: 'herbalist', name: "Herbalist's Hut", cat: 'gather', tier: 2, w: 2, h: 2,
    cost: { wood: 8, plank: 2 }, buildTime: 60, jobs: 1, role: 'herbalist',
    gathers: { resource: R.HERB, item: 'herbs', radius: 10, time: 5, yield: 1, basket: 2, winterMult: 0.5 },
    needsResource: R.HERB, outputCap: 30, solid: true, hp: 80, maxHp: 80,
    palette: { roof: '#5f8a5c', wall: '#b3b087', trim: '#3f5d3d' }, shape: 'hut',
    desc: 'Gathers herbs from meadow and wood. Feeds the Apothecary, which is worth eight points of town health.',
  },
  {
    id: 'iron_mine', name: 'Iron Mine', cat: 'gather', tier: 3, w: 3, h: 3,
    cost: { plank: 16, wood: 10, brick: 10 }, buildTime: 160, jobs: 4, role: 'miner',
    gathers: { resource: R.IRON, item: 'iron_ore', radius: 7, time: 5, yield: 2, basket: 4, winterMult: 1 },
    needsTerrain: 'rock', needsResource: R.IRON, outputCap: 50,
    upkeep: { coin: 0.3 }, solid: true, hp: 140, maxHp: 140,
    palette: { roof: '#5e5f68', wall: '#8c8a83', trim: '#43444b' }, shape: 'mine',
    desc: 'Four miners bringing up ore for the Bloomery. The whole arms chain hangs off this one building.',
  },

  /* ---- Food production -------------------------------------------- */
  {
    id: 'wheat_farm', name: 'Wheat Farm', cat: 'food', tier: 2, w: 4, h: 4,
    cost: { wood: 12, plank: 4 }, buildTime: 100, jobs: 3, role: 'farmer',
    grows: { item: 'grain', time: 10, base: 4, winter: false },
    outputCap: 24, solid: false, hp: 70, maxHp: 70,
    palette: { roof: '#c3a95f', wall: '#b4a06a', trim: '#7e6c3c' }, shape: 'field',
    desc: 'Grows grain from its own sixteen tiles; put it on meadow for half again the yield. Dead all Winter.',
  },
  {
    id: 'vegetable_garden', name: 'Vegetable Garden', cat: 'food', tier: 2, w: 3, h: 3,
    cost: { wood: 8 }, buildTime: 70, jobs: 2, role: 'gardener',
    grows: { item: 'cabbage', time: 9, base: 2, winter: false, alt: { item: 'carrots', everyN: 2 } },
    outputCap: 16, solid: false, hp: 60, maxHp: 60,
    palette: { roof: '#7f9c5f', wall: '#93a068', trim: '#5b6f40' }, shape: 'field',
    desc: 'Alternates cabbage and carrots, so one small plot buys you two distinct foods for the variety score.',
  },
  {
    id: 'orchard', name: 'Orchard', cat: 'food', tier: 2, w: 3, h: 3,
    cost: { wood: 12 }, buildTime: 90, jobs: 2, role: 'orchardist',
    grows: { item: 'apples', time: 11, base: 3, winter: false },
    outputCap: 16, solid: false, hp: 60, maxHp: 60,
    palette: { roof: '#93703f', wall: '#6f8a4e', trim: '#4f6135' }, shape: 'field',
    desc: 'Apples through the warm seasons. Slow, but it needs no inputs and keeps the produce group alive.',
  },
  {
    id: 'windmill', name: 'Windmill', cat: 'food', tier: 2, w: 2, h: 2,
    cost: { wood: 10, plank: 8, stone: 6 }, buildTime: 100, jobs: 1, role: 'miller',
    recipe: { in: { grain: 2 }, out: { flour: 2 }, time: 6 },
    inputCap: 16, outputCap: 12, solid: true, hp: 110, maxHp: 110,
    palette: { roof: '#8a7050', wall: '#cdc1a4', trim: '#5e4c34' }, shape: 'tower',
    desc: 'Grinds grain to flour. Grain eaten raw is a waste — the mill and bakery together nearly triple its food value.',
  },
  {
    id: 'bakery', name: 'Bakery', cat: 'food', tier: 2, w: 2, h: 2,
    cost: { plank: 8, stone: 10 }, buildTime: 90, jobs: 2, role: 'baker',
    recipe: { in: { flour: 2 }, out: { bread: 2 }, time: 9 },
    inputCap: 16, outputCap: 16, solid: true, hp: 110, maxHp: 110,
    palette: { roof: '#a1604a', wall: '#d8c8a6', trim: '#6d4530' }, shape: 'workshop',
    desc: 'Bakes flour into bread. Bread is the backbone of a big town — nothing else feeds this many people per tile.',
  },
  {
    id: 'chicken_coop', name: 'Chicken Coop', cat: 'food', tier: 2, w: 2, h: 2,
    cost: { wood: 6, plank: 2 }, buildTime: 50, jobs: 1, role: 'poulterer',
    recipe: { in: { grain: 1 }, out: { eggs: 2 }, time: 7 },
    inputCap: 12, outputCap: 12, solid: true, hp: 70, maxHp: 70,
    palette: { roof: '#b09a62', wall: '#c9b98f', trim: '#75653d' }, shape: 'yard',
    desc: 'Turns a little grain into eggs. The cheapest entry into the dairy group, and it works all Winter.',
  },
  {
    id: 'sheep_pasture', name: 'Sheep Pasture', cat: 'food', tier: 2, w: 4, h: 4,
    cost: { wood: 14 }, buildTime: 90, jobs: 2, role: 'shepherd',
    grows: { item: 'wool', time: 10, base: 2, winter: false, alt: { item: 'mutton', everyN: 4 } },
    outputCap: 16, solid: false, hp: 70, maxHp: 70,
    palette: { roof: '#a99f86', wall: '#98a877', trim: '#6b7350' }, shape: 'yard',
    desc: 'Wool every batch and mutton every fourth. Feeds both the Weaver and the meat group off one field.',
  },
  {
    id: 'pig_farm', name: 'Pig Farm', cat: 'food', tier: 3, w: 3, h: 3,
    cost: { wood: 12, plank: 6 }, buildTime: 100, jobs: 2, role: 'swineherd',
    recipe: { in: { grain: 1 }, out: { pork: 1 }, time: 9 },
    inputCap: 12, outputCap: 12, solid: true, hp: 90, maxHp: 90,
    palette: { roof: '#96705e', wall: '#b79b7c', trim: '#63483a' }, shape: 'yard',
    desc: 'Fattens grain into pork. Year-round meat, which is exactly what the Winter food multiplier wants.',
  },
  {
    id: 'dairy_farm', name: 'Dairy Farm', cat: 'food', tier: 3, w: 3, h: 3,
    cost: { wood: 14, plank: 6 }, buildTime: 110, jobs: 2, role: 'dairymaid',
    grows: { item: 'milk', time: 8, base: 2, winter: false },
    outputCap: 16, solid: false, hp: 90, maxHp: 90,
    palette: { roof: '#a08d6e', wall: '#cfc6ad', trim: '#6b5c44' }, shape: 'yard',
    desc: 'Milk from grazing cattle. Milk alone is thin food; pair it with a Cheesemaker to double its worth.',
  },
  {
    id: 'cheesemaker', name: 'Cheesemaker', cat: 'food', tier: 3, w: 2, h: 2,
    cost: { plank: 8, brick: 4 }, buildTime: 90, jobs: 2, role: 'cheesemaker',
    recipe: { in: { milk: 2 }, out: { cheese: 2 }, time: 8 },
    inputCap: 16, outputCap: 12, solid: true, hp: 100, maxHp: 100,
    palette: { roof: '#b09551', wall: '#dbd0b1', trim: '#6f5e34' }, shape: 'workshop',
    desc: 'Presses milk into cheese, which keeps through Winter and feeds twice as well.',
  },
  {
    // Tier 1, and priced in timber alone, because it is the ONLY building below
    // tier 2 that opens a food group the Forager, Hunter and Fisher cannot.
    // Without it a Hamlet's roster tops out at three groups and four items —
    // varietyScore 41.8, healthTarget 47.9 — against a tier-2 gate of 45, and
    // every building that would widen the diet sits behind that gate.
    id: 'apiary', name: 'Apiary', cat: 'food', tier: 1, w: 2, h: 2,
    cost: { wood: 14 }, buildTime: 60, jobs: 1, role: 'beekeeper',
    grows: { item: 'honey', time: 12, base: 1, winter: false },
    outputCap: 12, solid: true, hp: 70, maxHp: 70,
    palette: { roof: '#c39a43', wall: '#c2b184', trim: '#7e6427' }, shape: 'yard',
    desc: 'Honey — half of the sweet group, and the only source the Chandler will take for candles.',
  },
  {
    id: 'brewery', name: 'Brewery', cat: 'food', tier: 3, w: 3, h: 2,
    cost: { plank: 10, stone: 14 }, buildTime: 110, jobs: 2, role: 'brewer',
    recipe: { in: { grain: 2 }, out: { ale: 2 }, time: 9 },
    inputCap: 16, outputCap: 16, solid: true, hp: 120, maxHp: 120,
    palette: { roof: '#8a6636', wall: '#c4b58e', trim: '#5b4322' }, shape: 'workshop',
    desc: 'Brews grain into ale. A stocked cellar is worth five town health, and the Tavern will not run without it.',
  },
  {
    id: 'smokehouse', name: 'Smokehouse', cat: 'food', tier: 3, w: 2, h: 2,
    cost: { plank: 6, brick: 4 }, buildTime: 80, jobs: 1, role: 'smoker',
    recipe: { in: { fish: 2, charcoal: 1 }, out: { smoked_fish: 2 }, time: 9 },
    inputCap: 16, outputCap: 12, solid: true, hp: 100, maxHp: 100,
    palette: { roof: '#5c5049', wall: '#a89578', trim: '#3d352f' }, shape: 'workshop',
    desc: 'Smokes fish for keeping. Turns a good Summer catch into food that is still there in Winter.',
  },
  {
    id: 'market', name: 'Market', cat: 'food', tier: 2, w: 3, h: 3,
    cost: { wood: 12, plank: 8 }, buildTime: 100, jobs: 3, role: 'trader',
    storage: { classes: ['food'], cap: 120 },
    happiness: { radius: 12, amount: 6 }, market: true, upkeep: { coin: 0.2 },
    inputCap: 40, outputCap: 40, solid: true, hp: 130, maxHp: 130,
    palette: { roof: '#a8624c', wall: '#d2c3a0', trim: '#6d4331' }, shape: 'yard',
    desc: 'Where villagers come to eat, and where houses within twelve tiles get their happiness. Required for Town tier.',
  },

  /* ---- Industry --------------------------------------------------- */
  {
    id: 'builders_hut', name: "Builder's Hut", cat: 'industry', tier: 1, w: 2, h: 2,
    cost: { wood: 8 }, buildTime: 50, jobs: 3, role: 'builder',
    solid: true, hp: 90, maxHp: 90,
    palette: { roof: '#9a7c4e', wall: '#c6b287', trim: '#68522f' }, shape: 'hut',
    desc: 'Three dedicated builders who raise every site you place. Without it, construction crawls at idler speed.',
  },
  {
    id: 'stockpile', name: 'Stockpile', cat: 'industry', tier: 1, w: 3, h: 3,
    cost: { wood: 10 }, buildTime: 60, jobs: 2, role: 'porter',
    storage: { classes: ['good'], cap: 500 },
    inputCap: 500, outputCap: 500, solid: true, hp: 110, maxHp: 110,
    palette: { roof: '#8d7550', wall: '#b8a37a', trim: '#5d4b31' }, shape: 'store',
    desc: 'Holds timber, stone and every other good, and houses two porters who do the hauling. Required for Village tier.',
  },
  {
    id: 'granary', name: 'Granary', cat: 'industry', tier: 1, w: 3, h: 3,
    cost: { wood: 16, stone: 2 }, buildTime: 70, jobs: 2, role: 'porter',
    storage: { classes: ['food'], cap: 300 },
    inputCap: 300, outputCap: 300, solid: true, hp: 120, maxHp: 120,
    palette: { roof: '#b39355', wall: '#cfc098', trim: '#755f31' }, shape: 'store',
    desc: 'Stores food against Winter, when every farm in the valley stops. Required for Village tier.',
  },
  {
    id: 'warehouse', name: 'Warehouse', cat: 'industry', tier: 2, w: 4, h: 3,
    cost: { wood: 30, stone: 20, plank: 6 }, buildTime: 150, jobs: 3, role: 'porter',
    storage: { classes: ['good', 'arms'], cap: 600 },
    upkeep: { coin: 0.3 }, inputCap: 600, outputCap: 600,
    solid: true, hp: 200, maxHp: 200,
    palette: { roof: '#6f6455', wall: '#bcae8e', trim: '#4d4538' }, shape: 'store',
    desc: 'Takes goods and arms in bulk, with three porters. Food has the Granary; this is everything else, and a town past sixty people needs it.',
  },
  {
    id: 'sawmill', name: 'Sawmill', cat: 'industry', tier: 2, w: 3, h: 2,
    cost: { wood: 14, stone: 6 }, buildTime: 90, jobs: 2, role: 'sawyer',
    recipe: { in: { wood: 2 }, out: { plank: 2 }, time: 5 },
    inputCap: 20, outputCap: 16, solid: true, hp: 110, maxHp: 110,
    palette: { roof: '#8f7346', wall: '#c4a878', trim: '#5e4a2b' }, shape: 'workshop',
    desc: 'Saws timber into planks. Almost everything above tier 1 is priced in planks, so build it right after the Woodcutter.',
  },
  {
    id: 'charcoal_burner', name: 'Charcoal Burner', cat: 'industry', tier: 2, w: 2, h: 2,
    cost: { wood: 8, stone: 4 }, buildTime: 60, jobs: 1, role: 'burner',
    recipe: { in: { wood: 3 }, out: { charcoal: 1 }, time: 7 },
    inputCap: 16, outputCap: 12, solid: true, hp: 80, maxHp: 80,
    palette: { roof: '#4a423b', wall: '#8f7c5f', trim: '#2f2a25' }, shape: 'workshop',
    desc: 'Chars timber into charcoal. Hungry for wood, but the Kiln, Bloomery, Foundry and Smokehouse all need it.',
  },
  {
    id: 'kiln', name: 'Kiln', cat: 'industry', tier: 2, w: 2, h: 2,
    cost: { stone: 12, clay: 6 }, buildTime: 90, jobs: 2, role: 'potter',
    recipe: { in: { clay: 2, wood: 3 }, out: { brick: 2 }, time: 8 },
    inputCap: 16, outputCap: 16, solid: true, hp: 110, maxHp: 110,
    palette: { roof: '#9a5443', wall: '#b79a72', trim: '#63342a' }, shape: 'workshop',
    desc: 'Fires clay and timber into bricks. Bricks are what the tier-3 workshops are built from, and only a kiln makes them.',
  },
  {
    id: 'weaver', name: "Weaver's Shop", cat: 'industry', tier: 3, w: 2, h: 2,
    cost: { plank: 8, brick: 4 }, buildTime: 90, jobs: 2, role: 'weaver',
    recipe: { in: { wool: 2 }, out: { cloth: 1 }, time: 8 },
    inputCap: 16, outputCap: 12, solid: true, hp: 100, maxHp: 100,
    palette: { roof: '#8a6f8f', wall: '#cdc0ab', trim: '#5b4760' }, shape: 'workshop',
    desc: 'Spins wool into cloth for gambesons, crossbows and candles. Pair it with a Sheep Pasture.',
  },
  {
    id: 'tannery', name: 'Tannery', cat: 'industry', tier: 3, w: 2, h: 2,
    cost: { plank: 8, brick: 4 }, buildTime: 90, jobs: 2, role: 'tanner',
    recipe: { in: { hide: 2 }, out: { leather: 1 }, time: 8 },
    inputCap: 16, outputCap: 12, solid: true, hp: 100, maxHp: 100,
    palette: { roof: '#77563a', wall: '#b49a76', trim: '#4c3724' }, shape: 'workshop',
    desc: 'Cures hunters’ hides into leather. Shields and leather armour need it, and so does plate.',
  },
  {
    id: 'bloomery', name: 'Bloomery', cat: 'industry', tier: 3, w: 2, h: 2,
    cost: { stone: 16, brick: 8, plank: 4 }, buildTime: 130, jobs: 2, role: 'smelter',
    recipe: { in: { iron_ore: 2, charcoal: 1 }, out: { iron: 1 }, time: 10 },
    inputCap: 16, outputCap: 12, solid: true, hp: 130, maxHp: 130,
    palette: { roof: '#5d6670', wall: '#a89a80', trim: '#3d444c' }, shape: 'workshop',
    desc: 'Smelts ore and charcoal into iron. The first real industrial step, and the one that arms your soldiers.',
  },
  {
    id: 'blacksmith', name: 'Blacksmith', cat: 'industry', tier: 3, w: 2, h: 2,
    cost: { plank: 10, brick: 8, stone: 6 }, buildTime: 120, jobs: 2, role: 'smith',
    recipe: { in: { iron: 1, plank: 1 }, out: { tools: 1 }, time: 9 },
    inputCap: 16, outputCap: 12, solid: true, hp: 120, maxHp: 120,
    palette: { roof: '#4f5a62', wall: '#b0a184', trim: '#333b41' }, shape: 'workshop',
    desc: 'Forges tools. The Iron Mine will not open without them, so this is the bottleneck between tier 3 and tier 4.',
  },
  {
    id: 'foundry', name: 'Foundry', cat: 'industry', tier: 4, w: 3, h: 3,
    cost: { brick: 24, stone: 20, plank: 12, tools: 4 }, buildTime: 240, jobs: 3, role: 'founder',
    recipe: { in: { iron: 2, charcoal: 2 }, out: { steel: 1 }, time: 14 },
    inputCap: 20, outputCap: 12, upkeep: { coin: 0.5 },
    solid: true, hp: 200, maxHp: 200,
    palette: { roof: '#59616b', wall: '#9f947d', trim: '#3a4048' }, shape: 'workshop',
    desc: 'Makes steel out of iron and charcoal. Expensive and slow, and the only path to halberds and plate.',
  },
  {
    id: 'chandler', name: 'Chandler', cat: 'industry', tier: 4, w: 2, h: 2,
    cost: { plank: 10, brick: 8 }, buildTime: 100, jobs: 1, role: 'chandler',
    recipe: { in: { honey: 1, cloth: 1 }, out: { candle: 2 }, time: 8 },
    inputCap: 12, outputCap: 12, solid: true, hp: 100, maxHp: 100,
    palette: { roof: '#b39a5c', wall: '#ded0ac', trim: '#756236' }, shape: 'workshop',
    desc: 'Beeswax candles — a luxury that sells well and that the Cathedral and University both demand.',
  },
  {
    id: 'apothecary', name: 'Apothecary', cat: 'industry', tier: 2, w: 2, h: 2,
    cost: { plank: 10, stone: 8 }, buildTime: 100, jobs: 1, role: 'apothecary',
    recipe: { in: { herbs: 2, ale: 1 }, out: { medicine: 1 }, time: 12 },
    heal: { radius: 14, amount: 8 },
    inputCap: 12, outputCap: 12, solid: true, hp: 100, maxHp: 100,
    palette: { roof: '#5f9e8d', wall: '#cfc7ab', trim: '#3d6a5f' }, shape: 'workshop',
    desc: 'Compounds herbs and ale into medicine, and lifts town health by eight simply by standing near the houses.',
  },
  {
    id: 'trading_post', name: 'Trading Post', cat: 'industry', tier: 3, w: 3, h: 3,
    cost: { plank: 16, brick: 10, stone: 8 }, buildTime: 150, jobs: 2, role: 'merchant',
    storage: { classes: ['good', 'food'], cap: 150 }, trade: true,
    upkeep: { coin: 0.4 }, inputCap: 150, outputCap: 150,
    solid: true, hp: 150, maxHp: 150,
    palette: { roof: '#8d6a3f', wall: '#cbb894', trim: '#5d4526' }, shape: 'store',
    desc: 'A caravan every six days buys your surplus and sells what you lack. The only reliable way to turn goods into coin.',
  },

  /* ---- Military --------------------------------------------------- */
  {
    id: 'palisade', name: 'Palisade', cat: 'military', tier: 1, w: 1, h: 1,
    cost: { wood: 2 }, buildTime: 10, jobs: 0, role: null,
    solid: true, wall: true, drag: true, hp: 60, maxHp: 60,
    palette: { roof: '#7d6544', wall: '#9c7f52', trim: '#54432c' }, shape: 'wall',
    desc: 'Sharpened stakes that raiders must chop through. Cheap enough to ring a whole hamlet on day ten.',
  },
  {
    id: 'wooden_gate', name: 'Wooden Gate', cat: 'military', tier: 1, w: 1, h: 1,
    cost: { wood: 7 }, buildTime: 20, jobs: 0, role: null,
    solid: false, gate: true, hp: 120, maxHp: 120,
    palette: { roof: '#6d5738', wall: '#a68a58', trim: '#48381f' }, shape: 'gate',
    desc: 'Your villagers walk through it, raiders do not. A palisade with no gate strangles your own hauling.',
  },
  {
    id: 'stone_wall', name: 'Stone Wall', cat: 'military', tier: 3, w: 1, h: 1,
    cost: { stone: 2 }, buildTime: 15, jobs: 0, role: null,
    solid: true, wall: true, drag: true, hp: 220, maxHp: 220,
    palette: { roof: '#8f8e86', wall: '#a3a299', trim: '#6c6b64' }, shape: 'wall',
    desc: 'Nearly four times the palisade’s staying power. This is what stops a ram long enough for archers to work.',
  },
  {
    id: 'stone_gate', name: 'Stone Gate', cat: 'military', tier: 3, w: 1, h: 1,
    cost: { stone: 6, plank: 2 }, buildTime: 30, jobs: 0, role: null,
    solid: false, gate: true, hp: 300, maxHp: 300,
    palette: { roof: '#6f6e67', wall: '#9d9c93', trim: '#4f4e48' }, shape: 'gate',
    desc: 'The strongest thing raiders will meet on their way in, and still open to your own porters.',
  },
  {
    id: 'watchtower', name: 'Watchtower', cat: 'military', tier: 1, w: 1, h: 1,
    cost: { wood: 10, stone: 4 }, buildTime: 60, jobs: 1, role: 'watchman',
    warningDays: 1, solid: true, hp: 140, maxHp: 140,
    palette: { roof: '#7a6547', wall: '#a99272', trim: '#50412c' }, shape: 'tower',
    desc: 'A watchman on the skyline buys you a third day of raid warning. A day is a wall.',
  },
  {
    id: 'barracks', name: 'Barracks', cat: 'military', tier: 1, w: 3, h: 3,
    cost: { wood: 24, stone: 8 }, buildTime: 140, jobs: 6, role: 'soldier',
    garrison: 6, upkeep: { coin: 0.5 }, solid: true, hp: 260, maxHp: 260,
    palette: { roof: '#6b5a52', wall: '#b2a389', trim: '#453931' }, shape: 'hall',
    desc: 'Quarters six soldiers who leave their posts to meet any raider within twenty-five tiles.',
  },
  {
    id: 'armoury', name: 'Armoury', cat: 'military', tier: 2, w: 3, h: 3,
    cost: { plank: 12, stone: 14, wood: 10 }, buildTime: 130, jobs: 2, role: 'porter',
    storage: { classes: ['arms'], cap: 120 },
    inputCap: 120, outputCap: 120, solid: true, hp: 220, maxHp: 220,
    palette: { roof: '#5b626a', wall: '#b3a68b', trim: '#3b4149' }, shape: 'store',
    desc: 'The only place weapons and armour can be stored. Each night your soldiers re-equip from what is inside.',
  },
  {
    id: 'guard_tower', name: 'Guard Tower', cat: 'military', tier: 3, w: 2, h: 2,
    cost: { stone: 24, plank: 8 }, buildTime: 130, jobs: 3, role: 'soldier',
    attack: { range: 7, dps: 4 }, upkeep: { coin: 0.3 },
    solid: true, hp: 300, maxHp: 300,
    palette: { roof: '#5e6a72', wall: '#a09a8a', trim: '#3d464c' }, shape: 'tower',
    desc: 'Three archers shooting anything within seven tiles. Empty of garrison it is just an expensive wall.',
  },
  {
    id: 'weaponsmith', name: 'Weaponsmith', cat: 'military', tier: 2, w: 3, h: 2,
    cost: { plank: 14, stone: 12, wood: 10 }, buildTime: 130, jobs: 2, role: 'weaponsmith',
    recipe: { in: { plank: 2 }, out: { spear: 1 }, time: 12 },
    recipes: [
      { id: 'spear', tier: 1, in: { plank: 2 }, out: { spear: 1 }, time: 12 },
      { id: 'sword', tier: 2, in: { iron: 2 }, out: { sword: 1 }, time: 16 },
      { id: 'halberd', tier: 4, in: { plank: 1, steel: 2 }, out: { halberd: 1 }, time: 26 },
    ],
    inputCap: 12, outputCap: 10, solid: true, hp: 140, maxHp: 140,
    palette: { roof: '#5a5348', wall: '#ab9c80', trim: '#3a352d' }, shape: 'workshop',
    desc: 'Spears, then swords, then halberds as your metal improves. Set the recipe; the output goes to the Armoury.',
  },
  {
    id: 'armourer', name: 'Armourer', cat: 'military', tier: 3, w: 3, h: 2,
    cost: { plank: 12, brick: 8, stone: 6 }, buildTime: 130, jobs: 2, role: 'armourer',
    recipe: { in: { cloth: 2 }, out: { gambeson: 1 }, time: 12 },
    recipes: [
      { id: 'gambeson', tier: 1, in: { cloth: 2 }, out: { gambeson: 1 }, time: 12 },
      { id: 'leather_armour', tier: 2, in: { leather: 2 }, out: { leather_armour: 1 }, time: 15 },
      { id: 'shield', tier: 2, in: { plank: 1, leather: 1 }, out: { shield: 1 }, time: 10 },
      { id: 'mail', tier: 3, in: { iron: 3 }, out: { mail: 1 }, time: 20 },
    ],
    inputCap: 12, outputCap: 10, solid: true, hp: 140, maxHp: 140,
    palette: { roof: '#646c74', wall: '#ada38a', trim: '#41474d' }, shape: 'workshop',
    desc: 'Gambesons, leather, shields and mail. Armour matters more than weapons: a dead soldier deals no damage.',
  },
  {
    id: 'crossbow_range', name: 'Crossbow Range', cat: 'military', tier: 4, w: 3, h: 3,
    cost: { plank: 20, brick: 12, stone: 8, tools: 3 }, buildTime: 170, jobs: 2, role: 'fletcher',
    recipe: { in: { plank: 2, iron: 1, cloth: 1 }, out: { crossbow: 1 }, time: 14 },
    inputCap: 14, outputCap: 10, upkeep: { coin: 0.3 },
    solid: true, hp: 170, maxHp: 170,
    palette: { roof: '#6d5c3f', wall: '#b7a685', trim: '#473a26' }, shape: 'workshop',
    desc: 'Crossbows let a man-at-arms shoot first from four tiles. One free round per fight is worth a whole kit tier.',
  },
  {
    id: 'plate_armoury', name: 'Plate Armoury', cat: 'military', tier: 4, w: 3, h: 3,
    cost: { brick: 22, stone: 18, plank: 14, steel: 4 }, buildTime: 230, jobs: 2, role: 'armourer',
    recipe: { in: { steel: 3, leather: 1 }, out: { plate: 1 }, time: 20 },
    inputCap: 14, outputCap: 8, upkeep: { coin: 0.6 },
    solid: true, hp: 200, maxHp: 200,
    palette: { roof: '#6a737c', wall: '#a89d84', trim: '#444b52' }, shape: 'workshop',
    desc: 'Full harness for knights. Enormously expensive per suit, and a knight is worth five spearmen.',
  },
  {
    id: 'keep', name: 'Keep', cat: 'military', tier: 3, w: 4, h: 4,
    cost: { stone: 90, plank: 30, wood: 40 }, buildTime: 350, jobs: 12, role: 'soldier',
    garrison: 12, happiness: { radius: 10, amount: 6 }, upkeep: { coin: 1.2 },
    solid: true, hp: 900, maxHp: 900,
    palette: { roof: '#565e66', wall: '#a6a091', trim: '#383e45' }, shape: 'keep',
    desc: 'Twelve soldiers behind the thickest walls in the valley, and the last refuge when a raid breaks through. Required for City tier.',
  },

  /* ---- Civic ------------------------------------------------------ */
  {
    id: 'chapel', name: 'Chapel', cat: 'civic', tier: 2, w: 3, h: 3,
    cost: { wood: 14, stone: 12 }, buildTime: 120, jobs: 1, role: 'priest',
    happiness: { radius: 12, amount: 10 }, upkeep: { coin: 0.2 },
    solid: true, hp: 160, maxHp: 160,
    palette: { roof: '#7c6b7a', wall: '#cdc2a8', trim: '#54485a' }, shape: 'church',
    desc: 'Ten points of happiness over a wide radius for very little coin. Required for Town tier.',
  },
  {
    id: 'tavern', name: 'Tavern', cat: 'civic', tier: 3, w: 3, h: 3,
    cost: { plank: 14, brick: 8 }, buildTime: 130, jobs: 2, role: 'taverner',
    happiness: { radius: 12, amount: 12 }, consumes: { item: 'ale', perDay: 2 },
    upkeep: { coin: 0.3 }, inputCap: 16, solid: true, hp: 160, maxHp: 160,
    palette: { roof: '#8a5f3c', wall: '#cdbb97', trim: '#5b3d25' }, shape: 'hall',
    desc: 'Drinks two ale a day and gives back the strongest ordinary happiness in the game. Keep the Brewery running.',
  },
  {
    id: 'school', name: 'School', cat: 'civic', tier: 3, w: 3, h: 3,
    cost: { plank: 16, brick: 10, stone: 6 }, buildTime: 150, jobs: 2, role: 'teacher',
    happiness: { radius: 10, amount: 6 }, bonus: { production: 0.10 },
    upkeep: { coin: 0.5 }, solid: true, hp: 170, maxHp: 170,
    palette: { roof: '#5f6f82', wall: '#cbc2a6', trim: '#3f4b59' }, shape: 'hall',
    desc: 'Ten per cent more output from every worker in the valley. It pays for itself the moment you have twenty of them.',
  },
  {
    id: 'town_hall', name: 'Town Hall', cat: 'civic', tier: 3, w: 4, h: 4,
    cost: { stone: 60, plank: 30, wood: 24 }, buildTime: 275, jobs: 3, role: 'clerk',
    happiness: { radius: 16, amount: 14 }, bonus: { tax: 0.20 },
    upkeep: { coin: 0.8 }, solid: true, hp: 320, maxHp: 320,
    palette: { roof: '#6a6270', wall: '#d0c5a6', trim: '#474050' }, shape: 'hall',
    desc: 'A fifth more tax and a broad lift in mood. Required for City tier, and the cure for a Keep’s upkeep.',
  },
  {
    id: 'cathedral', name: 'Cathedral', cat: 'civic', tier: 4, w: 4, h: 4,
    cost: { stone: 70, brick: 45, plank: 30, candle: 10 }, buildTime: 450, jobs: 3, role: 'priest',
    happiness: { radius: 20, amount: 22 }, upkeep: { coin: 1.5 },
    solid: true, hp: 500, maxHp: 500,
    palette: { roof: '#6b6478', wall: '#d8cfb4', trim: '#443e54' }, shape: 'church',
    desc: 'A season’s work and the finest thing in the valley: twenty-two happiness across twenty tiles.',
  },
  {
    id: 'university', name: 'University', cat: 'civic', tier: 4, w: 4, h: 4,
    cost: { stone: 45, brick: 30, plank: 25, candle: 6 }, buildTime: 375, jobs: 3, role: 'scholar',
    happiness: { radius: 12, amount: 8 }, bonus: { production: 0.20 },
    upkeep: { coin: 1.2 }, solid: true, hp: 380, maxHp: 380,
    palette: { roof: '#5a6a7d', wall: '#d0c8ae', trim: '#3c4756' }, shape: 'hall',
    desc: 'A fifth more output everywhere, stacking with the School. The single biggest economic building in the game.',
  },
];

/* ------------------------------------------------------------------ *
 * Build-menu categories and lookups
 * ------------------------------------------------------------------ */

export const CATEGORIES = [
  { id: 'housing', name: 'Housing' },
  { id: 'gather', name: 'Gathering' },
  { id: 'food', name: 'Food' },
  { id: 'industry', name: 'Industry' },
  { id: 'military', name: 'Military' },
  { id: 'civic', name: 'Civic' },
  { id: 'infra', name: 'Infrastructure' },
];

export const BUILDING_BY_ID = {};
export const BUILDINGS_BY_CAT = {};
for (let i = 0; i < CATEGORIES.length; i++) BUILDINGS_BY_CAT[CATEGORIES[i].id] = [];
for (let i = 0; i < BUILDINGS.length; i++) {
  const d = BUILDINGS[i];
  BUILDING_BY_ID[d.id] = d;
  BUILDINGS_BY_CAT[d.cat].push(d);
}

export const BUILDING_IDS = BUILDINGS.map((d) => d.id);

/* ------------------------------------------------------------------ *
 * §8  Roles
 * ------------------------------------------------------------------ */

// Tunic colours. Villagers are 5px figures, so these have to stay separable at
// zoom 1 — muted, but never two neighbouring roles in the same hue family.
export const ROLE_COLOURS = {
  // universal states
  idler: '#9a9285',
  builder: '#c08a3e',
  porter: '#8b6f4e',
  soldier: '#6a4f52',
  militia: '#7d6a55',
  // infra / civic
  elder: '#6d5a8a',
  priest: '#5b5570',
  taverner: '#a2734a',
  teacher: '#4f6a86',
  clerk: '#6a6f7d',
  scholar: '#4a5f7a',
  // gathering
  forester: '#4f7a4a',
  forager: '#7a9a52',
  hunter: '#6b5a3a',
  fisher: '#4d7f92',
  quarrier: '#85837c',
  digger: '#9a6f4a',
  herbalist: '#5f9a70',
  miner: '#5c5f6a',
  // food
  farmer: '#b09a4e',
  gardener: '#6f9a55',
  orchardist: '#a45c4a',
  miller: '#d0c4a0',
  baker: '#c79b62',
  poulterer: '#d8c98a',
  shepherd: '#cfc6b4',
  swineherd: '#b78a7c',
  dairymaid: '#e0dccd',
  cheesemaker: '#d8b45a',
  beekeeper: '#d6a23e',
  brewer: '#9c6a30',
  smoker: '#7a6250',
  trader: '#8a5f7a',
  // industry
  sawyer: '#a8814e',
  burner: '#4a4441',
  potter: '#a8604c',
  weaver: '#96729c',
  tanner: '#7f5a3c',
  smelter: '#5d6670',
  smith: '#4f5a62',
  founder: '#8a929b',
  chandler: '#e2c887',
  apothecary: '#5f9e8d',
  merchant: '#b08a3c',
  // military
  watchman: '#56636e',
  weaponsmith: '#6d6a5a',
  armourer: '#7a8590',
  fletcher: '#5f7a58',
};

/* ------------------------------------------------------------------ *
 * §10.2  Equipment tiers
 * ------------------------------------------------------------------ */

// Best kit first when equipping. `weapon`/`armour` are acceptable ids best
// first; a tier matches only if the soldier can be given one of each (tier 0
// needs nothing). `range` applies only when the equipped weapon is in
// `rangedWeapons` — a tier-3 man with a sword still fights in contact.
export const EQUIPMENT_TIERS = [
  {
    tier: 0, name: 'Militia',
    weapon: [], armour: [], shield: false,
    power: 4, shieldBonus: 0, range: 1, rangedWeapons: [],
  },
  {
    tier: 1, name: 'Spearman',
    weapon: ['spear'], armour: ['gambeson'], shield: false,
    power: 10, shieldBonus: 0, range: 1, rangedWeapons: [],
  },
  {
    tier: 2, name: 'Swordsman',
    weapon: ['sword'], armour: ['leather_armour'], shield: true,
    power: 18, shieldBonus: 4, range: 1, rangedWeapons: [],
  },
  {
    tier: 3, name: 'Man-at-arms',
    weapon: ['crossbow', 'sword'], armour: ['mail'], shield: true,
    power: 30, shieldBonus: 5, range: 4, rangedWeapons: ['crossbow'],
  },
  {
    tier: 4, name: 'Knight',
    weapon: ['halberd'], armour: ['plate'], shield: false,
    power: 52, shieldBonus: 0, range: 1, rangedWeapons: [],
  },
];

export const EQUIPMENT_BY_TIER = {};
for (let i = 0; i < EQUIPMENT_TIERS.length; i++) {
  EQUIPMENT_BY_TIER[EQUIPMENT_TIERS[i].tier] = EQUIPMENT_TIERS[i];
}

// Chance a kit is recovered from the field after a won battle (§10.2).
export const EQUIPMENT_RECOVERY_CHANCE = 0.5;

/* ------------------------------------------------------------------ *
 * §10.4  Enemies
 * ------------------------------------------------------------------ */

export const ENEMY_TYPES = [
  {
    id: 'bandit', name: 'Bandit', cost: 10, hp: 40, dmg: 6,
    speed: 0.9, range: 1, aura: null, unlockWave: 1,
    vsBuildingsOnly: false, colour: '#7a4a44', size: 5,
  },
  {
    id: 'raider', name: 'Raider', cost: 18, hp: 70, dmg: 10,
    speed: 0.85, range: 1, aura: null, unlockWave: 3,
    vsBuildingsOnly: false, colour: '#8e3f36', size: 5.5,
  },
  {
    id: 'crossbowman', name: 'Crossbowman', cost: 30, hp: 60, dmg: 14,
    speed: 0.8, range: 4, aura: null, unlockWave: 5,
    vsBuildingsOnly: false, colour: '#6d5a7a', size: 5.5,
  },
  {
    id: 'berserker', name: 'Berserker', cost: 34, hp: 120, dmg: 18,
    speed: 1.0, range: 1, aura: null, unlockWave: 6,
    vsBuildingsOnly: false, colour: '#a8452f', size: 6.5,
  },
  {
    id: 'ram', name: 'Battering Ram', cost: 60, hp: 300, dmg: 45,
    speed: 0.35, range: 1.2, aura: null, unlockWave: 7,
    vsBuildingsOnly: true, colour: '#6b5136', size: 9,
  },
  {
    id: 'warlord', name: 'Warlord', cost: 110, hp: 400, dmg: 35,
    speed: 0.8, range: 1, aura: { radius: 6, bonus: 0.2 }, unlockWave: 9,
    vsBuildingsOnly: false, colour: '#c0632a', size: 7.5,
  },
];

export const ENEMY_BY_ID = {};
for (let i = 0; i < ENEMY_TYPES.length; i++) ENEMY_BY_ID[ENEMY_TYPES[i].id] = ENEMY_TYPES[i];

export const RAID_FIRST_WARN_DAY = 10;
export const RAID_FIRST_DAY = 12;
export const RAID_WARN_DAYS = 2;
export const RAID_FLEE_HP_FRACTION = 0.7;

/* ------------------------------------------------------------------ *
 * §9.8  Town tiers
 * ------------------------------------------------------------------ */

// Sticky: tier never regresses (§16.5), so these are entry gates only.
export const TIERS = [
  { tier: 1, name: 'Hamlet', pop: 0, health: 0, happiness: 0, requires: [] },
  { tier: 2, name: 'Village', pop: 24, health: 45, happiness: 0, requires: ['granary', 'stockpile'] },
  // Re-baselined against measured peak population (ADDENDUM X3): the old 60/120
  // sat above the mean peak, so most towns could never reach Town however well
  // played. The Barracks is a tier-1 defence choice, not a civic milestone.
  // health 50 (ADDENDUM AE3) is three food groups and six foods; 58 was four to
  // five, which is what a City eats, and is still what tier 4 asks for.
  { tier: 3, name: 'Town', pop: 40, health: 50, happiness: 0, requires: ['market', 'chapel'] },
  { tier: 4, name: 'City', pop: 75, health: 68, happiness: 60, requires: ['keep', 'town_hall'] },
];

export const TIER_NAMES = TIERS.map((t) => t.name);

/* ------------------------------------------------------------------ *
 * ADDENDUM I1 + Z3  Static content invariants
 * ------------------------------------------------------------------ *
 * Two rules against one class of bug: content no player can ever reach. No
 * gameplay test finds it, because the player never sees the building work and
 * has no way to know why.
 *
 *   I1  Every item in a def's `cost` must be obtainable at that def's own
 *       tier. Obtainable is transitive and includes the producing building's
 *       own cost, so a chain whose first link is out of reach does not count —
 *       that is how the Iron Mine came to cost `tools`, which are smelted from
 *       the iron only that mine can dig.
 *   Z3  A tier-N gate may require only buildings of tier <= N-1. Tier 4 once
 *       required two tier-4 buildings, and `canPlace` refuses `tier > current`,
 *       so City was unreachable on every seed.
 *
 * `wood` is the only seed: §16.1 guarantees it can always be hand-gathered.
 * START_STOCK is deliberately not a seed — a one-off crate is not a supply.
 */

function defOutputs(d, have, add) {
  if (d.gathers) {
    add(d.gathers.item);
    if (d.gathers.alt) add(d.gathers.alt.item);
    if (d.gathers.byproduct) add(d.gathers.byproduct.item);
  }
  if (d.grows) {
    add(d.grows.item);
    if (d.grows.alt) add(d.grows.alt.item);
  }
  // A multi-recipe workshop runs whichever recipes it has inputs for, so each
  // is weighed on its own: a starved sword line does not starve the spears.
  const rs = d.recipes || (d.recipe ? [d.recipe] : []);
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i];
    let fed = true;
    for (const k in (r.in || {})) if (!have.has(k)) { fed = false; break; }
    if (fed) for (const k in (r.out || {})) add(k);
  }
}

/** Every item a player who has reached `tier` can put their hands on. */
export function obtainableAt(tier, defs) {
  const list = defs || BUILDINGS;
  const have = new Set(['wood', 'coin']);   // §16.1 hand-gathering; §9.7 taxes
  const add = (id) => { if (id && !have.has(id)) { have.add(id); grew = true; } };
  let grew = true;
  while (grew) {
    grew = false;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (d.tier > tier) continue;
      let affordable = true;
      for (const k in (d.cost || {})) if (!have.has(k)) { affordable = false; break; }
      if (!affordable) continue;
      defOutputs(d, have, add);
    }
  }
  return have;
}

/** I1 + Z3, as a list of human-readable violations. Empty means green. */
export function contentViolations(defs, tiers) {
  const list = defs || BUILDINGS;
  const gates = tiers || TIERS;
  const out = [];
  const maxTier = list.reduce((m, d) => (d.tier > m ? d.tier : m), 1);
  const reach = [];
  for (let t = 1; t <= maxTier; t++) reach[t] = obtainableAt(t, list);

  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    const have = reach[d.tier] || reach[maxTier];
    for (const k in (d.cost || {})) {
      if (!have.has(k)) {
        out.push('I1: ' + d.id + ' (tier ' + d.tier + ') costs ' + k
          + ', which nothing reachable at tier ' + d.tier + ' can produce');
      }
    }
  }

  const byId = {};
  for (let i = 0; i < list.length; i++) byId[list[i].id] = list[i];
  for (let i = 0; i < gates.length; i++) {
    const g = gates[i];
    const req = g.requires || [];
    for (let k = 0; k < req.length; k++) {
      const d = byId[req[k]];
      if (!d) { out.push('Z3: tier ' + g.tier + ' requires "' + req[k] + '", which is not a building'); continue; }
      if (d.tier > g.tier - 1) {
        out.push('Z3: tier ' + g.tier + ' requires ' + d.id + ', a tier-' + d.tier
          + ' building — a tier-N gate may only require buildings of tier <= N-1');
      }
    }
    // AF2: a tier-N health gate must be reachable on the food roster of tier
    // N-1, with room to spare. `healthTarget` is variety plus modifiers minus
    // penalties (§9.4); the ceiling below counts variety alone, so a gate that
    // only just clears it is a gate no real town passes — a Winter without
    // wood costs 12 points and one starving day costs 31. This is the check
    // that would have caught the Hamlet trap: three groups and four items at
    // tier 1 ceilinged healthTarget at 47.9 against a gate of 45, and every
    // building that widens the diet stood behind that same gate.
    if (g.health > 0 && g.tier > 1) {
      const have = reach[g.tier - 1] || reach[1];
      const gs = {};
      let items = 0;
      for (let k = 0; k < ITEM_LIST.length; k++) {
        const it = ITEM_LIST[k];
        if (it.cls !== 'food' || !have.has(it.id)) continue;
        items++;
        gs[it.group] = true;
      }
      const ceiling = HEALTH_BASE
        + Math.min(100, Object.keys(gs).length * 11 + items * 2.2) * VARIETY_HEALTH;
      if (ceiling < g.health + TIER_HEALTH_HEADROOM) {
        out.push('AF2: tier ' + g.tier + ' needs health ' + g.health
          + ', but the tier-' + (g.tier - 1) + ' food roster ceilings healthTarget at '
          + ceiling.toFixed(1) + ' (' + Object.keys(gs).length + ' groups, ' + items
          + ' items) — a gate needs ' + TIER_HEALTH_HEADROOM + ' points of headroom');
      }
    }
  }
  return out;
}

// Runs once, at import of the root module, so nothing — game, save, or QA
// harness — can start on a table that has re-broken either rule.
const CONTENT_VIOLATIONS = contentViolations();
if (CONTENT_VIOLATIONS.length) {
  const msg = 'Hearthmere content invariant violated (' + CONTENT_VIOLATIONS.length
    + '):\n  ' + CONTENT_VIOLATIONS.join('\n  ');
  if (typeof console !== 'undefined') console.error(msg);
  throw new Error(msg);
}

/* ------------------------------------------------------------------ *
 * §8  Names
 * ------------------------------------------------------------------ */

export const NAMES = {
  given: [
    'Alder', 'Aldith', 'Alric', 'Anselm', 'Arne', 'Asger', 'Astrid', 'Audra',
    'Bede', 'Bergit', 'Bjorn', 'Brand', 'Bryn', 'Cedric', 'Cuthbert', 'Dagny',
    'Dunstan', 'Edith', 'Edmund', 'Egil', 'Eirik', 'Elgar', 'Elspeth', 'Emric',
    'Eyvind', 'Freya', 'Frida', 'Gerd', 'Godric', 'Gunnar', 'Hakon', 'Halla',
    'Harald', 'Hilda', 'Ingrid', 'Ivar', 'Kettil', 'Leif', 'Leofric', 'Maerwyn',
    'Magnus', 'Mildred', 'Njal', 'Oddr', 'Osric', 'Oswin', 'Ragna', 'Roderic',
    'Rowena', 'Rurik', 'Sigrid', 'Sigurd', 'Sten', 'Svend', 'Thora', 'Torvald',
    'Ulf', 'Wilfred', 'Winfrid', 'Wulfstan',
  ],
  byname: [
    'Fenwick', 'Ashdown', 'Thornbury', 'Harrowgate', 'Blackmere', 'Stonecroft',
    'Aldervale', 'Westmarch', 'Rookwood', 'Hollowby', 'Greyfell', 'Marshend',
    'Oakhurst', 'Ironhill', 'Coldbeck', 'Ravensby', 'Millward', 'Fairholme',
    'Longstride', 'Elmshaw', 'Barrowfield', 'Nethergill', 'Wolfden', 'Skerry',
    'Highfen', 'Brackenmoor', 'Dunwold', 'Stormby', 'Redbarrow', 'Yarrowdale',
  ],
};

/* ------------------------------------------------------------------ *
 * §7 / §13  Alerts
 * ------------------------------------------------------------------ */

// Keyed by the FROZEN idle-reason strings plus the town-wide problems the
// alerts panel raises. severity 3 = the town is losing something right now,
// 2 = production is stopped, 1 = informational.
// `'no materials: <item>'` and `'no storage: <class>'` carry a parameter after
// the colon and are matched on the prefix by alertFor().
/** AF3's third state between 'output full' and 'no storage'. Shared because
 *  buildings.js writes it and villagers.js routes idle workers off it — two
 *  spellings of the same string would strand a whole crew at the door. */
export const IDLE_AT_CAPACITY = 'idle at capacity';

export const ALERTS = {
  'no road': { label: 'Not connected to a road', severity: 3 },
  // Distinct from 'no road' on purpose: a road touches this building, so more
  // road beside it changes nothing. `say`/`fix` ride along here because the
  // remedy is the whole point of splitting the two reasons (§16.8).
  'cut off': {
    label: 'Cut off from the town centre',
    severity: 3,
    say: 'A road touches it, but no route runs back to the town centre.',
    fix: 'This building has a road, but no route back to the town centre — connect the two.',
  },
  // ADDENDUM AQ11. Not a fourth way of saying 'cut off': a severed site or
  // repair usually carries 'cut off' too, and that row says where the break is.
  // This one says what the break COSTS — a site that can never be reached still
  // holds its whole reservation out of `available()`, so builds are refused
  // across a town that visibly has the timber. Nothing else names that, and the
  // player cannot deduce it. Its remedies are the two 'cut off' cannot offer:
  // bridge the water, or cancel and take the materials back.
  'no route': {
    label: 'Materials reserved by something nothing can reach',
    severity: 3,
    say: 'The town holds what it is waiting for, and no walkable route joins the two — so no carrier is ever sent, and what it reserved is held back from every other build.',
    fix: 'Bridge the water or path the gap; more road beside it does nothing.',
  },
  'no workers': { label: 'No workers assigned', severity: 2 },
  'no materials': { label: 'Waiting on materials', severity: 2 },
  'output full': { label: 'Output buffer full', severity: 2 },
  'resource exhausted': { label: 'Resource exhausted — relocate', severity: 3 },
  'out of season': { label: 'Out of season', severity: 1 },
  paused: { label: 'Paused by you', severity: 1 },
  night: { label: 'Asleep for the night', severity: 1 },
  'under construction': { label: 'Under construction', severity: 1 },
  'no storage': { label: 'No storage with room for this', severity: 3 },
  // AF3. Severity 1 on purpose: the town has all of this it can use, which is
  // a resting state and not a problem, so it belongs in the inspector and not
  // in the alerts panel beside a starving town.
  'idle at capacity': {
    label: 'Full — nothing needs more',
    severity: 1,
    say: 'Its store is full and nothing in the valley is short of what it makes.',
    fix: 'Nothing to do. It starts again the moment something wants one.',
  },
  starving: { label: 'The town is starving', severity: 3 },
  homeless: { label: 'Villagers have no home', severity: 2 },
  unemployed: { label: 'Villagers have no work', severity: 1 },
  'no soldiers': { label: 'No soldiers to defend the town', severity: 3 },
  'food low': { label: 'Less than five days of food', severity: 3 },
  'storage full': { label: 'Storage is full', severity: 2 },
};

/** Alert entry for an idle reason, tolerating the `'no materials: flour'` and
 *  `'no storage: good'` parameterised forms. */
export function alertFor(reason) {
  if (!reason) return null;
  if (ALERTS[reason]) return ALERTS[reason];
  const colon = reason.indexOf(':');
  if (colon > 0) return ALERTS[reason.slice(0, colon)] || null;
  return null;
}

/* ------------------------------------------------------------------ *
 * Starting stock (§16 — day one must be playable)
 * ------------------------------------------------------------------ */

export const START_STOCK = { wood: 40, stone: 20, plank: 10, bread: 20, fish: 10 };
export const START_VILLAGERS = 10;
export const FREE_BUILDS = 3;   // §16.2, the first three sites auto-complete

export const SAVE_KEY = 'hearthmere_save';
export const INTRO_KEY = 'hearthmere_seen_intro';
export const SAVE_VERSION = 1;
