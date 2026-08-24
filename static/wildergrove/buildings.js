// Building definitions and placement for Wildergrove. Every building is a
// plain object with { type, x, y, solid, draw(), ...instance fields }
// produced by createBuilding(), following the same "plain object + doc
// comments explaining invariants" house style as static/driftworks/buildings.js.
//
// ASSUMED IMPORTS (flagged for the integration pass - not spelled out
// verbatim in the frozen contract):
// - render.js's file-layout entry says "camera helpers (copy the driftworks
//   pattern)". driftworks/render.js exports TILE_SIZE/worldToScreen/tilePx
//   with those exact names, so this file imports the same names from
//   wildergrove's render.js. The contract's `draw(ctx, x, y, camera)`
//   signature (world tile coords + camera, NOT pre-converted screen
//   pixels like driftworks' own buildings.js) means each draw() below does
//   its own world->screen conversion, so it needs these.
// - inventory.js is assumed to expose `hasItem(itemId, qty)` and
//   `removeItem(itemId, qty)` as basic primitives (only `consumeForRecipe`
//   is named explicitly anywhere in the brief for this module set, and
//   that's recipe-shaped, not cost-list-shaped, so building costs use
//   these two instead - see canAfford/consumeCost below).
import { TILE_SIZE, PALETTE, worldToScreen, tilePx } from './render.js';
import { restoreStamina } from './player.js';

function toScreen(x, y, camera) {
  const [sx, sy] = worldToScreen(camera, x * TILE_SIZE, y * TILE_SIZE);
  return [sx, sy, tilePx(camera)];
}

// --- Building catalogue ------------------------------------------------
// `inventoryBonus` (chest only) and `isBed` (bed only) are extra data
// fields beyond the contract's literal {id, name, cost, solid, draw} shape
// - additive per "deviate additively" - read by tryPlaceBuilding and by
// whatever bed-use hook calls onUse(), respectively.
// `requiresQuest` (null | questId) gates when a building first appears in
// ui.js's build palette - see isBuildingUnlocked() below. Chosen to mirror
// the tutorial chain's own order (each building unlocks right after the
// quest that motivates it), both to stop a brand-new player being handed
// all 8 options before they have context for any of them, and to close the
// "built a forge before its quest was active, so the building_placed event
// fired into a tracker that wasn't listening yet" bug confirmed in
// playtesting - you simply can't place it early anymore.
// `description` is a one-line tooltip for the build palette row.
// `repeatable` (fence only) keeps placement mode active after a successful
// placement instead of exiting it - fences are laid down in runs, not one
// at a time, per confirmed player feedback.
export const BUILDING_DEFS = {
  campfire: {
    id: 'campfire',
    name: 'Campfire',
    description: 'Cooking station. Lets you cook meals and lights the area at night.',
    cost: [{ item: 'wood', qty: 3 }, { item: 'stone', qty: 2 }],
    solid: true,
    // CONFIRMED BUG: this used to be 'talk_to_elder', one step earlier than
    // the build_campfire QUEST's own prereq ('gather_firewood'). Since
    // starting inventory is exactly 3 wood + 2 stone - campfire's exact
    // cost - a player could build it immediately after meeting Elder,
    // before ever gathering the 5 wood gather_firewood wants. That build
    // never counted toward build_campfire (the quest wasn't active yet to
    // hear it - same bug class as the forge issue from earlier
    // playtesting), left them with 0 wood/0 stone, and silently stalled
    // mine_stone too (it depends on build_campfire completing). Every other
    // building's gate already matches its own quest's prereq exactly; this
    // was the one gap.
    requiresQuest: 'gather_firewood',
    draw: drawCampfire,
  },
  crafting_bench: {
    id: 'crafting_bench',
    name: 'Crafting Bench',
    description: 'A proper place to work. Required before the forge can be built.',
    cost: [{ item: 'wood', qty: 6 }],
    solid: true,
    requiresQuest: 'build_campfire',
    draw: drawCraftingBench,
  },
  forge: {
    id: 'forge',
    name: 'Forge',
    description: 'Required nearby to craft tool upgrades (pickaxe/axe tiers).',
    cost: [{ item: 'stone', qty: 5 }, { item: 'copper_ore', qty: 2 }],
    solid: true,
    requiresQuest: 'build_crafting_bench',
    draw: drawForge,
  },
  fence: {
    id: 'fence',
    name: 'Fence',
    description: 'Marks a boundary. Placeable in a run without reselecting it each time.',
    cost: [{ item: 'wood', qty: 1 }],
    solid: true,
    repeatable: true,
    requiresQuest: 'build_forge',
    draw: drawFence,
  },
  chest: {
    id: 'chest',
    name: 'Chest',
    description: 'Grants 20 extra inventory slots once placed.',
    cost: [{ item: 'wood', qty: 4 }],
    solid: true,
    inventoryBonus: 20, // see tryPlaceBuilding's comment on how this is applied
    requiresQuest: 'build_forge',
    draw: drawChest,
  },
  bridge: {
    id: 'bridge',
    name: 'Bridge',
    description: 'Makes the water tile it sits on walkable.',
    cost: [{ item: 'wood', qty: 3 }],
    solid: false, // the whole point of a bridge is that it's walkable
    requiresQuest: 'build_forge',
    draw: drawBridge,
  },
  signpost: {
    id: 'signpost',
    name: 'Signpost',
    description: 'Purely decorative - a marker for your homestead.',
    cost: [{ item: 'wood', qty: 1 }],
    solid: true,
    requiresQuest: 'build_forge',
    draw: drawSignpost,
  },
  bed: {
    id: 'bed',
    name: 'Bed',
    description: 'Sleep to fully restore stamina and skip to the next day.',
    cost: [{ item: 'wood', qty: 6 }],
    solid: true,
    isBed: true, // cheap flag for lookups that don't have an instance handy
    requiresQuest: 'build_forge',
    draw: drawBed,
  },
  potter_wheel: {
    id: 'potter_wheel',
    name: "Potter's Wheel",
    description: 'Shapes clay into bowls for cooking.',
    cost: [{ item: 'wood', qty: 4 }, { item: 'clay', qty: 2 }],
    solid: true,
    requiresQuest: 'build_forge', // advanced homestead tier, same gate as fence/chest/bridge/signpost/bed
    draw: drawPotterWheel,
  },
  well: {
    id: 'well',
    name: 'Well',
    description: 'A local water source - refills your watering can without a trip to the river.',
    cost: [{ item: 'stone', qty: 4 }, { item: 'wood', qty: 2 }],
    solid: true,
    isWell: true, // cheap flag for lookups that don't have an instance handy, mirrors bed's isBed
    requiresQuest: 'build_forge', // same advanced homestead tier as fence/chest/bridge/signpost/bed
    draw: drawWell,
  },
};

// ui.js's build palette calls this to decide whether a building shows up at
// all yet. `isCompletedFn` is quests.js's live tracker's `isCompleted(id)`
// method, passed in rather than imported - buildings.js has no reason to
// know about quests.js's internals beyond "is this id done or not".
export function isBuildingUnlocked(type, isCompletedFn) {
  const def = BUILDING_DEFS[type];
  if (!def) return false;
  if (!def.requiresQuest) return true;
  return typeof isCompletedFn === 'function' && isCompletedFn(def.requiresQuest);
}

export function createBuilding(type, x, y) {
  const def = BUILDING_DEFS[type];
  if (!def) throw new Error(`Unknown building type: ${type}`);
  const instance = {
    type,
    x,
    y,
    solid: def.solid,
    draw(ctx, drawX, drawY, camera) {
      def.draw(ctx, drawX, drawY, camera);
    },
  };
  if (type === 'signpost') {
    instance.text = '';
    instance.setText = function setText(str) {
      this.text = String(str || '');
    };
  }
  if (type === 'bed') {
    // Sleeping fully restores stamina. Day-advancement itself (incrementing
    // the day counter, re-emitting `day_advanced`) is main.js's job, not
    // this module's - it's the only place that owns the day counter - so
    // onUse emits an additive `sleep_requested` event (not in the contract's
    // canonical event list, added per "deviate additively") for main.js to
    // react to, rather than guessing at main.js's internals here.
    instance.onUse = function onUse(ctx) {
      if (!ctx || !ctx.player || !ctx.eventBus) return false;
      restoreStamina(ctx.player, ctx.player.maxStamina);
      ctx.eventBus.emit('sleep_requested', {});
      return true;
    };
  }
  if (type === 'well') {
    // The actual watering-can refill logic lives in player.js, which is
    // being wired up elsewhere this same round - rather than guess at its
    // function names here, onUse emits an additive `well_used` event (same
    // pattern as bed's `sleep_requested` above) for that code to react to.
    instance.onUse = function onUse(ctx) {
      if (!ctx || !ctx.eventBus) return false;
      ctx.eventBus.emit('well_used', {});
      return true;
    };
  }
  return instance;
}

// Checks whether `inventory` holds enough of every item BUILDING_DEFS[type]
// costs. Returns false for an unknown type rather than throwing - keeps
// this usable from a hotbar-hover "can I afford this?" UI check too.
export function canAfford(type, inventory) {
  const def = BUILDING_DEFS[type];
  if (!def || !inventory) return false;
  return def.cost.every((c) => inventory.hasItem(c.item, c.qty));
}

function consumeCost(cost, inventory) {
  for (const c of cost) inventory.removeItem(c.item, c.qty);
}

// Validates cost + tile, consumes materials, places the building, and
// emits `building_placed`. Tile occupancy (`world.isTileFree`) is checked
// here as a fast pre-check that applies to every building type EXCEPT
// bridges: isTileFree correctly treats plain water as blocked (it has to,
// for player movement collision - see world.js's isTileFree comment), which
// would reject every bridge placement before world.placeBuilding (which
// DOES handle "bridge on water" correctly) ever runs. So bridges skip this
// pre-check entirely and go straight to world.placeBuilding, which is the
// authority on terrain suitability for every building type anyway - a
// falsy return from it is treated as "invalid tile for this building" and
// this function bails out before any materials are spent.
export function tryPlaceBuilding(type, x, y, world, inventory, eventBus) {
  const def = BUILDING_DEFS[type];
  if (!def || !world || !inventory || !eventBus) return false;
  if (!canAfford(type, inventory)) return false;
  if (type !== 'bridge' && typeof world.isTileFree === 'function' && !world.isTileFree(x, y)) return false;

  const instance = createBuilding(type, x, y);
  const placed = world.placeBuilding(instance);
  if (!placed) return false; // world.js rejected the tile (occupied/wrong terrain/out of bounds)

  consumeCost(def.cost, inventory);

  // Chest's +20 slots: inventory.js's real capacity API is `addSlots(n)` -
  // call it directly now that both sides are known.
  if (def.inventoryBonus && typeof inventory.addSlots === 'function') {
    inventory.addSlots(def.inventoryBonus);
  }

  eventBus.emit('building_placed', { type, x, y });
  return true;
}

// --- Draw functions ------------------------------------------------------
// Plain canvas primitives per the contract's palette description, warm
// rustic tones. Each takes (ctx, x, y, camera) with x/y in WORLD TILE
// coordinates (not screen pixels) - see the file header note on why.

function drawCampfire(ctx, x, y, camera) {
  const [sx, sy, size] = toScreen(x, y, camera);
  const cx = sx + size / 2;
  const cy = sy + size / 2;
  ctx.save();
  ctx.fillStyle = '#5c3a21'; // log base
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.2, size * 0.3, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8752c'; // fire body
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffcf5c'; // flame triangles
  for (const dx of [-0.11, 0, 0.11]) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * size, cy - size * 0.2);
    ctx.lineTo(cx + dx * size - size * 0.07, cy + size * 0.05);
    ctx.lineTo(cx + dx * size + size * 0.07, cy + size * 0.05);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// Confirmed player feedback: this used to be a plain brown fillRect + dark
// border - nearly the same recipe as farm.js's tilled-soil square (see
// render.js's drawFarmPlot), so a bench was easy to mistake for a patch of
// dirt. Given real structure instead: a tabletop that doesn't fill the
// whole tile (so it reads as furniture sitting ON the ground, not a ground
// tile itself), four visible legs, and a plank+tool detail on top so the
// silhouette says "workbench" even at a glance.
function drawCraftingBench(ctx, x, y, camera) {
  const [sx, sy, size] = toScreen(x, y, camera);
  const cx = sx + size / 2;
  ctx.save();

  // Legs, drawn first so the tabletop overlaps their tops.
  ctx.fillStyle = '#4a3320';
  const legW = size * 0.08;
  const legTop = sy + size * 0.42;
  const legBottom = sy + size * 0.88;
  for (const dx of [-0.32, 0.32]) {
    ctx.fillRect(cx + dx * size - legW / 2, legTop, legW, legBottom - legTop);
  }

  // Tabletop - narrower than a full tile and sitting in the upper-middle of
  // it, so it doesn't read as ground-level like a farm plot does.
  const topY = sy + size * 0.28;
  const topH = size * 0.18;
  const topPad = size * 0.12;
  ctx.fillStyle = '#8a6035';
  ctx.fillRect(sx + topPad, topY, size - topPad * 2, topH);
  ctx.strokeStyle = '#3a2b22';
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.strokeRect(sx + topPad, topY, size - topPad * 2, topH);
  // A plank-grain line down the middle of the top.
  ctx.beginPath();
  ctx.moveTo(sx + topPad, topY + topH / 2);
  ctx.lineTo(sx + size - topPad, topY + topH / 2);
  ctx.stroke();

  // A small tool laid on top (a light plank/chisel shape) for detail.
  ctx.fillStyle = '#c9b98a';
  ctx.fillRect(cx - size * 0.16, topY - size * 0.06, size * 0.32, size * 0.06);

  ctx.restore();
}

function drawForge(ctx, x, y, camera) {
  const [sx, sy, size] = toScreen(x, y, camera);
  const cx = sx + size / 2;
  const cy = sy + size / 2;
  const pad = size * 0.08;
  ctx.save();
  const glow = ctx.createRadialGradient(cx, cy, size * 0.05, cx, cy, size * 0.55);
  glow.addColorStop(0, 'rgba(212,175,55,0.55)'); // PALETTE.accent-ish orange glow
  glow.addColorStop(1, 'rgba(212,175,55,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sx - size * 0.25, sy - size * 0.25, size * 1.5, size * 1.5);
  ctx.fillStyle = '#2e2e33'; // dark rect body (cave-wall tone)
  ctx.fillRect(sx + pad, sy + pad, size - pad * 2, size - pad * 2);
  ctx.strokeStyle = '#111114';
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.strokeRect(sx + pad, sy + pad, size - pad * 2, size - pad * 2);
  ctx.fillStyle = '#e8752c'; // ember mouth
  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.1, size * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFence(ctx, x, y, camera) {
  const [sx, sy, size] = toScreen(x, y, camera);
  ctx.save();
  ctx.fillStyle = '#5c3a21'; // thin brown post
  const w = size * 0.16;
  ctx.fillRect(sx + size / 2 - w / 2, sy + size * 0.12, w, size * 0.76);
  ctx.fillRect(sx + size * 0.12, sy + size * 0.42, size * 0.76, size * 0.14); // crossbar
  ctx.strokeStyle = '#2b1c11';
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.strokeRect(sx + size / 2 - w / 2, sy + size * 0.12, w, size * 0.76);
  ctx.restore();
}

function drawChest(ctx, x, y, camera) {
  const [sx, sy, size] = toScreen(x, y, camera);
  const pad = size * 0.14;
  ctx.save();
  ctx.fillStyle = '#d9c398'; // tan (PALETTE.sand-ish) body
  ctx.fillRect(sx + pad, sy + pad, size - pad * 2, size - pad * 2);
  ctx.strokeStyle = '#8b6544';
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.strokeRect(sx + pad, sy + pad, size - pad * 2, size - pad * 2);
  ctx.beginPath(); // darker lid line
  ctx.moveTo(sx + pad, sy + size * 0.42);
  ctx.lineTo(sx + size - pad, sy + size * 0.42);
  ctx.strokeStyle = '#6b4a2f';
  ctx.lineWidth = Math.max(2, size * 0.05);
  ctx.stroke();
  ctx.restore();
}

function drawBridge(ctx, x, y, camera) {
  const [sx, sy, size] = toScreen(x, y, camera);
  ctx.save();
  ctx.fillStyle = '#d9c398'; // tan planks
  const plankH = size * 0.16;
  for (let i = 0; i < 4; i += 1) {
    const py = sy + size * 0.1 + i * (plankH + size * 0.04);
    ctx.fillRect(sx + size * 0.06, py, size * 0.88, plankH);
    ctx.strokeStyle = '#8b6544';
    ctx.lineWidth = Math.max(1, size * 0.02);
    ctx.strokeRect(sx + size * 0.06, py, size * 0.88, plankH);
  }
  ctx.restore();
}

function drawSignpost(ctx, x, y, camera) {
  const [sx, sy, size] = toScreen(x, y, camera);
  const cx = sx + size / 2;
  ctx.save();
  ctx.fillStyle = '#5c3a21'; // post
  ctx.fillRect(cx - size * 0.05, sy + size * 0.2, size * 0.1, size * 0.7);
  ctx.fillStyle = (PALETTE && PALETTE.accent) || '#d4af37'; // small flag
  ctx.beginPath();
  ctx.moveTo(cx + size * 0.05, sy + size * 0.22);
  ctx.lineTo(cx + size * 0.4, sy + size * 0.32);
  ctx.lineTo(cx + size * 0.05, sy + size * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#2b1c11';
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.stroke();
  ctx.restore();
}

function drawBed(ctx, x, y, camera) {
  const [sx, sy, size] = toScreen(x, y, camera);
  const pad = size * 0.1;
  ctx.save();
  ctx.fillStyle = '#7a5233'; // frame
  ctx.fillRect(sx + pad, sy + pad, size - pad * 2, size - pad * 2);
  ctx.fillStyle = '#e8dcc4'; // lighter pillow patch
  ctx.fillRect(sx + pad * 1.6, sy + pad * 1.6, size * 0.3, size * 0.3);
  ctx.strokeStyle = '#3a2b22';
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.strokeRect(sx + pad, sy + pad, size - pad * 2, size - pad * 2);
  ctx.restore();
}

// A squat wooden stand holding up a flat terracotta turntable (drawn as a
// squashed ellipse so it reads as viewed-from-above, matching campfire's
// disc treatment), plus rim/spoke lines for turntable detail and a small
// lump of wet clay on top so the silhouette says "potter's wheel" rather
// than just "round table".
function drawPotterWheel(ctx, x, y, camera) {
  const [sx, sy, size] = toScreen(x, y, camera);
  const cx = sx + size / 2;
  ctx.save();

  // Stand/base - a trapezoid the wheel sits on, drawn first so the disc
  // overlaps its top edge.
  ctx.fillStyle = '#4a3320'; // dark wood, matches crafting bench's legs
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.22, sy + size * 0.86);
  ctx.lineTo(cx + size * 0.22, sy + size * 0.86);
  ctx.lineTo(cx + size * 0.14, sy + size * 0.6);
  ctx.lineTo(cx - size * 0.14, sy + size * 0.6);
  ctx.closePath();
  ctx.fill();

  // Wheel disc - the flat terracotta turntable itself.
  const wheelCy = sy + size * 0.54;
  const wheelRx = size * 0.32;
  const wheelRy = size * 0.16;
  ctx.fillStyle = '#b5652f'; // muted clay/terracotta
  ctx.beginPath();
  ctx.ellipse(cx, wheelCy, wheelRx, wheelRy, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7a3f1d'; // darker rim
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.stroke();

  // Cross spokes across the disc for turntable detail.
  ctx.beginPath();
  ctx.moveTo(cx - wheelRx * 0.8, wheelCy);
  ctx.lineTo(cx + wheelRx * 0.8, wheelCy);
  ctx.moveTo(cx, wheelCy - wheelRy * 0.8);
  ctx.lineTo(cx, wheelCy + wheelRy * 0.8);
  ctx.strokeStyle = '#8a4a24';
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.stroke();

  // A lump of shaped clay/bowl sitting on top of the wheel.
  ctx.fillStyle = '#c9743f'; // lighter wet-clay tone
  ctx.beginPath();
  ctx.ellipse(cx, wheelCy - size * 0.07, size * 0.1, size * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a4a24';
  ctx.lineWidth = Math.max(1, size * 0.015);
  ctx.stroke();

  ctx.restore();
}

// A circular stone rim (ring, not a plain disc) with a darker inner circle
// suggesting the water below, plus a wooden crossbeam-and-bucket frame
// straddling it for silhouette recognizability - cool stone-gray for the
// well itself, warm wood-brown for the frame, matching the rest of the
// catalogue's rustic palette split (buildings = warm wood/stone tones,
// water = cool blue-gray, per render.js's PALETTE).
function drawWell(ctx, x, y, camera) {
  const [sx, sy, size] = toScreen(x, y, camera);
  const cx = sx + size / 2;
  ctx.save();

  // Two angled support posts, drawn first so the rim overlaps their bases.
  ctx.strokeStyle = '#6b4a2f'; // warm wood-brown frame
  ctx.lineWidth = Math.max(2, size * 0.07);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.34, sy + size * 0.9);
  ctx.lineTo(cx - size * 0.14, sy - size * 0.02);
  ctx.moveTo(cx + size * 0.34, sy + size * 0.9);
  ctx.lineTo(cx + size * 0.14, sy - size * 0.02);
  ctx.stroke();

  // Small peaked roof capping the two posts.
  ctx.fillStyle = '#7a5233'; // roof, matches bed's frame tone
  ctx.beginPath();
  ctx.moveTo(cx, sy - size * 0.16);
  ctx.lineTo(cx + size * 0.26, sy + size * 0.02);
  ctx.lineTo(cx - size * 0.26, sy + size * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#3a2b22';
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.stroke();

  // Bucket hanging on a rope from the roof's peak.
  ctx.strokeStyle = '#3a2b22';
  ctx.lineWidth = Math.max(1, size * 0.015);
  ctx.beginPath();
  ctx.moveTo(cx, sy - size * 0.14);
  ctx.lineTo(cx, sy + size * 0.18);
  ctx.stroke();
  ctx.fillStyle = '#8a6035'; // small wooden bucket
  ctx.fillRect(cx - size * 0.06, sy + size * 0.18, size * 0.12, size * 0.1);
  ctx.strokeRect(cx - size * 0.06, sy + size * 0.18, size * 0.12, size * 0.1);

  // Stone wall/rim - a filled circle in stone-gray...
  const rimCy = sy + size * 0.6;
  const rimR = size * 0.3;
  ctx.fillStyle = '#8a8d93'; // stone-gray rim
  ctx.beginPath();
  ctx.arc(cx, rimCy, rimR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#4f5257'; // darker stone outline
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.stroke();

  // ...with a darker inner circle suggesting depth/the water below.
  ctx.fillStyle = '#3d4f5c'; // dark cool-toned water/shadow
  ctx.beginPath();
  ctx.arc(cx, rimCy, rimR * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2b3a44';
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.stroke();

  ctx.restore();
}
