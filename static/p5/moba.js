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

    ellipse(0, 0, size * .1);
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
    this.r = 1.6;
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
    force.setMag(this.maxSpeed);
    force.sub(this.vel)
    return force
  }

  show(size) {
    push();
    rotate(this.vel.heading());
    stroke(255);
    strokeWeight(1);
    fill(lerpColor(color(0), this.color, this.health.getFraction() * .5 + .5));

    ellipse(0, 0, size * this.r);
    pop();
  }
}

class HeroUnit extends Unit {
  constructor(pos, team) {
    super(pos, team);
    this.targetPos = null;
    this.vel.mult(0);
    this.r = 2.4;
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
    this.vel.set(0, 0);
  }

  show(size) {
    super.show(size);
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

    circle(size * 1.6, size * 1.6, size * 3.2);
  }
}

class Spawner {
  constructor(team, pos) {
    this.team = team;
    this.game = team.getGame();
    this.pos = pos;
    this.r = 5;
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

    rect(0, 0, size * 4, size * 4);
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
    this.mousePos = createVector(0, 0);
    this.width = 1000;
    this.height = 1000;
    view.setCenter(createVector(this.width / 2, this.height / 2));
    this.units = [];
    this.controls = [];
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

  addControls(controls) {
    this.controls.push(controls);
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

  applyControl(unit, force) {
    unit.applyForce(force);
  }

  click() {
    this.mousePos.set(mouseX, mouseY);
    this.hero.targetPos = view.toGame(mousePos);
  }

  show() {
    if (!this.hero.finished()) {
      this.view.setCenter(this.hero.pos);
    }
    this.view.update();

    for (let control of this.controls) {
      control.update();
    }

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

    if (this.hero.targetPos) {
      // Also show the targetPos for this hero.
      let v = this.view.toScreen(this.hero.pos);
      let v2 = this.view.toScreen(this.hero.targetPos);
      strokeWeight(2);
      stroke("green");
      line(v.x, v.y, v2.x, v2.y);
    }

    // Render the game.
    for (let unit of this.units) {
      let health = unit.getHealth();
      if (health.isDamaged()) {
        this.view.showAtPos(health, unit.pos);
      }
    }

    for (let control of this.controls) {
      control.draw();
    }

    this.view.coverEdges();
  }
}

var mousePos;
var humanControls;
function setup() {
  view = new MapView(10);
  // 18px is the top div showing nav items.
  view.setScreen(windowWidth, windowHeight - 18);
  view.createCanvas();

  logger = new Logger();
  game = new Game(view);
  window.onblur = function() {
    game.paused = true;
    noLoop();
  }

  game.init();

  humanControls = new SwipeJoystick(game, game.hero);
  humanControls.speed = game.hero.maxSpeed;
  game.addControls(humanControls);

  mousePos = createVector(0, 0);
  touchPos = createVector(0, 0);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight - 18);

  view.setScreen(windowWidth, windowHeight - 18);
}

// Disable key controls because the view follows the hero unit.
// TODO could use keys to move the unit instead?
// function keyPressed() {
//   view.keys();
// }
//
// function keyReleased() {
//   view.keys();
// }

// TODO move this setup into the swipecontrol.js class?
// TODO handle multiple touches? Would need touchStarted, touchMoved and touchedEnded.
function mousePressed() {
  mousePos.set(mouseX, mouseY);
  logger.debug("Mouse Pressed " + mousePos.x.toFixed(2) + "," + mousePos.y.toFixed(2));
  // humanControls.start(mousePos);
}

function touchStarted() {
  touchPos.set(touches[0].x, touches[0].y);
  logger.debug("Touch Started " + numberFormat(touchPos.x) + "," + numberFormat(touchPos.y));
  humanControls.start(touchPos);
  // Avoid a mousePressed/mouseClicked event from following this.
  return false;
}

function numberFormat(num) {
  return "" + Math.round(num * 100) / 100;
}

function touchMoved() {
  touchPos.set(touches[0].x, touches[0].y);
  logger.debug("Touch Moved " + numberFormat(touchPos.x) + "," + numberFormat(touchPos.y));
  humanControls.move(touchPos);
}

function mouseDragged() {
  mousePos.set(mouseX, mouseY);
  logger.debug("Mouse Drag " + numberFormat(mousePos.x) + "," + numberFormat(mousePos.y));
  // humanControls.move(mousePos);
}

function touchEnded() {
  if (game.paused) {
    game.paused = false;
    loop();
    return;
  }
  // touches is empty/not set here, so just use the previous touchPos for "end"
  logger.debug("Touch Ended " + numberFormat(touchPos.x) + "," + numberFormat(touchPos.y));
  humanControls.end(touchPos);
}

function mouseReleased() {
  if (game.paused) {
    game.paused = false;
    loop();
    return;
  }
  // mousePos.set(mouseX, mouseY);
  // logger.debug("Mouse Release " + numberFormat(mousePos.x) + "," + numberFormat(mousePos.y));
  // humanControls.end(mousePos);

  // For a mouse we want to use mouse controls.
  // A "touch" which doesn't move (touchMoved) can appear just like a mouse click (pressed/released).
  game.click();
}

function mouseWheel(event) {
  view.scale(event.delta);
}

function draw() {
  background(0);

  game.show();

  logger.draw(windowWidth / 2 - 150, windowHeight - 160);
}
