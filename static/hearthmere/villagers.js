// Hearthmere — villager agents (DESIGN.md §8).
//
// Pillar 1 of the vision: every villager is a real person on the map and
// nothing teleports. This module owns the agent record, the walk and the
// decision state machine — and no numbers that belong to anyone else.
// Inventory moves go through buildings.add/take, the haul queue through
// economy.claimTask/onPickedUp/completeTask/cancelTask, harvest bookkeeping
// through buildings.gatherComplete, and construction progress through
// buildings.applyBuilder.
//
// Two hard invariants this file exists to protect:
//   1. No villager is ever permanently stuck. Every state has a progress
//      watchdog and a hard state timeout, and recover() always returns an
//      agent to a sane, re-decidable state. Causes are counted in
//      `debug.recoveries` because QA reads them.
//   2. Positions are always finite and inside the grid. One NaN silently
//      corrupts rendering and pathfinding, so it is checked every tick.
//
// Movement uses tiles/sec from world.speedAt()/constants.speedFor(). A path's
// `cost` and world.moveCost() are pathfinding currency (ADDENDUM C) and are
// never used to move anyone.

import {
  MAX_VILLAGERS,
  VILLAGER_TICK_SPLIT,
  CARRY_CAP,
  DAY_SECONDS,
  FLEE_RADIUS,
  GRID_W,
  GRID_H,
  DIR_DX,
  DIR_DY,
  HAND_GATHER_SECONDS,
  IDLE_AT_CAPACITY,
  RESOURCE,
  ITEMS,
  FOOD_IDS,
  FOOD_GROUP_IDS,
  NAMES,
  NIGHT_START,
  NIGHT_END,
  BUILDING_BY_ID,
  speedFor,
} from './constants.js';

import { toIdx, toX, toY, clamp, hash2, RNG, removeSwap, titleCase } from './utils.js';

/* ------------------------------------------------------------------ *
 * Enums and tuning
 * ------------------------------------------------------------------ */

/** §8 state enum. FROZEN — render.js and ui.js key off these values. */
export const VS = {
  IDLE: 0,
  WALK: 1,
  WORK: 2,
  HAUL_PICKUP: 3,
  HAUL_DROP: 4,
  GO_HOME: 5,
  SLEEP: 6,
  GO_EAT: 7,
  FLEE: 8,
  FIGHT: 9,
  LEAVING: 10,
};

export const VS_NAMES = [
  'idle', 'walking', 'working', 'fetching', 'delivering',
  'going home', 'asleep', 'eating', 'fleeing', 'fighting', 'leaving',
];

// Sub-state within a VS value. Not part of the frozen enum — an internal
// detail, but published so the inspector can tell a baker at the bench from a
// woodcutter out at a tree.
export const PH = {
  NONE: 0,
  TO_JOB: 1,
  AT_JOB: 2,
  TO_NODE: 3,
  HARVEST: 4,
  TO_DOOR: 5,
  TO_SITE: 6,
  BUILD: 7,
  TO_STORAGE: 8,
  TO_TOWN: 9,
};

const GRID_N = GRID_W * GRID_H;


// Hunger runs 0..1 over one game-day, so a villager's intake is FOOD_PER_DAY
// (1.0 nutrition units/day) — the §9.4 budget, honestly spent item by item.
const HUNGER_RATE = 1 / DAY_SECONDS;
// J2.3/J2.5 — the meal is an evening errand at the villager's own door, so it
// costs no daylight. HOME sits just under the hunger a full waking day builds
// up (0.66 day awake + 0.34 asleep at half rate = 0.83), which is what makes it
// exactly one meal a day. URGENT is the §16 safety net: only a villager whose
// larder has failed twice over is worth a cross-town walk in working hours.
const HUNGER_HOME = 0.25;
const HUNGER_URGENT = 0.9;
// §8's scale: 0..1, 1 = starving. It therefore cannot reach economy.js's
// STARVING_HUNGER (1.5), so `hungryCount` is always 0 and only the stock-side
// `noFood` test can raise `starvingDays`.
const HUNGER_MAX = 1;
// Standing at your own door counts as being home; sleep parks a villager
// within 1.6 tiles of it.
const HOME_REACH = 1.8;
const SLEEP_HUNGER_MULT = 0.5;
// A meal is whole items, so it usually delivers more nutrition than the eater
// needed. The surplus becomes seconds of satiety rather than being thrown
// away, which keeps intake equal to the nutrition actually consumed and stops
// a bread-fed town walking to the market three times a day.
const SATIETY_PER_NUTRITION = DAY_SECONDS;

// Seconds of *no progress at all* before the watchdog fires. Generous enough
// that a full path queue (PATH_CALLS_PER_TICK) always drains first.
const STUCK_LIMIT = 6;
// Absolute ceiling on any one state, a backstop against a pathological loop
// that still technically "progresses". Exempt states are listed in isExempt().
const STATE_MAX = 300;

const WANDER_RADIUS = 4;

// A workplace stalled for one of these has nothing its own crew can do about
// it by standing there: the shelf is full, the hopper is empty, the patch is
// bare. Anything else ('night', 'no road', 'cut off', 'paused') is either a
// wait that ends on its own or a fault the worker must not walk away from.
const STALL_HAUL = new Set([
  'no storage: food', 'no storage: good', 'no storage: arms',
  // A worker at a hut the town has no further use for is the clearest case
  // there is of labour the haul queue should be able to see (AE2).
  IDLE_AT_CAPACITY,
  'output full', 'resource exhausted', 'out of season',
]);

// §16.1's gather-by-hand. A Woodcutter's worker takes 2 wood every 3 seconds
// inside an 8-tile radius; this is 1 every HAND_GATHER_SECONDS with a walk at
// each end, so it is roughly a fifth of the rate and never worth choosing.
// The load is small so the errand ends — and the town is re-tested — often.
const HAND_GATHER_LOAD = 4;
const HAND_GATHER_RADIUS = 20;

// M4 — below this many days of food in hand, food jobs outrank anything that
// only moves, guards or adorns what the town eats. It sits just under §13's
// 'food low' alert at five days, and that ceiling matters: a working town runs
// at four to eight days in hand, so a higher number leaves it permanently in
// panic and therefore permanently without a garrison.
const FOOD_PANIC_DAYS = 4;
// Hauling is part of the food chain, so M4 never drafts a town below this
// many porters however hungry it is.
const PORTER_FLOOR = 2;
// ...and never takes more than this share of the manned garrison: §10.6's
// soft-lock is a town with nobody to fight, which starving does not excuse.
const GARRISON_KEEP = 0.5;
// Q3's mirror image. The warning window is two days, so the haul queue can run
// thin for it, but not stop: a town that eats nothing for two days meets the
// raid at zero health.
const WAR_PORTER_FLOOR = 1;

// M4's ordering when the town is short of food. The frozen rule moves food
// ahead of *storage, garrison and civic* — not ahead of the timber and stone
// that build the next food hut, which is why rank 1 exists: strip the
// woodcutters to man a berry patch and the town starves a slower way.
// 0 — makes food.  1 — makes anything else.  2 — makes nothing: hauls, guards,
// or serves.
function foodJobRank(d) {
  if (!d || !d.jobs) return 2;
  if (yieldsFood(d.gathers) || yieldsFood(d.grows) || recipesYieldFood(d)) return 0;
  if (d.gathers || d.grows || d.recipe || (d.recipes && d.recipes.length)) return 1;
  return 2;
}

// Q3 — the queue a town under warning fills in: food while it is short, then
// the garrison, then everything else. Both bands collapse to "everything else"
// when their condition is off, so an ordinary day still fills by build order.
function slotRank(d, starving, alarm) {
  const fr = foodJobRank(d);
  if (starving && fr === 0) return 0;
  if (alarm && isGarrison(d)) return 1;
  if (starving && fr === 1) return 2;
  return 3;
}

function isGarrison(d) {
  return !!(d && d.jobs && (d.role === 'soldier' || d.garrison > 0));
}

function yieldsFood(g) {
  if (!g) return false;
  if (isFoodItem(g.item)) return true;
  return !!(g.alt && isFoodItem(g.alt.item));
}

function recipesYieldFood(d) {
  const rs = d.recipes || (d.recipe ? [d.recipe] : null);
  if (!rs) return false;
  for (let i = 0; i < rs.length; i++) {
    const out = rs[i].out;
    for (const k in out) if (isFoodItem(k)) return true;
  }
  return false;
}

function isFoodItem(id) {
  const it = id ? ITEMS[id] : null;
  return !!(it && it.cls === 'food');
}
// Y4a — how far a villager buried by a new footprint will look for ground to
// step onto. Matched to snapToWalkable's reach, so the only case the walk
// cannot answer is one the last-resort snap cannot answer either.
const ASIDE_RADIUS = 8;
// A route blocked by a building going up across it is re-asked for, not
// abandoned; past this many in a row the ordinary recovery takes over.
const MAX_BLOCKED_REPATHS = 3;
// A step aside is a stride, not a journey. If the ground it was aimed at is
// still not underfoot by now, something changed again and the walk is dropped.
const ASIDE_MAX_SECONDS = 30;
// Ground on the far side of the new building is no use to a man who was
// heading into town; it is taken only when nothing nearer connects.
const ASIDE_OFF_SIDE = 1e6;
// Two men shuffled off one footprint spread out if there is room, but not at
// the price of a longer walk than a couple of tiles.
const ASIDE_CROWDED = 4;

const HOMELESS_SLEEP_RADIUS = 6;
const REINDEX_INTERVAL = 1.0;
const ARRIVE_TIMEOUT = 90;
const LEAVE_TIMEOUT = 150;
const EAT_COOLDOWN = 8;
// Q1 — each failed search doubles the wait: looking again before the town's
// stock changes finds the same nothing, and a villager who searches every
// cooldown drops and re-claims the same haul forever without moving any food.
const EAT_FAIL_MAX = 4;
const EAT_BACKOFF_MAX = 60;
// Q1 — goods in hand reach a store before their carrier goes looking for food,
// but not indefinitely: a villager with nowhere to put them still has to eat.
const MEAL_CARRY_DEFER = 45;
const EAT_MAX_SECONDS = 120;
// U2 — an empty larder with a porter already walking food to it is worth a
// short wait; the cross-town meal it replaces costs many times this. Bounded
// like Q1's backoff, and never used at starving hunger, so a delivery that
// never lands cannot hold anyone at the door.
const MEAL_WAIT_SECONDS = 10;
const MEAL_WAIT_MAX = 3;
const NODE_FAIL_COOLDOWN = 4;
const MAX_PATH_FAILS = 2;
const MAX_PARTIAL_HOPS = 5;
const MAX_CARRY_FAILS = 3;
const COMBAT_REPATH = 0.6;
const ADULT_AGE = 16;
// §16.3/G2.3: a paid-for site nobody has worked for this long may be finished
// by any villager whose own workplace is idle.
const SITE_STALL_SECONDS = 10;
// Peacetime patrol (§10.1/H6). Flavour only: it walks tile by tile and never
// calls paths.js, so a large garrison costs nothing from the A* budget.
const PATROL_PAUSE = 2;
const PATROL_ARRIVE = 1.4;
const PATROL_MISS_LIMIT = 4;
const PATROL_GIVEUP = 20;

const EMPTY_LIST = [];

/* ------------------------------------------------------------------ *
 * Module
 * ------------------------------------------------------------------ */

export function createVillagers(game) {
  return new Villagers(game);
}

class Villagers {
  constructor(game) {
    // MUST NOT read other modules here (§12) — only stash the game object.
    this.game = game;
    this.list = [];
    this.index = new Map();

    this.nextId = 1;
    this.cursor = 0;
    this.tick = 0;
    this.now = 0;
    this.nameSalt = 0x5eed;
    this.rng = new RNG(0xa17b5c3d);
    this.world = null;
    // Published so ui.js/render.js never have to assume the numeric order of
    // the §8 enum, which would fail silently if it ever changed.
    this.VS = VS;
    this.PH = PH;
    this.VS_NAMES = VS_NAMES;

    // Cached building views, rebuilt on a timer and on building events.
    this.markets = [];
    this.houses = [];
    this.sites = [];
    this.foodStores = [];
    this.gates = [];
    this.townCentre = null;
    // Hunger per second, refreshed from economy each update so §9.4's Winter
    // multiplier reaches actual consumption and not just the HUD (G4).
    this.hungerRate = HUNGER_RATE;
    // siteId -> last time a builder applied labour there. Feeds the local
    // fallback for buildings.siteNeedsAnyBuilder().
    this.siteWork = new Map();
    this.startIdx = -1;
    this.reindexTimer = 0;
    this.indexDirty = true;
    this.doorFallback = new Map();

    // Last seen b.priority, so a priority *drop* can free its workers (§8).
    this.priorityMemo = new Map();

    this.debug = {
      recoveries: Object.create(null),
      recoveryTotal: 0,
      aborts: Object.create(null),
      pathRequests: 0,
      pathFailures: 0,
      greedyFallbacks: 0,
      nanEvents: 0,
      snaps: 0,
      stepAsides: 0,
      asideSnaps: 0,
      blockedRepaths: 0,
      tasksCompleted: 0,
      tasksCancelled: 0,
      itemsEaten: 0,
      deposited: 0,
      handGathered: 0,
    };

    this._onDayEnded = () => this.assignJobs();
    this._onBuildingDone = () => { this.indexDirty = true; this.assignJobs(); };
    this._onBuildingGone = (p) => this.onBuildingDestroyed(p && p.id);
  }

  /** Called after every module exists (§12). Safe to cross-reference now. */
  init() {
    const g = this.game;
    this.world = g.world || null;
    if (this.world && this.world.start) {
      this.startIdx = toIdx(this.world.start.x | 0, this.world.start.y | 0);
    }
    if (this.world && this.world.seed !== undefined) this.nameSalt = this.world.seed >>> 0;
    const bus = g.bus;
    if (bus && typeof bus.on === 'function') {
      bus.on('day:ended', this._onDayEnded);
      bus.on('building:completed', this._onBuildingDone);
      bus.on('building:destroyed', this._onBuildingGone);
    }
    this.reindex();
  }

  dispose() {
    const bus = this.game && this.game.bus;
    if (!bus || typeof bus.off !== 'function') return;
    bus.off('day:ended', this._onDayEnded);
    bus.off('building:completed', this._onBuildingDone);
    bus.off('building:destroyed', this._onBuildingGone);
  }

  /* ---------------------------------------------------------------- *
   * Lifecycle commands — economy.js decides, villagers.js executes
   * ---------------------------------------------------------------- */

  /**
   * `spawn(x, y, opts)` — float tile position. Returns the agent, or null when
   * the valley is full (§8, MAX_VILLAGERS). `opts`: {age, health, hunger,
   * homeId, role, name}. An options object may also be passed on its own.
   */
  spawn(x, y, opts) {
    if (this.list.length >= MAX_VILLAGERS) return null;
    let o = opts;
    let px = x;
    let py = y;
    if (x !== null && typeof x === 'object') { o = x; px = o.x; py = o.y; }
    o = o || {};
    if (px === undefined && o.idx !== undefined && o.idx >= 0) {
      px = toX(o.idx) + 0.5;
      py = toY(o.idx) + 0.5;
    }
    if (px === undefined || py === undefined) {
      const s = this.spawnAnchor();
      px = toX(s) + 0.5;
      py = toY(s) + 0.5;
    }
    const v = this.makeAgent(this.nextId++);
    v.vx = clamp(px, 0.01, GRID_W - 0.01);
    v.vy = clamp(py, 0.01, GRID_H - 0.01);
    v.age = o.age === undefined ? 18 : o.age;
    v.health = o.health === undefined ? 70 : o.health;
    v.hunger = o.hunger === undefined ? 0.15 : o.hunger;
    v.homeId = o.homeId === undefined ? -1 : o.homeId;
    v.role = o.role || 'idler';
    v.name = o.name || this.nameFor(v.id);
    this.list.push(v);
    this.index.set(v.id, v);
    this.snapToWalkable(v);
    return v;
  }

  /**
   * A migrant walks in from a pass to `toTile` (§9.5). economy decides the
   * migration; this module owns the walk and emits `villager:arrived` when
   * they are actually in the valley (G6).
   */
  arriveAt(vOrId, toTile) {
    const v = this.resolve(vOrId);
    if (!v) return null;
    v.arriving = true;
    v.arriveTimer = 0;
    v.arriveTarget = toTile === undefined ? this.townAnchor() : toTile;
    this.setState(v, VS.WALK);
    this.setPhase(v, PH.TO_TOWN);
    return v;
  }

  /** Mark a villager as leaving: they walk to a pass and are then removed. */
  beginLeaving(vOrId) {
    const v = this.resolve(vOrId);
    if (!v || v.dead || v.state === VS.LEAVING) return false;
    this.releaseTask(v, 'emigrating');
    this.loseJob(v);
    this.depositCarry(v);
    v.arriving = false;
    v.leaving = true;
    v.leaveTimer = 0;
    this.clearPath(v);
    this.setState(v, VS.LEAVING);
    this.setPhase(v, PH.NONE);
    return true;
  }

  /**
   * Kill a villager. §9.3: their claimed task is cancelled and anything they
   * carried is deposited rather than vanishing. The agent stays in the list
   * until the next reap so economy/military/render still see them this tick.
   */
  kill(vOrId, cause) {
    const v = this.resolve(vOrId);
    if (!v || v.dead) return false;
    this.releaseTask(v, 'died');
    this.depositCarry(v);
    this.loseJob(v);
    v.dead = true;
    v.deadCause = cause || 'unknown';
    this.clearPath(v);
    this.cancelPathRequest(v);
    this.emit('villager:died', { id: v.id, cause: v.deadCause, x: v.vx, y: v.vy });
    return true;
  }

  /** economy.js picks which house; villagers.js owns the field. */
  setHome(vOrId, buildingId) {
    const v = this.resolve(vOrId);
    if (!v) return false;
    v.homeId = buildingId === undefined ? -1 : buildingId;
    v.serial++;
    return true;
  }

  /** Remove dead/departed agents. Called at the top of update(). */
  reap() {
    const list = this.list;
    let removed = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const v = list[i];
      if (!v.dead && !v.removed) continue;
      this.cancelPathRequest(v);
      this.index.delete(v.id);
      removeSwap(list, i);
      removed++;
    }
    if (removed > 0 && this.cursor >= list.length) this.cursor = 0;
    return removed;
  }

  get(id) {
    return this.index.get(id) || null;
  }

  /** Alias ui.js and input.js use. Same contract as get(). */
  byId(id) {
    return this.index.get(id) || null;
  }

  /**
   * Nearest living villager within `radius` tiles of a float tile position,
   * or -1. input.js uses this for click-to-select, so the pick must beat the
   * building underneath them.
   */
  pickAt(fx, fy, radius) {
    const r = radius === undefined ? 0.6 : radius;
    const r2 = r * r;
    let best = -1;
    let bd = r2;
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v.dead || v.removed) continue;
      const dx = v.vx - fx;
      const dy = v.vy - fy;
      const d = dx * dx + dy * dy;
      if (d <= bd) { bd = d; best = v.id; }
    }
    return best;
  }

  /** Accepts an agent or an id — economy and military call both ways. */
  resolve(vOrId) {
    if (vOrId === null || vOrId === undefined) return null;
    if (typeof vOrId === 'object') return vOrId.id === undefined ? null : vOrId;
    return this.index.get(vOrId) || null;
  }

  get count() {
    return this.list.length;
  }

  /* ---------------------------------------------------------------- *
   * Agent record (§8)
   * ---------------------------------------------------------------- */

  makeAgent(id) {
    const v = {
      id,
      name: '',
      vx: 0.5,
      vy: 0.5,
      homeId: -1,
      jobId: -1,
      role: 'idler',
      state: VS.IDLE,
      path: null,
      pathStep: 0,
      target: -1,
      carry: { item: '', qty: 0 },
      task: null,
      age: 18,
      hunger: 0,
      health: 70,
      timer: 0,
      dead: false,

      // --- implementation detail, all JSON-safe and serialized ---
      fed: 0,
      phase: PH.NONE,
      pathLen: 0,
      pathBuf: null,
      pathPending: false,
      pathReqId: -1,
      pathFails: 0,
      partialHops: 0,
      carryFails: 0,
      nodeIdx: -1,
      nodeFailUntil: 0,
      // Y4a: the tile being stepped onto to get off a new footprint, and the
      // destination the interrupted journey resumes to.
      aside: -1,
      asideResume: -1,
      asideTime: 0,
      blockedRepaths: 0,
      handGather: false,
      eatUntil: 0,
      eatFails: 0,
      eatDeferUntil: 0,
      mealWaits: 0,
      eatTargetId: -1,
      siteId: -1,
      stateTime: 0,
      stuck: 0,
      serial: 0,
      seenSerial: -1,
      arriving: false,
      arriveTarget: -1,
      arriveTimer: 0,
      leaving: false,
      leaveTimer: 0,
      removed: false,
      deadCause: '',
      conscript: false,
      prevRole: '',
      prevJobId: -1,
      combatEnemy: -1,
      combatRepath: 0,
      // Peacetime patrol, rebuilt by decide() — deliberately not serialized.
      patrolTo: -1,
      patrolMiss: 0,
      patrolUntil: 0,
      taskId: -1,
      groupLast: [0, 0, 0, 0, 0, 0],
      stepBuf: null,
      pathCb: null,
    };
    // Bound once per agent, so a path request allocates nothing per call.
    v.pathCb = (res, req) => this.onPath(v, res, req);
    return v;
  }

  /** Stable seeded name (§8). Deterministic in the id, so saves cannot drift. */
  nameFor(id) {
    const g = NAMES.given;
    const b = NAMES.byname;
    const a = Math.floor(hash2(id, 17, this.nameSalt) * g.length) % g.length;
    const c = Math.floor(hash2(id, 91, this.nameSalt ^ 0x9e37) * b.length) % b.length;
    return g[a] + ' ' + b[c];
  }

  /* ---------------------------------------------------------------- *
   * Per-tick update (§8: movement for all, decisions round-robin)
   * ---------------------------------------------------------------- */

  update(dt, game) {
    if (game) this.game = game;
    if (!this.world && this.game) this.world = this.game.world || null;
    this.reap();
    this.hungerRate = this.currentHungerRate();
    const list = this.list;
    const n = list.length;
    this.tick++;
    this.now += dt;

    this.reindexTimer -= dt;
    if (this.reindexTimer <= 0 || this.indexDirty) {
      this.reindex();
      this.reindexTimer = REINDEX_INTERVAL;
    }
    if (n === 0) return;

    const night = this.isNight();

    // Movement + timers for EVERY villager, every tick, framerate-independent.
    for (let i = 0; i < n; i++) {
      const v = list[i];
      if (v.dead) continue;
      this.tickAgent(v, dt, night);
    }

    // Decisions for ceil(n / VILLAGER_TICK_SPLIT) of them, round-robin so the
    // set rotates even as the list churns.
    const share = Math.ceil(n / VILLAGER_TICK_SPLIT);
    let c = this.cursor;
    if (c >= n) c = 0;
    for (let k = 0; k < share; k++) {
      const v = list[c];
      if (v && !v.dead && !v.removed) this.decide(v);
      c++;
      if (c >= n) c = 0;
    }
    this.cursor = c;
  }

  tickAgent(v, dt, night) {
    const px = v.vx;
    const py = v.vy;

    v.stateTime += dt;
    if (v.combatRepath > 0) v.combatRepath -= dt;
    if (v.arriving) v.arriveTimer += dt;
    if (v.state === VS.LEAVING) v.leaveTimer += dt;

    if (v.fed > 0) {
      v.fed -= dt;
      if (v.fed < 0) v.fed = 0;
    } else {
      v.hunger += this.hungerRate * dt * (v.state === VS.SLEEP ? SLEEP_HUNGER_MULT : 1);
      if (v.hunger > HUNGER_MAX) v.hunger = HUNGER_MAX;
    }

    let timerRan = false;
    if (v.timer > 0) {
      v.timer -= dt;
      timerRan = true;
      if (v.timer <= 0) {
        v.timer = 0;
        this.onTimer(v);
      }
    }

    if (v.aside >= 0) this.moveAside(v, dt);
    else if (v.path) this.move(v, dt);

    // A single NaN corrupts rendering and pathfinding silently, so it is
    // checked here rather than trusted anywhere downstream.
    if (!Number.isFinite(v.vx) || !Number.isFinite(v.vy)) {
      this.debug.nanEvents++;
      const anchor = this.spawnAnchor();
      v.vx = toX(anchor) + 0.5;
      v.vy = toY(anchor) + 0.5;
      this.recover(v, 'nan-position');
    }
    if (v.vx < 0 || v.vx > GRID_W || v.vy < 0 || v.vy > GRID_H) {
      v.vx = clamp(v.vx, 0.01, GRID_W - 0.01);
      v.vy = clamp(v.vy, 0.01, GRID_H - 0.01);
      this.recover(v, 'off-map');
    }

    // Builders on site: buildings.js owns b.progress and completion; this only
    // supplies labour for the ticks a builder is actually standing there.
    if (v.state === VS.WORK && v.phase === PH.BUILD && v.siteId >= 0) {
      const B = this.game.buildings;
      const b = this.getBuilding(v.siteId);
      // A finished building still holds its builders while a repair runs on it:
      // applyBuilder() forwards to the repair, and releasing them the instant
      // `built` went true is what kept every repair builderless.
      if (!b || (b.built && !this.isRepairing(b))) {
        v.siteId = -1;
        this.setPhase(v, PH.NONE);
        this.setState(v, VS.IDLE);
      } else if (B && typeof B.applyBuilder === 'function') {
        B.applyBuilder(b, dt, v.role !== 'builder');
        this.siteWork.set(b.id, this.now);
      }
    }

    const dx = v.vx - px;
    const dy = v.vy - py;
    const moved = dx * dx + dy * dy > 1e-10;
    if (moved || v.serial !== v.seenSerial || timerRan) {
      v.seenSerial = v.serial;
      v.stuck = 0;
    } else if (this.isExempt(v, night)) {
      v.stuck = 0;
    } else {
      v.stuck += dt;
      if (v.stuck > STUCK_LIMIT) this.recover(v, 'stuck-timeout');
    }

    if (v.stateTime > STATE_MAX && !this.isExempt(v, night)) this.recover(v, 'state-timeout');
  }

  /**
   * States where standing perfectly still for a long time is correct, so the
   * watchdog must not fire: asleep at night, at the workbench (the *building*
   * produces; the worker only has to be present), on a site, and in combat
   * (military.js drives those).
   */
  isExempt(v, night) {
    if (v.state === VS.SLEEP) return true;
    if (v.state === VS.FIGHT) return true;
    // Cowering indoors with raiders outside is the point of fleeing, and it
    // ends when threatNear() goes false — not a soft-lock.
    if (v.state === VS.FLEE && !v.path && !v.pathPending) return true;
    if (v.state === VS.WORK && (v.phase === PH.AT_JOB || v.phase === PH.BUILD)) return true;
    return night === true && v.state === VS.GO_HOME && v.homeId < 0;
  }

  onTimer(v) {
    if (v.state === VS.WORK && v.phase === PH.HARVEST) {
      if (v.handGather) {
        // §16.1: no hut to report to, so the cut resolves where it happened.
        this.handGatherCut(v);
        v.serial++;
        return;
      }
      this.gatherPicked(v);
    }
    v.serial++;
  }

  /**
   * T3 — one node is in the basket. Step to the next node inside the working
   * radius, or carry a full basket home. The harvest numbers are buildings.js's
   * business; the villager only ever walks.
   */
  gatherPicked(v) {
    const B = this.game.buildings;
    const b = v.jobId >= 0 ? this.getBuilding(v.jobId) : null;
    if (b && B && typeof B.gatherPick === 'function') {
      B.gatherPick(b, v.id, v.nodeIdx);
      // A node the villager can already work from where they stand is not a
      // step — atTile's reach is 1.5 tiles, so without this a "circuit" is
      // three harvests on one spot (T4).
      const next = typeof B.gatherNextFor === 'function'
        ? B.gatherNextFor(b, v.id, v.nodeIdx, (i) => this.atTile(v, i)) : -1;
      if (next >= 0 && this.reachable(v, next)) {
        v.nodeIdx = next;
        this.setState(v, VS.WALK);
        this.setPhase(v, PH.TO_NODE);
        return;
      }
    }
    this.setState(v, VS.WALK);
    this.setPhase(v, PH.TO_DOOR);
  }

  /* ---------------------------------------------------------------- *
   * Movement (§6 speeds, §8 health scaling)
   * ---------------------------------------------------------------- */

  /** Tiles/sec on a tile. Never `moveCost` — that is A* currency (ADDENDUM C). */
  speedOn(idx) {
    const w = this.world;
    if (!w) return 0.5;
    if (typeof w.speedAt === 'function') return w.speedAt(idx);
    return speedFor(w.road ? w.road[idx] : 0, w.terrain ? w.terrain[idx] : 3);
  }

  /**
   * Walks `dt` game-seconds along `path`. Time, not distance, is the budget
   * and each segment is charged at the speed of the tile being entered, so the
   * decomposition — and therefore the journey duration — is identical at any
   * frame rate.
   */
  move(v, dt) {
    const hm = 0.7 + 0.3 * (v.health / 100);
    let t = dt;
    let guard = 0;

    while (t > 1e-9 && v.path && v.pathStep < v.pathLen) {
      if (++guard > 128) break;
      const idx = v.path[v.pathStep];
      if (!(idx >= 0 && idx < GRID_N)) {
        this.clearPath(v);
        this.recover(v, 'path-corrupt');
        return;
      }
      const spd = this.speedOn(idx) * hm;
      // speedAt() reads road and terrain only, so it cannot see a building
      // raised across this route after it was planned — and without this a
      // villager walks straight through the new wall (§1). The tile already
      // underfoot is exempt: leaving one is the whole point of Y4a's stride.
      const blocked = !(spd > 0) || (this.world && typeof this.world.isWalkable === 'function'
        && !this.world.isWalkable(idx) && idx !== this.tileOf(v));
      if (blocked) {
        // He stops where he stands and asks for another way round. His errand
        // and his load are his own; a building going up is not a reason to
        // drop either, so recover() is the fallback, not the first answer.
        this.clearPath(v);
        if (v.target >= 0 && v.blockedRepaths < MAX_BLOCKED_REPATHS) {
          v.blockedRepaths++;
          this.debug.blockedRepaths++;
          this.goTo(v, v.target);
        } else {
          this.recover(v, 'path-blocked');
        }
        return;
      }
      const tx = toX(idx) + 0.5;
      const ty = toY(idx) + 0.5;
      const ddx = tx - v.vx;
      const ddy = ty - v.vy;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d < 1e-9) {
        v.pathStep++;
        continue;
      }
      const need = d / spd;
      if (need <= t) {
        v.vx = tx;
        v.vy = ty;
        t -= need;
        v.pathStep++;
        v.serial++;
      } else {
        const f = (spd * t) / d;
        v.vx += ddx * f;
        v.vy += ddy * f;
        t = 0;
      }
    }

    if (v.path && v.pathStep >= v.pathLen) {
      this.clearPath(v);
      v.serial++;
    }
  }

  clearPath(v) {
    if (v.path) v.serial++;
    v.path = null;
    v.pathLen = 0;
    v.pathStep = 0;
  }

  tileOf(v) {
    const x = v.vx | 0;
    const y = v.vy | 0;
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return -1;
    return y * GRID_W + x;
  }

  /** True when the villager is on, or immediately beside, `idx`. */
  atTile(v, idx) {
    if (idx < 0) return false;
    if (this.tileOf(v) === idx) return true;
    const dx = toX(idx) + 0.5 - v.vx;
    const dy = toY(idx) + 0.5 - v.vy;
    return dx * dx + dy * dy <= 2.25;
  }

  /* ---------------------------------------------------------------- *
   * Pathfinding (budgeted — §6)
   * ---------------------------------------------------------------- */

  /**
   * Ask paths.js for a route. Always the async form: paths.js serves at most
   * PATH_CALLS_PER_TICK A* calls per tick and queues the rest, and a villager
   * waiting on the queue holds its state — it never spins or blocks the tick.
   */
  goTo(v, toTile) {
    if (!(toTile >= 0 && toTile < GRID_N)) return false;
    const from = this.tileOf(v);
    if (from < 0) {
      this.snapToWalkable(v);
      return false;
    }
    if (from === toTile) {
      this.clearPath(v);
      return true;
    }
    this.cancelPathRequest(v);
    v.target = toTile;
    v.serial++;
    const paths = this.game && this.game.paths;
    if (!paths || typeof paths.request !== 'function') return this.straightPath(v, toTile);
    v.pathPending = true;
    this.debug.pathRequests++;
    v.pathReqId = paths.request(from, toTile, v.pathCb);
    return true;
  }

  /** Abandoning a destination must drop the queued request, or the callback
   *  fires later against an agent that has moved on (or died). */
  cancelPathRequest(v) {
    if (!v.pathPending) return;
    const paths = this.game && this.game.paths;
    if (paths && typeof paths.cancel === 'function' && v.pathReqId >= 0) paths.cancel(v.pathReqId);
    v.pathPending = false;
    v.pathReqId = -1;
  }

  onPath(v, res, req) {
    if (v.dead || v.removed) return;
    // paths.js switches to adjacency mode when the destination is unwalkable,
    // so the last tile is NOT necessarily `to`. Staleness is judged on the
    // request's destination, never on the path's endpoint.
    if (req && req.to !== undefined && req.to !== v.target) return;
    if (!v.pathPending) return;
    v.pathPending = false;
    v.pathReqId = -1;
    const tiles = res && res.tiles;
    const n = tiles ? tiles.length : 0;
    if (n === 0) {
      this.onPathFail(v);
      return;
    }
    if (res.partial) {
      v.partialHops++;
      if (v.partialHops > MAX_PARTIAL_HOPS) {
        v.partialHops = 0;
        this.recover(v, 'partial-path-loop');
        return;
      }
    } else {
      v.partialHops = 0;
    }
    this.setPath(v, tiles, n);
    v.pathFails = 0;
    v.blockedRepaths = 0;
  }

  setPath(v, tiles, n) {
    if (!v.pathBuf || v.pathBuf.length < n) v.pathBuf = new Int32Array(n + 32);
    const buf = v.pathBuf;
    for (let i = 0; i < n; i++) buf[i] = tiles[i];
    v.path = buf;
    v.pathLen = n;
    // tiles[0] is always the start tile; stepping to its own centre first would
    // just be a visible stutter.
    v.pathStep = n > 1 && buf[0] === this.tileOf(v) ? 1 : 0;
    v.serial++;
  }

  onPathFail(v) {
    this.debug.pathFailures++;
    v.pathFails++;
    const paths = this.game && this.game.paths;
    if (paths && typeof paths.findGreedy === 'function' && v.pathFails <= MAX_PATH_FAILS) {
      const r = paths.findGreedy(this.tileOf(v), v.target);
      if (r && r.tiles && r.tiles.length > 0) {
        v.partialHops++;
        if (v.partialHops <= MAX_PARTIAL_HOPS) {
          this.debug.greedyFallbacks++;
          this.setPath(v, r.tiles, r.tiles.length);
          return;
        }
        v.partialHops = 0;
      }
    }
    this.recover(v, 'no-path');
  }

  /** Last-ditch route with no paths.js at all: step straight, staying legal. */
  straightPath(v, toTile) {
    const world = this.world;
    const start = this.tileOf(v);
    if (start < 0) return false;
    const tx = toX(toTile);
    const ty = toY(toTile);
    const tmp = this._straightBuf || (this._straightBuf = new Int32Array(GRID_W + GRID_H + 4));
    let n = 0;
    let cx = toX(start);
    let cy = toY(start);
    let guard = 0;
    while ((cx !== tx || cy !== ty) && n < tmp.length && ++guard < 512) {
      cx += Math.sign(tx - cx);
      cy += Math.sign(ty - cy);
      const idx = cy * GRID_W + cx;
      if (world && typeof world.isWalkable === 'function' && !world.isWalkable(idx)) break;
      tmp[n++] = idx;
    }
    if (n === 0) {
      this.recover(v, 'no-path');
      return false;
    }
    this.setPath(v, tmp, n);
    return true;
  }

  /* ---------------------------------------------------------------- *
   * Recovery — the anti-soft-lock core (§16)
   * ---------------------------------------------------------------- */

  /**
   * Always returns the agent to a sane, re-decidable state. Cargo is kept (the
   * deliver-carry branch routes it to a storage) — nothing is deleted here.
   */
  recover(v, cause) {
    const d = this.debug.recoveries;
    d[cause] = (d[cause] || 0) + 1;
    this.debug.recoveryTotal++;

    if (v.task) this.releaseTask(v, cause);
    this.cancelPathRequest(v);
    this.clearPath(v);
    v.aside = -1;
    v.asideResume = -1;
    v.asideTime = 0;
    v.target = -1;
    v.nodeIdx = -1;
    v.siteId = -1;
    v.stuck = 0;
    this.finishArriving(v);
    v.partialHops = 0;
    this.setPhase(v, PH.NONE);
    if (v.state !== VS.LEAVING) this.setState(v, VS.IDLE);
    v.stateTime = 0;
    // Short randomised pause so a whole cohort recovering at once does not
    // re-request 220 paths on the same tick.
    v.timer = 0.4 + this.rng.next() * 1.2;
    this.snapToWalkable(v);
  }

  /** Nudge an agent standing on an unwalkable tile back onto legal ground. */
  snapToWalkable(v) {
    const world = this.world;
    if (!world || typeof world.isWalkable !== 'function') return;
    const cur = this.tileOf(v);
    if (cur >= 0 && world.isWalkable(cur)) return;
    const cx = v.vx | 0;
    const cy = v.vy | 0;
    for (let r = 1; r <= 8; r++) {
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
          if (Math.abs(x - cx) !== r && Math.abs(y - cy) !== r) continue;
          const idx = y * GRID_W + x;
          if (!world.isWalkable(idx)) continue;
          v.vx = x + 0.5;
          v.vy = y + 0.5;
          v.serial++;
          this.debug.snaps++;
          return;
        }
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * Y4a — a building goes up where someone is standing
   * ---------------------------------------------------------------- */

  /**
   * Everyone standing on a footprint that has just gone solid walks off it
   * under their own feet (§1 — nothing teleports), keeping their task, the
   * load in their hands and the destination they were walking to: being
   * shuffled one tile is not a reason to drop a haul halfway across town.
   *
   * buildings.place() calls this AFTER the tiles are solid, so "walkable"
   * here already means walkable with the new building standing.
   */
  stepAside(x, y, w, h) {
    const world = this.world;
    if (!world || typeof world.isWalkable !== 'function') return 0;
    if (!(w > 0) || !(h > 0)) return 0;
    const taken = this._asideTaken || (this._asideTaken = []);
    taken.length = 0;
    let moved = 0;
    for (let i = 0; i < this.list.length; i++) {
      const v = this.list[i];
      if (!v || v.dead || v.removed) continue;
      const vx = v.vx | 0;
      const vy = v.vy | 0;
      if (vx < x || vy < y || vx >= x + w || vy >= y + h) {
        // Not underfoot, but the node they were cutting may be: nobody
        // harvests through a wall.
        this.forgetBuriedNode(v, x, y, w, h);
        continue;
      }
      const dest = this.asideTile(v, x, y, w, h, taken);
      if (dest >= 0) {
        taken.push(dest);
        this.beginAside(v, dest, x, y, w, h);
        moved++;
        continue;
      }
      // Nowhere within reach to walk to. A snap is a worse answer than a step
      // and a man left buried is worse than either, so this is the floor —
      // and it is the case Y4a exists to stop being a stranding.
      this.forgetBuriedNode(v, x, y, w, h);
      this.debug.asideSnaps++;
      this.snapToWalkable(v);
    }
    taken.length = 0;
    return moved;
  }

  /**
   * The tile to step onto: nearest walkable ground off the footprint that is
   * still on the same side of it as wherever this villager was headed. The
   * side matters more than the distance — the nearest tile can be the one that
   * leaves them looking at the back of the new wall.
   */
  asideTile(v, x, y, w, h, taken) {
    const world = this.world;
    const paths = this.game && this.game.paths;
    const canRegion = paths && typeof paths.sameRegion === 'function';
    const ref = this.asideRef(v);
    const cx = v.vx | 0;
    const cy = v.vy | 0;
    let best = -1;
    let bestKey = Infinity;
    for (let r = 1; r <= ASIDE_RADIUS; r++) {
      for (let ty = cy - r; ty <= cy + r; ty++) {
        for (let tx = cx - r; tx <= cx + r; tx++) {
          if (Math.abs(tx - cx) !== r && Math.abs(ty - cy) !== r) continue;
          if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) continue;
          if (tx >= x && ty >= y && tx < x + w && ty < y + h) continue;
          const idx = ty * GRID_W + tx;
          if (!world.isWalkable(idx)) continue;
          if (r > 1 && !this.asideClear(cx, cy, tx, ty, x, y, w, h)) continue;
          const dx = tx + 0.5 - v.vx;
          const dy = ty + 0.5 - v.vy;
          let key = dx * dx + dy * dy;
          if (ref >= 0 && canRegion && !paths.sameRegion(idx, ref)) key += ASIDE_OFF_SIDE;
          if (taken && taken.indexOf(idx) >= 0) key += ASIDE_CROWDED;
          if (key < bestKey) { bestKey = key; best = idx; }
        }
      }
      if (best >= 0 && bestKey < ASIDE_OFF_SIDE) break;
    }
    return best;
  }

  /** Which side of the new building this villager's day is on. */
  asideRef(v) {
    const world = this.world;
    const ok = (idx) => (idx >= 0 && idx < GRID_N && world && world.isWalkable(idx) ? idx : -1);
    let r = ok(v.target);
    if (r < 0 && v.jobId >= 0) r = ok(this.doorOf(this.getBuilding(v.jobId)));
    if (r < 0 && v.homeId >= 0) r = ok(this.doorOf(this.getBuilding(v.homeId)));
    if (r < 0) r = ok(this.startIdx);
    return r;
  }

  /**
   * A stride longer than one tile may cross the site being raised — that is
   * the ground under the villager's own feet — but never somebody else's wall.
   */
  asideClear(cx, cy, tx, ty, x, y, w, h) {
    const world = this.world;
    let px = cx;
    let py = cy;
    for (let guard = 0; guard < ASIDE_RADIUS * 2 && (px !== tx || py !== ty); guard++) {
      px += Math.sign(tx - px);
      py += Math.sign(ty - py);
      if (px >= x && py >= y && px < x + w && py < y + h) continue;
      if (!world.isWalkable(py * GRID_W + px)) return false;
    }
    return true;
  }

  beginAside(v, dest, x, y, w, h) {
    // Ordered: the buried node is dropped first, so `target` is clean before
    // the journey worth resuming is read off it.
    this.forgetBuriedNode(v, x, y, w, h);
    // The route they were on starts on a tile that is a wall now, so it is
    // dropped and asked for again on arrival. `target` itself is left alone —
    // that is what makes this a detour and not a cancelled errand.
    const resume = v.target;
    this.cancelPathRequest(v);
    this.clearPath(v);
    v.aside = dest;
    v.asideResume = resume >= 0 && resume < GRID_N ? resume : -1;
    v.asideTime = 0;
    // render.js reads `path` to decide whether a villager is walking. He is.
    const one = this._asideStep || (this._asideStep = [0]);
    one[0] = dest;
    this.setPath(v, one, 1);
    this.debug.stepAsides++;
    v.serial++;
  }

  /**
   * The stride is driven here rather than by move(), which steps tile centre
   * to tile centre and will not cross the site being raised — a man in the
   * middle of a 3x3 footprint has to. The speed is the ground's, so it is a
   * walk and it takes the time a walk takes.
   */
  moveAside(v, dt) {
    const world = this.world;
    const dest = v.aside;
    v.asideTime += dt;
    if (dest < 0 || !world || typeof world.isWalkable !== 'function'
      || !world.isWalkable(dest) || v.asideTime > ASIDE_MAX_SECONDS) {
      this.endAside(v);
      return;
    }
    const tx = toX(dest) + 0.5;
    const ty = toY(dest) + 0.5;
    const dx = tx - v.vx;
    const dy = ty - v.vy;
    const d = Math.sqrt(dx * dx + dy * dy);
    const step = this.speedOn(dest) * (0.7 + 0.3 * (v.health / 100)) * dt;
    if (!(step > 0) || d <= step || d < 1e-6) {
      v.vx = tx;
      v.vy = ty;
      v.serial++;
      this.endAside(v);
      return;
    }
    v.vx += (dx / d) * step;
    v.vy += (dy / d) * step;
    v.serial++;
  }

  /** Back on legal ground: pick the interrupted journey up where it left off. */
  endAside(v) {
    const resume = v.asideResume;
    this.clearPath(v);
    v.aside = -1;
    v.asideResume = -1;
    v.asideTime = 0;
    v.serial++;
    const world = this.world;
    if (world && typeof world.isWalkable === 'function' && !world.isWalkable(this.tileOf(v))) {
      // The tile aimed at went solid mid-stride (two placements in one tick).
      this.debug.asideSnaps++;
      this.snapToWalkable(v);
    }
    if (resume >= 0 && !v.path && !v.pathPending) this.goTo(v, resume);
  }

  /**
   * A node under the new footprint cannot be worked through a wall, so the cut
   * in progress is dropped and the worker re-targets. What is already in the
   * basket is buildings.js's and is not touched.
   */
  forgetBuriedNode(v, x, y, w, h) {
    const idx = v.nodeIdx;
    if (idx < 0) return;
    const nx = idx % GRID_W;
    const ny = (idx / GRID_W) | 0;
    if (nx < x || ny < y || nx >= x + w || ny >= y + h) return;
    v.nodeIdx = -1;
    if (v.phase === PH.HARVEST) {
      v.timer = 0;
      this.setPhase(v, PH.NONE);
      if (v.state === VS.WORK) this.setState(v, VS.IDLE);
    }
    if (v.target === idx) {
      this.cancelPathRequest(v);
      this.clearPath(v);
      v.target = -1;
    }
    v.serial++;
  }

  /* ---------------------------------------------------------------- *
   * Decision priority (§8, top-down, first match wins)
   * ---------------------------------------------------------------- */

  decide(v) {
    // military.js drives soldiers in contact; do not fight it for control.
    if (v.state === VS.FIGHT) {
      const m = this.game && this.game.military;
      const held = m && m.raidActive && typeof m.intentFor === 'function' && m.intentFor(v.id);
      if (!held) this.setState(v, VS.IDLE);
      return;
    }
    // Y4a — mid-stride off a footprint that just went solid. Hold everything
    // until they are back on legal ground, or a step function below routes
    // them from the wall they are standing on.
    if (v.aside >= 0) return;
    // Waiting on a queued path: hold state, do not re-plan, do not spin.
    if (v.pathPending) return;
    if (v.timer > 0 && v.state === VS.IDLE) return;

    if (v.state === VS.LEAVING) {
      this.stepLeaving(v);
      return;
    }

    // 2. Flee a raid.
    if (this.threatNear(v)) {
      this.stepFlee(v);
      return;
    }
    if (v.state === VS.FLEE) this.setState(v, VS.IDLE);

    // Walking in as a migrant outranks ordinary business until they land.
    if (v.arriving) {
      this.stepArriving(v);
      return;
    }

    // 3. Eat (§8.3 as amended by J2 — at home, in the evening).
    if (v.state === VS.GO_EAT) {
      this.stepEat(v);
      return;
    }
    const midHarvest = v.state === VS.WORK && v.phase === PH.HARVEST;
    if (!midHarvest && this.now >= v.eatUntil && this.wantsMeal(v) && this.tryMeal(v)) return;

    // 4. Night: home and sleep — unless mid-haul, or a soldier in a raid (§3).
    const night = this.isNight();
    if (night && !v.task && !this.isCombatant(v)) {
      this.stepGoHome(v);
      return;
    }
    if (v.state === VS.SLEEP || v.state === VS.GO_HOME) {
      this.setState(v, VS.IDLE);
      this.setPhase(v, PH.NONE);
    }

    // §16.1 — a villager who has committed to cutting by hand finishes the
    // errand. Ahead of everything below because the wood already in their
    // hands IS the errand, and a job handed out mid-trip must not strand it.
    if (v.handGather && this.stepHandGather(v)) return;

    // 5. Execute a claimed haul task.
    if (v.task) {
      this.stepTask(v);
      return;
    }

    // 6. Go to the job.
    if (v.jobId >= 0) {
      // P1/R4: a town with no storage has no porters and nobody unemployed, so
      // §9.3's queue would never be walked and the replacement store could not
      // be delivered. Lend an employed hand, for construction only — a
      // borrowed worker must not wander onto a `store` haul — and only while
      // no storage stands.
      if (!this.isCombatant(v) && this.noStorage() && this.claimTask(v, 'build')) return;
      this.stepJob(v);
      return;
    }

    // Holding goods with no task or job: get them into a storage.
    if (v.carry.qty > 0) {
      this.stepDeliverCarry(v);
      return;
    }

    // 7. Claim a haul task (economy applies the porters-first rule).
    if (this.claimTask(v)) return;

    // 8. Act as a builder on an unfinished site.
    if (this.stepBuild(v)) return;

    // §16.1 — the town has no wood and no Woodcutter, and this villager has
    // nothing else to do. Last resort by position as well as by rate.
    if (this.stepHandGather(v)) return;

    // 9. Idle wander.
    this.stepIdle(v);
  }

  /** Not one storage building standing — buildings.js caches the count. */
  noStorage() {
    const B = this.game && this.game.buildings;
    if (B && typeof B.storageCount === 'function') return B.storageCount() === 0;
    if (B && typeof B.hasStorage === 'function') return !B.hasStorage();
    return false;
  }

  isCombatant(v) {
    if (v.role !== 'soldier' && v.role !== 'militia') return false;
    const m = this.game && this.game.military;
    return !!(m && m.raidActive);
  }

  isNight() {
    const w = this.world;
    const t = w && w.clock ? w.clock.timeOfDay : 0.5;
    return t > NIGHT_START || t < NIGHT_END;
  }

  raidActive() {
    const m = this.game && this.game.military;
    return !!(m && m.raidActive);
  }

  /**
   * §9.4's season multiplier has to reach real consumption and not just the
   * HUD (G4), so economy owns the rate. The flat fallback keeps a
   * villagers-only harness alive when no economy is wired.
   */
  currentHungerRate() {
    const e = this.game && this.game.economy;
    if (e && typeof e.hungerRatePerSecond === 'function') {
      const r = e.hungerRatePerSecond();
      if (Number.isFinite(r) && r >= 0) return r;
    }
    return HUNGER_RATE;
  }

  /* ---------------------------------------------------------------- *
   * Combat hand-off (military.js drives, villagers.js walks)
   * ---------------------------------------------------------------- */

  /** military.js: "go stand on this enemy". Idempotent, called every tick. */
  orderCombat(id, x, y, enemyId) {
    const v = this.resolve(id);
    if (!v || v.dead) return;
    if (v.task) this.releaseTask(v, 'called to arms');
    this.setState(v, VS.FIGHT);
    this.setPhase(v, PH.NONE);
    v.combatEnemy = enemyId === undefined ? -1 : enemyId;
    const dx = x - v.vx;
    const dy = y - v.vy;
    if (dx * dx + dy * dy < 1.5) {
      this.clearPath(v);
      this.cancelPathRequest(v);
      return;
    }
    if (v.pathPending || v.combatRepath > 0) return;
    const tgt = toIdx(clamp(x | 0, 0, GRID_W - 1), clamp(y | 0, 0, GRID_H - 1));
    if (tgt === v.target && v.path) return;
    v.combatRepath = COMBAT_REPATH;
    this.goTo(v, tgt);
  }

  /* ---------------------------------------------------------------- *
   * Flee (§8.2)
   * ---------------------------------------------------------------- */

  threatNear(v) {
    const m = this.game && this.game.military;
    if (!m || !m.raidActive) return false;
    if (v.role === 'soldier' || v.role === 'militia') return false;
    const en = m.enemies;
    if (!en || en.length === 0) return false;
    const r2 = FLEE_RADIUS * FLEE_RADIUS;
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (!e || e.dead || e.hp <= 0) continue;
      const ex = e.x === undefined ? e.vx : e.x;
      const ey = e.y === undefined ? e.vy : e.y;
      if (ex === undefined) continue;
      const dx = ex - v.vx;
      const dy = ey - v.vy;
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  }

  stepFlee(v) {
    if (v.state === VS.FLEE && (v.path || v.pathPending)) return;
    this.setState(v, VS.FLEE);
    this.setPhase(v, PH.NONE);
    const shelter = this.nearestShelter(v);
    if (shelter < 0 || v.pathFails >= MAX_PATH_FAILS) {
      v.pathFails = 0;
      // Nowhere to run: keep moving so they are never a stationary target.
      this.wanderStep(v);
      return;
    }
    if (this.atTile(v, shelter)) {
      v.timer = 1 + this.rng.next();
      return;
    }
    this.goTo(v, shelter);
  }

  nearestShelter(v) {
    let best = -1;
    let bd = Infinity;
    const hs = this.houses;
    for (let i = 0; i < hs.length; i++) {
      const idx = this.doorOf(hs[i]);
      if (idx < 0) continue;
      const dx = toX(idx) + 0.5 - v.vx;
      const dy = toY(idx) + 0.5 - v.vy;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = idx; }
    }
    if (best < 0) best = this.townAnchor();
    return best;
  }

  /* ---------------------------------------------------------------- *
   * Arriving / leaving
   * ---------------------------------------------------------------- */

  stepArriving(v) {
    const anchor = v.arriveTarget >= 0 ? v.arriveTarget : this.townAnchor();
    if (v.arriveTimer > ARRIVE_TIMEOUT || anchor < 0 || this.atTile(v, anchor)) {
      this.finishArriving(v);
      this.setState(v, VS.IDLE);
      this.setPhase(v, PH.NONE);
      return;
    }
    if (v.path || v.pathPending) return;
    if (v.pathFails >= MAX_PATH_FAILS) {
      v.pathFails = 0;
      this.finishArriving(v);
      this.setState(v, VS.IDLE);
      return;
    }
    this.setState(v, VS.WALK);
    this.setPhase(v, PH.TO_TOWN);
    this.goTo(v, anchor);
  }

  /**
   * The migrant is in the valley — reached the centre, or gave up short of it
   * and settled where they stand. Exactly one `villager:arrived` per migrant,
   * because economy counts population off it (G6).
   */
  finishArriving(v) {
    if (!v.arriving) return;
    v.arriving = false;
    this.emit('villager:arrived', { id: v.id, x: v.vx, y: v.vy });
  }

  stepLeaving(v) {
    if (v.leaveTimer > LEAVE_TIMEOUT || v.pathFails >= MAX_PATH_FAILS) {
      this.finishLeaving(v);
      return;
    }
    const exit = this.nearestExit(v);
    if (exit < 0 || this.atTile(v, exit)) {
      this.finishLeaving(v);
      return;
    }
    if (v.path || v.pathPending) return;
    this.goTo(v, exit);
  }

  finishLeaving(v) {
    this.depositCarry(v);
    v.removed = true;
    this.clearPath(v);
    this.cancelPathRequest(v);
    this.emit('villager:left', { id: v.id, x: v.vx, y: v.vy });
  }

  /** A map pass if world exposes them, else the nearest walkable map edge. */
  nearestExit(v) {
    const w = this.world;
    const passes = w && w.passes;
    if (passes && passes.length > 0) {
      let best = -1;
      let bd = Infinity;
      for (let i = 0; i < passes.length; i++) {
        const p = passes[i];
        const idx = typeof p === 'number'
          ? p
          : (p.idx !== undefined ? p.idx : toIdx(p.x | 0, p.y | 0));
        if (!(idx >= 0 && idx < GRID_N)) continue;
        const dx = toX(idx) + 0.5 - v.vx;
        const dy = toY(idx) + 0.5 - v.vy;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = idx; }
      }
      if (best >= 0) return best;
    }
    return this.nearestEdgeTile(v);
  }

  nearestEdgeTile(v) {
    const w = this.world;
    const walk = w && typeof w.isWalkable === 'function' ? w : null;
    let best = -1;
    let bd = Infinity;
    for (let e = 0; e < 4; e++) {
      const n = e < 2 ? GRID_W : GRID_H;
      for (let i = 0; i < n; i++) {
        const x = e === 0 || e === 1 ? i : (e === 2 ? 0 : GRID_W - 1);
        const y = e === 0 ? 0 : e === 1 ? GRID_H - 1 : i;
        const idx = y * GRID_W + x;
        if (walk && !walk.isWalkable(idx)) continue;
        const dx = x + 0.5 - v.vx;
        const dy = y + 0.5 - v.vy;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = idx; }
      }
    }
    return best;
  }

  /* ---------------------------------------------------------------- *
   * Eating (§8.3 / §9.4, as amended by ADDENDUM J2)
   * ---------------------------------------------------------------- */

  /**
   * Is a meal due? In the evening — walking home, or bedded down — a modest
   * appetite is enough, because eating there is free. In working hours only
   * real danger is, so no meal can cost a villager their shift (J1).
   */
  wantsMeal(v) {
    if (v.hunger >= HUNGER_URGENT) return true;
    if (v.hunger <= HUNGER_HOME) return false;
    // A claimed haul is carried through: abandoning it for an optional meal
    // burns a TASK_TIMEOUT and leaves the goods stranded.
    if (v.task) return false;
    return this.isNight() || v.state === VS.SLEEP || v.state === VS.GO_HOME;
  }

  homeHasFood(v) {
    const home = this.getBuilding(v.homeId);
    return !!home && this.hasFood(home);
  }

  /** U2 — economy owns the queue, so it owns "a porter is on their way here". */
  feedInbound(houseId) {
    const e = this.game && this.game.economy;
    return !!(e && typeof e.feedInbound === 'function' && e.feedInbound(houseId));
  }

  /**
   * Take a meal (J2.3 — the household larder first, the §16 market walk only
   * when the larder cannot serve). Returns true once the meal is eaten or the
   * walk to it has started.
   *
   * Q1 — look before you leap. The destination is chosen *before* the haul is
   * handed back, so a meal interrupts a haul at most once per attempt and only
   * when there is somewhere to go. A villager who drops a task, finds nothing
   * and re-claims moves no food, and a town of them never eats and never
   * starves either: it just stands still.
   */
  tryMeal(v) {
    if (v.carry.qty <= 0) v.eatDeferUntil = 0;
    const home = this.getBuilding(v.homeId);
    const homeFood = !!home && this.hasFood(home);
    const door = homeFood ? this.doorOf(home) : -1;
    // At your own door the meal costs no daylight and interrupts nothing, so
    // it is taken whatever else the villager is holding.
    if (door >= 0 && (this.atTile(v, door) || this.withinOf(v, door, HOME_REACH))) {
      return this.eatAt(v, home);
    }
    // Anything further is a trip, and goods in hand are the town's: deliver
    // first. Bounded, so a villager with nowhere to put them still eats.
    if (v.carry.qty > 0) {
      if (v.eatDeferUntil === 0) v.eatDeferUntil = this.now + MEAL_CARRY_DEFER;
      if (this.now < v.eatDeferUntil) { v.eatUntil = this.now + 1; return false; }
    }
    let dest;
    if (homeFood) {
      // J2 — at night the walk home is already happening; only starving in
      // daylight justifies breaking off work for it.
      if (v.hunger < HUNGER_URGENT) return false;
      dest = home;
    } else {
      // U2 — the larder is empty but a porter is already carrying food to it:
      // wait for the free meal at the door rather than pay a cross-town walk
      // for the same food. Bounded, so a delivery that never arrives ends in
      // the walk after all.
      if (home && v.hunger < HUNGER_URGENT && v.mealWaits < MEAL_WAIT_MAX
        && this.feedInbound(home.id)) {
        v.mealWaits++;
        v.eatUntil = this.now + MEAL_WAIT_SECONDS;
        return false;
      }
      dest = this.foodSource(v);
    }
    if (!dest) { this.mealFailed(v); return false; }
    if (v.task) this.releaseTask(v, 'starving');
    this.setState(v, VS.GO_EAT);
    this.setPhase(v, PH.NONE);
    v.eatTargetId = dest.id;
    return true;
  }

  /**
   * Q1 — nothing this villager can reach. Wait twice as long as last time,
   * capped: the search returns the same nothing until the town's stock
   * changes, and a meal resets the count.
   */
  mealFailed(v) {
    if (v.eatFails < EAT_FAIL_MAX) v.eatFails++;
    const wait = Math.min(EAT_COOLDOWN * Math.pow(2, v.eatFails - 1), EAT_BACKOFF_MAX);
    v.eatUntil = this.now + wait;
  }

  stepEat(v) {
    if (v.hunger <= 0.05 || v.stateTime > EAT_MAX_SECONDS) {
      if (v.stateTime > EAT_MAX_SECONDS) this.mealFailed(v);
      this.setState(v, VS.IDLE);
      return;
    }
    let b = this.getBuilding(v.eatTargetId);
    if (!b || !this.hasFood(b)) {
      b = this.foodSource(v);
      if (!b) {
        this.mealFailed(v);
        this.setState(v, VS.IDLE);
        return;
      }
      v.eatTargetId = b.id;
      this.clearPath(v);
    }
    if (v.pathFails >= MAX_PATH_FAILS) {
      v.pathFails = 0;
      this.mealFailed(v);
      this.setState(v, VS.IDLE);
      return;
    }
    if (v.path || v.pathPending) return;
    const door = this.doorOf(b);
    if (!this.atTile(v, door)) {
      this.goTo(v, door);
      return;
    }
    this.eatAt(v, b);
    this.setState(v, VS.IDLE);
  }

  /**
   * §9.4: pick the food the town has most of, among the groups this villager
   * has eaten least recently — so variety emerges from behaviour, not a rule.
   */
  eatAt(v, b) {
    const B = this.game && this.game.buildings;
    if (!B || typeof B.take !== 'function') return false;
    const before = v.hunger;
    let guard = 0;
    while (v.hunger > 0.02 && ++guard <= 4) {
      const item = this.chooseFood(v, b);
      if (!item) break;
      const took = B.take(b, item, 1);
      if (took <= 0) break;
      const def = ITEMS[item];
      const nut = (def && def.nutrition ? def.nutrition : 0.6) * took;
      const relief = Math.min(nut, v.hunger);
      v.hunger -= relief;
      if (v.hunger < 0) v.hunger = 0;
      v.fed += this.satietyFor(nut - relief);
      const gi = def && def.group ? FOOD_GROUP_IDS.indexOf(def.group) : -1;
      if (gi >= 0) v.groupLast[gi] = this.now;
      this.debug.itemsEaten += took;
      const e = this.game.economy;
      if (e && typeof e.onVillagerAte === 'function') e.onVillagerAte(v, item, took, b);
      v.serial++;
    }
    // Q1 — a larder that turned out to be empty is a failed attempt, not a
    // meal: charge it the backoff rather than letting it retry every 2s.
    if (v.hunger >= before) { this.mealFailed(v); return false; }
    v.eatFails = 0;
    v.mealWaits = 0;
    v.eatUntil = this.now + 2;
    return true;
  }

  /**
   * Surplus nutrition becomes seconds of satiety at the *current* hunger rate,
   * so a meal is worth fewer seconds in Winter and total intake still equals
   * the nutrition actually eaten (G4).
   */
  satietyFor(nut) {
    const r = this.hungerRate;
    if (!(r > 0)) return nut * SATIETY_PER_NUTRITION;
    return nut / r;
  }

  chooseFood(v, b) {
    const inv = b.inv;
    if (!inv) return '';
    let best = '';
    let bestScore = -Infinity;
    for (let i = 0; i < FOOD_IDS.length; i++) {
      const id = FOOD_IDS[i];
      const qty = inv[id] || 0;
      if (qty <= 0) continue;
      const def = ITEMS[id];
      const gi = def && def.group ? FOOD_GROUP_IDS.indexOf(def.group) : -1;
      const since = gi >= 0 ? this.now - v.groupLast[gi] : this.now;
      // Group boredom dominates; stock breaks the tie, so the town eats down
      // what it has most of within the group it has missed longest.
      const score = Math.min(since, 600) * 2 + qty;
      if (score > bestScore) { bestScore = score; best = id; }
    }
    return best;
  }

  hasFood(b) {
    const inv = b && b.inv;
    if (!inv || b.built === false) return false;
    for (let i = 0; i < FOOD_IDS.length; i++) if ((inv[FOOD_IDS[i]] || 0) > 0) return true;
    return false;
  }

  foodSource(v) {
    for (let pass = 0; pass < 2; pass++) {
      const arr = pass === 0 ? this.markets : this.foodStores;
      let best = null;
      let bd = Infinity;
      for (let i = 0; i < arr.length; i++) {
        const b = arr[i];
        if (!this.hasFood(b)) continue;
        const d = this.dist2ToDoor(v, b);
        if (d < bd) { bd = d; best = b; }
      }
      if (best) return best;
    }
    // §16.9's floor: with nothing left that can store food, the pool and then
    // the gatherers' own baskets are what the town has to eat. Eating a basket
    // down also un-stalls the producer that filled it, so foraging can feed
    // the town while it rebuilds a Granary.
    return this.poolFoodSource() || this.bufferFoodSource(v);
  }

  /**
   * P1: goods in the refund pool are lying in the town square, so when no
   * building is left that can hold food they are the town's larder and a
   * hungry villager simply walks there. Gated on there being no food store at
   * all — the same condition economy.reachableFoodUnits() counts the pool
   * under, so both sides of the seam mean the same thing by "reachable".
   */
  poolFoodSource() {
    if (this.foodStores.length > 0) return null;
    const B = this.game && this.game.buildings;
    if (!B || typeof B.overflowNode !== 'function') return null;
    const node = B.overflowNode();
    // doorIdx < 0 means nowhere to stand: no meal, rather than a walk to a
    // tile nobody can reach.
    if (!node || node.doorIdx < 0 || !this.hasFood(node)) return null;
    return node;
  }

  /**
   * The nearest producer whose buffer holds food it grew or gathered itself.
   * Gated on there being no food store, so a working town's buffers are never
   * raided; economy owns which buffers count.
   */
  bufferFoodSource(v) {
    if (this.foodStores.length > 0) return null;
    const e = this.game && this.game.economy;
    if (!e || typeof e.emergencyLarder !== 'function') return null;
    const all = this.buildingList();
    let best = null, bd = Infinity;
    for (let i = 0; i < all.length; i++) {
      const b = all[i];
      if (!b || b.removed || b.destroyed || b.built === false) continue;
      if (!e.emergencyLarder(b)) continue;
      const d = this.dist2ToDoor(v, b);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  /* ---------------------------------------------------------------- *
   * Night (§8.4)
   * ---------------------------------------------------------------- */

  stepGoHome(v) {
    if (v.state === VS.SLEEP) return;
    const home = this.getBuilding(v.homeId);
    const anchor = home ? this.doorOf(home) : this.townAnchor();
    // Homeless villagers bed down near the town centre rather than thrashing
    // between "no house" and "walk somewhere" all night (§8, §16).
    const radius = home ? 1.6 : HOMELESS_SLEEP_RADIUS;
    if (anchor < 0 || v.pathFails >= MAX_PATH_FAILS || this.withinOf(v, anchor, radius)) {
      v.pathFails = 0;
      this.clearPath(v);
      this.setState(v, VS.SLEEP);
      this.setPhase(v, PH.NONE);
      return;
    }
    this.setState(v, VS.GO_HOME);
    if (v.path || v.pathPending) return;
    this.goTo(v, anchor);
  }

  withinOf(v, idx, r) {
    const dx = toX(idx) + 0.5 - v.vx;
    const dy = toY(idx) + 0.5 - v.vy;
    return dx * dx + dy * dy <= r * r;
  }

  /* ---------------------------------------------------------------- *
   * Haul tasks (§9.3) — economy owns the queue, this module walks it
   * ---------------------------------------------------------------- */

  claimTask(v, onlyKind) {
    const e = this.game && this.game.economy;
    if (!e || typeof e.claimTask !== 'function') return false;
    // Hands must be empty. A villager still holding goods from a previous job
    // would otherwise stack a different item onto the same carry slot, which
    // silently transmutes one good into another.
    if (v.carry.qty > 0) return false;
    const t = e.claimTask(v, onlyKind);
    if (!t) return false;
    v.task = t;
    v.taskId = t.id;
    v.serial++;
    this.setState(v, t.picked ? VS.HAUL_DROP : VS.HAUL_PICKUP);
    this.setPhase(v, PH.NONE);
    return true;
  }

  taskValid(v, t) {
    if (!t || t.cancelled === true || t.done === true) return false;
    if (t.claimedBy !== undefined && t.claimedBy !== -1 && t.claimedBy !== v.id) return false;
    if (!ITEMS[t.item]) return false;
    if (!t.picked && !this.getBuilding(t.fromId)) return false;
    if (!this.getBuilding(t.toId)) return false;
    return true;
  }

  /**
   * Hand a task back. economy.js decides whether that is a release (nothing
   * picked up yet) or a cancel (goods in hand, which it sweeps into storage).
   * `v.task` is cleared first so the re-entrant abortTask callback is a no-op.
   */
  releaseTask(v, reason) {
    const t = v.task;
    if (!t) return;
    v.task = null;
    v.taskId = -1;
    v.serial++;
    this.debug.tasksCancelled++;
    const e = this.game && this.game.economy;
    if (!e) return;
    if (!t.picked && typeof e.releaseTask === 'function') e.releaseTask(t);
    else if (typeof e.cancelTask === 'function') e.cancelTask(t, reason || 'abandoned');
  }

  /** economy.js calls this when it cancels a task out from under a villager. */
  abortTask(vid, t, reason) {
    const v = this.resolve(vid);
    if (!v) return;
    const d = this.debug.aborts;
    const key = reason || 'unknown';
    d[key] = (d[key] || 0) + 1;
    if (v.task && (!t || v.task === t || v.task.id === t.id)) {
      v.task = null;
      v.taskId = -1;
      v.serial++;
    }
    if (v.state === VS.HAUL_PICKUP || v.state === VS.HAUL_DROP) {
      this.cancelPathRequest(v);
      this.clearPath(v);
      this.setState(v, VS.IDLE);
      this.setPhase(v, PH.NONE);
    }
  }

  /** economy.js sweeps carried goods into storage on cancel/complete. */
  takeCarry(vid) {
    const v = this.resolve(vid);
    if (!v || v.carry.qty <= 0) return null;
    const out = { item: v.carry.item, qty: v.carry.qty };
    v.carry.item = '';
    v.carry.qty = 0;
    v.serial++;
    return out;
  }

  stepTask(v) {
    const t = v.task;
    if (!this.taskValid(v, t)) {
      this.releaseTask(v, 'invalid');
      this.recover(v, 'task-invalid');
      return;
    }
    if (v.state !== VS.HAUL_PICKUP && v.state !== VS.HAUL_DROP) {
      this.setState(v, t.picked ? VS.HAUL_DROP : VS.HAUL_PICKUP);
    }
    if (v.state === VS.HAUL_PICKUP) this.stepPickup(v, t);
    else this.stepDrop(v, t);
  }

  stepPickup(v, t) {
    const B = this.game.buildings;
    const from = this.getBuilding(t.fromId);
    if (!from) {
      this.releaseTask(v, 'source gone');
      this.recover(v, 'task-source-gone');
      return;
    }
    if (v.path || v.pathPending) return;
    if (v.pathFails >= MAX_PATH_FAILS) {
      v.pathFails = 0;
      this.releaseTask(v, 'unreachable');
      this.recover(v, 'task-unreachable');
      return;
    }
    const door = this.doorOf(from);
    if (!this.atTile(v, door)) {
      this.goTo(v, door);
      return;
    }
    if (v.carry.qty > 0 && v.carry.item !== t.item) {
      // Belt and braces for the transmutation bug above: never top up a stack
      // of one good with another.
      this.releaseTask(v, 'hands full');
      this.recover(v, 'carry-item-mismatch');
      return;
    }
    const room = CARRY_CAP - v.carry.qty;
    const want = Math.min(t.qty - v.carry.qty, room);
    let got = 0;
    if (want > 0 && B && typeof B.take === 'function') got = B.take(from, t.item, want) || 0;
    if (got > 0) {
      if (v.carry.qty <= 0) v.carry.item = t.item;
      v.carry.qty += got;
      v.serial++;
    }
    // economy releases the soft reservation here, and cancels (calling
    // abortTask back into us) when nothing could actually be collected.
    const e = this.game.economy;
    if (e && typeof e.onPickedUp === 'function') e.onPickedUp(t, got);
    if (!v.task) {
      this.setState(v, VS.IDLE);
      return;
    }
    if (v.carry.qty <= 0) {
      this.releaseTask(v, 'source empty');
      this.recover(v, 'task-source-empty');
      return;
    }
    this.setState(v, VS.HAUL_DROP);
  }

  stepDrop(v, t) {
    const B = this.game.buildings;
    const to = this.getBuilding(t.toId);
    if (!to) {
      // Cargo stays in hand; economy's cancel sweeps it into storage.
      this.releaseTask(v, 'destination gone');
      this.recover(v, 'task-dest-gone');
      return;
    }
    if (v.path || v.pathPending) return;
    if (v.pathFails >= MAX_PATH_FAILS) {
      v.pathFails = 0;
      this.releaseTask(v, 'unreachable');
      this.recover(v, 'task-unreachable');
      return;
    }
    const door = this.doorOf(to);
    if (!this.atTile(v, door)) {
      this.goTo(v, door);
      return;
    }
    // add() clamps and returns what fit; the residue stays in hand and economy
    // sweeps it on complete/cancel, so nothing can evaporate here.
    const item = v.carry.item;
    const accepted = B && typeof B.add === 'function' ? (B.add(to, item, v.carry.qty) || 0) : 0;
    if (accepted > 0) {
      v.carry.qty -= accepted;
      if (v.carry.qty <= 0) v.carry.item = '';
      v.serial++;
    }
    v.task = null;
    v.taskId = -1;
    const e = this.game.economy;
    if (accepted > 0) {
      this.debug.tasksCompleted++;
      if (e && typeof e.completeTask === 'function') e.completeTask(t, accepted);
      this.emit('task:completed', {
        id: t.id, villagerId: v.id, item, qty: accepted, toId: t.toId, x: v.vx, y: v.vy,
      });
    } else {
      // A full destination must not trap the porter holding the goods.
      this.debug.tasksCancelled++;
      if (e && typeof e.cancelTask === 'function') e.cancelTask(t, 'destination full');
    }
    this.setState(v, VS.IDLE);
    this.setPhase(v, PH.NONE);
  }

  /* ---------------------------------------------------------------- *
   * Carrying goods with no task
   * ---------------------------------------------------------------- */

  stepDeliverCarry(v) {
    if (v.carry.qty <= 0) {
      v.carry.item = '';
      this.setPhase(v, PH.NONE);
      return;
    }
    if (v.path || v.pathPending) return;
    if (v.pathFails >= MAX_PATH_FAILS || v.carryFails >= MAX_CARRY_FAILS) {
      v.pathFails = 0;
      v.carryFails = 0;
      this.depositCarry(v);
      this.setState(v, VS.IDLE);
      this.setPhase(v, PH.NONE);
      return;
    }
    const b = this.nearestStorageFor(v, v.carry.item);
    if (!b) {
      v.carryFails++;
      v.timer = 2 + this.rng.next() * 2;
      this.setState(v, VS.IDLE);
      return;
    }
    const door = this.doorOf(b);
    if (!this.atTile(v, door)) {
      this.setState(v, VS.HAUL_DROP);
      this.setPhase(v, PH.TO_STORAGE);
      this.goTo(v, door);
      return;
    }
    const B = this.game.buildings;
    const accepted = B && typeof B.add === 'function'
      ? (B.add(b, v.carry.item, v.carry.qty) || 0)
      : 0;
    if (accepted > 0) {
      v.carry.qty -= accepted;
      if (v.carry.qty <= 0) v.carry.item = '';
      v.carryFails = 0;
      v.serial++;
    } else {
      v.carryFails++;
    }
    this.setState(v, VS.IDLE);
    this.setPhase(v, PH.NONE);
  }

  /**
   * Last resort for goods in hand: buildings.deposit() places them in storage,
   * in any building buffer that will take them, or in the overflow pool. It
   * never destroys anything (§16.4).
   */
  depositCarry(v) {
    if (v.carry.qty <= 0) {
      v.carry.item = '';
      return 0;
    }
    const item = v.carry.item;
    const qty = v.carry.qty;
    const B = this.game && this.game.buildings;
    v.carry.item = '';
    v.carry.qty = 0;
    v.serial++;
    this.debug.deposited += qty;
    if (B && typeof B.deposit === 'function') return B.deposit(item, qty, v.vx, v.vy);
    // No buildings module (unit tests): park it rather than lose it.
    this.orphans = this.orphans || Object.create(null);
    this.orphans[item] = (this.orphans[item] || 0) + qty;
    return 0;
  }

  /* ---------------------------------------------------------------- *
   * Jobs (§8.6)
   * ---------------------------------------------------------------- */

  stepJob(v) {
    const b = this.getBuilding(v.jobId);
    const d = b ? this.defOf(b) : null;
    if (!b || !d || b.built === false || b.active === false) {
      this.loseJob(v);
      this.recover(v, 'job-gone');
      return;
    }
    // Cargo with no task belongs in a store, whatever this villager does for a
    // living. `claimTask` refuses a full pair of hands, so a worker left
    // holding an aborted haul is otherwise frozen out of the queue for good —
    // and only the jobless reach the delivery step in `think`.
    if (v.carry.qty > 0) {
      this.stepDeliverCarry(v);
      return;
    }
    // Porters are employed *by* a storage but their work is the haul queue.
    if (v.role === 'porter') {
      if (this.claimTask(v)) return;
      this.standAt(v, this.doorOf(b));
      return;
    }
    // Builders raise sites; the hut is only where they are counted.
    if (v.role === 'builder') {
      if (this.stepBuild(v)) return;
      this.standAt(v, this.doorOf(b));
      return;
    }
    // §10.1/H6: military.intentFor() is null outside a raid, so the peacetime
    // patrol is ordinary villager behaviour. Sortieing garrisons only — tower
    // archers hold their post (H5).
    if (v.role === 'soldier' && (d.garrison || 0) > 0 && !d.attack && !this.raidActive()) {
      this.stepPatrol(v, b);
      return;
    }
    // G2.3: a worker whose own workplace is idle may finish a site that has
    // its materials and no builder, so a town can never be unable to complete
    // a building it has already paid for.
    if (this.workplaceIdle(b) && this.stepBuild(v, true)) return;
    v.siteId = -1;
    if (d.gathers) {
      this.stepGather(v, b, d);
      return;
    }
    // W2 — a farm or a workshop stalled on a full buffer is the same defect as
    // a stalled hut: its worker runs a load in rather than standing at the
    // door while the chain it feeds goes short.
    if (b.idleReason === 'output full' && this.claimOwnOutput(v, b)) return;
    if (this.stalledHaul(v, b)) return;
    this.standAt(v, this.doorOf(b));
  }

  /** A workplace with nothing for its workers to do right now (§7.3). */
  workplaceIdle(b) {
    if (!b || b.built === false) return false;
    return typeof b.idleReason === 'string' && b.idleReason !== '';
  }

  /**
   * A built building with a live repair. Repairs are builder work on something
   * that is already standing, so every `!b.built` test in the builder search
   * needs this as its second half.
   */
  isRepairing(b) {
    if (!b || !b.built) return false;
    const B = this.game && this.game.buildings;
    if (B && typeof B.isRepairing === 'function') return !!B.isRepairing(b.id);
    return !!b.repair;
  }

  /**
   * Has everything a builder needs to start arrived? `deliveredComplete` for a
   * site, `repairSupplied` for a repair — §7.3 either way.
   */
  materialsIn(b) {
    const B = this.game && this.game.buildings;
    if (!B) return true;
    if (this.isRepairing(b)) {
      return typeof B.repairSupplied === 'function' ? !!B.repairSupplied(b) : true;
    }
    return typeof B.deliveredComplete === 'function' ? !!B.deliveredComplete(b) : true;
  }

  /**
   * G2.3 entry test for a worker whose own workplace is idle, over sites and
   * repairs alike. A repair has no stall wait of its own: buildings.js already
   * advances an untended one, and that fallback exists to cover the case where
   * nobody can come — so anyone with nothing to do should get there first.
   */
  needsAnyBuilder(b) {
    if (this.isRepairing(b)) {
      const B = this.game && this.game.buildings;
      if (B && typeof B.repairNeedsBuilder === 'function') return !!B.repairNeedsBuilder(b);
      return this.materialsIn(b);
    }
    return this.siteNeedsAnyBuilder(b);
  }

  /**
   * G2.3: a site with every material delivered that no builder has touched for
   * SITE_STALL_SECONDS. buildings.js owns the predicate when it publishes one;
   * the fallback times it off this module's own applyBuilder calls, which are
   * the only ones in the game.
   */
  siteNeedsAnyBuilder(b) {
    if (!b || b.built || b.active === false) return false;
    const B = this.game && this.game.buildings;
    if (B && typeof B.siteNeedsAnyBuilder === 'function') return !!B.siteNeedsAnyBuilder(b);
    if (B && typeof B.deliveredComplete === 'function' && !B.deliveredComplete(b)) return false;
    let last = this.siteWork.get(b.id);
    if (last === undefined) {
      // First sighting starts the clock, so a fresh site is never instantly stalled.
      last = this.now;
      this.siteWork.set(b.id, last);
    }
    return this.now - last >= SITE_STALL_SECONDS;
  }

  standAt(v, idx) {
    v.patrolTo = -1;
    if (idx < 0) {
      this.stepIdle(v);
      return;
    }
    if (v.path || v.pathPending) return;
    if (v.pathFails >= MAX_PATH_FAILS) {
      v.pathFails = 0;
      this.recover(v, 'job-unreachable');
      return;
    }
    if (this.atTile(v, idx)) {
      this.setState(v, VS.WORK);
      this.setPhase(v, PH.AT_JOB);
      return;
    }
    this.setState(v, VS.WALK);
    this.setPhase(v, PH.TO_JOB);
    this.goTo(v, idx);
  }

  /* ---- Gatherers (§7.2): out to a node, work it, back to the door ---- */

  stepGather(v, b, d) {
    if (v.path || v.pathPending) return;
    if (v.phase === PH.HARVEST) return;

    if (v.phase === PH.TO_DOOR) {
      const door = this.doorOf(b);
      if (!this.atTile(v, door)) {
        if (v.pathFails >= MAX_PATH_FAILS) {
          v.pathFails = 0;
          v.nodeIdx = -1;
          this.recover(v, 'gather-return-blocked');
          return;
        }
        this.setState(v, VS.WALK);
        this.setPhase(v, PH.TO_DOOR);
        this.goTo(v, door);
        return;
      }
      // buildings.js owns the harvest, the Winter halving, the byproduct roll
      // and the inventory write — this only reports that the worker is back.
      const B = this.game.buildings;
      if (B && typeof B.gatherComplete === 'function') B.gatherComplete(b, v.id);
      v.nodeIdx = -1;
      this.setPhase(v, PH.NONE);
      v.serial++;
    }

    if (v.nodeIdx < 0) {
      // W2 — the hut's own worker is its porter of first resort. A buffer over
      // the trigger means the town's food is sitting here rather than in a
      // larder, and the worker is standing on it; running it in costs them the
      // walk they were about to spend on a node.
      if (this.claimOwnOutput(v, b)) return;
      // A load that would not fit stays in the worker's basket (buildings.js
      // never destroys it), and `basketRoom` is then zero for ever: this worker
      // can never be sent out again until they report at the door. Only the
      // TO_DOOR arrival drains a basket, so send them back through it the
      // moment the hut has room.
      if (!this.outputBlocked(b, d) && this.basketHeld(b, v.id) > 0) {
        this.setPhase(v, PH.TO_DOOR);
        return;
      }
      // A hut with nowhere to put the load has nothing to send anyone out for.
      // Without this the worker walks the whole round trip and harvests into a
      // full buffer: the node keeps its units, the day is spent anyway.
      if (this.outputBlocked(b, d)) {
        if (this.stalledHaul(v, b)) return;
        this.standAt(v, this.doorOf(b));
        return;
      }
      if (this.now < v.nodeFailUntil) {
        if (this.stalledHaul(v, b)) return;
        this.standAt(v, this.doorOf(b));
        return;
      }
      v.nodeIdx = this.gatherTarget(b);
      if (v.nodeIdx >= 0 && !this.reachable(v, v.nodeIdx)) v.nodeIdx = -1;
      if (v.nodeIdx < 0) {
        // buildings.js reports 'resource exhausted'; the worker waits at the hut.
        v.nodeFailUntil = this.now + NODE_FAIL_COOLDOWN;
        if (this.stalledHaul(v, b)) return;
        this.standAt(v, this.doorOf(b));
        return;
      }
    }
    if (!this.atTile(v, v.nodeIdx)) {
      if (v.pathFails >= MAX_PATH_FAILS) {
        v.pathFails = 0;
        v.nodeIdx = -1;
        v.nodeFailUntil = this.now + NODE_FAIL_COOLDOWN;
        this.recover(v, 'node-unreachable');
        return;
      }
      this.setState(v, VS.WALK);
      this.setPhase(v, PH.TO_NODE);
      // paths.js switches to adjacency mode automatically for an unwalkable
      // target, which is what lets a fisherman work a shore tile.
      this.goTo(v, v.nodeIdx);
      return;
    }
    this.setState(v, VS.WORK);
    this.setPhase(v, PH.HARVEST);
    v.timer = (d.gathers && d.gathers.time) || 4;
    v.serial++;
  }

  /**
   * Cheap "is this even possible" test before spending an A* call (§6). Only
   * meaningful for a walkable target — paths.js reaches an unwalkable one
   * (a shore tile) through adjacency, and two unwalkable tiles both answer
   * region -1, which would compare as connected (ADDENDUM E4).
   */
  reachable(v, idx) {
    const paths = this.game && this.game.paths;
    const w = this.world;
    if (!paths || typeof paths.sameRegion !== 'function') return true;
    if (!w || typeof w.isWalkable !== 'function' || !w.isWalkable(idx)) return true;
    const from = this.tileOf(v);
    if (from < 0) return true;
    return paths.sameRegion(from, idx);
  }

  /**
   * Can this villager walk to that building's door? Standing off the walkable
   * grid answers yes: E4's two unwalkable tiles both read region -1 and would
   * compare as connected, so an unknown region must never cost anyone a job.
   */
  canWorkAt(v, b) {
    const w = this.world;
    const from = this.tileOf(v);
    if (from < 0 || !w || typeof w.isWalkable !== 'function' || !w.isWalkable(from)) return true;
    const door = this.doorOf(b);
    if (!(door >= 0)) return true;
    return this.reachable(v, door) !== false;
  }

  /** Units still in this worker's basket. buildings.js owns the bag. */
  basketHeld(b, workerId) {
    const bag = b && b.gatherHeld && b.gatherHeld[workerId];
    if (!bag) return 0;
    let n = 0;
    for (const k in bag) n += bag[k] > 0 ? bag[k] : 0;
    return n;
  }

  /**
   * W2 — take a `store` haul out of the building this villager works in.
   * economy.js owns the queue and every §9.3 rule that governs the task; this
   * only asks, and only when the worker's hands are free.
   */
  claimOwnOutput(v, b) {
    const e = this.game && this.game.economy;
    if (!e || typeof e.claimOwnOutput !== 'function') return false;
    if (v.carry.qty > 0 || v.task) return false;
    const t = e.claimOwnOutput(v, b);
    if (!t) return false;
    v.task = t;
    v.taskId = t.id;
    v.nodeIdx = -1;
    v.serial++;
    this.setState(v, VS.HAUL_PICKUP);
    this.setPhase(v, PH.NONE);
    return true;
  }

  /**
   * A worker whose workplace is stalled on something standing at the door will
   * not fix joins the haul queue. Only porters and the jobless ever reach
   * `claimTask`, so a quarter of every goods worker's day was idle labour the
   * queue could not see — while the stall itself is a haulage problem: the
   * shelf is full because nothing carried the last load to a site, and the
   * hopper is empty because nothing carried wood in. Running one load is what
   * clears the block, so this closes the loop instead of waiting out.
   * `PORTER_GRACE` still gives the storage crews first refusal.
   */
  stalledHaul(v, b) {
    const r = b && b.idleReason;
    if (typeof r !== 'string' || r === '') return false;
    if (!STALL_HAUL.has(r) && r.lastIndexOf('no materials:', 0) !== 0) return false;
    return this.claimTask(v);
  }

  /** True when neither of a gatherer's outputs can be added to its hut. */
  outputBlocked(b, d) {
    const B = this.game && this.game.buildings;
    const g = d && d.gathers;
    if (!B || !g || typeof B.capacityFor !== 'function') return false;
    if (B.capacityFor(b, g.item) > 0) return false;
    if (g.alt && g.alt.item && B.capacityFor(b, g.alt.item) > 0) return false;
    return true;
  }

  /* ---- §16.1 gather by hand: the floor under the whole economy ---- */

  /**
   * "Wood is never unobtainable." economy.handGatherAllowed() owns the
   * condition — no wood anywhere and no Woodcutter standing; this is what an
   * idle villager does about it. Walk to a standing tree, cut 1 wood per
   * HAND_GATHER_SECONDS up to a small load, carry it into a store.
   *
   * Returns true when it has taken this villager's turn. `v.handGather`
   * latches for the length of one errand so a load in hand is always carried
   * home, and is re-tested against the town's stock before each new one — the
   * fallback has to close itself the moment the town can cut wood properly.
   */
  stepHandGather(v) {
    // Someone else's cargo is not part of this errand.
    if (v.carry.qty > 0 && v.carry.item !== 'wood') { v.handGather = false; return false; }
    if (v.handGather && v.state === VS.WORK && v.phase === PH.HARVEST) return true;
    // A villager with a workplace only ever finishes a load already in hand;
    // cutting by hand must not pull a forager off the town's food.
    if (v.carry.qty <= 0 && (v.jobId >= 0 || !this.handGatherAllowed())) {
      v.handGather = false;
      return false;
    }
    v.handGather = true;

    // The load is only real once a store has it, so hand it to the ordinary
    // carry-delivery walk rather than writing a second copy of one.
    if (v.carry.qty >= HAND_GATHER_LOAD) {
      this.stepDeliverCarry(v);
      if (v.carry.qty <= 0) { v.handGather = false; v.nodeIdx = -1; }
      return true;
    }

    if (v.nodeIdx < 0 || !this.isStandingTimber(v.nodeIdx)) v.nodeIdx = this.findTimber(v);
    if (v.nodeIdx < 0) {
      // No tree this villager can reach. Bring home whatever was cut.
      v.handGather = false;
      if (v.carry.qty > 0) { this.stepDeliverCarry(v); return true; }
      return false;
    }
    if (v.path || v.pathPending) return true;
    if (v.pathFails >= MAX_PATH_FAILS) {
      v.pathFails = 0;
      v.nodeIdx = -1;
      v.handGather = false;
      this.recover(v, 'handgather-unreachable');
      return true;
    }
    if (!this.atTile(v, v.nodeIdx)) {
      this.setState(v, VS.WALK);
      this.setPhase(v, PH.TO_NODE);
      this.goTo(v, v.nodeIdx);
      return true;
    }
    this.setState(v, VS.WORK);
    this.setPhase(v, PH.HARVEST);
    v.timer = HAND_GATHER_SECONDS;
    v.serial++;
    return true;
  }

  /** §16.1's condition; economy.js owns it, this module only asks. */
  handGatherAllowed() {
    const e = this.game && this.game.economy;
    if (!e || typeof e.handGatherAllowed !== 'function') return false;
    return e.handGatherAllowed() === true;
  }

  /**
   * One hand-cut load. buildings.js takes the timber out of the ground and
   * books it as production, so the item ledger never sees wood from nowhere;
   * the villager carries only what came back.
   */
  handGatherCut(v) {
    const B = this.game && this.game.buildings;
    const got = B && typeof B.handGather === 'function'
      ? (B.handGather(v.nodeIdx, 1, v.vx, v.vy) || 0)
      : 0;
    if (got > 0) {
      v.carry.item = 'wood';
      v.carry.qty += got;
      this.debug.handGathered += got;
    }
    if (got <= 0 || !this.isStandingTimber(v.nodeIdx)) v.nodeIdx = -1;
    this.setState(v, VS.IDLE);
    this.setPhase(v, PH.NONE);
  }

  isStandingTimber(idx) {
    const w = this.world;
    if (!w || !w.resource || !w.amount || idx < 0 || idx >= GRID_N) return false;
    return w.resource[idx] === RESOURCE.TREE && w.amount[idx] > 0;
  }

  /**
   * The nearest standing tree this villager can actually walk to. A plain
   * nearest-node query will not do: one unreachable tree across the river
   * would end the fallback §16.1 exists to guarantee.
   */
  findTimber(v) {
    const x0 = clamp(v.vx | 0, 0, GRID_W - 1);
    const y0 = clamp(v.vy | 0, 0, GRID_H - 1);
    for (let r = 0; r <= HAND_GATHER_RADIUS; r++) {
      for (let dy = -r; dy <= r; dy++) {
        const ay = y0 + dy;
        if (ay < 0 || ay >= GRID_H) continue;
        // Only the ring at radius r: its top and bottom rows are solid, the
        // rows between contribute their two ends.
        const step = (dy === -r || dy === r) ? 1 : (r * 2 || 1);
        for (let dx = -r; dx <= r; dx += step) {
          const ax = x0 + dx;
          if (ax < 0 || ax >= GRID_W) continue;
          const idx = ay * GRID_W + ax;
          if (!this.isStandingTimber(idx)) continue;
          if (!this.reachable(v, idx)) continue;
          return idx;
        }
      }
    }
    return -1;
  }

  gatherTarget(b) {
    const B = this.game && this.game.buildings;
    if (B && typeof B.gatherTargetFor === 'function') {
      const idx = B.gatherTargetFor(b);
      if (idx >= 0) return idx;
      return -1;
    }
    return b.targetIdx === undefined ? -1 : b.targetIdx;
  }

  /* ---------------------------------------------------------------- *
   * Building (§8.8) — buildings.applyBuilder owns progress and completion
   * ---------------------------------------------------------------- */

  /** `stalledOnly` narrows the search to sites eligible under G2.3. */
  stepBuild(v, stalledOnly) {
    const sites = this.sites;
    if (sites.length === 0) return false;
    let best = null;
    let bd = Infinity;
    for (let i = 0; i < sites.length; i++) {
      const b = sites[i];
      const repair = this.isRepairing(b);
      if (b.built && !repair) continue;
      // A repair outlives a pause: stopping a workshop stops its production,
      // not the timber the player already committed to putting back in its roof.
      if (!repair && b.active === false) continue;
      if (stalledOnly) {
        // The stall test is an entry condition — it goes false the instant
        // this villager starts work — so a site already committed to stays
        // eligible until it is finished.
        if (b.id !== v.siteId && !this.needsAnyBuilder(b)) continue;
        if (b.id === v.siteId && !this.materialsIn(b)) continue;
      } else if (!this.materialsIn(b)) {
        // A site whose materials have not landed cannot be worked (§7.3), so
        // walking to it would just park a builder beside a hole in the ground.
        continue;
      }
      // Cheap region test before an A* call (§6): sites are dropped anywhere
      // on the map, and most of the unreachable ones can be skipped for free.
      const door = this.doorOf(b);
      if (door < 0 || !this.reachable(v, door)) continue;
      const d = this.dist2ToDoor(v, b);
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) return false;
    const door = this.doorOf(best);
    if (door < 0) return false;
    v.siteId = best.id;
    if (v.path || v.pathPending) return true;
    if (v.pathFails >= MAX_PATH_FAILS) {
      v.pathFails = 0;
      v.siteId = -1;
      this.recover(v, 'site-unreachable');
      return true;
    }
    if (this.atTile(v, door)) {
      this.setState(v, VS.WORK);
      this.setPhase(v, PH.BUILD);
      return true;
    }
    this.setState(v, VS.WALK);
    this.setPhase(v, PH.TO_SITE);
    this.goTo(v, door);
    return true;
  }

  /* ---------------------------------------------------------------- *
   * Peacetime patrol (§10.1, H6)
   * ---------------------------------------------------------------- */

  /**
   * Walks a soldier between the garrison door and the nearest gate. Single
   * tile steps only, never paths.js: garrisons are large and this is pure
   * flavour, so it must cost nothing from the A* budget that real work needs.
   * A raid ends it on the next decide, and military.orderCombat() ends it
   * immediately by taking the agent into VS.FIGHT.
   */
  stepPatrol(v, b) {
    if (v.path || v.pathPending) return;
    const door = this.doorOf(b);
    if (door < 0 || this.now < v.patrolUntil) {
      this.standAt(v, door);
      return;
    }
    let far = this.nearestGateTo(door);
    if (far < 0) far = this.townAnchor();
    if (far < 0 || far === door) {
      this.standAt(v, door);
      return;
    }
    if (v.patrolTo !== door && v.patrolTo !== far) {
      v.patrolTo = far;
      v.patrolMiss = 0;
    }
    if (v.timer > 0) return;

    const dx = toX(v.patrolTo) + 0.5 - v.vx;
    const dy = toY(v.patrolTo) + 0.5 - v.vy;
    if (dx * dx + dy * dy <= PATROL_ARRIVE * PATROL_ARRIVE) {
      v.patrolTo = v.patrolTo === far ? door : far;
      v.patrolMiss = 0;
      // Standing at the end of a leg is honestly idle, and the state change
      // keeps STATE_MAX from firing on a patrol that never leaves VS.WALK.
      this.setState(v, VS.IDLE);
      this.setPhase(v, PH.NONE);
      v.timer = PATROL_PAUSE + this.rng.next() * PATROL_PAUSE;
      return;
    }
    this.setState(v, VS.WALK);
    this.setPhase(v, PH.NONE);
    if (this.patrolStep(v, v.patrolTo)) {
      v.patrolMiss = 0;
      return;
    }
    // Boxed in by a wall the greedy step cannot round. Turn back, and after a
    // few tries give up for a while rather than buy a path for a stroll.
    v.patrolTo = v.patrolTo === far ? door : far;
    if (++v.patrolMiss >= PATROL_MISS_LIMIT) {
      v.patrolMiss = 0;
      v.patrolUntil = this.now + PATROL_GIVEUP;
      this.standAt(v, door);
    }
  }

  /**
   * One greedy tile step towards `idx`. Every step strictly shortens the
   * remaining distance, so a patrol leg always terminates.
   */
  patrolStep(v, idx) {
    const w = this.world;
    if (!w) return false;
    const tx = toX(idx);
    const ty = toY(idx);
    const x = v.vx | 0;
    const y = v.vy | 0;
    let best = -1;
    let bd = (x - tx) * (x - tx) + (y - ty) * (y - ty);
    const start = this.rng.int(8);
    for (let k = 0; k < 8; k++) {
      const i = (start + k) & 7;
      const nx = x + DIR_DX[i];
      const ny = y + DIR_DY[i];
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
      const ni = ny * GRID_W + nx;
      if (typeof w.isWalkable === 'function' && !w.isWalkable(ni)) continue;
      const d = (nx - tx) * (nx - tx) + (ny - ty) * (ny - ty);
      if (d < bd) { bd = d; best = ni; }
    }
    if (best < 0) return false;
    this.singleStep(v, best);
    return true;
  }

  /** Gates are 1x1 and walkable, so the footprint tile is the patrol mark. */
  nearestGateTo(idx) {
    const gates = this.gates;
    if (idx < 0 || gates.length === 0) return -1;
    const x = toX(idx);
    const y = toY(idx);
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < gates.length; i++) {
      const g = gates[i];
      const dx = g.x - x;
      const dy = g.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = toIdx(clamp(g.x | 0, 0, GRID_W - 1), clamp(g.y | 0, 0, GRID_H - 1));
      }
    }
    return best;
  }

  /** How many of a building's workers are actually at their post right now. */
  workersPresent(b) {
    if (!b || !b.workers) return 0;
    let n = 0;
    for (let i = 0; i < b.workers.length; i++) {
      const v = this.index.get(b.workers[i]);
      if (!v || v.dead) continue;
      if (v.state === VS.WORK && (v.phase === PH.AT_JOB || v.phase === PH.HARVEST)) n++;
    }
    return n;
  }

  /* ---------------------------------------------------------------- *
   * Idle (§8.9)
   * ---------------------------------------------------------------- */

  stepIdle(v) {
    this.setState(v, VS.IDLE);
    this.setPhase(v, PH.NONE);
    if (v.path || v.pathPending) return;
    if (v.timer > 0) return;
    this.wanderStep(v);
    v.timer = 1 + this.rng.next() * 2.5;
  }

  /**
   * One step to an adjacent tile. Deliberately does NOT call paths.js: 220
   * idlers must never eat the A* budget that real work needs.
   */
  wanderStep(v) {
    const w = this.world;
    if (!w) return;
    const home = this.getBuilding(v.homeId);
    const anchorIdx = home ? this.doorOf(home) : this.townAnchor();
    const ax = anchorIdx >= 0 ? toX(anchorIdx) + 0.5 : v.vx;
    const ay = anchorIdx >= 0 ? toY(anchorIdx) + 0.5 : v.vy;
    const x = v.vx | 0;
    const y = v.vy | 0;
    const start = this.rng.int(8);
    let fallback = -1;
    for (let k = 0; k < 8; k++) {
      const i = (start + k) & 7;
      const nx = x + DIR_DX[i];
      const ny = y + DIR_DY[i];
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
      const idx = ny * GRID_W + nx;
      if (typeof w.isWalkable === 'function' && !w.isWalkable(idx)) continue;
      if (fallback < 0) fallback = idx;
      const dx = nx + 0.5 - ax;
      const dy = ny + 0.5 - ay;
      if (dx * dx + dy * dy > WANDER_RADIUS * WANDER_RADIUS) continue;
      this.singleStep(v, idx);
      return;
    }
    if (fallback >= 0) this.singleStep(v, fallback);
  }

  singleStep(v, idx) {
    if (!v.stepBuf) v.stepBuf = new Int32Array(1);
    v.stepBuf[0] = idx;
    v.path = v.stepBuf;
    v.pathLen = 1;
    v.pathStep = 0;
    v.target = idx;
    v.serial++;
  }

  /* ---------------------------------------------------------------- *
   * Job assignment (§8)
   * ---------------------------------------------------------------- */

  /**
   * Fills worker slots by building priority, then shortest walk from home.
   * Already-employed villagers are never reshuffled unless their building went
   * away, its priority dropped, or (M4) the town is starving and the job is
   * one a starving town can do without. A homeless villager is employable.
   */
  assignJobs() {
    this.reindex();
    const B = this.game && this.game.buildings;
    const all = this.buildingList();
    const list = this.list;

    // 1. Drop employment that no longer exists.
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v.dead || v.removed || v.jobId < 0) continue;
      const b = this.getBuilding(v.jobId);
      const d = b ? this.defOf(b) : null;
      if (!b || !d || !d.jobs || b.built === false) { this.loseJob(v); continue; }
      // A villager sealed into a pocket of the map holds the slot for ever
      // while never reaching the door, so the building reads as staffed and
      // does nothing. The slot goes back to someone who can walk to it.
      if (!this.canWorkAt(v, b)) this.loseJob(v);
    }

    // 2. Free the workers of any building whose priority the player dropped.
    for (let i = 0; i < all.length; i++) {
      const b = all[i];
      if (!b || b.built === false) continue;
      const prio = b.priority === undefined ? 1 : b.priority;
      const was = this.priorityMemo.get(b.id);
      if (was !== undefined && prio < was) {
        for (let k = 0; k < list.length; k++) if (list[k].jobId === b.id) this.loseJob(list[k]);
      }
      this.priorityMemo.set(b.id, prio);
    }

    // 3. Collect openings, highest priority first. A building with no door
    //    (M3) is not an opening at all — nobody could reach it to work.
    const starving = this.foodShort();
    const alarm = this.raidWarned();
    const openings = [];
    for (let i = 0; i < all.length; i++) {
      const b = all[i];
      if (!b || b.built === false || b.active === false) continue;
      const d = this.defOf(b);
      if (!d || !d.jobs || d.instance === false) continue;
      if (!this.hasDoor(b)) continue;
      if (this.openJobs(b) <= 0) continue;
      openings.push(b);
    }
    if (openings.length === 0) return;
    openings.sort((a, c) => {
      const pa = a.priority === undefined ? 1 : a.priority;
      const pc = c.priority === undefined ? 1 : c.priority;
      // The player's own priority still wins: M4 and Q3 only reorder the default.
      if (pa !== pc) return pc - pa;
      if (starving || alarm) {
        const ra = slotRank(this.defOf(a), starving, alarm);
        const rc = slotRank(this.defOf(c), starving, alarm);
        if (ra !== rc) return ra - rc;
      }
      return a.id - c.id;
    });

    // 3b. A starving town with nobody spare takes the workers it needs off the
    //     jobs it can survive without, so the fill below has a pool to draw on.
    //     Q3 does the same for the garrison: at the first raid a town runs six
    //     people against twenty slots, so a Barracks that only outranks the
    //     others in the sort gets nobody, and the town is ravaged anyway.
    if (starving) this.draftForFood(openings);
    if (alarm) this.draftForGarrison(openings, starving);

    // 4. Fill each opening with the nearest unemployed adult.
    for (let i = 0; i < openings.length; i++) {
      const b = openings[i];
      const d = this.defOf(b);
      const door = this.doorOf(b);
      let guard = 0;
      while (this.openJobs(b) > 0 && ++guard <= 64) {
        let best = null;
        let bd = Infinity;
        for (let k = 0; k < list.length; k++) {
          const v = list[k];
          if (v.dead || v.removed || v.jobId >= 0 || v.conscript) continue;
          if (v.state === VS.LEAVING || v.leaving) continue;
          if (v.age < ADULT_AGE) continue;
          if (!this.canWorkAt(v, b)) continue;
          const d2 = this.homeDist2(v, door);
          if (d2 < bd) { bd = d2; best = v; }
        }
        if (!best) break;
        if (B && typeof B.assignWorker === 'function') {
          if (!B.assignWorker(b, best.id)) break;
        } else {
          if (!b.workers) b.workers = [];
          if (b.workers.indexOf(best.id) < 0) b.workers.push(best.id);
        }
        best.jobId = b.id;
        best.role = d.role || 'idler';
        best.nodeIdx = -1;
        best.nodeFailUntil = 0;
        best.siteId = -1;
        this.setPhase(best, PH.NONE);
        if (best.state === VS.IDLE) this.setState(best, VS.WALK);
        best.serial++;
      }
    }
  }

  /** §9 — is the town inside M4's starving band? Infinite when nobody eats. */
  foodShort() {
    const e = this.game && this.game.economy;
    if (!e || typeof e.daysOfFood !== 'function') return false;
    return e.daysOfFood() < FOOD_PANIC_DAYS;
  }

  /**
   * Q3 — is the raid close enough to man the walls for? `military.warning`
   * opens two days out (three with a Watchtower), which is exactly the window
   * the frozen rule asks the garrison to use.
   */
  raidWarned() {
    const m = this.game && this.game.military;
    return !!(m && (m.raidActive || m.warning));
  }

  /** M3 — a building nobody can reach the door of is not a workplace. */
  hasDoor(b) {
    const B = this.game && this.game.buildings;
    if (B && typeof B.hasDoor === 'function') return B.hasDoor(b);
    const d = this.defOf(b);
    if (d && (d.wall || d.gate)) return true;
    return b.doorIdx === undefined || b.doorIdx >= 0;
  }

  /**
   * M4 — free enough workers to man the open food jobs in `openings`, taking
   * them only from the jobs the frozen rule ranks below food: civic posts
   * first, then porters, then the garrison. Two floors, because each of these
   * is its own way to die: porters are what carries the food from the huts to
   * the granary and on to the larders, and a town with no garrison at all is
   * §10.6's soft-lock. Builders are exempt — they are how the next food hut
   * gets finished — as is anything the player raised above default priority.
   */
  draftForFood(openings) {
    let need = 0;
    for (let i = 0; i < openings.length; i++) {
      if (foodJobRank(this.defOf(openings[i])) < 2) need += this.openJobs(openings[i]);
    }
    if (need <= 0) return;

    const list = this.list;
    for (let i = 0; i < list.length && need > 0; i++) {
      const v = list[i];
      if (v.dead || v.removed || v.conscript || v.leaving) continue;
      if (v.jobId < 0 && v.age >= ADULT_AGE && v.state !== VS.LEAVING) need--;
    }
    if (need <= 0) return;

    const raid = this.raidWarned();
    const cands = [];
    let porters = 0;
    let soldiers = 0;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v.dead || v.removed || v.conscript || v.leaving || v.jobId < 0) continue;
      if (v.state === VS.LEAVING) continue;
      const b = this.getBuilding(v.jobId);
      const d = b ? this.defOf(b) : null;
      if (!b || !d) continue;
      if ((b.priority === undefined ? 1 : b.priority) > 1) continue;
      if (foodJobRank(d) !== 2) continue;
      if (d.role === 'builder') continue;
      let tier;
      if (d.role === 'soldier') { if (raid) continue; soldiers++; tier = 2; }
      else if (d.role === 'porter') { porters++; tier = 1; }
      else tier = 0;
      cands.push({ v: v, tier: tier });
    }
    cands.sort((a, c) => (a.tier - c.tier) || (a.v.id - c.v.id));

    let porterBudget = porters - PORTER_FLOOR;
    let soldierBudget = soldiers - Math.ceil(soldiers * GARRISON_KEEP);
    for (let i = 0; i < cands.length && need > 0; i++) {
      const tier = cands[i].tier;
      if (tier === 1) {
        if (porterBudget <= 0) continue;
        porterBudget--;
      } else if (tier === 2) {
        if (soldierBudget <= 0) continue;
        soldierBudget--;
      }
      this.loseJob(cands[i].v);
      need--;
    }
  }

  /**
   * Q3 — man the open garrison slots when a raid is warned. Villagers are
   * moved straight into the post rather than freed, because the fill below
   * takes food openings first and would hand them back.
   *
   * Order is the frozen one: idle hands (left to the fill, which gives food
   * its pick of them), then civic and storage posts, then the huts that make
   * something other than food. Food workers are never taken — the garrison
   * ranks below food — and neither are builders, who are how the Barracks
   * itself gets finished.
   */
  draftForGarrison(openings, starving) {
    let need = 0;
    let ahead = 0;
    for (let i = 0; i < openings.length; i++) {
      const d = this.defOf(openings[i]);
      if (isGarrison(d)) need += this.openJobs(openings[i]);
      // Food outranks the garrison, so its open slots take the idle hands
      // first: only what is left over counts against `need`.
      else if (slotRank(d, starving, true) < 1) ahead += this.openJobs(openings[i]);
    }
    if (need <= 0) return;

    const list = this.list;
    let spare = 0;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v.dead || v.removed || v.conscript || v.leaving) continue;
      if (v.jobId < 0 && v.age >= ADULT_AGE && v.state !== VS.LEAVING) spare++;
    }
    need -= Math.max(0, spare - ahead);
    if (need <= 0) return;

    const cands = [];
    let porters = 0;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v.dead || v.removed || v.conscript || v.leaving || v.jobId < 0) continue;
      if (v.state === VS.LEAVING || v.age < ADULT_AGE) continue;
      const b = this.getBuilding(v.jobId);
      const d = b ? this.defOf(b) : null;
      if (!b || !d || isGarrison(d)) continue;
      if ((b.priority === undefined ? 1 : b.priority) > 1) continue;
      if (d.role === 'builder') continue;
      const fr = foodJobRank(d);
      if (fr === 0) continue;
      let tier;
      if (fr === 1) tier = 2;
      else if (d.role === 'porter') { porters++; tier = 1; }
      else tier = 0;
      cands.push({ v: v, tier: tier });
    }
    cands.sort((a, c) => (a.tier - c.tier) || (a.v.id - c.v.id));

    let porterBudget = porters - WAR_PORTER_FLOOR;
    const B = this.game && this.game.buildings;
    let k = 0;
    for (let i = 0; i < openings.length && need > 0; i++) {
      const post = openings[i];
      if (!isGarrison(this.defOf(post))) continue;
      const pd = this.defOf(post);
      while (this.openJobs(post) > 0 && need > 0 && k < cands.length) {
        const tier = cands[k].tier;
        if (tier === 1 && porterBudget <= 0) { k++; continue; }
        const v = cands[k++];
        this.loseJob(v.v);
        if (B && typeof B.assignWorker === 'function' && !B.assignWorker(post, v.v.id)) break;
        if (tier === 1) porterBudget--;
        v.v.jobId = post.id;
        v.v.role = pd.role || 'idler';
        v.v.nodeIdx = -1;
        v.v.nodeFailUntil = 0;
        v.v.siteId = -1;
        this.setPhase(v.v, PH.NONE);
        if (v.v.state === VS.IDLE) this.setState(v.v, VS.WALK);
        v.v.serial++;
        need--;
      }
    }
  }

  openJobs(b) {
    const B = this.game && this.game.buildings;
    if (B && typeof B.openJobs === 'function') return B.openJobs(b);
    const d = this.defOf(b);
    const cap = d ? d.jobs || 0 : 0;
    return cap - (b.workers ? b.workers.length : 0);
  }

  homeDist2(v, door) {
    if (door < 0) return Infinity;
    const home = this.getBuilding(v.homeId);
    const hx = home ? home.x + 0.5 : v.vx;
    const hy = home ? home.y + 0.5 : v.vy;
    const dx = toX(door) + 0.5 - hx;
    const dy = toY(door) + 0.5 - hy;
    return dx * dx + dy * dy;
  }

  /** Accepts an agent or an id — buildings.js calls this to evict a garrison. */
  loseJob(vOrId) {
    const v = this.resolve(vOrId);
    if (!v) return;
    if (v.jobId < 0 && v.role === 'idler') return;
    const B = this.game && this.game.buildings;
    if (B && typeof B.releaseWorkerEverywhere === 'function') {
      B.releaseWorkerEverywhere(v.id);
    } else {
      const b = this.getBuilding(v.jobId);
      if (b && b.workers) {
        const i = b.workers.indexOf(v.id);
        if (i >= 0) removeSwap(b.workers, i);
      }
    }
    v.jobId = -1;
    if (!v.conscript) v.role = 'idler';
    v.nodeIdx = -1;
    v.siteId = -1;
    v.patrolTo = -1;
    this.setPhase(v, PH.NONE);
    if (v.state === VS.WORK) this.setState(v, VS.IDLE);
    v.serial++;
  }

  /* ---------------------------------------------------------------- *
   * The emergency draft (§10.6)
   * ---------------------------------------------------------------- */

  /**
   * Converts up to `n` non-soldier villagers to militia for the duration of
   * the raid. Returns the array of drafted ids — military.js consumes the
   * array, and its `length` is the count §8 asks for.
   *
   * Adults first. If not one adult is left standing, the children are drafted
   * rather than nobody: §16.6 promises a town always meets a raid, and an
   * all-child town that fields no one at all is the one case where it did not.
   * They go through the same path as anyone else, so `releaseConscripts` gives
   * them their lives back when the wave ends.
   */
  forcedConscript(n) {
    const out = [];
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 1 && out.length > 0) break;
      const list = this.list;
      for (let i = 0; i < list.length && out.length < n; i++) {
        const v = list[i];
        if (v.dead || v.removed || v.conscript) continue;
        if (v.role === 'soldier' || v.role === 'militia') continue;
        if (v.leaving || v.state === VS.LEAVING) continue;
        if (pass === 0 && v.age < ADULT_AGE) continue;
        v.prevRole = v.role;
        v.prevJobId = v.jobId;
        this.releaseTask(v, 'drafted');
        this.loseJob(v);
        v.conscript = true;
        // Tier-0 kit comes from having no equipment, not from the role string;
        // military.js identifies a drafted man by role 'soldier'.
        v.role = 'soldier';
        this.cancelPathRequest(v);
        this.clearPath(v);
        this.setState(v, VS.IDLE);
        this.setPhase(v, PH.NONE);
        v.timer = 0;
        v.serial++;
        out.push(v.id);
      }
    }
    return out;
  }

  /** Conscripts go back to their old jobs once the raid is over (§10.6). */
  releaseConscripts(ids) {
    const list = this.list;
    const B = this.game && this.game.buildings;
    let c = 0;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (!v.conscript) continue;
      if (ids && ids.length && ids.indexOf(v.id) < 0) continue;
      v.conscript = false;
      v.role = v.prevRole || 'idler';
      const b = this.getBuilding(v.prevJobId);
      if (b && this.openJobs(b) > 0
        && (!B || typeof B.assignWorker !== 'function' || B.assignWorker(b, v.id))) {
        v.jobId = v.prevJobId;
      } else {
        v.jobId = -1;
        v.role = 'idler';
      }
      v.prevRole = '';
      v.prevJobId = -1;
      this.setState(v, VS.IDLE);
      v.serial++;
      c++;
    }
    if (c > 0) this.assignJobs();
    return c;
  }

  /* ---------------------------------------------------------------- *
   * Building index and lookups
   * ---------------------------------------------------------------- */

  buildingList() {
    const B = this.game && this.game.buildings;
    if (!B) return EMPTY_LIST;
    if (Array.isArray(B.list)) return B.list;
    if (Array.isArray(B.all)) return B.all;
    return EMPTY_LIST;
  }

  defOf(b) {
    if (!b) return null;
    return b.def || BUILDING_BY_ID[b.defId] || null;
  }

  reindex() {
    this.indexDirty = false;
    const all = this.buildingList();
    this.markets.length = 0;
    this.houses.length = 0;
    this.sites.length = 0;
    this.foodStores.length = 0;
    this.gates.length = 0;
    this.townCentre = null;
    for (let i = 0; i < all.length; i++) {
      const b = all[i];
      if (!b || b.destroyed || b.removed) continue;
      const d = this.defOf(b);
      if (!d) continue;
      if (b.built === false) {
        this.sites.push(b);
        continue;
      }
      // A repairing building is a site AND still itself: it goes on storing,
      // housing and feeding while builders raise it back to full health.
      if (this.isRepairing(b)) this.sites.push(b);
      if (d.id === 'town_centre') this.townCentre = b;
      if (d.market) this.markets.push(b);
      if (d.storage && d.storage.classes.indexOf('food') >= 0) this.foodStores.push(b);
      if (d.houses > 0) this.houses.push(b);
      if (d.gate) this.gates.push(b);
    }
    if (this.siteWork.size > this.sites.length) {
      for (const id of this.siteWork.keys()) {
        const b = this.getBuilding(id);
        if (!b || (b.built && !this.isRepairing(b))) this.siteWork.delete(id);
      }
    }
    this.doorFallback.clear();
  }

  getBuilding(id) {
    if (!(id >= 0)) return null;
    const B = this.game && this.game.buildings;
    if (!B) return null;
    let b = null;
    if (typeof B.get === 'function') b = B.get(id);
    else if (B.byId instanceof Map) b = B.byId.get(id);
    else if (B.byId) b = B.byId[id];
    if (!b || b.destroyed || b.removed) return null;
    return b;
  }

  /** §7: villagers path to doorIdx, never into the footprint. */
  doorOf(b) {
    if (!b) return -1;
    if (b.doorIdx >= 0) return b.doorIdx;
    const cached = this.doorFallback.get(b.id);
    if (cached !== undefined) return cached;
    const idx = this.computeDoor(b);
    this.doorFallback.set(b.id, idx);
    return idx;
  }

  computeDoor(b) {
    const w = this.world;
    const d = this.defOf(b);
    const bw = b.w || (d ? d.w : 1) || 1;
    const bh = b.h || (d ? d.h : 1) || 1;
    let best = -1;
    let bestKey = Infinity;
    for (let y = b.y - 1; y <= b.y + bh; y++) {
      for (let x = b.x - 1; x <= b.x + bw; x++) {
        if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
        if (x >= b.x && x < b.x + bw && y >= b.y && y < b.y + bh) continue;
        const idx = y * GRID_W + x;
        if (w && typeof w.isWalkable === 'function' && !w.isWalkable(idx)) continue;
        const key = x + y;
        if (key < bestKey) { bestKey = key; best = idx; }
      }
    }
    if (best >= 0) return best;
    return toIdx(clamp(b.x, 0, GRID_W - 1), clamp(b.y, 0, GRID_H - 1));
  }

  dist2ToDoor(v, b) {
    const idx = this.doorOf(b);
    if (idx < 0) return Infinity;
    const dx = toX(idx) + 0.5 - v.vx;
    const dy = toY(idx) + 0.5 - v.vy;
    return dx * dx + dy * dy;
  }

  nearestStorageFor(v, item) {
    const B = this.game && this.game.buildings;
    if (!B || !item) return null;
    if (typeof B.nearestStorage === 'function') return B.nearestStorage(item, v.vx, v.vy);
    if (typeof B.capacityFor !== 'function') return null;
    const all = this.buildingList();
    let best = null;
    let bd = Infinity;
    for (let i = 0; i < all.length; i++) {
      const b = all[i];
      const d = this.defOf(b);
      if (!d || !d.storage || b.built === false) continue;
      if (B.capacityFor(b, item) <= 0) continue;
      const dd = this.dist2ToDoor(v, b);
      if (dd < bd) { bd = dd; best = b; }
    }
    return best;
  }

  townAnchor() {
    if (this.townCentre) return this.doorOf(this.townCentre);
    if (this.startIdx >= 0) return this.startIdx;
    const w = this.world;
    if (w && w.start) return toIdx(w.start.x | 0, w.start.y | 0);
    return -1;
  }

  spawnAnchor() {
    const a = this.townAnchor();
    return a >= 0 ? a : toIdx(GRID_W >> 1, GRID_H >> 1);
  }

  /* ---------------------------------------------------------------- *
   * Cross-module notifications
   * ---------------------------------------------------------------- */

  onBuildingDestroyed(id) {
    this.indexDirty = true;
    if (!(id >= 0)) return;
    this.doorFallback.delete(id);
    this.siteWork.delete(id);
    this.priorityMemo.delete(id);
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v.homeId === id) { v.homeId = -1; v.serial++; }
      if (v.eatTargetId === id) v.eatTargetId = -1;
      if (v.siteId === id) {
        v.siteId = -1;
        if (v.phase === PH.BUILD) this.setPhase(v, PH.NONE);
      }
      if (v.jobId === id) this.loseJob(v);
      if (v.task && (v.task.fromId === id || v.task.toId === id)) {
        this.releaseTask(v, 'building destroyed');
        this.recover(v, 'task-building-destroyed');
      }
    }
    this.assignJobs();
  }

  /**
   * §14: economy restores after villagers, so a claimed task id can only be
   * re-linked afterwards. Anything that no longer exists is dropped rather
   * than trusted from the file.
   */
  relinkTasks() {
    const e = this.game && this.game.economy;
    const tasks = e && e.tasks;
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v.task || v.taskId < 0) continue;
      let found = null;
      if (tasks) {
        for (let k = 0; k < tasks.length; k++) {
          if (tasks[k] && tasks[k].id === v.taskId) { found = tasks[k]; break; }
        }
      }
      if (found && this.taskValid(v, found)) {
        v.task = found;
      } else {
        v.taskId = -1;
        if (v.state === VS.HAUL_PICKUP || v.state === VS.HAUL_DROP) this.setState(v, VS.IDLE);
      }
    }
  }

  emit(name, payload) {
    const bus = this.game && this.game.bus;
    if (bus && typeof bus.emit === 'function') bus.emit(name, payload);
  }

  /* ---------------------------------------------------------------- *
   * UI helpers (read-only)
   * ---------------------------------------------------------------- */

  /** Plain-language activity for the inspector (§13). */
  activityText(v) {
    if (!v) return '';
    if (v.dead) return 'dead';
    const carry = v.carry.qty > 0
      ? 'carrying ' + v.carry.qty + ' '
        + (ITEMS[v.carry.item] ? ITEMS[v.carry.item].name.toLowerCase() : v.carry.item)
      : '';
    const job = this.getBuilding(v.jobId);
    const jd = job ? this.defOf(job) : null;
    const jobName = jd ? jd.name : '';
    if (v.patrolTo >= 0 && (v.state === VS.WALK || v.state === VS.IDLE)) return 'patrolling';
    switch (v.state) {
      case VS.HAUL_PICKUP: {
        const b = v.task ? this.getBuilding(v.task.fromId) : null;
        const bd = b ? this.defOf(b) : null;
        return 'fetching ' + (v.task ? v.task.qty + ' ' + v.task.item : 'goods')
          + ' from the ' + (bd ? bd.name : 'store');
      }
      case VS.HAUL_DROP: {
        const b = v.task ? this.getBuilding(v.task.toId) : null;
        const bd = b ? this.defOf(b) : null;
        return (carry || 'delivering') + ' to the ' + (bd ? bd.name : 'store');
      }
      case VS.WORK:
        if (v.phase === PH.HARVEST) return 'gathering' + (jobName ? ' for the ' + jobName : '');
        if (v.phase === PH.BUILD) return 'building';
        return jobName ? 'working at the ' + jobName : 'working';
      case VS.WALK:
        if (v.phase === PH.TO_NODE) return 'heading out to gather';
        if (v.phase === PH.TO_DOOR) return 'carrying a load back to the ' + (jobName || 'hut');
        if (v.phase === PH.TO_SITE) return 'walking to a building site';
        if (v.phase === PH.TO_TOWN) return 'arriving in the valley';
        return jobName ? 'walking to the ' + jobName : 'walking';
      case VS.GO_HOME: return 'walking home';
      case VS.SLEEP: return v.homeId >= 0 ? 'asleep at home' : 'asleep outdoors';
      case VS.GO_EAT: return 'going to eat';
      case VS.FLEE: return 'fleeing';
      case VS.FIGHT: return 'fighting';
      case VS.LEAVING: return 'leaving the valley';
      default: return carry || 'idle';
    }
  }

  roleName(v) {
    return titleCase(v && v.role ? v.role : 'idler');
  }

  get employedCount() {
    let n = 0;
    for (let i = 0; i < this.list.length; i++) if (this.list[i].jobId >= 0) n++;
    return n;
  }

  get homelessCount() {
    let n = 0;
    for (let i = 0; i < this.list.length; i++) if (this.list[i].homeId < 0) n++;
    return n;
  }

  get unemployedCount() {
    return this.list.length - this.employedCount;
  }

  /** Goods physically in villagers' hands, for an honest global stock count. */
  carriedTotals(out) {
    const o = out || Object.create(null);
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i].carry;
      if (c.qty > 0) o[c.item] = (o[c.item] || 0) + c.qty;
    }
    return o;
  }

  /* ---------------------------------------------------------------- *
   * Save / restore (§14)
   * ---------------------------------------------------------------- */

  serialize() {
    const out = [];
    for (let i = 0; i < this.list.length; i++) {
      const v = this.list[i];
      if (v.removed) continue;
      out.push({
        id: v.id,
        name: v.name,
        vx: v.vx,
        vy: v.vy,
        homeId: v.homeId,
        jobId: v.jobId,
        role: v.role,
        state: v.state,
        phase: v.phase,
        path: v.path ? Array.prototype.slice.call(v.path, 0, v.pathLen) : null,
        pathStep: v.pathStep,
        target: v.target,
        carryItem: v.carry.item,
        carryQty: v.carry.qty,
        taskId: v.task ? v.task.id : v.taskId,
        age: v.age,
        hunger: v.hunger,
        fed: v.fed,
        health: v.health,
        timer: v.timer,
        dead: v.dead,
        nodeIdx: v.nodeIdx,
        siteId: v.siteId,
        aside: v.aside,
        asideResume: v.asideResume,
        handGather: v.handGather,
        arriving: v.arriving,
        arriveTarget: v.arriveTarget,
        // N3 — timers are state. Dropping them resets the whole town's meal
        // backoff and migrant clocks on every load, which is what let a raid
        // be save-scummed. `eatUntil` is absolute against `now`, and `now` is
        // serialized with it.
        eatUntil: v.eatUntil,
        eatFails: v.eatFails,
        eatDeferUntil: v.eatDeferUntil,
        arriveTimer: v.arriveTimer,
        leaveTimer: v.leaveTimer,
        leaving: v.leaving,
        conscript: v.conscript,
        prevRole: v.prevRole,
        prevJobId: v.prevJobId,
        eatTargetId: v.eatTargetId,
        mealWaits: v.mealWaits,
        groupLast: v.groupLast.slice(),
      });
    }
    return {
      nextId: this.nextId,
      cursor: this.cursor,
      now: this.now,
      nameSalt: this.nameSalt,
      rng: this.rng.getState(),
      list: out,
    };
  }

  restore(obj, game) {
    if (game) this.game = game;
    this.world = this.game ? this.game.world : null;
    for (let i = 0; i < this.list.length; i++) this.cancelPathRequest(this.list[i]);
    this.list.length = 0;
    this.index.clear();
    this.priorityMemo.clear();
    if (!obj) return;

    this.nextId = obj.nextId || 1;
    this.cursor = obj.cursor || 0;
    this.now = obj.now || 0;
    this.nameSalt = obj.nameSalt === undefined ? 0x5eed : obj.nameSalt;
    if (obj.rng) this.rng.setState(obj.rng);

    this.reindex();

    const src = obj.list || [];
    for (let i = 0; i < src.length; i++) {
      const s = src[i];
      const v = this.makeAgent(s.id);
      v.name = s.name || this.nameFor(s.id);
      v.vx = Number.isFinite(s.vx) ? s.vx : 0.5;
      v.vy = Number.isFinite(s.vy) ? s.vy : 0.5;
      v.role = s.role || 'idler';
      v.state = s.state === undefined ? VS.IDLE : s.state;
      v.phase = s.phase === undefined ? PH.NONE : s.phase;
      v.target = s.target === undefined ? -1 : s.target;
      v.carry.item = s.carryItem || '';
      v.carry.qty = s.carryQty || 0;
      if (v.carry.qty <= 0) v.carry.item = '';
      v.age = s.age === undefined ? 18 : s.age;
      v.hunger = s.hunger || 0;
      v.fed = s.fed || 0;
      v.health = s.health === undefined ? 70 : s.health;
      v.timer = s.timer || 0;
      v.dead = !!s.dead;
      v.nodeIdx = s.nodeIdx === undefined ? -1 : s.nodeIdx;
      v.siteId = s.siteId === undefined ? -1 : s.siteId;
      // A save can land mid-stride; moveAside re-checks the tile before using it.
      v.aside = Number.isInteger(s.aside) && s.aside < GRID_N ? s.aside : -1;
      v.asideResume = Number.isInteger(s.asideResume) && s.asideResume < GRID_N ? s.asideResume : -1;
      v.handGather = !!s.handGather;
      v.arriving = !!s.arriving;
      v.arriveTarget = s.arriveTarget === undefined ? -1 : s.arriveTarget;
      v.eatUntil = Number.isFinite(s.eatUntil) ? s.eatUntil : 0;
      v.eatFails = Number.isFinite(s.eatFails) ? clamp(s.eatFails, 0, EAT_FAIL_MAX) : 0;
      v.eatDeferUntil = Number.isFinite(s.eatDeferUntil) ? s.eatDeferUntil : 0;
      v.mealWaits = Number.isFinite(s.mealWaits) ? clamp(s.mealWaits, 0, MEAL_WAIT_MAX) : 0;
      v.arriveTimer = Number.isFinite(s.arriveTimer) && s.arriveTimer >= 0 ? s.arriveTimer : 0;
      v.leaveTimer = Number.isFinite(s.leaveTimer) && s.leaveTimer >= 0 ? s.leaveTimer : 0;
      v.leaving = !!s.leaving;
      v.conscript = !!s.conscript;
      v.prevRole = s.prevRole || '';
      v.prevJobId = s.prevJobId === undefined ? -1 : s.prevJobId;
      v.eatTargetId = s.eatTargetId === undefined ? -1 : s.eatTargetId;
      if (Array.isArray(s.groupLast) && s.groupLast.length === 6) v.groupLast = s.groupLast.slice();
      if (Array.isArray(s.path) && s.path.length > 0) {
        v.pathBuf = new Int32Array(s.path.length + 32);
        for (let k = 0; k < s.path.length; k++) v.pathBuf[k] = s.path[k];
        v.path = v.pathBuf;
        v.pathLen = s.path.length;
        v.pathStep = clamp(s.pathStep || 0, 0, s.path.length);
      }
      // §14: cross-module references are re-validated, never trusted.
      const home = this.getBuilding(s.homeId);
      const hd = home ? this.defOf(home) : null;
      v.homeId = hd && hd.houses > 0 ? s.homeId : -1;
      const job = this.getBuilding(s.jobId);
      const jd = job ? this.defOf(job) : null;
      if (job && jd && jd.jobs > 0 && job.built !== false) {
        v.jobId = s.jobId;
      } else {
        v.jobId = -1;
        if (!v.conscript) v.role = 'idler';
        // A villager with no job may still be raising a site (G2.3/R4), which
        // is exactly what VS.WORK + PH.BUILD means.
        if (v.state === VS.WORK && v.phase !== PH.BUILD) v.state = VS.IDLE;
        // Having no job does not end an errand. §9.3's unemployed haulier is
        // mid-haul in TO_STORAGE/TO_TOWN and the site phases belong to the
        // site, so only the phases that name a workplace go.
        if (v.phase >= PH.TO_JOB && v.phase <= PH.TO_DOOR) v.phase = PH.NONE;
      }
      if (v.siteId >= 0 && !this.getBuilding(v.siteId)) {
        v.siteId = -1;
        if (v.phase === PH.BUILD) v.phase = PH.NONE;
      }
      // A claimed task survives states other than the two HAUL ones — a hungry
      // porter detours to eat holding the goods — so the id is kept regardless
      // and relinkTasks() is what validates it against the restored queue.
      v.taskId = s.taskId === undefined ? -1 : s.taskId;
      if (v.id >= this.nextId) this.nextId = v.id + 1;
      this.list.push(v);
      this.index.set(v.id, v);
    }
    if (this.cursor >= this.list.length) this.cursor = 0;
  }

  /**
   * Post-restore sweep: re-link tasks and clear the watchdogs so nothing is
   * counted as stuck across the load boundary. Safe to call more than once.
   */
  postRestore() {
    this.relinkTasks();
    for (let i = 0; i < this.list.length; i++) {
      const v = this.list[i];
      v.stuck = 0;
      v.stateTime = 0;
      v.seenSerial = v.serial;
      v.pathPending = false;
      v.pathReqId = -1;
      if (v.taskId >= 0 && !v.task) {
        v.taskId = -1;
        this.setState(v, VS.IDLE);
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * Setters that keep the progress watchdog honest
   * ---------------------------------------------------------------- */

  setState(v, s) {
    if (v.state === s) return;
    v.state = s;
    v.stateTime = 0;
    v.serial++;
  }

  setPhase(v, p) {
    if (v.phase === p) return;
    v.phase = p;
    v.serial++;
  }

  /** Route any villager to a tile — used by military.js for patrols. */
  walkTo(v, idx) {
    const a = this.resolve(v);
    return a ? this.goTo(a, idx) : false;
  }
}

export default createVillagers;
