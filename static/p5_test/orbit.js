
class Attractor {
  constructor(x, y, m) {
    this.r = Math.sqrt(m) * 2;
    this.pos = createVector(x, y);
    this.mass = m;
  }

  attract(mover) {
    let force = p5.Vector.sub(this.pos, mover.pos);
    let disSq = constrain(force.magSq(), 100, 600 * 600);

    let G = 5;

    let strength = G * (this.mass * mover.mass) / disSq;

    force.setMag(strength);

    mover.applyForce(force);
  }

  show() {
    strokeWeight(0);
    fill(255, 0, 100);

    ellipse(this.pos.x, this.pos.y, this.r * 2);
  }
}

class Mover {
  constructor(x, y, m) {
    this.r = Math.sqrt(m) * 2;
    this.pos = createVector(x, y);
    this.vel = createVector(0, 0);
    this.vel = p5.Vector.random2D();
    this.acc = createVector(0, 0);
    this.mass = m;
  }

  edges() {
    if (this.pos.y + this.r >= height) {
      this.pos.y = height - this.r;
      this.vel.y *= -1;
    }
    if (this.pos.x + this.r  >= width) {
      this.pos.x = width - this.r;
      this.vel.x *= -1;
    }
    if (this.pos.x - this.r <= 0) {
      this.pos.x = this.r;
      this.vel.x *= -1;
    }
  }

  friction() {
    let diff = height - (this.pos.y + this.r);
    if (diff < 1) {
      let friction = this.vel.copy();
      friction.normalize();
      friction.mult(-1);
      let mu = .1;
      let normal = this.mass;
      friction.setMag(mu * normal);
      this.applyForce(friction)
    }
  }

  drag() {
    let drag = this.vel.copy();
    drag.normalize();
    drag.mult(-1);

    let c = .3;
    let speedSq = this.vel.magSq();
    drag.setMag(c * speedSq);

    if (this.pos.y > height / 2) {
      this.applyForce(drag);
    }
  }

  update() {
    // let mouse = createVector(mouseX, mouseY);
    // this.acc = p5.Vector.sub(mouse, this.pos);
    // this.acc.setMag(.1);

    this.vel.add(this.acc);

    this.pos.add(this.vel);
  }

  endUpdate() {
    this.acc.set(0, 0);
  }

  applyForce(force) {
    let f = p5.Vector.div(force, this.mass);
    this.acc.add(f);
  }

  show() {
    stroke(255);
    strokeWeight(2);
    fill(255, 100);

    // ellipse(this.pos.x, this.pos.y, this.r * 2);
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.vel.heading());
    triangle(-this.r, -this.r / 2, -this.r, this.r / 2, this.r, 0);
    pop();
  }

  debugShow() {
    stroke(0, 255, 0);
    let a = this.acc.copy().mult(100).add(this.pos);
    line(this.pos.x, this.pos.y, a.x, a.y)

    stroke(255, 0, 0);
    let v = this.vel.copy().mult(10).add(this.pos);
    line(this.pos.x, this.pos.y, v.x, v.y)
  }
}

function setup() {
  createCanvas(600, 600);
  movers = [];
  attractors = [];

  for (i = 0; i < 10; i++) {
    // mass = random(1, 8);
    mass = 50;
    x = random(width);
    y = random(height);
    // x = 50;
    // y = 50;
    mass = random(10, 250);
    mover = new Mover(x, y, mass)

    movers.push(mover);

    // Calculate the speed to get a perfect orbit.
    vel = createVector(width / 2, height / 2).sub(mover.pos);
    dis = vel.mag();
    let strength = Math.sqrt(5 * 100 / dis);
    vel.setMag(strength);
    mover.vel = createVector(vel.y, -vel.x);
  }

  attractors.push(new Attractor(width/2, height/2, 100));
}

function draw() {
  background(0, 5);

  // render a half screen filled "high drag" zone.
  // fill(255, 125);
  // noStroke();
  // rect(0, height / 2, width, height / 2);

  wind = createVector(.1, 0)

  for (let a of attractors) {
    a.show();
  }

  for (let mover of movers) {
    // if (mouseIsPressed) {
    //   mover.applyForce(wind);
    // }

    for (let a of attractors) {
      a.attract(mover);
    }

    // let gravity = createVector(0, .2);
    // let weight = p5.Vector.mult(gravity, this.mass);
    // mover.applyForce(weight);

    // mover.edges();
    // mover.friction();
    // mover.drag();

    mover.update()
    mover.show();
    // Display acceleration + velocity.
    // mover.debugShow();
    mover.endUpdate();
  }
}
