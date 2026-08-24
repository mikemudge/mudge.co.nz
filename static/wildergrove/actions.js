// Glue layer: resolves "player used the selected item on tile (gx,gy)"
// into calls against world/farming/buildings/inventory/player, spends
// stamina, and emits events. Every function here soft-fails (returns
// false / does nothing) rather than throwing when a precondition isn't
// met - not enough stamina, wrong tool tier, tile not valid, unknown
// recipe - per the contract's "forgiving, chill game" instruction.
//
// ============================================================================
// ctx shape - THIS MATTERS FOR THE INTEGRATION PASS. Every exported function
// below takes a `ctx` bundle shaped like this:
//
// ctx = {
//   player,       // player.js instance: { tools: {axe, pickaxe, hoe,
//                 //   wateringCan}, stamina, maxStamina, buffs }. Spending/
//                 //   restoring/buffing go through player.js's free
//                 //   functions (trySpend/restoreStamina/addBuff), imported
//                 //   below, NOT instance methods - player.js exports a
//                 //   plain data object + functions, per its own contract.
//   world,        // world.js instance, OR (while in the mine) a small
//                 //   facade main.js builds with the same 5-method shape
//                 //   backed by the mine's isMineTileFree/getMineNodeAt/
//                 //   harvestMineNode instead - see main.js's integration
//                 //   comment. Used surface: isTileFree, isTileFarmable,
//                 //   getBuildingAt, getNodeAt, harvestNode.
//   inventory,    // inventory.js Inventory instance: hasItem, addItem,
//                 //   removeItem, consumeForRecipe.
//   farming,      // one instance from farming.js's createFarming(eventBus):
//                 //   { tillTile, plantSeed, waterTile, harvestCrop, getPlot }
//   selectedItem, // string itemId of the currently-selected HOTBAR (real
//                 //   inventory) slot, or null/undefined - "bare hands".
//                 //   Only ever meaningful for planting a seed here; tool
//                 //   use (axe/pickaxe) is resolved automatically from the
//                 //   node being clicked (see harvestNodeAction) rather than
//                 //   requiring the player to "select" a tool, because
//                 //   items.js deliberately does NOT model tools as
//                 //   inventory items (see its file header) - there is no
//                 //   hotbar slot an 'axe'/'pickaxe' could ever occupy.
//   placementMode,// building type id (e.g. 'campfire') while the player has
//                 //   one selected in ui.js's build palette, else null/
//                 //   undefined. Set by main.js from ui.js's
//                 //   onSelectBuildingToPlace callback; cleared on a
//                 //   successful placement or on input's Esc/onCancel.
//                 //   Takes priority over every other interaction below.
//   eventBus,     // utils.js createEventBus() instance - the SAME bus
//                 //   instance farming.js/buildings.js were constructed with.
//   getNpcAt,     // (gx, gy) -> npc | null. npc has at least {id}. Supplied
//                 //   by whoever wires quests.js's NPCS into ctx (main.js).
//                 //   Optional - if absent, NPC interaction is just skipped.
//   now,          // main.js's running game-time accumulator (seconds,
//                 //   NOT Date.now()) - the same clock player.js's
//                 //   addBuff/updateBuffs run on. Required by eatFood.
// }
//
// `buildings.js` (tryPlaceBuilding/BUILDING_DEFS) and `items.js` constants
// are imported directly by this module rather than threaded through ctx,
// since they're static tables/pure functions, not per-game-instance state.
// ============================================================================
import {
  CROPS, RECIPES, COOKING_RECIPES, ITEMS, ORE_MIN_TIER, RESOURCE_NODE_YIELDS,
} from './items.js';
import { tryPlaceBuilding, BUILDING_DEFS } from './buildings.js';
import { TILE_SIZE } from './render.js';
import {
  trySpend, restoreStamina, addBuff, setToolTier, getBuffTotal, trySpendWater, refillWater,
} from './player.js';

// A tile click only registers within roughly 2 tiles of the player, per the
// contract's interaction model - checked once here (the shared glue layer)
// rather than by every caller.
const INTERACT_RANGE = TILE_SIZE * 2.25;

// Stamina costs per the contract's Player section. Owned here since
// actions.js is the one place that actually spends stamina for each action.
const STAMINA_COST = {
  mine: 5,
  chop: 3,
  till: 4,
  water: 1,
  plant: 2,
  harvest: 2,
  build: 5,
  clearDirt: 3,
};

// CONFIRMED RECURRING BUG: this used to be its own hand-maintained table
// (NODE_TOOL_KIND), parallel to items.js's RESOURCE_NODE_YIELDS - and it was
// twice left out of sync with world.js's node enum (coal_seam, then
// clay_deposit both shipped harvestable with no entry here, so clicking
// either silently no-opped: no crash, no message, the node just never
// yielded anything). Reading `tool` straight off RESOURCE_NODE_YIELDS
// removes the second table entirely - a new node type only needs the one
// entry it already needs to drop anything at all. The assertion below is
// the backstop for the case that entry still ships without `tool` set: it
// throws at load time instead of failing silently in play, so the gap can't
// reach a player again undetected.
for (const [type, def] of Object.entries(RESOURCE_NODE_YIELDS)) {
  if (!def.tool) {
    throw new Error(`items.js RESOURCE_NODE_YIELDS.${type} has no 'tool' set - actions.js can't resolve what harvests it.`);
  }
}

// Soft-blocks (not enough stamina, wrong tool tier, etc.) are supposed to
// come with a UI message per the contract's Player section ("actions are
// soft-blocked (with a UI message, not a hard crash) below the cost") -
// this is the one place that's emitted from, as an additive `action_blocked`
// event (main.js subscribes and forwards it to ui.showMessage), so every
// soft-block below can report itself the same way without importing ui.js
// directly into this glue layer.
function notifyBlocked(ctx, message) {
  ctx.eventBus?.emit('action_blocked', { message });
}

function trySpendOrNotify(ctx, cost, message) {
  if (trySpend(ctx.player, cost)) return true;
  notifyBlocked(ctx, message || 'Not enough stamina for that.');
  return false;
}

function cropIdForSeed(itemId) {
  for (const cropId of Object.keys(CROPS)) {
    if (CROPS[cropId].seedItem === itemId) return cropId;
  }
  return null;
}

// --- Tile interaction dispatch -------------------------------------------

// Resolves a left-click on grid tile (gx, gy) against whatever's there and
// whatever's selected. Priority order: out-of-range is a no-op -> placement
// mode (always wins while active) -> NPC -> building with a use hook
// (currently just the bed) -> resource node -> farm plot (harvest if ready,
// else water/plant) -> untilled farmable ground (till). Anything else is a
// soft no-op.
export function useSelectedOn(gx, gy, ctx) {
  const {
    player, world, farming, selectedItem, eventBus, getNpcAt, placementMode,
  } = ctx;

  const dx = (gx + 0.5) * TILE_SIZE - player.x;
  const dy = (gy + 0.5) * TILE_SIZE - player.y;
  if (Math.sqrt(dx * dx + dy * dy) > INTERACT_RANGE) return false;

  if (placementMode) {
    const def = BUILDING_DEFS[placementMode];
    if (!def) return false;
    // world.isTileFree/placeBuilding don't know where the player is standing
    // (world.js is deliberately player-agnostic), so nothing else stops a
    // solid building from landing exactly on the player's own tile - and
    // there is no demolish/remove-building action anywhere in the game, so
    // that would permanently soft-lock the player (every direction's move
    // stays blocked by the tile they're already inside). A non-solid bridge
    // is fine to drop underfoot; it's only ever a problem for solid types.
    if (def.solid) {
      const playerGx = Math.floor(player.x / TILE_SIZE);
      const playerGy = Math.floor(player.y / TILE_SIZE);
      if (gx === playerGx && gy === playerGy) {
        notifyBlocked(ctx, "You can't build that under your own feet.");
        return false;
      }
    }
    // Same blind spot as above, but for farmland: world.js's placeBuilding
    // has no idea farming.js's plot map exists (they're deliberately
    // decoupled - see farming.js's file header), so nothing stops a building
    // from landing right on top of a tilled or even actively-planted plot.
    // With no demolish/remove-building action anywhere in the game, that
    // would silently and permanently bury a crop the player already spent
    // stamina and a seed on, with zero warning.
    if (farming.getPlot(gx, gy)) {
      notifyBlocked(ctx, "There's a farm plot there - clear it first.");
      return false;
    }
    // Check (don't spend) stamina up front, then only actually spend once
    // placement has genuinely succeeded - tryPlaceBuilding fails often in
    // normal play (unaffordable, tile occupied, wrong terrain) and none of
    // those should cost the player stamina for nothing.
    if (player.stamina < STAMINA_COST.build) {
      notifyBlocked(ctx, 'Not enough stamina for that.');
      return false;
    }
    const placed = tryPlaceBuilding(placementMode, gx, gy, world, ctx.inventory, eventBus);
    if (!placed) {
      notifyBlocked(ctx, "Can't build that there.");
      return false;
    }
    trySpend(player, STAMINA_COST.build);
    return true;
  }

  const npc = typeof getNpcAt === 'function' ? getNpcAt(gx, gy) : null;
  if (npc) {
    eventBus.emit('npc_talked', { npcId: npc.id });
    return true;
  }

  const building = world.getBuildingAt(gx, gy);
  if (building) {
    if (typeof building.onUse === 'function') return !!building.onUse(ctx);
    // Confirmed player-requested convenience: clicking a station building
    // now opens its matching menu directly, instead of doing nothing and
    // requiring the player to already know the C/V/B hotkeys. Emitted as an
    // event (not a direct ui.js call) so actions.js stays free of any UI
    // import - main.js decides which panel each building type maps to.
    eventBus.emit('building_clicked', { type: building.type });
    return true;
  }

  // Packed dirt overburden (mine only - see world.js's MINE_TILE.DIRT) blocks
  // a tile, including any ore vein that's since grown onto it during
  // clustering, until dug out. Checked ahead of the node lookup below so a
  // vein sitting under still-uncleared dirt can't be harvested before the
  // dirt covering it is cleared - digging it away gives no resource, per the
  // design intent that finding what's underneath is the reward.
  if (typeof world.isDirtAt === 'function' && world.isDirtAt(gx, gy)) {
    return clearDirtAction(gx, gy, ctx);
  }

  const node = typeof world.getNodeAt === 'function' ? world.getNodeAt(gx, gy) : null;
  if (node) return harvestNodeAction(node, gx, gy, ctx);

  // A river/stream/pond tile has no building or node on it (world.js's node/
  // building spawning already only ever targets GRASS/DIRT), so this can't
  // shadow either check above - it's a plain terrain-triggered refill,
  // checked ahead of the farmland fallback below since water terrain is
  // never farmable anyway. Only the real overworld World exposes
  // isWaterSource (the mine facade doesn't - there's no water underground),
  // hence the same defensive typeof guard isDirtAt/getNodeAt use above.
  if (typeof world.isWaterSource === 'function' && world.isWaterSource(gx, gy)) {
    return refillWaterAction(ctx);
  }

  const plot = farming.getPlot(gx, gy);
  if (plot) {
    if (plot.cropId !== null) {
      const crop = CROPS[plot.cropId];
      if (crop && plot.stage >= crop.growDays) return harvestCropAction(gx, gy, ctx);
      return waterAction(gx, gy, ctx); // planted, not ready - watering is the only useful click
    }
    if (selectedItem) {
      const cropId = cropIdForSeed(selectedItem);
      if (cropId) return plantAction(gx, gy, cropId, ctx);
    }
    // Tilled but empty, and nothing plantable selected - water it anyway
    // rather than no-op. Confirmed player feedback: watering felt
    // arbitrarily blocked before a seed went in, even though there's no
    // reason it should be (see farming.js's waterTile for the same fix).
    return waterAction(gx, gy, ctx);
  }

  if (world.isTileFarmable(gx, gy)) {
    return tillAction(gx, gy, ctx);
  }

  return false;
}

// Tool use (axe/pickaxe) is resolved from the node type being clicked, not
// from a "selected" hotbar tool - see the ctx-shape comment above on why.
// berry_bush/mushroom (`kind === 'hand'`) need no tool at all.
function harvestNodeAction(node, gx, gy, ctx) {
  const { player, world } = ctx;
  const kind = RESOURCE_NODE_YIELDS[node.type]?.tool;
  if (!kind) return false; // e.g. cave_entrance - not harvestable, handled by main.js's mine-entry check

  let tier = 1;
  let cost = STAMINA_COST.harvest;
  if (kind === 'axe') {
    tier = player.tools.axe;
    cost = STAMINA_COST.chop;
  } else if (kind === 'pickaxe') {
    const minTier = (ORE_MIN_TIER && ORE_MIN_TIER[node.type]) || 1;
    if (player.tools.pickaxe < minTier) {
      // Real gating, not just slower - and per the contract, a soft block
      // needs a UI message, not a silent no-op.
      notifyBlocked(ctx, "Your pickaxe isn't strong enough for that yet.");
      return false;
    }
    tier = player.tools.pickaxe;
    cost = STAMINA_COST.mine;
  }
  // kind === 'hand': no tool requirement, default tier/cost above apply.

  if (!trySpendOrNotify(ctx, cost)) return false;
  // The `mining_power` food buff (Pumpkin Soup) adds flat extra damage per
  // swing on top of the pickaxe tier's own power - see world.js's
  // harvestFromMap comment. Only meaningful for pickaxe swings; axe/hand
  // harvests don't read it, matching the contract's buff list (no wood/
  // hand-harvest buff exists).
  const bonusPower = kind === 'pickaxe' ? getBuffTotal(player, 'mining_power') : 0;
  const result = world.harvestNode(gx, gy, tier, bonusPower);
  if (!result) return false;

  // The node is already depleted at this point (world.harvestNode has no way
  // to "give it back"), so a full inventory means the yield is genuinely
  // lost - only emit resource_harvested for what actually made it into the
  // inventory, and only for that amount, so a `collect` quest objective
  // (which listens for this event) can never complete on items the player
  // never actually received. Same treatment for rock's bonus coal chance,
  // which - before this fix - world.js computed but nothing ever read,
  // making coal (and therefore the torch recipe, its only consumer)
  // unobtainable.
  addHarvestedItem(ctx, node.type, result.item, result.qty, gx, gy);
  if (result.bonus) addHarvestedItem(ctx, node.type, result.bonus.item, result.bonus.qty, gx, gy);
  return true;
}

// Shared by harvestNodeAction's main yield and rock's bonus coal drop: adds
// up to `qty` of `item` to the inventory, emits resource_harvested for only
// the amount that actually fit, and tells the player if some (or all) of it
// was lost to a full inventory.
function addHarvestedItem(ctx, nodeType, item, qty, gx, gy) {
  const { inventory, eventBus } = ctx;
  const leftover = inventory.addItem(item, qty);
  const added = qty - leftover;
  if (added > 0) {
    eventBus.emit('resource_harvested', {
      nodeType, item, qty: added, x: gx, y: gy,
    });
  }
  if (leftover > 0) {
    const name = ITEMS[item]?.name ?? item;
    notifyBlocked(ctx, `Inventory full - lost ${leftover} ${name}.`);
  }
}

function tillAction(gx, gy, ctx) {
  const { world, farming } = ctx;
  if (!world.isTileFarmable(gx, gy)) return false;
  if (!trySpendOrNotify(ctx, STAMINA_COST.till)) return false;
  return farming.tillTile(gx, gy, world);
}

// Deliberately gives no item/event on success - clearing overburden isn't a
// resource action, it's what makes finding what's behind it feel earned.
function clearDirtAction(gx, gy, ctx) {
  const { world } = ctx;
  if (!trySpendOrNotify(ctx, STAMINA_COST.clearDirt)) return false;
  return world.clearMineDirt(gx, gy);
}

function plantAction(gx, gy, cropId, ctx) {
  const {
    world, inventory, farming, selectedItem,
  } = ctx;
  if (!CROPS[cropId]) return false;
  // Pre-check every condition plantSeed itself checks (tilled + empty plot,
  // farmable terrain) BEFORE spending stamina - mirrors tillAction's
  // validity-then-spend order in this file. Without this, planting on an
  // already-planted or otherwise invalid plot would burn stamina for a
  // silent no-op, same bug class as waterAction's fix below.
  const plot = farming.getPlot(gx, gy);
  if (!plot || plot.cropId !== null) return false; // must be tilled + empty
  if (!world.isTileFarmable(gx, gy)) return false;
  if (!trySpendOrNotify(ctx, STAMINA_COST.plant)) return false;
  if (!farming.plantSeed(gx, gy, cropId, world)) return false;
  inventory.removeItem(selectedItem, 1);
  return true;
}

function waterAction(gx, gy, ctx) {
  const { farming, player } = ctx;
  // Check the plot is actually waterable BEFORE spending anything - farming's
  // waterTile() silently no-ops (returns false) on an already-watered plot,
  // so spending first would burn stamina/water on a tile that was never
  // going to change. Mirrors tillAction's validity-then-spend order in this
  // file. Works on a tilled-but-empty plot too (not just a planted crop) -
  // see farming.js's waterTile for why.
  const plot = farming.getPlot(gx, gy);
  if (!plot || plot.wateredToday) return false;
  // The watering can itself is now a limited, refillable resource (river/
  // stream/pond/well - see refillWaterAction below) rather than an infinite
  // tap, per the confirmed water-system design - checked ahead of the
  // stamina spend for the same "don't pay for a no-op" reason as the plot
  // check above.
  if (player.waterCarried <= 0) {
    notifyBlocked(ctx, 'Your watering can is empty - refill it at a river, stream, pond, or well.');
    return false;
  }
  if (!trySpendOrNotify(ctx, STAMINA_COST.water)) return false;
  if (!farming.waterTile(gx, gy)) return false;
  trySpendWater(player, 1);
  return true;
}

// Free action (no stamina cost) - topping off a bucket from a river/stream/
// pond isn't real labor, unlike every other tile interaction in this file.
// Forgiving no-op (not an error) when already full, same spirit as
// farming.waterTile's already-watered no-op above.
function refillWaterAction(ctx) {
  const { player, eventBus } = ctx;
  if (player.waterCarried >= player.maxWaterCarried) return false;
  refillWater(player);
  eventBus?.emit('watering_can_refilled', {});
  return true;
}

function harvestCropAction(gx, gy, ctx) {
  const { inventory, farming, eventBus } = ctx;
  if (!trySpendOrNotify(ctx, STAMINA_COST.harvest)) return false;
  const result = farming.harvestCrop(gx, gy);
  if (!result) return false;
  // The plot is already cleared back to tilled at this point (farming.js has
  // no way to "un-harvest" it), so - same as a resource node - a full
  // inventory means whatever didn't fit is genuinely lost. `crop_harvested`
  // is emitted here (not by farming.js) for exactly this reason: only for
  // the amount that actually made it into the inventory, so a `collect`
  // quest objective can never complete on items the player never actually
  // received - mirrors harvestNodeAction/addHarvestedItem's resource_harvested
  // fix.
  const leftover = inventory.addItem(result.item, result.qty);
  const added = result.qty - leftover;
  if (added > 0) {
    eventBus.emit('crop_harvested', {
      x: gx, y: gy, cropId: result.cropId, qty: added,
    });
  }
  if (leftover > 0) {
    const name = ITEMS[result.item]?.name ?? result.item;
    notifyBlocked(ctx, `Inventory full - lost ${leftover} ${name}.`);
  }
  // Bonus seed (farming.js's harvestCrop rolls this so replanting doesn't
  // permanently dead-end once a player's initial seed supply runs out) gets
  // the same "add what fits, notify on overflow" treatment as the main
  // yield above and as rock's bonus coal in addHarvestedItem. No separate
  // quest event is emitted for it though: a bonus seed isn't part of what a
  // `collect` objective for this crop's yield should count.
  if (result.bonusSeed) {
    const seedLeftover = inventory.addItem(result.bonusSeed.item, result.bonusSeed.qty);
    if (seedLeftover > 0) {
      const seedName = ITEMS[result.bonusSeed.item]?.name ?? result.bonusSeed.item;
      notifyBlocked(ctx, `Inventory full - lost ${seedLeftover} ${seedName}.`);
    }
  }
  return true;
}

// --- Crafting / cooking / eating ------------------------------------------

export function craftRecipe(recipeId, ctx) {
  return runRecipe(RECIPES[recipeId], recipeId, ctx, 'item_crafted');
}

export function cookRecipe(recipeId, ctx) {
  return runRecipe(COOKING_RECIPES[recipeId], recipeId, ctx, 'meal_cooked');
}

function runRecipe(recipe, recipeId, ctx, eventName) {
  const { inventory, player, eventBus } = ctx;
  if (!recipe) return false;
  if (!inventory.consumeForRecipe(recipe)) return false; // checks & consumes recipe.inputs

  // Tool-upgrade recipes (pickaxe_copper/iron, axe_copper/iron) output a
  // player.tools slot name + tier, not a real inventory item - see items.js's
  // RECIPES comment. Route those through setToolTier instead of ever handing
  // 'pickaxe'/'axe' to inventory.addItem (which would silently reject them,
  // since neither is a real ITEMS entry).
  if (recipe.output.item === 'pickaxe' || recipe.output.item === 'axe') {
    setToolTier(player, recipe.output.item, recipe.output.qty);
  } else {
    // Inputs are already consumed above (consumeForRecipe), so a full
    // inventory here is worse than a harvest overflow - the materials are
    // gone either way, but the player gets nothing back for them unless we
    // at least tell them what happened.
    const leftover = inventory.addItem(recipe.output.item, recipe.output.qty);
    if (leftover > 0) {
      const name = ITEMS[recipe.output.item]?.name ?? recipe.output.item;
      notifyBlocked(ctx, `Inventory full - lost ${leftover} ${name}.`);
    }
  }

  if (eventName === 'item_crafted') {
    eventBus.emit('item_crafted', { recipeId, item: recipe.output.item, qty: recipe.output.qty });
  } else {
    eventBus.emit('meal_cooked', { recipeId, item: recipe.output.item });
  }
  return true;
}

// Eats one of `itemId` directly from inventory (no world click needed, per
// the contract's interaction model - clicking a food slot in the inventory
// panel calls this). Food items (items.js's ITEMS category:'food' entries)
// carry `restoreStamina: number` and `buff: {stat, amount, durationSec} |
// null`. A non-food item (no numeric `restoreStamina`) is treated as "not
// edible" and this soft-fails rather than throwing.
export function eatFood(itemId, ctx) {
  const {
    inventory, player, eventBus, now,
  } = ctx;
  const item = ITEMS[itemId];
  if (!item || typeof item.restoreStamina !== 'number') return false;
  if (!inventory.removeItem(itemId, 1)) return false;
  restoreStamina(player, item.restoreStamina);

  let buff = null;
  if (item.buff) {
    const clock = now || 0;
    addBuff(player, item.buff.stat, item.buff.amount, item.buff.durationSec || 0, clock);
    buff = { stat: item.buff.stat, amount: item.buff.amount, expiresAt: clock + (item.buff.durationSec || 0) };
  }
  eventBus.emit('meal_eaten', { item: itemId, buff });
  return true;
}
