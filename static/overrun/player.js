// The player character: position/movement, stats driven by upgrades, and
// HP/i-frame handling. Drawing is a small triangle pointing in the facing
// direction, flashing while invulnerable.
import { clamp, normalize, ARENA_SIZE } from './utils.js';

const BASE_SPEED = 220; // world units / second
const BASE_MAX_HP = 100;
const BASE_DAMAGE = 10;
const BASE_ATTACK_COOLDOWN = 0.9; // seconds between auto-attacks
const BASE_PROJECTILE_SPEED = 460;
const BASE_ATTACK_RANGE = 480;
const BASE_PICKUP_RADIUS = 60;
const IFRAME_DURATION = 0.8; // seconds of invulnerability after being hit

export const PLAYER_RADIUS = 14;

export class Player {
  constructor() {
    this.x = ARENA_SIZE / 2;
    this.y = ARENA_SIZE / 2;
    this.facing = -Math.PI / 2; // pointing "up" initially
    this.radius = PLAYER_RADIUS;

    // Base (unmodified) stats.
    this.baseSpeed = BASE_SPEED;
    this.baseDamage = BASE_DAMAGE;
    this.baseAttackCooldown = BASE_ATTACK_COOLDOWN;
    this.baseProjectileSpeed = BASE_PROJECTILE_SPEED;

    this.maxHp = BASE_MAX_HP;
    this.hp = BASE_MAX_HP;
    this.attackRange = BASE_ATTACK_RANGE;
    this.pickupRadius = BASE_PICKUP_RADIUS;
    this.regen = 0; // hp/sec
    this.regenAccum = 0;

    this.attackTimer = 0;
    this.invulnTimer = 0;

    this.xp = 0;
    this.level = 1;
    this.xpToNext = xpForLevel(1);

    // Upgrade levels, keyed by upgrade id. Read by upgrades.js.
    this.upgrades = {
      damage: 0,
      atkspeed: 0,
      projspeed: 0,
      multishot: 0,
      pierce: 0,
      maxhp: 0,
      movespeed: 0,
      pickup: 0,
      blade: 0,
      regen: 0,
    };

    // Derived combat stats recomputed whenever an upgrade changes.
    this.damage = this.baseDamage;
    this.attackCooldown = this.baseAttackCooldown;
    this.projectileSpeed = this.baseProjectileSpeed;
    this.multishotCount = 1;
    this.pierce = 0;
    this.moveSpeed = this.baseSpeed;

    // Orbiting blades (populated/updated by the "blade" upgrade).
    this.blades = {
      count: 0,
      radius: 70,
      damage: 0,
      rotationSpeed: 1.4, // radians/sec
      angle: 0,
      hitCooldown: 0.5,
    };
  }

  get isInvulnerable() {
    return this.invulnTimer > 0;
  }

  addXp(amount) {
    this.xp += amount;
    let leveledUp = false;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.xpToNext = xpForLevel(this.level);
      leveledUp = true;
    }
    return leveledUp;
  }

  takeDamage(amount) {
    if (this.isInvulnerable) return false;
    this.hp = clamp(this.hp - amount, 0, this.maxHp);
    this.invulnTimer = IFRAME_DURATION;
    return true;
  }

  heal(amount) {
    this.hp = clamp(this.hp + amount, 0, this.maxHp);
  }

  update(dt, keys) {
    // 8-directional movement, normalized so diagonals aren't faster.
    let mx = 0;
    let my = 0;
    if (keys.has('w') || keys.has('arrowup')) my -= 1;
    if (keys.has('s') || keys.has('arrowdown')) my += 1;
    if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
    if (keys.has('d') || keys.has('arrowright')) mx += 1;

    if (mx !== 0 || my !== 0) {
      const [nx, ny] = normalize(mx, my);
      this.x += nx * this.moveSpeed * dt;
      this.y += ny * this.moveSpeed * dt;
      this.facing = Math.atan2(ny, nx);
    }

    this.x = clamp(this.x, this.radius, ARENA_SIZE - this.radius);
    this.y = clamp(this.y, this.radius, ARENA_SIZE - this.radius);

    if (this.invulnTimer > 0) this.invulnTimer -= dt;
    if (this.attackTimer > 0) this.attackTimer -= dt;

    if (this.regen > 0 && this.hp < this.maxHp) {
      this.regenAccum += this.regen * dt;
      if (this.regenAccum >= 1) {
        const whole = Math.floor(this.regenAccum);
        this.heal(whole);
        this.regenAccum -= whole;
      }
    }

    this.blades.angle += this.blades.rotationSpeed * dt;
  }

  draw(ctx, cam) {
    const sx = this.x - cam.x;
    const sy = this.y - cam.y;

    // Flash while invulnerable so a hit is legible.
    const flashOff = this.isInvulnerable && Math.floor(this.invulnTimer * 16) % 2 === 0;
    if (flashOff) return;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.facing + Math.PI / 2);

    ctx.fillStyle = '#22e0ff';
    ctx.shadowColor = '#22e0ff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(0, -this.radius * 1.3);
    ctx.lineTo(this.radius, this.radius);
    ctx.lineTo(-this.radius, this.radius);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// XP required to go from `level` to `level + 1`.
export function xpForLevel(level) {
  return Math.round(18 + level * 12 + level * level * 1.6);
}
