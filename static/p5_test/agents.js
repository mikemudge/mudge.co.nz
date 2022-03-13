class Agent {
  constructor(x, y, r, col) {
    this.r = r;
    this.pos = createVector(x, y);
    this.vel = p5.Vector.random2D();
    this.vel.mult(random(0.5, 2));
    this.acc = createVector(0, 0);
    this.maxSpeed = 6;
    this.maxForce = 0.2
    this.color= col;
    if (!this.color) {
      this.color = color(255);
    }
  }

  update() {
    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed);

    this.pos.add(this.vel);
    this.acc.set(0, 0);
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
  agents = [];
  // for (let i = 0; i < 1; i++) {
  //   agents.push(new Agent(200, 200, 16));
  // }
  pursuer = new Agent(100, 100, 16)
  agents.push(pursuer);

  target = new Agent(200, 100, 16, color("#F063A4"))
  target.vel = createVector(5,2)
  agents.push(target);
}

function draw() {
  background(0);

  pursuer.applyForce(pursuer.pursue(target));
  target.applyForce(target.evade(pursuer));
  target.wrap();
  pursuer.wrap();

  let d = p5.Vector.dist(pursuer.pos, target.pos);
  if (d < pursuer.r + target.r) {
    // Relocate and change speed when the target is caught.
    target.pos = createVector(random(width), random(height))
    target.vel = p5.Vector.random2D();
    target.vel.mult(5);
  }

  for (let agent of agents) {
    agent.update();
    agent.show();
  }
}
