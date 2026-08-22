// main.js - Delve entry point. Loads three.js, builds the scene/DOM, wires
// up input, and owns the game loop. Iteration 1 delivered procedural dungeon
// + 3D rendering + player movement/collision + a fixed follow camera.
// Iteration 2 (this one) adds mouse-aim melee combat, player HP/death,
// enemies (enemies.js), and floor progression via a stairs beacon - see
// `state` below for the fields later iterations should build on.

import { generateDungeon, buildDungeonMeshes, CELL_SIZE } from './dungeon.js';
import { Player } from './player.js';
import { spawnEnemiesForDungeon, updateEnemies } from './enemies.js';
import { updateEnemyProjectiles } from './combat.js';
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
  // Simple state-machine field. 'dead' is set once state.player.hp reaches 0
  // (see the loop below) and freezes simulation updates - rendering keeps
  // going so the death overlay has the last frame behind it. Later work can
  // add e.g. 'paused' / 'levelling' without needing to touch how this field
  // is read elsewhere.
  status: 'playing',

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
  // an update(dt, dungeon, player, scene, enemyProjectiles) method). Loot
  // pickups may join this list in a later iteration.
  entities: [],

  // Enemy-fired projectiles in flight (see combat.js spawnProjectile/
  // updateEnemyProjectiles) - plain {position, velX, velZ, radius, damage,
  // mesh, ...} records, not full entities. state.playerProjectiles is
  // reserved for a future ranged player weapon; nothing populates it yet.
  enemyProjectiles: [],
  playerProjectiles: [],

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

  // Debug HUD - see the comment in delve.css; purely a development aid for
  // this iteration, attached inside #delve-ui so it's obvious where later
  // HUD/inventory elements should also attach.
  const hud = document.createElement('div');
  hud.id = 'delve-debug-hud';
  ui.appendChild(hud);

  // Death placeholder - a plain full-screen message, no restart/summary yet
  // (that's a later iteration). Hidden until state.status becomes 'dead'.
  const deathOverlay = document.createElement('div');
  deathOverlay.id = 'delve-death-overlay';
  deathOverlay.textContent = 'You Died';
  ui.appendChild(deathOverlay);

  return { canvas, ui, hud, deathOverlay };
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

// Builds a full floor's contents (dungeon meshes, stairs beacon, enemies)
// and wires them into `state` + `scene`. Shared by main()'s initial load and
// advanceFloor()'s floor transition so the two can't drift apart.
function loadFloor(THREE, scene, dungeon, floor) {
  const dungeonGroup = buildDungeonMeshes(dungeon, THREE);
  scene.add(dungeonGroup);

  const stairsMarker = buildStairsMarker(THREE);
  stairsMarker.position.set(dungeon.stairsPos.x, 0, dungeon.stairsPos.z);
  scene.add(stairsMarker);

  const entities = spawnEnemiesForDungeon(THREE, dungeon, floor);
  for (const enemy of entities) scene.add(enemy.mesh);

  state.dungeon = dungeon;
  state.dungeonGroup = dungeonGroup;
  state.stairsMarker = stairsMarker;
  state.entities = entities;
  state.floor = floor;
}

// Tears down the current floor's dungeon/beacon/entities/projectiles and
// replaces them with a freshly generated floor, repositioning the player at
// the new dungeon's start and bumping state.floor. Triggered when the
// player reaches the stairs beacon (see the loop below).
function advanceFloor() {
  const { THREE, scene } = state.three;

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
  state.enemyProjectiles.length = 0;
  state.playerProjectiles.length = 0;

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
  const { camera } = state.three;
  camera.position.set(
    dungeon.startPos.x + CAMERA_OFFSET.x,
    CAMERA_OFFSET.y,
    dungeon.startPos.z + CAMERA_OFFSET.z
  );

  floorToastTimer = FLOOR_TOAST_DURATION;
}

let floorToastTimer = 0;

async function main() {
  const { canvas } = buildDom();

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

  const dungeon = generateDungeon();
  setupLighting(THREE, scene, dungeon);
  loadFloor(THREE, scene, dungeon, 1);

  const player = new Player(THREE, dungeon.startPos);
  scene.add(player.mesh);
  state.player = player;
  state.aimPoint.x = player.position.x;
  state.aimPoint.z = player.position.z;

  lookAtTarget = new THREE.Vector3();
  aimRaycaster = new THREE.Raycaster();
  aimGroundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  aimHitPoint = new THREE.Vector3();

  // Place the camera immediately behind the player on the first frame
  // instead of lerping in from the origin.
  camera.position.set(
    player.position.x + CAMERA_OFFSET.x,
    CAMERA_OFFSET.y,
    player.position.z + CAMERA_OFFSET.z
  );
  lookAtTarget.set(player.position.x, CAMERA_LOOK_HEIGHT, player.position.z);
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

function updateHud(hud, fps) {
  const { player } = state;
  let text =
    `fps: ${fps.toFixed(0)}\n` +
    `floor: ${state.floor}\n` +
    `hp: ${player.hp}/${player.maxHp}\n` +
    `enemies: ${state.entities.length}\n` +
    `pos: ${player.position.x.toFixed(1)}, ${player.position.z.toFixed(1)}\n` +
    `facing: ${player.facingAngle.toFixed(2)} rad`;
  if (floorToastTimer > 0) {
    text += `\n\n-- Floor ${state.floor} --`;
  }
  hud.textContent = text;
}

let hudEl = null;
let hudAccum = 0;
let deathOverlayEl = null;

function loop(now) {
  requestAnimationFrame(loop);

  const dtRaw = (now - state.clock.lastTime) / 1000;
  state.clock.lastTime = now;
  const dt = clamp(dtRaw, 0, MAX_DT);
  state.clock.elapsed += dt;

  if (state.status === 'playing') {
    updateAimPoint(state.three.camera);

    const inputDir = computeInputDir(state.input);
    state.player.update(dt, inputDir, state.dungeon, state.aimPoint);
    if (state.input.attack) {
      state.player.attack(state.clock.elapsed, state.entities);
    }

    updateEnemies(state.entities, dt, state.dungeon, state.player, state.three.scene, state.enemyProjectiles);
    updateEnemyProjectiles(state.enemyProjectiles, dt, state.dungeon, state.three.scene, state.player);

    updateStairsMarker(state.stairsMarker, state.clock.elapsed);
    updateCamera(dt);

    if (floorToastTimer > 0) floorToastTimer = Math.max(0, floorToastTimer - dt);

    if (state.player.hp <= 0) {
      state.status = 'dead';
      if (deathOverlayEl) deathOverlayEl.classList.add('visible');
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
  if (hudEl && hudAccum > 0.2) {
    hudAccum = 0;
    updateHud(hudEl, dt > 0 ? 1 / dt : 0);
  }
}

// Kick things off. buildDom() runs synchronously up front so #delve-canvas
// exists immediately; hudEl/deathOverlayEl are grabbed once main() has
// created them.
main().then(() => {
  hudEl = document.getElementById('delve-debug-hud');
  deathOverlayEl = document.getElementById('delve-death-overlay');
});
