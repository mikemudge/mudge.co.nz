// Item catalog, recipes, tech tree, and quota generation - the "what can
// exist and what can be made" data that buildings.js and economy.js drive.
import { clamp, choice } from './utils.js';

export const ITEMS = {
  // Raw goods, pulled straight from resource nodes by extractors.
  oreRaw: { id: 'oreRaw', name: 'Raw Ore', color: '#9a8c78' },
  crystalRaw: { id: 'crystalRaw', name: 'Raw Crystal', color: '#8fd6e8' },
  organicRaw: { id: 'organicRaw', name: 'Raw Organics', color: '#6f9e4c' },
  // Tier-1 processed goods (processor: 1 input type -> 1 output).
  metal: { id: 'metal', name: 'Metal', color: '#b9c0c6' },
  glass: { id: 'glass', name: 'Glass', color: '#bdeeff' },
  resin: { id: 'resin', name: 'Resin', color: '#c98a3e' },
  // Tier-2 assembled goods (assembler: 2 input types -> 1 output).
  circuit: { id: 'circuit', name: 'Circuit', color: '#4be08a' },
  hull: { id: 'hull', name: 'Hull Plate', color: '#7a8a99' },
  gel: { id: 'gel', name: 'Bio-Gel', color: '#e0a9ff' },
};

export const RESOURCE_NODE_YIELDS = {
  ore: 'oreRaw',
  crystal: 'crystalRaw',
  organic: 'organicRaw',
};

export const RECIPES = {
  smeltMetal: {
    id: 'smeltMetal',
    inputs: [{ item: 'oreRaw', qty: 1 }],
    outputs: [{ item: 'metal', qty: 1 }],
    time: 2,
    building: 'processor',
    tier: 0,
  },
  formGlass: {
    id: 'formGlass',
    inputs: [{ item: 'crystalRaw', qty: 1 }],
    outputs: [{ item: 'glass', qty: 1 }],
    time: 2.5,
    building: 'processor',
    tier: 0,
  },
  curedResin: {
    id: 'curedResin',
    inputs: [{ item: 'organicRaw', qty: 1 }],
    outputs: [{ item: 'resin', qty: 1 }],
    time: 2.5,
    building: 'processor',
    tier: 0,
  },
  efficientSmelting: {
    id: 'efficientSmelting',
    inputs: [{ item: 'oreRaw', qty: 2 }],
    outputs: [{ item: 'metal', qty: 3 }],
    time: 3,
    building: 'processor',
    tier: 1,
  },
  craftCircuit: {
    id: 'craftCircuit',
    inputs: [{ item: 'metal', qty: 1 }, { item: 'glass', qty: 1 }],
    outputs: [{ item: 'circuit', qty: 1 }],
    time: 4,
    building: 'assembler',
    tier: 1,
  },
  craftHull: {
    id: 'craftHull',
    inputs: [{ item: 'metal', qty: 2 }, { item: 'resin', qty: 1 }],
    outputs: [{ item: 'hull', qty: 1 }],
    time: 5,
    building: 'assembler',
    tier: 1,
  },
  craftGel: {
    id: 'craftGel',
    inputs: [{ item: 'resin', qty: 1 }, { item: 'glass', qty: 1 }],
    outputs: [{ item: 'gel', qty: 1 }],
    time: 4.5,
    building: 'assembler',
    tier: 1,
  },
  gelCompound: {
    id: 'gelCompound',
    inputs: [{ item: 'resin', qty: 2 }, { item: 'crystalRaw', qty: 1 }],
    outputs: [{ item: 'gel', qty: 2 }],
    time: 5,
    building: 'assembler',
    tier: 1,
  },
};

// ~8-10 nodes: cheap early unlocks (a better recipe, erosion buffs) up to
// pricier building-tier gates and stacked erosion mitigation late-game.
//
// `requires` encodes prerequisite tech ids that must already be unlocked
// before this node can be (Economy.unlockTech enforces it) - this keeps a
// player from spending points on e.g. an Assembler recipe before the
// Assembler building itself is unlocked, which would otherwise leave them
// holding a recipe they have no building to run. Roots (foundational nodes
// that only need raw goods or grant a standalone buff) omit it.
export const TECH_TREE = [
  {
    id: 'ironWorks',
    name: 'Iron Works',
    cost: 15,
    description: 'Better smelting ratios: unlocks the Efficient Smelting recipe (2 ore -> 3 metal).',
    unlocks: { recipes: ['efficientSmelting'] },
  },
  {
    id: 'seawallEngineering',
    name: 'Seawall Engineering',
    cost: 20,
    description: 'Reinforced footings slow the tide. Erosion events fire less often.',
    unlocks: { buffs: { erosionIntervalMult: 1.3 } },
  },
  {
    id: 'assemblyLine',
    name: 'Assembly Line',
    cost: 35,
    description: 'Unlocks the Assembler building and its first recipe: Circuits from metal + glass.',
    unlocks: { buildingTiers: { assembler: 1 }, recipes: ['craftCircuit'] },
  },
  {
    id: 'deepSetFoundations',
    name: 'Deep-Set Foundations',
    cost: 40,
    description: 'Cracking tiles hold together longer before collapsing into the sea.',
    unlocks: { buffs: { erosionDurationMult: 1.5 } },
  },
  {
    id: 'hullFabrication',
    name: 'Hull Fabrication',
    cost: 55,
    description: 'Unlocks Hull Plate assembly from metal + resin - a heavier shipment good.',
    unlocks: { recipes: ['craftHull'] },
    requires: ['assemblyLine'],
  },
  {
    id: 'polymerGel',
    name: 'Polymer Gel',
    cost: 55,
    description: 'Unlocks Bio-Gel assembly from resin + glass.',
    unlocks: { recipes: ['craftGel'] },
    requires: ['assemblyLine'],
  },
  {
    id: 'landReclamation',
    name: 'Land Reclamation',
    cost: 70,
    description: 'Unlocks the Reclaimer building, pushing new land out into the shallows.',
    unlocks: { buildingTiers: { reclaimer: 1 } },
  },
  {
    id: 'compoundGel',
    name: 'Compound Gel',
    cost: 85,
    description: 'Unlocks a high-yield alternate Bio-Gel recipe using raw crystal.',
    unlocks: { recipes: ['gelCompound'] },
    requires: ['polymerGel'],
  },
  {
    id: 'tidalBarriers',
    name: 'Tidal Barriers',
    cost: 100,
    description: 'Advanced barriers further slow coastal erosion, stacking with Seawall Engineering.',
    unlocks: { buffs: { erosionIntervalMult: 1.25 } },
    requires: ['seawallEngineering'],
  },
];

const RAW_QUOTA_ITEMS = ['oreRaw', 'crystalRaw', 'organicRaw'];
const TIER1_QUOTA_ITEMS = ['metal', 'glass', 'resin'];
const TIER2_QUOTA_ITEMS = ['circuit', 'hull', 'gel'];

let quotaSeq = 0;

// Scales difficulty with waveNumber: bigger quantities, tighter deadlines,
// and a growing chance of tier-2 (assembled) goods at higher waves.
//
// Front end of the curve is deliberately gentle so a first-time player can
// learn the controls: waves 0-2 only ask for raw goods (straight off an
// extractor, through belts, to a dock - no processor needed) with generous
// deadlines. Tier-1 processed goods (need an extractor+processor+dock chain)
// start at wave 3+. Tier-2 assembled goods (need two processed inputs feeding
// an assembler) don't start appearing until wave 6+ - the same 3-wave gap
// tier-1 -> tier-2 the original curve used, just shifted later.
export function generateQuota(waveNumber) {
  const useRaw = waveNumber < 3;
  const tier2Chance = clamp((waveNumber - 5) * 0.15, 0, 0.8);
  const useTier2 = !useRaw && waveNumber >= 6 && Math.random() < tier2Chance;
  const pool = useRaw ? RAW_QUOTA_ITEMS : (useTier2 ? TIER2_QUOTA_ITEMS : TIER1_QUOTA_ITEMS);
  const item = choice(pool);

  const baseQty = useRaw ? 3 : (useTier2 ? 3 : 5);
  const qty = useRaw
    ? Math.round(baseQty + waveNumber * 1.0)
    : Math.round(baseQty + waveNumber * (useTier2 ? 0.8 : 1.2));

  const baseDeadline = useRaw ? 100 : (useTier2 ? 80 : 55);
  const deadline = useRaw
    ? Math.max(60, Math.round(baseDeadline - waveNumber * 5))
    : Math.max(20, Math.round(baseDeadline - waveNumber * 2.2));

  const rewardTechPoints = 8 + waveNumber * 3 + (useTier2 ? 10 : 0);
  const rewardStockpile = Math.random() < 0.4
    ? { [choice(['oreRaw', 'crystalRaw', 'organicRaw'])]: 3 + Math.floor(waveNumber / 2) }
    : null;

  return {
    id: `quota${waveNumber}-${quotaSeq++}`,
    item,
    qty,
    deadline,
    rewardTechPoints,
    rewardStockpile,
  };
}

// Pure lookup: which raw resource kind(s) (RESOURCE_NODE_YIELDS keys, i.e.
// 'ore'/'crystal'/'organic') does `itemId` ultimately trace back to? Raw
// items resolve to their own single kind; a processed/assembled item
// recurses through every RECIPES entry that can produce it and every input
// of each such recipe, unioning results (an assembler recipe has two input
// items which may trace back to different raw kinds, and some outputs - e.g.
// 'metal', 'gel' - are produced by more than one recipe).
export function getSourceResourceKinds(itemId) {
  const ownKind = Object.keys(RESOURCE_NODE_YIELDS).find(
    (kind) => RESOURCE_NODE_YIELDS[kind] === itemId,
  );
  if (ownKind) return new Set([ownKind]);

  const kinds = new Set();
  for (const recipe of Object.values(RECIPES)) {
    if (!recipe.outputs.some((out) => out.item === itemId)) continue;
    for (const input of recipe.inputs) {
      for (const kind of getSourceResourceKinds(input.item)) kinds.add(kind);
    }
  }
  return kinds;
}

// Pure lookup: how is `itemId` made? Returns a recursive, JSON-serializable
// description of one full crafting path down to raw goods:
//   { item, raw: true }
//   { item, raw: false, recipeId, building: 'processor'|'assembler', inputs: [...] }
// Some outputs (e.g. 'metal', 'gel') have more than one recipe that can
// produce them; like getSourceResourceKinds above, this walks RECIPES in
// declaration order and takes the first matching one, so callers always see
// a single consistent path rather than every possible one.
export function getRecipeChain(itemId) {
  const ownKind = Object.keys(RESOURCE_NODE_YIELDS).find(
    (kind) => RESOURCE_NODE_YIELDS[kind] === itemId,
  );
  if (ownKind) return { item: itemId, raw: true };

  const recipe = Object.values(RECIPES).find(
    (r) => r.outputs.some((out) => out.item === itemId),
  );
  // No recipe and no resource-node yield: treat as a leaf rather than throw,
  // so a malformed/unknown itemId still renders as "nothing more to show"
  // instead of breaking the UI.
  if (!recipe) return { item: itemId, raw: true };

  const seenInputs = new Set();
  const inputs = [];
  for (const input of recipe.inputs) {
    if (seenInputs.has(input.item)) continue;
    seenInputs.add(input.item);
    inputs.push(getRecipeChain(input.item));
  }

  return {
    item: itemId, raw: false, recipeId: recipe.id, building: recipe.building, inputs,
  };
}
