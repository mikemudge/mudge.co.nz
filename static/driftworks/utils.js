// Shared constants + small math/helper utilities used across every Driftworks
// module (engine, buildings, and presentation alike).

export const TILE_SIZE = 64;
export const GRID_SIZE = 48;

// Direction ids used everywhere a building/belt needs an orientation:
// 0=up(-y), 1=right(+x), 2=down(+y), 3=left(-x).
export const DIRECTIONS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

export function dirDelta(dir) {
  return DIRECTIONS[((dir % 4) + 4) % 4];
}

export function oppositeDir(dir) {
  return (dir + 2) % 4;
}

// perpendicular sides of a direction, used by splitter/merger (left, right
// relative to the facing direction).
export function perpendicularDirs(dir) {
  return [(dir + 1) % 4, (dir + 3) % 4];
}

// Canonical map-key for a grid coordinate. Used by Simulation's buildings
// Map, Grid's reclamation progress map, etc - keep it consistent everywhere.
export function tileKey(x, y) {
  return `${x},${y}`;
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function rand(min, max) {
  return min + Math.random() * (max - min);
}

export function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

export function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Pick an item from [{item, weight}, ...] proportional to weight.
export function weightedChoice(entries) {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let r = Math.random() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e.item;
  }
  return entries[entries.length - 1].item;
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

// Deterministic PRNG (mulberry32) so island generation can be reproduced
// from a numeric seed instead of relying on Math.random directly.
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
