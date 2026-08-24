// Wildergrove - entry point. Bootstraps the page the same way
// static/driftworks/main.js does (inject stylesheet + canvas, own the game
// loop and state machine, wire every module together, localStorage
// autosave), per the frozen design contract at the top of this project.
//
// Out of scope for v1 (per the contract - noted here, not built): combat/
// enemies, an NPC merchant/economy, multiplayer, mobile touch controls.
// Those are ideas for a future pass, not gaps to fill in this one.
import {
  createCamera, centerCameraOnWorld, drawTerrain, drawFarmPlots, drawResourceNodes,
  drawBuildings, drawMineFloor, drawMineExit, drawMineFog, drawPlayer, drawNPC, drawDayNightTint,
  TILE_SIZE, WORLD_W, WORLD_H, PALETTE,
} from './render.js';
import { InputController } from './input.js';
import {
  createPlayer, movePlayer, regenTick, updateBuffs, refillWater,
} from './player.js';
import { World, HOME_SPAWN, MINE_TILE } from './world.js';
import { createInventory } from './inventory.js';
import { createFarming } from './farming.js';
import { useSelectedOn, craftRecipe, cookRecipe, eatFood } from './actions.js';
import { createBuilding, BUILDING_DEFS } from './buildings.js';
import { createQuestTracker, NPCS } from './quests.js';
import { WildergroveUI } from './ui.js';
import { ParticleSystem } from './particles.js';
import {
  createEventBus, safeGetJSON, safeSetJSON, safeRemove,
} from './utils.js';
import { RECIPES, ITEMS } from './items.js';

const SAVE_KEY = 'wildergrove_save';
const AUTOSAVE_INTERVAL = 10; // seconds, per the contract
const DAY_LENGTH_SEC = 240; // 4 real minutes per in-game day
const TRANSITION_COOLDOWN = 0.75; // seconds of immunity after a mine enter/exit teleport
const TORCH_BURN_DURATION = 90; // seconds of light per torch consumed
const TORCH_VISION_RADIUS_TILES = 7;
const NO_TORCH_VISION_RADIUS_TILES = 3.5;
const INTRO_SEEN_KEY = 'wildergrove_seen_intro';

// --- First-time "How to Play" gating -----------------------------------
// Same pattern as static/driftworks/main.js: shown once ever per browser on
// the player's first-ever game start, regardless of whether that start
// loaded an existing save. The HUD's '?' button (ui.js) reopens it any time
// regardless of this flag.
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

// --- DOM bootstrap -----------------------------------------------------
const styleLink = document.createElement('link');
styleLink.rel = 'stylesheet';
styleLink.href = '/static/wildergrove/wildergrove.css';
document.head.appendChild(styleLink);

const canvas = document.createElement('canvas');
canvas.id = 'wildergrove-canvas';
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// --- Event bus -----------------------------------------------------------
// Created once and handed to every module that needs it, per the contract
// (never a module-level singleton inside those modules themselves).
const eventBus = createEventBus();

// --- Shared state --------------------------------------------------------
// world/inventory/farming/quests/player are (re)created in startGame() and
// hung off `state`, mirroring driftworks' `state.simulation` pattern - every
// closure below reads them off `state` rather than capturing a `let` binding
// that startGame would need to reassign.
const state = {
  status: 'start', // 'start' | 'playing' | 'paused'
  location: 'overworld', // 'overworld' | 'mine'
  mineLevelIndex: 0,
  world: null,
  inventory: null,
  farming: null,
  quests: null,
  player: null,
  particles: null,
  camera: createCamera(),
  placementBuildingType: null, // building id while ui.js's build palette has one selected
  demolishMode: false, // true while the Build panel's Demolish toggle is active
  time: 0,
  day: 1,
  dayTimer: 0,
  autosaveTimer: AUTOSAVE_INTERVAL,
  transitionCooldown: 0,
  // Seconds of light left on the currently-lit torch, only ticking down
  // while state.location === 'mine' (see update()). Starts unlit (0) so
  // stepping into the mine always consumes a torch on the very first frame
  // rather than granting a free head start - confirmed player-requested
  // design: torches should genuinely limit how far/long you can safely
  // explore, not just passively check "do you own one."
  torchBurnRemaining: 0,
  // True while the player is still standing on the tile that caused the
  // last mine enter/exit (the cave_entrance node, or the landing spot right
  // on top of it after climbing back up) - see checkLocationTransitions.
  onTransitionTile: false,
};

// --- NPC lookup ------------------------------------------------------------
// NPCs are stationary overworld fixtures (quests.js's NPCS, fixed grid
// coords) - never present in the mine.
function getNpcAt(gx, gy) {
  if (state.location !== 'overworld') return null;
  return NPCS.find((n) => n.x === gx && n.y === gy) || null;
}

// --- Mine world facade -----------------------------------------------------
// The design contract's isTileFree/isTileFarmable/getBuildingAt/getNodeAt/
// harvestNode signatures are specified purely in overworld terms - world.js
// deliberately exposes a parallel, explicitly-named mine method set instead
// of an implicit "current location" mode (see world.js's own comment on
// generateMine). actions.js's dispatch code only ever calls the five
// documented methods on `ctx.world`, so rather than teach it two modes, this
// wraps the mine's methods behind that exact same five-method shape - the
// dispatch logic runs unmodified in both places, and grants no buildings
// (placeBuilding always fails - buildings.js can't afford anything with
// nowhere to put it) and no farming (isTileFarmable always false - there's
// no soil underground) in the mine, which is the sane default nothing in
// the contract contradicts.
// isDirtAt/clearMineDirt are additive beyond the contract's original five -
// packed dirt overburden (world.js's MINE_TILE.DIRT) only exists in the
// mine, so the overworld World instance has no equivalent and actions.js
// checks `typeof world.isDirtAt === 'function'` before ever calling these.
function makeMineWorldFacade(world, levelIndex) {
  return {
    isTileFree: (x, y) => world.isMineTileFree(levelIndex, x, y),
    isTileFarmable: () => false,
    getBuildingAt: () => null,
    getNodeAt: (x, y) => world.getMineNodeAt(levelIndex, x, y),
    harvestNode: (x, y, toolTier, bonusPower) => world.harvestMineNode(levelIndex, x, y, toolTier, bonusPower),
    placeBuilding: () => false,
    isDirtAt: (x, y) => world.getMineTile(levelIndex, x, y) === MINE_TILE.DIRT,
    clearMineDirt: (x, y) => world.clearMineDirt(levelIndex, x, y),
  };
}

function activeWorld() {
  const { world } = state;
  return state.location === 'mine' ? makeMineWorldFacade(world, state.mineLevelIndex) : world;
}

function isTileFreeForMovement(gx, gy) {
  return state.location === 'mine'
    ? state.world.isMineTileFree(state.mineLevelIndex, gx, gy)
    : state.world.isTileFree(gx, gy);
}

function buildActionCtx() {
  const slot = state.inventory.slots[input.selectedSlot] || null;
  return {
    player: state.player,
    world: activeWorld(),
    inventory: state.inventory,
    farming: state.farming,
    selectedItem: slot ? slot.item : null,
    placementMode: state.placementBuildingType,
    eventBus,
    getNpcAt,
    now: state.time,
  };
}

// Torches actually burn down now instead of just being checked for
// ownership - confirmed player-requested change so carrying enough torches
// for an expedition (and knowing when to turn back) becomes a real
// decision. Only ticks in the mine; the surface never needs light. Tries to
// consume a fresh torch the instant the current one runs out (or the very
// first frame underground, since torchBurnRemaining starts at 0 - see
// enterMine) so picking up/crafting a torch mid-delve relights immediately
// rather than needing some separate "use torch" input.
function updateTorchBurn(dt) {
  if (state.location !== 'mine') return;
  state.torchBurnRemaining -= dt;
  if (state.torchBurnRemaining > 0) return;
  if (state.inventory.removeItem('torch', 1)) {
    state.torchBurnRemaining = TORCH_BURN_DURATION;
  } else {
    state.torchBurnRemaining = 0; // stay dark - checked again next frame in case one's found
  }
}

// --- Mine transitions -------------------------------------------------
// Walking onto (checked every frame in update()) or clicking the
// cave_entrance node enters the mine; walking onto/clicking the mine
// level's exit tile returns to the overworld. Only one mine level exists
// today (generated once, then reused) - see world.js's MINE_LEVELS comment
// on why it's structured as an array for a future level 2.
function enterMine() {
  let level = state.world.getMineLevel(0);
  if (!level) level = state.world.generateMine(Date.now());
  state.location = 'mine';
  state.mineLevelIndex = 0;
  state.player.x = (level.entrance.x + 0.5) * TILE_SIZE;
  state.player.y = (level.entrance.y + 0.5) * TILE_SIZE;
  centerCameraOnWorld(state.camera, canvas, state.player.x, state.player.y);
  state.transitionCooldown = TRANSITION_COOLDOWN;
  // Always unlit on entry (see the field's own doc comment) - re-entering
  // after climbing out costs a fresh torch, same as the first descent.
  state.torchBurnRemaining = 0;
  // See checkLocationTransitions: the player lands exactly on the mine's
  // entrance tile, which double as valid ground - without this latch,
  // standing still for TRANSITION_COOLDOWN would walk them straight back
  // out again on its own.
  state.onTransitionTile = true;
  eventBus.emit('mine_entered', {});
  ui.showMessage('You duck into the mine.');
}

function exitMine() {
  state.location = 'overworld';
  const spot = state.world.caveEntrance || HOME_SPAWN;
  // Landing exactly back on the cave_entrance tile is safe (it's a
  // non-blocking node per world.js's NODE_DEFS, so it's always walkable) -
  // unlike offsetting by a fixed direction, which risks landing on whatever
  // resource node/building happens to have generated/been built next to the
  // entrance. state.onTransitionTile (see checkLocationTransitions) is what
  // stops that landing spot from immediately re-triggering enterMine() -
  // transitionCooldown alone only delays that, it doesn't prevent it, since
  // a player who just stands there after climbing out would otherwise get
  // pulled straight back in the moment the cooldown expires.
  state.player.x = spot.x * TILE_SIZE + TILE_SIZE / 2;
  state.player.y = spot.y * TILE_SIZE + TILE_SIZE / 2;
  centerCameraOnWorld(state.camera, canvas, state.player.x, state.player.y);
  state.transitionCooldown = TRANSITION_COOLDOWN;
  state.onTransitionTile = true;
  eventBus.emit('mine_exited', {});
  ui.showMessage('You climb back up to the surface.');
}

function checkLocationTransitions() {
  const gx = Math.floor(state.player.x / TILE_SIZE);
  const gy = Math.floor(state.player.y / TILE_SIZE);
  const onTransitionTile = state.location === 'overworld'
    ? (() => {
      const node = state.world.getNodeAt(gx, gy);
      return !!node && node.type === 'cave_entrance';
    })()
    : state.world.isMineExit(state.mineLevelIndex, gx, gy);

  if (!onTransitionTile) {
    state.onTransitionTile = false; // stepped off - future arrivals here can trigger again
    return;
  }
  // Still standing on the tile that caused the last transition (walked here,
  // or was just placed here by enterMine/exitMine) - require stepping off
  // before walking onto it can fire again, otherwise the player would
  // ping-pong between the mine and the surface every time the cooldown below
  // runs out while they stand still.
  if (state.onTransitionTile) return;
  if (state.transitionCooldown > 0) return;

  state.onTransitionTile = true;
  if (state.location === 'overworld') enterMine(); else exitMine();
}

// --- Crafting stations ------------------------------------------------
// Which stations the player is currently close enough to use - drives both
// ui.js's per-frame snapshot (which recipes/dishes look enabled) and this
// file's own re-check before actually running a craft/cook (ui.js already
// disables the button, but a stale click shouldn't slip through).
const STATION_KEY_BY_BUILDING = {
  campfire: 'campfire', crafting_bench: 'bench', forge: 'forge', potter_wheel: 'pottery',
};
const STATION_RADIUS = 2;

function computeNearStations() {
  const near = {
    campfire: false, bench: false, forge: false, pottery: false,
  };
  if (state.location !== 'overworld') return near; // no stations underground
  const px = Math.floor(state.player.x / TILE_SIZE);
  const py = Math.floor(state.player.y / TILE_SIZE);
  for (let dy = -STATION_RADIUS; dy <= STATION_RADIUS; dy += 1) {
    for (let dx = -STATION_RADIUS; dx <= STATION_RADIUS; dx += 1) {
      const building = state.world.getBuildingAt(px + dx, py + dy);
      const key = building && STATION_KEY_BY_BUILDING[building.type];
      if (key) near[key] = true;
    }
  }
  return near;
}

// --- UI wiring ------------------------------------------------------------
const ui = new WildergroveUI({
  // Fires both for a HUD hotbar button (index 0-8) and for clicking a
  // non-food slot anywhere in the full inventory panel (index may be >8) -
  // either way it's "make this the selected/active item", so it goes through
  // input.js's one selectSlot() (now uncapped - see its doc comment) rather
  // than main.js needing its own parallel notion of "selected item".
  onSelectHotbarSlot: (index) => {
    input.selectSlot(index);
    // Selecting a real inventory slot always exits placement mode - you're
    // switching what you're holding, not still placing the last building.
    setPlacementMode(null);
    exitDemolishMode();
  },
  onEatFood: (itemId) => {
    if (state.status !== 'playing') return;
    if (!eatFood(itemId, buildActionCtx())) ui.showMessage("You can't eat that.");
  },
  onCraft: (recipeId) => {
    if (state.status !== 'playing') return;
    const recipe = RECIPES[recipeId];
    if (recipe && recipe.station !== 'hand' && !computeNearStations()[recipe.station]) {
      ui.showMessage('You need to be near the right station for that.');
      return;
    }
    if (!craftRecipe(recipeId, buildActionCtx())) ui.showMessage('Missing materials.');
  },
  onCook: (recipeId) => {
    if (state.status !== 'playing') return;
    if (!computeNearStations().campfire) {
      ui.showMessage('You need to be near a campfire to cook.');
      return;
    }
    if (!cookRecipe(recipeId, buildActionCtx())) ui.showMessage('Missing ingredients.');
  },
  onSelectBuildingToPlace: (id) => {
    if (state.status !== 'playing') return;
    setPlacementMode(id);
    exitDemolishMode();
  },
  onDialogClosed: () => {},
  // Confirmed player-requested: previously the only way to get a buried
  // item onto the hotbar was clicking it to "select" it, not actually
  // relocate it. inventory.js's moveSlot decides swap/merge/plain-move.
  onMoveItem: (from, to) => {
    if (state.status !== 'playing') return;
    state.inventory.moveSlot(from, to);
  },
  onNewGame: () => {
    if (state.status !== 'playing' && state.status !== 'paused') return;
    // A plain confirm is the simplest safe guard against an accidental
    // click erasing real progress; a custom modal is more polish than this
    // warrants right now.
    if (!window.confirm('Start a new game? This will erase your current save.')) return;
    safeRemove(SAVE_KEY);
    window.location.reload();
  },
  // Confirmed missing entirely via playtesting: world.js already had a
  // removeBuilding() that no input path ever called. Demolish is its own
  // mode (mutually exclusive with placement, see exitDemolishMode/the
  // placement callbacks above) rather than a per-building action, so one
  // toggle click then a plain tile click removes whatever's there.
  onToggleDemolish: () => {
    if (state.status !== 'playing') return;
    state.demolishMode = !state.demolishMode;
    if (state.demolishMode && state.placementBuildingType) {
      setPlacementMode(null);
    }
    ui.setDemolishActive(state.demolishMode);
  },
});

function exitDemolishMode() {
  if (!state.demolishMode) return;
  state.demolishMode = false;
  ui.setDemolishActive(false);
}

// Single point of truth for entering/exiting placement mode - confirmed
// player feedback that it was easy to wander off still "holding" a building
// (fence's repeatable mode especially) with no visible reminder, then be
// confused when a click elsewhere (e.g. mining) tried to place it instead.
// Every site that used to assign state.placementBuildingType directly now
// goes through this, so the banner/palette highlight can never drift out of
// sync with the actual mode the way scattered assignments risked.
function setPlacementMode(buildingId) {
  state.placementBuildingType = buildingId;
  ui.setSelectedBuilding(buildingId);
  ui.setPlacementBanner(buildingId ? (BUILDING_DEFS[buildingId]?.name ?? buildingId) : null);
}

const input = new InputController(canvas, state.camera, {
  onTileClick: (gx, gy) => {
    if (state.status !== 'playing') return;

    // Mine entrance/exit are shortcuts checked ahead of the normal
    // dispatch, same as the walking-onto check in update() - neither is a
    // harvestable "node" action, so actions.js's useSelectedOn wouldn't do
    // anything useful with them on its own.
    // Demolish is checked ahead of everything else - it's a distinct mode
    // from normal tool/placement use, only ever meaningful in the overworld
    // (the mine has no buildings).
    if (state.demolishMode) {
      if (state.location === 'overworld') {
        const removed = state.world.removeBuilding(gx, gy);
        if (removed) {
          ui.showMessage(`Demolished ${BUILDING_DEFS[removed.type]?.name ?? removed.type}.`);
        } else {
          ui.showMessage('Nothing to demolish there.');
        }
      }
      return;
    }

    if (state.location === 'overworld') {
      const node = state.world.getNodeAt(gx, gy);
      if (node && node.type === 'cave_entrance') { enterMine(); return; }
      if (node && !state.placementBuildingType) {
        state.particles.emit('hit', (gx + 0.5) * TILE_SIZE, (gy + 0.5) * TILE_SIZE);
      }
    } else if (state.world.isMineExit(state.mineLevelIndex, gx, gy)) {
      exitMine();
      return;
    }

    const wasPlacing = state.placementBuildingType;
    const acted = useSelectedOn(gx, gy, buildActionCtx());
    // Fence (repeatable: true in buildings.js) stays in placement mode after
    // a successful placement instead of exiting - confirmed player feedback
    // that fences are laid down in runs, not one at a time. Every other
    // building keeps the original one-and-done behavior.
    if (wasPlacing && acted && !BUILDING_DEFS[wasPlacing]?.repeatable) {
      setPlacementMode(null);
    }
  },
  onCancel: () => {
    setPlacementMode(null);
    exitDemolishMode();
  },
  onHotbarSelect: () => {
    setPlacementMode(null);
    exitDemolishMode();
  },
});

eventBus.on('npc_talked', ({ npcId }) => {
  const npc = NPCS.find((n) => n.id === npcId);
  if (npc) ui.showNpcDialog({ ...npc, lines: buildNpcLines(npc) });
});

// Confirmed player feedback: Elder Rin replayed the exact same 5-line
// introduction every single time you talked to her, forever, with zero
// acknowledgment of what you'd actually done. Her static npc.lines (quests.js)
// are now only the first-ever introduction; every conversation after
// talk_to_elder completes gets a short, quest-state-aware line instead,
// built here since main.js is the one place with a live quest tracker.
function buildNpcLines(npc) {
  if (npc.id !== 'elder_rin' || !state.quests.isCompleted('talk_to_elder')) return npc.lines;
  const next = getNextChainQuest();
  if (!next) {
    return ["You've done more for this valley than I ever managed alone. My thanks, truly - Wildergrove is lucky to have you."];
  }
  return [
    "Good to see you again. You've been busy, I can tell.",
    next.description,
  ];
}

// The tutorial chain branches now (build_campfire alone unlocks four
// quests in parallel - see quests.js's own comment on why), so this can no
// longer walk a single linear "next" thread by prereq id; instead it just
// takes the first currently-active main-chain quest in QUEST_DEFS order,
// filtering out the non-chaining "Elder's Request" bounty quests (all
// `er_`-prefixed) since those would make "the next thing to do" ambiguous
// and aren't what Elder Rin's dialogue is meant to nudge toward.
function getNextChainQuest() {
  return state.quests.getActiveQuests().find((q) => !q.id.startsWith('er_')) || null;
}

eventBus.on('sleep_requested', () => advanceDay());

// actions.js's soft-blocks (not enough stamina, wrong tool tier, invalid
// placement) report themselves here per the contract's "soft-blocked (with
// a UI message, not a hard crash)" requirement - actions.js stays free of
// any direct ui.js import by going through the shared bus instead.
eventBus.on('action_blocked', ({ message }) => {
  if (message) ui.showMessage(message);
});

eventBus.on('building_placed', ({ x, y }) => {
  state.particles.emit('harvest', (x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE);
});

// Confirmed player-requested convenience: clicking a station building opens
// its matching menu directly rather than doing nothing. Buildings with no
// menu (fence/signpost/bridge) or their own onUse (bed) just fall through -
// chest opens Inventory since that's the building's whole purpose.
const PANEL_OPENER_BY_BUILDING = {
  campfire: () => ui.openCooking(),
  crafting_bench: () => ui.openCrafting(),
  forge: () => ui.openCrafting(),
  potter_wheel: () => ui.openCrafting(),
  chest: () => ui.openInventory(),
};
eventBus.on('building_clicked', ({ type }) => {
  PANEL_OPENER_BY_BUILDING[type]?.();
});

// Confirmed player feedback: no harvest gave any feedback about what you
// actually got - silent unless the inventory happened to be full. This is
// especially confusing for rock's random bonus coal drop, which otherwise
// has no indication it even happened. A short toast for every harvest
// (mirroring actions.js's own "lost N X" overflow messages) fixes both at
// once: the ordinary case now confirms what you picked up, and the bonus
// case makes coal's existence visible instead of a mystery.
function showPickupToast(item, qty) {
  if (!qty) return;
  ui.showMessage(`+${qty} ${ITEMS[item]?.name ?? item}`, 1400);
}
eventBus.on('resource_harvested', ({ item, qty }) => showPickupToast(item, qty));

// Well's onUse (buildings.js) only ever emits this intent - buildings.js
// deliberately doesn't import player.js (see its file header), so main.js is
// where the actual refill mutation happens, same as every other player.js
// mutation in this file. actions.js's river/stream/pond refill, by contrast,
// already imports player.js for every other action and performs its own
// mutation directly - watering_can_refilled below is just its matching toast.
eventBus.on('well_used', () => {
  if (state.player.waterCarried >= state.player.maxWaterCarried) {
    ui.showMessage('Your watering can is already full.');
    return;
  }
  refillWater(state.player);
  ui.showMessage('Watering can refilled.');
});
eventBus.on('watering_can_refilled', () => ui.showMessage('Watering can refilled.', 1400));
// CONFIRMED BUG: this used to destructure `item`, but crop_harvested's real
// payload (actions.js's harvestCropAction) is {x, y, cropId, qty} - there is
// no `item` field, so every crop harvest showed "+1 undefined". cropId is
// itself a valid ITEMS key for turnip/carrot/wheat/pumpkin (same string as
// the crop's own item id), so it drops straight into showPickupToast.
eventBus.on('crop_harvested', ({ cropId, qty }) => showPickupToast(cropId, qty));

// --- Meta-level (state machine) input --------------------------------------
// Separate from InputController above (which only owns gameplay movement/
// hotbar/click/cancel per the contract) - this is main.js's own minimal
// start/pause control until a richer Start/Pause screen exists.
function beginFromStartScreen() {
  if (state.status !== 'start') return;
  startGame();
  // Gated on a localStorage flag so it only ever auto-shows once, on a
  // player's first-ever game start, regardless of whether a save was found -
  // same pattern as static/driftworks/main.js. The HUD's '?' button reopens
  // it any time regardless of this flag.
  if (!hasSeenIntro()) {
    markIntroSeen();
    ui.showHowToPlay();
  }
}

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'enter' && state.status === 'start') {
    beginFromStartScreen();
  } else if (key === 'p' && (state.status === 'playing' || state.status === 'paused')) {
    setPaused(state.status === 'playing');
  }
});
// Click-to-begin on the start screen (InputController's own click handler
// only fires onTileClick, which no-ops while status !== 'playing' - this is
// main.js's own minimal state-machine input, same as the keydown above).
canvas.addEventListener('click', () => beginFromStartScreen());

function setPaused(paused) {
  if (state.status === 'start') return;
  state.status = paused ? 'paused' : 'playing';
}

function advanceDay() {
  state.day += 1;
  state.dayTimer = 0;
  eventBus.emit('day_advanced', { day: state.day });
}

// --- Save/load -------------------------------------------------------------
// Persists player, world mutations (terrain/nodes/respawns/buildings/mine
// levels via world.js's own serialize()), inventory, farm plots, quest
// progress, day count and which location the player was in - not just
// player position, per the contract's Save/load section. Wrapped in
// safeGetJSON/safeSetJSON (utils.js) so private browsing degrades to "no
// save" rather than crashing boot.
function save() {
  safeSetJSON(SAVE_KEY, {
    version: 1,
    day: state.day,
    dayTimer: state.dayTimer,
    location: state.location,
    mineLevelIndex: state.mineLevelIndex,
    torchBurnRemaining: state.torchBurnRemaining,
    player: {
      x: state.player.x,
      y: state.player.y,
      facing: state.player.facing,
      stamina: state.player.stamina,
      maxStamina: state.player.maxStamina,
      waterCarried: state.player.waterCarried,
      maxWaterCarried: state.player.maxWaterCarried,
      tools: state.player.tools,
    },
    world: state.world.serialize(),
    inventory: state.inventory.serialize(),
    farming: state.farming.serialize(),
    quests: state.quests.serialize(),
  });
}

// Returns true iff an existing save was found and applied.
function loadAll() {
  const data = safeGetJSON(SAVE_KEY);
  if (!data) return false;

  state.day = data.day ?? 1;
  state.dayTimer = data.dayTimer ?? 0;

  if (data.world) {
    const buildingDescs = state.world.loadState(data.world);
    for (const b of buildingDescs) {
      state.world.placeBuilding(createBuilding(b.type, b.x, b.y));
    }
  }
  if (data.inventory) state.inventory.deserialize(data.inventory);
  if (data.farming) state.farming.deserialize(data.farming);
  if (data.quests) state.quests.deserialize(data.quests);

  if (data.player) {
    state.player.x = data.player.x ?? state.player.x;
    state.player.y = data.player.y ?? state.player.y;
    state.player.facing = data.player.facing ?? state.player.facing;
    state.player.stamina = data.player.stamina ?? state.player.stamina;
    state.player.maxStamina = data.player.maxStamina ?? state.player.maxStamina;
    state.player.waterCarried = data.player.waterCarried ?? state.player.waterCarried;
    state.player.maxWaterCarried = data.player.maxWaterCarried ?? state.player.maxWaterCarried;
    if (data.player.tools) Object.assign(state.player.tools, data.player.tools);
  }

  state.location = data.location === 'mine' ? 'mine' : 'overworld';
  state.mineLevelIndex = data.mineLevelIndex ?? 0;
  state.torchBurnRemaining = data.torchBurnRemaining ?? 0;
  return true;
}

// --- Game start ------------------------------------------------------------
function startGame() {
  state.world = new World(eventBus, Date.now());
  state.inventory = createInventory(eventBus, 30);
  state.farming = createFarming(eventBus);
  // Confirmed bug fix: a depleted tree/rock respawning directly on a tile
  // the player had since tilled and planted, silently burying the crop -
  // world.js has no other way to know farming.js's plot map exists (see
  // World.setFarmPlotGuard's own doc comment).
  state.world.setFarmPlotGuard((x, y) => !!state.farming.getPlot(x, y));
  state.quests = createQuestTracker(eventBus, {
    onReward: (items) => {
      // Same overflow handling as a resource/crop harvest (actions.js) - a
      // quest reward that doesn't fit is still lost even though it came
      // from a menu rather than a tile click, so it deserves the same
      // "you lost this" message rather than silently vanishing.
      for (const { item, qty } of items || []) {
        const leftover = state.inventory.addItem(item, qty);
        if (leftover > 0) {
          const name = ITEMS[item]?.name ?? item;
          ui.showMessage(`Inventory full - lost ${leftover} ${name} from your reward.`);
        }
      }
    },
  });
  state.player = createPlayer((HOME_SPAWN.x + 0.5) * TILE_SIZE, (HOME_SPAWN.y + 0.5) * TILE_SIZE);
  state.location = 'overworld';
  state.mineLevelIndex = 0;
  state.day = 1;
  state.dayTimer = 0;
  setPlacementMode(null);

  const loaded = loadAll();
  if (!loaded) {
    // A little starting material so the first couple of quest steps are
    // immediately reachable without trivializing "chop 5 wood" (the quest
    // chain's second step) or "mine 5 stone" - a few of each, not enough to
    // finish either objective outright.
    state.inventory.addItem('wood', 3);
    state.inventory.addItem('stone', 2);
  }

  state.particles = new ParticleSystem(eventBus);
  state.camera = createCamera();
  centerCameraOnWorld(state.camera, canvas, state.player.x, state.player.y);
  input.camera = state.camera;
  state.time = 0;
  state.transitionCooldown = 0;
  state.onTransitionTile = false;
  state.autosaveTimer = AUTOSAVE_INTERVAL;
  state.status = 'playing';
  ui.setHudVisible(true);
}

// --- Per-frame snapshot for ui.js -------------------------------------------
function buildUiSnapshot() {
  return {
    day: state.day,
    stamina: state.player.stamina,
    maxStamina: state.player.maxStamina,
    waterCarried: state.player.waterCarried,
    maxWaterCarried: state.player.maxWaterCarried,
    inventorySlots: state.inventory.slots,
    selectedHotbarIndex: input.selectedSlot,
    nearStations: computeNearStations(),
    quests: {
      active: state.quests.getActiveQuests(),
      completed: state.quests.getCompletedQuests(),
    },
    buffs: state.player.buffs,
    now: state.time,
    tools: state.player.tools,
  };
}

// --- Continuous campfire smoke ------------------------------------------
// Only in the overworld - the mine's world facade never has buildings (see
// makeMineWorldFacade), so this would just be an empty filter down there
// anyway. Smoke rises from just above the fire body drawn in buildings.js's
// drawCampfire (roughly the top third of the tile), not the tile center.
function campfireSmokePositions() {
  if (state.location !== 'overworld') return [];
  return state.world.getAllBuildings()
    .filter((b) => b.type === 'campfire')
    .map((b) => [(b.x + 0.5) * TILE_SIZE, b.y * TILE_SIZE + TILE_SIZE * 0.35]);
}

// --- Update / draw -----------------------------------------------------
function update(dt) {
  if (state.status !== 'playing') return;

  const move = input.getMoveVector();
  movePlayer(state.player, move.x, move.y, dt, isTileFreeForMovement);
  regenTick(state.player, dt);
  updateBuffs(state.player, state.time);
  centerCameraOnWorld(state.camera, canvas, state.player.x, state.player.y);

  if (state.transitionCooldown > 0) state.transitionCooldown -= dt;
  checkLocationTransitions();
  updateTorchBurn(dt);

  state.particles.update(dt);
  state.particles.campfireTick(dt, campfireSmokePositions());

  state.dayTimer += dt;
  if (state.dayTimer >= DAY_LENGTH_SEC) {
    state.dayTimer -= DAY_LENGTH_SEC;
    advanceDay();
  }

  ui.update(buildUiSnapshot());

  state.autosaveTimer -= dt;
  if (state.autosaveTimer <= 0) {
    state.autosaveTimer = AUTOSAVE_INTERVAL;
    save();
  }
}

// Canvas-drawn title treatment - no external fonts/images per the site's
// convention, just a web-safe rustic serif stack, a warm radial vignette
// built from the game's own palette, and a soft double-shadow on the title
// text standing in for a proper logo.
const TITLE_FONT_STACK = 'Georgia, "Palatino Linotype", "Book Antiqua", serif';

function drawStartScreen() {
  const { width, height } = canvas;
  const cx = width / 2;
  const cy = height / 2;

  ctx.fillStyle = PALETTE.panelBg;
  ctx.fillRect(0, 0, width, height);

  // Warm vignette: a soft glow behind the title fading to the panel color at
  // the edges, built entirely from PALETTE colors (no image assets).
  const vignette = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.65);
  vignette.addColorStop(0, 'rgba(212, 175, 55, 0.16)');
  vignette.addColorStop(0.6, 'rgba(74, 124, 63, 0.08)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = 'center';

  ctx.font = `bold 56px ${TITLE_FONT_STACK}`;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillText('Wildergrove', cx + 3, cy - 42 + 4);
  ctx.fillStyle = PALETTE.accent;
  ctx.fillText('Wildergrove', cx, cy - 42);

  ctx.font = `italic 17px ${TITLE_FONT_STACK}`;
  ctx.fillStyle = PALETTE.text;
  ctx.fillText('Resettle the valley. Mine, farm, cook, craft, and build.', cx, cy + 4);

  // Slow pulse so the prompt reads as "waiting for input" rather than static.
  const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 500);
  ctx.font = `16px ${TITLE_FONT_STACK}`;
  ctx.fillStyle = `rgba(240, 230, 210, ${pulse.toFixed(2)})`;
  ctx.fillText('Press Enter or click to begin', cx, cy + 46);
}

function drawPauseOverlay() {
  const { width, height } = canvas;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, width, height);

  const panelW = 280;
  const panelH = 110;
  const px = width / 2 - panelW / 2;
  const py = height / 2 - panelH / 2;
  ctx.fillStyle = 'rgba(58, 43, 34, 0.92)';
  ctx.strokeStyle = PALETTE.accent;
  ctx.lineWidth = 2;
  const r = 12;
  ctx.beginPath();
  ctx.roundRect(px, py, panelW, panelH, r);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.text;
  ctx.font = `bold 28px ${TITLE_FONT_STACK}`;
  ctx.fillText('Paused', width / 2, height / 2 - 6);
  ctx.font = `15px ${TITLE_FONT_STACK}`;
  ctx.fillStyle = PALETTE.accent;
  ctx.fillText("Press 'P' to resume", width / 2, height / 2 + 26);
}

function draw() {
  if (state.status === 'start') {
    drawStartScreen();
    return;
  }

  if (state.location === 'mine') {
    const level = state.world.getMineLevel(state.mineLevelIndex);
    ctx.fillStyle = PALETTE.caveWall;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (level) {
      drawMineFloor(ctx, level.tiles, state.camera, canvas);
      drawMineExit(ctx, level.exit, state.camera);
      // isCoveredFn: every mine node now seeds exclusively on DIRT (see
      // world.js's spawnMineNodes) so nothing should be visible until the
      // dirt covering it is actually cleared - passed as a predicate rather
      // than the raw tile array since render.js can't import MINE_TILE
      // (world.js imports render.js, not the other way, to avoid a cycle).
      drawResourceNodes(
        ctx, level.nodes, state.camera, canvas, level.width, level.height,
        (gx, gy) => state.world.getMineTile(state.mineLevelIndex, gx, gy) === MINE_TILE.DIRT,
      );
      // Confirmed player feedback: the mine had no darkness at all, making
      // the torch item (craftable, handed out by two quests) completely
      // pointless. Drawn before the shared drawPlayer()/particles call below
      // so the player and any particle effects always render on top of the
      // fog, never obscured by it - only the cave itself dims with distance.
      const visionRadiusTiles = state.torchBurnRemaining > 0
        ? TORCH_VISION_RADIUS_TILES : NO_TORCH_VISION_RADIUS_TILES;
      drawMineFog(ctx, canvas, state.camera, state.player.x, state.player.y, visionRadiusTiles * TILE_SIZE);
    }
  } else {
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawTerrain(ctx, state.world.terrain, WORLD_W, WORLD_H, state.camera, canvas);
    drawFarmPlots(ctx, state.farming.getAllPlots(), state.camera, canvas);
    drawResourceNodes(ctx, state.world.nodes, state.camera, canvas, WORLD_W, WORLD_H);
    drawBuildings(ctx, state.world.getAllBuildings(), state.camera, canvas);
    for (const npc of NPCS) drawNPC(ctx, npc, state.camera);
  }

  drawPlayer(ctx, state.player, state.camera);
  state.particles.draw(ctx, state.camera);

  // Atmosphere only, overworld only - the mine is already lit as a fixed
  // cave interior with no day/night of its own.
  if (state.location === 'overworld') {
    drawDayNightTint(ctx, canvas, state.dayTimer / DAY_LENGTH_SEC);
  }

  if (state.status === 'paused') drawPauseOverlay();
}

// --- Main loop ---------------------------------------------------------
let lastTime = performance.now();
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  if (state.status === 'playing') state.time += dt;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
