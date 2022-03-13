
class Particle {
  constructor(x, y) {
    this.r = 4;
    this.pos = createVector(x, y);
    this.vel = p5.Vector.random2D();
    this.vel.mult(random(0.5, 2));
    this.acc = createVector(0, 0);
    this.lifetime = 255;
  }

  update() {
    this.lifetime -= 5;
    this.vel.add(this.acc);

    this.pos.add(this.vel);
  }

  finished() {
    return this.lifetime < 0;
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

  endUpdate() {
    this.acc.set(0, 0);
  }

  applyForce(force) {
    this.acc.add(force);
  }

  show() {
    stroke(255, this.lifetime);
    strokeWeight(2);
    fill(255, this.lifetime);

    ellipse(this.pos.x, this.pos.y, this.r * 2);
  }
}

function setup() {
  createCanvas(400, 400);
  gravity = createVector(0, 0.2);
  particles = [];
}


function draw() {
  background(0);

  for (i = 0; i < 5; i++) {
    particles.push(new Particle(mouseX, mouseY, 4));
  }

  for (let particle of particles) {

    particle.applyForce(gravity);

    particle.update()
    particle.show();
    // Display acceleration + velocity.
    // particle.debugShow();
    particle.endUpdate();
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].finished()) {
      particles.splice(i, 1);
    }
  }
}
