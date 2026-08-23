// Visual "juice": death particle bursts, floating damage numbers, screen shake.
import { rand } from './utils.js';

class Particle {
  constructor(x, y, vx, vy, life, color, size) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.color = color;
    this.size = size;
  }
}

class DamageNumber {
  constructor(x, y, text, color) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.life = 0.8;
    this.maxLife = 0.8;
    this.vy = -40;
  }
}

export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.damageNumbers = [];
    this.shakeTime = 0;
    this.shakeMag = 0;
    this.shakeDuration = 1;
  }

  burst(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(40, 220);
      this.particles.push(new Particle(
        x, y,
        Math.cos(angle) * speed, Math.sin(angle) * speed,
        rand(0.25, 0.55), color, rand(2, 4)
      ));
    }
  }

  addDamageNumber(x, y, value, color = '#ffffff') {
    this.damageNumbers.push(new DamageNumber(x, y, Math.round(value).toString(), color));
  }

  triggerShake(mag, duration) {
    if (mag >= this.shakeMag) {
      this.shakeMag = mag;
      this.shakeDuration = duration;
      this.shakeTime = duration;
    }
  }

  update(dt) {
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      if (this.shakeTime <= 0) this.shakeMag = 0;
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }

    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const d = this.damageNumbers[i];
      d.life -= dt;
      if (d.life <= 0) {
        this.damageNumbers.splice(i, 1);
        continue;
      }
      d.y += d.vy * dt;
      d.vy *= 0.9;
    }
  }

  // Current shake offset for this frame; call once per draw.
  shakeOffset() {
    if (this.shakeTime <= 0) return [0, 0];
    const mag = this.shakeMag * (this.shakeTime / this.shakeDuration);
    return [rand(-mag, mag), rand(-mag, mag)];
  }

  get isShaking() {
    return this.shakeTime > 0;
  }

  draw(ctx, cam) {
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x - cam.x, p.y - cam.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.font = 'bold 16px monospace';
    for (const d of this.damageNumbers) {
      const alpha = Math.max(0, d.life / d.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = d.color;
      ctx.fillText(d.text, d.x - cam.x, d.y - cam.y);
    }
    ctx.globalAlpha = 1;
  }
}
