class Unit {
  constructor(x, y, r, col) {
    this.r = r;
    this.pos = createVector(x, y);
    this.vel = p5.Vector.random2D();
    this.vel.mult(random(2, 5));
    this.acc = createVector(0, 0);
    this.maxSpeed = 2;
    this.maxForce = 0.05
    this.color = col;
    if (!this.color) {
      this.color = color(255);
    }
  }

  wrap() {
    if (this.pos.x > width) {
      this.pos.x -= width;
    }
    if (this.pos.x < 0) {
      this.pos.x += width;
    }
    if (this.pos.y > height) {
      this.pos.y -= height;
    }
    if (this.pos.y < 0) {
      this.pos.y += height;
    }
  }

  update() {
    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed);

    this.pos.add(this.vel);
    this.acc.set(0, 0);
  }

  applyForce(force) {
    this.acc.add(force);
  }

  flock(units) {
    let force = createVector(0, 0);
    force.add(p5.Vector.random2D());

    for (let target of units) {
      if (this == target) {
        continue;
      }

      // We want to get close to the target.
      let toTarget = p5.Vector.sub(target.pos, this.pos);
      let dis = toTarget.magSq();
      // We don't want to be on top of the target.
      // This could result in a negative, making us move away from the target.
      toTarget.setMag(toTarget.mag() - this.r * 5);
      toTarget.limit(this.maxSpeed * 2);

      // We also want to match direction of our target.
      toTarget.add(target.vel);
      toTarget.limit(this.maxSpeed);

      // Scale the force based on how close we are to the target.
      // Close targets influence us more.
      force.add(toTarget.mult(100 / dis));
    }

    // Then limit the force so its not massive.
    force.limit(unit.maxForce);
    return force;
  }

  show() {
    stroke(this.color);
    strokeWeight(2);
    fill(this.color, 100);

    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.vel.heading());
    triangle(-this.r, -this.r / 2, -this.r, this.r / 2, this.r, 0);
    pop();
  }
}

function setup() {
  createCanvas(400, 400);
  units = [];
  for (let i = 0; i < 50; i++) {
    c = color(random(255), random(255), random(255));
    unit = new Unit(random(width), random(height), 8, c);
    units.push(unit);
  }
}

function draw() {
  background(0);

  for (let unit of units) {

    // Align with all of the units.
    unit.applyForce(unit.flock(units));

    unit.wrap();
    unit.update();
    unit.show();
  }
}
