// Enemy definitions, the time-based difficulty curve, spawning (including
// telegraphed boss spawns), and per-frame enemy behaviour/contact damage.
import { clamp, rand, weightedChoice, circlesOverlap, ARENA_SIZE } from './utils.js';
import { EnemyProjectile } from './weapons.js';

// --- Unlock times (seconds of survival) -----------------------------------
const RUNNER_UNLOCK = 20;
const BRUTE_UNLOCK = 45;
const SHOOTER_UNLOCK = 75;
const BOSS_INTERVAL = 60;
const BOSS_WARNING_LEAD = 1.6; // seconds of telegraph before a boss appears

// Mild escalation of base enemy hp/damage over the course of a run.
function timeScale(t) {
  return 1 + t / 240;
}

function baseStats(type) {
  switch (type) {
    case 'grunt':
      return { hp: 22, speed: 95, damage: 8, radius: 14, color: '#ff4d4d', xpValue: 5 };
    case 'runner':
      return { hp: 13, speed: 195, damage: 6, radius: 10, color: '#ff9a3d', xpValue: 6 };
    case 'brute':
      return { hp: 110, speed: 52, damage: 20, radius: 25, color: '#b23dff', xpValue: 16 };
    case 'shooter':
      return { hp: 26, speed: 78, damage: 9, radius: 13, color: '#ffe23d', xpValue: 11 };
    default:
      throw new Error(`Unknown enemy type: ${type}`);
  }
}

function createEnemy(type, x, y, t) {
  const scale = timeScale(t);
  const s = baseStats(type);
  const enemy = {
    type,
    x,
    y,
    hp: s.hp * scale,
    maxHp: s.hp * scale,
    speed: s.speed,
    damage: s.damage * scale,
    radius: s.radius,
    color: s.color,
    xpValue: s.xpValue,
    dead: false,
    bladeCooldown: 0,
    isBoss: false,
  };
  if (type === 'shooter') {
    enemy.preferredRange = 260;
    enemy.projectileSpeed = 190;
    enemy.fireInterval = 2.3;
    enemy.fireTimer = rand(0.6, enemy.fireInterval);
    enemy.strafeDir = Math.random() < 0.5 ? 1 : -1;
  }
  return enemy;
}

function createBoss(x, y, bossIndex) {
  const hpMult = Math.pow(1.35, bossIndex);
  const dmgMult = Math.pow(1.18, bossIndex);
  return {
    type: 'boss',
    x,
    y,
    hp: 420 * hpMult,
    maxHp: 420 * hpMult,
    speed: 64,
    damage: 26 * dmgMult,
    radius: 42,
    color: '#ff3df1',
    xpValue: 140 + bossIndex * 30,
    dead: false,
    bladeCooldown: 0,
    isBoss: true,
    pulsePhase: 0,
  };
}

function spawnWeights(t) {
  const weights = [{ item: 'grunt', weight: 10 }];
  if (t >= RUNNER_UNLOCK) weights.push({ item: 'runner', weight: 7 });
  if (t >= BRUTE_UNLOCK) weights.push({ item: 'brute', weight: 4 });
  if (t >= SHOOTER_UNLOCK) weights.push({ item: 'shooter', weight: 5 });
  return weights;
}

function spawnInterval(t) {
  return Math.max(0.22, 1.15 - t * 0.0032);
}

function spawnCountPerTick(t) {
  return Math.min(1 + Math.floor(t / 70), 4);
}

// Picks a point just outside the current camera viewport (in world space),
// clamped to stay inside the arena bounds.
function spawnPosition(state) {
  const cam = state.camera;
  const viewW = state.canvas.width;
  const viewH = state.canvas.height;
  const halfDiag = Math.hypot(viewW, viewH) / 2;
  const angle = rand(0, Math.PI * 2);
  let dstFromCenter = halfDiag + 140;

  const centerX = cam.x + viewW / 2;
  const centerY = cam.y + viewH / 2;
  let x = centerX + Math.cos(angle) * dstFromCenter;
  let y = centerY + Math.sin(angle) * dstFromCenter;
  x = clamp(x, 20, ARENA_SIZE - 20);
  y = clamp(y, 20, ARENA_SIZE - 20);

  // Near arena edges the clamp above can pull the point back inside the
  // camera view; nudge it further out along the same ray a few times. If the
  // arena is small relative to the viewport this may not fully escape the
  // view - acceptable, rare edge case.
  let guard = 0;
  while (
    x > cam.x - 40 && x < cam.x + viewW + 40 &&
    y > cam.y - 40 && y < cam.y + viewH + 40 &&
    guard < 8
  ) {
    dstFromCenter += 90;
    x = clamp(centerX + Math.cos(angle) * dstFromCenter, 20, ARENA_SIZE - 20);
    y = clamp(centerY + Math.sin(angle) * dstFromCenter, 20, ARENA_SIZE - 20);
    guard += 1;
  }
  return [x, y];
}

export function updateSpawning(state, dt) {
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    const t = state.survivalTime;
    state.spawnTimer = spawnInterval(t);
    const count = spawnCountPerTick(t);
    const weights = spawnWeights(t);
    for (let i = 0; i < count; i++) {
      const type = weightedChoice(weights);
      const [x, y] = spawnPosition(state);
      state.enemies.push(createEnemy(type, x, y, t));
    }
  }

  updateBossSpawn(state, dt);
}

function updateBossSpawn(state, dt) {
  const t = state.survivalTime;
  if (!state.bossWarningActive && t >= state.nextBossTime - BOSS_WARNING_LEAD) {
    state.bossWarningActive = true;
    state.bossWarnTimer = BOSS_WARNING_LEAD;
  }
  if (state.bossWarningActive) {
    state.bossWarnTimer -= dt;
  }
  if (t >= state.nextBossTime) {
    const [x, y] = spawnPosition(state);
    state.enemies.push(createBoss(x, y, state.bossIndex));
    state.bossIndex += 1;
    state.nextBossTime += BOSS_INTERVAL;
    state.bossWarningActive = false;
  }
}

export function updateEnemies(state, dt) {
  const player = state.player;

  for (const enemy of state.enemies) {
    if (enemy.dead) continue;

    if (enemy.type === 'shooter') {
      updateShooter(state, enemy, dt);
    } else if (enemy.isBoss) {
      enemy.pulsePhase += dt * 3.2;
      moveToward(enemy, player, dt);
    } else {
      moveToward(enemy, player, dt);
    }

    enemy.x = clamp(enemy.x, enemy.radius, ARENA_SIZE - enemy.radius);
    enemy.y = clamp(enemy.y, enemy.radius, ARENA_SIZE - enemy.radius);

    if (circlesOverlap(enemy.x, enemy.y, enemy.radius, player.x, player.y, player.radius)) {
      const hit = player.takeDamage(enemy.damage);
      if (hit) {
        state.particles.addDamageNumber(player.x, player.y - 20, enemy.damage, '#ff5555');
        state.particles.triggerShake(enemy.isBoss ? 12 : 5, enemy.isBoss ? 0.3 : 0.15);
      }
    }
  }

  state.enemies = state.enemies.filter((e) => !e.dead);
}

function moveToward(enemy, player, dt) {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const d = Math.hypot(dx, dy) || 1;
  enemy.x += (dx / d) * enemy.speed * dt;
  enemy.y += (dy / d) * enemy.speed * dt;
}

function updateShooter(state, enemy, dt) {
  const player = state.player;
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const d = Math.hypot(dx, dy) || 1;
  const dirX = dx / d;
  const dirY = dy / d;

  if (d > enemy.preferredRange + 30) {
    enemy.x += dirX * enemy.speed * dt;
    enemy.y += dirY * enemy.speed * dt;
  } else if (d < enemy.preferredRange - 30) {
    enemy.x -= dirX * enemy.speed * dt;
    enemy.y -= dirY * enemy.speed * dt;
  } else {
    // Hold range and strafe sideways for a more dynamic silhouette.
    enemy.x += -dirY * enemy.strafeDir * enemy.speed * 0.5 * dt;
    enemy.y += dirX * enemy.strafeDir * enemy.speed * 0.5 * dt;
  }

  enemy.fireTimer -= dt;
  if (enemy.fireTimer <= 0) {
    enemy.fireTimer = enemy.fireInterval;
    const angle = Math.atan2(dy, dx);
    state.enemyProjectiles.push(
      new EnemyProjectile(enemy.x, enemy.y, angle, enemy.projectileSpeed, enemy.damage)
    );
  }
}

export function drawEnemies(ctx, cam, enemies) {
  for (const e of enemies) {
    const sx = e.x - cam.x;
    const sy = e.y - cam.y;

    if (e.isBoss) {
      const pulse = 1 + Math.sin(e.pulsePhase) * 0.08;
      ctx.strokeStyle = 'rgba(255, 61, 241, 0.5)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(sx, sy, e.radius * pulse + 14, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = e.color;
      ctx.shadowColor = e.color;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(sx, sy, e.radius * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (e.type === 'brute') {
      ctx.fillStyle = e.color;
      drawPolygon(ctx, sx, sy, e.radius, 5);
    } else if (e.type === 'shooter') {
      ctx.fillStyle = e.color;
      drawPolygon(ctx, sx, sy, e.radius, 4);
    } else if (e.type === 'runner') {
      ctx.fillStyle = e.color;
      drawPolygon(ctx, sx, sy, e.radius, 3);
    } else {
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(sx, sy, e.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Small HP bar above anything that has taken damage.
    if (e.hp < e.maxHp) {
      const w = e.radius * 2;
      const pct = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(sx - w / 2, sy - e.radius - 10, w, 4);
      ctx.fillStyle = pct > 0.3 ? '#5cff5c' : '#ff5c5c';
      ctx.fillRect(sx - w / 2, sy - e.radius - 10, w * pct, 4);
    }
  }
}

function drawPolygon(ctx, cx, cy, radius, sides) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * radius;
    const py = cy + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

export function drawBossWarning(ctx, state, canvasW, canvasH) {
  if (!state.bossWarningActive) return;
  const flashOn = Math.floor(state.bossWarnTimer * 6) % 2 === 0;
  if (!flashOn) return;
  ctx.save();
  ctx.strokeStyle = '#ff3df1';
  ctx.lineWidth = 10;
  ctx.globalAlpha = 0.8;
  ctx.strokeRect(5, 5, canvasW - 10, canvasH - 10);
  ctx.globalAlpha = 1;
  ctx.font = 'bold 22px monospace';
  ctx.fillStyle = '#ff3df1';
  ctx.textAlign = 'center';
  ctx.fillText('BOSS INCOMING', canvasW / 2, 60);
  ctx.restore();
}
