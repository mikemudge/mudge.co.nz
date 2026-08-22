// main.js - Delve entry point. Loads three.js, builds the scene/DOM, wires
// up input, and owns the game loop. Iteration 1 delivered procedural dungeon
// + 3D rendering + player movement/collision + a fixed follow camera.
// Iteration 2 added mouse-aim melee combat, player HP/death, enemies
// (enemies.js), and floor progression via a stairs beacon. Iteration 3 added
// ground loot + a ranged weapon (loot.js, combat.js), armor/consumable
// effects, and an inventory HUD. Iteration 4 (this one) adds persistent
// meta-progression (progression.js: an Essence currency + permanent perk
// levels, both saved to localStorage) and a menu screen, turning the loop
// into menu -> run -> death -> menu (see `state.status` below) instead of
// booting straight into a run.

import { generateDungeon, buildDungeonMeshes, CELL_SIZE } from './dungeon.js';
import { Player } from './player.js';
import { spawnEnemiesForDungeon, updateEnemies } from './enemies.js';
import { updateEnemyProjectiles, updatePlayerProjectiles } from './combat.js';
import { spawnLootForDungeon, updateGroundItems, maybeDropLoot } from './loot.js';
import {
  loadMeta, saveMeta, computeEssenceReward, applyPerksToPlayer, purchasePerk, getPerkCost, PERKS,
} from './progression.js';
import { damp, clamp, distance2D } from './utils.js';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

// Camera offset from the player, in world units. Axis-aligned on purpose
// (no X component): since the camera never rotates, world -Z always reads
// as "up the screen" and world +X always reads as "right", so WASD/arrows
// can map directly to world axes below and still feel intuitive.
const CAMERA_OFFSET = { x: 0, y: 16, z: 13 };
// How many world-units above the player's feet the camera aims at (roughly
// chest height) rather than aiming at the floor under the player's feet.
const CAMERA_LOOK_HEIGHT = 1.2;
// Higher = camera catches up to the player faster. Still smoothed rather
// than rigidly locked, so motion reads as a "follow" cam, not a rigid rig.
const CAMERA_FOLLOW_RATE = 6;

const CAMERA_FOV = 50;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 200;

// Max dt per frame (seconds) - guards against a huge simulation step after
// e.g. the tab was backgrounded.
const MAX_DT = 0.05;

// World-space radius within which the player triggers a floor transition
// after touching the stairs beacon.
const STAIRS_TRIGGER_RADIUS = 1.1;

// Stairs beacon visual tunables.
const STAIRS_BEACON_HEIGHT = 3.5;
const STAIRS_BEACON_RADIUS = 0.5;
const STAIRS_BEACON_SPIN_RATE = 0.8; // radians/sec
const STAIRS_BEACON_PULSE_RATE = 2.2; // radians/sec, feeds a sine pulse

// How long the "Floor N" toast stays in the HUD after a transition.
const FLOOR_TOAST_DURATION = 2.5;

// The vendored three.js build in this repo is old enough that
// `Object3D.lookAt` only accepts a single Vector3 argument (the (x, y, z)
// numeric overload didn't exist yet) - passing raw numbers silently no-ops
// instead of throwing. Reused every frame to avoid an allocation per call;
// created once THREE is available (see main()).
let lookAtTarget = null;

// Reused every frame for the mouse-aim ground-plane raycast (see
// updateAimPoint()) - allocated once THREE is available (see main()).
let aimRaycaster = null;
let aimGroundPlane = null;
let aimHitPoint = null;

// ---------------------------------------------------------------------------
// Central game state - the contract later iterations (combat/enemies,
// loot/inventory, meta-progression/menus) should extend rather than
// restructure. Exported so those modules can `import { state } from
// './main.js'`.
// ---------------------------------------------------------------------------

export const state = {
  // Simple state-machine field. Boots into 'menu' (see main()) and only
  // becomes 'playing' once the player clicks "Descend" (see startRun()).
  // 'dead' is set once state.player.hp reaches 0 (see the loop below) and
  // freezes simulation updates - rendering keeps going so the death overlay
  // has the last frame behind it. From 'dead', the death overlay's button
  // returns to 'menu' (see goToMenu()) rather than straight back into a new
  // run, so the player can spend what they just earned first. While
  // status === 'menu', state.player/state.dungeon/etc. below are all null -
  // see the guards in loop()/updateHud()/updateInventoryHud().
  status: 'menu',

  // three.js plumbing, all in one place.
  three: {
    THREE: null,
    renderer: null,
    scene: null,
    camera: null,
  },

  // The current dungeon's data (see dungeon.js for the full shape) and the
  // THREE.Group its meshes were built into (already added to the scene).
  // Both are replaced wholesale on each floor transition (see advanceFloor).
  dungeon: null,
  dungeonGroup: null,

  // The glowing beacon mesh marking dungeon.stairsPos - a direct scene child
  // (not inside dungeonGroup), replaced alongside the dungeon on each floor
  // transition. Exposed in case a later iteration wants to reference it
  // (e.g. a minimap/compass pointing at it).
  stairsMarker: null,

  // 1-indexed floor counter, incremented on every stairs transition.
  floor: 1,

  // The player entity (see player.js) - state.player.position/.mesh/.radius,
  // plus this iteration's .hp/.maxHp/.attack()/.takeDamage().
  player: null,

  // Flat list of non-player entities - this iteration, Crawler/Spitter
  // instances from enemies.js (position, radius, mesh, dead, takeDamage(),
  // an update(dt, dungeon, player, scene, enemyProjectiles) method). Ground
  // loot pickups are NOT entities - see state.groundItems below.
  entities: [],

  // Enemy-fired and player-fired projectiles in flight (see combat.js
  // spawnProjectile/updateEnemyProjectiles/updatePlayerProjectiles) - plain
  // {position, velX, velZ, radius, damage, mesh, ...} records, not full
  // entities. playerProjectiles is populated by Player.attack() when
  // player.weapon.type === 'ranged' (see player.js).
  enemyProjectiles: [],
  playerProjectiles: [],

  // Ground loot: chest placements (spawned per-floor in loadFloor) and enemy
  // death drops (rolled in the onDeathFinalized callback below), both via
  // loot.js. Plain {itemSpec, position, mesh, bobPhase} records, not full
  // entities - see loot.js for the full shape and pickup resolution.
  groundItems: [],

  // Run-level counters, reset to 0 by startRun() alongside a fresh Player -
  // NOT persisted (see state.meta below for what IS persisted). kills is
  // incremented once per enemy exactly when its death is finalized (see
  // updateEnemies's onDeathFinalized callback below); runTime accumulates
  // dt only while state.status === 'playing'.
  kills: 0,
  runTime: 0,

  // Persistent meta-progression (see progression.js): { essence, perkLevels }
  // loaded once at startup (see main()) and written back to localStorage
  // (via saveMeta) any time it changes - a run's Essence reward on death, or
  // a perk purchase in the menu. Survives across runs AND page reloads;
  // state.kills/state.runTime above do not.
  meta: null,

  // Current mouse-aim world point (ground-plane raycast, y=0), updated every
  // frame in the loop below. Player facing follows this each frame.
  aimPoint: { x: 0, z: 0 },

  // Current WASD/arrow key state, read fresh each frame in the game loop.
  // `attack` mirrors the left mouse button (see setupInput) - held down is
  // fine, Player.attack() is internally cooldown-gated.
  input: { forward: false, back: false, left: false, right: false, attack: false },

  // Wall-clock bookkeeping.
  clock: { elapsed: 0, lastTime: 0 },
};

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function injectStylesheet(href) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function buildDom() {
  injectStylesheet('/static/delve/delve.css');

  const canvas = document.createElement('canvas');
  canvas.id = 'delve-canvas';
  document.body.appendChild(canvas);

  const ui = document.createElement('div');
  ui.id = 'delve-ui';
  document.body.appendChild(ui);

  // Debug HUD - see the comment in delve.css; a development aid (fps/floor/
  // hp/pos/etc), kept alongside (not replaced by) the inventory HUD below.
  const hud = document.createElement('div');
  hud.id = 'delve-debug-hud';
  ui.appendChild(hud);

  // Equipment/potion HUD - see updateInventoryHud().
  const inventoryHud = document.createElement('div');
  inventoryHud.id = 'delve-inventory-hud';
  ui.appendChild(inventoryHud);

  // Run-end overlay: hidden until state.status becomes 'dead' (see
  // showDeathOverlay(), which fills in #delve-death-stats). The button
  // returns to the menu (goToMenu(), wired once main() resolves - see the
  // bottom of this file) rather than starting a new run directly, so the
  // player can spend the Essence they just earned first. Needs pointer-events
  // re-enabled since #delve-ui as a whole is pointer-events:none (see
  // delve.css) so it doesn't intercept mouse-aim.
  const deathOverlay = document.createElement('div');
  deathOverlay.id = 'delve-death-overlay';
  deathOverlay.innerHTML =
    '<div class="delve-death-panel">' +
      '<h1>You Died</h1>' +
      '<div id="delve-death-stats"></div>' +
      '<button id="delve-death-continue-btn" type="button">Continue</button>' +
    '</div>';
  ui.appendChild(deathOverlay);

  // Menu overlay: shown whenever state.status === 'menu' (initial boot, and
  // again after every death via goToMenu()) - see showMenuOverlay()/
  // hideMenuOverlay()/renderMenu() below. #delve-menu-perks is populated
  // dynamically by renderMenu() rather than built here, since it needs to
  // re-render after every purchase.
  const menuOverlay = document.createElement('div');
  menuOverlay.id = 'delve-menu-overlay';
  menuOverlay.innerHTML =
    '<div class="delve-menu-panel">' +
      '<h1>Delve</h1>' +
      '<div id="delve-menu-essence"></div>' +
      '<div id="delve-menu-perks"></div>' +
      '<button id="delve-start-btn" type="button">Descend</button>' +
    '</div>';
  ui.appendChild(menuOverlay);

  return { canvas, ui, hud, inventoryHud, deathOverlay, menuOverlay };
}

function setupInput(input) {
  const keyMap = {
    KeyW: 'forward', ArrowUp: 'forward',
    KeyS: 'back', ArrowDown: 'back',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
  };

  window.addEventListener('keydown', (e) => {
    const dir = keyMap[e.code];
    if (dir) {
      input[dir] = true;
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    const dir = keyMap[e.code];
    if (dir) {
      input[dir] = false;
      e.preventDefault();
    }
  });

  // Don't get stuck with a key "held" after the window loses focus.
  window.addEventListener('blur', () => {
    input.forward = input.back = input.left = input.right = false;
    input.attack = false;
  });

  // Left mouse button gates the melee attack - held is fine, Player.attack()
  // is cooldown-gated internally so this can't spam faster than the weapon
  // allows.
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0) input.attack = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.attack = false;
  });

  // Potion keybind ('E', discoverable via the inventory HUD - see
  // updateInventoryHud). Handled directly here (rather than as a polled
  // input.* flag like movement/attack) since a potion should be consumed
  // once per press, not continuously while held - `!e.repeat` guards against
  // the OS's key-repeat re-firing it while held.
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE' && !e.repeat && state.status === 'playing' && state.player) {
      state.player.usePotion();
    }
  });
}

// Tracks raw mouse position in normalized device coords ([-1, 1] on each
// axis), read by updateAimPoint() every frame. Kept outside `state` since
// it's an intermediate input value, not simulation state - state.aimPoint
// (the resolved ground-plane world point) is the contract other modules
// should read.
const mouseNdc = { x: 0, y: 0 };

function setupMouseTracking(canvas) {
  window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  });
}

function setupLighting(THREE, scene, dungeon) {
  const ambient = new THREE.AmbientLight(0x8899aa, 0.55);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff2d8, 0.85);
  sun.position.set(dungeon.width * CELL_SIZE * 0.3, 40, dungeon.height * CELL_SIZE * 0.2);
  sun.target.position.set(dungeon.width * CELL_SIZE * 0.5, 0, dungeon.height * CELL_SIZE * 0.5);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 1024;
  sun.shadow.mapSize.height = 1024;
  const halfW = (dungeon.width * CELL_SIZE) / 2 + 10;
  const halfH = (dungeon.height * CELL_SIZE) / 2 + 10;
  sun.shadow.camera.left = -halfW;
  sun.shadow.camera.right = halfW;
  sun.shadow.camera.top = halfH;
  sun.shadow.camera.bottom = -halfH;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 200;
  scene.add(sun);
  scene.add(sun.target);
}

// A glowing pillar + a slowly counter-spinning ring around its base, so the
// stairs down read as a distinct "beacon" against the dungeon's dim/foggy
// palette from a moderate distance - it doesn't need to be visible across
// the whole map, just recognizable once the player is getting close.
function buildStairsMarker(THREE) {
  const group = new THREE.Group();

  const coreGeo = new THREE.CylinderGeometry(
    STAIRS_BEACON_RADIUS * 0.25, STAIRS_BEACON_RADIUS * 0.35, STAIRS_BEACON_HEIGHT, 10
  );
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x5ad1ff,
    emissive: 0x2fa9e6,
    emissiveIntensity: 0.9,
    roughness: 0.3,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.y = STAIRS_BEACON_HEIGHT / 2;
  group.add(core);

  const ringGeo = new THREE.RingGeometry(
    STAIRS_BEACON_RADIUS * 0.7, STAIRS_BEACON_RADIUS, 24
  );
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x5ad1ff,
    emissive: 0x2fa9e6,
    emissiveIntensity: 0.9,
    roughness: 0.3,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  group.add(ring);

  const light = new THREE.PointLight(0x5ad1ff, 1.1, 12);
  light.position.y = STAIRS_BEACON_HEIGHT * 0.5;
  group.add(light);

  // Referenced each frame in the loop to spin/pulse - see updateStairsMarker.
  group.userData.core = core;
  group.userData.ring = ring;
  return group;
}

function updateStairsMarker(marker, elapsed) {
  marker.rotation.y = elapsed * STAIRS_BEACON_SPIN_RATE;
  const pulse = 0.75 + 0.25 * Math.sin(elapsed * STAIRS_BEACON_PULSE_RATE);
  marker.userData.core.material.emissiveIntensity = 0.6 + 0.5 * pulse;
  marker.userData.ring.material.opacity = 0.5 + 0.4 * pulse;
}

// Frees GPU resources for a THREE.Object3D subtree before dropping it (avoids
// leaking geometry/material buffers across floor transitions since dungeons
// are rebuilt from scratch each time rather than reused/pooled).
function disposeObject3D(object3D) {
  object3D.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of materials) mat.dispose();
    }
  });
}

// Builds a full floor's contents (dungeon meshes, stairs beacon, enemies,
// ground loot) and wires them into `state` + `scene`. Shared by
// advanceFloor()'s floor transition and startRun()'s fresh-run setup so
// neither can drift apart.
function loadFloor(THREE, scene, dungeon, floor) {
  const dungeonGroup = buildDungeonMeshes(dungeon, THREE);
  scene.add(dungeonGroup);

  const stairsMarker = buildStairsMarker(THREE);
  stairsMarker.position.set(dungeon.stairsPos.x, 0, dungeon.stairsPos.z);
  scene.add(stairsMarker);

  const entities = spawnEnemiesForDungeon(THREE, dungeon, floor);
  for (const enemy of entities) scene.add(enemy.mesh);

  const groundItems = spawnLootForDungeon(THREE, scene, dungeon, floor);

  state.dungeon = dungeon;
  state.dungeonGroup = dungeonGroup;
  state.stairsMarker = stairsMarker;
  state.entities = entities;
  state.groundItems = groundItems;
  state.floor = floor;
}

// Tears down everything loadFloor() built for the current floor - dungeon
// meshes, stairs beacon, entities, both projectile lists, and ground loot -
// disposing GPU resources and removing from `scene`. Shared by advanceFloor()
// (which then generates and loads the next floor), startRun() (which tears
// down a lingering previous run before generating a new floor 1), and
// goToMenu() (which tears down without loading anything new).
function teardownFloor() {
  const { scene } = state.three;

  disposeObject3D(state.dungeonGroup);
  scene.remove(state.dungeonGroup);
  disposeObject3D(state.stairsMarker);
  scene.remove(state.stairsMarker);

  for (const enemy of state.entities) {
    disposeObject3D(enemy.mesh);
    scene.remove(enemy.mesh);
  }
  for (const projectile of state.enemyProjectiles) {
    disposeObject3D(projectile.mesh);
    scene.remove(projectile.mesh);
  }
  for (const projectile of state.playerProjectiles) {
    disposeObject3D(projectile.mesh);
    scene.remove(projectile.mesh);
  }
  for (const item of state.groundItems) {
    disposeObject3D(item.mesh);
    scene.remove(item.mesh);
  }
  state.enemyProjectiles.length = 0;
  state.playerProjectiles.length = 0;
  state.groundItems.length = 0;
}

// Creates a fresh Player at `dungeon.startPos`, adds its mesh to `scene`, and
// wires it into `state` (including resetting the aim point to the player's
// own position, matching the "aim point starts where the player stands"
// no-lerp behavior). Called by startRun() - NOT perk-aware itself; the caller
// is responsible for calling applyPerksToPlayer() afterward (see startRun()).
function spawnFreshPlayer(THREE, scene, dungeon) {
  const player = new Player(THREE, dungeon.startPos);
  scene.add(player.mesh);
  state.player = player;
  state.aimPoint.x = player.position.x;
  state.aimPoint.z = player.position.z;
  return player;
}

// Replaces the current floor with a freshly generated one, repositioning the
// player at the new dungeon's start and bumping state.floor. Triggered when
// the player reaches the stairs beacon (see the loop below).
function advanceFloor() {
  const { THREE, scene, camera } = state.three;
  teardownFloor();

  const dungeon = generateDungeon();
  loadFloor(THREE, scene, dungeon, state.floor + 1);

  state.player.position.x = dungeon.startPos.x;
  state.player.position.z = dungeon.startPos.z;
  state.player.mesh.position.set(dungeon.startPos.x, 0, dungeon.startPos.z);
  // Brief grace period so arriving on a new floor can't be an instant hit.
  state.player.invulnTimer = Math.max(state.player.invulnTimer, 1.0);

  // Snap the camera to the new position instead of letting it damp/lerp
  // across the map from the old floor's location, mirroring the initial
  // no-lerp-in-from-the-origin placement in main().
  camera.position.set(
    dungeon.startPos.x + CAMERA_OFFSET.x,
    CAMERA_OFFSET.y,
    dungeon.startPos.z + CAMERA_OFFSET.z
  );

  floorToastTimer = FLOOR_TOAST_DURATION;
}

// Starts a brand-new run from floor 1: tears down whatever floor/player is
// still lingering from a previous run (there's nothing to tear down on the
// very first call, straight from main()'s initial boot - both guards below
// are no-ops then), generates a fresh dungeon, and spawns a fresh Player with
// every currently-owned perk level applied (see applyPerksToPlayer in
// progression.js) - this is what keeps a purchased perk from ever drifting
// out of sync between the initial boot and a subsequent run. Wired to the
// menu's "Descend" button (see the bottom of this file).
function startRun() {
  const { THREE, scene, camera } = state.three;
  if (state.dungeon) teardownFloor();
  if (state.player) {
    disposeObject3D(state.player.mesh);
    scene.remove(state.player.mesh);
  }

  const dungeon = generateDungeon();
  loadFloor(THREE, scene, dungeon, 1);
  const player = spawnFreshPlayer(THREE, scene, dungeon);
  applyPerksToPlayer(player, state.meta.perkLevels);

  state.kills = 0;
  state.runTime = 0;
  state.status = 'playing';

  camera.position.set(
    dungeon.startPos.x + CAMERA_OFFSET.x,
    CAMERA_OFFSET.y,
    dungeon.startPos.z + CAMERA_OFFSET.z
  );
  lookAtTarget.set(dungeon.startPos.x, CAMERA_LOOK_HEIGHT, dungeon.startPos.z);
  camera.lookAt(lookAtTarget);

  hideMenuOverlay();
  floorToastTimer = 0;
}

// Returns to the menu after a run ends: tears down the just-finished floor
// and player entirely (state.dungeon/state.player go back to null, matching
// the menu-state contract other code guards on - see loop()/updateHud()/
// updateInventoryHud()) and shows the (freshly re-rendered, so it reflects
// the Essence/perks the player just earned/bought) menu overlay. Wired to the
// death overlay's "Continue" button (see the bottom of this file).
function goToMenu() {
  const { scene } = state.three;
  teardownFloor();
  disposeObject3D(state.player.mesh);
  scene.remove(state.player.mesh);

  state.dungeon = null;
  state.dungeonGroup = null;
  state.stairsMarker = null;
  state.entities = [];
  state.player = null;
  state.status = 'menu';
  floorToastTimer = 0;

  if (deathOverlayEl) deathOverlayEl.classList.remove('visible');
  showMenuOverlay();
}

// Populates #delve-menu-essence/#delve-menu-perks from current state.meta.
// Called on every show (showMenuOverlay) and again after every purchase, so
// the displayed Essence/level/cost never needs a page reload to catch up -
// see the "Buy" button handler built below.
function renderMenu() {
  if (!menuEssenceEl || !menuPerksEl) return;

  menuEssenceEl.textContent = `Essence: ${state.meta.essence}`;

  menuPerksEl.innerHTML = '';
  for (const perk of PERKS) {
    const level = state.meta.perkLevels[perk.id] ?? 0;
    const maxed = level >= perk.maxLevel;

    const row = document.createElement('div');
    row.className = 'delve-perk-row';

    const info = document.createElement('div');
    info.className = 'delve-perk-info';
    info.innerHTML =
      `<strong>${perk.name}</strong> <span class="delve-hint">Lv ${level}/${perk.maxLevel}</span><br>` +
      `<span class="delve-hint">${perk.formatPerLevel()} per level</span>`;
    row.appendChild(info);

    if (maxed) {
      const maxedLabel = document.createElement('span');
      maxedLabel.className = 'delve-perk-maxed';
      maxedLabel.textContent = 'MAX';
      row.appendChild(maxedLabel);
    } else {
      const cost = getPerkCost(perk, level);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'delve-perk-buy-btn';
      btn.textContent = `Buy (${cost})`;
      btn.disabled = state.meta.essence < cost;
      btn.addEventListener('click', () => {
        if (purchasePerk(state.meta, perk.id)) {
          saveMeta(state.meta);
          renderMenu();
        }
      });
      row.appendChild(btn);
    }

    menuPerksEl.appendChild(row);
  }
}

function showMenuOverlay() {
  renderMenu();
  if (menuOverlayEl) menuOverlayEl.classList.add('visible');
  if (uiEl) uiEl.classList.add('menu-active');
}

function hideMenuOverlay() {
  if (menuOverlayEl) menuOverlayEl.classList.remove('visible');
  if (uiEl) uiEl.classList.remove('menu-active');
}

let floorToastTimer = 0;

async function main() {
  const { canvas } = buildDom();

  state.meta = loadMeta();

  await loadScript('/static/js/three.js/84/three.min.js');
  const THREE = window.THREE;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const fogColor = 0x0c0a10;
  scene.background = new THREE.Color(fogColor);
  scene.fog = new THREE.Fog(fogColor, 25, 70);

  const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV, window.innerWidth / window.innerHeight, CAMERA_NEAR, CAMERA_FAR
  );

  state.three.THREE = THREE;
  state.three.renderer = renderer;
  state.three.scene = scene;
  state.three.camera = camera;

  // Bootstrapped up front so there's something lit to render behind the menu
  // overlay, same as always - but NOT loaded into state/scene as a real
  // floor (no dungeon meshes, no entities, no loot): state.dungeon/
  // state.player stay null until the player actually clicks "Descend" (see
  // startRun(), wired to the menu below). Only used to size the shadow
  // camera/sun in setupLighting and to give the idle menu camera somewhere
  // sensible to point.
  const bootDungeon = generateDungeon();
  setupLighting(THREE, scene, bootDungeon);

  lookAtTarget = new THREE.Vector3();
  aimRaycaster = new THREE.Raycaster();
  aimGroundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  aimHitPoint = new THREE.Vector3();

  camera.position.set(
    bootDungeon.startPos.x + CAMERA_OFFSET.x,
    CAMERA_OFFSET.y,
    bootDungeon.startPos.z + CAMERA_OFFSET.z
  );
  lookAtTarget.set(bootDungeon.startPos.x, CAMERA_LOOK_HEIGHT, bootDungeon.startPos.z);
  camera.lookAt(lookAtTarget);

  setupInput(state.input);
  setupMouseTracking(canvas);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  state.clock.lastTime = performance.now();
  requestAnimationFrame(loop);
}

function computeInputDir(input) {
  // Axis-aligned to the fixed camera (see CAMERA_OFFSET comment): -Z is
  // "up the screen", +X is "right".
  let x = 0;
  let z = 0;
  if (input.forward) z -= 1;
  if (input.back) z += 1;
  if (input.left) x -= 1;
  if (input.right) x += 1;

  if (x !== 0 && z !== 0) {
    const len = Math.sqrt(x * x + z * z);
    x /= len;
    z /= len;
  }
  return { x, z };
}

// Raycasts the current mouse position onto the y=0 ground plane and writes
// the result into state.aimPoint. Left as the previous frame's value on the
// (practically unreachable, given the fixed downward-angled camera) case
// where the ray is parallel to the plane and never crosses it.
function updateAimPoint(camera) {
  aimRaycaster.setFromCamera(mouseNdc, camera);
  const hit = aimRaycaster.ray.intersectPlane(aimGroundPlane, aimHitPoint);
  if (hit) {
    state.aimPoint.x = hit.x;
    state.aimPoint.z = hit.z;
  }
}

function updateCamera(dt) {
  const { camera } = state.three;
  const { player } = state;

  const targetX = player.position.x + CAMERA_OFFSET.x;
  const targetY = CAMERA_OFFSET.y;
  const targetZ = player.position.z + CAMERA_OFFSET.z;

  camera.position.x = damp(camera.position.x, targetX, CAMERA_FOLLOW_RATE, dt);
  camera.position.y = damp(camera.position.y, targetY, CAMERA_FOLLOW_RATE, dt);
  camera.position.z = damp(camera.position.z, targetZ, CAMERA_FOLLOW_RATE, dt);

  lookAtTarget.set(player.position.x, CAMERA_LOOK_HEIGHT, player.position.z);
  camera.lookAt(lookAtTarget);
}

// Formats seconds as "M:SS" - shared by the debug HUD, the inventory HUD
// (not currently, but kept here for a single source of truth), and the death
// overlay's run summary.
function formatRunTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function updateHud(hud, fps) {
  const { player } = state;
  let text =
    `fps: ${fps.toFixed(0)}\n` +
    `floor: ${state.floor}\n` +
    `hp: ${player.hp}/${player.maxHp}\n` +
    `enemies: ${state.entities.length}\n` +
    `kills: ${state.kills}\n` +
    `time: ${formatRunTime(state.runTime)}\n` +
    `pos: ${player.position.x.toFixed(1)}, ${player.position.z.toFixed(1)}\n` +
    `facing: ${player.facingAngle.toFixed(2)} rad`;
  if (floorToastTimer > 0) {
    text += `\n\n-- Floor ${state.floor} --`;
  }
  hud.textContent = text;
}

// Equipped weapon / active armor bonuses / potion count - the loot system's
// player-facing readout. Deliberately separate from the plain-text debug HUD
// above (different audience: this one's meant to read cleanly for a player,
// not just a developer).
function updateInventoryHud(el) {
  const { player } = state;
  const bonuses = [];
  if (player.bonusMaxHp) bonuses.push(`+${player.bonusMaxHp} Max HP`);
  if (player.bonusSpeed) bonuses.push(`+${player.bonusSpeed.toFixed(1)} Speed`);
  if (player.bonusDamage) bonuses.push(`+${player.bonusDamage} Damage`);

  el.innerHTML =
    `<div><strong>${player.weapon.name}</strong> <span class="delve-hint">(${player.weapon.type})</span></div>` +
    `<div>${bonuses.length ? bonuses.join(' &middot; ') : 'No bonuses yet'}</div>` +
    `<div>Potions: ${player.potionCount} <span class="delve-hint">[E]</span></div>`;
}

// Fills in the run summary (including the Essence this run just earned, see
// the loop below) and reveals the death overlay - called once, the frame
// state.player.hp reaches 0. goToMenu() hides it again via the 'visible'
// class.
function showDeathOverlay(essenceEarned) {
  if (deathStatsEl) {
    deathStatsEl.innerHTML =
      `<p>Floor reached: ${state.floor}</p>` +
      `<p>Enemies defeated: ${state.kills}</p>` +
      `<p>Time survived: ${formatRunTime(state.runTime)}</p>` +
      `<p>Essence earned: ${essenceEarned}</p>`;
  }
  if (deathOverlayEl) deathOverlayEl.classList.add('visible');
}

let hudEl = null;
let inventoryHudEl = null;
let hudAccum = 0;
let deathOverlayEl = null;
let deathStatsEl = null;
let uiEl = null;
let menuOverlayEl = null;
let menuEssenceEl = null;
let menuPerksEl = null;

function loop(now) {
  requestAnimationFrame(loop);

  const dtRaw = (now - state.clock.lastTime) / 1000;
  state.clock.lastTime = now;
  const dt = clamp(dtRaw, 0, MAX_DT);
  state.clock.elapsed += dt;

  if (state.status === 'playing') {
    state.runTime += dt;
    updateAimPoint(state.three.camera);

    const inputDir = computeInputDir(state.input);
    state.player.update(dt, inputDir, state.dungeon, state.aimPoint);
    if (state.input.attack) {
      state.player.attack(state.clock.elapsed, state.entities, state.three.scene, state.playerProjectiles);
    }

    updateEnemies(
      state.entities, dt, state.dungeon, state.player, state.three.scene, state.enemyProjectiles,
      (enemy) => {
        state.kills++;
        maybeDropLoot(
          Math.random, state.three.THREE, state.three.scene, state.groundItems,
          enemy.position.x, enemy.position.z
        );
      }
    );
    updateEnemyProjectiles(state.enemyProjectiles, dt, state.dungeon, state.three.scene, state.player);
    updatePlayerProjectiles(state.playerProjectiles, dt, state.dungeon, state.three.scene, state.entities);
    updateGroundItems(state.groundItems, state.clock.elapsed, state.player, state.three.scene);

    updateStairsMarker(state.stairsMarker, state.clock.elapsed);
    updateCamera(dt);

    if (floorToastTimer > 0) floorToastTimer = Math.max(0, floorToastTimer - dt);

    if (state.player.hp <= 0) {
      state.status = 'dead';
      const essenceEarned = computeEssenceReward(state.floor, state.kills);
      state.meta.essence += essenceEarned;
      saveMeta(state.meta);
      showDeathOverlay(essenceEarned);
    } else {
      const distToStairs = distance2D(
        state.player.position.x, state.player.position.z,
        state.dungeon.stairsPos.x, state.dungeon.stairsPos.z
      );
      if (distToStairs < STAIRS_TRIGGER_RADIUS) {
        advanceFloor();
      }
    }
  }

  const { renderer, scene, camera } = state.three;
  renderer.render(scene, camera);

  hudAccum += dt;
  if (hudAccum > 0.2) {
    hudAccum = 0;
    // state.player is null while status === 'menu' - both HUDs are also
    // hidden via CSS then (see #delve-ui.menu-active in delve.css), but guard
    // here too since they'd otherwise throw reading player fields.
    if (hudEl && state.player) updateHud(hudEl, dt > 0 ? 1 / dt : 0);
    if (inventoryHudEl && state.player) updateInventoryHud(inventoryHudEl);
  }
}

// Kick things off. buildDom() runs synchronously up front so #delve-canvas
// exists immediately; the HUD/overlay element refs and the menu/death
// buttons' click handlers are wired up once main() has created them. The
// menu overlay itself is shown last, once everything above is ready to
// react to it (renderMenu() reads state.meta, set earlier in main()).
main().then(() => {
  uiEl = document.getElementById('delve-ui');
  hudEl = document.getElementById('delve-debug-hud');
  inventoryHudEl = document.getElementById('delve-inventory-hud');
  deathOverlayEl = document.getElementById('delve-death-overlay');
  deathStatsEl = document.getElementById('delve-death-stats');
  menuOverlayEl = document.getElementById('delve-menu-overlay');
  menuEssenceEl = document.getElementById('delve-menu-essence');
  menuPerksEl = document.getElementById('delve-menu-perks');

  const continueBtn = document.getElementById('delve-death-continue-btn');
  continueBtn.addEventListener('click', goToMenu);

  const startBtn = document.getElementById('delve-start-btn');
  startBtn.addEventListener('click', startRun);

  showMenuOverlay();
});
