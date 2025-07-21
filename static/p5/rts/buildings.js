class BuildingClass {
  constructor(name) {
    this.name = name;
    this.r = 20;
    this.maxHealth = 4000;
    this.buildUnits = [];
    this.buildSteps = 100;
  }
  setBuildableUnits(units) {
    this.buildUnits = units;
  }

  createBuilding(pos, team) {
    return new Building(pos, team, this);
  }

  render(r) {
    rect(-r, -r, r * 2, r * 2);
  }

  renderPlacement(size) {
    let r = size * this.r;
    rect(-r, -r, r * 2, r * 2);
  }
}

class Building {
  constructor(pos, team, buildingClass) {
    this.team = team;
    this.buildingClass = buildingClass;
    this.game = team.getGame();
    this.map = team.getMap();
    this.pos = pos;
    this.health = new HealthBar(buildingClass.maxHealth, buildingClass.r);
    this.targetRally = null;
    this.buildQueue = [];
    this.action = null
  }

  update() {
    if (this.action) {
      if (this.action.isComplete(this)) {
        this.game.view.overlayMenu.addMessage("Building completed action");
        this.action = null;
      } else {
        this.action.update(this);
      }
    }
    // TODO buildUnit should be an action?
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
        this.map.addUnit(this.buildUnit);
        this.buildUnit = null;
      }
    } else if (this.buildQueue.length > 0) {
      let next = this.buildQueue.shift();
      this.buildUnit = next.unit;
      this.buildTime = next.time;
      this.buildMax = next.time;
    }
  }

  setAction(action) {
    this.action = action;
  }

  getSize() {
    return this.buildingClass.r
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
    // Scale
    let r = size * this.buildingClass.r;
    noStroke();
    fill(this.team.color);

    this.buildingClass.render(r);

    // TODO render this as a building action.
    if (this.buildUnit) {
      stroke('white')
      noFill();
      rect(-r, -r, r * 2, r / 8);
      noStroke();
      fill('white')
      let buildComplete = this.buildTime * r * 2 / this.buildMax;
      rect(-r, -r, buildComplete, r / 8);
    }
    let tenth = r * 2 / 10;
    stroke(this.team.color);
    for (let i = 0; i < this.buildQueue.length; i++) {
      rect(-r + i * tenth, -r * 6 / 8, tenth, tenth);
    }
  }
}

class ConstructionSite extends Building {
  constructor(building) {
    super(building.pos, building.team, building.buildingClass);
    this.building = building;
    this.team = building.team;
    this.pos = building.pos;
    this.buildProgress = 0;
    this.buildMax = building.buildingClass.buildSteps;
    // start with 10% health;
    this.building.health.damage(this.building.health.getMax() * .9);
    // Increase health a small amount with each build step.
    this.healthInc = this.building.health.getMax() * .9 / this.buildMax;
  }

  show(size) {
    // Scale this thing based on r?
    size = size * this.building.buildingClass.r;
    noFill();
    stroke(this.team.color);
    rect(-size, -size, size * 2, size * 2);
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
      this.building.map.addUnit(this.building);
    }
  }

  isBuilt() {
    return this.buildProgress >= this.buildMax;
  }
}

class Tower extends BuildingClass {
  constructor() {
    super("Tower");
    this.cost = 100;
    this.buildSteps = 100;
  }

  render(size) {
    circle(0, 0, size * 2);
  }
}

class Base extends BuildingClass {
  constructor() {
    super("Base");
    this.r = 40;
    this.maxHealth = 10000;
    this.cost = 400;
    this.buildSteps = 800;
  }
}

class House extends BuildingClass {
  constructor() {
    super("House");
    this.r = 10;
    this.cost = 100;
    this.buildSteps = 100;
  }
}

class Barracks extends BuildingClass {
  constructor() {
    super("Barracks");
    this.r = 30;
    this.cost = 150;
    this.buildSteps = 300;
  }
}

class Wall extends BuildingClass {
  constructor() {
    super("Wall");
    this.r = 10;
    this.cost = 10;
    this.buildSteps = 100;
  }

  addFrom(previousWall) {
    this.lastWall = previousWall;
  }

  render(size) {

    circle(0, 0, size * 2);

    // TODO connected walls should be rendered differently?
    // stroke(this.team.color);
    // if (this.lastWall) {
    //   // Show the line to the last wall.
    //   strokeWeight(4);
    //   let a = p5.Vector.sub(this.lastWall.pos, this.pos);
    //   console.log(a, this.pos);
    //   line(a.x, a.y, 0, 0);
    // }
  }
}
