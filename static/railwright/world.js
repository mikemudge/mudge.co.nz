// Terrain generation, tile queries, site placement and the day/season clock.
// Must be importable and runnable under plain Node - no document/window/
// localStorage/canvas anywhere in this file (design contract section 12).
import { GRID_W, GRID_H, SITE_KINDS, PLACE_NAMES, TRACK_COST, BRIDGE_COST, TUNNEL_COST, DAY_SECONDS } from './constants.js';
import { toIdx, toXY, inBounds, makeRng, randInt, randPick, shuffle, neighbours, clamp } from './utils.js';

// Terrain factor is a relative multiplier network.js can use as the
// "terrain factor" term in its A* cost function. Plain track is the
// baseline (1.0); water/mountain use the bridge/tunnel cost relative to
// plain, since those tiles aren't priced via TRACK_COST at all.
// CONTRACT-GAP: the doc doesn't give an exact terrainFactor formula, only
// that pathfinding cost is "step distance x terrain factor x grade
// penalty" - this is the smallest consistent choice.
const TERRAIN_FACTOR = {
  plain: TRACK_COST.plain / TRACK_COST.plain,
  forest: TRACK_COST.forest / TRACK_COST.plain,
  hill: TRACK_COST.hill / TRACK_COST.plain,
  water: BRIDGE_COST / TRACK_COST.plain,
  mountain: TUNNEL_COST / TRACK_COST.plain,
};

function makeNoise2D(rng) {
  const terms = [];
  for (let i = 0; i < 5; i++) {
    terms.push({
      fx: (rng() * 0.09 + 0.02) * (rng() < 0.5 ? 1 : -1),
      fy: (rng() * 0.09 + 0.02) * (rng() < 0.5 ? 1 : -1),
      phase: rng() * Math.PI * 2,
      amp: 1 / (i + 1),
    });
  }
  let norm = 0;
  for (const t of terms) norm += t.amp;
  return function noise(x, y) {
    let v = 0;
    for (const t of terms) v += t.amp * Math.sin(x * t.fx + y * t.fy + t.phase);
    return (v / norm + 1) / 2; // 0..1
  };
}

function bresenhamLine(x0, y0, x1, y1) {
  const points = [];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < GRID_W + GRID_H + 4; guard++) {
    points.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return points;
}

export class World {
  constructor(seed, bus, opts = {}) {
    this.seed = seed;
    this.bus = bus ?? null;
    this.rng = makeRng(seed >>> 0);
    this.clock = { day: 1, timeOfDay: 0.25, season: 0 };
    this.tiles = [];
    this.sites = [];
    this._siteById = new Map();

    if (!opts.skipGeneration) {
      this._generateTerrain();
      this._placeSites();
      this._siteById = new Map(this.sites.map((s) => [s.id, s]));
      this.verifyConnectivity({ carve: true });
    }
  }

  // --- Terrain generation ------------------------------------------------
  _generateTerrain() {
    const n = GRID_W * GRID_H;
    this.tiles = new Array(n);
    for (let idx = 0; idx < n; idx++) {
      const { x, y } = toXY(idx);
      this.tiles[idx] = { x, y, type: 'plain', elevation: 0, siteId: null, blocked: false };
    }

    this._carveMountainRidge();
    this._carveRiver();

    const elevationNoise = makeNoise2D(this.rng);
    const forestNoise = makeNoise2D(this.rng);
    for (let idx = 0; idx < n; idx++) {
      const tile = this.tiles[idx];
      if (tile.type === 'water' || tile.type === 'mountain') continue;
      const e = elevationNoise(tile.x, tile.y);
      if (e > 0.62) {
        tile.type = 'hill';
        tile.elevation = 2;
      } else {
        const f = forestNoise(tile.x, tile.y);
        tile.type = f > 0.56 ? 'forest' : 'plain';
        tile.elevation = e > 0.4 ? 1 : 0;
      }
    }
  }

  // A ridge of mountain tiles running roughly top-to-bottom, meandering in x.
  _carveMountainRidge() {
    let x = randInt(this.rng, Math.floor(GRID_W * 0.3), Math.floor(GRID_W * 0.7));
    for (let y = 0; y < GRID_H; y++) {
      const width = randInt(this.rng, 1, 3);
      for (let w = 0; w < width; w++) {
        const tx = x + w;
        if (inBounds(tx, y)) {
          const idx = toIdx(tx, y);
          this.tiles[idx].type = 'mountain';
          this.tiles[idx].elevation = 3;
        }
      }
      x += randPick(this.rng, [-1, 0, 0, 0, 1]);
      x = clamp(x, 2, GRID_W - 4);
    }
  }

  // A river running roughly left-to-right, meandering in y, 1-2 tiles wide.
  // Carved after the ridge so the river can cut a valley through it.
  _carveRiver() {
    let y = randInt(this.rng, Math.floor(GRID_H * 0.35), Math.floor(GRID_H * 0.65));
    for (let x = 0; x < GRID_W; x++) {
      const width = this.rng() < 0.35 ? 2 : 1;
      for (let w = 0; w < width; w++) {
        const ty = y + w;
        if (inBounds(x, ty)) {
          const idx = toIdx(x, ty);
          this.tiles[idx].type = 'water';
          this.tiles[idx].elevation = 0;
        }
      }
      y += randPick(this.rng, [-1, 0, 0, 0, 1]);
      y = clamp(y, 2, GRID_H - 4);
    }
  }

  // --- Site placement ------------------------------------------------
  // Footprint tiles must be in bounds, not water/mountain, and not already
  // owned by another site. `minGap` (tile distance between footprint
  // anchors) keeps chain members spread out so routing is a real decision.
  _footprintValid(x, y) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (!inBounds(tx, ty)) return false;
        const tile = this.tiles[toIdx(tx, ty)];
        if (tile.type === 'water' || tile.type === 'mountain') return false;
        if (tile.siteId) return false;
      }
    }
    return true;
  }

  _farEnough(x, y, minGap) {
    for (const site of this.sites) {
      const d = Math.max(Math.abs(site.x - x), Math.abs(site.y - y));
      if (d < minGap) return false;
    }
    return true;
  }

  _placeOne(kind, name, minGap, opts = {}) {
    const candidates = [];
    for (let y = 1; y < GRID_H - 3; y++) {
      for (let x = 1; x < GRID_W - 3; x++) {
        candidates.push({ x, y });
      }
    }
    shuffle(this.rng, candidates);
    for (const c of candidates) {
      if (!this._footprintValid(c.x, c.y)) continue;
      if (!this._farEnough(c.x, c.y, minGap)) continue;
      if (opts.onRiverOrEdge && !this._touchesRiverOrEdge(c.x, c.y)) continue;
      this._commitSite(kind, name, c.x, c.y);
      return true;
    }
    return false;
  }

  _touchesRiverOrEdge(x, y) {
    if (x <= 1 || y <= 1 || x >= GRID_W - 3 || y >= GRID_H - 3) return true;
    for (let dy = -1; dy <= 2; dy++) {
      for (let dx = -1; dx <= 2; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (inBounds(tx, ty) && this.tiles[toIdx(tx, ty)].type === 'water') return true;
      }
    }
    return false;
  }

  _commitSite(kind, name, x, y) {
    const def = SITE_KINDS[kind];
    const id = `site_${this.sites.length}_${kind}`;
    const site = {
      id,
      kind,
      name,
      x,
      y,
      produces: def.produces.map((p) => ({ ...p })),
      consumes: def.consumes.map((c) => ({ ...c })),
      stock: {},
      demand: {},
      stationId: null,
      level: 1,
      // Base level-1 population baseline (see CONTRACT-GAP in constants.js).
      population: kind === 'city' ? 1200 : kind === 'town' ? 300 : 0,
      satisfaction: 0.5,
    };
    if (def.consumesAny) {
      site.consumesAny = true;
      site.priceMultiplier = def.priceMultiplier;
    }
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        this.tiles[toIdx(x + dx, y + dy)].siteId = id;
      }
    }
    this.sites.push(site);
    return site;
  }

  _placeSites() {
    const names = shuffle(this.rng, [...PLACE_NAMES]);
    let nameIdx = 0;
    const nextName = () => names[nameIdx++ % names.length];

    // The full mine -> smelter -> factory -> town chain, deliberately
    // spread out (large minGap) so connecting it is a real routing puzzle.
    const chainGap = Math.floor(Math.min(GRID_W, GRID_H) * 0.4);
    const coalName = nextName();
    this._placeOne('coal_mine', `${coalName} Colliery`, chainGap);
    const ironName = nextName();
    this._placeOne('iron_mine', `${ironName} Iron Mine`, chainGap);
    const smelterName = nextName();
    this._placeOne('smelter', `${smelterName} Smelter`, chainGap);
    const factoryName = nextName();
    this._placeOne('factory', `${factoryName} Factory`, chainGap);
    const chainTownName = nextName();
    this._placeOne('town', chainTownName, chainGap);

    // Remaining raw + processing sites, modest spacing to avoid overlap.
    const rest = [
      ['quarry', () => `${nextName()} Quarry`],
      ['farm', () => `${nextName()} Farm`],
      ['farm', () => `${nextName()} Farm`],
      ['logging_camp', () => `${nextName()} Logging Camp`],
      ['oil_well', () => `${nextName()} Oil Well`],
      ['sawmill', () => `${nextName()} Sawmill`],
      ['mill', () => `${nextName()} Flour Mill`],
      ['refinery', () => `${nextName()} Refinery`],
      ['workshop', () => `${nextName()} Workshop`],
      ['machine_works', () => `${nextName()} Machine Works`],
    ];
    for (const [kind, name] of rest) {
      this._placeOne(kind, name(), 5);
    }

    // Three more towns (>=4 total with the chain town) and the one city.
    for (let i = 0; i < 3; i++) {
      this._placeOne('town', nextName(), 6);
    }
    this._placeOne('city', nextName(), 8);

    // The port must sit on the river or a map edge (an export sink to "the
    // sea"). Fall back to a plain placement if no riverside spot is free.
    if (!this._placeOne('port', `${nextName()} Harbour`, 4, { onRiverOrEdge: true })) {
      this._placeOne('port', `${nextName()} Harbour`, 4);
    }
  }

  // --- Connectivity ------------------------------------------------
  // Flood-fills the map treating plain/forest/hill as freely walkable and
  // water/mountain as crossable only in spans of at most 2 tiles (i.e.
  // bridgeable/tunnellable) - the max span carve() will accept as
  // "connected enough" without touching the map further.
  _computeComponents() {
    const n = this.tiles.length;
    const compId = new Array(n).fill(-1);
    let comp = 0;
    for (let start = 0; start < n; start++) {
      if (compId[start] !== -1) continue;
      compId[start] = comp;
      const queue = [{ idx: start, budget: 2 }];
      while (queue.length) {
        const { idx, budget } = queue.shift();
        for (const { idx: nIdx } of neighbours(idx)) {
          if (compId[nIdx] !== -1) continue;
          const nType = this.tiles[nIdx].type;
          const obstacle = nType === 'mountain' || nType === 'water';
          const nBudget = obstacle ? budget - 1 : 2;
          if (nBudget < 0) continue;
          compId[nIdx] = comp;
          queue.push({ idx: nIdx, budget: nBudget });
        }
      }
      comp++;
    }
    return compId;
  }

  // Returns { ok, unreachable: [siteId...] }. With opts.carve it will carve
  // terrain (bounded iterations) until every site is mutually reachable.
  verifyConnectivity(opts = {}) {
    const maxIterations = 40;
    let result = this._checkOnce();
    if (!opts.carve) return result;

    let iterations = 0;
    while (!result.ok && iterations < maxIterations) {
      this._carveTowardMainComponent(result);
      result = this._checkOnce();
      iterations++;
    }
    return result;
  }

  _checkOnce() {
    const compId = this._computeComponents();
    // A site's component is whichever of its 4 footprint tiles resolves
    // first - they're always mutually adjacent so they share a component.
    const siteComp = new Map();
    for (const site of this.sites) {
      siteComp.set(site.id, compId[toIdx(site.x, site.y)]);
    }
    const counts = new Map();
    for (const c of siteComp.values()) counts.set(c, (counts.get(c) ?? 0) + 1);
    let mainComp = null;
    let mainCount = -1;
    for (const [c, count] of counts) {
      if (count > mainCount) {
        mainCount = count;
        mainComp = c;
      }
    }
    const unreachable = [];
    for (const [siteId, c] of siteComp) {
      if (c !== mainComp) unreachable.push(siteId);
    }
    return { ok: unreachable.length === 0, unreachable, _compId: compId, _mainComp: mainComp };
  }

  // Carves a straight corridor from one unreachable site to the nearest
  // site in the main component, flattening any tile that would otherwise
  // create an obstacle span wider than 2 in a row.
  _carveTowardMainComponent(result) {
    const { unreachable, _compId } = result;
    if (unreachable.length === 0) return;
    const fromSite = this._siteById.get(unreachable[0]) ?? this.sites.find((s) => s.id === unreachable[0]);
    if (!fromSite) return;

    let target = null;
    let bestDist = Infinity;
    for (const site of this.sites) {
      if (_compId[toIdx(site.x, site.y)] === result._mainComp) {
        const d = Math.abs(site.x - fromSite.x) + Math.abs(site.y - fromSite.y);
        if (d < bestDist) {
          bestDist = d;
          target = site;
        }
      }
    }
    if (!target) return;

    const line = bresenhamLine(fromSite.x, fromSite.y, target.x, target.y);
    let obstacleRun = 0;
    for (const { x, y } of line) {
      if (!inBounds(x, y)) continue;
      const tile = this.tiles[toIdx(x, y)];
      const obstacle = tile.type === 'mountain' || tile.type === 'water';
      if (obstacle) {
        obstacleRun++;
        if (obstacleRun > 2) {
          tile.type = 'plain';
          tile.elevation = 0;
          obstacleRun = 0;
        }
      } else {
        obstacleRun = 0;
      }
    }
  }

  // --- Clock ------------------------------------------------------
  // dt is game seconds (already speed-multiplied). Emits `day:ended` once
  // per day rollover, even if dt spans multiple days.
  update(dt) {
    if (!(dt > 0)) return;
    this.clock.timeOfDay += dt / DAY_SECONDS;
    let guard = 0;
    while (this.clock.timeOfDay >= 1 && guard < 10000) {
      this.clock.timeOfDay -= 1;
      this.clock.day += 1;
      this.clock.season = Math.floor((this.clock.day - 1) / 30) % 4;
      this.bus?.emit('day:ended', { day: this.clock.day });
      guard++;
    }
  }

  // --- Queries ------------------------------------------------------
  tileAt(x, y) {
    return inBounds(x, y) ? this.tiles[toIdx(x, y)] : null;
  }

  tileAtIdx(idx) {
    return this.tiles[idx] ?? null;
  }

  elevationAt(idx) {
    return this.tiles[idx]?.elevation ?? 0;
  }

  terrainFactor(idx) {
    const tile = this.tiles[idx];
    return tile ? TERRAIN_FACTOR[tile.type] ?? 1 : 1;
  }

  // Buildable = a real tile that hasn't been blocked by a disaster. Every
  // terrain type can carry track (mountain/water just route through
  // TUNNEL_COST/BRIDGE_COST instead of TRACK_COST - network.js's call).
  isBuildable(idx) {
    const tile = this.tiles[idx];
    return !!tile && !tile.blocked;
  }

  siteAt(idx) {
    const tile = this.tiles[idx];
    if (!tile || !tile.siteId) return null;
    return this.getSite(tile.siteId);
  }

  getSite(id) {
    return this._siteById.get(id) ?? null;
  }

  sitesByKind(kind) {
    return this.sites.filter((s) => s.kind === kind);
  }

  // --- Save / load ---------------------------------------------------
  serialize() {
    return {
      seed: this.seed,
      clock: { ...this.clock },
      tiles: this.tiles.map((t) => ({ ...t })),
      sites: this.sites.map((s) => ({
        ...s,
        produces: s.produces.map((p) => ({ ...p })),
        consumes: s.consumes.map((c) => ({ ...c })),
        stock: { ...s.stock },
        demand: { ...s.demand },
      })),
    };
  }

  static deserialize(data, bus) {
    const world = new World(data.seed, bus, { skipGeneration: true });
    world.clock = { ...data.clock };
    world.tiles = data.tiles.map((t) => ({ ...t }));
    world.sites = data.sites.map((s) => ({
      ...s,
      produces: s.produces.map((p) => ({ ...p })),
      consumes: s.consumes.map((c) => ({ ...c })),
      stock: { ...s.stock },
      demand: { ...s.demand },
    }));
    world._siteById = new Map(world.sites.map((s) => [s.id, s]));
    return world;
  }
}
