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
    this.acc.set(0, 0);
  }

  finished() {
    return this.lifetime < 0;
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

class Emitter {
  constructor(x, y) {
    this.pos = createVector(x, y);
    this.particles = [];
  }

  emit() {
    for (let i = 0; i < 5; i++) {
      this.particles.push(new Particle(this.pos.x, this.pos.y, 4));
    }
  }

  update() {
    this.emit(5);
  
    let gravity = createVector(0, 0.2);
    for (let particle of this.particles) {
      particle.applyForce(gravity);
      particle.update()
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      if (this.particles[i].finished()) {
        this.particles.splice(i, 1);
      }
    }
  }

  show() {
    for (let particle of this.particles) {
      particle.show();
    }
  }
}

function setup() {
  createCanvas(400, 400);
  emitters = [];
  // emitters.push(new Emitter(width / 2, 20));
}

function mousePressed() {
  emitters.push(new Emitter(mouseX, mouseY));
}

function draw() {
  background(0);
  for (let emitter of emitters) {
    emitter.update();
    emitter.show();
  }
}
