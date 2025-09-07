class Particle {
  constructor(x, y, r, col) {
    this.r = r;
    this.color = col;
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
    this.color.setAlpha(this.lifetime)
    stroke(this.color);
    strokeWeight(2);
    fill(this.color);

    ellipse(this.pos.x, this.pos.y, this.r * 2);
  }
}

class Confetti extends Particle {
  constructor(x, y, r, col) {
    super(x, y, r, col)
    this.angle = random(0, TWO_PI)
  }

  show() {
    this.color.setAlpha(this.lifetime)
    fill(this.color);
    noStroke();
    push()
    translate(this.pos.x, this.pos.y);
    rotate(this.angle);
    square(0, 0, this.r * 2);
    pop();
  }
}

class Emitter {
  constructor(x, y) {
    this.pos = createVector(x, y);
    this.particles = [];
  }

  emit(num) {
    for (let i = 0; i < num; i++) {
      let size = random(4, 6);
      let c = color(random(0, 255), random(0, 255), random(0, 255));
      if (random(1) < 0.5) {
        this.particles.push(new Particle(this.pos.x, this.pos.y, size, c));
      } else {
        this.particles.push(new Confetti(this.pos.x, this.pos.y, size, c));
      }
    }
  }

  update() {
    this.emit(1);
  
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

let emitters;
export function setup() {
  createCanvas(400, 400);
  emitters = [];
}

export function mousePressed() {
  emitters.push(new Emitter(mouseX, mouseY));
}

export function draw() {
  background(0);
  for (let emitter of emitters) {
    emitter.update();
    emitter.show();
  }
}
