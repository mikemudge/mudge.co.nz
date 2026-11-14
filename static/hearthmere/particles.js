/**
 * Hearthmere — decorative particles: chimney smoke, forge sparks, quarry and
 * construction dust, coin/food pops, tower arrows, blood, snow, rain, lake
 * birds, hearth motes and destruction rubble.
 *
 * Hard rule (§2): this module NEVER mutates simulation state and nothing in
 * the simulation may depend on it existing. It listens to the frozen §11
 * events and reads world/building state; it writes nothing back.
 *
 * Everything is pooled through `utils.Pool` — one particle shape with a `kind`
 * discriminator, so a frame allocates nothing. The live count is hard-capped;
 * over the cap, ambient effects simply stop spawning and urgent ones (combat,
 * destruction) recycle a long-lived particle, so a big raid costs frame time
 * that is bounded rather than a collapsing frame rate.
 *
 * Two draw layers, because depth matters in iso: `drawGround(ctx)` is dust,
 * blood and scorch at ground level (render.js draws it BEFORE buildings and
 * villagers) and `drawOverhead(ctx)` is smoke, sparks, arrows, pops, weather
 * and birds (AFTER them).
 *
 * No DOM at module scope (§18).
 */

import {
  GRID_W, GRID_H, TILE_W, TILE_H, TERRAIN, ITEMS, BUILDING_BY_ID,
} from './constants.js';
import { isoX, isoY, unIsoX, unIsoY, Pool, rgba } from './utils.js';

const HW = TILE_W / 2;
const HH = TILE_H / 2;

// Particle kinds.
const K_SMOKE = 0;
const K_SPARK = 1;
const K_DUST = 2;
const K_POP = 3;
const K_ARROW = 4;
const K_BLOOD = 5;
const K_SNOW = 6;
const K_BIRD = 7;
const K_MOTE = 8;
const K_RUBBLE = 9;
const K_RAIN = 10;
const K_SPLAT = 11;

const LAYER_GROUND = 0;
const LAYER_OVER = 1;

const MAX_PARTICLES = 1400;
const GRAVITY = 260;            // world px/sec^2 for ballistic bits
const WEATHER_BUDGET = 0.5;     // share of the cap snow/rain may occupy

// Ambient emitter classes, derived from the building def id.
const E_NONE = 0;
const E_CHIMNEY = 1;
const E_FORGE = 2;
const E_QUARRY = 3;
const E_BUILD = 4;

const CHIMNEY_IDS = {
  cottage: 1, house: 1, townhouse: 1, manor: 1, town_centre: 1,
  bakery: 1, brewery: 1, smokehouse: 1, tavern: 1, cheesemaker: 1,
  kiln: 1, charcoal_burner: 1, bloomery: 1, foundry: 1,
};
const FORGE_IDS = {
  blacksmith: 1, weaponsmith: 1, armourer: 1, plate_armoury: 1,
  foundry: 1, bloomery: 1, kiln: 1,
};
const QUARRY_IDS = { quarry: 1, iron_mine: 1, clay_pit: 1 };
const HEARTH_IDS = { cottage: 1, house: 1, townhouse: 1, manor: 1, tavern: 1, chapel: 1 };

const SMOKE_COLS = ['#b9b4ab', '#a7a29a', '#918d86', '#cfcac1'];
const SPARK_COLS = ['#ffd27a', '#ff9a3c', '#ffe9b0'];
const DUST_COLS = ['#c9bda2', '#b6a98d', '#d8cfb8'];
const BLOOD_COLS = ['#8e2f2a', '#6f2320', '#a33a30'];
const RUBBLE_COLS = ['#8a8279', '#6f675f', '#a2988a', '#5c5550'];
const SNOW_COL = '#f2f6fb';
const RAIN_COL = '#9fb6c6';
const BIRD_COL = '#4a4a4f';
const MOTE_COL = '#ffcf8a';
const ARROW_COL = '#4a3b28';

function newParticle() {
  return {
    kind: 0, layer: 1, prio: 0,
    x: 0, y: 0, z: 0,          // float tile coords + height in world px
    vx: 0, vy: 0, vz: 0,
    ax: 0, ay: 0, az: 0,
    age: 0, life: 1,
    size: 1, grow: 0,
    rot: 0, spin: 0,
    drag: 0, alpha: 1, fade: 1,
    col: '#ffffff',
    // arrow flight
    sx: 0, sy: 0, ex: 0, ey: 0, arc: 0,
    seed: 0, wob: 0,
  };
}

export function createParticles(game) {
  return new Particles(game);
}

class Particles {
  constructor(game) {
    this.game = game;
    this.pool = Pool(newParticle);
    this.cap = MAX_PARTICLES;
    this.enabled = true;

    // Ambient emitters, rebuilt from the building list on building events.
    this._emitters = [];
    this._emitterCount = 0;
    this._lastBuildingCount = -1;
    this._rescan = true;

    // Soft radial sprites, built lazily on first draw (never at module scope)
    // and cached per colour: a gouache plume needs a soft edge, and a
    // per-particle radial gradient would allocate every frame.
    this._sprites = new Map();

    this._birdSpots = [];
    this._birdTimer = 0;
    this._weatherTimer = 0;
    this._evictCursor = 0;
    this._unsubs = [];

    // Per-draw screen mapping, recomputed once per layer draw.
    this._s = 1;
    this._ox = 0;
    this._oy = 0;
    this._cx0 = 0;
    this._cy0 = 0;
    this._cx1 = 0;
    this._cy1 = 0;
    this._renderer = null;
    /** 'screen' (default): drawGround/drawOverhead apply the camera themselves. */
    this.space = 'screen';
  }

  get count() {
    return this.pool.live.length;
  }

  /* ------------------------------------------------------------------ *
   * Lifecycle
   * ------------------------------------------------------------------ */

  init() {
    const bus = this.game.bus;
    this.clear();
    this._findBirdSpots();
    this._rescan = true;
    if (!bus || typeof bus.on !== 'function') return;

    const on = (name, fn) => { this._unsubs.push(bus.on(name, fn)); };
    on('task:completed', (p) => this.pop(p && p.x, p && p.y, p && p.item, p && p.qty));
    on('building:produced', (p) => this.produced(p));
    on('building:placed', () => { this._rescan = true; });
    on('building:completed', (p) => { this._rescan = true; this.buildPuff(p); });
    on('building:damaged', (p) => this.damage(p));
    on('building:destroyed', (p) => { this._rescan = true; this.destroyBurst(p); });
    on('combat:hit', (p) => this.hit(p && p.x, p && p.y, p && p.kind));
    on('enemy:killed', (p) => this.kill(p && p.x, p && p.y));
    on('villager:died', (p) => this.kill(p && p.x, p && p.y));
    on('season:changed', () => { this._findBirdSpots(); });
  }

  /** Unsubscribes and drops every live particle. */
  destroy() {
    for (let i = 0; i < this._unsubs.length; i++) {
      const fn = this._unsubs[i];
      if (typeof fn === 'function') fn();
    }
    this._unsubs.length = 0;
    this.clear();
  }

  clear() {
    this.pool.releaseAll();
  }

  // Pure decoration: nothing here belongs in a save (§14).
  serialize() {
    return {};
  }

  restore() {
    this.clear();
  }

  /* ------------------------------------------------------------------ *
   * Spawning
   * ------------------------------------------------------------------ */

  /**
   * Gets a particle, respecting the hard cap. `prio` 0 = ambient (dropped at
   * the cap), 1 = urgent (recycles an existing long-lived particle).
   */
  _get(prio) {
    const live = this.pool.live;
    if (live.length < this.cap) return this.pool.get();
    if (prio <= 0) return null;
    return this._evict();
  }

  /**
   * O(1)-ish eviction: sample a few particles from a rotating cursor and reuse
   * the least important / most nearly dead of them. Scanning all of them for
   * the true oldest would be O(n) per spawn during exactly the burst we are
   * trying to survive.
   */
  _evict() {
    const live = this.pool.live;
    const n = live.length;
    if (n === 0) return null;
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 8; i++) {
      const p = live[(this._evictCursor + i) % n];
      const score = p.age / p.life - (p.prio > 0 ? 1 : 0);
      if (score > bestScore) { bestScore = score; best = p; }
    }
    this._evictCursor = (this._evictCursor + 8) % n;
    return best;
  }

  _release(p) {
    this.pool.release(p);
  }

  /* ------------------------------------------------------------------ *
   * Public effect API (render.js/military.js may call these directly)
   * ------------------------------------------------------------------ */

  /** Chimney/kiln smoke plume at a float tile position. Returns the particle. */
  smoke(x, y, scale, prio) {
    const p = this._get(prio || 0);
    if (!p) return null;
    p.kind = K_SMOKE;
    p.layer = LAYER_OVER;
    p.prio = prio || 0;
    p.x = x + (Math.random() - 0.5) * 0.18;
    p.y = y + (Math.random() - 0.5) * 0.18;
    p.z = 14 + Math.random() * 4;
    p.vx = (Math.random() - 0.5) * 0.06;
    p.vy = (Math.random() - 0.5) * 0.06;
    p.vz = 16 + Math.random() * 12;
    p.ax = 0; p.ay = 0; p.az = 0;
    p.age = 0;
    p.life = 2.4 + Math.random() * 1.8;
    p.size = (2.4 + Math.random() * 1.8) * (scale || 1);
    p.grow = 3.2 * (scale || 1);
    p.drag = 0;
    p.alpha = 0.62;
    p.fade = 1;
    p.rot = 0; p.spin = 0;
    p.col = SMOKE_COLS[(Math.random() * SMOKE_COLS.length) | 0];
    p.wob = Math.random() * 6.283;
    return p;
  }

  /** Forge sparks — short, bright, ballistic. */
  spark(x, y, n, prio) {
    const count = n || 6;
    for (let i = 0; i < count; i++) {
      const p = this._get(prio || 0);
      if (!p) return;
      const a = Math.random() * 6.283;
      p.kind = K_SPARK;
      p.layer = LAYER_OVER;
      p.prio = prio || 0;
      p.x = x; p.y = y;
      p.z = 12 + Math.random() * 6;
      p.vx = Math.cos(a) * 0.25;
      p.vy = Math.sin(a) * 0.25;
      p.vz = 40 + Math.random() * 70;
      p.az = -GRAVITY;
      p.ax = 0; p.ay = 0;
      p.age = 0;
      p.life = 0.45 + Math.random() * 0.5;
      p.size = 1.2 + Math.random() * 1.1;
      p.grow = -0.6;
      p.drag = 1.4;
      p.alpha = 1;
      p.fade = 1;
      p.rot = 0; p.spin = 0;
      p.col = SPARK_COLS[(Math.random() * SPARK_COLS.length) | 0];
    }
  }

  /** Ground dust — quarries, construction, impacts. */
  dust(x, y, n, spread, prio) {
    const count = n || 3;
    const sp = spread === undefined ? 0.35 : spread;
    for (let i = 0; i < count; i++) {
      const p = this._get(prio || 0);
      if (!p) return;
      const a = Math.random() * 6.283;
      const r = Math.random() * sp;
      p.kind = K_DUST;
      p.layer = LAYER_GROUND;
      p.prio = prio || 0;
      p.x = x + Math.cos(a) * r;
      p.y = y + Math.sin(a) * r;
      p.z = 1 + Math.random() * 4;
      p.vx = Math.cos(a) * 0.12;
      p.vy = Math.sin(a) * 0.12;
      p.vz = 5 + Math.random() * 9;
      p.ax = 0; p.ay = 0; p.az = -18;
      p.age = 0;
      p.life = 0.9 + Math.random() * 0.9;
      p.size = 2.5 + Math.random() * 3;
      p.grow = 3.4;
      p.drag = 1.6;
      p.alpha = 0.36;
      p.fade = 1;
      p.rot = 0; p.spin = 0;
      p.col = DUST_COLS[(Math.random() * DUST_COLS.length) | 0];
    }
  }

  /** Coin / food pop on a completed haul (§11 `task:completed`). */
  pop(x, y, item, qty) {
    if (typeof x !== 'number' || typeof y !== 'number') return;
    const info = item ? ITEMS[item] : null;
    const col = info && info.colour ? info.colour : '#d4a72c';
    const n = qty > 6 ? 3 : qty > 2 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const p = this._get(1);
      if (!p) return;
      p.kind = K_POP;
      p.layer = LAYER_OVER;
      p.prio = 1;
      p.x = x + 0.5 + (Math.random() - 0.5) * 0.3;
      p.y = y + 0.5 + (Math.random() - 0.5) * 0.3;
      p.z = 16 + i * 5;
      p.vx = 0; p.vy = 0;
      p.vz = 26 + Math.random() * 10;
      p.ax = 0; p.ay = 0; p.az = -26;
      p.age = 0;
      p.life = 1.0 + Math.random() * 0.3;
      p.size = 2.6;
      p.grow = 0;
      p.drag = 0;
      p.alpha = 1;
      p.fade = 1;
      p.rot = 0; p.spin = 0;
      p.col = col;
    }
  }

  /** An arrow in flight. `military.js` calls this when a tower/crossbow shoots. */
  arrow(fx, fy, tx, ty) {
    const p = this._get(1);
    if (!p) return;
    const d = Math.hypot(tx - fx, ty - fy);
    p.kind = K_ARROW;
    p.layer = LAYER_OVER;
    p.prio = 1;
    p.sx = fx; p.sy = fy;
    p.ex = tx; p.ey = ty;
    p.x = fx; p.y = fy;
    p.z = 20;
    p.arc = 16 + d * 5;
    p.age = 0;
    p.life = Math.max(0.18, d / 14);
    p.size = 1.4;
    p.alpha = 1;
    p.fade = 0;
    p.col = ARROW_COL;
    p.vx = 0; p.vy = 0; p.vz = 0;
    p.ax = 0; p.ay = 0; p.az = 0;
    p.drag = 0; p.grow = 0; p.rot = 0; p.spin = 0;
  }

  /** Blood / impact spray at a tile position (§11 `combat:hit`). */
  hit(x, y, kind) {
    if (typeof x !== 'number') return;
    const n = kind === 'arrow' ? 4 : 7;
    for (let i = 0; i < n; i++) {
      const p = this._get(1);
      if (!p) return;
      const a = Math.random() * 6.283;
      p.kind = K_BLOOD;
      p.layer = LAYER_OVER;
      p.prio = 1;
      p.x = x + 0.5;
      p.y = y + 0.5;
      p.z = 8 + Math.random() * 8;
      p.vx = Math.cos(a) * (0.3 + Math.random() * 0.5);
      p.vy = Math.sin(a) * (0.3 + Math.random() * 0.5);
      p.vz = 20 + Math.random() * 50;
      p.ax = 0; p.ay = 0; p.az = -GRAVITY;
      p.age = 0;
      p.life = 0.45 + Math.random() * 0.35;
      p.size = 1.2 + Math.random() * 1.1;
      p.grow = 0;
      p.drag = 1.1;
      p.alpha = 0.95;
      p.fade = 1;
      p.rot = 0; p.spin = 0;
      p.col = BLOOD_COLS[(Math.random() * BLOOD_COLS.length) | 0];
    }
    this._splat(x + 0.5, y + 0.5, 3 + Math.random() * 2);
  }

  /** A death: a wider spray plus a lasting ground stain. */
  kill(x, y) {
    if (typeof x !== 'number') return;
    this.hit(x, y, 'kill');
    this._splat(x + 0.5, y + 0.5, 6 + Math.random() * 3);
    this.dust(x + 0.5, y + 0.5, 3, 0.4, 1);
  }

  _splat(x, y, size) {
    const p = this._get(1);
    if (!p) return;
    p.kind = K_SPLAT;
    p.layer = LAYER_GROUND;
    p.prio = 1;
    p.x = x; p.y = y;
    p.z = 0;
    p.vx = 0; p.vy = 0; p.vz = 0;
    p.ax = 0; p.ay = 0; p.az = 0;
    p.age = 0;
    p.life = 8;
    p.size = size;
    p.grow = 0;
    p.drag = 0;
    p.alpha = 0.5;
    p.fade = 1;
    p.rot = Math.random() * 6.283;
    p.spin = 0;
    p.col = BLOOD_COLS[0];
    p.seed = (Math.random() * 65535) | 0;
  }

  /** Rubble burst when a building falls (§11 `building:destroyed`). */
  destroyBurst(ev) {
    if (!ev || typeof ev.x !== 'number') return;
    const def = BUILDING_BY_ID[ev.defId];
    const w = def ? def.w || 1 : 1;
    const h = def ? def.h || 1 : 1;
    const cx = ev.x + w * 0.5;
    const cy = ev.y + h * 0.5;
    const chunks = 22 + w * h * 4;
    for (let i = 0; i < chunks; i++) {
      const p = this._get(1);
      if (!p) break;
      const a = Math.random() * 6.283;
      const sp = 0.4 + Math.random() * 1.2;
      p.kind = K_RUBBLE;
      p.layer = LAYER_OVER;
      p.prio = 1;
      p.x = cx + (Math.random() - 0.5) * w * 0.7;
      p.y = cy + (Math.random() - 0.5) * h * 0.7;
      p.z = 8 + Math.random() * 24;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.vz = 70 + Math.random() * 150;
      p.ax = 0; p.ay = 0; p.az = -GRAVITY;
      p.age = 0;
      p.life = 1.3 + Math.random() * 1.1;
      p.size = 2.4 + Math.random() * 4.2;
      p.grow = 0;
      p.drag = 0.6;
      p.alpha = 1;
      p.fade = 1;
      p.rot = Math.random() * 6.283;
      p.spin = (Math.random() - 0.5) * 9;
      p.col = def && def.palette ? (i % 3 === 0 ? def.palette.roof : i % 3 === 1 ? def.palette.wall : def.palette.trim)
        : RUBBLE_COLS[(Math.random() * RUBBLE_COLS.length) | 0];
    }
    // A collapsing building throws a dust ring outward at ground level, then
    // a dark column above it — the ring is what reads as "it fell".
    for (let i = 0; i < 22; i++) {
      const p = this._get(1);
      if (!p) break;
      const a = (i / 22) * 6.283 + Math.random() * 0.3;
      const sp = 0.7 + Math.random() * 0.8;
      p.kind = K_DUST;
      p.layer = LAYER_GROUND;
      p.prio = 1;
      p.x = cx + Math.cos(a) * 0.3;
      p.y = cy + Math.sin(a) * 0.3;
      p.z = 2 + Math.random() * 6;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.vz = 8 + Math.random() * 10;
      p.ax = 0; p.ay = 0; p.az = -14;
      p.age = 0;
      p.life = 1.6 + Math.random() * 1.0;
      p.size = 5 + Math.random() * 5;
      p.grow = 9;
      p.drag = 1.5;
      p.alpha = 0.5;
      p.fade = 1;
      p.rot = 0; p.spin = 0;
      p.col = DUST_COLS[(Math.random() * DUST_COLS.length) | 0];
    }
    for (let i = 0; i < 14; i++) {
      const q = this.smoke(cx + (Math.random() - 0.5) * w * 0.5,
        cy + (Math.random() - 0.5) * h * 0.5, 2.6, 1);
      if (!q) break;
      q.col = i % 2 === 0 ? '#5d564f' : '#7a736a';
      q.vz = 26 + Math.random() * 22;
      q.alpha = 0.55;
    }
  }

  damage(ev) {
    if (!ev || typeof ev.x !== 'number') return;
    this.dust(ev.x + 0.5, ev.y + 0.5, 2, 0.4, 0);
    const p = this._get(0);
    if (!p) return;
    p.kind = K_RUBBLE;
    p.layer = LAYER_OVER;
    p.prio = 0;
    p.x = ev.x + 0.5; p.y = ev.y + 0.5;
    p.z = 12;
    const a = Math.random() * 6.283;
    p.vx = Math.cos(a) * 0.4;
    p.vy = Math.sin(a) * 0.4;
    p.vz = 50 + Math.random() * 40;
    p.ax = 0; p.ay = 0; p.az = -GRAVITY;
    p.age = 0;
    p.life = 0.8;
    p.size = 1.4;
    p.grow = 0;
    p.drag = 0.6;
    p.alpha = 1;
    p.fade = 1;
    p.rot = Math.random() * 6.283;
    p.spin = 6;
    p.col = RUBBLE_COLS[(Math.random() * RUBBLE_COLS.length) | 0];
  }

  buildPuff(ev) {
    if (!ev) return;
    const b = this._buildingById(ev.id);
    if (!b) return;
    this.dust(b.x + (b.w || 1) * 0.5, b.y + (b.h || 1) * 0.5, 10, (b.w || 1) * 0.5, 1);
  }

  produced(ev) {
    if (!ev || typeof ev.x !== 'number') return;
    this.pop(ev.x, ev.y, ev.item, ev.qty);
  }

  /* ------------------------------------------------------------------ *
   * Update
   * ------------------------------------------------------------------ */

  update(dt, game) {
    if (game) this.game = game;
    if (!this.enabled || !(dt > 0)) return;
    if (dt > 0.25) dt = 0.25;

    const live = this.pool.live;
    // Backwards: releasing swaps the tail into the hole, and the tail has
    // already been stepped this frame.
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.age += dt;
      if (p.age >= p.life) { this._release(p); continue; }

      if (p.kind === K_ARROW) {
        const t = p.age / p.life;
        p.x = p.sx + (p.ex - p.sx) * t;
        p.y = p.sy + (p.ey - p.sy) * t;
        p.z = 12 + p.arc * 4 * t * (1 - t);
        continue;
      }
      if (p.kind === K_SPLAT) continue;

      if (p.drag > 0) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      p.vz += p.az * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.size += p.grow * dt;
      p.rot += p.spin * dt;
      if (p.size < 0.2) p.size = 0.2;

      if (p.z < 0) {
        if (p.kind === K_SNOW || p.kind === K_RAIN || p.kind === K_BLOOD || p.kind === K_RUBBLE) {
          // Land rather than sink: blood stains, rubble settles, weather dies.
          if (p.kind === K_BLOOD && p.age < p.life * 0.9) this._splat(p.x, p.y, 1.6 + Math.random());
          this._release(p);
          continue;
        }
        p.z = 0;
        p.vz = 0;
      }
    }

    this._updateEmitters(dt);
    this._updateWeather(dt);
    this._updateBirds(dt);
  }

  /* ------------------------------------------------------------------ *
   * Ambient sources
   * ------------------------------------------------------------------ */

  _buildingList() {
    const b = this.game.buildings;
    if (!b) return null;
    if (Array.isArray(b.list)) return b.list;
    if (Array.isArray(b.all)) return b.all;
    if (Array.isArray(b.buildings)) return b.buildings;
    return null;
  }

  _buildingById(id) {
    const b = this.game.buildings;
    if (b && typeof b.byId === 'function') return b.byId(id);
    const list = this._buildingList();
    if (!list) return null;
    for (let i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }

  /** Rebuilds the emitter table, reusing the records so a rescan allocates nothing. */
  _rebuildEmitters() {
    const list = this._buildingList();
    this._emitterCount = 0;
    this._lastBuildingCount = list ? list.length : -1;
    this._rescan = false;
    if (!list) return;
    const arr = this._emitters;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b || b.removed) continue;
      const def = BUILDING_BY_ID[b.defId];
      if (!def || def.instance === false) continue;
      let kind = E_NONE;
      if (!b.built) kind = E_BUILD;
      else if (FORGE_IDS[b.defId]) kind = E_FORGE;
      else if (QUARRY_IDS[b.defId]) kind = E_QUARRY;
      else if (CHIMNEY_IDS[b.defId]) kind = E_CHIMNEY;
      if (kind === E_NONE && !HEARTH_IDS[b.defId]) continue;

      const n = this._emitterCount;
      let rec = arr[n];
      if (!rec) { rec = { b: null, kind: 0, x: 0, y: 0, t: 0, t2: 0 }; arr[n] = rec; }
      rec.b = b;
      rec.kind = kind;
      rec.x = b.x + (def.w || 1) * 0.5;
      rec.y = b.y + (def.h || 1) * 0.5;
      this._emitterCount = n + 1;
    }
  }

  _updateEmitters(dt) {
    const list = this._buildingList();
    if (this._rescan || (list && list.length !== this._lastBuildingCount)) this._rebuildEmitters();

    const world = this.game.world;
    const clock = world && world.clock;
    const tod = clock ? clock.timeOfDay : 0.5;
    const night = tod > 0.80 || tod < 0.25;
    const arr = this._emitters;

    for (let i = 0; i < this._emitterCount; i++) {
      const e = arr[i];
      const b = e.b;
      if (!b) continue;
      e.t += dt;

      if (e.kind === E_BUILD) {
        if (b.built) { this._rescan = true; continue; }
        if (e.t > 0.5) { e.t = 0; this.dust(e.x, e.y, 2, 0.5, 0); }
        continue;
      }

      const working = b.built && b.active !== false && !b.idleReason;
      if (e.kind === E_FORGE) {
        if (working && e.t > 0.38) { e.t = 0; this.spark(e.x, e.y, 6, 0); }
      } else if (e.kind === E_QUARRY) {
        if (working && e.t > 0.55) { e.t = 0; this.dust(e.x, e.y, 3, 0.7, 0); }
      } else if (e.kind === E_CHIMNEY) {
        // Workshops smoke while they work; homes smoke at night and in Winter.
        const home = HEARTH_IDS[b.defId] === 1;
        const puff = home ? (night || (clock && clock.season === 3)) : working;
        if (puff && e.t > 0.34) { e.t = 0; this.smoke(e.x, e.y, home ? 0.85 : 1.25, 0); }
      }

      if (night && HEARTH_IDS[b.defId] === 1) {
        e.t2 += dt;
        if (e.t2 > 0.55) { e.t2 = 0; this._mote(e.x, e.y); }
      }
    }
  }

  _mote(x, y) {
    const p = this._get(0);
    if (!p) return;
    p.kind = K_MOTE;
    p.layer = LAYER_OVER;
    p.prio = 0;
    p.x = x + (Math.random() - 0.5) * 0.8;
    p.y = y + (Math.random() - 0.5) * 0.8;
    p.z = 4 + Math.random() * 10;
    p.vx = (Math.random() - 0.5) * 0.05;
    p.vy = (Math.random() - 0.5) * 0.05;
    p.vz = 5 + Math.random() * 6;
    p.ax = 0; p.ay = 0; p.az = 0;
    p.age = 0;
    p.life = 1.6 + Math.random() * 1.4;
    p.size = 1.3 + Math.random() * 0.9;
    p.grow = 0;
    p.drag = 0;
    p.alpha = 0.9;
    p.fade = 1;
    p.rot = 0; p.spin = 0;
    p.col = MOTE_COL;
    p.wob = Math.random() * 6.283;
  }

  /* ------------------------------------------------------------------ *
   * Weather and birds
   * ------------------------------------------------------------------ */

  _updateWeather(dt) {
    const world = this.game.world;
    const input = this.game.input;
    if (!world || !world.weather || !input) return;
    const snow = world.weather.snow || 0;
    const rain = world.weather.rain || 0;
    if (snow <= 0 && rain <= 0) return;

    this._weatherTimer += dt;
    const step = 0.05;
    if (this._weatherTimer < step) return;
    this._weatherTimer = 0;
    // Weather is allowed at most half the budget: a Winter raid must still
    // have room for blood, rubble and arrows.
    if (this.pool.live.length > this.cap * WEATHER_BUDGET) return;

    const n = Math.round((snow * 5 + rain * 6));
    for (let i = 0; i < n; i++) {
      const isSnow = snow > 0 && (rain <= 0 || Math.random() < snow / (snow + rain));
      this._weatherDrop(isSnow, input);
    }
  }

  /** Spawns one flake/drop at a random point above the visible world rect. */
  _weatherDrop(isSnow, input) {
    const p = this._get(0);
    if (!p) return;
    const cam = input.cam;
    const vw = input.viewW || 1200;
    const vh = input.viewH || 800;
    const halfW = vw * 0.5 / cam.zoom;
    const halfH = vh * 0.5 / cam.zoom;
    const wx = cam.x + (Math.random() * 2 - 1) * halfW * 1.1;
    const wy = cam.y + (Math.random() * 2 - 1) * halfH * 1.1;
    p.x = unIsoX(wx, wy);
    p.y = unIsoY(wx, wy);
    p.layer = LAYER_OVER;
    p.prio = 0;
    p.z = halfH + 40;
    p.ax = 0; p.ay = 0; p.az = 0;
    p.age = 0;
    p.rot = 0; p.spin = 0;
    p.grow = 0;
    p.drag = 0;
    if (isSnow) {
      p.kind = K_SNOW;
      p.vx = (Math.random() - 0.5) * 0.12;
      p.vy = (Math.random() - 0.5) * 0.12;
      p.vz = -(28 + Math.random() * 26);
      p.life = (p.z / 40) + 1;
      p.size = 1.4 + Math.random() * 1.8;
      p.alpha = 0.7 + Math.random() * 0.3;
      p.col = SNOW_COL;
      p.wob = Math.random() * 6.283;
    } else {
      p.kind = K_RAIN;
      p.vx = 0.05;
      p.vy = 0.05;
      p.vz = -(200 + Math.random() * 80);
      p.life = (p.z / 200) + 0.4;
      p.size = 5 + Math.random() * 4;
      p.alpha = 0.3;
      p.col = RAIN_COL;
    }
    p.fade = 0;
  }

  /** Caches a handful of open-water tiles so the birds have somewhere to be. */
  _findBirdSpots() {
    this._birdSpots.length = 0;
    const world = this.game.world;
    const terrain = world && world.terrain;
    if (!terrain) return;
    for (let y = 2; y < GRID_H - 2 && this._birdSpots.length < 8; y += 3) {
      for (let x = 2; x < GRID_W - 2 && this._birdSpots.length < 8; x += 3) {
        if (terrain[y * GRID_W + x] === TERRAIN.WATER) this._birdSpots.push(y * GRID_W + x);
      }
    }
  }

  _updateBirds(dt) {
    if (this._birdSpots.length === 0) return;
    this._birdTimer -= dt;
    if (this._birdTimer > 0) return;
    this._birdTimer = 2 + Math.random() * 4;

    const idx = this._birdSpots[(Math.random() * this._birdSpots.length) | 0];
    const cx = (idx % GRID_W) + 0.5;
    const cy = ((idx / GRID_W) | 0) + 0.5;
    const flock = 2 + ((Math.random() * 3) | 0);
    const a = Math.random() * 6.283;
    for (let i = 0; i < flock; i++) {
      const p = this._get(0);
      if (!p) return;
      p.kind = K_BIRD;
      p.layer = LAYER_OVER;
      p.prio = 0;
      p.x = cx + (Math.random() - 0.5) * 5;
      p.y = cy + (Math.random() - 0.5) * 5;
      p.z = 60 + Math.random() * 50;
      p.vx = Math.cos(a) * (0.5 + Math.random() * 0.25);
      p.vy = Math.sin(a) * (0.5 + Math.random() * 0.25);
      p.vz = 0;
      p.ax = 0; p.ay = 0; p.az = 0;
      p.age = 0;
      p.life = 9 + Math.random() * 6;
      p.size = 2.2 + Math.random();
      p.grow = 0;
      p.drag = 0;
      p.alpha = 0.75;
      p.fade = 1;
      p.rot = 0;
      p.spin = 0;
      p.col = BIRD_COL;
      p.wob = Math.random() * 6.283;
    }
  }

  /* ------------------------------------------------------------------ *
   * Drawing
   * ------------------------------------------------------------------ */

  /** Soft round sprite for a colour, built once and cached. */
  _sprite(col) {
    let sp = this._sprites.get(col);
    if (sp !== undefined) return sp;
    sp = null;
    if (typeof document !== 'undefined' && document.createElement) {
      const cv = document.createElement('canvas');
      cv.width = 64;
      cv.height = 64;
      // Headless and exotic hosts can hand back an element with no 2D
      // context; falling back to the flat circle is correct, not fatal.
      const c = typeof cv.getContext === 'function' ? cv.getContext('2d') : null;
      if (c && typeof c.createRadialGradient === 'function') {
        const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, rgba(col, 1));
        g.addColorStop(0.4, rgba(col, 0.72));
        g.addColorStop(0.75, rgba(col, 0.24));
        g.addColorStop(1, rgba(col, 0));
        c.fillStyle = g;
        c.fillRect(0, 0, 64, 64);
        sp = cv;
      }
    }
    this._sprites.set(col, sp);
    return sp;
  }

  /**
   * Ground layer: dust, blood stains, impact scatter. render.js calls this
   * AFTER the terrain and BEFORE buildings/villagers.
   */
  drawGround(ctx, game) {
    this._draw(ctx, game, LAYER_GROUND);
  }

  /**
   * Overhead layer: smoke, sparks, arrows, pops, rubble, weather, birds,
   * hearth motes. render.js calls this AFTER buildings and villagers.
   */
  drawOverhead(ctx, game) {
    this._draw(ctx, game, LAYER_OVER);
  }

  /**
   * What render.js calls today: one pass with its WORLD transform already on
   * the context, so no camera is applied here. Both layers are drawn in
   * order, which means ground dust sits over the buildings rather than under
   * them — split this into `drawGroundWorld` before the entity pass and
   * `drawOverheadWorld` after it to get the depth right.
   */
  draw(ctx, renderer) {
    this.drawGroundWorld(ctx, renderer);
    this.drawOverheadWorld(ctx, renderer);
  }

  /** Ground layer, drawn in iso world pixels (render.js's world transform). */
  drawGroundWorld(ctx, renderer) {
    this._drawWorld(ctx, renderer, LAYER_GROUND);
  }

  /** Overhead layer, drawn in iso world pixels (render.js's world transform). */
  drawOverheadWorld(ctx, renderer) {
    this._drawWorld(ctx, renderer, LAYER_OVER);
  }

  _drawWorld(ctx, renderer, layer) {
    const prev = this.space;
    this.space = 'world';
    this._renderer = renderer || null;
    this._draw(ctx, null, layer);
    this._renderer = null;
    this.space = prev;
  }

  _beginFrame(ctx, game) {
    if (game) this.game = game;
    const input = this.game.input;
    const cam = input ? input.cam : null;
    const margin = 64;
    if (this.space === 'world' || !cam) {
      // render.js has already applied its own world transform, so draw
      // coordinates ARE iso world pixels and no camera goes on top.
      this._s = 1;
      this._ox = 0;
      this._oy = 0;
      const r = this._renderer;
      if (r && typeof r.vx0 === 'number') {
        this._cx0 = r.vx0; this._cx1 = r.vx1; this._cy0 = r.vy0; this._cy1 = r.vy1;
      } else if (cam && input) {
        const hw = (input.viewW || 1200) * 0.5 / cam.zoom + margin;
        const hh = (input.viewH || 800) * 0.5 / cam.zoom + margin;
        this._cx0 = cam.x - hw; this._cx1 = cam.x + hw;
        this._cy0 = cam.y - hh - 140; this._cy1 = cam.y + hh;
      } else {
        this._cx0 = -1e9; this._cx1 = 1e9; this._cy0 = -1e9; this._cy1 = 1e9;
      }
      return;
    }
    const c = ctx.canvas;
    const vw = input.viewW || (c ? c.clientWidth || c.width : 0);
    const vh = input.viewH || (c ? c.clientHeight || c.height : 0);
    this._s = cam.zoom;
    this._ox = vw * 0.5 - cam.x * cam.zoom;
    this._oy = vh * 0.5 - cam.y * cam.zoom;
    this._cx0 = -margin;
    this._cy0 = -margin;
    this._cx1 = vw + margin;
    this._cy1 = vh + margin;
  }

  _draw(ctx, game, layer) {
    if (!this.enabled) return;
    this._beginFrame(ctx, game);
    const live = this.pool.live;
    const s = this._s;
    const ox = this._ox;
    const oy = this._oy;
    const cx0 = this._cx0;
    const cy0 = this._cy0;
    const cx1 = this._cx1;
    const cy1 = this._cy1;

    ctx.save();
    for (let i = 0; i < live.length; i++) {
      const p = live[i];
      if (p.layer !== layer) continue;
      const wx = isoX(p.x, p.y);
      const wy = isoY(p.x, p.y) - p.z;
      const sx = wx * s + ox;
      const sy = wy * s + oy;
      if (sx < cx0 || sy < cy0 || sx > cx1 || sy > cy1) continue;

      const t = p.age / p.life;
      let alpha = p.alpha;
      if (p.fade) alpha *= t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      if (alpha <= 0.01) continue;
      ctx.globalAlpha = alpha > 1 ? 1 : alpha;
      const r = p.size * s;

      switch (p.kind) {
        case K_SMOKE: {
          const dx2 = Math.sin(p.wob + p.age * 1.3) * 3 * s;
          const sp = this._sprite(p.col);
          if (sp) ctx.drawImage(sp, sx + dx2 - r, sy - r * 0.92, r * 2, r * 1.84);
          else {
            ctx.fillStyle = p.col;
            ctx.beginPath();
            ctx.arc(sx + dx2, sy, r, 0, 6.283);
            ctx.fill();
          }
          break;
        }
        case K_DUST: {
          const sp = this._sprite(p.col);
          if (sp) ctx.drawImage(sp, sx - r, sy - r * 0.58, r * 2, r * 1.16);
          else {
            ctx.fillStyle = p.col;
            ctx.beginPath();
            ctx.ellipse(sx, sy, r, r * 0.55, 0, 0, 6.283);
            ctx.fill();
          }
          break;
        }
        case K_SPARK: {
          // Short trail along the last ~40ms of travel; a bare dot at this
          // size reads as noise rather than a flying ember.
          const tx2 = isoX(p.vx, p.vy) * 0.04 * s;
          const ty2 = (isoY(p.vx, p.vy) * 0.04 - p.vz * 0.04) * s;
          ctx.strokeStyle = p.col;
          ctx.lineWidth = Math.max(0.7, r);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(sx - tx2, sy - ty2);
          ctx.lineTo(sx, sy);
          ctx.stroke();
          break;
        }
        case K_MOTE:
          ctx.fillStyle = p.col;
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, 6.283);
          ctx.fill();
          break;
        case K_BLOOD:
          ctx.fillStyle = p.col;
          ctx.fillRect(sx - r * 0.5, sy - r * 0.5, r, r);
          break;
        case K_SPLAT:
          ctx.fillStyle = p.col;
          ctx.beginPath();
          ctx.ellipse(sx, sy, r, r * 0.5, p.rot, 0, 6.283);
          ctx.fill();
          break;
        case K_POP:
          ctx.fillStyle = p.col;
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, 6.283);
          ctx.fill();
          ctx.strokeStyle = '#2b2620';
          ctx.lineWidth = Math.max(0.6, 0.8 * s);
          ctx.stroke();
          break;
        case K_RUBBLE:
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.col;
          ctx.fillRect(-r * 0.5, -r * 0.5, r, r * 0.8);
          ctx.restore();
          break;
        case K_ARROW: {
          const dx = p.ex - p.sx;
          const dy = p.ey - p.sy;
          const ang = Math.atan2((dx + dy) * HH, (dx - dy) * HW);
          const len = 10 * s;
          ctx.strokeStyle = p.col;
          ctx.lineWidth = Math.max(0.8, 1.4 * s);
          ctx.beginPath();
          ctx.moveTo(sx - Math.cos(ang) * len, sy - Math.sin(ang) * len);
          ctx.lineTo(sx, sy);
          ctx.stroke();
          break;
        }
        case K_SNOW:
          ctx.fillStyle = p.col;
          ctx.beginPath();
          ctx.arc(sx + Math.sin(p.wob + p.age * 2.2) * 5 * s, sy, r, 0, 6.283);
          ctx.fill();
          break;
        case K_RAIN:
          ctx.strokeStyle = p.col;
          ctx.lineWidth = Math.max(0.5, s);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx - 1.5 * s, sy + r);
          ctx.stroke();
          break;
        case K_BIRD: {
          const flap = Math.sin(p.wob + p.age * 11) * r * 0.6;
          ctx.strokeStyle = p.col;
          ctx.lineWidth = Math.max(0.6, s);
          ctx.beginPath();
          ctx.moveTo(sx - r, sy + flap);
          ctx.lineTo(sx, sy - flap * 0.4);
          ctx.lineTo(sx + r, sy + flap);
          ctx.stroke();
          break;
        }
        default:
          break;
      }
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------------ *
   * Debug / QA
   * ------------------------------------------------------------------ */

  stats() {
    return {
      live: this.pool.live.length,
      free: this.pool.free.length,
      cap: this.cap,
      emitters: this._emitterCount,
    };
  }
}
