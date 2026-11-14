/**
 * Hearthmere — entry point. Builds the DOM shell (stylesheet + canvas), owns
 * the game loop, the §3 clock rules and the `'start' | 'playing' | 'paused' |
 * 'gameover'` state machine, and wires the twelve modules into the single
 * `game` object DESIGN §12 freezes. It is the only file that knows the boot
 * sequence, the save format (§14) and the frozen update order.
 *
 * No DOM at module scope (§18): the browser bootstrap is guarded so this file
 * imports cleanly under Node 22 for `createHeadlessGame` / `stepHeadless`,
 * which is what QA drives.
 *
 * Wiring notes that are load-bearing rather than decorative:
 *  - Every `init()` runs only after all twelve modules exist, because several
 *    of them cross-reference in `init` (paths reads world, buildings seeds its
 *    RNG from `world.seed`, input centres on `world.start`).
 *  - The canvas gets a CSS size ONLY. `render.js` owns `canvas.width/height`
 *    and the dpr transform; a CSS transform or border here breaks picking
 *    (ADDENDUM F3).
 *  - `economy.available()` is a per-tick cache, so the boot sequence, which
 *    moves goods without ticking, invalidates it between steps or the Town
 *    Centre cannot be paid for with money that is demonstrably there (G11).
 *  - START_STOCK is deposited, not `add`ed: the J3.1 per-item cap is 30 for
 *    the Town Centre, so a bare `add()` of its 40 wood would clamp and lose
 *    ten units on the very first frame.
 */

import {
  SAVE_KEY, SAVE_VERSION, START_STOCK, START_VILLAGERS,
  GRID_W, GRID_H, DAY_SECONDS, BUILDING_BY_ID, SPEEDS,
} from './constants.js';
import { EventBus, toIdx, toX, toY, inBounds, safeJsonParse } from './utils.js';
import { createWorld } from './world.js';
import { createPaths } from './paths.js';
import { createBuildings } from './buildings.js';
import { createVillagers } from './villagers.js';
import { createEconomy } from './economy.js';
import { createMilitary } from './military.js';
import { createParticles } from './particles.js';
import { createRender } from './render.js';
import { createInput } from './input.js';
import { createUI } from './ui.js';

const CSS_HREF = '/static/hearthmere/hearthmere.css';
const CANVAS_ID = 'hearthmere-canvas';

/** §3: dt is speed-multiplied and then clamped to this many game-seconds. */
const MAX_STEP = 0.25;
/** Real seconds between autosaves (§14). */
const AUTOSAVE_SECONDS = 30;
/** Fixed step for the headless harness; small enough that movement is honest. */
const HEADLESS_DT = 0.1;
/** §14: a save that cannot be restored is discarded with this, never a crash. */
const SAVE_DROPPED_TEXT = 'Saved game could not be loaded — starting a new valley.';

/* ------------------------------------------------------------------ *
 * Construction and wiring
 * ------------------------------------------------------------------ */

/**
 * Builds the `game` object of §12. `headless` omits the four presentation
 * modules entirely — they are the only ones that touch the DOM.
 */
function makeGame(opts) {
  const o = opts || {};
  const headless = !!o.headless;

  const game = {
    bus: new EventBus(),
    world: null, paths: null, buildings: null, villagers: null,
    economy: null, military: null,
    render: null, particles: null, input: null, ui: null,
    canvas: o.canvas || null,
    ctx: o.ctx || null,
    state: 'start',
    speed: 1,
    tickCount: 0,
    headless: headless,
    // Wall-clock seconds of simulation, used only by the autosave timer.
    realTime: 0,
    lastSpeed: 1,
  };

  game.world = createWorld(game);
  game.paths = createPaths(game);
  game.buildings = createBuildings(game);
  game.villagers = createVillagers(game);
  game.economy = createEconomy(game);
  game.military = createMilitary(game);
  if (!headless) {
    game.particles = createParticles(game);
    game.render = createRender(game);
    game.input = createInput(game);
    game.ui = createUI(game);
  }

  game.setSpeed = (n) => setSpeed(game, n);
  game.togglePause = () => togglePause(game);
  game.toast = (text, kind) => game.bus.emit('toast', { text: text, kind: kind || 'info' });

  return game;
}

/** Every `init()`, only once all twelve modules exist (§12). */
function initAll(game) {
  game.world.init();
  game.paths.init();
  game.buildings.init();
  game.villagers.init();
  game.economy.init();
  game.military.init();
  if (game.particles) game.particles.init();
  if (game.render) game.render.init();
  if (game.input) game.input.init();
  if (game.ui) game.ui.init();
}

/* ------------------------------------------------------------------ *
 * Speed and state (§3, §12). input.js and ui.js both prefer these to
 * writing game.speed directly.
 * ------------------------------------------------------------------ */

function setSpeed(game, n) {
  // `n` is a multiplier, not a gear index. The ceiling is the top SPEEDS entry
  // so adding a gear there is the only edit a new speed needs.
  const max = SPEEDS[SPEEDS.length - 1];
  const v = n | 0;
  const speed = v < 0 ? 0 : v > max ? max : v;
  if (speed > 0) game.lastSpeed = speed;
  game.speed = speed;
  if (game.state === 'playing' || game.state === 'paused') {
    game.state = speed === 0 ? 'paused' : 'playing';
  }
}

function togglePause(game) {
  if (game.state === 'gameover') return;
  if (game.speed === 0) setSpeed(game, game.lastSpeed || 1);
  else setSpeed(game, 0);
}

/* ------------------------------------------------------------------ *
 * The tick — FROZEN order (§12)
 * ------------------------------------------------------------------ */

/**
 * One simulation step. `dt` is already speed-multiplied and clamped by the
 * caller. `render`/`ui` are pure readers but still get the same dt.
 */
function step(game, dt) {
  game.tickCount++;
  game.world.update(dt, game);
  game.paths.update(dt, game);
  game.buildings.update(dt, game);
  game.villagers.update(dt, game);
  game.economy.update(dt, game);
  game.military.update(dt, game);
  checkExtinct(game);
  if (game.particles) game.particles.update(dt, game);
  if (game.render) game.render.update(dt, game);
  if (game.ui) game.ui.update(dt, game);
}

/**
 * §10.7 ends the game at population zero, but military.js only checks on
 * `day:ended` and at a raid's end — a town that empties between those moments
 * kept running as 'playing' forever (ADDENDUM Q4). military.js owns the
 * `game:over` event (ADDENDUM H5), so this only prods its own check.
 */
function checkExtinct(game) {
  if (game.state === 'gameover') return;
  const m = game.military;
  if (m && typeof m.checkGameOver === 'function') m.checkGameOver();
}

/* ------------------------------------------------------------------ *
 * New-game boot (ADDENDUM E3 + G11)
 * ------------------------------------------------------------------ */

/**
 * `buildings.place()` checks `economy.available()`, and there is deliberately
 * no free-placement path — so the Town Centre's cost is deposited first and
 * `place()` spends it straight back out (G11).
 */
function seedTown(game) {
  const { world, buildings, economy, villagers } = game;
  const start = world.start;

  economy.invalidateStock();
  buildings.deposit('wood', 30, start.x, start.y);
  buildings.deposit('stone', 20, start.x, start.y);
  economy.invalidateStock();

  const tc = buildings.place('town_centre', start.x - 1, start.y - 1);
  if (!tc) {
    console.warn('[hearthmere] Town Centre placement failed:', buildings.lastError);
    return null;
  }
  economy.invalidateStock();

  // deposit(), not add(): the J3.1 per-item cap is 30 for the Town Centre, so
  // a bare add() of START_STOCK's 40 wood would silently clamp and lose 10.
  // deposit() parks the remainder in the overflow pool, which economy's
  // drainOverflow() re-homes as soon as storage room appears.
  for (const item in START_STOCK) {
    buildings.deposit(item, START_STOCK[item], start.x, start.y);
  }
  economy.invalidateStock();

  layStartPath(game, tc);
  economy.invalidateStock();

  spawnStartVillagers(game, tc);
  villagers.assignJobs();
  economy.invalidateStock();
  return tc;
}

/**
 * E3's 3-tile dirt path stub, running out from the Town Centre so the game
 * does not open on a `'no road'` warning against a building the player did not
 * place. Tries each side and keeps the first run that lays all three.
 */
function layStartPath(game, tc) {
  const { world, buildings } = game;
  const sides = [
    { ax: tc.x + 1, ay: tc.y + tc.h, dx: 0, dy: 1 },
    { ax: tc.x + tc.w, ay: tc.y + 1, dx: 1, dy: 0 },
    { ax: tc.x + 1, ay: tc.y - 1, dx: 0, dy: -1 },
    { ax: tc.x - 1, ay: tc.y + 1, dx: -1, dy: 0 },
  ];
  for (let s = 0; s < sides.length; s++) {
    const side = sides[s];
    const tiles = [];
    for (let i = 0; i < 3; i++) {
      const x = side.ax + side.dx * i;
      const y = side.ay + side.dy * i;
      if (!inBounds(x, y)) break;
      if (!buildings.canPlace('path', x, y).ok) break;
      tiles.push({ x: x, y: y });
    }
    if (tiles.length < 3) continue;
    let laid = 0;
    for (let i = 0; i < tiles.length; i++) {
      if (buildings.place('path', tiles[i].x, tiles[i].y)) laid++;
    }
    if (laid > 0) return;
  }
  // Last resort: a single tile anywhere round the footprint keeps the Town
  // Centre connected, which every work loop depends on.
  for (let x = tc.x - 1; x <= tc.x + tc.w; x++) {
    for (let y = tc.y - 1; y <= tc.y + tc.h; y++) {
      if (!inBounds(x, y)) continue;
      if (world.building[toIdx(x, y)] >= 0) continue;
      if (buildings.place('path', x, y)) return;
    }
  }
}

/** START_VILLAGERS on walkable ground round the Town Centre door. */
function spawnStartVillagers(game, tc) {
  const { world, villagers } = game;
  const anchor = tc && tc.doorIdx >= 0 ? tc.doorIdx : toIdx(world.start.x, world.start.y);
  const spots = walkableNear(world, toX(anchor), toY(anchor), START_VILLAGERS);
  for (let i = 0; i < START_VILLAGERS; i++) {
    const idx = spots.length > 0 ? spots[i % spots.length] : anchor;
    villagers.spawn(toX(idx) + 0.5, toY(idx) + 0.5, { homeId: -1 });
  }
}

/** Up to `want` walkable tiles, nearest first, spiralling out from (cx, cy). */
function walkableNear(world, cx, cy, want) {
  const out = [];
  for (let r = 0; r <= 8 && out.length < want; r++) {
    for (let dy = -r; dy <= r && out.length < want; dy++) {
      for (let dx = -r; dx <= r && out.length < want; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (!inBounds(x, y)) continue;
        const idx = toIdx(x, y);
        if (world.isWalkable(idx)) out.push(idx);
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Save / load (§14)
 * ------------------------------------------------------------------ */

/* ---- Blob validation (§14, ADDENDUM N3) -------------------------------- *
 * Every module's restore() drops a dangling cross-module id by design, but a
 * scalar of the wrong type has no owner to drop it: it lands in live state and
 * stays there (`townHealth = NaN` makes every `townHealth < X` false, so
 * game-over can never fire). So the blob is type-checked as a whole, up front,
 * and a save that fails is discarded rather than half-applied.
 * -------------------------------------------------------------------------- */

function isObj(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Finite, or absent. Fields that serialize() always writes are still optional
 *  here — a missing one restores to its own module's default. */
function numOk(v) {
  return v === undefined || Number.isFinite(v);
}

function numsOk(o, keys) {
  for (let i = 0; i < keys.length; i++) if (!numOk(o[keys[i]])) return keys[i];
  return '';
}

/** An item->quantity map: finite and never negative (negative stock is stock
 *  that can be hauled out of a building forever). */
function countsFault(o, where) {
  if (o === undefined || o === null) return '';
  if (!isObj(o)) return where + ' is not a count map';
  for (const k in o) {
    const q = o[k];
    if (!Number.isFinite(q) || q < 0) return where + '.' + k + ' = ' + q;
  }
  return '';
}

const B_NUMS = ['id', 'x', 'y', 'w', 'h', 'progress', 'hp', 'maxHp', 'workProgress',
  'doorIdx', 'level', 'producedTotal', 'batch', 'gatherCarry', 'growMult', 'targetIdx', 'priority'];
const V_NUMS = ['id', 'vx', 'vy', 'homeId', 'jobId', 'carryQty', 'taskId', 'age', 'hunger',
  'fed', 'health', 'timer', 'nodeIdx', 'siteId', 'arriveTarget', 'prevJobId', 'eatTargetId', 'pathStep'];
const E_NUMS = ['coin', 'arrears', 'arrearsPenalty', 'townHealth', 'happiness', 'tier',
  'starvingDays', 'recentPlagueDays', 'consumedUnits', 'nextTaskId', 'rebuildTimer',
  'nextCaravanDay', 'lastDay', 'raidDeathCursor'];

function buildingsFault(B) {
  if (B.list !== undefined && !Array.isArray(B.list)) return 'buildings.list is not an array';
  const bad = countsFault(B.overflow, 'buildings.overflow');
  if (bad) return bad;
  const list = B.list || [];
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    const at = 'buildings.list[' + i + ']';
    if (!isObj(b)) return at + ' is not a building';
    if (!BUILDING_BY_ID[b.defId]) return at + '.defId = ' + b.defId;
    const k = numsOk(b, B_NUMS);
    if (k) return at + '.' + k + ' = ' + b[k];
    if (b.x < 0 || b.x >= GRID_W || b.y < 0 || b.y >= GRID_H) return at + ' is off the map';
    if (b.hp < 0 || b.progress < 0 || b.w <= 0 || b.h <= 0) return at + ' has a negative size or hp';
    if (b.workers !== undefined && !Array.isArray(b.workers)) return at + '.workers is not an array';
    const c = countsFault(b.inv, 'inv') || countsFault(b.delivered, 'delivered') || countsFault(b.cost, 'cost');
    if (c) return at + '.' + c;
  }
  return '';
}

function villagersFault(V) {
  if (V.list !== undefined && !Array.isArray(V.list)) return 'villagers.list is not an array';
  const list = V.list || [];
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    const at = 'villagers.list[' + i + ']';
    if (!isObj(v)) return at + ' is not a villager';
    const k = numsOk(v, V_NUMS);
    if (k) return at + '.' + k + ' = ' + v[k];
    if (!Number.isFinite(v.vx) || !Number.isFinite(v.vy)) return at + ' has no position';
    if (v.carryQty < 0 || v.health < 0 || v.hunger < 0) return at + ' has a negative scalar';
    if (v.path !== undefined && v.path !== null && !Array.isArray(v.path)) return at + '.path is not an array';
  }
  return '';
}

function economyFault(E) {
  const k = numsOk(E, E_NUMS);
  if (k) return 'economy.' + k + ' = ' + E[k];
  if (E.tasks !== undefined && E.tasks !== null) {
    if (!Array.isArray(E.tasks)) return 'economy.tasks is not an array';
    for (let i = 0; i < E.tasks.length; i++) {
      const t = E.tasks[i];
      const at = 'economy.tasks[' + i + ']';
      if (!isObj(t)) return at + ' is not a task';
      const tk = numsOk(t, ['id', 'qty', 'fromId', 'toId', 'claimedBy', 'age']);
      if (tk) return at + '.' + tk + ' = ' + t[tk];
      if (t.qty < 0) return at + '.qty = ' + t.qty;
    }
  }
  if (E.caravans !== undefined && E.caravans !== null && !Array.isArray(E.caravans)) return 'economy.caravans is not an array';
  if (E.tradeOrders !== undefined && E.tradeOrders !== null) {
    if (!isObj(E.tradeOrders)) return 'economy.tradeOrders is not an object';
    return countsFault(E.tradeOrders.sell, 'economy.tradeOrders.sell')
      || countsFault(E.tradeOrders.buy, 'economy.tradeOrders.buy');
  }
  return '';
}

function militaryFault(MIL) {
  const k = numsOk(MIL, ['wave', 'nextRaidDay', 'nextEnemyId']);
  if (k) return 'military.' + k + ' = ' + MIL[k];
  for (const f of ['drafted', 'kits', 'hps']) {
    if (MIL[f] !== undefined && MIL[f] !== null && !Array.isArray(MIL[f])) return 'military.' + f + ' is not an array';
  }
  const r = MIL.raid;
  if (r === undefined || r === null) return '';
  if (!isObj(r)) return 'military.raid is not an object';
  if (r.enemies !== undefined && r.enemies !== null) {
    if (!Array.isArray(r.enemies)) return 'military.raid.enemies is not an array';
    for (let i = 0; i < r.enemies.length; i++) {
      const e = r.enemies[i];
      const at = 'military.raid.enemies[' + i + ']';
      if (!isObj(e)) return at + ' is not an enemy';
      if (!Number.isFinite(e.x) || !Number.isFinite(e.y) || !Number.isFinite(e.hp)) {
        return at + ' has a non-number position or hp';
      }
    }
  }
  return countsFault(r.loot, 'military.raid.loot');
}

/** A reason string if the save cannot be restored, otherwise ''. */
function saveFault(save) {
  if (!isObj(save)) return 'not a save object';
  // SAVE_VERSION is the whole point of writing a version: a blob from another
  // format is discarded, never coaxed into the current one.
  if (save.v !== SAVE_VERSION) return 'save version ' + save.v + ', this build reads ' + SAVE_VERSION;
  // Every section is written by serializeGame, so a missing one is a truncated
  // or hand-edited blob: restoring it would silently drop a whole module's
  // state (no buildings, no villagers) rather than fail.
  for (const f of ['world', 'buildings', 'villagers', 'economy', 'military']) {
    if (!isObj(save[f])) return 'no ' + f;
  }
  // world.restore() checks the nine tile layers itself, and returns false.
  return buildingsFault(save.buildings) || villagersFault(save.villagers)
    || economyFault(save.economy) || militaryFault(save.military);
}

function serializeGame(game) {
  const c = game.world.clock;
  const save = {
    v: SAVE_VERSION,
    seed: game.world.seed,
    clock: { day: c.day, timeOfDay: c.timeOfDay, season: c.season, year: c.year },
    world: game.world.serialize(),
    buildings: game.buildings.serialize(),
    villagers: game.villagers.serialize(),
    economy: game.economy.serialize(),
    military: game.military.serialize(),
    cam: { x: 0, y: 0, zoom: 1 },
    tickCount: game.tickCount,
    speed: game.speed,
    state: game.state,
  };
  if (game.input) {
    const s = game.input.serialize();
    save.cam = s.cam;
    save.input = s;
  }
  if (game.render) save.render = game.render.serialize();
  if (game.ui) save.ui = game.ui.serialize();
  return save;
}

/**
 * The FROZEN restore order (§14) from `paths.rebuild()` onward —
 * `world.restore()` has to happen before `init()` and so runs at the call
 * site. `villagers.postRestore()` goes after `economy.restore()` so in-flight
 * tasks are re-linked rather than dropped.
 */
function restoreRest(game, save) {
  game.paths.rebuild();
  game.buildings.restore(save.buildings, game);
  game.villagers.restore(save.villagers, game);
  game.economy.restore(save.economy, game);
  game.villagers.postRestore();
  game.military.restore(save.military, game);
  if (game.render && save.render) game.render.restore(save.render);
  if (game.ui && save.ui) game.ui.restore(save.ui);
  // Camera last: input.init() only auto-centres while cam is still at 0,0.
  if (game.input && save.input) game.input.restore(save.input);
  game.tickCount = save.tickCount || 0;
  game.economy.invalidateStock();
}

/**
 * Whole-game restore for a game that has not been init'd yet. Returns false,
 * without throwing, if the blob is unusable (§14). A `false` leaves the game
 * partly restored — the caller must throw it away, exactly as `startGame`
 * does, not step it.
 */
function restoreGame(game, save) {
  const fault = saveFault(save);
  if (fault) {
    console.warn('[hearthmere] save rejected:', fault);
    return false;
  }
  try {
    if (game.world.restore(save.world) === false) return false;
    initAll(game);
    restoreRest(game, save);
  } catch (err) {
    console.warn('[hearthmere] save restore failed:', err);
    return false;
  }
  game.state = save.state === 'gameover' ? 'gameover' : 'playing';
  // setSpeed re-derives 'paused' from a speed of 0, so state goes first.
  setSpeed(game, Number.isFinite(save.speed) ? save.speed : 1);
  return true;
}

function readSave() {
  if (typeof localStorage === 'undefined') return null;
  let raw;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch (err) {
    console.warn('[hearthmere] localStorage unreadable:', err);
    return null;
  }
  if (!raw) return null;
  return safeJsonParse(raw, null);
}

function dropSave() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    void err;
  }
}

function writeSave(game) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serializeGame(game)));
    return true;
  } catch (err) {
    console.warn('[hearthmere] autosave failed:', err);
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Browser bootstrap
 * ------------------------------------------------------------------ */

/** ADDENDUM B: the served shell's <title> is the literal string "Projects". */
function buildShell() {
  document.title = 'Hearthmere';

  if (!document.querySelector('link[data-hearthmere]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = CSS_HREF;
    link.setAttribute('data-hearthmere', '1');
    document.head.appendChild(link);
  }

  let canvas = document.getElementById(CANVAS_ID);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = CANVAS_ID;
    // CSS size only — render.js owns the backing store and the dpr transform,
    // and any transform or border here would break input.js picking (F3).
    canvas.style.position = 'fixed';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    document.body.appendChild(canvas);
  }
  return canvas;
}

function resolveSeed() {
  if (typeof window === 'undefined') return undefined;
  const q = new URLSearchParams(window.location.search).get('seed');
  if (q === null || q === '') return undefined;
  const n = Number(q);
  return Number.isFinite(n) ? n >>> 0 : undefined;
}

/**
 * Boots a playable game into the page. Returns the `game` object; a second
 * call tears the previous one down first, so a restart cannot stack listeners.
 */
let live = null;

export function startGame(options) {
  const o = options || {};
  if (live) {
    destroyGame(live);
    live = null;
  }

  const canvas = buildShell();
  const game = makeGame({ canvas: canvas, ctx: canvas.getContext('2d') });
  const seed = o.seed !== undefined ? o.seed : resolveSeed();

  // A save is only attempted when the caller did not ask for a specific seed:
  // `?seed=N` means "show me this valley", not "resume something else".
  const save = o.fresh || seed !== undefined ? null : readSave();
  let restored = false;
  let rejected = false;

  if (save) {
    // world.restore() replaces the whole map, so it runs before init(): every
    // module that reads world.seed or world.start in init() must see the
    // restored values, not a freshly generated valley's.
    const fault = saveFault(save);
    if (fault) {
      console.warn('[hearthmere] save rejected:', fault);
    } else {
      try {
        restored = game.world.restore(save.world) !== false;
      } catch (err) {
        console.warn('[hearthmere] save rejected:', err);
      }
    }
    // Nothing has been applied yet, so this valley is simply generated fresh —
    // but the save must go, or the same blob is re-read and re-rejected on
    // every visit (§14).
    if (!restored) {
      rejected = true;
      dropSave();
    }
  }
  if (!restored) game.world.generate(seed);

  initAll(game);

  if (restored) {
    let ok = false;
    try {
      restoreRest(game, save);
      ok = true;
    } catch (err) {
      console.warn('[hearthmere] save restore failed:', err);
    }
    if (!ok) {
      // §14: a save that fails to restore is discarded with a toast, never a
      // crash. Half of it is already applied, so the whole game goes with it.
      dropSave();
      destroyGame(game);
      live = null;
      const fresh = startGame({ fresh: true, seed: seed });
      fresh.bus.emit('toast', { text: SAVE_DROPPED_TEXT, kind: 'warn' });
      return fresh;
    }
  } else {
    seedTown(game);
  }

  setSpeed(game, save && save.speed > 0 ? save.speed : 1);
  game.state = 'playing';

  attachLoop(game);
  live = game;
  if (typeof window !== 'undefined') window.hearthmere = game;
  // After attachLoop, so ui.js is listening for it.
  if (rejected) game.bus.emit('toast', { text: SAVE_DROPPED_TEXT, kind: 'warn' });
  return game;
}

/** The rAF loop, the resize handler and the autosave timer. */
function attachLoop(game) {
  let last = now();
  let sinceSave = 0;

  const onResize = () => {
    if (game.render) game.render.resize();
    if (game.input) game.input.resize();
  };

  const onDay = () => { writeSave(game); sinceSave = 0; };
  const onGameOver = () => { game.state = 'gameover'; game.speed = 0; };

  const unsubs = [
    game.bus.on('day:ended', onDay),
    game.bus.on('game:over', onGameOver),
  ];

  const frame = () => {
    if (game.disposed) return;
    game.raf = requestAnimationFrame(frame);

    const t = now();
    let real = (t - last) / 1000;
    last = t;
    if (!(real > 0)) real = 0;
    // A backgrounded tab hands back one enormous delta. Capping the real
    // delta as well as the game delta keeps the autosave clock honest.
    if (real > 1) real = 1;

    // The camera runs on wall-clock time so it still pans while paused.
    if (game.input) game.input.update();

    if (game.state === 'playing' && game.speed > 0) {
      let dt = real * game.speed;
      if (dt > MAX_STEP) dt = MAX_STEP;
      game.realTime += real;
      sinceSave += real;
      step(game, dt);
    } else {
      // Paused and game-over still need a frame drawn, and ui.js polls the
      // selection every update — so the readers run with dt 0.
      if (game.particles) game.particles.update(0, game);
      if (game.render) game.render.update(0, game);
      if (game.ui) game.ui.update(0, game);
    }

    if (sinceSave >= AUTOSAVE_SECONDS && game.state === 'playing') {
      sinceSave = 0;
      writeSave(game);
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', onResize);
    game._onResize = onResize;
  }
  game._unsubs = unsubs;

  // One resize after the canvas has layout: input's viewW/viewH come from
  // clientWidth/clientHeight, and 0 locks the camera to the map centre.
  onResize();
  if (game.input) {
    game.input.resize();
    if (game.world.start) game.input.centreOnTile(game.world.start.x + 0.5, game.world.start.y + 0.5);
  }

  game.raf = requestAnimationFrame(frame);
}

export function destroyGame(game) {
  if (!game || game.disposed) return;
  game.disposed = true;
  if (game.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(game.raf);
  if (game._unsubs) for (let i = 0; i < game._unsubs.length; i++) game._unsubs[i]();
  if (game._onResize && typeof window !== 'undefined') {
    window.removeEventListener('resize', game._onResize);
  }
  if (game.ui) game.ui.destroy();
  if (game.input) game.input.destroy();
  if (game.render) game.render.dispose();
  if (game.particles) game.particles.destroy();
  if (game.military) game.military.dispose();
  if (game.villagers) game.villagers.dispose();
  game.bus.clear();
}

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

/* ------------------------------------------------------------------ *
 * Headless harness (§18)
 * ------------------------------------------------------------------ */

/**
 * A fully wired simulation with no DOM and no render/ui/input/particles.
 * `opts`: `{seed, boot: false}` to skip the Town Centre boot, `{dt}` to change
 * the fixed step `stepHeadless` uses.
 */
export function createHeadlessGame(opts) {
  const o = opts || {};
  const game = makeGame({ headless: true });
  game.world.generate(o.seed);
  initAll(game);
  if (o.boot !== false) seedTown(game);
  game.state = 'playing';
  // startGame() flips state on `game:over` via its own listener; a headless
  // game has none, so QA harnesses read 'playing' on a dead town.
  game.bus.on('game:over', () => { game.state = 'gameover'; game.speed = 0; });
  game.speed = 1;
  game.dt = o.dt > 0 ? o.dt : HEADLESS_DT;
  return game;
}

/** Runs `seconds` of game time at a fixed step. Returns the steps taken. */
export function stepHeadless(game, seconds) {
  const dt = game.dt > 0 ? game.dt : HEADLESS_DT;
  const n = Math.max(0, Math.round(seconds / dt));
  for (let i = 0; i < n; i++) {
    if (game.state === 'gameover') break;
    step(game, dt);
  }
  return n;
}

/** Exposed so QA can exercise the §14 round trip without a browser. */
export { serializeGame, restoreGame, saveFault, makeGame, initAll, seedTown, step };

/* ------------------------------------------------------------------ *
 * Auto-start. `static/shared/appinit.js` imports this module dynamically, so
 * the body may or may not exist yet by the time it evaluates.
 * ------------------------------------------------------------------ */

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.body) startGame();
  else document.addEventListener('DOMContentLoaded', () => startGame(), { once: true });
}

export { GRID_W, GRID_H, DAY_SECONDS };
