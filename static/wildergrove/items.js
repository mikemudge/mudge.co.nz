// Item catalog, resource yields, tool tiers, crop defs, and craft/cook
// recipes — the "what exists and what can be made" data other modules (
// inventory.js, world.js, farming.js, buildings.js, actions.js, ui.js) drive
// off of. Pure data + a couple of pure lookups; no game state lives here.
//
// Tools are NOT inventory items. Per the design contract, player.js holds
// `player.tools: {axe, pickaxe, hoe, wateringCan}` as plain tier numbers
// (1-4), not stacks in the inventory — you can't drop/lose/stack a pickaxe,
// you just own one that gets better. Modelling them as ITEMS entries would
// mean inventory.js has to special-case "this stack can only ever be 0 or 1
// and lives in a fixed hotbar-adjacent slot", which is exactly the mess the
// contract's player.js shape avoids. So ITEMS has no axe/pickaxe/hoe/
// wateringCan entries, and RECIPES' tool-upgrade outputs are a deliberate
// exception to "output is a real item" — see the RECIPES comment below.
// `torch` is the one tool-ish thing that IS a normal inventory item: it's
// consumable/placeable rather than a tiered player capability.

// `icon` is a single emoji used by ui.js for hotbar/inventory swatches (no
// external art assets/sprite sheets per site convention) so items read as
// distinct at a glance instead of falling back to hash-based colors.
//
// `color` is an optional hex swatch color that ui.js's swatchColor() prefers
// over its hash-based fallback. It exists for two separate reasons:
//   - copper/iron/gold ore share one plain-rock icon (see the Ores section
//     below) because there's no good per-metal "raw ore" emoji, so `color`
//     is the ONLY thing that visually tells them apart - not decorative.
//   - every other item was previously left to ui.js's hash fallback, which
//     a player mistook for meaningful category coding since it happened to
//     look consistent-ish. Giving every item a real, deliberately-grouped
//     color makes that appearance actually true instead of coincidental.
export const ITEMS = {
  // --- Raw materials (mined/chopped from resource nodes). Earthy brown/
  // gray/green family so this category reads as one visual group. ---
  wood: {
    id: 'wood', name: 'Wood', maxStack: 99, category: 'material', icon: '🪵', color: '#8b5a2b',
    description: 'Chopped from trees. Used in most building and crafting recipes, from torches to tool upgrades.',
  },
  stone: {
    id: 'stone', name: 'Stone', maxStack: 99, category: 'material', icon: '🪨', color: '#8a8a8a',
    description: 'Mined from rock nodes. A basic building material and forge recipe ingredient.',
  },
  coal: {
    id: 'coal', name: 'Coal', maxStack: 99, category: 'material', icon: '⚫', color: '#3a3a3a',
    description: 'A bonus drop from rock nodes. Burns hot - needed to smelt ore into ingots and to craft torches.',
  },
  // Gem gets its own distinct color/icon rather than joining the earthy
  // materials family - it's a rare gate-keeping ingredient (gold tools, see
  // RECIPES below), not a common gatherable, and should read as special.
  gem: {
    id: 'gem', name: 'Gem', maxStack: 99, category: 'material', icon: '💎', color: '#7ac0e8',
    description: 'A rare find. The key gating ingredient for gold-tier pickaxe and axe upgrades.',
  },
  berries: {
    id: 'berries', name: 'Berries', maxStack: 99, category: 'material', icon: '🍓', color: '#5a7d3a',
    description: 'Picked from berry bushes. Used in campfire skewers and berry tarts.',
  },
  mushroom: {
    id: 'mushroom', name: 'Mushroom', maxStack: 99, category: 'material', icon: '🍄', color: '#a68b6c',
    description: 'Foraged from mushroom nodes. Used in campfire skewers and pumpkin soup.',
  },
  // Dug from clay_deposit nodes (see RESOURCE_NODE_YIELDS) for the Potter's
  // Wheel's 'pottery' station recipes below - a raw material like wood/
  // stone rather than a mined ore, so it sits here, not in the Ores group.
  clay: {
    id: 'clay', name: 'Clay', maxStack: 99, category: 'material', icon: '🧱', color: '#bf6a3d',
    description: "Dug from clay deposits. Fire it into a ceramic bowl at a Potter's Wheel.",
  },

  // --- Ores. All three share the same plain-rock icon (no good per-metal
  // "raw ore" emoji exists) - `color` is what actually distinguishes them,
  // and matches render.js's PALETTE.oreCopper/oreIron/oreGold so the
  // world-map glyph and the inventory icon for the same ore agree. ---
  copper_ore: {
    id: 'copper_ore', name: 'Copper Ore', maxStack: 99, category: 'ore', icon: '🪨', color: '#c97a4a',
    description: 'Mined with any pickaxe. Smelt at a forge into copper ingots for tier-2 tools.',
  },
  iron_ore: {
    id: 'iron_ore', name: 'Iron Ore', maxStack: 99, category: 'ore', icon: '🪨', color: '#9b5b4a',
    description: 'Needs a copper pickaxe or better to mine. Smelt at a forge into iron ingots for tier-3 tools.',
  },
  gold_ore: {
    id: 'gold_ore', name: 'Gold Ore', maxStack: 99, category: 'ore', icon: '🪨', color: '#d4af37',
    description: 'Needs an iron pickaxe or better to mine. Combine with gems at a forge for gold-tier tools.',
  },

  // --- Ingots (forge-smelted from raw ore, see the smelt_* RECIPES below).
  // Raw ore alone used to be the tool-upgrade cost; smelting it into an
  // ingot first adds a real forge production step and a coal sink, so tool
  // upgrades represent ore+coal+forge-time instead of just a pile of rocks.
  // Like the ores above, all three share one plain-bar icon and are told
  // apart purely by `color` - each picked to read as a shinier, more
  // "refined" version of its raw-ore color rather than a duplicate of it. ---
  copper_ingot: {
    id: 'copper_ingot', name: 'Copper Ingot', maxStack: 99, category: 'material', icon: '⬜', color: '#e0956a',
    description: 'Smelted from copper ore and coal at a forge. Used to craft copper (tier-2) pickaxes and axes.',
  },
  iron_ingot: {
    id: 'iron_ingot', name: 'Iron Ingot', maxStack: 99, category: 'material', icon: '⬜', color: '#b0b0b8',
    description: 'Smelted from iron ore and coal at a forge. Used to craft iron (tier-3) pickaxes and axes.',
  },
  gold_ingot: {
    id: 'gold_ingot', name: 'Gold Ingot', maxStack: 99, category: 'material', icon: '⬜', color: '#f4d160',
    description: 'Smelted from gold ore and coal at a forge. Gold tools are forged from raw gold ore instead, so this is mainly a valuable stockpile good for now.',
  },

  // --- Pottery (fired at the 'pottery' station from clay, see craft_bowl
  // in RECIPES). ceramic_bowl lives here, not in a tool-like category,
  // because it's consumed as a cooking ingredient (see the vegetable_stew/
  // pumpkin_soup COOKING_RECIPES updates below) rather than held/equipped. ---
  ceramic_bowl: {
    id: 'ceramic_bowl', name: 'Ceramic Bowl', maxStack: 99, category: 'material', icon: '🥣', color: '#a8552e',
    description: "Fired from clay at a Potter's Wheel. Required to cook vegetable stew and pumpkin soup.",
  },

  // --- Seeds. Shared green family (distinct from the crops they grow into)
  // so "this is a seed" reads at a glance regardless of which crop. ---
  turnip_seed: {
    id: 'turnip_seed', name: 'Turnip Seed', maxStack: 99, category: 'seed', icon: '🌱', color: '#4a7c3c',
    description: 'Plant on tilled soil. Turnips are quick and forgiving - ready in about 2 days.',
  },
  carrot_seed: {
    id: 'carrot_seed', name: 'Carrot Seed', maxStack: 99, category: 'seed', icon: '🌱', color: '#5f9450',
    description: 'Plant on tilled soil. Carrots take about 3 days to mature.',
  },
  wheat_seed: {
    id: 'wheat_seed', name: 'Wheat Seed', maxStack: 99, category: 'seed', icon: '🌱', color: '#7aa864',
    description: 'Plant on tilled soil. Wheat takes about 4 days to mature into a key cooking ingredient.',
  },
  pumpkin_seed: {
    id: 'pumpkin_seed', name: 'Pumpkin Seed', maxStack: 99, category: 'seed', icon: '🌱', color: '#3d6b30',
    description: 'Plant on tilled soil. Pumpkins are the slowest crop, taking about 6 days to mature.',
  },

  // --- Crops (harvested from farm tiles). Each tone sits close to the
  // real crop's own color. ---
  turnip: {
    id: 'turnip', name: 'Turnip', maxStack: 99, category: 'crop', icon: '🥔', color: '#d98ca0',
    description: 'Harvested from turnip plants. Roast it over a campfire, or use it in vegetable stew.',
  },
  carrot: {
    id: 'carrot', name: 'Carrot', maxStack: 99, category: 'crop', icon: '🥕', color: '#e8792a',
    description: 'Harvested from carrot plants. A cooking ingredient - goes into vegetable stew.',
  },
  wheat: {
    id: 'wheat', name: 'Wheat', maxStack: 99, category: 'crop', icon: '🌾', color: '#d9b35c',
    description: 'Harvested from wheat plants. A cooking staple - used in bread, vegetable stew, and berry tart.',
  },
  pumpkin: {
    id: 'pumpkin', name: 'Pumpkin', maxStack: 99, category: 'crop', icon: '🎃', color: '#d9631e',
    description: 'Harvested from pumpkin plants. Its only use so far is cooking into pumpkin soup.',
  },

  // --- Tools that ARE inventory items (see file header). ---
  torch: {
    id: 'torch', name: 'Torch', maxStack: 20, category: 'tool', icon: '🔥', color: '#ff8c1a',
    description: 'Lights automatically the moment you enter the mine, giving 90 seconds of vision underground before the next one is consumed.',
  },

  // --- Cooked dishes (COOKING_RECIPES outputs). `restoreStamina` and `buff`
  // live on the item itself, not just the recipe, so anything that needs to
  // know "what does eating this do" (actions.js eat-from-inventory-click,
  // ui.js tooltips) reads ITEMS[item] directly instead of reverse-looking-up
  // a recipe by its output. COOKING_RECIPES.output only ever needs {item,
  // qty} to describe what cooking produces. Colors sit in a warm orange/red
  // "cooked" family, kept visibly distinct from the raw crop tones above so
  // a plate of stew never reads like a bowl of raw carrots. ---
  campfire_skewer: {
    id: 'campfire_skewer', name: 'Campfire Skewer', maxStack: 10, category: 'food', icon: '🍢',
    color: '#a6432a', restoreStamina: 15, buff: null,
    description: 'Cooked from berries and mushroom over a campfire. Restores 15 stamina.',
  },
  roasted_turnip: {
    id: 'roasted_turnip', name: 'Roasted Turnip', maxStack: 10, category: 'food', icon: '🍠',
    color: '#c1531f', restoreStamina: 30, buff: null,
    description: 'Cooked from turnips over a campfire. Restores 30 stamina.',
  },
  vegetable_stew: {
    id: 'vegetable_stew', name: 'Vegetable Stew', maxStack: 10, category: 'food', icon: '🍲',
    color: '#9c3f1f', restoreStamina: 50, buff: { stat: 'stamina_regen', amount: 1, durationSec: 120 },
    description: 'A hearty campfire dish. Restores 50 stamina and boosts stamina regen for 2 minutes.',
  },
  berry_tart: {
    id: 'berry_tart', name: 'Berry Tart', maxStack: 10, category: 'food', icon: '🥧',
    color: '#c0304a', restoreStamina: 20, buff: { stat: 'speed', amount: 0.25, durationSec: 90 },
    description: 'A campfire dessert. Restores 20 stamina and grants a 25% speed boost for 90 seconds.',
  },
  pumpkin_soup: {
    id: 'pumpkin_soup', name: 'Pumpkin Soup', maxStack: 10, category: 'food', icon: '🍜',
    color: '#d4551a', restoreStamina: 25, buff: { stat: 'mining_power', amount: 1, durationSec: 100 },
    description: 'A campfire dish. Restores 25 stamina and boosts mining power for 100 seconds.',
  },
  bread: {
    id: 'bread', name: 'Bread', maxStack: 10, category: 'food', icon: '🍞',
    color: '#b8763a', restoreStamina: 35, buff: null,
    description: 'Baked from wheat over a campfire. Restores 35 stamina.',
  },
};

// What harvesting one hit-to-zero of a resource node type drops. world.js's
// harvestNode() rolls a qty in [minQty, maxQty] once the node's hp hits 0.
//
// `tool` ('axe'|'pickaxe'|'hand') says what harvests this node type -
// actions.js's harvestNodeAction reads it directly instead of keeping its
// own parallel "which node needs which tool" table. CONFIRMED RECURRING BUG:
// that second table (actions.js's old NODE_TOOL_KIND) was twice left out of
// sync with world.js's node enum (coal_seam, then clay_deposit both shipped
// harvestable with no entry there, so clicking them silently no-opped -
// nothing crashed, nothing logged, the node just never yielded). Every
// harvestable node type already needs a RESOURCE_NODE_YIELDS entry to drop
// anything at all, so `tool` lives right here instead of a third file -
// there's no longer a second place to remember to update, and actions.js
// asserts at load time (see its own comment) that every entry here actually
// has one, so a future gap fails immediately and loudly instead of silently
// in play.
//
// `rock` is the sole source of coal: there's no dedicated ore/coal node type
// in the frozen world.js node enum (tree, rock, ore_copper, ore_iron,
// ore_gold, gem, berry_bush, mushroom), so rather than invent a 9th node
// type, rock nodes carry an optional low-chance `bonus` drop on top of their
// normal stone. This keeps the primary {item, minQty, maxQty} shape asked
// for on every entry and only rock gets the extra field.
export const RESOURCE_NODE_YIELDS = {
  tree: {
    item: 'wood', minQty: 2, maxQty: 4, tool: 'axe',
  },
  rock: {
    item: 'stone', minQty: 1, maxQty: 3, tool: 'pickaxe',
    bonus: { item: 'coal', chance: 0.2, qty: 1 },
  },
  ore_copper: {
    item: 'copper_ore', minQty: 1, maxQty: 3, tool: 'pickaxe',
  },
  ore_iron: {
    item: 'iron_ore', minQty: 1, maxQty: 2, tool: 'pickaxe',
  },
  ore_gold: {
    item: 'gold_ore', minQty: 1, maxQty: 1, tool: 'pickaxe',
  },
  gem: {
    item: 'gem', minQty: 1, maxQty: 1, tool: 'pickaxe',
  },
  berry_bush: {
    item: 'berries', minQty: 1, maxQty: 3, tool: 'hand',
  },
  mushroom: {
    item: 'mushroom', minQty: 1, maxQty: 2, tool: 'hand',
  },
  clay_deposit: {
    item: 'clay', minQty: 1, maxQty: 2, tool: 'pickaxe',
  },
  // CONFIRMED PLAYTESTING FEEDBACK: coal was a genuine bottleneck - it's
  // needed for every smelting recipe AND torches, but its only source was
  // rock's 20% bonus chance above (unreliable, and only available on the
  // surface, disconnected from the mine where most coal demand actually
  // happens). This is a dedicated, reliable mine-native source - see
  // world.js's NODE_DEFS.coal_seam - so digging deeper for ore naturally
  // turns up coal too, instead of requiring separate surface trips.
  coal_seam: {
    item: 'coal', minQty: 2, maxQty: 3, tool: 'pickaxe',
  },
};

// Tool tier -> display name. Tier 4 (gold) is reached via RECIPES'
// pickaxe_gold/axe_gold below, gated behind ORE_MIN_TIER's iron-pickaxe
// requirement for gold_ore on top of their own material cost.
export const TOOL_TIERS = { 1: 'flint', 2: 'copper', 3: 'iron', 4: 'gold' };

// Damage dealt per hit, by tool tier. Indexed the same as TOOL_TIERS.
export const TOOL_TIER_POWER = { 1: 1, 2: 2, 3: 3, 4: 5 };

// Minimum pickaxe tier required to damage an ore node AT ALL (not just dig
// faster) — hitting a node below its min tier is a no-op in world.js, not a
// slow chip. Copper needs nothing special (tier 1 flint already works);
// iron gates at copper (tier 2); gold gates at iron (tier 3).
export const ORE_MIN_TIER = { ore_copper: 1, ore_iron: 2, ore_gold: 3 };

// Crop definitions for farming.js. `stages` is the number of distinct
// visual growth sprites (0 = just-planted/tilled look, stages-1 = fully
// grown/ready-to-harvest) that render.js steps through over `growDays`.
export const CROPS = {
  turnip: {
    id: 'turnip', seedItem: 'turnip_seed', cropItem: 'turnip', growDays: 2, stages: 3,
  },
  carrot: {
    id: 'carrot', seedItem: 'carrot_seed', cropItem: 'carrot', growDays: 3, stages: 3,
  },
  wheat: {
    id: 'wheat', seedItem: 'wheat_seed', cropItem: 'wheat', growDays: 4, stages: 4,
  },
  pumpkin: {
    id: 'pumpkin', seedItem: 'pumpkin_seed', cropItem: 'pumpkin', growDays: 6, stages: 4,
  },
};

// Crafting recipes: tool upgrades plus the one hand-craftable item (torch).
// Shape is `{id, inputs:[{item,qty}], output:{item,qty}, station}` exactly
// per the contract, EXCEPT for tool-upgrade recipes' `output`: since tools
// aren't inventory items (see file header), `output.item` for those four
// recipes is not an ITEMS key — it's the player.tools slot name ('pickaxe'
// or 'axe'), and `output.qty` is the tier to set that slot to (matching
// TOOL_TIERS), not a stack size. actions.js must special-case recipes whose
// output.item is 'pickaxe'/'axe' to call player.setToolTier(...) instead of
// inventory.addItem(...) — never feed a tool-upgrade output to the
// inventory. torch is a normal recipe (real item output, station: 'hand'
// meaning craftable anywhere, no building required).
//
// Iron upgrades cost more ingots than copper (2 vs 2 ingots, but each iron
// ingot is itself pricier - see the smelt_* recipes below) on top of already
// requiring a copper pickaxe to reach iron_ore per ORE_MIN_TIER, so the
// axe/pickaxe iron tier is gated both by material cost and by prerequisite
// tool tier. Gold upgrades push this further still: they're the most
// expensive tier (more wood than iron, plus gold_ore AND gem - previously
// two 100%-purposeless collectibles with no recipe anywhere), and gold_ore
// itself requires an iron pickaxe to mine per ORE_MIN_TIER, so gold tools
// are gated by material cost, gem availability, and prerequisite tool tier
// all at once. Gold tools stay on raw gold_ore rather than gold_ingot since
// their gem requirement already makes them the rare/expensive tier without
// adding a smelting step.
//
// Copper/iron tool upgrades consume ingots, not raw ore: smelt_copper/
// smelt_iron/smelt_gold below turn 2 raw ore + 1 coal into 1 ingot, so
// pickaxe_copper/axe_copper's 2 copper_ingot represents 4 copper_ore + 2
// coal (previously a flat 3 copper_ore), and pickaxe_iron/axe_iron's 2
// iron_ingot represents 4 iron_ore + 2 coal (previously a flat 4 iron_ore).
// This makes the forge a two-stage production chain (smelt, then upgrade)
// instead of a single ore-in-tool-out step, without punishing the total
// raw-ore cost much beyond the added coal.
export const RECIPES = {
  smelt_copper: {
    id: 'smelt_copper',
    inputs: [{ item: 'copper_ore', qty: 2 }, { item: 'coal', qty: 1 }],
    output: { item: 'copper_ingot', qty: 1 },
    station: 'forge',
  },
  smelt_iron: {
    id: 'smelt_iron',
    inputs: [{ item: 'iron_ore', qty: 2 }, { item: 'coal', qty: 1 }],
    output: { item: 'iron_ingot', qty: 1 },
    station: 'forge',
  },
  smelt_gold: {
    id: 'smelt_gold',
    inputs: [{ item: 'gold_ore', qty: 2 }, { item: 'coal', qty: 1 }],
    output: { item: 'gold_ingot', qty: 1 },
    station: 'forge',
  },
  pickaxe_copper: {
    id: 'pickaxe_copper',
    inputs: [{ item: 'wood', qty: 2 }, { item: 'copper_ingot', qty: 2 }],
    output: { item: 'pickaxe', qty: 2 },
    station: 'forge',
  },
  pickaxe_iron: {
    id: 'pickaxe_iron',
    inputs: [{ item: 'wood', qty: 2 }, { item: 'iron_ingot', qty: 2 }],
    output: { item: 'pickaxe', qty: 3 },
    station: 'forge',
  },
  axe_copper: {
    id: 'axe_copper',
    inputs: [{ item: 'wood', qty: 3 }, { item: 'copper_ingot', qty: 2 }],
    output: { item: 'axe', qty: 2 },
    station: 'forge',
  },
  axe_iron: {
    id: 'axe_iron',
    inputs: [{ item: 'wood', qty: 3 }, { item: 'iron_ingot', qty: 2 }],
    output: { item: 'axe', qty: 3 },
    station: 'forge',
  },
  pickaxe_gold: {
    id: 'pickaxe_gold',
    inputs: [{ item: 'wood', qty: 4 }, { item: 'gold_ore', qty: 4 }, { item: 'gem', qty: 2 }],
    output: { item: 'pickaxe', qty: 4 },
    station: 'forge',
  },
  axe_gold: {
    id: 'axe_gold',
    inputs: [{ item: 'wood', qty: 5 }, { item: 'gold_ore', qty: 4 }, { item: 'gem', qty: 2 }],
    output: { item: 'axe', qty: 4 },
    station: 'forge',
  },
  torch: {
    id: 'torch',
    inputs: [{ item: 'wood', qty: 1 }, { item: 'coal', qty: 1 }],
    output: { item: 'torch', qty: 1 },
    station: 'hand',
  },
  // 'pottery' is a new station distinct from 'hand'/'forge' - the Potter's
  // Wheel building - rather than reusing 'hand', since firing clay needs
  // that building the same way smelting/tool-upgrades need a forge.
  craft_bowl: {
    id: 'craft_bowl',
    inputs: [{ item: 'clay', qty: 2 }],
    output: { item: 'ceramic_bowl', qty: 1 },
    station: 'pottery',
  },
};

// Cooking recipes (require a campfire). Unlike RECIPES, every output here
// IS a real inventory item (a cooked dish, see ITEMS above) — eating it
// reads restoreStamina/buff off ITEMS[output.item], this table only says
// what a campfire session consumes and produces.
export const COOKING_RECIPES = {
  campfire_skewer: {
    id: 'campfire_skewer',
    inputs: [{ item: 'berries', qty: 1 }, { item: 'mushroom', qty: 1 }],
    output: { item: 'campfire_skewer', qty: 1 },
    buff: null,
  },
  roasted_turnip: {
    id: 'roasted_turnip',
    inputs: [{ item: 'turnip', qty: 2 }],
    output: { item: 'roasted_turnip', qty: 1 },
    buff: null,
  },
  // Stew and soup are the two liquid "in a bowl" dishes, so they alone
  // consume a ceramic_bowl - skewers are eaten off the stick, roasted
  // turnip and berry tart are handheld, none of them need a bowl to hold.
  vegetable_stew: {
    id: 'vegetable_stew',
    inputs: [
      { item: 'turnip', qty: 1 }, { item: 'carrot', qty: 1 }, { item: 'wheat', qty: 1 },
      { item: 'ceramic_bowl', qty: 1 },
    ],
    output: { item: 'vegetable_stew', qty: 1 },
    buff: { stat: 'stamina_regen', amount: 1, durationSec: 120 },
  },
  berry_tart: {
    id: 'berry_tart',
    inputs: [{ item: 'berries', qty: 2 }, { item: 'wheat', qty: 1 }],
    output: { item: 'berry_tart', qty: 1 },
    buff: { stat: 'speed', amount: 0.25, durationSec: 90 },
  },
  pumpkin_soup: {
    id: 'pumpkin_soup',
    inputs: [{ item: 'pumpkin', qty: 1 }, { item: 'mushroom', qty: 1 }, { item: 'ceramic_bowl', qty: 1 }],
    output: { item: 'pumpkin_soup', qty: 1 },
    buff: { stat: 'mining_power', amount: 1, durationSec: 100 },
  },
  bread: {
    id: 'bread',
    inputs: [{ item: 'wheat', qty: 3 }],
    output: { item: 'bread', qty: 1 },
    buff: null,
  },
};
