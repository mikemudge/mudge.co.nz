// Global resource pools, tech unlocks, and the quota/strike loop that ends a
// run. Two global pools only (stockpile + techPoints) - no per-tile
// warehouses, per the design contract.
import { TECH_TREE, generateQuota } from './items.js';

export class Economy {
  constructor() {
    this.stockpile = {};
    this.techPoints = 0;
    this.unlockedTech = new Set();
    this.currentQuota = null;
    this.quotaTimer = 0;
    this.quotasFulfilled = 0;
    this.strikes = 0;
    // Owns quota difficulty progression internally since tick() needs to be
    // able to advance to the next quota on its own (deadline miss) without
    // Simulation supplying a wave number every frame.
    this.waveNumber = 0;
  }

  addToStockpile(itemId, qty) {
    this.stockpile[itemId] = (this.stockpile[itemId] || 0) + qty;
  }

  canAfford(cost) {
    return Object.entries(cost).every(([item, qty]) => (this.stockpile[item] || 0) >= qty);
  }

  spend(cost) {
    if (!this.canAfford(cost)) return false;
    for (const [item, qty] of Object.entries(cost)) {
      this.stockpile[item] -= qty;
    }
    return true;
  }

  unlockTech(techId) {
    const node = TECH_TREE.find((t) => t.id === techId);
    if (!node) return false;
    if (this.unlockedTech.has(techId)) return false;
    if (this.techPoints < node.cost) return false;

    this.techPoints -= node.cost;
    this.unlockedTech.add(techId);
    // buildings.js's processor/assembler gate crafting with a direct
    // `unlockedTech.has(recipe.id)` check, so recipe ids granted by this
    // node must land in the same Set alongside tech node ids.
    if (node.unlocks && node.unlocks.recipes) {
      for (const recipeId of node.unlocks.recipes) this.unlockedTech.add(recipeId);
    }
    return true;
  }

  // Highest tier of `type` the player is currently allowed to place.
  // Tier 0 is always available; tier 1+ requires a tech node whose
  // unlocks.buildingTiers[type] is >= that tier.
  getMaxBuildingTier(type) {
    let max = 0;
    for (const techId of this.unlockedTech) {
      const node = TECH_TREE.find((t) => t.id === techId);
      const tier = node?.unlocks?.buildingTiers?.[type];
      if (typeof tier === 'number' && tier > max) max = tier;
    }
    return max;
  }

  // True once some unlocked tech node lists this recipe, or the recipe is
  // tier 0 (always available). buildings.js may consult this before
  // crafting; recipe.tier is looked up by the caller via items.js.
  isRecipeUnlocked(recipeId) {
    for (const techId of this.unlockedTech) {
      const node = TECH_TREE.find((t) => t.id === techId);
      if (node?.unlocks?.recipes?.includes(recipeId)) return true;
    }
    return false;
  }

  // Multiplicative buff lookup, e.g. getBuff('erosionIntervalMult') - each
  // unlocked tech node that grants the named buff multiplies it in.
  getBuff(name, base = 1) {
    let value = base;
    for (const techId of this.unlockedTech) {
      const node = TECH_TREE.find((t) => t.id === techId);
      const buff = node?.unlocks?.buffs?.[name];
      if (typeof buff === 'number') value *= buff;
    }
    return value;
  }

  startNextQuota(waveNumber) {
    this.waveNumber = waveNumber;
    this.currentQuota = { ...generateQuota(waveNumber), deliveredQty: 0 };
    this.quotaTimer = 0;
  }

  // Called when items reach a Dock. Progresses currentQuota if itemId
  // matches; fulfilling it pays out rewards and starts the next quota.
  reportDockDelivery(itemId, qty) {
    if (!this.currentQuota || itemId !== this.currentQuota.item) return;

    this.currentQuota.deliveredQty += qty;
    if (this.currentQuota.deliveredQty >= this.currentQuota.qty) {
      this.quotasFulfilled++;
      this.techPoints += this.currentQuota.rewardTechPoints;
      if (this.currentQuota.rewardStockpile) {
        for (const [item, rewardQty] of Object.entries(this.currentQuota.rewardStockpile)) {
          this.addToStockpile(item, rewardQty);
        }
      }
      this.startNextQuota(this.waveNumber + 1);
    }
  }

  tick(dt) {
    if (!this.currentQuota) return;
    this.quotaTimer += dt;
    if (this.quotaTimer >= this.currentQuota.deadline) {
      this.strikes++;
      this.startNextQuota(this.waveNumber + 1);
    }
  }

  serialize() {
    return {
      stockpile: { ...this.stockpile },
      techPoints: this.techPoints,
      unlockedTech: Array.from(this.unlockedTech),
      currentQuota: this.currentQuota,
      quotaTimer: this.quotaTimer,
      quotasFulfilled: this.quotasFulfilled,
      strikes: this.strikes,
      waveNumber: this.waveNumber,
    };
  }

  static deserialize(data) {
    const economy = new Economy();
    economy.stockpile = { ...data.stockpile };
    economy.techPoints = data.techPoints;
    economy.unlockedTech = new Set(data.unlockedTech || []);
    economy.currentQuota = data.currentQuota;
    economy.quotaTimer = data.quotaTimer;
    economy.quotasFulfilled = data.quotasFulfilled;
    economy.strikes = data.strikes;
    economy.waveNumber = data.waveNumber || 0;
    return economy;
  }
}
