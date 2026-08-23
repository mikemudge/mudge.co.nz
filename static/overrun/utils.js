// Small math / helper utilities shared across the Overrun game modules.

export const ARENA_SIZE = 3000;

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
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

export function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function dist2(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

// Returns a unit vector [x, y] pointing from (x1,y1) to (x2,y2), or [0, 0]
// if the points coincide.
export function normalizeDir(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return [0, 0];
  return [dx / d, dy / d];
}

export function normalize(x, y) {
  const d = Math.hypot(x, y);
  if (d < 1e-6) return [0, 0];
  return [x / d, y / d];
}

export function circlesOverlap(x1, y1, r1, x2, y2, r2) {
  const rr = r1 + r2;
  return dist2(x1, y1, x2, y2) <= rr * rr;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}
