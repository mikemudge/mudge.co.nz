// Till/plant/water/harvest state machine for Wildergrove farm tiles.
//
// JUDGMENT CALL (documented per the design contract's "leave a comment
// explaining why" rule): the frozen contract's world.js API list
// (isTileFree, isTileFarmable, placeBuilding, removeBuilding, getBuildingAt,
// harvestNode) never documents a terrain *mutator* for flipping GRASS/DIRT
// to TILLED, even though TERRAIN.TILLED is named as one of world.js's
// terrain enum values. Rather than invent an undocumented world.js export
// name, this module is the sole source of truth for till/plant/water/grow
// state: `plots` tracks BOTH "tilled and empty" (cropId: null) and
// "planted" tiles, keyed exactly as the contract specifies ("x,y" ->
// {cropId, stage, plantedDay, wateredToday}). world.js's terrain array is
// only ever READ here (via isTileFarmable), never written. render.js should
// consult getPlot()/getAllPlots() to draw tilled soil and crop growth
// stages, rather than expecting world's terrain grid to show TILLED.
// main.js should fold serialize()/deserialize() into the save blob's "world
// mutations" category from the Save/load section - that section describes
// what gets persisted, not which module's internal state must hold it.
//
// Expected shape read from items.js's CROPS (the contract only gives this
// in prose - "turnip (2 days), carrot (3), wheat (4), pumpkin (6)" - so the
// exact field names below are this file's assumption, flagged for the
// items.js author to match or for the integration pass to reconcile):
//   CROPS = {
//     turnip: { id: 'turnip', name: 'Turnip', growDays: 2,
//               seed: 'turnip_seed', yield: { item: 'turnip', qty: 1 } },
//     ...
//   }
// `growDays` doubles as the final stage number - a plot is ready to harvest
// once `stage >= growDays`. `seed` is the inventory item id actions.js
// consumes to plant this crop.
import { CROPS } from './items.js';

function key(x, y) {
  return `${x},${y}`;
}

// Creates a farming system bound to `eventBus` (per the contract's event
// bus section - passed explicitly, never a module-level singleton, so this
// stays instantiable/testable in isolation). Also self-subscribes to
// `day_advanced` so main.js's day-cycle timer only needs to emit that event
// on the shared bus like everything else, rather than needing to know to
// call advanceDay itself. advanceDay is still exported on the returned
// instance for direct/test invocation.
// CONFIRMED BUG (soft-lock, found via playtesting): a harvest used to have
// only a 40% CHANCE of returning a seed at all, which is not the same thing
// as "sustainable" - the RNG can (and did) leave a player at zero seeds of
// a type before they'd harvested enough for a quest that wants several
// (er_pumpkin_harvest wants 5), with no other source for that seed anywhere
// in the game. A harvest now ALWAYS returns at least one seed back (so
// replanting can never run out once you have any seed of a type at all),
// plus a smaller chance of a second one so your stock can still slowly grow
// enough to run more than one plot in parallel instead of one strict
// plant-wait-harvest cycle at a time.
const EXTRA_SEED_CHANCE = 0.35;

export function createFarming(eventBus) {
  const plots = new Map(); // "x,y" -> {cropId, stage, plantedDay, wateredToday}
  let today = 0; // tracked from day_advanced payloads, used to stamp plantedDay

  function tillTile(x, y, world) {
    const k = key(x, y);
    if (plots.has(k)) return false; // already tilled (or planted) here
    if (!world.isTileFarmable(x, y)) return false; // must be GRASS/DIRT terrain
    if (typeof world.isTileFree === 'function' && !world.isTileFree(x, y)) return false; // not under a building/node
    plots.set(k, { cropId: null, stage: 0, plantedDay: null, wateredToday: false });
    eventBus.emit('tile_tilled', { x, y });
    return true;
  }

  function plantSeed(x, y, cropId, world) {
    if (!CROPS[cropId]) return false;
    const k = key(x, y);
    const plot = plots.get(k);
    if (!plot || plot.cropId !== null) return false; // must be tilled + empty
    if (world && !world.isTileFarmable(x, y)) return false; // defensive re-check
    plot.cropId = cropId;
    plot.stage = 0;
    plot.plantedDay = today;
    plot.wateredToday = false;
    eventBus.emit('crop_planted', { x, y, cropId });
    return true;
  }

  // Works on tilled-but-empty soil too, not just a planted crop - confirmed
  // player feedback that watering felt arbitrarily blocked before a seed
  // went in. Harmless either way: advanceDay only grows plots with a
  // cropId, so wateredToday on an empty plot has no mechanical effect
  // beyond letting the click succeed.
  function waterTile(x, y) {
    const plot = plots.get(key(x, y));
    if (!plot) return false; // nothing tilled here at all
    if (plot.wateredToday) return false; // forgiving no-op, not an error
    plot.wateredToday = true;
    return true;
  }

  function advanceDay(currentDay) {
    if (typeof currentDay === 'number') today = currentDay;
    for (const plot of plots.values()) {
      // CONFIRMED BUG: this used to `continue` here for empty plots, which
      // skipped the wateredToday reset below along with the (correctly
      // skipped) growth step - so watering empty soil (allowed since the
      // "water any soil" fix) left it permanently marked wet, since nothing
      // ever cleared it back to false for a plot with no crop. Growth still
      // only applies to a planted plot; the reset now applies to every plot.
      if (plot.cropId !== null) {
        const crop = CROPS[plot.cropId];
        const maxStage = crop ? crop.growDays : Infinity;
        if (plot.wateredToday && plot.stage < maxStage) {
          plot.stage += 1;
        }
        // Unwatered plots simply don't grow this day - no death, per contract.
      }
      plot.wateredToday = false;
    }
  }

  // Does NOT emit `crop_harvested` itself - unlike every other mutator here,
  // the caller (actions.js) doesn't yet know how much of the yield will
  // actually fit in the inventory, and the contract's payload qty needs to
  // reflect what was actually received, not the nominal yield (see
  // actions.js's harvestCropAction, mirroring resource_harvested's same
  // fix). Returning `cropId` alongside `item`/`qty` (rather than making the
  // caller assume item === cropId) keeps this correct if a future crop's
  // yield item ever diverges from its plot cropId. Return shape is
  // `{item, qty, cropId, bonusSeed: {item, qty} | null}` - see bonusSeed's
  // own comment below.
  function harvestCrop(x, y) {
    const k = key(x, y);
    const plot = plots.get(k);
    if (!plot || plot.cropId === null) return null;
    const crop = CROPS[plot.cropId];
    if (!crop || plot.stage < crop.growDays) return null; // not ready yet
    const yieldSpec = crop.yield || { item: plot.cropId, qty: 1 };
    const harvestedCropId = plot.cropId;
    plots.set(k, { cropId: null, stage: 0, plantedDay: null, wateredToday: false }); // back to tilled
    // Bonus seed shape mirrors world.js's RESOURCE_NODE_YIELDS `{item, qty,
    // bonus}` pattern for rock's coal drop (see items.js's comment on that
    // table) - same "extra field alongside the normal yield" shape, kept
    // consistent across the codebase - but the quantity itself is now
    // guaranteed >=1 rather than a flat chance of 0 or 1 (see this file's
    // EXTRA_SEED_CHANCE comment above for why).
    const bonusSeed = crop.seedItem
      ? { item: crop.seedItem, qty: Math.random() < EXTRA_SEED_CHANCE ? 2 : 1 }
      : null;
    return {
      item: yieldSpec.item, qty: yieldSpec.qty, cropId: harvestedCropId, bonusSeed,
    };
  }

  function getPlot(x, y) {
    return plots.get(key(x, y)) || null;
  }

  function getAllPlots() {
    return plots;
  }

  // Save/load: plain array of [key, plotState] pairs so main.js can drop
  // this straight into JSON (Maps aren't directly serializable).
  function serialize() {
    return Array.from(plots.entries());
  }

  function deserialize(data) {
    plots.clear();
    if (!Array.isArray(data)) return;
    for (const [k, v] of data) plots.set(k, v);
  }

  eventBus.on('day_advanced', (payload) => advanceDay(payload && payload.day));

  return {
    tillTile,
    plantSeed,
    waterTile,
    advanceDay,
    harvestCrop,
    getPlot,
    getAllPlots,
    serialize,
    deserialize,
  };
}
