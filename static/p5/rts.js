
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
    size = size * this.r / 20;
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
      this.building.game.addUnit(this.building);
    }
  }

  isBuilt() {
    return this.buildProgress >= this.buildMax;
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

class Team {
  constructor(game, color) {
    this.game = game;
    this.color = color;
    this.headQuarters = null;
    // TODO starting with high resources for testing.
    this.resourceCount = 2000;
  }

  getGame() {
    return this.game;
  }

  setHq(hq) {
    this.headQuarters = hq;
  }
}

class BuildCommand {
  constructor(building) {
    this.building = building;
  }

  update(unit) {
    let range = this.building.r * 1.4;
    if (unit.pos.dist(this.building.pos) < range) {
      this.building.build();
      unit.stop();
    } else {
      // Make the unit move to the pos.
      unit.applyForce(unit.seek(this.building.pos));
    }
  }

  getPos() {
    return this.building.pos;
  }

  isComplete(unit) {
    return this.building.isBuilt();
  }
}

class GatherCommand {
  constructor(resource) {
    this.resource = resource;
    this.phase = 0;
    this.time = 0;
    // TODO these could update after each iteration?
    // Handle new buildings, closer/more available resources etc?
    this.gotoResource = new MoveCommand(resource.pos);
    this.dropOff = null;
  }

  getPos() {
    if (this.phase < 2) {
      return this.gotoResource.getPos();
    }
    return this.dropOff.pos;
  }

  update(unit) {
    if (this.phase === 0) {
      // TODO resource radius (currently hard coded as 10)?
      if (unit.pos.dist(this.resource.pos) < 10 + unit.r) {
        unit.stop();
        // unit.game.view.overlayMenu.addMessage("Unit gathering resource at " + Util.vectorString(unit.pos));
        this.phase = 1;
      } else {
        this.gotoResource.update(unit);
      }
    } else if (this.phase === 1) {
      // timed wait "gathering"
      this.time++;
      if (this.time >= 200) {
        // unit.game.view.overlayMenu.addMessage("Unit collected resource at " + Util.vectorString(unit.pos));
        this.phase = 2;
        this.dropOff = this.calculateDropOff(unit);
      }
    } else if (this.phase === 2) {
      // Make the unit move to the pos.
      unit.applyForce(unit.seek(this.dropOff.pos));
      if (unit.pos.dist(this.dropOff.pos) < this.dropOff.r + unit.r + 10) {
        // TODO which resource type?
        unit.team.resourceCount += 5;
        this.time = 0;
        this.phase = 0;
      }
    }
  }

  calculateDropOff(unit) {
    // TODO should find the closest building which can be dropped off at?
    return unit.team.headQuarters;
  }

  isComplete(unit) {
    // Gathering is never done?
    return false
  }
}

class AttackCommand {
  constructor(target) {
    this.target = target;
  }

  update(unit) {
    let range = unit.attackRange;
    if (this.target.r) {
      // If the target has a radius we only need to get in range of that to attack it.
      range += this.target.r;
    }
    if (this.target.pos.dist(unit.pos) < range) {
      unit.stop();
      this.target.damage(unit.attackPower);
      return;
    }
    // Make the unit move to the pos.
    unit.applyForce(unit.seek(this.target.pos));
  }

  getPos() {
    return this.target.pos;
  }

  isComplete(unit) {
    return !this.target.getHealth().isAlive();
  }
}

class AttackMoveCommand {
  constructor(destination) {
    // destination is a position to move to, target is a unit to attack on the way.
    this.destination = destination;
    this.target = null;
  }

  update(unit) {
    if (this.target) {
      if (this.target.finished()) {
        // TODO attempt to find another target?
        this.target = null;
      }
    }
    // TODO can we make target acquisition less frequent?
    if (!this.target) {
      // Assume a sight of 200 for all?
      let nearby = unit.game.getNearby(unit.pos, unit.sightRange);
      nearby = nearby.filter(function(target) {
        return target.team !== unit.team
      });
      if (nearby.length > 0) {
        this.target = random(nearby);
      }
    }
    if (this.target) {
      let dis = this.target.pos.dist(unit.pos);
      if (dis < this.target.r + unit.attackRange) {
        this.target.damage(unit.attackPower);
        unit.stop();
      } else if (dis > unit.sightRange) {
        // Give up, lost sight of it.
        this.target = null;
      } else {
        // Chase the unit.
        unit.applyForce(unit.seek(this.target.pos));
      }
    } else {
      // Make the unit move towards the destination.
      unit.applyForce(unit.seek(this.destination));
    }
  }

  getPos() {
    if (this.target) {
      return this.target.pos;
    }
    return this.destination;
  }

  isComplete(unit) {
    return this.destination.dist(unit.pos) < unit.maxSpeed;
  }
}

class MoveCommand {
  constructor(pos) {
    this.pos = pos;
  }

  update(unit) {
    // Make the unit move to the pos.
    unit.applyForce(unit.seek(this.pos));
  }

  getPos() {
    return this.pos;
  }

  isComplete(unit) {
    let range = 1;
    if (unit.maxSpeed) {
      range = unit.maxSpeed / 2;
    }
    return unit.pos.dist(this.pos) < range;
  }
}

class Circle {
  constructor(color, size) {
    this.color = color;
    this.size = size;
  }

  show(size) {
    noFill();
    stroke(this.color);
    circle(0, 0, size * this.size / 20);
  }
}

class Rect {
  constructor(color, size) {
    this.color = color;
    this.size = size;
  }

  show(size) {
    size = size * this.size / 20;
    fill(this.color);
    rect(-size, -size, size * 2, size * 2);
  }
}

// TODO show selected units in bottom menu?
// refactor click method of controls better.
// Add attack move, and hold position/attack on engage.
// add hotkeys for shortcuts.


class MouseControls {
  constructor(game, team) {
    this.game = game;
    this.team = team;
    this.view = game.view;
    this.mousePos = createVector(0, 0);
    this.startMouse = createVector(0, 0);
    this.endMouse = createVector(0, 0);
    this.selectedUnits = [];

    this.view.topMenu = new DisplayMenu(this.showResources.bind(this));
    // TODO support more advanced layouts?
    this.buildButtons = new ButtonMenu();
    this.view.addBottomMenu(new DisplayMenu(this.showSelectedUnit.bind(this)));
    this.view.addBottomMenu(new DisplayMenu(this.showSelectedUnits.bind(this)));
    this.view.addBottomMenu(this.buildButtons);
  }

  mouseMove() {
    this.mousePos.set(this.view.toGameX(mouseX), this.view.toGameY(mouseY));
  }

  mouseDrag() {
    if (mouseButton === LEFT) {
      this.mousePos.set(this.view.toGameX(mouseX), this.view.toGameY(mouseY));
      this.endMouse.set(mouseX, mouseY);
    }
  }

  mouseDown() {
    if (mouseButton === LEFT) {
      this.mousePressed = true;
      this.startMouse.set(mouseX, mouseY);
      this.endMouse.set(mouseX, mouseY);
    }
  }

  handlePlacement() {
    // TODO Make sure we don't collide with anything?
    let shift = keyIsDown(16);
    if (this.placement.cost > this.team.resourceCount) {
      this.view.overlayMenu.addMessage("Need more money!");
      return;
    }

    let buildTarget = this.placement.building;
    buildTarget.pos.set(this.mousePos);
    this.game.addUnit(buildTarget);
    // Once placed we set an action to make the worker build it.
    if (shift) {
      this.selectedUnit.addAction(new BuildCommand(buildTarget));
    } else {
      this.selectedUnit.setAction(new BuildCommand(buildTarget));
    }
    this.game.view.overlayMenu.addMessage("Building " + buildTarget.constructor.name);

    // Pay for it.
    this.team.resourceCount -= this.placement.cost;

    // Reset placement unless shift is pressed.
    if (shift) {
      // build another one.
      this.placement = {
        building: this.placement.action.call(this.selectedUnit),
        action: this.placement.action,
        cost: this.placement.cost
      };
    } else {
      this.placement = null;
    }
  }

  handleAreaSelect() {
    let v1 = this.view.toGame(this.startMouse);
    let v2 = this.view.toGame(this.endMouse);
    // Looks like a selection area is being made.

    // TODO support for shift adding to selection?
    let newSelection = this.game.getInArea(Math.min(v1.x, v2.x),
      Math.min(v1.y, v2.y),
      Math.abs(v1.x - v2.x),
      Math.abs(v1.y - v2.y));

    // TODO findone?
    let skipBuildings = false;
    for (let unit of newSelection) {
      if (!(unit instanceof Building)) {
        skipBuildings = true;
      }
    }

    if (skipBuildings) {
      // filter out all buildings if there are other things to select.
      newSelection = newSelection.filter(function (unit) {
        return !(unit instanceof Building);
      });
    }

    // TODO this filter result isn't used yet?
    newSelection.filter(function (unit) {
      return unit.team !== this.team;
    }, this)

    this.updateSelection(newSelection);
  }

  handlePointSelect(pos, nearby) {
    let clickedUnit = this.selectBest(pos, nearby);
    let shift = keyIsDown(16);
    if (shift) {
      // check if it's already selected.
      let index = this.selectedUnits.indexOf(clickedUnit);
      if (index === -1) {
        // Add the new selection.
        this.selectedUnits.push(clickedUnit);
      } else {
        // Remove from existing selection.
        this.selectedUnits.splice(index, 1);
      }
    } else {
      // Set the selected units to just this one.
      this.selectedUnits = [clickedUnit];
    }
    this.updateSelection(this.selectedUnits);
  }

  updateSelection(units) {
    this.selectedUnits = units;
    this.buildButtons.reset();
    if (this.selectedUnits.length > 0) {
      this.selectedUnit = this.selectedUnits[0];
      this.updateBuildButtons();
    } else {
      // deselect.
      this.selectedUnit = null;
    }
  }

  selectBest(pos, units) {
    // TODO select the best unit based on the click location.
    return units[0];
  }

  click() {
    this.mousePressed = false;
    let clickPos = this.view.toGame(createVector(mouseX, mouseY));
    this.lastClick = clickPos;

    let leftClick = (mouseButton === LEFT);
    if (leftClick) {
      if (this.placement) {
        this.handlePlacement();
        return;
      }
      // Left click implies selection of units.
      if (this.startMouse.dist(this.endMouse) > 5) {
        this.handleAreaSelect();
        return;
      }
      let nearby = this.game.getNearby(clickPos, 20);
      if (nearby.length > 0) {
        // There was units nearby, select them.
        this.handlePointSelect(clickPos, nearby);
        return;
      }
      // TODO check if selecting a feature?

      let shift = keyIsDown(16);
      if (shift) {
        // No deselect happens if shift is pressed and left click happens.
        // Essentially trying to add a unit to selected, but missed?
      } else {
        // deselect all.
        this.selectedUnit = null;
        this.selectedUnits = [];
      }
    } else {
      if (this.placement) {
        // Cancel placement for non left clicks.
        this.placement = null;
        return;
      }

      // right click implies commanding units.
      if (!this.selectedUnits) {
        // No selectedUnits to give a command to.
        return;
      }
      // Give an action to existing selection.

      this.handleAssignCommand(this.selectedUnits, clickPos);
    }
  }

  handleAssignCommand(units, clickPos) {
    // Check for nearby targets to attack
    let nearby = this.game.getNearby(clickPos, 20);
    if (nearby.length > 0) {
      // TODO select best should prefer other team?
      // Or support following same team unit?
      let clickedUnit = this.selectBest(clickPos, nearby);
      if (this.selectedUnit.team !== clickedUnit.team) {
        // An enemy was clicked.
        this.commandAll(this.selectedUnits, AttackCommand, clickedUnit);
        return;
      }
    }

    // Check for resources to gather.
    // TODO how to tell which units can do which actions?
    // E.g buildings can't move, soldiers can't gather, workers can't fight?
    let features = this.game.getNearbyFeatures(clickPos, 20);
    if (features.length > 0) {
      this.commandAll(this.selectedUnits, GatherCommand, features[0]);
      return;
    }

    let a = 65;
    if (keyIsDown(a)) {
      // attack move instead of just move.
      this.moveCommandAll(this.selectedUnits, AttackMoveCommand, clickPos);
      return
    }
    // Nothing more specific to do, just move units to the location.
    this.moveCommandAll(this.selectedUnits, MoveCommand, clickPos);
  }
  moveCommandAll(units, command, pos) {
    let moving = 0;
    let rallying = 0;
    let shift = keyIsDown(16);
    for (let selected of this.selectedUnits) {
      if (selected instanceof Building) {
        // TODO rally as an action?
        selected.targetRally = {
          command: command,
          pos: pos
        };
        rallying++;
      } else {
        if (shift) {
          moving++;
          selected.addAction(new command(pos));
        } else {
          moving++;
          selected.setAction(new command(pos));
        }
      }
    }
    if (moving > 0) {
      this.view.overlayMenu.addMessage("Moving " + moving + " unit(s) to " + Util.vectorString(pos));
    } else {
      this.view.overlayMenu.addMessage("Rally " + rallying + " building(s) to " + Util.vectorString(pos));
    }
  }

  commandAll(units, command, target) {
    let moving = 0;
    let rallying = 0;
    let shift = keyIsDown(16);
    for (let selected of units) {
      if (selected instanceof Building) {
        selected.targetRally = target;
        rallying++;
      } else {
        if (shift) {
          moving++;
          selected.addAction(new command(target));
        } else {
          moving++;
          selected.setAction(new command(target));
        }
      }
    }
    if (moving > 0) {
      this.view.overlayMenu.addMessage(command.name + " " + moving + " unit(s) to " + Util.vectorString(target.pos))
    } else {
      this.view.overlayMenu.addMessage("Rally " + rallying + " building(s) to " + command.name + " " + Util.vectorString(target.pos))
    }
  }

  updateBuildButtons() {
    // Update the view menus for this unit?
    if (this.selectedUnit.buildActions) {
      for (let buildAction of this.selectedUnit.buildActions) {
        // TODO cost of each button should affect active/inactive state?
        if (this.selectedUnit instanceof Building) {
          // Building a unit doesn't require placement
          let closure = function () {
            if (this.team.resourceCount >= buildAction.cost) {
              let buildTarget = buildAction.action.call(this.selectedUnit);
              if (buildTarget) {
                this.team.resourceCount -= buildAction.cost;
              }
            } else {
              this.view.overlayMenu.addMessage("Need more money!");
            }
          }.bind(this);
          this.buildButtons.addButton(buildAction.name, closure);
        } else {
          // Building a building requires placement
          let closure = function () {
            if (this.team.resourceCount >= buildAction.cost) {
              this.placement = {
                building: buildAction.action.call(this.selectedUnit),
                action: buildAction.action,
                cost: buildAction.cost,
              };
            } else {
              this.view.overlayMenu.addMessage("Need more money!");
            }
          }.bind(this);
          this.buildButtons.addButton(buildAction.name, closure);
        }
      }
    }
  }

  showSelectedUnit() {
    // TODO show something in the left bottom corner for the current unit?
  }

  showSelectedUnits() {
    let size = 30;
    let w = 8;
    let limit = 24; // w * 3 rows;
    let start = 0;
    // TODO support pagination?
    for (let i=start;i<Math.min(start + limit, this.selectedUnits.length);i++) {
      let x = i % w * size;
      let y = Math.floor(i / w) * size;
      stroke('white');
      noFill();
      rect(x, y, size, size);
      noStroke();
      fill('white');
      textSize(10);
      text(this.selectedUnits[i].constructor.name, x, y, size, size);
    }
  }

  showResources() {
    fill('white');
    textSize(16);
    textAlign(LEFT);
    let resources = "Money: " + this.team.resourceCount;
    text(resources, 5, 15);

    if (this.selectedUnits.length > 0) {
      let units = "Selected: " + this.selectedUnits.length;
      let set = {};
      for (let unit of this.selectedUnits) {
        set[unit.constructor.name] = 1;
      }
      units += " " + Object.keys(set);
      if (this.selectedUnit.action) {
        units += " " + this.selectedUnit.action.constructor.name;
      }
      text(units, 205, 15);
    }
  }

  show() {
    if (this.mousePressed && this.startMouse.dist(this.endMouse) > 5) {
      noFill()
      stroke('yellow');
      // Looks like a selection area is being made.
      rect(Math.min(this.startMouse.x, this.endMouse.x),
        Math.min(this.startMouse.y, this.endMouse.y),
        Math.abs(this.startMouse.x - this.endMouse.x),
        Math.abs(this.startMouse.y - this.endMouse.y))
    }
    if (this.placement) {
      let color = 'red';
      if (this.placement.cost <= this.team.resourceCount) {
        color = 'green';
      }
      this.view.showAtPos(new Rect(color, this.placement.building.r || 20), this.mousePos);
    }
    if (this.lastClick) {
      this.view.showAtPos(new Circle('green', 3), this.lastClick);
    }
    for (let selected of this.selectedUnits) {
      // Show something about the selected unit?
      this.view.showAtPos(new Circle('green', selected.r * 2.8 + 2), selected.pos);

      stroke('blue');
      noFill();
      if (selected.actions) {
        let lastX = this.view.toScreenX(selected.pos.x);
        let lastY = this.view.toScreenY(selected.pos.y);
        if (selected.action) {
          let pos = selected.action.getPos();
          let x = this.view.toScreenX(pos.x);
          let y = this.view.toScreenY(pos.y);
          line(lastX, lastY, x, y);
          circle(x, y, 3);
          lastX = x;
          lastY = y;
        }
        for (let action of selected.actions) {
          let pos = action.getPos();
          let x = this.view.toScreenX(pos.x);
          let y = this.view.toScreenY(pos.y);
          line(lastX, lastY, x, y);
          circle(x, y, 3);
          lastX = x;
          lastY = y;
        }
      }

      // Show a building's rally point.
      // TODO should rally be an action?
      if (selected.targetRally) {
        let lastX = this.view.toScreenX(selected.pos.x);
        let lastY = this.view.toScreenY(selected.pos.y);
        let x = this.view.toScreenX(selected.targetRally.pos.x);
        let y = this.view.toScreenY(selected.targetRally.pos.y);
        line(lastX, lastY, x, y);
        circle(x, y, 2);
      }
    }
  }
}

class Tree {
  constructor(pos) {
    // lawn green is #7CFC00
    // green is #008000
    this.pos = pos;
    let rnd = random();
    this.color = color(rnd * 0x7c, 0x80 + rnd * (0xfc - 0x80), 0);
  }

  show(size) {
    stroke("black");
    fill("brown");
    rect(size * -.1, 0, size * .2 , size * .5);
    fill("ForestGreen");
    circle(0,  size * -.25, size * .75);
  }
}

// TODO add resources and gathering.

class Game {
  constructor(view) {
    this.view = view;
    this.width = 1000;
    this.height = 1000;
    this.units = [];
    this.features = [];
    this.projectiles = [];
    this.init();
  }

  init() {
    this.units = [];
    let team = new Team(this, color('#D33430'));
    let hq = new Base(createVector(50, 50), team);
    team.setHq(hq);
    this.units.push(hq);

    team = new Team(this, color('#5C16C8'))
    let teamSpawn = createVector(this.width - 50, this.height - 50);
    let homeBase = new Base(teamSpawn, team);
    team.setHq(homeBase);

    this.units.push(homeBase);
    let pos = p5.Vector.random2D().mult(homeBase.r * 1.4 + 10).add(homeBase.pos);
    this.units.push(new Builder(pos, team));
    this.units.push(new Barracks(createVector(-100, 0).add(teamSpawn), team));

    this.view.setCenter(teamSpawn);
    // Add human controls for one team
    this.controls = new MouseControls(this, team);

    pos = p5.Vector.random2D().mult(300).add(teamSpawn);
    this.features.push(new Tree(pos));
    pos = p5.Vector.random2D().mult(20).add(pos);
    this.features.push(new Tree(pos));
    pos = p5.Vector.random2D().mult(20).add(pos);
    this.features.push(new Tree(pos));

    this.view.overlayMenu.addMessage("RTS Game init finished");
  }

  getNearby(pos, range) {
    var result = this.units.filter(function(unit) {
      let eRange = range;
      if (unit.r) {
        eRange = unit.r + range;
      }
      return unit.pos.dist(pos) < eRange;
    });
    return result;
  }

  getNearbyFeatures(pos, range) {
    var result = this.features.filter(function(feature) {
      return feature.pos.dist(pos) < range;
    });
    return result;
  }

  getInArea(x, y, w, h) {
    var result = this.units.filter(function(unit) {
      return unit.pos.x > x && unit.pos.x < x + w && unit.pos.y > y && unit.pos.y < y + h;
    });
    return result;
  }

  addUnit(unit) {
    this.units.push(unit);
  }

  addProjectile(arrow) {
    this.projectiles.push(arrow);
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

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      this.projectiles[i].update();
      if (this.projectiles[i].finished()) {
        this.projectiles.splice(i, 1);
      }
    }

    for (let feature of this.features) {
      this.view.show(feature);
    }

    // Render the game.
    for (let unit of this.units) {
      this.view.show(unit);
    }

    for (let projectile of this.projectiles) {
      this.view.show(projectile);
    }

    // Render the game.
    for (let unit of this.units) {
      let health = unit.getHealth();
      health.setScale(unit.r / 20);
      if (health.isDamaged()) {
        this.view.showAtPos(health, unit.pos);
      }
    }

    this.controls.show();

    this.view.coverEdges();
  }
}

function setup() {
  view = new MapView(40);
  // 18px is the top div showing nav items.
  view.setScreen(windowWidth, windowHeight - 18);
  w = view.getCanvasWidth();
  h = view.getCanvasHeight();
  c = createCanvas(w, h);
  // Disable right click on the canvas so we can use it for the game.
  c.canvas.oncontextmenu = function() {
    return false;
  }

  console.log("setting canvas size", w, h);

  game = new Game(view);
  window.onblur = function() {
    game.paused = true;
    noLoop();
  }
  window.onfocus = function() {
    game.paused = false;
    loop();
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight - 18);

  view.setScreen(windowWidth, windowHeight - 18);
}

function keyPressed() {
  if (game.paused) {
    game.paused = false;
    loop();
  }
  view.keys();
}

function keyReleased() {
  view.keys();
}

function mouseDragged(event) {
  if (game.paused) {
    return;
  }
  game.controls.mouseDrag();
}

function mouseMoved() {
  if (game.paused) {
    return;
  }
  game.controls.mouseMove();
}

function mousePressed(event) {
  if (game.paused) {
    return;
  }
  game.controls.mouseDown();
  return false;
}

function mouseReleased() {
  if (game.paused) {
    game.paused = false;
    loop();
    return;
  }
  if (view.click()) {
    return;
  }
  game.controls.click();
}

function mouseWheel(event) {
  if (game.paused) {
    return;
  }
  view.scale(event.delta);
}

function draw() {
  background(0);

  game.show();
}
