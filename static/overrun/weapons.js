// Player + enemy projectiles, the orbiting blade passive, XP gem pickups,
// and the auto-attack targeting logic that ties them to the player.
import { dist2, normalizeDir, circlesOverlap, ARENA_SIZE } from './utils.js';

const XP_GEM_RADIUS = 5;
const XP_GEM_MAGNET_SPEED = 340;
const PROJECTILE_MAX_TRAVEL = 900; // world units before a shot despawns

export class Projectile {
  constructor(x, y, angle, speed, damage, pierce) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.damage = damage;
    this.pierceRemaining = pierce;
    this.radius = 5;
    this.traveled = 0;
    this.hitEnemies = new Set();
    this.dead = false;
  }
}

export class EnemyProjectile {
  constructor(x, y, angle, speed, damage) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.damage = damage;
    this.radius = 6;
    this.life = 4;
    this.dead = false;
  }
}

export class XpGem {
  constructor(x, y, value) {
    this.x = x;
    this.y = y;
    this.value = value;
    this.radius = XP_GEM_RADIUS;
    this.dead = false;
  }
}

// Finds up to `count` distinct living enemies nearest to (x, y) within range.
function findNearestTargets(enemies, x, y, range, count) {
  const inRange = enemies
    .filter((e) => !e.dead && dist2(e.x, e.y, x, y) <= range * range)
    .map((e) => ({ e, d2: dist2(e.x, e.y, x, y) }))
    .sort((a, b) => a.d2 - b.d2);
  return inRange.slice(0, count).map((entry) => entry.e);
}

// Fires the player's auto-attack if its cooldown is ready and at least one
// enemy is in range. Pushes new Projectiles into state.playerProjectiles.
export function tryAutoAttack(state) {
  const player = state.player;
  if (player.attackTimer > 0) return;

  const targets = findNearestTargets(
    state.enemies, player.x, player.y, player.attackRange, player.multishotCount
  );
  if (targets.length === 0) return;

  player.attackTimer = player.attackCooldown;

  // If we have fewer distinct targets than shots, re-fire at the nearest
  // target(s) with a small angular spread so every shot still does something.
  const shotCount = player.multishotCount;
  for (let i = 0; i < shotCount; i++) {
    const target = targets[i % targets.length];
    let angle = Math.atan2(target.y - player.y, target.x - player.x);
    if (i >= targets.length) {
      // Extra spread shots aimed near the same target.
      angle += (((i % targets.length) + 1) * 0.18) * (i % 2 === 0 ? 1 : -1);
    }
    state.playerProjectiles.push(
      new Projectile(player.x, player.y, angle, player.projectileSpeed, player.damage, player.pierce)
    );
  }
}

export function updatePlayerProjectiles(state, dt) {
  const { playerProjectiles, enemies } = state;

  for (const p of playerProjectiles) {
    const stepX = p.vx * dt;
    const stepY = p.vy * dt;
    p.x += stepX;
    p.y += stepY;
    p.traveled += Math.hypot(stepX, stepY);
    if (p.traveled > PROJECTILE_MAX_TRAVEL) p.dead = true;
    if (p.x < 0 || p.x > ARENA_SIZE || p.y < 0 || p.y > ARENA_SIZE) p.dead = true;
    if (p.dead) continue;

    for (const enemy of enemies) {
      if (enemy.dead || p.hitEnemies.has(enemy)) continue;
      if (!circlesOverlap(p.x, p.y, p.radius, enemy.x, enemy.y, enemy.radius)) continue;

      damageEnemy(state, enemy, p.damage, '#e8ffff');
      p.hitEnemies.add(enemy);
      if (p.pierceRemaining <= 0) {
        p.dead = true;
        break;
      }
      p.pierceRemaining -= 1;
    }
  }

  state.playerProjectiles = playerProjectiles.filter((p) => !p.dead);
}

export function updateEnemyProjectiles(state, dt) {
  const { enemyProjectiles, player } = state;

  for (const p of enemyProjectiles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) p.dead = true;
    if (p.x < 0 || p.x > ARENA_SIZE || p.y < 0 || p.y > ARENA_SIZE) p.dead = true;
    if (p.dead) continue;

    if (circlesOverlap(p.x, p.y, p.radius, player.x, player.y, player.radius)) {
      const hit = player.takeDamage(p.damage);
      if (hit) {
        state.particles.addDamageNumber(player.x, player.y - 20, p.damage, '#ff5555');
        state.particles.triggerShake(6, 0.18);
      }
      p.dead = true;
    }
  }

  state.enemyProjectiles = enemyProjectiles.filter((p) => !p.dead);
}

// Orbiting blade passive: positions are derived from player.blades each
// frame (angle is advanced in Player#update); each blade damages any enemy
// it touches, subject to a short per-enemy hit cooldown.
export function bladePositions(player) {
  const { count, radius, angle } = player.blades;
  const positions = [];
  for (let i = 0; i < count; i++) {
    const a = angle + (i / count) * Math.PI * 2;
    positions.push([player.x + Math.cos(a) * radius, player.y + Math.sin(a) * radius]);
  }
  return positions;
}

export function updateBlades(state, dt) {
  const player = state.player;
  if (player.blades.count === 0) return;

  for (const enemy of state.enemies) {
    if (enemy.bladeCooldown > 0) enemy.bladeCooldown -= dt;
  }

  const positions = bladePositions(player);
  const bladeHitRadius = 8;
  for (const [bx, by] of positions) {
    for (const enemy of state.enemies) {
      if (enemy.dead || enemy.bladeCooldown > 0) continue;
      if (!circlesOverlap(bx, by, bladeHitRadius, enemy.x, enemy.y, enemy.radius)) continue;
      damageEnemy(state, enemy, player.blades.damage, '#ffffff');
      enemy.bladeCooldown = player.blades.hitCooldown;
    }
  }
}

// Applies damage to an enemy, spawning a floating number, and handles death
// (particle burst, XP gem drop, kill count, boss screen-shake).
export function damageEnemy(state, enemy, amount, numberColor) {
  enemy.hp -= amount;
  state.particles.addDamageNumber(enemy.x, enemy.y - enemy.radius, amount, numberColor);
  if (enemy.hp <= 0 && !enemy.dead) {
    enemy.dead = true;
    state.kills += 1;
    state.particles.burst(enemy.x, enemy.y, enemy.color, enemy.isBoss ? 36 : 12);
    state.xpGems.push(new XpGem(enemy.x, enemy.y, enemy.xpValue));
    if (enemy.isBoss) state.particles.triggerShake(16, 0.4);
  }
}

export function updateXpGems(state, dt) {
  const player = state.player;
  const pickupR2 = player.pickupRadius * player.pickupRadius;

  for (const gem of state.xpGems) {
    const d2 = dist2(gem.x, gem.y, player.x, player.y);
    if (d2 <= pickupR2) {
      const [dx, dy] = normalizeDir(gem.x, gem.y, player.x, player.y);
      const d = Math.sqrt(d2);
      const step = Math.min(d, XP_GEM_MAGNET_SPEED * dt);
      gem.x += dx * step;
      gem.y += dy * step;
    }
    const collectR = (player.radius + gem.radius) * (player.radius + gem.radius);
    if (dist2(gem.x, gem.y, player.x, player.y) <= collectR) {
      gem.dead = true;
      const leveledUp = player.addXp(gem.value);
      if (leveledUp) state.pendingLevelUp = true;
    }
  }

  state.xpGems = state.xpGems.filter((g) => !g.dead);
}

export function drawProjectiles(ctx, cam, state) {
  ctx.shadowBlur = 8;
  ctx.shadowColor = '#8ff5ff';
  ctx.fillStyle = '#d8ffff';
  for (const p of state.playerProjectiles) {
    ctx.beginPath();
    ctx.arc(p.x - cam.x, p.y - cam.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.shadowColor = '#ff8a3d';
  ctx.fillStyle = '#ff8a3d';
  for (const p of state.enemyProjectiles) {
    ctx.beginPath();
    ctx.arc(p.x - cam.x, p.y - cam.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

export function drawBlades(ctx, cam, player) {
  if (player.blades.count === 0) return;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 10;
  for (const [bx, by] of bladePositions(player)) {
    ctx.beginPath();
    ctx.arc(bx - cam.x, by - cam.y, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

export function drawXpGems(ctx, cam, state) {
  ctx.fillStyle = '#39ff6a';
  for (const gem of state.xpGems) {
    const sx = gem.x - cam.x;
    const sy = gem.y - cam.y;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-gem.radius, -gem.radius, gem.radius * 2, gem.radius * 2);
    ctx.restore();
  }
}
