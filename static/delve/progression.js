// progression.js - meta-progression across runs: a persistent currency
// ("Essence") and permanent perk levels, both saved to localStorage so they
// survive a page reload. Deliberately separate from loot.js: loot/armor
// bonuses are per-run and reset on death, while perks here are permanent and
// only ever grow (or get spent down to buy the next perk level) between runs.
//
// The only two things another module needs from here:
// - loadMeta()/saveMeta() to read/persist the {essence, perkLevels} blob.
// - applyPerksToPlayer(player, perkLevels), called once per fresh Player (see
//   spawnFreshPlayer's caller in main.js) so perk effects can never drift out
//   of sync between the initial boot and every subsequent run start.

const META_STORAGE_KEY = 'delve_meta';

// ---------------------------------------------------------------------------
// Perk definitions
// ---------------------------------------------------------------------------

// Each perk levels up independently, costing more Essence per level (see
// getPerkCost). `apply(player, level)` is called with the player's *total*
// current level (not a delta) against a freshly-constructed Player (whose
// bonus fields all start at 0 - see player.js), so it always adds the full
// cumulative effect for that level in one shot.
export const PERKS = [
  {
    id: 'vigor',
    name: 'Vigor',
    description: 'Permanently increases max HP.',
    maxLevel: 5,
    baseCost: 40,
    costGrowth: 1.6,
    perLevelAmount: 20,
    formatPerLevel: () => '+20 Max HP',
    apply: (player, level) => player.addBonusMaxHp(level * 20),
  },
  {
    id: 'haste',
    name: 'Haste',
    description: 'Permanently increases move speed.',
    maxLevel: 5,
    baseCost: 35,
    costGrowth: 1.6,
    perLevelAmount: 0.5,
    formatPerLevel: () => '+0.5 Speed',
    apply: (player, level) => player.addBonusSpeed(level * 0.5),
  },
  {
    id: 'might',
    name: 'Might',
    description: 'Permanently increases attack damage.',
    maxLevel: 5,
    baseCost: 45,
    costGrowth: 1.6,
    perLevelAmount: 4,
    formatPerLevel: () => '+4 Damage',
    apply: (player, level) => player.addBonusDamage(level * 4),
  },
  {
    id: 'preparedness',
    name: 'Preparedness',
    description: 'Start each run with extra Healing Potions already in hand.',
    maxLevel: 3,
    baseCost: 60,
    costGrowth: 1.8,
    perLevelAmount: 1,
    formatPerLevel: () => '+1 starting Potion',
    apply: (player, level) => player.addPotions(level * 1),
  },
];

// ---------------------------------------------------------------------------
// Essence reward
// ---------------------------------------------------------------------------

// Tunable per-run Essence formula: deeper and more successful runs earn more.
// Exact tuning doesn't matter much - just make progress feel monotonic.
export const ESSENCE_PER_FLOOR = 15;
export const ESSENCE_PER_KILL = 4;

/**
 * Essence awarded for a completed run, based on how far it got (`floor`)
 * and how much it killed along the way (`kills`).
 */
export function computeEssenceReward(floor, kills) {
  return Math.round(floor * ESSENCE_PER_FLOOR + kills * ESSENCE_PER_KILL);
}

// ---------------------------------------------------------------------------
// Cost curve
// ---------------------------------------------------------------------------

/**
 * Essence cost to buy perk `perk`'s NEXT level, given its `currentLevel`
 * (0-indexed level count, i.e. 0 means not yet purchased). Grows
 * geometrically (baseCost * costGrowth^currentLevel) so early levels are
 * cheap and later ones are a real investment.
 */
export function getPerkCost(perk, currentLevel) {
  return Math.round(perk.baseCost * Math.pow(perk.costGrowth, currentLevel));
}

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

function clampLevel(level, maxLevel) {
  if (!Number.isFinite(level)) return 0;
  return Math.max(0, Math.min(maxLevel, Math.floor(level)));
}

function defaultMeta() {
  const perkLevels = {};
  for (const perk of PERKS) perkLevels[perk.id] = 0;
  return { essence: 0, perkLevels };
}

/**
 * Reads the persisted {essence, perkLevels} blob from localStorage. Falls
 * back to a fresh zeroed blob if nothing is stored yet, the stored JSON is
 * malformed, or localStorage itself throws (private browsing / disabled
 * storage) - the game should never crash over this, just start "new player".
 * Unknown/missing perk ids are dropped/defaulted to 0 so a future change to
 * the PERKS list can't leave stale or missing entries.
 */
export function loadMeta() {
  try {
    const raw = window.localStorage.getItem(META_STORAGE_KEY);
    if (!raw) return defaultMeta();

    const parsed = JSON.parse(raw);
    const meta = defaultMeta();
    if (typeof parsed.essence === 'number' && Number.isFinite(parsed.essence)) {
      meta.essence = Math.max(0, Math.floor(parsed.essence));
    }
    if (parsed.perkLevels && typeof parsed.perkLevels === 'object') {
      for (const perk of PERKS) {
        const stored = parsed.perkLevels[perk.id];
        if (typeof stored === 'number') {
          meta.perkLevels[perk.id] = clampLevel(stored, perk.maxLevel);
        }
      }
    }
    return meta;
  } catch {
    return defaultMeta();
  }
}

/**
 * Persists `meta` ({essence, perkLevels}) to localStorage. Swallows any
 * error (private browsing / disabled storage) - the in-memory `meta` object
 * the caller holds keeps working for the rest of the session either way,
 * it just won't survive a reload.
 */
export function saveMeta(meta) {
  try {
    window.localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // Degrade to in-memory-only; nothing else to do here.
  }
}

// ---------------------------------------------------------------------------
// Applying purchases
// ---------------------------------------------------------------------------

/**
 * Attempts to buy the next level of perk `perkId`, mutating `meta` in place
 * (spending Essence, bumping the level) if `meta` currently has enough
 * Essence and the perk isn't already maxed. Returns true if the purchase
 * went through. Does NOT persist - callers should follow a successful
 * purchase with saveMeta(meta).
 */
export function purchasePerk(meta, perkId) {
  const perk = PERKS.find((p) => p.id === perkId);
  if (!perk) return false;

  const level = meta.perkLevels[perkId] ?? 0;
  if (level >= perk.maxLevel) return false;

  const cost = getPerkCost(perk, level);
  if (meta.essence < cost) return false;

  meta.essence -= cost;
  meta.perkLevels[perkId] = level + 1;
  return true;
}

/**
 * Applies every currently-owned perk level in `perkLevels` to `player` in
 * one shot. Meant to be called exactly once, immediately after a fresh
 * Player is constructed (its bonus fields all start at 0 - see player.js) -
 * see spawnFreshPlayer's caller in main.js. Levels at 0 are skipped (no-op).
 */
export function applyPerksToPlayer(player, perkLevels) {
  for (const perk of PERKS) {
    const level = perkLevels[perk.id] ?? 0;
    if (level > 0) perk.apply(player, level);
  }
}
