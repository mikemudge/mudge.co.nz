// utils.js - shared math / RNG helpers for Delve. No THREE or DOM dependency
// here on purpose, so this file stays trivially reusable by any later system
// (combat math, loot rolls, etc.) without dragging in rendering concerns.

// Deterministic PRNG (mulberry32). Two dungeons built from the same seed are
// identical, which is handy for debugging - pass any 32-bit integer seed.
// Returns a zero-arg function yielding floats in [0, 1).
export function createRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Random integer in [min, max], inclusive on both ends.
export function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// Random float in [min, max).
export function randRange(rng, min, max) {
  return rng() * (max - min) + min;
}

// Pick a random element from a non-empty array.
export function randChoice(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Frame-rate independent exponential smoothing: moves `current` toward
// `target`, covering a fixed fraction of the remaining distance per second
// (governed by `rate`) regardless of how choppy dt is. Used for the camera
// follow and any other "smoothly chase a value" need.
export function damp(current, target, rate, dt) {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

export function distance2D(x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  return Math.sqrt(dx * dx + dz * dz);
}
