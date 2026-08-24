// Building definitions and per-instance behaviour for Driftworks. Every
// building is a plain object with { type, x, y, rotation, tier, tick, draw }
// produced by createBuilding(). Buildings that can receive a conveyed item
// additionally expose acceptItem(itemId, fromDirection) -> boolean.
//
// Direction convention (shared with grid/simulation/render): 0=up(-y),
// 1=right(+x), 2=down(+y), 3=left(-x). A building's `rotation` is one of
// these and is its primary "forward"/output direction unless documented
// otherwise below (splitter/merger use rotation to derive multiple sides).
//
// `fromDirection` passed into acceptItem is the direction of travel the
// item was moving in when it was pushed (i.e. the sending belt/building's
// own rotation) — NOT the side of the receiving tile. The side an item
// enters a building on is therefore the opposite of fromDirection.
import { ITEMS, RECIPES, RESOURCE_NODE_YIELDS, TECH_TREE } from './items.js';

// --- Direction helpers ------------------------------------------------------

const DIR_VECTORS = [
  { dx: 0, dy: -1 }, // 0 = up
  { dx: 1, dy: 0 }, // 1 = right
  { dx: 0, dy: 1 }, // 2 = down
  { dx: -1, dy: 0 }, // 3 = left
];

function perpDirs(dir) {
  return [(dir + 1) % 4, (dir + 3) % 4];
}

function forwardVector(dir) {
  return DIR_VECTORS[dir];
}

// Applies a free in-place rotation change to an already-placed building
// (used when re-placing the same building type over itself with a new
// rotation - see Simulation.placeBuilding). Most building types read
// `this.rotation` fresh every tick()/draw() call, so a plain assignment is
// enough. Splitter and merger are the exception: they cache their
// output/input sides (`outputs`/`inputSide`, `inputs`/`inputBuffer`) once
// at construction time from `rotation`, so those caches must be
// recomputed here or they'd silently keep pointing at the pre-rotation
// sides. A merger's inputBuffer is reset to empty for the (now different)
// input sides rather than remapped, since an item queued on an old input
// side has no well-defined new side to land on - equivalent to "no refund"
// for whatever was in flight, same spirit as the Remove tool.
export function reorientBuilding(building, rotation) {
  building.rotation = rotation;
  if (building.type === 'splitter') {
    building.outputs = perpDirs(rotation);
    building.inputSide = rotation;
  } else if (building.type === 'merger') {
    building.inputs = perpDirs(rotation);
    building.inputBuffer = { [building.inputs[0]]: null, [building.inputs[1]]: null };
  }
}

// --- Tunable constants -------------------------------------------------------

const BELT_CAPACITY = 4; // max items evenly spaced along one belt tile
const MIN_ITEM_GAP = 1 / BELT_CAPACITY; // minimum progress spacing between items
const BELT_SPEEDS = [1.5, 3, 4.5]; // tiles/sec, indexed by belt tier
const EXTRACTOR_BASE_INTERVAL = 3; // seconds per item at richness 1
const CRAFT_INPUT_CAP = 5; // per-item-type buffer cap on processors/assemblers
const SILO_CAP = 50; // per-item-type buffer cap on a storage silo

// --- Building catalogue -------------------------------------------------------

export const BUILDING_DEFS = {
  extractor: { name: 'Extractor', cost: { metal: 5 }, tier: 0, category: 'production' },
  belt: { name: 'Conveyor', cost: { metal: 1 }, tier: 0, category: 'logistics' },
  splitter: { name: 'Splitter', cost: { metal: 3 }, tier: 0, category: 'logistics' },
  merger: { name: 'Merger', cost: { metal: 3 }, tier: 0, category: 'logistics' },
  processor: { name: 'Processor', cost: { metal: 8 }, tier: 0, category: 'production' },
  assembler: { name: 'Assembler', cost: { metal: 10, glass: 4 }, tier: 1, category: 'production' },
  silo: { name: 'Storage Silo', cost: { metal: 6 }, tier: 0, category: 'logistics' },
  dock: { name: 'Dock', cost: { metal: 15 }, tier: 0, category: 'shipping' },
  seawall: { name: 'Seawall', cost: { metal: 6, resin: 2 }, tier: 0, category: 'defense' },
  reclaimer: { name: 'Reclaimer', cost: { metal: 20, resin: 5 }, tier: 1, category: 'defense' },
};

export function createBuilding(type, x, y, rotation = 0) {
  switch (type) {
    case 'extractor':
      return createExtractor(x, y, rotation);
    case 'belt':
      return createBelt(x, y, rotation);
    case 'splitter':
      return createSplitter(x, y, rotation);
    case 'merger':
      return createMerger(x, y, rotation);
    case 'processor':
      return createCrafter('processor', x, y, rotation);
    case 'assembler':
      return createCrafter('assembler', x, y, rotation);
    case 'silo':
      return createSilo(x, y, rotation);
    case 'dock':
      return createDock(x, y, rotation);
    case 'seawall':
      return createSeawall(x, y, rotation);
    case 'reclaimer':
      return createReclaimer(x, y, rotation);
    default:
      throw new Error(`Unknown building type: ${type}`);
  }
}

function itemColor(itemId) {
  return (ITEMS[itemId] && ITEMS[itemId].color) || '#cccccc';
}

// --- Shared draw helpers -----------------------------------------------------
// Small building-agnostic pieces reused across draw() methods below so
// buildings stay legible at a glance — and consistent with each other —
// even at small zoomed-out tile sizes.

// Soft dark ellipse under a building's footprint for contrast against grass.
function drawGroundShadow(ctx2d, cx, cy, radiusX, radiusY) {
  ctx2d.save();
  ctx2d.fillStyle = 'rgba(8, 14, 10, 0.32)';
  ctx2d.beginPath();
  ctx2d.ellipse(cx, cy + radiusY * 0.15, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.restore();
}

// A solid signpost-style arrow, drawn pointing "up" in local space and then
// rotated to face `dir` (0=up/1=right/2=down/3=left, same convention as
// `rotation`/DIR_VECTORS above). Used as a static output-direction
// indicator on extractor/belt/splitter/merger so flow direction reads at a
// glance even while idle/empty, before anything has moved yet.
function drawOutputChevron(ctx2d, cx, cy, size, dir, color, alpha = 1, outline = 'rgba(15,18,22,0.8)') {
  ctx2d.save();
  ctx2d.globalAlpha = alpha;
  ctx2d.translate(cx, cy);
  ctx2d.rotate((dir * Math.PI) / 2);
  ctx2d.beginPath();
  ctx2d.moveTo(0, -size * 0.55);
  ctx2d.lineTo(size * 0.42, size * 0.05);
  ctx2d.lineTo(size * 0.16, size * 0.05);
  ctx2d.lineTo(size * 0.16, size * 0.5);
  ctx2d.lineTo(-size * 0.16, size * 0.5);
  ctx2d.lineTo(-size * 0.16, size * 0.05);
  ctx2d.lineTo(-size * 0.42, size * 0.05);
  ctx2d.closePath();
  ctx2d.fillStyle = color;
  ctx2d.fill();
  if (outline) {
    ctx2d.lineWidth = Math.max(1, size * 0.08);
    ctx2d.strokeStyle = outline;
    ctx2d.stroke();
  }
  ctx2d.restore();
}

// Small corner pip marking a building instance as an upgraded tier (tier >
// 0 — e.g. the assembler/reclaimer, or a belt bumped to a faster tier via
// tech). Purely cosmetic: `this.tier` / BUILDING_DEFS.tier remain the only
// source of truth for gating and speed, this just reflects that value.
function drawTierPip(ctx2d, screenX, screenY, tileSizePx, tier) {
  if (!tier) return;
  const r = tileSizePx * (0.08 + Math.min(tier, 2) * 0.02);
  const bx = screenX + tileSizePx - r * 1.5;
  const by = screenY + r * 1.5;
  ctx2d.save();
  ctx2d.fillStyle = tier >= 2 ? '#ffe066' : '#8be06a';
  ctx2d.beginPath();
  ctx2d.arc(bx, by, r, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.strokeStyle = 'rgba(18,22,26,0.85)';
  ctx2d.lineWidth = Math.max(1, tileSizePx * 0.018);
  ctx2d.stroke();
  ctx2d.restore();
}

// Ring showing craft progress (0..1) around a processor/assembler. draw()
// has no wall-clock time source available — render.js's drawWorld() calls
// `building.draw(ctx, sx, sy, size, camera)`, but `camera` is just
// `{x, y, zoom}` (see render.js worldToScreen/tilePx), not a clock — so
// rather than a true animation this renders as a static arc reflecting
// whatever fraction of `recipe.time` the instance has already spent on
// `craftTimer`, which IS available on the instance.
function drawCraftProgressRing(ctx2d, cx, cy, radius, progress, color) {
  ctx2d.save();
  ctx2d.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx2d.lineWidth = Math.max(1.5, radius * 0.24);
  ctx2d.beginPath();
  ctx2d.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx2d.stroke();
  ctx2d.strokeStyle = color;
  ctx2d.lineCap = 'round';
  ctx2d.beginPath();
  ctx2d.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.max(0.02, progress) * Math.PI * 2);
  ctx2d.stroke();
  ctx2d.restore();
}

// Which item's color to surface as a quick "what am I working on" swatch:
// the recipe currently being crafted if one is running, otherwise whatever
// item is sitting in the input buffer waiting for a recipe to unlock.
function activeCraftSwatchItem(instance) {
  if (instance.craftingRecipe) return instance.craftingRecipe.outputs[0].item;
  for (const id of Object.keys(instance.inputBuffers)) {
    if (instance.inputBuffers[id] > 0) return id;
  }
  return null;
}

// Attempts to push an item onto whatever building sits at `dir` from
// (x, y). Returns true if the neighbor accepted it.
function pushForward(ctx, dir, itemId) {
  const { dx, dy } = forwardVector(dir);
  const neighbor = ctx.getNeighborBuilding(dx, dy);
  if (neighbor && typeof neighbor.acceptItem === 'function') {
    return neighbor.acceptItem(itemId, dir);
  }
  return false;
}

// --- Extractor ---------------------------------------------------------------

function createExtractor(x, y, rotation) {
  return {
    type: 'extractor',
    x,
    y,
    rotation,
    tier: BUILDING_DEFS.extractor.tier,
    outputItem: null,
    produceTimer: 0,
    tick(dt, ctx) {
      const tile = ctx.selfTile;
      const resource = tile && tile.resource;
      if (this.outputItem === null && resource) {
        const richness = resource.richness || 1;
        const interval = EXTRACTOR_BASE_INTERVAL / richness;
        this.produceTimer += dt;
        if (this.produceTimer >= interval) {
          this.produceTimer -= interval;
          const itemId = RESOURCE_NODE_YIELDS[resource.kind];
          if (itemId) this.outputItem = itemId;
        }
      }
      if (this.outputItem !== null && pushForward(ctx, this.rotation, this.outputItem)) {
        this.outputItem = null;
      }
    },
    draw(ctx2d, screenX, screenY, tileSizePx) {
      const cx = screenX + tileSizePx / 2;
      const cy = screenY + tileSizePx / 2;
      const pad = tileSizePx * 0.12;
      drawGroundShadow(ctx2d, cx, cy, tileSizePx * 0.4, tileSizePx * 0.16);
      // Base pylon.
      ctx2d.fillStyle = '#69768a';
      ctx2d.fillRect(screenX + pad, screenY + pad, tileSizePx - pad * 2, tileSizePx - pad * 2);
      ctx2d.strokeStyle = '#20252c';
      ctx2d.lineWidth = Math.max(1, tileSizePx * 0.035);
      ctx2d.strokeRect(screenX + pad, screenY + pad, tileSizePx - pad * 2, tileSizePx - pad * 2);
      // Drill bit doubles as a static output-direction chevron, pointing
      // toward the rotation the extractor feeds items into — visible even
      // while idle/empty, before anything has been produced yet.
      ctx2d.save();
      ctx2d.translate(cx, cy);
      ctx2d.rotate((this.rotation * Math.PI) / 2);
      ctx2d.fillStyle = '#ffcf5c';
      ctx2d.strokeStyle = '#20252c';
      ctx2d.lineWidth = Math.max(1, tileSizePx * 0.025);
      const r = tileSizePx * 0.24;
      ctx2d.beginPath();
      ctx2d.moveTo(0, -r * 1.6);
      ctx2d.lineTo(r * 0.85, r * 0.6);
      ctx2d.lineTo(-r * 0.85, r * 0.6);
      ctx2d.closePath();
      ctx2d.fill();
      ctx2d.stroke();
      ctx2d.restore();
      // Held output item indicator.
      if (this.outputItem) {
        ctx2d.fillStyle = itemColor(this.outputItem);
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, tileSizePx * 0.1, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.strokeStyle = 'rgba(15,18,22,0.85)';
        ctx2d.lineWidth = Math.max(1, tileSizePx * 0.02);
        ctx2d.stroke();
      }
      drawTierPip(ctx2d, screenX, screenY, tileSizePx, this.tier);
    },
  };
}

// --- Belt (conveyor) ----------------------------------------------------------

function createBelt(x, y, rotation) {
  return {
    type: 'belt',
    x,
    y,
    rotation,
    tier: BUILDING_DEFS.belt.tier,
    items: [], // [{ itemId, progress }] progress 0..1 along `rotation`
    acceptItem(itemId /*, fromDirection */) {
      let minProgress = 1;
      for (const it of this.items) {
        if (it.progress < minProgress) minProgress = it.progress;
      }
      if (this.items.length >= BELT_CAPACITY) return false;
      if (this.items.length > 0 && minProgress < MIN_ITEM_GAP) return false;
      this.items.push({ itemId, progress: 0 });
      return true;
    },
    tick(dt, ctx) {
      const speed = BELT_SPEEDS[this.tier] ?? BELT_SPEEDS[0];
      const delta = speed * dt;
      // Process front-to-back so a leading item's motion this tick is
      // resolved before the item behind it decides how far it can move.
      this.items.sort((a, b) => b.progress - a.progress);
      let aheadLimit = 1;
      for (const item of this.items) {
        const target = Math.min(item.progress + delta, aheadLimit);
        if (target >= 1) {
          if (pushForward(ctx, this.rotation, item.itemId)) {
            item.progress = 2; // sentinel: leaving the belt this tick
            aheadLimit = 1; // the vacated slot frees up the whole tile ahead
            continue;
          }
          item.progress = 1; // queued at the end, blocked
        } else {
          item.progress = target;
        }
        aheadLimit = item.progress - MIN_ITEM_GAP;
      }
      if (this.items.some((it) => it.progress > 1)) {
        this.items = this.items.filter((it) => it.progress <= 1);
      }
    },
    draw(ctx2d, screenX, screenY, tileSizePx) {
      const pad = tileSizePx * 0.1;
      const hasItems = this.items.length > 0;
      // Lane body gets brighter/greener per tier so an upgraded (faster)
      // belt reads differently from a base one at a glance.
      const laneColors = ['#454e59', '#4c6a56', '#5c7a4a'];
      ctx2d.fillStyle = laneColors[this.tier] || laneColors[0];
      ctx2d.fillRect(screenX + pad, screenY + pad, tileSizePx - pad * 2, tileSizePx - pad * 2);
      ctx2d.strokeStyle = '#1c2126';
      ctx2d.lineWidth = Math.max(1, tileSizePx * 0.02);
      ctx2d.strokeRect(screenX + pad, screenY + pad, tileSizePx - pad * 2, tileSizePx - pad * 2);
      // Static direction arrow: full strength while idle so route planning
      // reads clearly before anything is flowing; dimmed (never hidden)
      // once items are riding the belt so it doesn't fight with them.
      drawOutputChevron(
        ctx2d,
        screenX + tileSizePx / 2,
        screenY + tileSizePx / 2,
        tileSizePx * 0.62,
        this.rotation,
        '#dce6f0',
        hasItems ? 0.45 : 0.9
      );
      // Items riding the belt, positioned along the travel direction.
      const { dx, dy } = forwardVector(this.rotation);
      for (const item of this.items) {
        const t = Math.min(item.progress, 1);
        const ix = screenX + tileSizePx / 2 + dx * (t - 0.5) * tileSizePx;
        const iy = screenY + tileSizePx / 2 + dy * (t - 0.5) * tileSizePx;
        const s = tileSizePx * 0.18;
        ctx2d.fillStyle = itemColor(item.itemId);
        ctx2d.fillRect(ix - s / 2, iy - s / 2, s, s);
        ctx2d.strokeStyle = 'rgba(15,18,22,0.85)';
        ctx2d.lineWidth = Math.max(1, tileSizePx * 0.018);
        ctx2d.strokeRect(ix - s / 2, iy - s / 2, s, s);
      }
      drawTierPip(ctx2d, screenX, screenY, tileSizePx, this.tier);
    },
  };
}

// --- Splitter (1 in / 2 out) --------------------------------------------------

function createSplitter(x, y, rotation) {
  const outputs = perpDirs(rotation);
  return {
    type: 'splitter',
    x,
    y,
    rotation,
    tier: BUILDING_DEFS.splitter.tier,
    inputSide: rotation, // fromDirection accepted is the rotation itself (input tile is opposite(rotation))
    outputs,
    nextOutput: 0,
    buffer: null,
    acceptItem(itemId, fromDirection) {
      if (this.buffer !== null) return false;
      if (fromDirection !== this.inputSide) return false;
      this.buffer = itemId;
      return true;
    },
    tick(dt, ctx) {
      if (this.buffer === null) return;
      const order = [this.outputs[this.nextOutput], this.outputs[1 - this.nextOutput]];
      for (const dir of order) {
        if (pushForward(ctx, dir, this.buffer)) {
          this.buffer = null;
          this.nextOutput = 1 - this.nextOutput;
          break;
        }
      }
    },
    draw(ctx2d, screenX, screenY, tileSizePx) {
      const cx = screenX + tileSizePx / 2;
      const cy = screenY + tileSizePx / 2;
      drawGroundShadow(ctx2d, cx, cy, tileSizePx * 0.42, tileSizePx * 0.2);
      ctx2d.fillStyle = '#525d70';
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, tileSizePx * 0.4, 0, Math.PI * 2);
      ctx2d.fill();
      ctx2d.strokeStyle = '#1c2126';
      ctx2d.lineWidth = Math.max(1, tileSizePx * 0.03);
      ctx2d.stroke();
      // Static output chevrons — clear even before the splitter has ever
      // fired, and both sides are shown at once (unlike the merger, a
      // splitter always feeds both outputs in alternation).
      for (const dir of this.outputs) {
        drawOutputChevron(ctx2d, cx, cy, tileSizePx * 0.62, dir, '#e2e8f0', 0.9);
      }
      if (this.buffer) {
        ctx2d.fillStyle = itemColor(this.buffer);
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, tileSizePx * 0.15, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.strokeStyle = 'rgba(15,18,22,0.85)';
        ctx2d.lineWidth = Math.max(1, tileSizePx * 0.02);
        ctx2d.stroke();
      }
      drawTierPip(ctx2d, screenX, screenY, tileSizePx, this.tier);
    },
  };
}

// --- Merger (2 in / 1 out) ----------------------------------------------------

function createMerger(x, y, rotation) {
  const inputs = perpDirs(rotation);
  return {
    type: 'merger',
    x,
    y,
    rotation,
    tier: BUILDING_DEFS.merger.tier,
    inputs,
    inputBuffer: { [inputs[0]]: null, [inputs[1]]: null },
    turn: 0,
    acceptItem(itemId, fromDirection) {
      if (!this.inputs.includes(fromDirection)) return false;
      if (this.inputBuffer[fromDirection] !== null) return false;
      this.inputBuffer[fromDirection] = itemId;
      return true;
    },
    tick(dt, ctx) {
      const order = this.turn === 0 ? this.inputs : [this.inputs[1], this.inputs[0]];
      for (const side of order) {
        const item = this.inputBuffer[side];
        if (item === null) continue;
        if (pushForward(ctx, this.rotation, item)) {
          this.inputBuffer[side] = null;
          this.turn = 1 - this.turn;
          break;
        }
      }
    },
    draw(ctx2d, screenX, screenY, tileSizePx) {
      const cx = screenX + tileSizePx / 2;
      const cy = screenY + tileSizePx / 2;
      drawGroundShadow(ctx2d, cx, cy, tileSizePx * 0.42, tileSizePx * 0.2);
      // Wedge body, rotated to point toward the merger's single output side
      // (previously always drawn pointing straight up regardless of
      // `rotation`, which misrepresented flow direction at a glance).
      ctx2d.save();
      ctx2d.translate(cx, cy);
      ctx2d.rotate((this.rotation * Math.PI) / 2);
      ctx2d.fillStyle = '#525d70';
      ctx2d.beginPath();
      ctx2d.moveTo(0, -tileSizePx * 0.4);
      ctx2d.lineTo(tileSizePx * 0.4, tileSizePx * 0.3);
      ctx2d.lineTo(-tileSizePx * 0.4, tileSizePx * 0.3);
      ctx2d.closePath();
      ctx2d.fill();
      ctx2d.strokeStyle = '#1c2126';
      ctx2d.lineWidth = Math.max(1, tileSizePx * 0.03);
      ctx2d.stroke();
      ctx2d.restore();
      // Static output chevron toward the merged output side.
      drawOutputChevron(ctx2d, cx, cy, tileSizePx * 0.56, this.rotation, '#e2e8f0', 0.9);
      for (const side of this.inputs) {
        const item = this.inputBuffer[side];
        if (item) {
          const { dx, dy } = forwardVector(side);
          ctx2d.fillStyle = itemColor(item);
          ctx2d.beginPath();
          ctx2d.arc(cx + dx * tileSizePx * 0.28, cy + dy * tileSizePx * 0.28, tileSizePx * 0.11, 0, Math.PI * 2);
          ctx2d.fill();
          ctx2d.strokeStyle = 'rgba(15,18,22,0.85)';
          ctx2d.lineWidth = Math.max(1, tileSizePx * 0.018);
          ctx2d.stroke();
        }
      }
      drawTierPip(ctx2d, screenX, screenY, tileSizePx, this.tier);
    },
  };
}

// --- Processor / Assembler (recipe crafting) ----------------------------------

// Tier-0 recipes are available from the start; anything higher-tier must be
// unlocked via a TECH_TREE node whose `unlocks.recipes` lists it.
function isRecipeUnlocked(recipe, unlockedTechIds) {
  if (recipe.tier === 0) return true;
  if (!unlockedTechIds) return false;
  return TECH_TREE.some(
    (node) =>
      unlockedTechIds.has(node.id) &&
      node.unlocks &&
      Array.isArray(node.unlocks.recipes) &&
      node.unlocks.recipes.includes(recipe.id)
  );
}

function pickRecipe(buildingType, inputBuffers, unlockedTechIds) {
  const candidateIds = Object.keys(RECIPES).sort();
  for (const id of candidateIds) {
    const recipe = RECIPES[id];
    if (recipe.building !== buildingType) continue;
    if (!isRecipeUnlocked(recipe, unlockedTechIds)) continue;
    const hasAllInputs = recipe.inputs.every((req) => (inputBuffers[req.item] || 0) >= req.qty);
    if (hasAllInputs) return recipe;
  }
  return null;
}

function createCrafter(type, x, y, rotation) {
  return {
    type,
    x,
    y,
    rotation,
    tier: BUILDING_DEFS[type].tier,
    inputBuffers: {}, // itemId -> qty
    craftingRecipe: null,
    craftTimer: 0,
    pendingOutput: null, // { itemId, qty }
    acceptItem(itemId /*, fromDirection */) {
      const held = this.inputBuffers[itemId] || 0;
      if (held >= CRAFT_INPUT_CAP) return false;
      this.inputBuffers[itemId] = held + 1;
      return true;
    },
    tick(dt, ctx) {
      // Drain any finished output first so the machine can free up as soon
      // as the belt ahead has room.
      if (this.pendingOutput) {
        if (pushForward(ctx, this.rotation, this.pendingOutput.itemId)) {
          this.pendingOutput.qty -= 1;
          if (this.pendingOutput.qty <= 0) this.pendingOutput = null;
        }
      }
      if (this.pendingOutput) return; // still shipping out the last craft

      if (!this.craftingRecipe) {
        const unlockedTech = ctx.economy && ctx.economy.unlockedTech;
        const recipe = pickRecipe(this.type, this.inputBuffers, unlockedTech);
        if (recipe) {
          for (const req of recipe.inputs) {
            this.inputBuffers[req.item] -= req.qty;
          }
          this.craftingRecipe = recipe;
          this.craftTimer = 0;
        } else {
          return;
        }
      }

      this.craftTimer += dt;
      if (this.craftTimer >= this.craftingRecipe.time) {
        const output = this.craftingRecipe.outputs[0];
        this.pendingOutput = { itemId: output.item, qty: output.qty };
        this.craftingRecipe = null;
        this.craftTimer = 0;
      }
    },
    draw(ctx2d, screenX, screenY, tileSizePx) {
      const cx = screenX + tileSizePx / 2;
      const cy = screenY + tileSizePx / 2;
      const pad = tileSizePx * 0.1;
      const isActive = !!this.craftingRecipe;
      // No wall-clock time reaches draw() (see drawCraftProgressRing above),
      // so "in progress" is read off state already tracked on the instance.
      const progress = isActive ? Math.min(1, this.craftTimer / this.craftingRecipe.time) : 0;
      drawGroundShadow(ctx2d, cx, cy, tileSizePx * 0.42, tileSizePx * 0.18);
      if (type === 'processor') {
        // Furnace-like blob: rounded body with a glowing core.
        ctx2d.fillStyle = '#6b4a3d';
        ctx2d.beginPath();
        ctx2d.ellipse(cx, cy, tileSizePx * 0.38, tileSizePx * 0.32, 0, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.strokeStyle = '#241a15';
        ctx2d.lineWidth = Math.max(1, tileSizePx * 0.03);
        ctx2d.stroke();
        const glow = isActive ? 0.95 : 0.3;
        ctx2d.fillStyle = `rgba(255, 140, 40, ${glow})`;
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, tileSizePx * 0.17, 0, Math.PI * 2);
        ctx2d.fill();
        if (isActive) drawCraftProgressRing(ctx2d, cx, cy, tileSizePx * 0.3, progress, '#ffb54d');
      } else {
        // Assembler: geared box, trim brightens once tiered up.
        ctx2d.fillStyle = '#3f5568';
        ctx2d.fillRect(screenX + pad, screenY + pad, tileSizePx - pad * 2, tileSizePx - pad * 2);
        ctx2d.strokeStyle = this.tier > 0 ? '#7fd8ff' : '#cbd5e1';
        ctx2d.lineWidth = Math.max(1, tileSizePx * 0.035);
        ctx2d.strokeRect(screenX + pad, screenY + pad, tileSizePx - pad * 2, tileSizePx - pad * 2);
        const spin = isActive ? this.craftTimer * 4 : 0;
        drawGear(ctx2d, cx, cy, tileSizePx * 0.22, 8, spin);
        if (isActive) drawCraftProgressRing(ctx2d, cx, cy, tileSizePx * 0.34, progress, '#7fe0ff');
      }
      // "What am I working on" swatch: colored to match the active recipe's
      // output, or whatever's queued in the input buffer if nothing's
      // crafting yet — readable without a tooltip.
      const swatchItem = activeCraftSwatchItem(this);
      if (swatchItem) {
        const sx = screenX + tileSizePx * 0.22;
        const sy = screenY + tileSizePx * 0.22;
        ctx2d.fillStyle = itemColor(swatchItem);
        ctx2d.beginPath();
        ctx2d.arc(sx, sy, tileSizePx * 0.09, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.strokeStyle = 'rgba(15,18,22,0.85)';
        ctx2d.lineWidth = Math.max(1, tileSizePx * 0.018);
        ctx2d.stroke();
      }
      if (this.pendingOutput) {
        ctx2d.fillStyle = itemColor(this.pendingOutput.itemId);
        const { dx, dy } = forwardVector(this.rotation);
        ctx2d.beginPath();
        ctx2d.arc(cx + dx * tileSizePx * 0.3, cy + dy * tileSizePx * 0.3, tileSizePx * 0.1, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.strokeStyle = 'rgba(15,18,22,0.85)';
        ctx2d.lineWidth = Math.max(1, tileSizePx * 0.018);
        ctx2d.stroke();
      }
      drawTierPip(ctx2d, screenX, screenY, tileSizePx, this.tier);
    },
  };
}

function drawGear(ctx2d, cx, cy, radius, teeth, rotationRad) {
  ctx2d.save();
  ctx2d.translate(cx, cy);
  ctx2d.rotate(rotationRad);
  ctx2d.fillStyle = '#e8b23d';
  ctx2d.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? radius : radius * 0.65;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx2d.moveTo(px, py);
    else ctx2d.lineTo(px, py);
  }
  ctx2d.closePath();
  ctx2d.fill();
  ctx2d.fillStyle = '#3f5568';
  ctx2d.beginPath();
  ctx2d.arc(0, 0, radius * 0.35, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.restore();
}

// --- Silo ----------------------------------------------------------------------

function createSilo(x, y, rotation) {
  return {
    type: 'silo',
    x,
    y,
    rotation,
    tier: BUILDING_DEFS.silo.tier,
    buffer: {}, // itemId -> qty
    acceptItem(itemId /*, fromDirection */) {
      const held = this.buffer[itemId] || 0;
      if (held >= SILO_CAP) return false;
      this.buffer[itemId] = held + 1;
      return true;
    },
    tick(dt, ctx) {
      for (const itemId of Object.keys(this.buffer)) {
        const qty = this.buffer[itemId];
        if (qty > 0) {
          ctx.economy.addToStockpile(itemId, qty);
          this.buffer[itemId] = 0;
        }
      }
    },
    draw(ctx2d, screenX, screenY, tileSizePx) {
      const cx = screenX + tileSizePx / 2;
      const top = screenY + tileSizePx * 0.12;
      const bottom = screenY + tileSizePx * 0.88;
      const w = tileSizePx * 0.32;
      drawGroundShadow(ctx2d, cx, bottom, w * 1.1, tileSizePx * 0.08);
      ctx2d.fillStyle = '#8c9aa8';
      ctx2d.fillRect(cx - w, top, w * 2, bottom - top);
      ctx2d.beginPath();
      ctx2d.ellipse(cx, top, w, tileSizePx * 0.08, 0, 0, Math.PI * 2);
      ctx2d.fillStyle = '#a3b0bc';
      ctx2d.fill();
      ctx2d.fillStyle = '#5a6672';
      ctx2d.beginPath();
      ctx2d.ellipse(cx, bottom, w, tileSizePx * 0.08, 0, 0, Math.PI, false);
      ctx2d.fill();
      ctx2d.strokeStyle = '#22262b';
      ctx2d.lineWidth = Math.max(1, tileSizePx * 0.03);
      ctx2d.strokeRect(cx - w, top, w * 2, bottom - top);
      const totalHeld = Object.values(this.buffer).reduce((a, b) => a + b, 0);
      if (totalHeld > 0) {
        ctx2d.fillStyle = '#f0dd6a';
        const fillH = Math.min(1, totalHeld / 20) * (bottom - top - 6);
        ctx2d.fillRect(cx - w + 3, bottom - 3 - fillH, w * 2 - 6, fillH);
      }
      drawTierPip(ctx2d, screenX, screenY, tileSizePx, this.tier);
    },
  };
}

// --- Dock ------------------------------------------------------------------

function createDock(x, y, rotation) {
  return {
    type: 'dock',
    x,
    y,
    rotation,
    tier: BUILDING_DEFS.dock.tier,
    lastDelivery: 0, // seconds remaining on a small draw flash
    _economy: null, // captured from ctx on tick(); acceptItem has no ctx of its own
    _pendingBeforeFirstTick: [], // safety net for an item arriving before this dock has ever ticked
    acceptItem(itemId /*, fromDirection */) {
      // Dock never buffers inventory: report the delivery immediately if we
      // already know about the economy, otherwise queue the report itself
      // (not the item) for the moment tick() first hands us ctx.economy.
      if (this._economy) {
        this._economy.reportDockDelivery(itemId, 1);
        this.lastDelivery = 0.35;
      } else {
        this._pendingBeforeFirstTick.push(itemId);
      }
      return true;
    },
    tick(dt, ctx) {
      this._economy = ctx.economy;
      if (this._pendingBeforeFirstTick.length > 0) {
        for (const itemId of this._pendingBeforeFirstTick) {
          this._economy.reportDockDelivery(itemId, 1);
        }
        this.lastDelivery = 0.35;
        this._pendingBeforeFirstTick = [];
      }
      if (this.lastDelivery > 0) this.lastDelivery = Math.max(0, this.lastDelivery - dt);
    },
    draw(ctx2d, screenX, screenY, tileSizePx) {
      const pad = tileSizePx * 0.08;
      drawGroundShadow(ctx2d, screenX + tileSizePx / 2, screenY + tileSizePx * 0.9, tileSizePx * 0.42, tileSizePx * 0.14);
      ctx2d.fillStyle = '#4a4030';
      ctx2d.fillRect(screenX + pad, screenY + pad, tileSizePx - pad * 2, tileSizePx - pad * 2);
      ctx2d.strokeStyle = '#221c14';
      ctx2d.lineWidth = Math.max(1, tileSizePx * 0.03);
      ctx2d.strokeRect(screenX + pad, screenY + pad, tileSizePx - pad * 2, tileSizePx - pad * 2);
      // Jetty planks.
      ctx2d.strokeStyle = '#a5825a';
      ctx2d.lineWidth = Math.max(1, tileSizePx * 0.045);
      const plankCount = 4;
      for (let i = 0; i < plankCount; i++) {
        const t = (i + 0.5) / plankCount;
        const py = screenY + pad + t * (tileSizePx - pad * 2);
        ctx2d.beginPath();
        ctx2d.moveTo(screenX + pad, py);
        ctx2d.lineTo(screenX + tileSizePx - pad, py);
        ctx2d.stroke();
      }
      if (this.lastDelivery > 0) {
        ctx2d.fillStyle = `rgba(120, 220, 255, ${(this.lastDelivery / 0.35) * 0.6})`;
        ctx2d.beginPath();
        ctx2d.arc(screenX + tileSizePx / 2, screenY + tileSizePx / 2, tileSizePx * 0.42, 0, Math.PI * 2);
        ctx2d.fill();
      }
      drawTierPip(ctx2d, screenX, screenY, tileSizePx, this.tier);
    },
  };
}

// --- Seawall ---------------------------------------------------------------

function createSeawall(x, y, rotation) {
  return {
    type: 'seawall',
    x,
    y,
    rotation,
    tier: BUILDING_DEFS.seawall.tier,
    // Passive: protection radius is computed by simulation.js by scanning
    // placed seawalls (this tile + 4-neighbors). Nothing to do per-tick.
    tick() {},
    draw(ctx2d, screenX, screenY, tileSizePx) {
      drawGroundShadow(ctx2d, screenX + tileSizePx / 2, screenY + tileSizePx * 0.92, tileSizePx * 0.46, tileSizePx * 0.12);
      ctx2d.fillStyle = '#9aa1a8';
      const blocks = 3;
      const bw = tileSizePx / blocks;
      for (let i = 0; i < blocks; i++) {
        const bx = screenX + i * bw;
        ctx2d.fillRect(bx + 1, screenY + tileSizePx * 0.3, bw - 2, tileSizePx * 0.65);
        ctx2d.strokeStyle = '#33373c';
        ctx2d.lineWidth = Math.max(1, tileSizePx * 0.025);
        ctx2d.strokeRect(bx + 1, screenY + tileSizePx * 0.3, bw - 2, tileSizePx * 0.65);
      }
      ctx2d.fillStyle = '#aeb4ba';
      for (let i = 0; i < blocks - 1; i++) {
        const bx = screenX + bw / 2 + i * bw;
        ctx2d.fillRect(bx, screenY + tileSizePx * 0.1, bw - 2, tileSizePx * 0.25);
        ctx2d.strokeStyle = '#33373c';
        ctx2d.lineWidth = Math.max(1, tileSizePx * 0.02);
        ctx2d.strokeRect(bx, screenY + tileSizePx * 0.1, bw - 2, tileSizePx * 0.25);
      }
      drawTierPip(ctx2d, screenX, screenY, tileSizePx, this.tier);
    },
  };
}

// --- Reclaimer ---------------------------------------------------------------

function createReclaimer(x, y, rotation) {
  return {
    type: 'reclaimer',
    x,
    y,
    rotation,
    tier: BUILDING_DEFS.reclaimer.tier,
    craneAngle: 0,
    tick(dt, ctx) {
      this.craneAngle += dt * 1.2;
      let target = null;
      for (let dir = 0; dir < 4; dir++) {
        const { dx, dy } = DIR_VECTORS[dir];
        const tile = ctx.getNeighborTile(dx, dy);
        if (tile && tile.type === 'water') {
          if (!target || tile.x + tile.y < target.x + target.y) {
            target = tile;
          }
        }
      }
      if (target) {
        ctx.requestReclaim(target.x, target.y);
      }
    },
    draw(ctx2d, screenX, screenY, tileSizePx) {
      const cx = screenX + tileSizePx / 2;
      const baseY = screenY + tileSizePx * 0.85;
      drawGroundShadow(ctx2d, cx, baseY + tileSizePx * 0.04, tileSizePx * 0.32, tileSizePx * 0.12);
      ctx2d.fillStyle = '#66727e';
      ctx2d.fillRect(cx - tileSizePx * 0.06, screenY + tileSizePx * 0.15, tileSizePx * 0.12, tileSizePx * 0.7);
      ctx2d.strokeStyle = '#20252c';
      ctx2d.lineWidth = Math.max(1, tileSizePx * 0.015);
      ctx2d.strokeRect(cx - tileSizePx * 0.06, screenY + tileSizePx * 0.15, tileSizePx * 0.12, tileSizePx * 0.7);
      ctx2d.save();
      ctx2d.translate(cx, screenY + tileSizePx * 0.2);
      ctx2d.rotate(Math.sin(this.craneAngle) * 0.35 + (this.rotation * Math.PI) / 2);
      ctx2d.strokeStyle = '#ffcf5c';
      ctx2d.lineWidth = Math.max(1, tileSizePx * 0.055);
      ctx2d.beginPath();
      ctx2d.moveTo(0, 0);
      ctx2d.lineTo(tileSizePx * 0.32, tileSizePx * 0.1);
      ctx2d.stroke();
      ctx2d.fillStyle = '#20252c';
      ctx2d.beginPath();
      ctx2d.arc(tileSizePx * 0.32, tileSizePx * 0.1, tileSizePx * 0.055, 0, Math.PI * 2);
      ctx2d.fill();
      ctx2d.restore();
      ctx2d.fillStyle = '#20252c';
      ctx2d.fillRect(cx - tileSizePx * 0.16, baseY, tileSizePx * 0.32, tileSizePx * 0.08);
      drawTierPip(ctx2d, screenX, screenY, tileSizePx, this.tier);
    },
  };
}
