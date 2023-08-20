class Projectile {
  constructor(pos, vel) {
    this.pos = pos;
    this.vel = vel;
    this.col = color(255);
  }

  update() {
    this.pos.add(this.vel);
  }

  show(size) {
    fill(this.color);

    ellipse(0, 0, size * .2);
  }
}

class Unit {
  constructor(pos, team) {
    this.r = 8;
    this.team = team;
    this.game = team.getGame();
    this.pos = pos;
    this.vel = p5.Vector.random2D();
    this.acc = createVector(0, 0);
    this.maxSpeed = 1.5;
    this.maxForce = 0.25;
    this.color = team.color;
    this.attackPower = 1;
    this.health = 100;
    this.range = 20;
  }

  update() {
    if (this.target && this.target.finished()) {
      this.target = null;
    }
    if (!this.target) {
      // Find a target?
      var options = this.game.getNearby(this.pos, 100);
      let team = this.team;
      let opponents = options.filter(function(unit) {
        return unit.team !== team;
      });
      if (opponents) {
        this.target = random(opponents);
      }
    }
    if (this.target) {
      if (this.target.pos.dist(this.pos) < this.range) {
        this.target.damage(this.attackPower);
        // No moving while attacking.
        return;
      }
      this.applyForce(this.seek(this.target.pos));
    } else if (this.goal) {
      this.applyForce(this.seek(this.goal));
    }

    // Now update the speed and position based on what was calculated above.
    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed);

    this.pos.add(this.vel);
    this.acc.set(0, 0);
  }

  damage(attack) {
    this.health -= attack;
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

  show(size) {
    rotate(this.vel.heading());
    stroke(255);
    strokeWeight(1);
    fill(lerpColor(color(0), this.color, this.health / 100 * .5 + .5));

    ellipse(0, 0, size * 0.8);
  }
}

class Path {
  constructor(points) {
    this.points = points;
  }

  show() {
    stroke(255);
    for (let i = 1; i < this.points.length; i++) {
      line(x, y, this.points[i].x, this.points[i].y);
      x = this.points[i].x;
      y = this.points[i].y;
    }
  }
}

class Spawner {
  constructor(team, pos, path) {
    this.team = team;
    this.game = team.getGame();
    this.pos = pos;
    this.r = 20;
    this.path = path;
    this.time = -1;
    this.respawnTime = 200;
    this.color = team.color;
    this.health = 1000;
  }

  update() {
    this.time++;
    if (this.time % this.respawnTime === 0) {
      for (let i = 0; i < 4; i++) {
        let pos = p5.Vector.random2D().mult(this.r).add(this.pos);
        let unit = new Unit(pos, this.team);
        unit.goal = this.path.points[1];
        this.game.addUnit(unit);
      }
    }
  }

  damage(attack) {
    this.health -= attack;
  }

  finished() {
    return this.health <= 0;
  }

  show(size) {
    fill(this.color);

    rect(-size, -size, size * 2, size * 2);
  }
}

class Team {
  constructor(game, color) {
    this.game = game;
    this.color = color;
  }
  getGame() {
    return this.game;
  }
}

class Game {
  constructor(view) {
    this.view = view;
    this.width = 600;
    this.height = 600;
    view.setCenter(createVector(this.width / 2, this.height / 2));
    this.units = [];
    this.init();
  }

  init() {
    this.units = [];
    let path = new Path([
      createVector(50, 50),
      createVector(this.width - 50, this.height - 50)
    ]);
    let team = new Team(this, color('#D33430'));
    let spawner = new Spawner(team, createVector(50, 50), path);
    this.units.push(spawner);

    path = new Path([
      createVector(this.width - 50, this.height - 50),
      createVector(50, 50)
    ]);
    team = new Team(this, color('#5C16C8'))
    spawner = new Spawner(team, createVector(this.width - 50, this.height - 50), path);
    this.units.push(spawner);
  }

  getNearby(pos, range) {
    var result = this.units.filter(function(unit) {
      return unit.pos.dist(pos) < range;
    });
    return result;
  }

  addUnit(unit) {
    this.units.push(unit);
  }

  show() {
    this.view.update();

    for (let unit of this.units) {
      unit.update();
    }
    for (let i = this.units.length - 1; i >= 0; i--) {
      if (this.units[i].finished()) {
        this.units.splice(i, 1);
      }
    }

    // Render the game.
    for (let unit of this.units) {
      this.view.show(unit);
    }

    this.view.coverEdges();
  }
}

function setup() {
  view = new MapView(40);
  // 18px is the top div showing nav items.
  view.setScreen(windowWidth, windowHeight - 18);
  w = view.getCanvasWidth();
  h = view.getCanvasHeight();
  createCanvas(w, h);
  console.log("setting canvas size", w, h);

  game = new Game(view);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight - 18);

  view.setScreen(windowWidth, windowHeight - 18);
}

function keyPressed() {
  view.keys();
}

function keyReleased() {
  view.keys();
}

function mouseWheel(event) {
  view.scale(event.delta);
}

function draw() {
  background(0);

  game.show();
}
