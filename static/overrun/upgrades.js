// Upgrade pool offered on level-up, plus the logic to recompute a player's
// derived combat stats from their current upgrade levels.

const DEFAULT_MAX_LEVEL = 5;
const MULTISHOT_MAX_LEVEL = 4; // base 1 shot + up to 4 => caps at 5 total

export const UPGRADE_DEFS = [
  {
    id: 'damage',
    name: 'Damage Up',
    description: 'Increases auto-attack projectile damage.',
    maxLevel: DEFAULT_MAX_LEVEL,
  },
  {
    id: 'atkspeed',
    name: 'Attack Speed Up',
    description: 'Reduces auto-attack cooldown.',
    maxLevel: DEFAULT_MAX_LEVEL,
  },
  {
    id: 'projspeed',
    name: 'Projectile Speed Up',
    description: 'Your shots travel faster.',
    maxLevel: DEFAULT_MAX_LEVEL,
  },
  {
    id: 'multishot',
    name: 'Multishot',
    description: 'Fires an additional projectile at another nearby enemy.',
    maxLevel: MULTISHOT_MAX_LEVEL,
  },
  {
    id: 'pierce',
    name: 'Piercing',
    description: 'Projectiles pierce through one more enemy before vanishing.',
    maxLevel: DEFAULT_MAX_LEVEL,
  },
  {
    id: 'maxhp',
    name: 'Max HP Up',
    description: 'Increases max HP, and heals you for the same amount now.',
    maxLevel: DEFAULT_MAX_LEVEL,
  },
  {
    id: 'movespeed',
    name: 'Move Speed Up',
    description: 'Increases movement speed.',
    maxLevel: DEFAULT_MAX_LEVEL,
  },
  {
    id: 'pickup',
    name: 'Pickup Radius Up',
    description: 'Increases the range at which XP gems drift toward you.',
    maxLevel: DEFAULT_MAX_LEVEL,
  },
  {
    id: 'blade',
    name: 'Orbiting Blade',
    description: 'Adds/upgrades a blade that orbits you, damaging enemies it touches.',
    maxLevel: DEFAULT_MAX_LEVEL,
  },
  {
    id: 'regen',
    name: 'Regeneration',
    description: 'Slowly regenerate HP over time.',
    maxLevel: DEFAULT_MAX_LEVEL,
  },
];

const HEAL_CARD = {
  id: 'heal',
  name: 'Vitality Boost',
  description: 'Immediately restore some HP.',
  maxLevel: Infinity,
};

// Value shown per-level for the "current -> next" line on the card, and used
// by recomputeStats below. Kept table-driven so the numbers are easy to tune.
function damageAt(level) {
  return 10 + level * 4;
}
function cooldownAt(level) {
  return 0.9 * Math.pow(0.87, level);
}
function projSpeedAt(level) {
  return 460 + level * 70;
}
function multishotAt(level) {
  return 1 + level;
}
function pierceAt(level) {
  return level;
}
function maxHpAt(level) {
  return 100 + level * 22;
}
function moveSpeedAt(level) {
  return 220 * Math.pow(1.08, level);
}
function pickupAt(level) {
  return 60 + level * 28;
}
function regenAt(level) {
  return level * 0.6;
}
function bladeCountAt(level) {
  return Math.min(level, 4);
}
function bladeDamageAt(level) {
  return 6 + level * 5;
}
function bladeRotSpeedAt(level) {
  return 1.2 + level * 0.25;
}

// Human-readable value string for the given upgrade at the given level, used
// to render "Lv N -> N+1" style cards.
export function upgradeValueLabel(id, level) {
  switch (id) {
    case 'damage': return `${damageAt(level)} dmg`;
    case 'atkspeed': return `${cooldownAt(level).toFixed(2)}s cooldown`;
    case 'projspeed': return `${projSpeedAt(level)} spd`;
    case 'multishot': return `${multishotAt(level)} shots`;
    case 'pierce': return `${pierceAt(level)} pierce`;
    case 'maxhp': return `${maxHpAt(level)} max HP`;
    case 'movespeed': return `${Math.round(moveSpeedAt(level))} spd`;
    case 'pickup': return `${pickupAt(level)} radius`;
    case 'blade': return `${bladeCountAt(level)} blade(s)`;
    case 'regen': return `${regenAt(level).toFixed(1)} hp/s`;
    default: return '';
  }
}

// Recompute all derived player stats from player.upgrades. Called whenever
// an upgrade is applied (not every frame).
export function recomputeStats(player) {
  const lv = player.upgrades;

  player.damage = damageAt(lv.damage);
  player.attackCooldown = cooldownAt(lv.atkspeed);
  player.projectileSpeed = projSpeedAt(lv.projspeed);
  player.multishotCount = multishotAt(lv.multishot);
  player.pierce = pierceAt(lv.pierce);
  player.moveSpeed = moveSpeedAt(lv.movespeed);
  player.pickupRadius = pickupAt(lv.pickup);
  player.regen = regenAt(lv.regen);

  const oldMaxHp = player.maxHp;
  const newMaxHp = maxHpAt(lv.maxhp);
  if (newMaxHp !== oldMaxHp) {
    player.maxHp = newMaxHp;
    player.hp = Math.min(player.maxHp, player.hp + (newMaxHp - oldMaxHp));
  }

  player.blades.count = bladeCountAt(lv.blade);
  player.blades.damage = bladeDamageAt(lv.blade);
  player.blades.rotationSpeed = bladeRotSpeedAt(lv.blade);
}

export function applyUpgrade(player, upgradeId) {
  if (upgradeId === 'heal') {
    player.heal(Math.round(player.maxHp * 0.3));
    return;
  }
  player.upgrades[upgradeId] = (player.upgrades[upgradeId] || 0) + 1;
  recomputeStats(player);
}

// Choose 3 upgrade cards for the level-up overlay: upgrades not yet at max
// level, randomly chosen; if fewer than 3 are eligible, fill the remaining
// slots with a generic heal card.
export function rollUpgrades(player) {
  const eligible = UPGRADE_DEFS.filter((def) => player.upgrades[def.id] < def.maxLevel);

  // Shuffle (Fisher-Yates) then take up to 3.
  const pool = eligible.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picks = pool.slice(0, 3);

  const cards = picks.map((def) => {
    const level = player.upgrades[def.id];
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      level,
      nextLevel: level + 1,
      maxLevel: def.maxLevel,
      currentLabel: level === 0 ? '-' : upgradeValueLabel(def.id, level),
      nextLabel: upgradeValueLabel(def.id, level + 1),
    };
  });

  while (cards.length < 3) {
    cards.push({
      id: 'heal',
      name: HEAL_CARD.name,
      description: HEAL_CARD.description,
      level: 0,
      nextLevel: 1,
      maxLevel: Infinity,
      currentLabel: '-',
      nextLabel: `+${Math.round(player.maxHp * 0.3)} HP`,
    });
  }

  return cards;
}
