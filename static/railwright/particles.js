// Visual "juice" for Railwright: steam/smoke plumes, coin pops, spark/dust
// bursts and splashes. Per the design contract (section 1, section 12) these
// are the only "effects" the game has - kept small, cheap, and capped so they
// never become a performance problem with many trains running at once.
//
// All positions in/out of this module are WORLD px (tile coord * TILE),
// matching the {x, y, zoom} camera convention used by render.js.

const MAX_PARTICLES = 600;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

class Puff {
  // A soft growing/fading disc, used for steam and smoke.
  constructor(x, y, vx, vy, life, size, growth, colour) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.size = size;
    this.growth = growth;
    this.colour = colour;
  }
}

class Speck {
  // A small hard dot with gravity, used for sparks and dust.
  constructor(x, y, vx, vy, life, size, colour, gravity) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.size = size;
    this.colour = colour;
    this.gravity = gravity;
  }
}

class Droplet {
  // An outward-flying dot that fades, used for water splashes.
  constructor(x, y, vx, vy, life, size, colour) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.size = size;
    this.colour = colour;
  }
}

class CoinText {
  constructor(x, y, text) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.life = 1.1;
    this.maxLife = 1.1;
    this.vy = -22;
  }
}

export class ParticleSystem {
  constructor() {
    this.puffs = [];
    this.specks = [];
    this.droplets = [];
    this.texts = [];
  }

  _count() {
    return this.puffs.length + this.specks.length + this.droplets.length + this.texts.length;
  }

  // Room for `n` more particles under the hard cap; drops the oldest first
  // rather than refusing new effects outright (old steam matters less than
  // a fresh one).
  _makeRoom(n) {
    let over = this._count() + n - MAX_PARTICLES;
    while (over > 0) {
      if (this.puffs.length) this.puffs.shift();
      else if (this.specks.length) this.specks.shift();
      else if (this.droplets.length) this.droplets.shift();
      else if (this.texts.length) this.texts.shift();
      else break;
      over--;
    }
  }

  // A loco's steam plume - this is a train game and chuffing steam is most
  // of the charm, so it needs to actually read at a glance: a denser, more
  // opaque "chuff" core plus a couple of softer trailing puffs, all rising
  // and growing as they drift.
  steam(x, y) {
    this._makeRoom(3);
    this.puffs.push(new Puff(
      x + rand(-1, 1), y - rand(2, 4),
      rand(-3, 3), rand(-30, -20),
      rand(1.1, 1.7), rand(5, 7), rand(9, 13),
      `rgba(240, 236, 226, ${rand(0.55, 0.75)})`,
    ));
    for (let i = 0; i < 2; i++) {
      this.puffs.push(new Puff(
        x + rand(-3, 3), y + rand(-2, 2),
        rand(-6, 6), rand(-20, -10),
        rand(0.9, 1.6), rand(3, 5), rand(6, 10),
        `rgba(232, 228, 218, ${rand(0.35, 0.55)})`,
      ));
    }
  }

  // A diesel's exhaust smoke - darker, thinner, faster-fading than steam.
  smoke(x, y) {
    this._makeRoom(1);
    this.puffs.push(new Puff(
      x + rand(-2, 2), y + rand(-1, 1),
      rand(-3, 3), rand(-14, -8),
      rand(0.5, 0.9), rand(2.5, 4), rand(4, 7),
      `rgba(60, 58, 56, ${rand(0.3, 0.45)})`,
    ));
  }

  // A delivery/contract payout - floating "+$N" text with a small gold burst.
  coin(x, y, amount) {
    this._makeRoom(7);
    const n = Math.round(amount);
    const sign = n < 0 ? '-' : '+';
    this.texts.push(new CoinText(x, y, `${sign}$${Math.abs(n).toLocaleString('en-US')}`));
    for (let i = 0; i < 6; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(14, 46);
      this.specks.push(new Speck(
        x, y, Math.cos(angle) * speed, Math.sin(angle) * speed - 20,
        rand(0.3, 0.6), rand(1.5, 2.5), '#e0c060', 60,
      ));
    }
  }

  // A wheel/coupling spark - fast, bright, brief.
  sparks(x, y) {
    this._makeRoom(8);
    for (let i = 0; i < 8; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(40, 160);
      this.specks.push(new Speck(
        x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
        rand(0.15, 0.35), rand(1, 2), '#ffcf6b', 220,
      ));
    }
  }

  // Track-laying / demolition dust - a soft low-lying brown puff.
  dust(x, y) {
    this._makeRoom(5);
    for (let i = 0; i < 5; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(6, 30);
      this.specks.push(new Speck(
        x, y, Math.cos(angle) * speed, Math.sin(angle) * speed - 6,
        rand(0.4, 0.8), rand(2, 3.5), 'rgba(150, 128, 96, 0.5)', 30,
      ));
    }
  }

  // A bridge/pier splash - outward pale-blue droplets.
  splash(x, y) {
    this._makeRoom(9);
    for (let i = 0; i < 9; i++) {
      const angle = rand(-Math.PI, 0); // upward hemisphere
      const speed = rand(20, 90);
      this.droplets.push(new Droplet(
        x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
        rand(0.3, 0.6), rand(1.5, 3), 'rgba(220, 240, 250, 0.7)',
      ));
    }
  }

  update(dt) {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.puffs.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy *= 0.94;
      p.size += p.growth * dt;
    }

    for (let i = this.specks.length - 1; i >= 0; i--) {
      const s = this.specks[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.specks.splice(i, 1);
        continue;
      }
      s.vy += s.gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.92;
    }

    for (let i = this.droplets.length - 1; i >= 0; i--) {
      const d = this.droplets[i];
      d.life -= dt;
      if (d.life <= 0) {
        this.droplets.splice(i, 1);
        continue;
      }
      d.vy += 260 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.texts.splice(i, 1);
        continue;
      }
      t.y += t.vy * dt;
      t.vy *= 0.94;
    }
  }

  get isEmpty() {
    return this._count() === 0;
  }

  // camera: {x, y, zoom} - same world-px top-left convention as render.js.
  draw(ctx, camera) {
    if (this.isEmpty) return;
    const toScreen = (wx, wy) => [(wx - camera.x) * camera.zoom, (wy - camera.y) * camera.zoom];

    ctx.save();
    for (const p of this.puffs) {
      const [sx, sy] = toScreen(p.x, p.y);
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.colour;
      ctx.beginPath();
      ctx.arc(sx, sy, p.size * camera.zoom, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const s of this.specks) {
      const [sx, sy] = toScreen(s.x, s.y);
      const alpha = Math.max(0, s.life / s.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.colour;
      ctx.beginPath();
      ctx.arc(sx, sy, s.size * camera.zoom, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const d of this.droplets) {
      const [sx, sy] = toScreen(d.x, d.y);
      const alpha = Math.max(0, d.life / d.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = d.colour;
      ctx.beginPath();
      ctx.arc(sx, sy, d.size * camera.zoom, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.textAlign = 'center';
    ctx.font = 'bold 12px Georgia, serif';
    for (const t of this.texts) {
      const [sx, sy] = toScreen(t.x, t.y);
      const alpha = Math.max(0, t.life / t.maxLife);
      ctx.globalAlpha = alpha;
      const negative = t.text.startsWith('-');
      ctx.fillStyle = negative ? '#c0372c' : '#3f7d3f';
      ctx.fillText(t.text, sx, sy);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
