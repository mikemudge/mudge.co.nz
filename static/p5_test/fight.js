class Unit {
  constructor(x, y, r, col) {
    this.r = r;
    this.pos = createVector(x, y);
    this.vel = p5.Vector.random2D();
    this.vel.mult(random(0.5, 2));
    this.acc = createVector(0, 0);
    this.maxSpeed = this.vel.mag();
    this.maxForce = 0.2
    this.color = col;
    if (!this.color) {
      this.color = color(255);
    }
  }

  update() {
    if (this.target) {
      this.applyForce(this.pursue(this.target));
    }
    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed);

    this.pos.add(this.vel);
    this.acc.set(0, 0);
  }

  applyForce(force) {
    this.acc.add(force);
  }

  pursue(agent) {
    let prediction = agent.vel.copy()
    prediction.mult(10);
    prediction.add(agent.pos)

    // fill(0,255,0)
    // circle(prediction.x, prediction.y, 10)

    return this.seek(prediction);
  }

  evade(agent) {
    return this.pursue(agent).mult(-1);
  }

  flee(target) {
    let force = this.seek(target).mult(-1);
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
  left = {
    'units': [],
    'color': color('#F063A4')
  }
  right = {
    'units': [],
    'color': color('#63A4F0')
  }
  teams = [left, right];
  for (let i = 0; i < 15; i++) {
    left['units'].push(new Unit(random(50, 150), random(height), 4, left['color']));
  }
  for (let i = 0; i < 15; i++) {
    unit = new Unit(random(250, 350), random(height), 4, right['color']);
    unit.target = random(left.units);
    right['units'].push(unit);
  }

  // Assign targets randomly from the other team?
  for (let unit of left.units) {
    unit.target = random(right.units);
  }

}

function draw() {
  background(0);

  // Retarget occasinally.
  for (let unit of left.units) {
    if (random(1) < 0.05) {
      unit.target = random(right.units);
    }
  }
  for (let unit of right.units) {
    if (random(1) < 0.05) {
      unit.target = random(left.units);
    }
  }


  for(let team of teams) {
    for (let unit of team.units) {
      unit.update();
      unit.show();
    }
  }
}
