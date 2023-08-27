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

class HealthBar {
  constructor(maxHealth) {
    this.maxHealth = maxHealth;
    this.health = maxHealth;
    this.recovery = 0;
    this.scale = 1;
  }

  setScale(scale) {
    this.scale = scale;
  }

  setRecovery(recovery) {
    this.recovery = recovery;
  }

  update() {
    this.health = Math.min(this.health + this.recovery, this.maxHealth);
  }

  damage(amount) {
    this.health -= amount;
  }

  getFraction() {
    return this.health / this.maxHealth;
  }

  isDamaged() {
    return this.health < this.maxHealth;
  }

  isAlive() {
    return this.health > 0;
  }

  show(size) {
    let uSize = this.scale * size;
    fill("#0F0")
    noStroke();
    rect(-uSize, -uSize, uSize * 2 * this.health/this.maxHealth, size / 2);
    stroke("#FFF");
    noFill();
    rect(-uSize, -uSize, uSize * 2, size / 2);
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
    this.goalIndex = 0;
    this.color = team.color;
    this.attackPower = 1;
    this.health = new HealthBar(100);
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
    } else if (this.goal.points.length > this.goalIndex) {
      let goal = this.goal.points[this.goalIndex];
      if (p5.Vector.dist(this.pos, goal) < this.r) {
        this.goalIndex++;
      }
      this.applyForce(this.seek(goal));
    }

    // Now update the speed and position based on what was calculated above.
    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed);

    this.pos.add(this.vel);
    this.acc.set(0, 0);
  }

  damage(attack) {
    this.health.damage(attack);
  }

  getHealth() {
    return this.health;
  }

  finished() {
    return !this.health.isAlive();
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
    let uSize = size * this.r / 10;
    push();
    rotate(this.vel.heading());
    stroke(255);
    strokeWeight(1);
    fill(lerpColor(color(0), this.color, this.health.getFraction() * .5 + .5));

    ellipse(0, 0, uSize);
    pop();
  }
}

class HeroUnit extends Unit {
  constructor(pos, team) {
    super(pos, team);
    this.targetPos = null;
    this.vel.mult(0);
    this.r = 12;
    this.maxSpeed = 3;
    this.health = new HealthBar(500);
    this.health.setRecovery(10);
    this.health.setScale(1.5);
    // TODO experience and leveling up stats?
  }

  update() {
    this.health.update();
    // Move to a target location, or attack a target unit?
    if (this.targetPos) {
      if (this.pos.dist(this.targetPos) < this.maxSpeed) {
        // Set speed/acc to 0;
        this.vel.mult(0);
        this.acc.mult(0);
        this.targetPos = null;
        return;
      }
      this.applyForce(this.seek(this.targetPos));
    } else if (this.target) {
      if (this.target.pos.dist(this.pos) < this.range) {
        this.target.damage(this.attackPower);
        // No moving while attacking.
        return;
      }
      this.applyForce(this.seek(this.target.pos));
    }

    // Now update the speed and position based on what was calculated above.
    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed);

    this.pos.add(this.vel);
    this.acc.set(0, 0);
  }

  show(size) {
    super.show(size);

    if (this.targetPos) {
      // Also show the targetPos for this hero.
      strokeWeight(2)
      stroke("green");
      let v = p5.Vector.sub(this.targetPos, this.pos).mult(size / 20);
      line(0, 0, v.x, v.y);
    }
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

class Tower {
  constructor(team, pos) {
    this.team = team;
    this.game = team.getGame();
    this.pos = pos;
    this.color = team.color;
    this.health = new HealthBar(5000);
    this.health.setScale(3);
  }

  update() {
    // Find targets, shoot them
  }

  getHealth() {
    return this.health;
  }

  damage(attack) {
    this.health.damage(attack);
  }

  finished() {
    return !this.health.isAlive();
  }

  show(size) {
    fill(this.color);

    circle(0, 0, size * 1.6);
  }
}

class Spawner {
  constructor(team, pos) {
    this.team = team;
    this.game = team.getGame();
    this.pos = pos;
    this.r = 20;
    this.paths = [];
    this.time = -1;
    this.respawnTime = 200;
    this.color = team.color;
    this.health = new HealthBar(10000);
    this.health.setScale(3);
  }

  addPath(path) {
    this.paths.push(new Path(path));
  }

  update() {
    this.time++;
    if (this.time % this.respawnTime === 0) {
      for (let i = 0; i < 4; i++) {
        for (let path of this.paths) {
          let pos = p5.Vector.random2D().mult(this.r).add(this.pos);
          let unit = new Unit(pos, this.team);
          unit.goal = path;
          this.game.addUnit(unit);
        }
      }
    }
  }

  getHealth() {
    return this.health;
  }

  damage(attack) {
    this.health.damage(attack);
  }

  finished() {
    return !this.health.isAlive();
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
    this.width = 1000;
    this.height = 1000;
    view.setCenter(createVector(this.width / 2, this.height / 2));
    this.units = [];
    this.init();
  }

  init() {
    this.units = [];
    let team = new Team(this, color('#D33430'));
    let spawner = new Spawner(team, createVector(50, 50));
    spawner.addPath([
      createVector(this.width - 50, this.height - 50)
    ]);
    spawner.addPath([
      createVector(50, this.height - 50),
      createVector(this.width - 50, this.height - 50)
    ]);
    spawner.addPath([
      createVector(this.width - 50, 50),
      createVector(this.width - 50, this.height - 50)
    ]);
    this.units.push(spawner);
    this.units.push(new Tower(team, createVector(150, 50)));
    this.units.push(new Tower(team, createVector(50, 150)));
    this.units.push(new Tower(team, createVector(this.width / 2, 50)));
    this.units.push(new Tower(team, createVector(50, this.height / 2)));

    this.hero = new HeroUnit(createVector(100, 100), team);
    this.addUnit(this.hero);

    team = new Team(this, color('#5C16C8'))
    spawner = new Spawner(team, createVector(this.width - 50, this.height - 50));
    spawner.addPath([
      createVector(50, 50)
    ]);
    spawner.addPath([
      createVector(50, this.height - 50),
      createVector(50, 50)
    ]);
    spawner.addPath([
      createVector(this.width - 50, 50),
      createVector(50, 50)
    ]);
    this.units.push(spawner);
    this.units.push(new Tower(team, createVector(this.width - 150, this.height - 50)));
    this.units.push(new Tower(team, createVector(this.width - 50, this.height - 150)));
    this.units.push(new Tower(team, createVector(this.width / 2, this.height - 50)));
    this.units.push(new Tower(team, createVector(this.width - 50, this.height / 2)));
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

  click() {
    let gamePos = createVector(view.toGameX(mouseX), view.toGameY(mouseY));
    this.hero.targetPos = gamePos;
  }

  show() {
    if (!this.hero.finished()) {
      this.view.setCenter(this.hero.pos);
    }
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

    // Render the game.
    for (let unit of this.units) {
      let health = unit.getHealth();
      if (health.isDamaged()) {
        this.view.showAtPos(health, unit.pos);
      }
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
  window.onblur = function() {
    game.paused = true;
    noLoop();
  }
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

function mouseReleased() {
  if (game.paused) {
    game.paused = false;
    loop();
    return;
  }
  game.click();
}

function mouseWheel(event) {
  view.scale(event.delta);
}

function draw() {
  background(0);

  game.show();
}
