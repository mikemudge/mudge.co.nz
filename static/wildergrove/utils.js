// Small dependency-free helpers shared across every Wildergrove module:
// math primitives, a deterministic PRNG (world generation must be
// reproducible from a numeric seed), an explicit event bus (per the design
// contract, never a module-level singleton — main.js creates one and passes
// it into whatever needs it), and localStorage helpers that never throw
// (private browsing / disabled storage must degrade to "no save", not a
// crash).

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Deterministic PRNG (mulberry32). Same seed -> same sequence, so overworld
// and mine generation can be regenerated/verified from a stored seed rather
// than persisting every generated tile forever. Returns a zero-arg function
// yielding floats in [0, 1).
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

// Convenience wrappers around a rng() built by createRng, mirroring the
// small helper set driftworks' utils.js offers — kept here rather than
// duplicated in world.js.
export function randInt(rng, min, max) {
  return Math.floor(min + rng() * (max - min + 1));
}

export function choice(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// --- Event bus ---------------------------------------------------------
// Plain pub/sub keyed by event name. Passed explicitly into every module
// that needs it (quests.js, ui.js, actions.js, particles.js) rather than
// imported as a singleton, so each module stays testable/instantiable in
// isolation. `off` is a no-op if `fn` was never registered (or already
// removed) — callers don't need to track subscription state themselves.
export function createEventBus() {
  const listeners = new Map(); // name -> Set<fn>

  function on(name, fn) {
    let set = listeners.get(name);
    if (!set) {
      set = new Set();
      listeners.set(name, set);
    }
    set.add(fn);
  }

  function off(name, fn) {
    const set = listeners.get(name);
    if (set) set.delete(fn);
  }

  function emit(name, payload) {
    const set = listeners.get(name);
    if (!set || set.size === 0) return;
    // Snapshot before iterating: a handler may subscribe/unsubscribe (e.g.
    // quests.js reacting to its own emitted event) mid-emit without that
    // mutating the Set we're iterating.
    for (const fn of Array.from(set)) fn(payload);
  }

  return { on, off, emit };
}

// --- Save/load helpers ---------------------------------------------------
// localStorage can throw (private browsing, storage disabled, quota
// exceeded, or a value that predates a save-format change) — every access
// goes through these so a broken/missing save degrades to "start fresh"
// rather than crashing main.js's boot sequence.
export function safeGetJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function safeSetJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function safeRemove(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
