// Visual "juice" for Driftworks: tile-crumble bursts, placement pops,
// quota-fulfilled flashes, and dock-delivery sparkles. Mirrors the small,
// self-contained style of static/overrun/particles.js - plain particles
// updated/drawn every frame, no external libraries.
//
// All positions in/out of this module are WORLD px (grid coord * TILE_SIZE),
// matching the {x, y, zoom} camera contract from the design doc. Screen
// projection is done here directly (same formula render.js uses) so this
// module stays decoupled from render.js.

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

class Ring {
  // A brief expanding/fading ring, used for placement pops and quota flashes.
  constructor(x, y, color, maxRadius, duration, lineWidth = 3) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.maxRadius = maxRadius;
    this.duration = duration;
    this.age = 0;
    this.lineWidth = lineWidth;
  }
}

class FloatingText {
  constructor(x, y, text, color) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.life = 1.0;
    this.maxLife = 1.0;
    this.vy = -26;
  }
}

export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.rings = [];
    this.texts = [];
  }

  // Generic outward burst of small dots, worldX/worldY in world px.
  burst(worldX, worldY, color, count = 10, speedRange = [30, 140], life = [0.3, 0.6]) {
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(speedRange[0], speedRange[1]);
      this.particles.push(new Particle(
        worldX, worldY,
        Math.cos(angle) * speed, Math.sin(angle) * speed,
        rand(life[0], life[1]), color, rand(2, 4.5),
      ));
    }
  }

  // A tile finished eroding into water - a small landslide of brown/red debris.
  crumble(worldX, worldY) {
    this.burst(worldX, worldY, '#8a6a4a', 16, [20, 110], [0.4, 0.9]);
    this.burst(worldX, worldY, '#c0524a', 8, [10, 70], [0.3, 0.7]);
    this.rings.push(new Ring(worldX, worldY, 'rgba(192, 82, 74, 0.6)', 34, 0.4, 2));
  }

  // A building was just placed - a satisfying little pop.
  placementPop(worldX, worldY, color = '#8fe3a0') {
    this.burst(worldX, worldY, color, 8, [40, 100], [0.2, 0.4]);
    this.rings.push(new Ring(worldX, worldY, color, 30, 0.28, 3));
  }

  // Placement was rejected - a short red pulse, no debris.
  placementRejected(worldX, worldY) {
    this.rings.push(new Ring(worldX, worldY, 'rgba(255, 80, 80, 0.85)', 26, 0.25, 4));
  }

  // A quota was fulfilled at the Dock - a bright gold flash + reward text.
  quotaFulfilled(worldX, worldY, rewardTechPoints = 0) {
    this.burst(worldX, worldY, '#ffd35a', 24, [60, 220], [0.35, 0.8]);
    this.rings.push(new Ring(worldX, worldY, '#ffd35a', 60, 0.5, 4));
    this.rings.push(new Ring(worldX, worldY, 'rgba(255, 211, 90, 0.5)', 90, 0.65, 2));
    if (rewardTechPoints > 0) {
      this.texts.push(new FloatingText(worldX, worldY - 20, `+${rewardTechPoints} tech`, '#ffe89a'));
    }
  }

  // A quota deadline was missed - a dull red pulse + strike text.
  quotaMissed(worldX, worldY) {
    this.rings.push(new Ring(worldX, worldY, 'rgba(255, 90, 90, 0.7)', 50, 0.5, 4));
    this.texts.push(new FloatingText(worldX, worldY - 20, 'missed!', '#ff8a8a'));
  }

  // The "Getting Started" checklist (Extractor -> Processor -> Silo) was
  // completed - a small one-off flourish, calmer than quotaFulfilled since
  // this is an onboarding milestone rather than a scored event.
  gettingStartedComplete(worldX, worldY) {
    this.burst(worldX, worldY, '#8fe3a0', 14, [30, 100], [0.3, 0.6]);
    this.rings.push(new Ring(worldX, worldY, '#8fe3a0', 40, 0.45, 3));
    this.texts.push(new FloatingText(worldX, worldY - 20, 'Metal chain online!', '#c8f5d0'));
  }

  // An item reached the Dock - a tiny bright sparkle, cheap enough to spam.
  deliverySparkle(worldX, worldY, color = '#8fe3ff') {
    this.burst(worldX, worldY, color, 4, [15, 45], [0.2, 0.4]);
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
      p.vx *= 0.9;
      p.vy *= 0.9;
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      if (r.age >= r.duration) this.rings.splice(i, 1);
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.texts.splice(i, 1);
        continue;
      }
      t.y += t.vy * dt;
      t.vy *= 0.92;
    }
  }

  get isEmpty() {
    return this.particles.length === 0 && this.rings.length === 0 && this.texts.length === 0;
  }

  // camera: {x, y, zoom} world-px camera, same convention as render.js.
  draw(ctx, camera) {
    const toScreen = (wx, wy) => [(wx - camera.x) * camera.zoom, (wy - camera.y) * camera.zoom];

    for (const p of this.particles) {
      const [sx, sy] = toScreen(p.x, p.y);
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(sx, sy, p.size * camera.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const r of this.rings) {
      const [sx, sy] = toScreen(r.x, r.y);
      const t = r.age / r.duration;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.lineWidth;
      ctx.beginPath();
      ctx.arc(sx, sy, r.maxRadius * t * camera.zoom, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.font = 'bold 13px monospace';
    for (const t of this.texts) {
      const [sx, sy] = toScreen(t.x, t.y);
      const alpha = Math.max(0, t.life / t.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, sx, sy);
    }
    ctx.globalAlpha = 1;
  }
}
