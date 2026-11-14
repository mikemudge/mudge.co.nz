// Hearthmere — building instances, placement, construction, inventories and
// the per-building work loop (DESIGN.md §7).
//
// Ownership boundaries that matter:
//   - Only this module mutates `b.inv`, `b.delivered`, `b.workers` and
//     `world.building`. Everything else goes through the command methods here.
//   - This module never moves a villager and never creates a haul task. It
//     publishes `wants()` / `outputs()` and villagers/economy drive off them.
//   - Roads, cobbles and bridges are NOT instances (ADDENDUM D6). They route
//     through the same place()/placeMany() entry points so input.js has one
//     API, and set `world.road` instead of creating a building.

import * as C from './constants.js';
import * as U from './utils.js';

const { TERRAIN, BUILDING_BY_ID, BUILDINGS, ITEMS, RESOURCE_INFO, TERRAIN_INFO } = C;

/* ------------------------------------------------------------------ *
 * Static per-def tables, built once at module load
 * ------------------------------------------------------------------ */

const EMPTY = Object.freeze({});
const EMPTY_ARR = Object.freeze([]);

// defId -> { inputs: {item:true}, outputs: {item:true} }. Every recipe a def can
// ever run is included, so a player switching a Weaponsmith to halberds does not
// strand steel that the buffer suddenly refuses.
const DEF_IO = Object.create(null);

// Pre-built `'no materials: <item>'` strings — the work loop runs 120+ times a
// tick and must not concatenate.
const NO_MATERIALS = Object.create(null);

// ADDENDUM G3: the idle reason names the full class, so the alert can say
// whether the player needs a Granary or a Stockpile. alertFor() splits on ':'.
const NO_STORAGE = Object.freeze({
  food: 'no storage: food',
  good: 'no storage: good',
  arms: 'no storage: arms',
});

// ADDENDUM AF3. `'no storage'` is a fault with a fix — build a store — so it
// belongs only to an item something is actually short of. A woodcutter whose
// store is full of wood nothing is waiting for is at rest, and §16.8's "name a
// fix the player can perform right now" has no honest answer for that one.
const IDLE_AT_CAPACITY = C.IDLE_AT_CAPACITY;

// A site whose materials are all in but which no builder has touched for this
// long may be finished by any villager whose own workplace is idle (G2.3).
const SITE_STALL_SECONDS = 10;

/* ------------------------------------------------------------------ *
 * Repair (§10.5's counterpart — a raid leaves damage the player can undo)
 * ------------------------------------------------------------------ */

// Materials charged per unit of missing structure, as a fraction of the def's
// build cost. Repairing must be strictly cheaper than demolish-and-rebuild or
// nothing will ever be repaired.
const REPAIR_COST_FACTOR = 0.5;

// Builder-seconds charged per unit of missing structure, as a fraction of the
// def's buildTime. Materials are discounted; labour is not — half a building
// still has to be raised by hand.
const REPAIR_WORK_FACTOR = 1;

// Floor under a repair's labour so a trivial scratch still takes a moment.
const REPAIR_MIN_WORK = 1;

/**
 * Per-class ceiling inside a multi-class store (ADDENDUM G3): no class may eat
 * another's room. An explicit `classCap` wins; otherwise the cap is split
 * evenly, which is the same rule the Town Centre's 75/75 states outright.
 */
function classCapOf(st) {
  if (typeof st.classCap === 'number') return st.classCap;
  const n = st.classes.length;
  return n > 1 ? Math.floor(st.cap / n) : st.cap;
}

(function buildStaticTables() {
  for (let i = 0; i < C.ITEM_IDS.length; i++) {
    NO_MATERIALS[C.ITEM_IDS[i]] = 'no materials: ' + C.ITEM_IDS[i];
  }
  for (let i = 0; i < BUILDINGS.length; i++) {
    const def = BUILDINGS[i];
    const inputs = Object.create(null);
    const outputs = Object.create(null);
    if (def.recipe) {
      for (const k in def.recipe.in) inputs[k] = true;
      for (const k in def.recipe.out) outputs[k] = true;
    }
    if (def.recipes) {
      for (let r = 0; r < def.recipes.length; r++) {
        for (const k in def.recipes[r].in) inputs[k] = true;
        for (const k in def.recipes[r].out) outputs[k] = true;
      }
    }
    if (def.consumes) inputs[def.consumes.item] = true;
    if (def.gathers) {
      outputs[def.gathers.item] = true;
      if (def.gathers.alt) outputs[def.gathers.alt.item] = true;
      if (def.gathers.byproduct) outputs[def.gathers.byproduct.item] = true;
    }
    if (def.grows) {
      outputs[def.grows.item] = true;
      if (def.grows.alt) outputs[def.grows.alt.item] = true;
    }
    DEF_IO[def.id] = { inputs, outputs };
  }
})();

/** A def that sets world.road instead of creating an instance (ADDENDUM D6). */
function isRoadDef(def) {
  return def.instance === false;
}

function defCap(def, item, io) {
  if (io.outputs[item]) return def.outputCap || 12;
  if (io.inputs[item]) return def.inputCap || 12;
  return 0;
}

/* ------------------------------------------------------------------ *
 * Module
 * ------------------------------------------------------------------ */

export function createBuildings(game) {
  // createX(game) must not read other modules — only stash the handle (§12).
  const self = {};

  /** @type {Array} dense array of live building instances. */
  const list = [];
  const byId = new Map();

  // Storage buildings, cached; rebuilt lazily whenever one is added or removed.
  let storages = [];
  let storesDirty = true;

  // Bumped whenever this module changes world.road, so doorIdx recomputes.
  let roadGen = 1;
  let townCentreRef = null;

  let nextId = 1;
  let freeBuildsUsed = 0;

  // Last-resort holding pool. §7 says a cancel refunds into the nearest storage
  // "or the global pool if none has room — nothing is ever destroyed by a
  // cancel", so this exists purely so conservation can never break.
  const overflow = Object.create(null);

  // ADDENDUM P1: the pool is goods lying in the town square, not goods in
  // limbo, so it gets a place on the map that a porter can be sent to. `inv`
  // IS the pool object — nothing is copied, so conservation cannot fork — and
  // the node is deliberately kept out of `list` (which stockOf sums) and out
  // of `storages`. Source-only: capacityFor() refuses it, so nothing can ever
  // be hauled INTO it; deposit() remains the only way in.
  const OVERFLOW_ID = 0;              // instance ids start at 1, so 0 is free
  const OVERFLOW_DOOR_RADIUS = 6;
  const overflowNode = {
    id: OVERFLOW_ID, defId: '', def: null, x: 0, y: 0, w: 1, h: 1,
    inv: overflow, delivered: Object.create(null), cost: Object.create(null),
    clsCount: Object.create(null),
    built: true, active: true, removed: false, destroyed: false,
    hp: 1, maxHp: 1, workers: [], idleReason: '',
    connected: true, doorIdx: -1, doorGen: -1, isOverflowPool: true,
  };
  // Derived, because deposit() and spend() write the pool without going
  // through add()/take(): a stored count here could only ever drift.
  Object.defineProperty(overflowNode, 'invCount', {
    get: function poolCount() {
      let n = 0;
      for (const k in overflow) if (overflow[k] > 0) n += overflow[k];
      return n;
    },
  });

  let needsWorkerValidation = false;
  let rng = new U.RNG(0x5eed1e);

  // item id -> something in the valley is short of it this tick (AF3).
  // Rebuilt in refreshContext; meaningless outside a tick.
  const demand = Object.create(null);

  // Per-tick context, allocated once and reused so the work loop never
  // allocates over 120+ buildings.
  const ctx = {
    season: 0,
    night: false,
    healthFactor: 1,
    prodBonus: 1,
    tier: 1,
    roomFood: true,
    roomGood: true,
    roomArms: true,
    dt: 0,
  };

  /* ---------------------------------------------------------------- *
   * Small accessors over the neighbouring modules (defensive: another
   * agent's module may be partially built when this one is exercised).
   * ---------------------------------------------------------------- */

  function world() { return game.world; }

  function economyTier() {
    const e = game.economy;
    const t = e && e.tier;
    return typeof t === 'number' && t >= 1 ? t : 1;
  }

  function townHealth() {
    const e = game.economy;
    const h = e && e.townHealth;
    return typeof h === 'number' ? h : 70;
  }

  function emit(name, payload) {
    if (game.bus && game.bus.emit) game.bus.emit(name, payload);
  }

  function terrainAt(idx) {
    const w = world();
    return w && w.terrain ? w.terrain[idx] : TERRAIN.GRASS;
  }

  function roadAt(idx) {
    const w = world();
    return w && w.road ? w.road[idx] : 0;
  }

  function buildingAt(idx) {
    const w = world();
    return w && w.building ? w.building[idx] : -1;
  }

  function elevAt(idx) {
    const w = world();
    return w && w.elev ? w.elev[idx] : 0;
  }

  function setSolid(idx, solid) {
    const p = game.paths;
    if (p && typeof p.setSolid === 'function') p.setSolid(idx, solid);
  }

  // ADDENDUM H1. A gate is `solid:false, gate:true`: villagers walk through it,
  // raiders must not. Nothing else writes world.gate, so without this call
  // paths.find(..., {enemy:true}) routes straight through a shut gate.
  function setGateTile(idx, on) {
    const p = game.paths;
    if (p && typeof p.setGate === 'function') p.setGate(idx, on);
  }

  function notifyRoadChanged(idx) {
    roadGen++;
    const p = game.paths;
    if (!p) return;
    if (typeof p.roadChanged === 'function') p.roadChanged(idx);
    else if (typeof p.invalidate === 'function') p.invalidate(idx);
  }

  /* ---------------------------------------------------------------- *
   * Footprint / occupancy
   * ---------------------------------------------------------------- */

  function forEachTile(b, fn) {
    for (let dy = 0; dy < b.h; dy++) {
      for (let dx = 0; dx < b.w; dx++) {
        fn(U.toIdx(b.x + dx, b.y + dy), b.x + dx, b.y + dy);
      }
    }
  }

  /** Footprint tile indices, written into `out` (reused). Returns the count. */
  function footprintTiles(b, out) {
    let n = 0;
    for (let dy = 0; dy < b.h; dy++) {
      for (let dx = 0; dx < b.w; dx++) out[n++] = U.toIdx(b.x + dx, b.y + dy);
    }
    out.length = n;
    return n;
  }

  function claimTiles(b) {
    const w = world();
    forEachTile(b, (idx) => {
      if (w && w.building) w.building[idx] = b.id;
      if (b.solid) setSolid(idx, true);
      // A half-built gate is still a hole in the wall; only a finished one shuts.
      if (b.built && b.def.gate) setGateTile(idx, true);
    });
  }

  function releaseTiles(b) {
    const w = world();
    forEachTile(b, (idx) => {
      if (w && w.building && w.building[idx] === b.id) w.building[idx] = -1;
      if (b.solid) setSolid(idx, false);
      if (b.def.gate) setGateTile(idx, false);
    });
  }

  // Scratch for the door scan: one building's road-adjacent ring, ordered by
  // (tx+ty) ascending. Reused so a road change allocates nothing.
  const doorCands = new Int32Array(128);
  const doorKeys = new Int32Array(128);

  /**
   * Every road-carrying tile orthogonally adjacent to the footprint, cheapest
   * (tx+ty) first — the same ordering the renderer sorts on. Returns the count
   * written into `doorCands`.
   */
  function doorCandidates(b) {
    let n = 0;
    const tx0 = b.x - 1;
    const tx1 = b.x + b.w;
    const ty0 = b.y - 1;
    const ty1 = b.y + b.h;
    for (let pass = 0; pass < 2; pass++) {
      const lo = pass === 0 ? b.x : b.y;
      const hi = pass === 0 ? b.x + b.w : b.y + b.h;
      for (let c = lo; c < hi; c++) {
        for (let side = 0; side < 2; side++) {
          const x = pass === 0 ? c : (side === 0 ? tx0 : tx1);
          const y = pass === 0 ? (side === 0 ? ty0 : ty1) : c;
          if (n >= doorCands.length || !U.inBounds(x, y)) continue;
          const idx = U.toIdx(x, y);
          if (roadAt(idx) <= 0) continue;
          const key = x + y;
          let i = n++;
          while (i > 0 && doorKeys[i - 1] > key) {
            doorKeys[i] = doorKeys[i - 1];
            doorCands[i] = doorCands[i - 1];
            i--;
          }
          doorKeys[i] = key;
          doorCands[i] = idx;
        }
      }
    }
    return n;
  }

  /**
   * §7: the tile villagers path to. The lowest-(tx+ty) road tile touching the
   * footprint that is in the same walkable region as the town, or -1 when no
   * road touches the footprint at all.
   *
   * N2 — position alone is not enough. A road tile can sit in a walled-off
   * pocket, and a door there makes the building unreachable; when the Town
   * Centre drew one, every building in the valley was measured against it and
   * the whole town went dark. Reachability is the first criterion and (tx+ty)
   * only breaks ties among reachable tiles.
   */
  function computeDoor(b) {
    // Before doorCandidates(), which shares the scratch this would clobber.
    const hub = hubRegion();
    const n = doorCandidates(b);
    // M3: -1, never the footprint's own corner. That corner is solid, so a
    // worker sent there walks forever and the building looks like it is
    // working; `hasDoor()` turns the honest -1 into a 'no road' reason.
    if (n === 0) return -1;
    const p = game.paths;
    if (hub >= 0 && p && typeof p.regionOf === 'function') {
      for (let i = 0; i < n; i++) if (p.regionOf(doorCands[i]) === hub) return doorCands[i];
    }
    return doorCands[0];
  }

  // Vote tally for hubRegion(). Region ids are few, so parallel arrays beat a
  // Map that would allocate on every road change.
  const hubIds = [];
  const hubVotes = [];
  const hubSeen = [];
  let hubCached = -1;
  let hubStamp = -1;

  /**
   * The walkable region the town actually occupies: the one the most buildings
   * can open a door onto. This, not the Town Centre's tile, is what "connected
   * to the town" means — so a Town Centre that draws a door in a pocket is one
   * cut-off building rather than a valley-wide blackout (N2).
   *
   * The Town Centre still breaks ties, which keeps §6's "the town is where the
   * Town Centre is" true in every case where it can be.
   */
  function hubRegion() {
    const stamp = doorStamp();
    if (stamp === hubStamp) return hubCached;
    hubStamp = stamp;
    hubCached = computeHubRegion();
    return hubCached;
  }

  function computeHubRegion() {
    const p = game.paths;
    if (!p || typeof p.regionOf !== 'function') return -1;
    const tc = townCentre();
    hubIds.length = 0;
    hubVotes.length = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.removed || b.def.wall || b.def.gate) continue;
      const n = doorCandidates(b);
      if (n === 0) continue;
      const weight = b === tc ? 1.5 : 1;
      hubSeen.length = 0;
      for (let k = 0; k < n; k++) {
        const r = p.regionOf(doorCands[k]);
        if (r < 0 || hubSeen.indexOf(r) >= 0) continue;
        hubSeen.push(r);
        const at = hubIds.indexOf(r);
        if (at < 0) { hubIds.push(r); hubVotes.push(weight); }
        else hubVotes[at] += weight;
      }
    }
    let best = -1;
    let bestVotes = 0;
    for (let i = 0; i < hubIds.length; i++) {
      if (hubVotes[i] > bestVotes) { bestVotes = hubVotes[i]; best = hubIds[i]; }
    }
    return best;
  }

  /**
   * The pool sits on the town centre's tile and its door is the nearest tile a
   * porter can stand on. Goods on the ground need somewhere to stand, not road
   * frontage, so this is a walkability search and not doorCandidates(): the
   * whole point of P1 is that the pool stays reachable when the town has lost
   * the buildings roads were laid for. -1 (nowhere to stand) leaves the pool
   * out of the queue rather than posting tasks nobody can walk to.
   */
  function refreshOverflowNode() {
    const w = world();
    if (!w || !w.start) return;
    overflowNode.x = w.start.x | 0;
    overflowNode.y = w.start.y | 0;
    const stamp = doorStamp();
    const canWalk = typeof w.isWalkable === 'function';
    if (overflowNode.doorGen === stamp && overflowNode.doorIdx >= 0
      && (!canWalk || w.isWalkable(overflowNode.doorIdx))) return;
    overflowNode.doorGen = stamp;
    overflowNode.doorIdx = standingTileNear(overflowNode.x, overflowNode.y);
  }

  function standingTileNear(cx, cy) {
    const w = world();
    if (!w || typeof w.isWalkable !== 'function') return U.toIdx(cx, cy);
    const p = game.paths;
    const hub = hubRegion();
    const canRegion = hub >= 0 && p && typeof p.regionOf === 'function';
    let fallback = -1;
    for (let r = 0; r <= OVERFLOW_DOOR_RADIUS; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const ring = (dx > r - 1 || dx < 1 - r || dy > r - 1 || dy < 1 - r);
          if (!ring) continue;
          const x = cx + dx, y = cy + dy;
          if (!U.inBounds(x, y)) continue;
          const idx = U.toIdx(x, y);
          if (!w.isWalkable(idx)) continue;
          if (canRegion && p.regionOf(idx) !== hub) {
            if (fallback < 0) fallback = idx;
            continue;
          }
          return idx;
        }
      }
    }
    return fallback;
  }

  /**
   * Doors depend on every road, wall and gate tile, and roads are laid by
   * input.js and military.js as well as this module — so the stamp follows
   * world.rev, not only this module's own edits (N2.2).
   */
  function doorStamp() {
    const w = world();
    return roadGen + (w ? w.rev : 0);
  }

  /* ---------------------------------------------------------------- *
   * Inventory API — THE ONLY mutators of b.inv (§7)
   * ---------------------------------------------------------------- */

  /**
   * A repair's outstanding delivery for one item. Pure — the renderer and the
   * inspector both read through capacityFor(), so nothing here may mutate.
   *
   * `r.delivered` is CUMULATIVE and never falls: builders consume out of
   * `r.used`, not out of it. Decrementing `delivered` as the pile was spent
   * would re-open the shortfall, and the building would go on demanding — and
   * charging for — materials for as long as the repair ran.
   */
  function repairShortfall(b, item) {
    const r = b.repair;
    if (!r) return 0;
    const need = (r.cost[item] || 0) - (r.delivered[item] || 0);
    return need > 0 ? need : 0;
  }

  /** Units of `item` physically sitting at the building for its repair. */
  function repairOnHand(r, item) {
    const n = (r.delivered[item] || 0) - (r.used[item] || 0);
    return n > 0 ? n : 0;
  }

  /**
   * A repairing building has room for its own repair materials ON TOP of its
   * normal buffer, exactly as a construction site has room for what it owes.
   * add() fills the repair first, so units a haulier brings for the repair can
   * never be diverted into a recipe hopper that happens to want the same item.
   */
  function capacityFor(b, item) {
    const base = baseCapacityFor(b, item);
    if (!b.repair || !b.built) return base;
    if (item === 'coin' || !ITEMS[item]) return base;
    return base + repairShortfall(b, item);
  }

  function baseCapacityFor(b, item) {
    // Coin is a global figure owned by economy; keeping it out of building
    // buffers stops it being double counted by economy.stock().
    if (item === 'coin' || !ITEMS[item]) return 0;
    // The refund pool is a source, never a destination: goods only enter it
    // through deposit(), which is what makes it the pool of last resort.
    if (b === overflowNode) return 0;
    const def = b.def;

    if (!b.built) {
      // A site only has room for what it still owes.
      const cost = b.cost || EMPTY;
      const need = (cost[item] || 0) - (b.delivered[item] || 0);
      return need > 0 ? need : 0;
    }

    const st = def.storage;
    if (st) {
      const cls = C.itemClass(item);
      if (st.classes.indexOf(cls) < 0) return 0;
      const classCap = classCapOf(st);
      return itemRoom(b, item, storageClassRoom(b, st, cls), classCap);
    }

    // A house's larder is class-shaped like a store, not per-item like a
    // workshop buffer, so the same monopoly rule applies to it (J1/J3.1).
    if (def.foodCap > 0 && C.itemClass(item) === 'food') {
      const clsRoom = def.foodCap - (b.clsCount.food || 0);
      return itemRoom(b, item, clsRoom, def.foodCap);
    }

    const cap = defCap(def, item, DEF_IO[def.id]);
    if (cap <= 0) return 0;
    const have = b.inv[item] || 0;
    return cap > have ? cap - have : 0;
  }

  /**
   * ADDENDUM J3.1: a single item may hold at most `ITEM_CLASS_SHARE` of the
   * room a store gives its class, so stone can never fill a Stockpile and
   * leave the Woodcutter with nowhere to haul. `ITEM_CLASS_FLOOR` stops the
   * share making a small buffer useless: under it one item may use the whole
   * class room.
   */
  function perItemCap(classCap) {
    const share = Math.floor(classCap * C.ITEM_CLASS_SHARE);
    const floor = classCap < C.ITEM_CLASS_FLOOR ? classCap : C.ITEM_CLASS_FLOOR;
    return share > floor ? share : floor;
  }

  /** Class room narrowed by this item's own share of it. */
  function itemRoom(b, item, clsRoom, classCap) {
    if (clsRoom <= 0) return 0;
    const own = perItemCap(classCap) - (b.inv[item] || 0);
    if (own <= 0) return 0;
    return own < clsRoom ? own : clsRoom;
  }

  /** Room left for `cls` in a storage building: the tighter of total and class. */
  function storageClassRoom(b, st, cls) {
    let room = st.cap - b.invCount;
    const cc = classCapOf(st);
    if (cc < st.cap) {
      const clsRoom = cc - (b.clsCount[cls] || 0);
      if (clsRoom < room) room = clsRoom;
    }
    return room > 0 ? room : 0;
  }

  /** b.clsCount mirrors b.inv by storage class; add/take are its only writers. */
  function bumpClass(b, item, n) {
    const cls = C.itemClass(item);
    b.clsCount[cls] = (b.clsCount[cls] || 0) + n;
  }

  function recountClasses(b) {
    const out = Object.create(null);
    for (const k in b.inv) {
      if (b.inv[k] > 0) out[C.itemClass(k)] = (out[C.itemClass(k)] || 0) + b.inv[k];
    }
    return out;
  }

  function add(b, item, qty) {
    const want = Math.floor(qty);
    if (!(want > 0)) return 0;
    const room = capacityFor(b, item);
    const n = want < room ? want : room;
    if (n <= 0) return 0;
    if (!b.built) {
      b.delivered[item] = (b.delivered[item] || 0) + n;
      return n;
    }
    let left = n;
    if (b.repair) {
      const need = repairShortfall(b, item);
      if (need > 0) {
        const d = left < need ? left : need;
        b.repair.delivered[item] = (b.repair.delivered[item] || 0) + d;
        left -= d;
      }
    }
    if (left <= 0) return n;
    b.inv[item] = (b.inv[item] || 0) + left;
    b.invCount += left;
    bumpClass(b, item, left);
    return n;
  }

  function take(b, item, qty) {
    // The pool's inv is the pool itself, which deposit()/spend() write behind
    // take()'s back — so it keeps no invCount or clsCount to be kept honest.
    if (b === overflowNode) return takeOverflow(item, qty);
    const want = Math.floor(qty);
    if (!(want > 0)) return 0;
    const have = b.inv[item] || 0;
    const n = want < have ? want : have;
    if (n <= 0) return 0;
    // Keys are left at 0 rather than deleted: churning the shape of a hot
    // object is far more expensive than skipping a zero.
    b.inv[item] = have - n;
    b.invCount -= n;
    bumpClass(b, item, -n);
    return n;
  }

  function has(b, item, qty) {
    return (b.inv[item] || 0) >= (qty === undefined ? 1 : qty);
  }

  /**
   * ADDENDUM J3.2: destroy stored goods. The ONE place matter deliberately
   * leaves the world, and the §16 escape hatch when a store is wedged full of
   * something nothing consumes — so it is player-driven only and must never be
   * offered as an alert's remedy. Routed through take(), which keeps invCount,
   * clsCount and the zero floor honest. Returns the units destroyed.
   *
   * A construction site is refused: its delivered units ARE its reservation,
   * and cancelling the site already returns them to the town intact.
   */
  function discard(b, item, qty) {
    if (!b || !b.built) return 0;
    const n = take(b, item, qty);
    if (n > 0) emit('items:discarded', { id: b.id, item: item, qty: n });
    return n;
  }

  /** Item ids this building wants hauled away. Storage is a sink, never a source. */
  function outputs(b) {
    if (!b.built || b.def.storage) return EMPTY_ARR;
    const io = DEF_IO[b.def.id];
    const out = [];
    for (const k in b.inv) {
      if (b.inv[k] > 0 && io.outputs[k]) out.push(k);
    }
    return out;
  }

  /**
   * [{item, qty}] this building wants hauled in — a site's shortfall, a live
   * repair's shortfall, or recipe inputs.
   *
   * One row per item: economy subtracts `incomingTo(id, item)` from each row it
   * sees, so a second row for the same item would post the shortfall twice.
   */
  function wants(b) {
    const out = [];
    if (!b.built) {
      const cost = b.cost || EMPTY;
      for (const k in cost) {
        const need = cost[k] - (b.delivered[k] || 0);
        if (need > 0) out.push({ item: k, qty: need });
      }
      return out;
    }
    // A repair is the town's own commitment and outlives a pause: the player
    // who stops a workshop has not released the timber they reserved for it.
    if (b.repair) {
      for (const k in b.repair.cost) {
        const need = repairShortfall(b, k);
        if (need > 0) out.push({ item: k, qty: need });
      }
    }
    if (!b.active) return out;
    const def = b.def;
    // baseCapacityFor, not capacityFor: the repair's own shortfall is already a
    // row above, and capacityFor() folds it into every item it shares.
    if (def.consumes) addWant(out, def.consumes.item, baseCapacityFor(b, def.consumes.item));
    const r = activeRecipe(b);
    if (r) {
      for (const k in r.in) addWant(out, k, baseCapacityFor(b, k));
    }
    return out;
  }

  /** Merge into an existing row for the item rather than adding a second one. */
  function addWant(out, item, qty) {
    if (!(qty > 0)) return;
    for (let i = 0; i < out.length; i++) {
      if (out[i].item === item) { out[i].qty += qty; return; }
    }
    out.push({ item: item, qty: qty });
  }

  /** 0..1 fill of the output buffer — economy's 'store' tasks trigger at 0.5. */
  function outputFillRatio(b) {
    if (!b.built) return 0;
    const def = b.def;
    if (def.storage) return def.storage.cap > 0 ? b.invCount / def.storage.cap : 0;
    const io = DEF_IO[def.id];
    let held = 0;
    let cap = 0;
    for (const k in io.outputs) {
      held += b.inv[k] || 0;
      cap += def.outputCap || 12;
    }
    return cap > 0 ? held / cap : 0;
  }

  /* ---------------------------------------------------------------- *
   * Storage helpers (this module owns the storage buildings)
   * ---------------------------------------------------------------- */

  function refreshStorages() {
    if (!storesDirty) return;
    storesDirty = false;
    storages.length = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.built && b.def.storage) storages.push(b);
    }
  }

  function storageRoomFor(item) {
    refreshStorages();
    for (let i = 0; i < storages.length; i++) {
      const b = storages[i];
      if (!b.active) continue;
      if (capacityFor(b, item) > 0) return true;
    }
    return false;
  }

  function classHasRoom(cls) {
    if (cls === 'food') return ctx.roomFood;
    if (cls === 'arms') return ctx.roomArms;
    return ctx.roomGood;
  }

  /**
   * Is there anywhere a haulier could put this item? Since J3.1 room for the
   * class is no longer proof of room for the ITEM, so the cached class flag is
   * only the cheap reject and a yes has to be confirmed per item. Producers
   * use it to tell 'output full' (hauliers are behind) from 'no storage'
   * (nothing will ever come, build a store or discard).
   */
  function haulRoomFor(item) {
    return classHasRoom(C.itemClass(item)) && storageRoomFor(item);
  }

  /** Nearest storage (by tile distance from x,y) that will take `item`. */
  function nearestStorage(item, x, y, exclude) {
    refreshStorages();
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < storages.length; i++) {
      const b = storages[i];
      if (b === exclude || !b.active) continue;
      if (capacityFor(b, item) <= 0) continue;
      const d = U.tileDist(x, y, b.x, b.y);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  /**
   * Put goods somewhere real. Nearest storage first, then any building buffer
   * that will take them, then the overflow pool. Never destroys anything (§16.4).
   */
  function deposit(item, qty, x, y, exclude) {
    let left = Math.floor(qty);
    if (!(left > 0)) return 0;
    const startX = x === undefined ? 0 : x;
    const startY = y === undefined ? 0 : y;
    for (let guard = 0; guard < 64 && left > 0; guard++) {
      const s = nearestStorage(item, startX, startY, exclude);
      if (!s) break;
      const got = add(s, item, left);
      if (got <= 0) break;
      left -= got;
    }
    if (left > 0) overflow[item] = (overflow[item] || 0) + left;
    return Math.floor(qty);
  }

  /**
   * Pull goods out of the town for an instant cost (roads, free builds).
   * Storage first, then the overflow pool, then any other building buffer.
   */
  function spend(item, qty) {
    let left = Math.floor(qty);
    if (!(left > 0)) return 0;
    refreshStorages();
    for (let i = 0; i < storages.length && left > 0; i++) {
      left -= take(storages[i], item, left);
    }
    if (left > 0 && overflow[item] > 0) {
      const n = Math.min(left, overflow[item]);
      overflow[item] -= n;
      left -= n;
    }
    for (let i = 0; i < list.length && left > 0; i++) {
      const b = list[i];
      if (!b.built || b.def.storage) continue;
      left -= take(b, item, left);
    }
    return Math.floor(qty) - left;
  }

  /**
   * ADDENDUM G10: drain the overflow pool. Without this, goods that landed in
   * the last-resort refund pool can only ever leave through spend(), so they
   * are stranded and invisible to the player. Returns the units actually taken.
   */
  function takeOverflow(item, qty) {
    const want = Math.floor(qty);
    if (!(want > 0)) return 0;
    const have = overflow[item] || 0;
    const n = want < have ? want : have;
    if (n <= 0) return 0;
    overflow[item] = have - n;
    return n;
  }

  /* ---------------------------------------------------------------- *
   * Global accounting this module is the source of truth for
   * ---------------------------------------------------------------- */

  /**
   * Units of `item` physically inside buildings plus the overflow pool.
   * Deliberately EXCLUDES construction-site `delivered` stock: those units have
   * left circulation and are matched one-for-one by a drop in reservedOf(), so
   * available = stock - reserved stays flat across a delivery.
   */
  function stockOf(item) {
    let n = overflow[item] || 0;
    for (let i = 0; i < list.length; i++) n += list[i].inv[item] || 0;
    return n;
  }

  function stockTotals(out) {
    const o = out || Object.create(null);
    for (const k in overflow) o[k] = (o[k] || 0) + overflow[k];
    for (let i = 0; i < list.length; i++) {
      const inv = list[i].inv;
      for (const k in inv) if (inv[k] > 0) o[k] = (o[k] || 0) + inv[k];
    }
    return o;
  }

  /**
   * Still-owed cost across unfinished sites AND live repairs (§9.1
   * economy.reserved). A repair is a construction site's twin: it books its
   * materials the instant the player commits to it, so nothing else can spend
   * them, and the booking shrinks one-for-one as each unit lands.
   */
  function reservedOf(item) {
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.repair) n += repairShortfall(b, item);
      if (b.built) continue;
      const need = (b.cost[item] || 0) - (b.delivered[item] || 0);
      if (need > 0) n += need;
    }
    return n;
  }

  function reservedTotals(out) {
    const o = out || Object.create(null);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.repair) {
        for (const k in b.repair.cost) {
          const need = repairShortfall(b, k);
          if (need > 0) o[k] = (o[k] || 0) + need;
        }
      }
      if (b.built) continue;
      for (const k in b.cost) {
        const need = b.cost[k] - (b.delivered[k] || 0);
        if (need > 0) o[k] = (o[k] || 0) + need;
      }
    }
    return o;
  }

  /**
   * Units already delivered to unfinished sites or to live repairs — out of
   * circulation, so neither stock nor reserved. stockOf() must keep excluding
   * them, which it does for free: repair deliveries live in `b.repair.delivered`
   * and never touch `b.inv`.
   */
  function deliveredOf(item) {
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.built) n += b.delivered[item] || 0;
      if (b.repair) n += repairOnHand(b.repair, item);
    }
    return n;
  }

  function available(item) {
    const e = game.economy;
    if (e && typeof e.available === 'function') {
      const v = e.available(item);
      if (typeof v === 'number') return v;
    }
    return stockOf(item) - reservedOf(item);
  }

  /**
   * What `spend()` can actually hand over right now, minus what unfinished
   * sites have reserved. Deliberately NOT economy.available(): that counts
   * goods in villagers' hands and reads a per-tick cache, and spend() can
   * reach neither — which is how a road tile passed canPlace and was then
   * refused by place(). Mirrors spend()'s search exactly (R3).
   */
  function spendable(item) {
    refreshStorages();
    let n = overflow[item] || 0;
    for (let i = 0; i < storages.length; i++) n += storages[i].inv[item] || 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.built || b.def.storage) continue;
      n += b.inv[item] || 0;
    }
    n -= reservedOf(item);
    return n > 0 ? n : 0;
  }

  /* ---------------------------------------------------------------- *
   * Placement validation (§7, eight checks in this exact order)
   * ---------------------------------------------------------------- */

  function fail(reason) { return { ok: false, reason: reason }; }
  const OK = { ok: true, reason: '' };

  /** The existing building this placement would upgrade, or null. */
  function upgradeTargetAt(def, x, y) {
    if (!def.upgradeFrom) return null;
    const id = buildingAt(U.toIdx(x, y));
    if (id < 0) return null;
    const old = byId.get(id);
    if (!old || old.defId !== def.upgradeFrom || !old.built) return null;
    // The old footprint must sit entirely inside the new one.
    if (old.x < x || old.y < y || old.x + old.w > x + def.w || old.y + old.h > y + def.h) return null;
    return old;
  }

  /** Per-item cost of this placement — the difference when it is an upgrade. */
  function costFor(def, old) {
    const out = Object.create(null);
    const base = def.cost || EMPTY;
    const prev = old ? (BUILDING_BY_ID[old.defId].cost || EMPTY) : EMPTY;
    for (const k in base) {
      const n = base[k] - (prev[k] || 0);
      if (n > 0) out[k] = n;
    }
    return out;
  }

  /**
   * ADDENDUM P3: §1's priority 2 — the refusal has to name the ground the
   * player is looking at, not the word 'blocked'. Every branch here is a tile
   * the player can see and can do something about.
   */
  function groundReason(t) {
    if (t === TERRAIN.WATER || t === TERRAIN.SHORE) return 'needs dry land';
    if (t === TERRAIN.FOREST) return 'trees in the way';
    if (t === TERRAIN.ROCK) return 'too rocky to build on';
    if (t === TERRAIN.MOUNTAIN) return 'too steep to build on';
    return 'blocked';
  }

  function terrainBuildableFor(def, t) {
    if (TERRAIN_INFO[t] && TERRAIN_INFO[t].buildable) return true;
    // §5: "ROCK — walkable, not buildable except mines/quarries". Without this
    // exception a Quarry could never satisfy its own needsTerrain: 'rock'.
    if (def.needsTerrain === 'rock' && t === TERRAIN.ROCK) return true;
    return false;
  }

  /**
   * Tile test for path/road/bridge, which are not instances. A def with its own
   * `needsTerrain` skips the walkability test so check 5 can report the specific
   * reason ('needs water') instead of a blunt 'blocked'.
   */
  function roadTileOk(def, idx) {
    if (buildingAt(idx) >= 0) return false;
    const t = terrainAt(idx);
    const r = roadAt(idx);
    if (!def.needsTerrain && (!TERRAIN_INFO[t] || TERRAIN_INFO[t].moveSpeed <= 0)) return false;
    // Cobble upgrades a dirt path in place (§6); a dirt path may only go on bare ground.
    if (def.road === C.ROAD_COBBLE) return r === C.ROAD_NONE || r === C.ROAD_DIRT;
    return r === C.ROAD_NONE;
  }

  function hasAdjacentTerrain(def, x, y, t) {
    for (let dx = -1; dx <= def.w; dx++) {
      for (let dy = -1; dy <= def.h; dy++) {
        const inside = dx >= 0 && dx < def.w && dy >= 0 && dy < def.h;
        if (inside) continue;
        if (dx !== -1 && dx !== def.w && dy !== -1 && dy !== def.h) continue;
        const tx = x + dx;
        const ty = y + dy;
        if (!U.inBounds(tx, ty)) continue;
        if (terrainAt(U.toIdx(tx, ty)) === t) return true;
      }
    }
    return false;
  }

  function hasFootprintTerrain(def, x, y, t) {
    for (let dx = 0; dx < def.w; dx++) {
      for (let dy = 0; dy < def.h; dy++) {
        if (terrainAt(U.toIdx(x + dx, y + dy)) === t) return true;
      }
    }
    return false;
  }

  // `minAmount` asks for a node holding a full load; -1 only when the radius
  // holds nothing of `res` at all (M1 — world.findResourceNear owns the rule).
  function findResourceNear(cx, cy, res, radius, minAmount) {
    const w = world();
    if (w && typeof w.findResourceNear === 'function') {
      const idx = w.findResourceNear(cx, cy, res, radius, minAmount);
      if (typeof idx === 'number') return idx;
    }
    return scanResource(cx, cy, res, radius, minAmount);
  }

  function scanResource(cx, cy, res, radius, minAmount, accept) {
    const w = world();
    if (!w || !w.resource) return -1;
    const need = minAmount > 1 ? minAmount : 1;
    let best = -1;
    let bestD = Infinity;
    let any = -1;
    let anyD = Infinity;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (!U.inBounds(x, y)) continue;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > radius) continue;
        const idx = U.toIdx(x, y);
        if (w.resource[idx] !== res) continue;
        const amt = w.amount ? w.amount[idx] : 1;
        if (amt <= 0) continue;
        if (accept && !accept(idx)) continue;
        if (amt >= need) { if (d < bestD) { best = idx; bestD = d; } }
        else if (d < anyD) { any = idx; anyD = d; }
      }
    }
    return best >= 0 ? best : any;
  }

  /* ---- U3: what a gathering site is worth ------------------------- *
   * §5 puts the real ceiling on a gathering hut in its regrowth, not in the
   * stock standing there today: one berry bush regrows 3 units/day, which is
   * 1.8 nutrition — less than the two foragers picking it eat, forever. So a
   * site is measured in units/day it supplies indefinitely, and a food def
   * declares the floor its own crew's keep sets (constants.js).
   * ------------------------------------------------------------------ */

  const worthScratch = { nodes: 0, stock: 0, perDay: 0 };
  const compScratch = [];

  /**
   * U3's floor asks whether a patch can keep a hut's own crew fed, and it read
   * the regrowth as if the candidate were alone on it — so nine Forager's Huts
   * could each pass the same test on the same berries, and did. Every standing
   * hut that reaches a tile takes a share of what it grows.
   */
  function competitorsFor(def) {
    const g = def.gathers;
    const out = compScratch;
    out.length = 0;
    if (!g) return out;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.removed) continue;
      const bg = b.def.gathers;
      if (!bg || bg.resource !== g.resource) continue;
      out.push(b);
    }
    return out;
  }

  /** How many huts, this one included, would be drawing on that tile. */
  function shareAt(comp, tx, ty) {
    let n = 1;
    for (let i = 0; i < comp.length; i++) {
      const b = comp[i];
      const r = b.def.gathers.radius;
      const dx = tx - (b.x + (b.w >> 1));
      const dy = ty - (b.y + (b.h >> 1));
      if (dx * dx + dy * dy <= r * r) n++;
    }
    return n;
  }

  /**
   * Census of `def.gathers.resource` inside the def's own radius. `stopPerDay`
   * ends the scan the moment the site has cleared that bar — placement only
   * asks yes or no, and it asks on every hovered tile.
   */
  function scanWorth(def, x, y, stopPerDay) {
    const g = def.gathers;
    const out = worthScratch;
    out.nodes = 0;
    out.stock = 0;
    out.perDay = 0;
    const w = world();
    if (!g || !w || !w.resource) return out;
    const info = RESOURCE_INFO[g.resource];
    const rate = info ? info.regrow : 0;
    const comp = competitorsFor(def);
    const radius = g.radius | 0;
    const cx = x + (def.w >> 1);
    const cy = y + (def.h >> 1);
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      const ty = cy + dy;
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const tx = cx + dx;
        if (!U.inBounds(tx, ty)) continue;
        const idx = U.toIdx(tx, ty);
        if (w.resource[idx] !== g.resource) continue;
        const amt = w.amount ? w.amount[idx] : 0;
        if (amt <= 0) continue;
        const share = shareAt(comp, tx, ty);
        out.nodes++;
        out.stock += amt / share;
        out.perDay += rate / share;
        if (stopPerDay > 0 && out.perDay >= stopPerDay) return out;
      }
    }
    return out;
  }

  /** True when the site cannot meet the def's declared minimum. */
  function worthShortfall(def, x, y) {
    const g = def.gathers;
    const min = g && g.minPerDay > 0 ? g.minPerDay : 0;
    if (min === 0) return false;
    return scanWorth(def, x, y, min).perDay < min;
  }

  function resourceName(res) {
    const info = RESOURCE_INFO[res];
    return ((info && info.name) || 'resource').toLowerCase();
  }

  function scanTerrain(cx, cy, terrain, radius, accept) {
    const w = world();
    if (!w || !w.terrain) return -1;
    let best = -1;
    let bestD = Infinity;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (!U.inBounds(x, y)) continue;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > radius || d >= bestD) continue;
        const idx = U.toIdx(x, y);
        if (w.terrain[idx] !== terrain) continue;
        if (buildingAt(idx) >= 0) continue;
        if (accept && !accept(idx)) continue;
        best = idx;
        bestD = d;
      }
    }
    return best;
  }

  function isWallTile(idx) {
    const id = buildingAt(idx);
    if (id < 0) return false;
    const b = byId.get(id);
    if (!b) return false;
    const d = b.def;
    return d.wall === true || d.gate === true;
  }

  /**
   * The single authority on whether a placement is legal, and the only writer
   * of `lastError`. A caller that gates on canPlace() and never reaches place()
   * would otherwise read a reason left behind by an unrelated earlier
   * placement — a razed town was told 'a road is already here' about a
   * Stockpile whose real problem was timber (R3).
   */
  function canPlace(defId, x, y) {
    const r = checkPlace(defId, x, y);
    self.lastError = r.ok ? '' : r.reason;
    return r;
  }

  function checkPlace(defId, x, y) {
    const def = BUILDING_BY_ID[defId];
    if (!def) return fail('unknown building');

    // 1. locked
    if (def.tier > economyTier()) return fail('locked');
    if (def.unique && countOf(def.id) > 0) return fail('locked');

    // 2. out of bounds
    if (!U.inBounds(x, y) || !U.inBounds(x + def.w - 1, y + def.h - 1)) return fail('out of bounds');

    const road = isRoadDef(def);
    const old = road ? null : upgradeTargetAt(def, x, y);

    // 3. blocked — every footprint tile must be free ground.
    //    Two documented exemptions so checks 5 and 8 stay reachable and so
    //    housing upgrades are possible at all: a valid upgrade target, and a
    //    wall tile (which check 8 reports with a far more useful message).
    if (road) {
      const idx = U.toIdx(x, y);
      if (!roadTileOk(def, idx)) {
        if (buildingAt(idx) >= 0) return fail('a building is there');
        if (roadAt(idx) !== C.ROAD_NONE) return fail('a road is already here');
        return fail(groundReason(terrainAt(idx)));
      }
    } else {
      for (let dx = 0; dx < def.w; dx++) {
        for (let dy = 0; dy < def.h; dy++) {
          const idx = U.toIdx(x + dx, y + dy);
          if (!terrainBuildableFor(def, terrainAt(idx))) return fail(groundReason(terrainAt(idx)));
          if (roadAt(idx) !== C.ROAD_NONE) return fail('a road is in the way');
          const occ = buildingAt(idx);
          if (occ >= 0) {
            if (isWallTile(idx)) continue;          // -> check 8
            if (old && occ === old.id) continue;    // -> housing upgrade
            return fail('a building is in the way');
          }
        }
      }
    }

    // 4. needs flat ground
    if (!road && (def.w > 1 || def.h > 1)) {
      const e0 = elevAt(U.toIdx(x, y));
      for (let dx = 0; dx < def.w; dx++) {
        for (let dy = 0; dy < def.h; dy++) {
          if (elevAt(U.toIdx(x + dx, y + dy)) !== e0) return fail('needs flat ground');
        }
      }
    }

    // 5. needs <terrain>
    if (def.needsTerrain) {
      const nt = def.needsTerrain;
      let ok;
      if (nt === 'shore') ok = hasAdjacentTerrain(def, x, y, TERRAIN.SHORE);
      else if (nt === 'water') ok = hasFootprintTerrain(def, x, y, TERRAIN.WATER) || hasFootprintTerrain(def, x, y, TERRAIN.SHORE);
      else if (nt === 'rock') ok = hasFootprintTerrain(def, x, y, TERRAIN.ROCK);
      else if (nt === 'meadow') ok = hasFootprintTerrain(def, x, y, TERRAIN.MEADOW);
      else ok = true;
      if (!ok) return fail('needs ' + nt);
    }

    // 6. no <resource> nearby, and U3's floor under it: a patch that cannot
    //    keep the hut's own workers fed is futile rather than illegal, so it
    //    gets its own reason instead of looking like an empty radius.
    if (def.needsResource) {
      const radius = def.gathers ? def.gathers.radius : 10;
      const cx = x + (def.w >> 1);
      const cy = y + (def.h >> 1);
      if (findResourceNear(cx, cy, def.needsResource, radius) < 0) {
        return fail('no ' + resourceName(def.needsResource) + ' nearby');
      }
      if (worthShortfall(def, x, y)) {
        return fail('not enough ' + resourceName(def.needsResource) + ' nearby');
      }
    }

    // 7. not enough <item> — a site only RESERVES its cost and hauliers will
    //    fetch it, so economy.available() is the right measure; a road is paid
    //    for outright inside place(), so it must be measured against what
    //    spend() can reach or place() would refuse what this just allowed (R3).
    const cost = costFor(def, old);
    for (const k in cost) {
      if ((road ? spendable(k) : available(k)) < cost[k]) {
        const it = ITEMS[k];
        return fail('not enough ' + ((it && it.name) || k).toLowerCase());
      }
    }

    // 8. too close to a wall
    if (!road) {
      for (let dx = 0; dx < def.w; dx++) {
        for (let dy = 0; dy < def.h; dy++) {
          if (isWallTile(U.toIdx(x + dx, y + dy))) return fail('too close to a wall');
        }
      }
    }

    // 9. would cut off the ground behind it (V3). Last of the checks because
    //    it is the only one that looks past the footprint, so a site that
    //    fails any cheaper check never pays for it.
    if (!road && def.solid === true && sealsOffPocket(def, x, y)) {
      return fail('would cut off the ground behind it');
    }

    return OK;
  }

  /* ---------------------------------------------------------------- *
   * Placement
   * ---------------------------------------------------------------- */

  const ROAD_PLACED = Object.freeze({ id: -1, road: true });

  function makeInstance(def, x, y, cost, old) {
    const b = {
      id: old ? old.id : nextId++,
      defId: def.id,
      def: def,
      x: x, y: y, w: def.w, h: def.h,
      built: false,
      progress: 0,
      cost: cost,
      delivered: Object.create(null),
      inv: old ? old.inv : Object.create(null),
      invCount: old ? old.invCount : 0,
      clsCount: old ? old.clsCount : Object.create(null),
      workers: old ? old.workers : [],
      active: old ? old.active : true,
      priority: old ? old.priority : 1,
      hp: def.hp || 100,
      maxHp: def.maxHp || def.hp || 100,
      workProgress: 0,
      sinceBuilder: 0,
      needsAnyBuilder: false,
      idleReason: 'under construction',
      connected: false,
      doorIdx: -1,
      level: old ? old.level + 1 : 1,
      producedTotal: old ? old.producedTotal : 0,
      lastProduced: 0,
      // --- extensions this module needs; all serialized ---
      solid: def.solid === true,
      recipeId: def.recipes && def.recipes.length ? def.recipes[0].id : '',
      batch: 0,
      gatherCarry: 0,
      // T3: units picked on the current circuit, keyed by worker id, waiting
      // to be reported at the door. Created on the first pick.
      gatherHeld: null,
      growMult: 1,
      targetIdx: -1,
      scanTimer: 0,
      doorGen: -1,
      // Upgrading in place keeps the same id, so every villager's homeId and
      // jobId stays valid and the residents are literally never evicted.
      upgrading: !!old,
      prevDefId: old ? old.defId : '',
      // Repair state. `repairing` mirrors `!!repair` and exists so the renderer
      // and the inspector can test it without reaching into the record;
      // setRepair() is the only writer of either.
      repair: null,
      repairing: false,
    };
    return b;
  }

  function computeGrowMult(b) {
    const def = b.def;
    if (!def.grows) { b.growMult = 1; return; }
    const w = world();
    let fert = 0;
    let farm = 0;
    let n = 0;
    forEachTile(b, (idx) => {
      fert += w && w.fertility ? w.fertility[idx] : 128;
      const ti = TERRAIN_INFO[terrainAt(idx)];
      farm += ti ? ti.farmMult : 1;
      n++;
    });
    if (n === 0) { b.growMult = 1; return; }
    // 0.5..1.5 from soil, times the terrain's own farm multiplier (§5).
    b.growMult = (farm / n) * (0.5 + (fert / n) / 255);
  }

  function place(defId, x, y) {
    const def = BUILDING_BY_ID[defId];
    if (!def) { self.lastError = 'unknown building'; return null; }
    if (!canPlace(defId, x, y).ok) return null;

    if (isRoadDef(def)) return placeRoadTile(def, x, y);

    const old = upgradeTargetAt(def, x, y);
    const cost = costFor(def, old);
    // The upgrade replaces the instance, so any repair running on it ends here
    // rather than being dropped along with the record it lives on.
    if (old && old.repair) endRepair(old, 'upgraded');
    if (old) releaseTiles(old);

    const b = makeInstance(def, x, y, cost, old);
    if (old) {
      const i = list.indexOf(old);
      if (i >= 0) U.removeSwap(list, i);
      if (old.def.storage) storesDirty = true;
    }
    list.push(b);
    byId.set(b.id, b);
    // A new building casts a vote in hubRegion() even when it moves no tile,
    // so the door stamp has to move for it (N2).
    roadGen++;
    claimTiles(b);
    // Y4a — the tiles are solid as of the line above, so anyone standing on
    // them is standing inside a wall. They walk off it (§1); villagers.js owns
    // how, and keeps their task, their load and where they were going.
    if (b.solid) {
      const v = game.villagers;
      if (v && typeof v.stepAside === 'function') v.stepAside(b.x, b.y, b.w, b.h);
    }
    computeGrowMult(b);
    b.doorIdx = computeDoor(b);
    b.doorGen = doorStamp();

    emit('building:placed', { id: b.id, defId: b.defId });

    // §16.2 tutorial grace: the first FREE_BUILDS sites finish instantly so a
    // new game can never stall with no one able to raise the Builder's Hut.
    // The cost is still paid — the grace is about labour, not materials.
    if (freeBuildsUsed < C.FREE_BUILDS && payNow(cost, x, y)) {
      freeBuildsUsed++;
      for (const k in cost) b.delivered[k] = cost[k];
      complete(b);
    }
    return b;
  }

  /**
   * Pay a cost outright. Returns false and puts everything back if the town
   * cannot actually cover it — economy.available() is a per-tick cache, so a
   * 20-tile road drag would otherwise outrun it and overspend.
   */
  function payNow(cost, x, y) {
    const taken = Object.create(null);
    let short = false;
    for (const k in cost) {
      const got = spend(k, cost[k]);
      taken[k] = got;
      if (got < cost[k]) { short = true; break; }
    }
    if (!short) return true;
    for (const k in taken) if (taken[k] > 0) deposit(k, taken[k], x, y);
    return false;
  }

  function placeRoadTile(def, x, y) {
    const idx = U.toIdx(x, y);
    const w = world();
    if (!payNow(def.cost || EMPTY, x, y)) { self.lastError = 'not enough materials'; return null; }
    if (terrainAt(idx) === TERRAIN.FOREST && w && typeof w.clearForest === 'function') {
      w.clearForest(idx);
    }
    // world.setRoad, not a bare array write: it bumps world.rev, which is
    // render.js's only ground-cache invalidation signal (a direct write leaves
    // the new road invisible until something else happens to bump it).
    if (w && typeof w.setRoad === 'function') w.setRoad(idx, def.road);
    else if (w && w.road) w.road[idx] = def.road;
    notifyRoadChanged(idx);
    return ROAD_PLACED;
  }

  /** Drag placement (§12). Places as many of `tileList` as are legal/affordable. */
  function placeMany(defId, tileList) {
    const res = { placed: 0, failed: 0, reason: '' };
    if (!tileList || !tileList.length) return res;
    for (let i = 0; i < tileList.length; i++) {
      const t = tileList[i];
      const x = typeof t === 'number' ? U.toX(t) : t.x;
      const y = typeof t === 'number' ? U.toY(t) : t.y;
      const b = place(defId, x, y);
      if (b) res.placed++;
      else {
        res.failed++;
        if (!res.reason) res.reason = self.lastError;
      }
    }
    return res;
  }

  /** Roads are removable for no refund (§6). Doubles as the forest-clear tool. */
  function removeRoad(idx) {
    const w = world();
    if (!w || !w.road || w.road[idx] === C.ROAD_NONE) return false;
    if (typeof w.setRoad === 'function') w.setRoad(idx, C.ROAD_NONE);
    else w.road[idx] = C.ROAD_NONE;
    notifyRoadChanged(idx);
    return true;
  }

  /* ---------------------------------------------------------------- *
   * Construction
   * ---------------------------------------------------------------- */

  function deliveredComplete(b) {
    for (const k in b.cost) {
      if ((b.delivered[k] || 0) < b.cost[k]) return false;
    }
    return true;
  }

  /**
   * Add builder work. Called by villagers.js for each builder present at the
   * site; `unemployed` builders work at UNEMPLOYED_BUILD_RATE (§16.3).
   * Returns the builder-seconds actually added.
   */
  function applyBuilder(b, dt, unemployed) {
    if (!b) return 0;
    // A repair is builder work on a building that is already standing, so it
    // comes through the same door — and deliberately ignores `active`: pausing
    // a workshop stops its production, not the timber the player already
    // committed to putting back into its roof.
    if (b.built) return applyRepair(b, dt, unemployed);
    if (!b.active) return 0;
    if (!deliveredComplete(b)) return 0;
    b.sinceBuilder = 0;
    b.needsAnyBuilder = false;
    const rate = unemployed ? C.UNEMPLOYED_BUILD_RATE : C.BUILD_RATE;
    const gained = dt * rate * healthFactorNow();
    b.progress += gained;
    if (b.progress >= b.def.buildTime) complete(b);
    return gained;
  }

  function healthFactorNow() {
    return 0.5 + 0.5 * (U.clamp(townHealth(), 0, 100) / 100);
  }

  /**
   * ADDENDUM G2.3: a town can never be unable to finish a building it has
   * already paid for. Once a fully-supplied site has gone SITE_STALL_SECONDS
   * without a builder, villagers.js may send anyone whose own workplace is
   * idle (`b.idleReason !== ''`), working at UNEMPLOYED_BUILD_RATE.
   */
  function siteNeedsAnyBuilder(b) {
    return !!b && !b.built && b.active && b.sinceBuilder >= SITE_STALL_SECONDS
      && deliveredComplete(b);
  }

  function complete(b) {
    b.built = true;
    b.progress = b.def.buildTime;
    // Delivered materials are consumed — they are the building now. The
    // matching drop in reservedOf() already happened as each unit landed.
    b.delivered = Object.create(null);
    b.upgrading = false;
    b.prevDefId = '';
    b.idleReason = '';
    b.hp = b.maxHp;
    if (b.def.storage) storesDirty = true;
    if (b.def.gate) forEachTile(b, (idx) => setGateTile(idx, true));
    b.doorIdx = computeDoor(b);
    b.doorGen = doorStamp();
    emit('building:completed', { id: b.id, defId: b.defId });
  }

  /**
   * Player cancel / demolish. §16.4: nothing is destroyed by a cancel — every
   * delivered unit and every stored unit goes back into the town.
   *
   * `forced` is §16.10's recovery only (Y4b). The player who chose this was
   * warned that the timber is gone; the player who did not choose it was not.
   */
  function demolish(id, forced) {
    const b = byId.get(id);
    if (!b) return false;
    const garrison = garrisonIds(b);
    // Detach first: a storage building must be out of the storages list before
    // it tries to refund into itself.
    detach(b);
    const refunded = refundAll(b, forced === true);
    emit('building:destroyed', {
      id: b.id, defId: b.defId, x: b.x, y: b.y, byRaid: false, refunded,
    });
    clearGarrison(garrison, false);
    return true;
  }

  /**
   * Y4b — `withCost` is the §16.10 recovery and nothing else. A finished
   * building's `delivered` is empty, because the materials ARE the building,
   * so without this a demolition the town imposed on itself would quietly
   * charge the player its full build cost. `b.cost` is exactly what was
   * consumed at complete(), so `b.cost` is exactly what comes back — once, and
   * only for something that finished, or an unfinished site would be refunded
   * its delivered pile and its price both.
   *
   * Returns the units put back that were not already in the world, so the
   * caller can report them; delivered and inv are moves, not new matter.
   */
  function refundAll(b, withCost) {
    // A repair the player demolishes out from under gives its undelivered
    // reservation back by simply ending, and its delivered pile back intact —
    // the same §7.5 rule a cancelled construction site follows.
    if (b.repair) endRepair(b, 'demolished');
    for (const k in b.delivered) {
      const n = b.delivered[k];
      if (n > 0) deposit(k, n, b.x, b.y, b);
      b.delivered[k] = 0;
    }
    for (const k in b.inv) {
      const n = b.inv[k];
      if (n > 0) {
        take(b, k, n);
        deposit(k, n, b.x, b.y, b);
      }
    }
    if (!withCost || !b.built) return null;
    let back = null;
    for (const k in b.cost) {
      const n = b.cost[k];
      if (!(n > 0)) continue;
      deposit(k, n, b.x, b.y, b);
      if (!back) back = Object.create(null);
      back[k] = n;
    }
    return back;
  }

  /**
   * ADDENDUM H6: a garrison must not outlive its building. Left alone the men
   * stay alive with a jobId pointing at rubble and silently vanish from
   * military's roster. A raid kills them; the player's own demolition only
   * turns them out. Call with the ids captured BEFORE detach() empties them.
   */
  function clearGarrison(ids, byRaid) {
    if (!ids || ids.length === 0) return;
    const v = game.villagers;
    if (!v) return;
    for (let i = 0; i < ids.length; i++) {
      if (byRaid) {
        if (typeof v.kill === 'function') v.kill(ids[i], 'raid');
      } else if (typeof v.loseJob === 'function') {
        const ag = typeof v.get === 'function' ? v.get(ids[i]) : null;
        if (ag && !ag.dead) v.loseJob(ag);
      }
    }
  }

  /** Guard Tower, Barracks and Keep: the defs whose workers are a garrison. */
  function garrisonIds(b) {
    return b.def.role === 'soldier' && b.workers.length ? b.workers.slice() : null;
  }

  /** Remove from the world and all indices, without emitting or refunding. */
  function detach(b) {
    releaseTiles(b);
    const i = list.indexOf(b);
    if (i >= 0) U.removeSwap(list, i);
    byId.delete(b.id);
    roadGen++;
    if (b.def.storage) storesDirty = true;
    b.workers.length = 0;
  }

  function damage(id, amount, byRaid) {
    const b = byId.get(id);
    if (!b || !(amount > 0)) return false;
    b.hp -= amount;
    emit('building:damaged', { id: b.id, amount: amount, x: b.x, y: b.y });
    if (b.hp > 0) return false;
    b.hp = 0;
    const garrison = garrisonIds(b);
    detach(b);
    // §10.5: half the inventory is dropped as loot the raiders carry off. The
    // other half is salvaged out of the wreck rather than silently deleted,
    // which is the only reading consistent with §16.4's "nothing vanishes".
    for (const k in b.inv) {
      const n = b.inv[k];
      if (n <= 0) continue;
      const looted = n - Math.floor(n / 2);
      take(b, k, looted);
      const salvage = take(b, k, n - looted);
      if (salvage > 0) deposit(k, salvage, b.x, b.y, b);
    }
    for (const k in b.delivered) {
      const n = b.delivered[k];
      if (n <= 0) continue;
      const salvage = Math.floor(n / 2);
      b.delivered[k] = 0;
      if (salvage > 0) deposit(k, salvage, b.x, b.y, b);
    }
    // A repair dies with its building: the undelivered reservation is released
    // by dropping the record, and the pile already on the doorstep takes the
    // same half-looted, half-salvaged split as a site's (§10.5).
    if (b.repair) endRepair(b, 'wrecked');
    const raid = byRaid === undefined ? true : !!byRaid;
    emit('building:destroyed', {
      id: b.id, defId: b.defId, x: b.x, y: b.y,
      byRaid: raid,
    });
    clearGarrison(garrison, raid);
    return true;
  }

  function repair(id, amount) {
    const b = byId.get(id);
    if (!b) return 0;
    const before = b.hp;
    b.hp = U.clamp(b.hp + amount, 0, b.maxHp);
    return b.hp - before;
  }

  /* ---------------------------------------------------------------- *
   * Repair (player-initiated; §10.5 leaves the damage, this undoes it)
   *
   * A repair is deliberately the same machine as a construction site, one
   * level down: it RESERVES its cost out of `available()`, hauliers deliver
   * through the ordinary task queue into `b.repair.delivered`, and builders
   * turn those materials into structure through applyBuilder(). There is no
   * second materials pipeline, and there is no moment at which a unit is
   * anywhere but in a store, in a haulier's hands, reserved, or spent.
   *
   * The building stays BUILT and OPERATIONAL throughout — a raid must cost the
   * player materials, not a second collapse of their economy.
   * ---------------------------------------------------------------- */

  /** The only writer of b.repair / b.repairing, so the two cannot drift. */
  function setRepair(b, r) {
    b.repair = r;
    b.repairing = !!r;
  }

  /** 0..1 of maxHp missing. 0 for a building at full health or with no maxHp. */
  function missingFraction(b) {
    if (!b || !(b.maxHp > 0)) return 0;
    const missing = b.maxHp - b.hp;
    return missing > 0 ? missing / b.maxHp : 0;
  }

  /** The costliest single item in a def's cost, by ITEMS[].value. */
  function dearestCostItem(cost) {
    let best = '';
    let bestVal = -1;
    for (const k in cost) {
      if (!(cost[k] > 0)) continue;
      const it = ITEMS[k];
      const v = it && typeof it.value === 'number' ? it.value : 0;
      if (v > bestVal) { bestVal = v; best = k; }
    }
    return best;
  }

  /**
   * §Repair.2 — pro-rata on missing hp at REPAIR_COST_FACTOR, never above the
   * full build cost, never free. Pure: safe for the renderer to call per frame.
   * Returns null when there is nothing to quote.
   */
  function quoteRepair(b) {
    if (!b || !b.built || b.removed || b.repair) return null;
    const m = missingFraction(b);
    if (m <= 0) return null;
    const src = b.cost && Object.keys(b.cost).length ? b.cost : (b.def.cost || EMPTY);
    const out = Object.create(null);
    let any = false;
    for (const k in src) {
      const full = src[k];
      if (!(full > 0)) continue;
      let n = Math.ceil(m * full * REPAIR_COST_FACTOR);
      if (n > full) n = full;
      if (n > 0) { out[k] = n; any = true; }
    }
    // A damaged building is never repaired for nothing. Only reachable if every
    // line rounded away, which needs a def whose cost is all fractional or zero.
    if (!any) {
      const dear = dearestCostItem(src);
      if (dear) out[dear] = 1;
    }
    return out;   // {} only for a def that costs nothing to build
  }

  /** Public, read-only: what a NEW repair of `id` would cost, or null. */
  function repairCost(id) {
    return quoteRepair(byId.get(id));
  }

  /** Builder-seconds a repair of this size is worth. */
  function repairWorkFor(b, m) {
    const w = (b.def.buildTime || 0) * m * REPAIR_WORK_FACTOR;
    return w > REPAIR_MIN_WORK ? w : REPAIR_MIN_WORK;
  }

  /**
   * Commit to a repair. Returns false if the building is gone, unbuilt, already
   * repairing, undamaged, or the town cannot cover the cost out of stock that
   * is not already promised to something else.
   *
   * Everything the repair will ever cost is fixed here (§Repair.3): a later
   * raid that damages the building further does not re-price it, and the repair
   * still finishes at full maxHp.
   */
  function beginRepair(id) {
    const b = byId.get(id);
    if (!b || !b.built || b.removed) return false;
    if (b.repair) return false;
    const m = missingFraction(b);
    if (m <= 0) return false;
    const cost = quoteRepair(b);
    if (!cost) return false;
    // available() counts the building's own inventory, and the repair can reach
    // every unit of it: drawRepairFromOwn() below moves it straight into the
    // pile without a haul. So the quote and what can actually arrive agree.
    for (const k in cost) {
      if (available(k) < cost[k]) { self.lastError = 'not enough materials'; return false; }
    }
    setRepair(b, {
      cost: cost,
      delivered: Object.create(null),
      used: Object.create(null),
      work: 0,
      workNeeded: repairWorkFor(b, m),
      // Locked at begin: the hp this repair is paid to restore. Damage taken
      // mid-repair is not re-charged, and completion still lifts hp to maxHp.
      hpMissing: b.maxHp - b.hp,
      granted: 0,
      sinceBuilder: 0,
    });
    // Before anything is told a haul is owed: whatever of the cost is already
    // inside is already delivered.
    drawRepairFromOwn(b);
    emit('building:repairing', {
      id: b.id, defId: b.defId, x: b.x, y: b.y, cost: copyCounts(cost),
    });
    return true;
  }

  /**
   * Retire a repair, whatever ended it.
   *
   * `'cancelled'` / `'upgraded'` / `'demolished'` put the undelivered
   * reservation back simply by dropping it — those units never left their
   * store, which is exactly what economy's own task cancellation does — and
   * return the delivered-but-unconsumed pile to the town through deposit(),
   * the §7.5 / §16.4 rule a cancelled construction site already follows.
   * Materials the repair has already turned into structure stay spent.
   *
   * `'wrecked'` is §10.5: half the undelivered-into-structure pile is carried
   * off by the raiders and half is salvaged, the same split damage() applies to
   * a site's `delivered`.
   */
  function endRepair(b, reason) {
    const r = b.repair;
    if (!r) return null;
    setRepair(b, null);
    const consumed = copyCounts(r.used);
    const returned = Object.create(null);
    const lost = Object.create(null);
    for (const k in r.delivered) {
      const n = repairOnHand(r, k);
      r.used[k] = r.delivered[k] || 0;    // nothing is left standing at the door
      if (!(n > 0)) continue;
      if (reason === 'wrecked') {
        const salvage = Math.floor(n / 2);
        lost[k] = n - salvage;
        if (salvage > 0) { returned[k] = salvage; deposit(k, salvage, b.x, b.y, b); }
      } else {
        returned[k] = n;
        deposit(k, n, b.x, b.y, b);
      }
    }
    // `consumed` is what the repair turned into structure before it ended —
    // read BEFORE the line above, which folds the returned pile into `used` so
    // nothing is double-counted if the record is read again.
    return { returned: returned, consumed: consumed, lost: lost };
  }

  /** Player cancel. Returns false if nothing was repairing. */
  function cancelRepair(id) {
    const b = byId.get(id);
    if (!b || !b.repair) return false;
    const defId = b.defId;
    const res = endRepair(b, 'cancelled');
    emit('building:repaircancelled', {
      id: b.id, defId: defId, x: b.x, y: b.y,
      returned: res.returned, consumed: res.consumed,
    });
    return true;
  }

  /**
   * A repairing building supplies its own repair out of its own inventory:
   * matter already inside the building is already at the door and there is
   * nothing to haul.
   *
   * This is what makes a repair on a store finishable at all. economy's source
   * search refuses to haul from a destination to itself, so a cost item that
   * exists only inside the building being repaired can never be posted as a
   * task — and the Town Centre, Granary, Stockpile, Warehouse and Armoury ARE
   * the town's stores, so that is the ordinary case. A repair left unsuppliable
   * is a permanent reservation of materials the player already paid for, which
   * §16 / G2.3 forbid.
   *
   * Conserving: take() removes exactly what `delivered` gains and `used` is
   * untouched, so the pile at the door grows by what the inventory loses.
   * stockOf() falls and reservedOf() falls by the same amount, leaving
   * available() unmoved — identical to a haulier walking the units in.
   */
  function drawRepairFromOwn(b) {
    const r = b.repair;
    if (!r || !b.built) return;
    for (const k in r.cost) {
      const need = repairShortfall(b, k);
      if (need <= 0) continue;
      const n = take(b, k, need);
      if (n > 0) r.delivered[k] = (r.delivered[k] || 0) + n;
    }
  }

  /** Every repair material is in — builders may start (mirrors deliveredComplete). */
  function repairSupplied(b) {
    const r = b.repair;
    if (!r) return false;
    for (const k in r.cost) {
      if ((r.delivered[k] || 0) < r.cost[k]) return false;
    }
    return true;
  }

  /**
   * Turn builder-seconds into structure. Materials are consumed in lockstep
   * with the work — `delivered` always holds exactly the part of the pile that
   * has not yet become wall — so a cancel can neither refund what is already
   * built nor destroy what is not.
   */
  function applyRepair(b, dt, unemployed) {
    const r = b.repair;
    if (!r || !b.built || !repairSupplied(b)) return 0;
    r.sinceBuilder = 0;
    const rate = unemployed ? C.UNEMPLOYED_BUILD_RATE : C.BUILD_RATE;
    const gained = dt * rate * healthFactorNow();
    if (!(gained > 0)) return 0;
    r.work += gained;
    if (r.work >= r.workNeeded) { finishRepair(b); return gained; }

    const frac = r.work / r.workNeeded;
    // hp is granted as a delta, so damage taken mid-repair lowers the running
    // total honestly instead of being silently healed back.
    const want = r.hpMissing * frac;
    const step = want - r.granted;
    if (step > 0) {
      r.granted = want;
      b.hp = U.clamp(b.hp + step, 0, b.maxHp);
    }
    // Draw the pile down to match. floor() keeps it integral and monotone, and
    // it can never outrun what has actually arrived.
    for (const k in r.cost) {
      let used = Math.floor(r.cost[k] * frac);
      const landed = r.delivered[k] || 0;
      if (used > landed) used = landed;
      if (used > (r.used[k] || 0)) r.used[k] = used;
    }
    return gained;
  }

  function finishRepair(b) {
    const r = b.repair;
    setRepair(b, null);
    // Every delivered unit is now structure: consumed, not deposited. The
    // matching drop in reservedOf() happened as each unit landed.
    for (const k in r.cost) r.used[k] = r.delivered[k] || 0;
    b.hp = b.maxHp;
    emit('building:repaired', {
      id: b.id, defId: b.defId, x: b.x, y: b.y, cost: copyCounts(r.cost),
    });
  }

  /**
   * G2.3's guarantee, one level down: a town can never be left unable to finish
   * a repair it has already paid for. Once a fully-supplied repair has gone
   * SITE_STALL_SECONDS without a builder it advances on its own at the
   * unemployed rate.
   *
   * This exists because villagers.js's builder search is confined to `!b.built`
   * instances, so until that module is taught about repairs NO builder can
   * reach one — and a repair that can never finish is a permanent reservation
   * of materials the player paid for. See the handoff: once villagers.js sends
   * builders here, this only covers the stalls it already covers for sites.
   */
  function tickRepair(b, dt) {
    const r = b.repair;
    if (!r) return;
    // Stock can land in the building after the repair began — a Stockpile can
    // be sent the very stone its repair is short of — so it is claimed every
    // tick, not only at begin.
    drawRepairFromOwn(b);
    if (!repairSupplied(b)) { r.sinceBuilder = 0; return; }
    r.sinceBuilder += dt;
    if (r.sinceBuilder < SITE_STALL_SECONDS) return;
    // applyRepair zeroes the stall clock, which is right when a real builder is
    // standing there and wrong here: left alone it would re-arm the ten-second
    // wait after every untended tick, so the repair would crawl at dt/10 rate.
    const held = r.sinceBuilder;
    applyRepair(b, dt, true);
    if (b.repair === r) r.sinceBuilder = held;
  }

  function repairNeedsBuilder(b) {
    return !!b && !!b.repair && b.built && repairSupplied(b);
  }

  /** Built buildings below full health that nobody is repairing. Allocates. */
  function damagedIds(out) {
    const o = out || [];
    o.length = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.built && !b.repair && b.hp < b.maxHp) o.push(b.id);
    }
    return o;
  }

  /** Ids with a repair in progress. Allocates. */
  function repairingIds(out) {
    const o = out || [];
    o.length = 0;
    for (let i = 0; i < list.length; i++) if (list[i].repair) o.push(list[i].id);
    return o;
  }

  /**
   * Read-only view of a live repair, for the inspector and the renderer.
   * Null when nothing is repairing. Allocates a fresh object per call and
   * mutates nothing — this module has been bitten once by an accessor that
   * lazily wrote the state it was asked to describe.
   */
  function repairState(id) {
    const b = byId.get(id);
    const r = b && b.repair;
    if (!r) return null;
    let owed = 0;
    let total = 0;
    for (const k in r.cost) {
      total += r.cost[k];
      owed += repairShortfall(b, k);
    }
    const supplied = total > 0 ? (total - owed) / total : 1;
    const work = r.workNeeded > 0 ? U.clamp(r.work / r.workNeeded, 0, 1) : 1;
    const onHand = Object.create(null);
    for (const k in r.cost) {
      const n = repairOnHand(r, k);
      if (n > 0) onHand[k] = n;
    }
    return {
      cost: copyCounts(r.cost),
      delivered: copyCounts(r.delivered),   // cumulative: what has ever arrived
      onHand: onHand,                       // of that, what is not yet wall
      consumed: copyCounts(r.used),
      shortfall: owed,
      supplied: supplied,
      work: work,
      // Half the bar is getting the materials there, half is raising them.
      progress: supplied * 0.5 + work * 0.5,
      phase: owed > 0 ? 'hauling' : 'building',
      // Can a haulier get here at all? A building with no road-adjacent tile
      // has no anchor for the task queue's region test, so its materials will
      // never be posted — true of every unroaded wall. Cached fields only: the
      // door is recomputed by update(), never by a reader.
      deliverable: b.doorIdx >= 0 && b.connected,
      hp: b.hp,
      maxHp: b.maxHp,
    };
  }

  /* ---------------------------------------------------------------- *
   * Workers
   * ---------------------------------------------------------------- */

  function openJobs(b) {
    return (b.def.jobs || 0) - b.workers.length;
  }

  /**
   * M3 — is there a tile a worker can actually walk to and stand on? Two ways
   * to fail: no road touches the footprint at all (`doorIdx` is -1, reported
   * as `'no road'`), or the door is real but walled off from the rest of the
   * town (reported as `'cut off'` — a different question with a different
   * remedy, N2). A wall or gate is a barrier rather than a workplace and is
   * exempt. A building that fails this employs nobody: workers sent to a door
   * they cannot reach walk at it forever while the building reports itself
   * busy.
   */
  function hasDoor(b) {
    if (!b) return false;
    if (b.def.wall || b.def.gate) return true;
    // A caller between a road change and the next update() would otherwise read
    // a stale door and be refused with no reason surfaced (assignWorker did
    // exactly that, leaving 'no workers' on a building the player just roaded).
    if (b.doorGen !== doorStamp()) {
      b.doorIdx = computeDoor(b);
      b.doorGen = doorStamp();
    }
    if (b.doorIdx < 0) return false;
    const p = game.paths;
    if (!p || typeof p.regionOf !== 'function') return true;
    const hub = hubRegion();
    if (hub < 0) return true;
    return p.regionOf(b.doorIdx) === hub;
  }

  // Scratch for cutOffCause()'s search. Two frontiers, because the walk is a
  // 0-1 search: a step inside the pocket is free, a step through a blocked
  // tile costs one, and the cheapest route to the town names the fewest
  // buildings to pull down.
  const CUTOFF_MAX_BLOCKERS = 4;
  let pocketSeen = null;
  let pocketBlocker = null;
  let pocketCur = null;
  let pocketNext = null;

  /**
   * U4 — why a `'cut off'` building is cut off, so the player is told a repair
   * they have not already made. Measured on 4 of 6 arc seeds, the seal is the
   * town's own solid buildings: §6 forbids cutting a diagonal between two
   * blocked tiles, so two huts placed corner to corner against the valley wall
   * close a pocket that no amount of road reopens. `'cut off'` is truthful
   * there; the `'no road'` remedy is not, and naming the building to pull down
   * is the only fix the player can actually perform (§16.8).
   *
   * Returns `{ kind, id, x, y }` — `'building'` with the id to demolish,
   * `'ground'` when only terrain stands between the two halves of the town, or
   * `''` when the building is not cut off or nothing within reach explains it.
   */
  function cutOffCause(b) {
    const NONE = { kind: '', id: -1, x: 0, y: 0 };
    if (!b || b.doorIdx < 0 || hasDoor(b)) return NONE;
    const w = world();
    const p = game.paths;
    if (!w || typeof w.isWalkable !== 'function' || !p || typeof p.regionOf !== 'function') return NONE;
    const hub = hubRegion();
    if (hub < 0) return NONE;
    const n = C.GRID_W * C.GRID_H;
    if (!pocketSeen) {
      pocketSeen = new Uint8Array(n);
      pocketBlocker = new Int32Array(n);
      pocketCur = new Int32Array(n);
      pocketNext = new Int32Array(n);
    } else pocketSeen.fill(0);
    let cur = pocketCur;
    let next = pocketNext;
    let curLen = 0;
    let nextLen = 0;
    let head = 0;
    cur[curLen++] = b.doorIdx;
    pocketSeen[b.doorIdx] = 1;
    pocketBlocker[b.doorIdx] = -1;
    let ground = NONE;
    for (let layer = 0; layer <= CUTOFF_MAX_BLOCKERS; layer++) {
      while (head < curLen) {
        const idx = cur[head++];
        const cx = idx % C.GRID_W;
        const cy = (idx / C.GRID_W) | 0;
        const from = pocketBlocker[idx];
        for (let d = 0; d < 8; d++) {
          const nx = cx + C.DIR_DX[d];
          const ny = cy + C.DIR_DY[d];
          if (!U.inBounds(nx, ny)) continue;
          const ni = U.toIdx(nx, ny);
          if (pocketSeen[ni]) continue;
          if (w.isWalkable(ni)) {
            if (p.regionOf(ni) === hub) {
              if (from >= 0) {
                const owner = byId.get(from);
                if (owner) return { kind: 'building', id: owner.id, x: owner.x, y: owner.y };
              }
              if (ground.kind === '') ground = { kind: 'ground', id: -1, x: nx, y: ny };
              continue;
            }
            // Free step: still inside the half of the town that is cut off.
            pocketSeen[ni] = 1;
            pocketBlocker[ni] = from;
            cur[curLen++] = ni;
            continue;
          }
          if (layer === CUTOFF_MAX_BLOCKERS) continue;
          pocketSeen[ni] = 1;
          const occ = buildingAt(ni);
          const owner = occ >= 0 ? byId.get(occ) : null;
          pocketBlocker[ni] = from >= 0 ? from : (owner && owner !== b ? owner.id : -1);
          next[nextLen++] = ni;
        }
      }
      const swap = cur; cur = next; next = swap;
      curLen = nextLen;
      nextLen = 0;
      head = 0;
    }
    return ground;
  }

  /* ---------------------------------------------------------------- *
   * V3 — sealing a pocket, and freeing whoever is already in one
   * ---------------------------------------------------------------- */

  // Pocket membership is stamped rather than searched: a pocket is a handful
  // of tiles and the villager roll is long, so "is anyone in there" becomes one
  // array read per villager.
  let pocketMark = null;
  let pocketSide = null;
  let pocketMarkGen = 0;
  const pocketInside = [];
  const pocketWeight = [];

  /** `ends[s]` is the exclusive end of pocket s in `tiles` (paths.js's shape). */
  function markPocket(tiles, count, ends) {
    if (!pocketMark) {
      pocketMark = new Int32Array(C.GRID_W * C.GRID_H);
      pocketSide = new Uint8Array(C.GRID_W * C.GRID_H);
    }
    if (++pocketMarkGen >= 0x3fffffff) { pocketMark.fill(0); pocketMarkGen = 1; }
    let s = 0;
    for (let i = 0; i < count; i++) {
      while (s < ends.length - 1 && i >= ends[s]) s++;
      pocketMark[tiles[i]] = pocketMarkGen;
      pocketSide[tiles[i]] = s;
    }
    return pocketMarkGen;
  }

  /**
   * V3 — would this site seal a piece of the valley off from the town with
   * villagers or buildings left inside it? A player must not be able to brick
   * their town with a cottage.
   *
   * Walling the town in is NOT this, so the sides are weighed rather than the
   * smaller one condemned: the town is the side holding the most heads and
   * doors, and a player ringing it in palisade already has the Gate as the
   * remedy (H1 — a gate is villager-passable, so a gated ring seals nothing at
   * all and never reaches this check).
   *
   * One footprint can close several sides at once, and each is weighed on its
   * own: summed, an empty crevice would outvote the yard of villagers sealed
   * beside it.
   */
  function sealsOffPocket(def, x, y) {
    const p = game.paths;
    if (!p || typeof p.pocketIfSealed !== 'function') return false;
    const pocket = p.pocketIfSealed(x, y, def.w, def.h);
    if (!pocket) return false;
    const ends = pocket.sides || [pocket.count];
    const gen = markPocket(pocket.tiles, pocket.count, ends);
    pocketInside.length = ends.length;
    pocketWeight.length = ends.length;
    for (let i = 0; i < ends.length; i++) { pocketInside[i] = 0; pocketWeight[i] = 0; }
    // Which side is the town is settled by heads and doors together, with the
    // Town Centre weighted as hubRegion() weights it — otherwise this check and
    // the hub vote can disagree, and the loser's buildings go 'cut off' while
    // this check calls the split harmless.
    let totalWeight = 0;
    const v = game.villagers;
    if (v && v.list && typeof v.tileOf === 'function') {
      for (let i = 0; i < v.list.length; i++) {
        const a = v.list[i];
        if (!a || a.dead || a.removed) continue;
        const t = v.tileOf(a);
        if (t < 0) continue;
        totalWeight++;
        if (pocketMark[t] !== gen) continue;
        pocketInside[pocketSide[t]]++;
        pocketWeight[pocketSide[t]]++;
      }
    }
    // A wall or a gate is a barrier, not a workplace, and has nothing to lose.
    const hub = hubRegion();
    const tc = townCentre();
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.removed || b.def.wall || b.def.gate) continue;
      const weight = b === tc ? 1.5 : 1;
      totalWeight += weight;
      const s = buildingPocketSide(b, gen, x, y, def.w, def.h, hub);
      if (s < 0) continue;
      pocketInside[s]++;
      pocketWeight[s] += weight;
    }
    for (let i = 0; i < ends.length; i++) {
      if (pocketInside[i] > 0 && pocketWeight[i] <= totalWeight - pocketWeight[i]) return true;
    }
    return false;
  }

  /**
   * Which sealed side a building falls in: one it touches, when the placement
   * leaves it no tile that still reaches the town. -1 otherwise.
   *
   * `doorIdx` is not enough. A hut with no road yet has no door, so counting
   * doors lets a pocket be sealed around it for free — and the first road the
   * player lays inside mints a `'cut off'` building that no sweep will ever
   * free, because no villager is trapped with it.
   *
   * Nor is "every tile it touches is in the pocket". A hut can also touch
   * ground that was cut off long before this placement — the tile beyond a
   * corner §6 will not let a villager cut. That ground is no way home either,
   * so only a tile still in the town's own region counts as one.
   */
  function buildingPocketSide(b, gen, fx, fy, fw, fh, hub) {
    const w = world();
    const p = game.paths;
    if (!w || typeof w.isWalkable !== 'function') return -1;
    const canRegion = hub >= 0 && p && typeof p.regionOf === 'function';
    let touching = 0, inside = 0, free = 0, side = -1;
    let roads = 0, roadIn = 0, roadFree = 0, roadSide = -1;
    const look = (x, y) => {
      // Tiles the new footprint is about to claim are not a way out of anywhere.
      if (x >= fx && y >= fy && x < fx + fw && y < fy + fh) return;
      const idx = w.tileAt(x, y);
      if (idx < 0 || !w.isWalkable(idx)) return;
      const road = roadAt(idx) !== C.ROAD_NONE;
      touching++;
      if (road) roads++;
      if (pocketMark[idx] === gen) {
        inside++;
        if (side < 0) side = pocketSide[idx];
        if (road) { roadIn++; if (roadSide < 0) roadSide = pocketSide[idx]; }
      } else if (!canRegion || p.regionOf(idx) === hub) {
        free++;
        if (road) roadFree++;
      }
    };
    for (let ox = 0; ox < b.w; ox++) { look(b.x + ox, b.y - 1); look(b.x + ox, b.y + b.h); }
    for (let oy = 0; oy < b.h; oy++) { look(b.x - 1, b.y + oy); look(b.x + b.w, b.y + oy); }
    // A building is reached at its door, so its ROAD frontage is what it stands
    // to lose: computeDoor() can only pick from that, and a building whose last
    // road tile ends up in the pocket draws its door there and goes 'cut off'
    // even though a villager could still stand on the grass beside it.
    if (roads > 0) return roadIn > 0 && roadFree === 0 ? roadSide : -1;
    return touching > 0 && inside > 0 && free === 0 ? side : -1;
  }

  /**
   * §16 / V3 part 2 — a villager already sealed into a pocket. He cannot path
   * out, there is no route to path along, he never eats and he holds his job
   * slot for the rest of the game. Nothing else in the sim frees him, and a
   * save written before the placement check above will contain him.
   *
   * The remedy is the one a walled-in man actually has: pull down the wall.
   * The town tears out the single cheapest building that seals the pocket and
   * the villagers then WALK out on their own feet — nothing is moved by fiat
   * (§1). It costs the player that building, which is why the cheapest thing
   * that opens the way is chosen and why an unfinished site (whose materials
   * come back whole, §16.4) is preferred to anything standing. The Town Centre
   * is never the one pulled down, and at most FREE_MAX_PER_SWEEP go per sweep,
   * so a bad reading cannot cascade.
   */
  const FREE_MAX_PER_SWEEP = 3;
  let needsPocketSweep = false;
  const strandRegion = [];
  const strandTile = [];
  const strandFolk = [];

  function freeStranded() {
    const v = game.villagers;
    const p = game.paths;
    const w = world();
    if (!v || !v.list || !w || !p || typeof p.regionOf !== 'function') return 0;
    if (typeof v.tileOf !== 'function' || typeof w.isWalkable !== 'function') return 0;
    const hub = hubRegion();
    if (hub < 0) return 0;
    strandRegion.length = 0;
    strandTile.length = 0;
    strandFolk.length = 0;
    let hubFolk = 0;
    for (let i = 0; i < v.list.length; i++) {
      const a = v.list[i];
      if (!a || a.dead || a.removed) continue;
      const t = v.tileOf(a);
      if (t < 0 || !w.isWalkable(t)) continue;
      const r = p.regionOf(t);
      if (r < 0) continue;
      if (r === hub) { hubFolk++; continue; }
      const at = strandRegion.indexOf(r);
      if (at < 0) { strandRegion.push(r); strandTile.push(t); strandFolk.push(1); }
      else strandFolk[at]++;
    }
    let freed = 0;
    for (let i = 0; i < strandRegion.length && freed < FREE_MAX_PER_SWEEP; i++) {
      // Never pull a wall down to "free" most of the town. That reading means
      // the hub vote has been captured by a pocket, not that the town is stuck.
      if (strandFolk[i] >= hubFolk) continue;
      if (openPocket(strandTile[i], strandRegion[i], hub)) freed++;
    }
    return freed;
  }

  /** Walk the pocket, collect the buildings that wall it, pull the best one. */
  function openPocket(fromIdx, region, hub) {
    const w = world();
    const p = game.paths;
    const n = C.GRID_W * C.GRID_H;
    if (!pocketSeen) {
      pocketSeen = new Uint8Array(n);
      pocketBlocker = new Int32Array(n);
      pocketCur = new Int32Array(n);
      pocketNext = new Int32Array(n);
    } else pocketSeen.fill(0);
    const q = pocketCur;
    let head = 0;
    let tail = 0;
    q[tail++] = fromIdx;
    pocketSeen[fromIdx] = 1;
    const cand = [];
    while (head < tail) {
      const idx = q[head++];
      const cx = idx % C.GRID_W;
      const cy = (idx / C.GRID_W) | 0;
      for (let d = 0; d < 8; d++) {
        const nx = cx + C.DIR_DX[d];
        const ny = cy + C.DIR_DY[d];
        if (!U.inBounds(nx, ny)) continue;
        const ni = U.toIdx(nx, ny);
        if (pocketSeen[ni]) continue;
        if (w.isWalkable(ni)) {
          // A walkable neighbour in another region sits past a corner §6 will
          // not let a villager cut; it is outside the pocket, not part of it.
          if (p.regionOf(ni) !== region) { pocketSeen[ni] = 2; continue; }
          pocketSeen[ni] = 1;
          q[tail++] = ni;
          continue;
        }
        pocketSeen[ni] = 2;
        const occ = buildingAt(ni);
        if (occ >= 0 && cand.indexOf(occ) < 0) cand.push(occ);
      }
    }

    let best = null;
    let bestKey = Infinity;
    for (let i = 0; i < cand.length; i++) {
      const b = byId.get(cand[i]);
      if (!b || b.removed || b.def.prePlaced || b === townCentre()) continue;
      if (!reopens(b, hub)) continue;
      // An unfinished site costs nothing to undo; then a palisade, because a
      // hole in a wall is the gate the player forgot.
      const key = (!b.built ? 0 : (b.def.wall || b.def.gate ? 1000 : 2000)) + costWeight(b);
      if (key < bestKey) { bestKey = key; best = b; }
    }
    if (!best) return false;
    const name = (best.def.name || best.defId);
    demolish(best.id, true);
    emit('toast', {
      text: 'Villagers were walled in — the town pulled down the ' + name
        + ' to let them out. Its materials came back.',
      kind: 'warn',
    });
    return true;
  }

  function costWeight(b) {
    let sum = 0;
    for (const k in b.cost) sum += b.cost[k];
    return sum;
  }

  /** Would pulling `b` down join the pocket (pocketSeen === 1) to the town? */
  function reopens(b, hub) {
    const w = world();
    const p = game.paths;
    const inFoot = (ix, iy) => ix >= b.x && iy >= b.y && ix < b.x + b.w && iy < b.y + b.h;
    // Its own tiles walk again as whatever terrain lies under them (§6).
    const open = (ix, iy, idx) => (inFoot(ix, iy)
      ? (roadAt(idx) !== C.ROAD_NONE
        || !!(TERRAIN_INFO[terrainAt(idx)] && TERRAIN_INFO[terrainAt(idx)].walkable))
      : w.isWalkable(idx));
    const step = (ax, ay, bx, by) => {
      if (ax !== bx && ay !== by) {
        const i1 = U.toIdx(bx, ay);
        const i2 = U.toIdx(ax, by);
        if (!open(bx, ay, i1) && !open(ax, by, i2)) return false;
      }
      return true;
    };
    const stack = [];
    const mark = Object.create(null);
    for (let dy = 0; dy < b.h; dy++) {
      for (let dx = 0; dx < b.w; dx++) {
        const fx = b.x + dx;
        const fy = b.y + dy;
        const fi = U.toIdx(fx, fy);
        if (!open(fx, fy, fi)) continue;
        for (let d = 0; d < 8; d++) {
          const nx = fx + C.DIR_DX[d];
          const ny = fy + C.DIR_DY[d];
          if (!U.inBounds(nx, ny)) continue;
          const ni = U.toIdx(nx, ny);
          if (pocketSeen[ni] !== 1 || !step(nx, ny, fx, fy)) continue;
          if (!mark[fi]) { mark[fi] = 1; stack.push(fi); }
          break;
        }
      }
    }
    while (stack.length) {
      const cur = stack.pop();
      const cx = cur % C.GRID_W;
      const cy = (cur / C.GRID_W) | 0;
      for (let d = 0; d < 8; d++) {
        const nx = cx + C.DIR_DX[d];
        const ny = cy + C.DIR_DY[d];
        if (!U.inBounds(nx, ny)) continue;
        const ni = U.toIdx(nx, ny);
        if (!open(nx, ny, ni) || !step(cx, cy, nx, ny)) continue;
        if (inFoot(nx, ny)) {
          if (!mark[ni]) { mark[ni] = 1; stack.push(ni); }
          continue;
        }
        if (p.regionOf(ni) === hub) return true;
      }
    }
    return false;
  }

  /** The live Town Centre instance, re-resolved after a restore or a demolish. */
  function townCentre() {
    if (!townCentreRef || townCentreRef.removed || byId.get(townCentreRef.id) !== townCentreRef) {
      townCentreRef = null;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b.removed || b.defId !== 'town_centre') continue;
        townCentreRef = b;
        break;
      }
    }
    return townCentreRef;
  }

  function assignWorker(b, villagerId) {
    if (!b || !b.built || openJobs(b) <= 0) return false;
    if (!hasDoor(b)) return false;
    return U.pushUnique(b.workers, villagerId);
  }

  /** Hand every worker back to villagers.js as unemployed (M3). */
  function dismissWorkers(b) {
    const v = game.villagers;
    const ids = b.workers.slice();
    for (let i = 0; i < ids.length; i++) {
      dropHeld(b, ids[i]);
      if (v && typeof v.loseJob === 'function') v.loseJob(ids[i]);
      else U.removeValueSwap(b.workers, ids[i]);
    }
    b.workers.length = 0;
  }

  function removeWorker(b, villagerId) {
    if (!b) return false;
    dropHeld(b, villagerId);
    return U.removeValueSwap(b.workers, villagerId);
  }

  function releaseWorkerEverywhere(villagerId) {
    for (let i = 0; i < list.length; i++) {
      dropHeld(list[i], villagerId);
      U.removeValueSwap(list[i].workers, villagerId);
    }
  }

  /** Drop worker ids that no longer refer to a living villager (§14). */
  function validateWorkers() {
    const v = game.villagers;
    const lookup = v && (typeof v.get === 'function' ? v.get.bind(v) : null);
    for (let i = 0; i < list.length; i++) {
      const ws = list[i].workers;
      for (let j = ws.length - 1; j >= 0; j--) {
        const ag = lookup ? lookup(ws[j]) : null;
        // AH2: `removed` is the emigrant's flag and `dead` the corpse's; a slot
        // held by either is labour the town has lost and cannot see.
        if (!ag || ag.dead || ag.removed) { dropHeld(list[i], ws[j]); U.removeSwap(ws, j); }
      }
      const cap = list[i].def.jobs || 0;
      if (ws.length > cap) ws.length = cap;
    }
  }

  /* ---------------------------------------------------------------- *
   * Recipes, gathering, growing
   * ---------------------------------------------------------------- */

  function activeRecipe(b) {
    const def = b.def;
    if (def.recipes && def.recipes.length) {
      for (let i = 0; i < def.recipes.length; i++) {
        if (def.recipes[i].id === b.recipeId) return def.recipes[i];
      }
      return def.recipes[0];
    }
    return def.recipe || null;
  }

  function setRecipe(id, recipeId) {
    const b = byId.get(id);
    if (!b || !b.def.recipes) return false;
    for (let i = 0; i < b.def.recipes.length; i++) {
      const r = b.def.recipes[i];
      if (r.id !== recipeId) continue;
      if ((r.tier || 1) > economyTier()) return false;
      b.recipeId = recipeId;
      b.workProgress = 0;
      return true;
    }
    return false;
  }

  /**
   * Can a worker from `b` stand on — or beside — this node? An unwalkable node
   * (fish in open water, ore in a cliff face) is worked from any adjacent
   * standable tile, which is how paths.js reaches one.
   */
  function nodeReachable(b, idx) {
    const p = game.paths;
    if (!p || typeof p.sameRegion !== 'function') return true;
    const door = b.doorIdx;
    if (door < 0 || idx < 0) return false;
    const w = world();
    if (!w || typeof w.isWalkable !== 'function') return true;
    if (w.isWalkable(idx)) return p.sameRegion(door, idx);
    const x = idx % C.GRID_W;
    const y = (idx / C.GRID_W) | 0;
    for (let d = 0; d < 8; d++) {
      const n = w.tileAt(x + C.DIR_DX[d], y + C.DIR_DY[d]);
      if (n >= 0 && w.isWalkable(n) && p.sameRegion(door, n)) return true;
    }
    return false;
  }

  /** The tile a gatherer from this building should walk to, or -1. */
  function gatherTargetFor(b) {
    const g = b.def.gathers;
    if (!g) return -1;
    const cx = b.x + (b.w >> 1);
    const cy = b.y + (b.h >> 1);
    let idx = findResourceNear(cx, cy, g.resource, g.radius, g.yield);
    // A node nobody can reach is not a target. Left in, the workers walk out,
    // fail to path, come home empty and do it again for the life of the hut
    // while the hut reports itself busy — M3's failure with a different cause.
    if (idx >= 0 && !nodeReachable(b, idx)) {
      idx = scanResource(cx, cy, g.resource, g.radius, g.yield, (i) => nodeReachable(b, i));
    }
    if (idx < 0 && g.alt && g.alt.terrain !== undefined) {
      idx = scanTerrain(cx, cy, g.alt.terrain, g.radius);
    }
    return idx;
  }

  /* ---- T3: a gatherer fills a basket from several nodes ------------- *
   * `gatherPick` takes one node into the worker's basket out in the field,
   * `gatherNextFor` says where to step next, and `gatherComplete` turns the
   * basket into hut stock when the worker reports at the door. Between them
   * they own the harvest, the Winter halving, the byproduct roll and the
   * inventory write; villagers.js owns only the walking.
   * ------------------------------------------------------------------ */

  function copyHeld(held) {
    if (!held) return null;
    const out = Object.create(null);
    let any = false;
    for (const k in held) {
      const bag = held[k];
      if (!bag) continue;
      const c = Object.create(null);
      let n = 0;
      for (const item in bag) if (bag[item] > 0) { c[item] = bag[item]; n++; }
      if (n > 0) { out[k] = c; any = true; }
    }
    return any ? out : null;
  }

  function heldBag(b, workerId, make) {
    if (!b.gatherHeld) {
      if (!make) return null;
      b.gatherHeld = Object.create(null);
    }
    let bag = b.gatherHeld[workerId];
    if (!bag && make) { bag = Object.create(null); b.gatherHeld[workerId] = bag; }
    return bag || null;
  }

  /** Units of `item` held in the field by every worker of this hut. */
  function heldTotal(b, item) {
    if (!b.gatherHeld) return 0;
    let n = 0;
    for (const k in b.gatherHeld) n += b.gatherHeld[k][item] || 0;
    return n;
  }

  /**
   * Room left in one worker's basket. A byproduct rides along for free — the
   * basket is `gathers.basket` units of what the hut was built to gather.
   */
  function basketRoom(b, workerId) {
    const g = b.def.gathers;
    const cap = g.basket > 0 ? g.basket : (g.yield || 1);
    const bag = heldBag(b, workerId, false);
    if (!bag) return cap;
    const by = g.byproduct && g.byproduct.item;
    let n = 0;
    for (const k in bag) if (k !== by) n += bag[k];
    return cap - n;
  }

  /** A worker who has given up a hut leaves nothing behind to book. */
  function dropHeld(b, workerId) {
    if (b && b.gatherHeld && b.gatherHeld[workerId]) delete b.gatherHeld[workerId];
  }

  /**
   * The next node on a circuit: nearest to where the worker is standing, still
   * inside the hut's working radius, and never the tile just worked — three
   * harvests without a step is the bug T3 exists to avoid. -1 sends them home.
   */
  function gatherNextFor(b, workerId, fromIdx, reject) {
    const g = b && b.built ? b.def.gathers : null;
    if (!g || fromIdx < 0) return -1;
    // The circuit ends when there is nowhere to put the next node's worth:
    // either the basket or the hut behind it is full.
    if (basketRoom(b, workerId) <= 0) return -1;
    let hut = capacityFor(b, g.item) - heldTotal(b, g.item);
    if (hut <= 0 && g.alt && g.alt.item) hut = capacityFor(b, g.alt.item) - heldTotal(b, g.alt.item);
    if (hut <= 0) return -1;
    const w = world();
    if (!w) return -1;
    const cx = b.x + (b.w >> 1);
    const cy = b.y + (b.h >> 1);
    const fx = fromIdx % C.GRID_W;
    const fy = (fromIdx / C.GRID_W) | 0;
    const r2 = g.radius * g.radius;
    const inRange = (i) => {
      const dx = (i % C.GRID_W) - cx;
      const dy = ((i / C.GRID_W) | 0) - cy;
      return dx * dx + dy * dy <= r2;
    };
    // `reject` is villagers.js's "the worker is already standing there": a hop
    // the worker does not have to walk is not a hop (T4).
    const ok = (i) => i !== fromIdx && inRange(i) && !(reject && reject(i)) && nodeReachable(b, i);
    // M1's rule first — the nearest node holding a full load — then the
    // filtered scan when that lands on the tile just worked or out of range.
    let idx = w.findResourceNear(fx, fy, g.resource, g.radius, g.yield);
    if (idx < 0 || !ok(idx)) idx = scanResource(fx, fy, g.resource, g.radius, g.yield, ok);
    if (idx < 0 && g.alt && g.alt.terrain !== undefined) {
      idx = scanTerrain(fx, fy, g.alt.terrain, g.radius,
        (i) => i !== fromIdx && inRange(i) && !(reject && reject(i)));
    }
    return idx;
  }

  /**
   * One node into the worker's basket. Nothing leaves the ground that the hut
   * cannot hold — the pick is clamped to the hut's free room net of every
   * basket already out in the field, so a full buffer stalls the hut
   * ('output full') instead of quietly destroying a load and the node it came
   * from. Matters more the bigger a load is (M1, T3).
   */
  function gatherPick(b, workerId, idx) {
    if (!b || !b.built || !b.def.gathers) return 0;
    const g = b.def.gathers;
    const w = world();
    const target = idx === undefined || idx < 0 ? b.targetIdx : idx;
    if (target === undefined || target < 0) return 0;

    let item = g.item;
    let yld = g.yield;
    let harvestNode = true;
    if (g.alt && g.alt.terrain !== undefined && w && w.terrain && w.terrain[target] === g.alt.terrain
        && (!w.resource || w.resource[target] !== g.resource)) {
      // Mushrooms off a forest tile are not a depletable node.
      item = g.alt.item;
      yld = g.alt.yield === undefined ? g.yield : g.alt.yield;
      harvestNode = false;
    }

    let room = capacityFor(b, item) - heldTotal(b, item);
    const bRoom = basketRoom(b, workerId);
    if (bRoom < room) room = bRoom;
    if (room <= 0) return 0;

    const winter = ctx.season === C.SEASON_WINTER ? (g.winterMult === undefined ? 1 : g.winterMult) : 1;
    // Fractional multipliers (Winter halving) accumulate rather than rounding
    // away, so "halved" really is halved over time.
    b.gatherCarry += yld * winter;
    let n = Math.floor(b.gatherCarry);
    if (n <= 0) return 0;
    if (n > room) n = room;
    b.gatherCarry -= n;

    if (harvestNode && w && typeof w.harvest === 'function') {
      n = w.harvest(target, n) | 0;
    }
    if (n <= 0) return 0;

    const bag = heldBag(b, workerId, true);
    bag[item] = (bag[item] || 0) + n;
    if (g.byproduct && rng.chance(g.byproduct.chance)) {
      const bi = g.byproduct.item;
      const bq = g.byproduct.qty || 1;
      if (capacityFor(b, bi) - heldTotal(b, bi) >= bq) bag[bi] = (bag[bi] || 0) + bq;
    }
    return n;
  }

  /**
   * The worker is back at the door with a full basket, or with whatever the
   * patch had left. Every unit was checked against the hut's room when it was
   * picked, so this cannot destroy a load.
   */
  function gatherComplete(b, workerId) {
    if (!b || !b.built || !b.def.gathers) return 0;
    const bag = heldBag(b, workerId, false);
    if (!bag) return 0;
    const by = b.def.gathers.byproduct && b.def.gathers.byproduct.item;
    let primary = 0;
    for (const k in bag) {
      const q = bag[k];
      if (!(q > 0)) continue;
      const got = add(b, k, q);
      bag[k] = q - got;
      if (got <= 0) continue;
      b.producedTotal += got;
      emit('building:produced', { id: b.id, item: k, qty: got, x: b.x, y: b.y });
      if (k !== by) primary += got;
    }
    // Anything that would not fit stays in the basket rather than being
    // destroyed; the hut says 'output full' and the worker delivers it later.
    let left = 0;
    for (const k in bag) left += bag[k];
    if (left <= 0) dropHeld(b, workerId);
    if (workerId !== undefined && workerId >= 0) b.lastProduced = primary;
    return primary;
  }

  function gatherIdleReason(b) {
    const g = b.def.gathers;
    if (ctx.season === C.SEASON_WINTER && g.winterMult === 0) return 'out of season';
    if (b.targetIdx < 0) return 'resource exhausted';
    if (capacityFor(b, g.item) <= 0) return fullReason(g.item);
    return '';
  }

  function tickGrows(b, dt) {
    const g = b.def.grows;
    // ADDENDUM D2: Winter zeroes every `grows` building, no exceptions.
    if (ctx.season === C.SEASON_WINTER && g.winter === false) {
      b.idleReason = 'out of season';
      return;
    }
    const yld = growYield(b, g.base);
    if (capacityFor(b, g.item) < yld) {
      b.idleReason = fullReason(g.item);
      return;
    }
    b.workProgress += dt * b.workers.length * ctx.healthFactor * ctx.prodBonus;
    if (b.workProgress >= g.time) {
      b.workProgress -= g.time;
      if (b.workProgress > g.time) b.workProgress = 0;
      b.batch++;
      emitAdd(b, g.item, yld);
      // The pasture's desc is explicit: "Wool every batch and mutton every
      // fourth", so `alt` is an extra output, not a substitution.
      if (g.alt && g.alt.everyN > 0 && b.batch % g.alt.everyN === 0) {
        emitAdd(b, g.alt.item, growYield(b, g.alt.base === undefined ? g.base : g.alt.base));
      }
    }
    b.idleReason = '';
  }

  function growYield(b, base) {
    const n = Math.round(base * b.growMult);
    return n < 1 ? 1 : n;
  }

  /**
   * §16.1's gather-by-hand, the buildings half. villagers.js does the walking
   * and the timing; this takes the timber out of the ground and books it as
   * production, exactly as a Woodcutter's load is booked, so hand-cut wood can
   * never appear in the town from nowhere. The units go into the cutter's own
   * hands — there is no building here — so nothing is added to an inventory.
   * Returns what was actually cut.
   */
  function handGather(idx, qty, x, y) {
    const w = world();
    if (!w || typeof w.harvest !== 'function') return 0;
    if (!w.resource || w.resource[idx] !== C.RESOURCE.TREE) return 0;
    const n = w.harvest(idx, qty > 0 ? qty : 1) | 0;
    if (n <= 0) return 0;
    // id -1: no building produced this. §11's payload shape is unchanged and
    // the only listener reads x/y/item/qty.
    emit('building:produced', { id: -1, item: 'wood', qty: n, x: x, y: y });
    return n;
  }

  function emitAdd(b, item, qty) {
    const got = add(b, item, qty);
    if (got > 0) {
      b.producedTotal += got;
      b.lastProduced = got;
      emit('building:produced', { id: b.id, item: item, qty: got, x: b.x, y: b.y });
    }
    return got;
  }

  function tickRecipe(b, r, dt) {
    for (const k in r.in) {
      if ((b.inv[k] || 0) < r.in[k]) {
        b.idleReason = NO_MATERIALS[k] || ('no materials: ' + k);
        return;
      }
    }
    for (const k in r.out) {
      if (capacityFor(b, k) < r.out[k]) {
        b.idleReason = fullReason(k);
        return;
      }
    }
    b.workProgress += dt * b.workers.length * ctx.healthFactor * ctx.prodBonus;
    if (b.workProgress >= r.time) {
      b.workProgress -= r.time;
      if (b.workProgress > r.time) b.workProgress = 0;
      b.batch++;
      for (const k in r.in) take(b, k, r.in[k]);
      for (const k in r.out) emitAdd(b, k, r.out[k]);
    }
    b.idleReason = '';
  }

  /* ---------------------------------------------------------------- *
   * The per-tick work loop (§7)
   * ---------------------------------------------------------------- */

  function tickBuilding(b, dt) {
    const def = b.def;

    // A wall is a barrier, not a workplace. §6's road rule is about buildings
    // that function; without this exemption a 100-tile palisade would put 100
    // severity-3 'no road' rows into the alerts panel and bury the real ones.
    if (def.wall || def.gate) { b.idleReason = ''; return; }

    if (!b.active) { b.idleReason = 'paused'; return; }
    if (!b.connected) {
      b.idleReason = 'no road';
      if (b.workers.length) dismissWorkers(b);
      return;
    }
    // N2: it has a road, so telling the player to lay one is telling them to
    // do what they have already done. The road just does not reach home.
    if (!hasDoor(b)) {
      b.idleReason = 'cut off';
      if (b.workers.length) dismissWorkers(b);
      return;
    }

    const works = (def.jobs || 0) > 0 || !!def.recipe || !!def.gathers || !!def.grows;
    if (!works) { b.idleReason = ''; return; }

    if (ctx.night) { b.idleReason = 'night'; return; }
    if ((def.jobs || 0) > 0 && b.workers.length === 0) { b.idleReason = 'no workers'; return; }

    if (def.gathers) { b.idleReason = gatherIdleReason(b); return; }
    if (def.grows) { tickGrows(b, dt); return; }
    const r = activeRecipe(b);
    if (r) { tickRecipe(b, r, dt); return; }
    b.idleReason = '';
  }

  /**
   * AF3's "is anyone actually short of this?", refreshed once per tick beside
   * the storage-room flags it qualifies. Demand is a construction site's unmet
   * cost or a live consumer's hopper with room in it — the same two sources
   * `wants()` reports, counted without allocating a list per building.
   */
  function refreshDemand() {
    for (const k in demand) demand[k] = false;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.removed) continue;
      if (!b.built) {
        const cost = b.cost || EMPTY;
        for (const k in cost) {
          if (cost[k] - (b.delivered[k] || 0) > 0) demand[k] = true;
        }
        continue;
      }
      // A repair short of timber is a fault with a fix, so it counts as demand
      // for AF3's 'no storage' / 'at capacity' distinction like a site does.
      if (b.repair) {
        for (const k in b.repair.cost) {
          if (repairShortfall(b, k) > 0) demand[k] = true;
        }
      }
      if (!b.active) continue;
      const def = b.def;
      if (def.consumes && baseCapacityFor(b, def.consumes.item) > 0) demand[def.consumes.item] = true;
      const r = activeRecipe(b);
      if (r) {
        for (const k in r.in) {
          if (baseCapacityFor(b, k) > 0) demand[k] = true;
        }
      }
    }
  }

  /** True when a site or a consumer is short of `item` right now (AF3). */
  function itemWanted(item) { return demand[item] === true; }

  /** The same question for a whole storage class, for economy's alert row. */
  function classWanted(cls) {
    for (const k in demand) {
      if (demand[k] === true && C.itemClass(k) === cls) return true;
    }
    return false;
  }

  /**
   * The reason a producer gives when its own buffer is full. Three states, not
   * two: hauliers are behind ('output full'), the stores are full of something
   * someone needs ('no storage'), or the town simply has all of this it wants.
   */
  function fullReason(item) {
    if (haulRoomFor(item)) return 'output full';
    if (itemWanted(item)) return NO_STORAGE[C.itemClass(item)];
    return IDLE_AT_CAPACITY;
  }

  function refreshContext(dt) {
    const w = world();
    const clock = w && w.clock;
    ctx.dt = dt;
    ctx.season = clock ? clock.season : 0;
    const tod = clock ? clock.timeOfDay : 0.5;
    ctx.night = tod > C.NIGHT_START || tod < C.NIGHT_END;
    ctx.healthFactor = healthFactorNow();
    ctx.tier = economyTier();

    let bonus = 1;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.built && b.active && b.def.bonus && b.def.bonus.production) bonus += b.def.bonus.production;
    }
    ctx.prodBonus = bonus;

    refreshDemand();

    refreshStorages();
    ctx.roomFood = false;
    ctx.roomGood = false;
    ctx.roomArms = false;
    for (let i = 0; i < storages.length; i++) {
      const s = storages[i];
      if (!s.active) continue;
      const st = s.def.storage;
      if (s.invCount >= st.cap) continue;
      for (let c = 0; c < st.classes.length; c++) {
        const cls = st.classes[c];
        if (storageClassRoom(s, st, cls) <= 0) continue;
        if (cls === 'food') ctx.roomFood = true;
        else if (cls === 'arms') ctx.roomArms = true;
        else ctx.roomGood = true;
      }
    }
  }

  function update(dt) {
    if (needsWorkerValidation) {
      needsWorkerValidation = false;
      validateWorkers();
    }
    // A save written before V3's placement check can hold villagers nothing
    // else will ever free; the first tick after a restore is the moment we
    // have both them and the map (§14 restores villagers after buildings).
    if (needsPocketSweep) {
      needsPocketSweep = false;
      freeStranded();
    }
    refreshContext(dt);
    refreshOverflowNode();

    const paths = game.paths;
    const canConnect = paths && typeof paths.isConnected === 'function';
    const stamp = doorStamp();

    for (let i = 0; i < list.length; i++) {
      const b = list[i];

      // Connectivity is cached inside paths.js; call it, never reimplement it.
      b.connected = canConnect ? !!paths.isConnected(b) : true;
      // `connected` comes from paths.js, which invalidates on every road write
      // wherever it came from; a door of -1 under it is a stale cache, not a
      // doorless building, and must be recomputed however the stamp looks.
      if (b.doorGen !== stamp || (b.doorIdx < 0 && b.connected)) {
        b.doorIdx = computeDoor(b);
        b.doorGen = stamp;
      }

      if (!b.built) {
        b.sinceBuilder += dt;
        b.needsAnyBuilder = siteNeedsAnyBuilder(b);
        // buildTime 0 instances (none today, but the shape is legal) need no builder.
        if (b.def.buildTime <= 0 && deliveredComplete(b)) complete(b);
        // §7's teaching moment: a fresh site with no road adjacency says so
        // straight away rather than hiding behind 'under construction'.
        else if (!b.active) b.idleReason = 'paused';
        else if (b.def.wall || b.def.gate) b.idleReason = 'under construction';
        else if (!b.connected) b.idleReason = 'no road';
        else if (!hasDoor(b)) b.idleReason = 'cut off';
        else b.idleReason = 'under construction';
        continue;
      }

      if (b.repair) tickRepair(b, dt);

      if (b.def.gathers) {
        b.scanTimer -= dt;
        if (b.scanTimer <= 0) {
          b.scanTimer = 2;
          b.targetIdx = gatherTargetFor(b);
        }
      }

      tickBuilding(b, dt);
    }
  }

  /* ---------------------------------------------------------------- *
   * Queries other modules need
   * ---------------------------------------------------------------- */

  function get(id) { return byId.get(id) || null; }

  function atTile(idx) {
    const id = buildingAt(idx);
    return id >= 0 ? (byId.get(id) || null) : null;
  }

  function countOf(defId) {
    let n = 0;
    for (let i = 0; i < list.length; i++) if (list[i].defId === defId) n++;
    return n;
  }

  function countBuilt(defId) {
    let n = 0;
    for (let i = 0; i < list.length; i++) if (list[i].built && list[i].defId === defId) n++;
    return n;
  }

  function hasBuilt(defId) { return countBuilt(defId) > 0; }

  /**
   * Housing capacity. While a house is being upgraded in place it still shelters
   * its old residents — §7 requires the upgrade to keep them.
   */
  function housingCapacity(b) {
    if (b.built) return b.def.houses || 0;
    if (b.upgrading && b.prevDefId) {
      const prev = BUILDING_BY_ID[b.prevDefId];
      return (prev && prev.houses) || 0;
    }
    return 0;
  }

  function totalHousing() {
    let n = 0;
    for (let i = 0; i < list.length; i++) n += housingCapacity(list[i]);
    return n;
  }

  function sites(out) {
    const o = out || [];
    o.length = 0;
    for (let i = 0; i < list.length; i++) if (!list[i].built) o.push(list[i]);
    return o;
  }

  function upkeepTotal() {
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.built && b.active && b.def.upkeep && b.def.upkeep.coin) n += b.def.upkeep.coin;
    }
    return n;
  }

  /** Enemies must path around walls AND gates; villagers only around solid ones. */
  function blocksEnemies(b) {
    return b.def.solid === true || b.def.gate === true;
  }

  function setActive(id, on) {
    const b = byId.get(id);
    if (!b) return false;
    b.active = !!on;
    return true;
  }

  function setPriority(id, p) {
    const b = byId.get(id);
    if (!b) return false;
    b.priority = U.clamp(Math.round(p), 0, 2);
    return true;
  }

  /* ---------------------------------------------------------------- *
   * Daily hooks
   * ---------------------------------------------------------------- */

  function onDayEnded() {
    freeStranded();
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const cons = b.def.consumes;
      if (!b.built || !b.active || !cons) continue;
      take(b, cons.item, cons.perDay || 1);
    }
  }

  /* ---------------------------------------------------------------- *
   * Save / restore (§14)
   * ---------------------------------------------------------------- */

  function copyCounts(src) {
    const out = {};
    for (const k in src) if (src[k] > 0) out[k] = src[k];
    return out;
  }

  function serializeRepair(r) {
    if (!r) return null;
    return {
      cost: copyCounts(r.cost),
      delivered: copyCounts(r.delivered),
      used: copyCounts(r.used),
      work: r.work,
      workNeeded: r.workNeeded,
      hpMissing: r.hpMissing,
      granted: r.granted,
    };
  }

  /**
   * §14 — a save written before repairs existed has no `repair` key and simply
   * restores without one. A malformed or impossible one is dropped rather than
   * trusted: a repair whose reservation cannot be believed would corrupt
   * `available()` for the rest of the game.
   */
  function restoreRepair(row, b) {
    if (!row || typeof row !== 'object') return null;
    const cost = Object.create(null);
    let total = 0;
    for (const k in row.cost) {
      const n = Math.floor(row.cost[k]);
      if (ITEMS[k] && Number.isFinite(n) && n > 0) { cost[k] = n; total += n; }
    }
    if (total <= 0) return null;
    const delivered = Object.create(null);
    const used = Object.create(null);
    for (const k in cost) {
      // delivered is cumulative and used can never outrun it.
      const d = clampCount(row.delivered && row.delivered[k], 0, cost[k]);
      delivered[k] = d;
      used[k] = clampCount(row.used && row.used[k], 0, d);
    }
    const workNeeded = Number.isFinite(row.workNeeded) && row.workNeeded > 0
      ? row.workNeeded : REPAIR_MIN_WORK;
    const hpMissing = clampCount(row.hpMissing, 0, b.maxHp) || (b.maxHp - b.hp);
    return {
      cost: cost,
      delivered: delivered,
      used: used,
      work: U.clamp(Number.isFinite(row.work) ? row.work : 0, 0, workNeeded),
      workNeeded: workNeeded,
      hpMissing: hpMissing > 0 ? hpMissing : 0,
      granted: U.clamp(Number.isFinite(row.granted) ? row.granted : 0, 0, hpMissing),
      sinceBuilder: 0,
    };
  }

  function clampCount(v, lo, hi) {
    const n = Math.floor(v);
    if (!Number.isFinite(n) || n < lo) return lo;
    return n > hi ? hi : n;
  }

  function serialize() {
    const out = new Array(list.length);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      out[i] = {
        id: b.id, defId: b.defId, x: b.x, y: b.y, w: b.w, h: b.h,
        built: b.built, progress: b.progress,
        cost: copyCounts(b.cost),
        delivered: copyCounts(b.delivered),
        inv: copyCounts(b.inv),
        workers: b.workers.slice(),
        active: b.active, priority: b.priority,
        hp: b.hp, maxHp: b.maxHp,
        workProgress: b.workProgress,
        idleReason: b.idleReason,
        connected: b.connected, doorIdx: b.doorIdx,
        level: b.level,
        producedTotal: b.producedTotal, lastProduced: b.lastProduced,
        solid: b.solid, recipeId: b.recipeId,
        batch: b.batch, gatherCarry: b.gatherCarry, growMult: b.growMult,
        gatherHeld: copyHeld(b.gatherHeld),
        targetIdx: b.targetIdx, scanTimer: b.scanTimer,
        upgrading: b.upgrading, prevDefId: b.prevDefId,
        repair: serializeRepair(b.repair),
      };
    }
    return {
      nextId: nextId,
      freeBuildsUsed: freeBuildsUsed,
      overflow: copyCounts(overflow),
      rng: rng.getState(),
      list: out,
    };
  }

  function restore(obj) {
    list.length = 0;
    byId.clear();
    byId.set(OVERFLOW_ID, overflowNode);
    overflowNode.doorGen = -1;
    storages.length = 0;
    storesDirty = true;
    // Every cached reference into the old list dies with it.
    townCentreRef = null;
    hubStamp = -1;
    roadGen++;
    for (const k in overflow) delete overflow[k];
    if (!obj) return;

    nextId = obj.nextId || 1;
    freeBuildsUsed = obj.freeBuildsUsed || 0;
    if (obj.overflow) for (const k in obj.overflow) overflow[k] = obj.overflow[k];
    if (obj.rng) rng.setState(obj.rng);

    const rows = obj.list || [];
    const w = world();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const def = BUILDING_BY_ID[r.defId];
      // A save naming a building this version no longer has is dropped, not
      // trusted (§14).
      if (!def) continue;
      const b = {
        id: r.id, defId: r.defId, def: def,
        x: r.x, y: r.y, w: r.w || def.w, h: r.h || def.h,
        built: !!r.built, progress: r.progress || 0,
        cost: Object.assign(Object.create(null), r.cost || def.cost || EMPTY),
        delivered: Object.assign(Object.create(null), r.delivered || EMPTY),
        inv: Object.assign(Object.create(null), r.inv || EMPTY),
        invCount: 0,
        clsCount: null,
        workers: Array.isArray(r.workers) ? r.workers.slice() : [],
        active: r.active !== false,
        priority: typeof r.priority === 'number' ? r.priority : 1,
        hp: typeof r.hp === 'number' ? r.hp : (def.hp || 100),
        maxHp: r.maxHp || def.maxHp || def.hp || 100,
        workProgress: r.workProgress || 0,
        sinceBuilder: 0,
        needsAnyBuilder: false,
        idleReason: r.idleReason || '',
        connected: !!r.connected,
        doorIdx: typeof r.doorIdx === 'number' ? r.doorIdx : -1,
        level: r.level || 1,
        producedTotal: r.producedTotal || 0,
        lastProduced: r.lastProduced || 0,
        solid: r.solid === undefined ? def.solid === true : !!r.solid,
        recipeId: r.recipeId || (def.recipes && def.recipes.length ? def.recipes[0].id : ''),
        batch: r.batch || 0,
        gatherCarry: r.gatherCarry || 0,
        gatherHeld: copyHeld(r.gatherHeld),
        growMult: typeof r.growMult === 'number' ? r.growMult : 1,
        targetIdx: typeof r.targetIdx === 'number' ? r.targetIdx : -1,
        scanTimer: typeof r.scanTimer === 'number' && Number.isFinite(r.scanTimer) ? r.scanTimer : 0,
        doorGen: 0,
        upgrading: !!r.upgrading,
        prevDefId: r.prevDefId || '',
        repair: null,
        repairing: false,
      };
      // A repair only exists on a finished building; anything else in the file
      // is a save from a version this one does not share and is dropped.
      if (b.built && r.repair) setRepair(b, restoreRepair(r.repair, b));
      for (const k in b.inv) b.invCount += b.inv[k];
      b.clsCount = recountClasses(b);
      list.push(b);
      byId.set(b.id, b);
      if (b.id >= nextId) nextId = b.id + 1;
      if (def.storage) storesDirty = true;
    }

    // world.building is rebuilt from this module, which is the authority on
    // occupancy; anything else in the array is stale and must not survive.
    if (w && w.building) {
      for (let i = 0; i < w.building.length; i++) w.building[i] = -1;
    }
    for (let i = 0; i < list.length; i++) claimTiles(list[i]);
    for (let i = 0; i < list.length; i++) {
      list[i].doorIdx = computeDoor(list[i]);
      list[i].doorGen = doorStamp();
    }
    // villagers restore after buildings (§14), so worker ids — and anyone a
    // pre-V3 save left sealed into a pocket — can only be seen on the first tick.
    needsWorkerValidation = true;
    needsPocketSweep = true;
  }

  /* ---------------------------------------------------------------- *
   * Public surface
   * ---------------------------------------------------------------- */

  self.list = list;
  self.overflow = overflow;
  self.lastError = '';

  self.init = function init() {
    if (game.bus && typeof game.bus.on === 'function') {
      game.bus.on('day:ended', onDayEnded);
    }
    const seed = (game.world && game.world.seed) || 1;
    rng = new U.RNG(seed ^ 0x5eed1e);
    storesDirty = true;
    byId.set(OVERFLOW_ID, overflowNode);
    refreshOverflowNode();
  };

  self.update = function boundUpdate(dt, g) {
    if (g) game = g;
    update(dt);
  };

  self.serialize = serialize;
  self.restore = function boundRestore(obj, g) {
    if (g) game = g;
    restore(obj);
  };

  // placement
  self.canPlace = canPlace;
  self.itemWanted = itemWanted;
  self.classWanted = classWanted;
  self.place = place;
  self.placeMany = placeMany;
  self.removeRoad = removeRoad;
  self.demolish = demolish;
  self.cancel = demolish;
  self.costFor = function publicCostFor(defId, x, y) {
    const def = BUILDING_BY_ID[defId];
    if (!def) return EMPTY;
    return costFor(def, isRoadDef(def) ? null : upgradeTargetAt(def, x, y));
  };
  self.upgradeTargetAt = function publicUpgradeTarget(defId, x, y) {
    const def = BUILDING_BY_ID[defId];
    return def ? upgradeTargetAt(def, x, y) : null;
  };
  /**
   * U3/§13 — what a site is worth before the player commits the timber.
   * `perDay` is the patch's sustainable yield (§5 regrowth), `feeds` the same
   * figure in nutrition, which is the number to set beside `jobs`: a hut whose
   * patch feeds fewer people than it employs can never pay for itself. Null
   * for a def that gathers nothing.
   */
  self.siteWorth = function publicSiteWorth(defId, x, y) {
    const def = BUILDING_BY_ID[defId];
    const g = def && def.gathers;
    if (!g) return null;
    const w = scanWorth(def, x, y, 0);
    const item = ITEMS[g.item];
    const min = g.minPerDay > 0 ? g.minPerDay : 0;
    return {
      nodes: w.nodes,
      stock: w.stock,
      perDay: w.perDay,
      feeds: item && item.nutrition ? w.perDay * item.nutrition : 0,
      eats: (def.jobs || 0) * C.FOOD_PER_DAY,
      jobs: def.jobs || 0,
      item: g.item,
      resource: g.resource,
      radius: g.radius,
      min: min,
      ok: min === 0 || w.perDay >= min,
    };
  };

  // construction
  self.applyBuilder = applyBuilder;
  self.deliveredComplete = deliveredComplete;
  self.siteNeedsAnyBuilder = siteNeedsAnyBuilder;
  self.SITE_STALL_SECONDS = SITE_STALL_SECONDS;
  self.sites = sites;
  self.freeBuildsLeft = function freeBuildsLeft() { return C.FREE_BUILDS - freeBuildsUsed; };

  // inventory (the only mutators of b.inv)
  self.capacityFor = capacityFor;
  self.add = add;
  self.take = take;
  self.has = has;
  self.outputs = outputs;
  self.wants = wants;
  self.outputFillRatio = outputFillRatio;
  self.deposit = deposit;
  self.spend = spend;
  self.takeOverflow = takeOverflow;
  self.overflowNode = function publicOverflowNode() { return overflowNode; };
  self.discard = discard;

  // accounting
  self.stockOf = stockOf;
  self.stockTotals = stockTotals;
  self.reservedOf = reservedOf;
  self.reservedTotals = reservedTotals;
  self.deliveredOf = deliveredOf;
  self.storageRoomFor = storageRoomFor;
  self.nearestStorage = nearestStorage;
  self.storages = function publicStorages() { refreshStorages(); return storages; };
  // R4: §9.3.1 confines build tasks to storages so a queue of sites cannot
  // strip the producers bare. A town with no storage has no producer chain to
  // protect, and economy.js needs that test to be cheap — the list behind both
  // of these is rebuilt only when a storage is placed, finished or lost.
  self.storageCount = function publicStorageCount() { refreshStorages(); return storages.length; };
  self.hasStorage = function publicHasStorage() { refreshStorages(); return storages.length > 0; };

  // workers
  self.openJobs = openJobs;
  self.hasDoor = hasDoor;
  self.cutOffCause = cutOffCause;
  self.freeStranded = freeStranded;
  self.assignWorker = assignWorker;
  self.removeWorker = removeWorker;
  self.releaseWorkerEverywhere = releaseWorkerEverywhere;
  self.validateWorkers = validateWorkers;

  // work
  self.gatherTargetFor = gatherTargetFor;
  self.gatherNextFor = gatherNextFor;
  self.gatherPick = gatherPick;
  self.gatherComplete = gatherComplete;
  self.handGather = handGather;
  self.activeRecipe = activeRecipe;
  self.setRecipe = setRecipe;

  // damage
  self.damage = damage;
  self.repair = repair;

  // repair (§Repair — every accessor here is pure; none mutates the building)
  self.repairCost = repairCost;
  self.beginRepair = beginRepair;
  self.cancelRepair = cancelRepair;
  self.repairState = repairState;
  self.damagedIds = damagedIds;
  self.repairingIds = repairingIds;
  self.isRepairing = function publicIsRepairing(id) {
    const b = byId.get(id);
    return !!(b && b.repair);
  };
  // For villagers.js: the same pair applyBuilder/siteNeedsAnyBuilder form for a
  // construction site, so a builder can be sent to a repair the same way.
  self.applyRepair = applyRepair;
  self.repairSupplied = repairSupplied;
  self.repairNeedsBuilder = repairNeedsBuilder;
  self.REPAIR_COST_FACTOR = REPAIR_COST_FACTOR;

  // queries
  self.get = get;
  self.atTile = atTile;
  self.countOf = countOf;
  self.countBuilt = countBuilt;
  self.hasBuilt = hasBuilt;
  self.housingCapacity = housingCapacity;
  self.totalHousing = totalHousing;
  self.upkeepTotal = upkeepTotal;
  self.blocksEnemies = blocksEnemies;
  self.footprintTiles = footprintTiles;
  self.setActive = setActive;
  self.setPriority = setPriority;

  return self;
}

export default createBuildings;
