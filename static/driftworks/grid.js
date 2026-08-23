// The island: tile storage, procedural generation, erosion, and land
// reclamation. Grid never touches pixels/camera - that's render.js's job.
import { GRID_SIZE, createRng, tileKey, rand } from './utils.js';

const RESOURCE_KINDS = ['ore', 'crystal', 'organic'];

function makeTile(x, y) {
  return { x, y, type: 'water', resource: null, building: null, erosion: null };
}

export class Grid {
  constructor(size = GRID_SIZE) {
    this.size = size;
    this.tiles = [];
    for (let y = 0; y < size; y++) {
      const row = [];
      for (let x = 0; x < size; x++) row.push(makeTile(x, y));
      this.tiles.push(row);
    }
    // Erosion pacing - multiplied by tech buffs via setErosionBuffs().
    this.erosionIntervalMult = 1;
    this.erosionDurationMult = 1;
    // Initial grace period before the first tile is ever picked for erosion,
    // long enough for a new player to place their first few buildings before
    // land becomes a contested resource. Steady-state picks (see
    // tickErosion) are much faster, at rand(4, 8) once erosion is underway.
    this._erosionTimer = rand(45, 60);
    // targetKey -> progress (0..1), persists across ticks while a reclaimer
    // keeps requesting the same target tile.
    this.reclaimProgress = new Map();
  }

  // Applied by Simulation each tick from unlocked tech buffs.
  setErosionBuffs({ erosionIntervalMult = 1, erosionDurationMult = 1 } = {}) {
    this.erosionIntervalMult = erosionIntervalMult;
    this.erosionDurationMult = erosionDurationMult;
  }

  generateIsland(seed) {
    const rng = createRng(seed ?? Date.now());
    const cx = Math.floor(this.size / 2);
    const cy = Math.floor(this.size / 2);
    const baseRadius = 9;

    // A handful of random sine harmonics fake an organic, non-circular
    // coastline while keeping the blob roughly radius-9 and fully connected.
    const harmonics = [];
    for (let i = 0; i < 4; i++) {
      harmonics.push({ freq: i + 2, phase: rng() * Math.PI * 2, amp: 1.6 / (i + 1) });
    }
    const radiusAt = (angle) => {
      let r = baseRadius;
      for (const h of harmonics) r += Math.sin(angle * h.freq + h.phase) * h.amp;
      return r;
    };

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const jitter = (rng() - 0.5) * 1.2;
        const isLand = dist <= radiusAt(angle) + jitter;
        const tile = this.tiles[y][x];
        tile.type = isLand ? 'land' : 'water';
        tile.resource = null;
        tile.building = null;
        tile.erosion = null;
      }
    }

    this._scatterResources(rng);
  }

  _scatterResources(rng) {
    const landTiles = [];
    for (const row of this.tiles) {
      for (const tile of row) if (tile.type === 'land') landTiles.push(tile);
    }
    // Fisher-Yates shuffle so nodes land in scattered, non-clustered spots.
    for (let i = landTiles.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [landTiles[i], landTiles[j]] = [landTiles[j], landTiles[i]];
    }

    const targetNodes = Math.max(6, Math.round(landTiles.length * 0.12));
    for (let i = 0; i < targetNodes && i < landTiles.length; i++) {
      const kind = RESOURCE_KINDS[i % RESOURCE_KINDS.length];
      const richness = 1 + Math.floor(rng() * 3);
      landTiles[i].resource = { kind, richness };
    }
  }

  getTile(x, y) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return null;
    return this.tiles[y][x];
  }

  isLand(x, y) {
    const tile = this.getTile(x, y);
    return !!tile && tile.type === 'land';
  }

  setBuilding(x, y, building) {
    const tile = this.getTile(x, y);
    if (!tile) return false;
    tile.building = building;
    return true;
  }

  removeBuilding(x, y) {
    const tile = this.getTile(x, y);
    if (!tile || !tile.building) return null;
    const building = tile.building;
    tile.building = null;
    return building;
  }

  getEdgeTiles() {
    const edges = [];
    for (const row of this.tiles) {
      for (const tile of row) {
        if (tile.type !== 'land') continue;
        const north = this.getTile(tile.x, tile.y - 1);
        const south = this.getTile(tile.x, tile.y + 1);
        const east = this.getTile(tile.x + 1, tile.y);
        const west = this.getTile(tile.x - 1, tile.y);
        const isEdge = [north, south, east, west].some((n) => !n || n.type === 'water');
        if (isEdge) edges.push(tile);
      }
    }
    return edges;
  }

  // Picks a new eligible edge tile to start cracking every ~4-8s (scaled by
  // erosionIntervalMult), and advances any already-cracking tiles. Returns
  // the list of {x, y} tiles that finished collapsing into water this tick,
  // so the caller can drop their buildings from any external index.
  tickErosion(dt, isProtected) {
    const destroyed = [];

    for (const row of this.tiles) {
      for (const tile of row) {
        if (!tile.erosion) continue;
        tile.erosion.timer += dt;
        if (tile.erosion.timer >= tile.erosion.duration) {
          tile.type = 'water';
          tile.resource = null;
          tile.building = null;
          tile.erosion = null;
          destroyed.push({ x: tile.x, y: tile.y });
        }
      }
    }

    this._erosionTimer -= dt;
    if (this._erosionTimer <= 0) {
      this._erosionTimer = rand(4, 8) * this.erosionIntervalMult;
      const candidates = this.getEdgeTiles().filter(
        (tile) => !tile.erosion && !(isProtected && isProtected(tile.x, tile.y))
      );
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        pick.erosion = { cracking: true, timer: 0, duration: 5 * this.erosionDurationMult };
      }
    }

    return destroyed;
  }

  // activeReclaimers: [{x, y, targetX, targetY, rate}] gathered by Simulation
  // this tick from every Reclaimer's ctx.requestReclaim call. Progress per
  // target tile is owned here so it persists across ticks/reclaimer identity.
  tickReclamation(dt, activeReclaimers) {
    for (const req of activeReclaimers) {
      const key = tileKey(req.targetX, req.targetY);
      const progress = (this.reclaimProgress.get(key) || 0) + req.rate * dt;
      if (progress >= 1) {
        const tile = this.getTile(req.targetX, req.targetY);
        if (tile && tile.type === 'water') {
          tile.type = 'land';
          tile.resource = null;
          tile.erosion = null;
        }
        this.reclaimProgress.delete(key);
      } else {
        this.reclaimProgress.set(key, progress);
      }
    }
  }

  // Building instances (with live tick/draw functions) are NOT included -
  // Simulation captures {type,x,y,rotation} descriptors separately and
  // reconstructs them via buildings.js#createBuilding on load.
  serialize() {
    return {
      size: this.size,
      tiles: this.tiles.map((row) => row.map((tile) => ({
        x: tile.x,
        y: tile.y,
        type: tile.type,
        resource: tile.resource,
        erosion: tile.erosion,
      }))),
      erosionIntervalMult: this.erosionIntervalMult,
      erosionDurationMult: this.erosionDurationMult,
      reclaimProgress: Array.from(this.reclaimProgress.entries()),
    };
  }

  static deserialize(data) {
    const grid = new Grid(data.size);
    for (let y = 0; y < grid.size; y++) {
      for (let x = 0; x < grid.size; x++) {
        const saved = data.tiles[y][x];
        const tile = grid.tiles[y][x];
        tile.type = saved.type;
        tile.resource = saved.resource;
        tile.erosion = saved.erosion;
      }
    }
    grid.erosionIntervalMult = data.erosionIntervalMult ?? 1;
    grid.erosionDurationMult = data.erosionDurationMult ?? 1;
    grid.reclaimProgress = new Map(data.reclaimProgress || []);
    return grid;
  }
}
