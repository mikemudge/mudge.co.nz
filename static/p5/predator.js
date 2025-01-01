
class Creature {
  constructor(world) {
    this.size = 5;
    this.world = world;
    this.pos = createVector(random(world.width), random(world.height));
    this.vel = p5.Vector.random2D();
    this.age = 0;
    this.maxSpeed = 5;
    this.maxForce = 0.2;
    this.health = 100;
    this.color = random(['red', 'green', 'blue']);
  }

  update() {
    this.border();

    this.age += 1;

    this.collide();

    this.acc = p5.Vector.random2D().setMag(this.maxForce);

    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed);

    this.pos.add(this.vel);
    this.acc.set(0, 0);
  }

  collide() {
    for (let c of this.world.creatures) {
      if (this === c) {
        continue;
      }
      let dis = this.pos.dist(c.pos);
      if (dis < this.size * 2) {
        if (this.color !== c.color) {
        // Fight each other.
          c.health -= 10;
          if (c.health === 0) {
            // I killed it, full heal.
            this.health = 100;
            this.foodLevel = 100;
          }
        } else {
          // Same color will help each other.
          if (this.age > 100 && c.age > 100) {
            // reproduce now, and make a new creature.
            // And reset the age so reproduction is less common.
            this.age = 0;
            c.age = 0;
            if (this.world.creatures.length < this.world.maxCreatures) {
              let newC = new Creature(this.world);
              newC.color = this.color;
              newC.pos = this.pos.copy();
              this.world.creatures.push(newC);
            }
          }
        }

        this.vel.set(p5.Vector.sub(this.pos, c.pos).mult(0.1));
      }
    }
  }

  border() {
    if (this.pos.x - this.size < 0 && this.vel.x < 0) {
      this.vel.x *= -1;
    }
    if (this.pos.x + this.size > width && this.vel.x > 0) {
      this.vel.x *= -1;
    }
    if (this.pos.y - this.size < 0 && this.vel.y < 0) {
      this.vel.y *= -1;
    }
    if (this.pos.y + this.size > height && this.vel.y > 0) {
      this.vel.y *= -1;
    }
  }

  applyForce(force) {
    this.acc.add(force);
  }

  finished() {
    return this.health <= 0;
  }

  show() {
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.vel.heading());
    let c = color(this.color);
    c.setAlpha(255 * this.health / 100);
    fill(c);
    ellipse(0, 0, this.size * 2);
    pop();
  }
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  world = {
    creatures: [],
    // <1000 runs ok, starts to get slow around then.
    maxCreatures: 500,
    width: width,
    height: height
  }

  for (var i = 0; i < world.maxCreatures / 2; i++) {
    creature = new Creature(world);
    world.creatures.push(creature);
  }
}

function draw() {
  background(0);

  for (let unit of world.creatures) {
    unit.update();
    unit.show();
  }

  world.creatures = world.creatures.filter(function(c) {
    return c.health > 0;
  });
}
