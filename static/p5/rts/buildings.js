class Building {
  constructor(pos, team) {
    this.team = team;
    this.game = team.getGame();
    this.pos = pos;
    this.r = 20;
    this.health = new HealthBar(4000);
    this.targetRally = null;
    this.buildQueue = [];
    this.buildActions = [];
  }

  update() {
    if (this.buildUnit) {
      this.buildTime--;
      if (this.buildTime <= 0) {
        if (this.targetRally instanceof Tree) {
          this.buildUnit.setAction(new GatherCommand(this.targetRally, this.team.headQuarters));
        } else if (this.targetRally) {
          if (this.targetRally.team && this.targetRally.team !== this.team) {
            this.buildUnit.setAction(new AttackCommand(this.targetRally));
          } else {
            this.buildUnit.setAction(new MoveCommand(this.targetRally.pos));
          }
        }
        // unit complete.
        this.game.addUnit(this.buildUnit);
        this.buildUnit = null;
      }
    } else if (this.buildQueue.length > 0) {
      let next = this.buildQueue.shift();
      this.buildUnit = next.unit;
      this.buildTime = next.time;
      this.buildMax = next.time;
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
    // Scale this thing based on r?
    size = size * this.r / 40;
    noStroke();
    fill(this.team.color);

    rect(-size, -size, size * 2, size * 2);

    if (this.buildUnit) {
      stroke('white')
      noFill();
      rect(-size, -size, size * 2, size / 8);
      noStroke();
      fill('white')
      let buildComplete = this.buildTime * size * 2 / this.buildMax;
      rect(-size, -size, buildComplete, size / 8);
    }
    let tenth = size * 2 / 10;
    stroke(this.team.color);
    for (let i = 0; i < this.buildQueue.length; i++) {
      rect(-size + i * tenth, -size * 6 / 8, tenth, tenth);
    }
  }
}

class ConstructionSite extends Building {
  constructor(building, buildSteps) {
    super(building.pos, building.team);
    this.building = building;
    this.team = building.team;
    this.pos = building.pos;
    this.r = building.r;
    this.buildProgress = 0;
    this.buildMax = buildSteps;
    // start with 10% health;
    this.building.health.damage(this.building.health.getMax() * .9);
    // Increase health a small amount with each build step.
    this.healthInc = this.building.health.getMax() * .9 / this.buildMax;
  }

  show(size) {
    // Scale this thing based on r?
    size = size * this.building.r / 20;
    noFill();
    stroke(this.team.color);
    rect(-size / 2, -size / 2, size, size);
  }

  update() {
    // Nothing happens automatically for a building site.
  }

  getHealth() {
    return this.building.health;
  }

  damage(attack) {
    this.building.health.damage(attack);
  }

  finished() {
    return this.isBuilt() || !this.building.health.isAlive();
  }

  build() {
    if (this.isBuilt()) {
      return;
    }
    this.buildProgress++;
    this.building.getHealth().heal(this.healthInc);
    if (this.isBuilt()) {
      // Add the building to the game now.
      this.building.game.addUnit(this.building);
    }
  }

  isBuilt() {
    return this.buildProgress >= this.buildMax;
  }
}

class Tower extends Building {
  constructor(pos, team) {
    super(pos, team);
  }

  update() {
    // Find targets, shoot them
  }

  show(size) {
    fill(this.team.color);

    circle(0, 0, size * 0.8);
  }
}

class Base extends Building {
  constructor(pos, team) {
    super(pos, team);
    this.r = 40;
    this.health = new HealthBar(10000);
    this.buildActions.push({
      'name': 'Build Builder',
      'cost': 50,
      'action': this.buildBuilder
    });
  }

  buildBuilder() {
    if (this.buildQueue.length < 10) {
      // TODO should consider the r of the unit?
      // 1.4 is ~ sqrt(2) for corners.
      let pos = p5.Vector.random2D().mult(this.r * 1.4 + 10).add(this.pos);
      let unit = new Builder(pos, this.team);
      this.buildQueue.push({
        time: 17 * 30,
        unit: unit,
      });
      this.game.view.overlayMenu.addMessage("building builder");
      return unit;
    }
    this.game.view.overlayMenu.addMessage("Build queue full!");
    return null;
  }
}

class House extends Building {
  constructor(pos, team) {
    super(pos, team);
    this.r = 10;
  }
}

class Barracks extends Building {
  constructor(pos, team) {
    super(pos, team);
    this.r = 30;
    this.buildActions.push({
      'name': 'Build Melee',
      'cost': 75,
      'action': this.buildMelee
    });
    this.buildActions.push({
      'name': 'Build Archer',
      'cost': 90,
      'action': this.buildArcher
    });
    this.buildActions.push({
      'name': 'Build Horse',
      'cost': 110,
      'action': this.buildHorse
    });
  }

  buildMelee() {
    let unit = new Unit(this.pos.copy(), this.team);
    return this.build(24, unit);
  }

  buildArcher() {
    let unit = new Archer(this.pos.copy(), this.team);
    return this.build(24, unit);
  }

  buildHorse() {
    let unit = new Horse(this.pos.copy(), this.team);
    return this.build(2, unit);
  }

  build(seconds, unit) {
    if (this.buildQueue.length < 10) {
      // TODO should consider the r of the unit?
      // 1.4 is ~ sqrt(2) for corners.
      let pos = p5.Vector.random2D().mult(this.r * 1.4 + 10).add(this.pos);
      unit.pos.set(pos);
      this.buildQueue.push({
        time: seconds * 30,
        unit: unit,
      });
      this.game.view.overlayMenu.addMessage("Building " + unit.constructor.name);
      return unit;
    }
    this.game.view.overlayMenu.addMessage("Build queue full!");
    return null;
  }
}

class Wall extends Building {
  constructor(pos, team) {
    super(pos, team);
    this.r = 10;
  }

  addFrom(previousWall) {
    this.lastWall = previousWall;
  }

  show(size) {
    // Scale this thing based on r?
    size = size * this.r / 20;
    noStroke();
    fill(this.team.color);
    circle(0, 0, size, size);

    stroke(this.team.color);
    if (this.lastWall) {
      // Show the line to the last wall.
      strokeWeight(4);
      let a = p5.Vector.sub(this.lastWall.pos, this.pos);
      console.log(a, this.pos);
      line(a.x, a.y, 0, 0);
    }
  }
}
