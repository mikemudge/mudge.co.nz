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
    this.lifetime -= 10;
    this.r+=5;
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
    tint(200, 60, 30, this.lifetime)
    imageMode(CENTER);
    image(img, this.pos.x, this.pos.y, this.r, this.r);
  }
}

class Emitter {
  constructor(x, y) {
    this.pos = createVector(x, y);
    this.particles = [];
  }

  emit(num) {
    for (let i = 0; i < num; i++) {
      let c = color(255);
      let size = 1;
      this.particles.push(new Particle(this.pos.x, this.pos.y, size, c));
      // if (random(1) < 0.5) {
      //   this.particles.push(new Particle(this.pos.x, this.pos.y, size, c));
      // } else {
      //   this.particles.push(new Confetti(this.pos.x, this.pos.y, size, c));
      // }
    }
  }

  applyForce(force) {
    for (let particle of this.particles) {
      particle.applyForce(force);
    }
  }

  update() {
    this.emit(2);
  
    let force = createVector(0, -0.1);
    this.applyForce(force)

    let dir = map(mouseX, 0, width, -0.1, 0.1);
    dir = constrain(dir, -0.1, 0.1)
    let wind = createVector(dir, 0);
    this.applyForce(wind)

    for (let particle of this.particles) {
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

let img

function preload() {
  img = loadImage('/static/p5_test/texture.png');
}

function setup() {
  createCanvas(400, 400);
  emitters = [];
  emitters.push(new Emitter(200, 375));
}

function draw() {
  clear();
  background(0);
  blendMode(ADD);

  for (let emitter of emitters) {
    emitter.update();
    emitter.show();
  }
}
