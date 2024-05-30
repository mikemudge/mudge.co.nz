
class Mover {
  constructor(x, y, m, r, col) {
    this.col = col;
    this.r = r;
    this.pos = createVector(x, y);
    this.vel = createVector(0, 0);
    this.vel = p5.Vector.random2D().mult(0.2);
    this.acc = createVector(0, 0);
    this.mass = m;
  }

  update(debug) {
    this.vel.add(this.acc);

    this.pos.add(this.vel);

    if (debug) {
      // Display acceleration + velocity.
      this.debugShow();
    }
    // Reset acceleration after applying it.
    this.acc.set(0, 0);
  }

  attract(mover) {
    let force = p5.Vector.sub(this.pos, mover.pos);
    // Can't be closer than 20 to each other.
    constrain(force, 20, force.mag());
    let disSq = force.magSq();

    let G = .5;

    let strength = G * (this.mass * mover.mass) / disSq;

    force.setMag(strength);

    mover.applyForce(force);
  }

  applyForce(force) {
    // f / m = a
    force.div(this.mass);
    this.acc.add(force);
  }

  show() {
    stroke(this.col);
    strokeWeight(2);
    fill(this.col);

    ellipse(this.pos.x, this.pos.y, this.r);
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

  // sun mass = 2 * 10 ^ 30 kg
  // sun radius = 696,340 km
  // earth mass = 6 * 10 ^ 24 kg
  // earth radius = 6,371 km
  // distance between = 150,000,000 km (1 AU)

  // scale everything down by 10 ^ 6?

  bodies = [];

  x = random(width);
  y = random(height);
  mass = 2 * 10 ^ 24;
  body = new Mover(x, y, mass, 3, 'blue');
  bodies.push(body);

  for (i = 0; i < 3; i++) {
    x = random(width);
    y = random(height);

    mass = 2 * 10 ^ 12;
    body = new Mover(x, y, mass, 35, 'yellow');
    bodies.push(body);

    // Calculate the speed to get a perfect orbit.
    vel = createVector(width / 2, height / 2).sub(body.pos);
    dis = vel.mag();
    let strength = Math.sqrt(.2 * 100 / dis);
    vel.setMag(strength);
    body.vel = createVector(vel.y, -vel.x);
  }
}

let debug = true;
function draw() {
  background(0);

  for (let b of bodies) {
    b.show();
  }

  for (let b of bodies) {

    for (let b2 of bodies) {
      b.attract(b2);
    }
  }
  for (let b of bodies) {
    b.update(debug);
  }
}
