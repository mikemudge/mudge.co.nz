// Pure helpers shared across Railwright's simulation modules. No game state,
// no DOM, no `Math.random()` - everything that needs randomness takes an rng
// function (see makeRng) so world generation and replay stay deterministic.
import { GRID_W, GRID_H, DIR_DX, DIR_DY, DIR_COUNT } from './constants.js';

// --- Grid coordinates ----------------------------------------------------
export function toIdx(x, y) {
  return y * GRID_W + x;
}

export function toXY(idx) {
  return { x: idx % GRID_W, y: Math.floor(idx / GRID_W) };
}

export function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
}

// --- Number helpers ------------------------------------------------------
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

export function manhattan(ax, ay, bx, by) {
  return Math.abs(bx - ax) + Math.abs(by - ay);
}

// --- Deterministic RNG (mulberry32) --------------------------------------
// Returns a function () -> float in [0, 1). Never use Math.random() in
// anything that must be reproducible from a seed (world generation, etc).
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer in [min, max], inclusive of both ends.
export function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function randPick(rng, arr) {
  return arr[randInt(rng, 0, arr.length - 1)];
}

// Fisher-Yates, in place. Returns the same array for convenience.
export function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// --- Formatting ------------------------------------------------------
export function formatMoney(value) {
  const n = Math.round(value);
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US')}`;
}

// timeOfDay is 0..1 through the in-game day -> "HH:MM" 24h clock.
export function formatTime(timeOfDay) {
  const totalMinutes = Math.floor(clamp(timeOfDay, 0, 1) * 24 * 60) % (24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// --- Directions ------------------------------------------------------
// Even dir indices (0,2,4,6) are orthogonal, odd ones are diagonal - see
// constants.js DIR_DX/DIR_DY ordering.
export function stepDistance(dir) {
  return dir % 2 === 0 ? 1 : Math.SQRT2;
}

// Direction from idxA to idxB if they are one of the 8 neighbours of each
// other, else -1.
export function dirBetween(idxA, idxB) {
  const a = toXY(idxA);
  const b = toXY(idxB);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (let d = 0; d < DIR_COUNT; d++) {
    if (DIR_DX[d] === dx && DIR_DY[d] === dy) return d;
  }
  return -1;
}

// All in-bounds 8-way neighbours of idx, as {idx, dir}.
export function neighbours(idx) {
  const { x, y } = toXY(idx);
  const result = [];
  for (let d = 0; d < DIR_COUNT; d++) {
    const nx = x + DIR_DX[d];
    const ny = y + DIR_DY[d];
    if (inBounds(nx, ny)) result.push({ idx: toIdx(nx, ny), dir: d });
  }
  return result;
}

// Signal key: signals live on the link between two tiles, keyed order-
// independent so (a,b) and (b,a) resolve to the same entry.
export function signalKeyFor(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

// --- Event bus (design contract section 9, names FROZEN) -----------------
export class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  // Returns an unsubscribe function.
  on(name, fn) {
    let set = this._listeners.get(name);
    if (!set) {
      set = new Set();
      this._listeners.set(name, set);
    }
    set.add(fn);
    return () => this.off(name, fn);
  }

  off(name, fn) {
    const set = this._listeners.get(name);
    if (set) set.delete(fn);
  }

  // A throwing listener is caught and logged - it must never break the
  // caller (usually mid-tick game loop code) or the remaining listeners.
  emit(name, payload) {
    const set = this._listeners.get(name);
    if (!set || set.size === 0) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`EventBus listener for "${name}" threw:`, err);
      }
    }
  }
}
