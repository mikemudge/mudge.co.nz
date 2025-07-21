
class Util {
  static vectorString(pos) {
    return Math.round(pos.x) + ", " + Math.round(pos.y);
  }
}

class Projectile {
  constructor(pos, vel) {
    this.pos = pos;
    this.vel = vel;
    this.to = vel.copy();
    this.col = color(255);
    // TODO calculate the expected time to target?
    this.life = 60;
  }

  update() {
    this.life--;
    this.pos.add(this.vel);
  }

  finished() {
    return this.life <= 0;
  }

  show(size) {
    fill(this.color);

    this.to.set(vel).setMag(size);
    line(0, 0, this.to.x, this.to.y);
  }
}

class HealthBar {
  constructor(maxHealth, r) {
    this.maxHealth = maxHealth;
    this.health = maxHealth;
    this.recovery = 0;
    // default scale is the radius of the unit + 20%.
    this.scale = r * 1.2;
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

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  getFraction() {
    return this.health / this.maxHealth;
  }

  getMax() {
    return this.maxHealth;
  }

  getHealth() {
    return this.health;
  }

  isDamaged() {
    return this.health < this.maxHealth;
  }

  isAlive() {
    return this.health > 0;
  }

  showHealth(size) {
    let h = Math.sqrt(this.scale) * 2 * size;
    let scaledRadius = size * this.scale;

    // Draw the outline in white.
    stroke("#FFF");
    noFill();
    rect(-scaledRadius, -scaledRadius - h, scaledRadius * 2, h);
    // Fill in the health level in green.
    fill("#0F0")
    noStroke();
    rect(-scaledRadius, -scaledRadius - h, scaledRadius * 2 * this.health/this.maxHealth, h);
  }
}

class UnitClass {
  constructor(name) {
    this.name = name;
    this.r = 8;
    this.maxHealth = 100;
    this.maxSpeed = 1.5;
    this.maxForce = 0.25;
    this.attackPower = 1;
    this.attackRange = 20;
    this.sightRange = 200;

    // The time and cost to build this.
    this.cost = 75;
    this.time = 24;
    // What this unit can build.
    this.buildBuildings = [];
  }
  getSize() {
    return this.r;
  }

  setBuildableBuilding(buildings) {
    this.buildBuildings = buildings;
  }

  create(pos, team) {
    return new Unit(pos, team, this);
  }

  render(size) {
    ellipse(0, 0, size * 2);
  }
}

class Unit {
  constructor(pos, team, unitClass) {
    this.unitClass = unitClass;
    this.team = team;
    this.game = team.getGame();
    this.pos = pos;
    this.vel = createVector(0, 0);
    this.acc = createVector(0, 0);
    this.color = team.color;
    this.health = new HealthBar(this.unitClass.maxHealth, this.unitClass.r);
    this.actions = [];
  }

  addAction(action) {
    this.actions.push(action);
  }

  setAction(action) {
    // Do the new action immediately.
    this.action = action;
    // Remove all existing actions from the queue.
    this.actions.splice(0, this.actions.length);
  }

  update() {
    if (this.unitClass instanceof HeroUnit) {
      console.log("Hero update");
    }
    if (this.action) {
      if (this.action.isComplete(this)) {
        this.game.view.overlayMenu.addMessage("Unit completed action");
        this.action = null;
        this.stop();
        if (this.actions.length > 0) {
          this.action = this.actions.shift();
        }
      } else {
        this.action.update(this);
      }
    } else {
      // If we have no action, and there are some grab the next one.
      if (this.actions.length > 0) {
        this.action = this.actions.shift();
      }
    }
    // Needed to hurt/recover health over time.
    this.health.update();

    // Now update the speed and position based on what was calculated above.
    this.vel.add(this.acc);
    this.vel.limit(this.unitClass.maxSpeed);

    this.pos.add(this.vel);
    this.acc.set(0, 0);
  }

  damage(attack) {
    this.health.damage(attack);
  }

  getSize() {
    return this.unitClass.r
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

  stop() {
    this.vel.setMag(0);
    // Make sure the velocity isn't about to change either.
    this.acc.set(0, 0);
  }

  seek(target) {
    let force = p5.Vector.sub(target, this.pos);
    if (force.mag() > this.unitClass.maxSpeed) {
      force.setMag(this.unitClass.maxSpeed);
    }
    force.sub(this.vel)
    force.limit(this.unitClass.maxForce)
    return force
  }

  show(size) {
    push();
    rotate(this.vel.heading());
    stroke('white');
    strokeWeight(1);
    // Fill with transparency based on health.
    fill(lerpColor(color(0), this.color, this.health.getFraction() * .5 + .5));

    this.unitClass.render(size * this.unitClass.r);
    pop();
  }
}

class Archer extends UnitClass {
  constructor() {
    super("Archer");
    this.time = 24;
    this.cost = 90;
    this.attackRange = 40;
  }

  render(size) {
    arc(0, 0, size * 2, size * 2, HALF_PI, PI + HALF_PI);
  }
}

class Horse extends UnitClass {
  constructor() {
    super("Cavalry");
    this.time = 2;
    this.cost = 110;
    this.maxSpeed = 3.4;
  }

  render(size) {
    triangle(-size * 2, -size, -size * 2, size, size * 2, 0);
  }
}

class Builder extends UnitClass {
  constructor() {
    super("Builder");
    this.cost = 50;
    this.time = 24;
  }

  buildWall(lastBuildTarget) {
    // Join to previous wall if one exists?
    let wall = new Wall(this.pos.copy(), this.team);
    if (lastBuildTarget) {
      // Build a wall between this and the last
      console.log("Build wall from", lastBuildTarget, this.pos);
      wall.addFrom(lastBuildTarget.building);
    }
    return new ConstructionSite(wall);
  }
}
