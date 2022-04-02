class Projectile {
  constructor(pos, vel) {
    this.pos = pos;
    this.vel = vel;
    this.r = 2;
    this.col = color(255);
  }

  update() {
    this.pos.add(this.vel);
  }

  show() {
    fill(this.color);

    push();
    translate(this.pos.x, this.pos.y);
    ellipse(0, 0, this.r * 2);
    pop();
  }
}

class Unit {
  constructor(x, y, r, col) {
    this.r = r;
    this.pos = createVector(x, y);
    this.vel = p5.Vector.random2D();
    this.vel.mult(random(2, 5));
    this.acc = createVector(0, 0);
    this.maxSpeed = 5;
    this.maxForce = 0.2
    this.template = new Circle();
    this.color = color(255);
  }

  update() {
    if (this.target) {
      this.applyForce(this.seek(this.target));
    }
    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed);

    this.pos.add(this.vel);
    this.acc.set(0, 0);
  }

  applyForce(force) {
    this.acc.add(force);
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
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.vel.heading());
    stroke(255);
    strokeWeight(1);
    this.template.show(this.color, this.r);    
    pop();
  }
}

class Circle {
  show(color, size) {
    fill(color);

    ellipse(0, 0, size * 2);
  }
}

class Triangle {
  show(color, size) {
    fill(color);

    triangle(-size, size, -size, -size, size * 2, 0);
  }
}

class Path {
  constructor(points) {
    this.points = points;
  }

  show() {
    stroke(255);
    for (i = 1; i < this.points.length; i++) {
      line(x, y, this.points[i].x, this.points[i].y);
      x = this.points[i].x;
      y = this.points[i].y;
    }
  }
}

class Spawner {
  constructor(units, pos, path) {
    this.units = units;
    this.pos = pos;
    this.r = 20;
    this.path = path;
    this.time = 0;
    this.color = color(random(255), random(255), random(255));
  }

  update() {
    this.time++;
    if (this.time % 1000 == 0) {
      let unit = new Unit(this.pos.x, this.pos.y, 8);
      unit.color = this.color;
      unit.target = this.path.points[1];
      this.units.push(unit);
    }
  }

  show() {
    push();
    translate(this.pos.x, this.pos.y);
    fill(this.color);

    rect(-this.r, -this.r, this.r * 2, this.r * 2);
    pop();

  }
}

function setup() {
  createCanvas(400, 400);
  units = [];
  path = new Path([
    createVector(50, 50),
    createVector(width - 50, height - 50)
  ]);
  spawner = new Spawner(units, createVector(50, 50), path);
  spawner.color = color('#D33430');
  spawner.template = new Triangle();
  units.push(spawner);

  path = new Path([
    createVector(width - 50, height - 50),
    createVector(50, 50)
  ]);
  spawner = new Spawner(units, createVector(width - 50, height - 50), path);
  spawner.color = color('#5C16C8');
  units.push(spawner);
}

function draw() {
  background(0);

  for (let unit of units) {
    unit.update();
    unit.show();
  }
}
