// Driftworks - entry point. Overrun-style bootstrap: injects its own
// stylesheet + canvas, owns the game loop and state machine
// ('start' -> 'playing' <-> 'paused' -> 'gameover'), and wires the
// simulation, camera/input, DOM UI, and particle layers together. No p5 -
// plain canvas 2D and native ES modules, per the shared appinit.js loader
// contract (registered without a `p5/` path so no p5.js is injected).
import { Simulation } from './simulation.js';
import { BUILDING_DEFS } from './buildings.js';
import {
  createCamera, centerCameraOnGrid, drawWorld, TILE_SIZE,
} from './render.js';
import { InputController, BULLDOZE_TOOL } from './input.js';
import { UI } from './ui.js';
import { ParticleSystem } from './particles.js';

const BEST_SCORE_KEY = 'driftworks_best';
const INTRO_SEEN_KEY = 'driftworks_seen_intro';
const AUTOSAVE_INTERVAL = 8; // seconds

// --- DOM bootstrap ----------------------------------------------------------
const styleLink = document.createElement('link');
styleLink.rel = 'stylesheet';
styleLink.href = '/static/driftworks/driftworks.css';
document.head.appendChild(styleLink);

const canvas = document.createElement('canvas');
canvas.id = 'driftworks-canvas';
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// --- Best score persistence -------------------------------------------------
// simulation.js's save() is documented to also persist a best score under
// this same key; main.js additionally guards the comparison itself here so
// the HUD/start-screen readout is correct even if that detail differs.
function loadBestScore() {
  try {
    const raw = localStorage.getItem(BEST_SCORE_KEY);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}
function saveBestScore(score) {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // localStorage unavailable (private mode etc) - best score just won't persist.
  }
}

// --- First-time "How to Play" gating ----------------------------------
function hasSeenIntro() {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}
function markIntroSeen() {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    // localStorage unavailable (private mode etc) - intro just reshows next time.
  }
}

// --- Shared state ------------------------------------------------------
// Passed by reference into InputController (which mutates camera/selection/
// hover) and read by the render/UI loop each frame.
const state = {
  status: 'start', // 'start' | 'playing' | 'paused' | 'gameover'
  simulation: null,
  camera: createCamera(),
  selectedBuildingType: null,
  ghostRotation: 0,
  hoverTile: null,
  particles: new ParticleSystem(),
  lastSnapshot: null,
  prevMeta: null,
  time: 0,
  autosaveTimer: AUTOSAVE_INTERVAL,
};

// --- UI + input wiring -------------------------------------------------
const ui = new UI({
  onPlay: () => {
    startGame();
    // Gated on a localStorage flag so it only ever auto-shows once, on a
    // player's first-ever Play click; the HUD's "?" button reopens it any
    // time regardless of this flag.
    if (!hasSeenIntro()) {
      markIntroSeen();
      ui.showHowToPlay();
    }
  },
  onPlayAgain: () => startGame(),
  onPause: () => setPaused(true),
  onResume: () => setPaused(false),
  onSelectBuilding: (type) => input.selectBuilding(type),
  onUnlockTech: (id) => state.simulation?.economy.unlockTech(id),
});

const input = new InputController(canvas, state, {
  onSelectionChanged: (type) => ui.setSelectedBuilding(type),
  onPlaced: (x, y) => {
    state.particles.placementPop((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE);
  },
  onPlacementRejected: (x, y) => {
    state.particles.placementRejected((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE);
  },
  onRemoved: () => {},
});

function setPaused(paused) {
  if (!state.simulation || state.status === 'gameover') return;
  state.status = paused ? 'paused' : 'playing';
  ui.setStatus(state.status);
}

function startGame() {
  state.simulation = new Simulation(Date.now());
  state.camera = createCamera();
  centerCameraOnGrid(state.camera, canvas);
  state.selectedBuildingType = null;
  state.ghostRotation = 0;
  state.hoverTile = null;
  state.particles = new ParticleSystem();
  state.lastSnapshot = state.simulation.getSnapshot();
  state.prevMeta = null;
  state.time = 0;
  state.autosaveTimer = AUTOSAVE_INTERVAL;
  state.status = 'playing';
  ui.setSelectedBuilding(null);
  ui.setStatus('playing');
}

function triggerGameOver(snapshot) {
  state.simulation.save();
  const score = snapshot.score ?? 0;
  let best = loadBestScore();
  let isNewBest = false;
  if (score > best) {
    best = score;
    isNewBest = true;
    saveBestScore(best);
  }
  state.status = 'gameover';
  ui.setStatus('gameover', { score, bestScore: best, isNewBest });
}

// --- Placement ghost preview ---------------------------------------------
// Reads only documented Simulation surface: this.grid / this.economy are
// assigned directly in the Simulation constructor per the contract, and
// Grid.getTile/isLand + Economy.canAfford are part of their documented APIs.
function computeGhost() {
  if (state.status !== 'playing' || !state.hoverTile || !state.selectedBuildingType) return null;
  const { x, y } = state.hoverTile;
  const { grid, economy } = state.simulation;

  if (state.selectedBuildingType === BULLDOZE_TOOL) {
    const tile = grid.getTile(x, y);
    return { tool: 'bulldoze', x, y, valid: !!(tile && tile.building) };
  }

  const type = state.selectedBuildingType;
  const def = BUILDING_DEFS[type];
  const tile = grid.getTile(x, y);
  const rotation = state.ghostRotation;
  const onLand = !!tile && grid.isLand(x, y);
  const existing = onLand ? tile.building : null;

  if (existing && existing.type === type) {
    // Same building type already on this tile: identical rotation is a
    // no-op (shown the same as any other "can't place here" tile), a
    // different rotation is a free in-place reorient - always valid since
    // nothing is being bought, no cost/tier gate applies.
    const sameRotation = existing.rotation === rotation;
    return {
      type, x, y, rotation, mode: sameRotation ? 'place' : 'reorient', valid: !sameRotation,
    };
  }

  if (existing) {
    // A different building type occupies this tile. Only a belt is cheap
    // enough to allow a one-click replace (no refund for the old one, and
    // it still needs the normal tier-unlock/affordability checks a fresh
    // placement needs); anything more valuable is blocked here so it shows
    // as invalid - the player must Remove it explicitly first.
    if (existing.type !== 'belt') {
      return {
        type, x, y, rotation, mode: 'replace', valid: false, blockedProtected: true,
      };
    }
    const valid = onLand && def.tier <= economy.getMaxBuildingTier(type) && economy.canAfford(def.cost);
    return {
      type, x, y, rotation, mode: 'replace', valid,
    };
  }

  const valid = onLand && economy.canAfford(def.cost);
  return {
    type, x, y, rotation, mode: 'place', valid,
  };
}

// --- Event detection for particle "juice" -------------------------------
// The documented getSnapshot() shape has no discrete event log, so juice
// events (quota fulfilled/missed, a delivery landing, a tile finishing
// erosion) are inferred by diffing consecutive snapshots. A quota's
// per-item delivered progress isn't named explicitly in the contract, so a
// few plausible field names are checked with a safe fallback to 0.
function findDockWorldPos(snapshot) {
  const dock = (snapshot.buildings || []).find((b) => b.type === 'dock');
  if (!dock) return null;
  return [(dock.x + 0.5) * TILE_SIZE, (dock.y + 0.5) * TILE_SIZE];
}

function buildTileTypeMap(snapshot) {
  const map = new Map();
  for (const row of snapshot.tiles || []) {
    for (const tile of row) {
      if (tile) map.set(`${tile.x},${tile.y}`, tile.type);
    }
  }
  return map;
}

function quotaDelivered(quota) {
  if (!quota) return 0;
  return quota.delivered ?? quota.progress ?? quota.deliveredQty ?? 0;
}

function processSnapshotEvents(prevMeta, snapshot) {
  const economy = snapshot.economy || {};
  const quota = economy.currentQuota;
  const fulfilled = economy.quotasFulfilled ?? 0;
  const strikes = economy.strikes ?? 0;
  const delivered = quotaDelivered(quota);
  const tileTypes = buildTileTypeMap(snapshot);

  if (prevMeta) {
    const dockPos = findDockWorldPos(snapshot);
    if (fulfilled > (prevMeta.fulfilled ?? 0) && dockPos) {
      state.particles.quotaFulfilled(dockPos[0], dockPos[1], prevMeta.rewardTechPoints ?? 0);
    } else if (strikes > (prevMeta.strikes ?? 0) && dockPos) {
      state.particles.quotaMissed(dockPos[0], dockPos[1]);
    } else if (delivered > (prevMeta.delivered ?? 0) && dockPos) {
      state.particles.deliverySparkle(dockPos[0], dockPos[1]);
    }

    for (const [key, prevType] of prevMeta.tileTypes) {
      if (prevType === 'land' && tileTypes.get(key) === 'water') {
        const [gx, gy] = key.split(',').map(Number);
        state.particles.crumble((gx + 0.5) * TILE_SIZE, (gy + 0.5) * TILE_SIZE);
      }
    }
  }

  return {
    fulfilled, strikes, delivered, tileTypes, rewardTechPoints: quota?.rewardTechPoints ?? 0,
  };
}

// --- Update / draw -----------------------------------------------------
function update(dt) {
  if (state.status !== 'playing') return;

  state.simulation.tick(dt);
  const snapshot = state.simulation.getSnapshot();
  state.lastSnapshot = snapshot;
  state.prevMeta = processSnapshotEvents(state.prevMeta, snapshot);
  state.particles.update(dt);
  ui.update(snapshot, computeGhost());

  state.autosaveTimer -= dt;
  if (state.autosaveTimer <= 0) {
    state.autosaveTimer = AUTOSAVE_INTERVAL;
    state.simulation.save();
  }

  if (snapshot.gameOver) triggerGameOver(snapshot);
}

function draw() {
  if (state.status === 'start' || !state.lastSnapshot) {
    ctx.fillStyle = '#04121c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const ghost = computeGhost();
  drawWorld(ctx, canvas, state.camera, state.lastSnapshot, {
    ghost, time: state.time, particles: state.particles,
  });
}

// --- Main loop ---------------------------------------------------------------
let lastTime = performance.now();
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  if (state.status === 'playing') state.time += dt;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

ui.setStatus('start', { bestScore: loadBestScore() });
requestAnimationFrame(loop);
