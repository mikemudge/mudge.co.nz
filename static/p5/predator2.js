class Creature {
  constructor(world, pos) {
    this.world = world;
    this.pos = pos;
    this.health = 100;
    this.colors = [
      color(255,0,0),
      color(0,0,255),
      color(0,255,0),
    ];
    this.color = Math.floor(random(this.colors.length));
    this.vel = createVector(0, 0);
    this.radius = 5;
    this.maxSpeed = 6;
    this.maxForce = 0.2;
  }

  beats(other) {
    if (this.color !== other.color) {
      if ((this.color + 1) % this.colors.length === other.color) {
        return true;
      }
    }
  }

  bounceBorder() {
    if (this.pos.x - this.radius < this.world.pos.x && this.vel.x < 0) {
      this.vel.x *= -1;
    }
    if (this.pos.x + this.radius > this.world.pos.x + this.world.size.x && this.vel.x > 0) {
      this.vel.x *= -1;
    }
    if (this.pos.y - this.radius < this.world.pos.y && this.vel.y < 0) {
      this.vel.y *= -1;
    }
    if (this.pos.y + this.radius > this.world.pos.y + this.world.size.y && this.vel.y > 0) {
      this.vel.y *= -1;
    }
  }

  wrapBorder() {
    let x = (this.pos.x - this.world.pos.x + this.world.size.x) % this.world.size.x + this.world.pos.x;
    let y = (this.pos.y - this.world.pos.y + this.world.size.y) % this.world.size.y + this.world.pos.y;

    this.pos.set(x, y);
  }

  update() {
    this.pos.add(this.vel);

    // crash?
    // this.bounceBorder();
    this.wrapBorder();

    let force = createVector(0, 0);
    for (let c of this.world.getCreatures()) {
      if (c === this) {
        // Skip interactions with yourself.
        continue;
      }
      let diff = p5.Vector.sub(c.pos, this.pos);
      let dis = diff.mag();

      if (dis < 2 * this.radius) {
        // In range, apply color changes.
        if (this.beats(c)) {
          c.color = this.color;
        } else if (this.beats(c)) {
          this.color = c.color;
        }
        // Also bounce away?
        this.vel.set(diff.x, diff.y);
        this.vel.setMag(-1);
      }

      if (dis > 200) {
        // ignore things far away.
        continue;
      }
      // scale inversely to distance.
      diff.setMag(100.0 / dis);
      if (c.beats(this)) {
        // avoid.
        force.sub(diff);
      } else if (this.beats(c)) {
        // chase
        force.add(diff)
      }
    }

    // random movement.
    force.add(p5.Vector.random2D().mult(this.maxForce));
    force.limit(this.maxSpeed);
    force.sub(this.vel);

    force.limit(this.maxForce);
    this.vel.add(force);

    // Slow down;
    this.vel.mult(0.98);

    if (this.vel.mag() < 0.01) {
      this.vel.set(0, 0);
    }

  }

  show() {
    fill(this.colors[this.color]);
    noStroke();
    arc(this.pos.x, this.pos.y, this.radius * 2, this.radius * 2, 0, 2 * Math.PI);
  }
}

class PredatorWorld {
  constructor(pos, size, maxCreatures) {
    this.pos = pos;
    this.size = size;
    this.creatures = [];

    for (var i = 0; i < maxCreatures; i++) {
      let loc = this.size.copy();
      loc.mult(random(), random())
      loc.add(this.pos);
      let creature = new Creature(this, loc);
      this.creatures.push(creature);
    }
  }

  update() {
    for (let unit of this.creatures) {
      unit.update();
      unit.show();
    }

    this.creatures = this.creatures.filter(function(c) {
      return c.health > 0;
    });
  }

  draw() {
    this.update();

    for (let unit of this.creatures) {
      unit.show();
    }

    // Draw Arena
    stroke(255);
    strokeWeight(1);
    noFill();
    rect(this.pos.x, this.pos.y, this.size.x, this.size.y);
  }

  getCreatures() {
    return this.creatures;
  }
}

let world
export function setup() {
  createCanvas(windowWidth, windowHeight);
  let maxCreatures = 1000;
  world = new PredatorWorld(
      createVector(windowWidth / 20,  windowHeight / 20),
      createVector(windowWidth * 18 / 20, windowHeight * 18 / 20),
      maxCreatures
  );

}

export function draw() {
  background(0);

  world.draw();
}
