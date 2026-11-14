/**
 * Hearthmere — the valley itself (DESIGN §5).
 *
 * Owns the tile store (parallel typed arrays, never objects), seeded terrain
 * generation and its validation/retry loop, resource stock and regrowth, the
 * day/season clock and the weather. Everything else in the game reads tiles
 * through this module's API.
 *
 * No DOM: this file must import cleanly under Node 22 so the QA harness and
 * the other modules stay headless-testable (DESIGN §18).
 */

import {
  GRID_W, GRID_H,
  TERRAIN, TERRAIN_INFO,
  RESOURCE, RESOURCE_INFO,
  DAY_SECONDS, SEASON_DAYS, DAYS_PER_YEAR,
  SEASON_SPRING, SEASON_SUMMER, SEASON_AUTUMN, SEASON_WINTER,
  ROAD_NONE,
  moveCostFor, speedFor,
} from './constants.js';

import {
  RNG, makeNoise2D, fbm, clamp, approach,
  packTyped, unpackTyped, dirBetween,
} from './utils.js';

const N_TILES = GRID_W * GRID_H;
const TAU = Math.PI * 2;

/** Generation retry budget (DESIGN §5: "retries up to 12 seeds until ok"). */
const MAX_GEN_ATTEMPTS = 12;

const START_SIZE = 8;           // the 8x8 settlement clearing (§5.7)
const MIN_PASS_DISTANCE = 12;   // start must be this far from any pass (§5.7)

const DIR_NAMES = [
  'East', 'South-East', 'South', 'South-West',
  'West', 'North-West', 'North', 'North-East',
];

// Orthogonal-only offsets, used for road adjacency and the shore/sand rings.
const ORTH_DX = [1, 0, -1, 0];
const ORTH_DY = [0, 1, 0, -1];

// 8-way offsets in the same order as constants.DIR_DX/DIR_DY.
const N8_DX = [1, 1, 0, -1, -1, -1, 0, 1];
const N8_DY = [0, 1, 1, 1, 0, -1, -1, -1];

/**
 * Every tile layer the save carries. All nine are required: a layer that is
 * short, absent or non-numeric silently restores a map whose tiles read
 * `undefined` out of RESOURCE_INFO/TERRAIN_INFO, which throws once per
 * game-day forever rather than failing at load (ADDENDUM N3).
 */
const TILE_LAYERS = ['terrain', 'resource', 'amount', 'building', 'road', 'fertility', 'elev', 'solid', 'gate'];

function numOk(v) {
  return v === undefined || Number.isFinite(v);
}

/** A reason string if `obj` is not a usable world blob, otherwise ''. */
function worldFault(obj) {
  for (let i = 0; i < TILE_LAYERS.length; i++) {
    const name = TILE_LAYERS[i];
    const a = obj[name];
    if (!Array.isArray(a)) return 'world.' + name + ' missing';
    if (a.length !== N_TILES) return 'world.' + name + ' is ' + a.length + ', want ' + N_TILES;
    for (let k = 0; k < N_TILES; k++) {
      if (!Number.isFinite(a[k])) return 'world.' + name + '[' + k + '] is not a number';
    }
  }
  if (!numOk(obj.seed) || !numOk(obj.baseSeed)) return 'world.seed is not a number';
  if (obj.rng !== undefined && obj.rng !== null) {
    const st = obj.rng;
    const ok = typeof st === 'number' ? Number.isFinite(st) : typeof st === 'object' && Number.isFinite(st.s);
    if (!ok) return 'world.rng is not a generator state';
  }
  const c = obj.clock;
  if (c !== undefined && c !== null) {
    if (typeof c !== 'object') return 'world.clock is not an object';
    if (!numOk(c.day) || !numOk(c.timeOfDay) || !numOk(c.season) || !numOk(c.year)) return 'world.clock has a non-number';
  }
  const w = obj.weather;
  if (w !== undefined && w !== null) {
    if (typeof w !== 'object' || !numOk(w.snow) || !numOk(w.rain)) return 'world.weather has a non-number';
  }
  if (obj.start !== undefined && obj.start !== null) {
    if (typeof obj.start !== 'object' || !Number.isFinite(obj.start.x) || !Number.isFinite(obj.start.y)) {
      return 'world.start is not a tile';
    }
  }
  const a = obj.startArea;
  if (a !== undefined && a !== null) {
    if (typeof a !== 'object' || !numOk(a.x) || !numOk(a.y) || !numOk(a.w) || !numOk(a.h)) return 'world.startArea is not a rect';
  }
  if (obj.passes !== undefined && obj.passes !== null) {
    if (!Array.isArray(obj.passes)) return 'world.passes is not an array';
    for (let i = 0; i < obj.passes.length; i++) {
      const p = obj.passes[i];
      if (!p || typeof p !== 'object' || !Number.isFinite(p.idx)) return 'world.passes[' + i + '] is not a pass';
    }
  }
  return '';
}

export function createWorld(game) {
  return new World(game);
}

class World {
  constructor(game) {
    // Held for the event bus only; nothing here reads another module until
    // init() (DESIGN §12).
    this.game = game;

    this.seed = 1;
    this.baseSeed = 1;
    this.genAttempts = 0;
    this.rng = new RNG(1);

    this.terrain = new Uint8Array(N_TILES);
    this.resource = new Uint8Array(N_TILES);
    this.amount = new Uint16Array(N_TILES);
    this.building = new Int32Array(N_TILES);
    this.road = new Uint8Array(N_TILES);
    this.fertility = new Uint8Array(N_TILES);
    this.elev = new Uint8Array(N_TILES);

    // Not in §5's tile-record list, but `isWalkable` is specified as "terrain
    // walkable and no *solid* building", and gates are villager-passable but
    // enemy-blocking (§10.3) — so world has to carry both flags. They live
    // here (and in the save) rather than in paths so that the FROZEN restore
    // order `world -> paths.rebuild()` has real data to rebuild regions from,
    // before buildings.js has restored anything.
    this.solid = new Uint8Array(N_TILES);
    this.gate = new Uint8Array(N_TILES);

    this.building.fill(-1);

    /**
     * Bumped by every mutation that can change walkability, move cost or
     * connectivity. `paths.js` compares it against its own copy and rebuilds
     * its caches lazily, which closes the "someone forgot to invalidate" seam
     * without paths having to trust anyone to call it.
     */
    this.rev = 1;

    this.start = { x: 0, y: 0 };
    this.startArea = { x: 0, y: 0, w: START_SIZE, h: START_SIZE };
    this.passes = [];

    this.clock = { day: 1, timeOfDay: 0.26, season: SEASON_SPRING, year: 1 };
    this.weather = { snow: 0, rain: 0 };
    this.weatherNoise = makeNoise2D(1);

    this.lastValidation = { ok: false, reason: 'not generated' };

    // Generation scratch — allocated once, reused across retries.
    this._scratchF = new Float64Array(N_TILES);
    this._scratchI = new Int32Array(N_TILES);
    this._waterDist = new Int32Array(N_TILES);
    this._shoreDist = new Int32Array(N_TILES);
    this._reach = new Uint8Array(N_TILES);
    this._queue = new Int32Array(N_TILES);
  }

  /** Called once every module exists. World needs nothing from anyone. */
  init() {}

  /* ================================================================== *
   * Tile queries (DESIGN §5 public API)
   * ================================================================== */

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
  }

  /** Tile index at (x, y), or -1 when out of bounds. */
  tileAt(x, y) {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return -1;
    return y * GRID_W + x;
  }

  /** Buildable: terrain allows it, and nothing already occupies the tile. */
  isBuildable(idx) {
    if (idx < 0 || idx >= N_TILES) return false;
    if (this.building[idx] !== -1) return false;
    if (this.road[idx] !== ROAD_NONE) return false;
    return TERRAIN_INFO[this.terrain[idx]].buildable;
  }

  /**
   * Walkable for villagers. A road makes a tile walkable regardless of the
   * terrain under it, which is how a bridge over water works; a solid
   * building blocks it regardless of the terrain.
   */
  isWalkable(idx) {
    if (idx < 0 || idx >= N_TILES) return false;
    if (this.solid[idx] !== 0) return false;
    if (this.road[idx] !== ROAD_NONE) return true;
    return TERRAIN_INFO[this.terrain[idx]].walkable;
  }

  /** Walkable for raiders: gates are shut to them (§10.3). */
  isEnemyWalkable(idx) {
    if (idx < 0 || idx >= N_TILES) return false;
    if (this.gate[idx] !== 0) return false;
    return this.isWalkable(idx);
  }

  /**
   * A* cost for a tile, normalised so the cheapest tile (cobbled road) costs
   * exactly 1.0 and utils.octile stays admissible (ADDENDUM C/D6). Delegates
   * to constants.moveCostFor — nothing may invent its own cost formula.
   * Pathfinding only; villager movement uses speedAt().
   */
  moveCost(idx) {
    if (idx < 0 || idx >= N_TILES) return Infinity;
    return moveCostFor(this.road[idx], this.terrain[idx]);
  }

  /** Real movement speed in tiles/sec for a tile (§6), 0 if impassable. */
  speedAt(idx) {
    if (idx < 0 || idx >= N_TILES) return 0;
    return speedFor(this.road[idx], this.terrain[idx]);
  }

  terrainAt(idx) {
    return idx < 0 || idx >= N_TILES ? TERRAIN.MOUNTAIN : this.terrain[idx];
  }

  /* ================================================================== *
   * Tile mutation — every writer must come through here so `rev` moves
   * ================================================================== */

  /** FOREST -> GRASS, dropping the standing timber (§5). */
  clearForest(idx) {
    if (idx < 0 || idx >= N_TILES) return false;
    if (this.terrain[idx] !== TERRAIN.FOREST) return false;
    this.terrain[idx] = TERRAIN.GRASS;
    if (this.resource[idx] === RESOURCE.TREE) {
      this.resource[idx] = RESOURCE.NONE;
      this.amount[idx] = 0;
    }
    this.rev++;
    return true;
  }

  /**
   * Take up to `qty` units out of the node on a tile; returns what was
   * actually taken. A tree tile emptied this way becomes GRASS — the other
   * finite nodes keep their marker at 0 so the player can still see the
   * exhausted outcrop and the serving building can say 'resource exhausted'.
   */
  harvest(idx, qty) {
    if (idx < 0 || idx >= N_TILES || qty <= 0) return 0;
    const have = this.amount[idx];
    if (have === 0 || this.resource[idx] === RESOURCE.NONE) return 0;
    const got = qty < have ? qty : have;
    this.amount[idx] = have - got;
    if (this.amount[idx] === 0 && this.resource[idx] === RESOURCE.TREE) {
      this.resource[idx] = RESOURCE.NONE;
      if (this.terrain[idx] === TERRAIN.FOREST) this.terrain[idx] = TERRAIN.GRASS;
      this.rev++;
    }
    return got;
  }

  /** Occupancy write for buildings.js. Does not affect walkability. */
  setBuilding(idx, buildingId) {
    if (idx < 0 || idx >= N_TILES) return;
    this.building[idx] = buildingId;
  }

  /**
   * Road write. Returns true if anything changed. Call `paths.setRoad` rather
   * than this directly — it does the same thing and then invalidates the path
   * caches for you.
   */
  setRoad(idx, kind) {
    if (idx < 0 || idx >= N_TILES) return false;
    const k = kind | 0;
    if (this.road[idx] === k) return false;
    this.road[idx] = k;
    if (k !== ROAD_NONE) this.clearForest(idx);
    this.rev++;
    return true;
  }

  /** Solid-building flag: walls, and every `solid: true` def (§10.3). */
  setSolid(idx, solid) {
    if (idx < 0 || idx >= N_TILES) return false;
    const v = solid ? 1 : 0;
    if (this.solid[idx] === v) return false;
    this.solid[idx] = v;
    this.rev++;
    return true;
  }

  /** Gate flag: villager-passable, enemy-blocking. */
  setGate(idx, isGate) {
    if (idx < 0 || idx >= N_TILES) return false;
    const v = isGate ? 1 : 0;
    if (this.gate[idx] === v) return false;
    this.gate[idx] = v;
    this.rev++;
    return true;
  }

  /**
   * Nearest tile carrying `kind` with stock left, within `radius` tiles of
   * (x, y). Scans outward a ring at a time and stops as soon as no closer
   * tile can exist, so it stays cheap enough to call per gathering trip.
   *
   * `minAmount` is what makes a raised `gathers.yield` mean anything (M1):
   * a node holding a full load is preferred at any distance inside the radius,
   * because draining the closest tile and then living off its regrowth caps
   * output at the regrow rate however much a trip is nominally worth. The
   * nearest non-empty node is still returned when nothing holds a full load,
   * so a picked-over patch is worked down rather than abandoned.
   */
  findResourceNear(x, y, kind, radius, minAmount) {
    const r = radius > 0 ? radius | 0 : 0;
    const need = minAmount > 1 ? minAmount : 1;
    let best = -1;
    let bestD = Infinity;
    let any = -1;
    let anyD = Infinity;
    const consider = (ix, iy) => {
      const idx = this.tileAt(ix, iy);
      if (idx < 0 || this.resource[idx] !== kind) return;
      const amt = this.amount[idx];
      if (amt <= 0) return;
      const d = Math.hypot(ix - x, iy - y);
      if (d > r) return;
      if (amt >= need) { if (d < bestD) { bestD = d; best = idx; } }
      else if (d < anyD) { anyD = d; any = idx; }
    };
    for (let ring = 0; ring <= r; ring++) {
      // Only a full-load hit can end the scan early: a closer partial node
      // never outranks a full one further out.
      if (bestD <= ring) break;
      if (ring === 0) {
        consider(x, y);
        continue;
      }
      const x0 = x - ring, x1 = x + ring, y0 = y - ring, y1 = y + ring;
      for (let ix = x0; ix <= x1; ix++) {
        consider(ix, y0);
        consider(ix, y1);
      }
      for (let iy = y0 + 1; iy <= y1 - 1; iy++) {
        consider(x0, iy);
        consider(x1, iy);
      }
    }
    return best >= 0 ? best : any;
  }

  /** Total remaining units of a resource kind across the map. */
  resourceTotal(kind) {
    let sum = 0;
    for (let i = 0; i < N_TILES; i++) if (this.resource[i] === kind) sum += this.amount[i];
    return sum;
  }

  /* ================================================================== *
   * Clock, weather, regrowth (DESIGN §3, §5)
   * ================================================================== */

  update(dt, game) {
    if (!(dt > 0)) return;
    const c = this.clock;
    c.timeOfDay += dt / DAY_SECONDS;
    // A while loop, not an if: the headless harness may step with a dt larger
    // than a whole day and must still fire every rollover exactly once.
    while (c.timeOfDay >= 1) {
      c.timeOfDay -= 1;
      this.advanceDay(game);
    }
    this.updateWeather(dt);
  }

  /**
   * One day rollover. `day:ended` carries the day that has just BEGUN, so the
   * invariant `payload.day === world.clock.day` always holds — see the note in
   * the handoff; it removes the off-by-one every listener would otherwise have
   * to guess at. `season:changed` follows immediately (DESIGN §3).
   */
  advanceDay(game) {
    const c = this.clock;
    const prevSeason = c.season;
    c.day += 1;
    c.season = Math.floor((c.day - 1) / SEASON_DAYS) % 4;
    c.year = Math.floor((c.day - 1) / DAYS_PER_YEAR) + 1;

    const bus = (game && game.bus) || (this.game && this.game.bus) || null;
    if (bus) {
      bus.emit('day:ended', { day: c.day });
      if (c.season !== prevSeason) bus.emit('season:changed', { season: c.season, year: c.year });
    }
    this.regrow();
  }

  /** Daily regrowth (§5). Finite nodes (stone/iron/clay) never regrow. */
  regrow() {
    const season = this.clock.season;
    const berryRate = season === SEASON_SPRING || season === SEASON_SUMMER ? 3
      : season === SEASON_AUTUMN ? 1 : 0;
    const res = this.resource;
    const amt = this.amount;
    for (let i = 0; i < N_TILES; i++) {
      const r = res[i];
      if (r === RESOURCE.NONE) continue;
      const info = RESOURCE_INFO[r];
      let rate = info.regrow;
      if (rate === 0) continue;
      if (r === RESOURCE.BERRY) rate = berryRate;
      if (rate === 0) continue;
      // A tree tile only regrows while something is still standing; an empty
      // one has already become grass in harvest().
      if (r === RESOURCE.TREE && amt[i] < 1) continue;
      const next = amt[i] + rate;
      amt[i] = next > info.cap ? info.cap : next;
    }
  }

  /**
   * Cosmetic weather, driven entirely by the clock so a save/restore lands on
   * exactly the same sky. Winter snows, everything else rains.
   */
  updateWeather(dt) {
    const c = this.clock;
    const t = c.day + c.timeOfDay;
    const w = fbm(this.weatherNoise, t * 0.6, 4.5, 3);
    const season = c.season;
    const bias = season === SEASON_WINTER ? 0.26
      : season === SEASON_AUTUMN ? 0.16
        : season === SEASON_SPRING ? 0.1 : -0.06;
    const wet = clamp(w * 0.9 + bias, 0, 1);
    const targetSnow = season === SEASON_WINTER ? wet : 0;
    const targetRain = season === SEASON_WINTER ? 0 : wet;
    this.weather.snow = approach(this.weather.snow, targetSnow, 0.5, dt);
    this.weather.rain = approach(this.weather.rain, targetRain, 0.5, dt);
  }

  /* ================================================================== *
   * Generation (DESIGN §5)
   * ================================================================== */

  /**
   * Build a valley and validate it, retrying with derived seeds up to 12
   * times (§5). Never throws: a run of bad luck keeps the last map rather
   * than leaving the game with no world at all.
   */
  generate(seed) {
    const n = Number(seed);
    const base = Number.isFinite(n) && seed !== null && seed !== undefined && seed !== ''
      ? n >>> 0
      : (Date.now() >>> 0);
    this.baseSeed = base;

    let last = { ok: false, reason: 'not generated' };
    for (let attempt = 0; attempt < MAX_GEN_ATTEMPTS; attempt++) {
      // Attempt 0 honours ?seed= exactly; later attempts walk a fixed golden
      // ratio stride so a given ?seed= is still fully reproducible.
      const s = attempt === 0 ? base : (base + Math.imul(attempt, 0x9e3779b1)) >>> 0;
      this.buildMap(s);
      last = this.validate();
      this.genAttempts = attempt + 1;
      if (last.ok) {
        this.lastValidation = last;
        return last;
      }
    }
    console.warn('[world] generation never validated (' + last.reason + '); keeping the last map');
    this.lastValidation = last;
    return last;
  }

  /** One generation attempt, start to finish. */
  buildMap(seed) {
    this.seed = seed >>> 0;
    this.rng = new RNG(this.seed);
    this.weatherNoise = makeNoise2D(this.seed ^ 0x77777777);

    this.terrain.fill(TERRAIN.GRASS);
    this.resource.fill(RESOURCE.NONE);
    this.amount.fill(0);
    this.building.fill(-1);
    this.road.fill(ROAD_NONE);
    this.fertility.fill(128);
    this.elev.fill(0);
    this.solid.fill(0);
    this.gate.fill(0);
    this.passes.length = 0;

    this.genMountains();
    this.genPasses();
    this.genLake();
    this.genForest();
    this.genMeadow();
    this.genElevation();
    this.genFertility();
    this.genStart();
    this.computeReach();
    this.genRockClusters();
    this.genScatter();

    this.clock.day = 1;
    this.clock.timeOfDay = 0.26;   // the game opens just after dawn
    this.clock.season = SEASON_SPRING;
    this.clock.year = 1;
    this.weather.snow = 0;
    this.weather.rain = 0;
    this.rev++;
  }

  /* ---- 1. mountain ring ------------------------------------------- */

  genMountains() {
    const noise = makeNoise2D(this.seed ^ 0x1a2b3c4d);
    const t = this.terrain;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const edge = Math.min(x, y, GRID_W - 1 - x, GRID_H - 1 - y);
        // 4-8 tiles thick with a wandering inner face, but never thinner than
        // 2.5 so the ring is always sealed except where a pass is carved.
        let thick = 5.8 + fbm(noise, x / 13, y / 13, 4) * 2.6;
        if (thick < 2.5) thick = 2.5;
        if (thick > 8.5) thick = 8.5;
        t[y * GRID_W + x] = edge < thick ? TERRAIN.MOUNTAIN : TERRAIN.GRASS;
      }
    }
  }

  /** Three gaps in the ring, spread roughly 120 degrees apart (§5.1). */
  genPasses() {
    const rng = this.rng;
    const cx = (GRID_W - 1) / 2;
    const cy = (GRID_H - 1) / 2;
    const a0 = rng.next() * TAU;
    for (let i = 0; i < 3; i++) {
      const ang = a0 + (i * TAU) / 3 + rng.range(-0.32, 0.32);
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      // March to the map edge along the ray to find the mouth of the pass.
      let ex = cx, ey = cy;
      for (let step = 1; step < 120; step++) {
        const nx = cx + dx * step;
        const ny = cy + dy * step;
        if (nx < 0.5 || ny < 0.5 || nx > GRID_W - 1.5 || ny > GRID_H - 1.5) break;
        ex = nx; ey = ny;
      }
      const width = rng.range(2.0, 2.8);
      const depth = 18;
      for (let s = 0; s <= depth; s += 0.5) {
        const px = ex - dx * s;
        const py = ey - dy * s;
        const w = s < 2 ? width + 0.8 : width;
        const r = Math.ceil(w);
        for (let oy = -r; oy <= r; oy++) {
          for (let ox = -r; ox <= r; ox++) {
            const tx = Math.round(px) + ox;
            const ty = Math.round(py) + oy;
            if (!this.inBounds(tx, ty)) continue;
            const d = Math.hypot(tx - px, ty - py);
            if (d > w) continue;
            const idx = ty * GRID_W + tx;
            if (this.terrain[idx] === TERRAIN.MOUNTAIN) this.terrain[idx] = TERRAIN.GRASS;
          }
        }
      }
      const mx = clamp(Math.round(ex), 0, GRID_W - 1);
      const my = clamp(Math.round(ey), 0, GRID_H - 1);
      this.passes.push({
        x: mx,
        y: my,
        idx: my * GRID_W + mx,
        name: DIR_NAMES[dirBetween(cx, cy, ex, ey)] + ' Pass',
        dx: -dx,
        dy: -dy,
      });
    }
  }

  /* ---- 2. lake ----------------------------------------------------- */

  genLake() {
    const rng = this.rng;
    const noise = makeNoise2D(this.seed ^ 0x5eed1a4e);
    const cx = (GRID_W - 1) / 2;
    const cy = (GRID_H - 1) / 2;

    // Off-centre but comfortably inside the ring, so the shoreline is never
    // eaten by the mountains.
    let lcx = cx, lcy = cy;
    for (let tries = 0; tries < 60; tries++) {
      const ang = rng.next() * TAU;
      const rad = rng.range(7, 16);
      const px = cx + Math.cos(ang) * rad;
      const py = cy + Math.sin(ang) * rad;
      const edge = Math.min(px, py, GRID_W - 1 - px, GRID_H - 1 - py);
      if (edge >= 17) { lcx = px; lcy = py; break; }
      if (tries === 59) { lcx = cx; lcy = cy; }
    }

    // Two low-frequency lobes plus a little noise: reads as a lake with bays,
    // not as a noise threshold.
    const p1 = rng.range(0, TAU);
    const p2 = rng.range(0, TAU);
    const p3 = rng.range(0, TAU);
    const w1 = rng.range(0.16, 0.32);
    const w2 = rng.range(0.10, 0.20);
    const wobble = (x, y) => {
      const dx = x + 0.5 - lcx;
      const dy = y + 0.5 - lcy;
      const th = Math.atan2(dy, dx);
      return 1
        + w1 * Math.sin(2 * th + p1)
        + w2 * Math.sin(3 * th + p2)
        + 0.10 * Math.sin(5 * th + p3)
        + 0.16 * fbm(noise, x / 7, y / 7, 2);
    };

    const target = rng.range(110, 180);
    const count = (R) => {
      let n = 0;
      const lo = Math.max(0, Math.floor(lcy - R * 1.9));
      const hi = Math.min(GRID_H - 1, Math.ceil(lcy + R * 1.9));
      const lox = Math.max(0, Math.floor(lcx - R * 1.9));
      const hix = Math.min(GRID_W - 1, Math.ceil(lcx + R * 1.9));
      for (let y = lo; y <= hi; y++) {
        for (let x = lox; x <= hix; x++) {
          if (this.terrain[y * GRID_W + x] === TERRAIN.MOUNTAIN) continue;
          const dx = x + 0.5 - lcx;
          const dy = y + 0.5 - lcy;
          if (Math.hypot(dx, dy) < R * wobble(x, y)) n++;
        }
      }
      return n;
    };

    let lo = 3, hi = 14, R = 7;
    for (let it = 0; it < 16; it++) {
      R = (lo + hi) / 2;
      if (count(R) < target) lo = R; else hi = R;
    }

    // Mark, then split into WATER core / SHORE rim / SAND beach (§5.2).
    const lake = this._scratchI;
    lake.fill(0);
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const idx = y * GRID_W + x;
        if (this.terrain[idx] === TERRAIN.MOUNTAIN) continue;
        const dx = x + 0.5 - lcx;
        const dy = y + 0.5 - lcy;
        if (Math.hypot(dx, dy) < R * wobble(x, y)) lake[idx] = 1;
      }
    }
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const idx = y * GRID_W + x;
        if (lake[idx] === 0) continue;
        let rim = false;
        for (let d = 0; d < 8 && !rim; d++) {
          const nx = x + N8_DX[d];
          const ny = y + N8_DY[d];
          if (!this.inBounds(nx, ny) || lake[ny * GRID_W + nx] === 0) rim = true;
        }
        this.terrain[idx] = rim ? TERRAIN.SHORE : TERRAIN.WATER;
      }
    }
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const idx = y * GRID_W + x;
        if (this.terrain[idx] !== TERRAIN.GRASS) continue;
        let beach = false;
        for (let d = 0; d < 8 && !beach; d++) {
          const nx = x + N8_DX[d];
          const ny = y + N8_DY[d];
          if (this.inBounds(nx, ny) && this.terrain[ny * GRID_W + nx] === TERRAIN.SHORE) beach = true;
        }
        if (beach) this.terrain[idx] = TERRAIN.SAND;
      }
    }
    this.lakeCentre = { x: lcx, y: lcy, r: R };
    this.computeWaterDistance();
  }

  /** Multi-source BFS distance (4-way) to the nearest water/shore tile. */
  computeWaterDistance() {
    const dist = this._waterDist;
    const shore = this._shoreDist;
    const q = this._queue;
    dist.fill(0x3fffffff);
    shore.fill(0x3fffffff);
    let head = 0, tail = 0;
    for (let i = 0; i < N_TILES; i++) {
      const t = this.terrain[i];
      if (t === TERRAIN.WATER || t === TERRAIN.SHORE) { dist[i] = 0; q[tail++] = i; }
    }
    while (head < tail) {
      const idx = q[head++];
      const x = idx % GRID_W;
      const y = (idx / GRID_W) | 0;
      const d = dist[idx] + 1;
      for (let k = 0; k < 4; k++) {
        const nx = x + ORTH_DX[k];
        const ny = y + ORTH_DY[k];
        if (!this.inBounds(nx, ny)) continue;
        const n = ny * GRID_W + nx;
        if (dist[n] <= d) continue;
        dist[n] = d;
        q[tail++] = n;
      }
    }
    head = 0; tail = 0;
    for (let i = 0; i < N_TILES; i++) {
      if (this.terrain[i] === TERRAIN.SHORE) { shore[i] = 0; q[tail++] = i; }
    }
    while (head < tail) {
      const idx = q[head++];
      const x = idx % GRID_W;
      const y = (idx / GRID_W) | 0;
      const d = shore[idx] + 1;
      for (let k = 0; k < 4; k++) {
        const nx = x + ORTH_DX[k];
        const ny = y + ORTH_DY[k];
        if (!this.inBounds(nx, ny)) continue;
        const n = ny * GRID_W + nx;
        if (shore[n] <= d) continue;
        shore[n] = d;
        q[tail++] = n;
      }
    }
  }

  /* ---- 3. forest --------------------------------------------------- */

  genForest() {
    const rng = this.rng;
    const noise = makeNoise2D(this.seed ^ 0x0f0e5731);
    const density = this._scratchF;
    density.fill(-Infinity);

    // Clump centres give the forest its shape; the noise only breaks up the
    // edges, so the result reads as woods rather than static.
    const clumps = rng.int(7) + 8;
    const cxs = new Float64Array(clumps);
    const cys = new Float64Array(clumps);
    const crs = new Float64Array(clumps);
    for (let i = 0; i < clumps; i++) {
      let px = 0, py = 0;
      for (let tries = 0; tries < 80; tries++) {
        px = rng.range(5, GRID_W - 5);
        py = rng.range(5, GRID_H - 5);
        const idx = this.tileAt(Math.round(px), Math.round(py));
        if (idx >= 0 && this.terrain[idx] === TERRAIN.GRASS) break;
      }
      cxs[i] = px;
      cys[i] = py;
      crs[i] = rng.range(5, 12);
    }

    let candidates = 0;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const idx = y * GRID_W + x;
        if (this.terrain[idx] !== TERRAIN.GRASS) continue;
        let d = fbm(noise, x / 10, y / 10, 4) * 0.9;
        for (let i = 0; i < clumps; i++) {
          const dist = Math.hypot(x - cxs[i], y - cys[i]);
          if (dist < crs[i]) {
            const t = 1 - dist / crs[i];
            d += 0.95 * t * t;
          }
        }
        density[idx] = d;
        candidates++;
      }
    }
    if (candidates === 0) return;

    const want = Math.round(candidates * rng.range(0.24, 0.30));
    const cut = this.quantileThreshold(density, candidates, want);
    for (let i = 0; i < N_TILES; i++) {
      if (density[i] >= cut && this.terrain[i] === TERRAIN.GRASS) {
        this.terrain[i] = TERRAIN.FOREST;
        this.resource[i] = RESOURCE.TREE;
        this.amount[i] = RESOURCE_INFO[RESOURCE.TREE].start;
      }
    }
  }

  /* ---- 4. meadows -------------------------------------------------- */

  genMeadow() {
    const rng = this.rng;
    const noise = makeNoise2D(this.seed ^ 0x3ead0000);
    const density = this._scratchF;
    density.fill(-Infinity);
    const wd = this._waterDist;

    let candidates = 0;
    let walkable = 0;
    for (let i = 0; i < N_TILES; i++) {
      if (TERRAIN_INFO[this.terrain[i]].walkable) walkable++;
      if (this.terrain[i] !== TERRAIN.GRASS) continue;
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      // Meadows favour the flats near the water (§5.4).
      density[i] = fbm(noise, x / 8.5, y / 8.5, 3) * 0.8 + 0.85 * Math.exp(-wd[i] / 8);
      candidates++;
    }
    if (candidates === 0) return;

    const want = Math.min(candidates, Math.round(walkable * rng.range(0.12, 0.18)));
    const cut = this.quantileThreshold(density, candidates, want);
    for (let i = 0; i < N_TILES; i++) {
      if (density[i] >= cut && this.terrain[i] === TERRAIN.GRASS) this.terrain[i] = TERRAIN.MEADOW;
    }
  }

  /**
   * Threshold on `field` that selects roughly the top `want` of `count`
   * finite entries. Sorts a copy — generation-time only, never a hot path.
   */
  quantileThreshold(field, count, want) {
    if (want <= 0) return Infinity;
    if (want >= count) return -Infinity;
    const vals = new Float64Array(count);
    let n = 0;
    for (let i = 0; i < N_TILES; i++) {
      const v = field[i];
      if (v !== -Infinity && Number.isFinite(v)) vals[n++] = v;
    }
    const sorted = vals.subarray(0, n).slice().sort();
    const k = n - want;
    return sorted[clamp(k, 0, n - 1)];
  }

  /* ---- cosmetic elevation and fertility ---------------------------- */

  genElevation() {
    const noise = makeNoise2D(this.seed ^ 0x2e1e7a70);
    const raw = this._scratchI;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const idx = y * GRID_W + x;
        if (this.terrain[idx] === TERRAIN.MOUNTAIN) { raw[idx] = 4; continue; }
        // Deliberately coarse (3 interior bands over a long wavelength):
        // every band boundary is a place a 4x4 building cannot be placed
        // ('needs flat ground', §7), so plateaus must be large.
        const v = fbm(noise, x / 26, y / 26, 3) * 0.5 + 0.5;
        raw[idx] = clamp(Math.floor(v * 3), 0, 2);
      }
    }
    // One majority pass removes single-tile speckle, which would otherwise
    // scatter unbuildable pockets through perfectly flat meadow.
    const counts = [0, 0, 0, 0, 0];
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const idx = y * GRID_W + x;
        if (raw[idx] === 4) { this.elev[idx] = 4; continue; }
        counts[0] = 0; counts[1] = 0; counts[2] = 0; counts[3] = 0; counts[4] = 0;
        counts[raw[idx]] += 2;
        for (let d = 0; d < 8; d++) {
          const nx = x + N8_DX[d];
          const ny = y + N8_DY[d];
          if (!this.inBounds(nx, ny)) continue;
          const v = raw[ny * GRID_W + nx];
          if (v < 4) counts[v]++;
        }
        let best = 0;
        for (let v = 1; v < 4; v++) if (counts[v] > counts[best]) best = v;
        this.elev[idx] = best;
      }
    }
  }

  genFertility() {
    const noise = makeNoise2D(this.seed ^ 0x4e177711);
    const wd = this._waterDist;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const idx = y * GRID_W + x;
        let f = 0.52 + 0.3 * fbm(noise, x / 12, y / 12, 3) + 0.24 * Math.exp(-wd[idx] / 10);
        const t = this.terrain[idx];
        if (t === TERRAIN.MEADOW) f += 0.16;
        else if (t === TERRAIN.FOREST) f -= 0.08;
        else if (t === TERRAIN.SAND) f -= 0.2;
        else if (t === TERRAIN.ROCK || t === TERRAIN.MOUNTAIN) f = 0.05;
        this.fertility[idx] = clamp(Math.round(f * 255), 0, 255);
      }
    }
  }

  /* ---- 7. start position ------------------------------------------- */

  /**
   * The flattest buildable 8x8 near the shore and clear of the passes (§5.7).
   * Chosen before the rock clusters are placed (which §5 lists first) so that
   * the "stone and clay within 18 tiles, iron within 30" guarantees can be
   * built in by construction rather than left to a retry loop.
   */
  genStart() {
    const sd = this._shoreDist;
    let best = -1;
    let bestScore = Infinity;

    // Three passes of falling standards; the first almost always wins.
    for (let relax = 0; relax < 3; relax++) {
      const hardLimit = relax === 0 ? 0 : relax === 1 ? 2 : 4;
      const passLimit = relax < 2 ? MIN_PASS_DISTANCE : 8;
      for (let y = 1; y + START_SIZE <= GRID_H - 1; y++) {
        for (let x = 1; x + START_SIZE <= GRID_W - 1; x++) {
          let hard = 0;
          let eMin = 9, eMax = -1;
          let shoreBest = 0x3fffffff;
          for (let oy = 0; oy < START_SIZE; oy++) {
            for (let ox = 0; ox < START_SIZE; ox++) {
              const idx = (y + oy) * GRID_W + (x + ox);
              const t = this.terrain[idx];
              // FOREST is cleared below, so it does not count against us.
              if (t === TERRAIN.WATER || t === TERRAIN.SHORE || t === TERRAIN.MOUNTAIN) hard++;
              const e = this.elev[idx];
              if (e < eMin) eMin = e;
              if (e > eMax) eMax = e;
              if (sd[idx] < shoreBest) shoreBest = sd[idx];
            }
          }
          if (hard > hardLimit) continue;
          const ccx = x + START_SIZE / 2;
          const ccy = y + START_SIZE / 2;
          let passOk = true;
          for (let p = 0; p < this.passes.length; p++) {
            if (Math.hypot(ccx - this.passes[p].x, ccy - this.passes[p].y) < passLimit) {
              passOk = false;
              break;
            }
          }
          if (!passOk) continue;
          const score = shoreBest * 1.0 + (eMax - eMin) * 9 + hard * 6
            + Math.abs(ccx - GRID_W / 2) * 0.08 + Math.abs(ccy - GRID_H / 2) * 0.08;
          if (score < bestScore) { bestScore = score; best = y * GRID_W + x; }
        }
      }
      if (best >= 0) break;
    }

    if (best < 0) best = Math.floor(GRID_H / 2) * GRID_W + Math.floor(GRID_W / 2);
    const sx = best % GRID_W;
    const sy = (best / GRID_W) | 0;
    this.startArea = { x: sx, y: sy, w: START_SIZE, h: START_SIZE };
    // start is the CENTRE tile: the 3x3 Town Centre goes at (x-1, y-1).
    this.start = { x: sx + 3, y: sy + 3 };

    // The settlers cleared their own patch: flatten it and fell the trees, so
    // the pre-placed Town Centre and the first few buildings always fit.
    const counts = [0, 0, 0, 0, 0];
    for (let oy = 0; oy < START_SIZE; oy++) {
      for (let ox = 0; ox < START_SIZE; ox++) counts[this.elev[(sy + oy) * GRID_W + (sx + ox)]]++;
    }
    let level = 0;
    for (let v = 1; v < 5; v++) if (counts[v] > counts[level]) level = v;
    for (let oy = 0; oy < START_SIZE; oy++) {
      for (let ox = 0; ox < START_SIZE; ox++) {
        const idx = (sy + oy) * GRID_W + (sx + ox);
        this.elev[idx] = level;
        if (this.terrain[idx] === TERRAIN.FOREST) {
          this.terrain[idx] = TERRAIN.GRASS;
          this.resource[idx] = RESOURCE.NONE;
          this.amount[idx] = 0;
        }
      }
    }
    // Feather the flattening one tile out so the clearing is not a mesa.
    for (let oy = -1; oy <= START_SIZE; oy++) {
      for (let ox = -1; ox <= START_SIZE; ox++) {
        const tx = sx + ox, ty = sy + oy;
        if (!this.inBounds(tx, ty)) continue;
        const idx = ty * GRID_W + tx;
        if (this.terrain[idx] === TERRAIN.MOUNTAIN) continue;
        if (Math.abs(this.elev[idx] - level) > 1) this.elev[idx] = level;
      }
    }
  }

  /** Flood fill of everything a villager can walk to from the start tile. */
  computeReach() {
    const reach = this._reach;
    const q = this._queue;
    reach.fill(0);
    const startIdx = this.tileAt(this.start.x, this.start.y);
    if (startIdx < 0) return;
    let head = 0, tail = 0;
    reach[startIdx] = 1;
    q[tail++] = startIdx;
    while (head < tail) {
      const idx = q[head++];
      const x = idx % GRID_W;
      const y = (idx / GRID_W) | 0;
      for (let d = 0; d < 8; d++) {
        const nx = x + N8_DX[d];
        const ny = y + N8_DY[d];
        if (!this.inBounds(nx, ny)) continue;
        const n = ny * GRID_W + nx;
        if (reach[n] !== 0) continue;
        if (!TERRAIN_INFO[this.terrain[n]].walkable) continue;
        reach[n] = 1;
        q[tail++] = n;
      }
    }
  }

  /* ---- 5. rock outcrops -------------------------------------------- */

  genRockClusters() {
    const rng = this.rng;
    const used = [];
    const plan = [
      { kind: RESOURCE.STONE, count: rng.int(4) + 5, near: 18, ore: [6, 14], skirt: [5, 10] },
      { kind: RESOURCE.CLAY, count: rng.int(2) + 3, near: 18, ore: [5, 10], skirt: [2, 5] },
      { kind: RESOURCE.IRON, count: rng.int(3) + 3, near: 30, ore: [5, 11], skirt: [4, 9] },
    ];
    for (let p = 0; p < plan.length; p++) {
      const spec = plan[p];
      for (let i = 0; i < spec.count; i++) {
        // The first cluster of each kind is forced inside the guaranteed
        // radius of the start (§5.5); the rest go anywhere reachable.
        const maxDist = i === 0 ? spec.near - 2 : Infinity;
        const centre = this.pickClusterSite(used, maxDist);
        if (centre < 0) continue;
        used.push(centre);
        const oreSize = rng.int(spec.ore[1] - spec.ore[0] + 1) + spec.ore[0];
        const skirt = rng.int(spec.skirt[1] - spec.skirt[0] + 1) + spec.skirt[0];
        this.growOutcrop(centre, oreSize + skirt, oreSize, spec.kind);
      }
    }
  }

  /**
   * A tile that can carry an outcrop: reachable land, outside the settlement
   * clearing, and spaced away from the other outcrops so they read as
   * separate landmarks rather than one grey smear.
   */
  pickClusterSite(used, maxDist) {
    const rng = this.rng;
    const sa = this.startArea;
    const sx = this.start.x, sy = this.start.y;
    for (let relax = 0; relax < 4; relax++) {
      const spacing = relax === 0 ? 8 : relax === 1 ? 6 : relax === 2 ? 4 : 2;
      const limit = Number.isFinite(maxDist) ? maxDist + relax * 3 : Infinity;
      for (let tries = 0; tries < 500; tries++) {
        const x = rng.int(GRID_W);
        const y = rng.int(GRID_H);
        const idx = y * GRID_W + x;
        if (this._reach[idx] === 0) continue;
        const t = this.terrain[idx];
        if (t === TERRAIN.WATER || t === TERRAIN.SHORE || t === TERRAIN.MOUNTAIN || t === TERRAIN.ROCK) continue;
        if (x >= sa.x - 2 && x < sa.x + sa.w + 2 && y >= sa.y - 2 && y < sa.y + sa.h + 2) continue;
        const d = Math.hypot(x - sx, y - sy);
        if (d < 6 || d > limit) continue;
        let ok = true;
        for (let u = 0; u < used.length; u++) {
          const ux = used[u] % GRID_W;
          const uy = (used[u] / GRID_W) | 0;
          if (Math.hypot(x - ux, y - uy) < spacing) { ok = false; break; }
        }
        if (ok) return idx;
      }
    }
    return -1;
  }

  /**
   * Random-frontier blob growth: takes tiles off a shuffled frontier so the
   * outcrop gets a ragged, believable silhouette instead of a disc. The first
   * `oreCount` tiles taken (the ones nearest the centre) carry the node, the
   * rest are bare rock skirt.
   */
  growOutcrop(centre, rockCount, oreCount, kind) {
    const rng = this.rng;
    const sa = this.startArea;
    const taken = [];
    const frontier = [centre];
    const seen = new Set([centre]);
    while (taken.length < rockCount && frontier.length > 0) {
      const pickAt = rng.int(Math.min(frontier.length, 4));
      const idx = frontier.splice(pickAt, 1)[0];
      const x = idx % GRID_W;
      const y = (idx / GRID_W) | 0;
      const t = this.terrain[idx];
      if (t === TERRAIN.WATER || t === TERRAIN.SHORE || t === TERRAIN.MOUNTAIN) continue;
      if (x >= sa.x && x < sa.x + sa.w && y >= sa.y && y < sa.y + sa.h) continue;
      taken.push(idx);
      for (let d = 0; d < 8; d++) {
        const nx = x + N8_DX[d];
        const ny = y + N8_DY[d];
        if (!this.inBounds(nx, ny)) continue;
        const n = ny * GRID_W + nx;
        if (seen.has(n)) continue;
        seen.add(n);
        frontier.push(n);
      }
    }
    const info = RESOURCE_INFO[kind];
    for (let i = 0; i < taken.length; i++) {
      const idx = taken[i];
      this.terrain[idx] = TERRAIN.ROCK;
      this.resource[idx] = RESOURCE.NONE;
      this.amount[idx] = 0;
      this.fertility[idx] = 12;
      if (i < oreCount) {
        this.resource[idx] = kind;
        this.amount[idx] = info.start;
      }
    }
  }

  /* ---- 6. scattered nodes ------------------------------------------ */

  genScatter() {
    const rng = this.rng;
    const reach = this._reach;

    // FISH first: only shore tiles a villager can actually stand next to.
    const shoreCells = [];
    for (let i = 0; i < N_TILES; i++) {
      if (this.terrain[i] !== TERRAIN.SHORE) continue;
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      let fishable = false;
      for (let d = 0; d < 8 && !fishable; d++) {
        const nx = x + N8_DX[d];
        const ny = y + N8_DY[d];
        if (this.inBounds(nx, ny) && reach[ny * GRID_W + nx] !== 0) fishable = true;
      }
      if (fishable) shoreCells.push(i);
    }
    const fishInfo = RESOURCE_INFO[RESOURCE.FISH];
    for (let i = 0; i < shoreCells.length; i++) {
      if (shoreCells.length <= 10 || rng.chance(0.7)) {
        this.resource[shoreCells[i]] = RESOURCE.FISH;
        this.amount[shoreCells[i]] = fishInfo.start;
      }
    }

    // GAME in deep woods, BERRY on the woodland edge, HERB in meadow and wood.
    const forest = [];
    const edge = [];
    const meadowy = [];
    for (let i = 0; i < N_TILES; i++) {
      if (reach[i] === 0) continue;
      const t = this.terrain[i];
      if (t === TERRAIN.FOREST) { forest.push(i); meadowy.push(i); continue; }
      if (t === TERRAIN.MEADOW) { meadowy.push(i); }
      if (t !== TERRAIN.GRASS && t !== TERRAIN.MEADOW) continue;
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      for (let d = 0; d < 8; d++) {
        const nx = x + N8_DX[d];
        const ny = y + N8_DY[d];
        if (this.inBounds(nx, ny) && this.terrain[ny * GRID_W + nx] === TERRAIN.FOREST) {
          edge.push(i);
          break;
        }
      }
    }

    this.scatterInto(forest, RESOURCE.GAME, Math.min(46, Math.round(forest.length * 0.035) + 16), 3);
    this.scatterInto(edge, RESOURCE.BERRY, Math.min(64, Math.round(edge.length * 0.16) + 12), 2);
    this.scatterInto(meadowy, RESOURCE.HERB, Math.min(58, Math.round(meadowy.length * 0.05) + 14), 3);

    // §16.9 — the food floor has to be reachable on day one, so force one of
    // each near the settlement if the scatter did not happen to provide one.
    this.ensureNear(RESOURCE.BERRY, 11, edge, forest);
    this.ensureNear(RESOURCE.GAME, 14, forest, edge);
    this.ensureNear(RESOURCE.HERB, 16, meadowy, edge);
  }

  /** Place `want` nodes of `kind` on `cells`, keeping them `spacing` apart. */
  scatterInto(cells, kind, want, spacing) {
    if (cells.length === 0 || want <= 0) return 0;
    const rng = this.rng;
    const info = RESOURCE_INFO[kind];
    const chosen = [];
    let placed = 0;
    let guard = want * 24 + 200;
    while (placed < want && guard-- > 0) {
      const idx = cells[rng.int(cells.length)];
      if (this.resource[idx] !== RESOURCE.NONE && this.resource[idx] !== RESOURCE.TREE) continue;
      const x = idx % GRID_W;
      const y = (idx / GRID_W) | 0;
      let ok = true;
      for (let c = 0; c < chosen.length; c++) {
        const cx = chosen[c] % GRID_W;
        const cy = (chosen[c] / GRID_W) | 0;
        if (Math.abs(cx - x) < spacing && Math.abs(cy - y) < spacing) { ok = false; break; }
      }
      if (!ok) continue;
      this.resource[idx] = kind;
      this.amount[idx] = info.start;
      chosen.push(idx);
      placed++;
    }
    return placed;
  }

  /** Guarantee at least one node of `kind` within `radius` of the start. */
  ensureNear(kind, radius, primary, secondary) {
    if (this.findResourceNear(this.start.x, this.start.y, kind, radius) >= 0) return true;
    const info = RESOURCE_INFO[kind];
    let best = -1;
    let bestD = Infinity;
    for (let pass = 0; pass < 2; pass++) {
      const cells = pass === 0 ? primary : secondary;
      for (let i = 0; i < cells.length; i++) {
        const idx = cells[i];
        if (this.resource[idx] !== RESOURCE.NONE && this.resource[idx] !== RESOURCE.TREE) continue;
        const d = Math.hypot((idx % GRID_W) - this.start.x, ((idx / GRID_W) | 0) - this.start.y);
        if (d >= 5 && d < bestD) { bestD = d; best = idx; }
      }
      if (best >= 0) break;
    }
    if (best < 0) {
      // Nothing suitable at all: make a thicket just outside the clearing.
      best = this.makeThicketNearStart();
      if (best < 0) return false;
    }
    this.resource[best] = kind;
    this.amount[best] = info.start;
    return true;
  }

  /** Last-resort: turn a reachable tile near the start into forest. */
  makeThicketNearStart() {
    for (let r = 6; r <= 14; r++) {
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
          const x = this.start.x + ox;
          const y = this.start.y + oy;
          if (!this.inBounds(x, y)) continue;
          const idx = y * GRID_W + x;
          if (this._reach[idx] === 0) continue;
          const t = this.terrain[idx];
          if (t !== TERRAIN.GRASS && t !== TERRAIN.MEADOW) continue;
          if (this.resource[idx] !== RESOURCE.NONE) continue;
          this.terrain[idx] = TERRAIN.FOREST;
          return idx;
        }
      }
    }
    return -1;
  }

  /* ================================================================== *
   * Validation (DESIGN §5)
   * ================================================================== */

  /**
   * Everything §5 demands of a generated valley, plus the two "guaranteed
   * near the start" clauses and the day-one food floor. Returns {ok, reason}
   * and leaves the counts on `this.lastValidation` for QA.
   */
  validate() {
    // Reachability is the load-bearing check: a resource behind the lake is
    // the same as no resource at all.
    this.computeReach();
    const reach = this._reach;

    const detail = {
      passes: this.passes.length,
      startBuildable: 0,
      tree: 0, stone: 0, clay: 0, iron: 0, shore: 0,
      berry: 0, herb: 0, game: 0, fish: 0,
      distStone: Infinity, distClay: Infinity, distIron: Infinity, distShore: Infinity,
      reachable: 0,
    };

    const sa = this.startArea;
    for (let oy = 0; oy < sa.h; oy++) {
      for (let ox = 0; ox < sa.w; ox++) {
        const idx = this.tileAt(sa.x + ox, sa.y + oy);
        if (idx >= 0 && TERRAIN_INFO[this.terrain[idx]].buildable) detail.startBuildable++;
      }
    }

    for (let i = 0; i < N_TILES; i++) {
      if (reach[i] !== 0) detail.reachable++;
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      if (this.terrain[i] === TERRAIN.SHORE) {
        let touch = false;
        for (let d = 0; d < 8 && !touch; d++) {
          const nx = x + N8_DX[d];
          const ny = y + N8_DY[d];
          if (this.inBounds(nx, ny) && reach[ny * GRID_W + nx] !== 0) touch = true;
        }
        if (touch) {
          detail.shore++;
          const d = Math.hypot(x - this.start.x, y - this.start.y);
          if (d < detail.distShore) detail.distShore = d;
        }
        if (touch && this.resource[i] === RESOURCE.FISH) detail.fish += this.amount[i];
        continue;
      }
      if (reach[i] === 0) continue;
      const r = this.resource[i];
      if (r === RESOURCE.NONE) continue;
      const amt = this.amount[i];
      const d = Math.hypot(x - this.start.x, y - this.start.y);
      if (r === RESOURCE.TREE) detail.tree += amt;
      else if (r === RESOURCE.STONE) { detail.stone += amt; if (d < detail.distStone) detail.distStone = d; }
      else if (r === RESOURCE.CLAY) { detail.clay += amt; if (d < detail.distClay) detail.distClay = d; }
      else if (r === RESOURCE.IRON) { detail.iron += amt; if (d < detail.distIron) detail.distIron = d; }
      else if (r === RESOURCE.BERRY) detail.berry += amt;
      else if (r === RESOURCE.HERB) detail.herb += amt;
      else if (r === RESOURCE.GAME) detail.game += amt;
    }

    const fail = (reason) => {
      this.lastValidation = { ok: false, reason, detail };
      return this.lastValidation;
    };

    if (detail.passes < 2) return fail('fewer than 2 passes');
    if (detail.startBuildable < 60) return fail('start area only ' + detail.startBuildable + ' buildable');
    if (detail.tree < 400) return fail('only ' + detail.tree + ' tree units reachable');
    if (detail.stone < 300) return fail('only ' + detail.stone + ' stone units reachable');
    if (detail.clay < 200) return fail('only ' + detail.clay + ' clay units reachable');
    if (detail.iron < 200) return fail('only ' + detail.iron + ' iron units reachable');
    if (detail.shore < 6) return fail('only ' + detail.shore + ' reachable shore tiles');
    if (detail.distStone > 18) return fail('nearest stone ' + detail.distStone.toFixed(1) + ' tiles away');
    if (detail.distClay > 18) return fail('nearest clay ' + detail.distClay.toFixed(1) + ' tiles away');
    if (detail.distIron > 30) return fail('nearest iron ' + detail.distIron.toFixed(1) + ' tiles away');
    if (detail.berry <= 0) return fail('no reachable berries');
    if (detail.game <= 0) return fail('no reachable game');
    if (detail.herb <= 0) return fail('no reachable herbs');
    if (detail.fish <= 0) return fail('no reachable fish');

    this.lastValidation = { ok: true, reason: '', detail };
    return this.lastValidation;
  }

  /* ================================================================== *
   * Save / restore (DESIGN §14)
   * ================================================================== */

  serialize() {
    const passes = [];
    for (let i = 0; i < this.passes.length; i++) {
      const p = this.passes[i];
      passes.push({ x: p.x, y: p.y, idx: p.idx, name: p.name, dx: p.dx, dy: p.dy });
    }
    return {
      seed: this.seed,
      baseSeed: this.baseSeed,
      rng: this.rng.getState(),
      clock: { day: this.clock.day, timeOfDay: this.clock.timeOfDay, season: this.clock.season, year: this.clock.year },
      weather: { snow: this.weather.snow, rain: this.weather.rain },
      start: { x: this.start.x, y: this.start.y },
      startArea: { x: this.startArea.x, y: this.startArea.y, w: this.startArea.w, h: this.startArea.h },
      passes,
      terrain: packTyped(this.terrain),
      resource: packTyped(this.resource),
      amount: packTyped(this.amount),
      building: packTyped(this.building),
      road: packTyped(this.road),
      fertility: packTyped(this.fertility),
      elev: packTyped(this.elev),
      solid: packTyped(this.solid),
      gate: packTyped(this.gate),
    };
  }

  /**
   * Restore from a save. Returns false (without half-applying) if the blob is
   * unusable, so main.js can discard the save with a toast rather than crash
   * (§14). Nothing here mutates `this` until every check has passed.
   */
  restore(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const fault = worldFault(obj);
    if (fault) {
      console.warn('[world] save rejected:', fault);
      return false;
    }

    this.seed = obj.seed >>> 0;
    this.baseSeed = (obj.baseSeed === undefined ? obj.seed : obj.baseSeed) >>> 0;
    this.rng = new RNG(this.seed);
    if (obj.rng !== undefined) this.rng.setState(obj.rng);
    this.weatherNoise = makeNoise2D(this.seed ^ 0x77777777);

    this.terrain = unpackTyped(Uint8Array, obj.terrain);
    this.resource = unpackTyped(Uint8Array, obj.resource);
    this.amount = unpackTyped(Uint16Array, obj.amount);
    this.building = unpackTyped(Int32Array, obj.building);
    this.road = unpackTyped(Uint8Array, obj.road);
    this.fertility = unpackTyped(Uint8Array, obj.fertility);
    this.elev = unpackTyped(Uint8Array, obj.elev);
    this.solid = unpackTyped(Uint8Array, obj.solid);
    this.gate = unpackTyped(Uint8Array, obj.gate);

    // worldFault() has already rejected any non-finite scalar, so the only job
    // left is to clamp a legal-but-absurd number into the range the clock,
    // weather and start tile are allowed to hold.
    const c = obj.clock || {};
    this.clock.day = c.day === undefined ? 1 : Math.max(1, Math.floor(c.day));
    this.clock.timeOfDay = c.timeOfDay === undefined ? 0.26 : clamp(c.timeOfDay, 0, 0.999999);
    this.clock.season = c.season === undefined
      ? Math.floor((this.clock.day - 1) / SEASON_DAYS) % 4
      : clamp(Math.floor(c.season), 0, 3);
    this.clock.year = c.year === undefined
      ? Math.floor((this.clock.day - 1) / DAYS_PER_YEAR) + 1
      : Math.max(1, Math.floor(c.year));

    const w = obj.weather || {};
    this.weather.snow = clamp(w.snow || 0, 0, 1);
    this.weather.rain = clamp(w.rain || 0, 0, 1);

    if (obj.start) {
      this.start = { x: clamp(obj.start.x | 0, 0, GRID_W - 1), y: clamp(obj.start.y | 0, 0, GRID_H - 1) };
    }
    if (obj.startArea) {
      const a = obj.startArea;
      this.startArea = {
        x: clamp(a.x | 0, 0, GRID_W - 1), y: clamp(a.y | 0, 0, GRID_H - 1),
        w: clamp(a.w | 0, 1, GRID_W), h: clamp(a.h | 0, 1, GRID_H),
      };
    }
    this.passes.length = 0;
    const ps = obj.passes || [];
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      this.passes.push({ x: p.x, y: p.y, idx: p.idx, name: p.name, dx: p.dx, dy: p.dy });
    }

    // Every path cache must be considered stale after this; paths.rebuild()
    // is the next FROZEN restore step and picks the change up either way.
    this.rev++;
    this.lastValidation = { ok: true, reason: 'restored' };
    return true;
  }
}
