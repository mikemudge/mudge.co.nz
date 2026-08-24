// Lightweight particle "polish" layer for Wildergrove: hit sparks (mine/
// chop), a harvest pop, and light campfire smoke. Deliberately simple per
// the design contract ("nice-to-have, keep simple") - mirrors the small,
// self-contained style of static/driftworks/particles.js.
//
// All positions in/out of this module are WORLD px, matching the {x, y,
// zoom} camera contract from render.js. Screen projection is done here
// directly rather than importing render.js, so this stays a standalone
// layer main.js can draw last, on top of everything else.
import { PALETTE } from './render.js';

function rand(min, max) {
  return min + Math.random() * (max - min);
}

class Particle {
  constructor(x, y, vx, vy, life, color, size, gravity = 0) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.color = color;
    this.size = size;
    this.gravity = gravity;
  }
}

export class ParticleSystem {
  // eventBus: optional utils.js createEventBus() instance (per the contract,
  // main.js creates one and passes it into particles.js among others). When
  // given, this system reacts to gameplay events on its own so actions.js
  // doesn't need to know particles.js exists - it just emits events.
  constructor(eventBus = null) {
    this.particles = [];
    this.eventBus = eventBus;
    this._smokeTimer = 0; // see campfireTick
    if (eventBus) {
      // TODO(integration): payload x/y are grid tile coords per the
      // contract's event table; converted to a world-px tile center here
      // since that's this module's coordinate space.
      eventBus.on('resource_harvested', ({ x, y }) => {
        this.emit('harvest', x * 32 + 16, y * 32 + 16);
      });
    }
  }

  // type: 'hit' | 'harvest' | 'smoke'. x/y: world px.
  emit(type, x, y) {
    if (type === 'hit') this._hit(x, y);
    else if (type === 'harvest') this._harvest(x, y);
    else if (type === 'smoke') this._smoke(x, y);
  }

  _hit(x, y) {
    for (let i = 0; i < 8; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(40, 130);
      this.particles.push(new Particle(
        x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
        rand(0.15, 0.35), PALETTE.accent, rand(1.5, 3), 260,
      ));
    }
  }

  _harvest(x, y) {
    for (let i = 0; i < 10; i++) {
      const angle = rand(-Math.PI * 0.85, -Math.PI * 0.15); // mostly upward pop
      const speed = rand(30, 90);
      this.particles.push(new Particle(
        x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
        rand(0.3, 0.55), PALETTE.grassAlt, rand(2, 4), 220,
      ));
    }
  }

  _smoke(x, y) {
    // A single slow-rising, fading puff per call - main.js/actions.js should
    // call this periodically (e.g. once every second or so) from a campfire
    // position for a continuous plume rather than this module owning a
    // persistent per-building emitter.
    this.particles.push(new Particle(
      x + rand(-3, 3), y, rand(-6, 6), rand(-24, -14),
      rand(1.2, 1.8), 'rgba(220, 220, 220, 0.5)', rand(4, 8), -18,
    ));
  }

  // Continuous campfire smoke: called once per frame from main.js's update()
  // with the world-px position of every placed campfire's fire-body (not per
  // building instance state - a shared timer is plenty for "light, sparse"
  // smoke and avoids main.js/particles.js having to track one timer per
  // campfire). `positions`: array of [x, y] world px.
  campfireTick(dt, positions) {
    if (!positions || !positions.length) return;
    this._smokeTimer += dt;
    const interval = 0.45; // seconds between puffs per campfire - sparse, not a chimney
    if (this._smokeTimer < interval) return;
    this._smokeTimer -= interval;
    for (const [x, y] of positions) this._smoke(x, y);
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
    }
  }

  get isEmpty() {
    return this.particles.length === 0;
  }

  // camera: {x, y, zoom}, same convention as render.js's worldToScreen.
  draw(ctx, camera) {
    for (const p of this.particles) {
      const sx = (p.x - camera.x) * camera.zoom;
      const sy = (p.y - camera.y) * camera.zoom;
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(sx, sy, p.size * camera.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
