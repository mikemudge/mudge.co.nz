// Orchestration: owns the Grid + Economy, places/removes buildings, and
// drives the per-tick simulation order that everything else plugs into.
import { Grid } from './grid.js';
import { Economy } from './economy.js';
import { tileKey } from './utils.js';
import { BUILDING_DEFS, createBuilding, reorientBuilding } from './buildings.js';

const SAVE_KEY = 'driftworks_save';
const BEST_KEY = 'driftworks_best';

// Progress-per-second a single Reclaimer contributes towards its target
// tile; grid.js owns the running total per target so this just needs to be
// a stable rate (~7s per tile reclaimed).
const RECLAIM_RATE = 0.15;

// Upstream-before-downstream so production made this tick can still flow
// all the way to a Dock/Silo in the same tick.
const TICK_ORDER = [
  'extractor', 'belt', 'splitter', 'merger', 'processor', 'assembler', 'silo', 'dock', 'seawall', 'reclaimer',
];

export class Simulation {
  constructor(seed) {
    this.grid = new Grid();
    this.grid.generateIsland(seed);
    this.economy = new Economy();
    // Starting kit: the contract's Economy begins with an empty stockpile,
    // which otherwise deadlocks the player permanently - every building
    // (including the extractor needed to produce anything at all) costs
    // stockpile items, and metal can only be made by a processor that
    // itself costs metal. 30 covers an extractor + dock (5 + 15 = 20) for
    // the raw-good quotas of waves 0-2, with 10 left over for belts, and
    // still comfortably covers extractor + belts + processor + dock
    // (5 + 1 + 1 + 8 + 15 = 30) once tier-1 quotas start at wave 3.
    this.economy.addToStockpile('metal', 30);
    this.economy.startNextQuota(0);
    this.buildings = new Map(); // key `${x},${y}` -> building instance
    this.gameOver = false;
    this.waveNumber = 0;
    this.time = 0;
    this._reclaimRequests = [];
  }

  placeBuilding(x, y, type, rotation = 0) {
    const def = BUILDING_DEFS[type];
    if (!def) return false;
    if (!this.grid.isLand(x, y)) return false;

    const tile = this.grid.getTile(x, y);
    if (!tile) return false;

    // Re-placing over an already-occupied tile: same type + same rotation
    // is a no-op (nothing would change), same type + different rotation is
    // a free in-place reorient (no cost, no tier/afford gate - it's just
    // pointing an already-built thing a different way). A different type
    // is only allowed to replace outright (no refund, same as the Remove
    // tool, once the new building's own tier/afford checks pass below) when
    // the existing occupant is a belt - belts are cheap enough that a
    // one-click overwrite is a convenience, not a trap. Anything more
    // valuable must be cleared with the Remove tool first.
    const existing = tile.building;
    if (existing && existing.type === type) {
      if (existing.rotation === rotation) return false;
      reorientBuilding(existing, rotation);
      return true;
    }
    if (existing && existing.type !== 'belt') return false;

    if (def.tier > this.economy.getMaxBuildingTier(type)) return false;
    if (!this.economy.canAfford(def.cost)) return false;

    if (existing) this.removeBuilding(x, y);

    this.economy.spend(def.cost);
    const building = createBuilding(type, x, y, rotation);
    this.grid.setBuilding(x, y, building);
    this.buildings.set(tileKey(x, y), building);
    return true;
  }

  removeBuilding(x, y) {
    const removed = this.grid.removeBuilding(x, y);
    if (!removed) return false;
    this.buildings.delete(tileKey(x, y));
    return true;
  }

  _makeCtx(building) {
    return {
      getNeighborTile: (dx, dy) => this.grid.getTile(building.x + dx, building.y + dy),
      getNeighborBuilding: (dx, dy) => {
        const tile = this.grid.getTile(building.x + dx, building.y + dy);
        return tile ? tile.building : null;
      },
      selfTile: this.grid.getTile(building.x, building.y),
      economy: this.economy,
      grid: this.grid,
      requestReclaim: (targetX, targetY) => {
        this._reclaimRequests.push({
          x: building.x, y: building.y, targetX, targetY, rate: RECLAIM_RATE,
        });
      },
    };
  }

  _isProtected(x, y) {
    for (const building of this.buildings.values()) {
      if (building.type !== 'seawall') continue;
      const dx = Math.abs(building.x - x);
      const dy = Math.abs(building.y - y);
      if (dx + dy <= 1) return true;
    }
    return false;
  }

  _hasLand() {
    for (const row of this.grid.tiles) {
      for (const tile of row) if (tile.type === 'land') return true;
    }
    return false;
  }

  tick(dt) {
    if (this.gameOver) return;
    this.time += dt;
    this._reclaimRequests = [];

    const buckets = new Map();
    for (const building of this.buildings.values()) {
      if (!buckets.has(building.type)) buckets.set(building.type, []);
      buckets.get(building.type).push(building);
    }
    for (const type of TICK_ORDER) {
      for (const building of buckets.get(type) || []) building.tick(dt, this._makeCtx(building));
    }
    for (const [type, list] of buckets) {
      if (TICK_ORDER.includes(type)) continue;
      for (const building of list) building.tick(dt, this._makeCtx(building));
    }

    this.economy.tick(dt);
    this.waveNumber = this.economy.waveNumber;

    this.grid.setErosionBuffs({
      erosionIntervalMult: this.economy.getBuff('erosionIntervalMult'),
      erosionDurationMult: this.economy.getBuff('erosionDurationMult'),
    });
    const destroyedTiles = this.grid.tickErosion(dt, (x, y) => this._isProtected(x, y));
    for (const { x, y } of destroyedTiles) this.buildings.delete(tileKey(x, y));

    this.grid.tickReclamation(dt, this._reclaimRequests);

    if (this.economy.strikes >= 3) this.gameOver = true;
    if (!this._hasLand()) this.gameOver = true;
  }

  getSnapshot() {
    return {
      tiles: this.grid.tiles,
      buildings: Array.from(this.buildings.values()),
      economy: {
        stockpile: this.economy.stockpile,
        techPoints: this.economy.techPoints,
        unlockedTech: this.economy.unlockedTech,
        currentQuota: this.economy.currentQuota,
        quotaTimer: this.economy.quotaTimer,
        quotasFulfilled: this.economy.quotasFulfilled,
        strikes: this.economy.strikes,
      },
      gameOver: this.gameOver,
      score: this.economy.quotasFulfilled,
      waveNumber: this.waveNumber,
    };
  }

  save() {
    const data = {
      grid: this.grid.serialize(),
      economy: this.economy.serialize(),
      buildings: Array.from(this.buildings.values()).map((b) => ({
        type: b.type, x: b.x, y: b.y, rotation: b.rotation,
      })),
      gameOver: this.gameOver,
      waveNumber: this.waveNumber,
      time: this.time,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      const best = Simulation.getBestScore();
      if (this.economy.quotasFulfilled > best) {
        localStorage.setItem(BEST_KEY, String(this.economy.quotasFulfilled));
      }
    } catch {
      // localStorage unavailable (private mode etc) - save just won't persist.
    }
  }

  static load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);

      const sim = Object.create(Simulation.prototype);
      sim.grid = Grid.deserialize(data.grid);
      sim.economy = Economy.deserialize(data.economy);
      sim.buildings = new Map();
      for (const desc of data.buildings || []) {
        const building = createBuilding(desc.type, desc.x, desc.y, desc.rotation);
        sim.grid.setBuilding(desc.x, desc.y, building);
        sim.buildings.set(tileKey(desc.x, desc.y), building);
      }
      sim.gameOver = data.gameOver || false;
      sim.waveNumber = data.waveNumber || 0;
      sim.time = data.time || 0;
      sim._reclaimRequests = [];
      return sim;
    } catch {
      return null;
    }
  }

  static getBestScore() {
    try {
      return parseInt(localStorage.getItem(BEST_KEY), 10) || 0;
    } catch {
      return 0;
    }
  }
}
