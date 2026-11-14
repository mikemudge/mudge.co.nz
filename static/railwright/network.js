// Track graph, signals, block reservations, A* pathfinding and construction
// for Railwright (see DESIGN.md section 6). This module owns everything that
// stops two trains from occupying the same track: only network.js mutates
// `track`, `signals`, `blocks` and station footprints.
//
// --- Assumed collaborator interfaces (constants.js/utils.js/world.js did not
// exist yet when this was written; these are the narrowest interfaces this
// module needs, documented here so the other agents' modules can match them):
//
//   world.tileAtIdx(idx)     -> { x, y, type, elevation, siteId, blocked } | null
//   world.isBuildable(idx)   -> bool   (can new track be laid on this tile)
//   world.terrainFactor(idx) -> number >= 1 (movement cost multiplier)
//   world.elevationAt(idx)   -> number (0..3)
//
//   from './utils.js':    toIdx(x,y), toXY(idx), inBounds(x,y), clamp(v,lo,hi),
//                          signalKeyFor(a,b)  -- these are pinned exactly by
//                          DESIGN.md section 3/6 so they're safe to share.
//   from './constants.js': GRID/DIR/cost constants used below.
//
//   `dist`, `stepDistance`, `dirBetween`, `neighbours` are listed as
//   available in utils.js, but DESIGN.md doesn't pin their argument shapes
//   (idx-pair vs x/y-pair), and getting that wrong here would silently
//   corrupt path costs -- the one place correctness matters most. So this
//   file implements its own local equivalents from toIdx/toXY/inBounds
//   instead of guessing a signature for those four.
//
// --- Tech gating: `network.unlockedTechs` is a plain mutable `Set<string>`
// property (default empty). The caller (main.js/economy.js) is expected to
// keep it in sync with purchased techs, e.g. `network.unlockedTechs.add(id)`
// on `tech:bought`. Chosen over a callback because it keeps every method
// below a plain synchronous function with no hidden control flow.
//
// --- Economy decoupling: the constructor is `new Network(world, bus)` with
// no economy reference, so `buildTrack`/`buildStation` never charge money
// themselves -- they perform the structural change (if legal) and emit the
// documented event (`track:built` / `station:built`) with the cost so
// economy.js's own listener applies the charge. `buildTrack`'s boolean
// return is about structural legality, not affordability.
//
// --- Phantom-reservation avoidance (the #1 soft-lock risk called out in the
// design doc): block occupancy is NEVER trusted to survive by blockId alone.
// The only durable record of "what does train X physically sit on" is
// `_trainTiles: Map<trainId, Set<idx>>`, written exclusively by
// syncTrainOccupancy/reserveBlock/releaseBlock. `recomputeBlocks()` always
// throws away the old `blocks` map completely and rebuilds `occupants` from
// scratch by re-deriving each train's current blocks from `_trainTiles`
// against the *new* topology. A train can never end up "reserving" a block
// that no longer corresponds to a tile it is physically on, because nothing
// is ever carried forward except the physical tile set itself.
//
// --- Stations: `buildStation` is a network.js method (per DESIGN.md), so
// this module owns `network.stations: Map<id, station>`; main.js is expected
// to expose `game.stations` as this same map. Station/site proximity
// (STATION_RADIUS) is not validated here since this module has no site
// lookup in its assumed world interface -- callers (ui.js/economy.js) must
// gate that before calling buildStation. // CONTRACT-GAP
//
// --- Movement-cost terrain/grade formula: DESIGN.md specifies
// "cost = step distance x terrain factor x (1 + grade penalty)" but does not
// pin the grade coefficient. GRADE_FACTOR below (0.5 per elevation step,
// uphill only) is a local choice, not a shared constant. // CONTRACT-GAP
//
// --- detectDeadlock(trains, dt): DESIGN.md writes the signature as
// `detectDeadlock(trains)`, but duration-based deadlock detection needs a
// clock. `dt` is an optional trailing game-seconds argument the caller should
// pass every tick (same shape as other `update(dt)` calls in this codebase);
// omitting it just means the internal clock never advances and deadlocks are
// never declared. // CONTRACT-GAP

// `toIdx` is aliased to `idxAt` on import: findPath/planTrack take a `toIdx`
// parameter per DESIGN.md's exact signature, which would otherwise shadow
// this function for the whole method body.
import { toIdx as idxAt, toXY, inBounds, clamp, signalKeyFor } from './utils.js';
import {
  DIR_DX, DIR_DY, OPPOSITE,
  TRACK_COST, BRIDGE_COST, TUNNEL_COST, STATION_COST, DEMOLISH_REFUND,
  DEADLOCK_SECONDS,
} from './constants.js';

const MAX_EXPANSIONS = 20000;
const GRADE_FACTOR = 0.5; // cost multiplier added per elevation step climbed
// Exported so main.js can pre-check/charge this cost the same way it does
// for buildTrack/buildStation/placeSignal (this module never charges money
// itself - see the economy-decoupling note at the top of this file).
export const ELECTRIFY_COST_PER_TILE = 40; // per section 8's electrification note
const DEADLOCK_EMIT_COOLDOWN = 30; // game seconds, per DESIGN.md section 6
const EXTRA_PLATFORM_COST = 700; // per section 6's "each extra platform +700"

// -- small local geometry helpers (no imported-signature guessing) ---------

// Defends against toXY(idx) returning either [x,y] or {x,y} -- the shape
// isn't pinned by DESIGN.md, only the name is.
function xy(idx) {
  const p = toXY(idx);
  return Array.isArray(p) ? { x: p[0], y: p[1] } : p;
}

function dirFromTo(a, b) {
  const pa = xy(a);
  const pb = xy(b);
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  for (let d = 0; d < 8; d++) {
    if (DIR_DX[d] === dx && DIR_DY[d] === dy) return d;
  }
  return null;
}

function stepDist(a, b) {
  const pa = xy(a);
  const pb = xy(b);
  const dx = Math.abs(pb.x - pa.x);
  const dy = Math.abs(pb.y - pa.y);
  return dx === 1 && dy === 1 ? Math.SQRT2 : 1;
}

function euclid(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

function isDiagonalDir(d) {
  return d === 1 || d === 3 || d === 5 || d === 7;
}

// Maps a diagonal direction taken from (x,y) to the 2x2 cell it crosses and
// which of the cell's two diagonals it is ("family" 0 = top-left/bottom-right,
// 1 = top-right/bottom-left). The other family is the one that must not
// simultaneously exist (the diagonal-crossing invariant).
function diagonalCell(x, y, dir) {
  switch (dir) {
    case 1: return { cx: x, cy: y, family: 0 }; // SE: (x,y)-(x+1,y+1)
    case 5: return { cx: x - 1, cy: y - 1, family: 0 }; // NW mirrors that same link
    case 3: return { cx: x - 1, cy: y, family: 1 }; // SW: (x,y)-(x-1,y+1)
    case 7: return { cx: x, cy: y - 1, family: 1 }; // NE mirrors that same link
    default: return null;
  }
}

// `overlay` is a Map<idx, linkBits> of links a route is provisionally adding
// (so a route can't cross itself), checked alongside the committed `track`.
function crossesExistingDiagonal(overlay, track, x, y, dir) {
  const cell = diagonalCell(x, y, dir);
  if (!cell) return false;
  const { cx, cy, family } = cell;
  const checkX = family === 0 ? cx + 1 : cx;
  const checkY = cy;
  const checkDir = family === 0 ? 3 : 1;
  if (!inBounds(checkX, checkY)) return false;
  const checkIdx = idxAt(checkX, checkY);
  const real = track.get(checkIdx);
  const bits = (real ? real.links : 0) | (overlay.get(checkIdx) || 0);
  return !!(bits & (1 << checkDir));
}

function inBoundsIdx(idx) {
  if (idx == null || Number.isNaN(idx)) return false;
  const p = xy(idx);
  return !!p && inBounds(p.x, p.y);
}

function reconstructPath(cameFrom, start, end) {
  const path = [end];
  let cur = end;
  while (cur !== start) {
    cur = cameFrom.get(cur);
    if (cur === undefined) return null;
    path.push(cur);
  }
  path.reverse();
  return path;
}

// Binary min-heap keyed by priority; used by findPath so a capped, worst-case
// disconnected search still terminates quickly instead of degrading to O(n^2).
class MinHeap {
  constructor() {
    this._items = [];
  }

  get size() {
    return this._items.length;
  }

  push(node, priority) {
    this._items.push({ node, priority });
    let i = this._items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._items[parent].priority <= this._items[i].priority) break;
      [this._items[parent], this._items[i]] = [this._items[i], this._items[parent]];
      i = parent;
    }
  }

  pop() {
    const top = this._items[0];
    const last = this._items.pop();
    if (this._items.length > 0 && last) {
      this._items[0] = last;
      let i = 0;
      const n = this._items.length;
      for (;;) {
        let smallest = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < n && this._items[l].priority < this._items[smallest].priority) smallest = l;
        if (r < n && this._items[r].priority < this._items[smallest].priority) smallest = r;
        if (smallest === i) break;
        [this._items[smallest], this._items[i]] = [this._items[i], this._items[smallest]];
        i = smallest;
      }
    }
    return top ? top.node : undefined;
  }
}

export class Network {
  constructor(world, bus) {
    this.world = world;
    this.bus = bus;

    this.track = new Map(); // idx -> { idx, links, kind, electrified, cost, blockId }
    this.signals = new Map(); // signalKeyFor(a,b) -> { id, a, b, dir, green, kind }
    this.blocks = new Map(); // blockId -> { id, tiles:Set, capacity, occupants:Set }
    this.stations = new Map(); // id -> station

    this.unlockedTechs = new Set();

    // Addendum A3.2 scenario cost multipliers (Highlands +25% track,
    // Braided River -40% bridges). This module has no economy reference (see
    // the economy-decoupling note above), so the caller mirrors
    // economy.getTrackCostMultiplier()/getBridgeCostMultiplier() here via
    // setCostMultipliers() once per game instead.
    this._costMult = { track: 1, bridge: 1 };

    // Physical-occupancy bookkeeping (the phantom-reservation defence).
    this._trainTiles = new Map(); // trainId -> Set<idx>
    this._trainBlocks = new Map(); // trainId -> Set<blockId>, mirrors blocks.occupants

    // Deadlock detection state. Cooldown is per contention group (keyed by
    // its sorted train-id set), not global, so several independent knots
    // elsewhere on the map each get reported rather than only the first one
    // found each tick starving out the rest.
    this._waitSince = new Map(); // trainId -> internal clock time first seen waiting
    this._clock = 0;
    this._lastDeadlockEmit = new Map(); // groupKey -> internal clock time last emitted

    this._signalIdSeq = 0;
    this._stationIdSeq = 0;
  }

  setCostMultipliers({ track = 1, bridge = 1 } = {}) {
    this._costMult.track = track || 1;
    this._costMult.bridge = bridge || 1;
  }

  // ---- Track graph --------------------------------------------------------

  hasTrack(idx) {
    return this.track.has(idx);
  }

  linked(a, b) {
    const ta = this.track.get(a);
    if (!ta) return false;
    const d = dirFromTo(a, b);
    if (d == null) return false;
    return !!(ta.links & (1 << d));
  }

  link(a, b) {
    const ta = this.track.get(a);
    const tb = this.track.get(b);
    if (!ta || !tb) return false;
    const d = dirFromTo(a, b);
    if (d == null) return false;
    if (ta.links & (1 << d)) return true; // already linked, idempotent
    if (isDiagonalDir(d)) {
      const p = xy(a);
      if (crossesExistingDiagonal(new Map(), this.track, p.x, p.y, d)) return false;
    }
    ta.links |= (1 << d);
    tb.links |= (1 << OPPOSITE[d]);
    return true;
  }

  unlink(a, b) {
    const ta = this.track.get(a);
    const tb = this.track.get(b);
    const d = dirFromTo(a, b);
    if (d == null) return false;
    if (ta) ta.links &= ~(1 << d);
    if (tb) tb.links &= ~(1 << OPPOSITE[d]);
    return true;
  }

  // ---- Signals --------------------------------------------------------

  isLinkSignalled(a, b) {
    return this.signals.has(signalKeyFor(a, b));
  }

  placeSignal(a, b) {
    if (!this.linked(a, b)) return false;
    const key = signalKeyFor(a, b);
    if (this.signals.has(key)) return true;
    const d = dirFromTo(a, b);
    const id = `sig${this._signalIdSeq++}`;
    this.signals.set(key, { id, a, b, dir: d, green: true, kind: 'block' });
    this.recomputeBlocks();
    return true;
  }

  removeSignal(a, b) {
    const key = signalKeyFor(a, b);
    if (!this.signals.has(key)) return false;
    this.signals.delete(key);
    this.recomputeBlocks();
    return true;
  }

  // ---- Blocks --------------------------------------------------------

  // Flood-fills track tiles into blocks, never unioning across a signalled
  // link, then rebuilds `occupants` purely from live physical occupancy
  // (`_trainTiles`) -- see the phantom-reservation note at the top of this
  // file. This is the only place `this.blocks` is ever reassigned.
  recomputeBlocks() {
    const visited = new Set();
    const newBlocks = new Map();
    let seq = 0;

    const tileStation = new Map();
    for (const station of this.stations.values()) {
      for (const t of station.tiles) tileStation.set(t, station);
    }

    for (const startIdx of this.track.keys()) {
      if (visited.has(startIdx)) continue;
      const compTiles = [];
      const stack = [startIdx];
      visited.add(startIdx);
      while (stack.length) {
        const cur = stack.pop();
        compTiles.push(cur);
        const tile = this.track.get(cur);
        const p = xy(cur);
        for (let d = 0; d < 8; d++) {
          if (!(tile.links & (1 << d))) continue;
          const nx = p.x + DIR_DX[d];
          const ny = p.y + DIR_DY[d];
          if (!inBounds(nx, ny)) continue;
          const nIdx = idxAt(nx, ny);
          if (!this.track.has(nIdx) || visited.has(nIdx)) continue;
          if (this.isLinkSignalled(cur, nIdx)) continue; // block boundary
          visited.add(nIdx);
          stack.push(nIdx);
        }
      }

      const blockId = `b${seq++}`;
      let capacity = 1;
      const firstStation = tileStation.get(compTiles[0]) || null;
      let sameStation = firstStation !== null;
      if (sameStation) {
        for (const t of compTiles) {
          if ((tileStation.get(t) || null) !== firstStation) { sameStation = false; break; }
        }
      }
      if (sameStation) capacity = firstStation.platforms;

      const block = { id: blockId, tiles: new Set(compTiles), capacity, occupants: new Set() };
      newBlocks.set(blockId, block);
      for (const t of compTiles) this.track.get(t).blockId = blockId;
    }

    this.blocks = newBlocks;

    // Re-derive every train's held blocks solely from the tiles it is
    // physically known to occupy right now. Nothing carries over from the
    // discarded block map, so a topology change can never leave a phantom
    // reservation behind.
    this._trainBlocks.clear();
    for (const [trainId, tiles] of this._trainTiles) {
      const wanted = new Set();
      for (const t of tiles) {
        const bId = this.blockAt(t);
        if (bId != null) wanted.add(bId);
      }
      for (const bId of wanted) {
        const block = this.blocks.get(bId);
        if (block) block.occupants.add(trainId);
      }
      this._trainBlocks.set(trainId, wanted);
    }

    this._refreshSignalStates();
  }

  // Render-only derived state: a signal glows green when both blocks it
  // borders are empty. canEnterBlock/reserveBlock never consult this --
  // capacity/occupants are the sole gate.
  _refreshSignalStates() {
    for (const sig of this.signals.values()) {
      const ba = this.blocks.get(this.blockAt(sig.a));
      const bb = this.blocks.get(this.blockAt(sig.b));
      const clearA = !ba || ba.occupants.size === 0;
      const clearB = !bb || bb.occupants.size === 0;
      sig.green = clearA && clearB;
    }
  }

  blockAt(idx) {
    const t = this.track.get(idx);
    if (!t) return null;
    return t.blockId == null ? null : t.blockId;
  }

  // ---- Reservation API (only this module mutates block state) ------------

  canEnterBlock(blockId, trainId) {
    const block = this.blocks.get(blockId);
    if (!block) return false;
    if (block.occupants.has(trainId)) return true;
    return block.occupants.size < block.capacity;
  }

  reserveBlock(blockId, trainId) {
    const block = this.blocks.get(blockId);
    if (!block) return false;
    if (!this.canEnterBlock(blockId, trainId)) return false;
    block.occupants.add(trainId);
    let held = this._trainBlocks.get(trainId);
    if (!held) { held = new Set(); this._trainBlocks.set(trainId, held); }
    held.add(blockId);
    this._refreshSignalStates();
    return true;
  }

  releaseBlock(blockId, trainId) {
    const block = this.blocks.get(blockId);
    if (block) block.occupants.delete(trainId);
    const held = this._trainBlocks.get(trainId);
    if (held) {
      held.delete(blockId);
      if (held.size === 0) this._trainBlocks.delete(trainId);
    }
    this._refreshSignalStates();
  }

  // Preferred entry point: idempotently reserves whatever blocks `tileIdxList`
  // requires and releases whatever it no longer needs. Always records the
  // physical tile set in `_trainTiles` so recomputeBlocks can always
  // re-derive the truth later.
  //
  // Granting a "wanted" block is never capacity-gated here, by design: a
  // caller only knows `tileIdxList` because the train is already physically
  // standing there - either canEnterBlock was already checked prospectively
  // before it moved (the normal stepMovement/spawnAtFirstStop path), or this
  // is a resync of pre-existing physical truth after a save/load or a
  // topology change (two blocks merging can put more physically-present
  // trains in one block than its capacity, same as recomputeBlocks()'s own
  // re-derivation already tolerates). Refusing to record real physical
  // presence here would silently drop a legitimate reservation - exactly the
  // phantom-reservation bug this API exists to prevent.
  syncTrainOccupancy(trainId, tileIdxList) {
    const wanted = new Set();
    for (const idx of tileIdxList) {
      const bId = this.blockAt(idx);
      if (bId != null) wanted.add(bId);
    }
    const held = this._trainBlocks.get(trainId) || new Set();

    for (const bId of held) {
      if (!wanted.has(bId)) this.releaseBlock(bId, trainId);
    }

    for (const bId of wanted) {
      if (held.has(bId)) continue;
      const block = this.blocks.get(bId);
      if (block) block.occupants.add(trainId);
    }
    this._trainBlocks.set(trainId, wanted);
    this._refreshSignalStates();

    if (tileIdxList.length === 0) this._trainTiles.delete(trainId);
    else this._trainTiles.set(trainId, new Set(tileIdxList));
  }

  // ---- Pathfinding --------------------------------------------------------

  _stepMoveCost(aIdx, bIdx) {
    const base = stepDist(aIdx, bIdx);
    const terrainRaw = this.world.terrainFactor(bIdx);
    const terrain = typeof terrainRaw === 'number' && terrainRaw > 0 ? terrainRaw : 1;
    const elevA = this.world.elevationAt(aIdx) || 0;
    const elevB = this.world.elevationAt(bIdx) || 0;
    const rise = Math.max(0, elevB - elevA);
    return base * terrain * (1 + GRADE_FACTOR * rise);
  }

  // A* over track links. Never throws, never hangs: bounded by MAX_EXPANSIONS
  // and returns null for missing/disconnected track rather than looping.
  findPath(fromIdx, toIdx, opts = {}) {
    if (!this.track.has(fromIdx) || !this.track.has(toIdx)) return null;
    if (fromIdx === toIdx) return { tiles: [fromIdx], cost: 0 };

    const avoidBlocked = !!opts.avoidBlocked;
    const goal = xy(toIdx);
    const open = new MinHeap();
    const gScore = new Map([[fromIdx, 0]]);
    const cameFrom = new Map();
    const closed = new Set();

    const start = xy(fromIdx);
    open.push(fromIdx, euclid(start.x, start.y, goal.x, goal.y));

    let expansions = 0;
    while (open.size > 0) {
      if (expansions++ > MAX_EXPANSIONS) return null;
      const cur = open.pop();
      if (cur === undefined) break;
      if (closed.has(cur)) continue;
      if (cur === toIdx) {
        const tiles = reconstructPath(cameFrom, fromIdx, cur);
        return tiles ? { tiles, cost: gScore.get(cur) } : null;
      }
      closed.add(cur);

      const tile = this.track.get(cur);
      const p = xy(cur);
      for (let d = 0; d < 8; d++) {
        if (!(tile.links & (1 << d))) continue;
        const nx = p.x + DIR_DX[d];
        const ny = p.y + DIR_DY[d];
        if (!inBounds(nx, ny)) continue;
        const nIdx = idxAt(nx, ny);
        if (!this.track.has(nIdx) || closed.has(nIdx)) continue;
        if (avoidBlocked) {
          const wt = this.world.tileAtIdx(nIdx);
          if (wt && wt.blocked) continue;
        }
        const tentative = gScore.get(cur) + this._stepMoveCost(cur, nIdx);
        if (tentative < (gScore.has(nIdx) ? gScore.get(nIdx) : Infinity)) {
          gScore.set(nIdx, tentative);
          cameFrom.set(nIdx, cur);
          open.push(nIdx, tentative + euclid(nx, ny, goal.x, goal.y));
        }
      }
    }
    return null;
  }

  // ---- Construction --------------------------------------------------------

  _classifyPlanTile(idx, worldTile) {
    if (this.track.has(idx)) {
      const existing = this.track.get(idx);
      return { kind: existing.kind, cost: 0, isNewBuild: false };
    }
    if (worldTile.type === 'water') return { kind: 'bridge', cost: Math.round(BRIDGE_COST * this._costMult.bridge), isNewBuild: true };
    if (worldTile.type === 'mountain') return { kind: 'tunnel', cost: TUNNEL_COST, isNewBuild: true };
    const base = TRACK_COST[worldTile.type] ?? TRACK_COST.plain;
    return { kind: 'rail', cost: Math.round(base * this._costMult.track), isNewBuild: true };
  }

  // Evaluates a single idx sequence for legality/cost, simulating the
  // diagonal-crossing invariant against both committed track and the links
  // this route would itself add (so a route can't cross itself).
  _evaluateRoute(idxList) {
    const tiles = [];
    let totalCost = 0;
    const overlay = new Map();
    let waterRun = 0;

    for (let i = 0; i < idxList.length; i++) {
      const idx = idxList[i];
      if (!inBoundsIdx(idx)) return { tiles, totalCost, legal: false, reason: 'out of bounds' };
      const wt = this.world.tileAtIdx(idx);
      if (!wt) return { tiles, totalCost, legal: false, reason: 'no tile' };
      if (!this.track.has(idx) && !this.world.isBuildable(idx)) {
        return { tiles, totalCost, legal: false, reason: 'not buildable' };
      }

      const { kind, cost, isNewBuild } = this._classifyPlanTile(idx, wt);
      waterRun = wt.type === 'water' ? waterRun + 1 : 0;
      if (isNewBuild && wt.type === 'water' && waterRun >= 2 && !this.unlockedTechs.has('long_span')) {
        return { tiles, totalCost, legal: false, reason: 'wide water needs long_span tech' };
      }
      if (isNewBuild && wt.type === 'mountain' && !this.unlockedTechs.has('tunnelling')) {
        return { tiles, totalCost, legal: false, reason: 'mountain needs tunnelling tech' };
      }

      tiles.push({ idx, kind, cost });
      totalCost += cost;

      if (i > 0) {
        const prevIdx = idxList[i - 1];
        const pp = xy(prevIdx);
        const d = dirFromTo(prevIdx, idx);
        if (d == null) return { tiles, totalCost, legal: false, reason: 'non-adjacent step' };
        if (isDiagonalDir(d) && crossesExistingDiagonal(overlay, this.track, pp.x, pp.y, d)) {
          return { tiles, totalCost, legal: false, reason: 'crosses existing diagonal' };
        }
        overlay.set(prevIdx, (overlay.get(prevIdx) || 0) | (1 << d));
        overlay.set(idx, (overlay.get(idx) || 0) | (1 << OPPOSITE[d]));
      }
    }
    return { tiles, totalCost, legal: true, reason: null };
  }

  // Auto-routes an 8-way line with at most one bend: diagonal-then-straight
  // or straight-then-diagonal, whichever ends up cheaper (this is also how
  // "prefer cheap terrain when nearly free" is satisfied -- both bend orders
  // are evaluated for real cost and the cheaper one wins).
  planTrack(fromIdx, toIdx) {
    if (!inBoundsIdx(fromIdx) || !inBoundsIdx(toIdx)) {
      return { tiles: [], totalCost: 0, legal: false, reason: 'out of bounds' };
    }
    if (fromIdx === toIdx) return this._evaluateRoute([fromIdx]);

    const a = xy(fromIdx);
    const b = xy(toIdx);
    const candidates = [buildLine(a, b, true), buildLine(a, b, false)];

    let best = null;
    for (const route of candidates) {
      const evaluated = this._evaluateRoute(route);
      if (evaluated.legal && (!best || !best.legal || evaluated.totalCost < best.totalCost)) {
        best = evaluated;
      } else if (!best) {
        best = evaluated;
      }
    }
    return best || { tiles: [], totalCost: 0, legal: false, reason: 'no route' };
  }

  buildTrack(plan) {
    if (!plan || !plan.legal || !plan.tiles || plan.tiles.length === 0) return false;

    for (const t of plan.tiles) {
      if (!this.track.has(t.idx)) {
        this.track.set(t.idx, {
          idx: t.idx, links: 0, kind: t.kind, electrified: false, cost: t.cost, blockId: null,
        });
      }
    }
    for (let i = 0; i < plan.tiles.length - 1; i++) {
      const a = plan.tiles[i].idx;
      const b = plan.tiles[i + 1].idx;
      if (!this.link(a, b)) {
        // Shouldn't happen if planTrack's own legality check passed, but
        // never leave a half-linked plan silently inconsistent.
        return false;
      }
    }
    this.recomputeBlocks();
    this.bus.emit('track:built', { tiles: plan.tiles.map((t) => t.idx), cost: plan.totalCost });
    return true;
  }

  removeTrack(idx) {
    const tile = this.track.get(idx);
    if (!tile) return 0;
    // A station's footprint is the only anchor trains.js has for placing and
    // routing trains there (see spawnAtFirstStop/pickStationTargetIdx) --
    // bulldozing it out from under a live station would leave
    // `station.tiles`/`originIdx` pointing at track that no longer exists,
    // forever. Refuse instead of leaving that dangling trap.
    for (const station of this.stations.values()) {
      if (station.tiles.includes(idx)) {
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit('toast', { text: `Can't bulldoze track under ${station.name || 'a station'}.`, kind: 'bad' });
        }
        return 0;
      }
    }
    const p = xy(idx);
    for (let d = 0; d < 8; d++) {
      if (!(tile.links & (1 << d))) continue;
      const nx = p.x + DIR_DX[d];
      const ny = p.y + DIR_DY[d];
      if (!inBounds(nx, ny)) continue;
      const nIdx = idxAt(nx, ny);
      this.signals.delete(signalKeyFor(idx, nIdx));
      this.unlink(idx, nIdx);
    }
    this.track.delete(idx);
    const refund = Math.round(tile.cost * DEMOLISH_REFUND);
    this.recomputeBlocks();
    return refund;
  }

  // Best-effort default 2x1 footprint: an already-track-covered tile plus one
  // track-covered neighbour (east, else south). DESIGN.md doesn't specify the
  // exact footprint-choice algorithm, and this module has no site lookup to
  // validate STATION_RADIUS against, so callers are expected to have already
  // confirmed adjacency to the served site. // CONTRACT-GAP
  _defaultStationFootprint(idx) {
    if (!this.track.has(idx)) return null;
    const p = xy(idx);
    if (inBounds(p.x + 1, p.y)) {
      const east = idxAt(p.x + 1, p.y);
      if (this.track.has(east)) return [idx, east];
    }
    if (inBounds(p.x, p.y + 1)) {
      const south = idxAt(p.x, p.y + 1);
      if (this.track.has(south)) return [idx, south];
    }
    return [idx];
  }

  buildStation(siteId, idx, opts = {}) {
    const platforms = clamp(Math.round(opts.platforms || 1), 1, 3);
    const tiles = opts.tiles ? opts.tiles.slice() : this._defaultStationFootprint(idx);
    if (!tiles) return { ok: false, reason: 'no footprint' };
    for (const t of tiles) {
      if (!this.track.has(t)) return { ok: false, reason: 'station must be built on existing track' };
    }
    const id = `st${this._stationIdSeq++}`;
    const cost = STATION_COST + (platforms - 1) * EXTRA_PLATFORM_COST;
    const station = {
      id,
      name: opts.name || id,
      siteId,
      originIdx: idx,
      tiles: tiles.slice(),
      platforms,
      waiting: {},
      accepts: new Set(opts.accepts || []),
      level: 1,
    };
    this.stations.set(id, station);
    this.recomputeBlocks();
    this.bus.emit('station:built', { stationId: id });
    return { ok: true, station, cost };
  }

  electrifyTrack(idx, unlockedTechs) {
    const techs = unlockedTechs || this.unlockedTechs;
    if (!techs.has('electrification')) return { ok: false, reason: 'electrification not unlocked' };
    const tile = this.track.get(idx);
    if (!tile) return { ok: false, reason: 'no track there' };
    if (tile.electrified) return { ok: true, cost: 0 };
    tile.electrified = true;
    const cost = ELECTRIFY_COST_PER_TILE;
    this.bus.emit('track:built', { tiles: [idx], cost });
    return { ok: true, cost };
  }

  // ---- Deadlock detection --------------------------------------------------

  // Standard DFS cycle detection restricted to nodes present in `graph`
  // (trains currently in waiting_signal). Returns the cycle as an array of
  // train ids, or null.
  _findCycle(graph) {
    const color = new Map(); // 1 = on stack, 2 = fully explored
    const stack = [];
    const visit = (u) => {
      color.set(u, 1);
      stack.push(u);
      const edges = graph.get(u) || new Set();
      for (const v of edges) {
        if (!graph.has(v)) continue; // v isn't itself waiting -> not a cycle
        const c = color.get(v);
        if (c === 1) return stack.slice(stack.indexOf(v));
        if (c !== 2) {
          const found = visit(v);
          if (found) return found;
        }
      }
      stack.pop();
      color.set(u, 2);
      return null;
    };
    for (const u of graph.keys()) {
      if (!color.has(u)) {
        const found = visit(u);
        if (found) return found;
      }
    }
    return null;
  }

  // Repeatedly finds one cycle via _findCycle, removes its nodes from
  // consideration, and looks again -- so several *disjoint* contention groups
  // stuck at once (e.g. two separate single-track knots in a big soak) are
  // all found, not just whichever one the DFS happens to hit first.
  _findAllCycles(graph) {
    const remaining = new Set(graph.keys());
    const cycles = [];
    for (;;) {
      const sub = new Map();
      for (const u of remaining) {
        const edges = new Set();
        for (const v of (graph.get(u) || [])) if (remaining.has(v)) edges.add(v);
        sub.set(u, edges);
      }
      const cycle = this._findCycle(sub);
      if (!cycle || cycle.length < 2) break;
      cycles.push(cycle);
      for (const id of cycle) remaining.delete(id);
    }
    return cycles;
  }

  // Per DESIGN.md section 6: >=2 trains waiting_signal for more than
  // DEADLOCK_SECONDS with a cycle in the wait-for graph -> emit
  // train:deadlock, at most once per 30s per contention group. `dt` is
  // optional game-seconds elapsed since the previous call (see the
  // CONTRACT-GAP note at the top of this file); without it the internal
  // clock never advances.
  detectDeadlock(trains, dt = 0) {
    this._clock += dt;

    const stillWaiting = new Set();
    for (const t of trains) {
      if (t.state === 'waiting_signal') {
        stillWaiting.add(t.id);
        if (!this._waitSince.has(t.id)) this._waitSince.set(t.id, this._clock);
      }
    }
    for (const id of Array.from(this._waitSince.keys())) {
      if (!stillWaiting.has(id)) this._waitSince.delete(id);
    }

    const waitFor = new Map();
    for (const t of trains) {
      if (t.state !== 'waiting_signal') continue;
      const nextIdx = Array.isArray(t.path) ? t.path[t.pathIndex + 1] : undefined;
      if (nextIdx == null) continue;
      const blockId = this.blockAt(nextIdx);
      if (blockId == null) continue;
      const block = this.blocks.get(blockId);
      if (!block) continue;
      const holders = new Set();
      for (const occ of block.occupants) {
        if (occ !== t.id) holders.add(occ);
      }
      waitFor.set(t.id, holders);
    }

    const cycles = this._findAllCycles(waitFor);
    for (const cycle of cycles) {
      let allWaitedLongEnough = true;
      for (const id of cycle) {
        const since = this._waitSince.get(id);
        if (since == null || this._clock - since < DEADLOCK_SECONDS) { allWaitedLongEnough = false; break; }
      }
      if (!allWaitedLongEnough) continue;

      const groupKey = cycle.slice().sort().join(',');
      const lastEmit = this._lastDeadlockEmit.get(groupKey) ?? -Infinity;
      if (this._clock - lastEmit < DEADLOCK_EMIT_COOLDOWN) continue;

      this._lastDeadlockEmit.set(groupKey, this._clock);
      this.bus.emit('train:deadlock', { trainIds: Array.from(cycle) });
    }
  }

  // ---- Save/load --------------------------------------------------------

  serialize() {
    return {
      track: Array.from(this.track.values()).map((t) => ({
        idx: t.idx, links: t.links, kind: t.kind, electrified: t.electrified, cost: t.cost,
      })),
      signals: Array.from(this.signals.values()).map((s) => ({
        id: s.id, a: s.a, b: s.b, dir: s.dir, green: s.green, kind: s.kind,
      })),
      stations: Array.from(this.stations.values()).map((st) => ({
        id: st.id,
        name: st.name,
        siteId: st.siteId,
        originIdx: st.originIdx,
        tiles: st.tiles.slice(),
        platforms: st.platforms,
        waiting: { ...st.waiting },
        accepts: Array.from(st.accepts),
        level: st.level,
      })),
      unlockedTechs: Array.from(this.unlockedTechs),
    };
  }

  deserialize(data) {
    this.track = new Map();
    this.signals = new Map();
    this.stations = new Map();
    this.blocks = new Map();
    this._trainTiles = new Map();
    this._trainBlocks = new Map();
    this._waitSince = new Map();
    this._clock = 0;
    this._lastDeadlockEmit = new Map();
    this._signalIdSeq = 0;
    this._stationIdSeq = 0;

    if (!data) return;

    for (const t of data.track || []) {
      this.track.set(t.idx, {
        idx: t.idx, links: t.links, kind: t.kind, electrified: !!t.electrified, cost: t.cost, blockId: null,
      });
    }
    for (const s of data.signals || []) {
      this.signals.set(signalKeyFor(s.a, s.b), {
        id: s.id, a: s.a, b: s.b, dir: s.dir, green: s.green, kind: s.kind,
      });
      const n = parseInt(String(s.id).replace(/\D/g, ''), 10);
      if (!Number.isNaN(n) && n >= this._signalIdSeq) this._signalIdSeq = n + 1;
    }
    for (const st of data.stations || []) {
      this.stations.set(st.id, {
        id: st.id,
        name: st.name,
        siteId: st.siteId,
        originIdx: st.originIdx,
        tiles: st.tiles.slice(),
        platforms: st.platforms,
        waiting: { ...st.waiting },
        accepts: new Set(st.accepts || []),
        level: st.level,
      });
      const n = parseInt(String(st.id).replace(/\D/g, ''), 10);
      if (!Number.isNaN(n) && n >= this._stationIdSeq) this._stationIdSeq = n + 1;
    }
    this.unlockedTechs = new Set(data.unlockedTechs || []);

    this.recomputeBlocks();
  }
}

// One-bend 8-way line between two {x,y} points: `diagonalFirst` picks whether
// the diagonal phase or the straight phase runs first, giving two candidate
// routes for planTrack to cost out and choose between.
function buildLine(a, b, diagonalFirst) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const diagSteps = Math.min(Math.abs(dx), Math.abs(dy));
  const straightSteps = Math.abs(Math.abs(dx) - Math.abs(dy));
  const straightDx = Math.abs(dx) > Math.abs(dy) ? sx : 0;
  const straightDy = Math.abs(dy) > Math.abs(dx) ? sy : 0;

  const points = [{ x: a.x, y: a.y }];
  let cx = a.x;
  let cy = a.y;
  const doDiag = () => {
    for (let i = 0; i < diagSteps; i++) {
      cx += sx; cy += sy;
      points.push({ x: cx, y: cy });
    }
  };
  const doStraight = () => {
    for (let i = 0; i < straightSteps; i++) {
      cx += straightDx; cy += straightDy;
      points.push({ x: cx, y: cy });
    }
  };
  if (diagonalFirst) { doDiag(); doStraight(); } else { doStraight(); doDiag(); }
  return points.map((pt) => idxAt(pt.x, pt.y));
}
