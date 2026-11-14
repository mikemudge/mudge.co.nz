/**
 * Hearthmere — pure helpers: iso projection, index maths, seeded RNG, value
 * noise, EventBus, MinHeap, colour/geometry helpers, small collections.
 *
 * No game state and no DOM at module scope: this file must import cleanly
 * under Node 22 so every other module stays headless-testable (DESIGN §18).
 */

import { GRID_W, GRID_H, TILE_W, TILE_H } from './constants.js';

// Half-diamond extents. Cached because the projection runs per tile per frame.
const HW = TILE_W / 2;
const HH = TILE_H / 2;

// ---------------------------------------------------------------------------
// Index / coordinate maths (DESIGN §3)
// ---------------------------------------------------------------------------

/** Tile (x, y) -> flat tile index. No bounds check; call inBounds first. */
export function toIdx(x, y) {
  return y * GRID_W + x;
}

/** Flat tile index -> tile x. */
export function toX(idx) {
  return idx % GRID_W;
}

/** Flat tile index -> tile y. */
export function toY(idx) {
  return (idx / GRID_W) | 0;
}

/** True if (x, y) is inside the grid. */
export function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
}

/** Tile space -> iso world-pixel x (FROZEN, DESIGN §3). */
export function isoX(tx, ty) {
  return (tx - ty) * HW;
}

/** Tile space -> iso world-pixel y (FROZEN, DESIGN §3). */
export function isoY(tx, ty) {
  return (tx + ty) * HH;
}

/** Iso world-pixel -> float tile x (FROZEN, DESIGN §3). */
export function unIsoX(wx, wy) {
  return (wy / HH + wx / HW) / 2;
}

/** Iso world-pixel -> float tile y (FROZEN, DESIGN §3). */
export function unIsoY(wx, wy) {
  return (wy / HH - wx / HW) / 2;
}

/** Euclidean distance in tiles. */
export function tileDist(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

const SQRT2_M1 = Math.SQRT2 - 1;

/**
 * Octile distance — the A* heuristic for 8-way movement where a diagonal
 * costs SQRT2 and an orthogonal costs 1. This is the exact cost on an empty
 * unit-cost grid, so it is admissible as long as no tile costs below 1.
 */
export function octile(ax, ay, bx, by) {
  const dx = ax < bx ? bx - ax : ax - bx;
  const dy = ay < by ? by - ay : ay - by;
  return dx > dy ? dx + SQRT2_M1 * dy : dy + SQRT2_M1 * dx;
}

/** Manhattan (4-way) distance in tiles. */
export function manhattan(ax, ay, bx, by) {
  const dx = ax < bx ? bx - ax : ax - bx;
  const dy = ay < by ? by - ay : ay - by;
  return dx + dy;
}

const DIR_STEP = Math.PI / 4;

/**
 * Nearest of the 8 tile-space directions from a to b (0:E 1:SE 2:S 3:SW 4:W
 * 5:NW 6:N 7:NE). Zero delta returns 0 (East).
 */
export function dirBetween(ax, ay, bx, by) {
  const d = Math.round(Math.atan2(by - ay, bx - ax) / DIR_STEP);
  return ((d % 8) + 8) % 8;
}

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Hermite ease on 0..1, clamped at the ends. */
export function smoothstep(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/**
 * Exponential ease toward a target. Uses exp(-rate*dt) rather than a raw
 * lerp so the result is identical regardless of frame rate or dt splitting.
 */
export function approach(cur, target, rate, dt) {
  if (rate <= 0 || dt <= 0) return cur;
  return target + (cur - target) * Math.exp(-rate * dt);
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

function trim1(v) {
  return String(Math.round(v * 10) / 10);
}

/** Compact count for the HUD: 1200 -> "1.2k", 3400000 -> "3.4M". */
export function fmtNum(n) {
  if (Number.isNaN(n)) return '0';
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';
  const a = n < 0 ? -n : n;
  if (a < 1000) return trim1(n);
  const sign = n < 0 ? '-' : '';
  if (a < 1e6) return sign + trim1(a / 1e3) + 'k';
  if (a < 1e9) return sign + trim1(a / 1e6) + 'M';
  return sign + trim1(a / 1e9) + 'B';
}

/** "4.5 days" / "1 day" / "∞". Negatives clamp to zero. */
export function fmtDays(n) {
  if (Number.isNaN(n)) return '0 days';
  if (!Number.isFinite(n)) return '∞';
  const v = n <= 0 ? 0 : n < 10 ? Math.round(n * 10) / 10 : Math.round(n);
  return v === 1 ? '1 day' : v + ' days';
}

/** 'iron_ore' -> 'Iron Ore'. Separators are _, - and whitespace. */
export function titleCase(s) {
  if (!s) return '';
  return String(s)
    .replace(/[_-]+/g, ' ')
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Hashing, RNG and noise
// ---------------------------------------------------------------------------

/**
 * Deterministic 0..1 hash of two ints plus a seed. Stateless and cheap, so
 * the renderer can call it per tile per frame and world gen can sample it out
 * of order — unlike RNG, results never depend on call order.
 */
export function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2d);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Seeded mulberry32. Whole state is JSON-safe so saves resume mid-sequence. */
export class RNG {
  constructor(seed = 1) {
    this.s = (seed >>> 0) || 1;
    // Box-Muller produces two normals at a time; the unused one is kept here
    // and must travel with the state or a reload would shift the sequence.
    this.gaussSpare = null;
  }

  /** Float in [0, 1). */
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, n). */
  int(n) {
    return Math.floor(this.next() * n);
  }

  /** Float in [lo, hi). */
  range(lo, hi) {
    return lo + this.next() * (hi - lo);
  }

  /** Random element, or undefined for an empty array. */
  pick(arr) {
    return arr.length === 0 ? undefined : arr[Math.floor(this.next() * arr.length)];
  }

  /** Fisher-Yates, in place, returns the same array. */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  chance(p) {
    return this.next() < p;
  }

  /** Standard normal (mean 0, sd 1), Marsaglia polar. */
  gauss() {
    if (this.gaussSpare !== null) {
      const v = this.gaussSpare;
      this.gaussSpare = null;
      return v;
    }
    let u, v, q;
    do {
      u = this.next() * 2 - 1;
      v = this.next() * 2 - 1;
      q = u * u + v * v;
    } while (q === 0 || q >= 1);
    const m = Math.sqrt((-2 * Math.log(q)) / q);
    this.gaussSpare = v * m;
    return u * m;
  }

  /** Plain, JSON-safe snapshot. */
  getState() {
    return { s: this.s, gaussSpare: this.gaussSpare };
  }

  /** Accepts a getState() object or a bare uint32 seed. */
  setState(st) {
    if (st === null || st === undefined) return;
    if (typeof st === 'number') {
      this.s = st >>> 0;
      this.gaussSpare = null;
      return;
    }
    this.s = st.s >>> 0;
    this.gaussSpare = typeof st.gaussSpare === 'number' ? st.gaussSpare : null;
  }

  get state() {
    return this.getState();
  }

  set state(st) {
    this.setState(st);
  }
}

/**
 * Value noise on the integer lattice, smoothstep-interpolated. Deterministic
 * for a seed and stateless per sample (backed by hash2), so world gen can
 * sample any tile in any order and get the same map.
 * @returns {(x:number, y:number) => number} value in -1..1
 */
export function makeNoise2D(seed) {
  const s = seed >>> 0;
  return function noise2D(x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smoothstep(x - x0);
    const fy = smoothstep(y - y0);
    const a = hash2(x0, y0, s);
    const b = hash2(x0 + 1, y0, s);
    const c = hash2(x0, y0 + 1, s);
    const d = hash2(x0 + 1, y0 + 1, s);
    const top = a + (b - a) * fx;
    const bot = c + (d - c) * fx;
    return (top + (bot - top) * fy) * 2 - 1;
  };
}

/** Fractal brownian motion over any -1..1 noise fn. Result stays in -1..1. */
export function fbm(noise, x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm === 0 ? 0 : sum / norm;
}

// ---------------------------------------------------------------------------
// EventBus (DESIGN §11)
// ---------------------------------------------------------------------------

export class EventBus {
  constructor() {
    this.map = new Map();
  }

  /** Subscribe. Returns an idempotent unsubscribe function. */
  on(name, fn) {
    let list = this.map.get(name);
    if (list === undefined) {
      list = [];
      this.map.set(name, list);
    }
    list.push(fn);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.off(name, fn);
    };
  }

  /** Subscribe for exactly one emit. off(name, fn) also removes it. */
  once(name, fn) {
    const wrap = (payload) => {
      this.off(name, wrap);
      fn(payload);
    };
    wrap.fn = fn;
    return this.on(name, wrap);
  }

  /** Remove a listener registered with on() or once(). */
  off(name, fn) {
    const list = this.map.get(name);
    if (list === undefined) return;
    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      if (l === fn || l.fn === fn) {
        list.splice(i, 1);
        return;
      }
    }
  }

  /**
   * Fire listeners. A listener that throws is logged and skipped so one bad
   * module can never break another (DESIGN §11). The list is snapshotted, so
   * subscribing or unsubscribing from inside a listener cannot corrupt the
   * iteration — the change takes effect on the next emit.
   */
  emit(name, payload) {
    const list = this.map.get(name);
    if (list === undefined) return;
    const n = list.length;
    if (n === 0) return;
    if (n === 1) {
      // Fast path: one listener needs no snapshot, and it is by far the
      // commonest case on hot events.
      try {
        list[0](payload);
      } catch (err) {
        console.warn('[bus] listener for "' + name + '" threw:', err);
      }
      return;
    }
    const snap = list.slice();
    for (let i = 0; i < n; i++) {
      try {
        snap[i](payload);
      } catch (err) {
        console.warn('[bus] listener for "' + name + '" threw:', err);
      }
    }
  }

  /** Drop every listener, or every listener for one name. */
  clear(name) {
    if (name === undefined) this.map.clear();
    else this.map.delete(name);
  }
}

// ---------------------------------------------------------------------------
// MinHeap
// ---------------------------------------------------------------------------

/**
 * Binary min-heap over numeric keys. Keys and values live in two parallel
 * flat arrays rather than {key, value} nodes: A* pops thousands of nodes per
 * tick and per-node objects would dominate the GC. clear() only resets the
 * length, so the backing arrays are reused across calls.
 */
export class MinHeap {
  constructor(capacity = 64) {
    this.keys = new Float64Array(capacity > 1 ? capacity : 1);
    this.vals = new Array(capacity > 1 ? capacity : 1);
    this.size = 0;
  }

  push(value, key) {
    let i = this.size++;
    if (i >= this.keys.length) {
      const grown = new Float64Array(this.keys.length * 2);
      grown.set(this.keys);
      this.keys = grown;
    }
    const keys = this.keys;
    const vals = this.vals;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      keys[i] = keys[p];
      vals[i] = vals[p];
      i = p;
    }
    keys[i] = key;
    vals[i] = value;
  }

  /** Lowest-keyed value, or undefined when empty. */
  pop() {
    if (this.size === 0) return undefined;
    const keys = this.keys;
    const vals = this.vals;
    const top = vals[0];
    const last = --this.size;
    if (last > 0) {
      const k = keys[last];
      const v = vals[last];
      let i = 0;
      const half = last >> 1;
      while (i < half) {
        let c = 2 * i + 1;
        const r = c + 1;
        if (r < last && keys[r] < keys[c]) c = r;
        if (keys[c] >= k) break;
        keys[i] = keys[c];
        vals[i] = vals[c];
        i = c;
      }
      keys[i] = k;
      vals[i] = v;
    }
    return top;
  }

  /** Key at the top, or Infinity when empty. */
  peekKey() {
    return this.size === 0 ? Infinity : this.keys[0];
  }

  /** O(1): drops the contents but keeps the backing arrays. */
  clear() {
    this.size = 0;
  }
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

// Parsed colours are memoised: the renderer re-parses the same few dozen
// palette strings thousands of times a frame.
const RGB_CACHE = new Map();
const BLACK_RGB = { r: 0, g: 0, b: 0 };

/**
 * '#rrggbb' | '#rgb' (with or without '#') -> {r, g, b}.
 * The returned object is shared and cached — treat it as read-only.
 */
export function hexToRgb(hex) {
  let got = RGB_CACHE.get(hex);
  if (got !== undefined) return got;
  let h = String(hex).trim();
  if (h.charCodeAt(0) === 35) h = h.slice(1);
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) {
    got = BLACK_RGB;
  } else {
    got = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  RGB_CACHE.set(hex, got);
  return got;
}

function c255(v) {
  v = Math.round(v);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function toHex(r, g, b) {
  return '#' + (((1 << 24) | (c255(r) << 16) | (c255(g) << 8) | c255(b)).toString(16).slice(1));
}

/**
 * Darken (amount < 0) or lighten (amount > 0) toward black/white.
 * amount is -1..1; this is what makes a building's left face 12% darker and
 * its right face 22% darker (DESIGN §1).
 */
export function shade(hex, amount) {
  const c = hexToRgb(hex);
  const t = clamp(amount, -1, 1);
  if (t >= 0) {
    return toHex(c.r + (255 - c.r) * t, c.g + (255 - c.g) * t, c.b + (255 - c.b) * t);
  }
  const k = 1 + t;
  return toHex(c.r * k, c.g * k, c.b * k);
}

/** Linear blend of two hex colours; t=0 is a, t=1 is b. */
export function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const k = clamp(t, 0, 1);
  return toHex(a.r + (b.r - a.r) * k, a.g + (b.g - a.g) * k, a.b + (b.b - a.b) * k);
}

/** Hex + alpha -> css 'rgba(r, g, b, a)'. */
export function rgba(hex, alpha) {
  const c = hexToRgb(hex);
  return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
}

// ---------------------------------------------------------------------------
// Iso geometry
// ---------------------------------------------------------------------------

/** Point-in-diamond test, used for mouse picking a tile. */
export function pointInDiamond(px, py, cx, cy, halfW, halfH) {
  const dx = px - cx;
  const dy = py - cy;
  return (dx < 0 ? -dx : dx) / halfW + (dy < 0 ? -dy : dy) / halfH <= 1;
}

const JITTER = 1.5;

/**
 * Trace one ground diamond, corners jittered by up to ±1.5px so the terrain
 * never reads as a perfect lattice (DESIGN §1). The jitter comes from hash2,
 * so a tile's outline is identical every frame. Pass jitterSeed = undefined
 * for a clean diamond (build previews, UI icons).
 *
 * Issues path commands only — it begins and closes the path but never fills
 * or strokes; the caller decides.
 */
export function diamondPath(ctx, cx, cy, halfW, halfH, jitterSeed) {
  ctx.beginPath();
  if (jitterSeed === undefined || jitterSeed === null) {
    ctx.moveTo(cx, cy - halfH);
    ctx.lineTo(cx + halfW, cy);
    ctx.lineTo(cx, cy + halfH);
    ctx.lineTo(cx - halfW, cy);
    ctx.closePath();
    return;
  }
  const s = jitterSeed | 0;
  const jx0 = (hash2(s, 0, 0x51ed) * 2 - 1) * JITTER;
  const jy0 = (hash2(s, 0, 0x2f7b) * 2 - 1) * JITTER;
  const jx1 = (hash2(s, 1, 0x51ed) * 2 - 1) * JITTER;
  const jy1 = (hash2(s, 1, 0x2f7b) * 2 - 1) * JITTER;
  const jx2 = (hash2(s, 2, 0x51ed) * 2 - 1) * JITTER;
  const jy2 = (hash2(s, 2, 0x2f7b) * 2 - 1) * JITTER;
  const jx3 = (hash2(s, 3, 0x51ed) * 2 - 1) * JITTER;
  const jy3 = (hash2(s, 3, 0x2f7b) * 2 - 1) * JITTER;
  ctx.moveTo(cx + jx0, cy - halfH + jy0);
  ctx.lineTo(cx + halfW + jx1, cy + jy1);
  ctx.lineTo(cx + jx2, cy + halfH + jy2);
  ctx.lineTo(cx - halfW + jx3, cy + jy3);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Small collections
// ---------------------------------------------------------------------------

/**
 * Object pool for particles and other churn-heavy short-lived objects.
 * A factory function (not a class) so it works with or without `new`.
 * @param factory () => object
 * @param reset   (o) => void, called when an object goes back in the pool
 */
export function Pool(factory, reset) {
  const free = [];
  const live = [];
  return {
    free,
    live,
    get() {
      const o = free.length > 0 ? free.pop() : factory();
      live.push(o);
      return o;
    },
    release(o) {
      const i = live.indexOf(o);
      if (i < 0) return false;
      removeSwap(live, i);
      if (reset) reset(o);
      free.push(o);
      return true;
    },
    releaseAll() {
      for (let i = 0; i < live.length; i++) {
        const o = live[i];
        if (reset) reset(o);
        free.push(o);
      }
      live.length = 0;
    },
  };
}

/** Push v only if absent. Returns true if it was added. */
export function pushUnique(arr, v) {
  if (arr.indexOf(v) >= 0) return false;
  arr.push(v);
  return true;
}

/** O(1) unordered removal: the last element fills the hole. Returns the removed item. */
export function removeSwap(arr, i) {
  const n = arr.length;
  if (i < 0 || i >= n) return undefined;
  const out = arr[i];
  const last = arr.pop();
  if (i < n - 1) arr[i] = last;
  return out;
}

/** O(n) find + O(1) unordered removal. Returns true if v was present. */
export function removeValueSwap(arr, v) {
  const i = arr.indexOf(v);
  if (i < 0) return false;
  removeSwap(arr, i);
  return true;
}

// ---------------------------------------------------------------------------
// Save helpers (DESIGN §14)
// ---------------------------------------------------------------------------

/** Typed array -> plain JSON-safe array. null/undefined pass through as null. */
export function packTyped(typedArray) {
  if (!typedArray) return null;
  return Array.from(typedArray);
}

/** Plain array -> typed array of Ctor. Missing data yields an empty array. */
export function unpackTyped(Ctor, plainArray) {
  if (!plainArray) return new Ctor(0);
  return new Ctor(plainArray);
}

/** JSON.parse that never throws — a corrupt save must not crash the game. */
export function safeJsonParse(str, fallback) {
  if (typeof str !== 'string' || str.length === 0) return fallback;
  try {
    const v = JSON.parse(str);
    return v === undefined || v === null ? fallback : v;
  } catch (err) {
    console.warn('[utils] safeJsonParse failed:', err);
    return fallback;
  }
}
