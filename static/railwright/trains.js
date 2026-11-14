// Train physics, schedule execution and cargo handling — DESIGN.md section 7.
//
// Economy handoff (documented here, per the design contract, since this is
// the only place it happens): when a train unloads at a station it calls
// `ctx.economy.deliver({ trainId, stationId, siteId, item, qty, daysAboard })`.
// That call is the *only* way cargo delivery revenue is decided:
//   - it returns a truthy value if the site accepts the item (delivery is
//     all-or-nothing per DESIGN.md section 4 — there is no partial accept),
//   - on accept, economy owns revenue math, site stock/demand, contract
//     progress and emitting `cargo:delivered` / `money:changed`,
//   - on refusal, economy owns surfacing the refusal toast.
// trains.js never computes money. If `ctx.economy` or `.deliver` is absent
// (e.g. a headless test with no economy module wired up), delivery is
// treated as fully accepted so the rest of the sim still runs end to end.
//
// trains.js emits, via `ctx.bus`: `train:arrived`, `train:departed`,
// `cargo:loaded`, `train:no_route`, `train:broken`, `train:bought`.
//
// `network.js` owns all block/reservation state. This file only ever calls
// its documented query/command surface (`canEnterBlock`, `syncTrainOccupancy`,
// `blockAt`, `isLinkSignalled`, `findPath`) — it never reaches into
// `network.blocks` or similar directly.
import { LOCOS, WAGONS, ITEMS, LOAD_RATE, LOAD_FULL_TIMEOUT, ACCEL, BRAKE } from './constants.js';
import { clamp, stepDistance, dirBetween } from './utils.js';

const RETRY_SECONDS = 5; // no_route retry cadence
// Addendum A2: a train that cannot spawn/progress must be surfaced, not left
// silently idle forever - but a train blocked for a moment by ordinary
// contention (another train briefly sitting on its home platform) is normal
// and shouldn't flash a warning immediately.
const STALL_REPORT_SECONDS = 10;

function emitSafe(bus, name, payload) {
  if (bus && typeof bus.emit === 'function') bus.emit(name, payload);
}

// --- Train factory -----------------------------------------------------

function makeTrain(id, name, locoId, wagonTypes) {
  const wagons = wagonTypes.map((type) => {
    const def = WAGONS[type];
    return { type, capacity: def ? def.capacity : 0, item: null, qty: 0 };
  });
  return {
    id,
    name,
    locoId,
    wagons,
    path: [],
    pathIndex: 0,
    t: 0,
    headIdx: null,
    occupied: [],
    speed: 0,
    targetSpeed: 0,
    state: 'idle',
    schedule: { stops: [], index: 0, loop: true },
    destStationId: null,
    reserved: [],
    loadTimer: 0,
    brokenTimer: 0,
    daysAboard: 0,
    stats: { delivered: 0, revenue: 0, kmRun: 0 },
  };
}

function currentStop(train) {
  return train.schedule.stops[train.schedule.index] || null;
}

function clampIndex(index, len) {
  if (len <= 0) return 0;
  return Math.max(0, Math.min(index, len - 1));
}

// A multi-platform station's tiles all share one block (capacity ==
// station.platforms - see network.js recomputeBlocks), but the *physical*
// tile a train heads for is this function's choice alone; the block
// capacity check never stops two trains from both aiming at tiles[0]. Pick a
// platform tile no other train is already sitting on, physically passing
// through, or already travelling toward - falling back to tiles[0] (the
// caller's own occupancy/reservation guard is what then makes a second train
// wait rather than overlap) only once every platform is genuinely claimed.
function pickStationTargetIdx(station, train, allTrains) {
  const tiles = station.tiles && station.tiles.length ? station.tiles : [station.originIdx];
  if (tiles.length <= 1 || !Array.isArray(allTrains)) return tiles[0];
  const claimed = new Set();
  for (const other of allTrains) {
    if (train && other.id === train.id) continue;
    if (other.headIdx != null && tiles.includes(other.headIdx)) claimed.add(other.headIdx);
    if (Array.isArray(other.occupied)) {
      for (const idx of other.occupied) if (tiles.includes(idx)) claimed.add(idx);
    }
    if (other.destStationId === station.id && Array.isArray(other.path) && other.path.length) {
      const lastIdx = other.path[other.path.length - 1];
      if (tiles.includes(lastIdx)) claimed.add(lastIdx);
    }
  }
  for (const t of tiles) if (!claimed.has(t)) return t;
  return tiles[0];
}

// --- Cargo helpers -------------------------------------------------------

export function capacityFor(train, item) {
  const def = ITEMS[item];
  if (!def) return 0;
  let space = 0;
  for (const w of train.wagons) {
    if (w.type !== def.wagon) continue;
    if (w.item !== null && w.item !== item) continue;
    space += w.capacity - w.qty;
  }
  return space;
}

export function loadCargo(train, item, qty) {
  const def = ITEMS[item];
  if (!def || qty <= 0) return 0;
  let remaining = qty;
  let loaded = 0;
  for (const w of train.wagons) {
    if (remaining <= 0) break;
    if (w.type !== def.wagon) continue;
    if (w.item !== null && w.item !== item) continue;
    const space = w.capacity - w.qty;
    if (space <= 0) continue;
    const amount = Math.min(space, remaining);
    w.item = item;
    w.qty += amount;
    remaining -= amount;
    loaded += amount;
  }
  return loaded;
}

// item === null unloads every wagon regardless of what it carries.
export function unloadCargo(train, item) {
  let removed = 0;
  for (const w of train.wagons) {
    if (w.qty <= 0) continue;
    if (item != null && w.item !== item) continue;
    removed += w.qty;
    w.qty = 0;
    w.item = null;
  }
  return removed;
}

export function cargoSummary(train) {
  const summary = {};
  for (const w of train.wagons) {
    if (w.item && w.qty > 0) summary[w.item] = (summary[w.item] || 0) + w.qty;
  }
  return summary;
}

export function totalCargo(train) {
  let total = 0;
  for (const w of train.wagons) total += w.qty;
  return total;
}

function wagonQtyFor(train, item) {
  let qty = 0;
  for (const w of train.wagons) if (w.item === item) qty += w.qty;
  return qty;
}

// Returns the actual revenue number on acceptance (0 or a positive amount),
// `true` for the headless fallback (no economy wired up - accepted, revenue
// unknowable), or `false` on refusal. BUGFIX: this used to collapse the
// result to a plain boolean, which meant train.stats.revenue (read by ui.js's
// roster "income/day" column) was never incremented anywhere and always
// displayed $0 despite money genuinely flowing in - found by driving the
// actual UI, not by reading the code.
function deliverToEconomy(ctx, train, station, stationId, item, qty) {
  const econ = ctx && ctx.economy;
  if (!econ || typeof econ.deliver !== 'function') return true; // headless fallback: fully accepted
  const siteId = station ? station.siteId : null;
  return econ.deliver({ trainId: train.id, stationId, siteId, item, qty, daysAboard: train.daysAboard });
}

// --- Schedule editing (safe at any state, including 'running') ---------
//
// These only ever touch `train.schedule` — never path/pathIndex/t/occupied/
// reserved/state — so editing mid-route can never corrupt position or block
// reservations.

function normalizeStop(s) {
  return {
    stationId: s.stationId,
    action: s.action,
    item: s.item != null ? s.item : null,
    waitSeconds: s.waitSeconds || 0,
  };
}

export function setSchedule(train, stops, opts = {}) {
  train.schedule.stops = stops.map(normalizeStop);
  train.schedule.index = clampIndex(train.schedule.index, train.schedule.stops.length);
  if (opts.loop != null) train.schedule.loop = !!opts.loop;
}

export function insertStop(train, index, stop) {
  const stops = train.schedule.stops;
  const at = Math.max(0, Math.min(index, stops.length));
  stops.splice(at, 0, normalizeStop(stop));
  if (train.schedule.index >= at) train.schedule.index += 1;
  train.schedule.index = clampIndex(train.schedule.index, stops.length);
}

export function removeStop(train, index) {
  const stops = train.schedule.stops;
  if (index < 0 || index >= stops.length) return;
  stops.splice(index, 1);
  if (train.schedule.index > index) train.schedule.index -= 1;
  train.schedule.index = clampIndex(train.schedule.index, stops.length);
}

export function moveStop(train, fromIndex, toIndex) {
  const stops = train.schedule.stops;
  if (fromIndex < 0 || fromIndex >= stops.length) return;
  const [moved] = stops.splice(fromIndex, 1);
  const at = Math.max(0, Math.min(toIndex, stops.length));
  stops.splice(at, 0, moved);
  // Keep pointing at the same logical stop across the reorder.
  let idx = train.schedule.index;
  if (idx === fromIndex) idx = at;
  else {
    if (idx > fromIndex) idx -= 1;
    if (idx >= at) idx += 1;
  }
  train.schedule.index = clampIndex(idx, stops.length);
}

// --- Movement / schedule execution --------------------------------------

// `pathIndex` only ever increases as the train physically advances (see
// stepMovement below - it is never decremented, including after a reverse():
// that swaps `train.path` end-for-end and remaps `pathIndex` so the array
// itself already encodes "walk the route backward", so pathIndex keeps
// counting up through whatever the *current* array is). That means the
// trailing tiles under the rest of the consist are always the ones at
// strictly lower array indices than the head - already visited, by
// construction - never the ones ahead of it, which the consist has not
// physically reached yet.
function recomputeOccupied(train) {
  const consistLength = 1 + train.wagons.length;
  const occ = [];
  let idx = train.pathIndex;
  for (let i = 0; i < consistLength && idx >= 0 && idx < train.path.length; i++) {
    occ.push(train.path[idx]);
    idx -= 1;
  }
  train.occupied = occ;
}

function syncReserved(train, ctx) {
  if (!ctx.network || typeof ctx.network.blockAt !== 'function') {
    train.reserved = [];
    return;
  }
  const ids = [];
  for (const idx of train.occupied) {
    const b = ctx.network.blockAt(idx);
    if (b != null && !ids.includes(b)) ids.push(b);
  }
  train.reserved = ids;
}

function computeTargetSpeed(train, curIdx, nextIdx, ctx) {
  const loco = LOCOS[train.locoId];
  const baseSpeed = loco ? loco.speed : 0;
  const world = ctx && ctx.world;
  let elevationDelta = 0;
  if (world && world.tiles) {
    const curTile = world.tiles[curIdx];
    const nextTile = world.tiles[nextIdx];
    if (curTile && nextTile) elevationDelta = Math.max(0, nextTile.elevation - curTile.elevation);
  }
  if (elevationDelta <= 0) return baseSpeed;
  const power = loco ? loco.power : 0;
  const wagonCount = train.wagons.length;
  // A train that physically cannot climb still crawls at 0.25x — never stuck.
  const multiplier = clamp(power / (2 + wagonCount * elevationDelta), 0.25, 1);
  return baseSpeed * multiplier;
}

// `reason` is bookkeeping only (not part of the frozen train shape) so the
// UI's stalled-trains banner (Addendum A2) can say *why*, not just *that*.
function setNoRoute(train, ctx, reason) {
  train.speed = 0;
  train.targetSpeed = 0;
  train.state = 'no_route';
  train.stallReason = reason || 'no route available';
  train.loadTimer = RETRY_SECONDS; // loadTimer doubles as the retry cooldown here; the two states never overlap
  emitSafe(ctx.bus, 'train:no_route', { trainId: train.id, reason: train.stallReason });
}

function requestNextPath(train, ctx, allTrains) {
  const stop = currentStop(train);
  if (!stop) {
    train.state = 'idle';
    train.path = [];
    return;
  }
  const station = ctx.stations && ctx.stations.get(stop.stationId);
  if (!station || !ctx.network || typeof ctx.network.findPath !== 'function') {
    setNoRoute(train, ctx, 'schedule points at an unknown station');
    return;
  }
  const toIdx = pickStationTargetIdx(station, train, allTrains);
  const result = ctx.network.findPath(train.headIdx, toIdx, {});
  if (!result || !result.tiles || !result.tiles.length) {
    setNoRoute(train, ctx, 'no path to next stop');
    return;
  }
  train.path = result.tiles;
  train.pathIndex = 0;
  train.t = 0;
  train.state = 'running';
  train.stallReason = null;
  train.destStationId = stop.stationId;
  recomputeOccupied(train);
  if (typeof ctx.network.syncTrainOccupancy === 'function') {
    ctx.network.syncTrainOccupancy(train.id, train.occupied);
  }
  syncReserved(train, ctx);
}

function advanceScheduleIndex(train) {
  const stops = train.schedule.stops;
  if (!stops.length) return;
  if (train.schedule.loop) {
    train.schedule.index = (train.schedule.index + 1) % stops.length;
  } else {
    train.schedule.index = Math.min(train.schedule.index + 1, stops.length - 1);
  }
}

function departForNextStop(train, ctx, allTrains) {
  const fromStationId = train.destStationId;
  if (fromStationId != null) emitSafe(ctx.bus, 'train:departed', { trainId: train.id, stationId: fromStationId });
  advanceScheduleIndex(train);
  requestNextPath(train, ctx, allTrains);
}

// Spawn a never-placed train (headIdx === null) at its first stop's station.
// DESIGN.md doesn't define where a bought train starts; the smallest option
// consistent with the doc is to place it once a real schedule is assigned.
//
// Fail-closed: a bulldozed station tile must never look "safe to spawn on"
// just because there's nothing left to ask about it. Both a real track tile
// AND a grantable block reservation are required before a train is placed.
function spawnAtFirstStop(train, ctx, dt, allTrains) {
  const stop = currentStop(train);
  if (!stop) return;
  const station = ctx.stations && ctx.stations.get(stop.stationId);
  if (!station) {
    accumulateSpawnStall(train, ctx, dt, 'schedule points at an unknown station');
    return; // wait for a valid schedule before spawning
  }
  const network = ctx.network;
  const tileIdx = pickStationTargetIdx(station, train, allTrains);
  const hasRealTrack = !!network && typeof network.hasTrack === 'function' && network.hasTrack(tileIdx);
  const blockId = hasRealTrack && typeof network.blockAt === 'function' ? network.blockAt(tileIdx) : null;
  const canEnter = hasRealTrack && blockId != null && typeof network.canEnterBlock === 'function'
    && network.canEnterBlock(blockId, train.id);
  if (!canEnter) {
    // Covers both "another train already holds the platform" (retry once it
    // clears) and "the station's track was bulldozed out from under it"
    // (retry forever is still correct - the anti-soft-lock rule is that the
    // player must be *told*, not that the train must give up).
    accumulateSpawnStall(train, ctx, dt, hasRealTrack ? 'waiting for the platform to clear' : 'station track is missing');
    return;
  }
  train._spawnStallSeconds = 0;
  train.stallReason = null;
  train.path = [tileIdx];
  train.pathIndex = 0;
  train.t = 0;
  train.headIdx = tileIdx;
  train.occupied = [tileIdx];
  train.destStationId = stop.stationId;
  train.state = 'running'; // resolves into arrival next tick
  if (typeof network.syncTrainOccupancy === 'function') {
    network.syncTrainOccupancy(train.id, train.occupied);
  }
  syncReserved(train, ctx);
}

// A train stuck unable to spawn (e.g. an unsignalled network where the whole
// component is one capacity-1 block, so a second train can never enter) must
// eventually be reported rather than sit `idle`/`headIdx:null` forever with
// no event ever firing - see Addendum A2.
function accumulateSpawnStall(train, ctx, dt, reason) {
  train._spawnStallSeconds = (train._spawnStallSeconds || 0) + (dt || 0);
  if (train._spawnStallSeconds >= STALL_REPORT_SECONDS) setNoRoute(train, ctx, reason);
}

function doLoad(train, dt, ctx, stop, full, allTrains) {
  const item = stop.item;
  const station = ctx.stations && ctx.stations.get(stop.stationId);
  if (!item || !station) {
    departForNextStop(train, ctx, allTrains);
    return;
  }
  if (!station.waiting) station.waiting = {};
  const spaceLeft = capacityFor(train, item);
  const available = station.waiting[item] || 0;
  if (spaceLeft > 0 && available > 0) {
    const amount = Math.min(spaceLeft, available, LOAD_RATE * dt);
    if (amount > 0) {
      const loaded = loadCargo(train, item, amount);
      if (loaded > 0) {
        station.waiting[item] = available - loaded;
        train.daysAboard = 0; // fresh cargo resets the freshness clock
        emitSafe(ctx.bus, 'cargo:loaded', { trainId: train.id, item, qty: loaded });
      }
    }
  }
  const nowFull = capacityFor(train, item) <= 0;
  const nothingAvailable = (station.waiting[item] || 0) <= 0;
  if (full) {
    // load_full: keep waiting for supply to replenish, up to LOAD_FULL_TIMEOUT
    // — never an infinite wait.
    if (nowFull || train.loadTimer >= LOAD_FULL_TIMEOUT) departForNextStop(train, ctx, allTrains);
  } else if (nowFull || nothingAvailable) {
    departForNextStop(train, ctx, allTrains);
  }
}

// Unload resolves in a single tick: DESIGN.md gives no waiting semantics for
// unload/unload_all (unlike load_full's explicit timeout), so resolving
// immediately is the smallest option that is guaranteed to never hang.
function doUnload(train, ctx, stop, all, allTrains) {
  const station = ctx.stations && ctx.stations.get(stop.stationId);
  const items = all ? Object.keys(cargoSummary(train)) : stop.item ? [stop.item] : [];
  for (const item of items) {
    const qty = wagonQtyFor(train, item);
    if (qty <= 0) continue;
    const result = deliverToEconomy(ctx, train, station, stop.stationId, item, qty);
    if (result) {
      unloadCargo(train, item);
      train.stats.delivered += qty;
      if (typeof result === 'number') train.stats.revenue += result;
    }
    // Refused: cargo stays aboard; economy is responsible for the toast.
  }
  departForNextStop(train, ctx, allTrains);
}

function runStopAction(train, dt, ctx, allTrains) {
  const stop = currentStop(train);
  if (!stop) {
    train.state = 'idle';
    return;
  }
  train.loadTimer += dt;
  switch (stop.action) {
    case 'wait':
      if (train.loadTimer >= stop.waitSeconds) departForNextStop(train, ctx, allTrains);
      break;
    case 'load':
      doLoad(train, dt, ctx, stop, false, allTrains);
      break;
    case 'load_full':
      doLoad(train, dt, ctx, stop, true, allTrains);
      break;
    case 'unload':
      doUnload(train, ctx, stop, false, allTrains);
      break;
    case 'unload_all':
      doUnload(train, ctx, stop, true, allTrains);
      break;
    default:
      // Unknown action: never hang on it.
      departForNextStop(train, ctx, allTrains);
  }
}

function arrive(train, ctx) {
  train.speed = 0;
  train.targetSpeed = 0;
  const stop = currentStop(train);
  const stationId = stop ? stop.stationId : train.destStationId;
  if (stationId != null) emitSafe(ctx.bus, 'train:arrived', { trainId: train.id, stationId });
  if (!stop) {
    train.state = 'idle';
    return;
  }
  train.destStationId = stop.stationId;
  train.loadTimer = 0;
  // CONTRACT-GAP: the frozen state enum has no dedicated state for 'wait';
  // it and every non-unload action funnel through the generic 'loading'
  // state (which just means "executing the current stop's action").
  train.state = stop.action === 'unload' || stop.action === 'unload_all' ? 'unloading' : 'loading';
}

function stepMovement(train, dt, ctx, allTrains) {
  let remaining = dt;
  while (remaining > 0) {
    if (train.pathIndex + 1 >= train.path.length) {
      arrive(train, ctx);
      return;
    }
    const curIdx = train.path[train.pathIndex];
    const nextIdx = train.path[train.pathIndex + 1];

    // A path is only valid for as long as the track under it still exists —
    // stepMovement never re-checks this once a path is chosen, so a tile
    // bulldozed mid-transit must stop the train here rather than let it
    // glide across open ground toward a tile that no longer has track.
    if (ctx.network) {
      const net = ctx.network;
      const curHasTrack = typeof net.hasTrack === 'function' ? net.hasTrack(curIdx) : true;
      const nextHasTrack = typeof net.hasTrack === 'function' ? net.hasTrack(nextIdx) : true;
      const stillLinked = typeof net.linked === 'function' ? net.linked(curIdx, nextIdx) : true;
      if (!curHasTrack || !nextHasTrack || !stillLinked) {
        setNoRoute(train, ctx, 'track ahead was removed');
        return;
      }
    }

    if (ctx.network && typeof ctx.network.isLinkSignalled === 'function' && ctx.network.isLinkSignalled(curIdx, nextIdx)) {
      const blockId = ctx.network.blockAt(nextIdx);
      if (!ctx.network.canEnterBlock(blockId, train.id)) {
        train.speed = 0;
        train.targetSpeed = 0;
        train.state = 'waiting_signal';
        return;
      }
    }
    // Absolute last line of defence, checked on every step regardless of
    // signalling: a topology change can merge two previously-separate
    // blocks, correctly leaving more physically-present trains in the merged
    // block than its capacity (recomputeBlocks/syncTrainOccupancy preserve
    // that as physical truth rather than dropping a real train - see their
    // comments). Once merged, canEnterBlock's "already an occupant of this
    // block" shortcut can no longer be trusted to mean "this exact tile is
    // free" - so check the destination tile directly. DESIGN.md's rule is
    // absolute: two trains never share a tile, full stop.
    if (Array.isArray(allTrains)) {
      for (const other of allTrains) {
        if (other.id === train.id) continue;
        if (Array.isArray(other.occupied) && other.occupied.includes(nextIdx)) {
          train.speed = 0;
          train.targetSpeed = 0;
          train.state = 'waiting_signal';
          return;
        }
      }
    }
    if (train.state === 'waiting_signal') train.state = 'running';

    train.targetSpeed = computeTargetSpeed(train, curIdx, nextIdx, ctx);
    if (train.speed < train.targetSpeed) {
      train.speed = Math.min(train.targetSpeed, train.speed + ACCEL * remaining);
    } else if (train.speed > train.targetSpeed) {
      train.speed = Math.max(train.targetSpeed, train.speed - BRAKE * remaining);
    }
    if (train.speed < 0) train.speed = 0;

    // stepDistance takes a *direction* (0-7), not two tile indices.
    const dir = dirBetween(curIdx, nextIdx);
    const segDist = dir >= 0 ? stepDistance(dir) : 1;
    if (train.speed <= 0 || segDist <= 0) return; // stalled this tick

    const dtToBoundary = ((1 - train.t) * segDist) / train.speed;
    if (dtToBoundary > remaining) {
      train.t += (train.speed * remaining) / segDist;
      remaining = 0;
    } else {
      remaining -= dtToBoundary;
      train.t = 0;
      train.pathIndex += 1;
      recomputeOccupied(train);
      if (typeof ctx.network.syncTrainOccupancy === 'function') {
        ctx.network.syncTrainOccupancy(train.id, train.occupied);
      }
      syncReserved(train, ctx);
      train.headIdx = train.path[train.pathIndex];
      train.stats.kmRun += segDist;
    }
  }
}

function tickTrain(train, dt, ctx, allTrains) {
  // 1. broken
  if (train.state === 'broken') {
    train.brokenTimer -= dt;
    if (train.brokenTimer <= 0) {
      train.brokenTimer = 0;
      train.state = 'idle';
    }
    return;
  }

  if (train.headIdx === null) {
    if (!train.schedule.stops.length) {
      // A schedule with 0 stops is legal and sits idle - never left flagged
      // as stalled over a schedule the player has since cleared.
      if (train.state !== 'idle') { train.state = 'idle'; train.stallReason = null; }
      train._spawnStallSeconds = 0;
      return;
    }
    if (train.state === 'no_route') {
      // Retry cadence for a train that has never managed to spawn (see
      // accumulateSpawnStall) - same "retry every RETRY_SECONDS, never spin"
      // rule as the on-route no_route case below.
      train.loadTimer -= dt;
      if (train.loadTimer <= 0) spawnAtFirstStop(train, ctx, dt, allTrains);
      return;
    }
    spawnAtFirstStop(train, ctx, dt, allTrains);
    return;
  }

  // 2. loading / unloading
  if (train.state === 'loading' || train.state === 'unloading') {
    runStopAction(train, dt, ctx, allTrains);
    return;
  }

  if (train.state === 'no_route') {
    train.loadTimer -= dt;
    if (train.loadTimer <= 0) requestNextPath(train, ctx, allTrains);
    return;
  }

  if (train.state === 'idle') {
    if (train.schedule.stops.length && !train.path.length) requestNextPath(train, ctx, allTrains);
    return;
  }

  // 3-5. signal check, accel/brake + advance, arrival.
  stepMovement(train, dt, ctx, allTrains);
}

// --- Breakdown (used by whatever disaster/maintenance system triggers it) -

export function breakTrain(train, ctx, seconds) {
  train.state = 'broken';
  train.speed = 0;
  train.targetSpeed = 0;
  train.brokenTimer = seconds;
  emitSafe(ctx && ctx.bus, 'train:broken', { trainId: train.id });
}

// --- Deadlock dispatch ---------------------------------------------------

// Flips the train's direction of travel (both its in-flight path and its
// schedule order) so a wait-for cycle can untangle. `ctx` is optional so the
// exact `reverse(train)` call site in the design doc still works; pass ctx
// when available so network occupancy stays in sync immediately rather than
// on the next tile boundary.
export function reverse(train, ctx) {
  if (train.path.length > 1) {
    const traveledIdx = train.pathIndex;
    train.path = train.path.slice().reverse();
    train.pathIndex = train.path.length - 1 - traveledIdx;
    train.t = train.t > 0 ? 1 - train.t : 0;
    // Do NOT recompute `occupied` here: flipping travel direction doesn't
    // move the train, so the physical tiles it holds (and therefore its
    // block reservations) must stay exactly as they were. The array-reverse
    // plus index-remap above already fully encodes "walk the route
    // backward" - pathIndex keeps counting up through this new array just
    // like it always does, so recomputeOccupied()'s "trailing = lower
    // index" rule still holds with no further adjustment needed.
  }
  const stops = train.schedule.stops;
  if (stops.length) {
    train.schedule.stops = stops.slice().reverse();
    train.schedule.index = stops.length - 1 - train.schedule.index;
  }
  train.state = 'running';
  train.speed = 0;
  train.targetSpeed = 0;
  if (ctx && ctx.network) {
    if (typeof ctx.network.syncTrainOccupancy === 'function') ctx.network.syncTrainOccupancy(train.id, train.occupied);
    syncReserved(train, ctx);
  }
}

// --- Pricing (economy charges; this just quotes) -------------------------

export function costOf(locoId, wagonTypes) {
  const loco = LOCOS[locoId];
  let total = loco ? loco.cost : 0;
  for (const wt of wagonTypes) {
    const w = WAGONS[wt];
    total += w ? w.cost : 0;
  }
  return total;
}

// --- Manager --------------------------------------------------------------

export class TrainManager {
  constructor() {
    this.trains = [];
    this._nextId = 1;
    this._bus = null;
  }

  add(train) {
    this.trains.push(train);
    return train;
  }

  remove(trainId) {
    const i = this.trains.findIndex((t) => t.id === trainId);
    if (i === -1) return false;
    this.trains.splice(i, 1);
    return true;
  }

  // Cost checks and charging money are economy's job (see costOf); this just
  // creates the train and hands it back.
  buyTrain(locoId, wagonTypes) {
    const loco = LOCOS[locoId];
    if (!loco) return null;
    const id = `t${this._nextId++}`;
    const train = makeTrain(id, `${loco.name} #${id}`, locoId, wagonTypes.slice());
    this.trains.push(train);
    emitSafe(this._bus, 'train:bought', { trainId: id });
    return train;
  }

  update(dt, ctx) {
    const safeCtx = ctx || {};
    if (safeCtx.bus) {
      this._bus = safeCtx.bus;
      if (!this._daySubscribed && typeof safeCtx.bus.on === 'function') {
        safeCtx.bus.on('day:ended', () => this._onDayEnded());
        this._daySubscribed = true;
      }
    }
    for (const train of this.trains) {
      try {
        tickTrain(train, dt, safeCtx, this.trains);
      } catch (err) {
        // One train's failure must never take down every other train's tick.
        console.error('railwright: train tick failed', train.id, err);
      }
    }
  }

  _onDayEnded() {
    for (const train of this.trains) {
      if (totalCargo(train) > 0) train.daysAboard += 1;
      else train.daysAboard = 0;
    }
  }

  serialize() {
    return {
      nextId: this._nextId,
      trains: this.trains.map((t) => JSON.parse(JSON.stringify(t))),
    };
  }

  deserialize(data) {
    const trains = (data && data.trains) || [];
    this.trains = trains.map((t) => normalizeSavedTrain(t));
    this._nextId = (data && data.nextId) || this.trains.length + 1;
    this._daySubscribed = false;
    this._bus = null;
  }
}

// Defensive defaults in case a save came from an older/partial schema.
function normalizeSavedTrain(t) {
  const base = makeTrain(t.id, t.name, t.locoId, t.wagons ? t.wagons.map((w) => w.type) : []);
  return {
    ...base,
    ...t,
    wagons: t.wagons && t.wagons.length ? t.wagons : base.wagons,
    schedule: t.schedule || base.schedule,
    stats: t.stats || base.stats,
  };
}
