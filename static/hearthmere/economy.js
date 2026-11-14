// Hearthmere — global accounting, the haul-task queue, nutrition, population,
// happiness, coin and town tier. DESIGN.md §9.
//
// Three invariants govern this file:
//
//  1. CONSERVATION OF MATTER IS NOT THIS MODULE'S LEDGER — it is buildings.js's.
//     economy owns no pile of goods. It reads `buildings.stockTotals()` /
//     `reservedTotals()` and moves goods only by asking buildings.js and
//     villagers.js to move them. A second ledger here would double-count:
//     `stock()` therefore never adds construction-site `delivered`, because
//     that is already netted out of `reserved()`.
//  2. `stock()` IS READ EVERY FRAME. It never walks the world; it returns a
//     cached total recomputed at most once per tick (§9.1).
//  3. A TASK IS RECONCILED, NEVER REBUILT. A porter halfway across the valley
//     keeps the task in hand; only impossible tasks are cancelled, and a
//     cancel always leaves the goods somewhere real (§16.4).

import * as C from './constants.js';
import * as U from './utils.js';

/* ------------------------------------------------------------------ *
 * Local tuning (the numbers §9 leaves to this module)
 * ------------------------------------------------------------------ */

/** §16.1 — the by-hand wood fallback, one wood per this many game-seconds. */
export const HAND_GATHER_SECONDS = 8;
/** A task younger than this may only be claimed by a porter (§9.3 first refusal). */
export const PORTER_GRACE = 3;
export const TAX_PER_POP = 0.12;
export const TAX_HAPPINESS_DIV = 60;
export const ARREARS_HAPPINESS_PER_DAY = 5;
/** §9.7 says -5/day with no floor; unbounded is a death spiral, so it caps. */
export const ARREARS_PENALTY_CAP = 30;
export const CARAVAN_INTERVAL_DAYS = 6;
export const CARAVAN_UNITS = 40;
export const CARAVAN_SPEED = 0.55;
export const BUY_MARKUP = 1.6;
export const STORAGE_WARN_FRACTION = 0.12;
export const MARKET_RESTOCK_FRACTION = 0.6;
export const ADULT_AGE = 16;
export const RAID_GRIEF_DAYS = 6;
/** A store task is only worth a porter's walk once the buffer is half full. */
export const STORE_TRIGGER_FRACTION = 0.5;
/**
 * ADDENDUM W2 — the share of its own buffer at which a gatherer stops going out
 * and runs the load in itself. Lower than the porter trigger because the worker
 * is already standing at the source: the trip costs them only the walk they
 * were about to spend on a node.
 */
export const WORKER_HAUL_FRACTION = 0.35;
/** Emigration pace while unhappy or starving (§9.5 gives no rate). */
// Grace before anyone emigrates: a new settlement gets its first week.
export const SETTLING_DAYS = 7;
export const EMIGRATION_BASE = 1;
export const EMIGRATION_PER_POP = 40;
/**
 * §8 clamps `v.hunger` to 0..1, so this must sit *under* 1: anything at or
 * above the ceiling is structurally unreachable and makes `hungryCount` a
 * constant 0. A villager sets out urgently at 0.9, so 0.95 is "went looking
 * for a meal and did not get one" — the honest evidence of a famine.
 */
export const STARVING_HUNGER = 0.95;
export const STARVING_SHARE = 0.5;
/**
 * A town that is visibly feeding itself is not starving however many people
 * happen to be between meals, so the hungry-share test only counts on a day
 * whose intake also fell this far short of what the town needed.
 */
export const STARVING_INTAKE_SHARE = 0.5;
/**
 * §9.4's "individual health drifts toward townHealth ± their own hunger
 * penalty", at the same 0.25/day pace as `townHealth`. A villager who is never
 * hungry runs `HEALTH_WELLFED_BONUS` above the town's figure; one pinned at the
 * hunger ceiling runs at it exactly, so a famine that takes `townHealth` to 0
 * takes its people under §9.4's illness line of 25 with it.
 *
 * The bonus is load-bearing, not decoration: §8 scales walking speed off
 * `v.health`, against a curve calibrated for the flat 70 villagers spawn at.
 * 42 keeps the median villager (day-end hunger 0.45, equilibrium `townHealth`
 * ~47) on that 70, so honouring §9.4 costs a fed town no speed.
 */
export const HEALTH_DRIFT = 0.25;
export const HEALTH_WELLFED_BONUS = 42;
/**
 * §9.4's healthTarget floor — what the formula returns for a town with no
 * variety at all. It is also the seed `townHealth` starts from, so a town
 * can only ever hold a health figure its own larder has earned (ADDENDUM Z1).
 */
export const HEALTH_BASE = C.HEALTH_BASE;
/**
 * L2 — a food counts toward variety if it is stored in quantity OR the town ate
 * it this recently. Since J2 food moves Granary → larder → villager, so a
 * healthy economy holds almost nothing still and counting only the stores
 * scored a town eating four foods a day as eating nothing.
 */
export // Player-facing names for the storage classes; the raw ids read as typos.
const CLASS_NAME = { good: 'goods', food: 'food', arms: 'arms' };

export const VARIETY_EATEN_DAYS = 3;

/* --- J2: the household larder ------------------------------------- */
/** Used only if a housing def predates `foodCap`; the def wins when present. */
export const HOUSE_FOOD_CAP = 6;
/** A larder is only worth a porter's walk once it is this far down. */
export const FEED_TRIGGER_FRACTION = 0.5;
/**
 * No single food may take more than this share of a larder. §9.4's variety has
 * to survive the move indoors: a villager can only choose across groups if the
 * delivery was a mix, so the cap is enforced here rather than left to
 * `capacityFor`, whose floor lets one item fill a buffer this small.
 */
export const FEED_ITEM_FRACTION = 0.5;
/**
 * Batching. Two open deliveries per house is the whole throttle: it keeps the
 * queue bounded at ~2 per household while letting two *different* groups land
 * in the same larder, which is what the villager's choice needs to bite on.
 */
export const FEED_TASKS_PER_HOUSE = 2;
/** Never post a one-unit errand; a porter's walk has to be worth something. */
export const FEED_MIN_BATCH = 2;

/* --- N5.1: production outranks the larder -------------------------- */
/**
 * A production building is "short" of a recipe input while it holds fewer than
 * this many batches' worth. That shortfall is held back from the larders: a
 * town that eats its seed corn produces no bread. Everything above it is
 * surplus and the houses may have it, so a fishing town still eats fish while
 * its smokehouse runs.
 */
export const PRODUCTION_RESERVE_BATCHES = 4;

const EMPTY = [];
/** §9.3 / J2.2 task priority. An unknown kind sorts last rather than NaN. */
const KIND_RANK = { build: 0, feed: 1, supply: 2, store: 3 };
const KIND_RANK_LAST = 4;
/**
 * U2 — a delivery into an empty larder outranks one into a merely low larder,
 * but still loses to a build task: a half-finished building blocks the town
 * harder than a late meal, and N5's budget (not this rank) is what keeps the
 * production chains fed.
 */
const FEED_RANK_DRY = 0.5;
const FOOD_GROUP_COUNT = C.FOOD_GROUP_IDS.length;

const GROUP_INDEX = {};
for (let i = 0; i < C.FOOD_GROUP_IDS.length; i++) GROUP_INDEX[C.FOOD_GROUP_IDS[i]] = i;

// Food ids bucketed by group, for the "eat from the group you have neglected
// longest" rule in §9.4. villagers.js has its own copy of the choice; this
// backs economy.eat(), used by callers that want economy to drive the meal.
const FOODS_BY_GROUP = [];
for (let i = 0; i < FOOD_GROUP_COUNT; i++) FOODS_BY_GROUP.push([]);
for (let i = 0; i < C.FOOD_IDS.length; i++) {
  const it = C.ITEMS[C.FOOD_IDS[i]];
  FOODS_BY_GROUP[GROUP_INDEX[it.group]].push(it.id);
}

function newGroupLists() {
  const a = [];
  for (let i = 0; i < FOOD_GROUP_COUNT; i++) a.push([]);
  return a;
}

export const STORAGE_CLASSES = ['food', 'good', 'arms'];

// §16.1's floor, in timber: the cheapest building that produces wood, plus a
// short road to reach it. Below this a town with no Woodcutter cannot buy its
// way out, however many splinters it holds, so the hand-gather must be open.
const ROAD_ALLOWANCE_WOOD = 10;
const HAND_GATHER_WOOD_FLOOR = (() => {
  let cheapest = Infinity;
  for (let i = 0; i < C.BUILDINGS.length; i++) {
    const def = C.BUILDINGS[i];
    const g = def.gathers, w = def.grows;
    const makesWood = (g && g.item === 'wood') || (w && w.item === 'wood');
    if (!makesWood) continue;
    const n = (def.cost && def.cost.wood) || 0;
    if (n < cheapest) cheapest = n;
  }
  return (cheapest === Infinity ? 0 : cheapest) + ROAD_ALLOWANCE_WOOD;
})();

// One representative item per storage class. Per-class room is asked of
// buildings.capacityFor with one of these, so economy never has to know how
// the per-class cap is spelled.
const CLASS_PROBE = {};
for (let i = 0; i < C.ITEM_IDS.length; i++) {
  const id = C.ITEM_IDS[i];
  if (id === 'coin') continue;
  const cls = C.itemClass(id);
  if (!CLASS_PROBE[cls]) CLASS_PROBE[cls] = id;
}

function invQty(b, item) {
  if (!b || !b.inv) return 0;
  const q = b.inv[item];
  return q > 0 ? q : 0;
}

function centreX(b) { return b.x + (b.w || 1) * 0.5; }
function centreY(b) { return b.y + (b.h || 1) * 0.5; }

function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

/* ================================================================== *
 * Economy
 * ================================================================== */

class Economy {
  constructor(game) {
    this.game = game;
    this.bus = game ? game.bus : null;

    // --- §9.1 accounting (all three are caches over buildings.js) ----
    this.totals = {};
    this.storedTotals = {};
    this.reservedTotals = {};
    this._totalsTick = -1;
    this._tick = 0;

    // --- §9.3 tasks ---------------------------------------------------
    this.tasks = [];
    this.taskById = new Map();
    this.openKeys = new Set();     // "from>to|item", one open task per triple
    this.claims = new Map();       // "from|item" -> qty soft-reserved at source
    this.incoming = new Map();     // "to|item"   -> qty already on its way
    this.nextTaskId = 1;
    this.rebuildTimer = 0;
    this._stores = [];

    // --- §9.4 nutrition / health --------------------------------------
    // §9.4's formula supplies the real opening figure on the first tick, once
    // the boot sequence has stocked the larder (`_seedNutrition`). Until then
    // this is that same formula's answer for an empty store — a placeholder for
    // a paint before the first update, never a floor a town is given (Z1).
    this.townHealth = HEALTH_BASE;
    this.healthTarget = HEALTH_BASE;
    // `items` and `byGroup` are the qualifying set itself, so the §13 meter and
    // its tooltip read the same answer instead of re-deriving one from stored().
    this.nutrition = {
      varietyScore: 0, distinctItems: 0, distinctGroups: 0,
      groups: new Array(FOOD_GROUP_COUNT).fill(false),
      missing: [],
      items: [],
      byGroup: newGroupLists(),
    };
    // item id -> day it was last eaten anywhere in town (L2).
    this.eatenOn = new Map();
    this.starvingDays = 0;
    // G5: frozen at 0 — there is no plague system. The property and its
    // healthTarget term stay so one can be added without touching the formula.
    this.recentPlagueDays = 0;
    this.consumedUnits = 0;    // nutrition units eaten today
    this.consumedYesterday = 0;
    this.groupRecency = new Map();

    // --- §9.5 population ------------------------------------------------
    this.population = 0;
    this.adults = 0;
    this.housingCapacity = 0;
    this.homeless = 0;
    this.unemployed = 0;
    this.employed = 0;
    this.hungryCount = 0;
    this.raidDeaths = new Array(RAID_GRIEF_DAYS).fill(0);
    this.raidDeathCursor = 0;
    this.births = 0;
    this.arrivals = 0;
    this.departures = 0;
    this.deaths = 0;

    // --- §9.6 / §9.7 ----------------------------------------------------
    this.happiness = 50;
    this.happinessParts = null;
    this.coin = 20;
    this.arrears = 0;
    this.arrearsPenalty = 0;
    this.dailyTax = 0;
    this.dailyUpkeep = 0;
    this.productionBonus = 1;
    this.taxBonus = 1;

    // --- §9.7 trade -----------------------------------------------------
    this.tradeOrders = { sell: {}, buy: {} };
    this.caravans = [];
    this.nextCaravanDay = 0;

    // --- §9.8 tier ------------------------------------------------------
    this.tier = 1;

    // --- reporting --------------------------------------------------------
    this.alerts = [];
    // ADDENDUM AQ11. Wants that no haul can ever serve because the only holder
    // of the goods sits in a different walkable region. Rebuilt from scratch on
    // the task cadence, so it clears itself the moment the gap is bridged.
    this.stranded = [];
    this.strandedReserved = Object.create(null);
    this._strandedBy = new Map();
    // Set only for the duration of one `_findSource` probe (see _noteStranded).
    this._regionBlind = false;
    this.storagePressure = { food: 1, good: 1, arms: 1 };
    this._storageWarned = { food: false, good: false, arms: false };
    this.debug = {
      timeouts: 0, cancels: 0, created: 0, completed: 0,
      duplicatesBlocked: 0, overclaimBlocked: 0, stockRecomputes: 0,
      shortDeliveries: 0, staleDropped: 0,
    };

    this._lastDay = 0;
    this._dayFloat = 1;
    this._rng = new U.RNG(0x5eed1);
    this._houseCounts = new Map();
    this._scratchRemain = new Map();
    // J2 feed scratch: residents per house, and the houses that already have a
    // feed task in flight. Both are rebuilt from scratch on the task cadence,
    // so neither can drift out of step with the queue.
    this._feedCounts = new Map();
    this._feedBusy = new Map();
    // U2: houses whose larder is empty, and houses a porter is already
    // carrying food to. Same cadence, so both are at most one rebuild stale.
    this._dryLarders = new Set();
    this._feedEnRoute = new Set();
    // N5.1: food item -> units the larders and markets may still claim this
    // rebuild, after production's shortfall is held back.
    this._feedBudget = new Map();
    // "defId|item" -> is that item one of this def's outputs (N5.2).
    this._producesCache = new Map();
    // houseId -> Float32Array(6) of the day each food group was last delivered
    // there.
    this.feedRecency = new Map();
    this._carryScratch = {};
    this._boundDay = null;
    this._boundDestroyed = null;
    this._boundDied = null;
    this._boundGone = null;
    this._bTakeOverflow = false;
    this._bOverflowNode = false;
    // One-element list so the pool can go through the same _nearestSource as
    // any other candidate without allocating on the task cadence.
    this._poolScratch = [null];
    this._nutritionSeeded = false;
  }

  /* ---------------------------------------------------------------- *
   * Lifecycle
   * ---------------------------------------------------------------- */

  init() {
    const g = this.game;
    this.world = g.world;
    this.paths = g.paths;
    this.buildings = g.buildings;
    this.villagers = g.villagers;
    this.bus = g.bus;

    const B = this.buildings, V = this.villagers, P = this.paths;
    this._bStockTotals = !!(B && typeof B.stockTotals === 'function');
    this._bReservedTotals = !!(B && typeof B.reservedTotals === 'function');
    this._bStorages = !!(B && typeof B.storages === 'function');
    this._bOutputs = !!(B && typeof B.outputs === 'function');
    this._bWants = !!(B && typeof B.wants === 'function');
    this._bHasBuilt = !!(B && typeof B.hasBuilt === 'function');
    this._bHousing = !!(B && typeof B.housingCapacity === 'function');
    this._bUpkeep = !!(B && typeof B.upkeepTotal === 'function');
    this._bGet = !!(B && typeof B.get === 'function');
    this._bTakeOverflow = !!(B && typeof B.takeOverflow === 'function' && typeof B.add === 'function');
    this._bOverflowNode = !!(B && typeof B.overflowNode === 'function');
    this._bHasStorage = !!(B && typeof B.hasStorage === 'function');
    this._bRepairing = !!(B && typeof B.isRepairing === 'function');
    this._vGet = !!(V && typeof V.get === 'function');
    this._sameRegion = !!(P && typeof P.sameRegion === 'function');

    if (this.bus) {
      this._boundDay = (p) => this.onDayEnded(p && p.day);
      this._boundDestroyed = (p) => this.onBuildingRemoved(p && p.id);
      this._boundDied = (p) => this._onDiedEvent(p);
      // ADDENDUM AH2: an emigrant and a corpse leave the same hole, and only
      // the corpse emits `villager:died` — `finishLeaving()` sets `removed` and
      // emits `villager:left` alone. Both must be heard, or a row survives a
      // villager that `villagers.serialize()` no longer carries.
      this._boundGone = (p) => this._onVillagerGone(p);
      this.bus.on('day:ended', this._boundDay);
      this.bus.on('building:destroyed', this._boundDestroyed);
      this.bus.on('villager:died', this._boundDied);
      this.bus.on('villager:left', this._boundGone);
    }
    this.invalidateStock();
    this._censusLight();
  }

  update(dt, game) {
    this._tick++;
    if (game) this.game = game;
    const w = this.world;
    if (w && w.clock) this._dayFloat = w.clock.day + (w.clock.timeOfDay || 0);
    this.ensureTotals();
    this._censusLight();
    if (!this._nutritionSeeded) this._seedNutrition();

    // §9.3 timeouts. Backwards index loop so cancellation can splice.
    const tasks = this.tasks;
    for (let i = tasks.length - 1; i >= 0; i--) {
      const t = tasks[i];
      t.age += dt;
      if (t.age >= C.TASK_TIMEOUT) {
        this.debug.timeouts++;
        this.cancelTask(t, 'timeout');
      }
    }

    this.rebuildTimer += dt;
    if (this.rebuildTimer >= C.TASK_REBUILD_INTERVAL) {
      this.rebuildTimer -= C.TASK_REBUILD_INTERVAL;
      if (this.rebuildTimer > C.TASK_REBUILD_INTERVAL) this.rebuildTimer = 0;
      this.drainOverflow();
      this.rebuildTasks(this.game);
    }

    if (this.caravans.length > 0) this._updateCaravans(dt);
  }

  /* ---------------------------------------------------------------- *
   * Neighbour access
   * ---------------------------------------------------------------- */

  allBuildings() {
    const B = this.buildings;
    if (!B) return EMPTY;
    return B.list || B.all || EMPTY;
  }

  allVillagers() {
    const V = this.villagers;
    if (!V) return EMPTY;
    return V.list || V.all || EMPTY;
  }

  storages() {
    if (this._bStorages) return this.buildings.storages();
    const out = this._stores;
    out.length = 0;
    const bs = this.allBuildings();
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!b || b.removed || !b.built) continue;
      const d = this.defOf(b);
      if (d && d.storage) out.push(b);
    }
    return out;
  }

  getBuilding(id) {
    if (!(id >= 0)) return null;
    const B = this.buildings;
    if (!B) return null;
    if (this._bGet) return B.get(id) || null;
    const arr = this.allBuildings();
    for (let i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  getVillager(id) {
    if (!(id >= 0)) return null;
    const V = this.villagers;
    if (!V) return null;
    if (this._vGet) return V.get(id) || null;
    const arr = this.allVillagers();
    for (let i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  defOf(b) { return b ? (b.def || C.BUILDING_BY_ID[b.defId] || null) : null; }

  doorOf(b) { return b.doorIdx >= 0 ? b.doorIdx : U.toIdx(b.x | 0, b.y | 0); }

  /**
   * A walkable tile to region-test a building from. §7 lets `doorIdx` fall back
   * to a footprint tile when nothing road-adjacent exists, and a footprint tile
   * of a solid building is not walkable — region-testing that answers -1 for
   * every such building and would reject every task it is party to.
   */
  _anchor(b) {
    const w = this.world;
    if (!w || typeof w.isWalkable !== 'function') return this.doorOf(b);
    const d = b.doorIdx;
    if (d >= 0 && w.isWalkable(d)) return d;
    const x0 = b.x - 1, y0 = b.y - 1;
    const x1 = b.x + (b.w || 1), y1 = b.y + (b.h || 1);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (x > x0 && x < x1 && y > y0 && y < y1) continue;   // perimeter only
        if (!U.inBounds(x, y)) continue;
        const idx = U.toIdx(x, y);
        if (w.isWalkable(idx)) return idx;
      }
    }
    return -1;
  }

  /**
   * ADDENDUM E4 — always `paths.sameRegion`, never two `regionOf` lookups:
   * unwalkable tiles both answer -1 and would compare as connected.
   * A building with no walkable tile at all is not silently starved of tasks;
   * its own `'no road'` reason is the honest explanation, and blocking the
   * queue on top of it would be an invisible stall.
   */
  sameRegion(a, b) {
    // AQ11's probe asks what `_findSource` would have answered with the region
    // gate and nothing else removed. Held for one synchronous call only.
    if (this._regionBlind) return true;
    if (!this._sameRegion) return true;
    const ia = this._anchor(a);
    if (ia < 0) return true;
    const ib = this._anchor(b);
    if (ib < 0) return true;
    return this.paths.sameRegion(ia, ib) !== false;
  }

  /* ---------------------------------------------------------------- *
   * §9.1  Global accounting
   * ---------------------------------------------------------------- */

  /** Force the next `stock()` read to recount (placement, load, demolition). */
  invalidateStock() { this._totalsTick = -1; }

  /**
   * Patch the cached totals for a move economy already knows about, instead of
   * throwing the whole count away — a busy tick completes dozens of hauls and
   * a full recount per haul is exactly the per-frame walk §9.1 forbids. Drift
   * cannot accumulate: the next tick recounts unconditionally.
   */
  _adjust(item, dStock, dStored) {
    if (this._totalsTick !== this._tick) return;
    if (dStock) this.totals[item] = (this.totals[item] || 0) + dStock;
    if (dStored) this.storedTotals[item] = (this.storedTotals[item] || 0) + dStored;
  }

  ensureTotals() {
    if (this._totalsTick === this._tick) return;
    this._totalsTick = this._tick;
    this.debug.stockRecomputes++;

    const t = this.totals, s = this.storedTotals, r = this.reservedTotals;
    const ids = C.ITEM_IDS;
    for (let i = 0; i < ids.length; i++) { t[ids[i]] = 0; s[ids[i]] = 0; r[ids[i]] = 0; }

    const B = this.buildings;
    if (this._bStockTotals) {
      // buildings.js is the source of truth: every b.inv plus its overflow
      // pool, deliberately EXCLUDING site `delivered` (already in reserved).
      B.stockTotals(t);
    } else {
      const bs = this.allBuildings();
      for (let i = 0; i < bs.length; i++) {
        const inv = bs[i] && bs[i].inv;
        if (!inv) continue;
        for (const k in inv) { const q = inv[k]; if (q > 0) t[k] = (t[k] || 0) + q; }
      }
    }
    if (this._bReservedTotals) B.reservedTotals(r);

    // Goods in transit are real goods (pillar 3).
    const V = this.villagers;
    let carried = V ? V.carriedTotals : null;
    if (typeof carried === 'function') {
      const scratch = this._carryScratch;
      for (const k in scratch) scratch[k] = 0;
      carried = V.carriedTotals(scratch);
    }
    if (carried) {
      for (const k in carried) { const q = carried[k]; if (q > 0) t[k] = (t[k] || 0) + q; }
    } else {
      const vs = this.allVillagers();
      for (let i = 0; i < vs.length; i++) {
        const c = vs[i] && vs[i].carry;
        if (c && c.item && c.qty > 0) t[c.item] = (t[c.item] || 0) + c.qty;
      }
    }

    const stores = this.storages();
    for (let i = 0; i < stores.length; i++) {
      const inv = stores[i].inv;
      if (!inv) continue;
      for (const k in inv) { const q = inv[k]; if (q > 0) s[k] = (s[k] || 0) + q; }
    }

    // Coin is a ledger, not a pile — it has no storage home.
    t.coin = Math.floor(this.coin);
  }

  stock(item) {
    this.ensureTotals();
    const q = this.totals[item];
    return q > 0 ? q : 0;
  }

  stored(item) {
    this.ensureTotals();
    const q = this.storedTotals[item];
    return q > 0 ? q : 0;
  }

  reserved(item) {
    this.ensureTotals();
    const q = this.reservedTotals[item];
    return q > 0 ? q : 0;
  }

  available(item) {
    if (item === 'coin') return Math.floor(this.coin);
    const a = this.stock(item) - this.reserved(item);
    return a > 0 ? a : 0;
  }

  /** Total nutrition units in the world (§9.4 "food units"). */
  foodUnits() {
    this.ensureTotals();
    const ids = C.FOOD_IDS;
    let u = 0;
    for (let i = 0; i < ids.length; i++) {
      const q = this.totals[ids[i]];
      if (q > 0) u += q * C.ITEMS[ids[i]].nutrition;
    }
    return u;
  }

  /**
   * No building left that can hold food, so P1's refund pool is the town's
   * larder: villagers walk to the town square and eat out of it directly.
   * villagers.poolFoodSource() gates on exactly this, so both sides of the
   * seam mean the same thing by "reachable".
   */
  poolIsTheLarder() {
    const stores = this.storages();
    for (let i = 0; i < stores.length; i++) {
      const b = stores[i];
      // `active` is deliberately not tested: villagers.foodStores does not
      // test it either, and the two must agree or the starvation line is
      // measured against food nobody will walk to.
      if (!b || b.removed || !b.built) continue;
      const d = this.defOf(b);
      if (d && d.storage && d.storage.classes.indexOf('food') >= 0) return false;
    }
    return true;
  }

  /**
   * The same units minus the refund pool, which feed tasks cannot reach (Q5).
   * This is what the town can actually eat, so it — not `foodUnits()` — is
   * what "cannot meet foodNeededPerDay" has to be measured against: a town
   * whose storages burned holds tens of units it will starve beside. The
   * exception is a town with no food store at all, where the pool is the only
   * larder and villagers eat from it in person.
   */
  reachableFoodUnits() {
    this.ensureTotals();
    // Only `stockTotals` folds the pool into `totals`; the fallback walk in
    // `ensureTotals` never sees it, and subtracting there would double-count.
    const pool = this._bStockTotals && this.buildings && !this.poolIsTheLarder()
      ? this.buildings.overflow : null;
    const ids = C.FOOD_IDS;
    let u = 0;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      let q = this.totals[id];
      if (pool && pool[id] > 0) q -= pool[id];
      if (q > 0) u += q * C.ITEMS[id].nutrition;
    }
    return u;
  }

  seasonMult() {
    const w = this.world;
    const season = w && w.clock ? w.clock.season : 0;
    return season === C.SEASON_WINTER ? C.WINTER_FOOD_MULT : 1;
  }

  foodNeededPerDay() {
    return this.population * C.FOOD_PER_DAY * this.seasonMult();
  }

  /** The number the player actually reads off the HUD. */
  daysOfFood() {
    const need = this.foodNeededPerDay();
    if (need <= 0) return Infinity;
    return this.foodUnits() / need;
  }

  /** The same, over food the town can actually get to. */
  reachableDaysOfFood() {
    const need = this.foodNeededPerDay();
    if (need <= 0) return Infinity;
    return this.reachableFoodUnits() / need;
  }

  healthFactor() { return 0.5 + 0.5 * (this.townHealth / 100); }

  /**
   * Hunger per villager per second (G4). villagers.js calls this for every
   * agent every tick, so it stays three reads and a compare. §9.4's Winter
   * multiplier is the term `daysOfFood()` shares, which is what keeps the HUD
   * and actual consumption from drifting 25% apart.
   */
  hungerRatePerSecond() {
    return this.seasonMult() / C.DAY_SECONDS;
  }

  /* ---------------------------------------------------------------- *
   * §9.2  Storage pressure
   * ---------------------------------------------------------------- */

  storeTakes(b, item) {
    const d = this.defOf(b);
    if (!d || !d.storage) return false;
    const cls = C.itemClass(item);
    const list = d.storage.classes;
    for (let i = 0; i < list.length; i++) if (list[i] === cls) return true;
    return false;
  }

  storeUnits(b) {
    if (b.invCount !== undefined) return b.invCount;
    let n = 0;
    const inv = b.inv;
    if (inv) for (const k in inv) { const q = inv[k]; if (q > 0) n += q; }
    return n;
  }

  /** Units of `cls` held by a store; a single-class store is its whole count. */
  storeUnitsOf(b, cls) {
    const d = this.defOf(b);
    if (!d || !d.storage) return 0;
    if (d.storage.classes.length === 1) return this.storeUnits(b);
    let n = 0;
    const inv = b.inv;
    if (inv) for (const k in inv) { if (inv[k] > 0 && C.itemClass(k) === cls) n += inv[k]; }
    return n;
  }

  /** Fallback for `_roomFor` when buildings.js is absent; per-class (G3). */
  storeRoom(b, item) {
    const d = this.defOf(b);
    if (!d || !d.storage || !this.storeTakes(b, item)) return 0;
    const cls = C.itemClass(item);
    const room = this.classCapOf(d, cls) - this.storeUnitsOf(b, cls);
    return room > 0 ? room : 0;
  }

  /**
   * A multi-class store reserves capacity per class (G3), so a store's room
   * for food is not its room for goods. Both numbers come from
   * `buildings.capacityFor`, which owns the per-class cap, via a stand-in item
   * of the class — never from `cap - invCount`, which would count a granary's
   * bread against a stockpile's timber.
   */
  classCapOf(d, cls) {
    const st = d && d.storage;
    if (!st) return 0;
    if (st.caps && st.caps[cls] > 0) return st.caps[cls];
    if (st.classCap > 0) return st.classCap;
    return st.cap || 0;
  }

  /** Remaining room and total capacity across every store taking `cls`. */
  roomForClass(cls) {
    const stores = this.storages();
    let room = 0, cap = 0;
    for (let i = 0; i < stores.length; i++) {
      const b = stores[i];
      if (!b || b.removed || !b.built || b.active === false) continue;
      const d = this.defOf(b);
      if (!d || !d.storage || d.storage.classes.indexOf(cls) < 0) continue;
      const c = this.classCapOf(d, cls);
      cap += c;
      // Class room is what the CLASS has free, not what one probe item may add:
      // the J3 per-item cap makes the most-stored item's room much smaller, and
      // reporting that made a near-empty town alert 'storage full'. The
      // per-item question ("can THIS be hauled here?") is buildings.haulRoomFor.
      const used = this.classUsed(b, cls);
      const free = c - used;
      if (free > 0) room += free;
    }
    return { room, cap };
  }

  /**
   * J3.1 makes class room a poor proxy for "can the next load go anywhere":
   * a Stockpile 40% full of timber has half its class room free and nowhere
   * left to put a log. The panel has to answer the question a haulier asks,
   * per item, or it stays quiet through the jam that stops the Woodcutter.
   */
  _itemJammedIn(cls) {
    const stores = this.storages();
    const ids = C.ITEM_IDS;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id === 'coin' || C.itemClass(id) !== cls) continue;
      if (!(this.stock(id) > 0)) continue;
      let room = 0;
      for (let k = 0; k < stores.length && room <= 0; k++) {
        const b = stores[k];
        if (!b || b.removed || !b.built || b.active === false) continue;
        room = this._roomFor(b, id);
      }
      if (room <= 0) return true;
    }
    return false;
  }

  /** Units of `cls` currently held in `b`, across every item of that class. */
  classUsed(b, cls) {
    if (b.clsCount && typeof b.clsCount[cls] === 'number') return b.clsCount[cls];
    let n = 0;
    const inv = b.inv;
    for (const id in inv) {
      const q = inv[id];
      if (q > 0 && C.itemClass(id) === cls) n += q;
    }
    return n;
  }

  _roomFor(b, item) {
    const B = this.buildings;
    if (B && typeof B.capacityFor === 'function') return B.capacityFor(b, item);
    return this.storeRoom(b, item);
  }

  /** Nearest store with room for `item`, reachable from `fromB`. */
  findStore(item, fromB, excludeMarkets) {
    const x = fromB ? centreX(fromB) : 0;
    const y = fromB ? centreY(fromB) : 0;
    const stores = this.storages();
    let best = null, bestD = Infinity;
    for (let i = 0; i < stores.length; i++) {
      const b = stores[i];
      if (!b || b.removed || b === fromB || b.active === false) continue;
      const d = this.defOf(b);
      if (excludeMarkets && d && d.market) continue;
      if (this._roomFor(b, item) <= 0) continue;
      if (fromB && !this.sameRegion(fromB, b)) continue;
      const dd = dist2(x, y, centreX(b), centreY(b));
      if (dd < bestD) { bestD = dd; best = b; }
    }
    return best;
  }

  /**
   * Public refund entry point (§7.5, §16.4). buildings.js owns the pool of
   * last resort, so this is a straight delegation — nothing is ever destroyed.
   */
  refund(item, qty, x, y) {
    const B = this.buildings;
    if (!B || !(qty > 0)) return 0;
    this.invalidateStock();
    if (typeof B.deposit === 'function') return B.deposit(item, qty, x, y);
    const store = this.findStore(item, null, false);
    return store ? B.add(store, item, qty) : 0;
  }

  /**
   * Pour the refund pool back into storage as room appears (G10). Nothing but
   * `spend()` takes from the pool, so goods that land there while every store
   * is full would otherwise stay counted in `stock()` and invisible to the
   * player forever. Runs on the task-rebuild cadence — it only has work to do
   * when storage room has just appeared.
   */
  drainOverflow() {
    if (!this._bTakeOverflow) return 0;
    const B = this.buildings;
    const pool = B.overflow;
    if (!pool) return 0;
    let moved = 0;
    const poolId = this._bOverflowNode ? this.buildings.overflowNode().id : -1;
    for (const item in pool) {
      // Units a porter is already walking for (P1) stay put: draining them
      // into a store under the task would only cancel it mid-trip.
      let left = pool[item] - (poolId >= 0 ? this.claimedAt(poolId, item) : 0);
      if (!(left > 0)) continue;
      for (let guard = 0; guard < 8 && left > 0; guard++) {
        const store = this.findStore(item, null, false);
        if (!store) break;
        const room = this._roomFor(store, item);
        if (room <= 0) break;
        const taken = B.takeOverflow(item, room < left ? room : left);
        if (taken <= 0) break;
        left -= taken;
        const added = B.add(store, item, taken);
        // Sized against capacityFor, so a short add means the room went
        // elsewhere this tick; deposit re-homes the rest rather than dropping
        // it, even if that means the pool again.
        if (added < taken) B.deposit(item, taken - added, store.x, store.y);
        moved += added;
      }
    }
    if (moved > 0) this.invalidateStock();
    return moved;
  }

  /* ---------------------------------------------------------------- *
   * §9.3  The haul-task queue
   * ---------------------------------------------------------------- */

  _claimKey(fromId, item) { return fromId + '|' + item; }
  _incomingKey(toId, item) { return toId + '|' + item; }
  _tripleKey(fromId, toId, item) { return fromId + '>' + toId + '|' + item; }

  claimedAt(fromId, item) {
    const q = this.claims.get(this._claimKey(fromId, item));
    return q > 0 ? q : 0;
  }

  incomingTo(toId, item) {
    const q = this.incoming.get(this._incomingKey(toId, item));
    return q > 0 ? q : 0;
  }

  _addClaim(fromId, item, delta) {
    const k = this._claimKey(fromId, item);
    const q = (this.claims.get(k) || 0) + delta;
    if (q > 0) this.claims.set(k, q); else this.claims.delete(k);
  }

  _addIncoming(toId, item, delta) {
    const k = this._incomingKey(toId, item);
    const q = (this.incoming.get(k) || 0) + delta;
    if (q > 0) this.incoming.set(k, q); else this.incoming.delete(k);
  }

  /**
   * Task objects are never pooled. villagers.js holds a live reference and
   * tests `t.cancelled` / `t.done`; a recycled object would read as valid again.
   */
  createTask(kind, from, to, item, qty) {
    if (!from || !to || from.id === to.id) return null;
    const want = Math.min(Math.floor(qty), C.CARRY_CAP);
    if (want <= 0) return null;
    if (!this.sameRegion(from, to)) return null;

    const key = this._tripleKey(from.id, to.id, item);
    if (this.openKeys.has(key)) { this.debug.duplicatesBlocked++; return null; }

    // Capped by what the source holds minus what other open tasks claim.
    const free = invQty(from, item) - this.claimedAt(from.id, item);
    if (free <= 0) { this.debug.overclaimBlocked++; return null; }
    const q = Math.min(want, free);

    const t = {
      id: this.nextTaskId++, item: item, qty: q,
      fromId: from.id, toId: to.id,
      claimedBy: -1, kind: kind, age: 0, picked: false,
      cancelled: false, done: false, key: key,
    };
    this.tasks.push(t);
    this.taskById.set(t.id, t);
    this.openKeys.add(key);
    this._addClaim(from.id, item, q);
    this._addIncoming(to.id, item, q);
    this.debug.created++;
    return t;
  }

  rebuildTasks(game) {
    if (!this.buildings) return;
    void game;
    this.ensureTotals();
    this._reconcile();
    this._strandedReset();
    this._computeFeedBudget();
    this._generateBuildTasks();
    this._generateFeedTasks();
    this._generateSupplyTasks();
    this._generateStoreTasks();
  }

  /** Reconcile, never rebuild (§9.3). */
  _reconcile() {
    const tasks = this.tasks;
    const remain = this._scratchRemain;
    remain.clear();
    this.claims.clear();
    this.incoming.clear();

    for (let i = tasks.length - 1; i >= 0; i--) {
      const t = tasks[i];
      const to = this.getBuilding(t.toId);
      if (!to || to.removed) { this.cancelTask(t, 'destination gone'); continue; }

      // villagers.js lifts goods with buildings.take() directly and does not
      // have to notify us, so a claimant already holding the cargo counts as
      // picked up — otherwise reconcile would cancel tasks mid-carry.
      if (!t.picked && t.claimedBy >= 0) {
        const v = this.getVillager(t.claimedBy);
        if (v && v.carry && v.carry.item === t.item && v.carry.qty > 0) t.picked = true;
      }

      const from = this.getBuilding(t.fromId);
      if (t.picked) {
        this._addIncoming(t.toId, t.item, t.qty);
        continue;   // cargo is in a porter's hands; only the destination matters
      }
      if (!from || from.removed) { this.cancelTask(t, 'source gone'); continue; }
      if (!this.sameRegion(from, to)) { this.cancelTask(t, 'unreachable'); continue; }

      const k = this._claimKey(t.fromId, t.item);
      let left = remain.get(k);
      if (left === undefined) left = invQty(from, t.item);
      if (left <= 0) { this.cancelTask(t, 'source empty'); continue; }

      if (t.qty > left) t.qty = left;      // shrink rather than over-claim
      remain.set(k, left - t.qty);
      this._addClaim(t.fromId, t.item, t.qty);
      this._addIncoming(t.toId, t.item, t.qty);
    }
  }

  _generateBuildTasks() {
    const bs = this.allBuildings();
    // R4: with no storage standing, a producer's output buffer is the only
    // stock a site can draw on. The Town Centre is a storage, so in a normal
    // town this gate never opens.
    const noStorage = this._bHasStorage
      ? !this.buildings.hasStorage() : this.storages().length === 0;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!b || b.removed || b.built) continue;
      const wants = this._wantsOf(b);
      for (let k = 0; k < wants.length; k++) {
        const w = wants[k];
        const need = w.qty - this.incomingTo(b.id, w.item);
        if (need <= 0) continue;
        const src = this._findSource(w.item, b, noStorage);
        if (!src) { this._noteStranded(b, w.item, w.qty, 'site', noStorage); continue; }
        this.createTask('build', src, b, w.item, need);
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * ADDENDUM AQ11 — the town has the goods and cannot reach them
   *
   * A site or a live repair in a severed region is quoted affordable, reserves
   * its whole cost and then never receives a haul: `_findSource` returns null
   * and the generator simply continues.
   *
   * The severance itself is usually named — `hasDoor()` requires the door tile
   * to be in the town's hub region, so whichever side is not the hub reports
   * 'cut off'. What nothing has ever reported is the COST: `available()` is
   * global, so a reservation held by something no carrier can reach is
   * subtracted from every other building's affordability, and the player
   * watches builds refused across a town that visibly has the timber.
   *
   * Surfaced, per AQ9, and deliberately not compensated for: the quote stays
   * reachability-blind so a severed town is something the player sees and fixes.
   * ---------------------------------------------------------------- */

  _strandedReset() {
    this.stranded.length = 0;
    const r = this.strandedReserved;
    for (const k in r) delete r[k];
    this._strandedBy.clear();
  }

  /**
   * Called only where a want went unserved, so `_findSource` has already said
   * no. The one question left is whether the region gate was the *only* thing
   * that said it: re-run the identical scan with `sameRegion` neutralised and
   * see whether a source appears.
   *
   * That is strictly narrower than AQ11's proposed `available(item) > 0`, and
   * deliberately so. `available()` folds in `carriedTotals` and a producer's
   * input pile, neither of which `_nearestSource` will ever source from, so it
   * can claim reachable stock that does not exist. Comparing the same scan
   * against itself cancels both terms — whatever the probe finds is something a
   * haul really would have been posted for, had the map been joined up.
   */
  _noteStranded(b, item, qty, kind, buffers) {
    if (this.stock(item) <= 0) return;        // genuinely out; a different story
    // E4 makes `sameRegion` answer true for a building with no walkable tile
    // beside it, on purpose. That leniency is not ours to inherit: such a
    // building already says 'no road' or 'cut off', which is the louder and
    // more accurate reason, and "bridge the gap" would send the player to the
    // wrong end of the map.
    if (this._anchor(b) < 0) return;
    this._regionBlind = true;
    let src = null;
    try {
      src = this._findSource(item, b, buffers);
    } finally {
      this._regionBlind = false;
    }
    if (!src) return;

    let e = this._strandedBy.get(b.id);
    if (!e) {
      e = { id: b.id, x: b.x, y: b.y, kind: kind, items: [], reserved: Object.create(null) };
      this._strandedBy.set(b.id, e);
      this.stranded.push(e);
    } else if (kind === 'repair' && e.kind === 'supply') {
      e.kind = kind;
    }
    U.pushUnique(e.items, item);
    // Only a site and a live repair hold a RESERVATION; a producer short of a
    // recipe input has reserved nothing, and folding it in would overstate the
    // one number the player cannot possibly deduce.
    if (kind !== 'supply') {
      this.strandedReserved[item] = (this.strandedReserved[item] || 0) + qty;
      e.reserved[item] = (e.reserved[item] || 0) + qty;
    }
  }

  /* ------------------------- J2: 'feed' ---------------------------- */

  /** The recipe a building is actually running, of the several a def may offer. */
  _activeRecipeOf(b) {
    const def = this.defOf(b);
    if (!def) return null;
    const rs = def.recipes;
    if (rs) {
      for (let i = 0; i < rs.length; i++) if (rs[i].id === b.recipeId) return rs[i];
      return rs[0] || null;
    }
    return def.recipe || null;
  }

  /** A house larder or a market — the two ends of the J2 eating pipeline. */
  _isLarderDest(b) {
    if (this.houseFoodCap(b) > 0) return true;
    const d = this.defOf(b);
    return !!(d && d.market && d.storage);
  }

  /**
   * N5.1 — how much of each food the larders and markets may draw out of
   * storage, once every built, active production building's shortfall is held
   * back. Recomputed each rebuild, before any 'feed' task is posted, and spent
   * down as they are; deliveries already in flight have spent their share.
   */
  _computeFeedBudget() {
    const budget = this._feedBudget;
    budget.clear();
    const ids = C.FOOD_IDS;
    for (let i = 0; i < ids.length; i++) budget.set(ids[i], this.stored(ids[i]));

    const bs = this.allBuildings();
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!b || b.removed || !b.built || b.active === false) continue;
      const r = this._activeRecipeOf(b);
      if (!r || !r.in) continue;
      for (const k in r.in) {
        const left = budget.get(k);
        if (left === undefined) continue;      // only food is ever fed
        const short = r.in[k] * PRODUCTION_RESERVE_BATCHES
          - invQty(b, k) - this.incomingTo(b.id, k);
        if (short > 0) budget.set(k, left - short);
      }
    }

    const tasks = this.tasks;
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (t.picked) continue;                  // already out of storage
      const left = budget.get(t.item);
      if (left === undefined) continue;
      const to = this.getBuilding(t.toId);
      if (to && this._isLarderDest(to)) budget.set(t.item, left - t.qty);
    }
  }

  /** Units of `item` the larders may still claim this rebuild (N5.1). */
  feedBudget(item) {
    const q = this._feedBudget.get(item);
    return q > 0 ? q : 0;
  }

  _spendFeedBudget(item, qty) {
    const q = this._feedBudget.get(item);
    if (q !== undefined) this._feedBudget.set(item, q - qty);
  }

  /** The larder size of a house, or 0 if this def has none (feature-detect). */
  houseFoodCap(b) {
    const d = this.defOf(b);
    if (!d || !(d.houses > 0)) return 0;
    return d.foodCap > 0 ? d.foodCap : HOUSE_FOOD_CAP;
  }

  /** Food units currently in a house larder. */
  _larderUnits(b) {
    const inv = b.inv;
    if (!inv) return 0;
    const ids = C.FOOD_IDS;
    let n = 0;
    for (let i = 0; i < ids.length; i++) { const q = inv[ids[i]]; if (q > 0) n += q; }
    return n;
  }

  _feedRecencyFor(id) {
    let m = this.feedRecency.get(id);
    if (!m) {
      m = new Float32Array(FOOD_GROUP_COUNT);
      for (let i = 0; i < FOOD_GROUP_COUNT; i++) m[i] = -99;
      this.feedRecency.set(id, m);
    }
    return m;
  }

  /**
   * J2.2 — carry food to the houses instead of walking the villagers to it.
   * One open task per house at a time: at 220 villagers in ~30 houses a
   * per-item fan-out would bury the build and supply tasks the town is
   * actually blocked on.
   */
  _generateFeedTasks() {
    const V = this.villagers;
    const houses = V && Array.isArray(V.houses) ? V.houses : null;
    const bs = houses || this.allBuildings();
    const dry = this._dryLarders;
    const enRoute = this._feedEnRoute;
    dry.clear();
    enRoute.clear();
    if (bs.length === 0) return;

    const busy = this._feedBusy;
    busy.clear();
    const tasks = this.tasks;
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (t.kind !== 'feed') continue;
      busy.set(t.toId, (busy.get(t.toId) || 0) + 1);
      if (t.claimedBy >= 0) enRoute.add(t.toId);
    }

    const occ = this._feedOccupancy();
    // U2 — a larder that has run dry sends its whole household to the granary
    // in working hours, which is the pre-J2 tax this pipeline exists to
    // remove. Those houses are served first and, via `_dryLarders`, claimed
    // first; N5.1's budget is unchanged, so the production chains keep theirs.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i];
        if (!b || b.removed || !b.built) continue;
        const cap = this.houseFoodCap(b);
        if (cap <= 0) continue;
        if (!(occ.get(b.id) > 0)) continue;      // nobody eats there
        const units = this._larderUnits(b);
        if ((units <= 0) !== (pass === 0)) continue;
        if (pass === 0) dry.add(b.id);
        if ((busy.get(b.id) || 0) >= FEED_TASKS_PER_HOUSE) continue;
        const held = units + this._incomingFood(b.id);
        if (held > cap * FEED_TRIGGER_FRACTION) continue;
        this._postFeedTask(b, cap, held);
      }
    }
  }

  /** U2 — is a porter already carrying food to this house? */
  feedInbound(toId) { return this._feedEnRoute.has(toId); }

  /**
   * The tile a villager is standing on, or -1 when the region test would lie.
   * E4: two unwalkable tiles both answer region -1 and would compare as
   * connected, so an agent off the walkable grid is treated as "unknown" and
   * loses no work over it.
   */
  _standRegion(v) {
    if (!this._sameRegion) return -1;
    const V = this.villagers;
    const w = this.world;
    if (!V || typeof V.tileOf !== 'function' || !w) return -1;
    const idx = V.tileOf(v);
    if (!(idx >= 0) || !w.isWalkable(idx)) return -1;
    return idx;
  }

  /** Food already claimed for a larder, so two deliveries cannot overfill it. */
  _incomingFood(toId) {
    const ids = C.FOOD_IDS;
    let n = 0;
    for (let i = 0; i < ids.length; i++) n += this.incomingTo(toId, ids[i]);
    return n;
  }

  /**
   * Residents per house, recounted on the task cadence rather than read from
   * `_houseCounts`, which `_assignHomes` maintains incrementally for the day.
   */
  _feedOccupancy() {
    const counts = this._feedCounts;
    counts.clear();
    const vs = this.allVillagers();
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (!v || v.dead || v.removed || !(v.homeId >= 0)) continue;
      counts.set(v.homeId, (counts.get(v.homeId) || 0) + 1);
    }
    return counts;
  }

  /**
   * One delivery into one larder. The item is drawn from the group this house
   * has gone longest without, so §9.4's variety survives the move indoors: the
   * villager still chooses, but now against a mixed larder rather than a
   * granary.
   */
  _postFeedTask(house, cap, held) {
    const itemCap = Math.max(1, Math.floor(cap * FEED_ITEM_FRACTION));
    const mem = this._feedRecencyFor(house.id);
    const now = this._dayFloat;

    for (let pass = 0; pass < 2; pass++) {
      const src = this._findFeedSource(house, pass === 0);
      if (!src) continue;
      let bestItem = '', bestGroup = -1, bestAge = -Infinity, bestQty = 0;
      for (let g = 0; g < FOOD_GROUP_COUNT; g++) {
        const list = FOODS_BY_GROUP[g];
        let topItem = '', topQty = 0;
        for (let k = 0; k < list.length; k++) {
          const id = list[k];
          if ((house.inv && house.inv[id] || 0) >= itemCap) continue;
          const allow = this.feedBudget(id);           // N5.1
          if (allow <= 0) continue;
          let free = invQty(src, id) - this.claimedAt(src.id, id);
          if (free > allow) free = allow;
          if (free > topQty) { topQty = free; topItem = id; }
        }
        if (topQty <= 0) continue;
        const age = now - mem[g];
        if (age > bestAge || (age === bestAge && topQty > bestQty)) {
          bestAge = age; bestItem = topItem; bestGroup = g; bestQty = topQty;
        }
      }
      if (!bestItem) continue;

      const room = this._larderRoomFor(house, bestItem, cap, itemCap);
      const want = Math.min(room, cap - held, bestQty, C.CARRY_CAP);
      if (want < FEED_MIN_BATCH) continue;
      const t = this.createTask('feed', src, house, bestItem, want);
      if (t) {
        this._spendFeedBudget(bestItem, t.qty);
        mem[bestGroup] = now;
        return true;
      }
    }
    return false;
  }

  /**
   * Room for one item in a larder. `capacityFor` owns the truth once
   * buildings.js knows about `foodCap`; the arithmetic branch is the
   * feature-detect fallback and keeps `FEED_ITEM_FRACTION` binding either way.
   */
  _larderRoomFor(house, item, cap, itemCap) {
    let room = cap - this._larderUnits(house);
    const own = itemCap - (house.inv && house.inv[item] || 0);
    if (own < room) room = own;
    const B = this.buildings;
    if (B && typeof B.capacityFor === 'function') {
      const real = B.capacityFor(house, item);
      if (real < room) room = real;
    }
    return room > 0 ? room : 0;
  }

  /** J2.2: a Market is the distribution hub; a Granary is the fallback. */
  _findFeedSource(house, marketsOnly) {
    const stores = this.storages();
    const hx = centreX(house), hy = centreY(house);
    let best = null, bestD = Infinity;
    for (let i = 0; i < stores.length; i++) {
      const b = stores[i];
      if (!b || b.removed || !b.built || b.active === false) continue;
      const d = this.defOf(b);
      if (!d || !d.storage || d.storage.classes.indexOf('food') < 0) continue;
      if (marketsOnly !== !!d.market) continue;
      if (!this.hasFoodAt(b)) continue;
      if (!this.sameRegion(b, house)) continue;
      const dd = dist2(hx, hy, centreX(b), centreY(b));
      if (dd < bestD) { bestD = dd; best = b; }
    }
    return best;
  }

  _generateSupplyTasks() {
    const bs = this.allBuildings();
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!b || b.removed || !b.built || b.active === false) continue;
      const def = this.defOf(b);
      if (!def) continue;

      // A store under repair is the one case where a storage building has a
      // shortfall of its own: wants() reports the repair's owed materials, and
      // without a task for them the only thing that ever feeds the pile is
      // incidental `store` traffic, which a town with no production never has.
      const repairing = this._repairing(b);

      // J2.2 makes the market the distribution hub the houses are fed from, so
      // it is kept stocked off the granaries. buildings.wants() reports nothing
      // for a storage building that is not under repair.
      if (def.market && def.storage) {
        if (this.storeUnits(b) < def.storage.cap * MARKET_RESTOCK_FRACTION) {
          this._restockMarket(b);
        }
        if (!repairing) continue;
      } else if (def.storage && !repairing) {
        continue;
      }

      const wants = this._wantsOf(b);
      for (let k = 0; k < wants.length; k++) {
        const w = wants[k];
        const need = w.qty - this.incomingTo(b.id, w.item);
        if (need <= 0) continue;
        const src = this._findSource(w.item, b, true);
        if (!src) {
          // AQ11 covers live repairs as well as sites: a repair reserves out of
          // the same global `available()`, and a stranded one is just as silent.
          const rc = repairing && b.repair ? b.repair.cost : null;
          this._noteStranded(b, w.item, w.qty,
            rc && rc[w.item] > 0 ? 'repair' : 'supply', true);
          continue;
        }
        // Repair materials ride the ordinary `supply` rank. Promoting them to
        // `build` is the lever to pull if repairs feel starved in play; the
        // rank is the only thing that would need to change.
        this.createTask('supply', src, b, w.item, need);
      }
    }
  }

  _restockMarket(market) {
    const foods = C.FOOD_IDS;
    let posted = 0;
    for (let i = 0; i < foods.length && posted < 3; i++) {
      const item = foods[i];
      if (this.storedTotals[item] <= 0) continue;
      if (this.incomingTo(market.id, item) > 0) continue;
      // The market stocks the larders, so it spends the same budget (N5.1).
      const allow = this.feedBudget(item);
      if (allow <= 0) continue;
      const src = this._findSource(item, market, true);
      if (!src) continue;
      const t = this.createTask('supply', src, market, item,
        allow < C.CARRY_CAP ? allow : C.CARRY_CAP);
      if (t) { this._spendFeedBudget(item, t.qty); posted++; }
    }
  }

  _generateStoreTasks() {
    const bs = this.allBuildings();
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!b || b.removed || !b.built) continue;
      const def = this.defOf(b);
      if (!def || def.storage) continue;      // a store is a sink, never a source
      this._postStoreFor(b, def, STORE_TRIGGER_FRACTION);
    }
  }

  /**
   * Store hauls out of one producer, one per output item over `frac` of its
   * buffer. §9.3's "half full" is measured per item against that item's own
   * cap: every output has a buffer of `outputCap`, so a pooled ratio over all
   * outputs can never be reached by one item on a multi-output building (a
   * Hunter's venison tops out at half of venison+hide) and hauling would only
   * ever start once the building had already stalled.
   */
  _postStoreFor(b, def, frac) {
    const outs = this._outputsOf(b);
    if (outs.length === 0) return null;
    const cap = def.outputCap || 12;
    const trigger = cap * frac;
    let first = null;
    for (let k = 0; k < outs.length; k++) {
      const item = outs[k];
      const held = invQty(b, item);
      if (held < trigger) continue;
      const have = held - this.claimedAt(b.id, item);
      if (have <= 0) continue;
      const dest = this.findStore(item, b, true);
      if (!dest) continue;
      const t = this.createTask('store', b, dest, item, have);
      if (t && !first) first = t;
    }
    return first;
  }

  /**
   * ADDENDUM W2 — the haul out of a producer, offered to the worker standing
   * in it. Collection has to keep up with production, and a `store` task is
   * the lowest rank in the queue, so a hut twelve tiles out waits behind
   * everything while the town starves. The task itself is an ordinary `store`
   * posting — §9.3's region check, one-open-task-per-triple rule, `CARRY_CAP`
   * and claim capping, soft reservation, cancellation and timeout all hold
   * unchanged. The only thing that differs is who is allowed to take it.
   */
  claimOwnOutput(v, b) {
    if (!v || !b || b.removed || !b.built) return null;
    const def = this.defOf(b);
    if (!def || def.storage) return null;
    const tasks = this.tasks;
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (t.cancelled || t.done || t.picked || t.claimedBy >= 0) continue;
      if (t.kind !== 'store' || t.fromId !== b.id) continue;
      t.claimedBy = v.id;
      t.age = 0;
      return t;
    }
    const made = this._postStoreFor(b, def, WORKER_HAUL_FRACTION);
    if (!made) return null;
    made.claimedBy = v.id;
    made.age = 0;
    return made;
  }

  /**
   * Nearest unclaimed `item` reachable from `destB`: a storage first and, when
   * `buffers` is set, a producer's own output buffer (N5.2) — a full buffer
   * across the valley is stock, not scenery. It is the fallback, not the first
   * choice, so a porter is never sent past a granary to fetch one unit off a
   * farm. §9.3.1 otherwise keeps construction on storage alone: build outranks
   * every other kind, and letting a queue of sites strip the producers bare
   * would stop the chains that fill those storages in the first place — the one
   * exception is ADDENDUM R4, a town with no storage at all, where the buffers
   * are the only stock a site can be built from.
   */
  _findSource(item, destB, buffers) {
    const store = this._nearestSource(this.storages(), item, destB, false);
    if (store) return store;
    // ADDENDUM P1: the refund pool is goods lying in the town square, not goods
    // in limbo. It is offered to build and supply alike — when the last storage
    // burns it is the only stock the town has left, and a site sourcing from it
    // is the whole recovery path.
    const pool = this._overflowSource(item, destB);
    if (pool) return pool;
    if (!buffers) return null;
    return this._nearestSource(this.allBuildings(), item, destB, true);
  }

  /** The pool as a source, under every §9.3 rule that governs a real one. */
  _overflowSource(item, destB) {
    if (!this._bOverflowNode) return null;
    const node = this.buildings.overflowNode();
    // doorIdx < 0 means nowhere to stand: no task, rather than one no porter
    // can walk to.
    if (!node || node.doorIdx < 0) return null;
    const arr = this._poolScratch;
    arr[0] = node;
    return this._nearestSource(arr, item, destB, false);
  }

  _nearestSource(list, item, destB, buffers) {
    const dx = centreX(destB), dy = centreY(destB);
    const destDef = this.defOf(destB);
    const destIsMarket = !!(destDef && destDef.market);
    let best = null, bestD = Infinity;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b || b.removed || b.id === destB.id || b.active === false) continue;
      const sd = this.defOf(b);
      if (buffers) {
        // Only a producer's own output; its input pile belongs to it, and a
        // storage was already offered by the first pass.
        if (!b.built || !sd || sd.storage) continue;
        if (!this._producesItem(sd, item)) continue;
      } else if (destIsMarket && sd && sd.market) {
        continue;     // a market is a consumer of food, not a granary to raid
      }
      const free = invQty(b, item) - this.claimedAt(b.id, item);
      if (free <= 0) continue;
      if (this.openKeys.has(this._tripleKey(b.id, destB.id, item))) continue;
      if (!this.sameRegion(b, destB)) continue;
      const dd = dist2(dx, dy, centreX(b), centreY(b));
      if (dd < bestD) { bestD = dd; best = b; }
    }
    return best;
  }

  /**
   * §16.9's floor when nothing is left that can store food: a producer's own
   * basket, which a starving villager may eat straight out of. A building
   * holding any food it did not produce is skipped whole, so the grain a baker
   * is keeping to bake with is never mistaken for a meal.
   */
  emergencyLarder(b) {
    const d = this.defOf(b);
    if (!d || d.storage) return false;
    let any = false;
    const ids = C.FOOD_IDS;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (invQty(b, id) <= 0) continue;
      if (!this._producesItem(d, id)) return false;
      any = true;
    }
    return any;
  }

  /**
   * Is `item` something this def makes, rather than something it is holding to
   * consume? A def that both eats and makes an item keeps it: hauling it away
   * would be taking the bread out of the baker's own oven.
   */
  _producesItem(def, item) {
    const key = def.id + '|' + item;
    const hit = this._producesCache.get(key);
    if (hit !== undefined) return hit;
    let out = false;
    const rs = def.recipes || (def.recipe ? [def.recipe] : EMPTY);
    for (let i = 0; i < rs.length; i++) if (rs[i].out && rs[i].out[item] > 0) out = true;
    const g = def.gathers, w = def.grows;
    if (g && (g.item === item
      || (g.alt && g.alt.item === item)
      || (g.byproduct && g.byproduct.item === item))) out = true;
    if (w && (w.item === item || (w.alt && w.alt.item === item))) out = true;
    if (out) {
      for (let i = 0; i < rs.length; i++) if (rs[i].in && rs[i].in[item] > 0) out = false;
      if (def.consumes && def.consumes.item === item) out = false;
    }
    this._producesCache.set(key, out);
    return out;
  }

  _outputsOf(b) {
    if (this._bOutputs) return this.buildings.outputs(b) || EMPTY;
    const def = this.defOf(b);
    if (!def || def.storage) return EMPTY;
    const out = [];
    if (def.recipe && def.recipe.out) for (const k in def.recipe.out) U.pushUnique(out, k);
    if (def.recipes) {
      for (let i = 0; i < def.recipes.length; i++) {
        for (const k in def.recipes[i].out) U.pushUnique(out, k);
      }
    }
    if (def.gathers) {
      if (def.gathers.item) U.pushUnique(out, def.gathers.item);
      if (def.gathers.alt && def.gathers.alt.item) U.pushUnique(out, def.gathers.alt.item);
      if (def.gathers.byproduct && def.gathers.byproduct.item) U.pushUnique(out, def.gathers.byproduct.item);
    }
    if (def.grows) {
      if (def.grows.item) U.pushUnique(out, def.grows.item);
      if (def.grows.alt && def.grows.alt.item) U.pushUnique(out, def.grows.alt.item);
    }
    const live = [];
    for (let i = 0; i < out.length; i++) if (invQty(b, out[i]) > 0) live.push(out[i]);
    return live;
  }

  /** Is this building under repair? Repair rows are the only `wants()` a
   *  storage building ever has. */
  _repairing(b) {
    if (!b) return false;
    if (this._bRepairing) return this.buildings.isRepairing(b.id);
    return !!b.repair;
  }

  _wantsOf(b) {
    if (this._bWants) return this.buildings.wants(b) || EMPTY;
    const def = this.defOf(b);
    if (!def) return EMPTY;
    const out = [];
    if (!b.built) {
      const cost = b.cost || def.cost || EMPTY;
      for (const k in cost) {
        const need = cost[k] - (b.delivered ? (b.delivered[k] || 0) : 0);
        if (need > 0) out.push({ item: k, qty: need });
      }
      return out;
    }
    if (def.storage) return out;
    const cap = def.inputCap || 12;
    if (def.recipe && def.recipe.in) {
      for (const k in def.recipe.in) {
        const need = Math.min(cap, def.recipe.in[k] * 4) - invQty(b, k);
        if (need > 0) out.push({ item: k, qty: need });
      }
    }
    if (def.consumes && def.consumes.item) {
      const need = Math.min(cap, (def.consumes.perDay || 1) * 3) - invQty(b, def.consumes.item);
      if (need > 0) out.push({ item: def.consumes.item, qty: need });
    }
    return out;
  }

  /* ------------------------- task lifecycle ------------------------ */

  /**
   * Best open task for a villager. Build beats a dry larder beats feed beats
   * supply beats store (§9.3 as amended by J2.2 and U2 — a hungry town
   * outranks a stocked workshop but not a half-finished building); within a
   * rank, nearest wins. Non-porters
   * wait `PORTER_GRACE` seconds so the storage crews get first refusal.
   *
   * `onlyKind` narrows the offer to one task kind. A town with no storage has
   * no porters and no unemployed, so nothing reaches here at all; the caller
   * that wants to lend it a worker needs to lend it for construction only, and
   * not have them wander off onto a `store` haul.
   */
  claimTask(v, onlyKind) {
    if (!v) return null;
    const isPorter = v.role === 'porter';
    const tasks = this.tasks;
    // M7/U2 — a villager sealed into a pocket of the map otherwise claims a
    // haul, fails on `no-path`, releases it and claims it again for ever,
    // holding deliveries nobody else can then take. Read once, here.
    const stand = this._standRegion(v);
    let best = null, bestScore = Infinity;
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (t.claimedBy >= 0 || t.cancelled || t.done) continue;
      if (onlyKind && t.kind !== onlyKind) continue;
      if (!isPorter && t.age < PORTER_GRACE) continue;
      const from = this.getBuilding(t.fromId);
      if (!from) continue;
      if (stand >= 0 && from.doorIdx >= 0
        && this.paths.sameRegion(stand, from.doorIdx) === false) continue;
      let kindRank = KIND_RANK[t.kind] === undefined ? KIND_RANK_LAST : KIND_RANK[t.kind];
      if (t.kind === 'feed' && this._dryLarders.has(t.toId)) kindRank = FEED_RANK_DRY;
      const d = Math.sqrt(dist2(v.vx, v.vy, centreX(from), centreY(from)));
      const score = kindRank * 1000 + d;
      if (score < bestScore) { bestScore = score; best = t; }
    }
    if (!best) return null;
    best.claimedBy = v.id;
    best.age = 0;
    return best;
  }

  /** Optional: a caller may report the real pickup quantity. */
  onPickedUp(t, actualQty) {
    if (!t || !this.taskById.has(t.id)) return;
    const got = Math.max(0, Math.floor(actualQty));
    this._addClaim(t.fromId, t.item, -t.qty);
    if (got <= 0) { this.cancelTask(t, 'nothing to collect'); return; }
    if (got !== t.qty) {
      this._addIncoming(t.toId, t.item, got - t.qty);
      this.debug.shortDeliveries++;
      t.qty = got;
    }
    t.picked = true;
    t.age = 0;
    const from = this.getBuilding(t.fromId);
    const fd = from ? this.defOf(from) : null;
    // Building -> hands: the world total is unchanged, only `stored` moves.
    if (from && from.built && fd && fd.storage) this._adjust(t.item, 0, -got);
  }

  /**
   * Called by villagers.js once the goods are handed over. The second argument
   * is the villager (villagers.js) or the delivered quantity (other callers);
   * either way the goods have already moved through buildings.add.
   */
  completeTask(t, arg) {
    if (!t || !this.taskById.has(t.id)) return;
    const to = this.getBuilding(t.toId);
    const delivered = typeof arg === 'number' ? arg : t.qty;
    this._removeTask(t);
    t.done = true;
    this.debug.completed++;
    if (to && to.built && delivered > 0) {
      const d = this.defOf(to);
      if (d && d.storage) this._adjust(t.item, 0, delivered);
    }
    // `task:completed` is emitted by villagers.js, which knows where the
    // porter was standing. Emitting it here too would double every pop.
  }

  /**
   * Cancel from any stage. Re-entrant: villagers.js's releaseTask() calls back
   * into here, and a task already off the books is a no-op. §16.4 — the goods
   * are never destroyed: villagers.js walks whatever is in hand to a storage,
   * and buildings.js's overflow pool catches the rest.
   */
  cancelTask(t, arg) {
    if (!t || !this.taskById.has(t.id)) return false;
    this._removeTask(t);
    t.cancelled = true;
    this.debug.cancels++;
    void arg;
    this._freeClaimant(t);
    return true;
  }

  _freeClaimant(t) {
    const vid = t.claimedBy;
    if (!(vid >= 0)) return;
    const V = this.villagers;
    const v = this.getVillager(vid);
    if (!v || v.task !== t) return;
    // The task is already off the books, so this re-entry is a no-op; it is
    // here so villagers.js drops the reference and re-homes what is in hand.
    if (V && typeof V.abortTask === 'function') V.abortTask(vid, t, t.cancelled ? 'cancelled' : 'released');
    else if (V && typeof V.releaseTask === 'function') V.releaseTask(v, true);
  }

  _removeTask(t) {
    const i = this.tasks.indexOf(t);
    if (i >= 0) U.removeSwap(this.tasks, i);
    this.taskById.delete(t.id);
    this.openKeys.delete(t.key);
    if (!t.picked) this._addClaim(t.fromId, t.item, -t.qty);
    this._addIncoming(t.toId, t.item, -t.qty);
  }

  /** buildings.js, or the `building:destroyed` event. */
  onBuildingRemoved(id) {
    if (!(id >= 0)) return;
    const tasks = this.tasks;
    for (let i = tasks.length - 1; i >= 0; i--) {
      const t = tasks[i];
      if (t.fromId === id || t.toId === id) this.cancelTask(t, 'building destroyed');
    }
    this.feedRecency.delete(id);
    this.invalidateStock();
  }

  /** villagers.js may call this from kill()/finishLeaving(); idempotent. */
  onVillagerRemoved(v) {
    if (!v) return;
    const tasks = this.tasks;
    for (let i = tasks.length - 1; i >= 0; i--) {
      if (tasks[i].claimedBy === v.id) this.cancelTask(tasks[i], 'claimant gone');
    }
    this.groupRecency.delete(v.id);
    this.invalidateStock();
  }

  _onDiedEvent(p) {
    if (!p) return;
    if (p.cause === 'raid') this.raidDeaths[this.raidDeathCursor] += 1;
    this._onVillagerGone(p);
  }

  /**
   * A villager has left the world, dead or emigrated. §9.3 frees the task and
   * the job at the moment they start leaving; what is left is this module's own
   * per-villager state, which nothing else would ever clear.
   */
  _onVillagerGone(p) {
    const id = p && p.id;
    if (!(id >= 0)) return;
    this.groupRecency.delete(id);
    const tasks = this.tasks;
    for (let i = tasks.length - 1; i >= 0; i--) {
      if (tasks[i].claimedBy === id) this.cancelTask(tasks[i], 'claimant gone');
    }
  }

  /* ---------------------------------------------------------------- *
   * §9.4  Eating
   * ---------------------------------------------------------------- */

  /**
   * villagers.js owns the meal (it picks the food and calls buildings.take);
   * this is the accounting hook it calls afterwards.
   */
  onVillagerAte(v, item, qty, b) {
    const it = C.ITEMS[item];
    if (!it || !(qty > 0)) return;
    this.consumedUnits += it.nutrition * qty;
    this.eatenOn.set(item, this._dayFloat);
    const gi = GROUP_INDEX[it.group];
    if (gi !== undefined && v) this._recencyFor(v.id)[gi] = this._dayFloat;
    const d = b ? this.defOf(b) : null;
    const store = !!(b && b.built && d && d.storage);
    this._adjust(item, -qty, store ? -qty : 0);
  }

  hasFoodAt(b) {
    if (!b || !b.inv) return false;
    const ids = C.FOOD_IDS;
    for (let i = 0; i < ids.length; i++) if (invQty(b, ids[i]) > 0) return true;
    return false;
  }

  _recencyFor(id) {
    let m = this.groupRecency.get(id);
    if (!m) {
      m = new Float32Array(FOOD_GROUP_COUNT);
      for (let i = 0; i < FOOD_GROUP_COUNT; i++) m[i] = -99;  // never eaten
      this.groupRecency.set(id, m);
    }
    return m;
  }

  /**
   * One meal, for any caller that wants economy to drive it. §9.4: take the
   * food the town has most of, from the group eaten least recently — variety
   * emerges from the choice rather than from a global rule.
   * Returns {item, qty, relief} or null.
   */
  eat(v, b) {
    if (!v || !b || !b.inv || !this.buildings) return null;
    const mem = this._recencyFor(v.id);
    const now = this._dayFloat;
    let bestItem = '', bestGroup = -1, bestAge = -Infinity, bestQty = 0;

    for (let g = 0; g < FOOD_GROUP_COUNT; g++) {
      const list = FOODS_BY_GROUP[g];
      let topItem = '', topQty = 0;
      for (let i = 0; i < list.length; i++) {
        const q = invQty(b, list[i]);
        if (q > topQty) { topQty = q; topItem = list[i]; }
      }
      if (topQty <= 0) continue;
      const age = now - mem[g];
      if (age > bestAge || (age === bestAge && topQty > bestQty)) {
        bestAge = age; bestItem = topItem; bestGroup = g; bestQty = topQty;
      }
    }
    if (!bestItem) return null;

    const taken = this.buildings.take(b, bestItem, 1);
    if (!(taken > 0)) return null;
    mem[bestGroup] = now;
    const relief = C.ITEMS[bestItem].nutrition * taken;
    this.consumedUnits += relief;
    this.eatenOn.set(bestItem, now);
    const d = this.defOf(b);
    this._adjust(bestItem, -taken, b.built && d && d.storage ? -taken : 0);
    return { item: bestItem, qty: taken, relief: relief };
  }

  /* ---------------------------------------------------------------- *
   * §16.1  Wood is never unobtainable
   * ---------------------------------------------------------------- */

  handGatherAllowed() {
    // available(), not stock(): wood already owed to a site cannot buy the
    // Woodcutter that would end the emergency. And the floor is the price of
    // getting out — a town with 7 timber and no Woodcutter is as stuck as one
    // with none (ADDENDUM P1.3).
    if (this.available('wood') >= HAND_GATHER_WOOD_FLOOR) return false;
    if (this._bHasBuilt) return !this.buildings.hasBuilt('woodcutter');
    const bs = this.allBuildings();
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b && !b.removed && b.built && b.defId === 'woodcutter') return false;
    }
    return true;
  }

  /* ================================================================== *
   * Daily processing  (ADDENDUM E1: `day` is the day that has BEGUN)
   * ================================================================== */

  onDayEnded(day) {
    if (day === undefined || day === null) {
      day = this.world && this.world.clock ? this.world.clock.day : this._lastDay + 1;
    }
    if (day === this._lastDay) return;    // the bus and main.js may both call
    this._lastDay = day;
    this._dayFloat = day;

    this.invalidateStock();
    this.ensureTotals();

    this._census();
    this._assignHomes();
    this._consumeCivic();
    this.computeNutrition();
    this._updateStarvation();
    this.computeHealth();
    this.computeHappiness();
    this._doCoin();
    this._doPopulation();
    this.checkTier();
    this._updateAlerts();
    this._maybeSendCaravan(day);

    this.raidDeathCursor = (this.raidDeathCursor + 1) % RAID_GRIEF_DAYS;
    this.raidDeaths[this.raidDeathCursor] = 0;
    this.consumedYesterday = this.consumedUnits;
    this.consumedUnits = 0;
    if (this.recentPlagueDays > 0) this.recentPlagueDays--;
  }

  /** Cheap per-tick headcount; ui.js and military.js read these every frame. */
  _censusLight() {
    const V = this.villagers;
    const vs = this.allVillagers();
    let pop = 0, hungry = 0;
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (!v || v.dead || v.removed) continue;
      pop++;
      if (v.hunger >= STARVING_HUNGER) hungry++;
    }
    this.population = pop;
    this.hungryCount = hungry;
    if (V && V.homelessCount !== undefined) {
      this.homeless = V.homelessCount;
      this.employed = V.employedCount;
      this.unemployed = V.unemployedCount;
    }
    const B = this.buildings;
    if (B && typeof B.totalHousing === 'function') this.housingCapacity = B.totalHousing();
  }

  _census() {
    const vs = this.allVillagers();
    let pop = 0, adults = 0, homeless = 0, unemployed = 0, hungry = 0;
    const counts = this._houseCounts;
    counts.clear();
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (!v || v.dead || v.removed) continue;
      pop++;
      if (v.age >= ADULT_AGE) adults++;
      if (!(v.homeId >= 0)) homeless++;
      else counts.set(v.homeId, (counts.get(v.homeId) || 0) + 1);
      if (!(v.jobId >= 0) && v.age >= ADULT_AGE) unemployed++;
      if (v.hunger >= STARVING_HUNGER) hungry++;
    }
    this.population = pop;
    this.adults = adults;
    this.homeless = homeless;
    this.unemployed = unemployed;
    this.employed = pop - unemployed;
    this.hungryCount = hungry;

    const B = this.buildings;
    if (B && typeof B.totalHousing === 'function') {
      this.housingCapacity = B.totalHousing();
    } else {
      let cap = 0;
      const bs = this.allBuildings();
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i];
        if (b && !b.removed) cap += this._housingOf(b);
      }
      this.housingCapacity = cap;
    }
  }

  /** Never `def.houses`: a house mid-upgrade still shelters its residents. */
  _housingOf(b) {
    if (this._bHousing) return this.buildings.housingCapacity(b);
    if (!b.built) return 0;
    const d = this.defOf(b);
    return d && d.houses ? d.houses : 0;
  }

  /** Taverns drink their ale; a dry tavern stops radiating happiness. */
  _consumeCivic() {
    const B = this.buildings;
    if (!B || typeof B.take !== 'function') return;
    const bs = this.allBuildings();
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!b || b.removed || !b.built) continue;
      const d = this.defOf(b);
      if (!d || !d.consumes) continue;
      const need = d.consumes.perDay || 1;
      b.civicSatisfied = B.take(b, d.consumes.item, need) >= need;
    }
  }

  /* -------------------------- §9.4 nutrition ------------------------ */

  /**
   * L2 — variety measures what the town eats, not what it hoards: an item
   * qualifies on `stored >= 4` OR on having been eaten anywhere in the last
   * VARIETY_EATEN_DAYS days. `items`/`byGroup` hold the qualifying set so the
   * UI never has to re-derive it and disagree with the meter.
   */
  computeNutrition() {
    this.ensureTotals();
    const n = this.nutrition;
    const groups = n.groups;
    const byGroup = n.byGroup;
    for (let i = 0; i < FOOD_GROUP_COUNT; i++) { groups[i] = false; byGroup[i].length = 0; }
    n.items.length = 0;
    const cutoff = this._dayFloat - VARIETY_EATEN_DAYS;
    let distinctItems = 0;
    const ids = C.FOOD_IDS;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const eaten = this.eatenOn.get(id);
      if (!(this.storedTotals[id] >= 4) && !(eaten >= cutoff)) continue;
      distinctItems++;
      const gi = GROUP_INDEX[C.ITEMS[id].group];
      groups[gi] = true;
      byGroup[gi].push(id);
      n.items.push(id);
    }
    let distinctGroups = 0;
    n.missing.length = 0;
    for (let i = 0; i < FOOD_GROUP_COUNT; i++) {
      if (groups[i]) distinctGroups++;
      else n.missing.push(C.FOOD_GROUPS[i].name);
    }
    n.distinctItems = distinctItems;
    n.distinctGroups = distinctGroups;
    n.varietyScore = Math.min(100, distinctGroups * 11 + distinctItems * 2.2);
    return n.varietyScore;
  }

  /**
   * §14 — variety is only recomputed on day:ended, so it is restored verbatim
   * rather than left at zero. The qualifying item set is the save; the groups,
   * byGroup and missing views are derived from it.
   */
  _restoreNutrition(saved) {
    this._nutritionSeeded = true;      // a save carries its own (§14)
    const n = this.nutrition;
    if (!saved || !Array.isArray(saved.items)) {
      // A save from before this was written: recompute rather than start at
      // zero, against the clock we have just restored, not the default day 1.
      const c = this.world && this.world.clock;
      if (c) this._dayFloat = c.day + (c.timeOfDay || 0);
      this.computeNutrition();
      return;
    }
    const groups = n.groups, byGroup = n.byGroup;
    for (let i = 0; i < FOOD_GROUP_COUNT; i++) { groups[i] = false; byGroup[i].length = 0; }
    n.items.length = 0;
    for (let i = 0; i < saved.items.length; i++) {
      const id = saved.items[i];
      const it = C.ITEMS[id];
      if (!it || GROUP_INDEX[it.group] === undefined) continue;
      const gi = GROUP_INDEX[it.group];
      groups[gi] = true;
      byGroup[gi].push(id);
      n.items.push(id);
    }
    n.missing.length = 0;
    for (let i = 0; i < FOOD_GROUP_COUNT; i++) {
      if (!groups[i]) n.missing.push(C.FOOD_GROUPS[i].name);
    }
    n.distinctItems = saved.distinctItems || 0;
    n.distinctGroups = saved.distinctGroups || 0;
    n.varietyScore = saved.varietyScore || 0;
  }

  _updateStarvation() {
    if (this.population <= 0) { this.starvingDays = 0; return; }
    const need = this.foodNeededPerDay();
    // "Cannot meet foodNeededPerDay" — the larder cannot cover even a sixth of
    // a day. Hunger corroborates when food exists but cannot be reached (no
    // road to the market, wrong region): people are the honest signal.
    const noFood = this.reachableFoodUnits() < need * 0.15;
    const hungryShare = this.hungryCount / this.population;
    // `consumedUnits` is the day that just ended; `consumedYesterday` does not
    // take its value until the tail of `_dayEnded`, below this call.
    const underfed = this.consumedUnits < need * STARVING_INTAKE_SHARE;
    if (noFood || (underfed && hungryShare > STARVING_SHARE)) this.starvingDays++;
    else this.starvingDays = 0;
  }

  _hasApothecaryInRange() {
    const bs = this.allBuildings();
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i];
      if (!a || a.removed || !a.built) continue;
      const ad = this.defOf(a);
      if (!ad || !ad.heal) continue;
      const r2 = ad.heal.radius * ad.heal.radius;
      const ax = centreX(a), ay = centreY(a);
      for (let k = 0; k < bs.length; k++) {
        const h = bs[k];
        if (!h || h.removed || this._housingOf(h) <= 0) continue;
        if (dist2(ax, ay, centreX(h), centreY(h)) <= r2) return true;
      }
    }
    return false;
  }

  /** §9.4's healthTarget, with no side effects — the tooltip reads it too. */
  _healthTargetNow() {
    const v = this.nutrition.varietyScore;
    const season = this.world && this.world.clock ? this.world.clock.season : 0;
    let target = HEALTH_BASE + v * C.VARIETY_HEALTH;
    if (this._hasApothecaryInRange()) target += 8;
    if (this.population > 0 && this.stored('ale') >= this.population * 0.2) target += 5;
    if (this.starvingDays > 0) target -= 25 + this.starvingDays * 6;
    if (season === C.SEASON_WINTER && this.stock('wood') < this.population * 0.4) target -= 12;
    if (this.recentPlagueDays > 0) target -= 15;   // G5: always false today
    return target;
  }

  /**
   * §9.4 recomputes nutrition on day:ended, which is a whole day after the
   * health tooltip is first on screen. The first tick is the earliest point
   * the boot sequence has finished stocking the town, so day 1 reads off the
   * larder the player can see rather than off zeroes (ADDENDUM P4).
   */
  _seedNutrition() {
    this._nutritionSeeded = true;
    this.computeNutrition();
    this.healthTarget = this._healthTargetNow();
    // Day 0 starts *at* the target rather than drifting toward it from a given
    // number: the opening larder is the only evidence the town has.
    this.townHealth = U.clamp(this.healthTarget, 0, 100);
  }

  computeHealth() {
    const target = this._healthTargetNow();
    this.healthTarget = target;
    this.townHealth = U.clamp(this.townHealth + (target - this.townHealth) * 0.25, 0, 100);
    return this.townHealth;
  }

  /* -------------------------- §9.6 happiness ------------------------ */

  computeHappiness() {
    const bs = this.allBuildings();

    // housingScore 0..20 — share of the population housed, weighted by tier.
    let housed = 0, tierWeighted = 0, houseCount = 0;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!b || b.removed || this._housingOf(b) <= 0) continue;
      houseCount++;
      const occ = this._houseCounts.get(b.id) || 0;
      housed += occ;
      const d = this.defOf(b);
      tierWeighted += occ * (d ? d.tier : 1);
    }
    const pop = this.population;
    const share = pop > 0 ? U.clamp(housed / pop, 0, 1) : 0;
    const avgTier = housed > 0 ? tierWeighted / housed : 1;
    const housingScore = 20 * share * (0.75 + 0.25 * ((avgTier - 1) / 3));

    // marketAccess 0..15 and civicScore 0..20, both measured per house.
    let near = 0, civicSum = 0;
    if (houseCount > 0) {
      for (let i = 0; i < bs.length; i++) {
        const h = bs[i];
        if (!h || h.removed || this._housingOf(h) <= 0) continue;
        const hx = centreX(h), hy = centreY(h);
        let hasMarket = false, felt = 0;
        for (let k = 0; k < bs.length; k++) {
          const c = bs[k];
          if (!c || c.removed || !c.built || c.id === h.id) continue;
          const cd = this.defOf(c);
          if (!cd) continue;
          if (!hasMarket && cd.market && dist2(hx, hy, centreX(c), centreY(c)) <= 144) hasMarket = true;
          if (!cd.happiness) continue;
          if (cd.consumes && c.civicSatisfied === false) continue;
          const r = cd.happiness.radius;
          if (dist2(hx, hy, centreX(c), centreY(c)) <= r * r) felt += cd.happiness.amount;
        }
        if (hasMarket) near++;
        civicSum += Math.min(20, felt);
      }
    }
    const marketAccess = houseCount > 0 ? 15 * (near / houseCount) : 0;
    const civicScore = houseCount > 0 ? Math.min(20, civicSum / houseCount) : 0;

    const homelessPenalty = Math.min(20, this.homeless * 1.5);
    let raidKilled = 0;
    for (let i = 0; i < RAID_GRIEF_DAYS; i++) raidKilled += this.raidDeaths[i];
    const raidGrief = Math.min(25, raidKilled * 6);
    const slack = pop * 0.1;
    const unemployedPenalty = Math.min(10, Math.max(0, this.unemployed - slack) * 0.4);

    const h = 45 + housingScore + marketAccess + civicScore
      + (this.townHealth - 50) * 0.2
      - homelessPenalty - raidGrief - unemployedPenalty
      - this.arrearsPenalty;   // §9.7's unpaid-wages penalty, capped so it decays

    this.happinessParts = {
      base: 45, housingScore: housingScore, marketAccess: marketAccess,
      civicScore: civicScore, health: (this.townHealth - 50) * 0.2,
      homelessPenalty: homelessPenalty, raidGrief: raidGrief,
      unemployedPenalty: unemployedPenalty, arrears: this.arrearsPenalty,
    };
    this.happiness = U.clamp(h, 0, 100);
    return this.happiness;
  }

  /* --------------------------- §9.7 coin ---------------------------- */

  _doCoin() {
    const bs = this.allBuildings();
    let prodBonus = 0, taxBonus = 0;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!b || b.removed || !b.built || b.active === false) continue;
      const d = this.defOf(b);
      if (!d || !d.bonus) continue;
      if (d.bonus.production) prodBonus += d.bonus.production;
      if (d.bonus.tax) taxBonus += d.bonus.tax;
    }
    this.productionBonus = 1 + prodBonus;
    this.taxBonus = 1 + taxBonus;

    let upkeep = 0;
    if (this._bUpkeep) {
      upkeep = this.buildings.upkeepTotal();
    } else {
      for (let i = 0; i < bs.length; i++) {
        const d = this.defOf(bs[i]);
        if (bs[i].built && d && d.upkeep && d.upkeep.coin) upkeep += d.upkeep.coin;
      }
    }

    const tax = this.population * TAX_PER_POP * (this.happiness / TAX_HAPPINESS_DIV) * this.taxBonus;
    this.dailyTax = tax;
    this.dailyUpkeep = upkeep;
    this.coin += tax - upkeep;

    if (this.coin < 0) {
      // Never hard-lock on money (§9.7): the debt is written off and paid in
      // mood and in rusting equipment instead.
      this.arrears = -this.coin;
      this.coin = 0;
      this.arrearsPenalty = Math.min(ARREARS_PENALTY_CAP,
        this.arrearsPenalty + ARREARS_HAPPINESS_PER_DAY);
      this._degradeEquipment();
      if (this.bus) this.bus.emit('toast', { text: 'The treasury is empty — wages go unpaid.', kind: 'bad' });
    } else {
      this.arrears = 0;
      this.arrearsPenalty *= 0.5;
      if (this.arrearsPenalty < 0.25) this.arrearsPenalty = 0;
    }
  }

  _degradeEquipment() {
    const B = this.buildings;
    if (!B || typeof B.take !== 'function') return;
    const stores = this.storages();
    for (let i = 0; i < stores.length; i++) {
      const b = stores[i];
      const d = this.defOf(b);
      if (!d || !d.storage || d.storage.classes.indexOf('arms') < 0) continue;
      const ids = C.ARMS_IDS;
      let n = 0;
      for (let k = 0; k < ids.length; k++) if (invQty(b, ids[k]) > 0) n++;
      if (n === 0) continue;
      let pick = this._rng.int(n);
      for (let k = 0; k < ids.length; k++) {
        if (invQty(b, ids[k]) <= 0) continue;
        if (pick-- === 0) { B.take(b, ids[k], 1); this._adjust(ids[k], -1, -1); return; }
      }
    }
  }

  /**
   * §9.4's individual health, settled one day at a time toward the town's own
   * figure plus whatever this villager is personally not going without.
   * Economy owns the demographic fields on the agent (it ages them in the same
   * loop); villagers.js owns everything else on the record.
   */
  _driftHealth(v) {
    const fed = v.hunger < 1 ? 1 - v.hunger : 0;
    const target = this.townHealth + fed * HEALTH_WELLFED_BONUS;
    const cur = v.health === undefined ? this.townHealth : v.health;
    const h = U.clamp(cur + (target - cur) * HEALTH_DRIFT, 0, 100);
    v.health = h;
    return h;
  }

  /* ------------------------ §9.5 population ------------------------- */

  _doPopulation() {
    const V = this.villagers;
    if (!V) return;
    this.births = 0; this.arrivals = 0; this.departures = 0; this.deaths = 0;

    // --- ageing and deaths -------------------------------------------
    const vs = this.allVillagers();
    let starvationQuota = this.starvingDays >= 3 ? Math.max(1, Math.floor(this.population / 20)) : 0;
    for (let i = vs.length - 1; i >= 0; i--) {
      const v = vs[i];
      if (!v || v.dead || v.removed) continue;
      v.age += 1 / C.DAYS_PER_YEAR;
      const hp = this._driftHealth(v);
      if (starvationQuota > 0 && v.hunger >= STARVING_HUNGER) {
        starvationQuota--; this._kill(v, 'starvation'); continue;
      }
      if (hp < 25 && this._rng.next() < (25 - hp) / 900) { this._kill(v, 'illness'); continue; }
      if (v.age > 70 && this._rng.next() < 1 / 200) { this._kill(v, 'old age'); continue; }
    }
    // The toll still falls even if nobody is individually at 0.9 hunger.
    for (let i = vs.length - 1; i >= 0 && starvationQuota > 0; i--) {
      const v = vs[i];
      if (!v || v.dead || v.removed) continue;
      starvationQuota--;
      this._kill(v, 'starvation');
    }

    this._census();

    // --- emigration ---------------------------------------------------
    // Settlers who have just walked into an empty valley do not walk out of it
    // in week one. Without the grace a fresh town emigrates on day 2 — happiness
    // starts at ~25 because §9.6 scores housing, market and civic per house and
    // a hamlet has none (G7) — and a do-nothing town empties by day 12, while
    // the player is still reading the build menu.
    const settled = this.world && this.world.clock ? this.world.clock.day > SETTLING_DAYS : true;
    if (settled && (this.happiness < 25 || this.starvingDays >= 2) && this.population > 1
      && typeof V.beginLeaving === 'function') {
      let quota = EMIGRATION_BASE + Math.floor(this.population / EMIGRATION_PER_POP);
      const cur = this.allVillagers();
      for (let i = cur.length - 1; i >= 0 && quota > 0; i--) {
        const v = cur[i];
        if (!v || v.dead || v.removed) continue;
        if (v.role === 'soldier') continue;
        if (V.beginLeaving(v.id) !== false) { quota--; this.departures++; }
      }
    }

    // --- births -------------------------------------------------------
    if (this.townHealth >= 35 && this.population < C.MAX_VILLAGERS
      && typeof V.spawn === 'function') {
      const need = this.foodNeededPerDay();
      const surplus = need > 0 ? U.clamp(this.foodUnits() / (need * 3), 0, 1.5) : 1.5;
      const chance = C.BIRTH_CHANCE * (this.townHealth / 100) * surplus;
      const bs = this.allBuildings();
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i];
        if (!b || b.removed) continue;
        const cap = this._housingOf(b);
        if (cap <= 0) continue;
        const occ = this._houseCounts.get(b.id) || 0;
        if (occ < 2 || occ >= cap) continue;
        if (this._adultsIn(b.id) < 2) continue;
        if (this._rng.next() >= chance) continue;
        const baby = V.spawn({
          x: centreX(b), y: centreY(b), age: 0, homeId: b.id,
          health: this.townHealth, emit: false,
        });
        if (!baby) break;
        this._houseCounts.set(b.id, occ + 1);
        this.population++;
        this.births++;
        if (this.bus) this.bus.emit('villager:born', { id: baby.id });
        if (this.population >= C.MAX_VILLAGERS) break;
      }
    }

    // --- immigration ---------------------------------------------------
    const freeHousing = this.housingCapacity - this.population;
    // §9.5's "food stock covers 3 days" read off stock the town can reach, and
    // never while it is starving: the same day's emigration is already walking
    // people out, and a stream of migrants into a famine pins the population
    // just above zero forever, which is §16's soft-lock wearing a death toll.
    const daysFood = this.reachableDaysOfFood();
    if (this.happiness > 55 && freeHousing > 0 && daysFood >= 3
      && this.starvingDays === 0 && this.population < C.MAX_VILLAGERS) {
      let n = 1 + Math.floor(this.happiness / 40);
      if (n > freeHousing) n = freeHousing;
      const town = this._townTile();
      for (let i = 0; i < n && this.population < C.MAX_VILLAGERS; i++) {
        const idx = this._passIdx(i);
        const age = 18 + this._rng.int(20);
        // `arriveAt` takes the villager, not the tile they start on: economy
        // spawns them standing in the pass, then sets them walking to town.
        // villagers.js emits `villager:arrived` when they get there (§9.5, G6).
        const m = V.spawn({ idx: idx, age: age, emit: false });
        if (!m) break;
        if (typeof V.arriveAt === 'function') V.arriveAt(m, town);
        this.population++;
        this.arrivals++;
      }
    } else if (this.happiness > 55 && this.population >= C.MAX_VILLAGERS && this.bus) {
      this.bus.emit('toast', { text: 'The valley is full.', kind: 'info' });
    }
  }

  /**
   * §9.5's birth window is `2 <= occupants < capacity`, so housing that fills
   * one house before opening the next leaves every house either empty or full
   * at the day boundary and no child is ever born (ADDENDUM U1). Preference,
   * best first: a house holding a single resident (a pair is where children
   * come from), then an empty house, then one that stays under capacity with
   * one more in it, and only then a last bed — homelessness (§9.6) is the
   * worse outcome, so the last bed is still taken.
   */
  _spreadRank(occ, cap) {
    if (occ === 1) return 0;
    if (occ === 0) return 1;
    if (occ + 1 < cap) return 2;
    return 3;
  }

  /** The house a villager without one should move into. */
  _vacantHouse() {
    const bs = this.allBuildings();
    let best = null, bestRank = 9, bestRoom = -1;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!b || b.removed) continue;
      const cap = this._housingOf(b);
      if (cap <= 0) continue;
      const occ = this._houseCounts.get(b.id) || 0;
      if (occ >= cap) continue;
      const rank = this._spreadRank(occ, cap);
      const room = cap - occ;
      // Roomiest wins within a rank, so the spread holds across house tiers.
      if (rank < bestRank || (rank === bestRank && room > bestRoom)) {
        bestRank = rank; bestRoom = room; best = b;
      }
    }
    return best;
  }

  findVacantHouse() { return this._vacantHouse(); }

  /**
   * Homelessness must be recoverable: a villager who outlives their house, or
   * walked in before a bed was free, is rehoused as soon as one exists.
   * economy picks the house, `villagers.setHome` owns the field.
   */
  _assignHomes() {
    const V = this.villagers;
    if (!V || typeof V.setHome !== 'function' || this.homeless <= 0) return;
    const vs = this.allVillagers();
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (!v || v.dead || v.removed || v.homeId >= 0) continue;
      const h = this._vacantHouse();
      if (!h) return;
      V.setHome(v, h.id);
      this._houseCounts.set(h.id, (this._houseCounts.get(h.id) || 0) + 1);
      this.homeless--;
    }
  }

  _adultsIn(homeId) {
    const vs = this.allVillagers();
    let n = 0;
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (v && !v.dead && !v.removed && v.homeId === homeId && v.age >= ADULT_AGE) n++;
    }
    return n;
  }

  _kill(v, cause) {
    const V = this.villagers;
    this.deaths++;
    this.population--;
    if (V && typeof V.kill === 'function') {
      // villagers.kill() owns the agent: it cancels the task, re-homes the
      // carry and emits `villager:died` (G6). economy must not emit it too.
      V.kill(v.id, cause);
      return;
    }
    this.onVillagerRemoved(v);
    v.dead = true;
  }

  /** Where a migrant walks to. -1 lets villagers.js pick its own anchor. */
  _townTile() {
    const V = this.villagers;
    if (V && typeof V.townAnchor === 'function') {
      const a = V.townAnchor();
      if (a >= 0) return a;
    }
    const bs = this.allBuildings();
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b && !b.removed && b.built && b.defId === 'town_centre' && b.doorIdx >= 0) return b.doorIdx;
    }
    const w = this.world;
    if (w && w.start) return U.toIdx(w.start.x | 0, w.start.y | 0);
    return -1;
  }

  _passIdx(i) {
    const w = this.world;
    const passes = w && w.passes ? w.passes : null;
    if (passes && passes.length > 0) {
      const p = passes[i % passes.length];
      if (typeof p === 'number') return p;
      if (p && p.idx !== undefined) return p.idx;
      if (p && p.x !== undefined) return U.toIdx(p.x | 0, p.y | 0);
    }
    if (w && w.start) return U.toIdx(w.start.x | 0, w.start.y | 0);
    return 0;
  }

  /* --------------------------- §9.8 tier ---------------------------- */

  checkTier() {
    // Sticky: only ever climbs (§16.5).
    for (let i = C.TIERS.length - 1; i > this.tier - 1; i--) {
      const t = C.TIERS[i];
      if (this.population < t.pop) continue;
      if (this.townHealth < t.health) continue;
      if (this.happiness < t.happiness) continue;
      let ok = true;
      for (let k = 0; k < t.requires.length; k++) {
        if (!this._hasBuilt(t.requires[k])) { ok = false; break; }
      }
      if (!ok) continue;
      this.tier = t.tier;
      if (this.bus) {
        this.bus.emit('tier:changed', { tier: t.tier, name: t.name });
        this.bus.emit('toast', { text: 'Your town has grown into a ' + t.name + '!', kind: 'good' });
      }
      return this.tier;
    }
    return this.tier;
  }

  _hasBuilt(defId) {
    if (this._bHasBuilt) return this.buildings.hasBuilt(defId);
    const bs = this.allBuildings();
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b && !b.removed && b.built && b.defId === defId) return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------- *
   * §13  Town-wide alerts (the panel's non-building rows)
   * ---------------------------------------------------------------- */

  _updateAlerts() {
    const a = this.alerts;
    a.length = 0;
    if (this.starvingDays > 0) a.push('starving');
    if (this.homeless > 0) a.push('homeless');
    if (this.unemployed > Math.max(1, this.population * 0.1)) a.push('unemployed');
    const days = this.daysOfFood();
    if (this.population > 0 && Number.isFinite(days) && days < 5) a.push('food low');

    // Parameterised by class (G3): "build a Granary" and "build a Stockpile"
    // are different actions, and one alert row cannot say which.
    const classes = STORAGE_CLASSES;
    for (let i = 0; i < classes.length; i++) {
      const cls = classes[i];
      const r = this.roomForClass(cls);
      this.storagePressure[cls] = r.cap > 0 ? r.room / r.cap : 0;
      if (r.cap === 0) continue;
      const jammed = r.room > 0 && this._itemJammedIn(cls);
      // AF3: a class with no room is only a fault when something is short of
      // something in it. Every store full of wood nobody is waiting for is a
      // town that has enough wood, and "build another Stockpile" is not a fix.
      if (r.room <= 0 && this._classWanted(cls)) {
        U.pushUnique(a, 'no storage: ' + cls);
        if (!this._storageWarned[cls]) {
          this._storageWarned[cls] = true;
          if (this.bus) this.bus.emit('toast', { text: 'No room left for ' + CLASS_NAME[cls] + ' — production will stall.', kind: 'bad' });
        }
      } else if (jammed || r.room < r.cap * STORAGE_WARN_FRACTION) {
        U.pushUnique(a, 'storage full: ' + cls);
        if (!this._storageWarned[cls]) {
          this._storageWarned[cls] = true;
          if (this.bus) this.bus.emit('toast', { text: 'Storage for ' + CLASS_NAME[cls] + ' is nearly full.', kind: 'warn' });
        }
      } else {
        this._storageWarned[cls] = false;
      }
    }
    return a;
  }

  /** buildings.js owns the demand set (AF3); a tree without it keeps the old
   *  unconditional behaviour rather than silencing the row altogether. */
  _classWanted(cls) {
    const B = this.buildings;
    return B && typeof B.classWanted === 'function' ? B.classWanted(cls) : true;
  }

  /* ---------------------------------------------------------------- *
   * §9.7  Trading Post and caravans
   * ---------------------------------------------------------------- */

  setSellOrder(item, qty) {
    if (qty > 0) this.tradeOrders.sell[item] = Math.floor(qty);
    else delete this.tradeOrders.sell[item];
  }

  setBuyOrder(item, qty) {
    if (qty > 0) this.tradeOrders.buy[item] = Math.floor(qty);
    else delete this.tradeOrders.buy[item];
  }

  _findTradingPost() {
    const bs = this.allBuildings();
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!b || b.removed || !b.built) continue;
      const d = this.defOf(b);
      if (d && d.trade) return b;
    }
    return null;
  }

  _maybeSendCaravan(day) {
    const post = this._findTradingPost();
    if (!post) { this.nextCaravanDay = day + CARAVAN_INTERVAL_DAYS; return; }
    if (this.nextCaravanDay === 0) { this.nextCaravanDay = day + CARAVAN_INTERVAL_DAYS; return; }
    if (day < this.nextCaravanDay) return;
    this.nextCaravanDay = day + CARAVAN_INTERVAL_DAYS;
    const idx = this._passIdx(this._rng.int(3));
    const px = U.toX(idx) + 0.5, py = U.toY(idx) + 0.5;
    this.caravans.push({
      x: px, y: py, homeX: px, homeY: py, postId: post.id, state: 'in', traded: false,
    });
    if (this.bus) this.bus.emit('toast', { text: 'A trade caravan is coming down the pass.', kind: 'info' });
  }

  _updateCaravans(dt) {
    const list = this.caravans;
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      const post = this.getBuilding(c.postId);
      if (!post && c.state === 'in') c.state = 'out';
      let tx, ty;
      if (c.state === 'in' && post) { tx = centreX(post); ty = centreY(post); }
      else { tx = c.homeX; ty = c.homeY; }

      const dx = tx - c.x, dy = ty - c.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const step = CARAVAN_SPEED * dt;
      if (d <= step) {
        c.x = tx; c.y = ty;
        if (c.state === 'in') {
          if (!c.traded) { this.runTrade(post); c.traded = true; }
          c.state = 'out';
        } else {
          U.removeSwap(list, i);
        }
      } else {
        c.x += (dx / d) * step;
        c.y += (dy / d) * step;
      }
    }
  }

  /** Executes up to CARAVAN_UNITS of the player's standing orders. */
  runTrade(post) {
    const B = this.buildings;
    if (!post || !B) return { sold: 0, bought: 0, coin: 0 };
    let budget = CARAVAN_UNITS, coinDelta = 0, sold = 0, bought = 0;

    const stores = this.storages();
    for (const item in this.tradeOrders.sell) {
      if (budget <= 0) break;
      let want = Math.min(this.tradeOrders.sell[item], budget);
      for (let i = 0; i < stores.length && want > 0; i++) {
        const got = B.take(stores[i], item, Math.min(want, invQty(stores[i], item)));
        if (got > 0) {
          want -= got; budget -= got; sold += got;
          coinDelta += got * (C.ITEMS[item] ? C.ITEMS[item].value : 1);
        }
      }
    }
    this.coin += coinDelta;

    for (const item in this.tradeOrders.buy) {
      if (budget <= 0) break;
      const price = (C.ITEMS[item] ? C.ITEMS[item].value : 1) * BUY_MARKUP;
      const want = Math.min(this.tradeOrders.buy[item], budget, Math.floor(this.coin / price));
      if (want <= 0) continue;
      const placed = typeof B.deposit === 'function'
        ? B.deposit(item, want, centreX(post), centreY(post))
        : B.add(post, item, want);
      if (placed > 0) { this.coin -= placed * price; budget -= placed; bought += placed; }
    }
    this.invalidateStock();
    if (this.bus && (sold > 0 || bought > 0)) {
      this.bus.emit('toast', {
        text: 'The caravan bought ' + sold + ' and sold you ' + bought + '.', kind: 'good',
      });
    }
    return { sold: sold, bought: bought, coin: coinDelta };
  }

  /* ---------------------------------------------------------------- *
   * §14  Save / restore
   * ---------------------------------------------------------------- */

  serialize() {
    const tasks = [];
    for (let i = 0; i < this.tasks.length; i++) {
      const t = this.tasks[i];
      tasks.push({
        id: t.id, item: t.item, qty: t.qty, fromId: t.fromId, toId: t.toId,
        claimedBy: t.claimedBy, kind: t.kind, age: t.age, picked: t.picked,
      });
    }
    const recency = [];
    this.groupRecency.forEach((arr, id) => { recency.push([id, Array.from(arr)]); });
    const feedRecency = [];
    this.feedRecency.forEach((arr, id) => { feedRecency.push([id, Array.from(arr)]); });
    const n = this.nutrition;
    return {
      tasks: tasks, nextTaskId: this.nextTaskId, rebuildTimer: this.rebuildTimer,
      coin: this.coin, arrears: this.arrears, arrearsPenalty: this.arrearsPenalty,
      townHealth: this.townHealth, happiness: this.happiness, tier: this.tier,
      starvingDays: this.starvingDays, recentPlagueDays: this.recentPlagueDays,
      consumedUnits: this.consumedUnits,
      raidDeaths: this.raidDeaths.slice(), raidDeathCursor: this.raidDeathCursor,
      tradeOrders: {
        sell: Object.assign({}, this.tradeOrders.sell),
        buy: Object.assign({}, this.tradeOrders.buy),
      },
      caravans: this.caravans.map((c) => Object.assign({}, c)),
      nextCaravanDay: this.nextCaravanDay,
      lastDay: this._lastDay,
      recency: recency,
      feedRecency: feedRecency,
      // §9.4 variety only moves on day:ended, so a load that let it start from
      // zero would crater healthTarget for a whole game-day.
      nutrition: {
        varietyScore: n.varietyScore, distinctItems: n.distinctItems,
        distinctGroups: n.distinctGroups, items: n.items.slice(),
      },
      eatenOn: Array.from(this.eatenOn),
      rng: this._rng.getState(),
      debug: Object.assign({}, this.debug),
    };
  }

  restore(obj, game) {
    if (!obj) return;
    if (game) this.game = game;

    for (let i = 0; i < this.tasks.length; i++) this.tasks[i].cancelled = true;
    this.tasks.length = 0;
    this.taskById.clear();
    this.openKeys.clear();
    this.claims.clear();
    this.incoming.clear();
    // Derived from the map, never from the save: a restore onto a live instance
    // would otherwise carry the previous town's stranded rows until the first
    // task rebuild.
    this._strandedReset();

    this.coin = obj.coin || 0;
    this.arrears = obj.arrears || 0;
    this.arrearsPenalty = obj.arrearsPenalty || 0;
    const hadHealth = obj.townHealth !== undefined;
    if (hadHealth) this.townHealth = obj.townHealth;
    this.happiness = obj.happiness === undefined ? 50 : obj.happiness;
    this.tier = obj.tier || 1;
    this.starvingDays = obj.starvingDays || 0;
    this.recentPlagueDays = obj.recentPlagueDays || 0;
    this.consumedUnits = obj.consumedUnits || 0;
    this.nextTaskId = obj.nextTaskId || 1;
    this.rebuildTimer = obj.rebuildTimer || 0;
    this.nextCaravanDay = obj.nextCaravanDay || 0;
    this._lastDay = obj.lastDay || 0;
    if (obj.raidDeaths) {
      for (let i = 0; i < RAID_GRIEF_DAYS; i++) this.raidDeaths[i] = obj.raidDeaths[i] || 0;
    }
    this.raidDeathCursor = obj.raidDeathCursor || 0;
    if (obj.tradeOrders) {
      this.tradeOrders.sell = Object.assign({}, obj.tradeOrders.sell);
      this.tradeOrders.buy = Object.assign({}, obj.tradeOrders.buy);
    }
    this.caravans = obj.caravans ? obj.caravans.map((c) => Object.assign({}, c)) : [];
    if (obj.rng) this._rng.setState(obj.rng);
    if (obj.debug) Object.assign(this.debug, obj.debug);

    this.eatenOn.clear();
    if (obj.eatenOn) {
      for (let i = 0; i < obj.eatenOn.length; i++) {
        const row = obj.eatenOn[i];
        if (C.ITEMS[row[0]]) this.eatenOn.set(row[0], row[1]);
      }
    }

    this.feedRecency.clear();
    this.groupRecency.clear();
    if (obj.recency) {
      // §14: re-validate the cross-module reference rather than trusting the
      // file — `villagers.serialize()` drops anyone `removed`, so a save can
      // name a villager that no longer exists to restore.
      const V = this.villagers;
      const live = V && typeof V.get === 'function' ? V : null;
      for (let i = 0; i < obj.recency.length; i++) {
        const row = obj.recency[i];
        if (live && !live.get(row[0])) continue;
        this.groupRecency.set(row[0], Float32Array.from(row[1]));
      }
    }
    if (obj.feedRecency) {
      for (let i = 0; i < obj.feedRecency.length; i++) {
        const row = obj.feedRecency[i];
        const b = this.getBuilding(row[0]);
        if (b && !b.removed) this.feedRecency.set(row[0], Float32Array.from(row[1]));
      }
    }
    this._restoreNutrition(obj.nutrition);
    // A save from before the field existed carries no health; derive it from the
    // larder it does carry rather than inventing a number (Z1).
    if (!hadHealth) this.townHealth = U.clamp(this._healthTargetNow(), 0, 100);

    // §14 — every cross-module reference is re-validated, never trusted.
    const saved = obj.tasks || [];
    for (let i = 0; i < saved.length; i++) {
      const s = saved[i];
      const from = this.getBuilding(s.fromId);
      const to = this.getBuilding(s.toId);
      if (!to || to.removed) { this.debug.staleDropped++; continue; }
      if ((!from || from.removed) && !s.picked) { this.debug.staleDropped++; continue; }
      const key = this._tripleKey(s.fromId, s.toId, s.item);
      if (this.openKeys.has(key)) { this.debug.staleDropped++; continue; }
      const claimant = s.claimedBy >= 0 ? this.getVillager(s.claimedBy) : null;
      const claimedBy = claimant && !claimant.dead ? s.claimedBy : -1;
      // A mid-carry task whose porter is gone died with them; villagers.js
      // dumped the cargo on their way out, so it must not be resurrected.
      if (s.picked && claimedBy < 0) { this.debug.staleDropped++; continue; }
      const t = {
        id: s.id, item: s.item, qty: s.qty, fromId: s.fromId, toId: s.toId,
        claimedBy: claimedBy, kind: s.kind, age: s.age || 0, picked: !!s.picked,
        cancelled: false, done: false, key: key,
      };
      this.tasks.push(t);
      this.taskById.set(t.id, t);
      this.openKeys.add(key);
      if (!t.picked) this._addClaim(t.fromId, t.item, t.qty);
      this._addIncoming(t.toId, t.item, t.qty);
      if (t.id >= this.nextTaskId) this.nextTaskId = t.id + 1;
    }

    const V = this.villagers;
    if (V && typeof V.relinkTasks === 'function') V.relinkTasks();
    this.invalidateStock();
    this._censusLight();
  }
}

export function createEconomy(game) {
  return new Economy(game);
}

export { Economy };
export default createEconomy;
