class Projectile {
  constructor(pos, vel) {
    this.pos = pos;
    this.vel = vel;
    this.lifetime = 10;
    this.r = 2;
    this.color = color(255);
  }

  update() {
    this.lifetime--;
    this.pos.add(this.vel);
  }
  
  finished() {
    return this.lifetime <= 0;
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
    this.maxSpeed = 2;
    this.maxForce = 1
    this.template = new Triangle();
    this.color = color(255);
    this.health = 100;
  }

  update() {
    if (this.action) {
      this.action.applyAction(this);
    }
    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed);

    this.pos.add(this.vel);
    this.acc.set(0, 0);
  }

  finished() {
    return this.health <= 0;
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
    this.color.setAlpha(this.health * 255 / 100);
    fill(this.color);
    this.template.show(this.r);    
    pop();
  }
}

class PathFollow {
  constructor(path) {
    this.path = path;
    this.index = 0;
    this.target = this.path.points[this.index];
  }

  applyAction(unit) {
    let d = unit.pos.dist(this.target);
    if (d < 10) {
      if (this.index + 1 < this.path.points.length) {
        this.index++;
      } else {
        // End condition, leave map.
        unit.health = 0;
      }
      this.target = this.path.points[this.index];
    }
    if (this.target) {
      unit.applyForce(unit.seek(this.target));
    }
  }

  show() {

  }
}

class Circle {
  show(size) {
    ellipse(0, 0, size * 2);
  }
}

class Triangle {
  show(size) {
    triangle(-size, size, -size, -size, size * 2, 0);
  }
}

class Path {
  constructor(points) {
    this.points = points;
  }

  show() {
    stroke(255);
    let p = this.points[0];
    for (let i = 1; i < this.points.length; i++) {
      line(p.x, p.y, this.points[i].x, this.points[i].y);
      p = this.points[i];
    }
  }
}

class Tower {
    constructor(x, y, r) {
    this.r = r;
    this.pos = createVector(x, y);
    this.template = new Circle();
    this.color = color(0, 0, 255);
    this.actionDelay = 0;
    this.shots = [];
  }

  update() {
    this.acquireTarget();

    for (let s of this.shots) {
      s.update();
    }

    for (let i = this.shots.length - 1; i >= 0; i--) {
      if (this.shots[i].finished()) {
        this.target.health -= 10;
        this.shots.splice(i, 1);
      }
    }
  }

  acquireTarget() {
    if (this.actionDelay > 0) {
      this.actionDelay--;
      return;
    }
    if (this.target && this.target.finished()) {
      this.target = null;
    }

    if (!this.target) {
      this.target = random(this.targets);
    }
    if (this.target) {
      // shoot at the target.
      let vel = this.target.pos.copy().sub(this.pos);
      vel.mult(0.1);
      this.shots.push(new Projectile(this.pos.copy(), vel));
      this.actionDelay = 25;
    }
  }

  show() {
    push();
    translate(this.pos.x, this.pos.y);
    stroke(255);
    strokeWeight(1);
    fill(this.color);
    this.template.show(this.r);    
    pop();

    for (let s of this.shots) {
      s.show();
    }
  }
}

class Spawner {
  constructor(pos, path) {
    this.units = [];
    this.pos = pos;
    this.r = 20;
    this.path = path;
    this.time = 0;
    this.rate = 150;
    this.color = color(random(255), random(255), random(255));
  }

  update() {
    this.time++;
    if (this.time % this.rate == 0) {
      let unit = new Unit(this.pos.x, this.pos.y, 8);
      unit.color = color(this.color.levels);
      unit.target = this.path.points[1];
      unit.action = new PathFollow(this.path);
      this.units.push(unit);
    }

    for (let unit of this.units) {
      unit.update();
    }

    for (let i = this.units.length - 1; i >= 0; i--) {
      if (this.units[i].finished()) {
        this.units.splice(i, 1);
      }
    }
  }

  show() {
    this,path.show();

    push();
    translate(this.pos.x, this.pos.y);
    fill(this.color);

    rect(-this.r, -this.r, this.r * 2, this.r * 2);
    pop();
    for (let unit of this.units) {
      unit.show();
    }

  }
}

function setup() {
  createCanvas(800, 600);
  paused = false;
  units = [];
  path = new Path([
    createVector(50, 50),
    createVector(50, height - 50),
    createVector(width - 50, height - 50),
    createVector(width - 50, 50)
  ]);
  spawner = new Spawner(createVector(50, 50), path);
  spawner.color = color('#D33430');
  spawner.template = new Triangle();
  units.push(spawner);
}

function draw() {
  background(0);

  for (let unit of units) {
    unit.update();
    unit.show();
  }
}

function keyPressed() {
  if (key === ' ') {
    if (paused) {
      paused = false;
      loop();
    } else {
      paused = true;
      noLoop();
    }
  }
}

function mouseClicked() {
  if (paused) {
    return;
  }
  tower = new Tower(mouseX, mouseY, 16);
  tower.targets = spawner.units;
  units.push(tower);
}
