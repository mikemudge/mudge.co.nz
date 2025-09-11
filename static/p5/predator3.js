class Creature {
  constructor(world, pos) {
    this.world = world;
    this.pos = pos;
    this.health = 100;
    this.age = 0;
    this.type = 'prey';
    this.vel = createVector(0, 0);
    this.radius = 5;
    this.maxSpeed = 3 + random();
    this.maxForce = 0.2;
    this.hunger = 300;
  }

  beats(other) {
    return other.type === 'prey' && this.type === 'predator';
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
    this.age++;
    if (this.type === 'predator') {
      // predators get hungry and need to eat.
      this.hunger--;
    }

    if (this.age > 500 && this.age < 700) {
      // Adulthood can lead to reproduction with small chance per frame
      if (Math.random() < 0.02) {
        let creature = new Creature(this.world, p5.Vector.random2D().mult(this.radius * 2).add(this.pos));
        creature.type = this.type;
        this.world.add(creature);
      }
    }

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
        if (this.beats(c) && c.health > 0) {
          // Eat c and increase hunger.
          c.health = 0;
          // Max hunger;
          this.hunger = Math.min(500, this.hunger + 70);
        }
      }

      if (dis > 400) {
        // ignore things far away.
        continue;
      }
      // scale inversely to distance.
      diff.setMag(10.0 / dis);
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
    force.limit(this.maxForce);

    this.vel.add(force);
    // Slow down;
    this.vel.mult(0.98);
    this.vel.limit(this.maxSpeed)


    if (this.vel.mag() < 0.01) {
      this.vel.set(0, 0);
    }

  }

  finished() {
    if (this.hunger <= 0) {
      return true;
    }
    if (this.age > 900) {
      // After 900 frames, there is a 1% chance of dying each frame.
      if (Math.random() < 0.01) {
        return true;
      }
    }
    return this.health <= 0;
  }

  show() {
    let color = '#00FF00';
    if (this.type !== 'prey') {
      color = '#FF0000';
    }
    fill(color);
    noStroke();
    circle(this.pos.x, this.pos.y, this.radius * 2);
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
      if (random() < 0.05) {
        creature.type = 'predator';
      }
      this.creatures.push(creature);
    }
  }

  update() {
    for (let unit of this.creatures) {
      unit.update();
      unit.show();
    }

    this.creatures = this.creatures.filter(function(c) {
      return !c.finished();
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

  add(creature) {
    if (this.creatures.length > 2000) {
      // stop adding creatures at 2000;
      return;
    }
    this.creatures.push(creature);
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
