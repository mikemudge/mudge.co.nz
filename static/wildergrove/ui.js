// DOM-overlay UI for Wildergrove: HUD (stamina/day/hotbar), inventory panel,
// crafting menu, cooking menu, building placement palette, quest log, and an
// NPC dialog box. Mirrors driftworks/ui.js's approach - a DOM tree layered
// over the canvas rather than anything canvas-drawn, because these panels
// are mostly lists of small labelled buttons that are far easier to lay out
// and hit-test as real elements. The overlay root has `pointer-events: none`
// (wildergrove.css) so empty space passes clicks through to the canvas for
// movement/tile-interaction; individual panels/buttons opt back in.
//
// ui.js only *reads* game state (given to it, see below) and *emits* player
// intent through callbacks - it never mutates inventory/player/world state
// itself. main.js/actions.js own turning that intent into real state
// changes and feeding the results back in on the next update().
//
// --- Construction -------------------------------------------------------
// `new WildergroveUI(callbacks)` where every callback is optional:
//   onSelectHotbarSlot(index)      - clicked hotbar slot `index` (0-8), OR
//                                     clicked a non-food slot anywhere in the
//                                     full inventory panel (index is that
//                                     slot's real position in inventorySlots,
//                                     which may be >8) - both mean "make this
//                                     the selected/active item", so they share
//                                     one callback rather than needing a
//                                     second one main.js would have to wire
//                                     up identically.
//   onEatFood(itemId)              - clicked an inventory slot holding a food
//                                     item (items.js's ITEMS[id].restoreStamina
//                                     is a number) - the receiver decides and
//                                     can call showMessage() to reject it
//   onCraft(recipeId)              - clicked an affordable+enabled recipe
//                                     in the crafting menu
//   onCook(recipeId)               - same, cooking menu
//   onSelectBuildingToPlace(id)    - clicked a building in the placement
//                                     palette; enters placement mode
//   onToggleDemolish()             - clicked the Build panel's Demolish
//                                     toggle; main.js owns the actual mode
//                                     boolean and reflects it back via
//                                     setDemolishActive()
//   onMoveItem(fromIndex, toIndex) - dragged an item from one slot to
//                                     another (hotbar or full inventory,
//                                     either direction) - main.js/
//                                     inventory.js decide what "moving"
//                                     means (swap/merge/plain move)
//   onNewGame()                    - clicked the HUD's "New Game" button;
//                                     main.js owns confirming (a plain
//                                     window.confirm - no custom modal) and
//                                     actually erasing the save + reloading
//   onDialogClosed(npcId)          - the NPC dialog box was closed/advanced
//                                     past its last line (informational;
//                                     ui.js already emits nothing to the
//                                     event bus itself - see showNpcDialog)
//
// --- Per-frame state: update(snapshot) -----------------------------------
// Call once per frame (or whenever state changes; internally cheap - it
// only touches the DOM nodes whose values actually changed). Shape:
//   {
//     day: number,
//     stamina: number, maxStamina: number,
//     waterCarried: number, maxWaterCarried: number,
//       // player.js's watering-can capacity - a discrete use-count (see
//       // player.js's MAX_WATER_CARRIED comment), not a time-based burn like
//       // the torch, so this HUD bar just mirrors the stamina bar's shape.
//     inventorySlots: Array<{item: string, qty: number} | null>,
//       // ordered slot list; slots[0..8] double as the hotbar per the
//       // interaction contract (keys 1-9 / hotbar UI). inventory.js's exact
//       // shape isn't nailed down by the design doc, so this is the
//       // assumed contract for this file - see the note above asList().
//     selectedHotbarIndex: number,        // any inventorySlots index (see
//       // onSelectHotbarSlot above) - only 0-8 lights up a HUD hotbar button,
//       // higher indices just highlight in the inventory panel instead.
//     nearStations: { [stationId: string]: boolean },
//       // which crafting/cooking stations the player is currently close
//       // enough to use, e.g. {campfire: true, forge: false}. A recipe/dish
//       // with station 'hand' needs no entry here and is always available.
//     quests: {
//       active: Array<QuestDef & {count: number, target: number}>,
//       completed: Array<QuestDef>,
//     },
//     buffs: Array<{stat: string, amount: number, expiresAt: number}>,
//       // player.js's player.buffs, passed through as-is - drives the active
//       // buff indicators near the stamina bar.
//     now: number,
//       // main.js's running game-time clock (state.time) - the same clock
//       // buffs' expiresAt is measured on, so remaining = expiresAt - now.
//     tools: { axe, pickaxe, hoe, wateringCan } | null,
//       // player.js's player.tools, passed through as-is - drives the
//       // tool-tier HUD readout (axe/pickaxe only, the two with real tiers).
//   }
// All fields are optional/defensively defaulted so a partial snapshot
// during boot doesn't throw.
//
// --- On-demand methods ----------------------------------------------------
//   showMessage(text, durationMs = 2500)  - transient toast (soft-block /
//                                            info messages from actions.js)
//   showNpcDialog(npc)                     - npc: {id, name, lines}; opens
//                                            the dialog box at line 0
//   closeNpcDialog()
//   isDialogOpen(): boolean
//   setSelectedBuilding(id | null)         - sync the palette highlight from
//                                            outside (e.g. input.js cancels
//                                            placement mode on Esc)
//   setDemolishActive(active: boolean)     - sync the Demolish button's
//                                            visual state from main.js's
//                                            own demolish-mode boolean
//   setPlacementBanner(name | null)        - shows/hides a persistent
//                                            "Placing: X — Esc to stop"
//                                            banner while placement mode is
//                                            active (not a fading toast)
//   showHowToPlay()                        - opens the first-time "How to
//                                            Play" overlay; dismisses itself
//                                            on the next click/keypress.
//                                            main.js decides *when* to call
//                                            this (its own localStorage gate,
//                                            same pattern as driftworks) -
//                                            ui.js just owns the panel.
//   hideHowToPlay()
//   isHowToPlayOpen(): boolean
//
// --- Keys owned by this file ----------------------------------------------
// Panel-toggle keys are a DOM/UI concern and are bound here, separate from
// input.js's world-interaction keys (movement, hotbar 1-9, click-to-use,
// Esc-cancels-placement): I = inventory, Q = quest log, C = crafting,
// V = cooking, B = building palette, Escape = close whichever of those
// panels is open (does not touch placement mode - that's input.js's Esc).
import { RECIPES, COOKING_RECIPES, ITEMS, TOOL_TIERS } from './items.js';
import { BUILDING_DEFS, isBuildingUnlocked } from './buildings.js';

// items.js/buildings.js could reasonably export their catalogs as either an
// id-keyed object (BUILDING_DEFS follows driftworks' precedent for that) or
// an array of entries with an `id` field (RECIPES/COOKING_RECIPES read like
// that in the design doc's shape spec). Since several agents are building
// those concurrently against the same doc, normalize defensively rather
// than assume one shape and break on the other.
function asList(catalog) {
  if (!catalog) return [];
  if (Array.isArray(catalog)) return catalog;
  return Object.entries(catalog).map(([id, def]) => ({ id, ...def }));
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function itemName(id) {
  return ITEMS?.[id]?.name ?? id;
}

// Confirmed player feedback: hovering an item used to just repeat its name,
// which the icon usually already conveys - not real information. items.js
// now carries a real `description` per entry (what it's for/grows into/
// does), so the tooltip leads with the name (still useful for the
// ore-types-sharing-one-icon case) and appends the description as a
// dash-separated line.
function itemTooltip(id) {
  const def = ITEMS?.[id];
  if (!def) return id;
  return def.description ? `${def.name} — ${def.description}` : def.name;
}

function buildingName(id) {
  return BUILDING_DEFS?.[id]?.name ?? id;
}

function formatCost(cost) {
  return (cost || []).map(({ item, qty }) => `${qty} ${itemName(item)}`).join(', ');
}

// Sums an inventory slot list into a plain item-id -> total-qty map, used
// for crafting/cooking/building affordability checks. Tolerant of holes
// (null slots) since a slot array almost certainly has empty gaps.
function sumInventory(slots) {
  const totals = new Map();
  for (const slot of slots || []) {
    if (!slot || !slot.item) continue;
    totals.set(slot.item, (totals.get(slot.item) || 0) + (slot.qty || 0));
  }
  return totals;
}

function canAfford(inputs, totals) {
  return (inputs || []).every(({ item, qty }) => (totals.get(item) || 0) >= qty);
}

// A 'hand' recipe/dish needs no station and is always available; anything
// else needs `nearStations[station]` true. Recipes/dishes with no `station`
// field at all (shouldn't happen per the contract, but defensively) are
// treated as always available rather than permanently unusable.
function stationReady(station, nearStations) {
  if (!station || station === 'hand') return true;
  return !!nearStations?.[station];
}

// Display info for the three buff stats player.js's addBuff/getBuffTotal
// deal in (speed, stamina_regen, mining_power) - not part of items.js since
// it's purely a HUD presentation concern, same reasoning as objectiveLine()
// above living here rather than in quests.js.
const BUFF_DISPLAY = {
  speed: { icon: '⚡', label: 'Speed' },
  stamina_regen: { icon: '💧', label: 'Stamina Regen' },
  mining_power: { icon: '⛏', label: 'Mining Power' },
};

// Tool-tier HUD readout - only axe/pickaxe carry tiers (hoe/wateringCan are
// always tier 1 per the design contract), so those are the only two shown.
const TOOL_TIER_DISPLAY = {
  axe: { icon: '🪓', label: 'Axe' },
  pickaxe: { icon: '⛏️', label: 'Pickaxe' },
};

// Deterministic fallback colour for an item's hotbar/inventory swatch when
// items.js doesn't give it one - so slots are visually distinguishable even
// before ITEMS[id].color exists. Not meant to look good, just consistent.
function fallbackColor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 45%, 42%)`;
}

function swatchColor(id) {
  return ITEMS?.[id]?.color ?? fallbackColor(id);
}

// Tool-upgrade recipes (items.js's RECIPES: pickaxe_copper/iron,
// axe_copper/iron) output `{item: 'pickaxe'|'axe', qty: newTier}` - a
// player.tools slot name + tier, not a real ITEMS entry/count (see items.js's
// RECIPES comment). Anything showing such a recipe needs to special-case it
// rather than reading output.item/qty as if they were a normal item+amount.
function isToolUpgradeRecipe(recipe) {
  return recipe?.output?.item === 'pickaxe' || recipe?.output?.item === 'axe';
}

// 'pickaxe_copper' -> 'Copper Pickaxe'. Used for tool-upgrade recipe display
// names and the `craft` objective's quest-log line, since RECIPES has no
// `name` field and ITEMS has no entry for 'pickaxe'/'axe' to fall back on.
function humanizeRecipeId(id) {
  const parts = String(id).split('_');
  if (parts.length === 2) {
    const [tool, tier] = parts;
    return `${tier[0].toUpperCase()}${tier.slice(1)} ${tool[0].toUpperCase()}${tool.slice(1)}`;
  }
  return `${id[0].toUpperCase()}${id.slice(1)}`;
}

// Human-readable objective progress line for the quest log. Lives here
// (rather than quests.js) because it needs ITEMS/BUILDING_DEFS/
// COOKING_RECIPES name lookups, which quests.js deliberately doesn't import.
function objectiveLine(objective, count, target) {
  switch (objective.type) {
    case 'talk':
      return 'Find them and say hello.';
    case 'collect':
      return `${itemName(objective.item)}: ${count} / ${target}`;
    case 'plant':
      return `${itemName(objective.cropId)} planted: ${count} / ${target}`;
    case 'build': {
      const label = objective.buildingType ? buildingName(objective.buildingType) : 'buildings of your choosing';
      return `${label} placed: ${count} / ${target}`;
    }
    case 'cook': {
      if (!objective.recipeId) return 'Cook any dish.';
      const dish = asList(COOKING_RECIPES).find((r) => r.id === objective.recipeId);
      return `Cook: ${dish ? itemName(dish.output?.item) : objective.recipeId}`;
    }
    case 'craft':
      return `Craft: ${humanizeRecipeId(objective.recipeId)}`;
    case 'enter_mine':
      return 'Find the cave entrance and step inside.';
    default:
      return `${count} / ${target}`;
  }
}

export class WildergroveUI {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this._inventorySlots = [];
    this._nearStations = {};
    this._selectedBuildingId = null;
    this._dialog = null; // { npc, lineIndex } while open
    this._messageTimer = null;
    // WeakMap so a buff's original duration is captured once (the first
    // frame ui.js observes that exact buff object out of player.js's
    // {stat, amount, expiresAt} array) and then just read back every frame
    // after - see _updateBuffs. Entries fall out on their own once a buff
    // expires and update() stops passing that object in, no manual pruning
    // needed since nothing else keeps the old object alive.
    this._buffMeta = new WeakMap();

    this.root = el('div');
    this.root.id = 'wildergrove-ui';
    document.body.appendChild(this.root);

    this._buildHud();
    this._buildInventoryPanel();
    this._buildCraftingPanel();
    this._buildCookingPanel();
    this._buildBuildingPanel();
    this._buildQuestLog();
    this._buildDialogBox();
    this._buildToast();
    this._buildHowToPlay();

    this._bindKeys();
  }

  // --- HUD ----------------------------------------------------------------
  _buildHud() {
    const hud = el('div', 'wg-hud');
    // Hidden until main.js's setHudVisible(true) (on startGame()) - without
    // this, the stamina bar/day counter/hotbar show through behind the
    // canvas-drawn start screen, since this whole DOM overlay is built once
    // at construction time rather than being tied to the 'start'/'playing'
    // state machine itself.
    hud.hidden = true;
    this.hud = hud;

    const top = el('div', 'wg-topbar');
    const staminaBox = el('div', 'wg-stamina-box');
    staminaBox.appendChild(el('div', 'wg-stamina-label', 'Stamina'));
    const track = el('div', 'wg-bar-track');
    this.staminaFill = el('div', 'wg-bar-fill');
    track.appendChild(this.staminaFill);
    staminaBox.appendChild(track);
    this.buffList = el('div', 'wg-buff-list');
    staminaBox.appendChild(this.buffList);
    // Confirmed player-requested water system: the watering can is now a
    // limited, refillable resource (see player.js's waterCarried) rather
    // than an infinite tap, so it needs the same at-a-glance readout as
    // stamina - otherwise the only feedback would be the "can is empty"
    // block message, discovered only once it's too late to plan around.
    const waterBox = el('div', 'wg-water-box');
    waterBox.appendChild(el('div', 'wg-water-label', 'Water'));
    const waterTrack = el('div', 'wg-bar-track');
    this.waterFill = el('div', 'wg-bar-fill wg-bar-fill-water');
    waterTrack.appendChild(this.waterFill);
    waterBox.appendChild(waterTrack);
    staminaBox.appendChild(waterBox);
    // Confirmed player feedback: crafting a copper pickaxe gave no lasting
    // way to check what tier you actually have (tools aren't inventory
    // items, so there was never a slot/icon for them anywhere). Axe/pickaxe
    // are the only tools with tiers (hoe/wateringCan are always tier 1 - see
    // the design contract), so those are the only two shown.
    this.toolTierList = el('div', 'wg-tool-tiers');
    staminaBox.appendChild(this.toolTierList);
    top.appendChild(staminaBox);

    this.dayLabel = el('div', 'wg-day', 'Day 1');
    top.appendChild(this.dayLabel);

    const menuButtons = el('div', 'wg-menu-buttons');
    menuButtons.appendChild(this._makeMenuButton('Inventory (I)', () => this.toggleInventory()));
    menuButtons.appendChild(this._makeMenuButton('Craft (C)', () => this.toggleCrafting()));
    menuButtons.appendChild(this._makeMenuButton('Cook (V)', () => this.toggleCooking()));
    menuButtons.appendChild(this._makeMenuButton('Build (B)', () => this.toggleBuilding()));
    menuButtons.appendChild(this._makeMenuButton('Quests (Q)', () => this.toggleQuestLog()));
    menuButtons.appendChild(this._makeMenuButton('?', () => this.showHowToPlay()));
    // Previously the only way to start over was clearing localStorage by
    // hand in DevTools - confirmed player-requested convenience. The actual
    // confirm-then-erase flow lives in main.js (via window.confirm - simple
    // and always-safe against accidental clicks, no custom modal needed);
    // this button just reports the intent.
    menuButtons.appendChild(this._makeMenuButton('New Game', () => this.callbacks.onNewGame?.()));
    top.appendChild(menuButtons);

    hud.appendChild(top);

    this.hotbar = el('div', 'wg-hotbar');
    this.hotbarSlots = [];
    for (let i = 0; i < 9; i += 1) {
      const slot = el('button', 'wg-hotbar-slot');
      slot.appendChild(el('span', 'wg-slot-badge', String(i + 1)));
      const swatch = el('span', 'wg-slot-swatch');
      slot.appendChild(swatch);
      const qty = el('span', 'wg-slot-qty');
      slot.appendChild(qty);
      // CONFIRMED BUG: this used to unconditionally select the slot, with no
      // food-eating branch at all - clicking a food item in the hotbar could
      // never eat it (only re-select it, which does nothing useful since
      // food isn't used via tile-clicks). The inventory panel already had
      // this branch; the hotbar just never got the equivalent logic. Mirror
      // it here so both surfaces behave the same way.
      slot.addEventListener('click', () => {
        const item = this._inventorySlots[i];
        const isFood = item && typeof ITEMS?.[item.item]?.restoreStamina === 'number';
        if (isFood) this.callbacks.onEatFood?.(item.item);
        else this.callbacks.onSelectHotbarSlot?.(i);
      });
      this._bindDragAndDrop(slot, i);
      this.hotbar.appendChild(slot);
      this.hotbarSlots.push({ el: slot, swatch, qty });
    }
    hud.appendChild(this.hotbar);

    this.root.appendChild(hud);

    // Confirmed player feedback: placement mode (especially fence's
    // repeatable stay-in-mode-after-placing) had no persistent on-screen
    // indicator, so it was easy to wander off still "holding" a building and
    // be confused when a tile click somewhere else tried to place it instead
    // of doing whatever else you meant to (mine, chop, etc.). This is a
    // separate element from `hud` (not the fading toast either) so it stays
    // put and visible the whole time placement mode is active, independent
    // of anything else on screen.
    this.placementBanner = el('div', 'wg-placement-banner');
    this.placementBanner.hidden = true;
    this.root.appendChild(this.placementBanner);
  }

  // text: building name, or null/falsy to hide. Called by main.js's single
  // setPlacementMode() helper so this can never drift out of sync with
  // state.placementBuildingType the way scattered call sites risked.
  setPlacementBanner(text) {
    if (!text) {
      this.placementBanner.hidden = true;
      return;
    }
    this.placementBanner.textContent = `Placing: ${text} — click a tile to place, Esc to stop`;
    this.placementBanner.hidden = false;
  }

  // Native HTML5 drag-and-drop, shared by hotbar slots and inventory-panel
  // cells so an item can be dragged between either surface (or reordered
  // within one) - confirmed player-requested: the only way to get a
  // buried item onto the hotbar used to be "select it and hope", not
  // actually relocate it. `index` is read fresh from `this._inventorySlots`
  // at drag time (not closed over as a stale item), same pattern the click
  // handlers already use, so a cell's drag behavior stays correct as
  // contents change underneath it. main.js/inventory.js decide what
  // "moving" means (swap/merge/plain move) - see inventory.js's moveSlot.
  _bindDragAndDrop(cell, index) {
    cell.addEventListener('dragstart', (e) => {
      if (!this._inventorySlots[index]) { e.preventDefault(); return; }
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
      cell.classList.add('wg-dragging');
    });
    cell.addEventListener('dragend', () => cell.classList.remove('wg-dragging'));
    cell.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      cell.classList.add('wg-drop-target');
    });
    cell.addEventListener('dragleave', () => cell.classList.remove('wg-drop-target'));
    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      cell.classList.remove('wg-drop-target');
      const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (Number.isInteger(from)) this.callbacks.onMoveItem?.(from, index);
    });
  }

  _makeMenuButton(label, onClick) {
    const btn = el('button', 'wg-btn wg-menu-btn', label);
    btn.addEventListener('click', onClick);
    return btn;
  }

  // --- Panel scaffold -------------------------------------------------
  // Every secondary panel (inventory/crafting/cooking/building/quest log)
  // shares the same card chrome: a title bar with a close button, hidden by
  // default. Returns {panel, body} so callers just fill in `body`.
  _buildPanelShell(className, title) {
    const panel = el('div', `wg-panel ${className}`);
    panel.hidden = true;
    const header = el('div', 'wg-panel-header');
    header.appendChild(el('span', 'wg-panel-title', title));
    const closeBtn = el('button', 'wg-panel-close', '✕');
    closeBtn.addEventListener('click', () => { panel.hidden = true; });
    header.appendChild(closeBtn);
    panel.appendChild(header);
    const body = el('div', 'wg-panel-body');
    panel.appendChild(body);
    this.root.appendChild(panel);
    return { panel, body };
  }

  _buildInventoryPanel() {
    const { panel, body } = this._buildPanelShell('wg-inventory-panel', 'Inventory');
    this.inventoryPanel = panel;
    this.inventoryGrid = el('div', 'wg-inventory-grid');
    body.appendChild(this.inventoryGrid);
    this.inventoryCells = []; // persistent pool - see _ensureInventoryCells
  }

  _buildCraftingPanel() {
    const { panel, body } = this._buildPanelShell('wg-crafting-panel', 'Crafting');
    this.craftingPanel = panel;
    this.craftingList = el('div', 'wg-recipe-list');
    body.appendChild(this.craftingList);
    for (const recipe of asList(RECIPES)) {
      this.craftingList.appendChild(this._buildRecipeRow(recipe, (id) => this.callbacks.onCraft?.(id)));
    }
  }

  _buildCookingPanel() {
    const { panel, body } = this._buildPanelShell('wg-cooking-panel', 'Cooking');
    this.cookingPanel = panel;
    this.cookingHint = el('div', 'wg-cooking-hint', 'You need to be near a campfire to cook.');
    body.appendChild(this.cookingHint);
    this.cookingList = el('div', 'wg-recipe-list');
    body.appendChild(this.cookingList);
    for (const recipe of asList(COOKING_RECIPES)) {
      this.cookingList.appendChild(this._buildRecipeRow(recipe, (id) => this.callbacks.onCook?.(id)));
    }
  }

  // Shared row builder for both the crafting and cooking lists - same shape
  // ({id, inputs, output, station}), same afford/disable treatment.
  _buildRecipeRow(recipe, onClick) {
    const row = el('button', 'wg-recipe-row');
    row.dataset.id = recipe.id;
    row.dataset.station = recipe.station || 'hand';
    const swatch = el('span', 'wg-swatch');
    // Keyed by recipe id (not output item) so the two pickaxe/axe tiers -
    // which share the same non-real output.item ('pickaxe'/'axe') - still
    // get visually distinct swatches.
    swatch.style.background = swatchColor(recipe.id);
    row.appendChild(swatch);
    const info = el('div', 'wg-recipe-info');
    const nameLine = isToolUpgradeRecipe(recipe)
      ? `${humanizeRecipeId(recipe.id)} (tier ${recipe.output.qty})`
      : `${itemName(recipe.output?.item)}${recipe.output?.qty > 1 ? ` x${recipe.output.qty}` : ''}`;
    info.appendChild(el('div', 'wg-recipe-name', nameLine));
    info.appendChild(el('div', 'wg-recipe-cost', formatCost(recipe.inputs)));

    // Payoff line: what this dish actually does, so a player can compare
    // dishes before spending ingredients on one - confirmed player feedback
    // that recipes gave no indication of their effect. Tool-upgrade recipes
    // have no ITEMS entry for their output (see isToolUpgradeRecipe) so this
    // naturally only ever populates for cooking recipes.
    const outputItem = !isToolUpgradeRecipe(recipe) ? ITEMS?.[recipe.output?.item] : null;
    if (outputItem && typeof outputItem.restoreStamina === 'number') {
      const parts = [`+${outputItem.restoreStamina} Stamina`];
      if (outputItem.buff) {
        const disp = BUFF_DISPLAY[outputItem.buff.stat] || { label: outputItem.buff.stat };
        const amount = outputItem.buff.stat === 'speed'
          ? `+${Math.round(outputItem.buff.amount * 100)}%`
          : `+${outputItem.buff.amount}`;
        parts.push(`${disp.label} ${amount} (${outputItem.buff.durationSec}s)`);
      }
      info.appendChild(el('div', 'wg-recipe-payoff', parts.join(' · ')));
    }

    // Station requirement, always shown as text (not just a silently
    // disabled row) - confirmed player feedback that the crafting menu
    // never explained WHY a recipe was greyed out, unlike cooking's
    // campfire hint.
    if (recipe.station && recipe.station !== 'hand') {
      const label = recipe.station.charAt(0).toUpperCase() + recipe.station.slice(1);
      info.appendChild(el('div', 'wg-recipe-station', `Requires: ${label}`));
    }

    row.appendChild(info);
    row.addEventListener('click', () => {
      if (row.disabled) return;
      onClick(recipe.id);
    });
    return row;
  }

  _buildBuildingPanel() {
    const { panel, body } = this._buildPanelShell('wg-building-panel', 'Build');
    this.buildingPanel = panel;

    // Demolish is a separate mode from placement (main.js owns which is
    // active) - confirmed missing entirely via playtesting: world.js already
    // had a removeBuilding() nobody ever called. ui.js just exposes the
    // toggle and reflects main.js's state back via setDemolishActive().
    this.demolishBtn = el('button', 'wg-btn wg-demolish-btn', '🔨 Demolish');
    this.demolishBtn.title = 'Toggle demolish mode, then click a building to remove it.';
    this.demolishBtn.addEventListener('click', () => this.callbacks.onToggleDemolish?.());
    body.appendChild(this.demolishBtn);

    this.buildingList = el('div', 'wg-recipe-list');
    body.appendChild(this.buildingList);
    this.buildingRows = new Map();
    for (const building of asList(BUILDING_DEFS)) {
      const row = el('button', 'wg-recipe-row');
      row.title = building.description || '';
      const swatch = el('span', 'wg-swatch');
      swatch.style.background = swatchColor(building.id);
      row.appendChild(swatch);
      const info = el('div', 'wg-recipe-info');
      info.appendChild(el('div', 'wg-recipe-name', building.name ?? building.id));
      info.appendChild(el('div', 'wg-recipe-cost', formatCost(building.cost)));
      row.appendChild(info);
      row.addEventListener('click', () => {
        if (row.disabled) return;
        this._selectedBuildingId = building.id;
        this._refreshBuildingSelection();
        this.callbacks.onSelectBuildingToPlace?.(building.id);
      });
      this.buildingList.appendChild(row);
      this.buildingRows.set(building.id, row);
    }
  }

  setDemolishActive(active) {
    this.demolishBtn?.classList.toggle('wg-active', !!active);
  }

  _buildQuestLog() {
    const { panel, body } = this._buildPanelShell('wg-quest-panel', 'Quest Log');
    this.questPanel = panel;
    body.appendChild(el('div', 'wg-quest-section-title', 'Active'));
    this.activeQuestList = el('div', 'wg-quest-list');
    body.appendChild(this.activeQuestList);
    body.appendChild(el('div', 'wg-quest-section-title', 'Completed'));
    this.completedQuestList = el('div', 'wg-quest-list wg-quest-list-completed');
    body.appendChild(this.completedQuestList);
  }

  _buildDialogBox() {
    const box = el('div', 'wg-dialog');
    box.hidden = true;
    this.dialogName = el('div', 'wg-dialog-name');
    box.appendChild(this.dialogName);
    this.dialogLine = el('div', 'wg-dialog-line');
    box.appendChild(this.dialogLine);
    const footer = el('div', 'wg-dialog-footer');
    this.dialogHint = el('div', 'wg-dialog-hint', 'Click or press Space to continue…');
    footer.appendChild(this.dialogHint);
    box.appendChild(footer);
    box.addEventListener('click', () => this._advanceDialog());
    this.root.appendChild(box);
    this.dialogBox = box;
  }

  _buildToast() {
    this.toast = el('div', 'wg-toast');
    this.toast.hidden = true;
    this.root.appendChild(this.toast);
  }

  // --- First-time "How to Play" overlay ------------------------------
  // A full-screen modal, separate from the fixed-slot secondary panels
  // above (it needs to sit centered and above everything, including the
  // dialog box) - dismissed by ANY click or keypress per the contract, not
  // just its own close button, so a player doesn't have to hunt for a tiny
  // 'x' before they can start playing.
  _buildHowToPlay() {
    const overlay = el('div', 'wg-howto-overlay');
    overlay.hidden = true;
    const card = el('div', 'wg-howto-card');
    card.appendChild(el('div', 'wg-howto-title', 'Welcome to Wildergrove'));
    card.appendChild(el(
      'div',
      'wg-howto-goal',
      "Resettle the valley: mine, farm, cook, craft and build your way through Elder Rin's quests.",
    ));

    const rows = [
      ['Move', 'WASD or the arrow keys'],
      ['Use an item', 'Click a nearby tile to use your selected tool or item on it'],
      ['Hotbar', 'Press 1-9 to select an item, or click any slot in your inventory'],
      ['Panels', 'I Inventory · C Craft · V Cook · B Build · Q Quests'],
      ['Pause', "P to pause, Esc to close a panel or cancel placement"],
    ];
    const list = el('div', 'wg-howto-list');
    for (const [label, desc] of rows) {
      const row = el('div', 'wg-howto-row');
      row.appendChild(el('span', 'wg-howto-key', label));
      row.appendChild(el('span', 'wg-howto-desc', desc));
      list.appendChild(row);
    }
    card.appendChild(list);
    card.appendChild(el('div', 'wg-howto-hint', 'Click or press any key to begin'));

    overlay.appendChild(card);
    this.root.appendChild(overlay);
    this.howToPlayOverlay = overlay;

    this._onHowToPlayDismiss = () => this.hideHowToPlay();
  }

  showHowToPlay() {
    this.howToPlayOverlay.hidden = false;
    // Deferred to the next tick so the very click that opened this (e.g. the
    // HUD's '?' button, which is still bubbling to `window` when this runs)
    // can't also be the click that immediately closes it again. Both
    // listeners are one-shot via `once: true`, and either firing removes
    // both by construction.
    setTimeout(() => {
      if (this.isHowToPlayOpen()) {
        window.addEventListener('keydown', this._onHowToPlayDismiss, { once: true });
        window.addEventListener('click', this._onHowToPlayDismiss, { once: true });
      }
    }, 0);
  }

  hideHowToPlay() {
    this.howToPlayOverlay.hidden = true;
    window.removeEventListener('keydown', this._onHowToPlayDismiss);
    window.removeEventListener('click', this._onHowToPlayDismiss);
  }

  isHowToPlayOpen() {
    return !this.howToPlayOverlay.hidden;
  }

  // --- Keyboard -------------------------------------------------------
  _bindKeys() {
    window.addEventListener('keydown', (event) => {
      // Never intercept typing (there's no text input in this UI today, but
      // this keeps panel-toggle keys from firing if one is ever added).
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

      switch (event.key.toLowerCase()) {
        case 'i': this.toggleInventory(); break;
        case 'c': this.toggleCrafting(); break;
        case 'v': this.toggleCooking(); break;
        case 'b': this.toggleBuilding(); break;
        case 'q': this.toggleQuestLog(); break;
        case ' ':
          if (this.isDialogOpen()) { event.preventDefault(); this._advanceDialog(); }
          break;
        case 'escape':
          this._closeSecondaryPanels();
          break;
        default:
          break;
      }
    });
  }

  _closeSecondaryPanels() {
    for (const panel of [this.inventoryPanel, this.craftingPanel, this.cookingPanel, this.buildingPanel, this.questPanel]) {
      panel.hidden = true;
    }
  }

  // All five secondary panels share one fixed on-screen slot (see .wg-panel
  // in wildergrove.css), so they're mutually exclusive: opening one closes
  // whichever other one was open, rather than silently stacking underneath
  // it. Without this, opening a second panel while a later-appended one
  // (e.g. the quest log, last in DOM order so always on top) was already
  // open did nothing visible - the new panel really did open, just hidden
  // behind the one on top of it.
  _togglePanel(panel) {
    const opening = panel.hidden;
    this._closeSecondaryPanels();
    panel.hidden = !opening;
  }

  // Always opens (never toggles closed) - for click-a-building-to-open-its-
  // menu (main.js's building_clicked handler), where "you clicked the
  // campfire" should never be interpreted as "please close the cooking
  // menu" just because it happened to already be open.
  _openPanel(panel) {
    this._closeSecondaryPanels();
    panel.hidden = false;
  }

  toggleInventory() { this._togglePanel(this.inventoryPanel); }
  toggleCrafting() { this._togglePanel(this.craftingPanel); }
  toggleCooking() { this._togglePanel(this.cookingPanel); }
  toggleBuilding() { this._togglePanel(this.buildingPanel); }
  toggleQuestLog() { this._togglePanel(this.questPanel); }

  openInventory() { this._openPanel(this.inventoryPanel); }
  openCrafting() { this._openPanel(this.craftingPanel); }
  openCooking() { this._openPanel(this.cookingPanel); }

  // --- NPC dialog -------------------------------------------------------
  // Purely presentational: showing/advancing/closing the dialog box does
  // not itself emit `npc_talked` on the event bus - that's the interaction
  // layer's job (actions.js resolves "player clicked an NPC tile"), since
  // quests.js's `talk` objective should complete on the interaction
  // happening, not on how many lines of flavour text a player clicked
  // through. `onDialogClosed` just tells the caller the box is done with,
  // in case it wants to re-enable movement or similar.
  showNpcDialog(npc) {
    if (!npc || !npc.lines?.length) return;
    this._dialog = { npc, lineIndex: 0 };
    this.dialogName.textContent = npc.name ?? npc.id;
    this.dialogLine.textContent = npc.lines[0];
    this.dialogBox.hidden = false;
  }

  _advanceDialog() {
    if (!this._dialog) return;
    const { npc } = this._dialog;
    this._dialog.lineIndex += 1;
    if (this._dialog.lineIndex >= npc.lines.length) {
      this.closeNpcDialog();
      return;
    }
    this.dialogLine.textContent = npc.lines[this._dialog.lineIndex];
  }

  closeNpcDialog() {
    if (!this._dialog) return;
    const { npc } = this._dialog;
    this._dialog = null;
    this.dialogBox.hidden = true;
    this.callbacks.onDialogClosed?.(npc.id);
  }

  isDialogOpen() {
    return !!this._dialog;
  }

  // --- Toast messages -----------------------------------------------------
  showMessage(text, durationMs = 2500) {
    this.toast.textContent = text;
    this.toast.hidden = false;
    clearTimeout(this._messageTimer);
    this._messageTimer = setTimeout(() => { this.toast.hidden = true; }, durationMs);
  }

  // --- Building palette external sync --------------------------------
  // Lets input.js/main.js clear the placement-mode highlight when
  // placement is cancelled (e.g. Esc) or completes, without ui.js needing
  // to know about placement mode itself beyond this one flag.
  // Shows/hides the stamina/day/hotbar HUD - main.js calls this on the
  // 'start' <-> 'playing' transition (see the HUD-hiding note in _buildHud).
  setHudVisible(visible) {
    this.hud.hidden = !visible;
  }

  setSelectedBuilding(id) {
    this._selectedBuildingId = id ?? null;
    this._refreshBuildingSelection();
  }

  _refreshBuildingSelection() {
    for (const [id, row] of this.buildingRows) {
      row.classList.toggle('wg-active', id === this._selectedBuildingId);
    }
  }

  // --- Per-frame refresh -----------------------------------------------
  update(snapshot = {}) {
    const {
      day = 1,
      stamina = 0,
      maxStamina = 1,
      waterCarried = 0,
      maxWaterCarried = 1,
      inventorySlots = [],
      selectedHotbarIndex = -1,
      nearStations = {},
      quests = { active: [], completed: [] },
      buffs = [],
      now = 0,
      tools = null,
    } = snapshot;

    this._inventorySlots = inventorySlots;
    this._nearStations = nearStations;

    this.dayLabel.textContent = `Day ${day}`;
    const pct = maxStamina > 0 ? Math.max(0, Math.min(1, stamina / maxStamina)) : 0;
    this.staminaFill.style.width = `${Math.round(pct * 100)}%`;
    this.staminaFill.classList.toggle('wg-bar-low', pct < 0.25);

    const waterPct = maxWaterCarried > 0 ? Math.max(0, Math.min(1, waterCarried / maxWaterCarried)) : 0;
    this.waterFill.style.width = `${Math.round(waterPct * 100)}%`;
    this.waterFill.classList.toggle('wg-bar-low', waterPct < 0.25);

    this._updateHotbar(inventorySlots, selectedHotbarIndex);
    this._updateInventoryGrid(inventorySlots, selectedHotbarIndex);
    this._updateBuffs(buffs, now);
    this._updateToolTiers(tools);

    const totals = sumInventory(inventorySlots);
    this._updateRecipeList(this.craftingList, asList(RECIPES), totals, nearStations);
    this.cookingHint.hidden = !!nearStations.campfire;
    this._updateRecipeList(this.cookingList, asList(COOKING_RECIPES), totals, nearStations);
    const completedIds = new Set((quests.completed || []).map((q) => q.id));
    this._updateBuildingAfford(totals, completedIds);
    this._updateQuestLog(quests);
  }

  _updateHotbar(inventorySlots, selectedIndex) {
    for (let i = 0; i < this.hotbarSlots.length; i += 1) {
      const { el: slotEl, swatch, qty } = this.hotbarSlots[i];
      const item = inventorySlots[i];
      slotEl.classList.toggle('wg-active', i === selectedIndex);
      if (item && item.item) {
        swatch.style.background = swatchColor(item.item);
        swatch.textContent = ITEMS?.[item.item]?.icon ?? '';
        qty.textContent = item.qty > 1 ? String(item.qty) : '';
        slotEl.title = itemTooltip(item.item);
        slotEl.classList.remove('wg-slot-empty');
        slotEl.draggable = true;
      } else {
        swatch.style.background = 'transparent';
        swatch.textContent = '';
        qty.textContent = '';
        slotEl.title = '';
        slotEl.classList.add('wg-slot-empty');
        slotEl.draggable = false; // still a valid drop target - see _bindDragAndDrop
      }
    }
  }

  // Active-buff indicators near the stamina bar: an icon+label, remaining
  // seconds, and a shrinking bar. player.buffs entries ({stat, amount,
  // expiresAt}) carry no total duration, so this WeakMap-caches each buff
  // object's original span the first frame it's seen (expiresAt - now at
  // that moment, off by at most one frame) purely so the bar has something
  // to shrink relative to - see the WeakMap's doc comment in the constructor.
  _updateBuffs(buffs, now) {
    this.buffList.textContent = '';
    for (const buff of buffs || []) {
      let meta = this._buffMeta.get(buff);
      if (!meta) {
        meta = { total: Math.max(0.001, buff.expiresAt - now) };
        this._buffMeta.set(buff, meta);
      }
      const remaining = Math.max(0, buff.expiresAt - now);
      if (remaining <= 0) continue;
      const pct = Math.max(0, Math.min(1, remaining / meta.total));
      const display = BUFF_DISPLAY[buff.stat] || { icon: '✦', label: buff.stat };

      const row = el('div', 'wg-buff-row');
      row.title = `${display.label} - ${Math.ceil(remaining)}s left`;
      row.appendChild(el('span', 'wg-buff-icon', display.icon));
      const barTrack = el('div', 'wg-buff-bar-track');
      const barFill = el('div', 'wg-buff-bar-fill');
      barFill.style.width = `${Math.round(pct * 100)}%`;
      barTrack.appendChild(barFill);
      row.appendChild(barTrack);
      row.appendChild(el('span', 'wg-buff-time', `${Math.ceil(remaining)}s`));
      this.buffList.appendChild(row);
    }
  }

  _updateToolTiers(tools) {
    this.toolTierList.textContent = '';
    if (!tools) return;
    for (const [key, display] of Object.entries(TOOL_TIER_DISPLAY)) {
      const tier = tools[key];
      if (!tier) continue;
      const row = el('div', 'wg-tool-tier-row');
      const tierName = TOOL_TIERS?.[tier] ?? tier;
      row.title = `${display.label}: ${tierName[0].toUpperCase()}${tierName.slice(1)} (tier ${tier})`;
      row.appendChild(el('span', 'wg-tool-tier-icon', display.icon));
      row.appendChild(el('span', 'wg-tool-tier-name', tierName[0].toUpperCase() + tierName.slice(1)));
      this.toolTierList.appendChild(row);
    }
  }

  // Persistent cell pool, grown as needed (e.g. a chest's +20 slots) rather
  // than cleared and rebuilt every call. CONFIRMED BUG this fixes: this used
  // to tear down and recreate every cell's DOM button on every single
  // update() call - which runs every animation frame, ~60/sec, whenever the
  // panel is open. A real mouse click's mousedown-to-mouseup takes longer
  // than one frame, so a click could easily land on a button that had
  // already been replaced mid-click and silently do nothing. That's why the
  // hotbar (built once, see _buildHud) always worked reliably while this
  // panel didn't - confirmed via playtesting as the actual cause of "can't
  // select things in inventory, only in the hotbar". Cells read the CURRENT
  // item from this._inventorySlots[index] at click time (same pattern the
  // hotbar's click handlers already use), so a stable pool never needs its
  // listeners rebound as contents change.
  _ensureInventoryCells(count) {
    while (this.inventoryCells.length < count) {
      const index = this.inventoryCells.length;
      const cell = el('button', 'wg-inv-cell');
      const swatch = el('span', 'wg-slot-swatch');
      cell.appendChild(swatch);
      const qty = el('span', 'wg-slot-qty');
      cell.appendChild(qty);
      cell.addEventListener('click', () => {
        const item = this._inventorySlots[index];
        if (!item || !item.item) return;
        // Food eats straight from the panel; anything else just becomes the
        // selected/active item - see onSelectHotbarSlot's doc comment above.
        const isFood = typeof ITEMS?.[item.item]?.restoreStamina === 'number';
        if (isFood) this.callbacks.onEatFood?.(item.item);
        else this.callbacks.onSelectHotbarSlot?.(index);
      });
      this._bindDragAndDrop(cell, index);
      this.inventoryGrid.appendChild(cell);
      this.inventoryCells.push({ el: cell, swatch, qty });
    }
  }

  _updateInventoryGrid(inventorySlots, selectedIndex) {
    this._ensureInventoryCells(inventorySlots.length);
    for (let i = 0; i < this.inventoryCells.length; i += 1) {
      const { el: cell, swatch, qty } = this.inventoryCells[i];
      const item = i < inventorySlots.length ? inventorySlots[i] : null;
      if (item && item.item) {
        swatch.style.background = swatchColor(item.item);
        swatch.textContent = ITEMS?.[item.item]?.icon ?? '';
        qty.textContent = item.qty > 1 ? String(item.qty) : '';
        cell.title = itemTooltip(item.item);
        cell.classList.toggle('wg-active', i === selectedIndex);
        cell.classList.remove('wg-slot-empty');
        cell.draggable = true;
      } else {
        swatch.style.background = 'transparent';
        swatch.textContent = '';
        qty.textContent = '';
        cell.title = '';
        cell.classList.remove('wg-active');
        cell.classList.add('wg-slot-empty');
        // Not `disabled` - an empty cell must stay a valid drag-and-drop
        // target (disabled buttons don't receive dragover/drop events in
        // most browsers); the click handler already no-ops safely here.
        cell.draggable = false;
      }
    }
  }

  _updateRecipeList(listEl, recipes, totals, nearStations) {
    for (const row of listEl.children) {
      const recipe = recipes.find((r) => r.id === row.dataset.id);
      if (!recipe) continue;
      const ready = stationReady(recipe.station, nearStations);
      const affordable = canAfford(recipe.inputs, totals);
      row.disabled = !ready || !affordable;
      row.classList.toggle('wg-locked', !ready);
      row.classList.toggle('wg-unaffordable', ready && !affordable);
    }
  }

  // completedIds: a Set of completed quest ids (derived from the snapshot's
  // quests.completed list) - used to hide buildings that haven't unlocked
  // yet per buildings.js's requiresQuest field. Confirmed fix for two
  // playtesting findings at once: all 8 buildings being dumped on a brand
  // new player with no context, and the "built a forge before its quest
  // was active so the quest tracker never saw it" bug (you simply can't
  // place a building before the quest chain calls for it anymore).
  _updateBuildingAfford(totals, completedIds) {
    const isCompleted = (id) => !!completedIds?.has(id);
    for (const building of asList(BUILDING_DEFS)) {
      const row = this.buildingRows.get(building.id);
      if (!row) continue;
      const unlocked = isBuildingUnlocked(building.id, isCompleted);
      row.hidden = !unlocked;
      if (!unlocked) continue;
      row.disabled = !canAfford(building.cost, totals);
      row.classList.toggle('wg-unaffordable', row.disabled);
    }
  }

  _updateQuestLog(quests) {
    this.activeQuestList.textContent = '';
    for (const quest of quests.active || []) {
      this.activeQuestList.appendChild(this._buildQuestRow(quest, false));
    }
    if (!quests.active?.length) {
      this.activeQuestList.appendChild(el('div', 'wg-quest-empty', 'No active quests right now.'));
    }

    this.completedQuestList.textContent = '';
    for (const quest of quests.completed || []) {
      this.completedQuestList.appendChild(this._buildQuestRow(quest, true));
    }
  }

  _buildQuestRow(quest, isComplete) {
    const row = el('div', `wg-quest-row ${isComplete ? 'wg-quest-complete' : ''}`.trim());
    row.appendChild(el('div', 'wg-quest-title', quest.title));
    row.appendChild(el('div', 'wg-quest-desc', quest.description));
    if (!isComplete) {
      row.appendChild(el('div', 'wg-quest-progress', objectiveLine(quest.objective, quest.count, quest.target)));
    }
    return row;
  }
}
