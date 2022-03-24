class Unit {
  constructor(x, y, r, col) {
    this.r = r;
    this.pos = createVector(x, y);
    this.vel = p5.Vector.random2D();
    this.vel.mult(random(2, 5));
    this.acc = createVector(0, 0);
    this.maxSpeed = 5;
    this.maxForce = 0.2
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
    if (this.target) {
      this.applyForce(this.flock(this.target));
    }
    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed);

    this.pos.add(this.vel);
    this.acc.set(0, 0);
  }

  applyForce(force) {
    this.acc.add(force);
  }

  flock(agent) {
    // We want to change direction to match our target.
    let desiredSpeed = agent.vel.copy();
    desiredSpeed.limit(this.maxSpeed);

    // We also want to get close to our target.
    let force = p5.Vector.sub(agent.pos, this.pos);
    // But not right on top of the target.
    force.add(p5.Vector.random2D().mult(this.r * 2));
    if (force.mag() > this.maxSpeed) {
      force.setMag(this.maxSpeed);
    }

    // combine direction towards target and targets direction.
    force.add(desiredSpeed)

    // Now change our speed towards the desired speed.
    force.sub(this.vel);
    force.limit(this.maxForce);
    return force;
  }

  seek(target) {
    let force = p5.Vector.sub(target, this.pos);
    if (force.mag() > this.maxSpeed) {
      force.setMag(this.maxSpeed);
    }
    force.sub(this.vel)
    force.limit(this.maxForce)
    return force
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
  c = color('#63A4F0');
  units = [];
  for (let i = 0; i < 50; i++) {
    unit = new Unit(random(width), random(height), 8, c);
    units.push(unit);
  }
}

function draw() {
  background(0);

  for (let unit of units) {

    // Retarget occasinally.
    if (random(1) < 0.05) {
      unit.target = random(units);
    }

    unit.wrap();
    unit.update();
    unit.show();
  }
}
