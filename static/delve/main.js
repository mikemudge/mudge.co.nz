// main.js - Delve entry point. Loads three.js, builds the scene/DOM, wires
// up input, and owns the game loop. This is iteration 1: procedural dungeon
// + 3D rendering + player movement/collision + a fixed follow camera. No
// combat/enemies/loot/persistence here - see `state` below for the hooks
// later iterations should extend.

import { generateDungeon, buildDungeonMeshes, CELL_SIZE } from './dungeon.js';
import { Player } from './player.js';
import { damp, clamp } from './utils.js';

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

// The vendored three.js build in this repo is old enough that
// `Object3D.lookAt` only accepts a single Vector3 argument (the (x, y, z)
// numeric overload didn't exist yet) - passing raw numbers silently no-ops
// instead of throwing. Reused every frame to avoid an allocation per call;
// created once THREE is available (see main()).
let lookAtTarget = null;

// ---------------------------------------------------------------------------
// Central game state - the contract later iterations (combat/enemies,
// loot/inventory, meta-progression/menus) should extend rather than
// restructure. Exported so those modules can `import { state } from
// './main.js'`.
// ---------------------------------------------------------------------------

export const state = {
  // Simple state-machine field. Only 'playing' exists this iteration; later
  // work can add e.g. 'paused' / 'dead' / 'levelling' without needing to
  // touch how this field is read elsewhere.
  status: 'playing',

  // three.js plumbing, all in one place.
  three: {
    THREE: null,
    renderer: null,
    scene: null,
    camera: null,
  },

  // The current dungeon's data (see dungeon.js for the full shape) and the
  // THREE.Group its meshes were built into (already added to the scene) -
  // exposed so a later iteration can e.g. add a stairs-down marker as a
  // child of this group.
  dungeon: null,
  dungeonGroup: null,

  // The player entity (see player.js) - state.player.position/.mesh/.radius.
  player: null,

  // Flat list of non-player entities. Empty this iteration; enemies/loot
  // pickups are expected to live here later, each presumably shaped like
  // Player (position, radius, mesh, an update(dt, ...) method).
  entities: [],

  // Current WASD/arrow key state, read fresh each frame in the game loop.
  input: { forward: false, back: false, left: false, right: false },

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

  return { canvas, ui, hud };
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
  const dungeonGroup = buildDungeonMeshes(dungeon, THREE);
  scene.add(dungeonGroup);
  state.dungeon = dungeon;
  state.dungeonGroup = dungeonGroup;

  setupLighting(THREE, scene, dungeon);

  const player = new Player(THREE, dungeon.startPos);
  scene.add(player.mesh);
  state.player = player;

  lookAtTarget = new THREE.Vector3();

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
  hud.textContent =
    `fps: ${fps.toFixed(0)}\n` +
    `pos: ${player.position.x.toFixed(1)}, ${player.position.z.toFixed(1)}\n` +
    `facing: ${player.facingAngle.toFixed(2)} rad`;
}

let hudEl = null;
let hudAccum = 0;

function loop(now) {
  requestAnimationFrame(loop);

  const dtRaw = (now - state.clock.lastTime) / 1000;
  state.clock.lastTime = now;
  const dt = clamp(dtRaw, 0, MAX_DT);
  state.clock.elapsed += dt;

  if (state.status === 'playing') {
    const inputDir = computeInputDir(state.input);
    state.player.update(dt, inputDir, state.dungeon);
    updateCamera(dt);
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
// exists immediately; hudEl is grabbed once main() has created it.
main().then(() => {
  hudEl = document.getElementById('delve-debug-hud');
});
