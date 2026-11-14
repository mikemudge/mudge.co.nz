/**
 * Hearthmere — roads, walkability and pathfinding (DESIGN §6).
 *
 * Road state itself lives in `world.road`; this module owns the placement
 * helpers that write it, the allocation-free A*, the nearest-of-N Dijkstra,
 * the per-tick call budget and its request queue, the lazy region flood fill
 * and the cached `isConnected` road-adjacency rule.
 *
 * Performance notes that are load-bearing, not decoration:
 *  - Everything the search touches is a flat typed array sized GRID_W*GRID_H.
 *    No per-node objects: A* pops thousands of nodes a tick and object churn
 *    would dominate the frame.
 *  - Visited state is tagged with a per-search generation stamp rather than
 *    cleared between calls, so a search costs only what it expands.
 *  - Walkability and move cost are mirrored into local arrays, refreshed only
 *    when `world.rev` moves. That makes invalidation a single integer compare
 *    instead of trusting every other module to remember to call us.
 *
 * No DOM: imports cleanly under Node 22 (DESIGN §18).
 */

import {
  GRID_W, GRID_H,
  PATH_NODE_BUDGET, PATH_CALLS_PER_TICK,
  ROAD_NONE, ROAD_DIRT, ROAD_COBBLE,
  TERRAIN, TERRAIN_INFO,
} from './constants.js';

import { MinHeap, octile } from './utils.js';

const N_TILES = GRID_W * GRID_H;
const SQRT2 = Math.SQRT2;

// 8-way offsets, same order as constants.DIR_DX/DIR_DY (0:E 1:SE ... 7:NE).
const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];
const STEP = [1, SQRT2, 1, SQRT2, 1, SQRT2, 1, SQRT2];

// Stamps are int32; wrap well before they can collide with a stale value.
const STAMP_LIMIT = 0x3fffffff;

const OPEN = 1;
const CLOSED = 2;

// V3 sealing check. The measured pockets are 1-16 tiles; the cap is what keeps
// the build ghost cheap, and a side bigger than it is simply never claimed as
// sealed. SEAL_MAX_SIDES covers the ring of any legal footprint.
const SEAL_CAP = 192;
const SEAL_MAX_SIDES = 8;
const RING_MAX = 64;

export function createPaths(game) {
  return new Paths(game);
}

class Paths {
  constructor(game) {
    // Only the reference is stored — no other module is read until init().
    this.game = game;
    this.world = null;

    // Mirrors of world state, refreshed on world.rev change.
    this.cost = new Float64Array(N_TILES);
    this.walk = new Uint8Array(N_TILES);
    this.ewalk = new Uint8Array(N_TILES);
    this.rev = -1;

    // Search scratch. `stamp` says whether g/state/from are from this search.
    this.g = new Float64Array(N_TILES);
    this.from = new Int32Array(N_TILES);
    this.stamp = new Int32Array(N_TILES);
    this.state = new Uint8Array(N_TILES);
    this.gen = 0;

    // findMulti target marking, stamped the same way.
    this.targetStamp = new Int32Array(N_TILES);
    this.targetOwner = new Int32Array(N_TILES);
    this.targetGen = 0;

    this.heap = new MinHeap(2048);
    this.pathBuf = new Int32Array(N_TILES);

    this.regions = new Int32Array(N_TILES);
    this.regionsDirty = true;
    this.regionCount = 0;
    this.regionQueue = new Int32Array(N_TILES);

    // V3 sealing check. The big arrays wait for the first flood; the ring and
    // the per-side tallies are small enough to hold always.
    this.ring = new Int32Array(RING_MAX);
    this.sealSeed = new Int32Array(SEAL_MAX_SIDES);
    this.sealPre = new Int32Array(SEAL_MAX_SIDES);
    this.sealSeen = null;
    this.sealOwner = null;
    this.blockStamp = null;
    this.sealQ = null;
    this.sealHead = null;
    this.sealTail = null;
    this.sealRoot = null;
    this.sealFull = null;
    this.sealDone = null;
    this.sealGen = 0;
    this.blockGen = 0;
    // Dropped wholesale in sync(): a memo is only ever valid for one world.rev.
    this.sealMemo = new Map();

    // b.id -> bool. Dropped wholesale whenever roads or walls change; road
    // edits are rare and buildings.js asks for this every tick per building.
    this.connCache = new Map();

    this.queue = [];
    this.queueHead = 0;
    this.nextRequestId = 1;
    this.callsThisTick = 0;

    /** Why the last find/findMulti returned null: '', 'budget', 'unreachable'. */
    this.lastFailure = '';

    this.stats = {
      calls: 0,
      nodesExpanded: 0,
      budgetFailures: 0,
      regionRebuilds: 0,
      sealChecks: 0,
      sealFloods: 0,
      sealNodes: 0,
      queued: 0,
      served: 0,
      callsLastTick: 0,
    };
  }

  /** Safe to cross-reference now (DESIGN §12). */
  init() {
    this.world = this.game && this.game.world ? this.game.world : null;
    this.sync();
  }

  /** Refresh the mirrored arrays if world has changed under us. */
  sync() {
    const w = this.world || (this.world = this.game && this.game.world);
    if (!w) return false;
    if (w.rev === this.rev) return false;
    this.rev = w.rev;
    const cost = this.cost;
    const walk = this.walk;
    const ewalk = this.ewalk;
    for (let i = 0; i < N_TILES; i++) {
      const ok = w.isWalkable(i) ? 1 : 0;
      walk[i] = ok;
      ewalk[i] = ok !== 0 && w.gate[i] === 0 ? 1 : 0;
      cost[i] = w.moveCost(i);
    }
    this.regionsDirty = true;
    this.connCache.clear();
    this.sealMemo.clear();
    return true;
  }

  /**
   * Drop every cache and rebuild from world. FROZEN restore order (§14) puts
   * this immediately after `world.restore()` and before `buildings.restore()`.
   */
  rebuild() {
    this.rev = -1;
    this.queue.length = 0;
    this.queueHead = 0;
    this.callsThisTick = 0;
    this.connCache.clear();
    this.sealMemo.clear();
    this.regionsDirty = true;
    this.sync();
  }

  /** Manual invalidation hook for anything that edits world tiles by hand. */
  invalidate() {
    this.rev = -1;
    this.sync();
  }

  /* ================================================================== *
   * Road placement (§6). world owns the array; these write it.
   * ================================================================== */

  /**
   * Can a road of `kind` go on this tile? Roads go on any walkable, unbuilt
   * tile including FOREST (auto-cleared) and ROCK; `overWater` is the bridge
   * case, which is the only way onto WATER/SHORE.
   */
  canPlaceRoad(idx, kind, overWater) {
    const w = this.world;
    if (!w || idx < 0 || idx >= N_TILES) return { ok: false, reason: 'out of bounds' };
    if (w.building[idx] !== -1) return { ok: false, reason: 'blocked' };
    const t = w.terrain[idx];
    if (overWater) {
      if (t !== TERRAIN.WATER && t !== TERRAIN.SHORE) return { ok: false, reason: 'needs water' };
    } else {
      if (!TERRAIN_INFO[t].walkable) return { ok: false, reason: 'blocked' };
    }
    if (kind !== ROAD_DIRT && kind !== ROAD_COBBLE) return { ok: false, reason: 'not a road' };
    // Cobble over bare ground is legal as well as over dirt; the def says it
    // "upgrades a dirt tile in place", which is the common case, not a limit.
    if (w.road[idx] === kind) return { ok: false, reason: 'already paved' };
    return { ok: true, reason: '' };
  }

  /**
   * Lay or upgrade a road. Returns true if the tile changed. Clears forest
   * under it (§6) and invalidates every cached path answer.
   */
  setRoad(idx, kind, overWater) {
    const check = this.canPlaceRoad(idx, kind, overWater);
    if (!check.ok) return false;
    const changed = this.world.setRoad(idx, kind);
    if (changed) this.sync();
    return changed;
  }

  /** Remove a road tile (no refund, §6). */
  removeRoad(idx) {
    const w = this.world;
    if (!w || idx < 0 || idx >= N_TILES) return false;
    if (w.road[idx] === ROAD_NONE) return false;
    const changed = w.setRoad(idx, ROAD_NONE);
    if (changed) this.sync();
    return changed;
  }

  /** Wall/solid-building flag. buildings.js calls this, not world, so the
   *  region and connectivity caches are dropped in the same breath. */
  setSolid(idx, solid) {
    const w = this.world;
    if (!w) return false;
    const changed = w.setSolid(idx, solid);
    if (changed) this.sync();
    return changed;
  }

  /** Gate flag: villagers walk through, raiders do not (§10.3). */
  setGate(idx, isGate) {
    const w = this.world;
    if (!w) return false;
    const changed = w.setGate(idx, isGate);
    if (changed) this.sync();
    return changed;
  }

  isWalkable(idx) {
    this.sync();
    return idx >= 0 && idx < N_TILES && this.walk[idx] !== 0;
  }

  isEnemyWalkable(idx) {
    this.sync();
    return idx >= 0 && idx < N_TILES && this.ewalk[idx] !== 0;
  }

  /* ================================================================== *
   * A* (§6)
   * ================================================================== */

  /** Bump the search generation, wrapping the stamps if it ever runs out. */
  nextGen() {
    if (++this.gen >= STAMP_LIMIT) {
      this.stamp.fill(0);
      this.gen = 1;
    }
    return this.gen;
  }

  /**
   * A* over 8-way neighbours.
   *
   * `opts`:
   *   enemy     — use the raider walkability mask (gates and walls blocked).
   *   adjacent  — succeed on any tile orthogonally/diagonally next to `to`.
   *               Forced on automatically when `to` itself is not walkable,
   *               which is what makes "path to a shore tile" and "path to a
   *               building footprint" work without every caller knowing.
   *   maxNodes  — expansion budget, default PATH_NODE_BUDGET (4000).
   *   greedy    — fall back to findGreedy() instead of returning null.
   *
   * Returns `{tiles: Int32Array, cost: number}` or null. `tiles[0]` is always
   * `from` and the last entry is the tile actually reached. `cost` is in
   * cobble-tile equivalents (ADDENDUM C) — real seconds are cost/FASTEST_SPEED.
   */
  find(fromIdx, toIdx, opts) {
    this.sync();
    this.lastFailure = '';
    const w = this.world;
    if (!w) return null;
    if (fromIdx < 0 || fromIdx >= N_TILES || toIdx < 0 || toIdx >= N_TILES) {
      this.lastFailure = 'unreachable';
      return null;
    }

    this.stats.calls++;
    this.callsThisTick++;

    const enemy = !!(opts && opts.enemy);
    const walk = enemy ? this.ewalk : this.walk;
    const budget = opts && opts.maxNodes > 0 ? opts.maxNodes | 0 : PATH_NODE_BUDGET;
    const adjacent = !!(opts && opts.adjacent) || walk[toIdx] === 0;

    if (fromIdx === toIdx) return this.singleTilePath(fromIdx);

    const tx = toIdx % GRID_W;
    const ty = (toIdx / GRID_W) | 0;

    if (adjacent) {
      const fx = fromIdx % GRID_W;
      const fy = (fromIdx / GRID_W) | 0;
      const ddx = fx > tx ? fx - tx : tx - fx;
      const ddy = fy > ty ? fy - ty : ty - fy;
      if (ddx <= 1 && ddy <= 1) return this.singleTilePath(fromIdx);
    } else if (walk[toIdx] === 0) {
      this.lastFailure = 'unreachable';
      return null;
    }

    const gen = this.nextGen();
    const stamp = this.stamp;
    const g = this.g;
    const cameFrom = this.from;
    const state = this.state;
    const cost = this.cost;
    const heap = this.heap;
    heap.clear();

    stamp[fromIdx] = gen;
    g[fromIdx] = 0;
    cameFrom[fromIdx] = -1;
    state[fromIdx] = OPEN;
    // Admissible because the cheapest tile costs exactly 1.0 (ADDENDUM C), so
    // octile is a true lower bound. In `adjacent` mode the goal may sit one
    // step short of `to`, so the bound gives back the cheapest diagonal.
    const slack = adjacent ? SQRT2 : 0;
    const h0 = octile(fromIdx % GRID_W, (fromIdx / GRID_W) | 0, tx, ty) - slack;
    heap.push(fromIdx, h0 > 0 ? h0 : 0);

    let expansions = 0;
    while (heap.size > 0) {
      const cur = heap.pop();
      if (state[cur] === CLOSED) continue;
      state[cur] = CLOSED;

      if (cur === toIdx) return this.buildPath(cur, gen);
      if (adjacent) {
        const cx = cur % GRID_W;
        const cy = (cur / GRID_W) | 0;
        const ddx = cx > tx ? cx - tx : tx - cx;
        const ddy = cy > ty ? cy - ty : ty - cy;
        if (ddx <= 1 && ddy <= 1) return this.buildPath(cur, gen);
      }

      if (++expansions > budget) {
        this.stats.budgetFailures++;
        this.lastFailure = 'budget';
        return opts && opts.greedy ? this.findGreedy(fromIdx, toIdx, opts) : null;
      }

      const cx = cur % GRID_W;
      const cy = (cur / GRID_W) | 0;
      const gc = g[cur];

      for (let d = 0; d < 8; d++) {
        const nx = cx + DX[d];
        if (nx < 0 || nx >= GRID_W) continue;
        const ny = cy + DY[d];
        if (ny < 0 || ny >= GRID_H) continue;
        const n = ny * GRID_W + nx;
        if (walk[n] === 0) continue;
        if ((d & 1) === 1) {
          // No corner-cutting: a diagonal is refused when BOTH of the
          // orthogonal tiles it squeezes between are blocked (§6).
          const a = cy * GRID_W + nx;
          const b = ny * GRID_W + cx;
          if (walk[a] === 0 && walk[b] === 0) continue;
        }
        if (stamp[n] !== gen) {
          stamp[n] = gen;
          g[n] = Infinity;
          state[n] = 0;
        } else if (state[n] === CLOSED) {
          continue;
        }
        const tentative = gc + cost[n] * STEP[d];
        if (tentative >= g[n]) continue;
        g[n] = tentative;
        cameFrom[n] = cur;
        state[n] = OPEN;
        const h = octile(nx, ny, tx, ty) - slack;
        heap.push(n, tentative + (h > 0 ? h : 0));
      }
    }

    this.stats.nodesExpanded += expansions;
    this.lastFailure = 'unreachable';
    return opts && opts.greedy ? this.findGreedy(fromIdx, toIdx, opts) : null;
  }

  singleTilePath(idx) {
    const tiles = new Int32Array(1);
    tiles[0] = idx;
    return { tiles, cost: 0 };
  }

  /** Walk `from` links back from `goal` into the shared buffer, then copy. */
  buildPath(goal, gen) {
    const cameFrom = this.from;
    const stamp = this.stamp;
    const buf = this.pathBuf;
    let n = 0;
    let cur = goal;
    while (cur >= 0 && n < N_TILES) {
      buf[n++] = cur;
      if (stamp[cur] !== gen) break;
      cur = cameFrom[cur];
    }
    const tiles = new Int32Array(n);
    for (let i = 0; i < n; i++) tiles[i] = buf[n - 1 - i];
    return { tiles, cost: this.g[goal] };
  }

  /**
   * One Dijkstra to the nearest of several targets — always use this instead
   * of N separate A* calls for "nearest granary" style queries (§6).
   * Returns `{tiles, cost, target, goal}` or null; `target` is the requested
   * tile, `goal` the tile actually stood on (they differ for unwalkable
   * targets such as a shore tile or a solid footprint).
   */
  findMulti(fromIdx, targets, opts) {
    this.sync();
    this.lastFailure = '';
    const w = this.world;
    if (!w || !targets || targets.length === 0) return null;
    if (fromIdx < 0 || fromIdx >= N_TILES) return null;

    this.stats.calls++;
    this.callsThisTick++;

    const enemy = !!(opts && opts.enemy);
    const walk = enemy ? this.ewalk : this.walk;
    // A full sweep is 5184 expansions, more than one A* budget, and it is
    // replacing N of them — so it gets its own, larger default.
    const budget = opts && opts.maxNodes > 0 ? opts.maxNodes | 0 : N_TILES;

    const tgen = ++this.targetGen;
    const tstamp = this.targetStamp;
    const towner = this.targetOwner;
    let any = false;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (t < 0 || t >= N_TILES) continue;
      if (walk[t] !== 0) {
        tstamp[t] = tgen;
        towner[t] = t;
        any = true;
        continue;
      }
      // Unwalkable target: stand next to it instead.
      const tx = t % GRID_W;
      const ty = (t / GRID_W) | 0;
      for (let d = 0; d < 8; d++) {
        const nx = tx + DX[d];
        const ny = ty + DY[d];
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        const n = ny * GRID_W + nx;
        if (walk[n] === 0) continue;
        if (tstamp[n] !== tgen) {
          tstamp[n] = tgen;
          towner[n] = t;
          any = true;
        }
      }
    }
    if (!any) {
      this.lastFailure = 'unreachable';
      return null;
    }

    if (tstamp[fromIdx] === tgen) {
      const r = this.singleTilePath(fromIdx);
      r.target = towner[fromIdx];
      r.goal = fromIdx;
      return r;
    }

    const gen = this.nextGen();
    const stamp = this.stamp;
    const g = this.g;
    const cameFrom = this.from;
    const state = this.state;
    const cost = this.cost;
    const heap = this.heap;
    heap.clear();

    stamp[fromIdx] = gen;
    g[fromIdx] = 0;
    cameFrom[fromIdx] = -1;
    state[fromIdx] = OPEN;
    heap.push(fromIdx, 0);

    let expansions = 0;
    while (heap.size > 0) {
      const cur = heap.pop();
      if (state[cur] === CLOSED) continue;
      state[cur] = CLOSED;

      if (tstamp[cur] === tgen) {
        const r = this.buildPath(cur, gen);
        r.target = towner[cur];
        r.goal = cur;
        return r;
      }
      if (++expansions > budget) {
        this.stats.budgetFailures++;
        this.lastFailure = 'budget';
        return null;
      }

      const cx = cur % GRID_W;
      const cy = (cur / GRID_W) | 0;
      const gc = g[cur];
      for (let d = 0; d < 8; d++) {
        const nx = cx + DX[d];
        if (nx < 0 || nx >= GRID_W) continue;
        const ny = cy + DY[d];
        if (ny < 0 || ny >= GRID_H) continue;
        const n = ny * GRID_W + nx;
        if (walk[n] === 0) continue;
        if ((d & 1) === 1) {
          const a = cy * GRID_W + nx;
          const b = ny * GRID_W + cx;
          if (walk[a] === 0 && walk[b] === 0) continue;
        }
        if (stamp[n] !== gen) {
          stamp[n] = gen;
          g[n] = Infinity;
          state[n] = 0;
        } else if (state[n] === CLOSED) {
          continue;
        }
        const tentative = gc + cost[n] * STEP[d];
        if (tentative >= g[n]) continue;
        g[n] = tentative;
        cameFrom[n] = cur;
        state[n] = OPEN;
        heap.push(n, tentative);
      }
    }

    this.lastFailure = 'unreachable';
    return null;
  }

  /**
   * The over-budget fallback (§6): step greedily toward the target, ignoring
   * cost but respecting walkability and the corner rule. Guaranteed to
   * terminate — every step consumes a tile that is then marked visited, so it
   * can run at most once per tile. Returns the full path if it arrives, the
   * partial path if it at least got closer, otherwise null.
   */
  findGreedy(fromIdx, toIdx, opts) {
    this.sync();
    if (fromIdx < 0 || fromIdx >= N_TILES || toIdx < 0 || toIdx >= N_TILES) return null;
    const walk = opts && opts.enemy ? this.ewalk : this.walk;
    const adjacent = !!(opts && opts.adjacent) || walk[toIdx] === 0;

    const tx = toIdx % GRID_W;
    const ty = (toIdx / GRID_W) | 0;
    const gen = this.nextGen();
    const stamp = this.stamp;
    const buf = this.pathBuf;

    let cur = fromIdx;
    let n = 0;
    buf[n++] = cur;
    stamp[cur] = gen;
    const startDist = octile(fromIdx % GRID_W, (fromIdx / GRID_W) | 0, tx, ty);
    let reached = false;

    while (n < N_TILES) {
      const cx = cur % GRID_W;
      const cy = (cur / GRID_W) | 0;
      const ddx = cx > tx ? cx - tx : tx - cx;
      const ddy = cy > ty ? cy - ty : ty - cy;
      if (cur === toIdx || (adjacent && ddx <= 1 && ddy <= 1)) { reached = true; break; }

      let best = -1;
      let bestScore = Infinity;
      for (let d = 0; d < 8; d++) {
        const nx = cx + DX[d];
        if (nx < 0 || nx >= GRID_W) continue;
        const ny = cy + DY[d];
        if (ny < 0 || ny >= GRID_H) continue;
        const ni = ny * GRID_W + nx;
        if (walk[ni] === 0 || stamp[ni] === gen) continue;
        if ((d & 1) === 1) {
          const a = cy * GRID_W + nx;
          const b = ny * GRID_W + cx;
          if (walk[a] === 0 && walk[b] === 0) continue;
        }
        // Distance first, tile cost only as a tie-break — this is the cheap
        // fallback, not a second pathfinder.
        const score = octile(nx, ny, tx, ty) * 4 + this.cost[ni] * 0.01;
        if (score < bestScore) { bestScore = score; best = ni; }
      }
      if (best < 0) break;
      cur = best;
      stamp[cur] = gen;
      buf[n++] = cur;
    }

    if (!reached) {
      const endDist = octile(cur % GRID_W, (cur / GRID_W) | 0, tx, ty);
      if (n < 2 || endDist >= startDist) return null;
    }

    const tiles = new Int32Array(n);
    for (let i = 0; i < n; i++) tiles[i] = buf[i];
    let total = 0;
    for (let i = 1; i < n; i++) {
      const a = tiles[i - 1];
      const b = tiles[i];
      const diag = (a % GRID_W) !== (b % GRID_W) && ((a / GRID_W) | 0) !== ((b / GRID_W) | 0);
      total += this.cost[b] * (diag ? SQRT2 : 1);
    }
    return { tiles, cost: total, partial: !reached };
  }

  /* ================================================================== *
   * Call budget and the async request queue (§6)
   * ================================================================== */

  /**
   * Async path request. `cb(result, req)` fires from `paths.update` on a later
   * tick with the same `{tiles, cost}` (or null) that `find` would return. A
   * villager waiting on one must stay in its current state and must not block
   * the tick. Returns an id that can be passed to `cancel`.
   */
  request(fromIdx, toIdx, cb, opts) {
    const req = {
      id: this.nextRequestId++,
      from: fromIdx,
      to: toIdx,
      cb,
      opts: opts || null,
      cancelled: false,
    };
    this.queue.push(req);
    this.stats.queued++;
    return req.id;
  }

  /** Drop a queued request (its villager died, its task was cancelled). */
  cancel(id) {
    for (let i = this.queueHead; i < this.queue.length; i++) {
      if (this.queue[i].id === id) {
        this.queue[i].cancelled = true;
        return true;
      }
    }
    return false;
  }

  /** Remaining A* calls this tick before further requests get deferred. */
  budgetLeft() {
    const left = PATH_CALLS_PER_TICK - this.callsThisTick;
    return left > 0 ? left : 0;
  }

  pendingCount() {
    return this.queue.length - this.queueHead;
  }

  /**
   * Second in the FROZEN update order, so the queue is flushed before
   * villagers run. The counter is drained *then* reset, which means direct
   * `find()` calls made later in the previous tick eat into this tick's
   * queue budget — that is what keeps the total near PATH_CALLS_PER_TICK.
   */
  update() {
    this.sync();
    const queue = this.queue;
    while (this.queueHead < queue.length && this.callsThisTick < PATH_CALLS_PER_TICK) {
      const req = queue[this.queueHead++];
      if (req.cancelled) continue;
      const res = this.find(req.from, req.to, req.opts);
      this.stats.served++;
      if (req.cb) {
        try {
          req.cb(res, req);
        } catch (err) {
          console.warn('[paths] path callback threw:', err);
        }
      }
    }
    if (this.queueHead >= queue.length) {
      queue.length = 0;
      this.queueHead = 0;
    } else if (this.queueHead > 64) {
      queue.splice(0, this.queueHead);
      this.queueHead = 0;
    }
    this.stats.callsLastTick = this.callsThisTick;
    this.callsThisTick = 0;
  }

  /* ================================================================== *
   * Regions (§6) — "is this even possible?" in one array lookup
   * ================================================================== */

  /**
   * Connected-component id of a tile over villager walkability. Unwalkable
   * tiles are -1. Recomputed lazily: the whole map is relabelled at most once
   * after any change, however many queries follow.
   */
  regionOf(idx) {
    this.sync();
    if (idx < 0 || idx >= N_TILES) return -1;
    if (this.regionsDirty) this.rebuildRegions();
    return this.regions[idx];
  }

  /**
   * True only when both tiles are walkable and in the same component. Prefer
   * this to comparing regionOf() directly — two unwalkable tiles both answer
   * -1 and would otherwise compare "connected".
   */
  sameRegion(a, b) {
    const ra = this.regionOf(a);
    if (ra < 0) return false;
    return ra === this.regionOf(b);
  }

  rebuildRegions() {
    this.stats.regionRebuilds++;
    this.regionsDirty = false;
    const regions = this.regions;
    const walk = this.walk;
    const q = this.regionQueue;
    regions.fill(-1);
    let id = 0;
    for (let s = 0; s < N_TILES; s++) {
      if (walk[s] === 0 || regions[s] !== -1) continue;
      let head = 0;
      let tail = 0;
      regions[s] = id;
      q[tail++] = s;
      while (head < tail) {
        const cur = q[head++];
        const cx = cur % GRID_W;
        const cy = (cur / GRID_W) | 0;
        for (let d = 0; d < 8; d++) {
          const nx = cx + DX[d];
          if (nx < 0 || nx >= GRID_W) continue;
          const ny = cy + DY[d];
          if (ny < 0 || ny >= GRID_H) continue;
          const n = ny * GRID_W + nx;
          if (walk[n] === 0 || regions[n] !== -1) continue;
          if ((d & 1) === 1) {
            const a = cy * GRID_W + nx;
            const b = ny * GRID_W + cx;
            if (walk[a] === 0 && walk[b] === 0) continue;
          }
          regions[n] = id;
          q[tail++] = n;
        }
      }
      id++;
    }
    this.regionCount = id;
  }

  /* ================================================================== *
   * Sealing check (V3) — would a footprint strand a pocket?
   * ================================================================== */

  /**
   * Would making the `w`x`h` tiles at (x,y) solid cut a walkable pocket off
   * from the rest of the map? Returns `{tiles, count, sides}` — every sealed
   * side's tiles, concatenated, with `sides` holding one exclusive end offset
   * per side — or null when nothing can be cut off.
   *
   * Null is also the answer when a split is too big to prove inside the
   * budget. That direction is deliberate: this must never refuse a placement
   * it has not proved, because R3 makes canPlace the contract place() keeps.
   *
   * The build ghost calls this per hovered tile per frame, so:
   *  - the ring around the footprint is read first, and one unbroken run of
   *    walkable ring tiles proves no split without touching the map at all;
   *  - the flood that follows runs from every ring run at once and stops at
   *    the first side to close, so it costs the SMALLEST side, not the map;
   *  - answers are memoised until `world.rev` moves, which is what keeps a
   *    wall drag (canPlace per dragged tile per frame) from re-flooding.
   */
  pocketIfSealed(x, y, w, h) {
    this.sync();
    const bw = w > 0 ? w | 0 : 1;
    const bh = h > 0 ? h | 0 : 1;
    if (x < 0 || y < 0 || x + bw > GRID_W || y + bh > GRID_H) return null;
    const key = (y * GRID_W + x) * 16 + ((bw & 3) << 2) + (bh & 3);
    const memo = this.sealMemo;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const res = this.computeSeal(x, y, bw, bh);
    // Nothing can change under a memo entry: sync() drops the whole map the
    // moment world.rev moves. The cap only stops a long session growing it.
    if (memo.size > 4096) memo.clear();
    memo.set(key, res);
    return res;
  }

  ringTile(x, y) {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return -1;
    return y * GRID_W + x;
  }

  computeSeal(x, y, bw, bh) {
    this.stats.sealChecks++;
    const walk = this.walk;
    const ring = this.ring;
    const n = 2 * (bw + 2) + 2 * bh;
    if (n > ring.length) return null;

    // Ring in cycle order — consecutive entries are orthogonal neighbours, so
    // a single run of walkable ring tiles is proof that everything touching
    // the footprint stays connected around it.
    let k = 0;
    for (let ox = -1; ox <= bw; ox++) ring[k++] = this.ringTile(x + ox, y - 1);
    for (let oy = 0; oy < bh; oy++) ring[k++] = this.ringTile(x + bw, y + oy);
    for (let ox = bw; ox >= -1; ox--) ring[k++] = this.ringTile(x + ox, y + bh);
    for (let oy = bh - 1; oy >= 0; oy--) ring[k++] = this.ringTile(x - 1, y + oy);

    let open = 0;
    for (let i = 0; i < n; i++) if (ring[i] >= 0 && walk[ring[i]] !== 0) open++;
    if (open === 0 || open === n) return null;

    const seedTile = this.sealSeed;
    let sides = 0;
    for (let i = 0; i < n; i++) {
      const t = ring[i];
      if (t < 0 || walk[t] === 0) continue;
      const prev = ring[(i + n - 1) % n];
      if (prev >= 0 && walk[prev] !== 0) continue;
      if (sides >= SEAL_MAX_SIDES) return null;
      seedTile[sides++] = t;
    }
    if (sides < 2) return null;

    // Sides already in different regions were never joined by this ground, so
    // building on it separates nothing that was together.
    const pre = this.sealPre;
    let joined = false;
    for (let c = 0; c < sides; c++) pre[c] = this.regionOf(seedTile[c]);
    for (let a = 0; a < sides && !joined; a++) {
      for (let b = a + 1; b < sides; b++) if (pre[a] === pre[b]) { joined = true; break; }
    }
    if (!joined) return null;

    return this.sealFlood(x, y, bw, bh, sides);
  }

  /**
   * Flood from every ring run at once, one tile per run per round, until the
   * runs meet (no split) or they close. Round-robin is what makes the cost the
   * smallest side's size: the big side never gets to run ahead.
   *
   * A run whose frontier is exhausted is final — nothing outside it is
   * adjacent to it, so no other run can ever reach it — but the flood does not
   * stop there. One footprint can close several sides at once and the first to
   * close is routinely the empty one, so every closed side is collected.
   */
  sealFlood(x, y, bw, bh, sides) {
    this.ensureSealScratch();
    this.stats.sealFloods++;
    const walk = this.walk;
    const seen = this.sealSeen;
    const owner = this.sealOwner;
    const queues = this.sealQ;
    const head = this.sealHead;
    const tail = this.sealTail;
    const root = this.sealRoot;
    const full = this.sealFull;

    const bstamp = this.blockStamp;
    if (++this.blockGen >= STAMP_LIMIT) { bstamp.fill(0); this.blockGen = 1; }
    const bgen = this.blockGen;
    for (let oy = 0; oy < bh; oy++) {
      const row = (y + oy) * GRID_W;
      for (let ox = 0; ox < bw; ox++) bstamp[row + x + ox] = bgen;
    }

    if (++this.sealGen >= STAMP_LIMIT) { seen.fill(0); this.sealGen = 1; }
    const gen = this.sealGen;
    for (let c = 0; c < sides; c++) {
      head[c] = 0;
      tail[c] = 0;
      root[c] = c;
      full[c] = 0;
      const t = this.sealSeed[c];
      seen[t] = gen;
      owner[t] = c;
      queues[c][tail[c]++] = t;
    }

    const done = this.sealDone;
    done.fill(0);
    for (;;) {
      let worked = false;
      for (let c = 0; c < sides; c++) {
        if (head[c] >= tail[c]) continue;
        const r0 = this.sealFind(c);
        if (full[r0] !== 0 || done[r0] !== 0) continue;
        worked = true;
        const cur = queues[c][head[c]++];
        this.stats.sealNodes++;
        const cx = cur % GRID_W;
        const cy = (cur / GRID_W) | 0;
        for (let d = 0; d < 8; d++) {
          const nx = cx + DX[d];
          if (nx < 0 || nx >= GRID_W) continue;
          const ny = cy + DY[d];
          if (ny < 0 || ny >= GRID_H) continue;
          const ni = ny * GRID_W + nx;
          if (walk[ni] === 0 || bstamp[ni] === bgen) continue;
          if ((d & 1) === 1) {
            const a = cy * GRID_W + nx;
            const b = ny * GRID_W + cx;
            if ((walk[a] === 0 || bstamp[a] === bgen)
              && (walk[b] === 0 || bstamp[b] === bgen)) continue;
          }
          if (seen[ni] === gen) {
            const other = this.sealFind(owner[ni]);
            const mine = this.sealFind(c);
            if (other !== mine) {
              root[other] = mine;
              if (full[other] !== 0) full[mine] = 1;
            }
            continue;
          }
          seen[ni] = gen;
          owner[ni] = c;
          if (tail[c] >= SEAL_CAP) { full[this.sealFind(c)] = 1; break; }
          queues[c][tail[c]++] = ni;
        }
      }

      let roots = 0;
      let live = 0;
      for (let c = 0; c < sides; c++) {
        if (this.sealFind(c) !== c) continue;
        roots++;
        if (full[c] !== 0 || done[c] !== 0) continue;
        let pending = false;
        for (let m = 0; m < sides; m++) {
          if (this.sealFind(m) === c && head[m] < tail[m]) { pending = true; break; }
        }
        if (pending) live++;
        else done[c] = 1;
      }
      if (roots <= 1) return null;
      if (live === 0 || !worked) break;
    }
    return this.sealPockets(sides);
  }

  /** Union-find over at most SEAL_MAX_SIDES runs, with path compression. */
  sealFind(c) {
    const root = this.sealRoot;
    let r = c;
    while (root[r] !== r) r = root[r];
    while (root[c] !== r) { const next = root[c]; root[c] = r; c = next; }
    return r;
  }

  /**
   * Copy out every side that closed AND was joined to another side before the
   * footprint went down. `sides` holds one exclusive end offset into `tiles`
   * per pocket, because the caller must weigh each pocket on its own: a
   * placement that seals an empty crevice and a yard full of villagers at the
   * same time is refused for the yard, not excused by the crevice.
   */
  sealPockets(sides) {
    const pre = this.sealPre;
    const done = this.sealDone;
    const tails = this.sealTail;
    const tilesIn = (r) => {
      let n = 0;
      for (let m = 0; m < sides; m++) if (this.sealFind(m) === r) n += tails[m];
      return n;
    };
    // Whichever side is still unproved is the rest of the map; with none left,
    // the biggest closed side takes that role.
    let open = 0;
    let biggest = -1;
    let biggestN = -1;
    for (let c = 0; c < sides; c++) {
      if (this.sealFind(c) !== c) continue;
      if (done[c] === 0) { open++; continue; }
      const n = tilesIn(c);
      if (n > biggestN) { biggestN = n; biggest = c; }
    }

    const roots = [];
    const ends = [];
    let count = 0;
    for (let c = 0; c < sides; c++) {
      if (this.sealFind(c) !== c || done[c] === 0) continue;
      if (open === 0 && c === biggest) continue;
      let shared = false;
      for (let a = 0; a < sides && !shared; a++) {
        if (this.sealFind(a) !== c) continue;
        for (let b = 0; b < sides; b++) {
          if (this.sealFind(b) === c) continue;
          if (pre[b] === pre[a]) { shared = true; break; }
        }
      }
      if (!shared) continue;
      roots.push(c);
      count += tilesIn(c);
      ends.push(count);
    }
    if (count === 0) return null;

    const tiles = new Int32Array(count);
    let k = 0;
    for (let i = 0; i < roots.length; i++) {
      for (let m = 0; m < sides; m++) {
        if (this.sealFind(m) !== roots[i]) continue;
        const q = this.sealQ[m];
        const t = tails[m];
        for (let j = 0; j < t; j++) tiles[k++] = q[j];
      }
    }
    return { tiles: tiles, count: count, sides: ends };
  }

  /** Allocated on the first flood — most games never reach one. */
  ensureSealScratch() {
    if (this.sealSeen) return;
    this.sealSeen = new Int32Array(N_TILES);
    this.sealOwner = new Int32Array(N_TILES);
    this.blockStamp = new Int32Array(N_TILES);
    this.sealQ = new Array(SEAL_MAX_SIDES);
    for (let i = 0; i < SEAL_MAX_SIDES; i++) this.sealQ[i] = new Int32Array(SEAL_CAP);
    this.sealHead = new Int32Array(SEAL_MAX_SIDES);
    this.sealTail = new Int32Array(SEAL_MAX_SIDES);
    this.sealRoot = new Int32Array(SEAL_MAX_SIDES);
    this.sealFull = new Uint8Array(SEAL_MAX_SIDES);
    this.sealDone = new Uint8Array(SEAL_MAX_SIDES);
  }

  /* ================================================================== *
   * Road connectivity (§6) — the rule that forces a road network
   * ================================================================== */

  /**
   * A building functions only if at least one tile ORTHOGONALLY adjacent to
   * its footprint carries a road (§6). Cached per building id and dropped
   * wholesale on any road or wall change, because buildings.js asks this for
   * every building every tick.
   */
  isConnected(b) {
    if (!b) return false;
    this.sync();
    const cached = this.connCache.get(b.id);
    if (cached !== undefined) return cached;
    const value = this.computeConnected(b);
    this.connCache.set(b.id, value);
    return value;
  }

  computeConnected(b) {
    const w = this.world;
    if (!w) return false;
    const bw = b.w > 0 ? b.w : 1;
    const bh = b.h > 0 ? b.h : 1;
    for (let ox = 0; ox < bw; ox++) {
      const x = b.x + ox;
      const above = w.tileAt(x, b.y - 1);
      if (above >= 0 && w.road[above] !== ROAD_NONE) return true;
      const below = w.tileAt(x, b.y + bh);
      if (below >= 0 && w.road[below] !== ROAD_NONE) return true;
    }
    for (let oy = 0; oy < bh; oy++) {
      const y = b.y + oy;
      const left = w.tileAt(b.x - 1, y);
      if (left >= 0 && w.road[left] !== ROAD_NONE) return true;
      const right = w.tileAt(b.x + bw, y);
      if (right >= 0 && w.road[right] !== ROAD_NONE) return true;
    }
    return false;
  }

  /** Forget one building's cached answer (call on demolish; cheap). */
  forgetBuilding(id) {
    this.connCache.delete(id);
  }

  /**
   * The tile villagers should path to for a building (§7's `doorIdx`): the
   * road-adjacent, footprint-adjacent tile with the lowest (tx+ty), else the
   * footprint tile with the lowest (tx+ty). Offered here because the rule is
   * road-shaped; buildings.js owns the field on the instance.
   */
  doorFor(b) {
    const w = this.world;
    if (!w || !b) return -1;
    const bw = b.w > 0 ? b.w : 1;
    const bh = b.h > 0 ? b.h : 1;
    let best = -1;
    let bestKey = Infinity;
    const consider = (x, y) => {
      const idx = w.tileAt(x, y);
      if (idx < 0 || w.road[idx] === ROAD_NONE) return;
      const key = x + y;
      if (key < bestKey) { bestKey = key; best = idx; }
    };
    for (let ox = 0; ox < bw; ox++) {
      consider(b.x + ox, b.y - 1);
      consider(b.x + ox, b.y + bh);
    }
    for (let oy = 0; oy < bh; oy++) {
      consider(b.x - 1, b.y + oy);
      consider(b.x + bw, b.y + oy);
    }
    if (best >= 0) return best;
    return w.tileAt(b.x, b.y);
  }

  /* ================================================================== *
   * Save / restore (§14)
   * ================================================================== */

  /** Roads live in the world save; paths holds only caches and a queue. */
  serialize() {
    return { v: 1 };
  }

  /** Caches are rebuilt, never trusted (§14). Pending requests are dropped. */
  restore() {
    this.rebuild();
    return true;
  }
}

// Re-exported so callers can name road kinds without importing constants
// twice; the values are constants.js's, not ours.
export { ROAD_NONE, ROAD_DIRT, ROAD_COBBLE };
