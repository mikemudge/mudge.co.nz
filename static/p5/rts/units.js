
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

  show(size) {
    let uSize = this.scale * size;
    fill("#0F0")
    noStroke();
    rect(-uSize - size / 2, -uSize - size / 2 - 2, (uSize * 2 + size) * this.health/this.maxHealth, size / 2);
    stroke("#FFF");
    noFill();
    rect(-uSize - size / 2, -uSize - size / 2 - 2, (uSize * 2 + size), size / 2);
  }
}

class Unit {
  constructor(pos, team) {
    this.r = 8;
    this.team = team;
    this.game = team.getGame();
    this.pos = pos;
    this.vel = createVector(0, 0);
    this.acc = createVector(0, 0);
    this.maxSpeed = 1.5;
    this.maxForce = 0.25;
    this.color = team.color;
    this.attackPower = 1;
    this.health = new HealthBar(100);
    this.attackRange = 20;
    this.sightRange = 200;
    this.buildActions = [];
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

    // TODO find and attack units?
    // if (!this.target) {
    //   // Find a target?
    //   var options = this.game.getNearby(this.pos, 100);
    //   let team = this.team;
    //   let opponents = options.filter(function(unit) {
    //     return unit.team !== team;
    //   });
    //   if (opponents) {
    //     this.target = random(opponents);
    //   }
    // }

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

  stop() {
    this.vel.setMag(0);
    // Make sure the velocity isn't about to change either.
    this.acc.set(0, 0);
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

class Archer extends Unit {
  constructor(pos, team) {
    super(pos, team);
    this.attackRange = 40;
  }

  show(size) {
    push();
    rotate(this.vel.heading());
    stroke('white');
    strokeWeight(1);
    fill(this.color);
    arc(0, 0, size * this.r / 10, size * this.r / 10, HALF_PI, PI + HALF_PI);
    pop();
  }
}

class Horse extends Unit {
  constructor(pos, team) {
    super(pos, team);
    this.maxSpeed = 3.4;
  }

  show(size) {
    size = size * this.r / 10;
    push();
    rotate(this.vel.heading());
    stroke('white');
    strokeWeight(1);
    fill(this.color);
    triangle(-size, -size / 2, -size, size / 2, size, 0);
    pop();
  }
}

class Builder extends Unit {
  constructor(pos, team) {
    super(pos, team);
    this.buildActions.push({
      'name': 'Build Base',
      'cost': 400,
      'action': this.buildBase
    }, {
      'name': 'Build House',
      'cost': 100,
      'action': this.buildHouse
    }, {
      'name': 'Build Barracks',
      'cost': 150,
      'action': this.buildBarracks
    }, {
      'name': 'Build Wall',
      'cost': 10,
      'action': this.buildWall,
      'repeat': true
    }, {
      'name': 'Build Tower',
      'cost': 100,
      'action': this.buildTower
    });
  }

  buildBarracks() {
    return new ConstructionSite(new Barracks(this.pos.copy(), this.team), 300);
  }

  buildBase() {
    return new ConstructionSite(new Base(this.pos.copy(), this.team), 800);
  }

  buildHouse() {
    return new ConstructionSite(new House(this.pos.copy(), this.team), 100);
  }

  buildTower() {
    return new ConstructionSite(new Tower(this.pos.copy(), this.team), 100);
  }

  buildWall(lastBuildTarget) {
    // Join to previous wall if one exists?
    let wall = new Wall(this.pos.copy(), this.team);
    if (lastBuildTarget) {
      // Build a wall between this and the last
      console.log("Build wall from", lastBuildTarget, this.pos);
      wall.addFrom(lastBuildTarget.building);
    }
    return new ConstructionSite(wall, 100);
  }

  update() {
    // Check your current action?

    if (this.buildTarget) {
      if (this.buildTarget.pos.dist(this.pos) < this.r) {
        this.buildProgress++;
        if (this.buildProgress >= this.buildMax) {
          // Finish building.
          this.buildTarget = null;
          // TODO move to next action in queue?
        }
      } else {
        // Need to walk over to it first.
        this.target = this.buildTarget;
      }
    }
    super.update();
  }
}
