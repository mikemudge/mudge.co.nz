// Railwright - entry point. Bootstraps the DOM shell (stylesheet + canvas),
// owns the game loop and state machine ('start' -> 'playing' <-> 'paused' ->
// 'gameover'), and wires world/network/economy/trains/render/particles/
// input/ui together into the single `game` object DESIGN.md section 10
// documents. No p5 - plain canvas 2D and native ES modules, per the shared
// appinit.js loader contract (registered without a `p5/` path).
//
// --- Reconciling the module-vs-module mismatches found while wiring this up
// (see the project report for the full list) -----------------------------
//
//  - network.buildTrack/buildStation/placeSignal/electrifyTrack never charge
//    money themselves (by design - see network.js's header comment); this
//    file wraps each on the live `network` instance so every build is
//    affordability-checked *before* it happens and charged exactly once.
//    removeTrack's refund was similarly never applied anywhere - wrapped too.
//  - network.js has no site lookup, so nothing ever set `site.stationId`
//    when a station was built (input.js calls network.buildStation but never
//    touches world/sites). Fixed by listening for `station:built` here.
//  - network.unlockedTechs (used by planTrack's tunnelling/long_span gating)
//    is documented as "the caller keeps this in sync with purchased techs" -
//    wired via a `tech:bought` listener.
//  - economy.update(dt, ctx) needs getTrains/getStation/getTrackStats/
//    pathDistance; pathDistance is cached here (cleared on track/station
//    changes) since contract generation calls it and A* isn't free.
//  - constants.js's MILESTONES are `{ id, check(game) }` predicates, but
//    economy.js's own internal milestone checker expects a `{type,target}`
//    shape that no MILESTONES entry has, so it silently never fires. This
//    file runs the real MILESTONES predicates directly instead (economy's
//    internal version is harmless dead code, left alone).
import {
  EventBus, makeRng, toIdx, toXY, inBounds, signalKeyFor, clamp, formatMoney,
} from './utils.js';
import { World } from './world.js';
import { Network, ELECTRIFY_COST_PER_TILE } from './network.js';
import { TrainManager, setSchedule } from './trains.js';
import { Economy } from './economy.js';
import { ParticleSystem } from './particles.js';
import { InputController } from './input.js';
import { UI } from './ui.js';
import {
  drawWorld, drawMinimap, createCamera, centerOn, clampCamera, invalidateTerrain,
} from './render.js';
import {
  TILE, LOCOS, WAGON_FOR_ITEM, STATION_COST, STATION_EXTRA_PLATFORM_COST, SIGNAL_COST, MILESTONES, DAY_SECONDS,
} from './constants.js';

const SAVE_KEY = 'railwright_save';
const SAVE_VERSION = 1;
// railwright_seen_intro is read/written entirely by ui.js itself.
const AUTOSAVE_INTERVAL = 10; // real seconds
const EVENT_CADENCE_SECONDS = 45; // Addendum A1.3 - "something notable" cadence, game seconds
const IDLE_NUDGE_SECONDS = 30; // Addendum A1.6, real seconds
const MILESTONE_CHECK_INTERVAL = 3; // real seconds between milestone sweeps
// Addendum A1.5 "skip to next event": tick() clamps gameDt to 0.1s/frame
// regardless of `speed`, so real time is the actual bottleneck at high speed.
// skipToNextEvent() below runs the sim synchronously at this same step size
// instead, bounded by SKIP_MAX_ITERATIONS so a "nothing ever happens" edge
// case can never hang the tab.
const SKIP_STEP_DT = 0.1;
const SKIP_MAX_ITERATIONS = Math.ceil(DAY_SECONDS / SKIP_STEP_DT) + 1;

// --- DOM bootstrap ----------------------------------------------------------
const styleLink = document.createElement('link');
styleLink.rel = 'stylesheet';
styleLink.href = '/static/railwright/railwright.css';
document.head.appendChild(styleLink);

const canvas = document.createElement('canvas');
canvas.id = 'railwright-canvas';
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// --- Scenario modifiers (Addendum A3.2) -------------------------------------
// economy.js applies most of a scenario's effects itself once setScenario()
// is called (demand/contract/upkeep/disaster/port multipliers); the two this
// file still handles directly are the ones no sim module owns a hook for:
// Highlands' tunnelling unlock (a network.js tech, not an economy one) and
// Lean Years' starting money (set before the first tick, not a running
// multiplier). Track/bridge cost multipliers are economy-computed but
// network.js-applied - see applyScenarioCostMultipliers() below.
const SCENARIOS = [
  { id: 'highlands', name: 'Highlands', description: 'More hills and mountains; tunnelling starts unlocked; track costs +25%.' },
  { id: 'braided_river', name: 'Braided River', description: 'Several rivers; bridges cost -40%; more ports.' },
  { id: 'boomtown', name: 'Boomtown', description: 'One huge city with double demand; fewer, richer contracts.' },
  { id: 'coal_country', name: 'Coal Country', description: 'Abundant raw sites, weak processing; exporting via port pays more.' },
  { id: 'lean_years', name: 'Lean Years', description: 'Start with $8,000 and lower upkeep; tighter but cheaper.' },
  { id: 'fair_weather', name: 'Fair Weather', description: 'No disasters, but contract rewards are lower.' },
];

// network.js has no economy reference (see its file header), so its
// TRACK_COST/BRIDGE_COST multipliers have to be mirrored in from here -
// called once right after a scenario is rolled or restored.
function applyScenarioCostMultipliers(game) {
  game.network.setCostMultipliers({
    track: game.economy.getTrackCostMultiplier(),
    bridge: game.economy.getBridgeCostMultiplier(),
  });
}

function rollScenario(game) {
  game.scenario = SCENARIOS[Math.floor(game.rng() * SCENARIOS.length)];
  game.economy.setScenario(game.scenario.id);
  if (game.scenario.id === 'highlands') game.network.unlockedTechs.add('tunnelling');
  if (game.scenario.id === 'lean_years') game.economy.money = 8000;
  applyScenarioCostMultipliers(game);
}

// --- Seed resolution ---------------------------------------------------------
function resolveSeed() {
  const params = new URLSearchParams(window.location.search);
  const q = params.get('seed');
  if (q != null && q !== '') {
    const n = Number(q);
    if (Number.isFinite(n)) return Math.floor(Math.abs(n)) >>> 0;
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

function hasSeedParam() {
  const params = new URLSearchParams(window.location.search);
  const q = params.get('seed');
  return q != null && q !== '';
}

// --- `game` object shape (DESIGN.md section 10, plus the extra interaction
// fields input.js/ui.js/render.js actually read/write) --------------------
function makeGameShell() {
  const game = {
    bus: null,
    rng: null,
    world: null,
    network: null,
    economy: null,
    trainManager: null,
    trains: [],
    stations: null,
    camera: createCamera(),
    tool: 'inspect',
    speed: 1,
    paused: false,
    state: 'start',
    selection: { kind: null, id: null },
    elapsed: 0,
    lastBeatAt: 0,
    // Extension fields input.js/ui.js/render.js read or write directly.
    canvas,
    particles: null,
    trackGhost: null,
    hoverTile: null,
    stationHover: null,
    helpOpen: false,
    showMinimap: false,
    showBlocks: false,
    seed: 0,
    scenario: null,
  };
  return game;
}

// --- Command-method wrapping: charge money for structural changes that
// network.js deliberately never charges itself (mismatch #3) --------------
function wrapChargedMethods(game) {
  const { network, economy, bus } = game;

  const originalBuildTrack = network.buildTrack.bind(network);
  network.buildTrack = (plan) => {
    if (!plan || !plan.legal || !plan.tiles || !plan.tiles.length) return false;
    if (!economy.spend(plan.totalCost, 'construction')) {
      bus.emit('toast', { text: `Not enough money to build that (need ${formatMoney(plan.totalCost)}).`, kind: 'bad' });
      return false;
    }
    const ok = originalBuildTrack(plan);
    if (!ok) economy.earn(plan.totalCost, 'other'); // shouldn't happen after a legal plan, but never eat the player's money for nothing
    return ok;
  };

  const originalBuildStation = network.buildStation.bind(network);
  network.buildStation = (siteId, idx, opts = {}) => {
    const platforms = clamp(Math.round(opts.platforms || 1), 1, 3);
    const cost = STATION_COST + (platforms - 1) * STATION_EXTRA_PLATFORM_COST;
    if (!economy.spend(cost, 'construction')) {
      bus.emit('toast', { text: `Not enough money for a station (need ${formatMoney(cost)}).`, kind: 'bad' });
      return { ok: false, reason: 'insufficient funds' };
    }
    const result = originalBuildStation(siteId, idx, opts);
    if (!result.ok) economy.earn(cost, 'other');
    return result;
  };

  const originalPlaceSignal = network.placeSignal.bind(network);
  network.placeSignal = (a, b) => {
    const key = signalKeyFor(a, b);
    if (network.signals.has(key)) return originalPlaceSignal(a, b); // already exists - idempotent, free
    if (!economy.spend(SIGNAL_COST, 'construction')) {
      bus.emit('toast', { text: `Not enough money for a signal (need ${formatMoney(SIGNAL_COST)}).`, kind: 'bad' });
      return false;
    }
    const ok = originalPlaceSignal(a, b);
    if (!ok) economy.earn(SIGNAL_COST, 'other');
    return ok;
  };

  const originalElectrify = network.electrifyTrack.bind(network);
  network.electrifyTrack = (idx, unlockedTechs) => {
    const tile = network.track.get(idx);
    if (tile && tile.electrified) return originalElectrify(idx, unlockedTechs); // no-op, free
    if (!economy.spend(ELECTRIFY_COST_PER_TILE, 'construction')) {
      bus.emit('toast', { text: `Not enough money to electrify (need ${formatMoney(ELECTRIFY_COST_PER_TILE)}).`, kind: 'bad' });
      return { ok: false, reason: 'insufficient funds' };
    }
    const result = originalElectrify(idx, unlockedTechs);
    if (!result.ok) economy.earn(ELECTRIFY_COST_PER_TILE, 'other');
    return result;
  };

  const originalRemoveTrack = network.removeTrack.bind(network);
  network.removeTrack = (idx) => {
    const refund = originalRemoveTrack(idx);
    if (refund > 0) economy.earn(refund, 'other');
    return refund;
  };

  const originalRepairTile = economy.repairTile.bind(economy);
  economy.repairTile = (idx) => {
    const ok = originalRepairTile(idx);
    if (ok) invalidateTerrain(); // the blocked-tile hazard hatching is baked into the cached terrain layer
    return ok;
  };
}

// --- Sold-train cleanup (Addendum A2/C2) ------------------------------------
// economy.sellTrain() deliberately only credits money and emits `train:sold`
// (see its header comment) - it doesn't own TrainManager or block state. This
// file does, so it wraps the call to actually remove the train and release
// its reservations right after the credit - a leaked reservation here would
// soft-lock the line for everyone else on that block. Addendum C2's forced
// liquidation calls economy.sellTrain() itself, so it goes through this exact
// same removal path (opts is forwarded so its `forced` flag still reaches
// economy.js's own toast/event, unaffected by this wrapper).
function wrapTrainLifecycleMethods(game) {
  const { economy, trainManager, network } = game;
  const originalSellTrain = economy.sellTrain.bind(economy);
  economy.sellTrain = (train, opts) => {
    const value = originalSellTrain(train, opts);
    if (value > 0 && train) {
      network.syncTrainOccupancy(train.id, []);
      train.schedule = { stops: [], index: 0, loop: false };
      trainManager.remove(train.id);
    }
    return value;
  };
}

// --- Event wiring: mismatches that are plumbing, not money ------------------
function wireEventHandlers(game) {
  const { bus, network, world } = game;

  // network.js documents this as the caller's job (see its header comment) -
  // without it, tunnelling/long_span gating in planTrack never unlocks even
  // after the tech is bought.
  bus.on('tech:bought', ({ techId }) => network.unlockedTechs.add(techId));

  // network.js has no site lookup by design, so it never sets site.stationId
  // itself; nothing else in the codebase did either. Milestones, the
  // inspector panel and contract routing all key off this field.
  bus.on('station:built', ({ stationId }) => {
    const station = network.stations.get(stationId);
    if (!station) return;
    const site = world.getSite(station.siteId);
    if (site) site.stationId = stationId;
  });

  bus.on('game:over', () => { game.state = 'gameover'; });

  // Addendum A1.3 event cadence: any of these counts as a "notable beat".
  const beatEvents = [
    'contract:offered', 'contract:completed', 'cargo:delivered',
    'city:grew', 'milestone:reached', 'disaster', 'train:deadlock',
  ];
  for (const name of beatEvents) {
    bus.on(name, () => { game.lastBeatAt = game.elapsed; });
  }
  bus.on('disaster', ({ kind }) => { if (kind === 'landslide') invalidateTerrain(); });

  // Particle "juice" wiring (design task: cargo delivered -> coin pop, sparks
  // on breakdown; steam/braking sparks are per-frame, see updateTrainFx).
  bus.on('cargo:delivered', ({ siteId, revenue }) => {
    const site = world.getSite(siteId);
    if (site) game.particles.coin((site.x + 1) * TILE, (site.y + 1) * TILE, revenue);
  });
  bus.on('train:broken', ({ trainId }) => {
    const train = game.trainManager.trains.find((t) => t.id === trainId);
    if (train && train.headIdx != null) {
      const { x, y } = toXY(train.headIdx);
      game.particles.sparks((x + 0.5) * TILE, (y + 0.5) * TILE);
    }
  });
}

// --- Per-frame particle "juice" for moving/braking trains -------------------
function updateTrainFx(game, dt) {
  for (const train of game.trainManager.trains) {
    if (train.headIdx == null) continue;
    const { x, y } = toXY(train.headIdx);
    const wx = (x + 0.5) * TILE;
    const wy = (y + 0.5) * TILE;
    const prevSpeed = train._fxPrevSpeed ?? train.speed;
    if (train.speed > 0.05 && Math.random() < dt * 2) {
      const loco = LOCOS[train.locoId];
      if (loco && loco.tech === 'diesel_traction') game.particles.smoke(wx, wy);
      else game.particles.steam(wx, wy);
    }
    if (prevSpeed - train.speed > 0.6) game.particles.sparks(wx, wy); // hard braking
    train._fxPrevSpeed = train.speed;
  }
}

// --- Milestones: run constants.js's real MILESTONES predicates directly
// (economy.js's own internal checker never fires - see file header) --------
function checkMilestones(game) {
  for (const m of MILESTONES) {
    if (game._milestonesPaid.has(m.id)) continue;
    let met = false;
    try {
      met = !!m.check(game);
    } catch (err) {
      console.error('railwright: milestone check failed', m.id, err);
    }
    if (met) {
      game._milestonesPaid.add(m.id);
      game.economy.earn(m.reward, 'milestones');
      game.bus.emit('milestone:reached', { milestoneId: m.id, reward: m.reward });
    }
  }
}

// --- economy.update(dt, ctx) context (mismatch #4) --------------------------
function getTrackStats(network) {
  let total = 0;
  let electrified = 0;
  let bridge = 0;
  let tunnel = 0;
  for (const t of network.track.values()) {
    total++;
    if (t.electrified) electrified++;
    if (t.kind === 'bridge') bridge++;
    if (t.kind === 'tunnel') tunnel++;
  }
  return { total, electrified, bridge, tunnel };
}

function stationTargetIdx(station) {
  if (station.tiles && station.tiles.length) return station.tiles[0];
  return station.originIdx;
}

// Cached: contract generation calls pathDistance and A* isn't free. Cleared
// whenever the track graph changes.
function makePathDistanceCache(game) {
  const cache = new Map();
  game.bus.on('track:built', () => cache.clear());
  game.bus.on('station:built', () => cache.clear());
  return function pathDistance(siteAId, siteBId) {
    if (siteAId === siteBId) return 0;
    const key = siteAId < siteBId ? `${siteAId}|${siteBId}` : `${siteBId}|${siteAId}`;
    if (cache.has(key)) return cache.get(key);
    let result = null;
    const siteA = game.world.getSite(siteAId);
    const siteB = game.world.getSite(siteBId);
    if (siteA && siteB && siteA.stationId && siteB.stationId) {
      const stA = game.stations.get(siteA.stationId);
      const stB = game.stations.get(siteB.stationId);
      if (stA && stB) {
        const path = game.network.findPath(stationTargetIdx(stA), stationTargetIdx(stB), {});
        if (path) result = path.cost;
      }
    }
    cache.set(key, result);
    return result;
  };
}

function makeEconomyCtx(game) {
  const pathDistance = makePathDistanceCache(game);
  return {
    getTrains: () => game.trainManager.trains,
    getStation: (id) => game.stations.get(id),
    getTrackStats: () => getTrackStats(game.network),
    pathDistance,
  };
}

function makeTrainsCtx(game) {
  return {
    bus: game.bus, stations: game.stations, network: game.network, economy: game.economy, world: game.world,
  };
}

// --- Starting position: at least one pre-built, connected, revenue-earning
// route so the player is never staring at a blank map (Addendum A) --------
function anchorCandidates(site) {
  return [
    { x: site.x + 2, y: site.y }, { x: site.x - 1, y: site.y },
    { x: site.x, y: site.y + 2 }, { x: site.x, y: site.y - 1 },
    { x: site.x + 2, y: site.y + 1 }, { x: site.x - 1, y: site.y + 1 },
    { x: site.x + 1, y: site.y + 2 }, { x: site.x + 1, y: site.y - 1 },
  ].filter((p) => inBounds(p.x, p.y));
}

function tryBuildStarterRoute(game, pick) {
  const {
    world, network, trainManager, rng,
  } = game;
  const { from, to, item } = pick;

  for (const fa of anchorCandidates(from)) {
    const fromIdx = toIdx(fa.x, fa.y);
    if (!world.isBuildable(fromIdx)) continue;
    for (const ta of anchorCandidates(to)) {
      const toIdxVal = toIdx(ta.x, ta.y);
      if (!world.isBuildable(toIdxVal) || toIdxVal === fromIdx) continue;
      const plan = network.planTrack(fromIdx, toIdxVal);
      if (!plan.legal) continue;

      // Raw (unwrapped) calls - this is a free starting grant, applied
      // before wrapChargedMethods() puts a price on everything.
      if (!network.buildTrack(plan)) continue;
      const stationA = network.buildStation(from.id, fromIdx, { name: `${from.name} Yard`, accepts: [] });
      const stationB = network.buildStation(to.id, toIdxVal, {
        name: `${to.name} Station`,
        accepts: to.kind === 'port' ? [] : (to.consumes || []).map((c) => c.item),
      });
      if (!stationA.ok || !stationB.ok) return false;

      // Addendum B ("first delivery paid within ~2 minutes") is otherwise
      // unreachable from a cold start: site.stock starts empty and
      // economy.js's production model only credits a raw site once per
      // in-game day (DAY_SECONDS=100), so the earliest a station would
      // naturally have anything to load is ~100 game-seconds in, before any
      // travel/load time. Seeding this one guaranteed starter station's
      // `waiting` directly (a one-time head start, not a change to the
      // ongoing per-day production rule) is what actually makes that target
      // achievable.
      const perDay = (from.produces.find((p) => p.item === item) || {}).perDay || 10;
      stationA.station.waiting[item] = (stationA.station.waiting[item] || 0) + perDay;

      const era0Locos = Object.keys(LOCOS).filter((id) => (LOCOS[id].era || 0) === 0);
      const locoId = era0Locos[Math.floor(rng() * era0Locos.length)];
      const wagonType = WAGON_FOR_ITEM[item] || 'boxcar';
      const train = trainManager.buyTrain(locoId, [wagonType, wagonType]);
      // Plain 'load' (take what's there and go), not 'load_full': wagon
      // capacity is far larger than one day's production, so load_full's
      // 120-second timeout would always be hit, blowing Addendum B's
      // "first delivery within ~2 minutes" target on every single seed.
      setSchedule(train, [
        {
          stationId: stationA.station.id, action: 'load', item, waitSeconds: 0,
        },
        {
          stationId: stationB.station.id, action: 'unload_all', item: null, waitSeconds: 0,
        },
      ], { loop: true });

      game._startFocusTile = { x: fa.x, y: fa.y };
      return true;
    }
  }
  return false;
}

function setupStartingPosition(game) {
  const { world, rng } = game;
  // Only *raw* producers (empty consumes) always produce (DESIGN.md section
  // 5). A processing site (smelter, factory, ...) also has a non-empty
  // `produces`, but only outputs once its own inputs are being supplied by
  // some other route - picking one here would hand the player a starter
  // route that silently never earns anything.
  const producers = world.sites.filter((s) => Array.isArray(s.produces) && s.produces.length
    && (!Array.isArray(s.consumes) || s.consumes.length === 0));
  const candidates = [];
  for (const from of producers) {
    for (const p of from.produces) {
      for (const to of world.sites) {
        if (to.id === from.id) continue;
        const wants = to.kind === 'port' || (to.consumes || []).some((c) => c.item === p.item);
        if (!wants) continue;
        candidates.push({ from, to, item: p.item, d: Math.hypot(to.x - from.x, to.y - from.y) });
      }
    }
  }
  if (!candidates.length) {
    console.warn('railwright: no producer/consumer pair found for this seed - starting with a blank network.');
    return;
  }
  candidates.sort((a, b) => a.d - b.d);
  const shortlist = candidates.slice(0, Math.min(6, candidates.length));
  const rollOrder = [...shortlist].sort(() => rng() - 0.5);
  for (const pick of rollOrder) {
    if (tryBuildStarterRoute(game, pick)) return;
  }
  console.warn('railwright: could not lay a starter route for this seed (terrain blocked every candidate) - starting with a blank network.');
}

// --- Fresh game construction -------------------------------------------------
function buildFreshGame(seed) {
  const bus = new EventBus();
  const world = new World(seed, bus);
  const network = new Network(world, bus);
  const economy = new Economy(world, bus, {});
  const trainManager = new TrainManager();
  // TrainManager only latches its own bus reference the first time update()
  // runs (see trains.js); setting it directly here means train:bought fires
  // for the starting train too, not just from the first tick onward.
  trainManager._bus = bus;
  const particles = new ParticleSystem();

  const game = makeGameShell();
  game.bus = bus;
  game.rng = makeRng((seed ^ 0x2545f491) >>> 0);
  game.world = world;
  game.network = network;
  game.economy = economy;
  game.trainManager = trainManager;
  game.trains = trainManager.trains;
  game.stations = network.stations; // mismatch #2: alias, not a copy
  game.particles = particles;
  game.seed = seed;
  game._milestonesPaid = new Set();

  wireEventHandlers(game);
  rollScenario(game);
  setupStartingPosition(game);
  wrapChargedMethods(game);
  wrapTrainLifecycleMethods(game);

  game._economyCtx = makeEconomyCtx(game);
  game._trainsCtx = makeTrainsCtx(game);

  invalidateTerrain(); // render.js's terrain cache is a module singleton - force a repaint for the new map
  return game;
}

function buildGameFromSave(data) {
  const bus = new EventBus();
  const world = World.deserialize(data.world, bus);
  const network = new Network(world, bus);
  network.deserialize(data.network);
  const economy = new Economy(world, bus, {});
  economy.deserialize(data.economy);
  const trainManager = new TrainManager();
  trainManager.deserialize(data.trains);
  trainManager._bus = bus;

  // network.deserialize() above already ran recomputeBlocks(), but at that
  // point no trains existed yet, so every block's `occupants` came back
  // empty regardless of which tiles a saved train's `occupied` says it's
  // physically standing on. Without this, a train mid-block (or legitimately
  // waiting_signal for one) loses its reservation on every load - including
  // every autosave/reload cycle - and a second train can be granted a block
  // another train is still sitting in. Re-deriving occupancy here, after both
  // modules are restored, is robust regardless of which deserialize ran
  // first.
  for (const train of trainManager.trains) {
    if (train.headIdx != null && Array.isArray(train.occupied) && train.occupied.length) {
      network.syncTrainOccupancy(train.id, train.occupied);
    }
  }

  const particles = new ParticleSystem();

  const game = makeGameShell();
  game.bus = bus;
  game.rng = makeRng((data.seed ^ 0x2545f491) >>> 0);
  game.world = world;
  game.network = network;
  game.economy = economy;
  game.trainManager = trainManager;
  game.trains = trainManager.trains;
  game.stations = network.stations;
  game.particles = particles;
  game.seed = data.seed;
  game.scenario = data.scenario || null;
  game.elapsed = data.elapsed || 0;
  game.lastBeatAt = game.elapsed;
  if (data.camera) game.camera = { ...data.camera };
  game._milestonesPaid = new Set(data.milestonesPaid || []);

  wireEventHandlers(game);
  wrapChargedMethods(game);
  wrapTrainLifecycleMethods(game);
  applyScenarioCostMultipliers(game);

  game._economyCtx = makeEconomyCtx(game);
  game._trainsCtx = makeTrainsCtx(game);

  invalidateTerrain();
  return game;
}

// --- Save / load -------------------------------------------------------------
function saveGame(game) {
  try {
    const data = {
      saveVersion: SAVE_VERSION,
      seed: game.seed,
      scenario: game.scenario,
      elapsed: game.elapsed,
      camera: { ...game.camera },
      world: game.world.serialize(),
      network: game.network.serialize(),
      economy: game.economy.serialize(),
      trains: game.trainManager.serialize(),
      milestonesPaid: Array.from(game._milestonesPaid || []),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('railwright: save failed', err);
  }
}

// A version mismatch (or any corruption) is discarded, never crashed on.
function loadSavedGame() {
  let raw;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || data.saveVersion !== SAVE_VERSION) return null;
  try {
    return buildGameFromSave(data);
  } catch (err) {
    console.error('railwright: save appeared corrupt, starting fresh', err);
    return null;
  }
}

// --- Guarded per-subsystem calls: one module throwing must never white-
// screen the game (design requirement) --------------------------------------
const _loggedOnce = new Set();
function safeCall(fn, label) {
  try {
    fn();
  } catch (err) {
    if (!_loggedOnce.has(label)) {
      _loggedOnce.add(label);
      console.error(`railwright: "${label}" failed (further errors from it are suppressed)`, err);
    }
  }
}

// --- Runtime state -----------------------------------------------------------
let game = null;
let input = null;
let ui = null;

function applyStartFocus() {
  const focus = game._startFocusTile;
  if (!focus) return;
  // Safe to call now: drawWorld() has already run at least once this frame,
  // so render.js's cached canvas size (which centerOn relies on) is real.
  centerOn(game.camera, focus.x, focus.y);
  clampCamera(game.camera, canvas);
  game._startFocusTile = null;
}

function markActivity() {
  if (game) {
    game._idleTimer = 0;
    game._idleNudged = false;
  }
}
canvas.addEventListener('pointerdown', markActivity);
window.addEventListener('keydown', markActivity);

function tick(rawDt) {
  if (!game) return;
  game._idleTimer = (game._idleTimer ?? 0) + rawDt;

  const hidden = typeof document !== 'undefined' && document.hidden;
  // Only the simulation itself stalls while paused/hidden - the HUD and
  // panels below must keep reflecting live state regardless (a paused or
  // just-loaded game rendering stale numbers, e.g. $0 while
  // game.economy.money is actually 12000, is a bug, not a pause).
  const simRunning = game.state === 'playing' && !hidden && game.speed !== 0;

  if (simRunning) {
    const gameDt = Math.min(rawDt * game.speed, 0.1);
    game.elapsed += gameDt;

    safeCall(() => input && input.update(gameDt), 'input.update');
    safeCall(() => game.world.update(gameDt), 'world.update');
    safeCall(() => game.economy.update(gameDt, game._economyCtx), 'economy.update');
    safeCall(() => game.trainManager.update(gameDt, game._trainsCtx), 'trains.update');
    safeCall(() => game.network.detectDeadlock(game.trainManager.trains, gameDt), 'network.detectDeadlock');
    safeCall(() => updateTrainFx(game, gameDt), 'updateTrainFx');
    safeCall(() => game.particles.update(gameDt), 'particles.update');

    game._milestoneTimer = (game._milestoneTimer ?? 0) - rawDt;
    if (game._milestoneTimer <= 0) {
      game._milestoneTimer = MILESTONE_CHECK_INTERVAL;
      safeCall(() => checkMilestones(game), 'checkMilestones');
    }

    // Addendum A1.3: nudge the world if nothing notable has happened lately.
    if (game.elapsed - game.lastBeatAt > EVENT_CADENCE_SECONDS) {
      game.lastBeatAt = game.elapsed;
      safeCall(() => {
        if (game.economy.getBoard().length < 6) game.economy.offerContract();
      }, 'cadenceNudge');
    }

    // Addendum A1.6: a gentle nudge after real-world idling.
    if (game._idleTimer > IDLE_NUDGE_SECONDS && !game._idleNudged) {
      game._idleNudged = true;
      game.bus.emit('toast', { text: 'Quiet out there - check the Contract Board, or lay some more track.', kind: 'info' });
    }

    game._autosaveTimer = (game._autosaveTimer ?? AUTOSAVE_INTERVAL) - rawDt;
    if (game._autosaveTimer <= 0) {
      game._autosaveTimer = AUTOSAVE_INTERVAL;
      safeCall(() => saveGame(game), 'saveGame');
    }
  }

  if (game.state === 'playing' || game.state === 'paused') {
    safeCall(() => ui && ui.update(rawDt, game), 'ui.update');
  }
}

function draw() {
  if (!game) return;
  drawWorld(ctx, game, game.camera);
  if (game._startFocusTile) applyStartFocus();
  if (game.showMinimap) {
    const w = 220;
    const h = 170;
    drawMinimap(ctx, game, {
      x: canvas.width - w - 12, y: canvas.height - h - 12, w, h,
    });
  }
}

// Addendum A1.5: runs the sim synchronously at a fixed step until either a
// notable beat fires (economy.getLastBeatAge() resets to ~0 the instant one
// does - the same signal update()'s own cadence nudge watches) or one
// in-game day has passed, whichever is sooner. Deliberately bypasses tick()'s
// speed/rawDt path entirely rather than just cranking `speed`, since gameDt
// is clamped to 0.1s/frame regardless of speed - real time would still be
// the bottleneck otherwise.
function skipToNextEvent(g) {
  if (!g || (g.state !== 'playing' && g.state !== 'paused')) return;
  let advanced = 0;
  let iterations = 0;
  while (advanced < DAY_SECONDS && iterations < SKIP_MAX_ITERATIONS) {
    iterations += 1;
    g.elapsed += SKIP_STEP_DT;
    advanced += SKIP_STEP_DT;
    safeCall(() => g.world.update(SKIP_STEP_DT), 'skip:world.update');
    safeCall(() => g.economy.update(SKIP_STEP_DT, g._economyCtx), 'skip:economy.update');
    safeCall(() => g.trainManager.update(SKIP_STEP_DT, g._trainsCtx), 'skip:trains.update');
    safeCall(() => g.network.detectDeadlock(g.trainManager.trains, SKIP_STEP_DT), 'skip:detectDeadlock');
    safeCall(() => checkMilestones(g), 'skip:checkMilestones');
    if (g.state === 'gameover') break;
    if (g.economy.getLastBeatAge() < SKIP_STEP_DT / 2) break;
  }
  g.bus.emit('toast', { text: `Skipped ahead ${Math.round(advanced)}s.`, kind: 'info' });
}

function attachControllers() {
  input = new InputController(canvas, game);
  ui = new UI(game);
  // Paint real numbers immediately - don't wait for the first rAF frame (an
  // intro overlay pausing the game before that frame runs would otherwise
  // leave the HUD showing its hardcoded placeholder, e.g. "$0").
  ui.update(0, game);
  game.skipToNextEvent = () => skipToNextEvent(game);
  window.__railwright = {
    game, save: () => saveGame(game), restart: (seed) => restartGame(seed),
  };
}

function startNewOrLoadedGame() {
  const forced = hasSeedParam();
  const loaded = forced ? null : loadSavedGame();
  game = loaded || buildFreshGame(resolveSeed());
  game.state = 'playing';
  attachControllers();
}

// Full teardown + rebuild: no leaked listeners, no stale DOM, no duplicate
// canvases (the canvas itself is created once, above, and reused).
function restartGame(seed) {
  try { input?.destroy(); } catch (err) { console.error('railwright: input teardown failed', err); }
  try { ui?.destroy(); } catch (err) { console.error('railwright: ui teardown failed', err); }
  try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable - fine, we're not loading it back */ }
  game = buildFreshGame(seed ?? resolveSeed());
  game.state = 'playing';
  attachControllers();
}

// --- Main loop ---------------------------------------------------------------
let lastTime = performance.now();
function loop(now) {
  const rawDt = Math.min((now - lastTime) / 1000, 0.25); // real seconds; clamp for a backgrounded-tab catch-up
  lastTime = now;
  safeCall(() => tick(rawDt), 'tick');
  safeCall(() => draw(), 'draw');
  requestAnimationFrame(loop);
}

startNewOrLoadedGame();
requestAnimationFrame(loop);
