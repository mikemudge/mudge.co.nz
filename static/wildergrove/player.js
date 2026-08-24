// Player state, movement, collision, stamina and buffs for Wildergrove, per
// the design contract's player.js section. Deliberately does not import
// world.js: collision resolution takes an `isTileFree(gx, gy)` predicate as
// a parameter instead, so this module stays usable/testable before (and
// independent of) world.js's real implementation.
import { TILE_SIZE } from './render.js';

// World-px per second at buff amount 0. A `speed` buff is a multiplier bonus
// (e.g. amount 0.3 => +30% speed), summed across active buffs.
export const BASE_SPEED = 110;

// Collision half-width in world px, well under half a tile so the player can
// slip through 1-tile gaps between nodes/buildings without feeling stuck.
export const PLAYER_RADIUS = 10;

// Judgment call: the contract defines TOOL_TIERS (1 flint / 2 copper / 3
// iron / 4 gold) in items.js and says hoe/wateringCan have no upgrade path,
// but doesn't say what tier a brand-new player starts with. Starting every
// tool at tier 1 (flint) is the natural "nothing upgraded yet" default and
// matches the quest chain, which gates the first forge/copper upgrade behind
// early progression rather than assuming better starting gear.
const STARTING_TOOLS = {
  axe: 1, pickaxe: 1, hoe: 1, wateringCan: 1,
};

const STAMINA_COSTS = {
  mining: 5, chopping: 3, tilling: 4, watering: 1, planting: 2, harvesting: 2, building: 5,
};

// Discrete "uses" a full watering can holds before it needs a refill - not a
// time-based burn like the torch, since a river/stream/pond/well visit tops
// it straight back up to full rather than trickling in, so a flat use-count
// reads simplest for a player to track ("I've got N waterings left").
const MAX_WATER_CARRIED = 12;

export function createPlayer(x = 0, y = 0) {
  return {
    x,
    y,
    facing: 'down',
    stamina: 100,
    maxStamina: 100,
    waterCarried: MAX_WATER_CARRIED,
    maxWaterCarried: MAX_WATER_CARRIED,
    tools: { ...STARTING_TOOLS },
    buffs: [], // [{stat, amount, expiresAt}], expiresAt in seconds on the same
    // clock as the `now` passed into updateBuffs/addBuff (main.js's running
    // game-time accumulator, NOT Date.now() - keeps this pausable/testable).
  };
}

export function getStaminaCost(action) {
  return STAMINA_COSTS[action] ?? 0;
}

// Sums the amount of every active buff matching `stat` (e.g. 'speed',
// 'stamina_regen', 'mining_power'). Multiple stacked buffs of the same stat
// simply add - kept simple per the contract's "nice-to-have polish" framing
// of buffs, no diminishing returns.
export function getBuffTotal(player, stat) {
  let total = 0;
  for (const buff of player.buffs) {
    if (buff.stat === stat) total += buff.amount;
  }
  return total;
}

export function addBuff(player, stat, amount, durationSec, now) {
  player.buffs.push({ stat, amount, expiresAt: now + durationSec });
}

// Drops expired buffs. `now` must be on the same clock addBuff's `now` was.
export function updateBuffs(player, now) {
  player.buffs = player.buffs.filter((b) => b.expiresAt > now);
}

// Soft-blocked spend per the contract: returns false (does nothing) rather
// than throwing/going negative when stamina is insufficient, so callers
// (actions.js, once it exists) can show a UI message instead of crashing.
export function trySpend(player, cost) {
  if (player.stamina < cost) return false;
  player.stamina -= cost;
  return true;
}

// Restores stamina in a burst (food), clamped to maxStamina. Free function,
// matching every other player.js mutator - actions.js's eatFood calls this
// rather than a `player.restoreStamina(...)` instance method.
export function restoreStamina(player, amount) {
  player.stamina = Math.min(player.maxStamina, player.stamina + amount);
}

// Soft-blocked spend, mirroring trySpend's stamina contract exactly - returns
// false (does nothing) rather than going negative when the can is already
// too low, so actions.js's waterAction can show a "your can is empty" message
// instead of watering for free forever.
export function trySpendWater(player, amount = 1) {
  if (player.waterCarried < amount) return false;
  player.waterCarried -= amount;
  return true;
}

// A river/stream/pond/well visit always tops the can straight back up to
// full in one go, unlike stamina's gradual regen - simplest for a click to
// read as "you just refilled it," and there's no reason to make topping up
// a bucket a slow process.
export function refillWater(player) {
  player.waterCarried = player.maxWaterCarried;
}

// Sets a player.tools slot directly to a tier - used by actions.js's
// tool-upgrade recipes (pickaxe_copper/iron, axe_copper/iron), whose
// RECIPES.output.item is the tools slot name ('pickaxe'|'axe') and
// output.qty is the tier to set it to, per items.js's RECIPES doc comment.
export function setToolTier(player, tool, tier) {
  if (!(tool in player.tools)) return;
  player.tools[tool] = tier;
}

export function regenTick(player, dt, baseRatePerSec = 1) {
  const bonus = getBuffTotal(player, 'stamina_regen');
  player.stamina = Math.min(player.maxStamina, player.stamina + (baseRatePerSec + bonus) * dt);
}

function canOccupy(px, py, isTileFree) {
  const r = PLAYER_RADIUS;
  const corners = [
    [px - r, py - r], [px + r, py - r],
    [px - r, py + r], [px + r, py + r],
  ];
  return corners.every(([cx, cy]) => isTileFree(Math.floor(cx / TILE_SIZE), Math.floor(cy / TILE_SIZE)));
}

// dirX/dirY: a direction vector, ideally already normalized (input.js's
// getMoveVector does this), each in roughly [-1, 1]. Resolves collision per
// axis independently (move X, clamp on collision, then move Y) so sliding
// along a wall works instead of a diagonal move sticking dead on contact.
// isTileFree(gx, gy): caller-supplied predicate (world.js's real one, or a
// stub) - keeps this module decoupled from world.js per the contract.
export function movePlayer(player, dirX, dirY, dt, isTileFree) {
  if (dirX === 0 && dirY === 0) return;

  const speedMul = 1 + getBuffTotal(player, 'speed');
  const dist = BASE_SPEED * speedMul * dt;
  const moveX = dirX * dist;
  const moveY = dirY * dist;

  if (moveX !== 0) {
    const nx = player.x + moveX;
    if (canOccupy(nx, player.y, isTileFree)) player.x = nx;
  }
  if (moveY !== 0) {
    const ny = player.y + moveY;
    if (canOccupy(player.x, ny, isTileFree)) player.y = ny;
  }

  // Facing is the last non-zero movement direction, dominant axis wins on a
  // diagonal input so it always resolves to exactly one of up/down/left/right.
  if (Math.abs(dirX) > Math.abs(dirY)) {
    player.facing = dirX > 0 ? 'right' : 'left';
  } else if (dirY !== 0) {
    player.facing = dirY > 0 ? 'down' : 'up';
  }
}
